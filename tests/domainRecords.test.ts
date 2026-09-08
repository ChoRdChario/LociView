import { describe, expect, it } from 'vitest';
import { admitSceneRecord, type SceneRecordKind } from '../src/domain/sceneRecords';
import { cloneCanonicalValue, DomainValidationError, normalizeSceneName, type ValueLimits } from '../src/domain/values';

const limits: ValueLimits = { maxNodes: 500, maxDepth: 12, maxStringScalars: 65_536 };
const id = (prefix: string, number = 1) => `${prefix}_${number.toString(16).padStart(32, '0')}`;
const life = () => ({ state: 'active', eventId: id('evt'), reason: 'initial' });
const scene = () => ({ id: id('scn'), name: '資料の位置', orderKey: 'A0', lifecycle: life() });
const edge = (kind: 'assetMembership' | 'captionMembership') => ({
  id: id(kind === 'assetMembership' ? 'sam' : 'scm'), sceneId: id('scn'),
  [kind === 'assetMembership' ? 'assetId' : 'captionId']: id(kind === 'assetMembership' ? 'ast' : 'cap'),
  orderKey: 'B', lifecycle: life(),
});
function rejected(input: unknown, code?: string, kind: SceneRecordKind = 'scene') {
  const result = admitSceneRecord(kind, input, limits);
  expect(result.kind).toBe('rejected');
  if (result.kind === 'rejected' && code) expect(result.issue.code).toBe(code);
}
function invalidValue(input: unknown, code: string, budget = limits) {
  try { cloneCanonicalValue(input, budget); throw new Error('Unexpected admission'); }
  catch (error) {
    expect(error).toBeInstanceOf(DomainValidationError);
    expect((error as DomainValidationError).issue.code).toBe(code);
  }
}

