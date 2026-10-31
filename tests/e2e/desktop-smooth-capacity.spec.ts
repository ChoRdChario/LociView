import { desktopOrigin, desktopEntry } from './desktopEntry';
import { lookAlongFront } from './workspaceUi';
import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {largeGsFixture,largeGsDigest} from '../helpers/largeGsFixture';
import {sourceMaterialPanelsGlb} from './fixtures';
import {installSmoothObservation} from './smoothObservation';

test('01g production500k SH4 matched120s camera cost and target lifecycle',async({browser},info)=>{
  test.setTimeout(900000);execFileSync(process.execPath,['scripts/prepare-smooth-baseline.mjs'],{stdio:'inherit',windowsHide:true});const source=await largeGsFixture(),mesh=info.outputPath('smooth-panels.glb');await writeFile(mesh,sourceMaterialPanelsGlb(j=>{j.materials[2].alphaMode='BLEND';}));
  const errors:string[]=[],results:Record<string,any>={},baseline=resolve('.artifacts/e2e/smooth01g-baseline-5e5bb9e/desktop-dist');
  for(const mode of ['baseline','candidate']){
    const context=await browser.newContext({viewport:{width:2200,height:1300},deviceScaleFactor:1,serviceWorkers:'block'});await context.addInitScript(installSmoothObservation);
    await context.route('**/*',async route=>{const u=new URL(route.request().url());if(['blob:','data:'].includes(u.protocol))return route.continue();if(u.origin!==desktopOrigin)return route.abort();if(mode==='candidate')return route.continue();
      const path=resolve(baseline,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!path.startsWith(baseline+sep))throw Error('Baseline path');const type:Record<string,string>={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json'};await route.fulfill({body:await readFile(path),contentType:type[extname(path)]??'application/octet-stream'});
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    try{
      await p.goto(desktopEntry);await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles([mesh,source]);await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByLabel('プロジェクト名',{exact:true}).fill('50万点の表示');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
      const canvas=p.getByLabel('3Dモデルの表示',{exact:true}),status=p.locator('.lv-project-viewport-status');await expect(canvas).toHaveAttribute('aria-busy','false',{timeout:240000});await expect(status).not.toContainText('表示の準備中');
      if(mode==='candidate')await expect(status).toContainText('透過表示は近似です。');else await expect(status).toContainText('滑らかな透過表示は未対応');
      // Identical actual drawing-buffer size, below the36B/pixel budget in both builds.
      for(let i=0;i<4;i++){await p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));const b=(await canvas.boundingBox())!,v=p.viewportSize()!;await p.setViewportSize({width:Math.round(v.width+1792-b.width),height:Math.round(v.height+1008-b.height)});}
      await lookAlongFront(p);await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement)=>[c.width,c.height])).toEqual([1792,1008]);
      const layout=await canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,css:c.getBoundingClientRect().toJSON(),dpr:devicePixelRatio,bytes:Number(c.dataset.compositionDocumentBytes)||0})),box=(await canvas.boundingBox())!;
      const move=async(seconds:number)=>{await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down({button:'middle'});try{return await p.evaluate(async({x,y,height,seconds})=>(window as any).smoothObservation.trace(seconds,x,y,height),{x:box.x+box.width/2,y:box.y+box.height/2,height:box.height,seconds});}finally{await p.mouse.up({button:'middle'});}};
      const warmup=await move(2);expect(warmup.rendered,'actual middle-button camera must redraw before the long trace').toBeGreaterThan(5);await lookAlongFront(p);const trace=await move(120);
      await info.attach(mode+'-trace',{body:JSON.stringify({layout,trace}),contentType:'application/json'});expect(trace.visibility).toBe('visible');expect(trace.frames).toBeGreaterThan(1000);expect(trace.rendered).toBeGreaterThan(1000);expect(trace.maxInstances*128).toBeGreaterThanOrEqual(500000);expect(trace.sortRpc.length).toBeGreaterThan(10);expect(trace.sortErrors).toEqual([]);expect(trace.gpu.length).toBeGreaterThan(10);expect(trace.disjoint).toBe(false);expect(trace.incomplete).toBe(0);
      const cycles:any[]=[];
      if(mode==='candidate')for(let i=0;i<20;i++){await p.setViewportSize(i%2?{width:2200,height:1300}:{width:3840,height:2160});await p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));await expect(status).toContainText('透過表示は近似です。');await expect(canvas).toHaveAttribute('aria-busy','false');const current=await canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,css:c.getBoundingClientRect().toJSON(),scale:Number(c.dataset.renderScale),dpr:devicePixelRatio,view:Number(c.dataset.compositionBytes),document:Number(c.dataset.compositionDocumentBytes)}));expect(current.width).toBe(Math.floor(current.css.width*current.dpr*current.scale+.5));expect(current.height).toBe(Math.floor(current.css.height*current.dpr*current.scale+.5));if(i)expect([current.width,current.height]).not.toEqual([cycles[i-1].layout.width,cycles[i-1].layout.height]);expect(current.view).toBe(current.width*current.height*36);expect(current.document).toBe(current.view);expect(current.document).toBeLessThan(64*1024*1024);cycles.push({layout:current,resources:await p.evaluate(()=>(window as any).smoothObservation.snapshot())});}
      if(cycles.length){for(const parity of [0,1]){const same=cycles.filter((_,i)=>i%2===parity).slice(2).map(x=>x.resources.filter((r:any)=>r.label==='3Dモデルの表示').map((r:any)=>[r.textures,r.framebuffers]));for(const counts of same)expect(counts).toEqual(same[0]);}}
      results[mode]={layout,trace,cycles,resources:await p.evaluate(()=>(window as any).smoothObservation.snapshot())};await p.screenshot({path:info.outputPath(mode+'-500k.png'),fullPage:true});
    }finally{await context.close();}
  }
  await info.attach('matched-production-cost',{body:JSON.stringify({baseline:'5e5bb9e exact isolated Desktop build',source:largeGsDigest,results,errors,method:'rAF intervals are scheduling proxies; CPU actual rendered callback span; GPU sampled non-disjoint query; sortCenters32 worker RPC roundtrip, not pure sort time'}),contentType:'application/json'});
  expect(results.candidate.layout.width).toBe(results.baseline.layout.width);expect(results.candidate.layout.height).toBe(results.baseline.layout.height);expect(results.candidate.trace.frameP95/results.baseline.trace.frameP95,'existing +30% camera interval criterion').toBeLessThanOrEqual(1.30);expect(errors).toEqual([]);
});
