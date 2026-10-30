import { revealModelManagement, lookAlongFront } from './workspaceUi';
import {test,expect,chromium,type Page,type BrowserContext,type TestInfo} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {createHash} from 'node:crypto';
import * as A from '@automerge/automerge';
import * as THREE from 'three';
import {largeGsFixture,largeGsDigest,updatedLargeGsDigest,largeGsBytes} from '../helpers/largeGsFixture';
import {triangleGlb} from './fixtures';
import {defaultPose,fittedPose} from '../../src/projectScene/viewportModel';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {WorkspaceArchive} from '../../src/projectPackage/workspaceArchive';
import {inspectProjectCandidates} from '../../src/domain/projectCandidates';
import {validationMetadataLimits} from '../../src/projectFiles/validation';
import {presentedCanvas} from './presentedCanvas';
const entry='http://127.0.0.1:4182/?timings=1',title='GSの本体更新';
const models=(p:Page)=>p.getByRole('tabpanel',{name:'モデル',exact:true});
async function ready(p:Page){await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText(title,{timeout:240_000});await expect(p.locator('.lv-project-viewport-status')).toBeEmpty({timeout:180_000});}
async function output(p:Page,info:TestInfo,name:string,workspace=false){
 const menu=p.locator('details.lv-project-files');if(!await menu.evaluate(n=>(n as HTMLDetailsElement).open))await menu.locator(':scope > summary').click();
 const area=p.getByRole('region',{name:'ファイル',exact:true});await area.getByRole('button',{name:workspace?'相手に渡す':'保存',exact:true}).click();
 if(workspace)await area.getByLabel('渡す内容',{exact:true}).selectOption('teamWorkspace');else await area.getByLabel('名前（任意）',{exact:true}).fill(name);
 const primary=area.locator('button.lv-file-primary');await expect(primary).toBeEnabled({timeout:600_000});
 const [download]=await Promise.all([p.waitForEvent('download',{timeout:600_000}),primary.click()]);const path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
 await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy','false',{timeout:600_000});return path;
}
function active(records:Record<string,any>){const asset=Object.values(records.assetsById)[0] as any,binding=records.assetBindingsById[asset.status.activeBindingId],revision=records.assetRevisionsById[binding.assetRevisionId],reps=revision.representationIds.map((id:string)=>records.representationsById[id]);return {asset,binding,revision,gs:reps.find((r:any)=>r.role==='gsPrimary'),proxy:reps.find((r:any)=>r.role==='interactionProxy')};}
async function backup(path:string){const b=await BackupArchive.inspect(await openAsBlob(path),validationMetadataLimits),c=await inspectProjectCandidates(b.source.read(),validationMetadataLimits);if(c.kind!=='project-candidate-inspection')throw Error('Backup');const records=c.unambiguousRecords as Record<string,any>;return {b,records,...active(records)};}
async function verifyBody(b:BackupArchive,digest:string){const file=b.archive.entryBlob('blobs/sha256/'+digest);expect(file.size).toBe(largeGsBytes);const hash=createHash('sha256');const reader=file.stream().getReader();try{for(;;){const part=await reader.read();if(part.done)break;hash.update(part.value);}}finally{reader.releaseLock();}expect(hash.digest('hex')).toBe(digest);}

