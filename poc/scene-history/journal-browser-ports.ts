// Disposable browser platform port. No application database or user inputs.
import { generateAutomergeUrl, parseAutomergeUrl, type DocumentId } from '@automerge/automerge-repo/slim';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { A, LIMIT, type Doc, type Ref, type Target, require, parse, jsonBytes,
  refs, hash, transaction, target, same, heads, index, atHeads, validateRoot, sha } from './journal-format';
import { type Files, type Ports, type Control } from './journal';
import { CasCandidate } from '../cas-io/candidate';
import { OpfsIo } from '../cas-io/opfs-io';
import { withRepoStorage } from './journal-repo';

const AREA = 'lociview-isolated-journal-20260908';
export const runLock = (run: string) => `${AREA}:${run}:writer`;
const absent = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export class BrowserFiles implements Files {
  private constructor(private readonly root: FileSystemDirectoryHandle) {}
  static async open(run: string): Promise<BrowserFiles> {
    transaction(run);
    require(typeof navigator.storage?.getDirectory === 'function' && navigator.locks, 'OPFS/ブラウザの保存ロックが必要です');
    const root = await navigator.storage.getDirectory();
    const area = await root.getDirectoryHandle(AREA, { create: true });
    return new BrowserFiles(await area.getDirectoryHandle(run, { create: true }));
  }
  private async handle(key: string, create: boolean): Promise<FileSystemFileHandle | null> {
    require(!/[^\x21-\x7e]/.test(key) && /^(?:(?:control|inventory|session|evidence)\.json|journal\/[0-9a-f]{32}\/(?:journal\.json|source-metadata\.am|changes\/[0-9]{8}\.amchange))$/.test(key), 'invalid browser file key');
    const names = key.split('/'); let directory = this.root;
    try {
      for (const name of names.slice(0, -1)) directory = await directory.getDirectoryHandle(name, { create });
      return await directory.getFileHandle(names.at(-1)!, { create });
    } catch (error) { if (!create && absent(error)) return null; throw error; }
  }
  async read(key: string, limit: number): Promise<Uint8Array | null> {
    const handle = await this.handle(key, false); if (!handle) return null;
    const file = await handle.getFile(); require(file.size <= limit, 'stored byte budget');
    const bytes = new Uint8Array(file.size);
    for (let offset = 0; offset < file.size; offset += 256 * 1024)
      bytes.set(new Uint8Array(await file.slice(offset, offset + 256 * 1024).arrayBuffer()), offset);
    return bytes;
  }
  async write(key: string, bytes: Uint8Array): Promise<void> {
    require(bytes.length <= LIMIT.metadata, 'stored byte budget');
    const writer = await (await this.handle(key, true))!.createWritable();
    try {
      for (let offset = 0; offset < bytes.length; offset += 256 * 1024)
        await writer.write(new Uint8Array(bytes.subarray(offset, offset + 256 * 1024)));
      await writer.close();
    } catch (error) { try { await writer.abort(error); } catch { /* retain original error */ } throw error; }
    const actual = await this.read(key, LIMIT.metadata);
    require(actual && actual.length === bytes.length && sha(actual) === sha(bytes), 'OPFS close/readback mismatch');
  }
}

export interface BrowserSession { target: Target; documentId: string; localTx: string; remoteTx: string }
export function decodeSession(bytes: Uint8Array): BrowserSession {
  const value = parse(bytes);
  require(same(Object.keys(value).sort(), ['documentId', 'localTx', 'remoteTx', 'target']), 'invalid session members');
  target(value.target); transaction(value.localTx); transaction(value.remoteTx);
  require(typeof value.documentId === 'string' && value.documentId.length >= 20 && value.documentId.length <= 80 &&
    /^[1-9A-HJ-NP-Za-km-z]+$/.test(value.documentId), 'invalid document locator');
  return value;
}

