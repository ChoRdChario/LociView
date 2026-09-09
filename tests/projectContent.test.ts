import { describe, expect, it } from 'vitest';
import { inspectProjectContent } from '../src/domain/projectContent';
import type { ContentRequest, ProjectContentVerifier } from '../src/domain/projectContentChecks';
import { immutableDigest } from '../src/domain/projectGraphSupport';
import { inspectProjectCandidates } from '../src/domain/projectCandidates';
import { checkContentFacts } from '../src/domain/projectContentChecks';
import { developmentContentBytes, developmentContentVerifier } from '../poc/scene-history/content-verifier';
import { candidateFixture, candidateWrite, withCandidateChanges } from './helpers/projectCandidateFixture';
import { fixture, id, limits as valueLimits } from './helpers/projectRecordsFixture';
import type { ProjectCandidateInput } from '../src/domain/projectCandidates';

const limits = { ...valueLimits, maxWork: 1_000_000 };
const verifierFor = (r = fixture(), readBytes = developmentContentBytes) => developmentContentVerifier(Object.values(r.representationsById).map((rep: any) =>
  ({ variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest })), readBytes);
const inspect = async (records = fixture(), verifier = verifierFor(records), source: ProjectCandidateInput = candidateFixture(records)) => {
  const result = await inspectProjectContent(source, limits, verifier); expect(result.kind).toBe('project-content-inspection');
  if (result.kind === 'rejected') throw Error(JSON.stringify(result.issue)); return result;
};
const changeReply = (base: ProjectContentVerifier, edit: (reply: any, q: ContentRequest) => any): ProjectContentVerifier => ({ scope: base.scope,
  verify: async q => edit(structuredClone(await base.verify(q)), q) });
const codes = (r: Awaited<ReturnType<typeof inspect>>) => r.issues.map(i => i.code);

