import { describe, expect, it } from 'vitest';
import { inspectAtomicHistory, type AtomicChange, type AtomicHistory, type AtomicWrite, type HistoryReadLimits } from '../src/domain/atomicHistory';
import { projectFieldPolicy, reviewProjectHistory } from '../src/domain/projectHistoryReview';
import type { JsonValue } from '../src/domain/values';
import { fixture } from './helpers/projectRecordsFixture';

const limits: HistoryReadLimits = { maxNodes: 100_000, maxDepth: 32, maxStringScalars: 65_536, maxWork: 100_000 };
const id = (prefix: string, n = 1) => `${prefix}_${String(n).padStart(32, '0')}`;
const title = ['captionsById', id('cap'), 'title'], lifecycle = ['captionsById', id('cap'), 'lifecycle'];
const write = (operationId: string, path: readonly string[], value: JsonValue): AtomicWrite => ({ operationId, path, value: { kind: 'value', value } });
const life = (event: number, state: 'active' | 'deleted' = 'active', reason = state === 'active' ? 'initial' : 'userDelete') => ({ eventId: id('evt', event), state, reason });
const change = (id: string, deps: string[], ...writes: AtomicWrite[]): AtomicChange => ({ id, deps, writes });
const history = (heads: string[], ...changes: AtomicChange[]): AtomicHistory => ({ token: 'snapshot', heads, changes });
const base = change('root', [], write('root-title', title, '初期値'), write('root-life', lifecycle, life(1)));
const inspect = (h: AtomicHistory) => { const r = inspectAtomicHistory(h, limits); expect(r.kind).toBe('atomic-history-inspection'); if (r.kind === 'rejected') throw Error(); return r; };
const review = (h: AtomicHistory) => { const r = reviewProjectHistory(h, limits); expect(r.kind).toBe('project-history-inspection'); if (r.kind === 'rejected') throw Error(); return r; };

