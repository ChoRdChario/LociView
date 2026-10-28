import * as THREE from 'three';
import type {GsFrame} from './gsRender';
import {verifyCompositionPolicy} from './compositionPolicy';
import {configureAccumulation,mrtShader,smoothAccumulationMaterial,smoothCoverage} from './smoothMaterial';
import type {CoverageMaterial} from './hardChroma';
import type {TargetBudget,TargetLayout,TargetLease,targetLayout} from './targetBudget';

/** Explicit model meshes only. Helpers are never inferred from transparent flags. */
export interface SmoothMesh {readonly object:THREE.Mesh}
export interface SmoothComposite {
  readonly layout:TargetLayout;readonly depthBits:number;readonly leaseBytes:number;
  render(scene:THREE.Scene,camera:THREE.Camera,meshes:readonly SmoothMesh[],gs?:GsFrame):void;
  dispose():void;
}
export interface SmoothPresentation {readonly budget:TargetBudget;readonly plan:typeof targetLayout;readonly create:typeof createSmoothComposite}

/** Own targets/material variants; borrow the GS base only for this exact generation. */
export async function createSmoothComposite(renderer:THREE.WebGLRenderer,budget:TargetBudget,layout:TargetLayout,gs?:GsFrame,signal?:AbortSignal):Promise<SmoothComposite>{
  signal?.throwIfAborted();await verifyCompositionPolicy();signal?.throwIfAborted();return allocateSmoothComposite(renderer,budget,layout,gs);
}
function allocateSmoothComposite(renderer:THREE.WebGLRenderer,budget:TargetBudget,layout:TargetLayout,gs?:GsFrame):SmoothComposite{
  const gl=renderer.getContext();if(!(gl instanceof WebGL2RenderingContext)||!gl.getExtension('EXT_color_buffer_float')||!gl.getExtension('EXT_float_blend')||gl.getParameter(gl.MAX_DRAW_BUFFERS)<2||gl.getParameter(gl.MAX_COLOR_ATTACHMENTS)<2)throw Error('この環境では滑らかな透過を表示できません。');
  gs?.claimBase();if(gs&&gs.baseBytes!==layout.width*layout.height*12)throw Error('GSの表示容量が一致しません。');
  const lease:TargetLease=budget.reserve(layout.width*layout.height*(gs?24:36)),ownedBase=!gs,materials=new Map<THREE.Material,THREE.Material>();
  let base:THREE.WebGLRenderTarget|undefined,mrt:THREE.WebGLRenderTarget|undefined,geometry:THREE.PlaneGeometry|undefined,resolve:THREE.ShaderMaterial|undefined,closed=false;
  const dispose=()=>{if(closed)return;const errors:unknown[]=[];
    const release=(action:()=>void)=>{try{action();}catch(error){errors.push(error);}};
    if(mrt){mrt.depthTexture=null;release(()=>mrt!.dispose());}if(ownedBase&&base)release(()=>base!.dispose());
    for(const material of materials.values())release(()=>material.dispose());materials.clear();if(geometry)release(()=>geometry!.dispose());if(resolve)release(()=>resolve!.dispose());
    if(errors.length)throw new AggregateError(errors,'透過表示の資源を解放できません。');closed=true;lease.release();
  };
  try{
    base=gs?.baseTarget??new THREE.WebGLRenderTarget(layout.width,layout.height,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,depthBuffer:true,samples:0,
      depthTexture:new THREE.DepthTexture(layout.width,layout.height,THREE.UnsignedIntType),minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    if(base.width!==layout.width||base.height!==layout.height||!base.depthTexture)throw Error('透過表示の奥行きが一致しません。');base.texture.colorSpace=THREE.LinearSRGBColorSpace;
    mrt=new THREE.WebGLRenderTarget(layout.width,layout.height,{count:2,type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:true,depthTexture:base.depthTexture,samples:0,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    mrt.textures[1]!.format=THREE.RGFormat;for(const texture of mrt.textures)texture.colorSpace=THREE.LinearSRGBColorSpace;
    geometry=new THREE.PlaneGeometry(2,2);resolve=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
      uniforms:{base:{value:base.texture},accum:{value:mrt.textures[0]},optical:{value:mrt.textures[1]}},
      vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`uniform sampler2D base,accum,optical;varying vec2 p;void main(){vec4 a=texture2D(accum,p);vec2 o=texture2D(optical,p).rg;float r=o.g>0.?0.:exp(-o.r);vec3 average=a.a>0.?a.rgb/a.a:vec3(0.);gl_FragColor=vec4(average*(1.-r)+texture2D(base,p).rgb*r,1.);
      #include <colorspace_fragment>
      }`});
    const output=new THREE.Scene(),outputCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);output.add(new THREE.Mesh(geometry,resolve));
    const withState=<T>(action:()=>T):T=>{
      const target=renderer.getRenderTarget(),cube=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),color=renderer.getClearColor(new THREE.Color()).clone(),alpha=renderer.getClearAlpha(),auto=renderer.autoClear;
      const check=renderer.debug.checkShaderErrors,onError=renderer.debug.onShaderError;let shaderError=false;
      renderer.autoClear=false;renderer.debug.checkShaderErrors=true;renderer.debug.onShaderError=(...args)=>{shaderError=true;onError?.(...args);};
      try{const result=action();if(shaderError||gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('滑らかな透過の描画を確認できません。');return result;}
      finally{renderer.debug.checkShaderErrors=check;renderer.debug.onShaderError=onError;renderer.setRenderTarget(target,cube,mip);renderer.setClearColor(color,alpha);renderer.autoClear=auto;}
    };
    const bind=(target:THREE.WebGLRenderTarget)=>{renderer.setRenderTarget(target);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('透過表示の領域を準備できません。');};
    let depthBits=0;
    // Exercise the actual attachments, float blending beyond16F, and shared opaque depth.
    withState(()=>{
      const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=3;
      const meshGeometry=new THREE.PlaneGeometry(2,2),opaque=new THREE.MeshBasicMaterial({color:0,depthWrite:true}),probe=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,
        vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:'layout(location=0) out vec4 color;layout(location=1) out vec4 optical;void main(){color=vec4(70000.,0.,0.,1.);optical=vec4(.25,1.,0.,0.);}'});
      configureAccumulation(probe);probe.depthTest=false;const mesh=new THREE.Mesh<THREE.PlaneGeometry,THREE.Material>(meshGeometry,opaque);mesh.position.z=1;scene.add(mesh);
      try{bind(base!);renderer.setClearColor(0,0);renderer.clear(true,true,false);renderer.render(scene,camera);depthBits=gl.getParameter(gl.DEPTH_BITS) as number;
        mesh.material=probe;mesh.position.z=0;bind(mrt!);renderer.setClearColor(0,0);renderer.clear(true,false,false);renderer.render(scene,camera);renderer.render(scene,camera);
        const pixel=new Float32Array(4);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);if(Math.abs(pixel[0]!-140000)>1||pixel[3]!==2)throw Error('透過表示の色の精度を確認できません。');
        gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);gl.readBuffer(gl.COLOR_ATTACHMENT0);if(pixel[0]!==.5||pixel[1]!==2)throw Error('透過表示の重なりを確認できません。');
        probe.depthTest=true;renderer.clear(true,false,false);renderer.render(scene,camera);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);if(pixel.some(v=>v!==0))throw Error('透過表示の前後関係を確認できません。');
      }finally{gl.readBuffer(gl.COLOR_ATTACHMENT0);meshGeometry.dispose();opaque.dispose();probe.dispose();}
    });
    const skip=new THREE.MeshBasicMaterial({visible:false});materials.set(skip,skip);
    const gsVariant=(frame:GsFrame)=>{let material=materials.get(frame.sourceMaterial) as THREE.ShaderMaterial|undefined;if(!material){material=frame.sourceMaterial.clone();material.uniforms=frame.sourceMaterial.uniforms;configureAccumulation(material);
      material.onBeforeCompile=shader=>{shader.fragmentShader=mrtShader(shader.fragmentShader,true);};material.customProgramCacheKey=()=> 'lociview-desktop-gs-mrt-1';materials.set(frame.sourceMaterial,material);}return material;};
    return {layout,depthBits,leaseBytes:lease.bytes,dispose,render(scene,camera,meshes,frame){
      if(closed||frame?.baseTarget!==gs?.baseTarget)throw Error('透過表示の世代が一致しません。');
      const visibility=new Map<THREE.Object3D,boolean>(),swaps=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>(),sourceVisibility=new Map<THREE.Material,boolean>(),background=scene.background;
      const allowed=new Set(meshes.map(row=>row.object));if(frame)allowed.add(frame.object);
      try{withState(()=>{
        for(const {object}of meshes)for(const material of Array.isArray(object.material)?object.material:[object.material])if(smoothCoverage(material)&&!sourceVisibility.has(material)){sourceVisibility.set(material,material.visible);material.visible=false;}
        if(frame){visibility.set(frame.object,frame.object.visible);frame.object.visible=false;}
        bind(base!);renderer.clear(true,true,false);renderer.render(scene,camera);
        for(const [material,visible]of sourceVisibility)material.visible=visible;sourceVisibility.clear();
        if(frame)frame.object.visible=visibility.get(frame.object)!;
        scene.background=null;
        // Hide only each draw, never its descendants: glTF may parent a smooth Mesh under an opaque Mesh.
        scene.traverse(object=>{if(object instanceof THREE.Mesh&&!allowed.has(object)){swaps.set(object,object.material);object.material=skip;}});
        for(const {object}of meshes){swaps.set(object,object.material);const convert=(source:THREE.Material)=>{if(!smoothCoverage(source))return skip;let material=materials.get(source);if(!material){material=smoothAccumulationMaterial(source as CoverageMaterial);materials.set(source,material);}return material;};object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);}
        bind(mrt!);renderer.setClearColor(0,0);renderer.clear(true,false,false);
        if(frame)frame.withMaterial(gsVariant(frame),()=>renderer.render(scene,camera));else renderer.render(scene,camera);
        renderer.setRenderTarget(null);renderer.render(output,outputCamera);
      });}finally{scene.background=background;for(const [object,material]of swaps)object.material=material;for(const [object,visible]of visibility)object.visible=visible;for(const [material,visible]of sourceVisibility)material.visible=visible;}
    }};
  }catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'透過表示を準備できません。');}throw error;}
}
