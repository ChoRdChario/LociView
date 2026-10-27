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

});
