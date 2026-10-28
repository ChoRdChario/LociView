// Disposable01f evaluation. No product imports, persistence, network or private vendor APIs.
import * as THREE from 'three';
import {GaussianSplatRenderer,SplatMesh,SplatFileType} from 'gaussian-splat-lite';

const view=document.querySelector('#view'),status=document.querySelector('[role=status]');
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(960,540);renderer.autoClear=false;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
view.append(renderer.domElement);
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
const identity={vendor:gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),version:gl.getParameter(gl.VERSION),floatColor:!!gl.getExtension('EXT_color_buffer_float'),floatBlend:!!gl.getExtension('EXT_float_blend')};
if(!identity.floatColor||!identity.floatBlend){status.textContent='評価できません：浮動小数点の描画・合成に対応していません。保存データへの変更はありません。';throw Error('Float accumulation/blending targets are unavailable');}
const shaderErrors=[];renderer.debug.onShaderError=(_gl,program,vs,fs)=>{shaderErrors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].join('\n'));};
const scene=new THREE.Scene(),opaque=new THREE.Group(),transparent=new THREE.Group();scene.add(opaque,transparent,new THREE.AmbientLight(0xffffff,1));
const camera=new THREE.PerspectiveCamera(45,16/9,.1,100);camera.position.set(0,0,8);camera.lookAt(0,0,0);
const resources=new Set(),own=x=>(resources.add(x),x),quadScene=new THREE.Scene(),quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const quadGeometry=new THREE.PlaneGeometry(2,2),quadMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
 uniforms:{base:{value:null},accum:{value:null},reveal:{value:null},candidate:{value:0},logReveal:{value:0}},
 vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`uniform sampler2D base,accum,reveal;uniform float candidate,logReveal;varying vec2 p;
 void main(){vec4 b=texture2D(base,p);if(candidate>.5){vec4 a=texture2D(accum,p),v=texture2D(reveal,p);float r=logReveal>.5?(v.g>0.?0.:exp(-v.r)):clamp(v.r,0.,1.);b=vec4((a.a>0.?a.rgb/a.a:vec3(0.))*(1.-r)+b.rgb*r,1.);}gl_FragColor=b;
 #include <colorspace_fragment>
 }`});quadScene.add(new THREE.Mesh(quadGeometry,quadMaterial));
