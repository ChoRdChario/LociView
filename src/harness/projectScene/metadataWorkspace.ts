import type { openMetadataHost } from './metadataHost';
import { SyntheticSession } from './session';
import { createDevelopmentWorkspace } from './workspace';
import type { ViewportFactory } from './viewportHost';
import { createMetadataReceiveControls } from './metadataReceiveControls';
import { createMetadataStartupControls } from './metadataStartupControls';
import { chooseStartupScene } from '../../scene/resolve';
import type { SavedWorkspaceHost, SavedWorkspaceTools } from './savedHost';

/** Same served metadata workspace, split from browser I/O to verify cold-start recovery. */
export function createMetadataWorkspace(document: Document, host: Awaited<ReturnType<typeof openMetadataHost>>, viewportFactory?: ViewportFactory) {
  return createSavedWorkspace(document, host, viewportFactory, (session, changed) => createMetadataReceiveControls(document, host, session, changed));
}
/** Same editor/recovery controls, with optional host-owned tools; no synthetic demo in real-file mode. */
export function createSavedWorkspace(document: Document, host: SavedWorkspaceHost, viewportFactory?: ViewportFactory,
  extraTools?: (session: SyntheticSession, changed: () => void) => SavedWorkspaceTools) {
  let disposed = false, refreshing = false, feedback = '', workspace: ReturnType<typeof createDevelopmentWorkspace> | undefined;
  let receiveControls: SavedWorkspaceTools | undefined;
  const root = document.createElement('section'), tools = document.createElement('section');
  const check = document.createElement('button'), restore = document.createElement('button'), status = document.createElement('p');
  check.type = restore.type = 'button'; check.textContent = '保存状態を確認'; restore.textContent = '保存を再試行';
  status.setAttribute('role', 'status'); tools.append(check, restore, status); root.append(tools);
  const startup = createMetadataStartupControls(document, host, () => workspace?.session, () => { feedback = ''; render(); },
    () => refreshing || !!receiveControls?.hasChanges());
  tools.append(startup.root);
  const render = () => {
    if (disposed) return;
    const provider = host.read().provider;
    if (!workspace && provider?.kind === 'scene-provider' && chooseStartupScene(provider.state).sceneId && !startup.busy()) {
      workspace = createDevelopmentWorkspace(document, new SyntheticSession(host.authority,
        () => !!receiveControls?.hasChanges() || startup.hasChanges()), {
        viewportFactory, onAction: () => { receiveControls?.render(); startup.render(); } });
      receiveControls = extraTools?.(workspace.session, () => render());
      if (receiveControls) tools.append(receiveControls.root); root.append(workspace.root);
    }
    check.disabled = restore.disabled = refreshing || startup.busy() || workspace?.session.acknowledgment.state === 'checking';
    restore.hidden = !!workspace || host.authority.readOnly || !host.hasPending() && !startup.recoveryPending();
    status.textContent = feedback || (!workspace ? host.hasPending() ?
      host.authority.readOnly ? '保存が未完了です。編集用タブで復旧してください。' : '保存が未完了です。元の変更から再試行できます。' :
      '開始シーンを確認してください。保存済みのシーンと記録は保持しています。' : '');
    workspace?.render(); receiveControls?.render(); startup.render();
  };
  const refresh = async (retry: boolean) => {
    if (disposed || refreshing || startup.busy()) return;
    if (!retry && startup.hasChanges() || workspace && !workspace.session.readOnly &&
      (workspace.session.pending || workspace.session.workingBlock && !retry)) {
      feedback = '入力・保存を確定するか、取り消してから確認してください。'; render(); return;
    }
    feedback = '';
    if (retry && startup.recoveryPending()) { startup.retry(); render(); return; }
    refreshing = true; render();
    try {
      if (retry) await host.authority.retry!(); else await host.refresh();
      if (disposed) return;
      if (workspace && host.read().provider) workspace.session.refreshHistory();
      feedback = host.read().state === 'ready' ? '保存した内容を確認しました。' : '未完了の保存があります。';
    } catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : '保存を確認できません。データは保持しています。'; }
    finally { refreshing = false; render(); }
  };
  check.addEventListener('click', () => { void refresh(false); });
  restore.addEventListener('click', () => { if (!restore.disabled && !restore.hidden) void refresh(true); });
  const dispose = async () => {
    if (disposed) return; disposed = true;
    startup.dispose(); receiveControls?.dispose(); workspace?.dispose(); root.remove(); await host.dispose();
  };
  render();
  return { root, render, get session() { return workspace?.session; },
    hasChanges: () => host.hasPending() || !!workspace?.session.pending || !!receiveControls?.hasChanges() || startup.hasChanges(), dispose };
}
