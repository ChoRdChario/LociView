import { inspectProjectCandidates, type CandidateField } from '../domain/projectCandidates';
import { inspectProjectGraph } from '../domain/projectGraph';
import { canonical, immutableDigest, immutableKinds, list, object, same, string } from '../domain/projectGraphSupport';
import { mutableFieldsFor, type MutableRecordMap } from '../domain/projectMutableFields';
import type { ProjectSemanticProfile } from '../domain/projectProfile';
import { admitProjectRecords, projectRecordMaps, type ProjectRecordMap } from '../domain/projectRecords';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { newId } from '../projectMetadata/persistence';
import type { ProjectMetadataSource, MetadataLimits } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, summaryAlgorithm, type AutomaticSummary, type Entry } from './contract';
import { PackageControlError } from './manifest';

const fail = (code: string): never => { throw new PackageControlError(`clean-${code}`); };
const maps = Object.keys(projectRecordMaps) as ProjectRecordMap[];
type BuildingRecord = Record<string, JsonValue>;
const table = (records: JsonObject, map: ProjectRecordMap) => object(records[map]) as Record<string, BuildingRecord>;
const copy = (r: JsonObject, fields: readonly string[]): BuildingRecord => Object.fromEntries(fields.filter(k => r[k] !== undefined).map(k => [k, r[k]!]));
const empty = (schema: JsonObject, identity: JsonObject, project: JsonObject): JsonObject =>
  ({ schema, identity, project, ...Object.fromEntries(maps.map(m => [m, {}])) });

