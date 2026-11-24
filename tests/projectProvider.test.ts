import { describe, expect, it } from 'vitest';
import { assetCopySource, prepareAssetMembershipCopy } from '../src/projectMetadata/modelMembership';
import { planMetadataEdit, scenePlacementChoices } from '../src/projectMetadata/commands';
import { readProjectScene, projectCaptionText } from '../src/scene/projectProvider';
import { inspectProjectCandidates } from '../src/domain/projectCandidates';
import { resolveScene, chooseStartupScene } from '../src/scene/resolve';
import { immutableDigest } from '../src/domain/projectGraphSupport';
import { inspectProjectContent } from '../src/domain/projectContent';
import { developmentContentBytes, developmentContentVerifier } from '../poc/scene-history/content-verifier';
import { createFixtureModel } from '../src/harness/projectScene/modelClosure';
import { fixture, id, limits as valueLimits, lifecycle } from './helpers/projectRecordsFixture';
import { candidateFixture, candidateWrite as w, withCandidateChanges } from './helpers/projectCandidateFixture';
import type { ProjectCandidateInput } from '../src/domain/projectCandidates';
import { projectAssetMembership, projectCaptionInventory, projectCaptions, projectCaptionSceneCount, projectMediaUncertain } from '../src/ui/projectScene/projectRead';
const limits = { ...valueLimits, maxWork: 1_000_000 };
const verifier = (r = fixture(), bytes = developmentContentBytes) => developmentContentVerifier(Object.values(r.representationsById).map((rep: any) =>
  ({ variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest })), bytes);
const read = async (r = fixture(), source = candidateFixture(r), port = verifier(r)) => {
  const result = await readProjectScene(source, limits, port); expect(result.kind, result.kind === 'rejected' ? JSON.stringify(result.issue) : result.kind).toBe('scene-provider');
  if (result.kind !== 'scene-provider') throw Error(JSON.stringify(result)); return result;
};
const scene = (p: Awaited<ReturnType<typeof read>>) => { const r = resolveScene(p.state, p.resources, id('scn'));
  if (r.kind !== 'ready') throw Error(); return r.composition; };
const conflicts = (source: ProjectCandidateInput, path: string[], a: any, b: any) => withCandidateChanges(source, [
  { id: 'a', deps: ['root'], writes: [w('a-op', path, a)] }, { id: 'b', deps: ['root'], writes: [w('b-op', path, b)] },
]);
const addModel = (r: Record<string, any>) => {
  const m = createFixtureModel({ asset: id('ast', 2), assetFrame: id('frm', 20), representationFrame: id('frm', 21), binding: id('bnd', 2), revision: id('rev', 2),
    representation: id('rep', 2), family: id('fam', 2), compatibility: id('cmp', 2), layout: id('lay', 2), slot: id('slot', 2) }, 'original',
  { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });
  r.assetsById[id('ast', 2)] = { ...r.assetsById[id('ast')], id: id('ast', 2), assetFrameId: m.assetFrame.id, status: { kind: 'ready', activeBindingId: m.binding.id } };
  for (const [map, item] of [['representationsById', m.representation], ['assetRevisionsById', m.revision], ['assetBindingsById', m.binding]] as const) r[map][item.id] = item;
  r.sceneAssetMembershipsById[id('sam', 2)] = { ...r.sceneAssetMembershipsById[id('sam')], id: id('sam', 2), assetId: m.binding.assetId };
};

