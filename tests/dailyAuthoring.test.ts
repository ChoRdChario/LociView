import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge';
import { fixture, id, lifecycle, limits as structural } from './helpers/projectRecordsFixture';
import { ProjectMetadataSource } from '../src/projectMetadata/source';
import { newId } from '../src/projectMetadata/persistence';
import { readProjectScene } from '../src/scene/projectProvider';
import { developmentContentVerifier } from '../poc/scene-history/content-verifier';
import { captionSnapshot } from '../src/projectMetadata/captionAuthoring';
import { organizationSceneSource, sceneRestoreSource, sceneOrderChoices } from '../src/projectMetadata/sceneOrganization';
import type { MetadataEdit } from '../src/projectMetadata/commands';
import { canonical } from '../src/domain/projectGraphSupport';
import { boundsCentre, alignmentVector, placementAroundPivot, fitAlignmentBounds } from '../src/domain/alignment';
const limits = { ...structural, maxWork: 1_000_000, maxChanges: 100, maxChangeBytes: 1_000_000, maxTotalBytes: 8_000_000, maxOperations: 20_000 };
const fresh = (prefix: string) => `${prefix}_${newId()}`;
async function provider(source: ProjectMetadataSource) {
  const p = await readProjectScene(source.read(), limits, developmentContentVerifier([])); if (p.kind !== 'scene-provider') throw Error('provider'); return p;
}
function seed(absentColor = false) {
  const records = fixture(); if (absentColor) delete records.captionsById[id('cap')].colorSrgb;
  records.scenesById[id('scn', 2)] = { id: id('scn', 2), name: '詳細', orderKey: 'B', lifecycle: lifecycle() };
  return ProjectMetadataSource.bootstrap(records.schema, records.identity, limits).initialize(records);
}
async function edit(source: ProjectMetadataSource, command: MetadataEdit) { return source.prepareEdit(source.token, command, await provider(source), newId()); }
function branch(source: ProjectMetadataSource, mutate: (draft: Record<string, any>) => void) {
  const doc = A.change(A.applyChanges(A.init<Record<string, any>>(), source.originalChanges())[0], mutate);
  return ProjectMetadataSource.reopen(A.getAllChanges(doc), source.proof, limits);
}
async function copyScene(source: ProjectMetadataSource) {
  const s = organizationSceneSource(await provider(source), id('scn'), limits);
  return { kind: 'duplicateScene' as const, sourceId: id('scn'), sceneId: fresh('scn'), name: 'コピー', orderKey: 'Z', eventId: fresh('evt'),
    ids: [...s.assets, ...s.captions, ...s.views, ...s.materials,
      ...Object.values(fixture().captionsById), ...Object.values(fixture().captionAttachmentsById), ...Object.values(fixture().captionTagMembershipsById)]
      .map((r: any) => ({ sourceId: r.id, targetId: fresh(r.id.split('_')[0]) })) };
}
describe('daily typed authoring, existing records and retained original history', () => {
  it('duplicates a Scene with independent Caption/children, copied entry View/material and shared model/media/tag', async () => {
    const source = seed(), p = await provider(source), command = await copyScene(source), result = await edit(source, command), q = await provider(result);
    const target = (old: string) => command.ids.find(pair => pair.sourceId === old)!.targetId;
    expect(q.resources.captions[target(id('cap'))]!.anchor).toEqual(p.resources.captions[id('cap')]!.anchor);
    expect(q.details.attachments[target(id('att'))]).toEqual({ kind: 'value', value: { captionId: target(id('cap')), mediaResourceId: Object.keys(fixture().mediaResourcesById)[0] } });
    expect(q.state.scenes[command.sceneId]!.defaultViewId).toEqual({ kind: 'value', value: target(id('view')) });
    expect(q.resources.materials[target(id('ovr'))]!.routing).toMatchObject({ kind: 'value', value: { scope: { sceneId: command.sceneId } } });
    const changed = await edit(result, { kind: 'editCaption', captionId: target(id('cap')), edits: { body: '独立した本文' } });
    expect((await provider(changed)).resources.captions[id('cap')]!.body).toEqual(p.resources.captions[id('cap')]!.body);
    expect(result.originalChanges().slice(0, source.originalChanges().length)).toEqual(source.originalChanges());
    await expect(edit(source, { ...command, ids: command.ids.slice(1) })).rejects.toThrow('organization-copy-ids');
    await expect(edit(source, { ...command, sceneId: id('scn', 2) })).rejects.toThrow('authoring-id');
  });
  it('preserves equal-key view and membership ordering across fresh IDs', async () => {
    let source = seed(); source = branch(source, d => {
      d.viewsById[id('view', 2)] = { ...d.viewsById[id('view')], id: new A.ImmutableString(canonical(id('view', 2))) };
    });
    const command = await copyScene(source), p = await provider(await edit(source, command));
    const copies = command.ids.filter(c => c.sourceId.startsWith('view_')).map(c => p.details.mutable.viewsById[c.targetId]!.orderKey);
    expect(copies[0]).not.toEqual(copies[1]); expect(copies.every(c => c?.kind === 'value')).toBe(true);
  });
  it('keeps unrelated material/name conflicts scoped while refusing uncertain material ownership of the copied Scene', async () => {
    const source = seed(), target = fixture().materialOverridesById[id('ovr')].routing.target;
    const project = branch(source, d => { d.materialOverridesById[id('ovr')].routing = new A.ImmutableString(canonical({ scope: { kind: 'project' }, target })); });
    const other = branch(source, d => { d.materialOverridesById[id('ovr')].routing = new A.ImmutableString(canonical({ scope: { kind: 'scene', sceneId: id('scn', 2) }, target })); });
    const merged = project.appendOriginal(other.originalChanges()), command = await copyScene(merged), copied = await edit(merged, command);
    expect((await provider(copied)).resources.materials[id('ovr')]!.routing.kind).toBe('unresolved');
    expect(command.ids.some(pair => pair.sourceId === id('ovr'))).toBe(false);
    const local = branch(source, d => { d.materialOverridesById[id('ovr')].appearance = new A.ImmutableString(canonical({ opacity: 1 })); });
    // Both branches can own the current Scene: do not manufacture a complete copy.
    const routingConflict = project.appendOriginal(branch(local, d => { delete d.materialOverridesById[id('ovr')].routing; d.materialOverridesById[id('ovr')].routing = new A.ImmutableString(canonical({ scope: { kind: 'scene', sceneId: id('scn') }, target })); }).originalChanges());
    await expect(copyScene(routingConflict)).rejects.toThrow('membership-resolution-unresolved');
    const a = branch(source, d => { d.scenesById[id('scn', 2)].name = new A.ImmutableString(canonical('左')); }), b = branch(source, d => { d.scenesById[id('scn', 2)].name = new A.ImmutableString(canonical('右')); });
    const reordered = await edit(a.appendOriginal(b.originalChanges()), { kind: 'reorderScene', sceneId: id('scn', 2), beforeId: null, afterId: id('scn'), orderKey: '4' }), p = await provider(reordered);
    expect(p.state.scenes[id('scn', 2)]!.name.kind).toBe('unresolved'); expect(p.state.scenes[id('scn', 2)]!.orderKey).toEqual({ kind: 'value', value: '4' });
  });
  it.each([false, true])('recovers all-deleted Scenes after independent deletions in either merge order (%s)', async reverse => {
    const source = seed();
    const deleteScene = async (base: ProjectMetadataSource, sceneId: string) => {
      const s = organizationSceneSource(await provider(base), sceneId, limits);
      return edit(base, { kind: 'deleteSceneContents', sceneId, observedIds: [...s.assets, ...s.captions, ...s.views, ...s.materials].map(r => r.id as string), eventId: fresh('evt') });
    };
    await expect(deleteScene(source, id('scn'))).rejects.toThrow('organization-default-last');
    const left = await deleteScene(await edit(source, { kind: 'setDefaultScene', sceneId: id('scn', 2) }), id('scn'));
    const right = await deleteScene(source, id('scn', 2));
    const merged = (reverse ? right : left).appendOriginal((reverse ? left : right).originalChanges()), p = await provider(merged);
    expect(Object.values(p.state.scenes).every(s => s.lifecycle.kind === 'value' && s.lifecycle.value.state === 'deleted')).toBe(true);
    const recovery = sceneRestoreSource(p, id('scn'), limits), restored = await edit(merged, { kind: 'restoreScene', sceneId: id('scn'), observedOperationIds: recovery.operationIds, eventId: fresh('evt') }), q = await provider(restored);
    expect(q.state.defaultSceneId).toEqual({ kind: 'value', value: id('scn') }); expect(q.state.scenes[id('scn')]!.defaultViewId).toEqual({ kind: 'value', value: null });
    expect(q.resources.captions[id('cap')]).toEqual(p.resources.captions[id('cap')]);
    expect(q.state.assetMemberships[id('sam')]!.lifecycle).toEqual(p.state.assetMemberships[id('sam')]!.lifecycle);
    expect(ProjectMetadataSource.fromFullSource(restored.encodeFullSource(), restored.proof, limits).originalChanges()).toEqual(restored.originalChanges());
  });
  it('chooses an exact concurrent Scene order and records a fresh whole-field atom', async () => {
    const source = seed(), a = await edit(source, { kind: 'reorderScene', sceneId: id('scn', 2), beforeId: null, afterId: id('scn'), orderKey: '4' });
    const b = await edit(source, { kind: 'reorderScene', sceneId: id('scn', 2), beforeId: null, afterId: id('scn'), orderKey: '5' });
    const merged = a.appendOriginal(b.originalChanges()), p = await provider(merged), choices = sceneOrderChoices(p, id('scn', 2), limits);
    for (const choice of choices) {
      const resolved = await edit(merged, { kind: 'resolveSceneOrder', sceneId: id('scn', 2), operationId: choice.operationId }), q = await provider(resolved);
      expect(q.state.scenes[id('scn', 2)]!.orderKey).toEqual({ kind: 'value', value: choice.orderKey });
      const f = q.inspection.candidates.fields.find(f => f.path.join('/') === `scenesById/${id('scn', 2)}/orderKey`)!;
      expect(f.candidates).toHaveLength(1); expect(f.candidates[0]!.operationId).not.toBe(choice.operationId);
    }
  });
  it('repairs a missing default without clearing a healthy Scene entry View and refuses malformed defaults', async () => {
    const source = branch(seed(), d => { d.project.defaultSceneId = new A.ImmutableString(canonical(id('scn', 999))); }), p = await provider(source), recovery = sceneRestoreSource(p, id('scn'), limits);
    const restored = await edit(source, { kind: 'restoreScene', sceneId: id('scn'), observedOperationIds: recovery.operationIds, eventId: fresh('evt') });
    expect((await provider(restored)).state.scenes[id('scn')]!.defaultViewId).toEqual({ kind: 'value', value: id('view') });
    const malformed = branch(seed(), d => { d.project.defaultSceneId = new A.ImmutableString(canonical(123)); });
    expect(() => sceneRestoreSource(p, id('scn', 999), limits)).toThrow();
    const invalid = await provider(malformed); expect(() => sceneRestoreSource(invalid, id('scn'), limits)).toThrow('organization-restore-default');
  });
  it('restores optional color absence and refuses a foreign write even when it repeats the same value', async () => {
    const source = seed(true), before = captionSnapshot(await provider(source), id('cap'), limits);
    const changed = await edit(source, { kind: 'editCaption', captionId: id('cap'), edits: { title: '新しい記録', colorSrgb: [1, 0, 0] } });
    const after = captionSnapshot(await provider(changed), id('cap'), limits), values = { title: '記録', body: fixture().captionsById[id('cap')].body };
    const restored = await edit(changed, { kind: 'restoreCaptionFields', expected: after, values });
    expect(captionSnapshot(await provider(restored), id('cap'), limits).fields.map(f => f.value)).toEqual(before.fields.map(f => f.value));
    const foreign = branch(changed, d => { delete d.captionsById[id('cap')].title; d.captionsById[id('cap')].title = new A.ImmutableString(canonical('新しい記録')); });
    await expect(edit(foreign, { kind: 'restoreCaptionFields', expected: after, values })).rejects.toThrow('authoring-undo-changed');
    await expect(edit(changed, { kind: 'restoreCaptionFields', expected: after, values: { ...values, extra: true } as any })).rejects.toThrow('authoring-command-shape');
  });
  it('explicitly detaches all observed duplicate tag registrations and preserves other records', async () => {
    const source = branch(seed(), d => { d.captionTagMembershipsById[id('tgm', 2)] = { ...d.captionTagMembershipsById[id('tgm')], id: new A.ImmutableString(canonical(id('tgm', 2))) }; });
    await expect(edit(source, { kind: 'setCaptionTag', captionId: id('cap'), tagId: id('tag'), included: false, observedIds: [id('tgm')], membershipId: fresh('tgm'), eventId: fresh('evt') })).rejects.toThrow('authoring-tag-membership');
    const result = await edit(source, { kind: 'setCaptionTag', captionId: id('cap'), tagId: id('tag'), included: false, observedIds: [id('tgm'), id('tgm', 2)], membershipId: fresh('tgm'), eventId: fresh('evt') }), p = await provider(result);
    expect(Object.values(p.details.mutable.captionTagMembershipsById).every(f => f.lifecycle?.kind === 'value' && (f.lifecycle.value as any).state === 'deleted')).toBe(true);
    expect(p.resources.captions[id('cap')]).toEqual((await provider(source)).resources.captions[id('cap')]);
  });
  it('resolves exact tag label/color atoms including absence, then lifecycle, without accepting unknown fields', async () => {
    const source = seed(), left = branch(source, d => { d.captionTagsById[id('tag')].label = new A.ImmutableString(canonical('左')); delete d.captionTagsById[id('tag')].colorSrgb; });
    const right = branch(source, d => { d.captionTagsById[id('tag')].label = new A.ImmutableString(canonical('右')); d.captionTagsById[id('tag')].colorSrgb = new A.ImmutableString(canonical([1, 0, 0])); });
    let merged = left.appendOriginal(right.originalChanges());
    for (const field of ['label', 'colorSrgb'] as const) {
      const p = await provider(merged), candidates = p.inspection.candidates.fields.find(f => f.path.join('/') === `captionTagsById/${id('tag')}/${field}`)!.candidates;
      const choice = field === 'colorSrgb' ? candidates.find(c => c.value.kind === 'absent')! : candidates[0]!;
      merged = await edit(merged, { kind: 'resolveTagField', tagId: id('tag'), field, operationId: choice.operationId });
      const result = (await provider(merged)).inspection.candidates.fields.find(f => f.path.join('/') === `captionTagsById/${id('tag')}/${field}`)!;
      expect(result.candidates).toHaveLength(1); expect(result.candidates[0]!.value).toEqual(choice.value); expect(result.candidates[0]!.operationId).not.toBe(choice.operationId);
    }
    const withUnknown = branch(merged, d => { d.captionTagsById[id('tag')].futureMeaning = new A.ImmutableString(canonical('preserve')); }), p = await provider(withUnknown);
    const life = p.inspection.candidates.fields.find(f => f.path.join('/') === `captionTagsById/${id('tag')}/lifecycle`)!;
    await expect(edit(withUnknown, { kind: 'resolveTagLifecycle', tagId: id('tag'), state: 'active', observedOperationIds: life.candidates.map(c => c.operationId), observedIds: [id('tgm')], eventId: fresh('evt') })).rejects.toThrow('membership-resolution-unresolved');
  });
  it('restores exact admitted text including spaces, Unicode, CR and TAB', async () => {
    const source = branch(seed(), d => { d.captionsById[id('cap')].title = new A.ImmutableString(canonical('  Café 🧭  ')); });
    const before = captionSnapshot(await provider(source), id('cap'), limits), changed = await edit(source, { kind: 'editCaption', captionId: id('cap'), edits: { title: '編集' } });
    const result = await edit(changed, { kind: 'restoreCaptionFields', expected: captionSnapshot(await provider(changed), id('cap'), limits),
      values: { title: (before.fields[0]!.value as { value: string }).value, body: fixture().captionsById[id('cap')].body, colorSrgb: [0.1, 0.2, 0.3] } });
    expect((await provider(result)).resources.captions[id('cap')]!.title).toEqual({ kind: 'value', value: '  Café 🧭  ' });
    expect((await provider(result)).resources.captions[id('cap')]!.body).toEqual({ kind: 'value', value: fixture().captionsById[id('cap')].body });
  });
});
describe('alignment geometry', () => {
  it('keeps the centre pivot stationary and fits centres/scale without changing rotation', () => {
    const before = { translation: [3, 4, 5] as const, rotationXYZW: [0, 0, 0, 1] as const, uniformScale: 2 }, next = { ...before, rotationXYZW: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const, uniformScale: 3 };
    const pivot = [1, 2, 3] as const, after = placementAroundPivot(before, next, pivot), old = alignmentVector(pivot, before), current = alignmentVector(pivot, after);
    current.forEach((n, i) => expect(n + after.translation[i]!).toBeCloseTo(old[i]! + before.translation[i]!));
    const bounds = { min: [0, 0, 0] as const, max: [2, 4, 6] as const }, reference = { ...before, translation: [30, 40, 50] as const, uniformScale: 4 };
    const fitted = fitAlignmentBounds(bounds, before, bounds, reference); expect(fitted.rotationXYZW).toEqual(before.rotationXYZW); expect(fitted.uniformScale).toBe(4);
    const centre = boundsCentre(bounds), a = alignmentVector(centre, fitted), b = alignmentVector(centre, reference);
    a.forEach((n, i) => expect(n + fitted.translation[i]!).toBeCloseTo(b[i]! + reference.translation[i]!));
    expect(() => fitAlignmentBounds({ min: [0, 0, 0], max: [0, 0, 0] }, before, bounds, reference)).toThrow();
  });
});
