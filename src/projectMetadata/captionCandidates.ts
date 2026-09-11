import type { ProjectProviderRead } from '../scene/projectProvider';
import { checkMutableField } from '../domain/projectMutableFields';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { candidateReader } from './membership';
import { fail, type MetadataLimits } from './format';

export type CaptionChoiceField = 'anchor' | 'colorSrgb';

/** Whole atomic candidates, never a projected winner or a partly reconstructed anchor. */
export function captionFieldCandidates(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  captionId: string, field: CaptionChoiceField, limits: MetadataLimits) {
  const guard = new ProjectRecordFields(); guard.id(captionId, 'cap', []);
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
