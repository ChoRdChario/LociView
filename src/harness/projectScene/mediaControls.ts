import { attachmentImage, captionAttachments } from './mediaHistory';
import { fixtureMedia, type SyntheticAttachment } from './mediaHistory';
import type { SyntheticProject } from './fixture';
import type { SyntheticMediaSession, MediaContext } from './mediaSession';

/** Known fixture URLs only. Never render a URI supplied by history or an imported label. */
export function createMediaGallery(document: Document, read: () => SyntheticProject, captionId: string) {
  const root = document.createElement('section'); root.className = 'lv-development-media-gallery'; root.setAttribute('aria-label', '添付メディア');
  const items = new Map<string, { root: HTMLElement; image: HTMLImageElement; label: HTMLElement; error: HTMLElement; retry: HTMLButtonElement;
    toggle: HTMLButtonElement; expanded: boolean; failed: boolean; mediaId: string }>();
  let disposed = false, previousOrder = '';
  const notice = document.createElement('p'); notice.setAttribute('role', 'status'); root.append(notice);
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
  const src = (row: SyntheticAttachment) => `data:image/png;base64,${attachmentImage(row)!.base64}`;
  function render() {
    if (disposed) return; const rows = captionAttachments(read().mediaData, captionId);
    const active = new Set(rows.ready.map(r => r.id));
    for (const [id, card] of items) if (!active.has(id)) { card.root.remove(); items.delete(id); }
    rows.ready.forEach((row, i) => {
      const media = attachmentImage(row)!; let card = items.get(row.id);
      if (!card) {
        const section = make('figure'), image = make('img'), label = make('figcaption'), error = make('p'), retry = make('button', '画像を再試行'), toggle = make('button', '拡大');
        retry.type = toggle.type = 'button'; image.draggable = false; error.setAttribute('role', 'status'); section.append(image, label, toggle, error, retry);
        card = { root: section, image, label, error, retry, toggle, expanded: false, failed: false, mediaId: '' }; items.set(row.id, card);
        const held = card;
        const show = () => { if (disposed || items.get(row.id) !== held) return; held.image.hidden = held.failed;
          held.error.textContent = held.failed ? '画像を表示できません。添付情報は保持しています。' : ''; held.retry.hidden = !held.failed;
          held.root.className = held.expanded ? 'is-expanded' : ''; held.toggle.textContent = held.expanded ? '縮小' : '拡大'; held.toggle.setAttribute('aria-expanded', String(held.expanded));
          held.toggle.setAttribute('aria-label', `${held.toggle.textContent} ${fixtureMedia.find(m => m.record.id === held.mediaId)?.record.label ?? '画像'}`); };
        image.addEventListener('error', () => { held.failed = true; show(); }); image.addEventListener('load', () => { held.failed = false; show(); });
        retry.addEventListener('click', () => { if (disposed || items.get(row.id) !== held) return;
          const current = captionAttachments(read().mediaData, captionId).ready.find(r => r.id === row.id); if (!current) return;
          held.failed = false; show(); held.image.src = src(current); });
        toggle.addEventListener('click', () => { held.expanded = !held.expanded; show(); }); show();
      }
      const description = row.altText.kind === 'value' ? row.altText.value : '説明の更新候補を確認してください。';
      card.label.textContent = `${i + 1}. ${media.record.label}${description ? ` — ${description}` : ''}`;
      card.image.alt = description || media.record.label;
      card.toggle.setAttribute('aria-label', `${card.expanded ? '縮小' : '拡大'} ${media.record.label}`);
      if (card.mediaId !== media.record.id) { card.mediaId = media.record.id; card.failed = false; card.image.src = src(row); }
    });
    const order = JSON.stringify(rows.ready.map(r => r.id)); if (order !== previousOrder) { previousOrder = order; rows.ready.forEach(r => root.append(items.get(r.id)!.root)); }
    notice.textContent = rows.review.length ? '未解決の添付があります。更新候補を確認してください。' : ''; notice.hidden = !notice.textContent;
    root.hidden = !rows.ready.length && !rows.review.length;
  }
  return { root, render, dispose() { disposed = true; items.clear(); root.remove(); } };
}

