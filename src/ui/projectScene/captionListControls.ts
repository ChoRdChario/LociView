import { captionColorKey, captionListView, captionOwnerLabel, captionTitle, ownerFilterKey, planCaptionList,
  type CaptionListContext, type CaptionListIntent, type CaptionListPlan, type CaptionListRow } from './captionListState';
import { sceneSwitchReason } from './navigationState';

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
  const ownerLabel = make('label', 'モデル'), owner = make('select'); owner.setAttribute('aria-label', 'モデル');
  ownerLabel.append(owner); filters.append(searchLabel, ownerLabel);
  const status = make('p'); status.className = 'lv-caption-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const reveal = button('選択した項目を表示'); reveal.hidden = true;
  const count = make('p'); count.className = 'lv-caption-count';
  const colorBar = make('div'); colorBar.className = 'lv-caption-colors';
  colorBar.setAttribute('role', 'group'); colorBar.setAttribute('aria-label', '3Dピンの色');
  const colorLabel = make('span', '3Dピンの色'), colorChoices = make('div'), all = button('全色'), unknown = make('span');
  colorChoices.className = 'lv-caption-color-choices'; unknown.className = 'lv-caption-note';
  colorBar.append(colorLabel, colorChoices, all, unknown);
  const list = make('ul'); list.className = 'lv-caption-list'; list.setAttribute('aria-label', 'キャプション一覧');
  const empty = make('li'); empty.className = 'lv-caption-empty';
  root.append(filters, status, reveal, count, colorBar, list);
  let context: CaptionListContext | undefined, composing = false, disposed = false, rendering = false;
  let observedScrollTop = 0;
  let ownerFingerprint = '';
  const cleanups: (() => void)[] = [];
  const listen = (node: HTMLElement, event: string, handler: () => void) => {
    node.addEventListener(event, handler); cleanups.push(() => node.removeEventListener(event, handler));
  };
  const request = (intent: CaptionListIntent) => {
    if (!context || disposed) return;
    const plan = planCaptionList(context, intent);
    owner.value = ownerFilterKey(context.memory.ownerFilter);
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
  listen(owner, 'change', () => {
    if (!context) return;
    const choice = owner.value === 'all' ? { kind: 'all' as const }
      : captionListView(context.source, context.memory).owners.find(item => ownerFilterKey(item.filter) === owner.value)?.filter;
    if (choice) request({ kind: 'owner', filter: choice });
    else { owner.value = ownerFilterKey(context.memory.ownerFilter); status.textContent = 'モデルを選び直してください。'; status.hidden = false; }
  });
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
    }
    entry.title.textContent = captionTitle(item); entry.owner.textContent = captionOwnerLabel(item);
    entry.select.setAttribute('aria-current', String(item.id === context!.memory.selectedCaptionId));
    entry.swatch.style.backgroundColor = row.color ?? ''; entry.swatch.hidden = row.color === null;
    const notes: string[] = [];
    if (item.body.kind !== 'value') notes.push('本文を確認');
    if (item.mediaCount.kind !== 'value') notes.push('メディアを確認');
    else if (item.mediaCount.value > 0) notes.push(`メディア ${item.mediaCount.value}`);
    if (!row.color) notes.push('色を確認');
    if (row.uncertainMatch) notes.push('絞り込み条件を確認');
    if (item.pin === 'ownerHidden') notes.push('モデル非表示');
    else if (item.pin === 'needsReview') notes.push('ピン位置を確認');
    else if (item.pin === 'unavailable') notes.push('ピンを表示できません');
    if (row.colorHidden) notes.push('ピン非表示（色）');
    const needsReview = item.title.kind !== 'value' || item.body.kind !== 'value' || item.owner.kind !== 'value' ||
      (item.owner.kind === 'value' && item.owner.value.kind === 'asset' && item.owner.value.name.kind !== 'value') ||
      item.mediaCount.kind !== 'value' || !row.color || row.uncertainMatch || item.pin === 'needsReview' || item.pin === 'unavailable';
    const showModel = item.pin === 'ownerHidden' && item.owner.kind === 'value' && item.owner.value.kind === 'asset';
    entry.effect = showModel ? 'showModel' : 'review'; entry.action.textContent = showModel ? 'モデルを表示' : '状態を確認';
    entry.action.hidden = !showModel && !needsReview;
    entry.action.disabled = context!.pending !== null || (showModel && context!.mutationBlock !== null);
    if (showModel && context!.mutationBlock) notes.push(context!.mutationBlock);
    entry.note.textContent = notes.join(' · ');
    return entry.node;
  }
  /** false means the host must keep the old Scene until search composition ends. */
  function render(next: CaptionListContext): boolean {
    if (disposed) return false;
    if (composing && context && context.source.sceneId !== next.source.sceneId) {
      status.textContent = '文字の入力を確定してください。'; status.hidden = false; return false;
    }
    context = next; rendering = true;
    const view = captionListView(next.source, next.memory), active = document.activeElement;
    const hadFocus = active !== null && root.contains(active);
    if (!composing) search.value = next.memory.search;
    search.disabled = Boolean(view.issue) && !composing; owner.disabled = Boolean(view.issue);
    const ownerKey = ownerFilterKey(next.memory.ownerFilter);
    const missingOwner = ownerKey !== 'all' && !view.owners.some(item => ownerFilterKey(item.filter) === ownerKey);
    const fingerprint = JSON.stringify([view.owners, missingOwner ? ownerKey : null]);
    if (fingerprint !== ownerFingerprint) {
      const choices = [{ filter: { kind: 'all' as const }, label: 'すべてのモデル' }, ...view.owners];
      const options = choices.map(choice => { const option = make('option', choice.label); option.value = ownerFilterKey(choice.filter); return option; });
      if (missingOwner) { const option = make('option', '選択したモデルを確認'); option.value = ownerKey; option.disabled = true; options.push(option); }
      owner.replaceChildren(...options); ownerFingerprint = fingerprint;
    }
    owner.value = ownerKey;
    const selectionMessage = next.memory.selectedCaptionId === null ? '' : !view.selected
      ? '選択したキャプションはこのシーンにありません。別の項目を選択してください。'
      : !view.selectionVisible ? '選択したキャプションは絞り込みで非表示です。' : '';
    status.textContent = [view.issue, sceneSwitchReason(next.pending), !view.issue && selectionMessage,
      !view.issue && missingOwner && '選択したモデルが一覧にありません。モデルを選び直してください。'].filter(Boolean).join(' ');
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
    const visibleIds = new Set(view.rows.map(row => row.item.id));
    for (const [id, entry] of rows) if (!visibleIds.has(id)) { entry.cleanup(); entry.node.remove(); rows.delete(id); }
    const nodes = view.rows.map(updateRow);
    if (!nodes.length) { empty.textContent = view.issue ? '一覧を表示できません。' : view.total
      ? '条件に一致するキャプションはありません。' : 'このシーンにキャプションはありません。'; nodes.push(empty); }
    orderChildren(list, nodes);
    list.scrollTop = next.memory.listScrollTop;
    // Ignore the browser's async scroll event for this possibly clamped restore.
    // A shorter filtered list must not replace the user's remembered position.
    observedScrollTop = list.scrollTop;
    if (hadFocus && root.contains(active)) (active as HTMLElement).focus({ preventScroll: true });
    // If filtering removed a focused row/button, leave focus in this task area.
    else if (hadFocus) search.focus({ preventScroll: true });
    rendering = false; return true;
  }
  /** Only the inner list scrolls. Call on explicit pin/list selection, not every refresh. */
  function revealSelected(): void {
    if (!context || disposed || list.clientHeight === 0) return;
    const entry = rows.get(context.memory.selectedCaptionId ?? ''); if (!entry) return;
    const top = entry.node.offsetTop, bottom = top + entry.node.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    request({ kind: 'scroll', top: list.scrollTop });
  }
  function dispose(): void {
    disposed = true; for (const cleanup of cleanups) cleanup();
    for (const entry of colors.values()) entry.cleanup(); for (const entry of rows.values()) entry.cleanup();
    colors.clear(); rows.clear(); root.remove(); if (composing) onComposition(false); composing = false;
  }
  return { root, render, revealSelected, dispose, isComposing: () => composing };
}
