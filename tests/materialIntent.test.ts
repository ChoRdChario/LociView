import { describe, expect, it } from 'vitest';
import { editMaterialAppearance, materialInput, validateMaterialIntent } from '../src/domain/materialIntent';

const limits = { maxNodes: 1000, maxDepth: 12, maxStringScalars: 1000 };
const intent = (appearance: unknown = {}, coverage: unknown = { policy: 'inherit' }, optics = 'inherit') => ({ appearance, compositing: { coverage, optics } });
describe('decoded atomic material intent (not Project/source semantics/backend admission)', () => {
  it('clones/freezes unknown root, appearance, chroma and compositing information without reconstructing exact colors', () => {
    const raw = { ...intent({ baseColorSrgb: [0.123456, 0.5, 1], chroma: { keyColorSrgb: [0.123456, 0.234567, 0.345678], tolerance: 0.1, softness: 0, future: { mode: 'retained' } }, future: [1, '値'] }), future: { version: 2 } };
    const value = validateMaterialIntent(raw, limits); expect(value).toEqual(raw); expect(value).not.toBe(raw);
    expect(Object.isFrozen(value.appearance.chroma?.keyColorSrgb)).toBe(true);
    const next = editMaterialAppearance(value.appearance, { opacity: '30', softness: '0.2' });
    expect(next.baseColorSrgb).toBe(value.appearance.baseColorSrgb); expect(next.chroma?.keyColorSrgb).toBe(value.appearance.chroma?.keyColorSrgb);
    expect(next.chroma?.future).toEqual({ mode: 'retained' }); expect(next.future).toEqual([1, '値']); expect(next.opacity).toBe(0.3);
    expect(raw.appearance).not.toHaveProperty('opacity');
  });
  it('checks finite normalized appearance and complete known chroma while retaining unknown minor fields', () => {
    for (const opacity of [-1, 1.01, NaN, Infinity, '0.5', null]) expect(() => validateMaterialIntent(intent({ opacity }), limits)).toThrow();
    for (const appearance of [{ lighting: 'auto' }, { doubleSided: 1 }, { baseColorSrgb: [1, 0] }, { chroma: { keyColorSrgb: [0, 0, 0], tolerance: 0 } }])
      expect(() => validateMaterialIntent(intent(appearance), limits)).toThrow();
    expect(validateMaterialIntent(intent({ opacity: 0, doubleSided: false, lighting: 'inherit' }), limits).appearance.opacity).toBe(0);
    expect(() => validateMaterialIntent(intent(), { ...limits, maxNodes: 1 })).toThrow();
  });
  it('rejects opaque alpha/chroma and irrelevant cutoff, without claiming source transmission or backend support', () => {
    for (const appearance of [{ opacity: 0.9 }, { chroma: { keyColorSrgb: [0, 0, 0], tolerance: 0, softness: 0 } }])
      expect(() => validateMaterialIntent(intent(appearance, { policy: 'opaque' }), limits)).toThrow();
    for (const coverage of [{ policy: 'opaque', alphaCutoff: 0.5 }, { policy: 'mask' }, { policy: 'mask', alphaCutoff: 2 }, { policy: 'other' }])
      expect(() => validateMaterialIntent(intent({}, coverage), limits)).toThrow();
    for (const coverage of [{ policy: 'opaque' }, { policy: 'mask', alphaCutoff: 0 }, { policy: 'ditherCoverage' }, { policy: 'smoothBlend' }])
      expect(validateMaterialIntent(intent({}, coverage, 'transmission'), limits).compositing.optics).toBe('transmission');
  });
  it('preserves inherit/absence and refuses chroma removal that would erase unknown nested data', () => {
    const base = validateMaterialIntent(intent({ lighting: 'lit', doubleSided: true }), limits).appearance;
    expect(editMaterialAppearance(base, { doubleSided: 'inherit', lighting: 'inherit' })).toEqual({ lighting: 'inherit' });
    const future = validateMaterialIntent(intent({ chroma: { keyColorSrgb: [0, 0, 0], tolerance: 0.1, softness: 0, future: true } }), limits).appearance;
    expect(() => editMaterialAppearance(future, { chroma: 'off' })).toThrow('未対応');
    expect(editMaterialAppearance(future, { opacity: '40' }).chroma?.future).toBe(true);
    expect(() => editMaterialAppearance(base, { chroma: 'off', keyColor: '#ffffff' })).toThrow();
  });
  it('validates explicit raw edits, uses finite percent conversion, and never silently coerces unsupported choices', () => {
    const base = validateMaterialIntent(intent(), limits).appearance;
    for (const opacity of ['', ' ', '101', '-0.1', 'NaN', 'Infinity']) expect(() => editMaterialAppearance(base, { opacity })).toThrow();
    expect(() => editMaterialAppearance(base, { lighting: 'auto' })).toThrow();
    expect(() => editMaterialAppearance(base, { doubleSided: 'both?' })).toThrow();
    expect(() => editMaterialAppearance(base, { chroma: 'on', keyColor: 'red' })).toThrow();
    const next = editMaterialAppearance(base, { chroma: 'on', keyColor: '#12ABef', tolerance: '0.2', softness: '0.3' });
    expect(next.chroma).toEqual({ keyColorSrgb: [18 / 255, 171 / 255, 239 / 255], tolerance: 0.2, softness: 0.3 });
    expect(materialInput(next, 'keyColor')).toBe('#12abef'); expect(materialInput(base, 'doubleSided')).toBe('inherit');
  });
});
