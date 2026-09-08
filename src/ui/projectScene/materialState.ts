import type { Field, MaterialTarget } from '../../scene/types';
import { editMaterialAppearance, materialInput, validateMaterialIntent, type MaterialEditField, type MaterialEdits, type MaterialIntent } from '../../domain/materialIntent';
import type { ValueLimits } from '../../domain/values';
import { sceneSwitchReason, type PendingInteraction } from './navigationState';

export type MaterialScope = 'scene' | 'project';
export interface MaterialRecordPort { readonly id: string; readonly target: MaterialTarget; readonly scope: MaterialScope;
  readonly sceneId: string | null; readonly intent: Field<MaterialIntent> }
export interface MaterialSurfacePort {
  readonly target: MaterialTarget; readonly name: Field<string>;
  /** Null is proven absence; duplicate/routing/lifecycle conflicts are unresolved, not null. */
  readonly scene: Field<MaterialRecordPort | null>; readonly project: Field<MaterialRecordPort | null>;
  readonly sourceIntent: Field<MaterialIntent>;
  readonly fieldIssues: Readonly<Record<MaterialEditField, string | null>>;
  /** Pure candidate capability/source-semantics admission, covered by source token; never renderer fallback. */
  readonly admit: (intent: MaterialIntent) => string | null;
}
export interface MaterialModelPort { readonly assetId: string; readonly name: Field<string>; readonly surfaces: Field<readonly MaterialSurfacePort[]>; readonly reason: string | null }
export type MaterialSource = Readonly<{ token: string; projectId: string; sceneId: string; limits: ValueLimits }> &
  (Readonly<{ kind: 'ready'; models: readonly MaterialModelPort[] }> | Readonly<{ kind: 'unavailable'; reason: string }>);
export interface MaterialSelection { readonly assetId: string | null; readonly target: MaterialTarget | null; readonly scope: MaterialScope }
export const newMaterialSelection = (): MaterialSelection => Object.freeze({ assetId: null, target: null, scope: 'scene' });
export interface MaterialDraft { readonly sourceToken: string; readonly projectId: string; readonly sceneId: string;
  readonly selection: MaterialSelection; readonly recordId: string | null; readonly base: MaterialIntent;
  readonly edits: MaterialEdits; readonly composing: MaterialEditField | null }
export type MaterialEffect = Readonly<{ kind: 'apply'; token: string; projectId: string; sceneId: string; selection: MaterialSelection;
  recordId: string | null; draft: MaterialDraft; intent: MaterialIntent }> |
  Readonly<{ kind: 'remove'; token: string; projectId: string; sceneId: string; selection: MaterialSelection; recordId: string }>;
export interface MaterialContext { readonly source: MaterialSource; readonly selection: MaterialSelection; readonly draft: MaterialDraft | null;
  readonly pending: PendingInteraction | null; readonly mutationBlock: string | null;
  readonly feedback: Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'applying'; plan: MaterialEffect }> |
    Readonly<{ kind: 'failed'; plan: MaterialEffect; message: string }> }
export type MaterialIntentRequest = Readonly<{ kind: 'model'; assetId: string | null }> | Readonly<{ kind: 'surface'; key: string }> |
  Readonly<{ kind: 'scope'; scope: MaterialScope }> | Readonly<{ kind: 'begin' | 'apply' | 'remove' | 'review' | 'retry' }>;
export type MaterialPlan = MaterialEffect | Readonly<{ kind: 'blocked'; reason: string }> |
  Readonly<{ kind: 'select'; token: string; projectId: string; sceneId: string; baseSelection: MaterialSelection; selection: MaterialSelection }> |
  Readonly<{ kind: 'draft'; baseDraft: MaterialDraft | null; draft: MaterialDraft }> |
  Readonly<{ kind: 'cancel'; draft: MaterialDraft }> |
  Readonly<{ kind: 'review'; token: string; projectId: string; sceneId: string; selection: MaterialSelection }>;