/** Current all-candidate admission, not a materialized winner or a renderer DTO. */
export async function selectCleanRecords(source: ProjectMetadataSource, limits: MetadataLimits): Promise<JsonObject> {
  const profile = source.semanticProfile, mutableRecordFields = mutableFieldsFor(profile);
  const c = await inspectProjectCandidates(source.read(), limits);
  if (c.kind !== 'project-candidate-inspection') return fail('candidates');
  if (!same(c.source.schema, { major: 2, minor: profile === 'map2' ? 1 : 0 }) || c.source.recordMaps.some(m => !maps.includes(m as ProjectRecordMap))) fail('unknown-schema');
  const byPath = new Map(c.fields.map(f => [canonical(f.path), f])), byEntity = new Map<string, CandidateField[]>();
  const resolved = (f: CandidateField | undefined, required = true): JsonValue | undefined => {
    if (!f) { if (required) fail('missing-field'); return; }
    const equalImmutable = f.path.length === 2 && Object.hasOwn(immutableKinds, f.path[0]!) &&
      f.candidates.every(v => same(v.value as unknown as JsonValue, f.candidates[0]?.value as unknown as JsonValue));
    if (!f.valid || !f.candidates.length || f.candidates.length !== 1 && !equalImmutable) return fail('unresolved-field');
    if (f.hasUnknownFields) return fail('unknown-field');
    const v = f.candidates[0]!.value;
    if (v.kind === 'absent') { if (required) fail('missing-field'); return; } return v.value;
  };
  for (const f of c.fields) {
    const [map, id] = f.path;
    if (map === 'identity' || map === 'project' && ['title', 'frame', 'defaultSceneId'].includes(id!)) continue;
    if (!maps.includes(map as ProjectRecordMap)) {
      // Historical removed extensions are not present user data. Current unknown
      // values (including a candidate of absence/value) cannot be classified away.
      if (f.candidates.some(v => v.value.kind !== 'absent')) fail('unknown-root'); continue;
    }
    const key = `${map}/${id}`, fields = byEntity.get(key) ?? []; fields.push(f); byEntity.set(key, fields);
  }
  const records = empty(c.source.schema, object(resolved(byPath.get(canonical(['identity'])))),
    Object.fromEntries(['title', 'frame', 'defaultSceneId'].map(k => [k, resolved(byPath.get(canonical(['project', k])))!])));
  const reached = new Set<string>(['project']), queue = ['project'];
  for (const [key, fields] of byEntity) {
    const [map, id] = key.split('/') as [ProjectRecordMap, string];
    if (Object.hasOwn(immutableKinds, map)) continue;
    const life = object(resolved(fields.find(f => f.path[2] === 'lifecycle')));
    if (c.issues.some(i => i.path[0] === map && i.path[1] === id &&
      (i.path.length < 3 || i.path[2] === 'lifecycle') && i.kind !== 'unverified')) fail('unresolved-lifecycle');
    if (life.state === 'deleted') continue;
    if (life.state !== 'active') fail('unresolved-lifecycle');
    const record: BuildingRecord = {};
    for (const f of fields) {
      const name = f.path[2]!, rules = mutableRecordFields[map as MutableRecordMap] as Record<string, { optional?: boolean }>;
      if (!Object.hasOwn(rules, name)) {
        if (f.candidates.some(v => v.value.kind !== 'absent')) fail('unknown-field'); continue;
      }
      const v = resolved(f, !rules[name]!.optional); if (v !== undefined) record[name] = v;
    }
    table(records, map)[id] = record; reached.add(id); queue.push(id);
  }
  if (c.knownReferences.length > L.closureEdges || queue.length > L.closureRecords) fail('closure-budget');
  const outgoing = new Map<string, string[]>(); let work = 0;
  const charge = () => { if (++work > L.closureWork) fail('closure-work'); };
  for (const e of c.knownReferences) { charge(); if (e.strength !== 'strong') continue;
    const targets = outgoing.get(e.from) ?? []; targets.push(e.to); outgoing.set(e.from, targets); }
  for (let i = 0; i < queue.length; i++) for (const target of outgoing.get(queue[i]!) ?? []) {
    charge(); if (!reached.has(target)) { reached.add(target); queue.push(target); }
    if (reached.size > L.closureRecords) fail('closure-budget');
  }
  for (const [key, fields] of byEntity) {
    const [map, id] = key.split('/') as [ProjectRecordMap, string];
    if (Object.hasOwn(immutableKinds, map) && reached.has(id)) table(records, map)[id] = object(resolved(fields[0]));
  }
  for (const issue of c.issues) {
    if (!(issue.path[0] === 'project' || issue.path[0] === 'identity' || reached.has(issue.path[1]!))) continue;
    if (issue.kind === 'unverified' || issue.code === 'anchor-class-not-current' ||
      ['partial-material-map', 'ambiguous-material-maps'].includes(issue.code)) continue;
    if (issue.kind === 'invalid' || issue.kind === 'orphan' || issue.kind === 'review') fail('unresolved-closure');
  }
  const admitted = admitProjectRecords(records, limits, profile);
  if (admitted.kind !== 'valid-records' || admitted.hasUnknownFields) return fail('records');
  return admitted.records;
}

export interface CleanReconstruction {
  readonly schema: 'lociview-clean-reconstruction-1';
  readonly identity: JsonObject;
  readonly idMap: readonly { readonly from: string; readonly to: string }[];
  readonly lifecycles: readonly { readonly recordId: string; readonly eventId: string }[];
}

