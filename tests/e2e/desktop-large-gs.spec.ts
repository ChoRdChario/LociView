import { desktopEntry, desktopOrigin } from './desktopEntry';
import { revealFileSurface, lookAlongFront } from './workspaceUi';
import {test,expect,chromium,type Page,type BrowserContext,type TestInfo} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {join} from 'node:path';
import * as A from '@automerge/automerge';
import * as THREE from 'three';
import {largeGsFixture,largeGsDigest,largeGsBytes} from '../helpers/largeGsFixture';
import {triangleGlb,smallPng} from './fixtures';
import {defaultPose,fittedPose} from '../../src/projectScene/viewportModel';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {WorkspaceArchive} from '../../src/projectPackage/workspaceArchive';
import {PackageArchive} from '../../src/projectPackage/zipArchive';
import {inspectProjectCandidates} from '../../src/domain/projectCandidates';
import {validationMetadataLimits} from '../../src/projectFiles/validation';
const entry=desktopEntry+'?timings=1';
const files=(p:Page)=>p.getByRole('region',{name:'ファイル',exact:true});
const models=(p:Page)=>p.getByRole('tabpanel',{name:'モデル',exact:true});
async function ready(p:Page){await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('大容量SH4',{timeout:240_000});await expect(p.locator('.lv-project-viewport-status')).toBeEmpty({timeout:180_000});}
async function output(p:Page,info:TestInfo,name:string,purpose:'backup'|'teamWorkspace'|'contribution'|'review'|'clean',base?:string){
 const menu=p.locator('details.lv-project-files');if(await menu.count()&&!await menu.evaluate(n=>(n as HTMLDetailsElement).open))await menu.locator(':scope > summary').click();
 const area=files(p);
 const compact=await revealFileSurface(p,purpose==='backup'?'保存':'共有');
  if(compact){if(purpose!=='backup')await area.getByLabel('渡す内容',{exact:true}).selectOption(purpose);}
  else if(purpose==='review'||purpose==='clean'){
  const more=area.locator('summary').filter({hasText:/^その他$/});if(!await more.evaluate(n=>(n.parentElement as HTMLDetailsElement).open))await more.click();
  await area.getByRole('button',{name:purpose==='review'?'シーンを共有':'独立コピーを作る',exact:true}).click();
 }else await area.getByRole('button',{name:purpose==='backup'?'保存':'相手に渡す',exact:true}).click();
 if(purpose==='backup')await area.getByLabel('名前（任意）',{exact:true}).fill(name);
 else if(purpose!=='review'&&purpose!=='clean'){if(!compact)await area.getByLabel('渡す内容',{exact:true}).selectOption(purpose);if(base)await area.getByLabel('元にする作業一式',{exact:true}).selectOption(base);}
 if(purpose==='review'){const scenes=area.getByLabel('渡すシーン',{exact:true});await scenes.selectOption((await scenes.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).filter(Boolean)))[0]!);}
 if(purpose==='review'||purpose==='clean')await area.getByRole('button',{name:'内容を確認',exact:true}).click();
 const primary=area.locator('button.lv-file-primary');await expect(primary).toBeEnabled({timeout:300_000});
 const [download]=await Promise.all([p.waitForEvent('download',{timeout:300_000}),primary.click()]);const path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
 await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy','false',{timeout:300_000});return path;
}
async function backup(path:string){
 const b=await BackupArchive.inspect(await openAsBlob(path),validationMetadataLimits),c=await inspectProjectCandidates(b.source.read(),validationMetadataLimits);
 if(c.kind!=='project-candidate-inspection')throw Error('Backup metadata inspection');
 const records=c.unambiguousRecords as Record<string,any>,gs=Object.values(records.representationsById).find((r:any)=>r.role==='gsPrimary') as any;
 expect(gs.blob.digest).toBe(largeGsDigest);expect(gs.blob.byteLength).toBe(largeGsBytes);expect(b.archive.entryBlob('blobs/sha256/'+largeGsDigest).size).toBe(largeGsBytes);
 return{b,records,gs};
}
async function open(p:Page,path:string){await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles(path);await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();}

