import type { Field } from '../../scene/types';
import { sceneSwitchReason, type PendingInteraction } from './navigationState';

/** One explicit, non-conflicted active edge, or proven absence. Never derived from rendered Assets. */
export type ModelMembership = Readonly<{ kind: 'absent' }> | Readonly<{ kind: 'included'; membershipId: string;
  sceneId: string; assetId: string; orderKey: Field<string> }>;
export interface ModelListItem {
  readonly id: string; readonly name: Field<string>; readonly lifecycle: Field<'active' | 'deleted'>;
  readonly membership: Field<ModelMembership>;
  /** Host-resolved display/binding availability, independent of durable Scene membership. */
  readonly display: Field<'visible' | 'outsideScene' | 'temporarilyHidden' | 'unavailable'>;
  readonly displayReason: string | null;
}
export type ModelListSource = Readonly<{ token: string; projectId: string; sceneId: string }> & (
  Readonly<{ kind: 'ready'; items: readonly ModelListItem[] }> | Readonly<{ kind: 'unavailable'; reason: string }>);
export interface ModelListMemory {
  readonly projectId: string; readonly sceneId: string; readonly assetId: string | null;
  readonly query: string; readonly filter: 'all' | 'included'; readonly scrollTop: number; readonly composing: boolean;
}
export const newModelListMemory = (projectId: string, sceneId: string): ModelListMemory =>
  Object.freeze({ projectId, sceneId, assetId: null, query: '', filter: 'all', scrollTop: 0, composing: false });
interface Scope { readonly token: string; readonly projectId: string; readonly sceneId: string }
export type ModelMembershipPlan = Scope & Readonly<{ kind: 'membership'; assetId: string }> &
  (Readonly<{ action: 'include' }> | Readonly<{ action: 'exclude'; membershipId: string }>);
export interface ModelListContext {
  readonly source: ModelListSource; readonly memory: ModelListMemory;
  /** Only incompatible unfinished editors; unrelated Caption drafts stay mounted, not blocked or cleared. */
  readonly pending: PendingInteraction | null; readonly mutationBlock: string | null;
  readonly feedback: Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'applying'; plan: ModelMembershipPlan }> |
    Readonly<{ kind: 'failed'; plan: ModelMembershipPlan; message: string }>;
}
export type ModelListIntent = Readonly<{ kind: 'search'; query: string }> | Readonly<{ kind: 'filter'; filter: ModelListMemory['filter'] }> |
  Readonly<{ kind: 'compose'; active: boolean }> | Readonly<{ kind: 'scroll'; top: number }> |
  Readonly<{ kind: 'select'; assetId: string | null }> | Readonly<{ kind: 'membership'; assetId: string; included: boolean }> |
  Readonly<{ kind: 'review'; assetId: string | null }> | Readonly<{ kind: 'reveal' | 'retry' }>;
export type ModelListPlan = Readonly<{ kind: 'blocked'; reason: string }> | Readonly<{ kind: 'unchanged' }> |
  (Scope & Readonly<{ kind: 'change'; action: ModelListIntent['kind']; baseMemory: ModelListMemory; memory: ModelListMemory }>) |
  (Scope & Readonly<{ kind: 'review'; assetId: string | null }>) | ModelMembershipPlan;
export const modelListName = (item: ModelListItem): string => item.name.kind === 'value'
  ? item.name.value.trim() ? item.name.value : '名称なし' : 'モデル名を確認';
