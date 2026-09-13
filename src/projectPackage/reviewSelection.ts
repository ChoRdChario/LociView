import { inspectProjectCandidates, type CandidateField } from '../domain/projectCandidates';
import { canonical, immutableDigest, immutableKinds, list, object, same, string } from '../domain/projectGraphSupport';
import { mutableRecordFields, type MutableRecordMap } from '../domain/projectMutableFields';
import { projectRecordMaps, type ProjectRecordMap } from '../domain/projectRecords';
import type { JsonObject, JsonValue } from '../domain/values';
import type { MetadataLimits, ProjectMetadataSource } from '../projectMetadata/source';
import { newId } from '../projectMetadata/persistence';
import { prepareCleanRecords, type CleanReconstruction } from './cleanRecords';
import { PACKAGE_LIMITS as L } from './contract';
import { PackageControlError } from './manifest';
import { inspectReviewSnapshot, REVIEW_SCHEMA, reviewMaps } from './reviewSnapshot';

const fail = (code: string): never => { throw new PackageControlError(`review-${code}`); };
const table = (r: JsonObject, map: string) => object(r[map]) as Record<string, JsonObject>;
const copy = (r: JsonObject, fields: readonly string[]): JsonObject => Object.fromEntries(fields.filter(k => r[k] !== undefined).map(k => [k, r[k]!]));
const visualRoles = new Set(['meshPrimary', 'pointPrimary', 'gsPrimary', 'visualPatch']);
export interface ReviewSelectionOptions { readonly sceneId: string; readonly omitConflictedEntryView?: boolean }
const checkSelection = (options: ReviewSelectionOptions) => {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
    Object.keys(options).some(k => k !== 'sceneId' && k !== 'omitConflictedEntryView') ||
    typeof options.sceneId !== 'string' || !/^scn_[0-9a-f]{32}$/.test(options.sceneId) ||
    options.omitConflictedEntryView !== undefined && typeof options.omitConflictedEntryView !== 'boolean') fail('selection');
};

