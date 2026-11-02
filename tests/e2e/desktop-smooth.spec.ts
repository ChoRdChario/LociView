import { desktopOrigin, desktopEntry } from './desktopEntry';
import {beginMaterialEditing} from './workspaceUi';
import { lookAlongFront } from './workspaceUi';
import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {sourceMaterialPanelsGlb,meshSources} from './fixtures';
import {defaultPose,fittedPose} from '../../src/projectScene/viewportModel';
import {presentedCanvas} from './presentedCanvas';
import {gsFixture} from '../helpers/gsFixture';

test('01g small mixed Mesh and GS keeps current variants through preview, cancel and camera frames',async({page:p},info)=>{
  const errors:string[]=[];p.on('pageerror',error=>errors.push(error.message));
  await p.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===desktopOrigin||['blob:','data:'].includes(url.protocol)?route.continue():route.abort('blockedbyclient');});
  const gs=Buffer.from(gsFixture(4,[[0,1.2,.5,0,0,0,1,-1,-1,...Array(72).fill(.001),0,...Array(3).fill(Math.log(.25)),1,0,0,0]]));
  await p.goto(desktopEntry);
  await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles([{name:'透過.glb',mimeType:'model/gltf-binary',buffer:sourceMaterialPanelsGlb(j=>{j.materials[2].alphaMode='BLEND';})},{name:'全係数.ply',mimeType:'application/ply',buffer:gs}]);
  await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByLabel('プロジェクト名',{exact:true}).fill('小さい合成の確認');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
  const canvas=p.getByLabel('3Dモデルの表示',{exact:true}),status=p.locator('.lv-project-viewport-status');
  const ready=async()=>{await expect(status).toContainText('透過表示（近似）',{timeout:180000});await expect(canvas).toHaveAttribute('aria-busy','false');await expect(status).not.toContainText('確認できません');await expect(status).not.toContainText('非表示');};
  await ready();await lookAlongFront(p);const withGs=(await presentedCanvas(canvas)).red;
  await p.getByRole('tab',{name:'モデル',exact:true}).click();const models=p.getByRole('tabpanel',{name:'モデル',exact:true});await models.locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();await models.getByRole('button',{name:'隠す',exact:true}).click();await ready();
  const withoutGs=(await presentedCanvas(canvas)).red;expect(withGs).toBeGreaterThan(withoutGs);
  await models.getByRole('button',{name:'表示',exact:true}).click();await ready();await expect.poll(async()=>(await presentedCanvas(canvas)).red).toBe(withGs);
  await p.getByRole('tab',{name:'描画',exact:true}).click();const panel=p.getByRole('region',{name:'材質',exact:true});await panel.getByLabel('モデル',{exact:true}).selectOption({label:'透過.glb'});await panel.getByLabel('マテリアル',{exact:true}).selectOption({label:'材質 3'});
  const options={style:'.lv-project-markers,.lv-development-pin-layer,.lv-caption-windows,.lv-caption-window-line,.lv-context-help-note{visibility:hidden!important}'};
  const original=await canvas.screenshot(options);await panel.getByLabel('不透明度（%）',{exact:true}).fill('50');await ready();const preview=await canvas.screenshot(options);expect(Buffer.compare(original,preview)).not.toBe(0);
  await panel.getByRole('button',{name:'取り消す',exact:true}).click();await panel.getByRole('button',{name:'変更を取り消す',exact:true}).click();await ready();expect(Buffer.compare(original,await canvas.screenshot(options))).toBe(0);
  const rect=(await canvas.boundingBox())!;await p.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await p.mouse.down();await p.mouse.move(rect.x+rect.width/2+30,rect.y+rect.height/2+10,{steps:8});await p.mouse.up();await ready();
  const allocation=await canvas.evaluate((node:HTMLCanvasElement)=>({width:node.width,height:node.height,view:Number(node.dataset.compositionBytes),document:Number(node.dataset.compositionDocumentBytes)}));
  expect(allocation.view).toBe(allocation.width*allocation.height*36);expect(allocation.document).toBe(allocation.view);expect(allocation.document).toBeLessThan(64*1024*1024);expect(errors).toEqual([]);
  await p.screenshot({path:info.outputPath('mixed-current-variants.png')});await info.attach('mixed-render',{body:JSON.stringify({withGs,withoutGs,allocation,errors}),contentType:'application/json'});
});

