import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSyntheticProject, fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { defaultPose, fittedPose, placementMatrix, projectBounds, switchProjection, syntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { createSyntheticViewport } from '../../src/harness/projectScene/viewport';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import { value } from '../../src/scene/types';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';

const tracker = vi.hoisted(() => ({ renderers: [] as any[], controls: [] as any[], resize: [] as (() => void)[],
  raf: new Map<number, () => void>(), nextRaf: 0, fail: false }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    disposed = false; scene: any; camera: any; frames = 0;
    constructor() { if (tracker.fail) throw new Error('synthetic WebGL refusal'); tracker.renderers.push(this); }
    setPixelRatio() {} setSize() {}
    render(scene: any, camera: any) { this.scene = scene; this.camera = camera; scene.updateMatrixWorld(true); this.frames++; }
    dispose() { this.disposed = true; }
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const three = await import('three');
  return { OrbitControls: class extends three.EventDispatcher<any> {
    target = new three.Vector3(); disposed = false;
    constructor(readonly object: any, readonly canvas: HTMLCanvasElement) { super(); canvas.style.touchAction = 'none'; tracker.controls.push(this); }
    update() { this.object.lookAt(this.target); } dispose() { this.disposed = true; this.canvas.style.touchAction = 'auto'; }
  } };
});
const descendants = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(descendants)];
const control = (root: RecordedNode, text: string) => descendants(root).find(n => n.tag === 'button' && n.textContent === text)!;
const labeled = (root: RecordedNode, label: string) => descendants(root).find(n => n.attributes.get('aria-label') === label)!;
function fakeCanvas() {
  const doc = new RecordedDocument(), canvas = doc.createElement('canvas');
  let size = { width: 0, height: 0 };
  Object.assign(canvas, { getBoundingClientRect: () => size });
  return { canvas, show(width = 800, height = 600) { size = { width, height }; tracker.resize.forEach(f => f()); } };
}
beforeEach(() => {
  tracker.renderers.length = tracker.controls.length = tracker.resize.length = 0; tracker.raf.clear(); tracker.fail = false;
  vi.stubGlobal('ResizeObserver', class { constructor(fn: () => void) { tracker.resize.push(fn); } observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { const id = ++tracker.nextRaf; tracker.raf.set(id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => tracker.raf.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

describe('synthetic Scene display; GPU mocked, not rendered/browser acceptance', () => {
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

  it('omits hidden, incompatible and conflicting owners without changing Caption data', () => {
    const p = createSyntheticProject(), changed = { ...p, resources: { ...p.resources, assets: { ...p.resources.assets,
      [f.equipment]: { ...p.resources.assets[f.equipment]!, projection: value(syntheticVersions.filter(v => v.assetId === f.equipment)[1]!.projection) } } } };
    expect(syntheticDisplay(changed, f.overview, null, null).pins.map(p => p.id)).toEqual([f.second]);
    const conflict = { ...changed, resources: { ...changed.resources, assets: { ...changed.resources.assets,
      [f.equipment]: { ...changed.resources.assets[f.equipment]!, projection: { kind: 'unresolved' as const, reason: 'conflict' as const } } } } };
    expect(syntheticDisplay(conflict, f.detail, null, null).models).toHaveLength(0);
    expect(syntheticDisplay(conflict, f.detail, null, null).pins).toHaveLength(0);
    expect(changed.resources.captions).toBe(p.resources.captions);
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
      notified = changed; return { update: d => { display = d; }, setActive() {}, read: () => ({ token: 'camera', ready, issue: null,
        dragging, projection: 'perspective', axis: null, pins: display.pins.map((p: any) => ({ id: p.id, x: 10, y: 10, visible: true })) }),
      camera: intent => actions.push(intent), retry() {}, dispose() {} };
    } });
    const root = record(workspace.root), stage = labeled(root, '3D表示');
    expect(workspace.session.displayReady).toBe(false); ready = true; notified();
    expect(workspace.session.displayReady).toBe(true);
    expect(descendants(root).some(n => n.textContent.startsWith('3D描画・ピン配置は未接続'))).toBe(false);
    control(stage, '設備の確認箇所').fire('click'); expect(workspace.session.memory.selectedCaptionId).toBe(f.shared);
    control(root, '全体表示').fire('click'); expect(actions).toEqual([{ kind: 'fit' }]);
    control(root, '視点').fire('click'); control(root, '+Y').fire('click'); expect(actions.at(-1)).toEqual({ kind: 'axis', axis: '+y' });
    dragging = true; notified(); expect(labeled(root, 'シーン').disabled).toBe(true); expect(control(root, '全体表示').disabled).toBe(true);
    dragging = false; notified(); expect(labeled(root, 'シーン').disabled).toBe(false);
    workspace.session.acceptModel(planModelList(workspace.session.modelContext(), { kind: 'membership', assetId: f.equipment, included: false })); workspace.render();
    expect(display.pins.map((p: any) => p.id)).not.toContain(f.shared); expect(workspace.session.memory.selectedCaptionId).toBe(f.shared);
    workspace.dispose();
  });
});
