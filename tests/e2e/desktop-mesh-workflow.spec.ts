import {beginMaterialEditing} from './workspaceUi';
import { revealFileSurface, revealModelManagement, lookAlongFront } from './workspaceUi';
import {test,expect,chromium,type Page,type BrowserContext,type TestInfo} from '@playwright/test';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import * as A from '@automerge/automerge';
import * as THREE from 'three';
import {defaultPose,fittedPose} from '../../src/projectScene/viewportModel';
import {nativeSpatialBackup,nativeMeshBackup,meshSources,smallPng} from './fixtures';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {WorkspaceArchive} from '../../src/projectPackage/workspaceArchive';
import {CleanArchive} from '../../src/projectPackage/cleanArchive';
import {PackageArchive} from '../../src/projectPackage/zipArchive';
import {inspectProjectCandidates} from '../../src/domain/projectCandidates';
import {validationMetadataLimits as limits} from '../../src/projectFiles/validation';
import {presentedCanvas} from './presentedCanvas';
import {gsFixture} from '../helpers/gsFixture';

const entry='http://127.0.0.1:4182/?timings=1',title='Native点群とGS';
const files=(p:Page)=>p.getByRole('region',{name:'ファイル',exact:true});
const detail=(p:Page)=>p.getByRole('region',{name:'キャプションの詳細',exact:true});
async function ready(p:Page,expected=title,notice:'clear'|'smooth'='clear'){await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText(expected,{timeout:240000});const status=p.locator('.lv-project-viewport-status');if(notice==='smooth'){await expect(status).toContainText('滑らかな透過表示は未対応',{timeout:180000});await expect(status).not.toContainText(/読み込み中|準備しています|失敗|確認できません/);}else await expect(status).toBeEmpty({timeout:180000});}
async function open(p:Page,path:string){await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles(path);await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();}
async function selectCaption(p:Page,label?:string){await p.getByRole('tab',{name:'キャプション',exact:true}).click();const rows=p.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select');await(label?rows.filter({hasText:label}):rows.first()).click();}
async function edit(p:Page,field:'タイトル'|'本文',text:string){await detail(p).getByLabel(field,{exact:true}).fill(text);await detail(p).getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('変更を適用しました。',{exact:true})).toBeVisible({timeout:180000});}
async function output(p:Page,info:TestInfo,name:string,purpose:'backup'|'teamWorkspace'|'contribution'|'review'|'clean',base?:string,reviewScene?:string){
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
  if(purpose==='review'){const scenes=area.getByLabel('渡すシーン',{exact:true});await scenes.selectOption(reviewScene?{label:reviewScene}:(await scenes.locator('option').evaluateAll(ns=>ns.map(n=>(n as HTMLOptionElement).value).filter(Boolean)))[0]!);}
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
      const io=(window as any).previewIo={writable:0,fileCreates:0,dbOpen:0,dbPut:0};
      const writable=FileSystemFileHandle.prototype.createWritable;FileSystemFileHandle.prototype.createWritable=function(options){io.writable++;return writable.call(this,options);};
      const handle=FileSystemDirectoryHandle.prototype.getFileHandle;FileSystemDirectoryHandle.prototype.getFileHandle=function(name,options){if(options?.create)io.fileCreates++;return handle.call(this,name,options);};
      const dbOpen=IDBFactory.prototype.open;IDBFactory.prototype.open=function(...args){io.dbOpen++;return dbOpen.apply(this,args);};
      const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){io.dbPut++;return put.apply(this,args);};
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
  for(const source of meshSources()){const rep=reps.find(r=>r.formatProfile.id===`development-validation-mesh-${source.format}-1`&&r.role==='meshPrimary');expect(rep).toBeTruthy();expect(rep.representationToAsset).toEqual({translation:[1,2,3],rotationXYZW:[0,0,0,1],uniformScale:2,reflection:'x'});}
  expect(proxy.formatProfile.id).toBe('development-validation-mesh-obj-1');expect(proxy.materialCatalog.slots).toHaveLength(2);
  const caption=(Object.values(records.captionsById) as any[]).find(c=>c.anchor.kind==='asset'&&c.anchor.assetId===point.assetId&&c.anchor.hitEvidence.method==='manual');expect(caption.anchor.positionAsset).toEqual([1,.5,0]);
}
function materialMeaning(records:Record<string,any>){
  const reps=Object.values(records.representationsById) as any[];
  return(Object.values(records.materialOverridesById) as any[]).filter(o=>o.lifecycle.state==='active').map(o=>{
    const rep=reps.find(r=>r.assetId===o.routing.target.assetId&&r.materialCatalog?.layoutId===o.routing.target.materialLayoutId),slot=rep?.materialCatalog.slots.find((s:any)=>s.logicalMaterialSlotId===o.routing.target.logicalMaterialSlotId);if(!slot)throw Error('Unbound material');
    return{blob:rep.blob.digest,source:slot.sourceLocator,semantics:slot.sourceSemantics,appearance:o.appearance,compositing:o.compositing,scope:o.routing.scope.kind};
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

for(const opaqueMaterials of [false,true,'standard']as const)test(opaqueMaterials==='standard'?'07n Native10の説明取消と標準材質編集解除2往復5用途復元coldを完走する':opaqueMaterials?'07m Native9の元材質を引き継ぎ編集解除2往復5用途復元coldを完走する':'Native07lの4形式と点群GSと面を変換し共有返送Review編集コピー独立コピー復元とcold再開を完走する',async({},info)=>{
  test.setTimeout(1800000);const standard=opaqueMaterials==='standard',fixture=await nativeMeshBackup(!!opaqueMaterials,standard),input=info.outputPath('native-small.zip');await writeFile(input,fixture.file);const run=await setup(info,fixture.bodyRanges);
  try{
    let a=await run.launch(0);await expect(a.p.getByRole('button',{name:'ファイルを開く',exact:true})).toBeEnabled();const previewIo=standard?await a.p.evaluate(()=>(window as any).previewIo):null;
    await open(a.p,input);await expect(a.p.getByRole('button',{name:'新しいプロジェクトに変換',exact:true})).toBeVisible({timeout:180000});await expect(a.p.getByText(/OBJの外部材質・画像は読み込まず/)).toBeVisible();
    if(standard){const explanation=a.p.getByRole('region',{name:'材質の変換による変更',exact:true});await expect(explanation).toBeVisible();await explanation.locator('summary').click();await expect(explanation.locator('li').filter({hasText:'観察 / obj /'})).toContainText('不透明度を掛けます');await expect(explanation.locator('li').filter({hasText:'観察 / gltf /'})).toContainText('非表示になります');
      expect(await a.p.evaluate(()=>(window as any).previewIo)).toEqual(previewIo);await a.p.getByRole('button',{name:'選択を取り消す',exact:true}).click();await expect(a.p.getByRole('button',{name:'ファイルを開く',exact:true})).toBeEnabled();expect(await a.p.evaluate(()=>(window as any).previewIo)).toEqual(previewIo);await expect(explanation).toBeHidden();await open(a.p,input);await expect(a.p.getByRole('button',{name:'新しいプロジェクトに変換',exact:true})).toBeVisible({timeout:180000});}
    await a.p.getByRole('button',{name:'新しいプロジェクトに変換',exact:true}).click();await ready(a.p,title,standard?'smooth':'clear');await run.mark('converted',a.p);
    await a.p.getByRole('tab',{name:'モデル',exact:true}).click();const firstPanel=a.p.getByRole('tabpanel',{name:'モデル',exact:true});await firstPanel.locator('.lv-model-select').filter({hasText:'GS'}).click();await firstPanel.getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await lookAlongFront(a.p);await a.p.screenshot({path:info.outputPath('converted-models.png'),fullPage:true});
    await expect.poll(async()=>(await presentedCanvas(a.p.getByLabel('3Dモデルの表示',{exact:true}))).red,{timeout:90000}).toBeGreaterThan(20);
    if(opaqueMaterials){
      await a.p.getByRole('tab',{name:'描画',exact:true}).click();const m=a.p.getByRole('region',{name:'材質',exact:true});await m.getByLabel('モデル',{exact:true}).selectOption({label:'gltf'});const surface=m.getByLabel('マテリアル',{exact:true});await surface.selectOption((await surface.locator('option').evaluateAll(ns=>ns.map(n=>(n as HTMLOptionElement).value).filter(Boolean)))[0]!);await m.getByLabel('適用範囲',{exact:true}).selectOption('scene');
      await beginMaterialEditing(m);await m.getByLabel('表示する面',{exact:true}).selectOption('front');await m.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(a.p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await ready(a.p);
      await m.getByRole('button',{name:'この範囲の設定を解除',exact:true}).click();await m.getByRole('button',{name:'設定を解除する',exact:true}).click();await expect(a.p.getByText('材質の設定を解除しました。',{exact:true})).toBeVisible({timeout:180000});await ready(a.p);
      await beginMaterialEditing(m);await m.getByLabel('照明',{exact:true}).selectOption('unlit');await m.getByLabel('表示する面',{exact:true}).selectOption('double');if(standard){await m.getByLabel('透過の表示方法',{exact:true}).selectOption('mask');await m.getByLabel('切り抜きのしきい値',{exact:true}).fill('.25');}await m.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(a.p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await ready(a.p);await run.mark('source-material-edit-reset',a.p);
    }
    await selectCaption(a.p);await expect(detail(a.p).getByLabel('本文',{exact:true})).toHaveValue('本文を保持');await edit(a.p,'本文','変換後の編集');
    const first=await backup(await output(a.p,info,'first','backup'));verifyModels(first.records,fixture);if(opaqueMaterials){expect(materialMeaning(first.records)).toHaveLength(2);expect(materialMeaning(first.records).some(m=>m.semantics.lighting==='unlit')).toBe(true);}const originalCaptionId=(Object.values(first.records.captionsById) as any[]).find(c=>c.title==='既存のピン').id;
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
      await a.p.getByRole('tab',{name:'モデル',exact:true}).click();const panel=a.p.getByRole('tabpanel',{name:'モデル',exact:true});await panel.locator('.lv-model-select').filter({hasText:kind}).click();await panel.getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await lookAlongFront(a.p);
      await a.p.getByRole('tab',{name:'キャプション',exact:true}).click();await a.p.getByRole('button',{name:'ピンを追加',exact:true}).click();
      await hit(kind,kind==='点群'?[.5,0,0]:[-1.4,.3,.05]);
      if(kind==='GS'){await expect(a.p.getByLabel('位置 X',{exact:true})).toBeEnabled();await a.p.getByLabel('位置 X',{exact:true}).fill('.2');}
      await a.p.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(a.p.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible({timeout:180000});await edit(a.p,'タイトル',kind==='点群'?'引き継いだ点の指定':'引き継いだ面の指定');
    }
    await a.p.getByRole('tab',{name:'モデル',exact:true}).click();await a.p.getByRole('tabpanel',{name:'モデル',exact:true}).getByRole('button',{name:'すべて表示',exact:true}).click();
    const placed=await backup(await output(a.p,info,'placed','backup')),captions=Object.values(placed.records.captionsById) as any[];
    expect(captions.find(c=>c.title==='引き継いだ点の指定').anchor).toMatchObject({positionAsset:[.5,0,0],hitEvidence:{method:'point-cloud',source:{surfaceRef:{pointIndex:0}}}});
    expect(captions.find(c=>c.title==='引き継いだ面の指定').anchor).toMatchObject({positionAsset:[.2,expect.any(Number),expect.any(Number)],hitEvidence:{method:'manual'}});
    let workspace=await output(a.p,info,'workspace-1','teamWorkspace'),wire=await WorkspaceArchive.inspect(await openAsBlob(workspace),limits),b=await run.launch(1);await open(b.p,workspace);await ready(b.p,title,standard?'smooth':'clear');
    for(let round=1;round<=2;round++){
      const previousTitle=round===1?'既存のピン':`返送前${round-1}`;await selectCaption(a.p,previousTitle);await edit(a.p,'本文',`手元の本文${round}`);await selectCaption(b.p,previousTitle);await edit(b.p,'タイトル',`返送前${round}`);
      const returned=await output(b.p,info,'return-'+round,'contribution',wire.archive.control.manifest.packageId),receive=a.p.getByRole('region',{name:'更新ファイル',exact:true});
      await revealFileSurface(a.p,'受信');await receive.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(returned);await receive.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(receive.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:180000});await ready(a.p,title,standard?'smooth':'clear');
      const state=await backup(await output(a.p,info,'round-'+round,'backup'));verifyModels(state.records,fixture);if(opaqueMaterials)expect(materialMeaning(state.records)).toEqual(materialMeaning(first.records));
      expect(state.records.captionsById[originalCaptionId]).toMatchObject({title:`返送前${round}`,body:`手元の本文${round}`});
      if(round===1){workspace=await output(a.p,info,'workspace-2','teamWorkspace');wire=await WorkspaceArchive.inspect(await openAsBlob(workspace),limits);const incoming=b.p.getByRole('region',{name:'更新ファイル',exact:true});await revealFileSurface(b.p,'受信');await incoming.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(workspace);await incoming.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(incoming.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:180000});await ready(b.p,title,standard?'smooth':'clear');}
    }
    await run.close(b.context);await run.mark('two-rounds',a.p);
    const finalPath=await output(a.p,info,'final','backup'),final=await backup(finalPath),reviewPath=await output(a.p,info,'review','review',undefined,opaqueMaterials?'観察':undefined),cleanPath=await output(a.p,info,'clean','clean');
    if(opaqueMaterials)expect(materialMeaning(final.records)).toEqual(materialMeaning(first.records));
    for(const path of [workspace,finalPath,reviewPath,cleanPath]){const archive=await PackageArchive.inspect(await openAsBlob(path));expect(archive.control.manifest.blobs.some(b=>b.sha256===fixture.originalDigest)).toBe(false);}
    await run.close(a.context);a=await run.launch(0);await ready(a.p,title,standard?'smooth':'clear');expect((await backup(await output(a.p,info,'cold','backup'))).archive.source.token).toBe(final.archive.source.token);await run.close(a.context);
    const review=await run.launch(2);await open(review.p,reviewPath);await expect(review.p.getByText('閲覧用シーンを開きました。編集プロジェクトは作成していません。',{exact:true})).toBeVisible({timeout:180000});await review.p.getByRole('button',{name:'編集コピーを作る',exact:true}).click();await review.p.getByRole('button',{name:'コピーを作成',exact:true}).click();await ready(review.p,title,standard?'smooth':'clear');
    const editable=await backup(await output(review.p,info,'review-edit','backup'));expect(editable.archive.source.proof.identity.projectId).not.toBe(final.archive.source.proof.identity.projectId);expect((Object.values(editable.records.representationsById) as any[]).find(r=>r.role==='interactionProxy').derivedFrom).toEqual([]);if(opaqueMaterials)expect(materialMeaning(editable.records)).toEqual(materialMeaning(final.records));await run.close(review.context);
    const clean=await run.launch(3);await open(clean.p,cleanPath);await ready(clean.p,title,standard?'smooth':'clear');const standalone=await backup(await output(clean.p,info,'clean-edit','backup')),reps=Object.values(standalone.records.representationsById) as any[];expect(reps.find(r=>r.role==='interactionProxy').derivedFrom).toEqual([reps.find(r=>r.role==='gsPrimary').id]);expect((await CleanArchive.inspect(await openAsBlob(cleanPath),limits)).source.proof.identity).toEqual(standalone.archive.source.proof.identity);if(opaqueMaterials)expect(materialMeaning(standalone.records)).toEqual(materialMeaning(final.records));await run.close(clean.context);
    const restored=await run.launch(4);await open(restored.p,finalPath);await restored.p.getByRole('button',{name:'バックアップから復元',exact:true}).click();await ready(restored.p,title,standard?'smooth':'clear');expect((await backup(await output(restored.p,info,'restored','backup'))).records).toEqual(final.records);await run.close(restored.context);
    const cold=await run.launch(4);await ready(cold.p,title,standard?'smooth':'clear');await run.mark('restored-cold',cold.p);await run.close(cold.context);expect(run.errors).toEqual([]);
  }finally{await run.finish();}
});


test('Mesh07lは通常のファイル選択から4形式を追加し材質と位置を編集して保存cold再開できる',async({},info)=>{
 test.setTimeout(900000);const run=await setup(info,[]),sources=meshSources(),projectTitle='4形式の作業';
 try{
   let a=await run.launch(0);const p=a.p,stl=sources[0]!;
   await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'赤い面.stl',mimeType:'model/stl',buffer:stl.bytes});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();
   await expect(p.getByText(/このプロジェクトの単位は不明/)).toBeVisible();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill(projectTitle);await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(p,projectTitle);
   await p.getByRole('tab',{name:'モデル',exact:true}).click();const panel=p.getByRole('tabpanel',{name:'モデル',exact:true}),canvas=p.getByLabel('3Dモデルの表示',{exact:true});await lookAlongFront(p);await expect.poll(async()=>(await presentedCanvas(canvas)).red,{timeout:90000}).toBeGreaterThan(20);
   for(const source of sources.slice(1)){
     let buffer=source.bytes;
     if(source.format==='gltf'){
       const j=JSON.parse(buffer.toString('utf8')),body=Buffer.from(j.buffers[0].uri.split(',')[1],'base64'),uv=Buffer.alloc(24);[0,0,1,0,0,1].forEach((v,i)=>uv.writeFloatLE(v,i*4));const bin=Buffer.concat([body,uv]);
       j.buffers[0]={byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')};j.bufferViews.push({buffer:0,byteOffset:36,byteLength:24});j.accessors.push({bufferView:1,componentType:5126,count:3,type:'VEC2'});j.meshes[0].primitives[0].attributes.TEXCOORD_0=1;j.images=[{uri:'data:image/png;base64,'+smallPng().toString('base64')}];j.textures=[{source:0}];j.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};buffer=Buffer.from(JSON.stringify(j));
     }
     const chooser=p.waitForEvent('filechooser');await revealModelManagement(p); await panel.getByRole('button',{name:'3Dモデルを追加',exact:true}).click();await(await chooser).setFiles({name:source.format+'.'+source.format,mimeType:source.format==='obj'?'text/plain':source.format==='gltf'?'model/gltf+json':'application/ply',buffer});if(source.format==='obj'){await expect(panel.getByText(/OBJの外部材質・画像は読み込まず/)).toBeVisible();await panel.getByRole('button',{name:'このモデルを追加',exact:true}).click();}await expect(p.getByText('モデルを追加しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p,projectTitle);
     await panel.getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await lookAlongFront(p);await p.screenshot({path:info.outputPath(source.format+'-rendered.png'),fullPage:true});
     await expect(canvas).toBeVisible();
   }
   const gsChooser=p.waitForEvent('filechooser');await revealModelManagement(p); await panel.getByRole('button',{name:'3Dモデルを追加',exact:true}).click();await(await gsChooser).setFiles({name:'GS.ply',mimeType:'application/ply',buffer:Buffer.from(gsFixture(0))});await expect(p.getByText('モデルを追加しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p,projectTitle);
   const proxyChooser=p.waitForEvent('filechooser');await panel.getByRole('button',{name:'位置指定用の面を追加',exact:true}).click();await(await proxyChooser).setFiles({name:'位置指定.obj',mimeType:'text/plain',buffer:sources[2]!.bytes});const proxyArea=panel.getByRole('region',{name:'位置指定用の面',exact:true});await expect(proxyArea.getByText(/OBJの外部材質・画像は読み込まず/)).toBeVisible();await proxyArea.getByRole('button',{name:'このモデルに面を追加',exact:true}).click();await expect(p.getByText('位置指定用の面を登録しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p,projectTitle);
   await panel.locator('.lv-model-select').filter({hasText:'obj.obj'}).click();const replaceChooser=p.waitForEvent('filechooser');await revealModelManagement(p); await panel.getByRole('button',{name:'モデルを差し替える',exact:true}).click();await(await replaceChooser).setFiles({name:'差し替え.obj',mimeType:'text/plain',buffer:sources[2]!.bytes});await expect(panel.getByRole('region',{name:'モデルのファイル',exact:true}).getByText(/OBJの外部材質・画像は読み込まず/)).toBeVisible();await panel.getByRole('button',{name:'差し替えを確定',exact:true}).click();await expect(p.getByText('モデルを差し替えました。配置と記録を保持しています。',{exact:true})).toBeVisible({timeout:180000});await ready(p,projectTitle);
   await panel.getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await lookAlongFront(p);
   await p.getByRole('tab',{name:'描画',exact:true}).click();const materials=p.getByRole('region',{name:'材質',exact:true});await materials.getByLabel('モデル',{exact:true}).selectOption({label:'obj.obj'});const surface=materials.getByLabel('マテリアル',{exact:true});const choices=await surface.locator('option').evaluateAll(ns=>ns.map(n=>(n as HTMLOptionElement).value).filter(Boolean));expect(choices).toHaveLength(2);await surface.selectOption(choices[0]!);await beginMaterialEditing(materials);
   await materials.getByLabel('照明',{exact:true}).selectOption('lit');await materials.getByLabel('透過の表示方法',{exact:true}).selectOption('mask');await materials.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p,projectTitle);
   const lit=await presentedCanvas(canvas,30,30);await beginMaterialEditing(materials);await materials.getByLabel('指定した色を透過',{exact:true}).selectOption('on');await materials.getByLabel('透過する色',{exact:true}).fill('#ffffff');await materials.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p,projectTitle);await expect.poll(async()=>(await presentedCanvas(canvas,30,30)).sample).not.toEqual(lit.sample);await p.screenshot({path:info.outputPath('obj-phong-chroma-mask.png'),fullPage:true});
   await p.getByRole('tab',{name:'キャプション',exact:true}).click();await p.getByRole('button',{name:'ピンを追加',exact:true}).click();const box=await canvas.boundingBox();if(!box)throw Error('canvas');await canvas.click({position:{x:box.width*.53,y:box.height*.55}});await expect(p.getByText('配置する面を特定できません。視点を変えて選び直してください。',{exact:true})).toBeVisible();await expect(p.getByRole('button',{name:'位置を確定',exact:true})).toBeHidden();await expect(p.locator('.lv-project-viewport-status')).toBeEmpty();await canvas.click({position:{x:box.width*.45,y:box.height*.45}});await expect(p.getByLabel('位置 X',{exact:true})).toBeEnabled();await p.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(p.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible({timeout:180000});await edit(p,'タイトル','面上の記録');
   await p.getByRole('tab',{name:'描画',exact:true}).click();await materials.getByRole('button',{name:'この範囲の設定を解除',exact:true}).click();await materials.getByRole('button',{name:'設定を解除する',exact:true}).click();await expect(p.getByText('材質の設定を解除しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p,projectTitle);await expect.poll(async()=>(await presentedCanvas(canvas,30,30)).sample).toEqual(lit.sample);
   await beginMaterialEditing(materials);await materials.getByLabel('照明',{exact:true}).selectOption('unlit');await materials.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p,projectTitle);await p.screenshot({path:info.outputPath('obj-unlit-reset.png'),fullPage:true});
   const path=await output(p,info,'fresh-four-formats','backup'),saved=await backup(path);expect(saved.records.project.frame.unit).toEqual({kind:'unknown'});expect(Object.keys(saved.records.representationsById)).toHaveLength(7);expect((Object.values(saved.records.captionsById) as any[]).find(c=>c.title==='面上の記録').anchor.kind).toBe('asset');
   await run.close(a.context);a=await run.launch(0);await ready(a.p,projectTitle);expect((await backup(await output(a.p,info,'fresh-cold','backup'))).records).toEqual(saved.records);await run.close(a.context);expect(run.errors).toEqual([]);
 }finally{await run.finish();}
});
