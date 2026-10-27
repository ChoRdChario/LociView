import {describe,it,expect,vi} from 'vitest';
import {inspectGsPly,inspectGsPlyFile,inspectGsPlyStream} from '../src/projectFiles/gsPly';
import {validationModelFile} from '../src/projectFiles/initialProject';
import {digest} from '../src/projectMetadata/persistence';
import {gsFixture} from './helpers/gsFixture';
const limits={maxFileBytes:64*1024*1024,maxItems:100_000,maxValues:8_000_000,maxJsonBytes:1_000_000,maxPixels:1000};
const partition=(bytes:Uint8Array,step:number,size=bytes.length)=>({size,stream(){let at=0;return new ReadableStream<Uint8Array>({pull(c){if(at===bytes.length){c.close();return;}const end=Math.min(bytes.length,at+step);c.enqueue(bytes.slice(at,end));at=end;}},{highWaterMark:0});}});

describe('01d identical GS inspection over bounded source partitions',()=>{
  it('matches all degrees, newline styles, raw digest and literal retained bounds at arbitrary splits',async()=>{
    for(const degree of [0,1,2,3,4])for(const ending of ['\n','\r\n']){
      const bytes=gsFixture(degree,undefined,ending),{bytes:owned,...expected}=await inspectGsPly(bytes,limits);
      expect(expected.digest).toBe(await digest(owned));
      for(const step of [1,3,17,65536])expect(await inspectGsPlyStream(partition(bytes,step),limits)).toEqual(expected);
      const bounds=structuredClone(expected.bounds);bounds.min[0]!-=8*Number.EPSILON*4;
      const context={representationToAsset:{translation:[0,0,0],rotationXYZW:[0,0,0,1],uniformScale:1,reflection:'none'},logicalBoundsAsset:bounds};
      expect((await inspectGsPlyStream(partition(bytes,3),limits,context)).bounds).toEqual(bounds);
    }
  });
  it('captures native source/context before awaits and reads a multi-chunk source without whole arrayBuffer',async()=>{
    const row=[0,-0,0,0,0,0,0,0,0,...Array(72).fill(0),0,0,0,0,1,0,0,0];
    const bytes=gsFixture(4,Array.from({length:256},()=>row)),file=new Blob([bytes.slice().buffer]),expected=await digest(bytes);
    const context={representationToAsset:{translation:[0,0,0],rotationXYZW:[0,0,0,1],uniformScale:1,reflection:'none'}};
    const original=Blob.prototype.arrayBuffer,reads:number[]=[];
    const spy=vi.spyOn(Blob.prototype,'arrayBuffer').mockImplementation(function(this:Blob){reads.push(this.size);if(this.size>65536)throw Error('whole source forbidden');return original.call(this);});
    try{
      const pending=inspectGsPlyFile(file,limits,context);bytes.fill(0);context.representationToAsset.translation[0]=100;
      const model=await pending;expect(model.digest).toBe(expected);expect(model.file.size).toBe(file.size);expect(model.bytes).toBeUndefined();expect(model.count).toBe(256);expect(model.bounds.max[0]).toBeLessThan(5);
      const selected=await validationModelFile({label:'original.ply',file},limits);expect(selected.file).toBeInstanceOf(Blob);expect(reads.length).toBeGreaterThan(1);expect(Math.max(...reads)).toBeLessThanOrEqual(65536);
    }finally{spy.mockRestore();}
  });
  it('passes a captured native ZIP to existing inspectors without whole-body arrayBuffer or filename normalization',async()=>{
    const bytes=new Uint8Array(100000);bytes.set([0x50,0x4b,3,4]);for(let i=4;i<bytes.length;i++)bytes[i]=i%251;
    const expected=bytes.slice(),file=new Blob([bytes.slice().buffer]),original=Blob.prototype.arrayBuffer,reads:number[]=[];
    const spy=vi.spyOn(Blob.prototype,'arrayBuffer').mockImplementation(function(this:Blob){reads.push(this.size);if(this.size>65536)throw Error('whole package forbidden');return original.call(this);});
    try{
      const input={label:'  元の名前.zip  ',file},pending=validationModelFile(input,limits,true);input.file=new Blob([new Uint8Array([0])]);bytes.fill(0);const selected=await pending;
      expect('package' in selected).toBe(true);if(!('package' in selected))throw Error('package');expect(selected.label).toBe('  元の名前.zip  ');expect(new Uint8Array(await original.call(selected.package))).toEqual(expected);expect(reads).toEqual([65536]);
      await expect(validationModelFile({label:'too large',file}, {...limits,maxFileBytes:file.size-1},true)).rejects.toThrow('上限');
    }finally{spy.mockRestore();}
  });
  it('rejects wrong declared/observed length, trailing/truncated data, nonfinite rows and malformed headers',async()=>{
    const bytes=gsFixture(),source=await inspectGsPly(bytes,limits);
    const nan=bytes.slice();new DataView(nan.buffer).setFloat32(source.headerBytes+3*4,NaN,true);
    const header=new TextDecoder().decode(bytes.subarray(0,source.headerBytes));
    const wrong=new TextEncoder().encode(header.replace('f_rest_71','f_rest_70')),schema=new Uint8Array(wrong.length+bytes.length-source.headerBytes);schema.set(wrong);schema.set(bytes.subarray(source.headerBytes),wrong.length);
    for(const bad of [bytes.slice(0,-1),new Uint8Array([...bytes,0]),nan,schema])for(const step of [1,17])await expect(inspectGsPlyStream(partition(bad,step),limits)).rejects.toThrow('読み込めません');
    for(const size of [bytes.length-1,bytes.length+1])await expect(inspectGsPlyStream(partition(bytes,3,size),limits)).rejects.toThrow();
    await expect(inspectGsPlyStream(partition(bytes,17),{...limits,maxValues:88})).rejects.toThrow();
    const cancelled=vi.fn();let reads=0;
    await expect(inspectGsPlyStream({size:1,stream:()=>new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array());},cancel:cancelled},{highWaterMark:0})},limits)).rejects.toThrow();
    expect(reads).toBeLessThanOrEqual(3);expect(cancelled).toHaveBeenCalledOnce();
    await expect(inspectGsPlyStream(partition(new Uint8Array(65537),65537),limits)).rejects.toThrow();
  });
  it('preserves mid-payload I/O and abort errors and never replaces them with cleanup failures',async()=>{
    const bytes=gsFixture(),source=await inspectGsPly(bytes,limits),failure=new Error('input-read-fault');let first=true;
    await expect(inspectGsPlyStream({size:bytes.length,stream:()=>new ReadableStream({pull(c){if(first){first=false;c.enqueue(bytes.slice(0,source.headerBytes+2));}else throw failure;}},{highWaterMark:0})},limits)).rejects.toBe(failure);
    const controller=new AbortController();first=true;
    const aborted=inspectGsPlyStream({size:bytes.length,stream:()=>new ReadableStream({pull(c){if(first){first=false;c.enqueue(bytes.slice(0,source.headerBytes+2));}else controller.abort();}},{highWaterMark:0})},limits,undefined,controller.signal);
    await expect(aborted).rejects.toMatchObject({name:'AbortError'});
    await expect(inspectGsPlyStream({size:bytes.length,stream:()=>new ReadableStream({pull(c){c.enqueue(new Uint8Array([0,10]));},cancel(){throw Error('cleanup-fault');}},{highWaterMark:0})},limits)).rejects.toThrow('読み込めません');
  });
});
