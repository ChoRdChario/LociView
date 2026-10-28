/** Test-owned public browser instrumentation. No product debug port or vendor mutation. */
export function installSmoothObservation(){
  const root=window as any,raf=requestAnimationFrame.bind(window),contexts=new Set<WebGL2RenderingContext>(),resources=new WeakMap<object,{textures:Set<object>;framebuffers:Set<object>}>();
  const state={active:false,draws:0,rendered:0,cpu:[] as number[],frameCpu:new Map<number,number>(),gpu:[] as number[],sort:[] as number[],sortErrors:[] as unknown[],maxInstances:0,disjoint:false,incomplete:0},pending:{gl:WebGL2RenderingContext;q:WebGLQuery;ext:any}[]=[];
  const getContext=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:any[]){const gl=Reflect.apply(getContext,this,args);if(args[0]==='webgl2'&&gl){contexts.add(gl);if(!resources.has(gl))resources.set(gl,{textures:new Set(),framebuffers:new Set()});}return gl;} as any;
  const prototype=WebGL2RenderingContext.prototype as any;
  for(const kind of ['Texture','Framebuffer']){const create=prototype['create'+kind],remove=prototype['delete'+kind],key=kind==='Texture'?'textures':'framebuffers';
    prototype['create'+kind]=function(...args:any[]){const item=Reflect.apply(create,this,args);if(item)resources.get(this)?.[key as 'textures'].add(item as object);return item;};
    prototype['delete'+kind]=function(item:any){const result=Reflect.apply(remove,this,[item]);resources.get(this)?.[key as 'textures'].delete(item);return result;};
  }
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const draw=prototype[name];prototype[name]=function(...args:any[]){if(state.active){state.draws++;if(name.endsWith('Instanced'))state.maxInstances=Math.max(state.maxInstances,args.at(-1) as number);}return Reflect.apply(draw,this,args);};}
  const WorkerOriginal=Worker;
  root.Worker=class extends WorkerOriginal{
    requests=new Map<unknown,number>();
    constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{const d=event.data;if(d?.status)return;const started=this.requests.get(d?.id);if(started!==undefined){this.requests.delete(d.id);if(d.error||d.fatal)state.sortErrors.push(d.error??d.fatal);else if(state.active)state.sort.push(performance.now()-started);}});}
    override postMessage(...args:any[]){const d=args[0];if(state.active&&d?.name==='sortCenters32'&&d.id!==undefined)this.requests.set(d.id,performance.now());return Reflect.apply(WorkerOriginal.prototype.postMessage,this,args);}
  };
  const collect=()=>{for(let i=pending.length-1;i>=0;i--){const{gl,q,ext}=pending[i]!;if(gl.getParameter(ext.GPU_DISJOINT_EXT))state.disjoint=true;if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(!state.disjoint)state.gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);pending.splice(i,1);}}};
  root.requestAnimationFrame=(callback:FrameRequestCallback)=>raf(time=>{
    if(!state.active){callback(time);return;}
    collect();const gl=[...contexts].find(g=>(g.canvas as HTMLCanvasElement).getAttribute('aria-label')==='3Dモデルの表示'),ext=gl?.getExtension('EXT_disjoint_timer_query_webgl2'),q=gl&&ext&&state.rendered%30===0&&!gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)?gl.createQuery():null;
    if(q)gl!.beginQuery(ext!.TIME_ELAPSED_EXT,q);const count=state.draws,start=performance.now();
    try{callback(time);}finally{const elapsed=performance.now()-start,drawn=state.draws>count;state.frameCpu.set(time,(state.frameCpu.get(time)??0)+elapsed);if(q){gl!.endQuery(ext!.TIME_ELAPSED_EXT);if(drawn)pending.push({gl:gl!,q,ext});else gl!.deleteQuery(q);}if(drawn){state.cpu.push(elapsed);state.rendered++;}}
  });
  const p95=(values:number[])=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]:null;
  root.smoothObservation={
    snapshot(){return[...contexts].map(gl=>{const debug=gl.getExtension('WEBGL_debug_renderer_info'),r=resources.get(gl)!;return{label:(gl.canvas as HTMLCanvasElement).getAttribute('aria-label'),lost:gl.isContextLost(),textures:r.textures.size,framebuffers:r.framebuffers.size,identity:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER)};});},
    async trace(seconds:number,startX:number,startY:number,height:number){
      state.cpu=[];state.frameCpu.clear();state.gpu=[];state.sort=[];state.sortErrors=[];state.draws=state.rendered=state.maxInstances=0;state.disjoint=false;state.active=true;
      const canvas=document.querySelector<HTMLCanvasElement>('canvas[aria-label="3Dモデルの表示"]')!,intervals:number[]=[],start=performance.now();let previous:number|undefined;
      await new Promise<void>(resolve=>{const tick=(time:number)=>{if(previous!==undefined)intervals.push(time-previous);previous=time;const elapsed=time-start;
        canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:4,button:-1,clientX:startX+Math.sin(elapsed/6000)*height*.3,clientY:startY+Math.sin(elapsed/11000)*height*.12}));
        if(elapsed<seconds*1000)raf(tick);else resolve();};raf(tick);});
      state.active=false;for(let i=0;i<30&&pending.length;i++){collect();await new Promise<void>(resolve=>raf(()=>resolve()));}state.incomplete=pending.length;
      const allRafCpu=[...state.frameCpu.values()],result={elapsed:performance.now()-start,visibility:document.visibilityState,frames:intervals.length,rendered:state.rendered,frameP95:p95(intervals),cpuP95:p95(state.cpu),allRafCpuP95:p95(allRafCpu),gpuP95:p95(state.gpu),sortRpcP95:p95(state.sort),maxInstances:state.maxInstances,disjoint:state.disjoint,incomplete:state.incomplete,sortErrors:state.sortErrors,intervals,cpu:state.cpu,allRafCpu,gpu:state.gpu,sortRpc:state.sort};
      for(const{gl,q}of pending.splice(0))gl.deleteQuery(q);return result;
    },
  };
}
