import { describe, expect, it, vi } from 'vitest';
import { createMediaPreviewResources } from '../../src/ui/projectScene/mediaPreviewResources';
import { createRasterResources } from '../../src/viewer/rasterResources';
import { createMediaViewer, createMediaThumbnails, type MediaPreviewGroup } from '../../src/ui/projectScene/mediaPreview';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';

const gate = <T = void>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
// Trusted-port ownership fixture; real format admission/decode is covered separately.
const image = (width = 8, height = 4) => { const data = new Uint8Array(24); data.set([137,80,78,71,13,10,26,10]); data.set([73,72,68,82],12); const view = new DataView(data.buffer); view.setUint32(16,width); view.setUint32(20,height); return new Blob([data], { type:'image/png' }); };
const documentStub = (decoding: () => Promise<void> = async () => {}) => {
  const images: { src: string; decode: () => Promise<void>; removeAttribute: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[] = [];
  const document = { createElement() { const value = { src:'', decode:decoding, removeAttribute:vi.fn(function(this: {src:string}) { this.src=''; }), remove:vi.fn() }; images.push(value); return value; } } as unknown as Document;
  return { document, images };
};
const derive = async () => new Blob(['derived'], { type:'image/png' });

describe('UI-only shared image ownership', () => {
  it('publishes the remaining real UI card after its shared first card closes while queued, and displays retry errors',async()=>{
    const document=new RecordedDocument(),dom=document.asDocument(),raster=createRasterResources({cpuBytes:100000,gpuBytes:0}),finish=gate(),started=gate();
    const manager=createMediaPreviewResources(dom,raster,{edge:8,derive}),viewer=createMediaViewer(dom),sharedViewer={...viewer,resources:manager};
    const block=manager.thumbnail('block',async()=>{started.resolve();await finish.promise;return image();});await started.promise;
    const source=vi.fn(async()=>image()),group:MediaPreviewGroup={scope:'same-project',label:'添付',items:[{id:'first',resourceId:'resource',label:'写真',description:'',image:{key:'immutable-display',load:source}}]};
    const first=createMediaThumbnails(dom,()=>group,sharedViewer),remaining=createMediaThumbnails(dom,()=>group,sharedViewer);
    first.render();remaining.render();first.dispose();finish.resolve();await block.ready;
    const all=(node:RecordedNode):RecordedNode[]=>[node,...node.children.flatMap(all)];
    await vi.waitFor(()=>expect(all(record(remaining.root)).some(node=>node.tag==='img')).toBe(true));expect(source).toHaveBeenCalledOnce();
    all(record(remaining.root)).find(node=>node.tag==='img')!.fire('load');
    expect(all(record(remaining.root)).filter(node=>node.attributes.get('role')==='status').map(node=>node.textContent).join()).toBe('');
    const broken:MediaPreviewGroup={...group,items:[{...group.items[0]!,image:{key:'failed-source',load:async()=>{throw Error('表示を再試行してください。');}}}]};
    const failed=createMediaThumbnails(dom,()=>broken,sharedViewer);failed.render();
    await vi.waitFor(()=>expect(all(record(failed.root)).some(node=>node.textContent==='表示を再試行してください。')).toBe(true));
    expect(all(record(failed.root)).find(node=>node.tag==='button'&&node.textContent==='画像を再試行')!.hidden).toBe(false);
    remaining.dispose();failed.dispose();block.release();viewer.dispose();await manager.dispose();await raster.dispose();
    expect(raster.snapshot().cpuBytes).toBe(0);
  });
  it('keeps a shared queued thumbnail alive when its first card closes', async () => {
    const raster = createRasterResources({cpuBytes:100000,gpuBytes:0}), blocking = gate(), started = gate();
    const manager = createMediaPreviewResources(documentStub().document,raster,{edge:8,derive});
    const first = manager.thumbnail('block',async()=>{started.resolve();await blocking.promise;return image();});
    await started.promise;
    const source = vi.fn(async()=>image()), released = manager.thumbnail('shared',source), remaining = manager.thumbnail('shared',source);
    released.release();blocking.resolve();await first.ready;await remaining.ready;
    expect(source).toHaveBeenCalledOnce();expect(manager.snapshot().entries).toBe(2);
    first.release();remaining.release();await manager.dispose();await raster.dispose();expect(raster.snapshot().cpuBytes).toBe(0);
  });
  it('refuses a saturated leased thumbnail cache locally, then evicts on retry; originals remain independent',async()=>{
    const raster=createRasterResources({cpuBytes:100000,gpuBytes:0}),stub=documentStub(),manager=createMediaPreviewResources(stub.document,raster,{edge:8,cacheBytes:256,derive});
    const first=manager.thumbnail('one',async()=>image());await first.ready;
    const refused=manager.thumbnail('two',async()=>image());await expect(refused.ready).rejects.toThrow('ほかの画像');refused.release();
    const original=manager.original(async()=>image());await original.ready;expect(stub.images[0]!.src).toMatch(/^blob:/);
    original.release();expect(stub.images[0]!.src).toBe('');first.release();
    const retry=manager.thumbnail('two',async()=>image(),'retry');await retry.ready;expect(manager.snapshot()).toMatchObject({entries:1,cacheBytes:256});
    retry.release();await manager.dispose();await raster.dispose();expect(raster.snapshot().cpuBytes).toBe(0);
  });
  it('owns a cancelled native thumbnail until its late derive result settles',async()=>{
    const raster=createRasterResources({cpuBytes:100000,gpuBytes:0}),started=gate(),finish=gate<Blob>(),manager=createMediaPreviewResources(documentStub().document,raster,{edge:8,derive:async()=>{started.resolve();return finish.promise;}});
    const lease=manager.thumbnail('late',async()=>image());const rejected=expect(lease.ready).rejects.toMatchObject({name:'AbortError'});await started.promise;
    lease.release();expect(raster.snapshot()).toMatchObject({active:true});expect(raster.snapshot().cpuBytes).toBeGreaterThan(0);
    finish.resolve(new Blob(['late']));await rejected;await manager.dispose();await raster.dispose();expect(raster.snapshot()).toMatchObject({cpuBytes:0,active:false});
  });
  it('retains an original during native decode and after display, releasing only at each terminal boundary',async()=>{
    const raster=createRasterResources({cpuBytes:100000,gpuBytes:0}),decodeStarted=gate(),finish=gate(),stub=documentStub(async()=>{decodeStarted.resolve();await finish.promise;}),manager=createMediaPreviewResources(stub.document,raster,{edge:8,derive});
    const late=manager.original(async()=>image()),rejected=expect(late.ready).rejects.toMatchObject({name:'AbortError'});await decodeStarted.promise;
    late.release();expect(stub.images[0]!.src).toMatch(/^blob:/);expect(raster.snapshot().cpuBytes).toBeGreaterThan(0);
    finish.resolve();await rejected;expect(stub.images[0]!.src).toBe('');expect(raster.snapshot().cpuBytes).toBe(0);
    const displayed=manager.original(async()=>image());await displayed.ready;expect(raster.snapshot().cpuBytes).toBeGreaterThan(0);
    displayed.release();expect(raster.snapshot().cpuBytes).toBe(0);await manager.dispose();await raster.dispose();
  });
  it('starts the requested original before queued background thumbnails',async()=>{
    const raster=createRasterResources({cpuBytes:100000,gpuBytes:0}),started=gate(),finish=gate(),order:string[]=[],manager=createMediaPreviewResources(documentStub().document,raster,{edge:8,derive});
    const blocking=manager.thumbnail('block',async()=>{started.resolve();await finish.promise;return image();});await started.promise;
    const background=manager.thumbnail('background',async()=>{order.push('thumbnail');return image();});
    const original=manager.original(async()=>{order.push('original');return image();});finish.resolve();
    await Promise.all([blocking.ready,background.ready,original.ready]);expect(order).toEqual(['original','thumbnail']);
    blocking.release();background.release();original.release();await manager.dispose();await raster.dispose();
  });
});
