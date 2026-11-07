import {describe,it,expect,vi} from 'vitest';
import {createDeferredViewport} from '../src/projectScene/deferredViewport';
import type {ViewportFactory} from '../src/projectScene/viewportPorts';
import type {RenderDisplay} from '../src/projectScene/viewportModel';
import {RecordedDocument} from './ui/domRecorder';

describe('one mounted deferred presentation',()=>{
 const display:RenderDisplay={readOnly:true,token:'verified',sceneId:'scene',projectFrameId:'frame',models:[],pins:[],bounds:null,selectedId:null};
 const capture={camera:{position:[1,2,5] as const,target:[0,0,0] as const,up:[0,1,0] as const,projection:{kind:'perspective' as const,verticalFovRadians:Math.PI/4}},background:{kind:'solid' as const,colorSrgb:[1,1,1] as const}};
 function renderer(){let current:RenderDisplay|undefined;const dispose=vi.fn(),recall=vi.fn();const factory=vi.fn<ViewportFactory>(()=>({update(next){current=next;},setActive(){},camera(){},retry(){},dispose,capture:()=>capture,recall,
   read:()=>({token:'camera',display:current,ready:true,issue:null,dragging:false,projection:'perspective',axis:null,pins:[]})}));return{factory,dispose,recall};}
 it.each([false,true])('keeps concrete retirement after bridge disposal, including synchronous cleanup failure=%s',async failed=>{
  const deferred=createDeferredViewport(),a=renderer(),fault=Error('native cleanup refused');let finish!:()=>void;
  const native=new Promise<void>(resolve=>{finish=resolve;}),idle=vi.fn(()=>native);
  if(failed)a.dispose.mockImplementation(()=>{throw fault;});
  const runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  deferred.attach((...args)=>({...a.factory(...args),idle}));
  if(failed)expect(()=>runtime.dispose()).toThrow(fault);else runtime.dispose();
  runtime.dispose();let ended=false;const waiting=runtime.idle!().then(()=>{ended=true;},error=>{ended=true;throw error;});
  const checked=failed?expect(waiting).rejects.toBe(fault):expect(waiting).resolves.toBeUndefined();
  await Promise.resolve();expect(ended).toBe(false);expect(a.dispose).toHaveBeenCalledOnce();expect(idle).toHaveBeenCalledOnce();finish();await checked;
 });
 it('waits for retired ownership and installs only the latest replacement with the same camera',async()=>{
  const deferred=createDeferredViewport(),a=renderer(),b=renderer(),c=renderer();let finish!:()=>void;
  const native=new Promise<void>(resolve=>{finish=resolve;}),runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  runtime.update(display);runtime.setActive(true);deferred.attach((...args)=>({...a.factory(...args),idle:()=>native}));
  deferred.attach(b.factory);deferred.attach(c.factory);expect(b.factory).not.toHaveBeenCalled();expect(c.factory).not.toHaveBeenCalled();
  const waiting=runtime.idle!();finish();await waiting;expect(b.factory).not.toHaveBeenCalled();expect(c.factory).toHaveBeenCalledOnce();expect(c.recall).toHaveBeenCalledWith(capture);expect(runtime.read().display).toBe(display);runtime.dispose();await runtime.idle!();
 });
 it('discards closed installations and lets a later canvas wait without an old dispose closing it',async()=>{
  const deferred=createDeferredViewport(),a=renderer(),b=renderer(),c=renderer(),d=renderer();let finish!:()=>void;
  const native=new Promise<void>(resolve=>{finish=resolve;}),document=new RecordedDocument();
  const first=deferred.factory(document.createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  deferred.attach((...args)=>({...a.factory(...args),idle:()=>native}));deferred.attach(b.factory);first.dispose();
  const second=deferred.factory(document.createElement('canvas') as unknown as HTMLCanvasElement,()=>{});second.update(display);second.setActive(true);deferred.attach(c.factory);
  expect(b.factory).not.toHaveBeenCalled();expect(c.factory).not.toHaveBeenCalled();finish();await first.idle!();await second.idle!();
  expect(b.factory).not.toHaveBeenCalled();expect(c.factory).toHaveBeenCalledOnce();first.dispose();deferred.attach(d.factory);expect(d.factory).toHaveBeenCalledOnce();expect(second.read().display).toBe(display);
  expect(()=>deferred.factory(document.createElement('canvas') as unknown as HTMLCanvasElement,()=>{})).toThrow('前の3D');second.dispose();await second.idle!();
 });
 it('retains asynchronous cleanup failure across retries and new canvases',async()=>{
  const deferred=createDeferredViewport(),a=renderer(),b=renderer(),fault=Error('sort cleanup failed');let reject!:(error:Error)=>void;
  const native=new Promise<void>((_resolve,fail)=>{reject=fail;}),runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  deferred.attach((...args)=>({...a.factory(...args),idle:()=>native}));deferred.attach(b.factory);
  const failed=expect(runtime.idle!()).rejects.toBe(fault);reject(fault);await failed;
  expect(b.factory).not.toHaveBeenCalled();expect(runtime.read().issue).toContain('再読み込み');expect(()=>runtime.retry()).toThrow(fault);runtime.dispose();
  expect(()=>deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{})).toThrow(fault);
 });
 it('reports an asynchronous installation failure through the existing retry',async()=>{
  const deferred=createDeferredViewport(),a=renderer(),b=renderer();let finish!:()=>void;
  const native=new Promise<void>(resolve=>{finish=resolve;}),runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  const next=vi.fn<ViewportFactory>().mockImplementationOnce(()=>{throw Error('renderer unavailable');}).mockImplementation(b.factory);
  deferred.attach((...args)=>({...a.factory(...args),idle:()=>native}));deferred.attach(next);finish();await runtime.idle!();expect(runtime.read().issue).toBe('renderer unavailable');
  runtime.retry();expect(b.factory).toHaveBeenCalledOnce();expect(runtime.read().ready).toBe(true);runtime.dispose();await runtime.idle!();
 });
 it('returns a cleanup owner when a pre-attached candidate fails before mounting',async()=>{
  const deferred=createDeferredViewport(),a=renderer();let finish!:()=>void;
  const native=new Promise<void>(resolve=>{finish=resolve;});deferred.attach((...args)=>({...a.factory(...args),setActive(){throw Error('startup refused');},idle:()=>native}));
  const runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  expect(runtime.read().issue).toBe('startup refused');runtime.dispose();let ended=false;const waiting=runtime.idle!().then(()=>{ended=true;});await Promise.resolve();expect(ended).toBe(false);finish();await waiting;expect(a.dispose).toHaveBeenCalledOnce();
 });
 it('waits for the initial factory owner and its late native cleanup before admitting a photo',async()=>{
  const deferred=createDeferredViewport(),runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  let attach!:()=>void,finish!:()=>void;const mounted=new Promise<void>(done=>{attach=done;}),native=new Promise<void>(done=>{finish=done;});
  const base=renderer(),idle=vi.fn(()=>native),source=vi.fn();
  const load=deferred.preparing(mounted.then(()=>deferred.attach((...args)=>({...base.factory(...args),idle}))));
  const photo=runtime.idle!().then(source);await Promise.resolve();expect(source).not.toHaveBeenCalled();
  attach();await load;await Promise.resolve();expect(idle).toHaveBeenCalledOnce();expect(source).not.toHaveBeenCalled();
  finish();await photo;expect(source).toHaveBeenCalledOnce();runtime.dispose();
 });
 it('retains a factory prepared before startup supplies a canvas and refuses late attachment after disposal',()=>{
  const deferred=createDeferredViewport(),ready=renderer();deferred.attach(ready.factory);expect(ready.factory).not.toHaveBeenCalled();
  const runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});runtime.update(display);runtime.setActive(true);expect(ready.factory).toHaveBeenCalledOnce();expect(runtime.read().display).toBe(display);
  runtime.dispose();deferred.attach(ready.factory);expect(ready.factory).toHaveBeenCalledOnce();expect(ready.dispose).toHaveBeenCalledOnce();
 });
 it('retains the last same-Scene camera across an installation failure and a later successful retry',()=>{
  const deferred=createDeferredViewport(),a=renderer(),b=renderer();const runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  runtime.update(display);runtime.setActive(true);deferred.attach(a.factory);expect(()=>deferred.attach(()=>{throw Error('factory failed');})).toThrow('factory failed');
  deferred.attach(b.factory);expect(a.dispose).toHaveBeenCalledOnce();expect(b.recall).toHaveBeenCalledWith(capture);expect(runtime.read().display).toBe(display);runtime.dispose();
 });
 it('forwards pre-attachment visual subscribers only from the current active owner with one bridge sequence',()=>{
  const deferred=createDeferredViewport(),runtime=deferred.factory(new RecordedDocument().createElement('canvas') as unknown as HTMLCanvasElement,()=>{});
  runtime.update(display);runtime.setActive(true);
  const frames:import('../src/projectScene/viewportPorts').ViewportPresentationFrame[]=[],listener=vi.fn((frame:import('../src/projectScene/viewportPorts').ViewportPresentationFrame)=>{frames.push(frame);return true;});
  const stop=runtime.observePresentation!(listener);
  const source=()=>{const base=renderer(),unsubscribed=vi.fn();let callback:((frame:import('../src/projectScene/viewportPorts').ViewportPresentationFrame)=>boolean)|undefined;
   const factory:ViewportFactory=(...args)=>({...base.factory(...args),observePresentation(fn){callback=fn;return unsubscribed;}});
   return{...base,factory,unsubscribed,emit(generation:number){return callback?.({display,generation,width:600,height:400,camera:capture.camera,projection:'perspective',axis:null,navigating:false,pins:[]})??false;}};};
  const a=source(),b=source();deferred.attach(a.factory);expect(a.emit(1000)).toBe(true);const first=frames[0]!.generation;
  expect(()=>deferred.attach(()=>{throw Error('replacement fails');})).toThrow('replacement fails');expect(a.unsubscribed).toHaveBeenCalledOnce();expect(a.emit(1001)).toBe(false);
  deferred.attach(b.factory);expect(b.emit(1)).toBe(true);expect(frames.at(-1)!.generation).toBeGreaterThan(first);
  const second=vi.fn((_frame:import('../src/projectScene/viewportPorts').ViewportPresentationFrame)=>false),stopSecond=runtime.observePresentation!(second);expect(b.emit(2)).toBe(false);expect(second).toHaveBeenCalledOnce();
  const previous=frames.at(-1)!;expect(second.mock.calls[0]![0]).toBe(previous);expect(b.emit(2)).toBe(false);expect(second).toHaveBeenCalledOnce();stopSecond();
  runtime.setActive(false);expect(b.emit(3)).toBe(false);runtime.setActive(true);expect(b.emit(4)).toBe(true);
  stop();expect(b.unsubscribed).toHaveBeenCalledOnce();runtime.dispose();expect(b.emit(5)).toBe(false);expect(b.dispose).toHaveBeenCalledOnce();
 });
});
