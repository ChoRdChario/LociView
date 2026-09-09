import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import * as A from '@automerge/automerge';
import { createDevelopmentPair } from './development';
import { historyAuthority, historySeed, projectHistory, captionKey, membershipKey, bindingKey } from '../../src/harness/projectScene/historyProjection';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { allocateModelCopyIds, canonicalFixture, fixtureModelIds, fixtureModelBytes, readFixtureModel, remapFixtureModel } from '../../src/harness/projectScene/modelClosure';
import { modelClosureKey, projectModelHistory } from '../../src/harness/projectScene/modelHistory';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { createTeamWorkspace } from '../../src/harness/projectScene/teamWorkspace';
import type { DevelopmentHistory, MemoryUpdate } from '../../src/harness/projectScene/historyPort';
import { planCaptionList } from '../../src/ui/projectScene/captionListState';
import { editCaptionDraft, planCaptionApply, type CaptionEditField } from '../../src/ui/projectScene/captionDetailState';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import { planPinMode } from '../../src/ui/projectScene/pinModeState';
import { planCaptionInclude } from '../../src/ui/projectScene/captionIncludeState';
import { applyMembershipResolution, duplicateMemberships, planMembershipResolution, type DuplicateMembership } from '../../src/harness/projectScene/membershipResolution';
import { planNavigation } from '../../src/ui/projectScene/navigationState';
import { resolveScene } from '../../src/scene/resolve';
import { RecordedDocument, RecordedNode, record } from '../../tests/ui/domRecorder';
import { planView, type ViewRuntime } from '../../src/ui/projectScene/viewState';
import { editViewName, planViewAuthor, type ViewAuthorContext } from '../../src/ui/projectScene/viewAuthoringState';
import { viewKey, entryKey } from '../../src/harness/projectScene/viewHistory';
import type { DisplayCapture } from '../../src/harness/projectScene/viewSession';
import { editMaterialDraft, materialTargetKey, planMaterial, type MaterialIntentRequest } from '../../src/ui/projectScene/materialState';
import type { MaterialEditField } from '../../src/domain/materialIntent';
import { materialBucket, materialCopyIntent, materialKey, materialTarget } from '../../src/harness/projectScene/materialHistory';
import { syntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { attachmentKey, captionAttachments, copyableAttachments, fixtureMedia } from '../../src/harness/projectScene/mediaHistory';

const factory = (seed: Readonly<Record<string, string>>, validate: Parameters<typeof createDevelopmentPair>[2]) => createDevelopmentPair(A, seed, validate);
const pair = () => factory(historySeed(), projectHistory);
const bytes = (update: MemoryUpdate) => update.changes.map(c => Buffer.from(c).toString('hex')).sort();
const select = (session: SyntheticSession) => session.acceptList(planCaptionList(session.captionContext(), { kind: 'select', captionId: f.shared }));
function draft(session: SyntheticSession, field: CaptionEditField, text: string) {
  const ctx = session.detailContext();
  expect(session.acceptDetail({ kind: 'draft', baseDraft: ctx.draft!, draft: editCaptionDraft(ctx.draft!, ctx.source, field, text) })).toBe(true);
}
function apply(session: SyntheticSession) {
  const plan = planCaptionApply(session.detailContext());
  if (plan.kind !== 'apply') throw new Error(plan.reason);
  expect(session.acceptDetail(plan)).toBe(true);
}
const field = (history: DevelopmentHistory, name: CaptionEditField = 'title') => history.read().cells[captionKey(f.shared, name)];
const descendants = (node: RecordedNode): RecordedNode[] => [node, ...node.children.flatMap(descendants)];
const by = (root: RecordedNode, predicate: (node: RecordedNode) => boolean) => {
  const found = descendants(root).find(predicate); if (!found) throw new Error('Control not found'); return found;
};
const label = (root: RecordedNode, name: string) => by(root, n => n.attributes.get('aria-label') === name);
const button = (root: RecordedNode, text: string) => by(root, n => n.tag === 'button' && n.textContent === text);
const visibleWorkspace = (root: RecordedNode) => by(root, n => n.className === 'lv-development' && !n.hidden);
const toggle = (session: SyntheticSession, assetId: string, included: boolean) => session.acceptModel(
  planModelList(session.modelContext(), { kind: 'membership', assetId, included }));
const versions = syntheticVersions.filter(v => v.assetId === f.equipment);
function updateModel(session: SyntheticSession, version = versions[1]!) {
  session.acceptModel(planModelList(session.modelContext(), { kind: 'select', assetId: f.equipment }));
  const ctx = session.modelUpdateContext();
  return session.acceptModelUpdate({ token: ctx.token, sceneId: ctx.sceneId, assetId: f.equipment, bindingId: version.projection.bindingId });
}
function movePin(session: SyntheticSession, coordinates: readonly [string, string, string], familyId: string | null = null) {
  expect(session.acceptPin(planPinMode(session.pinContext(), { kind: 'move' }))).toBe(true);
  session.changePinCoordinates({ coordinates, familyId });
  expect(session.acceptPin(planPinMode(session.pinContext(), { kind: 'finish' }))).toBe(true);
}
const freshId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
function enterDetail(session: SyntheticSession) {
  expect(session.acceptNavigation(planNavigation(session.snapshot.state, session.session, session.pending, { kind: 'scene', sceneId: f.detail }))).toBe(true);
}
function includeCaption(session: SyntheticSession, id = f.second) {
  expect(session.acceptInclude(planCaptionInclude(session.includeContext(), { kind: 'select', captionId: id }))).toBe(true);
  const accepted = session.acceptInclude(planCaptionInclude(session.includeContext(), { kind: 'include' }));
  expect(accepted, session.message).toBe(true);
}
function resolution(history: DevelopmentHistory, group: DuplicateMembership, originalEdgeId: string, action: 'one' | 'both') {
  return planMembershipResolution(history.read(), group, originalEdgeId, action, freshId('evt'), action === 'one' ? [] :
    group.edges.filter(edge => edge.id !== originalEdgeId).map(edge => ({ edgeId: edge.id, captionId: freshId('cap'), membershipId: freshId('scm') })));
}
function modelResolution(history: DevelopmentHistory, group: DuplicateMembership) {
  const source = projectModelHistory(history.read()).versions.find(v => v.assetId === group.resourceId)!;
  return planMembershipResolution(history.read(), group, group.edges[0]!.id, 'both', freshId('evt'), [],
    group.edges.slice(1).map(edge => ({ edgeId: edge.id, membershipId: freshId('sam'), ids: allocateModelCopyIds(fixtureModelIds(source.closure), freshId) })));
}
function modelConflict() {
  const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
  enterDetail(sa); enterDetail(sb); expect(toggle(sa, f.structure, true)).toBe(true); expect(toggle(sb, f.structure, true)).toBe(true);
  a.receive(b.exportUpdate()); sa.refreshHistory();
  return { a, b, sa, sb, group: duplicateMemberships(a.read())[0]! };
}

const mat = (s: SyntheticSession, request: MaterialIntentRequest) => s.acceptMaterial(planMaterial(s.materialContext(), request));
function materialSelection(s: SyntheticSession, assetId: string, scope: 'scene' | 'project' = 'scene') {
  expect(mat(s, { kind: 'model', assetId }), s.message).toBe(true);
  const source = s.materialContext().source;
  if (source.kind !== 'ready') throw new Error('ready');
  const surfaces = source.models.find(m => m.assetId === assetId)!.surfaces;
  if (surfaces.kind !== 'value') throw new Error('surfaces');
  expect(mat(s, { kind: 'surface', key: materialTargetKey(surfaces.value[0]!.target) }), s.message).toBe(true);
  expect(mat(s, { kind: 'scope', scope }), s.message).toBe(true);
}
function materialEdit(s: SyntheticSession, field: MaterialEditField, text: string) {
  const draft = s.materialContext().draft!;
  expect(s.acceptMaterial({ kind: 'draft', baseDraft: draft, draft: editMaterialDraft(draft, field, text) }), s.message).toBe(true);
}
function materialApply(s: SyntheticSession, field: MaterialEditField, text: string) {
  expect(mat(s, { kind: 'begin' }), s.message).toBe(true); materialEdit(s, field, text);
  expect(mat(s, { kind: 'apply' }), s.message).toBe(true);
}

describe('actual pinned candidate connected to synthetic workspace; not browser, wire or durable acceptance', () => {
  it('merges independent attachment additions, alt/order edits and the second exchange without deduplicating equal images', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b)); select(sa); select(sb);
    expect(sa.media.add(sa.mediaContext(), fixtureMedia[0]!.record.id)).toBe(true);
    expect(sb.media.add(sb.mediaContext(), fixtureMedia[0]!.record.id)).toBe(true);
    a.receive(b.exportUpdate()); b.receive(a.exportUpdate()); sa.refreshHistory(); sb.refreshHistory();
    let rows = captionAttachments(sa.snapshot.mediaData, f.shared).ready; expect(rows).toHaveLength(2); expect(new Set(rows.map(r => r.id)).size).toBe(2);
    const id = rows[0]!.id; expect(sa.media.begin(sa.mediaContext(), id)).toBe(true); sa.media.input('説明を追加', false); expect(sa.media.apply()).toBe(true);
    expect(sb.media.reorder(sb.mediaContext(), id, 1), sb.media.message).toBe(true);
    a.receive(b.exportUpdate()); b.receive(a.exportUpdate()); sa.refreshHistory(); rows = captionAttachments(sa.snapshot.mediaData, f.shared).ready;
    expect(rows.at(-1)!.id).toBe(id); expect(rows.at(-1)!.altText).toEqual({ kind: 'value', value: '説明を追加' });
    expect(a.read()).toEqual(b.read()); expect(captionAttachments(sa.snapshot.mediaData, f.shared).review).toHaveLength(0);
    const sent = bytes(a.exportUpdate()); expect(a.receive(b.exportUpdate()).added).toBe(0); expect(bytes(a.exportUpdate())).toEqual(sent);
  });

  for (const state of ['active', 'deleted']) it(`holds delete/edit causally for explicit ${state} choice and rejects edits after observed deletion`, () => {
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), factory), [sa, sb] = team.sessions, [a, b] = team.histories;
    select(sa!); select(sb!); sa!.media.add(sa!.mediaContext(), fixtureMedia[0]!.record.id); b!.receive(a!.exportUpdate()); sb!.refreshHistory();
    const id = captionAttachments(sa!.snapshot.mediaData, f.shared).ready[0]!.id;
    expect(sa!.media.remove(sa!.mediaContext(), id)).toBe(true);
    expect(sb!.media.begin(sb!.mediaContext(), id)).toBe(true); sb!.media.input('削除を知らずに追記', false); expect(sb!.media.apply()).toBe(true);
    a!.receive(b!.exportUpdate()); sa!.refreshHistory(); team.render();
    expect(sa!.snapshot.mediaData!.records[id]!.deleteEdit).toBe(true); expect(captionAttachments(sa!.snapshot.mediaData, f.shared).ready).toHaveLength(0);
    expect(() => copyableAttachments(sa!.snapshot.mediaData, f.shared)).toThrow('競合');
    const root = record(team.root), selectBox = descendants(root).find(n => n.tag === 'select' && n.attributes.get('aria-label')?.endsWith('削除と編集の確認'))!;
    expect(selectBox.value).toBe(''); expect(button(root, '選択を適用').disabled).toBe(true);
    expect(descendants(selectBox.parent!).some(n => n.textContent === '説明：削除を知らずに追記')).toBe(true);
    expect(descendants(selectBox.parent!).some(n => n.textContent.startsWith('順序：'))).toBe(true);
    selectBox.value = state; selectBox.fire('change'); button(root, '選択を適用').fire('click');
    expect(sa!.snapshot.mediaData!.records[id]!.deleteEdit).toBe(false);
    expect(sa!.snapshot.mediaData!.records[id]!.lifecycle).toMatchObject({ value: { state, reason: 'conflictResolution' } });
    expect(sa!.snapshot.mediaData!.records[id]!.altText).toEqual({ kind: 'value', value: '削除を知らずに追記' });
    b!.receive(a!.exportUpdate()); expect(a!.read()).toEqual(b!.read());
    if (state === 'deleted') {
      const before = a!.read(); expect(() => a!.write(before.token, { [attachmentKey(id, 'altText')]: '削除を観測後の不正な追記' })).toThrow('削除後'); expect(a!.read()).toEqual(before);
      expect(sa!.media.begin(sa!.mediaContext(), id)).toBe(false);
      a!.write(a!.read().token, { [attachmentKey(id, 'lifecycle')]: canonicalFixture({ state: 'active', eventId: freshId('evt'), reason: 'restore' }) });
      expect(() => a!.write(a!.read().token, { [attachmentKey(id, 'altText')]: '復元後の追記' })).not.toThrow();
    }
    team.dispose();
  });

  it.each([false, true])('resolves simultaneous attachment lifecycle conflicts with a fresh retained command; delete/edit overlap=%s', overlap => {
    let reject = false; const commands: string[] = [];
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), (seed, validate) => {
      const [a, b] = factory(seed, validate);
      return [{ ...a, resolveAttachmentLifecycle(token, key, ids, value) {
        commands.push(value); if (reject) throw new Error('synthetic resolution failure');
        return a.resolveAttachmentLifecycle!(token, key, ids, value);
      } }, b];
    }), [sa, sb] = team.sessions, [a, b] = team.histories, root = record(team.root);
    select(sa!); select(sb!); sa!.media.add(sa!.mediaContext(), fixtureMedia[0]!.record.id); b!.receive(a!.exportUpdate()); sb!.refreshHistory();
    const id = captionAttachments(sa!.snapshot.mediaData, f.shared).ready[0]!.id, key = attachmentKey(id, 'lifecycle');
    expect(sa!.media.remove(sa!.mediaContext(), id)).toBe(true);
    if (overlap) { sb!.media.begin(sb!.mediaContext(), id); sb!.media.input('削除前の説明更新', false); expect(sb!.media.apply()).toBe(true); }
    expect(sb!.media.remove(sb!.mediaContext(), id)).toBe(true);
    a!.receive(b!.exportUpdate()); sa!.refreshHistory(); team.render();
    const before = a!.read(), conflict = before.cells[key]!; if (conflict.kind !== 'conflict') throw new Error('lifecycle conflict missing');
    const ids = conflict.candidates.map(c => c.id), value = canonicalFixture({ state: 'active', eventId: freshId('evt'), reason: 'conflictResolution' });
    expect(() => a!.write(before.token, { [key]: value })).toThrow();
    expect(() => a!.resolveAttachmentLifecycle!('stale', key, ids, value)).toThrow();
    expect(() => a!.resolveAttachmentLifecycle!(before.token, key, ids.slice(1), value)).toThrow();
    expect(() => a!.resolveAttachmentLifecycle!(before.token, captionKey(f.shared, 'title'), ids, value)).toThrow();
    const old = JSON.parse(conflict.candidates[0]!.value);
    expect(() => a!.resolveAttachmentLifecycle!(before.token, key, ids, canonicalFixture({ ...old, reason: 'conflictResolution' }))).toThrow('再使用');
    expect(a!.read()).toEqual(before); commands.length = 0; reject = true;
    const panel = label(root, '更新の競合');
    if (overlap) {
      const choose = descendants(panel).find(n => n.tag === 'select')!;
      expect(descendants(choose.parent!).some(n => n.textContent === '説明：削除前の説明更新')).toBe(true);
      choose.value = 'active'; choose.fire('change'); button(panel, '選択を適用').fire('click');
      expect(descendants(panel).find(n => n.tag === 'select')!.value).toBe('active');
    } else {
      const radio = by(panel, n => n.type === 'radio'); radio.checked = true; radio.fire('change');
      button(panel, '選んだ内容を使用').fire('click'); expect(by(panel, n => n.type === 'radio').checked).toBe(true);
    }
    expect(a!.read()).toEqual(before); reject = false;
    button(panel, overlap ? '選択を適用' : '選んだ内容を使用').fire('click');
    expect(commands).toHaveLength(2); expect(commands[1]).toBe(commands[0]);
    expect(sa!.snapshot.mediaData!.records[id]!.lifecycle).toMatchObject({ kind: 'value', value: { state: overlap ? 'active' : 'deleted', reason: 'conflictResolution' } });
    expect(sa!.snapshot.mediaData!.records[id]!.deleteEdit).toBe(false); expect(panel.hidden).toBe(true);
    b!.receive(a!.exportUpdate()); expect(a!.read()).toEqual(b!.read());
    const sent = bytes(a!.exportUpdate()); expect(a!.receive(b!.exportUpdate()).added).toBe(0); expect(bytes(a!.exportUpdate())).toEqual(sent);
    team.dispose();
  });

  it('lets the user cancel a retained media draft when receiving excludes its Caption from the Scene', () => {
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), factory), [sa, sb] = team.sessions, [a, b] = team.histories;
    select(sa!); select(sb!); sa!.media.add(sa!.mediaContext(), fixtureMedia[0]!.record.id); b!.receive(a!.exportUpdate()); sb!.refreshHistory();
    const id = captionAttachments(sa!.snapshot.mediaData, f.shared).ready[0]!.id;
    sa!.media.begin(sa!.mediaContext(), id); sa!.media.input('失わない下書き', false); const draft = sa!.media.draft;
    const edge = Object.values(sb!.snapshot.state.captionMemberships).find(e => e.resourceId === f.shared && e.sceneId === sb!.sceneId)!;
    b!.write(b!.read().token, { [membershipKey(edge.id)]: JSON.stringify({ ...edge, lifecycle: { kind: 'value', value: { state: 'deleted', eventId: freshId('evt'), reason: 'userDelete' } } }) });
    a!.receive(b!.exportUpdate()); sa!.refreshHistory(); team.render();
    const root = record(team.root), panel = label(visibleWorkspace(root), 'メディア');
    expect(sa!.media.draft).toBe(draft); expect(sa!.mediaContext().block).toBeTruthy(); expect(sa!.pending).toBe('text');
    expect(button(panel, '説明を適用').disabled).toBe(true); expect(button(panel, '取り消す').disabled).toBe(false);
    button(panel, '取り消す').fire('click'); expect(sa!.media.draft).toBeNull(); expect(sa!.pending).toBeNull();
    enterDetail(sa!); expect(sa!.sceneId).toBe(f.detail); team.dispose();
  });

  it('independently copies all confirmed attachments in source order with shared immutable media and unchanged originals', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    sa.acceptList(planCaptionList(sa.captionContext(), { kind: 'select', captionId: f.second }));
    sa.media.add(sa.mediaContext(), fixtureMedia[0]!.record.id); sa.media.add(sa.mediaContext(), fixtureMedia[1]!.record.id);
    const sourceRows = captionAttachments(sa.snapshot.mediaData, f.second).ready;
    a.write(a.read().token, { [attachmentKey(sourceRows[0]!.id, 'orderKey')]: 'A', [attachmentKey(sourceRows[1]!.id, 'orderKey')]: 'A' });
    b.receive(a.exportUpdate()); sa.refreshHistory(); sb.refreshHistory(); enterDetail(sa); enterDetail(sb); includeCaption(sa); includeCaption(sb); a.receive(b.exportUpdate()); sa.refreshHistory();
    const group = duplicateMemberships(a.read()).find(g => g.resourceId === f.second)!, rows = copyableAttachments(sa.snapshot.mediaData, f.second), before = sa.snapshot;
    const copiedId = freshId('cap'), maps = [{ edgeId: group.edges[1]!.id, captionId: copiedId, membershipId: freshId('scm'), attachments: rows.map((r, i) => ({ sourceId: r.id,
      attachmentId: `att_${(100 - i).toString(16).padStart(32, '0')}` })) }]; // reverse IDs must not reverse tied source order
    const p = planMembershipResolution(a.read(), group, group.edges[0]!.id, 'both', freshId('evt'), maps);
    expect(() => applyMembershipResolution({ ...a, write: () => { throw new Error('injected'); } }, p)).toThrow('injected');
    expect(a.read().token).toBe(p.token); applyMembershipResolution(a, p); sa.refreshHistory();
    const copyRows = copyableAttachments(sa.snapshot.mediaData, copiedId); expect(copyRows.map(r => r.mediaResourceId)).toEqual(rows.map(r => r.mediaResourceId));
    expect(copyRows.map(r => r.id)).toEqual(maps[0]!.attachments.map(m => m.attachmentId)); rows.forEach(r => expect(sa.snapshot.mediaData!.records[r.id]).toEqual(before.mediaData!.records[r.id]));
    sa.acceptList(planCaptionList(sa.captionContext(), { kind: 'select', captionId: copiedId }));
    expect(sa.media.remove(sa.mediaContext(), copyRows[0]!.id)).toBe(true); expect(copyableAttachments(sa.snapshot.mediaData, f.second)).toHaveLength(2);
    b.receive(a.exportUpdate()); expect(a.read()).toEqual(b.read()); const bytesBefore = bytes(a.exportUpdate()); expect(a.receive(b.exportUpdate()).added).toBe(0); expect(bytes(a.exportUpdate())).toEqual(bytesBefore);
  });

  it('retains media retry IDs and stale explanation input; exposes order/alt conflicts without a materialized winner', () => {
    const [a, b] = pair(), authority = historyAuthority(a), commands: Readonly<Record<string, string>>[] = []; let reject = true;
    const s = new SyntheticSession({ read: authority.read, write: (t, c) => { commands.push(c); if (reject) throw new Error('injected'); return authority.write(t, c); } }); select(s);
    expect(s.media.add(s.mediaContext(), fixtureMedia[0]!.record.id)).toBe(false); reject = false; expect(s.media.retry()).toBe(true); expect(commands[1]).toBe(commands[0]);
    const id = captionAttachments(s.snapshot.mediaData, f.shared).ready[0]!.id; b.receive(a.exportUpdate());
    s.media.begin(s.mediaContext(), id); s.media.input('未適用の説明', false); const draft = s.media.draft;
    b.write(b.read().token, { [attachmentKey(id, 'altText')]: '相手の説明' }); a.receive(b.exportUpdate()); s.refreshHistory();
    expect(s.media.apply()).toBe(false); expect(s.media.draft).toBe(draft); expect(s.media.cancel()).toBe(true);
    a.write(a.read().token, { [attachmentKey(id, 'altText')]: '別の説明', [attachmentKey(id, 'orderKey')]: 'A' });
    b.write(b.read().token, { [attachmentKey(id, 'altText')]: '更に説明', [attachmentKey(id, 'orderKey')]: 'B' }); a.receive(b.exportUpdate()); s.refreshHistory();
    const order = a.read().cells[attachmentKey(id, 'orderKey')]!; if (order.kind !== 'conflict') throw new Error('order conflict');
    expect(captionAttachments(s.snapshot.mediaData, f.shared).review).toHaveLength(1);
    a.choose(a.read().token, attachmentKey(id, 'orderKey'), order.candidates[0]!.id); s.refreshHistory();
    expect(captionAttachments(s.snapshot.mediaData, f.shared).ready[0]!.altText.kind).toBe('unresolved');
    expect(() => copyableAttachments(s.snapshot.mediaData, f.shared)).toThrow('競合');
    const previous = a.read(); expect(() => a.write(previous.token, { [attachmentKey(freshId('att'), 'altText')]: 'partial' })).toThrow(); expect(a.read()).toEqual(previous);
  });
  it('exchanges exact material scope/atomic appearance, explicit candidate choice and reset without changing compositing or another Scene', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    materialSelection(sa, f.equipment, 'project'); materialApply(sa, 'lighting', 'unlit');
    const id = Object.keys(sa.snapshot.resources.materials)[0]!, appearance = materialKey(id, 'appearance'), compositing = materialKey(id, 'compositing');
    b.receive(a.exportUpdate()); sb.refreshHistory(); materialSelection(sb, f.equipment, 'project');
    const original = a.read(); materialApply(sa, 'doubleSided', 'double'); materialApply(sb, 'lighting', 'lit');
    a.receive(b.exportUpdate()); sa.refreshHistory();
    expect(a.read().cellVersions![compositing]).toBe(original.cellVersions![compositing]);
    const conflict = a.read().cells[appearance]!; if (conflict.kind !== 'conflict') throw new Error('whole appearance conflict');
    expect(conflict.candidates.map(c => JSON.parse(c.value))).toEqual(expect.arrayContaining([{ doubleSided: true, lighting: 'unlit' }, { lighting: 'lit' }]));
    expect(sa.snapshot.materialData!.records[id]!.intent.kind).toBe('unresolved');
    expect(syntheticDisplay(sa.snapshot, f.overview, null, null).materialNotices!.join()).toContain('競合');
    a.choose(a.read().token, appearance, conflict.candidates.find(c => JSON.parse(c.value).lighting === 'unlit')!.id); sa.refreshHistory();
    materialSelection(sa, f.equipment, 'scene'); materialApply(sa, 'doubleSided', 'front');
    const before = syntheticDisplay(sa.snapshot, f.detail, null, null);
    expect(syntheticDisplay(sa.snapshot, f.overview, null, null).materials![f.equipment]).toMatchObject({ doubleSided: false, unlit: true });
    expect(before.materials![f.equipment]).toMatchObject({ doubleSided: true, unlit: true });
    expect(mat(sa, { kind: 'remove' }), sa.message).toBe(true);
    b.receive(a.exportUpdate()); sb.refreshHistory(); expect(a.read().cells).toEqual(b.read().cells);
    expect(syntheticDisplay(sa.snapshot, f.detail, null, null).materials).toEqual(before.materials);
    const sent = bytes(a.exportUpdate()); expect(a.receive(b.exportUpdate()).added).toBe(0); expect(bytes(a.exportUpdate())).toEqual(sent);
  });

  it('keeps original material command/IDs and draft on failure, retries exactly, and refuses a stale draft after receive', () => {
    const [a, b] = pair(), authority = historyAuthority(a), commands: Readonly<Record<string, string>>[] = []; let reject = true;
    const s = new SyntheticSession({ read: authority.read, write: (token, changes) => {
      commands.push(changes); if (reject) throw new Error('injected'); return authority.write(token, changes);
    } });
    materialSelection(s, f.equipment); mat(s, { kind: 'begin' }); materialEdit(s, 'lighting', 'unlit');
    const draft = s.materialContext().draft; expect(mat(s, { kind: 'apply' })).toBe(false); expect(s.materialContext().draft).toBe(draft);
    expect(s.materialContext().feedback.kind).toBe('failed'); reject = false;
    expect(mat(s, { kind: 'retry' }), s.message).toBe(true); expect(commands[1]).toBe(commands[0]); expect(s.pending).toBeNull();
    const id = Object.keys(s.snapshot.resources.materials)[0]!; b.receive(a.exportUpdate());
    mat(s, { kind: 'begin' }); materialEdit(s, 'doubleSided', 'double'); const held = s.materialContext().draft;
    b.write(b.read().token, { [materialKey(id, 'appearance')]: canonicalFixture({ lighting: 'lit', baseColorSrgb: [0.1234567, 0.456789, 0.9876543] }) });
    a.receive(b.exportUpdate()); s.refreshHistory(); expect(mat(s, { kind: 'apply' })).toBe(false); expect(s.materialContext().draft).toBe(held);
    expect(s.acceptMaterial({ kind: 'cancel', draft: held! })).toBe(true); materialApply(s, 'doubleSided', 'double');
    expect(JSON.parse((a.read().cells[materialKey(id, 'appearance')] as { value: string }).value).baseColorSrgb).toEqual([0.1234567, 0.456789, 0.9876543]);
  });

  it('mounts duplicate material choice without a winner, keeps the explicit choice and converges after second receive', () => {
    const doc = new RecordedDocument(), team = createTeamWorkspace(doc.asDocument(), factory), [sa, sb] = team.sessions, [a, b] = team.histories;
    materialSelection(sa!, f.equipment); materialApply(sa!, 'lighting', 'unlit'); materialSelection(sb!, f.equipment); materialApply(sb!, 'doubleSided', 'double');
    a!.receive(b!.exportUpdate()); sa!.refreshHistory(); team.render(); const root = record(team.root), panel = label(root, 'マテリアルの重複');
    const radios = descendants(panel).filter(n => n.tag === 'input' && n.type === 'radio');
    expect(radios).toHaveLength(2); expect(radios.every(r => !r.checked)).toBe(true); expect(button(panel, '選んだ設定を残す').disabled).toBe(true);
    const target = sa!.materialContext().selection.target!; expect(materialBucket(sa!.snapshot.materialData, { scope: { kind: 'scene', sceneId: f.overview }, target }).kind).toBe('unresolved');
    const wanted = Object.values(sa!.snapshot.materialData!.records).find(r => r.intent.kind === 'value' && r.intent.value.appearance.lighting === 'unlit')!.id;
    radios.find(r => r.value === wanted)!.fire('change'); button(panel, '選んだ設定を残す').fire('click');
    expect(Object.values(sa!.snapshot.materialData!.records).filter(r => r.lifecycle.kind === 'value' && r.lifecycle.value.state === 'active')).toHaveLength(1);
    expect(syntheticDisplay(sa!.snapshot, f.overview, null, null).materials![f.equipment]).toMatchObject({ unlit: true, doubleSided: false });
    b!.receive(a!.exportUpdate()); expect(a!.read().cells).toEqual(b!.read().cells); team.dispose();
  });

  it('copies confirmed effective material onto a fresh independent model in this Scene only, retaining original resources and retry bytes', () => {
    const { a, b, sa, group } = modelConflict(); materialSelection(sa, f.structure, 'project'); materialApply(sa, 'lighting', 'unlit');
    materialSelection(sa, f.structure, 'scene'); materialApply(sa, 'doubleSided', 'double');
    const before = projectHistory(a.read()), source = before.modelVersions!.find(v => v.assetId === f.structure)!.closure;
    const copy = { edgeId: group.edges[1]!.id, membershipId: freshId('sam'), ids: allocateModelCopyIds(fixtureModelIds(source), freshId), materialOverrideId: freshId('ovr') };
    const p = planMembershipResolution(a.read(), group, group.edges[0]!.id, 'both', freshId('evt'), [], [copy]);
    const retryHistory: DevelopmentHistory = { ...a, write: () => { throw new Error('injected'); } };
    expect(() => applyMembershipResolution(retryHistory, p)).toThrow('injected');
    expect(a.read().token).toBe(p.token); const originalCommand = canonicalFixture(p.changes); applyMembershipResolution(a, p);
    expect(canonicalFixture(p.changes)).toBe(originalCommand); const after = projectHistory(a.read());
    const originalMaterialIds = Object.keys(before.resources.materials);
    originalMaterialIds.forEach(id => expect(after.resources.materials[id]).toEqual(before.resources.materials[id]));
    expect(after.resources.captions).toEqual(before.resources.captions);
    const copied = after.materialData!.records[copy.materialOverrideId]!;
    expect(copied.routing).toMatchObject({ value: { scope: { kind: 'scene', sceneId: f.detail }, target: { assetId: copy.ids.asset, variantFamilyId: copy.ids.family,
      materialLayoutId: copy.ids.layout, logicalMaterialSlotId: copy.ids.slot } } });
    expect(copied.intent).toEqual({ kind: 'value', value: materialCopyIntent(before.materialData, f.detail, source) });
    expect(syntheticDisplay(after, f.detail, null, null).materials![copy.ids.asset]).toMatchObject({ unlit: true, doubleSided: true });
    expect(syntheticDisplay(after, f.overview, null, null).materials![f.structure]).toMatchObject({ unlit: true, doubleSided: false });
    sa.refreshHistory(); materialSelection(sa, copy.ids.asset); materialApply(sa, 'lighting', 'lit');
    expect(syntheticDisplay(sa.snapshot, f.detail, null, null).materials![f.structure]).toMatchObject({ unlit: true, doubleSided: true });
    b.receive(a.exportUpdate()); expect(a.read().cells).toEqual(b.read().cells);
    const sent = bytes(a.exportUpdate()); expect(a.receive(b.exportUpdate()).added).toBe(0); expect(bytes(a.exportUpdate())).toEqual(sent);
    const unresolved = { ...before.materialData!, records: Object.fromEntries(Object.entries(before.materialData!.records).map(([id, r]) => [id, { ...r, intent: { kind: 'unresolved' as const, reason: 'conflict' as const } }])) };
    expect(() => materialCopyIntent(unresolved, f.detail, source)).toThrow('競合');
  });

  it('names simultaneous material conflicts by exact model, scope and surface; unresolved routing never acquires a guessed target', () => {
    const doc = new RecordedDocument(), team = createTeamWorkspace(doc.asDocument(), factory), [sa, sb] = team.sessions, [a, b] = team.histories;
    materialSelection(sa!, f.equipment); materialApply(sa!, 'lighting', 'unlit');
    materialSelection(sa!, f.structure, 'project'); materialApply(sa!, 'lighting', 'unlit');
    const ids = Object.keys(sa!.snapshot.materialData!.records); b!.receive(a!.exportUpdate());
    for (const id of ids) {
      a!.write(a!.read().token, { [materialKey(id, 'appearance')]: canonicalFixture({ lighting: 'lit' }) });
      b!.write(b!.read().token, { [materialKey(id, 'appearance')]: canonicalFixture({ lighting: 'unlit', doubleSided: true }) });
    }
    a!.receive(b!.exportUpdate()); sa!.refreshHistory(); team.render();
    const panel = label(record(team.root), '更新の競合');
    const subjects = descendants(panel).filter(n => n.tag === 'legend').map(n => n.textContent);
    expect(subjects).toHaveLength(2); expect(new Set(subjects).size).toBe(2);
    expect(subjects.some(s => s.includes(sa!.snapshot.modelNames[f.equipment]!) && s.includes('全体') && s.includes('面の識別'))).toBe(true);
    expect(subjects.some(s => s.includes(sa!.snapshot.modelNames[f.structure]!) && s.includes('プロジェクト共通'))).toBe(true);
    const choices = descendants(panel).filter(n => n.type === 'radio'); expect(new Set(choices.map(n => n.attributes.get('aria-label'))).size).toBe(4);
    const id = ids[0]!, route = sa!.snapshot.materialData!.records[id]!.routing; if (route.kind !== 'value') throw new Error('routing');
    b!.receive(a!.exportUpdate());
    a!.write(a!.read().token, { [materialKey(id, 'routing')]: canonicalFixture({ ...route.value, scope: { kind: 'project' } }) });
    b!.write(b!.read().token, { [materialKey(id, 'routing')]: canonicalFixture({ ...route.value, scope: { kind: 'scene', sceneId: f.detail } }) });
    a!.receive(b!.exportUpdate()); sa!.refreshHistory(); team.render();
    expect(descendants(panel).filter(n => n.tag === 'legend').some(n => n.textContent.includes(`適用先を確認 — 設定 ${id}`))).toBe(true);
    expect(descendants(panel).filter(n => n.type === 'radio').every(n => !n.checked)).toBe(true); team.dispose();
  });
  const viewPayload = (): DisplayCapture => ({ camera: { position: [1, 2, 10], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 0.7 } },
    background: { kind: 'solid', colorSrgb: [0.1234567, 0.42, 0.83] } });
  const viewRuntime = (s: SyntheticSession): ViewRuntime => ({ kind: 'ready', token: 'runtime-1', sceneId: s.sceneId, projectFrameId: s.snapshot.resources.projectFrameId,
    projection: 'perspective', axis: null, bounds: { kind: 'value', value: 'available' } });
  const viewContext = (s: SyntheticSession) => s.views.context(viewRuntime(s), null);
  const authorContext = (s: SyntheticSession): ViewAuthorContext => s.views.authorContext(viewContext(s), viewPayload);
  const author = (s: SyntheticSession, kind: 'new' | 'edit' | 'capture' | 'apply') => s.views.acceptAuthor(planViewAuthor(authorContext(s), { kind }), authorContext(s));
  const viewName = (s: SyntheticSession, name: string) => { const c = authorContext(s); return s.views.acceptAuthor({ kind: 'input', baseDraft: c.draft!, draft: editViewName(c.draft!, name) }, c); };
  const chooseView = (s: SyntheticSession, viewId: string) => s.views.accept(planView(viewContext(s), { kind: 'select', viewId }), viewContext(s), () => {});

  it('keeps exact per-field causal versions through no-conflict, unrelated writes, same-value writes, equal concurrent candidates and choice', () => {
    const [a, b] = pair(), key = captionKey(f.shared, 'title'), initial = a.read();
    a.write(initial.token, { [captionKey(f.shared, 'body')]: 'Independent' });
    expect(a.read().cellVersions![key]).toBe(initial.cellVersions![key]);
    const text = (initial.cells[key] as { value: string }).value;
    a.write(a.read().token, { [key]: text }); expect(a.read().cellVersions![key]).not.toBe(initial.cellVersions![key]);
    b.write(b.read().token, { [key]: text }); a.receive(b.exportUpdate());
    const conflict = a.read().cells[key]!; expect(conflict.kind).toBe('conflict'); if (conflict.kind !== 'conflict') throw new Error('conflict');
    expect(conflict.candidates).toHaveLength(2); expect(new Set(conflict.candidates.map(c => c.value)).size).toBe(1);
    const before = a.read().cellVersions![key]; a.choose(a.read().token, key, conflict.candidates[0]!.id);
    expect(a.read().cells[key]).toEqual({ kind: 'value', value: text }); expect(a.read().cellVersions![key]).not.toBe(before);
  });

  it('creates and exchanges a whole View; sparse rename/capture merge, stale capture retains draft, typed camera choice and second round preserve bytes', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    expect(author(sa, 'new')).toBe(true); expect(viewName(sa, '入口')).toBe(true); expect(author(sa, 'apply')).toBe(true);
    const id = viewContext(sa).memory.selectedViewId!; b.receive(a.exportUpdate()); sb.refreshHistory(); chooseView(sb, id);
    const key = viewKey(id, 'camera'), bg = viewKey(id, 'background'), nameKey = viewKey(id, 'name'), initial = a.read();
    expect(author(sa, 'edit')).toBe(true); expect(viewName(sa, '正面')).toBe(true); expect(author(sa, 'apply')).toBe(true);
    expect(a.read().cellVersions![key]).toBe(initial.cellVersions![key]); expect(a.read().cellVersions![bg]).toBe(initial.cellVersions![bg]);
    expect(author(sb, 'edit')).toBe(true); expect(author(sb, 'capture')).toBe(true);
    b.receive(a.exportUpdate()); sb.refreshHistory(); expect(author(sb, 'apply')).toBe(true); // unrelated rename does not stale capture
    a.receive(b.exportUpdate()); sa.refreshHistory();
    expect(a.read().cells[nameKey]).toEqual({ kind: 'value', value: '正面' }); expect(a.read().cells[key]).toEqual({ kind: 'value', value: canonicalFixture(viewPayload().camera) });
    expect(author(sa, 'edit')).toBe(true); expect(author(sa, 'capture')).toBe(true); const draft = authorContext(sa).draft;
    b.write(b.read().token, { [key]: canonicalFixture(viewPayload().camera) }); a.receive(b.exportUpdate()); sa.refreshHistory();
    expect(author(sa, 'apply')).toBe(false); expect(authorContext(sa).draft).toBe(draft); expect(authorContext(sa).feedback).toMatchObject({ kind: 'failed' });
    expect(sa.views.acceptAuthor({ kind: 'cancel', draft: draft! }, authorContext(sa))).toBe(true);
    const alternate = { ...viewPayload().camera, position: [4, 5, 6] };
    a.write(a.read().token, { [key]: canonicalFixture(alternate) });
    b.write(b.read().token, { [key]: canonicalFixture({ ...alternate, position: [6, 5, 4] }) }); a.receive(b.exportUpdate()); sa.refreshHistory();
    expect(viewContext(sa).source).toMatchObject({ kind: 'ready' });
    expect(planView(viewContext(sa), { kind: 'recall' }).kind).toBe('blocked');
    const cell = a.read().cells[key]!; if (cell.kind !== 'conflict') throw new Error('conflict');
    a.choose(a.read().token, key, cell.candidates[0]!.id); b.receive(a.exportUpdate());
    expect(a.read().cells).toEqual(b.read().cells); const sent = bytes(a.exportUpdate());
    expect(a.receive(b.exportUpdate()).added).toBe(0); expect(bytes(a.exportUpdate())).toEqual(sent);
  });

  it('retains the exact fresh View command/capture after failure; rejects partial, wrong-Scene, malformed and identity rewrites before publication', () => {
    const [a] = pair(), commands: Readonly<Record<string, string>>[] = []; let reject = true;
    const authority = historyAuthority(a), s = new SyntheticSession({ read: authority.read, write: (token, changes) => {
      commands.push(changes); if (reject) throw new Error('injected failure'); return authority.write(token, changes);
    } });
    author(s, 'new'); viewName(s, '入口'); const held = authorContext(s).draft;
    expect(author(s, 'apply')).toBe(false); expect(authorContext(s).draft).toBe(held); expect(s.pending).toBe('text');
    reject = false; expect(author(s, 'apply')).toBe(true); expect(commands[1]).toBe(commands[0]);
    const id = viewContext(s).memory.selectedViewId!, initial = a.read();
    for (const changes of [
      { [viewKey(freshId('view'), 'name')]: 'partial' },
      { [entryKey(f.detail)]: canonicalFixture(id) },
      { [viewKey(id, 'camera')]: canonicalFixture({ ...viewPayload().camera, up: [0, 0, 0] }) },
      { [viewKey(id, 'identity')]: canonicalFixture({ id, sceneId: f.detail, projectFrameId: s.snapshot.resources.projectFrameId }) },
    ]) { expect(() => a.write(a.read().token, changes)).toThrow(); expect(a.read()).toEqual(initial); }
  });

  it('preserves existing membership-copy workflows after adding a View and does not clear entry failure with camera success', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    author(sa, 'new'); viewName(sa, '入口'); expect(author(sa, 'apply')).toBe(true); const id = viewContext(sa).memory.selectedViewId!;
    b.receive(a.exportUpdate()); sb.refreshHistory();
    const wanted = planView(viewContext(sa), { kind: 'chooseEntry', viewId: id }); expect(sa.views.accept(wanted, viewContext(sa), () => {})).toBe(true);
    b.write(b.read().token, { [entryKey(f.overview)]: 'null' }); a.receive(b.exportUpdate()); sa.refreshHistory();
    expect(sa.views.accept(planView(viewContext(sa), { kind: 'applyEntry' }), viewContext(sa), () => {})).toBe(false);
    const failure = viewContext(sa).entryFeedback;
    expect(sa.views.accept(planView(viewContext(sa), { kind: 'fit' }), viewContext(sa), () => {})).toBe(true);
    expect(viewContext(sa).entryFeedback).toEqual(failure); expect(failure.kind).toBe('failed');
    sa.views.accept(planView(viewContext(sa), { kind: 'cancelEntry' }), viewContext(sa), () => {});
    sb.refreshHistory(); enterDetail(sa); enterDetail(sb); includeCaption(sa); includeCaption(sb); a.receive(b.exportUpdate()); sa.refreshHistory();
    const group = duplicateMemberships(a.read()).find(g => g.kind === 'caption')!;
    const kept = resolution(a, group, group.edges[0]!.id, 'both'); applyMembershipResolution(a, kept);
    expect(a.read().cells[viewKey(id, 'camera')]).toEqual({ kind: 'value', value: canonicalFixture(viewPayload().camera) });
    expect(duplicateMemberships(a.read())).toHaveLength(0);
  });

  it('mounts Saved View creation and two-actor conflict choice in the same UI without a default camera winner', () => {
    const doc = new RecordedDocument(), team = createTeamWorkspace(doc.asDocument(), factory, () => ({ update() {}, setActive() {},
      read: () => ({ token: 'camera-1', ready: true, issue: null, dragging: false, projection: 'perspective', axis: null, pins: [] }),
      capture: viewPayload, recall() {}, camera() {}, retry() {}, dispose() {} }));
    const root = record(team.root), actor = label(root, '操作する人'); let workspace = visibleWorkspace(root);
    button(workspace, '視点').fire('click'); button(workspace, '視点を作る').fire('click');
    const input = label(workspace, '視点の名称'); input.value = '入口'; input.fire('input'); button(workspace, '視点を追加').fire('click');
    const id = viewContext(team.sessions[0]!).memory.selectedViewId!; expect(id).toMatch(/^view_/);
    actor.value = '1'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click');
    const [a, b] = team.histories, key = viewKey(id, 'camera');
    a!.write(a!.read().token, { [key]: canonicalFixture({ ...viewPayload().camera, position: [3, 4, 5] }) });
    b!.write(b!.read().token, { [key]: canonicalFixture({ ...viewPayload().camera, position: [5, 4, 3] }) });
    button(root, '相手の更新を受け取る').fire('click'); const panel = label(root, '更新の競合');
    expect(descendants(panel).some(n => n.tag === 'legend' && n.textContent === '入口 — カメラ')).toBe(true);
    const radios = descendants(panel).filter(n => n.tag === 'input' && n.type === 'radio'); expect(radios).toHaveLength(2);
    expect(radios.every(n => !n.checked)).toBe(true); expect(button(panel, '選んだ内容を使用').disabled).toBe(true);
    radios[0]!.fire('change'); button(panel, '選んだ内容を使用').fire('click');
    expect(b!.read().cells[key]!.kind).toBe('value'); actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click');
    expect(a!.read().cells[key]).toEqual(b!.read().cells[key]); team.dispose();
  });
  it('copies the exact model closure once, moves only the copy and converges through a second exchange', () => {
    const { a, b, sa, sb, group } = modelConflict(), before = projectHistory(a.read()), base = a.exportUpdate().base;
    const source = sa.modelVersions.find(v => v.assetId === f.structure)!.closure, plan = modelResolution(a, group), copy = plan.modelCopies[0]!;
    const oldBytes = bytes(a.exportUpdate());
    expect(() => applyMembershipResolution({ ...a, write: () => { throw new Error('injected refusal'); } }, plan)).toThrow('injected');
    expect(bytes(a.exportUpdate())).toEqual(oldBytes); applyMembershipResolution(a, plan);
    expect(a.exportUpdate().changes).toHaveLength(oldBytes.length + 1);
    const result = projectHistory(a.read()), closure = result.modelVersions!.find(v => v.assetId === copy.ids.asset)!.closure;
    expect(result.resources.assets[copy.ids.asset]!.lifecycle).toEqual({ kind: 'value', value: { state: 'active', eventId: plan.eventId, reason: 'conflictResolution' } });
    expect(Object.values(copy.ids).some(id => Object.values(fixtureModelIds(source)).includes(id))).toBe(false);
    expect(closure.binding.assetToProject).toEqual(source.binding.assetToProject);
    expect(closure.representation.representationToAsset).toEqual(source.representation.representationToAsset);
    expect(closure.representation.logicalBoundsAsset).toEqual(source.representation.logicalBoundsAsset);
    expect(closure.representation.materialCatalog.slots[0]!.sourceSemantics).toEqual(source.representation.materialCatalog.slots[0]!.sourceSemantics);
    expect(closure.representation.blob).toEqual(source.representation.blob);
    expect(closure.representation.blob.digest).toBe(createHash('sha256').update(fixtureModelBytes(closure.shape)).digest('hex'));
    for (const [kind, record] of [['representation', closure.representation], ['asset-revision', closure.revision], ['asset-binding-revision', closure.binding]] as const) {
      const { payloadDigest, ...payload } = record;
      expect(payloadDigest).toBe(createHash('sha256').update(`lociview:v2:immutable:${kind}:jcs-v1\n${canonicalFixture(payload)}`).digest('hex'));
    }
    expect(result.resources.captions).toEqual(before.resources.captions);
    expect(result.state.captionMemberships).toEqual(before.state.captionMemberships);
    expect(Object.values(result.state.assetMemberships).filter(e => e.resourceId === copy.ids.asset).map(e => e.sceneId)).toEqual([f.detail]);
    for (const edge of Object.values(before.state.assetMemberships).filter(e => e.sceneId !== f.detail)) expect(result.state.assetMemberships[edge.id]).toEqual(edge);
    b.receive(a.exportUpdate()); sa.refreshHistory(); sb.refreshHistory();
    expect(sb.acceptModel(planModelList(sb.modelContext(), { kind: 'select', assetId: copy.ids.asset }))).toBe(true);
    expect(sb.beginModelPlacement()).toBe(true); sb.changeModelPlacement(['9', '8', '7']); expect(sb.finishModelPlacement()).toBe(true);
    const moved = sb.modelUpdateContext().current!.closure;
    expect(moved.binding.parentBindingId).toBe(closure.binding.id); expect(moved.binding.assetToProject.translation).toEqual([9, 8, 7]);
    expect(moved.binding.assetToProject.rotationXYZW).toEqual(closure.binding.assetToProject.rotationXYZW);
    expect(moved.binding.assetToProject.uniformScale).toBe(closure.binding.assetToProject.uniformScale);
    expect(moved.revision).toEqual(closure.revision); expect(moved.representation).toEqual(closure.representation);
    expect(sb.snapshot.resources.assets[f.structure]).toEqual(before.resources.assets[f.structure]);
    select(sa); draft(sa, 'body', '別の参加者の追記'); apply(sa);
    const ua = a.exportUpdate(), ub = b.exportUpdate(); a.receive(ub); b.receive(ua);
    expect(a.read()).toEqual(b.read()); expect(a.exportUpdate().base).toEqual(base);
    const n = a.exportUpdate().changes.length; expect(a.receive(ub).added).toBe(0); expect(a.exportUpdate().changes).toHaveLength(n);
    for (const original of [...oldBytes, ...bytes(ub)]) expect(bytes(a.exportUpdate())).toContain(original);
    expect(() => applyMembershipResolution(a, plan)).toThrow('更新');
    expect(Object.keys(projectHistory(a.read()).resources.assets)).toHaveLength(3);
  });

  it('refuses incomplete, colliding, rewritten and unsupported model closures before publication', () => {
    const { a, group } = modelConflict(), plan = modelResolution(a, group), copy = plan.modelCopies[0]!, before = a.read();
    const planCopy = (ids: typeof copy.ids) => planMembershipResolution(before, group, plan.originalEdgeId, 'both', plan.eventId, [], [{ ...copy, ids }]);
    expect(() => planCopy({ ...copy.ids, assetFrame: fixtureModelIds(syntheticVersions[0]!.closure).assetFrame })).toThrow();
    expect(() => planCopy({ ...copy.ids, representationFrame: copy.ids.assetFrame })).toThrow();
    const partial = { ...plan.changes }; delete partial[modelClosureKey(copy.ids.binding)];
    expect(() => a.write(before.token, partial)).toThrow(); expect(a.read()).toEqual(before);
    const closureText = plan.changes[modelClosureKey(copy.ids.binding)]!, clean = readFixtureModel(closureText);
    for (const mutate of [
      (c: any) => { c.representation.blob.digest = '0'.repeat(64); },
      (c: any) => { c.binding.payloadDigest = '0'.repeat(64); },
      (c: any) => { c.representation.assetId = f.equipment; },
      (c: any) => { c.representation.derivedFrom = [syntheticVersions[0]!.projection.revisionId]; },
      (c: any) => { c.revision.materialCompatibilityMaps = []; },
      (c: any) => { c.binding.assetToProject.uniformScale = 0; },
    ]) {
      const broken = JSON.parse(closureText); mutate(broken);
      expect(() => a.write(before.token, { ...plan.changes, [modelClosureKey(copy.ids.binding)]: canonicalFixture(broken) })).toThrow();
      expect(a.read()).toEqual(before);
    }
    applyMembershipResolution(a, plan);
    expect(() => a.write(a.read().token, { [modelClosureKey(copy.ids.binding)]: canonicalFixture({ ...clean, shape: 'updated' }) })).toThrow();
    const s = new SyntheticSession(historyAuthority(a)); s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: copy.ids.asset }));
    expect(s.beginModelPlacement()).toBe(true); s.changeModelPlacement(['1', '2', '3']); expect(s.finishModelPlacement()).toBe(true);
    expect(() => remapFixtureModel(s.modelUpdateContext().current!.closure, allocateModelCopyIds(copy.ids, freshId))).toThrow('未接続');
  });

  it('retains a placement draft and exact binding on retry, refuses stale apply, and preserves placement during content update', () => {
    const [a] = pair(), writes: Readonly<Record<string, string>>[] = []; let fail = true;
    const wrapped: DevelopmentHistory = { ...a, write(token, changes) {
      writes.push(changes); if (fail) { fail = false; throw new Error('injected'); } return a.write(token, changes);
    } };
    const s = new SyntheticSession(historyAuthority(wrapped)); s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: f.equipment }));
    expect(s.beginModelPlacement()).toBe(true); s.changeModelPlacement(['6', '5', '4']);
    expect(s.finishModelPlacement()).toBe(false); const prepared = s.modelPlacement!.prepared; expect(prepared).toBeDefined();
    expect(s.finishModelPlacement()).toBe(true); expect(writes[1]).toEqual(writes[0]);
    expect(updateModel(s)).toBe(true); expect(s.modelUpdateContext().current!.closure.binding.assetToProject.translation).toEqual([6, 5, 4]);
    expect(s.modelUpdateContext().current!.closure.revision.id).toBe(versions[1]!.closure.revision.id);
    expect(s.beginModelPlacement()).toBe(true); s.changeModelPlacement(['1', '2', '3']);
    a.write(a.read().token, { [captionKey(f.shared, 'body')]: '更新' }); s.refreshHistory();
    const current = a.read(); expect(s.finishModelPlacement()).toBe(false); expect(a.read()).toEqual(current);
    expect(s.modelPlacement!.coordinates).toEqual(['1', '2', '3']); expect(s.finishModelPlacement(true)).toBe(true);
  });

  it('mounts model keep-both and copy translation with visible cancellation across tabs and pending/IME guards', () => {
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), factory), root = record(team.root), actor = label(root, '操作する人');
    for (const who of ['0', '1']) {
      actor.value = who; actor.fire('change'); const workspace = visibleWorkspace(root), scenes = label(workspace, 'シーン');
      button(scenes, '設備の確認').fire('click'); button(workspace, 'モデル').fire('click');
      const s = team.sessions[Number(who)]!; expect(toggle(s, f.structure, true)).toBe(true); team.render();
    }
    button(root, '相手の更新を受け取る').fire('click'); const panel = label(root, '更新の競合');
    expect(button(panel, '別々のモデルとして残す').disabled).toBe(true);
    descendants(panel).filter(node => node.type === 'radio')[1]!.fire('change'); button(panel, '別々のモデルとして残す').fire('click');
    const workspace = visibleWorkspace(root), s = team.sessions[1]!, copyId = Object.keys(s.snapshot.resources.assets).find(id => id !== f.equipment && id !== f.structure)!;
    button(label(workspace, 'プロジェクトのモデル一覧'), s.snapshot.modelNames[copyId]!).fire('click'); button(workspace, 'モデルの位置を編集').fire('click');
    const strip = label(workspace, 'モデル配置・開発用'), x = label(strip, 'X'); expect(strip.hidden).toBe(false);
    x.value = '9'; x.fire('input'); x.fire('compositionstart');
    expect(button(strip, '配置を確定').disabled).toBe(true); expect(button(strip, '配置を取り消す').disabled).toBe(true);
    expect(actor.disabled).toBe(true); expect(button(root, '相手の更新を受け取る').disabled).toBe(true);
    x.fire('compositionend'); button(workspace, 'キャプション').fire('click'); expect(strip.hidden).toBe(false); expect(x.value).toBe('9');
    button(strip, '配置を確定').fire('click'); expect(strip.hidden).toBe(true); expect(actor.disabled).toBe(false);
    expect(s.modelUpdateContext().current!.closure.binding.assetToProject.translation[0]).toBe(9);
    actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click');
    expect(team.histories[0].read()).toEqual(team.histories[1].read()); team.dispose();
  });

  it('resolves concurrent Caption inclusion into independently editable copies in one causal change, then exchanges again', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    const before = sa.snapshot, base = a.exportUpdate().base;
    enterDetail(sa); enterDetail(sb); includeCaption(sa); includeCaption(sb);
    const originalA = a.exportUpdate(), originalB = b.exportUpdate(); a.receive(originalB); b.receive(originalA); sa.refreshHistory(); sb.refreshHistory();
    expect(sa.composition.captions.some(c => c.captionId === f.second)).toBe(false);
    const group = duplicateMemberships(a.read())[0]!;
    const plan = resolution(a, group, group.edges[1]!.id, 'both'), copy = plan.copies[0]!;
    const oldBytes = bytes(a.exportUpdate());
    // A failed publication retains the exact planned IDs/content, not a partial resource.
    expect(() => applyMembershipResolution({ ...a, write: () => { throw new Error('injected refusal'); } }, plan)).toThrow('injected');
    expect(bytes(a.exportUpdate())).toEqual(oldBytes);
    applyMembershipResolution(a, plan); expect(a.exportUpdate().changes).toHaveLength(oldBytes.length + 1);
    const next = projectHistory(a.read()); expect(duplicateMemberships(a.read())).toHaveLength(0);
    expect(next.resources.captions[copy.captionId]).toMatchObject({ title: before.resources.captions[f.second]!.title,
      body: before.resources.captions[f.second]!.body, anchor: before.resources.captions[f.second]!.anchor });
    expect(next.colors[copy.captionId]).toEqual(before.colors[f.second]);
    expect(Object.values(next.state.captionMemberships).filter(e => e.resourceId === copy.captionId).map(e => e.sceneId)).toEqual([f.detail]);
    for (const edge of Object.values(before.state.captionMemberships)) expect(next.state.captionMemberships[edge.id]).toEqual(edge);
    expect(() => applyMembershipResolution(a, plan)).toThrow('更新'); expect(a.exportUpdate().changes).toHaveLength(oldBytes.length + 1);
    b.receive(a.exportUpdate()); sa.refreshHistory(); sb.refreshHistory();
    sa.acceptList(planCaptionList(sa.captionContext(), { kind: 'select', captionId: f.second })); draft(sa, 'body', '元だけの本文'); apply(sa);
    sb.acceptList(planCaptionList(sb.captionContext(), { kind: 'select', captionId: copy.captionId })); draft(sb, 'body', 'コピーだけの本文'); apply(sb);
    expect(toggle(sb, f.structure, true)).toBe(true); movePin(sb, ['4', '5', '6']);
    const updateA = a.exportUpdate(), updateB = b.exportUpdate(); a.receive(updateB); b.receive(updateA);
    expect(a.read()).toEqual(b.read()); const result = projectHistory(a.read());
    expect(result.resources.captions[f.second]!.body).toEqual({ kind: 'value', value: '元だけの本文' });
    expect(result.resources.captions[copy.captionId]!.body).toEqual({ kind: 'value', value: 'コピーだけの本文' });
    expect(result.resources.captions[f.second]!.anchor).toEqual(before.resources.captions[f.second]!.anchor);
    expect(result.resources.captions[copy.captionId]!.anchor).not.toEqual(result.resources.captions[f.second]!.anchor);
    const old = a.read(); expect(a.receive(updateB).added).toBe(0); expect(a.read()).toEqual(old); expect(a.exportUpdate().base).toEqual(base);
    for (const source of [...bytes(originalA), ...bytes(originalB)]) expect(bytes(a.exportUpdate())).toContain(source);
  });

  it('keeps the exact selected model edge without creating model copies or affecting other Scenes', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    enterDetail(sa); enterDetail(sb); expect(toggle(sa, f.structure, true)).toBe(true); expect(toggle(sb, f.structure, true)).toBe(true);
    a.receive(b.exportUpdate()); const before = projectHistory(a.read()), group = duplicateMemberships(a.read())[0]!;
    expect(() => resolution(a, group, group.edges[0]!.id, 'both')).toThrow('コピーする項目');
    const plan = resolution(a, group, group.edges[1]!.id, 'one'); applyMembershipResolution(a, plan);
    const after = projectHistory(a.read()); expect(after.resources.assets).toEqual(before.resources.assets);
    expect(after.state.assetMemberships[plan.originalEdgeId]).toEqual(before.state.assetMemberships[plan.originalEdgeId]);
    expect(duplicateMemberships(a.read())).toHaveLength(0);
    expect(Object.values(after.state.assetMemberships).filter(edge => edge.sceneId === f.overview)).toEqual(
      Object.values(before.state.assetMemberships).filter(edge => edge.sceneId === f.overview));
  });

  it('rejects unresolved copy content, invalid maps, partial copy publication and altered immutable copy identity', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    enterDetail(sa); enterDetail(sb); includeCaption(sa); includeCaption(sb);
    a.write(a.read().token, { [captionKey(f.second, 'title')]: '片方' }); b.write(b.read().token, { [captionKey(f.second, 'title')]: 'もう片方' });
    a.receive(b.exportUpdate()); const group = duplicateMemberships(a.read())[0]!, before = a.read();
    expect(() => resolution(a, group, group.edges[0]!.id, 'both')).toThrow('内容の競合'); expect(a.read()).toEqual(before);
    const conflict = a.read().cells[captionKey(f.second, 'title')]; if (conflict?.kind !== 'conflict') throw new Error('missing conflict');
    a.choose(a.read().token, captionKey(f.second, 'title'), conflict.candidates[0]!.id);
    const current = duplicateMemberships(a.read())[0]!, plan = resolution(a, current, current.edges[0]!.id, 'both'), copy = plan.copies[0]!;
    expect(() => planMembershipResolution(a.read(), current, plan.originalEdgeId, 'both', plan.eventId,
      [{ ...copy, captionId: f.second }])).toThrow();
    const incomplete = { ...plan.changes }; delete incomplete[captionKey(copy.captionId, 'anchor')]; const untouched = a.read();
    expect(() => a.write(a.read().token, incomplete)).toThrow(); expect(a.read()).toEqual(untouched);
    expect(() => applyMembershipResolution(a, { ...plan, changes: incomplete })).toThrow(); expect(a.read()).toEqual(untouched);
    applyMembershipResolution(a, plan); const applied = a.read();
    expect(() => a.write(a.read().token, { [captionKey(copy.captionId, 'template')]: JSON.stringify({ templateId: f.second,
      sourceId: f.second, eventId: freshId('evt') }) })).toThrow('識別情報'); expect(a.read()).toEqual(applied);
  });

  it('reopens a conflict for an unseen later membership instead of coalescing equal endpoints', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    enterDetail(sa); enterDetail(sb); includeCaption(sa); includeCaption(sb); a.receive(b.exportUpdate());
    const group = duplicateMemberships(a.read())[0]!, bEdge = Object.values(sb.snapshot.state.captionMemberships).find(edge => edge.sceneId === f.detail && edge.resourceId === f.second)!;
    const plan = resolution(a, group, group.edges.find(edge => edge.id !== bEdge.id)!.id, 'one'); applyMembershipResolution(a, plan);
    // B has not observed A's resolution: remove its own edge and include the resource again.
    b.write(b.read().token, { [membershipKey(bEdge.id)]: JSON.stringify({ ...bEdge,
      lifecycle: { kind: 'value', value: { state: 'deleted', eventId: freshId('evt'), reason: 'userDelete' } } }) });
    sb.refreshHistory(); includeCaption(sb); a.receive(b.exportUpdate());
    expect(duplicateMemberships(a.read()).some(g => g.resourceId === f.second)).toBe(true);
    const resolved = projectHistory(a.read()); const scene = resolveScene(resolved.state, resolved.resources, f.detail);
    expect(scene.kind === 'ready' && scene.composition.captions.some(c => c.captionId === f.second)).toBe(false);
  });

  it('mounts the existing inclusion picker and requires an explicit original before independent keep-both', () => {
    const copyWrites: Readonly<Record<string, string>>[] = []; let refuseCopy = true;
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), (seed, validate) => {
      const [a, b] = factory(seed, validate);
      const wrap = (history: DevelopmentHistory): DevelopmentHistory => ({ ...history, write(token, changes) {
        if (Object.keys(changes).some(key => key.endsWith('/template'))) {
          copyWrites.push(changes); if (refuseCopy) { refuseCopy = false; throw new Error('injected copy refusal'); }
        }
        return history.write(token, changes);
      } });
      return [wrap(a), wrap(b)];
    }), root = record(team.root);
    const actor = label(root, '操作する人');
    for (const who of ['0', '1']) {
      actor.value = who; actor.fire('change'); const workspace = visibleWorkspace(root), scenes = label(workspace, 'シーン');
      button(scenes, '設備の確認').fire('click');
      const picker = by(workspace, node => node.className === 'lv-caption-include'), select = label(picker, 'キャプション');
      select.value = f.second; select.fire('change'); button(picker, 'このシーンに追加').fire('click');
    }
    button(root, '相手の更新を受け取る').fire('click');
    const panel = label(root, '更新の競合'), both = button(panel, '別々のキャプションとして残す');
    expect(both.disabled).toBe(true);
    expect(descendants(panel).filter(node => node.type === 'radio').every(node => !node.checked)).toBe(true);
    const radios = descendants(panel).filter(node => node.type === 'radio'); expect(radios).toHaveLength(2);
    radios[1]!.fire('change'); expect(both.disabled).toBe(false);
    const before = team.histories[1].read(); actor.value = '0'; actor.fire('change'); both.fire('click');
    expect(team.histories[1].read()).toEqual(before); // detached, actor-bound handler cannot act on the old party.
    actor.value = '1'; actor.fire('change');
    const current = label(root, '更新の競合'); descendants(current).filter(node => node.type === 'radio')[1]!.fire('change');
    button(current, '別々のキャプションとして残す').fire('click');
    expect(team.histories[1].read()).toEqual(before); expect(copyWrites).toHaveLength(1);
    button(label(root, '更新の競合'), '別々のキャプションとして残す').fire('click');
    expect(copyWrites).toHaveLength(2); expect(copyWrites[1]).toBe(copyWrites[0]);
    expect(Object.keys(team.sessions[1]!.snapshot.resources.captions)).toHaveLength(3);
    expect(team.sessions[1]!.composition.captions).toHaveLength(3); expect(duplicateMemberships(team.histories[1].read())).toHaveLength(0);
    actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click');
    expect(team.histories[0].read()).toEqual(team.histories[1].read()); team.dispose();
  });

  it('refuses a prepared membership resolution after an unrelated update without reusing fresh IDs', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    enterDetail(sa); enterDetail(sb); includeCaption(sa); includeCaption(sb); a.receive(b.exportUpdate());
    const group = duplicateMemberships(a.read())[0]!, plan = resolution(a, group, group.edges[0]!.id, 'both');
    a.write(a.read().token, { [captionKey(f.shared, 'body')]: '選択後の更新' }); const changed = a.read();
    expect(() => applyMembershipResolution(a, plan)).toThrow('更新'); expect(a.read()).toEqual(changed);
    expect(projectHistory(a.read()).resources.captions[plan.copies[0]!.captionId]).toBeUndefined();
  });

  it('carries a model update through both Scenes, retains participant work, explicitly repairs a pin and exchanges a second round', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    select(sa); select(sb); const original = sb.snapshot, base = a.exportUpdate().base;
    draft(sb, 'body', '手元で編集した本文'); apply(sb); const local = b.exportUpdate();
    draft(sb, 'title', '未適用の題'); const pending = sb.detailContext().draft;
    expect(updateModel(sa)).toBe(true); const update = a.exportUpdate();
    b.receive(update); sb.refreshHistory();
    expect(sb.detailContext().draft).toBe(pending); expect(sb.snapshot.state.assetMemberships).toEqual(original.state.assetMemberships);
    expect(sb.snapshot.resources.captions[f.shared]!.anchor).toEqual(original.resources.captions[f.shared]!.anchor);
    for (const sceneId of [f.overview, f.detail]) {
      const resolved = resolveScene(sb.snapshot.state, sb.snapshot.resources, sceneId);
      if (resolved.kind !== 'ready') throw new Error('scene blocked');
      expect(resolved.composition.assets.find(v => v.assetId === f.equipment)?.projection).toEqual(versions[1]!.projection);
      expect(resolved.composition.captions.find(c => c.captionId === f.shared)?.marker).toBe('needsReview');
    }
    expect(sb.composition.captions.find(c => c.captionId === f.second)?.marker).toBe('visible');
    apply(sb); expect(field(b, 'body')).toEqual({ kind: 'value', value: '手元で編集した本文' });
    expect(sb.acceptPin(planPinMode(sb.pinContext(), { kind: 'move' }))).toBe(true);
    sb.changePinCoordinates({ coordinates: ['1', '2', '3'], familyId: null });
    expect(planPinMode(sb.pinContext(), { kind: 'finish' }).kind).toBe('blocked');
    sb.changePinCoordinates({ coordinates: ['1', '2', '3'], familyId: versions[1]!.families[0]!.id });
    const beforeConfirm = bytes(b.exportUpdate()); expect(sb.snapshot.resources.captions[f.shared]!.anchor).toEqual(original.resources.captions[f.shared]!.anchor);
    expect(sb.acceptPin(planPinMode(sb.pinContext(), { kind: 'finish' }))).toBe(true);
    expect(b.exportUpdate().changes.length).toBe(beforeConfirm.length + 1);
    expect(sb.composition.captions.find(c => c.captionId === f.shared)?.marker).toBe('visible');
    const cell = b.read().cells[captionKey(f.shared, 'anchor')]; if (cell?.kind !== 'value') throw new Error('anchor missing');
    expect(JSON.parse(cell.value)).toEqual({ kind: 'asset', assetId: f.equipment, assetFrameId: versions[1]!.projection.assetFrameId,
      positionAsset: [1, 2, 3], authoredAssetRevisionId: versions[1]!.projection.revisionId,
      authoredAnchorCompatibilityId: versions[1]!.families[0]!.compatibilityId, hitEvidence: { method: 'manual' } });
    const contribution = b.exportUpdate(); a.receive(contribution); sa.refreshHistory();
    for (const bytesOriginal of [...bytes(local), ...bytes(update)]) expect(bytes(a.exportUpdate())).toContain(bytesOriginal);
    expect(sa.snapshot.resources.captions[f.shared]!.anchor).toEqual(sb.snapshot.resources.captions[f.shared]!.anchor);
    draft(sa, 'body', '次の往復の本文'); apply(sa); draft(sb, 'title', '次の往復の題'); apply(sb);
    const nextA = a.exportUpdate(), nextB = b.exportUpdate(); a.receive(nextB); b.receive(nextA);
    expect(a.read()).toEqual(b.read()); expect(a.exportUpdate().base).toEqual(base);
    const prior = a.read(); expect(a.receive(contribution).added).toBe(0); expect(a.read()).toEqual(prior);
  });

  it('keeps compatible anchors and refuses hidden, invalid or stale pin corrections without losing the proposal', () => {
    const [a] = pair(), session = new SyntheticSession(historyAuthority(a)); select(session);
    const old = session.snapshot.resources.captions[f.shared]!.anchor;
    expect(updateModel(session, versions[2]!)).toBe(true);
    expect(session.snapshot.resources.captions[f.shared]!.anchor).toEqual(old);
    expect(session.composition.captions.find(c => c.captionId === f.shared)?.marker).toBe('visible');
    expect(toggle(session, f.equipment, false)).toBe(true);
    expect(planPinMode(session.pinContext(), { kind: 'move' }).kind).toBe('blocked');
    expect(toggle(session, f.equipment, true)).toBe(true);
    expect(session.acceptPin(planPinMode(session.pinContext(), { kind: 'move' }))).toBe(true);
    const beforeInput = a.read(); session.changePinCoordinates({ coordinates: ['Infinity', '2', '3'], familyId: null });
    expect(planPinMode(session.pinContext(), { kind: 'finish' }).kind).toBe('blocked'); expect(a.read()).toEqual(beforeInput);
    session.changePinCoordinates({ coordinates: ['4', '5', '-0'], familyId: null });
    const finish = planPinMode(session.pinContext(), { kind: 'finish' }); expect(finish.kind).toBe('finish');
    expect(updateModel(session)).toBe(false); expect(toggle(session, f.equipment, false)).toBe(false);
    expect(session.acceptNavigation(planNavigation(session.snapshot.state, session.session, session.pending,
      { kind: 'scene', sceneId: f.detail }))).toBe(false);
    // Simulate a changed authoritative target below the UI's receive guard.
    const input = session.pinCoordinates; a.write(a.read().token, { [bindingKey(f.equipment)]: versions[1]!.projection.bindingId }); session.refreshHistory();
    const changed = a.read(); expect(session.acceptPin(finish)).toBe(false); expect(a.read()).toEqual(changed); expect(session.pinCoordinates).toBe(input);
    const ctx = session.pinContext(); expect(session.acceptPin(planPinMode(ctx, { kind: 'cancel', confirmedMode: ctx.memory.mode!, confirmedProposal: ctx.proposal }))).toBe(true);
    expect(a.read()).toEqual(changed); expect(session.pinCoordinates).toBeNull();
  });

  it.each(['binding', 'anchor'] as const)('retains whole %s conflicts with correctly labelled explicit UI choices', kind => {
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), factory), root = record(team.root);
    const [a, b] = team.histories, [sa, sb] = team.sessions; select(sa!); select(sb!);
    if (kind === 'binding') { expect(updateModel(sa!, versions[1]!)).toBe(true); expect(updateModel(sb!, versions[2]!)).toBe(true); }
    else { movePin(sa!, ['1', '2', '3']); movePin(sb!, ['4', '5', '6']); }
    a.receive(b.exportUpdate()); sa!.refreshHistory(); team.render();
    const key = kind === 'binding' ? bindingKey(f.equipment) : captionKey(f.shared, 'anchor');
    const conflict = a.read().cells[key]; expect(conflict?.kind).toBe('conflict');
    if (conflict?.kind !== 'conflict') throw new Error('conflict missing');
    if (kind === 'binding') expect(sa!.composition.assets.some(v => v.assetId === f.equipment)).toBe(false);
    else expect(sa!.snapshot.resources.captions[f.shared]!.anchor.kind).toBe('unresolved');
    expect(sa!.captionContext().source.kind).toBe('ready');
    const panel = label(root, '更新の競合');
    expect(descendants(panel).some(n => n.tag === 'legend' && n.textContent.includes(kind === 'binding' ? '使用するモデル' : 'ピン位置'))).toBe(true);
    expect(descendants(panel).some(n => n.tag === 'legend' && n.textContent.includes('ピン色'))).toBe(false);
    const first = by(panel, n => n.type === 'radio'), expected = conflict.candidates.find(c => c.id === first.value)!.value;
    first.checked = true; first.fire('change'); button(panel, '選んだ内容を使用').fire('click');
    expect(a.read().cells[key]).toEqual({ kind: 'value', value: expected });
    b.receive(a.exportUpdate()); expect(b.read()).toEqual(a.read()); team.dispose();
  });

  it('rejects unknown bindings and invalid whole anchors before changing the published history', () => {
    const [a] = pair(), session = new SyntheticSession(historyAuthority(a)); select(session); movePin(session, ['1', '2', '3']);
    const key = captionKey(f.shared, 'anchor'), cell = a.read().cells[key];
    if (cell?.kind !== 'value') throw new Error('anchor missing');
    const original = JSON.parse(cell.value), before = a.read(), originalBytes = bytes(a.exportUpdate());
    const foreign = syntheticVersions.find(v => v.assetId === f.structure)!;
    expect(() => a.write(before.token, { [bindingKey(f.equipment)]: foreign.projection.bindingId })).toThrow();
    for (const patch of [{ assetFrameId: foreign.projection.assetFrameId }, { assetId: f.structure },
      { authoredAnchorCompatibilityId: foreign.projection.anchorCompatibilityIds[0] }, { positionAsset: [1, null, 3] },
      { hitEvidence: { method: 'proxy', source: { representationId: 'guessed' } } }, { normalAsset: [0, 1, 0] }]) {
      expect(() => a.write(before.token, { [key]: JSON.stringify({ ...original, ...patch }) })).toThrow();
      expect(a.read()).toEqual(before); expect(bytes(a.exportUpdate())).toEqual(originalBytes);
    }
  });

  it('walks model update and coordinate/family correction in mounted controls, with no actor/receive escape during a proposal', () => {
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), factory), root = record(team.root);
    const actor = label(root, '操作する人'), first = visibleWorkspace(root);
    button(first, 'モデル').fire('click');
    const inventory = label(first, 'プロジェクトのモデル一覧');
    by(inventory, n => n.tag === 'button' && n.textContent === '設備').fire('click');
    const version = label(first, '更新する合成モデル'); version.value = versions[1]!.projection.bindingId; version.fire('change');
    button(first, 'このモデルに更新').fire('click');
    expect(team.sessions[0]!.snapshot.resources.assets[f.equipment]!.projection).toEqual({ kind: 'value', value: versions[1]!.projection });
    actor.value = '1'; actor.fire('change'); const second = visibleWorkspace(root);
    by(label(second, 'キャプション一覧'), n => n.className === 'lv-caption-select').fire('click');
    button(root, '相手の更新を受け取る').fire('click');
    button(second, '位置を調整').fire('click'); const position = label(second, 'ピン座標・開発用');
    const x = label(position, 'X'); x.value = '7'; x.fire('input');
    expect(actor.disabled).toBe(true); expect(button(root, '相手の更新を受け取る').disabled).toBe(true);
    const before = team.histories[1].read(); actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click');
    expect(actor.value).toBe('1'); expect(team.histories[1].read()).toEqual(before);
    expect(button(second, '位置を確定').disabled).toBe(true);
    const surface = label(position, 'ピンを置く表面'); expect(surface.value).toBe('');
    surface.value = versions[1]!.families[0]!.id; surface.fire('change');
    expect(button(second, '位置を確定').disabled).toBe(false);
    button(second, '位置を確定').fire('click'); expect(position.hidden).toBe(true); expect(actor.disabled).toBe(false);
    const anchor = team.sessions[1]!.snapshot.resources.captions[f.shared]!.anchor;
    expect(anchor.kind === 'value' && anchor.value.kind === 'asset' && anchor.value.positionAsset).toEqual([7, 0, 0]);
    actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click');
    expect(team.sessions[0]!.snapshot.resources.captions[f.shared]!.anchor).toEqual(anchor); team.dispose();
  });

  it('merges independent fields and exact model memberships, retaining original bytes and the explicit base across a second round', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    select(sa); select(sb);
    const base = a.exportUpdate().base;
    draft(sa, 'title', '準備担当の題'); apply(sa);
    draft(sb, 'body', '参加者の本文'); apply(sb); expect(toggle(sb, f.equipment, false)).toBe(true);
    const fromA = a.exportUpdate(), fromB = b.exportUpdate();
    expect(b.receive(fromA).added).toBe(1); sb.refreshHistory();
    expect(sb.snapshot.resources.captions[f.shared]!.title).toEqual({ kind: 'value', value: '準備担当の題' });
    expect(sb.composition.assets.map(asset => asset.assetId)).toEqual([f.structure]);
    a.receive(b.exportUpdate()); sa.refreshHistory();
    expect(field(a, 'body')).toEqual({ kind: 'value', value: '参加者の本文' });
    expect(bytes(a.exportUpdate())).toEqual([...bytes(fromA), ...bytes(fromB)].sort());
    draft(sa, 'body', '次の本文'); apply(sa);
    draft(sb, 'title', '次の題'); apply(sb);
    const nextA = a.exportUpdate(), nextB = b.exportUpdate();
    a.receive(nextB); b.receive(nextA);
    expect(a.read()).toEqual(b.read()); expect(a.exportUpdate().base).toEqual(base); expect(b.exportUpdate().base).toEqual(base);
    expect(field(a)).toEqual({ kind: 'value', value: '次の題' });
    expect(field(a, 'body')).toEqual({ kind: 'value', value: '次の本文' });
    const before = a.exportUpdate(); expect(a.receive(nextB).added).toBe(0); expect(bytes(a.exportUpdate())).toEqual(bytes(before));
  });

  it.each([0, 1])('retains both scalar candidates; explicitly choosing candidate %s resolves even a materialized winner', candidateIndex => {
    const [a, b] = pair(), key = captionKey(f.shared, 'title');
    a.write(a.read().token, { [key]: '一方の題' }); b.write(b.read().token, { [key]: 'もう一方の題' });
    const originalA = a.exportUpdate(), originalB = b.exportUpdate();
    a.receive(originalB); b.receive(originalA);
    const conflict = field(a); expect(conflict?.kind).toBe('conflict'); if (conflict?.kind !== 'conflict') throw new Error('conflict missing');
    expect(projectHistory(a.read()).resources.captions[f.shared]!.title.kind).toBe('unresolved');
    expect(() => a.write(a.read().token, { [key]: 'implicit winner' })).toThrow();
    const candidate = conflict.candidates[candidateIndex]!;
    a.choose(a.read().token, key, candidate.id);
    expect(a.exportUpdate().changes).toHaveLength(3);
    expect(field(a)).toEqual({ kind: 'value', value: candidate.value });
    b.receive(a.exportUpdate()); expect(b.read()).toEqual(a.read());
    // Retransmitting the old conflict does not resurrect it or rewrite original changes.
    expect(b.receive(originalA).added).toBe(0); expect(field(b)?.kind).toBe('value');
    for (const original of [...bytes(originalA), ...bytes(originalB)]) expect(bytes(b.exportUpdate())).toContain(original);
  });

  it('refuses incomplete, extra, foreign-root and stale updates without publishing any prefix', () => {
    const [a, b] = pair(), key = captionKey(f.shared, 'title');
    a.write(a.read().token, { [key]: 'first' }); a.write(a.read().token, { [key]: 'second' });
    const update = a.exportUpdate(), before = b.read();
    expect(() => b.receive({ ...update, changes: update.changes.slice(1) })).toThrow();
    expect(() => b.receive({ ...update, target: update.base })).toThrow();
    expect(() => b.receive({ ...update, target: [], changes: [] })).toThrow();
    expect(() => b.receive({ ...update, changes: [...update.changes, update.changes[0]!] })).toThrow();
    const [foreign] = pair(); expect(() => b.receive(foreign.exportUpdate())).toThrow();
    expect(b.read()).toEqual(before);
    // Arrival order does not redefine causality.
    b.receive({ ...update, changes: [...update.changes].reverse() });
    expect(field(b)).toEqual({ kind: 'value', value: 'second' });
    expect(() => b.write(before.token, { [key]: 'stale' })).toThrow();
    const stable = b.read(); expect(() => b.write(stable.token, { unexpected: 'not a known fixture field' })).toThrow();
    expect(b.read()).toEqual(stable);
  });

  it('preserves unapplied input after a source update, blocks stale apply, and does not hide the refusal', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    select(sa); select(sb); draft(sb, 'title', 'まだ適用していない');
    const originalDraft = sb.detailContext().draft, oldPlan = planCaptionApply(sb.detailContext());
    draft(sa, 'title', '届いた変更'); apply(sa); b.receive(a.exportUpdate()); sb.refreshHistory();
    expect(sb.detailContext().draft).toBe(originalDraft); expect(sb.memory.selectedCaptionId).toBe(f.shared);
    expect(planCaptionApply(sb.detailContext()).kind).toBe('blocked');
    if (oldPlan.kind !== 'apply') throw new Error('apply missing');
    expect(sb.acceptDetail(oldPlan)).toBe(false); expect(sb.detailContext().feedback.kind).toBe('failed');
    expect(sb.detailContext().draft).toBe(originalDraft);
    expect(sb.acceptDetail({ kind: 'cancel', draft: originalDraft! })).toBe(true);
    expect(field(b)).toEqual({ kind: 'value', value: '届いた変更' });
  });

  it('writes only the commanded membership, so another conflicting edge cannot block an unrelated exclusion', () => {
    const [a, b] = pair(), sa = new SyntheticSession(historyAuthority(a)), sb = new SyntheticSession(historyAuthority(b));
    expect(toggle(sa, f.equipment, false)).toBe(true); expect(toggle(sb, f.equipment, false)).toBe(true);
    a.receive(b.exportUpdate()); sa.refreshHistory();
    const conflicted = Object.entries(a.read().cells).find(([key, cell]) => key.startsWith('membership/') && cell.kind === 'conflict');
    expect(conflicted).toBeDefined();
    expect(toggle(sa, f.structure, false)).toBe(true);
    expect(a.read().cells[conflicted![0]]?.kind).toBe('conflict');
    const last = a.exportUpdate().changes.at(-1)!;
    const decoded = A.decodeChange(last);
    const structure = Object.values(sa.snapshot.state.assetMemberships).find(e => e.resourceId === f.structure)!;
    expect(decoded.ops.filter(op => 'key' in op && op.key === membershipKey(structure.id))).toHaveLength(1);
    expect(decoded.ops.filter(op => 'key' in op && op.key === conflicted![0])).toHaveLength(0);
  });

  it('runs the two-person edit/receive/choose/replay flow through mounted controls with no default conflict choice', () => {
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), factory), root = record(team.root);
    const actor = label(root, '操作する人');
    function selectAndEdit(text: string) {
      const workspace = visibleWorkspace(root);
      by(label(workspace, 'キャプション一覧'), n => n.className === 'lv-caption-select').fire('click');
      const title = label(workspace, 'タイトル'); title.value = text; title.fire('input');
      button(workspace, '変更を適用').fire('click'); return title;
    }
    const firstEditor = selectAndEdit('準備担当の記録');
    actor.value = '1'; actor.fire('change'); const secondEditor = selectAndEdit('参加者の記録');
    button(root, '相手の更新を受け取る').fire('click');
    const panel = label(root, '更新の競合'); expect(panel.hidden).toBe(false);
    const choices = descendants(panel).filter(n => n.type === 'radio');
    expect(choices).toHaveLength(2); expect(choices.every(n => !n.checked)).toBe(true);
    expect(button(panel, '選んだ内容を使用').disabled).toBe(true);
    const chosen = choices.find(n => n.parent?.children.some(c => c.textContent === '参加者の記録'))!;
    chosen.checked = true; chosen.fire('change'); button(panel, '選んだ内容を使用').fire('click');
    expect(panel.hidden).toBe(true); expect(label(visibleWorkspace(root), 'タイトル')).toBe(secondEditor);
    expect(secondEditor.value).toBe('参加者の記録');
    actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click');
    expect(label(visibleWorkspace(root), 'タイトル')).toBe(firstEditor); expect(firstEditor.value).toBe('参加者の記録');
    const before = team.histories[0].read(); button(root, '同じ更新を再受信').fire('click');
    expect(team.histories[0].read()).toEqual(before); expect(team.hasChanges()).toBe(true);
    expect(descendants(root).some(n => n.textContent === '受信済みです。編集内容は変わりません。')).toBe(true);
    team.dispose();
  });

  it('refuses a retained choice handler after actor switch or disposal even when both actors have identical heads', () => {
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), factory), root = record(team.root);
    const [a, b] = team.histories, key = captionKey(f.shared, 'title');
    a.write(a.read().token, { [key]: 'first' }); b.write(b.read().token, { [key]: 'second' });
    a.receive(b.exportUpdate()); b.receive(a.exportUpdate()); team.sessions.forEach(s => s.refreshHistory()); team.render();
    const choice = by(label(root, '更新の競合'), n => n.type === 'radio'); choice.checked = true; choice.fire('change');
    const oldConfirm = button(root, '選んだ内容を使用'), before = a.read();
    const actor = label(root, '操作する人'); actor.value = '1'; actor.fire('change'); oldConfirm.fire('click');
    expect(a.read()).toEqual(before); expect(b.read()).toEqual(before);
    actor.value = '0'; actor.fire('change'); team.dispose(); oldConfirm.fire('click');
    expect(a.read()).toEqual(before); expect(b.read()).toEqual(before);
  });

  it('keeps mounted draft text across actor switches and incoming updates; IME refuses switching/receiving', () => {
    const document = new RecordedDocument(), team = createTeamWorkspace(document.asDocument(), factory), root = record(team.root);
    const workspace = visibleWorkspace(root), actor = label(root, '操作する人');
    by(label(workspace, 'キャプション一覧'), n => n.className === 'lv-caption-select').fire('click');
    const title = label(workspace, 'タイトル'); title.value = '未適用の文章'; title.fire('input');
    actor.value = '1'; actor.fire('change'); actor.value = '0'; actor.fire('change');
    expect(label(visibleWorkspace(root), 'タイトル')).toBe(title); expect(title.value).toBe('未適用の文章');
    const peer = team.histories[1]; peer.write(peer.read().token, { [captionKey(f.shared, 'body')]: '別の項目の更新' });
    const currentDraft = team.sessions[0]!.detailContext().draft;
    button(root, '相手の更新を受け取る').fire('click'); expect(title.value).toBe('未適用の文章');
    expect(team.sessions[0]!.detailContext().draft).toBe(currentDraft);
    title.fire('compositionstart'); expect(actor.disabled).toBe(true);
    const before = team.histories[0].read(); button(root, '相手の更新を受け取る').fire('click');
    actor.value = '1'; actor.fire('change'); expect(actor.value).toBe('0'); expect(team.histories[0].read()).toEqual(before);
    title.fire('compositionend'); expect(actor.disabled).toBe(false);
    team.dispose();
  });
});