function scopeIssue(context: ModelListContext): string | null {
  const { source, memory } = context;
  return !source.token || !source.projectId || !source.sceneId || source.projectId !== memory.projectId || source.sceneId !== memory.sceneId
    ? 'プロジェクトとシーンの状態を確認してください。' : null;
}
export function modelSourceIssue(context: ModelListContext): string | null {
  const issue = scopeIssue(context); if (issue) return issue;
  const { source } = context;
  if (source.kind !== 'ready') return source.reason || 'モデル一覧を読み込めません。状態を確認してください。';
  return source.items.some(item => !item.id) || new Set(source.items.map(item => item.id)).size !== source.items.length
    ? 'モデル一覧の候補が重複しています。状態を確認してください。' : null;
}
export interface ModelListRow { readonly item: ModelListItem; readonly membershipIssue: string | null; readonly uncertainMatch: boolean }
export function modelListView(context: ModelListContext) {
  const issue = modelSourceIssue(context), { source, memory } = context;
  const items = source.kind === 'ready' && !issue ? source.items : [];
  const edgeCounts = new Map<string, number>();
  for (const item of items) if (item.membership.kind === 'value' && item.membership.value.kind === 'included') {
    const key = item.membership.value.membershipId; edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }
  const membershipIssues = new Map<string, string | null>();
  for (const item of items) {
    const membership = item.membership;
    const edge = membership.kind === 'value' && membership.value.kind === 'included' ? membership.value : null;
    membershipIssues.set(item.id, membership.kind !== 'value' ? 'シーンへの所属状態を確認してください。' : edge &&
      (!/^sam_[0-9a-f]{32}$/.test(edge.membershipId) || edge.sceneId !== source.sceneId || edge.assetId !== item.id || edgeCounts.get(edge.membershipId) !== 1)
      ? 'このモデルとシーンの対応を確認してください。' : null);
  }
  const active = items.filter(item => item.lifecycle.kind !== 'value' || item.lifecycle.value !== 'deleted');
  const query = memory.query.trim().toLowerCase(); const rows: ModelListRow[] = [];
  for (const item of active) {
    const membershipIssue = membershipIssues.get(item.id)!;
    const search = !query ? true : item.name.kind === 'value' ? item.name.value.toLowerCase().includes(query) : null;
    const included = memory.filter === 'all' ? true : membershipIssue ? null : item.membership.kind === 'value' && item.membership.value.kind === 'included';
    if (search !== false && included !== false) rows.push({ item, membershipIssue, uncertainMatch: search === null || included === null });
  }
  const byId = new Map(items.map(item => [item.id, item]));
  return { issue, items, byId, rows, membershipIssues, total: active.length,
    selected: memory.assetId === null ? undefined : byId.get(memory.assetId), selectionVisible: rows.some(row => row.item.id === memory.assetId) };
}
export function modelMembershipIssue(context: ModelListContext, assetId: string, included: boolean, view = modelListView(context)): string | null {
  if (context.feedback.kind === 'applying') return 'シーンへの所属を変更中です。';
  if (context.mutationBlock !== null) return context.mutationBlock || '現在は所属を変更できません。';
  if (context.pending) return sceneSwitchReason(context.pending);
  if (view.issue) return view.issue;
  const item = view.byId.get(assetId);
  if (!item) return '対象のモデルがありません。状態を確認してください。';
  const membershipIssue = view.membershipIssues.get(assetId); if (membershipIssue) return membershipIssue;
  // A valid exact edge may be removed even when its Asset cannot currently be displayed.
  if (included && (item.lifecycle.kind !== 'value' || item.lifecycle.value !== 'active')) return 'モデルの状態を確認してください。';
  if (item.membership.kind !== 'value') return 'シーンへの所属状態を確認してください。';
  return (item.membership.value.kind === 'included') === included ? 'シーンへの所属は変更されていません。' : null;
}
export function planModelList(context: ModelListContext, intent: ModelListIntent): ModelListPlan {
  const { source, memory } = context;
  const scope = { token: source.token, projectId: source.projectId, sceneId: source.sceneId };
  const block = (reason: string): ModelListPlan => ({ kind: 'blocked', reason });
  const change = (patch: Partial<ModelListMemory>): ModelListPlan => Object.freeze({ kind: 'change', ...scope,
    action: intent.kind, baseMemory: memory, memory: Object.freeze({ ...memory, ...patch }) });
  // Finding state remains local and recoverable while a read source or a write is unavailable.
  if (intent.kind === 'search') return change({ query: intent.query });
  if (intent.kind === 'compose') return change({ composing: intent.active });
  if (intent.kind === 'scroll') return Number.isFinite(intent.top) && intent.top >= 0 ? change({ scrollTop: intent.top }) : block('一覧の位置を確認してください。');
  if (intent.kind === 'filter') return intent.filter === 'all' || intent.filter === 'included' ? change({ filter: intent.filter }) : block('絞り込み条件を選び直してください。');
  const scopeProblem = scopeIssue(context); if (scopeProblem) return block(scopeProblem);
  const view = modelListView(context);
  if (intent.kind === 'review') {
    if (intent.assetId !== null && !view.items.some(item => item.id === intent.assetId) && memory.assetId !== intent.assetId &&
      !(context.feedback.kind !== 'idle' && context.feedback.plan.assetId === intent.assetId)) return block('確認するモデルを選択してください。');
    return Object.freeze({ kind: 'review', ...scope, assetId: intent.assetId });
  }
  if (intent.kind === 'retry') return context.feedback.kind === 'failed' && modelListPlanIsCurrent(context.feedback.plan, context)
    ? context.feedback.plan : block('所属状態が変わっています。状態を確認してから操作してください。');
  if (intent.kind === 'reveal') return view.selected && !(view.selected.lifecycle.kind === 'value' && view.selected.lifecycle.value === 'deleted')
    ? change({ query: '', filter: 'all' }) : block('選択したモデルの状態を確認してください。');
  if (view.issue) return block(view.issue);
  if (intent.kind === 'select') {
    if (intent.assetId === memory.assetId) return { kind: 'unchanged' };
    if (context.pending) return block(sceneSwitchReason(context.pending));
    if (memory.composing) return block('文字の入力を確定してください。');
    return intent.assetId === null || view.items.some(item => item.id === intent.assetId)
      ? change({ assetId: intent.assetId }) : block('モデルを選び直してください。');
  }
  if (intent.kind !== 'membership') return block('操作を選び直してください。');
  const issue = modelMembershipIssue(context, intent.assetId, intent.included, view); if (issue) return block(issue);
  const membership = view.items.find(item => item.id === intent.assetId)!.membership;
  if (!intent.included && membership.kind === 'value' && membership.value.kind === 'included')
    return Object.freeze({ kind: 'membership', ...scope, action: 'exclude', assetId: intent.assetId, membershipId: membership.value.membershipId });
  return Object.freeze({ kind: 'membership', ...scope, action: 'include', assetId: intent.assetId });
}
export function modelListPlanIsCurrent(plan: ModelListPlan, context: ModelListContext): boolean {
  if (plan.kind === 'blocked') return false;
  if (plan.kind === 'unchanged') return true;
  if (plan.kind === 'change') {
    if (plan.baseMemory !== context.memory) return false;
    if (['search', 'compose', 'scroll', 'filter'].includes(plan.action)) return true;
    if (plan.token !== context.source.token || plan.projectId !== context.source.projectId || plan.sceneId !== context.source.sceneId || modelSourceIssue(context)) return false;
    return plan.action !== 'select' || (!context.pending && !context.memory.composing);
  }
  if (plan.token !== context.source.token || plan.projectId !== context.source.projectId || plan.sceneId !== context.source.sceneId || scopeIssue(context)) return false;
  if (plan.kind === 'review') return true;
  const checking = context.feedback.kind === 'applying' && context.feedback.plan === plan ? { ...context, feedback: { kind: 'idle' as const } } : context;
  if (modelMembershipIssue(checking, plan.assetId, plan.action === 'include')) return false;
  if (plan.action === 'exclude') {
    const item = modelListView(context).items.find(item => item.id === plan.assetId);
    return item?.membership.kind === 'value' && item.membership.value.kind === 'included' && item.membership.value.membershipId === plan.membershipId;
  }
  return true;
}