describe('scope-labelled same-token Scene provider; not current-app/source-adapter/device acceptance', () => {
  it('projects the complete known fixture without mutating source, with attachment/tag/media details and one scope/token', async () => {
    const r = fixture();
    r.scenesById[id('scn', 2)] = { id: id('scn', 2), name: '別のシーン', orderKey: 'B', lifecycle: lifecycle() };
    r.sceneAssetMembershipsById[id('sam', 2)] = { ...r.sceneAssetMembershipsById[id('sam')], id: id('sam', 2), sceneId: id('scn', 2) };
    r.sceneCaptionMembershipsById[id('scm', 2)] = { ...r.sceneCaptionMembershipsById[id('scm')], id: id('scm', 2), sceneId: id('scn', 2) };
    const source = candidateFixture(r), before = structuredClone(source), result = await read(r, source), c = scene(result);
    expect(result.scope).toBe('development-fixture'); expect(result.state.token).toBe(result.token); expect(result.resources.token).toBe(result.token);
    expect(c.assets).toHaveLength(1); expect(c.captions[0]!.marker).toBe('visible'); expect(c.materials).toHaveLength(1); expect(c.entryView?.viewId).toBe(id('view'));
    const second = resolveScene(result.state, result.resources, id('scn', 2));
    expect(second.kind).toBe('ready'); if (second.kind === 'ready') { expect(second.composition.captions[0]!.captionId).toBe(c.captions[0]!.captionId); expect(second.composition.entryView).toBeUndefined(); }
    expect(result.details.attachments[id('att')]).toMatchObject({ kind: 'value', value: { captionId: id('cap'), mediaResourceId: id('med') } });
    expect(result.details.tags[id('tag')]!.kind).toBe('value'); expect(result.details.tagMemberships[id('tgm')]!.kind).toBe('value');
    expect(result.inspection.candidates.source).toEqual(before); expect(source).toEqual(before); expect(Object.isFrozen(result.resources.assets)).toBe(true);
    expect(result.pending).toEqual(['same-host-source-adapter-and-integration']);
    expect(() => resolveScene(result.state, { ...result.resources, token: 'stale' }, id('scn'))).toThrow();
  });
  it('blocks only invalid global identity/frame, without choosing a default or title winner', async () => {
    for (const path of [['identity'], ['project', 'frame']]) {
      const source = conflicts(candidateFixture(), path, null, null);
      expect((await readProjectScene(source, limits, verifier())).kind).toBe('blocked-project');
    }
    const defaultConflict = await read(fixture(), conflicts(candidateFixture(), ['project', 'defaultSceneId'], id('scn'), id('scn')));
    expect(chooseStartupScene(defaultConflict.state).sceneId).toBeUndefined(); expect(chooseStartupScene(defaultConflict.state, id('scn')).sceneId).toBe(id('scn'));
    expect(scene(defaultConflict).assets).toHaveLength(1);
    const titleConflict = await read(fixture(), conflicts(candidateFixture(), ['project', 'title'], 'a', 'b'));
    expect(scene(titleConflict).assets).toHaveLength(1);
  });
  it('propagates missing content only through the affected model closure, preserving other models and Caption text', async () => {
    const r = fixture(); addModel(r);
    const p = await read(r, candidateFixture(r), verifier(r, async item => item.id === id('rep') ? undefined : developmentContentBytes(item)));
    expect(scene(p).assets.map(a => a.assetId)).toEqual([id('ast', 2)]);
    expect(scene(p).captions[0]).toMatchObject({ title: { kind: 'value', value: '記録' }, marker: 'suppressed' });
    expect(p.resources.assets[id('ast')]!.lifecycle.kind).toBe('value'); expect(p.resources.assets[id('ast')]!.projection.kind).toBe('unresolved');
    expect(projectCaptions(p, id('scn'), [id('ast')])[0]!.pin).not.toBe('ownerHidden');
    expect(p.details.attachments[id('att')]!.kind).toBe('value');
  });
  it('does not propagate Caption/attachment/material failures backward into model availability', async () => {
    const r = fixture(), source = candidateFixture(r);
    const withTitle = conflicts(source, ['captionsById', id('cap'), 'title'], 'one', 'two');
    const p = await read(r, withTitle, verifier(r, async item => item.id === id('med') ? undefined : developmentContentBytes(item)));
    expect(scene(p).assets).toHaveLength(1); expect(scene(p).captions[0]!.title.kind).toBe('unresolved'); expect(scene(p).captions[0]!.marker).toBe('visible');
    expect(p.details.attachments[id('att')]!.kind).toBe('unresolved'); expect(p.resources.captions[id('cap')]!.body.kind).toBe('value');
  });
  it('reveals only a known hidden or absent model owner, keeping projection and membership conflicts reviewable', async () => {
    const r = fixture(), source = candidateFixture(r);
    expect(projectCaptions(await read(r, source), id('scn'), [id('ast')])[0]!.pin).toBe('ownerHidden');
    const absent = fixture(); delete absent.sceneAssetMembershipsById[id('sam')];
    expect(projectCaptions(await read(absent), id('scn'))[0]!.pin).toBe('ownerHidden');
    for (const [path, value] of [
      [['assetsById', id('ast'), 'status'], r.assetsById[id('ast')].status],
      [['sceneAssetMembershipsById', id('sam'), 'assetId'], id('ast')],
    ] as const) expect(projectCaptions(await read(r, conflicts(source, [...path], value, value)), id('scn'), [id('ast')])[0]!.pin).not.toBe('ownerHidden');
  });
  it('proves an outside model only after checking for unresolved or duplicate membership rows', async () => {
    const r = fixture(), membership = (p: Awaited<ReturnType<typeof read>>) => projectAssetMembership(p, id('scn'), id('ast'));
    const raw = candidateFixture(r), edge = r.sceneAssetMembershipsById[id('sam')];
    expect(membership(await read(r, conflicts(raw, ['sceneAssetMembershipsById', id('sam'), 'assetId'], id('ast'), id('ast')))).kind).toBe('unresolved');
    r.sceneAssetMembershipsById[id('sam',2)] = { ...edge, id: id('sam',2) };
    expect(membership(await read(r)).kind).toBe('unresolved');
    delete r.sceneAssetMembershipsById[id('sam')]; delete r.sceneAssetMembershipsById[id('sam',2)];
    expect(membership(await read(r))).toEqual({ kind: 'value', value: { kind: 'absent' } });
  });
  it('retains equal mutable candidates and optional absence without selecting or inventing a value', async () => {
    const r = fixture(); delete r.captionsById[id('cap')].colorSrgb; delete r.scenesById[id('scn')].defaultViewId;
    const p = await read(r, conflicts(candidateFixture(r), ['captionsById', id('cap'), 'body'], 'same', 'same'));
    expect(p.resources.captions[id('cap')]!.body.kind).toBe('unresolved');
    expect(p.details.mutable.captionsById[id('cap')]!.colorSrgb).toEqual({ kind: 'value', value: undefined });
    expect(p.state.scenes[id('scn')]!.defaultViewId).toEqual({ kind: 'value', value: null });
    expect(projectCaptions(p, id('scn'))[0]!.color).toEqual({ kind: 'value', value: '#a08045' });
  });
  it('keeps unresolved product attachment counts and anchor owners visibly unknown', async () => {
    const r = fixture(), source = candidateFixture(r);
    const anchor = conflicts(source, ['captionsById', id('cap'), 'anchor'], r.captionsById[id('cap')].anchor, { kind: 'unplaced' });
    const p = await read(r, anchor, verifier(r, async item => item.id === id('med') ? undefined : developmentContentBytes(item)));
    const caption = projectCaptions(p, id('scn'))[0]!;
    expect(caption.owner.kind).toBe('unresolved'); expect(caption.mediaCount.kind).toBe('unresolved');
    expect(projectMediaUncertain(p, id('cap'))).toBe(true);
    const known = await read(); expect(projectCaptions(known, id('scn'))[0]!.mediaCount).toEqual({ kind: 'value', value: 1 });
  });
  it('does not undercount shared Scene impact when product membership relations are unresolved or duplicated', async () => {
    const r = fixture(); r.scenesById[id('scn', 2)] = { ...r.scenesById[id('scn')], id: id('scn', 2), name: '共有先', orderKey: 'B' };
    r.sceneCaptionMembershipsById[id('scm', 2)] = { ...r.sceneCaptionMembershipsById[id('scm')], id: id('scm', 2), sceneId: id('scn', 2) };
    expect(projectCaptionSceneCount(await read(r), id('cap'))).toEqual({ kind: 'value', value: 2 });
    for (const [field, a, b] of [['lifecycle', lifecycle(), { state: 'deleted', eventId: id('evt', 9), reason: 'userDelete' }], ['captionId', id('cap'), id('cap', 2)]] as const) {
      const p = await read(r, conflicts(candidateFixture(r), ['sceneCaptionMembershipsById', id('scm', 2), field], a, b));
      expect(projectCaptionSceneCount(p, id('cap')).kind).toBe('unresolved');
    }
    r.sceneCaptionMembershipsById[id('scm', 2)].sceneId = id('scn');
    expect(projectCaptionSceneCount(await read(r), id('cap')).kind).toBe('unresolved');
  });
  it('preserves valid old-class pins as needsReview and weak absent source as non-dereferenceable provenance', async () => {
    const r = fixture(); r.captionsById[id('cap')].anchor.authoredAssetRevisionId = id('rev', 99); r.captionsById[id('cap')].anchor.authoredAnchorCompatibilityId = id('cmp', 99);
    const p = await read(r); expect(scene(p).captions[0]!.marker).toBe('needsReview'); expect(p.resources.captions[id('cap')]!.anchor.kind).toBe('value');
    r.captionsById[id('cap')].anchor.assetFrameId = id('frm', 90);
    expect(scene(await read(r)).captions[0]!.marker).toBe('suppressed');
  });
  it('excludes malformed class partition/model closure instead of relabelling it as ordinary anchor review', async () => {
    const r = fixture(), revision = r.assetRevisionsById[id('rev')]; revision.anchorCompatibilityClasses = [];
    revision.payloadDigest = await immutableDigest('asset-revision', revision);
    const p = await read(r); expect(scene(p).assets).toEqual([]); expect(scene(p).captions[0]!.marker).toBe('suppressed');
    expect(p.inspection.issues.some(i => i.code === 'invalid-class-partition')).toBe(true);
  });
  it('applies reservations even when a competing membership has invalid/unresolved primitive endpoints', async () => {
    const r = fixture(); r.sceneAssetMembershipsById[id('sam', 2)] = { ...r.sceneAssetMembershipsById[id('sam')], id: id('sam', 2) };
    const source = conflicts(candidateFixture(r), ['sceneAssetMembershipsById', id('sam', 2), 'assetId'], id('ast'), null);
    const p = await read(r, source); expect(scene(p).assets).toEqual([]);
    expect(p.inspection.candidates.fields.find(f => f.path[1] === id('sam', 2) && f.path[2] === 'assetId')!.candidates).toHaveLength(2);
    expect(p.resources.assets[id('ast')]!.projection.kind).toBe('value');
  });
  it('blocks both exact Scene material keys behind routing conflict and retains whole Project fallback', async () => {
    const r = fixture(), material = r.materialOverridesById[id('ovr')];
    r.materialOverridesById[id('ovr', 2)] = { ...structuredClone(material), id: id('ovr', 2) };
    r.materialOverridesById[id('ovr', 3)] = { ...structuredClone(material), id: id('ovr', 3), routing: { ...structuredClone(material.routing), scope: { kind: 'project' } } };
    const source = conflicts(candidateFixture(r), ['materialOverridesById', id('ovr', 2), 'routing'], material.routing, { ...material.routing, target: { ...material.routing.target, logicalMaterialSlotId: id('slot', 99) } });
    const p = await read(r, source);
    expect(scene(p).materials.map(m => m.overrideId)).toEqual([id('ovr', 3)]); expect(scene(p).assets).toHaveLength(1);
  });
  it('keeps view camera/background independent and never replaces free camera on default conflict', async () => {
    const r = fixture(), camera = r.viewsById[id('view')].camera;
    const p = await read(r, conflicts(candidateFixture(r), ['viewsById', id('view'), 'camera'], camera, { ...camera, position: [2, 3, 4] }));
    expect(scene(p).entryView?.camera.kind).toBe('unresolved'); expect(scene(p).entryView?.background.kind).toBe('value');
    const defaultConflict = await read(r, conflicts(candidateFixture(r), ['scenesById', id('scn'), 'defaultViewId'], id('view'), undefined));
    expect(scene(defaultConflict).entryView).toBeUndefined(); expect(scene(defaultConflict).assets).toHaveLength(1);
  });
  it('neutralizes alt text separately; endpoint/order and tag-label conflicts affect only their detail items', async () => {
    const r = fixture();
    const alt = await read(r, conflicts(candidateFixture(r), ['captionAttachmentsById', id('att'), 'altText'], 'a', 'b'));
    expect(alt.details.attachments[id('att')]!.kind).toBe('value'); expect(alt.details.mutable.captionAttachmentsById[id('att')]!.altText!.kind).toBe('unresolved');
    const order = await read(r, conflicts(candidateFixture(r), ['captionAttachmentsById', id('att'), 'orderKey'], 'A', 'B'));
    expect(order.details.attachments[id('att')]!.kind).toBe('unresolved'); expect(scene(order).captions[0]!.body.kind).toBe('value');
    const tag = await read(r, conflicts(candidateFixture(r), ['captionTagsById', id('tag'), 'label'], 'a', 'b'));
    expect(tag.details.tags[id('tag')]!.kind).toBe('unresolved'); expect(tag.details.tagMemberships[id('tgm')]!.kind).toBe('unresolved'); expect(scene(tag).assets).toHaveLength(1);
  });
  it('retains opaque minor values without turning a known-field projection into a clean-copy/write DTO', async () => {
    const r = fixture(); r.captionsById[id('cap')].future = { retained: 0.5 }; r.futureRoot = { value: 'keep' };
    const p = await read(r); expect(p.inspection.candidates.hasUnknownFields).toBe(true); expect(scene(p).captions[0]!.marker).toBe('visible');
    expect(p.inspection.candidates.source).toEqual(candidateFixture(r)); expect(p).not.toHaveProperty('canExport');
  });
  it('requires source transmission parameters for every requested transmission candidate without suppressing models or lower-scope fallback', async () => {
    const r = fixture(), material = r.materialOverridesById[id('ovr')];
    r.materialOverridesById[id('ovr', 2)] = { ...structuredClone(material), id: id('ovr', 2), routing: { ...structuredClone(material.routing), scope: { kind: 'project' } } };
    material.compositing.optics = 'transmission';
    const p = await read(r); expect(p.resources.materials[id('ovr')]!.intent).toEqual({ kind: 'unresolved', reason: 'invalid' });
    expect(p.issues).toContainEqual(expect.objectContaining({ code: 'transmission-source-parameters-required' }));
    expect(scene(p).assets).toHaveLength(1); expect(scene(p).materials.map(m => m.overrideId)).toEqual([id('ovr', 2)]);
    const conflict = await read(r, conflicts(candidateFixture(r), ['materialOverridesById', id('ovr'), 'compositing'], material.compositing, { ...material.compositing, optics: 'surface' }));
    expect(conflict.issues.filter(i => i.code === 'transmission-source-parameters-required')).toHaveLength(1);
    expect(conflict.inspection.candidates.fields.find(f => f.path[1] === id('ovr') && f.path[2] === 'compositing')!.candidates).toHaveLength(2);
  });
  it('enforces a shared execution budget rather than accepting an already-cast provider/receipt', async () => {
    const source = candidateFixture(), content = await inspectProjectContent(source, limits, verifier()); if (content.kind === 'rejected') throw Error();
    expect(await readProjectScene(source, { ...limits, maxWork: content.workUsed + 1 }, verifier())).toMatchObject({ kind: 'rejected', issue: { path: ['projectionWork'] } });
    expect((await readProjectScene(content, limits, verifier())).kind).toBe('rejected');
  });
});

