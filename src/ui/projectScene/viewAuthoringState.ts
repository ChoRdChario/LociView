import type { Field } from '../../scene/types';
import { normalizeSceneName as normalizeViewName } from '../../domain/values';
import { savedViewChoices, viewSourceIssue, viewRuntimeMatches, type ViewContext, type ViewFeedback, type SavedViewItem } from './viewState';

/** Opaque handle to host-retained, fully validated exact camera AND background. No HEX conversion. */
export interface ViewCapture {
  readonly token: string; readonly sceneId: string; readonly projectFrameId: string; readonly runtimeToken: string;
}
export type CaptureSource = Readonly<{ kind: 'ready'; capture: ViewCapture }> | Readonly<{ kind: 'unavailable'; reason: string }>;
/** Exact atomic-field versions from the same validated source; not timestamps or filenames. */
export interface ViewFieldVersions {
  readonly sourceToken: string; readonly viewId: string; readonly camera: string; readonly background: string;
}
export interface ViewAuthorDraft {
  readonly sceneId: string; readonly projectFrameId: string; readonly viewId: string | null;
  readonly baseName: Field<string>; readonly name: string; readonly nameEdited: boolean; readonly composing: boolean;
  readonly capture: ViewCapture | null; readonly captureBase: ViewFieldVersions | null;
}
export interface ViewAuthorContext {
  readonly view: ViewContext; readonly draft: ViewAuthorDraft | null; readonly capture: CaptureSource;
  readonly versions: ViewFieldVersions | null;
  /** Complete current reference/deletion admission, not merely this Scene's entry pointer. */
  readonly deletion: Readonly<{ sourceToken: string; viewId: string; issue: string | null }> | null;
  readonly feedback: ViewFeedback;
}
export type ViewAuthorIntent = Readonly<{ kind: 'new' | 'edit' | 'capture' | 'apply' | 'delete' }> |
  Readonly<{ kind: 'move'; direction: 'earlier' | 'later' }>;
export type ViewAuthorPlan = Readonly<{ kind: 'blocked'; reason: string }> |
  Readonly<{ kind: 'draft'; sourceToken: string; selectedViewId: string | null; baseDraft: ViewAuthorDraft | null; draft: ViewAuthorDraft }> |
  Readonly<{ kind: 'apply'; sourceToken: string; sceneId: string; projectFrameId: string; draft: ViewAuthorDraft;
    viewId: string | null; name?: string; capture?: ViewCapture }> |
  Readonly<{ kind: 'delete'; sourceToken: string; sceneId: string; projectFrameId: string; viewId: string }> |
  Readonly<{ kind: 'move'; sourceToken: string; sceneId: string; projectFrameId: string; viewId: string;
    direction: 'earlier' | 'later'; neighborId: string }>;
