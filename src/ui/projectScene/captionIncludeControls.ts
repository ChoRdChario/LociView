import { captionOwnerLabel, captionTitle } from './captionListState';
import { captionIncludeIssue, captionIncludeView, planCaptionInclude,
  type CaptionIncludeContext, type CaptionIncludeIntent, type CaptionIncludePlan } from './captionIncludeState';

/** Membership picker only. Does not select the editor, copy content or show a model. */
export function createCaptionIncludeControls(document: Document, onPlan: (plan: CaptionIncludePlan) => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const root = make('details'); root.className = 'lv-caption-include';
  const summary = make('summary', '既存のキャプションを追加');
  const searchLabel = make('label', '検索'), search = make('input'); search.type = 'search'; search.setAttribute('aria-label', '検索'); searchLabel.append(search);
  const choiceLabel = make('label', 'キャプション'), choices = make('select'); choices.size = 6;
  choices.setAttribute('aria-label', 'キャプション'); choiceLabel.append(choices);
  const selected = make('p'), status = make('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const include = make('button', 'このシーンに追加'), review = make('button', '状態を確認'); include.type = review.type = 'button';
  root.append(summary, searchLabel, choiceLabel, selected, status, include, review);
  let context: CaptionIncludeContext | undefined, disposed = false, fingerprint = '';
  const cleanups: (() => void)[] = [];
  const listen = (node: HTMLElement, event: string, action: () => void) => { node.addEventListener(event, action); cleanups.push(() => node.removeEventListener(event, action)); };
  const request = (intent: CaptionIncludeIntent) => {
    if (!context || disposed) return;
    const plan = planCaptionInclude(context, intent);
    choices.value = context.memory.captionId ?? '';
    if (plan.kind === 'blocked') status.textContent = plan.reason; else onPlan(plan);
  };
  listen(search, 'compositionstart', () => request({ kind: 'compose', active: true }));
  listen(search, 'input', () => request({ kind: 'search', query: search.value }));
  listen(search, 'compositionend', () => { request({ kind: 'search', query: search.value }); request({ kind: 'compose', active: false }); });
  listen(choices, 'change', () => request({ kind: 'select', captionId: choices.value || null }));
  listen(include, 'click', () => { if (!include.disabled) request({ kind: 'include' }); });
  listen(review, 'click', () => { if (!review.disabled) request({ kind: 'review' }); });
  function render(next: CaptionIncludeContext): boolean {
    if (disposed) return false;
    if (context && (context.memory.composing || context.feedback.kind === 'applying') && context.source.sceneId !== next.source.sceneId) {
      status.textContent = '入力または追加処理を完了してください。'; return false;
    }
    context = next;
    const view = captionIncludeView(next), issue = captionIncludeIssue(next), busy = next.feedback.kind === 'applying';
    if (!next.memory.composing && search.value !== next.memory.query) search.value = next.memory.query;
    search.readOnly = busy && !next.memory.composing; choices.disabled = busy || Boolean(view.issue) || next.memory.composing;
    const options = view.rows.map(row => ({ id: row.item.id, label: `${captionTitle(row.item)} — ${captionOwnerLabel(row.item)}` +
      (row.entry.membership.kind !== 'value' || row.entry.lifecycle.kind !== 'value' ? '（要確認）' : row.entry.lifecycle.value === 'deleted'
        ? '（削除済み）' : row.entry.membership.value === 'included' ? '（追加済み）' : '') }));
    if (next.memory.captionId && !options.some(option => option.id === next.memory.captionId)) options.unshift({ id: next.memory.captionId,
      label: view.selected ? `${captionTitle(view.selected.caption)}（検索条件の外）` : '選択したキャプション（状態を確認）' });
    const key = JSON.stringify(options);
    if (fingerprint !== key) {
      choices.replaceChildren(make('option', 'キャプションを選択'));
      choices.children[0]!.setAttribute('value', '');
      for (const item of options) { const option = make('option', item.label); option.value = item.id; choices.append(option); }
      fingerprint = key;
    }
    choices.value = next.memory.captionId ?? '';
    selected.textContent = view.selected ? `${captionTitle(view.selected.caption)} — ${captionOwnerLabel(view.selected.caption)}` +
      (view.selected.caption.pin === 'ownerHidden' ? '。モデルは非表示のままです。' : '') : '';
    selected.hidden = !selected.textContent;
    status.textContent = [next.feedback.kind === 'failed' && `追加できませんでした。${next.feedback.message} 選択は保持しています。`,
      issue, !view.issue && !view.rows.length && '該当するキャプションはありません。'].filter(Boolean).join(' ');
    include.disabled = issue !== null;
    review.hidden = !view.selected || (view.selected.lifecycle.kind === 'value' && view.selected.lifecycle.value === 'active' && view.selected.membership.kind === 'value');
    review.disabled = busy || Boolean(next.pending) || next.memory.composing;
    return true;
  }
  return { root, render, dispose: () => { disposed = true; cleanups.forEach(cleanup => cleanup()); root.remove(); } };
}
