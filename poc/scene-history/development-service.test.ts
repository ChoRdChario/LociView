import { beforeEach, afterEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { A, FORMAT, FLAT_FORMAT, type Doc, type Ref, type Target, type MigrationSource,
  canonical, jsonBytes, heads, index, load, missing, require, same, sha, validateRoot } from './journal-format';
import { JournalCandidate, type MigrationVerifier, type RetainedBlob } from './journal';
import { NodeFiles, NodePorts, TestGate } from './journal-node';
import { CasCandidate } from '../cas-io/candidate';
import { NodeIo } from '../cas-io/node-io';
import { developmentSourceSeed, developmentCandidateInput, readDevelopmentSource, encodeDevelopmentCommands, sourceKey } from './development-source';
import { readDevelopmentService, serviceDomainSource } from './development-service';
import { developmentContentBytes, developmentContentVerifier } from './content-verifier';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { fixtureIds, createSyntheticProject } from '../../src/harness/projectScene/fixture';
import { fixtureMedia } from '../../src/harness/projectScene/mediaHistory';

const parent = resolve('.artifacts/fixtures'), scalar = (v: string) => new A.ImmutableString(v);
const tx = (n: number) => n.toString(16).padStart(32, '0'), id = (p: string, n: number) => `${p}_${tx(n)}`;
const key = (...p: string[]) => sourceKey(['isolatedBridge', ...p]);
const fixture = createSyntheticProject(), shared = fixtureIds.shared;
const edges = Object.values(fixture.state.captionMemberships).filter(e => e.resourceId === shared);
const authorities = syntheticVersions.filter(v => v.label !== '表面が同じ表示用モデル').map(v => ({
  variantFamilyId: v.closure.representation.variantFamilyId, representationId: v.closure.representation.id, payloadDigest: v.closure.representation.payloadDigest }));
let root: string, genesis: Doc, foundation: Doc, base: Doc, target: Target, casIo: NodeIo, cas: CasCandidate, gate: TestGate, initial: Ref[], stage = 500;
async function* one(bytes: Uint8Array) { yield bytes; }
function author(doc: Doc, commands: Record<string, string> = {}, controls: Record<string, unknown> = {}): Doc {
  const raw = readDevelopmentSource(A, doc as any);
  const writes = { ...encodeDevelopmentCommands(serviceDomainSource(raw), commands),
    ...Object.fromEntries(Object.entries(controls).map(([k, v]) => [k, canonical(v)])) };
  return A.change(A.clone(doc), { time: 0 }, draft => apply(draft, writes));
}
function apply(draft: Record<string, any>, writes: Readonly<Record<string, string | null>>) {
  for (const [k, v] of Object.entries(writes)) {
    if (v === null) { if (!Object.hasOwn(draft.cells, k)) draft.cells[k] = scalar('null'); delete draft.cells[k]; }
    else { if (draft.cells[k]?.toString() === v) delete draft.cells[k]; draft.cells[k] = scalar(v); }
  }
}
const verifier = () => developmentContentVerifier(authorities, async record => {
  const ref = record.blob as unknown as Ref;
  if (!await cas.hasVerified({ sha256: ref.digest, byteLength: ref.byteLength })) return undefined;
  const file = await casIo.read(`blobs/${ref.digest}`); if (!file || file.size !== ref.byteLength) return undefined;
  const bytes = new Uint8Array(file.size); let offset = 0;
  for await (const chunk of file.chunks()) { require(offset + chunk.length <= bytes.length, 'CAS size changed'); bytes.set(chunk, offset); offset += chunk.length; }
  require(offset === bytes.length, 'CAS truncated'); return bytes;
});
const read = (doc: Doc) => readDevelopmentService(doc, target, verifier());
const fresh = (migration?: MigrationVerifier) => {
  const ports = new NodePorts(new NodeFiles(resolve(root, 'journal')), new NodeFiles(resolve(root, 'metadata')), gate, cas, target,
    async doc => (await read(doc)).retained);
  return { ports, engine: new JournalCandidate(ports, target, migration) };
};
function managed(doc: Doc, selected: string[], n: number, introduce = false) {
  return author(doc, Object.fromEntries(edges.map(e => [`membership/${e.id}`, JSON.stringify({ ...e,
    lifecycle: { kind: 'value', value: { state: selected.includes(e.id) ? 'active' : 'deleted', eventId: id('evt', n),
      reason: selected.includes(e.id) ? 'conflictResolution' : 'userDelete' } } })])), {
    ...(introduce ? { [key('managed', 'caption-scenes', 'identity')]: { captionId: shared },
      ...Object.fromEntries(edges.map(e => [key('managed', 'caption-scenes', 'members', e.id), { sceneId: e.sceneId }])) } : {}),
    [key('managed', 'caption-scenes', 'selection')]: { membershipIds: [...selected].sort() },
  });
}
async function local(engine: JournalCandidate, ports: NodePorts, n: number, commands: Record<string, string>) {
  const source = readDevelopmentSource(A, await ports.current() as any);
  const writes = encodeDevelopmentCommands(serviceDomainSource(source), commands);
  return engine.local(tx(n), tx(n + 100), d => apply(d, writes));
}
beforeEach(async () => {
  await mkdir(parent, { recursive: true }); root = await mkdtemp(resolve(parent, 'full-service-'));
  genesis = A.from({ cells: Object.fromEntries(Object.entries(developmentSourceSeed()).map(([k, v]) => [k, scalar(v)])) });
  target = { identity: JSON.parse(String(genesis.cells[sourceKey(['identity'])])), metadataEnvelope: { adapter: 'automerge',
    adapterFormatVersion: FLAT_FORMAT, lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: heads(genesis)[0]! } } };
  foundation = author(genesis, {}, { [key('foundation')]: { caseId: 'fixture-case', baselineHeads: heads(genesis) } });
  base = managed(foundation, edges.map(e => e.id), 41, true);
  casIo = new NodeIo(resolve(root, 'cas')); cas = new CasCandidate(casIo); gate = new TestGate();
  const records = [...syntheticVersions.map(v => v.closure.representation), ...fixtureMedia.map(m => m.record)];
  initial = [...new Map(records.map(r => [r.blob.digest, r.blob as Ref])).values()].sort((a, b) => a.digest < b.digest ? -1 : 1);
  for (const ref of initial) {
    const record = records.find(r => r.blob.digest === ref.digest)!;
    const bytes = await developmentContentBytes(record as any); require(bytes, 'missing fixture body');
    await cas.import(tx(stage++), { sha256: ref.digest, byteLength: ref.byteLength }, one(bytes));
  }
  await fresh().ports.initialize(base, initial);
});
afterEach(async () => {
  const path = resolve(root); require(path.startsWith(parent + sep + 'full-service-') && path !== parent, 'unsafe cleanup');
  await rm(path, { recursive: true, force: true });
});

