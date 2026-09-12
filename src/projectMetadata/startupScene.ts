import type { ProjectProviderRead } from '../scene/projectProvider';
import { checkProjectHeader } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { candidateReader } from './membership';
import { fail, type MetadataLimits } from './format';

/** Complete startup choices, not a materialized winner or an arbitrary repair target. */
export function defaultSceneCandidates(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, limits: MetadataLimits) {
  const reader = candidateReader(provider, limits), guard = new ProjectRecordFields();
  const field = provider.inspection.candidates.fields.find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'defaultSceneId');
  if (!field?.valid || field.hasUnknownFields || field.candidates.length < 2) return fail('startup-resolution-candidates');
  reader.charge(field.validOperationIds.length); const valid = new Set(field.validOperationIds);
  return field.candidates.map(candidate => {
    reader.charge();
    if (!valid.has(candidate.operationId) || candidate.value.kind !== 'value' || typeof candidate.value.value !== 'string')
      return fail('startup-resolution-candidates');
    const sceneId = candidate.value.value; checkProjectHeader(guard, 'defaultSceneId', sceneId);
    if (guard.unknown) fail('startup-resolution-unknown');
    reader.active('scenesById', sceneId);
    return { operationId: candidate.operationId, sceneId };
  });
}
