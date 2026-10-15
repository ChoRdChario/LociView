import { admitProjectRecords, projectRecordMaps } from '../domain/projectRecords';
import { cloneCanonicalValue, scalarLength, type JsonObject, type JsonValue } from '../domain/values';
import { planLociMyuCaptionIdentity } from '../io/locimyu';
import { digest, newId, technicalId } from '../projectMetadata/persistence';
import { identityPlacement, sealValidationRecord, type PreparedValidationProject } from './initialProject';
import { lociMyuRecipe, type LociMyuRecipe, LociMyuPreflightError, type LociMyuSourcePlan } from './lociMyuSource';
import { fileError, validationGlbProfile, jpegGlbProfile, validationMetadataLimits as limits } from './validation';

export type LociMyuKey = readonly (string | number | LociMyuKey)[];
export interface LociMyuMappingEntry { id: string; sha256: string; preimage: string }
const path = (v: unknown) => typeof v === 'string' && v.length > 0;
const sheet = (v: unknown) => Array.isArray(v) && v.length === 2 && ['legacyGid', 'sheetName'].includes(v[0]) && path(v[1]);
const caption = (v: unknown) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && /^cap_[0-9A-HJKMNP-TV-Z]{26}$/.test(v[0]) && typeof v[1] === 'string' && /^[0-9a-f]{64}$/.test(v[1]);
export function lociMyuSourceKey(prefix: unknown, key: unknown, nested = false): boolean {
  if (typeof prefix !== 'string' || !Array.isArray(key)) return false;
  if (prefix === 'frm') return key.length === 1 && key[0] === 'project-frame' || key.length === 2 && ['asset-frame', 'representation-frame'].includes(key[0]) && path(key[1]);
  const simple: Record<string, string> = { ast: 'model', rep: 'model-representation', rev: 'model-revision', bnd: 'model-binding', fam: 'mesh-family', cmp: 'anchor-class', lay: 'material-layout', med: 'media' };
  if (Object.hasOwn(simple, prefix)) return key.length === 2 && key[0] === simple[prefix] && path(key[1]);
  if (prefix === 'scn') return key.length === 2 && key[0] === 'sheet' && sheet(key[1]);
  if (prefix === 'sam') return key.length === 3 && key[0] === 'scene-asset' && sheet(key[1]) && path(key[2]);
  if (prefix === 'cap') return key.length === 2 && key[0] === 'caption' && caption(key[1]);
  if (prefix === 'scm') return key.length === 3 && key[0] === 'scene-caption' && sheet(key[1]) && caption(key[2]);
  if (prefix === 'att') return key.length === 4 && key[0] === 'attachment' && caption(key[1]) && key[2] === 0 && path(key[3]);
  if (prefix === 'view') return key.length === 3 && key[0] === 'view' && key[1] === '__LM_VIEWS' && Number.isSafeInteger(key[2]) && key[2] >= 2;
  if (prefix === 'slot') return key.length === 4 && key[0] === 'material-slot' && path(key[1]) && (key[2] === 'gltfMaterial' && Number.isSafeInteger(key[3]) && key[3] >= 0 || key[2] === 'representationMaterial' && key[3] === 0);
  return prefix === 'evt' && !nested && key.length === 3 && key[0] === 'initial-event' && ['ast', 'scn', 'sam', 'cap', 'scm', 'att', 'view'].includes(key[1]) && lociMyuSourceKey(key[1], key[2], true);
}
export function lociMyuConversionIds(conversionId: string, sourceZipSha256: string, workbookPath: string, recipe: LociMyuRecipe = lociMyuRecipe) {
  technicalId(conversionId); if (!/^[0-9a-f]{64}$/.test(sourceZipSha256) || !path(workbookPath)) return fileError('変換元の識別情報が不正です。');
  const entries = new Map<string, LociMyuMappingEntry>(), full = new Map<string, string>();
  const id = async (prefix: string, key: LociMyuKey) => {
    if (!lociMyuSourceKey(prefix, key)) return fileError('変換時の識別情報が不正です。');
    scalarLength(JSON.stringify(key), limits.maxStringScalars, []);
    const preimage = `lociview:${recipe}:id:jcs-v1\n` + JSON.stringify([conversionId, sourceZipSha256, workbookPath, prefix, key]);
    const sha256 = await digest(new TextEncoder().encode(preimage)), value = `${prefix}_${sha256.slice(0, 32)}`, old = entries.get(value), oldFull = full.get(sha256);
    if (old && (old.preimage !== preimage || old.sha256 !== sha256) || oldFull && oldFull !== preimage) return fileError('変換先の識別情報が衝突しました。');
    entries.set(value, { id: value, sha256, preimage }); full.set(sha256, preimage); return value;
  };
  return { id, report: () => [...entries.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
}
const rank = (n: number) => `A${n.toString(36).padStart(8, '0')}`;
const hex = (value: string) => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);

/** Recompute expected values against captured identity; never regenerate recovery history. */
export async function mapLociMyuProject(plan: LociMyuSourcePlan, conversionId: string, sourceSha256: string, capturedIdentity?: JsonObject) {
  const ids = lociMyuConversionIds(conversionId, sourceSha256, plan.workbook.path, plan.recipe), id = ids.id, s = plan.model.path;
  const one = (prefix: string, name: string) => id(prefix, [name, s]);
  const active = async (prefix: string, key: LociMyuKey) => ({ state: 'active', reason: 'initial', eventId: await id('evt', ['initial-event', prefix, key]) });
  const records = Object.fromEntries(Object.keys(projectRecordMaps).map(k => [k, {}])) as Record<string, JsonValue>;
  const add = (map: keyof typeof projectRecordMaps, record: JsonObject) => { const values = records[map] as Record<string, JsonValue>;
    if (Object.hasOwn(values, record.id as string)) return fileError('変換元の識別情報が重複しています。'); values[record.id as string] = record; };
  records.schema = { major: 2, minor: 1 };
  records.identity = capturedIdentity ?? { projectId: `prj_${conversionId}`, historyEpoch: `hep_${newId()}`, lineageSeed: newId() + newId() };
  if ((records.identity as JsonObject).projectId !== `prj_${conversionId}`) return fileError('変換先の識別情報が一致しません。');
  const projectFrameId = await id('frm', ['project-frame']);
  const sheetKey = (scene: LociMyuSourcePlan['scenes'][number]): LociMyuKey => [scene.identity.kind, scene.identity.value];
  const sceneId = (scene: LociMyuSourcePlan['scenes'][number]) => id('scn', ['sheet', sheetKey(scene)]);
  records.project = { title: plan.title, frame: { id: projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } }, defaultSceneId: await sceneId(plan.scenes[0]!) };
  const profile = await validationGlbProfile();
  if (profile.specificationSha256 !== '077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f') return fileError('モデル検証の版が一致しません。');
  const assetId = await one('ast', 'model'), assetFrameId = await one('frm', 'asset-frame'), revisionId = await one('rev', 'model-revision');
  const familyId = await one('fam', 'mesh-family'), compatibilityId = await one('cmp', 'anchor-class'), representationId = await one('rep', 'model-representation'), bindingId = await one('bnd', 'model-binding');
  const slots = await Promise.all(plan.model.model.materials.map(async m => { const locator = m.sourceLocator as JsonObject;
    return { ...m, logicalMaterialSlotId: await id('slot', ['material-slot', s, locator.kind as string, (locator.kind === 'gltfMaterial' ? locator.materialIndex : 0) as number]) }; }));
  slots.sort((a, b) => a.logicalMaterialSlotId < b.logicalMaterialSlotId ? -1 : a.logicalMaterialSlotId > b.logicalMaterialSlotId ? 1 : 0);
  const representation = await sealValidationRecord('representation', { id: representationId, assetId, representationFrameId: await one('frm', 'representation-frame'),
    contentKind: 'mesh', purposes: ['source', 'display'], role: 'meshPrimary', variantFamilyId: familyId, formatProfile: plan.model.model.jpeg ? await jpegGlbProfile() : profile, blob: { ...plan.model.ref },
    representationToAsset: { ...identityPlacement(), reflection: 'none' }, derivedFrom: [], logicalBoundsAsset: plan.model.model.bounds, materialCatalog: { layoutId: await one('lay', 'material-layout'), slots } });
  add('representationsById', representation);
  add('assetRevisionsById', await sealValidationRecord('asset-revision', { id: revisionId, assetId, representationIds: [representationId],
    anchorCompatibilityClasses: [{ id: compatibilityId, targetVariantFamilyIds: [familyId] }], provenance: { origin: 'import', sourceMediaType: plan.model.ref.mediaType, inputBlobDigests: [plan.model.ref.digest] } }));
  add('assetBindingsById', await sealValidationRecord('asset-binding-revision', { id: bindingId, assetId, assetRevisionId: revisionId, assetToProject: identityPlacement(), method: 'import' }));
  add('assetsById', { id: assetId, label: plan.model.label, assetFrameId, status: { kind: 'ready', activeBindingId: bindingId }, pinScale: 1, lifecycle: await active('ast', ['model', s]) });
  for (const body of plan.media) add('mediaResourcesById', await sealValidationRecord('media-resource', { id: await id('med', ['media', body.path]), label: body.label, mediaKind: 'image', blob: { ...body.ref } }));
  const sourceIdentities: JsonObject[] = [];
  for (const [i, scene] of plan.scenes.entries()) {
    const S = sheetKey(scene), scn = await sceneId(scene), ownViews = plan.views.filter(v => v.scene === scene.name);
    add('scenesById', { id: scn, name: scene.name, orderKey: rank(i), lifecycle: await active('scn', ['sheet', S]),
      ...(ownViews.length === 1 ? { defaultViewId: await id('view', ['view', '__LM_VIEWS', ownViews[0]!.row]) } : {}) });
    const sam: LociMyuKey = ['scene-asset', S, s]; add('sceneAssetMembershipsById', { id: await id('sam', sam), sceneId: scn, assetId, orderKey: rank(0), lifecycle: await active('sam', sam) });
    for (const [n, c] of scene.captions.entries()) {
      const v = c.value, check = await planLociMyuCaptionIdentity(v.identity.key);
      const fullDigest = [...check.fullDigest].map(b => b.toString(16).padStart(2, '0')).join('');
      if (check.preimage !== v.identity.preimage || check.captionId !== v.captionId || !check.fullDigest.every((b, i) => b === v.identity.fullDigest[i])) return fileError('元のキャプション識別情報が一致しません。');
      sourceIdentities.push({ sheet: scene.name, row: c.row, key: { ...v.identity.key, sheetIdentity: { ...v.identity.key.sheetIdentity } }, preimage: check.preimage, sha256: fullDigest, sourceCaptionId: check.captionId });
      const C: LociMyuKey = [v.captionId, fullDigest], cap = await id('cap', ['caption', C]);
      const anchor: JsonObject = v.position ? { kind: 'asset', assetId, assetFrameId, authoredAssetRevisionId: revisionId, authoredAnchorCompatibilityId: compatibilityId, positionAsset: v.position, hitEvidence: { method: 'manual' } } : { kind: 'unplaced', ownerAssetId: assetId };
      add('captionsById', { id: cap, title: v.title, body: v.body, colorSrgb: hex(v.color), anchor, lifecycle: await active('cap', ['caption', C]) });
      const scm: LociMyuKey = ['scene-caption', S, C]; add('sceneCaptionMembershipsById', { id: await id('scm', scm), sceneId: scn, captionId: cap, orderKey: rank(n), lifecycle: await active('scm', scm) });
      if (c.imagePath) { const att: LociMyuKey = ['attachment', C, 0, c.imagePath]; add('captionAttachmentsById', { id: await id('att', att), captionId: cap, mediaResourceId: await id('med', ['media', c.imagePath]), orderKey: rank(0), lifecycle: await active('att', att) }); }
    }
    for (const [n, v] of ownViews.entries()) { const key: LociMyuKey = ['view', '__LM_VIEWS', v.row];
      add('viewsById', { id: await id('view', key), sceneId: scn, projectFrameId, name: v.name, orderKey: rank(n), lifecycle: await active('view', key), camera: v.camera, background: { kind: 'solid', colorSrgb: v.background } }); }
  }
  const checked = admitProjectRecords(records, limits, 'map2');
  if (checked.kind !== 'valid-records' || checked.hasUnknownFields) throw new LociMyuPreflightError('元データを省略・修正せずに変換先の項目として保存できません。');
  return { records: cloneCanonicalValue(checked.records, limits) as PreparedValidationProject['records'], mapping: ids.report(), sourceIdentities,
    targetModels: new Map([[representationId, { record: representation, model: plan.model.model }]]), blobs: [plan.model, ...plan.media] };
}
