import type { SceneState } from '../../scene/types';
import { planNavigation, sceneChoices, sceneSwitchReason, taskLabels,
  type NavigationIntent, type NavigationPlan, type NavigationSession, type PendingInteraction, type TaskId } from './navigationState';

export type SavePresentation =
  | Readonly<{ kind: 'saved' | 'unsaved' | 'saving' | 'readOnly' }>
  | Readonly<{ kind: 'failed' | 'recovery'; message: string }>;
export interface NavigationProps {
  readonly scenes: SceneState;
  readonly session: NavigationSession;
  readonly pending: PendingInteraction | null;
  /** Supplied by the host. This component can never turn a failure into saved. */
  readonly save: SavePresentation;
}
const saveLabels = Object.freeze({ saved: '保存済み', unsaved: '未保存', saving: '保存中…',
  readOnly: '閲覧のみ', failed: '保存できませんでした', recovery: '未完了の処理があります' });
let nextInstance = 0;

/**
 * Disconnected presentation slots. Put sceneControl/saveStatus in the shared
 * header, and taskControl above the right task area (responsive host owns reflow).
 * No renderer/storage/app imports, HTML interpolation or mutable Project state.
 */
export function createNavigationControls(document: Document, onPlan: (plan: NavigationPlan) => void) {
  const sceneControl = document.createElement('div'); sceneControl.className = 'lv-scene-control';
  const label = document.createElement('label'); label.textContent = 'シーン';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'シーン');
  const reason = document.createElement('p'); reason.id = `lv-scene-switch-reason-${++nextInstance}`;
  reason.setAttribute('role', 'status'); reason.setAttribute('aria-live', 'polite');
  select.setAttribute('aria-describedby', reason.id);
  label.append(select); sceneControl.append(label, reason);
  const taskControl = document.createElement('nav'); taskControl.className = 'lv-task-control';
  taskControl.setAttribute('aria-label', '作業項目');
  const saveStatus = document.createElement('p'); saveStatus.className = 'lv-save-status';
  saveStatus.setAttribute('role', 'status'); saveStatus.setAttribute('aria-live', 'polite');
  const buttons = new Map<TaskId, HTMLButtonElement>();
  let props: NavigationProps | undefined, disposed = false, choicesFingerprint: string | undefined;
  let renderedSceneValue = '';
  const cleanups: (() => void)[] = [];
  const request = (intent: NavigationIntent) => {
    if (disposed || !props) return;
    const plan = planNavigation(props.scenes, props.session, props.pending, intent);
    // The native select must not visually commit an unaccepted/asynchronous plan.
    select.value = renderedSceneValue;
    if (plan.kind === 'blocked') reason.textContent = plan.reason;
    onPlan(plan);
  };
  const change = () => request({ kind: 'scene', sceneId: select.value });
  select.addEventListener('change', change); cleanups.push(() => select.removeEventListener('change', change));
  for (const [task, text] of Object.entries(taskLabels) as [TaskId, string][]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    // Native buttons support Tab/Enter/Space without pretending to be an ARIA tablist.
    button.setAttribute('aria-pressed', 'false');
    const click = () => request({ kind: 'task', task });
    button.addEventListener('click', click); cleanups.push(() => button.removeEventListener('click', click));
    buttons.set(task, button); taskControl.append(button);
  }
  function render(next: NavigationProps): void {
    if (disposed) return;
    props = next;
    const choices = sceneChoices(next.scenes);
    const current = choices.find(choice => choice.id === next.session.sceneId);
    const missingCurrent = next.session.sceneId !== null && !current;
    const unavailableCurrent = next.session.sceneId !== null && !current?.available;
    const hasAvailable = choices.some(choice => choice.available);
    const fingerprint = JSON.stringify({ choices, missingCurrent });
    if (fingerprint !== choicesFingerprint) {
      const prompt = document.createElement('option'); prompt.value = '';
      prompt.textContent = missingCurrent ? '現在のシーンを確認' : 'シーンを選択'; prompt.disabled = true;
      const options = choices.map(choice => {
        const option = document.createElement('option'); option.value = choice.id;
        option.textContent = choice.label; option.disabled = !choice.available; return option;
      });
      select.replaceChildren(prompt, ...options); choicesFingerprint = fingerprint;
    }
    renderedSceneValue = missingCurrent ? '' : next.session.sceneId ?? '';
    select.value = renderedSceneValue;
    select.disabled = next.pending !== null || !hasAvailable;
    const pendingReason = sceneSwitchReason(next.pending);
    reason.textContent = unavailableCurrent
      ? '現在のシーンを表示できません。' + (pendingReason || (hasAvailable
        ? '状態を確認するか、別のシーンを選択してください。' : '状態を確認してください。'))
      : pendingReason || (!hasAvailable ? '選択できるシーンがありません。状態を確認してください。' : '');
    for (const [task, button] of buttons) button.setAttribute('aria-pressed', String(task === next.session.task));
    saveStatus.textContent = saveLabels[next.save.kind] +
      ('message' in next.save && next.save.message ? `：${next.save.message}` : '');
    saveStatus.dataset.state = next.save.kind;
  }
  function dispose(): void {
    disposed = true; props = undefined; for (const cleanup of cleanups) cleanup();
    sceneControl.remove(); taskControl.remove(); saveStatus.remove();
  }
  return { sceneControl, taskControl, saveStatus, render, dispose };
}
