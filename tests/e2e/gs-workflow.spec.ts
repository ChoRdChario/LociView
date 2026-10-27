import { test,expect,chromium,type Page,type BrowserContext,type TestInfo } from '@playwright/test';
import { mkdir,mkdtemp,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as A from '@automerge/automerge';
import * as THREE from 'three';
import {defaultPose,fittedPose} from '../../src/harness/projectScene/viewportModel';
import { gsFixture } from '../helpers/gsFixture';
import { triangleGlb,smallPng } from './fixtures';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
const entry='http://127.0.0.1:4182/dev.html?editor=project';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const files=(p:Page)=>p.getByRole('region',{name:'ファイル',exact:true});
const modelPanel=(p:Page)=>p.getByRole('tabpanel',{name:'モデル',exact:true});
const sh4Row=Array(89).fill(0);sh4Row[28]=.5;sh4Row[82]=sh4Row[83]=sh4Row[84]=Math.log(.3);sh4Row[85]=1;
const source=Buffer.from(gsFixture(4,Array.from({length:256},()=>sh4Row))),proxy=triangleGlb();
async function guardWholeGsReads(context:BrowserContext){
  await context.addInitScript(()=>{
    const original=Blob.prototype.arrayBuffer;(window as any).wholeGsReads=0;
    Blob.prototype.arrayBuffer=async function(){
      if(this.size>65536){const prefix=new Uint8Array(await original.call(Blob.prototype.slice.call(this,0,32)));
        if(new TextDecoder().decode(prefix).startsWith('ply\nformat binary_little_endian')){(window as any).wholeGsReads++;throw Error('Whole GS arrayBuffer forbidden');}}
      return original.call(this);
    };
  });
}
async function ready(p:Page){await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('GSの作業',{timeout:90_000});}
async function gsReady(p:Page){await expect(p.locator('.lv-project-viewport-status')).toBeEmpty({timeout:90_000});}
async function addProxy(p:Page,name='面.glb',z=0){
  await p.getByRole('tab',{name:'モデル',exact:true}).click();const area=modelPanel(p);
  await area.locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();
  const chooser=p.waitForEvent('filechooser');await area.getByRole('button',{name:/^位置指定用の面を(?:追加|変更)$/,exact:true}).click();await(await chooser).setFiles({name,mimeType:'model/gltf-binary',buffer:triangleGlb(z)});
  const confirm=area.getByRole('button',{name:/^(?:このモデルに面を追加|面の変更を確定)$/,exact:true});await expect(confirm).toBeVisible();await confirm.click();await expect(p.getByText('位置指定用の面を登録しました。',{exact:true})).toBeVisible();await gsReady(p);
}
async function download(p:Page,info:TestInfo,name:string,purpose:'backup'|'teamWorkspace'|'contribution'|'review'|'clean',base?:string){
  const area=files(p);
  if(purpose==='review'||purpose==='clean'){const more=area.locator('summary').filter({hasText:/^その他$/});if(!await more.evaluate(n=>(n.parentElement as HTMLDetailsElement).open))await more.click();await area.getByRole('button',{name:purpose==='review'?'シーンを共有':'独立コピーを作る',exact:true}).click();}
  else await area.getByRole('button',{name:purpose==='backup'?'保存':'相手に渡す',exact:true}).click();
  if(purpose==='backup')await area.getByLabel('名前（任意）',{exact:true}).fill(name);
  else if(purpose!=='review'&&purpose!=='clean'){await area.getByLabel('渡す内容',{exact:true}).selectOption(purpose);if(base)await area.getByLabel('元にする作業一式',{exact:true}).selectOption(base);}
  if(purpose==='clean')await area.getByRole('button',{name:'内容を確認',exact:true}).click();
  if(purpose==='review'){const scenes=area.getByLabel('渡すシーン',{exact:true});await scenes.selectOption((await scenes.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).filter(Boolean)))[0]!);await area.getByRole('button',{name:'内容を確認',exact:true}).click();}
  const primary=area.locator('button.lv-file-primary');await expect(primary).toBeEnabled({timeout:180_000});const [file]=await Promise.all([p.waitForEvent('download',{timeout:180_000}),primary.click()]);const path=info.outputPath(`${name}.zip`);await file.saveAs(path);expect(await file.failure()).toBeNull();await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy','false',{timeout:180_000});return path;
}
async function inspectBackup(path:string){const backup=await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]),validationMetadataLimits),c=await inspectProjectCandidates(backup.source.read(),validationMetadataLimits);if(c.kind!=='project-candidate-inspection')throw Error('GS backup');
  expect(Buffer.from(await backup.archive.entryBytes(`blobs/sha256/${hash(source)}`,source.length))).toEqual(source);return {backup,records:c.unambiguousRecords as Record<string,any>};}
