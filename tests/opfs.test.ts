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
    'projects/a/file.json', 'root', 'absent/', 'projects//', '/projects', 'projects/../'])('matches MemoryFS lexical prefix %j', async prefix => {
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
  it('propagates relevant storage failures instead of reporting an empty or cached result', async () => {
    const f = await setup(paths), other = f.root.children.get('other') as Directory;
    const error = new DOMException('Storage unavailable', 'NotReadableError'); other.error = error;
    expect(await f.fs.list('projects/a/')).toEqual(await f.memory.list('projects/a/'));
    await expect(f.fs.list('other/')).rejects.toBe(error);
    await expect(f.fs.list('')).rejects.toBe(error);
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
