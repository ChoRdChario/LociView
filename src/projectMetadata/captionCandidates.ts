import type { ProjectProviderRead } from '../scene/projectProvider';
import { checkMutableField, mutableFieldsFor } from '../domain/projectMutableFields';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { candidateReader } from './membership';
import { metadataImmutableReader } from './records';
import { fail, type MetadataLimits } from './format';

export type CaptionChoiceField = 'anchor' | 'colorSrgb';
export type AttachmentChoiceField = 'altText' | 'orderKey';
export interface AttachmentLifecycleResolution {
  kind: 'resolveAttachmentLifecycle'; captionId: string; attachmentId: string;
  state: 'active' | 'deleted'; observedOperationIds: string[]; eventId: string;
}

/** Whole atomic candidates, never a projected winner or a partly reconstructed anchor. */
export function captionFieldCandidates(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  captionId: string, field: CaptionChoiceField, limits: MetadataLimits) {
  const guard = new ProjectRecordFields(provider.semanticProfile); guard.id(captionId, 'cap', []);
  if (!['anchor', 'colorSrgb'].includes(field)) fail('caption-resolution-field');
  const reader = candidateReader(provider, limits); reader.active('captionsById', captionId);
  const source = reader.records.get('captionsById')?.get(captionId)?.get(field);
  if (!source?.valid || source.hasUnknownFields || source.candidates.length < 2) return fail('caption-resolution-candidates');
  reader.charge(source.validOperationIds.length); const valid = new Set(source.validOperationIds);
  return source.candidates.map(candidate => {
    reader.charge(); if (!valid.has(candidate.operationId)) fail('caption-resolution-candidates');
    checkMutableField(guard, 'captionsById', field, candidate.value.kind === 'value' ? candidate.value.value : undefined);
    if (guard.unknown) fail('caption-resolution-unknown');
    return candidate;
  });
}

/** Choose one atomic cell without requiring the other cell to have one winner. */
export function attachmentFieldCandidates(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  captionId: string, attachmentId: string, field: AttachmentChoiceField, limits: MetadataLimits) {
  if (!['altText', 'orderKey'].includes(field)) fail('attachment-resolution-field');
  const { reader, fields } = checkedAttachment(provider, captionId, attachmentId, limits);
  reader.active('captionAttachmentsById', attachmentId);
  const source = fields.get(field);
  if (!source || source.candidates.length < 2) return fail('attachment-resolution-candidates');
  return source.candidates;
}

/** Shared raw checking: lifecycle recovery cannot assume an active attachment. */
function checkedAttachment(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  captionId: string, attachmentId: string, limits: MetadataLimits) {
  const guard = new ProjectRecordFields(provider.semanticProfile), map = 'captionAttachmentsById';
  guard.id(captionId, 'cap', []); guard.id(attachmentId, 'att', []);
  const reader = candidateReader(provider, limits); reader.active('captionsById', captionId);
  if (reader.exact(map, attachmentId, 'id') !== attachmentId) fail('attachment-resolution-id');
  if (reader.exact(map, attachmentId, 'captionId') !== captionId) fail('attachment-resolution-owner');
  const mediaId = reader.exact(map, attachmentId, 'mediaResourceId'); guard.id(mediaId!, 'med', []);
  metadataImmutableReader(provider, limits)('mediaResourcesById', mediaId as string);
  const fields = reader.records.get(map)?.get(attachmentId);
  if (!fields) return fail('attachment-resolution-candidates');
  for (const name of Object.keys(mutableFieldsFor(provider.semanticProfile)[map])) {
    reader.charge(); if (!fields.has(name)) checkMutableField(guard, map, name, undefined);
  }
  for (const [name, field] of fields) {
    reader.charge(field.validOperationIds.length); const valid = new Set(field.validOperationIds);
    if (!field.valid || field.hasUnknownFields || !field.candidates.length) fail('attachment-resolution-candidates');
    for (const candidate of field.candidates) {
      reader.charge(); if (!valid.has(candidate.operationId)) fail('attachment-resolution-candidates');
      checkMutableField(guard, map, name, candidate.value.kind === 'value' ? candidate.value.value : undefined);
      if (guard.unknown) fail('attachment-resolution-unknown');
    }
  }
  return { reader, fields };
}

/** Explicit conflict recovery, not ordinary tombstone restoration or retargeting. */
export function attachmentLifecycleRecovery(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  captionId: string, attachmentId: string, limits: MetadataLimits) {
  const { reader, fields } = checkedAttachment(provider, captionId, attachmentId, limits), map = 'captionAttachmentsById';
  if (provider.issues.some(i => (i.path[0] === map && i.path[1] === attachmentId || i.path[0] === 'captionsById' && i.path[1] === captionId) &&
    (i.kind === 'invalid' || i.kind === 'unverified'))) fail('attachment-lifecycle-source');
  const lifecycle = fields.get('lifecycle')!;
  const current = lifecycle.candidates.map(c => (c.value.kind === 'value' ? c.value.value as { state: 'active' | 'deleted' } : fail('attachment-lifecycle-source')).state);
  const deleteEdit = reader.deleteEdits.has(`${map}/${attachmentId}`);
  if (lifecycle.candidates.length < 2 && !deleteEdit) fail('attachment-lifecycle-not-conflicted');
  const states = [...new Set(current)]; if (deleteEdit && !states.includes('active')) states.push('active');
  return { fields: [...fields.values()], lifecycle, states, deleteEdit };
}

export function planAttachmentLifecycleResolution(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  command: AttachmentLifecycleResolution, limits: MetadataLimits) {
  if (Object.keys(command).sort().join(',') !== 'attachmentId,captionId,eventId,kind,observedOperationIds,state') fail('attachment-lifecycle-shape');
  const guard = new ProjectRecordFields(provider.semanticProfile); guard.id(command.eventId, 'evt', []);
  const source = attachmentLifecycleRecovery(provider, command.captionId, command.attachmentId, limits);
  if (!source.states.includes(command.state)) fail('attachment-lifecycle-state');
  const expected = new Set(source.lifecycle.candidates.map(c => c.operationId)), observed = command.observedOperationIds;
  if (!Array.isArray(observed) || observed.length !== expected.size || new Set(observed).size !== observed.length || !observed.every(id => expected.has(id)))
    fail('attachment-lifecycle-observed');
  let work = 0;
  for (const change of provider.inspection.candidates.source.history.changes) for (const write of change.writes) {
    if (++work > limits.maxWork) fail('attachment-lifecycle-limit');
    if (write.path.join('/') === `captionAttachmentsById/${command.attachmentId}/lifecycle` && write.value.kind === 'value' &&
      (write.value.value as { eventId?: unknown }).eventId === command.eventId) fail('attachment-lifecycle-event-reused');
  }
  return [{ map: 'captionAttachmentsById' as const, id: command.attachmentId, create: false,
    fields: { lifecycle: { state: command.state, reason: command.state === 'active' ? 'restore' : 'conflictResolution', eventId: command.eventId } } }];
}
