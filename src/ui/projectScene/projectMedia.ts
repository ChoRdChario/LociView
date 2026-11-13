import type { JsonObject } from '../../domain/values';
import { displayBlobRef } from '../../domain/portableMedia';
import { editOnly } from './modePresentation';
import { createMediaThumbnails, mediaDisplayDescription, type MediaViewer, type MediaPreviewGroup, type PreviewPng } from './mediaPreview';
import { fieldValue, projectAttachments, projectIdentity, projectMediaResources, projectMediaUncertain } from './projectRead';
import { newProjectId, panelNodes, sameProjectValue, type ProjectPanelHost, type ProjectPanel } from './projectPanel';

/** Attachment commands and local viewing only; binary verification stays in the current host. */
export function createProjectMedia(document: Document, host: ProjectPanelHost, caption: () => string | null, viewer: MediaViewer) {
  const { make, button } = panelNodes(document), root = make('section'), galleryHost = make('section'), stored = make('details');
  root.setAttribute('aria-label', 'メディアの整理'); galleryHost.setAttribute('aria-label', '添付メディア');
  stored.setAttribute('aria-label', '既存のメディアを添付'); stored.append(make('summary', '既存のメディアを添付'));
  const status = make('p'); status.setAttribute('role', 'status');
  const waiting = make('p', '添付はファイル作成後に表示します。'); waiting.hidden = true;
  type Scope = { token: string; sceneId: string; captionId: string };
  type Choice = Scope & { id: string; record: JsonObject };
  type Draft = Scope & { attachmentId: string; raw: string; composing: boolean };
  let selected: Choice | null = null, draft: Draft | null = null, removal: (Scope & { attachmentId: string; label: string }) | null = null;
  let disposed = false, presentationActive = true, galleryKey = '', message = '', imageScope = '';
  const expanded = new Set<string>();
  const actionCards = new Map<string, { root: HTMLElement; edit: HTMLButtonElement; moves: HTMLButtonElement[]; update(): void }>();
  type FocusReturn = { origin: HTMLButtonElement; attachmentId: string; captionId: string; scope: string; editing: boolean; completed: boolean };
  let returnFocus: FocusReturn | null = null;
  const rememberFocus = (origin: HTMLButtonElement, attachmentId: string, editing: boolean): FocusReturn | null => {
    if (document.activeElement !== origin || !caption()) return null;
    return returnFocus = { origin, attachmentId, captionId: caption()!, scope: scope(), editing, completed: false };
  };
  const movedFocus = (event: Event) => { if (returnFocus && event.target !== returnFocus.origin && event.target !== document.body) returnFocus = null; };
  document.addEventListener?.('focusin', movedFocus);
  let gallery: ReturnType<typeof createMediaThumbnails> | undefined;
  const bodies = new Map<string, { record: JsonObject; image: PreviewPng }>();
  const source = () => { const s = host.source(); return { ...s, captionId: caption() }; };
  const scope = () => { const s = source(); return JSON.stringify([projectIdentity(s.provider), s.sceneId, host.ports.imageScope()]); };
  const owned = () => !!selected || !!draft || !!removal;
  const expected = (): Scope | null => { const s = source(); return s.captionId ? { token: s.provider.token, sceneId: s.sceneId, captionId: s.captionId } : null; };
  const isCurrent = (s: Scope) => { if(disposed)return false;const now = expected(); return !!now && sameProjectValue(s.token, now.token) && s.sceneId === now.sceneId && s.captionId === now.captionId; };
  const rows = (captionId: string) => projectAttachments(source().provider, captionId).filter(r => r.media && r.fields.orderKey?.kind === 'value');
  const uncertainty = () => { const s = source(); return s.captionId && projectMediaUncertain(s.provider, s.captionId) ? '未解決の添付があります。関連と順序を確認してください。' : null; };
  const image = (id: string, record: JsonObject): PreviewPng => {
    const lifetime = host.ports.imageScope(); if (imageScope !== lifetime) { imageScope = lifetime; bodies.clear(); }
    const old = bodies.get(id); if (old && sameProjectValue(old.record, record)) return old.image;
    let request: Promise<Blob> | undefined;
    const value: PreviewPng = { key: JSON.stringify([projectIdentity(source().provider), lifetime, displayBlobRef(record)]), byteLength: Number(displayBlobRef(record).byteLength),
      load() { if (!request) { const current = host.ports.image(record); request = current;
        void current.finally(() => { if (request === current) request = undefined; }).catch(() => {}); } return request; } };
    bodies.set(id, { record, image: value }); return value;
  };
  const reader = (captionId: string | null) => {
    const captured = scope();
    return (): MediaPreviewGroup | null => {
      if (disposed || captured !== scope()) return null;
      const { provider } = source(), resources = projectMediaResources(provider);
      if (captionId === null) return { scope: captured, label: '登録済みメディア', items: resources.map(r => ({ id: r.id, resourceId: r.id, label: r.label, kind:r.record.mediaKind as 'image'|'video'|'audio',description: mediaDisplayDescription('',r.record.portableDisplay!==undefined), image: image(r.id, r.record) })) };
      return { scope: JSON.stringify([captured, captionId]), label: String(fieldValue(provider.resources.captions[captionId]?.title) || 'キャプション'),
        items: rows(captionId).map(r => { const resource = resources.find(m => m.id === r.media!.id), alt = r.fields.altText;
          return { id: r.id, resourceId: String(r.media!.id), label: r.label, kind:r.media!.mediaKind as 'image'|'video'|'audio', description: mediaDisplayDescription(alt?.kind === 'value' ? r.alt : '説明の更新候補を確認してください。',resource?.record.portableDisplay!==undefined),
            image: resource ? image(resource.id, resource.record) : null }; }) };
    };
  };
  let registeredReader = reader(null), registeredScope = scope();
  const newPicker = () => createMediaThumbnails(document, () => registeredReader(), viewer, { selected: () => selected?.id ?? null,
    choose(id) { const s = expected(), record = projectMediaResources(source().provider).find(r => r.id === id)?.record;
      if (s && record && !host.block('captions') && !draft && !removal) { selected = { ...s, id, record }; host.changed(); } } });
  let picker = newPicker();
  stored.addEventListener('toggle', () => { if (!disposed) picker.render(presentationActive && stored.open); });
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
  const form = make('section'), formTitle=make('p'), input = make('input'); input.setAttribute('aria-label', 'メディアの説明'); form.setAttribute('aria-label', '説明の編集');
  const apply = button('説明を適用', () => {
    const d = draft; if (!d || d.composing || host.block('captions') || !isCurrent(d) || uncertainty()) return;
    try { const value = host.ports.mediaDescription(d.raw);
      const focus = rememberFocus(apply, d.attachmentId, true);
      host.dispatch('captions', d.token, { kind: 'editAttachment', sceneId: d.sceneId, captionId: d.captionId, attachmentId: d.attachmentId, field: 'altText', value }, () => {
        if (rows(d.captionId).find(r => r.id === d.attachmentId)?.alt !== value) throw Error('説明の適用結果を確認できません。入力を保持しています。');
        draft = null; if (focus) focus.completed = true; host.message('メディアの説明を適用しました。');
      });
    } catch (error) { message = (error as Error).message; host.changed(); }
  });
  const cancel = button('取り消す', () => { if (!host.block('captions', false) && !draft?.composing) {
    const focus = draft && rememberFocus(cancel, draft.attachmentId, true); draft = null; if (focus) focus.completed = true; message = ''; host.changed();
  } }); form.append(formTitle,input, apply, cancel);
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
  root.append(galleryHost, waiting, stored, form, confirmation, status);
  editOnly(stored, form, confirmation);
  function render(active = true) {
    presentationActive = active;
    if (disposed) return; const s = source(), block = host.block('captions'), local = host.block('captions', false), uncertain = uncertainty(), currentScope = scope();
    if (registeredScope !== currentScope) { registeredScope = currentScope; registeredReader = reader(null); picker.dispose(); picker = newPicker();
      picker.root.setAttribute('aria-label', 'メディアを選択'); stored.insertBefore(picker.root, attach); }
    const nextGallery = JSON.stringify([currentScope, s.captionId]);
    if (galleryKey !== nextGallery) { galleryKey = nextGallery; gallery?.dispose(); actionCards.clear();gallery = s.captionId ? createMediaThumbnails(document, reader(s.captionId), viewer, undefined, attachmentTools) : undefined;
      galleryHost.replaceChildren(); if (gallery) galleryHost.append(gallery.root); }
    gallery?.render(active); picker.render(active && stored.open); viewer.render();
    const retained = new Set(s.captionId ? rows(s.captionId).map(row => row.id) : []);
    for (const id of actionCards.keys()) if (!retained.has(id)) actionCards.delete(id);
    waiting.hidden = active || !s.captionId || !rows(s.captionId).length;
    root.hidden = !s.captionId && !owned(); stored.hidden = !projectMediaResources(s.provider).length;
    attach.disabled = !!block || !!draft || !!removal || !selected || !isCurrent(selected) || !!uncertain;
    cancelSelection.hidden = !selected; cancelSelection.disabled = !!local;
    const activeDraft=draft;form.hidden = !activeDraft;formTitle.textContent=activeDraft?`${rows(activeDraft.captionId).find(row=>row.id===activeDraft.attachmentId)?.label??'添付'}の説明`:''; input.readOnly = !!local; if (!draft?.composing) input.value = draft?.raw ?? '';
    apply.disabled = !!block || !draft || draft.composing || !isCurrent(draft) || !!uncertain; cancel.disabled = !!local || !!draft?.composing;
    confirmation.hidden = !removal; detach.disabled = !!block || !removal || !isCurrent(removal) || !!uncertain;
    question.textContent = removal ? `「${removal.label}」の添付を解除しますか？ 同じ記録を使う全シーンに反映されます。元のメディアと、別の記録への添付は残ります。` : '';
    const unavailable = s.provider.issues.some(issue => issue.kind === 'unverified' && issue.code === 'verified-media-bytes-required' && issue.path[0] === 'mediaResourcesById');
    status.textContent = [message, uncertain, unavailable && 'この環境では利用できない登録メディアがあります。対応するブラウザで確認してください。',
      (selected && !isCurrent(selected) || draft && !isCurrent(draft) || removal && !isCurrent(removal)) && '対象が更新されています。入力と操作を保持しています。取り消して選び直してください。'].filter(Boolean).join(' ');
    const focus = returnFocus;
    if (focus && (!active || focus.scope !== currentScope || focus.captionId !== s.captionId || !retained.has(focus.attachmentId))) returnFocus = null;
    else if (focus && !block && !owned()) {
      if (!focus.completed) returnFocus = null;
      else queueMicrotask(() => {
        if (disposed || returnFocus !== focus) return; returnFocus = null;
        if (scope() !== focus.scope || caption() !== focus.captionId || host.block('captions') || owned() || uncertainty() ||
          document.activeElement !== focus.origin && document.activeElement !== document.body) return;
        const card = actionCards.get(focus.attachmentId);
        const target = focus.editing ? card?.edit : [focus.origin, ...(card?.moves ?? []), card?.edit].find(node => node && !node.disabled);
        if (target?.isConnected) target.focus({ preventScroll: false });
      });
    }
  }
  function attachmentTools(id: string): HTMLElement | null {
      const old = actionCards.get(id); if (old) { old.update(); return old.root; }
      const held = expected(), lifetime = scope(); if (!held) return null;
      const card = make('section'), organize=make('details'); organize.append(make('summary','添付を整理')); organize.open=expanded.has(id);
      const current = (action = false) => {
        if (action && !card.isConnected) return null;
        const now = expected(); if (!now || now.captionId !== held.captionId || scope() !== lifetime || actionCards.get(id)?.root !== card || !isCurrent(now)) return null;
        const items = rows(now.captionId), index = items.findIndex(row => row.id === id), row = items[index];
        return row ? { scope: now, items, index, row } : null;
      };
      organize.addEventListener('toggle',()=>{if(organize.open)expanded.add(id);else expanded.delete(id);});editOnly(organize);card.append(organize);
      const edit = button('説明を編集', () => {
        const live = current(true); if (!live || host.block('captions') || owned() || uncertainty() || live.row.fields.altText?.kind !== 'value') return;
        draft = { ...live.scope, attachmentId: id, raw: live.row.alt, composing: false }; host.changed();input.focus?.({preventScroll:true});input.scrollIntoView?.({block:'nearest'});
      }); organize.append(edit);
      const moves: HTMLButtonElement[] = [];
      for (const [offset, label] of [[-1, '前へ'], [1, '後へ']] as const) {
        const move = button(label, () => { const live = current(true); if (!live || host.block('captions') || owned() || uncertainty() || live.index + offset < 0 || live.index + offset >= live.items.length) return;
          try { const rest = live.items.filter(r => r.id !== id), at = live.index + offset, value = host.ports.viewOrder(rest[at - 1]?.order ?? null, rest[at]?.order ?? null), focus = rememberFocus(move, id, false);
            host.dispatch('captions', live.scope.token, { kind: 'editAttachment', sceneId: live.scope.sceneId, captionId: live.scope.captionId, attachmentId: id, field: 'orderKey', value }, () => {
              if (focus) focus.completed = true; host.message('添付の順序を変更しました。');
            });
          } catch (error) { message = (error as Error).message; host.changed(); }
        }); moves.push(move); organize.append(move);
      }
      const remove = button('添付を解除', () => { const live = current(true); if (live && !host.block('captions') && !owned() && !uncertainty()) { removal = { ...live.scope, attachmentId: id, label: live.row.label }; host.changed(); } });
      organize.append(remove);
      const update = () => {
        const live = current(), blocked = !live || !!host.block('captions') || owned() || !!uncertainty();
        for (const move of moves) move.hidden = !live || live.items.length < 2;
        if (live) card.setAttribute('aria-label', `添付 ${live.index + 1} ${live.row.label}`);
        edit.disabled = blocked || live?.row.fields.altText?.kind !== 'value'; remove.disabled = blocked;
        moves.forEach((move, index) => { const offset = index ? 1 : -1; move.disabled = blocked || live!.index + offset < 0 || live!.index + offset >= live!.items.length; });
        if (draft?.attachmentId === id || removal?.attachmentId === id) organize.open = true;
      };
      actionCards.set(id,{root:card,edit,moves,update});update();return card;
  }
  return { root, render, hasChanges: owned, composing: () => !!draft?.composing,
    gallery(captionId: string) {
      let lifetime = scope(), read = reader(captionId);
      const thumbs = createMediaThumbnails(document, () => read(), viewer); thumbs.root.setAttribute('aria-label', '添付メディア');
      return { root: thumbs.root, render(active = true) { if (lifetime !== scope()) { lifetime = scope(); read = reader(captionId); } thumbs.render(active); }, dispose: thumbs.dispose };
    },
    dispose() { disposed = true; returnFocus = null; document.removeEventListener?.('focusin', movedFocus); gallery?.dispose(); picker.dispose(); actionCards.clear();bodies.clear(); root.remove(); } } satisfies ProjectPanel & { gallery(captionId: string): { root: HTMLElement; render(active?: boolean): void; dispose(): void } };
}
