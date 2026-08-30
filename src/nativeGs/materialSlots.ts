import type * as THREE from 'three';

/**
 * Native material targets use child indexes rather than labels, so duplicate or
 * renamed nodes never cause an appearance to move to another surface.
 */
export function nativeMaterialSlotKey(childPath: readonly number[], slot: number): string {
  return `m/${childPath.length === 0 ? 'root' : childPath.join('.')}/${slot}`;
}

/** Frozen-v1 used the display-name based node path below. It is conversion input
 * only; production native snapshots never use it as their durable target key. */
export function legacyV1MaterialSlotKey(
  object: THREE.Object3D,
  root: THREE.Object3D,
  slot: number,
): string {
  const parts: string[] = [];
  let current: THREE.Object3D | null = object;
  while (current !== null && current !== root) {
    const parent: THREE.Object3D | null = current.parent;
    const label = current.name !== ''
      ? current.name
      : `#${parent === null ? 0 : parent.children.indexOf(current)}`;
    parts.unshift(label);
    current = parent;
  }
  return `m/${parts.join('|')}/${slot}`;
}
