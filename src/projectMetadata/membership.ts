import type { CandidateField } from '../domain/projectCandidates';
import { checkMutableField, checkMutableRecord, mutableFieldsFor, type MutableRecordMap } from '../domain/projectMutableFields';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { projectRecordMaps } from '../domain/projectRecords';
import { object } from '../domain/projectGraphSupport';
import type { JsonObject, JsonValue } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import type { MetadataRecordEdit } from './commands';
import { fail, MetadataSourceError, type MetadataLimits } from './format';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
type IdCopy = { sourceId: string; targetId: string };
export interface CaptionMembershipResolution {
  kind: 'resolveCaptionMembership'; sceneId: string; captionId: string;
  observedMembershipIds: string[]; originalMembershipId: string; choice: 'one' | 'both'; eventId: string;
  copies: { sourceMembershipId: string; captionId: string; membershipId: string; attachments: IdCopy[]; tags: IdCopy[] }[];
}
export interface AssetMembershipResolution {
  kind: 'resolveAssetMembership'; sceneId: string; assetId: string;
  observedMembershipIds: string[]; originalMembershipId: string; choice: 'one' | 'both'; eventId: string;
  copies?: { sourceMembershipId: string; ids: Record<'asset' | 'assetFrame' | 'representationFrame' | 'binding' | 'revision' | 'representation' |
    'family' | 'compatibility' | 'layout' | 'membership', string>; slots: (IdCopy & { materialId: string | null })[];
    binding: JsonObject; revision: JsonObject; representation: JsonObject }[];
}
const edgeMap = 'sceneCaptionMembershipsById';
const shape = (o: object, keys: string[]) => {
  if (Object.keys(o).sort().join(',') !== keys.sort().join(',')) fail('membership-resolution-shape');
};
const sameIds = (a: readonly string[], b: readonly string[]) => {
  const expected = new Set(b); return a.length === b.length && new Set(a).size === a.length && a.every(id => expected.has(id));
};

/** Read complete source candidates, never the diagnostic/projection DTO. */
export function candidateReader(provider: Provider, limits: MetadataLimits) {
  const mutableRecordFields = mutableFieldsFor(provider.semanticProfile);
  const records = new Map<string, Map<string, Map<string, CandidateField>>>();
  let work = 0;
  const charge = (n = 1) => { if ((work += n) > limits.maxWork) fail('membership-resolution-limit'); };
  const deleteEdits = new Set(provider.issues.filter(i => i.code === 'concurrent-delete-edit').map(i => `${i.path[0]}/${i.path[1]}`));
  for (const f of provider.inspection.candidates.fields) {
    charge(); if (f.path.length !== 3 || !Object.hasOwn(mutableRecordFields, f.path[0]!)) continue;
    const [map, id, field] = f.path as [string, string, string];
    if (!records.has(map)) records.set(map, new Map());
    if (!records.get(map)!.has(id)) records.get(map)!.set(id, new Map());
    records.get(map)!.get(id)!.set(field, f);
  }
  const exact = (map: MutableRecordMap, id: string, name: string): JsonValue | undefined => {
    charge(); const f = records.get(map)?.get(id)?.get(name);
    if (!f) {
      const c = new ProjectRecordFields(provider.semanticProfile); checkMutableField(c, map, name, undefined);
      if (c.unknown) fail('membership-resolution-unknown'); return undefined;
    }
    if (!f.valid || f.hasUnknownFields || f.candidates.length !== 1 || !f.validOperationIds.includes(f.candidates[0]!.operationId))
      return fail('membership-resolution-unresolved');
    const v = f.candidates[0]!.value; return v.kind === 'value' ? v.value : undefined;
  };
  const active = (map: MutableRecordMap, id: string) => {
    if (exact(map, id, 'id') !== id || object(exact(map, id, 'lifecycle')).state !== 'active') fail('membership-resolution-inactive');
    if (deleteEdits.has(`${map}/${id}`))
      fail('membership-resolution-delete-edit');
  };
  const complete = (map: MutableRecordMap, id: string): JsonObject => {
    active(map, id); const fields = records.get(map)?.get(id), r: Record<string, JsonValue> = {};
    if (!fields) return fail('membership-resolution-missing');
    for (const name of new Set([...fields.keys(), ...Object.keys(mutableRecordFields[map])])) {
      const v = exact(map, id, name); if (v !== undefined) r[name] = v;
    }
    const c = new ProjectRecordFields(provider.semanticProfile); checkMutableRecord(c, map, r);
    if (c.unknown) fail('membership-resolution-unknown'); return r;
  };
  const couldEqual = (map: MutableRecordMap, id: string, field: string, value: string) => {
    const f = records.get(map)?.get(id)?.get(field); charge(f?.candidates.length ?? 1);
    return !f?.valid || f.hasUnknownFields || !f.candidates.length || f.candidates.some(c =>
      c.value.kind !== 'value' || typeof c.value.value !== 'string' || c.value.value === value);
  };
  const related = (map: MutableRecordMap, parents: Record<string, string>) => {
    const found: string[] = [];
    for (const id of records.get(map)?.keys() ?? []) {
      charge(); if (Object.entries(parents).some(([field, value]) => !couldEqual(map, id, field, value))) continue;
      // Only a resolved tombstone can be excluded from the complete observed set.
      if (deleteEdits.has(`${map}/${id}`)) fail('membership-resolution-delete-edit');
      const life = exact(map, id, 'lifecycle'); if (object(life).state === 'deleted') continue;
      active(map, id);
      for (const [field, value] of Object.entries(parents)) if (exact(map, id, field) !== value) fail('membership-resolution-parent');
      found.push(id);
    }
    return found.sort();
  };
  return { records, exact, active, complete, related, charge, deleteEdits };
}

