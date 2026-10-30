let nextHelp = 0;

/** Explicit optional copy only. Never infer help from paragraphs or user content. */
export function contextHelp(document: Document, text: string, anchors: readonly HTMLElement[] = []): HTMLElement {
  const root = document.createElement('span'), trigger = document.createElement('button'), note = document.createElement('span');
  root.className = 'lv-context-help'; trigger.className = 'lv-context-help-trigger';
  trigger.type = 'button'; trigger.textContent = '?'; trigger.setAttribute('aria-label', '説明');
  note.className = 'lv-context-help-note'; note.id = `lv-context-help-${++nextHelp}`;
  note.textContent = text; note.hidden = true; note.setAttribute('role', 'tooltip');
  const targets = new Set([trigger, ...anchors]);
  for (const anchor of anchors) { const label = anchor.closest?.('label'); if (label) targets.add(label); }
  for (const anchor of targets) {
    anchor.setAttribute('data-lv-help-for', note.id);
    const existing = anchor.getAttribute?.('aria-describedby') ?? '';
    anchor.setAttribute('aria-describedby', [existing, note.id].filter(Boolean).join(' '));
  }
  root.append(trigger, note); return root;
}

type Source = { anchor: HTMLElement; holder: HTMLElement; note: HTMLElement };
type Manager = { add(root: HTMLElement): () => void };
const managers = new WeakMap<Document, Manager>();

