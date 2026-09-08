import type { Field } from '../../scene/types';
import { normalizeCaptionText } from '../../domain/captionText';
import type { CaptionListItem } from './captionListState';
import { mapTextareaEdit, type TextareaEditRange } from './textareaBody';

export type CaptionEditField = 'title' | 'body' | 'color';
export const captionFieldLabels = Object.freeze({ title: 'タイトル', body: '本文', color: 'ピンの色' });
export type DetailSource = Readonly<{ token: string; sceneId: string }> & (
  Readonly<{ kind: 'ready'; caption: CaptionListItem; sceneCount: Field<number> }> |
  Readonly<{ kind: 'unavailable'; captionId: string | null; reason: string }>);
export interface CaptionDraft {
  readonly captionId: string;
  readonly base: Readonly<Record<CaptionEditField, Field<string>>>;
  /** Raw user edits only, not a lossy whole-entity replacement. */
  readonly edits: Readonly<Partial<Record<CaptionEditField, string>>>;
  readonly composing: CaptionEditField | null;
  readonly bodyInputIssue: string | null;
}
export interface CaptionApplyPlan {
  readonly kind: 'apply';
  readonly token: string;
  readonly sceneId: string;
  readonly captionId: string;
  readonly draft: CaptionDraft;
  readonly changes: Readonly<Partial<Record<CaptionEditField, string>>>;
  readonly affectedSceneCount: number;
}
export type DetailFeedback = Readonly<{ kind: 'idle' }> |
  Readonly<{ kind: 'applying'; plan: CaptionApplyPlan }> |
  Readonly<{ kind: 'failed'; plan: CaptionApplyPlan; message: string }>;
export interface DetailContext {
  readonly source: DetailSource;
  readonly draft: CaptionDraft | null;
  readonly mutationBlock: string | null;
  readonly feedback: DetailFeedback;
}
export const hasCaptionDraft = (draft: CaptionDraft | null): boolean =>
  draft !== null && (draft.composing !== null || draft.bodyInputIssue !== null || Object.keys(draft.edits).length > 0);
