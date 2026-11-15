import {describe,it,expect} from 'vitest';
import {crc32} from 'node:zlib';
import {ZipCrc32} from '../src/projectPackage/zipChecks';

describe('ZIP CRC-32 matches an independent implementation',()=>{
  it('preserves standard vectors, every tail length and unaligned views without modifying input',()=>{
    const standard=new ZipCrc32();standard.update(new TextEncoder().encode('123456789'));expect(standard.digest()).toBe(0xcbf43926);
    expect(new ZipCrc32().digest()).toBe(0);
    for(const length of [...Array.from({length:33},(_,i)=>i),63,64,65,127,128,129,256,1023,65536])for(const offset of [0,1,3,7]){
      const input=Uint8Array.from({length:length+offset+5},(_,i)=>(i*73)^(i>>>5)),bytes=input.subarray(offset,offset+length),kept=input.slice();
      const actual=new ZipCrc32();actual.update(bytes);expect(actual.digest()).toBe(crc32(bytes));expect(input).toEqual(kept);
    }
  });
  it('keeps incremental and intermediate digests exact through empty and arbitrarily split updates',()=>{
    const bytes=Uint8Array.from({length:65553},(_,i)=>i%256);
    for(const step of [1,2,7,8,9,17,65536]){
      const actual=new ZipCrc32();let expected=0;
      for(let at=0;at<bytes.length;at+=step){const part=bytes.subarray(at,Math.min(bytes.length,at+step));actual.update(part);expected=crc32(part,expected);}
      expect(actual.digest()).toBe(expected);actual.update(new Uint8Array());expect(actual.digest()).toBe(crc32(bytes));
      const tail=new Uint8Array([255,0,128]);actual.update(tail);expect(actual.digest()).toBe(crc32(tail,expected));
    }
  });
});
