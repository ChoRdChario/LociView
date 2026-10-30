import { revealCaptionList } from './workspaceUi';
import {test,expect,chromium,type Page,type BrowserContext,type TestInfo} from '@playwright/test';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import * as A from '@automerge/automerge';
import * as THREE from 'three';
import {defaultPose,fittedPose} from '../../src/projectScene/viewportModel';
import {nativeSpatialBackup} from './fixtures';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {WorkspaceArchive} from '../../src/projectPackage/workspaceArchive';
import {CleanArchive} from '../../src/projectPackage/cleanArchive';
import {PackageArchive} from '../../src/projectPackage/zipArchive';
import {inspectProjectCandidates} from '../../src/domain/projectCandidates';
import {validationMetadataLimits as limits} from '../../src/projectFiles/validation';
import {presentedCanvas} from './presentedCanvas';

const entry='http://127.0.0.1:4182/?timings=1',title='Native点群とGS';
const files=(p:Page)=>p.getByRole('region',{name:'ファイル',exact:true});
const detail=(p:Page)=>p.getByRole('region',{name:'キャプションの詳細',exact:true});
async function ready(p:Page){await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText(title,{timeout:240000});await expect(p.locator('.lv-project-viewport-status')).toBeEmpty({timeout:180000});}
async function open(p:Page,path:string){await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles(path);await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();}
async function selectCaption(p:Page){await revealCaptionList(p);await p.getByRole('tab',{name:'キャプション',exact:true}).click();await p.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click();}
async function edit(p:Page,field:'タイトル'|'本文',text:string){await detail(p).getByLabel(field,{exact:true}).fill(text);await detail(p).getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('変更を適用しました。',{exact:true})).toBeVisible({timeout:180000});}
async function output(p:Page,info:TestInfo,name:string,purpose:'backup'|'teamWorkspace'|'contribution'|'review'|'clean',base?:string){
  const menu=p.locator('details.lv-project-files');if(await menu.count()&&!await menu.evaluate(n=>(n as HTMLDetailsElement).open))await menu.locator(':scope > summary').click();
  const area=files(p);
  if(purpose==='review'||purpose==='clean'){
    const more=area.locator('summary').filter({hasText:/^その他$/});if(!await more.evaluate(n=>(n.parentElement as HTMLDetailsElement).open))await more.click();
    await area.getByRole('button',{name:purpose==='review'?'シーンを共有':'独立コピーを作る',exact:true}).click();
  }else await area.getByRole('button',{name:purpose==='backup'?'保存':'相手に渡す',exact:true}).click();
  if(purpose==='backup')await area.getByLabel('名前（任意）',{exact:true}).fill(name);
  else if(purpose!=='review'&&purpose!=='clean'){await area.getByLabel('渡す内容',{exact:true}).selectOption(purpose);if(base)await area.getByLabel('元にする作業一式',{exact:true}).selectOption(base);}
  if(purpose==='review'){const scenes=area.getByLabel('渡すシーン',{exact:true});await scenes.selectOption((await scenes.locator('option').evaluateAll(ns=>ns.map(n=>(n as HTMLOptionElement).value).filter(Boolean)))[0]!);}
  if(purpose==='review'||purpose==='clean')await area.getByRole('button',{name:'内容を確認',exact:true}).click();
  const primary=area.locator('button.lv-file-primary');await expect(primary).toBeEnabled({timeout:300000});
  const [download]=await Promise.all([p.waitForEvent('download',{timeout:300000}),primary.click()]);const path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy','false',{timeout:300000});return path;
}
async function backup(path:string){const archive=await BackupArchive.inspect(await openAsBlob(path),limits),c=await inspectProjectCandidates(archive.source.read(),limits);if(c.kind!=='project-candidate-inspection')throw Error('metadata');return{archive,records:c.unambiguousRecords as Record<string,any>};}
async function setup(info:TestInfo,bodyRanges:readonly {start:number;end:number}[]){
  A.getHeads(A.init());await mkdir('.artifacts/e2e/profiles',{recursive:true});const profiles=await Promise.all(['a','b','review','clean','restore'].map(x=>mkdtemp('.artifacts/e2e/profiles/n7-'+x+'-')));
  const contexts=new Set<BrowserContext>(),errors:string[]=[],stages:unknown[]=[],started=Date.now();
  const launch=async(index:number)=>{
    const context=await chromium.launchPersistentContext(profiles[index]!,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:true});contexts.add(context);context.setDefaultTimeout(15000);
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin==='http://127.0.0.1:4182'||['blob:','data:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
    await context.addInitScript((ranges)=>{
      const arrayBuffer=Blob.prototype.arrayBuffer,slice=Blob.prototype.slice,parents=new WeakMap<Blob,{parent:Blob;start:number}>();
      (window as any).nativeReads={wholeOriginalRefused:0,wholeGsRefused:0,maxNativeRange:0,maxNativeBodyRange:0,maxNativeMetadataRange:0};
      Blob.prototype.slice=function(start?:number,end?:number,type?:string){const child=slice.call(this,start,end,type),at=start===undefined?0:start<0?Math.max(0,this.size+start):Math.min(this.size,start);parents.set(child,{parent:this,start:at});return child;};
      const native=async(b:Blob)=>new TextDecoder().decode(await arrayBuffer.call(slice.call(b,0,128))).includes('native/package.json');
      Blob.prototype.arrayBuffer=async function(){
        const metrics=(window as any).nativeReads,parent=parents.get(this)?.parent;
        if(this.size>65536){
          if(await native(this)){metrics.wholeOriginalRefused++;throw Error('Whole Native original read forbidden');}
          const text=new TextDecoder().decode(await arrayBuffer.call(slice.call(this,0,32)));
          if(text.startsWith('ply\nformat binary_little_endian')){
            const zip=parent&&new Uint8Array(await arrayBuffer.call(slice.call(parent,0,4)));
            if(!(parent&&zip![0]===80&&zip![1]===75&&!await native(parent)&&this.size<=1048576)){metrics.wholeGsRefused++;throw Error('Whole GS read forbidden');}
          }
        }
        let owner:Blob=this,start=0;while(parents.has(owner)){const link=parents.get(owner)!;start+=link.start;owner=link.parent;}
        if(owner!==this&&await native(owner)){
          metrics.maxNativeRange=Math.max(metrics.maxNativeRange,this.size);
          // ZIP end-directory discovery may straddle payload and metadata. Only
          // ranges wholly inside a known body measure this producer boundary.
          const key=ranges.some(r=>start>=r.start&&start+this.size<=r.end)?'maxNativeBodyRange':'maxNativeMetadataRange';
          metrics[key]=Math.max(metrics[key],this.size);
        }
        return arrayBuffer.call(this);
      };
    },bodyRanges);
    const p=context.pages()[0]??await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(entry);return{context,p};
  };
  const mark=async(name:string,p:Page)=>{stages.push({name,wallMs:Date.now()-started,reads:await p.evaluate(()=>(window as any).nativeReads),timing:await p.evaluate(()=>performance.getEntriesByType('measure').map(e=>({name:e.name,ms:e.duration})))});console.log(name,Date.now()-started);};
  const close=async(c:BrowserContext)=>{await c.close();contexts.delete(c);};
  const finish=async()=>{for(const c of contexts)for(const p of c.pages()){await mark('teardown',p).catch(()=>{});await p.screenshot({path:info.outputPath('last-'+contexts.size+'.png'),fullPage:true}).catch(()=>{});}await info.attach('stages',{body:JSON.stringify({stages,errors,profiles}),contentType:'application/json'});for(const c of contexts)await c.close();};
  return{launch,mark,close,finish,errors};
}
function verifyModels(records:Record<string,any>,fixture:Awaited<ReturnType<typeof nativeSpatialBackup>>,derived=true){
  const reps=Object.values(records.representationsById) as any[],gs=reps.find(r=>r.role==='gsPrimary')!,point=reps.find(r=>r.role==='pointPrimary')!,proxy=reps.find(r=>r.role==='interactionProxy')!;
  expect(gs.blob).toMatchObject({digest:fixture.gsDigest,byteLength:fixture.gsBytes,mediaType:'application/ply'});expect(point.blob.digest).toBe(fixture.pointDigest);expect(proxy.blob.digest).toBe(fixture.proxyDigest);
  expect(point.representationToAsset).toEqual({translation:[1,0,0],rotationXYZW:[0,1,0,0],uniformScale:.5,reflection:'x'});expect(point.logicalBoundsAsset).toEqual({min:[.5,0,0],max:[1.5,.5,0]});
  expect(proxy.derivedFrom).toEqual(derived?[gs.id]:[]);expect(proxy.proxyForGsVariantFamilyId).toBe(gs.variantFamilyId);expect(proxy.variantFamilyId).not.toBe(gs.variantFamilyId);
  expect(records.project.frame.unit).toEqual({kind:'unknown'});
  const caption=(Object.values(records.captionsById) as any[]).find(c=>c.anchor.kind==='asset'&&c.anchor.assetId===point.assetId&&c.anchor.hitEvidence.method==='manual');expect(caption.anchor.positionAsset).toEqual([1,.5,0]);
}

