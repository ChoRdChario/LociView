import { inspectProjectContent, type ProjectContentInspection } from '../domain/projectContent';
import { immutableKinds, list, object, same, string } from '../domain/projectGraphSupport';
import { mutableRecordFields, type MutableRecordMap } from '../domain/projectMutableFields';
import type { CandidateIssue } from '../domain/projectCandidates';
import type { HistoryReadLimits } from '../domain/atomicHistory';
import type { ProjectContentVerifier } from '../domain/projectContentChecks';
import { DomainValidationError, reject, type JsonObject, type JsonValue } from '../domain/values';
import { value, type Field, type SceneState, type SceneResources, type Scene, type Membership, type Asset,
  type Caption, type View, type Material, type AssetProjection, type Table, type Lifecycle } from './types';

type Content = Extract<ProjectContentInspection, { kind: 'project-content-inspection' }>;
type Reason = Extract<Field<never>, { kind: 'unresolved' }>['reason'];
type KnownFields = Readonly<Record<string, Field<JsonValue | undefined>>>;
export interface ProjectReadDetails {
  /** Full known field projections, including labels/order/optional absence; never a write DTO. */
  readonly mutable: Readonly<Record<MutableRecordMap, Table<KnownFields>>>;
  readonly immutable: Readonly<Record<keyof typeof immutableKinds, Table<Field<JsonObject>>>>;
  readonly attachments: Table<Field<Readonly<{ captionId: string; mediaResourceId: string }>>>;
  readonly tags: Table<Field<JsonObject>>;
  readonly tagMemberships: Table<Field<Readonly<{ captionId: string; tagId: string }>>>;
}
export type ProjectProviderRead = Extract<ProjectContentInspection, { kind: 'rejected' }> |
  Readonly<{ kind: 'blocked-project'; inspection: Content }> |
  Readonly<{ kind: 'scene-provider'; scope: Content['scope']; token: string; state: SceneState; resources: SceneResources;
    details: ProjectReadDetails; inspection: Content; issues: readonly CandidateIssue[];
    /** No adapter provenance, write receipt, adoption or ordinary-app activation follows. */
    pending: readonly ['same-host-source-adapter-and-integration']; }>;
const absent = (reason: Reason = 'invalid'): Field<never> => Object.freeze({ kind: 'unresolved', reason });
const pathKey = (p: readonly string[]) => JSON.stringify(p);
const prefix = (a: readonly string[], b: readonly string[]) => a.length <= b.length && a.every((v, i) => v === b[i]);
const optional = (map: string, name: string) => Object.hasOwn(mutableRecordFields, map) &&
  !!(mutableRecordFields[map as MutableRecordMap] as Record<string, { optional?: true }>)[name]?.optional;
const immutableMap = (map: string) => Object.hasOwn(immutableKinds, map);
const fieldValue = <T>(field: Field<T>): T | undefined => field.kind === 'value' ? field.value : undefined;
const activeLife = (field: Field<JsonValue | undefined>) => { const v = fieldValue(field); return !!v && object(v).state === 'active'; };
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
  return v;
}

