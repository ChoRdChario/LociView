// Modelタブ — モデル一覧・表示切替・transform（スケール/上軸）・点サイズ・統計
// モデルの追加（入出力）はデータタブ側（コンセンサスQ2の機能群分離）

import { el, clear, fmtBytes } from '../dom';
import { fNum, fStr } from '../fields';
import type { AppContext } from '../context';
import { confirmDialog, infoDialog } from '../dialogs';
import { replaceModelAsset } from '../../assets/modelAsset';
import { detectFormat } from '../../viewer/loaders';

function detectFormatSafe(name: string, bytes: Uint8Array): boolean {
  return detectFormat(name, bytes) !== null;
}

/** これを超えるモデルは表示前に確認する（iOSのメモリ不足でタブが落ちるのを防ぐ） */
const LARGE_MODEL_BYTES = 25 * 1024 * 1024;

export interface ModelTabDeps {
  /** アセットをビューアへ読み込む（app層が実装。activeModelAssetId更新も担当） */
  loadModelAsset: (assetId: string) => Promise<void>;
}

export function mountModelTab(container: HTMLElement, ctx: AppContext, deps: ModelTabDeps): () => void {
  async function loadWithGuard(assetId: string, size: number): Promise<void> {
    if (size > LARGE_MODEL_BYTES) {
      const ok = await confirmDialog(
        'モデルを表示しますか？',
        `このモデルは ${fmtBytes(size)} と大きめです。端末のメモリが不足すると、` +
          '表示中に画面が再読み込みされることがあります。表示しますか？',
      );
      if (!ok) return;
    }
    await deps.loadModelAsset(assetId);
  }

  const listEl = el('div', { class: 'lv-grp' });
  const detailEl = el('div', { class: 'lv-grp' });
  container.append(
    el('div', { class: 'lv-hint' }, 'プロジェクト内のモデル（追加はデータタブから）'),
    listEl,
    detailEl,
  );

  function transformOf(assetId: string): { scale: number; upAxis: 'Y' | 'Z' } {
    const asset = ctx.asset(assetId);
    const t = asset?.fields.transform;
    if (typeof t === 'object' && t !== null && !Array.isArray(t)) {
      const o = t as Record<string, unknown>;
      return {
        scale: typeof o.scale === 'number' && o.scale > 0 ? o.scale : 1,
        upAxis: o.upAxis === 'Z' ? 'Z' : 'Y',
      };
    }
    return { scale: 1, upAxis: 'Y' };
  }

  function render(): void {
    clear(listEl);
    const models = ctx.modelAssets();
    if (models.length === 0) {
      listEl.append(el('div', { class: 'lv-dim lv-pad' }, 'モデルがありません。データタブの「モデル追加」から読み込んでください。'));
    }
    for (const m of models) {
      const loaded = m.id === ctx.ui.loadedModelAssetId;
      const optSize = fNum(m, 'optimizedSize', 0);
      // 軽量版があれば、それを表示に使う（サイズ表示も軽量版の大きさで判定）
      const sizeText = optSize > 0
        ? `${fmtBytes(optSize)}（軽量版・原本${fmtBytes(fNum(m, 'size', 0))}）`
        : fmtBytes(fNum(m, 'size', 0));
      const effSize = optSize > 0 ? optSize : fNum(m, 'size', 0);
      listEl.append(
        el('div', { class: `lv-cap-row${loaded ? ' sel' : ''}` },
          el('span', { class: 'lv-cap-title' }, fStr(m, 'originalName', '(名称不明)')),
          el('span', { class: 'lv-dim' }, sizeText),
          loaded
            ? el('span', { class: 'lv-badge' }, '表示中')
            : el('button', { class: 'mini', onclick: () => void loadWithGuard(m.id, effSize) }, '表示'),
        ),
      );
    }

    clear(detailEl);
    // 調整対象は「実際に描画中」のモデル（transformの反映先と一致させる）
    const activeId = ctx.ui.loadedModelAssetId;
    const model = ctx.viewer.model;
    if (activeId === null || model === null) return;
    const t = transformOf(activeId);

    const scaleInput = el('input', {
      type: 'number', step: '0.001', min: '0.000001', value: String(t.scale),
      onchange: (ev) => {
        const v = Number((ev.target as HTMLInputElement).value);
        if (!Number.isFinite(v) || v <= 0) return;
        ctx.undo.update('asset', activeId, { transform: { ...t, scale: v } });
        ctx.viewer.setModelTransform({ scale: v, upAxis: t.upAxis });
      },
    });
    const upSelect = el('select', {
      onchange: (ev) => {
        const v = (ev.target as HTMLSelectElement).value === 'Z' ? 'Z' : 'Y';
        ctx.undo.update('asset', activeId, { transform: { ...t, upAxis: v } });
        ctx.viewer.setModelTransform({ scale: t.scale, upAxis: v });
      },
    }) as HTMLSelectElement;
    upSelect.append(el('option', { value: 'Y' }, 'Y-up（glTF標準）'), el('option', { value: 'Z' }, 'Z-up（STL/CAD系）'));
    upSelect.value = t.upAxis;

    const s = model.stats;
    detailEl.append(
      el('div', { class: 'lv-hint' }, '表示調整（原本は変更されません。調整は共有・マージされます）'),
      el('label', { class: 'lv-row' }, 'スケール ', scaleInput),
      el('label', { class: 'lv-row' }, '上方向 ', upSelect),
    );
    if (s.points > 0) {
      const pointScale = el('input', {
        type: 'range', min: '0.2', max: '5', step: '0.1', value: '1',
        oninput: (ev) => ctx.viewer.setPointScale(Number((ev.target as HTMLInputElement).value)),
      });
      detailEl.append(el('div', { class: 'lv-hint' }, '点サイズ'), pointScale);
    }
    detailEl.append(
      el('div', { class: 'lv-dim' },
        `頂点 ${s.vertices.toLocaleString()} / 三角形 ${s.triangles.toLocaleString()} / 点 ${s.points.toLocaleString()} / マテリアル ${model.materials.length}`),
    );
    if (model.warnings.length > 0) {
      detailEl.append(el('div', { class: 'lv-warn' }, `⚠ ${model.warnings.join(' / ')}`));
    }

    // ---- モデル差し替え ----
    const replaceInput = el('input', {
      type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply', style: 'display:none',
    }) as HTMLInputElement;
    replaceInput.addEventListener('change', () => {
      const file = replaceInput.files?.[0];
      if (file !== undefined) void doReplace(activeId, file);
      replaceInput.value = '';
    });
    detailEl.append(
      el('div', { class: 'lv-grp' },
        el('div', { class: 'lv-hint' }, 'モデルの差し替え'),
        el('div', { class: 'lv-row' },
          el('button', { onclick: () => replaceInput.click() }, '別のモデルに差し替え'),
          replaceInput,
        ),
        el('div', { class: 'lv-dim' }, 'ピン・キャプションは同じ位置に残ります。マテリアルの見え方は差し替え後に確認してください。'),
      ),
    );
  }

  async function doReplace(assetId: string, file: File): Promise<void> {
    const ok = await confirmDialog(
      'モデルを差し替え',
      `現在のモデルを「${file.name}」に差し替えます。ピン・キャプションはそのまま残り、` +
        '3Dモデルだけが新しくなります（マテリアルの見え方は差し替え後に再確認してください）。よろしいですか？',
    );
    if (!ok) return;
    const busy = el('div', { class: 'lv-dim lv-pad' }, '差し替え中…（軽量版の生成に少し時間がかかります）');
    detailEl.append(busy);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (detectFormatSafe(file.name, bytes) === false) {
        await infoDialog('差し替え', `対応していない形式です: ${file.name}（GLB/OBJ/STL/PLY）`);
        return;
      }
      await replaceModelAsset(ctx.fs, ctx.dir, ctx.store, assetId, file.name, bytes);
      await deps.loadModelAsset(assetId); // 新しいGLBを描画し直す
      ctx.syncMaterials();
      ctx.notify();
    } catch (e) {
      await infoDialog('差し替え失敗', e instanceof Error ? e.message : String(e));
    } finally {
      busy.remove();
    }
  }

  render();
  return render;
}
