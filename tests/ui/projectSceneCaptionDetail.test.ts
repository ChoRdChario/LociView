import { describe, expect, it } from 'vitest';
import { value, type Field } from '../../src/scene/types';
import { normalizeCaptionText } from '../../src/domain/captionText';
import { acceptCaptionApply, beginCaptionDraft, captionApplyIsCurrent, composeCaptionDraft, editCaptionDraft, editCaptionTextarea,
  hasCaptionDraft, planCaptionApply, type CaptionApplyPlan, type CaptionEditField, type DetailContext, type DetailSource } from '../../src/ui/projectScene/captionDetailState';
import { createCaptionDetailControls, type CaptionDetailEvent, type CaptionDetailProps } from '../../src/ui/projectScene/captionDetailControls';
import { RecordedDocument, record } from './domRecorder';
import { mapTextareaEdit, textareaText } from '../../src/ui/projectScene/textareaBody';

const cap = 'cap_' + '1'.repeat(32), scn = 'scn_' + '1'.repeat(32);
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
function source(): DetailSource & { kind: 'ready' } {
  return { kind: 'ready', token: 'one', sceneId: scn, sceneCount: value(2), caption: { id: cap, title: value('記録'),
    body: value('本文\r\n二行目'), color: value('#aabbcc'), owner: value({ kind: 'project' }), mediaCount: value(0), pin: 'visible' } };
}
function context(): DetailContext {
  const current = source(); return { source: current, draft: beginCaptionDraft(current), mutationBlock: null, feedback: { kind: 'idle' } };
}
function edit(ctx: DetailContext, field: CaptionEditField, text: string): DetailContext {
  return { ...ctx, draft: editCaptionDraft(ctx.draft!, ctx.source, field, text) };
}
function apply(ctx: DetailContext): CaptionApplyPlan {
  const plan = planCaptionApply(ctx); expect(plan.kind).toBe('apply'); if (plan.kind !== 'apply') throw Error(plan.reason); return plan;
}
function host(initial = context(), document = new RecordedDocument()) {
  const events: CaptionDetailEvent[] = [];
  let props: CaptionDetailProps = { ...initial, retained: false };
  const controls = createCaptionDetailControls(document.asDocument(), event => {
    events.push(event);
    if (event.kind === 'draft' && event.baseDraft === props.draft) {
      props = { ...props, draft: event.draft }; controls.render(props);
    } else if (event.kind === 'cancel' && event.draft === props.draft) {
      props = { ...props, draft: beginCaptionDraft(props.source), feedback: { kind: 'idle' } }; controls.render(props);
    }
  });
  controls.render(props);
  const root = record(controls.root), titleGroup = root.children[2]!, bodyGroup = root.children[3]!, colorGroup = root.children[4]!;
  const title = titleGroup.children[0]!.children[0]!, body = bodyGroup.children[0]!.children[0]!, color = colorGroup.children[0]!.children[0]!;
  const actions = root.children[6]!, confirmation = root.children[7]!;
  return { controls, document, root, title, body, color, titleGroup, status: root.children[0]!, impact: root.children[1]!,
    picker: root.children[5]!, apply: actions.children[0]!, cancel: actions.children[1]!, confirmation,
    events, get props() { return props; }, render(next: CaptionDetailProps) { if (controls.render(next)) props = next; } };
}

