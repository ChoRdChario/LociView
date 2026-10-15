import * as THREE from 'three';
import { canonical, list, object, same, string } from '../../domain/projectGraphSupport';
import type { JsonObject } from '../../domain/values';
import { materialForDisplay, type MaterialIntent } from '../../domain/materialIntent';
import { ReviewArchive } from '../../projectPackage/reviewArchive';
import { inspectValidationGlb, type ValidatedGlb } from '../../projectFiles/glb';
import { inspectOccurrenceGlb } from '../../projectFiles/glbOccurrences';
import { inspectValidationPng, type PngDecoder } from '../../projectFiles/png';
import { validationGlbProfile, occurrenceGlbProfile, validationMetadataLimits, type FileValidationLimits } from '../../projectFiles/validation';
import { identityPlacement } from '../../projectFiles/initialProject';
import { value } from '../../scene/types';
import type { CaptionListItem, CaptionListSource } from '../../ui/projectScene/captionListState';
import type { ReadonlyRenderModel } from './modelTypes';
import { projectBounds, pointInProject, type ReadonlyDisplay, type V3 } from './viewportModel';
import { readProjectCamera, readSolidBackground } from './viewHistory';
import { validationMaterialIssue, validationMaterialSlots, type ValidationMaterialEffects } from './validationMaterials';

const table = (r: JsonObject, name: string) => object(r[name]) as Record<string, JsonObject>;
const ordered = (rows: JsonObject[]) => rows.sort((a, b) => string(a.orderKey).localeCompare(string(b.orderKey)) || string(a.id).localeCompare(string(b.id)));

/** Inspected read-only file content. No storage, history, synthetic Project or commands. */
export async function prepareReviewView(file: Blob, limits: FileValidationLimits, decode?: PngDecoder) {
  const original = file.slice(), inspection = await ReviewArchive.inspect(original, validationMetadataLimits), review = inspection.review;
  const snapshot = review.snapshot, scene = object(snapshot.scene), sceneId = string(scene.id), project = object(snapshot.project);
  if (review.closure.entries.reduce((n, b) => n + b.byteLength, 0) > limits.maxFileBytes)
    throw Error('この検証画面の容量上限を超えています。元のファイルは変更していません。');
  const profile = await validationGlbProfile(), occurrence = await occurrenceGlbProfile(), models: ReadonlyRenderModel[] = [], decoded = new Map<string, ValidatedGlb>(), images = new Map<string, Blob>();
  const assets = table(snapshot, 'assetsById'), representations = table(snapshot, 'representationsById');
  for (const asset of Object.values(assets)) {
    if (asset.kind !== 'visual') continue;
    const ids = list(asset.representationIds); if (ids.length !== 1) throw Error('この検証画面では、1つの表示本体を持つモデルだけを開けます。');
    const record = representations[string(ids[0])]!, blob = object(record.blob);
    if ((!same(record.formatProfile, profile) && !same(record.formatProfile, occurrence)) || record.contentKind !== 'mesh' || record.role !== 'meshPrimary' || !same(record.purposes, ['display']) ||
      !same(record.representationToAsset, { ...identityPlacement(), reflection: 'none' }) || blob.mediaType !== 'model/gltf-binary')
      throw Error('このモデルの表示形式は未対応です。元のファイルは変更していません。');
    const bytes = await inspection.archive.entryBytes(`blobs/sha256/${string(blob.digest)}`, limits.maxFileBytes);
    const source = await (same(record.formatProfile, occurrence) ? inspectOccurrenceGlb : inspectValidationGlb)(bytes, limits, decode), catalog = object(record.materialCatalog), slots = list(catalog.slots).map(object);
    const actual = new Set(source.materials.map(canonical));
    if (!same(record.logicalBoundsAsset, source.bounds) || slots.length !== source.materials.length ||
      slots.some(s => !actual.delete(canonical({ sourceLocator: s.sourceLocator!, sourceSemantics: s.sourceSemantics! }))) || actual.size)
      throw Error('モデルの形状・材質と表示情報が一致しません。');
    decoded.set(string(record.id), source);
    models.push({ shape: 'render-glb', key: `${review.token}/${record.id}`, assetId: string(asset.id),
      assetToProject: asset.assetToProject as unknown as ReadonlyRenderModel['assetToProject'], representation: record as ReadonlyRenderModel['representation'] });
  }
  for (const record of Object.values(table(snapshot, 'mediaResourcesById'))) {
    const blob = object(record.blob); if (record.mediaKind !== 'image' || blob.mediaType !== 'image/png') throw Error('このメディアの表示形式は未対応です。');
    const bytes = await inspection.archive.entryBytes(`blobs/sha256/${string(blob.digest)}`, limits.maxFileBytes); await inspectValidationPng(bytes, limits, decode);
    images.set(string(record.id), new Blob([bytes.slice().buffer], { type: 'image/png' }));
  }
  const savedMaterials: Record<string, ValidationMaterialEffects> = {};
  for (const model of models) {
    const effects: Record<string, MaterialIntent | { issue: string }> = {};
    for (const slot of validationMaterialSlots(model)) {
      const matches = Object.values(table(snapshot, 'materialOverridesById')).filter(r => same(object(r.routing).target, slot.target as unknown as JsonObject));
      const local = matches.filter(r => object(object(r.routing).scope).kind === 'scene'), global = matches.filter(r => object(object(r.routing).scope).kind === 'project');
      if (local.length > 1 || global.length > 1) throw Error('材質の適用先を確認してください。');
      const selected = local[0] ?? global[0]; if (!selected) continue;
      const intent: MaterialIntent = { appearance: selected.appearance as unknown as MaterialIntent['appearance'],
        compositing: selected.compositing as unknown as MaterialIntent['compositing'] }, issue = validationMaterialIssue(slot, intent, review.semanticProfile);
      if (issue) throw Error(issue); effects[slot.target.logicalMaterialSlotId] = materialForDisplay(intent, review.semanticProfile);
    }
    savedMaterials[model.assetId] = effects;
  }
  const attachments = ordered(Object.values(table(snapshot, 'captionAttachmentsById'))), captions = table(snapshot, 'captionsById');
  const items: CaptionListItem[] = ordered(Object.values(table(snapshot, 'sceneCaptionMembershipsById'))).map(edge => {
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
      pin: anchor.kind === 'unplaced' ? 'unplaced' : missing ? 'ownerMissing' : needsReview ? 'needsReview' : 'visible' };
  });
  const source: CaptionListSource = { kind: 'ready', token: review.token, sceneId, captions: items };
  const frameId = string(object(project.frame).id), views = ordered(Object.values(table(snapshot, 'viewsById')));
  const capture = (viewId: string) => { const view = table(snapshot, 'viewsById')[viewId]; if (!view) throw Error('視点を選び直してください。');
    return { camera: readProjectCamera(view.camera), background: readSolidBackground(view.background) }; };
  const box = new THREE.Box3();
  for (const model of models) { const bounds = projectBounds(model.representation.logicalBoundsAsset, model.assetToProject);
    box.union(new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max))); }
  const basePins = items.flatMap(item => {
    if (item.pin === 'ownerMissing' || item.pin === 'unplaced') return [];
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
  return { original, inspection, source, models, images, attachments, views, capture, display,
    title: string(project.title), sceneName: string(scene.name),
    content: { async model(record: JsonObject) { const expected = representations[string(record.id)], body = decoded.get(string(record.id));
      if (!expected || !same(expected, record) || !body) throw Error('モデルの表示本体を確認してください。'); return body; } } };
}
export type ReviewView = Awaited<ReturnType<typeof prepareReviewView>>;
