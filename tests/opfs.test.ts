import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryFS } from '../src/platform/fs';
import { OpfsFS } from '../src/platform/opfs';

// Read-only directory doubles exercise the production OPFS traversal, not disk timing.
class Directory {
  readonly kind = 'directory';
  readonly children = new Map<string, Directory | { kind: 'file' }>();
  error?: Error;
  constructor(readonly path: string, private readonly visited: string[]) {}
  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    this.visited.push(this.path); if (this.error) throw this.error;
    for (const [name, handle] of this.children) yield [name, handle as FileSystemHandle];
  }
  add(path: string): void {
    const [name, ...tail] = path.split('/');
    if (!tail.length) { this.children.set(name!, { kind: 'file' }); return; }
    let next = this.children.get(name!);
    if (!(next instanceof Directory)) { next = new Directory(`${this.path}${name}/`, this.visited); this.children.set(name!, next); }
    next.add(tail.join('/'));
  }
}
afterEach(() => vi.unstubAllGlobals());
async function setup(paths: string[]) {
  const visited: string[] = [], root = new Directory('', visited), memory = new MemoryFS();
  for (const path of paths) { root.add(path); await memory.writeText(path, 'synthetic'); }
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  return { root, visited, memory, fs: await OpfsFS.open() };
}
describe('OPFS scoped fresh listing', () => {
  const paths = ['root.json', 'projects/a/file.json', 'projects/a/logs/one.json', 'projects/a/logs/two.json',
    'projects/ab/other.json', 'projects/a-file.json', 'other/deep/file.json'];
  it.each(['', 'projects', 'projects/a', 'projects/a/', 'projects/a/log', 'projects/a/logs/',
    'projects/a/file.json', 'root', 'absent/', 'projects//', '/projects', 'projects/../', '/',
    'root.json/', 'root.json/nested/', 'projects/a/file.json/', 'projects/a/file.json/deep/',
    'projects/absent/deep/', 'projects/a/logs//', './projects/', 'projects\\a/'])('matches MemoryFS lexical prefix %j', async prefix => {
    const f = await setup(paths);
    expect(await f.fs.list(prefix)).toEqual(await f.memory.list(prefix));
  });
  it('visits only the relevant branches regardless of old project count, without caching entries', async () => {
    const old = Array.from({ length: 100 }, (_, i) => `retired/run-${i}/journal/entry/file.json`);
    const f = await setup([...paths, ...old]);
    await f.fs.list(''); const fullTraversal = f.visited.length; f.visited.length = 0;
    expect(fullTraversal).toBe(308);
    expect(await f.fs.list('projects/a/logs/')).toEqual(['projects/a/logs/one.json', 'projects/a/logs/two.json']);
    expect(f.visited).toEqual(['', 'projects/', 'projects/a/', 'projects/a/logs/']);
    const projects = f.root.children.get('projects') as Directory, a = projects.children.get('a') as Directory;
    const logs = a.children.get('logs') as Directory;
    logs.children.delete('one.json'); f.root.add('projects/a/logs/new.json'); f.visited.length = 0;
    expect(await f.fs.list('projects/a/logs/')).toEqual(['projects/a/logs/new.json', 'projects/a/logs/two.json']);
    expect(f.visited).toHaveLength(4);
  });
  it('resolves a replaced directory afresh rather than retaining a previous handle', async () => {
    const f = await setup(['projects/a/old.json']);
    expect(await f.fs.list('projects/a/')).toEqual(['projects/a/old.json']);
    const projects = f.root.children.get('projects') as Directory;
    projects.children.delete('a');
    expect(await f.fs.list('projects/a/')).toEqual([]);
    f.root.add('projects/a/new.json');
    expect(await f.fs.list('projects/a/')).toEqual(['projects/a/new.json']);
  });
  it('propagates relevant storage failures instead of reporting an empty or cached result', async () => {
    const f = await setup(paths), other = f.root.children.get('other') as Directory;
    const error = new DOMException('Storage unavailable', 'NotReadableError'); other.error = error;
    expect(await f.fs.list('projects/a/')).toEqual(await f.memory.list('projects/a/'));
    await expect(f.fs.list('other/')).rejects.toBe(error);
    await expect(f.fs.list('')).rejects.toBe(error);
  });
  it('overlaps independent native waits with one bound across wide and deep branches', async () => {
    const keys = Array.from({ length: 12 }, (_, i) => `branch-${i}/nested/deep/one.json`);
    const f = await setup(keys); let active = 0, maximum = 0;
    const wrap = (dir: Directory) => {
      const entries = dir.entries.bind(dir);
      dir.entries = () => {
        const iterator = entries(); let ownActive = false;
        return { [Symbol.asyncIterator]() { return this; },
          async next() {
            expect(ownActive).toBe(false); ownActive = true; active++; maximum = Math.max(maximum, active);
            try { await new Promise(resolve => setTimeout(resolve, 0)); return await iterator.next(); }
            finally { active--; ownActive = false; }
          }, return: () => iterator.return?.(undefined) ?? Promise.resolve({ done: true as const, value: undefined }),
        };
      };
      for (const child of dir.children.values()) if (child instanceof Directory) wrap(child);
    };
    wrap(f.root);
    expect(await f.fs.list('')).toEqual(await f.memory.list(''));
    expect(maximum).toBeGreaterThan(1); expect(maximum).toBeLessThanOrEqual(4); expect(active).toBe(0);
  });
  it.each([false, true])('drains a held sibling and preserves the native failure (closing failure: %s)', async closeFails => {
    const f = await setup(['held/file.json', 'broken/file.json', 'later/file.json']);
    const held = f.root.children.get('held') as Directory, broken = f.root.children.get('broken') as Directory;
    let release!: () => void, noticed!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; }), observed = new Promise<void>(resolve => { noticed = resolve; });
    const primary = new DOMException('Cannot enumerate', 'NotReadableError'), secondary = Error('Cannot close');
    const close = vi.fn(async () => { if (closeFails) throw secondary; return { done: true as const, value: undefined }; });
    held.entries = () => ({ [Symbol.asyncIterator]() { return this; }, async next() { await hold; return { done: false as const, value: ['file.json', { kind: 'file' }] as [string, FileSystemHandle] }; }, return: close });
    broken.entries = () => ({ [Symbol.asyncIterator]() { return this; }, async next() { noticed(); throw primary; } });
    let settled = false;
    const result = f.fs.list('').then(value => { settled = true; return value; }, error => { settled = true; return error; });
    await observed; await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false); expect(close).not.toHaveBeenCalled();
    release(); expect(await result).toBe(primary); expect(close).toHaveBeenCalledOnce();
    expect(f.visited).not.toContain('later/');
  });
});