async function pixels(p:Page){return p.getByLabel('3Dモデルの表示',{exact:true}).evaluate((canvas:HTMLCanvasElement)=>new Promise<number[]>(resolve=>requestAnimationFrame(()=>{const gl=canvas.getContext('webgl2')!,out=new Uint8Array(4);gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);resolve([...out]);})));}
async function gsPainted(p:Page){await expect.poll(()=>p.getByLabel('3Dモデルの表示',{exact:true}).evaluate((canvas:HTMLCanvasElement)=>new Promise<number>(resolve=>requestAnimationFrame(()=>{const gl=canvas.getContext('webgl2')!,b=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,b);let colored=0;for(let i=0;i<b.length;i+=4)if(b[i]!>b[i+1]!+10&&Math.abs(b[i+1]!-b[i+2]!)<10)colored++;resolve(colored);}))),{timeout:90_000}).toBeGreaterThan(20);}
test('SH4と面の登録・記録・ファイル受渡し・復元・cold再開を接続する',async({},info)=>{
  test.setTimeout(900_000);A.getHeads(A.init());const dir='.artifacts/e2e/profiles';await mkdir(dir,{recursive:true});const profiles=await Promise.all(['a','b','r','v','c'].map(n=>mkdtemp(join(dir,`gs-${n}-`)))),contexts=new Set<BrowserContext>(),errors:string[]=[];
  const launch=async(index:number)=>{const context=await chromium.launchPersistentContext(profiles[index]!,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});contexts.add(context);context.setDefaultTimeout(15_000);await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    await guardWholeGsReads(context);
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===new URL(entry).origin||['blob:','data:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
    const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(entry);return {page,context};};
  const close=async(c:BrowserContext,name:string)=>{expect(await c.pages()[0]!.evaluate(()=>(window as any).wholeGsReads)).toBe(0);await c.tracing.stop({path:info.outputPath(`${name}-trace.zip`)});await c.close();contexts.delete(c);};
  try{
    let a=await launch(0),p=a.page;
    await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'全係数.ply',mimeType:'application/ply',buffer:source});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('GSの作業');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(p);await gsReady(p);
    await p.getByRole('button',{name:'正面',exact:true}).click();const before=await pixels(p);expect(before[0]!).toBeGreaterThan(before[1]!+10);await addProxy(p);
    await p.getByRole('tab',{name:'モデル',exact:true}).click();const meshChooser=p.waitForEvent('filechooser');await modelPanel(p).getByRole('button',{name:'3Dモデルを追加',exact:true}).click();await(await meshChooser).setFiles({name:'独立モデル.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await expect(p.getByText('モデルを追加しました。',{exact:true})).toBeVisible();
    await modelPanel(p).locator('.lv-model-select').filter({hasText:'独立モデル.glb'}).click();await modelPanel(p).getByRole('button',{name:'配置を調整',exact:true}).click();await modelPanel(p).getByLabel('モデル位置 X',{exact:true}).fill('3');await modelPanel(p).getByRole('button',{name:'配置を確定',exact:true}).click();await expect(p.getByText('モデルの配置を確定しました。',{exact:true})).toBeVisible();await modelPanel(p).locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();
    await gsReady(p);await p.getByRole('button',{name:'正面',exact:true}).click();await p.getByRole('tab',{name:'キャプション',exact:true}).click();await p.getByRole('button',{name:'ピンを追加',exact:true}).click();const canvas=p.getByLabel('3Dモデルの表示',{exact:true}),box=(await canvas.boundingBox())!,extent=4*Math.exp(Math.fround(Math.log(.3))),pose=fittedPose({min:[-extent,-extent,-extent],max:[4,2,extent]},defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');const camera=new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(pose.projection.verticalFov),box.width/box.height,.01,100);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const hit=new THREE.Vector3(.1,.2,0).project(camera);await canvas.click({position:{x:(hit.x+1)*box.width/2,y:(1-hit.y)*box.height/2}});
    await p.getByLabel('位置 X',{exact:true}).fill('0.2');await p.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(p.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible();
    const detail=p.getByRole('region',{name:'キャプションの詳細',exact:true});await detail.getByLabel('タイトル',{exact:true}).fill('GSの記録');await detail.getByLabel('本文',{exact:true}).fill('全次数を保持');await detail.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('変更を適用しました。',{exact:true})).toBeVisible();
    const chooser=p.waitForEvent('filechooser');await p.getByLabel('メディアを追加',{exact:true}).click();await(await chooser).setFiles({name:'写真.png',mimeType:'image/png',buffer:smallPng()});await expect(p.getByText('メディアを追加しました。',{exact:true})).toBeVisible();
    const first=await download(p,info,'gs-first','backup'),saved=await inspectBackup(first);const gs=Object.values(saved.records.representationsById).find((r:any)=>r.role==='gsPrimary') as any,caption=Object.values(saved.records.captionsById)[0] as any;
    expect(caption.anchor).toMatchObject({positionAsset:[.2,expect.any(Number),expect.any(Number)],hitEvidence:{method:'manual'}});expect(caption.anchor.hitEvidence.source).toBeUndefined();expect(gs.materialCatalog).toBeUndefined();expect(Object.values(saved.records.representationsById).filter((r:any)=>r.role==='meshPrimary')).toHaveLength(1);
    await addProxy(p,'面2.glb');const remove=modelPanel(p).getByRole('button',{name:'位置指定用の面を外す',exact:true});await remove.click();await modelPanel(p).getByRole('button',{name:'面を外す',exact:true}).click();await expect(p.getByText('位置指定用の面を外しました。',{exact:true})).toBeVisible();await addProxy(p,'面3.glb');
    const finalPath=await download(p,info,'gs-final','backup'),final=await inspectBackup(finalPath);expect(final.records.representationsById[gs.id]).toEqual(gs);expect((Object.values(final.records.captionsById)[0] as any).anchor).toEqual(caption.anchor);
    await p.screenshot({path:info.outputPath('gs-edit.png'),fullPage:true});await close(a.context,'a');a=await launch(0);p=a.page;await ready(p);await gsReady(p);await gsPainted(p);
    const workspacePath=await download(p,info,'gs-workspace','teamWorkspace'),workspace=await WorkspaceArchive.inspect(new Blob([Uint8Array.from(await readFile(workspacePath)).buffer]),validationMetadataLimits);
    const b=await launch(1);await b.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(workspacePath);await b.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await ready(b.page);await gsReady(b.page);
    await b.page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click();const bd=b.page.getByRole('region',{name:'キャプションの詳細',exact:true});await bd.getByLabel('本文',{exact:true}).fill('相手が追記');await bd.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(b.page.getByText('変更を適用しました。',{exact:true})).toBeVisible();await addProxy(b.page,'返送する面.glb',.15);
    const returned=await download(b.page,info,'gs-return','contribution',workspace.archive.control.manifest.packageId),receive=p.getByRole('region',{name:'更新ファイル',exact:true});await receive.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(returned);await receive.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(receive.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:90_000});await gsReady(p);
    const receivedPath=await download(p,info,'gs-received','backup'),received=await inspectBackup(receivedPath);expect(received.records.representationsById[gs.id]).toEqual(gs);expect(received.records.captionsById[caption.id]).toMatchObject({body:'相手が追記',anchor:caption.anchor});
    const reviewPath=await download(p,info,'gs-review','review'),cleanPath=await download(p,info,'gs-clean','clean');
    await close(b.context,'b');const review=await launch(3);await review.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(reviewPath);await review.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await expect(review.page.getByText('閲覧用シーンを開きました。編集プロジェクトは作成していません。',{exact:true})).toBeVisible({timeout:90_000});
    await expect(review.page.getByLabel('3Dモデルの表示',{exact:true})).toBeVisible();await expect(review.page.getByRole('main',{name:'閲覧用のシーン',exact:true}).locator(':scope > [role="status"]')).toBeEmpty({timeout:90_000});
    await gsPainted(review.page);
    await review.page.evaluate(()=>{const original=WebGL2RenderingContext.prototype.checkFramebufferStatus;(window as any).reviewGsFault=true;WebGL2RenderingContext.prototype.checkFramebufferStatus=function(target){if((window as any).reviewGsFault&&this.getParameter(this.FRAMEBUFFER_BINDING)&&this.getParameter(this.VIEWPORT)[2]>8)return this.FRAMEBUFFER_UNSUPPORTED;return original.call(this,target);};});await review.page.setViewportSize({width:1450,height:1000});await expect(review.page.getByRole('button',{name:'3D表示を再試行',exact:true})).toBeVisible();await review.page.evaluate(()=>{(window as any).reviewGsFault=false;});await review.page.getByRole('button',{name:'3D表示を再試行',exact:true}).click();await expect(review.page.getByRole('main',{name:'閲覧用のシーン',exact:true}).locator(':scope > [role="status"]')).toBeEmpty({timeout:90_000});await gsPainted(review.page);
    await review.page.screenshot({path:info.outputPath('gs-review.png'),fullPage:true});await close(review.context,'review');
    const clean=await launch(4);await clean.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(cleanPath);await clean.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await ready(clean.page);await gsReady(clean.page);const cleanSaved=await inspectBackup(await download(clean.page,info,'gs-clean-reopened','backup'));expect(cleanSaved.backup.source.proof.identity.projectId).not.toBe(received.backup.source.proof.identity.projectId);
    const cleanReps=Object.values(cleanSaved.records.representationsById) as any[],cleanGs=cleanReps.find(r=>r.role==='gsPrimary'),cleanProxy=cleanReps.find(r=>r.role==='interactionProxy');expect(cleanProxy.proxyForGsVariantFamilyId).toBe(cleanGs.variantFamilyId);expect(cleanGs.blob).toEqual(gs.blob);await close(clean.context,'clean');
    const restored=await launch(2);await restored.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(receivedPath);await restored.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await restored.page.getByRole('button',{name:'バックアップから復元',exact:true}).click();await ready(restored.page);await gsReady(restored.page);const restoredSaved=await inspectBackup(await download(restored.page,info,'gs-restored','backup'));expect(restoredSaved.backup.source.proof.identity).toEqual(received.backup.source.proof.identity);expect(restoredSaved.records.captionsById[caption.id].anchor).toEqual(caption.anchor);await close(restored.context,'restored');
    expect(errors).toEqual([]);
  }finally{for(const c of contexts){await c.pages()[0]?.screenshot({path:info.outputPath(`failure-${contexts.size}.png`),fullPage:true}).catch(()=>{});await c.tracing.stop({path:info.outputPath(`failure-${contexts.size}.zip`)}).catch(()=>{});await c.close();}await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});}
});

