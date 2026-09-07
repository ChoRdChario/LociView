// Disposable metadata probe. Never import into the application.
import * as A from '@automerge/automerge';
import { createHash, randomBytes } from 'node:crypto';

export { A };
export const scalar = (value) => new A.ImmutableString(String(value));
export const id = (prefix) => `${prefix}_${randomBytes(16).toString('hex')}`;
const plain = (value) => JSON.parse(JSON.stringify(value));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const heads = (doc) => [...A.getHeads(doc)].sort();
const equalSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const fail = (message) => { throw new Error(message); };

// Probe fields are a deliberately small subset, not ProjectDocV2 validation.
export function fixture() {
  const ids = Object.fromEntries(['prj', 'hep', 'ast', 'frm', 'rev', 'rep', 'bnd', 'cap']
    .map((prefix) => [prefix, id(prefix)]));
  ids.sceneA = id('scn'); ids.sceneB = id('scn');
  const blob = { digest: 'a'.repeat(64), byteLength: 500 * 1024 * 1024 };
  const doc = A.from({
    identity: { projectId: scalar(ids.prj), historyEpoch: scalar(ids.hep) },
    project: { defaultSceneId: scalar(ids.sceneA) },
    scenesById: {
      [ids.sceneA]: { name: scalar('Scene A') },
      [ids.sceneB]: { name: scalar('Scene B') },
    },
    assetsById: {
      [ids.ast]: { id: scalar(ids.ast), assetFrameId: scalar(ids.frm),
        label: scalar('Synthetic model'), activeBindingId: scalar(ids.bnd) },
    },
    assetBindingsById: {
      [ids.bnd]: { id: scalar(ids.bnd), assetId: scalar(ids.ast),
        assetRevisionId: scalar(ids.rev), placement: scalar('[0,0,0]') },
    },
    assetRevisionsById: {
      [ids.rev]: { id: scalar(ids.rev), assetId: scalar(ids.ast), representationId: scalar(ids.rep) },
    },
    representationsById: {
      [ids.rep]: { id: scalar(ids.rep), blob: scalar(JSON.stringify(blob)) },
    },
    captionsById: {
      [ids.cap]: { id: scalar(ids.cap), title: scalar('Original'), body: scalar('Body'),
        anchor: scalar(JSON.stringify({ assetId: ids.ast, revisionId: ids.rev, position: [0, 0, 0] })) },
    },
    sceneCaptionMembershipsById: {}, sceneAssetMembershipsById: {},
  });
  return { doc, ids, blob };
}

export function fork(doc) { return A.clone(doc); }
export function snapshotAt(doc, snapshotHeads) {
  // 3.4.1 getConflicts on cached historical views may consult a newer handle.
  // Reconstruct from the exact dependency closure, without rewriting changes.
  const index = changeIndex(doc); const closure = reachable(index, snapshotHeads);
  const bytes = [...index].filter(([hash]) => closure.has(hash)).map(([, entry]) => entry.bytes);
  return A.applyChanges(A.init(), bytes)[0];
}
export function change(doc, message, fn) {
  // The live authority remains immutable while the new command is prepared.
  const detached = A.clone(doc, { actor: A.getActorId(doc) });
  return A.change(detached, { message, time: 0 }, fn);
}
export function changeIndex(doc) {
  return new Map(A.getAllChanges(doc).map((bytes) => {
    const decoded = A.decodeChange(bytes);
    return [decoded.hash, { bytes, deps: decoded.deps }];
  }));
}
function reachable(index, roots) {
  const visited = new Set(); const pending = [...roots];
  while (pending.length) {
    const hash = pending.pop();
    if (visited.has(hash)) continue;
    const entry = index.get(hash);
    if (!entry) fail('Missing dependency or head');
    visited.add(hash); pending.push(...entry.deps);
  }
  return visited;
}
const rootHashes = (index) => [...index].filter(([, e]) => !e.deps.length).map(([h]) => h).sort();

export function exchangeBase(doc, packageId = id('pkg')) {
  return { packageId, identity: plain(doc.identity), heads: heads(doc) };
}
export function contribution(doc, base) {
  if (JSON.stringify(plain(doc.identity)) !== JSON.stringify(base.identity)) fail('Wrong lineage');
  const index = changeIndex(doc);
  const baseClosure = reachable(index, base.heads);
  const current = reachable(index, heads(doc));
  return { identity: plain(doc.identity), roots: rootHashes(index), base: base.heads,
    target: heads(doc), changes: [...index].filter(([hash]) => current.has(hash) && !baseClosure.has(hash))
      .map(([, entry]) => entry.bytes) };
}

// This is an in-memory publication probe, not a durable journal or package parser.
// Stage on a clone; reject incomplete batches before exposing a new document.
export function integrate(doc, packet, beforePublish = () => {}) {
  if (JSON.stringify(plain(doc.identity)) !== JSON.stringify(packet.identity)) fail('Wrong lineage');
  const existing = changeIndex(doc);
  if (JSON.stringify(rootHashes(existing)) !== JSON.stringify(packet.roots)) fail('Wrong root');
  const baseClosure = reachable(existing, packet.base);
  const supplied = new Map();
  for (const bytes of packet.changes) {
    const decoded = A.decodeChange(bytes);
    if (supplied.has(decoded.hash)) fail('Duplicate descriptor');
    supplied.set(decoded.hash, { bytes, deps: decoded.deps });
  }
  const combined = new Map([...existing, ...supplied]);
  const target = reachable(combined, packet.target);
  const expected = new Set([...target].filter((hash) => !baseClosure.has(hash)));
  if (!equalSet(expected, new Set(supplied.keys()))) fail('Incomplete or extraneous change set');
  const newChanges = [...supplied].filter(([hash]) => !existing.has(hash)).map(([, e]) => e.bytes);
  if (!newChanges.length) return doc;
  let staged = fork(doc);
  [staged] = A.applyChanges(staged, newChanges);
  if (A.getMissingDeps(staged).length) fail('Missing dependency');
  const allReachable = new Set([...reachable(existing, heads(doc)), ...target]);
  if (!equalSet(reachable(changeIndex(staged), heads(staged)), allReachable)) fail('Unexpected history');
  beforePublish(staged);
  return staged;
}

