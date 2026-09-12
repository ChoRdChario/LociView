import type { CaptionDeletionCommand, CaptionDeletionImpact } from '../scene/commands';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { candidateReader } from './membership';
import { fail, type MetadataLimits } from './format';
import type { MetadataRecordEdit } from './commands';
import { checkMutableField, mutableRecordFields } from '../domain/projectMutableFields';
import type { JsonObject } from '../domain/values';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
export interface CaptionLifecycleResolution {
  kind: 'resolveCaptionLifecycle'; captionId: string; state: 'active' | 'deleted';
  observedOperationIds: string[]; eventId: string;
}
/** Parent recovery is not deletion/copying: retain every child and unrelated field. */
export function captionLifecycleRecovery(provider: Provider, captionId: string, limits: MetadataLimits) {
  const guard = new ProjectRecordFields(); guard.id(captionId, 'cap', []);
  const r = candidateReader(provider, limits), map = 'captionsById';
  if (r.exact(map, captionId, 'id') !== captionId || provider.issues.some(i => i.path[0] === map && i.path[1] === captionId &&
    (i.kind === 'invalid' || i.kind === 'unverified'))) fail('caption-lifecycle-source');
  const fields = [...(r.records.get(map)?.get(captionId)?.values() ?? [])];
  for (const [name, rule] of Object.entries(mutableRecordFields[map]))
    if (!rule.optional && !fields.some(f => f.path[2] === name)) fail('caption-lifecycle-missing');
  for (const field of fields) {
    r.charge(field.validOperationIds.length); const valid = new Set(field.validOperationIds);
    if (!field.valid || field.hasUnknownFields || !field.candidates.length) fail('caption-lifecycle-candidates');
    for (const c of field.candidates) {
      r.charge(); if (!valid.has(c.operationId)) fail('caption-lifecycle-candidates');
      checkMutableField(guard, map, field.path[2]!, c.value.kind === 'value' ? c.value.value : undefined);
      if (guard.unknown) fail('caption-lifecycle-unknown');
    }
  }
  const lifecycle = fields.find(f => f.path[2] === 'lifecycle')!;
  const states = lifecycle.candidates.map(c => (c.value.kind === 'value' ? c.value.value as JsonObject : {}).state);
  const deleteEdit = provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path.join('/') === `${map}/${captionId}/lifecycle`);
  if (!states.includes('deleted') || !deleteEdit && !states.includes('active')) fail('caption-lifecycle-not-conflicted');
  const children: { kind: 'scene' | 'attachment' | 'tag'; id: string; referenceId?: string;
    state: 'active' | 'deleted' | 'unresolved'; uncertain: boolean }[] = [];
  for (const [childMap, kind, endpoint] of [['sceneCaptionMembershipsById', 'scene', 'sceneId'],
    ['captionAttachmentsById', 'attachment', 'mediaResourceId'], ['captionTagMembershipsById', 'tag', 'tagId']] as const) {
    for (const [id, fields] of r.records.get(childMap) ?? []) {
      r.charge(); const parent = fields.get('captionId'); r.charge(parent?.candidates.length ?? 1);
      const checked = parent?.valid && !parent.hasUnknownFields && parent.candidates.length > 0;
      if (checked && parent.candidates.every(c => c.value.kind === 'value' && c.value.value !== captionId)) continue;
      const uncertain = !checked || parent.candidates.length !== 1;
      const life = fields.get('lifecycle'), ref = fields.get(endpoint);
      const state = life?.valid && !life.hasUnknownFields && life.candidates.length === 1 && life.candidates[0]!.value.kind === 'value' &&
        !r.deleteEdits.has(`${childMap}/${id}`) ? (life.candidates[0]!.value.value as JsonObject).state : undefined;
      const referenceId = ref?.valid && !ref.hasUnknownFields && ref.candidates.length === 1 && ref.candidates[0]!.value.kind === 'value' ? ref.candidates[0]!.value.value : undefined;
      children.push({ kind, id, ...(typeof referenceId === 'string' ? { referenceId } : {}),
        state: state === 'active' || state === 'deleted' ? state : 'unresolved', uncertain });
    }
  }
  return { captionId, fields, lifecycle, children, deleteEdit };
}

