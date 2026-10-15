import { same } from '../../domain/projectGraphSupport';
import { materialForDisplay, validateMaterialIntent, type MaterialIntent } from '../../domain/materialIntent';
import type { ProjectSemanticProfile } from '../../domain/projectProfile';
import type { JsonObject } from '../../domain/values';
import type { MaterialTarget } from '../../scene/types';
import { renderOwner, type ValidationModelClosure, type ReadonlyRenderModel } from './modelTypes';

export interface ValidationMaterialSlot { readonly target: MaterialTarget; readonly name: string;
  readonly locator: JsonObject; readonly semantics: JsonObject }
export type ValidationMaterialEffects = Readonly<Record<string, MaterialIntent | { readonly issue: string }>>;
export function validationMaterialSlots(c: ValidationModelClosure | ReadonlyRenderModel): readonly ValidationMaterialSlot[] {
  return c.representation.materialCatalog.slots.map(slot => ({ target: { assetId: renderOwner(c),
    variantFamilyId: c.representation.variantFamilyId, materialLayoutId: c.representation.materialCatalog.layoutId,
    logicalMaterialSlotId: slot.logicalMaterialSlotId }, locator: slot.sourceLocator, semantics: slot.sourceSemantics,
    name: slot.sourceLocator.kind === 'gltfMaterial' ? `材質 ${Number(slot.sourceLocator.materialIndex) + 1}` :
      ['development-validation-glb-occurrence-1', 'development-validation-glb-occurrence-jpeg-1'].includes(String((c.representation.formatProfile as JsonObject)?.id)) ? `面の材質 ${Number(slot.sourceLocator.slotIndex) + 1}` : '既定の材質' }));
}
export function validationMaterialSourceIssue(slot: ValidationMaterialSlot): string | null {
  return same(slot.semantics, { coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'lit', doubleSided: false }) ? null :
    'この元材質の編集は未接続です。原本の設定を保持しています。';
}
/** One capability boundary for edit admission and slot-clone rendering. */
export function validationMaterialIssue(slot: ValidationMaterialSlot, input: MaterialIntent, profile: ProjectSemanticProfile = 'map1'): string | null {
  const source = validationMaterialSourceIssue(slot); if (source) return source;
  try {
    const intent = materialForDisplay(validateMaterialIntent(input, { maxNodes: 4096, maxDepth: 16, maxStringScalars: 65536 }, profile), profile), a = intent.appearance, c = intent.compositing;
    if (Object.keys(intent).sort().join(',') !== 'appearance,compositing' ||
      Object.keys(a).some(k => !['lighting', 'doubleSided', 'baseColorSrgb', 'opacity', 'chroma'].includes(k)) || (a.opacity !== undefined && a.opacity !== 1) ||
      a.chroma && (a.chroma.softness !== 0 || Object.keys(a.chroma).sort().join(',') !== 'keyColorSrgb,softness,tolerance') ||
      !same(c, { coverage: { policy: c.coverage.policy }, optics: c.optics }) ||
      !['inherit', 'opaque'].includes(c.coverage.policy) || !['inherit', 'surface'].includes(c.optics))
      return 'この見え方は実モデルへ未接続です。';
    return null;
  } catch { return '材質の設定を確認してください。'; }
}
