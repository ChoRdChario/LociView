import { describe, expect, it } from 'vitest';
import { admitMaterialRecord } from '../src/domain/materialRecords';
import { admitSceneRecord } from '../src/domain/sceneRecords';

const id = (prefix: string, n = 1) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
const limits = { maxNodes: 1000, maxDepth: 12, maxStringScalars: 1000 };
const fixture = () => ({ id: id('ovr'), routing: { scope: { kind: 'scene', sceneId: id('scn') },
  target: { assetId: id('ast'), variantFamilyId: id('fam'), materialLayoutId: id('lay'), logicalMaterialSlotId: id('slot') } },
  appearance: { opacity: 0.75, baseColorSrgb: [0.123456, 0.5, 0.75] },
  compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' }, lifecycle: { state: 'active', eventId: id('evt'), reason: 'initial' } });

describe('individual MaterialOverride admission (not graph/source/backend/history validity)', () => {
  it('admits exact Scene/Project routes, preserves full values and rejects map-key mismatch', () => {
    const input = fixture(); const result = admitMaterialRecord(input, limits, input.id);
    expect(result).toMatchObject({ kind: 'valid-record', record: input, hasUnknownFields: false });
    if (result.kind !== 'valid-record') return;
    expect(result.record).not.toBe(input); expect(Object.isFrozen(result.record.routing.target)).toBe(true);
    expect(Object.getPrototypeOf(result.record.routing.scope)).toBeNull();
    expect(admitMaterialRecord({ ...input, routing: { ...input.routing, scope: { kind: 'project' } } }, limits).kind).toBe('valid-record');
    expect(admitMaterialRecord(input, limits, id('ovr', 9))).toMatchObject({ kind: 'rejected', issue: { code: 'identity' } });
    // This layer checks nominal IDs, NOT that these resources exist or share a catalog.
    expect(admitMaterialRecord({ ...input, routing: { ...input.routing, target: { ...input.routing.target, assetId: id('ast', 99) } } }, limits).kind).toBe('valid-record');
  });
  it('rejects wrong nominal IDs, missing endpoints, old scopes and irrelevant known Scene fields without repair', () => {
    const input = fixture();
    for (const key of [id('mat'), id('ovr').toUpperCase(), 'ovr_01ARZ3NDEKTSV4RRFFQ69G5FAV'])
      expect(admitMaterialRecord({ ...input, id: key }, limits).kind).toBe('rejected');
    for (const scope of [{ kind: 'displaySet', displaySetId: id('set') }, { kind: 'scene' }, { kind: 'scene', sceneId: id('set') },
      { kind: 'project', sceneId: id('scn') }, { kind: 'project', sceneId: null }, { kind: 'other' }])
      expect(admitMaterialRecord({ ...input, routing: { ...input.routing, scope } }, limits).kind).toBe('rejected');
    for (const field of Object.keys(input.routing.target)) {
      expect(admitMaterialRecord({ ...input, routing: { ...input.routing, target: { ...input.routing.target, [field]: id('cap') } } }, limits).kind).toBe('rejected');
      const partial: Record<string, string> = { ...input.routing.target }; delete partial[field];
      expect(admitMaterialRecord({ ...input, routing: { ...input.routing, target: partial } }, limits).kind).toBe('rejected');
    }
    expect(input.routing.scope.kind).toBe('scene');
  });
  it('reports and retains unknown information independently at every record/atomic level', () => {
    const input = fixture(), extra = { nested: [0.25, false, '将来の値'] };
    const cases = [
      { ...input, future: extra },
      { ...input, routing: { ...input.routing, future: extra } },
      { ...input, routing: { ...input.routing, scope: { ...input.routing.scope, future: extra } } },
      { ...input, routing: { ...input.routing, target: { ...input.routing.target, future: extra } } },
      { ...input, lifecycle: { ...input.lifecycle, future: extra } },
      { ...input, appearance: { ...input.appearance, future: extra } },
      { ...input, appearance: { ...input.appearance, chroma: { keyColorSrgb: [0, 0, 0], tolerance: 0.1, softness: 0, future: extra } } },
      { ...input, compositing: { ...input.compositing, future: extra } },
      { ...input, compositing: { ...input.compositing, coverage: { ...input.compositing.coverage, future: extra } } },
    ];
    for (const item of cases) expect(admitMaterialRecord(item, limits)).toMatchObject({ kind: 'valid-record', record: item, hasUnknownFields: true });
    const result = admitMaterialRecord(cases[0], limits); extra.nested.push(1);
    if (result.kind === 'valid-record') expect(result.record.future).toEqual({ nested: [0.25, false, '将来の値'] });
  });
  it('shares unchanged lifecycle rules with Scene admission, including retained tombstones and invalid cases', () => {
    const input = fixture();
    for (const lifecycle of [input.lifecycle, { state: 'active', eventId: id('evt') },
      ...['initial', 'restore', 'migrationResolution', 'conflictResolution'].map(reason => ({ state: 'active', eventId: id('evt'), reason })),
      ...['userDelete', 'replacement', 'migrationResolution', 'conflictResolution'].map(reason => ({ state: 'deleted', eventId: id('evt'), reason })),
      { state: 'deleted', eventId: id('evt') }, { state: 'deleted', eventId: id('evt'), reason: 'restore' },
      { state: 'active', eventId: id('evt'), reason: 'userDelete' }, { state: 'active', eventId: id('cap') }, { state: 'future', eventId: id('evt') }]) {
      const scene = admitSceneRecord('scene', { id: id('scn'), name: '確認', orderKey: 'A', lifecycle }, limits);
      const material = admitMaterialRecord({ ...input, lifecycle }, limits);
      expect(material.kind).toBe(scene.kind);
      if (material.kind === 'valid-record') expect(material.record.lifecycle).toEqual(lifecycle);
    }
  });
  it('composes canonical and appearance guards before returning admission; no getter, unbounded subtree or alpha repair', () => {
    const input = fixture();
    for (const item of [{ ...input, appearance: { opacity: NaN } }, { ...input, appearance: { opacity: -0.01 } },
      { ...input, compositing: { coverage: { policy: 'opaque' }, optics: 'inherit' } },
      { ...input, future: { label: 'e\u0301' } }, { ...input, routing: null }]) expect(admitMaterialRecord(item, limits).kind).toBe('rejected');
    expect(admitMaterialRecord(input, { ...limits, maxNodes: 3 }).kind).toBe('rejected');
    const unsafe = Object.create(null); unsafe.constructor = 'bad'; expect(admitMaterialRecord({ ...input, future: unsafe }, limits).kind).toBe('rejected');
    let calls = 0; Object.defineProperty(input.routing, 'scope', { enumerable: true, get: () => { calls++; return { kind: 'project' }; } });
    expect(admitMaterialRecord(input, limits).kind).toBe('rejected'); expect(calls).toBe(0);
  });
});
