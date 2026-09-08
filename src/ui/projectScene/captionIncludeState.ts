import type { Field } from '../../scene/types';
import { captionListView, captionSourceIssue, type CaptionListItem } from './captionListState';
import { sceneSwitchReason, type PendingInteraction } from './navigationState';

/** Complete current-Project inventory supplied by a validated, conflict-aware host. */
export interface CaptionIncludeItem {
  readonly caption: CaptionListItem;
  readonly lifecycle: Field<'active' | 'deleted'>;
  readonly membership: Field<'absent' | 'included'>;
}
export type CaptionIncludeSource = Readonly<{ token: string; sceneId: string }> & (
  Readonly<{ kind: 'ready'; items: readonly CaptionIncludeItem[] }> |
  Readonly<{ kind: 'unavailable'; reason: string }>);
export interface CaptionIncludeMemory {
  readonly sceneId: string; readonly query: string; readonly captionId: string | null; readonly composing: boolean;
}
export const newCaptionIncludeMemory = (sceneId: string): CaptionIncludeMemory =>
  Object.freeze({ sceneId, query: '', captionId: null, composing: false });
export interface CaptionIncludeContext {
  readonly source: CaptionIncludeSource; readonly memory: CaptionIncludeMemory;
  readonly pending: PendingInteraction | null; readonly mutationBlock: string | null;
  readonly feedback: Readonly<{ kind: 'idle' | 'applying' }> | Readonly<{ kind: 'failed'; message: string }>;
}
export type CaptionIncludeIntent = Readonly<{ kind: 'search'; query: string }> |
  Readonly<{ kind: 'compose'; active: boolean }> | Readonly<{ kind: 'select'; captionId: string | null }> |
  Readonly<{ kind: 'include' | 'review' }>;
interface Base { readonly token: string; readonly sceneId: string; readonly baseMemory: CaptionIncludeMemory }
export type CaptionIncludePlan = Readonly<{ kind: 'blocked'; reason: string }> |
  (Base & Readonly<{ kind: 'change'; memory: CaptionIncludeMemory }>) |
  (Base & Readonly<{ kind: 'include' | 'review'; captionId: string }>);

export function captionIncludeView(context: CaptionIncludeContext) {
  const { source, memory } = context;
  const list = source.kind === 'ready' ? { ...source, captions: source.items.map(item => item.caption) } : source;
  const issue = source.sceneId !== memory.sceneId ? 'シーンを確認してください。' : captionSourceIssue(list);
  const items = source.kind === 'ready' && !issue ? source.items : [];
  const visible = issue ? [] : captionListView(list, { selectedCaptionId: memory.captionId, search: memory.query,
    ownerFilter: { kind: 'all' }, listScrollTop: 0, pinColors: null }).rows;
  const byId = new Map(items.map(item => [item.caption.id, item]));
  return { issue, items, rows: visible.map(row => ({ ...row, entry: byId.get(row.item.id)! })),
    selected: items.find(item => item.caption.id === memory.captionId) };
}
export function captionIncludeIssue(context: CaptionIncludeContext): string | null {
  const view = captionIncludeView(context);
  if (context.feedback.kind === 'applying') return 'シーンに追加中です。';
  if (context.mutationBlock !== null) return context.mutationBlock || '現在は変更できません。';
  if (context.memory.composing) return '文字の入力を確定してください。';
  if (context.pending) return sceneSwitchReason(context.pending);
  if (view.issue) return view.issue;
  if (!view.selected) return context.memory.captionId ? '選択したキャプションの状態を確認してください。' : 'キャプションを選択してください。';
  const item = view.selected;
  if (item.lifecycle.kind !== 'value' || item.membership.kind !== 'value') return 'キャプションとシーンの状態を確認してください。';
  if (item.lifecycle.value === 'deleted') return '削除済みです。キャプションの状態を確認してください。';
  return item.membership.value === 'included' ? 'このシーンに追加済みです。' : null;
}
export function planCaptionInclude(context: CaptionIncludeContext, intent: CaptionIncludeIntent): CaptionIncludePlan {
  const { source, memory } = context, view = captionIncludeView(context);
  const base = { token: source.token, sceneId: memory.sceneId, baseMemory: memory };
  const change = (patch: Partial<CaptionIncludeMemory>): CaptionIncludePlan => Object.freeze({ ...base,
    kind: 'change', memory: Object.freeze({ ...memory, ...patch }) });
  // Search/composition are local input, retained even when the inventory is unavailable.
  if (intent.kind === 'search') return change({ query: intent.query });
  if (intent.kind === 'compose') return change({ composing: intent.active });
  if (view.issue) return { kind: 'blocked', reason: view.issue };
  if (context.feedback.kind === 'applying') return { kind: 'blocked', reason: 'シーンに追加中です。' };
  if (intent.kind === 'select') return intent.captionId === null || view.items.some(item => item.caption.id === intent.captionId)
    ? change({ captionId: intent.captionId }) : { kind: 'blocked', reason: 'キャプションを選び直してください。' };
  if (intent.kind === 'include') {
    const issue = captionIncludeIssue(context); if (issue) return { kind: 'blocked', reason: issue };
  } else if (!view.selected || context.pending || memory.composing) {
    return { kind: 'blocked', reason: sceneSwitchReason(context.pending) || '入力を確定し、キャプションを選択してください。' };
  }
  return Object.freeze({ ...base, kind: intent.kind, captionId: memory.captionId! });
}
export function captionIncludePlanIsCurrent(plan: CaptionIncludePlan, context: CaptionIncludeContext): boolean {
  if (plan.kind === 'blocked') return false;
  if (plan.baseMemory !== context.memory || plan.sceneId !== context.source.sceneId || plan.token !== context.source.token) return false;
  if (plan.kind === 'change') return true;
  const current = planCaptionInclude({ ...context, feedback: { kind: 'idle' } }, { kind: plan.kind });
  return current.kind === plan.kind && 'captionId' in current && current.captionId === plan.captionId;
}