test('01g Mesh-only smooth displays with shared-depth budget, resize and local fallback',async({page:p},info)=>{
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===desktopOrigin||['blob:','data:'].includes(u.protocol)?r.continue():r.abort('blockedbyclient');});
  await p.addInitScript(()=>{const check=WebGL2RenderingContext.prototype.checkFramebufferStatus;WebGL2RenderingContext.prototype.checkFramebufferStatus=function(target){
    if((window as any).smoothTargetFault&&this.getParameter(this.FRAMEBUFFER_BINDING)&&this.getFramebufferAttachmentParameter(this.FRAMEBUFFER,this.COLOR_ATTACHMENT1,this.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)!==this.NONE)return this.FRAMEBUFFER_UNSUPPORTED;
    return check.call(this,target);
  };});
  try{
    await p.goto(desktopEntry);await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'透過の面.glb',mimeType:'model/gltf-binary',buffer:sourceMaterialPanelsGlb(j=>{j.materials[2].alphaMode='BLEND';})});
    await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('透過表示の統合');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
    const status=p.locator('.lv-project-viewport-status'),canvas=p.getByLabel('3Dモデルの表示',{exact:true});await expect(status).toContainText('透過表示（近似）',{timeout:180000});await expect(canvas).toHaveAttribute('aria-busy','false');
    await lookAlongFront(p);
    const sample=async(x:number)=>{const box=(await canvas.boundingBox())!,pose=fittedPose({min:[-4,-1,0],max:[4,1,0]},defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');const camera=new THREE.PerspectiveCamera(pose.projection.verticalFov*180/Math.PI,box.width/box.height,.000001,1e9);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const n=new THREE.Vector3(x,0,0).project(camera);return(await presentedCanvas(canvas,n.x*box.width/2,-n.y*box.height/2)).sample;};
    const background=[232,230,226];await expect.poll(async()=> (await sample(2.5)).slice(0,3)).toEqual(background);const blended=await sample(3.5);expect(blended.slice(0,3)).not.toEqual(background);
    const before=await canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,css:c.getBoundingClientRect().toJSON(),bytes:Number(c.dataset.compositionBytes)}));expect(before.bytes).toBe(before.width*before.height*36);expect(before.bytes).toBeLessThan(64*1024*1024);
    await p.setViewportSize({width:3840,height:2160});await expect(status).toContainText('表示の細かさを自動調整');await expect(canvas).toHaveAttribute('aria-busy','false');
    const scaled=await canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,css:c.getBoundingClientRect().toJSON(),bytes:Number(c.dataset.compositionBytes),scale:Number(c.dataset.renderScale)}));expect(scaled.scale).toBeLessThan(1);expect(scaled.bytes).toBe(scaled.width*scaled.height*36);expect(scaled.bytes).toBeLessThan(64*1024*1024);expect(scaled.width).toBeLessThan(scaled.css.width);
    await expect.poll(async()=> (await sample(2.5)).slice(0,3)).toEqual(background);const opaque=(await sample(-3)).slice(0,3);expect(opaque).not.toEqual(background);await p.screenshot({path:info.outputPath('adaptive-smooth.png'),fullPage:true});
    await p.evaluate(()=>{(window as any).smoothTargetFault=true;});await p.setViewportSize({width:3800,height:2150});await expect(status).toContainText('透過の面は非表示');await expect(canvas).toHaveAttribute('aria-busy','false');await expect.poll(async()=> (await sample(3.5)).slice(0,3)).toEqual(background);
    expect((await sample(-3)).slice(0,3)).toEqual(opaque);
    await p.evaluate(()=>{(window as any).smoothTargetFault=false;});await p.getByRole('button',{name:'3D表示を再試行',exact:true}).click();await expect(status).toContainText('透過表示（近似）');expect((await sample(-3)).slice(0,3)).toEqual(opaque);expect(errors).toEqual([]);
    await info.attach('layout',{body:JSON.stringify({before,scaled,blended,errors}),contentType:'application/json'});
  }finally{await p.screenshot({path:info.outputPath('last.png'),fullPage:true}).catch(()=>{});await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});}
});