function membershipGroups(provider: Provider, limits: MetadataLimits, map: 'sceneCaptionMembershipsById' | 'sceneAssetMembershipsById', field: 'captionId' | 'assetId') {
  const r = candidateReader(provider, limits), groups = new Map<string, { sceneId: string; resourceId: string; edgeIds: string[] }>();
  for (const [id] of r.records.get(map) ?? []) {
    try {
      r.active(map, id);
      const sceneId = r.exact(map, id, 'sceneId'), resourceId = r.exact(map, id, field);
      if (typeof sceneId !== 'string' || typeof resourceId !== 'string') continue;
      const key = `${sceneId}/${resourceId}`, g = groups.get(key) ?? { sceneId, resourceId, edgeIds: [] };
      g.edgeIds.push(id); groups.set(key, g);
    } catch (error) {
      if (error instanceof MetadataSourceError && error.code === 'membership-resolution-limit') throw error;
      // Unresolved endpoints are not actionable; the planner will not omit them.
    }
  }
  return [...groups.values()].filter(g => g.edgeIds.length > 1).map(g => ({ ...g, edgeIds: g.edgeIds.sort() }));
}
export function captionMembershipGroups(provider: Provider, limits: MetadataLimits) {
  return membershipGroups(provider, limits, edgeMap, 'captionId').map(({ resourceId, ...g }) => ({ ...g, captionId: resourceId }));
}
export function assetMembershipGroups(provider: Provider, limits: MetadataLimits) {
  return membershipGroups(provider, limits, 'sceneAssetMembershipsById', 'assetId').map(({ resourceId, ...g }) => ({ ...g, assetId: resourceId }));
}

/** Keep-one removes duplicate registrations only, never the resource or its history. */
export function planAssetMembershipResolution(provider: Provider, command: AssetMembershipResolution, limits: MetadataLimits): MetadataRecordEdit[] {
  shape(command, ['kind', 'sceneId', 'assetId', 'observedMembershipIds', 'originalMembershipId', 'choice', 'eventId']);
  const r = candidateReader(provider, limits), guard = new ProjectRecordFields(), map = 'sceneAssetMembershipsById';
  guard.id(command.sceneId, 'scn', []); guard.id(command.assetId, 'ast', []); guard.id(command.eventId, 'evt', []);
  r.active('scenesById', command.sceneId); r.active('assetsById', command.assetId);
  const ids = r.related(map, { sceneId: command.sceneId, assetId: command.assetId });
  if (command.choice !== 'one' || ids.length < 2 || !sameIds(command.observedMembershipIds, ids) || !ids.includes(command.originalMembershipId))
    fail('membership-resolution-candidates');
  for (const id of ids) r.complete(map, id);
  return ids.filter(id => id !== command.originalMembershipId).map(id => ({ map, id, create: false,
    fields: { lifecycle: { state: 'deleted', reason: 'conflictResolution', eventId: command.eventId } } }));
}

