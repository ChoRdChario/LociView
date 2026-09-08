import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge';
import { readFlatAtomicHistory } from './atomic-read';
import { reviewProjectHistory } from '../../src/domain/projectHistoryReview';
import { createDevelopmentPair } from './development';

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
});
