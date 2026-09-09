import { describe, expect, it } from 'vitest';
import { inspectProjectCandidates, type ProjectCandidateInput } from '../src/domain/projectCandidates';
import { admitProjectRecords } from '../src/domain/projectRecords';
import { admitSceneRecord } from '../src/domain/sceneRecords';
import { admitMaterialRecord } from '../src/domain/materialRecords';
import { checkMutableField, mutableRecordFields, type MutableRecordMap } from '../src/domain/projectMutableFields';
import { ProjectRecordFields } from '../src/domain/projectRecordFields';
import { DomainValidationError } from '../src/domain/values';
import { candidateFixture, candidateWrite as w, withCandidateChanges as add } from './helpers/projectCandidateFixture';
import { fixture, id, limits as valueLimits } from './helpers/projectRecordsFixture';

const limits = { ...valueLimits, maxWork: 1_000_000 };
const read = async (source: ProjectCandidateInput) => { const r = await inspectProjectCandidates(source, limits);
  expect(r.kind).toBe('project-candidate-inspection'); if (r.kind === 'rejected') throw Error(); return r; };
const fork = (source: ProjectCandidateInput, path: string[], a: any, b: any) => add(source, [
  { id: 'a', deps: ['root'], writes: [w('a-op', path, a)] }, { id: 'b', deps: ['root'], writes: [w('b-op', path, b)] },
]);
const codes = (r: Awaited<ReturnType<typeof read>>) => r.issues.map(i => i.code);