export function planCaptionLifecycleResolution(provider: Provider, command: CaptionLifecycleResolution, limits: MetadataLimits): MetadataRecordEdit[] {
  if (Object.keys(command).sort().join(',') !== 'captionId,eventId,kind,observedOperationIds,state' || !['active', 'deleted'].includes(command.state))
    fail('caption-lifecycle-shape');
  const guard = new ProjectRecordFields(); guard.id(command.eventId, 'evt', []);
  const source = captionLifecycleRecovery(provider, command.captionId, limits);
  const expected = new Set(source.lifecycle.candidates.map(c => c.operationId)), observed = command.observedOperationIds;
  if (!Array.isArray(observed) || observed.length !== expected.size || new Set(observed).size !== observed.length || !observed.every(id => expected.has(id)))
    fail('caption-lifecycle-observed');
  let work = 0;
  for (const change of provider.inspection.candidates.source.history.changes) for (const write of change.writes) {
    if (++work > limits.maxWork) fail('caption-lifecycle-limit');
    if (write.path.join('/') === `captionsById/${command.captionId}/lifecycle` && write.value.kind === 'value' &&
      (write.value.value as JsonObject).eventId === command.eventId) fail('caption-lifecycle-event-reused');
  }
  return [{ map: 'captionsById', id: command.captionId, create: false,
    fields: { lifecycle: { state: command.state, reason: command.state === 'active' ? 'restore' : 'conflictResolution', eventId: command.eventId } } }];
}

/** Deletion is not copying: inspect identity/endpoints/lifecycle, preserve other candidates. */
export function captionDeletionImpact(provider: Provider, captionId: string, limits: MetadataLimits): CaptionDeletionImpact {
  const r = candidateReader(provider, limits);
  r.active('captionsById', captionId);
  const children = <K extends 'sceneId' | 'mediaResourceId' | 'tagId'>(
    map: 'sceneCaptionMembershipsById' | 'captionAttachmentsById' | 'captionTagMembershipsById', field: K,
  ): ({ id: string } & Record<K, string>)[] => r.related(map, { captionId }).map(id => {
    const endpoint = r.exact(map, id, field);
    if (typeof endpoint !== 'string') return fail('caption-deletion-endpoint');
    return { id, [field]: endpoint } as { id: string } & Record<K, string>;
  });
  return { captionId, memberships: children('sceneCaptionMembershipsById', 'sceneId'),
    attachments: children('captionAttachmentsById', 'mediaResourceId'), tags: children('captionTagMembershipsById', 'tagId') };
}

export function planCaptionDeletion(provider: Provider, command: CaptionDeletionCommand, limits: MetadataLimits): MetadataRecordEdit[] {
  if (Object.keys(command).sort().join(',') !== 'captionId,eventId,kind,observedAttachmentIds,observedMembershipIds,observedTagMembershipIds')
    fail('caption-deletion-shape');
  const guard = new ProjectRecordFields(); guard.id(command.captionId, 'cap', []); guard.id(command.eventId, 'evt', []);
  const impact = captionDeletionImpact(provider, command.captionId, limits);
  const sets = [
    ['sceneCaptionMembershipsById', command.observedMembershipIds, impact.memberships],
    ['captionAttachmentsById', command.observedAttachmentIds, impact.attachments],
    ['captionTagMembershipsById', command.observedTagMembershipIds, impact.tags],
  ] as const;
  const lifecycle = { state: 'deleted', reason: 'userDelete', eventId: command.eventId };
  const edits: MetadataRecordEdit[] = [{ map: 'captionsById', id: command.captionId, create: false, fields: { lifecycle } }];
  for (const [map, observed, actual] of sets) {
    const ids = new Set(actual.map(e => e.id));
    if (!Array.isArray(observed) || observed.length !== ids.size || new Set(observed).size !== observed.length || !observed.every(id => ids.has(id)))
      fail('caption-deletion-observed');
    for (const id of observed) edits.push({ map, id, create: false, fields: { lifecycle } });
  }
  return edits;
}
