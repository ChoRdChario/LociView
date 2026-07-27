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
