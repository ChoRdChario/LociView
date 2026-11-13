import { inspectDeclaredValidationModel, inspectDeclaredValidationBlob, readValidationBody } from '../projectFiles/content';
import { isPointModel, isGsModel, type ValidatedModel } from '../projectFiles/pointPly';
import { nativeSpatialModelBounds } from '../projectFiles/nativeSpatial';
import type { PhotoDecoder } from '../projectFiles/photo';
import { inspectProjectMedia, projectMediaKind, mediaDisplayDimensions, type MediaDecoders } from '../projectFiles/media';
import { inspectPortableHeic } from '../projectFiles/portableHeic';
import { portableDisplay, displayBlobRef } from '../domain/portableMedia';
import * as THREE from 'three';
import { canonical, list, object, same, string } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import { materialForDisplay, type MaterialIntent } from '../domain/materialIntent';
import { ReviewArchive } from '../projectPackage/reviewArchive';
import type { PackageArchive } from '../projectPackage/zipArchive';
import type { PngDecoder } from '../projectFiles/png';
import type { JpegDecoder } from '../projectFiles/jpeg';
import { validationMetadataLimits, projectFilePolicy, type ProjectFilePolicyInput } from '../projectFiles/validation';
import { value } from '../scene/types';
import type { CaptionListItem, CaptionListSource } from '../ui/projectScene/captionListState';
import type { ReadonlyRenderModel } from './modelTypes';
import { projectBounds, pointInProject, type ReadonlyDisplay, type V3 } from './viewportModel';
import { readProjectCamera, readSolidBackground } from './viewDisplay';
import { validationMaterialIssue, validationMaterialSlots, type ValidationMaterialEffects } from './validationMaterials';
import { sourceStreamProof } from '../projectFiles/streamSource';

const table = (r: JsonObject, name: string) => object(r[name]) as Record<string, JsonObject>;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const ordered = (rows: JsonObject[]) => rows.sort((a, b) => compare(string(a.orderKey), string(b.orderKey)) || compare(string(a.id), string(b.id)));
export const reviewSceneChoices = (snapshot: JsonObject) => ordered(snapshot.scene ? [object(snapshot.scene)] : Object.values(table(snapshot, 'scenesById')));

