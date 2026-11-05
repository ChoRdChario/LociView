import { checkContentFacts, type ProjectContentVerifier } from '../domain/projectContentChecks';
import { same } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import type { ValidatedGlb } from './glb';

/** Only the owning conversion's already inspected static GLB and image records. */
export function conversionContentVerifier(
  models: ReadonlyMap<string, { record: JsonObject; model: Pick<ValidatedGlb, 'bounds' | 'materials' | 'surfaceRanges'> }>,
  media: JsonObject,
): ProjectContentVerifier {
  return { scope: 'development-validation', verify: async request => {
    const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-validation', outcome, ...(facts ? { facts } : {}) });
    if (request.records.length !== 1) return response('unsupported');
    const record = request.records[0]!;
    let facts: JsonObject;
    if (request.fact === 'media' && same(media[record.id as string], record)) {
      facts = { mediaKind: 'image', mediaType: (record.blob as JsonObject).mediaType! };
    } else {
      const known = models.get(record.id as string);
      if (!known || !same(known.record, record)) return response('unsupported');
      const model = known.model;
      if (request.fact === 'representation') facts = { contentKind: 'mesh', staticPose: true,
        contentBoundsAsset: model.bounds, materials: [...model.materials], surfaceRanges: [...model.surfaceRanges] };
      else if (request.fact === 'family-envelope') facts = { logicalBoundsAsset: model.bounds,
        authority: { kind: 'source', representationId: record.id!, payloadDigest: record.payloadDigest! } };
      else if (request.fact === 'family-contribution') facts = { verifiedMembers: [{ id: record.id!, payloadDigest: record.payloadDigest! }] };
      else return response('unsupported');
    }
    checkContentFacts(request, facts);
    return response('verified', facts);
  } };
}