test('既存のモデルへファイルとしてGSを追加し、面と保存を保ってcold再開する',async({},info)=>{
  await mkdir('.artifacts/e2e/profiles',{recursive:true});const profile=await mkdtemp('.artifacts/e2e/profiles/gs-file-');
  const launch=async()=>{const c=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});await guardWholeGsReads(c);return c;};
  let context=await launch();
  try{
    let p=context.pages()[0]??await context.newPage();await p.goto(entry);
    await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'最初.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('GSの作業');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(p);
    await p.getByRole('tab',{name:'モデル',exact:true}).click();const chooser=p.waitForEvent('filechooser');await modelPanel(p).getByRole('button',{name:'3Dモデルを追加',exact:true}).click();await(await chooser).setFiles({name:'全係数.ply',mimeType:'application/ply',buffer:source});await expect(p.getByText('モデルを追加しました。',{exact:true})).toBeVisible();await gsReady(p);await addProxy(p);
    const first=await inspectBackup(await download(p,info,'file-backed-add','backup'));const gs=Object.values(first.records.representationsById).find((r:any)=>r.role==='gsPrimary') as any;expect(gs.blob.digest).toBe(hash(source));expect(await p.evaluate(()=>(window as any).wholeGsReads)).toBe(0);
    await context.close();context=await launch();p=context.pages()[0]??await context.newPage();await p.goto(entry);await ready(p);await gsReady(p);
    await p.getByRole('tab',{name:'モデル',exact:true}).click();await modelPanel(p).locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();await modelPanel(p).getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await p.getByRole('button',{name:'正面',exact:true}).click();await gsPainted(p);
    const after=await inspectBackup(await download(p,info,'file-backed-cold','backup'));expect(after.records.representationsById[gs.id]).toEqual(gs);expect(await p.evaluate(()=>(window as any).wholeGsReads)).toBe(0);await p.screenshot({path:info.outputPath('file-backed-gs.png'),fullPage:true});
  }finally{await context.close();}
});

