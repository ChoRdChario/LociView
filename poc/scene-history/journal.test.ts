import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { CasCandidate } from '../cas-io/candidate';
import { NodeIo } from '../cas-io/node-io';
import { OpfsIo } from '../cas-io/opfs-io';
import { A, FORMAT, LIMIT, type Doc, type Ref, type Target, type Prepared, require, refs,
  canonical, jsonBytes, parse, heads, sha, index, seal, decodeJournal } from './journal-format';
import { JournalCandidate } from './journal';
import { NodeFiles, NodePorts, TestGate } from './journal-node';

const parent = resolve('.artifacts/fixtures');
const scalar = (text: string) => new A.ImmutableString(text);
const tx = (n: number) => n.toString(16).padStart(32, '0');
const id = (prefix: string) => `${prefix}_${randomBytes(16).toString('hex')}`;
const encoder = new TextEncoder();
const rawRef = (bytes: Uint8Array): Ref => ({ algorithm: 'sha256', digest: createHash('sha256').update(bytes).digest('hex'),
  byteLength: bytes.length, mediaType: 'application/octet-stream' });
const oldBytes = encoder.encode('Original synthetic model bytes'); const oldRef = rawRef(oldBytes);
const newBytes = encoder.encode('Updated synthetic model bytes'); const newRef = rawRef(newBytes);
const missingRef = rawRef(encoder.encode('Missing synthetic model bytes'));
const change = (doc: Doc, fn: (draft: Record<string, any>) => void) => A.change(A.clone(doc), { time: 0 }, fn);
async function* one(bytes: Uint8Array) { yield bytes; }
function closure(doc: Doc): Ref[] {
  require(doc.schema?.major === 2 && Number.isSafeInteger(doc.schema.minor) && doc.schema.minor >= 0, 'unsupported synthetic schema');
  require(doc.captions && doc.resources && !doc.invalidDomain, 'synthetic domain invalid');
  const result = new Map<string, Ref>();
  const add = (ref: Ref) => { refs([ref]); const old = result.get(ref.digest);
    require(!old || old.byteLength === ref.byteLength, 'synthetic reference mismatch'); result.set(ref.digest, ref); };
  for (const field of ['model', 'attachment']) {
    const candidates = A.getConflicts(doc.resources, field);
    for (const value of candidates ? Object.values(candidates) : doc.resources[field] ? [doc.resources[field]] : [])
      add(JSON.parse(String(value)));
  }
  // Explicit synthetic opaque-inventory port; not inferred unknown-field reachability.
  for (const ref of JSON.parse(String(doc.resources.opaque ?? '[]'))) add(ref);
  return [...result.values()].sort((a, b) => a.digest < b.digest ? -1 : 1);
}
let root: string, base: Doc, target: Target, files: NodeFiles, metadata: NodeFiles;
let casIo: NodeIo, cas: CasCandidate, ports: NodePorts, engine: JournalCandidate, gate: TestGate;
const fresh = () => {
  const p = new NodePorts(new NodeFiles(resolve(root, 'journal-store')), new NodeFiles(resolve(root, 'metadata-store')), gate, cas, target, closure);
  return { ports: p, engine: new JournalCandidate(p, target) };
};
beforeEach(async () => {
  await mkdir(parent, { recursive: true }); root = await mkdtemp(resolve(parent, 'journal-probe-'));
  const identity = { projectId: id('prj'), historyEpoch: id('hep'), lineageSeed: randomBytes(32).toString('hex') };
  const genesis = A.from<Record<string, any>>({ schema: { major: 2, minor: 0 },
    identity: Object.fromEntries(Object.entries(identity).map(([key, value]) => [key, scalar(value)])), resources: {}, captions: {} });
  target = { identity, metadataEnvelope: { adapter: 'automerge', adapterFormatVersion: FORMAT,
    lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: heads(genesis)[0]! } } };
  base = change(genesis, d => { d.resources.model = scalar(JSON.stringify(oldRef)); d.resources.opaque = scalar('[]');
    d.captions.title = scalar('Original'); d.captions.body = scalar('Body'); });
  casIo = new NodeIo(resolve(root, 'cas')); cas = new CasCandidate(casIo);
  await cas.import(tx(100), { sha256: oldRef.digest, byteLength: oldRef.byteLength }, one(oldBytes));
  files = new NodeFiles(resolve(root, 'journal-store')); metadata = new NodeFiles(resolve(root, 'metadata-store')); gate = new TestGate();
  ports = new NodePorts(files, metadata, gate, cas, target, closure); engine = new JournalCandidate(ports, target);
  await ports.initialize(base, [oldRef]);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  const path = resolve(root); require(path.startsWith(parent + sep + 'journal-probe-') && path !== parent, 'unsafe scratch cleanup');
  await rm(path, { recursive: true, force: true });
});
async function stageNew() {
  await cas.import(tx(101), { sha256: newRef.digest, byteLength: newRef.byteLength }, one(newBytes));
}
function diamond() {
  const a = change(base, d => { d.captions.title = scalar('Remote title'); });
  const b = change(base, d => { d.resources.model = scalar(JSON.stringify(newRef)); });
  return change(A.merge(A.clone(a), A.clone(b)), d => { d.captions.body = scalar('Final body'); });
}
const journalKey = (n = 1) => `journal/${tx(n)}/journal.json`;
const partKey = (n: number) => `journal/${tx(1)}/changes/${n.toString().padStart(8, '0')}.amchange`;
async function prepared() { return decodeJournal((await files.read(journalKey(), LIMIT.journal))!) as Prepared; }
async function stopPrepared(source: Doc, staged: Ref[] = []) {
  ports.checkpoint = async name => { if (name === 'prepared') throw new Error('injected stop'); };
  await expect(engine.remote(tx(1), A.save(source), id('pkg'), staged)).rejects.toThrow('injected stop');
  ports.checkpoint = async () => {};
}

