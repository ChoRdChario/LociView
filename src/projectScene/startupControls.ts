import type { SavedWorkspaceHost } from './hostPorts';
interface StartupInteraction {readonly pending:boolean;readonly workingBlock:unknown;refreshHistory():void;
  applyWorking(action:()=>unknown,confirmed:()=>void,failed:(error:unknown)=>void):boolean}
import { WorkingAcknowledgment } from './acknowledgment';
import { defaultSceneCandidates } from '../projectMetadata/startupScene';
import { sceneRestoreSource } from '../projectMetadata/sceneOrganization';
import { newId } from '../projectMetadata/persistence';
import { editOnly } from '../ui/projectScene/modePresentation';

/** Also usable BEFORE a Scene/session exists. No implicit navigation or direct storage writes. */
export function createMetadataStartupControls(document: Document, host: SavedWorkspaceHost,
  session: () => StartupInteraction | undefined, changed: () => void, otherInput: () => boolean) {
  const root = document.createElement('section'), heading = document.createElement('h2'), values = document.createElement('ul');
  const select = document.createElement('select'), apply = document.createElement('button'), cancel = document.createElement('button');
  const message = document.createElement('p'), note = document.createElement('p'), ack = new WorkingAcknowledgment();
  root.setAttribute('aria-label', '開始シーンの競合'); heading.textContent = '開始シーンを選択';
  select.setAttribute('aria-label', '残す開始シーン'); apply.type = cancel.type = 'button';
  apply.textContent = '開始シーンを確定'; cancel.textContent = '取り消す'; message.setAttribute('role', 'status');
  note.textContent = '次に開くシーンを選びます。シーンや記録は削除されません。';
  const conflictControls = document.createElement('section'); conflictControls.setAttribute('aria-label', '開始シーンの選択');
  conflictControls.append(values, select, apply); root.append(heading, note, conflictControls, cancel, message);
  const recovery = document.createElement('section'), recoverySelect = document.createElement('select'), restore = document.createElement('button');
  const recoveryNote = document.createElement('p'); recovery.setAttribute('aria-label', 'シーンの復旧'); recoverySelect.setAttribute('aria-label', '復旧するシーン');
  restore.type = 'button'; restore.textContent = 'このシーンを復旧して開く';
  recoveryNote.textContent = 'シーンを選んで開始シーンに戻します。削除済みの所属・視点・材質設定は戻しません。記録やモデルは再び追加できます。';
  recovery.append(recoveryNote, recoverySelect, restore); root.append(recovery);
  editOnly(select, apply, cancel, recoverySelect, restore);
  let token = '', ready = false, disposed = false, feedback = '';
  const hasChanges = () => !!select.value || !!recoverySelect.value || ack.state !== 'idle';
  const busy = () => ack.state === 'checking';
  const blocked = () => disposed || host.authority.readOnly || host.hasPending() || ack.state !== 'idle' ||
    !!session()?.pending || otherInput();
  const render = () => {
    if (disposed) return;
    const provider = host.read().provider;
    const field = provider?.kind === 'scene-provider' ? provider.inspection.candidates.fields.find(f =>
      f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'defaultSceneId') : undefined;
    const conflict = !!field && field.candidates.length > 1;
    const defaultId = provider?.kind === 'scene-provider' && provider.state.defaultSceneId.kind === 'value' ? provider.state.defaultSceneId.value : null;
    const defaultLifecycle = provider?.kind === 'scene-provider' && defaultId ? provider.state.scenes[defaultId]?.lifecycle : undefined;
    const needsRecovery = provider?.kind === 'scene-provider' && (!defaultLifecycle || defaultLifecycle.kind !== 'value' || defaultLifecycle.value.state !== 'active');
    root.hidden = !conflict && !needsRecovery && !hasChanges();
    conflictControls.hidden = !conflict && !select.value;
    heading.textContent = conflict ? '開始シーンを選択' : 'シーンを復旧';
    note.hidden = !conflict; cancel.hidden = !select.value && !recoverySelect.value && ack.state === 'idle';
    recovery.hidden = !needsRecovery && !recoverySelect.value;
    if (provider?.kind === 'scene-provider' && token !== provider.token && !hasChanges()) {
      token = provider.token; feedback = ''; ready = false; values.replaceChildren(); select.replaceChildren();
      const option = (value: string, label: string) => { const node = document.createElement('option'); node.value = value; node.textContent = label; select.append(node); };
      option('', '残す開始シーンを選択'); select.value = '';
      recoverySelect.replaceChildren(); const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'シーンを選択'; recoverySelect.append(empty); recoverySelect.value = '';
      if (needsRecovery) for (const id of Object.keys(provider.details.mutable.scenesById)) {
        const candidate = document.createElement('option'); candidate.value = id;
        const name = provider.state.scenes[id]?.name; candidate.textContent = name?.kind === 'value' ? name.value : '名称を確認';
        try { sceneRestoreSource(provider, id, host.limits); } catch { candidate.disabled = true; candidate.textContent += '（内容を確認）'; }
        recoverySelect.append(candidate);
      }
      if (conflict) {
        try { defaultSceneCandidates(provider, host.limits); ready = true; } catch { /* Show all, never accept a filtered subset. */ }
        field!.candidates.forEach((candidate, index) => {
          const id = candidate.value.kind === 'value' && typeof candidate.value.value === 'string' ? candidate.value.value : '';
          const scene = provider.state.scenes[id], name = scene?.name;
          const label = name?.kind === 'value' ? name.value : '名称・参照先を確認';
          const item = document.createElement('li'); item.textContent = `候補 ${index + 1}：${label}`; values.append(item);
          option(candidate.operationId, `候補 ${index + 1}：${label}`);
        });
      }
    }
    const stale = !!select.value && token !== host.read().source?.token;
    select.disabled = blocked(); apply.disabled = blocked() || !ready || stale || !select.value;
    recoverySelect.disabled = blocked(); restore.disabled = blocked() || !recoverySelect.value || token !== host.read().source?.token;
    cancel.disabled = disposed || host.hasPending() || ack.state !== 'idle' || !!session()?.workingBlock;
    message.textContent = feedback || (ack.block ?? (host.hasPending() ? '更新が未完了です。元の変更から再試行してください。' :
      stale ? '内容が更新されています。選択は保持しています。取り消して選び直してください。' :
      host.authority.readOnly ? '閲覧中です。「編集する」から内容を確定できます。' :
      needsRecovery ? '開始できるシーンがありません。記録は保持しています。復旧するシーンを選択してください。' :
      !ready && conflict ? '候補の状態を確認できないため解消できません。元の変更は保持しています。' :
      select.value ? 'この選択はまだ適用されていません。' : '開始シーンが競合しています。自動では選びません。'));
  };
  select.addEventListener('change', () => { feedback = ''; render(); changed(); });
  recoverySelect.addEventListener('change', () => { feedback = ''; render(); changed(); });
  cancel.addEventListener('click', () => {
    if (cancel.disabled || disposed) return;
    select.value = ''; recoverySelect.value = ''; token = ''; feedback = ''; render(); changed();
  });
  restore.addEventListener('click', () => {
    if (restore.disabled || blocked() || token !== host.read().source?.token) return;
    const provider = host.read().provider; if (provider?.kind !== 'scene-provider') return;
    let source: ReturnType<typeof sceneRestoreSource>;
    try { source = sceneRestoreSource(provider, recoverySelect.value, host.limits); } catch { feedback = 'シーンの内容を確認できません。元の記録は保持しています。'; render(); return; }
    const before = token, command = { kind: 'restoreScene' as const, sceneId: recoverySelect.value, observedOperationIds: source.operationIds, eventId: `evt_${newId()}` };
    const confirmed = () => { if (!disposed) { recoverySelect.value = ''; select.value = ''; token = ''; feedback = ''; session()?.refreshHistory(); render(); changed(); } };
    const failed = (error: unknown) => { if (!disposed) { feedback = error instanceof Error ? error.message : '復旧できません。選択は保持しています。'; render(); changed(); } };
    const current = session();
    if (current) current.applyWorking(() => host.resolve(before, command), confirmed, failed);
    else ack.run(() => host.resolve(before, command), confirmed, failed, () => host.hasPending() ? async () => { await host.authority.retry!(); } : host.read().source?.token !== before ? () => {} : undefined);
    render(); changed();
  });
  apply.addEventListener('click', () => {
    if (blocked() || !ready || token !== host.read().source?.token || !select.value) return;
    feedback = ''; const command = { kind: 'resolveDefaultScene' as const, operationId: select.value }, before = token;
    const confirmed = () => {
      if (disposed) return;
      select.value = ''; token = ''; feedback = ''; session()?.refreshHistory(); render(); changed();
    };
    const failed = (error: unknown) => { if (!disposed) { feedback = error instanceof Error ? error.message : '適用できません。選択は保持しています。'; render(); changed(); } };
    const current = session();
    if (current) current.applyWorking(() => host.resolve(before, command), confirmed, failed);
    else ack.run(() => host.resolve(before, command), confirmed, failed, () =>
      host.hasPending() ? async () => { await host.authority.retry!(); } :
      host.read().source?.token !== before ? () => {} : undefined);
    render(); changed();
  });
  const unsubscribe = ack.subscribe(() => { render(); changed(); });
  render();
  return { root, render, hasChanges, busy, recoveryPending: () => ack.state === 'failed',
    retry: () => { if (!disposed && !host.authority.readOnly) ack.retry(); },
    dispose() { disposed = true; unsubscribe(); } };
}
