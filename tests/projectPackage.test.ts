import { describe, expect, it } from 'vitest';
import { parseJsonWithoutDuplicateMembers } from '../src/core/json';
import { canonical } from '../src/domain/projectGraphSupport';
import type { JsonValue } from '../src/domain/values';
import { PACKAGE_LIMITS as L, SUMMARY_FIELDS, type Entry, type PackageManifest, type PackagePurpose } from '../src/projectPackage/contract';
import { checkPackageEntryTable, packageByteHash, PackageControlError, readManifestControl } from '../src/projectPackage/manifest';
import '@automerge/automerge'; // Node-only Wasm initialization.
import { ZipReader, BlobReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { fixture, limits as valueLimits } from './helpers/projectRecordsFixture';
import { ProjectMetadataSource, type MetadataLimits } from '../src/projectMetadata/source';
import { readProjectScene } from '../src/scene/projectProvider';
import { developmentContentVerifier, developmentContentBytes } from '../poc/scene-history/content-verifier';
import { WorkspaceSourceCapture } from '../src/projectPackage/workspaceSource';
import { WorkspaceArchive, writeWorkspaceArchive, workspaceInputChunks } from '../src/projectPackage/workspaceArchive';
import { PackageArchive } from '../src/projectPackage/zipArchive';
import { ZipCrc32 } from '../src/projectPackage/zipChecks';
import type { JsonObject } from '../src/domain/values';
import type { OriginBlobStore } from '../src/projectMetadata/blobStore';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type Fixture<P extends PackagePurpose> = Mutable<PackageManifest & { purpose: P }>;
const hash = (n: number) => n.toString(16).padStart(64, '0');
const id = (prefix: string, n = 1) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
const encode = (s: string) => new TextEncoder().encode(s);
const descriptor = (path: string, n: number, byteLength = 17): Entry => ({ path, sha256: hash(n), byteLength });
const metadataLimits: MetadataLimits = { ...valueLimits, maxWork: 1_000_000, maxChanges: 100,
  maxChangeBytes: 1_000_000, maxTotalBytes: 4_000_000, maxOperations: 10_000 };
async function workspaceFixture() {
  const records = fixture(), source = ProjectMetadataSource.bootstrap(records.schema, records.identity, metadataLimits).initialize(records);
  const rep = records.representationsById[id('rep')];
  const provider = await readProjectScene(source.read(), metadataLimits, developmentContentVerifier([
    { variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest },
  ]));
  const bodies = new Map<string, Uint8Array>();
  for (const record of [rep, ...Object.values(records.mediaResourcesById)] as JsonObject[])
    bodies.set((record.blob as JsonObject).digest as string, (await developmentContentBytes(record))!);
  const store: Pick<OriginBlobStore, 'openReadOnly'> = { openReadOnly: async ref => {
    const bytes = bodies.get(ref.digest as string)!;
    return { size: bytes.length, stream: () => new Blob([bytes as BlobPart]).stream() };
  } };
  const capture = await WorkspaceSourceCapture.prepare({ read: async () => ({ state: 'ready', source, provider, publication: 'fixture-publication' }) },
    source.token, store, metadataLimits);
  const options = { packageId: id('pkg'), createdByVersion: '0.0.1' };
  const parts: BlobPart[] = [];
  const generated = await writeWorkspaceArchive(capture, store, new WritableStream({ write(bytes) { parts.push(bytes.slice() as BlobPart); } }), options);
  return { source, capture, store, bodies, options, generated, file: new Blob(parts) };
}

// Independent fixed ZIP32 fixture encoder: no production CRC/writer/inspector calls.
const fixtureCrc = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};
function fixedZip(entries: readonly { path: string; bytes: Uint8Array }[]): Blob {
  const locals: BlobPart[] = [], directory: BlobPart[] = []; let offset = 0, centralSize = 0;
  for (const { path, bytes } of entries) {
    const name = encode(path), local = new Uint8Array(30 + name.length), central = new Uint8Array(46 + name.length), descriptor = new Uint8Array(16);
    const l = new DataView(local.buffer), c = new DataView(central.buffer), d = new DataView(descriptor.buffer), crc = fixtureCrc(bytes);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0808, true); l.setUint16(12, 33, true);
    l.setUint16(26, name.length, true); local.set(name, 30);
    d.setUint32(0, 0x08074b50, true); d.setUint32(4, crc, true); d.setUint32(8, bytes.length, true); d.setUint32(12, bytes.length, true);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0808, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true); central.set(name, 46);
    locals.push(local, bytes as BlobPart, descriptor); directory.push(central); offset += local.length + bytes.length + 16; centralSize += central.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer); e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  return new Blob([...locals, ...directory, end]);
}
async function unpackFixture(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer()), v = new DataView(bytes.buffer), end = bytes.length - 22;
  let at = v.getUint32(end + 16, true); const entries: { path: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < v.getUint16(end + 8, true); i++) {
    const size = v.getUint32(at + 24, true), nameLength = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true);
    entries.push({ path: new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)), bytes: bytes.slice(local + 30 + nameLength, local + 30 + nameLength + size) });
    at += 46 + nameLength;
  }
  return entries;
}

