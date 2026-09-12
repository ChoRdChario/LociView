import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { PinSurfaceTarget } from './viewportPicking';
import type { V3 } from './viewportModel';
import { canonicalRotation, type ModelManipulation } from './modelTransform';

export interface GizmoProposal<T> { readonly target: T; readonly position: V3; readonly enabled: boolean; readonly manipulation?: ModelManipulation }
export type PinGizmoProposal = GizmoProposal<PinSurfaceTarget>;
export interface ModelPlacementTarget {
  readonly kind: 'model'; readonly token: string; readonly sceneId: string; readonly assetId: string; readonly bindingId: string;
}

/** Transient ProjectFrame marker; model-only rotation/uniform scale, never a history write. */
export function createPinGizmo<T = PinSurfaceTarget>(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera,
  propose: (target: T, position: V3, manipulation?: ModelManipulation) => boolean, activity: (dragging: boolean) => void) {
  const marker = new THREE.Object3D(), control = new TransformControls(camera, canvas), helper = control.getHelper();
  control.setMode('translate'); control.setSpace('world'); control.setSize(1);
  scene.add(marker, helper);
  let current: GizmoProposal<T> | undefined, beforeProposal: GizmoProposal<T> | undefined, disposed = false, syncing = false;
  const pointers = new Set<number>(); let owner: number | null = null, blocked = false, releasing: number | null = null;
  const before = new THREE.Object3D(), accepted = new THREE.Object3D();
  const copy = (to: THREE.Object3D, from: THREE.Object3D) => { to.position.copy(from.position); to.quaternion.copy(from.quaternion); to.scale.copy(from.scale); };
  const tuple = (): V3 => [marker.position.x, marker.position.y, marker.position.z];
  const offer = () => {
    if (!current || !tuple().every(Number.isFinite)) return false;
    const m = current.manipulation;
    if (!m) return propose(current.target, tuple());
    try {
      // Axis handles all adjust ONE scale; no nonuniform/reflected model proposal escapes.
      const axis = control.axis;
      if (m.mode === 'scale' && !['X', 'Y', 'Z', 'XY', 'YZ', 'XZ', 'XYZ'].includes(axis ?? '')) return false;
      const scale = m.mode === 'scale' ? axis!.includes('X') ? marker.scale.x : axis!.includes('Y') ? marker.scale.y : marker.scale.z : m.uniformScale;
      if (!Number.isFinite(scale) || scale <= 0) return false;
      marker.scale.setScalar(scale);
      const rotation = m.mode === 'rotate' ? canonicalRotation(marker.quaternion.toArray()) : m.rotationXYZW;
      return propose(current.target, tuple(), { ...m, rotationXYZW: rotation, uniformScale: scale });
    } catch { return false; }
  };
  const stop = (restore: boolean) => {
    if (!control.dragging) return;
    syncing = true;
    if (restore && current && beforeProposal) {
      copy(marker, before);
      if (propose(beforeProposal.target, beforeProposal.position, beforeProposal.manipulation)) copy(accepted, before); else copy(marker, accepted);
    }
    control.dragging = false; control.axis = null; syncing = false;
    activity(false);
  };
  control.addEventListener('dragging-changed', event => {
    if (disposed || syncing) return;
    if (event.value) { copy(before, marker); copy(accepted, marker); beforeProposal = current; }
    activity(Boolean(event.value));
  });
  control.addEventListener('objectChange', () => {
    if (disposed || syncing || blocked || !current?.enabled || !control.dragging) return;
    if (offer()) copy(accepted, marker);
    else { copy(marker, accepted); stop(false); }
  });
  const enable = () => { control.enabled = Boolean(current?.enabled) && !blocked; };
  const interrupt = () => { stop(true); blocked = pointers.size > 0; owner = null; enable(); };
  const down = (event: PointerEvent) => {
    pointers.add(event.pointerId); releasing = null;
    if (blocked || pointers.size !== 1 || !event.isPrimary || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) { interrupt(); return; }
    owner = event.pointerId;
    if (current?.enabled) canvas.focus({ preventScroll: true });
  };
  const move = (event: PointerEvent) => {
    if (control.dragging && (event.pointerId !== owner || !event.isPrimary || event.altKey || event.ctrlKey || event.metaKey)) interrupt();
  };
  const up = (event: PointerEvent) => {
    // Runs before TransformControls. Normal capture release is not cancellation.
    releasing = event.pointerId;
    if (control.dragging && event.pointerId !== owner) interrupt();
    pointers.delete(event.pointerId);
    // Keep a blocked final pointerup disabled until Three's bubble listener ends.
    if (!pointers.size) queueMicrotask(() => { if (!disposed && !pointers.size) { blocked = false; owner = null; enable(); } });
  };
  const cancel = (event: PointerEvent) => { pointers.delete(event.pointerId); interrupt(); };
  const lost = (event: PointerEvent) => { if (event.pointerId !== releasing) cancel(event); };
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && control.dragging) { event.preventDefault(); interrupt(); } };
  canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true); canvas.addEventListener('pointercancel', cancel, true);
  canvas.addEventListener('lostpointercapture', lost, true); canvas.addEventListener('keydown', key);
  return {
    get dragging() { return control.dragging; },
    update(next?: GizmoProposal<T>) {
      const same = JSON.stringify(current?.target) === JSON.stringify(next?.target);
      if (control.dragging && (!same || !next?.enabled || current?.manipulation?.mode !== next?.manipulation?.mode)) stop(false);
      current = next;
      if (!next) { control.detach(); enable(); return; }
      control.setMode(next.manipulation?.mode ?? 'translate'); control.setSpace(next.manipulation?.mode === 'scale' ? 'local' : 'world');
      if (!control.dragging) {
        marker.position.set(...next.position); marker.quaternion.set(...(next.manipulation?.rotationXYZW ?? [0, 0, 0, 1] as const));
        marker.scale.setScalar(next.manipulation?.uniformScale ?? 1); copy(accepted, marker);
      }
      marker.updateMatrixWorld(true); control.attach(marker); enable();
    },
    dispose() {
      disposed = true; control.detach(); control.dispose(); marker.removeFromParent(); helper.removeFromParent();
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true); canvas.removeEventListener('pointercancel', cancel, true);
      canvas.removeEventListener('lostpointercapture', lost, true); canvas.removeEventListener('keydown', key);
    },
  };
}
