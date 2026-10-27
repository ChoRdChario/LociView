import {describe,it,expect,vi} from 'vitest';
import {createGsResidency,queueGsDecode} from '../src/viewer/gsDecodeQueue';
const demand=(count=10,degree=4)=>({count,degree});
describe('document GS instance ownership',()=>{
  it('counts separate instances, all coefficients and non-creditable retirement',()=>{
    const pool=createGsResidency(10,890),a={},b={},first=pool.reserve(a,demand(6));
    const second=pool.reserve(b,demand(4));expect(()=>pool.reserve({},demand(1))).toThrow('上限');
    expect(()=>pool.assertFits([demand(6)],a)).not.toThrow();expect(()=>pool.assertFits([demand(10)],a)).toThrow('上限');
    first.retire();expect(()=>pool.assertFits([demand(1)],a)).toThrow('上限');first.release();first.release();
    expect(()=>pool.assertFits([demand(6)],a)).not.toThrow();second.release();
    expect(()=>createGsResidency(100,88).reserve({},demand(1))).toThrow('上限');
    for(const d of [demand(0),demand(1,5),demand(1,.5),demand(Number.MAX_SAFE_INTEGER)])expect(()=>pool.reserve({},d)).toThrow();
  });
  it('atomically promises the complete view before decode and preserves the other old view',()=>{
    const pool=createGsResidency(5,445),a=pool.admit([demand(1)]),b=pool.admit([demand(1)]),oldA=a.reserve(0,demand(1)),oldB=b.reserve(0,demand(1));
    const nextA=pool.admit([demand(4)],a);expect(a.active).toBe(false);expect(b.active).toBe(true);
    expect(()=>pool.admit([demand(4)],b)).toThrow('上限');expect(b.active).toBe(true);expect(nextA.active).toBe(true);
    oldA.release();const current=nextA.reserve(0,demand(4));expect(()=>nextA.reserve(0,demand(4))).toThrow('対象');
    nextA.cancel();current.release();b.cancel();oldB.release();expect(()=>pool.admit([demand(3),demand(3)])).toThrow('上限');
  });
  it('pins failed predecessor cleanup and cancels an unstarted replacement as a whole',()=>{
    const pool=createGsResidency(5,445),a=pool.admit([demand(1)]),b=pool.admit([demand(1)]),oldA=a.reserve(0,demand(1)),oldB=b.reserve(0,demand(1));
    const next=pool.admit([demand(2),demand(2)],a);oldA.retire();
    expect(()=>next.reserve(0,demand(2))).toThrow('上限');expect(next.active).toBe(false);expect(b.active).toBe(true);
    expect(()=>pool.admit([demand(5)])).toThrow('上限');b.cancel();oldB.release();oldA.release();
    const unused=pool.admit([demand(5)]);unused.cancel();expect(()=>pool.admit([demand(5)])).not.toThrow();
  });
  it('reserves only actual decode, retains cancelled initialization, then releases after proven cleanup',async()=>{
    const pool=createGsResidency(10,890);let settle!:()=>void;const pending=new Promise<void>(yes=>{settle=yes;}),cleanup=vi.fn(),next=vi.fn();
    const first=queueGsDecode({},()=>({initialized:pending,value:1,dispose:cleanup}),()=>pool.reserve({},demand()));
    const result=first.promise.catch(e=>e.name);first.cancel();
    const queued=queueGsDecode({},()=>({initialized:Promise.resolve(),value:2,dispose(){}}),()=>{next();return pool.reserve({},demand());});
    expect(next).not.toHaveBeenCalled();expect(()=>pool.reserve({},demand(1))).toThrow('上限');expect(cleanup).not.toHaveBeenCalled();
    settle();expect(await result).toBe('AbortError');expect(await queued.promise).toBe(2);expect(cleanup).toHaveBeenCalledOnce();queued.cancel();expect(()=>pool.reserve({},demand())).not.toThrow();
  });
  it('keeps failed cleanup and uncertain constructors charged, but releases a failed initialized candidate after cleanup',async()=>{
    const pool=createGsResidency(10,890),owner={};
    const failed=queueGsDecode({},()=>({initialized:Promise.reject(Error('initialize')),value:1,dispose(){}}),()=>pool.reserve(owner,demand()));
    await expect(failed.promise).rejects.toThrow('initialize');expect(()=>pool.assertFits([demand()])).not.toThrow();
    const retained=queueGsDecode({},()=>({initialized:Promise.resolve(),value:2,dispose(){throw Error('cleanup');}}),()=>pool.reserve(owner,demand()));
    await retained.promise;expect(()=>retained.cancel()).toThrow('cleanup');expect(()=>pool.assertFits([demand(1)],owner)).toThrow('上限');
    const other=createGsResidency(10,890),constructor=queueGsDecode({},()=>{throw Error('constructor');},()=>other.reserve(owner,demand()));
    await expect(constructor.promise).rejects.toThrow('constructor');expect(()=>other.assertFits([demand(1)],owner)).toThrow('上限');
  });
});
