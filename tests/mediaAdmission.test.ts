import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { timedMediaStructure } from '../src/projectFiles/mediaContainer';
import { inspectProjectMedia } from '../src/projectFiles/media';
import { heicStructure } from '../src/projectFiles/heic';
import { avcSample } from '../src/projectFiles/avcMedia';

const limits={maxFileBytes:1_000_000,maxJsonBytes:100_000,maxItems:10000,maxValues:2_000_000,maxPixels:10000};
const fixture=(name:string)=>new Uint8Array(readFileSync(new URL(`./fixtures/daily-media/${name}`,import.meta.url)));
/** Two coded items sharing owned data; only an explicit thumbnail relation makes this one still. */
function relatedHeic(thumbnail:boolean){
  const input=Buffer.from(fixture('owned-still.heic')),cat=(...b:Buffer[])=>Buffer.concat(b),u16=(n:number)=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b;},u32=(n:number)=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;},box=(type:string,...body:Buffer[])=>{const b=cat(...body);return cat(u32(b.length+8),Buffer.from(type),b);},full=(type:string,...body:Buffer[])=>box(type,Buffer.alloc(4),...body);
  const chunks=(b:Buffer,at=0)=>{const result=new Map<string,Buffer>();while(at<b.length){const size=b.readUInt32BE(at);result.set(b.toString('ascii',at+4,at+8),b.subarray(at,at+size));at+=size;}return result;},top=chunks(input),children=chunks(top.get('meta')!,12),info=children.get('iinf')!,entry=info.subarray(14),second=Buffer.from(entry);second.writeUInt16BE(2,12);
  const ipco=chunks(children.get('iprp')!,8).get('ipco')!,iprp=box('iprp',ipco,full('ipma',u32(2),u16(1),Buffer.from([2,1,130]),u16(2),Buffer.from([2,1,130]))),data=top.get('mdat')!.subarray(8);
  const meta=(offset:number)=>full('meta',children.get('hdlr')!,children.get('pitm')!,full('iinf',u16(2),entry,second),full('iloc',Buffer.from([0x44,0]),u16(2),...[1,2].map(id=>cat(u16(id),u16(0),u16(1),u32(offset),u32(data.length)))),iprp,...(thumbnail?[full('iref',box('thmb',u16(2),u16(1),u16(1)))]:[]));
  const ftyp=top.get('ftyp')!;return new Uint8Array(cat(ftyp,meta(ftyp.length+meta(0).length+8),box('mdat',data)));
}
describe('approved original media admission',()=>{
  it('bounds FTYP brand counts before allocating or decoding, accepting a later compatible brand',async()=>{
    const input=Buffer.from(fixture('owned-video.mp4')),size=input.readUInt32BE(0),padding=Buffer.alloc(2000*4,'z'),bytes=Buffer.concat([input.subarray(0,size),padding,input.subarray(size)]);bytes.writeUInt32BE(size+padding.length,0);bytes.write('zzzz',8);for(let p=16;p<size+padding.length;p+=4)bytes.write('zzzz',p);bytes.write('mp42',size+padding.length-4);
    for(let p=bytes.indexOf('stco');p>=0;p=bytes.indexOf('stco',p+4)){const n=bytes.readUInt32BE(p+8);for(let i=0;i<n;i++)bytes.writeUInt32BE(bytes.readUInt32BE(p+12+i*4)+padding.length,p+12+i*4);}
    expect(timedMediaStructure(bytes,limits).mediaKind).toBe('video');const timed=vi.fn();await expect(inspectProjectMedia(bytes,{...limits,maxItems:1000},undefined,undefined,undefined,{timed})).rejects.toThrow();expect(timed).not.toHaveBeenCalled();
  });
  it('charges repeated parameter-set comparisons and mdat range searches to existing work ceilings',()=>{
    const body=Uint8Array.from([0x67,1,2,3,4,5,6,7]),sample=Uint8Array.from([8,...body]),sets=Array.from({length:100},()=>Uint8Array.from([...body.slice(0,-1),8]));sets.push(body);
    let work=0;expect(()=>avcSample(sample,0,sample.length,1,sets,n=>{work+=n??1;if(work>100)throw Error('work');})).toThrow('work');avcSample(sample,0,sample.length,1,sets,()=>{});
    const input=Buffer.from(fixture('owned-video.mp4')),at=input.indexOf('mdat')-4,padding=Buffer.alloc(2000*8);for(let i=0;i<2000;i++){padding.writeUInt32BE(8,i*8);padding.write('mdat',i*8+4);}
    for(let p=input.indexOf('stco');p>=0;p=input.indexOf('stco',p+4)){const n=input.readUInt32BE(p+8);for(let i=0;i<n;i++)input.writeUInt32BE(input.readUInt32BE(p+12+i*4)+padding.length,p+12+i*4);}
    const many=new Uint8Array(Buffer.concat([input.subarray(0,at),padding,input.subarray(at)]));expect(timedMediaStructure(many,limits).mediaKind).toBe('video');expect(()=>timedMediaStructure(many,{...limits,maxValues:60000})).toThrow();
  });
  it('allows a related thumbnail while refusing an unrelated second HEIC still',()=>{expect(heicStructure(relatedHeic(true),limits)).toEqual({width:96,height:64});expect(()=>heicStructure(relatedHeic(false),limits)).toThrow();});
  it('bounds a generated single-still HEIC before native decode, retaining originals on unsupported browsers',async()=>{
    const bytes=fixture('owned-still.heic'),original=bytes.slice();expect(heicStructure(bytes,limits)).toEqual({width:96,height:64});const close=vi.fn(),heic=vi.fn(async()=>({width:96,height:64,close}));
    await expect(inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{heic})).resolves.toEqual({mediaKind:'image',mediaType:'image/heic'});expect(close).toHaveBeenCalledOnce();expect(bytes).toEqual(original);
    await expect(inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{heic:async()=>{throw Error('native unsupported');}})).rejects.toThrow('端末で別のJPEG');expect(bytes).toEqual(original);
    heic.mockClear();await expect(inspectProjectMedia(bytes,{...limits,maxPixels:100},undefined,undefined,undefined,{heic})).rejects.toThrow();expect(heic).not.toHaveBeenCalled();
  });
  it.each([['owned-video.mp4','video','video/mp4'],['owned-audio.m4a','audio','audio/mp4'],['owned-audio.mp3','audio','audio/mpeg']])('inspects complete owned %s independently of file labels',async(name,kind,mime)=>{
    const bytes=fixture(name!),original=bytes.slice(),shape=timedMediaStructure(bytes,limits);expect(shape).toMatchObject({mediaKind:kind,mediaType:mime});expect(shape.duration).toBeGreaterThan(.9);
    const decoder=vi.fn(async()=>({duration:shape.duration,...(kind==='video'?{width:96,height:64}:{})}));
    expect(await inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{timed:decoder})).toEqual({mediaKind:kind,mediaType:mime});expect(decoder).toHaveBeenCalledOnce();expect(bytes).toEqual(original);
  });
  it('rejects incomplete framing and unknown bytes before calling any decoder',async()=>{
    const timed=vi.fn();for(const bytes of [new TextEncoder().encode('<html>not a video</html>'),new TextEncoder().encode('#EXTM3U\nhttps://invalid.example/a'),fixture('owned-video.mp4').slice(0,-1),fixture('owned-audio.mp3').slice(0,-1)])await expect(inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{timed})).rejects.toThrow();expect(timed).not.toHaveBeenCalled();
  });
  it('requires initial decoded data and protects per-file pixel/work budgets',async()=>{
    const bytes=fixture('owned-video.mp4'),timed=vi.fn(async()=>({duration:1,width:96,height:64}));
    await expect(inspectProjectMedia(bytes,{...limits,maxPixels:100},undefined,undefined,undefined,{timed})).rejects.toThrow();expect(timed).not.toHaveBeenCalled();
    await expect(inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{timed:async()=>{throw Error('codec unavailable');}})).rejects.toThrow('codec unavailable');
    await expect(inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{timed:async()=>({duration:1,width:1,height:1})})).rejects.toThrow();
  });
  it('rejects external MP4 references, out-of-body sample offsets, changed codecs and disguised HEIC dimensions before decode',async()=>{
    const timed=vi.fn(),heic=vi.fn();
    for(const [tag,offset,value]of [['url ',4,0],['stco',12,0],['avcC',5,110]] as const){const bytes=fixture('owned-video.mp4'),p=Buffer.from(bytes).indexOf(tag);expect(p).toBeGreaterThan(0);if(tag==='avcC')bytes[p+offset]=value;else new DataView(bytes.buffer).setUint32(p+offset,value);await expect(inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{timed})).rejects.toThrow();}
    const bytes=fixture('owned-still.heic'),p=Buffer.from(bytes).indexOf('ispe');new DataView(bytes.buffer).setUint32(p+8,1);await expect(inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{heic})).rejects.toThrow();expect(timed).not.toHaveBeenCalled();expect(heic).not.toHaveBeenCalled();
  });
  it('rejects a HEVC parameter-set header hidden under another declared array type',async()=>{
    const bytes=fixture('owned-still.heic'),p=Buffer.from(bytes).indexOf('hvcC'),heic=vi.fn();bytes[p+4+23+5]=0x42;
    await expect(inspectProjectMedia(bytes,limits,undefined,undefined,undefined,{heic})).rejects.toThrow();expect(heic).not.toHaveBeenCalled();
  });
  it('bounds native HEIC waits and closes a bitmap that completes after timeout',async()=>{
    vi.useFakeTimers();try{let finish!:(bitmap:{width:number;height:number;close():void})=>void;const close=vi.fn(),pending=inspectProjectMedia(fixture('owned-still.heic'),limits,undefined,undefined,undefined,{heic:()=>new Promise(r=>{finish=r;})});const rejected=expect(pending).rejects.toThrow('端末で別のJPEG');await vi.advanceTimersByTimeAsync(20000);await rejected;finish({width:96,height:64,close});await Promise.resolve();await Promise.resolve();expect(close).toHaveBeenCalledOnce();}finally{vi.useRealTimers();}
  });
  it('cancels a native HEIC wait immediately and releases the late bitmap',async()=>{
    const owner=new AbortController(),close=vi.fn();let finish!:(bitmap:{width:number;height:number;close():void})=>void;
    const pending=inspectProjectMedia(fixture('owned-still.heic'),limits,undefined,undefined,undefined,{heic:()=>new Promise(r=>{finish=r;})},owner.signal),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await Promise.resolve();owner.abort();await rejected;finish({width:96,height:64,close});await Promise.resolve();await Promise.resolve();expect(close).toHaveBeenCalledOnce();
  });
  it('releases a bitmap when cancellation and decode completion compete in one checkpoint',async()=>{
    const owner=new AbortController(),close=vi.fn();let finish!:(bitmap:{width:number;height:number;close():void})=>void;
    const pending=inspectProjectMedia(fixture('owned-still.heic'),limits,undefined,undefined,undefined,{heic:()=>new Promise(r=>{finish=r;})},owner.signal),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await Promise.resolve();queueMicrotask(()=>owner.abort());finish({width:96,height:64,close});await rejected;await Promise.resolve();await Promise.resolve();expect(close).toHaveBeenCalledOnce();
  });
});