// Exercise the actual OPFS adapter's lock method with Node's Web Locks. File
// reads reuse the real synthetic Node CAS; this is not browser/OPFS evidence.
async function browserLockReader() {
  const locks = navigator.locks;
  expect(locks).toBeDefined();
  const directory = { async getDirectoryHandle() { return directory; } };
  vi.stubGlobal('navigator', { locks, storage: { async getDirectory() { return directory; } } });
  const io = await OpfsIo.open(tx(200));
  io.read = casIo.read.bind(casIo);
  const reader = new CasCandidate(io);
  ports.hasVerified = ref => reader.hasVerified({ sha256: ref.digest, byteLength: ref.byteLength });
  return io;
}

it.each(['pending', 'recovered'])('simultaneous notification and local %s views do not mistake CAS contention for loss', async state => {
  await stageNew(); const source = diamond(); await stopPrepared(source, [newRef]);
  if (state === 'recovered') await engine.recover(tx(1));
  const published = (await ports.control()).publishedHeads;
  const writes = [...casIo.writes], metadataWrites = ports.metadataWrites, publications = ports.publications;
  const reads = casIo.readPayloadBytes;
  const io = await browserLockReader();
  let release!: () => void, entered!: () => void, secondAttempt!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const firstEntered = new Promise<void>(resolve => { entered = resolve; });
  const secondRequested = new Promise<void>(resolve => { secondAttempt = resolve; });
  const read = io.read.bind(io); let firstReceipt = true;
  io.read = async key => {
    if (firstReceipt && key.startsWith('verified/')) {
      firstReceipt = false; entered(); await held;
    }
    return read(key);
  };
  const exclusive = io.exclusive.bind(io); let requests = 0;
  io.exclusive = (...args) => {
    const result = exclusive(...args);
    if (++requests === 2) secondAttempt();
    return result;
  };
  const first = engine.view(); let second: ReturnType<typeof engine.view> | undefined;
  try {
    await firstEntered; second = engine.view(); await secondRequested;
    await new Promise<void>(resolve => setImmediate(resolve));
    let mutationRan = false;
    await expect(io.exclusive(async () => { mutationRan = true; })).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(mutationRan).toBe(false);
  } finally { release(); }
  const results = await Promise.all([first, second!]);
  for (const view of results) {
    expect(view.repairRequired).not.toBe(true);
    expect(view.readOnly).toBe(state === 'pending'); expect(heads(view.doc)).toEqual(published);
  }
  expect(casIo.readPayloadBytes).toBe(reads); expect(casIo.writes).toEqual(writes);
  expect(ports.metadataWrites).toBe(metadataWrites); expect(ports.publications).toBe(publications);
  if (state === 'recovered') {
    expect(await engine.recover(tx(1))).toBe('noop'); expect(ports.publications).toBe(publications);
  }
});

