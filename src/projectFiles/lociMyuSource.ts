import { opaqueMaterialSource } from '../domain/meshMaterialSource';
import { inspectProjectImage, type PhotoDecoder } from './photo';
import { inspectZipContainerMetadata, readZipEntries, sanitizeZipPath, type ZipEntryData } from '../assets/zipio';
import { buildImportPlan, sniffImageExt, type ImportPlan } from '../assets/importWizard';
import { parseCsv } from '../io/csv';
import { analyzeLociMyuSheets, isLociMyuCaptionSheet, lociMyuTrimV1 as trim, projectLociMyuCaptionSheetIdentities,
  planLociMyuDisplaySetRelationConfirmation, LociMyuIdentityCollisionError, LociMyuSourceValidationError,
  type SheetTable, type LociMyuCaption, type LociMyuCaptionSheetIdentity } from '../io/locimyu';
import { scalarLength, type JsonObject, type JsonValue } from '../domain/values';
import { digest, json } from '../projectMetadata/persistence';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import { readValidationBody } from './content';
import { inspectFreshValidationGlb, validationGlbParts, type ValidatedGlb } from './glb';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { checkFileLimits, validationMetadataLimits, type FileValidationLimits } from './validation';

export const lociMyuRecipe = 'locimyu-project-scene-migration-recipe-1';
export const lociMyuJpegRecipe = 'locimyu-project-scene-migration-recipe-2';
export const lociMyuPhotoRecipe = 'locimyu-project-scene-migration-recipe-3';
export const lociMyuMaterialRecipe = 'locimyu-project-scene-migration-recipe-4';
export const lociMyuOpaqueMaterialRecipe = 'locimyu-project-scene-migration-recipe-5';
export type LociMyuRecipe = typeof lociMyuOpaqueMaterialRecipe | typeof lociMyuMaterialRecipe | typeof lociMyuPhotoRecipe | typeof lociMyuRecipe | typeof lociMyuJpegRecipe;
export const lociMyuByteProof = async (bytes: Uint8Array) => ({ byteLength: bytes.length, digest: await digest(bytes) });
export interface LociMyuIssue { severity: 'info' | 'warning' | 'blocking'; sheet: string | null; row: number | null; sourceId: string | null;
  field: string; reason: string; impact: string; candidates: string[] }
export interface LociMyuBody { path: string; label: string; bytes: Uint8Array; ref: StoredBlobRef }
export interface LociMyuScene { name: string; identity: LociMyuCaptionSheetIdentity; captions: { value: LociMyuCaption; row: number; imagePath?: string }[] }
export interface LociMyuView { row: number; scene: string; name: string; camera: JsonObject; background: number[] }
export interface LociMyuMaterial { row: number; scene: string; identity: LociMyuCaptionSheetIdentity; key: string; indices: number[];
  doubleSided: boolean; unlit: boolean; sourceOnlyChroma: boolean }
