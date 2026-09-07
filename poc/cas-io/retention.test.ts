import { beforeEach, afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { CasCandidate, type BlobRef } from './candidate';
import { NodeIo } from './node-io';
import { RetentionCandidate, emptySnapshot, ROOT_KINDS, type Snapshot } from './retention';
import { RetentionFiles } from './retention-node';

const parent = resolve('.artifacts/fixtures');
const id = () => `prj_${randomBytes(16).toString('hex')}`;
const tx = () => randomBytes(16).toString('hex');
const bytes = new TextEncoder().encode('Small synthetic shared model payload');
const ref: BlobRef = { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length };
async function* source(value = bytes) { yield value; }
function roots(...refs: BlobRef[]): Snapshot {
  const state = emptySnapshot(); state.roots.current = [...refs].sort((a, b) => a.sha256.localeCompare(b.sha256)); return state;
}
let root: string, io: NodeIo, files: RetentionFiles, cas: CasCandidate, candidate: RetentionCandidate, first: string, second: string;
const fresh = () => new RetentionCandidate(new RetentionFiles(resolve(root, 'retention'), io));
beforeEach(async () => {
  await mkdir(parent, { recursive: true }); root = await mkdtemp(resolve(parent, 'retention-probe-'));
  io = new NodeIo(resolve(root, 'cas')); files = new RetentionFiles(resolve(root, 'retention'), io);
  cas = new CasCandidate(io); candidate = new RetentionCandidate(files);
  await candidate.initialize(); first = id(); second = id(); await candidate.register(first); await candidate.register(second);
});
afterEach(async () => {
  const path = resolve(root);
  if (!path.startsWith(parent + sep + 'retention-probe-') || path === parent) throw new Error('unsafe synthetic cleanup');
  await rm(path, { recursive: true, force: true });
});
async function set(project: string, next: Snapshot, freshBytes = false) {
  const before = await candidate.inspect(project);
  await candidate.update(project, before.revision, next, freshBytes ? [{ transactionId: tx(), ref, source: source() }] : []);
}
async function orphan() {
  await set(first, roots(ref), true); await set(first, roots()); await candidate.collect(100, 10);
}
function deferred() {
  let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { resolve, promise };
}

it('retains a shared model until the last Project reference disappears and its full grace elapses', async () => {
  await set(first, roots(ref), true); await set(second, roots(ref));
  expect(await io.blobCount()).toBe(1); const payloadReads = io.readPayloadBytes;
  await set(first, roots()); expect((await candidate.collect(100, 10)).deleted).toEqual([]);
  expect(await cas.hasVerified(ref)).toBe(true);
  await set(second, roots()); expect(await fresh().collect(200, 10)).toEqual({ deleted: [], marked: [ref.sha256] });
  expect((await candidate.collect(209, 10)).deleted).toEqual([]); expect(await cas.hasVerified(ref)).toBe(true);
  expect((await fresh().collect(210, 10)).deleted).toEqual([ref.sha256]);
  expect(await cas.hasVerified(ref)).toBe(false); expect(await io.read(`blobs/${ref.sha256}`)).toBeNull();
  expect(io.readPayloadBytes).toBe(payloadReads); // Receipt/stat checks, never rehash a retained model.
  expect((await candidate.collect(220, 10)).deleted).toEqual([]);
});

it('retains every validated root class and active derivative independently of display or runtime residency', async () => {
  const snapshot = emptySnapshot(); const inputs: { transactionId: string; ref: BlobRef; source: AsyncIterable<Uint8Array> }[] = [];
  for (const kind of ROOT_KINDS) {
    const b = new TextEncoder().encode(`Synthetic ${kind} closure`);
    const r = { sha256: createHash('sha256').update(b).digest('hex'), byteLength: b.length };
    snapshot.roots[kind] = [r]; inputs.push({ transactionId: tx(), ref: r, source: source(b) });
  }
  // A derived source/display/preview/interaction is already in the validated current closure.
  snapshot.roots.current.push(ref); snapshot.roots.current.sort((a, b) => a.sha256.localeCompare(b.sha256));
  inputs.push({ transactionId: tx(), ref, source: source() });
  await candidate.update(first, 0, snapshot, inputs);
  const before = await candidate.inspect(first);
  expect((await candidate.collect(100_000, 10)).deleted).toEqual([]);
  expect(await candidate.inspect(first)).toEqual(before); expect(await io.blobCount()).toBe(ROOT_KINDS.length + 1);
  await set(first, roots()); await candidate.collect(100_001, 10);
  expect((await candidate.collect(100_011, 10)).deleted).toHaveLength(ROOT_KINDS.length + 1);
});

it('resets the old grace mark when a Project starts using the model again', async () => {
  await orphan(); await set(second, roots(ref)); await set(second, roots());
  expect((await candidate.collect(120, 10)).deleted).toEqual([]);
  expect((await candidate.collect(129, 10)).deleted).toEqual([]);
  await expect(candidate.collect(119, 10)).rejects.toThrow('clock moved backwards');
  expect((await candidate.collect(130, 10)).deleted).toEqual([ref.sha256]);
});

it('globally refuses missing/corrupt/unknown/unfinished inventories rather than treating them as empty', async () => {
  await orphan(); const key = `projects/${second}.json`, original = (await files.read(key))!;
  for (const state of ['missing', 'corrupt', 'future', 'unreadable', 'pending', 'journal', 'opaque', 'incompleteRoots']) {
    const value = JSON.parse(new TextDecoder().decode(original));
    if (state === 'missing') await unlink(files.path(key));
    else if (state === 'corrupt') await files.write(key, new TextEncoder().encode('{broken'));
    else {
      if (state === 'future') value.current.schemaMajor = 3;
      if (state === 'unreadable') value.current.readable = false;
      if (state === 'pending') value.pending = emptySnapshot();
      if (state === 'journal') value.current.unfinishedJournal = true;
      if (state === 'opaque') value.current.opaque = true;
      if (state === 'incompleteRoots') value.current.roots.current = [ref];
      await files.write(key, new TextEncoder().encode(JSON.stringify(value)));
    }
    await expect(fresh().collect(1000, 10), state).rejects.toThrow();
    expect(await cas.hasVerified(ref), state).toBe(true);
    await files.write(key, original);
  }
  expect((await candidate.collect(1000, 10)).deleted).toEqual([ref.sha256]);
});

it('preserves opaque inventory through known edits and refuses unsupported clearing or stale updates', async () => {
  const snapshot = roots(ref); snapshot.opaque = true; await set(first, snapshot, true);
  const removedKnownRoot = roots(); removedKnownRoot.opaque = true; await set(first, removedKnownRoot);
  expect((await candidate.inspect(first)).protected).toEqual([ref]);
  await expect(candidate.collect(1000, 10)).rejects.toThrow('opaque Project');
  const before = await candidate.inspect(first);
  await expect(candidate.update(first, before.revision, roots())).rejects.toThrow('cannot clear opaque');
  await expect(candidate.update(first, before.revision - 1, removedKnownRoot)).rejects.toThrow('stale');
  expect(await candidate.inspect(first)).toEqual(before); expect(await cas.hasVerified(ref)).toBe(true);
});

it('cannot clear an unfinished metadata journal through ordinary update or pending-inventory completion', async () => {
  const snapshot = roots(ref); snapshot.unfinishedJournal = true;
  await set(first, snapshot, true); const before = await candidate.inspect(first);
  await expect(candidate.update(first, before.revision, emptySnapshot())).rejects.toThrow('unfinished metadata');
  expect(await candidate.inspect(first)).toEqual(before);
  // A stored pending target cannot serve as an invented journal-completion proof.
  const key = `projects/${first}.json`;
  await files.write(key, new TextEncoder().encode(JSON.stringify({ ...before, pending: emptySnapshot() })));
  await expect(fresh().finishPending(first)).rejects.toThrow('completion refused');
  await expect(candidate.collect(1000, 10)).rejects.toThrow('unfinished metadata');
  expect(await cas.hasVerified(ref)).toBe(true);
});

it('serializes a second collector across publication-to-inventory transfer with the same writer', async () => {
  const arrived = deferred(), release = deferred();
  const publisher = new RetentionCandidate(files, async boundary => {
    if (boundary === 'blobsPublished') { arrived.resolve(); await release.promise; }
  });
  const publish = publisher.update(first, 0, roots(ref), [{ transactionId: tx(), ref, source: source() }]);
  await arrived.promise; let collected = false;
  const collecting = fresh().collect(1000, 10).then(result => { collected = true; return result; });
  await Promise.resolve(); expect(collected).toBe(false);
  release.resolve(); await publish; expect((await collecting).deleted).toEqual([]);
  expect(await cas.hasVerified(ref)).toBe(true); expect((await fresh().inspect(first)).protected).toEqual([ref]);
});

it('keeps an interrupted publication pending, then verifies the recorded target before finishing', async () => {
  const stopped = new RetentionCandidate(files, async boundary => { if (boundary === 'blobsPublished') throw new Error('injected stop'); });
  await expect(stopped.update(first, 0, roots(ref), [{ transactionId: tx(), ref, source: source() }])).rejects.toThrow('injected stop');
  expect((await candidate.inspect(first)).current.roots.current).toEqual([]);
  await expect(fresh().collect(1000, 10)).rejects.toThrow('unfinished metadata');
  await fresh().finishPending(first);
  expect((await candidate.inspect(first)).current.roots.current).toEqual([ref]);
  expect((await candidate.collect(1000, 10)).deleted).toEqual([]);
  await fresh().finishPending(first); expect((await candidate.inspect(first)).revision).toBe(1);
});

it.each(['deleteIntent', 'receiptRemoved', 'payloadRemoved'] as const)
('resumes exact orphan deletion after %s without making partial bytes published', async boundary => {
  await orphan(); const stopped = new RetentionCandidate(files, async point => { if (point === boundary) throw new Error('injected delete stop'); });
  await expect(stopped.collect(110, 10)).rejects.toThrow('injected delete stop');
  expect(await cas.hasVerified(ref)).toBe(boundary === 'deleteIntent');
  expect((await fresh().collect(110, 10)).deleted).toEqual([ref.sha256]);
  expect(await io.read(`blobs/${ref.sha256}`)).toBeNull(); expect(await cas.hasVerified(ref)).toBe(false);
  expect((await fresh().collect(111, 10)).deleted).toEqual([]);
});

it('requires verified restaging before a root can return after interrupted receipt removal', async () => {
  await orphan(); const stopped = new RetentionCandidate(files, async point => { if (point === 'receiptRemoved') throw new Error('injected stop'); });
  await expect(stopped.collect(110, 10)).rejects.toThrow('injected stop');
  await expect(set(second, roots(ref))).rejects.toThrow('missing required blob');
  expect((await candidate.inspect(second)).current.roots.current).toEqual([]);
  await expect(candidate.collect(120, 10)).rejects.toThrow('unfinished metadata');
  // Original source repair uses existing CAS under the same writer, with the
  // pending inventory already durable; this is not a product repair UI.
  await cas.import(tx(), ref, source()); await fresh().finishPending(second);
  expect((await candidate.collect(130, 10)).deleted).toEqual([]); expect(await cas.hasVerified(ref)).toBe(true);
  await set(second, roots()); await candidate.collect(131, 10);
  expect((await candidate.collect(140, 10)).deleted).toEqual([]);
  expect((await candidate.collect(141, 10)).deleted).toEqual([ref.sha256]);
});

it('refuses missing required or published bytes before any unrelated orphan is deleted', async () => {
  await orphan(); await set(second, roots(ref));
  await unlink(resolve(io.root, `blobs/${ref.sha256}`));
  await expect(candidate.collect(110, 10)).rejects.toThrow();
  // Independent fixture state for the metadata-write failure, not a fake repair.
  const b = new TextEncoder().encode('Second orphan'); const r = { sha256: createHash('sha256').update(b).digest('hex'), byteLength: b.length };
  // Clear only the synthetic second Project via the explicit validated empty target.
  await set(second, roots());
  await candidate.update(first, (await candidate.inspect(first)).revision, roots(r), [{ transactionId: tx(), ref: r, source: source(b) }]);
  await set(first, roots());
  // Corrupt published bytes are intentionally not silently skipped by collection.
  await expect(candidate.collect(120, 10)).rejects.toThrow();
  expect(await cas.hasVerified(r)).toBe(true);
});

it('retains payloads when a mark write is torn and refuses to infer an empty ledger on reopen', async () => {
  await orphan(); files.fault = { key: 'marks.json', afterBytes: 10 };
  await expect(candidate.collect(110, 10)).rejects.toThrow('injected retention quota');
  files.fault = undefined; await expect(fresh().collect(120, 10)).rejects.toThrow();
  expect(await cas.hasVerified(ref)).toBe(true); expect(await io.read(`blobs/${ref.sha256}`)).not.toBeNull();
});