it.each(['missing', 'corrupt', 'denied'])('queued receipt observation still refuses %s data and retains its cause', async kind => {
  const io = await browserLockReader(), read = io.read.bind(io);
  const denial = new DOMException('Synthetic receipt access denied', 'NotAllowedError');
  io.read = async key => {
    if (key.startsWith('verified/')) {
      if (kind === 'missing') return null;
      if (kind === 'denied') throw denial;
      return { size: 1, async *chunks() { yield new Uint8Array([0]); } };
    }
    return read(key);
  };
  const publications = ports.publications, writes = ports.metadataWrites, reads = casIo.readPayloadBytes;
  const observed = await engine.view();
  expect(observed).toMatchObject({ readOnly: true, repairRequired: true });
  expect(observed.repairCause).toBeInstanceOf(Error);
  if (kind === 'denied') expect(observed.repairCause).toBe(denial);
  expect(heads(observed.doc)).toEqual(heads(base));
  expect(ports.publications).toBe(publications); expect(ports.metadataWrites).toBe(writes);
  expect(casIo.readPayloadBytes).toBe(reads);
});

it.each(['prepared', 'metadataDurable:0', 'metadataDurable:1', 'metadataDurable:2', 'journalDurable', 'published'])
('remote diamond resumes exact bytes after %s with one publication and no prefix exposure', async boundary => {
  await stageNew(); const source = diamond(); const before = heads(base);
  ports.checkpoint = async name => { if (name === boundary) throw new Error('injected stop'); };
  await expect(engine.remote(tx(1), A.save(source), id('pkg'), [newRef])).rejects.toThrow('injected stop');
  const resumed = fresh(); const observed = await resumed.engine.view();
  expect(heads(observed.doc)).toEqual(boundary === 'published' ? heads(source) : before);
  expect(observed.readOnly).toBe(boundary !== 'published');
  if (observed.readOnly) for (const action of ['edit', 'export', 'gc'] as const)
    await expect(resumed.engine.request(action)).rejects.toThrow('read-only');
  const reads = casIo.readPayloadBytes;
  expect(await resumed.engine.recover(tx(1))).toBe(boundary === 'published' ? 'noop' : 'published');
  expect(casIo.readPayloadBytes).toBe(reads);
  const durable = await resumed.ports.current();
  expect(heads(durable)).toEqual(heads(source));
  expect(A.getAllChanges(durable).map(sha).sort()).toEqual(A.getAllChanges(source).map(sha).sort());
  expect(ports.publications + resumed.ports.publications).toBe(1);
  expect((await resumed.engine.view()).readOnly).toBe(false);
  expect(await resumed.engine.recover(tx(1))).toBe('noop');
  expect(ports.publications + resumed.ports.publications).toBe(1);
});

it.each(['local', 'remote'])('missing acknowledged %s metadata requires repair without restoring or publishing it', async kind => {
  ports.checkpoint = async name => { if (name === 'journalDurable') throw new Error('injected stop'); };
  const command = (d: Record<string, any>) => { d.captions.title = scalar('Durable change'); };
  const operation = kind === 'local'
    ? engine.local(tx(1), randomBytes(16).toString('hex'), command)
    : engine.remote(tx(1), A.save(change(base, command)), id('pkg'));
  await expect(operation).rejects.toThrow('injected stop');
  const j = await prepared(); expect(j.state).toBe('metadataDurable');
  // Delete only this fresh synthetic test's exact final change, not journal parts.
  await unlink(metadata.path(`metadata/${j.metadataBatch.changes[0]!.expectedChangeHash}.amchange`));
  const resumed = fresh();
  await expect(resumed.engine.recover(tx(1))).rejects.toThrow('acknowledged metadata missing');
  expect(resumed.ports.metadataWrites).toBe(0); expect(resumed.ports.publications).toBe(0);
  expect(heads((await resumed.engine.view()).doc)).toEqual(heads(base));
  expect((await resumed.engine.view()).readOnly).toBe(true);
});

it('remote source subtraction retains receiver-local siblings and permits a pre-existing remote prefix', async () => {
  const a = change(base, d => { d.captions.title = scalar('Receiver title'); });
  const b = change(base, d => { d.captions.body = scalar('Remote body'); });
  const final = change(b, d => { d.captions.title = scalar('Remote title'); });
  for (const doc of [a, b]) for (const [h, part] of index(doc))
    if (!index(base).has(h)) await ports.appendAndFlush(part.bytes);
  const before = await ports.current();
  await ports.setControl({ pending: null, publishedHeads: heads(before) }); ports.publications = 0;
  await engine.remote(tx(1), A.save(final), id('pkg'));
  const actual = await ports.current(); const expected = A.merge(A.clone(a), A.clone(final));
  expect(heads(actual)).toEqual(heads(expected));
  expect(Object.values(A.getConflicts(actual.captions, 'title')!).map(String).sort()).toEqual(['Receiver title', 'Remote title']);
  const j = await prepared(); expect(j.metadataBatch.changes).toHaveLength(1);
  const writes = ports.metadataWrites; const reads = casIo.readPayloadBytes;
  expect(await engine.remote(tx(2), A.save(final), id('pkg'))).toBe('noop');
  expect(ports.metadataWrites).toBe(writes); expect(casIo.readPayloadBytes).toBe(reads);
  expect(await files.read(journalKey(2), LIMIT.journal)).toBeNull();
});