export function fieldProjection(record, field) {
  const conflicts = A.getConflicts(record, field);
  const candidates = conflicts ? Object.entries(conflicts).map(([opId, value]) => ({ opId, value: plain(value) })) : [];
  return candidates.length > 1
    ? { state: 'conflict', candidates }
    : { state: 'value', value: plain(record[field]) };
}
export function chooseField(doc, captionId, field, opId) {
  const projection = fieldProjection(doc.captionsById[captionId], field);
  const selected = projection.candidates?.find((candidate) => candidate.opId === opId);
  if (!selected) fail('Select an exact current candidate');
  return change(doc, 'explicit field resolution', (draft) => {
    // Assigning the materialized value can be optimized to a no-op. Delete/put
    // inside this one change records the explicit resolution of all predecessors.
    delete draft.captionsById[captionId][field];
    draft.captionsById[captionId][field] = scalar(selected.value);
  });
}

const tableFor = (kind) => kind === 'caption' ? 'sceneCaptionMembershipsById' : 'sceneAssetMembershipsById';
const targetFor = (kind) => kind === 'caption' ? 'captionId' : 'assetId';
export function include(doc, kind, sceneId, resourceId) {
  const edgeId = id(kind === 'caption' ? 'scm' : 'sam');
  return change(doc, 'explicit include', (draft) => {
    draft[tableFor(kind)][edgeId] = { id: scalar(edgeId), sceneId: scalar(sceneId),
      [targetFor(kind)]: scalar(resourceId), active: true, orderKey: scalar('a') };
  });
}
export function memberships(doc, kind, sceneId, resourceId) {
  return Object.entries(doc[tableFor(kind)]).filter(([, edge]) => edge.active
    && String(edge.sceneId) === sceneId && String(edge[targetFor(kind)]) === resourceId)
    .map(([edgeId]) => edgeId).sort();
}
export function membershipProjection(doc, kind, sceneId, resourceId) {
  const candidates = memberships(doc, kind, sceneId, resourceId);
  return candidates.length > 1 ? { state: 'conflict', candidates, visible: false }
    : { state: 'value', candidates, visible: candidates.length === 1 };
}

// Keep-both allocation belongs to the one prepared command and is replayed as
// exact change bytes. The model probe remaps only its synthetic one-rep closure;
// full source/proxy/material/compatibility remapping remains production work.
export function resolveMembership(doc, { kind, sceneId, resourceId, originalEdgeId, mode }) {
  if (!['one', 'both'].includes(mode)) fail('Explicit resolution mode required');
  const edges = memberships(doc, kind, sceneId, resourceId);
  if (edges.length !== 2 || !edges.includes(originalEdgeId)) fail('Choose an exact original candidate');
  const table = tableFor(kind); const target = targetFor(kind);
  const other = edges.find((edge) => edge !== originalEdgeId);
  const newId = mode === 'both' ? id(kind === 'caption' ? 'cap' : 'ast') : undefined;
  const newEdgeId = mode === 'both' ? id(kind === 'caption' ? 'scm' : 'sam') : undefined;
  const frameId = id('frm'); const bindingId = id('bnd'); const revisionId = id('rev'); const representationId = id('rep');
  const cloneRecord = (record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, scalar(value)]));
  const result = change(doc, `explicit keep ${mode}`, (draft) => {
    draft[table][other].active = false;
    if (mode === 'one') return;
    if (kind === 'caption') {
      draft.captionsById[newId] = { ...cloneRecord(doc.captionsById[resourceId]), id: scalar(newId) };
    } else {
      const asset = doc.assetsById[resourceId];
      const binding = doc.assetBindingsById[String(asset.activeBindingId)];
      const revision = doc.assetRevisionsById[String(binding.assetRevisionId)];
      const representation = doc.representationsById[String(revision.representationId)];
      const newRep = { ...plain(representation), id: representationId };
      const newRevision = { id: revisionId, assetId: newId, representationId };
      const newBinding = { ...plain(binding), id: bindingId, assetId: newId, assetRevisionId: revisionId };
      draft.representationsById[representationId] = { ...cloneRecord(newRep), payloadDigest: scalar(digest(newRep)) };
      draft.assetRevisionsById[revisionId] = { ...cloneRecord(newRevision), payloadDigest: scalar(digest(newRevision)) };
      draft.assetBindingsById[bindingId] = { ...cloneRecord(newBinding), payloadDigest: scalar(digest(newBinding)) };
      draft.assetsById[newId] = { ...cloneRecord(asset), id: scalar(newId), assetFrameId: scalar(frameId), activeBindingId: scalar(bindingId) };
    }
    draft[table][newEdgeId] = { id: scalar(newEdgeId), sceneId: scalar(sceneId),
      [target]: scalar(newId), active: true, orderKey: scalar('b') };
  });
  return { doc: result, newId, newEdgeId };
}
