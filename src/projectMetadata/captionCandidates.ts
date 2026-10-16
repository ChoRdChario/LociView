import type { ProjectProviderRead } from '../scene/projectProvider';
import { checkMutableField, mutableFieldsFor } from '../domain/projectMutableFields';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { candidateReader } from './membership';
import { metadataImmutableReader } from './records';
import { fail, type MetadataLimits } from './format';

export type CaptionChoiceField = 'anchor' | 'colorSrgb';
export type AttachmentChoiceField = 'altText' | 'orderKey';

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
  const guard = new ProjectRecordFields(provider.semanticProfile), map = 'captionAttachmentsById';
  guard.id(captionId, 'cap', []); guard.id(attachmentId, 'att', []);
  if (!['altText', 'orderKey'].includes(field)) fail('attachment-resolution-field');
  const reader = candidateReader(provider, limits); reader.active('captionsById', captionId); reader.active(map, attachmentId);
  if (reader.exact(map, attachmentId, 'captionId') !== captionId) fail('attachment-resolution-owner');
  const mediaId = reader.exact(map, attachmentId, 'mediaResourceId'); guard.id(mediaId!, 'med', []);
  metadataImmutableReader(provider, limits)('mediaResourcesById', mediaId as string);
  const fields = reader.records.get(map)?.get(attachmentId), source = fields?.get(field);
  if (!source || source.candidates.length < 2) return fail('attachment-resolution-candidates');
  for (const name of Object.keys(mutableFieldsFor(provider.semanticProfile)[map])) {
    reader.charge(); if (!fields!.has(name)) checkMutableField(guard, map, name, undefined);
  }
  for (const [name, field] of fields!) {
    reader.charge(field.validOperationIds.length); const valid = new Set(field.validOperationIds);
    if (!field.valid || field.hasUnknownFields || !field.candidates.length) fail('attachment-resolution-candidates');
    for (const candidate of field.candidates) {
      reader.charge(); if (!valid.has(candidate.operationId)) fail('attachment-resolution-candidates');
      checkMutableField(guard, map, name, candidate.value.kind === 'value' ? candidate.value.value : undefined);
      if (guard.unknown) fail('attachment-resolution-unknown');
    }
  }
  return source.candidates;
}