/** One typed map; user strings and digest-shaped content never select field policy. */
class Rekey {
  private readonly inputs = new Set<string>(); private readonly mapping = new Map<string, string>();
  private readonly used = new Set<string>(); private readonly events = new Map<string, string>();
  private readonly touched = new Set<string>(); private readonly lifeTouched = new Set<string>();
  private identity?: JsonObject; collecting = true;
  constructor(private readonly frozen?: CleanReconstruction) {
    if (!frozen) return;
    if (Object.keys(frozen).sort().join(',') !== 'idMap,identity,lifecycles,schema' || frozen.schema !== 'lociview-clean-reconstruction-1' ||
      !Array.isArray(frozen.idMap) || !Array.isArray(frozen.lifecycles) || frozen.idMap.length > L.closureRecords || frozen.lifecycles.length > L.closureRecords) fail('recipe');
    let previous = '';
    for (const row of frozen.idMap) {
      if (Object.keys(row).sort().join(',') !== 'from,to' || typeof row.from !== 'string' || row.from <= previous ||
        !/^[a-z]+_[0-9a-f]{32}$/.test(row.from) || typeof row.to !== 'string' || row.to.split('_')[0] !== row.from.split('_')[0] || !/^[a-z]+_[0-9a-f]{32}$/.test(row.to)) fail('recipe');
      previous = row.from; this.mapping.set(row.from, row.to); this.claim(row.to);
    }
    previous = '';
    for (const row of frozen.lifecycles) {
      if (Object.keys(row).sort().join(',') !== 'eventId,recordId' || typeof row.recordId !== 'string' || row.recordId <= previous ||
        !/^[a-z]+_[0-9a-f]{32}$/.test(row.recordId) || typeof row.eventId !== 'string' || !/^evt_[0-9a-f]{32}$/.test(row.eventId)) fail('recipe');
      previous = row.recordId; this.events.set(row.recordId, row.eventId); this.claim(row.eventId);
    }
  }
  private claim(v: string) { if (this.used.has(v)) fail('recipe-collision'); this.used.add(v); }
  reserve = (v: JsonValue | undefined, prefix: string): string => {
    if (typeof v !== 'string' || !new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(v)) return fail('id');
    this.inputs.add(v); return v;
  };
  id = (v: JsonValue | undefined, prefix: string): string => {
    const from = this.reserve(v, prefix); if (this.collecting) return from;
    this.touched.add(from);
    let result = this.mapping.get(from); if (!result) { if (this.frozen) fail('recipe-missing'); result = this.fresh(prefix); this.mapping.set(from, result); } return result;
  };
  fresh(prefix: string): string {
    for (let i = 0; i < 16; i++) { const value = `${prefix}_${newId()}`;
      if (!this.inputs.has(value) && !this.used.has(value)) { this.used.add(value); return value; } }
    return fail('id-collision');
  }
  lifecycle(r: JsonObject): JsonObject {
    this.reserve(object(r.lifecycle).eventId, 'evt');
    if (this.collecting) return { state: 'active', eventId: object(r.lifecycle).eventId!, reason: 'initial' };
    const key = string(r.id); this.lifeTouched.add(key);
    let eventId = this.events.get(key); if (!eventId) { if (this.frozen) fail('recipe-missing'); eventId = this.fresh('evt'); this.events.set(key, eventId); }
    return { state: 'active', eventId, reason: 'initial' };
  }
  projectIdentity(old: JsonObject): JsonObject {
    this.reserve(old.projectId, 'prj'); this.reserve(old.historyEpoch, 'hep');
    if (this.collecting) return old;
    if (!this.identity) {
      this.identity = this.frozen?.identity ?? { projectId: this.fresh('prj'), historyEpoch: this.fresh('hep'),
        lineageSeed: Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('') };
      if (same(this.identity.lineageSeed, old.lineageSeed)) fail('recipe-collision');
      if (this.frozen) { this.claim(string(this.identity.projectId)); this.claim(string(this.identity.historyEpoch)); }
    }
    return this.identity;
  }
  recipe(): CleanReconstruction {
    if (!this.identity || this.mapping.size !== this.touched.size || this.events.size !== this.lifeTouched.size || [...this.used].some(id => this.inputs.has(id))) return fail('recipe-extra-or-collision');
    return { schema: 'lociview-clean-reconstruction-1', identity: this.identity,
      idMap: [...this.mapping].sort(([a], [b]) => a < b ? -1 : 1).map(([from, to]) => ({ from, to })),
      lifecycles: [...this.events].sort(([a], [b]) => a < b ? -1 : 1).map(([recordId, eventId]) => ({ recordId, eventId })) };
  }
}

