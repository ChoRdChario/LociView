import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge';
import { readFlatAtomicHistory } from './atomic-read';
import { reviewProjectHistory } from '../../src/domain/projectHistoryReview';
import { createDevelopmentPair } from './development';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { candidateFixture } from '../../tests/helpers/projectCandidateFixture';
import { id as fixtureId } from '../../tests/helpers/projectRecordsFixture';

const limits = { maxNodes: 100_000, maxDepth: 32, maxStringScalars: 65_536, maxWork: 100_000 };
const id = (p: string) => `${p}_${'1'.repeat(32)}`;
const path = ['captionsById', id('cap'), 'colorSrgb'], key = JSON.stringify(path);
const mapping = { path: (key: string) => JSON.parse(key) as string[], value: (_key: string, text: string) => JSON.parse(text) };

describe('isolated exact 3.4.1 original atomic read proof, not adopted metadata', () => {
  it('extracts absent-vs-value candidates lost by the materialized map and preserves original operations across save/reload', () => {
    const base = A.from({ cells: { [key]: new A.ImmutableString('[1,0,0]') } });
    const a = A.change(A.clone(base), d => { delete d.cells[key]; });
    const b = A.change(A.clone(base), d => { d.cells[key] = new A.ImmutableString('null'); });
    const merged = A.merge(A.clone(a), A.clone(b)), read = readFlatAtomicHistory(A, merged, mapping, limits);
    expect(read.kind).toBe('atomic-history-inspection'); if (read.kind === 'rejected') throw Error();
    expect(read.fields[0]!.candidates.map(c => c.value)).toEqual(expect.arrayContaining([{ kind: 'absent' }, { kind: 'value', value: null }]));
    const reopened = A.load<typeof merged>(A.save(merged)) as unknown as typeof merged;
    const reread = readFlatAtomicHistory(A, reopened, mapping, limits); expect(reread).toEqual(read);
    const reviewed = reviewProjectHistory(read.history, limits); expect(reviewed.kind).toBe('project-history-inspection');
    if (reviewed.kind === 'project-history-inspection') expect(reviewed.fields[0]!.candidates).toHaveLength(2);
  });
  it('preserves an explicitly repeated equal assignment as a fresh operation and rejects hidden nested/root writes', () => {
    const pair = createDevelopmentPair(A, { [key]: '[1,0,0]' }, () => {}), before = pair[0].read();
    const after = pair[0].write(before.token, { [key]: '[1,0,0]' });
    expect(after.originalAtomicHistory).toBeDefined(); expect(after.originalAtomicHistory!.changes.length).toBeGreaterThan(before.originalAtomicHistory!.changes.length);
    const raw = A.from<any>({ cells: { [key]: { nested: 'not-atomic' } } });
    expect(() => readFlatAtomicHistory(A, raw, mapping, limits)).toThrow();
    const outside = A.from<any>({ cells: { [key]: new A.ImmutableString('null') }, extra: 'hidden' });
    expect(() => readFlatAtomicHistory(A, outside, mapping, limits)).toThrow();
  });
  it('keeps original change identities through two rounds and refuses noninjective path mappings', () => {
    const pair = createDevelopmentPair(A, { one: 'initial', two: 'other' }, () => {});
    pair[0].write(pair[0].read().token, { one: 'participant' }); pair[1].receive(pair[0].exportUpdate());
    pair[1].write(pair[1].read().token, { two: 'round 2' }); pair[0].receive(pair[1].exportUpdate());
    expect(pair[0].read().originalAtomicHistory).toEqual(pair[1].read().originalAtomicHistory);
    const d = A.from({ cells: { one: new A.ImmutableString('null'), two: new A.ImmutableString('null') } });
    expect(() => readFlatAtomicHistory(A, d, { ...mapping, path: () => path }, limits)).toThrow();
  });
  it('feeds the full synthetic Project through original-operation extraction after two actual candidate rounds', async () => {
    const source = candidateFixture(), writes = source.history.changes[0]!.writes;
    const seed = Object.fromEntries(writes.map(w => { if (w.value.kind !== 'value') throw Error();
      return [JSON.stringify(w.path), new A.ImmutableString(JSON.stringify(w.value.value))]; }));
    const titleKey = JSON.stringify(['captionsById', fixtureId('cap'), 'title']), bodyKey = JSON.stringify(['captionsById', fixtureId('cap'), 'body']);
    const base = A.from({ cells: seed });
    let first = A.change(A.clone(base), d => { d.cells[titleKey] = new A.ImmutableString(JSON.stringify('手元の題名')); });
    let second = A.change(A.clone(base), d => { d.cells[bodyKey] = new A.ImmutableString(JSON.stringify('相手の本文')); });
    first = A.merge(A.clone(first), A.clone(second)); second = A.merge(A.clone(second), A.clone(first));
    const inspect = async (doc: typeof base) => {
      const atomic = readFlatAtomicHistory(A, doc, mapping, { ...limits, maxWork: 1_000_000 });
      if (atomic.kind === 'rejected') throw Error();
      return inspectProjectCandidates({ ...source, history: atomic.history }, { ...limits, maxWork: 1_000_000 });
    };
    const initial = await inspect(first); expect(initial.kind).toBe('project-candidate-inspection');
    if (initial.kind === 'rejected') throw Error();
    expect(initial.issues.every(i => i.kind === 'unverified')).toBe(true);
    expect((initial.unambiguousRecords.captionsById as any)[fixtureId('cap')]).toMatchObject({ title: '手元の題名', body: '相手の本文' });
    first = A.change(first, d => { d.cells[titleKey] = new A.ImmutableString(JSON.stringify('2回目・手元')); });
    second = A.change(second, d => { d.cells[titleKey] = new A.ImmutableString(JSON.stringify('2回目・相手')); });
    const merged = A.merge(A.clone(first), A.clone(second)), conflicted = await inspect(merged);
    if (conflicted.kind === 'rejected') throw Error();
    expect(conflicted.fields.find(f => JSON.stringify(f.path) === titleKey)!.candidates).toHaveLength(2);
    expect((conflicted.unambiguousRecords.captionsById as any)[fixtureId('cap')]).not.toHaveProperty('title');
    const restored = A.load<{ cells: typeof seed }>(A.save(merged));
    expect(await inspect(restored)).toEqual(conflicted);
    expect([...conflicted.source.history.changes].map(c => c.id).sort()).toEqual(A.getAllChanges(merged).map(bytes => A.decodeChange(bytes).hash).sort());
  });
});