test('01g OBJ Phong retains its lighting shader while opacity0 and fractional opacity render',async({page:p},info)=>{
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===desktopOrigin||['blob:','data:'].includes(u.protocol)?r.continue():r.abort('blockedbyclient');});
  await p.goto(desktopEntry);await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'照明あり.obj',mimeType:'text/plain',buffer:meshSources().find(s=>s.format==='obj')!.bytes});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('Phongの透過');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('Phongの透過',{timeout:180000});
  await p.getByRole('tab',{name:'描画',exact:true}).click();const panel=p.getByRole('region',{name:'材質',exact:true});await panel.getByLabel('モデル',{exact:true}).selectOption({label:'照明あり.obj'});await panel.getByLabel('マテリアル',{exact:true}).selectOption({label:'マテリアル 1'});
  const apply=async(value:string,lighting?:string)=>{await beginMaterialEditing(panel);await panel.getByLabel('不透明度（%）',{exact:true}).fill(value);if(lighting)await panel.getByLabel('照明',{exact:true}).selectOption(lighting);await panel.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await expect(p.locator('.lv-project-viewport-status')).toContainText('透過表示（近似）');};
  await apply('0');await lookAlongFront(p);const canvas=p.getByLabel('3Dモデルの表示',{exact:true});
  // The source has two material triangles; the square center is their shared edge.
  const box=(await canvas.boundingBox())!,pose=fittedPose({min:[0,0,0],max:[1,1,0]},defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');const camera=new THREE.PerspectiveCamera(pose.projection.verticalFov*180/Math.PI,box.width/box.height,.000001,1e9);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const ndc=new THREE.Vector3(.75,.25,0).project(camera),sample=async()=>(await presentedCanvas(canvas,ndc.x*box.width/2,-ndc.y*box.height/2)).sample.slice(0,3);
  await expect.poll(sample).toEqual([232,230,226]);await apply('50');await expect.poll(sample).not.toEqual([232,230,226]);const lit=await sample();await apply('50','unlit');await expect.poll(sample).not.toEqual(lit);const unlit=await sample();await apply('50','inherit');await expect.poll(sample).toEqual(lit);expect(errors).toEqual([]);await info.attach('same-opacity-lighting',{body:JSON.stringify({lit,unlit}),contentType:'application/json'});await p.screenshot({path:info.outputPath('phong-fractional-opacity.png'),fullPage:true});
});

test('01g preparation resize discards stale layouts and raw FLOAT alpha2 is clamped only after opacity',async({page:p},info)=>{
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===desktopOrigin||['blob:','data:'].includes(u.protocol)?r.continue():r.abort('blockedbyclient');});
  await p.addInitScript(()=>{const original=crypto.subtle.digest;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});(window as any).releaseSmoothPolicy=release;
    crypto.subtle.digest=async function(algorithm:AlgorithmIdentifier,data:BufferSource){if(data.byteLength<8192&&new TextDecoder().decode(data).includes('"id": "lociview-desktop-smooth-mrt-1"')){(window as any).smoothPolicyWaiting=true;await gate;}return Reflect.apply(original,this,[algorithm,data]);};
  });
  await p.goto(desktopEntry);await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'生alpha2.glb',mimeType:'model/gltf-binary',buffer:sourceMaterialPanelsGlb(j=>{j.materials[2].alphaMode='BLEND';j.materials[2].pbrMetallicRoughness.baseColorFactor[3]=1;},2)});
  await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('最終alphaと準備世代');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
  await p.waitForFunction(()=>!!(window as any).smoothPolicyWaiting);const canvas=p.getByLabel('3Dモデルの表示',{exact:true}),status=p.locator('.lv-project-viewport-status'),old=await canvas.evaluate((c:HTMLCanvasElement)=>[c.width,c.height]);
  await p.setViewportSize({width:3840,height:2160});await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement)=>c.width*c.height)).toBeGreaterThan(old[0]!*old[1]!);await p.evaluate(()=>(window as any).releaseSmoothPolicy());
  await expect(status).toContainText('透過表示（近似）');await expect(canvas).toHaveAttribute('aria-busy','false');const actual=await canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,bytes:Number(c.dataset.compositionBytes),scale:Number(c.dataset.renderScale),css:c.getBoundingClientRect().toJSON(),dpr:devicePixelRatio}));expect(actual.bytes).toBe(actual.width*actual.height*36);expect(actual.width*actual.height).toBeGreaterThan(old[0]!*old[1]!);expect(actual.width).toBe(Math.floor(actual.css.width*actual.dpr*actual.scale+.5));expect(actual.height).toBe(Math.floor(actual.css.height*actual.dpr*actual.scale+.5));expect(actual.bytes).toBeLessThan(64*1024*1024);
  await p.getByRole('tab',{name:'描画',exact:true}).click();const panel=p.getByRole('region',{name:'材質',exact:true});await panel.getByLabel('モデル',{exact:true}).selectOption({label:'生alpha2.glb'});await panel.getByLabel('マテリアル',{exact:true}).selectOption({label:'材質 3'});await beginMaterialEditing(panel);await panel.getByLabel('照明',{exact:true}).selectOption('unlit');await panel.getByLabel('不透明度（%）',{exact:true}).fill('50');await panel.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await expect(status).toContainText('透過表示（近似）');await lookAlongFront(p);
  const box=(await canvas.boundingBox())!,pose=fittedPose({min:[-4,-1,0],max:[4,1,0]},defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');const camera=new THREE.PerspectiveCamera(pose.projection.verticalFov*180/Math.PI,box.width/box.height,.000001,1e9);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const ndc=new THREE.Vector3(3.5,0,0).project(camera);
  await expect.poll(async()=>(await presentedCanvas(canvas,ndc.x*box.width/2,-ndc.y*box.height/2)).sample.slice(0,3)).toEqual([40,120,200]);expect(errors).toEqual([]);await info.attach('latest-layout',{body:JSON.stringify({old,actual,errors}),contentType:'application/json'});await p.screenshot({path:info.outputPath('raw-alpha2-latest-layout.png'),fullPage:true});
});