it('uses an explicit populated-root profile and preserves original identities through reopen', async () => {
  expect(() => validateRoot(base, { ...target, metadataEnvelope: { ...target.metadataEnvelope, adapterFormatVersion: FORMAT } })).toThrow();
  const result = await read((await fresh().engine.view()).doc);
  expect(result.provider.resources.captions[shared]!.body).toEqual(fixture.resources.captions[shared]!.body);
  expect(result.guards).toMatchObject([{ kind: 'managed', unresolved: false }]);
  const raw = readDevelopmentSource(A, base as any), domain = developmentCandidateInput(serviceDomainSource(raw));
  expect(domain.history.changes.map(c => [c.id, c.deps])).toEqual(raw.originalAtomicHistory!.changes.map(c => [c.id, c.deps]));
  expect(domain.history.changes.find(c => c.id === heads(foundation)[0])!.writes).toEqual([]);
  expect(domain.history.token).toBe(raw.token);
  const reopened = (await fresh().engine.view()).doc;
  expect([...index(reopened)].map(([h, p]) => [h, sha(p.bytes)]).sort()).toEqual([...index(base)].map(([h, p]) => [h, sha(p.bytes)]).sort());
  expect(casIo.readPayloadBytes).toBeGreaterThan(0);
  const empty = new NodeFiles(resolve(root, 'other-journal'));
  const ports = new NodePorts(empty, new NodeFiles(resolve(root, 'other-metadata')), gate, cas, target, async doc => (await read(doc)).retained);
  await expect(ports.initialize(base, [])).rejects.toThrow('initial closure');
  expect(await empty.read('control.json', 1024)).toBeNull();
});

