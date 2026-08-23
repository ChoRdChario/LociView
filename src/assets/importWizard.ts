// Drive フォルダZIP のインポートウィザード (docs/02 §6.2, FR-02)
//
// 受け取るもの: Google Drive のフォルダをZIPダウンロードした中身
//   - スプレッドシート → .xlsx に変換されて同梱される
//   - GLB等のモデル、画像群はそのまま
// 判定して LociView プロジェクトを新規作成する。LociMyuスキーマなら移行モードで
// 表示セット・ビュー・マテリアル設定まで引き継ぐ。

import { entityIdFor, ProjectStore, type Identity } from '../core/store';
import { visibleEntities } from '../core/reduce';
import {
  analyzeLociMyuSheets,
  isLociMyuCaptionSheet,
  type LociMyuMigration,
  type SheetTable,
} from '../io/locimyu';
import { parseCsv } from '../io/csv';
import { looksLikeXlsx, readXlsx } from '../io/xlsx';
import type { WorkspaceFS } from '../platform/fs';
import { detectFormat } from '../viewer/loaders';
import { writeVerifiedBytes } from './verifiedWrite';
import type { ZipEntryData } from './zipio';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
const encoder = new TextEncoder();

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

function takeForeignFileSnapshot(files: readonly ForeignFile[]): ForeignFile[] {
  return files.map((file) => {
    const snapshot = {
      path: file.path,
      name: file.name,
      data: new Uint8Array(file.data),
    };
    // applyImportPlan is a one-shot ownership transfer. Clearing each source as
    // it is copied keeps the caller and action buffers from doubling peak use.
    (file as { data: Uint8Array }).data = new Uint8Array(0);
    return snapshot;
  });
}

/** 1つのスプレッドシート（xlsx/csv）ファイル由来のシート群 */
export interface SpreadsheetSource {
  /** ZIP内のファイル名 */
  fileName: string;
  tables: SheetTable[];
  /** バックアップと推定されるか（ファイル名に backup/コピー 等を含む） */
  looksLikeBackup: boolean;
  captionCount: number;
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
  warnings: string[];
}

const BACKUP_HINT = /(backup|バックアップ|コピー|copy|_old|旧)/i;

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
  // ISO-BMFF: ....ftyp[heic|heif|heix|hevc|mif1|msf1]
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (/hei|hev|mif1|msf1/.test(brand)) return 'heic';
  }
  return null;
}

/** 採用するスプレッドシートを切り替える（ウィザードのUIから呼ぶ） */
export function selectSource(plan: ImportPlan, index: number): void {
  const source = plan.sources[index];
  if (source === undefined) return;
  plan.selectedSourceIndex = index;
  plan.tables = source.tables;
  plan.warnings = plan.warnings.filter((w) => !w.startsWith('シート「'));
  const migration = analyzeLociMyuSheets(plan.tables);
  plan.migration = migration.sets.length > 0 ? migration : null;
  if (plan.migration !== null) plan.warnings.push(...migration.warnings);
}

function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

/** ZIPエントリ群を分類し、表形式データを解析する */
export async function buildImportPlan(entries: readonly ZipEntryData[]): Promise<ImportPlan> {
  const plan: ImportPlan = {
    models: [],
    images: [],
    videos: [],
    tables: [],
    sources: [],
    selectedSourceIndex: 0,
    migration: null,
    fileIdMap: new Map(),
    warnings: [],
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
    if (looksLikeXlsx(name, e.data)) {
      try {
        const tables = await readXlsx(e.data);
        plan.sources.push({
          fileName: name,
          tables,
          looksLikeBackup: BACKUP_HINT.test(name),
          captionCount: countCaptions(tables),
        });
      } catch (err) {
        plan.warnings.push(`${name} を読めませんでした: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }
    if (/\.csv$/i.test(name)) {
      const rows = parseCsv(new TextDecoder().decode(e.data));
      // fileId対応表かどうかを判定（1列目がDrive fileId風の長い英数字）
      const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
      if (header[0] === 'fileid' || header[0] === 'id') {
        for (const row of rows.slice(1)) {
          const id = (row[0] ?? '').trim();
          const fname = (row[1] ?? '').trim();
          if (id !== '' && fname !== '') plan.fileIdMap.set(id, fname);
        }
      } else {
        plan.sources.push({
          fileName: name,
          tables: [{ name: name.replace(/\.csv$/i, ''), rows }],
          looksLikeBackup: BACKUP_HINT.test(name),
          captionCount: countCaptions([{ name, rows }]),
        });
      }
    }
  }

  if (plan.sources.length > 0) {
    // 既定は「バックアップでない・キャプションが多い」もの。
    // 複数のスプレッドシートを同時に取り込むと、同じ旧IDのキャプションが
    // 二重に生成されて後勝ちで所属セットが壊れるため、必ず1つだけを採用する。
    let best = 0;
    plan.sources.forEach((s, i) => {
      const cur = plan.sources[best]!;
      const better =
        (cur.looksLikeBackup && !s.looksLikeBackup) ||
        (cur.looksLikeBackup === s.looksLikeBackup && s.captionCount > cur.captionCount);
      if (better) best = i;
    });
    selectSource(plan, best);
    if (plan.sources.length > 1) {
      plan.warnings.push(
        `スプレッドシートが${plan.sources.length}個見つかりました。「${plan.sources[best]!.fileName}」を使用します（取込前に切り替えられます）`,
      );
    }
  }
  return plan;
}

function countCaptions(tables: readonly SheetTable[]): number {
  let n = 0;
  for (const t of tables) {
    if (isLociMyuCaptionSheet(t.rows)) n += Math.max(0, t.rows.length - 1);
  }
  return n;
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
  fs: WorkspaceFS,
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
  const migration = plan.migration === null ? null : structuredClone(plan.migration);
  const fileIdMap = new Map(plan.fileIdMap);
  const models = takeForeignFileSnapshot(plan.models);
  const images = takeForeignFileSnapshot(plan.images);
  const videos = takeForeignFileSnapshot(plan.videos);
  plan.migration = null;
  plan.fileIdMap.clear();

  const dir = `projects/${entityIdFor('meta')}`;
  const store = await ProjectStore.createUnpublished(fs, dir, projectName, actionIdentity);
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
