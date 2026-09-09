import { ProjectRecordFields } from './projectRecordFields';
import { list, object, same, canonical } from './projectGraphSupport';
import { reject, type JsonObject, type JsonValue } from './values';

/** Transient verifier facts, not imported metadata or a persisted receipt format. */
export type ContentFact = 'representation' | 'family-envelope' | 'family-contribution' | 'surface-equivalence' | 'media';
export interface ContentRequest {
  readonly token: string;
  readonly fact: ContentFact;
  /** Exact records, including ID, payloadDigest, complete BlobRef and FormatProfile. */
  readonly records: readonly JsonObject[];
  readonly context: JsonObject;
}
export type EvidenceScope = 'development-fixture' | 'ratified-profile';
export interface ProjectContentVerifier {
  readonly scope: EvidenceScope;
  /** Application-owned executable service; never deserialize a verifier from a package. */
  verify(request: ContentRequest): Promise<unknown>;
}
export interface ContentCheck {
  readonly request: ContentRequest;
  readonly path: readonly string[];
  readonly outcome: 'verified' | 'missing' | 'unsupported' | 'failed' | 'stale' | 'malformed';
  readonly facts?: JsonObject;
}

/** Check the port's decoded facts against metadata, independently of its byte/profile implementation. */
export function checkContentFacts(q: ContentRequest, facts: JsonObject): void {
  const c = new ProjectRecordFields(), r = q.records[0]!;
  const exact = (a: JsonValue | undefined, b: JsonValue | undefined) => { if (!same(a, b)) reject('value', ['facts']); };
  if (q.fact === 'representation') {
    c.shape(facts, ['contentKind', 'staticPose', 'contentBoundsAsset', 'materials', 'surfaceRanges'], []);
    exact(facts.contentKind, r.contentKind); exact(facts.staticPose, true);
    c.bounds(c.required(facts, 'contentBoundsAsset', []), ['contentBoundsAsset']);
    const bounds = object(facts.contentBoundsAsset), envelope = object(r.logicalBoundsAsset);
    for (let i = 0; i < 3; i++) if (list(bounds.min)[i]! < list(envelope.min)[i]! || list(bounds.max)[i]! > list(envelope.max)[i]!) reject('value', ['contentBoundsAsset']);
    const materials = c.list(c.required(facts, 'materials', []), 65_536, ['materials']);
    const slots = r.materialCatalog ? list(object(r.materialCatalog).slots) : [];
    const byLocator = new Map<string, JsonValue>();
    for (const m of materials) {
      const item = c.shape(m, ['sourceLocator', 'sourceSemantics'], []);
      const locator = c.sourceLocator(c.required(item, 'sourceLocator', []), []);
      if (byLocator.has(locator)) reject('identity', ['materials']);
      // Exact metadata equality below also validates the closed source-semantics union.
      byLocator.set(locator, c.required(item, 'sourceSemantics', []));
    }
    if (byLocator.size !== slots.length) reject('value', ['materials']);
    for (const slot of slots.map(object)) exact(byLocator.get(c.sourceLocator(slot.sourceLocator!, [])), slot.sourceSemantics);
    const ranges = c.list(c.required(facts, 'surfaceRanges', []), 1_000_000, ['surfaceRanges']), keys = new Set<string>();
    for (const range of ranges) {
      const s = c.shape(range, ['kind', 'nodeIndex', 'primitiveIndex', 'count'], []);
      c.enum(s.kind!, r.contentKind === 'mesh' ? ['meshTriangle'] : r.contentKind === 'pointCloud' ? ['pointSample'] : r.contentKind === 'gaussianSplat' ? ['splatSample'] : [], []);
      c.integer(c.required(s, 'count', []), []);
      if (s.kind === 'splatSample') c.absent(s, ['nodeIndex', 'primitiveIndex'], []);
      else { c.integer(c.required(s, 'nodeIndex', []), []); c.integer(c.required(s, 'primitiveIndex', []), []); }
      const key = canonical([s.kind!, s.nodeIndex ?? null, s.primitiveIndex ?? null]); if (keys.has(key)) reject('identity', ['surfaceRanges']); keys.add(key);
    }
  } else if (q.fact === 'family-envelope') {
    c.shape(facts, ['logicalBoundsAsset', 'authority'], []);
    c.bounds(c.required(facts, 'logicalBoundsAsset', []), []);
    const authority = c.shape(c.required(facts, 'authority', []), ['kind', 'representationId', 'payloadDigest'], []);
    c.enum(authority.kind!, ['source', 'first-verified-output'], []);
    const source = q.records.find(r => r.id === authority.representationId && r.payloadDigest === authority.payloadDigest);
    if (!source || (authority.kind === 'source' && !list(source.purposes).includes('source'))) reject('value', ['authority']);
    for (const record of q.records) exact(facts.logicalBoundsAsset, record.logicalBoundsAsset);
  } else if (q.fact === 'family-contribution') {
    c.shape(facts, ['verifiedMembers'], []);
    exact(c.required(facts, 'verifiedMembers', []), q.records.map(r => ({ id: r.id!, payloadDigest: r.payloadDigest! })));
  } else if (q.fact === 'surface-equivalence') {
    c.shape(facts, ['equivalentVariantFamilyIds'], []);
    exact(c.required(facts, 'equivalentVariantFamilyIds', []), q.context.targetVariantFamilyIds);
  } else {
    c.shape(facts, ['mediaKind', 'mediaType'], []);
    exact(c.required(facts, 'mediaKind', []), r.mediaKind);
    exact(c.required(facts, 'mediaType', []), object(r.blob).mediaType);
  }
  // Future evidence fields need an explicit checker; don't silently treat opaque facts as proof.
  if (c.unknown) reject('key', ['facts']);
}

/** Only called with exact verified Representation facts from this same inspection. */
export function sourceIndexInRange(surface: JsonObject, facts: JsonObject): boolean {
  const range = list(facts.surfaceRanges).map(object).find(r => r.kind === surface.kind &&
    (r.kind === 'splatSample' || (r.nodeIndex === surface.nodeIndex && r.primitiveIndex === surface.primitiveIndex)));
  const key = surface.kind === 'meshTriangle' ? 'triangleIndex' : surface.kind === 'pointSample' ? 'pointIndex' : 'sourceSplatIndex';
  return !!range && typeof surface[key] === 'number' && surface[key] < Number(range.count);
}
