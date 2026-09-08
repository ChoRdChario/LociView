import type { Field, View } from '../../scene/types';

export const viewAxes = Object.freeze(['+x', '-x', '+y', '-y', '+z', '-z'] as const);
export type ViewAxis = typeof viewAxes[number];
export type ViewProjection = 'perspective' | 'orthographic';
/** Validated Project records, not raw metadata or a new camera schema. */
export interface SavedViewItem extends View { readonly name: Field<string>; readonly orderKey: Field<string> }
export type ViewSource = Readonly<{ token: string; sceneId: string; projectFrameId: string }> & (
  Readonly<{ kind: 'ready'; views: readonly SavedViewItem[]; entryViewId: Field<string | null> }> |
  Readonly<{ kind: 'unavailable'; reason: string }>);
/** Host token covers current pose/background, visible logical bounds and viewport. */
export type ViewRuntime = Readonly<{ token: string; sceneId: string; projectFrameId: string }> & (
  Readonly<{ kind: 'ready'; projection: ViewProjection; axis: ViewAxis | null; bounds: Field<'available' | 'empty'> }> |
  Readonly<{ kind: 'unavailable'; reason: string }>);
export interface EntryViewDraft { readonly baseId: string | null; readonly viewId: string | null }
export interface ViewMemory {
  readonly sceneId: string; readonly selectedViewId: string | null; readonly entryDraft: EntryViewDraft | null;
}
export const newViewMemory = (sceneId: string): ViewMemory => Object.freeze({ sceneId, selectedViewId: null, entryDraft: null });
export type ViewFeedback = Readonly<{ kind: 'idle' | 'applying' }> | Readonly<{ kind: 'failed'; message: string }>;
export interface ViewContext {
  readonly source: ViewSource; readonly runtime: ViewRuntime; readonly memory: ViewMemory;
  /** Only operations that prevent safe camera publication, e.g. a pointer drag. Not all pending editors. */
  readonly cameraBlock: string | null;
  readonly mutationBlock: string | null;
  readonly cameraFeedback: ViewFeedback; readonly entryFeedback: ViewFeedback;
}
export type ViewCameraIntent = Readonly<{ kind: 'fit' | 'recall' }> |
  Readonly<{ kind: 'axis'; axis: ViewAxis }> | Readonly<{ kind: 'projection'; projection: ViewProjection }>;
export type ViewIntent = ViewCameraIntent | Readonly<{ kind: 'select'; viewId: string | null }> |
  Readonly<{ kind: 'chooseEntry'; viewId: string | null }> | Readonly<{ kind: 'applyEntry' | 'cancelEntry' }> |
  Readonly<{ kind: 'review'; target: 'selected' | 'entry' }>;
export type ViewPlan = Readonly<{ kind: 'blocked'; reason: string }> |
  Readonly<{ kind: 'change'; sourceToken: string; baseMemory: ViewMemory; memory: ViewMemory; action: 'select' | 'chooseEntry' | 'cancelEntry' }> |
  Readonly<{ kind: 'camera'; sceneId: string; projectFrameId: string; runtimeToken: string; action: ViewCameraIntent;
    sourceToken?: string; viewId?: string }> |
  Readonly<{ kind: 'entry'; sceneId: string; projectFrameId: string; sourceToken: string; draft: EntryViewDraft; viewId: string | null }> |
  Readonly<{ kind: 'review'; sceneId: string; projectFrameId: string; sourceToken: string; target: 'selected' | 'entry'; viewId: string | null }>;
export const savedViewName = (item: SavedViewItem): string => item.name.kind === 'value'
  ? item.name.value.trim() ? item.name.value : '名称なし' : '名称を確認';