export function createMediaControls(document: Document, session: SyntheticMediaSession, changed: () => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
  const button = (s: string) => { const n = make('button', s); n.type = 'button'; return n; };
  const root = make('section'); root.className = 'lv-development-media'; root.setAttribute('aria-label', 'メディア');
  const picker = make('select'); picker.setAttribute('aria-label', 'メディアを選択'); const empty = make('option', 'メディアを選択'); empty.value = ''; picker.append(empty);
  fixtureMedia.forEach(m => { const option = make('option', m.record.label); option.value = m.record.id; picker.append(option); });
  const add = button('メディアを追加'), note = make('p', '開発用の合成画像です。ファイルの読込みは未接続です。'), list = make('div'), status = make('p'); status.setAttribute('role', 'status');
  const editor = make('section'), input = make('input'), apply = button('説明を適用'), cancel = button('取り消す'), retry = button('再試行');
  input.setAttribute('aria-label', 'メディアの説明'); editor.append(input, apply, cancel);
  const confirm = make('section'), question = make('p'), yes = button('添付を削除'), no = button('戻る'); confirm.append(question, yes, no); confirm.hidden = true;
  let current: MediaContext, confirming: { ctx: MediaContext; id: string } | null = null, key = '', disposed = false;
  root.append(picker, add, note, list, editor, retry, status, confirm);
  const act = (fn: () => void) => { if (disposed) return; fn(); changed(); };
  add.addEventListener('click', () => act(() => { session.add(current, picker.value); }));
  picker.addEventListener('change', () => { add.disabled = !picker.value || Boolean(current.block || session.draft); });
  input.addEventListener('input', () => act(() => session.input(input.value, session.draft?.composing ?? false)));
  input.addEventListener('compositionstart', () => act(() => session.input(input.value, true)));
  input.addEventListener('compositionend', () => act(() => session.input(input.value, false)));
  apply.addEventListener('click', () => act(() => { session.apply(); })); cancel.addEventListener('click', () => act(() => { session.cancel(); }));
  retry.addEventListener('click', () => act(() => { session.retry(); }));
  no.addEventListener('click', () => { confirming = null; confirm.hidden = true; });
  yes.addEventListener('click', () => act(() => { if (!confirming) return; session.remove(confirming.ctx, confirming.id); confirming = null; confirm.hidden = true; }));
  function render() {
    current = session.context(); const d = session.draft, rows = current.captionId ? captionAttachments(current.project.mediaData, current.captionId) : { ready: [], review: [] };
    root.hidden = !current.captionId && !d; picker.disabled = Boolean(current.block || d); add.disabled = picker.disabled || !picker.value;
    editor.hidden = !d; if (d && !d.composing && input.value !== d.raw) input.value = d.raw;
    apply.disabled = Boolean(d?.composing || current.block); cancel.disabled = Boolean(d?.composing);
    retry.hidden = !session.failed; retry.disabled = Boolean(current.block || d?.composing);
    status.textContent = session.message || (d ? '説明を編集中です。まだ適用していません。' : current.block ?? (rows.review.length ? '未解決の添付があります。更新候補を確認してください。' : ''));
    if (confirming && (confirming.ctx.project.state.token !== current.project.state.token || confirming.ctx.captionId !== current.captionId || d || current.block)) { confirming = null; confirm.hidden = true; }
    const next = JSON.stringify([current.project.state.token, current.captionId, Boolean(d), current.block]); if (key === next) return; key = next;
    list.replaceChildren(...rows.ready.map((row, i) => {
      const card = make('section'), media = attachmentImage(row)!;
      card.setAttribute('aria-label', `添付 ${i + 1} ${media.record.label}`); card.append(make('p', `${i + 1}. ${media.record.label}`));
      const alt = make('p', row.altText.kind === 'value' ? row.altText.value : '説明の更新候補を確認してください。');
      const edit = button('説明を編集'), earlier = button('前へ'), later = button('後へ'), remove = button('添付を削除');
      edit.disabled = Boolean(d || current.block || row.altText.kind !== 'value'); earlier.disabled = Boolean(d || current.block || i === 0 || rows.review.length);
      later.disabled = Boolean(d || current.block || i === rows.ready.length - 1 || rows.review.length); remove.disabled = Boolean(d || current.block);
      const expected = current;
      edit.addEventListener('click', () => act(() => { session.begin(expected, row.id); }));
      earlier.addEventListener('click', () => act(() => { session.reorder(expected, row.id, -1); })); later.addEventListener('click', () => act(() => { session.reorder(expected, row.id, 1); }));
      remove.addEventListener('click', () => { if (disposed || remove.disabled) return; confirming = { ctx: expected, id: row.id };
        question.textContent = `添付 ${i + 1}「${media.record.label}」をこのキャプションから削除します。同じキャプションを使うシーンにも反映されます。画像本体と別キャプションの添付は残ります。`; confirm.hidden = false; yes.focus(); });
      card.append(alt, edit, earlier, later, remove); return card;
    }));
  }
  return { root, render, dispose() { disposed = true; root.remove(); } };
}
