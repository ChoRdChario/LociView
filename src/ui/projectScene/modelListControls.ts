import { modelListName, modelListPlanIsCurrent, modelListView, modelMembershipIssue, planModelList,
  type ModelListContext, type ModelListIntent, type ModelListPlan, type ModelListRow } from './modelListState';
import { sceneSwitchReason } from './navigationState';

let nextModelControl = 0;
/** Complete Project inventory with Scene-membership intentions; no model/renderer/storage access. */
export function createModelListControls(document: Document, onPlan: (plan: ModelListPlan) => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string) => { const node = make('button', text); node.type = 'button'; return node; };
  const root = make('section'); root.className = 'lv-model-browser'; root.setAttribute('aria-label', 'モデル');
  const filters = make('div'); filters.className = 'lv-model-filters';
  const queryLabel = make('label', '検索'), search = make('input'); search.type = 'search'; search.placeholder = 'モデル名'; search.setAttribute('aria-label', '検索'); queryLabel.append(search);
  const filterLabel = make('label', '一覧の範囲'), filter = make('select'); filter.setAttribute('aria-label', '一覧の範囲');
  for (const [key, text] of [['all', 'プロジェクト全体'], ['included', 'このシーン']]) { const option = make('option', text); option.value = key!; filter.append(option); }
  filterLabel.append(filter); filters.append(queryLabel, filterLabel);
  const status = make('p'); status.id = `lv-model-status-${++nextModelControl}`; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const failure = make('section'), failureText = make('p'), retry = button('再試行'), failureReview = button('状態を確認');
  failure.setAttribute('aria-label', '所属変更の失敗'); failureText.setAttribute('role', 'status'); failureText.setAttribute('aria-live', 'polite');
  failureText.id = `lv-model-failure-${++nextModelControl}`; retry.setAttribute('aria-describedby', failureText.id); failure.append(failureText, retry, failureReview);
  const recovery = button('状態を確認'), reveal = button('選択したモデルを一覧に表示'), count = make('p');
  // Reveal changes the list only, never a model's membership or temporary visibility.
  reveal.setAttribute('aria-describedby', status.id);
  const consequence = make('p', 'シーンから外してもモデルとキャプションは残ります。モデルに属する3Dピンは非表示になります。');
  consequence.id = `lv-model-consequence-${++nextModelControl}`; consequence.className = 'lv-model-note';
  const list = make('ul'); list.className = 'lv-model-list'; list.setAttribute('aria-label', 'プロジェクトのモデル一覧'); const empty = make('li');
  const details = make('section'), selectedName = make('h3'), scope = make('p', 'このモデルの配置・差し替えは、使用するすべてのシーンで共通です。');
  details.setAttribute('aria-label', 'モデルの設定範囲'); details.append(selectedName, scope);
  root.append(filters, status, failure, recovery, reveal, count, consequence, list, details);
  let context: ModelListContext | undefined, disposed = false, composing = false, rendering = false, observedScrollTop = 0;
  const cleanups: (() => void)[] = [];
  const listen = (node: HTMLElement, name: string, handler: () => void) => { node.addEventListener(name, handler); cleanups.push(() => node.removeEventListener(name, handler)); };
  const show = (text: string) => { status.textContent = text; status.hidden = false; };
  const request = (intent: ModelListIntent) => {
    if (!context || disposed) return;
    const plan = planModelList(context, intent);
    // A checkbox change reports intent, not success. Restore the observed state first.
    if (intent.kind === 'membership') {
      const row = rows.get(intent.assetId), view = modelListView(context), item = view.byId.get(intent.assetId);
      if (row) {
        row.check.checked = !view.membershipIssues.get(intent.assetId) && item?.membership.kind === 'value' && item.membership.value.kind === 'included';
        row.check.indeterminate = Boolean(view.membershipIssues.get(intent.assetId));
      }
    }
    filter.value = context.memory.filter;
    if (plan.kind === 'blocked') { show(plan.reason); return; }
    onPlan(plan);
  };
  listen(search, 'compositionstart', () => { composing = true; request({ kind: 'compose', active: true }); });
  listen(search, 'input', () => request({ kind: 'search', query: search.value }));
  listen(search, 'compositionend', () => { request({ kind: 'search', query: search.value }); composing = false; request({ kind: 'compose', active: false }); });
  listen(filter, 'change', () => request({ kind: 'filter', filter: filter.value as 'all' | 'included' }));
  listen(reveal, 'click', () => request({ kind: 'reveal' }));
  listen(recovery, 'click', () => request({ kind: 'review', assetId: context?.memory.assetId ?? null }));
  listen(retry, 'click', () => { if (!retry.disabled) request({ kind: 'retry' }); });
  listen(failureReview, 'click', () => { if (context?.feedback.kind === 'failed') request({ kind: 'review', assetId: context.feedback.plan.assetId }); });
  listen(list, 'scroll', () => {
    if (rendering || list.clientHeight === 0 || list.scrollTop === observedScrollTop) return;
    observedScrollTop = list.scrollTop; request({ kind: 'scroll', top: list.scrollTop });
  });
  const rows = new Map<string, { node: HTMLLIElement; select: HTMLButtonElement; check: HTMLInputElement;
    note: HTMLParagraphElement; review: HTMLButtonElement; cleanup: () => void }>();
  function updateRow(row: ModelListRow, view: ReturnType<typeof modelListView>): HTMLLIElement {
    const item = row.item; let entry = rows.get(item.id);
    if (!entry) {
      const node = make('li'), select = button(''), check = make('input'), label = make('label'), note = make('p'), review = button('状態を確認');
      node.className = 'lv-model-row'; select.className = 'lv-model-select'; select.id = `lv-model-name-${++nextModelControl}`;
      check.type = 'checkbox'; check.setAttribute('aria-label', 'このシーンに表示'); label.className = 'lv-model-membership'; label.append(check, make('span', 'このシーンに表示'));
      note.id = `lv-model-note-${++nextModelControl}`; note.className = 'lv-model-note';
      check.setAttribute('aria-describedby', `${select.id} ${note.id} ${status.id} ${consequence.id}`); select.setAttribute('aria-describedby', note.id);
      node.append(select, label, note, review);
      const choose = () => { if (!select.disabled) request({ kind: 'select', assetId: item.id }); };
      const toggle = () => request({ kind: 'membership', assetId: item.id, included: check.checked });
      const inspect = () => request({ kind: 'review', assetId: item.id });
      select.addEventListener('click', choose); check.addEventListener('change', toggle); review.addEventListener('click', inspect);
      entry = { node, select, check, note, review, cleanup: () => { select.removeEventListener('click', choose); check.removeEventListener('change', toggle); review.removeEventListener('click', inspect); } };
      rows.set(item.id, entry);
    }
    const included = !row.membershipIssue && item.membership.kind === 'value' && item.membership.value.kind === 'included';
    entry.select.textContent = modelListName(item); entry.select.setAttribute('aria-current', String(item.id === context!.memory.assetId));
    entry.select.disabled = item.id !== context!.memory.assetId && (context!.pending !== null || context!.memory.composing);
    entry.check.checked = included; entry.check.indeterminate = Boolean(row.membershipIssue);
    const toggleIssue = modelMembershipIssue(context!, item.id, !included, view); entry.check.disabled = Boolean(toggleIssue);
    const notes: string[] = [];
    if (item.lifecycle.kind !== 'value') notes.push('モデルの状態を確認してください。');
    if (item.name.kind !== 'value') notes.push('モデル名に未解決の状態があります。');
    if (row.membershipIssue) notes.push(row.membershipIssue);
    if (row.uncertainMatch) notes.push('絞り込み条件を確認してください。');
    if (item.membership.kind === 'value' && item.membership.value.kind === 'included' && item.membership.value.orderKey.kind !== 'value') notes.push('表示順を確認してください。');
    if (item.display.kind !== 'value') notes.push('モデルの表示状態を確認してください。');
    else if (item.display.value === 'unavailable') notes.push(item.displayReason || 'モデルを表示できません。状態を確認してください。');
    else if (item.display.value === 'temporarilyHidden') notes.push('一時的に非表示です。シーンへの所属とは別の設定です。');
    if (toggleIssue && !notes.includes(toggleIssue) && context!.pending === null && context!.mutationBlock === null && context!.feedback.kind !== 'applying') notes.push(toggleIssue);
    entry.note.textContent = notes.join(' '); entry.note.hidden = !entry.note.textContent;
    entry.review.hidden = !notes.length; return entry.node;
  }
  function orderNodes(wanted: HTMLElement[]) {
    const keep = new Set(wanted); for (const child of [...list.children]) if (!keep.has(child as HTMLElement)) child.remove();
    wanted.forEach((child, index) => { if (list.children[index] !== child) list.insertBefore(child, list.children[index] ?? null); });
  }
  function render(next: ModelListContext): boolean {
    if (disposed) return false;
    if (context && (composing || context.memory.composing || context.pending || context.feedback.kind === 'applying') &&
      (context.source.projectId !== next.source.projectId || context.source.sceneId !== next.source.sceneId ||
        context.memory.projectId !== next.memory.projectId || context.memory.sceneId !== next.memory.sceneId)) {
      show(sceneSwitchReason(context.pending) || (composing || context.memory.composing ? '文字の入力を確定してください。' : '所属の変更が完了するまで待ってください。')); return false;
    }
    context = next; rendering = true; const view = modelListView(next), active = document.activeElement, hadFocus = active !== null && root.contains(active);
    if (!composing && !next.memory.composing && search.value !== next.memory.query) search.value = next.memory.query;
    filter.value = next.memory.filter;
    const missing = next.memory.assetId !== null && !view.selected, deleted = view.selected?.lifecycle.kind === 'value' && view.selected.lifecycle.value === 'deleted';
    status.textContent = [view.issue, sceneSwitchReason(next.pending), next.mutationBlock !== null && (next.mutationBlock || '現在は所属を変更できません。'),
      next.feedback.kind === 'applying' && 'シーンへの所属を変更中です。', !view.issue && (missing ? '選択したモデルがありません。状態を確認してください。'
        : deleted ? '選択したモデルは削除済みです。' : view.selected && !view.selectionVisible && '選択したモデルは絞り込みで非表示です。')].filter(Boolean).join(' ');
    status.hidden = !status.textContent;
    recovery.hidden = !view.issue && !missing && !deleted; recovery.disabled = !next.source.token;
    reveal.hidden = !view.selected || view.selectionVisible || Boolean(deleted);
    count.textContent = view.issue ? '' : `${view.rows.length} / ${view.total}件`;
    failure.hidden = next.feedback.kind !== 'failed';
    if (next.feedback.kind === 'failed') {
      const plan = next.feedback.plan, target = view.byId.get(plan.assetId);
      const action = plan.action === 'include' ? 'シーンへの追加' : 'シーンから外す操作';
      retry.disabled = !modelListPlanIsCurrent(plan, next);
      failureText.textContent = `${target ? modelListName(target) : '対象のモデル'}：${action}に失敗しました。${next.feedback.message}` +
        (retry.disabled ? ' 状態を確認してから操作してください。' : ' 再試行できます。');
    }
    const visible = new Set(view.rows.map(row => row.item.id));
    for (const [id, row] of rows) if (!visible.has(id)) { row.cleanup(); row.node.remove(); rows.delete(id); }
    const children = view.rows.map(row => updateRow(row, view));
    if (!children.length) { empty.textContent = view.issue ? 'モデル一覧を表示できません。' : view.total ? '条件に一致するモデルはありません。' : 'このプロジェクトにモデルはありません。'; children.push(empty); }
    orderNodes(children); list.scrollTop = next.memory.scrollTop; observedScrollTop = list.scrollTop;
    details.hidden = !view.selected || Boolean(deleted); selectedName.textContent = view.selected ? modelListName(view.selected) : '';
    if (hadFocus && !root.contains(active)) search.focus({ preventScroll: true });
    // Stable focused nodes are left alone; re-focusing an IME input can disturb composition.
    rendering = false; return true;
  }
  function revealSelected() {
    if (!context || disposed || list.clientHeight === 0) return;
    const entry = rows.get(context.memory.assetId ?? ''); if (!entry) return;
    const top = entry.node.offsetTop, bottom = top + entry.node.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top; else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    request({ kind: 'scroll', top: list.scrollTop });
  }
  return { root, render, revealSelected, isComposing: () => composing, dispose: () => { disposed = true; cleanups.forEach(fn => fn()); rows.forEach(row => row.cleanup()); rows.clear(); root.remove(); } };
}
