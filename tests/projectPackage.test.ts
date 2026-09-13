import { describe, expect, it, vi } from 'vitest';
import { parseJsonWithoutDuplicateMembers } from '../src/core/json';
import { canonical, immutableDigest } from '../src/domain/projectGraphSupport';
import type { JsonValue } from '../src/domain/values';
import { PACKAGE_LIMITS as L, SUMMARY_FIELDS, type Entry, type PackageManifest, type PackagePurpose } from '../src/projectPackage/contract';
import { checkPackageEntryTable, packageByteHash, PackageControlError, readManifestControl } from '../src/projectPackage/manifest';
import '@automerge/automerge'; // Node-only Wasm initialization.
import * as A from '@automerge/automerge/slim';
import { ZipReader, BlobReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { fixture, limits as valueLimits } from './helpers/projectRecordsFixture';
import { ProjectMetadataSource, type MetadataLimits } from '../src/projectMetadata/source';
import { readProjectScene } from '../src/scene/projectProvider';
import { developmentContentVerifier, developmentContentBytes } from '../poc/scene-history/content-verifier';
import { WorkspaceSourceCapture } from '../src/projectPackage/workspaceSource';
import { WorkspaceArchive, writeWorkspaceArchive, workspaceInputChunks, prepareWorkspaceManifest } from '../src/projectPackage/workspaceArchive';
import { VerifiedContributionBase, ContributionSourceCapture, ContributionArchive } from '../src/projectPackage/contributionSource';
import { prepareContributionManifest, writeContributionArchive } from '../src/projectPackage/contributionArchive';
import { planRemoteChanges } from '../src/projectMetadata/remote';
import { PackageArchive } from '../src/projectPackage/zipArchive';
import { ZipCrc32 } from '../src/projectPackage/zipChecks';
import type { JsonObject } from '../src/domain/values';
import type { OriginBlobStore } from '../src/projectMetadata/blobStore';
import { protectedWorkspaceInventory } from '../src/projectPackage/protectedInventory';
import { fixtureMedia } from '../src/harness/projectScene/mediaHistory';
import { BackupSourceCapture } from '../src/projectPackage/backupSource';
import { BackupArchive, prepareBackupManifest, writeBackupArchive } from '../src/projectPackage/backupArchive';
import { backupEncode, readBackupBases, type BackupBaseRecord } from '../src/projectPackage/backupEvidence';
import { CleanSourceCapture, inspectCleanSource } from '../src/projectPackage/cleanSource';
import { CleanArchive, writeCleanArchive } from '../src/projectPackage/cleanArchive';
import { selectCleanRecords, rebuildCleanRecords } from '../src/projectPackage/cleanRecords';
import { prepareReviewSnapshot } from '../src/projectPackage/reviewSelection';
import { inspectReviewSnapshot, readReviewSnapshot, prepareReviewEdit } from '../src/projectPackage/reviewSnapshot';
import { ReviewSourceCapture } from '../src/projectPackage/reviewSource';
import { ReviewArchive, writeReviewArchive } from '../src/projectPackage/reviewArchive';

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

describe('selected-Scene review snapshot (not View activation or external saving)', () => {
  const make = (records: Record<string, any>) => ProjectMetadataSource.bootstrap(records.schema, records.identity, metadataLimits).initialize(records);
  const change = (source: ProjectMetadataSource, fn: (d: Record<string, any>) => void) =>
    ProjectMetadataSource.fromFullSource(A.save(A.change(A.load<Record<string, any>>(source.encodeFullSource()), fn)), source.proof, metadataLimits);
  const value = (v: JsonValue) => new A.ImmutableString(canonical(v));
  it('cuts exactly one Scene, omits old/other data, preserves missing-model owners and freezes rekeying', async () => {
    const records = fixture();
    records.scenesById[id('scn', 2)] = { ...structuredClone(records.scenesById[id('scn')]), id: id('scn', 2), name: 'PRIVATE_OTHER_SCENE' };
    delete records.scenesById[id('scn', 2)].defaultViewId;
    records.captionsById[id('cap', 2)] = { ...structuredClone(records.captionsById[id('cap')]), id: id('cap', 2), title: 'PRIVATE_OTHER_CAPTION' };
    records.sceneCaptionMembershipsById[id('scm', 2)] = { ...records.sceneCaptionMembershipsById[id('scm')], id: id('scm', 2), sceneId: id('scn', 2), captionId: id('cap', 2) };
    const first = change(make(records), d => { d.captionsById[id('cap')].body = value('PRIVATE_OLD_BODY'); });
    const source = change(first, d => { d.captionsById[id('cap')].body = value('Current body'); });
    const before = source.encodeFullSource(), output = await prepareReviewSnapshot(source, metadataLimits, { sceneId: id('scn') });
    const snapshot = output.review.snapshot as Record<string, any>, bytes = encode(canonical(snapshot));
    expect(output.review.closure.entries).toHaveLength(2); expect(Object.keys(snapshot.captionsById)).toHaveLength(1);
    expect(snapshot.project.defaultSceneId).toBe(snapshot.scene.id); expect(snapshot.scene.id).not.toBe(id('scn'));
    const raw = new TextDecoder().decode(bytes); for (const privateValue of ['PRIVATE_OTHER_SCENE', 'PRIVATE_OTHER_CAPTION', 'PRIVATE_OLD_BODY', id('prj'), id('cap'), id('ast')]) expect(raw).not.toContain(privateValue);
    expect(await readReviewSnapshot(bytes, metadataLimits)).toEqual(output.review);
    expect((await prepareReviewSnapshot(source, metadataLimits, { sceneId: id('scn') }, output.reconstruction)).review).toEqual(output.review);
    expect(source.encodeFullSource()).toEqual(before);
    const hiddenRecords = fixture(); hiddenRecords.sceneAssetMembershipsById = {};
    const hidden = await prepareReviewSnapshot(make(hiddenRecords), metadataLimits, { sceneId: id('scn') });
    const hiddenSnapshot = hidden.review.snapshot as Record<string, any>, owner = Object.values(hiddenSnapshot.assetsById)[0] as Record<string, any>;
    expect(owner.kind).toBe('nonvisualOwner'); expect(owner.label).toBeUndefined(); expect(hiddenSnapshot.representationsById).toEqual({});
    expect(hiddenSnapshot.sceneAssetMembershipsById).toEqual({}); expect(hidden.review.closure.entries).toHaveLength(1);
    expect(hidden.review.editEffect.missingModelCaptions).toBe(1);
    const edited = await prepareReviewEdit(hidden.review, metadataLimits), next = edited.records as Record<string, any>, a = Object.values(next.assetsById)[0] as Record<string, any>;
    expect(a.status).toEqual({ kind: 'unresolved', reason: 'missingSource', pendingAssetToProject: owner.assetToProject });
    expect(next.sceneAssetMembershipsById).toEqual({}); expect(next.assetRevisionsById).toEqual({});
    expect((Object.values(next.captionsById)[0] as Record<string, any>).anchor.positionAsset).toEqual([0, 0, 0]);
    expect((await prepareReviewEdit(hidden.review, metadataLimits, edited.reconstruction)).records).toEqual(edited.records);
  });
  it('keeps export compatibility separate from the exact included-family partition on explicit edit', async () => {
    const records = fixture(), rep = structuredClone(records.representationsById[id('rep')]);
    rep.id = id('rep', 2); rep.variantFamilyId = id('fam', 2); rep.purposes = ['source'];
    rep.payloadDigest = await immutableDigest('representation', rep); records.representationsById[rep.id] = rep;
    const revision = records.assetRevisionsById[id('rev')]; revision.representationIds.push(rep.id);
    revision.anchorCompatibilityClasses.push({ id: id('cmp', 2), targetVariantFamilyIds: [id('fam', 2)] });
    revision.payloadDigest = await immutableDigest('asset-revision', revision);
    records.captionsById[id('cap')].anchor.authoredAnchorCompatibilityId = id('cmp', 2);
    const result = await prepareReviewSnapshot(make(records), metadataLimits, { sceneId: id('scn') }), snapshot = result.review.snapshot as Record<string, any>;
    const a = Object.values(snapshot.assetsById)[0] as Record<string, any>, caption = Object.values(snapshot.captionsById)[0] as Record<string, any>;
    expect(a.compatibleAnchorClassIds).toContain(caption.anchor.authoredAnchorCompatibilityId);
    expect(a.anchorClassPartition).toHaveLength(1); expect(a.anchorClassPartition[0].id).not.toBe(caption.anchor.authoredAnchorCompatibilityId);
    expect(result.review.editEffect.newlyNeedsReviewCaptions).toBe(1);
    const edited = (await prepareReviewEdit(result.review, metadataLimits)).records as Record<string, any>;
    const editedCaption = Object.values(edited.captionsById)[0] as Record<string, any>, editedRevision = Object.values(edited.assetRevisionsById)[0] as Record<string, any>;
    expect(editedRevision.anchorCompatibilityClasses.map((k: any) => k.id)).not.toContain(editedCaption.anchor.authoredAnchorCompatibilityId);
    expect(editedCaption.anchor.authoredAssetRevisionId).toBeUndefined(); expect(editedCaption.colorSrgb).toEqual(caption.colorSrgb);
    expect(editedCaption.anchor.positionAsset).toEqual(caption.anchor.positionAsset);
    for (const mutate of [
      (r: any) => { Object.values<any>(r.assetsById)[0].compatibleAnchorClassIds.push(id('cmp', 99)); Object.values<any>(r.assetsById)[0].compatibleAnchorClassIds.sort(); },
      (r: any) => { Object.values<any>(r.representationsById)[0].purposes.unshift('source'); },
      (r: any) => { Object.values<any>(r.captionsById)[0].anchor.authoredAssetRevisionId = id('rev'); },
      (r: any) => { Object.values<any>(r.assetsById)[0].anchorClassPartition[0].targetVariantFamilyIds = [id('fam', 99)]; },
    ]) { const bad = structuredClone(snapshot); mutate(bad); await expect(inspectReviewSnapshot(bad, metadataLimits)).rejects.toThrow(); }
  });
  it('rejects hidden fields/extra closure and included conflicts without blocking unrelated Scene conflicts', async () => {
    const records = fixture(); records.scenesById[id('scn', 2)] = { ...structuredClone(records.scenesById[id('scn')]), id: id('scn', 2) }; delete records.scenesById[id('scn', 2)].defaultViewId;
    const base = make(records), left = change(base, d => { d.scenesById[id('scn', 2)].name = value('L'); }), right = change(base, d => { d.scenesById[id('scn', 2)].name = value('R'); });
    const result = await prepareReviewSnapshot(left.appendOriginal(right.originalChanges()), metadataLimits, { sceneId: id('scn') });
    const one = change(base, d => { d.captionsById[id('cap')].body = value('L'); }), two = change(base, d => { d.captionsById[id('cap')].body = value('R'); });
    await expect(prepareReviewSnapshot(one.appendOriginal(two.originalChanges()), metadataLimits, { sceneId: id('scn') })).rejects.toThrow('review-unresolved-field');
    for (const [map, row] of [['sceneAssetMembershipsById', id('sam')], ['sceneCaptionMembershipsById', id('scm')], ['viewsById', id('view')]]) {
      const illegalMove = change(base, d => { d[map!][row!].sceneId = value(id('scn', 2)); });
      await expect(prepareReviewSnapshot(illegalMove, metadataLimits, { sceneId: id('scn') })).rejects.toThrow();
    }
    const outside = structuredClone(records);
    for (const n of [2, 3]) outside.sceneCaptionMembershipsById[id('scm', n)] = {
      ...structuredClone(records.sceneCaptionMembershipsById[id('scm')]), id: id('scm', n), sceneId: id('scn', 2) };
    await expect(prepareReviewSnapshot(make(outside), metadataLimits, { sceneId: id('scn') })).resolves.toHaveProperty('review');
    for (const options of [{ sceneId: id('scn'), extra: 'hidden' }, { sceneId: id('scn'), omitConflictedEntryView: 'yes' }])
      await expect(prepareReviewSnapshot(base, metadataLimits, options as any)).rejects.toThrow('review-selection');
    const unknownProvenance = fixture(), revision = unknownProvenance.assetRevisionsById[id('rev')];
    revision.provenance.futurePrivateDetail = { value: 'synthetic unknown value' };
    revision.payloadDigest = await immutableDigest('asset-revision', revision);
    // Provenance would normally be omitted, but unknown nested source values must not be silently stripped.
    await expect(prepareReviewSnapshot(make(unknownProvenance), metadataLimits, { sceneId: id('scn') })).rejects.toThrow('review-unknown-field');
    for (const mutate of [
      (r: any) => { r.sourceIdentity = records.identity; },
      (r: any) => { Object.values<any>(r.representationsById)[0].formatProfile.secret = 'not classified'; },
      (r: any) => { const extra = structuredClone(Object.values<any>(r.captionsById)[0]); extra.id = id('cap', 99); r.captionsById[extra.id] = extra; },
      (r: any) => { const extra = structuredClone(Object.values<any>(r.captionTagsById)[0]); extra.id = id('tag', 99); r.captionTagsById[extra.id] = extra; },
    ]) { const bad = structuredClone(result.review.snapshot); mutate(bad); await expect(inspectReviewSnapshot(bad, metadataLimits)).rejects.toThrow(); }
    await expect(readReviewSnapshot(encode(canonical(result.review.snapshot) + '\n'), metadataLimits)).rejects.toThrow('review-canonical');
    const bad = structuredClone(result.review.snapshot) as any; Object.values<any>(bad.assetsById)[0].kind = 'nonvisualOwner';
    await expect(inspectReviewSnapshot(bad, metadataLimits)).rejects.toThrow();
    const digest = vi.spyOn(crypto.subtle, 'digest');
    try {
      for (const budget of [{ maxNodes: 2 }, { maxStringScalars: 1 }, { maxWork: 2 }, { maxTotalBytes: 16 }]) {
        await expect(readReviewSnapshot(encode(canonical(result.review.snapshot)), { ...metadataLimits, ...budget })).rejects.toThrow();
        await expect(inspectReviewSnapshot(result.review.snapshot, { ...metadataLimits, ...budget })).rejects.toThrow();
      }
      expect(digest).not.toHaveBeenCalled();
    } finally { digest.mockRestore(); }
  });
  it('streams the separate review ZIP and verifies its declared snapshot, summary and exact body closure', async () => {
    const f = await workspaceFixture(), rep = fixture().representationsById[id('rep')], verifier = developmentContentVerifier([
      { variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest },
    ]), provider = await readProjectScene(f.source.read(), metadataLimits, verifier);
    const capture = await ReviewSourceCapture.prepare({ read: async () => ({ state: 'ready', source: f.source, provider, publication: 'review-fixture' }) },
      f.source.token, { sceneId: id('scn') }, f.store, metadataLimits);
    const parts: BlobPart[] = [], generated = await writeReviewArchive(capture, f.store, new WritableStream({ write(bytes) { parts.push(bytes.slice() as BlobPart); } }), f.options);
    expect(generated.kind).toBe('generated-review-archive');
    const file = new Blob(parts), inspected = await ReviewArchive.inspect(file, metadataLimits);
    expect(inspected.review).toEqual(capture.review); expect(inspected.archive.control.manifest.purpose).toBe('review');
    const entries = await unpackFixture(file);
    expect(entries.map(e => e.path)).toEqual(['manifest.json', 'manifest.sha256', 'review.json', ...capture.blobs.map(b => b.path)]);
    for (const entry of entries.filter(e => e.path.startsWith('blobs/'))) expect(entry.bytes).toEqual(f.bodies.get(entry.path.split('/').at(-1)!));
    const restored = await ReviewSourceCapture.restore({ source: capture.sourceBytes(), sourceProof: capture.source.proof,
      snapshot: capture.snapshotBytes(), reconstruction: capture.reconstruction }, f.store, verifier, metadataLimits);
    expect(restored.snapshotBytes()).toEqual(capture.snapshotBytes());
    const manifest = JSON.parse(new TextDecoder().decode(entries[0]!.bytes)); manifest.summary.entityClasses.find((c: any) => c.class === 'captionsById').count++;
    entries[0]!.bytes = encode(canonical(manifest)); entries[1]!.bytes = encode(packageByteHash(entries[0]!.bytes));
    await expect(ReviewArchive.inspect(fixedZip(entries), metadataLimits)).rejects.toThrow('review-summary-or-closure');
  });
});

describe('whole-Project clean output (not host activation or external saving)', () => {
  const change = (source: ProjectMetadataSource, fn: (d: Record<string, any>) => void) =>
    ProjectMetadataSource.fromFullSource(A.save(A.change(A.load<Record<string, any>>(source.encodeFullSource()), fn)), source.proof, metadataLimits);
  const value = (v: JsonValue) => new A.ImmutableString(canonical(v));
  const session = async (source: ProjectMetadataSource) => {
    const rep = fixture().representationsById[id('rep')];
    const provider = await readProjectScene(source.read(), metadataLimits, developmentContentVerifier([
      { variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest },
    ]));
    return { read: async () => ({ state: 'ready' as const, source, provider, publication: 'clean-test-publication' }) };
  };
  it('copies all active resources, preserves needsReview, rekeys references and emits only fresh history/exact bodies', async () => {
    const f = await workspaceFixture(), originalBytes = f.source.encodeFullSource();
    const prior = change(f.source, d => {
      d.captionsById[id('cap')].body = value('PRIVATE_OLD_CAPTION');
      d.captionsById[id('cap')].futureHint = value('PRIVATE_REMOVED_EXTENSION');
      d.futureRoot = value('PRIVATE_REMOVED_ROOT');
    });
    const current = change(prior, d => {
      d.captionsById[id('cap')].body = value('Current text');
      delete d.captionsById[id('cap')].futureHint; delete d.futureRoot;
      const extra = structuredClone(fixture().captionsById[id('cap')]);
      extra.id = id('cap', 9); extra.title = 'Outside every Scene'; extra.anchor.authoredAnchorCompatibilityId = id('cmp', 9);
      delete extra.anchor.authoredAssetRevisionId;
      d.captionsById[extra.id] = Object.fromEntries(Object.entries(extra).map(([key, v]) => [key, value(v as JsonValue)]));
    });
    const capture = await CleanSourceCapture.prepare(await session(current), current.token, f.store, metadataLimits);
    expect(capture.source.proof).toEqual(current.proof); expect(capture.proof.identity).not.toEqual(current.proof.identity);
    const records = (await inspectCleanSource(capture.output, metadataLimits)).records as Record<string, any>;
    expect(Object.keys(records.captionsById)).toHaveLength(2);
    const captions = Object.values(records.captionsById) as Record<string, any>[];
    const reviewed = captions.find(c => c.title === 'Outside every Scene')!;
    expect(reviewed.anchor.authoredAssetRevisionId).toBeUndefined(); expect(reviewed.anchor.positionAsset).toEqual([0, 0, 0]);
    const asset = Object.values(records.assetsById)[0] as Record<string, any>;
    const binding = records.assetBindingsById[asset.status.activeBindingId], revision = records.assetRevisionsById[binding.assetRevisionId];
    expect(captions.find(c => c.body === 'Current text')!.anchor.authoredAssetRevisionId).toBe(revision.id);
    expect(captions.every(c => c.anchor.assetId === asset.id && c.anchor.assetFrameId === asset.assetFrameId)).toBe(true);
    const material = Object.values(records.materialOverridesById)[0] as Record<string, any>, rep = records.representationsById[revision.representationIds[0]];
    expect(material.routing.target).toEqual({ assetId: asset.id, variantFamilyId: rep.variantFamilyId,
      materialLayoutId: rep.materialCatalog.layoutId, logicalMaterialSlotId: rep.materialCatalog.slots[0].logicalMaterialSlotId });
    const encodedHistory = JSON.stringify(capture.output.originalChanges().map(b => A.decodeChange(b)));
    for (const forbidden of ['PRIVATE_OLD_CAPTION', 'PRIVATE_REMOVED_EXTENSION', 'PRIVATE_REMOVED_ROOT', id('prj'), id('cap'), id('ast'), id('fam'), id('cmp')])
      expect(encodedHistory).not.toContain(forbidden);
    expect(capture.output.originalChanges()).toHaveLength(2);
    expect(f.source.encodeFullSource()).toEqual(originalBytes);
    const parts: BlobPart[] = [], options = { packageId: id('pkg', 9), createdByVersion: '0.0.1' };
    await writeCleanArchive(capture, f.store, new WritableStream({ write(bytes) { parts.push(bytes.slice() as BlobPart); } }), options);
    const read = await CleanArchive.inspect(new Blob(parts), metadataLimits);
    expect(read.source.proof).toEqual(capture.proof); expect(read.source.originalChanges()).toEqual(capture.output.originalChanges());
    expect(read.archive.control.manifest.summary.scope).toBe('snapshot');
    expect(read.archive.control.manifest.summary.entityClasses.find(c => c.class === 'captionsById')?.count).toBe(2);
    for (const entry of capture.blobs) expect(new Uint8Array(await read.archive.entryBlob(entry.path).arrayBuffer())).toEqual(f.bodies.get(entry.sha256));
    const retry: BlobPart[] = [];
    await writeCleanArchive(capture, f.store, new WritableStream({ write(bytes) { retry.push(bytes.slice() as BlobPart); } }), options);
    expect(new Uint8Array(await new Blob(retry).arrayBuffer())).toEqual(new Uint8Array(await new Blob(parts).arrayBuffer()));
    const oldRep = fixture().representationsById[id('rep')];
    const restoreInput = { source: capture.sourceBytes(), sourceProof: capture.source.proof, output: capture.metadataBytes(), outputProof: capture.proof,
      reconstruction: structuredClone(capture.reconstruction) };
    const verifier = developmentContentVerifier([{ variantFamilyId: oldRep.variantFamilyId, representationId: oldRep.id, payloadDigest: oldRep.payloadDigest }]);
    const cold = await CleanSourceCapture.restore(restoreInput, f.store, verifier, metadataLimits);
    expect(cold.metadataBytes()).toEqual(capture.metadataBytes()); expect(cold.reconstruction).toEqual(capture.reconstruction);
    const badRecipe = { ...restoreInput, reconstruction: { ...restoreInput.reconstruction,
      idMap: restoreInput.reconstruction.idMap.map((pair, i) => i ? pair : { ...pair, to: pair.from }) } };
    await expect(CleanSourceCapture.restore(badRecipe, f.store, verifier, metadataLimits)).rejects.toThrow();
    // Two changes alone are insufficient: conceal an overwritten body in the
    // population change while retaining the same final visible scalar.
    const decoded = capture.output.originalChanges().map(b => A.decodeChange(b)), populated = decoded.find(c => c.deps.length)!;
    const at = populated.ops.findIndex(op => op.action === 'set' && op.key === 'body');
    const final = populated.ops[at]!; populated.ops[at] = { ...final, value: canonical('PRIVATE_HIDDEN_WRITE') } as typeof final;
    populated.ops.push({ ...final, pred: [`${populated.startOp + at}@${populated.actor}`] });
    const hidden = ProjectMetadataSource.reopen(decoded.map(c => A.encodeChange(c)), capture.proof, metadataLimits);
    await expect(inspectCleanSource(hidden, metadataLimits)).rejects.toThrow('clean-hidden-history');
  }, 30_000);
  it('refuses current unknown data and conflicts instead of selecting a winner; excludes resolved deleted resources', async () => {
    const f = await workspaceFixture();
    const unknown = change(f.source, d => { d.captionsById[id('cap')].futureHint = value('unknown'); });
    await expect(selectCleanRecords(unknown, metadataLimits)).rejects.toThrow('clean-unknown-field');
    const left = change(f.source, d => { d.captionsById[id('cap')].body = value('Left'); });
    const right = change(f.source, d => { d.captionsById[id('cap')].body = value('Right'); });
    await expect(selectCleanRecords(left.appendOriginal(right.originalChanges()), metadataLimits)).rejects.toThrow('clean-unresolved-field');
    const deleted = change(unknown, d => {
      for (const map of ['captionsById', 'captionAttachmentsById', 'captionTagMembershipsById', 'sceneCaptionMembershipsById'])
        for (const row of Object.values(d[map]) as Record<string, any>[]) row.lifecycle = value({ state: 'deleted', eventId: id('evt', 7), reason: 'userDelete' });
    });
    const selected = await selectCleanRecords(deleted, metadataLimits) as Record<string, any>;
    expect(selected.captionsById).toEqual({}); expect(selected.mediaResourcesById).toEqual({});
    expect(Object.keys(selected.captionTagsById)).toHaveLength(1);
  });
  it('does not retain unverified nonmanual evidence or mistake old causal history for a clean source', async () => {
    const f = await workspaceFixture(), records = structuredClone(await selectCleanRecords(f.source, metadataLimits)) as Record<string, any>;
    const a = records.captionsById[id('cap')].anchor;
    a.hitEvidence = { method: 'mesh', source: { representationId: id('rep'), surfaceRef: { kind: 'meshTriangle', nodeIndex: 0, primitiveIndex: 0, triangleIndex: 999, barycentric: [1, 0, 0] } } };
    const rebuilt = await rebuildCleanRecords(records, metadataLimits) as Record<string, any>;
    const result = Object.values(rebuilt.captionsById)[0] as Record<string, any>;
    expect(result.anchor.hitEvidence).toEqual({ method: 'mesh' }); expect(result.anchor.authoredAssetRevisionId).toBeUndefined();
    const edited = change(f.source, d => { d.captionsById[id('cap')].body = value('Edited'); });
    await expect(inspectCleanSource(edited, metadataLimits)).rejects.toThrow('not-fresh-initialization');
  });
});

describe('Contribution originals and actual ZIP (injected base/CAS ports, no durable receive or external save)', () => {
  const session = async (source: ProjectMetadataSource) => {
    const rep = fixture().representationsById[id('rep')];
    const provider = await readProjectScene(source.read(), metadataLimits, developmentContentVerifier([
      { variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest },
    ]));
    return { read: async () => ({ state: 'ready' as const, source, provider, publication: 'fixture-publication' }) };
  };
  async function baseFor(source: ProjectMetadataSource, store: Pick<OriginBlobStore, 'openReadOnly'>) {
    const capture = await WorkspaceSourceCapture.prepare(await session(source), source.token, store, metadataLimits);
    const controls = prepareWorkspaceManifest(capture, { packageId: id('pkg'), createdByVersion: '0.0.1' });
    const ref = (b: Uint8Array) => ({ sha256: packageByteHash(b), byteLength: b.length });
    const metadata = capture.metadataBytes(), evidence = { manifest: ref(controls.manifest), metadata: ref(metadata) };
    const row = { identity: source.proof.identity, metadataEnvelope: source.proof.envelope, workspacePackageId: id('pkg'),
      workspaceManifestSha256: evidence.manifest.sha256, declaredHeads: source.heads, evidence, completions: [{ observation: 'generated' as const }] };
    const selection = { workspacePackageId: row.workspacePackageId, workspaceManifestSha256: row.workspaceManifestSha256, heads: row.declaredHeads };
    const ports = { read: async () => [row], readEvidence: async (e: { sha256: string }) => e.sha256 === evidence.manifest.sha256 ? controls.manifest : metadata };
    const bodies = { ...store, inspect: vi.fn(async () => 'verified-present' as const), openReadOnly: vi.fn(store.openReadOnly) };
    const base = await VerifiedContributionBase.select(ports, selection, bodies, metadataLimits);
    return { base, ports, selection, bodies, controls };
  }
  async function output(capture: ContributionSourceCapture, store: Pick<OriginBlobStore, 'inspect' | 'openReadOnly'>) {
    const chunks: BlobPart[] = [];
    const result = await writeContributionArchive(capture, store, new WritableStream({ write(b) { chunks.push(b.slice() as BlobPart); } }),
      { packageId: id('pkg', 2), createdByVersion: '0.0.1' });
    return { file: new Blob(chunks), result };
  }
  const change = (source: ProjectMetadataSource, fn: (draft: Record<string, any>) => void) =>
    ProjectMetadataSource.fromFullSource(A.save(A.change(A.load<Record<string, any>>(source.encodeFullSource()), fn)), source.proof, metadataLimits);
  const title = (source: ProjectMetadataSource, value: string) => change(source, d => { d.captionsById[id('cap')].title = new A.ImmutableString(JSON.stringify(value)); });
  const body = (source: ProjectMetadataSource, value: string) => change(source, d => { d.captionsById[id('cap')].body = new A.ImmutableString(JSON.stringify(value)); });
  async function rewrite(file: Blob, edit: (manifest: any, entries: { path: string; bytes: Uint8Array }[]) => void) {
    const entries = await unpackFixture(file), manifest = JSON.parse(new TextDecoder().decode(entries[0]!.bytes));
    edit(manifest, entries); entries[0]!.bytes = encode(canonical(manifest)); entries[1]!.bytes = encode(packageByteHash(entries[0]!.bytes));
    return fixedZip(entries);
  }

  it('retains exact edit/revert originals and delta-only counts, with zero unchanged body reads', async () => {
    const f = await workspaceFixture(), b = await baseFor(f.source, f.store), target = body(body(f.source, 'Temporary'), fixture().captionsById[id('cap')].body);
    const capture = await ContributionSourceCapture.prepare(await session(target), target.token, b.base, b.bodies, metadataLimits);
    expect(capture.changes).toHaveLength(2); expect(capture.blobs).toHaveLength(0);
    expect(capture.summary.entityClasses).toEqual([{ class: 'captionsById', count: 1 }]);
    expect(capture.summary.fieldClasses).toEqual([{ class: 'captionsById.body', count: 1 }]);
    const built = await output(capture, b.bodies), inspected = await ContributionArchive.inspect(built.file, b.base, b.bodies, metadataLimits);
    expect(built.result.kind).toBe('generated-contribution-archive');
    expect(new Uint8Array(await fixedZip(await unpackFixture(built.file)).arrayBuffer())).toEqual(new Uint8Array(await built.file.arrayBuffer()));
    expect((await unpackFixture(built.file)).map(e => e.path)).toEqual(['manifest.json', 'manifest.sha256', 'changes/00000000.amchange', 'changes/00000001.amchange']);
    expect(inspected.target.originalChanges()).toEqual(target.originalChanges());
    expect(inspected.reconstruction().targetMetadata.sha256).toBe(packageByteHash(inspected.derivedTargetBytes()));
    expect(inspected.reconstruction().adapterId).toBe('lociview-automerge-3.4.1-reachable-originals-1');
    const owned = inspected.changeBytes(0); owned.fill(0); expect(inspected.changeBytes(0)).toEqual(capture.changeBytes(0));
    expect(b.bodies.openReadOnly).not.toHaveBeenCalled(); expect(b.bodies.inspect).toHaveBeenCalled();
  });
  it('restores the first derived target and owns its bytes and descriptor before asynchronous inspection', async () => {
    const f = await workspaceFixture(), b = await baseFor(f.source, f.store), target = title(f.source, 'Received');
    const capture = await ContributionSourceCapture.prepare(await session(target), target.token, b.base, b.bodies, metadataLimits);
    const built = await output(capture, b.bodies), inspected = await ContributionArchive.inspect(built.file, b.base, b.bodies, metadataLimits);
    const bytes = inspected.derivedTargetBytes(), reconstruction = { ...inspected.reconstruction(), targetMetadata: { ...inspected.reconstruction().targetMetadata } };
    const restoring = ContributionArchive.restore(built.file, b.base, bytes, reconstruction, b.bodies, metadataLimits);
    bytes.fill(0); reconstruction.targetMetadata.sha256 = hash(9);
    const restored = await restoring;
    expect(restored.derivedTargetBytes()).toEqual(inspected.derivedTargetBytes());
    expect(restored.target.originalChanges()).toEqual(target.originalChanges());
    await expect(ContributionArchive.restore(built.file, b.base, bytes, reconstruction, b.bodies, metadataLimits)).rejects.toThrow();
  });
  it('selects a non-ancestor target from base plus delta, not their union heads; M differs from D', async () => {
    const f = await workspaceFixture(), left = title(f.source, 'Left'), right = body(f.source, 'Right'), b = await baseFor(left, f.store);
    const capture = await ContributionSourceCapture.prepare(await session(right), right.token, b.base, b.bodies, metadataLimits), built = await output(capture, b.bodies);
    const inspected = await ContributionArchive.inspect(built.file, b.base, b.bodies, metadataLimits);
    expect(inspected.target.heads).toEqual(right.heads); expect(inspected.target.originalChanges()).toEqual(right.originalChanges());
    const merged = planRemoteChanges(left, inspected.target, metadataLimits).final;
    expect(merged.heads).toHaveLength(2); expect(merged.heads).not.toEqual(right.heads);
    expect(planRemoteChanges(merged, inspected.target, metadataLimits).parts).toHaveLength(0);
    expect(capture.changes).toHaveLength(1); expect(b.base.source.heads).toEqual(left.heads);
  });
  it('uses incremental lex-ready wire ordering and retains all concurrent candidates', async () => {
    const f = await workspaceFixture(), b = await baseFor(f.source, f.store);
    const find = (create: (i: number) => ProjectMetadataSource, accept: (hash: string) => boolean) => {
      for (let i = 0; i < 4096; i++) { const s = create(i); if (accept(s.heads[0]!)) return s; }
      throw new Error('could not construct lexical fixture');
    };
    const a = find(i => title(f.source, `A ${i}`), h => h < '2'), c = find(i => body(a, `Child ${i}`), h => h < '2');
    const childHash = c.heads[0]!, ancestorHash = a.heads[0]!;
    // Choose a sibling with a larger native hash so that newly-ready child outranks it.
    const sibling = find(i => body(f.source, `Sibling ${i}`), h => h > '8');
    const target = c.appendOriginal(sibling.originalChanges());
    const capture = await ContributionSourceCapture.prepare(await session(target), target.token, b.base, b.bodies, metadataLimits);
    expect(capture.changes.map(c => c.expectedChangeHash)).toEqual([ancestorHash, childHash, sibling.heads[0]!]);
    const built = await output(capture, b.bodies), inspected = await ContributionArchive.inspect(built.file, b.base, b.bodies, metadataLimits);
    expect(inspected.target.originalChanges()).toEqual(target.originalChanges()); expect(inspected.target.heads).toHaveLength(2);
  });
  it('validates only the selected target when unrelated base containers collide in a temporary union', async () => {
    const f = await workspaceFixture();
    const add = (text: string) => change(f.source, d => {
      d.captionsById[id('cap', 2)] = Object.fromEntries(Object.entries({ ...fixture().captionsById[id('cap')], id: id('cap', 2), title: text })
        .map(([key, value]) => [key, new A.ImmutableString(canonical(value as JsonValue))]));
    });
    const left = add('Left record'), right = add('Right record'), b = await baseFor(left, f.store);
    expect(() => left.appendOriginal(right.originalChanges())).toThrow(/container-replacement/);
    const capture = await ContributionSourceCapture.prepare(await session(right), right.token, b.base, b.bodies, metadataLimits);
    const built = await output(capture, b.bodies), inspected = await ContributionArchive.inspect(built.file, b.base, b.bodies, metadataLimits);
    expect(inspected.target.originalChanges()).toEqual(right.originalChanges());
  });
  it('accepts empty D and independently restages a former payload absent from the base guarantee', async () => {
    const f = await workspaceFixture();
    const removed = change(f.source, d => {
      for (const a of Object.values(d.captionAttachmentsById) as Record<string, any>[])
        a.lifecycle = new A.ImmutableString(canonical({ state: 'deleted', reason: 'userDelete', eventId: id('evt', 99) }));
    });
    const b = await baseFor(removed, f.store), capture = await ContributionSourceCapture.prepare(await session(f.source), f.source.token, b.base, b.bodies, metadataLimits);
    expect(capture.changes).toHaveLength(0); expect(capture.blobs.length).toBeGreaterThan(0);
    expect(capture.summary.entityClasses).toEqual([]);
    const built = await output(capture, b.bodies), restored = await ContributionArchive.inspect(built.file, b.base, b.bodies, metadataLimits);
    expect(restored.target.originalChanges()).toEqual(f.source.originalChanges());
    const current = await ContributionSourceCapture.prepare(await session(removed), removed.token, b.base, b.bodies, metadataLimits);
    expect(current.changes).toHaveLength(0); expect(current.blobs).toHaveLength(0);
    const empty = await output(current, b.bodies); expect((await unpackFixture(empty.file))).toHaveLength(2);
    expect((await ContributionArchive.inspect(empty.file, b.base, b.bodies, metadataLimits)).target.heads).toEqual(removed.heads);
  });
  it('rejects forged base/target/summary, extra or missing original changes, without base updates', async () => {
    const f = await workspaceFixture(), b = await baseFor(f.source, f.store), target = body(title(f.source, 'One'), 'Two');
    const capture = await ContributionSourceCapture.prepare(await session(target), target.token, b.base, b.bodies, metadataLimits), built = await output(capture, b.bodies);
    for (const edit of [
      (m: any) => { m.base.workspaceManifestSha256 = hash(9); },
      (m: any) => { m.targetHeads = [hash(9)]; },
      (m: any) => { m.targetHeads = f.source.heads; },
      (m: any) => { m.summary.entityClasses = []; m.summary.fieldClasses = []; },
      (m: any) => { m.changes[0].expectedChangeHash = hash(9); },
    ]) await expect(ContributionArchive.inspect(await rewrite(built.file, edit), b.base, b.bodies, metadataLimits)).rejects.toThrow();
    const missing = await rewrite(built.file, (m, entries) => {
      const last = m.changes.pop(); entries.pop(); m.payloadTotals.entryCount--; m.payloadTotals.uncompressedBytes -= last.byteLength;
      m.payloadTotals.largestEntryBytes = Math.max(0, ...m.changes.map((c: any) => c.byteLength));
    });
    await expect(PackageArchive.inspect(missing)).resolves.toMatchObject({ kind: 'package-archive-integrity' });
    await expect(ContributionArchive.inspect(missing, b.base, b.bodies, metadataLimits)).rejects.toThrow();
    expect(b.base.source.token).toBe(f.source.token); expect((await b.ports.read())).toHaveLength(1);
    await expect(VerifiedContributionBase.select(b.ports, { ...b.selection, heads: target.heads }, b.bodies, metadataLimits)).rejects.toThrow(/base-unavailable/);
  });
  it('refuses lost base inventory, stale/pending source, foreign lineage, abort and sink failure', async () => {
    const f = await workspaceFixture(), b = await baseFor(f.source, f.store), target = title(f.source, 'Edit'), validSession = await session(target);
    const badStore = { ...b.bodies, inspect: async () => 'missing' as const };
    await expect(VerifiedContributionBase.select(b.ports, b.selection, badStore, metadataLimits)).rejects.toThrow(/payload-unavailable/);
    await expect(ContributionSourceCapture.prepare(validSession, target.token, b.base, badStore, metadataLimits)).rejects.toThrow(/payload-unavailable/);
    await expect(ContributionSourceCapture.prepare(validSession, f.source.token, b.base, b.bodies, metadataLimits)).rejects.toThrow(/not-ready/);
    const read = await validSession.read(); let reads = 0;
    await expect(ContributionSourceCapture.prepare({ read: async () => ({ ...read, publication: String(++reads) }) }, target.token, b.base, b.bodies, metadataLimits)).rejects.toThrow(/publication-changed/);
    await expect(ContributionSourceCapture.prepare({ read: async () => ({ ...read, state: 'pending' as const }) }, target.token, b.base, b.bodies, metadataLimits)).rejects.toThrow(/not-ready/);
    const foreign = await workspaceFixture();
    await expect(ContributionSourceCapture.prepare(await session(foreign.source), foreign.source.token, b.base, b.bodies, metadataLimits)).rejects.toThrow(/lineage/);
    const abort = new AbortController(); abort.abort();
    await expect(ContributionSourceCapture.prepare(validSession, target.token, b.base, b.bodies, metadataLimits, abort.signal)).rejects.toThrow();
    const capture = await ContributionSourceCapture.prepare(validSession, target.token, b.base, b.bodies, metadataLimits);
    await expect(writeContributionArchive(capture, b.bodies, new WritableStream({ write() { throw new Error('injected sink failure'); } }),
      { packageId: id('pkg', 2), createdByVersion: '0.0.1' })).rejects.toThrow(/injected sink failure/);
    const built = await output(capture, b.bodies);
    await expect(ContributionArchive.inspect(built.file, b.base, badStore, metadataLimits)).rejects.toThrow(/payload-unavailable/);
  });
  it('freezes output identity and cancellation signal before awaited base checks', async () => {
    const f = await workspaceFixture(), b = await baseFor(f.source, f.store), target = title(f.source, 'Edit');
    const capture = await ContributionSourceCapture.prepare(await session(target), target.token, b.base, b.bodies, metadataLimits);
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; }), store = { ...b.bodies, inspect: async () => { await wait; return 'verified-present' as const; } };
    const abort = new AbortController(), swapped = new AbortController(), options = { packageId: id('pkg', 2), createdByVersion: '0.0.1', memo: 'Original', signal: abort.signal };
    const chunks: BlobPart[] = [], pending = writeContributionArchive(capture, store, new WritableStream({ write(b) { chunks.push(b.slice() as BlobPart); } }), options);
    options.packageId = id('pkg', 3); options.createdByVersion = 'changed'; options.memo = 'Changed'; options.signal = swapped.signal; swapped.abort(); release();
    const result = await pending; expect(result.manifest).toMatchObject({ packageId: id('pkg', 2), createdByVersion: '0.0.1', memo: 'Original' });
    const emptyStore = { ...b.bodies, inspect: async () => { abort.abort(); return 'verified-present' as const; } };
    await expect(writeContributionArchive(capture, emptyStore, new WritableStream(), { ...options, signal: abort.signal })).rejects.toThrow();
    await expect(ContributionSourceCapture.prepare(await session(target), target.token, b.base, b.bodies, { ...metadataLimits, maxWork: 1 })).rejects.toThrow();
  });
  it('includes only the added image body and refuses corruption or cancellation while streaming it', async () => {
    const f = await workspaceFixture(), b = await baseFor(f.source, f.store), bytes = Uint8Array.from(atob(fixtureMedia[1]!.base64), c => c.charCodeAt(0));
    const digest = packageByteHash(bytes), media = fixtureMedia[1]!.record;
    const target = change(f.source, d => {
      d.mediaResourcesById[id('med', 2)] = new A.ImmutableString(canonical(media));
      d.captionAttachmentsById[id('att', 2)] = Object.fromEntries(Object.entries({ ...fixture().captionAttachmentsById[id('att')], id: id('att', 2), mediaResourceId: id('med', 2) })
        .map(([key, value]) => [key, new A.ImmutableString(canonical(value as JsonValue))]));
    });
    f.bodies.set(digest, bytes); b.bodies.openReadOnly.mockClear();
    const capture = await ContributionSourceCapture.prepare(await session(target), target.token, b.base, b.bodies, metadataLimits);
    expect(capture.blobs.map(b => b.sha256)).toEqual([digest]); expect(b.bodies.openReadOnly.mock.calls.map(c => c[0].digest)).toEqual([digest]);
    const built = await output(capture, b.bodies); expect((await ContributionArchive.inspect(built.file, b.base, b.bodies, metadataLimits)).target.token).toBe(target.token);
    expect(b.bodies.openReadOnly.mock.calls.every(c => c[0].digest === digest)).toBe(true);
    const bad = { ...b.bodies, openReadOnly: async () => ({ size: bytes.length, stream: () => new Blob([new Uint8Array(bytes.length)]).stream() }) };
    await expect(output(capture, bad)).rejects.toThrow();
    const controller = new AbortController(); let enter!: () => void, cancelled = false;
    const started = new Promise<void>(resolve => { enter = resolve; });
    const blocked = { ...b.bodies, openReadOnly: async () => ({ size: bytes.length, stream: () => new ReadableStream<Uint8Array>({
      pull() { enter(); }, cancel() { cancelled = true; },
    }) }) };
    const pending = writeContributionArchive(capture, blocked, new WritableStream(), { packageId: id('pkg', 2), createdByVersion: '0.0.1', signal: controller.signal });
    await started; controller.abort(); await expect(pending).rejects.toThrow(); expect(cancelled).toBe(true);
  });
});

