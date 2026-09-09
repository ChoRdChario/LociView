import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { PinSurfaceTarget } from './viewportPicking';
import type { V3 } from './viewportModel';

export interface PinGizmoProposal { readonly target: PinSurfaceTarget; readonly position: V3; readonly enabled: boolean }

/** Translation of a transient ProjectFrame marker, never a Caption/history write. */
export function createPinGizmo(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera,
  propose: (target: PinSurfaceTarget, position: V3) => boolean, activity: (dragging: boolean) => void) {
  const marker = new THREE.Object3D(), control = new TransformControls(camera, canvas), helper = control.getHelper();
  control.setMode('translate'); control.setSpace('world'); control.setSize(1);
  scene.add(marker, helper);
  let current: PinGizmoProposal | undefined, disposed = false, syncing = false;
  const pointers = new Set<number>(); let owner: number | null = null, blocked = false, releasing: number | null = null;
  const before = new THREE.Vector3(), accepted = new THREE.Vector3();
  const tuple = (): V3 => [marker.position.x, marker.position.y, marker.position.z];
  const stop = (restore: boolean) => {
    if (!control.dragging) return;
    syncing = true;
    if (restore && current) {
      marker.position.copy(before);
      if (propose(current.target, tuple())) accepted.copy(before); else marker.position.copy(accepted);
    }
    control.dragging = false; control.axis = null; syncing = false;
    activity(false);
  };
  control.addEventListener('dragging-changed', event => {
    if (disposed || syncing) return;
    if (event.value) { before.copy(marker.position); accepted.copy(marker.position); }
    activity(Boolean(event.value));
  });
  control.addEventListener('objectChange', () => {
    if (disposed || syncing || blocked || !current?.enabled || !control.dragging) return;
    if (tuple().every(Number.isFinite) && propose(current.target, tuple())) accepted.copy(marker.position);
    else { marker.position.copy(accepted); stop(false); }
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
    update(next?: PinGizmoProposal) {
      const same = JSON.stringify(current?.target) === JSON.stringify(next?.target);
      if (control.dragging && (!same || !next?.enabled)) stop(false);
      current = next;
      if (!next) { control.detach(); enable(); return; }
      if (!control.dragging) { marker.position.set(...next.position); accepted.copy(marker.position); }
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
