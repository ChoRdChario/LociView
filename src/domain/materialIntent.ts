import { cloneCanonicalValue, reject, type JsonObject, type JsonValue, type ValueLimits } from './values';
import type { ProjectSemanticProfile } from './projectProfile';

export type MaterialAppearance = JsonObject & Readonly<{ opacity?: number; baseColorSrgb?: readonly number[];
  lighting?: 'inherit' | 'lit' | 'unlit'; doubleSided?: boolean;
  chroma?: JsonObject & Readonly<{ keyColorSrgb: readonly number[]; tolerance: number; softness: number; enabled?: boolean }> }>;
export type MaterialCompositing = JsonObject & Readonly<{ coverage: JsonObject & Readonly<{ policy: 'inherit' | 'opaque' | 'mask' | 'ditherCoverage' | 'smoothBlend'; alphaCutoff?: number }>;
  optics: 'inherit' | 'surface' | 'transmission' }>;
export type MaterialIntent = JsonObject & Readonly<{ appearance: MaterialAppearance; compositing: MaterialCompositing }>;
const object = (value: JsonValue | undefined, path: string[]): JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('type', path);
  return value as JsonObject;
};
const unit = (value: JsonValue | undefined, path: string[]) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) reject('value', path);
};
const rgb = (value: JsonValue | undefined, path: string[]) => {
  if (!Array.isArray(value) || value.length !== 3) return reject('value', path);
  value.forEach((channel, index) => unit(channel, [...path, String(index)]));
};
/** Individual decoded atomic values only; not target/reference, source-optics or backend admission. */
export function validateMaterialIntent(input: unknown, limits: ValueLimits, profile: ProjectSemanticProfile = 'map1'): MaterialIntent {
  const root = object(cloneCanonicalValue(input, limits), []), a = object(root.appearance, ['appearance']);
  const c = object(root.compositing, ['compositing']);
  checkMaterialAppearance(a, profile); checkMaterialCompositing(c); checkMaterialCoupling(a, c, profile);
  return root as MaterialIntent;
}
/** Internal checks on canonical cloned values; callers retain unknown members. */
export function checkMaterialAppearance(value: JsonValue, profile: ProjectSemanticProfile = 'map1'): void {
  const a = object(value, ['appearance']);
  if (a.opacity !== undefined) unit(a.opacity, ['appearance', 'opacity']);
  if (a.baseColorSrgb !== undefined) rgb(a.baseColorSrgb, ['appearance', 'baseColorSrgb']);
  if (a.lighting !== undefined && !['inherit', 'lit', 'unlit'].includes(a.lighting as string)) reject('value', ['appearance', 'lighting']);
  if (a.doubleSided !== undefined && typeof a.doubleSided !== 'boolean') reject('type', ['appearance', 'doubleSided']);
  if (a.chroma !== undefined) {
    const chroma = object(a.chroma, ['appearance', 'chroma']);
    if (profile === 'map2' && chroma.enabled !== undefined && typeof chroma.enabled !== 'boolean') reject('type', ['appearance', 'chroma', 'enabled']);
    rgb(chroma.keyColorSrgb, ['appearance', 'chroma', 'keyColorSrgb']);
    unit(chroma.tolerance, ['appearance', 'chroma', 'tolerance']); unit(chroma.softness, ['appearance', 'chroma', 'softness']);
  }
}
export function checkMaterialCompositing(value: JsonValue): void {
  const c = object(value, ['compositing']), coverage = object(c.coverage, ['compositing', 'coverage']);
  if (!['inherit', 'opaque', 'mask', 'ditherCoverage', 'smoothBlend'].includes(coverage.policy as string)) reject('value', ['compositing', 'coverage', 'policy']);
  if (!['inherit', 'surface', 'transmission'].includes(c.optics as string)) reject('value', ['compositing', 'optics']);
  if (coverage.policy === 'mask' || (coverage.policy === 'ditherCoverage' && coverage.alphaCutoff !== undefined)) unit(coverage.alphaCutoff, ['compositing', 'coverage', 'alphaCutoff']);
  else if (coverage.alphaCutoff !== undefined) reject('value', ['compositing', 'coverage', 'alphaCutoff']);
}
/** Only call with two checked unambiguous values; never supply defaults for conflicts. */
export function checkMaterialCoupling(a: JsonObject, c: JsonObject, profile: ProjectSemanticProfile = 'map1'): void {
  const coverage = object(c.coverage, ['compositing', 'coverage']);
  if (coverage.policy === 'opaque' && (chromaEnabled(a, profile) || (a.opacity !== undefined && a.opacity !== 1))) reject('value', ['appearance']);
}

export function chromaEnabled(a: JsonObject, profile: ProjectSemanticProfile = 'map1'): boolean {
  return a.chroma !== undefined && (profile === 'map1' || object(a.chroma, ['appearance', 'chroma']).enabled !== false);
}
/** Validated display-only copy. Raw editing/history values must never be replaced with it. */
export function materialForDisplay(intent: MaterialIntent, profile: ProjectSemanticProfile = 'map1'): MaterialIntent {
  if (profile === 'map1' || !intent.appearance.chroma) return intent;
  const appearance = { ...intent.appearance };
  if (!chromaEnabled(appearance, profile)) delete appearance.chroma;
  else { const chroma = { ...appearance.chroma! }; delete chroma.enabled; appearance.chroma = chroma; }
  return { ...intent, appearance };
}