// Native sink doubles verify exact bytes and failure ownership, not disk latency.
async function streamSink() {
  const bytes: Uint8Array[] = [];
  const sink = { write: vi.fn(async (chunk: Uint8Array) => { bytes.push(chunk.slice()); }),
    close: vi.fn(async () => {}), abort: vi.fn(async (_error: unknown) => {}) };
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ getFileHandle: async () => ({ createWritable: async () => sink }) }) } });
  return { fs: await OpfsFS.open(), sink, bytes };
}
function sourceChunks(chunks: Uint8Array[]) {
  let at = 0;
  const reader = { read: vi.fn(async () => at < chunks.length ? { done: false, value: chunks[at++]! } : { done: true, value: undefined }),
    cancel: vi.fn(async (_error: unknown) => {}), releaseLock: vi.fn() };
  return { reader, input: { getReader: () => reader } as unknown as ReadableStream<Uint8Array> };
}
const joinBytes = (chunks: Uint8Array[]) => {
  const result = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0)); let at = 0;
  for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; } return result;
};
describe('OPFS bounded stream writes', () => {
  it.each([0, 1, 200])('coalesces %i tiny chunks, flushes the exact tail before close and releases the reader', async count => {
    const f = await streamSink(), chunks = Array.from({ length: count }, (_, i) => new Uint8Array(37).fill(i % 256));
    const source = sourceChunks([new Uint8Array(0), ...chunks, new Uint8Array(0)]);
    f.sink.close.mockImplementation(async () => { expect(joinBytes(f.bytes)).toEqual(joinBytes(chunks)); });
    await f.fs.writeStream('artifact.zip', source.input);
    expect(f.sink.write).toHaveBeenCalledTimes(count ? 1 : 0); expect(f.sink.close).toHaveBeenCalledOnce();
    expect(f.sink.abort).not.toHaveBeenCalled(); expect(source.reader.releaseLock).toHaveBeenCalledOnce();
  });
  it('preserves order across buffer boundaries and existing large input chunks', async () => {
    const f = await streamSink(), chunks = [30_000, 30_000, 10_000, 65_536, 131_075, 3].map((n, i) => new Uint8Array(n).fill(i + 1));
    await f.fs.writeStream('artifact.zip', sourceChunks(chunks).input);
    expect(joinBytes(f.bytes)).toEqual(joinBytes(chunks));
    expect(f.bytes.map(b => b.length)).toEqual([60_000, 10_000, 65_536, 131_075, 3]);
  });
  it('owns the entire next chunk before a delayed flush and preserves backpressure', async () => {
    const f = await streamSink(), next = new Uint8Array(3).fill(2), source = sourceChunks([new Uint8Array(65_535).fill(1), next, new Uint8Array([3])]);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(r => { entered = r; }), held = new Promise<void>(r => { release = r; });
    f.sink.write.mockImplementationOnce(async chunk => { entered(); await held; f.bytes.push(chunk.slice()); });
    const pending = f.fs.writeStream('artifact.zip', source.input);
    await started; expect(source.reader.read).toHaveBeenCalledTimes(2); expect(f.sink.write).toHaveBeenCalledOnce();
    next.fill(9); release(); await pending;
    expect(f.bytes[0]).toEqual(new Uint8Array(65_535).fill(1)); expect(f.bytes[1]).toEqual(new Uint8Array([2, 2, 2, 3]));
  });
  it.each(['source', 'midflush', 'tail', 'close'] as const)('preserves the original %s failure despite cancel/abort failures', async phase => {
    const f = await streamSink(), source = sourceChunks(phase === 'midflush' ? [new Uint8Array(65_536)] : [new Uint8Array([1, 2, 3])]);
    const failure = Error(`original ${phase}`);
    if (phase === 'source') source.reader.read.mockRejectedValueOnce(failure);
    else if (phase === 'close') f.sink.close.mockRejectedValueOnce(failure);
    else f.sink.write.mockRejectedValueOnce(failure);
    source.reader.cancel.mockRejectedValueOnce(Error('secondary cancel')); f.sink.abort.mockRejectedValueOnce(Error('secondary abort'));
    await expect(f.fs.writeStream('artifact.zip', source.input)).rejects.toBe(failure);
    expect(source.reader.cancel).toHaveBeenCalledWith(failure); expect(f.sink.abort).toHaveBeenCalledWith(failure);
    expect(source.reader.releaseLock).toHaveBeenCalledOnce(); expect(f.sink.close).toHaveBeenCalledTimes(phase === 'close' ? 1 : 0);
  });
});

