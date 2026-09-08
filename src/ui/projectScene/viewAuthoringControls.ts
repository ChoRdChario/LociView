import { editViewName, planViewAuthor, selectedAuthorView, viewAuthorApplyIssue, viewAuthorPlanIsCurrent,
  type ViewAuthorContext, type ViewAuthorDraft, type ViewAuthorIntent, type ViewAuthorPlan } from './viewAuthoringState';
import { savedViewName } from './viewState';
import { backgroundSourceIssue, editViewBackground, planViewBackground, standardViewBackground, viewBackgroundIssue,
  type ViewBackgroundContext, type ViewBackgroundDraft, type ViewBackgroundPlan } from './viewBackgroundState';
import { normalizeNativeBackgroundHex } from '../../nativeGs/backgroundColor';

let nextAuthorControl = 0;
function nodes(document: Document) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string) => { const node = make('button', text); node.type = 'button'; return node; };
  const status = () => { const node = make('p'); node.id = `lv-view-author-${++nextAuthorControl}`; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); return node; };
  const cleanups: (() => void)[] = [];
  const listen = (node: HTMLElement, event: string, action: () => void) => { node.addEventListener(event, action); cleanups.push(() => node.removeEventListener(event, action)); };
  return { make, button, status, listen, cleanup: () => cleanups.forEach(fn => fn()) };
}
export type ViewAuthorEvent = ViewAuthorPlan | Readonly<{ kind: 'input'; baseDraft: ViewAuthorDraft; draft: ViewAuthorDraft }> |
  Readonly<{ kind: 'cancel'; draft: ViewAuthorDraft }> | Readonly<{ kind: 'review'; sceneId: string; viewId: string | null; sourceToken: string }>;

