import { createProjectWorkspace } from '../../ui/projectScene/projectWorkspace';
import type { WorkspaceSurface, WorkspaceViewport, WorkspaceViewportState } from '../../ui/projectScene/projectWorkspacePorts';
import { syntheticDisplay, pointInProject } from './viewportModel';
import type { ViewportFactory } from './viewportHost';
import type { createValidationModeHost } from './validationModeHost';
import type { createValidationReceiveControls } from './validationReceiveControls';

type Host = ReturnType<typeof createValidationModeHost>;
type Tools = ReturnType<typeof createValidationReceiveControls>;
/** Validation-only adapter. No synthetic Session or string-map writes enter product UI. */
export function createProductWorkspace(document: Document, host: Host, factory: ViewportFactory, tools?: Tools) {
  const root = document.createElement('section'), mode = document.createElement('button'), status = document.createElement('p');
  mode.type = 'button'; status.setAttribute('role', 'status');
  let disposed = false, switching = false, core: ReturnType<typeof createProjectWorkspace> | undefined;
  const read = () => { const p = host.read().provider; if (p?.kind !== 'scene-provider') throw Error('プロジェクトの内容を確認してください。'); return p; };
  const external = () => switching || !!tools?.hasChanges();
  const changed = () => {
    if (disposed) return;
    tools?.render(); mode.textContent = host.mode!.current === 'view' ? '編集を開始する' : '閲覧に切り替える';
    mode.disabled = switching || !!core?.inputPending() || !!tools?.hasChanges();
    if (core) core.root.inert = switching || !!tools?.busy();
  };
  core = createProjectWorkspace(document, {
    read, get readOnly() { return !!host.authority.readOnly; }, status: () => host.authority.status!(),
    dispatch: (token, command) => host.dispatch(token, command), retry: async () => host.authority.retry!(),
    addMedia: async (token, input) => host.authority.addMediaFile!(token, input),
    image: async record => new Blob([(await host.content.image(record, true)).slice().buffer], { type: 'image/png' }),
    changed, otherPending: external,
    createViewport(canvas, update, propose): WorkspaceViewport {
      let state: WorkspaceViewportState | undefined, closed = false;
      const runtime = factory(canvas, update, (target, position) => {
        if (!state?.pin || state.readOnly || host.authority.readOnly || target.token !== read().token ||
          JSON.stringify(target) !== JSON.stringify(state.pin.target)) return false;
        return propose(target, position);
      });
      const target = (assetId: string): WorkspaceSurface | null => {
        if (!state || state.readOnly || state.token !== read().token) return null;
        const snapshot = host.authority.read(), version = snapshot.modelVersions?.find(v => v.assetId === assetId);
        const display = runtime.read().display;
        if (snapshot.state.token !== state.token || !version || version.families.length !== 1 || !display || display.token !== state.token || display.sceneId !== state.sceneId || display.readOnly || !display.models.some(m => m.binding.assetId === assetId && m.binding.id === version.projection.bindingId)) return null;
        const family = version.families[0]!;
        return { token: state.token, sceneId: state.sceneId, assetId, assetFrameId: version.projection.assetFrameId,
          bindingId: version.projection.bindingId, revisionId: version.projection.revisionId,
          representationId: version.closure.representation.id, familyId: family.id, compatibilityId: family.compatibilityId };
      };
      const observation = () => {
        const seen = runtime.read(); let receipt = '';
        try { if (seen.pickToken && runtime.capture) receipt = JSON.stringify([seen.pickToken, runtime.capture()]); } catch { /* No receipt, no pick. */ }
        const current = !!state?.available && state.token === seen.display?.token && state.sceneId === seen.display.sceneId && state.token === read().token;
        return { token: seen.display?.token ?? '', pickToken: current ? receipt : '', ready: current && seen.ready,
          dragging: seen.dragging || !!seen.manipulating, pins: current ? seen.pins : [], issue: seen.issue, notice: seen.notice ?? null };
      };
      return {
        update(next) {
          if (closed) return; state = next;
          const snapshot = host.authority.read();
          if (!next.available || snapshot.state.token !== next.token) { runtime.setPinPointerActive?.(false); runtime.setActive(false); return; }
          let display = syntheticDisplay(snapshot, next.sceneId, next.pinColors, next.selectedId);
          if (next.pin) {
            const model = display.models.find(m => m.binding.assetId === next.pin!.target.assetId);
            if (model && next.pin.target.token === next.token) {
              const position = pointInProject(next.pin.position, model.binding.assetToProject);
              display = { ...display, preview: position, pinEdit: { target: next.pin.target, position, enabled: !next.readOnly } };
            }
          }
          runtime.update(next.readOnly ? { ...display, pinEdit: undefined } : display);
          runtime.setPinPointerActive?.(next.choosing && !next.readOnly); runtime.setActive(true);
        },
        read: observation, target,
        pick(x, y, assetId) {
          if (closed || !state || state.readOnly || host.authority.readOnly || !state.choosing) return null;
          const before = observation();
          if (!before.ready || before.dragging || !before.pickToken || before.token !== read().token) return null;
          const display = runtime.read().display;
          if (!display || display.readOnly) return null;
          const targets = display.models.flatMap(m => {
            const t = target(m.binding.assetId); return t && (!assetId || t.assetId === assetId) ? [t] : [];
          });
          const hit = runtime.pickCreation?.(targets, x, y), after = observation();
          return hit && before.pickToken === after.pickToken && before.token === after.token && read().token === before.token ? hit : null;
        },
        camera(action) { runtime.camera(action === 'fit' ? { kind: 'fit' } : { kind: 'axis', axis: ({ front: '+z', back: '-z', left: '-x', right: '+x', top: '+y', bottom: '-y' } as const)[action] }); },
        retry() { if (!closed) runtime.retry(); },
        dispose() { if (!closed) { closed = true; runtime.setActive(false); runtime.dispose(); } },
      };
    },
  });
  mode.addEventListener('click', () => { void (async () => {
    if (disposed || mode.disabled || core!.inputPending() || tools?.hasChanges()) return;
    const recovery = host.mode!.current === 'view' && (host.read().state === 'pending' || host.mode!.recoveryAvailable);
    if (host.hasPending() && !recovery) { status.textContent = '更新を再試行してから切り替えてください。'; return; }
    switching = true; changed();
    try { await host.mode!.change(host.mode!.current === 'view' ? 'edit' : 'view', read().token, () => core!.render()); }
    catch (error) { if (!disposed) status.textContent = (error as Error).message; }
    finally { switching = false; if (!disposed) { core!.render(); changed(); } }
  })(); });
  root.append(mode, status); if (tools) root.append(tools.root); root.append(core.root);
  const unmount = () => { if (!disposed) { disposed = true; core!.unmount(); root.remove(); } };
  changed();
  return { root, session: core.session, render() { if (!disposed) { core!.render(); changed(); } },
    inputPending: () => switching || core!.inputPending(), hasChanges: () => host.hasPending() || core!.hasChanges() || !!tools?.hasChanges(), unmount,
    async dispose() { unmount(); tools?.dispose(); await host.dispose(); } };
}
