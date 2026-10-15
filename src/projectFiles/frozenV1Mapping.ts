import { admitProjectRecords, projectRecordMaps } from '../domain/projectRecords';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { digest, newId, technicalId } from '../projectMetadata/persistence';
import { identityPlacement, sealValidationRecord, type PreparedValidationProject } from './initialProject';
import { frozenV1Recipe, frozenV1JpegRecipe, frozenV1PhotoRecipe, frozenV1DefaultViewRecipe, frozenV1PlacementRecipe, frozenV1Placement, type FrozenV1Recipe, sourceColor, codeOrder, type FrozenV1Plan } from './frozenV1Source';
import { fileError, validationGlbProfile, jpegGlbProfile, validationMetadataLimits as limits } from './validation';

type Key = readonly (string | number | Key)[];
export interface FrozenV1MappingEntry { id: string; sha256: string; preimage: string }
export function frozenV1SourceKey(prefix: unknown, key: unknown, nested = false): boolean {
  if (typeof prefix !== 'string' || !Array.isArray(key)) return false;
  const simple: Record<string, string[]> = { frm: ['project-frame', 'asset-frame', 'representation-frame'], ast: ['asset'],
    rep: ['model-representation'], rev: ['model-revision'], bnd: ['model-binding'], fam: ['mesh-family'], cmp: ['anchor-class'],
    lay: ['material-layout'], med: ['media'], scn: ['set'], cap: ['caption'], tag: ['tag'], view: ['view'] };
  if (Object.hasOwn(simple, prefix)) return key.length === 2 && simple[prefix]!.includes(key[0]) && typeof key[1] === 'string';
  const pair: Record<string, string> = { sam: 'scene-asset', scm: 'scene-caption', tgm: 'caption-tag' };
  if (Object.hasOwn(pair, prefix)) return key.length === 3 && key[0] === pair[prefix] && key.slice(1).every(v => typeof v === 'string');
  const index = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  if (prefix === 'slot') return key.length === 4 && key[0] === 'material-slot' && typeof key[1] === 'string' &&
    (key[2] === 'gltfMaterial' && index(key[3]) || key[2] === 'representationMaterial' && key[3] === 0);
  if (prefix === 'att') return key.length === 4 && key[0] === 'attachment' && typeof key[1] === 'string' && index(key[2]) && typeof key[3] === 'string';
  return prefix === 'evt' && !nested && key.length === 3 && key[0] === 'initial-event' && ['ast', 'scn', 'sam', 'cap', 'scm', 'att', 'tag', 'tgm', 'view'].includes(key[1]) && frozenV1SourceKey(key[1], key[2], true);
}
export function frozenV1ConversionIds(conversionId: string, sourceZipSha256: string, recipe: FrozenV1Recipe = frozenV1Recipe) {
  technicalId(conversionId); if (!/^[0-9a-f]{64}$/.test(sourceZipSha256)) return fileError('変換元の識別情報が不正です。');
  const entries = new Map<string, FrozenV1MappingEntry>(), full = new Map<string, string>();
  const id = async (prefix: string, key: Key) => {
    if (!frozenV1SourceKey(prefix, key)) return fileError('変換時の識別情報が不正です。');
    const preimage = `lociview:${recipe}:id:jcs-v1\n` + JSON.stringify([conversionId, sourceZipSha256, prefix, key]);
    const sha256 = await digest(new TextEncoder().encode(preimage)), value = `${prefix}_${sha256.slice(0, 32)}`, old = entries.get(value);
    if (old && (old.preimage !== preimage || old.sha256 !== sha256) || [frozenV1JpegRecipe, frozenV1PhotoRecipe, frozenV1DefaultViewRecipe, frozenV1PlacementRecipe].includes(recipe) && full.has(sha256) && full.get(sha256) !== preimage) return fileError('変換先の識別情報が衝突しました。');
    entries.set(value, { id: value, sha256, preimage }); full.set(sha256, preimage); return value;
  };
  return { id, report: () => [frozenV1JpegRecipe, frozenV1PhotoRecipe, frozenV1DefaultViewRecipe, frozenV1PlacementRecipe].includes(recipe) ? [...entries.values()].sort((a, b) => codeOrder(a.id, b.id)) : [...entries.values()] };
}
const rank = (n: number) => `A${n.toString(36).padStart(8, '0')}`;

