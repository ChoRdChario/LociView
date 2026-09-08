import type { SceneState } from '../../scene/types';

export const taskLabels = Object.freeze({ captions: 'キャプション', models: 'モデル', materials: 'マテリアル', views: '視点' });
export type TaskId = keyof typeof taskLabels;
export type CaptionOwnerFilter = Readonly<{ kind: 'all' | 'project' | 'unresolved' }> |
  Readonly<{ kind: 'asset'; assetId: string }>;
export interface SceneUiMemory {
  readonly selectedCaptionId: string | null;
  readonly listScrollTop: number;
  readonly search: string;
  /** null includes future colors; [] deliberately shows no known-color pins. */
  readonly pinColors: readonly string[] | null;
  readonly ownerFilter: CaptionOwnerFilter;
}
export interface NavigationSession {
  readonly sceneId: string | null;
  readonly task: TaskId;
  /** Session-only memories; a tab/Scene switch never modifies them. */
  readonly sceneMemory: Readonly<Record<string, SceneUiMemory>>;
}
export type PendingInteraction = 'text' | 'composition' | 'pinPlacement' | 'pinMove' | 'modelTransform' | 'camera';
export type NavigationIntent = Readonly<{ kind: 'scene'; sceneId: string }> | Readonly<{ kind: 'task'; task: TaskId }>;
export type NavigationPlan =
  | Readonly<{ kind: 'unchanged'; session: NavigationSession }>
  | Readonly<{ kind: 'blocked'; session: NavigationSession; reason: string }>
  | Readonly<{ kind: 'change'; baseToken: string; baseSession: NavigationSession; session: NavigationSession;
      enterScene?: string }>;
export interface SceneChoice { readonly id: string; readonly label: string; readonly available: boolean }
const pendingReasons: Readonly<Record<PendingInteraction, string>> = Object.freeze({
  camera: 'カメラ操作を終えてください。',
  text: '入力を確定するか、取り消してください。',
  composition: '文字の入力を確定してください。',
  pinPlacement: 'ピンの追加を完了するか、取り消してください。',
  pinMove: 'ピンの移動を完了するか、取り消してください。',
  modelTransform: 'モデルの配置を確定するか、取り消してください。',
});
export const sceneSwitchReason = (pending: PendingInteraction | null): string => pending ? pendingReasons[pending] : '';
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Input is the same conflict-aware read port as pure Scene logic, never raw metadata. */
export function sceneChoices(state: SceneState): readonly SceneChoice[] {
  const ordered: { choice: SceneChoice; order: string | null }[] = [];
  for (const [id, scene] of Object.entries(state.scenes)) {
    if (scene.lifecycle.kind === 'value' && scene.lifecycle.value.state === 'deleted') continue;
    const available = scene.id === id && scene.lifecycle.kind === 'value' && scene.lifecycle.value.state === 'active';
    const label = scene.name.kind === 'value' ? (scene.name.value.trim() ? scene.name.value : '名称なし') : '名称を確認';
    const order = scene.orderKey.kind === 'value' && /^[0-9A-Za-z]{1,64}$/.test(scene.orderKey.value) ? scene.orderKey.value : null;
    ordered.push({ choice: Object.freeze({ id, label: !available ? `${label}（要確認）` :
      order === null ? `${label}（順序を確認）` : label, available }), order });
  }
  // Unresolved order has its own labelled trailing group, never a materialized winner.
  ordered.sort((a, b) => a.order === null && b.order !== null ? 1 : a.order !== null && b.order === null ? -1 :
    compare(a.order ?? '', b.order ?? '') || compare(a.choice.id, b.choice.id));
  return Object.freeze(ordered.map(item => item.choice));
}

/** Does not select Project default, apply a view, persist, or acknowledge saving. */
export function planNavigation(state: SceneState, session: NavigationSession,
  pending: PendingInteraction | null, intent: NavigationIntent): NavigationPlan {
  if (intent.kind === 'task') {
    if (!Object.hasOwn(taskLabels, intent.task)) return { kind: 'blocked', session, reason: '操作項目を選び直してください。' };
    if (intent.task === session.task) return { kind: 'unchanged', session };
    return Object.freeze({ kind: 'change', baseToken: state.token, baseSession: session,
      session: Object.freeze({ ...session, task: intent.task }) });
  }
  if (intent.sceneId === session.sceneId) return { kind: 'unchanged', session };
  if (pending) return { kind: 'blocked', session, reason: sceneSwitchReason(pending) };
  const choice = sceneChoices(state).find(item => item.id === intent.sceneId);
  if (!choice?.available) return { kind: 'blocked', session, reason: 'このシーンの状態を確認してください。' };
  return Object.freeze({ kind: 'change', baseToken: state.token, baseSession: session,
    session: Object.freeze({ ...session, sceneId: intent.sceneId }), enterScene: intent.sceneId });
}

/** A host must replan instead of committing an intent made against a replaced snapshot. */
export function navigationPlanIsCurrent(plan: NavigationPlan, state: SceneState,
  session: NavigationSession, pending: PendingInteraction | null): boolean {
  return plan.kind !== 'change' || (Boolean(plan.baseToken) && plan.baseToken === state.token &&
    plan.baseSession === session && (plan.enterScene === undefined || pending === null));
}