test('50万点SH4を新しい本体へ差し替え、旧資源の解放・2世代原本・保存・cold再開を確認する',async({},info)=>{
 test.setTimeout(3_600_000);A.getHeads(A.init());const original=await largeGsFixture(),updated=await largeGsFixture(2),errors:string[]=[],stages:any[]=[],started=Date.now();
 await mkdir('.artifacts/e2e/profiles',{recursive:true});const profile=await mkdtemp('.artifacts/e2e/profiles/gs-replacement-');let context:BrowserContext|undefined;
 const mark=async(stage:string,p:Page)=>{await p.evaluate(()=>document.dispatchEvent(new Event('lociview-timing-snapshot')));stages.push({stage,wallMs:Date.now()-started,timing:await p.evaluate(()=>performance.getEntriesByType('measure').map(e=>({name:e.name,ms:e.duration,detail:(e as PerformanceMeasure).detail})))});console.log(stage,Date.now()-started);};
 const launch=async()=>{context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true});context.setDefaultTimeout(15_000);
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin==='http://127.0.0.1:4182'||['blob:','data:'].includes(url.protocol)?route.continue():route.abort('blockedbyclient');});
  await context.addInitScript(()=>{const original=Blob.prototype.arrayBuffer;(window as any).wholeGsReads=0;Blob.prototype.arrayBuffer=async function(){if(this.size>1_048_576){const prefix=new Uint8Array(await original.call(Blob.prototype.slice.call(this,0,32)));if(new TextDecoder().decode(prefix).startsWith('ply\nformat binary_little_endian')){(window as any).wholeGsReads++;throw Error('Whole GS arrayBuffer forbidden');}}return original.call(this);};});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});const p=context.pages()[0]??await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.goto(entry);return p;};
 const close=async(label:string)=>{expect(await context!.pages()[0]!.evaluate(()=>(window as any).wholeGsReads)).toBe(0);await context!.tracing.stop({path:info.outputPath(label+'-trace.zip')});await context!.close();context=undefined;};
 try{
  let p=await launch();await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles(original);await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByLabel('プロジェクト名',{exact:true}).fill(title);await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(p);await mark('created',p);
  await p.getByRole('tab',{name:'モデル',exact:true}).click();await models(p).locator('.lv-model-select').first().click();const proxy=p.waitForEvent('filechooser');await models(p).getByRole('button',{name:'位置指定用の面を追加',exact:true}).click();await(await proxy).setFiles({name:'以前の面.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await models(p).getByRole('button',{name:'このモデルに面を追加',exact:true}).click();await expect(p.getByText('位置指定用の面を登録しました。',{exact:true})).toBeVisible({timeout:240_000});await ready(p);
  await lookAlongFront(p);await p.getByRole('tab',{name:'キャプション',exact:true}).click();await p.getByRole('button',{name:'ピンを追加',exact:true}).click();
  const canvas=p.getByLabel('3Dモデルの表示',{exact:true}),box=(await canvas.boundingBox())!,extent=4*Math.exp(Math.fround(Math.log(.0007))),bounds={min:[-500/300-extent,-250/300-extent,-extent] as const,max:[499/300+extent,249/300+extent,.0006+extent] as const},pose=fittedPose(bounds,defaultPose(),box.width/box.height,'+z');
  if(pose.projection.kind!=='perspective')throw Error('Perspective');const camera=new THREE.PerspectiveCamera(pose.projection.verticalFov*180/Math.PI,box.width/box.height,.000001,1e9);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const hit=new THREE.Vector3(.1,.2,0).project(camera);await canvas.click({position:{x:(hit.x+1)*box.width/2,y:(1-hit.y)*box.height/2}});
  await p.getByLabel('位置 X',{exact:true}).fill('0.2');await p.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(p.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible({timeout:240_000});
  const detail=p.getByRole('region',{name:'キャプションの詳細',exact:true});await detail.getByLabel('本文',{exact:true}).fill('差し替えても残す記録');await detail.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('変更を適用しました。',{exact:true})).toBeVisible({timeout:240_000});
  const workspace=await WorkspaceArchive.inspect(await openAsBlob(await output(p,info,'before-replacement',true)),validationMetadataLimits),oldInspection=await inspectProjectCandidates(workspace.source.read(),validationMetadataLimits);if(oldInspection.kind!=='project-candidate-inspection')throw Error('Workspace');const oldRecords=oldInspection.unambiguousRecords as Record<string,any>,old=active(oldRecords),caption=Object.values(oldRecords.captionsById)[0] as any;
  const beforePixel=(await presentedCanvas(canvas)).sample;await mark('original-workspace',p);
  await p.getByRole('tab',{name:'モデル',exact:true}).click();await models(p).locator('.lv-model-select').first().click();const chooser=p.waitForEvent('filechooser');await revealModelManagement(p); await models(p).getByRole('button',{name:'モデルを差し替える',exact:true}).click();await(await chooser).setFiles(updated);await expect(models(p).getByText(/位置指定用の面は未設定になります/)).toBeVisible();await models(p).getByRole('button',{name:'差し替えを確定',exact:true}).click();await expect(p.getByText('モデルを差し替えました。配置と記録を保持しています。',{exact:true})).toBeVisible({timeout:600_000});await ready(p);
  await expect.poll(async()=>(await presentedCanvas(canvas)).sample[0]!,{timeout:90_000}).toBeGreaterThan(beforePixel[0]!+10);await p.screenshot({path:info.outputPath('new-gs-no-surface.png'),fullPage:true});await mark('replaced-and-painted',p);
  const saved=await backup(await output(p,info,'two-generation-backup'));expect(saved.gs.blob.digest).toBe(updatedLargeGsDigest);expect(saved.proxy).toBeUndefined();expect(saved.revision.representationIds).toEqual([saved.gs.id]);expect(saved.gs.variantFamilyId).not.toBe(old.gs.variantFamilyId);expect(saved.revision.anchorCompatibilityClasses).not.toEqual(old.revision.anchorCompatibilityClasses);
  expect(saved.binding.assetToProject).toEqual(old.binding.assetToProject);expect(saved.gs.representationToAsset).toEqual(old.gs.representationToAsset);expect(saved.asset.assetFrameId).toBe(old.asset.assetFrameId);expect(saved.records.captionsById[caption.id]).toEqual(caption);expect(saved.records.representationsById[old.gs.id]).toEqual(old.gs);expect(saved.records.representationsById[old.proxy.id]).toEqual(old.proxy);
  await verifyBody(saved.b,largeGsDigest);await verifyBody(saved.b,updatedLargeGsDigest);await mark('both-originals-saved',p);await close('replaced');
  p=await launch();await ready(p);await p.getByRole('tab',{name:'モデル',exact:true}).click();await models(p).locator('.lv-model-select').first().click();await expect(models(p).getByRole('button',{name:'位置指定用の面を追加',exact:true})).toBeVisible();await expect(models(p).getByRole('button',{name:'位置指定用の面を外す',exact:true})).toBeHidden();
  const cold=await backup(await output(p,info,'two-generation-cold'));expect(cold.b.source.token).toBe(saved.b.source.token);expect(cold.records).toEqual(saved.records);await verifyBody(cold.b,largeGsDigest);await verifyBody(cold.b,updatedLargeGsDigest);await mark('cold-verified',p);expect(errors).toEqual([]);await close('cold');
 }finally{if(context){await context.pages()[0]?.screenshot({path:info.outputPath('failure.png'),fullPage:true}).catch(()=>{});await context.tracing.stop({path:info.outputPath('failure-trace.zip')}).catch(()=>{});await context.close();}await info.attach('stages',{body:JSON.stringify({profile,stages,errors}),contentType:'application/json'});}
});