export const materialFields = ['opacity', 'lighting', 'doubleSided', 'chroma', 'keyColor', 'tolerance', 'softness', 'coverage', 'cutoff'] as const;
export type MaterialEditField = typeof materialFields[number];
export type MaterialEdits = Readonly<Partial<Record<MaterialEditField, string>>>;
export const materialFieldLabels: Readonly<Record<MaterialEditField, string>> = Object.freeze({ opacity: '不透明度（%）', lighting: '照明',
  doubleSided: '表示する面', chroma: '指定した色を透過', keyColor: '透過する色', tolerance: '色の許容範囲', softness: '境界のぼかし',
  coverage: '透過の表示方法', cutoff: '切り抜きのしきい値' });
export function materialInput(a: MaterialAppearance, field: MaterialEditField, profile: ProjectSemanticProfile = 'map1', compositing?: MaterialCompositing): string {
  switch (field) {
    case 'coverage': return compositing?.coverage.policy ?? 'inherit';
    case 'cutoff': return String(compositing?.coverage.alphaCutoff ?? 0.5);
    case 'opacity': return String((a.opacity ?? 1) * 100);
    case 'lighting': return a.lighting ?? 'inherit';
    case 'doubleSided': return a.doubleSided === undefined ? 'inherit' : a.doubleSided ? 'double' : 'front';
    case 'chroma': return chromaEnabled(a, profile) ? 'on' : 'off';
    case 'keyColor': return '#' + (a.chroma?.keyColorSrgb ?? [0, 0, 0]).map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('');
    case 'tolerance': return String(a.chroma?.tolerance ?? 0.1);
    case 'softness': return String(a.chroma?.softness ?? 0);
  }
}

/** Explicit compositing edits preserve the other atom and unknown source fields. */
export function editMaterialIntent(base: MaterialIntent, edits: MaterialEdits, profile: ProjectSemanticProfile = 'map1'): MaterialIntent {
  let compositing = base.compositing;
  if (edits.coverage !== undefined || edits.cutoff !== undefined) {
    const coverage = { ...compositing.coverage };
    if (edits.coverage !== undefined) {
      if (!['inherit', 'opaque', 'mask',...(profile==='map2'?['smoothBlend']:[])].includes(edits.coverage)) throw Error('透過の表示方法を選び直してください。');
      coverage.policy = edits.coverage as 'inherit' | 'opaque' | 'mask' | 'smoothBlend';
      if (coverage.policy === 'mask') coverage.alphaCutoff ??= 0.5;
      else delete coverage.alphaCutoff;
    }
    if (edits.cutoff !== undefined) {
      const n = Number(edits.cutoff);
      if (coverage.policy !== 'mask' || !edits.cutoff.trim() || !Number.isFinite(n) || n < 0 || n > 1)
        throw Error('切り抜きのしきい値は0〜1で入力してください。');
      coverage.alphaCutoff = n;
    }
    compositing = { ...compositing, coverage };
  }
  return { ...base, appearance: editMaterialAppearance(base.appearance, edits, profile), compositing };
}
/** Local explicit edits only. Base is a validated immutable value; unknown data is never rebuilt from controls. */
export function editMaterialAppearance(base: MaterialAppearance, edits: MaterialEdits, profile: ProjectSemanticProfile = 'map1'): MaterialAppearance {
  const out: Record<string, JsonValue> = { ...base };
  const number = (field: MaterialEditField, max = 1) => {
    const raw = edits[field]!, value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value < 0 || value > max) throw Error(`${materialFieldLabels[field]}は0〜${max}で入力してください。`);
    return value / max;
  };
  if (edits.opacity !== undefined) out.opacity = number('opacity', 100);
  if (edits.lighting !== undefined) {
    if (!['inherit', 'lit', 'unlit'].includes(edits.lighting)) throw Error('照明を選び直してください。');
    out.lighting = edits.lighting;
  }
  if (edits.doubleSided !== undefined) {
    if (!['inherit', 'double', 'front'].includes(edits.doubleSided)) throw Error('表示する面を選び直してください。');
    if (edits.doubleSided === 'inherit') delete out.doubleSided; else out.doubleSided = edits.doubleSided === 'double';
  }
  if (edits.chroma !== undefined && !['on', 'off'].includes(edits.chroma)) throw Error('色の透過を選び直してください。');
  const enabled = (edits.chroma ?? (chromaEnabled(base, profile) ? 'on' : 'off')) === 'on';
  if (!enabled) {
    if (profile === 'map1' && base.chroma && Object.keys(base.chroma).some(key => !['keyColorSrgb', 'tolerance', 'softness'].includes(key)))
      throw Error('この色の透過設定には未対応の情報があります。状態を確認してください。');
    if (profile === 'map2' && base.chroma) out.chroma = { ...base.chroma, enabled: false };
    else delete out.chroma;
    if (['keyColor', 'tolerance', 'softness'].some(key => edits[key as MaterialEditField] !== undefined)) throw Error('色の透過を有効にするか、入力を取り消してください。');
  } else {
    const chroma: Record<string, JsonValue> = { ...(base.chroma ?? { keyColorSrgb: [0, 0, 0], tolerance: 0.1, softness: 0 }) };
    if (profile === 'map2' && edits.chroma === 'on') chroma.enabled = true;
    if (edits.keyColor !== undefined) {
      const hex = edits.keyColor.trim().toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(hex)) throw Error('透過する色は # と6桁の16進数で入力してください。');
      chroma.keyColorSrgb = Object.freeze([1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255));
    }
    if (edits.tolerance !== undefined) chroma.tolerance = number('tolerance');
    if (edits.softness !== undefined) chroma.softness = number('softness');
    out.chroma = Object.freeze(chroma);
  }
  return Object.freeze(out) as MaterialAppearance;
}