/** Explicit §12.1 field transforms after complete current-scope admission. */
export async function rebuildCleanRecords(input: JsonObject, limits: MetadataLimits,
  verifiedHit: (anchor: JsonObject, representation: JsonObject) => boolean = () => false, profile: ProjectSemanticProfile = 'map1'): Promise<JsonObject> {
  return (await prepareCleanRecords(input, limits, verifiedHit, undefined, profile)).records;
}
export async function prepareCleanRecords(input: JsonObject, limits: MetadataLimits,
  verifiedHit: (anchor: JsonObject, representation: JsonObject) => boolean = () => false, frozenRecipe?: CleanReconstruction, profile: ProjectSemanticProfile = 'map1') {
  if (frozenRecipe !== undefined && (!frozenRecipe || typeof frozenRecipe !== 'object')) fail('recipe');
  const admitted = admitProjectRecords(input, limits, profile);
  if (admitted.kind !== 'valid-records' || admitted.hasUnknownFields) return fail('records');
  const recipe = frozenRecipe && cloneCanonicalValue(frozenRecipe, { maxDepth: L.maxDepth, maxNodes: L.maxNodes, maxStringScalars: L.maxStringScalars }) as unknown as CleanReconstruction | undefined;
  const records = admitted.records, keys = new Rekey(recipe), includedBlobs = new Set<string>();
  for (const map of ['representationsById', 'mediaResourcesById'] as const)
    for (const r of Object.values(table(records, map))) includedBlobs.add(string(object(r.blob).digest));
  const transform = () => {
    const id = keys.id, ids = (v: JsonValue | undefined, prefix: string, sorted = true) => {
      const result = list(v).map(v => id(v, prefix)); return sorted ? result.sort() : result;
    };
    const project = object(records.project), frame = object(project.frame), oldIdentity = object(records.identity);
    const identity = keys.projectIdentity(oldIdentity);
    const out = empty({ major: 2, minor: profile === 'map2' ? 1 : 0 }, identity, { title: project.title!, defaultSceneId: id(project.defaultSceneId, 'scn'),
      frame: { ...copy(frame, ['handedness', 'upAxis', 'unit']), id: id(frame.id, 'frm') } });
    const anchor = (a: JsonObject): JsonObject => {
      if (profile === 'map2' && a.kind === 'unplaced') return { kind: 'unplaced', ...(a.ownerAssetId === undefined ? {} : { ownerAssetId: id(a.ownerAssetId, 'ast') }) };
      if (a.kind === 'project') return { ...copy(a, ['kind', 'positionProject', 'normalProject']), projectFrameId: id(a.projectFrameId, 'frm') };
      const result: BuildingRecord = { ...copy(a, ['kind', 'positionAsset', 'normalAsset']), assetId: id(a.assetId, 'ast'), assetFrameId: id(a.assetFrameId, 'frm'),
        authoredAnchorCompatibilityId: id(a.authoredAnchorCompatibilityId, 'cmp') };
      // Reserve even omitted IDs against an accidental fresh-ID collision.
      if (a.authoredAssetRevisionId) keys.reserve(a.authoredAssetRevisionId, 'rev');
      if (!a.hitEvidence) return result;
      const hit = object(a.hitEvidence), source = hit.source && object(hit.source);
      if (source) keys.reserve(source.representationId, 'rep');
      if (hit.method === 'manual') {
        delete result.normalAsset; result.hitEvidence = { method: 'manual' };
        const status = object(table(records, 'assetsById')[string(a.assetId)]?.status), binding = status?.kind === 'ready' && table(records, 'assetBindingsById')[string(status.activeBindingId)];
        const revision = binding && table(records, 'assetRevisionsById')[string(binding.assetRevisionId)];
        if (revision && list(revision.anchorCompatibilityClasses).some(c => object(c).id === a.authoredAnchorCompatibilityId)) result.authoredAssetRevisionId = id(revision.id, 'rev');
      } else {
        result.hitEvidence = copy(hit, ['method', 'confidence']);
        const representation = source && table(records, 'representationsById')[string(source.representationId)];
        if (source && a.authoredAssetRevisionId && table(records, 'assetRevisionsById')[string(a.authoredAssetRevisionId)] && representation && verifiedHit(a, representation)) {
          result.authoredAssetRevisionId = id(a.authoredAssetRevisionId, 'rev');
          (result.hitEvidence as BuildingRecord).source = { ...copy(source, ['surfaceRef']), representationId: id(source.representationId, 'rep') };
        }
      }
      return result;
    };
    for (const map of maps) for (const r of Object.values(table(records, map))) {
      const value: BuildingRecord = { id: id(r.id, projectRecordMaps[map]) };
      if (!Object.hasOwn(immutableKinds, map)) value.lifecycle = keys.lifecycle(r);
      if (map === 'assetsById') {
        const s = object(r.status); Object.assign(value, copy(r, profile === 'map2' ? ['label', 'pinScale'] : ['label']), { assetFrameId: id(r.assetFrameId, 'frm'),
          status: s.kind === 'ready' ? { kind: 'ready', activeBindingId: id(s.activeBindingId, 'bnd') } : copy(s, ['kind', 'reason', 'expectedLabel', 'pendingAssetToProject']) });
      } else if (map === 'assetBindingsById') {
        if (r.parentBindingId) keys.reserve(r.parentBindingId, 'bnd');
        Object.assign(value, copy(r, ['assetToProject', 'method', 'residual']), { assetId: id(r.assetId, 'ast'), assetRevisionId: id(r.assetRevisionId, 'rev') });
      } else if (map === 'assetRevisionsById') {
        if (r.parentRevisionId) keys.reserve(r.parentRevisionId, 'rev');
        for (const v of r.materialCompatibilityMaps ? list(r.materialCompatibilityMaps) : []) {
          const map = object(v);
          for (const side of ['source', 'destination']) { const e = object(map[side]); keys.reserve(e.assetRevisionId, 'rev'); keys.reserve(e.variantFamilyId, 'fam'); keys.reserve(e.layoutId, 'lay'); }
          for (const [from, to] of Object.entries(object(map.slots))) { keys.reserve(from, 'slot'); keys.reserve(to, 'slot'); }
        }
        const p = object(r.provenance);
        Object.assign(value, { assetId: id(r.assetId, 'ast'), representationIds: ids(r.representationIds, 'rep', false),
          anchorCompatibilityClasses: list(r.anchorCompatibilityClasses).map(object).map(c => ({ id: id(c.id, 'cmp'), targetVariantFamilyIds: ids(c.targetVariantFamilyIds, 'fam') })).sort((a, b) => a.id.localeCompare(b.id)),
          provenance: { ...copy(p, ['origin', 'tool', 'sourceMediaType']), inputBlobDigests: list(p.inputBlobDigests).filter(d => includedBlobs.has(string(d))) } });
      } else if (map === 'representationsById') {
        Object.assign(value, copy(r, ['contentKind', 'purposes', 'role', 'formatProfile', 'blob', 'representationToAsset', 'logicalBoundsAsset']),
          { assetId: id(r.assetId, 'ast'), representationFrameId: id(r.representationFrameId, 'frm'), variantFamilyId: id(r.variantFamilyId, 'fam'), derivedFrom: ids(r.derivedFrom, 'rep') });
        if (r.compositeGroupId) value.compositeGroupId = id(r.compositeGroupId, 'grp');
        if (r.targetGsVariantFamilyIds) value.targetGsVariantFamilyIds = ids(r.targetGsVariantFamilyIds, 'fam');
        if (r.proxyForGsVariantFamilyId) value.proxyForGsVariantFamilyId = id(r.proxyForGsVariantFamilyId, 'fam');
        if (r.materialCatalog) { const catalog = object(r.materialCatalog); value.materialCatalog = { layoutId: id(catalog.layoutId, 'lay'),
          slots: list(catalog.slots).map(object).map(s => ({ ...copy(s, ['sourceLocator', 'sourceSemantics', 'displayName']), logicalMaterialSlotId: id(s.logicalMaterialSlotId, 'slot') })).sort((a, b) => a.logicalMaterialSlotId.localeCompare(b.logicalMaterialSlotId)) }; }
      } else if (map === 'mediaResourcesById') Object.assign(value, copy(r, ['blob', 'mediaKind', 'label']));
      else if (map === 'captionsById') Object.assign(value, copy(r, ['title', 'body', 'colorSrgb']), { anchor: anchor(object(r.anchor)) });
      else if (map === 'captionAttachmentsById') Object.assign(value, copy(r, ['altText', 'orderKey']), { captionId: id(r.captionId, 'cap'), mediaResourceId: id(r.mediaResourceId, 'med') });
      else if (map === 'captionTagsById') Object.assign(value, copy(r, ['label', 'colorSrgb', 'orderKey']));
      else if (map === 'captionTagMembershipsById') Object.assign(value, { captionId: id(r.captionId, 'cap'), tagId: id(r.tagId, 'tag') });
      else if (map === 'scenesById') { Object.assign(value, copy(r, ['name', 'orderKey'])); if (r.defaultViewId) value.defaultViewId = id(r.defaultViewId, 'view'); }
      else if (map === 'sceneAssetMembershipsById') Object.assign(value, copy(r, ['orderKey']), { sceneId: id(r.sceneId, 'scn'), assetId: id(r.assetId, 'ast') });
      else if (map === 'sceneCaptionMembershipsById') Object.assign(value, copy(r, ['orderKey']), { sceneId: id(r.sceneId, 'scn'), captionId: id(r.captionId, 'cap') });
      else if (map === 'viewsById') Object.assign(value, copy(r, ['name', 'orderKey', 'camera', 'background']), { sceneId: id(r.sceneId, 'scn'), projectFrameId: id(r.projectFrameId, 'frm') });
      else if (map === 'materialOverridesById') { const routing = object(r.routing), scope = object(routing.scope), target = object(routing.target);
        Object.assign(value, copy(r, ['appearance', 'compositing']), { routing: { scope: scope.kind === 'scene' ? { kind: 'scene', sceneId: id(scope.sceneId, 'scn') } : { kind: 'project' },
          target: { assetId: id(target.assetId, 'ast'), variantFamilyId: id(target.variantFamilyId, 'fam'), materialLayoutId: id(target.materialLayoutId, 'lay'), logicalMaterialSlotId: id(target.logicalMaterialSlotId, 'slot') } } }); }
      table(out, map)[string(value.id)] = value;
    }
    return out;
  };
  transform(); keys.collecting = false; const output = transform();
  for (const [map, kind] of Object.entries(immutableKinds)) for (const record of Object.values(table(output, map as ProjectRecordMap)))
    record.payloadDigest = await immutableDigest(kind, record);
  const graph = await inspectProjectGraph(output, limits, undefined, profile);
  if (graph.kind !== 'record-graph-inspection' || graph.hasUnknownFields || graph.issues.some(i => i.kind !== 'unverified' && i.code !== 'anchor-class-not-current')) fail('rebuilt-graph');
  const reconstruction = keys.recipe();
  if (new TextEncoder().encode(canonical(reconstruction as unknown as JsonValue)).length > L.controlBytes) fail('recipe-budget');
  return { records: output, reconstruction };
}

/** Count only present semantic output fields; no source change or bootstrap-op counts. */
export function summarizeCleanRecords(records: JsonObject, blobs: readonly Entry[], profile: ProjectSemanticProfile = 'map1'): AutomaticSummary {
  const entities = new Map<string, number>([['project', 1]]), fields = new Map<string, number>();
  for (const name of ['schema', 'identity', ...Object.keys(object(records.project))]) fields.set(`project.${name}`, 1);
  for (const map of maps) for (const record of Object.values(table(records, map))) {
    entities.set(map, (entities.get(map) ?? 0) + 1);
    for (const name of Object.hasOwn(immutableKinds, map) ? ['record'] : Object.keys(record)) {
      const key = `${map}.${name}`; fields.set(key, (fields.get(key) ?? 0) + 1);
    }
  }
  const counts = (v: Map<string, number>) => [...v].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, count]) => ({ class: name, count }));
  return { algorithm: summaryAlgorithm(profile), scope: 'snapshot', entityClasses: counts(entities), fieldClasses: counts(fields),
    blobEntryCount: blobs.length, blobBytes: blobs.reduce((n, e) => n + e.byteLength, 0) };
}
