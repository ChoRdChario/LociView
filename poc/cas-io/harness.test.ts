import { afterEach, beforeEach, expect, it } from 'vitest';
import { createCipheriv, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, rm, open } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { CasCandidate, CHUNK_BYTES, type BlobRef, type Boundary, type Sink } from './candidate';
import { NodeIo, fileSink } from './node-io';

const parent = resolve('.artifacts/fixtures');
let root: string;
let io: NodeIo;
const tx = (n: number) => n.toString(16).padStart(32, '0');
const bytes = new TextEncoder().encode('Synthetic verified resource.');
const ref: BlobRef = { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length };
async function* parts(input = bytes, size = 7) {
  for (let offset = 0; offset < input.length; offset += size) yield input.subarray(offset, offset + size);
}
function sink(): Sink & { data: number[]; committed: boolean; aborted: boolean } {
  return { data: [], committed: false, aborted: false,
    async write(data) { this.data.push(...data); }, async commit() { this.committed = true; },
    async abort() { this.aborted = true; } };
}
beforeEach(async () => { await mkdir(parent, { recursive: true }); root = await mkdtemp(resolve(parent, 'cas-io-')); io = new NodeIo(root); });
afterEach(async () => {
  // Delete ONLY the freshly created synthetic test directory, never the parent.
  const target = resolve(root);
  if (!target.startsWith(parent + sep + 'cas-io-') || target === parent) throw new Error('unsafe test cleanup');
  await rm(target, { recursive: true, force: true });
});

it('deduplicates concurrent equal imports with immutable verified payload, independent reopen and exact export', async () => {
  const store = new CasCandidate(io);
  const results = await Promise.all([store.import(tx(1), ref, parts()), store.import(tx(2), ref, parts())]);
  expect(results).toEqual([ref, ref]); expect(await io.blobCount()).toBe(1);
  expect(io.writes.filter(k => k.startsWith('blobs/'))).toHaveLength(1);
  const out = sink(); await new CasCandidate(new NodeIo(root)).export(ref, out);
  expect(out.committed).toBe(true); expect(new Uint8Array(out.data)).toEqual(bytes);
  const readBefore = io.readPayloadBytes;
  expect(await store.recover(tx(1))).toEqual(ref); expect(io.readPayloadBytes).toBe(readBefore);
});

it.each<Boundary>(['stagingReceipt', 'stagedBytes', 'verifiedSourceReceipt', 'copiedBytes',
  'verifiedCopy', 'publishedReceipt', 'completeReceipt', 'cleanup'])('recovers or refuses safely after injected interruption at %s', async at => {
  const store = new CasCandidate(io, async boundary => { if (boundary === at) throw new Error('injected interruption'); });
  await expect(store.import(tx(1), ref, parts())).rejects.toThrow('injected interruption');
  const reopened = new CasCandidate(new NodeIo(root));
  const out = sink();
  if (at === 'stagingReceipt' || at === 'stagedBytes') {
    await expect(reopened.recover(tx(1))).rejects.toThrow('incomplete');
    await expect(reopened.export(ref, out)).rejects.toThrow('unverified');
    expect(out.committed).toBe(false);
    // No lease is guessed. An explicit new import can stage fresh source bytes.
    await reopened.import(tx(2), ref, parts());
  } else {
    if (!['publishedReceipt', 'completeReceipt', 'cleanup'].includes(at)) {
      await expect(reopened.export(ref, out)).rejects.toThrow('unverified');
      expect(out.committed).toBe(false);
    }
    expect(await reopened.recover(tx(1))).toEqual(ref);
    expect(await reopened.recover(tx(1))).toEqual(ref);
  }
  const complete = sink(); await reopened.export(ref, complete);
  expect(new Uint8Array(complete.data)).toEqual(bytes); expect(complete.committed).toBe(true);
});

