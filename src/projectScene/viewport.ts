import type { GsResidency,GsViewIntent } from '../viewer/gsDecodeQueue';
import { pointVisibility } from './validationPointCoverage';
import { pickPointAwareCreation } from './viewportPointPicking';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { defaultPose, fittedPose, placementMatrix, projectBounds, switchProjection, type CameraPose, type RenderDisplay, type EditableDisplay } from './viewportModel';
import { renderOwner, renderPlacement, isReadonlyModel, isSavedModel } from './modelTypes';
import type { ViewportFactory, ViewportObservation } from './viewportPorts';
import { PROJECT_SCENE_STANDARD_BACKGROUND_HEX, readProjectCamera, readSolidBackground, type SolidBackground } from './viewDisplay';
import type { DisplayCapture } from './displayCapture';
import { pickResidentCreation, pickResidentSurface, type PinSurfaceTarget, type ResidentSurface } from './viewportPicking';
import { createPinGizmo, type ModelPlacementTarget } from './pinGizmo';
import { proposedPlacement } from './modelTransform';
import type { SavedModelResidentPort } from './validationRender';
import { hasBinaryCoverage } from '../viewer/hardChroma';
import { resolvePointPresentation, pointRegistrySnapshot, defaultPointProfile } from '../domain/pointPresentation';
import { createValidationCoverage, coveragePixel } from './validationCoverage';
import type { GsRenderPort,GsFrame } from '../viewer/gsRender';
import type {SmoothComposite,SmoothPresentation,SmoothMesh} from '../viewer/smoothComposite';
import type {TargetLayout} from '../viewer/targetBudget';
import {smoothCoverage} from '../viewer/smoothMaterial';