describe('06g input-verified text without a Scene provider or resource authority', () => {
  const text = async (source = candidateFixture()) => {
    const inspected = await inspectProjectCandidates(source, limits);
    if (inspected.kind !== 'project-candidate-inspection') throw Error(JSON.stringify(inspected));
    return projectCaptionText(inspected, inspected.workUsed, limits);
  };
  const two = () => {
    const r = fixture();
    r.captionsById[id('cap', 2)] = { ...r.captionsById[id('cap')], id: id('cap', 2), title: 'second', body: 'second body' };
    r.sceneCaptionMembershipsById[id('scm', 2)] = { ...r.sceneCaptionMembershipsById[id('scm')], id: id('scm', 2), captionId: id('cap', 2), orderKey: 'B' };
    return r;
  };
  it('matches canonical membership/order/text without inspecting models or inventing a token', async () => {
    const r = two(), input = candidateFixture(r), before = structuredClone(input), actual = await text(input), normal = scene(await read(r, input));
    expect(actual?.records).toEqual(normal.captions.map(c => ({ id: c.captionId,
      title: c.title.kind === 'value' ? c.title.value : undefined, body: c.body.kind === 'value' ? c.body.value : undefined })));
    expect(actual).not.toHaveProperty('token'); expect(actual).not.toHaveProperty('resources'); expect(input).toEqual(before);
  });
  it('has no startup fallback and does not pick equal mutable conflict winners', async () => {
    const r = fixture(), source = candidateFixture(r);
    for (const [path, a, b] of [
      [['project', 'defaultSceneId'], id('scn'), id('scn')],
      [['captionsById', id('cap'), 'body'], 'same', 'same'],
      [['scenesById', id('scn'), 'lifecycle'], lifecycle(), lifecycle()],
    ] as const) expect(await text(conflicts(source, [...path], a, b))).toBeNull();
    const deleted = fixture(); deleted.scenesById[id('scn')].lifecycle = { state: 'deleted', eventId: id('evt', 2), reason: 'userDelete' };
    expect(await text(candidateFixture(deleted))).toBeNull();
  });
  it('keeps uncertain/duplicate membership reservations and omits unresolved bodies', async () => {
    for (const key of ['lifecycle', 'orderKey'] as const) {
      const r = two(); r.sceneCaptionMembershipsById[id('scm', 3)] = { ...r.sceneCaptionMembershipsById[id('scm')], id: id('scm', 3) };
      const source = conflicts(candidateFixture(r), ['sceneCaptionMembershipsById', id('scm', 3), key],
        r.sceneCaptionMembershipsById[id('scm', 3)][key], r.sceneCaptionMembershipsById[id('scm', 3)][key]);
      const actual = await text(source); expect(actual?.records.map(c => c.id)).toEqual([id('cap', 2)]); expect(actual?.incomplete).toBe(true);
    }
    const r = two(), actual = await text(conflicts(candidateFixture(r), ['captionsById', id('cap'), 'title'], 'a', 'b'));
    expect(actual?.records.map(c => c.id)).toEqual([id('cap', 2)]); expect(actual?.incomplete).toBe(true);
  });
  it('charges optional text projection within the existing budget', async () => {
    const inspected = await inspectProjectCandidates(candidateFixture(), limits);
    if (inspected.kind !== 'project-candidate-inspection') throw Error();
    expect(() => projectCaptionText(inspected, inspected.workUsed, { maxWork: inspected.workUsed })).toThrow();
  });
});

