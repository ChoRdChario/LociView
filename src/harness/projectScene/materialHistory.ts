import { admitMaterialRecord } from '../../domain/materialRecords';
import { validateMaterialIntent, type MaterialIntent, type MaterialAppearance, type MaterialCompositing } from '../../domain/materialIntent';
import { value, type Field, type Lifecycle, type Material, type MaterialTarget } from '../../scene/types';
import { freezeSynthetic, createSyntheticProject } from './fixture';
import { canonicalFixture, type FixtureModelClosure } from './modelClosure';
import type { HistoryCell, HistorySnapshot } from './historyPort';

export const materialLimits = Object.freeze({ maxNodes: 4096, maxDepth: 16, maxStringScalars: 65_536 });
export const sourceMaterialIntent: MaterialIntent = freezeSynthetic({ appearance: {}, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' } });
export const sourceColorSrgb = Object.freeze([168 / 255, 162 / 255, 154 / 255] as const);
export type MaterialRouting = Extract<Material['routing'], { kind: 'value' }>['value'];
export interface SyntheticMaterial extends Material {
  readonly candidates: readonly MaterialRouting[]; readonly appearance: Field<MaterialAppearance>;
  readonly compositing: Field<MaterialCompositing>; readonly intent: Field<MaterialIntent>;
}
export interface MaterialData { readonly cells: Readonly<Record<string, HistoryCell>>; readonly records: Readonly<Record<string, SyntheticMaterial>> }
export const materialKey = (id: string, field: string) => `material/${id}/${field}`;
export const targetKey = (t: MaterialTarget) => canonicalFixture(t);
export const routingKey = (r: MaterialRouting) => canonicalFixture(r);
export const materialTarget = (c: FixtureModelClosure): MaterialTarget => ({ assetId: c.binding.assetId, variantFamilyId: c.representation.variantFamilyId,
  materialLayoutId: c.representation.materialCatalog.layoutId, logicalMaterialSlotId: c.representation.materialCatalog.slots[0]!.logicalMaterialSlotId });
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
const texts = (c: HistoryCell) => c.kind === 'value' ? [c.value] : c.candidates.map(v => v.value);
const initial = createSyntheticProject();
function fail(): never { throw new Error('マテリアルの内容・適用先を確認してください。'); }
const parse = (text: string): unknown => { if (text.length > 65_536) fail(); const v: unknown = JSON.parse(text); if (canonicalFixture(v) !== text) fail(); return v; };

/** Exact known catalog closure; not a general resource/history provider. */
export function projectMaterialHistory(snapshot: HistorySnapshot, models: readonly FixtureModelClosure[], previous?: HistorySnapshot): MaterialData {
  const cells = Object.fromEntries(Object.entries(snapshot.cells).filter(([k]) => k.startsWith('material/'))), records: Record<string, SyntheticMaterial> = {};
  const ids = new Set<string>(), catalog = new Set(models.map(c => targetKey(materialTarget(c))));
  for (const key of Object.keys(cells)) {
    if (!/^material\/ovr_[0-9a-f]{32}\/(routing|appearance|compositing|lifecycle)$/.test(key)) fail(); ids.add(key.split('/')[1]!);
  }
  for (const key of Object.keys(previous?.cells ?? {})) if (key.startsWith('material/') && !cells[key]) fail();
  for (const id of ids) {
    const parts = Object.fromEntries(['routing', 'appearance', 'compositing', 'lifecycle'].map(f => {
      const cell = cells[materialKey(id, f)]; if (!cell || !texts(cell).length) fail(); return [f, texts(cell).map(parse)];
    }));
    const base = { id, routing: parts.routing![0], lifecycle: parts.lifecycle![0], ...sourceMaterialIntent };
    const checked = (patch: object) => { const r = admitMaterialRecord({ ...base, ...patch }, materialLimits, id); if (r.kind !== 'valid-record') fail(); return r.record; };
    const routes = parts.routing!.map(r => checked({ routing: r }).routing);
    if (routes.some(r => !catalog.has(targetKey(r.target)) || (r.scope.kind === 'scene' && !initial.state.scenes[r.scope.sceneId]) ||
      Object.keys(r).sort().join(',') !== 'scope,target' || Object.keys(r.scope).sort().join(',') !== (r.scope.kind === 'scene' ? 'kind,sceneId' : 'kind') ||
      Object.keys(r.target).sort().join(',') !== 'assetId,logicalMaterialSlotId,materialLayoutId,variantFamilyId')) fail();
    const lives = parts.lifecycle!.map(l => checked({ lifecycle: l }).lifecycle as Lifecycle);
    const appearances = parts.appearance!.map(a => checked({ appearance: a }).appearance);
    const compositings = parts.compositing!.map(c => checked({ compositing: c }).compositing);
    const field = <T>(name: string, candidates: readonly T[]): Field<T> => cells[materialKey(id, name)]!.kind === 'value' ? value(candidates[0]!) : unresolved();
    const appearance = field('appearance', appearances), compositing = field('compositing', compositings);
    let intent: Field<MaterialIntent> = unresolved();
    if (appearance.kind === 'value' && compositing.kind === 'value') {
      try { intent = value(validateMaterialIntent({ appearance: appearance.value, compositing: compositing.value }, materialLimits)); }
      catch { intent = { kind: 'unresolved', reason: 'invalid' }; }
    }
    records[id] = { id, routing: field('routing', routes), candidates: routes, appearance, compositing, lifecycle: field('lifecycle', lives), intent };
  }
  // An unresolved routing reserves every candidate key, not an accidental hole in the catalog.
  const reserved = new Set(Object.values(records).filter(r => r.routing.kind !== 'value' && (r.lifecycle.kind !== 'value' || r.lifecycle.value.state !== 'deleted'))
    .flatMap(r => r.candidates.map(routingKey)));
  for (const [id, r] of Object.entries(records)) if (r.routing.kind === 'value' && reserved.has(routingKey(r.routing.value))) records[id] = { ...r, intent: unresolved() };
  return freezeSynthetic({ cells, records });
}
export function materialBucket(data: MaterialData | undefined, routing: MaterialRouting): Field<SyntheticMaterial | null> {
  const key = routingKey(routing), rows = Object.values(data?.records ?? {}).filter(r => (r.lifecycle.kind !== 'value' || r.lifecycle.value.state !== 'deleted') && r.candidates.some(c => routingKey(c) === key));
  return !rows.length ? value(null) : rows.length !== 1 || rows[0]!.routing.kind !== 'value' || rows[0]!.lifecycle.kind !== 'value' ? unresolved() : value(rows[0]!);
}
export function materialCopyIntent(data: MaterialData | undefined, sceneId: string, model: FixtureModelClosure): MaterialIntent | null {
  const target = materialTarget(model);
  for (const scope of [{ kind: 'scene' as const, sceneId }, { kind: 'project' as const }]) {
    const bucket = materialBucket(data, { target, scope });
    if (bucket.kind !== 'value' || (bucket.value && bucket.value.intent.kind !== 'value')) throw new Error('コピー元の見え方の競合を先に確認してください。');
    if (bucket.value?.intent.kind === 'value') {
      const issue = materialCapability(bucket.value.intent.value); if (issue) throw new Error(issue); return bucket.value.intent.value;
    }
  }
  return null;
}
/** Same predicate for edit admission and display. Unsupported requests are never persisted fallbacks. */
export function materialCapability(intent: MaterialIntent): string | null {
  const a = intent.appearance, c = intent.compositing;
  if (Object.keys(intent).sort().join(',') !== 'appearance,compositing' || Object.keys(a).some(k => !['opacity', 'baseColorSrgb', 'lighting', 'doubleSided', 'chroma'].includes(k)) ||
    Object.keys(c).some(k => !['coverage', 'optics'].includes(k)) || Object.keys(c.coverage).some(k => !['policy', 'alphaCutoff'].includes(k)) ||
    (a.chroma && Object.keys(a.chroma).some(k => !['keyColorSrgb', 'tolerance', 'softness'].includes(k)))) return '未対応の設定を保持しています。表示は未対応です。';
  if (c.optics === 'transmission') return '透過光の表示は未接続です。';
  if (c.coverage.policy === 'ditherCoverage') return 'ディザ表示は未接続です。';
  if (c.coverage.policy === 'smoothBlend' || (c.coverage.policy === 'inherit' && ((a.opacity ?? 1) < 1 || (a.chroma?.softness ?? 0) > 0))) return '半透明の表示は未接続です。';
  return null;
}
export function resolveFixtureMaterial(intent: MaterialIntent = sourceMaterialIntent) {
  const problem = materialCapability(intent); if (problem) throw new Error(problem);
  const a = intent.appearance, srgb = a.baseColorSrgb ?? sourceColorSrgb;
  const linear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  let alpha = a.opacity ?? 1;
  if (a.chroma) {
    const d = Math.hypot(...srgb.map((c, i) => linear(c) - linear(a.chroma!.keyColorSrgb[i]!))) / Math.sqrt(3);
    const u = a.chroma.softness === 0 ? (d <= a.chroma.tolerance ? 0 : 1) : Math.min(1, Math.max(0, (d - a.chroma.tolerance) / a.chroma.softness));
    alpha *= a.chroma.softness === 0 ? u : u * u * (3 - 2 * u);
  }
  const mask = intent.compositing.coverage.policy === 'mask' || (intent.compositing.coverage.policy === 'inherit' && Boolean(a.chroma));
  const cutoff = intent.compositing.coverage.policy === 'mask' ? intent.compositing.coverage.alphaCutoff! : 0.5;
  return freezeSynthetic({ colorLinear: srgb.map(linear) as [number, number, number], unlit: a.lighting === 'unlit', doubleSided: a.doubleSided ?? false, visible: !mask || alpha >= cutoff });
}