describe('Caption detail: local draft/intents, not durable editor acceptance', () => {
  it('uses exact scalar/control rules and preserves body newline sequence', () => {
    expect(normalizeCaptionText('title', '')).toBe('');
    expect(normalizeCaptionText('title', 'e\u0301')).toBe('é');
    expect(normalizeCaptionText('title', '😀'.repeat(512))).toHaveLength(1024);
    expect(() => normalizeCaptionText('title', '😀'.repeat(513))).toThrow();
    expect(normalizeCaptionText('body', 'a\t\r\nb\rc\n')).toBe('a\t\r\nb\rc\n');
    expect(() => normalizeCaptionText('body', 'x'.repeat(65_537))).toThrow();
    for (const bad of ['\u0000', '\u0085', '\u2028', '\ud800']) {
      expect(() => normalizeCaptionText('title', bad)).toThrow(); expect(() => normalizeCaptionText('body', bad)).toThrow();
    }
    expect(() => normalizeCaptionText('title', 'a\nb')).toThrow();
  });

  it('applies only edited fields while a different field is conflicted, without rebuilding unknown data', () => {
    const current = source(), conflicted = { ...current, caption: { ...current.caption, title: unresolved<string>() } };
    const ctx = edit({ ...context(), source: conflicted, draft: beginCaptionDraft(conflicted) }, 'body', 'new');
    const before = structuredClone(ctx.source), plan = apply(ctx);
    expect(plan.changes).toEqual({ body: 'new' }); expect(plan.affectedSceneCount).toBe(2);
    expect(ctx.source).toEqual(before); expect(ctx.source.kind === 'ready' && ctx.source.caption.title.kind).toBe('unresolved');
    expect(planCaptionApply(edit(ctx, 'title', 'winner')).kind).toBe('blocked');
    expect(planCaptionApply({ ...ctx, source: { ...conflicted, sceneCount: unresolved<number>() } }).kind).toBe('blocked');
  });

  it('preserves active drafts across remote updates, rejects stale edited fields and allows independent incoming changes', () => {
    let ctx = edit(context(), 'body', 'mine'); const initialDraft = ctx.draft;
    const current = source(), changedTitle = { ...current, token: 'two', caption: { ...current.caption, title: value('remote title') } };
    expect(apply({ ...ctx, source: changedTitle }).changes).toEqual({ body: 'mine' });
    const changedBody = { ...current, token: 'two', caption: { ...current.caption, body: value('remote body') } };
    expect(planCaptionApply({ ...ctx, source: changedBody }).kind).toBe('blocked'); expect(ctx.draft).toBe(initialDraft);
    // A first edit after a refresh captures the observed value, not a stale baseline.
    ctx = { ...context(), source: changedBody };
    ctx = edit(ctx, 'body', '本文\r\n二行目');
    expect(apply(ctx).changes).toEqual({ body: '本文\r\n二行目' });
  });

  it('does not clear draft on failed/stale apply; exact observed acceptance clears only that submitted draft', () => {
    const ctx = edit(context(), 'title', 'new'), plan = apply(ctx), original = source();
    expect(captionApplyIsCurrent(plan, ctx)).toBe(true);
    expect(captionApplyIsCurrent(plan, { ...ctx, source: { ...original, token: 'two' } })).toBe(false);
    expect(captionApplyIsCurrent(plan, { ...ctx, mutationBlock: '閲覧のみ' })).toBe(false);
    expect(acceptCaptionApply(plan, ctx.draft!, original)).toBe(ctx.draft);
    const observed = { ...original, token: 'two', caption: { ...original.caption, title: value('new') } };
    expect(hasCaptionDraft(acceptCaptionApply(plan, ctx.draft!, observed))).toBe(false);
    const newerDraft = edit(ctx, 'body', 'next').draft!;
    expect(acceptCaptionApply(plan, newerDraft, observed)).toBe(newerDraft);
    expect(ctx.draft!.edits).toEqual({ title: 'new' });
  });

  it('guards composition, source loss, readonly and malformed colors without inventing saved state', () => {
    const ctx = edit(context(), 'body', 'mine');
    const composing = composeCaptionDraft(ctx.draft!, ctx.source, 'body');
    expect(planCaptionApply({ ...ctx, draft: composing }).kind).toBe('blocked');
    expect(planCaptionApply({ ...ctx, mutationBlock: '未完了の統合を復旧してください。' }).kind).toBe('blocked');
    expect(planCaptionApply({ ...ctx, source: { kind: 'unavailable', captionId: cap, sceneId: scn, token: 'x', reason: '競合を確認してください。' } }).kind).toBe('blocked');
    expect(planCaptionApply(edit(ctx, 'color', 'url(bad)')).kind).toBe('blocked');
    expect(apply(edit(ctx, 'color', '#ABCDEF')).changes).toEqual({ body: 'mine', color: '#abcdef' });
  });

  it('renders per-field recovery, keeps independent editing and never displays an unknown color picker default', () => {
    const original = source(), conflicted = { ...original, caption: { ...original.caption, title: unresolved<string>(), color: unresolved<string>() } };
    const h = host({ ...context(), source: conflicted, draft: beginCaptionDraft(conflicted) });
    expect(h.title.value).toBe(''); expect(h.title.readOnly).toBe(true); expect(h.body.readOnly).toBe(false);
    expect(h.titleGroup.children[2]!.hidden).toBe(false); expect(h.picker.hidden).toBe(true);
    expect(h.impact.textContent).toContain('2シーン');
    h.body.selectionStart = 0; h.body.selectionEnd = textareaText(h.body.value).length;
    h.body.fire('beforeinput', { inputType: 'insertText' });
    h.body.value = 'mine'; h.body.fire('input'); expect(h.apply.disabled).toBe(false); h.apply.fire('click');
    expect(h.events.at(-1)).toMatchObject({ kind: 'apply', changes: { body: 'mine' } });
    expect(h.status.textContent).not.toContain('保存済み'); h.controls.dispose();
  });

  it('keeps static input/IME and raw drafts on same-Caption refresh, refuses leaving, and retains failure until retry', () => {
    const h = host(), bodyNode = h.body;
    h.body.fire('compositionstart');
    h.body.selectionStart = 0; h.body.selectionEnd = textareaText(h.body.value).length;
    h.body.fire('beforeinput', { inputType: 'insertCompositionText' }); h.body.value = '入力中';
    h.render({ ...h.props }); expect(h.body).toBe(bodyNode); expect(h.body.value).toBe('入力中');
    expect(h.apply.disabled).toBe(true);
    const switched = { ...h.props, source: { ...h.props.source, sceneId: 'other' } };
    expect(h.controls.render(switched)).toBe(false);
    const original = h.props.source;
    h.render({ ...h.props, source: { kind: 'unavailable', captionId: cap, sceneId: scn, token: 'missing', reason: '復旧してください。' } });
    expect(h.body.value).toBe('入力中'); expect(h.body.readOnly).toBe(false);
    h.body.fire('compositionend'); expect(h.props.draft?.edits.body).toBe('入力中');
    expect(h.body.readOnly).toBe(true); expect(h.body.value).toBe('入力中');
    h.render({ ...h.props, source: original });
    const plan = apply(h.props);
    h.render({ ...h.props, feedback: { kind: 'failed', plan, message: '再試行してください。' } });
    expect(h.body.value).toBe('入力中'); expect(h.status.textContent).toContain('適用できません'); expect(h.apply.disabled).toBe(false);
    h.controls.dispose();
  });

  it('requires confirmed exact-draft cancellation, keeps unknown labels as text and cleans listeners', () => {
    const h = host(); const literal = '<img src=x onerror=alert(1)>';
    h.title.value = literal; h.title.fire('input'); h.cancel.fire('click');
    expect(h.confirmation.hidden).toBe(false); expect(h.props.draft?.edits.title).toBe(literal);
    h.confirmation.children[2]!.fire('click'); expect(h.props.draft?.edits.title).toBe(literal);
    h.cancel.fire('click'); h.confirmation.children[1]!.fire('click');
    expect(hasCaptionDraft(h.props.draft)).toBe(false); expect(h.title.value).toBe('記録');
    h.render({ ...h.props, mutationBlock: literal }); expect(h.status.textContent).toContain(literal); expect(h.status.children).toEqual([]);
    const count = h.events.length; h.controls.dispose(); h.title.fire('input'); h.apply.fire('click');
    expect(h.events).toHaveLength(count);
  });

  it('maps ordinary text edits and exact native ranges without rewriting untouched CR/CRLF tokens', () => {
    expect(mapTextareaEdit('A\r\nB\rC', 'A\nB\nD')).toEqual({ kind: 'mapped', text: 'A\r\nB\rD' });
    expect(mapTextareaEdit('A\r\nB\rC', 'A\nnew B\nC')).toEqual({ kind: 'mapped', text: 'A\r\nnew B\rC' });
    expect(mapTextareaEdit('A\r\nB\rC', 'A\nB\nC')).toEqual({ kind: 'mapped', text: 'A\r\nB\rC' });
    expect(mapTextareaEdit('A\r\nB\rC', 'A\nX\nY\nC', { start: 2, end: 3, inputType: 'insertFromPaste' }))
      .toEqual({ kind: 'mapped', text: 'A\r\nX\nY\rC' });
    const raw = 'A\r\n\rB';
    expect(mapTextareaEdit(raw, 'A\nB', { start: 1, end: 2, inputType: 'deleteContentBackward' }))
      .toEqual({ kind: 'mapped', text: 'A\rB' });
    expect(mapTextareaEdit(raw, 'A\nB', { start: 2, end: 3, inputType: 'deleteContentForward' }))
      .toEqual({ kind: 'mapped', text: 'A\r\nB' });
    expect(mapTextareaEdit(raw, 'A\nB', { start: 2, end: 2, inputType: 'deleteContentBackward' }))
      .toEqual({ kind: 'mapped', text: 'A\rB' });
    expect(mapTextareaEdit(raw, 'A\nB', { start: 2, end: 2, inputType: 'deleteContentForward' }))
      .toEqual({ kind: 'mapped', text: 'A\r\nB' });
  });

  it('retains ambiguous newline input and blocks the whole batch until explicit recovery', () => {
    const original = source(), current = { ...original, caption: { ...original.caption, body: value('A\r\n\rB') } };
    let ctx = { ...context(), source: current, draft: beginCaptionDraft(current)! };
    expect(mapTextareaEdit('A\r\n\rB', 'A\nB').kind).toBe('blocked');
    ctx = { ...ctx, draft: editCaptionTextarea(ctx.draft, current, 'A\nB', { start: 0, end: 0, inputType: 'historyUndo' }) };
    expect(ctx.draft.edits.body).toBe('A\nB'); expect(ctx.draft.bodyInputIssue).toContain('改行');
    expect(planCaptionApply(ctx).kind).toBe('blocked');
    // Even programmatic replacement with the old text cannot clear a failed mapping.
    ctx = { ...ctx, draft: editCaptionDraft(ctx.draft, current, 'body', 'A\r\n\rB') };
    expect(ctx.draft.edits.body).toBeUndefined(); expect(hasCaptionDraft(ctx.draft)).toBe(true);
    expect(planCaptionApply(edit(ctx, 'title', 'new title')).kind).toBe('blocked');
    expect(hasCaptionDraft(beginCaptionDraft(current))).toBe(false);
  });

  it('maps composition against its captured baseline during source loss or incoming changes', () => {
    const original = source(), current = { ...original, caption: { ...original.caption, body: value('A\r\nB\rC') } };
    const draft = composeCaptionDraft(beginCaptionDraft(current)!, current, 'body');
    const unavailable: DetailSource = { kind: 'unavailable', sceneId: scn, captionId: cap, token: 'missing', reason: '復旧' };
    expect(editCaptionTextarea(draft, unavailable, 'A\nB\nD').edits.body).toBe('A\r\nB\rD');
    const incoming = { ...current, token: 'new', caption: { ...current.caption, body: value('remote') } };
    const edited = composeCaptionDraft(editCaptionTextarea(draft, incoming, 'A\nB\nD'), incoming, null);
    expect(edited.edits.body).toBe('A\r\nB\rD');
    expect(planCaptionApply({ ...context(), source: incoming, draft: edited }).kind).toBe('blocked');
  });

  it('preserves raw newlines with a simulated LF-only textarea value, not browser evidence', () => {
    let assignments = 0;
    class LfOnlyTextareaDocument extends RecordedDocument {
      override createElement(tag: string) {
        const node = super.createElement(tag);
        if (tag === 'textarea') {
          let text = '';
          Object.defineProperty(node, 'value', { get: () => text, set: (value: string) => { assignments++; text = textareaText(value); } });
        }
        return node;
      }
    }
    const original = source(), current = { ...original, caption: { ...original.caption, body: value('A\r\nB\rC') } };
    const h = host({ ...context(), source: current, draft: beginCaptionDraft(current) }, new LfOnlyTextareaDocument());
    expect(h.body.value).toBe('A\nB\nC');
    h.title.value = 'new'; h.title.fire('input');
    expect(apply(h.props).changes).toEqual({ title: 'new' });
    h.body.selectionStart = 4; h.body.selectionEnd = 5; h.body.fire('beforeinput', { inputType: 'insertText' });
    h.body.value = 'A\nB\nD'; const authoredAssignments = assignments; h.body.fire('input');
    expect(apply(h.props).changes).toEqual({ title: 'new', body: 'A\r\nB\rD' });
    h.render({ ...h.props }); expect(h.body.value).toBe('A\nB\nD'); expect(assignments).toBe(authoredAssignments); h.controls.dispose();
  });
});
