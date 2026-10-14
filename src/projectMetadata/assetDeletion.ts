import type { AssetDeletionCommand, AssetDeletionImpact } from '../scene/commands';
import type { ProjectProviderRead } from '../scene/projectProvider';
import type { CandidateField } from '../domain/projectCandidates';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { object } from '../domain/projectGraphSupport';
import { candidateReader } from './membership';
import { fail, type MetadataLimits } from './format';
import type { MetadataRecordEdit } from './commands';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
/** Only strong mutable references; immutable model ownership/history is retained, not cascaded. */
export function assetDeletionImpact(provider: Provider, assetId: string, limits: MetadataLimits): AssetDeletionImpact {
  const guard = new ProjectRecordFields(); guard.id(assetId, 'ast', []);
  const r = candidateReader(provider, limits); r.active('assetsById', assetId);
  const dependencies: AssetDeletionImpact['dependencies'][number][] = [];
  const values = (f: CandidateField | undefined) => {
    r.charge((f?.candidates.length ?? 1) + (f?.validOperationIds.length ?? 0));
    if (!f?.valid || f.hasUnknownFields || !f.candidates.length) return null;
    const valid = new Set(f.validOperationIds);
    if (f.candidates.some(c => !valid.has(c.operationId) || c.value.kind !== 'value')) return null;
    return f.candidates.map(c => c.value.kind === 'value' ? c.value.value : null);
  };
  for (const [map, field, kind] of [['sceneAssetMembershipsById', 'assetId', 'scene'],
    ['captionsById', 'anchor', 'caption'], ['materialOverridesById', 'routing', 'material']] as const) {
    for (const [id, fields] of r.records.get(map) ?? []) {
      r.charge(); const candidates = values(fields.get(field));
      const targets = candidates?.map(v => field === 'assetId' ? v : field === 'routing' ? object(object(v).target).assetId :
        object(v).kind === 'project' ? null : object(v).kind === 'asset' ? object(v).assetId : object(v).kind === 'unplaced' ? object(v).ownerAssetId ?? null : undefined);
      const complete = !!targets && targets.every(t => t === null || typeof t === 'string');
      if (complete && !targets.includes(assetId)) continue;
      const identity = values(fields.get('id')), life = values(fields.get('lifecycle'));
      const knownIdentity = identity?.length === 1 && identity[0] === id;
      const knownLife = life?.length === 1 && ['active', 'deleted'].includes(String(object(life[0]).state));
      const deleteEdit = r.deleteEdits.has(`${map}/${id}`);
      // Never drop a deleted row that still holds a concurrent edit/reference.
      if (knownIdentity && knownLife && object(life![0]).state === 'deleted' && !deleteEdit) continue;
      const scenes = kind === 'scene' ? values(fields.get('sceneId')) : null;
      dependencies.push({ kind, id, sceneId: scenes?.length === 1 && typeof scenes[0] === 'string' ? scenes[0] : null,
        uncertain: !complete || candidates?.length !== 1 || !knownIdentity || !knownLife || deleteEdit });
    }
  }
  return { assetId, dependencies };
}

export function planAssetDeletion(provider: Provider, command: AssetDeletionCommand, limits: MetadataLimits): MetadataRecordEdit[] {
  if (Object.keys(command).sort().join(',') !== 'assetId,eventId,kind') fail('asset-deletion-shape');
  const guard = new ProjectRecordFields(); guard.id(command.eventId, 'evt', []);
  if (assetDeletionImpact(provider, command.assetId, limits).dependencies.length) fail('asset-deletion-dependencies');
  return [{ map: 'assetsById', id: command.assetId, create: false,
    fields: { lifecycle: { state: 'deleted', reason: 'userDelete', eventId: command.eventId } } }];
}
