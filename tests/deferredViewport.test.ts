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
});
