import { opaqueMaterialSource,meshMaterialSemantics,type MeshMaterialSource } from '../domain/meshMaterialSource';
import type {MaterialIntent} from '../domain/materialIntent';
import {standardMaterialNeeded,materialConversionNotice,sourceBlendNotice,type MaterialConversionNotice} from './materialNormalization';
import { nativeCaptionDisplaySetIdV1, nativeCaptionOwnerAssetIdV1, nativeDisplaySetsV1, nativeSavedViewDisplaySetIdV1,
  NATIVE_DEFAULT_DISPLAY_SET_ID, type NativeProjectSnapshotV1 } from '../nativeGs/schema';
import { nativeCaptionNeedsReviewV1, resolveNativeGsSliceV1 } from '../nativeGs/resolver';
import { nativeMaterialSlotKey } from '../nativeGs/materialSlots';
import { admitProjectRecords, projectRecordMaps } from '../domain/projectRecords';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { digest, newId, technicalId } from '../projectMetadata/persistence';
import { sealValidationRecord, type PreparedValidationProject } from './initialProject';
import type { ValidatedGlb } from './glb';
import type { MeshSourceAddress, MeshSourceFormat } from '../domain/meshSource';
import { meshSourceProfile } from './meshSource';
import { nativePointSourceProfile, nativeProxySourceProfile } from './nativeSpatial';
import { gsSourceProfile } from './gsPly';
import { fileError, validationGlbProfile, occurrenceGlbProfile, jpegGlbProfile, occurrenceJpegGlbProfile, validationMetadataLimits as limits } from './validation';

