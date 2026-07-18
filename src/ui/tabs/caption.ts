// Captionタブ — 検索/絞込(FR-15)、ピン色チップ・フィルタ・リスト(LociMyu継承)、編集、添付

import { el, clear } from '../dom';
import { fAnchor, fStr, fStrArr } from '../fields';
import { entityIdFor } from '../../core/store';
import type { AppContext } from '../context';
import { confirmDialog } from '../dialogs';

export const PIN_COLORS = ['#eab308', '#f87171', '#4ade80', '#60a5fa', '#c084fc', '#f9fafb', '#fb923c', '#2dd4bf'];

export function mountCaptionTab(container: HTMLElement, ctx: AppContext): () => void {
  let pinColor = localStorage.getItem('lv-pin-color') ?? '#eab308';

  const searchInput = el('input', {
    type: 'search',
    placeholder: '検索（タイトル・本文）',
    oninput: (ev) => {
      ctx.ui.search = (ev.target as HTMLInputElement).value;
      ctx.notify();
    },
  }) as HTMLInputElement;

  const colorChips = el('div', { class: 'lv-chips' });
  const filterChips = el('div', { class: 'lv-chips' });
  const filterStatus = el('span', { class: 'lv-dim' });
  const list = el('div', { class: 'lv-cap-list' });
  const editor = el('div', { class: 'lv-editor' });

  container.append(
    el('div', { class: 'lv-row' }, searchInput),
    el('div', { class: 'lv-grp' }, el('div', { class: 'lv-hint' }, 'ピン色（新規ピン / 選択中の変更）'), colorChips),
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-row lv-space' },
        el('div', { class: 'lv-hint' }, 'フィルタ'),
        filterStatus,
        el('button', { class: 'mini', onclick: () => { ctx.ui.colorFilter.clear(); ctx.notify(); } }, '解除'),
      ),
      filterChips,
    ),
    el('div', { class: 'lv-grp lv-grow' }, list),
    editor,
  );

  function renderChips(): void {
    clear(colorChips);
    clear(filterChips);
    for (const c of PIN_COLORS) {
      colorChips.append(
        el('button', {
          class: `lv-chip${pinColor === c ? ' on' : ''}`,
          style: `background:${c}`,
          'aria-label': `ピン色 ${c}`,
          onclick: () => {
            pinColor = c;
            localStorage.setItem('lv-pin-color', c);
            const sel = ctx.selectedCaption();
            if (sel !== null) ctx.undo.update('caption', sel.id, { color: c });
            else ctx.notify();
          },
        }),
      );
      filterChips.append(
        el('button', {
          class: `lv-chip${ctx.ui.colorFilter.has(c) ? ' on' : ''}`,
          style: `background:${c}`,
          'aria-label': `フィルタ ${c}`,
          onclick: () => {
            if (ctx.ui.colorFilter.has(c)) ctx.ui.colorFilter.delete(c);
            else ctx.ui.colorFilter.add(c);
            ctx.notify();
          },
        }),
      );
    }
    filterStatus.textContent = ctx.ui.colorFilter.size > 0 ? `ON（${ctx.ui.colorFilter.size}色）` : 'OFF';
  }

  function renderList(): void {
    clear(list);
    const captions = ctx.captions();
    if (captions.length === 0) {
      list.append(el('div', { class: 'lv-dim lv-pad' }, 'キャプションはまだありません。モデル上でShift+Click（スマホは長押し）でピンを追加します。'));
      return;
    }
    for (const c of captions) {
      const row = el(
        'div',
        {
          class: `lv-cap-row${ctx.ui.selectedCaptionId === c.id ? ' sel' : ''}`,
          onclick: () => {
            ctx.ui.selectedCaptionId = c.id;
            ctx.viewer.setPinSelected(c.id);
            ctx.notify();
          },
        },
        el('span', { class: 'lv-cap-dot', style: `background:${fStr(c, 'color', '#eab308')}` }),
        el('span', { class: 'lv-cap-title' }, fStr(c, 'title') !== '' ? fStr(c, 'title') : '(無題)'),
        fStrArr(c, 'attachments').length > 0 ? el('span', { class: 'lv-dim' }, `📷${fStrArr(c, 'attachments').length}`) : null,
      );
      list.append(row);
    }
  }

  function renderEditor(): void {
    clear(editor);
    const sel = ctx.selectedCaption();
    if (sel === null) return;

    const title = el('input', {
      type: 'text',
      placeholder: 'タイトル',
      value: fStr(sel, 'title'),
      onchange: (ev) => ctx.undo.update('caption', sel.id, { title: (ev.target as HTMLInputElement).value }),
    });
    const body = el('textarea', {
      placeholder: '本文',
      onchange: (ev) => ctx.undo.update('caption', sel.id, { body: (ev.target as HTMLTextAreaElement).value }),
    }) as HTMLTextAreaElement;
    body.value = fStr(sel, 'body');
    const tags = el('input', {
      type: 'text',
      placeholder: 'タグ（; 区切り）',
      value: fStrArr(sel, 'tags').join(';'),
      onchange: (ev) => {
        const v = (ev.target as HTMLInputElement).value;
        ctx.undo.update('caption', sel.id, {
          tags: v === '' ? [] : v.split(';').map((t) => t.trim()).filter((t) => t !== ''),
        });
      },
    });

    // 添付（画像・映像。データ構造は汎用attachments — docs/02 §5）
    const thumbs = el('div', { class: 'lv-thumbs' });
    for (const astId of fStrArr(sel, 'attachments')) {
      const img = el('img', { class: 'lv-thumb', alt: '添付' }) as HTMLImageElement;
      void ctx.mediaUrl(astId).then((url) => {
        if (url !== null) img.src = url;
      });
      img.addEventListener('click', () => {
        void ctx.mediaUrl(astId).then((url) => {
          if (url !== null) window.open(url, '_blank');
        });
      });
      thumbs.append(img);
    }

    const fileInput = el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, style: 'display:none' }) as HTMLInputElement;
    const cameraInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' }) as HTMLInputElement;
    const attach = async (files: FileList | null): Promise<void> => {
      if (files === null || files.length === 0) return;
      const current = ctx.selectedCaption();
      if (current === null) return;
      const newIds: string[] = [];
      for (const file of files) {
        const astId = entityIdFor('asset');
        const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase();
        const path = `media/${astId}.${ext}`;
        await ctx.fs.writeBytes(`${ctx.dir}/${path}`, new Uint8Array(await file.arrayBuffer()));
        ctx.store.dispatch({
          t: 'create', e: 'asset', id: astId,
          v: {
            kind: file.type.startsWith('video/') ? 'video' : 'image',
            path, originalName: file.name, mime: file.type, size: file.size,
          },
        });
        newIds.push(astId);
      }
      ctx.undo.update('caption', current.id, {
        attachments: [...fStrArr(current, 'attachments'), ...newIds],
      });
    };
    fileInput.addEventListener('change', () => void attach(fileInput.files));
    cameraInput.addEventListener('change', () => void attach(cameraInput.files));

    editor.append(
      el('div', { class: 'lv-hint' }, `作成: ${ctx.displayName(sel.createdBy)} / 選択中`),
      title,
      body,
      tags,
      el('div', { class: 'lv-row' },
        thumbs,
        el('button', { onclick: () => fileInput.click() }, '＋ 添付'),
        el('button', { onclick: () => cameraInput.click() }, '📷 撮影'),
        fileInput, cameraInput,
      ),
      el('div', { class: 'lv-row lv-space' },
        el('button', {
          class: 'danger',
          onclick: () => {
            void confirmDialog('キャプションの削除', 'このキャプションを削除しますか？（マージ・Undoで復元できます）').then((ok) => {
              if (!ok) return;
              ctx.undo.delete('caption', sel.id);
              ctx.ui.selectedCaptionId = null;
              ctx.notify();
            });
          },
        }, '削除'),
      ),
    );
  }

  const render = (): void => {
    if (searchInput.value !== ctx.ui.search) searchInput.value = ctx.ui.search;
    renderChips();
    renderList();
    renderEditor();
  };
  render();
  return render;
}

export function currentPinColor(): string {
  return localStorage.getItem('lv-pin-color') ?? '#eab308';
}