describe('reusable v2 individual record admission (not Project/storage admission)', () => {
  it('admits exact Scene and distinct Asset/Caption edge shapes, with optional absent View', () => {
    for (const [kind, input] of [['scene', scene()], ['assetMembership', edge('assetMembership')],
      ['captionMembership', edge('captionMembership')]] as const) {
      const result = admitSceneRecord(kind, input, limits, input.id);
      expect(result).toMatchObject({ kind: 'valid-record', record: input, hasUnknownFields: false });
      if (result.kind === 'valid-record') {
        expect(Object.isFrozen(result.record)).toBe(true);
        expect(Object.isFrozen(result.record.lifecycle)).toBe(true);
        expect(result.record).not.toBe(input);
      }
    }
    expect(admitSceneRecord('scene', { ...scene(), defaultViewId: id('view') }, limits).kind).toBe('valid-record');
    // These shapes do not assert that the referenced endpoint exists/is active.
    expect(admitSceneRecord('assetMembership', { ...edge('assetMembership'), assetId: id('ast', 99) }, limits).kind)
      .toBe('valid-record');
  });

  it('preserves independent unknown subtrees including lifecycle, and signals unknown semantics', () => {
    const input = { ...scene(), future: { note: '将来の値', list: [0.25, false, null] },
      lifecycle: { ...life(), extra: { display: '補助情報' } } };
    const result = admitSceneRecord('scene', input, limits);
    expect(result.kind).toBe('valid-record'); if (result.kind !== 'valid-record') return;
    expect(result.hasUnknownFields).toBe(true);
    expect(result.record).toEqual(input);
    input.future.list.push(2); input.lifecycle.extra.display = 'Changed';
    expect(result.record.future).toEqual({ note: '将来の値', list: [0.25, false, null] });
    expect(result.record.lifecycle.extra).toEqual({ display: '補助情報' });
    expect(Object.isFrozen(result.record.future)).toBe(true);
    expect(Object.getPrototypeOf(result.record)).toBeNull();
  });

  it('rejects wrong nominal prefixes, legacy IDs, noncanonical IDs and map-key mismatch', () => {
    for (const badId of [id('set'), id('sam'), 'scn_01ARZ3NDEKTSV4RRFFQ69G5FAV', id('scn').toUpperCase()])
      rejected({ ...scene(), id: badId }, 'id');
    expect(admitSceneRecord('scene', scene(), limits, id('scn', 2))).toMatchObject({ kind: 'rejected', issue: { code: 'identity' } });
    rejected({ ...scene(), defaultViewId: id('scn') }, 'id');
    rejected({ ...scene(), defaultViewId: null }, 'id');
    rejected({ ...edge('assetMembership'), assetId: id('cap') }, 'id', 'assetMembership');
    rejected({ ...edge('captionMembership'), sceneId: id('set') }, 'id', 'captionMembership');
    const missingEndpoint = edge('assetMembership'); delete missingEndpoint.assetId;
    rejected({ ...missingEndpoint, resourceId: id('ast') }, 'missing', 'assetMembership');
  });

  it('validates the complete lifecycle union without dropping extension members', () => {
    const active = ['initial', 'restore', 'migrationResolution', 'conflictResolution'];
    const deleted = ['userDelete', 'replacement', 'migrationResolution', 'conflictResolution'];
    for (const [state, reasons] of [['active', active], ['deleted', deleted]] as const) {
      for (const reason of reasons) expect(admitSceneRecord('scene', { ...scene(),
        lifecycle: { state, eventId: id('evt'), reason } }, limits).kind).toBe('valid-record');
    }
    expect(admitSceneRecord('scene', { ...scene(), lifecycle: { state: 'active', eventId: id('evt') } }, limits).kind)
      .toBe('valid-record');
    for (const lifecycle of [{ state: 'deleted', eventId: id('evt') },
      { state: 'active', eventId: id('evt'), reason: 'userDelete' },
      { state: 'deleted', eventId: id('evt'), reason: 'restore' },
      { state: 'future', eventId: id('evt') }, { ...life(), eventId: id('cap') }, { ...life(), reason: null }])
      rejected({ ...scene(), lifecycle });
  });

  it('enforces stored NFC/scalar/single-line/order limits without rewriting input', () => {
    const input = { ...scene(), name: 'e\u0301' };
    rejected(input, 'canonical'); expect(input.name).toBe('e\u0301');
    for (const name of ['\ud800', '\udfff', 'x\ud800y']) rejected({ ...scene(), name }, 'unicode');
    for (const name of ['A\tB', 'A\u0085B', 'A\u2028B', 'A\u2029B', 'A\u007fB'])
      rejected({ ...scene(), name }, 'value');
    expect(admitSceneRecord('scene', { ...scene(), name: '📍'.repeat(256) }, limits).kind).toBe('valid-record');
    // The stored-label contract has no nonblank minimum; local authoring does.
    for (const name of ['', ' ']) expect(admitSceneRecord('scene', { ...scene(), name }, limits).kind).toBe('valid-record');
    rejected({ ...scene(), name: '📍'.repeat(257) }, 'limit');
    for (const orderKey of ['', 'x'.repeat(65), 'a-b', 'あ', 0]) rejected({ ...scene(), orderKey }, 'value');
    rejected({ ...scene(), future: { text: 'e\u0301' } }, 'canonical');
    rejected({ ...scene(), future: { number: Infinity } }, 'value');
    expect(normalizeSceneName('e\u0301')).toBe('é');
    expect(() => normalizeSceneName(' ')).toThrow(DomainValidationError);
    expect(() => normalizeSceneName('A\u0085B')).toThrow(DomainValidationError);
  });

  it('rejects dangerous/invalid keys, accessors, symbols and non-JSON values without executing getters', () => {
    for (const key of ['__proto__', 'prototype', 'constructor', 'bad\u0085key']) {
      const extra = Object.create(null); extra[key] = 1;
      rejected({ ...scene(), extra }, 'key');
    }
    rejected({ ...scene(), extra: { 'e\u0301': 1, 'é': 2 } }, 'canonical');
    let calls = 0;
    const input = scene(); Object.defineProperty(input, 'name', { enumerable: true, get() { calls++; return 'Getter'; } });
    rejected(input, 'type'); expect(calls).toBe(0);
    const arr: unknown[] = [1]; Object.defineProperty(arr, '0', { enumerable: true, get() { calls++; return 1; } });
    invalidValue(arr, 'type'); expect(calls).toBe(0);
    for (const extra of [undefined, () => 1, Symbol('x'), 1n, new Date(), new Map(), new Set(), new Uint8Array(1)])
      rejected({ ...scene(), extra }, 'type');
    rejected({ ...scene(), [Symbol('hidden')]: 1 }, 'key');
    const nonenumerable = scene(); Object.defineProperty(nonenumerable, 'hidden', { value: 1 }); rejected(nonenumerable, 'type');
  });

  it('bounds all traversal including unknown data, rejects cycles/sparse arrays, preserves ordinary aliases', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle; invalidValue(cycle, 'type');
    invalidValue(new Array(3), 'type');
    const extra = [1]; Object.defineProperty(extra, 'extra', { value: 2, enumerable: true }); invalidValue(extra, 'type');
    const child = { value: 0.5 }; expect(cloneCanonicalValue([child, child], limits)).toEqual([child, child]);
    expect(Object.is(cloneCanonicalValue(-0, limits), 0)).toBe(true);
    expect(cloneCanonicalValue(1.5, limits)).toBe(1.5);
    expect(cloneCanonicalValue({ a: [1] }, { ...limits, maxNodes: 3, maxDepth: 2 })).toEqual({ a: [1] });
    invalidValue({ a: [1] }, 'limit', { ...limits, maxNodes: 2 });
    invalidValue({ a: [1] }, 'limit', { ...limits, maxDepth: 1 });
    invalidValue('📍📍', 'limit', { ...limits, maxStringScalars: 1 });
    invalidValue({ ab: 0 }, 'limit', { ...limits, maxStringScalars: 1 });
    for (const bad of [{ maxDepth: 33 }, { maxDepth: 0 }, { maxNodes: 5_000_001 },
      { maxNodes: 1.5 }, { maxStringScalars: NaN }]) invalidValue({}, 'limit', { ...limits, ...bad });
    const result = admitSceneRecord('scene', { ...scene(), future: [1, 2, 3] }, { ...limits, maxNodes: 2 });
    expect(result).toMatchObject({ kind: 'rejected', issue: { code: 'limit' } });
  });
});