/** Application viewport. Actual saved residents are required; geometry adapters own any non-file preview. */
export const sceneViewportFactory = (saved: SavedModelResidentPort, residency?: GsResidency, geometry?: (model:RenderDisplay['models'][number],appearance:NonNullable<EditableDisplay['materials']>[string]|undefined)=>ResidentSurface,presentation?:SmoothPresentation): ViewportFactory => (canvas, changed, proposePin, proposeModel) => {
  let renderer: THREE.WebGLRenderer | null = null, controls: OrbitControls | null = null;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  const scene = new THREE.Scene(), models = new THREE.Group(); scene.add(models); scene.background = new THREE.Color(PROJECT_SCENE_STANDARD_BACKGROUND_HEX);
  const resident = new Map<string, ResidentSurface>();
  const residentKeys = new Map<string,string>();
  const fileModels=(rows:RenderDisplay['models'])=>rows.flatMap(m=>isReadonlyModel(m)||isSavedModel(m)?[m]:[]);
  const loadState=(m:RenderDisplay['models'][number])=>isReadonlyModel(m)||isSavedModel(m)?saved.state?.(m):undefined;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77736e, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, 5, 4); scene.add(light);
  const poses = new Map<string, CameraPose>();
  const backgrounds = new Map<string, SolidBackground>();
  let background: SolidBackground = { kind: 'solid', colorSrgb: [232 / 255, 230 / 255, 226 / 255] };
  let blockedNext:RenderDisplay|null=null,pendingGsTarget=false,capacityIssue:string|null=null,gsIntent:GsViewIntent|null=null,gsIntentKey='',retryScheduled=false;
  let entryPending = false, notice: string | null = null;
  let pose = defaultPose(), display: RenderDisplay | null = null, modelKey = '', active = false, disposed = false, applying = false;
  let issue: string | null = null, contextLost = false, dragging = false, axis: ViewportObservation['axis'] = null, serial = 0, raf = 0, lastObservation = '';
  let lastDrawSerial = -1, visualDirty = true;
  let width = 1, height = 1, rawPixelRatio = 0; let pointDiameterNotice: string | null = null; const pointDiameters = new Map<string, number>();
  let pickEpoch = 0;
  let coverageProbe: ReturnType<typeof createValidationCoverage> | null = null, coverageIssue: string | null = null;
  let gsRender:GsRenderPort|null=null,gsGeneration=0,gsPreparing=false,gsIssue:string|null=null,gsPreparationAbort:AbortController|null=null;
  let gizmo: ReturnType<typeof createPinGizmo<PinSurfaceTarget | ModelPlacementTarget>> | null = null;
  let pinPointerActive = false;
  let navigation:{id:string;kind:'orbit'|'pan';controls:OrbitControls;display:RenderDisplay}|null=null;
  let composite:SmoothComposite|null=null,smoothLayout:TargetLayout|null=null,smoothGeneration=0,smoothPending=false,smoothIssue:string|null=null,smoothPresented=false,waitingBudget=false,refusedAvailable=0,smoothAbort:AbortController|null=null;
  const overlayScene=new THREE.Scene();
  function syncOrbit(manipulating = Boolean(gizmo?.dragging)) {
    if (controls) controls.enabled = !pinPointerActive && !manipulating && !navigation;
  }
  function endNavigation(id?:string,notify=true){
    if(!navigation||id!==undefined&&navigation.id!==id)return false;
    observePose();navigation=null;syncOrbit();if(notify){serial++;changed();}return true;
  }
  const mouseNavigation = (event: PointerEvent) => {
    if (!controls || event.pointerType === 'touch' || event.button !== 1) return;
    // Configure before Orbit's down handler. Shift+ROTATE is its screen-space pan.
    controls.mouseButtons.MIDDLE = event.altKey || event.metaKey || (event.ctrlKey && event.shiftKey)
      ? undefined : event.ctrlKey ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
    event.preventDefault(); // Do not start the browser's middle-button autoscroll.
  };
  canvas.addEventListener('pointerdown', mouseNavigation, true);
  const errorText = (e: unknown) => e instanceof Error ? e.message : '3D表示を開始できません。';
  function observePose() {
    if (!camera || !controls) return;
    const tuple = (v: THREE.Vector3) => v.toArray().map(n => n || 0) as [number, number, number];
    pose = { position: tuple(camera.position), target: tuple(controls.target),
      up: tuple(camera.up), projection: camera instanceof THREE.PerspectiveCamera
        ? { kind: 'perspective', verticalFov: THREE.MathUtils.degToRad(camera.fov) }
        : { kind: 'orthographic', verticalSpan: (camera.top - camera.bottom) / camera.zoom } };
    if (display) { poses.set(display.sceneId, pose); backgrounds.set(display.sceneId, background); }
  }
  function useCapture(input: DisplayCapture) {
    const c = readProjectCamera(input.camera), b = readSolidBackground(input.background);
    pose = { position: c.position, target: c.target, up: c.up, projection: c.projection.kind === 'perspective'
      ? { kind: 'perspective', verticalFov: c.projection.verticalFovRadians } : c.projection };
    background = b; axis = null;
  }
  function enterScene() {
    if (!display || !entryPending) return;
    const entry = display.entry;
    notice = entry?.kind === 'blocked' ? entry.reason : null;
    if (entry?.kind === 'ready') useCapture(entry.payload);
    else if (entry?.kind !== 'blocked') {
      pose = poses.get(display.sceneId) ?? (display.bounds ? fittedPose(display.bounds, defaultPose(), width / height) : defaultPose());
      background = backgrounds.get(display.sceneId) ?? { kind: 'solid', colorSrgb: [232 / 255, 230 / 255, 226 / 255] };
    }
    poses.set(display.sceneId, pose); backgrounds.set(display.sceneId, background); entryPending = false; axis = null;
  }
  function clearSmooth(){if(!presentation)return;smoothGeneration++;smoothAbort?.abort();smoothAbort=null;composite?.dispose();composite=null;smoothPending=false;smoothLayout=null;smoothIssue=null;smoothPresented=false;waitingBudget=false;delete canvas.dataset.compositionBytes;delete canvas.dataset.renderScale;}
  function clearGs(preserve?:GsViewIntent|null) {
    clearSmooth();
    if(gsIntent!==preserve)gsIntent?.cancel();gsIntent=preserve??null;if(!preserve)gsIntentKey='';
    coverageIssue=null;
    gsGeneration++;gsPreparationAbort?.abort();gsPreparationAbort=null;gsRender?.dispose();gsRender=null;gsPreparing=false;gsIssue=null;
    for(const surface of resident.values())if(surface.gs){surface.gs.ready=false;surface.gs.issue=null;}
  }
  function clearModels(preserve?:GsViewIntent|null) {
    clearGs(preserve);
    coverageProbe?.dispose(); coverageProbe = null; coverageIssue = null;
    for (const surface of resident.values()) surface.dispose?.();
    resident.clear();residentKeys.clear();
    for (const child of [...models.children]) {
      child.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (node.material as THREE.Material).dispose(); } });
      models.remove(child);
    }
  }
  function release() {
    endNavigation(undefined,false);
    pickEpoch++;
    pinPointerActive = false;
    gizmo?.dispose(); gizmo = null;
    observePose(); cancelAnimationFrame(raf); raf = 0; controls?.dispose(); controls = null; camera = null;
    clearModels(); renderer?.dispose(); renderer = null; modelKey = ''; dragging = false;
  }
  function fail(e: unknown) { issue = `3D表示を停止しました。${errorText(e)} 編集内容は保持しています。`; release(); serial++; changed(); }
  function buildModels() {
    if (!display || !renderer) return;
    const key = JSON.stringify([display.models.map(m => [isReadonlyModel(m) ? m.key : m.binding.id,loadState(m)]), display.materials, display.savedMaterials]); if (key === modelKey) return;
    clearSmooth();pickEpoch++;
    coverageProbe?.dispose();coverageProbe=null;coverageIssue=null;
    const target=new Map<string,string>();
    const pendingGs=saved.gsPending?.(fileModels(display.models))??false;
    for(const model of display.models){const id=renderOwner(model),state=loadState(model);
      if(state&&state.phase!=='ready'||pendingGs&&model.representation.contentKind==='gaussianSplat'||display.materials?.[id]&&'issue' in display.materials[id]!)continue;
      target.set(id,JSON.stringify([isReadonlyModel(model)?model.key:model.binding.id,display.materials?.[id],display.savedMaterials?.[id]]));}
    const gsChanged=[...resident].some(([id,surface])=>surface.gs&&target.get(id)!==residentKeys.get(id))||display.models.some(m=>target.has(renderOwner(m))&&!resident.has(renderOwner(m))&&m.representation.contentKind==='gaussianSplat');
    if(gsChanged)clearGs(gsIntent);
    for(const [id,surface]of resident)if(target.get(id)!==residentKeys.get(id)){
      surface.asset.removeFromParent();
      if(surface.dispose)surface.dispose();else {surface.asset.removeFromParent();surface.asset.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});}
      resident.delete(id);residentKeys.delete(id);
    }
    try {
      for (const model of display.models) {
        const assetId = renderOwner(model), appearance = display.materials?.[assetId];
        if (!target.has(assetId)||resident.has(assetId)) continue;
        const surface = !isReadonlyModel(model)&&!isSavedModel(model)
          ? geometry ? geometry(model,appearance) : (()=>{throw Error('保存したモデルの表示本体を確認してください。');})()
          : saved.create(model, display.savedMaterials?.[assetId],!!presentation);
        models.add(surface.asset);resident.set(assetId,surface);residentKeys.set(assetId,target.get(assetId)!);
      }
      for(const model of display.models){const surface=resident.get(renderOwner(model));if(surface)models.add(surface.asset);}
      modelKey = key;
    } catch (e) { clearModels(); throw e; }
  }
  function configurePoints() {
    const rawDpr = globalThis.devicePixelRatio || 1;
    const view = smoothLayout??{ cssWidth: width, cssHeight: height, devicePixelRatio: rawDpr, renderScale: Math.min(rawDpr,2)/rawDpr };
    for (const [assetId, surface] of resident) surface.points?.configure(view, pointDiameters.get(assetId) ?? 3);
  }
  function previewModels() {
    if (!display) return;
    for (const model of display.models) {
      const assetId = renderOwner(model), surface = resident.get(assetId); if (!surface) continue;
      surface.asset.visible = !display.hiddenAssetIds?.includes(assetId);
      const edit = display.modelEdit;
      const placement = edit?.target.assetId === assetId
        ? proposedPlacement(renderPlacement(model), edit) : renderPlacement(model);
      surface.asset.matrix.copy(placementMatrix(placement)); surface.asset.updateMatrixWorld(true);
    }
    configurePoints(); updateClipping();
  }
  function installPose() {
    if (!renderer) return;
    endNavigation(undefined,false);
    pickEpoch++;
    const previousCamera = camera, previousControls = controls, previousGizmo = gizmo, previousBackground = scene.background, previousTouchAction = canvas.style.touchAction;
    applying = true;
    try {
      const target = new THREE.Vector3(...pose.target), position = new THREE.Vector3(...pose.position);
      const extent = display?.bounds ? new THREE.Vector3(...display.bounds.max).sub(new THREE.Vector3(...display.bounds.min)).length() : 1;
      const center = display?.bounds ? new THREE.Vector3(...display.bounds.min).add(new THREE.Vector3(...display.bounds.max)).multiplyScalar(0.5) : target;
      const distance = position.distanceTo(center), far = Math.max(10, distance + extent * 10);
      if (!Number.isFinite(far)) throw new Error('表示範囲を確認してください。');
      if (pose.projection.kind === 'perspective') camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(pose.projection.verticalFov), width / height, Math.max(1e-6, far / 1e7), far);
      else { const half = pose.projection.verticalSpan / 2; camera = new THREE.OrthographicCamera(-half * width / height, half * width / height, half, -half, -far, far); }
      camera.position.copy(position); camera.up.set(...pose.up); camera.lookAt(target); camera.updateMatrixWorld(true);
      if (![...camera.projectionMatrix.elements, ...camera.matrixWorld.elements].every(Number.isFinite)) throw new Error('表示範囲を確認してください。');
      // Register TransformControls before OrbitControls: handle-down disables orbit
      // before its listener sees that same event (including touch).
      gizmo = !display?.readOnly && (proposePin || proposeModel) ? createPinGizmo<PinSurfaceTarget | ModelPlacementTarget>(canvas, scene, camera, (target, world, manipulation, phase) => {
        if ('kind' in target) return !!proposeModel && !!display?.modelEdit?.enabled &&
          JSON.stringify(target) === JSON.stringify(display.modelEdit.target) && proposeModel(target, world, manipulation);
        const surface = resident.get(target.assetId);
        if (!proposePin || !surface || JSON.stringify(target) !== JSON.stringify(display?.pinEdit?.target) || !display?.pinEdit?.enabled) return false;
        surface.asset.updateMatrixWorld(true);
        const p = surface.asset.worldToLocal(new THREE.Vector3(...world));
        return [p.x, p.y, p.z].every(Number.isFinite) && proposePin(target, [p.x || 0, p.y || 0, p.z || 0], phase);
      }, busy => { syncOrbit(busy); serial++; if (!applying) changed(); }, () => { visualDirty = true; }) : null;
      controls = new OrbitControls(camera, canvas); controls.enableDamping = false; controls.target.copy(target);
      controls.mouseButtons = { MIDDLE: THREE.MOUSE.ROTATE };
      controls.addEventListener('start', () => { dragging = true; serial++; changed(); });
      controls.addEventListener('end', () => { dragging = false; observePose(); serial++; changed(); });
      controls.addEventListener('change', () => {
        if (!applying) { try { axis = null; observePose(); updateClipping(); serial++; pickEpoch++; } catch (e) { fail(e); } }
      });
      controls.update();
      scene.background = new THREE.Color().setRGB(...background.colorSrgb, THREE.SRGBColorSpace);
      previousControls?.dispose();
      previousGizmo?.dispose(); gizmo?.update(display?.modelEdit ?? display?.pinEdit); syncOrbit();
      // The old OrbitControls.disconnect resets this shared element to auto.
      canvas.style.touchAction = 'none';
    } catch (e) {
      if (controls !== previousControls) controls?.dispose();
      if (gizmo !== previousGizmo) gizmo?.dispose(); gizmo = previousGizmo;
      camera = previousCamera; controls = previousControls; scene.background = previousBackground;
      canvas.style.touchAction = previousTouchAction;
      throw e;
    } finally { applying = false; }
  }
  function updateClipping() {
    if (!camera || !display?.bounds) return;
    const min = new THREE.Vector3(...display.bounds.min), max = new THREE.Vector3(...display.bounds.max);
    const edit = display.modelEdit, model = edit && display.models.find(m => renderOwner(m) === edit.target.assetId);
    if (edit && model) {
      const bounds = projectBounds(model.representation.logicalBoundsAsset, proposedPlacement(renderPlacement(model), edit));
      min.min(new THREE.Vector3(...bounds.min)); max.max(new THREE.Vector3(...bounds.max));
    }
    const radius = max.clone().sub(min).length() / 2, distance = camera.position.distanceTo(min.add(max).multiplyScalar(0.5));
    const far = Math.max(10, distance + radius * 4);
    if (!Number.isFinite(far)) throw new Error('表示範囲を確認してください。');
    camera.near = camera instanceof THREE.PerspectiveCamera ? Math.max(1e-6, (distance - radius) / 1000) : -far;
    camera.far = far; camera.updateProjectionMatrix();
  }
  function smoothMeshes():SmoothMesh[]{
    const result:SmoothMesh[]=[];
    for(const surface of resident.values())if(surface.asset.visible)surface.mesh.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;for(let node:THREE.Object3D|null=object;node;node=node.parent)if(!node.visible)return;
      if((Array.isArray(object.material)?object.material:[object.material]).some(m=>m.visible&&smoothCoverage(m)))result.push({object});
    });return result;
  }
  function hideSmooth<T>(meshes:readonly SmoothMesh[],draw:()=>T):T{
    const previous=new Map<THREE.Material,boolean>();for(const {object}of meshes)for(const m of Array.isArray(object.material)?object.material:[object.material])if(smoothCoverage(m)&&!previous.has(m)){previous.set(m,m.visible);m.visible=false;}
    try{return draw();}finally{for(const [m,visible]of previous)m.visible=visible;}
  }
  function syncSmoothLayout(meshes:readonly SmoothMesh[]){
    if(!renderer||!presentation)return;
    if(!meshes.length||smoothIssue){const hadLayout=!!smoothLayout;smoothPresented=false;if(!meshes.length)clearSmooth();else{composite?.dispose();composite=null;smoothLayout=null;delete canvas.dataset.compositionBytes;delete canvas.dataset.renderScale;}
      if(hadLayout){const ratio=Math.min(rawPixelRatio||1,2);renderer.setDrawingBufferSize(Math.max(1,Math.floor(width*ratio+.5)),Math.max(1,Math.floor(height*ratio+.5)),1);configurePoints();pickEpoch++;}return;}
    if(smoothLayout&&smoothLayout.cssWidth===width&&smoothLayout.cssHeight===height&&smoothLayout.devicePixelRatio===rawPixelRatio)return;
    try{const gl=renderer.getContext(),available=presentation.budget.available+(composite?.leaseBytes??0)+(gsRender?.targetBytes??0);
      const next=presentation.plan(width,height,rawPixelRatio,available,Math.min(renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number));
      if(smoothLayout&&(smoothLayout.width!==next.width||smoothLayout.height!==next.height))clearSmooth();
      smoothLayout=next;renderer.setDrawingBufferSize(next.width,next.height,1);configurePoints();coverageProbe?.dispose();coverageProbe=null;pickEpoch++;serial++;
    }catch(error){smoothIssue=errorText(error);waitingBudget=true;refusedAvailable=presentation.budget.available;serial++;changed();}
  }
  function drawSmooth(meshes:readonly SmoothMesh[],before:()=>void,frame?:GsFrame){
    if(!renderer||!camera||!presentation)return;
    const fallback=()=>hideSmooth(meshes,()=>{if(frame)frame.renderBase();else{before();renderer!.render(scene,camera!);}});
    if(!smoothLayout||smoothIssue){smoothPresented=false;fallback();return;}
    if(!composite&&!smoothPending){smoothPending=true;smoothAbort=new AbortController();const generation=smoothGeneration,current=renderer,layout=smoothLayout;
      void presentation.create(current,presentation.budget,layout,frame,smoothAbort.signal).then(created=>{
        if(disposed||renderer!==current||generation!==smoothGeneration){created.dispose();return;}composite=created;smoothPending=false;smoothAbort=null;serial++;changed();
      },error=>{if(generation!==smoothGeneration||disposed)return;smoothIssue=errorText(error);waitingBudget=smoothIssue.includes('空き容量');refusedAvailable=presentation.budget.available;smoothPending=false;serial++;changed();});
    }
    if(!composite){fallback();return;}
    const helper=gizmo?.helper,wasVisible=helper?.visible;
    try{if(helper)helper.visible=false;before();composite.render(scene,camera,meshes,frame);smoothPresented=true;
      canvas.dataset.compositionBytes=String(composite.layout.bytes);canvas.dataset.renderScale=String(smoothLayout.renderScale);
    }catch(error){smoothIssue=errorText(error);const failed=composite;composite=null;failed.dispose();delete canvas.dataset.compositionBytes;delete canvas.dataset.renderScale;smoothPresented=false;fallback();serial++;changed();}
    finally{if(helper)helper.visible=wasVisible!;}
    if(smoothPresented&&helper&&wasVisible){const parent=helper.parent,auto=renderer.autoClear;try{overlayScene.add(helper);renderer.autoClear=false;renderer.clearDepth();renderer.render(overlayScene,camera);}finally{helper.removeFromParent();parent?.add(helper);renderer.autoClear=auto;}}
  }
  function renderFrame() {
    if (!renderer || !camera) return;
    const smooth=presentation?smoothMeshes():[];syncSmoothLayout(smooth);
    const sources=[...resident.values()].filter(s=>s.gs&&s.asset.visible).map(s=>s.gs!);
    if((import.meta.env.DEV||import.meta.env.MODE==='project-scene-validation'||import.meta.env.MODE==='project-scene-desktop'||import.meta.env.MODE==='project-scene-offline')&&sources.length&&!gsRender&&!gsPreparing&&!gsIssue){gsPreparing=true;const generation=gsGeneration,currentRenderer=renderer,intent=gsIntent,abort=new AbortController();gsPreparationAbort=abort;
      void import('../viewer/gsRender').then(m=>{abort.signal.throwIfAborted();if(generation!==gsGeneration||renderer!==currentRenderer)throw new DOMException('表示準備を取り消しました。','AbortError');
        return m.createGsRender(currentRenderer,sources,()=>{if(abort.signal.aborted||generation!==gsGeneration)return;pickEpoch++;serial++;changed();},abort.signal,residency,intent??undefined,presentation?.budget);}).then(port=>{
        if(generation!==gsGeneration||renderer!==currentRenderer){port.dispose();return;}clearSmooth();gsRender=port;gsPreparing=false;serial++;changed();
      },e=>{if(generation===gsGeneration){gsIssue=errorText(e);gsPreparing=false;for(const source of sources){source.ready=false;source.issue=gsIssue;}serial++;changed();}});}
    // Upload new projected attributes before Three traverses/uploads geometry, never in onBeforeRender.
    const before=()=>{for (const surface of resident.values()) if (surface.points) { const gl=renderer!.getContext(); surface.points.project(camera!,gsRender?.depthBits??gl.getParameter(gl.DEPTH_BITS) as number); }};
    if(gsRender){try{if(presentation&&smooth.length&&smoothLayout&&!smoothIssue)gsRender.render(scene,camera,before,frame=>drawSmooth(smooth,before,frame));else hideSmooth(smooth,()=>gsRender!.render(scene,camera!,before));}catch(e){gsIssue=errorText(e);clearSmooth();const failed=gsRender;gsRender=null;try{failed.dispose();}catch(cleanup){gsIssue+=` ${errorText(cleanup)}`;}for(const s of sources){s.ready=false;s.issue=gsIssue;}pickEpoch++;serial++;changed();hideSmooth(smooth,()=>{before();renderer!.render(scene,camera!);});}}
    else if(presentation&&smooth.length)drawSmooth(smooth,before);else{before();renderer.render(scene,camera);}
    if(presentation)canvas.dataset.compositionDocumentBytes=String(presentation.budget.used);
  }
  function draw() {
    if (!active || disposed || !renderer || !camera) return;
    try {
      // Reserve before notification: ready -> host render -> ensure may reenter synchronously.
      raf = requestAnimationFrame(draw);
      if (rawPixelRatio !== (globalThis.devicePixelRatio || 1)) ensure();
      if (visualDirty || lastDrawSerial !== serial) {
        // Clear before drawing: decoder/sort callbacks may invalidate this frame.
        visualDirty = false; lastDrawSerial = serial;
        renderFrame();
      }
      const fingerprint = JSON.stringify([serial, width, height, display?.token, display?.pins, display?.preview, pose, background]);
      if (fingerprint !== lastObservation) { lastObservation = fingerprint; changed(); }
    } catch (e) { fail(e); }
  }
  function admitDisplay(next:RenderDisplay):boolean {
    if(!residency)return true;
    // Mesh/Point may display while GS sources are checked. Unknown GS is never zero demand.
    if(saved.gsPending?.(fileModels(next.models))){
      if(gsIntent?.active){blockedNext=next;pendingGsTarget=true;capacityIssue=null;serial++;changed();return false;}
      blockedNext=null;pendingGsTarget=false;capacityIssue=null;return true;}
    const key=JSON.stringify([next.models.map(m=>isReadonlyModel(m)?m.key:m.binding.id),next.materials,next.savedMaterials,next.hiddenAssetIds]);
    if(gsIntent?.active&&gsIntentKey===key){blockedNext=null;pendingGsTarget=false;capacityIssue=null;return true;}
    try {
      const demands=next.models.flatMap(model=>{const id=renderOwner(model),appearance=next.materials?.[id];
        if(next.hiddenAssetIds?.includes(id)||appearance&&'issue' in appearance||!isReadonlyModel(model)&&!isSavedModel(model)||model.representation.contentKind!=='gaussianSplat')return [];
        const demand=saved.gsDemand?.(model);return demand?[demand]:[];});
      const nextIntent=demands.length?residency.admit(demands,gsIntent??undefined):null;
      if(!nextIntent)gsIntent?.cancel();gsIntent=nextIntent;gsIntentKey=key;blockedNext=null;pendingGsTarget=false;capacityIssue=null;return true;
    }catch(error){blockedNext=next;pendingGsTarget=false;capacityIssue=`${errorText(error)} ${display?'前の表示を保持しています。':'原本と記録は保持しています。'}`;serial++;changed();return false;}
  }
  function ensure() {
    if (!active || disposed || issue || !display) return;
    if(!renderer&&!gsIntent?.active){const target=blockedNext??display;if(!admitDisplay(target))return;if(target!==display)viewport.update(target);}
    const rect = canvas.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const resized = width !== rect.width || height !== rect.height || rawPixelRatio !== (globalThis.devicePixelRatio || 1); width = rect.width; height = rect.height; rawPixelRatio = globalThis.devicePixelRatio || 1;
    if (resized) pickEpoch++;
    try {
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.outputColorSpace = THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
        renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
        if (entryPending) enterScene();
        else { pose = poses.get(display.sceneId) ?? pose; background = backgrounds.get(display.sceneId) ?? background; }
        installPose(); buildModels(); previewModels();
      }
      if (resized || !raf) {
        const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
        if(presentation)syncSmoothLayout(smoothMeshes());
        if(!smoothLayout)renderer.setDrawingBufferSize(Math.max(1, Math.floor(width * ratio + .5)), Math.max(1, Math.floor(height * ratio + .5)), 1);
        configurePoints();
        if (camera instanceof THREE.PerspectiveCamera) camera.aspect = width / height;
        else if (camera) { const half = (camera.top - camera.bottom) / 2; camera.left = -half * width / height; camera.right = half * width / height; }
        camera?.updateProjectionMatrix(); serial++;
      }
      if (!raf) draw();
    } catch (e) { fail(e); }
  }
  const resize = new ResizeObserver(ensure); resize.observe(canvas);
  const lost = (event: Event) => { event.preventDefault(); contextLost = true; fail(new Error('描画環境の復旧を待って再試行してください。')); };
  const restored = () => { contextLost = false; issue = '描画環境が復旧しました。3D表示を再試行してください。'; serial++; changed(); };
  function pickSample(x: number, y: number) {
    if(presentation)renderFrame();
    const ndc = new THREE.Vector2(x * 2 / width - 1, 1 - y * 2 / height);
    let needed = false;
    for (const surface of resident.values()) surface.mesh.traverse(node => {
      if (node instanceof THREE.Mesh && (Array.isArray(node.material) ? node.material : [node.material]).some(m => hasBinaryCoverage(m))) needed = true;
    });
    if (!needed) return { ndc, coverage: undefined };
    if (!renderer || !camera) throw Error('3D表示を確認してください。');
    const pixel = coveragePixel(x, y, width, height, renderer.getDrawingBufferSize(new THREE.Vector2()));
    if (!pixel) return null;
    coverageProbe ??= createValidationCoverage(renderer); coverageIssue = null;
    return { ndc: pixel.ndc, coverage: coverageProbe.begin(camera, pixel, error => { coverageIssue = errorText(error); }) };
  }
  function pointPick(targets: readonly PinSurfaceTarget[], x: number, y: number) {
    if (!renderer || !camera || !display || display.readOnly) return null;
    coverageIssue=null;
    const gs=targets.length===1?resident.get(targets[0]!.assetId):undefined;
    if(gs?.gs){const position=pickResidentSurface(display,targets[0]!,resident,camera,new THREE.Vector2(x*2/width-1,1-y*2/height));if(!position)coverageIssue=gs.interactionIssue??gs.gs.issue;return position?{target:targets[0]!,position}:null;}
    renderFrame();if(!renderer||!camera||!display||display.readOnly)return null;const currentRenderer=renderer,currentCamera=camera,currentDisplay=display;
    return presentedPick(()=>{const drawing = currentRenderer.getDrawingBufferSize(new THREE.Vector2()), dpr = globalThis.devicePixelRatio || 1;
    const view = smoothLayout??{ cssWidth: width, cssHeight: height, devicePixelRatio: dpr, renderScale: Math.min(dpr, 2) / dpr };
    coverageIssue = null;
    const visible=pointVisibility(currentRenderer,currentCamera,resident,width,height,error=>{coverageIssue=errorText(error);});
    const gsOverlap=[...resident.values()].some(s=>s.gs?.ready&&s.asset.visible);
    const checkedVisibility={...visible,point(surface:ResidentSurface,index:number,ndc:THREE.Vector2){
      const proof=visible.point(surface,index,ndc);
      if(gsOverlap&&proof==='visible'){coverageIssue='GSと点の前後関係を確認できません。GSを非表示にして点を選択してください。';return 'unknown' as const;}
      return proof;
    }};
    try { return pickPointAwareCreation(currentDisplay, targets, resident, currentCamera, view, x, y, ndc => {
      const pixel = coveragePixel((ndc.x+1)*width/2, (1-ndc.y)*height/2, width, height, drawing); if (!pixel) throw Error('点の表示位置を確認できません。');
      coverageProbe ??= createValidationCoverage(renderer!);
      return coverageProbe.begin(camera!, pixel, error => { coverageIssue = errorText(error); });
    }, gsRender?.depthBits??currentRenderer.getContext().getParameter(currentRenderer.getContext().DEPTH_BITS) as number,checkedVisibility); } finally { visible.dispose(); }
    });
  }
  function reportPickIssue() { if (coverageIssue) { serial++; changed(); } }
  function presentedPick<T>(action:()=>T):T{return presentation&&!smoothPresented?hideSmooth(smoothMeshes(),action):action();}
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  const unsubscribeTargets=presentation?.budget.subscribe(()=>{if(!waitingBudget||disposed||!active||presentation.budget.available<=refusedAvailable)return;waitingBudget=false;smoothIssue=null;smoothLayout=null;serial++;changed();});
  const unsubscribeAdmission=residency?.subscribe(()=>{if(!blockedNext||disposed||!active||retryScheduled)return;retryScheduled=true;
    queueMicrotask(()=>{retryScheduled=false;if(blockedNext&&!disposed&&active){viewport.update(blockedNext);ensure();}});});
  const viewport:ReturnType<ViewportFactory>={
    update(next) {
      if(!admitDisplay(next))return;
      if(next!==display)endNavigation(undefined,false);
      const sceneChanged = display?.sceneId !== next.sceneId;
      const boundsChanged = JSON.stringify(display?.bounds) !== JSON.stringify(next.bounds);
      const visibilityChanged = JSON.stringify(display?.hiddenAssetIds) !== JSON.stringify(next.hiddenAssetIds);
      if (visibilityChanged) {pickEpoch++;if([...resident.values()].some(s=>s.gs))clearGs(gsIntent);}
      if (sceneChanged) observePose(); display = next;
      if (sceneChanged) { entryPending = true; if (renderer) { enterScene(); installPose(); } }
      else if (boundsChanged) { observePose(); installPose(); }
      buildModels(); previewModels(); gizmo?.update(next.modelEdit ?? next.pinEdit); serial++;
    },
    pointDiameter(assetId) { return pointDiameters.get(assetId) ?? 3; },
    setPointDiameter(assetId, input) { const resolved = resolvePointPresentation(pointRegistrySnapshot, defaultPointProfile, input), diameter = resolved.diameterCssPixels; pointDiameterNotice = resolved.diagnosedDefault ? '点の大きさを既定の3pxに戻しました。' : null;
      if (diameter === (pointDiameters.get(assetId) ?? 3)) return;
      pointDiameters.set(assetId, diameter); configurePoints(); pickEpoch++; serial++; changed(); },
    setActive(next) {
      const activating=next&&!active,retained=Boolean(next&&active&&renderer&&camera&&!issue);
      if (!next && (active||gsIntent)) release(); active = next;
      if(activating&&blockedNext)viewport.update(blockedNext);
      // Unchanged active state is common after camera/sort observations. Actual
      // size/DPR changes still enter ensure through ResizeObserver/the draw loop.
      if(!retained)ensure();
    },
    setPinPointerActive(next) { pinPointerActive = next; syncOrbit(); },
    pick(target, x, y) {
      if (!active || disposed || !renderer || !camera || issue || contextLost || dragging || navigation || gizmo?.dragging || !display || display.readOnly) return null;
      try { if ([...resident.values()].some(s => s.points&&s.asset.visible&&s.points.object.visible)) { const hit = pointPick([target], x, y); reportPickIssue(); return coverageIssue ? null : hit?.position ?? null; }
        const sample = pickSample(x, y); if (!sample) return null;
        const current=display,currentCamera=camera;const result = presentedPick(()=>pickResidentSurface(current, target, resident, currentCamera, sample.ndc, sample.coverage)); reportPickIssue(); return coverageIssue ? null : result;
      } catch (error) { coverageIssue = errorText(error); reportPickIssue(); return null; }
    },
    pickCreation(targets, x, y) {
      if (!active || disposed || !renderer || !camera || issue || contextLost || dragging || navigation || gizmo?.dragging || !display || display.readOnly) return null;
      try { if ([...resident.values()].some(s => s.points&&s.asset.visible&&s.points.object.visible)) { const hit = pointPick(targets, x, y); reportPickIssue(); return coverageIssue ? null : hit; }
        const sample = pickSample(x, y); if (!sample) return null;
        const current=display,currentCamera=camera;const result = presentedPick(()=>pickResidentCreation(current, targets, resident, currentCamera, sample.ndc, sample.coverage)); reportPickIssue(); return coverageIssue ? null : result;
      } catch (error) { coverageIssue = errorText(error); reportPickIssue(); return null; }
    },
    read() {
      const project = (position: readonly [number, number, number]) => {
        const p = new THREE.Vector3(...position); if (camera) { camera.updateMatrixWorld(true); p.project(camera); }
        return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2,
          visible: Boolean(camera && p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) };
      };
      const pins = display?.pins.map(pin => ({ id: pin.id, ...project(pin.position) })) ?? [];
      let alphaPicking = false;
      for (const surface of resident.values()) if (surface.dispose) surface.mesh.traverse(node => {
        if (node instanceof THREE.Mesh && (Array.isArray(node.material) ? node.material : [node.material])
          .some(m => m.visible&&!hasBinaryCoverage(m)&&(m.transparent || m.alphaTest > 0 || m.opacity < 1))) alphaPicking = true;
      });
      const pending=display?.models.flatMap((model,i)=>{const state=loadState(model),label=(isReadonlyModel(model)||isSavedModel(model))?saved.label?.(model):undefined;return state&&state.phase!=='ready'?[`${label??`モデル ${i+1}`}: ${state.issue??'読み込み中'}`]:[];})??[];
      const materialNotices=[...resident.entries()].flatMap(([id,s])=>{if(!s.asset.visible)return[];const model=display?.models.find(m=>renderOwner(m)===id),label=model&&(isReadonlyModel(model)||isSavedModel(model))?saved.label?.(model):undefined;return(s.materialNotices??[]).map(n=>`${label??'モデル'} / ${n}`);});
      const loading=Boolean(smoothPending||pendingGsTarget&&!blockedNext?.models.some(m=>loadState(m)?.phase==='failed')||!issue&&(!renderer||!camera)||pending.length&&display?.models.some(model=>loadState(model)?.phase==='loading')||gsPreparing||[...resident.values()].some(s=>s.asset.visible&&s.gs&&!s.gs.ready&&(!s.gs.issue||s.gs.issue==='GSの表示を準備しています。')));
      return { token: JSON.stringify([serial, display?.sceneId, display?.projectFrameId, display?.bounds, width, height, pose, background]),
        display: display ?? undefined,
        pickToken: String(pickEpoch),
        ready: Boolean(active && renderer && camera && !issue&&!capacityIssue&&!pendingGsTarget&&!pending.length), cameraReady:Boolean(active&&renderer&&camera&&controls&&!issue&&!contextLost&&display), loading, issue,retryAvailable:!!capacityIssue||!!gsIssue||!!smoothIssue||[...resident.values()].some(s=>s.gs?.issue!==null&&s.gs?.issue!==undefined&&s.gs.issue!=='GSの表示を準備しています。'),
        notice: [smoothPresented?'透過表示は近似です。':null,smoothPending?'透過表示を準備しています。':null,smoothIssue?`${smoothIssue} 透過の面は非表示です。設定と記録は保持しています。`:null,smoothLayout&&smoothLayout.renderScale<Math.min(1,2/(rawPixelRatio||1))?'3D表示の細かさを自動調整しています。元データと記録は変わりません。':null,pendingGsTarget&&'次のシーンのモデルを確認しています。前の表示を保持しています。',pending.join(' / '),capacityIssue, notice, coverageIssue, gsIssue, pointDiameterNotice, ...new Set([...resident.values()].flatMap(s => [s.points?.issue,s.asset.visible && s.gs ? s.gs.issue ?? (!s.gs.ready && !gsIssue ? 'GSの表示を準備しています。' : null) : null].filter(Boolean))), alphaPicking && !display?.readOnly ? presentation?'滑らかな透過の面は位置指定に使えません。位置の手動調整は利用できます。':'半透明・切り抜きの面へのピン配置は未接続です。原本の見た目は保持しています。' : null,
          ...new Set(materialNotices),
          ...new Set(display?.pins.flatMap(p => p.notice ? [p.notice] : []) ?? []),
          ...(display?.materialNotices ?? []), ...Object.values(display?.materials ?? {}).flatMap(m => 'issue' in m ? [m.issue] : []),
          ...Object.values(display?.savedMaterials ?? {}).flatMap(rows => Object.values(rows).flatMap(m => 'issue' in m ? [m.issue] : []))].filter(Boolean).join(' ') || null,
        dragging: dragging || !!navigation || !!gizmo?.dragging, navigating:!!navigation, camera:{position:[...pose.position],target:[...pose.target],up:[...pose.up]}, manipulating: !!gizmo?.dragging,
        projection: pose.projection.kind, axis, pins, preview: display?.preview ? project(display.preview) : undefined };
    },
    navigateCamera(event){
      if(event.phase==='end')return endNavigation(event.id);
      if(event.phase==='begin'){
        if(disposed||!active||!renderer||!camera||!controls||issue||contextLost||!display||dragging||navigation||gizmo?.dragging)return false;
        navigation={id:event.id,kind:event.kind,controls,display};syncOrbit();serial++;changed();return true;
      }
      const owner=navigation;
      if(!owner||owner.id!==event.id)return false;
      if(disposed||!active||!renderer||!camera||!controls||issue||contextLost||display!==owner.display||controls!==owner.controls||dragging||gizmo?.dragging){endNavigation(event.id);return false;}
      if(!Number.isFinite(event.dx)||!Number.isFinite(event.dy))return false;
      if(owner.kind==='pan')controls.pan(event.dx,event.dy);
      else{controls.rotateLeft(2*Math.PI*event.dx/Math.max(1,height));controls.rotateUp(2*Math.PI*event.dy/Math.max(1,height));}
      controls.update();changed();return true;
    },
    camera(intent) {
      if (!active || !renderer || issue || !display || dragging || navigation || gizmo?.dragging) throw new Error('3D表示を確認してください。');
      observePose();
      if (intent.kind === 'recall') throw new Error('保存した視点は未接続です。');
      if (intent.kind === 'projection') pose = switchProjection(pose, intent.projection);
      else { if (!display.bounds) throw new Error('表示するモデルがありません。'); pose = fittedPose(display.bounds, pose, width / height, intent.kind === 'axis' ? intent.axis : undefined); }
      axis = intent.kind === 'axis' ? intent.axis : null; installPose(); observePose(); serial++; changed();
    },
    capture() {
      if (!active || !renderer || issue || !display || dragging || navigation || gizmo?.dragging) throw new Error('3D表示を確認してください。');
      return { camera: readProjectCamera({ position: pose.position, target: pose.target, up: pose.up,
        projection: pose.projection.kind === 'perspective' ? { kind: 'perspective', verticalFovRadians: pose.projection.verticalFov } : pose.projection }), background: readSolidBackground(background) };
    },
    setBackground(input, verify) {
      if (!active || disposed || !renderer || !camera || issue || contextLost || !display || dragging || navigation || gizmo?.dragging) throw new Error('3D表示を確認してください。');
      const next = readSolidBackground(input), previous = scene.background, previousValue = background;
      // No camera/Orbit/gizmo replacement, fitting, model I/O or rounded readback.
      scene.background = new THREE.Color().setRGB(...next.colorSrgb, THREE.SRGBColorSpace);
      try {
        renderFrame();
        background = next; // Readable for verification, not yet published to Scene memory/listeners.
        verify?.();
      }
      catch (e) {
        background = previousValue; scene.background = previous;
        try { renderFrame(); } catch (rollbackError) { fail(rollbackError); }
        throw e;
      }
      backgrounds.set(display.sceneId, next); serial++; changed();
    },
    recall(payload) {
      if (!active || !renderer || issue || !display || dragging || navigation || gizmo?.dragging) throw new Error('3D表示を確認してください。');
      const previousPose = pose, previousBackground = background, previousAxis = axis;
      try { useCapture(payload); installPose(); }
      catch (e) { pose = previousPose; background = previousBackground; axis = previousAxis; throw e; }
      poses.set(display.sceneId, pose); backgrounds.set(display.sceneId, background); notice = null; serial++; changed();
    },
    retry() { if(blockedNext){this.update(blockedNext);ensure();return;} if (contextLost) throw new Error('描画環境の復旧を待って再試行してください。'); release(); issue = null; ensure(); },
    dispose() { disposed = true;unsubscribeTargets?.();unsubscribeResidents?.();unsubscribeAdmission?.(); release(); resize.disconnect(); canvas.removeEventListener('pointerdown', mouseNavigation, true);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored); },
  };
  const unsubscribeResidents=saved.subscribe?.(()=>{if(disposed||!display&&!blockedNext)return;
    if(!active){modelKey='';serial++;changed();return;}
    try{viewport.update(blockedNext??display!);configurePoints();ensure();serial++;changed();}catch(error){fail(error);}});
  return viewport;
};