export const materialTargetKey = (target: MaterialTarget): string => JSON.stringify([target.assetId, target.variantFamilyId, target.materialLayoutId, target.logicalMaterialSlotId]);
export const materialSelectionKey = (selection: MaterialSelection): string => JSON.stringify([selection.assetId, selection.target && materialTargetKey(selection.target), selection.scope]);
export const materialScopeLabel = (scope: MaterialScope): string => scope === 'scene' ? 'このシーンだけ' : 'プロジェクト共通';
const blocked = (reason: string): MaterialPlan => ({ kind: 'blocked', reason });
export function materialSourceIssue(source: MaterialSource): string | null {
  if (!source.token || !source.projectId || !source.sceneId) return 'プロジェクトとシーンの状態を確認してください。';
  if (source.kind !== 'ready') return source.reason || 'マテリアルを読み込めません。';
  const assets = new Set<string>(), targets = new Set<string>();
  for (const model of source.models) {
    if (!model.assetId || assets.has(model.assetId)) return 'モデルの候補が重複しています。状態を確認してください。';
    assets.add(model.assetId);
    if (model.surfaces.kind !== 'value') continue;
    for (const surface of model.surfaces.value) {
      const t = surface.target, key = materialTargetKey(t);
      if (t.assetId !== model.assetId || !t.variantFamilyId || !t.materialLayoutId || !t.logicalMaterialSlotId || targets.has(key))
        return '面の対応を確認してください。';
      targets.add(key);
    }
  }
  return null;
}
function recordIssue(surface: MaterialSurfacePort, scope: MaterialScope, sceneId: string): string | null {
  const field = surface[scope]; if (field.kind !== 'value') return `${materialScopeLabel(scope)}の設定を確認してください。`;
  const record = field.value; if (!record) return null;
  if (!/^ovr_[0-9a-f]{32}$/.test(record.id) || record.scope !== scope || record.sceneId !== (scope === 'scene' ? sceneId : null) ||
    materialTargetKey(record.target) !== materialTargetKey(surface.target)) return '設定の適用先を確認してください。';
  return record.intent.kind === 'value' ? null : `${materialScopeLabel(scope)}の設定に未解決の状態があります。`;
}
export function materialView(context: MaterialContext) {
  const { source, selection } = context; const issue = materialSourceIssue(source);
  const models = source.kind === 'ready' && !issue ? source.models : [];
  const model = models.find(item => item.assetId === selection.assetId);
  const surfaces = model?.surfaces.kind === 'value' ? model.surfaces.value : [];
  const surface = selection.target ? surfaces.find(item => materialTargetKey(item.target) === materialTargetKey(selection.target!)) : undefined;
  const issues = surface ? (['scene', 'project'] as const).map(scope => recordIssue(surface, scope, source.sceneId)).filter((text): text is string => text !== null) : [];
  const resolved = (scope: MaterialScope): MaterialRecordPort | null => surface && !recordIssue(surface, scope, source.sceneId) && surface[scope].kind === 'value' ? surface[scope].value : null;
  const scene = resolved('scene'), project = resolved('project'), record = resolved(selection.scope);
  const baseRecord = record ?? (selection.scope === 'scene' ? project : null);
  const base = baseRecord?.intent.kind === 'value' ? baseRecord.intent.value : surface?.sourceIntent.kind === 'value' ? surface.sourceIntent.value : null;
  const origin: MaterialScope | 'source' | null = scene ? 'scene' : project ? 'project' : surface?.sourceIntent.kind === 'value' ? 'source' : null;
  const targetIssue = issue || (!model ? 'モデルを選択してください。' : model.surfaces.kind !== 'value' ? model.reason || '面の一覧を確認してください。'
    : !surfaces.length ? model.reason || 'このモデルには編集できる面がありません。' : !surface ? '面を選択してください。' : null);
  const editIssue = targetIssue || (surface && recordIssue(surface, selection.scope, source.sceneId)) || (!base ? '元になる設定を確認してください。' : null);
  const sourceFallback = surface?.sourceIntent.kind === 'value' ? 'モデル元の設定を使います。' : 'モデル元の設定が確認できず、表示状態の確認が必要です。';
  const fallback = selection.scope === 'scene' ? project ? 'プロジェクト共通の設定を使います。' : sourceFallback
    : scene ? 'このシーンではシーン専用の設定が引き続き使われます。' : sourceFallback;
  return { issue, models, model, surfaces, surface, record, base, origin, issues, targetIssue, editIssue, fallback };
}
function writeIssue(context: MaterialContext): string | null {
  return context.feedback.kind === 'applying' ? '設定を適用中です。' : context.mutationBlock !== null ? context.mutationBlock || '現在は変更できません。'
    : sceneSwitchReason(context.pending) || null;
}
export function editMaterialDraft(draft: MaterialDraft, field: MaterialEditField, text: string, composing = draft.composing): MaterialDraft {
  const edits = { ...draft.edits };
  if (text === materialInput(draft.base.appearance, field)) delete edits[field]; else edits[field] = text;
  return Object.freeze({ ...draft, edits: Object.freeze(edits), composing });
}
export function materialApplyIssue(context: MaterialContext): string | null {
  const issue = writeIssue(context) || materialView(context).editIssue; if (issue) return issue;
  const { draft, source, selection } = context;
  if (!draft) return '設定を編集してください。';
  if (draft.sourceToken !== source.token || draft.projectId !== source.projectId || draft.sceneId !== source.sceneId || materialSelectionKey(draft.selection) !== materialSelectionKey(selection))
    return '設定が更新されています。入力を残しているため、取り消して状態を確認してください。';
  if (draft.composing) return '文字の入力を確定してください。';
  const view = materialView(context); if (draft.recordId !== (view.record?.id ?? null)) return '編集先の設定を確認してください。';
  if (!Object.keys(draft.edits).length) return '変更はありません。';
  for (const key of Object.keys(draft.edits) as MaterialEditField[]) {
    const issue = view.surface!.fieldIssues[key]; if (issue !== null) return issue || 'この設定には対応していません。';
  }
  let intent: MaterialIntent;
  try {
    intent = validateMaterialIntent({ ...draft.base, appearance: editMaterialAppearance(draft.base.appearance, draft.edits) }, source.limits);
  } catch (error) { return error instanceof Error && error.name !== 'DomainValidationError' && error.message ? error.message : 'この見え方の組み合わせは適用できません。状態を確認してください。'; }
  try {
    const issue = view.surface!.admit(intent); return issue === null ? null : issue || 'この設定には対応していません。';
  } catch { return '利用できる設定を確認できません。入力を残して状態を確認してください。'; }
}
export function planMaterial(context: MaterialContext, request: MaterialIntentRequest): MaterialPlan {
  const { source, selection, draft } = context, view = materialView(context);
  if (request.kind === 'review') return Object.freeze({ kind: 'review', token: source.token, projectId: source.projectId, sceneId: source.sceneId, selection });
  if (request.kind === 'retry') return context.feedback.kind === 'failed' && materialPlanIsCurrent(context.feedback.plan, context) ? context.feedback.plan : blocked('設定が変わっています。状態を確認してください。');
  if (request.kind === 'model' || request.kind === 'surface' || request.kind === 'scope') {
    if (draft || context.feedback.kind === 'applying' || context.pending) return blocked(sceneSwitchReason(context.pending) || '編集中の変更を適用するか取り消してください。');
    if (view.issue) return blocked(view.issue);
    let next: MaterialSelection = selection;
    if (request.kind === 'model') {
      if (request.assetId !== null && !view.models.some(item => item.assetId === request.assetId)) return blocked('モデルを選び直してください。');
      next = { ...selection, assetId: request.assetId, target: selection.assetId === request.assetId ? selection.target : null };
    } else if (request.kind === 'surface') {
      const surface = view.surfaces.find(item => materialTargetKey(item.target) === request.key);
      if (!surface) return blocked('面を選び直してください。'); next = { ...selection, target: surface.target };
    } else {
      if (request.scope !== 'project' && request.scope !== 'scene') return blocked('適用範囲を選び直してください。'); next = { ...selection, scope: request.scope };
    }
    return Object.freeze({ kind: 'select', token: source.token, projectId: source.projectId, sceneId: source.sceneId, baseSelection: selection, selection: Object.freeze(next) });
  }
  const issue = writeIssue(context) || view.editIssue; if (issue) return blocked(issue);
  if (request.kind === 'begin') {
    if (draft) return blocked('編集中の入力があります。');
    return Object.freeze({ kind: 'draft', baseDraft: null, draft: Object.freeze({ sourceToken: source.token, projectId: source.projectId, sceneId: source.sceneId,
      selection, recordId: view.record?.id ?? null, base: view.base!, edits: Object.freeze({}), composing: null }) });
  }
  if (request.kind === 'apply') {
    const issue = materialApplyIssue(context); if (issue || !draft) return blocked(issue || '設定を確認してください。');
    return Object.freeze({ kind: 'apply', token: source.token, projectId: source.projectId, sceneId: source.sceneId, selection,
      recordId: draft.recordId, draft, intent: validateMaterialIntent({ ...draft.base, appearance: editMaterialAppearance(draft.base.appearance, draft.edits) }, source.limits) });
  }
  if (draft || !view.record) return blocked(draft ? '入力を適用するか取り消してください。' : 'この範囲に解除する設定はありません。');
  return Object.freeze({ kind: 'remove', token: source.token, projectId: source.projectId, sceneId: source.sceneId, selection, recordId: view.record.id });
}
export function materialPlanIsCurrent(plan: MaterialPlan, context: MaterialContext): boolean {
  if (plan.kind === 'blocked') return false;
  if (plan.kind === 'cancel') return context.draft === plan.draft && !plan.draft.composing && context.feedback.kind !== 'applying';
  if (plan.kind === 'draft') return context.draft === plan.baseDraft && context.source.projectId === plan.draft.projectId && context.source.sceneId === plan.draft.sceneId &&
    materialSelectionKey(context.selection) === materialSelectionKey(plan.draft.selection) && context.feedback.kind !== 'applying' && (plan.baseDraft !== null ||
    (context.source.token === plan.draft.sourceToken && materialSelectionKey(context.selection) === materialSelectionKey(plan.draft.selection) && !writeIssue(context) && !materialView(context).editIssue));
  if (plan.token !== context.source.token) return false;
  if (plan.projectId !== context.source.projectId || plan.sceneId !== context.source.sceneId) return false;
  if (plan.kind === 'select') return plan.baseSelection === context.selection && !context.draft && !context.pending && context.feedback.kind !== 'applying' && !materialSourceIssue(context.source);
  if (plan.kind === 'review') return materialSelectionKey(plan.selection) === materialSelectionKey(context.selection) ||
    (context.feedback.kind === 'failed' && materialSelectionKey(plan.selection) === materialSelectionKey(context.feedback.plan.selection));
  if (materialSelectionKey(plan.selection) !== materialSelectionKey(context.selection)) return false;
  const checking = context.feedback.kind === 'applying' && context.feedback.plan === plan ? { ...context, feedback: { kind: 'idle' as const } } : context;
  if (plan.kind === 'apply') return plan.draft === context.draft && !materialApplyIssue(checking);
  const view = materialView(context); return !context.draft && !writeIssue(checking) && !view.editIssue && view.record?.id === plan.recordId;
}
/** Host-confirmed exact working-state receipt only, never durable-save or renderer acknowledgement. */
export function acceptMaterialApply(plan: Extract<MaterialEffect, { kind: 'apply' }>, draft: MaterialDraft | null,
  receipt: Readonly<{ plan: MaterialEffect; projectId: string; sceneId: string; selection: MaterialSelection; recordId: string; intent: MaterialIntent }>): MaterialDraft | null {
  return draft === plan.draft && receipt.plan === plan && receipt.projectId === plan.projectId && receipt.sceneId === plan.sceneId &&
    materialSelectionKey(receipt.selection) === materialSelectionKey(plan.selection) && /^ovr_[0-9a-f]{32}$/.test(receipt.recordId) &&
    (plan.recordId === null || plan.recordId === receipt.recordId) && receipt.intent === plan.intent ? null : draft;
}
