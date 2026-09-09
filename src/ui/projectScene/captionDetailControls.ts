import { captionFieldLabels, captionDraftFieldIssue, captionApplyIssue, composeCaptionDraft, editCaptionDraft,
  hasCaptionDraft, planCaptionApply, editCaptionTextarea, type CaptionApplyPlan, type CaptionDraft, type CaptionEditField,
  type DetailContext } from './captionDetailState';
import { textareaText, type TextareaEditRange } from './textareaBody';

export type CaptionDetailEvent = CaptionApplyPlan |
  Readonly<{ kind: 'draft'; baseDraft: CaptionDraft; draft: CaptionDraft }> |
  Readonly<{ kind: 'cancel'; draft: CaptionDraft }> |
  Readonly<{ kind: 'review'; captionId: string; field: CaptionEditField; token: string }> |
  Readonly<{ kind: 'window'; captionId: string; sceneId: string; token: string; action: 'open' | 'retain' | 'release' }>;
export interface CaptionDetailProps extends DetailContext {
  /** Host capability boundary, not a failed command or a change to the Caption. */
  readonly windowBlock?: string | null;
}
let nextDetail = 0;

/** Static form slots; no save, media I/O, metadata dispatch or conflict resolution. */
export function createCaptionDetailControls(document: Document, onEvent: (event: CaptionDetailEvent) => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string) => { const node = make('button', text); node.type = 'button'; return node; };
  const root = make('section'); root.className = 'lv-caption-detail'; root.setAttribute('aria-label', 'キャプションの詳細');
  const status = make('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const impact = make('p'); impact.className = 'lv-caption-impact';
  const fields = new Map<CaptionEditField, { input: HTMLInputElement | HTMLTextAreaElement; note: HTMLParagraphElement;
    review: HTMLButtonElement }>();
  const cleanups: (() => void)[] = [];
  let props: CaptionDetailProps | undefined, disposed = false, cancelFor: CaptionDraft | null = null;
  const listen = (node: HTMLElement, name: string, handler: () => void) => { node.addEventListener(name, handler); cleanups.push(() => node.removeEventListener(name, handler)); };
  root.append(status, impact);
  for (const field of ['title', 'body', 'color'] as const) {
    const group = make('div'), label = make('label', captionFieldLabels[field]);
    const input = field === 'body' ? make('textarea') : make('input');
    if (field !== 'body') (input as HTMLInputElement).type = 'text';
    const note = make('p'), review = button('状態を確認');
    note.id = `lv-caption-field-${++nextDetail}`; input.setAttribute('aria-describedby', note.id);
    input.setAttribute('aria-label', captionFieldLabels[field]);
    if (field === 'color') input.placeholder = '#rrggbb';
    label.append(input); group.append(label, note, review); root.append(group);
    fields.set(field, { input, note, review });
    let bodyRange: TextareaEditRange | undefined;
    const beforeInput = (event: Event) => {
      const start = input.selectionStart, end = input.selectionEnd;
      bodyRange = field === 'body' && start !== null && end !== null
        ? { start, end, inputType: (event as InputEvent).inputType } : undefined;
    };
    input.addEventListener('beforeinput', beforeInput); cleanups.push(() => input.removeEventListener('beforeinput', beforeInput));
    const changed = () => {
      const range = bodyRange; bodyRange = undefined;
      if (!props?.draft || input.readOnly || disposed) return;
      const draft = field === 'body' ? editCaptionTextarea(props.draft, props.source, input.value, range)
        : editCaptionDraft(props.draft, props.source, field, input.value);
      onEvent({ kind: 'draft', baseDraft: props.draft, draft });
    };
    listen(input, 'input', changed);
    listen(input, 'compositionstart', () => {
      if (!props?.draft || input.readOnly) return;
      onEvent({ kind: 'draft', baseDraft: props.draft, draft: composeCaptionDraft(props.draft, props.source, field) });
    });
    listen(input, 'compositionend', () => {
      const range = bodyRange; bodyRange = undefined;
      if (!props?.draft || props.draft.composing !== field) return;
      const edited = field === 'body' ? editCaptionTextarea(props.draft, props.source, input.value, range)
        : editCaptionDraft(props.draft, props.source, field, input.value);
      onEvent({ kind: 'draft', baseDraft: props.draft, draft: composeCaptionDraft(edited, props.source, null) });
    });
    listen(review, 'click', () => {
      if (props?.source.kind === 'ready') onEvent({ kind: 'review', captionId: props.source.caption.id, field, token: props.source.token });
    });
  }
  const picker = make('input'); picker.type = 'color'; picker.setAttribute('aria-label', '色を選択');
  root.append(picker);
  listen(picker, 'input', () => {
    if (props?.draft && !picker.disabled) onEvent({ kind: 'draft', baseDraft: props.draft,
      draft: editCaptionDraft(props.draft, props.source, 'color', picker.value) });
  });
  const actions = make('div'); actions.className = 'lv-caption-detail-actions';
  const apply = button('変更を適用'), cancel = button('取り消す'), showWindow = button('ウィンドウを表示');
  const windowActions = make('div'); windowActions.className = 'lv-caption-detail-actions';
  windowActions.setAttribute('aria-label', 'キャプションの表示');
  actions.append(apply, cancel); windowActions.append(showWindow); root.append(actions, windowActions);
  const windowNote = make('p'); windowNote.id = `lv-caption-windows-${++nextDetail}`;
  showWindow.setAttribute('aria-describedby', windowNote.id);
  const confirmation = make('div'); confirmation.hidden = true;
  const confirm = button('変更を取り消す'), keep = button('編集を続ける');
  confirmation.append(make('p', '入力中の変更を取り消しますか？'), confirm, keep); root.append(confirmation);
  root.append(windowNote);
  listen(apply, 'click', () => {
    if (!props || apply.disabled) return;
    const plan = planCaptionApply(props);
    if (plan.kind === 'blocked') status.textContent = plan.reason; else onEvent(plan);
  });
  listen(cancel, 'click', () => {
    if (!props?.draft || cancel.disabled) return;
    cancelFor = props.draft; confirmation.hidden = false; confirm.focus({ preventScroll: true });
  });
  listen(keep, 'click', () => { cancelFor = null; confirmation.hidden = true; cancel.focus({ preventScroll: true }); });
  listen(confirm, 'click', () => {
    if (!props?.draft || props.draft !== cancelFor || props.draft.composing || props.feedback.kind === 'applying') return;
    const draft = props.draft; cancelFor = null; confirmation.hidden = true; onEvent({ kind: 'cancel', draft });
  });
  const windowEvent = (action: 'open' | 'retain' | 'release') => {
    if (props?.source.kind === 'ready' && props.windowBlock == null) onEvent({ kind: 'window', captionId: props.source.caption.id,
      sceneId: props.source.sceneId, token: props.source.token, action });
  };
  listen(showWindow, 'click', () => windowEvent('open'));

  function render(next: CaptionDetailProps): boolean {
    if (disposed) return false;
    const nextId = next.source.kind === 'ready' ? next.source.caption.id : next.source.captionId;
    if (props && hasCaptionDraft(props.draft) && (props.draft!.captionId !== nextId || props.source.sceneId !== next.source.sceneId)) {
      status.textContent = '入力中の変更を適用するか、取り消してください。'; return false;
    }
    props = next;
    if (cancelFor !== next.draft) { cancelFor = null; confirmation.hidden = true; }
    const source = next.source, owned = next.draft?.captionId === nextId ? next.draft : null;
    const inFlight = next.feedback.kind === 'applying';
    for (const [field, control] of fields) {
      const current = source.kind === 'ready' ? source.caption[field] : null;
      const raw = owned?.edits[field];
      if (owned?.composing !== field) {
        const text = raw ?? (current?.kind === 'value' ? current.value : '');
        // Do not reassign an already displayed value after a keystroke: it can
        // reset the caret. Native textarea values normalize CR/CRLF to LF.
        const same = field === 'body' ? textareaText(control.input.value) === textareaText(text) : control.input.value === text;
        if (!same) control.input.value = text;
      }
      const issue = captionDraftFieldIssue(next, field);
      // Validation errors stay editable; source conflicts/stale baselines stay explicit.
      const unavailable = current?.kind !== 'value';
      control.input.readOnly = owned?.composing !== field && (!owned || unavailable || next.mutationBlock !== null || inFlight);
      control.note.textContent = [issue, raw !== undefined && issue && '入力内容は未適用です。'].filter(Boolean).join(' ');
      control.note.hidden = !control.note.textContent;
      control.review.hidden = !issue || source.kind !== 'ready';
      control.review.disabled = inFlight || Boolean(owned?.composing);
    }
    const color = fields.get('color')!;
    picker.hidden = color.input.readOnly || !/^#[0-9a-f]{6}$/i.test(color.input.value);
    picker.disabled = color.input.readOnly; if (!picker.hidden) picker.value = color.input.value;
    const sceneCount = source.kind === 'ready' && source.sceneCount.kind === 'value' ? source.sceneCount.value : null;
    impact.textContent = sceneCount !== null && Number.isSafeInteger(sceneCount) && sceneCount > 1
      ? `${sceneCount}シーンで共有されています。変更はすべてに反映されます。` : sceneCount === 1 ? '' : '影響するシーンを確認してください。';
    impact.hidden = !impact.textContent;
    const applyIssue = captionApplyIssue(next);
    status.textContent = [next.feedback.kind === 'failed' && `適用できませんでした。${next.feedback.message} 入力は保持しています。`,
      inFlight && '変更を適用中です。', hasCaptionDraft(owned) && !inFlight && '未適用の入力があります。',
      next.mutationBlock, source.kind !== 'ready' && (source.reason || 'キャプションを選択してください。'),
      hasCaptionDraft(owned) && applyIssue && !inFlight && applyIssue].filter(Boolean).join(' ');
    apply.disabled = applyIssue !== null;
    cancel.disabled = !hasCaptionDraft(owned) || Boolean(owned?.composing) || inFlight;
    windowNote.textContent = next.windowBlock ?? ''; windowNote.hidden = next.windowBlock == null;
    showWindow.disabled = source.kind !== 'ready' || next.windowBlock != null;
    return true;
  }
  function dispose(): void { disposed = true; for (const cleanup of cleanups) cleanup(); root.remove(); }
  return { root, windowActions, render, dispose };
}
