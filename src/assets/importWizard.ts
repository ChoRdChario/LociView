// Drive フォルダZIP のインポートウィザード (docs/02 §6.2, FR-02)
//
// 受け取るもの: Google Drive のフォルダをZIPダウンロードした中身
//   - スプレッドシート → .xlsx に変換されて同梱される
//   - GLB等のモデル、画像群はそのまま
// 判定して LociView プロジェクトを新規作成する。LociMyuスキーマなら移行モードで
// 表示セット・ビュー・マテリアル設定まで引き継ぐ。

import { entityIdFor, ProjectStore, type Identity } from '../core/store';
import type { ProjectManifest } from '../core/manifest';
import { visibleEntities } from '../core/reduce';
import {
  analyzeLociMyuSheets,
  countLociMyuCaptionSourceRows,
  isLociMyuCaptionSheet,
  LociMyuIdentityCollisionError,
  LociMyuSourceValidationError,
  lociMyuTrimV1,
  type LociMyuIdentityCollisionCode,
  type LociMyuMigration,
  type LociMyuSourceValidationCode,
  type SheetTable,
} from '../io/locimyu';
import { parseCsv } from '../io/csv';
import { looksLikeXlsx, readXlsx } from '../io/xlsx';
import type { ProjectWorkspaceFS, WorkspaceFS } from '../platform/fs';
import { detectFormat } from '../viewer/loaders';
import { writeVerifiedBytes } from './verifiedWrite';
import type { ZipEntryData } from './zipio';

// HEIC/HEIF extensions enter inventory even when corrupt so the conversion
// report can account for them. Native admission remains a separate byte check.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif|heix)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
const encoder = new TextEncoder();
const sourceSelectionRevisions = new WeakMap<ImportPlan, number>();

function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

interface AssetWriteReceipt {
  readonly byteLength: number;
  readonly sha256: Uint8Array;
}

async function assetWriteReceipt(bytes: Uint8Array): Promise<AssetWriteReceipt> {
  const digestInput = new Uint8Array(bytes);
  return {
    byteLength: bytes.length,
    sha256: new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput.buffer)),
  };
}

export interface ForeignFile {
  path: string;
  name: string;
  data: Uint8Array;
}

function snapshotForeignFiles(files: readonly ForeignFile[]): ForeignFile[] {
  return files.map((file) => ({
    path: file.path,
    name: file.name,
    data: new Uint8Array(file.data),
  }));
}

function releaseForeignFiles(files: readonly ForeignFile[]): void {
  for (const file of files) (file as { data: Uint8Array }).data = new Uint8Array(0);
}

function snapshotSheetTables(tables: readonly SheetTable[]): SheetTable[] {
  return tables.map((table) => ({
    name: table.name,
    ...(table.gid === undefined ? {} : { gid: table.gid }),
    rows: table.rows.map((row) => [...row]),
  }));
}

/** 1つのスプレッドシート（xlsx/csv）ファイル由来のシート群 */
export interface SpreadsheetSource {
  /** ZIP内のファイル名 */
  fileName: string;
  /** ZIP内のexact entry path。直接Native変換のsource accounting用。 */
  archivePath: string;
  /** 選択workbook/table entryのexact bytes。Projectへは保存しない。 */
  sourceBytes: Uint8Array;
  tables: SheetTable[];
  /** バックアップと推定されるか（ファイル名に backup/コピー 等を含む） */
  looksLikeBackup: boolean;
  captionCount: number;
  /** direct-native preflightだけが参照する、候補固有のtyped rejection。 */
  validationFailure?: {
    readonly code: LociMyuSourceValidationCode | LociMyuIdentityCollisionCode | 'workbook-unreadable';
    readonly message: string;
  };
}

export interface FileIdMapSourceRow {
  readonly archivePath: string;
  /** Headerを1行目とするdecoded logical row number。 */
  readonly rowNumber: number;
  readonly fileId: string;
  readonly fileName: string;
}

