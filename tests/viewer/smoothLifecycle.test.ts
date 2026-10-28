import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {createSmoothComposite} from '../../src/viewer/smoothComposite';
import {createTargetBudget,targetLayout,type TargetLease} from '../../src/viewer/targetBudget';
import {patchSmoothCoverage} from '../../src/viewer/smoothMaterial';
import {pointVisibility} from '../../src/projectScene/validationPointCoverage';
import type {GsFrame} from '../../src/viewer/gsRender';

/** Orchestration only. Actual shader/float/depth/pixel acceptance is in dedicated Chromium. */
class Gl {
  MAX_DRAW_BUFFERS=1;MAX_COLOR_ATTACHMENTS=2;DEPTH_BITS=3;FRAMEBUFFER=4;FRAMEBUFFER_COMPLETE=5;COLOR_ATTACHMENT0=6;COLOR_ATTACHMENT1=7;RGBA=8;FLOAT=9;NO_ERROR=0;read=0;
  getExtension(){return {};}
  getParameter(key:number){return key===this.DEPTH_BITS?24:8;}
  checkFramebufferStatus(){return this.FRAMEBUFFER_COMPLETE;}
  readBuffer(){}getError(){return 0;}isContextLost(){return false;}
  readPixels(_x:number,_y:number,_w:number,_h:number,_f:number,_t:number,p:Float32Array){p.set(this.read++%3===0?[140000,0,0,2]:this.read%3===2?[.5,2,0,1]:[0,0,0,0]);}
}
class Renderer {
  gl=new Gl();target:THREE.WebGLRenderTarget|null=null;autoClear=true;debug={checkShaderErrors:false,onShaderError:undefined as undefined|(()=>void)};xr={enabled:false};shadowMap={autoUpdate:false};color=new THREE.Color(.1,.2,.3);alpha=.7;
  draws:THREE.Mesh[][]=[];getContext(){return this.gl;}getRenderTarget(){return this.target;}getActiveCubeFace(){return 0;}getActiveMipmapLevel(){return 0;}
  getClearColor(out:THREE.Color){return out.copy(this.color);}getClearAlpha(){return this.alpha;}setRenderTarget(t:THREE.WebGLRenderTarget|null){this.target=t;}setClearColor(c:THREE.ColorRepresentation,a:number){this.color.set(c);this.alpha=a;}clear(){}
  getDrawingBufferSize(out:THREE.Vector2){return out.set(8,8);}readRenderTargetPixels(_t:unknown,_x:unknown,_y:unknown,_w:unknown,_h:unknown,p:Uint8Array){p.fill(0);}
  render(scene:THREE.Scene,camera:THREE.Camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);const drawn:THREE.Mesh[]=[];scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(let p:THREE.Object3D|null=o;p;p=p.parent)if(!p.visible)return;if((Array.isArray(o.material)?o.material:[o.material]).some(m=>m.visible))drawn.push(o);});this.draws.push(drawn);}
}
afterEach(()=>vi.unstubAllGlobals());
describe('01g resource ownership and presented geometry',()=>{
  it('two production compositor owners share one document budget and release independently',async()=>{
    vi.stubGlobal('WebGL2RenderingContext',Gl);const budget=createTargetBudget(),aLayout=targetLayout(1500,800,1,budget.available,8192),a=await createSmoothComposite(new Renderer() as unknown as THREE.WebGLRenderer,budget,aLayout),bLayout=targetLayout(1500,800,1,budget.available,8192),b=await createSmoothComposite(new Renderer() as unknown as THREE.WebGLRenderer,budget,bLayout);
    expect(bLayout.renderScale).toBeLessThan(aLayout.renderScale);expect(budget.used).toBe(aLayout.bytes+bLayout.bytes);expect(budget.used).toBeLessThan(64*1024*1024);a.dispose();expect(budget.used).toBe(bLayout.bytes);b.dispose();expect(budget.used).toBe(0);
  });
  it('shared smooth material survives twoMesh draws and opaque parents do not hide smooth children',async()=>{
    vi.stubGlobal('WebGL2RenderingContext',Gl);const renderer=new Renderer(),budget=createTargetBudget(),layout=targetLayout(8,8,1,budget.available,8192),port=await createSmoothComposite(renderer as unknown as THREE.WebGLRenderer,budget,layout);
    const material=new THREE.MeshBasicMaterial();patchSmoothCoverage(material,{opacity:.5});const geometry=new THREE.PlaneGeometry(1,1),a=new THREE.Mesh(geometry,material),b=new THREE.Mesh(geometry,material),parent=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),scene=new THREE.Scene();parent.add(b);scene.add(a,parent);const camera=new THREE.PerspectiveCamera();renderer.draws=[];
    port.render(scene,camera,[{object:a},{object:b}]);expect(material.visible).toBe(true);expect(a.material).toBe(material);expect(b.material).toBe(material);expect(parent.visible).toBe(true);expect(renderer.draws[1]).toEqual([a,b]);
    port.render(scene,camera,[{object:a},{object:b}]);expect(material.visible).toBe(true);port.dispose();expect(budget.used).toBe(0);geometry.dispose();material.dispose();(parent.material as THREE.Material).dispose();
  });
  it('borrowed GS base stays charged after MRT disposal until the actual base owner releases it',async()=>{
    vi.stubGlobal('WebGL2RenderingContext',Gl);const renderer=new Renderer(),budget=createTargetBudget(),layout=targetLayout(8,8,1,budget.available,8192),base=new THREE.WebGLRenderTarget(8,8,{depthTexture:new THREE.DepthTexture(8,8,THREE.UnsignedIntType)}),source=new THREE.ShaderMaterial(),object=new THREE.Mesh(new THREE.PlaneGeometry(),source);let lease:TargetLease|undefined;
    const frame:GsFrame={object,sourceMaterial:source,baseTarget:base,get baseBytes(){return lease?.bytes??0;},claimBase(){lease??=budget.reserve(8*8*12);},withMaterial(material,draw){const old=object.material;try{object.material=material;draw();}finally{object.material=old;}},renderBase(){}};
    const port=await createSmoothComposite(renderer as unknown as THREE.WebGLRenderer,budget,layout,frame);expect(budget.used).toBe(layout.bytes);expect(port.leaseBytes).toBe(8*8*24);port.dispose();expect(budget.used).toBe(8*8*12);base.dispose();lease!.release();expect(budget.used).toBe(0);source.dispose();object.geometry.dispose();
  });
  it('cancellation before policy verification cannot allocate or charge a target',async()=>{
    const budget=createTargetBudget(),abort=new AbortController();abort.abort();await expect(createSmoothComposite({} as THREE.WebGLRenderer,budget,targetLayout(10,10,1,budget.available,8192),undefined,abort.signal)).rejects.toMatchObject({name:'AbortError'});expect(budget.used).toBe(0);
  });
  it('known smooth rays are unknown locally; nonintersecting rays retain existing Boolean checks',()=>{
    const renderer=new Renderer(),material=new THREE.MeshBasicMaterial();patchSmoothCoverage(material,{opacity:.5});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.5,.5),material),asset=new THREE.Group();asset.add(mesh);const camera=new THREE.PerspectiveCamera(45,1,.1,10);camera.position.z=3;camera.updateMatrixWorld(true);const failed=vi.fn(),resident=new Map([['a',{asset,mesh}]]),proof=pointVisibility(renderer as unknown as THREE.WebGLRenderer,camera,resident,8,8,failed);
    expect(proof.mesh(new THREE.Vector2(0,0))).toBe('unknown');expect(proof.mesh(new THREE.Vector2(.9,0))).toBe('clear');expect(failed).toHaveBeenCalledTimes(1);proof.dispose();mesh.geometry.dispose();material.dispose();
  });
});
