import type { Field } from '../../scene/types';
import { sceneSwitchReason, type PendingInteraction } from './navigationState';

/** Token covers resolved owner/binding/frame/class/visibility and operation eligibility.
 * The host diagnoses ambiguous families, absent proxies and needsReview; no guesses here. */
export interface PinModelTarget {
  readonly assetId: string; readonly name: Field<string>; readonly token: string;
  readonly addBlock: string | null; readonly moveBlock: string | null;
}
export interface PinMoveTarget {
  readonly captionId: string; readonly title: Field<string>; readonly assetId: Field<string>;
  readonly token: string; readonly block: string | null; readonly sceneCount: Field<number>;
}
export type PinModeSource = Readonly<{ token: string; sceneId: string }> & (
  Readonly<{ kind: 'ready'; models: readonly PinModelTarget[]; selected: PinMoveTarget | null }> |
  Readonly<{ kind: 'unavailable'; reason: string }>);
export interface PinMode {
  readonly sceneId: string; readonly kind: 'add' | 'move'; readonly target: PinModelTarget;
  readonly caption: PinMoveTarget | null;
}
export interface PinModeMemory { readonly sceneId: string; readonly addTargetId: string | null; readonly mode: PinMode | null;
  readonly choosingSurface?: boolean }
export const newPinModeMemory = (sceneId: string): PinModeMemory => Object.freeze({ sceneId, addTargetId: null, mode: null });
/** Fully validated TRANSIENT candidate held by host; not coordinates, an anchor or a saved acknowledgement. */
export interface PinProposal { readonly token: string; readonly mode: PinMode }
export interface PinModeContext {
  readonly source: PinModeSource; readonly memory: PinModeMemory;
  /** Other editors only; the mode below is itself fed into the host's navigation guard. */
  readonly otherPending: PendingInteraction | null;
  readonly mutationBlock: string | null; readonly proposal: PinProposal | null; readonly proposalIssue: string | null;
  readonly feedback: Readonly<{ kind: 'idle' | 'applying' }> | Readonly<{ kind: 'failed'; message: string }>;
}
export type PinModeIntent = Readonly<{ kind: 'target'; assetId: string | null }> |
  Readonly<{ kind: 'beginAdd' | 'add' | 'move' | 'finish' }> |
  Readonly<{ kind: 'cancel'; confirmedMode: PinMode | null; confirmedProposal: PinProposal | null }>;
interface Base { readonly token: string; readonly sceneId: string; readonly baseMemory: PinModeMemory; readonly baseProposal: PinProposal | null }
export type PinModePlan = Readonly<{ kind: 'blocked'; reason: string }> |
  (Base & Readonly<{ kind: 'change'; memory: PinModeMemory; intent: 'target' | 'beginAdd' | 'add' | 'move' | 'cancel' }>) |
  (Base & Readonly<{ kind: 'finish'; mode: PinMode; proposal: PinProposal }>);
export const pinTargetName = (field: Field<string>): string => field.kind === 'value' ? field.value.trim() ? field.value : '名称なし' : '名称を確認';
export function pinSourceIssue(context: PinModeContext): string | null {
  const { source, memory } = context;
  if (source.sceneId !== memory.sceneId || !source.token) return 'シーンを確認してください。';
  if (source.kind !== 'ready') return source.reason || 'モデルの状態を確認してください。';
  if (new Set(source.models.map(item => item.assetId)).size !== source.models.length) return 'モデルの状態を確認してください。';
  return null;
}
const countIssue = (target: PinMoveTarget): string | null => target.sceneCount.kind !== 'value' ||
  !Number.isSafeInteger(target.sceneCount.value) || target.sceneCount.value < 1 ? '影響するシーンを確認してください。' : null;