export interface ImportPlan {
  models: ForeignFile[];
  images: ForeignFile[];
  videos: ForeignFile[];
  /** 採用中のシート群（= selectedSource のもの） */
  tables: SheetTable[];
  /** 見つかったスプレッドシート一覧（複数ある場合はユーザーが選ぶ） */
  sources: SpreadsheetSource[];
  selectedSourceIndex: number;
  /** LociMyu形式が検出された場合の移行内容 */
  migration: LociMyuMigration | null;
  /** fileId→filename 対応表（あれば未リンク画像を自動解決できる） */
  fileIdMap: Map<string, string>;
  /** last-wins Mapでは失われる重複・不完全行をdirect adapterが判定する。 */
  fileIdMapRows?: FileIdMapSourceRow[];
  /** ZIP全体・候補拒否・現在の候補を混同しないための構造化診断。 */
  diagnostics: {
    archive: string[];
    rejectedCandidates: string[];
    selection: string | null;
    selectedSource: string[];
  };
  /** diagnostics と現在選択中のファイル名から生成するUI用の平坦な一覧。 */
  warnings: string[];
  /** legacy v1取込では使わず、direct-native preflightだけが拒否候補を保持する。 */
  allowBlockedLociMyuSource?: true;
  blockedLociMyuSource?: SpreadsheetSource['validationFailure'] | null;
}

export interface BuildImportPlanOptions {
  /** typed source failureをreportするため、LociMyu候補を選択状態として保持する。 */
  readonly preserveBlockedLociMyuSource?: boolean;
}

const BACKUP_HINT = /(backup|バックアップ|コピー|copy|_old|旧)/i;
export const IMPORT_DIAGNOSTIC_DISPLAY_LIMIT = 5;
export const IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE =
  'スプレッドシートの安全な確認処理を完了できませんでした。元のZIPを保管したまま、ブラウザを更新して再試行してください。';

function boundedDiagnosticsSummary(messages: readonly string[]): string {
  const visible = messages.slice(0, IMPORT_DIAGNOSTIC_DISPLAY_LIMIT);
  const omitted = messages.length - visible.length;
  return `${visible.join(' / ')}${omitted > 0 ? ` / 他${omitted}件の候補` : ''}`;
}

function refreshImportPlanWarnings(plan: ImportPlan): void {
  const selected = plan.sources[plan.selectedSourceIndex];
  plan.diagnostics.selection = plan.sources.length > 1 && selected !== undefined
    ? `スプレッドシートが${plan.sources.length}個見つかりました。「${selected.fileName}」を使用します（取込前に切り替えられます）`
    : null;
  plan.warnings = [
    ...plan.diagnostics.archive,
    ...plan.diagnostics.rejectedCandidates,
    ...(plan.diagnostics.selection === null ? [] : [plan.diagnostics.selection]),
    ...plan.diagnostics.selectedSource,
  ];
}

function commitSourceSelection(
  plan: ImportPlan,
  index: number,
  tables: SheetTable[],
  migration: LociMyuMigration,
): void {
  plan.selectedSourceIndex = index;
  plan.tables = tables;
  plan.migration = migration.sets.length > 0 ? migration : null;
  if (plan.allowBlockedLociMyuSource === true) plan.blockedLociMyuSource = null;
  plan.diagnostics.selectedSource = [...migration.warnings];
  refreshImportPlanWarnings(plan);
}

function commitBlockedSourceSelection(
  plan: ImportPlan,
  index: number,
  tables: SheetTable[],
  failure: NonNullable<SpreadsheetSource['validationFailure']>,
): void {
  plan.selectedSourceIndex = index;
  plan.tables = tables;
  plan.migration = null;
  plan.blockedLociMyuSource = failure;
  plan.diagnostics.selectedSource = [failure.code === 'missing-legacy-id'
    ? `${failure.message}。Native変換ではIDのない行を空行としてreportし、残りを変換します`
    : `${failure.message}。Native変換はProjectを作らずreportします`];
  refreshImportPlanWarnings(plan);
}