test('Native07kの点群GSと面を変換し共有返送Review編集コピー独立コピー復元とcold再開を完走する',async({},info)=>{
  test.setTimeout(1800000);const fixture=await nativeSpatialBackup(),input=info.outputPath('native-small.zip');await writeFile(input,fixture.file);const run=await setup(info,fixture.bodyRanges);
  try{
    let a=await run.launch(0);await open(a.p,input);await expect(a.p.getByRole('button',{name:'新しいプロジェクトに変換',exact:true})).toBeVisible({timeout:180000});await a.p.getByRole('button',{name:'新しいプロジェクトに変換',exact:true}).click();await ready(a.p);await run.mark('converted',a.p);
    await a.p.getByRole('tab',{name:'モデル',exact:true}).click();await a.p.getByRole('button',{name:'正面',exact:true}).click();await a.p.screenshot({path:info.outputPath('converted-models.png'),fullPage:true});
    await expect.poll(async()=>(await presentedCanvas(a.p.getByLabel('3Dモデルの表示',{exact:true}))).red,{timeout:90000}).toBeGreaterThan(20);
    await selectCaption(a.p);await expect(detail(a.p).getByLabel('本文',{exact:true})).toHaveValue('本文を保持');await edit(a.p,'本文','変換後の編集');
    const first=await backup(await output(a.p,info,'first','backup'));verifyModels(first.records,fixture);
    const canvas=a.p.getByLabel('3Dモデルの表示',{exact:true});
    const sourceGs=(Object.values(first.records.representationsById) as any[]).find(r=>r.role==='gsPrimary');
    const hit=async(kind:string,position:readonly number[])=>{
      const box=await canvas.boundingBox();if(!box)throw Error('canvas');
      const bounds=kind==='点群'?{min:[.5,0,0] as const,max:[1.5,.5,0] as const}:{min:[sourceGs.logicalBoundsAsset.min[0]-1.5,...sourceGs.logicalBoundsAsset.min.slice(1)] as [number,number,number],max:[sourceGs.logicalBoundsAsset.max[0]-1.5,...sourceGs.logicalBoundsAsset.max.slice(1)] as [number,number,number]};
      const pose=fittedPose(bounds,defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');
      const camera=new THREE.PerspectiveCamera(pose.projection.verticalFov*180/Math.PI,box.width/box.height,.000001,1e9);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);
      const ndc=new THREE.Vector3(...position).project(camera);await canvas.click({position:{x:(ndc.x+1)*box.width/2,y:(1-ndc.y)*box.height/2}});
    };
    for(const kind of ['点群','GS']){
      await a.p.getByRole('tab',{name:'モデル',exact:true}).click();const panel=a.p.getByRole('tabpanel',{name:'モデル',exact:true});await panel.locator('.lv-model-select').filter({hasText:kind}).click();await panel.getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await a.p.getByRole('button',{name:'正面',exact:true}).click();
      await a.p.getByRole('tab',{name:'キャプション',exact:true}).click();await a.p.getByRole('button',{name:'ピンを追加',exact:true}).click();
      await hit(kind,kind==='点群'?[.5,0,0]:[-1.4,.3,.05]);
      if(kind==='GS'){await expect(a.p.getByLabel('位置 X',{exact:true})).toBeEnabled();await a.p.getByLabel('位置 X',{exact:true}).fill('.2');}
      await a.p.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(a.p.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible({timeout:180000});await edit(a.p,'タイトル',kind==='点群'?'引き継いだ点の指定':'引き継いだ面の指定');
    }
    await a.p.getByRole('tab',{name:'モデル',exact:true}).click();await a.p.getByRole('tabpanel',{name:'モデル',exact:true}).getByRole('button',{name:'すべて表示',exact:true}).click();
    const placed=await backup(await output(a.p,info,'placed','backup')),captions=Object.values(placed.records.captionsById) as any[];
    expect(captions.find(c=>c.title==='引き継いだ点の指定').anchor).toMatchObject({positionAsset:[.5,0,0],hitEvidence:{method:'point-cloud',source:{surfaceRef:{pointIndex:0}}}});
    expect(captions.find(c=>c.title==='引き継いだ面の指定').anchor).toMatchObject({positionAsset:[.2,expect.any(Number),expect.any(Number)],hitEvidence:{method:'manual'}});
    let workspace=await output(a.p,info,'workspace-1','teamWorkspace'),wire=await WorkspaceArchive.inspect(await openAsBlob(workspace),limits),b=await run.launch(1);await open(b.p,workspace);await ready(b.p);
    for(let round=1;round<=2;round++){
      await selectCaption(a.p);await edit(a.p,'本文',`手元の本文${round}`);await selectCaption(b.p);await edit(b.p,'タイトル',`返送前${round}`);
      const returned=await output(b.p,info,'return-'+round,'contribution',wire.archive.control.manifest.packageId),receive=a.p.getByRole('region',{name:'更新ファイル',exact:true});
      await receive.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(returned);await receive.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(receive.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:180000});await ready(a.p);
      const state=await backup(await output(a.p,info,'round-'+round,'backup'));verifyModels(state.records,fixture);
      expect((Object.values(state.records.captionsById) as any[]).find(c=>c.anchor.kind==='asset')).toMatchObject({title:`返送前${round}`,body:`手元の本文${round}`});
      if(round===1){workspace=await output(a.p,info,'workspace-2','teamWorkspace');wire=await WorkspaceArchive.inspect(await openAsBlob(workspace),limits);const incoming=b.p.getByRole('region',{name:'更新ファイル',exact:true});await incoming.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(workspace);await incoming.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(incoming.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:180000});await ready(b.p);}
    }
    await run.close(b.context);await run.mark('two-rounds',a.p);
    const finalPath=await output(a.p,info,'final','backup'),final=await backup(finalPath),reviewPath=await output(a.p,info,'review','review'),cleanPath=await output(a.p,info,'clean','clean');
    for(const path of [workspace,finalPath,reviewPath,cleanPath]){const archive=await PackageArchive.inspect(await openAsBlob(path));expect(archive.control.manifest.blobs.some(b=>b.sha256===fixture.originalDigest)).toBe(false);}
    await run.close(a.context);a=await run.launch(0);await ready(a.p);expect((await backup(await output(a.p,info,'cold','backup'))).archive.source.token).toBe(final.archive.source.token);await run.close(a.context);
    const review=await run.launch(2);await open(review.p,reviewPath);await expect(review.p.getByText('閲覧用シーンを開きました。編集プロジェクトは作成していません。',{exact:true})).toBeVisible({timeout:180000});await review.p.getByRole('button',{name:'編集コピーを作る',exact:true}).click();await review.p.getByRole('button',{name:'コピーを作成',exact:true}).click();await ready(review.p);
    const editable=await backup(await output(review.p,info,'review-edit','backup'));expect(editable.archive.source.proof.identity.projectId).not.toBe(final.archive.source.proof.identity.projectId);expect((Object.values(editable.records.representationsById) as any[]).find(r=>r.role==='interactionProxy').derivedFrom).toEqual([]);await run.close(review.context);
    const clean=await run.launch(3);await open(clean.p,cleanPath);await ready(clean.p);const standalone=await backup(await output(clean.p,info,'clean-edit','backup')),reps=Object.values(standalone.records.representationsById) as any[];expect(reps.find(r=>r.role==='interactionProxy').derivedFrom).toEqual([reps.find(r=>r.role==='gsPrimary').id]);expect((await CleanArchive.inspect(await openAsBlob(cleanPath),limits)).source.proof.identity).toEqual(standalone.archive.source.proof.identity);await run.close(clean.context);
    const restored=await run.launch(4);await open(restored.p,finalPath);await restored.p.getByRole('button',{name:'バックアップから復元',exact:true}).click();await ready(restored.p);expect((await backup(await output(restored.p,info,'restored','backup'))).records).toEqual(final.records);await run.close(restored.context);
    const cold=await run.launch(4);await ready(cold.p);await run.mark('restored-cold',cold.p);await run.close(cold.context);expect(run.errors).toEqual([]);
  }finally{await run.finish();}
});