export const nativeConversionRecipe = 'native-project-scene-recipe-1';
export const nativeAppearanceRecipe = 'native-project-scene-recipe-2';
export const nativeJpegRecipe = 'native-project-scene-recipe-3';
export const nativeAppearanceJpegRecipe = 'native-project-scene-recipe-4';
export const nativePhotoRecipe = 'native-project-scene-recipe-5';
export const nativeAppearancePhotoRecipe = 'native-project-scene-recipe-6';
export const nativeSpatialRecipe = 'native-project-scene-recipe-7';
export const nativeMeshRecipe = 'native-project-scene-recipe-8';
export const nativeOpaqueMaterialRecipe = 'native-project-scene-recipe-9';
export const nativeStandardMaterialRecipe = 'native-project-scene-recipe-10';
export type NativeConversionRecipe = typeof nativeStandardMaterialRecipe | typeof nativeOpaqueMaterialRecipe | typeof nativeMeshRecipe | typeof nativeSpatialRecipe | typeof nativePhotoRecipe | typeof nativeAppearancePhotoRecipe | typeof nativeConversionRecipe | typeof nativeAppearanceRecipe | typeof nativeJpegRecipe | typeof nativeAppearanceJpegRecipe;
export const nativeRecipeHasAppearance = (recipe: NativeConversionRecipe) => recipe === nativeStandardMaterialRecipe || recipe === nativeOpaqueMaterialRecipe || recipe === nativeAppearanceRecipe || recipe === nativeAppearanceJpegRecipe || recipe === nativeAppearancePhotoRecipe;
export const nativeRecipeHasJpeg = (recipe: NativeConversionRecipe) => recipe === nativeJpegRecipe || recipe === nativeAppearanceJpegRecipe;
export const nativeRecipeHasPhoto = (recipe: NativeConversionRecipe) => recipe === nativePhotoRecipe || recipe === nativeAppearancePhotoRecipe;
export const nativeRecipeHasOrigin = (recipe: NativeConversionRecipe) => recipe === nativeStandardMaterialRecipe || recipe === nativeOpaqueMaterialRecipe || recipe === nativeMeshRecipe || recipe === nativeSpatialRecipe || nativeRecipeHasJpeg(recipe) || nativeRecipeHasPhoto(recipe);
/** Compact inspected facts; conversion does not retain every source body/decoded array. */
export type NativeModelFacts = Pick<ValidatedGlb, 'bounds' | 'materials' | 'surfaceRanges' | 'jpeg' | 'occurrences'> & {newMesh?:{format:MeshSourceFormat;externalMaterialsUnavailable:boolean}};
export interface NativeMaterialWitness {
  nativeRepresentationId: string; sourceGlbSha256: string; childPath: readonly number[]; materialArraySlot: 0;
  nodeIndex: number; primitiveIndex: number; sourceMaterialIndex: number | null; slotIndex: number;
  targetRepresentationId: string; targetProfile: JsonObject; targetMaterialLayoutId: string; targetLogicalMaterialSlotId: string;
}
export interface NativeOccurrence { readonly childPath: readonly number[]; readonly materialArraySlot: 0; readonly nodeIndex:number; readonly primitiveIndex:number; readonly materialIndex:number|null; readonly slotIndex:number }
export interface NativeMeshOccurrence {readonly childPath:readonly number[];readonly materialArraySlot:number;readonly sourceAddress:MeshSourceAddress;readonly slotIndex:number}
export interface NativeMeshMaterialWitness {
 nativeRepresentationId:string;sourceBlob:JsonObject;sourceProfile:JsonObject;format:MeshSourceFormat;sourceAddress:MeshSourceAddress;
 childPath:readonly number[];materialArraySlot:number;targetRepresentationId:string;targetProfile:JsonObject;targetMaterialLayoutId:string;targetLogicalMaterialSlotId:string;
}
export type NativeSourceOccurrence=NativeOccurrence|NativeMeshOccurrence;
export type NativeConversionMaterialWitness=NativeMaterialWitness|NativeMeshMaterialWitness;
function nativeAppearanceSource(representationId:string,materialSlotKey:string,models:ReadonlyMap<string,NativeModelFacts>,rows:ReadonlyMap<string,readonly NativeSourceOccurrence[]>):MeshMaterialSource{
  const row=rows.get(representationId)?.find(r=>nativeMaterialSlotKey(r.childPath,r.materialArraySlot)===materialSlotKey);
  const material=row&&models.get(representationId)?.materials.find(m=>(m.sourceLocator as JsonObject).slotIndex===row.slotIndex);
  return material&&meshMaterialSemantics(material.sourceSemantics)||fileError('元の材質の対応を確認できません。');
}
export function nativeUsesStandardMaterial(snapshot:NativeProjectSnapshotV1,models:ReadonlyMap<string,NativeModelFacts>,rows:ReadonlyMap<string,readonly NativeSourceOccurrence[]>):boolean{
  let needed=false;for(const a of snapshot.meshMaterialAppearances??[]){const source=nativeAppearanceSource(a.representationId,a.materialSlotKey,models,rows);needed=standardMaterialNeeded(source,a.opacity,a.chroma.enabled)||needed;}return needed;
}
export function nativeMaterialConversionNotices(snapshot:NativeProjectSnapshotV1,models:ReadonlyMap<string,NativeModelFacts>,rows:ReadonlyMap<string,readonly NativeSourceOccurrence[]>):readonly MaterialConversionNotice[]{
  const notices:MaterialConversionNotice[]=[],sets=nativeDisplaySetsV1(snapshot),standard=nativeUsesStandardMaterial(snapshot,models,rows);
  const byRepresentation=new Map<string,NonNullable<NativeProjectSnapshotV1['meshMaterialAppearances']>[number][]>();
  for(const a of snapshot.meshMaterialAppearances??[]){const group=byRepresentation.get(a.representationId)??[];group.push(a);byRepresentation.set(a.representationId,group);}
  for(const r of snapshot.representations){
    if(r.role!=='meshPrimary')continue;
    const model=snapshot.assets.find(a=>a.id===r.assetId)!.label;
    const rowRanks=new Map(rows.get(r.id)?.map(row=>[nativeMaterialSlotKey(row.childPath,row.materialArraySlot),row.slotIndex]));
    const byRank=new Map<number,NonNullable<NativeProjectSnapshotV1['meshMaterialAppearances']>[number][]>();
    for(const a of byRepresentation.get(r.id)??[]){const rank=rowRanks.get(a.materialSlotKey);if(rank===undefined)return fileError('元の材質の対応を確認できません。');const group=byRank.get(rank)??[];group.push(a);byRank.set(rank,group);}
    for(const slot of models.get(r.id)?.materials??[]){
      const source=meshMaterialSemantics(slot.sourceSemantics);if(!source)continue;
      const rank=(slot.sourceLocator as JsonObject).slotIndex??(slot.sourceLocator as JsonObject).materialIndex??0;
      const material=`材質 ${Number(rank)+1}`;
      const appearances=byRank.get(Number(rank))??[];
      for(const a of standard?appearances:[]){
        const labels={scene:sets.find(scene=>scene.id===a.displaySetId)!.name,model,material};
        const notice=materialConversionNotice(labels,source,nativeAppearanceIntent(a,nativeStandardMaterialRecipe),a.chroma.enabled&&a.chroma.feather===0);
        if(notice)notices.push(notice);
      }
      if(source.coverage.kind==='blend'){const addressed=new Set(appearances.map(a=>a.displaySetId));for(const scene of sets)if(!addressed.has(scene.id)){const notice=sourceBlendNotice({scene:scene.name,model,material},source);if(notice)notices.push(notice);}}
    }
  }
  return notices;
}
/** Complete inspected occurrence proof, including hidden Scenes and retained revisions. */
export function nativeUsesExpandedMaterialSource(snapshot:NativeProjectSnapshotV1,models:ReadonlyMap<string,NativeModelFacts>,rows:ReadonlyMap<string,readonly NativeSourceOccurrence[]>):boolean{
  let expanded=false;
  for(const a of snapshot.meshMaterialAppearances??[]){
    const row=rows.get(a.representationId)?.find(r=>nativeMaterialSlotKey(r.childPath,r.materialArraySlot)===a.materialSlotKey);
    const material=row&&models.get(a.representationId)?.materials.find(m=>(m.sourceLocator as JsonObject).slotIndex===row.slotIndex);
    const source=material&&opaqueMaterialSource(material.sourceSemantics);
    if(!source)return fileError('元の不透明な材質の対応を確認できません。');
    expanded ||= source.lighting==='unlit'||source.doubleSided;
  }
  return expanded;
}
type SourceKey = readonly (string | number | SourceKey)[];
export interface NativeMappingEntry { id: string; sha256: string; preimage: string }
/** One conversion's collision registry; original identity, not text similarity, owns each key. */
export function nativeConversionIds(conversionId: string, sourceZipSha256: string, recipe: NativeConversionRecipe = nativeConversionRecipe) {
  technicalId(conversionId);
  if (!/^[0-9a-f]{64}$/.test(sourceZipSha256)) return fileError('変換元の識別情報が不正です。');
  const entries = new Map<string, NativeMappingEntry>(), full = new Map<string, string>();
  const byPreimage = new Map<string, string>();
  const id = async (prefix: string, key: SourceKey) => {
    const preimage = `lociview:${recipe}:id:jcs-v1\n` + JSON.stringify([conversionId, sourceZipSha256, prefix, key]);
    const existing = byPreimage.get(preimage); if (existing) return existing;
    const sha256 = await digest(new TextEncoder().encode(preimage)), value = `${prefix}_${sha256.slice(0, 32)}`, old = entries.get(value);
    if (old && (old.sha256 !== sha256 || old.preimage !== preimage) || nativeRecipeHasOrigin(recipe) && full.has(sha256) && full.get(sha256) !== preimage) return fileError('変換先の識別情報が衝突しました。');
    entries.set(value, { id: value, sha256, preimage }); full.set(sha256, preimage); byPreimage.set(preimage, value); return value;
  };
  return { id, report: () => nativeRecipeHasOrigin(recipe) ? [...entries.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : [...entries.values()] };
}
const rank = (n: number) => `A${n.toString(36).padStart(8, '0')}`;
const copy = (value: unknown) => cloneCanonicalValue(value, limits) as JsonObject;
function nativeRevisionProvenance(snapshot: NativeProjectSnapshotV1, representationIds: readonly string[], spatial: boolean): JsonObject {
  const reps = representationIds.map(id => snapshot.representations.find(r => r.id === id)!);
  const result: Record<string, JsonValue> = {origin: 'import', inputBlobDigests: [...new Set(reps.map(r => r.blob.digest))].sort()};
  const types = [...new Set(reps.map(r => r.blob.mediaType))];
  if (!spatial || types.length === 1) result.sourceMediaType = spatial ? types[0]! : 'model/gltf-binary';
  return result;
}
export function nativeAppearanceIntent(a: NonNullable<NativeProjectSnapshotV1['meshMaterialAppearances']>[number],recipe:NativeConversionRecipe=nativeAppearanceRecipe):MaterialIntent {
  const quantize = (c: number) => {
    const x = c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
    const y = x < 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 0.41666) - 0.055;
    return Math.round(255 * Math.min(1, Math.max(0, y))) / 255;
  };
  return { appearance: { opacity: a.opacity, doubleSided: a.doubleSided, lighting: a.unlit ? 'unlit' : 'inherit',
    chroma: { enabled: a.chroma.enabled, keyColorSrgb: a.chroma.colorSrgb.map(quantize),
      tolerance: a.chroma.tolerance / Math.sqrt(3), softness: (recipe===nativeStandardMaterialRecipe&&a.chroma.enabled?a.chroma.feather:Math.max(a.chroma.feather, 0.0001)) / Math.sqrt(3) } },
    compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' } };
}

/** Exact §5.3 mapper; no filename matching, normalization, model selection or storage writes. */
export async function mapNativeProject(snapshot: NativeProjectSnapshotV1, models: ReadonlyMap<string, NativeModelFacts>, conversionId: string, sourceSha256: string,
  sourceWitness?: ReadonlyMap<string, readonly NativeSourceOccurrence[]>, capturedIdentity?: JsonObject) {
  const appearance = !!snapshot.meshMaterialAppearances?.length, jpeg = [...models.values()].some(m => m.jpeg) || snapshot.mediaResources?.some(m => m.blob.mediaType === 'image/jpeg');
  const photo = snapshot.mediaResources?.some(m => m.blob.mediaType === 'image/webp' || m.blob.mediaType === 'image/gif');
  const spatial = snapshot.representations.some(r => r.role !== 'meshPrimary');
  const mesh=[...models.values()].some(m=>m.newMesh), bounded=spatial||mesh;
  const standard=appearance&&sourceWitness&&nativeUsesStandardMaterial(snapshot,models,sourceWitness);
  const expanded=!standard&&appearance&&sourceWitness&&nativeUsesExpandedMaterialSource(snapshot,models,sourceWitness);
  const recipe: NativeConversionRecipe = standard ? nativeStandardMaterialRecipe : expanded ? nativeOpaqueMaterialRecipe : mesh ? nativeMeshRecipe : spatial ? nativeSpatialRecipe : photo ? appearance ? nativeAppearancePhotoRecipe : nativePhotoRecipe : appearance ? jpeg ? nativeAppearanceJpegRecipe : nativeAppearanceRecipe : jpeg ? nativeJpegRecipe : nativeConversionRecipe;
  if ((bounded || nativeRecipeHasAppearance(recipe)) && !sourceWitness) return fileError('元の材質の対応記録が不足しています。');
  const ids = nativeConversionIds(conversionId, sourceSha256, recipe), id = ids.id;
  const one = (prefix: string, name: string, source: string) => id(prefix, [name, source]);
  const asset = (s: string) => one('ast', 'asset', s), revision = (s: string) => one('rev', 'revision', s), binding = (s: string) => one('bnd', 'binding', s);
  const rep = (s: string) => one('rep', 'representation', s), frame = (s: string) => one('frm', 'frame', s), scene = (s: string) => one('scn', 'display-set', s);
  const caption = (s: string) => one('cap', 'caption', s), media = (s: string) => one('med', 'media', s), view = (s: string) => one('view', 'view', s);
  const family = (a: string, s: string) => id('fam', ['family', a, s]), compatibility = (a: string, s: string) => id('cmp', ['anchor-class', a, s]);
  const active = async (prefix: string, key: SourceKey) => ({ state: 'active', reason: 'initial', eventId: await id('evt', ['initial-event', prefix, key]) });
  const records = Object.fromEntries(Object.keys(projectRecordMaps).map(k => [k, {}])) as Record<string, JsonValue>;
  const add = (map: keyof typeof projectRecordMaps, r: JsonObject) => { (records[map] as Record<string, JsonValue>)[r.id as string] = r; };
  records.schema = { major: 2, minor: 1 };
  records.identity = capturedIdentity ?? { projectId: `prj_${conversionId}`, historyEpoch: `hep_${newId()}`, lineageSeed: newId() + newId() };
  if ((records.identity as JsonObject).projectId !== `prj_${conversionId}`) return fileError('変換先の識別情報が一致しません。');
  records.project = { title: snapshot.project.title, frame: { ...copy(snapshot.project.frame), id: await frame(snapshot.project.frame.id) },
    defaultSceneId: await scene(snapshot.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID) };
  const baseProfile = await (appearance || bounded ? occurrenceGlbProfile : validationGlbProfile)();
  const targetModels = new Map<string, { record: JsonObject; model: NativeModelFacts }>();
  if (baseProfile.specificationSha256 !== (bounded || nativeRecipeHasAppearance(recipe) ? '9bbf1243a3786d54a6439104614c46e502a3cdfa20dc9e9d610ee1da42cf059f' : '077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f')) return fileError('変換レシピとモデル検証の版が一致しません。');
  const materialWitness: NativeConversionMaterialWitness[] = [];
  for (const r of snapshot.representations) {
    const model = models.get(r.id); if (!model) return fileError('モデルの検証結果が不足しています。');
    const occurrenceCatalog = !model.newMesh && r.role === 'meshPrimary' && (bounded || appearance);
    const meshRows=model.newMesh?sourceWitness!.get(r.id) as readonly NativeMeshOccurrence[]:undefined;
    const profile = model.newMesh ? await meshSourceProfile(model.newMesh.format) : r.role === 'pointPrimary' ? await nativePointSourceProfile() : r.role === 'gsPrimary' ? await gsSourceProfile() :
      r.role === 'interactionProxy' ? await nativeProxySourceProfile() : model.jpeg ? await (occurrenceCatalog ? occurrenceJpegGlbProfile() : jpegGlbProfile()) : baseProfile;
    const occurrenceByRank = new Map(model.occurrences?.map(o => [o.slotIndex, o]) ?? []);
    const slots = await Promise.all(model.materials.map(async (material): Promise<JsonObject & { logicalMaterialSlotId: string }> => {
      const locator = material.sourceLocator as JsonObject;
      const occurrence = occurrenceByRank.get(locator.slotIndex as number);
      if (occurrenceCatalog && !occurrence) return fileError('材質の面の対応が不足しています。');
      const address=meshRows?.find(row=>row.slotIndex===locator.slotIndex)?.sourceAddress;
      if(model.newMesh&&!address)return fileError('元の材質の対応が不足しています。');
      return { ...material, logicalMaterialSlotId: await id('slot', address ? address.kind==='gltf-occurrence' ? ['material-occurrence',r.id,address.nodeIndex,address.primitiveIndex] : ['material-slot',r.id,'representationMaterial',address.slotIndex] : occurrenceCatalog ?
        ['material-occurrence', r.id, occurrence!.nodeIndex, occurrence!.primitiveIndex] : ['material-slot', r.id, locator.kind as string,
        locator.kind === 'gltfMaterial' ? locator.materialIndex as number : 0]) };
    }));
    slots.sort((a, b) => a.logicalMaterialSlotId.localeCompare(b.logicalMaterialSlotId));
    const logicalByRank = new Map(slots.map(s => [(s.sourceLocator as JsonObject).slotIndex, s.logicalMaterialSlotId]));
    const record = await sealValidationRecord('representation', { id: await rep(r.id), assetId: await asset(r.assetId),
      representationFrameId: await frame(r.representationFrameId), contentKind: r.contentKind, purposes: [...r.purposes], role: r.role,
      variantFamilyId: await family(r.assetId, r.variantFamilyId), formatProfile: profile, blob: {...copy(r.blob), ...(r.role === 'pointPrimary' || r.role === 'gsPrimary' || model.newMesh?.format==='ply' ? {mediaType: 'application/ply'} : {})},
      representationToAsset: copy(r.representationToAsset), derivedFrom: bounded ? (await Promise.all(r.derivedFrom.map(rep))).sort() : [], logicalBoundsAsset: model.bounds,
      ...(r.proxyForGsVariantFamilyId ? {proxyForGsVariantFamilyId: await family(r.assetId, r.proxyForGsVariantFamilyId)} : {}),
      ...(r.role === 'gsPrimary' ? {} : {materialCatalog: { layoutId: await id('lay', ['material-layout', r.id]), slots }}) });
    add('representationsById', record); targetModels.set(record.id as string, { record, model });
    if(model.newMesh&&r.role==='meshPrimary'){
      if(meshRows!.length!==slots.length)return fileError('元の材質の対応表が不足しています。');
      for(const row of meshRows!)materialWitness.push({nativeRepresentationId:r.id,sourceBlob:copy(r.blob),sourceProfile:copy(r.formatProfile),format:model.newMesh.format,sourceAddress:row.sourceAddress,childPath:[...row.childPath],materialArraySlot:row.materialArraySlot,targetRepresentationId:record.id as string,targetProfile:{...profile},targetMaterialLayoutId:(record.materialCatalog as JsonObject).layoutId as string,targetLogicalMaterialSlotId:logicalByRank.get(row.slotIndex)!});
    }else if (occurrenceCatalog) {
      const rows = sourceWitness!.get(r.id); if (!rows || rows.length !== slots.length) return fileError('材質の対応表が不足しています。');
      for (const row of rows as readonly NativeOccurrence[]) materialWitness.push({ nativeRepresentationId: r.id, sourceGlbSha256: r.blob.digest,
        childPath: [...row.childPath], materialArraySlot: 0, nodeIndex: row.nodeIndex, primitiveIndex: row.primitiveIndex,
        sourceMaterialIndex: row.materialIndex, slotIndex: row.slotIndex, targetRepresentationId: record.id as string,
        targetProfile: { ...profile }, targetMaterialLayoutId: (record.materialCatalog as JsonObject).layoutId as string,
        targetLogicalMaterialSlotId: logicalByRank.get(row.slotIndex)! });
    }
  }
  for (const r of snapshot.assetRevisions) add('assetRevisionsById', await sealValidationRecord('asset-revision', {
    id: await revision(r.id), assetId: await asset(r.assetId), representationIds: (await Promise.all(r.representationIds.map(rep))).sort(),
    anchorCompatibilityClasses: (await Promise.all(r.anchorCompatibilityClasses.map(async c => ({ id: await compatibility(r.assetId, c.id),
      targetVariantFamilyIds: (await Promise.all(c.targetVariantFamilyIds.map(f => family(r.assetId, f)))).sort() })))).sort((a, b) => a.id.localeCompare(b.id)),
    provenance: nativeRevisionProvenance(snapshot, r.representationIds, bounded),
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
  const repById = new Map(snapshot.representations.map(r => [r.id, r]));
  const witnessByTarget = new Map(materialWitness.map(w => [`${w.nativeRepresentationId}/${nativeMaterialSlotKey(w.childPath, w.materialArraySlot)}`, w]));
  if(witnessByTarget.size!==materialWitness.length)return fileError('元の材質の対応が重複しています。');
  for (const a of snapshot.meshMaterialAppearances ?? []) {
    const r = repById.get(a.representationId)!, witness = witnessByTarget.get(`${r.id}/${a.materialSlotKey}`);
    if (!witness) return fileError('元の材質の面を特定できません。');
    const key: SourceKey = ['mesh-appearance', a.id];
    add('materialOverridesById', { id: await id('ovr', key), routing: { scope: { kind: 'scene', sceneId: await scene(a.displaySetId) },
      target: { assetId: await asset(a.assetId), variantFamilyId: await family(r.assetId, r.variantFamilyId),
        materialLayoutId: witness.targetMaterialLayoutId, logicalMaterialSlotId: witness.targetLogicalMaterialSlotId } },
      ...nativeAppearanceIntent(a,recipe), lifecycle: await active('ovr', key) });
  }
  const checked = admitProjectRecords(records, limits, 'map2');
  if (checked.kind !== 'valid-records' || checked.hasUnknownFields) return fileError('このファイルの値は、まだそのまま変換できません。');
  materialWitness.sort((a,b)=>a.nativeRepresentationId<b.nativeRepresentationId?-1:a.nativeRepresentationId>b.nativeRepresentationId?1:('sourceAddress'in a?a.sourceAddress.slotIndex:a.slotIndex)-('sourceAddress'in b?b.sourceAddress.slotIndex:b.slotIndex));
  return { records: cloneCanonicalValue(checked.records, limits) as PreparedValidationProject['records'], recipe, materialWitness, mapping: ids.report(), reviewStates, targetModels };
}