it('rejects identity/one-map replacement and hidden historical corruption without weakening correspondence', async () => {
  for (const k of [sourceKey(['identity']), sourceKey(['developmentRoot'])]) {
    const changed = A.change(A.clone(base), d => { delete d.cells[k]; d.cells[k] = scalar(String(base.cells[k])); });
    expect(() => validateRoot(changed, target)).toThrow();
  }
  const replaced = A.change(A.clone(base), d => { d.cells = { ...d.cells }; });
  expect(() => validateRoot(replaced, target)).toThrow();
  const k = sourceKey(['captionsById', shared, 'body']);
  let corrupt = A.change(A.clone(base), d => { d.cells[k] = scalar('"not a command"'); });
  corrupt = A.change(corrupt, d => { d.cells[k] = scalar(String(base.cells[k])); });
  await expect(read(corrupt)).rejects.toThrow();
  const editedBaseline = author(genesis, { [`caption/${shared}/body`]: 'not the fixed ancestor' });
  const shifted = author(editedBaseline, {}, { [key('foundation')]: { caseId: 'fixture-case', baselineHeads: heads(editedBaseline) } });
  await expect(read(shifted)).rejects.toThrow('fixed development baseline');
});

it('withholds only source-managed memberships on concurrent alternatives, preserving text and v2-only edges', async () => {
  // A later v2-only relation is not registered as a source-managed edge.
  const extra = { ...edges[0]!, id: id('scm', 91), resourceId: fixtureIds.second, sceneId: fixtureIds.detail };
  const withExtra = author(base, { [`membership/${extra.id}`]: JSON.stringify(extra), [`caption/${shared}/body`]: '手元の記録' });
  const a = managed(withExtra, [edges[0]!.id], 42), b = managed(withExtra, [edges[1]!.id], 43);
  const merged = A.merge(A.clone(a), A.clone(b));
  const first = fresh(); await first.engine.remote(tx(1), A.save(merged), id('pkg', 1));
  const reopened = fresh(), view = await read((await reopened.engine.view()).doc);
  expect(view.guards[0]!.alternatives).toHaveLength(2); expect(view.guards[0]!.unresolved).toBe(true);
  for (const e of edges) expect(view.provider.state.captionMemberships[e.id]!.lifecycle.kind).toBe('unresolved');
  expect(view.provider.state.captionMemberships[extra.id]!.lifecycle.kind).toBe('value');
  expect(view.provider.resources.captions[shared]!.body).toEqual({ kind: 'value', value: '手元の記録' });
  const choice = managed(merged, [edges[1]!.id], 44);
  await reopened.engine.remote(tx(2), A.save(choice), id('pkg', 2));
  const chosen = await read((await fresh().engine.view()).doc);
  expect(chosen.guards[0]!.unresolved).toBe(false);
  expect(await fresh().engine.remote(tx(3), A.save(merged), id('pkg', 1))).toBe('noop');
});