test('01g sourceMASK predicate precedes fractional appearance on actual GPU pixels',async({page:p},info)=>{
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===desktopOrigin||['blob:','data:'].includes(u.protocol)?r.continue():r.abort('blockedbyclient');});
  await p.goto(desktopEntry);await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'元が切り抜き.glb',mimeType:'model/gltf-binary',buffer:sourceMaterialPanelsGlb()});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByLabel('プロジェクト名',{exact:true}).fill('切り抜きと不透明度');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await expect(p.getByLabel('3Dモデルの表示',{exact:true})).toHaveAttribute('aria-busy','false',{timeout:180000});
  await p.getByRole('tab',{name:'描画',exact:true}).click();const m=p.getByRole('region',{name:'材質',exact:true});await m.getByLabel('モデル',{exact:true}).selectOption({label:'元が切り抜き.glb'});await m.getByLabel('マテリアル',{exact:true}).selectOption({label:'材質 3'});await beginMaterialEditing(m);await m.getByLabel('照明',{exact:true}).selectOption('unlit');await m.getByLabel('不透明度（%）',{exact:true}).fill('50');await m.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await expect(p.locator('.lv-project-viewport-status')).toContainText('透過表示（近似）');await lookAlongFront(p);
  const canvas=p.getByLabel('3Dモデルの表示',{exact:true}),box=(await canvas.boundingBox())!,pose=fittedPose({min:[-4,-1,0],max:[4,1,0]},defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');const camera=new THREE.PerspectiveCamera(pose.projection.verticalFov*180/Math.PI,box.width/box.height,.000001,1e9);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);
  const sample=async(x:number)=>{const n=new THREE.Vector3(x,0,0).project(camera);return(await presentedCanvas(canvas,n.x*box.width/2,-n.y*box.height/2)).sample.slice(0,3);},expected=new THREE.Color(0x2878c8).lerp(new THREE.Color(0xe8e6e2),.5).getRGB({r:0,g:0,b:0},THREE.SRGBColorSpace),rgb=[expected.r,expected.g,expected.b].map(v=>Math.round(v*255));
  await expect.poll(()=>sample(2.5)).toEqual([232,230,226]);await expect.poll(()=>sample(3.5)).toEqual(rgb);expect(errors).toEqual([]);await info.attach('sourceMASK-half-opacity',{body:JSON.stringify({rgb,errors}),contentType:'application/json'});await p.screenshot({path:info.outputPath('source-mask-then-appearance.png'),fullPage:true});
});