const blocked = (reason: string): ViewAuthorPlan => ({ kind: 'blocked', reason });
export function selectedAuthorView(context: ViewAuthorContext): SavedViewItem | null {
  const { source, memory } = context.view;
  if (viewSourceIssue(context.view) || source.kind !== 'ready') return null;
  const items = source.views.filter(item => item.id === memory.selectedViewId);
  const item = items.length === 1 ? items[0]! : null;
  return item && item.sceneId === source.sceneId && item.projectFrameId === source.projectFrameId &&
    item.lifecycle.kind === 'value' && item.lifecycle.value.state === 'active' ? item : null;
}
function writeIssue(context: ViewAuthorContext): string | null {
  return context.feedback.kind === 'applying' ? '視点の変更を適用中です。' :
    context.view.mutationBlock !== null ? context.view.mutationBlock || '現在は視点を変更できません。' : viewSourceIssue(context.view);
}
function captureIssue(context: ViewAuthorContext): string | null {
  const { view, capture } = context;
  if (view.cameraBlock !== null) return view.cameraBlock || '表示の操作を終了してください。';
  if (view.cameraFeedback.kind === 'applying') return '表示の変更が完了するまで待ってください。';
  if (!viewRuntimeMatches(view) || view.runtime.kind !== 'ready') return '表示中のシーンを確認してください。';
  if (capture.kind !== 'ready') return capture.reason || '現在の表示を記録できません。';
  const saved = capture.capture;
  return saved.token && saved.sceneId === view.source.sceneId && saved.projectFrameId === view.source.projectFrameId &&
    saved.runtimeToken === view.runtime.token ? null : '表示が更新されています。記録し直してください。';
}
function versionsCurrent(context: ViewAuthorContext): boolean {
  const { versions, view } = context;
  return Boolean(versions && versions.sourceToken === view.source.token && versions.viewId === view.memory.selectedViewId && versions.camera && versions.background);
}
export function editViewName(draft: ViewAuthorDraft, name: string, composing = draft.composing): ViewAuthorDraft {
  return Object.freeze({ ...draft, name, composing, nameEdited: draft.viewId === null || draft.baseName.kind !== 'value' || name !== draft.baseName.value });
}
export function viewAuthorApplyIssue(context: ViewAuthorContext): string | null {
  const issue = writeIssue(context); if (issue) return issue;
  const { draft, view } = context;
  if (!draft || draft.sceneId !== view.source.sceneId || draft.projectFrameId !== view.source.projectFrameId) return '編集中の視点を確認してください。';
  if (draft.composing) return '文字の入力を確定してください。';
  const item = draft.viewId === null ? null : selectedAuthorView(context);
  if (draft.viewId !== null && (!item || item.id !== draft.viewId)) return '編集中の視点を確認してください。';
  if (draft.nameEdited || draft.viewId === null) {
    if (item && (item.name.kind !== 'value' || draft.baseName.kind !== 'value' || item.name.value !== draft.baseName.value))
      return '名称が更新されています。入力を残しています。状態を確認してください。';
    try { normalizeViewName(draft.name); } catch { return '名称は空欄にせず、256文字以内で入力してください。使用できない文字も確認してください。'; }
  }
  if (draft.capture) {
    if (!draft.capture.token || draft.capture.sceneId !== draft.sceneId || draft.capture.projectFrameId !== draft.projectFrameId)
      return '記録した表示を確認してください。';
    if (item && (item.camera.kind !== 'value' || item.background.kind !== 'value' || !versionsCurrent(context) || !draft.captureBase ||
      draft.captureBase.camera !== context.versions!.camera || draft.captureBase.background !== context.versions!.background))
      return '保存した視点が更新されています。入力を残しています。状態を確認してください。';
  } else if (draft.viewId === null) return '現在の表示を記録してください。';
  return draft.nameEdited || draft.capture ? null : '変更はありません。';
}
export function planViewAuthor(context: ViewAuthorContext, intent: ViewAuthorIntent): ViewAuthorPlan {
  const issue = writeIssue(context); if (issue) return blocked(issue);
  const { view, draft } = context, source = view.source;
  const item = selectedAuthorView(context);
  const scope = { sourceToken: source.token, sceneId: source.sceneId, projectFrameId: source.projectFrameId };
  if (intent.kind === 'apply') {
    const issue = viewAuthorApplyIssue(context); if (issue || !draft) return blocked(issue || '編集中の視点を確認してください。');
    return Object.freeze({ kind: 'apply', ...scope, draft, viewId: draft.viewId,
      ...(draft.nameEdited || draft.viewId === null ? { name: normalizeViewName(draft.name) } : {}),
      ...(draft.capture ? { capture: draft.capture } : {}) });
  }
  if (intent.kind === 'capture') {
    if (!draft || draft.composing || draft.sceneId !== source.sceneId || draft.projectFrameId !== source.projectFrameId ||
      (draft.viewId !== null && draft.viewId !== item?.id)) return blocked('編集中の視点と入力の確定を確認してください。');
    const issue = captureIssue(context); if (issue || context.capture.kind !== 'ready') return blocked(issue || '表示を確認してください。');
    if (draft.viewId !== null && (!versionsCurrent(context) || item?.camera.kind !== 'value' || item.background.kind !== 'value'))
      return blocked('保存した視点と背景の状態を確認してください。');
    // Taking another display snapshot does NOT rebase an existing shared-field edit.
    return Object.freeze({ kind: 'draft', sourceToken: source.token, selectedViewId: view.memory.selectedViewId, baseDraft: draft, draft: Object.freeze({ ...draft, capture: context.capture.capture,
      captureBase: draft.captureBase ?? (draft.viewId === null ? null : context.versions) }) });
  }
  if (draft) return blocked('編集中の変更を適用するか取り消してください。');
  if (intent.kind === 'new' || intent.kind === 'edit') {
    if (intent.kind === 'edit' && !item) return blocked('編集する視点を選択してください。');
    if (intent.kind === 'new') { const issue = captureIssue(context); if (issue) return blocked(issue); }
    const baseName: Field<string> = intent.kind === 'edit' ? item!.name : { kind: 'value', value: '' };
    return Object.freeze({ kind: 'draft', sourceToken: source.token, selectedViewId: view.memory.selectedViewId, baseDraft: null, draft: Object.freeze({ sceneId: source.sceneId, projectFrameId: source.projectFrameId,
      viewId: intent.kind === 'edit' ? item!.id : null, baseName, name: baseName.kind === 'value' ? baseName.value : '',
      nameEdited: intent.kind === 'new', composing: false,
      capture: intent.kind === 'new' && context.capture.kind === 'ready' ? context.capture.capture : null, captureBase: null }) });
  }
  if (!item) return blocked('変更する視点を選択してください。');
  if (intent.kind === 'delete') {
    if (source.kind !== 'ready' || source.entryViewId.kind !== 'value') return blocked('開始時の視点の状態を確認してください。');
    if (source.entryViewId.value === item.id) return blocked('開始時の視点を解除するか、別の視点を指定してください。');
    const dependencies = context.deletion;
    if (!dependencies || dependencies.viewId !== item.id || dependencies.sourceToken !== source.token) return blocked('この視点を使用している項目を確認してください。');
    if (dependencies.issue !== null) return blocked(dependencies.issue || 'この視点は使用中です。');
    return Object.freeze({ kind: 'delete', ...scope, viewId: item.id });
  }
  const choices = savedViewChoices(view);
  if (intent.kind !== 'move' || (intent.direction !== 'earlier' && intent.direction !== 'later')) return blocked('移動先を選び直してください。');
  if (choices.some(row => row.order === null) || source.kind !== 'ready' || source.views.some(row => row.sceneId === source.sceneId && row.lifecycle.kind !== 'value'))
    return blocked('視点の順序と状態を確認してください。');
  const index = choices.findIndex(row => row.id === item.id), neighbor = choices[index + (intent.direction === 'earlier' ? -1 : 1)];
  if (index < 0 || !neighbor) return blocked(intent.direction === 'earlier' ? '先頭の視点です。' : '末尾の視点です。');
  return Object.freeze({ kind: 'move', ...scope, viewId: item.id, direction: intent.direction, neighborId: neighbor.id });
}
export function viewAuthorPlanIsCurrent(plan: ViewAuthorPlan, context: ViewAuthorContext): boolean {
  if (plan.kind === 'blocked') return false;
  if (plan.kind === 'draft') return plan.baseDraft === context.draft && plan.sourceToken === context.view.source.token &&
    plan.selectedViewId === context.view.memory.selectedViewId && plan.draft.sceneId === context.view.source.sceneId &&
    plan.draft.projectFrameId === context.view.source.projectFrameId && !writeIssue(context) &&
    (plan.draft.capture === context.draft?.capture || !plan.draft.capture ||
      (context.capture.kind === 'ready' && plan.draft.capture === context.capture.capture && !captureIssue(context)));
  if (plan.sourceToken !== context.view.source.token || plan.sceneId !== context.view.source.sceneId || plan.projectFrameId !== context.view.source.projectFrameId) return false;
  const idle = { ...context, feedback: { kind: 'idle' as const } };
  if (plan.kind === 'apply') return plan.draft === context.draft && viewAuthorApplyIssue(idle) === null;
  const current = planViewAuthor(idle, plan.kind === 'move' ? { kind: 'move', direction: plan.direction } : { kind: 'delete' });
  return current.kind === plan.kind && current.viewId === plan.viewId && (current.kind !== 'move' || plan.kind !== 'move' || current.neighborId === plan.neighborId);
}

