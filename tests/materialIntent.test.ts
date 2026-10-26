import { describe, expect, it } from 'vitest';
import { editMaterialIntent, editMaterialAppearance, materialInput, materialForDisplay, validateMaterialIntent } from '../src/domain/materialIntent';

const limits = { maxNodes: 1000, maxDepth: 12, maxStringScalars: 1000 };
const intent = (appearance: unknown = {}, coverage: unknown = { policy: 'inherit' }, optics = 'inherit') => ({ appearance, compositing: { coverage, optics } });
describe('decoded atomic material intent (not Project/source semantics/backend admission)', () => {
  it('edits explicit cutout without rebuilding untouched appearance or unknown compositing values', () => {
    const base = validateMaterialIntent(intent({ lighting: 'unlit', chroma: { enabled: false,
      keyColorSrgb: [0.2, 0.4, 0.6], tolerance: 0.2, softness: 0.3 } }), limits, 'map2');
    const mask = editMaterialIntent(base, { coverage: 'mask', cutoff: '0' }, 'map2');
    expect(mask.appearance).toEqual(base.appearance);
    expect(mask.compositing).toEqual({ coverage: { policy: 'mask', alphaCutoff: 0 }, optics: 'inherit' });
    expect(materialInput(mask.appearance, 'coverage', 'map2', mask.compositing)).toBe('mask');
    const soft = editMaterialIntent(mask, { opacity: '40', chroma: 'on', softness: '0.6', cutoff: '1' }, 'map2');
    expect(validateMaterialIntent(soft, limits, 'map2').appearance).toMatchObject({ opacity: 0.4, chroma: { enabled: true, softness: 0.6 } });
    expect(soft.compositing.coverage.alphaCutoff).toBe(1);
    const extra = { ...mask, compositing: { ...mask.compositing, future: { retained: true } } };
    expect(editMaterialIntent(extra, { cutoff: '0.5' }, 'map2').compositing.future).toEqual({ retained: true });
    expect(editMaterialIntent(base, { coverage: 'opaque' }, 'map2').appearance.chroma).toEqual(base.appearance.chroma);
    for (const cutoff of ['', ' ', '-1', '1.01', 'Infinity']) expect(() => editMaterialIntent(mask, { cutoff })).toThrow();
    expect(() => editMaterialIntent(base, { cutoff: '0.5' })).toThrow();
    expect(() => editMaterialIntent(base, { coverage: 'ditherCoverage' })).toThrow();
  });
  it('retains map2 inactive chroma parameters, but leaves map1 enabled semantics unchanged', () => {
    const chroma = { keyColorSrgb: [0.123456, 0.2, 0.3], tolerance: 0.2, softness: 0.3, enabled: false };
    const raw = intent({ chroma }, { policy: 'opaque' });
    expect(() => validateMaterialIntent(raw, limits)).toThrow();
    const value = validateMaterialIntent(raw, limits, 'map2');
    expect(materialInput(value.appearance, 'chroma', 'map2')).toBe('off');
    expect(materialInput(value.appearance, 'chroma')).toBe('on');
    expect(materialForDisplay(value, 'map2').appearance).not.toHaveProperty('chroma');
    expect(value.appearance.chroma).toEqual(chroma);
    const enabled = editMaterialAppearance(value.appearance, { chroma: 'on' }, 'map2');
    expect(enabled.chroma).toEqual({ ...chroma, enabled: true });
    expect(editMaterialAppearance(enabled, { chroma: 'off' }, 'map2')).toEqual(value.appearance);
    const inherited = validateMaterialIntent(intent(enabled), limits, 'map2');
    expect(materialForDisplay(inherited, 'map2').appearance.chroma).toEqual({ keyColorSrgb: chroma.keyColorSrgb, tolerance: 0.2, softness: 0.3 });
    expect(materialForDisplay(inherited)).toBe(inherited);
    expect(() => validateMaterialIntent(intent({ chroma: { ...chroma, enabled: 'false' } }), limits, 'map2')).toThrow();
    expect(() => validateMaterialIntent(intent({ chroma: { ...chroma, tolerance: -1 } }), limits, 'map2')).toThrow();
  });
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
