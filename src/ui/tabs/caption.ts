// Captionタブ — 検索/絞込(FR-15)、ピン色チップ・フィルタ・リスト(LociMyu継承)、編集、添付

import { el, clear } from '../dom';
import { fAnchor, fStr, fStrArr, type AnchorData } from '../fields';
import { addCaptionAttachments, type AttachmentSource } from '../../assets/captionAttachment';
import type { AppContext } from '../context';
import { confirmDialog, infoDialog } from '../dialogs';
import { openImageWindow } from '../imageWindow';
import { openImagePicker } from '../imagePicker';

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
    // クリック/タップでライトボックス（全画面・ズーム・前後送り）
    const attachmentIds = fStrArr(sel, 'attachments');
    const thumbs = el('div', { class: 'lv-thumbs' });
    attachmentIds.forEach((astId, i) => {
      const img = el('img', { class: 'lv-thumb', alt: '添付' }) as HTMLImageElement;
      img.addEventListener('error', () => {
        img.replaceWith(el('div', { class: 'lv-thumb lv-thumb-noimg', title: '表示できない形式（HEIC等）' }, '🖼'));
      });
      void ctx.mediaUrl(astId).then((url) => {
        if (url !== null) img.src = url;
      });
      img.addEventListener('click', () => openImageWindow(ctx, attachmentIds, i));
      // 添付を外す（× ボタン）
      const del = el('button', {
        class: 'lv-thumb-del',
        title: '添付を外す',
        onclick: (ev) => {
          ev.stopPropagation();
          const current = ctx.selectedCaption();
          if (current === null) return;
          ctx.undo.update('caption', current.id, {
            attachments: fStrArr(current, 'attachments').filter((x) => x !== astId),
          });
        },
      }, '×');
      thumbs.append(el('div', { class: 'lv-thumb-wrap' }, img, del));
    });

    const fileInput = el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, style: 'display:none' }) as HTMLInputElement;
    const cameraInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' }) as HTMLInputElement;
    const attach = async (files: readonly File[]): Promise<void> => {
      if (files.length === 0) return;
      const current = ctx.selectedCaption();
      if (current === null) return;
      const sources: AttachmentSource[] = files.map((file) => ({
        name: file.name,
        mime: file.type,
        readBytes: async () => new Uint8Array(await file.arrayBuffer()),
      }));
      await addCaptionAttachments(
        ctx.fs,
        ctx.dir,
        ctx.store,
        current.id,
        sources,
        (attachments) => ctx.undo.update('caption', current.id, { attachments: [...attachments] }),
      );
    };
    const handleFiles = (input: HTMLInputElement): void => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      void attach(files).catch(async (error: unknown) => {
        await infoDialog('添付失敗', error instanceof Error ? error.message : String(error));
      });
    };
    fileInput.addEventListener('change', () => handleFiles(fileInput));
    cameraInput.addEventListener('change', () => handleFiles(cameraInput));

    // ピン位置の3軸調整（モデル内部への配置用。モデルローカル座標）
    const posEditor = el('div', { class: 'lv-grp' });
    const anchor = fAnchor(sel);
    if (anchor?.position !== undefined) {
      const diag = ctx.viewer.modelDiag() ?? 1;
      const step = Number((diag / 200).toPrecision(2));
      const axisInput = (axis: 0 | 1 | 2, label: string): HTMLElement => {
        const input = el('input', {
          type: 'number',
          step: String(step),
          value: String(anchor.position![axis]),
          onchange: (ev) => {
            const v = Number((ev.target as HTMLInputElement).value);
            if (!Number.isFinite(v)) return;
            const cur = fAnchor(ctx.selectedCaption() ?? sel) ?? anchor;
            const pos = [...(cur.position ?? anchor.position!)] as [number, number, number];
            pos[axis] = v;
            const next: AnchorData = { ...cur, position: pos };
            ctx.undo.update('caption', sel.id, { anchor: next });
          },
        });
        return el('label', { class: 'lv-axis-input' }, label, input);
      };
      const moveBtn = el('button', {
        class: ctx.ui.pinMoveMode ? 'active' : '',
        onclick: () => {
          ctx.ui.pinMoveMode = !ctx.ui.pinMoveMode;
          ctx.notify();
        },
      }, ctx.ui.pinMoveMode ? '✛ 移動中（3軸ドラッグ）' : '✛ ピンを移動');
      posEditor.append(
        el('div', { class: 'lv-row lv-space' },
          el('div', { class: 'lv-hint' }, `ピン位置（モデル座標。矢印キーで±${step}）`),
          moveBtn,
        ),
        el('div', { class: 'lv-row lv-xyz' }, axisInput(0, 'X'), axisInput(1, 'Y'), axisInput(2, 'Z')),
      );
    }

    // プロジェクトに取り込み済みの画像から選んで添付（ZIP画像・LociMyu画像の結び付け）
    const pickFromProject = async (): Promise<void> => {
      const current = ctx.selectedCaption();
      if (current === null) return;
      const existing = fStrArr(current, 'attachments');
      const picked = await openImagePicker(ctx, existing);
      if (picked === null || picked.length === 0) return;
      const merged = [...existing, ...picked.filter((id) => !existing.includes(id))];
      ctx.undo.update('caption', current.id, { attachments: merged });
    };

    editor.append(
      el('div', { class: 'lv-hint' }, `作成: ${ctx.displayName(sel.createdBy)} / 選択中`),
      title,
      body,
      tags,
      posEditor,
      el('div', { class: 'lv-row' },
        thumbs,
        el('button', { onclick: () => void pickFromProject() }, '🖼 プロジェクト画像'),
        el('button', { onclick: () => fileInput.click() }, '＋ 端末から'),
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
