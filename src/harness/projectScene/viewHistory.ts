import { normalizeSceneName } from '../../domain/values';
import { value, type Field, type Lifecycle } from '../../scene/types';
import { createSyntheticProject, freezeSynthetic } from './fixture';
import { canonicalFixture } from './modelClosure';
import type { HistoryCell, HistorySnapshot } from './historyPort';

export interface ProjectCamera {
  readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly up: readonly [number, number, number];
  readonly projection: { readonly kind: 'perspective'; readonly verticalFovRadians: number } | { readonly kind: 'orthographic'; readonly verticalSpan: number };
}
export interface SolidBackground { readonly kind: 'solid'; readonly colorSrgb: readonly [number, number, number] }
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
const initial = createSyntheticProject(), fields = ['identity', 'name', 'order', 'camera', 'background', 'lifecycle'];
export const viewHistorySeed = () => Object.fromEntries(Object.keys(initial.state.scenes).map(id => [entryKey(id), 'null']));
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
  return freezeSynthetic({ position, target, up, projection: kind === 'perspective'
    ? { kind: 'perspective', verticalFovRadians: p.verticalFovRadians } : { kind: 'orthographic', verticalSpan: p.verticalSpan } });
}
export function readSolidBackground(input: unknown): SolidBackground {
  if (input && typeof input === 'object' && (input as { kind?: unknown }).kind === 'transparent') fail('この接続版では透明な背景は未対応です。');
  const b = exact(input, ['kind', 'colorSrgb']), rgb = vector(b.colorSrgb);
  if (b.kind !== 'solid' || rgb.some(n => n < 0 || n > 1)) fail();
  return freezeSynthetic({ kind: 'solid', colorSrgb: rgb });
}
function decoded(text: string): any {
  if (text.length > 4096) fail();
  const input: unknown = JSON.parse(text); if (canonicalFixture(input) !== text) fail(); return input;
}
const candidates = (cell: HistoryCell) => cell.kind === 'value' ? [cell.value] : cell.candidates.map(c => c.value);
function field<T>(cell: HistoryCell | undefined, parse: (text: string) => T): Field<T> {
  if (!cell) fail(); const values = candidates(cell); if (!values.length) fail(); const checked = values.map(parse);
  return cell.kind === 'value' ? value(checked[0]!) : { kind: 'unresolved', reason: 'conflict' };
}
export function projectViewHistory(snapshot: HistorySnapshot, previous?: HistorySnapshot) {
  const cells = Object.fromEntries(Object.entries(snapshot.cells).filter(([key]) => key.startsWith('view/') || key.startsWith('scene/')));
  const ids = new Set<string>(), records: Record<string, SyntheticSavedView> = {}, scenes = { ...initial.state.scenes };
  for (const key of Object.keys(cells)) {
    if (/^view\/view_[0-9a-f]{32}\/(identity|name|order|camera|background|lifecycle)$/.test(key)) ids.add(key.split('/')[1]!);
    else if (!Object.hasOwn(viewHistorySeed(), key)) fail();
  }
  for (const id of ids) {
    if (fields.some(f => !cells[viewKey(id, f)])) fail();
    const identity = cells[viewKey(id, 'identity')]!; if (identity.kind !== 'value') fail();
    const meta = exact(decoded(identity.value), ['id', 'sceneId', 'projectFrameId']);
    if (meta.id !== id || !initial.state.scenes[meta.sceneId] || meta.projectFrameId !== initial.resources.projectFrameId) fail();
    const old = previous?.cells[viewKey(id, 'identity')]; if (old && JSON.stringify(old) !== JSON.stringify(identity)) fail('視点の所属シーンは変更できません。');
    records[id] = { id, sceneId: meta.sceneId, projectFrameId: meta.projectFrameId,
      name: field(cells[viewKey(id, 'name')], text => { if (normalizeSceneName(text) !== text) fail(); return text; }),
      orderKey: field(cells[viewKey(id, 'order')], text => { if (!/^[0-9A-Za-z]{1,64}$/.test(text)) fail(); return text; }),
      camera: field(cells[viewKey(id, 'camera')], text => readProjectCamera(decoded(text))),
      background: field(cells[viewKey(id, 'background')], text => readSolidBackground(decoded(text))),
      lifecycle: field(cells[viewKey(id, 'lifecycle')], text => {
        const l = exact(decoded(text), ['state', 'eventId', 'reason']);
        if (!/^evt_[0-9a-f]{32}$/.test(l.eventId) || (l.state === 'active' ? l.reason !== 'initial' : l.state !== 'deleted' || l.reason !== 'userDelete')) fail();
        return freezeSynthetic(l as Lifecycle);
      }) };
  }
  for (const key of Object.keys(previous?.cells ?? {})) if ((key.startsWith('view/') || key.startsWith('scene/')) && !cells[key]) fail();
  for (const id of Object.keys(scenes)) {
    const pointer = field(cells[entryKey(id)], text => { const v: unknown = decoded(text);
      if (v !== null && (typeof v !== 'string' || records[v]?.sceneId !== id)) fail('開始時の視点の参照先を確認してください。'); return v as string | null; });
    scenes[id] = { ...scenes[id]!, defaultViewId: pointer };
  }
  if (ids.size && Object.keys(cells).some(key => !snapshot.cellVersions?.[key])) fail('視点の変更履歴を確認してください。');
  const versions = Object.fromEntries(Object.keys(cells).map(key => [key, snapshot.cellVersions?.[key] ?? 'initial-empty-views']));
  return { scenes, data: freezeSynthetic({ records, cells, versions }) };
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