describe('complete backup originals and ZIP (not durable checkpoint or restore)', () => {
  const change = (source: ProjectMetadataSource, fn: (draft: Record<string, any>) => void) =>
    ProjectMetadataSource.fromFullSource(A.save(A.change(A.load<Record<string, any>>(source.encodeFullSource()), fn)), source.proof, metadataLimits);
  const session = async (source: ProjectMetadataSource) => {
    const rep = fixture().representationsById[id('rep')];
    const provider = await readProjectScene(source.read(), metadataLimits, developmentContentVerifier([
      { variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest },
    ]));
    return { read: async () => ({ state: 'ready' as const, source, provider, publication: 'backup-fixture' }) };
  };
  async function backupFixture(empty = false) {
    const f = await workspaceFixture(), evidence = new Map<string, Uint8Array>(), rows: BackupBaseRecord[] = [];
    for (let n = 1; !empty && n <= 2; n++) {
      const controls = prepareWorkspaceManifest(f.capture, { ...f.options, packageId: id('pkg', n) });
      const metadata = f.capture.metadataBytes(), ref = (bytes: Uint8Array) => ({ sha256: packageByteHash(bytes), byteLength: bytes.length });
      evidence.set(packageByteHash(metadata), metadata); evidence.set(packageByteHash(controls.manifest), controls.manifest);
      rows.push({ identity: f.source.proof.identity, metadataEnvelope: f.source.proof.envelope, workspacePackageId: id('pkg', n),
        workspaceManifestSha256: packageByteHash(controls.manifest), declaredHeads: f.source.heads,
        evidence: { manifest: ref(controls.manifest), metadata: ref(metadata) }, label: `基準 ${n}`,
        completions: [{ observation: 'generated' }, { observation: 'imported', publishedReceiverHeads: f.source.heads }] });
    }
    const bases = { snapshot: vi.fn(async () => ({ records: structuredClone(rows) })), readEvidence: vi.fn(async (ref: { sha256: string }) => evidence.get(ref.sha256)!) };
    return { ...f, evidence, rows, bases };
  }
  async function output(capture: BackupSourceCapture, store: Pick<OriginBlobStore, 'openReadOnly'>) {
    const chunks: BlobPart[] = [];
    const result = await writeBackupArchive(capture, store, new WritableStream({ write(b) { chunks.push(b.slice() as BlobPart); } }),
      { packageId: id('pkg', 10), createdByVersion: '0.0.1' });
    return { result, file: new Blob(chunks) };
  }
  async function rewrite(file: Blob, edit: (manifest: Fixture<'backup'>, values: Map<string, Uint8Array>) => void) {
    const entries = await unpackFixture(file), m = JSON.parse(new TextDecoder().decode(entries[0]!.bytes)) as Fixture<'backup'>;
    const values = new Map(entries.slice(2).map(e => [e.path, e.bytes])); edit(m, values);
    const descriptor = (e: Entry) => ({ path: e.path, sha256: packageByteHash(values.get(e.path)!), byteLength: values.get(e.path)!.length });
    m.metadata = descriptor(m.metadata); m.exchangeBases = descriptor(m.exchangeBases); m.protectedInventory = descriptor(m.protectedInventory);
    m.baseEvidence = m.baseEvidence.map(e => { const bytes = values.get(`base-evidence/sha256/${e.sha256}`)!; return { sha256: e.sha256, byteLength: bytes.length }; });
    recount(m); const manifest = backupEncode(m);
    return fixedZip([{ path: 'manifest.json', bytes: manifest }, { path: 'manifest.sha256', bytes: encode(packageByteHash(manifest)) },
      ...payloads(m).map(e => ({ path: e.path, bytes: values.get(e.path)! }))]);
  }
  it('keeps full original history, multiple historical observations and deduplicated evidence/bodies', async () => {
    const f = await backupFixture(), originalRows = JSON.stringify(f.rows), host = await session(f.source);
    const capture = await BackupSourceCapture.prepare(host, f.source.token, f.bases, f.store, metadataLimits);
    const built = await output(capture, f.store), reopened = await BackupArchive.inspect(built.file, metadataLimits);
    expect(built.result.kind).toBe('generated-backup-archive'); expect(reopened.source.originalChanges()).toEqual(f.source.originalChanges());
    expect(reopened.description.table.records).toEqual(f.rows); expect(reopened.description.baseEvidence).toHaveLength(3);
    expect(reopened.description.blobs).toEqual(f.capture.blobs); expect(JSON.stringify(f.rows)).toBe(originalRows);
    expect(await reopened.archive.entryBytes('metadata.am', L.sourceBytes)).toEqual(f.capture.metadataBytes());
    expect((await unpackFixture(built.file)).map(e => e.path)).toEqual(['manifest.json', 'manifest.sha256', ...capture.originals().map(e => e.path), ...capture.blobs.map(e => e.path)]);
    expect(new Uint8Array(await fixedZip(await unpackFixture(built.file)).arrayBuffer())).toEqual(new Uint8Array(await built.file.arrayBuffer()));
    await expect(WorkspaceArchive.inspect(built.file, metadataLimits)).rejects.toThrow('workspace-purpose');
    await expect(BackupArchive.inspect(f.file, metadataLimits)).rejects.toThrow('backup-purpose');
  });
  it('streams and includes base-only model and image after current roots are removed', async () => {
    const f = await backupFixture(), removed = change(f.source, d => {
      for (const key of ['assetsById', 'captionsById', 'captionAttachmentsById', 'sceneAssetMembershipsById', 'sceneCaptionMembershipsById', 'materialOverridesById', 'captionTagMembershipsById'])
        for (const row of Object.values(d[key]) as Record<string, any>[]) row.lifecycle = new A.ImmutableString(canonical({ state: 'deleted', reason: 'userDelete', eventId: id('evt', 99) }));
    });
    const store = { openReadOnly: vi.fn(f.store.openReadOnly) }, capture = await BackupSourceCapture.prepare(await session(removed), removed.token, f.bases, store, metadataLimits);
    expect(capture.description.inventory).toEqual({ schema: 'lociview-protected-inventory-1', blobs: f.capture.blobs.map(e => ({ sha256: e.sha256, byteLength: e.byteLength, reasons: ['exchangeBase'] })) });
    expect(store.openReadOnly.mock.calls.map(c => c[0].digest)).toEqual(f.capture.blobs.map(e => e.sha256));
    const built = await output(capture, store), reopened = await BackupArchive.inspect(built.file, metadataLimits);
    expect(reopened.source.originalChanges()).toEqual(removed.originalChanges());
    for (const e of f.capture.blobs) expect(await reopened.archive.entryBytes(e.path, L.sourceBytes)).toEqual(f.bodies.get(e.sha256));
    expect(store.openReadOnly).toHaveBeenCalledTimes(f.capture.blobs.length * 2);
  });
  it('supports empty bases and retains concurrent choices and edit/revert originals', async () => {
    const f = await backupFixture(true);
    const title = (s: ProjectMetadataSource, value: string) => change(s, d => { d.captionsById[id('cap')].title = new A.ImmutableString(canonical(value)); });
    const left = title(title(f.source, 'Intermediate'), 'Left'), right = title(f.source, 'Right'), target = left.appendOriginal(right.originalChanges());
    const capture = await BackupSourceCapture.prepare(await session(target), target.token, f.bases, f.store, metadataLimits);
    const reopened = await BackupArchive.inspect((await output(capture, f.store)).file, metadataLimits);
    expect(reopened.description.table.records).toEqual([]); expect(reopened.description.baseEvidence).toEqual([]);
    expect(reopened.source.originalChanges()).toEqual(target.originalChanges()); expect(reopened.source.heads).toHaveLength(2);
    expect((await reopened.source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork })).candidates.fields.find(f => f.path.join('/') === `captionsById/${id('cap')}/title`)!.candidates).toHaveLength(2);
  });
  it('refuses stale Session/base capture, unsupported source and missing/corrupt originals or bodies', async () => {
    const f = await backupFixture(), host = await session(f.source), read = await host.read();
    const changed = { read: vi.fn().mockResolvedValueOnce(read).mockResolvedValue({ ...read, publication: 'changed' }) };
    await expect(BackupSourceCapture.prepare(changed, f.source.token, f.bases, f.store, metadataLimits)).rejects.toThrow('publication-changed');
    const bases = { ...f.bases, snapshot: vi.fn().mockResolvedValueOnce({ records: f.rows }).mockResolvedValue({ records: [] }) };
    await expect(BackupSourceCapture.prepare(host, f.source.token, bases, f.store, metadataLimits)).rejects.toThrow('bases-changed');
    await expect(BackupSourceCapture.prepare({ read: async () => ({ ...read, state: 'pending' as const }) }, f.source.token, f.bases, f.store, metadataLimits)).rejects.toThrow('not-ready');
    await expect(BackupSourceCapture.prepare(host, f.source.token, { ...f.bases, readEvidence: async () => new Uint8Array(1) }, f.store, metadataLimits)).rejects.toThrow('evidence-bytes');
    const corrupt = { openReadOnly: async (ref: { byteLength: number }) => ({ size: ref.byteLength, stream: () => new Blob([new Uint8Array(ref.byteLength)]).stream() }) };
    await expect(BackupSourceCapture.prepare(host, f.source.token, f.bases, corrupt, metadataLimits)).rejects.toThrow();
    const unknown = change(f.source, d => { d.project.future = new A.ImmutableString('true'); });
    await expect(BackupSourceCapture.restore(unknown.encodeFullSource(), unknown.proof, unknown.token, backupEncode({ records: [] }), [], f.store, metadataLimits)).rejects.toThrow('opaque-inventory-required');
  });
  it('owns frozen caller bytes and refuses invalid canonical tables or forged provenance', async () => {
    const f = await backupFixture(), table = backupEncode({ records: f.rows }), source = f.source.encodeFullSource();
    const evidence = [...f.evidence].sort(([a], [b]) => a < b ? -1 : 1).map(([sha256, bytes]) => ({ reference: { sha256, byteLength: bytes.length }, bytes: bytes.slice() }));
    const pending = BackupSourceCapture.restore(source, f.source.proof, f.source.token, table, evidence, f.store, metadataLimits);
    source.fill(0); table.fill(0); evidence.forEach(e => e.bytes.fill(0));
    const capture = await pending, built = await output(capture, f.store);
    expect((await BackupArchive.inspect(built.file, metadataLimits)).source.token).toBe(f.source.token);
    for (const edit of [ (r: any[]) => r.reverse(), (r: any[]) => r.push(r[0]), (r: any[]) => { r[0].completions.reverse(); },
      (r: any[]) => { r[0].completions = []; }, (r: any[]) => { r[0].path = 'private'; }, (r: any[]) => { r[0].identity.projectId = id('prj', 99); } ]) {
      const rows = structuredClone(f.rows); edit(rows); expect(() => readBackupBases(backupEncode({ records: rows }), f.source.proof)).toThrow();
    }
    expect(() => readBackupBases(encode('{"records":[],"records":[]}'), f.source.proof)).toThrow();
    expect(() => BackupSourceCapture.restore(new Uint8Array(L.sourceBytes + 1), f.source.proof, f.source.token, backupEncode({ records: [] }), [], f.store, metadataLimits)).toThrow('original-budget');
    expect(() => BackupSourceCapture.restore(f.source.encodeFullSource(), f.source.proof, f.source.token, new Uint8Array(L.controlBytes + 1), [], f.store, metadataLimits)).toThrow('original-budget');
    expect(() => BackupSourceCapture.restore(f.source.encodeFullSource(), f.source.proof, f.source.token, backupEncode({ records: [] }), Array(L.baseEvidenceCount + 1).fill(null), f.store, metadataLimits)).toThrow('original-budget');
    const largeControls = Array.from({ length: 5 }, (_, i) => ({ ...structuredClone(f.rows[0]!), workspacePackageId: id('pkg', i + 1),
      evidence: { ...f.rows[0]!.evidence, manifest: { sha256: hash(100 + i), byteLength: L.controlBytes } } }));
    expect(() => readBackupBases(backupEncode({ records: largeControls }), f.source.proof)).toThrow('control-budget');
    const misbound = await rewrite(built.file, (m, values) => { const rows = structuredClone(f.rows); rows[0]!.workspaceManifestSha256 = hash(80); values.set(m.exchangeBases.path, backupEncode({ records: rows })); });
    await expect(BackupArchive.inspect(misbound, metadataLimits)).rejects.toThrow();
  });
  it('rejects semantically forged inventory/summary and extra or missing evidence despite valid ZIP hashes', async () => {
    const f = await backupFixture(), capture = await BackupSourceCapture.prepare(await session(f.source), f.source.token, f.bases, f.store, metadataLimits);
    const built = await output(capture, f.store);
    const wrongReasons = await rewrite(built.file, (m, values) => {
      const inventory = JSON.parse(new TextDecoder().decode(values.get(m.protectedInventory.path)!)); inventory.blobs[0].reasons = ['current']; values.set(m.protectedInventory.path, backupEncode(inventory));
    });
    await expect(BackupArchive.inspect(wrongReasons, metadataLimits)).rejects.toThrow('protected-inventory');
    const wrongSummary = await rewrite(built.file, m => { m.summary.entityClasses[0]!.count++; });
    await expect(BackupArchive.inspect(wrongSummary, metadataLimits)).rejects.toThrow('backup-summary');
    const missing = await rewrite(built.file, m => { m.baseEvidence.pop(); });
    await expect(BackupArchive.inspect(missing, metadataLimits)).rejects.toThrow('evidence-union');
    const extra = await rewrite(built.file, (m, values) => { const bytes = encode('undeclared proof'), sha256 = packageByteHash(bytes); m.baseEvidence.push({ sha256, byteLength: bytes.length });
      m.baseEvidence.sort((a, b) => a.sha256 < b.sha256 ? -1 : 1); values.set(`base-evidence/sha256/${sha256}`, bytes); });
    await expect(BackupArchive.inspect(extra, metadataLimits)).rejects.toThrow('evidence-union');
    expect(prepareBackupManifest(capture, { packageId: id('pkg', 10), createdByVersion: '0.0.1' }).control.manifest.purpose).toBe('backup');
  });
  it('cancels blocked capture/output and refuses sink failure without completion', async () => {
    const f = await backupFixture(), capture = await BackupSourceCapture.prepare(await session(f.source), f.source.token, f.bases, f.store, metadataLimits);
    const preAbort = new AbortController(); preAbort.abort();
    await expect(BackupArchive.inspect((await output(capture, f.store)).file, metadataLimits, preAbort.signal)).rejects.toThrow();
    await expect(output(capture, { openReadOnly: async () => { throw new Error('missing body'); } })).rejects.toThrow('missing body');
    await expect(writeBackupArchive(capture, f.store, new WritableStream({ write() { throw new Error('sink failed'); } }),
      { packageId: id('pkg', 10), createdByVersion: '0.0.1' })).rejects.toThrow('sink failed');
    for (const phase of ['capture', 'output']) {
      const abort = new AbortController(); let enter!: () => void, cancelled = false;
      const started = new Promise<void>(resolve => { enter = resolve; });
      const store = { openReadOnly: async (ref: { byteLength: number }) => ({ size: ref.byteLength, stream: () => new ReadableStream<Uint8Array>({ pull() { enter(); }, cancel() { cancelled = true; } }) }) };
      const pending = phase === 'capture' ? BackupSourceCapture.prepare(await session(f.source), f.source.token, f.bases, store, metadataLimits, abort.signal) :
        writeBackupArchive(capture, store, new WritableStream(), { packageId: id('pkg', 10), createdByVersion: '0.0.1', signal: abort.signal });
      const rejected = expect(pending).rejects.toThrow(); await started; abort.abort(); await rejected; expect(cancelled).toBe(true);
    }
  });
});