/** Resolve only the explicit Scene closure. An uncertain endpoint never proves exclusion. */
export async function selectReviewRecords(source: ProjectMetadataSource, limits: MetadataLimits, options: ReviewSelectionOptions) {
  checkSelection(options);
  const c = await inspectProjectCandidates(source.read(), limits);
  if (c.kind !== 'project-candidate-inspection' || !same(c.source.schema, { major: 2, minor: 0 }) ||
    c.source.recordMaps.some(m => !Object.hasOwn(projectRecordMaps, m))) return fail('candidates');
  const fields = new Map(c.fields.map(f => [canonical(f.path), f])), entities = new Map<string, CandidateField[]>(), consumed = new Set<string>();
  const uncertainPaths = new Set<string>();
  const invalidHistory = new Set(['immutable-history-mutation', 'immutable-field-conflict', 'edit-after-delete-without-restore']);
  for (const issue of c.issues) if (issue.kind === 'invalid' && invalidHistory.has(issue.code)) uncertainPaths.add(canonical(issue.path));
  const uncertain = (f: CandidateField) => uncertainPaths.has(canonical(f.path));
  let work = 0;
  const charge = (n = 1) => { if ((work += n) > Math.min(limits.maxWork, L.closureWork)) fail('selection-work-budget'); };
  const recordIds = Object.fromEntries(Object.keys(projectRecordMaps).map(m => [m, new Set<string>()])) as Record<ProjectRecordMap, Set<string>>;
  for (const f of c.fields) {
    charge(1 + f.candidates.length);
    const [map, id] = f.path;
    if (map === 'identity' || map === 'project' && ['title', 'frame', 'defaultSceneId'].includes(id!)) continue;
    if (!Object.hasOwn(projectRecordMaps, map!)) { if (f.candidates.some(v => v.value.kind !== 'absent')) fail('unknown-root'); continue; }
    const key = `${map}/${id}`, items = entities.get(key) ?? []; items.push(f); entities.set(key, items); recordIds[map as ProjectRecordMap].add(id!);
  }
  const read = (f: CandidateField | undefined, optional = false): JsonValue | undefined => {
    if (!f) { if (!optional) fail('missing-field'); return; }
    consumed.add(canonical(f.path));
    const equalImmutable = f.path.length === 2 && Object.hasOwn(immutableKinds, f.path[0]!) && f.candidates.every(v => same(v.value as unknown as JsonValue, f.candidates[0]?.value as unknown as JsonValue));
    if (!f.valid || !f.candidates.length || f.candidates.length !== 1 && !equalImmutable) return fail('unresolved-field');
    if (f.hasUnknownFields) fail('unknown-field');
    const v = f.candidates[0]!.value;
    if (v.kind === 'absent') { if (!optional) fail('missing-field'); return; } return v.value;
  };
  const field = (map: string, id: string, name: string) => fields.get(canonical([map, id, name]));
  const active = (map: ProjectRecordMap, id: string) => {
    const life = object(read(field(map, id, 'lifecycle'))); if (!['active', 'deleted'].includes(string(life.state))) fail('lifecycle'); return life.state === 'active';
  };
  const current = (map: ProjectRecordMap, id: string, omit: readonly string[] = []) => {
    const fs = entities.get(`${map}/${id}`); if (!fs) return fail('missing-record');
    if (Object.hasOwn(immutableKinds, map)) return object(read(fs[0]));
    if (!active(map, id)) return fail('inactive-record');
    const rules = mutableRecordFields[map as MutableRecordMap] as Record<string, { optional?: boolean }>, r: Record<string, JsonValue> = {};
    for (const f of fs) {
      const name = f.path[2]!;
      if (!Object.hasOwn(rules, name) || f.hasUnknownFields) { if (f.candidates.some(v => v.value.kind !== 'absent')) fail('unknown-field'); continue; }
      if (omit.includes(name)) continue;
      const value = read(f, !!rules[name]!.optional); if (value !== undefined) r[name] = value;
    }
    for (const [name, rule] of Object.entries(rules)) if (!rule.optional && !omit.includes(name) && r[name] === undefined) fail('missing-field');
    return r;
  };
  const canInclude = (f: CandidateField | undefined, predicate: (v: JsonValue) => boolean) => {
    if (!f || !f.valid || !f.candidates.length || f.hasUnknownFields || uncertain(f) || f.candidates.some(v => v.value.kind === 'absent')) return true;
    return f.candidates.some(v => v.value.kind === 'value' && predicate(v.value.value));
  };
  const records: JsonObject = { schema: c.source.schema, identity: read(fields.get(canonical(['identity'])))!,
    project: { title: read(fields.get(canonical(['project', 'title'])))!, frame: read(fields.get(canonical(['project', 'frame'])))!, defaultSceneId: options.sceneId },
    ...Object.fromEntries(Object.keys(projectRecordMaps).map(m => [m, {}])) };
  const entry = field('scenesById', options.sceneId, 'defaultViewId');
  const entryConflict = !!entry && entry.valid && !entry.hasUnknownFields && entry.candidates.length > 1;
  if (options.omitConflictedEntryView && !entryConflict) fail('entry-confirmation-stale');
  const scene = current('scenesById', options.sceneId, options.omitConflictedEntryView ? ['defaultViewId'] : []);
  table(records, 'scenesById')[options.sceneId] = scene;
  const includeChildren = (map: ProjectRecordMap, parentField: string, parents: Set<string>) => {
    for (const id of recordIds[map]) {
      charge(); const parent = field(map, id, parentField);
      if (!canInclude(parent, v => parents.has(string(v)))) continue;
      if (!active(map, id)) continue;
      const r = current(map, id); if (!parents.has(string(r[parentField]))) fail('scope'); table(records, map)[id] = r;
    }
  };
  includeChildren('sceneAssetMembershipsById', 'sceneId', new Set([options.sceneId]));
  includeChildren('sceneCaptionMembershipsById', 'sceneId', new Set([options.sceneId]));
  const captionIds = new Set(Object.values(table(records, 'sceneCaptionMembershipsById')).map(r => string(r.captionId)));
  for (const id of captionIds) table(records, 'captionsById')[id] = current('captionsById', id);
  includeChildren('captionAttachmentsById', 'captionId', captionIds); includeChildren('captionTagMembershipsById', 'captionId', captionIds);
  includeChildren('viewsById', 'sceneId', new Set([options.sceneId]));
  for (const edge of Object.values(table(records, 'captionAttachmentsById'))) {
    const id = string(edge.mediaResourceId); table(records, 'mediaResourcesById')[id] = current('mediaResourcesById', id);
  }
  for (const edge of Object.values(table(records, 'captionTagMembershipsById'))) {
    const id = string(edge.tagId); table(records, 'captionTagsById')[id] = current('captionTagsById', id);
  }
  const visualAssets = new Set(Object.values(table(records, 'sceneAssetMembershipsById')).map(r => string(r.assetId)));
  const owners = new Set([...visualAssets, ...Object.values(table(records, 'captionsById')).map(r => object(r.anchor)).filter(a => a.kind === 'asset').map(a => string(a.assetId))]);
  const compatible = new Map<string, readonly string[]>(), transformOnlyBindings = new Set<string>(), ownerClasses = new Map<string, Set<string>>();
  for (const r of Object.values(table(records, 'captionsById'))) {
    charge(); const a = object(r.anchor); if (a.kind !== 'asset') continue;
    const ids = ownerClasses.get(string(a.assetId)) ?? new Set<string>(); ids.add(string(a.authoredAnchorCompatibilityId)); ownerClasses.set(string(a.assetId), ids);
  }
  for (const id of owners) {
    charge();
    const a = current('assetsById', id, visualAssets.has(id) ? [] : ['label']), status = object(a.status);
    let transform: JsonValue | undefined, binding: JsonObject | undefined;
    if (status.kind === 'ready') {
      binding = current('assetBindingsById', string(status.activeBindingId));
      if (binding.assetId !== id) fail('foreign-owner'); transform = binding.assetToProject;
    } else if (status.kind === 'unresolved') transform = status.pendingAssetToProject;
    if (!transform) fail('owner-transform');
    if (!visualAssets.has(id)) {
      if (binding) transformOnlyBindings.add(string(binding.id));
      table(records, 'assetsById')[id] = { ...a, label: 'モデル未収録', status: { kind: 'unresolved', reason: 'missingSource', pendingAssetToProject: transform! } }; continue;
    }
    if (!binding) return fail('visual-model-unavailable');
    const revision = current('assetRevisionsById', string(binding.assetRevisionId)); if (revision.assetId !== id) fail('foreign-owner');
    const reps: JsonObject[] = [];
    for (const repId of list(revision.representationIds)) {
      charge();
      const r = current('representationsById', string(repId)); if (r.assetId !== id) fail('foreign-owner');
      const purposes = list(r.purposes).filter(v => v !== 'source'); if (!purposes.length) continue;
      reps.push(r); const trimmed: Record<string, JsonValue> = { ...r, purposes, derivedFrom: [] }; delete trimmed.derivation;
      table(records, 'representationsById')[string(r.id)] = trimmed;
    }
    const families = new Set(reps.filter(r => visualRoles.has(string(r.role))).map(r => string(r.variantFamilyId)));
    const partition = list(revision.anchorCompatibilityClasses).map(object).map(k => { charge(1 + list(k.targetVariantFamilyIds).length);
      return { id: k.id!, targetVariantFamilyIds: list(k.targetVariantFamilyIds).filter(f => families.has(string(f))) }; }).filter(k => k.targetVariantFamilyIds.length);
    const partitionIds = new Set(partition.map(k => string(k.id))), referenced = ownerClasses.get(id) ?? new Set<string>();
    compatible.set(id, list(revision.anchorCompatibilityClasses).map(object).filter(k => referenced.has(string(k.id)) || partitionIds.has(string(k.id))).map(k => string(k.id)).sort());
    table(records, 'assetsById')[id] = a;
    table(records, 'assetBindingsById')[string(binding.id)] = { ...copy(binding, ['id', 'assetId', 'assetRevisionId', 'assetToProject']), method: 'import' };
    table(records, 'assetRevisionsById')[string(revision.id)] = { ...copy(revision, ['id', 'assetId']), representationIds: reps.map(r => r.id!).sort(), anchorCompatibilityClasses: partition,
      provenance: { origin: 'import', inputBlobDigests: [...new Set(reps.map(r => string(object(r.blob).digest)))].sort() } };
  }
  const materialTargets = new Set<string>();
  for (const r of Object.values(table(records, 'representationsById'))) if (r.materialCatalog) {
    const catalog = object(r.materialCatalog);
    for (const slot of list(catalog.slots).map(object)) materialTargets.add(canonical([r.assetId!, r.variantFamilyId!, catalog.layoutId!, slot.logicalMaterialSlotId!]));
  }
  const applies = (value: JsonValue) => {
    const route = object(value), scope = object(route.scope), target = object(route.target);
    return (scope.kind === 'project' || scope.kind === 'scene' && scope.sceneId === options.sceneId) && materialTargets.has(canonical([target.assetId!, target.variantFamilyId!, target.materialLayoutId!, target.logicalMaterialSlotId!]));
  };
  for (const id of recordIds.materialOverridesById) {
    charge(); const route = field('materialOverridesById', id, 'routing'); if (!canInclude(route, applies) || !active('materialOverridesById', id)) continue;
    const r = current('materialOverridesById', id); if (!applies(r.routing!)) fail('material-scope'); table(records, 'materialOverridesById')[id] = r;
  }
  for (const issue of c.issues) {
    const related = consumed.has(canonical(issue.path)) || issue.path.length >= 2 && consumed.has(canonical(issue.path.slice(0, 2))) ||
      issue.path.length >= 3 && consumed.has(canonical(issue.path.slice(0, 3)));
    if (!related || issue.kind === 'unverified' || ['anchor-class-not-current', 'source-index-unverified', 'verified-source-index-range-required', 'partial-material-map', 'ambiguous-material-maps'].includes(issue.code)) continue;
    if (issue.path[0] === 'assetBindingsById' && transformOnlyBindings.has(issue.path[1]!) && issue.path[2] === 'assetRevisionId') continue;
    fail('unresolved-closure');
  }
  for (const r of Object.values(table(records, 'captionsById'))) {
    const a = object(r.anchor); if (a.kind !== 'asset') continue;
    const anchor: Record<string, JsonValue> = { ...copy(a, ['kind', 'assetId', 'assetFrameId', 'positionAsset', 'normalAsset', 'authoredAnchorCompatibilityId']) };
    if (a.hitEvidence) { const hit = object(a.hitEvidence); anchor.hitEvidence = copy(hit, ['method', 'confidence']); if (hit.method === 'manual') delete anchor.normalAsset; }
    table(records, 'captionsById')[string(r.id)] = { ...r, anchor };
  }
  for (const [map, kind] of Object.entries(immutableKinds)) for (const r of Object.values(table(records, map)))
    table(records, map)[string(r.id)] = { ...r, payloadDigest: await immutableDigest(kind, r) };
  if (Object.keys(projectRecordMaps).reduce((n, map) => n + Object.keys(table(records, map)).length, 0) > L.closureRecords) fail('closure-budget');
  return { records, compatible, omittedEntryView: !!options.omitConflictedEntryView };
}

