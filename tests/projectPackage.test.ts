import { describe, expect, it } from 'vitest';
import { parseJsonWithoutDuplicateMembers } from '../src/core/json';
import { canonical } from '../src/domain/projectGraphSupport';
import type { JsonValue } from '../src/domain/values';
import { PACKAGE_LIMITS as L, SUMMARY_FIELDS, type Entry, type PackageManifest, type PackagePurpose } from '../src/projectPackage/contract';
import { checkPackageEntryTable, packageByteHash, PackageControlError, readManifestControl } from '../src/projectPackage/manifest';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type Fixture<P extends PackagePurpose> = Mutable<PackageManifest & { purpose: P }>;
const hash = (n: number) => n.toString(16).padStart(64, '0');
const id = (prefix: string, n = 1) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
const encode = (s: string) => new TextEncoder().encode(s);
const descriptor = (path: string, n: number, byteLength = 17): Entry => ({ path, sha256: hash(n), byteLength });
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
