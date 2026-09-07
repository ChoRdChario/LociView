// Real local files behind test ports, not browser OPFS/IndexedDB implementations.
import { open, mkdir, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { A, LIMIT, type Ref, type Doc, type Target, require, parse, jsonBytes, refs, hash, transaction,
  same, index, heads, ordered, validateRoot } from './journal-format';
import { type Files, type Control, type Ports } from './journal';
import { CasCandidate } from '../cas-io/candidate';

export class NodeFiles implements Files {
  fault?: { match: (key: string) => boolean; afterBytes: number; error: Error };
  constructor(readonly root: string) {}
  path(key: string): string {
    require(!/[^\x21-\x7e]/.test(key), 'invalid file key');
    require(/^(?:(?:control|inventory)\.json|metadata\/[0-9a-f]{64}\.amchange|journal\/[0-9a-f]{32}\/(?:journal\.json|source-metadata\.am|changes\/[0-9]{8}\.amchange))$/.test(key), 'invalid file key');
    const path = resolve(this.root, key); require(path.startsWith(resolve(this.root) + sep), 'path outside probe'); return path;
  }
  async read(key: string, limit: number): Promise<Uint8Array | null> {
    const path = this.path(key); let size;
    try { size = (await stat(path)).size; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    require(size <= limit, 'stored byte budget');
    const file = await open(path, 'r');
    try {
      const bytes = new Uint8Array(size); let offset = 0;
      while (offset < size) {
        const read = await file.read(bytes, offset, Math.min(256 * 1024, size - offset), offset);
        require(read.bytesRead > 0, 'truncated file'); offset += read.bytesRead;
      }
      require((await file.stat()).size === size, 'file changed during read'); return bytes;
    } finally { await file.close(); }
  }
  async write(key: string, bytes: Uint8Array): Promise<void> {
    require(bytes.length <= LIMIT.metadata, 'stored byte budget');
    const path = this.path(key); await mkdir(dirname(path), { recursive: true }); const file = await open(path, 'w');
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const fault = this.fault?.match(key) ? this.fault : undefined;
        if (fault && offset >= fault.afterBytes) throw fault.error;
        const length = Math.min(256 * 1024, bytes.length - offset, fault ? fault.afterBytes - offset : Infinity);
        const written = await file.write(bytes, offset, length, offset);
        require(written.bytesWritten > 0, 'zero write'); offset += written.bytesWritten;
      }
      await file.sync();
    } finally { await file.close(); }
  }
  async metadataHashes(): Promise<string[]> {
    let names: string[];
    try { names = await readdir(resolve(this.root, 'metadata')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    require(names.length <= LIMIT.count, 'metadata file count');
    return names.map(name => { require(/^[0-9a-f]{64}\.amchange$/.test(name), 'unexpected metadata file'); return name.slice(0, 64); });
  }
}
export class TestGate {
  private busy = false;
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    require(!this.busy, 'test writer busy'); this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
}
export class NodePorts implements Ports {
  checkpoint: (name: string) => Promise<void> = async () => {};
  publications = 0;
  metadataWrites = 0;
  constructor(readonly files: NodeFiles, readonly metadata: NodeFiles, private readonly gate: TestGate,
    private readonly cas: CasCandidate, private readonly target: Target, readonly finalClosure: (doc: Doc) => Ref[]) {}
  exclusive<T>(fn: () => Promise<T>) { return this.gate.exclusive(fn); }
  async control(): Promise<Control> {
    const bytes = await this.files.read('control.json', LIMIT.journal); require(bytes, 'missing control');
    const value = parse(bytes!);
    require(same(Object.keys(value).sort(), ['pending', 'publishedHeads']), 'invalid control');
    require(Array.isArray(value.publishedHeads) && value.publishedHeads.length > 0, 'invalid published heads');
    value.publishedHeads.forEach(hash);
    require(same(value.publishedHeads, [...new Set(value.publishedHeads)].sort()), 'noncanonical control heads');
    if (value.pending !== null) transaction(value.pending); return value;
  }
  async setControl(next: Control): Promise<void> {
    await this.files.write('control.json', jsonBytes(next));
    if (next.pending === null) this.publications++;
  }
  private async change(h: string): Promise<Uint8Array> {
    hash(h); const bytes = await this.metadata.read(`metadata/${h}.amchange`, LIMIT.part); require(bytes, 'missing durable change');
    require(A.decodeChange(bytes!).hash === h, 'corrupt durable change'); return bytes!;
  }
  async readAt(selected: string[]): Promise<Doc> {
    const loaded = new Map<string, Uint8Array>(); const pending = [...selected];
    while (pending.length) {
      const h = pending.pop()!; if (loaded.has(h)) continue;
      require(loaded.size < LIMIT.count, 'metadata ancestry budget');
      const bytes = await this.change(h); loaded.set(h, bytes); pending.push(...A.decodeChange(bytes).deps);
    }
    const doc = A.applyChanges(A.init<Record<string, any>>(), ordered([...loaded.values()], new Set()))[0];
    validateRoot(doc, this.target); return doc;
  }
  async current(): Promise<Doc> { return this.readAt(await this.metadata.metadataHashes()); }
  async appendAndFlush(bytes: Uint8Array): Promise<void> {
    const decoded = A.decodeChange(bytes); const key = `metadata/${decoded.hash}.amchange`;
    const existing = await this.metadata.read(key, LIMIT.part);
    if (existing) { require(existing.length === bytes.length && existing.every((b, i) => b === bytes[i]), 'existing change corruption'); return; }
    await this.metadata.write(key, bytes); this.metadataWrites++;
    const reread = await this.change(decoded.hash);
    require(reread.length === bytes.length && reread.every((b, i) => b === bytes[i]), 'durable bytes mismatch');
  }
  async inventory(): Promise<Ref[]> {
    const bytes = await this.files.read('inventory.json', LIMIT.journal); require(bytes, 'missing inventory');
    const value = parse(bytes!); refs(value); return value;
  }
  async protect(added: Ref[]): Promise<void> {
    const known = new Map((await this.inventory()).map(ref => [ref.digest, ref]));
    for (const ref of added) {
      require(!known.has(ref.digest) || known.get(ref.digest)!.byteLength === ref.byteLength, 'inventory identity mismatch');
      if (!known.has(ref.digest)) known.set(ref.digest, { ...ref });
    }
    const next = [...known.values()].sort((a, b) => a.digest < b.digest ? -1 : 1);
    await this.files.write('inventory.json', jsonBytes(next));
  }
  async hasProtected(ref: Ref): Promise<boolean> {
    return (await this.inventory()).some(item => item.digest === ref.digest && item.byteLength === ref.byteLength);
  }
  hasVerified(ref: Ref) { return this.cas.hasVerified({ sha256: ref.digest, byteLength: ref.byteLength }); }
  async initialize(doc: Doc, initial: Ref[]): Promise<void> {
    require(!await this.files.read('control.json', LIMIT.journal), 'probe already initialized'); validateRoot(doc, this.target);
    for (const { bytes } of index(doc).values()) await this.appendAndFlush(bytes);
    refs(initial); await this.files.write('inventory.json', jsonBytes(initial));
    await this.setControl({ pending: null, publishedHeads: heads(doc) }); this.publications = 0; this.metadataWrites = 0;
  }
}