/** Mount beside the existing view chooser. No second selection, renderer or write authority. */
export function createViewAuthorControls(document: Document, onEvent: (event: ViewAuthorEvent) => void) {
  const { make, button, status: live, listen, cleanup } = nodes(document);
  const root = make('section'); root.className = 'lv-view-controls lv-view-authoring'; root.setAttribute('aria-label', '視点の作成と管理');
  const start = make('section'), add = button('視点を作る'), edit = button('編集'), target = make('p');
  start.append(add, edit, target); root.append(start);
  const form = make('section'), label = make('label', '視点の名称'), name = make('input'); name.type = 'text'; name.setAttribute('aria-label', '視点の名称');
  label.append(name); const nameNote = make('p'); nameNote.id = `lv-view-author-${++nextAuthorControl}`; name.setAttribute('aria-describedby', nameNote.id);
  const capture = button('現在の表示を使用'), captureNote = make('p'), apply = button('変更を適用'), cancel = button('取り消す'); apply.className = 'lv-view-primary';
  form.append(label, nameNote, capture, captureNote, apply, cancel); root.append(form);
  const manage = make('details'), summary = make('summary', 'その他の操作');
  const earlier = button('前へ'), later = button('後へ'), remove = button('削除'); remove.className = 'lv-view-destructive';
  const orderNote = make('p'), deleteNote = make('p');
  orderNote.id = `lv-view-author-${++nextAuthorControl}`; deleteNote.id = `lv-view-author-${++nextAuthorControl}`;
  earlier.setAttribute('aria-describedby', orderNote.id); later.setAttribute('aria-describedby', orderNote.id); remove.setAttribute('aria-describedby', deleteNote.id);
  manage.append(summary, earlier, later, orderNote, remove, deleteNote); root.append(manage);
  const status = live(), review = button('状態を確認'); root.append(status, review);
  for (const control of [add, edit, capture, apply]) control.setAttribute('aria-describedby', status.id);
  const confirmation = make('section'), question = make('p'), confirm = button('削除する'), keep = button('戻る'); confirmation.hidden = true;
  confirmation.append(question, confirm, keep); root.append(confirmation);
  let context: ViewAuthorContext | undefined, disposed = false;
  let confirming: Extract<ViewAuthorPlan, { kind: 'delete' }> | ViewAuthorDraft | null = null;
  const show = (text: string) => { status.textContent = text; status.hidden = false; };
  const act = (intent: ViewAuthorIntent) => {
    if (!context || disposed) return;
    const plan = planViewAuthor(context, intent);
    if (plan.kind === 'blocked') { show(plan.reason); return; }
    if (plan.kind === 'delete') {
      confirming = plan; question.textContent = `「${selectedAuthorView(context) ? savedViewName(selectedAuthorView(context)!) : '視点'}」を削除しますか？`;
      confirm.textContent = '削除する'; confirmation.hidden = false; return;
    }
    onEvent(plan);
  };
  listen(add, 'click', () => { if (!add.disabled) act({ kind: 'new' }); });
  listen(edit, 'click', () => { if (!edit.disabled) act({ kind: 'edit' }); });
  listen(capture, 'click', () => { if (!capture.disabled) act({ kind: 'capture' }); });
  listen(apply, 'click', () => { if (!apply.disabled) act({ kind: 'apply' }); });
  listen(earlier, 'click', () => { if (!earlier.disabled) act({ kind: 'move', direction: 'earlier' }); });
  listen(later, 'click', () => { if (!later.disabled) act({ kind: 'move', direction: 'later' }); });
  listen(remove, 'click', () => { if (!remove.disabled) act({ kind: 'delete' }); });
  const input = (composing?: boolean) => {
    if (!context?.draft || disposed || (name.readOnly && !context.draft.composing)) return;
    onEvent({ kind: 'input', baseDraft: context.draft, draft: editViewName(context.draft, name.value, composing ?? context.draft.composing) });
  };
  listen(name, 'input', () => input());
  listen(name, 'compositionstart', () => input(true)); listen(name, 'compositionend', () => { if (context?.draft?.composing) input(false); });
  listen(cancel, 'click', () => {
    if (!context?.draft || cancel.disabled) return;
    confirming = context.draft; question.textContent = '編集中の視点を取り消しますか？'; confirm.textContent = '変更を取り消す'; confirmation.hidden = false;
  });
  listen(keep, 'click', () => { confirming = null; confirmation.hidden = true; });
  listen(confirm, 'click', () => {
    if (!context || !confirming || context.feedback.kind === 'applying') return;
    const pending = confirming; confirming = null; confirmation.hidden = true;
    if ('kind' in pending) {
      if (viewAuthorPlanIsCurrent(pending, context)) onEvent(pending); else show('視点の状態が変わりました。削除する対象を確認してください。');
    } else if (context.draft === pending && !pending.composing) onEvent({ kind: 'cancel', draft: pending });
    else show('入力が変わりました。取り消す内容を確認してください。');
  });
  listen(review, 'click', () => {
    if (context && !review.disabled) onEvent({ kind: 'review', sceneId: context.view.source.sceneId,
      viewId: context.draft ? context.draft.viewId : context.view.memory.selectedViewId, sourceToken: context.view.source.token });
  });
  const reason = (plan: ViewAuthorPlan) => plan.kind === 'blocked' ? plan.reason : '';
  function render(next: ViewAuthorContext): boolean {
    if (disposed) return false;
    if (context && (context.draft || context.feedback.kind === 'applying') &&
      (context.view.source.sceneId !== next.view.source.sceneId || context.view.source.projectFrameId !== next.view.source.projectFrameId ||
        context.view.memory.selectedViewId !== next.view.memory.selectedViewId)) { show('編集中の視点を適用・取り消しするか、処理の完了を待ってください。'); return false; }
    context = next; const draft = next.draft, busy = next.feedback.kind === 'applying', item = selectedAuthorView(next);
    form.hidden = !draft;
    const addIssue = reason(planViewAuthor(next, { kind: 'new' })), editIssue = reason(planViewAuthor(next, { kind: 'edit' }));
    add.disabled = Boolean(addIssue); edit.disabled = Boolean(editIssue); target.textContent = item ? savedViewName(item) : '保存した視点を選択';
    const observedName = item?.name.kind === 'value' ? item.name.value : '';
    if (!draft?.composing) { const text = draft?.name ?? observedName; if (name.value !== text) name.value = text; }
    const nameUnknown = Boolean(draft && draft.viewId !== null && (draft.baseName.kind !== 'value' || item?.name.kind !== 'value'));
    name.readOnly = busy || next.view.mutationBlock !== null || !draft || nameUnknown || !item && draft.viewId !== null;
    name.placeholder = nameUnknown ? '名称を確認' : '';
    nameNote.textContent = nameUnknown ? '名称に未解決の状態があります。状態を確認してください。' : ''; nameNote.hidden = !nameNote.textContent;
    const captureIssue = reason(planViewAuthor(next, { kind: 'capture' })); capture.disabled = Boolean(captureIssue);
    captureNote.textContent = draft?.capture ? draft.capture.runtimeToken === next.view.runtime.token
      ? '記録したカメラと背景を使用します。' : '記録後に表示が変わっています。取り直す場合は「現在の表示を使用」を選択してください。'
      : draft ? '名称だけの変更ではカメラと背景は変わりません。' : ''; captureNote.hidden = !captureNote.textContent;
    const applyIssue = viewAuthorApplyIssue(next); apply.disabled = Boolean(applyIssue); apply.textContent = draft?.viewId === null ? '視点を追加' : '変更を適用';
    cancel.disabled = !draft || busy || draft.composing;
    const earlierIssue = reason(planViewAuthor(next, { kind: 'move', direction: 'earlier' })), laterIssue = reason(planViewAuthor(next, { kind: 'move', direction: 'later' }));
    earlier.disabled = Boolean(earlierIssue); later.disabled = Boolean(laterIssue);
    orderNote.textContent = [...new Set([earlierIssue, laterIssue].filter(Boolean))].join(' '); orderNote.hidden = !orderNote.textContent;
    deleteNote.textContent = reason(planViewAuthor(next, { kind: 'delete' })); deleteNote.hidden = !deleteNote.textContent; remove.disabled = Boolean(deleteNote.textContent);
    status.textContent = [next.feedback.kind === 'failed' && `変更できませんでした。${next.feedback.message}`,
      busy && '視点の変更を適用中です。', draft && '視点の編集は未適用です。',
      draft ? applyIssue !== '変更はありません。' && applyIssue : addIssue,
      draft && captureIssue, !draft && editIssue].filter(Boolean).join(' '); status.hidden = !status.textContent;
    review.hidden = !(nameUnknown || next.view.source.kind !== 'ready' || (draft && applyIssue && applyIssue !== '変更はありません。'));
    review.disabled = !next.view.source.token || busy;
    if (confirming && ('kind' in confirming ? !viewAuthorPlanIsCurrent(confirming, next) : confirming !== draft || Boolean(draft?.composing)) ) {
      confirming = null; confirmation.hidden = true;
    }
    confirm.disabled = busy; return true;
  }
  return { root, render, dispose: () => { disposed = true; cleanup(); root.remove(); } };
}