describe('all-current-candidate Project values/references, not full provider or content authority', () => {
  it('composes all 14 record maps without a field winner and retains source evidence and explicit missing content authority', async () => {
    const records = fixture(), source = candidateFixture(records), r = await read(source);
    expect(r.unambiguousRecords).toEqual(records); expect(r.source).toEqual(source);
    expect(r.issues.every(i => i.kind === 'unverified')).toBe(true);
    expect(r).not.toHaveProperty('resources'); expect(r).not.toHaveProperty('saved');
    expect(Object.isFrozen(r.source.history.changes)).toBe(true); expect(r.knownActiveRoots).toContain(id('att'));
    expect(r.pendingAuthority).toContain('verified-blob-profile-semantics');
  });
  it('validates every conflicting candidate, distinguishes optional absence/null and does not fill a missing required value', async () => {
    const source = candidateFixture(), path = ['captionsById', id('cap'), 'colorSrgb'];
    const optional = await read(fork(source, path, undefined, [0, 0, 1]));
    expect(optional.fields.find(f => f.path.join('/') === path.join('/'))!.valid).toBe(true);
    expect((optional.unambiguousRecords.captionsById as any)[id('cap')]).not.toHaveProperty('colorSrgb');
    expect(optional.issues.some(i => i.kind === 'invalid')).toBe(false);
    const nullValue = await read(fork(source, path, null, [0, 0, 1])); expect(codes(nullValue)).toContain('candidate-type');
    const title = ['captionsById', id('cap'), 'title'];
    const absent = await read(fork(source, title, undefined, '正常')); expect(codes(absent)).toContain('candidate-missing');
    const bad = await read(fork(source, title, '正常', 'bad\u0000'));
    expect(bad.issues).toContainEqual(expect.objectContaining({ path: title, operationId: 'b-op', kind: 'invalid' }));
    expect((bad.unambiguousRecords.captionsById as any)[id('cap')].body).toBe(fixture().captionsById[id('cap')].body);
  });
  it('requires original root/map and entity-field presence, preserving unknown subtrees without interpreting them', async () => {
    const records = fixture(); records.future = { raw: ['retain', null] }; records.captionsById[id('cap')].future = { opaque: 1 };
    const source = candidateFixture(records), r = await read(source); expect(r.hasUnknownFields).toBe(true); expect(r.source).toEqual(source);
    expect(await inspectProjectCandidates({ ...source, recordMaps: source.recordMaps.slice(1) }, limits)).toMatchObject({ kind: 'rejected' });
    const missing = structuredClone(source) as any; missing.history.changes[0].writes = missing.history.changes[0].writes.filter((x: any) => x.path.join('/') !== ['captionsById', id('cap'), 'body'].join('/'));
    expect(codes(await read(missing))).toContain('required-field-missing');
    let invoked = false; const unsafe = { ...source }; Object.defineProperty(unsafe, 'schema', { enumerable: true, get() { invoked = true; throw Error(); } });
    expect(await inspectProjectCandidates(unsafe, limits)).toMatchObject({ kind: 'rejected' }); expect(invoked).toBe(false);
  });
  it('detects invalid coupling after independent material changes without supplying defaults for a conflicted field', async () => {
    const source = candidateFixture(), map = 'materialOverridesById', material = id('ovr');
    const r = await read(add(source, [{ id: 'a', deps: ['root'], writes: [w('a', [map, material, 'appearance'], { opacity: 0.5 })] },
      { id: 'b', deps: ['root'], writes: [w('b', [map, material, 'compositing'], { coverage: { policy: 'opaque' }, optics: 'inherit' })] }]));
    expect(codes(r)).toContain('incompatible-material-intent');
    const conflict = await read(fork(source, [map, material, 'appearance'], {}, { opacity: 0.5 }));
    expect(codes(conflict)).not.toContain('incompatible-material-intent');
    expect((conflict.unambiguousRecords.materialOverridesById as any)[material]).not.toHaveProperty('appearance');
  });
  it('reserves every candidate material key by owner ID, including routing and lifecycle conflicts, without inventing duplicate owners', async () => {
    const records = fixture(), map = 'materialOverridesById', first = records[map][id('ovr')], projectRouting = { ...first.routing, scope: { kind: 'project' } };
    records[map][id('ovr', 2)] = { ...first, id: id('ovr', 2), routing: projectRouting };
    const source = candidateFixture(records), r = await read(fork(source, [map, id('ovr'), 'routing'], first.routing, projectRouting));
    expect(r.issues.filter(i => i.code === 'candidate-semantic-key-reserved').map(i => i.path[1]).sort()).toEqual([id('ovr'), id('ovr', 2)]);
    const equal = await read(fork(candidateFixture(), [map, id('ovr'), 'routing'], first.routing, first.routing));
    expect(codes(equal)).not.toContain('candidate-semantic-key-reserved');
  });
  it('keeps excluded parent records distinct from missing parents and protects unseen children without restoring tombstones', async () => {
    const life = (n: number, state: 'active' | 'deleted') => ({ state, eventId: id('evt', n), reason: state === 'active' ? 'conflictResolution' : 'userDelete' });
    const r = await read(fork(candidateFixture(), ['captionsById', id('cap'), 'lifecycle'], life(2, 'deleted'), life(3, 'active')));
    expect(r.knownActiveRoots).toContain(id('cap')); expect(r.knownActiveRoots).toContain(id('att'));
    expect(r.issues).toContainEqual(expect.objectContaining({ path: ['captionAttachmentsById', id('att'), 'captionId'], code: 'pending-orphan-reference' }));
    expect(r.issues.some(i => i.path[0] === 'captionAttachmentsById' && i.code === 'unavailable-endpoint')).toBe(false);
    const unseen = await read(add(candidateFixture(), [{ id: 'delete', deps: ['root'], writes: [w('d', ['captionsById', id('cap'), 'lifecycle'], life(2, 'deleted'))] },
      { id: 'edit', deps: ['root'], writes: [w('e', ['captionsById', id('cap'), 'title'], '同時編集')] }]));
    expect(codes(unseen)).toContain('concurrent-delete-edit'); expect(unseen.knownActiveRoots).toContain(id('cap'));
  });
  it('checks every anchor and active-binding target, including a wrong candidate hidden by a valid alternative', async () => {
    const records = fixture(), anchor = records.captionsById[id('cap')].anchor;
    const anchors = await read(fork(candidateFixture(records), ['captionsById', id('cap'), 'anchor'], anchor, { ...anchor, assetFrameId: id('frm', 99) }));
    expect(codes(anchors)).toContain('wrong-asset-frame');
    const malformedSibling = await read(fork(candidateFixture(records), ['captionsById', id('cap'), 'anchor'], { ...anchor, assetFrameId: id('frm', 99) }, 'malformed'));
    expect(codes(malformedSibling)).toContain('wrong-asset-frame'); expect(codes(malformedSibling)).toContain('candidate-type');
    expect(malformedSibling.knownReferences).toContainEqual(expect.objectContaining({ from: id('cap'), to: id('ast') }));
    const bindings = await read(fork(candidateFixture(), ['assetsById', id('ast'), 'status'], { kind: 'ready', activeBindingId: id('bnd') }, { kind: 'ready', activeBindingId: id('bnd', 99) }));
    expect(bindings.issues).toContainEqual(expect.objectContaining({ code: 'missing-candidate-reference', operationId: 'b-op' }));
    expect(bindings.knownReferences).toContainEqual(expect.objectContaining({ from: id('ast'), to: id('bnd', 99) }));
  });
  it('recomputes every immutable candidate digest and keeps equal registrations distinct from mismatched payloads', async () => {
    const records = fixture(), record = records.representationsById[id('rep')], path = ['representationsById', id('rep')];
    const equal = await read(fork(candidateFixture(), path, record, record));
    expect(equal.fields.find(f => f.path.join('/') === path.join('/'))!.candidates).toHaveLength(2);
    expect((equal.unambiguousRecords.representationsById as any)[id('rep')]).toEqual(record);
    const corrupt = await read(fork(candidateFixture(), path, record, { ...record, payloadDigest: '0'.repeat(64) }));
    expect(codes(corrupt)).toContain('candidate-identity'); expect(codes(corrupt)).toContain('immutable-history-mutation');
    expect(corrupt.knownReferences).toContainEqual({ from: id('rep'), to: `blob:${record.blob.digest}`, field: 'blob', strength: 'strong' });
  });
  it('does not manufacture a duplicate key from disjoint unresolved parent candidates', async () => {
    const records = fixture(), cap = records.captionsById[id('cap')], membership = records.captionTagMembershipsById[id('tgm')];
    for (const n of [2, 3, 4]) records.captionsById[id('cap', n)] = { ...cap, id: id('cap', n) };
    records.captionTagMembershipsById[id('tgm', 2)] = { ...membership, id: id('tgm', 2), captionId: id('cap', 3) };
    const source = candidateFixture(records), map = 'captionTagMembershipsById';
    const r = await read(add(source, [
      { id: 'a', deps: ['root'], writes: [w('a1', [map, id('tgm'), 'captionId'], id('cap')), w('a2', [map, id('tgm', 2), 'captionId'], id('cap', 3))] },
      { id: 'b', deps: ['root'], writes: [w('b1', [map, id('tgm'), 'captionId'], id('cap', 2)), w('b2', [map, id('tgm', 2), 'captionId'], id('cap', 4))] },
    ]));
    expect(codes(r)).not.toContain('duplicate-semantic-key'); expect(codes(r)).not.toContain('candidate-semantic-key-reserved');
  });
  it('shares mutable field rules with whole-root admission and preserves the existing Scene/material guards', () => {
    const records = fixture(); expect(admitProjectRecords(records, valueLimits).kind).toBe('valid-records');
    for (const map of Object.keys(mutableRecordFields) as MutableRecordMap[]) for (const record of Object.values(records[map]) as any[]) {
      for (const [field, rule] of Object.entries(mutableRecordFields[map])) {
        expect(() => checkMutableField(new ProjectRecordFields(), map, field, record[field])).not.toThrow();
        if (!rule.optional) {
          expect(() => checkMutableField(new ProjectRecordFields(), map, field, undefined)).toThrow(DomainValidationError);
          const altered = fixture(); delete altered[map][record.id][field]; expect(admitProjectRecords(altered, valueLimits).kind).toBe('rejected');
        }
      }
    }
    expect(admitSceneRecord('scene', records.scenesById[id('scn')], valueLimits).kind).toBe('valid-record');
    expect(admitMaterialRecord(records.materialOverridesById[id('ovr')], valueLimits).kind).toBe('valid-record');
  });
});