/**
 * マジックバイトから画像形式を判定する（拡張子なし対策）。
 * Google DriveのZIPでは HEIC 等が拡張子なしで入ることがあり、拡張子だけでは取りこぼす。
 * 返り値は補う拡張子（jpg/png/gif/webp/heic）またはnull。
 */
export function sniffImageExt(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  // RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  // ISO-BMFF: inspect the major and available compatible brands. This only
  // inventories a HEIF-family candidate; it is not decoder admission.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const boxLength = (((b[0]! * 0x1000000) + (b[1]! << 16) + (b[2]! << 8) + b[3]!) >>> 0);
    const available = Math.min(boxLength, b.byteLength);
    for (let offset = 8; offset + 4 <= available; offset += offset === 8 ? 8 : 4) {
      const brand = String.fromCharCode(b[offset]!, b[offset + 1]!, b[offset + 2]!, b[offset + 3]!);
      if (/^(?:heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/u.test(brand)) return 'heic';
    }
  }
  return null;
}

/** 採用するスプレッドシートを切り替える（ウィザードのUIから呼ぶ） */
export async function selectSource(plan: ImportPlan, index: number): Promise<void> {
  const source = plan.sources[index];
  if (source === undefined) throw new Error('import plan: spreadsheet source index is out of range');
  const revision = (sourceSelectionRevisions.get(plan) ?? 0) + 1;
  sourceSelectionRevisions.set(plan, revision);
  const tables = snapshotSheetTables(source.tables);
  if (source.validationFailure?.code === 'workbook-unreadable') {
    if (plan.allowBlockedLociMyuSource !== true) throw new Error(IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE);
    commitBlockedSourceSelection(plan, index, tables, source.validationFailure);
    return;
  }
  let migration: LociMyuMigration;
  try {
    migration = await analyzeLociMyuSheets(tables);
    delete source.validationFailure;
  } catch (error) {
    if (
      plan.allowBlockedLociMyuSource === true && source.captionCount > 0 &&
      (error instanceof LociMyuSourceValidationError || error instanceof LociMyuIdentityCollisionError)
    ) {
      if (sourceSelectionRevisions.get(plan) !== revision) {
        throw new Error('import plan: spreadsheet selection was superseded');
      }
      const failure = { code: error.code, message: error.message } as const;
      source.validationFailure = failure;
      commitBlockedSourceSelection(plan, index, tables, failure);
      return;
    }
    throw error;
  }
  if (sourceSelectionRevisions.get(plan) !== revision) {
    throw new Error('import plan: spreadsheet selection was superseded');
  }
  commitSourceSelection(plan, index, tables, migration);
}

function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

