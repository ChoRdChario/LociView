import { checkProjectRecord, projectRecordMaps } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { object, list, same } from '../domain/projectGraphSupport';
import type { JsonObject, JsonValue } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { resolveScene } from '../scene/resolve';
import { candidateReader } from './membership';
import { metadataImmutableReader } from './records';
import type { MetadataRecordEdit } from './commands';
import { fail, type MetadataLimits } from './format';

export interface ReplaceAssetModelCommand { readonly kind: 'replaceAssetModel'; readonly sceneId: string;
  readonly assetId: string; readonly expectedBindingId: string;
  readonly revision: JsonObject; readonly representation: JsonObject; readonly binding: JsonObject }

/** Replace only the active model closure; preserve the logical Asset and all authored records. */
export function planModelReplacement(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, command: ReplaceAssetModelCommand,
  limits: MetadataLimits): MetadataRecordEdit[] {
  const shape = (v: object, fields: string[]) => { if (Object.keys(v).sort().join(',') !== fields.sort().join(',')) fail('model-replace-shape'); };
  shape(command, ['kind', 'sceneId', 'assetId', 'expectedBindingId', 'revision', 'representation', 'binding']);
  const reader = candidateReader(provider, limits), c = new ProjectRecordFields();
  reader.active('scenesById', command.sceneId); reader.complete('assetsById', command.assetId);
  reader.related('sceneAssetMembershipsById', { sceneId: command.sceneId, assetId: command.assetId });
  const scene = resolveScene(provider.state, provider.resources, command.sceneId);
  const projection = scene.kind === 'ready' ? scene.composition.assets.find(a => a.assetId === command.assetId)?.projection : undefined;
  if (!projection || projection.bindingId !== command.expectedBindingId) return fail('model-replace-stale');
  const old = metadataImmutableReader(provider, limits)('assetBindingsById', command.expectedBindingId);
  shape(old, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method', 'payloadDigest', ...(old.parentBindingId ? ['parentBindingId'] : [])]);
  const { revision, representation: rep, binding } = command;
  const edits: MetadataRecordEdit[] = [];
  for (const [map, fields] of [['representationsById', rep], ['assetRevisionsById', revision], ['assetBindingsById', binding]] as const) {
    checkProjectRecord(c, map, fields); edits.push({ map, id: fields.id as string, fields, create: true });
  }
  if (c.unknown) fail('model-replace-unknown');
  shape(binding, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method', 'payloadDigest', 'parentBindingId']);
  shape(revision, ['id', 'assetId', 'representationIds', 'anchorCompatibilityClasses', 'provenance', 'payloadDigest']);
  shape(rep, ['id', 'assetId', 'representationFrameId', 'contentKind', 'purposes', 'role', 'variantFamilyId', 'formatProfile',
    'blob', 'representationToAsset', 'logicalBoundsAsset', 'derivedFrom', 'materialCatalog', 'payloadDigest']);
  const identity = { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 };
  const catalog = object(rep.materialCatalog), classes = list(revision.anchorCompatibilityClasses), slots = list(catalog.slots);
  if (rep.assetId !== command.assetId || revision.assetId !== command.assetId || binding.assetId !== command.assetId ||
    old.assetId !== command.assetId || old.assetRevisionId !== projection.revisionId || binding.parentBindingId !== old.id ||
    !same(binding.assetToProject, old.assetToProject) || binding.method !== 'manual' || binding.assetRevisionId !== revision.id ||
    !same(revision.representationIds, [rep.id!]) || !same(rep.representationToAsset, { ...identity, reflection: 'none' }) ||
    rep.contentKind !== 'mesh' || rep.role !== 'meshPrimary' || !same(rep.purposes, ['source', 'display']) || !same(rep.derivedFrom, []) ||
    classes.length !== 1 || !same(object(classes[0]).targetVariantFamilyIds, [rep.variantFamilyId!]) || !slots.length)
    fail('model-replace-closure');
  const blob = object(rep.blob);
  if (blob.mediaType !== 'model/gltf-binary' ||
    !same(revision.provenance, { origin: 'import', sourceMediaType: blob.mediaType!, inputBlobDigests: [blob.digest!] })) fail('model-replace-provenance');
  const reserved = new Set<string>();
  const reserve = (v: unknown): void => { reader.charge(); if (typeof v === 'string') reserved.add(v);
    else if (Array.isArray(v)) v.forEach(reserve); else if (v && typeof v === 'object') Object.values(v).forEach(reserve); };
  for (const change of provider.inspection.candidates.source.history.changes) for (const write of change.writes) {
    reader.charge(); if (Object.hasOwn(projectRecordMaps, write.path[0]!)) reserve(write.path[1]);
    if (write.value.kind === 'value') reserve(write.value.value);
  }
  const fresh = (id: JsonValue | undefined, prefix: string) => { reader.charge(); c.id(id!, prefix, []);
    if (reserved.has(id as string)) fail('model-replace-id'); reserved.add(id as string); };
  for (const [id, prefix] of [[binding.id, 'bnd'], [revision.id, 'rev'], [rep.id, 'rep'], [rep.representationFrameId, 'frm'],
    [rep.variantFamilyId, 'fam'], [object(classes[0]).id, 'cmp'], [catalog.layoutId, 'lay']]) fresh(id, prefix as string);
  for (const slot of slots) fresh(object(slot).logicalMaterialSlotId, 'slot');
  edits.push({ map: 'assetsById', id: command.assetId, create: false, fields: { status: { kind: 'ready', activeBindingId: binding.id! } } });
  return edits;
}
