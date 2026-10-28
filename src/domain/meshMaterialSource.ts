import type { JsonObject } from './values';

export interface MeshMaterialSource {
  readonly coverage: {readonly kind:'opaque'|'blend'} | {readonly kind:'mask';readonly alphaCutoff:number};
  readonly lighting:'lit'|'unlit';readonly doubleSided:boolean;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Provider-verified catalog only. Content admission owns exact FormatProfile registration. */
export function meshMaterialSource(representation:JsonObject,semantics:unknown):MeshMaterialSource|null{
  return representation.contentKind==='mesh'&&representation.role==='meshPrimary'?meshMaterialSemantics(semantics):null;
}
/** Closed source semantics; source inspection still owns the exact format and visual role. */
export function meshMaterialSemantics(semantics:unknown):MeshMaterialSource|null{
  if(!object(semantics)||
    Object.keys(semantics).sort().join(',')!=='coverage,doubleSided,lighting,optics'||semantics.optics!=='surface'||
    (semantics.lighting!=='lit'&&semantics.lighting!=='unlit')||typeof semantics.doubleSided!=='boolean'||!object(semantics.coverage))return null;
  const c=semantics.coverage;
  if((c.kind==='opaque'||c.kind==='blend')&&Object.keys(c).join(',')==='kind')return{coverage:{kind:c.kind},lighting:semantics.lighting as 'lit'|'unlit',doubleSided:semantics.doubleSided};
  if(c.kind==='mask'&&Object.keys(c).sort().join(',')==='alphaCutoff,kind'&&typeof c.alphaCutoff==='number'&&Number.isFinite(c.alphaCutoff)&&c.alphaCutoff>=0&&c.alphaCutoff<=1)
    return{coverage:{kind:'mask',alphaCutoff:c.alphaCutoff},lighting:semantics.lighting as 'lit'|'unlit',doubleSided:semantics.doubleSided};
  return null;
}
export function opaqueMaterialSource(semantics:unknown):MeshMaterialSource|null{
  const source=meshMaterialSemantics(semantics);return source?.coverage.kind==='opaque'?source:null;
}
export const meshLightingIssue=(source:MeshMaterialSource,appearance:JsonObject)=>source.lighting==='unlit'&&appearance.lighting==='lit'?
  '元から照明なしの材質は、照明ありに変更できません。':null;
