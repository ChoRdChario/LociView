import { displayBlobRef } from '../domain/portableMedia';
import { createProjectWorkspace } from '../ui/projectScene/projectWorkspace';
import type { WorkspaceSurface, WorkspaceViewport, WorkspaceViewportState } from '../ui/projectScene/projectWorkspacePorts';
import { projectDisplay, pointInProject, type EditableDisplay } from './viewportModel';
import type { ViewportFactory,ProjectViewport } from './viewportPorts';
import type { createValidationModeHost } from './validationModeHost';
import type { createValidationReceiveControls } from './validationReceiveControls';
import { productSources } from './productSources';
import { readProjectCamera, readSolidBackground } from './viewDisplay';
import { createModelCandidatePreview, modelCandidateDisplay, type ModelCandidateRenderer } from './modelCandidatePreview';
import { createMetadataStartupControls } from './startupControls';
import { chooseStartupScene } from '../scene/resolve';

type Host = ReturnType<typeof createValidationModeHost>;
type Tools = ReturnType<typeof createValidationReceiveControls>;
/** Validation-only adapter. No synthetic Session or string-map writes enter product UI. */
export function createProductWorkspace(document: Document, host: Host, factory: ViewportFactory, tools?: Tools, renderCandidate?: ModelCandidateRenderer,
  navigation?: { utilitiesRoot?:HTMLElement;compactFiles?:boolean;smoothDisplay?:boolean;presentation?():{busy:boolean;reason:string}|null;projectNavigationBlocked?():boolean;openProject(): void; resumedLastProject(): boolean; changed(): void; storageEstimate?(): Promise<Readonly<{ usage?: number; quota?: number }>>;localSettings?:{read():string;save(displayName:string):boolean} }) {
  const root = document.createElement('section'), mode = document.createElement('button'), status = document.createElement('p');
  root.className = 'lv-project-shell';
  const utilitiesParent=navigation?.utilitiesRoot?.parentElement;
  mode.type = 'button'; status.setAttribute('role', 'status');
  const fileMenu=tools&&navigation?.compactFiles?document.createElement('details'):undefined;
  const fileClose = document.createElement('button'), fileNotice = document.createElement('p');
  let fileSummary: HTMLElement | undefined;
  const filePanel = document.createElement('section'); filePanel.className = 'lv-file-sheet'; filePanel.setAttribute('aria-label', 'ファイル操作');
  const fileHeader = document.createElement('div'); fileHeader.className='lv-file-sheet-header';fileHeader.append(fileClose);
  const fileContent = document.createElement('div'); fileContent.setAttribute('role', 'tabpanel'); fileContent.id = `lv-file-content-${crypto.randomUUID()}`;
  const fileCloseNote=document.createElement('p');fileCloseNote.textContent='入力・確認を完了するか、取り消してください。';
  fileClose.type = 'button'; fileClose.textContent = '閉じる'; fileNotice.setAttribute('role', 'status');
  if(fileMenu){fileMenu.className='lv-project-files';const summary=document.createElement('summary');fileSummary=summary;summary.textContent='ファイル';
    fileContent.append(tools!.root); filePanel.append(fileHeader,fileCloseNote,fileContent); fileMenu.append(summary,filePanel);
    summary.addEventListener('click', event => { if(fileMenu.open && tools!.hasChanges()) event.preventDefault();
      else if(!fileMenu.open) { fileOrigin=summary;core?.dismissDisclosures(); } });
  }
  let fileOrigin: HTMLElement | undefined;
  const positionFiles = () => {
    const rect=fileSummary?.getBoundingClientRect?.(), win=document.defaultView;
    if(!rect||!win)return;
    const top=Math.min(rect.bottom+8,Math.max(12,win.innerHeight-180));
    filePanel.style.top=`${top}px`;filePanel.style.maxHeight=`${Math.max(120,win.innerHeight-top-12)}px`;
  };
  document.defaultView?.addEventListener('resize',positionFiles);
  const closeFiles = () => { if (!fileMenu || tools!.hasChanges()) return; fileMenu.open = false;
    (fileOrigin?.getClientRects?.().length && !(fileOrigin as HTMLButtonElement).disabled ? fileOrigin : fileSummary)?.focus?.({preventScroll:true}); };
  fileClose.addEventListener('click', closeFiles);
  filePanel.addEventListener('keydown', event => { if(event.key==='Escape' && !event.isComposing && !event.defaultPrevented){event.preventDefault();event.stopPropagation();closeFiles();} });
  const fileEntry = (label:string,surface:'save'|'share'|'receive'|'restore') => {
    const b=document.createElement('button'); b.type='button'; b.textContent=label; b.setAttribute('data-lv-edit-only','');
    b.addEventListener('click',()=>{if(!fileMenu||b.disabled)return;if(!fileMenu.open)fileOrigin=b;
      if(tools!.showSurface(surface)){core?.dismissDisclosures();fileMenu.open=true;if(b.getAttribute('role')!=='tab')filePanel.focus?.({preventScroll:true});}}); return b;
  };
  const saveEntry=fileEntry('ファイルに保存','save'), shareEntry=fileEntry('共有','share'), receiveEntry=fileEntry('受信','receive'), restoreEntry=fileEntry('復元','restore');
  saveEntry.className='lv-workspace-primary'; shareEntry.className='lv-workspace-share';
  filePanel.tabIndex=-1;
  const fileNavigation=document.createElement('div'); fileNavigation.setAttribute('role','tablist'); fileNavigation.setAttribute('aria-label','ファイルの操作');
  const fileTabs = new Map([['save',fileEntry('保存','save')],['share',fileEntry('共有','share')],['receive',receiveEntry],['restore',restoreEntry]] as const);
  for (const [surface, tab] of fileTabs) {
    tab.setAttribute('role','tab'); tab.id=`${fileContent.id}-${surface}`; tab.setAttribute('aria-controls',fileContent.id); fileNavigation.append(tab);
    tab.addEventListener('keydown', event => {
      if (tab.disabled || event.isComposing || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const tabs=[...fileTabs.values()].filter(item=>!item.hidden&&!item.disabled),at=tabs.indexOf(tab);
      if(at<0)return; event.preventDefault(); const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowLeft'?tabs.length-1:1))%tabs.length;
      tabs[next]!.focus(); tabs[next]!.click();
    });
  }
  filePanel.insertBefore(fileNavigation,fileCloseNote);
  let initialFiles = true;
  let disposed = false, switching = false, core: ReturnType<typeof createProjectWorkspace> | undefined;
  let previewOpen=false,mainRuntime:ProjectViewport|undefined;
  let viewportScene = '', refreshPreview: (() => void) | undefined, modeFeedback = '';
  let startup: ReturnType<typeof createMetadataStartupControls> | undefined;
  const read = () => { const p = host.read().provider; if (p?.kind !== 'scene-provider') throw Error('プロジェクトの内容を確認してください。'); return p; };
  const external = () => switching || !!tools?.hasChanges();
  const changed = () => {
    if (disposed) return;
    root.setAttribute('data-lv-mode', host.mode!.current);
    root.dataset.layout = fileMenu && core && !startup ? 'workspace' : 'flow';
    const needsFiles = !!host.workspaceOutput.error||!!host.workspaceFiles.error||!!host.workspaceFiles.reviewCopyError||host.backupRestore.pending||host.backupRestore.needsDisplay||!!host.backupRestore.error||
      host.workspaceOutput.jobs.some(job=>['unstarted','incomplete','repair-required'].includes(job.state))||
      [...host.workspaceFiles.jobs,...host.workspaceFiles.reviewCopies].some(job=>['incomplete','input-required','unbound-input','stale','repair-required'].includes(job.state));
    if(initialFiles && fileMenu) {
      initialFiles=false;
      const restore=host.backupRestore.pending||host.backupRestore.needsDisplay||!!host.backupRestore.error;
      const receive=host.workspaceFiles.initialImport||!!host.workspaceFiles.error||!!host.workspaceFiles.reviewCopyError||[...host.workspaceFiles.jobs,...host.workspaceFiles.reviewCopies].some(job=>['incomplete','input-required','unbound-input','stale','repair-required'].includes(job.state));
      if(!tools!.showSurface(host.mode!.current==='view'?'save':restore?'restore':receive?'receive':'save'))initialFiles=true;
      if(needsFiles||host.hasPending())fileMenu.open=true;
    }
    if(fileMenu && host.mode!.current==='view' && tools!.currentSurface()!=='save' && !tools!.hasChanges())tools!.showSurface('save');
    fileNotice.textContent=needsFiles?['未完了のファイル操作があります。',host.mode!.current==='view'?'編集を開始して「ファイル」から再開してください。':'「ファイル」から再開できます。',host.workspaceOutput.error,host.workspaceFiles.error,host.workspaceFiles.reviewCopyError,host.backupRestore.error].filter(Boolean).join(' '):''; fileNotice.hidden=!needsFiles;
    fileClose.disabled=!!tools?.hasChanges();
    fileCloseNote.textContent=tools?.closeReason() ?? ''; fileCloseNote.hidden=!fileCloseNote.textContent;
    restoreEntry.hidden=!host.backupRestore.enabled;
    const selectedSurface=tools?.currentSurface(); fileNavigation.hidden=host.mode!.current==='view';
    for(const b of [saveEntry,shareEntry,...fileTabs.values()])b.disabled=switching||!!navigation?.presentation?.()||!!core?.inputPending()||!!tools?.hasChanges()||!!startup?.hasChanges();
    for(const [surface,tab] of fileTabs){tab.setAttribute('aria-selected',String(surface===selectedSurface));tab.tabIndex=surface===selectedSurface?0:-1;if(surface===selectedSurface)fileContent.setAttribute('aria-labelledby',tab.id);}
    if(host.mode!.current==='view'){fileContent.removeAttribute('aria-labelledby');fileContent.setAttribute('aria-label','作成したファイル');}else fileContent.removeAttribute('aria-label');
    tools?.render(); mode.textContent = switching ? '切替中…' : host.mode!.current === 'view' ? '編集する' : '閲覧する';
    mode.className=[host.mode!.current==='view'?'lv-workspace-primary':'', switching?'lv-mode-switching':''].filter(Boolean).join(' ');
    mode.setAttribute('aria-busy', String(switching));
    mode.disabled = switching || !!navigation?.presentation?.() || !!core?.inputPending() || !!startup?.hasChanges() || !!tools?.hasChanges();
    if (core) { core.root.inert = switching || !!startup?.busy(); core.setExternalBusy(!!tools?.busy()); }
    startup?.render();
    retryStartup.hidden = !startup?.recoveryPending(); retryStartup.disabled = switching || !!navigation?.presentation?.() || !!host.authority.readOnly || !!tools?.hasChanges() || !!startup?.busy();
    if (!core) status.textContent = modeFeedback || (host.hasPending() ? '更新が未完了です。元の変更から再試行してください。' : '開始シーンを確認してください。シーンと記録は保持しています。');
    positionFiles();
  };
  const retryStartup = document.createElement('button'); retryStartup.type = 'button'; retryStartup.textContent = '更新を再試行';
  retryStartup.setAttribute('data-lv-edit-only', '');
  retryStartup.addEventListener('click', () => { if (!retryStartup.disabled && !disposed) startup?.retry(); });
  root.append(mode, status, retryStartup, fileNotice); if (tools) root.append(fileMenu??tools.root);
  const mountCore = () => {
    if (disposed || core || startup?.busy() || startup?.recoveryPending() || host.hasPending() || !chooseStartupScene(read().state).sceneId) return;
    core = createProjectWorkspace(document, {
    ...productSources(host,navigation?.smoothDisplay),
    openProject: navigation?.openProject, projectNavigationBlocked: navigation?.projectNavigationBlocked, resumedLastProject: navigation?.resumedLastProject, storageEstimate: navigation?.storageEstimate,
    localSettings: navigation?.localSettings,
    editorSettings: host.editorSettings,
    disclosureOpening(){if(tools?.hasChanges())return false;if(fileMenu)fileMenu.open=false;return true;},
    createModelPreview: renderCandidate ? () => {
      let token = '', sceneId = '';
      const preview = createModelCandidatePreview(document, renderCandidate, () => !disposed && token === read().token && sceneId === viewportScene,open=>{previewOpen=open;if(open)mainRuntime?.setActive(false);
        else queueMicrotask(()=>{if(!disposed)core?.render();});});
      refreshPreview = preview.render;
      return { root: preview.root, render() { preview.render(); }, dispose() { refreshPreview = undefined; preview.dispose(); },
        show(current, scene, asset, operation, label) { if (current !== read().token || scene !== viewportScene) throw Error('モデルの更新候補を確認してください。'); token = current; sceneId = scene;
          preview.show(label, modelCandidateDisplay(read(), scene, asset, operation, host.limits)); } };
    } : undefined,
    read, presentation: navigation?.presentation, get mode() { return host.mode!.current; }, get readOnly() { return !!host.authority.readOnly || !!navigation?.presentation?.(); }, status: () => host.authority.status!(),
    projectStatus() {
      const current = host.read(), provider = read(), jobs = host.workspaceOutput.jobs;
      const title = provider.inspection.candidates.fields.find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'title');
      const candidate = title?.valid && title.candidates.length === 1 ? title.candidates[0]?.value : undefined;
      return { title: candidate?.kind === 'value' && typeof candidate.value === 'string' ? candidate.value : null,
        resumable: current.state === 'ready' && !!current.publication && current.source?.token === provider.token && !host.hasPending(),
        backup: host.workspaceOutput.error || jobs.some(j => j.state === 'repair-required') ? 'unavailable' :
          jobs.some(j => j.purpose === 'backup' && j.state === 'file-verified' && j.token === provider.token && j.stale === false) ? 'verified' : 'unconfirmed' };
    },
    dispatch: (token, command) => host.dispatch(token, command), retry: async () => host.authority.retry!(),
    addMedia: async (token, input) => host.authority.addMediaFile!(token, input),
    prepareGsProxy: async(...a)=>host.authority.prepareGsProxy!(...a),
    commitGsProxy: async(...a)=>host.authority.commitGsProxy!(...a),
    cancelGsProxy: ()=>host.authority.cancelGsProxy?.(),
    addModel: async (token, input) => host.authority.addModelFile!(token, input),
    modelSelectionNotice: file=>host.content.modelSelectionNotice(file),
    replaceModel: async (token, input) => host.authority.replaceModelFile!(token, input),
    transformModel: async (token, input) => host.authority.transformModel!(token, input),
    image: async record => new Blob([(await host.content.displayImage(record, true)).slice().buffer], { type: displayBlobRef(record).mediaType as string }),
    imageScope: () => host.imageScope(),
    changed, otherPending: () => external() || !!startup?.hasChanges(),
    createViewport(canvas, update, propose, proposeModel): WorkspaceViewport {
      let state: WorkspaceViewportState | undefined, closed = false, rendered: EditableDisplay | undefined, pointerHeld = false;
      let renderedInput = '';
      const runtime = factory(canvas, update, (target, position, phase) => {
        if (!state?.pin || state.readOnly || host.authority.readOnly || target.token !== read().token ||
          JSON.stringify(target) !== JSON.stringify(state.pin.target)) return false;
        return propose(target, position, phase);
      }, (target, position, manipulation) => {
        if (!state?.model || state.readOnly || host.authority.readOnly || JSON.stringify(state.model.target) !== JSON.stringify(target) || target.token !== read().token) return false;
        return !!proposeModel?.({ target, mode: manipulation?.mode ?? state.model.mode,
          ...(state.model.pivotAsset ? { pivotAsset: state.model.pivotAsset } : {}),
          placement: { translation: position, rotationXYZW: manipulation?.rotationXYZW ?? state.model.placement.rotationXYZW,
            uniformScale: manipulation?.uniformScale ?? state.model.placement.uniformScale } });
      });
      const target = (assetId: string): WorkspaceSurface | null => {
        if (!state || state.readOnly || state.token !== read().token) return null;
        const snapshot = host.authority.read(), version = snapshot.modelVersions?.find(v => v.assetId === assetId);
        const seen = runtime.read(), display = seen.display;
        if (!state.available || !seen.ready || seen.issue || rendered !== display || state.hiddenAssetIds?.includes(assetId) || snapshot.state.token !== state.token || !version || version.families.length !== 1 || !display || display.token !== state.token || display.sceneId !== state.sceneId || display.readOnly || !display.models.some(m => m.binding.assetId === assetId && m.binding.id === version.projection.bindingId)) return null;
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
        const cameraAvailable=current&&(seen.cameraReady??seen.ready)&&!seen.issue;
        const pinIds = new Set(available ? rendered!.pins.map(p => p.id) : []);
        return { token: seen.display?.token ?? '', sceneId: seen.display?.sceneId ?? '', pickToken: available ? receipt : '', ready: available,
          dragging: seen.dragging || !!seen.manipulating,navigating:seen.navigating,camera:seen.camera,cameraReady:cameraAvailable,retryAvailable:seen.retryAvailable, pins: available ? seen.pins.filter(p => pinIds.has(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => {
            const source = rendered!.pins.find(pin => pin.id === p.id)!; return { ...p, scale: source.scale ?? 1, color: source.color, status: source.status, notice: source.notice };
          }) : [], issue: seen.issue, notice: seen.notice ?? null, loading: seen.loading,
          assetIds: available ? seen.display!.models.map(m => m.binding.assetId) : [],
          view: cameraAvailable && !seen.dragging && !seen.manipulating ? { kind: 'ready' as const, token: seen.token, sceneId: state!.sceneId, projectFrameId: read().resources.projectFrameId,
            projection: seen.projection, axis: seen.axis, bounds: { kind: 'value' as const, value: seen.display!.bounds ? 'available' as const : 'empty' as const } } :
            { kind: 'unavailable' as const, token: seen.token, sceneId: state?.sceneId ?? '', projectFrameId: read().resources.projectFrameId, reason: seen.issue ?? '3D表示を確認してください。' } };
      };
      mainRuntime=runtime;
      return {
        update(next) {
          if (closed) return; state = next; viewportScene = next.sceneId; refreshPreview?.();
          const snapshot = host.authority.read();
          if (previewOpen){runtime.setActive(false);return;}
          if (!next.available || snapshot.state.token !== next.token) { renderedInput = ''; runtime.setPinPointerActive?.(false); runtime.setActive(false); return; }
          // A renderer observation can request another UI render. Identical typed
          // input must retain the exact display and must not start a new renderer
          // revision/notification cycle (which would repeatedly replace controls).
          const input = JSON.stringify(next);
          if (input === renderedInput) {
            runtime.setPinPointerActive?.(pointerHeld || !!next.windowMoving || next.choosing && !next.readOnly); runtime.setActive(true); return;
          }
          const modelEdit = next.model && next.model.target.token === next.token ? { target: next.model.target, position: next.model.placement.translation,
            enabled: !next.readOnly, manipulation: { mode: next.model.mode, rotationXYZW: next.model.placement.rotationXYZW, uniformScale: next.model.placement.uniformScale,
              ...(next.model.pivotAsset ? { pivotAsset: next.model.pivotAsset } : {}) } } : undefined;
          let display = projectDisplay(snapshot, next.sceneId, next.pinColors, next.selectedId, modelEdit, next.hiddenAssetIds ?? []);
          if (next.pin) {
            const model = display.models.find(m => m.binding.assetId === next.pin!.target.assetId);
            if (model && next.pin.target.token === next.token) {
              const position = pointInProject(next.pin.position, model.binding.assetToProject);
              display = { ...display, preview: position, pinEdit: { target: next.pin.target, position, enabled: !next.readOnly } };
            }
          }
          if (next.comparison?.token === next.token) {
            const anchor = next.comparison.anchor;
            if (anchor.kind === 'project' && anchor.projectFrameId === read().resources.projectFrameId) display = { ...display, preview: anchor.positionProject };
            else if (anchor.kind === 'asset') {
              const owner = !next.hiddenAssetIds?.includes(anchor.assetId) && display.models.find(m => m.binding.assetId === anchor.assetId && snapshot.modelVersions?.some(v => v.assetId === anchor.assetId && v.projection.bindingId === m.binding.id && v.projection.assetFrameId === anchor.assetFrameId));
              if (owner) display = { ...display, preview: pointInProject(anchor.positionAsset, owner.binding.assetToProject) };
            }
          }
          rendered = next.readOnly ? { ...display, pinEdit: undefined } : display;
          runtime.update(rendered);
          renderedInput = input;
          runtime.setPinPointerActive?.(pointerHeld || !!next.windowMoving || next.choosing && !next.readOnly); runtime.setActive(true);
        },
        read: observation, target, setPointDiameter: (assetId, diameter) => runtime.setPointDiameter?.(assetId, diameter), pointDiameter: assetId => runtime.pointDiameter?.(assetId) ?? 3,
        reservePointer(active) { pointerHeld = active; if (!closed) runtime.setPinPointerActive?.(active || !!state?.windowMoving || !!state?.choosing && !state.readOnly); },
        pick(x, y, assetId, directCreation = false) {
          if (closed || !state || state.readOnly || host.authority.readOnly || !state.choosing && !directCreation) return null;
          const before = observation();
          if (!before.ready || before.dragging || !before.pickToken || before.token !== read().token) return null;
          const display = runtime.read().display;
          if (!display || display.readOnly) return null;
          const targets = display.models.flatMap(m => {
            const t = target(m.binding.assetId); if(m.shape==='saved-gs'&&!assetId)return []; return t && (!assetId || t.assetId === assetId) ? [t] : [];
          });
          const hit = runtime.pickCreation?.(targets, x, y), after = observation();
          return hit && before.pickToken === after.pickToken && before.token === after.token && read().token === before.token ? hit : null;
        },
        camera(action) { runtime.camera(action === 'fit' ? { kind: 'fit' } : { kind: 'axis', axis: ({ front: '+z', back: '-z', left: '-x', right: '+x', top: '+y', bottom: '-y' } as const)[action] }); },
        retry() { if (!closed) runtime.retry(); },
        capture() { const payload = runtime.capture?.(); if (!payload) throw Error('現在の表示を記録できません。');
          return { camera: readProjectCamera(payload.camera) as unknown as import('../domain/values').JsonObject, background: readSolidBackground(payload.background) }; },
        recall(payload) { if (!runtime.recall) throw Error('視点を呼び出せません。'); runtime.recall({ camera: readProjectCamera(payload.camera), background: readSolidBackground(payload.background) }); },
        viewCamera: intent => runtime.camera(intent),
        get navigateCamera(){if(!runtime.navigateCamera)return undefined;return(event:Parameters<NonNullable<ProjectViewport['navigateCamera']>>[0])=>{if(event.phase==='end')return runtime.navigateCamera?.(event)??false;
          if(closed||!state||pointerHeld||state.windowMoving||state.token!==read().token||!observation().cameraReady)return false;
          return runtime.navigateCamera?.(event)??false;};},
        background(input, verify) { if (!runtime.setBackground) throw Error('背景を変更できません。'); runtime.setBackground(input, verify); },
        dispose() { if (!closed) { closed = true;if(mainRuntime===runtime)mainRuntime=undefined; runtime.setActive(false); runtime.dispose(); } },
      };
    },
    });
    root.append(core.root);
    core.headerActions.append(mode); if(fileMenu)core.headerActions.append(saveEntry,shareEntry,fileMenu);
    if(fileMenu)fileHeader.insertBefore(core.projectNavigation,fileClose);
    if(navigation?.utilitiesRoot)core.utilityArea.append(navigation.utilitiesRoot);
    startup?.dispose(); startup?.root.remove(); startup = undefined; status.textContent = '';
  };
  const ensureStartup = () => {
    if (!chooseStartupScene(read().state).sceneId && !startup) {
      startup = createMetadataStartupControls(document, host, () => undefined, render,
        () => !!navigation?.presentation?.() || external() || !!core?.inputPending()); root.append(startup.root);
    } else if (startup && core && chooseStartupScene(read().state).sceneId && !startup.hasChanges()) {
      const active = read().state.scenes[core.activeScene()]?.lifecycle;
      if (active?.kind !== 'value' || active.value.state !== 'active') { root.append(mode); if(fileMenu)root.append(fileMenu); core.unmount(); core = undefined; }
      else { startup.dispose(); startup.root.remove(); startup = undefined; }
    }
  };
  const render = () => { if (!disposed) { ensureStartup(); mountCore(); core?.render(); changed(); navigation?.changed(); } };
  ensureStartup();
  mountCore();
  mode.addEventListener('click', () => { void (async () => {
    if (disposed || mode.disabled || core?.inputPending() || startup?.hasChanges() || tools?.hasChanges()) return;
    const recovery = host.mode!.current === 'view' && (host.read().state === 'pending' || host.mode!.recoveryAvailable);
    if (host.hasPending() && !recovery) { status.textContent = '更新を再試行してから切り替えてください。'; return; }
    modeFeedback = ''; switching = true; changed();
    try { await host.mode!.change(host.mode!.current === 'view' ? 'edit' : 'view', read().token, render); }
    catch (error) { if (!disposed) { modeFeedback = (error as Error).message; status.textContent = modeFeedback; } }
    finally { switching = false; core?.clearNotice(); render(); }
  })(); });
  const unmount = () => { if (!disposed) { disposed = true; document.defaultView?.removeEventListener('resize',positionFiles); if(navigation?.utilitiesRoot)utilitiesParent?.append(navigation.utilitiesRoot); startup?.dispose(); core?.unmount(); root.remove(); } };
  changed();
  const interaction = { get interactionPending() { return core?.session.interactionPending || !!startup?.hasChanges(); },
    get acknowledgment() { return startup?.busy() || startup?.recoveryPending() ? { state: startup.busy() ? 'checking' as const : 'failed' as const } : core?.session.acknowledgment ?? { state: 'idle' as const }; },
    refreshHistory: render };
  return { root, session: interaction, render, hasProjectHeader: () => !!core,
    inputPending: (includePresentation=true) => switching || includePresentation && !!navigation?.presentation?.() || !!core?.inputPending() || !!startup?.hasChanges(),
    hasChanges: (includePresentation=true) => switching || includePresentation && !!navigation?.presentation?.() || host.hasPending() || !!core?.hasChanges() || !!startup?.hasChanges() || !!tools?.hasChanges(), unmount,
    async dispose() { unmount(); tools?.dispose(); await host.dispose(); } };
}
