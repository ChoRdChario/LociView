import { freezeDisplay } from './displaySupport';
import type { Field,Lifecycle } from '../scene/types';
import type { HistoryCell } from './displayCells';
export interface ProjectCamera {
  readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly up: readonly [number, number, number];
  readonly projection: { readonly kind: 'perspective'; readonly verticalFovRadians: number } | { readonly kind: 'orthographic'; readonly verticalSpan: number };
}
export interface SolidBackground { readonly kind: 'solid'; readonly colorSrgb: readonly [number, number, number] }
export const PROJECT_SCENE_STANDARD_BACKGROUND_HEX = '#e8e6e2';
export interface SyntheticSavedView {
  readonly id: string; readonly sceneId: string; readonly projectFrameId: string;
  readonly name: Field<string>; readonly orderKey: Field<string>; readonly lifecycle: Field<Lifecycle>;
  readonly camera: Field<ProjectCamera>; readonly background: Field<SolidBackground>;
}
export interface ViewData {
  readonly records: Readonly<Record<string, SyntheticSavedView>>;
  readonly cells: Readonly<Record<string, HistoryCell>>; readonly versions: Readonly<Record<string, string>>;
}
export const viewKey = (id: string, field: string) => `view/${id}/${field}`;
export const entryKey = (id: string) => `scene/${id}/entry`;
function fail(message = '保存した視点の内容を確認してください。'): never { throw new Error(message); }
function exact(input: unknown, keys: readonly string[]): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== [...keys].sort().join(',')) fail();
  return input as Record<string, any>;
}
function vector(input: unknown): [number, number, number] {
  if (!Array.isArray(input) || input.length !== 3 || input.some(n => typeof n !== 'number' || !Number.isFinite(n) || Object.is(n, -0))) fail();
  return [...input] as [number, number, number];
}
export function readProjectCamera(input: unknown): ProjectCamera {
  const c = exact(input, ['position', 'target', 'up', 'projection']), position = vector(c.position), target = vector(c.target), up = vector(c.up);
  // Projection is part of the same atomic camera; accept exactly the documented shape.
  return finishCamera(c, position, target, up);
}
function finishCamera(c: Record<string, any>, position: [number, number, number], target: [number, number, number], up: [number, number, number]): ProjectCamera {
  const direction = target.map((n, i) => n - position[i]!), length = Math.hypot(...direction), norm = Math.hypot(...up);
  if (!Number.isFinite(length) || !length || Math.abs(norm - 1) > 1e-12) fail();
  const d = direction.map(n => n / length), cross = [up[1] * d[2]! - up[2] * d[1]!, up[2] * d[0]! - up[0] * d[2]!, up[0] * d[1]! - up[1] * d[0]!];
  if (Math.hypot(...cross) <= 1e-12) fail();
  const kind = c.projection?.kind, p = exact(c.projection, kind === 'perspective' ? ['kind', 'verticalFovRadians'] : ['kind', 'verticalSpan']);
  if (kind === 'perspective') { if (!Number.isFinite(p.verticalFovRadians) || p.verticalFovRadians <= 0 || p.verticalFovRadians >= Math.PI) fail(); }
  else if (kind !== 'orthographic' || !Number.isFinite(p.verticalSpan) || p.verticalSpan <= 0) fail();
  return freezeDisplay({ position, target, up, projection: kind === 'perspective'
    ? { kind: 'perspective', verticalFovRadians: p.verticalFovRadians } : { kind: 'orthographic', verticalSpan: p.verticalSpan } });
}
export function readSolidBackground(input: unknown): SolidBackground {
  if (input && typeof input === 'object' && (input as { kind?: unknown }).kind === 'transparent') fail('この接続版では透明な背景は未対応です。');
  const b = exact(input, ['kind', 'colorSrgb']), rgb = vector(b.colorSrgb);
  if (b.kind !== 'solid' || rgb.some(n => n < 0 || n > 1)) fail();
  return freezeDisplay({ kind: 'solid', colorSrgb: rgb });
}
/** Allocate between neighbors without rewriting their keys; no implicit collection rebalance. */
export function orderBetween(before: string | null, after: string | null): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  if (before !== null && after !== null && before >= after) fail('視点の順序を確認してください。');
  let prefix = '';
  for (let i = 0; i < 64; i++) {
    const low = before && i < before.length ? alphabet.indexOf(before[i]!) : -1;
    const high = after === null ? alphabet.length : i < after.length ? alphabet.indexOf(after[i]!) : -1;
    if (high - low > 1) { const result = prefix + alphabet[Math.floor((low + high) / 2)]!;
      if ((!before || result > before) && (!after || result < after)) return result; }
    if (low < 0) break; prefix += alphabet[low];
    if (high > low) after = null;
  }
  return fail('この間には視点を移動できません。別の位置を選んでください。');
}