export function viewSourceIssue(context: ViewContext): string | null {
  const { source, memory } = context;
  if (source.sceneId !== memory.sceneId || !source.token || !source.projectFrameId) return 'シーンの状態を確認してください。';
  return source.kind === 'ready' ? null : source.reason || '保存した視点を読み込めません。状態を確認してください。';
}
export function savedViewIssue(context: ViewContext, viewId: string | null): string | null {
  const issue = viewSourceIssue(context), source = context.source;
  if (issue || source.kind !== 'ready') return issue;
  if (viewId === null) return '保存した視点を選択してください。';
  const rows = source.views.filter(item => item.id === viewId);
  if (rows.length !== 1) return rows.length ? '同じ視点の候補があります。状態を確認してください。' : '選択した視点がありません。状態を確認してください。';
  const item = rows[0]!;
  if (item.sceneId !== source.sceneId || item.projectFrameId !== source.projectFrameId) return 'このシーンの視点を選択してください。';
  if (item.lifecycle.kind !== 'value') return '視点の状態を確認してください。';
  if (item.lifecycle.value.state === 'deleted') return '削除済みの視点です。状態を確認してください。';
  if (item.camera.kind !== 'value' || item.background.kind !== 'value') return '視点と背景の状態を確認してください。';
  return null;
}
export function savedViewChoices(context: ViewContext) {
  const { source } = context;
  if (viewSourceIssue(context) || source.kind !== 'ready') return [];
  const counts = new Map<string, number>(); for (const item of source.views) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  const seen = new Set<string>();
  return source.views.filter(item => {
    if (item.sceneId !== source.sceneId || seen.has(item.id) || (item.lifecycle.kind === 'value' && item.lifecycle.value.state === 'deleted')) return false;
    seen.add(item.id); return true;
  }).map(item => {
    const duplicate = counts.get(item.id)! > 1;
    const order = !duplicate && item.orderKey.kind === 'value' && /^[0-9A-Za-z]{1,64}$/.test(item.orderKey.value) ? item.orderKey.value : null;
    const issue = savedViewIssue(context, item.id);
    return { id: item.id, label: duplicate ? '視点の候補を確認' : savedViewName(item) + (issue ? '（要確認）' : order === null ? '（順序を確認）' : ''), order, issue };
  }).sort((a, b) => a.order === null && b.order !== null ? 1 : a.order !== null && b.order === null ? -1 :
    (a.order ?? '') < (b.order ?? '') ? -1 : (a.order ?? '') > (b.order ?? '') ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function viewRuntimeMatches(context: ViewContext): boolean {
  const { runtime, memory, source } = context;
  return Boolean(runtime.token && runtime.projectFrameId) && runtime.sceneId === memory.sceneId &&
    source.sceneId === memory.sceneId && runtime.projectFrameId === source.projectFrameId;
}
function cameraIssue(context: ViewContext, intent: ViewCameraIntent): string | null {
  const { runtime, memory } = context;
  if (context.cameraFeedback.kind === 'applying') return '表示を変更中です。';
  if (context.cameraBlock !== null) return context.cameraBlock || 'カメラを操作できません。状態を確認してください。';
  if (!viewRuntimeMatches(context)) return '表示中のシーンを確認してください。';
  if (runtime.kind !== 'ready') return runtime.reason || 'カメラの状態を確認してください。';
  if (intent.kind === 'fit' || intent.kind === 'axis') {
    if (runtime.bounds.kind !== 'value') return '表示モデルの範囲を確認してください。';
    if (runtime.bounds.value === 'empty') return '表示するモデルがありません。';
    if (intent.kind === 'axis' && !viewAxes.includes(intent.axis)) return '見る方向を選び直してください。';
  }
  if (intent.kind === 'projection' && intent.projection !== 'perspective' && intent.projection !== 'orthographic') return '投影方式を選び直してください。';
  return intent.kind === 'recall' ? savedViewIssue(context, memory.selectedViewId) : null;
}
export function entryViewIssue(context: ViewContext): string | null {
  const { source, memory } = context, issue = viewSourceIssue(context);
  if (context.entryFeedback.kind === 'applying') return '開始時の視点を設定中です。';
  if (context.mutationBlock !== null) return context.mutationBlock || '現在は設定を変更できません。';
  if (issue || source.kind !== 'ready') return issue;
  if (source.entryViewId.kind !== 'value') return '開始時の視点に未解決の状態があります。状態を確認してください。';
  const draft = memory.entryDraft;
  if (!draft) return '変更はありません。';
  if (draft.baseId !== source.entryViewId.value) return '開始時の設定が更新されています。選択を残しています。取り消して確認してください。';
  return draft.viewId === null ? null : savedViewIssue(context, draft.viewId);
}
export function planView(context: ViewContext, intent: ViewIntent): ViewPlan {
  const { source, runtime, memory } = context;
  const block = (reason: string): ViewPlan => ({ kind: 'blocked', reason });
  const change = (action: 'select' | 'chooseEntry' | 'cancelEntry', patch: Partial<ViewMemory>): ViewPlan =>
    Object.freeze({ kind: 'change', action, sourceToken: source.token, baseMemory: memory, memory: Object.freeze({ ...memory, ...patch }) });
  if (intent.kind === 'cancelEntry') return context.entryFeedback.kind === 'applying' ? block('開始時の視点を設定中です。') : change('cancelEntry', { entryDraft: null });
  if (intent.kind === 'fit' || intent.kind === 'axis' || intent.kind === 'projection' || intent.kind === 'recall') {
    const issue = cameraIssue(context, intent); if (issue) return block(issue);
    return Object.freeze({ kind: 'camera', sceneId: memory.sceneId, projectFrameId: source.projectFrameId, runtimeToken: runtime.token, action: Object.freeze({ ...intent }),
      ...(intent.kind === 'recall' ? { sourceToken: source.token, viewId: memory.selectedViewId! } : {}) });
  }
  const issue = viewSourceIssue(context); if (issue || source.kind !== 'ready') return block(issue || 'シーンの状態を確認してください。');
  if (intent.kind === 'select') return intent.viewId === null || savedViewChoices(context).some(item => item.id === intent.viewId)
    ? change('select', { selectedViewId: intent.viewId }) : block('このシーンの視点を選択してください。');
  if (intent.kind === 'chooseEntry') {
    if (context.entryFeedback.kind === 'applying') return block('開始時の視点を設定中です。');
    if (context.mutationBlock !== null) return block(context.mutationBlock || '現在は設定を変更できません。');
    if (source.entryViewId.kind !== 'value') return block('開始時の視点の状態を確認してください。');
    if (intent.viewId !== null) { const issue = savedViewIssue(context, intent.viewId); if (issue) return block(issue); }
    const baseId = memory.entryDraft ? memory.entryDraft.baseId : source.entryViewId.value;
    return change('chooseEntry', { entryDraft: intent.viewId === baseId ? null : Object.freeze({ baseId, viewId: intent.viewId }) });
  }
  if (intent.kind === 'applyEntry') {
    const issue = entryViewIssue(context); if (issue) return block(issue);
    return Object.freeze({ kind: 'entry', sceneId: memory.sceneId, projectFrameId: source.projectFrameId, sourceToken: source.token, draft: memory.entryDraft!, viewId: memory.entryDraft!.viewId });
  }
  if (intent.kind !== 'review') return block('操作を選び直してください。');
  return Object.freeze({ kind: 'review', sceneId: memory.sceneId, projectFrameId: source.projectFrameId, sourceToken: source.token, target: intent.target,
    viewId: intent.target === 'selected' ? memory.selectedViewId : source.entryViewId.kind === 'value' ? source.entryViewId.value : null });
}
export function viewPlanIsCurrent(plan: ViewPlan, context: ViewContext): boolean {
  if (plan.kind === 'blocked') return false;
  if (plan.kind === 'change') return plan.baseMemory === context.memory &&
    (plan.action === 'cancelEntry' ? context.entryFeedback.kind !== 'applying' : plan.sourceToken === context.source.token && !viewSourceIssue(context) &&
      (plan.action !== 'chooseEntry' || (context.entryFeedback.kind !== 'applying' && context.mutationBlock === null)));
  if (plan.sceneId !== context.memory.sceneId || plan.sceneId !== context.source.sceneId || plan.projectFrameId !== context.source.projectFrameId) return false;
  if (plan.kind === 'camera') return plan.runtimeToken === context.runtime.token &&
    (plan.action.kind !== 'recall' || (plan.sourceToken === context.source.token && plan.viewId === context.memory.selectedViewId)) &&
    cameraIssue({ ...context, cameraFeedback: { kind: 'idle' } }, plan.action) === null;
  if (plan.sourceToken !== context.source.token) return false;
  if (plan.kind === 'entry') return plan.draft === context.memory.entryDraft && entryViewIssue({ ...context, entryFeedback: { kind: 'idle' } }) === null;
  return !viewSourceIssue(context) && (plan.target !== 'selected' || plan.viewId === context.memory.selectedViewId);
}
/** Host-confirmed working-state acknowledgement only; never marks Project bytes saved. */
export function acceptEntryView(plan: Extract<ViewPlan, { kind: 'entry' }>, memory: ViewMemory, observed: ViewSource): ViewMemory {
  return memory.entryDraft === plan.draft && observed.kind === 'ready' && Boolean(observed.token) && memory.sceneId === plan.sceneId &&
    observed.sceneId === plan.sceneId && observed.projectFrameId === plan.projectFrameId && observed.entryViewId.kind === 'value' && observed.entryViewId.value === plan.viewId
    ? Object.freeze({ ...memory, entryDraft: null }) : memory;
}
