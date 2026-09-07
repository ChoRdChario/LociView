import test from 'node:test';
import assert from 'node:assert/strict';
import { A, id, scalar, fixture, fork, snapshotAt, change, heads, changeIndex, exchangeBase,
  contribution, integrate, fieldProjection, chooseField, include,
  membershipProjection, resolveMembership, memberships } from './candidate.mjs';

const hashes = (packet) => packet.changes.map((bytes) => A.decodeChange(bytes).hash).sort();
const rootHashes = (doc) => [...changeIndex(doc).keys()].sort();
const json = (value) => JSON.parse(JSON.stringify(value));

test('TEAM-PKG-08: O/A/B/W exact sibling delta, unchanged base and replay', () => {
  const { doc: o, ids } = fixture();
  const base = exchangeBase(o); const savedBase = JSON.stringify(base);
  const a = change(fork(o), 'A local title', (d) => { d.captionsById[ids.cap].title = scalar('A title'); });
  const b = change(fork(o), 'B body', (d) => { d.captionsById[ids.cap].body = scalar('B body'); });
  const aBytes = A.getLastLocalChange(a); const bBytes = A.getLastLocalChange(b);
  const ab = integrate(a, contribution(b, base));
  const ba = integrate(b, contribution(a, base));
  assert.deepEqual(heads(ab), heads(ba));
  assert.equal(String(ab.captionsById[ids.cap].title), 'A title');
  assert.equal(String(ab.captionsById[ids.cap].body), 'B body');
  assert.deepEqual(hashes(contribution(ab, base)), [aBytes, bBytes].map((c) => A.decodeChange(c).hash).sort());
  assert.equal(JSON.stringify(base), savedBase);
  assert.strictEqual(integrate(ab, contribution(b, base)), ab);

  const w = change(fork(o), 'W newer workspace', (d) => { d.scenesById[ids.sceneA].name = scalar('Updated'); });
  const wBase = exchangeBase(w);
  const aw = A.merge(fork(a), fork(w));
  const delta = contribution(aw, wBase);
  assert.deepEqual(delta.changes, [aBytes]);
  assert.deepEqual(A.decodeChange(delta.changes[0]).deps, heads(o));
  const receiver = integrate(fork(w), delta);
  assert.deepEqual(heads(receiver), heads(aw));
  const reopened = A.load(A.save(receiver));
  assert.deepEqual(heads(reopened), heads(receiver));
  assert.deepEqual(contribution(reopened, JSON.parse(JSON.stringify(wBase))).changes, [aBytes]);
});

test('TEAM-HIST-01/03: atomic text conflicts never project a library winner', () => {
  const { doc: o, ids } = fixture(); const base = exchangeBase(o);
  const a = change(fork(o), 'candidate A', (d) => { d.captionsById[ids.cap].title = scalar('Candidate A'); });
  const b = change(fork(o), 'candidate B', (d) => { d.captionsById[ids.cap].title = scalar('Candidate B'); });
  const conflicted = integrate(a, contribution(b, base));
  const projected = fieldProjection(conflicted.captionsById[ids.cap], 'title');
  assert.equal(projected.state, 'conflict'); assert.equal(projected.value, undefined);
  assert.deepEqual(projected.candidates.map((c) => c.value).sort(), ['Candidate A', 'Candidate B']);
  const chosen = projected.candidates.find((c) => c.value === 'Candidate A');
  const resolved = chooseField(conflicted, ids.cap, 'title', chosen.opId);
  assert.deepEqual(fieldProjection(resolved.captionsById[ids.cap], 'title'), { state: 'value', value: 'Candidate A' });
  assert.deepEqual(A.decodeChange(A.getLastLocalChange(resolved)).deps.sort(), heads(conflicted));
  assert.ok(rootHashes(conflicted).every((h) => rootHashes(resolved).includes(h)));
  assert.equal(fieldProjection(snapshotAt(resolved, heads(conflicted)).captionsById[ids.cap], 'title').state, 'conflict');
});

test('TEAM-HIST-06: explicit keep either or independent Caption copies, without other-Scene effects', () => {
  const { doc: initial, ids } = fixture();
  const o = include(initial, 'caption', ids.sceneB, ids.cap); const base = exchangeBase(o);
  const a = include(fork(o), 'caption', ids.sceneA, ids.cap);
  const b = include(fork(o), 'caption', ids.sceneA, ids.cap);
  for (const [left, right] of [[a, b], [b, a]]) {
    const merged = integrate(fork(left), contribution(right, base));
    const projection = membershipProjection(merged, 'caption', ids.sceneA, ids.cap);
    assert.equal(projection.state, 'conflict'); assert.equal(projection.visible, false);
    for (const originalEdgeId of projection.candidates) {
      const selected = resolveMembership(fork(merged), { kind: 'caption', sceneId: ids.sceneA,
        resourceId: ids.cap, originalEdgeId, mode: 'one' }).doc;
      assert.deepEqual(memberships(selected, 'caption', ids.sceneA, ids.cap), [originalEdgeId]);
    }
    const { doc: both, newId } = resolveMembership(fork(merged), { kind: 'caption', sceneId: ids.sceneA,
      resourceId: ids.cap, originalEdgeId: projection.candidates[0], mode: 'both' });
    assert.notEqual(newId, ids.cap);
    assert.equal(memberships(both, 'caption', ids.sceneA, newId).length, 1);
    assert.equal(memberships(both, 'caption', ids.sceneB, newId).length, 0);
    assert.deepEqual(memberships(both, 'caption', ids.sceneB, ids.cap), memberships(o, 'caption', ids.sceneB, ids.cap));
    assert.equal(String(both.captionsById[newId].anchor), String(both.captionsById[ids.cap].anchor));
    const edited = change(fork(both), 'edit only copy', (d) => { d.captionsById[newId].title = scalar('Independent'); });
    assert.equal(String(edited.captionsById[ids.cap].title), 'Original');
    const exact = contribution(both, base); const receiver = integrate(fork(o), exact);
    assert.strictEqual(integrate(receiver, exact), receiver);
    assert.equal(Object.keys(receiver.captionsById).length, 2);
    const late = include(fork(o), 'caption', ids.sceneA, ids.cap);
    assert.equal(membershipProjection(integrate(receiver, contribution(late, base)), 'caption', ids.sceneA, ids.cap).state, 'conflict');
  }
});

