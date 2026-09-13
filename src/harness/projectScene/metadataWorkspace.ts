import type { openMetadataHost } from './metadataHost';
import { SyntheticSession } from './session';
import { createDevelopmentWorkspace } from './workspace';
import type { ViewportFactory } from './viewportHost';
import { createMetadataReceiveControls } from './metadataReceiveControls';
import { createMetadataStartupControls } from './metadataStartupControls';
import { chooseStartupScene, resolveScene } from '../../scene/resolve';
import type { SavedWorkspaceHost, SavedWorkspaceTools } from './savedHost';

/** Same served metadata workspace, split from browser I/O to verify cold-start recovery. */
export function createMetadataWorkspace(document: Document, host: Awaited<ReturnType<typeof openMetadataHost>>, viewportFactory?: ViewportFactory) {
  return createSavedWorkspace(document, host, viewportFactory, (session, changed) => createMetadataReceiveControls(document, host, session, changed));
}
/** Same editor/recovery controls, with optional host-owned tools; no synthetic demo in real-file mode. */
export function createSavedWorkspace(document: Document, host: SavedWorkspaceHost, viewportFactory?: ViewportFactory,
  extraTools?: (session: SyntheticSession, changed: () => void) => SavedWorkspaceTools, initialTools?: SavedWorkspaceTools) {
  let disposed = false, refreshing = false, feedback = '', workspace: ReturnType<typeof createDevelopmentWorkspace> | undefined;
  let receiveControls: SavedWorkspaceTools | undefined = initialTools;
  const root = document.createElement('section'), tools = document.createElement('section');
  const check = document.createElement('button'), restore = document.createElement('button'), status = document.createElement('p');
  check.type = restore.type = 'button'; check.textContent = '再開用データを確認'; restore.textContent = '更新を再試行';
  status.setAttribute('role', 'status'); tools.append(check, restore, status); root.append(tools);
  const modeButton = document.createElement('button'), modeStatus = document.createElement('p');
  modeButton.type = 'button'; modeStatus.setAttribute('role', 'status');
  if (host.mode) { tools.insertBefore(modeButton, check); tools.insertBefore(modeStatus, check); }
  const startup = createMetadataStartupControls(document, host, () => workspace?.session, () => { feedback = ''; render(); },
    () => refreshing || !!receiveControls?.hasChanges());
  tools.append(startup.root);
  if (receiveControls) tools.append(receiveControls.root);
  const render = () => {
    if (disposed) return;
    const provider = host.read().provider;
    if (!workspace && provider?.kind === 'scene-provider' && chooseStartupScene(provider.state).sceneId && !startup.busy()) {
      workspace = createDevelopmentWorkspace(document, new SyntheticSession(host.authority,
        () => !!receiveControls?.hasChanges() || startup.hasChanges()), {
        viewportFactory, onAction: () => { receiveControls?.render(); startup.render(); } });
      receiveControls ??= extraTools?.(workspace.session, () => render());
      if (receiveControls) tools.append(receiveControls.root); root.append(workspace.root);
    }
    check.disabled = restore.disabled = refreshing || startup.busy() || workspace?.session.acknowledgment.state === 'checking';
    restore.hidden = !!workspace || host.authority.readOnly || !host.hasPending() && !startup.recoveryPending();
    status.textContent = feedback || (!workspace ? host.hasPending() ?
      host.authority.readOnly ? '更新が未完了です。編集用タブで復旧してください。' : '更新が未完了です。元の変更から再試行できます。' :
      '開始シーンを確認してください。シーンと記録は保持しています。' : '');
    workspace?.render(); receiveControls?.render(); startup.render();
    if (host.mode) {
      modeButton.textContent = host.mode.current === 'view' ? '編集を開始する' : '閲覧に切り替える';
      modeButton.disabled = refreshing || host.mode.busy || startup.busy();
      modeStatus.textContent = host.mode.busy ? '切替を確認しています。' : host.mode.current === 'view' ?
        `閲覧中。${host.mode.detail}` : host.hasPending() ? '更新の復旧が必要です。' : '編集中';
    }
    if (workspace) workspace.root.inert = refreshing || !!host.mode?.busy || !!receiveControls?.busy?.();
  };
  const refresh = async (retry: boolean) => {
    if (disposed || refreshing || startup.busy()) return;
    if (receiveControls?.hasChanges() || !retry && startup.hasChanges() || workspace && !workspace.session.readOnly &&
      (workspace.session.pending || workspace.session.workingBlock && !retry)) {
      feedback = '入力・更新を確定するか、取り消してから確認してください。'; render(); return;
    }
    feedback = '';
    if (retry && startup.recoveryPending()) { startup.retry(); render(); return; }
    refreshing = true; render();
    try {
      if (retry) await host.authority.retry!(); else await host.refresh();
      if (disposed) return;
      if (workspace && host.read().provider) workspace.session.refreshHistory();
      feedback = host.read().state === 'ready' ? '再開用データを確認しました。' : '未完了の更新があります。';
    } catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : '再開用データを確認できません。データは保持しています。'; }
    finally { refreshing = false; render(); }
  };
  check.addEventListener('click', () => { void refresh(false); });
  restore.addEventListener('click', () => { if (!restore.disabled && !restore.hidden) void refresh(true); });
  modeButton.addEventListener('click', () => { void (async () => {
    if (disposed || refreshing || !host.mode || host.mode.busy || startup.busy()) return;
    const viewRecovery = host.mode.current === 'view' && host.read().state === 'pending';
    if (startup.hasChanges() || receiveControls?.hasChanges() || workspace?.session.interactionPending ||
      workspace && workspace.session.acknowledgment.state !== 'idle' || host.hasPending() && !viewRecovery) {
      feedback = '入力・更新を確定するか、取り消してから切り替えてください。'; render(); return;
    }
    refreshing = true; feedback = ''; render();
    try {
      const action = host.mode.change(host.mode.current === 'view' ? 'edit' : 'view', host.read().source?.token, next => {
        if (disposed) throw Error('画面を閉じました。');
        if (workspace && resolveScene(next.state, next.resources, workspace.session.sceneId).kind !== 'ready')
          throw Error('表示中のシーンを確認できません。元の表示を保持しています。');
        workspace?.session.refreshHistory();
      });
      render(); await action;
    } catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : '切り替えられません。元の表示を保持しています。'; }
    finally { refreshing = false; render(); }
  })(); });
  const dispose = async () => {
    if (disposed) return; disposed = true;
    startup.dispose(); receiveControls?.dispose(); workspace?.dispose(); root.remove(); await host.dispose();
  };
  render();
  return { root, render, get session() { return workspace?.session; },
    inputPending: () => refreshing || startup.hasChanges() || !!workspace?.session.interactionPending,
    hasChanges: () => host.hasPending() || !!workspace?.session.pending || !!receiveControls?.hasChanges() || startup.hasChanges(), dispose };
}
