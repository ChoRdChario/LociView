import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { ZipReader } from '@zip.js/zip.js';
import { openVerifiedZipCatalog, writeZipEntries } from '../../src/assets/zipio';
import { writeDirectZip, writeZipWithFalseCrc32, writeZipWithFalseUncompressedSize } from '../helpers/maliciousZip';
const encode = (value: string) => new TextEncoder().encode(value);
const blob = (bytes: Uint8Array) => new Blob([bytes.slice().buffer]);
afterEach(() => vi.restoreAllMocks());

describe('verified streaming foreign ZIP catalog', () => {
  it('does not invoke consumers or body extraction for pre-aborted or queued cancelled reads', async () => {
    const catalog = await openVerifiedZipCatalog(blob(await writeZipEntries([{ path: 'a.bin', data: encode('one') }])));
    const before = new AbortController(), consume = vi.fn(); before.abort();
    try {
      await expect(catalog.withEntry('a.bin', consume, before.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(consume).not.toHaveBeenCalled();
      let release!: () => void, begun!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; }), active = new Promise<void>(resolve => { begun = resolve; });
      const first = catalog.withEntry('a.bin', async stream => { begun(); await gate; const reader = stream.getReader(); try { while (!(await reader.read()).done) {} } finally { reader.releaseLock(); } });
      await active; const queued = new AbortController(), second = catalog.withEntry('a.bin', consume, queued.signal); queued.abort(); release();
      await first; await expect(second).rejects.toMatchObject({ name: 'AbortError' }); expect(consume).not.toHaveBeenCalled();
    } finally { await catalog.dispose(); }
  });
  it('keeps ordered facts, reopens verified bodies and never reads a whole large archive into an array', async () => {
    let seed=0x382193;const data=Uint8Array.from({length:160000},()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed&255;});
    const zip=await writeZipEntries([{path:'model.bin',data},{path:'sheet.csv',data:encode('id,title\n1,record')}]);
    const reads:number[]=[],original=Blob.prototype.arrayBuffer;
    vi.spyOn(Blob.prototype,'arrayBuffer').mockImplementation(function(this:Blob){reads.push(this.size);return original.call(this);});
    const catalog=await openVerifiedZipCatalog(blob(zip));
    try {
      expect(catalog.entries.map(e=>e.path)).toEqual(['model.bin','sheet.csv']);
      expect(catalog.entries[0]).toMatchObject({index:0,byteLength:data.length,digest:createHash('sha256').update(data).digest('hex')});
      expect(catalog.entries[0]!.prefix).toEqual([...data.slice(0,64)]);
      expect(reads).not.toContain(zip.length);expect(Math.max(...reads)).toBeLessThan(zip.length);
      await expect(catalog.readBytes('model.bin',data.length-1)).rejects.toThrow('parser buffer');
      expect(await catalog.readBytes('model.bin',data.length)).toEqual(data);
      await expect(catalog.withEntry('model.bin',async stream=>{const r=stream.getReader();await r.read();r.releaseLock();})).rejects.toThrow('verified EOF');
      expect(new TextDecoder().decode(await catalog.readBytes('sheet.csv',100))).toBe('id,title\n1,record');
    } finally { await catalog.dispose(); }
    await expect(catalog.readBytes('sheet.csv',100)).rejects.toMatchObject({name:'AbortError'});
  });
  it('checks the last source-only CRC and rejects actual-size excess before forwarding scan facts', async () => {
    const entries=[{path:'sheet.csv',data:encode('id,title\n1,record')},{path:'source-only.bin',data:encode('preserved but unused')}];
    await expect(openVerifiedZipCatalog(blob(await writeZipWithFalseCrc32(entries,'source-only.bin')))).rejects.toThrow();
    const observed=vi.fn(),body=encode('body exceeds declared size'),falseSize=await writeZipWithFalseUncompressedSize([{path:'body.bin',data:body}],'body.bin',1-body.length);
    await expect(openVerifiedZipCatalog(blob(falseSize),{observe:observed})).rejects.toThrow();expect(observed).not.toHaveBeenCalled();
  });
  it('cancels a scan and a body read without publishing or poisoning a fresh read', async () => {
    const bytes=await writeZipEntries([{path:'a.bin',data:encode('one')},{path:'b.bin',data:encode('two')}]),scan=new AbortController();
    await expect(openVerifiedZipCatalog(blob(bytes),{signal:scan.signal,observe(){scan.abort();}})).rejects.toMatchObject({name:'AbortError'});
    const catalog=await openVerifiedZipCatalog(blob(bytes)),operation=new AbortController();
    try {
      await expect(catalog.withEntry('a.bin',async stream=>{const r=stream.getReader();try{await r.read();operation.abort();await r.read();}finally{r.releaseLock();}},operation.signal)).rejects.toMatchObject({name:'AbortError'});
      expect(new TextDecoder().decode(await catalog.readBytes('b.bin',10))).toBe('two');
    } finally { await catalog.dispose(); }
  });
  it('keeps EOF behind completion of the extraction verifier', async () => {
    const bytes=await writeZipEntries([{path:'a.bin',data:encode('one')}]),real=ZipReader.prototype.getEntries;
    let calls=0,unblock!:()=>void;const gate=new Promise<void>(resolve=>{unblock=resolve;});
    vi.spyOn(ZipReader.prototype,'getEntries').mockImplementation(async function(this:ZipReader<unknown>,...args){
      const entries=await real.apply(this,args);
      for(const entry of entries)if(!entry.directory){const get=entry.getData.bind(entry);entry.getData=(async(...input:Parameters<typeof get>)=>{const result=await get(...input);if(++calls>1)await gate;return result;}) as typeof entry.getData;}
      return entries;
    });
    const catalog=await openVerifiedZipCatalog(blob(bytes));let received!:()=>void,finished=false;const first=new Promise<void>(resolve=>{received=resolve;});
    const reading=catalog.withEntry('a.bin',async stream=>{const r=stream.getReader();try{expect((await r.read()).value).toEqual(encode('one'));received();expect((await r.read()).done).toBe(true);finished=true;}finally{r.releaseLock();}});
    try { await first;await Promise.resolve();expect(finished).toBe(false);unblock();await reading;expect(finished).toBe(true); }
    finally { unblock();await catalog.dispose(); }
  });
  it('preserves namespace and nested-content guards and explicitly refuses encryption', async () => {
    for(const entries of [[{path:'A.bin',data:encode('a')},{path:'a.bin',data:encode('b')}],[{path:'../bad',data:encode('a')}],[{path:'body.bin',data:new Uint8Array([0x50,0x4b,3,4])}],[{path:'secret',data:encode('secret'),options:{password:'secret'}}]])
      await expect(openVerifiedZipCatalog(blob(await writeDirectZip(entries)))).rejects.toThrow();
  });
});