/** Receipt is emitted only after host-verified working-state application, never durable save. */
export function acceptViewAuthor(plan: Extract<ViewAuthorPlan, { kind: 'apply' }>, draft: ViewAuthorDraft | null,
  receipt: Readonly<{ plan: ViewAuthorPlan; source: ViewContext['source']; viewId: string; captureToken?: string }>): ViewAuthorDraft | null {
  const source = receipt.source;
  if (draft !== plan.draft || receipt.plan !== plan || source.kind !== 'ready' || !source.token ||
    source.sceneId !== plan.sceneId || source.projectFrameId !== plan.projectFrameId ||
    (plan.viewId !== null && receipt.viewId !== plan.viewId) || !/^view_[0-9a-f]{32}$/.test(receipt.viewId)) return draft;
  const items = source.views.filter(item => item.id === receipt.viewId), item = items.length === 1 ? items[0] : null;
  if (!item || item.sceneId !== plan.sceneId || item.projectFrameId !== plan.projectFrameId || item.lifecycle.kind !== 'value' || item.lifecycle.value.state !== 'active' ||
    (plan.name !== undefined && (item.name.kind !== 'value' || item.name.value !== plan.name)) ||
    (plan.capture && (receipt.captureToken !== plan.capture.token || item.camera.kind !== 'value' || item.background.kind !== 'value'))) return draft;
  return null;
}