test('TEAM-HIST-06 model probe: separate frame/revision binding, exact shared fake blob, original anchor retained', () => {
  const { doc: o, ids, blob } = fixture(); const base = exchangeBase(o);
  const a = include(fork(o), 'model', ids.sceneA, ids.ast);
  const b = include(fork(o), 'model', ids.sceneA, ids.ast);
  const merged = integrate(a, contribution(b, base));
  const originalEdgeId = memberships(merged, 'model', ids.sceneA, ids.ast)[0];
  const beforeAnchor = String(merged.captionsById[ids.cap].anchor);
  const { doc: both, newId } = resolveMembership(merged, { kind: 'model', sceneId: ids.sceneA,
    resourceId: ids.ast, originalEdgeId, mode: 'both' });
  const copied = both.assetsById[newId];
  assert.notEqual(String(copied.assetFrameId), ids.frm);
  const binding = both.assetBindingsById[String(copied.activeBindingId)];
  assert.equal(String(binding.assetId), newId);
  const revision = both.assetRevisionsById[String(binding.assetRevisionId)];
  assert.equal(String(revision.assetId), newId);
  const representation = both.representationsById[String(revision.representationId)];
  assert.deepEqual(JSON.parse(String(representation.blob)), blob);
  assert.equal(String(both.captionsById[ids.cap].anchor), beforeAnchor);
  const changed = change(fork(both), 'independent model label', (d) => { d.assetsById[newId].label = scalar('Copy'); });
  assert.equal(String(changed.assetsById[ids.ast].label), 'Synthetic model');
  assert.equal(new Set(Object.values(both.representationsById).map((rep) => JSON.parse(String(rep.blob)).digest)).size, 1);
});

test('detached publication rejects incomplete, wrong-lineage, corrupt and interrupted batches with no prefix', () => {
  const { doc: o, ids } = fixture(); const base = exchangeBase(o);
  const first = change(fork(o), 'first', (d) => { d.captionsById[ids.cap].body = scalar('One'); });
  const second = change(first, 'second', (d) => { d.captionsById[ids.cap].title = scalar('Two'); });
  const packet = contribution(second, base); const before = heads(o); const original = json(o);
  assert.throws(() => integrate(o, { ...packet, changes: packet.changes.slice(1) }), /Missing/);
  assert.throws(() => integrate(o, { ...packet, identity: { ...packet.identity, projectId: 'wrong' } }), /lineage/);
  assert.throws(() => integrate(o, { ...packet, base: ['f'.repeat(64)] }), /Missing/);
  assert.throws(() => integrate(o, { ...packet, changes: [new Uint8Array([0, 1, 2])] }));
  assert.throws(() => integrate(o, packet, () => { throw new Error('injected interruption'); }), /interruption/);
  assert.deepEqual(heads(o), before); assert.deepEqual(json(o), original);
  const completed = integrate(o, packet);
  assert.deepEqual(heads(completed), heads(second));
  assert.deepEqual(json(A.load(A.save(completed))), json(completed));
});

test('S1 adapter probe preserves older-revision Caption work across an independently delivered model update', () => {
  const { doc: o, ids } = fixture(); const base = exchangeBase(o);
  const participant = change(fork(o), 'pending Caption', (d) => { d.captionsById[ids.cap].body = scalar('Participant work'); });
  const newRevisionId = id('rev'); const newBindingId = id('bnd'); const newRepId = id('rep');
  const coordinator = change(fork(o), 'model update pointer probe', (d) => {
    d.representationsById[newRepId] = { id: scalar(newRepId), blob: scalar(JSON.stringify({ digest: 'b'.repeat(64), byteLength: 1024 })) };
    d.assetRevisionsById[newRevisionId] = { id: scalar(newRevisionId), assetId: scalar(ids.ast), representationId: scalar(newRepId) };
    d.assetBindingsById[newBindingId] = { id: scalar(newBindingId), assetId: scalar(ids.ast), assetRevisionId: scalar(newRevisionId), placement: scalar('[0,0,0]') };
    d.assetsById[ids.ast].activeBindingId = scalar(newBindingId);
  });
  const joined = integrate(participant, contribution(coordinator, base));
  assert.equal(String(joined.captionsById[ids.cap].body), 'Participant work');
  assert.equal(String(joined.assetsById[ids.ast].activeBindingId), newBindingId);
  assert.equal(String(joined.captionsById[ids.cap].anchor), String(o.captionsById[ids.cap].anchor));
  const corrected = change(joined, 'explicit pin correction', (d) => {
    d.captionsById[ids.cap].anchor = scalar(JSON.stringify({ assetId: ids.ast, revisionId: newRevisionId, position: [1, 2, 3] }));
  });
  const returned = integrate(coordinator, contribution(corrected, base));
  assert.equal(String(returned.captionsById[ids.cap].body), 'Participant work');
  assert.deepEqual(JSON.parse(String(returned.captionsById[ids.cap].anchor)).position, [1, 2, 3]);
  assert.deepEqual(heads(returned), heads(corrected));
});