let targets,coordinator,splat,originalGs,derivedGs=[],meshMaterials=[],fixture='none',variant='dual',draws={};const checkedTargets=new WeakSet();
const waitFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function assertGl(stage){const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`WebGL evaluation error at ${stage}: ${error}`);}
function disposeTargets(){if(!targets)return;targets.accum.depthTexture=null;if(targets.reveal)targets.reveal.depthTexture=null;for(const t of Object.values(targets))t?.dispose();targets=undefined;}
function resize(width,height){disposeTargets();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
 const depth=new THREE.DepthTexture(width,height,THREE.UnsignedIntType);depth.format=THREE.DepthFormat;
 const target=()=>{const t=new THREE.WebGLRenderTarget(width,height,{format:THREE.RGBAFormat,type:THREE.HalfFloatType,depthBuffer:true,depthTexture:depth,samples:0,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});t.texture.colorSpace=THREE.LinearSRGBColorSpace;return t;};
 const accum=variant==='dual'?target():new THREE.WebGLRenderTarget(width,height,{count:2,type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:true,depthTexture:depth,samples:0,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});accum.texture.type=THREE.FloatType;
 if(variant==='mrt'){if(gl.getParameter(gl.MAX_DRAW_BUFFERS)<2||gl.getParameter(gl.MAX_COLOR_ATTACHMENTS)<2)throw Error('MRT attachments unavailable');accum.textures[1].format=THREE.RGFormat;accum.textures[1].type=THREE.FloatType;for(const t of accum.textures)t.colorSpace=THREE.LinearSRGBColorSpace;}
 targets={base:target(),accum,reveal:variant==='dual'?target():null};quadMaterial.uniforms.base.value=targets.base.texture;quadMaterial.uniforms.accum.value=targets.accum.texture;quadMaterial.uniforms.reveal.value=targets.reveal?.texture??targets.accum.textures[1];quadMaterial.uniforms.logReveal.value=variant==='mrt'?1:0;
 return {width,height,variant,extraTargetBytes:width*height*(16+8),sharedDepthBytes:width*height*4,format:variant==='dual'?'RGBA32F accumulation + RGBA16F revealage; borrowed opaque depth':'RGBA32F + RG32F additive optical depth/saturated count MRT; borrowed opaque depth'};
}
function derived(source,pass,isGs=false){const m=source.clone();if(isGs)m.uniforms=coordinator.uniforms;
 m.transparent=true;m.depthWrite=false;m.depthTest=true;m.toneMapped=false;m.side=source.side;
 m.blending=THREE.CustomBlending;m.blendEquation=m.blendEquationAlpha=THREE.AddEquation;
 m.blendSrc=m.blendSrcAlpha=pass!=='reveal'?THREE.OneFactor:THREE.ZeroFactor;
 m.blendDst=m.blendDstAlpha=pass!=='reveal'?THREE.OneFactor:THREE.OneMinusSrcAlphaFactor;
 // A guard is deliberate: a changed fixed public shader must fail instead of guessing.
 m.onBeforeCompile=shader=>{const token=/void\s+main\s*\(\s*\)/g;if([...shader.fragmentShader.matchAll(token)].length!==1)throw Error('Unexpected public fragment main');
  if(isGs&&shader.fragmentShader.split('out vec4 fragColor;').length!==2)throw Error('Unexpected public GS output');
  if(pass==='mrt'){if(isGs)shader.fragmentShader=shader.fragmentShader.replace('out vec4 fragColor;','layout(location=0) out vec4 fragColor;');shader.fragmentShader='layout(location=1) out vec4 lvAux;\n'+shader.fragmentShader;}
  const out=isGs?'fragColor':'gl_FragColor';shader.fragmentShader=shader.fragmentShader.replace(token,'void lvOriginalMain()')+`
  void main(){lvOriginalMain();float a=clamp(${out}.a,0.,1.);`+(pass!=='reveal'?`
  float w=clamp(pow(min(1.,a*10.)+.01,3.)*1e3*pow(1.-gl_FragCoord.z*.9,3.),.01,30.);
  ${out}=vec4(${out}.rgb*${isGs?'1.':'a'}*w,a*w);`+(pass==='mrt'?`if(a>=1.)lvAux=vec4(0.,1.,0.,0.);else{float tau=a<.001?a+a*a*.5+a*a*a/3.:-log(1.-a);lvAux=vec4(tau,0.,0.,0.);}`:'')+'}':`${out}=vec4(a);}`);
 };
 m.customProgramCacheKey=()=>`01f-eval-${pass}-${isGs}`;return own(m);
}
function panel(x,y,z,color,opacity=1,width=1,height=1,mask=false){const geometry=own(new THREE.PlaneGeometry(width,height)),material=own(new THREE.MeshBasicMaterial({color,opacity,transparent:opacity<1,depthWrite:opacity===1,side:THREE.DoubleSide,toneMapped:false}));
 if(mask){material.transparent=false;material.depthWrite=true;material.alphaTest=.5;const data=new Uint8Array([255,255,255,0,255,255,255,255]);const texture=own(new THREE.DataTexture(data,2,1,THREE.RGBAFormat));texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.needsUpdate=true;material.map=texture;}
 const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);(material.transparent?transparent:opaque).add(mesh);
 if(material.transparent)meshMaterials.push({mesh,original:material,accum:derived(material,'accum'),reveal:derived(material,'reveal'),mrt:derived(material,'mrt')});return mesh;
}
function ellipsoid(x,y,z,sx,sy,sz,color,opacity){const geometry=own(new THREE.SphereGeometry(1,24,12)),material=own(new THREE.MeshBasicMaterial({color,opacity,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false})),mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);transparent.add(mesh);meshMaterials.push({mesh,original:material,accum:derived(material,'accum'),reveal:derived(material,'reveal'),mrt:derived(material,'mrt')});return mesh;}
function gsBytes(count,bright=false){const rest=72,names=['x','y','z','nx','ny','nz','f_dc_0','f_dc_1','f_dc_2',...Array.from({length:rest},(_,i)=>`f_rest_${i}`),'opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'];
 const header=new TextEncoder().encode(['ply','format binary_little_endian 1.0',`element vertex ${count}`,...names.map(n=>`property float ${n}`),'end_header',''].join('\n')),bytes=new Uint8Array(header.length+count*names.length*4),v=new DataView(bytes.buffer);bytes.set(header);
 for(let i=0;i<count;i++){const big=count>256,cols=Math.ceil(Math.sqrt(count/6)),x=big?((i%cols)/(cols-1)-.5)*6:[-2,2,-.7,.7][i%4],y=big?((Math.floor(i/cols)%cols)/(cols-1)-.5)*3:0,z=big?((Math.floor(i/(cols*cols))%6)-2.5)*.25:((i%4)-1.5)*.2;
 const row=[x,y,z,0,0,0,...(bright?[96,48,24]:[.95,.25,.05]).map(c=>(c-.5)/.28209479177387814),...Array.from({length:rest},(_,k)=>Math.sin(i+k+1)*.001),big?-1.4:0,...Array(3).fill(Math.log(big?.012:.32)),1,0,0,0];for(let k=0;k<row.length;k++)v.setFloat32(header.length+(i*names.length+k)*4,row[k],true);}
 return bytes;
}
async function disposeFixture(){if(coordinator){coordinator.material=originalGs;coordinator.removeFromParent();coordinator.dispose();coordinator=undefined;}if(splat){splat.removeFromParent();splat.dispose();splat=undefined;}
 for(const r of resources)r.dispose();resources.clear();derivedGs=[];meshMaterials=[];opaque.clear();transparent.clear();renderer.renderLists.dispose();}
