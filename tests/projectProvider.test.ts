import { describe, expect, it } from 'vitest';
import { readProjectScene } from '../src/scene/projectProvider';
import { resolveScene, chooseStartupScene } from '../src/scene/resolve';
import { immutableDigest } from '../src/domain/projectGraphSupport';
import { inspectProjectContent } from '../src/domain/projectContent';
import { developmentContentBytes, developmentContentVerifier } from '../poc/scene-history/content-verifier';
import { createFixtureModel } from '../src/harness/projectScene/modelClosure';
import { fixture, id, limits as valueLimits, lifecycle } from './helpers/projectRecordsFixture';
import { candidateFixture, candidateWrite as w, withCandidateChanges } from './helpers/projectCandidateFixture';
import type { ProjectCandidateInput } from '../src/domain/projectCandidates';
const limits = { ...valueLimits, maxWork: 1_000_000 };
const verifier = (r = fixture(), bytes = developmentContentBytes) => developmentContentVerifier(Object.values(r.representationsById).map((rep: any) =>
  ({ variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest })), bytes);
const read = async (r = fixture(), source = candidateFixture(r), port = verifier(r)) => {
  const result = await readProjectScene(source, limits, port); expect(result.kind).toBe('scene-provider');
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
    expect(p.details.attachments[id('att')]!.kind).toBe('value');
  });
  it('does not propagate Caption/attachment/material failures backward into model availability', async () => {
    const r = fixture(), source = candidateFixture(r);
    const withTitle = conflicts(source, ['captionsById', id('cap'), 'title'], 'one', 'two');
    const p = await read(r, withTitle, verifier(r, async item => item.id === id('med') ? undefined : developmentContentBytes(item)));
    expect(scene(p).assets).toHaveLength(1); expect(scene(p).captions[0]!.title.kind).toBe('unresolved'); expect(scene(p).captions[0]!.marker).toBe('visible');
    expect(p.details.attachments[id('att')]!.kind).toBe('unresolved'); expect(p.resources.captions[id('cap')]!.body.kind).toBe('value');
  });
  it('retains equal mutable candidates and optional absence without selecting or inventing a value', async () => {
    const r = fixture(); delete r.captionsById[id('cap')].colorSrgb; delete r.scenesById[id('scn')].defaultViewId;
    const p = await read(r, conflicts(candidateFixture(r), ['captionsById', id('cap'), 'body'], 'same', 'same'));
    expect(p.resources.captions[id('cap')]!.body.kind).toBe('unresolved');
    expect(p.details.mutable.captionsById[id('cap')]!.colorSrgb).toEqual({ kind: 'value', value: undefined });
    expect(p.state.scenes[id('scn')]!.defaultViewId).toEqual({ kind: 'value', value: null });
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