/** Inspected read-only file content. No storage, history, synthetic Project or commands. */
export async function prepareReviewView(file: Blob | PackageArchive | ReviewArchive, budget: ProjectFilePolicyInput, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder, mediaDecoders?:MediaDecoders, selectedScene?: string) {
  const policy=projectFilePolicy(budget), limits=policy.nonGs;
  const inspection = file instanceof ReviewArchive ? file : file instanceof Blob ? await ReviewArchive.inspect(file, validationMetadataLimits) :
    await ReviewArchive.fromSelectedArchive(file, validationMetadataLimits);
  const original = inspection.archive.sourceSnapshot(), review = inspection.review;
  const snapshot = review.snapshot, project = object(snapshot.project), sceneId = selectedScene ?? string(project.defaultSceneId);
  const scenes = reviewSceneChoices(snapshot);
  const scene = scenes.find(row => row.id === sceneId);
  if (!scene) throw Error('シーンを選び直してください。');
  const membership = (map: string) => Object.values(table(snapshot, map)).filter(row => row.sceneId === sceneId);
  const visibleAssets = new Set(membership('sceneAssetMembershipsById').map(row => row.assetId));
  if (review.closure.entries.reduce((n, b) => n + b.byteLength, 0) > policy.projectBodyBytes)
    throw Error('この検証画面の容量上限を超えています。元のファイルは変更していません。');
  const models: ReadonlyRenderModel[] = [], decoded = new Map<string, ValidatedModel>(), images = new Map<string, Blob>();
  const assets = table(snapshot, 'assetsById'), representations = table(snapshot, 'representationsById');
  for (const asset of Object.values(assets)) {
    if (asset.kind !== 'visual' || !visibleAssets.has(asset.id)) continue;
    const ids = list(asset.representationIds), reps=ids.map(id=>representations[string(id)]!),visuals=reps.filter(r=>r.role!=='interactionProxy'),proxies=reps.filter(r=>r.role==='interactionProxy');
    if(visuals.length!==1||proxies.length>1||proxies.length&&(visuals[0]!.role!=='gsPrimary'||proxies[0]!.proxyForGsVariantFamilyId!==visuals[0]!.variantFamilyId))throw Error('モデルと位置指定用の面の対応を確認できません。');
    for(const record of reps){const blob = object(record.blob);
    const file=inspection.archive.entryBlob(`blobs/sha256/${string(blob.digest)}`);
    const source = record.contentKind==='gaussianSplat' ? await inspectDeclaredValidationBlob(record,file,policy,decode,jpeg,'review') :
      await inspectDeclaredValidationModel(record,await readValidationBody(file,limits.maxFileBytes),limits,decode,jpeg,'review');
    const slots = isGsModel(source)&&record.materialCatalog===undefined?[]:list(object(record.materialCatalog).slots).map(object);
    const actual = new Set(source.materials.map(canonical));
    if (!same(record.logicalBoundsAsset, nativeSpatialModelBounds(record, source)) || slots.length !== source.materials.length ||
      slots.some(s => !actual.delete(canonical({ sourceLocator: s.sourceLocator!, sourceSemantics: s.sourceSemantics! }))) || actual.size)
      throw Error('モデルの形状・材質と表示情報が一致しません。');
    if (isGsModel(source) || isPointModel(source)) decoded.set(string(record.id), source);
    if(record===visuals[0])models.push({ shape: isGsModel(source) ? 'render-gs' : isPointModel(source) ? 'render-point' : source.kind==='mesh-source'?'render-mesh':'render-glb', key: `${review.token}/${record.id}`, assetId: string(asset.id),
      assetToProject: asset.assetToProject as unknown as ReadonlyRenderModel['assetToProject'], representation: record as ReadonlyRenderModel['representation'],...(proxies[0]?{proxy:proxies[0] as NonNullable<ReadonlyRenderModel['proxy']>}: {}) });
    }
  }
  const mediaRecords = table(snapshot, 'mediaResourcesById');
  const verifyMedia = async (record: JsonObject) => {
    const blob = object(record.blob); if (!projectMediaKind(blob.mediaType)||record.mediaKind!==projectMediaKind(blob.mediaType)) throw Error('このメディアの表示形式は未対応です。');
    const bytes = await readValidationBody(inspection.archive.entryBlob(`blobs/sha256/${string(blob.digest)}`), limits.maxFileBytes);
    const display = portableDisplay(record); let shown = bytes;
    if (display) {
      shown = await readValidationBody(inspection.archive.entryBlob(`blobs/sha256/${string(display.blob.digest)}`), limits.maxFileBytes);
      await inspectPortableHeic(bytes, shown, display, limits, decode);
    } else if ((await inspectProjectMedia(bytes, limits, decode, jpeg, photo,mediaDecoders)).mediaType !== blob.mediaType) throw Error('メディアの本体形式が一致しません。');
    const shownRef = displayBlobRef(record), view = inspection.archive.entryBlob(`blobs/sha256/${string(shownRef.digest)}`);
    const proof = await sourceStreamProof(view);
    if (proof.byteLength !== shownRef.byteLength || proof.digest !== shownRef.digest) throw Error('画像の原本が一致しません。');
    // Native Blob slices retain the immutable archive, not another materialized body copy.
    return view.slice(0, view.size, string(shownRef.mediaType));
  };
  const edges = ordered(membership('sceneCaptionMembershipsById')), captionIds = new Set(edges.map(edge => edge.captionId));
  const attachments = ordered(Object.values(table(snapshot, 'captionAttachmentsById')).filter(edge => captionIds.has(edge.captionId)));
  for (const id of new Set(attachments.map(edge => string(edge.mediaResourceId)))) images.set(id, await verifyMedia(mediaRecords[id]!));
  const savedMaterials: Record<string, ValidationMaterialEffects> = {};
  for (const model of models) {
    const effects: Record<string, MaterialIntent | { issue: string }> = {};
    for (const slot of validationMaterialSlots(model)) {
      const matches = Object.values(table(snapshot, 'materialOverridesById')).filter(r => same(object(r.routing).target, slot.target as unknown as JsonObject));
      const local = matches.filter(r => object(object(r.routing).scope).sceneId === sceneId), global = matches.filter(r => object(object(r.routing).scope).kind === 'project');
      if (local.length > 1 || global.length > 1) throw Error('材質の適用先を確認してください。');
      const selected = local[0] ?? global[0]; if (!selected) continue;
      const intent: MaterialIntent = { appearance: selected.appearance as unknown as MaterialIntent['appearance'],
        compositing: selected.compositing as unknown as MaterialIntent['compositing'] }, issue = validationMaterialIssue(slot, intent, review.semanticProfile);
      if (issue && model.shape !== 'render-point') throw Error(issue); effects[slot.target.logicalMaterialSlotId] = issue ? { issue } : materialForDisplay(intent, review.semanticProfile);
    }
    savedMaterials[model.assetId] = effects;
  }
  const captions = table(snapshot, 'captionsById');
  const items: CaptionListItem[] = edges.map(edge => {
    const caption = captions[string(edge.captionId)]!, anchor = object(caption.anchor);
    const ownerId = anchor.kind === 'asset' ? anchor.assetId : anchor.kind === 'unplaced' ? anchor.ownerAssetId : undefined;
    const owner = ownerId === undefined ? null : assets[string(ownerId)]!;
    const missing = !!owner && owner.kind !== 'visual', needsReview = anchor.kind === 'asset' && !!owner && owner.kind === 'visual' && !list(owner.compatibleAnchorClassIds).includes(anchor.authoredAnchorCompatibilityId!);
    return { id: string(caption.id), title: value(string(caption.title)), body: value(string(caption.body)),
      color: value(caption.colorSrgb === undefined ? '#a08045' :
        '#' + list(caption.colorSrgb).map(n => Math.round(Number(n) * 255).toString(16).padStart(2, '0')).join('')),
      owner: value(owner ? { kind: 'asset' as const, assetId: string(owner.id), name: value(missing ? '対応モデルなし' : string(owner.label)) }
        : { kind: anchor.kind === 'unplaced' ? 'none' as const : 'project' as const }),
      mediaCount: value(attachments.filter(a => a.captionId === caption.id).length), needsReview,
      pin: anchor.kind === 'unplaced' ? 'unplaced' : missing ? 'ownerMissing' : owner && !visibleAssets.has(owner.id) ? 'ownerHidden' : needsReview ? 'needsReview' : 'visible' };
  });
  const source: CaptionListSource = { kind: 'ready', token: review.token, sceneId, captions: items };
  const frameId = string(object(project.frame).id), views = ordered(membership('viewsById'));
  const capture = (viewId: string) => { const view = table(snapshot, 'viewsById')[viewId]; if (view?.sceneId !== sceneId) throw Error('視点を選び直してください。');
    return { camera: readProjectCamera(view.camera), background: readSolidBackground(view.background) }; };
  const box = new THREE.Box3();
  for (const model of models) { const bounds = projectBounds(model.representation.logicalBoundsAsset, model.assetToProject);
    box.union(new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max))); }
  const basePins = items.flatMap(item => {
    if (item.pin === 'ownerMissing' || item.pin === 'ownerHidden' || item.pin === 'unplaced') return [];
    const anchor = object(captions[item.id]!.anchor), owner = anchor.kind === 'asset' ? models.find(m => m.assetId === anchor.assetId) : undefined;
    const position = owner ? pointInProject(anchor.positionAsset as V3, owner.assetToProject) : anchor.positionProject as V3;
    return [{ id: item.id, title: item.title.kind === 'value' ? item.title.value : '', color: item.color.kind === 'value' ? item.color.value : '',
      position, scale: anchor.kind === 'asset' ? Number(assets[string(anchor.assetId)]!.pinScale ?? 1) : 1,
      status: item.needsReview ? 'needsReview' as const : 'normal' as const }];
  });
  const display = (colors: readonly string[] | null, selectedId: string | null): ReadonlyDisplay => ({ readOnly: true,
    token: review.token, sceneId, projectFrameId: frameId, models, selectedId, savedMaterials,
    pins: basePins.filter(p => colors === null || colors.includes(p.color)),
    bounds: box.isEmpty() ? null : { min: box.min.toArray() as [number, number, number], max: box.max.toArray() as [number, number, number] },
    entry: scene.defaultViewId ? { kind: 'ready', payload: capture(string(scene.defaultViewId)) } : { kind: 'none' } });
  return { original, inspection, source, models, images, attachments, scenes, views, entryViewId: scene.defaultViewId ? string(scene.defaultViewId) : null, capture, display, rasterResources: decode?.rasterResources,
    releaseDisplayData() { decoded.clear(); images.clear(); },
    imageDimensions:(bytes:Uint8Array,mime:string)=>mediaDisplayDimensions(bytes,mime,limits,decode?.rasterResources),
    title: string(project.title), sceneName: string(scene.name),
    content: { async image(record: JsonObject) { const expected = mediaRecords[string(record.id)];
      if (!expected || !same(expected, record)) throw Error('画像の表示本体を確認してください。'); return verifyMedia(record);
    }, async modelContent(record: JsonObject) { const expected = representations[string(record.id)], body = decoded.get(string(record.id));
      if (!expected || !same(expected, record)) throw Error('モデルの表示本体を確認してください。'); if (body) return body;
      const ref = object(record.blob), file = inspection.archive.entryBlob(`blobs/sha256/${string(ref.digest)}`), proof = await sourceStreamProof(file);
      if (proof.digest !== ref.digest || proof.byteLength !== ref.byteLength) throw Error('モデルの原本が一致しません。');
      return inspectDeclaredValidationBlob(record, file, policy, decode, jpeg, 'review'); } } };
}
export type ReviewView = Awaited<ReturnType<typeof prepareReviewView>>;