export type ViewBackgroundEvent = ViewBackgroundPlan | Readonly<{ kind: 'draft'; baseDraft: ViewBackgroundDraft | null; draft: ViewBackgroundDraft }> |
  Readonly<{ kind: 'cancel'; draft: ViewBackgroundDraft }>;
export function createViewBackgroundControls(document: Document, onEvent: (event: ViewBackgroundEvent) => void) {
  const { make, button, status: live, listen, cleanup } = nodes(document);
  const root = make('section'); root.className = 'lv-view-controls lv-view-background'; root.setAttribute('aria-label', '3D背景');
  const label = make('label', '背景色'), hex = make('input'); hex.type = 'text'; hex.placeholder = '#rrggbb'; hex.setAttribute('aria-label', '背景色'); label.append(hex);
  const picker = make('input'); picker.type = 'color'; picker.setAttribute('aria-label', '背景色を選択');
  const standard = button('標準色'), apply = button('背景に適用'), cancel = button('取り消す'); apply.className = 'lv-view-primary';
  const note = make('p', '背景は視点の作成・更新で保存します。'), status = live();
  for (const node of [hex, picker, standard, apply]) node.setAttribute('aria-describedby', status.id);
  root.append(label, picker, standard, apply, cancel, note, status);
  const confirmation = make('section'), confirm = button('変更を取り消す'), keep = button('編集を続ける'); confirmation.hidden = true;
  confirmation.append(make('p', '入力中の背景色を取り消しますか？'), confirm, keep); root.append(confirmation);
  let context: ViewBackgroundContext | undefined, disposed = false, cancelFor: ViewBackgroundDraft | null = null;
  const change = (value: string, composing = false) => {
    if (!context || disposed || context.feedback.kind === 'applying') return;
    const draft = editViewBackground(context, value, composing);
    if (draft) onEvent({ kind: 'draft', baseDraft: context.draft, draft });
  };
  listen(hex, 'input', () => { if (!hex.readOnly || context?.draft?.composing) change(hex.value, context?.draft?.composing); });
  listen(hex, 'compositionstart', () => { if (!hex.readOnly) change(hex.value, true); });
  listen(hex, 'compositionend', () => { if (context?.draft?.composing) change(hex.value, false); });
  listen(picker, 'input', () => { if (!picker.disabled) change(picker.value); });
  listen(standard, 'click', () => { if (!standard.disabled) change(standardViewBackground); });
  listen(apply, 'click', () => {
    if (!context || apply.disabled) return; const plan = planViewBackground(context);
    if (plan.kind === 'blocked') { status.textContent = plan.reason; status.hidden = false; } else onEvent(plan);
  });
  listen(cancel, 'click', () => { if (context?.draft && !cancel.disabled) { cancelFor = context.draft; confirmation.hidden = false; } });
  listen(keep, 'click', () => { cancelFor = null; confirmation.hidden = true; });
  listen(confirm, 'click', () => {
    if (cancelFor && context?.draft === cancelFor && !cancel.disabled) { const draft = cancelFor; cancelFor = null; confirmation.hidden = true; onEvent({ kind: 'cancel', draft }); }
  });
  function render(next: ViewBackgroundContext): boolean {
    if (disposed) return false;
    if (context && (context.draft || context.feedback.kind === 'applying') && (context.source.sceneId !== next.source.sceneId || context.source.projectFrameId !== next.source.projectFrameId)) {
      status.textContent = '背景の編集を適用・取り消しするか、処理の完了を待ってください。'; status.hidden = false; return false;
    }
    context = next; const draft = next.draft, busy = next.feedback.kind === 'applying', sourceIssue = backgroundSourceIssue(next);
    const text = draft?.hex ?? (next.source.kind === 'solid' && !sourceIssue ? next.source.hex : '');
    if (!draft?.composing && hex.value !== text) hex.value = text;
    hex.readOnly = busy || Boolean(sourceIssue); const color = normalizeNativeBackgroundHex(text);
    picker.hidden = !color; picker.disabled = busy || Boolean(sourceIssue) || Boolean(draft?.composing);
    if (color) picker.value = color;
    standard.disabled = busy || Boolean(sourceIssue) || Boolean(draft?.composing);
    const issue = viewBackgroundIssue(next); apply.disabled = Boolean(issue); cancel.disabled = !draft || busy || draft.composing;
    status.textContent = [next.feedback.kind === 'failed' && `背景を変更できませんでした。${next.feedback.message}`,
      issue !== '変更はありません。' && issue, draft && !busy && '背景色は未適用です。'].filter(Boolean).join(' '); status.hidden = !status.textContent;
    if (cancelFor !== draft || draft?.composing) { cancelFor = null; confirmation.hidden = true; }
    confirm.disabled = cancel.disabled; return true;
  }
  return { root, render, dispose: () => { disposed = true; cleanup(); root.remove(); } };
}
