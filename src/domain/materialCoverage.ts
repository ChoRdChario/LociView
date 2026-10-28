import type { MaterialIntent } from './materialIntent';
import type { MeshMaterialSource } from './meshMaterialSource';

/** Validated display intent only; profile/disabled-value interpretation belongs to the caller. */
export interface MaterialCoveragePlan {
  readonly kind:'opaque'|'mask'|'smoothBlend';
  readonly source:MeshMaterialSource['coverage'];
  readonly opacity:number;
  readonly chroma?:NonNullable<MaterialIntent['appearance']['chroma']>;
  readonly cutoff?:number;
}
export function resolveMaterialCoverage(source:MeshMaterialSource,intent:MaterialIntent):MaterialCoveragePlan {
  const a=intent.appearance,requested=intent.compositing.coverage;
  if(intent.compositing.optics==='transmission'||requested.policy==='ditherCoverage')throw Error('この透過の表示方法には対応していません。');
  const kind=requested.policy==='inherit'?
    source.coverage.kind==='blend'||(a.opacity??1)<1||(a.chroma?.softness??0)>0?'smoothBlend':
      source.coverage.kind==='mask'||a.chroma?'mask':'opaque':requested.policy;
  return {kind,source:source.coverage,opacity:a.opacity??1,...(a.chroma?{chroma:a.chroma}:{}),
    ...(kind==='mask'?{cutoff:requested.policy==='mask'?requested.alphaCutoff!:.5}:{})};
}
/** Diagnostic sample of01§4.2; textures/raster coverage are evaluated by the GPU. */
export function materialCoverageAlpha(plan:MaterialCoveragePlan,sourceAlpha:number,colorLinear:readonly number[]):number {
  if(plan.kind==='opaque')return 1;
  const coverage=plan.source.kind==='opaque'?1:plan.source.kind==='mask'?(sourceAlpha>=plan.source.alphaCutoff?1:0):sourceAlpha;
  let chroma=1;
  if(plan.chroma){
    const linear=(c:number)=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
    const d=Math.hypot(...colorLinear.map((c,i)=>c-linear(plan.chroma!.keyColorSrgb[i]!)))/Math.sqrt(3);
    if(plan.chroma.softness===0)chroma=d<=plan.chroma.tolerance?0:1;
    else{const u=Math.min(1,Math.max(0,(d-plan.chroma.tolerance)/plan.chroma.softness));chroma=u*u*(3-2*u);}
  }
  return Math.min(1,Math.max(0,coverage*plan.opacity*chroma));
}