async function create({kind='panels',rows=8}={}){await disposeFixture();fixture=kind;camera.position.set(0,0,8);camera.lookAt(0,0,0);
 coordinator=new GaussianSplatRenderer({renderer,autoUpdate:false,encodeLinear:true,premultipliedAlpha:true,transparent:true,depthTest:true,depthWrite:false,maxStdDev:Math.sqrt(8),minPixelRadius:0,minAlpha:.5/255,preBlurAmount:.3,blurAmount:0,clipXY:4,focalAdjustment:2,sortRadial:false,fastSort:true,minSortIntervalMs:0,stochastic:false});
 originalGs=coordinator.material;if(!(originalGs instanceof THREE.ShaderMaterial))throw Error('Public WebGL ShaderMaterial required');
 derivedGs=[derived(originalGs,'accum',true),derived(originalGs,'reveal',true),derived(originalGs,'mrt',true)];scene.add(coordinator);
 const bytes=gsBytes(rows,kind==='bright');splat=new SplatMesh({fileBytes:bytes,fileType:SplatFileType.PLY,fileName:'owned-sh4.ply',editable:false,raycastable:false});splat.maxSh=4;splat.frustumCulled=false;scene.add(splat);await splat.initialized;
 if(splat.numSplats!==rows||splat.splats.getNumSh()!==4)throw Error('Incomplete SH4 source');
 if(kind==='extremes'){for(const [i,alpha]of [0,1-2**-24,1,2**-30].entries()){panel((i-1.5)*1.2,0,0,0xff5522,.5,1,1);const row=meshMaterials.at(-1);for(const m of [row.original,row.accum,row.reveal,row.mrt])m.opacity=alpha;}}
 else if(kind==='panels'){panel(-2,0,1,0x00ff00,1,1.2,2);panel(2,0,1,0x0000ff,1,1.2,2,true);panel(0,0,.3,0x00ffff,.5,6,2);}
 else if(kind==='layers'){for(let i=0;i<8;i++)panel(0,0,(i-3.5)*.18,new THREE.Color().setHSL(i/8,.8,.5),.25,4,2.2);panel(-1.4,0,1.1,0x00ff00,1,.4,2.5);}
 else {ellipsoid(0,0,0,2.7,.35,.45,0x56aaff,.3);ellipsoid(-.3,0,0,.7,.08,2.4,0x55ffaa,.35);ellipsoid(2.0,.4,0,.5,.8,.08,0xffaa55,.4);ellipsoid(1.8,0,0,.4,.08,.9,0xffaa55,.4);panel(0,-.8,-.5,0x555555,1,6,.2);}
 assertGl('decoded source');scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);await coordinator.update({scene,camera});assertGl('coordinator update');await waitFrame();coordinator.display.refreshTransforms(renderer);assertGl('transform refresh');render('candidate');
 return {kind,rows,degree:splat.splats.getNumSh(),identity,sourceBytes:bytes.length,materialShared:derivedGs.every(m=>m.uniforms===coordinator.uniforms),resources:resources.size};
}
function checkedTarget(t){renderer.setRenderTarget(t);if(!checkedTargets.has(t)){if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Evaluation framebuffer incomplete');checkedTargets.add(t);}}
function materialMode(mode){for(const x of meshMaterials)x.mesh.material=mode==='base'?x.original:x[mode];coordinator.material=mode==='base'?originalGs:derivedGs[mode==='accum'?0:mode==='reveal'?1:2];}
function render(mode='candidate',{gs=true,mesh=true}={}){if(!targets||!coordinator)throw Error('Create fixture first');scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);coordinator.display.refreshTransforms(renderer);
 opaque.visible=true;transparent.visible=mesh;coordinator.visible=gs;checkedTarget(targets.base);renderer.setClearColor(0x202832,1);renderer.clear(true,true,false);
 if(mode==='base'){materialMode('base');renderer.render(scene,camera);draws.base={...renderer.info.render};}
 else{transparent.visible=coordinator.visible=false;renderer.render(scene,camera);draws.opaque={...renderer.info.render};opaque.visible=false;transparent.visible=mesh;coordinator.visible=gs;
  materialMode(variant==='mrt'?'mrt':'accum');checkedTarget(targets.accum);renderer.setClearColor(0,0);renderer.clear(true,false,false);renderer.render(scene,camera);draws.accum={...renderer.info.render};
  if(variant==='dual'){materialMode('reveal');checkedTarget(targets.reveal);renderer.setClearColor(0xffffff,1);renderer.clear(true,false,false);renderer.render(scene,camera);draws.reveal={...renderer.info.render};}
 }
 renderer.setRenderTarget(null);quadMaterial.uniforms.candidate.value=mode==='base'?0:1;renderer.render(quadScene,quadCamera);
 opaque.visible=transparent.visible=coordinator.visible=true;if(shaderErrors.length)throw Error(shaderErrors.join('\n'));const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`WebGL evaluation error: ${error}`);
}
function pixels(){const size=renderer.getDrawingBufferSize(new THREE.Vector2()),bytes=new Uint8Array(size.x*size.y*4);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;}
function sample(x,y){const p=new THREE.Vector3(x,y,0).project(camera),size=renderer.getDrawingBufferSize(new THREE.Vector2()),v=new Uint8Array(4);gl.readPixels(Math.floor((p.x+1)*size.x/2),Math.floor((p.y+1)*size.y/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,v);return [...v];}
async function orderCheck(){render();const a=pixels();transparent.children.reverse();for(let i=0;i<transparent.children.length;i++)transparent.children[i].renderOrder=i+2;coordinator.renderOrder=1;render();const b=pixels();let max=0,changed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d>2)changed++;}return{max,changed,samples:[sample(-2,0),sample(0,0),sample(1.7,0),sample(2.3,0)],memory:structuredClone(renderer.info.memory)};}
function contribution(){render();const all=pixels(),delta={};for(const kind of ['gs','mesh']){render('candidate',{[kind]:false});const without=pixels();let count=0,max=0;for(let i=0;i<all.length;i+=4){const d=Math.max(...[0,1,2].map(c=>Math.abs(all[i+c]-without[i+c])));if(d>2)count++;max=Math.max(max,d);}delta[kind]={count,max};}render();return delta;}
function finiteAccum(){checkedTarget(targets.accum);const size=renderer.getDrawingBufferSize(new THREE.Vector2()),v=new Float32Array(size.x*size.y*4);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.FLOAT,v);let max=0,bad=0;for(const x of v){if(!Number.isFinite(x))bad++;max=Math.max(max,x);}renderer.setRenderTarget(null);return{max,bad,error:gl.getError()};}
function alphaExtremes(){setVariant('mrt');render('candidate',{gs:false});checkedTarget(targets.accum);const size=renderer.getDrawingBufferSize(new THREE.Vector2()),samples=[];
 try{for(let i=0;i<4;i++){const p=new THREE.Vector3((i-1.5)*1.2,0,0).project(camera),accum=new Float32Array(4),aux=new Float32Array(4),x=Math.floor((p.x+1)*size.x/2),y=Math.floor((p.y+1)*size.y/2);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,accum);gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,aux);samples.push({accum:[...accum],aux:[...aux]});}assertGl('MRT auxiliary alpha readback');return samples;}
 finally{gl.readBuffer(gl.COLOR_ATTACHMENT0);renderer.setRenderTarget(null);}}
