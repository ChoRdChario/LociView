// Viewsタブ — ビュープリセット・±XYZ・背景色（LociMyu継承。平行投影はPhase 2）

import { el, clear } from '../dom';
import { fNum, fStr } from '../fields';
import type { AppContext } from '../context';
import type { CameraState } from '../../viewer/viewer';

export function applyViewRecordToViewer(ctx: AppContext, viewId: string): void {
  const rec = ctx.state.byKind.view?.[viewId];
  if (rec === undefined) return;
  const cam = rec.fields.cameraState;
  if (typeof cam === 'object' && cam !== null) {
    ctx.viewer.setCameraState(cam as CameraState);
  }
  const bg = rec.fields.background;
  ctx.viewer.setBackground(typeof bg === 'string' && bg !== '' ? bg : null);
}

export function mountViewsTab(container: HTMLElement, ctx: AppContext): () => void {
  const presetList = el('div', { class: 'lv-grp' });

  const bgInput = el('input', {
    type: 'color', value: '#0b0d11',
    oninput: (ev) => ctx.viewer.setBackground((ev.target as HTMLInputElement).value),
  }) as HTMLInputElement;

  const orthoCheck = el('input', {
    type: 'checkbox',
    onchange: (ev) => ctx.viewer.setOrthographic((ev.target as HTMLInputElement).checked),
  }) as HTMLInputElement;

  // ピンサイズ: 即時反映はinput、opとしての保存はchange（ドラッグ完了時に1op）
  const pinScaleSlider = el('input', {
    'data-project-mutation': '',
    type: 'range', min: '0.3', max: '3', step: '0.1', value: '1',
    'aria-label': 'ピンの大きさ',
    oninput: (ev) => ctx.viewer.setPinScale(Number((ev.target as HTMLInputElement).value)),
    onchange: (ev) => {
      const assetId = ctx.ui.activeModelAssetId;
      if (assetId === null) return;
      ctx.undo.update('asset', assetId, { pinScale: Number((ev.target as HTMLInputElement).value) });
    },
  }) as HTMLInputElement;

  const axes: Array<'+x' | '-x' | '+y' | '-y' | '+z' | '-z'> = ['+x', '-x', '+y', '-y', '+z', '-z'];

  container.append(
    el('div', { class: 'lv-row lv-space' },
      el('div', { class: 'lv-hint' }, 'ビュープリセット（表示セットごと）'),
      el('button', {
        'data-project-mutation': '',
        class: 'primary',
        onclick: () => {
          const n = ctx.views().length + 1;
          ctx.undo.create('view', {
            setId: ctx.ui.activeSetId,
            name: `ビュー ${n}`,
            cameraState: ctx.viewer.getCameraState(),
            background: ctx.viewer.getBackground() ?? '',
          });
        },
      }, 'ビューを保存'),
    ),
    presetList,
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, '投影方法'),
      el('label', { class: 'lv-row' }, orthoCheck, ' 平行投影（Orthographic）'),
      el('div', { class: 'lv-dim' }, '遠近感をなくし、寸法比較や図面的な確認に向いた表示になります'),
    ),
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, 'カメラ方向'),
      el('div', { class: 'lv-axis-grid' },
        ...axes.map((a) => el('button', { onclick: () => ctx.viewer.viewAxis(a) }, a.toUpperCase())),
      ),
      el('button', { onclick: () => ctx.viewer.fitCamera() }, '全体表示'),
    ),
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, '背景色'),
      el('div', { class: 'lv-row' },
        bgInput,
        el('button', { onclick: () => ctx.viewer.setBackground(null) }, 'リセット'),
      ),
    ),
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, 'ピンの大きさ（モデルごとにプロジェクトへ保存・全員に共有）'),
      pinScaleSlider,
    ),
  );

  function render(): void {
    const asset = ctx.asset(ctx.ui.activeModelAssetId);
    if (asset !== null && document.activeElement !== pinScaleSlider) {
      pinScaleSlider.value = String(fNum(asset, 'pinScale', 1));
    }
    orthoCheck.checked = ctx.viewer.isOrtho();
    clear(presetList);
    const views = ctx.views();
    if (views.length === 0) {
      presetList.append(el('div', { class: 'lv-dim lv-pad' }, '保存済みビューはありません'));
      return;
    }
    for (const v of views) {
      presetList.append(
        el('div', { class: 'lv-cap-row' },
          el('span', { class: 'lv-cap-title' }, fStr(v, 'name', '(無名ビュー)')),
          el('button', { class: 'mini', onclick: () => applyViewRecordToViewer(ctx, v.id) }, '適用'),
          el('button', { 'data-project-mutation': '', class: 'mini danger', onclick: () => ctx.undo.delete('view', v.id) }, '削除'),
        ),
      );
    }
  }

  render();
  return render;
}
