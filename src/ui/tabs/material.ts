// Materialタブ — per-material 不透明度・両面・Unlit・クロマキー（LociMyu継承）
// 設定は (setId, modelAssetId, materialKey) 単位のmaterialエンティティに保存（docs/02 §5）

import { el, clear } from '../dom';
import { fStr } from '../fields';
import type { AppContext } from '../context';
import type { ChromaSettings } from '../../viewer/shaderPatch';

interface MaterialSetting {
  id: string;
  opacity: number;
  doubleSided: boolean;
  unlit: boolean;
  chroma: ChromaSettings | null;
}

function readChroma(v: unknown): ChromaSettings | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.enable !== true) return null;
  return {
    enable: true,
    color: typeof o.color === 'string' ? o.color : '#000000',
    tolerance: typeof o.tolerance === 'number' ? o.tolerance : 0.1,
    feather: typeof o.feather === 'number' ? o.feather : 0,
  };
}

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
          for (const m of ctx.materialSettings()) ctx.undo.delete('material', m.id);
          ctx.syncMaterials();
          ctx.notify();
        },
      }, 'このセットの調整を全リセット'),
    ),
  );

  function findSetting(key: string): MaterialSetting | null {
    for (const m of ctx.materialSettings()) {
      if (fStr(m, 'materialKey') === key) {
        return {
          id: m.id,
          opacity: typeof m.fields.opacity === 'number' ? (m.fields.opacity as number) : 1,
          doubleSided: m.fields.doubleSided === true,
          unlit: m.fields.unlitLike === true || m.fields.unlit === true,
          chroma: readChroma(m.fields.chroma),
        };
      }
    }
    return null;
  }

  function persist(key: string, patch: Record<string, unknown>): void {
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
        unlit: false,
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
    const chroma = setting?.chroma;

    // ---- 不透明度 ----
    const opacityOut = el('output', {}, opacity.toFixed(2));
    const opacityRange = el('input', {
      type: 'range', min: '0', max: '1', step: '0.01', value: String(opacity),
      oninput: (ev) => {
        const v = Number((ev.target as HTMLInputElement).value);
        opacityOut.textContent = v.toFixed(2);
        ctx.viewer.applyMaterialProps(selectedKey, { opacity: v });
      },
      onchange: (ev) => persist(selectedKey, { opacity: Number((ev.target as HTMLInputElement).value) }),
    });

    // ---- 両面・Unlit ----
    const dsCheck = el('input', {
      type: 'checkbox',
      onchange: (ev) => {
        const v = (ev.target as HTMLInputElement).checked;
        ctx.viewer.applyMaterialProps(selectedKey, { doubleSided: v });
        persist(selectedKey, { doubleSided: v });
      },
    }) as HTMLInputElement;
    dsCheck.checked = setting?.doubleSided ?? false;

    const unlitCheck = el('input', {
      type: 'checkbox',
      onchange: (ev) => {
        const v = (ev.target as HTMLInputElement).checked;
        ctx.viewer.applyMaterialProps(selectedKey, { unlit: v });
        persist(selectedKey, { unlit: v });
      },
    }) as HTMLInputElement;
    unlitCheck.checked = setting?.unlit ?? false;

    // ---- クロマキー ----
    const chromaBody = el('div', { class: 'lv-grp' });
    const chromaCheck = el('input', {
      type: 'checkbox',
      onchange: (ev) => {
        const on = (ev.target as HTMLInputElement).checked;
        const next: ChromaSettings | null = on
          ? {
              enable: true,
              color: colorInput.value,
              tolerance: Number(tolRange.value),
              feather: Number(featherRange.value),
            }
          : null;
        ctx.viewer.applyMaterialProps(selectedKey, { chroma: next });
        persist(selectedKey, { chroma: next ?? { enable: false } });
        renderChromaBody(on);
      },
    }) as HTMLInputElement;
    chromaCheck.checked = chroma !== null && chroma !== undefined;

    const applyChromaLive = (): void => {
      if (!chromaCheck.checked) return;
      ctx.viewer.applyMaterialProps(selectedKey, {
        chroma: {
          enable: true,
          color: colorInput.value,
          tolerance: Number(tolRange.value),
          feather: Number(featherRange.value),
        },
      });
    };
    const persistChroma = (): void => {
      if (!chromaCheck.checked) return;
      persist(selectedKey, {
        chroma: {
          enable: true,
          color: colorInput.value,
          tolerance: Number(tolRange.value),
          feather: Number(featherRange.value),
        },
      });
    };

    const colorInput = el('input', {
      type: 'color', value: chroma?.color ?? '#000000',
      oninput: applyChromaLive,
      onchange: persistChroma,
    }) as HTMLInputElement;
    const tolOut = el('output', {}, (chroma?.tolerance ?? 0.1).toFixed(2));
    const tolRange = el('input', {
      type: 'range', min: '0', max: '1', step: '0.01', value: String(chroma?.tolerance ?? 0.1),
      oninput: (ev) => {
        tolOut.textContent = Number((ev.target as HTMLInputElement).value).toFixed(2);
        applyChromaLive();
      },
      onchange: persistChroma,
    }) as HTMLInputElement;
    const featherOut = el('output', {}, (chroma?.feather ?? 0).toFixed(2));
    const featherRange = el('input', {
      type: 'range', min: '0', max: '1', step: '0.01', value: String(chroma?.feather ?? 0),
      oninput: (ev) => {
        featherOut.textContent = Number((ev.target as HTMLInputElement).value).toFixed(2);
        applyChromaLive();
      },
      onchange: persistChroma,
    }) as HTMLInputElement;

    function renderChromaBody(on: boolean): void {
      clear(chromaBody);
      if (!on) return;
      chromaBody.append(
        el('div', { class: 'lv-row' }, '抜く色 ', colorInput,
          el('button', {
            class: 'mini',
            title: '画面から色を拾う',
            onclick: () => {
              const eyeDropper = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
              if (eyeDropper === undefined) return;
              void new eyeDropper().open().then((r) => {
                colorInput.value = r.sRGBHex;
                applyChromaLive();
                persistChroma();
              }).catch(() => {});
            },
          }, '🎨'),
        ),
        el('div', { class: 'lv-hint' }, '許容範囲'),
        el('div', { class: 'lv-row' }, tolRange, tolOut),
        el('div', { class: 'lv-hint' }, 'ぼかし'),
        el('div', { class: 'lv-row' }, featherRange, featherOut),
      );
    }
    renderChromaBody(chromaCheck.checked);

    controls.append(
      el('div', { class: 'lv-hint' }, '不透明度'),
      el('div', { class: 'lv-row' }, opacityRange, opacityOut),
      el('label', { class: 'lv-row' }, dsCheck, ' 両面表示（Double-sided）'),
      el('label', { class: 'lv-row' }, unlitCheck, ' Unlit（陰影なしで素の色を表示）'),
      el('label', { class: 'lv-row' }, chromaCheck, ' クロマキー（指定色を透明にする）'),
      chromaBody,
    );
  }

  render();
  return render;
}