/** Expected record construction may use a captured identity for validation, never recreate history. */
export async function mapFrozenV1Project(plan: FrozenV1Plan, conversionId: string, sourceSha256: string, capturedIdentity?: JsonObject) {
  const ids = frozenV1ConversionIds(conversionId, sourceSha256, plan.recipe), id = ids.id;
  const one = (prefix: string, name: string, source: string) => id(prefix, [name, source]);
  const asset = (s: string) => one('ast', 'asset', s), scene = (s: string) => one('scn', 'set', s), caption = (s: string) => one('cap', 'caption', s);
  const media = (s: string) => one('med', 'media', s), view = (s: string) => one('view', 'view', s);
  const active = async (prefix: string, key: Key) => ({ state: 'active', reason: 'initial', eventId: await id('evt', ['initial-event', prefix, key]) });
  const records = Object.fromEntries(Object.keys(projectRecordMaps).map(k => [k, {}])) as Record<string, JsonValue>;
  const add = (map: keyof typeof projectRecordMaps, record: JsonObject) => { (records[map] as Record<string, JsonValue>)[record.id as string] = record; };
  records.schema = { major: 2, minor: 1 };
  records.identity = capturedIdentity ?? { projectId: `prj_${conversionId}`, historyEpoch: `hep_${newId()}`, lineageSeed: newId() + newId() };
  if ((records.identity as JsonObject).projectId !== `prj_${conversionId}`) return fileError('変換先の識別情報が一致しません。');
  const projectFrameId = await one('frm', 'project-frame', plan.manifest.projectId);
  records.project = { title: plan.manifest.name, frame: { id: projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } },
    defaultSceneId: await scene(plan.scenes[0]!.id) };
  const profile = await validationGlbProfile(), models = new Map<string, { assetId: string; assetFrameId: string; revisionId: string; compatibilityId: string }>();
  if (profile.specificationSha256 !== '077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f') return fileError('モデル検証の版が一致しません。');
  const targetModels = new Map<string, { record: JsonObject; model: NonNullable<FrozenV1Plan['models'][number]['model']> }>();
  for (const body of plan.models) {
    const s = body.record.id, assetId = await asset(s), assetFrameId = await one('frm', 'asset-frame', s), model = body.model!;
    const revisionId = await one('rev', 'model-revision', s), familyId = await one('fam', 'mesh-family', s), compatibilityId = await one('cmp', 'anchor-class', s);
    const representationId = await one('rep', 'model-representation', s), bindingId = await one('bnd', 'model-binding', s);
    const slots = await Promise.all(model.materials.map(async m => { const locator = m.sourceLocator as JsonObject;
      return { ...m, logicalMaterialSlotId: await id('slot', ['material-slot', s, locator.kind as string, (locator.kind === 'gltfMaterial' ? locator.materialIndex : 0) as number]) }; }));
    slots.sort((a, b) => codeOrder(a.logicalMaterialSlotId, b.logicalMaterialSlotId));
    const representation = await sealValidationRecord('representation', { id: representationId, assetId,
      representationFrameId: await one('frm', 'representation-frame', s), contentKind: 'mesh', purposes: ['source', 'display'], role: 'meshPrimary',
      variantFamilyId: familyId, formatProfile: model.jpeg ? await jpegGlbProfile() : profile, blob: { ...body.ref }, representationToAsset: { ...identityPlacement(), reflection: 'none' },
      derivedFrom: [], logicalBoundsAsset: model.bounds, materialCatalog: { layoutId: await one('lay', 'material-layout', s), slots } });
    add('representationsById', representation); targetModels.set(representationId, { record: representation, model });
    add('assetRevisionsById', await sealValidationRecord('asset-revision', { id: revisionId, assetId, representationIds: [representationId],
      anchorCompatibilityClasses: [{ id: compatibilityId, targetVariantFamilyIds: [familyId] }],
      provenance: { origin: 'import', sourceMediaType: body.ref.mediaType, inputBlobDigests: [body.ref.digest] } }));
    add('assetBindingsById', await sealValidationRecord('asset-binding-revision', { id: bindingId, assetId, assetRevisionId: revisionId,
      assetToProject: plan.recipe === frozenV1PlacementRecipe ? frozenV1Placement(body.record.fields.transform) : identityPlacement(), method: 'import' }));
    add('assetsById', { id: assetId, label: body.record.fields.originalName as string, assetFrameId, status: { kind: 'ready', activeBindingId: bindingId },
      ...(body.record.fields.pinScale === undefined ? {} : { pinScale: body.record.fields.pinScale as number }), lifecycle: await active('ast', ['asset', s]) });
    models.set(s, { assetId, assetFrameId, revisionId, compatibilityId });
  }
  for (const body of plan.media) add('mediaResourcesById', await sealValidationRecord('media-resource', { id: await media(body.record.id),
    label: body.record.fields.originalName as string, mediaKind: 'image', blob: { ...body.ref } }));
  const tags = [...new Set(plan.captions.flatMap(c => (c.fields.tags ?? []) as string[]))].sort(codeOrder);
  for (const [i, tag] of tags.entries()) add('captionTagsById', { id: await id('tag', ['tag', tag]), label: tag, orderKey: rank(i), lifecycle: await active('tag', ['tag', tag]) });
  for (const c of plan.captions) {
    const f = c.fields, a = f.anchor as Record<string, unknown> | null | undefined, owner = a && models.get(a.modelAssetId as string);
    const anchor: JsonObject = a && Object.hasOwn(a, 'position') ? { kind: 'asset', assetId: owner!.assetId, assetFrameId: owner!.assetFrameId, authoredAssetRevisionId: owner!.revisionId,
      authoredAnchorCompatibilityId: owner!.compatibilityId, positionAsset: a.position as number[], hitEvidence: { method: 'manual' } } :
      { kind: 'unplaced', ...(owner ? { ownerAssetId: owner.assetId } : {}) };
    const captionId = await caption(c.id);
    add('captionsById', { id: captionId, title: f.title as string, body: f.body as string, colorSrgb: sourceColor(f.color), anchor, lifecycle: await active('cap', ['caption', c.id]) });
    for (const [i, image] of ((f.attachments ?? []) as string[]).entries()) {
      const key: Key = ['attachment', c.id, i, image]; add('captionAttachmentsById', { id: await id('att', key), captionId,
        mediaResourceId: await media(image), orderKey: rank(i), lifecycle: await active('att', key) });
    }
    for (const tag of (f.tags ?? []) as string[]) {
      const key: Key = ['caption-tag', c.id, tag]; add('captionTagMembershipsById', { id: await id('tgm', key), captionId, tagId: await id('tag', ['tag', tag]), lifecycle: await active('tgm', key) });
    }
  }
  for (const [i, s] of plan.scenes.entries()) {
    const sceneId = await scene(s.id), views = plan.views.filter(v => v.fields.setId === s.id), latest = [...views].sort((a, b) => codeOrder(b.lastWrite!, a.lastWrite!))[0];
    const entry = s.fields.defaultViewId == null ? latest : views.find(v => v.id === s.fields.defaultViewId);
    if (s.fields.defaultViewId != null && !entry) return fileError('開始する視点の関係を確認できません。');
    add('scenesById', { id: sceneId, name: s.fields.name as string, orderKey: rank(i), lifecycle: await active('scn', ['set', s.id]), ...(entry ? { defaultViewId: await view(entry.id) } : {}) });
    for (const [n, model] of plan.models.entries()) { const key: Key = ['scene-asset', s.id, model.record.id];
      add('sceneAssetMembershipsById', { id: await id('sam', key), sceneId, assetId: await asset(model.record.id), orderKey: rank(n), lifecycle: await active('sam', key) }); }
    for (const [n, c] of plan.captions.filter(c => c.fields.setId === s.id).entries()) { const key: Key = ['scene-caption', s.id, c.id];
      add('sceneCaptionMembershipsById', { id: await id('scm', key), sceneId, captionId: await caption(c.id), orderKey: rank(n), lifecycle: await active('scm', key) }); }
    for (const [n, v] of views.entries()) { const c = v.fields.cameraState as Record<string, unknown>;
      add('viewsById', { id: await view(v.id), sceneId, projectFrameId, name: v.fields.name as string, orderKey: rank(n), lifecycle: await active('view', ['view', v.id]),
        camera: { position: c.eye as number[], target: c.target as number[], up: c.up as number[], projection: { kind: 'perspective', verticalFovRadians: (c.fov as number) * Math.PI / 180 } },
        background: { kind: 'solid', colorSrgb: sourceColor(v.fields.background) } }); }
  }
  const checked = admitProjectRecords(records, limits, 'map2');
  if (checked.kind !== 'valid-records' || checked.hasUnknownFields) return fileError('変換したプロジェクトの内容を確認できません。');
  return { records: cloneCanonicalValue(checked.records, limits) as PreparedValidationProject['records'], mapping: ids.report(), targetModels,
    blobs: [...plan.models, ...plan.media].map(b => ({ ref: { ...b.ref }, bytes: b.bytes })) };
}
