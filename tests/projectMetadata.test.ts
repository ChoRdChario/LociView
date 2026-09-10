import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge'; // Node-only Wasm initialization, never a browser import.
import { ProjectMetadataSource, type MetadataLimits } from '../src/projectMetadata/source';
import { inspectProjectCandidates } from '../src/domain/projectCandidates';
import { inspectAtomicHistory } from '../src/domain/atomicHistory';
import { fixture, id, limits as valueLimits } from './helpers/projectRecordsFixture';
import { canonical } from '../src/domain/projectGraphSupport';
import { readProjectScene } from '../src/scene/projectProvider';
import { developmentContentVerifier } from '../poc/scene-history/content-verifier';

const limits: MetadataLimits = { ...valueLimits, maxWork: 1_000_000, maxChanges: 100,
  maxChangeBytes: 1_000_000, maxTotalBytes: 4_000_000, maxOperations: 10_000 };
function create(records = fixture()) {
  const bootstrap = ProjectMetadataSource.bootstrap(records.schema, records.identity, limits);
  return { bootstrap, source: bootstrap.initialize(records), records };
}
function raw(source: ProjectMetadataSource) { return A.applyChanges(A.init<Record<string, any>>(), source.originalChanges())[0]; }
function changed(source: ProjectMetadataSource, mutate: (draft: Record<string, any>) => void) {
  const doc = A.change(raw(source), mutate);
  return A.getAllChanges(doc);
}
function field(source: ProjectMetadataSource, name: string) {
  const read = inspectAtomicHistory(source.read().history, limits);
  if (read.kind !== 'atomic-history-inspection') throw Error('test read failed');
  return read.fields.find(f => canonical(f.path) === canonical(['captionsById', id('cap'), name]))!;
}