it.each(['before', 'after-concurrent', 'after-descendant'])('local exact change survives %s replacement without rebuilding the command', async scenario => {
  let calls = 0; const boundary = scenario === 'before' ? 'prepared' : 'metadataDurable:0';
  ports.checkpoint = async name => { if (name === boundary) throw new Error('injected stop'); };
  await expect(engine.local(tx(1), randomBytes(16).toString('hex'), d => { calls++; d.captions.title = scalar('Original transaction'); }))
    .rejects.toThrow('injected stop');
  const j = await prepared(); const exact = (await files.read(partKey(0), LIMIT.part))!;
  expect(A.decodeChange(exact).message).toBe(`lociview:transaction:v1:${tx(1)}`);
  expect([...A.decodeChange(exact).deps].sort()).toEqual(heads(base));
  const replacement = change(scenario === 'after-descendant' ? await ports.current() : base,
    d => { d.captions.title = scalar('Later replacement'); });
  const last = A.getLastLocalChange(replacement)!; await ports.appendAndFlush(last);
  const resumed = fresh(); const reads = casIo.readPayloadBytes;
  await resumed.engine.recover(tx(1)); expect(calls).toBe(1); expect(casIo.readPayloadBytes).toBe(reads);
  const doc = await resumed.ports.current();
  expect(index(doc).get(j.metadataBatch.changes[0]!.expectedChangeHash)!.bytes).toEqual(exact);
  const candidates = A.getConflicts(doc.captions, 'title');
  const values = (candidates ? Object.values(candidates) : [doc.captions.title]).map(String).sort();
  expect(values).toEqual(scenario === 'after-descendant' ? ['Later replacement'] : ['Later replacement', 'Original transaction']);
});

it('only final strong/conflict/opaque closure is required; weak and hidden intermediate blobs do not block', async () => {
  const hidden = change(base, d => { d.resources.model = scalar(JSON.stringify(missingRef)); });
  const final = change(hidden, d => { d.resources.model = scalar(JSON.stringify(oldRef));
    d.resources.weakHistory = scalar(JSON.stringify(missingRef)); d.captions.body = scalar('Final visible body'); });
  await engine.remote(tx(1), A.save(final), id('pkg'));
  expect(String((await engine.view()).doc.captions.body)).toBe('Final visible body');
});

it.each(['conflict', 'opaque', 'unprotected', 'invalid-domain'])('missing/invalid final %s refuses activation before metadata writes', async kind => {
  await stageNew(); let final: Doc;
  if (kind === 'conflict') {
    const a = change(base, d => { d.resources.model = scalar(JSON.stringify(missingRef)); });
    const b = change(base, d => { d.resources.model = scalar(JSON.stringify(newRef)); });
    final = A.merge(A.clone(a), A.clone(b));
  } else final = change(base, d => {
    if (kind === 'opaque') d.resources.opaque = scalar(JSON.stringify([missingRef]));
    else if (kind === 'unprotected') d.resources.model = scalar(JSON.stringify(newRef));
    else d.invalidDomain = true;
  });
  await expect(engine.remote(tx(1), A.save(final), id('pkg'))).rejects.toThrow();
  expect(ports.metadataWrites).toBe(0); expect(heads((await engine.view()).doc)).toEqual(heads(base));
});

it.each(['part', 'source', 'target', 'truncated-set', 'dependencies', 'unexpected-writer'])
('prepared %s corruption is quarantined without prefix publication or regenerated changes', async kind => {
  await stageNew(); await stopPrepared(diamond(), [newRef]); const j = await prepared();
  if (kind === 'part') await files.write(partKey(0), new Uint8Array([0, 1, 2]));
  else if (kind === 'source') await files.write(`journal/${tx(1)}/source-metadata.am`, new Uint8Array([0, 1, 2]));
  else if (kind === 'unexpected-writer') {
    const stray = change(base, d => { d.captions.body = scalar('Unexpected remote-barrier writer'); });
    await ports.appendAndFlush(A.getLastLocalChange(stray)!);
  } else {
    if (kind === 'target') j.target.identity.projectId = id('prj');
    if (kind === 'truncated-set') j.metadataBatch.changes.pop();
    if (kind === 'dependencies') j.metadataBatch.changes[0]!.dependencies = [];
    // Recomputing the integrity digest must not bypass semantic/source checks.
    j.metadataBatch.exactChangeSetDigest = seal(j); await files.write(journalKey(), jsonBytes(j));
  }
  const resumed = fresh(); const count = ports.metadataWrites;
  await expect(resumed.engine.recover(tx(1))).rejects.toThrow();
  expect(resumed.ports.metadataWrites).toBe(0); expect(ports.metadataWrites).toBe(count);
  expect(heads((await resumed.engine.view()).doc)).toEqual(heads(base)); expect((await resumed.engine.view()).readOnly).toBe(true);
});