export interface LociMyuSourcePlan {
  recipe: LociMyuRecipe;
  workbook: { path: string; byteLength: number; digest: string }; confirmation: readonly { sheetGid: string; sheetName: string }[] | null;
  title: string; model: LociMyuBody & { model: ValidatedGlb }; media: LociMyuBody[]; scenes: LociMyuScene[]; views: LociMyuView[];
  fingerprints: { path: string; role: string; byteLength: number; digest: string }[];
  inventory: { count: number; byteLength: number; digest: string }; issues: LociMyuIssue[];
  sourceEvidence: JsonObject;
  materialRows?: LociMyuMaterial[];
  accounting: { tables: number; rows: number; entries: number; sourceOnlyEntries: number; missingIds: number };
}
/** Private legacy evidence permits exact scalar sequences; target record admission remains NFC. */
export function lociMyuEvidence(value: unknown): JsonValue {
  let nodes = 0; const ancestors = new Set<object>();
  const copy = (v: unknown, depth: number): JsonValue => {
    if (++nodes > validationMetadataLimits.maxNodes || depth > validationMetadataLimits.maxDepth) refuse('元データの項目数が上限を超えています。');
    if (typeof v === 'string') { scalarLength(v, validationMetadataLimits.maxStringScalars, []); return v; }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v || 0;
    if (!v || typeof v !== 'object' || ancestors.has(v)) refuse('元データの構造が不正です。');
    ancestors.add(v);
    try {
      if (Array.isArray(v)) return v.map(child => copy(child, depth + 1));
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) refuse('元データの構造が不正です。');
      const result: Record<string, JsonValue> = Object.create(null);
      for (const key of Object.keys(v)) { scalarLength(key, validationMetadataLimits.maxStringScalars, []);
        if (['__proto__', 'constructor', 'prototype'].includes(key)) refuse('元データの構造が不正です。');
        result[key] = copy((v as Record<string, unknown>)[key], depth + 1); }
      return result;
    } finally { ancestors.delete(v); }
  }; return copy(value, 0);
}
export class LociMyuPreflightError extends Error {}
function refuse(reason: string): never { throw new LociMyuPreflightError(reason); }
const cell = (row: readonly string[], column: number) => trim(row[column] ?? '');
const nonempty = (row: readonly string[]) => row.some(v => trim(v) !== '');
const internal = new Set(['__LM_VIEWS', '__LM_MATERIALS', '__LM_SHEET_NAMES', '__LM_META']);
const hex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value) ? [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255) : null;
const finite = (v: string) => v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const zipLimits = (limits: FileValidationLimits) => ({ maxEntries: limits.maxItems, maxTotalBytes: limits.maxFileBytes, maxEntryBytes: limits.maxFileBytes });

/** Guard the exact old decoder's lossy cases before it sees an XLSX. No legacy reader change. */
async function preflightWorkbook(bytes: Uint8Array, limits: FileValidationLimits) {
  const entries = await readZipEntries(bytes, zipLimits(limits)), files = new Map(entries.map(e => [e.path, e.data]));
  let total = 0;
  const xml = (data: Uint8Array) => { total += data.length; if (total > limits.maxJsonBytes) refuse('表の検査量が上限を超えています。');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (/<!DOCTYPE|<!ENTITY|<[A-Za-z_][\w.-]*:|<[^!?][^>]*\b[\w:.-]+(?:\s+=|=\s+|\s*=\s*')/.test(text)) refuse('未対応の表の構造です。'); return text; };
  const documents = new Map(entries.filter(e => /\.xml$|\.rels$/i.test(e.path)).map(e => [e.path, xml(e.data)]));
  const sharedCount = [...(documents.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>[\s\S]*?<\/si>/g)].length;
  for (const [path, text] of documents) {
    if (/\.rels$/.test(path)) for (const match of text.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
      const mode = /\bTargetMode="([^"]*)"/.exec(match[1]!)?.[1];
      if (mode && mode !== 'Internal') refuse('外部参照を含む表は変換できません。');
    }
    if (/worksheets\//.test(path)) {
      const rows = [...text.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)];
      if (rows.length > Math.min(100000, limits.maxItems) || /<row\b[^>]*\/>/.test(text)) refuse('表の行を省略せず読み取れません。');
      for (const row of rows) {
        const occupied = new Set<number>(); let next = 0;
        for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = /\br="([A-Z]+)\d+"/.exec(c[1]!)?.[1];
          const index = ref ? [...ref].reduce((v, ch) => v * 26 + ch.charCodeAt(0) - 64, 0) - 1 : next;
          if (index >= 512 || occupied.has(index)) refuse('表の列を省略せず読み取れません。'); occupied.add(index); next = index + 1;
          if (/\bt="s"/.test(c[1]!)) { const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1];
            if (raw !== undefined && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) >= sharedCount)) refuse('表の文字列参照が不正です。'); }
        }
      }
    }
  }
  const workbook = documents.get('xl/workbook.xml'), rels = documents.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) refuse('表のシート参照が不足しています。');
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const id = /\bId="([^"]*)"/.exec(match[1]!)?.[1], raw = /\bTarget="([^"]*)"/.exec(match[1]!)?.[1];
    if (!id || !raw || targets.has(id) || /[&'\\]/.test(raw)) refuse('表のシート参照が不正です。');
    targets.set(id, raw.startsWith('/') ? raw.slice(1) : `xl/${raw.replace(/^\.\//, '')}`);
  }
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const rid = /\br:id="([^"]*)"/.exec(match[1]!)?.[1], target = rid && targets.get(rid);
    if (!target || sanitizeZipPath(target) !== target || !files.has(target)) refuse('表のシート参照が不足しています。');
  }
}

