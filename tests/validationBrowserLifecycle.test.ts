import {describe,it,expect,vi} from 'vitest';
import {createValidationBrowserDisposal} from '../src/projectScene/validationBrowser';

describe('browser workspace owned disposal',()=>{
  it.each(['detach','workspace','raster'] as const)('attempts all owners and preserves a %s failure',async failing=>{
    const calls:string[]=[],error=Error(failing);
    const action=(name:string)=>{calls.push(name);if(name===failing)throw error;};
    const dispose=createValidationBrowserDisposal({detach:()=>action('detach'),workspace:async()=>action('workspace'),raster:async()=>action('raster')});
    const close=dispose();expect(dispose()).toBe(close);const failure=await close.catch(e=>e);
    expect(calls).toEqual(['detach','workspace','raster']);expect(failure).toBeInstanceOf(AggregateError);expect(failure.errors).toEqual([error]);expect(dispose()).toBe(close);
  });
  it('keeps earlier detach and workspace errors and still releases raster',async()=>{
    const first=Error('workspace failed'),second=Error('workspace failed again'),raster=vi.fn(async()=>{});
    const dispose=createValidationBrowserDisposal({detach(){throw first;},workspace:async()=>{throw second;},raster});
    const failure=await dispose().catch(e=>e);expect(failure.errors).toEqual([first,second]);expect(raster).toHaveBeenCalledOnce();
  });
  it('detaches before waiting, coalesces reentry and releases raster after workspace',async()=>{
    const calls:string[]=[];let finish!:()=>void,dispose!:()=>Promise<void>,reentrant:Promise<void>|undefined;
    const held=new Promise<void>(resolve=>{finish=resolve;});
    dispose=createValidationBrowserDisposal({detach(){calls.push('detach');reentrant=dispose();},workspace:async()=>{calls.push('workspace');await held;},raster:async()=>{calls.push('raster');}});
    const closing=dispose();expect(reentrant).toBe(closing);expect(calls).toEqual(['detach','workspace']);finish();await closing;expect(calls).toEqual(['detach','workspace','raster']);expect(dispose()).toBe(closing);
  });
});
