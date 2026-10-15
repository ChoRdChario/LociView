import { createProjectWorkspace } from '../../ui/projectScene/projectWorkspace';
import type { WorkspaceSurface, WorkspaceViewport, WorkspaceViewportState } from '../../ui/projectScene/projectWorkspacePorts';
import { syntheticDisplay, pointInProject, type SyntheticDisplay } from './viewportModel';
import type { ViewportFactory } from './viewportHost';
import type { createValidationModeHost } from './validationModeHost';
import type { createValidationReceiveControls } from './validationReceiveControls';
import { productSources } from './productSources';
import { readProjectCamera, readSolidBackground } from './viewHistory';
import { createModelCandidatePreview, modelCandidateDisplay, type ModelCandidateRenderer } from './modelCandidatePreview';

type Host = ReturnType<typeof createValidationModeHost>;
type Tools = ReturnType<typeof createValidationReceiveControls>;
/** Validation-only adapter. No synthetic Session or string-map writes enter product UI. */
export function createProductWorkspace(document: Document, host: Host, factory: ViewportFactory, tools?: Tools, renderCandidate?: ModelCandidateRenderer) {
  const root = document.createElement('section'), mode = document.createElement('button'), status = document.createElement('p');
  mode.type = 'button'; status.setAttribute('role', 'status');
  let disposed = false, switching = false, core: ReturnType<typeof createProjectWorkspace> | undefined;
  let viewportScene = '', refreshPreview: (() => void) | undefined;
  const read = () => { const p = host.read().provider; if (p?.kind !== 'scene-provider') throw Error('プロジェクトの内容を確認してください。'); return p; };
  const external = () => switching || !!tools?.hasChanges();
  const changed = () => {
    if (disposed) return;
    tools?.render(); mode.textContent = host.mode!.current === 'view' ? '編集を開始する' : '閲覧に切り替える';
    mode.disabled = switching || !!core?.inputPending() || !!tools?.hasChanges();
    if (core) core.root.inert = switching || !!tools?.busy();
  };
  core = createProjectWorkspace(document, {
    ...productSources(host),
    createModelPreview: renderCandidate ? () => {
      let token = '', sceneId = '';
      const preview = createModelCandidatePreview(document, renderCandidate, () => !disposed && token === read().token && sceneId === viewportScene);
      refreshPreview = preview.render;
      return { root: preview.root, render() { preview.render(); }, dispose() { refreshPreview = undefined; preview.dispose(); },
        show(current, scene, asset, operation, label) { if (current !== read().token || scene !== viewportScene) throw Error('モデルの更新候補を確認してください。'); token = current; sceneId = scene;
          preview.show(label, modelCandidateDisplay(read(), scene, asset, operation, host.limits)); } };
    } : undefined,
    read, get readOnly() { return !!host.authority.readOnly; }, status: () => host.authority.status!(),
    dispatch: (token, command) => host.dispatch(token, command), retry: async () => host.authority.retry!(),
    addMedia: async (token, input) => host.authority.addMediaFile!(token, input),
    addModel: async (token, input) => host.authority.addModelFile!(token, input),
    replaceModel: async (token, input) => host.authority.replaceModelFile!(token, input),
    transformModel: async (token, input) => host.authority.transformModel!(token, input),
    image: async record => new Blob([(await host.content.image(record, true)).slice().buffer], { type: 'image/png' }),
    imageScope: () => host.imageScope(),
    changed, otherPending: external,
    createViewport(canvas, update, propose, proposeModel): WorkspaceViewport {
      let state: WorkspaceViewportState | undefined, closed = false, rendered: SyntheticDisplay | undefined;
      const runtime = factory(canvas, update, (target, position) => {
        if (!state?.pin || state.readOnly || host.authority.readOnly || target.token !== read().token ||
          JSON.stringify(target) !== JSON.stringify(state.pin.target)) return false;
        return propose(target, position);
      }, (target, position, manipulation) => {
        if (!state?.model || state.readOnly || host.authority.readOnly || JSON.stringify(state.model.target) !== JSON.stringify(target) || target.token !== read().token) return false;
        return !!proposeModel?.({ target, mode: manipulation?.mode ?? state.model.mode,
          placement: { translation: position, rotationXYZW: manipulation?.rotationXYZW ?? state.model.placement.rotationXYZW,
            uniformScale: manipulation?.uniformScale ?? state.model.placement.uniformScale } });
      });
      const target = (assetId: string): WorkspaceSurface | null => {
        if (!state || state.readOnly || state.token !== read().token) return null;
        const snapshot = host.authority.read(), version = snapshot.modelVersions?.find(v => v.assetId === assetId);
        const display = runtime.read().display;
        if (state.hiddenAssetIds?.includes(assetId) || snapshot.state.token !== state.token || !version || version.families.length !== 1 || !display || display.token !== state.token || display.sceneId !== state.sceneId || display.readOnly || !display.models.some(m => m.binding.assetId === assetId && m.binding.id === version.projection.bindingId)) return null;
        const family = version.families[0]!;
        return { token: state.token, sceneId: state.sceneId, assetId, assetFrameId: version.projection.assetFrameId,
          bindingId: version.projection.bindingId, revisionId: version.projection.revisionId,
          representationId: version.closure.representation.id, familyId: family.id, compatibilityId: family.compatibilityId };
      };
      const observation = () => {
        const seen = runtime.read(); let receipt = '';
        try { if (seen.pickToken && runtime.capture) receipt = JSON.stringify([seen.pickToken, runtime.capture()]); } catch { /* No receipt, no pick. */ }
        const current = !!state?.available && rendered === seen.display && state.token === seen.display?.token && state.sceneId === seen.display.sceneId && state.token === read().token;
        const available = current && seen.ready && !seen.issue;
        const pinIds = new Set(available ? rendered!.pins.map(p => p.id) : []);
        return { token: seen.display?.token ?? '', sceneId: seen.display?.sceneId ?? '', pickToken: available ? receipt : '', ready: available,
          dragging: seen.dragging || !!seen.manipulating, pins: available ? seen.pins.filter(p => pinIds.has(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y)) : [], issue: seen.issue, notice: seen.notice ?? null,
          assetIds: available ? seen.display!.models.map(m => m.binding.assetId) : [],
          view: available && !seen.dragging && !seen.manipulating ? { kind: 'ready' as const, token: seen.token, sceneId: state!.sceneId, projectFrameId: read().resources.projectFrameId,
            projection: seen.projection, axis: seen.axis, bounds: { kind: 'value' as const, value: seen.display!.bounds ? 'available' as const : 'empty' as const } } :
            { kind: 'unavailable' as const, token: seen.token, sceneId: state?.sceneId ?? '', projectFrameId: read().resources.projectFrameId, reason: seen.issue ?? '3D表示を確認してください。' } };
      };
      return {
        update(next) {
          if (closed) return; state = next; viewportScene = next.sceneId; refreshPreview?.();
          const snapshot = host.authority.read();
          if (!next.available || snapshot.state.token !== next.token) { runtime.setPinPointerActive?.(false); runtime.setActive(false); return; }
          const modelEdit = next.model && next.model.target.token === next.token ? { target: next.model.target, position: next.model.placement.translation,
            enabled: !next.readOnly, manipulation: { mode: next.model.mode, rotationXYZW: next.model.placement.rotationXYZW, uniformScale: next.model.placement.uniformScale } } : undefined;
          let display = syntheticDisplay(snapshot, next.sceneId, next.pinColors, next.selectedId, modelEdit, next.hiddenAssetIds ?? []);
          if (next.pin) {
            const model = display.models.find(m => m.binding.assetId === next.pin!.target.assetId);
            if (model && next.pin.target.token === next.token) {
              const position = pointInProject(next.pin.position, model.binding.assetToProject);
              display = { ...display, preview: position, pinEdit: { target: next.pin.target, position, enabled: !next.readOnly } };
            }
          }
          rendered = next.readOnly ? { ...display, pinEdit: undefined } : display;
          runtime.update(rendered);
          runtime.setPinPointerActive?.(!!next.windowMoving || next.choosing && !next.readOnly); runtime.setActive(true);
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
        capture() { const payload = runtime.capture?.(); if (!payload) throw Error('現在の表示を記録できません。');
          return { camera: readProjectCamera(payload.camera) as unknown as import('../../domain/values').JsonObject, background: readSolidBackground(payload.background) }; },
        recall(payload) { if (!runtime.recall) throw Error('視点を呼び出せません。'); runtime.recall({ camera: readProjectCamera(payload.camera), background: readSolidBackground(payload.background) }); },
        viewCamera: intent => runtime.camera(intent),
        background(input, verify) { if (!runtime.setBackground) throw Error('背景を変更できません。'); runtime.setBackground(input, verify); },
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
