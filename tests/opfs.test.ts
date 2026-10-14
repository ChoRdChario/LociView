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