/** The sole plain-data entry for this scoped read pair; runs admission and executable content checks itself. */
export async function readProjectScene(input: unknown, limits: HistoryReadLimits, verifier: ProjectContentVerifier): Promise<ProjectProviderRead> {
  const inspection = await inspectProjectContent(input, limits, verifier); if (inspection.kind === 'rejected') return inspection;
  try { return project(inspection, limits); }
  catch (error) { if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue }); throw error; }
}
function project(inspection: Content, limits: HistoryReadLimits): ProjectProviderRead {
  const { candidates } = inspection, fields = new Map(candidates.fields.map(f => [pathKey(f.path), f]));
  const projectionIssues: CandidateIssue[] = [];
  let work = inspection.workUsed;
  const charge = (n = 1) => { work += n; if (work > limits.maxWork) reject('limit', ['projectionWork']); };
  charge(candidates.fields.length + inspection.issues.length + candidates.knownReferences.length);
  const issuesByEntity = new Map<string, CandidateIssue[]>();
  const overCounts = new Set(inspection.issues.filter(i => i.code === 'candidate-child-count-exceeded').map(i => pathKey(i.path.slice(0, 2))));
  for (const i of inspection.issues) {
    const key = pathKey(i.path.slice(0, i.path[0] === 'project' || i.path[0] === 'identity' ? 1 : 2));
    const group = issuesByEntity.get(key) ?? []; group.push(i); issuesByEntity.set(key, group);
  }
  const relatedIssues = (path: readonly string[]) => {
    const items = issuesByEntity.get(pathKey(path.slice(0, path[0] === 'project' || path[0] === 'identity' ? 1 : 2))) ?? [];
    charge(items.length + 1); return items.filter(i => prefix(i.path, path) || prefix(path, i.path));
  };
  const blocking = (i: CandidateIssue): boolean => {
    if (i.code === 'unknown-field-policy' || i.code === 'opaque-data-protection-required') return false;
    if (i.path[0] === 'captionsById' && ['anchor-class-not-current', 'source-index-unverified', 'verified-source-index-range-required'].includes(i.code)) return false;
    if (i.path[0] === 'assetRevisionsById' && ['partial-material-map', 'ambiguous-material-maps'].includes(i.code)) return false;
    return true;
  };
  const reasonFor = (issues: readonly CandidateIssue[]): Reason => issues.some(i => i.kind === 'invalid') ? 'invalid' :
    issues.some(i => i.kind === 'review') ? 'conflict' : 'missing';
  const read = (path: readonly string[]): Field<JsonValue | undefined> => {
    const f = fields.get(pathKey(path)), issues = relatedIssues(path).filter(blocking);
    if (issues.length) return absent(reasonFor(issues));
    if (!f) return optional(path[0]!, path[2]!) ? value(undefined) : absent('missing');
    if (!f.valid) return absent('invalid');
    if (!f.candidates.length) return absent('missing');
    charge(f.candidates.length);
    const equalImmutable = path.length === 2 && immutableMap(path[0]!) && f.candidates.every(c => same(c.value as unknown as JsonValue, f.candidates[0]!.value as unknown as JsonValue));
    if (f.candidates.length !== 1 && !equalImmutable) return absent('conflict');
    const v = f.candidates[0]!.value;
    return v.kind === 'value' ? value(v.value) : optional(path[0]!, path[2]!) ? value(undefined) : absent('missing');
  };
  const frame = read(['project', 'frame']), identity = read(['identity']);
  if (frame.kind !== 'value' || identity.kind !== 'value') return freeze({ kind: 'blocked-project', inspection });
  const projectFrameId = string(object(frame.value).id);
  const mutable = Object.fromEntries(Object.keys(mutableRecordFields).map(map => [map, Object.create(null)])) as Record<MutableRecordMap, Record<string, KnownFields>>;
  const immutable = Object.fromEntries(Object.keys(immutableKinds).map(map => [map, Object.create(null)])) as Record<keyof typeof immutableKinds, Record<string, Field<JsonObject>>>;
  for (const f of candidates.fields) {
    const [map, id] = f.path; if (!id) continue;
    if (Object.hasOwn(mutable, map!)) {
      const m = map as MutableRecordMap;
      if (!mutable[m][id]) mutable[m][id] = Object.fromEntries(Object.keys(mutableRecordFields[m]).map(name => [name, read([m, id, name])]));
    } else if (immutableMap(map!)) immutable[map as keyof typeof immutableKinds][id] = read([map!, id]) as Field<JsonObject>;
  }
  const field = <T>(map: MutableRecordMap, id: string, key: string): Field<T> => (mutable[map][id]?.[key] ?? absent('missing')) as Field<T>;
  const lifecycle = (map: MutableRecordMap, id: string): Field<Lifecycle> => {
    const identity = field<string>(map, id, 'id');
    return identity.kind !== 'value' || identity.value !== id ? absent('invalid') : field(map, id, 'lifecycle');
  };
  // Propagate only through strong immutable dependencies, never the reverse from
  // annotations/materials or through a weak old binding/source blob reference.
  const immutableById = new Map<string, { map: keyof typeof immutableKinds; field: Field<JsonObject> }>();
  for (const [map, table] of Object.entries(immutable)) for (const [id, item] of Object.entries(table)) immutableById.set(id, { map: map as keyof typeof immutableKinds, field: item });
  const reverse = new Map<string, string[]>();
  for (const e of candidates.knownReferences) if (e.strength === 'strong' && immutableById.has(e.from) && immutableById.has(e.to)) {
    const parents = reverse.get(e.to) ?? []; parents.push(e.from); reverse.set(e.to, parents);
  }
  const unavailable = new Map<string, Reason>();
  for (const [id, record] of immutableById) if (record.field.kind === 'unresolved') unavailable.set(id, record.field.reason);
  const queue = [...unavailable.keys()];
  for (let i = 0; i < queue.length; i++) for (const parent of reverse.get(queue[i]!) ?? []) if (!unavailable.has(parent)) {
    charge();
    unavailable.set(parent, unavailable.get(queue[i]!)!); queue.push(parent);
  }
  for (const [id, reason] of unavailable) { const map = immutableById.get(id)!.map; immutable[map][id] = absent(reason); }
  const immutableValue = (map: keyof typeof immutableKinds, id: string) => fieldValue(immutable[map][id] ?? absent('missing'));
  const scenes: Record<string, Scene> = {}, assetMemberships: Record<string, Membership> = {}, captionMemberships: Record<string, Membership> = {};
  for (const id of Object.keys(mutable.scenesById)) {
    const defaultView = field<string | undefined>('scenesById', id, 'defaultViewId');
    scenes[id] = { id, lifecycle: lifecycle('scenesById', id), name: field('scenesById', id, 'name'), orderKey: field('scenesById', id, 'orderKey'),
      defaultViewId: defaultView.kind === 'value' ? value(defaultView.value ?? null) : defaultView };
  }
  for (const [map, key, output] of [['sceneAssetMembershipsById', 'assetId', assetMemberships], ['sceneCaptionMembershipsById', 'captionId', captionMemberships]] as const)
    for (const id of Object.keys(mutable[map])) {
      const sceneId = field<string>(map, id, 'sceneId'), resourceId = field<string>(map, id, key);
      // There is no invented string endpoint. All source candidates and their
      // peer reservations remain in inspection/details, including omitted edges.
      if (sceneId.kind !== 'value' || resourceId.kind !== 'value') continue;
      output[id] = { id, sceneId: sceneId.value, resourceId: resourceId.value, orderKey: field(map, id, 'orderKey'), lifecycle: lifecycle(map, id) };
    }
  const assets: Record<string, Asset> = {}, captions: Record<string, Caption> = {}, views: Record<string, View> = {}, materials: Record<string, Material> = {};
  for (const id of Object.keys(mutable.assetsById)) {
    const status = field<JsonObject>('assetsById', id, 'status'), assetFrame = field<string>('assetsById', id, 'assetFrameId');
    let projection: Field<AssetProjection> = status.kind === 'unresolved' ? status : assetFrame.kind === 'unresolved' ? assetFrame : absent('missing');
    if (status.kind === 'value' && status.value.kind === 'ready' && assetFrame.kind === 'value') {
      const bindingId = string(status.value.activeBindingId), binding = immutableValue('assetBindingsById', bindingId);
      const revision = binding && immutableValue('assetRevisionsById', string(binding.assetRevisionId));
      if (binding && revision && binding.assetId === id && revision.assetId === id) projection = value({ assetFrameId: assetFrame.value, bindingId,
        revisionId: string(revision.id), representationIds: list(revision.representationIds).map(string), anchorCompatibilityIds: list(revision.anchorCompatibilityClasses).map(c => string(object(c).id)) });
      else projection = absent(unavailable.get(bindingId) ?? 'missing');
    }
    assets[id] = { id, lifecycle: lifecycle('assetsById', id), projection };
  }
  for (const id of Object.keys(mutable.captionsById)) captions[id] = { id, lifecycle: lifecycle('captionsById', id),
    title: field('captionsById', id, 'title'), body: field('captionsById', id, 'body'), anchor: field('captionsById', id, 'anchor') };
  for (const id of Object.keys(mutable.viewsById)) {
    const scene = field<string>('viewsById', id, 'sceneId'), frame = field<string>('viewsById', id, 'projectFrameId');
    if (scene.kind !== 'value' || frame.kind !== 'value') continue;
    views[id] = { id, sceneId: scene.value, projectFrameId: frame.value, lifecycle: lifecycle('viewsById', id), camera: field('viewsById', id, 'camera'), background: field('viewsById', id, 'background') };
  }
  for (const id of Object.keys(mutable.materialOverridesById)) {
    const map = 'materialOverridesById', routing = field<JsonObject>(map, id, 'routing'), appearance = field<JsonObject>(map, id, 'appearance');
    let compositing = field<JsonObject>(map, id, 'compositing');
    const optics = new Set<JsonValue>();
    if (routing.kind === 'value') {
      const target = object(routing.value.target), asset = assets[string(target.assetId)]?.projection;
      if (asset?.kind === 'value') for (const repId of asset.value.representationIds) {
        charge(); const rep = immutableValue('representationsById', repId);
        if (!rep || rep.variantFamilyId !== target.variantFamilyId || !rep.materialCatalog) continue;
        const catalog = object(rep.materialCatalog); if (catalog.layoutId !== target.materialLayoutId) continue;
        for (const slot of list(catalog.slots).map(object)) {
          charge(); if (slot.logicalMaterialSlotId === target.logicalMaterialSlotId) optics.add(object(slot.sourceSemantics).optics!);
        }
      }
      // Inspect all current checked compositing candidates, not just one resolved
      // value. A surface source cannot supply invented transmission parameters.
      if (optics.size === 1 && optics.has('surface')) {
        const f = fields.get(pathKey([map, id, 'compositing'])), valid = new Set(f?.validOperationIds);
        for (const c of f?.candidates ?? []) if (valid.has(c.operationId) && c.value.kind === 'value' && object(c.value.value).optics === 'transmission') {
          charge(); projectionIssues.push({ path: [map, id, 'compositing'], kind: 'invalid', code: 'transmission-source-parameters-required', operationId: c.operationId });
          compositing = absent('invalid');
        }
        mutable[map][id] = { ...mutable[map][id], compositing };
      }
    }
    materials[id] = { id, lifecycle: lifecycle(map, id), routing: routing as Material['routing'],
      intent: optics.size !== 1 ? absent('missing') : appearance.kind === 'value' && compositing.kind === 'value' ? value({ appearance: appearance.value, compositing: compositing.value }) :
        appearance.kind === 'unresolved' ? appearance : compositing };
  }
  const parentActive = (map: MutableRecordMap, id: string) => activeLife(lifecycle(map, id) as Field<JsonValue>);
  const childReady = (map: 'captionAttachmentsById' | 'captionTagMembershipsById', id: string, second: 'mediaResourceId' | 'tagId') => {
    const captionId = field<string>(map, id, 'captionId'), targetId = field<string>(map, id, second), life = lifecycle(map, id);
    if (life.kind !== 'value') return life; if (life.value.state !== 'active') return absent('missing');
    if (captionId.kind !== 'value') return captionId; if (targetId.kind !== 'value') return targetId;
    const overCount = overCounts.has(pathKey([map, captionId.value]));
    if (overCount) return absent('invalid');
    if (!parentActive('captionsById', captionId.value)) return absent('missing');
    if (map === 'captionAttachmentsById') { const order = field<string>(map, id, 'orderKey'); if (order.kind !== 'value') return order; }
    return value({ captionId: captionId.value, targetId: targetId.value });
  };
  const attachments: Record<string, Field<{ captionId: string; mediaResourceId: string }>> = {}, tags: Record<string, Field<JsonObject>> = {}, tagMemberships: Record<string, Field<{ captionId: string; tagId: string }>> = {};
  for (const id of Object.keys(mutable.captionTagsById)) {
    const label = field<string>('captionTagsById', id, 'label'), order = field<string>('captionTagsById', id, 'orderKey');
    tags[id] = !parentActive('captionTagsById', id) ? absent('missing') : label.kind !== 'value' ? label : order.kind !== 'value' ? order : value({ id, label: label.value, orderKey: order.value });
  }
  for (const id of Object.keys(mutable.captionAttachmentsById)) {
    const child = childReady('captionAttachmentsById', id, 'mediaResourceId');
    attachments[id] = child.kind !== 'value' ? child : !immutableValue('mediaResourcesById', child.value.targetId) ? absent('missing') :
      value({ captionId: child.value.captionId, mediaResourceId: child.value.targetId });
  }
  for (const id of Object.keys(mutable.captionTagMembershipsById)) {
    const child = childReady('captionTagMembershipsById', id, 'tagId');
    tagMemberships[id] = child.kind !== 'value' ? child : tags[child.value.targetId]?.kind !== 'value' ? absent('missing') : value({ captionId: child.value.captionId, tagId: child.value.targetId });
  }
  const token = inspection.token;
  return freeze({ kind: 'scene-provider', token, scope: inspection.scope, inspection, issues: [...inspection.issues, ...projectionIssues],
    state: { token, defaultSceneId: read(['project', 'defaultSceneId']) as Field<string>, scenes, assetMemberships, captionMemberships },
    resources: { token, projectFrameId, assets, captions, views, materials }, details: { mutable, immutable, attachments, tags, tagMemberships },
    pending: ['same-host-source-adapter-and-integration'] as const });
}
