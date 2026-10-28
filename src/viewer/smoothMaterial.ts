import * as THREE from 'three';
import {hasBinaryCoverage,type CoverageMaterial,type BinaryMask} from './hardChroma';
import {compositionOutputShader} from './compositionPolicy';

export type SmoothCoverage=Omit<BinaryMask,'cutoff'>;
const coverage=new WeakMap<THREE.Material,SmoothCoverage>();
export const smoothCoverage=(material:THREE.Material)=>coverage.get(material);
const sourceShader=(m:CoverageMaterial)=>m instanceof THREE.MeshBasicMaterial?THREE.ShaderLib.basic:m instanceof THREE.MeshPhongMaterial?THREE.ShaderLib.phong:THREE.ShaderLib.standard;
/** Called only on owned admitted Mesh clones. Preserve raw factor/texture/RGBA until final clamp. */
export function patchSmoothCoverage(material:CoverageMaterial,input:SmoothCoverage):void{
  if(coverage.has(material)||hasBinaryCoverage(material)||input.sourceMask&&input.sourceBlendOpacity!==undefined||
    ![input.opacity,...(input.sourceMask?[input.sourceMask.opacity,input.sourceMask.cutoff]:[]),...(input.sourceBlendOpacity!==undefined?[input.sourceBlendOpacity]:[]),...(input.chroma?[...input.chroma.keyColorSrgb,input.chroma.tolerance,input.chroma.softness]:[])].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||input.chroma&&input.chroma.keyColorSrgb.length!==3)throw Error('透過の設定を確認してください。');
  const owned:SmoothCoverage=Object.freeze({...input,...(input.sourceMask?{sourceMask:Object.freeze({...input.sourceMask})}:{}),...(input.chroma?{chroma:Object.freeze({...input.chroma,keyColorSrgb:Object.freeze([...input.chroma.keyColorSrgb])})}:{})});
  const token='#include <alphamap_fragment>',check=(text:string)=>{if(text.split(token).length!==2)throw Error('この材質の透過を表示できません。');};check(sourceShader(material).fragmentShader);
  coverage.set(material,owned);material.opacity=owned.sourceMask?.opacity??owned.sourceBlendOpacity??1;material.alphaTest=0;material.transparent=true;material.depthWrite=false;
  const key=new THREE.Color().setRGB(...(owned.chroma?.keyColorSrgb??[0,0,0]) as [number,number,number],THREE.SRGBColorSpace);
  material.onBeforeCompile=shader=>{check(shader.fragmentShader);Object.assign(shader.uniforms,{lvSmoothOpacity:{value:owned.opacity},lvSmoothKey:{value:key},lvSmoothChroma:{value:owned.chroma?1:0},lvSmoothTolerance:{value:owned.chroma?.tolerance??0},lvSmoothSoftness:{value:owned.chroma?.softness??0},lvSmoothSourceCutoff:{value:owned.sourceMask?.cutoff??0}});
    shader.fragmentShader='uniform float lvSmoothOpacity,lvSmoothChroma,lvSmoothTolerance,lvSmoothSoftness,lvSmoothSourceCutoff;uniform vec3 lvSmoothKey;\n'+shader.fragmentShader.replace(token,token+`
float lvSourceAlpha=${owned.sourceMask?'diffuseColor.a>=lvSmoothSourceCutoff?1.0:0.0':owned.sourceBlendOpacity!==undefined?'diffuseColor.a':'1.0'};
float lvChroma=1.0;
if(lvSmoothChroma>0.5){float d=distance(diffuseColor.rgb,lvSmoothKey)/sqrt(3.0);if(lvSmoothSoftness==0.0)lvChroma=d<=lvSmoothTolerance?0.0:1.0;else{float u=clamp((d-lvSmoothTolerance)/lvSmoothSoftness,0.0,1.0);lvChroma=u*u*(3.0-2.0*u);}}
diffuseColor.a=clamp(lvSourceAlpha*lvSmoothOpacity*lvChroma,0.0,1.0);
`);};
  material.customProgramCacheKey=()=>`lociview-smooth-final-1:${owned.sourceMask?'mask':owned.sourceBlendOpacity!==undefined?'blend':'opaque'}`;material.needsUpdate=true;
}

/** Reapply coverage explicitly: Three.clone intentionally omits shader hooks. */
export function smoothAccumulationMaterial(source:CoverageMaterial):CoverageMaterial{
  const plan=smoothCoverage(source);if(!plan)throw Error('透過する面を確認してください。');const result=source.clone();patchSmoothCoverage(result,plan);
  const coverageHook=result.onBeforeCompile,key=result.customProgramCacheKey();
  result.onBeforeCompile=(shader,renderer)=>{coverageHook(shader,renderer);shader.fragmentShader=mrtShader(shader.fragmentShader,false);};
  result.customProgramCacheKey=()=>`${key}:mrt-1`;configureAccumulation(result);return result;
}
export function configureAccumulation(material:THREE.Material):void{
  material.transparent=true;material.depthWrite=false;material.depthTest=true;material.toneMapped=false;material.blending=THREE.CustomBlending;
  material.blendSrc=material.blendSrcAlpha=material.blendDst=material.blendDstAlpha=THREE.OneFactor;
  material.blendEquation=material.blendEquationAlpha=THREE.AddEquation;
}
export function mrtShader(source:string,premultiplied:boolean):string{
  const main=/void\s+main\s*\(\s*\)/g;if([...source.matchAll(main)].length!==1)throw Error('透過表示のshaderを確認できません。');
  if(premultiplied){if(source.split('out vec4 fragColor;').length!==2)throw Error('GSの透過表示を確認できません。');source=source.replace('out vec4 fragColor;','layout(location=0) out vec4 fragColor;');}
  const output=premultiplied?'fragColor':'gl_FragColor';
  return 'layout(location=1) out vec4 lvOptical;\n'+source.replace(main,'void lvSurfaceMain()')+'\nvoid main(){lvSurfaceMain();\n'+compositionOutputShader.replaceAll('LV_OUTPUT',output).replaceAll('LV_PREMULTIPLIER',premultiplied?'1.0':'lvA')+'\n}';
}
