let nextHelp = 0;
const pointerAnchors = new WeakMap<HTMLElement, (event: PointerEvent) => HTMLElement | null>();
type Placement = { bounds(): DOMRect | null; side: 'left' };
const placements = new WeakMap<HTMLElement, Placement>();
const quietFocus = new WeakSet<HTMLElement>();

/** Return to an input after an action without covering its result with help. */
export function focusWithoutContextHelp(target: HTMLElement, options?: FocusOptions): void {
  quietFocus.add(target);
  try { target.focus(options); } finally { quietFocus.delete(target); }
}

/** Overlapping visual controls can share the same pointer target as their action. */
export function registerContextHelpPointer(root: HTMLElement, resolve: (event: PointerEvent) => HTMLElement | null): () => void {
  pointerAnchors.set(root, resolve); return () => { pointerAnchors.delete(root); };
}

/** Explicit optional copy only. Never infer help from paragraphs or user content. */
export function contextHelp(document: Document, text: string, anchors: readonly HTMLElement[] = [], placement?: Placement): HTMLElement {
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
  if (placement) placements.set(root, placement);
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
  let explicitActivation=false;
  let touchInteraction=false;
  let pointerPosition:{x:number;y:number}|null=null;
  let delay: number | undefined, leaving: number | undefined, pointerFocus = '', disposed = false;
  const element = (target: EventTarget | null) => target && typeof (target as Element).closest === 'function' ? target as HTMLElement : null;
  const pointer = (event: Event) => {
    const target = element(event.target);
    for (let node = target; node; node = node.parentElement) {
      const resolve = pointerAnchors.get(node);
      if (resolve) return { root: node, target: resolve(event as PointerEvent) };
    }
    return { root: null, target };
  };
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
  const interaction = (touch: boolean) => {
    if(touchInteraction===touch)return;
    touchInteraction=touch;if(active)active.note.style.pointerEvents=touch?'auto':'none';
  };
  const overNote = (event: Event) => {
    if(!active)return false;
    const {clientX:x,clientY:y}=event as MouseEvent,rect=active.note.getBoundingClientRect();
    return Number.isFinite(x)&&Number.isFinite(y)&&rect.width>0&&rect.height>0&&x>=rect.left&&x<rect.right&&y>=rect.top&&y<rect.bottom;
  };
  const retainNotePointer = (event: Event) => {
    if(!active||!overNote(event))return false;
    hovered=active.note;cancelLeave();return true;
  };
  const scrollNote = (dx: number,dy: number) => {
    if(!active)return;
    const note=active.note;
    note.scrollTop=Math.max(0,Math.min(Math.max(0,note.scrollHeight-note.clientHeight),note.scrollTop+dy));
    note.scrollLeft=Math.max(0,Math.min(Math.max(0,note.scrollWidth-note.clientWidth),note.scrollLeft+dx));
  };
  const hide = () => {
    cancelDelay(); cancelLeave();
    const shown = active; active = null;explicitActivation=false;
    if (shown) { shown.note.hidden = true; shown.holder.append(shown.note); }
  };
  const position = (next: Source) => {
    const label = next.anchor.closest('label');
    const placementAnchor = label?.getAttribute('data-lv-help-for') === next.note.id ? label : next.anchor;
    const rect = placementAnchor.getBoundingClientRect(), margin = 8;
    const placement = placements.get(next.holder), bounds = placement?.bounds();
    const minX = bounds ? Math.max(margin, bounds.left + margin) : margin,
      maxX = bounds ? Math.min(browser.innerWidth - margin, bounds.right - margin) : browser.innerWidth - margin,
      minY = bounds ? Math.max(margin, bounds.top + margin) : margin,
      maxY = bounds ? Math.min(browser.innerHeight - margin, bounds.bottom - margin) : browser.innerHeight - margin;
    if (bounds) next.note.style.maxWidth = `min(352px, ${Math.max(1, maxX - minX)}px)`;
    next.note.style.left = `${margin}px`; next.note.style.top = `${margin}px`;
    const box = next.note.getBoundingClientRect();
    const right=rect.right??rect.left+rect.width,roomRight=right+8+box.width<=maxX,roomLeft=rect.left-8-box.width>=minX;
    const left = placement?.side==='left'&&roomLeft?rect.left-8-box.width:roomRight?right+8:roomLeft?rect.left-8-box.width:Math.max(minX,Math.min(rect.left,maxX-box.width));
    const preferred=roomRight||roomLeft?rect.top:rect.top-box.height-4>=minY?rect.top-box.height-4:rect.bottom+4;
    const top=Math.max(minY,Math.min(preferred,maxY-box.height));
    next.note.style.left = `${left}px`; next.note.style.top = `${top}px`;
  };
  const show = (next: Source,explicit=false) => {
    if (disposed || !available(next.anchor)) return;
    if (active?.note === next.note) { cancelDelay(); cancelLeave(); active = next;explicitActivation ||= explicit; next.note.style.pointerEvents=touchInteraction?'auto':'none';position(next); return; }
    hide(); active = next;explicitActivation=explicit; next.note.hidden = false;next.note.style.pointerEvents=touchInteraction?'auto':'none'; document.body.append(next.note); position(next);
  };
  const retained = () => !!active && (source(document.activeElement)?.note === active.note ||
    !!hovered && (source(hovered)?.note === active.note || active.note.contains(hovered)));
  const leave = () => { cancelDelay(); cancelLeave(); leaving = browser.setTimeout(() => { leaving = undefined; if (!retained()) hide(); }, 140); };
  const over = (event: Event) => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    // Showing a touch note can synthesize stationary mouse boundary events.
    // A real move/down/key changes modality; layout alone must not disable touch reading.
    if(touchInteraction)return;
    interaction(false);
    pointerPosition={x:(event as PointerEvent).clientX,y:(event as PointerEvent).clientY};
    if(retainNotePointer(event))return;
    const target = element(event.target);
    if (target && active?.note.contains(target)) { hovered = target; cancelLeave(); return; }
    const resolved = pointer(event), next = source(resolved.target); if (!next) return;
    if (hovered === next.anchor) { cancelLeave(); return; }
    hovered = next.anchor; cancelLeave();
    if (!resolved.root && next.anchor.contains(element((event as PointerEvent).relatedTarget))) return;
    if (active?.note === next.note) { active = next; position(next); return; }
    cancelDelay(); pending = next;
    delay = browser.setTimeout(() => { delay = undefined; const wanted = pending; pending = null; if (wanted) show(wanted); }, 2_000);
  };
  const move = (event: Event) => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    const wasTouch=touchInteraction;
    interaction(false);
    pointerPosition={x:(event as PointerEvent).clientX,y:(event as PointerEvent).clientY};
    if(retainNotePointer(event))return;
    if(active&&hovered===active.note){hovered=null;leave();}
    const resolved = pointer(event); if (!resolved.root) {if(wasTouch)over(event);return;}
    const next = source(resolved.target);
    if (next?.anchor === hovered) return;
    if (next) over(event); else { hovered = null; leave(); }
  };
  const out = (event: Event) => {
    if(touchInteraction&&(event as PointerEvent).pointerType!=='touch')return;
    if((event as PointerEvent).pointerType!=='touch'&&retainNotePointer(event))return;
    const target = element(event.target), related = element((event as PointerEvent).relatedTarget);
    if (!target) return;
    const resolved = pointer(event);
    if (resolved.root) {
      if (!resolved.root.contains(related)) { hovered = null; leave(); }
      return;
    }
    const next = source(target);
    if (next?.anchor.contains(related) || active?.note.contains(related)) { hovered = related; return; }
    if (next || active?.note.contains(target)) { hovered = null; leave(); }
  };
  const focus = (event: Event) => {
    const target = element(event.target);
    if (target && quietFocus.has(target)) { hide(); return; }
    const next = source(target); if (next && next.note.id !== pointerFocus) show(next,true);
  };
  const blur = (event: Event) => {
    const related = element((event as FocusEvent).relatedTarget);
    if (active && (source(related)?.note === active.note || active.note.contains(related))) return;
    leave();
  };
  const down = (event: Event) => {
    const touch=(event as PointerEvent).pointerType==='touch';interaction(touch);
    if(touch){pointerPosition=null;hovered=null;cancelDelay();cancelLeave();}
    const next = source(pointer(event).target); pointerFocus = next?.note.id ?? '';
    if (!next && !active?.note.contains(element(event.target))) hide();
  };
  const click = (event: Event) => {
    const resolved = pointer(event);
    if (resolved.root) {
      pointerFocus = source(resolved.target)?.note.id ?? ''; hide();
      // Keep suppression through the control's resolved focus. Tab/next down resets it.
      return;
    }
    pointerFocus = '';
    const trigger = element(event.target)?.closest('.lv-context-help-trigger');
    if (!trigger) return;
    const next = source(trigger); if (!next) return;
    event.preventDefault(); event.stopPropagation();
    if (active?.note === next.note && (event as MouseEvent).detail > 0) hide(); else show(next,true);
  };
  const key = (event: Event) => {
    if((event as KeyboardEvent).isComposing||event.defaultPrevented)return;
    interaction(false);
    const keyboard=event as KeyboardEvent,note=active?.note,focused=element(document.activeElement);
    if(note&&focused&&focused.closest('.lv-context-help-trigger')===focused&&note.scrollHeight>note.clientHeight&&
      !keyboard.ctrlKey&&!keyboard.metaKey&&!keyboard.altKey&&!keyboard.shiftKey){
      const amount=keyboard.key==='PageDown'?note.clientHeight*.9:keyboard.key==='PageUp'?-note.clientHeight*.9:
        keyboard.key==='ArrowDown'?16:keyboard.key==='ArrowUp'?-16:keyboard.key==='Home'?-note.scrollHeight:keyboard.key==='End'?note.scrollHeight:null;
      if(amount!==null){scrollNote(0,amount);event.preventDefault();event.stopPropagation();return;}
    }
    if ((event as KeyboardEvent).key === 'Tab') {pointerFocus = '';pointerPosition=null;}
    if ((event as KeyboardEvent).key !== 'Escape' || !active && !pending) return;
    const visible = !!active; hide();
    if (visible) { event.preventDefault(); event.stopPropagation(); }
  };
  const wheel = (event: WheelEvent) => {
    if(!active||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||!overNote(event))return;
    const note=active.note;if(note.scrollHeight<=note.clientHeight&&note.scrollWidth<=note.clientWidth)return;
    const factor=event.deltaMode===1?16:event.deltaMode===2?note.clientHeight:1;
    scrollNote(event.deltaX*factor,event.deltaY*factor);event.preventDefault();event.stopPropagation();
  };
  const scroll = (event: Event) => {
    if(active?.note.contains(element(event.target)))return;
    // Keyboard/touch notes follow an anchor scrolled into view without reopening
    // one explicitly dismissed with Escape or a second tap.
    if(active&&explicitActivation&&available(active.anchor)){
      position(active);return;
    }
    const previous=pending??active;hide();
    if(!previous||!pointerPosition)return;
    const next=source(document.elementFromPoint(pointerPosition.x,pointerPosition.y));
    hovered=next?.anchor??null;if(!next||!available(next.anchor))return;
    pending=next;delay=browser.setTimeout(()=>{delay=undefined;const wanted=pending;pending=null;if(wanted)show(wanted);},2_000);
  };
  const resize = () => { if(active&&available(active.anchor))position(active);else if(active)hide(); };
  const pointerCancel = () => { pointerFocus = '';pointerPosition=null;cancelDelay(); };
  const listeners: [string, EventListener][] = [['pointerover', over], ['pointermove', move], ['pointerout', out], ['pointerdown', down],
    ['pointercancel', pointerCancel], ['focusin', focus], ['focusout', blur], ['click', click], ['keydown', key], ['scroll', scroll]];
  for (const [name, handler] of listeners) document.addEventListener(name, handler, true);
  document.addEventListener('wheel',wheel,{capture:true,passive:false});
  browser.addEventListener('resize', resize);
  const observer = new MutationObserver(() => {
    if (active && !available(active.anchor)) hide();
    if (pending && !available(pending.anchor)) cancelDelay();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'data-lv-mode', 'data-surface'] });
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
      document.removeEventListener('wheel',wheel,true);
      browser.removeEventListener('resize', resize); managers.delete(document);
    };
  } };
  managers.set(document, manager); return manager.add(root);
}
