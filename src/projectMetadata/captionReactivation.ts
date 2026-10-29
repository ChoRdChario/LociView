import type { JsonObject, JsonValue } from '../domain/values';
import { object } from '../domain/projectGraphSupport';
import { recordBlobRefs } from '../domain/portableMedia';
import { inspectProjectCandidates } from '../domain/projectCandidates';
import type { ProjectMetadataSource } from './source';
import { fail, type MetadataLimits } from './format';
import { json } from './persistence';

/** Re-derive from the exact owned local batch, never journal hints or UI receipts. */
export async function reactivatedCaptionMedia(base: ProjectMetadataSource, next: ProjectMetadataSource, limits: MetadataLimits): Promise<JsonObject[]> {
  let work = 0;
  const charge = (n = 1) => { if ((work += n) > limits.maxWork) fail('caption-reactivation-limit'); };
  const before = base.read(), after = next.read(), known = new Set(before.history.changes.map(c => c.id));
  charge(before.history.changes.length);
  const restoredCaptions = new Set<string>(), restoredAttachments = new Set<string>();
  for (const change of after.history.changes) {
    charge(); if (known.has(change.id)) continue;
    for (const write of change.writes) {
      charge(); if (write.path.length !== 3 || !['captionsById', 'captionAttachmentsById'].includes(write.path[0]!) || write.path[2] !== 'lifecycle' || write.value.kind !== 'value') continue;
      const lifecycle = object(write.value.value);
      if (lifecycle.state === 'active' && lifecycle.reason === 'restore')
        (write.path[0] === 'captionsById' ? restoredCaptions : restoredAttachments).add(write.path[1]!);
    }
  }
  if (!restoredCaptions.size && !restoredAttachments.size) return [];
  const a = await inspectProjectCandidates(before, limits), b = await inspectProjectCandidates(after, limits);
  if (a.kind !== 'project-candidate-inspection' || b.kind !== 'project-candidate-inspection') return fail('caption-reactivation-source');
  charge(a.workUsed + b.workUsed);
  const indexed = (fields: typeof a.fields) => new Map(fields.map(f => [JSON.stringify(f.path), f]));
  const prior = indexed(a.fields), current = indexed(b.fields);
  const exact = (index: typeof prior, path: string[], mode: 'exact' | 'resolved' | 'prior' | 'immutable' = 'exact'): JsonValue | undefined => {
    charge(); const f = index.get(JSON.stringify(path));
    charge(f?.candidates.length ?? 0);
    if (!f?.valid || f.hasUnknownFields || !f.candidates.length || f.candidates.some(c => !f.validOperationIds.includes(c.operationId))) {
      if (mode === 'prior') return undefined; return fail('caption-reactivation-candidates');
    }
    if (f.candidates.length > 1) {
      if (mode === 'resolved' || mode === 'prior') return undefined;
      if (mode !== 'immutable' || f.candidates.some(c => json(c.value) !== json(f.candidates[0]!.value))) return fail('caption-reactivation-candidates');
    }
    return f.candidates[0]!.value.kind === 'value' ? f.candidates[0]!.value.value : undefined;
  };
  const refs = new Map<string, JsonObject>();
  for (const f of b.fields) {
    charge(); if (f.path[0] !== 'captionAttachmentsById' || f.path[2] !== 'lifecycle') continue;
    const id = f.path[1]!;
    if (!restoredAttachments.has(id)) {
      if (!restoredCaptions.size) continue;
      const owner = current.get(JSON.stringify(['captionAttachmentsById', id, 'captionId']));
      charge(owner?.candidates.length ?? 1);
      if (owner?.valid && !owner.hasUnknownFields && owner.candidates.length && owner.candidates.every(c =>
        owner.validOperationIds.includes(c.operationId) && c.value.kind === 'value' && typeof c.value.value === 'string' && !restoredCaptions.has(c.value.value))) continue;
      // Parent-only recovery keeps known owner conflicts unresolved; no live edge is chosen.
      if (!restoredCaptions.has(exact(current, ['captionAttachmentsById', id, 'captionId'], 'resolved') as string)) continue;
    }
    if (object(exact(current, ['captionAttachmentsById', id, 'lifecycle'], 'resolved')).state !== 'active') continue;
    const captionId = exact(current, ['captionAttachmentsById', id, 'captionId'], 'resolved');
    if (typeof captionId !== 'string' || object(exact(current, ['captionsById', captionId, 'lifecycle'], 'resolved')).state !== 'active') continue;
    // New attachments have their existing introduction/staging fence.
    if (!prior.has(JSON.stringify(['captionAttachmentsById', id, 'id']))) continue;
    const wasLive = object(exact(prior, ['captionAttachmentsById', id, 'lifecycle'], 'prior')).state === 'active' &&
      object(exact(prior, ['captionsById', captionId, 'lifecycle'], 'prior')).state === 'active';
    if (wasLive) continue;
    const mediaId = exact(current, ['captionAttachmentsById', id, 'mediaResourceId'], 'resolved');
    if (typeof mediaId !== 'string') continue;
    const record = object(exact(current, ['mediaResourcesById', mediaId], 'immutable'));
    for (const ref of recordBlobRefs(record)) refs.set(json(ref), ref);
  }
  return [...refs].sort(([a], [b]) => a.localeCompare(b)).map(([, ref]) => ref);
}