export function captionCopySource(provider: Provider, captionId: string, limits: MetadataLimits) {
  const r = candidateReader(provider, limits), caption = r.complete('captionsById', captionId);
  const attachments = r.related('captionAttachmentsById', { captionId }).map(id => {
    const record = r.complete('captionAttachmentsById', id);
    if (provider.details.attachments[id]?.kind !== 'value') fail('membership-resolution-attachment');
    return record;
  }).sort((a, b) => a.orderKey! < b.orderKey! ? -1 : a.orderKey! > b.orderKey! ? 1 : String(a.id).localeCompare(String(b.id)));
  const tags = r.related('captionTagMembershipsById', { captionId }).map(id => {
    const record = r.complete('captionTagMembershipsById', id);
    r.active('captionTagsById', record.tagId as string);
    if (provider.details.tagMemberships[id]?.kind !== 'value') fail('membership-resolution-tag');
    return record;
  });
  return { caption, attachments, tags };
}

/** A single explicit local command. No winner, source matching or generic duplication. */
export function planCaptionMembershipResolution(provider: Provider, command: CaptionMembershipResolution, limits: MetadataLimits): MetadataRecordEdit[] {
  shape(command, ['kind', 'sceneId', 'captionId', 'observedMembershipIds', 'originalMembershipId', 'choice', 'eventId', 'copies']);
  const r = candidateReader(provider, limits), guard = new ProjectRecordFields();
  guard.id(command.sceneId, 'scn', []); guard.id(command.captionId, 'cap', []); guard.id(command.eventId, 'evt', []);
  r.active('scenesById', command.sceneId); r.active('captionsById', command.captionId);
  const ids = r.related(edgeMap, { sceneId: command.sceneId, captionId: command.captionId });
  if (ids.length < 2 || !sameIds(command.observedMembershipIds, ids) || !ids.includes(command.originalMembershipId))
    fail('membership-resolution-candidates');
  const edges = new Map(ids.map(id => [id, r.complete(edgeMap, id)]));
  const others = ids.filter(id => id !== command.originalMembershipId);
  if (!['one', 'both'].includes(command.choice) || !sameIds(command.copies.map(c => c.sourceMembershipId), command.choice === 'both' ? others : []))
    fail('membership-resolution-choice');
  const reserved = new Set(provider.inspection.candidates.fields.filter(f => Object.hasOwn(projectRecordMaps, f.path[0]!)).map(f => f.path[1]!));
  const fresh = (id: string, prefix: string) => {
    guard.id(id, prefix, []); if (reserved.has(id)) fail('membership-resolution-id'); reserved.add(id);
  };
  const edits: MetadataRecordEdit[] = others.map(id => ({ map: edgeMap, id, create: false,
    fields: { lifecycle: { state: 'deleted', reason: 'conflictResolution', eventId: command.eventId } } }));
  const create = (map: MutableRecordMap, fields: JsonObject) => {
    checkMutableRecord(guard, map, fields); if (guard.unknown) fail('membership-resolution-unknown');
    edits.push({ map, id: fields.id as string, fields, create: true });
  };
  if (command.choice === 'one') return edits;
  const source = captionCopySource(provider, command.captionId, limits);
  const lifecycle = { state: 'active', reason: 'initial', eventId: command.eventId };
  for (const copy of command.copies) {
    shape(copy, ['sourceMembershipId', 'captionId', 'membershipId', 'attachments', 'tags']);
    fresh(copy.captionId, 'cap'); fresh(copy.membershipId, 'scm');
    create('captionsById', { ...source.caption, id: copy.captionId, lifecycle });
    create(edgeMap, { ...edges.get(copy.sourceMembershipId)!, id: copy.membershipId, captionId: copy.captionId, lifecycle });
    const children = (map: 'captionAttachmentsById' | 'captionTagMembershipsById', records: JsonObject[], copies: IdCopy[], prefix: string) => {
      r.charge(records.length + copies.length);
      if (!sameIds(copies.map(c => c.sourceId), records.map(r => r.id as string))) fail('membership-resolution-children');
      const byId = new Map(copies.map(c => [c.sourceId, c]));
      const ties = map === 'captionAttachmentsById' && records.some((record, i) => i > 0 && record.orderKey === records[i - 1]!.orderKey &&
        byId.get(record.id as string)!.targetId < byId.get(records[i - 1]!.id as string)!.targetId);
      for (const [index, record] of records.entries()) {
        const child = byId.get(record.id as string)!; shape(child, ['sourceId', 'targetId']); fresh(child.targetId, prefix);
        create(map, { ...record, id: child.targetId, captionId: copy.captionId, lifecycle,
          ...(ties ? { orderKey: (index + 1).toString(36).toUpperCase().padStart(13, '0') } : {}) });
      }
    };
    children('captionAttachmentsById', source.attachments, copy.attachments, 'att');
    children('captionTagMembershipsById', source.tags, copy.tags, 'tgm');
  }
  return edits;
}
