import { nativeCaptionDisplaySetIdV1, nativeCaptionOwnerAssetIdV1, nativeDisplaySetsV1, nativeSavedViewDisplaySetIdV1,
  NATIVE_DEFAULT_DISPLAY_SET_ID, type NativeProjectSnapshotV1 } from '../nativeGs/schema';
import { nativeCaptionNeedsReviewV1, resolveNativeGsSliceV1 } from '../nativeGs/resolver';
import { admitProjectRecords, projectRecordMaps } from '../domain/projectRecords';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { digest, newId, technicalId } from '../projectMetadata/persistence';
import { sealValidationRecord, type PreparedValidationProject } from './initialProject';
import type { ValidatedGlb } from './glb';
import { fileError, validationGlbProfile, validationMetadataLimits as limits } from './validation';

export const nativeConversionRecipe = 'native-project-scene-recipe-1';
type SourceKey = readonly (string | number | SourceKey)[];
export interface NativeMappingEntry { id: string; sha256: string; preimage: string }
/** One conversion's collision registry; original identity, not text similarity, owns each key. */
export function nativeConversionIds(conversionId: string, sourceZipSha256: string) {
  technicalId(conversionId);
  if (!/^[0-9a-f]{64}$/.test(sourceZipSha256)) return fileError('変換元の識別情報が不正です。');
  const entries = new Map<string, NativeMappingEntry>();
  const byPreimage = new Map<string, string>();
  const id = async (prefix: string, key: SourceKey) => {
    const preimage = `lociview:${nativeConversionRecipe}:id:jcs-v1\n` + JSON.stringify([conversionId, sourceZipSha256, prefix, key]);
    const existing = byPreimage.get(preimage); if (existing) return existing;
    const sha256 = await digest(new TextEncoder().encode(preimage)), value = `${prefix}_${sha256.slice(0, 32)}`, old = entries.get(value);
    if (old && (old.sha256 !== sha256 || old.preimage !== preimage)) return fileError('変換先の識別情報が衝突しました。');
    entries.set(value, { id: value, sha256, preimage }); byPreimage.set(preimage, value); return value;
  };
  return { id, report: () => [...entries.values()] };
}
const rank = (n: number) => `A${n.toString(36).padStart(8, '0')}`;
const copy = (value: unknown) => cloneCanonicalValue(value, limits) as JsonObject;

