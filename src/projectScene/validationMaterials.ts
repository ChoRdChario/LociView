import { same } from '../domain/projectGraphSupport';
import { materialForDisplay, validateMaterialIntent, type MaterialIntent } from '../domain/materialIntent';
import type { ProjectSemanticProfile } from '../domain/projectProfile';
import type { JsonObject } from '../domain/values';
import type { MaterialTarget } from '../scene/types';
import { meshSourceFormat } from '../domain/meshSource';
import { meshMaterialSource,meshLightingIssue,type MeshMaterialSource } from '../domain/meshMaterialSource';
import { resolveMaterialCoverage } from '../domain/materialCoverage';
import { renderOwner, type ValidationModelClosure, type ReadonlyRenderModel } from './modelTypes';

export interface ValidationMaterialSlot { readonly target: MaterialTarget; readonly name: string;
  readonly locator: JsonObject; readonly semantics: JsonObject;readonly source?:MeshMaterialSource|null }
export type ValidationMaterialEffects = Readonly<Record<string, MaterialIntent | { readonly issue: string }>>;
export const validationMaterialMap2=(profile:unknown)=>!!meshSourceFormat(profile)||!!profile&&typeof profile==='object'&&!Array.isArray(profile)&&['development-validation-glb-occurrence-1','development-validation-glb-occurrence-jpeg-1'].includes(String((profile as JsonObject).id));
export function validationMaterialSlots(c: ValidationModelClosure | ReadonlyRenderModel): readonly ValidationMaterialSlot[] {
  const catalog=c.representation.materialCatalog; if(!catalog)return [];
  return catalog.slots.map(slot => ({ target: { assetId: renderOwner(c),
    variantFamilyId: c.representation.variantFamilyId, materialLayoutId: catalog.layoutId,
    logicalMaterialSlotId: slot.logicalMaterialSlotId }, locator: slot.sourceLocator, semantics: slot.sourceSemantics,source:meshMaterialSource(c.representation,slot.sourceSemantics),
    name: slot.sourceLocator.kind === 'gltfMaterial' ? `材質 ${Number(slot.sourceLocator.materialIndex) + 1}` :
      validationMaterialMap2(c.representation.formatProfile) ? `マテリアル ${Number(slot.sourceLocator.slotIndex) + 1}` : '既定の材質' }));
}
export function validationMaterialSourceIssue(slot: ValidationMaterialSlot,profile:ProjectSemanticProfile='map1'): string | null {
  return (profile==='map2'||slot.source?.coverage.kind!=='blend')&&(slot.source || slot.source===undefined&&same(slot.semantics, { coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'lit', doubleSided: false })) ? null :
    'この元材質の編集は未接続です。原本の設定を保持しています。';
}
export function validationMaterialCoverage(slot:ValidationMaterialSlot,input:MaterialIntent,profile:ProjectSemanticProfile='map1'){
  const source=slot.source===undefined?meshMaterialSource({contentKind:'mesh',role:'meshPrimary'},slot.semantics):slot.source;
  return source?resolveMaterialCoverage(source,materialForDisplay(input,profile)):null;
}
export const smoothMaterialDisplayNotice='滑らかな透過表示は未対応のため、この材質の面を非表示にしています。設定は保持しています。';
export function validationMaterialDisplayNotice(slot:ValidationMaterialSlot,input:MaterialIntent,profile:ProjectSemanticProfile='map1',smoothDisplay=false):string|null{
  return validationMaterialCoverage(slot,input,profile)?.kind==='smoothBlend'?smoothDisplay?'透過表示は近似です。対応できない場合は面を非表示にし、設定を保持します。':smoothMaterialDisplayNotice:null;
}
/** One capability boundary for edit admission and slot-clone rendering. */
export function validationMaterialIssue(slot: ValidationMaterialSlot, input: MaterialIntent, profile: ProjectSemanticProfile = 'map1'): string | null {
  const source = validationMaterialSourceIssue(slot,profile); if (source) return source;
  try {
    const intent = materialForDisplay(validateMaterialIntent(input, { maxNodes: 4096, maxDepth: 16, maxStringScalars: 65536 }, profile), profile), a = intent.appearance, c = intent.compositing;
    const lighting=slot.source&&meshLightingIssue(slot.source,a);if(lighting)return lighting;
    if (profile!=='map2'&&c.coverage.policy === 'inherit' && ((a.opacity ?? 1) < 1 || (a.chroma?.softness ?? 0) > 0))
      return '不透明度と境界のぼかしを使うには「切り抜き」を選択してください。滑らかな半透明は未対応です。';
    if (Object.keys(intent).sort().join(',') !== 'appearance,compositing' ||
      Object.keys(a).some(k => !['lighting', 'doubleSided', 'baseColorSrgb', 'opacity', 'chroma'].includes(k)) || (profile!=='map2'&&c.coverage.policy !== 'mask' && a.opacity !== undefined && a.opacity !== 1) ||
      a.chroma && (profile!=='map2'&&c.coverage.policy !== 'mask' && a.chroma.softness !== 0 || Object.keys(a.chroma).sort().join(',') !== 'keyColorSrgb,softness,tolerance') ||
      !same(c, { coverage: c.coverage.policy === 'mask' ? { policy: 'mask', alphaCutoff: c.coverage.alphaCutoff! } : { policy: c.coverage.policy }, optics: c.optics }) ||
      !['inherit', 'opaque', 'mask',...(profile==='map2'?['smoothBlend']:[])].includes(c.coverage.policy) || !['inherit', 'surface'].includes(c.optics))
      return 'この見え方は実モデルへ未接続です。';
    return null;
  } catch { return '材質の設定を確認してください。'; }
}
