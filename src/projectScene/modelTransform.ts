import { Euler, Quaternion } from 'three';
import type { ModelPlacement } from './displaySupport';

export type ModelTransformMode = 'translate' | 'rotate' | 'scale';
export interface ModelManipulation { readonly mode: ModelTransformMode;
  readonly rotationXYZW: ModelPlacement['rotationXYZW']; readonly uniformScale: number }
export const finiteInput = (raw: string) => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) && Number.isFinite(Number(raw));
export function isCanonicalRotation(q: readonly number[]): boolean {
  return q.length === 4 && q.every(n => Number.isFinite(n) && !Object.is(n, -0)) &&
    Math.abs(Math.hypot(...q) - 1) <= 1e-12 && (q[3] || q[0] || q[1] || q[2] || 0) > 0;
}
export function canonicalRotation(q: readonly number[]): ModelPlacement['rotationXYZW'] {
  if (q.length !== 4 || !q.every(Number.isFinite) || Math.abs(Math.hypot(...q) - 1) > 1e-10) throw Error('回転を確認してください。');
  const sign = (q[3] || q[0] || q[1] || q[2]!) < 0 ? -1 : 1;
  const length = Math.hypot(...q);
  return q.map(v => v / length * sign || 0) as unknown as ModelPlacement['rotationXYZW'];
}
export function rotationDegrees(q: ModelPlacement['rotationXYZW']): readonly [string, string, string] {
  const e = new Euler().setFromQuaternion(new Quaternion(...q), 'XYZ');
  return [e.x, e.y, e.z].map(v => String(v * 180 / Math.PI || 0)) as [string, string, string];
}
export function degreesRotation(angles: readonly [string, string, string]): ModelPlacement['rotationXYZW'] {
  if (!angles.every(finiteInput)) throw Error('回転角を有限の数値で指定してください。');
  const r = angles.map(v => Number(v) % 360 * Math.PI / 180);
  return canonicalRotation(new Quaternion().setFromEuler(new Euler(r[0], r[1], r[2], 'XYZ')).toArray());
}
export function proposedPlacement(base: ModelPlacement, edit: { position: ModelPlacement['translation']; manipulation?: ModelManipulation }): ModelPlacement {
  return { translation: edit.position, rotationXYZW: edit.manipulation?.rotationXYZW ?? base.rotationXYZW,
    uniformScale: edit.manipulation?.uniformScale ?? base.uniformScale };
}
