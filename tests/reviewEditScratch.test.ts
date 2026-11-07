import {describe,it,expect,vi} from 'vitest';
import {MemoryFS} from '../src/platform/fs';
import {createReviewEditScratch} from '../src/projectPackage/reviewEdit';
describe('owned native Review edit-copy scratch',()=>{
  it('returns an immutable restartable file, retains it until release and never mutates a Project',async()=>{
    const fs=new MemoryFS();await fs.writeText('projects/retained','original');const scratch=createReviewEditScratch(fs);
    const lease=await scratch.write(async destination=>{const writer=destination.getWriter();for(let i=0;i<4;i++)await writer.write(new Uint8Array(65536).fill(i));await writer.close();});
    expect(lease.file.size).toBe(4*65536);expect((await fs.list('v2/transient-review-copy/')).length).toBe(1);
    const first=new Uint8Array(await lease.file.slice(0,1).arrayBuffer()),last=new Uint8Array(await lease.file.slice(-1).arrayBuffer());expect([...first,...last]).toEqual([0,3]);
    await lease.release();await lease.release();expect(await fs.list('v2/transient-review-copy/')).toEqual([]);expect(await fs.readText('projects/retained')).toBe('original');await scratch.dispose();
    await expect(scratch.write(async()=>{})).rejects.toThrow('閉じ');
  });
  it('settles blocked producer and removes owned partial bytes when the storage sink fails before reading',async()=>{
    const fs=new MemoryFS(),error=Error('sink failure');vi.spyOn(fs,'writeStream').mockRejectedValue(error);const scratch=createReviewEditScratch(fs),stopped=vi.fn();
    await expect(scratch.write(async destination=>{const writer=destination.getWriter();try{await writer.write(new Uint8Array(1024));await writer.close();}finally{stopped();writer.releaseLock();}})).rejects.toBe(error);
    expect(stopped).toHaveBeenCalledOnce();await scratch.dispose();expect(await fs.list('')).toEqual([]);
  });
  it('cancels active generation before waiting for disposal',async()=>{
    const fs=new MemoryFS(),scratch=createReviewEditScratch(fs);let begun!:()=>void;const started=new Promise<void>(yes=>{begun=yes;});
    const pending=scratch.write(async(destination,signal)=>{const writer=destination.getWriter();try{await writer.write(new Uint8Array(64));begun();await new Promise<void>((_,no)=>signal!.addEventListener('abort',()=>no(signal!.reason),{once:true}));}finally{writer.releaseLock();}});
    const result=pending.catch(e=>e.name);await started;await scratch.dispose();expect(await result).toBe('AbortError');expect(await fs.list('')).toEqual([]);
  });

  it('attempts every owned cleanup, retains failure for retry and never removes Project bytes',async()=>{
    const fs=new MemoryFS();await fs.writeText('projects/retained','original');const scratch=createReviewEditScratch(fs);
    const produce=async(destination:WritableStream<Uint8Array>)=>{const w=destination.getWriter();await w.write(new Uint8Array([1,2]));await w.close();};
    const first=await scratch.write(produce),firstPath=(await fs.list('v2/transient-review-copy/'))[0]!,second=await scratch.write(produce),paths=await fs.list('v2/transient-review-copy/');
    let blocked=true;const originalRemove=fs.remove.bind(fs),remove=vi.spyOn(fs,'remove').mockImplementation(async path=>{if(path===firstPath&&blocked)throw new DOMException('denied','NotAllowedError');await originalRemove(path);});
    const closing=scratch.dispose();expect(scratch.dispose()).toBe(closing);await expect(closing).rejects.toThrow('一時ファイルの解放');
    expect(new Set(remove.mock.calls.map(c=>c[0]))).toEqual(new Set(paths));expect(await fs.list('v2/transient-review-copy/')).toEqual([firstPath]);expect(await fs.readText('projects/retained')).toBe('original');
    blocked=false;await scratch.dispose();expect(await fs.list('v2/transient-review-copy/')).toEqual([]);const count=remove.mock.calls.length;
    await first.release();await second.release();expect(remove).toHaveBeenCalledTimes(count);await expect(scratch.write(produce)).rejects.toThrow('閉じ');
  });

  it('preserves quota and cleanup errors and retries the same failed path before allocating another archive',async()=>{
    const fs=new MemoryFS(),scratch=createReviewEditScratch(fs),stored=fs.writeStream.bind(fs),removed=fs.remove.bind(fs),quota=new DOMException('full','QuotaExceededError'),denied=new DOMException('locked','NotAllowedError');
    const write=vi.spyOn(fs,'writeStream').mockImplementation(async(path,stream)=>{await stored(path,stream);throw quota;});let blocked=true;
    const remove=vi.spyOn(fs,'remove').mockImplementation(async path=>{if(blocked)throw denied;await removed(path);});
    const produce=async(destination:WritableStream<Uint8Array>)=>{const w=destination.getWriter();await w.write(new Uint8Array([8]));await w.close();};
    const failure=await scratch.write(produce).catch(error=>error);expect(failure).toBeInstanceOf(AggregateError);expect(failure.errors).toEqual([quota,denied]);
    const retained=await fs.list('v2/transient-review-copy/');expect(retained).toHaveLength(1);const next=vi.fn(produce);
    await expect(scratch.write(next)).rejects.toThrow('新しいファイルは作成していません');expect(next).not.toHaveBeenCalled();expect(write).toHaveBeenCalledOnce();expect(await fs.list('v2/transient-review-copy/')).toEqual(retained);
    blocked=false;write.mockImplementation(stored);const ready=await scratch.write(next);expect(next).toHaveBeenCalledOnce();expect(remove.mock.calls.map(c=>c[0])).toEqual([retained[0],retained[0],retained[0]]);
    expect(await fs.list('v2/transient-review-copy/')).toHaveLength(1);expect(await fs.exists(retained[0]!)).toBe(false);expect([...new Uint8Array(await ready.file.arrayBuffer())]).toEqual([8]);await ready.release();await scratch.dispose();
  });

  it('joins concurrent release and leaves an unrelated live lease intact while retrying a failed cleanup',async()=>{
    const fs=new MemoryFS(),scratch=createReviewEditScratch(fs),produce=async(destination:WritableStream<Uint8Array>)=>{const w=destination.getWriter();await w.write(new Uint8Array([9]));await w.close();};
    const live=await scratch.write(produce),failed=await scratch.write(produce),paths=await fs.list('v2/transient-review-copy/'),removed=fs.remove.bind(fs);let blocked=true;
    // Resolve each lease's exact path through release, independent of UUID ordering.
    const remove=vi.spyOn(fs,'remove').mockImplementation(async path=>{if(blocked)throw Error('cleanup blocked');await removed(path);});
    await expect(failed.release()).rejects.toThrow('blocked');const failedPath=remove.mock.calls[0]![0];blocked=false;
    const third=await scratch.write(produce);expect(await fs.exists(failedPath)).toBe(false);expect(await fs.exists(paths.find(p=>p!==failedPath)!)).toBe(true);
    let finish!:()=>void;remove.mockImplementation(async path=>{await new Promise<void>(resolve=>{finish=resolve;});await removed(path);});
    const a=live.release(),b=live.release();expect(a).toBe(b);await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));finish();await a;
    remove.mockImplementation(removed);await third.release();await scratch.dispose();expect(await fs.list('')).toEqual([]);
  });

});
