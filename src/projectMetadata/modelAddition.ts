import { checkProjectRecord, projectRecordMaps } from '../domain/projectRecords';
import { checkMutableRecord } from '../domain/projectMutableFields';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { object, list, same } from '../domain/projectGraphSupport';
import type { JsonObject, JsonValue } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { candidateReader } from './membership';
import type { MetadataRecordEdit } from './commands';
import { fail, type MetadataLimits } from './format';

export interface AddAssetCommand { readonly kind: 'addAsset'; readonly sceneId: string;
  readonly asset: JsonObject; readonly revision: JsonObject; readonly representation: JsonObject;
  readonly binding: JsonObject; readonly membership: JsonObject }

/** One independent static Mesh closure. Neither a generic patch nor a replacement operation. */
export function planAssetAddition(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, command: AddAssetCommand,
  limits: MetadataLimits): MetadataRecordEdit[] {
  const shape = (v: object, fields: string[]) => { if (Object.keys(v).sort().join(',') !== fields.sort().join(',')) fail('model-add-shape'); };
  shape(command, ['kind', 'sceneId', 'asset', 'revision', 'representation', 'binding', 'membership']);
  const reader = candidateReader(provider, limits), c = new ProjectRecordFields(); reader.active('scenesById', command.sceneId);
  const { asset, revision, representation: rep, binding, membership } = command;
  const edits: MetadataRecordEdit[] = [];
  for (const [map, fields] of [['assetsById', asset], ['sceneAssetMembershipsById', membership]] as const) {
    checkMutableRecord(c, map, fields); edits.push({ map, id: fields.id as string, fields, create: true });
  }
  for (const [map, fields] of [['representationsById', rep], ['assetRevisionsById', revision], ['assetBindingsById', binding]] as const) {
    checkProjectRecord(c, map, fields); edits.push({ map, id: fields.id as string, fields, create: true });
  }
  if (c.unknown) fail('model-add-unknown');
  shape(asset, ['id', 'label', 'assetFrameId', 'status', 'lifecycle']);
  shape(binding, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method', 'payloadDigest']);
  shape(revision, ['id', 'assetId', 'representationIds', 'anchorCompatibilityClasses', 'provenance', 'payloadDigest']);
  shape(rep, ['id', 'assetId', 'representationFrameId', 'contentKind', 'purposes', 'role', 'variantFamilyId', 'formatProfile',
    'blob', 'representationToAsset', 'logicalBoundsAsset', 'derivedFrom', 'materialCatalog', 'payloadDigest']);
  shape(membership, ['id', 'sceneId', 'assetId', 'orderKey', 'lifecycle']);
  const identity = { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 };
  const catalog = object(rep.materialCatalog), classes = list(revision.anchorCompatibilityClasses), slots = list(catalog.slots);
  if (rep.assetId !== asset.id || revision.assetId !== asset.id || binding.assetId !== asset.id || membership.assetId !== asset.id ||
    membership.sceneId !== command.sceneId || !same(asset.status, { kind: 'ready', activeBindingId: binding.id! }) ||
    binding.assetRevisionId !== revision.id || !same(revision.representationIds, [rep.id!]) || binding.method !== 'import' ||
    !same(binding.assetToProject, identity) || !same(rep.representationToAsset, { ...identity, reflection: 'none' }) ||
    rep.contentKind !== 'mesh' || rep.role !== 'meshPrimary' || !same(rep.purposes, ['source', 'display']) || !same(rep.derivedFrom, []) ||
    classes.length !== 1 || !same(object(classes[0]).targetVariantFamilyIds, [rep.variantFamilyId!]) || !slots.length)
    fail('model-add-closure');
  const blob = object(rep.blob);
  if (!same(revision.provenance, { origin: 'import', sourceMediaType: blob.mediaType!, inputBlobDigests: [blob.digest!] })) fail('model-add-provenance');
  for (const lifecycle of [object(asset.lifecycle), object(membership.lifecycle)])
    if (!same(lifecycle, { state: 'active', reason: 'initial', eventId: lifecycle.eventId! })) fail('model-add-lifecycle');
  // Historical and nested reservations count even when omitted from the current UI.
  const reserved = new Set<string>();
  const reserve = (v: unknown): void => { reader.charge(); if (typeof v === 'string') reserved.add(v);
    else if (Array.isArray(v)) v.forEach(reserve); else if (v && typeof v === 'object') Object.values(v).forEach(reserve); };
  for (const change of provider.inspection.candidates.source.history.changes) for (const write of change.writes) {
    reader.charge(); if (Object.hasOwn(projectRecordMaps, write.path[0]!)) reserve(write.path[1]);
    if (write.value.kind === 'value') reserve(write.value.value);
  }
  const fresh = (id: JsonValue | undefined, prefix: string) => { reader.charge(); c.id(id!, prefix, []);
    if (reserved.has(id as string)) fail('model-add-id'); reserved.add(id as string); };
  for (const [id, prefix] of [[asset.id, 'ast'], [asset.assetFrameId, 'frm'], [binding.id, 'bnd'], [revision.id, 'rev'],
    [rep.id, 'rep'], [rep.representationFrameId, 'frm'], [rep.variantFamilyId, 'fam'], [object(classes[0]).id, 'cmp'],
    [catalog.layoutId, 'lay'], [membership.id, 'sam'], [object(asset.lifecycle).eventId, 'evt'], [object(membership.lifecycle).eventId, 'evt']]) fresh(id, prefix as string);
  for (const slot of slots) fresh(object(slot).logicalMaterialSlotId, 'slot');
  return edits;
}
