// Lifecycle proof against pinned Repo, NOT an IndexedDB/browser substitute.
import { expect, it } from 'vitest';
import { generateAutomergeUrl, parseAutomergeUrl, type StorageAdapterInterface, type Chunk } from '@automerge/automerge-repo/slim';
import { A, sha, heads } from './journal-format';
import { LeasedStorage, withRepoStorage } from './journal-repo';

class MemoryStorage implements StorageAdapterInterface {
  entries = new Map<string, Uint8Array>(); writes = 0; fail = false;
  async load(key: string[]) { return this.entries.get(JSON.stringify(key))?.slice(); }
  async save(key: string[], bytes: Uint8Array) {
    this.writes++; if (this.fail) throw new Error('injected storage rejection');
    this.entries.set(JSON.stringify(key), bytes.slice());
  }
  async remove(key: string[]) { this.writes++; this.entries.delete(JSON.stringify(key)); }
  async loadRange(prefix: string[]): Promise<Chunk[]> {
    return [...this.entries].filter(([key]) => prefix.every((p, i) => JSON.parse(key)[i] === p))
      .map(([key, data]) => ({ key: JSON.parse(key), data: data.slice() }));
  }
  async removeRange(prefix: string[]) { for (const entry of await this.loadRange(prefix)) await this.remove(entry.key); }
}
const pause = () => new Promise(resolve => setTimeout(resolve, 25));
const id = () => parseAutomergeUrl(generateAutomergeUrl()).documentId;

it('a fresh read and cleanup preserve exact bytes with zero delayed writes', async () => {
  const storage = new MemoryStorage(); const documentId = id();
  const doc = A.from({ title: new A.ImmutableString('Durable original') });
  await withRepoStorage(storage, () => true, backend => backend.saveDoc(documentId, doc));
  const before = storage.writes;
  for (let i = 0; i < 2; i++) {
    const read = await withRepoStorage(storage, () => false, backend => backend.loadDoc(documentId));
    expect(heads(read!)).toEqual(heads(doc));
    expect(A.getAllChanges(read!).map(sha)).toEqual(A.getAllChanges(doc).map(sha));
  }
  await pause(); expect(storage.writes).toBe(before);
});

it('read-only open of missing storage identity does not seed metadata in the background', async () => {
  const storage = new MemoryStorage();
  await expect(withRepoStorage(storage, () => false, backend => backend.loadDoc(id()))).rejects.toThrow('missing storage identity');
  await pause(); expect(storage.writes).toBe(0); expect(storage.entries.size).toBe(0);
});

it('rejected explicit save is not retried by cleanup after its lease ends', async () => {
  const storage = new MemoryStorage(), documentId = id();
  const doc = A.from({ title: new A.ImmutableString('Old') });
  await withRepoStorage(storage, () => true, backend => backend.saveDoc(documentId, doc));
  const next = A.change(A.clone(doc), d => { d.title = new A.ImmutableString('New'); });
  storage.fail = true;
  await expect(withRepoStorage(storage, () => true, async backend => {
    await backend.loadDoc(documentId); await backend.saveDoc(documentId, next);
  })).rejects.toThrow('injected storage rejection');
  const count = storage.writes; storage.fail = false; await pause(); expect(storage.writes).toBe(count);
  const reopened = await withRepoStorage(storage, () => false, backend => backend.loadDoc(documentId));
  expect(heads(reopened!)).toEqual(heads(doc));
});

it('lease close rejects late requests and drains the already-started write', async () => {
  const storage = new MemoryStorage(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const save = storage.save.bind(storage);
  storage.save = async (key, bytes) => { await gate; await save(key, bytes); };
  let allowed = true, closed = false;
  const lease = new LeasedStorage(storage, () => allowed);
  const write = lease.save(['test'], new Uint8Array([1, 2, 3]));
  const closing = lease.close().then(() => { closed = true; }); await Promise.resolve();
  expect(closed).toBe(false); allowed = false; allowed = true;
  expect(() => lease.save(['late'], new Uint8Array([4]))).toThrow('without browser lease');
  release(); await write; await closing;
  expect(storage.writes).toBe(1); expect(closed).toBe(true);
});
