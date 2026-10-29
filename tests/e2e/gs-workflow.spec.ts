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
import { presentedCanvas } from './presentedCanvas';
const entry=process.env.LOCIVIEW_E2E_ENTRY??'http://127.0.0.1:4182/dev.html?editor=project';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const files=(p:Page)=>p.getByRole('region',{name:'ファイル',exact:true});
const modelPanel=(p:Page)=>p.getByRole('tabpanel',{name:'モデル',exact:true});
const sh4Row=Array(89).fill(0);sh4Row[28]=.5;sh4Row[82]=sh4Row[83]=sh4Row[84]=Math.log(.3);sh4Row[85]=1;
const source=Buffer.from(gsFixture(4,Array.from({length:256},()=>sh4Row))),proxy=triangleGlb();
const updatedRow=[...sh4Row];updatedRow[6]=.35;updatedRow[28]=.65;
const updatedSource=Buffer.from(gsFixture(4,Array.from({length:256},()=>updatedRow)));
async function guardWholeGsReads(context:BrowserContext){
  await context.addInitScript(()=>{
    (window as any).gsDrawCalls=0;
    for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'] as const){
      const originalDraw=WebGL2RenderingContext.prototype[name];
      (WebGL2RenderingContext.prototype as any)[name]=function(...args:any[]){(window as any).gsDrawCalls++;return (originalDraw as Function).apply(this,args);};
    }
    const original=Blob.prototype.arrayBuffer,slice=Blob.prototype.slice,parents=new WeakMap<Blob,Blob>(),zipPrefixes=new WeakMap<Blob,Promise<boolean>>();
    (window as any).wholeGsReads=0;(window as any).zipGsRangeReads=0;
    Blob.prototype.slice=function(start?:number,end?:number,type?:string){const child=slice.call(this,start,end,type);parents.set(child,this);return child;};
    const zipPrefix=(file:Blob)=>{let known=zipPrefixes.get(file);if(!known){known=original.call(slice.call(file,0,4)).then(bytes=>{
      const b=new Uint8Array(bytes);return b[0]===0x50&&b[1]===0x4b&&b[2]===3&&b[3]===4;});zipPrefixes.set(file,known);}return known;};
    Blob.prototype.arrayBuffer=async function(){
      if(this.size>65536){const prefix=new Uint8Array(await original.call(slice.call(this,0,32)));
        if(new TextDecoder().decode(prefix).startsWith('ply\nformat binary_little_endian')){
          // 01e§2.3 permits bounded native ZIP payload reads. Raw sources and
          // slices of a GS body still retain the original64KiB guard.
          const parent=parents.get(this);
          if(this.size<=1_048_576&&parent&&await zipPrefix(parent)){(window as any).zipGsRangeReads++;return original.call(this);}
          (window as any).wholeGsReads++;throw Error('Whole GS arrayBuffer forbidden');}}
      return original.call(this);
    };
  });
}
test('GS読込ガードは小さい原本とその複製を拒否し、ZIP由来の範囲だけ1MiBまで許可する',async({page,context})=>{
  await guardWholeGsReads(context);await page.goto(entry);
  const result=await page.evaluate(async data=>{
    const raw=new Blob([new Uint8Array(data)]),refused=async(file:Blob)=>{try{await file.arrayBuffer();return false;}catch(error){if((error as Error).message!=='Whole GS arrayBuffer forbidden')throw error;return true;}};
    const rawRefused=await refused(raw),copyRefused=await refused(raw.slice(0));
    const zipPrefix=new Uint8Array([0x50,0x4b,3,4]),zip=new Blob([zipPrefix,raw]),allowed=new Uint8Array(await zip.slice(4).arrayBuffer());
    const oversized=new Blob([zipPrefix,raw,new Uint8Array(1_048_577-raw.size)]),oversizedRefused=await refused(oversized.slice(4));
    return {rawRefused,copyRefused,oversizedRefused,exact:allowed.every((b,i)=>b===data[i]),size:allowed.length,refusals:(window as any).wholeGsReads,ranges:(window as any).zipGsRangeReads};
  },Array.from(source));
  expect(result).toEqual({rawRefused:true,copyRefused:true,oversizedRefused:true,exact:true,size:source.length,refusals:3,ranges:1});
});
async function ready(p:Page){await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('GSの作業',{timeout:90_000});}
async function gsReady(p:Page){await expect(p.locator('.lv-project-viewport-status')).toBeEmpty({timeout:90_000});}
async function addProxy(p:Page,name='面.glb',z=0){
  await p.getByRole('tab',{name:'モデル',exact:true}).click();const area=modelPanel(p);
  await area.locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();
  const chooser=p.waitForEvent('filechooser');await area.getByRole('button',{name:/^位置指定用の面を(?:追加|変更)$/,exact:true}).click();await(await chooser).setFiles({name,mimeType:'model/gltf-binary',buffer:triangleGlb(z)});
  const confirm=area.getByRole('button',{name:/^(?:このモデルに面を追加|面の変更を確定)$/,exact:true});await expect(confirm).toBeVisible();await confirm.click();await expect(p.getByText('位置指定用の面を登録しました。',{exact:true})).toBeVisible();await gsReady(p);
}
async function download(p:Page,info:TestInfo,name:string,purpose:'backup'|'teamWorkspace'|'contribution'|'review'|'clean',base?:string){
 const menu=p.locator('details.lv-project-files');if(await menu.count()&&!await menu.evaluate(n=>(n as HTMLDetailsElement).open))await menu.locator(':scope > summary').click();
  const area=files(p);
  if(purpose==='review'||purpose==='clean'){const more=area.locator('summary').filter({hasText:/^その他$/});if(!await more.evaluate(n=>(n.parentElement as HTMLDetailsElement).open))await more.click();await area.getByRole('button',{name:purpose==='review'?'シーンを共有':'独立コピーを作る',exact:true}).click();}
  else await area.getByRole('button',{name:purpose==='backup'?'保存':'相手に渡す',exact:true}).click();
  if(purpose==='backup')await area.getByLabel('名前（任意）',{exact:true}).fill(name);
  else if(purpose!=='review'&&purpose!=='clean'){await area.getByLabel('渡す内容',{exact:true}).selectOption(purpose);if(base)await area.getByLabel('元にする作業一式',{exact:true}).selectOption(base);}
  if(purpose==='clean')await area.getByRole('button',{name:'内容を確認',exact:true}).click();
  if(purpose==='review'){const scenes=area.getByLabel('渡すシーン',{exact:true});await scenes.selectOption((await scenes.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).filter(Boolean)))[0]!);await area.getByRole('button',{name:'内容を確認',exact:true}).click();}
  const primary=area.locator('button.lv-file-primary');await expect(primary).toBeEnabled({timeout:180_000});const [file]=await Promise.all([p.waitForEvent('download',{timeout:180_000}),primary.click()]);const path=info.outputPath(`${name}.zip`);await file.saveAs(path);expect(await file.failure()).toBeNull();await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy','false',{timeout:180_000});return path;
}
async function inspectBackup(path:string,expectedSource=source){const backup=await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]),validationMetadataLimits),c=await inspectProjectCandidates(backup.source.read(),validationMetadataLimits);if(c.kind!=='project-candidate-inspection')throw Error('GS backup');
  expect(Buffer.from(await backup.archive.entryBytes(`blobs/sha256/${hash(expectedSource)}`,expectedSource.length))).toEqual(expectedSource);return {backup,records:c.unambiguousRecords as Record<string,any>};}