export interface ReviewReconstruction {
  readonly schema: 'lociview-review-reconstruction-1'; readonly snapshotId: string;
  readonly selection: ReviewSelectionOptions; readonly rekey: CleanReconstruction;
}

/** Fresh flattened snapshot, with the typed reconstruction retained only as local retry evidence. */
export async function prepareReviewSnapshot(source: ProjectMetadataSource, limits: MetadataLimits, options: ReviewSelectionOptions, frozen?: ReviewReconstruction) {
  checkSelection(options);
  if (frozen && (Object.keys(frozen).sort().join(',') !== 'rekey,schema,selection,snapshotId' || frozen.schema !== 'lociview-review-reconstruction-1' ||
    !/^snp_[0-9a-f]{32}$/.test(frozen.snapshotId) || !same(frozen.selection as unknown as JsonValue, options as unknown as JsonValue))) fail('recipe');
  const selected = await selectReviewRecords(source, limits, options), rebuilt = await prepareCleanRecords(selected.records, limits, () => false, frozen?.rekey);
  const records = rebuilt.records, mapping = new Map(rebuilt.reconstruction.idMap.map(r => [r.from, r.to])), reverse = new Map(rebuilt.reconstruction.idMap.map(r => [r.to, r.from]));
  const snapshot: JsonObject = { schema: REVIEW_SCHEMA, snapshotId: frozen?.snapshotId ?? `snp_${newId()}`, project: records.project!,
    scene: copy(Object.values(table(records, 'scenesById'))[0]!, ['id', 'name', 'orderKey', 'defaultViewId']), ...Object.fromEntries(reviewMaps.map(m => [m, {}])) };
  for (const map of reviewMaps) for (const r of Object.values(table(records, map))) {
    if (map === 'assetsById') {
      const status = object(r.status);
      if (status.kind === 'unresolved') { table(snapshot, map)[string(r.id)] = { kind: 'nonvisualOwner', ...copy(r, ['id', 'assetFrameId']), assetToProject: status.pendingAssetToProject! }; continue; }
      const binding = table(records, 'assetBindingsById')[string(status.activeBindingId)]!, revision = table(records, 'assetRevisionsById')[string(binding.assetRevisionId)]!;
      const sourceId = reverse.get(string(r.id)) ?? fail('asset-map');
      table(snapshot, map)[string(r.id)] = { kind: 'visual', ...copy(r, ['id', 'label', 'assetFrameId']), assetToProject: binding.assetToProject!,
        representationIds: list(revision.representationIds).map(string).sort(), anchorClassPartition: revision.anchorCompatibilityClasses!,
        compatibleAnchorClassIds: (selected.compatible.get(sourceId) ?? []).map(id => mapping.get(id) ?? fail('class-map')).sort() }; continue;
    }
    const value: Record<string, JsonValue> = { ...r }; delete value.lifecycle;
    if (map === 'representationsById') { delete value.payloadDigest; delete value.derivedFrom; }
    if (map === 'captionsById') { const anchor = { ...object(value.anchor) }; delete anchor.authoredAssetRevisionId; value.anchor = anchor; }
    table(snapshot, map)[string(r.id)] = value;
  }
  const review = await inspectReviewSnapshot(snapshot, limits);
  const reconstruction: ReviewReconstruction = { schema: 'lociview-review-reconstruction-1', snapshotId: string(snapshot.snapshotId), selection: { ...options }, rekey: rebuilt.reconstruction };
  if (new TextEncoder().encode(canonical(reconstruction as unknown as JsonValue)).length > L.controlBytes) fail('recipe-budget');
  return { review, reconstruction, omittedEntryView: selected.omittedEntryView,
    sourceContentIds: new Set(['representationsById', 'mediaResourcesById', 'materialOverridesById'].flatMap(map => Object.keys(table(selected.records, map)))) };
}