it.each(['journal', 'inventory', 'metadata'])('torn/quota %s write never acknowledges or exposes changed metadata', async kind => {
  const quota = new DOMException('Injected quota', 'QuotaExceededError');
  const store = kind === 'metadata' ? metadata : files;
  store.fault = { match: key => kind === 'journal' ? key.endsWith('/journal.json') : kind === 'inventory' ? key === 'inventory.json' : key.startsWith('metadata/'),
    afterBytes: 3, error: quota };
  const final = change(base, d => { d.captions.title = scalar('Must not acknowledge'); });
  await expect(engine.remote(tx(1), A.save(final), id('pkg'))).rejects.toMatchObject({ name: 'QuotaExceededError' });
  store.fault = undefined;
  expect(ports.publications).toBe(0); expect(heads((await engine.view()).doc)).toEqual(heads(base));
  if (kind === 'metadata') await expect(fresh().engine.recover(tx(1))).rejects.toThrow();
});

it('copied identity with a different bootstrap root fails before journaling; staging without a source lease retains old state', async () => {
  const wrong = A.from(JSON.parse(JSON.stringify(base))); // copied fields are not shared history
  await expect(engine.remote(tx(1), A.save(wrong), id('pkg'))).rejects.toThrow('root');
  expect(await files.read(journalKey(), LIMIT.journal)).toBeNull();
  const replaceIdentity = (d: Record<string, any>) => {
    d.identity = Object.fromEntries(Object.entries(target.identity).map(([key, value]) => [key, scalar(value)]));
  };
  const ambiguousIdentity = A.merge(change(base, replaceIdentity), change(base, replaceIdentity));
  expect(Object.keys(A.getConflicts(ambiguousIdentity, 'identity')!)).toHaveLength(2);
  await expect(engine.remote(tx(1), A.save(ambiguousIdentity), id('pkg'))).rejects.toThrow('conflicting identity');
  expect(await files.read(journalKey(), LIMIT.journal)).toBeNull();
  ports.checkpoint = async name => { if (name === 'staging') throw new Error('stop'); };
  const final = change(base, d => { d.captions.title = scalar('New'); });
  await expect(engine.remote(tx(1), A.save(final), id('pkg'))).rejects.toThrow('stop');
  expect(await fresh().engine.recover(tx(1))).toBe('discarded-staging');
  expect(heads((await engine.view()).doc)).toEqual(heads(base));
});

it('canonical descriptor bytes reject duplicates, dangerous keys and noncanonical sets', async () => {
  expect(canonical({ '2': 'b', '10': 'a', x: '😀' })).toBe('{"10":"a","2":"b","x":"😀"}');
  expect(() => parse(encoder.encode('{"a":1,"a":2}'))).toThrow('duplicate');
  expect(() => parse(encoder.encode('{"__proto__":{}}'))).toThrow('unsafe');
  expect(() => canonical('\ud800')).toThrow('string');
  expect(() => canonical('e\u0301')).toThrow('string');
  expect(() => refs([{ ...oldRef, digest: oldRef.digest + '\n' }])).toThrow('hash');
  expect(() => refs([{ ...oldRef, mediaType: oldRef.mediaType + '\n' }])).toThrow('media type');
  const final = change(base, d => { d.captions.title = scalar('New'); }); await stopPrepared(final);
  const j = await prepared(); j.metadataBatch.baseHeads.push(j.metadataBatch.baseHeads[0]!);
  j.metadataBatch.exactChangeSetDigest = seal(j);
  expect(() => decodeJournal(jsonBytes(j))).toThrow('hash set');
});

it('missing inventory on reopen is explicitly read-only repair, not an editable project', async () => {
  await files.write('inventory.json', jsonBytes([]));
  expect(await engine.view()).toMatchObject({ readOnly: true, repairRequired: true });
  for (const action of ['edit', 'export', 'gc'] as const) await expect(engine.request(action)).rejects.toThrow('inventory');
});