test('PC入口で50万点SH4の全5用途・返送・Review編集コピー・復元・cold再開を完走する',async({},info)=>{
 test.setTimeout(3_600_000);A.getHeads(A.init());const source=await largeGsFixture(),started=Date.now(),stages:any[]=[],errors:string[]=[],contexts=new Set<BrowserContext>();
 await mkdir('.artifacts/e2e/profiles',{recursive:true});const profiles=await Promise.all(['a','b','review','clean','restore'].map(label=>mkdtemp('.artifacts/e2e/profiles/desktop500k-'+label+'-')));
 const mark=async(stage:string,p:Page)=>{await p.evaluate(()=>document.dispatchEvent(new Event('lociview-timing-snapshot')));stages.push({stage,wallMs:Date.now()-started,timing:await p.evaluate(()=>performance.getEntriesByType('measure').map(e=>({name:e.name,ms:e.duration,detail:(e as PerformanceMeasure).detail})))});console.log(stage,Date.now()-started);};
 const launch=async(index:number)=>{const context=await chromium.launchPersistentContext(profiles[index]!,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true});contexts.add(context);context.setDefaultTimeout(15_000);
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===desktopOrigin||['blob:','data:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
  // ZIP inspection may capture bounded1MiB ranges; GS-source inspection has its
  // own64KiB unit test. Capturing this178MB source is forbidden on every path.
  await context.addInitScript(()=>{const original=Blob.prototype.arrayBuffer;(window as any).wholeGsReads=0;Blob.prototype.arrayBuffer=async function(){if(this.size>1_048_576){const prefix=new Uint8Array(await original.call(Blob.prototype.slice.call(this,0,32)));if(new TextDecoder().decode(prefix).startsWith('ply\nformat binary_little_endian')){(window as any).wholeGsReads++;throw Error('Whole GS arrayBuffer forbidden');}}return original.call(this);};});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});const p=context.pages()[0]??await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(entry);return{context,p};};
 const close=async(c:BrowserContext,label:string)=>{expect(await c.pages()[0]!.evaluate(()=>(window as any).wholeGsReads)).toBe(0);await c.tracing.stop({path:info.outputPath(label+'-trace.zip')});await c.close();contexts.delete(c);};
 try{
  let a=await launch(0),p=a.p;await open(p,source);await p.getByLabel('プロジェクト名',{exact:true}).fill('大容量SH4');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(p);await mark('created',p);
  await p.getByRole('tab',{name:'モデル',exact:true}).click();await models(p).locator('.lv-model-select').first().click();const proxy=p.waitForEvent('filechooser');await models(p).getByRole('button',{name:'位置指定用の面を追加',exact:true}).click();await(await proxy).setFiles({name:'位置の面.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await models(p).getByRole('button',{name:'このモデルに面を追加',exact:true}).click();await expect(p.getByText('位置指定用の面を登録しました。',{exact:true})).toBeVisible({timeout:240_000});await ready(p);
  await lookAlongFront(p);await p.getByRole('tab',{name:'キャプション',exact:true}).click();await p.getByRole('button',{name:'ピンを追加',exact:true}).click();
  const canvas=p.getByLabel('3Dモデルの表示',{exact:true}),box=(await canvas.boundingBox())!,extent=4*Math.exp(Math.fround(Math.log(.0007))),bounds={min:[-500/300-extent,-250/300-extent,-extent] as const,max:[499/300+extent,249/300+extent,.0006+extent] as const},pose=fittedPose(bounds,defaultPose(),box.width/box.height,'+z');
  if(pose.projection.kind!=='perspective')throw Error('Expected perspective');const camera=new THREE.PerspectiveCamera(pose.projection.verticalFov*180/Math.PI,box.width/box.height,.000001,1e9);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const hit=new THREE.Vector3(.1,.2,0).project(camera);await canvas.click({position:{x:(hit.x+1)*box.width/2,y:(1-hit.y)*box.height/2}});
  await p.getByLabel('位置 X',{exact:true}).fill('0.2');await p.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(p.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible({timeout:240_000});
  const detail=p.getByRole('region',{name:'キャプションの詳細',exact:true});await detail.getByLabel('タイトル',{exact:true}).fill('50万点の記録');await detail.getByLabel('本文',{exact:true}).fill('SH4原本を保持');await detail.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('変更を適用しました。',{exact:true})).toBeVisible({timeout:240_000});
  const photo=p.waitForEvent('filechooser');await p.getByLabel('メディアを追加',{exact:true}).click();await(await photo).setFiles({name:'写真.png',mimeType:'image/png',buffer:smallPng()});await expect(p.getByText('メディアを追加しました。',{exact:true})).toBeVisible({timeout:240_000});await mark('proxy-note-photo',p);
  const original=await backup(await output(p,info,'large-backup','backup')),caption=Object.values(original.records.captionsById)[0] as any;expect(caption.anchor.hitEvidence.method).toBe('manual');expect(Object.keys(original.records.captionAttachmentsById)).toHaveLength(1);await mark('backup',p);await close(a.context,'a-initial');
  a=await launch(0);p=a.p;await ready(p);const cold=await backup(await output(p,info,'large-cold','backup'));expect(cold.b.source.token).toBe(original.b.source.token);expect(cold.records).toEqual(original.records);await mark('cold',p);
  const workspacePath=await output(p,info,'large-workspace','teamWorkspace'),workspace=await WorkspaceArchive.inspect(await openAsBlob(workspacePath),validationMetadataLimits);await mark('workspace',p);
  const peer=await launch(1);await open(peer.p,workspacePath);await ready(peer.p);await peer.p.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click();const pd=peer.p.getByRole('region',{name:'キャプションの詳細',exact:true});await pd.getByLabel('本文',{exact:true}).fill('相手から返送');await pd.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(peer.p.getByText('変更を適用しました。',{exact:true})).toBeVisible({timeout:240_000});
  const returned=await output(peer.p,info,'large-return','contribution',workspace.archive.control.manifest.packageId),receive=p.getByRole('region',{name:'更新ファイル',exact:true});await revealFileSurface(p,'受信');await receive.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(returned);await receive.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(receive.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:240_000});await ready(p);await close(peer.context,'peer');await mark('returned',p);
  const receivedPath=await output(p,info,'large-received','backup'),received=await backup(receivedPath);expect(received.records.representationsById[original.gs.id]).toEqual(original.gs);expect(received.records.captionsById[caption.id]).toMatchObject({body:'相手から返送',anchor:caption.anchor});
  const reviewPath=await output(p,info,'large-review','review'),cleanPath=await output(p,info,'large-clean','clean');expect((await PackageArchive.inspect(await openAsBlob(reviewPath))).control.manifest.purpose).toBe('review');expect((await PackageArchive.inspect(await openAsBlob(cleanPath))).control.manifest.purpose).toBe('clean');await mark('review-clean',p);await close(a.context,'a-received');
  const review=await launch(2);await open(review.p,reviewPath);await expect(review.p.getByText('閲覧用シーンを開きました。編集プロジェクトは作成していません。',{exact:true})).toBeVisible({timeout:240_000});await expect(review.p.getByRole('main',{name:'閲覧用のシーン',exact:true}).locator(':scope > [role="status"]')).toBeEmpty({timeout:180_000});await mark('review-open',review.p);
  const contender=await review.context.newPage();await contender.goto(entry);await contender.evaluate(()=>new Promise<void>(ready=>{
    (window as any).packageHeld=navigator.locks.request('lociview:package-operation:v1',()=>new Promise<void>(release=>{(window as any).releasePackage=release;ready();}));}));
  await review.p.getByRole('button',{name:'編集コピーを作る',exact:true}).click();await review.p.getByRole('button',{name:'コピーを作成',exact:true}).click();
  await expect(review.p.getByText(/別のファイル処理が進行中/)).toBeVisible({timeout:90_000});expect(await review.p.evaluate(()=>indexedDB.databases())).toEqual([]);
  await contender.evaluate(()=>{(window as any).releasePackage();return(window as any).packageHeld;});await contender.close();
  await review.p.getByRole('button',{name:'編集コピーを作る',exact:true}).click();const copyStarted=Date.now();await review.p.getByRole('button',{name:'コピーを作成',exact:true}).click();
  await expect(review.p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('大容量SH4',{timeout:240_000});
  console.log('review-copy-editor-ms',Date.now()-copyStarted);await expect(review.p.locator('.lv-project-viewport-status')).toBeEmpty({timeout:180_000});console.log('review-copy-display-ms',Date.now()-copyStarted);
  await review.p.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click();
  const copiedDetail=review.p.getByRole('region',{name:'キャプションの詳細',exact:true});await expect(copiedDetail.getByLabel('本文',{exact:true})).toHaveValue('相手から返送');
  await copiedDetail.getByLabel('本文',{exact:true}).fill('閲覧コピーで追記');await copiedDetail.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(review.p.getByText('変更を適用しました。',{exact:true})).toBeVisible({timeout:240_000});
  const editable=await backup(await output(review.p,info,'large-review-edit','backup'));expect(editable.b.source.proof.identity.projectId).not.toBe(received.b.source.proof.identity.projectId);
  expect((Object.values(editable.records.captionsById)[0] as any)).toMatchObject({body:'閲覧コピーで追記',anchor:{positionAsset:caption.anchor.positionAsset,hitEvidence:{method:'manual'}}});
  expect(Object.keys(editable.records.captionAttachmentsById)).toHaveLength(1);expect(Object.values(editable.records.representationsById).filter((r:any)=>r.role==='interactionProxy')).toHaveLength(1);
  await mark('review-edit',review.p);await close(review.context,'review-edit');
  const reviewCold=await launch(2);await ready(reviewCold.p);const editedCold=await backup(await output(reviewCold.p,info,'large-review-edit-cold','backup'));expect(editedCold.b.source.token).toBe(editable.b.source.token);expect(editedCold.records).toEqual(editable.records);await close(reviewCold.context,'review-edit-cold');
  const clean=await launch(3);await open(clean.p,cleanPath);await ready(clean.p);const standalone=await backup(await output(clean.p,info,'large-clean-reopened','backup'));expect(standalone.b.source.proof.identity.projectId).not.toBe(received.b.source.proof.identity.projectId);expect((Object.values(standalone.records.captionsById)[0] as any).anchor.positionAsset).toEqual(caption.anchor.positionAsset);await mark('clean-open',clean.p);await close(clean.context,'clean');
  const restored=await launch(4);await open(restored.p,receivedPath);const restore=restored.p.getByRole('button',{name:'バックアップから復元',exact:true});await expect(restore).toBeVisible({timeout:90_000});await restore.click();await ready(restored.p);const restoredSaved=await backup(await output(restored.p,info,'large-restored','backup'));expect(restoredSaved.b.source.token).toBe(received.b.source.token);expect(restoredSaved.records).toEqual(received.records);await mark('restored-saved',restored.p);await close(restored.context,'restored');
  const last=await launch(4);await ready(last.p);await last.p.screenshot({path:info.outputPath('large-restored-cold.png'),fullPage:true});await mark('final-cold',last.p);await close(last.context,'final-cold');expect(errors).toEqual([]);
 }finally{
  // Preserve the current action's measurements even when readiness fails before mark().
  for(const c of contexts)for(const p of c.pages()){
   const timing=await p.evaluate(()=>performance.getEntriesByType('measure').map(e=>({name:e.name,ms:e.duration,detail:(e as PerformanceMeasure).detail}))).catch(()=>[]);
   stages.push({stage:'teardown',url:p.url(),wallMs:Date.now()-started,timing});
  }
  await info.attach('stages',{body:JSON.stringify({stages,errors,profiles}),contentType:'application/json'});for(const c of contexts){await c.pages()[0]?.screenshot({path:info.outputPath('failure-'+contexts.size+'.png'),fullPage:true}).catch(()=>{});await c.tracing.stop({path:info.outputPath('failure-'+contexts.size+'.zip')}).catch(()=>{});await c.close();}
 }
});