function setVariant(next){if(!['dual','mrt'].includes(next))throw Error('Unknown evaluation variant');variant=next;const {width,height}=targets.base;return resize(width,height);}
function compareVariants(){setVariant('dual');render();const a=pixels();setVariant('mrt');render();const b=pixels();let max=0,changed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d>2)changed++;}return{max,changed};}
async function sweep(){const frames=[];for(let i=0;i<36;i++){const angle=i/36*Math.PI*2;camera.position.set(Math.sin(angle)*8,1.0,Math.cos(angle)*8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);await coordinator.update({scene,camera});render();const p=pixels();let lit=0;for(let k=0;k<p.length;k+=4)if(p[k]>75||p[k+1]>75||p[k+2]>90)lit++;frames.push({angle,lit,...(i%3===0?{contribution:contribution(),order:await orderCheck()}:{} )});}return{frames,materialOwned:derivedGs.includes(coordinator.material),uniformsShared:derivedGs.every(m=>m.uniforms===coordinator.uniforms)};}
async function reference({angle=0,elevation=4}={}){camera.position.set(Math.sin(angle)*8,elevation,Math.cos(angle)*8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);await coordinator.update({scene,camera});render();}
async function benchmark({frames=80,warmup=20}={}){const stats={},query=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[],pooled={base:[],candidate:[]},gpu={base:[],candidate:[]};
 const percentile=(samples,p)=>samples.toSorted((a,b)=>a-b)[Math.floor(samples.length*p)];
 for(const mode of ['base','candidate','base','candidate']){for(let i=0;i<warmup;i++){render(mode);gl.finish();await waitFrame();}const times=[];for(let i=0;i<frames;i++){await waitFrame();const q=query?gl.createQuery():null;if(q)gl.beginQuery(query.TIME_ELAPSED_EXT,q);const t=performance.now();render(mode);if(q)gl.endQuery(query.TIME_ELAPSED_EXT);gl.finish();times.push(performance.now()-t);if(q)pending.push({q,mode});}pooled[mode].push(...times);(stats[mode]??=[]).push({p50:percentile(times,.5),p95:percentile(times,.95),min:Math.min(...times),max:Math.max(...times),frames});}
 const deadline=performance.now()+10000;while(pending.length&&performance.now()<deadline){for(let i=pending.length-1;i>=0;i--){const {q,mode}=pending[i];if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){gpu[mode].push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);pending.splice(i,1);}}if(pending.length)await waitFrame();}
 const disjoint=query?!!gl.getParameter(query.GPU_DISJOINT_EXT):null;for(const {q}of pending)gl.deleteQuery(q);
 const summary={base:percentile(pooled.base,.95),candidate:percentile(pooled.candidate,.95),gpuBase:gpu.base.length?percentile(gpu.base,.95):null,gpuCandidate:gpu.candidate.length?percentile(gpu.candidate,.95):null};
 return {fixture,variant,stats,summary,pooled,gpu,timerQueryAvailable:!!query,timerDisjoint:disjoint,timerIncomplete:pending.length,method:'CPU submission plus gl.finish (Chromium Flush, NOT a GPU fence); pooled paired repeats. GPU query separate; rAF excluded',identity};}
