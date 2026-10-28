import * as THREE from 'three';
import { hasBinaryCoverage, hardChromaCoverageMaterial } from '../viewer/hardChroma';
import {smoothCoverage} from '../viewer/smoothMaterial';
import { coveragePixel } from './validationCoverage';
import type { ResidentSurface } from './viewportPicking';

export interface PointVisibility {
  mesh(ndc: THREE.Vector2): 'covered' | 'clear' | 'unknown';
  point(surface: ResidentSurface, index: number, ndc: THREE.Vector2): 'visible' | 'hidden' | 'unknown';
}
/** Boolean coverage/depth test only; source centres/IDs never come from pixel colors. */
export function pointVisibility(renderer: THREE.WebGLRenderer, camera: THREE.Camera, residents: ReadonlyMap<string, ResidentSurface>,
  cssWidth: number, cssHeight: number, failed: (error: unknown) => void): PointVisibility & { dispose(): void } {
  const target = new THREE.WebGLRenderTarget(2,2,{depthBuffer:true,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});
  const scene = new THREE.Scene(), pointScene = new THREE.Scene(), materials = new Map<THREE.Material,THREE.Material>(),unknownSmooth:THREE.Mesh[]=[];
  let candidate: THREE.Mesh | undefined, candidateGeometry: THREE.InstancedBufferGeometry | undefined, candidateMaterial: THREE.ShaderMaterial | undefined, invalid = false;
  const dispose = () => { target.dispose(); for (const m of materials.values()) m.dispose(); materials.clear(); candidateGeometry?.dispose(); candidateMaterial?.dispose(); };
  try {
    for (const surface of residents.values()) {
      if (surface.points || !surface.asset.visible || !surface.mesh.visible) continue;
      surface.asset.updateMatrixWorld(true);
      surface.mesh.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (let node: THREE.Object3D | null=object; node; node=node.parent) if (!node.visible) return;
        if((Array.isArray(object.material)?object.material:[object.material]).some(m=>m.visible&&smoothCoverage(m)))unknownSmooth.push(object);
        const own = (source: THREE.Material) => {
          if (!source.visible) { const invisible=source.clone(); materials.set(invisible,invisible); return invisible; }
          const previous=materials.get(source); if(previous)return previous;
          if(smoothCoverage(source)){const hidden=source.clone();hidden.visible=false;materials.set(source,hidden);return hidden;}
          if (!hasBinaryCoverage(source) && (source.transparent || source.alphaTest>0 || source.opacity<1)) throw Error('この面の透過を確認できません。視点を変えて再試行してください。');
          const material=hasBinaryCoverage(source) ? hardChromaCoverageMaterial(source) : source.clone();
          material.depthTest=true; material.depthWrite=true; material.transparent=false; material.blending=THREE.NoBlending; materials.set(source,material); return material;
        };
        const mesh=new THREE.Mesh(object.geometry,Array.isArray(object.material)?object.material.map(own):own(object.material));
        mesh.matrix.copy(object.matrixWorld); mesh.matrixAutoUpdate=false; mesh.frustumCulled=false; scene.add(mesh);
      });
    }
  } catch (error) { invalid=true; failed(error); }
  function probe(ndc: THREE.Vector2, point?: {surface:ResidentSurface; index:number}, allowEqual=false): 'covered' | 'clear' | 'unknown' {
    if (invalid) return 'unknown';
    const size=renderer.getDrawingBufferSize(new THREE.Vector2()), pixel=coveragePixel((ndc.x+1)*cssWidth/2,(1-ndc.y)*cssHeight/2,cssWidth,cssHeight,size);
    if(!pixel)return 'unknown';
    if(unknownSmooth.length){const ray=new THREE.Raycaster();ray.setFromCamera(pixel.ndc,camera);
      if(camera instanceof THREE.OrthographicCamera)ray.ray.origin.set(pixel.ndc.x,pixel.ndc.y,-1).unproject(camera);
      for(const mesh of unknownSmooth)for(const hit of ray.intersectObject(mesh,false)){
        const material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
        if(!material?.visible||!smoothCoverage(material))continue;const clip=hit.point.clone().project(camera);
        if([clip.x,clip.y,clip.z].every(Number.isFinite)&&clip.z>=-1&&clip.z<=1){failed(Error('滑らかな透過の面と重なる位置は確認できません。視点を変えるか、そのモデルを非表示にしてください。'));return 'unknown';}
      }
    }
    const prior=renderer.getRenderTarget(), cube=renderer.getActiveCubeFace(), mip=renderer.getActiveMipmapLevel(), color=renderer.getClearColor(new THREE.Color()).clone(), alpha=renderer.getClearAlpha();
    const auto=renderer.autoClear, xr=renderer.xr.enabled, shadow=renderer.shadowMap.autoUpdate, check=renderer.debug.checkShaderErrors, onError=renderer.debug.onShaderError; let shaderError=false;
    try {
      const gl=renderer.getContext(); if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('描画環境を確認できません。');
      for(const m of materials.values())m.colorWrite=!point;
      if(point){
        const source=point.surface.points?.object;
        if(!(source instanceof THREE.Mesh)||!(source.material instanceof THREE.ShaderMaterial)||!Number.isSafeInteger(point.index))throw Error('元の点を確認できません。');
        candidate?.removeFromParent(); candidateGeometry?.dispose(); candidateMaterial?.dispose();
        candidateGeometry=new THREE.InstancedBufferGeometry(); candidateGeometry.setAttribute('position',source.geometry.getAttribute('position').clone()); candidateGeometry.instanceCount=1;
        for(const name of ['pointClip','pointScreen','pointColor']){
          const a=source.geometry.getAttribute(name), values:number[]=[]; if(point.index<0||point.index>=a.count)throw Error('元の点を確認できません。');
          for(let i=0;i<a.itemSize;i++)values.push(a.getComponent(point.index,i));
          candidateGeometry.setAttribute(name,new THREE.InstancedBufferAttribute(Float32Array.from(values),a.itemSize));
        }
        candidateMaterial=source.material.clone(); candidateMaterial.fragmentShader=candidateMaterial.fragmentShader.replace('vec4(sourceColor, 1.0)','vec4(1.0, 0.0, 1.0, 1.0)');
        candidateMaterial.uniforms.sampleOrigin!.value.set(pixel.x-pixel.x%2,pixel.y-pixel.y%2); candidateMaterial.depthFunc=allowEqual?THREE.LessEqualDepth:THREE.LessDepth; candidateMaterial.depthWrite=false; candidateMaterial.colorWrite=true; candidateMaterial.blending=THREE.NoBlending;
        candidate=new THREE.Mesh(candidateGeometry,candidateMaterial); candidate.frustumCulled=false; pointScene.add(candidate);
      }
      target.viewport.set(-(pixel.x-pixel.x%2),-(pixel.y-pixel.y%2),pixel.width,pixel.height); target.scissorTest=false;
      renderer.xr.enabled=false; renderer.shadowMap.autoUpdate=false; renderer.autoClear=false; renderer.debug.checkShaderErrors=true; renderer.debug.onShaderError=(...args)=>{shaderError=true;onError?.(...args);};
      const expectedDepth=gl.getParameter(gl.DEPTH_BITS) as number; renderer.setRenderTarget(target); if(gl.getParameter(gl.DEPTH_BITS)!==expectedDepth)throw Error('点の奥行き精度を確認できません。'); renderer.setClearColor(0,0); renderer.clear(true,true,false); renderer.render(scene,camera); if(point)renderer.render(pointScene,camera);
      const output=new Uint8Array([31,47,59,71]); renderer.readRenderTargetPixels(target,pixel.x%2,pixel.y%2,1,1,output);
      if(shaderError||gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('点の見え方を確認できません。');
      if(output.every(n=>n===0))return 'clear';
      if(point ? output[0]===255&&output[1]===0&&output[2]===255&&output[3]===255 : output[3]===255)return 'covered';
      throw Error('点の見え方を確認できません。');
    }catch(error){invalid=true;failed(error);return 'unknown';}
    finally {renderer.debug.checkShaderErrors=check;renderer.debug.onShaderError=onError;renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadow;renderer.autoClear=auto;renderer.setClearColor(color,alpha);renderer.setRenderTarget(prior,cube,mip);}
  }
  return { dispose, mesh:ndc=>probe(ndc), point:(surface,index,ndc)=>{const r=probe(ndc,{surface,index});if(r==='covered')return 'visible'; if(r==='unknown')return 'unknown'; const equal=probe(ndc,{surface,index},true); return equal==='clear'?'hidden':'unknown';} };
}
