import type { SavedWorkspaceHost } from './hostPorts';
interface StartupInteraction {readonly pending:boolean;readonly workingBlock:unknown;refreshHistory():void;
  applyWorking(action:()=>unknown,confirmed:()=>void,failed:(error:unknown)=>void):boolean}
import { WorkingAcknowledgment } from './acknowledgment';
import { defaultSceneCandidates } from '../projectMetadata/startupScene';

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
  root.append(heading, note, values, select, apply, cancel, message);
  let token = '', ready = false, disposed = false, feedback = '';
  const hasChanges = () => !!select.value || ack.state !== 'idle';
  const busy = () => ack.state === 'checking';
  const blocked = () => disposed || host.authority.readOnly || host.hasPending() || ack.state !== 'idle' ||
    !!session()?.pending || otherInput();
  const render = () => {
    if (disposed) return;
    const provider = host.read().provider;
    const field = provider?.kind === 'scene-provider' ? provider.inspection.candidates.fields.find(f =>
      f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'defaultSceneId') : undefined;
    const conflict = !!field && field.candidates.length > 1;
    root.hidden = !conflict && !hasChanges();
    if (provider?.kind === 'scene-provider' && token !== provider.token && !hasChanges()) {
      token = provider.token; feedback = ''; ready = false; values.replaceChildren(); select.replaceChildren();
      const option = (value: string, label: string) => { const node = document.createElement('option'); node.value = value; node.textContent = label; select.append(node); };
      option('', '残す開始シーンを選択'); select.value = '';
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
    cancel.disabled = disposed || host.hasPending() || ack.state !== 'idle' || !!session()?.workingBlock;
    message.textContent = feedback || (ack.block ?? (host.hasPending() ? '更新が未完了です。元の変更から再試行してください。' :
      stale ? '内容が更新されています。選択は保持しています。取り消して選び直してください。' :
      !ready && conflict ? '候補の状態を確認できないため解消できません。元の変更は保持しています。' :
      host.authority.readOnly ? 'このタブは閲覧専用です。編集用タブで確定し、再開用データを確認してください。' :
      select.value ? 'この選択はまだ適用されていません。' : '開始シーンが競合しています。自動では選びません。'));
  };
  select.addEventListener('change', () => { feedback = ''; render(); changed(); });
  cancel.addEventListener('click', () => {
    if (cancel.disabled || disposed) return;
    select.value = ''; token = ''; feedback = ''; render(); changed();
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
