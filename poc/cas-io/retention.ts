// Disposable inventory/collection protocol. No production ProjectDoc or GC policy.
import { parseJsonWithoutDuplicateMembers } from '../../src/core/json';
import { CasCandidate, type BlobRef, type Io } from './candidate';

export const ROOT_KINDS = ['current', 'conflict', 'migration', 'retention', 'journal', 'package'] as const;
export type RootKind = typeof ROOT_KINDS[number];
export interface Snapshot {
  schemaMajor: number;
  readable: boolean;
  opaque: boolean;
  unfinishedJournal: boolean;
  /** Complete validated strong closures, including active derivatives. Test port only. */
  roots: Record<RootKind, BlobRef[]>;
}
export interface Envelope { id: string; revision: number; current: Snapshot; protected: BlobRef[]; pending: Snapshot | null }
interface Catalog { version: 1; projects: string[] }
interface Mark { ref: BlobRef; since: number; deleting: boolean }
interface Marks { version: 1; lastClock: number; marks: Record<string, Mark> }
export interface Ports {
  cas: Io;
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, value: Uint8Array): Promise<void>;
  projectIds(): Promise<string[]>;
  verifiedDigests(): Promise<string[]>;
}
export type Boundary = 'pending' | 'blobsPublished' | 'inventoryReady' | 'marked' | 'deleteIntent' | 'receiptRemoved' | 'payloadRemoved';
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`retention probe: ${message}`); }
const digestPattern = /^[0-9a-f]{64}$/;
const idPattern = /^prj_[0-9a-f]{32}$/;
const clone = <T>(v: T): T => structuredClone(v);
const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const decode = (bytes: Uint8Array): any => parseJsonWithoutDuplicateMembers(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
function keys(v: any, expected: string[]) {
  assert(v && typeof v === 'object' && !Array.isArray(v), 'invalid record');
  assert(JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...expected].sort()), 'invalid record keys');
}
function integer(n: any) { assert(Number.isSafeInteger(n) && n >= 0, 'invalid integer'); }
function ref(value: any): asserts value is BlobRef {
  keys(value, ['sha256', 'byteLength']); assert(typeof value.sha256 === 'string' && digestPattern.test(value.sha256), 'invalid digest'); integer(value.byteLength);
}
const same = (a: BlobRef, b: BlobRef) => a.sha256 === b.sha256 && a.byteLength === b.byteLength;
function union(values: readonly BlobRef[]): BlobRef[] {
  const map = new Map<string, BlobRef>();
  for (const value of values) {
    ref(value); const prior = map.get(value.sha256); assert(!prior || same(prior, value), 'conflicting blob identity');
    map.set(value.sha256, clone(value));
  }
  return [...map.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
}
function references(value: any): asserts value is BlobRef[] {
  assert(Array.isArray(value) && value.length <= 128, 'invalid reference list');
  const canonical = union(value); assert(JSON.stringify(value) === JSON.stringify(canonical), 'noncanonical references');
}
function snapshot(value: any): asserts value is Snapshot {
  keys(value, ['schemaMajor', 'readable', 'opaque', 'unfinishedJournal', 'roots']); integer(value.schemaMajor);
  for (const key of ['readable', 'opaque', 'unfinishedJournal']) assert(typeof value[key] === 'boolean', 'invalid state flag');
  keys(value.roots, [...ROOT_KINDS]); ROOT_KINDS.forEach(k => references(value.roots[k]));
}
const currentRefs = (s: Snapshot) => union(ROOT_KINDS.flatMap(k => s.roots[k]));
const projectKey = (id: string) => { assert(typeof id === 'string' && idPattern.test(id), 'invalid project ID'); return `projects/${id}.json`; };
function envelope(value: any): asserts value is Envelope {
  keys(value, ['id', 'revision', 'current', 'protected', 'pending']); projectKey(value.id); integer(value.revision);
  snapshot(value.current); references(value.protected); if (value.pending !== null) snapshot(value.pending);
  const inventory = new Map(value.protected.map((r: BlobRef) => [r.sha256, r]));
  for (const r of [...currentRefs(value.current), ...(value.pending ? currentRefs(value.pending) : [])])
    assert(inventory.has(r.sha256) && same(inventory.get(r.sha256) as BlobRef, r), 'root missing from inventory');
}
function catalog(value: any): asserts value is Catalog {
  keys(value, ['version', 'projects']); assert(value.version === 1, 'unsupported catalog');
  assert(Array.isArray(value.projects) && value.projects.length <= 16, 'project count budget'); value.projects.forEach(projectKey);
  assert(JSON.stringify(value.projects) === JSON.stringify([...new Set(value.projects)].sort()), 'invalid catalog order');
}
function marks(value: any): asserts value is Marks {
  keys(value, ['version', 'lastClock', 'marks']); assert(value.version === 1, 'unsupported marks'); integer(value.lastClock);
  assert(value.marks && typeof value.marks === 'object' && !Array.isArray(value.marks) && Object.keys(value.marks).length <= 128, 'mark budget');
  for (const [digest, item] of Object.entries(value.marks) as [string, Mark][]) {
    keys(item, ['ref', 'since', 'deleting']); ref(item.ref); integer(item.since);
    assert(digest === item.ref.sha256 && item.since <= value.lastClock && typeof item.deleting === 'boolean', 'invalid mark');
  }
}
export function emptySnapshot(): Snapshot {
  return { schemaMajor: 2, readable: true, opaque: false, unfinishedJournal: false,
    roots: { current: [], conflict: [], migration: [], retention: [], journal: [], package: [] } };
}

export class RetentionCandidate {
  constructor(private readonly ports: Ports, private readonly checkpoint: (boundary: Boundary) => Promise<void> = async () => {}) {}
  private async read<T>(key: string, validate: (value: any) => void): Promise<T> {
    const bytes = await this.ports.read(key); assert(bytes && bytes.length > 0 && bytes.length <= 256 * 1024, `missing/unreadable ${key}`);
    const value = decode(bytes); validate(value); return value;
  }
  private async write(key: string, value: unknown): Promise<void> {
    const bytes = encode(value); assert(bytes.length <= 256 * 1024, 'metadata budget');
    await this.ports.write(key, bytes);
    const reread = await this.ports.read(key);
    assert(reread && reread.length === bytes.length && reread.every((b, i) => b === bytes[i]), 'metadata write/readback mismatch');
  }
  private locked<T>(task: (io: Io, cas: CasCandidate) => Promise<T>): Promise<T> {
    return this.ports.cas.exclusive(async () => {
      let live = true;
      const check = () => assert(live, 'expired origin lease');
      // Explicit lock-held adapter, not recursive mutex acquisition.
      const io: Io = {
        exclusive: async fn => { check(); return fn(); },
        read: async key => { check(); return this.ports.cas.read(key); },
        write: async (key, bytes) => { check(); return this.ports.cas.write(key, bytes); },
        remove: async key => { check(); return this.ports.cas.remove(key); },
      };
      try { return await task(io, new CasCandidate(io)); } finally { live = false; }
    });
  }
  async initialize(): Promise<void> {
    return this.locked(async () => {
      assert(!await this.ports.read('catalog.json') && !await this.ports.read('marks.json') &&
        (await this.ports.projectIds()).length === 0, 'already initialized or incomplete catalog');
      await this.write('marks.json', { version: 1, lastClock: 0, marks: {} });
      await this.write('catalog.json', { version: 1, projects: [] });
    });
  }
  private async listed(): Promise<Catalog> {
    const result = await this.read<Catalog>('catalog.json', catalog);
    assert(JSON.stringify(result.projects) === JSON.stringify((await this.ports.projectIds()).sort()), 'catalog/inventory mismatch');
    return result;
  }
  async register(id: string): Promise<void> {
    projectKey(id);
    return this.locked(async () => {
      const c = await this.listed(); assert(!c.projects.includes(id), 'already registered');
      // Registration precedes inventory: interruption leaves a detectable missing inventory.
      const next: Catalog = { version: 1, projects: [...c.projects, id].sort() }; catalog(next);
      await this.write('catalog.json', next);
      await this.write(projectKey(id), { id, revision: 0, current: emptySnapshot(), protected: [], pending: null });
    });
  }
  async inspect(id: string): Promise<Envelope> {
    return this.locked(async () => { const c = await this.listed(); assert(c.projects.includes(id), 'unregistered Project');
      return this.read<Envelope>(projectKey(id), envelope); });
  }
  async update(id: string, revision: number, next: Snapshot,
    imports: readonly { transactionId: string; ref: BlobRef; source: AsyncIterable<Uint8Array> }[] = []): Promise<void> {
    const desired = clone(next); snapshot(desired); integer(revision);
    const incoming = imports.map(i => ({ ...i, ref: clone(i.ref) }));
    return this.locked(async (_io, cas) => {
      const c = await this.listed(); assert(c.projects.includes(id), 'unregistered Project');
      const prior = await this.read<Envelope>(projectKey(id), envelope);
      assert(prior.id === id && prior.revision === revision && prior.pending === null, 'stale or pending inventory');
      assert(!prior.current.unfinishedJournal, 'unfinished metadata: ordinary update refused');
      assert(prior.current.schemaMajor === 2 && prior.current.readable && desired.schemaMajor === 2 && desired.readable, 'unsupported/unreadable Project');
      // Only a separately proven newer validator may clear opaque reachability.
      assert(!prior.current.opaque || desired.opaque, 'cannot clear opaque reachability');
      const required = currentRefs(desired);
      const all = union([...prior.protected, ...required, ...incoming.map(i => i.ref)]);
      const pending: Envelope = { ...prior, protected: all, pending: desired };
      envelope(pending);
      await this.write(projectKey(id), pending); await this.checkpoint('pending');
      for (const item of incoming) await cas.import(item.transactionId, item.ref, item.source);
      await this.checkpoint('blobsPublished');
      await this.finish(id, pending, cas);
    });
  }
  private async finish(id: string, pending: Envelope, cas: CasCandidate): Promise<void> {
    assert(pending.pending, 'no pending inventory');
    const desired = pending.pending;
    assert(pending.current.readable && pending.current.schemaMajor === 2 && !pending.current.unfinishedJournal,
      'unfinished or unsupported metadata: inventory completion refused');
    assert(desired.readable && desired.schemaMajor === 2 && (!pending.current.opaque || desired.opaque), 'invalid pending target');
    const protectedRefs = desired.opaque ? pending.protected : currentRefs(desired);
    for (const r of protectedRefs) assert(await cas.hasVerified(r), `missing required blob ${r.sha256}`);
    // A returning root cancels BOTH its old grace mark and interrupted deletion.
    const state = await this.read<Marks>('marks.json', marks);
    for (const r of protectedRefs) delete state.marks[r.sha256];
    await this.write('marks.json', state);
    await this.write(projectKey(id), { ...pending, revision: pending.revision + 1,
      current: desired, protected: protectedRefs, pending: null });
    await this.checkpoint('inventoryReady');
  }
  /** Finishes only the exact recorded inventory target after its bytes are verified. */
  async finishPending(id: string): Promise<void> {
    return this.locked(async (_io, cas) => {
      const c = await this.listed(); assert(c.projects.includes(id), 'unregistered Project');
      const pending = await this.read<Envelope>(projectKey(id), envelope); assert(pending.id === id, 'wrong Project inventory');
      if (!pending.pending) return;
      await this.finish(id, pending, cas);
    });
  }
  private async protectedRoots(cas: CasCandidate): Promise<Map<string, BlobRef>> {
    const c = await this.listed(); const result: BlobRef[] = [];
    for (const id of c.projects) {
      const p = await this.read<Envelope>(projectKey(id), envelope);
      assert(p.id === id, 'wrong Project inventory');
      assert(p.pending === null && !p.current.unfinishedJournal, 'unfinished metadata: GC refused');
      assert(p.current.readable && p.current.schemaMajor === 2, 'unsupported/unreadable Project: GC refused');
      assert(!p.current.opaque, 'opaque Project: GC refused');
      result.push(...p.protected);
    }
    const protectedRefs = union(result);
    for (const r of protectedRefs) assert(await cas.hasVerified(r), `missing required blob ${r.sha256}`);
    return new Map(protectedRefs.map(r => [r.sha256, r]));
  }
  private async published(io: Io, cas: CasCandidate): Promise<Map<string, BlobRef>> {
    const refs: BlobRef[] = [];
    for (const digest of await this.ports.verifiedDigests()) {
      assert(digestPattern.test(digest), 'invalid published digest');
      const source = await io.read(`verified/${digest}.json`); assert(source && source.size > 0 && source.size <= 4096, 'missing/corrupt receipt');
      const bytes = new Uint8Array(source.size); let length = 0;
      for await (const part of source.chunks()) { assert(length + part.length <= bytes.length, 'oversized receipt'); bytes.set(part, length); length += part.length; }
      assert(length === bytes.length, 'truncated receipt');
      const receipt = decode(bytes); keys(receipt, ['state', 'ref']); ref(receipt.ref);
      assert(receipt.state === 'complete' && receipt.ref.sha256 === digest && await cas.hasVerified(receipt.ref), 'invalid published receipt');
      refs.push(receipt.ref);
    }
    return new Map(union(refs).map(r => [r.sha256, r]));
  }
  async collect(now: number, grace: number): Promise<{ deleted: string[]; marked: string[] }> {
    integer(now); integer(grace); assert(grace > 0, 'test grace must be positive');
    return this.locked(async (io, cas) => {
      const protectedRefs = await this.protectedRoots(cas);
      const state = await this.read<Marks>('marks.json', marks); assert(now >= state.lastClock, 'clock moved backwards');
      const available = await this.published(io, cas);
      state.lastClock = now;
      for (const digest of Object.keys(state.marks)) {
        if (protectedRefs.has(digest)) delete state.marks[digest];
        else assert(state.marks[digest]!.deleting || available.has(digest), 'unexplained missing orphan');
      }
      for (const [digest, r] of available) {
        if (protectedRefs.has(digest)) continue;
        const old = state.marks[digest]; assert(!old || same(old.ref, r), 'changed orphan identity');
        state.marks[digest] ??= { ref: r, since: now, deleting: false };
      }
      marks(state); await this.write('marks.json', state); await this.checkpoint('marked');
      const deleted: string[] = [];
      for (const digest of Object.keys(state.marks).sort()) {
        const item = state.marks[digest]!;
        if (!item.deleting && now - item.since < grace) continue;
        const fresh = await this.protectedRoots(cas); // Recheck under the SAME publication lock.
        if (fresh.has(digest)) { delete state.marks[digest]; await this.write('marks.json', state); continue; }
        item.deleting = true; await this.write('marks.json', state); await this.checkpoint('deleteIntent');
        await io.remove(`verified/${digest}.json`); await this.checkpoint('receiptRemoved');
        await io.remove(`blobs/${digest}`); await this.checkpoint('payloadRemoved');
        delete state.marks[digest]; await this.write('marks.json', state); deleted.push(digest);
      }
      return { deleted, marked: Object.keys(state.marks).sort() };
    });
  }
}
