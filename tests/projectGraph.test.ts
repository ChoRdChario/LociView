import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inspectProjectGraph, type ProjectGraphInspection } from '../src/domain/projectGraph';
import { canonical, immutableKinds } from '../src/domain/projectGraphSupport';
import { createFixtureModel } from '../src/harness/projectScene/modelClosure';
import { fixture, id, limits, lifecycle } from './helpers/projectRecordsFixture';

type Doc = Record<string, any>;
type Inspection = Extract<ProjectGraphInspection, { kind: 'record-graph-inspection' }>;
const first = (d: Doc, map: string): any => Object.values(d[map])[0];
// Independent test preimage/hash (not the production encoder or synthetic fixture digest).
const encode = (v: any): string => v !== null && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(encode).join(',')}]`
  : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${encode(v[k])}`).join(',')}}` : JSON.stringify(v);
function seal(d: Doc) {
  for (const [map, kind] of Object.entries(immutableKinds)) for (const r of Object.values(d[map]) as any[]) {
    const { payloadDigest: _, ...payload } = r;
    r.payloadDigest = createHash('sha256').update(`lociview:v2:immutable:${kind}:jcs-v1\n${encode(payload)}`).digest('hex');
  }
  return d;
}
async function inspect(d: Doc, prior?: Doc): Promise<Inspection> {
  const r = await inspectProjectGraph(seal(d), limits, prior === undefined ? undefined : seal(prior));
  expect(r.kind, JSON.stringify(r)).toBe('record-graph-inspection'); return r as Inspection;
}
const codes = (r: Inspection, kind?: string) => r.issues.filter(i => kind === undefined || i.kind === kind).map(i => i.code);
function addModel(d: Doc, n = 2) {
  const m = structuredClone(createFixtureModel({ asset: id('ast', n), assetFrame: id('frm', 20 + n), representationFrame: id('frm', 40 + n),
    binding: id('bnd', n), revision: id('rev', n), representation: id('rep', n), family: id('fam', n), compatibility: id('cmp', n), layout: id('lay', n), slot: id('slot', n) },
  'original', { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 }));
  d.assetsById[id('ast', n)] = { id: id('ast', n), label: '別モデル', assetFrameId: id('frm', 20 + n), status: { kind: 'ready', activeBindingId: id('bnd', n) }, lifecycle: lifecycle() };
  for (const [map, record] of [['assetBindingsById', m.binding], ['assetRevisionsById', m.revision], ['representationsById', m.representation]] as const) d[map][record.id] = record;
  return m;
}

describe('whole-record graph inspection: never complete provider authority', () => {
  it('retains the whole frozen root, exposes pending evidence and roots outside Scenes without a trusted projection', async () => {
    const d = fixture(); addModel(d); d.sceneAssetMembershipsById = {}; d.future = { retained: 0.25 }; d.migrationSupport = { opaque: 'keep' };
    const before = structuredClone(seal(d)), r = await inspect(d);
    expect(codes(r, 'invalid')).toEqual([]); expect(r.records).toEqual(before); expect(Object.isFrozen(r.records)).toBe(true);
    expect(r.pendingAuthority).toEqual(['all-candidates-and-causality', 'verified-blob-profile-semantics', 'same-token-provider']);
    expect(r.knownActiveRoots).toContain(id('ast', 2)); expect(r.knownActiveRoots).toContain(id('att'));
    expect(codes(r, 'unverified')).toEqual(expect.arrayContaining(['opaque-data-protection-required', 'migration-support-authority-required', 'verified-profile-content-bounds-catalog-required', 'verified-media-bytes-required']));
    expect(r).not.toHaveProperty('resources'); expect(r).not.toHaveProperty('token'); expect(r).not.toHaveProperty('valid');
    first(d, 'captionsById').title = 'changed'; expect(first(r.records, 'captionsById').title).toBe('記録');
  });
  it('checks exact metadata digests for all four immutable maps, including unknown payload, not just declared hashes', async () => {
    for (const map of Object.keys(immutableKinds)) {
      const d = fixture(); first(d, map).payloadDigest = 'f'.repeat(64);
      const r = await inspectProjectGraph(d, limits) as Inspection;
      expect(r.issues).toContainEqual(expect.objectContaining({ map, code: 'immutable-digest-mismatch' }));
      const unknown = fixture(); first(unknown, map).future = { '😀': 1e30, '\ue000': -0, 'a': 1e-7, text: 'é\n' };
      expect(codes(await inspect(unknown), 'invalid')).toEqual([]);
      first(unknown, map).future.text = 'changed';
      expect(codes(await inspectProjectGraph(unknown, limits) as Inspection)).toContain('immutable-digest-mismatch');
    }
    expect(canonical({ '😀': 1, '\ue000': 2, a: -0 })).toBe('{"a":0,"😀":1,"\ue000":2}');
  });
  it('rejects malformed current/prior structures before graph work and never calls getters', async () => {
    let invoked = false; const d = fixture(); Object.defineProperty(d, 'assetsById', { get() { invoked = true; throw new Error('read'); }, enumerable: true });
    expect(await inspectProjectGraph(d, limits)).toMatchObject({ kind: 'rejected', input: 'current' }); expect(invoked).toBe(false);
    expect(await inspectProjectGraph(fixture(), limits, {})).toMatchObject({ kind: 'rejected', input: 'prior' });
  });
  it('preserves prior immutable identities and all tombstoned map entries, while allowing mutable attachment reassignment', async () => {
    const original = fixture(); addModel(original);
    for (const [map, field, value] of [
      ['assetsById', 'assetFrameId', id('frm', 99)], ['viewsById', 'projectFrameId', id('frm', 99)], ['viewsById', 'sceneId', id('scn', 99)],
      ['sceneAssetMembershipsById', 'assetId', id('ast', 2)], ['sceneCaptionMembershipsById', 'captionId', id('cap', 99)],
    ]) {
      const d = structuredClone(original); first(d, map!)[field!] = value;
      expect(codes(await inspect(d, original))).toContain('immutable-identity-changed');
    }
    for (const map of Object.keys(immutableKinds)) {
      const d = structuredClone(original); first(d, map).future = { changed: true };
      expect(codes(await inspect(d, original))).toContain('immutable-payload-changed');
    }
    const missing = structuredClone(original); missing.captionAttachmentsById = {};
    expect(codes(await inspect(missing, original))).toContain('record-removed-without-tombstone');
    const changed = structuredClone(original); first(changed, 'captionAttachmentsById').captionId = id('cap', 2);
    changed.captionsById[id('cap', 2)] = { ...first(changed, 'captionsById'), id: id('cap', 2) };
    expect(codes(await inspect(changed, original), 'invalid')).toEqual([]);
    const foreign = structuredClone(original); foreign.identity.projectId = id('prj', 2);
    expect(codes(await inspect(foreign, original))).toContain('prior-lineage-mismatch');
    const frame = structuredClone(original); frame.project.frame.unit = { kind: 'meters', metersPerProjectUnit: 1 };
    expect(codes(await inspect(frame, original))).toContain('immutable-identity-changed');
  });
  it('checks owner and parent metadata, but parent/history/provenance references do not retain blob bytes', async () => {
    const d = fixture(), old = structuredClone(first(d, 'assetRevisionsById')); old.id = id('rev', 9); d.assetRevisionsById[old.id] = old;
    first(d, 'assetRevisionsById').parentRevisionId = old.id;
    const r = await inspect(d);
    expect(r.knownReferences).toContainEqual({ from: id('rev'), to: old.id, field: 'parentRevisionId', strength: 'weak' });
    expect(codes(r, 'invalid')).toEqual([]);
    delete d.assetRevisionsById[old.id]; expect(codes(await inspect(d))).toContain('missing-reference');
    const foreign = fixture(); addModel(foreign);
    first(foreign, 'assetBindingsById').parentBindingId = id('bnd', 2); first(foreign, 'assetRevisionsById').representationIds = [id('rep', 2)];
    expect(codes(await inspect(foreign))).toContain('foreign-owner');
    first(foreign, 'assetsById').status.activeBindingId = id('bnd', 99); expect(codes(await inspect(foreign))).toContain('missing-reference');
  });
  it('enforces global frame alias/owner/transform and family semantics while allowing candidate encodings to differ', async () => {
    const d = fixture(), rep = first(d, 'representationsById'); d.representationsById[id('rep', 2)] = { ...structuredClone(rep), id: id('rep', 2) };
    const other = d.representationsById[id('rep', 2)]; other.representationFrameId = id('frm', 99); other.representationToAsset.translation = [0, 0, 0];
    other.materialCatalog.slots[0].sourceLocator.slotIndex = 9;
    expect(codes(await inspect(d), 'invalid')).toEqual([]);
    other.representationFrameId = rep.representationFrameId; expect(codes(await inspect(d))).toContain('shared-frame-mismatch');
    other.representationFrameId = id('frm', 99); other.logicalBoundsAsset.max[0] = 10;
    expect(codes(await inspect(d))).toContain('family-semantics-mismatch');
    const shared = fixture(); addModel(shared); shared.assetsById[id('ast', 2)].assetFrameId = id('frm', 2);
    expect(codes(await inspect(shared))).toContain('shared-asset-frame');
    first(shared, 'representationsById').representationFrameId = id('frm'); expect(codes(await inspect(shared))).toContain('project-frame-collision');
    const alias = fixture(); first(alias, 'representationsById').representationFrameId = id('frm', 2);
    expect(codes(await inspect(alias))).toContain('asset-frame-alias-requires-identity');
    first(alias, 'representationsById').representationToAsset.translation = [0, 0, 0]; expect(codes(await inspect(alias), 'invalid')).toEqual([]);
    for (const [role, contentKind] of [['meshPrimary', 'mesh'], ['pointPrimary', 'pointCloud'], ['visualPatch', 'mesh']]) {
      const absent = fixture(), r = first(absent, 'representationsById'); r.role = role; r.contentKind = contentKind; delete r.materialCatalog;
      expect(codes(await inspect(absent), 'invalid')).toContain('required-material-catalog-missing');
    }
  });
  it('checks a complete derivedFrom DAG and the exact 32-edge boundary without recursion or source inference', async () => {
    const chain = fixture(), source = structuredClone(first(chain, 'representationsById'));
    for (let n = 2; n <= 34; n++) chain.representationsById[id('rep', n)] = { ...structuredClone(source), id: id('rep', n), derivedFrom: [id('rep', n - 1)] };
    const r = await inspect(chain); expect(r.issues.filter(i => i.code === 'derivation-depth-exceeded').map(i => i.id)).toEqual([id('rep', 34)]);
    expect(r.knownReferences).toContainEqual({ from: id('rep', 2), to: id('rep'), field: 'derivedFrom', strength: 'strong' });
    first(chain, 'representationsById').derivedFrom = [id('rep', 34)];
    expect((await inspect(chain)).issues.filter(i => i.code === 'cyclic-derivation-closure')).toHaveLength(34);
    const missing = fixture(); first(missing, 'representationsById').derivedFrom = [id('rep', 99)]; expect(codes(await inspect(missing))).toContain('missing-reference');
  });
  it('distinguishes invalid class partitions and class inheritance from a valid old pin needing review', async () => {
    const missing = fixture(); first(missing, 'assetRevisionsById').anchorCompatibilityClasses = [];
    const invalid = await inspect(missing); expect(codes(invalid)).toContain('invalid-class-partition'); expect(codes(invalid)).not.toContain('anchor-class-not-current');
    const old = fixture(); first(old, 'captionsById').anchor.authoredAnchorCompatibilityId = id('cmp', 99); delete first(old, 'captionsById').anchor.authoredAssetRevisionId;
    const review = await inspect(old); expect(codes(review, 'invalid')).toEqual([]); expect(codes(review, 'needs-review')).toContain('anchor-class-not-current');
    const overlap = fixture(); first(overlap, 'assetRevisionsById').anchorCompatibilityClasses.push({ id: id('cmp', 2), targetVariantFamilyIds: [id('fam')] });
    expect(codes(await inspect(overlap))).toContain('invalid-class-partition');
    const inherited = fixture(); inherited.assetRevisionsById[id('rev', 2)] = { ...structuredClone(first(inherited, 'assetRevisionsById')), id: id('rev', 2) };
    expect(codes(await inspect(inherited), 'unverified')).toContain('verified-surface-equivalence-required');
    inherited.assetRevisionsById[id('rev', 2)].anchorCompatibilityClasses[0].targetVariantFamilyIds = [id('fam', 99)];
    expect(codes(await inspect(inherited))).toContain('class-owner-or-membership-changed');
  });
  it('requires proxy/exclusion targets and patch groups inside the same revision with singleton exclusion families', async () => {
    const d = fixture(), source = structuredClone(first(d, 'representationsById'));
    const gs = { ...structuredClone(source), id: id('rep', 2), variantFamilyId: id('fam', 2), role: 'gsPrimary', contentKind: 'gaussianSplat' };
    const proxy = { ...structuredClone(source), id: id('rep', 3), variantFamilyId: id('fam', 3), role: 'interactionProxy', purposes: ['interaction'], proxyForGsVariantFamilyId: id('fam', 2) };
    const patch = { ...structuredClone(source), id: id('rep', 4), variantFamilyId: id('fam', 4), role: 'visualPatch', compositeGroupId: id('grp') };
    const mask = { ...structuredClone(source), id: id('rep', 5), variantFamilyId: id('fam', 5), role: 'splatExclusion', contentKind: 'splatMask', purposes: ['display'], compositeGroupId: id('grp'), targetGsVariantFamilyIds: [id('fam', 2)],
      representationFrameId: id('frm', 2), representationToAsset: { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1, reflection: 'none' } };
    for (const r of [gs, proxy, patch, mask]) d.representationsById[r.id] = r;
    const revision = first(d, 'assetRevisionsById'); revision.representationIds = Object.keys(d.representationsById);
    revision.anchorCompatibilityClasses.push(...[2, 4].map(n => ({ id: id('cmp', n), targetVariantFamilyIds: [id('fam', n)] })));
    expect(codes(await inspect(d), 'invalid')).toEqual([]);
    proxy.proxyForGsVariantFamilyId = id('fam', 99); mask.targetGsVariantFamilyIds = [id('fam', 99)]; delete (patch as any).compositeGroupId;
    const r = await inspect(d); expect(codes(r)).toEqual(expect.arrayContaining(['proxy-target-not-gs-in-revision', 'exclusion-target-not-gs-in-revision', 'exclusion-group-without-patch']));
    d.representationsById[id('rep', 6)] = { ...structuredClone(mask), id: id('rep', 6) };
    expect(codes(await inspect(d))).toContain('exclusion-family-not-singleton');
  });
  it('keeps absent weak provenance out of failure/root closure, but rejects wrong existing anchor sources and frames', async () => {
    const noEvidence = fixture(); delete first(noEvidence, 'captionsById').anchor.hitEvidence;
    expect(codes(await inspect(noEvidence), 'invalid')).toEqual([]);
    const d = fixture(), anchor = first(d, 'captionsById').anchor; anchor.authoredAssetRevisionId = id('rev', 99);
    anchor.hitEvidence = { method: 'mesh', source: { representationId: id('rep', 99), surfaceRef: { kind: 'meshTriangle', nodeIndex: 0, primitiveIndex: 0, triangleIndex: 0, barycentric: [1, 0, 0] } } };
    expect(codes(await inspect(d), 'invalid')).toEqual([]);
    anchor.hitEvidence.source.representationId = id('rep'); anchor.hitEvidence.method = 'proxy';
    expect(codes(await inspect(d))).toContain('wrong-anchor-source');
    anchor.hitEvidence.method = 'mesh'; anchor.assetFrameId = id('frm', 99);
    expect(codes(await inspect(d))).toContain('wrong-asset-frame');
    anchor.assetFrameId = id('frm', 2); anchor.authoredAssetRevisionId = id('rev');
    expect(codes(await inspect(d), 'unverified')).toContain('verified-source-index-range-required');
  });
  it('keeps duplicate membership/material owners actionable, permits duplicate attachments, and scopes orphan/default diagnoses', async () => {
    const d = fixture(); d.project.defaultSceneId = id('scn', 99);
    for (const [map, prefix] of [['sceneAssetMembershipsById', 'sam'], ['sceneCaptionMembershipsById', 'scm'], ['captionTagMembershipsById', 'tgm'], ['materialOverridesById', 'ovr'], ['captionAttachmentsById', 'att']])
      d[map!][id(prefix!, 2)] = { ...structuredClone(first(d, map!)), id: id(prefix!, 2) };
    const r = await inspect(d); expect(r.issues.filter(i => i.code === 'duplicate-semantic-key')).toHaveLength(8);
    expect(codes(r, 'invalid')).toEqual([]); expect(codes(r, 'needs-review')).toContain('unavailable-default-scene');
    first(d, 'captionsById').lifecycle = { state: 'deleted', eventId: id('evt', 2), reason: 'userDelete' };
    expect(codes(await inspect(d), 'orphan')).toContain('unavailable-endpoint');
    expect(first(d, 'captionAttachmentsById').lifecycle.state).toBe('active');
    first(d, 'viewsById').sceneId = id('scn', 99); expect(codes(await inspect(d))).toContain('unavailable-entry-view');
  });
  it('checks direct-parent catalog mappings one-to-one without following them as runtime aliases', async () => {
    const d = fixture(), current = first(d, 'assetRevisionsById'), old = structuredClone(current); old.id = id('rev', 2); d.assetRevisionsById[old.id] = old;
    current.parentRevisionId = old.id;
    current.materialCompatibilityMaps = [{ source: { assetRevisionId: old.id, variantFamilyId: id('fam'), layoutId: id('lay') },
      destination: { assetRevisionId: current.id, variantFamilyId: id('fam'), layoutId: id('lay') }, slots: { [id('slot')]: id('slot') } }];
    expect(codes(await inspect(d), 'invalid')).toEqual([]);
    current.materialCompatibilityMaps[0].source.assetRevisionId = id('rev', 99); expect(codes(await inspect(d))).toContain('invalid-direct-parent-material-map');
    current.materialCompatibilityMaps[0].source.assetRevisionId = old.id; current.materialCompatibilityMaps[0].slots = {};
    expect(codes(await inspect(d), 'needs-review')).toContain('partial-material-map');
    first(d, 'materialOverridesById').routing.target.materialLayoutId = id('lay', 99);
    expect(codes(await inspect(d), 'needs-review')).toContain('target-not-in-current-catalog');
    const catalog = first(d, 'representationsById').materialCatalog;
    catalog.slots.push({ ...structuredClone(catalog.slots[0]), logicalMaterialSlotId: id('slot', 2), sourceLocator: { kind: 'representationMaterial', slotIndex: 1 } });
    const mapping = current.materialCompatibilityMaps[0]; mapping.slots = { [id('slot')]: id('slot'), [id('slot', 2)]: id('slot', 2) };
    current.materialCompatibilityMaps.push({ ...structuredClone(mapping), slots: { [id('slot')]: id('slot', 2), [id('slot', 2)]: id('slot') } });
    expect(codes(await inspect(d), 'needs-review')).toContain('ambiguous-material-maps');
    current.materialCompatibilityMaps[1] = structuredClone(mapping);
    expect(codes(await inspect(d))).not.toContain('ambiguous-material-maps');
  });
});
