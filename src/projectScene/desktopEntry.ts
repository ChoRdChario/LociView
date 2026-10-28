import './styles.css';
import {createValidationBrowserWorkspace,validationBrowserLimits} from './validationBrowser';
import {createProductWorkspace} from './productWorkspace';
import {projectFilePolicy} from '../projectFiles/validation';
import {createGsResidency} from '../viewer/gsDecodeQueue';
import {createTargetBudget,targetLayout} from '../viewer/targetBudget';
import {createSmoothComposite} from '../viewer/smoothComposite';
import type {LegacyAppController} from '../ui/app';

/** Explicit static PC candidate, never selected by URL or a persisted preference. */
export async function bootDesktopApp(root:HTMLElement){
  if(import.meta.env.MODE!=='project-scene-desktop')throw Error('専用のPC候補ビルドで開いてください。');
  const policy=projectFilePolicy({nonGs:validationBrowserLimits,
    gs:{...validationBrowserLimits,maxFileBytes:512*1024*1024,maxItems:500_000,maxValues:44_500_000},projectBodyBytes:512*1024*1024});
  const residency=createGsResidency(500_000,44_500_000);
  const smoothDisplay={budget:createTargetBudget(),plan:targetLayout,create:createSmoothComposite};
  let workspace:Awaited<ReturnType<typeof createValidationBrowserWorkspace>>|undefined,legacy:LegacyAppController|undefined,busy=false;
  const message=(error:unknown)=>{const status=document.createElement('p');status.setAttribute('role','status');status.textContent=error instanceof Error?error.message:'画面を開けません。';root.append(status);};
  const projects=async(files?:readonly File[])=>{
    if(busy)return;busy=true;
    try{
      if(legacy&&!(await legacy.close()))return;legacy=undefined;
      await workspace?.dispose();workspace=undefined;document.documentElement.classList.add('lv-project-page');root.replaceChildren();
      workspace=await createValidationBrowserWorkspace(document,{smoothDisplay,progressivePresentation:true,filePolicy:policy,residency,initialFiles:files,openLegacy,
        mountEditor:(host,factory,tools,renderCandidate,navigation)=>createProductWorkspace(document,host,factory,tools,renderCandidate,{...navigation,compactFiles:true})},new URL(location.href).searchParams.get('run')??undefined);
      root.append(workspace.root);await workspace.ready;
    }catch(error){message(error);const retry=document.createElement('button');retry.textContent='以前のプロジェクトを開く';retry.addEventListener('click',()=>{void openLegacy();});root.append(retry);}
    finally{busy=false;}
  };
  const openLegacy=async(file?:File)=>{
    if(busy)return;busy=true;
    try{
      if(workspace?.hasChanges())throw Error('入力・操作を確定するか、取り消してから画面を切り替えてください。');
      await workspace?.dispose();workspace=undefined;document.documentElement.classList.remove('lv-project-page');root.replaceChildren();
      const back=document.createElement('button'),content=document.createElement('section');back.textContent='プロジェクトを選ぶ';
      back.addEventListener('click',()=>{void projects();});root.append(back,content);
      const {bootApp}=await import('../ui/app');await bootApp(content,{pwa:false,initialFile:file,onReady:controller=>{legacy=controller;},onNewProject:files=>projects(files)});
    }catch(error){message(error);}finally{busy=false;}
  };
  window.addEventListener('beforeunload',event=>{if(workspace?.hasChanges()){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  if(new URL(location.href).searchParams.get('mode')==='native-gs'){
    const {bootNativeGsApp}=await import('../nativeGs/app');await bootNativeGsApp(root,undefined,{pwa:false});
  }else await projects();
}