describe('connected Workspace ZIP generation and integrity (not admission or external saving)', () => {
  it('pulls one 64 KiB view at a time from a bounded raw chunk and counts empty/raw reads', async () => {
    const raw = new Uint8Array(L.chunkBytes); raw[raw.length - 1] = 7;
    let reads = 0, charged = 0;
    const input = new ReadableStream<Uint8Array>({ pull(c) {
      reads++; if (reads === 1) c.enqueue(raw); else if (reads === 2) c.enqueue(new Uint8Array()); else c.close();
    } }, { highWaterMark: 0 });
    const reader = workspaceInputChunks(input, new AbortController().signal, () => { charged++; }).getReader();
    try {
      for (let i = 0; i < raw.length / 65_536; i++) {
        const r = await reader.read(); expect(r.done).toBe(false); expect(r.value!.length).toBe(65_536);
        expect(r.value!.buffer).toBe(raw.buffer); expect(r.value!.byteOffset).toBe(i * 65_536);
        expect(reads).toBe(1); expect(charged).toBe(1); // No next raw read or eager copy queue.
      }
      expect((await reader.read()).value).toHaveLength(0); expect(reads).toBe(2);
      expect((await reader.read()).done).toBe(true); expect(charged).toBe(3);
    } finally { reader.releaseLock(); }
    let cancelled = false;
    const oversized = workspaceInputChunks(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(L.chunkBytes + 1)); }, cancel() { cancelled = true; } }),
      new AbortController().signal, () => {}).getReader();
    try { await expect(oversized.read()).rejects.toThrow(/zip-input-budget/); } finally { oversized.releaseLock(); }
    expect(cancelled).toBe(true);
    let zeros = 0;
    const empty = workspaceInputChunks(new ReadableStream<Uint8Array>({ pull(c) { zeros++; c.enqueue(new Uint8Array()); } }, { highWaterMark: 0 }),
      new AbortController().signal, () => {}).getReader();
    try {
      for (let i = 0; i < L.streamChunks; i++) expect((await empty.read()).value).toHaveLength(0);
      await expect(empty.read()).rejects.toThrow(/zip-stream-budget/); expect(zeros).toBe(L.streamChunks);
    } finally { empty.releaseLock(); }
  });

  it('matches an independently encoded ZIP, reads with zip.js, and retains complete original metadata', async () => {
    const crc = new ZipCrc32(); crc.update(encode('1234')); crc.update(encode('56789'));
    expect(crc.digest()).toBe(0xcbf43926); expect(new ZipCrc32().digest()).toBe(0);
    const h = await workspaceFixture(), bytes = new Uint8Array(await h.file.arrayBuffer());
    expect(new Uint8Array(await fixedZip(await unpackFixture(h.file)).arrayBuffer())).toEqual(bytes);
    expect(h.generated.byteLength).toBe(bytes.length); expect(h.generated.sha256).toBe(packageByteHash(bytes));
    const reader = new ZipReader(new BlobReader(h.file), { useWebWorkers: false });
    try {
      const entries = await reader.getEntries(); expect(entries.map(e => e.filename)).toEqual((await unpackFixture(h.file)).map(e => e.path));
      const metadata = entries.find(e => e.filename === 'metadata.am')!;
      if (metadata.directory) throw Error('test metadata is a directory');
      expect(await metadata.getData(new Uint8ArrayWriter(), { checkSignature: true })).toEqual(h.capture.metadataBytes());
    } finally { await reader.close(); }
    const reopened = await WorkspaceArchive.inspect(h.file, metadataLimits);
    expect(reopened.source.originalChanges()).toEqual(h.source.originalChanges()); expect(reopened.archive.sha256).toBe(h.generated.sha256);
    expect(reopened.blobs).toEqual(h.capture.blobs);
    for (const max of [NaN, Infinity, -1, 1.5, L.sourceBytes + 1, h.capture.metadata.byteLength - 1])
      await expect(reopened.archive.entryBytes('metadata.am', max)).rejects.toThrow(/zip-buffer-budget/);
    const reading = reopened.archive.entryBytes('metadata.am', L.sourceBytes);
    await expect(reopened.archive.entryBytes('metadata.am', L.sourceBytes)).rejects.toThrow(/zip-buffer-busy/);
    expect(await reading).toEqual(h.capture.metadataBytes());
    const cancelled = new AbortController();
    const pending = reopened.archive.entryBytes('metadata.am', L.sourceBytes, cancelled.signal); cancelled.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(await reopened.archive.entryBytes('metadata.am', L.sourceBytes)).toEqual(h.capture.metadataBytes());
    const second: BlobPart[] = [];
    await writeWorkspaceArchive(h.capture, h.store, new WritableStream({ write(b) { second.push(b.slice() as BlobPart); } }), h.options);
    expect(new Uint8Array(await new Blob(second).arrayBuffer())).toEqual(bytes);
  });

  it('rejects nonexact local/central/descriptor/end records and archive prefix/suffix bytes', async () => {
    const h = await workspaceFixture(), bytes = new Uint8Array(await h.file.arrayBuffer()), v = new DataView(bytes.buffer);
    const end = bytes.length - 22, central = v.getUint32(end + 16, true), descriptor = 30 + v.getUint16(26, true) + v.getUint32(central + 24, true);
    const mutations: [number, number, number][] = [
      [0, 0, 4], [4, 21, 2], [6, 0x0800, 2], [8, 8, 2], [10, 1, 2], [12, 34, 2], [14, 1, 4], [18, 1, 4], [22, 1, 4], [28, 1, 2],
      [central + 4, 0x314, 2], [central + 6, 45, 2], [central + 8, 0x0809, 2], [central + 10, 8, 2], [central + 12, 1, 2],
      [central + 14, 34, 2], [central + 20, 0, 4], [central + 30, 1, 2], [central + 32, 1, 2], [central + 34, 1, 2],
      [central + 36, 1, 2], [central + 38, 0xa1ff0000, 4], [central + 42, 1, 4],
      [descriptor, 0, 4], [descriptor + 4, 1, 4], [descriptor + 8, 0, 4], [descriptor + 12, 0, 4],
      [end, 0, 4], [end + 4, 1, 2], [end + 6, 1, 2], [end + 8, 1, 2], [end + 12, 0, 4], [end + 16, 0, 4], [end + 20, 1, 2],
    ];
    for (const [at, value, width] of mutations) {
      const changed = bytes.slice(), data = new DataView(changed.buffer);
      if (width === 2) data.setUint16(at, value, true); else data.setUint32(at, value, true);
      await expect(PackageArchive.inspect(new Blob([changed]))).rejects.toThrow();
    }
    for (const file of [new Blob([new Uint8Array([0]), h.file]), new Blob([h.file, new Uint8Array([0])]), h.file.slice(0, -1), new Blob()])
      await expect(PackageArchive.inspect(file)).rejects.toThrow();
  });

  it('rejects wrong entry paths/order, CRC/hash corruption and nested ZIP despite recomputed CRC', async () => {
    const h = await workspaceFixture(), entries = await unpackFixture(h.file);
    for (const altered of [entries.slice(1), [...entries].reverse(), [...entries, entries[0]!],
      entries.map((e, i) => i === 2 ? { ...e, path: '../metadata.am' } : e), entries.map((e, i) => i === 2 ? { ...e, path: 'manifest.json' } : e)])
      await expect(PackageArchive.inspect(fixedZip(altered))).rejects.toThrow();
    const badHash = entries.map(e => ({ path: e.path, bytes: e.bytes.slice() })); badHash.at(-1)!.bytes[0] = badHash.at(-1)!.bytes[0]! ^ 1;
    await expect(PackageArchive.inspect(fixedZip(badHash))).rejects.toThrow(/entry-table/);
    const corrupt = new Uint8Array(await h.file.arrayBuffer()); corrupt[43] = corrupt[43]! ^ 1;
    await expect(PackageArchive.inspect(new Blob([corrupt]))).rejects.toThrow();
    const corruptBody = new Uint8Array(await h.file.arrayBuffer());
    const payloadAt = entries.slice(0, -1).reduce((n, e) => n + 30 + e.path.length + e.bytes.length + 16, 0) + 30 + entries.at(-1)!.path.length;
    corruptBody[payloadAt] = corruptBody[payloadAt]! ^ 1;
    await expect(PackageArchive.inspect(new Blob([corruptBody]))).rejects.toThrow(/zip-crc/);
    for (const signature of [[0x50, 0x4b, 3, 4], [0x50, 0x4b, 5, 6], [0x50, 0x4b, 7, 8]]) {
      const altered = entries.map(e => ({ path: e.path, bytes: e.bytes.slice() })); altered.at(-1)!.bytes.set(signature);
      await expect(PackageArchive.inspect(fixedZip(altered))).rejects.toThrow(/nested-zip/);
    }
  });

  it('rejects a plausible but false summary/heads/closure after raw ZIP integrity passes', async () => {
    const h = await workspaceFixture(), original = await unpackFixture(h.file);
    for (const change of ['summary', 'heads', 'closure', 'purpose'] as const) {
      let entries = original.map(e => ({ path: e.path, bytes: e.bytes.slice() }));
      const manifest = JSON.parse(new TextDecoder().decode(entries[0]!.bytes));
      if (change === 'summary') manifest.summary.fieldClasses.pop();
      if (change === 'heads') manifest.targetHeads = [hash(999)];
      if (change === 'purpose') { manifest.purpose = 'clean'; manifest.summary.scope = 'snapshot'; }
      if (change === 'closure') {
        const removed = manifest.blobs.pop(); entries = entries.filter(e => e.path !== removed.path);
        recount(manifest);
      }
      entries[0]!.bytes = encode(canonical(manifest)); entries[1]!.bytes = encode(packageByteHash(entries[0]!.bytes));
      const file = fixedZip(entries); await expect(PackageArchive.inspect(file)).resolves.toMatchObject({ kind: 'package-archive-integrity' });
      await expect(WorkspaceArchive.inspect(file, metadataLimits)).rejects.toThrow(new RegExp(`workspace-${change}`));
    }
    await expect(WorkspaceArchive.inspect(h.file, { ...metadataLimits, maxChangeBytes: 1 })).rejects.toThrow();
  });

  it('does not complete a bad-body or failed/failed-close sink, and aborts before writing on invalid controls', async () => {
    const h = await workspaceFixture(), first = h.bodies.values().next().value!;
    first[first.length - 1] = first[first.length - 1]! ^ 1;
    let closed = false, aborted = false;
    await expect(writeWorkspaceArchive(h.capture, h.store, new WritableStream({ close() { closed = true; }, abort() { aborted = true; } }), h.options)).rejects.toThrow();
    expect(closed).toBe(false); expect(aborted).toBe(true);
    for (const stage of ['write', 'close'] as const) {
      const good = await workspaceFixture();
      await expect(writeWorkspaceArchive(good.capture, good.store, new WritableStream({ [stage]() { throw Error(`synthetic ${stage} failure`); } }), good.options)).rejects.toThrow(`synthetic ${stage} failure`);
    }
    let writes = 0; aborted = false;
    await expect(writeWorkspaceArchive(h.capture, h.store, new WritableStream({ write() { writes++; }, abort() { aborted = true; } }),
      { ...h.options, packageId: 'invalid' })).rejects.toThrow();
    expect(writes).toBe(0); expect(aborted).toBe(true);
  });

  it('cancels a blocked entry and a pre-aborted reader without returning completion', async () => {
    const h = await workspaceFixture(), abort = new AbortController(); let entered!: () => void, cancelled = false, closed = false;
    const reading = new Promise<void>(resolve => { entered = resolve; });
    const result = writeWorkspaceArchive(h.capture, { openReadOnly: async ref => ({ size: ref.byteLength as number,
      stream: () => new ReadableStream<Uint8Array>({ pull() { entered(); return new Promise<void>(() => {}); }, cancel() { cancelled = true; } }, { highWaterMark: 0 }) }) },
      new WritableStream({ close() { closed = true; } }), { ...h.options, signal: abort.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' }); await reading; abort.abort(); await rejected;
    expect(cancelled).toBe(true); expect(closed).toBe(false);
    await expect(WorkspaceArchive.inspect(h.file, metadataLimits, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
function payloads(m: Mutable<PackageManifest>): Entry[] {
  const result = m.purpose === 'review' ? [m.snapshot] : m.purpose === 'contribution'
    ? m.changes.map(c => ({ path: `changes/${String(c.ordinal).padStart(8, '0')}.amchange`, sha256: c.bytesSha256, byteLength: c.byteLength }))
    : [m.metadata];
  if (m.purpose === 'backup') result.push(m.protectedInventory, m.exchangeBases,
    ...m.baseEvidence.map(e => ({ ...e, path: `base-evidence/sha256/${e.sha256}` })));
  return [...result, ...m.blobs];
}
function recount(m: Mutable<PackageManifest>): void {
  const entries = payloads(m);
  m.payloadTotals = { entryCount: entries.length, uncompressedBytes: entries.reduce((n, e) => n + e.byteLength, 0),
    largestEntryBytes: Math.max(0, ...entries.map(e => e.byteLength)) };
  m.summary.blobEntryCount = m.blobs.length;
  m.summary.blobBytes = m.blobs.reduce((n, e) => n + e.byteLength, 0);
}
function example<P extends PackagePurpose>(purpose: P): Fixture<P> {
  const causal = { identity: { projectId: id('prj'), historyEpoch: id('hep'), lineageSeed: hash(2) },
    metadataEnvelope: { adapter: 'automerge', adapterFormatVersion: 'lociview-automerge-atomic-map-1',
      lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: hash(3) } }, targetHeads: [hash(4)] };
  const branch = purpose === 'review' ? { snapshotId: id('snp'), snapshot: descriptor('review.json', 11) }
    : purpose === 'contribution' ? { ...causal, base: { workspacePackageId: id('pkg', 2), workspaceManifestSha256: hash(12), heads: [hash(3)] },
      changes: [{ ordinal: 0, expectedChangeHash: hash(4), dependencies: [hash(3)], byteLength: 19, bytesSha256: hash(13) }] }
    : { ...causal, metadata: descriptor('metadata.am', 14), ...(purpose === 'backup' ? {
      protectedInventory: descriptor('protected-inventory.json', 15), exchangeBases: descriptor('exchange-bases.json', 16),
      baseEvidence: [{ sha256: hash(17), byteLength: 21 }, { sha256: hash(18), byteLength: 23 }],
    } : {}) };
  const m = { format: 'lociview-project-package', wireVersion: '1', packageId: id('pkg'), createdByVersion: '0.0.1', purpose,
    summary: { algorithm: 'lociview-project-summary-1', scope: purpose === 'contribution' ? 'baseDelta' :
      purpose === 'clean' || purpose === 'review' ? 'snapshot' : 'entireHistory', entityClasses: [], fieldClasses: [], blobEntryCount: 0, blobBytes: 0 },
    blobs: [descriptor(`blobs/sha256/${hash(21)}`, 21, 25)], payloadTotals: {}, ...branch } as unknown as Fixture<P>;
  recount(m); return m;
}
const serialized = (m: Mutable<PackageManifest>) => canonical(m as unknown as JsonValue);
const readBytes = (bytes: Uint8Array) => readManifestControl(bytes, encode(packageByteHash(bytes)));
const read = (m: Mutable<PackageManifest>) => readBytes(encode(serialized(m)));

describe('bounded duplicate-aware raw JSON (opt-in; legacy grammar unchanged)', () => {
  it('counts root at depth zero and each value, including empty containers', () => {
    expect(parseJsonWithoutDuplicateMembers('{"a":[0,{}]}', { maxDepth: 2, maxNodes: 4 })).toEqual({ a: [0, {}] });
    expect(() => parseJsonWithoutDuplicateMembers('{"a":[0,{}]}', { maxDepth: 1, maxNodes: 4 })).toThrow('JSON limit');
    expect(() => parseJsonWithoutDuplicateMembers('{"a":[0,{}]}', { maxDepth: 2, maxNodes: 3 })).toThrow('JSON limit');
    expect(parseJsonWithoutDuplicateMembers('[]', { maxDepth: 0, maxNodes: 1 })).toEqual([]);
    expect(() => parseJsonWithoutDuplicateMembers('[0]', { maxDepth: 0, maxNodes: 2 })).toThrow('JSON limit');
  });
  it('rejects depth/nodes at N+1 during scanning, without constructing the final document', () => {
    const nest = (n: number) => '['.repeat(n) + '0' + ']'.repeat(n);
    expect(() => parseJsonWithoutDuplicateMembers(nest(32), L)).not.toThrow();
    expect(() => parseJsonWithoutDuplicateMembers(nest(33), L)).toThrow('JSON limit');
    expect(() => parseJsonWithoutDuplicateMembers(nest(20_000), L)).toThrow('JSON limit');
    expect(() => parseJsonWithoutDuplicateMembers(`[${'0,'.repeat(L.maxNodes - 2)}0]`, L)).not.toThrow();
    expect(() => parseJsonWithoutDuplicateMembers(`[${'0,'.repeat(L.maxNodes - 1)}0]`, L)).toThrow('JSON limit');
    expect(() => parseJsonWithoutDuplicateMembers(nest(40))).not.toThrow();
    expect(() => parseJsonWithoutDuplicateMembers('0', { maxDepth: 1, maxNodes: 0 })).toThrow('invalid JSON limits');
  });
  it('retains decoded duplicate-key rejection and unbudgeted compatible JSON', () => {
    expect(() => parseJsonWithoutDuplicateMembers('{"a":1,"\\u0061":2}', L)).toThrow('duplicate JSON');
    expect(() => parseJsonWithoutDuplicateMembers('{"a":1,"a":2}')).toThrow('duplicate JSON');
    expect(parseJsonWithoutDuplicateMembers(' \r\n {"a": -0, "b":[true,null,"a\\nb"]} ')).toEqual({ a: -0, b: [true, null, 'a\nb'] });
  });
});

describe('package manifest structural preflight (not payload/DAG/ZIP admission)', () => {
  it.each<PackagePurpose>(['teamWorkspace', 'contribution', 'backup', 'clean', 'review'])('accepts closed %s and derives exact ordered entry descriptors', purpose => {
    const m = example(purpose), control = read(m);
    expect(control.manifest).toEqual(m);
    expect(control.entries.slice(2)).toEqual(payloads(m));
    expect(control.entries.slice(0, 2).map(e => e.path)).toEqual(['manifest.json', 'manifest.sha256']);
    expect(control.archiveByteLength).toBe(22 + control.entries.reduce((n, e) => n + 92 + e.path.length * 2 + e.byteLength, 0));
    expect(Object.isFrozen(control.manifest.summary.entityClasses)).toBe(true);
    expect(Object.isFrozen(control.entries[2])).toBe(true);
    checkPackageEntryTable(control, control.entries, control.archiveByteLength);
    // Deliberately fictitious payload digests: this result cannot grant import authority.
    expect(control.kind).toBe('manifest-control');
  });
  it('binds original canonical bytes independently of caller mutation', () => {
    expect(packageByteHash(encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const bytes = encode(serialized(example('teamWorkspace'))), checksum = encode(packageByteHash(bytes));
    const control = readManifestControl(bytes, checksum); bytes.fill(0); checksum.fill(0);
    expect(control.manifest.purpose).toBe('teamWorkspace');
    expect(Object.isFrozen(SUMMARY_FIELDS.assetsById)).toBe(true);
  });
  it('rejects noncanonical, duplicate, malformed Unicode and unsafe raw input', () => {
    const valid = serialized(example('teamWorkspace'));
    const cases = [valid + '\n', '\ufeff' + valid, valid.replace('{', '{ '),
      valid.replace('"wireVersion":"1"', '"wireVersion":"1","wireVersion":"1"'),
      valid.replace('"wireVersion":"1"', '"wireVersion":"1","wire\\u0056ersion":"1"'),
      valid.replace('"createdByVersion":"0.0.1"', '"createdByVersion":"\\ud800"'),
      valid.replace('"createdByVersion":"0.0.1"', '"createdByVersion":"e\\u0301"'),
      valid.replace('"blobEntryCount":1', '"blobEntryCount":1e0'),
      valid.replace('"blobEntryCount":1', '"blobEntryCount":-0'),
      valid.replace('"createdByVersion":"0.0.1"', '"__proto__":{},"createdByVersion":"0.0.1"'),
      '[]', 'null', '{', '[1,]', '"' + 'x'.repeat(L.maxStringScalars + 1) + '"'];
    for (const text of cases) expect(() => readBytes(encode(text))).toThrow(PackageControlError);
    expect(() => readBytes(new Uint8Array([0xff]))).toThrow(PackageControlError);
    expect(() => readManifestControl(encode(valid), encode(hash(999)))).toThrow('checksum');
    expect(() => readManifestControl(encode(valid), encode(packageByteHash(encode(valid)).toUpperCase()))).toThrow('checksum');
    expect(() => readManifestControl(encode(valid), encode(packageByteHash(encode(valid)) + '\n'))).toThrow('control-bytes');
    expect(() => readBytes(new Uint8Array(L.controlBytes + 1))).toThrow('control-bytes');
  });
  it('rejects unknown/missing/foreign-purpose fields and malformed identities or heads', () => {
    const original = example('teamWorkspace');
    const cases: unknown[] = [ { ...original, extra: 1 }, { ...original, memo: null }, { ...original, packageId: id('snp') },
      { ...original, createdByVersion: '日本語' }, { ...original, wireVersion: '2' }, { ...original, purpose: 'unknown' },
      { ...original, metadata: null }, { ...original, metadata: { ...original.metadata, path: '../metadata.am' } },
      { ...original, identity: { ...original.identity, extra: 1 } }, { ...original, targetHeads: [] },
      { ...original, targetHeads: [hash(2), hash(1)] }, { ...original, targetHeads: [hash(2), hash(2)] },
      { ...original, metadataEnvelope: { ...original.metadataEnvelope, adapter: 'other' } },
      { ...original, metadataEnvelope: { ...original.metadataEnvelope, lineageProof: { ...original.metadataEnvelope.lineageProof, extra: 1 } } },
      { ...example('review'), identity: original.identity }, { ...example('review'), snapshotId: id('prj') },
      { ...example('clean'), base: example('contribution').base } ];
    for (const key of ['format', 'packageId', 'summary', 'blobs', 'payloadTotals', 'identity', 'metadataEnvelope', 'targetHeads', 'metadata']) {
      const missing = { ...original } as Record<string, unknown>; delete missing[key]; cases.push(missing);
    }
    for (const m of cases) expect(() => readBytes(encode(canonical(m as JsonValue)))).toThrow(PackageControlError);
    for (const memo of ['', '記録', '😀'.repeat(256)]) { const m = example('teamWorkspace'); m.memo = memo; expect(() => read(m)).not.toThrow(); }
    for (const memo of ['😀'.repeat(257), 'a\nb']) { const m = example('teamWorkspace'); m.memo = memo; expect(() => read(m)).toThrow(); }
  });
  it('rejects invalid summary vocabulary, count ordering, scope and physical blob totals', () => {
    const m = example('teamWorkspace'); m.summary.entityClasses = [{ class: 'captionsById', count: 2 }];
    m.summary.fieldClasses = [{ class: 'captionsById.body', count: 1 }]; expect(() => read(m)).not.toThrow();
    for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 3]) {
      const bad = structuredClone(m); bad.summary.fieldClasses[0]!.count = count; expect(() => read(bad)).toThrow();
    }
    for (const bad of [ { ...m.summary, scope: 'snapshot' }, { ...m.summary, blobBytes: 26 },
      { ...m.summary, blobEntryCount: 2 }, { ...m.summary, entityClasses: [{ class: 'unknown', count: 1 }] },
      { ...m.summary, fieldClasses: [{ class: 'captionsById.secret', count: 1 }] },
      { ...m.summary, entityClasses: [...m.summary.entityClasses, ...m.summary.entityClasses] },
      { ...m.summary, entityClasses: [{ class: 'project', count: 1 }, ...m.summary.entityClasses] } ])
      expect(() => readBytes(encode(canonical({ ...m, summary: bad } as unknown as JsonValue)))).toThrow();
    const snapshot = example('review'); snapshot.summary.entityClasses = [{ class: 'assetsById', count: 1 }];
    snapshot.summary.fieldClasses = [{ class: 'assetsById.record', count: 1 }]; expect(() => read(snapshot)).not.toThrow();
    const clean = example('clean'); clean.summary = snapshot.summary; expect(() => read(clean)).toThrow();
    snapshot.summary.entityClasses = [{ class: 'opaque', count: 1 }]; snapshot.summary.fieldClasses = [];
    expect(() => read(snapshot)).toThrow();
  });
  it('checks topology and ready-hash order, not chronological or global hash order', () => {
    const m = example('contribution');
    const change = (n: number, deps: number[], ordinal: number) => ({ ordinal, expectedChangeHash: hash(n),
      dependencies: deps.map(hash), byteLength: 17, bytesSha256: hash(n + 30) });
    // Hash 4 only becomes ready after 8, while independent 9 was ready from the start.
    m.changes = [change(8, [3], 0), change(4, [8], 1), change(9, [3], 2)]; recount(m); expect(() => read(m)).not.toThrow();
    for (const changes of [ [change(9, [3], 0), change(8, [3], 1)], [change(8, [3], 0), change(9, [3], 1), change(4, [8], 2)],
      [change(8, [9], 0), change(9, [3], 1)], [change(8, [8], 0)], [change(8, [3], 1)],
      [change(8, [3], 0), change(8, [3], 1)], [change(8, [3, 3], 0)] ]) {
      m.changes = changes; recount(m); expect(() => read(m)).toThrow();
    }
    m.changes = []; recount(m); expect(() => read(m)).not.toThrow(); // D empty does not imply no blob restaging.
  });
  it('rejects unordered/duplicate blobs and evidence, digest length conflicts and false totals', () => {
    const m = example('backup');
    for (const bad of [ { ...m, blobs: [...m.blobs, ...m.blobs] }, { ...m, baseEvidence: [...m.baseEvidence].reverse() },
      { ...m, baseEvidence: [m.baseEvidence[0]!, m.baseEvidence[0]!] },
      { ...m, metadata: { ...m.metadata, sha256: m.blobs[0]!.sha256 } },
      { ...m, payloadTotals: { ...m.payloadTotals, entryCount: 1 } },
      { ...m, payloadTotals: { ...m.payloadTotals, uncompressedBytes: m.payloadTotals.uncompressedBytes + 1 } },
      { ...m, payloadTotals: { ...m.payloadTotals, largestEntryBytes: 1 } } ]) expect(() => read(bad)).toThrow();
    expect(read(m).manifest.summary.blobEntryCount).toBe(1); // Evidence files are not blob entries.
  });
  it('checks descriptor limits at N and N+1 without allocating declared payloads', () => {
    const m = example('teamWorkspace'); m.metadata.byteLength = L.sourceBytes;
    m.blobs[0]!.byteLength = L.blobBytes; recount(m); expect(() => read(m)).not.toThrow();
    m.blobs[0]!.byteLength++; recount(m); expect(() => read(m)).toThrow();
    m.blobs[0]!.byteLength = 0; m.metadata.byteLength++; recount(m); expect(() => read(m)).toThrow();
    m.metadata.byteLength = 0; m.targetHeads = Array.from({ length: L.heads }, (_, i) => hash(i)); recount(m); expect(() => read(m)).not.toThrow();
    m.targetHeads.push(hash(L.heads)); expect(() => read(m)).toThrow();
    m.targetHeads = [hash(4)]; m.blobs = Array.from({ length: L.blobCount }, (_, i) => descriptor(`blobs/sha256/${hash(i + 100)}`, i + 100, 0));
    recount(m); expect(() => read(m)).not.toThrow();
    m.blobs.push(descriptor(`blobs/sha256/${hash(2000)}`, 2000, 0)); recount(m); expect(() => read(m)).toThrow();
    const contribution = example('contribution'); contribution.changes[0]!.byteLength = L.changeBytes; recount(contribution);
    expect(() => read(contribution)).not.toThrow(); contribution.changes[0]!.byteLength++; recount(contribution); expect(() => read(contribution)).toThrow();
    const backup = example('backup'); backup.protectedInventory.byteLength = L.controlBytes; recount(backup); expect(() => read(backup)).not.toThrow();
    backup.protectedInventory.byteLength++; recount(backup); expect(() => read(backup)).toThrow();
  });
  it('bounds aggregate changes and evidence separately from per-entry sizes and counts', () => {
    const contribution = example('contribution');
    const changes = (n: number, size: number) => Array.from({ length: n }, (_, i) => ({ ordinal: i,
      expectedChangeHash: hash(i + 10), dependencies: [hash(3)], byteLength: size, bytesSha256: hash(i + 2000) }));
    contribution.changes = changes(8, L.changeBytes); recount(contribution); expect(() => read(contribution)).not.toThrow();
    contribution.changes.push({ ...changes(9, 1)[8]! }); recount(contribution); expect(() => read(contribution)).toThrow('changes-bytes');
    contribution.changes = changes(L.changes, 1); recount(contribution); expect(() => read(contribution)).not.toThrow();
    contribution.changes = changes(L.changes + 1, 1); recount(contribution); expect(() => read(contribution)).toThrow();
    const backup = example('backup');
    backup.baseEvidence = Array.from({ length: L.baseEvidenceCount }, (_, i) => ({ sha256: hash(i + 100), byteLength: 100 }));
    recount(backup); expect(() => read(backup)).not.toThrow();
    backup.baseEvidence.push({ sha256: hash(200), byteLength: 100 }); recount(backup); expect(() => read(backup)).toThrow();
    backup.baseEvidence = [8_000_000, 8_000_000, L.baseEvidenceBytes - 16_000_000].map((byteLength, i) => ({ sha256: hash(i + 100), byteLength }));
    recount(backup); expect(() => read(backup)).not.toThrow();
    backup.baseEvidence[2]!.byteLength++; recount(backup); expect(() => read(backup)).toThrow('evidence-bytes');
    const review = example('review'); review.snapshot.byteLength = L.snapshotBytes; recount(review); expect(() => read(review)).not.toThrow();
    review.snapshot.byteLength++; recount(review); expect(() => read(review)).toThrow();
    review.snapshot.byteLength = 17; recount(review); review.createdByVersion = 'x'.repeat(128); expect(() => read(review)).not.toThrow();
    review.createdByVersion += 'x'; expect(() => read(review)).toThrow();
  });
  it('rejects extra/missing/reordered/altered measured entries without mutating them', () => {
    const control = read(example('teamWorkspace'));
    for (const entries of [control.entries.slice(1), [...control.entries, control.entries[0]!], [...control.entries].reverse(),
      control.entries.map((e, i) => i ? e : { ...e, sha256: hash(999) }),
      control.entries.map((e, i) => i ? e : { ...e, byteLength: e.byteLength + 1 }),
      control.entries.map((e, i) => i ? e : { ...e, path: '/manifest.json' })]) {
      const before = structuredClone(entries);
      expect(() => checkPackageEntryTable(control, entries, control.archiveByteLength)).toThrow('entry-table');
      expect(entries).toEqual(before);
    }
    expect(() => checkPackageEntryTable(control, control.entries, control.archiveByteLength + 1)).toThrow('entry-table');
  });
});