describe('scene-local model and pin adjustments', () => {
  const editLimits = { ...limits, maxChanges: 1000, maxChangeBytes: 4_000_000, maxTotalBytes: 16_000_000, maxOperations: 100_000 };
  const selected = (p: Awaited<ReturnType<typeof read>>, n: number) => {
    const result = resolveScene(p.state, p.resources, id('scn', n));
    if (result.kind !== 'ready') throw Error('Scene unavailable');
    return result.composition;
  };
  const shared = () => {
    const r = fixture();
    r.scenesById[id('scn', 2)] = { ...r.scenesById[id('scn')], id: id('scn', 2), orderKey: 'B' };
    delete r.scenesById[id('scn', 2)].defaultViewId;
    for (const [map, prefix] of [['sceneAssetMembershipsById', 'sam'], ['sceneCaptionMembershipsById', 'scm']] as const)
      r[map][id(prefix, 2)] = { ...r[map][id(prefix)], id: id(prefix, 2), sceneId: id('scn', 2) };
    return r;
  };
  const source = (r: ReturnType<typeof fixture>): ProjectCandidateInput => ({ ...candidateFixture(r), schema: {major:2,minor:1}, semanticProfile: 'map2' });
  const local = async (r: ReturnType<typeof fixture>) => {
    const m = createFixtureModel({ asset: id('ast'), assetFrame: id('frm', 2), representationFrame: id('frm', 21), binding: id('bnd', 2),
      revision: id('rev', 2), representation: id('rep', 2), family: id('fam', 2), compatibility: id('cmp', 2), layout: id('lay', 2), slot: id('slot', 2) },
      'original', { translation: [2, 3, 4], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });
    for (const [map, item] of [['representationsById', m.representation], ['assetRevisionsById', m.revision], ['assetBindingsById', m.binding]] as const)
      r[map][item.id] = item;
    r.sceneAssetMembershipsById[id('sam')].bindingId = m.binding.id;
    return read(r, source(r));
  };
  it('describes the effective pin in the record picker for each scene and leaves conflicts unknown', async () => {
    const r = shared(), raw = r.captionsById[id('cap')].anchor;
    const pick = (p: Awaited<ReturnType<typeof read>>, n: number) => {
      const inventory = projectCaptionInventory(p, id('scn', n));
      if (inventory.kind !== 'ready') throw Error('Missing record inventory');
      return inventory.items.find(item => item.caption.id === id('cap'))!.caption;
    };
    const path = ['sceneCaptionMembershipsById', id('scm'), 'anchor'];
    r.sceneCaptionMembershipsById[id('scm')].anchor = { kind: 'unplaced' };
    const p = await read(r, source(r));
    expect(pick(p, 1)).toMatchObject({ pin: 'unplaced', owner: { kind: 'value', value: { kind: 'none' } } });
    expect(pick(p, 2).owner).toMatchObject({ kind: 'value', value: { kind: 'asset', assetId: id('ast') } });
    const conflict = await read(r, conflicts(source(r), path, raw, { kind: 'unplaced' }));
    expect(pick(conflict, 1).owner.kind).toBe('unresolved');
    expect(pick(conflict, 2).owner.kind).toBe('value');
  });
  it('retains old bindings and material slots in B, flags only A, and moves only A’s shared pin', async () => {
    const r = shared();
    r.materialOverridesById[id('ovr')].routing.scope = { kind: 'project' };
    const p = await local(r);
    expect(selected(p, 1).assets[0]?.projection.bindingId).toBe(id('bnd', 2));
    expect(selected(p, 1).captions[0]?.marker).toBe('needsReview');
    expect(selected(p, 1).materials).toHaveLength(0);
    expect(selected(p, 2).assets[0]?.projection.bindingId).toBe(id('bnd'));
    expect(selected(p, 2).captions[0]?.marker).toBe('visible');
    expect(selected(p, 2).materials.map(m => m.overrideId)).toEqual([id('ovr')]);
    expect(p.inspection.candidates.knownReferences).toContainEqual({from:id('sam'), to:id('bnd', 2), field:'bindingId', strength:'strong'});
    const anchor = { ...r.captionsById[id('cap')].anchor, authoredAssetRevisionId: id('rev', 2), authoredAnchorCompatibilityId: id('cmp', 2), positionAsset: [1, 2, 3] };
    const writes = planMetadataEdit(p, { kind: 'movePin', sceneId: id('scn'), captionId: id('cap'), scope: 'scene', anchor }, editLimits);
    expect(writes).toEqual([{ map:'sceneCaptionMembershipsById', id:id('scm'), fields:{ anchor }, create:false }]);
    r.sceneCaptionMembershipsById[id('scm')].anchor = anchor;
    const after = await read(r, source(r));
    expect(selected(after, 1).captions[0]).toMatchObject({ marker: 'visible', anchor: { value: anchor } });
    expect(selected(after, 2).captions[0]).toMatchObject({ marker: 'visible', anchor: { value: r.captionsById[id('cap')].anchor } });
  });
  it('keeps unscoped historical commands and map1 behavior, refuses foreign bindings and unverified pin overrides', async () => {
    const r = shared(), p = await read(r, source(r));
    const old = r.assetBindingsById[id('bnd')];
    const binding = { ...old, id: id('bnd', 9), parentBindingId: old.id, method: 'manual', assetToProject:{...old.assetToProject,translation:[1,2,3]} };
    binding.payloadDigest = await immutableDigest('asset-binding-revision', binding);
    const command = { kind:'moveAsset' as const, sceneId:id('scn'), assetId:id('ast'), expectedBindingId:old.id, binding };
    expect(planMetadataEdit(p, command, editLimits).at(-1)).toMatchObject({map:'assetsById',fields:{status:{activeBindingId:binding.id}}});
    expect(planMetadataEdit(p, {...command, scope:'scene'}, editLimits).at(-1)).toMatchObject({map:'sceneAssetMembershipsById',id:id('sam'),fields:{bindingId:binding.id}});
    expect(() => planMetadataEdit(p, {...command,scope:'scene',expectedBindingId:id('bnd',7)}, editLimits)).toThrow();
    const legacy = await read(r);
    expect(() => planMetadataEdit(legacy, {...command,scope:'scene'}, editLimits)).toThrow();
    const otherScene = r.sceneAssetMembershipsById[id('sam',2)];
    addModel(r);
    r.sceneAssetMembershipsById[id('sam',3)] = { ...otherScene, id:id('sam',3) };
    r.sceneAssetMembershipsById[id('sam')].bindingId = id('bnd',2);
    r.sceneCaptionMembershipsById[id('scm')].anchor = {...r.captionsById[id('cap')].anchor,assetFrameId:id('frm',99)};
    const malformed = await read(r, source(r));
    expect(selected(malformed,1).assets.some(a=>a.assetId===id('ast'))).toBe(false);
    expect(selected(malformed,1).captions[0]?.marker).toBe('suppressed');
    expect(selected(malformed,2).captions[0]?.marker).toBe('visible');
    const oldProfile = await read(r);
    expect(selected(oldProfile,1).assets.some(a=>a.assetId===id('ast'))).toBe(true);
  });
  it('keeps the selected placement and pin separately when duplicate memberships are kept as independent records', async () => {
    const r = shared();
    const duplicateModel = id('sam', 9), duplicateCaption = id('scm', 9);
    r.sceneAssetMembershipsById[duplicateModel] = { ...r.sceneAssetMembershipsById[id('sam')], id: duplicateModel };
    r.sceneCaptionMembershipsById[duplicateCaption] = { ...r.sceneCaptionMembershipsById[id('scm')], id: duplicateCaption };
    const adjusted = { ...r.captionsById[id('cap')].anchor, positionAsset: [1,2,3] };
    r.sceneCaptionMembershipsById[id('scm')].anchor = adjusted;
    const p = await local(r);
    const source = assetCopySource(p, id('scn'), id('ast'), editLimits, id('sam'));
    expect(source.binding.id).toBe(id('bnd',2));
    expect(() => assetCopySource(p, id('scn',2), id('ast'), editLimits, id('sam'))).toThrow();
    let n = 90;
    const fresh = (prefix: string) => id(prefix, ++n), copy = await prepareAssetMembershipCopy(source, id('sam'), fresh);
    const writes = planMetadataEdit(p, { kind:'resolveAssetMembership', sceneId:id('scn'), assetId:id('ast'), observedMembershipIds:[id('sam'),duplicateModel],
      originalMembershipId:duplicateModel, choice:'both', eventId:fresh('evt'), copies:[copy] }, editLimits);
    expect(writes.find(w => w.map === 'assetBindingsById')?.fields).toMatchObject({assetToProject:source.binding.assetToProject});
    expect(writes.find(w => w.id === copy.ids.membership)?.fields).not.toHaveProperty('bindingId');
    const captionId=fresh('cap'), membershipId=fresh('scm');
    const duplicated = planMetadataEdit(p, { kind:'resolveCaptionMembership', sceneId:id('scn'), captionId:id('cap'), observedMembershipIds:[id('scm'),duplicateCaption],
      originalMembershipId:duplicateCaption, choice:'both', eventId:fresh('evt'), copies:[{sourceMembershipId:id('scm'),captionId,membershipId,
        attachments:[{sourceId:id('att'),targetId:fresh('att')}],tags:[{sourceId:id('tgm'),targetId:fresh('tgm')}]}] }, editLimits);
    expect(duplicated.find(w=>w.id===captionId)?.fields).toMatchObject({anchor:adjusted});
    expect(duplicated.find(w=>w.id===membershipId)?.fields).not.toHaveProperty('anchor');
  });
  it('refuses incompatible coordinates and resolves only the named pin in a duplicate registration', async () => {
    const r = shared(), initial=r.captionsById[id('cap')].anchor;
    const path=['sceneCaptionMembershipsById',id('scm'),'anchor'], adjusted={...initial,positionAsset:[1,2,3]};
    const a = await read(r,conflicts(source(r),path,initial,adjusted));
    const command={kind:'resolveScenePin' as const,sceneId:id('scn'),membershipId:id('scm'),operationId:'b-op'};
    expect(selected(a,1).captions[0]?.marker).toBe('suppressed'); expect(selected(a,2).captions[0]?.marker).toBe('visible');
    expect(planMetadataEdit(a,command,editLimits)).toEqual([{map:'sceneCaptionMembershipsById',id:id('scm'),create:false,fields:{anchor:adjusted}}]);
    const invalid=await read(r,conflicts(source(r),path,initial,{...adjusted,assetFrameId:id('frm',99)}));
    expect(()=>planMetadataEdit(invalid,command,editLimits)).toThrow();
    r.sceneCaptionMembershipsById[id('scm',3)]={...r.sceneCaptionMembershipsById[id('scm')],id:id('scm',3)};
    const dup=await read(r,conflicts(source(r),path,initial,adjusted));
    expect(planMetadataEdit(dup,command,editLimits)).toEqual([{map:'sceneCaptionMembershipsById',id:id('scm'),create:false,fields:{anchor:adjusted}}]);
    expect(selected(dup,1).captions).toHaveLength(0);
  });
  it('protects both competing bindings and presents only verified conflict choices', async () => {
    const r=shared(); await local(r);
    const path=['sceneAssetMembershipsById',id('sam'),'bindingId'];
    const p=await read(r, conflicts(source(r), path, id('bnd'), id('bnd',2)));
    expect(selected(p,1).assets).toHaveLength(0);
    expect(selected(p,2).assets[0]?.projection.bindingId).toBe(id('bnd'));
    expect(scenePlacementChoices(p,id('scn'),id('sam'),'bindingId',editLimits).map(c=>c.operationId).sort()).toEqual(['a-op','b-op']);
    const command={kind:'resolveScenePlacement' as const,sceneId:id('scn'),membershipId:id('sam'),operationId:'b-op'};
    expect(planMetadataEdit(p,command,editLimits)).toEqual([{map:'sceneAssetMembershipsById',id:id('sam'),fields:{bindingId:id('bnd',2)},create:false}]);
    expect(() => planMetadataEdit(p,{...command,sceneId:id('scn',2)},editLimits)).toThrow();
    expect(() => planMetadataEdit(p,{...command,operationId:'unobserved'},editLimits)).toThrow();
  });
});