describe('connected Workspace ZIP generation and integrity (not admission or external saving)', () => {
  it('attributes protected current, conflicting and base-only bodies without retaining weak history', async () => {
    const f = await workspaceFixture(), inspection = await f.source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork });
    const candidates = inspection.candidates, base = { path: `blobs/sha256/${hash(99)}`, sha256: hash(99), byteLength: 17 };
    const ordinary = protectedWorkspaceInventory(candidates, [base, f.capture.blobs[0]!]);
    expect(ordinary.blobs.find(b => b.sha256 === base.sha256)!.reasons).toEqual(['exchangeBase']);
    expect(ordinary.blobs.find(b => b.sha256 === f.capture.blobs[0]!.sha256)!.reasons).toEqual(['current', 'exchangeBase']);
    expect(ordinary.blobs).toHaveLength(f.capture.blobs.length + 1);
    // Attribution-unit candidate ports: mutable equal candidates remain conflict;
    // equal whole immutable candidates remain one unambiguous value.
    const duplicate = (path: string[]) => ({ ...candidates, fields: candidates.fields.map(field => {
      if (JSON.stringify(field.path) !== JSON.stringify(path)) return field;
      const candidate = { ...field.candidates[0]!, operationId: 'fixture-second-candidate' };
      return { ...field, candidates: [...field.candidates, candidate], validOperationIds: [...field.validOperationIds, candidate.operationId] };
    }) });
    const rep = fixture().representationsById[id('rep')] as JsonObject, sha = (rep.blob as JsonObject).digest;
    expect(protectedWorkspaceInventory(duplicate(['assetsById', id('ast'), 'status']), []).blobs.find(b => b.sha256 === sha)!.reasons).toEqual(['conflict']);
    expect(protectedWorkspaceInventory(duplicate(['assetsById', id('ast'), 'lifecycle']), []).blobs.find(b => b.sha256 === sha)!.reasons).toEqual(['conflict']);
    expect(protectedWorkspaceInventory(duplicate(['representationsById', id('rep')]), []).blobs.find(b => b.sha256 === sha)!.reasons).toEqual(['current']);
  });
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
