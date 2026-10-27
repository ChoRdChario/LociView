import * as THREE from 'three';
import { GaussianSplatRenderer, SplatMesh, SplatFileType } from 'gaussian-splat-lite';
import displayText from '../../docs/specs/profiles/gs-gsl-webgl2-packed-linear-1.profile.json?raw';
import goldenText from '../../docs/specs/profiles/gs-gsl-webgl2-packed-linear-1.goldens.json?raw';
import { queueGsDecode, type GsResidency, type GsViewIntent } from './gsDecodeQueue';
import { gsLinear } from '../domain/gsSource';

/** Neutral checked source. No Project, format records, filesystem or package access. */
export type GsDisplaySource = {readonly count:number;readonly degree:number;readonly displayIssue:string|null} &
  ({readonly file:Blob;readonly bytes?:never}|{readonly bytes:Uint8Array;readonly file?:never});
export interface GsDisplayResident {readonly source:GsDisplaySource;readonly object:THREE.Group;issue:string|null;ready:boolean}
export interface GsRenderPort {render(scene:THREE.Scene,camera:THREE.Camera,before:()=>void):void;dispose():void;readonly depthBits:number;readonly healthyOwner?:object}
let policy:Promise<void>|undefined;
async function verifyPolicy(){return policy??=(async()=>{
  const hash=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(await hash(displayText)!=='e71f81ab372669f087ba7c1fde5ce56526ee0e2ac1179d33582f4905cf0e28cd'||await hash(goldenText)!=='4c72c058724af1330c3fb4e2b90f3dcffabd4ffdb21af3af6d81b04a8ba093cf')throw Error('GSの表示仕様を確認できません。');
})();}
/** Source-side range proof complements checking every publicly decoded packed row. */
function checkPacked(mesh:SplatMesh,source:GsDisplaySource){
  if(!mesh.isInitialized||mesh.numSplats!==source.count||!mesh.splats||mesh.splats.getNumSplats()!==source.count||mesh.splats.getNumSh()!==source.degree)throw Error('GSの全係数を表示できません。');
  for(let i=0;i<source.count;i++){
    const s=mesh.splats.getSplat(i,true);
    const values=[...s.center.toArray(),...s.scales.toArray(),...s.quaternion.toArray(),s.opacity,...s.color.toArray(),...s.sh.flatMap(c=>c.toArray())];
    if(values.some(v=>!Number.isFinite(v))||s.scales.toArray().some(v=>v<=0||!Number.isFinite(Math.fround(v))||Math.fround(v)<=0)||s.quaternion.lengthSq()<=0||s.opacity<0||s.opacity>1||s.sh.length!==source.degree*(source.degree+2))throw Error('GSの描画データを確認できません。');
    for(let channel=0;channel<3;channel++){
      let bound=Math.abs(s.color.toArray()[channel]!);
      for(let k=0;k<s.sh.length;k++)bound+=Math.abs(s.sh[k]!.toArray()[channel]!)*Math.sqrt((2*Math.floor(Math.sqrt(k+1))+1)/(4*Math.PI));
      if(!Number.isFinite(gsLinear(bound))||gsLinear(bound)>65504)throw Error('GSの色を正しく合成できる範囲を超えています。');
    }
  }
}
function outputPass(target:THREE.WebGLRenderTarget){
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),geometry=new THREE.PlaneGeometry(2,2);
  const material=new THREE.ShaderMaterial({uniforms:{image:{value:target.texture}},depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D image;varying vec2 p;void main(){gl_FragColor=texture2D(image,p);\n#include <colorspace_fragment>\n}'});
  scene.add(new THREE.Mesh(geometry,material));return {scene,camera,dispose(){geometry.dispose();material.dispose();}};
}
/** Exercise actual half-float rendering, >1 blending and shared opaque depth. */
function probeLinearTarget(renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget):number{
  const gl=renderer.getContext();if(!(gl instanceof WebGL2RenderingContext))throw Error('この環境ではGSを表示できません。');
  const previous=renderer.getRenderTarget(),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10);camera.position.z=3;
  const g=new THREE.PlaneGeometry(2,2),base=new THREE.MeshBasicMaterial({color:new THREE.Color(.25,0,0),toneMapped:false}),blend=new THREE.MeshBasicMaterial({color:new THREE.Color(2,0,0),opacity:.5,transparent:true,depthWrite:false,toneMapped:false});
  const back=new THREE.Mesh(g,base),front=new THREE.Mesh(g,blend);front.position.z=.5;scene.add(back,front);
  const pixel=new Float32Array(4);
  try{renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);
    if(gl.getError()!==gl.NO_ERROR||Math.abs(pixel[0]!-1.125)>.005)throw Error('この環境ではGSの色を正しく合成できません。');
    back.position.z=1;base.color.setRGB(0,.5,0,THREE.LinearSRGBColorSpace);renderer.clear();renderer.render(scene,camera);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);
    if(gl.getError()!==gl.NO_ERROR||Math.abs(pixel[0]!)>.005||Math.abs(pixel[1]!-.5)>.005)throw Error('この環境ではGSとモデルの前後関係を表示できません。');
    return gl.getParameter(gl.DEPTH_BITS) as number;
  }finally{renderer.setRenderTarget(previous);g.dispose();base.dispose();blend.dispose();}
}
/** One viewport coordinator. Source changes dispose it; camera-only sorts retain the last order. */
export async function createGsRender(renderer:THREE.WebGLRenderer,residents:readonly GsDisplayResident[],changed:()=>void,signal?:AbortSignal,residency?:GsResidency,intent?:GsViewIntent):Promise<GsRenderPort>{
  signal?.throwIfAborted();await verifyPolicy();signal?.throwIfAborted();
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,depthBuffer:true,samples:0});target.texture.colorSpace=THREE.LinearSRGBColorSpace;
  let depthBits:number;try{depthBits=probeLinearTarget(renderer,target);}catch(e){target.dispose();throw e;}
  let output:ReturnType<typeof outputPass>|undefined,coordinator:GaussianSplatRenderer;
  try{output=outputPass(target);coordinator=new GaussianSplatRenderer({renderer,autoUpdate:false,encodeLinear:true,premultipliedAlpha:true,transparent:true,depthTest:true,depthWrite:false,
    maxStdDev:Math.sqrt(8),minPixelRadius:0,minAlpha:.5/255,preBlurAmount:.3,blurAmount:0,clipXY:4,focalAdjustment:2,sortRadial:false,fastSort:true,minSortIntervalMs:0,stochastic:false,onDirty:changed});}
  catch(e){output?.dispose();target.dispose();throw e;}
  const owner=intent?.owner??{};let slotIndex=0,coordinatorDisposed=false;
  let closed=false,sorting=false,lastSort='',attached:THREE.Scene|undefined,fatal:unknown;const decoded=new Set<GsDisplayResident>(),pendingDisplay=new Set<GsDisplayResident>();
  const leases=residents.map(resident=>{
    resident.ready=false;resident.issue='GSの表示を準備しています。';
    if(resident.source.displayIssue){resident.issue=resident.source.displayIssue;return {cancel(){}};}
    const slot=slotIndex++;
    const lease=queueGsDecode(resident,()=>{
      const mesh=new SplatMesh({...resident.source.file?{file:resident.source.file}:{fileBytes:resident.source.bytes.slice()},fileType:SplatFileType.PLY,fileName:'source.ply',editable:false,raycastable:false});mesh.maxSh=resident.source.degree;mesh.frustumCulled=false;
      return {initialized:mesh.initialized,value:mesh,dispose:()=>{mesh.removeFromParent();mesh.dispose();if(closed&&!coordinatorDisposed)throw Error('GSの描画資源の解放を確認できません。');}};
    },intent?()=>intent.reserve(slot,resident.source):residency?()=>residency.reserve(owner,resident.source):undefined);
    void lease.promise.then(mesh=>{if(closed){lease.cancel();return;}try{checkPacked(mesh,resident.source);resident.object.add(mesh);decoded.add(resident);lastSort='';changed();}catch(e){lease.cancel();resident.issue=(e as Error).message;changed();}},e=>{if(!closed){resident.issue=e instanceof Error?e.message:'GSを表示できません。';changed();}});
    return lease;
  });
  return {depthBits,get healthyOwner(){return !closed&&!fatal?owner:undefined;},render(scene,camera,before){
    if(closed)return;if(fatal)throw fatal;if(attached!==scene){coordinator.removeFromParent();scene.add(coordinator);attached=scene;}
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const finiteGpu=(values:readonly number[])=>values.every(v=>Number.isFinite(v)&&Number.isFinite(Math.fround(v)));
    if(!finiteGpu(camera.matrixWorld.elements)||!finiteGpu(camera.projectionMatrix.elements)||residents.some(r=>!finiteGpu(r.object.matrixWorld.elements)))throw Error('この配置・視点ではGSを表示できません。');
    const size=renderer.getDrawingBufferSize(new THREE.Vector2()),gl=renderer.getContext(),max=Math.min(renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
    if(!Number.isSafeInteger(size.x)||!Number.isSafeInteger(size.y)||size.x<=0||size.y<=0||size.x>max||size.y>max||!Number.isSafeInteger(size.x*size.y*12))throw Error('GSの表示領域が扱える範囲を超えています。');
    if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
    const key=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,residents.map(r=>[decoded.has(r),r.object.matrixWorld.elements,r.object.visible])]);
    if(!sorting&&key!==lastSort){sorting=true;lastSort=key;scene.updateMatrixWorld(true);const readySet=[...decoded];void coordinator.update({scene,camera}).then(()=>{if(!closed){for(const r of readySet)pendingDisplay.add(r);changed();}},e=>{if(!closed){fatal=e;changed();}}).finally(()=>{sorting=false;});}
    // Public pinned API refreshes geometry in unchanged ranges while a sort is in flight.
    scene.updateMatrixWorld(true);coordinator.display.refreshTransforms(renderer);
    let becameReady=false;const old=renderer.getRenderTarget();try{renderer.setRenderTarget(target);
      const gl=renderer.getContext();if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('GSの表示領域を準備できません。');
      before();renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(old);renderer.render(output!.scene,output!.camera);
      for(const r of pendingDisplay){becameReady||=!r.ready;r.ready=true;r.issue=null;}pendingDisplay.clear();
    }finally{renderer.setRenderTarget(old);}if(becameReady)changed();
  },dispose(){if(closed)return;closed=true;intent?.cancel();const errors:unknown[]=[];coordinator.removeFromParent();try{coordinator.dispose();coordinatorDisposed=true;}catch(e){errors.push(e);}for(const lease of leases)try{lease.cancel();}catch(e){errors.push(e);}for(const r of residents)r.ready=false;
    try{target.dispose();}catch(e){errors.push(e);}try{output!.dispose();}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'GSの表示資源を解放できません。');}};
}
