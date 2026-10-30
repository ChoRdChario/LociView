import {beginMaterialEditing} from './workspaceUi';
import { revealFileSurface, lookAlongFront, revealCaptionList } from './workspaceUi';
import {test,expect,chromium,type Page,type TestInfo,type BrowserContext} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import * as A from '@automerge/automerge';
import * as THREE from 'three';
import {defaultPose,fittedPose} from '../../src/projectScene/viewportModel';
import {sourceMaterialPanelsGlb} from './fixtures';
import {presentedCanvas} from './presentedCanvas';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {WorkspaceArchive} from '../../src/projectPackage/workspaceArchive';
import {inspectProjectCandidates} from '../../src/domain/projectCandidates';
import {validationMetadataLimits as limits} from '../../src/projectFiles/validation';

const title='元の材質を編集',entry='http://127.0.0.1:4182/?timings=1';
const materials=(p:Page)=>p.getByRole('region',{name:'材質',exact:true});
const detail=(p:Page)=>p.getByRole('region',{name:'キャプションの詳細',exact:true});
async function ready(p:Page){await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText(title,{timeout:240000});await expect(p.locator('.lv-project-viewport-status')).toBeEmpty({timeout:180000});}
async function open(p:Page,path:string){await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles(path);await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();}
async function caption(p:Page){await revealCaptionList(p);await p.getByRole('tab',{name:'キャプション',exact:true}).click();await p.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click();}
async function edit(p:Page,field:'タイトル'|'本文',value:string){await detail(p).getByLabel(field,{exact:true}).fill(value);await detail(p).getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('変更を適用しました。',{exact:true})).toBeVisible({timeout:180000});}
async function output(p:Page,info:TestInfo,name:string,purpose:'backup'|'teamWorkspace'|'contribution'|'review'|'clean',base?:string){
  const menu=p.locator('details.lv-project-files');if(await menu.count()&&!await menu.evaluate(n=>(n as HTMLDetailsElement).open))await menu.locator(':scope > summary').click();
  const area=p.getByRole('region',{name:'ファイル',exact:true});
  const compact=await revealFileSurface(p,purpose==='backup'?'保存':'共有');
  if(compact){if(purpose!=='backup')await area.getByLabel('渡す内容',{exact:true}).selectOption(purpose);}
  else if(purpose==='review'||purpose==='clean'){const more=area.locator('summary').filter({hasText:/^その他$/});if(!await more.evaluate(n=>(n.parentElement as HTMLDetailsElement).open))await more.click();await area.getByRole('button',{name:purpose==='review'?'シーンを共有':'独立コピーを作る',exact:true}).click();}
  else await area.getByRole('button',{name:purpose==='backup'?'保存':'相手に渡す',exact:true}).click();
  if(purpose==='backup')await area.getByLabel('名前（任意）',{exact:true}).fill(name);
  else if(purpose!=='review'&&purpose!=='clean'){if(!compact)await area.getByLabel('渡す内容',{exact:true}).selectOption(purpose);if(base)await area.getByLabel('元にする作業一式',{exact:true}).selectOption(base);}
  if(purpose==='review'){const scenes=area.getByLabel('渡すシーン',{exact:true});await scenes.selectOption((await scenes.locator('option').evaluateAll(ns=>ns.map(n=>(n as HTMLOptionElement).value).filter(Boolean)))[0]!);}
  if(purpose==='review'||purpose==='clean')await area.getByRole('button',{name:'内容を確認',exact:true}).click();
  const primary=area.locator('button.lv-file-primary');await expect(primary).toBeEnabled({timeout:300000});const [download]=await Promise.all([p.waitForEvent('download',{timeout:300000}),primary.click()]);const path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy','false',{timeout:300000});return path;
}
async function backup(path:string){const archive=await BackupArchive.inspect(await openAsBlob(path),limits),c=await inspectProjectCandidates(archive.source.read(),limits);if(c.kind!=='project-candidate-inspection')throw Error('metadata');return{archive,records:c.unambiguousRecords as Record<string,any>};}
async function receive(p:Page,path:string){await revealFileSurface(p,'受信');const r=p.getByRole('region',{name:'更新ファイル',exact:true});await r.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(path);await r.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(r.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:180000});await ready(p);}