describe('production metadata source foundation (no persistence/activation claim)', () => {
  it('creates an empty root and external proof, then all-map contents in a later original change', async () => {
    const { bootstrap, source } = create();
    const initial = raw(bootstrap);
    expect(Object.keys(initial.project)).toEqual([]);
    expect(Object.keys(initial.captionsById)).toEqual([]);
    expect(bootstrap.proof.envelope.lineageProof.rootChangeHash).toBe(A.getHeads(initial)[0]);
    expect(bootstrap.read().history.changes[0]!.writes.map(w => w.path)).toEqual([['identity']]);
    const before = await inspectProjectCandidates(bootstrap.read(), limits);
    expect(before.kind).toBe('project-candidate-inspection');
    if (before.kind === 'project-candidate-inspection') expect(before.issues.length).toBeGreaterThan(0);
    expect(source.originalChanges()).toHaveLength(2);
    expect(source.originalChanges()[0]).toEqual(bootstrap.originalChanges()[0]);
    const result = await inspectProjectCandidates(source.read(), limits);
    expect(result.kind).toBe('project-candidate-inspection');
    if (result.kind === 'project-candidate-inspection') expect(result.issues.filter(i => i.kind === 'invalid')).toEqual([]);
    const r = fixture(), rep = r.representationsById[id('rep')];
    const provider = await readProjectScene(source.read(), limits, developmentContentVerifier([
      { variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest },
    ]));
    expect(provider.kind).toBe('scene-provider');
    if (provider.kind === 'scene-provider') {
      expect(provider.token).toBe(source.token);
      expect(provider.state.scenes[id('scn')]).toBeDefined();
      expect(provider.resources.captions[id('cap')]).toBeDefined();
    }
    expect(() => source.initialize(fixture())).toThrow(/already-initialized/);
  });

  it('prepares Caption text without mutating the source, reopens exact bytes and does not duplicate replay', async () => {
    const { source } = create();
    const edited = await source.prepareCaptionText(source.token, id('cap'), 'body', '共有する本文');
    expect(source.originalChanges()).toHaveLength(2); expect(edited.originalChanges()).toHaveLength(3);
    const reopened = ProjectMetadataSource.reopen(edited.originalChanges(), edited.proof, limits);
    expect(reopened.token).toBe(edited.token);
    expect(reopened.originalChanges()).toEqual(edited.originalChanges());
    expect(reopened.appendOriginal(edited.originalChanges())).toBe(reopened);
    const copies = reopened.originalChanges(); copies[0]!.fill(0);
    expect(reopened.originalChanges()[0]).toEqual(source.originalChanges()[0]);
    await expect(edited.prepareCaptionText(source.token, id('cap'), 'title', 'stale')).rejects.toThrow(/stale-token/);
  });

  it('retains distinct-field branches and same-value/title conflicts, never an automatic winner', async () => {
    const { source } = create();
    const title = await source.prepareCaptionText(source.token, id('cap'), 'title', '確認');
    const body = await source.prepareCaptionText(source.token, id('cap'), 'body', '追記');
    const merged = title.appendOriginal(body.originalChanges());
    expect(field(merged, 'title').candidates).toHaveLength(1); expect(field(merged, 'body').candidates).toHaveLength(1);
    expect(field(merged, 'body').candidates[0]!.value).toEqual({ kind: 'value', value: '追記' });
    const sameTitle = await source.prepareCaptionText(source.token, id('cap'), 'title', '確認');
    const conflicted = title.appendOriginal(sameTitle.originalChanges());
    expect(field(conflicted, 'title').candidates).toHaveLength(2);
    await expect(conflicted.prepareCaptionText(conflicted.token, id('cap'), 'title', '自動解決しない')).rejects.toThrow(/caption-unresolved/);
    const reversed = sameTitle.appendOriginal(title.originalChanges());
    expect(reversed.token).toBe(conflicted.token);
    expect(field(reversed, 'title').candidates).toEqual(field(conflicted, 'title').candidates);
  });

  it('retains explicit absence beside a concurrent optional value', () => {
    const { source } = create();
    const absent = ProjectMetadataSource.reopen(changed(source, d => { delete d.captionsById[id('cap')].colorSrgb; }), source.proof, limits);
    const present = changed(source, d => { d.captionsById[id('cap')].colorSrgb = new A.ImmutableString('[0,0,1]'); });
    expect(field(absent.appendOriginal(present), 'colorSrgb').candidates.map(c => c.value.kind).sort()).toEqual(['absent', 'value']);
  });

  it('preserves unknown root siblings and complete atomic subtrees through Caption edits', async () => {
    const records = fixture(); records.futureSupport = { version: 8, nested: [true, '保持'] };
    records.captionsById[id('cap')].futureField = { x: { y: '未知' } };
    const { source } = create(records), before = source.originalChanges();
    const edited = await source.prepareCaptionText(source.token, id('cap'), 'body', '追記');
    const unknown = edited.read().history.changes.flatMap(c => c.writes).filter(w => w.path[0] === 'futureSupport' || w.path[2] === 'futureField');
    expect(unknown).toHaveLength(2);
    expect(unknown.map(w => w.value)).toContainEqual({ kind: 'value', value: records.futureSupport });
    expect(edited.originalChanges().slice(0, before.length)).toEqual(before);
  });

  it.each([
    (d: Record<string, any>) => { d.project = {}; },
    (d: Record<string, any>) => { delete d.captionsById[id('cap')]; },
    (d: Record<string, any>) => { d.captionsById[id('cap')] = { title: new A.ImmutableString('"新規"') }; },
    (d: Record<string, any>) => { d.identity = new A.ImmutableString('{}'); },
    (d: Record<string, any>) => { d.captionsById[id('cap')].title = 'Text object is not an atomic string'; },
  ])('rejects unsupported raw structure without accepting a repaired-looking winner', mutate => {
    const { source } = create();
    expect(() => ProjectMetadataSource.reopen(changed(source, mutate), source.proof, limits)).toThrow(/Metadata source invalid/);
  });

  it('rejects a copied identity/root proof, populated first change and partial original dependencies', () => {
    const { source, records } = create(), independent = create(records).source;
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), independent.proof, limits)).toThrow();
    const wrongIdentity = { ...source.proof, identity: { ...source.proof.identity, historyEpoch: id('hep', 8) } };
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), wrongIdentity, limits)).toThrow();
    expect(() => ProjectMetadataSource.reopen(source.originalChanges().slice(1), source.proof, limits)).toThrow();
    const populated = A.from({ schema: new A.ImmutableString(canonical(records.schema)), identity: new A.ImmutableString(canonical(records.identity)), project: { title: new A.ImmutableString('"bad"') } });
    expect(() => ProjectMetadataSource.reopen(A.getAllChanges(populated), { ...source.proof,
      envelope: { ...source.proof.envelope, lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: A.getHeads(populated)[0]! } } }, limits)).toThrow();
  });

  it('rejects competing mutable-container births and a delete/recreate in one logical change', () => {
    const { source, records } = create();
    const insert = (target: string) => (d: Record<string, any>) => {
      d.captionsById[target] = {};
      for (const [field, value] of Object.entries({ ...records.captionsById[id('cap')], id: target })) {
        d.captionsById[target][field] = new A.ImmutableString(canonical(value as any));
      }
    };
    const left = ProjectMetadataSource.reopen(changed(source, insert(id('cap', 2))), source.proof, limits);
    expect(() => left.appendOriginal(changed(source, insert(id('cap', 2))))).toThrow(/container-replacement/);
    expect(() => ProjectMetadataSource.reopen(changed(source, d => {
      delete d.captionsById[id('cap')]; insert(id('cap'))(d);
    }), source.proof, limits)).toThrow(/container-replacement|structure/);
  });

  it('rejects duplicate JSON keys, noncanonical scalars and configured byte/operation limits', () => {
    const { source } = create();
    for (const text of ['{"x":1,"x":2}', ' "text" ', '{"b":1,"a":2}']) {
      const parts = changed(source, d => { d.captionsById[id('cap')].future = new A.ImmutableString(text); });
      expect(() => ProjectMetadataSource.reopen(parts, source.proof, limits)).toThrow();
    }
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), source.proof, { ...limits, maxChangeBytes: 1 })).toThrow();
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), source.proof, { ...limits, maxOperations: 1 })).toThrow();
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), source.proof, { ...limits, maxWork: NaN })).toThrow();
    expect(() => source.appendOriginal([new TextEncoder().encode('untrusted malformed bytes')])).toThrow('Metadata source invalid (append-original)');
    for (const key of ['constructor', 'prototype', '__proto__', 'bad\nkey']) {
      // Encode original ops directly: the adapter must not depend on a JS assignment guard.
      const doc = raw(source), template = A.decodeChange(A.getLastLocalChange(A.change(A.clone(doc), d => {
        d.future = new A.ImmutableString('null');
      }))!);
      template.ops[0]!.key = key;
      expect(() => source.appendOriginal([A.encodeChange(template)])).toThrow();
    }
  });
});
