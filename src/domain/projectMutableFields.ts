import { ProjectRecordFields } from './projectRecordFields';
import type { ProjectSemanticProfile } from './projectProfile';
import { checkMaterialAppearance, checkMaterialCompositing, checkMaterialCoupling } from './materialIntent';
import { reject, type JsonObject, type JsonValue } from './values';

type Rule = Readonly<{ optional?: true; check(c: ProjectRecordFields, v: JsonValue, p: readonly string[]): void }>;
const text = (n: number, body = false): Rule => ({ check: (c, v, p) => { c.text(v, n, p, body); } });
const id = (prefix: string): Rule => ({ check: (c, v, p) => { c.id(v, prefix, p); } });
const optional = (rule: Rule): Rule => ({ ...rule, optional: true });
const order: Rule = { check: (c, v, p) => { c.order(v, p); } };
const color: Rule = optional({ check: (c, v, p) => c.color(v, p) });
const lifecycle: Rule = { check: (c, v, p) => c.lifecycle(v, p) };
const entity = (prefix: string, fields: Record<string, Rule>) => Object.freeze({ id: id(prefix), lifecycle, ...fields });

/** One registry shared by whole records and every individual atomic candidate. */
export const mutableRecordFields = Object.freeze({
  assetsById: entity('ast', { label: text(256), assetFrameId: id('frm'), status: { check: (c, v, p) => {
    const s = c.shape(v, ['kind', 'activeBindingId', 'reason', 'expectedLabel', 'expectedDigest', 'pendingAssetToProject'], p);
    c.enum(c.required(s, 'kind', p), ['ready', 'unresolved'], [...p, 'kind']);
    if (s.kind === 'ready') { c.id(c.required(s, 'activeBindingId', p), 'bnd', [...p, 'activeBindingId']);
      c.absent(s, ['reason', 'expectedLabel', 'expectedDigest', 'pendingAssetToProject'], p); }
    else { c.absent(s, ['activeBindingId'], p); c.enum(c.required(s, 'reason', p), ['missingSource', 'unsupportedFormat', 'migrationError'], [...p, 'reason']);
      c.optional(s, 'expectedLabel', p, (v, p) => c.text(v, 256, p)); c.optional(s, 'expectedDigest', p, (v, p) => c.digest(v, p));
      c.optional(s, 'pendingAssetToProject', p, (v, p) => c.transform(v, p)); }
  } } }),
  captionsById: entity('cap', { title: text(512), body: text(65_536, true), colorSrgb: color, anchor: { check: (c, v, p) => c.anchor(v, p) } }),
  captionAttachmentsById: entity('att', { captionId: id('cap'), mediaResourceId: id('med'), altText: optional(text(4096)), orderKey: order }),
  captionTagsById: entity('tag', { label: text(256), colorSrgb: color, orderKey: order }),
  captionTagMembershipsById: entity('tgm', { captionId: id('cap'), tagId: id('tag') }),
  scenesById: entity('scn', { name: text(256), orderKey: order, defaultViewId: optional(id('view')) }),
  sceneAssetMembershipsById: entity('sam', { sceneId: id('scn'), assetId: id('ast'), orderKey: order }),
  sceneCaptionMembershipsById: entity('scm', { sceneId: id('scn'), captionId: id('cap'), orderKey: order }),
  viewsById: entity('view', { sceneId: id('scn'), name: text(256), orderKey: order, projectFrameId: id('frm'),
    camera: { check: (c, v, p) => c.camera(v, p) }, background: { check: (c, v, p) => c.background(v, p) } }),
  materialOverridesById: entity('ovr', { routing: { check: (c, v, p) => {
    const r = c.shape(v, ['scope', 'target'], p), s = c.shape(c.required(r, 'scope', p), ['kind', 'sceneId'], [...p, 'scope']);
    c.enum(c.required(s, 'kind', [...p, 'scope']), ['project', 'scene'], [...p, 'scope', 'kind']);
    if (s.kind === 'scene') c.id(c.required(s, 'sceneId', [...p, 'scope']), 'scn', [...p, 'scope', 'sceneId']);
    else c.absent(s, ['sceneId'], [...p, 'scope']);
    const targets = { assetId: 'ast', variantFamilyId: 'fam', materialLayoutId: 'lay', logicalMaterialSlotId: 'slot' };
    const t = c.shape(c.required(r, 'target', p), Object.keys(targets), [...p, 'target']);
    for (const [field, prefix] of Object.entries(targets)) c.id(c.required(t, field, [...p, 'target']), prefix, [...p, 'target', field]);
  } }, appearance: { check: (c, v, p) => {
    checkMaterialAppearance(v, c.semanticProfile); const a = c.shape(v, ['opacity', 'baseColorSrgb', 'lighting', 'doubleSided', 'chroma'], p);
    if (a.chroma !== undefined) c.shape(a.chroma, ['keyColorSrgb', 'tolerance', 'softness', ...(c.semanticProfile === 'map2' ? ['enabled'] : [])], [...p, 'chroma']);
  } }, compositing: { check: (c, v, p) => {
    checkMaterialCompositing(v); const comp = c.shape(v, ['coverage', 'optics'], p); c.shape(comp.coverage!, ['policy', 'alphaCutoff'], [...p, 'coverage']);
  } } }),
});
export type MutableRecordMap = keyof typeof mutableRecordFields;
const map2Fields = Object.freeze({ ...mutableRecordFields, assetsById: Object.freeze({ ...mutableRecordFields.assetsById,
  pinScale: optional({ check: (c, v, p) => { const n = c.number(v, p); if (n < 0.001 || n > 1000) reject('value', p); } }),
}) });
/** The map1 dictionary stays fixed, including original overwritten unknown fields. */
export const mutableFieldsFor = (profile: ProjectSemanticProfile = 'map1'): typeof mutableRecordFields =>
  profile === 'map2' ? map2Fields : mutableRecordFields;
export function checkMutableField(c: ProjectRecordFields, map: MutableRecordMap, field: string, v: JsonValue | undefined): void {
  const fields = mutableFieldsFor(c.semanticProfile);
  const rule: Rule | undefined = Object.hasOwn(fields[map], field) ? (fields[map] as Record<string, Rule>)[field] : undefined;
  if (!rule) { c.unknown = true; return; }
  if (v === undefined) { if (!rule.optional) reject('missing', [field]); return; }
  rule.check(c, v, [field]);
}
/** Already cloned canonical record. No graph/history/digest/provider authority. */
export function checkMutableRecord(c: ProjectRecordFields, map: MutableRecordMap, r: JsonObject): void {
  const fields = mutableFieldsFor(c.semanticProfile);
  c.shape(r, Object.keys(fields[map]), []);
  for (const field of Object.keys(fields[map])) checkMutableField(c, map, field, r[field]);
  if (map === 'materialOverridesById') checkMaterialCoupling(r.appearance as JsonObject, r.compositing as JsonObject, c.semanticProfile);
}
