import { describe, expect, it } from 'vitest';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { canonicalFixture } from '../../src/harness/projectScene/modelClosure';
import { materialKey, projectMaterialHistory, resolveFixtureMaterial, sourceMaterialIntent, sourceColorSrgb } from '../../src/harness/projectScene/materialHistory';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { syntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';

const nodes = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(nodes)];
const button = (r: RecordedNode, text: string) => nodes(r).find(n => n.tag === 'button' && n.textContent === text)!;
const named = (r: RecordedNode, name: string) => nodes(r).find(n => n.attributes.get('aria-label') === name)!;
const set = (n: RecordedNode, v: string) => { n.value = v; n.fire(n.tag === 'select' ? 'change' : 'input'); };
describe('connected fixture material editing, not raster/IME/device evidence', () => {
  it('selects exact target/scope, applies without changing camera/membership, confirms reset and retains IME across task tabs', () => {
    const doc = new RecordedDocument(), s = new SyntheticSession(), w = createDevelopmentWorkspace(doc.asDocument(), s);
    const r = record(w.root); button(r, 'マテリアル').fire('click'); const m = named(r, 'マテリアル');
    set(named(m, 'モデル'), f.equipment); expect(button(m, '設定を編集').disabled).toBe(true);
    const surface = named(m, '面'); set(surface, surface.children[1]!.value); set(named(m, '適用範囲'), 'project');
    button(m, '設定を編集').fire('click'); set(named(m, '照明'), 'unlit'); button(m, '変更を適用').fire('click');
    expect(s.pending).toBeNull(); const projectId = Object.keys(s.snapshot.resources.materials)[0]!;
    const base = syntheticDisplay(s.snapshot, f.overview, null, null);
    expect(base.materials![f.equipment]).toMatchObject({ unlit: true, doubleSided: false, visible: true });
    set(named(m, '適用範囲'), 'scene'); button(m, '設定を編集').fire('click'); set(named(m, '表示する面'), 'double');
    button(m, '変更を適用').fire('click'); expect(syntheticDisplay(s.snapshot, f.overview, null, null).materials![f.equipment]).toMatchObject({ unlit: true, doubleSided: true });
    expect(syntheticDisplay(s.snapshot, f.detail, null, null).materials![f.equipment]).toMatchObject({ unlit: true, doubleSided: false });
    button(m, 'この範囲の設定を解除').fire('click'); expect(Object.values(s.snapshot.resources.materials).every(v => v.lifecycle.kind === 'value' && v.lifecycle.value.state === 'active')).toBe(true);
    button(m, '設定を解除する').fire('click'); expect(syntheticDisplay(s.snapshot, f.overview, null, null).materials![f.equipment]).toEqual(base.materials![f.equipment]);
    expect(s.snapshot.resources.materials[projectId]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    button(m, '設定を編集').fire('click'); set(named(m, '指定した色を透過'), 'on'); const key = named(m, '透過する色');
    key.fire('compositionstart'); key.value = '#a8a29a'; key.fire('input'); expect(s.pending).toBe('composition');
    expect(named(r, 'シーン').disabled).toBe(true); button(r, 'キャプション').fire('click'); button(r, 'マテリアル').fire('click'); expect(named(m, '透過する色')).toBe(key);
    key.fire('compositionend'); button(m, '変更を適用').fire('click');
    expect(syntheticDisplay(s.snapshot, f.overview, null, null).materials![f.equipment]).toMatchObject({ visible: false });
    expect(syntheticDisplay(s.snapshot, f.overview, null, null).bounds).toEqual(base.bounds);
    expect(s.snapshot.resources.captions).toEqual(new SyntheticSession().snapshot.resources.captions); w.dispose();
  });
  it('uses pre-lighting linear distance, exact hard boundary, mask cutoff including zero, and refuses unsupported blending/dither', () => {
    const chroma = { keyColorSrgb: sourceColorSrgb, tolerance: 0, softness: 0 };
    expect(resolveFixtureMaterial({ ...sourceMaterialIntent, appearance: { chroma } }).visible).toBe(false);
    expect(resolveFixtureMaterial({ appearance: { opacity: 0 }, compositing: { optics: 'inherit', coverage: { policy: 'mask', alphaCutoff: 0 } } }).visible).toBe(true);
    expect(resolveFixtureMaterial({ appearance: { opacity: 0 }, compositing: { optics: 'inherit', coverage: { policy: 'mask', alphaCutoff: 0.1 } } }).visible).toBe(false);
    const factor = [0.1234567, 0.4, 0.9];
    expect(resolveFixtureMaterial({ ...sourceMaterialIntent, appearance: { baseColorSrgb: factor, chroma: { ...chroma, keyColorSrgb: factor } } }).visible).toBe(false);
    expect(() => resolveFixtureMaterial({ ...sourceMaterialIntent, appearance: { opacity: 0.5 } })).toThrow('半透明');
    expect(() => resolveFixtureMaterial({ ...sourceMaterialIntent, compositing: { coverage: { policy: 'ditherCoverage' }, optics: 'surface' } })).toThrow('ディザ');
  });
  it('rejects partial/foreign target and retains all atomic candidates, with no cross-candidate nested merge', () => {
    const id = 'ovr_' + 'a'.repeat(32), c = syntheticVersions[0]!.closure, target = { assetId: c.binding.assetId, variantFamilyId: c.representation.variantFamilyId,
      materialLayoutId: c.representation.materialCatalog.layoutId, logicalMaterialSlotId: c.representation.materialCatalog.slots[0]!.logicalMaterialSlotId };
    const cells = Object.fromEntries(Object.entries({ routing: { scope: { kind: 'project' }, target }, appearance: {}, compositing: sourceMaterialIntent.compositing,
      lifecycle: { state: 'active', eventId: 'evt_' + '1'.repeat(32), reason: 'initial' } }).map(([key, v]) => [materialKey(id, key), { kind: 'value' as const, value: canonicalFixture(v) }]));
    const models = syntheticVersions.map(v => v.closure); expect(() => projectMaterialHistory({ token: 't', cells: { [materialKey(id, 'appearance')]: cells[materialKey(id, 'appearance')]! } }, models)).toThrow();
    expect(() => projectMaterialHistory({ token: 't', cells: { ...cells, [materialKey(id, 'routing')]: { kind: 'value', value: canonicalFixture({ scope: { kind: 'project' }, target: { ...target, logicalMaterialSlotId: 'slot_' + 'f'.repeat(32) } }) } } }, models)).toThrow();
    const result = projectMaterialHistory({ token: 't', cells: { ...cells, [materialKey(id, 'appearance')]: { kind: 'conflict', candidates: [
      { id: '1', value: canonicalFixture({ lighting: 'unlit' }) }, { id: '2', value: canonicalFixture({ doubleSided: true }) }] } } }, models);
    expect(result.records[id]!.intent.kind).toBe('unresolved'); expect(result.records[id]!.appearance.kind).toBe('unresolved');
  });
});
