import { describe, expect, it, vi } from 'vitest';
import { createMediaPreviewResources, createMediaResidencyGate } from '../../src/ui/projectScene/mediaPreviewResources';
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
  it.each(['gallery', 'picker'] as const)('returns focus to the same live attachment after thumbnail retirement (%s)', async kind => {
    const doc = new RecordedDocument(), viewer = createMediaViewer(doc.asDocument());
    const group: MediaPreviewGroup = { scope: 'owned', label: '写真', items: [{ id: 'photo', resourceId: 'original', label: '写真', description: '', image: { blob: image() } }] };
    const thumbs = createMediaThumbnails(doc.asDocument(), () => group, viewer, kind === 'picker' ? { selected: () => null, choose() {} } : undefined);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const show = () => all(record(thumbs.root)).find(n => n.tag === 'button' && n.textContent === '画像を表示')!;
    const close = all(record(viewer.root)).find(n => n.attributes.get('aria-label') === '閉じる')!;
    try {
      thumbs.render(true); const before = show(); before.focus(); before.click();
      thumbs.render(false); thumbs.render(true); const current = show(); expect(current).not.toBe(before);
      close.focus(); close.click(); expect(doc.activeElement).toBe(current); expect(current.focusCalls).toEqual([{ preventScroll: true }]);
    } finally { thumbs.dispose(); await viewer.dispose(); }
  });
  it.each(['scope', 'resource', 'disposed'] as const)('does not restore photo focus into a replaced owner (%s)', async changed => {
    const doc = new RecordedDocument(), viewer = createMediaViewer(doc.asDocument());
    let group: MediaPreviewGroup = { scope: 'owned', label: '写真', items: [{ id: 'photo', resourceId: 'original', label: '写真', description: '', image: { blob: image() } }] };
    const thumbs = createMediaThumbnails(doc.asDocument(), () => group, viewer);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const show = () => all(record(thumbs.root)).find(n => n.tag === 'button' && n.textContent === '画像を表示')!;
    const close = all(record(viewer.root)).find(n => n.attributes.get('aria-label') === '閉じる')!;
    try {
      thumbs.render(true); show().click(); thumbs.render(false);
      if (changed === 'disposed') thumbs.dispose();
      else { group = changed === 'scope' ? { ...group, scope: 'other' } : { ...group, items: [{ ...group.items[0]!, resourceId: 'replacement' }] }; thumbs.render(true); }
      close.focus(); close.click(); expect(doc.activeElement).toBe(close);
    } finally { thumbs.dispose(); await viewer.dispose(); }
  });
  it('keeps a hidden thumbnail list inactive through late paging until its owner resumes it', async () => {
    const doc = new RecordedDocument(), viewer = createMediaViewer(doc.asDocument());
    const read = vi.fn((): MediaPreviewGroup => ({ scope: 'owned', label: '写真', items: Array.from({ length: 13 }, (_, i) => ({
      id: String(i), resourceId: String(i), label: `写真${i}`, description: '', image: { blob: image() },
    })) }));
    const thumbnails = createMediaThumbnails(doc.asDocument(), read, viewer), root = record(thumbnails.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    try {
      thumbnails.render(true);
      const next = all(root).find(n => n.textContent === '次の一覧')!;
      expect(next.disabled).toBe(false);
      thumbnails.render(false); read.mockClear(); next.click(); thumbnails.render();
      expect(read).not.toHaveBeenCalled(); expect(root.hidden).toBe(true);
      expect(all(root).filter(n => n.tag === 'figure')).toHaveLength(0);
      thumbnails.render(true); expect(read).toHaveBeenCalled(); expect(root.hidden).toBe(false);
    } finally { thumbnails.dispose(); await viewer.dispose(); }
  });
  it('joins the same viewer retirement until a closed original finishes native decoding',async()=>{
    const doc=new RecordedDocument(),dom=doc.asDocument(),create=dom.createElement.bind(dom),started=gate(),native=gate(),raster=createRasterResources({cpuBytes:100000,gpuBytes:0});
    vi.spyOn(dom,'createElement').mockImplementation(((tag:string)=>{const node=create(tag);if(tag==='img')Object.assign(node,{decode:async()=>{started.resolve();await native.promise;},naturalWidth:8,naturalHeight:4});return node;}) as Document['createElement']);
    const viewer=createMediaViewer(dom,raster),group:MediaPreviewGroup={scope:'owner',label:'写真',items:[{id:'a',resourceId:'one',label:'原本',description:'',image:{key:'original',load:async()=>image()}}]};
    try{
      viewer.open(()=>group,'a',doc.createElement('button') as unknown as HTMLElement);await started.promise;
      const all=(n:RecordedNode):RecordedNode[]=>[n,...n.children.flatMap(all)];all(record(viewer.root)).find(n=>n.attributes.get('aria-label')==='閉じる')!.fire('click');
      const first=viewer.dispose(),second=viewer.dispose();expect(second).toBe(first);expect(raster.snapshot().cpuBytes).toBeGreaterThan(0);
      const nextOwner=vi.fn();const handoff=first.then(nextOwner);await Promise.resolve();expect(nextOwner).not.toHaveBeenCalled();
      native.resolve();await handoff;expect(nextOwner).toHaveBeenCalledOnce();expect(raster.snapshot().cpuBytes).toBe(0);
    }finally{native.resolve();await viewer.dispose();await raster.dispose();}
  });
  it('replaces one displayed original once when retiring its residency synchronously repaints the viewer',async()=>{
    const doc=new RecordedDocument(),dom=doc.asDocument(),create=dom.createElement.bind(dom),raster=createRasterResources({cpuBytes:100000,gpuBytes:0});
    vi.spyOn(dom,'createElement').mockImplementation(((tag:string)=>{const node=create(tag);if(tag==='img')Object.assign(node,{decode:async()=>{},naturalWidth:8,naturalHeight:4});return node;}) as Document['createElement']);
    const first=vi.fn(async()=>image()),second=vi.fn(async()=>image());let viewer:ReturnType<typeof createMediaViewer>|undefined;
    const residency=async()=>({release(){viewer?.render();}});
    viewer=createMediaViewer(dom,raster,undefined,residency);
    let group:MediaPreviewGroup={scope:'same',label:'写真',items:[{id:'a',resourceId:'one',label:'写真',description:'',image:{key:'first',load:first}}]};
    const all=(node:RecordedNode):RecordedNode[]=>[node,...node.children.flatMap(all)],root=record(viewer.root);
    try{
      viewer.open(()=>group,'a',doc.createElement('button') as unknown as HTMLElement);
      await vi.waitFor(()=>expect(all(root).filter(n=>n.tag==='img')).toHaveLength(1));
      group={...group,items:[{...group.items[0]!,image:{key:'second',load:second}}]};viewer.render();
      await vi.waitFor(()=>expect(second).toHaveBeenCalledOnce());await vi.waitFor(()=>expect(all(root).filter(n=>n.tag==='img')).toHaveLength(1));
      expect(first).toHaveBeenCalledOnce();expect(viewer.resources!.snapshot().originals).toBe(1);
      all(root).find(n=>n.attributes.get('aria-label')==='閉じる')!.click();expect(viewer.resources!.snapshot().originals).toBe(0);
      expect(raster.snapshot().cpuBytes).toBe(0);
    }finally{viewer.dispose();await raster.dispose();}
  });
  it('keeps another coarse owner paused when an older acquisition is cancelled, without pausing fine-pointer viewing',async()=>{
    const settled=gate(),changed=vi.fn(),idle=vi.fn(()=>settled.promise),doc={defaultView:{matchMedia:()=>({matches:true})}} as unknown as Document;
    const residency=createMediaResidencyGate(doc,changed,idle,()=>true),cancel=new AbortController(),first=residency.acquire(cancel.signal),second=residency.acquire(new AbortController().signal);
    const rejected=expect(first).rejects.toMatchObject({name:'AbortError'});await Promise.resolve();expect(residency.active).toBe(true);cancel.abort();settled.resolve();await rejected;
    const current=await second;expect(residency.active).toBe(true);current.release();current.release();expect(residency.active).toBe(false);expect(changed).toHaveBeenCalledTimes(4);
    const fine=createMediaResidencyGate({defaultView:{matchMedia:()=>({matches:false})}} as unknown as Document,changed,idle,()=>true);
    const calls=changed.mock.calls.length;const lease=await fine.acquire(new AbortController().signal);lease.release();expect(changed).toHaveBeenCalledTimes(calls);expect(fine.active).toBe(false);
  });
  it('closes the acquired bitmap when canvas allocation fails',async()=>{
    const close=vi.fn();vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:8,height:4,close})));
    const raster=createRasterResources({cpuBytes:100000,gpuBytes:0}),manager=createMediaPreviewResources({createElement(){throw Error('canvas allocation');}} as unknown as Document,raster);
    try{const thumb=manager.thumbnail('allocation',async()=>image());await expect(thumb.ready).rejects.toThrow('canvas allocation');expect(close).toHaveBeenCalledOnce();thumb.release();expect(raster.snapshot().cpuBytes).toBe(0);}
    finally{await manager.dispose();await raster.dispose();vi.unstubAllGlobals();}
  });
  it('waits for native residency cleanup before source read and holds it through late original cancellation',async()=>{
    const drained=gate(),requested=gate(),decoded=gate(),finish=gate(),release=vi.fn(),source=vi.fn(async()=>image());
    const raster=createRasterResources({cpuBytes:100000,gpuBytes:0}),stub=documentStub(async()=>{decoded.resolve();await finish.promise;});
    const manager=createMediaPreviewResources(stub.document,raster,{residency:async()=>{requested.resolve();await drained.promise;return{release};}});
    const original=manager.original(source),rejected=expect(original.ready).rejects.toMatchObject({name:'AbortError'});
    await requested.promise;expect(source).not.toHaveBeenCalled();drained.resolve();await decoded.promise;expect(source).toHaveBeenCalledOnce();
    original.release();expect(release).not.toHaveBeenCalled();finish.resolve();await rejected;expect(stub.images[0]!.src).toBe('');expect(release).toHaveBeenCalledOnce();
    await manager.dispose();await raster.dispose();
  });
  it('reuses a tiny cached thumbnail without reacquiring display residency and preserves its action during suspension',async()=>{
    const raster=createRasterResources({cpuBytes:100000,gpuBytes:0}),doc=new RecordedDocument(),release=vi.fn(),residency=vi.fn(async()=>({release}));
    const manager=createMediaPreviewResources(doc.asDocument(),raster,{edge:8,derive,residency});
    const source=vi.fn(async()=>image()),first=manager.thumbnail('same',source);await first.ready;first.release();
    const again=manager.thumbnail('same',source);await again.ready;expect(source).toHaveBeenCalledOnce();expect(residency).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();
    const viewer=createMediaViewer(doc.asDocument()),group:MediaPreviewGroup={scope:'owner',label:'写真',items:[{id:'item',resourceId:'resource',label:'写真',description:'',image:{key:'same',load:source}}]};
    const cards=createMediaThumbnails(doc.asDocument(),()=>group,{...viewer,resources:manager});cards.render();await Promise.resolve();await Promise.resolve();
    const all=(node:RecordedNode):RecordedNode[]=>[node,...node.children.flatMap(all)],action=all(record(cards.root)).find(n=>n.tag==='button'&&n.textContent==='画像を表示')!;
    action.focus();manager.setThumbnailsActive(false);expect(doc.activeElement).toBe(action);expect(all(record(cards.root))).toContain(action);expect(all(record(cards.root)).filter(n=>n.tag==='img')).toHaveLength(0);
    manager.setThumbnailsActive(true);await Promise.resolve();await Promise.resolve();expect(source).toHaveBeenCalledOnce();expect(residency).toHaveBeenCalledOnce();
    cards.dispose();viewer.dispose();again.release();await manager.dispose();await raster.dispose();
  });
  it('requests a bounded bitmap and reads only PNG headers, then closes a cancelled bitmap without encoding it',async()=>{
    const began=gate(),bitmapReady=gate<ImageBitmap>(),close=vi.fn(),draw=vi.fn(),encode=vi.fn();
    const bitmap=vi.fn(async()=>{began.resolve();return bitmapReady.promise;});vi.stubGlobal('createImageBitmap',bitmap);
    const document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage:draw}),toBlob:encode})} as unknown as Document;
    const original=image(8192,4096),fullRead=vi.spyOn(original,'arrayBuffer'),raster=createRasterResources({cpuBytes:300000000,gpuBytes:0}),manager=createMediaPreviewResources(document,raster);
    try{
      const thumb=manager.thumbnail('8k',async()=>original),rejected=expect(thumb.ready).rejects.toMatchObject({name:'AbortError'});await began.promise;
      expect(fullRead).not.toHaveBeenCalled();expect(bitmap.mock.calls[0]).toEqual([original,{resizeWidth:320,resizeHeight:160,resizeQuality:'high',imageOrientation:'from-image'}]);
      thumb.release();bitmapReady.resolve({width:320,height:160,close} as unknown as ImageBitmap);await rejected;
      expect(close).toHaveBeenCalledOnce();expect(draw).not.toHaveBeenCalled();expect(encode).not.toHaveBeenCalled();expect(raster.snapshot().cpuBytes).toBe(0);
    }finally{await manager.dispose();await raster.dispose();vi.unstubAllGlobals();}
  });
  it('drains a cancelled pre-source residency request on disposal without starting the source',async()=>{
    const requested=gate(),drained=gate(),release=vi.fn(),source=vi.fn(async()=>image()),raster=createRasterResources({cpuBytes:100000,gpuBytes:0});
    const manager=createMediaPreviewResources(documentStub().document,raster,{edge:8,derive,residency:async()=>{requested.resolve();await drained.promise;return{release};}});
    const thumb=manager.thumbnail('closing',source),rejected=expect(thumb.ready).rejects.toMatchObject({name:'AbortError'});await requested.promise;
    let ended=false;const retirement=manager.dispose();expect(manager.dispose()).toBe(retirement);const closing=retirement.then(()=>{ended=true;});await Promise.resolve();expect(ended).toBe(false);drained.resolve();await rejected;await closing;
    expect(source).not.toHaveBeenCalled();expect(release).toHaveBeenCalledOnce();await raster.dispose();
  });
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
