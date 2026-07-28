// モデルアセットの追加（原本保存 + GLB軽量版の生成）
// 取り込みウィザード以外の経路（データタブ・モデル単体ドロップ）で共通利用する。

import { entityIdFor, type ProjectStore } from '../core/store';
import type { WorkspaceFS } from '../platform/fs';
import { optimizeGlbBytes } from './glbOptimize';

/**
 * モデルをOPFSへ保存し、asset を登記する。GLBはテクスチャ縮小した軽量版も生成して
 * `optimizedPath` に持たせる（原本は無改変で保持）。返り値は assetId。
 */
export async function addModelAsset(
  fs: WorkspaceFS,
  dir: string,
  store: ProjectStore,
  name: string,
  bytes: Uint8Array,
): Promise<string> {
  const astId = entityIdFor('asset');
  const ext = (name.split('.').pop() ?? 'bin').toLowerCase();
  const path = `models/${astId}.${ext}`;
  await fs.writeBytes(`${dir}/${path}`, bytes);

  let optimizedPath: string | undefined;
  let optimizedSize: number | undefined;
  if (ext === 'glb') {
    try {
      const opt = await optimizeGlbBytes(bytes);
      if (opt !== null) {
        optimizedPath = `models/${astId}.opt.glb`;
        optimizedSize = opt.length;
        await fs.writeBytes(`${dir}/${optimizedPath}`, opt);
      }
    } catch {
      // 軽量化に失敗しても原本で続行する
    }
  }

  store.dispatch({
    t: 'create',
    e: 'asset',
    id: astId,
    v: {
      kind: 'model',
      path,
      originalName: name,
      mime: '',
      size: bytes.length,
      ...(optimizedPath !== undefined ? { optimizedPath, optimizedSize } : {}),
      transform: { scale: 1, upAxis: 'Y' },
      pinScale: 1,
    },
  });
  return astId;
}

/**
 * 既存モデルアセットの実体GLBだけを差し替える。アセットID・キャプション紐付け・
 * transform・pinScale は保持し、ファイル実体と軽量版・サイズ・名前のみ更新する。
 * キャプションやマテリアル設定は modelAssetId で紐づくため、そのまま追従する。
 */
export async function replaceModelAsset(
  fs: WorkspaceFS,
  dir: string,
  store: ProjectStore,
  assetId: string,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  const asset = store.state.byKind.asset?.[assetId];
  if (asset === undefined) throw new Error(`replaceModelAsset: asset not found: ${assetId}`);
  const oldPath = typeof asset.fields.path === 'string' ? asset.fields.path : '';
  const oldOpt = typeof asset.fields.optimizedPath === 'string' ? asset.fields.optimizedPath : '';

  const ext = (name.split('.').pop() ?? 'bin').toLowerCase();
  // 実体は毎回ユニーク名で書く（旧ファイルとの取り違え・キャッシュを避ける）
  const stamp = Date.now().toString(36);
  const path = `models/${assetId}.${stamp}.${ext}`;
  await fs.writeBytes(`${dir}/${path}`, bytes);

  let optimizedPath = '';
  let optimizedSize = 0;
  if (ext === 'glb') {
    try {
      const opt = await optimizeGlbBytes(bytes);
      if (opt !== null) {
        optimizedPath = `models/${assetId}.${stamp}.opt.glb`;
        optimizedSize = opt.length;
        await fs.writeBytes(`${dir}/${optimizedPath}`, opt);
      }
    } catch {
      // 軽量化に失敗しても原本で続行する
    }
  }

  // 更新op: 実体・名前・サイズ・軽量版のみ。transform/pinScaleは保持（見た目調整を維持）
  store.dispatch({
    t: 'update',
    e: 'asset',
    id: assetId,
    v: { path, originalName: name, size: bytes.length, optimizedPath, optimizedSize },
  });

  // 旧ファイルは削除（差し替えなので原本は残さない）
  if (oldPath !== '' && oldPath !== path) await fs.remove(`${dir}/${oldPath}`);
  if (oldOpt !== '' && oldOpt !== optimizedPath) await fs.remove(`${dir}/${oldOpt}`);
}