export function pinActionIssue(context: PinModeContext, action: 'beginAdd' | 'add' | 'move' | 'finish'): string | null {
  const { source, memory } = context, mode = memory.mode;
  if (context.feedback.kind === 'applying') return '位置を適用中です。';
  if (context.mutationBlock !== null) return context.mutationBlock || '現在は変更できません。';
  const sourceIssue = pinSourceIssue(context); if (sourceIssue || source.kind !== 'ready') return sourceIssue;
  if (context.otherPending) return sceneSwitchReason(context.otherPending);
  if ((action === 'beginAdd' || action === 'move') && memory.choosingSurface) return '面を選択するか、取り消してください。';
  if (action !== 'finish' && mode) return 'ピンの操作を確定するか、取り消してください。';
  if (action === 'beginAdd') return source.models.some(m => m.token && m.addBlock === null) ? null : '追加できるモデルを表示してください。';
  if (action === 'finish' && (!mode || mode.sceneId !== source.sceneId)) return 'ピンの操作を開始してください。';
  const caption = action === 'move' ? source.selected : action === 'finish' ? mode!.caption : null;
  if (caption) {
    if (caption.block !== null) return caption.block || 'ピンの状態を確認してください。';
    if (!caption.token || caption.assetId.kind !== 'value') return 'ピンのモデルを確認してください。';
    const issue = countIssue(caption); if (issue) return issue;
  } else if (action === 'move') return 'キャプションを選択してください。';
  const targetId = action === 'finish' ? mode!.target.assetId : caption?.assetId.kind === 'value' ? caption.assetId.value : memory.addTargetId;
  const target = source.models.find(item => item.assetId === targetId);
  if (!target) return '対象モデルを選択してください。';
  if (!target.token) return 'モデルの状態を確認してください。';
  const block = (action === 'move' || (action === 'finish' && mode!.kind === 'move')) ? target.moveBlock : target.addBlock;
  if (block !== null) return block || 'モデルの状態を確認してください。';
  if (action === 'finish') {
    if (target.token !== mode!.target.token || (caption && (source.selected?.captionId !== caption.captionId ||
      source.selected.token !== caption.token || source.selected.block !== null || countIssue(source.selected))))
      return '対象が更新されています。入力を残しています。取り消して状態を確認してください。';
    if (context.proposalIssue !== null) return context.proposalIssue || '位置を確認してください。';
    if (!context.proposal || context.proposal.mode !== mode || !context.proposal.token) return '位置を指定してください。';
  }
  return null;
}
export function planPinMode(context: PinModeContext, intent: PinModeIntent): PinModePlan {
  const { source, memory } = context;
  const base = { token: source.token, sceneId: memory.sceneId, baseMemory: memory, baseProposal: context.proposal };
  const blocked = (reason: string): PinModePlan => ({ kind: 'blocked', reason });
  const change = (patch: Partial<PinModeMemory>): PinModePlan => Object.freeze({ ...base, kind: 'change',
    intent: intent.kind as 'target' | 'beginAdd' | 'add' | 'move' | 'cancel', memory: Object.freeze({ ...memory, ...patch }) });
  // Local cancellation stays possible after source/access loss; it cannot abort an in-flight write.
  if (intent.kind === 'cancel') return memory.mode === intent.confirmedMode && context.proposal === intent.confirmedProposal && context.feedback.kind !== 'applying'
    ? change({ mode: null, choosingSurface: false }) : blocked('現在のピン操作を確認してください。');
  if (intent.kind === 'target') {
    const issue = pinSourceIssue(context);
    if (issue || memory.mode || context.feedback.kind === 'applying') return blocked(issue || 'ピンの操作を確定するか、取り消してください。');
    return intent.assetId === null || (source.kind === 'ready' && source.models.some(item => item.assetId === intent.assetId))
      ? change({ addTargetId: intent.assetId }) : blocked('モデルを選び直してください。');
  }
  const issue = pinActionIssue(context, intent.kind); if (issue) return blocked(issue);
  if (intent.kind === 'beginAdd') return change({ choosingSurface: true, addTargetId: null });
  if (intent.kind === 'finish') return Object.freeze({ ...base, kind: 'finish', mode: memory.mode!, proposal: context.proposal! });
  if (source.kind !== 'ready') return blocked('モデルの状態を確認してください。');
  const caption = intent.kind === 'move' ? source.selected : null;
  const assetId = caption?.assetId.kind === 'value' ? caption.assetId.value : memory.addTargetId;
  const target = source.models.find(item => item.assetId === assetId)!;
  return change({ choosingSurface: false, mode: Object.freeze({ sceneId: source.sceneId, kind: intent.kind, target, caption }) });
}
export function pinModePlanIsCurrent(plan: PinModePlan, context: PinModeContext): boolean {
  if (plan.kind === 'blocked' || plan.baseMemory !== context.memory || plan.sceneId !== context.memory.sceneId) return false;
  if (plan.kind === 'change' && plan.intent === 'cancel') return context.feedback.kind !== 'applying' && plan.baseProposal === context.proposal;
  if (plan.token !== context.source.token || plan.sceneId !== context.source.sceneId) return false;
  if (plan.kind === 'finish') return context.memory.mode === plan.mode && context.proposal === plan.proposal &&
    pinActionIssue({ ...context, feedback: { kind: 'idle' } }, 'finish') === null;
  return plan.intent === 'target' ? !context.memory.mode && context.feedback.kind !== 'applying' && !pinSourceIssue(context)
    : (plan.intent === 'beginAdd' || plan.intent === 'add' || plan.intent === 'move') && pinActionIssue(context, plan.intent) === null;
}