// Fresh Repo storage caches on every read; reuse only the IDB connection adapter.
export class BrowserPorts implements Ports {
  checkpoint: (name: string) => Promise<void> = async () => {};
  publications = 0;
  metadataWrites = 0;
  private owned = false;
  private constructor(readonly run: string, readonly files: BrowserFiles, readonly session: BrowserSession,
    private readonly storage: IndexedDBStorageAdapter, readonly casIo: OpfsIo, private readonly cas: CasCandidate,
    readonly finalClosure: (doc: Doc) => Ref[]) {}
  static async open(run: string, files: BrowserFiles, session: BrowserSession,
    closure: (doc: Doc) => Ref[], storage = new IndexedDBStorageAdapter(`${AREA}-${run}`)): Promise<BrowserPorts> {
    transaction(run); decodeSession(jsonBytes(session));
    const io = await OpfsIo.open(run);
    return new BrowserPorts(run, files, session, storage, io, new CasCandidate(io), closure);
  }
  fresh(): Promise<BrowserPorts> {
    return BrowserPorts.open(this.run, this.files, this.session, this.finalClosure, this.storage);
  }
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    return navigator.locks.request(runLock(this.run), { mode: 'exclusive', ifAvailable: true }, async lock => {
      require(lock && !this.owned, '別のタブで保存中です。完了後に確認してください');
      this.owned = true;
      try { return await fn(); } finally { this.owned = false; }
    });
  }
  async current(): Promise<Doc> {
    return withRepoStorage(this.storage, () => false, async backend => {
      const doc = await backend.loadDoc<Record<string, any>>(this.session.documentId as DocumentId);
      require(doc, 'missing durable metadata'); validateRoot(doc, this.session.target); return doc;
    });
  }
  async readAt(selected: string[]): Promise<Doc> { return atHeads(await this.current(), selected); }
  async appendAndFlush(bytes: Uint8Array): Promise<void> {
    require(this.owned, 'writer lease required'); const exact = new Uint8Array(bytes); const decoded = A.decodeChange(exact);
    await withRepoStorage(this.storage, () => this.owned, async backend => {
      const before = await backend.loadDoc<Record<string, any>>(this.session.documentId as DocumentId);
      require(before, 'missing durable metadata'); validateRoot(before, this.session.target);
      const existing = index(before).get(decoded.hash);
      if (existing) { require(existing.bytes.length === exact.length && existing.bytes.every((b, i) => b === exact[i]), 'existing original bytes differ'); return; }
      const next = A.applyChanges(A.clone(before), [exact])[0]; validateRoot(next, this.session.target);
      await backend.saveDoc(this.session.documentId as DocumentId, next); this.metadataWrites++;
    });
    const reread = index(await this.current()).get(decoded.hash);
    require(reread && sha(reread.bytes) === sha(exact), 'IDB original bytes not durable');
  }
  async control(): Promise<Control> {
    const bytes = await this.files.read('control.json', LIMIT.journal); require(bytes, 'missing control');
    const value = parse(bytes);
    require(same(Object.keys(value).sort(), ['pending', 'publishedHeads']) && Array.isArray(value.publishedHeads) &&
      value.publishedHeads.length > 0 && value.publishedHeads.length <= LIMIT.count, 'invalid control');
    value.publishedHeads.forEach(hash);
    require(same(value.publishedHeads, [...new Set(value.publishedHeads)].sort()), 'noncanonical heads');
    if (value.pending !== null) transaction(value.pending); return value;
  }
  async setControl(value: Control) {
    require(this.owned, 'writer lease required'); await this.files.write('control.json', jsonBytes(value));
    if (value.pending === null) this.publications++;
  }
  async inventory(): Promise<Ref[]> {
    const bytes = await this.files.read('inventory.json', LIMIT.journal); require(bytes, 'missing inventory');
    const value = parse(bytes); refs(value); return value;
  }
  async protect(added: Ref[]) {
    require(this.owned, 'writer lease required'); refs(added);
    const known = new Map((await this.inventory()).map(ref => [ref.digest, ref]));
    for (const ref of added) {
      require(!known.has(ref.digest) || known.get(ref.digest)!.byteLength === ref.byteLength, 'inventory identity mismatch');
      if (!known.has(ref.digest)) known.set(ref.digest, { ...ref });
    }
    await this.files.write('inventory.json', jsonBytes([...known.values()].sort((a, b) => a.digest < b.digest ? -1 : 1)));
  }
  async hasProtected(ref: Ref) { return (await this.inventory()).some(r => r.digest === ref.digest && r.byteLength === ref.byteLength); }
  hasVerified(ref: Ref) { return this.cas.hasVerified({ sha256: ref.digest, byteLength: ref.byteLength }); }
  async importBlob(tx: string, ref: Ref, bytes: Uint8Array) {
    require(this.owned, 'writer lease required');
    async function* source() { yield bytes; }
    await this.cas.import(tx, { sha256: ref.digest, byteLength: ref.byteLength }, source());
  }
  async initialize(doc: Doc, initial: Ref[]) {
    require(this.owned && !await this.files.read('control.json', LIMIT.journal), 'already initialized or missing lease');
    validateRoot(doc, this.session.target); refs(initial);
    await withRepoStorage(this.storage, () => this.owned, async backend => {
      this.session.documentId = parseAutomergeUrl(generateAutomergeUrl()).documentId;
      await backend.saveDoc(this.session.documentId as DocumentId, doc);
    });
    const reread = await this.current();
    require(same(heads(reread), heads(doc)) && same([...index(reread)].map(([h, p]) => [h, sha(p.bytes)]),
      [...index(doc)].map(([h, p]) => [h, sha(p.bytes)])), 'initial IDB history not durable');
    await this.files.write('session.json', jsonBytes(this.session));
    await this.files.write('inventory.json', jsonBytes(initial));
    await this.setControl({ pending: null, publishedHeads: heads(doc) }); this.publications = 0;
  }
}
