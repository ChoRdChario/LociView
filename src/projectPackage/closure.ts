import type { ProjectCandidatesInspection } from '../domain/projectCandidates';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { canonical, type GraphEdge } from '../domain/projectGraphSupport';
import type { JsonObject, JsonValue } from '../domain/values';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import { PACKAGE_LIMITS as L, type Entry } from './contract';
import { PackageControlError } from './manifest';

/** Required physical inventory, NOT a presence, byte-verification or GC receipt. */
export function planWorkspaceClosure(candidates: Extract<ProjectCandidatesInspection, { kind: 'project-candidate-inspection' }>) {
  const fail = (code: string): never => { throw new PackageControlError(code); };
  if (candidates.hasUnknownFields) fail('opaque-inventory-required');
  if (candidates.knownReferences.length > L.closureEdges || candidates.knownActiveRoots.length > L.closureRecords) fail('closure-budget');
  const reached = new Set(candidates.knownActiveRoots), queue = [...reached];
  const outgoing = new Map<string, GraphEdge[]>(); let workUsed = 0;
  const charge = () => { if (++workUsed > L.closureWork) fail('closure-work-budget'); };
  for (const edge of candidates.knownReferences) {
    charge(); if (edge.strength !== 'strong') continue;
    const edges = outgoing.get(edge.from) ?? []; edges.push(edge); outgoing.set(edge.from, edges);
  }
  for (let i = 0; i < queue.length; i++) for (const edge of outgoing.get(queue[i]!) ?? []) {
    charge(); if (!reached.has(edge.to)) { reached.add(edge.to); queue.push(edge.to); }
    if (reached.size > L.closureRecords) fail('closure-budget');
  }
  const semantic = new Map<string, StoredBlobRef>(), physical = new Map<string, Entry>(); let bytes = 0;
  for (const field of candidates.fields) {
    charge();
    if (!['representationsById', 'mediaResourcesById'].includes(field.path[0]!) || !reached.has(field.path[1]!)) continue;
    for (const candidate of field.candidates) {
      charge();
      if (!field.validOperationIds.includes(candidate.operationId) || candidate.value.kind !== 'value') return fail('closure-invalid-candidate');
      const record = candidate.value.value as JsonObject, c = new ProjectRecordFields();
      const blob = record.blob; if (!blob) fail('closure-missing-blob'); c.blob(blob!, []);
      if (c.unknown) fail('opaque-inventory-required');
      const ref = blob as unknown as StoredBlobRef, existing = physical.get(ref.digest);
      if (existing && existing.byteLength !== ref.byteLength) fail('closure-digest-length');
      semantic.set(canonical(blob as JsonValue), ref);
      if (!existing) {
        bytes += ref.byteLength;
        if (ref.byteLength > L.blobBytes || bytes > L.blobBytes || physical.size >= L.blobCount) fail('closure-blob-budget');
        physical.set(ref.digest, Object.freeze({ path: `blobs/sha256/${ref.digest}`, sha256: ref.digest, byteLength: ref.byteLength }));
      }
    }
  }
  for (const id of reached) if (id.startsWith('blob:') && !physical.has(id.slice(5))) fail('closure-unresolved-blob');
  return Object.freeze({ token: candidates.token, semanticRefs: Object.freeze([...semantic.values()]),
    entries: Object.freeze([...physical.values()].sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0)), workUsed });
}
