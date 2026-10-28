import {createModelCandidatePreview} from '../../src/harness/projectScene/modelCandidatePreview';
import { createGsResidency } from '../../src/viewer/gsDecodeQueue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSyntheticProject, fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { defaultPose, fittedPose, placementMatrix, projectBounds, switchProjection, syntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { createSyntheticViewport, sceneViewportFactory } from '../../src/harness/projectScene/viewport';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import { value } from '../../src/scene/types';
import { resolveFixtureMaterial, sourceColorSrgb, sourceMaterialIntent } from '../../src/harness/projectScene/materialHistory';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';
import { planPinMode } from '../../src/ui/projectScene/pinModeState';
import { pickResidentSurface } from '../../src/harness/projectScene/viewportPicking';
import { degreesRotation, proposedPlacement } from '../../src/harness/projectScene/modelTransform';
import type { GizmoProposal, ModelPlacementTarget } from '../../src/harness/projectScene/pinGizmo';
import type { ReadonlyRenderModel, ValidationModelClosure } from '../../src/harness/projectScene/modelTypes';
import { patchHardChroma } from '../../src/viewer/hardChroma';

const tracker = vi.hoisted(() => ({ renderers: [] as any[], controls: [] as any[], resize: [] as (() => void)[],
  raf: new Map<number, () => void>(), nextRaf: 0, fail: false, gizmos: [] as any[], realOrbit: false }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    disposed = false; scene: any; camera: any; frames = 0;
    constructor() { if (tracker.fail) throw new Error('synthetic WebGL refusal'); tracker.renderers.push(this); }
    setPixelRatio() {} setSize() {} setDrawingBufferSize() {}
    render(scene: any, camera: any) { this.scene = scene; this.camera = camera; scene.updateMatrixWorld(true); this.frames++; }
    dispose() { this.disposed = true; }
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const three = await import('three');
  const actual = await vi.importActual<typeof import('three/addons/controls/OrbitControls.js')>('three/addons/controls/OrbitControls.js');
  return { OrbitControls: class extends three.EventDispatcher<any> {
    target = new three.Vector3(); disposed = false;
    constructor(readonly object: any, readonly canvas: HTMLCanvasElement) {
      super();
      if (tracker.realOrbit) { const real = new actual.OrbitControls(object, canvas); tracker.controls.push(real); return real as any; }
      canvas.style.touchAction = 'none'; tracker.controls.push(this);
    }
    update() { this.object.lookAt(this.target); } dispose() { this.disposed = true; this.canvas.style.touchAction = 'auto'; }
  } };
});
vi.mock('three/addons/controls/TransformControls.js', async () => {
  const three = await import('three');
  return { TransformControls: class extends three.EventDispatcher<any> {
    object: any; enabled = true; axis: string | null = null; disposed = false; private busy = false;
    helper = new three.Group();
    constructor(readonly camera: any) { super(); tracker.gizmos.push(this); }
    get dragging() { return this.busy; }
    set dragging(value: boolean) { if (value === this.busy) return; this.busy = value; this.dispatchEvent({ type: 'dragging-changed', value }); }
    mode = 'translate'; space = 'world';
    getHelper() { return this.helper; } setMode(mode: string) { this.mode = mode; } setSpace(space: string) { this.space = space; } setSize() {}
    attach(object: any) { this.object = object; } detach() { this.object = undefined; }
    dispose() { this.disposed = true; }
  } };
});
const descendants = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(descendants)];
const control = (root: RecordedNode, text: string) => descendants(root).find(n => n.tag === 'button' && n.textContent === text)!;
const labeled = (root: RecordedNode, label: string) => descendants(root).find(n => n.attributes.get('aria-label') === label)!;
function fakeCanvas() {
  const doc = new RecordedDocument(), canvas = doc.createElement('canvas');
  let size = { width: 0, height: 0, left: 0, top: 0 };
  Object.assign(canvas, { getBoundingClientRect: () => size });
  return { canvas, show(width = 800, height = 600) { size = { width, height, left: 0, top: 0 }; tracker.resize.forEach(f => f()); } };
}
/** Actual Orbit handlers on an authored capture/bubble target, not native browser input. */
function controlEventTarget(canvas: HTMLCanvasElement) {
  const make = () => {
    const listeners = new Map<string, { handler: EventListener; capture: boolean }[]>();
    return {
      addEventListener(type:string,handler:EventListener,options?:boolean|AddEventListenerOptions) {
        const capture=typeof options==='boolean'?options:Boolean(options?.capture), group=listeners.get(type)??[];
        if(!group.some(l=>l.handler===handler&&l.capture===capture))group.push({handler,capture});listeners.set(type,group);
      },
      removeEventListener(type:string,handler:EventListener,options?:boolean|EventListenerOptions) {
        const capture=typeof options==='boolean'?options:Boolean(options?.capture);listeners.set(type,(listeners.get(type)??[]).filter(l=>l.handler!==handler||l.capture!==capture));
      },
      emit(type:string,event:Event,capture:boolean) {
        for(const l of [...(listeners.get(type)??[])])if(l.capture===capture&&listeners.get(type)?.includes(l))l.handler(event);
      },
    };
  };
  const document=make(), target=make();
  Object.assign(canvas, {
    getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),clientWidth:800,clientHeight:600,
    ownerDocument:document,getRootNode:()=>document,setPointerCapture(){},releasePointerCapture(){},
    addEventListener:target.addEventListener,removeEventListener:target.removeEventListener,
    fire(type:string,event:Event){document.emit(type,event,true);target.emit(type,event,true);target.emit(type,event,false);document.emit(type,event,false);},
  });
}

