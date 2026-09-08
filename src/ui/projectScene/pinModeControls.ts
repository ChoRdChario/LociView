import { pinActionIssue, pinSourceIssue, pinTargetName, planPinMode,
  type PinMode, type PinProposal, type PinModeContext, type PinModeIntent, type PinModePlan } from './pinModeState';

/** Mount actions beside Caption editing and modeStrip beside the stage, not inside a disposable tab. */
export function createPinModeControls(document: Document, onPlan: (plan: PinModePlan) => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string) => { const node = make('button', text); node.type = 'button'; return node; };
  const actions = make('section'); actions.className = 'lv-pin-actions'; actions.setAttribute('aria-label', 'ピンの追加・移動');
  const label = make('label', '追加先モデル'), target = make('select'); target.setAttribute('aria-label', '追加先モデル'); label.append(target);
  const add = button('ピンを追加'), move = button('ピンを移動'), addNote = make('p'), moveNote = make('p'), impact = make('p');
  const moveTarget = make('p'); actions.append(label, add, move, addNote, moveNote, impact, moveTarget);
  const modeStrip = make('section'); modeStrip.className = 'lv-pin-mode'; modeStrip.setAttribute('aria-label', 'ピンの操作');
  const heading = make('p'), status = make('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const finish = button('位置を確定'), cancel = button('取り消す');
  const confirmation = make('div'), confirm = button('操作を取り消す'), keep = button('操作を続ける');
  confirmation.append(make('p', '指定中の位置を取り消しますか？'), confirm, keep); confirmation.hidden = true;
  modeStrip.append(heading, status, finish, cancel, confirmation);
  let context: PinModeContext | undefined, disposed = false, fingerprint = '';
  let cancelFor: { mode: PinMode; proposal: PinProposal | null } | null = null;
  const cleanups: (() => void)[] = [];
  const listen = (node: HTMLElement, event: string, action: () => void) => { node.addEventListener(event, action); cleanups.push(() => node.removeEventListener(event, action)); };
  const request = (intent: PinModeIntent) => {
    if (!context || disposed) return;
    const plan = planPinMode(context, intent); target.value = context.memory.addTargetId ?? '';
    if (plan.kind === 'blocked') status.textContent = plan.reason; else onPlan(plan);
  };
  listen(target, 'change', () => request({ kind: 'target', assetId: target.value || null }));
  listen(add, 'click', () => { if (!add.disabled) request({ kind: 'add' }); });
  listen(move, 'click', () => { if (!move.disabled) request({ kind: 'move' }); });
  listen(finish, 'click', () => { if (!finish.disabled) request({ kind: 'finish' }); });
  listen(cancel, 'click', () => {
    if (!context?.memory.mode || cancel.disabled) return;
    cancelFor = { mode: context.memory.mode, proposal: context.proposal }; confirmation.hidden = false; confirm.focus({ preventScroll: true });
  });
  listen(keep, 'click', () => { cancelFor = null; confirmation.hidden = true; cancel.focus({ preventScroll: true }); });
  listen(confirm, 'click', () => { if (cancelFor) request({ kind: 'cancel', confirmedMode: cancelFor.mode, confirmedProposal: cancelFor.proposal }); });
  function render(next: PinModeContext): boolean {
    if (disposed) return false;
    if (context?.memory.mode && context.source.sceneId !== next.source.sceneId) {
      status.textContent = 'ピンの操作を確定するか、取り消してください。'; return false;
    }
    context = next;
    const mode = next.memory.mode, busy = next.feedback.kind === 'applying';
    if (cancelFor?.mode !== mode || cancelFor?.proposal !== next.proposal || busy) { cancelFor = null; confirmation.hidden = true; }
    const options = next.source.kind === 'ready' && !pinSourceIssue(next)
      ? next.source.models.map(item => ({ id: item.assetId, label: pinTargetName(item.name) })) : [];
    if (next.memory.addTargetId && !options.some(item => item.id === next.memory.addTargetId))
      options.unshift({ id: next.memory.addTargetId, label: '選択したモデル（状態を確認）' });
    const key = JSON.stringify(options);
    if (key !== fingerprint) {
      const empty = make('option', '追加先モデルを選択'); empty.value = '';
      target.replaceChildren(empty);
      for (const item of options) { const option = make('option', item.label); option.value = item.id; target.append(option); }
      fingerprint = key;
    }
    target.value = next.memory.addTargetId ?? ''; target.disabled = Boolean(mode) || busy || Boolean(pinSourceIssue(next));
    const addIssue = pinActionIssue(next, 'add'), moveIssue = pinActionIssue(next, 'move');
    add.disabled = addIssue !== null; move.disabled = moveIssue !== null;
    addNote.textContent = mode ? '' : addIssue ?? ''; addNote.hidden = !addNote.textContent;
    moveNote.textContent = mode ? '' : moveIssue ?? ''; moveNote.hidden = !moveNote.textContent;
    const caption = mode?.caption ?? (next.source.kind === 'ready' ? next.source.selected : null);
    const ownerId = caption?.assetId.kind === 'value' ? caption.assetId.value : null;
    const owner = ownerId && next.source.kind === 'ready' ? next.source.models.find(item => item.assetId === ownerId) : undefined;
    moveTarget.textContent = caption ? `移動：${pinTargetName(caption.title)} — ${owner ? pinTargetName(owner.name) : 'モデルを確認'}` : '';
    moveTarget.hidden = !moveTarget.textContent || Boolean(mode);
    impact.textContent = caption?.sceneCount.kind === 'value' && caption.sceneCount.value > 1
      ? `${caption.sceneCount.value}シーンで共有されています。ピンの移動はすべてに反映されます。` : '';
    impact.hidden = !impact.textContent;
    modeStrip.hidden = !mode;
    heading.textContent = !mode ? '' : `${mode.kind === 'add' ? 'ピンを追加中' : 'ピンを移動中'}：` +
      (mode.caption ? `${pinTargetName(mode.caption.title)} — ` : '') + pinTargetName(mode.target.name);
    const finishIssue = pinActionIssue(next, 'finish'); finish.disabled = finishIssue !== null;
    status.textContent = [next.feedback.kind === 'failed' && `適用できませんでした。${next.feedback.message} 指定中の位置は保持しています。`,
      mode && finishIssue].filter(Boolean).join(' ');
    cancel.disabled = !mode || busy;
    return true;
  }
  return { actions, modeStrip, render, dispose: () => { disposed = true; cleanups.forEach(cleanup => cleanup()); actions.remove(); modeStrip.remove(); } };
}