export interface OpenedLociMyuSource { original: Uint8Array; imported: ImportPlan; entries: ZipEntryData[];
  preflightFailures: Map<string, string>; rawAnalyzerDiagnostics: JsonObject; limits: FileValidationLimits; decode?: PngDecoder; jpeg?: JpegDecoder; photo?: PhotoDecoder }
/** Read-only source authority. No Native DTO, importer write or repaired GID map. */
export async function openLociMyuSource(input: Blob, limits: FileValidationLimits, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder): Promise<OpenedLociMyuSource | null> {
  checkFileLimits(limits); const file = input.slice();
  if (file.size > limits.maxFileBytes) refuse('ファイルが検査の上限を超えています。');
  const container = await inspectZipContainerMetadata(file);
  if (container.identity !== 'foreign' || !container.hasSpreadsheetEntry) return null;
  const original = await readValidationBody({ size: file.size, stream: () => file.stream() }, limits.maxFileBytes);
  const entries = await readZipEntries(original, zipLimits(limits)), preflightFailures = new Map<string, string>();
  for (const e of entries) if (/\.xlsx$/i.test(e.path)) {
    try { await preflightWorkbook(e.data, limits); }
    catch (error) { preflightFailures.set(e.path, error instanceof Error ? error.message : '表を検査できません。'); }
  }
  // Do not pass a dangerous workbook to a legacy decoder with larger default budgets.
  const safeEntries = entries.filter(e => !preflightFailures.has(e.path));
  const imported = await buildImportPlan(safeEntries, { preserveBlockedLociMyuSource: true });
  const rawAnalyzerDiagnostics = lociMyuEvidence({ diagnostics: imported.diagnostics, selectedSourceIndex: imported.selectedSourceIndex,
    candidates: imported.sources.map(s => ({ path: s.archivePath, failure: s.validationFailure ?? null })) }) as JsonObject;
  for (const e of entries) if (preflightFailures.has(e.path)) imported.sources.push({ fileName: e.path.split('/').at(-1)!, archivePath: e.path,
    sourceBytes: e.data, tables: [], looksLikeBackup: false, captionCount: 0, validationFailure: { code: 'workbook-unreadable', message: preflightFailures.get(e.path)! } });
  if (!imported.sources.some(s => s.tables.some(t => isLociMyuCaptionSheet(t.rows))) && !preflightFailures.size) return null;
  // Bound every decoded cell across every workbook, not a fresh budget for each row.
  lociMyuEvidence(imported.sources.map(s => ({ path: s.archivePath, tables: s.tables })));
  const admitted: { index: number; count: number; backup: boolean }[] = [];
  for (const [index, source] of imported.sources.entries()) {
    if (source.validationFailure?.code === 'full-digest-collision' || source.validationFailure?.code === 'portable-id-collision') throw new LociMyuIdentityCollisionError(source.validationFailure.code, source.validationFailure.message);
    if (!source.tables.some(t => isLociMyuCaptionSheet(t.rows))) continue;
    try {
      const identities = projectLociMyuCaptionSheetIdentities(source.tables);
      const projected = source.tables.map(t => ({ ...t, rows: t.rows.map((r, n) => n && identities.has(t) && nonempty(r) && !cell(r, 0) ? r.map(() => '') : [...r]) }));
      const m = await analyzeLociMyuSheets(projected), count = m.sets.reduce((n, s) => n + s.captions.length, 0);
      source.captionCount = count; delete source.validationFailure; admitted.push({ index, count, backup: source.looksLikeBackup });
    } catch (error) { if (!(error instanceof LociMyuSourceValidationError)) throw error; }
  }
  admitted.sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || Number(a.backup) - Number(b.backup) || b.count - a.count || a.index - b.index);
  if (admitted.length) imported.selectedSourceIndex = admitted[0]!.index;
  return { original, imported, entries, preflightFailures, rawAnalyzerDiagnostics, limits, decode, jpeg, photo };
}