function activeGs(records:Record<string,any>){
  for(const asset of Object.values(records.assetsById) as any[]){const binding=records.assetBindingsById[asset.status.activeBindingId],revision=records.assetRevisionsById[binding.assetRevisionId],reps=revision.representationIds.map((id:string)=>records.representationsById[id]);
    const gs=reps.find((r:any)=>r.role==='gsPrimary');if(gs)return {asset,binding,revision,gs,proxy:reps.find((r:any)=>r.role==='interactionProxy')};}
  throw Error('No active GS');
}
async function pixels(p:Page){return (await presentedCanvas(p.getByLabel('3Dモデルの表示',{exact:true}))).sample;}
async function gsPainted(p:Page){await expect.poll(async()=>(await presentedCanvas(p.getByLabel('3Dモデルの表示',{exact:true}))).red,{timeout:90_000}).toBeGreaterThan(20);}
test('SH4本体の差し替えと面の再設定・受信側編集・返送・復元・cold再開を接続する',async({},info)=>{
  test.setTimeout(900_000);A.getHeads(A.init());const dir='.artifacts/e2e/profiles';await mkdir(dir,{recursive:true});const profiles=await Promise.all(['a','b','r','v','c'].map(n=>mkdtemp(join(dir,`gs-${n}-`)))),contexts=new Set<BrowserContext>(),errors:string[]=[];
  const launch=async(index:number)=>{const context=await chromium.launchPersistentContext(profiles[index]!,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});contexts.add(context);context.setDefaultTimeout(15_000);await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    await guardWholeGsReads(context);
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===new URL(entry).origin||['blob:','data:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
    const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(entry);return {page,context};};
  const close=async(c:BrowserContext,name:string)=>{expect(await c.pages()[0]!.evaluate(()=>(window as any).wholeGsReads)).toBe(0);await c.tracing.stop({path:info.outputPath(`${name}-trace.zip`)});await c.close();contexts.delete(c);};
  try{
    let a=await launch(0),p=a.page;
    await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'全係数.ply',mimeType:'application/ply',buffer:source});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('GSの作業');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(p);await gsReady(p);
    await expect.poll(async()=>{const before=await p.evaluate(()=>(window as any).gsDrawCalls);expect(before).toBeGreaterThan(0);await p.waitForTimeout(250);return await p.evaluate(()=>(window as any).gsDrawCalls)-before;}).toBe(0);
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
    await b.page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click();const bd=b.page.getByRole('region',{name:'キャプションの詳細',exact:true});await bd.getByLabel('本文',{exact:true}).fill('相手が追記');await bd.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(b.page.getByText('変更を適用しました。',{exact:true})).toBeVisible();
    const localMedia=b.page.waitForEvent('filechooser');await b.page.getByLabel('メディアを追加',{exact:true}).click();await(await localMedia).setFiles({name:'手元の写真.png',mimeType:'image/png',buffer:smallPng(80)});await expect(b.page.getByText('メディアを追加しました。',{exact:true})).toBeVisible();
    await p.getByRole('tab',{name:'モデル',exact:true}).click();await modelPanel(p).locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();
    const replacementChooser=p.waitForEvent('filechooser');await modelPanel(p).getByRole('button',{name:'モデルを差し替える',exact:true}).click();await(await replacementChooser).setFiles({name:'更新したGS.ply',mimeType:'application/ply',buffer:updatedSource});
    await expect(modelPanel(p).getByText(/位置指定用の面は未設定になります/)).toBeVisible();await modelPanel(p).getByRole('button',{name:'差し替えを確定',exact:true}).click();await expect(p.getByText('モデルを差し替えました。配置と記録を保持しています。',{exact:true})).toBeVisible();await gsReady(p);await gsPainted(p);
    const replacement=await inspectBackup(await download(p,info,'gs-replaced','backup')),newActive=activeGs(replacement.records);
    expect(newActive.proxy).toBeUndefined();expect(newActive.gs.blob.digest).toBe(hash(updatedSource));expect(newActive.gs.variantFamilyId).not.toBe(gs.variantFamilyId);expect(newActive.binding.assetToProject).toEqual(activeGs(final.records).binding.assetToProject);
    expect(replacement.records.captionsById[caption.id].anchor).toEqual(caption.anchor);expect(replacement.records.representationsById[gs.id]).toEqual(gs);
    expect(Buffer.from(await replacement.backup.archive.entryBytes('blobs/sha256/'+hash(updatedSource),updatedSource.length))).toEqual(updatedSource);
    const update=await download(p,info,'gs-body-update','contribution',workspace.archive.control.manifest.packageId),peerReceive=b.page.getByRole('region',{name:'更新ファイル',exact:true});
    await peerReceive.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(update);await peerReceive.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(peerReceive.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:90_000});await gsReady(b.page);
    await b.page.getByRole('tab',{name:'キャプション',exact:true}).click();await b.page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click();await expect(bd.getByLabel('本文',{exact:true})).toHaveValue('相手が追記');
    const peerSaved=await inspectBackup(await download(b.page,info,'gs-peer-local-preserved','backup'));expect(activeGs(peerSaved.records).proxy).toBeUndefined();expect(Object.keys(peerSaved.records.captionAttachmentsById)).toHaveLength(2);expect(peerSaved.records.captionsById[caption.id].anchor).toEqual(caption.anchor);
    await addProxy(b.page,'返送する面.glb',.15);await modelPanel(b.page).getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await b.page.getByRole('tab',{name:'キャプション',exact:true}).click();await b.page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click();
    await b.page.getByRole('button',{name:'位置を調整',exact:true}).click();await b.page.getByRole('button',{name:'正面',exact:true}).click();
    const peerCanvas=b.page.getByLabel('3Dモデルの表示',{exact:true}),peerBox=(await peerCanvas.boundingBox())!,peerPose=fittedPose({min:[-extent,-extent,-extent],max:[extent,extent,extent]},defaultPose(),peerBox.width/peerBox.height,'+z');if(peerPose.projection.kind!=='perspective')throw Error('camera');
    const peerCamera=new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(peerPose.projection.verticalFov),peerBox.width/peerBox.height,.01,100);peerCamera.position.set(...peerPose.position);peerCamera.up.set(...peerPose.up);peerCamera.lookAt(new THREE.Vector3(...peerPose.target));peerCamera.updateMatrixWorld(true);const newHit=new THREE.Vector3(.1,.75,.15).project(peerCamera);
    await peerCanvas.click({position:{x:(newHit.x+1)*peerBox.width/2,y:(1-newHit.y)*peerBox.height/2}});await b.page.getByLabel('位置 X',{exact:true}).fill('0.35');await b.page.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(b.page.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible();
    const corrected=await inspectBackup(await download(b.page,info,'gs-corrected','backup')),correctedAnchor=corrected.records.captionsById[caption.id].anchor;
    expect(correctedAnchor).toMatchObject({positionAsset:[.35,expect.any(Number),expect.any(Number)],authoredAssetRevisionId:activeGs(corrected.records).revision.id,hitEvidence:{method:'manual'}});

    const returned=await download(b.page,info,'gs-return','contribution',workspace.archive.control.manifest.packageId),receive=p.getByRole('region',{name:'更新ファイル',exact:true});await receive.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(returned);await receive.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(receive.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:90_000});await gsReady(p);
    const receivedPath=await download(p,info,'gs-received','backup'),received=await inspectBackup(receivedPath);expect(received.records.representationsById[gs.id]).toEqual(gs);expect(received.records.captionsById[caption.id]).toMatchObject({body:'相手が追記',anchor:correctedAnchor});expect(activeGs(received.records).gs).toEqual(newActive.gs);expect(activeGs(received.records).proxy).toBeTruthy();
    const reviewPath=await download(p,info,'gs-review','review'),cleanPath=await download(p,info,'gs-clean','clean');
    await close(b.context,'b');await close(a.context,'a-returned');const review=await launch(3);await review.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(reviewPath);await review.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await expect(review.page.getByText('閲覧用シーンを開きました。編集プロジェクトは作成していません。',{exact:true})).toBeVisible({timeout:90_000});
    await expect(review.page.getByLabel('3Dモデルの表示',{exact:true})).toBeVisible();await expect(review.page.getByRole('main',{name:'閲覧用のシーン',exact:true}).locator(':scope > [role="status"]')).toBeEmpty({timeout:90_000});
    await gsPainted(review.page);
    await review.page.evaluate(()=>{const original=WebGL2RenderingContext.prototype.checkFramebufferStatus;(window as any).reviewGsFault=true;WebGL2RenderingContext.prototype.checkFramebufferStatus=function(target){if((window as any).reviewGsFault&&this.getParameter(this.FRAMEBUFFER_BINDING)&&this.getParameter(this.VIEWPORT)[2]>8)return this.FRAMEBUFFER_UNSUPPORTED;return original.call(this,target);};});await review.page.setViewportSize({width:1450,height:1000});await expect(review.page.getByRole('button',{name:'3D表示を再試行',exact:true})).toBeVisible();await review.page.evaluate(()=>{(window as any).reviewGsFault=false;});await review.page.getByRole('button',{name:'3D表示を再試行',exact:true}).click();await expect(review.page.getByRole('main',{name:'閲覧用のシーン',exact:true}).locator(':scope > [role="status"]')).toBeEmpty({timeout:90_000});await gsPainted(review.page);
    await review.page.screenshot({path:info.outputPath('gs-review.png'),fullPage:true});await close(review.context,'review');
    const clean=await launch(4);await clean.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(cleanPath);await clean.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await ready(clean.page);await gsReady(clean.page);const cleanSaved=await inspectBackup(await download(clean.page,info,'gs-clean-reopened','backup'),updatedSource);expect(cleanSaved.backup.source.proof.identity.projectId).not.toBe(received.backup.source.proof.identity.projectId);
    const cleanReps=Object.values(cleanSaved.records.representationsById) as any[],cleanGs=cleanReps.find(r=>r.role==='gsPrimary'),cleanProxy=cleanReps.find(r=>r.role==='interactionProxy');expect(cleanProxy.proxyForGsVariantFamilyId).toBe(cleanGs.variantFamilyId);expect(cleanGs.blob).toEqual(newActive.gs.blob);await close(clean.context,'clean');
    const restored=await launch(2);await restored.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(receivedPath);await restored.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await restored.page.getByRole('button',{name:'バックアップから復元',exact:true}).click();await ready(restored.page);await gsReady(restored.page);const restoredSaved=await inspectBackup(await download(restored.page,info,'gs-restored','backup'));expect(restoredSaved.backup.source.proof.identity).toEqual(received.backup.source.proof.identity);expect(restoredSaved.records.captionsById[caption.id].anchor).toEqual(correctedAnchor);expect(activeGs(restoredSaved.records).gs).toEqual(newActive.gs);await close(restored.context,'restored');
    const cold=await launch(2);await ready(cold.page);await gsReady(cold.page);const coldSaved=await inspectBackup(await download(cold.page,info,'gs-restored-cold','backup'));expect(coldSaved.backup.source.token).toBe(restoredSaved.backup.source.token);expect(coldSaved.records).toEqual(restoredSaved.records);await close(cold.context,'restored-cold');
    expect(errors).toEqual([]);
  }finally{let failedIndex=0;for(const c of contexts){const label=`failure-${failedIndex++}`;await c.pages()[0]?.screenshot({path:info.outputPath(label+'.png'),fullPage:true}).catch(()=>{});await c.tracing.stop({path:info.outputPath(label+'.zip')}).catch(()=>{});await c.close();}await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});}
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
  await context.addInitScript(()=>{(window as any).gsProbeFault=true;const read=WebGL2RenderingContext.prototype.readPixels;
    WebGL2RenderingContext.prototype.readPixels=function(...args:any[]){if((window as any).gsProbeFault&&args[2]===1&&args[3]===1&&args[5]===this.FLOAT)throw Error('initial GS probe failure');return Reflect.apply(read,this,args);};
    const original=WebGL2RenderingContext.prototype.checkFramebufferStatus;WebGL2RenderingContext.prototype.checkFramebufferStatus=function(target){
    if((window as any).gsTargetFault&&this.getParameter(this.FRAMEBUFFER_BINDING)&&this.getParameter(this.VIEWPORT)[2]>8)return this.FRAMEBUFFER_UNSUPPORTED;
    return original.call(this,target);
  };});
  const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(e.message));await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const point=Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n0 0 0 255 0 0\n');
  try{
    await page.goto(entry);await page.getByLabel('ファイルを選択',{exact:true}).setInputFiles([{name:'全係数.ply',mimeType:'application/ply',buffer:source},{name:'点.ply',mimeType:'application/ply',buffer:point}]);await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await page.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('GSの作業');await page.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(page);
    await expect(page.locator('.lv-project-viewport-status')).toContainText('initial GS probe failure');await expect(page.locator('.lv-project-viewport-status')).toHaveAttribute('data-busy','false');await expect(page.getByLabel('3Dモデルの表示',{exact:true})).toHaveAttribute('aria-busy','false');
    await page.getByRole('button',{name:'正面',exact:true}).click();expect((await pixels(page)).slice(0,3)).toEqual([255,0,0]);
    await page.evaluate(()=>{(window as any).gsProbeFault=false;});await page.getByRole('button',{name:'3D表示を再試行',exact:true}).click();await gsReady(page);
    await page.getByRole('tab',{name:'モデル',exact:true}).click();await modelPanel(page).locator('.lv-model-select').filter({hasText:'全係数.ply'}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();await page.getByRole('button',{name:'ピンを追加',exact:true}).click();await page.getByRole('region',{name:'ピンの操作',exact:true}).getByRole('button',{name:'位置指定用の面を追加',exact:true}).click();await expect(modelPanel(page).getByRole('button',{name:'位置指定用の面を追加',exact:true})).toBeVisible();
    await page.evaluate(()=>{(window as any).gsTargetFault=true;});await page.setViewportSize({width:1450,height:1000});await expect(page.locator('.lv-project-viewport-status')).toContainText('GSの表示領域を準備できません。');
    await page.getByRole('button',{name:'正面',exact:true}).click();expect((await pixels(page)).slice(0,3)).toEqual([255,0,0]);
    await modelPanel(page).locator('.lv-model-select').filter({hasText:'点.ply'}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();await page.getByRole('button',{name:'ピンを追加',exact:true}).click();const canvas=page.getByLabel('3Dモデルの表示',{exact:true}),box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width/2,y:box.height/2}});await page.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(page.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible();
    await page.evaluate(()=>{(window as any).gsTargetFault=false;});await page.getByRole('button',{name:'3D表示を再試行',exact:true}).click();await gsReady(page);
    await canvas.evaluate((c:HTMLCanvasElement)=>new Promise<void>(resolve=>{const gl=c.getContext('webgl2')!,ext=gl.getExtension('WEBGL_lose_context')!;c.addEventListener('webglcontextrestored',()=>resolve(),{once:true});c.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),50),{once:true});ext.loseContext();}));
    await page.getByRole('button',{name:'3D表示を再試行',exact:true}).click();await gsReady(page);await expect(page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select')).toHaveCount(1);expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('gs-isolated-recovery.png'),fullPage:true});
  }finally{await context.tracing.stop({path:info.outputPath('gs-fault-trace.zip')});await context.close();await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});}
});
