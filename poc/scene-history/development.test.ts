import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge';
import { createDevelopmentPair } from './development';
import { historyAuthority, historySeed, projectHistory, captionKey, membershipKey, bindingKey } from '../../src/harness/projectScene/historyProjection';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { createTeamWorkspace } from '../../src/harness/projectScene/teamWorkspace';
import type { DevelopmentHistory, MemoryUpdate } from '../../src/harness/projectScene/historyPort';
import { planCaptionList } from '../../src/ui/projectScene/captionListState';
import { editCaptionDraft, planCaptionApply, type CaptionEditField } from '../../src/ui/projectScene/captionDetailState';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import { planPinMode } from '../../src/ui/projectScene/pinModeState';
import { planNavigation } from '../../src/ui/projectScene/navigationState';
import { resolveScene } from '../../src/scene/resolve';
import { RecordedDocument, RecordedNode, record } from '../../tests/ui/domRecorder';

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

describe('actual pinned candidate connected to synthetic workspace; not browser, wire or durable acceptance', () => {
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
    button(second, 'ピンを移動').fire('click'); const position = label(second, 'ピン座標・開発用');
    const x = label(position, 'X'); x.value = '7'; x.fire('input');
    expect(actor.disabled).toBe(true); expect(button(root, '相手の更新を受け取る').disabled).toBe(true);
    const before = team.histories[1].read(); actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click');
    expect(actor.value).toBe('1'); expect(team.histories[1].read()).toEqual(before);
    expect(button(second, '位置を確定').disabled).toBe(true);
    const surface = label(position, '補正先の表面'); expect(surface.value).toBe('');
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
