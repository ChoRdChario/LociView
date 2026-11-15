import {describe,it,expect,vi} from 'vitest';
import {inspectGsPly,inspectGsPlyFile,inspectGsPlyStream} from '../src/projectFiles/gsPly';
import {validationModelFile,prepareValidationModel} from '../src/projectFiles/initialProject';
import {digest} from '../src/projectMetadata/persistence';
import {gsFixture} from './helpers/gsFixture';
const limits={maxFileBytes:64*1024*1024,maxItems:100_000,maxValues:8_000_000,maxJsonBytes:1_000_000,maxPixels:1000};
const partition=(bytes:Uint8Array,step:number,size=bytes.length)=>({size,stream(){let at=0;return new ReadableStream<Uint8Array>({pull(c){if(at===bytes.length){c.close();return;}const end=Math.min(bytes.length,at+step);c.enqueue(bytes.slice(at,end));at=end;}},{highWaterMark:0});}});

describe('01d identical GS inspection over bounded source partitions',()=>{
  it.each([false,true])('cancels the initial native sniff before buffering or handing off a package (ZIP=%s)',async zip=>{
    const bytes=new Uint8Array(100000);if(zip)bytes.set([0x50,0x4b,3,4]);
    const file=new Blob([bytes]),controller=new AbortController(),original=Blob.prototype.arrayBuffer;
    let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
    const reads:number[]=[];
    const spy=vi.spyOn(Blob.prototype,'arrayBuffer').mockImplementation(async function(this:Blob){reads.push(this.size);await held;return original.call(this);});
    try{
      const pending=validationModelFile({label:'input',file},limits,true,undefined,controller.signal);
      const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
      expect(reads).toEqual([65536]);controller.abort();release();await rejected;
      expect(reads).toEqual([65536]);
    }finally{release();spy.mockRestore();}
  });
  it('08a owns the GS-only preparation transform, recomputes new bounds, and never buffers the source',async()=>{
    const row=[0,0,0,0,0,0,.2,0,0,...Array(72).fill(0),0,0,0,0,1,0,0,0],bytes=gsFixture(4,Array.from({length:256},()=>row)),file=new Blob([bytes.slice().buffer]);
    const context={representationToAsset:{translation:[2,3,4],rotationXYZW:[0,0,1,0],uniformScale:2,reflection:'x'}};
    const expected=await inspectGsPly(bytes,limits,context),original=Blob.prototype.arrayBuffer,reads:number[]=[];
    const spy=vi.spyOn(Blob.prototype,'arrayBuffer').mockImplementation(function(this:Blob){reads.push(this.size);if(this.size>65536)throw Error('whole source forbidden');return original.call(this);});
    try{const pending=prepareValidationModel({label:'replacement',file},limits,undefined,undefined,undefined,context);context.representationToAsset.translation[0]=100;
      const model=await pending;expect(model.representation.logicalBoundsAsset).toEqual(expected.bounds);expect((model.representation.representationToAsset as any).translation).toEqual([2,3,4]);
      expect(model.body.file).toBeInstanceOf(Blob);expect(model.body.bytes).toBeUndefined();expect(model.body.ref.digest).toBe(expected.digest);expect(Math.max(...reads)).toBeLessThanOrEqual(65536);
      await expect(prepareValidationModel({label:'not GS',bytes:new Uint8Array([0])},limits,undefined,undefined,undefined,context)).rejects.toThrow('GS');
      await expect(prepareValidationModel({label:'unknown context',file},limits,undefined,undefined,undefined,{...context,logicalBoundsAsset:expected.bounds} as any)).rejects.toThrow();
    }finally{spy.mockRestore();}
  });
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
  it.each([0,4])('keeps complete and split rows identical across owned chunks and producer offsets (SH%s)',async degree=>{
    const sample=gsFixture(degree),source=await inspectGsPly(sample,limits),template=new DataView(sample.buffer,sample.byteOffset+source.headerBytes,source.stride);
    const base=Array.from({length:source.stride/4},(_,i)=>template.getFloat32(i*4,true));
    const rows=Array.from({length:1025},(_,i)=>{const row=[...base];row[0]=(i%7)/8;row[1]=-(i%11)/16;row[2]=(i%13)/32;row[6]=i%2?.25:-.125;if(degree===4)row[9+i%72]=i%2?.05:-.075;return row;});
    const bytes=gsFixture(degree,rows),{bytes:owned,...expected}=await inspectGsPly(bytes,limits);
    expect(expected.digest).toBe(await digest(owned));expect(expected.count).toBe(rows.length);
    for(const step of [17,source.stride-1,source.stride,65536]){
      let at=0;
      const offsetSource={size:bytes.length,stream:()=>new ReadableStream<Uint8Array>({pull(controller){
        if(at===bytes.length){controller.close();return;}const end=Math.min(bytes.length,at+step),storage=new Uint8Array(end-at+14);
        storage.set(bytes.subarray(at,end),7);at=end;controller.enqueue(storage.subarray(7,storage.length-7));
      }},{highWaterMark:0})};
      expect(await inspectGsPlyStream(offsetSource,limits)).toEqual(expected);
    }
  });
  it('checks ignored values and invisible geometry on both complete and split records',async()=>{
    const bytes=gsFixture(4),source=await inspectGsPly(bytes,limits);
    for(const step of [17,65536])for(const [index,value] of [[3,NaN],[80,Infinity],[85,0]]){
      const invalid=bytes.slice(),view=new DataView(invalid.buffer);view.setFloat32(source.headerBytes+81*4,-1000,true);view.setFloat32(source.headerBytes+index!*4,value!,true);
      await expect(inspectGsPlyStream(partition(invalid,step),limits)).rejects.toThrow('読み込めません');
    }
    for(const value of [65536,-65536,65536.0078125,-65536.0078125]){
      const changed=bytes.slice();new DataView(changed.buffer).setFloat32(source.headerBytes+9*4,value,true);
      const complete=await inspectGsPlyStream(partition(changed,65536),limits),split=await inspectGsPlyStream(partition(changed,17),limits);
      expect(complete).toEqual(split);expect(complete.displayIssue).toBe('このGSの色は表示できる範囲を超えています。原本は保持しています。');
    }
    const threshold=new DataView(new ArrayBuffer(4));threshold.setFloat32(0,(1.055*65504**(1/2.4)-.055-.5)/Math.sqrt(1/(4*Math.PI)),true);
    const nearest=threshold.getUint32(0,true);
    for(const delta of [-2,2]){
      threshold.setUint32(0,nearest+delta,true);const changed=bytes.slice();new DataView(changed.buffer).setFloat32(source.headerBytes+6*4,threshold.getFloat32(0,true),true);
      for(const step of [17,65536])expect((await inspectGsPlyStream(partition(changed,step),limits)).displayIssue).toBe(delta<0?null:'このGSの色は表示できる範囲を超えています。原本は保持しています。');
    }
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
