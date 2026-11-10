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

// Locator-style doubles reopen the current entry on every getFileHandle/getFile.
async function readParentFixture() {
  const directories = new Set(['', 'deep', 'deep/parent', 'other', 'other/parent']);
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const bytes = (value: string | ArrayBuffer | Uint8Array) => typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value instanceof ArrayBuffer ? value.slice(0) : value);
  const put = (path: string, value: string | Uint8Array) => { files.set(path, bytes(value)); };
  put('deep/parent/a', '1234'); put('other/parent/a', 'other'); put('scratch', 'start');
  const missing = () => new DOMException('missing', 'NotFoundError');
  const file = vi.fn(async (path: string) => { const data = files.get(path); if (!data) throw missing(); return new File([new Uint8Array(data)], 'data'); });
  const fileHandle = vi.fn(async (parent: string, name: string, create: boolean) => {
    if (!directories.has(parent)) throw missing();
    const path = parent ? `${parent}/${name}` : name;
    if (!files.has(path)) { if (!create) throw missing(); put(path, ''); }
    return { kind: 'file', getFile: () => file(path), createWritable: async () => {
      let pending = files.get(path)!.slice();
      return { write: async (value: string | Uint8Array | ArrayBuffer | { type: string; position: number; data: string | ArrayBuffer }) => {
        if (typeof value === 'object' && 'type' in value) {
          const data = bytes(value.data), next = new Uint8Array(Math.max(pending.length, value.position + data.length)); next.set(pending); next.set(data, value.position); pending = next;
        } else pending = bytes(value);
      }, close: async () => { files.set(path, pending); }, abort: async () => {} };
    } };
  });
  const directory = vi.fn(async (parent: string, name: string, create: boolean): Promise<ReturnType<typeof handle>> => {
    if (!directories.has(parent)) throw missing();
    const path = parent ? `${parent}/${name}` : name;
    if (!directories.has(path)) { if (!create) throw missing(); directories.add(path); }
    return handle(path);
  });
  function handle(path: string) {
    return { path, kind: 'directory', getDirectoryHandle: (name: string, options?: { create?: boolean }) => directory(path, name, !!options?.create),
      getFileHandle: (name: string, options?: { create?: boolean }) => fileHandle(path, name, !!options?.create),
      removeEntry: async (name: string) => { files.delete(path ? `${path}/${name}` : name); } };
  }
  const root = { ...handle(''), resolve: vi.fn(async (dir: unknown): Promise<string[] | null> => (dir as { path: string }).path.split('/').filter(Boolean)) };
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  return { fs: await OpfsFS.open(), root, put, files, directories, directory, fileHandle, file };
}

