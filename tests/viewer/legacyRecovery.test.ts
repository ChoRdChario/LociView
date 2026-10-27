import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ViewerCore } from '../../src/viewer/viewer';
import type { LoadedModel } from '../../src/viewer/loaders';

const tracked = vi.hoisted(() => ({ renderers: [] as any[], controls: [] as any[], gizmos: [] as any[], raf: new Map<number, () => void>(), next: 0, fail: false }));
vi.mock('three', async original => ({ ...await original<typeof import('three')>(), WebGLRenderer: class {
  frames = 0; disposed = false; camera: any; options: any; outputColorSpace: any; ratio = 1;
  constructor(options: any) { if (tracked.fail) throw new Error('renderer refused'); this.options = options; tracked.renderers.push(this); }
  setPixelRatio(value: number) { this.ratio = value; } getPixelRatio() { return this.ratio; }
  setSize() {} render(scene: THREE.Scene, camera: THREE.Camera) { this.camera = camera; scene.updateMatrixWorld(true); this.frames++; }
  dispose() { this.disposed = true; }
} }));
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three');
  return { OrbitControls: class {
    target = new Vector3(); enabled = true; enableDamping = false; disposed = false; updates = 0;
    constructor(readonly camera: THREE.Camera) { tracked.controls.push(this); }
    update() { this.updates++; this.camera.lookAt(this.target); } dispose() { this.disposed = true; }
  } };
});
vi.mock('three/addons/controls/TransformControls.js', async () => {
  const { EventDispatcher, Group } = await import('three');
  return { TransformControls: class extends EventDispatcher<any> {
    enabled = true; axis: string | null = null; object: any; private busy = false; root = new Group();
    constructor(readonly camera: THREE.Camera) { super(); tracked.gizmos.push(this); }
    get dragging() { return this.busy; }
    set dragging(value: boolean) { if (this.busy === value) return; this.busy = value; this.dispatchEvent({ type: 'dragging-changed', value }); }
    getHelper() { return this.root; } setMode() {} setSize() {} attach(object: any) { this.object = object; }
    detach() { this.object = undefined; } dispose() {}
  } };
});
function fixture() {
  const canvas = Object.assign(new EventTarget(), { style: {}, width: 800, height: 600,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }) });
  const viewer = new ViewerCore(); viewer.init(canvas as unknown as HTMLCanvasElement);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const disposed = vi.fn(); geometry.addEventListener('dispose', disposed);
  const model: LoadedModel = { root: new THREE.Mesh(geometry, material), kind: 'mesh', materials: [{ key: 'm/Panel/0', name: 'Panel', materials: [material] }],
    stats: { vertices: 8, triangles: 12, points: 0, meshes: 1 }, warnings: [] };
  viewer.setModel(model);
  return { viewer, canvas, model, disposed, loss: () => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
    restore: () => canvas.dispatchEvent(new Event('webglcontextrestored')) };
}
beforeEach(() => {
  vi.useFakeTimers(); tracked.renderers.length = tracked.controls.length = tracked.gizmos.length = 0; tracked.raf.clear();
  tracked.fail = false;
  vi.stubGlobal('addEventListener', () => {}); vi.stubGlobal('removeEventListener', () => {});
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { const id = ++tracked.next; tracked.raf.set(id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => tracked.raf.delete(id));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('ordinary legacy ViewerCore GPU recovery', () => {
  it.each([false, true])('retains the complete temporary camera (orthographic=%s), suppressing both model fits', ortho => {
    const f = fixture(); f.viewer.setCameraState({ eye: [4, 3, 7], target: [.3, .2, .1], up: [0, 1, 0], fov: 57, ortho });
    const camera = tracked.renderers[0].camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    camera.zoom = 2.75; camera.near = .123; camera.far = 987.6; camera.updateProjectionMatrix();
    const before = camera.toJSON(), state = f.viewer.getCameraState(), lost = vi.fn(), restored = vi.fn();
    f.viewer.onContextLost(lost); f.viewer.onContextRestored(restored);
    f.loss(); expect(f.viewer.model).toBeNull(); expect(f.disposed).toHaveBeenCalledOnce(); expect(tracked.raf.size).toBe(0);
    expect(tracked.renderers[0].disposed).toBe(true); expect(f.viewer.isDisplayAvailable()).toBe(false);
    const token = f.viewer.displayRecovery!; f.restore(); expect(restored).toHaveBeenCalledWith(token);
    expect(f.viewer.prepareDisplay()).toBe('ready');
    expect(tracked.renderers[1].options).toEqual(tracked.renderers[0].options);
    const next = { ...f.model, root: new THREE.Mesh(new THREE.BoxGeometry(20, 30, 40), new THREE.MeshStandardMaterial()), materials: [] };
    f.viewer.setModel(next); f.viewer.setModelTransform({ scale: 3, upAxis: 'Z' });
    f.viewer.finishDisplayRecovery(token);
    expect(camera.toJSON()).toEqual(before); expect(f.viewer.getCameraState()).toEqual(state);
    expect(tracked.controls[0].disposed).toBe(true); expect(tracked.controls.at(-1).enabled).toBe(true);
    expect(lost).toHaveBeenCalledOnce(); f.viewer.dispose();
  });
  it('cancels drag, long press, RAF and edit notifications while lost, then accepts only the latest recovery token', () => {
    const f = fixture(), moved = vi.fn(), picked = vi.fn(), missed = vi.fn();
    f.viewer.onPinMove(moved); f.viewer.onPick(picked); f.viewer.onTapMiss(missed);
    f.viewer.addPin({ id: 'pin', position: [0, 0, 0], color: '#ff0000' }); f.viewer.showPinGizmo('pin');
    tracked.gizmos[0].dragging = true; f.loss();
    expect(tracked.gizmos[0].dragging).toBe(false); expect(tracked.gizmos[0].object).toBeUndefined();
    expect(moved).not.toHaveBeenCalled(); const frames = tracked.renderers[0].frames;
    f.viewer.renderOnce(); f.canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0, shiftKey: true, clientX: 400, clientY: 300 }));
    vi.advanceTimersByTime(600); expect(tracked.renderers[0].frames).toBe(frames); expect(picked).not.toHaveBeenCalled();
    const first = f.viewer.displayRecovery!; f.restore(); f.loss(); const second = f.viewer.displayRecovery!; expect(second).not.toBe(first);
    f.restore(); f.viewer.prepareDisplay(); f.viewer.finishDisplayRecovery(first); expect(f.viewer.displayRecovery).toBe(second);
    f.viewer.finishDisplayRecovery(second); expect(f.viewer.displayRecovery).toBeNull(); expect(missed).not.toHaveBeenCalled();
    f.viewer.dispose(); const count = tracked.renderers.length; f.loss(); f.restore(); expect(tracked.renderers.length).toBe(count);
  });
  it('a pending touch long press cannot create a caption after loss', () => {
    const f = fixture(), picked = vi.fn(); f.viewer.onPick(picked);
    f.canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0, pointerType: 'touch', clientX: 400, clientY: 300 }));
    expect(vi.getTimerCount()).toBe(1); f.loss(); expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(600); expect(picked).not.toHaveBeenCalled(); f.viewer.dispose();
  });
  it('allows manual renderer allocation retry after the real context has recovered', () => {
    const f = fixture(); f.loss(); expect(f.viewer.prepareDisplay()).toBe('waiting'); f.restore();
    tracked.fail = true; expect(f.viewer.prepareDisplay()).toBe('failed'); expect(f.viewer.isDisplayAvailable()).toBe(false);
    tracked.fail = false; expect(f.viewer.prepareDisplay()).toBe('ready'); expect(f.viewer.isDisplayAvailable()).toBe(true);
    f.viewer.finishDisplayRecovery(f.viewer.displayRecovery!); expect(f.viewer.displayRecovery).toBeNull(); f.viewer.dispose();
  });
  it('keeps the visible point diameter across recovery and resets it on a later model switch', () => {
    const f = fixture();
    const points = () => ({ ...f.model, kind: 'points' as const, materials: [],
      root: new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]), new THREE.PointsMaterial()) });
    const first = points(); f.viewer.setModel(first); f.viewer.setPointScale(4);
    const diameter = first.root.material.size;
    f.loss(); f.restore(); f.viewer.prepareDisplay(); const recovered = points(); f.viewer.setModel(recovered);
    f.viewer.finishDisplayRecovery(f.viewer.displayRecovery!); expect(recovered.root.material.size).toBe(diameter);
    const next = points(); f.viewer.setModel(next); expect(next.root.material.size).toBe(diameter / 4); f.viewer.dispose();
  });
});