describe('exact external-content composition; not SceneResources or profile adoption', () => {
  it('executes triangle and both fixed PNG byte/content checks and retains the complete source and scope', async () => {
    const records = fixture(); const result = await inspect(records);
    expect(result.issues).toEqual([]); expect(result.checks).toHaveLength(3);
    expect(result.checks.every(c => c.outcome === 'verified')).toBe(true);
    expect(result.scope).toBe('development-fixture'); expect(result).not.toHaveProperty('resources');
    expect(result.candidates.source).toEqual(candidateFixture(records));
    const { fixtureMedia } = await import('../src/harness/projectScene/mediaHistory');
    records.mediaResourcesById = Object.fromEntries(fixtureMedia.map(m => [m.record.id, m.record]));
    records.captionAttachmentsById[id('att', 2)] = { ...records.captionAttachmentsById[id('att')], id: id('att', 2), mediaResourceId: fixtureMedia[1]!.record.id };
    expect((await inspect(records)).checks.filter(c => c.request.fact === 'media').every(c => c.outcome === 'verified')).toBe(true);
  });
  it('does not reuse evidence across token, full blob descriptor, profile, catalog, transform or immutable identity', async () => {
    const records = fixture();
    const mutations: ((q: any) => void)[] = [q => { q.token += '-old'; }, q => { q.records[0].payloadDigest = '0'.repeat(64); },
      q => { q.records[0].id = id('rep', 9); }, q => { q.records[0].blob.byteLength++; }, q => { q.records[0].blob.mediaType = 'other/type'; },
      q => { q.records[0].formatProfile.specificationSha256 = '0'.repeat(64); }, q => { q.records[0].representationToAsset.translation[0]++; },
      q => { q.records[0].materialCatalog.slots[0].sourceSemantics.lighting = 'unlit'; }];
    for (const mutate of mutations) {
      const v = changeReply(verifierFor(records), (reply, q) => { if (q.fact === 'representation') mutate(reply.request); return reply; });
      expect(codes(await inspect(records, v))).toContain('representation-stale');
    }
    const scope = changeReply(verifierFor(records), reply => ({ ...reply, scope: 'ratified-profile' }));
    expect((await inspect(records, scope)).checks.every(c => c.outcome === 'stale')).toBe(true);
  });
  it('keeps missing, unsupported, actual corrupt bytes, malformed facts and thrown failure distinct', async () => {
    const records = fixture();
    expect(codes(await inspect(records, verifierFor(records, async () => undefined)))).toContain('representation-missing');
    const corrupted = verifierFor(records, async r => { const b = await developmentContentBytes(r); if (b) b[0] = b[0]! ^ 1; return b; });
    expect(codes(await inspect(records, corrupted))).toContain('representation-failed');
    expect(codes(await inspect(records, { scope: 'development-fixture', verify: async () => { throw Error('private detail'); } }))).toContain('representation-failed');
    const bad = changeReply(verifierFor(records), r => ({ ...r, extra: true }));
    expect(codes(await inspect(records, bad))).toContain('representation-malformed');
    records.representationsById[id('rep')].formatProfile.specificationSha256 = '0'.repeat(64);
    records.representationsById[id('rep')].payloadDigest = await immutableDigest('representation', records.representationsById[id('rep')]);
    expect(codes(await inspect(records))).toContain('representation-unsupported');
  });
  it('does not confuse a content subset with authoritative bounds or source material bijection', async () => {
    const records = fixture(), r = records.representationsById[id('rep')];
    r.logicalBoundsAsset.max = [8, 8, 8]; r.payloadDigest = await immutableDigest('representation', r);
    const result = await inspect(records); expect(result.checks.find(c => c.request.fact === 'representation')!.outcome).toBe('verified');
    expect(codes(result)).toContain('family-envelope-malformed');
    expect(codes(await inspect(fixture(), developmentContentVerifier([])))).toContain('family-envelope-missing');
    for (const edit of [(f: any) => { f.materials[0].sourceLocator.slotIndex++; }, (f: any) => { f.materials.push(f.materials[0]); },
      (f: any) => { f.materials[0].sourceSemantics.coverage.kind = 'blend'; }, (f: any) => { f.staticPose = false; }]) {
      const v = changeReply(verifierFor(), (reply, q) => { if (q.fact === 'representation') edit(reply.facts); return reply; });
      expect(codes(await inspect(fixture(), v))).toContain('representation-malformed');
    }
  });
  it('range-checks exact source occurrences only when those bytes are verified, without promoting weak provenance', async () => {
    const r = fixture(), anchor = r.captionsById[id('cap')].anchor;
    anchor.hitEvidence = { method: 'mesh', source: { representationId: id('rep'), surfaceRef: { kind: 'meshTriangle', nodeIndex: 0, primitiveIndex: 0, triangleIndex: 0, barycentric: [1, 0, 0] } } };
    expect(codes(await inspect(r))).not.toContain('verified-source-index-range-required');
    anchor.hitEvidence.source.surfaceRef.nodeIndex = 1;
    const invalid = await inspect(r); expect(codes(invalid)).toContain('source-index-out-of-range');
    const absent = await inspect(r, verifierFor(r, async record => record.contentKind ? undefined : developmentContentBytes(record)));
    expect(codes(absent)).toContain('source-index-unverified'); expect(codes(absent)).not.toContain('source-index-out-of-range');
    expect((absent.candidates.unambiguousRecords.captionsById as any)[id('cap')].anchor).toEqual(anchor);
    expect(absent.candidates.knownReferences).toContainEqual(expect.objectContaining({ from: id('cap'), to: id('rep'), strength: 'weak' }));
    expect(absent.candidates.knownReferences).not.toContainEqual(expect.objectContaining({ from: id('cap'), to: id('rep'), strength: 'strong' }));
  });
  it('proves every repeated-class family independently; missing equivalence cannot be cleared by other content evidence', async () => {
    const r = fixture(), second = structuredClone(r.assetRevisionsById[id('rev')]); second.id = id('rev', 2); second.parentRevisionId = id('rev');
    second.payloadDigest = await immutableDigest('asset-revision', second); r.assetRevisionsById[second.id] = second;
    expect((await inspect(r)).checks.find(c => c.request.fact === 'surface-equivalence')?.outcome).toBe('verified');
    const v = changeReply(verifierFor(r), (reply, q) => q.fact === 'surface-equivalence' ? { request: reply.request, scope: reply.scope, outcome: 'unsupported' } : reply);
    const pending = await inspect(r, v); expect(codes(pending)).toContain('verified-surface-equivalence-required');
    expect(pending.issues.filter(i => i.code === 'verified-surface-equivalence-required')).toHaveLength(2);
  });
  it('retains conflicts and malformed siblings even if exact content checks succeed', async () => {
    const r = fixture(), source = candidateFixture(r), path = ['captionsById', id('cap'), 'title'];
    const next = withCandidateChanges(source, [{ id: 'a', deps: ['root'], writes: [candidateWrite('a', path, 'one')] },
      { id: 'b', deps: ['root'], writes: [candidateWrite('b', path, 32)] }]);
    const inspected = await inspect(r, verifierFor(r), next);
    expect(inspected.checks.every(c => c.outcome === 'verified')).toBe(true);
    expect(inspected.candidates.fields.find(f => f.path.join('/') === path.join('/'))!.candidates).toHaveLength(2);
    expect(inspected.issues.some(i => i.kind === 'invalid')).toBe(true);
    expect((inspected.candidates.unambiguousRecords.captionsById as any)[id('cap')]).not.toHaveProperty('title');
  });
  it('rejects evidence work overruns and never consumes an imported success receipt', async () => {
    const source = candidateFixture();
    const candidate = await inspectProjectCandidates(source, limits); if (candidate.kind === 'rejected') throw Error();
    expect((await inspectProjectContent(source, { ...limits, maxWork: candidate.workUsed + 1 }, verifierFor())).kind).toBe('rejected');
    expect((await inspectProjectContent({ ...source, evidence: { verified: true } }, limits, verifierFor())).kind).toBe('rejected');
    const v = changeReply(verifierFor(), reply => Object.defineProperty({}, 'request', { get() { throw Error('must not invoke'); }, enumerable: true }));
    expect(codes(await inspect(fixture(), v))).toContain('representation-malformed');
  });
  it('accepts the existing catalog size contract beyond 4096 entries without inventing a lower cap', () => {
    const r = fixture().representationsById[id('rep')];
    const material = r.materialCatalog.slots[0];
    r.materialCatalog.slots = Array.from({ length: 4097 }, (_, i) => ({ ...material, logicalMaterialSlotId: id('slot', i + 1), sourceLocator: { kind: 'representationMaterial', slotIndex: i } }));
    expect(() => checkContentFacts({ token: 'test', fact: 'representation', records: [r], context: {} }, {
      contentKind: 'mesh', staticPose: true, contentBoundsAsset: r.logicalBoundsAsset,
      materials: r.materialCatalog.slots.map(({ sourceLocator, sourceSemantics }: any) => ({ sourceLocator, sourceSemantics })), surfaceRanges: [],
    })).not.toThrow();
  });
  it('checks same-family logical contribution even in one revision, separately from the envelope', async () => {
    const r = fixture(), original = r.representationsById[id('rep')], other = structuredClone(original);
    const { fixtureModelBytes, fixtureSha256 } = await import('../src/harness/projectScene/modelClosure');
    other.id = id('rep', 2); other.representationFrameId = id('frm', 4);
    const bytes = fixtureModelBytes('updated'); other.blob = { ...other.blob, digest: fixtureSha256(bytes), byteLength: bytes.length };
    original.logicalBoundsAsset.max[2] = 0.5; other.logicalBoundsAsset.max[2] = 0.5;
    original.payloadDigest = await immutableDigest('representation', original); other.payloadDigest = await immutableDigest('representation', other);
    r.representationsById[other.id] = other;
    r.assetRevisionsById[id('rev')].representationIds.push(other.id);
    r.assetRevisionsById[id('rev')].payloadDigest = await immutableDigest('asset-revision', r.assetRevisionsById[id('rev')]);
    const v = developmentContentVerifier([{ variantFamilyId: other.variantFamilyId, representationId: other.id, payloadDigest: other.payloadDigest }]);
    const result = await inspect(r, v);
    expect(result.checks.filter(c => c.request.fact === 'representation' || c.request.fact === 'family-envelope').every(c => c.outcome === 'verified')).toBe(true);
    expect(result.checks.find(c => c.request.fact === 'family-contribution')?.outcome).toBe('failed');
    expect(result.issues.filter(i => i.code === 'family-contribution-failed')).toHaveLength(2);
  });
  it('does not load a source referenced only by weak pin/history metadata', async () => {
    const r = fixture(), old = structuredClone(r.representationsById[id('rep')]); old.id = id('rep', 2); old.representationFrameId = id('frm', 4);
    old.variantFamilyId = id('fam', 2); old.payloadDigest = await immutableDigest('representation', old); r.representationsById[old.id] = old;
    const revision = structuredClone(r.assetRevisionsById[id('rev')]); revision.id = id('rev', 2); revision.representationIds = [old.id];
    revision.anchorCompatibilityClasses = [{ id: id('cmp', 2), targetVariantFamilyIds: [id('fam', 2)] }];
    revision.payloadDigest = await immutableDigest('asset-revision', revision); r.assetRevisionsById[revision.id] = revision;
    Object.assign(r.captionsById[id('cap')].anchor, { authoredAssetRevisionId: revision.id, authoredAnchorCompatibilityId: id('cmp', 2),
      hitEvidence: { method: 'mesh', source: { representationId: old.id, surfaceRef: { kind: 'meshTriangle', nodeIndex: 9, primitiveIndex: 0, triangleIndex: 0, barycentric: [1, 0, 0] } } } });
    const read: string[] = [];
    const result = await inspect(r, verifierFor(r, async record => { read.push(String(record.id)); return developmentContentBytes(record); }));
    expect(read).not.toContain(old.id); expect(codes(result)).toContain('source-index-unverified'); expect(codes(result)).not.toContain('source-index-out-of-range');
  });
  it('reuses actually decoded exact geometry for an inactive equivalent revision without fetching its weak source', async () => {
    const r = fixture(), old = structuredClone(r.representationsById[id('rep')]); old.id = id('rep', 2); old.representationFrameId = id('frm', 4);
    old.payloadDigest = await immutableDigest('representation', old); r.representationsById[old.id] = old;
    const revision = structuredClone(r.assetRevisionsById[id('rev')]); revision.id = id('rev', 2); revision.representationIds = [old.id];
    revision.payloadDigest = await immutableDigest('asset-revision', revision); r.assetRevisionsById[revision.id] = revision;
    r.captionsById[id('cap')].anchor.hitEvidence = { method: 'mesh', source: { representationId: old.id,
      surfaceRef: { kind: 'meshTriangle', nodeIndex: 9, primitiveIndex: 0, triangleIndex: 0, barycentric: [1, 0, 0] } } };
    const reads: string[] = [], v = verifierFor(r, async record => { reads.push(String(record.id)); return developmentContentBytes(record); });
    const result = await inspect(r, v);
    expect(result.checks.find(c => c.request.fact === 'surface-equivalence')?.outcome).toBe('verified');
    expect(reads).not.toContain(old.id); expect(codes(result)).not.toContain('verified-surface-equivalence-required');
    expect(codes(result)).toContain('source-index-unverified'); expect(codes(result)).not.toContain('source-index-out-of-range');
    // Prior verified bytes do not prove a different profile or AssetFrame transform.
    old.representationToAsset.translation[0]++;
    old.payloadDigest = await immutableDigest('representation', old);
    const changed = await inspect(r, v);
    expect(changed.checks.find(c => c.request.fact === 'surface-equivalence')?.outcome).toBe('missing');
    expect(codes(changed)).toContain('verified-surface-equivalence-required'); expect(reads).not.toContain(old.id);
    const proof = result.checks.find(c => c.request.fact === 'surface-equivalence')!.request;
    expect((await verifierFor(r).verify(proof) as { outcome: string }).outcome).toBe('missing');
  });
});