beforeEach(() => {
  tracker.renderers.length = tracker.controls.length = tracker.resize.length = tracker.gizmos.length = 0; tracker.raf.clear(); tracker.fail = false;
  tracker.realOrbit = false;
  vi.stubGlobal('ResizeObserver', class { constructor(fn: () => void) { tracker.resize.push(fn); } observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { const id = ++tracker.nextRaf; tracker.raf.set(id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => tracker.raf.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

describe('synthetic Scene display; GPU mocked, not rendered/browser acceptance', () => {
  it('retains a healthy active view without forced measurement while resize, DPR and reopen still prepare',()=>{
    const canvas=fakeCanvas(),v=createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement,()=>{},()=>true),display=syntheticDisplay(createSyntheticProject(),f.overview,null,null);
    v.update(display);v.setActive(true);canvas.show();const measure=vi.spyOn(canvas.canvas as unknown as HTMLCanvasElement,'getBoundingClientRect'),renderer=tracker.renderers[0],pose=v.read().token;
    for(let i=0;i<20;i++)v.setActive(true);expect(measure).not.toHaveBeenCalled();expect(tracker.renderers).toHaveLength(1);expect(v.read().token).toBe(pose);
    canvas.show(900,650);expect(measure).toHaveBeenCalledOnce();expect(v.read().ready).toBe(true);measure.mockClear();vi.stubGlobal('devicePixelRatio',2);const[id,tick]=[...tracker.raf][0]!;tracker.raf.delete(id);tick();expect(measure).toHaveBeenCalled();
    v.setActive(false);expect(renderer.disposed).toBe(true);measure.mockClear();v.setActive(true);expect(measure).toHaveBeenCalled();expect(tracker.renderers).toHaveLength(2);expect(v.read().ready).toBe(true);v.dispose();
  });
  it('draws after changes, keeps idle frames quiet, and retains hover/reentrant invalidation without UI edits', () => {
    const canvas = fakeCanvas(), changed = vi.fn();
    const v = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, changed, () => true);
    const display = syntheticDisplay(createSyntheticProject(), f.overview, null, null);
    const tick = () => { const [id, frame] = [...tracker.raf][0]!; tracker.raf.delete(id); frame(); };
    v.update(display); v.setActive(true); canvas.show();
    const renderer = tracker.renderers[0]; expect(renderer.frames).toBe(1);
    tick(); tick(); expect(renderer.frames).toBe(1);
    const token = v.read().token, notifications = changed.mock.calls.length;
    tracker.gizmos.at(-1).dispatchEvent({ type: 'change' }); tick();
    expect(renderer.frames).toBe(2); expect(v.read().token).toBe(token); expect(changed).toHaveBeenCalledTimes(notifications);
    tick(); expect(renderer.frames).toBe(2);
    tracker.controls.at(-1).dispatchEvent({ type: 'change' }); tick(); expect(renderer.frames).toBe(3);
    v.update({ ...display, token: 'updated' }); tick(); expect(renderer.frames).toBe(4);
    canvas.show(900, 600); tick(); expect(renderer.frames).toBe(5);
    vi.stubGlobal('devicePixelRatio', 2); tick(); expect(renderer.frames).toBe(6);
    const draw = renderer.render.bind(renderer);
    vi.spyOn(renderer, 'render').mockImplementationOnce((scene, camera) => {
      draw(scene, camera); tracker.gizmos.at(-1).dispatchEvent({ type: 'change' });
    });
    v.update(display); tick(); tick(); expect(renderer.frames).toBe(8);
    tick(); expect(renderer.frames).toBe(8); v.dispose(); expect(tracker.raf.size).toBe(0);
  });

  it('does not emit repeated close notifications for an unopened/stale candidate preview',()=>{
    const document=new RecordedDocument(),visibility=vi.fn(),prepare=vi.fn();
    const preview=createModelCandidatePreview(document as unknown as Document,prepare,()=>false,visibility);
    preview.render();preview.render();preview.dispose();expect(visibility).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
  });
  it('holds whole target intents across lazy decoder start and reuses them for caption-only changes',async()=>{
    const base=syntheticDisplay(createSyntheticProject(),f.overview,null,null),pool=createGsResidency(5,445),admit=vi.spyOn(pool,'admit'),source=base.models[0]!;
    const model=(key:string):ReadonlyRenderModel=>({shape:'render-gs',key,assetId:source.binding.assetId,assetToProject:source.binding.assetToProject,representation:{...source.representation,contentKind:'gaussianSplat'} as ReadonlyRenderModel['representation']});
    const display=(key:string)=>({...base,token:key,models:[model(key)],readOnly:true as const,pinEdit:undefined,modelEdit:undefined,preview:undefined});
    const make=()=>{const canvas=fakeCanvas(),create=vi.fn(()=>{const asset=new THREE.Group(),mesh=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());asset.add(mesh);return{asset,mesh,dispose(){}};});
      const runtime=sceneViewportFactory({create,gsDemand:m=>({count:'key' in m&&m.key.endsWith('4')?4:1,degree:4}),dispose(){}},pool)(canvas.canvas as unknown as HTMLCanvasElement,()=>{});return{canvas,create,runtime};};
    const a=make(),b=make(),a1=display('a1'),b1=display('b1'),a4=display('a4'),b4=display('b4');
    a.runtime.update(a1);a.runtime.setActive(true);a.canvas.show();b.runtime.update(b1);b.runtime.setActive(true);b.canvas.show();
    a.runtime.update(a4);expect(admit).toHaveBeenCalledTimes(3);a.runtime.update({...a4,token:'caption-only'});expect(admit).toHaveBeenCalledTimes(3);
    b.runtime.update(b4);expect(b.runtime.read().display).toBe(b1);expect(b.create).toHaveBeenCalledOnce();
    a.runtime.setActive(false);await Promise.resolve();expect(b.runtime.read().display).toBe(b4);expect(b.create).toHaveBeenCalledTimes(2);
    a.runtime.dispose();b.runtime.dispose();const neverActive=make();neverActive.runtime.update(a4);neverActive.runtime.setActive(false);
    expect(()=>pool.admit([{count:5,degree:4}])).not.toThrow();neverActive.runtime.dispose();
  });
  it('retains the old correspondence on whole-view capacity refusal and starts an initially refused view after retry',()=>{
    const base=syntheticDisplay(createSyntheticProject(),f.overview,null,null),canvas=fakeCanvas(),pool=createGsResidency(6,534),external=pool.reserve({}, {count:4,degree:4});
    const source=base.models[0]!,model:ReadonlyRenderModel={shape:'render-gs',key:source.binding.id,assetId:source.binding.assetId,assetToProject:source.binding.assetToProject,representation:{...source.representation,contentKind:'gaussianSplat'} as ReadonlyRenderModel['representation']};
    const create=vi.fn(()=>{const asset=new THREE.Group(),mesh=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());asset.add(mesh);return{asset,mesh,dispose(){}};});
    const v=sceneViewportFactory({create,gsDemand:()=>({count:4,degree:4}),dispose(){}},pool)(canvas.canvas as unknown as HTMLCanvasElement,()=>{});
    const first={...base,models:[model],readOnly:true as const,pinEdit:undefined,modelEdit:undefined,preview:undefined};
    v.update(first);v.setActive(true);canvas.show();expect(v.read().ready).toBe(false);expect(create).not.toHaveBeenCalled();expect(v.read().retryAvailable).toBe(true);
    external.release();v.retry();canvas.show();expect(v.read().ready).toBe(true);expect(v.read().display).toBe(first);expect(create).toHaveBeenCalledOnce();
    const next={...first,token:'new-target',models:[model,{...model,key:'second',assetId:'second'}]};v.update(next);
    expect(v.read().display).toBe(first);expect(v.read().notice).toContain('前の表示');expect(create).toHaveBeenCalledOnce();
    v.update({...first,token:'current-again'});expect(v.read().notice ?? '').not.toContain('前の表示');v.dispose();
  });
  it('renders a read-only DTO with camera controls but no edit gizmo or placement picking', () => {
    const base = syntheticDisplay(createSyntheticProject(), f.overview, null, null), canvas = fakeCanvas(), propose = vi.fn();
    const models: ReadonlyRenderModel[] = base.models.map(m => ({ shape: 'render-glb', key: m.binding.id,
      assetId: m.binding.assetId, assetToProject: m.binding.assetToProject, representation: m.representation as ReadonlyRenderModel['representation'] }));
    const create = vi.fn((m: ReadonlyRenderModel) => { const asset = new THREE.Group(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
      asset.add(mesh); asset.matrixAutoUpdate = false; asset.matrix.copy(placementMatrix(m.assetToProject)); return { asset, mesh, dispose() {} }; });
    const v = sceneViewportFactory({ create, dispose() {} })(canvas.canvas as unknown as HTMLCanvasElement, () => {}, propose, propose);
    const display = { ...base, models, readOnly: true as const, pinEdit: undefined, modelEdit: undefined, preview: undefined };
    v.update(display); v.setActive(true); canvas.show(); expect(v.read().ready).toBe(true); expect(v.read().display).toBe(display);
    v.camera({ kind: 'axis', axis: '+z' }); expect(v.read().axis).toBe('+z');
    v.camera({ kind: 'projection', projection: 'orthographic' });
    expect(v.read().projection).toBe('orthographic'); expect(v.read().pins).toHaveLength(base.pins.length);
    const targets = new SyntheticSession().pinCreationTargets(); expect(v.pick!(targets[0]!, 400, 300)).toBeNull(); expect(v.pickCreation!(targets, 400, 300)).toBeNull();
    expect(tracker.gizmos).toHaveLength(0); expect(propose).not.toHaveBeenCalled(); expect(create).toHaveBeenCalledTimes(models.length); v.dispose();
  });
  it('hides residents without reloading, preserves pose/axis, fits only visible models and leaves ProjectAnchor independent', () => {
    const base = createSyntheticProject(), project = { ...base, resources: { ...base.resources,
      captions: { ...base.resources.captions, [f.second]: { ...base.resources.captions[f.second]!,
        anchor: value({ kind: 'project' as const, projectFrameId: base.resources.projectFrameId, positionProject: [2, 0, 0] as const }) } } } };
    const s = new SyntheticSession(), targets = s.pinCreationTargets(), canvas = fakeCanvas();
    const make = (hidden: readonly string[]) => {
      const d = syntheticDisplay(project, f.overview, null, f.shared, undefined, hidden);
      return { ...d, models: d.models.map(m => ({ ...m, shape: 'saved-glb' as const } as ValidationModelClosure)) };
    };
    const create = vi.fn((model: ValidationModelClosure) => {
      const geometry = new THREE.PlaneGeometry(2, 2), material = new THREE.MeshStandardMaterial();
      const asset = new THREE.Group(), mesh = new THREE.Mesh(geometry, material); asset.add(mesh); asset.matrixAutoUpdate = false;
      asset.matrix.copy(placementMatrix(model.binding.assetToProject));
      return { asset, mesh, dispose: vi.fn(() => asset.remove(mesh)) };
    });
    const v = sceneViewportFactory({ create, dispose() {} })(canvas.canvas as unknown as HTMLCanvasElement, () => {});
    v.update(make([])); v.setActive(true); canvas.show(); v.camera({ kind: 'axis', axis: '+z' });
    const captured = v.capture!(), pickToken = v.read().pickToken, surfaces = create.mock.results.map(r => r.value);
    const projected = v.read().pins.find(p => p.id === f.shared)!;
    const target = targets.find(t => t.assetId === f.equipment)!;
    expect(v.pick!(target, projected.x, projected.y)).not.toBeNull();
    const hidden = make([f.equipment]); v.update(hidden);
    expect(hidden.models).toHaveLength(2); expect(hidden.pins.map(p => p.id)).toEqual([f.second]);
    const visibleModel = hidden.models.find(m => m.binding.assetId === f.structure)!;
    expect(hidden.bounds).toEqual(projectBounds(visibleModel.representation.logicalBoundsAsset, visibleModel.binding.assetToProject));
    expect(v.capture!()).toEqual(captured); expect(v.read().axis).toBe('+z'); expect(v.read().pickToken).not.toBe(pickToken);
    expect(v.pick!(target, projected.x, projected.y)).toBeNull(); expect(v.pickCreation!(targets, projected.x, projected.y)).toBeNull();
    expect(surfaces[1].asset.visible).toBe(false); expect(create).toHaveBeenCalledTimes(2);
    expect(surfaces.every(surface => surface.dispose.mock.calls.length === 0)).toBe(true);
    v.camera({ kind: 'fit' }); expect(v.capture!().camera.target).toEqual(fittedPose(hidden.bounds!, defaultPose(), 800 / 600).target);
    const fitted = v.capture!(), allHidden = make([f.structure, f.equipment]); v.update(allHidden);
    expect(allHidden.bounds).toBeNull(); expect(v.read().pins.map(p => p.id)).toEqual([f.second]); expect(v.capture!()).toEqual(fitted);
    v.update(make([])); expect(surfaces.every(surface => surface.asset.visible)).toBe(true); expect(v.capture!()).toEqual(fitted);
    expect(create).toHaveBeenCalledTimes(2); v.dispose();
    expect(surfaces.every(surface => surface.dispose.mock.calls.length === 1)).toBe(true);
  });
  it('previews/cancels on the saved-resident branch without replacing nested content or moving the camera (injected geometry)', () => {
    const project = createSyntheticProject(), original = syntheticDisplay(project, f.overview, null, null);
    // This case tests port routing, not GLB admission: real byte/closure checks live in projectFiles.test.
    const model = original.models.find(m => m.binding.assetId === f.equipment)!;
    const saved = { ...model, shape: 'saved-glb' } as ValidationModelClosure;
    const asset = new THREE.Group(), inner = new THREE.Group(), geometry = new THREE.PlaneGeometry(), material = new THREE.MeshStandardMaterial({ color: '#2468ac' });
    const mesh = new THREE.Mesh(geometry, material); inner.position.x = 3; inner.add(mesh); asset.add(inner); asset.matrixAutoUpdate = false;
    const dispose = vi.fn(), create = vi.fn(() => ({ asset, mesh, dispose })), canvas = fakeCanvas();
    let proposal: GizmoProposal<ModelPlacementTarget> = { target: { kind: 'model', token: original.token, sceneId: f.overview,
      assetId: f.equipment, bindingId: model.binding.id }, position: model.binding.assetToProject.translation, enabled: true,
      manipulation: { mode: 'rotate', rotationXYZW: model.binding.assetToProject.rotationXYZW, uniformScale: model.binding.assetToProject.uniformScale } };
    const display = () => { const d = syntheticDisplay(project, f.overview, null, null, proposal);
      return { ...d, models: d.models.map(m => m.binding.assetId === f.equipment ? saved : m) }; };
    const viewport = sceneViewportFactory({ create, dispose: vi.fn() })(canvas.canvas as unknown as HTMLCanvasElement, () => {}, undefined, (target, position, manipulation) => {
      proposal = { target, position, manipulation, enabled: true }; viewport.update(display()); return true;
    });
    viewport.update(display()); viewport.setActive(true); canvas.show();
    const gizmo = tracker.gizmos.at(-1), orbit = tracker.controls.at(-1), camera = orbit.object.position.clone(), before = proposal;
    gizmo.dragging = true; gizmo.object.quaternion.set(...degreesRotation(['0', '0', '90'])); gizmo.dispatchEvent({ type: 'objectChange' });
    expect(asset.matrix).toEqual(placementMatrix(proposedPlacement(model.binding.assetToProject, proposal)));
    expect(inner.position.x).toBe(3); expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
    expect(create).toHaveBeenCalledOnce(); expect(orbit.object.position).toEqual(camera);
    canvas.canvas.fire('keydown', { key: 'Escape', preventDefault() {} }); expect(proposal).toEqual(before);
    expect(asset.matrix).toEqual(placementMatrix(model.binding.assetToProject)); expect(dispose).not.toHaveBeenCalled();
    viewport.dispose(); expect(dispose).toHaveBeenCalledOnce(); geometry.dispose(); material.dispose();
  });
  it('previews full model transforms/pins, restores exact rotation on Esc and turns every scale handle into uniform scale', () => {
    const project = createSyntheticProject(), original = syntheticDisplay(project, f.overview, null, null);
    const model = original.models.find(m => m.binding.assetId === f.equipment)!, canvas = fakeCanvas();
    let proposal: GizmoProposal<ModelPlacementTarget> = { target: { kind: 'model', token: original.token, sceneId: f.overview,
      assetId: f.equipment, bindingId: model.binding.id }, position: model.binding.assetToProject.translation, enabled: true,
      manipulation: { mode: 'rotate', rotationXYZW: [0, 0, 0, 1 - 2e-13], uniformScale: 1.5 } };
    const v = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, () => {}, undefined, (target, position, manipulation) => {
      proposal = { target, position, manipulation, enabled: true };
      v.update(syntheticDisplay(project, f.overview, null, null, proposal)); return true;
    });
    v.update(syntheticDisplay(project, f.overview, null, null, proposal)); v.setActive(true); canvas.show();
    const g = tracker.gizmos.at(-1), orbit = tracker.controls.at(-1), camera = orbit.object.position.clone(), before = proposal;
    expect(g.mode).toBe('rotate'); g.dragging = true; expect(orbit.enabled).toBe(false);
    g.object.quaternion.set(...degreesRotation(['0', '0', '90'])); g.dispatchEvent({ type: 'objectChange' });
    const rotated = syntheticDisplay(project, f.overview, null, null, proposal), placement = proposedPlacement(model.binding.assetToProject, proposal);
    const group = tracker.renderers[0].scene.children[0].children[original.models.findIndex(m => m.binding.assetId === f.equipment)];
    expect(group.matrix).toEqual(placementMatrix(placement));
    const anchor = project.resources.captions[f.shared]!.anchor; if (anchor.kind !== 'value' || anchor.value.kind !== 'asset') throw Error('anchor');
    const expectedPin = new THREE.Vector3(...anchor.value.positionAsset).applyMatrix4(placementMatrix(placement));
    expect(rotated.pins.find(p => p.id === f.shared)!.position).toEqual(expectedPin.toArray()); expect(orbit.object.position).toEqual(camera);
    canvas.canvas.fire('keydown', { key: 'Escape', preventDefault() {} }); expect(proposal).toEqual(before); expect(orbit.enabled).toBe(true);
    for (const axis of ['X', 'Y', 'Z', 'XY', 'YZ', 'XZ', 'XYZ']) {
      proposal = { ...before, manipulation: { ...before.manipulation!, mode: 'scale' } }; v.update(syntheticDisplay(project, f.overview, null, null, proposal));
      g.axis = axis; g.dragging = true;
      for (const component of axis.toLowerCase()) g.object.scale[component] *= 2;
      g.dispatchEvent({ type: 'objectChange' }); expect(proposal.manipulation!.uniformScale).toBe(3); expect(g.object.scale.toArray()).toEqual([3, 3, 3]);
      canvas.canvas.fire('keydown', { key: 'Escape', preventDefault() {} }); expect(proposal.manipulation!.uniformScale).toBe(1.5);
    }
    g.axis = 'X'; g.dragging = true; g.object.scale.x = -2; g.dispatchEvent({ type: 'objectChange' });
    expect(g.dragging).toBe(false); expect(proposal.manipulation!.uniformScale).toBe(1.5); expect(g.object.scale.toArray()).toEqual([1.5, 1.5, 1.5]);
    expect(project).toEqual(createSyntheticProject()); v.dispose();
  });
  it('previews model translation and anchored pins without changing source or camera; cancels/commits through the shared gizmo', () => {
    const s = new SyntheticSession(), doc = new RecordedDocument();
    const w = createDevelopmentWorkspace(doc.asDocument(), s, { viewportFactory: (canvas, changed, pin, model) => {
      Object.assign(canvas, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) });
      return createSyntheticViewport(canvas, changed, pin, model);
    } });
    const root = record(w.root), original = s.snapshot;
    s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: f.equipment }));
    expect(s.beginModelPlacement()).toBe(true); w.render();
    const g = tracker.gizmos.at(-1), camera = tracker.controls.at(-1), start = g.object.position.clone();
    const display = syntheticDisplay(original, s.sceneId, null, null);
    const index = display.models.findIndex(m => m.binding.assetId === f.equipment);
    const resident = tracker.renderers[0].scene.children[0].children[index] as THREE.Group;
    const previous = resident.matrix.clone();
    g.dragging = true; expect(camera.enabled).toBe(false);
    g.object.position.x += 3; g.dispatchEvent({ type: 'objectChange' });
    expect(s.snapshot).toBe(original); expect(s.modelPlacement!.coordinates[0]).toBe(String(start.x + 3));
    expect(resident.matrix.elements[12]).toBe(start.x + 3); expect(tracker.controls.at(-1)).toBe(camera);
    const draft = syntheticDisplay(original, s.sceneId, null, null, s.modelPlacementProposal());
    const pin = display.pins.find(p => p.id === f.shared)!;
    expect(draft.pins.find(p => p.id === f.shared)!.position[0]).toBeCloseTo(pin.position[0] + 3);
    expect(draft.bounds).toEqual(display.bounds); expect(draft.models).toEqual(display.models);
    expect(control(root, '配置を確定').disabled).toBe(true);
    labeled(root, '合成モデルの3D表示').fire('keydown', { key: 'Escape', preventDefault() {} });
    expect(resident.matrix).toEqual(previous); expect(g.object.position.toArray()).toEqual(start.toArray());
    g.dragging = true; g.object.position.z += 2; g.dispatchEvent({ type: 'objectChange' }); g.dragging = false;
    control(root, '配置を取り消す').fire('click'); expect(s.snapshot).toBe(original); expect(resident.matrix).toEqual(previous);
    expect(s.beginModelPlacement()).toBe(true); w.render();
    g.dragging = true; g.object.position.z += 2; g.dispatchEvent({ type: 'objectChange' }); g.dragging = false;
    control(root, '配置を確定').fire('click'); expect(s.modelPlacement).toBeNull();
    expect(s.snapshot.resources.captions).toEqual(original.resources.captions);
    expect(s.modelVersions.find(v => v.projection.bindingId === (s.snapshot.resources.assets[f.equipment]!.projection as any).value.bindingId)!.closure.binding.assetToProject.translation[2]).toBe(start.z + 2);
    w.dispose();
  });
  it.each(['perspective', 'orthographic'] as const)('uses Blender basic mouse navigation with actual Orbit (%s)', projection => {
    tracker.realOrbit = true;
    const canvas = fakeCanvas(); controlEventTarget(canvas.canvas as unknown as HTMLCanvasElement);
    const v = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, () => {});
    v.update(syntheticDisplay(createSyntheticProject(), f.overview, null, null)); v.setActive(true);
    v.camera({ kind: 'projection', projection });
    const orbit = tracker.controls.at(-1), camera = orbit.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    let starts = 0; orbit.addEventListener('start', () => starts++);
    const pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 1,
      clientX: 400, clientY: 300, pageX: 400, pageY: 300, preventDefault() {} };
    const drag = (modifiers: object) => {
      canvas.canvas.fire('pointerdown', { ...pointer, ...modifiers });
      canvas.canvas.fire('pointermove', { ...pointer, clientX: 430, clientY: 320, ...modifiers });
      canvas.canvas.fire('pointerup', { ...pointer, ...modifiers });
    };
    const initial = camera.position.clone(), initialTarget = orbit.target.clone();
    drag({ button: 0 }); drag({ button: 2 });
    expect(starts).toBe(0); expect(camera.position).toEqual(initial); expect(orbit.target).toEqual(initialTarget);
    drag({}); expect(starts).toBe(1); expect(camera.position).not.toEqual(initial);
    expect(orbit.target).toEqual(initialTarget); expect(camera.position.distanceTo(orbit.target)).toBeCloseTo(initial.distanceTo(initialTarget), 10);
    const rotated = camera.position.clone();
    drag({ shiftKey: true }); expect(starts).toBe(2); expect(orbit.target).not.toEqual(initialTarget);
    const delta = camera.position.clone().sub(rotated), targetDelta = orbit.target.clone().sub(initialTarget);
    delta.toArray().forEach((n, i) => expect(n).toBeCloseTo(targetDelta.toArray()[i]!, 10));
    const zoomMeasure = () => projection === 'orthographic' ? camera.zoom : camera.position.distanceTo(orbit.target);
    const pannedTarget = orbit.target.clone(), beforeZoom = zoomMeasure();
    drag({ ctrlKey: true }); expect(starts).toBe(3); expect(zoomMeasure()).not.toBe(beforeZoom);
    expect(orbit.target.distanceTo(pannedTarget)).toBeLessThan(1e-10);
    const beforeWheel = zoomMeasure();
    canvas.canvas.fire('wheel', { deltaY: -100, deltaMode: 0, ctrlKey: false, clientX: 400, clientY: 300, preventDefault() {} });
    expect(starts).toBe(4); expect(zoomMeasure()).not.toBe(beforeWheel); expect(orbit.target.distanceTo(pannedTarget)).toBeLessThan(1e-10);
    const beforeHide = v.capture!(); v.setActive(false); v.setActive(true);
    expect(tracker.controls.at(-1).mouseButtons).toEqual({ MIDDLE: THREE.MOUSE.ROTATE });
    expect(v.capture!()).toEqual(beforeHide); v.dispose();
  });
  it.each([false, true])('reserves placement before actual Orbit starts (Shift=%s), including tiny movement and cancellation', async shifted => {
    tracker.realOrbit = true;
    const doc = new RecordedDocument(), s = new SyntheticSession(); let v: ReturnType<typeof createSyntheticViewport>;
    const w = createDevelopmentWorkspace(doc.asDocument(), s, { viewportFactory: (canvas, changed, propose) => {
      controlEventTarget(canvas); return v = createSyntheticViewport(canvas, changed, propose);
    } });
    const root = record(w.root), canvas = labeled(root, '合成モデルの3D表示');
    const model = syntheticDisplay(s.snapshot, s.sceneId, null, null).models.find(m => m.binding.assetId === f.equipment)!;
    const world = new THREE.Vector3(1 / 3, 1 / 3, 0).applyMatrix4(placementMatrix(model.representation.representationToAsset))
      .applyMatrix4(placementMatrix(model.binding.assetToProject));
    v!.recall!({ camera: { position: [world.x, world.y, world.z + 4], target: world.toArray(), up: [0, 1, 0],
      projection: { kind: 'perspective', verticalFovRadians: 0.7 } }, background: { kind: 'solid', colorSrgb: [0.5, 0.5, 0.5] } });
    const orbit = tracker.controls.at(-1); let starts = 0; orbit.addEventListener('start', () => starts++);
    expect(s.pinContext().memory.addTargetId).toBeNull();
    if (!shifted) control(root, 'ピンを追加').fire('click');
    const original = s.snapshot, cameraPosition = orbit.object.position.toArray(), pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: 0, clientX: 400, clientY: 300, pageX: 400, pageY: 300, shiftKey: shifted, preventDefault() {} };
    canvas.fire('pointerdown', pointer); expect(orbit.enabled).toBe(false); expect(starts).toBe(0);
    canvas.fire('pointermove', { ...pointer, clientX: 401 }); expect(orbit.object.position.toArray()).toEqual(cameraPosition);
    canvas.fire('pointerup', { ...pointer, clientX: 401 }); await Promise.resolve();
    expect(starts).toBe(0); expect(s.snapshot).toBe(original); expect(s.pinPreviewAnchor).not.toBeNull();
    expect(s.pinPreviewAnchor).toMatchObject({ assetId: f.equipment });
    expect(orbit.enabled).toBe(true);
    const retained = s.pinCoordinates;
    for (const rejection of ['drag', 'multi', 'cancel', 'capture'] as const) {
      canvas.fire('pointerdown', pointer); expect(orbit.enabled).toBe(false);
      if (rejection === 'multi') {
        canvas.fire('pointerdown', { ...pointer, pointerId: 2, isPrimary: false });
        canvas.fire('pointerup', { ...pointer, pointerId: 2, isPrimary: false }); expect(orbit.enabled).toBe(false);
      } else if (rejection === 'drag') canvas.fire('pointermove', { ...pointer, clientX: 480 });
      else canvas.fire(rejection === 'cancel' ? 'pointercancel' : 'lostpointercapture', pointer);
      canvas.fire('pointerup', pointer); await Promise.resolve();
      expect(starts, rejection).toBe(0); expect(s.pinCoordinates, rejection).toBe(retained);
      expect(orbit.object.position.toArray()).toEqual(cameraPosition);
      expect(orbit.enabled, rejection).toBe(true);
    }
    // Finishing a handle drag cannot release a still-reserved placement sequence.
    const g = tracker.gizmos.at(-1); v!.setPinPointerActive!(true); g.dragging = true; g.dragging = false;
    expect(orbit.enabled).toBe(false); v!.setPinPointerActive!(false); expect(orbit.enabled).toBe(true);
    control(labeled(root, 'ピンの操作'), '取り消す').fire('click'); control(root, '操作を取り消す').fire('click');
    const cameraPointer = { ...pointer, button: 1, shiftKey: false };
    canvas.fire('pointerdown', cameraPointer); expect(starts).toBe(1);
    canvas.fire('pointermove', { ...cameraPointer, clientX: 430 }); canvas.fire('pointerup', cameraPointer);
    expect(orbit.object.position.toArray()).not.toEqual(cameraPosition); expect(s.snapshot).toBe(original); w.dispose();
  });
  it('moves a provisional pin with translation handles, blocks orbit, restores cancelled drag and confirms only explicitly', async () => {
    const doc = new RecordedDocument(), s = new SyntheticSession(); let v: ReturnType<typeof createSyntheticViewport>;
    const w = createDevelopmentWorkspace(doc.asDocument(), s, { viewportFactory: (canvas, changed, propose) => {
      Object.assign(canvas, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) });
      return v = createSyntheticViewport(canvas, changed, propose);
    } });
    const root = record(w.root), initial = s.snapshot;
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'target', assetId: f.equipment }));
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'add' }));
    const target = s.pinSurfaceTarget()!; s.acceptPinSurface(target, [0.5, 0.25, 0]); w.render();
    let g = tracker.gizmos.at(-1); expect(g.object).toBeDefined(); const origin = g.object.position.clone();
    g.dragging = true; expect(tracker.controls.at(-1).enabled).toBe(false);
    expect(control(root, '位置を確定').disabled).toBe(true);
    g.object.position.z += 3; g.dispatchEvent({ type: 'objectChange' });
    expect(s.snapshot).toBe(initial); expect(Number(s.pinCoordinates!.coordinates[2])).toBeCloseTo(2);
    labeled(root, '合成モデルの3D表示').fire('keydown', { key: 'Escape', preventDefault() {} });
    expect(g.object.position.toArray()).toEqual(origin.toArray()); expect(Number(s.pinCoordinates!.coordinates[2])).toBeCloseTo(0);
    expect(tracker.controls.at(-1).enabled).toBe(true); expect(control(root, '位置を確定').disabled).toBe(false);
    // Authored pointer-owner guard only; the mock does not emulate native handle hit-testing/event phases.
    const canvas = labeled(root, '合成モデルの3D表示');
    const pointer = { pointerId: 1, isPrimary: true, button: 0, clientX: 400, clientY: 300 };
    for (const interruption of ['multi', 'wrong-move', 'cancel', 'capture'] as const) {
      canvas.fire('pointerdown', pointer); g.dragging = true;
      g.object.position.z += 3; g.dispatchEvent({ type: 'objectChange' });
      expect(() => v!.capture!()).toThrow();
      if (interruption === 'multi') canvas.fire('pointerdown', { ...pointer, pointerId: 2, isPrimary: false });
      else if (interruption === 'wrong-move') canvas.fire('pointermove', { ...pointer, pointerId: 2, isPrimary: false });
      else canvas.fire(interruption === 'cancel' ? 'pointercancel' : 'lostpointercapture', pointer);
      expect(g.dragging, interruption).toBe(false); expect(g.object.position.toArray(), interruption).toEqual(origin.toArray());
      expect(Number(s.pinCoordinates!.coordinates[2]), interruption).toBeCloseTo(0); expect(s.snapshot).toBe(initial);
      if (interruption === 'multi') {
        expect(g.enabled).toBe(false); canvas.fire('pointerup', { ...pointer, pointerId: 2, isPrimary: false });
        await Promise.resolve(); expect(g.enabled).toBe(false);
      }
      canvas.fire('pointerup', pointer); await Promise.resolve(); expect(g.enabled).toBe(true);
    }
    v!.camera({ kind: 'projection', projection: 'orthographic' }); expect(g.disposed).toBe(true);
    g = tracker.gizmos.at(-1); expect(g.object.position.toArray()).toEqual(origin.toArray());
    g.dragging = true; g.object.position.z += 3; g.dispatchEvent({ type: 'objectChange' }); g.dragging = false;
    control(root, '位置を確定').fire('click'); expect(g.object).toBeUndefined();
    const caption = s.snapshot.resources.captions[s.memory.selectedCaptionId!]!;
    expect(caption.anchor).toMatchObject({ kind: 'value', value: { assetId: f.equipment, hitEvidence: { method: 'manual' } } });
    if (caption.anchor.kind !== 'value' || caption.anchor.value.kind !== 'asset') throw Error('anchor');
    expect(caption.anchor.value.positionAsset[2]).toBeCloseTo(2);
    const confirmed = s.snapshot; control(root, '位置を調整').fire('click');
    g = tracker.gizmos.at(-1); g.dragging = true; g.object.position.z += 3; g.dispatchEvent({ type: 'objectChange' }); g.dragging = false;
    control(labeled(root, 'ピンの操作'), '取り消す').fire('click'); control(root, '操作を取り消す').fire('click');
    expect(s.snapshot).toBe(confirmed); expect(g.object).toBeUndefined();
    w.dispose(); expect(g.disposed).toBe(true);
  });
  it('picks the current resident triangle with both transforms, perspective/orthographic clip, side, visibility and occlusion', () => {
    const s = new SyntheticSession(); s.acceptPin(planPinMode(s.pinContext(), { kind: 'target', assetId: f.equipment }));
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'add' })); const target = s.pinSurfaceTarget()!;
    const display = syntheticDisplay(s.snapshot, s.sceneId, null, null), model = display.models.find(m => m.binding.assetId === f.equipment)!;
    const assetPoint = new THREE.Vector3(1 / 3, 1 / 3, 0).applyMatrix4(placementMatrix(model.representation.representationToAsset));
    const world = assetPoint.clone().applyMatrix4(placementMatrix(model.binding.assetToProject));
    const canvas = fakeCanvas(), v = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, () => {});
    v.update(display); v.setActive(true); canvas.show();
    const look = (side: number) => v.recall!({ camera: { position: [world.x, world.y, world.z + side * 4], target: world.toArray(),
      up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 0.7 } }, background: { kind: 'solid', colorSrgb: [0.5, 0.5, 0.5] } });
    const hit = () => v.pick!(target, 400, 300);
    look(1);
    for (const projection of ['perspective', 'orthographic'] as const) {
      v.camera({ kind: 'projection', projection });
      hit()!.forEach((n, i) => expect(n).toBeCloseTo(assetPoint.toArray()[i]!, 9));
      const camera = tracker.controls.at(-1).object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      const oldNear = camera.near, oldFar = camera.far; camera.near = 5; camera.far = 8; camera.updateProjectionMatrix(); expect(hit()).toBe(null);
      camera.near = oldNear; camera.far = oldFar; camera.updateProjectionMatrix();
    }
    expect(v.pick!({ ...target, bindingId: 'stale' }, 400, 300)).toBe(null);
    expect(v.pick!(target, -1, 300)).toBe(null); expect(v.pick!(target, Number.NaN, 300)).toBe(null);
    v.recall!({ camera: { position: [world.x, world.y, world.z - 4], target: [world.x, world.y, world.z - 5], up: [0, 1, 0],
      projection: { kind: 'orthographic', verticalSpan: 4 } }, background: { kind: 'solid', colorSrgb: [0.5, 0.5, 0.5] } });
    expect(tracker.controls.at(-1).object.near).toBeLessThan(0);
    hit()!.forEach((n, i) => expect(n).toBeCloseTo(assetPoint.toArray()[i]!, 9));
    look(-1); expect(hit()).toBe(null);
    const double = resolveFixtureMaterial({ ...sourceMaterialIntent, appearance: { doubleSided: true } });
    v.update({ ...display, materials: { ...display.materials, [f.equipment]: double } }); expect(hit()).not.toBe(null);
    const hidden = resolveFixtureMaterial({ ...sourceMaterialIntent, appearance: { chroma: { keyColorSrgb: sourceColorSrgb, tolerance: 0, softness: 0 } } });
    v.update({ ...display, materials: { ...display.materials, [f.equipment]: hidden } }); expect(hit()).toBe(null);
    const cutoffZero = resolveFixtureMaterial({ ...sourceMaterialIntent, appearance: { doubleSided: true, chroma: { keyColorSrgb: sourceColorSrgb, tolerance: 0, softness: 0 } },
      compositing: { ...sourceMaterialIntent.compositing, coverage: { policy: 'mask', alphaCutoff: 0 } } });
    v.update({ ...display, materials: { ...display.materials, [f.equipment]: cutoffZero } }); expect(hit()).not.toBe(null);
    v.update({ ...display, materials: { ...display.materials, [f.equipment]: { issue: '未対応' } } }); expect(hit()).toBe(null);
    v.update(display); look(1);
    const group = tracker.renderers[0].scene.children[0] as THREE.Group;
    const index = display.models.findIndex(m => m.binding.assetId === target.assetId), asset = group.children[index] as THREE.Group, mesh = asset.children[0] as THREE.Mesh;
    const occluder = new THREE.Group(), otherMesh = mesh.clone(); occluder.matrix.copy(asset.matrix); occluder.matrix.elements[14]! += 1;
    occluder.matrixAutoUpdate = false; occluder.add(otherMesh);
    const resident = new Map([[target.assetId, { asset, mesh }], [f.structure, { asset: occluder, mesh: otherMesh }]]);
    expect(pickResidentSurface(display, target, resident, tracker.controls.at(-1).object, new THREE.Vector2(0, 0))).toBe(null);
    occluder.matrix.copy(asset.matrix); // Coincident surfaces cannot choose a winner by iteration order.
    expect(pickResidentSurface(display, target, resident, tracker.controls.at(-1).object, new THREE.Vector2(0, 0))).toBe(null);
    occluder.visible = false; expect(pickResidentSurface(display, target, resident, tracker.controls.at(-1).object, new THREE.Vector2(0, 0))).not.toBe(null);
    canvas.canvas.fire('webglcontextlost', { preventDefault() {} }); expect(hit()).toBe(null); v.dispose();
  });

  it('skips only proven chroma holes within the selected Asset and across occluders (injected coverage, not GPU evidence)', () => {
    const s = new SyntheticSession(); s.acceptPin(planPinMode(s.pinContext(), { kind: 'target', assetId: f.equipment }));
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'add' })); const target = s.pinSurfaceTarget()!;
    const display = syntheticDisplay(s.snapshot, s.sceneId, null, null), model = display.models.find(m => m.binding.assetId === target.assetId)!;
    const asset = new THREE.Group(), mesh = new THREE.Group(); asset.matrix.copy(placementMatrix(model.binding.assetToProject)); asset.matrixAutoUpdate = false; asset.add(mesh);
    const frontMaterial = new THREE.MeshStandardMaterial(), backMaterial = new THREE.MeshStandardMaterial(), otherMaterial = new THREE.MeshStandardMaterial();
    for (const material of [frontMaterial, backMaterial, otherMaterial]) patchHardChroma(material, { keyColorSrgb: [0, 0, 0], tolerance: 0 });
    const geometry = new THREE.PlaneGeometry(2, 2), front = new THREE.Mesh(geometry, frontMaterial), back = new THREE.Mesh(geometry, backMaterial);
    front.position.z = 1; mesh.add(front, back); asset.updateMatrixWorld(true);
    const other = new THREE.Group(), otherMesh = new THREE.Mesh(geometry, otherMaterial); other.matrix.copy(asset.matrix); other.matrixAutoUpdate = false;
    otherMesh.position.z = 2; other.add(otherMesh);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100), center = new THREE.Vector3(0, 0, 0).applyMatrix4(asset.matrix);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, 4)); camera.lookAt(center);
    const resident = new Map<string, { asset: THREE.Group; mesh: THREE.Object3D }>([[target.assetId, { asset, mesh }]]), ndc = new THREE.Vector2(0, 0);
    expect(pickResidentSurface(display, target, resident, camera, ndc)).toBeNull();
    const decisions = new Map([[frontMaterial, 'discarded'], [backMaterial, 'covered'], [otherMaterial, 'discarded']] as const);
    const coverage = vi.fn((_hit: unknown, material: THREE.Material) => decisions.get(material as THREE.MeshStandardMaterial) ?? 'unknown');
    expect(pickResidentSurface(display, target, resident, camera, ndc, coverage)?.[2]).toBeCloseTo(0);
    resident.set(f.structure, { asset: other, mesh: otherMesh });
    expect(pickResidentSurface(display, target, resident, camera, ndc, coverage)?.[2]).toBeCloseTo(0);
    decisions.set(otherMaterial, 'covered'); expect(pickResidentSurface(display, target, resident, camera, ndc, coverage)).toBeNull();
    decisions.delete(otherMaterial); expect(pickResidentSurface(display, target, resident, camera, ndc, coverage)).toBeNull();
    other.visible = false; decisions.set(frontMaterial, 'covered');
    expect(pickResidentSurface(display, target, resident, camera, ndc, coverage)?.[2]).toBeCloseTo(1);
    decisions.delete(frontMaterial); expect(pickResidentSurface(display, target, resident, camera, ndc, coverage)).toBeNull();
    geometry.dispose(); for (const material of [frontMaterial, backMaterial, otherMaterial]) material.dispose();
  });

  it('connects stationary release to preview/XYZ/confirm and rejects drag, multitouch, cancel, changed camera/rect and hidden host', async () => {
    const doc = new RecordedDocument(), s = new SyntheticSession(); let display: any, ready = true, dragging = false, epoch = 0, notify = () => {};
    let rect = { left: 10, top: 20, width: 800, height: 600 }, calls = 0;
    const workspace = createDevelopmentWorkspace(doc.asDocument(), s, { viewportFactory: (canvas, changed) => {
      Object.assign(canvas, { getBoundingClientRect: () => rect }); notify = changed;
      return { update: d => { display = d; }, setActive() {}, camera() {}, retry() {}, dispose() {},
        capture: () => ({ camera: { position: [0, 0, 4], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 0.7 } },
          background: { kind: 'solid', colorSrgb: [0.5, 0.5, 0.5] } }),
        pick: (_target, x, y) => { calls++; expect([x, y]).toEqual([400, 300]); return [0.5, 0.25, 0]; },
        pickCreation: (targets, x, y) => { calls++; expect([x, y]).toEqual([400, 300]); return { target: targets.find(t => t.assetId === f.equipment)!, position: [0.5, 0.25, 0] }; },
        read: () => ({ token: 'view', pickToken: String(epoch), ready, dragging, issue: null, projection: 'perspective', axis: null,
          pins: [], preview: display?.preview ? { x: 400, y: 300, visible: true } : undefined }) };
    } });
    const root = record(workspace.root), canvas = labeled(root, '合成モデルの3D表示');
    control(root, 'ピンを追加').fire('click');
    const initial = s.snapshot, event = { pointerId: 1, isPrimary: true, button: 0, clientX: 410, clientY: 320 };
    canvas.fire('pointerdown', event);
    control(labeled(root, 'ピンの操作'), '取り消す').fire('click'); control(root, '操作を取り消す').fire('click');
    canvas.fire('pointerup', event); await Promise.resolve();
    expect(calls).toBe(0); expect(s.pinCoordinates).toBeNull(); expect(s.snapshot).toBe(initial);
    control(root, 'ピンを追加').fire('click');
    canvas.fire('pointerdown', event); dragging = true; notify(); canvas.fire('pointerup', event); dragging = false; notify(); await Promise.resolve();
    expect(calls).toBe(1); expect(s.snapshot).toBe(initial); expect(s.pinCoordinates?.coordinates).toEqual(['0.5', '0.25', '0']);
    const ghost = descendants(root).find(n => n.className === 'lv-development-pin-preview')!; expect(ghost.hidden).toBe(false);
    const before = display.preview; const coords = labeled(root, 'ピン座標・開発用'), x = labeled(coords, 'X'); x.value = '1'; x.fire('input');
    expect(display.preview).not.toEqual(before); expect(s.snapshot).toBe(initial);
    const retained = s.pinCoordinates;
    for (const reject of ['drag', 'multi', 'cancel', 'capture', 'camera', 'resize', 'context', 'hidden'] as const) {
      canvas.fire('pointerdown', event);
      if (reject === 'drag') canvas.fire('pointermove', { ...event, clientX: 430 });
      if (reject === 'multi') { canvas.fire('pointerdown', { ...event, pointerId: 2, isPrimary: false }); canvas.fire('pointerup', { ...event, pointerId: 2 }); }
      if (reject === 'cancel') canvas.fire('pointercancel', event);
      if (reject === 'capture') canvas.fire('lostpointercapture', event);
      if (reject === 'camera') epoch++;
      if (reject === 'resize') rect = { ...rect, width: rect.width + 10 };
      if (reject === 'context') { ready = false; notify(); ready = true; notify(); }
      if (reject === 'hidden') { root.hidden = true; workspace.render(); root.hidden = false; workspace.render(); }
      canvas.fire('pointerup', event); await Promise.resolve(); expect(calls, reject).toBe(1); expect(s.pinCoordinates).toBe(retained);
    }
    control(labeled(root, 'ピンの操作'), '取り消す').fire('click'); control(root, '操作を取り消す').fire('click');
    expect(s.snapshot).toBe(initial); expect(ghost.hidden).toBe(true);
    rect = { ...rect, width: 800 };
    const shifted = { ...event, shiftKey: true };
    labeled(root, '追加色').value = '#345678'; labeled(root, '追加色').fire('input');
    canvas.fire('pointerdown', shifted);
    labeled(root, '追加色').value = '#57758b'; labeled(root, '追加色').fire('input');
    canvas.fire('pointerup', shifted); await Promise.resolve(); expect(s.pinCoordinates).toBeNull(); expect(calls).toBe(1);
    labeled(root, '追加色').value = '#345678'; labeled(root, '追加色').fire('input');
    canvas.fire('pointerdown', { ...shifted, ctrlKey: true }); canvas.fire('pointerup', { ...shifted, ctrlKey: true }); await Promise.resolve();
    expect(s.pinCoordinates).toBeNull();
    canvas.fire('pointerdown', shifted); canvas.fire('pointerup', shifted); await Promise.resolve();
    expect(s.snapshot).toBe(initial); expect(s.pinCoordinateContext().mode?.kind).toBe('add');
    control(root, '位置を確定').fire('click'); expect(Object.keys(s.snapshot.resources.captions)).toHaveLength(3); expect(ghost.hidden).toBe(true);
    expect(s.snapshot.resources.captions[s.memory.selectedCaptionId!]!.anchor).toMatchObject({ kind: 'value', value: { positionAsset: [0.5, 0.25, 0] } });
    expect(s.snapshot.colors[s.memory.selectedCaptionId!]).toEqual(value('#345678'));
    workspace.dispose();
  });
  it('projects pins only once and fits all eight semantic corners, independent of pins and color filters', () => {
    const project = createSyntheticProject(), display = syntheticDisplay(project, f.overview, null, f.shared);
    const model = display.models.find(m => m.binding.assetId === f.equipment)!;
    expect(display.pins.find(p => p.id === f.shared)!.position).toEqual(model.binding.assetToProject.translation);
    expect(display.pins.find(p => p.id === f.shared)!.position).not.toEqual(new THREE.Vector3(0, 0, 0)
      .applyMatrix4(placementMatrix(model.representation.representationToAsset)).applyMatrix4(placementMatrix(model.binding.assetToProject)).toArray());
    const filtered = syntheticDisplay(project, f.overview, [], f.shared); expect(filtered.pins).toHaveLength(0);
    expect(filtered.models).toEqual(display.models); expect(filtered.bounds).toEqual(display.bounds); expect(filtered.selectedId).toBe(f.shared);
    const transformed = projectBounds(model.representation.logicalBoundsAsset, model.binding.assetToProject);
    const minOnly = new THREE.Vector3(...model.representation.logicalBoundsAsset.min).applyMatrix4(placementMatrix(model.binding.assetToProject));
    expect(transformed.min[0]).toBeLessThan(minOnly.x); // Rotation means min/max endpoints alone are wrong.
    for (const aspect of [0.25, 1, 3]) {
      const pose = fittedPose(display.bounds!, defaultPose(), aspect), camera = new THREE.PerspectiveCamera(45, aspect, 0.00001, 10000);
      camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(new THREE.Vector3(...pose.target)); camera.updateMatrixWorld(true);
      for (const x of [display.bounds!.min[0], display.bounds!.max[0]]) for (const y of [display.bounds!.min[1], display.bounds!.max[1]]) for (const z of [display.bounds!.min[2], display.bounds!.max[2]]) {
        const p = new THREE.Vector3(x, y, z).project(camera); expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1);
      }
    }
    const ortho = switchProjection(defaultPose(), 'orthographic'); const roundtrip = switchProjection(ortho, 'perspective');
    roundtrip.position.forEach((n, i) => expect(n).toBeCloseTo(defaultPose().position[i]!));
    if (ortho.projection.kind !== 'orthographic') throw new Error('expected orthographic');
    const zoomed = { ...ortho, projection: { ...ortho.projection, verticalSpan: ortho.projection.verticalSpan / 4 } };
    const perspective = switchProjection(zoomed, 'perspective'); expect(perspective.position).toEqual(zoomed.position);
    expect(switchProjection(perspective, 'orthographic').projection).toEqual(zoomed.projection);
    expect(fittedPose(display.bounds!, defaultPose(), 1, '+y').up).toEqual([0, 0, -1]);
    expect(fittedPose(display.bounds!, defaultPose(), 1, '-y').up).toEqual([0, 0, 1]);
  });

  it('keeps map2 unplaced records off the 3D view and applies pinScale without changing placement', () => {
    const p = createSyntheticProject(), original = syntheticDisplay(p, f.overview, null, null);
    const scaled = { ...p, semanticProfile: 'map2' as const, resources: { ...p.resources, assets: { ...p.resources.assets,
      [f.equipment]: { ...p.resources.assets[f.equipment]!, pinScale: value(2) } } } };
    const pin = syntheticDisplay(scaled, f.overview, null, null).pins.find(p => p.id === f.shared)!;
    expect(pin.scale).toBe(2); expect(pin.position).toEqual(original.pins.find(p => p.id === f.shared)!.position);
    const ambiguous = { ...scaled, resources: { ...scaled.resources, assets: { ...scaled.resources.assets,
      [f.equipment]: { ...scaled.resources.assets[f.equipment]!, pinScale: { kind: 'unresolved' as const, reason: 'conflict' as const } } } } };
    const provisional = syntheticDisplay(ambiguous, f.overview, null, null).pins.find(p => p.id === f.shared)!;
    expect(provisional.scale).toBe(1); expect(provisional.notice).toContain('仮表示'); expect(provisional.status).toBe('needsReview');
    for (const anchor of [{ kind: 'unplaced' as const }, { kind: 'unplaced' as const, ownerAssetId: f.equipment }]) {
      const unplaced = { ...scaled, resources: { ...scaled.resources, captions: { ...scaled.resources.captions,
        [f.shared]: { ...scaled.resources.captions[f.shared]!, anchor: value(anchor) } } } };
      expect(syntheticDisplay(unplaced, f.overview, null, f.shared).pins.some(p => p.id === f.shared)).toBe(false);
      expect(unplaced.resources.captions[f.shared]!.body).toBe(p.resources.captions[f.shared]!.body);
    }
  });
  it('keeps compatibility-only review pins at their authored position/color, but omits hidden or conflicting owners', () => {
    const p = createSyntheticProject(), changed = { ...p, resources: { ...p.resources, assets: { ...p.resources.assets,
      [f.equipment]: { ...p.resources.assets[f.equipment]!, projection: value(syntheticVersions.filter(v => v.assetId === f.equipment)[1]!.projection) } } } };
    const pins = syntheticDisplay(changed, f.overview, null, null).pins;
    expect(pins.map(p => p.id)).toContain(f.shared);
    const original = syntheticDisplay(p, f.overview, null, null).pins.find(pin => pin.id === f.shared)!;
    expect(pins.find(pin => pin.id === f.shared)).toMatchObject({ color: original.color, position: original.position, status: 'needsReview' });
    expect(syntheticDisplay(changed, f.overview, [], null).pins).toEqual([]);
    expect(syntheticDisplay(changed, f.overview, null, null, undefined, [f.equipment]).pins.map(pin => pin.id)).not.toContain(f.shared);
    const conflict = { ...changed, resources: { ...changed.resources, assets: { ...changed.resources.assets,
      [f.equipment]: { ...changed.resources.assets[f.equipment]!, projection: { kind: 'unresolved' as const, reason: 'conflict' as const } } } } };
    expect(syntheticDisplay(conflict, f.detail, null, null).models).toHaveLength(0);
    expect(syntheticDisplay(conflict, f.detail, null, null).pins).toHaveLength(0);
    const anchor = changed.resources.captions[f.shared]!.anchor;
    if (anchor.kind !== 'value' || anchor.value.kind !== 'asset') throw Error('fixture anchor');
    for (const unavailable of [
      { kind: 'unresolved' as const, reason: 'conflict' as const },
      value({ ...anchor.value, assetFrameId: 'wrong-frame' }),
    ]) {
      const invalid = { ...changed, resources: { ...changed.resources, captions: { ...changed.resources.captions,
        [f.shared]: { ...changed.resources.captions[f.shared]!, anchor: unavailable } } } };
      expect(syntheticDisplay(invalid, f.detail, null, null).pins).toHaveLength(0);
    }
    expect(changed.resources.captions).toBe(p.resources.captions);
  });

  it('adds a late ready model without replacing existing residents or refitting the camera; pending geometry cannot issue pick readiness',()=>{
    const base=syntheticDisplay(createSyntheticProject(),f.overview,null,null),rows=base.models.slice(0,2).map(m=>({...m,shape:'saved-glb' as const})) as ValidationModelClosure[];
    let loaded=false,notify!:()=>void;const releases:ReturnType<typeof vi.fn>[]=[],surfaces:THREE.Group[]=[];
    const canvas=fakeCanvas(),create=vi.fn(()=>{const asset=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());asset.add(mesh);surfaces.push(asset);
      const dispose=vi.fn(()=>{asset.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();});releases.push(dispose);return{asset,mesh,dispose};});
    const v=sceneViewportFactory({create,dispose(){},gsDemand(){throw Error('A Mesh is not a GS demand');},state:m=>({phase:m.representation.id===rows[0]!.representation.id||loaded?'ready':'loading'}),subscribe(changed){notify=changed;return()=>{};}},createGsResidency(500,44500))(canvas.canvas as unknown as HTMLCanvasElement,()=>{});
    v.update({...base,models:rows});v.setActive(true);canvas.show();expect(create).toHaveBeenCalledOnce();expect(v.read()).toMatchObject({ready:false,loading:true});
    v.camera({kind:'axis',axis:'+x'});const pose=v.capture!(),control=tracker.controls.at(-1);
    loaded=true;notify();expect(create).toHaveBeenCalledTimes(2);expect(releases[0]).not.toHaveBeenCalled();expect(v.capture!()).toEqual(pose);expect(tracker.controls.at(-1)).toBe(control);expect(v.read().ready).toBe(true);
    expect((tracker.renderers[0].scene.children[0] as THREE.Group).children).toEqual(surfaces);v.dispose();expect(releases.every(release=>release.mock.calls.length===1)).toBe(true);
  });
  it('shows a ready mesh while GS sources are pending and admits the full exact GS demand before creating any GS resident',()=>{
    const base=syntheticDisplay(createSyntheticProject(),f.overview,null,null),model=base.models[0]!;
    const mesh={...model,shape:'saved-glb' as const} as ValidationModelClosure,gs={...base.models[1]!,shape:'saved-gs' as const,representation:{...base.models[1]!.representation,contentKind:'gaussianSplat'}} as ValidationModelClosure;
    let pending=true,notify!:()=>void;const pool=createGsResidency(500,44500),admit=vi.spyOn(pool,'admit'),create=vi.fn(()=>{const asset=new THREE.Group(),surface=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());asset.add(surface);return{asset,mesh:surface,dispose(){asset.removeFromParent();surface.geometry.dispose();surface.material.dispose();}};});
    const canvas=fakeCanvas(),v=sceneViewportFactory({create,dispose(){},state:m=>({phase:m.representation.contentKind==='gaussianSplat'&&pending?'loading':'ready'}),gsPending:()=>pending,
      gsDemand:m=>m.representation.contentKind==='gaussianSplat'?{count:501,degree:4}:null,subscribe(changed){notify=changed;return()=>{};}},pool)(canvas.canvas as unknown as HTMLCanvasElement,()=>{});
    v.update({...base,models:[mesh,gs]});v.setActive(true);canvas.show();expect(create).toHaveBeenCalledOnce();expect(admit).not.toHaveBeenCalled();
    pending=false;notify();expect(admit).toHaveBeenCalled();expect(create).toHaveBeenCalledOnce();expect(v.read().ready).toBe(false);expect(v.read().retryAvailable).toBe(true);v.dispose();
  });
  it('retains an admitted GS view while the next complete target is unknown and never reacquires on an inactive cache notification',()=>{
    const base=syntheticDisplay(createSyntheticProject(),f.overview,null,null),source=base.models[0]!;
    const model=(key:string):ReadonlyRenderModel=>({shape:'render-gs',key,assetId:key,assetToProject:source.binding.assetToProject,representation:{...source.representation,contentKind:'gaussianSplat'} as ReadonlyRenderModel['representation']});
    const a=model('A'),b=model('B'),first={...base,models:[a],readOnly:true as const,pinEdit:undefined,modelEdit:undefined,preview:undefined},next={...first,sceneId:'next',models:[a,b]};
    let pending=true,notify!:()=>void;const pool=createGsResidency(500,44500),admit=vi.spyOn(pool,'admit'),canvas=fakeCanvas(),create=vi.fn();
    const v=sceneViewportFactory({create,dispose(){},state:m=>({phase:'key'in m&&m.key==='B'&&pending?'loading':'ready'}),gsPending:models=>pending&&models.some(m=>'key'in m&&m.key==='B'),
      gsDemand:m=>({count:'key'in m&&m.key==='A'?200:400,degree:4}),subscribe(changed){notify=changed;return()=>{};}},pool)(canvas.canvas as unknown as HTMLCanvasElement,()=>{});
    v.update(first);const intent=admit.mock.results[0]!.value;v.update(next);expect(v.read().display).toBe(first);expect(intent.active).toBe(true);expect(create).not.toHaveBeenCalled();
    v.setActive(false);const calls=admit.mock.calls.length;pending=false;notify();expect(admit).toHaveBeenCalledTimes(calls);const available=pool.admit([{count:500,degree:4}]);available.cancel();
    v.setActive(true);expect(admit.mock.calls.at(-1)![0]).toEqual([{count:200,degree:4},{count:400,degree:4}]);expect(v.read().display).toBe(first);expect(v.read().ready).toBe(false);v.dispose();
  });
  it('initializes after measurable attachment, uses both transforms, retains pose through updates/Scenes and releases on hide', () => {
    let reentered = false;
    const canvas = fakeCanvas(), viewport = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, () => {
      if (!reentered && viewport.read().ready) { reentered = true; viewport.setActive(true); }
    }), p = createSyntheticProject();
    viewport.update(syntheticDisplay(p, f.overview, null, null)); viewport.setActive(true);
    expect(tracker.renderers).toHaveLength(0); canvas.show(); expect(viewport.read().ready).toBe(true);
    expect(reentered).toBe(true); expect(tracker.raf.size).toBe(1);
    const renderer = tracker.renderers[0], group = renderer.scene.children[0] as THREE.Group;
    const first = group.children[0]!.children[0]!, c = syntheticDisplay(p, f.overview, null, null).models[0]!;
    expect(first.matrixWorld.elements).toEqual(placementMatrix(c.binding.assetToProject).multiply(placementMatrix(c.representation.representationToAsset)).elements);
    expect((first as THREE.Mesh).material).toMatchObject({ side: THREE.FrontSide, transparent: false });
    viewport.camera({ kind: 'axis', axis: '+x' }); viewport.camera({ kind: 'projection', projection: 'orthographic' });
    const camera = tracker.controls.at(-1).object as THREE.OrthographicCamera; camera.zoom = 2;
    tracker.controls.at(-1).dispatchEvent({ type: 'change' }); expect(viewport.read().axis).toBeNull();
    const pose = viewport.capture!().camera;
    viewport.update(syntheticDisplay({ ...p, state: { ...p.state, token: 'new' }, resources: { ...p.resources, token: 'new' } }, f.overview, [], null));
    expect(viewport.capture!().camera).toEqual(pose);
    viewport.update(syntheticDisplay(p, f.detail, null, null)); viewport.update(syntheticDisplay(p, f.overview, null, null));
    expect(viewport.capture!().camera).toEqual(pose);
    viewport.camera({ kind: 'projection', projection: 'perspective' });
    const orbit = tracker.controls.at(-1), cam = orbit.object as THREE.PerspectiveCamera;
    cam.position.set(0, 0, 10000); orbit.update(); orbit.dispatchEvent({ type: 'change' });
    expect(cam.far).toBeGreaterThan(cam.position.distanceTo(orbit.target));
    viewport.setActive(false); expect(renderer.disposed).toBe(true); expect(viewport.read().ready).toBe(false); expect(tracker.raf.size).toBe(0);
    viewport.setActive(true); expect(viewport.read().ready).toBe(true); viewport.dispose();
    expect(tracker.renderers.every(r => r.disposed)).toBe(true); expect(tracker.controls.every(c => c.disposed)).toBe(true);
  });

  it('updates exact fixture material without fitting the camera; binary coverage never becomes fractional depth blending', () => {
    const canvas = fakeCanvas(), v = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, () => {});
    const display = syntheticDisplay(createSyntheticProject(), f.overview, null, null), assetId = display.models[0]!.binding.assetId;
    v.update(display); v.setActive(true); canvas.show(); v.camera({ kind: 'axis', axis: '+x' }); const pose = v.capture!();
    const models = () => tracker.renderers[0].scene.children[0] as THREE.Group;
    const mesh = () => models().children[0]!.children[0] as THREE.Mesh;
    expect(mesh().material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const appearance = resolveFixtureMaterial({ ...sourceMaterialIntent, appearance: { lighting: 'unlit', doubleSided: true, baseColorSrgb: [0.1234567, 0.5, 1] } });
    v.update({ ...display, materials: { ...display.materials, [assetId]: appearance } });
    expect(v.capture!()).toEqual(pose); expect(mesh().material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(mesh().material).toMatchObject({ side: THREE.DoubleSide, visible: true, transparent: false, opacity: 1, depthWrite: true });
    expect((mesh().material as THREE.MeshBasicMaterial).color.toArray()).toEqual(appearance.colorLinear);
    v.update({ ...display, materials: { ...display.materials, [assetId]: resolveFixtureMaterial({ ...sourceMaterialIntent,
      appearance: { chroma: { keyColorSrgb: sourceColorSrgb, tolerance: 0, softness: 0 } } }) } });
    expect(mesh().material).toMatchObject({ visible: false, transparent: false, opacity: 1, depthWrite: true });
    expect(v.capture!()).toEqual(pose); const before = models().children.length;
    v.update({ ...display, materials: { ...display.materials, [assetId]: { issue: '半透明の表示は未接続です。' } } });
    expect(models().children).toHaveLength(before - 1); expect(v.read().notice).toContain('半透明');
    expect(v.read().ready).toBe(true); expect(v.capture!()).toEqual(pose); v.dispose();
  });

  it('applies only background with exact Scene memory, preserving camera/axis/Orbit/gizmo and rolling back renderer failures', () => {
    const canvas = fakeCanvas(), v = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, () => {});
    const p = createSyntheticProject(), a = syntheticDisplay(p, f.overview, null, null), b = syntheticDisplay(p, f.detail, null, null);
    v.update(a); v.setActive(true); canvas.show(); v.camera({ kind: 'axis', axis: '+x' });
    const renderer = tracker.renderers.at(-1), controls = tracker.controls.at(-1), gizmo = tracker.gizmos.at(-1), camera = v.capture!().camera;
    const models = renderer.scene.children[0], before = v.read(), color = { kind: 'solid' as const, colorSrgb: [0.123456789, 0.42, 0.8] as const };
    v.setBackground!(color); expect(v.capture!()).toEqual({ camera, background: color });
    expect(v.read()).toMatchObject({ axis: '+x', pickToken: before.pickToken }); expect(v.read().token).not.toBe(before.token);
    expect(tracker.controls.at(-1)).toBe(controls); expect(tracker.gizmos.at(-1)).toBe(gizmo); expect(renderer.scene.children[0]).toBe(models);
    expect(renderer.scene.background.r).toBeCloseTo(((color.colorSrgb[0] + 0.055) / 1.055) ** 2.4, 10);
    const oldColor = renderer.scene.background, render = vi.spyOn(renderer, 'render');
    const receiptColor = { kind: 'solid' as const, colorSrgb: [0, 0, 0] as const }, originalToken = v.read().token;
    expect(() => v.setBackground!(receiptColor, () => {
      expect(v.capture!().background).toEqual(receiptColor); throw Error('exact receipt failure');
    })).toThrow('exact receipt failure');
    expect(v.read().token).toBe(originalToken); expect(v.capture!().background).toEqual(color);
    expect(renderer.scene.background).toBe(oldColor);
    render.mockImplementationOnce(() => { throw Error('background render failure'); });
    expect(() => v.setBackground!({ kind: 'solid', colorSrgb: [1, 0, 0] })).toThrow('background render failure');
    expect(v.capture!()).toEqual({ camera, background: color }); expect(renderer.scene.background).toBe(oldColor);
    expect(v.read().ready).toBe(true); expect(tracker.controls.at(-1)).toBe(controls);
    expect(() => v.setBackground!({ kind: 'solid', colorSrgb: [2, 0, 0] })).toThrow(); expect(renderer.scene.background).toBe(oldColor);
    v.update(b); v.update(a); expect(v.capture!().background).toEqual(color);
    render.mockImplementationOnce(() => { throw Error('apply failure'); }).mockImplementationOnce(() => { throw Error('rollback failure'); });
    expect(() => v.setBackground!({ kind: 'solid', colorSrgb: [0, 0, 0] })).toThrow('apply failure');
    expect(v.read()).toMatchObject({ ready: false }); expect(v.read().issue).toContain('rollback failure');
    v.retry(); expect(v.capture!().background).toEqual(color); v.dispose();
  });

  it('shows context/init failure with recoverable metadata and no automatic retry', () => {
    const canvas = fakeCanvas(), viewport = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, () => {});
    viewport.update(syntheticDisplay(createSyntheticProject(), f.overview, null, null)); viewport.setActive(true); tracker.fail = true;
    canvas.show(); expect(viewport.read().ready).toBe(false); expect(viewport.read().issue).toContain('保持');
    tracker.fail = false; viewport.setActive(true); expect(viewport.read().ready).toBe(false);
    viewport.retry(); expect(viewport.read().ready).toBe(true);
    canvas.canvas.fire('webglcontextlost', { preventDefault() {} }); expect(viewport.read().ready).toBe(false);
    expect(tracker.raf.size).toBe(0); expect(() => viewport.retry()).toThrow('復旧を待って');
    canvas.canvas.fire('webglcontextrestored'); expect(viewport.read().ready).toBe(false);
    viewport.retry(); expect(viewport.read().ready).toBe(true); viewport.dispose();
  });

  it('captures exact FOV, actual ortho zoom and sRGB, with entry only on Scene entry, not refresh/reactivation', () => {
    const canvas = fakeCanvas(), v = createSyntheticViewport(canvas.canvas as unknown as HTMLCanvasElement, () => {});
    const p = createSyntheticProject(), a = syntheticDisplay(p, f.overview, null, null), b = syntheticDisplay(p, f.detail, null, null);
    const payload = { camera: { position: [2, 3, 10] as const, target: [0, 0, 0] as const, up: [0, 1, 0] as const,
      projection: { kind: 'perspective' as const, verticalFovRadians: 0.63 } }, background: { kind: 'solid' as const, colorSrgb: [0.1234567, 0.4, 0.83] as const } };
    v.update({ ...a, entry: { kind: 'ready', payload } }); v.setActive(true); canvas.show(390, 700);
    expect(v.capture!()).toEqual(payload); expect(tracker.controls.at(-1).object.fov).toBeCloseTo(THREE.MathUtils.radToDeg(0.63));
    const rgb = tracker.renderers.at(-1).scene.background;
    expect(rgb.r).toBeCloseTo(((payload.background.colorSrgb[0] + 0.055) / 1.055) ** 2.4, 10);
    v.camera({ kind: 'projection', projection: 'orthographic' }); const orbit = tracker.controls.at(-1);
    expect(canvas.canvas.style.touchAction).toBe('none');
    orbit.object.zoom = 3; orbit.dispatchEvent({ type: 'change' });
    const moved = v.capture!(); expect(moved.camera.projection).toEqual({ kind: 'orthographic', verticalSpan: (orbit.object.top - orbit.object.bottom) / 3 });
    v.update({ ...a, token: 'received', entry: { kind: 'ready', payload } }); expect(v.capture!()).toEqual(moved);
    v.setActive(false); v.setActive(true); expect(v.capture!()).toEqual(moved);
    v.update(b); v.update({ ...a, entry: { kind: 'ready', payload } }); expect(v.capture!()).toEqual(payload);
    v.update({ ...b, entry: { kind: 'blocked', reason: '開始時の視点を確認' } }); expect(v.capture!()).toEqual(payload);
    expect(v.read()).toMatchObject({ ready: true, notice: '開始時の視点を確認' });
    expect(() => v.recall!({ ...payload, camera: { ...payload.camera, up: [0, 0, 0] } })).toThrow();
    const oldControls = tracker.controls.at(-1), oldCamera = oldControls.object, oldBackground = tracker.renderers.at(-1).scene.background.clone();
    expect(() => v.recall!({ ...payload, camera: { ...payload.camera, position: [1e160, 0, 0] }, background: { kind: 'solid', colorSrgb: [1, 0, 0] } })).toThrow();
    expect(oldControls.disposed).toBe(false); expect(tracker.controls.at(-1).object).toBe(oldCamera);
    expect(canvas.canvas.style.touchAction).toBe('none');
    expect(tracker.renderers.at(-1).scene.background).toEqual(oldBackground); expect(v.read().ready).toBe(true);
    expect(v.capture!()).toEqual(payload); v.dispose();
  });

  it('connects pin selection and view controls, while camera dragging blocks Scene changes without cancelling drafts', () => {
    const doc = new RecordedDocument(); let display: any, dragging = false, ready = false, notified = () => {}; const actions: any[] = [];
    const workspace = createDevelopmentWorkspace(doc.asDocument(), new SyntheticSession(), { viewportFactory: (_canvas, changed) => {
      notified = changed; return { update: d => { display = d; }, setActive() {}, read: () => ({ token: 'camera', display, ready, issue: null,
        dragging, projection: 'perspective', axis: null, pins: display.pins.map((p: any) => ({ id: p.id, x: 10, y: 10, visible: true })) }),
      camera: intent => actions.push(intent), retry() {}, dispose() {} };
    } });
    const root = record(workspace.root), stage = labeled(root, '3D表示');
    expect(workspace.session.displayReady).toBe(false); ready = true; notified();
    expect(workspace.session.displayReady).toBe(true);
    expect(descendants(root).some(n => n.textContent.startsWith('3D描画・ピン配置は未接続'))).toBe(false);
    const list = labeled(root, 'キャプション一覧'); list.clientHeight = 100; list.scrollTop = 0;
    list.children[0]!.offsetTop = 250; list.children[0]!.offsetHeight = 44;
    control(stage, '設備の確認箇所').fire('click'); expect(workspace.session.memory.selectedCaptionId).toBe(f.shared);
    expect(list.scrollTop).toBe(194); expect(workspace.session.memory.listScrollTop).toBe(194);
    list.scrollTop = 0; list.fire('scroll'); workspace.render(); expect(list.scrollTop).toBe(0);
    control(stage, '設備の確認箇所').fire('click'); expect(list.scrollTop).toBe(194);
    const pin = (id: string) => descendants(stage).find(n => n.className === 'lv-development-pin' && n.textContent === id)!;
    pin('入口の記録').fire('click'); expect(workspace.session.windowMemory.retained).toEqual([f.shared, f.second]);
    pin('設備の確認箇所').fire('click'); expect(workspace.session.windowMemory.retained).toEqual([f.shared, f.second]);
    control(root, '全体表示').fire('click'); expect(actions).toEqual([{ kind: 'fit' }]);
    control(root, '視点').fire('click'); control(root, '+Y').fire('click'); expect(actions.at(-1)).toEqual({ kind: 'axis', axis: '+y' });
    dragging = true; notified(); expect(control(labeled(root, 'シーン'), '設備の確認').disabled).toBe(true); expect(control(root, '全体表示').disabled).toBe(true);
    dragging = false; notified(); expect(control(labeled(root, 'シーン'), '設備の確認').disabled).toBe(false);
    workspace.session.acceptModel(planModelList(workspace.session.modelContext(), { kind: 'membership', assetId: f.equipment, included: false })); workspace.render();
    expect(display.pins.map((p: any) => p.id)).not.toContain(f.shared); expect(workspace.session.memory.selectedCaptionId).toBe(f.shared);
    workspace.dispose();
  });
});