// Creating a native handle materializes a zero-byte entry before writer acquisition.
// A MemoryFS write rejection alone cannot model this failure.
async function textAcquisition(seed?:string){
  let present=seed!==undefined,bytes=seed??'',next='',opening:(()=>Promise<void>)|undefined;
  const handle={kind:'file',isSameEntry:vi.fn(async(other:unknown)=>other===handle),getFile:vi.fn(async()=>new File([bytes],'receipt.json')),
    createWritable:vi.fn(async()=>{await opening?.();return sink;})};
  const sink={write:vi.fn(async(text:string)=>{next=text;}),close:vi.fn(async()=>{bytes=next;}),abort:vi.fn(async()=>{})};
  const directory={getFileHandle:vi.fn(async(_name:string,options?:{create?:boolean})=>{if(!present&&!options?.create)throw new DOMException('missing','NotFoundError');present=true;return handle;}),
    removeEntry:vi.fn(async()=>{present=false;bytes='';})};
  vi.stubGlobal('navigator',{storage:{getDirectory:async()=>directory}});
  return {fs:await OpfsFS.open(),handle,sink,directory,owned:{assertOwned:vi.fn(()=>{})},setOpening(value:typeof opening){opening=value;},setBytes(text:string){bytes=text;},get bytes(){return bytes;},get present(){return present;}};
}
describe('exclusive never-written receipt acquisition',()=>{
  it('removes only its new empty entry after native open quota, then retries exact bytes',async()=>{
    const f=await textAcquisition(),quota=new DOMException('full','QuotaExceededError');f.setOpening(async()=>{throw quota;});
    await expect(f.fs.writeText('receipt.json','{"ready":true}',f.owned)).rejects.toBe(quota);expect(f.present).toBe(false);expect(f.sink.write).not.toHaveBeenCalled();expect(f.directory.removeEntry).toHaveBeenCalledOnce();
    f.setOpening(undefined);await f.fs.writeText('receipt.json','{"ready":true}',f.owned);expect(f.bytes).toBe('{"ready":true}');expect(f.sink.close).toHaveBeenCalledOnce();
  });
  it.each(['','{"retained":true}'])('preserves an existing entry %j without opening or deleting it',async original=>{
    const f=await textAcquisition(original);await expect(f.fs.writeText('receipt.json','{}',f.owned)).rejects.toThrow('already exists');expect(f.bytes).toBe(original);expect(f.handle.createWritable).not.toHaveBeenCalled();expect(f.directory.removeEntry).not.toHaveBeenCalled();
  });
  it('leaves raw/default acquisition failures unchanged',async()=>{
    const f=await textAcquisition(),quota=new DOMException('full','QuotaExceededError');f.setOpening(async()=>{throw quota;});await expect(f.fs.writeText('receipt.json','{}')).rejects.toBe(quota);expect(f.present).toBe(true);expect(f.directory.removeEntry).not.toHaveBeenCalled();
  });
  it.each(['nonempty','different','unreadable','ownership'] as const)('refuses cleanup when %s makes ownership uncertain',async fault=>{
    const f=await textAcquisition(),quota=new DOMException('full','QuotaExceededError'),secondary=Error(fault);
    f.setOpening(async()=>{if(fault==='nonempty')f.setBytes('changed');if(fault==='different')f.handle.isSameEntry.mockResolvedValue(false);if(fault==='unreadable')f.handle.getFile.mockRejectedValue(secondary);if(fault==='ownership')f.owned.assertOwned.mockImplementation(()=>{throw secondary;});throw quota;});
    const error=await f.fs.writeText('receipt.json','{}',f.owned).catch(e=>e);expect(error).toBeInstanceOf(AggregateError);expect(error.errors[0]).toBe(quota);expect(f.directory.removeEntry).not.toHaveBeenCalled();expect(f.present).toBe(true);
  });
  it('retains quota and denied removal together',async()=>{
    const f=await textAcquisition(),quota=new DOMException('full','QuotaExceededError'),denied=new DOMException('denied','NotAllowedError');f.setOpening(async()=>{throw quota;});f.directory.removeEntry.mockRejectedValue(denied);
    const error=await f.fs.writeText('receipt.json','{}',f.owned).catch(e=>e);expect(error.errors).toEqual([quota,denied]);expect(f.present).toBe(true);
  });
  it.each(['write','close'] as const)('retains an acquired writer %s failure for ordinary strict recovery',async phase=>{
    const f=await textAcquisition(),error=Error(phase);f.sink[phase].mockRejectedValue(error);await expect(f.fs.writeText('receipt.json','{}',f.owned)).rejects.toBe(error);expect(f.present).toBe(true);expect(f.directory.removeEntry).not.toHaveBeenCalled();
  });
});
