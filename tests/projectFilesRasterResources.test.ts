import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRasterResources,RasterResourceError} from '../src/viewer/rasterResources';
import {createRasterDecoders} from '../src/projectFiles/rasterDecoders';
import {inspectProjectMedia,prepareProjectMedia,mediaDisplayDimensions} from '../src/projectFiles/media';
import {heicStructure} from '../src/projectFiles/heic';
import {photoFixtures} from './helpers/photoFixtures';
import {createMediaPreviewResources} from '../src/ui/projectScene/mediaPreviewResources';

const limits={maxFileBytes:64*1024*1024,maxJsonBytes:4*1024*1024,maxItems:100000,maxValues:8000000,maxPixels:16777216};
const heic=new Uint8Array(readFileSync(new URL('./fixtures/daily-media/owned-still.heic',import.meta.url)));
const shape=heicStructure(heic,limits),gate=<T=void>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};};
afterEach(()=>vi.unstubAllGlobals());

describe('existing still-image validation shares workspace resources (native codecs injected)',()=>{
  it('retains a cancelled HEIC decode until native settlement, and serializes a queued GIF',async()=>{
    const raster=createRasterResources({cpuBytes:20000000,gpuBytes:0}),decoders=createRasterDecoders(limits,raster),started=gate(),finish=gate<ImageBitmap>(),closed=vi.fn();
    const gif=Uint8Array.from(atob(photoFixtures.find(p=>p.name==='gif-animated')!.base64),c=>c.charCodeAt(0));
    const native=vi.fn(async(blob:Blob)=>{if(blob.type==='image/heic'){started.resolve();return finish.promise;}return{width:8,height:4,close:closed} as unknown as ImageBitmap;});
    vi.stubGlobal('createImageBitmap',native);const controller=new AbortController();
    const first=inspectProjectMedia(heic,limits,decoders.png,decoders.jpeg,decoders.photo,decoders.media,controller.signal),rejected=expect(first).rejects.toMatchObject({name:'AbortError'});
    await started.promise;controller.abort();await rejected;
    expect(raster.snapshot().active).toBe(true);expect(raster.snapshot().cpuBytes).toBeGreaterThan(0);
    const next=decoders.photo(gif,'image/gif');expect(native).toHaveBeenCalledTimes(1);
    finish.resolve({width:shape.width,height:shape.height,close:closed} as unknown as ImageBitmap);
    const image=await next;expect(native).toHaveBeenCalledTimes(2);expect(closed).toHaveBeenCalledTimes(1);image.close();
    await raster.dispose();expect(closed).toHaveBeenCalledTimes(2);expect(raster.snapshot().cpuBytes).toBe(0);
  });
  it('refuses the HEIC item-copy parser before native work and keeps resource failures identifiable',async()=>{
    const raster=createRasterResources({cpuBytes:limits.maxValues-1,gpuBytes:0}),decoders=createRasterDecoders(limits,raster),native=vi.fn();vi.stubGlobal('createImageBitmap',native);
    await expect(inspectProjectMedia(heic,limits,decoders.png,decoders.jpeg,decoders.photo,decoders.media)).rejects.toBeInstanceOf(RasterResourceError);
    expect(native).not.toHaveBeenCalled();expect(raster.snapshot().cpuBytes).toBe(0);await raster.dispose();
  });
  it('owns the HEIC canvas until a late toBlob callback after cancellation',async()=>{
    const raster=createRasterResources({cpuBytes:20000000,gpuBytes:0}),decoders=createRasterDecoders(limits,raster),encoding=gate(),closed=vi.fn();let callback!:(blob:Blob|null)=>void;
    const bitmap={width:shape.width,height:shape.height,close:closed};
    const canvas={width:0,height:0,getContext:()=>({drawImage(source:unknown){expect(source).toBe(bitmap);}}),toBlob(done:typeof callback){callback=done;encoding.resolve();}};
    vi.stubGlobal('document',{createElement:()=>canvas});vi.stubGlobal('createImageBitmap',async()=>bitmap);
    const controller=new AbortController(),prepared=prepareProjectMedia(heic,limits,decoders.png,decoders.jpeg,decoders.photo,decoders.media,controller.signal),rejected=expect(prepared).rejects.toMatchObject({name:'AbortError'});
    await encoding.promise;controller.abort();await rejected;expect(raster.snapshot().active).toBe(true);expect(raster.snapshot().cpuBytes).toBeGreaterThan(0);expect(closed).not.toHaveBeenCalled();
    callback(null);await raster.decode('retry',async()=>{},()=>{});expect(canvas.width).toBe(0);expect(canvas.height).toBe(0);expect(closed).toHaveBeenCalledOnce();expect(raster.snapshot().cpuBytes).toBe(0);await raster.dispose();
  });
  it('uses the bounded host dimensions for old native-only HEIC thumbnails and original ownership',async()=>{
    const raster=createRasterResources({cpuBytes:20000000,gpuBytes:0}),derive=vi.fn(async()=>new Blob(['derived'],{type:'image/png'}));
    const nodes:{src:string;decode():Promise<void>;removeAttribute(name:string):void;remove():void}[]=[],document={createElement(){const node={src:'',decode:async()=>{},removeAttribute(){this.src='';},remove(){}};nodes.push(node);return node;}} as unknown as Document;
    const dimensions=vi.fn((bytes:Uint8Array,mime:string)=>mediaDisplayDimensions(bytes,mime,limits,raster)),manager=createMediaPreviewResources(document,raster,{derive,dimensions}),source=()=>Promise.resolve(new Blob([heic.slice().buffer],{type:'image/heic'}));
    const thumb=manager.thumbnail('old-unpaired',source);expect((await thumb.ready).type).toBe('image/png');expect(derive).toHaveBeenCalledOnce();expect(dimensions).toHaveBeenCalledOnce();
    const original=manager.original(source);await original.ready;expect(nodes[0]!.src).toMatch(/^blob:/);expect(raster.snapshot().cpuBytes).toBeGreaterThan(0);original.release();expect(nodes[0]!.src).toBe('');
    thumb.release();await manager.dispose();await raster.dispose();expect(raster.snapshot().cpuBytes).toBe(0);
  });
});
