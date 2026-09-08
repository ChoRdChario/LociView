import { NATIVE_STANDARD_BACKGROUND_HEX, normalizeNativeBackgroundHex, nativeBackgroundFromHex } from '../../nativeGs/backgroundColor';
import { viewRuntimeMatches, type ViewContext, type ViewFeedback } from './viewState';

export const standardViewBackground = NATIVE_STANDARD_BACKGROUND_HEX;
/** token covers the exact, unrounded background only. hex is a display value, not its stored replacement. */
export type ViewBackgroundSource = Readonly<{ sceneId: string; projectFrameId: string; token: string }> & (
  Readonly<{ kind: 'solid'; hex: string }> | Readonly<{ kind: 'unavailable'; reason: string }>);
export interface ViewBackgroundDraft {
  readonly sceneId: string; readonly projectFrameId: string; readonly baseToken: string;
  readonly baseHex: string; readonly hex: string; readonly composing: boolean;
}
export interface ViewBackgroundContext {
  readonly view: ViewContext; readonly source: ViewBackgroundSource;
  readonly draft: ViewBackgroundDraft | null; readonly feedback: ViewFeedback;
}
export interface ViewBackgroundPlan {
  readonly kind: 'background'; readonly sceneId: string; readonly projectFrameId: string;
  readonly draft: ViewBackgroundDraft; readonly background: ReturnType<typeof nativeBackgroundFromHex>;
}
export function backgroundSourceIssue(context: ViewBackgroundContext): string | null {
  const { source, view } = context;
  if (!viewRuntimeMatches(view) || view.runtime.kind !== 'ready' || source.sceneId !== view.source.sceneId ||
    source.projectFrameId !== view.source.projectFrameId || !source.token) return '表示中の背景を確認してください。';
  if (source.kind !== 'solid') return source.reason || 'この背景は色の編集に対応していません。';
  return normalizeNativeBackgroundHex(source.hex) ? null : '背景色の状態を確認してください。';
}
export function editViewBackground(context: ViewBackgroundContext, hex: string, composing = false): ViewBackgroundDraft | null {
  const { draft, source } = context;
  if (draft) return Object.freeze({ ...draft, hex, composing });
  if (backgroundSourceIssue(context) || source.kind !== 'solid') return null;
  return Object.freeze({ sceneId: source.sceneId, projectFrameId: source.projectFrameId, baseToken: source.token,
    baseHex: source.hex, hex, composing });
}
export function viewBackgroundIssue(context: ViewBackgroundContext): string | null {
  const { view, draft } = context;
  if (context.feedback.kind === 'applying' || view.cameraFeedback.kind === 'applying') return '背景・表示の変更が完了するまで待ってください。';
  if (view.cameraBlock !== null) return view.cameraBlock || '表示の操作を終了してください。';
  const issue = backgroundSourceIssue(context); if (issue) return issue;
  if (!draft) return '変更はありません。';
  if (draft.sceneId !== context.source.sceneId || draft.projectFrameId !== context.source.projectFrameId || draft.baseToken !== context.source.token)
    return '背景が更新されています。入力を残しています。取り消して確認してください。';
  if (draft.composing) return '文字の入力を確定してください。';
  const hex = normalizeNativeBackgroundHex(draft.hex);
  if (!hex) return '背景色は # と6桁の16進数で入力してください。';
  return hex === normalizeNativeBackgroundHex(draft.baseHex) ? '変更はありません。' : null;
}
export function planViewBackground(context: ViewBackgroundContext): ViewBackgroundPlan | Readonly<{ kind: 'blocked'; reason: string }> {
  const issue = viewBackgroundIssue(context); if (issue || !context.draft) return { kind: 'blocked', reason: issue || '背景を確認してください。' };
  const background = nativeBackgroundFromHex(context.draft.hex); Object.freeze(background.colorSrgb); Object.freeze(background);
  return Object.freeze({ kind: 'background', sceneId: context.source.sceneId, projectFrameId: context.source.projectFrameId,
    draft: context.draft, background });
}
export function viewBackgroundPlanIsCurrent(plan: ViewBackgroundPlan, context: ViewBackgroundContext): boolean {
  return plan.draft === context.draft && plan.sceneId === context.source.sceneId && plan.projectFrameId === context.source.projectFrameId &&
    viewBackgroundIssue({ ...context, feedback: { kind: 'idle' } }) === null;
}
export function acceptViewBackground(plan: ViewBackgroundPlan, draft: ViewBackgroundDraft | null,
  receipt: Readonly<{ plan: ViewBackgroundPlan; source: ViewBackgroundSource; background: ViewBackgroundPlan['background'] }>): ViewBackgroundDraft | null {
  return receipt.plan === plan && draft === plan.draft && receipt.source.kind === 'solid' && Boolean(receipt.source.token) &&
    receipt.source.sceneId === plan.sceneId && receipt.source.projectFrameId === plan.projectFrameId &&
    normalizeNativeBackgroundHex(receipt.source.hex) === normalizeNativeBackgroundHex(plan.draft.hex) &&
    receipt.background.kind === 'solid' && receipt.background.colorSrgb.length === 3 &&
    receipt.background.colorSrgb.every((channel, index) => channel === plan.background.colorSrgb[index]) ? null : draft;
}
