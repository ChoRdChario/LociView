import type { ContentRequest } from '../domain/projectContentChecks';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { VerifiedInventoryPort } from './contentEvidence';
import { checkLimits, type MetadataLimits } from './format';
import type { OriginBlobStore } from './blobStore';

/** Known self-contained Representation/Media body closure only; no decoder/profile authority. */
export function blobInventory(store: OriginBlobStore, inputLimits: MetadataLimits): VerifiedInventoryPort {
  const limits = checkLimits(inputLimits);
  return { async inspect(input: ContentRequest) {
    const request = cloneCanonicalValue(input, limits) as unknown as ContentRequest;
    if (!request.records?.length) return 'unverified';
    let found = false;
    for (const r of request.records) {
      if (request.fact === 'surface-equivalence' && typeof r.id === 'string' && r.id.startsWith('rev_') && !Object.hasOwn(r, 'blob')) continue;
      if (!r.blob || typeof r.blob !== 'object' || Array.isArray(r.blob)) return 'unverified';
      found = true; const state = await store.inspect(r.blob as JsonObject);
      if (state !== 'verified-present') return state;
    }
    return found ? 'verified-present' : 'unverified';
  } };
}
