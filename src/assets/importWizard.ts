// Drive フォルダZIP のインポートウィザード (docs/02 §6.2, FR-02)
//
// 受け取るもの: Google Drive のフォルダをZIPダウンロードした中身
//   - スプレッドシート → .xlsx に変換されて同梱される
//   - GLB等のモデル、画像群はそのまま
// 判定して LociView プロジェクトを新規作成する。LociMyuスキーマなら移行モードで
// 表示セット・ビュー・マテリアル設定まで引き継ぐ。

import { entityIdFor, ProjectStore, type Identity } from '../core/store';
import { analyzeLociMyuSheets, type LociMyuMigration, type SheetTable } from '../io/locimyu';
import { parseCsv } from '../io/csv';
import { looksLikeXlsx, readXlsx } from '../io/xlsx';
import type { WorkspaceFS } from '../platform/fs';
import { detectFormat } from '../viewer/loaders';
import type { ZipEntryData } from './zipio';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

export interface ForeignFile {
  path: string;
  name: string;
  data: Uint8Array;
}

export interface ImportPlan {
  models: ForeignFile[];
  images: ForeignFile[];
  videos: ForeignFile[];
  tables: SheetTable[];
  /** LociMyu形式が検出された場合の移行内容 */
  migration: LociMyuMigration | null;
  /** fileId→filename 対応表（あれば未リンク画像を自動解決できる） */
  fileIdMap: Map<string, string>;
  warnings: string[];
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
    if (looksLikeXlsx(name, e.data)) {
      try {
        plan.tables.push(...(await readXlsx(e.data)));
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
        plan.tables.push({ name: name.replace(/\.csv$/i, ''), rows });
      }
    }
  }

  if (plan.tables.length > 0) {
    const migration = analyzeLociMyuSheets(plan.tables);
    if (migration.sets.length > 0) {
      plan.migration = migration;
      plan.warnings.push(...migration.warnings);
    }
  }
  return plan;
}

export interface ImportOptions {
  projectName: string;
  /** 画像リンク: captionId → 画像ファイル名（手動リンクUIの結果） */
  imageLinks?: Map<string, string>;
}

export interface ImportResult {
  dir: string;
  projectId: string;
  captionCount: number;
  setCount: number;
  linkedImages: number;
  unlinkedImages: number;
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
  const dir = `projects/${entityIdFor('meta')}`;
  const store = await ProjectStore.create(fs, dir, opts.projectName, identity);

  // ---- アセット（モデル・画像・映像）----------------------------------------
  const assetIdByName = new Map<string, string>();
  const writeAsset = async (f: ForeignFile, kind: 'model' | 'image' | 'video'): Promise<string> => {
    const astId = entityIdFor('asset');
    const ext = (f.name.split('.').pop() ?? 'bin').toLowerCase();
    const path = `${kind === 'model' ? 'models' : 'media'}/${astId}.${ext}`;
    await fs.writeBytes(`${dir}/${path}`, f.data);
    store.dispatch({
      t: 'create',
      e: 'asset',
      id: astId,
      v: {
        kind,
        path,
        originalName: f.name,
        mime: '',
        size: f.data.length,
        ...(kind === 'model' ? { transform: { scale: 1, upAxis: 'Y' }, pinScale: 1 } : {}),
      },
    });
    assetIdByName.set(f.name, astId);
    return astId;
  };

  let firstModelId: string | null = null;
  for (const f of plan.models) {
    const id = await writeAsset(f, 'model');
    if (firstModelId === null) firstModelId = id;
  }
  for (const f of plan.images) await writeAsset(f, 'image');
  for (const f of plan.videos) await writeAsset(f, 'video');

  // ---- 表示セット・キャプション ---------------------------------------------
  let captionCount = 0;
  let linkedImages = 0;
  let unlinkedImages = 0;
  const setIdByGid = new Map<string, string>();

  if (plan.migration !== null) {
    // 既定セットは移行セットで置き換える（LociMyuのシート=セットをそのまま持ち込む）
    const defaultSets = Object.values(store.state.byKind.set ?? {});
    for (const s of defaultSets) store.dispatch({ t: 'delete', e: 'set', id: s.id });

    plan.migration.sets.forEach((lmSet, order) => {
      const setId = entityIdFor('set');
      setIdByGid.set(lmSet.gid, setId);
      store.dispatch({ t: 'create', e: 'set', id: setId, v: { name: lmSet.name, order: order + 1 } });

      for (const cap of lmSet.captions) {
        const attachments: string[] = [];
        if (cap.legacyImageFileId !== null) {
          // 1) 手動リンク 2) fileId対応表 の順で解決
          const linkedName =
            opts.imageLinks?.get(cap.captionId) ?? plan.fileIdMap.get(cap.legacyImageFileId);
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
    for (const v of plan.migration.views) {
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
    for (const m of plan.migration.materials) {
      const setId = setIdByGid.get(m.sheetGid) ?? [...setIdByGid.values()][0];
      if (setId === undefined || firstModelId === null) continue;
      store.dispatch({
        t: 'create',
        e: 'material',
        id: entityIdFor('material'),
        v: {
          setId,
          modelAssetId: firstModelId,
          materialKey: m.materialKey,
          opacity: m.opacity,
          doubleSided: m.doubleSided,
          unlitLike: m.unlitLike,
          ...(m.chroma !== null ? { chroma: m.chroma } : {}),
          // LociMyuのキーは表示名ベース。LociViewの決定的キーとは異なるため、
          // 適用は「名前一致」で試み、外れたら再割り当てUIで解決する（docs/04 §4）
          legacyKey: true,
        },
      });
    }
  }

  await store.flush();
  return {
    dir,
    projectId: store.manifest.projectId,
    captionCount,
    setCount: plan.migration?.sets.length ?? 1,
    linkedImages,
    unlinkedImages,
  };
}