describe('neutral original atomic history inspection, not Project/provider adoption', () => {
  it('retains equal and unequal concurrent candidates, independent fields and the exact original DAG', () => {
    const a = change('a', ['root'], write('oa', title, '同じ')), b = change('b', ['root'], write('ob', title, '同じ'));
    const input = history(['a', 'b'], base, a, b), r = inspect(input);
    expect(r.fields.find(f => f.path.at(-1) === 'title')!.candidates.map(c => c.operationId)).toEqual(['oa', 'ob']);
    expect(r.history).toEqual(input); expect(Object.isFrozen(r.history.changes[0])).toBe(true);
    expect(review(input).issues).toContainEqual({ path: title, kind: 'review', code: 'atomic-field-conflict' });
    const resolved = inspect(history(['resolution'], b, change('resolution', ['a', 'b'], write('oc', title, '同じ')), base, a));
    expect(resolved.fields.find(f => f.path.at(-1) === 'title')!.candidates.map(c => c.operationId)).toEqual(['oc']);
    expect(resolved.history.changes).toHaveLength(4);
  });
  it('keeps explicit absence distinct from null and catches partial/forged provenance and duplicate identities', () => {
    const absent: AtomicWrite = { operationId: 'oa', path: title, value: { kind: 'absent' } };
    const h = history(['a', 'b'], base, change('a', ['root'], absent), change('b', ['root'], write('ob', title, null)));
    expect(inspect(h).fields.find(f => f.path.at(-1) === 'title')!.candidates.map(c => c.value)).toEqual([{ kind: 'absent' }, { kind: 'value', value: null }]);
    for (const bad of [history(['missing'], base), history(['root'], base, change('a', ['missing'])), history(['root'], base, base), history(['root'], change('root', ['root'])),
      history(['a'], base, change('a', ['root'], write('root-title', title, 'bad'))), history(['a'], base, change('a', ['root'], write('oa', title, 'a'), write('ob', title, 'b')))])
      expect(inspectAtomicHistory(bad, limits).kind).toBe('rejected');
  });
  it('enforces one shared input/work budget and rejects unsafe decoded inputs without invoking getters', () => {
    let invoked = false; const getter: any = history(['root'], base); Object.defineProperty(getter, 'changes', { enumerable: true, get() { invoked = true; throw Error(); } });
    expect(inspectAtomicHistory(getter, limits).kind).toBe('rejected'); expect(invoked).toBe(false);
    expect(inspectAtomicHistory(history(['root'], base), { ...limits, maxNodes: 5 }).kind).toBe('rejected');
    const concurrent = history(['a', 'b'], base, change('a', ['root'], write('a', title, 'x')), change('b', ['root'], write('b', title, 'y')));
    expect(inspectAtomicHistory(concurrent, { ...limits, maxWork: 1 }).kind).toBe('rejected');
    const causal = history(['a', 'b'], base, change('a', ['root'], write('a', title, 'x')), change('b', ['root'], write('b', lifecycle, life(2, 'deleted'))));
    const consumed = inspect(causal).workUsed;
    expect(reviewProjectHistory(causal, { ...limits, maxWork: consumed }).kind).toBe('rejected');
    for (const n of [NaN, -1, Infinity]) expect(inspectAtomicHistory(concurrent, { ...limits, maxWork: n }).kind).toBe('rejected');
  });
  it('checks immutable mutation hidden by later restoration, without upgrading unknown fields into known policy', () => {
    const frame = ['project', 'frame'];
    const h = history(['b'], change('root', [], write('o0', frame, { value: 1 })), change('a', ['root'], write('oa', frame, { value: 2 })), change('b', ['a'], write('ob', frame, { value: 1 })));
    expect(review(h).issues).toContainEqual({ path: frame, kind: 'invalid', code: 'immutable-history-mutation' });
    const unknown = ['captionsById', id('cap'), 'future'];
    const r = review(history(['a', 'b'], base, change('a', ['root'], write('oa', unknown, { opaque: 'retain' })), change('b', ['root'], write('ob', unknown, [1, null]))));
    expect(r.fields.find(f => f.policy === 'unknown')!.candidates).toHaveLength(2);
    expect(r.issues).toContainEqual({ path: unknown, code: 'unknown-field-policy', kind: 'unverified' }); expect(r).not.toHaveProperty('resources');
    const repPath = ['representationsById', id('rep')], rep = Object.values(fixture().representationsById)[0] as JsonValue;
    const repeated = review(history(['a', 'b'], change('root', []), change('a', ['root'], write('oa', repPath, rep)), change('b', ['root'], write('ob', repPath, rep))));
    expect(repeated.issues).toEqual([]); expect(repeated.fields[0]!.candidates).toHaveLength(2);
    const frames = review(history(['a', 'b'], change('root', []), change('a', ['root'], write('oa', frame, { id: 'same' })), change('b', ['root'], write('ob', frame, { id: 'same' }))));
    expect(frames.issues.map(i => i.code)).toContain('immutable-field-conflict');
  });
  it('distinguishes observed edits, concurrent deletion, forbidden after-delete edits and explicit restoration', () => {
    const edited = change('edit', ['root'], write('oe', title, '編集')), deleted = change('delete', ['root'], write('od', lifecycle, life(2, 'deleted')));
    expect(review(history(['delete'], base, edited, { ...deleted, deps: ['edit'] })).issues).toEqual([]);
    expect(review(history(['edit', 'delete'], base, edited, deleted)).issues).toContainEqual({ path: lifecycle, kind: 'review', code: 'concurrent-delete-edit' });
    const invalid = review(history(['edit'], base, deleted, { ...edited, deps: ['delete'] }));
    expect(invalid.issues).toContainEqual({ path: title, kind: 'invalid', code: 'edit-after-delete-without-restore' });
    const restored = change('restore', ['delete'], write('or', lifecycle, life(3, 'active', 'restore'))), later = { ...edited, deps: ['restore'] };
    expect(review(history(['edit'], base, deleted, restored, later)).issues).toEqual([]);
    const fresh = change('restore', ['delete'], write('or', lifecycle, life(3)));
    expect(review(history(['edit'], base, deleted, fresh, later)).issues.map(i => i.code)).toEqual(expect.arrayContaining(['initial-after-delete', 'edit-after-delete-without-restore']));
  });
  it('retains concurrent fields through keep-deleted resolution and allows same-command explicit restore plus edits', () => {
    const a = change('a', ['root'], write('oa', title, '手元')), b = change('b', ['root'], write('ob', lifecycle, life(2, 'deleted')));
    const keep = change('keep', ['a', 'b'], write('ok', lifecycle, life(3, 'deleted', 'conflictResolution')));
    expect(review(history(['keep'], base, a, b, keep)).issues).toEqual([]);
    const restore = change('restore', ['keep'], write('or', lifecycle, life(4, 'active', 'restore'))), edit = write('ot', title, '再開');
    expect(review(history(['restore'], base, a, b, keep, { ...restore, writes: [...restore.writes, edit] })).issues).toEqual([]);
    const reused = change('again', ['keep'], write('oo', lifecycle, life(3, 'deleted', 'conflictResolution')));
    expect(review(history(['again'], base, a, b, keep, reused)).issues.map(i => i.code)).toContain('lifecycle-event-reused');
  });
  it('classifies each approved field boundary and refuses known nested atomic writes without guessing endpoint changes', () => {
    const cases: [readonly string[], string][] = [[['project', 'defaultSceneId'], 'root-default'], [['scenesById', id('scn'), 'defaultViewId'], 'optional-default'],
      [['captionsById', id('cap'), 'anchor'], 'spatial'], [['assetsById', id('ast'), 'status'], 'existence'], [['viewsById', id('view'), 'orderKey'], 'order'],
      [['captionAttachmentsById', id('att'), 'mediaResourceId'], 'parent'], [['sceneAssetMembershipsById', id('sam'), 'assetId'], 'immutable'],
      [['viewsById', id('view'), 'sceneId'], 'immutable'], [['representationsById', id('rep')], 'immutable'], [['assetsById', id('ast'), 'orderKey'], 'unknown']];
    for (const [path, policy] of cases) expect(projectFieldPolicy(path)).toBe(policy);
    for (const path of [['project', 'frame', 'id'], ['captionsById', id('cap'), 'anchor', 'assetId'], ['representationsById', id('rep'), 'blob']])
      expect(reviewProjectHistory(history(['a'], base, change('a', ['root'], write('bad', path, 'bad'))), limits).kind).toBe('rejected');
  });
});
