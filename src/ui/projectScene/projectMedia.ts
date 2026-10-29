import type { JsonObject } from '../../domain/values';
import { createMediaThumbnails, type MediaViewer, type MediaPreviewGroup, type PreviewPng } from './mediaPreview';
import { fieldValue, projectAttachments, projectIdentity, projectMediaResources, projectMediaUncertain } from './projectRead';
import { newProjectId, panelNodes, sameProjectValue, type ProjectPanelHost, type ProjectPanel } from './projectPanel';

/** Attachment commands and local viewing only; binary verification stays in the current host. */
export function createProjectMedia(document: Document, host: ProjectPanelHost, caption: () => string | null, viewer: MediaViewer) {
  const { make, button } = panelNodes(document), root = make('section'), galleryHost = make('div'), stored = make('details'), list = make('section');
  root.setAttribute('aria-label', 'メディアの整理'); galleryHost.setAttribute('aria-label', '添付メディア'); list.setAttribute('aria-label', '添付の編集');
  stored.setAttribute('aria-label', '登録済みメディア'); stored.append(make('summary', '登録済みメディア'));
  const status = make('p'); status.setAttribute('role', 'status');
  type Scope = { token: string; sceneId: string; captionId: string };
  type Choice = Scope & { id: string; record: JsonObject };
  type Draft = Scope & { attachmentId: string; raw: string; composing: boolean };
  let selected: Choice | null = null, draft: Draft | null = null, removal: (Scope & { attachmentId: string; label: string }) | null = null;
  let disposed = false, galleryKey = '', listKey = '', message = '', imageScope = '';
  let gallery: ReturnType<typeof createMediaThumbnails> | undefined;
  const bodies = new Map<string, { record: JsonObject; image: PreviewPng }>();
  const source = () => { const s = host.source(); return { ...s, captionId: caption() }; };
  const scope = () => { const s = source(); return JSON.stringify([projectIdentity(s.provider), s.sceneId, host.ports.imageScope()]); };
  const owned = () => !!selected || !!draft || !!removal;
  const expected = (): Scope | null => { const s = source(); return s.captionId ? { token: s.provider.token, sceneId: s.sceneId, captionId: s.captionId } : null; };
  const isCurrent = (s: Scope) => { const now = expected(); return !!now && sameProjectValue(s.token, now.token) && s.sceneId === now.sceneId && s.captionId === now.captionId; };
  const rows = (captionId: string) => projectAttachments(source().provider, captionId).filter(r => r.media && r.fields.orderKey?.kind === 'value');
  const uncertainty = () => { const s = source(); return s.captionId && projectMediaUncertain(s.provider, s.captionId) ? '未解決の添付があります。関連と順序を確認してください。' : null; };
  const image = (id: string, record: JsonObject): PreviewPng => {
    const lifetime = host.ports.imageScope(); if (imageScope !== lifetime) { imageScope = lifetime; bodies.clear(); }
    const old = bodies.get(id); if (old && sameProjectValue(old.record, record)) return old.image;
    let request: Promise<Blob> | undefined;
    const value: PreviewPng = { load() { request ??= host.ports.image(record).catch(error => { request = undefined; throw error; }); return request; } };
    bodies.set(id, { record, image: value }); return value;
  };
  const reader = (captionId: string | null) => {
    const captured = scope();
    return (): MediaPreviewGroup | null => {
      if (disposed || captured !== scope()) return null;
      const { provider } = source(), resources = projectMediaResources(provider);
      if (captionId === null) return { scope: captured, label: '登録済みメディア', items: resources.map(r => ({ id: r.id, resourceId: r.id, label: r.label, kind:r.record.mediaKind as 'image'|'video'|'audio',description: '', image: image(r.id, r.record) })) };
      return { scope: JSON.stringify([captured, captionId]), label: String(fieldValue(provider.resources.captions[captionId]?.title) || 'キャプション'),
        items: rows(captionId).map(r => { const resource = resources.find(m => m.id === r.media!.id), alt = r.fields.altText;
          return { id: r.id, resourceId: String(r.media!.id), label: r.label, kind:r.media!.mediaKind as 'image'|'video'|'audio', description: alt?.kind === 'value' ? r.alt : '説明の更新候補を確認してください。',
            image: resource ? image(resource.id, resource.record) : null }; }) };
    };
  };
  let registeredReader = reader(null), registeredScope = scope();
  const newPicker = () => createMediaThumbnails(document, () => registeredReader(), viewer, { selected: () => selected?.id ?? null,
    choose(id) { const s = expected(), record = projectMediaResources(source().provider).find(r => r.id === id)?.record;
      if (s && record && !host.block('captions') && !draft && !removal) { selected = { ...s, id, record }; host.changed(); } } });
  let picker = newPicker();
  picker.root.setAttribute('aria-label', 'メディアを選択');
  const attach = button('選択したメディアを添付', () => {
    const choice = selected; if (!choice || host.block('captions') || !isCurrent(choice) || uncertainty()) return;
    try { const existing = rows(choice.captionId), attachmentId = newProjectId('att');
      host.dispatch('captions', choice.token, { kind: 'createAttachment', sceneId: choice.sceneId, captionId: choice.captionId, attachmentId,
        media: choice.record, orderKey: host.ports.viewOrder(existing.at(-1)?.order ?? null, null), altText: '', eventId: newProjectId('evt') }, () => {
          if (!rows(choice.captionId).some(r => r.id === attachmentId && r.media?.id === choice.id)) throw Error('添付の適用結果を確認できません。選択を保持しています。');
          selected = null; host.message('選択したメディアを添付しました。');
        });
    } catch (error) { message = (error as Error).message; host.changed(); }
  });
  const cancelSelection = button('選択を取り消す', () => { if (!host.block('captions', false)) { selected = null; message = ''; host.changed(); } });
  stored.append(picker.root, attach, cancelSelection); stored.addEventListener('toggle', () => host.changed());
  const form = make('section'), input = make('input'); input.setAttribute('aria-label', 'メディアの説明'); form.setAttribute('aria-label', '説明の編集');
  const apply = button('説明を適用', () => {
    const d = draft; if (!d || d.composing || host.block('captions') || !isCurrent(d) || uncertainty()) return;
    try { const value = host.ports.mediaDescription(d.raw);
      host.dispatch('captions', d.token, { kind: 'editAttachment', sceneId: d.sceneId, captionId: d.captionId, attachmentId: d.attachmentId, field: 'altText', value }, () => {
        if (rows(d.captionId).find(r => r.id === d.attachmentId)?.alt !== value) throw Error('説明の適用結果を確認できません。入力を保持しています。');
        draft = null; host.message('メディアの説明を適用しました。');
      });
    } catch (error) { message = (error as Error).message; host.changed(); }
  });
  const cancel = button('取り消す', () => { if (!host.block('captions', false) && !draft?.composing) { draft = null; message = ''; host.changed(); } }); form.append(input, apply, cancel);
  const change = (composing = draft?.composing ?? false) => { if (draft && !host.block('captions', false)) { draft = { ...draft, raw: input.value, composing }; message = ''; host.changed(); } };
  input.addEventListener('input', () => change()); input.addEventListener('compositionstart', () => change(true)); input.addEventListener('compositionend', () => change(false));
  const confirmation = make('section'), question = make('p'); confirmation.setAttribute('aria-label', '添付解除の確認');
  const detach = button('添付を解除する', () => { const choice = removal;
    if (!choice || host.block('captions') || !isCurrent(choice) || uncertainty()) return;
    host.dispatch('captions', choice.token, { kind: 'deleteAttachment', sceneId: choice.sceneId, captionId: choice.captionId, attachmentId: choice.attachmentId, eventId: newProjectId('evt') }, () => {
      if (rows(choice.captionId).some(r => r.id === choice.attachmentId)) throw Error('添付解除の適用結果を確認できません。');
      removal = null; host.message('添付を解除しました。');
    });
  });
  confirmation.append(question, detach, button('戻る', () => { if (!host.block('captions', false)) { removal = null; host.changed(); } }));
  root.append(galleryHost, stored, list, form, confirmation, status);
  function render() {
    if (disposed) return; const s = source(), block = host.block('captions'), local = host.block('captions', false), uncertain = uncertainty(), currentScope = scope();
    if (registeredScope !== currentScope) { registeredScope = currentScope; registeredReader = reader(null); picker.dispose(); picker = newPicker();
      picker.root.setAttribute('aria-label', 'メディアを選択'); stored.insertBefore(picker.root, attach); }
    const nextGallery = JSON.stringify([currentScope, s.captionId]);
    if (galleryKey !== nextGallery) { galleryKey = nextGallery; gallery?.dispose(); gallery = s.captionId ? createMediaThumbnails(document, reader(s.captionId), viewer) : undefined;
      galleryHost.replaceChildren(); if (gallery) galleryHost.append(gallery.root); }
    gallery?.render(); if (stored.open) picker.render(); viewer.render();
    root.hidden = !s.captionId && !owned(); stored.hidden = !projectMediaResources(s.provider).length;
    attach.disabled = !!block || !!draft || !!removal || !selected || !isCurrent(selected) || !!uncertain;
    cancelSelection.hidden = !selected; cancelSelection.disabled = !!local;
    form.hidden = !draft; input.readOnly = !!local; if (!draft?.composing) input.value = draft?.raw ?? '';
    apply.disabled = !!block || !draft || draft.composing || !isCurrent(draft) || !!uncertain; cancel.disabled = !!local || !!draft?.composing;
    confirmation.hidden = !removal; detach.disabled = !!block || !removal || !isCurrent(removal) || !!uncertain;
    question.textContent = removal ? `「${removal.label}」の添付を解除しますか？ 同じ記録を使う全シーンに反映されます。元のメディアと、別の記録への添付は残ります。` : '';
    const unavailable = s.provider.issues.some(issue => issue.kind === 'unverified' && issue.code === 'verified-media-bytes-required' && issue.path[0] === 'mediaResourcesById');
    status.textContent = [message, uncertain, unavailable && 'この環境では利用できない登録メディアがあります。対応するブラウザで確認してください。',
      (selected && !isCurrent(selected) || draft && !isCurrent(draft) || removal && !isCurrent(removal)) && '対象が更新されています。入力と操作を保持しています。取り消して選び直してください。'].filter(Boolean).join(' ');
    const nextList = JSON.stringify([s.provider.token, s.captionId, !!block, owned(), !!uncertain]); if (nextList === listKey) return; listKey = nextList; list.replaceChildren();
    for (const [index, row] of (s.captionId ? rows(s.captionId) : []).entries()) {
      const card = make('section'); card.setAttribute('aria-label', `添付 ${index + 1} ${row.label}`); card.append(make('p', `${index + 1}. ${row.label}`), make('p', row.fields.altText?.kind === 'value' ? row.alt : '説明の更新候補を確認してください。'));
      const held = expected()!, edit = button('説明を編集', () => { if (host.block('captions') || owned() || !isCurrent(held)) return; draft = { ...held, attachmentId: row.id, raw: row.alt, composing: false }; host.changed(); });
      edit.disabled = !!block || owned() || !!uncertain || row.fields.altText?.kind !== 'value'; card.append(edit);
      for (const [offset, label] of [[-1, '前へ'], [1, '後へ']] as const) {
        const move = button(label, () => { if (host.block('captions') || owned() || !isCurrent(held) || uncertainty()) return;
          try { const items = rows(held.captionId), rest = items.filter(r => r.id !== row.id), at = index + offset, value = host.ports.viewOrder(rest[at - 1]?.order ?? null, rest[at]?.order ?? null);
            host.dispatch('captions', held.token, { kind: 'editAttachment', sceneId: held.sceneId, captionId: held.captionId, attachmentId: row.id, field: 'orderKey', value }, () => host.message('添付の順序を変更しました。'));
          } catch (error) { message = (error as Error).message; host.changed(); }
        }); move.disabled = !!block || owned() || !!uncertain || index + offset < 0 || index + offset >= rows(held.captionId).length; card.append(move);
      }
      const remove = button('添付を解除', () => { if (!host.block('captions') && !owned() && isCurrent(held)) { removal = { ...held, attachmentId: row.id, label: row.label }; host.changed(); } });
      remove.disabled = !!block || owned() || !!uncertain; card.append(remove); list.append(card);
    }
  }
  return { root, render, hasChanges: owned, composing: () => !!draft?.composing,
    gallery(captionId: string) {
      let lifetime = scope(), read = reader(captionId);
      const thumbs = createMediaThumbnails(document, () => read(), viewer); thumbs.root.setAttribute('aria-label', '添付メディア');
      return { root: thumbs.root, render() { if (lifetime !== scope()) { lifetime = scope(); read = reader(captionId); } thumbs.render(); }, dispose: thumbs.dispose };
    },
    dispose() { disposed = true; gallery?.dispose(); picker.dispose(); bodies.clear(); root.remove(); } } satisfies ProjectPanel & { gallery(captionId: string): { root: HTMLElement; render(): void; dispose(): void } };
}
