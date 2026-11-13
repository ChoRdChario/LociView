import type { ContentRequest } from '../domain/projectContentChecks';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { VerifiedInventoryPort } from './contentEvidence';
import { checkLimits, type MetadataLimits } from './format';
import type { OriginBlobStore } from './blobStore';
import { recordBlobRefs } from '../domain/portableMedia';
import { assertTextPreparation, json, type MetadataReadPorts } from './persistence';

/** Known self-contained Representation/Media body closure only; no decoder/profile authority. */
export function blobInventory(store: OriginBlobStore, inputLimits: MetadataLimits, preparation?: MetadataReadPorts): VerifiedInventoryPort {
  const limits = checkLimits(inputLimits);
  const present = preparation && new Set<string>();
  return { async inspect(input: ContentRequest) {
    if (preparation) assertTextPreparation(preparation);
    const request = cloneCanonicalValue(input, limits) as unknown as ContentRequest;
    if (!request.records?.length) return 'unverified';
    let found = false;
    for (const r of request.records) {
      if (request.fact === 'surface-equivalence' && typeof r.id === 'string' && r.id.startsWith('rev_') && !Object.hasOwn(r, 'blob')) continue;
      if (!r.blob || typeof r.blob !== 'object' || Array.isArray(r.blob)) return 'unverified';
      found = true;
      for (const ref of recordBlobRefs(r)) {
        const key = present ? json(ref) : '';
        if (present?.has(key)) continue;
        const state = await store.inspect(ref, preparation);
        if (preparation) assertTextPreparation(preparation);
        if (state !== 'verified-present') return state;
        present?.add(key);
      }
    }
    return found ? 'verified-present' : 'unverified';
  } };
}