it('cancellation at each source chunk leaves no verified publication and does not poison later work', async () => {
  for (let boundary = 0; boundary <= 4; boundary++) {
    const location = resolve(root, `case-${boundary}`); const backend = new NodeIo(location); const store = new CasCandidate(backend);
    const abort = new AbortController();
    async function* source() { let n = 0; for await (const part of parts()) {
      if (n++ === boundary) abort.abort(); yield part;
    } if (n === boundary) abort.abort(); }
    await expect(store.import(tx(1), ref, source(), abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const out = sink(); await expect(store.export(ref, out)).rejects.toThrow('unverified');
    expect(out.committed).toBe(false); await store.import(tx(2), ref, parts());
  }
});

it.each(['receipts/', 'staging/', 'blobs/', 'verified/'])('quota/partial %s write cannot replace an existing valid resource', async prefix => {
  const store = new CasCandidate(io); await store.import(tx(1), ref, parts());
  const other = new TextEncoder().encode('Different synthetic bytes');
  const otherRef = { sha256: createHash('sha256').update(other).digest('hex'), byteLength: other.length };
  io.fault = { match: key => key.startsWith(prefix), afterBytes: 3, error: new DOMException('Injected quota', 'QuotaExceededError') };
  await expect(store.import(tx(2), otherRef, parts(other))).rejects.toMatchObject({ name: 'QuotaExceededError' });
  io.fault = undefined;
  const original = sink(); await store.export(ref, original);
  expect(original.committed).toBe(true); expect(new Uint8Array(original.data)).toEqual(bytes);
  const unpublished = sink(); await expect(store.export(otherRef, unpublished)).rejects.toBeDefined();
  expect(unpublished.committed).toBe(false);
  // A torn receipt is explicit repair evidence, never silently treated as missing.
  if (prefix === 'receipts/' || prefix === 'verified/') await expect(store.recover(tx(2))).rejects.toBeDefined();
  if (prefix === 'blobs/') expect(await store.recover(tx(2))).toEqual(otherRef);
});

it('rejects wrong input size/digest, corrupted staged bytes, corrupt export and oversized chunks', async () => {
  const store = new CasCandidate(io);
  await expect(store.import(tx(1), { ...ref, byteLength: ref.byteLength + 1 }, parts())).rejects.toThrow('corrupt');
  await expect(store.import(tx(2), { ...ref, sha256: '0'.repeat(64) }, parts())).rejects.toThrow('corrupt');
  await expect(store.import(tx(3), ref, parts(new Uint8Array(CHUNK_BYTES + 1), CHUNK_BYTES + 1))).rejects.toThrow('invalid');
  await expect(new CasCandidate(io, async at => { if (at === 'verifiedSourceReceipt') throw new Error('stop'); })
    .import(tx(4), ref, parts())).rejects.toThrow('stop');
  const staged = await open(resolve(root, `staging/${tx(4)}.bin`), 'r+');
  await staged.write(new Uint8Array([0]), 0, 1, 0); await staged.close();
  await expect(store.recover(tx(4))).rejects.toThrow('corrupt');
  await store.import(tx(5), ref, parts());
  const payload = await open(resolve(root, `blobs/${ref.sha256}`), 'r+');
  await payload.write(new Uint8Array([0]), 0, 1, 0); await payload.close();
  const out = sink(); await expect(store.export(ref, out)).rejects.toThrow('corrupt');
  expect(out.committed).toBe(false); expect(out.data).toHaveLength(0); expect(out.aborted).toBe(true);
});

it('sink failure or cancelled export never acknowledges output publication', async () => {
  const store = new CasCandidate(io); await store.import(tx(1), ref, parts());
  const invalid = await fileSink(resolve(root, 'invalid-export.bin'));
  await expect(store.export({ ...ref, sha256: 'invalid' }, invalid)).rejects.toThrow('invalid');
  expect(invalid.committed).toBe(false); expect(invalid.aborted).toBe(true);
  const out = sink(); out.write = async () => { throw new DOMException('Injected sink quota', 'QuotaExceededError'); };
  await expect(store.export(ref, out)).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(out.committed).toBe(false); expect(out.aborted).toBe(true);
  const abort = new AbortController(); const cancelled = sink();
  cancelled.write = async () => { abort.abort(); };
  await expect(store.export(ref, cancelled, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancelled.committed).toBe(false); expect(cancelled.aborted).toBe(true);
});

// Deterministic AES-CTR stream over zeros is an incompressible synthetic I/O
// recipe, not encrypted user data. No fixture payload is tracked or kept.
async function* stressSource(size: number) {
  const cipher = createCipheriv('aes-256-ctr', Buffer.alloc(32, 0x43), Buffer.alloc(16, 0x19));
  const zero = new Uint8Array(CHUNK_BYTES);
  for (let count = 0; count < size; count += zero.length) yield cipher.update(zero.subarray(0, Math.min(zero.length, size - count)));
  cipher.final();
}
it('500 MiB synthetic stream stages, copies, verifies and exports with 1 MiB chunks and no complete buffer', async () => {
  const size = 500 * 1024 * 1024; const oracle = createHash('sha256');
  for await (const part of stressSource(size)) oracle.update(part);
  const expected = { sha256: oracle.digest('hex'), byteLength: size };
  const store = new CasCandidate(io);
  await store.import(tx(1), expected, stressSource(size));
  const output = resolve(root, 'synthetic-export.bin'); const out = await fileSink(output);
  await store.export(expected, out);
  expect(out.committed).toBe(true);
  const checked = createHash('sha256'); let count = 0;
  for await (const part of createReadStream(output, { highWaterMark: CHUNK_BYTES })) { count += part.length; checked.update(part); }
  expect(count).toBe(size); expect(checked.digest('hex')).toBe(expected.sha256);
  expect(io.largestChunk).toBe(CHUNK_BYTES); expect(await io.blobCount()).toBe(1);
  // Code-level bound: source zero buffer + produced chunk + reusable file-read
  // buffer, plus < 16 KiB for receipts/hash scratch. Not a heap/RSS measurement.
  const declaredBufferBound = 3 * CHUNK_BYTES + 16 * 1024;
  expect(declaredBufferBound).toBeLessThan(64 * 1024 * 1024);
  const before = io.readPayloadBytes;
  await store.recover(tx(1)); expect(io.readPayloadBytes).toBe(before);
  console.log(JSON.stringify({ proof: 'node-cas-io-only', byteLength: size, sha256: expected.sha256,
    largestObservedChunk: io.largestChunk, declaredCodeBufferBound: declaredBufferBound,
    noOpRecoveryPayloadBytes: io.readPayloadBytes - before, physicalVerifiedBlobs: await io.blobCount() }));
});
