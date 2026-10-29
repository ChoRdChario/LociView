import { reactivatedCaptionMedia } from '../src/projectMetadata/captionReactivation';
import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge';
import { fixture, id, lifecycle, limits as structural } from './helpers/projectRecordsFixture';
import { ProjectMetadataSource } from '../src/projectMetadata/source';
import { newId } from '../src/projectMetadata/persistence';
import { readProjectScene } from '../src/scene/projectProvider';
import { developmentContentVerifier } from '../poc/scene-history/content-verifier';
import { beginCaptionUndo, finishCaptionUndo, captionUndoSnapshot, rebaseCaptionUndo, type CaptionUndoReceipt } from '../src/projectMetadata/captionUndo';
import { captionDeletionImpact } from '../src/projectMetadata/captionDeletion';
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


describe('local Caption action compensation over retained records', () => {
  async function tracked(source: ProjectMetadataSource, command: MetadataEdit) {
    const capture = beginCaptionUndo(await provider(source), command, limits); expect(capture).not.toBeNull();
    const result = await edit(source, command), receipt = finishCaptionUndo(await provider(result), capture!, limits); expect(receipt).not.toBeNull();
    return { source: result, receipt: receipt! };
  }
  const compensate = (source: ProjectMetadataSource, receipt: CaptionUndoReceipt, forward = false) => edit(source,
    { kind: 'compensateCaptionAction', expected: forward ? receipt.before : receipt.after, goal: forward ? receipt.after : receipt.before, eventId: fresh('evt') });
  it('undoes an edited duplicate back through creation and restores the same identities without deleting resources', async () => {
    const source = seed(), sourceRows = (await provider(source)).inspection.candidates.unambiguousRecords;
    const created = await tracked(source, { kind: 'duplicateCaption', sceneId: id('scn'), sourceId: id('cap'), captionId: fresh('cap'), membershipId: fresh('scm'),
      attachments: [{ sourceId: id('att'), targetId: fresh('att') }], tags: [{ sourceId: id('tgm'), targetId: fresh('tgm') }], orderKey: 'Z', eventId: fresh('evt') });
    const captionId = created.receipt.after.target.captionId;
    const changed = await tracked(created.source, { kind: 'editCaption', captionId, edits: { body: '複製後の文章' } });
    const undoneText = await compensate(changed.source, changed.receipt), current = captionUndoSnapshot(await provider(undoneText), changed.receipt.before.target, limits);
    created.receipt.after = rebaseCaptionUndo(created.receipt.after, changed.receipt.before, current);
    const undoneCreation = await compensate(undoneText, created.receipt), p = await provider(undoneCreation);
    expect(p.resources.captions[captionId]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    expect(p.inspection.candidates.unambiguousRecords.mediaResourcesById).toEqual(sourceRows.mediaResourcesById);
    expect(p.resources.captions[id('cap')]).toEqual((await provider(source)).resources.captions[id('cap')]);
    created.receipt.before = captionUndoSnapshot(p, created.receipt.before.target, limits);
    const redone = await compensate(undoneCreation, created.receipt, true), restored = await provider(redone);
    expect(restored.resources.captions[captionId]!.lifecycle).toMatchObject({ value: { state: 'active', reason: 'restore' } });
    expect(Object.keys(restored.resources.captions).sort()).toEqual(Object.keys((await provider(created.source)).resources.captions).sort());
    const foreign = branch(created.source, d => { delete d.captionsById[captionId].title; d.captionsById[captionId].title = new A.ImmutableString(canonical('記録')); });
    await expect(compensate(foreign, finishCaptionUndo(await provider(created.source), { target: created.receipt.after.target, before: null }, limits)!)).rejects.toThrow('caption-undo-changed');
    const extra = await edit(created.source, { kind: 'createAttachment', sceneId: id('scn'), captionId, attachmentId: fresh('att'), media: fixture().mediaResourcesById[id('med')], orderKey: 'ZZ', altText: '', eventId: fresh('evt') });
    await expect(compensate(extra, finishCaptionUndo(await provider(created.source), { target: created.receipt.after.target, before: null }, limits)!)).rejects.toThrow('caption-undo-new-child');
  });
  it('restores only the observed deletion closure across Scenes and refuses unavailable destinations', async () => {
    const records = fixture(); records.scenesById[id('scn', 2)] = { id: id('scn', 2), name: '別Scene', orderKey: 'B', lifecycle: lifecycle() };
    records.sceneCaptionMembershipsById[id('scm', 2)] = { ...records.sceneCaptionMembershipsById[id('scm')], id: id('scm', 2), sceneId: id('scn', 2) };
    records.captionAttachmentsById[id('att', 2)] = { ...records.captionAttachmentsById[id('att')], id: id('att', 2), lifecycle: { state: 'deleted', reason: 'userDelete', eventId: fresh('evt') } };
    const source = ProjectMetadataSource.bootstrap(records.schema, records.identity, limits).initialize(records), p = await provider(source), impact = captionDeletionImpact(p, id('cap'), limits);
    const removed = await tracked(source, { kind: 'deleteCaption', captionId: id('cap'), observedMembershipIds: impact.memberships.map(r => r.id), observedAttachmentIds: impact.attachments.map(r => r.id), observedTagMembershipIds: impact.tags.map(r => r.id), eventId: fresh('evt') });
    const restored = await compensate(removed.source, removed.receipt), actual = (await provider(restored)).inspection.candidates.unambiguousRecords as ReturnType<typeof fixture>;
    expect(actual.captionAttachmentsById[id('att', 2)]).toEqual(records.captionAttachmentsById[id('att', 2)]);
    for (const map of ['captionsById', 'sceneCaptionMembershipsById', 'captionAttachmentsById', 'captionTagMembershipsById'] as const)
      for (const [key, row] of Object.entries(records[map] as Record<string, Record<string, unknown>>)) expect(actual[map][key]).toEqual({ ...row, ...(key === id('att', 2) ? {} : { lifecycle: expect.objectContaining({ state: 'active', reason: 'restore' }) }) });
    const missingScene = branch(removed.source, d => { d.scenesById[id('scn', 2)].lifecycle = new A.ImmutableString(canonical({ state: 'deleted', reason: 'userDelete', eventId: fresh('evt') })); });
    await expect(compensate(missingScene, removed.receipt)).rejects.toThrow();
    const unknown = branch(removed.source, d => { d.captionAttachmentsById[id('att')].future = new A.ImmutableString(canonical('preserve')); });
    await expect(compensate(unknown, removed.receipt)).rejects.toThrow();
  });
  it('retains conflict-preserving Caption deletion when the action cannot have a local Undo receipt', async () => {
    const source = seed(), a = await edit(source, { kind: 'editCaption', captionId: id('cap'), edits: { title: '候補A' } }), b = await edit(source, { kind: 'editCaption', captionId: id('cap'), edits: { title: '候補B' } });
    const merged = a.appendOriginal(b.originalChanges()), p = await provider(merged), impact = captionDeletionImpact(p, id('cap'), limits);
    const command: MetadataEdit = { kind: 'deleteCaption', captionId: id('cap'), eventId: fresh('evt'), observedMembershipIds: impact.memberships.map(v => v.id), observedAttachmentIds: impact.attachments.map(v => v.id), observedTagMembershipIds: impact.tags.map(v => v.id) };
    const capture = beginCaptionUndo(p, command, limits); expect(capture?.unavailable).toBe(true);
    const removed = await edit(merged, command), after = await provider(removed);
    expect(after.resources.captions[id('cap')]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    expect(after.inspection.candidates.fields.find(f => f.path.join('/') === `captionsById/${id('cap')}/title`)!.candidates).toEqual(p.inspection.candidates.fields.find(f => f.path.join('/') === `captionsById/${id('cap')}/title`)!.candidates);
    expect(() => finishCaptionUndo(after, capture!, limits)).toThrow('caption-undo-unavailable');
  });
  it('does not let an unrelated attachment lifecycle conflict block target media reactivation', async () => {
    const source = seed(), duplicated = await edit(source, { kind: 'duplicateCaption', sceneId: id('scn'), sourceId: id('cap'), captionId: id('cap', 2), membershipId: id('scm', 2), attachments: [{ sourceId: id('att'), targetId: id('att', 2) }], tags: [{ sourceId: id('tgm'), targetId: id('tgm', 2) }], orderKey: 'Z', eventId: fresh('evt') });
    const removed = await tracked(duplicated, { kind: 'deleteAttachment', sceneId: id('scn'), captionId: id('cap'), attachmentId: id('att'), eventId: fresh('evt') });
    const a = branch(removed.source, d => { d.captionAttachmentsById[id('att', 2)].lifecycle = new A.ImmutableString(canonical({ state: 'deleted', reason: 'userDelete', eventId: fresh('evt') })); });
    const b = branch(removed.source, d => { d.captionAttachmentsById[id('att', 2)].lifecycle = new A.ImmutableString(canonical({ state: 'active', reason: 'restore', eventId: fresh('evt') })); });
    const merged = a.appendOriginal(b.originalChanges()), restored = await compensate(merged, removed.receipt);
    const refs = await reactivatedCaptionMedia(merged, restored, limits);
    expect(refs).toEqual([fixture().mediaResourcesById[id('med')].blob]);
    expect((await provider(restored)).details.mutable.captionAttachmentsById[id('att', 2)]!.lifecycle?.kind).toBe('unresolved');
  });
  it('reuses only identical immutable media candidates when reactivating an attachment', async () => {
    const removed = await tracked(seed(), { kind: 'deleteAttachment', sceneId: id('scn'), captionId: id('cap'), attachmentId: id('att'), eventId: fresh('evt') }), record = fixture().mediaResourcesById[id('med')];
    const rewrite = () => branch(removed.source, d => { delete d.mediaResourcesById[id('med')]; d.mediaResourcesById[id('med')] = new A.ImmutableString(canonical(record)); });
    const a = rewrite(), b = rewrite(), merged = a.appendOriginal(b.originalChanges()), restored = await compensate(merged, removed.receipt);
    expect((await provider(merged)).inspection.candidates.fields.find(f => f.path.join('/') === `mediaResourcesById/${id('med')}`)!.candidates).toHaveLength(2);
    expect(await reactivatedCaptionMedia(merged, restored, limits)).toEqual([record.blob]);
  });
  it('restores an originally absent attachment description and rejects reused lifecycle events', async () => {
    const source = branch(seed(), d => { delete d.captionAttachmentsById[id('att')].altText; });
    const changed = await tracked(source, { kind: 'editAttachment', sceneId: id('scn'), captionId: id('cap'), attachmentId: id('att'), field: 'altText', value: '後から追加' });
    const undone = await compensate(changed.source, changed.receipt);
    expect(((await provider(undone)).inspection.candidates.unambiguousRecords as ReturnType<typeof fixture>).captionAttachmentsById[id('att')]).not.toHaveProperty('altText');
    changed.receipt.before = captionUndoSnapshot(await provider(undone), changed.receipt.before.target, limits);
    expect(((await provider(await compensate(undone, changed.receipt, true))).inspection.candidates.unambiguousRecords as ReturnType<typeof fixture>).captionAttachmentsById[id('att')]!.altText).toBe('後から追加');
    const removed = await tracked(seed(), { kind: 'deleteAttachment', sceneId: id('scn'), captionId: id('cap'), attachmentId: id('att'), eventId: id('evt', 999) });
    await expect(edit(removed.source, { kind: 'compensateCaptionAction', expected: removed.receipt.after, goal: removed.receipt.before, eventId: id('evt', 999) })).rejects.toThrow('caption-undo-event-reused');
  });
  it('undoes attachment addition/removal and exact description/order without changing media bodies', async () => {
    const source = seed(), attachmentId = fresh('att'), media = fixture().mediaResourcesById[id('med')];
    const added = await tracked(source, { kind: 'createAttachment', sceneId: id('scn'), captionId: id('cap'), attachmentId, media, orderKey: 'ZZ', altText: '', eventId: fresh('evt') });
    const changed = await tracked(added.source, { kind: 'editAttachment', sceneId: id('scn'), captionId: id('cap'), attachmentId, field: 'altText', value: '説明' });
    const undone = await compensate(changed.source, changed.receipt), snap = captionUndoSnapshot(await provider(undone), changed.receipt.before.target, limits);
    added.receipt.after = rebaseCaptionUndo(added.receipt.after, changed.receipt.before, snap);
    const removed = await compensate(undone, added.receipt); added.receipt.before = captionUndoSnapshot(await provider(removed), added.receipt.before.target, limits);
    const restored = await compensate(removed, added.receipt, true);
    expect(((await provider(restored)).inspection.candidates.unambiguousRecords as ReturnType<typeof fixture>).captionAttachmentsById[attachmentId]).toMatchObject({ id: attachmentId, altText: '', orderKey: 'ZZ', lifecycle: { state: 'active' } });
    const moved = await tracked(restored, { kind: 'editAttachment', sceneId: id('scn'), captionId: id('cap'), attachmentId, field: 'orderKey', value: 'A' });
    expect(((await provider(await compensate(moved.source, moved.receipt))).inspection.candidates.unambiguousRecords as ReturnType<typeof fixture>).captionAttachmentsById[attachmentId]!.orderKey).toBe('ZZ');
    const detached = await tracked(restored, { kind: 'deleteAttachment', sceneId: id('scn'), captionId: id('cap'), attachmentId, eventId: fresh('evt') });
    expect((await provider(await compensate(detached.source, detached.receipt))).details.attachments[attachmentId]?.kind).toBe('value');
    expect((await provider(restored)).inspection.candidates.unambiguousRecords.mediaResourcesById).toEqual((await provider(source)).inspection.candidates.unambiguousRecords.mediaResourcesById);
  });
});