describe('OPFS one readonly parent hint with fresh file lookup', () => {
  it('gets fresh handles and Files for all four reads while shortening repeated parent lookup', async () => {
    const f = await readParentFixture();
    expect(await f.fs.readText('deep/parent/a')).toBe('1234');
    f.put('deep/parent/a', '5678');
    expect(await f.fs.readBytes('deep/parent/a')).toEqual(new TextEncoder().encode('5678'));
    expect(await f.fs.readBytesFrom('deep/parent/a', 2)).toEqual({ size: 4, data: new TextEncoder().encode('78') });
    const view = await f.fs.readStream('deep/parent/a');
    expect(await new Response(view!.stream()).text()).toBe('5678');
    expect(f.fileHandle).toHaveBeenCalledTimes(4); expect(f.file).toHaveBeenCalledTimes(4);
    expect(f.directory).toHaveBeenCalledTimes(2); expect(f.root.resolve).toHaveBeenCalledTimes(3);
  });
  it('keeps root files and unsupported resolve on the original path', async () => {
    const f = await readParentFixture();
    await f.fs.readText('scratch'); await f.fs.readText('scratch'); expect(f.root.resolve).not.toHaveBeenCalled();
    Object.defineProperty(f.root, 'resolve', { value: undefined });
    await f.fs.readText('deep/parent/a'); await f.fs.readText('deep/parent/a');
    expect(f.directory).toHaveBeenCalledTimes(4); expect(f.file).toHaveBeenCalledTimes(4);
  });
  it.each([{ relative: null }, { relative: ['wrong', 'parent'] }])('discards a mismatched locator $relative and traverses the requested path', async ({ relative }) => {
    const f = await readParentFixture(); await f.fs.readText('deep/parent/a');
    f.root.resolve.mockResolvedValueOnce(relative); f.put('deep/parent/a', 'current');
    expect(await f.fs.readText('deep/parent/a')).toBe('current'); expect(f.directory).toHaveBeenCalledTimes(4);
  });
  it('observes removed and same-name recreated parents without retaining old bytes', async () => {
    const f = await readParentFixture(); await f.fs.readText('deep/parent/a');
    f.directories.delete('deep/parent'); f.files.delete('deep/parent/a');
    expect(await f.fs.readText('deep/parent/a')).toBeNull();
    f.directories.add('deep/parent'); f.put('deep/parent/a', 'recreated');
    expect(await f.fs.readText('deep/parent/a')).toBe('recreated');
  });
  it('discards the old parent when a different requested parent is missing', async () => {
    const f = await readParentFixture(); await f.fs.readText('deep/parent/a');
    expect(await f.fs.readText('other/missing/a')).toBeNull(); const before = f.directory.mock.calls.length;
    await f.fs.readText('deep/parent/a'); expect(f.directory.mock.calls.length - before).toBe(2); expect(f.root.resolve).not.toHaveBeenCalled();
  });
  it('discards a warm hint when resolve becomes unavailable instead of reviving it later', async () => {
    const f = await readParentFixture(); await f.fs.readText('deep/parent/a'); const resolve = f.root.resolve;
    Object.defineProperty(f.root, 'resolve', { configurable: true, value: undefined });
    await f.fs.readText('deep/parent/a'); Object.defineProperty(f.root, 'resolve', { value: resolve });
    const before = f.directory.mock.calls.length; await f.fs.readText('deep/parent/a');
    expect(f.directory.mock.calls.length - before).toBe(2); expect(resolve).not.toHaveBeenCalled();
  });
  it('retains the original path when the optional resolve API reports unsupported', async () => {
    const f = await readParentFixture(); await f.fs.readText('deep/parent/a');
    f.root.resolve.mockRejectedValue(new DOMException('unsupported', 'NotSupportedError'));
    expect(await f.fs.readText('deep/parent/a')).toBe('1234'); expect(await f.fs.readText('deep/parent/a')).toBe('1234');
    expect(f.root.resolve).toHaveBeenCalledOnce(); expect(f.directory).toHaveBeenCalledTimes(6);
  });
  it('refuses unsupported file-handle access instead of treating it as an optional resolve failure', async () => {
    const f = await readParentFixture(), failure = new DOMException('unsupported file operation', 'NotSupportedError');
    await f.fs.readText('deep/parent/a'); f.fileHandle.mockRejectedValueOnce(failure);
    await expect(f.fs.readText('deep/parent/a')).rejects.toBe(failure); expect(f.fileHandle).toHaveBeenCalledTimes(2); expect(f.directory).toHaveBeenCalledTimes(2);
  });
  it.each(['resolve', 'file-handle'] as const)('refuses %s permission failures without falling back', async phase => {
    const f = await readParentFixture(), failure = new DOMException('denied', 'NotAllowedError');
    await f.fs.readText('deep/parent/a');
    if (phase === 'resolve') f.root.resolve.mockRejectedValueOnce(failure); else f.fileHandle.mockRejectedValueOnce(failure);
    await expect(f.fs.readText('deep/parent/a')).rejects.toBe(failure); expect(f.directory).toHaveBeenCalledTimes(2);
  });
  it('invalidates a missing hinted file handle and performs only one original-path lookup', async () => {
    const f = await readParentFixture(); await f.fs.readText('deep/parent/a');
    f.fileHandle.mockRejectedValueOnce(new DOMException('stale locator', 'NotFoundError'));
    expect(await f.fs.readText('deep/parent/a')).toBe('1234'); expect(f.fileHandle).toHaveBeenCalledTimes(3); expect(f.directory).toHaveBeenCalledTimes(4);
  });
  it.each(['file', 'text', 'bytes', 'stream'] as const)('never reopens after %s acquisition/consumption fails', async phase => {
    const f = await readParentFixture(), failure = new DOMException('disappeared', 'NotFoundError');
    await f.fs.readText('deep/parent/a');
    if (phase === 'file') f.file.mockRejectedValueOnce(failure);
    else {
      const value = new File(['bad'], 'data');
      const method = phase === 'bytes' ? 'arrayBuffer' : phase === 'stream' ? 'stream' : 'text';
      Object.defineProperty(value, method, { value: phase === 'stream' ? () => new ReadableStream({ start(controller) { controller.error(failure); } }) : async () => { throw failure; } });
      f.file.mockResolvedValueOnce(value);
    }
    const read = phase === 'bytes' ? f.fs.readBytes('deep/parent/a') : phase === 'stream' ? f.fs.readStream('deep/parent/a').then(view => new Response(view!.stream()).text()) : f.fs.readText('deep/parent/a');
    await expect(read).rejects.toBe(failure); expect(f.fileHandle).toHaveBeenCalledTimes(2); expect(f.directory).toHaveBeenCalledTimes(2);
  });
  it.each(['text', 'bytes', 'stream', 'append-text', 'append-bytes', 'remove'] as const)('discards the hint before native %s mutations', async kind => {
    const f = await readParentFixture(); await f.fs.readText('deep/parent/a');
    if (kind === 'text') await f.fs.writeText('scratch', 'new');
    else if (kind === 'bytes') await f.fs.writeBytes('scratch', new Uint8Array([1]));
    else if (kind === 'stream') await f.fs.writeStream('scratch', new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }));
    else if (kind === 'append-text') await f.fs.appendText('scratch', 'new');
    else if (kind === 'append-bytes') await f.fs.appendBytes('scratch', new Uint8Array([1]));
    else await f.fs.remove('scratch');
    const before = f.directory.mock.calls.length;
    await f.fs.readText('deep/parent/a'); expect(f.directory.mock.calls.length - before).toBe(2); expect(f.root.resolve).not.toHaveBeenCalled();
  });
  it('does not republish a pending old read after a native mutation invalidates its owner', async () => {
    const f = await readParentFixture(); let entered!: () => void, release!: () => void;
    const started = new Promise<void>(r => { entered = r; }), held = new Promise<void>(r => { release = r; });
    const original = f.directory.getMockImplementation()!;
    f.directory.mockImplementationOnce(async (...args) => { entered(); await held; return original(...args); });
    const reading = f.fs.readText('deep/parent/a');
    try {
      await started; await f.fs.writeBytes('scratch', new Uint8Array([1])); release(); expect(await reading).toBe('1234');
      const before = f.directory.mock.calls.length; await f.fs.readText('deep/parent/a');
      expect(f.directory.mock.calls.length - before).toBe(2); expect(f.root.resolve).not.toHaveBeenCalled();
    } finally { release(); await reading.catch(() => {}); }
  });
  it('keeps path and root ownership separate instead of reusing another project or instance', async () => {
    const a = await readParentFixture(); expect(await a.fs.readText('deep/parent/a')).toBe('1234');
    expect(await a.fs.readText('other/parent/a')).toBe('other'); expect(a.root.resolve).not.toHaveBeenCalled();
    const b = await readParentFixture(); b.put('other/parent/a', 'other-root');
    expect(await b.fs.readText('other/parent/a')).toBe('other-root'); expect(await a.fs.readText('other/parent/a')).toBe('other');
    expect(b.directory).toHaveBeenCalledTimes(2); expect(a.root.resolve).toHaveBeenCalledOnce();
  });
});
