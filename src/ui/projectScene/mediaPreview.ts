/** Host-verified image bodies only. Imported labels/URLs are never image sources. */
export type PreviewPng = { readonly base64: string; readonly mediaType?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/heic' | 'video/mp4' | 'audio/mp4' | 'audio/mpeg' } | { readonly blob: Blob } | { readonly load: () => Promise<Blob> };
export interface MediaPreviewItem {
  readonly id: string; readonly resourceId: string; readonly label: string;
  readonly description: string; readonly image: PreviewPng | null;
  readonly kind?: 'image'|'video'|'audio';
}
export interface MediaPreviewGroup {
  readonly scope: string; readonly label: string; readonly items: readonly MediaPreviewItem[];
}
export type MediaPreviewReader = () => MediaPreviewGroup | null;
const sameBody = (a: PreviewPng | null, b: PreviewPng | null) => a === b || !!a && !!b &&
  ('base64' in a && 'base64' in b ? a.base64 === b.base64 && (a.mediaType ?? 'image/png') === (b.mediaType ?? 'image/png') : 'blob' in a && 'blob' in b ? a.blob === b.blob : 'load' in a && 'load' in b && a.load === b.load);

/** A new image node per attempt keeps old load/error events out of a retry. */
function createPngPreview(document: Document, read: () => MediaPreviewItem | null, lazy: boolean, imageHost: HTMLElement = document.createElement('div')) {
  const root = document.createElement('div'), error = document.createElement('p'), retry = document.createElement('button');
  root.className = 'lv-media-image'; error.className='lv-operation-status';error.setAttribute('role', 'status'); retry.type = 'button'; retry.textContent = '画像を再試行';
  const loading=(value:boolean)=>{error.dataset.busy=String(value);root.setAttribute('aria-busy',String(value));};
  let body: PreviewPng | null = null, image: HTMLImageElement | null = null, player:HTMLVideoElement|HTMLAudioElement|null=null, release: (() => void) | null = null, disposed = false, epoch = 0;
  function clear() { image?.remove(); image = null; if(player){player.pause();player.removeAttribute('src');player.load();player.remove();player=null;} release?.(); release = null; }
  function load(item: MediaPreviewItem | null) {
    const attempt = ++epoch; clear();loading(false); body = item?.image ?? null;
    const subject=item?.kind&&item.kind!=='image'?'メディア':'画像';retry.textContent=`${subject}を再試行`;
    if(lazy&&item?.kind&&item.kind!=='image'){error.textContent=item.kind==='video'?'動画':'音声';retry.hidden=true;return;}
    if (!item || !body) { error.textContent = `${subject}を読み込めません。添付情報は変更していません。`; retry.hidden = false; return; }
    const expected = body;
    const current = () => { const next = read(); return !disposed && epoch === attempt && next?.id === item.id && next.resourceId === item.resourceId && sameBody(next.image, expected); };
    if ('load' in expected) {
      loading(true);error.textContent = `${subject}を読み込んでいます。`; retry.hidden = true;
      void Promise.resolve().then(() => expected.load()).then(blob => { if (current()) paint(read()!, { blob }); }, () => {
        if (current()) { loading(false);error.textContent = `${subject}を読み込めません。添付情報は変更していません。`; retry.hidden = false; }
      });
    } else paint(item, expected);
  }
  function paint(item: MediaPreviewItem, png: Exclude<PreviewPng, { readonly load: () => Promise<Blob> }>) {
    if(item.kind&&item.kind!=='image'){
      const node=document.createElement(item.kind);player=node;node.controls=true;node.autoplay=false;node.preload='metadata';
      node.setAttribute('aria-label',item.label);if(item.kind==='video')(node as HTMLVideoElement).playsInline=true;
      node.addEventListener('loadeddata',()=>{if(disposed||player!==node)return;loading(false);error.textContent='';retry.hidden=true;});
      node.addEventListener('loadedmetadata',()=>{if(disposed||player!==node)return;loading(false);error.textContent='';});
      node.addEventListener('error',()=>{if(disposed||player!==node)return;loading(false);error.textContent='このブラウザではメディアを再生できません。元のファイルと添付情報は保持しています。';retry.hidden=false;});
      loading(true);error.textContent='メディアを読み込んでいます。';retry.hidden=true;imageHost.append(node);
      try{if('base64'in png)throw Error('動画・音声には保存済みファイルが必要です。');const url=URL.createObjectURL(png.blob);release=()=>URL.revokeObjectURL(url);node.src=url;node.load();}
      catch{loading(false);error.textContent='メディアを読み込めません。';retry.hidden=false;}return;
    }
    const current = document.createElement('img'); image = current; current.draggable = false;
    current.alt = item.description || item.label; current.loading = lazy ? 'lazy' : 'eager'; current.decoding = 'async';
    current.addEventListener('error', () => { if (disposed || image !== current) return;
      loading(false);current.hidden = true; error.textContent = '画像を表示できません。添付情報は変更していません。'; retry.hidden = false; });
    current.addEventListener('load', () => { if (disposed || image !== current) return;
      loading(false);current.hidden = false; error.textContent = ''; retry.hidden = true; });
    loading(true);error.textContent = '画像を読み込んでいます。'; retry.hidden = true; imageHost.append(current);
    try {
      if ('base64' in png) current.src = `data:${png.mediaType ?? 'image/png'};base64,${png.base64}`;
      else { const url = URL.createObjectURL(png.blob); release = () => URL.revokeObjectURL(url); current.src = url; }
    } catch { loading(false);current.hidden = true; error.textContent = '画像を読み込めません。'; retry.hidden = false; }
  }
  retry.addEventListener('click', () => { if (!disposed) load(read()); }); root.append(imageHost, error, retry);
  return { root, render() { if (disposed) return; const item = read();
    if (!sameBody(body, item?.image ?? null) || !image && !player && !error.textContent) load(item);
    if (image && item) image.alt = item.description || item.label;
  }, dispose() { disposed = true; clear(); root.remove(); } };
}

/** One modal per workspace; navigation is local and never edits selection/history. */
export function createMediaViewer(document: Document) {
  const root = document.createElement('dialog'); root.className = 'lv-media-viewer'; root.setAttribute('aria-label', 'メディアビューア');
  const header = document.createElement('header'), title = document.createElement('h2'), closeButton = document.createElement('button');
  closeButton.type = 'button'; closeButton.textContent = '×'; closeButton.setAttribute('aria-label', '閉じる');
  const content = document.createElement('div'), description = document.createElement('p'), status = document.createElement('p');
  content.className = 'lv-media-viewer-content'; status.setAttribute('role', 'status');
  const footer = document.createElement('footer'), previous = document.createElement('button'), next = document.createElement('button'), count = document.createElement('span');
  previous.type = next.type = 'button'; previous.textContent = '←'; next.textContent = '→';
  previous.setAttribute('aria-label', '前のメディア'); next.setAttribute('aria-label', '次のメディア'); count.setAttribute('aria-live', 'polite');
  header.append(title, closeButton); footer.append(previous, count, next); root.append(header, content, description, status, footer);
  let reader: MediaPreviewReader | null = null, scope = '', id = '', resourceId = '', opener: HTMLElement | null = null, disposed = false;
  let preview: ReturnType<typeof createPngPreview> | null = null;
  const selected = () => { const group = reader?.(); return group?.scope === scope ? group.items.find(i => i.id === id && i.resourceId === resourceId) ?? null : null; };
  function close(restore = true) {
    reader = null; preview?.dispose(); preview = null; content.replaceChildren(); root.close();
    if (restore && opener?.isConnected && !(opener as HTMLButtonElement).disabled) opener.focus({ preventScroll: true }); opener = null;
  }
  function render(active = true) {
    if (!reader || disposed) return; if (!active) { close(false); return; }
    const group = reader(); if (!group || group.scope !== scope) { close(false); return; }
    const index = group.items.findIndex(i => i.id === id && i.resourceId === resourceId), item = group.items[index];
    title.textContent = item ? `${group.label} — ${item.label}` : group.label;
    description.textContent = item?.description ?? ''; description.hidden = !description.textContent;
    status.textContent = item ? '' : 'この添付は変更されています。閉じて、メディアを選び直してください。';
    count.textContent = item ? `${index + 1} / ${group.items.length}` : '';
    previous.disabled = index <= 0; next.disabled = index < 0 || index === group.items.length - 1;
    if (!item) { preview?.dispose(); preview = null; content.replaceChildren(); }
    else { if (!preview) { preview = createPngPreview(document, selected, false); content.append(preview.root); } preview.render(); }
  }
  function step(offset: number) {
    if (disposed || !reader) return; const group = reader(); if (!group || group.scope !== scope) { close(false); return; }
    const at = group.items.findIndex(i => i.id === id && i.resourceId === resourceId), item = at < 0 ? undefined : group.items[at + offset];
    if (!item) { render(); return; } id = item.id; resourceId = item.resourceId;
    preview?.dispose(); preview = null; render();
  }
  closeButton.addEventListener('click', () => close()); previous.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
  root.addEventListener('cancel', event => { event.preventDefault(); close(); });
  root.addEventListener('keydown', event => { if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !(event.target as Element|null)?.closest?.('video,audio')) { event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowLeft' ? -1 : 1); } });
  return { root, render, open(read: MediaPreviewReader, itemId: string, from: HTMLElement) {
    if (disposed) return; const group = read(), item = group?.items.find(i => i.id === itemId); if (!group || !item) return;
    reader = read; scope = group.scope; id = item.id; resourceId = item.resourceId; opener = from;
    preview?.dispose(); preview = null; render(); if (!root.open) root.showModal(); closeButton.focus();
  }, dispose() { if (disposed) return; close(false); disposed = true; root.remove(); } };
}
export type MediaViewer = ReturnType<typeof createMediaViewer>;

/** UI pagination bounds mounted thumbnails, not a persisted limit or format constraint. */
const pageSize = 12;
export function createMediaThumbnails(document: Document, read: MediaPreviewReader, viewer: MediaViewer,
  selection?: { selected(): string | null; choose(id: string): void }) {
  const root = document.createElement('section'); root.className = 'lv-media-thumbnails';
  const grid = document.createElement('div'), pages = document.createElement('nav'), back = document.createElement('button'), forward = document.createElement('button'), count = document.createElement('span');
  grid.className = 'lv-media-grid'; back.type = forward.type = 'button'; back.textContent = '前の一覧'; forward.textContent = '次の一覧';
  pages.setAttribute('aria-label', 'メディア一覧のページ'); pages.append(back, count, forward); root.append(grid, pages);
  type Card = { root: HTMLElement; label: HTMLElement; action: HTMLButtonElement; preview: ReturnType<typeof createPngPreview>; resourceId: string };
  const cards = new Map<string, Card>(); let page = 0, scope = '', order = '', disposed = false;
  function render() {
    if (disposed) return; const group = read(); if (scope !== group?.scope) {
      for (const card of cards.values()) { card.preview.dispose(); card.root.remove(); } cards.clear();
      scope = group?.scope ?? ''; page = 0; order = '';
    }
    const items = group?.items ?? []; page = Math.min(page, Math.max(0, Math.ceil(items.length / pageSize) - 1));
    const visible = items.slice(page * pageSize, (page + 1) * pageSize), ids = new Set(visible.map(i => i.id));
    for (const [id, card] of cards) if (!ids.has(id) || card.resourceId !== visible.find(i => i.id === id)?.resourceId) {
      card.preview.dispose(); card.root.remove(); cards.delete(id);
    }
    for (const item of visible) {
      let card = cards.get(item.id);
      if (!card) {
        const heldScope = scope, resourceId = item.resourceId;
        const live = () => { const current = read(); return current?.scope === heldScope ? current.items.find(i => i.id === item.id && i.resourceId === resourceId) ?? null : null; };
        const figure = document.createElement('figure'), label = document.createElement('figcaption'), action = document.createElement('button');
        action.type = 'button'; action.className = 'lv-media-thumbnail-action';
        action.textContent = selection ? item.label : item.kind==='video'?'動画を再生':item.kind==='audio'?'音声を再生':'画像を表示';
        action.setAttribute('aria-label', action.textContent);
        const preview = createPngPreview(document, live, true, action);
        action.addEventListener('click', () => { if (disposed || !live()) return; if (selection) { selection.choose(item.id); render(); } else viewer.open(read, item.id, action); });
        figure.append(preview.root, label);
        if (selection) { const show = document.createElement('button'); show.type = 'button'; show.textContent = item.kind==='video'?'動画を再生':item.kind==='audio'?'音声を再生':'画像を表示';
          show.addEventListener('click', () => { if (!disposed && live()) viewer.open(read, item.id, show); }); figure.append(show); }
        card = { root: figure, label, action, preview, resourceId }; cards.set(item.id, card);
      }
      card.label.textContent = selection ? '' : `${item.label}${item.description ? ` — ${item.description}` : ''}`; card.label.hidden = !!selection;
      if (selection) card.action.setAttribute('aria-pressed', String(selection.selected() === item.id));
      card.preview.render();
    }
    const nextOrder = JSON.stringify([scope, visible.map(i => [i.id, i.resourceId])]);
    if (nextOrder !== order) { order = nextOrder; for (const item of visible) grid.append(cards.get(item.id)!.root); }
    pages.hidden = items.length <= pageSize; back.disabled = page === 0; forward.disabled = (page + 1) * pageSize >= items.length;
    count.textContent = `${page + 1} / ${Math.max(1, Math.ceil(items.length / pageSize))}`; root.hidden = !items.length;
  }
  back.addEventListener('click', () => { if (!back.disabled) { page--; render(); } }); forward.addEventListener('click', () => { if (!forward.disabled) { page++; render(); } });
  return { root, render, dispose() { disposed = true; for (const card of cards.values()) card.preview.dispose(); cards.clear(); root.remove(); } };
}
