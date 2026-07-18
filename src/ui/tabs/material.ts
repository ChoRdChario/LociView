// Materialタブ — per-material不透明度・両面（LociMyu継承。unlit/クロマキーはPhase 2）
// 設定は (setId, modelAssetId, materialKey) 単位のmaterialエンティティに保存（docs/02 §5）

import { el, clear } from '../dom';
import { fStr } from '../fields';
import type { AppContext } from '../context';

export function mountMaterialTab(container: HTMLElement, ctx: AppContext): () => void {
  let selectedKey = '';

  const select = el('select', {
    onchange: (ev) => {
      selectedKey = (ev.target as HTMLSelectElement).value;
      render();
    },
  }) as HTMLSelectElement;

  const controls = el('div', { class: 'lv-grp' });

  container.append(
    el('div', { class: 'lv-hint' }, 'マテリアル別の表示調整（表示セットごとに保存されます）'),
    select,
    controls,
    el('div', { class: 'lv-row' },
      el('button', {
        onclick: () => {
          // このセット×モデルの設定を全削除して既定へ
          for (const m of ctx.materialSettings()) ctx.undo.delete('material', m.id);
          ctx.syncMaterials();
          ctx.notify();
        },
      }, 'このセットの調整を全リセット'),
    ),
    el('div', { class: 'lv-hint lv-dim' }, 'Unlit・クロマキーはPhase 2で追加予定'),
  );

  function findSetting(key: string): { id: string; opacity: number; doubleSided: boolean } | null {
    for (const m of ctx.materialSettings()) {
      if (fStr(m, 'materialKey') === key) {
        return {
          id: m.id,
          opacity: typeof m.fields.opacity === 'number' ? (m.fields.opacity as number) : 1,
          doubleSided: m.fields.doubleSided === true,
        };
      }
    }
    return null;
  }

  function persist(key: string, patch: { opacity?: number; doubleSided?: boolean }): void {
    const existing = findSetting(key);
    if (existing !== null) {
      ctx.undo.update('material', existing.id, patch);
    } else {
      ctx.undo.create('material', {
        setId: ctx.ui.activeSetId,
        modelAssetId: ctx.ui.activeModelAssetId,
        materialKey: key,
        opacity: 1,
        doubleSided: false,
        ...patch,
      });
    }
  }

  function render(): void {
    const model = ctx.viewer.model;
    clear(select);
    select.append(el('option', { value: '' }, model === null ? '（モデル未読込）' : '— マテリアルを選択 —'));
    if (model !== null) {
      for (const entry of model.materials) {
        const opt = el('option', { value: entry.key }, entry.name);
        if (entry.key === selectedKey) opt.setAttribute('selected', '');
        select.append(opt);
      }
    }
    select.value = selectedKey;

    clear(controls);
    if (model === null || selectedKey === '') return;
    const setting = findSetting(selectedKey);
    const opacity = setting?.opacity ?? 1;

    const range = el('input', {
      type: 'range', min: '0', max: '1', step: '0.01', value: String(opacity),
      oninput: (ev) => {
        const v = Number((ev.target as HTMLInputElement).value);
        out.textContent = v.toFixed(2);
        ctx.viewer.applyMaterialProps(selectedKey, { opacity: v });
      },
      onchange: (ev) => persist(selectedKey, { opacity: Number((ev.target as HTMLInputElement).value) }),
    });
    const out = el('output', {}, opacity.toFixed(2));

    const ds = el('input', {
      type: 'checkbox',
      onchange: (ev) => {
        const v = (ev.target as HTMLInputElement).checked;
        ctx.viewer.applyMaterialProps(selectedKey, { doubleSided: v });
        persist(selectedKey, { doubleSided: v });
      },
    }) as HTMLInputElement;
    ds.checked = setting?.doubleSided ?? false;

    controls.append(
      el('div', { class: 'lv-hint' }, '不透明度'),
      el('div', { class: 'lv-row' }, range, out),
      el('label', { class: 'lv-row' }, ds, ' 両面表示（Double-sided）'),
    );
  }

  render();
  return render;
}