function birth(doc: Doc, n: number) {
  const version = syntheticVersions.find(v => v.assetId === fixtureIds.equipment && v.label === '初期モデル')!;
  const captionId = id('cap', n), membershipId = id('scm', n), eventId = id('evt', n);
  const anchor = { kind: 'asset', assetId: version.assetId, assetFrameId: version.projection.assetFrameId,
    positionAsset: [1, 2, 3], authoredAssetRevisionId: version.projection.revisionId,
    authoredAnchorCompatibilityId: version.projection.anchorCompatibilityIds[0], hitEvidence: { method: 'manual' } };
  return author(doc, { [`caption/${captionId}/identity`]: JSON.stringify({ assetId: anchor.assetId, assetFrameId: anchor.assetFrameId, eventId }),
    [`caption/${captionId}/title`]: `案 ${n}`, [`caption/${captionId}/body`]: '新しい記録', [`caption/${captionId}/color`]: '#a08045',
    [`caption/${captionId}/anchor`]: JSON.stringify(anchor), [`membership/${membershipId}`]: JSON.stringify({ id: membershipId,
      sceneId: fixtureIds.overview, resourceId: captionId, orderKey: { kind: 'value', value: 'Z' },
      lifecycle: { kind: 'value', value: { state: 'active', eventId, reason: 'initial' } } }) }, {
    [key('birth', 'new-caption', 'targets', captionId)]: { membershipId, sceneId: fixtureIds.overview },
    [key('birth', 'new-caption', 'selection')]: { captionId },
  });
}
function attachment(n: number, captionId: string) {
  return { [`attachment/${id('att', n)}/captionId`]: captionId, [`attachment/${id('att', n)}/mediaResourceId`]: fixtureMedia[0]!.record.id,
    [`attachment/${id('att', n)}/altText`]: '画像', [`attachment/${id('att', n)}/orderKey`]: 'K',
    [`attachment/${id('att', n)}/lifecycle`]: canonical({ state: 'active', eventId: id('evt', n), reason: 'initial' }) };
}
it('keeps complete different births but exposes only an explicit selection, including its later edits', async () => {
  const reserved = author(base, attachment(70, shared), { [key('birth', 'new-caption', 'identity')]: { sourceUnit: 'source-caption' },
    [key('birth', 'new-caption', 'selection')]: { captionId: null } });
  const a = author(birth(reserved, 81), { ...attachment(71, id('cap', 81)), [`attachment/${id('att', 70)}/captionId`]: shared });
  const b = author(birth(reserved, 82), { [`attachment/${id('att', 70)}/captionId`]: fixtureIds.second });
  const merged = A.merge(A.clone(a), A.clone(b));
  const readConflict = await read(merged);
  expect(readConflict.guards.find(g => g.kind === 'birth')!.unresolved).toBe(true);
  expect(readConflict.provider.resources.captions[id('cap', 81)]).toBeUndefined();
  expect(readConflict.provider.resources.captions[id('cap', 82)]).toBeUndefined();
  expect(readConflict.provider.resources.captions[shared]).toBeDefined();
  expect(readConflict.provider.details.attachments[id('att', 70)]?.kind).toBe('unresolved');
  expect(readConflict.provider.details.attachments[id('att', 71)]).toBeUndefined();
  expect(readConflict.provider.inspection.checks.some(c => c.request.fact === 'media' && c.outcome === 'verified')).toBe(true);
  expect(readConflict.provider.inspection.candidates.unambiguousRecords.captionsById).toHaveProperty(id('cap', 81));
  const edited = author(merged, { [`caption/${id('cap', 81)}/body`]: '後から追記' }, {
    [key('birth', 'new-caption', 'selection')]: { captionId: id('cap', 81) } });
  await fresh().engine.remote(tx(10), A.save(edited), id('pkg', 10));
  const view = await read((await fresh().engine.view()).doc);
  expect(view.provider.resources.captions[id('cap', 81)]!.body).toEqual({ kind: 'value', value: '後から追記' });
  expect(view.provider.resources.captions[id('cap', 82)]).toBeUndefined();
  expect(view.provider.details.attachments[id('att', 71)]?.kind).toBe('value');
  expect(await fresh().engine.remote(tx(11), A.save(merged), id('pkg', 10))).toBe('noop');
});

it('rejects missing controls, endpoint tampering and non-atomic selections before publication', async () => {
  const e = edges[0]!;
  const candidates = [
    A.change(A.clone(base), d => { delete d.cells[key('managed', 'caption-scenes', 'selection')]; }),
    author(base, {}, { [key('managed', 'caption-scenes', 'members', e.id)]: { sceneId: fixtureIds.detail } }),
    author(base, {}, { [key('managed', 'caption-scenes', 'selection')]: { membershipIds: [e.id] } }),
    author(base, {}, { [key('unknown')]: { value: true } }),
  ];
  for (const [n, doc] of candidates.entries()) {
    const runtime = fresh(); await expect(runtime.engine.remote(tx(20 + n), A.save(doc), id('pkg', 20 + n))).rejects.toThrow();
    expect(runtime.ports.publications).toBe(0);
    // Invalid staged plans remain explicit; discard only their unprepared intent.
    if ((await runtime.ports.control()).pending) await runtime.engine.recover(tx(20 + n));
  }
  expect(heads((await fresh().engine.view()).doc)).toEqual(heads(base));
});

it('blocks use and publication on actual CAS loss, without a fixture-byte fallback', async () => {
  const active = syntheticVersions.find(v => v.label === '初期モデル')!.closure.representation.blob;
  await unlink(resolve(root, 'cas', 'blobs', active.digest));
  const runtime = fresh(); expect(await runtime.engine.view()).toMatchObject({ readOnly: true, repairRequired: true });
  await expect(runtime.engine.request('edit')).rejects.toThrow();
  await expect(local(runtime.engine, runtime.ports, 31, { [`caption/${shared}/body`]: '未保存' })).rejects.toThrow();
  expect(runtime.ports.publications).toBe(0); expect((await runtime.ports.control()).publishedHeads).toEqual(heads(base));
});

