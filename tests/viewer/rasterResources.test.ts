import { describe, expect, it } from 'vitest';
import { createRasterResources, rasterBytes, RasterResourceError } from '../../src/viewer/rasterResources';
import { createRasterLoadScope, retainRasterModelReadStage } from '../../src/viewer/rasterLoadScope';

describe('owned raster resources', () => {
  it('refuses encoded materialization before calling the content port and transfers successful source/image ownership',async()=>{
    const resources=createRasterResources({cpuBytes:100,gpuBytes:0});let reads=0,closed=0;
    const read=async()=>{reads++;return{bytes:new Uint8Array(20),raster:{cpuBytes:16,gpuBytes:0,images:[],maximumEdge:2}};};
    const blocker=resources.reserve({cpuBytes:21,gpuBytes:0},'another view');
    await expect(retainRasterModelReadStage(20,resources,read,async()=>({dispose(){closed++;}}))).rejects.toBeInstanceOf(RasterResourceError);expect(reads).toBe(0);blocker.release();
    const displayed=await retainRasterModelReadStage(20,resources,read,async()=>({dispose(){closed++;}}));expect(reads).toBe(1);expect(resources.snapshot().cpuBytes).toBe(36);
    displayed.dispose();displayed.dispose();expect(closed).toBe(1);expect(resources.snapshot().cpuBytes).toBe(0);await resources.dispose();
  });
  it('drains a cancelled actual loader callback and closes its late bitmap without publishing it',async()=>{
    const resources=createRasterResources();let finish!:(value:ImageBitmap)=>void,called=0,published=0,closed=0,failed=0;
    const scope=createRasterLoadScope(resources);scope.load(done=>{called++;finish=done;},()=>{published++;},()=>{failed++;});await Promise.resolve();
    const disposal=scope.dispose();expect(called).toBe(1);expect(resources.snapshot().active).toBe(true);
    finish({close(){closed++;}} as ImageBitmap);await disposal;expect({published,closed,failed}).toEqual({published:0,closed:1,failed:1});
    expect(resources.snapshot()).toMatchObject({queued:0,active:false});await resources.dispose();
  });
  it('refuses before allocation, transfers live ownership and counts exact rectangular mips', () => {
    const resources=createRasterResources({cpuBytes:20,gpuBytes:12}),lease=resources.reserve({cpuBytes:16,gpuBytes:8},'decode');
    expect(()=>resources.reserve({cpuBytes:5,gpuBytes:0},'another')).toThrow(RasterResourceError);
    expect(resources.snapshot()).toMatchObject({cpuBytes:16,gpuBytes:8,leases:1});
    lease.retain({cpuBytes:12,gpuBytes:8},'template');expect(lease.owner).toBe('template');
    expect(()=>lease.retain({cpuBytes:13,gpuBytes:8})).toThrow();
    const second=resources.reserve({cpuBytes:8,gpuBytes:4},'preview');lease.release();lease.release();
    expect(resources.snapshot()).toMatchObject({cpuBytes:8,gpuBytes:4,leases:1});second.release();
    expect(resources.snapshot()).toMatchObject({cpuBytes:0,gpuBytes:0,leases:0});
    expect(rasterBytes(8,2,true)).toBe(64+16+8+4);expect(()=>rasterBytes(Number.MAX_SAFE_INTEGER,2)).toThrow();
  });
  it('prioritizes original/retry and keeps a cancelled native job owned until its late result closes', async () => {
    const resources=createRasterResources({cpuBytes:10,gpuBytes:0}),lease=resources.reserve({cpuBytes:10,gpuBytes:0},'native');
    const controller=new AbortController(),order:string[]=[];let finish!:(value:{close():void})=>void;
    const first=resources.decode('thumbnail',()=>new Promise<{close():void}>(resolve=>{finish=resolve;}),value=>{value.close();lease.release();},controller.signal);
    const failed=expect(first).rejects.toThrow('cancelled');
    const background=resources.decode('thumbnail',async()=>{order.push('thumbnail');return 1;},()=>{});
    const original=resources.decode('original',async()=>{order.push('original');return 2;},()=>{});
    const retry=resources.decode('retry',async()=>{order.push('retry');return 3;},()=>{});
    await Promise.resolve();controller.abort(new Error('cancelled'));expect(resources.snapshot()).toMatchObject({active:true,queued:3,cpuBytes:10});
    let closed=false;finish({close(){closed=true;}});await failed;expect(closed).toBe(true);
    await Promise.all([background,original,retry]);expect(order).toEqual(['original','retry','thumbnail']);
    expect(resources.snapshot()).toMatchObject({cpuBytes:0,active:false,queued:0});await resources.dispose();
  });
  it('drains the next native owner after synchronous failure before disposing the queue', async () => {
    const resources=createRasterResources();let finish!:(value:{close():void})=>void,closed=0,started!:()=>void;
    const ready=new Promise<void>(resolve=>{started=resolve;});
    const bad=resources.decode('thumbnail',()=>{throw Error('native refused');},()=>{});
    const refused=expect(bad).rejects.toThrow('native refused');
    const next=resources.decode('original',()=>new Promise<{close():void}>(resolve=>{finish=resolve;started();}),value=>value.close());
    const cancelled=expect(next).rejects.toMatchObject({name:'AbortError'});
    await refused;await ready;let drained=false;const disposal=resources.dispose().then(()=>{drained=true;});
    await Promise.resolve();expect(drained).toBe(false);finish({close(){closed++;}});
    await cancelled;await disposal;expect(closed).toBe(1);expect(resources.snapshot()).toMatchObject({active:false,queued:0});
  });
});