/** ZIPエントリ群を分類し、表形式データを解析する */
export async function buildImportPlan(
  entries: readonly ZipEntryData[],
  options: BuildImportPlanOptions = {},
): Promise<ImportPlan> {
  const plan: ImportPlan = {
    models: [],
    images: [],
    videos: [],
    tables: [],
    sources: [],
    selectedSourceIndex: 0,
    migration: null,
    fileIdMap: new Map(),
    fileIdMapRows: [],
    diagnostics: {
      archive: [],
      rejectedCandidates: [],
      selection: null,
      selectedSource: [],
    },
    warnings: [],
    ...(options.preserveBlockedLociMyuSource
      ? { allowBlockedLociMyuSource: true as const, blockedLociMyuSource: null }
      : {}),
  };

  for (const e of entries) {
    const name = baseName(e.path);
    if (name.startsWith('.') || name.startsWith('~$')) continue; // 隠しファイル・Excelロックファイル

    if (detectFormat(name, e.data) !== null) {
      plan.models.push({ path: e.path, name, data: e.data });
      continue;
    }
    if (IMAGE_EXT.test(name)) {
      plan.images.push({ path: e.path, name, data: e.data });
      continue;
    }
    if (VIDEO_EXT.test(name)) {
      plan.videos.push({ path: e.path, name, data: e.data });
      continue;
    }
    // 拡張子で判定できないものはマジックバイトで画像かを見る（拡張子なしHEIC等）。
    // ファイル名は変えない（fileId対応表CSVのDrive名=拡張子なしと突合するため）
    if (!/\.(xlsx|csv|txt|json|glb|gltf|obj|stl|ply)$/i.test(name) && sniffImageExt(e.data) !== null) {
      plan.images.push({ path: e.path, name, data: e.data });
      continue;
    }
    if (/\.xlsx$/i.test(name)) {
      try {
        if (!looksLikeXlsx(name, e.data)) throw new Error('not an XLSX ZIP container');
        const tables = await readXlsx(e.data);
        plan.sources.push({
          fileName: name,
          archivePath: e.path,
          sourceBytes: e.data,
          tables,
          looksLikeBackup: BACKUP_HINT.test(name),
          captionCount: countLociMyuCaptionSourceRows(tables),
        });
      } catch {
        plan.diagnostics.archive.push(`${name} を安全に読み取れませんでした`);
        if (options.preserveBlockedLociMyuSource && /locimyu/iu.test(name)) {
          plan.sources.push({
            fileName: name,
            archivePath: e.path,
            sourceBytes: e.data,
            tables: [],
            looksLikeBackup: BACKUP_HINT.test(name),
            captionCount: 0,
            validationFailure: {
              code: 'workbook-unreadable',
              message: 'The LociMyu workbook could not be decoded safely',
            },
          });
        }
      }
      continue;
    }
    if (/\.csv$/i.test(name)) {
      const rows = parseCsv(new TextDecoder().decode(e.data));
      // Caption CSVも先頭列が id なので、完全なCaption headerを先に判定する。
      // file-ID対応表は2列の見出しまで一致した場合だけauthority入力にする。
      const header = (rows[0] ?? []).map((h) => lociMyuTrimV1(h).toLowerCase());
      const isFileIdMap =
        (header[0] === 'fileid' || header[0] === 'id') &&
        header[1] === 'filename';
      const table: SheetTable = { name: name.replace(/\.csv$/i, ''), rows };
      if (isLociMyuCaptionSheet(rows)) {
        plan.sources.push({
          fileName: name,
          archivePath: e.path,
          sourceBytes: e.data,
          tables: [table],
          looksLikeBackup: BACKUP_HINT.test(name),
          captionCount: countLociMyuCaptionSourceRows([table]),
        });
      } else if (isFileIdMap) {
        for (const [index, row] of rows.slice(1).entries()) {
          const id = lociMyuTrimV1(row[0] ?? '');
          const fname = lociMyuTrimV1(row[1] ?? '');
          plan.fileIdMapRows!.push({
            archivePath: e.path,
            rowNumber: index + 2,
            fileId: id,
            fileName: fname,
          });
          if (id !== '' && fname !== '') plan.fileIdMap.set(id, fname);
        }
      } else {
        plan.sources.push({
          fileName: name,
          archivePath: e.path,
          sourceBytes: e.data,
          tables: [table],
          looksLikeBackup: BACKUP_HINT.test(name),
          captionCount: countLociMyuCaptionSourceRows([table]),
        });
      }
    }
  }

  if (plan.sources.length > 0) {
    // 全候補を同じauthority解析に通し、その実結果から既定を選ぶ。
    // 複数のスプレッドシートを同時に取り込むと、同じ旧IDのキャプションが
    // 二重に生成されて後勝ちで所属セットが壊れるため、必ず1つだけを採用する。
    type AnalyzedCandidate = {
      index: number;
      tables: SheetTable[];
      migration: LociMyuMigration;
      captionCount: number;
    };
    const compareCandidates = (left: AnalyzedCandidate, right: AnalyzedCandidate): number => {
      const leftRecognized = left.migration.sets.length > 0;
      const rightRecognized = right.migration.sets.length > 0;
      if (leftRecognized !== rightRecognized) return leftRecognized ? -1 : 1;
      const leftPopulated = left.captionCount > 0;
      const rightPopulated = right.captionCount > 0;
      if (leftPopulated !== rightPopulated) return leftPopulated ? -1 : 1;
      const leftBackup = plan.sources[left.index]!.looksLikeBackup;
      const rightBackup = plan.sources[right.index]!.looksLikeBackup;
      if (leftBackup !== rightBackup) return leftBackup ? 1 : -1;
      if (left.captionCount !== right.captionCount) return right.captionCount - left.captionCount;
      return left.index - right.index;
    };
    let best: AnalyzedCandidate | null = null;
    for (let candidateIndex = 0; candidateIndex < plan.sources.length; candidateIndex++) {
      const source = plan.sources[candidateIndex]!;
      const tables = snapshotSheetTables(source.tables);
      if (source.validationFailure?.code === 'workbook-unreadable') {
        plan.diagnostics.rejectedCandidates.push(
          `${source.fileName} は取り込めませんでした: ${source.validationFailure.message}`,
        );
        continue;
      }
      try {
        const migration = await analyzeLociMyuSheets(tables);
        delete source.validationFailure;
        const captionCount = migration.sets.reduce((count, set) => count + set.captions.length, 0);
        source.captionCount = captionCount;
        const candidate = { index: candidateIndex, tables, migration, captionCount };
        if (best === null || compareCandidates(candidate, best) < 0) best = candidate;
      } catch (error) {
        if (error instanceof LociMyuSourceValidationError) {
          source.validationFailure = { code: error.code, message: error.message };
          plan.diagnostics.rejectedCandidates.push(
            `${source.fileName} は取り込めませんでした: ${error.message}`,
          );
          continue;
        }
        if (options.preserveBlockedLociMyuSource && error instanceof LociMyuIdentityCollisionError) {
          const failure = { code: error.code, message: error.message } as const;
          source.validationFailure = failure;
          plan.diagnostics.rejectedCandidates.push(
            `${source.fileName} はidentity collisionのため変換を停止しました: ${error.message}`,
          );
          commitBlockedSourceSelection(plan, candidateIndex, tables, failure);
          return plan;
        }
        throw new Error(IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE, { cause: error });
      }
    }
    if (
      options.preserveBlockedLociMyuSource &&
      (best === null || best.migration.sets.length === 0)
    ) {
      const rejected = plan.sources
        .map((source, index) => ({ source, index }))
        .filter((candidate) => candidate.source.validationFailure !== undefined && (
          candidate.source.captionCount > 0 || candidate.source.validationFailure.code === 'workbook-unreadable'
        ))
        .sort((left, right) => {
          if (left.source.looksLikeBackup !== right.source.looksLikeBackup) {
            return left.source.looksLikeBackup ? 1 : -1;
          }
          if (left.source.captionCount !== right.source.captionCount) {
            return right.source.captionCount - left.source.captionCount;
          }
          return left.index - right.index;
        })[0];
      if (rejected !== undefined) {
        commitBlockedSourceSelection(
          plan,
          rejected.index,
          snapshotSheetTables(rejected.source.tables),
          rejected.source.validationFailure!,
        );
        return plan;
      }
    }
    if (best === null) {
      throw new Error(
        `取り込めるスプレッドシートがありません。${boundedDiagnosticsSummary(plan.diagnostics.rejectedCandidates)}`,
      );
    }
    commitSourceSelection(plan, best.index, best.tables, best.migration);
  } else {
    refreshImportPlanWarnings(plan);
  }
  return plan;
}