export function beginCaptionDraft(source: DetailSource): CaptionDraft | null {
  if (source.kind !== 'ready') return null;
  return Object.freeze({ captionId: source.caption.id, base: Object.freeze({
    title: source.caption.title, body: source.caption.body, color: source.caption.color,
  }), edits: Object.freeze({}), composing: null, bodyInputIssue: null });
}
function observedBase(draft: CaptionDraft, source: DetailSource, field: CaptionEditField) {
  // Capture a newly edited field as actually displayed. Never rebase an active edit.
  return source.kind === 'ready' && source.caption.id === draft.captionId &&
    draft.edits[field] === undefined && draft.composing !== field
    ? Object.freeze({ ...draft.base, [field]: source.caption[field] }) : draft.base;
}
export function editCaptionDraft(draft: CaptionDraft, source: DetailSource, field: CaptionEditField, text: string): CaptionDraft {
  const bases = observedBase(draft, source, field), edits = { ...draft.edits }, base = bases[field];
  if (base.kind === 'value' && base.value === text) delete edits[field]; else edits[field] = text;
  return Object.freeze({ ...draft, base: bases, edits: Object.freeze(edits) });
}
export function composeCaptionDraft(draft: CaptionDraft, source: DetailSource, field: CaptionEditField | null): CaptionDraft {
  return Object.freeze({ ...draft, base: field === null ? draft.base : observedBase(draft, source, field), composing: field });
}
export function editCaptionTextarea(draft: CaptionDraft, source: DetailSource, value: string, range?: TextareaEditRange): CaptionDraft {
  const base = observedBase(draft, source, 'body').body;
  const previous = draft.edits.body ?? (base.kind === 'value' ? base.value : '');
  const result = mapTextareaEdit(previous, value, range);
  const edited = editCaptionDraft(draft, source, 'body', result.text);
  return Object.freeze({ ...edited, bodyInputIssue: draft.bodyInputIssue ?? (result.kind === 'blocked' ? result.reason : null) });
}
function normalized(field: CaptionEditField, text: string): string {
  if (field !== 'color') return normalizeCaptionText(field, text);
  if (!/^#[0-9a-f]{6}$/i.test(text)) throw new Error('invalid color');
  return text.toLowerCase();
}
export function captionDraftFieldIssue(context: DetailContext, field: CaptionEditField): string | null {
  const { source, draft } = context;
  if (source.kind !== 'ready') return source.reason || 'キャプションの状態を確認してください。';
  if (draft && draft.captionId !== source.caption.id) return '編集中のキャプションを確認してください。';
  if (field === 'body' && draft?.bodyInputIssue) return draft.bodyInputIssue;
  if (source.caption[field].kind !== 'value') return `${captionFieldLabels[field]}の状態を確認してください。`;
  const raw = draft?.edits[field];
  if (raw === undefined) return null;
  const base = draft!.base[field], current = source.caption[field];
  if (base.kind !== 'value' || current.kind !== 'value' || base.value !== current.value)
    return `${captionFieldLabels[field]}が更新されています。入力を残して変更内容を確認してください。`;
  try { normalized(field, raw); } catch {
    return field === 'color' ? '色は # と6桁の16進数で指定してください。'
      : `${captionFieldLabels[field]}の文字数・使用できない文字を確認してください。`;
  }
  return null;
}
export function captionApplyIssue(context: DetailContext): string | null {
  if (context.mutationBlock !== null) return context.mutationBlock || '現在は変更できません。状態を確認してください。';
  if (context.feedback.kind === 'applying') return '変更を適用中です。';
  if (context.source.kind !== 'ready') return context.source.reason || 'キャプションを選択してください。';
  if (!context.source.token) return 'キャプションの状態を確認してください。';
  if (!context.draft || context.draft.captionId !== context.source.caption.id) return '編集中のキャプションを確認してください。';
  if (context.draft.composing) return '文字の入力を確定してください。';
  if (context.draft.bodyInputIssue) return context.draft.bodyInputIssue;
  const count = context.source.sceneCount;
  if (count.kind !== 'value' || !Number.isSafeInteger(count.value) || count.value < 1)
    return '影響するシーンを確認してください。';
  for (const field of Object.keys(context.draft.edits) as CaptionEditField[]) {
    const issue = captionDraftFieldIssue(context, field); if (issue) return issue;
  }
  return Object.keys(context.draft.edits).length ? null : '変更はありません。';
}
export function planCaptionApply(context: DetailContext): CaptionApplyPlan | Readonly<{ kind: 'blocked'; reason: string }> {
  const issue = captionApplyIssue(context);
  if (issue || context.source.kind !== 'ready' || !context.draft || context.source.sceneCount.kind !== 'value')
    return { kind: 'blocked', reason: issue || 'キャプションを確認してください。' };
  const changes: Partial<Record<CaptionEditField, string>> = {};
  for (const field of Object.keys(context.draft.edits) as CaptionEditField[]) changes[field] = normalized(field, context.draft.edits[field]!);
  return Object.freeze({ kind: 'apply', token: context.source.token, sceneId: context.source.sceneId,
    captionId: context.source.caption.id, draft: context.draft, changes: Object.freeze(changes), affectedSceneCount: context.source.sceneCount.value });
}
export function captionApplyIsCurrent(plan: CaptionApplyPlan, context: DetailContext): boolean {
  // The host may already show this exact in-flight plan; that is not a new apply.
  return context.source.kind === 'ready' && context.source.token === plan.token &&
    context.source.sceneId === plan.sceneId && context.source.caption.id === plan.captionId && context.draft === plan.draft &&
    captionApplyIssue({ ...context, feedback: { kind: 'idle' } }) === null;
}
/** Host-confirmed working-state acceptance only, NEVER a durable-save acknowledgement. */
export function acceptCaptionApply(plan: CaptionApplyPlan, draft: CaptionDraft, observed: DetailSource): CaptionDraft {
  if (draft !== plan.draft || observed.kind !== 'ready' || !observed.token ||
    observed.sceneId !== plan.sceneId || observed.caption.id !== plan.captionId) return draft;
  for (const field of Object.keys(plan.changes) as CaptionEditField[]) {
    const actual = observed.caption[field]; if (actual.kind !== 'value' || actual.value !== plan.changes[field]) return draft;
  }
  return beginCaptionDraft(observed)!;
}