// Exact fixture-source capability, not a general converter. It accepts only the
// registered original source and retains it; recovery never reauthors a command.
async function packet(sourceDoc: Doc) {
  const original = jsonBytes({ case: 'fixture-case', source: 'exact-registered-plan' });
  const retained: RetainedBlob[] = [];
  const retain = (bytes: Uint8Array, mediaType = 'application/octet-stream') => {
    const ref: Ref = { algorithm: 'sha256', digest: sha(bytes), byteLength: bytes.length, mediaType };
    if (!retained.some(r => r.ref.digest === ref.digest)) retained.push({ ref, bytes }); return ref;
  };
  const ancestorRef = retain(A.save(genesis)), foundationRef = retain(A.save(base)), artifact = retain(A.save(sourceDoc));
  const receipt = retain(jsonBytes({ original: sha(original), artifact: artifact.digest }));
  const parts = missing(base, sourceDoc).map((bytes, ordinal) => { const c = A.decodeChange(bytes);
    return { ordinal, expectedChangeHash: c.hash, dependencies: [...c.deps].sort(), byteLength: bytes.length,
      bytesSha256: sha(bytes), bytes: retain(bytes, 'application/vnd.lociview.metadata-change') }; });
  const descriptor: MigrationSource = { kind: 'nativeBridgePrepared', caseId: 'fixture-case', recipeDescriptorDigest: sha(jsonBytes('fixed-full-source-capability')),
    sourceReceipt: receipt, originalInput: { sha256: sha(original), byteLength: original.length },
    ancestor: { ...target, heads: heads(genesis), metadata: ancestorRef }, foundation: { heads: heads(base), metadata: foundationRef },
    domainArtifact: artifact, semanticRegistration: parts, sourceObservation: [], generatedHeads: heads(sourceDoc) };
  const migration: MigrationVerifier = {
    async verifySource(s, bytes, readRetained) {
      require(same(s, descriptor) && sha(bytes) === sha(original), 'unregistered exact fixture source');
      for (const r of retained) require(sha(await readRetained(r.ref)) === r.ref.digest, 'fixture proof corrupt');
      return load(await readRetained(artifact), target);
    }, async validateFinal(doc) { await read(doc); },
  };
  for (const r of retained) await cas.import(tx(stage++), { sha256: r.ref.digest, byteLength: r.ref.byteLength }, one(r.bytes));
  return { descriptor, original, retained, migration };
}
it('connects complete prepared source, local editing, interrupted original parts, reopen and exact replay', async () => {
  const remote = author(managed(base, [edges[1]!.id], 51), { [`caption/${shared}/title`]: '共有タイトル' });
  const p = await packet(remote), first = fresh(p.migration);
  await local(first.engine, first.ports, 40, { [`caption/${shared}/body`]: '参加者の追記' });
  const published = (await first.ports.control()).publishedHeads;
  first.ports.checkpoint = async name => { if (name === 'metadataDurable:0') throw Error('injected interruption'); };
  await expect(first.engine.preparedMigration(tx(41), p.descriptor, p.original, p.retained)).rejects.toThrow('injected interruption');
  const paused = await fresh(p.migration).engine.view(); expect(paused.readOnly).toBe(true); expect(heads(paused.doc)).toEqual(published);
  const resumed = fresh(p.migration); expect(await resumed.engine.recover(tx(41))).toBe('published');
  const final = (await fresh(p.migration).engine.view()).doc, view = await read(final);
  expect(view.provider.resources.captions[shared]!.title).toEqual({ kind: 'value', value: '共有タイトル' });
  expect(view.provider.resources.captions[shared]!.body).toEqual({ kind: 'value', value: '参加者の追記' });
  expect(view.guards[0]!.unresolved).toBe(false); expect(resumed.ports.publications).toBe(1);
  for (const [h, part] of index(remote)) expect(sha(index(final).get(h)!.bytes)).toBe(sha(part.bytes));
  expect(await resumed.engine.preparedMigration(tx(42), p.descriptor, p.original, p.retained)).toBe('noop');
  expect(resumed.ports.publications).toBe(1);
});