test('Native07kは64MiB超のSH3原本を全体展開せず変換保存復元cold再開できる',async({},info)=>{
  test.setTimeout(1800000);const fixture=await nativeSpatialBackup(300000),input=info.outputPath('native-large.zip');expect(fixture.file.length).toBeGreaterThan(67108864);await writeFile(input,fixture.file);
  const run=await setup(info,fixture.bodyRanges);
  try{
    const a=await run.launch(0);await open(a.p,input);
    const cancel=a.p.getByRole('button',{name:'選択を取り消す',exact:true}),status=a.p.locator('.lv-validation-status');await expect(cancel).toBeEnabled();await expect(status).toHaveAttribute('data-busy','true');
    expect(await status.evaluate(n=>getComputedStyle(n,'::before').animationName)).not.toBe('none');await a.p.emulateMedia({reducedMotion:'reduce'});expect(await status.evaluate(n=>getComputedStyle(n,'::before').animationName)).toBe('none');await a.p.emulateMedia({reducedMotion:'no-preference'});
    await cancel.click();await expect(cancel).toBeHidden();await expect(status).toHaveAttribute('data-busy','false');expect(await a.p.evaluate(()=>indexedDB.databases())).toEqual([]);await run.mark('large-cancelled-before-create',a.p);
    await open(a.p,input);await expect(a.p.getByRole('button',{name:'新しいプロジェクトに変換',exact:true})).toBeVisible({timeout:240000});await run.mark('large-preview',a.p);
    await a.p.getByRole('button',{name:'新しいプロジェクトに変換',exact:true}).click();await ready(a.p);await run.mark('large-converted',a.p);
    await selectCaption(a.p);await edit(a.p,'本文','大容量Nativeの変換後編集');const savedPath=await output(a.p,info,'large-saved','backup'),saved=await backup(savedPath);verifyModels(saved.records,fixture);
    const reads=await a.p.evaluate(()=>(window as any).nativeReads);expect(reads.wholeOriginalRefused).toBe(0);expect(reads.wholeGsRefused).toBe(0);expect(reads.maxNativeBodyRange).toBeGreaterThan(0);expect(reads.maxNativeBodyRange).toBeLessThanOrEqual(65536);expect(reads.maxNativeMetadataRange).toBeLessThanOrEqual(16777216);await run.mark('large-saved',a.p);await run.close(a.context);
    const originalCold=await run.launch(0);await ready(originalCold.p);expect((await backup(await output(originalCold.p,info,'large-original-cold','backup'))).archive.source.token).toBe(saved.archive.source.token);await run.close(originalCold.context);
    const r=await run.launch(4);await open(r.p,savedPath);await r.p.getByRole('button',{name:'バックアップから復元',exact:true}).click();await ready(r.p);const restored=await backup(await output(r.p,info,'large-restored','backup'));expect(restored.records).toEqual(saved.records);await run.mark('large-restored',r.p);await run.close(r.context);
    const cold=await run.launch(4);await ready(cold.p);await run.mark('large-restored-cold',cold.p);await run.close(cold.context);expect(run.errors).toEqual([]);
  }finally{await run.finish();}
});
