import { attachmentImage, captionAttachments } from './mediaHistory';
import type { SyntheticProject } from './fixture';
import type { SyntheticMediaSession, MediaContext } from './mediaSession';
import { createMediaViewer, createMediaThumbnails, type MediaViewer } from '../../ui/projectScene/mediaPreview';
import { captionMediaReader, registeredMediaGroup, mediaScope } from './mediaPresentation';

/** Known generated or verified saved image bytes only. Never render a URI from history/imported labels. */
export function createMediaGallery(document: Document, read: () => SyntheticProject, captionId: string, viewer: MediaViewer, scene: () => string | null) {
  const root = document.createElement('section'); root.className = 'lv-development-media-gallery'; root.setAttribute('aria-label', '添付メディア');
  const thumbnails = createMediaThumbnails(document, captionMediaReader(read, scene, captionId), viewer);
  let disposed = false;
  const notice = document.createElement('p'); notice.setAttribute('role', 'status'); root.append(thumbnails.root, notice);
  function render() {
    if (disposed) return; const rows = captionAttachments(read().mediaData, captionId);
    thumbnails.render();
    notice.textContent = rows.review.length ? '未解決の添付があります。更新候補を確認してください。' : ''; notice.hidden = !notice.textContent;
    root.hidden = !rows.ready.length && !rows.review.length;
  }
  return { root, render, dispose() { disposed = true; thumbnails.dispose(); root.remove(); } };
}

