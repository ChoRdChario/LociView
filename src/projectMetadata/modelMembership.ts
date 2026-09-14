import { checkProjectRecord, projectRecordMaps } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkMutableRecord } from '../domain/projectMutableFields';
import { object, list, same, immutableDigest } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { candidateReader, planAssetMembershipResolution, type AssetMembershipResolution } from './membership';
import type { MetadataRecordEdit } from './commands';
import { fail, type MetadataLimits } from './format';
import { metadataImmutableReader } from './records';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
const shape = (o: object, keys: string[]) => { if (Object.keys(o).sort().join(',') !== keys.sort().join(',')) fail('model-copy-shape'); };
const exact = <T>(v: { kind: string; value?: T } | undefined): T => v?.kind === 'value' ? v.value! : fail('model-copy-unresolved');
/** Complete known active records, not a winner or an incomplete display DTO. */
export function assetCopySource(provider: Provider, sceneId: string, assetId: string, limits: MetadataLimits) {
  const r = candidateReader(provider, limits), asset = r.complete('assetsById', assetId);
  r.active('scenesById', sceneId);
  const status = object(asset.status); if (status.kind !== 'ready') return fail('model-copy-status');
  const read = metadataImmutableReader(provider, limits);
  const binding = read('assetBindingsById', status.activeBindingId as string);
  const revision = read('assetRevisionsById', binding.assetRevisionId as string);
  if (list(revision.representationIds).length !== 1) return fail('model-copy-closure');
  const representation = read('representationsById', list(revision.representationIds)[0] as string);
  for (const [map, record] of [['assetBindingsById', binding], ['assetRevisionsById', revision], ['representationsById', representation]] as const) {
    const c = new ProjectRecordFields(); checkProjectRecord(c, map, record);
    if (c.unknown || record.assetId !== assetId || !same(record, exact(provider.details.immutable[map][record.id as string]))) fail('model-copy-closure');
  }
  shape(binding, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method', 'payloadDigest', ...(binding.parentBindingId ? ['parentBindingId'] : [])]);
  shape(revision, ['id', 'assetId', 'representationIds', 'anchorCompatibilityClasses', 'provenance', 'payloadDigest']);
  shape(representation, ['id', 'assetId', 'representationFrameId', 'contentKind', 'purposes', 'role', 'variantFamilyId', 'formatProfile',
    'blob', 'representationToAsset', 'logicalBoundsAsset', 'derivedFrom', 'materialCatalog', 'payloadDigest']);
  const catalog = object(representation.materialCatalog), slots = list(catalog.slots), classes = list(revision.anchorCompatibilityClasses);
  if (representation.contentKind !== 'mesh' || representation.role !== 'meshPrimary' || list(representation.derivedFrom).length ||
    !slots.length || classes.length !== 1 || !same(object(classes[0]).targetVariantFamilyIds, [representation.variantFamilyId!])) fail('model-copy-closure');
  const materials = slots.map(slot => {
    r.charge();
    const target = { assetId, variantFamilyId: representation.variantFamilyId!, materialLayoutId: catalog.layoutId!,
      logicalMaterialSlotId: object(slot).logicalMaterialSlotId! };
    let material: JsonObject | null = null;
    // Consider every route reservation, even overrides omitted by the projection.
    const scopes: JsonObject[] = [{ kind: 'scene', sceneId }, { kind: 'project' }];
    for (const scope of scopes) {
      const matching: string[] = [];
      for (const id of r.records.get('materialOverridesById')?.keys() ?? []) {
        r.charge(); const life = r.exact('materialOverridesById', id, 'lifecycle');
        if (object(life).state === 'deleted' && !r.deleteEdits.has(`materialOverridesById/${id}`)) continue;
        const field = r.records.get('materialOverridesById')!.get(id)!.get('routing');
        if (!field?.valid || field.hasUnknownFields || !field.candidates.length) fail('model-copy-material');
        const valid = new Set(field!.validOperationIds); r.charge(valid.size + field!.candidates.length);
        let matches = false;
        for (const candidate of field!.candidates) {
          if (!valid.has(candidate.operationId) || candidate.value.kind !== 'value') fail('model-copy-material');
          const route = object(candidate.value.kind === 'value' ? candidate.value.value : undefined);
          if (same(route.target, target) && same(route.scope, scope)) matches = true;
        }
        if (matches) matching.push(id);
      }
      if (matching.length > 1) fail('model-copy-material');
      if (matching.length) { material = r.complete('materialOverridesById', matching[0]!); break; }
    }
    return { sourceId: target.logicalMaterialSlotId as string, material };
  });
  return { asset, binding, revision, representation, materials };
}

type Copy = NonNullable<AssetMembershipResolution['copies']>[number];
const prefixes = { asset: 'ast', assetFrame: 'frm', representationFrame: 'frm', binding: 'bnd',
  revision: 'rev', representation: 'rep', family: 'fam', compatibility: 'cmp', layout: 'lay', membership: 'sam' };
function copiedRecords(source: ReturnType<typeof assetCopySource>, ids: Copy['ids'], slots: Copy['slots']) {
  const rep = source.representation, catalog = object(rep.materialCatalog), targets = new Map(slots.map(s => [s.sourceId, s.targetId]));
  const representation = { ...rep, id: ids.representation, assetId: ids.asset, representationFrameId: ids.representationFrame,
    variantFamilyId: ids.family, materialCatalog: { ...catalog, layoutId: ids.layout,
      slots: list(catalog.slots).map(slot => ({ ...object(slot), logicalMaterialSlotId: targets.get(object(slot).logicalMaterialSlotId as string)! }))
        .sort((a, b) => a.logicalMaterialSlotId < b.logicalMaterialSlotId ? -1 : 1) } };
  const revision = { ...source.revision, id: ids.revision, assetId: ids.asset, representationIds: [ids.representation],
    anchorCompatibilityClasses: [{ ...object(list(source.revision.anchorCompatibilityClasses)[0]), id: ids.compatibility, targetVariantFamilyIds: [ids.family] }] };
  const { parentBindingId: _parent, ...rootBinding } = source.binding;
  const binding = { ...rootBinding, id: ids.binding, assetId: ids.asset, assetRevisionId: ids.revision };
  return { representation, revision, binding };
}
/** Construct once from complete source records. The command planner independently verifies every remap. */
export async function prepareAssetMembershipCopy(source: ReturnType<typeof assetCopySource>, sourceMembershipId: string,
  fresh: (prefix: string) => string): Promise<Copy> {
  const ids = Object.fromEntries(Object.entries(prefixes).map(([key, prefix]) => [key, fresh(prefix)])) as Copy['ids'];
  const slots = source.materials.map(s => ({ sourceId: s.sourceId, targetId: fresh('slot'), materialId: s.material ? fresh('ovr') : null }));
  const records = copiedRecords(source, ids, slots);
  const seal = async (kind: string, record: JsonObject) => ({ ...record, payloadDigest: await immutableDigest(kind, record) });
  return { sourceMembershipId, ids, slots, representation: await seal('representation', records.representation),
    revision: await seal('asset-revision', records.revision), binding: await seal('asset-binding-revision', records.binding) };
}

/** Independent current-model roots only; preserve original history and Caption ownership. */
export function planAssetMembershipCopies(provider: Provider, command: AssetMembershipResolution, limits: MetadataLimits): MetadataRecordEdit[] {
  const { copies, ...one } = command;
  const edits = planAssetMembershipResolution(provider, { ...one, choice: 'one' }, limits);
  if (command.choice !== 'both' || !Array.isArray(copies)) fail('model-copy-choice');
  const others = command.observedMembershipIds.filter(id => id !== command.originalMembershipId);
  if (copies!.length !== others.length || new Set(copies!.map(c => c.sourceMembershipId)).size !== others.length ||
    copies!.some(c => !others.includes(c.sourceMembershipId))) fail('model-copy-candidates');
  const source = assetCopySource(provider, command.sceneId, command.assetId, limits), reader = candidateReader(provider, limits);
  const reserved = new Set<string>();
  const reserve = (v: unknown): void => { reader.charge(); if (typeof v === 'string') reserved.add(v);
    else if (Array.isArray(v)) v.forEach(reserve); else if (v && typeof v === 'object') Object.values(v).forEach(reserve); };
  for (const change of provider.inspection.candidates.source.history.changes) for (const w of change.writes) {
    reader.charge(); if (Object.hasOwn(projectRecordMaps, w.path[0]!)) reserve(w.path[1]);
    if (w.value.kind === 'value') reserve(w.value.value);
  }
  const guard = new ProjectRecordFields();
  const fresh = (id: string, prefix: string) => { guard.id(id, prefix, []); if (reserved.has(id)) fail('model-copy-id'); reserved.add(id); };
  const lifecycle = { state: 'active', reason: 'initial', eventId: command.eventId };
  for (const copy of copies!) {
    shape(copy, ['sourceMembershipId', 'ids', 'slots', 'binding', 'revision', 'representation']); shape(copy.ids, Object.keys(prefixes));
    for (const [key, prefix] of Object.entries(prefixes)) fresh(copy.ids[key as keyof typeof prefixes], prefix);
    if (!Array.isArray(copy.slots) || copy.slots.length !== source.materials.length || new Set(copy.slots.map(s => s.sourceId)).size !== source.materials.length)
      fail('model-copy-slots');
    const materials = new Map(source.materials.map(s => [s.sourceId, s.material]));
    for (const slot of copy.slots) {
      reader.charge(); shape(slot, ['sourceId', 'targetId', 'materialId']);
      if (!materials.has(slot.sourceId)) fail('model-copy-slots');
      fresh(slot.targetId, 'slot');
      if (materials.get(slot.sourceId)) { if (!slot.materialId) fail('model-copy-material-id'); fresh(slot.materialId!, 'ovr'); }
      else if (slot.materialId !== null) fail('model-copy-material-id');
    }
    const ids = copy.ids, expected = copiedRecords(source, ids, copy.slots);
    const { representation: expectedRepresentation, revision: expectedRevision, binding: expectedBinding } = expected;
    for (const [map, actual, expected] of [['representationsById', copy.representation, expectedRepresentation],
      ['assetRevisionsById', copy.revision, expectedRevision], ['assetBindingsById', copy.binding, expectedBinding]] as const) {
      checkProjectRecord(guard, map, actual);
      if (guard.unknown || !same({ ...actual, payloadDigest: '' }, { ...expected, payloadDigest: '' })) fail('model-copy-remap');
      edits.push({ map, id: actual.id as string, fields: actual, create: true });
    }
    const create = (map: 'assetsById' | 'sceneAssetMembershipsById' | 'materialOverridesById', fields: JsonObject) => {
      checkMutableRecord(guard, map, fields); if (guard.unknown) fail('model-copy-unknown'); edits.push({ map, id: fields.id as string, fields, create: true });
    };
    create('assetsById', { ...source.asset, id: ids.asset, assetFrameId: ids.assetFrame, status: { kind: 'ready', activeBindingId: ids.binding }, lifecycle });
    create('sceneAssetMembershipsById', { ...reader.complete('sceneAssetMembershipsById', copy.sourceMembershipId), id: ids.membership, assetId: ids.asset, lifecycle });
    for (const slot of copy.slots) {
      const material = materials.get(slot.sourceId);
      if (material) create('materialOverridesById', { ...material, id: slot.materialId!, lifecycle, routing: { scope: { kind: 'scene', sceneId: command.sceneId },
        target: { assetId: ids.asset, variantFamilyId: ids.family, materialLayoutId: ids.layout, logicalMaterialSlotId: slot.targetId } } });
    }
  }
  return edits;
}
