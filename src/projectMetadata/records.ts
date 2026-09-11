import { checkProjectRecord } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { immutableKinds, object, same } from '../domain/projectGraphSupport';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { fail, type MetadataLimits } from './format';

/** Source record for preparing a future edit, NEVER active display/content authority. */
export function metadataImmutableReader(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, limits: MetadataLimits) {
  let work = provider.inspection.workUsed;
  const charge = () => { if (++work > limits.maxWork) fail('revision-source-work'); };
  const fields = new Map<string, (typeof provider.inspection.candidates.fields)[number]>();
  for (const field of provider.inspection.candidates.fields) {
    charge(); if (field.path.length === 2) fields.set(JSON.stringify(field.path), field);
  }
  return (map: keyof typeof immutableKinds, id: string) => {
    charge(); const field = fields.get(JSON.stringify([map, id]));
    if (!field?.valid || field.hasUnknownFields || !field.candidates.length) return fail('revision-source');
    const valid = new Set<string>();
    for (const operation of field.validOperationIds) { charge(); valid.add(operation); }
    const first = field.candidates[0]!.value; if (first.kind !== 'value') return fail('revision-source');
    const record = object(first.value), guard = new ProjectRecordFields(); checkProjectRecord(guard, map, record);
    if (guard.unknown || record.id !== id) fail('revision-source');
    for (const candidate of field.candidates) {
      charge(); if (!valid.has(candidate.operationId) || candidate.value.kind !== 'value' || !same(candidate.value.value, record))
        fail('revision-source');
    }
    return record;
  };
}
