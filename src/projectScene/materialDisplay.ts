import { freezeDisplay,canonicalDisplay } from './displaySupport';
import { value,type Field,type Material,type MaterialTarget } from '../scene/types';
import type { MaterialIntent,MaterialAppearance,MaterialCompositing } from '../domain/materialIntent';
import { validateMaterialIntent } from '../domain/materialIntent';
import type { DisplayModelClosure } from './modelTypes';
import type { HistoryCell } from './displayCells';
export const materialLimits = Object.freeze({ maxNodes: 4096, maxDepth: 16, maxStringScalars: 65_536 });
export const sourceMaterialIntent: MaterialIntent = freezeDisplay({ appearance: {}, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' } });
export const sourceColorSrgb = Object.freeze([168 / 255, 162 / 255, 154 / 255] as const);
export type MaterialRouting = Extract<Material['routing'], { kind: 'value' }>['value'];
export interface SyntheticMaterial extends Material {
  readonly candidates: readonly MaterialRouting[]; readonly appearance: Field<MaterialAppearance>;
  readonly compositing: Field<MaterialCompositing>; readonly intent: Field<MaterialIntent>;
}
export interface MaterialData { readonly cells: Readonly<Record<string, HistoryCell>>; readonly records: Readonly<Record<string, SyntheticMaterial>>;
  /** An unclassifiable original route prevents proving any target bucket empty. */
  readonly routingUncertain?: boolean }
export const materialKey = (id: string, field: string) => `material/${id}/${field}`;
export const targetKey = (t: MaterialTarget) => canonicalDisplay(t);
export const routingKey = (r: MaterialRouting) => canonicalDisplay(r);
export const materialTarget = (c: DisplayModelClosure): MaterialTarget => {
  const catalog=c.representation.materialCatalog;if(!catalog)throw Error('このモデルには材質の設定がありません。');
  return { assetId: c.binding.assetId, variantFamilyId: c.representation.variantFamilyId,
    materialLayoutId: catalog.layoutId, logicalMaterialSlotId: catalog.slots[0]!.logicalMaterialSlotId };
};
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
export function materialBucket(data: MaterialData | undefined, routing: MaterialRouting): Field<SyntheticMaterial | null> {
  if (data?.routingUncertain) return unresolved();
  const key = routingKey(routing), rows = Object.values(data?.records ?? {}).filter(r => (r.lifecycle.kind !== 'value' || r.lifecycle.value.state !== 'deleted') && r.candidates.some(c => routingKey(c) === key));
  return !rows.length ? value(null) : rows.length !== 1 || rows[0]!.routing.kind !== 'value' || rows[0]!.lifecycle.kind !== 'value' ? unresolved() : value(rows[0]!);
}
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
  return freezeDisplay({ colorLinear: srgb.map(linear) as [number, number, number], unlit: a.lighting === 'unlit', doubleSided: a.doubleSided ?? false, visible: !mask || alpha >= cutoff });
}
