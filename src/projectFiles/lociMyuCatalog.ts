import { analyzeImportPlanSources, sniffImageExt, type ImportPlan, type SpreadsheetSource } from '../assets/importWizard';
import type { VerifiedZipCatalog, VerifiedZipEntry } from '../assets/zipio';
import { detectFormat } from '../viewer/loaders';
import { looksLikeXlsx, readXlsx } from '../io/xlsx';
import { parseCsv } from '../io/csv';
import { countLociMyuCaptionSourceRows, isLociMyuCaptionSheet, lociMyuTrimV1 as trim } from '../io/locimyu';
import type { FileValidationLimits } from './validation';

export interface LociMyuCatalogFile { path: string; name: string; entry: VerifiedZipEntry; imageExt: string | null }
export type LociMyuCatalogSource = Omit<SpreadsheetSource, 'sourceBytes'> & { proof: { byteLength: number; digest: string } };
export type LociMyuCatalogPlan = Omit<ImportPlan, 'models' | 'images' | 'videos' | 'sources'> & {
  models: LociMyuCatalogFile[]; images: LociMyuCatalogFile[]; videos: LociMyuCatalogFile[]; sources: LociMyuCatalogSource[];
};
const image = /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif|heix)$/i, video = /\.(mp4|mov|webm|m4v)$/i;
const excludedSniff = /\.(xlsx|csv|txt|json|glb|gltf|obj|stl|ply)$/i, backup = /(backup|バックアップ|コピー|copy|_old|旧)/i;

/** Parse one real table body at a time, then share the existing exact candidate analysis. */
export async function analyzeLociMyuCatalog(catalog: VerifiedZipCatalog, limits: FileValidationLimits,
  preflight: (bytes: Uint8Array) => Promise<void>, inspectSource: (source: LociMyuCatalogSource) => void) {
  const failures = new Map<string, string>();
  const imported: LociMyuCatalogPlan = { models: [], images: [], videos: [], tables: [], sources: [], selectedSourceIndex: 0,
    migration: null, fileIdMap: new Map(), fileIdMapRows: [], diagnostics: { archive: [], rejectedCandidates: [], selection: null, selectedSource: [] },
    warnings: [], allowBlockedLociMyuSource: true, blockedLociMyuSource: null };
  for (const entry of catalog.entries) if (/\.xlsx$/i.test(entry.path)) {
    try { await preflight(await catalog.readBytes(entry.path, limits.maxFileBytes)); }
    catch (error) { failures.set(entry.path, error instanceof Error ? error.message : '表を検査できません。'); }
  }
  const append = (entry: VerifiedZipEntry, values: Omit<LociMyuCatalogSource, 'fileName' | 'archivePath' | 'proof' | 'looksLikeBackup'>) => {
    const name = entry.path.split('/').at(-1)!;
    const source: LociMyuCatalogSource = { fileName: name, archivePath: entry.path, proof: { byteLength: entry.byteLength, digest: entry.digest },
      looksLikeBackup: backup.test(name), ...values };
    inspectSource(source); imported.sources.push(source);
  };
  for (const entry of catalog.entries) {
    if (failures.has(entry.path)) continue;
    const name = entry.path.split('/').at(-1)!; if (name.startsWith('.') || name.startsWith('~$')) continue;
    const prefix = new Uint8Array(entry.prefix), item: LociMyuCatalogFile = { path: entry.path, name, entry, imageExt: sniffImageExt(prefix) };
    if (detectFormat(name, prefix) !== null) imported.models.push(item);
    else if (image.test(name)) imported.images.push(item);
    else if (video.test(name)) imported.videos.push(item);
    else if (!excludedSniff.test(name)) {
      // HEIF compatible brands can be beyond the compact prefix; only this temporary body is read.
      item.imageExt ??= sniffImageExt(await catalog.readBytes(entry.path, limits.maxFileBytes));
      if (item.imageExt !== null) imported.images.push(item);
    } else if (/\.xlsx$/i.test(name)) {
      let source: { tables: SpreadsheetSource['tables']; captionCount: number } | undefined;
      try {
        const bytes = await catalog.readBytes(entry.path, limits.maxFileBytes);
        if (!looksLikeXlsx(name, bytes)) throw Error('not an XLSX ZIP container');
        const tables = await readXlsx(bytes); source = { tables, captionCount: countLociMyuCaptionSourceRows(tables) };
      } catch {
        imported.diagnostics.archive.push(`${name} を安全に読み取れませんでした`);
        if (/locimyu/iu.test(name)) append(entry, { tables: [], captionCount: 0,
          validationFailure: { code: 'workbook-unreadable', message: 'The LociMyu workbook could not be decoded safely' } });
      }
      if (source) append(entry, source);
    } else if (/\.csv$/i.test(name)) {
      const rows = parseCsv(new TextDecoder().decode(await catalog.readBytes(entry.path, limits.maxFileBytes))), header = (rows[0] ?? []).map(v => trim(v).toLowerCase());
      const table = { name: name.replace(/\.csv$/i, ''), rows };
      if (!isLociMyuCaptionSheet(rows) && (header[0] === 'fileid' || header[0] === 'id') && header[1] === 'filename') {
        for (const [index, row] of rows.slice(1).entries()) {
          const id = trim(row[0] ?? ''), name = trim(row[1] ?? ''); imported.fileIdMapRows!.push({ archivePath: entry.path, rowNumber: index + 2, fileId: id, fileName: name });
          if (id && name) imported.fileIdMap.set(id, name);
        }
      } else append(entry, { tables: [table], captionCount: countLociMyuCaptionSourceRows([table]) });
    }
  }
  await analyzeImportPlanSources(imported);
  const rawAnalyzerDiagnostics = { diagnostics: imported.diagnostics, selectedSourceIndex: imported.selectedSourceIndex,
    candidates: imported.sources.map(s => ({ path: s.archivePath, failure: s.validationFailure ?? null })) };
  for (const entry of catalog.entries) if (failures.has(entry.path)) {
    const source: LociMyuCatalogSource = { fileName: entry.path.split('/').at(-1)!, archivePath: entry.path,
      proof: { byteLength: entry.byteLength, digest: entry.digest }, tables: [], looksLikeBackup: false, captionCount: 0,
      validationFailure: { code: 'workbook-unreadable', message: failures.get(entry.path)! } };
    inspectSource(source); imported.sources.push(source);
  }
  return { imported, failures, rawAnalyzerDiagnostics };
}