/** One UI-owned listener/tooltip lifetime per document, shared by nested hosts. */
export function mountContextHelp(document: Document, root: HTMLElement): () => void {
  const browser = document.defaultView;
  // Static DOM authors/recorders have no browser event or overlay lifetime.
  if (!browser || !document.body) return () => {};
  let manager = managers.get(document);
  if (manager) return manager.add(root);
  const scopes = new Map<HTMLElement, number>();
  let active: Source | null = null, pending: Source | null = null, hovered: HTMLElement | null = null;
  let delay: number | undefined, leaving: number | undefined, pointerFocus = '', disposed = false;
  const element = (target: EventTarget | null) => target && typeof (target as Element).closest === 'function' ? target as HTMLElement : null;
  const owned = (node: HTMLElement) => [...scopes.keys()].some(scope => scope.contains(node));
  const available = (node: HTMLElement) => node.isConnected && owned(node) && (!node.getClientRects || node.getClientRects().length > 0);
  const source = (target: EventTarget | null): Source | null => {
    const anchor = element(target)?.closest<HTMLElement>('[data-lv-help-for]');
    if (!anchor || !owned(anchor)) return null;
    const id = anchor.getAttribute('data-lv-help-for');
    if (active?.note.id === id) return { ...active, anchor };
    const note = id ? document.getElementById(id) : null, holder = note?.parentElement;
    return note && holder ? { anchor, note, holder } : null;
  };
  const cancelDelay = () => { if (delay !== undefined) browser.clearTimeout(delay); delay = undefined; pending = null; };
  const cancelLeave = () => { if (leaving !== undefined) browser.clearTimeout(leaving); leaving = undefined; };
  const hide = () => {
    cancelDelay(); cancelLeave();
    const shown = active; active = null;
    if (shown) { shown.note.hidden = true; shown.holder.append(shown.note); }
  };
  const position = (next: Source) => {
    const rect = next.anchor.getBoundingClientRect(), margin = 8;
    next.note.style.left = `${margin}px`; next.note.style.top = `${margin}px`;
    const box = next.note.getBoundingClientRect();
    const left = Math.max(margin, Math.min(rect.left, browser.innerWidth - box.width - margin));
    const below = rect.bottom + 4;
    const top = below + box.height <= browser.innerHeight - margin ? below : Math.max(margin, rect.top - box.height - 4);
    next.note.style.left = `${left}px`; next.note.style.top = `${top}px`;
  };
  const show = (next: Source) => {
    if (disposed || !available(next.anchor)) return;
    if (active?.note === next.note) { cancelDelay(); cancelLeave(); active = next; position(next); return; }
    hide(); active = next; next.note.hidden = false; document.body.append(next.note); position(next);
  };
  const retained = () => !!active && (source(document.activeElement)?.note === active.note ||
    !!hovered && (source(hovered)?.note === active.note || active.note.contains(hovered)));
  const leave = () => { cancelDelay(); cancelLeave(); leaving = browser.setTimeout(() => { leaving = undefined; if (!retained()) hide(); }, 140); };
  const over = (event: Event) => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    const target = element(event.target);
    if (target && active?.note.contains(target)) { hovered = target; cancelLeave(); return; }
    const next = source(event.target); if (!next) return;
    hovered = next.anchor; cancelLeave();
    if (next.anchor.contains(element((event as PointerEvent).relatedTarget))) return;
    if (active?.note === next.note) { active = next; position(next); return; }
    cancelDelay(); pending = next;
    delay = browser.setTimeout(() => { delay = undefined; const wanted = pending; pending = null; if (wanted) show(wanted); }, 2_000);
  };
  const out = (event: Event) => {
    const target = element(event.target), related = element((event as PointerEvent).relatedTarget);
    if (!target) return;
    const next = source(target);
    if (next?.anchor.contains(related) || active?.note.contains(related)) { hovered = related; return; }
    if (next || active?.note.contains(target)) { hovered = null; leave(); }
  };
  const focus = (event: Event) => { const next = source(event.target); if (next && next.note.id !== pointerFocus) show(next); };
  const blur = (event: Event) => {
    const related = element((event as FocusEvent).relatedTarget);
    if (active && (source(related)?.note === active.note || active.note.contains(related))) return;
    leave();
  };
  const down = (event: Event) => {
    const next = source(event.target); pointerFocus = next?.note.id ?? '';
    if (!next && !active?.note.contains(element(event.target))) hide();
  };
  const click = (event: Event) => {
    pointerFocus = '';
    const trigger = element(event.target)?.closest('.lv-context-help-trigger');
    if (!trigger) return;
    const next = source(trigger); if (!next) return;
    event.preventDefault(); event.stopPropagation();
    if (active?.note === next.note && (event as MouseEvent).detail > 0) hide(); else show(next);
  };
  const key = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Tab') pointerFocus = '';
    if ((event as KeyboardEvent).key !== 'Escape' || !active && !pending) return;
    const visible = !!active; hide();
    if (visible) { event.preventDefault(); event.stopPropagation(); }
  };
  const scroll = (event: Event) => { if (!active?.note.contains(element(event.target))) hide(); };
  const resize = () => hide();
  const pointerCancel = () => { pointerFocus = ''; cancelDelay(); };
  const listeners: [string, EventListener][] = [['pointerover', over], ['pointerout', out], ['pointerdown', down],
    ['pointercancel', pointerCancel], ['focusin', focus], ['focusout', blur], ['click', click], ['keydown', key], ['scroll', scroll]];
  for (const [name, handler] of listeners) document.addEventListener(name, handler, true);
  browser.addEventListener('resize', resize);
  const observer = new MutationObserver(() => {
    if (active && !available(active.anchor)) hide();
    if (pending && !available(pending.anchor)) cancelDelay();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  manager = { add(scope) {
    scopes.set(scope, (scopes.get(scope) ?? 0) + 1); let released = false;
    return () => {
      if (released) return; released = true;
      const count = scopes.get(scope)! - 1; if (count) scopes.set(scope, count); else scopes.delete(scope);
      if (active && !owned(active.anchor)) hide();
      if (pending && !owned(pending.anchor)) cancelDelay();
      if (scopes.size) return;
      disposed = true; hide(); observer.disconnect();
      for (const [name, handler] of listeners) document.removeEventListener(name, handler, true);
      browser.removeEventListener('resize', resize); managers.delete(document);
    };
  } };
  managers.set(document, manager); return manager.add(root);
}
