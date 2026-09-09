import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge';
import { developmentSourceSeed, developmentCandidateInput, encodeDevelopmentCommands, readDevelopmentSource,
  developmentCommandSnapshot, sourceKey, developmentSourceLimits } from './development-source';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { readProjectScene } from '../../src/scene/projectProvider';
import { developmentContentVerifier } from './content-verifier';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { projectHistory, captionKey, membershipKey } from '../../src/harness/projectScene/historyProjection';
import { fixtureIds } from '../../src/harness/projectScene/fixture';
import { createVerifiedDevelopmentPair } from './development-verified';
import { duplicateMemberships, planMembershipResolution } from '../../src/harness/projectScene/membershipResolution';
import { developmentContentBytes } from './content-verifier';

const base = () => A.from({ cells: Object.fromEntries(Object.entries(developmentSourceSeed()).map(([k, v]) => [k, new A.ImmutableString(v)])) });
function command(doc: ReturnType<typeof base>, changes: Record<string, string>) {
  const writes = encodeDevelopmentCommands(readDevelopmentSource(A, doc), changes);
  return A.change(doc, draft => { for (const [k, v] of Object.entries(writes)) {
    if (v === null) { if (!Object.hasOwn(draft.cells, k)) draft.cells[k] = new A.ImmutableString('null'); delete draft.cells[k]; }
    else { if (draft.cells[k]?.toString() === v) delete draft.cells[k]; draft.cells[k] = new A.ImmutableString(v); }
  } });
}
describe('same-host new synthetic source, exact canonical operations before provider publication', () => {
  it('authors complete genesis and preserves original operation identities after save/reload', async () => {
    const doc = base(), source = readDevelopmentSource(A, doc), input = developmentCandidateInput(source);
    expect(projectHistory(developmentCommandSnapshot(source)).resources.captions[fixtureIds.shared]).toBeDefined();
    const checked = await inspectProjectCandidates(input, developmentSourceLimits);
    expect(checked.kind).toBe('project-candidate-inspection'); if (checked.kind === 'rejected') throw Error(JSON.stringify(checked));
    expect(checked.issues.filter(i => i.kind === 'invalid' || i.kind === 'orphan')).toEqual([]);
    expect(input.history.changes.flatMap(c => c.writes.map(w => w.operationId))).toEqual(source.originalAtomicHistory!.changes.flatMap(c => c.writes.map(w => w.operationId)));
    expect(developmentCandidateInput(readDevelopmentSource(A, A.load<typeof doc>(A.save(doc))))).toEqual(input);
  });
  it('records scalar equal assignments but does not reassign membership identities/order or fixed closure fields', async () => {
    const doc = base(), snapshot = readDevelopmentSource(A, doc), commands = developmentCommandSnapshot(snapshot), project = projectHistory(commands);
    const edge = Object.values(project.state.captionMemberships)[0]!, key = membershipKey(edge.id);
    const next = JSON.stringify({ ...edge, lifecycle: { kind: 'value', value: { state: 'deleted', eventId: `evt_${'7'.repeat(32)}`, reason: 'userDelete' } } });
    const writes = encodeDevelopmentCommands(snapshot, { [key]: next });
    expect(Object.keys(writes).filter(k => !k.includes('developmentCommands'))).toEqual([sourceKey(['sceneCaptionMembershipsById', edge.id, 'lifecycle'])]);
    const titleKey = captionKey(fixtureIds.shared, 'title'), title = commands.cells[titleKey]; if (title?.kind !== 'value') throw Error();
    const edited = command(A.clone(doc), { [titleKey]: title.value });
    const canonical = sourceKey(['captionsById', fixtureIds.shared, 'title']);
    expect(readDevelopmentSource(A, edited).cellVersions![canonical]).not.toBe(snapshot.cellVersions![canonical]);
    const a = command(A.clone(doc), { [key]: next }), b = command(A.clone(doc), { [key]: next.replace('7'.repeat(32), '8'.repeat(32)) });
    const checked = await inspectProjectCandidates(developmentCandidateInput(readDevelopmentSource(A, A.merge(a, b))), developmentSourceLimits);
    if (checked.kind === 'rejected') throw Error();
    expect(checked.issues.filter(i => i.kind === 'invalid')).toEqual([]);
    expect(checked.fields.find(f => f.path.join('/') === `sceneCaptionMembershipsById/${edge.id}/lifecycle`)!.candidates).toHaveLength(2);
    expect(checked.fields.find(f => f.path.join('/') === `sceneCaptionMembershipsById/${edge.id}/sceneId`)!.candidates).toHaveLength(1);
  });
  it('reaches the provider using this exact host source after two actor rounds', async () => {
    const doc = base(), title = captionKey(fixtureIds.shared, 'title'), body = captionKey(fixtureIds.shared, 'body');
    let a = command(A.clone(doc), { [title]: '準備担当の題名' }), b = command(A.clone(doc), { [body]: '参加者の記録' });
    a = A.merge(a, A.clone(b)); b = A.merge(b, A.clone(a));
    a = command(a, { [title]: '2回目・準備担当' }); b = command(b, { [title]: '2回目・参加者' });
    const merged = A.merge(a, b), source = readDevelopmentSource(A, merged);
    const authorities = syntheticVersions.filter(v => v.label !== '表面が同じ表示用モデル').map(v => ({
      variantFamilyId: v.closure.representation.variantFamilyId, representationId: v.closure.representation.id, payloadDigest: v.closure.representation.payloadDigest }));
    const provider = await readProjectScene(developmentCandidateInput(source), developmentSourceLimits, developmentContentVerifier(authorities));
    if (provider.kind !== 'scene-provider') throw Error(JSON.stringify(provider));
    expect(provider.resources.captions[fixtureIds.shared]!.title.kind).toBe('unresolved');
    expect(provider.resources.captions[fixtureIds.shared]!.body).toEqual({ kind: 'value', value: '参加者の記録' });
    expect(Object.values(provider.resources.assets).map(a => a.projection.kind), JSON.stringify(provider.issues)).toEqual(['value', 'value']);
  });
  it('rejects source/sidecar divergence in original intermediate changes even if final values were repaired', () => {
    const doc = base(), key = sourceKey(['captionsById', fixtureIds.shared, 'title']);
    const old = doc.cells[key]!.toString();
    let changed = A.change(A.clone(doc), d => { d.cells[key] = new A.ImmutableString('"hidden change"'); });
    changed = A.change(changed, d => { d.cells[key] = new A.ImmutableString(old); });
    expect(() => developmentCandidateInput(readDevelopmentSource(A, changed))).toThrow('対応');
    const badIdentity = A.change(A.clone(doc), d => { delete d.cells[sourceKey(['identity'])]; });
    expect(() => developmentCandidateInput(readDevelopmentSource(A, badIdentity))).toThrow();
    const badDeclaration = A.change(A.clone(doc), d => { d.cells[sourceKey(['developmentRoot'])] = new A.ImmutableString('{}'); });
    expect(() => developmentCandidateInput(readDevelopmentSource(A, badDeclaration))).toThrow();
  });
  it('records explicit absent entry choice as an original deletion, not a null default or missing source', () => {
    const doc = command(base(), { [`scene/${fixtureIds.overview}/entry`]: 'null' });
    const input = developmentCandidateInput(readDevelopmentSource(A, doc));
    const writes = input.history.changes.flatMap(c => c.writes).filter(w => w.path.join('/') === `scenesById/${fixtureIds.overview}/defaultViewId`);
    expect(writes).toHaveLength(1); expect(writes[0]!.value).toEqual({ kind: 'absent' });
  });
  it('publishes the verified pair through two rounds, equivalent model selection, independent Caption copy and replay', async () => {
    const [a, b] = await createVerifiedDevelopmentPair(A), title = captionKey(fixtureIds.shared, 'title');
    await a.write(a.read().token, { [title]: '準備担当' });
    await b.write(b.read().token, { [captionKey(fixtureIds.shared, 'body')]: '参加者の本文' });
    await a.receive(b.exportUpdate()); await b.receive(a.exportUpdate());
    const equivalent = syntheticVersions.find(v => v.assetId === fixtureIds.equipment && v.label === '表面が同じ表示用モデル')!;
    await a.write(a.read().token, { [`asset/${fixtureIds.equipment}/binding`]: equivalent.closure.binding.id });
    expect(a.read().project.resources.assets[fixtureIds.equipment]!.projection).toEqual({ kind: 'value', value: equivalent.projection });
    await b.receive(a.exportUpdate());
    const original = Object.values(a.read().project.state.captionMemberships).find(e => e.resourceId === fixtureIds.second)!;
    const id = (prefix: string, n: string) => `${prefix}_${n.repeat(32)}`;
    const add = (edgeId: string, eventId: string) => ({ [membershipKey(edgeId)]: JSON.stringify({ ...original,
      id: edgeId, sceneId: fixtureIds.detail, lifecycle: { kind: 'value', value: { state: 'active', eventId, reason: 'initial' } } }) });
    await a.write(a.read().token, add(id('scm', '7'), id('evt', '7')));
    await b.write(b.read().token, add(id('scm', '8'), id('evt', '8')));
    await a.receive(b.exportUpdate());
    const group = duplicateMemberships(a.read())[0]!;
    const plan = planMembershipResolution(a.read(), group, group.edges[0]!.id, 'both', id('evt', '9'),
      [{ edgeId: group.edges[1]!.id, captionId: id('cap', '9'), membershipId: id('scm', '9') }]);
    await a.write(plan.token, plan.changes);
    expect(a.read().project.resources.captions[id('cap', '9')]!.body.kind).toBe('value');
    await b.receive(a.exportUpdate());
    await b.write(b.read().token, { [captionKey(id('cap', '9'), 'body')]: '独立した本文' });
    await a.receive(b.exportUpdate());
    expect(a.read().project.resources.captions[id('cap', '9')]!.body).toEqual({ kind: 'value', value: '独立した本文' });
    expect(a.read().project.resources.captions[fixtureIds.second]!.body).not.toEqual({ kind: 'value', value: '独立した本文' });
    const before = a.read(); expect((await a.receive(b.exportUpdate())).added).toBe(0); expect(a.read()).toBe(before);
  });
  it('does not publish during async admission and retries a failed check with original staged operations', async () => {
    let mode: 'normal' | 'wait' | 'fail' = 'normal', release: (() => void) | undefined;
    const observed: string[] = [];
    const [a] = await createVerifiedDevelopmentPair(A, commands => {
      observed.push(commands.token); if (mode === 'fail') throw Error('Injected admission failure');
      const authorities = syntheticVersions.filter(v => v.label === '初期モデル').map(v => ({ variantFamilyId: v.closure.representation.variantFamilyId,
        representationId: v.closure.representation.id, payloadDigest: v.closure.representation.payloadDigest }));
      return developmentContentVerifier(authorities, async r => {
        if (mode === 'wait') { mode = 'normal'; await new Promise<void>(resolve => { release = resolve; }); }
        return developmentContentBytes(r);
      });
    });
    const initial = a.read(); mode = 'wait';
    const pending = a.write(initial.token, { [captionKey(fixtureIds.shared, 'title')]: '確認後に表示' });
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    expect(a.status().kind).toBe('checking'); expect(a.read()).toBe(initial);
    await expect(a.write(initial.token, { [captionKey(fixtureIds.shared, 'body')]: 'overlap' })).rejects.toThrow('確認');
    expect(() => a.exportUpdate()).toThrow('確認'); release(); await pending;
    const confirmed = a.read(); mode = 'fail';
    await expect(a.write(confirmed.token, { [captionKey(fixtureIds.shared, 'body')]: '再試行する本文' })).rejects.toThrow('Injected');
    const failedToken = observed.at(-1); expect(a.status().kind).toBe('failed'); expect(a.read()).toBe(confirmed);
    mode = 'normal'; await a.retry(); expect(observed.at(-1)).toBe(failedToken);
    expect(a.read().project.resources.captions[fixtureIds.shared]!.body).toEqual({ kind: 'value', value: '再試行する本文' });
  });
  it('authors a fresh lifecycle resolution event when choosing a membership candidate', async () => {
    const [a, b] = await createVerifiedDevelopmentPair(A), edge = Object.values(a.read().project.state.captionMemberships)[0]!, key = membershipKey(edge.id);
    const text = (state: string, digit: string) => JSON.stringify({ ...edge, lifecycle: { kind: 'value', value: {
      state, eventId: `evt_${digit.repeat(32)}`, reason: state === 'active' ? 'initial' : 'userDelete' } } });
    await a.write(a.read().token, { [key]: text('active', 'a') }); await b.write(b.read().token, { [key]: text('deleted', 'b') });
    await a.receive(b.exportUpdate()); const cell = a.read().cells[key]; if (cell?.kind !== 'conflict') throw Error();
    await a.choose(a.read().token, key, cell.candidates.find(c => JSON.parse(c.value).lifecycle.value.state === 'active')!.id);
    const life = a.read().project.state.captionMemberships[edge.id]!.lifecycle;
    expect(life.kind).toBe('value'); if (life.kind !== 'value') throw Error();
    expect(life.value.reason).toBe('conflictResolution'); expect(life.value.eventId).not.toBe(`evt_${'a'.repeat(32)}`);
    expect(a.read().provider.issues.filter(i => i.code === 'lifecycle-event-reused')).toEqual([]);
  });
  it('rejects a malformed same-lineage update without trapping the confirmed actor in retry', async () => {
    const [a, b] = await createVerifiedDevelopmentPair(A);
    await a.write(a.read().token, { [captionKey(fixtureIds.shared, 'title')]: '正しい更新' });
    const update = a.exportUpdate(), original = A.decodeChange(update.changes[0]!);
    const key = sourceKey(['captionsById', fixtureIds.shared, 'title']);
    const malformed = A.encodeChange({ ...original, ops: original.ops.map(op => op.key === key && op.action === 'set' ? { ...op, value: '"不整合な更新"' } : op) });
    const before = b.read();
    await expect(b.receive({ ...update, changes: [malformed], target: [A.decodeChange(malformed).hash] })).rejects.toThrow('対応');
    expect(b.status().kind).toBe('idle'); expect(b.read()).toBe(before);
    await b.write(before.token, { [captionKey(fixtureIds.shared, 'body')]: '手元の編集を継続' });
    await b.receive(update); expect(b.read().project.resources.captions[fixtureIds.shared]!.title).toEqual({ kind: 'value', value: '正しい更新' });
    expect(b.read().project.resources.captions[fixtureIds.shared]!.body).toEqual({ kind: 'value', value: '手元の編集を継続' });
  });
});
