import { captionTitle, type CaptionListSource } from './captionListState';
import { captionWindowView, planCaptionWindow, type CaptionWindowIntent, type CaptionWindowMemory,
  type CaptionWindowPlan, type WindowRect } from './captionWindowState';

export interface WindowContext {
  readonly source: CaptionListSource; readonly memory: CaptionWindowMemory;
  readonly selectedId: string | null; readonly moveBlock: string | null;
}
export interface WindowProjection {
  readonly ready: boolean; readonly width: number; readonly height: number;
  readonly pins: readonly { id: string; x: number; y: number; visible: boolean }[];
}
export function displayedWindowRect(preferred: WindowRect, width: number, height: number): WindowRect {
  const w = Math.min(preferred.width, Math.max(1, width)), h = Math.min(preferred.height, Math.max(1, height));
  return { left: Math.max(0, Math.min(preferred.left, width - w)), top: Math.max(0, Math.min(preferred.top, height - h)), width: w, height: h };
}

/** Read-only comparison layer. Selection/drafts/history remain owned by the host. */
export function createCaptionWindowControls(document: Document, onPlan: (plan: CaptionWindowPlan) => boolean,
  onMoving: (active: boolean) => void,
  content?: (captionId: string) => { root: HTMLElement; render(): void; dispose(): void }) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
  const button = (text: string) => { const n = make('button', text); n.type = 'button'; return n; };
  const root = make('div'); root.className = 'lv-caption-windows'; root.setAttribute('aria-label', 'キャプションのウィンドウ');
  const tools = make('div'); tools.className = 'lv-caption-window-tools';
  const label = make('label', 'ウィンドウ '), front = make('select'); front.setAttribute('aria-label', '前面にするウィンドウ');
  label.append(front); const arrange = button('ウィンドウを並べる'), status = make('p'); status.setAttribute('role', 'status');
  tools.append(label, arrange, status);
  type Card = { root: HTMLElement; title: HTMLButtonElement; body: HTMLElement; note: HTMLElement;
    content?: ReturnType<NonNullable<typeof content>>;
    close: HTMLButtonElement; line: HTMLElement; rect: WindowRect; initial: WindowRect; cleanups: (() => void)[] };
  const cards = new Map<string, Card>();
  const initialPositions = new Map<string, Map<string, WindowRect>>();
  let context: WindowContext | null = null, projection: WindowProjection = { ready: false, width: 0, height: 0, pins: [] };
  let disposed = false, scope = '', optionKey = '';
  let drag: { id: string; pointer: number; startX: number; startY: number; base: WindowRect; rect: WindowRect; context: WindowContext } | null = null;
  function plan(intent: CaptionWindowIntent, base = context) { return base && planCaptionWindow(base.source, base.memory, base.selectedId, intent); }
  function apply(intent: CaptionWindowIntent) {
    if (disposed || drag) return false;
    const proposed = plan(intent); return proposed ? onPlan(proposed) : false;
  }
  function endDrag(commit: boolean) {
    const old = drag; if (!old) return; drag = null;
    const title = cards.get(old.id)?.title;
    if (title?.hasPointerCapture?.(old.pointer)) title.releasePointerCapture(old.pointer);
    onMoving(false);
    if (commit) { const proposed = plan({ kind: 'place', captionId: old.id, rect: old.rect }, old.context); if (proposed) onPlan(proposed); }
    paint();
  }
  function removeCard(card: Card) { for (const cleanup of card.cleanups) cleanup(); card.content?.dispose(); card.root.remove(); card.line.remove(); }
  function createCard(id: string): Card {
    let positions = initialPositions.get(scope); if (!positions) { positions = new Map(); initialPositions.set(scope, positions); }
    const initial = positions.get(id) ?? { left: 16 + positions.size * 32, top: 16 + positions.size * 28, width: 280, height: 200 };
    positions.set(id, initial);
    const node = make('section'), header = make('header'), title = button(''), close = button('×');
    node.className = 'lv-caption-window'; close.setAttribute('aria-label', '閉じる');
    title.className = 'lv-caption-window-title'; title.title = 'ドラッグまたは矢印キーで移動。Escで取り消し';
    const body = make('div'), scroll = make('div'), note = make('p'), line = make('div'), extension = content?.(id);
    body.className = 'lv-caption-window-text'; scroll.className = 'lv-caption-window-body'; note.className = 'lv-caption-window-note';
    scroll.append(body); if (extension) scroll.append(extension.root);
    line.className = 'lv-caption-window-line'; line.setAttribute('aria-hidden', 'true');
    header.append(title, close); node.append(header, scroll, note); root.append(line, node);
    const card: Card = { root: node, title, body, note, close, line,
      rect: initial, initial, cleanups: [], content: extension };
    const listen = (element: HTMLElement, type: string, fn: (event: Event) => void) => {
      element.addEventListener(type, fn); card.cleanups.push(() => element.removeEventListener(type, fn));
    };
    listen(close, 'click', () => apply({ kind: 'close', captionId: id }));
    listen(title, 'click', () => apply({ kind: 'front', captionId: id }));
    listen(title, 'keydown', event => {
      const e = event as KeyboardEvent;
      if (e.key === 'Escape' && drag?.id === id) { e.preventDefault(); endDrag(false); return; }
      const steps: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
      const step = steps[e.key]; if (!step || !context || drag) return;
      e.preventDefault(); if (context.moveBlock) { status.textContent = context.moveBlock; return; }
      apply({ kind: 'place', captionId: id, rect: displayedWindowRect({ ...card.rect,
        left: card.rect.left + step[0], top: card.rect.top + step[1] }, projection.width, projection.height) });
    });
    listen(title, 'pointerdown', event => {
      const e = event as PointerEvent;
      if (e.button !== 0 || disposed || !context || drag || !projection.width || !projection.height) return;
      if (context.moveBlock) { status.textContent = context.moveBlock; return; }
      e.preventDefault();
      if (!apply({ kind: 'front', captionId: id })) return;
      title.focus({ preventScroll: true }); title.setPointerCapture?.(e.pointerId);
      drag = { id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, base: card.rect, rect: card.rect, context };
      onMoving(true);
    });
    listen(title, 'pointermove', event => {
      const e = event as PointerEvent; if (drag?.id !== id || drag.pointer !== e.pointerId) return;
      drag.rect = displayedWindowRect({ ...drag.base, left: drag.base.left + e.clientX - drag.startX,
        top: drag.base.top + e.clientY - drag.startY }, projection.width, projection.height); paint();
    });
    listen(title, 'pointerup', event => { if (drag?.id === id && drag.pointer === (event as PointerEvent).pointerId) endDrag(true); });
    for (const type of ['pointercancel', 'lostpointercapture']) listen(title, type, () => { if (drag?.id === id) endDrag(false); });
    return card;
  }
  function paint() {
    if (disposed || !context) return;
    const view = captionWindowView(context.source, context.memory, context.selectedId);
    root.hidden = projection.width <= 0 || projection.height <= 0;
    for (const [id, card] of cards) {
      const index = view.visibleIds.indexOf(id);
      const preferred = context.memory.placements.find(p => p.captionId === id)?.rect ?? card.initial;
      card.rect = displayedWindowRect(drag?.id === id ? drag.rect : preferred, projection.width, projection.height);
      Object.assign(card.root.style, { left: `${card.rect.left}px`, top: `${card.rect.top}px`,
        width: `${card.rect.width}px`, height: `${card.rect.height}px`, zIndex: String(index + 2) });
      const item = context.source.kind === 'ready' ? context.source.captions.find(c => c.id === id) : null;
      const pin = projection.ready && item?.pin === 'visible'
        ? projection.pins.find(p => p.id === id && p.visible && Number.isFinite(p.x) && Number.isFinite(p.y)) : undefined;
      const r = card.rect, x = pin ? Math.max(r.left, Math.min(pin.x, r.left + r.width)) : 0,
        y = pin ? Math.max(r.top, Math.min(pin.y, r.top + r.height)) : 0;
      const distance = pin ? Math.hypot(pin.x - x, pin.y - y) : 0;
      card.line.hidden = !pin || distance === 0;
      if (pin) Object.assign(card.line.style, { left: `${x}px`, top: `${y}px`, width: `${distance}px`,
        transform: `rotate(${Math.atan2(pin.y - y, pin.x - x)}rad)` });
    }
  }
  function render(next: WindowContext) {
    if (disposed) return;
    if (drag && (drag.context.source.token !== next.source.token || drag.context.memory !== next.memory || drag.context.selectedId !== next.selectedId))
      endDrag(false);
    if (scope !== next.source.sceneId) { for (const card of cards.values()) removeCard(card); cards.clear(); scope = next.source.sceneId; }
    context = next; const view = captionWindowView(next.source, next.memory, next.selectedId);
    for (const [id, card] of cards) if (!view.visibleIds.includes(id)) { removeCard(card); cards.delete(id); }
    for (const id of view.visibleIds) {
      const item = next.source.kind === 'ready' ? next.source.captions.find(c => c.id === id)! : null; if (!item) continue;
      let card = cards.get(id); if (!card) { card = createCard(id); cards.set(id, card); }
      const title = captionTitle(item); if (card.title.textContent !== title) card.title.textContent = title;
      card.root.setAttribute('aria-label', title);
      const body = item.body.kind === 'value' ? item.body.value : '本文の更新候補を確認してください。';
      if (card.body.textContent !== body) card.body.textContent = body;
      card.content?.render();
      card.note.textContent = item.pin === 'needsReview' ? 'ピン位置の確認が必要です。' : item.pin === 'ownerHidden' ? 'モデルは非表示です。' :
        item.pin === 'unavailable' ? 'ピンの状態を確認してください。' : '';
      card.note.hidden = !card.note.textContent;
      card.close.disabled = Boolean(drag);
    }
    const key = JSON.stringify(view.visibleIds.map(id => [id, cards.get(id)?.title.textContent]));
    if (key !== optionKey) {
      optionKey = key; front.replaceChildren(...view.visibleIds.map(id => { const o = make('option', cards.get(id)!.title.textContent ?? ''); o.value = id; return o; }));
    }
    front.value = view.visibleIds.at(-1) ?? ''; front.disabled = arrange.disabled = Boolean(drag) || !view.visibleIds.length;
    tools.hidden = !view.visibleIds.length && !view.suppressedIds.length && !view.issue;
    status.textContent = view.issue ?? (view.suppressedIds.length ? '表示できない比較項目があります。保持内容は変更していません。' : '');
    paint();
  }
  const changeFront = () => { if (!disposed && !front.disabled) apply({ kind: 'front', captionId: front.value }); };
  const arrangeAll = () => {
    if (!context || disposed || arrange.disabled || !projection.width || !projection.height) return;
    const ids = captionWindowView(context.source, context.memory, context.selectedId).visibleIds;
    const columns = Math.max(1, Math.floor(projection.width / 296));
    apply({ kind: 'arrange', placements: ids.map((captionId, i) => ({ captionId,
      rect: displayedWindowRect({ left: (i % columns) * 296, top: Math.floor(i / columns) * 216, width: 280, height: 200 }, projection.width, projection.height) })) });
  };
  front.addEventListener('change', changeFront); arrange.addEventListener('click', arrangeAll);
  return { root, tools, render, project(next: WindowProjection) { projection = next; paint(); },
    dispose() { if (disposed) return; endDrag(false); disposed = true; for (const card of cards.values()) removeCard(card);
      cards.clear(); front.removeEventListener('change', changeFront); arrange.removeEventListener('click', arrangeAll); root.remove(); tools.remove(); } };
}
