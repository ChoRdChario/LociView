/** Local image inspection only; never changes the attachment or Project. */
export function createMediaImageViewport(document: Document, viewport: HTMLElement) {
  const toolbar = document.createElement('div'), imageHost = document.createElement('div'), percentage = document.createElement('output');
  toolbar.className = 'lv-media-image-tools'; toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', '画像の表示');
  imageHost.className = 'lv-media-zoom-canvas'; percentage.setAttribute('aria-label', '画像の表示倍率');
  const action = (text: string, run: () => void) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.addEventListener('click', () => { if (!disposed && !button.disabled) run(); }); return button; };
  let image: HTMLImageElement | null = null, scale = 1, fitting = true, disposed = false;
  let dragging: { id: number; x: number; y: number; left: number; top: number } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  const releaseTouches = () => {
    const ids = [...touches.keys()]; touches.clear();
    for (const id of ids) if (viewport.hasPointerCapture?.(id)) viewport.releasePointerCapture?.(id);
  };
  const stopDrag = () => { const held = dragging; dragging = null; viewport.dataset.panning = 'false';
    if (held && viewport.hasPointerCapture?.(held.id)) viewport.releasePointerCapture?.(held.id); };
  const dimensions = () => image && image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  const size = () => ({ width: Math.max(1, viewport.clientWidth || 1), height: Math.max(1, viewport.clientHeight || 1) });
  const fitScale = () => { const data = dimensions(), box = size(); return data ? Math.min(1, box.width / data.width, box.height / data.height) : 1; };
  const movable = () => { const data = dimensions(), box = size(); return !!data && (data.width * scale > box.width + 1 || data.height * scale > box.height + 1); };
  const layout = () => {
    const data = dimensions(), box = size(); toolbar.hidden = !image; viewport.tabIndex = image ? 0 : -1;
    if(image){viewport.setAttribute('role','region');viewport.setAttribute('aria-label','画像の表示領域');viewport.setAttribute('aria-description','2本指で拡大・縮小できます。拡大後はドラッグ、スクロールバー、Shiftと矢印キーで移動できます。');}
    else{viewport.removeAttribute('role');viewport.removeAttribute('aria-label');viewport.removeAttribute('aria-description');}
    for (const button of [fit, original, smaller, larger]) button.disabled = !data;
    percentage.textContent = data ? `${Math.round(scale * 1000) / 10}%` : '';
    viewport.className = viewport.className.replace(/\s*lv-media-zoom-viewport\b/g, '') + (image ? ' lv-media-zoom-viewport' : '');
    if (!data || !image) { imageHost.style.width = imageHost.style.height = ''; viewport.dataset.zoomed = 'false'; return; }
    if (fitting) scale = fitScale();
    const width = data.width * scale, height = data.height * scale;
    imageHost.style.width = `${Math.max(box.width, width)}px`; imageHost.style.height = `${Math.max(box.height, height)}px`;
    image.style.width = `${width}px`; image.style.height = `${height}px`;
    image.style.left = `${Math.max(0, (box.width - width) / 2)}px`; image.style.top = `${Math.max(0, (box.height - height) / 2)}px`;
    smaller.disabled = scale <= fitScale() + 1e-10; larger.disabled = scale >= 8;
    percentage.textContent = `${Math.round(scale * 1000) / 10}%`; viewport.dataset.zoomed = String(movable());
  };
  const zoom = (next: number, point?: { x: number; y: number }) => {
    const data = dimensions(); if (!data || !image) return;
    const box = size(), at = point ?? { x: box.width / 2, y: box.height / 2 }, before = scale;
    const left = Math.max(0, (box.width - data.width * before) / 2), top = Math.max(0, (box.height - data.height * before) / 2);
    const x = ((viewport.scrollLeft || 0) + at.x - left) / before, y = ((viewport.scrollTop || 0) + at.y - top) / before;
    fitting = false; scale = Math.max(fitScale(), Math.min(8, next)); layout();
    viewport.scrollLeft = Math.max(0, x * scale - at.x + Math.max(0, (box.width - data.width * scale) / 2));
    viewport.scrollTop = Math.max(0, y * scale - at.y + Math.max(0, (box.height - data.height * scale) / 2));
  };
  const showAll = () => { fitting = true; layout(); viewport.scrollLeft = viewport.scrollTop = 0; };
  const fit = action('全体', showAll), original = action('原寸', () => zoom(1));
  const smaller = action('縮小', () => zoom(scale / 1.25)), larger = action('拡大', () => zoom(scale * 1.25));
  toolbar.append(fit, original, smaller, larger, percentage);
  const wheel = (event: WheelEvent) => { if (!dimensions() || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !event.deltaY) return;
    const rect = viewport.getBoundingClientRect(); event.preventDefault(); zoom(scale * (event.deltaY < 0 ? 1.25 : 1 / 1.25), { x: event.clientX - rect.left, y: event.clientY - rect.top }); };
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      if (!dimensions() || touches.size >= 2) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      viewport.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0 || !movable() || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); viewport.focus({ preventScroll: true }); dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft || 0, top: viewport.scrollTop || 0 };
    viewport.setPointerCapture?.(event.pointerId); viewport.dataset.panning = 'true'; };
  const move = (event: PointerEvent) => {
    const touch = touches.get(event.pointerId);
    if (touch) {
      const other = [...touches.entries()].find(([id]) => id !== event.pointerId)?.[1];
      const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
      if (other) {
        const before = Math.hypot(touch.x - other.x, touch.y - other.y);
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
        if (before > 1 && after > 1) {
          const rect = viewport.getBoundingClientRect();
          zoom(scale * after / before, { x: (touch.x + other.x) / 2 - rect.left, y: (touch.y + other.y) / 2 - rect.top });
          viewport.scrollLeft -= dx / 2; viewport.scrollTop -= dy / 2;
        }
      } else if (movable()) {
        viewport.scrollLeft -= dx; viewport.scrollTop -= dy;
      }
      touch.x = event.clientX; touch.y = event.clientY;
      return;
    }
    if (!dragging || event.pointerId !== dragging.id) return;
    event.preventDefault(); viewport.scrollLeft = dragging.left - (event.clientX - dragging.x); viewport.scrollTop = dragging.top - (event.clientY - dragging.y); };
  const up = (event: PointerEvent) => {
    if (touches.delete(event.pointerId)) return;
    if (!dragging || event.pointerId !== dragging.id) return;
    stopDrag(); };
  const key = (event: KeyboardEvent) => {
    if (!dimensions() || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); viewport.scrollLeft = (viewport.scrollLeft || 0) + (event.key === 'ArrowLeft' ? -40 : event.key === 'ArrowRight' ? 40 : 0);
      viewport.scrollTop = (viewport.scrollTop || 0) + (event.key === 'ArrowUp' ? -40 : event.key === 'ArrowDown' ? 40 : 0); return;
    }
    if (!['+', '=', '-', '0', '1'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); if (event.key === '0') showAll(); else zoom(event.key === '1' ? 1 : scale * (event.key === '-' ? 1 / 1.25 : 1.25));
  };
  viewport.addEventListener('wheel', wheel, { passive: false }); viewport.addEventListener('pointerdown', down); viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', up); viewport.addEventListener('pointercancel', up); viewport.addEventListener('lostpointercapture', up); viewport.addEventListener('keydown', key);
  const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!disposed) layout(); }) : null;
  resize?.observe(viewport); document.defaultView?.addEventListener('resize', layout); layout();
  return { toolbar, imageHost, setImage(next: HTMLImageElement | null) {
    if (disposed) return; if (image !== next) { stopDrag();releaseTouches();image = next; fitting = true; scale = 1; viewport.scrollLeft = viewport.scrollTop = 0; }
    layout();
  }, capture() { return { fitting, scale, left: viewport.scrollLeft || 0, top: viewport.scrollTop || 0 }; },
  restore(saved: { fitting: boolean; scale: number; left: number; top: number }) {
    if (disposed || !image) return; fitting = saved.fitting; scale = Math.max(fitScale(), Math.min(8, saved.scale)); layout();
    viewport.scrollLeft = fitting ? 0 : saved.left; viewport.scrollTop = fitting ? 0 : saved.top;
  }, render: layout, dispose() { stopDrag();releaseTouches();disposed = true; image = null; resize?.disconnect(); document.defaultView?.removeEventListener('resize', layout);
    viewport.removeEventListener('wheel', wheel); viewport.removeEventListener('pointerdown', down); viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', up); viewport.removeEventListener('pointercancel', up); viewport.removeEventListener('lostpointercapture', up); viewport.removeEventListener('keydown', key); } };
}