test('元の両面・照明なし・切り抜きを編集解除しGPU選択と5用途ファイル2往復と復旧coldを保つ',async({},info)=>{
  test.setTimeout(1200000);A.getHeads(A.init());await mkdir('.artifacts/e2e/profiles',{recursive:true});
  const profiles=await Promise.all(['a','b','review','clean','restore'].map(x=>mkdtemp('.artifacts/e2e/profiles/material-'+x+'-'))),contexts=new Set<BrowserContext>(),errors:string[]=[],stages:unknown[]=[];const started=Date.now();
  const mark=(name:string)=>{stages.push({name,ms:Date.now()-started});console.log(name,Date.now()-started);};
  const launch=async(index:number)=>{const context=await chromium.launchPersistentContext(profiles[index]!,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:true});contexts.add(context);await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin==='http://127.0.0.1:4182'||['data:','blob:'].includes(u.protocol)?r.continue():r.abort('blockedbyclient');});const p=context.pages()[0]??await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.goto(entry);return{context,p};};
  const close=async(c:BrowserContext)=>{await c.close();contexts.delete(c);};
  try{
    let a=await launch(0),p=a.p;await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'元の材質.glb',mimeType:'model/gltf-binary',buffer:sourceMaterialPanelsGlb()});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill(title);await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(p);await lookAlongFront(p);mark('created');
    const canvas=p.getByLabel('3Dモデルの表示',{exact:true});
    const at=async(x:number,y=0,z=0)=>{const box=await canvas.boundingBox();if(!box)throw Error('canvas');const pose=fittedPose({min:[-4,-1,0],max:[4,1,0]},defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');const camera=new THREE.PerspectiveCamera(pose.projection.verticalFov*180/Math.PI,box.width/box.height,.000001,1e9);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const ndc=new THREE.Vector3(x,y,z).project(camera);return{x:(ndc.x+1)*box.width/2,y:(1-ndc.y)*box.height/2,dx:ndc.x*box.width/2,dy:-ndc.y*box.height/2};};
    const sample=async(x:number)=>{const point=await at(x);return(await presentedCanvas(canvas,point.dx,point.dy)).sample;};
    const pick=async(x:number,covered:boolean)=>{await p.getByRole('tab',{name:'キャプション',exact:true}).click();await p.getByRole('button',{name:'ピンを追加',exact:true}).click();const point=await at(x);await canvas.click({position:{x:point.x,y:point.y}});const confirm=p.getByRole('button',{name:'位置を確定',exact:true});if(covered)await expect(confirm).toBeVisible();else{await expect(p.getByText('配置する面を特定できません。視点を変えて選び直してください。',{exact:true})).toBeVisible();await expect(confirm).toBeHidden();}await expect(p.locator('.lv-project-viewport-status')).toBeEmpty();};
    const cancelPick=()=>p.getByRole('region',{name:'ピンの操作',exact:true}).getByRole('button',{name:'取り消す',exact:true}).click();
    const baseOpaque=await sample(0),baseHole=await sample(2.5),baseMask=await sample(3.5);expect(baseHole).not.toEqual(baseMask);expect(baseOpaque).not.toEqual(baseHole);
    await pick(2.5,false);await cancelPick();await pick(3.5,true);await cancelPick();await pick(0,true);await p.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(p.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible({timeout:180000});await edit(p,'タイトル','元の材質の記録');
    const select=async(index:number)=>{await p.getByRole('tab',{name:'描画',exact:true}).click();const panel=materials(p),model=panel.getByLabel('モデル',{exact:true});await model.selectOption((await model.locator('option').evaluateAll(ns=>ns.map(n=>(n as HTMLOptionElement).value).filter(Boolean)))[0]!);const surface=panel.getByLabel('マテリアル',{exact:true}),choices=await surface.locator('option').evaluateAll(ns=>ns.map(n=>({id:(n as HTMLOptionElement).value,text:n.textContent})).filter(n=>n.id));expect(choices).toHaveLength(3);await surface.selectOption(choices.find(n=>n.text===`材質 ${index+1}`)!.id);return panel;};
    const apply=async()=>{await materials(p).getByRole('button',{name:'変更を適用',exact:true}).click();await expect(p.getByText('材質の設定を適用しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p);};
    let panel=await select(1);await beginMaterialEditing(panel);await panel.getByLabel('照明',{exact:true}).selectOption('lit');await expect(panel.getByRole('button',{name:'変更を適用',exact:true})).toBeDisabled();await expect(panel.getByText(/元から照明なしの材質は/)).toBeVisible();await panel.getByLabel('照明',{exact:true}).selectOption('inherit');await panel.getByLabel('表示する面',{exact:true}).selectOption('double');await apply();
    panel=await select(2);await beginMaterialEditing(panel);await panel.getByLabel('透過の表示方法',{exact:true}).selectOption('mask');await panel.getByLabel('切り抜きのしきい値',{exact:true}).fill('0');await panel.getByLabel('不透明度（%）',{exact:true}).fill('30');await apply();await expect.poll(()=>sample(2.5)).not.toEqual(baseHole);await pick(2.5,true);await cancelPick();
    panel=await select(2);await panel.getByRole('button',{name:'この範囲の設定を解除',exact:true}).click();await panel.getByRole('button',{name:'設定を解除する',exact:true}).click();await expect(p.getByText('材質の設定を解除しました。',{exact:true})).toBeVisible({timeout:180000});await ready(p);await expect.poll(()=>sample(2.5)).toEqual(baseHole);await expect.poll(()=>sample(3.5)).toEqual(baseMask);await pick(2.5,false);await cancelPick();
    panel=await select(2);await beginMaterialEditing(panel);await panel.getByLabel('照明',{exact:true}).selectOption('unlit');await apply();await pick(3.5,true);await cancelPick();await p.screenshot({path:info.outputPath('source-mask-edit-reset.png'),fullPage:true});mark('GPU-display-pick-reset');
    const first=await backup(await output(p,info,'first','backup')),originalRep=(Object.values(first.records.representationsById) as any[])[0],sourceDigest=originalRep.blob.digest;
    let workspace=await output(p,info,'workspace-1','teamWorkspace'),wire=await WorkspaceArchive.inspect(await openAsBlob(workspace),limits),b=await launch(1);await open(b.p,workspace);await ready(b.p);
    for(let round=1;round<=2;round++){
      await caption(p);await edit(p,'本文',`手元の本文${round}`);await caption(b.p);await edit(b.p,'タイトル',`返送後${round}`);
      const returned=await output(b.p,info,'return-'+round,'contribution',wire.archive.control.manifest.packageId);await receive(p,returned);await caption(p);await expect(detail(p).getByLabel('本文',{exact:true})).toHaveValue(`手元の本文${round}`);await expect(detail(p).getByLabel('タイトル',{exact:true})).toHaveValue(`返送後${round}`);
      if(round===1){workspace=await output(p,info,'workspace-2','teamWorkspace');wire=await WorkspaceArchive.inspect(await openAsBlob(workspace),limits);await receive(b.p,workspace);}
    }
    await close(b.context);mark('two-rounds');const finalPath=await output(p,info,'final','backup'),final=await backup(finalPath);expect((Object.values(final.records.representationsById) as any[])[0].blob.digest).toBe(sourceDigest);expect(final.records.materialOverridesById).toEqual(first.records.materialOverridesById);
    const reviewPath=await output(p,info,'review','review'),cleanPath=await output(p,info,'clean','clean');await close(a.context);a=await launch(0);await ready(a.p);expect((await backup(await output(a.p,info,'cold','backup'))).records).toEqual(final.records);await close(a.context);
    const review=await launch(2);await open(review.p,reviewPath);await expect(review.p.getByText('閲覧用シーンを開きました。編集プロジェクトは作成していません。',{exact:true})).toBeVisible({timeout:180000});await review.p.screenshot({path:info.outputPath('review-source-material.png'),fullPage:true});await review.p.getByRole('button',{name:'編集コピーを作る',exact:true}).click();await review.p.getByRole('button',{name:'コピーを作成',exact:true}).click();await ready(review.p);const editable=await backup(await output(review.p,info,'review-edit','backup'));expect(editable.archive.source.proof.identity.projectId).not.toBe(final.archive.source.proof.identity.projectId);expect((Object.values(editable.records.representationsById) as any[])[0].blob.digest).toBe(sourceDigest);await close(review.context);
    const clean=await launch(3);await open(clean.p,cleanPath);await ready(clean.p);expect((Object.values((await backup(await output(clean.p,info,'clean-edit','backup'))).records.representationsById) as any[])[0].blob.digest).toBe(sourceDigest);await close(clean.context);
    const restored=await launch(4);await open(restored.p,finalPath);await restored.p.getByRole('button',{name:'バックアップから復元',exact:true}).click();await ready(restored.p);expect((await backup(await output(restored.p,info,'restored','backup'))).records).toEqual(final.records);await close(restored.context);const cold=await launch(4);await ready(cold.p);await close(cold.context);mark('all-five-restore-cold');expect(errors).toEqual([]);
  }finally{for(const c of contexts){for(const p of c.pages())await p.screenshot({path:info.outputPath('last-'+contexts.size+'.png'),fullPage:true}).catch(()=>{});await c.close();}await info.attach('stages',{body:JSON.stringify({stages,errors}),contentType:'application/json'});}
});
