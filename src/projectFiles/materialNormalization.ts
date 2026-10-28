import {materialForDisplay,type MaterialIntent} from '../domain/materialIntent';
import {resolveMaterialCoverage} from '../domain/materialCoverage';
import type {MeshMaterialSource} from '../domain/meshMaterialSource';
import type {MaterialConversionNotice,MaterialNormalizationReason} from '../domain/materialConversionNotice';
export type {MaterialConversionNotice,MaterialNormalizationReason} from '../domain/materialConversionNotice';
type Labels={scene:string;model:string;material:string};
export const standardMaterialNeeded=(source:MeshMaterialSource,opacity:number,chroma:boolean)=>source.coverage.kind!=='opaque'||opacity!==1||chroma;
export function normalizedLegacyChroma(keyColorSrgb:readonly number[],tolerance:number,feather:number){
  return {enabled:true,keyColorSrgb:[...keyColorSrgb],tolerance:tolerance/Math.sqrt(3),softness:feather/Math.sqrt(3)};
}
export function materialConversionNotice(labels:Labels,source:MeshMaterialSource,intent:MaterialIntent,zeroFeather=false):MaterialConversionNotice|null{
  const display=materialForDisplay(intent,'map2'),reasons:MaterialNormalizationReason[]=[];
  if(source.coverage.kind!=='opaque'||(display.appearance.opacity??1)!==1||display.appearance.chroma)reasons.push('alpha-order');
  if(display.appearance.chroma){reasons.push('chroma-standard');if(zeroFeather)reasons.push('hard-boundary');if(source.lighting==='unlit')reasons.push('basic-chroma');}
  if(resolveMaterialCoverage(source,display).kind==='smoothBlend')reasons.push('smooth-display');
  return reasons.length?{...labels,reasons}:null;
}
export function sourceBlendNotice(labels:Labels,source:MeshMaterialSource):MaterialConversionNotice|null{
  return source.coverage.kind==='blend'?{...labels,reasons:['smooth-display']}:null;
}
