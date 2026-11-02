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