export interface ImportOptions {
  projectName: string;
  /** 画像リンク: captionId → 画像ファイル名（手動リンクUIの結果） */
  imageLinks?: Map<string, string>;
  /**
   * GLBの軽量版を生成する（ブラウザのみ）。原本は保持し、軽量版を別ファイルで保存する。
   * 縮小できなければnullを返す。テスト（Node）では未指定=軽量化しない。
   */
  optimizeModel?: (bytes: Uint8Array) => Promise<Uint8Array | null>;
  /** Pre-locked target supplied by the production project-session boundary. */
  targetDir?: string;
  targetManifest?: ProjectManifest;
}

export interface ImportResult {
  dir: string;
  projectId: string;
  captionCount: number;
  setCount: number;
  linkedImages: number;
  unlinkedImages: number;
  /** 無効化して取り込んだクロマキー設定の数（理由は下記コメント参照） */
  chromaDisabledCount: number;
}

/**
 * プランをワークスペースへ適用して新規プロジェクトを作る。
 * 全てのopは実行者のログへ記録される（移行の実行者が「取り込んだ人」になる）。
 */
export async function applyImportPlan(
  fs: ProjectWorkspaceFS,
  identity: Identity,
  plan: ImportPlan,
  opts: ImportOptions,
): Promise<ImportResult> {
  // Snapshot every caller-owned value before the first await. The wizard is a
  // one-shot consumer, so large source buffers are transferred into these
  // independent copies and released progressively after their verified write.
  const projectName = opts.projectName;
  const optimizeModel = opts.optimizeModel;
  const imageLinks = opts.imageLinks === undefined ? undefined : new Map(opts.imageLinks);
  const actionIdentity: Identity = {
    userId: identity.userId,
    deviceId: identity.deviceId,
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
  };
  const selectedTables = snapshotSheetTables(plan.tables);
  const fileIdMap = new Map(plan.fileIdMap);
  const models = snapshotForeignFiles(plan.models);
  const images = snapshotForeignFiles(plan.images);
  const videos = snapshotForeignFiles(plan.videos);

  // Rebuild identity from the selected raw tables. Caller-provided migration
  // objects are only previews and never authority for a workspace write.
  let analyzed: LociMyuMigration | null = null;
  try {
    analyzed = selectedTables.length === 0
      ? null
      : await analyzeLociMyuSheets(selectedTables);
  } catch (error) {
    if (error instanceof LociMyuSourceValidationError) throw error;
    throw new Error(IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE, { cause: error });
  }
  const migration = analyzed !== null && analyzed.sets.length > 0 ? analyzed : null;

  // The one-shot ownership transfer starts only after every identity check has
  // succeeded. On preflight failure all caller maps and buffers stay intact.
  releaseForeignFiles(plan.models);
  releaseForeignFiles(plan.images);
  releaseForeignFiles(plan.videos);
  plan.migration = null;
  plan.fileIdMap.clear();

  if ((opts.targetDir === undefined) !== (opts.targetManifest === undefined)) {
    throw new Error('wizard: targetDir and targetManifest must be supplied together');
  }
  const dir = opts.targetDir ?? `projects/${entityIdFor('meta')}`;
  const store = await ProjectStore.createUnpublished(
    fs,
    dir,
    projectName,
    actionIdentity,
    opts.targetManifest,
  );
  const assetWriteReceipts = new Map<string, AssetWriteReceipt>();
  const requiredOriginalPaths = new Set<string>();

  // ---- アセット（モデル・画像・映像）----------------------------------------
  const assetIdByName = new Map<string, string>();
  const writeAsset = async (f: ForeignFile, kind: 'model' | 'image' | 'video'): Promise<string> => {
    const astId = entityIdFor('asset');
    const originalBytes = new Uint8Array(f.data);
    // 拡張子が無い/不明な画像はマジックバイトで補う（保存パスと表示に拡張子が要るため）
    const nameExt = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : '';
    const ext = nameExt !== '' ? nameExt : (kind === 'image' ? sniffImageExt(originalBytes) ?? 'bin' : 'bin');
    const path = `${kind === 'model' ? 'models' : 'media'}/${astId}.${ext}`;
    const size = originalBytes.length;
    await writeVerifiedBytes(fs, `${dir}/${path}`, originalBytes);
    assetWriteReceipts.set(path, await assetWriteReceipt(originalBytes));
    requiredOriginalPaths.add(path);

    // GLBは軽量版を生成（原本は上で保存済み。表示は軽量版を使う=原本主義）
    let optimizedPath: string | undefined;
    let optimizedSize: number | undefined;
    if (kind === 'model' && optimizeModel !== undefined && ext === 'glb') {
      try {
        const opt = await optimizeModel(originalBytes);
        if (opt !== null) {
          const candidatePath = `models/${astId}.opt.glb`;
          const candidateBytes = new Uint8Array(opt);
          await writeVerifiedBytes(fs, `${dir}/${candidatePath}`, candidateBytes);
          assetWriteReceipts.set(candidatePath, await assetWriteReceipt(candidateBytes));
          optimizedPath = candidatePath;
          optimizedSize = candidateBytes.length;
        }
      } catch {
        // 軽量化に失敗しても原本で続行する
      }
    }

    // OPFSへ書いたら元データは手放す。iOSでは全アセットを同時に保持すると
    // メモリ上限を超えるため、書き込み済みのものから解放していく
    (f as { data: Uint8Array }).data = new Uint8Array(0);
    store.dispatch({
      t: 'create',
      e: 'asset',
      id: astId,
      v: {
        kind,
        path,
        originalName: f.name,
        mime: '',
        size,
        ...(optimizedPath !== undefined ? { optimizedPath, optimizedSize } : {}),
        ...(kind === 'model' ? { transform: { scale: 1, upAxis: 'Y' }, pinScale: 1 } : {}),
      },
    });
    assetIdByName.set(f.name, astId);
    return astId;
  };

  let firstModelId: string | null = null;
  for (const f of models) {
    const id = await writeAsset(f, 'model');
    if (firstModelId === null) firstModelId = id;
  }
  for (const f of images) await writeAsset(f, 'image');
  for (const f of videos) await writeAsset(f, 'video');

  // ---- 表示セット・キャプション ---------------------------------------------
  let captionCount = 0;
  let linkedImages = 0;
  let unlinkedImages = 0;
  let chromaDisabledCount = 0;
  const setIdByGid = new Map<string, string>();

  if (migration !== null) {
    // 既定セットは移行セットで置き換える（LociMyuのシート=セットをそのまま持ち込む）
    const defaultSets = Object.values(store.state.byKind.set ?? {});
    for (const s of defaultSets) store.dispatch({ t: 'delete', e: 'set', id: s.id });

    migration.sets.forEach((lmSet, order) => {
      const setId = entityIdFor('set');
      // ビュー・マテリアルはGoogle Sheetsのgidで参照するため、解決済みのlegacyGidで引く
      if (lmSet.legacyGid !== null) setIdByGid.set(lmSet.legacyGid, setId);
      store.dispatch({ t: 'create', e: 'set', id: setId, v: { name: lmSet.name, order: order + 1 } });

      for (const cap of lmSet.captions) {
        const attachments: string[] = [];
        if (cap.legacyImageFileId !== null) {
          // 1) 手動リンク 2) fileId対応表 の順で解決
          const linkedName =
            imageLinks?.get(cap.captionId) ?? fileIdMap.get(cap.legacyImageFileId);
          const astId = linkedName !== undefined ? assetIdByName.get(linkedName) : undefined;
          if (astId !== undefined) {
            attachments.push(astId);
            linkedImages++;
          } else {
            unlinkedImages++;
          }
        }
        store.dispatch({
          t: 'create',
          e: 'caption',
          id: cap.captionId,
          v: {
            setId,
            title: cap.title,
            body: cap.body,
            color: cap.color,
            tags: [],
            attachments,
            ...(cap.position !== null
              ? { anchor: { modelAssetId: firstModelId, position: cap.position } }
              : {}),
            // 旧参照は解決できるまで保持（手動リンクUIの材料）
            ...(cap.legacyImageFileId !== null && attachments.length === 0
              ? { legacyImageFileId: cap.legacyImageFileId }
              : {}),
          },
        });
        captionCount++;
      }
    });

    // ---- ビュー ----
    for (const v of migration.views) {
      const setId = setIdByGid.get(v.sheetGid) ?? [...setIdByGid.values()][0];
      if (setId === undefined) continue;
      store.dispatch({
        t: 'create',
        e: 'view',
        id: entityIdFor('view'),
        v: {
          setId,
          name: v.name,
          cameraState: v.cameraState,
          background: v.bgColor ?? '',
        },
      });
    }

    // ---- マテリアル設定 ----
    for (const m of migration.materials) {
      const setId = setIdByGid.get(m.sheetGid) ?? [...setIdByGid.values()][0];
      // モデルが同梱されていなくても設定は捨てず、modelAssetId=null で保持する
      // （後からモデルを追加したときに再割り当てできる）
      if (setId === undefined) continue;
      store.dispatch({
        t: 'create',
        e: 'material',
        id: entityIdFor('material'),
        v: {
          setId,
          modelAssetId: firstModelId,
          // LociMyuのキーはマテリアル表示名。LociViewの決定的キー（m/<nodePath>/<slot>）
          // とは形式が違うため、ビューア側が表示名でも解決できるようにしている（docs/04 §4）
          materialKey: m.materialKey,
          opacity: m.opacity,
          doubleSided: m.doubleSided,
          unlit: m.unlitLike,
          // クロマキーはLociMyuでは実際には描画に反映されていなかった（シェーダの
          // 適用位置の誤りで透過が効かなかった。docs/04 §6.5）。LociViewでは正しく
          // 効くため、そのまま有効化すると当時の見え方と変わってしまう。
          // 設定値は保持したうえで無効の状態で取り込み、UIから有効化できるようにする。
          ...(m.chroma !== null ? { chroma: { ...m.chroma, enable: false } } : {}),
          legacyKey: true,
        },
      });
      if (m.chroma !== null) chromaDisabledCount++;
    }
  }

  await store.flush();
  const referencedPaths = new Set<string>();
  for (const asset of visibleEntities(store.state, 'asset')) {
    const path = asset.fields.path;
    const size = asset.fields.size;
    if (
      typeof path !== 'string' ||
      path.length === 0 ||
      !Number.isSafeInteger(size) ||
      Number(size) < 0
    ) {
      throw new Error(`wizard: invalid asset authority for ${asset.id}`);
    }
    const expected = assetWriteReceipts.get(path);
    const stored = await fs.readBytes(`${dir}/${path}`);
    if (
      expected === undefined ||
      expected.byteLength !== size ||
      stored === null ||
      stored.length !== expected.byteLength ||
      !bytesEqual((await assetWriteReceipt(stored)).sha256, expected.sha256)
    ) {
      throw new Error(`wizard: asset verification failed for ${path}`);
    }
    referencedPaths.add(path);

    const optimizedPath = asset.fields.optimizedPath;
    const optimizedSize = asset.fields.optimizedSize;
    if (optimizedPath === undefined && optimizedSize === undefined) continue;
    if (
      typeof optimizedPath !== 'string' ||
      optimizedPath.length === 0 ||
      !Number.isSafeInteger(optimizedSize) ||
      Number(optimizedSize) < 0
    ) {
      throw new Error(`wizard: invalid optimized asset authority for ${asset.id}`);
    }
    const expectedOptimized = assetWriteReceipts.get(optimizedPath);
    const storedOptimized = await fs.readBytes(`${dir}/${optimizedPath}`);
    if (
      expectedOptimized === undefined ||
      expectedOptimized.byteLength !== optimizedSize ||
      storedOptimized === null ||
      storedOptimized.length !== expectedOptimized.byteLength ||
      !bytesEqual((await assetWriteReceipt(storedOptimized)).sha256, expectedOptimized.sha256)
    ) {
      throw new Error(`wizard: optimized asset verification failed for ${optimizedPath}`);
    }
    referencedPaths.add(optimizedPath);
  }
  if ([...requiredOriginalPaths].some((path) => !referencedPaths.has(path))) {
    throw new Error('wizard: planned original asset is not referenced by durable metadata');
  }
  await writeVerifiedBytes(
    fs,
    `${dir}/lociview.json`,
    encoder.encode(JSON.stringify(store.manifest, null, 2)),
  );
  return {
    dir,
    projectId: store.manifest.projectId,
    captionCount,
    setCount: migration?.sets.length ?? 1,
    linkedImages,
    unlinkedImages,
    chromaDisabledCount,
  };
}