async function trace({mode='candidate',seconds=120}={}){const intervals=[],cpu=[],sorts=[];let sorting=false,lastSort,previous,sortRequests=0;
 for(let i=0;i<20;i++){await waitFrame();render(mode);}const start=performance.now();
 while(performance.now()-start<seconds*1000){const ts=await new Promise(resolve=>requestAnimationFrame(resolve));if(previous!==undefined)intervals.push(ts-previous);previous=ts;
  const begin=performance.now(),angle=(ts-start)/(seconds*1000)*2*Math.PI;camera.position.set(Math.sin(angle)*8,1.0,Math.cos(angle)*8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
  if(!sorting){sorting=true;sortRequests++;const t=performance.now();lastSort=coordinator.update({scene,camera}).then(()=>sorts.push(performance.now()-t)).finally(()=>{sorting=false;});}
  render(mode);cpu.push(performance.now()-begin);
 }
 await lastSort;const p=(samples,percentile)=>samples.toSorted((a,b)=>a-b)[Math.floor(samples.length*percentile)];
 return{mode,seconds,elapsed:performance.now()-start,frames:cpu.length,p50:p(intervals,.5),p95:p(intervals,.95),max:Math.max(...intervals),cpuP95:p(cpu,.95),sortP95:p(sorts,.95),sortRequests,visibility:document.visibilityState,intervals,cpu};}
async function contextRestore(){const ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('Context restore extension unavailable');const kind=fixture,rows=splat.numSplats;
 // Match the existing viewport's loss -> release -> restored -> recreate ownership.
 // Disposing old vendor GL objects after restoration instead produces stale-object INVALID_OPERATION.
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Context restoration timeout')),15000);renderer.domElement.addEventListener('webglcontextrestored',()=>{clearTimeout(timeout);resolve();},{once:true});renderer.domElement.addEventListener('webglcontextlost',async event=>{event.preventDefault();try{await disposeFixture();disposeTargets();setTimeout(()=>ext.restoreContext(),100);}catch(error){clearTimeout(timeout);reject(error);}},{once:true});ext.loseContext();});
 assertGl('restoration event');if(!gl.getExtension('EXT_color_buffer_float')||!gl.getExtension('EXT_float_blend'))throw Error('Float extensions did not restore');
 resize(960,540);assertGl('resize after restoration');await create({kind,rows});render();return{identity,memory:structuredClone(renderer.info.memory),contribution:contribution()};}
async function cycles({count=20}={}){const records=[];for(let i=0;i<count;i++){await create({kind:'layers',rows:8});render();await disposeFixture();renderer.setRenderTarget(null);renderer.render(quadScene,quadCamera);records.push(structuredClone(renderer.info.memory));}return records;}
resize(960,540);window.smoothEval={identity,create,render,sample,orderCheck,sweep,reference,contribution,finiteAccum,alphaExtremes,setVariant,compareVariants,benchmark,trace,resize:({width,height})=>resize(width,height),contextRestore,cycles,disposeFixture,
 diagnostics:()=>({shaderErrors,resources:resources.size,memory:structuredClone(renderer.info.memory),draws,drawnInstances:coordinator?.geometry.instanceCount})};
status.textContent=JSON.stringify({ready:true,identity},null,2);