export async function planLociMyuSource(opened: OpenedLociMyuSource, selection: number, title: string, confirmRelations: boolean): Promise<{
  relation: ReturnType<typeof planLociMyuDisplaySetRelationConfirmation>;
  base: Pick<LociMyuSourcePlan, 'workbook' | 'confirmation' | 'title' | 'inventory' | 'fingerprints' | 'issues' | 'accounting' | 'sourceEvidence'> & { materialSelected?: true; materialRecipe?:typeof lociMyuMaterialRecipe|typeof lociMyuOpaqueMaterialRecipe };
  plan: LociMyuSourcePlan | null;
}> {
  const { imported, entries, limits, decode, jpeg, photo } = opened, source = imported.sources[selection];
  if (!source || !Number.isSafeInteger(selection)) refuse('変換する表を選択してください。');
  const issues: LociMyuIssue[] = [];
  const issue = (severity: LociMyuIssue['severity'], sheet: string | null, row: number | null, sourceId: string | null, field: string, reason: string,
    impact = '元のZIPと説明ファイルに保持します。', candidates: string[] = []) => issues.push({ severity, sheet, row, sourceId, field, reason, impact, candidates });
  const workbook = { path: source.archivePath, ...await lociMyuByteProof(source.sourceBytes) };
  const tables = source.tables;
  let relation: ReturnType<typeof planLociMyuDisplaySetRelationConfirmation> = { kind: 'unavailable', relations: [], reason: 'missing-corroborating-table' };
  const inventoryRows = tables.flatMap((t, i) => t.rows.map((r, n) => [i, n + 1, [...r]]));
  const inventory = { count: inventoryRows.length, ...await lociMyuByteProof(new TextEncoder().encode(JSON.stringify(inventoryRows))) };
  const fingerprints: LociMyuSourcePlan['fingerprints'] = [];
  const accounting = { tables: tables.length, rows: inventoryRows.length, entries: entries.length, sourceOnlyEntries: 0, missingIds: 0 };
  const sourceEvidence = lociMyuEvidence({ candidates: await Promise.all(imported.sources.map(async s => ({ path: s.archivePath, ...await lociMyuByteProof(s.sourceBytes),
    diagnostics: s.validationFailure ?? null, admittedCaptions: s.captionCount, tables: s.tables.map(t => ({ name: t.name, headers: t.rows[0] ?? [], rows: t.rows.length })) }))),
    diagnostics: { selectedWorkbook: source.archivePath, candidateFailures: imported.sources.filter(s => s.validationFailure).map(s => ({ path: s.archivePath, failure: s.validationFailure! })) },
    rawAnalyzerDiagnostics: opened.rawAnalyzerDiagnostics, fileIdMapRows: imported.fileIdMapRows ?? [] }) as JsonObject;
  const base: Pick<LociMyuSourcePlan, 'workbook' | 'confirmation' | 'title' | 'inventory' | 'fingerprints' | 'issues' | 'accounting' | 'sourceEvidence'> & { materialSelected?: true; materialRecipe?:typeof lociMyuMaterialRecipe|typeof lociMyuOpaqueMaterialRecipe } = { workbook, confirmation: null, title, inventory, fingerprints, issues, accounting, sourceEvidence };
  try {
    if (opened.preflightFailures.has(source.archivePath)) refuse(opened.preflightFailures.get(source.archivePath)!);
    if (source.validationFailure && source.validationFailure.code !== 'missing-legacy-id') {
      if (source.validationFailure.code === 'full-digest-collision' || source.validationFailure.code === 'portable-id-collision') throw new LociMyuIdentityCollisionError(source.validationFailure.code, source.validationFailure.message);
      refuse(source.validationFailure.message);
    }
    const identities = projectLociMyuCaptionSheetIdentities(tables), captionTables = [...identities.keys()];
    relation = planLociMyuDisplaySetRelationConfirmation(tables);
    const confirmation = confirmRelations && relation.kind === 'confirmation-required' ? relation.relations.map(r => ({ ...r })) : null;
    base.confirmation = confirmation;
    if (!captionTables.length) refuse('LociMyuのキャプション表がありません。');
    if (confirmRelations && relation.kind !== 'confirmation-required') refuse('この表には確認できる完全な関連付けがありません。');
    const activation = new Map<string, string>();
    for (const t of captionTables) { const identity = identities.get(t)!; if (identity.kind === 'legacyGid') activation.set(identity.value, trim(t.name)); }
    for (const r of confirmation ?? []) activation.set(r.sheetGid, r.sheetName);
    const conversionTables = tables.map(t => ({ ...t, rows: t.rows.map((row, i) => {
      if (i && identities.has(t) && nonempty(row) && cell(row, 0) === '') {
        accounting.missingIds++; issue('warning', trim(t.name), i + 1, null, 'id', 'IDのない行はキャプションにしません。'); return row.map(() => '');
      } return [...row]; }) }));
    const analyzed = await analyzeLociMyuSheets(conversionTables);
    if (imported.models.length !== 1) refuse('最初の対応範囲では、モデルを1つだけ含むZIPを選択してください。');
    const candidate = imported.models[0]!;
    const inspected = await inspectFreshValidationGlb(candidate.data, limits, decode, jpeg);
    const model = { path: candidate.path, label: candidate.path.split('/').at(-1)!, bytes: candidate.data, model: inspected,
      ref: { algorithm: 'sha256', ...await lociMyuByteProof(candidate.data), mediaType: 'model/gltf-binary' } as StoredBlobRef };
    const rawGlb = validationGlbParts(candidate.data, limits).json, rawMaterials = rawGlb.materials as { name?: string }[] | undefined;
    const materialNames = new Set<string>(), materialIndices = new Map<string, Set<number>>();
    for (const surface of inspected.surfaceRanges) {
      const node = (rawGlb.nodes as { mesh?: number }[])[surface.nodeIndex as number]!, mesh = (rawGlb.meshes as { primitives: { material?: number }[] }[])[node.mesh!]!;
      const index = mesh.primitives[surface.primitiveIndex as number]!.material, name = index === undefined ? undefined : rawMaterials?.[index]?.name;
      if (typeof name === 'string') { const key = trim(name); materialNames.add(key);
        const values = materialIndices.get(key) ?? new Set<number>(); values.add(index!); materialIndices.set(key, values); }
    }
    const materialSlots = new Map(inspected.materials.filter(m => (m.sourceLocator as JsonObject).kind === 'gltfMaterial').map(m => [(m.sourceLocator as JsonObject).materialIndex, m]));
    const materialTableCount = tables.filter(t => trim(t.name) === '__LM_MATERIALS').length;
    const namesById = new Map<string, Set<string>>(), idsByName = new Map<string, Set<string>>(), taintedIds = new Set<string>(), taintedNames = new Set<string>();
    for (const r of imported.fileIdMapRows ?? []) {
      const id = trim(r.fileId), name = trim(r.fileName);
      if (!id || !name) { if (id) taintedIds.add(id); if (name) taintedNames.add(name); }
      else { const names = namesById.get(id) ?? new Set(); names.add(name); namesById.set(id, names);
        const ids = idsByName.get(name) ?? new Set(); ids.add(id); idsByName.set(name, ids); }
      if (!id || !name) issue('warning', r.archivePath, r.rowNumber, id || null, 'fileId/filename', '不完全な画像対応行は関連付けに使いません。');
    }
    const images = new Map<string, LociMyuBody>();
    const scenes: LociMyuScene[] = [];
    for (const [i, t] of captionTables.entries()) {
      const values = analyzed.sets[i]!.captions, acceptedRows = t.rows.map((r, n) => ({ r, n })).filter(({ r, n }) => n && nonempty(r) && cell(r, 0) !== '');
      const scene: LociMyuScene = { name: trim(t.name), identity: identities.get(t)!, captions: [] };
      for (const [c, value] of values.entries()) {
        const { r, n } = acceptedRows[c]!; const caption: LociMyuScene['captions'][number] = { value, row: n + 1 };
        if (!value.position) issue('warning', scene.name, n + 1, value.legacyId, 'position', '座標が不完全または無効のため、配置前のキャプションとして保持します。');
        if (cell(r, 3) && !hex(cell(r, 3))) issue('warning', scene.name, n + 1, value.legacyId, 'color', '無効な色は既定の黄色にします。');
        const imageId = value.legacyImageFileId;
        if (imageId) {
          const names = namesById.get(imageId), name = names?.size === 1 ? [...names][0]! : null;
          const matches = name ? imported.images.filter(f => trim(f.name) === name) : [];
          const exact = name && !taintedIds.has(imageId) && !taintedNames.has(name) && idsByName.get(name)?.size === 1 && matches.length === 1;
          if (!exact) issue('warning', scene.name, n + 1, value.legacyId, 'imageFileId', '画像の対応が一意に確認できないため添付しません。', undefined, name ? matches.map(m => m.path) : []);
          else {
            const image = matches[0]!;
            if (sniffImageExt(image.data) === 'heic')
              issue('warning', scene.name, n + 1, value.legacyId, 'imageFileId', 'HEIC/HEIFはこの変換では添付できません。');
            else {
              const mediaType = await inspectProjectImage(image.data, limits, decode, jpeg, photo); caption.imagePath = image.path;
              if (!images.has(image.path)) images.set(image.path, { path: image.path, label: image.name, bytes: image.data,
                ref: { algorithm: 'sha256', ...await lociMyuByteProof(image.data), mediaType } });
            }
          }
        }
        scene.captions.push(caption);
      }
      scenes.push(scene);
    }
    const views: LociMyuView[] = [], materialRows: LociMyuMaterial[] = []; let materialWork = 0;
    for (const table of tables) {
      const name = trim(table.name);
      const sourceOnlyColumns = identities.has(table) ? new Set([8, 9]) : name === '__LM_VIEWS' ? new Set([15, 16]) : name === '__LM_MATERIALS' ? new Set([8, 9, 10, 11, 12]) : null;
      const known = identities.has(table) ? 10 : name === '__LM_VIEWS' ? 17 : name === '__LM_MATERIALS' ? 14 : name === '__LM_SHEET_NAMES' ? 3 : 0;
      for (const [n, row] of table.rows.entries()) if (n) for (const [column, value] of row.entries()) if (trim(value) && (sourceOnlyColumns?.has(column) || column >= known || !cell(row, 0)))
        issue('info', name, n + 1, cell(row, 0) || null, cell(table.rows[0] ?? [], column) || `column${column + 1}`, 'この元フィールドは有効な変換先の値として保存しません。');
      if (!identities.has(table) && !internal.has(name)) issue('info', name, null, null, 'sheet', 'この表は変換対象外です。');
      if (name === '__LM_META' || name === '__LM_SHEET_NAMES') issue('info', name, null, null, 'source metadata', '関連付け根拠以外の元メタデータは変換しません。');
      if (name === '__LM_VIEWS') for (const [i, row] of table.rows.entries()) {
        if (!i || !nonempty(row)) continue;
        const sourceId = cell(row, 0), scene = activation.get(cell(row, 1)), kind = cell(row, 4).toLowerCase(), fovRaw = cell(row, 14);
        const vector = [5, 6, 7, 8, 9, 10].map(c => finite(cell(row, c))), upRaw = [11, 12, 13].map(c => cell(row, c));
        const defaultUp = kind === 'orthographic' && upRaw.every(v => !v), up = defaultUp ? [0, 1, 0] : upRaw.map(finite);
        const fov = kind === 'orthographic' && !fovRaw ? 45 : finite(fovRaw);
        if (!sourceId || !scene || !['', 'perspective', 'orthographic'].includes(kind) || vector.includes(null) || up.includes(null) || fov === null || fov <= 1 || fov >= 179) {
          issue('warning', name, i + 1, sourceId || null, 'view', '視点の関連付けまたは座標・画角が無効のため有効にしません。'); continue;
        }
        const position = vector.slice(0, 3) as number[], target = vector.slice(3) as number[], u = up as number[], d = target.map((n, c) => n - position[c]!);
        const cross = [d[1]! * u[2]! - d[2]! * u[1]!, d[2]! * u[0]! - d[0]! * u[2]!, d[0]! * u[1]! - d[1]! * u[0]!];
        if (cross.every(n => n === 0) || cross.some(n => !Number.isFinite(n))) { issue('warning', name, i + 1, sourceId, 'basis', '視線と上方向が有効な基底になりません。'); continue; }
        const radians = fov * (Math.PI / 180), span = 2 * Math.hypot(position[0]! - target[0]!, position[1]! - target[1]!, position[2]! - target[2]!) * Math.tan(radians / 2);
        if (kind === 'orthographic' && (!Number.isFinite(span) || span <= 0)) { issue('warning', name, i + 1, sourceId, 'span', '正投影の表示幅を計算できません。'); continue; }
        if (kind === 'orthographic') issue('warning', name, i + 1, sourceId, 'projection', '正投影の表示幅は承認済み互換式による近似です。', '視点を保持します。', [`fovDegrees=${fov}`, `fovSource=${fovRaw ? 'source' : 'legacy-default'}`, `upSource=${defaultUp ? 'legacy-default-y-up' : 'source'}`, `verticalSpan=${span}`]);
        const bg = cell(row, 3); if (bg && !hex(bg)) issue('warning', name, i + 1, sourceId, 'bgColor', '無効な背景色は既定の暗色にします。');
        views.push({ row: i + 1, scene, name: cell(row, 2) === '__last' ? '前回の視点' : cell(row, 2),
          camera: { position, target, up: u, projection: kind === 'orthographic' ? { kind, verticalSpan: span } : { kind: 'perspective', verticalFovRadians: radians } }, background: hex(bg) ?? [16 / 255, 16 / 255, 16 / 255] });
      }
      if (name === '__LM_MATERIALS') {
        const latest = new Map<string, number>(); table.rows.forEach((r, i) => { if (i && nonempty(r)) latest.set(JSON.stringify([cell(r, 13), cell(r, 0)]), i); });
        for (const [i, r] of table.rows.entries()) if (i && nonempty(r)) {
          const key = cell(r, 0), gid = cell(r, 13), current = latest.get(JSON.stringify([gid, key])) === i;
          const bool = (s: string) => ['', 'true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(s.toLowerCase());
          const number = (c: number, fallback: number) => cell(r, c) === '' ? fallback : finite(cell(r, c));
          const opacity = number(1, 1), tolerance = number(6, 0), feather = number(7, 0);
          const valid = [opacity, tolerance, feather].every(v => v !== null && v >= 0 && v <= 1) && [2, 3, 4].every(c => bool(cell(r, c))) && (!cell(r, 5) || hex(cell(r, 5)));
          if (key && activation.has(gid) && materialNames.has(key) && current && valid) {
            base.materialSelected = true;
            const materialRefuse = (field: string, reason: string, candidates: string[] = []): never => { issue('blocking', name, i + 1, key, field, reason, 'プロジェクトは作成していません。', candidates); return refuse(reason); };
            if (materialTableCount !== 1) materialRefuse('material table', '材質表が重複しているため対応を確定できません。');
            const truth = (c: number) => ['true', '1', 'yes', 'on'].includes(cell(r, c).toLowerCase());
            if (opacity !== 1) materialRefuse('opacity', 'この材質の不透明度はまだ変換できません。');
            if (truth(4)) materialRefuse('chromaEnable', 'この材質の色の透過設定はまだ変換できません。');
            const targets = materialIndices.get(key)!;
            materialWork += targets.size;
            if (materialWork > validationMetadataLimits.maxWork || materialWork > validationMetadataLimits.maxNodes) materialRefuse('material targets', '材質の対応件数が上限を超えています。');
            const indices = [...targets].sort((a, b) => a - b);
            for (const index of indices) {
              const slot = materialSlots.get(index);
              const source=slot&&opaqueMaterialSource(slot.sourceSemantics);
              if (!source)
                materialRefuse('sourceSemantics', `材質 ${index + 1} の元の見え方はまだ変換できません。`, [`gltfMaterial:${index}`]);
              if(source!.lighting==='unlit'||source!.doubleSided)base.materialRecipe=lociMyuOpaqueMaterialRecipe;
            }
            const scene = scenes.find(s => s.name === activation.get(gid))!;
            materialRows.push({ row: i + 1, scene: scene.name, identity: scene.identity, key, indices, doubleSided: truth(2), unlit: truth(3), sourceOnlyChroma: [5, 6, 7].some(c => !!cell(r, c)) });
            for (const c of [5, 6, 7]) if (cell(r, c)) issue('info', name, i + 1, key, cell(table.rows[0] ?? [], c) || `column${c + 1}`, '色の透過が無効なときの編集値は変換先へ写さず、元のZIPと説明ファイルに保持します。');
            continue;
          }
          issue('warning', name, i + 1, key || null, 'material', '未解決・無効または過去の材質行は有効にしません。');
        }
      }
    }
    for (const s of scenes) if (views.filter(v => v.scene === s.name).length > 1) issue('info', s.name, null, null, 'defaultView', '複数の視点を保持し、既定の視点は選択しません。');
    for (const entry of entries) {
      let role = entry.path === source.archivePath ? 'selected-workbook' : imported.sources.some(s => s.archivePath === entry.path) ? 'unselected-workbook' :
        entry.path === candidate.path ? 'model' : images.has(entry.path) ? 'linked-' + images.get(entry.path)!.ref.mediaType.slice(6) :
        imported.images.some(f => f.path === entry.path) || imported.videos.some(f => f.path === entry.path) ? 'unlinked-media' : null;
      const basename = entry.path.split('/').at(-1)!;
      if (!role && /\.csv$/i.test(entry.path) && !basename.startsWith('.') && !basename.startsWith('~$')) {
        const rows = parseCsv(new TextDecoder().decode(entry.data)), header = rows[0]?.map(v => trim(v).toLowerCase());
        if (!isLociMyuCaptionSheet(rows) && (header?.[0] === 'fileid' || header?.[0] === 'id') && header[1] === 'filename') role = 'file-id-map';
      }
      if (!role) refuse('内容を説明できないZIP項目が含まれています。');
      if (role === 'unselected-workbook' || role === 'unlinked-media') { accounting.sourceOnlyEntries++; issue('info', entry.path, null, null, 'entry', 'この項目は元ファイルだけに保持します。'); }
      fingerprints.push({ path: entry.path, role, ...await lociMyuByteProof(entry.data) });
    }
    const plan: LociMyuSourcePlan = { ...base, recipe: base.materialSelected ? base.materialRecipe??lociMyuMaterialRecipe : [...images.values()].some(m => m.ref.mediaType === 'image/webp' || m.ref.mediaType === 'image/gif') ? lociMyuPhotoRecipe : model.model.jpeg || [...images.values()].some(m => m.ref.mediaType === 'image/jpeg') ? lociMyuJpegRecipe : lociMyuRecipe, model, media: [...images.values()], scenes, views,
      ...(base.materialSelected ? { materialRows } : {}) };
    if (base.materialSelected) lociMyuEvidence(materialRows);
    lociMyuEvidence({ ...base, scenes: scenes.map(s => ({ name: s.name, identity: s.identity, captions: s.captions.map(c => ({ row: c.row, id: c.value.captionId })) })) });
    return { relation, base, plan };
  } catch (error) {
    if (error instanceof LociMyuIdentityCollisionError) throw error;
    if (!(error instanceof LociMyuPreflightError || error instanceof LociMyuSourceValidationError) && !(error instanceof Error && error.message.startsWith('読み込めません。'))) throw error;
    issue('blocking', null, null, null, 'conversion', error.message, 'プロジェクトは作成していません。');
    // Even failed source admission retains a complete entry fingerprint inventory for explicit reporting.
    fingerprints.splice(0); for (const e of entries) fingerprints.push({ path: e.path, role: 'unpublished-source', ...await lociMyuByteProof(e.data) });
    return { relation, base, plan: null };
  }
}