/** Exact §5.3 mapper; no filename matching, normalization, model selection or storage writes. */
export async function mapNativeProject(snapshot: NativeProjectSnapshotV1, models: ReadonlyMap<string, ValidatedGlb>, conversionId: string, sourceSha256: string) {
  const ids = nativeConversionIds(conversionId, sourceSha256), id = ids.id;
  const one = (prefix: string, name: string, source: string) => id(prefix, [name, source]);
  const asset = (s: string) => one('ast', 'asset', s), revision = (s: string) => one('rev', 'revision', s), binding = (s: string) => one('bnd', 'binding', s);
  const rep = (s: string) => one('rep', 'representation', s), frame = (s: string) => one('frm', 'frame', s), scene = (s: string) => one('scn', 'display-set', s);
  const caption = (s: string) => one('cap', 'caption', s), media = (s: string) => one('med', 'media', s), view = (s: string) => one('view', 'view', s);
  const family = (a: string, s: string) => id('fam', ['family', a, s]), compatibility = (a: string, s: string) => id('cmp', ['anchor-class', a, s]);
  const active = async (prefix: string, key: SourceKey) => ({ state: 'active', reason: 'initial', eventId: await id('evt', ['initial-event', prefix, key]) });
  const records = Object.fromEntries(Object.keys(projectRecordMaps).map(k => [k, {}])) as Record<string, JsonValue>;
  const add = (map: keyof typeof projectRecordMaps, r: JsonObject) => { (records[map] as Record<string, JsonValue>)[r.id as string] = r; };
  records.schema = { major: 2, minor: 1 };
  records.identity = { projectId: `prj_${conversionId}`, historyEpoch: `hep_${newId()}`, lineageSeed: newId() + newId() };
  records.project = { title: snapshot.project.title, frame: { ...copy(snapshot.project.frame), id: await frame(snapshot.project.frame.id) },
    defaultSceneId: await scene(snapshot.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID) };
  const profile = await validationGlbProfile();
  const targetModels = new Map<string, { record: JsonObject; model: ValidatedGlb }>();
  if (profile.specificationSha256 !== '077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f') return fileError('変換レシピとモデル検証の版が一致しません。');
  for (const r of snapshot.representations) {
    const model = models.get(r.id); if (!model) return fileError('モデルの検証結果が不足しています。');
    const slots = await Promise.all(model.materials.map(async material => {
      const locator = material.sourceLocator as JsonObject;
      return { ...material, logicalMaterialSlotId: await id('slot', ['material-slot', r.id, locator.kind as string,
        locator.kind === 'gltfMaterial' ? locator.materialIndex as number : 0]) };
    }));
    slots.sort((a, b) => a.logicalMaterialSlotId.localeCompare(b.logicalMaterialSlotId));
    const record = await sealValidationRecord('representation', { id: await rep(r.id), assetId: await asset(r.assetId),
      representationFrameId: await frame(r.representationFrameId), contentKind: 'mesh', purposes: ['source', 'display'], role: 'meshPrimary',
      variantFamilyId: await family(r.assetId, r.variantFamilyId), formatProfile: profile, blob: copy(r.blob),
      representationToAsset: copy(r.representationToAsset), derivedFrom: [], logicalBoundsAsset: model.bounds,
      materialCatalog: { layoutId: await id('lay', ['material-layout', r.id]), slots } });
    add('representationsById', record); targetModels.set(record.id as string, { record, model });
  }
  for (const r of snapshot.assetRevisions) add('assetRevisionsById', await sealValidationRecord('asset-revision', {
    id: await revision(r.id), assetId: await asset(r.assetId), representationIds: (await Promise.all(r.representationIds.map(rep))).sort(),
    anchorCompatibilityClasses: (await Promise.all(r.anchorCompatibilityClasses.map(async c => ({ id: await compatibility(r.assetId, c.id),
      targetVariantFamilyIds: (await Promise.all(c.targetVariantFamilyIds.map(f => family(r.assetId, f)))).sort() })))).sort((a, b) => a.id.localeCompare(b.id)),
    provenance: { origin: 'import', sourceMediaType: 'model/gltf-binary', inputBlobDigests: [...new Set(r.representationIds.map(s => snapshot.representations.find(p => p.id === s)!.blob.digest))].sort() },
  }));
  for (const b of snapshot.assetBindingRevisions) add('assetBindingsById', await sealValidationRecord('asset-binding-revision', {
    id: await binding(b.id), assetId: await asset(b.assetId), assetRevisionId: await revision(b.assetRevisionId), assetToProject: copy(b.assetToProject), method: b.method,
  }));
  for (const a of snapshot.assets) add('assetsById', { id: await asset(a.id), label: a.label, assetFrameId: await frame(a.assetFrameId),
    status: { kind: 'ready', activeBindingId: await binding(a.status.activeBindingId) }, ...(a.pinScale === undefined ? {} : { pinScale: a.pinScale }),
    lifecycle: await active('ast', ['asset', a.id]) });
  for (const m of snapshot.mediaResources ?? []) add('mediaResourcesById', await sealValidationRecord('media-resource', {
    id: await media(m.id), label: m.label, mediaKind: 'image', blob: copy(m.blob),
  }));
  const tags = [...new Set(snapshot.captions.flatMap(c => [...c.tags ?? []]))];
  for (const [i, tag] of tags.entries()) add('captionTagsById', { id: await id('tag', ['tag', tag]), label: tag, orderKey: rank(i), lifecycle: await active('tag', ['tag', tag]) });
  const reviewStates = new Map<string, boolean>();
  for (const c of snapshot.captions) {
    let previous = -1;
    for (const tag of c.tags ?? []) { const index = tags.indexOf(tag); if (index <= previous) return fileError('このファイルのタグの並びは、まだ変換できません。'); previous = index; }
    const owner = nativeCaptionOwnerAssetIdV1(c), a = c.anchor;
    const anchor: JsonObject = a ? { kind: 'asset', assetId: await asset(a.assetId), assetFrameId: await frame(a.assetFrameId),
      positionAsset: [...a.positionAsset], authoredAssetRevisionId: await revision(a.authoredAssetRevisionId),
      authoredAnchorCompatibilityId: await compatibility(a.assetId, a.authoredAnchorCompatibilityId), hitEvidence: { method: 'manual' } } :
      { kind: 'unplaced', ...(owner ? { ownerAssetId: await asset(owner) } : {}) };
    const color = c.color ?? '#eab308', capId = await caption(c.id);
    add('captionsById', { id: capId, title: c.title, body: c.body, anchor,
      colorSrgb: [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255), lifecycle: await active('cap', ['caption', c.id]) });
    reviewStates.set(capId, nativeCaptionNeedsReviewV1(snapshot, c));
    for (const [i, m] of (c.attachmentMediaIds ?? []).entries()) {
      const key: SourceKey = ['attachment', c.id, i, m];
      add('captionAttachmentsById', { id: await id('att', key), captionId: capId, mediaResourceId: await media(m), orderKey: rank(i), lifecycle: await active('att', key) });
    }
    for (const tag of c.tags ?? []) {
      const key: SourceKey = ['caption-tag', c.id, tag];
      add('captionTagMembershipsById', { id: await id('tgm', key), captionId: capId, tagId: await id('tag', ['tag', tag]), lifecycle: await active('tgm', key) });
    }
  }
  const visible = new Set(resolveNativeGsSliceV1(snapshot, new Map(snapshot.representations.map(r => [r.id, { availability: 'ready', registration: 'known' }]))).visibleRepresentationIds);
  const visibleAssets = snapshot.assets.filter(a => snapshot.representations.some(r => r.assetId === a.id && visible.has(r.id)));
  for (const [i, s] of nativeDisplaySetsV1(snapshot).entries()) {
    const sceneId = await scene(s.id);
    add('scenesById', { id: sceneId, name: s.name, orderKey: rank(i), ...(s.defaultSavedViewId ? { defaultViewId: await view(s.defaultSavedViewId) } : {}), lifecycle: await active('scn', ['display-set', s.id]) });
    for (const [j, a] of visibleAssets.entries()) {
      const key: SourceKey = ['scene-asset', s.id, a.id];
      add('sceneAssetMembershipsById', { id: await id('sam', key), sceneId, assetId: await asset(a.id), orderKey: rank(j), lifecycle: await active('sam', key) });
    }
    for (const [j, c] of snapshot.captions.filter(c => nativeCaptionDisplaySetIdV1(c) === s.id).entries()) {
      const key: SourceKey = ['scene-caption', s.id, c.id];
      add('sceneCaptionMembershipsById', { id: await id('scm', key), sceneId, captionId: await caption(c.id), orderKey: rank(j), lifecycle: await active('scm', key) });
    }
    for (const [j, v] of (snapshot.savedViews ?? []).filter(v => nativeSavedViewDisplaySetIdV1(v) === s.id).entries())
      add('viewsById', { id: await view(v.id), sceneId, name: v.name, orderKey: rank(j), projectFrameId: await frame(v.projectFrameId),
        camera: copy(v.camera), background: copy(v.background), lifecycle: await active('view', ['view', v.id]) });
  }
  const checked = admitProjectRecords(records, limits, 'map2');
  if (checked.kind !== 'valid-records' || checked.hasUnknownFields) return fileError('このファイルの値は、まだそのまま変換できません。');
  return { records: cloneCanonicalValue(checked.records, limits) as PreparedValidationProject['records'], mapping: ids.report(), reviewStates, targetModels };
}
