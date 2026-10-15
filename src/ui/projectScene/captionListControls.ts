import { captionColorKey, captionListView, captionOwnerLabel, captionTitle, planCaptionList,
  type CaptionListContext, type CaptionListIntent, type CaptionListPlan, type CaptionListRow } from './captionListState';
import { sceneSwitchReason } from './navigationState';
import { CaptionRowLayout } from './captionRowLayout';

/** Synthetic-port UI only. Host owns metadata, editor drafts and renderer effects. */
export function createCaptionListControls(document: Document, onPlan: (plan: CaptionListPlan) => void,
  onComposition: (active: boolean) => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
    const node = document.createElement(tag); node.textContent = text; return node;
  };
  const button = (text: string) => { const node = make('button', text); node.type = 'button'; return node; };
  const root = make('section'); root.className = 'lv-caption-browser'; root.setAttribute('aria-label', 'キャプション');
  const filters = make('div'); filters.className = 'lv-caption-search';
  const searchLabel = make('label', '検索'), search = make('input');
  search.type = 'search'; search.placeholder = 'タイトル・本文'; search.setAttribute('aria-label', '検索');
  searchLabel.append(search);
  filters.append(searchLabel);
  const status = make('p'); status.className = 'lv-caption-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const reveal = button('選択した項目を表示'); reveal.hidden = true;
  const count = make('p'); count.className = 'lv-caption-count';
  const colorBar = make('div'); colorBar.className = 'lv-caption-colors';
  colorBar.setAttribute('role', 'group'); colorBar.setAttribute('aria-label', 'ピンの色');
  const colorLabel = make('span', 'ピンの色'), colorChoices = make('div'), all = button('全色'), unknown = make('span');
  colorChoices.className = 'lv-caption-color-choices'; unknown.className = 'lv-caption-note';
  colorBar.append(colorLabel, colorChoices, all, unknown);
  const list = make('ul'); list.className = 'lv-caption-list'; list.setAttribute('aria-label', 'キャプション一覧');
  const empty = make('li'); empty.className = 'lv-caption-empty';
  root.append(filters, status, reveal, count, colorBar, list);
  let context: CaptionListContext | undefined, composing = false, disposed = false, rendering = false;
  let observedScrollTop = 0;
  let currentView: ReturnType<typeof captionListView> | undefined, virtual = false, measuredWidth = 0;
  const layout = new CaptionRowLayout(), spacers: HTMLLIElement[] = [];
  const scenePositions = new Map<string, { top: number; anchor: ReturnType<CaptionRowLayout['anchor']> }>();
  const cleanups: (() => void)[] = [];
  const listen = (node: HTMLElement, event: string, handler: () => void) => {
    node.addEventListener(event, handler); cleanups.push(() => node.removeEventListener(event, handler));
  };
  const request = (intent: CaptionListIntent) => {
    if (!context || disposed) return;
    const plan = planCaptionList(context, intent);
    if (plan.kind === 'blocked') { status.textContent = plan.reason; status.hidden = false; }
    onPlan(plan);
  };
  listen(search, 'compositionstart', () => { composing = true; onComposition(true); });
  listen(search, 'compositionend', () => {
    composing = false;
    request({ kind: 'search', query: search.value });
    onComposition(false);
  });
  listen(search, 'input', () => { if (!composing) request({ kind: 'search', query: search.value }); });
  listen(all, 'click', () => request({ kind: 'allColors' }));
  listen(reveal, 'click', () => request({ kind: 'revealSelection' }));
  listen(list, 'scroll', () => {
    if (rendering || list.clientHeight === 0 || list.scrollTop === observedScrollTop) return;
    observedScrollTop = list.scrollTop;
    request({ kind: 'scroll', top: list.scrollTop });
  });
  const colors = new Map<string, { node: HTMLButtonElement; mark: HTMLSpanElement; cleanup: () => void }>();
  const rows = new Map<string, { node: HTMLLIElement; select: HTMLButtonElement; title: HTMLSpanElement;
    owner: HTMLSpanElement; note: HTMLSpanElement; swatch: HTMLSpanElement; action: HTMLButtonElement;
    cleanup: () => void; effect: 'review' | 'showModel' }>();
  const Observer = document.defaultView?.ResizeObserver;
  const observer = Observer ? new Observer(() => {
    if (disposed || rendering || !virtual || list.clientHeight === 0) return;
    rendering = true;
    const anchor = layout.anchor(list.scrollTop), width = list.clientWidth;
    if (width !== measuredWidth) { measuredWidth = width; layout.update(currentView!.rows.map(row => row.item.id), true); }
    measureRows();
    drawRows(layout.restore(anchor, list.scrollTop));
    observedScrollTop = list.scrollTop; rendering = false;
    // Preserve the adjusted anchor in Scene-local memory, not shared metadata.
    if (context && list.scrollTop !== context.memory.listScrollTop) request({ kind: 'scroll', top: list.scrollTop });
  }) : undefined;
  observer?.observe(list);
  // Keep retained nodes in place; never replace the list wholesale on a save refresh.
  const orderChildren = (parent: HTMLElement, children: HTMLElement[]) => {
    const wanted = new Set(children);
    for (const child of [...parent.children]) if (!wanted.has(child as HTMLElement)) child.remove();
    children.forEach((child, index) => { if (parent.children[index] !== child) parent.insertBefore(child, parent.children[index] ?? null); });
  };
  function updateRow(row: CaptionListRow) {
    const { item } = row;
    let entry = rows.get(item.id);
    if (!entry) {
      const node = make('li'), select = button(''), title = make('span'), ownerText = make('span');
      const note = make('span'), swatch = make('span'), action = button('');
      node.className = 'lv-caption-row'; select.className = 'lv-caption-select';
      title.className = 'lv-caption-title'; ownerText.className = 'lv-caption-owner'; note.className = 'lv-caption-note';
      swatch.className = 'lv-caption-swatch'; swatch.setAttribute('aria-hidden', 'true');
      select.append(swatch, title, ownerText, note); node.append(select, action);
      const selectClick = () => request({ kind: 'select', captionId: item.id });
      const actionClick = () => { const current = rows.get(item.id); if (current) request({ kind: current.effect, captionId: item.id }); };
      select.addEventListener('click', selectClick); action.addEventListener('click', actionClick);
      entry = { node, select, title, owner: ownerText, note, swatch, action, effect: 'review', cleanup: () => {
        select.removeEventListener('click', selectClick); action.removeEventListener('click', actionClick);
      } };
      rows.set(item.id, entry);
      observer?.observe(node);
    }
    entry.title.textContent = captionTitle(item); entry.owner.textContent = captionOwnerLabel(item);
    entry.owner.hidden = item.pin === 'visible' && item.owner.kind === 'value';
    entry.select.setAttribute('aria-current', String(item.id === context!.memory.selectedCaptionId));
    entry.swatch.style.backgroundColor = row.color ?? ''; entry.swatch.hidden = row.color === null;
    const notes: string[] = [];
    if (item.body.kind !== 'value') notes.push('本文を確認');
    if (item.mediaCount.kind !== 'value') notes.push('メディアを確認');
    else if (item.mediaCount.value > 0) notes.push(`メディア ${item.mediaCount.value}`);
    if (!row.color) notes.push('色を確認');
    if (row.uncertainMatch) notes.push('絞り込み条件を確認');
    if (item.pin === 'unplaced') notes.push('未配置');
    else if (item.pin === 'ownerHidden') notes.push('モデル非表示');
    else if (item.pin === 'ownerMissing') notes.push('一覧のみ');
    else if (item.pin === 'unavailable') notes.push('ピンを表示できません');
    if (item.needsReview || item.pin === 'needsReview') notes.push('要確認');
    if (row.colorHidden) notes.push('ピン非表示（色）');
    const needsReview = item.title.kind !== 'value' || item.body.kind !== 'value' || item.owner.kind !== 'value' ||
      (item.owner.kind === 'value' && item.owner.value.kind === 'asset' && item.owner.value.name.kind !== 'value') ||
      item.mediaCount.kind !== 'value' || !row.color || row.uncertainMatch || item.needsReview || item.pin === 'needsReview' || item.pin === 'unavailable';
    const showModel = item.pin === 'ownerHidden' && item.owner.kind === 'value' && item.owner.value.kind === 'asset';
    entry.effect = showModel ? 'showModel' : 'review'; entry.action.textContent = showModel ? 'モデルを表示' : '状態を確認';
    entry.action.hidden = !showModel && !needsReview;
    entry.action.disabled = (showModel && context!.showModelPending !== undefined ? context!.showModelPending : context!.pending) !== null || (showModel && context!.mutationBlock !== null);
    if (showModel && context!.mutationBlock) notes.push(context!.mutationBlock);
    entry.note.textContent = notes.join(' · ');
    return entry.node;
  }
  function focusedRow() { return [...rows.entries()].find(([, row]) => row.node.contains(document.activeElement))?.[0]; }
  function measureRows() {
    let changed = false;
    for (const [id, row] of rows) changed = layout.measure(id, row.node.offsetHeight) || changed;
    if (changed) layout.rebuild();
  }
  function drawRows(top: number) {
    const view = currentView!;
    // A retained focused row may be outside the scrolling window; retain only that
    // row, not the thousands of intervening nodes.
    for (let pass = 0; pass < (virtual ? 2 : 1); pass++) {
      const indices = virtual ? layout.window(top, list.clientHeight, focusedRow()) : view.rows.map((_, i) => i);
      const mounted = new Set(indices.map(i => view.rows[i]!.item.id));
      for (const [id, entry] of rows) if (!mounted.has(id)) {
        observer?.unobserve(entry.node); entry.cleanup(); entry.node.remove(); rows.delete(id);
      }
      const nodes: HTMLElement[] = [], updateSpaces: (() => void)[] = []; let end = 0, gap = 0;
      const space = (from: number, to: number) => {
        const height = layout.top(to) - layout.top(from);
        if (height <= 0) return;
        const node = spacers[gap] ?? make('li'); spacers[gap++] = node;
        node.className = 'lv-caption-spacer'; node.setAttribute('aria-hidden', 'true'); node.setAttribute('role', 'presentation');
        const update = () => { node.style.height = `${layout.top(to) - layout.top(from)}px`; };
        update(); updateSpaces.push(update); nodes.push(node);
      };
      for (const index of indices) {
        if (virtual) space(end, index);
        const node = updateRow(view.rows[index]!);
        node.setAttribute('aria-posinset', String(index + 1)); node.setAttribute('aria-setsize', String(view.rows.length));
        nodes.push(node); end = index + 1;
      }
      if (virtual) space(end, view.rows.length);
      if (!view.rows.length) { empty.textContent = view.issue ? '一覧を表示できません。' : view.total
        ? '条件に一致するキャプションはありません。' : 'このシーンにキャプションはありません。'; nodes.push(empty); }
      orderChildren(list, nodes);
      if (virtual) {
        const anchor = layout.anchor(top); measureRows(); top = layout.restore(anchor, top);
        // Newly mounted rows in the last pass must agree with the spacers too.
        // Otherwise the next resize anchors an estimated row, not the visible one.
        updateSpaces.forEach(update => update());
      }
    }
    list.scrollTop = top;
    return top;
  }
  function revealIndex(index: number, focus?: 'select' | 'last') {
    if (!context || !currentView || !currentView.rows[index] || list.clientHeight === 0) return;
    if (virtual) {
      const top = layout.top(index), bottom = layout.top(index + 1);
      drawRows(top < list.scrollTop ? top : bottom > list.scrollTop + list.clientHeight ? Math.min(top, bottom - list.clientHeight) : list.scrollTop);
    }
    const entry = rows.get(currentView.rows[index]!.item.id); if (!entry) return;
    const top = entry.node.offsetTop, bottom = top + entry.node.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = Math.min(top, bottom - list.clientHeight);
    if (focus) (focus === 'last' && !entry.action.hidden && !entry.action.disabled ? entry.action : entry.select).focus({ preventScroll: true });
    request({ kind: 'scroll', top: list.scrollTop });
  }
  const keyboard = (event: KeyboardEvent) => {
    if (!virtual || disposed || composing || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const id = focusedRow(), index = id === undefined ? undefined : layout.index(id); if (index === undefined) return;
    const entry = rows.get(id!)!; let target: number | undefined, focus: 'select' | 'last' = 'select';
    if (!event.shiftKey) {
      if (event.key === 'ArrowDown') target = Math.min(currentView!.rows.length - 1, index + 1);
      else if (event.key === 'ArrowUp') target = Math.max(0, index - 1);
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = currentView!.rows.length - 1;
    }
    if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === entry.select && index > 0) { target = index - 1; focus = 'last'; }
      else if (!event.shiftKey && (document.activeElement === entry.action || entry.action.hidden || entry.action.disabled) && index + 1 < currentView!.rows.length) target = index + 1;
    }
    if (target === undefined) return;
    event.preventDefault(); revealIndex(target, focus);
  };
  list.addEventListener('keydown', keyboard); cleanups.push(() => list.removeEventListener('keydown', keyboard));
  /** false means the host must keep the old Scene until search composition ends. */
  function render(next: CaptionListContext): boolean {
    if (disposed) return false;
    if (composing && context && context.source.sceneId !== next.source.sceneId) {
      status.textContent = '文字の入力を確定してください。'; status.hidden = false; return false;
    }
    const changingScene = context && context.source.sceneId !== next.source.sceneId;
    const visiblePosition = virtual && list.clientHeight > 0 && list.scrollTop === context?.memory.listScrollTop;
    if (context && changingScene && visiblePosition) scenePositions.set(context.source.sceneId,
      { top: list.scrollTop, anchor: layout.anchor(list.scrollTop) });
    const sameView = context && !changingScene && context.memory.search === next.memory.search &&
      JSON.stringify(context.memory.pinColors) === JSON.stringify(next.memory.pinColors);
    const samePosition = sameView && context?.memory.listScrollTop === next.memory.listScrollTop;
    const saved = changingScene ? scenePositions.get(next.source.sceneId) : undefined;
    const oldAnchor = visiblePosition && samePosition ? layout.anchor(list.scrollTop) :
      saved?.top === next.memory.listScrollTop ? saved.anchor : undefined;
    context = next; rendering = true;
    const view = captionListView(next.source, next.memory), active = document.activeElement;
    currentView = view; virtual = view.rows.length > 100;
    // A hidden task has zero width; it has not changed the wrapping width.
    const width = list.clientWidth || measuredWidth;
    layout.update(view.rows.map(row => row.item.id), measuredWidth !== width); measuredWidth = width;
    const hadFocus = active !== null && root.contains(active);
    if (!composing) search.value = next.memory.search;
    search.disabled = Boolean(view.issue) && !composing;
    const selectionMessage = next.memory.selectedCaptionId === null ? '' : !view.selected
      ? '選択したキャプションはこのシーンにありません。別の項目を選択してください。'
      : !view.selectionVisible ? '選択したキャプションは絞り込みで非表示です。' : '';
    status.textContent = [view.issue, sceneSwitchReason(next.pending), !view.issue && selectionMessage].filter(Boolean).join(' ');
    status.hidden = !status.textContent;
    reveal.hidden = !view.selected || view.selectionVisible || Boolean(view.issue);
    count.textContent = view.issue ? '' : `${view.rows.length} / ${view.total}件`;
    all.disabled = Boolean(view.issue); all.setAttribute('aria-pressed', String(next.memory.pinColors === null));
    for (const [color, entry] of colors) if (!view.colors.includes(color)) { entry.cleanup(); entry.node.remove(); colors.delete(color); }
    for (const color of view.colors) {
      let entry = colors.get(color);
      if (!entry) {
        const node = button(''), disc = make('span'), mark = make('span', '✓');
        node.className = 'lv-caption-color'; node.setAttribute('aria-label', `${color}のピン`); node.title = `${color}のピン`;
        disc.className = 'lv-caption-disc'; disc.style.backgroundColor = color; disc.setAttribute('aria-hidden', 'true');
        mark.setAttribute('aria-hidden', 'true'); disc.append(mark); node.append(disc);
        const click = () => request({ kind: 'color', color }); node.addEventListener('click', click);
        entry = { node, mark, cleanup: () => node.removeEventListener('click', click) }; colors.set(color, entry);
      }
      const pressed = next.memory.pinColors === null || next.memory.pinColors.includes(color);
      entry.node.setAttribute('aria-pressed', String(pressed)); entry.mark.hidden = !pressed;
    }
    orderChildren(colorChoices, view.colors.map(color => colors.get(color)!.node));
    const unknownCount = next.source.kind === 'ready' ? next.source.captions.filter(item => !captionColorKey(item.color)).length : 0;
    unknown.textContent = unknownCount ? `色未確認 ${unknownCount}件` : '';
    const measuredTop = drawRows(virtual && oldAnchor ? layout.restore(oldAnchor, next.memory.listScrollTop) : next.memory.listScrollTop);
    // Ignore the browser's async scroll event for this possibly clamped restore.
    // A shorter filtered list must not replace the user's remembered position.
    observedScrollTop = list.scrollTop;
    if (hadFocus && root.contains(active)) (active as HTMLElement).focus({ preventScroll: true });
    // If filtering removed a focused row/button, leave focus in this task area.
    else if (hadFocus) search.focus({ preventScroll: true });
    rendering = false;
    // A measurement adjustment is a new known position, unlike a browser clamp
    // on a hidden/short filtered list. Publish it before the host's next refresh.
    if (virtual && list.clientHeight > 0 && list.scrollTop === measuredTop && measuredTop !== next.memory.listScrollTop)
      request({ kind: 'scroll', top: measuredTop });
    return true;
  }
  /** Only the inner list scrolls. Call on explicit pin/list selection, not every refresh. */
  function revealSelected(): void {
    if (!context || disposed || list.clientHeight === 0) return;
    const index = layout.index(context.memory.selectedCaptionId ?? ''); if (index !== undefined) revealIndex(index);
  }
  function dispose(): void {
    disposed = true; observer?.disconnect(); for (const cleanup of cleanups) cleanup();
    for (const entry of colors.values()) entry.cleanup(); for (const entry of rows.values()) entry.cleanup();
    colors.clear(); rows.clear(); root.remove(); if (composing) onComposition(false); composing = false;
  }
  return { root, render, revealSelected, dispose, isComposing: () => composing };
}
