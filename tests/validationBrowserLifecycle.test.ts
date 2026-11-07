import {describe,it,expect,vi} from 'vitest';
import {createValidationBrowserDisposal} from '../src/projectScene/validationBrowser';

describe('browser workspace owned disposal',()=>{
  it.each(['detach','cancel','workspace','scratch','raster'] as const)('attempts all owners and preserves a %s failure',async failing=>{
    const calls:string[]=[],error=Error(failing);
    const action=(name:string)=>{calls.push(name);if(name===failing)throw error;};
    const dispose=createValidationBrowserDisposal({detach:()=>action('detach'),cancel:()=>action('cancel'),workspace:async()=>action('workspace'),scratch:async()=>action('scratch'),raster:async()=>action('raster')});
    const close=dispose();expect(dispose()).toBe(close);const failure=await close.catch(e=>e);
    expect(calls).toEqual(['detach','cancel','workspace','scratch','raster']);expect(failure).toBeInstanceOf(AggregateError);expect(failure.errors).toEqual([error]);expect(dispose()).toBe(close);
  });
  it('keeps earlier workspace and scratch errors and still releases raster',async()=>{
    const first=Error('workspace failed'),second=Error('scratch failed'),raster=vi.fn(async()=>{});
    const dispose=createValidationBrowserDisposal({detach(){},cancel(){},workspace:async()=>{throw first;},scratch:async()=>{throw second;},raster});
    const failure=await dispose().catch(e=>e);expect(failure.errors).toEqual([first,second]);expect(raster).toHaveBeenCalledOnce();
  });
  it('cancels before waiting, coalesces reentry and never disposes scratch while workspace still owns it',async()=>{
    const calls:string[]=[];let finish!:()=>void,dispose!:()=>Promise<void>,reentrant:Promise<void>|undefined;
    const held=new Promise<void>(resolve=>{finish=resolve;});
    dispose=createValidationBrowserDisposal({detach(){calls.push('detach');},cancel(){calls.push('cancel');reentrant=dispose();},workspace:async()=>{calls.push('workspace');await held;},scratch:async()=>{calls.push('scratch');},raster:async()=>{calls.push('raster');}});
    const closing=dispose();expect(reentrant).toBe(closing);expect(calls).toEqual(['detach','cancel','workspace']);finish();await closing;expect(calls).toEqual(['detach','cancel','workspace','scratch','raster']);expect(dispose()).toBe(closing);
  });
});