test('混在画面で前面の面を選び、GSと重なる点は保留して非表示後に選ぶ',async({},info)=>{
  test.setTimeout(180_000);await mkdir('.artifacts/e2e/profiles',{recursive:true});const profile=await mkdtemp('.artifacts/e2e/profiles/gs-mix-');
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=context.pages()[0]??await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const point=Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n0 0 0 255 0 0\n');await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  try{
    await page.goto(entry);await page.getByLabel('ファイルを選択',{exact:true}).setInputFiles([{name:'全係数.ply',mimeType:'application/ply',buffer:source},{name:'点.ply',mimeType:'application/ply',buffer:point},{name:'前面.glb',mimeType:'model/gltf-binary',buffer:triangleGlb(.4)}]);await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await page.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('GSの作業');await page.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(page);await gsReady(page);
    await addProxy(page);await page.getByRole('tab',{name:'モデル',exact:true}).click();await modelPanel(page).locator('.lv-model-select').filter({hasText:'前面.glb'}).click();await page.getByRole('button',{name:'正面',exact:true}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();
    const canvas=page.getByLabel('3Dモデルの表示',{exact:true}),box=(await canvas.boundingBox())!,extent=4*Math.exp(Math.fround(Math.log(.3))),pose=fittedPose({min:[-extent,-extent,-extent],max:[extent,2,extent]},defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');const camera=new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(pose.projection.verticalFov),box.width/box.height,.01,100);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const pixel=new THREE.Vector3(0,0,0).project(camera);
    await page.getByRole('button',{name:'ピンを追加',exact:true}).click();await canvas.click({position:{x:(pixel.x+1)*box.width/2+.1,y:(1-pixel.y)*box.height/2-.5}});await expect(page.getByRole('button',{name:'位置を確定',exact:true})).toBeVisible();expect(Number(await page.getByLabel('位置 Z',{exact:true}).inputValue())).toBeGreaterThan(.39);await page.getByRole('region',{name:'ピンの操作',exact:true}).getByRole('button',{name:'取り消す',exact:true}).click();
    await page.getByRole('tab',{name:'モデル',exact:true}).click();await modelPanel(page).getByRole('button',{name:'隠す',exact:true}).click();await modelPanel(page).locator('.lv-model-select').filter({hasText:'点.ply'}).click();await gsReady(page);await page.getByRole('button',{name:'正面',exact:true}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();await page.getByRole('button',{name:'ピンを追加',exact:true}).click();let b=(await canvas.boundingBox())!;
    for(const dx of [0,4]){await canvas.click({position:{x:b.width/2+dx,y:b.height/2}});await expect(page.getByRole('button',{name:'位置を確定',exact:true})).toBeHidden();await expect(page.locator('.lv-project-viewport-status')).toContainText('GSと点の前後関係を確認できません。');}
    await page.getByRole('region',{name:'ピンの操作',exact:true}).getByRole('button',{name:'取り消す',exact:true}).click();await page.getByRole('tab',{name:'モデル',exact:true}).click();await modelPanel(page).locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();await page.getByRole('button',{name:'ピンを追加',exact:true}).click();b=(await canvas.boundingBox())!;await canvas.click({position:{x:b.width/2+5,y:b.height/2-10}});await expect(page.getByRole('button',{name:'位置を確定',exact:true})).toBeVisible();
    await page.getByRole('region',{name:'ピンの操作',exact:true}).getByRole('button',{name:'取り消す',exact:true}).click();await page.getByRole('tab',{name:'モデル',exact:true}).click();await modelPanel(page).locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();await modelPanel(page).getByRole('button',{name:'隠す',exact:true}).click();await modelPanel(page).locator('.lv-model-select').filter({hasText:'点.ply'}).click();await gsReady(page);await page.getByRole('button',{name:'正面',exact:true}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();await page.getByRole('button',{name:'ピンを追加',exact:true}).click();b=(await canvas.boundingBox())!;await canvas.click({position:{x:b.width/2+4,y:b.height/2}});await page.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(page.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible();expect(errors).toEqual([]);
  }finally{await page.screenshot({path:info.outputPath('gs-mixed-picking.png'),fullPage:true}).catch(()=>{});await context.tracing.stop({path:info.outputPath('gs-mix-trace.zip')});await context.close();await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});}
});

test('GSの表示失敗を隔離し、点の選択とGPU復旧を同じ画面で継続する',async({},info)=>{
  test.setTimeout(180_000);await mkdir('.artifacts/e2e/profiles',{recursive:true});const profile=await mkdtemp('.artifacts/e2e/profiles/gs-fault-');
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'}),errors:string[]=[];
  await context.addInitScript(()=>{const original=WebGL2RenderingContext.prototype.checkFramebufferStatus;WebGL2RenderingContext.prototype.checkFramebufferStatus=function(target){
    if((window as any).gsTargetFault&&this.getParameter(this.FRAMEBUFFER_BINDING)&&this.getParameter(this.VIEWPORT)[2]>8)return this.FRAMEBUFFER_UNSUPPORTED;
    return original.call(this,target);
  };});
  const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(e.message));await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const point=Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n0 0 0 255 0 0\n');
  try{
    await page.goto(entry);await page.getByLabel('ファイルを選択',{exact:true}).setInputFiles([{name:'全係数.ply',mimeType:'application/ply',buffer:source},{name:'点.ply',mimeType:'application/ply',buffer:point}]);await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await page.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('GSの作業');await page.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(page);await gsReady(page);
    await page.getByRole('tab',{name:'モデル',exact:true}).click();await modelPanel(page).locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();await page.getByRole('button',{name:'ピンを追加',exact:true}).click();await page.getByRole('region',{name:'ピンの操作',exact:true}).getByRole('button',{name:'位置指定用の面を追加',exact:true}).click();await expect(modelPanel(page).getByRole('button',{name:'位置指定用の面を追加',exact:true})).toBeVisible();
    await page.evaluate(()=>{(window as any).gsTargetFault=true;});await page.setViewportSize({width:1450,height:1000});await expect(page.locator('.lv-project-viewport-status')).toContainText('GSの表示領域を準備できません。');
    await page.getByRole('button',{name:'正面',exact:true}).click();expect((await pixels(page)).slice(0,3)).toEqual([255,0,0]);
    await modelPanel(page).locator('.lv-model-select').filter({hasText:'点.ply'}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();await page.getByRole('button',{name:'ピンを追加',exact:true}).click();const canvas=page.getByLabel('3Dモデルの表示',{exact:true}),box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width/2,y:box.height/2}});await page.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(page.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible();
    await page.evaluate(()=>{(window as any).gsTargetFault=false;});await page.getByRole('button',{name:'3D表示を再試行',exact:true}).click();await gsReady(page);
    await canvas.evaluate((c:HTMLCanvasElement)=>new Promise<void>(resolve=>{const gl=c.getContext('webgl2')!,ext=gl.getExtension('WEBGL_lose_context')!;c.addEventListener('webglcontextrestored',()=>resolve(),{once:true});c.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),50),{once:true});ext.loseContext();}));
    await page.getByRole('button',{name:'3D表示を再試行',exact:true}).click();await gsReady(page);await expect(page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select')).toHaveCount(1);expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('gs-isolated-recovery.png'),fullPage:true});
  }finally{await context.tracing.stop({path:info.outputPath('gs-fault-trace.zip')});await context.close();await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});}
});
