import { describe, expect, it } from 'vitest';
import { admitProjectRecords, projectRecordMaps } from '../src/domain/projectRecords';
import { createFixtureModel } from '../src/harness/projectScene/modelClosure';
import { fixtureMedia } from '../src/harness/projectScene/mediaHistory';

const id = (prefix: string, n = 1) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
const limits = { maxNodes: 100_000, maxDepth: 32, maxStringScalars: 65_536 };
const lifecycle = () => ({ state: 'active', eventId: id('evt'), reason: 'initial' });
/** All amended map kinds, known public fixture metadata; never real input/adoption evidence. */
function fixture(): Record<string, any> {
  const model = createFixtureModel({ asset: id('ast'), assetFrame: id('frm', 2), representationFrame: id('frm', 3), binding: id('bnd'), revision: id('rev'), representation: id('rep'),
    family: id('fam'), compatibility: id('cmp'), layout: id('lay'), slot: id('slot') }, 'original', { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });
  const table = <T extends { id: string }>(record: T) => ({ [record.id]: record });
  return structuredClone({ schema: { major: 2, minor: 0 }, identity: { projectId: id('prj'), historyEpoch: id('hep'), lineageSeed: '0'.repeat(64) },
    project: { title: '資料', defaultSceneId: id('scn'), frame: { id: id('frm'), handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } } },
    assetsById: table({ id: id('ast'), label: '模型', assetFrameId: id('frm', 2), status: { kind: 'ready', activeBindingId: id('bnd') }, lifecycle: lifecycle() }),
    assetRevisionsById: table(model.revision), assetBindingsById: table(model.binding), representationsById: table(model.representation), mediaResourcesById: table(fixtureMedia[0]!.record),
    captionsById: table({ id: id('cap'), title: '記録', body: '本文\r\n\t次の行\r保持', colorSrgb: [0.1, 0.2, 0.3], lifecycle: lifecycle(),
      anchor: { kind: 'asset', assetId: id('ast'), assetFrameId: id('frm', 2), positionAsset: [0, 0, 0], authoredAssetRevisionId: id('rev'), authoredAnchorCompatibilityId: id('cmp'), hitEvidence: { method: 'manual' } } }),
    captionAttachmentsById: table({ id: id('att'), captionId: id('cap'), mediaResourceId: fixtureMedia[0]!.record.id, altText: '説明', orderKey: 'A', lifecycle: lifecycle() }),
    captionTagsById: table({ id: id('tag'), label: '確認', colorSrgb: [0.2, 0.3, 0.4], orderKey: 'A', lifecycle: lifecycle() }),
    captionTagMembershipsById: table({ id: id('tgm'), captionId: id('cap'), tagId: id('tag'), lifecycle: lifecycle() }),
    scenesById: table({ id: id('scn'), name: '全体', orderKey: 'A', defaultViewId: id('view'), lifecycle: lifecycle() }),
    sceneAssetMembershipsById: table({ id: id('sam'), sceneId: id('scn'), assetId: id('ast'), orderKey: 'A', lifecycle: lifecycle() }),
    sceneCaptionMembershipsById: table({ id: id('scm'), sceneId: id('scn'), captionId: id('cap'), orderKey: 'A', lifecycle: lifecycle() }),
    viewsById: table({ id: id('view'), sceneId: id('scn'), name: '正面', orderKey: 'A', projectFrameId: id('frm'), lifecycle: lifecycle(),
      camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 1 } }, background: { kind: 'solid', colorSrgb: [0.8, 0.8, 0.8] } }),
    materialOverridesById: table({ id: id('ovr'), routing: { scope: { kind: 'scene', sceneId: id('scn') }, target: { assetId: id('ast'), variantFamilyId: id('fam'), materialLayoutId: id('lay'), logicalMaterialSlotId: id('slot') } },
      appearance: {}, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' }, lifecycle: lifecycle() }) });
}
function pass(input: unknown) { const result = admitProjectRecords(input, limits); expect(result.kind, JSON.stringify(result.kind === 'rejected' ? result.issue : null)).toBe('valid-records'); return result; }
function fail(input: unknown) { const result = admitProjectRecords(input, limits); expect(result.kind).toBe('rejected'); return result; }
const record = (doc: Record<string, any>, table: keyof typeof projectRecordMaps) => Object.values(doc[table])[0] as any;

describe('complete-provider stage A: amended whole-root structures, not graph/causal/blob authority', () => {
  it('covers every map in one bounded independent immutable result, preserving exact body newlines and unknown subtrees', () => {
    const input = fixture(), result = pass(input); if (result.kind !== 'valid-records') throw new Error('records');
    expect(result.entityCount).toBe(Object.keys(projectRecordMaps).length); expect(result.hasUnknownFields).toBe(false);
    expect(result.records).toEqual(input); expect(result.records).not.toBe(input); expect(Object.isFrozen(result.records)).toBe(true);
    record(input, 'captionsById').body = 'changed'; expect((result.records.captionsById as any)[id('cap')].body).toBe('本文\r\n\t次の行\r保持');
    const unknown = fixture(); unknown.futureRoot = { opaque: [0.125, { text: '保持' }] }; unknown.migrationSupport = { future: 'protected' };
    unknown.schema.future = true; unknown.identity.future = true; unknown.project.frame.unit.future = true;
    record(unknown, 'assetBindingsById').assetToProject.future = { keep: true }; record(unknown, 'captionsById').anchor.hitEvidence.future = true;
    record(unknown, 'representationsById').materialCatalog.slots[0].sourceSemantics.future = true;
    record(unknown, 'materialOverridesById').routing.scope.future = true; record(unknown, 'viewsById').camera.projection.future = true;
    const admitted = pass(unknown); expect(admitted).toMatchObject({ hasUnknownFields: true }); if (admitted.kind === 'valid-records') expect(admitted.records).toEqual(unknown);
  });
  it('rejects missing maps, all map-key/id mismatches and all malformed lifecycle variants', () => {
    for (const [map, prefix] of Object.entries(projectRecordMaps)) {
      const missing = fixture(); delete missing[map]; fail(missing);
      const bad = fixture(); Object.values(bad[map]).forEach(r => { (r as any).id = id(prefix, 9); });
      expect(fail(bad)).toMatchObject({ issue: { code: 'identity', path: [map, expect.any(String), 'id'] } });
      if (!['rev', 'bnd', 'rep', 'med'].includes(prefix)) {
        const tombstone = fixture(); Object.values(tombstone[map]).forEach(r => { (r as any).lifecycle = { state: 'deleted', eventId: id('evt') }; }); fail(tombstone);
        Object.values(tombstone[map]).forEach(r => { (r as any).lifecycle.reason = 'userDelete'; }); pass(tombstone);
      } else { const immutable = fixture(); Object.values(immutable[map]).forEach(r => { (r as any).lifecycle = lifecycle(); }); fail(immutable); }
    }
  });
  it('keeps missing graph references, unverified declarations and unknown profiles distinct from structural validity', () => {
    const input = fixture(); input.project.defaultSceneId = id('scn', 99);
    record(input, 'assetsById').status.activeBindingId = id('bnd', 99);
    record(input, 'representationsById').formatProfile.id = 'unverified-profile'; record(input, 'representationsById').payloadDigest = 'f'.repeat(64);
    const result = pass(input); expect(Object.keys(result).sort()).toEqual(['entityCount', 'hasUnknownFields', 'kind', 'records']);
    // Stage B must reject/unresolve these; stage A never advertises a SceneResources or durable-success field.
    for (const mediaKind of ['image', 'video', 'audio', 'document']) { const doc = fixture(); record(doc, 'mediaResourcesById').mediaKind = mediaKind; pass(doc); }
  });
  it('enforces global budgets, canonical text and field-specific semantic ceilings without invoking input getters', () => {
    const getter = fixture(); let read = false; Object.defineProperty(getter, 'project', { enumerable: true, get() { read = true; throw new Error('getter'); } }); fail(getter); expect(read).toBe(false);
    const dangerous = fixture(); Object.defineProperty(dangerous.project, '__proto__', { enumerable: true, value: {} }); fail(dangerous);
    const cycle = fixture(); cycle.future = cycle; fail(cycle);
    expect(admitProjectRecords(fixture(), { ...limits, maxNodes: 5 }).kind).toBe('rejected');
    for (const n of [NaN, Infinity, -1]) expect(admitProjectRecords(fixture(), { ...limits, maxDepth: n }).kind).toBe('rejected');
    const deep = fixture(); let next = deep; for (let i = 0; i < 33; i++) next = next.future = {};
    expect(admitProjectRecords(deep, { ...limits, maxDepth: 100 }).kind).toBe('rejected');
    for (const [table, field, limit] of [['captionsById', 'title', 512], ['captionsById', 'body', 65536], ['captionAttachmentsById', 'altText', 4096], ['captionTagsById', 'label', 256]] as const) {
      const doc = fixture(); record(doc, table)[field] = 'あ'.repeat(limit); pass(doc); record(doc, table)[field] += 'あ'; fail(doc);
    }
    for (const text of ['e\u0301', '\u0000', '\ud800']) { const doc = fixture(); record(doc, 'captionsById').title = text; fail(doc); }
    const attachments = fixture(), source = record(attachments, 'captionAttachmentsById');
    attachments.captionAttachmentsById = Object.fromEntries(Array.from({ length: 4097 }, (_, i) => [id('att', i + 1), { ...source, id: id('att', i + 1) }])); fail(attachments);
  });
  it('validates complete status/transform/frame unions without silently inventing ready content or normalizing persisted quaternions', () => {
    const doc = fixture(), asset = record(doc, 'assetsById'), binding = record(doc, 'assetBindingsById');
    asset.status = { kind: 'unresolved', reason: 'missingSource', expectedLabel: '未読込', pendingAssetToProject: binding.assetToProject }; pass(doc);
    asset.status.activeBindingId = id('bnd'); fail(doc); delete asset.status.activeBindingId;
    doc.project.frame.unit = { kind: 'custom', metersPerProjectUnit: 0.01 }; pass(doc); doc.project.frame.unit.metersPerProjectUnit = 0; fail(doc);
    for (const value of [{ rotationXYZW: [0, 0, 0, -1] }, { rotationXYZW: [0, 0, 0, 2] }, { uniformScale: 0 }, { uniformScale: -1 }, { reflection: 'x' }, { translation: [0, Infinity, 0] }]) {
      const doc = fixture(); Object.assign(record(doc, 'assetBindingsById').assetToProject, value); fail(doc);
    }
    const reflected = fixture(); record(reflected, 'representationsById').representationToAsset.reflection = 'x'; pass(reflected);
  });
  it('validates camera/background and full manual/nonmanual anchor structure without decoding weak sources', () => {
    for (const method of ['mesh', 'point-cloud', 'direct-splat', 'gpu-id-depth', 'proxy']) {
      const doc = fixture(), anchor = record(doc, 'captionsById').anchor;
      anchor.normalAsset = [0, 1, 0]; anchor.hitEvidence = { method, confidence: 0.5, source: { representationId: id('rep'), surfaceRef:
        method === 'point-cloud' ? { kind: 'pointSample', nodeIndex: 0, primitiveIndex: 0, pointIndex: 0 } : ['direct-splat', 'gpu-id-depth'].includes(method)
          ? { kind: 'splatSample', sourceSplatIndex: 0 } : { kind: 'meshTriangle', nodeIndex: 0, primitiveIndex: 0, triangleIndex: 0, barycentric: [0.2, 0.3, 0.5] } } };
      pass(doc); delete anchor.authoredAssetRevisionId; fail(doc);
    }
    const project = fixture(); record(project, 'captionsById').anchor = { kind: 'project', projectFrameId: id('frm'), positionProject: [0, 0, 0], normalProject: [0, 1, 0] }; pass(project);
    record(project, 'captionsById').anchor.assetId = id('ast'); fail(project);
    for (const patch of [{ normalAsset: [0, 1, 0] }, { hitEvidence: { method: 'manual', confidence: 0.1 } }, { hitEvidence: { method: 'manual', source: { representationId: id('rep') } } }]) {
      const doc = fixture(); Object.assign(record(doc, 'captionsById').anchor, patch); fail(doc);
    }
    const view = fixture(), v = record(view, 'viewsById'); v.background = { kind: 'transparent' }; v.camera.projection = { kind: 'orthographic', verticalSpan: 10 }; pass(view);
    v.background.colorSrgb = [1, 1, 1]; fail(view); delete v.background.colorSrgb; v.camera.projection.verticalFovRadians = 1; fail(view);
    for (const patch of [{ target: [0, 0, 10] }, { up: [0, 0, 1] }, { up: [0, 2, 0] }, { projection: { kind: 'perspective', verticalFovRadians: Math.PI } }]) {
      const doc = fixture(); Object.assign(record(doc, 'viewsById').camera, patch); fail(doc);
    }
    const wide = fixture(), camera = record(wide, 'viewsById').camera;
    Object.assign(camera, { position: [1e308, 0, 0], target: [-1e308, 0, 0], up: [0, 1, 0] }); pass(wide);
    camera.up = [1, 0, 0]; fail(wide); camera.target[1] = Number.MIN_VALUE; pass(wide);
    Object.assign(camera, { position: [0, 0, 0], target: [1e308, Number.MIN_VALUE, 0], up: [1, 0, 0] }); pass(wide);
    camera.target = [0, Number.MIN_VALUE, 0]; camera.up = [0, 1, 0]; fail(wide);
  });
  it('validates every representation role, catalog/locator and derivation declaration without certifying profile semantics', () => {
    for (const [role, contentKind] of Object.entries({ meshPrimary: 'mesh', pointPrimary: 'pointCloud', gsPrimary: 'gaussianSplat', visualPatch: 'mesh', interactionProxy: 'mesh', splatExclusion: 'splatMask' })) {
      const doc = fixture(), r = record(doc, 'representationsById'); r.role = role; r.contentKind = contentKind;
      if (role === 'interactionProxy') { r.purposes = ['interaction']; r.proxyForGsVariantFamilyId = id('fam', 2); }
      if (role === 'splatExclusion') { r.targetGsVariantFamilyIds = [id('fam', 2)]; r.compositeGroupId = id('grp'); }
      pass(doc); r.contentKind = 'wrong'; fail(doc);
    }
    const doc = fixture(), rep = record(doc, 'representationsById');
    rep.derivedFrom = [id('rep', 2)]; rep.derivation = { kind: 'formatConversion', tool: { id: 'loci-converter', version: '1.0' }, parameterDigest: '0'.repeat(64), inputBlobDigests: ['0'.repeat(64)] }; pass(doc);
    rep.derivedFrom.push(id('rep', 2)); fail(doc); rep.derivedFrom.pop(); rep.purposes = ['display', 'source']; fail(doc);
    for (const patch of [{ targetGsVariantFamilyIds: [id('fam', 2)] }, { proxyForGsVariantFamilyId: id('fam', 2) }, { compositeGroupId: id('grp') }, { derivedFrom: ['bad'] }, { logicalBoundsAsset: { min: [1, 0, 0], max: [0, 0, 0] } }]) {
      const doc = fixture(); Object.assign(record(doc, 'representationsById'), patch); fail(doc);
    }
    for (const locator of [{ kind: 'gltfMaterial', materialIndex: 0 }, { kind: 'derivedMaterial', slotIndex: 1 }]) { const doc = fixture(); record(doc, 'representationsById').materialCatalog.slots[0].sourceLocator = locator; pass(doc); }
    const bad = fixture(), slot = record(bad, 'representationsById').materialCatalog.slots[0]; slot.sourceSemantics.coverage.alphaCutoff = 0.5; fail(bad);
    delete slot.sourceSemantics.coverage.alphaCutoff; record(bad, 'representationsById').materialCatalog.slots.push({ ...slot, logicalMaterialSlotId: id('slot', 2) }); fail(bad);
    const rev = fixture(); record(rev, 'assetRevisionsById').anchorCompatibilityClasses.push({ id: id('cmp'), targetVariantFamilyIds: [id('fam', 2)] }); fail(rev);
  });
});
