import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin==='http://127.0.0.1:4182'||['blob:','data:'].includes(u.protocol)?r.continue():r.abort('blockedbyclient');});});
test('01f public-only shared GS/Mesh accumulation, depth, ordering and lifecycle',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/scripts/smooth-composition-evaluation/index.html');await page.waitForFunction(()=>!!(window as any).smoothEval);
 const call=(method:string,arg?:unknown)=>page.evaluate(async({method,arg})=>(window as any).smoothEval[method](arg),{method,arg});
 const data:any={};
 const contributes=(d:any)=>{expect(d.gs.count).toBeGreaterThan(100);expect(d.mesh.count).toBeGreaterThan(100);};
 try{data.panels=await call('create',{kind:'panels',rows:8});data.panelOrder=await call('orderCheck');expect(data.panels.materialShared).toBe(true);expect(data.panelOrder.max).toBeLessThanOrEqual(3);expect(data.panelOrder.samples[0].slice(0,3)).toEqual([0,255,0]);expect(data.panelOrder.samples[3].slice(0,3)).toEqual([0,0,255]);expect(data.panelOrder.samples[2].slice(0,3)).not.toEqual([0,0,255]);data.panelsContribution=await call('contribution');contributes(data.panelsContribution);
  data.layers=await call('create',{kind:'layers',rows:8});data.layersVariants=await call('compareVariants');expect(data.layersVariants.max).toBeLessThanOrEqual(3);data.layersOrder=await call('orderCheck');expect(data.layersOrder.max).toBeLessThanOrEqual(3);data.layersSweep=await call('sweep');expect(data.layersSweep.frames.every((f:any)=>f.lit>100)).toBe(true);expect(data.layersSweep.materialOwned).toBe(true);expect(data.layersSweep.uniformsShared).toBe(true);
  data.aircraft=await call('create',{kind:'aircraft',rows:512});data.aircraftOrder=await call('orderCheck');expect(data.aircraftOrder.max).toBeLessThanOrEqual(3);data.aircraftSweep=await call('sweep');expect(data.aircraftSweep.frames.every((f:any)=>f.lit>100)).toBe(true);for(const s of [data.layersSweep,data.aircraftSweep])for(const f of s.frames)if(f.contribution){contributes(f.contribution);expect(f.order.max).toBeLessThanOrEqual(3);}
  for(let i=0;i<6;i++){await call('reference',{angle:i*Math.PI/3,elevation:4});await page.screenshot({path:info.outputPath(`aircraft-reference-${i}.png`)});}
  await page.screenshot({path:info.outputPath('closed-aircraft.png')});data.target=await call('resize',{width:1920,height:1080});expect(data.target.extraTargetBytes).toBeLessThan(64*1024*1024);await call('render');
  data.restore=await call('contextRestore');contributes(data.restore.contribution);data.bright=await call('create',{kind:'bright',rows:8});data.brightAccum=await call('finiteAccum');expect(data.brightAccum.bad).toBe(0);expect(data.brightAccum.error).toBe(0);expect(data.brightAccum.max).toBeGreaterThan(65504);
  await call('create',{kind:'extremes',rows:8});data.alpha=await call('alphaExtremes');for(const s of data.alpha)expect([...s.accum,...s.aux].every(Number.isFinite)).toBe(true);expect(data.alpha[0].accum).toEqual([0,0,0,0]);expect(data.alpha[0].aux.slice(0,2)).toEqual([0,0]);expect(data.alpha[1].aux[0]).toBeCloseTo(24*Math.log(2),4);expect(data.alpha[1].aux[1]).toBe(0);expect(data.alpha[2].aux[0]).toBe(0);expect(data.alpha[2].aux[1]).toBe(1);expect(data.alpha[3].aux[0]/2**-30).toBeCloseTo(1,5);
  data.highResolution=await call('resize',{width:2560,height:1440});expect(data.highResolution.extraTargetBytes).toBeGreaterThan(64*1024*1024);await call('render');await call('resize',{width:960,height:540});
  data.cycles=await call('cycles',{count:20});expect(data.cycles.slice(-5)).toEqual(Array(5).fill(data.cycles.at(-1)));expect(data.cycles.at(-1).geometries).toBeLessThanOrEqual(2);
 }finally{data.diagnostics=await call('diagnostics').catch(()=>null);data.errors=errors;await info.attach('evaluation',{body:JSON.stringify(data,null,2),contentType:'application/json'});expect(errors).toEqual([]);}
});
test('01f representative SH4 500k static cost and120s camera frame trace at1080p',async({page},info)=>{
 await page.goto('/scripts/smooth-composition-evaluation/index.html');await page.waitForFunction(()=>!!(window as any).smoothEval);
 const result=await page.evaluate(async()=>{const p=(window as any).smoothEval;p.setVariant('mrt');const target=p.resize({width:1920,height:1080}),source=await p.create({kind:'aircraft',rows:500000}),contribution=p.contribution(),finite=p.finiteAccum(),cost=await p.benchmark({frames:80,warmup:20}),traces={base:await p.trace({mode:'base',seconds:120}),candidate:await p.trace({mode:'candidate',seconds:120})};return{target,source,contribution,finite,cost,traces,diagnostics:p.diagnostics()};});
 await info.attach('performance',{body:JSON.stringify(result,null,2),contentType:'application/json'});await page.screenshot({path:info.outputPath('500k.png')});
 expect(result.source.degree).toBe(4);expect(result.finite.bad).toBe(0);expect(result.finite.error).toBe(0);expect(result.contribution.gs.count).toBeGreaterThan(100);expect(result.contribution.mesh.count).toBeGreaterThan(100);
 expect(result.diagnostics.drawnInstances).toBe(Math.ceil(500000/128));expect(result.diagnostics.draws.accum.triangles).toBeGreaterThanOrEqual(1000000);expect(result.target.extraTargetBytes).toBeLessThan(64*1024*1024);
 expect(result.traces.base.visibility).toBe('visible');expect(result.traces.candidate.visibility).toBe('visible');expect(result.traces.candidate.p95/result.traces.base.p95,'01f existing +30% frame-time criterion, matched120s camera traces').toBeLessThanOrEqual(1.30);
 if(result.cost.timerQueryAvailable){expect(result.cost.timerDisjoint).toBe(false);expect(result.cost.timerIncomplete).toBe(0);}
});
test('01f missing float blend is explicitly unsupported without storage access',async({page})=>{
 await page.addInitScript(()=>{const original=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(this:WebGL2RenderingContext,name:string){return name==='EXT_float_blend'?null:Reflect.apply(original,this,[name]);} as typeof original;});
 await page.goto('/scripts/smooth-composition-evaluation/index.html');await expect(page.getByRole('status')).toContainText('評価できません');expect(await page.evaluate(()=>!!(window as any).smoothEval)).toBe(false);
});
