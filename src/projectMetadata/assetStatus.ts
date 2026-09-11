import { checkMutableField } from '../domain/projectMutableFields';
import { checkProjectRecord } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { object, list } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import type { Field } from '../scene/types';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { fail, type MetadataLimits } from './format';

/** Complete competing ready-bindings for explicit choice, NOT display authority. */
export function assetStatusCandidates(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  assetId: string, limits: MetadataLimits) {
  let work = provider.inspection.workUsed;
  const charge = () => { if (++work > limits.maxWork) fail('asset-resolution-limit'); };
  const exact = <T>(f: Field<T> | undefined): T => f?.kind === 'value' ? f.value : fail('asset-resolution-unresolved');
  const c = new ProjectRecordFields(); c.id(assetId, 'ast', []);
  const row = provider.details.mutable.assetsById[assetId];
  if (!row || exact(row.id) !== assetId || object(exact(row.lifecycle)).state !== 'active') fail('asset-resolution-inactive');
  for (const issue of provider.issues) {
    charge(); if (issue.path[0] === 'assetsById' && issue.path[1] === assetId && issue.code === 'concurrent-delete-edit')
      fail('asset-resolution-delete-edit');
  }
  for (const name of ['id', 'lifecycle', 'assetFrameId']) checkMutableField(c, 'assetsById', name, exact(row![name]));
  let field: (typeof provider.inspection.candidates.fields)[number] | undefined;
  for (const f of provider.inspection.candidates.fields) {
    charge(); if (f.path.length === 3 && f.path[0] === 'assetsById' && f.path[1] === assetId && f.path[2] === 'status') field = f;
  }
  if (!field?.valid || field.hasUnknownFields || field.candidates.length < 2) return fail('asset-resolution-candidates');
  const valid = new Set<string>(); for (const id of field.validOperationIds) { charge(); valid.add(id); }
  const records = provider.details.immutable;
  return field.candidates.map(candidate => {
    charge(); if (!valid.has(candidate.operationId) || candidate.value.kind !== 'value') return fail('asset-resolution-candidates');
    const status = object(candidate.value.value); checkMutableField(c, 'assetsById', 'status', status);
    // This command closes concurrent known model updates; unresolved-source repair is separate.
    if (status.kind !== 'ready') fail('asset-resolution-not-ready-binding');
    const binding = exact(records.assetBindingsById[status.activeBindingId as string]);
    const revision = exact(records.assetRevisionsById[binding.assetRevisionId as string]);
    checkProjectRecord(c, 'assetBindingsById', binding); checkProjectRecord(c, 'assetRevisionsById', revision);
    if (binding.id !== status.activeBindingId || binding.assetId !== assetId || revision.assetId !== assetId ||
      revision.id !== binding.assetRevisionId) fail('asset-resolution-owner');
    for (const repId of list(revision.representationIds)) {
      charge(); const rep = exact(records.representationsById[repId as string]); checkProjectRecord(c, 'representationsById', rep);
      if (rep.assetId !== assetId || rep.id !== repId) fail('asset-resolution-owner');
    }
    if (c.unknown) fail('asset-resolution-unknown');
    return { operationId: candidate.operationId, status: status as JsonObject, binding, revision };
  });
}