export function createMediaControls(document: Document, session: SyntheticMediaSession, changed: () => void, sharedViewer?: MediaViewer) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
  const button = (s: string) => { const n = make('button', s); n.type = 'button'; return n; };
  const root = make('section'); root.className = 'lv-development-media'; root.setAttribute('aria-label', 'メディア');
  const viewer = sharedViewer ?? createMediaViewer(document);
  const add = button('メディアを追加'), note = make('p', '開発用の合成画像です。ファイルの読込みは未接続です。'), list = make('div'), status = make('p'); status.setAttribute('role', 'status');
  const addFile = button('メディアを追加'), file = make('input'), cancelFile = button('選択を取り消す');
  file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg'; file.hidden = true; file.setAttribute('aria-label', 'メディアを追加');
  const stored = make('details'), storedLabel = make('summary', '登録済みメディア'), target = make('p'); stored.append(storedLabel, target);
  const editor = make('section'), input = make('input'), apply = button('説明を適用'), cancel = button('取り消す'), retry = button('再試行');
  input.setAttribute('aria-label', 'メディアの説明'); editor.append(input, apply, cancel);
  const confirm = make('section'), question = make('p'), yes = button('添付を削除'), no = button('戻る'); confirm.append(question, yes, no); confirm.hidden = true;
  let current: MediaContext, fileTarget: MediaContext | null = null, confirming: { ctx: MediaContext; id: string } | null = null, key = '', disposed = false;
  let selected: { context: MediaContext; id: string } | null = null, gallery: ReturnType<typeof createMediaGallery> | null = null, galleryKey = '';
  const picker = createMediaThumbnails(document, () => { const ctx = session.context(); return registeredMediaGroup(ctx.project, ctx.sceneId); }, viewer, {
    selected: () => selected?.id ?? null, choose(id) { const ctx = session.context(); if (!ctx.captionId) return; selected = { context: ctx, id }; render(); }
  });
  picker.root.setAttribute('aria-label', 'メディアを選択');
  const galleryHost = make('div'), editing = make('details'), editingLabel = make('summary', '添付の編集'); editing.append(editingLabel, list);
  stored.append(picker.root, add); stored.open = !session.fileAdditionAvailable();
  root.append(addFile, file, cancelFile, stored, note, galleryHost, editing, editor, retry, status, confirm);
  if (!sharedViewer) root.append(viewer.root);
  const act = (fn: () => void) => { if (disposed) return; fn(); changed(); };
  add.addEventListener('click', () => act(() => { if (selected && !add.disabled) session.add(selected.context, selected.id); }));
  addFile.addEventListener('click', () => { if (disposed || addFile.disabled) return; fileTarget = current; file.value = ''; file.click(); });
  file.addEventListener('change', () => act(() => { const selected = file.files?.[0];
    if (selected && fileTarget) session.addFile(fileTarget, selected); fileTarget = null;
  }));
  cancelFile.addEventListener('click', () => act(() => { if (session.cancelFile()) file.value = ''; }));
  input.addEventListener('input', () => act(() => session.input(input.value, session.draft?.composing ?? false)));
  input.addEventListener('compositionstart', () => act(() => session.input(input.value, true)));
  input.addEventListener('compositionend', () => act(() => session.input(input.value, false)));
  apply.addEventListener('click', () => act(() => { session.apply(); })); cancel.addEventListener('click', () => act(() => { session.cancel(); }));
  retry.addEventListener('click', () => act(() => { session.retry(); }));
  no.addEventListener('click', () => { confirming = null; confirm.hidden = true; });
  yes.addEventListener('click', () => act(() => { if (!confirming) return; session.remove(confirming.ctx, confirming.id); confirming = null; confirm.hidden = true; }));
  function render() {
    current = session.context(); const d = session.draft, rows = current.captionId ? captionAttachments(current.project.mediaData, current.captionId) : { ready: [], review: [] };
    const choices = registeredMediaGroup(current.project, current.sceneId).items;
    if (selected && (selected.context.project.state.token !== current.project.state.token || selected.context.captionId !== current.captionId ||
      selected.context.sceneId !== current.sceneId || !choices.some(m => m.id === selected!.id))) selected = null;
    const nextGallery = JSON.stringify([mediaScope(current.project, current.sceneId), current.captionId]);
    if (nextGallery !== galleryKey) { galleryKey = nextGallery; gallery?.dispose(); gallery = current.captionId ?
      createMediaGallery(document, () => session.context().project, current.captionId, viewer, () => session.context().sceneId) : null;
      if (gallery) galleryHost.append(gallery.root); }
    gallery?.render(); picker.render(); viewer.render();
    const title = current.captionId ? current.project.resources.captions[current.captionId]?.title : undefined;
    target.textContent = title?.kind === 'value' ? `添付先：${title.value || 'キャプション'}` : 'キャプションを選択してください。';
    const filesAvailable = session.fileAdditionAvailable();
    addFile.hidden = !filesAvailable; stored.hidden = !choices.length; editing.hidden = !rows.ready.length;
    addFile.disabled = Boolean(current.block || d || session.hasFileSelection);
    cancelFile.hidden = !session.hasFileSelection; cancelFile.disabled = Boolean(current.block);
    add.textContent = '選択したメディアを添付';
    note.textContent = filesAvailable ? 'PNG/JPEG/WebP/GIFを追加できます。' : current.project.validationFiles ? choices.length ? '' : 'このプロジェクトには追加できるメディアがありません。' : '開発用の合成画像です。ファイルの読込みは未接続です。';
    note.hidden = !note.textContent;
    root.hidden = !current.captionId && !d && !session.hasFileSelection;
    add.disabled = Boolean(current.block || d || session.hasFileSelection) || !selected;
    editor.hidden = !d; if (d && !d.composing && input.value !== d.raw) input.value = d.raw;
    apply.disabled = Boolean(d?.composing || current.block); cancel.disabled = Boolean(d?.composing);
    retry.hidden = !session.failed; retry.disabled = Boolean(current.block || d?.composing);
    status.textContent = session.message || (d ? '説明を編集中です。まだ適用していません。' : current.block ?? (rows.review.length ? '未解決の添付があります。更新候補を確認してください。' : ''));
    if (confirming && (confirming.ctx.project.state.token !== current.project.state.token || confirming.ctx.captionId !== current.captionId || d || current.block)) { confirming = null; confirm.hidden = true; }
    const next = JSON.stringify([current.project.state.token, current.captionId, Boolean(d), current.block, session.hasFileSelection]); if (key === next) return; key = next;
    list.replaceChildren(...rows.ready.map((row, i) => {
      const card = make('section'), media = attachmentImage(row, current.project.mediaData)!;
      card.setAttribute('aria-label', `添付 ${i + 1} ${media.record.label}`); card.append(make('p', `${i + 1}. ${media.record.label}`));
      const alt = make('p', row.altText.kind === 'value' ? row.altText.value : '説明の更新候補を確認してください。');
      const edit = button('説明を編集'), earlier = button('前へ'), later = button('後へ'), remove = button('添付を削除');
      edit.disabled = Boolean(d || current.block || row.altText.kind !== 'value'); earlier.disabled = Boolean(d || current.block || i === 0 || rows.review.length);
      later.disabled = Boolean(d || current.block || i === rows.ready.length - 1 || rows.review.length); remove.disabled = Boolean(d || current.block);
      if (session.hasFileSelection) edit.disabled = earlier.disabled = later.disabled = remove.disabled = true;
      const expected = current;
      edit.addEventListener('click', () => act(() => { session.begin(expected, row.id); }));
      earlier.addEventListener('click', () => act(() => { session.reorder(expected, row.id, -1); })); later.addEventListener('click', () => act(() => { session.reorder(expected, row.id, 1); }));
      remove.addEventListener('click', () => { if (disposed || remove.disabled) return; confirming = { ctx: expected, id: row.id };
        question.textContent = `添付 ${i + 1}「${media.record.label}」をこのキャプションから削除します。同じキャプションを使うシーンにも反映されます。画像本体と別キャプションの添付は残ります。`; confirm.hidden = false; yes.focus(); });
      card.append(alt, edit, earlier, later, remove); return card;
    }));
  }
  return { root, render, dispose() { disposed = true; gallery?.dispose(); picker.dispose(); if (!sharedViewer) viewer.dispose(); root.remove(); } };
}
