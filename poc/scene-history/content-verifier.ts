import type { ContentRequest, ProjectContentVerifier } from '../../src/domain/projectContentChecks';
import { canonical, list, object, same, string } from '../../src/domain/projectGraphSupport';
import type { JsonObject } from '../../src/domain/values';
import { createFixtureModel, fixtureModelBytes, fixtureSha256 } from '../../src/harness/projectScene/modelClosure';
import { fixtureMedia } from '../../src/harness/projectScene/mediaHistory';
import { inspectNativeImageSource } from '../../src/nativeGs/imageMediaAdmission';

/** Exact development bytes only. This is not BlobStore, a general decoder or profile adoption. */
export const developmentContentBytes = async (record: JsonObject): Promise<Uint8Array | undefined> => {
  const digest = object(record.blob).digest;
  for (const shape of ['original', 'updated'] as const) { const bytes = fixtureModelBytes(shape); if (fixtureSha256(bytes) === digest) return bytes; }
  for (const m of fixtureMedia) if (m.record.blob.digest === digest) return Uint8Array.from(atob(m.base64), c => c.charCodeAt(0));
  return undefined;
};
class ContentFailure extends Error { constructor(readonly outcome: 'missing' | 'unsupported' | 'failed') { super(outcome); } }
const fail = (outcome: ContentFailure['outcome'] = 'failed'): never => { throw new ContentFailure(outcome); };
type FamilyAuthority = Readonly<{ variantFamilyId: string; representationId: string; payloadDigest: string }>;

/** Explicit fixture-construction authority, never inferred from a filename or source arrival order. */
export function developmentContentVerifier(authorities: readonly FamilyAuthority[],
  readBytes: (record: JsonObject) => Promise<Uint8Array | undefined> = developmentContentBytes): ProjectContentVerifier {
  const fixedAuthorities = authorities.map(a => Object.freeze({ ...a }));
  const geometryKey = (r: JsonObject) => canonical({ blob: r.blob!, formatProfile: r.formatProfile!,
    representationToAsset: r.representationToAsset!, contentKind: r.contentKind!, role: r.role! });
  // Populated only by actual byte/profile/AssetFrame decoding, never an imported
  // receipt, class label, digest equality alone or an unverified constructor claim.
  const verifiedGeometry = new Map<string, { positions: number[]; indices: number[] }>();
  const bytesFor = async (r: JsonObject) => {
    const bytes = await readBytes(r); if (!bytes) return fail('missing');
    const blob = object(r.blob); if (blob.algorithm !== 'sha256' || bytes.byteLength !== blob.byteLength || fixtureSha256(bytes) !== blob.digest) fail();
    return bytes;
  };
  const triangle = async (r: JsonObject) => {
    const id = (prefix: string, n = 1) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
    const known = createFixtureModel({ asset: id('ast'), assetFrame: id('frm'), representationFrame: id('frm', 2), representation: id('rep'), binding: id('bnd'), revision: id('rev'),
      family: id('fam'), compatibility: id('cmp'), layout: id('lay'), slot: id('slot') }, 'original', { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 }).representation;
    if (!same(r.formatProfile, known.formatProfile)) fail('unsupported');
    if (object(r.blob).mediaType !== 'application/json' || r.contentKind !== 'mesh' || r.role !== 'meshPrimary' ||
      !same(r.representationToAsset, known.representationToAsset)) fail('unsupported');
    const bytes = await bytesFor(r), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!['original', 'updated'].some(shape => new TextDecoder().decode(fixtureModelBytes(shape as 'original' | 'updated')) === text)) fail('unsupported');
    const decoded = JSON.parse(text) as { positions: number[]; indices: number[] };
    const positions = decoded.positions.map((v, i) => v + (i % 3 === 0 ? 0.25 : 0));
    const axes = [0, 1, 2].map(i => positions.filter((_, n) => n % 3 === i));
    verifiedGeometry.set(geometryKey(r), { positions, indices: decoded.indices });
    return { positions, indices: decoded.indices, bounds: { min: axes.map(a => Math.min(...a)), max: axes.map(a => Math.max(...a)) },
      materials: [{ sourceLocator: known.materialCatalog.slots[0]!.sourceLocator, sourceSemantics: known.materialCatalog.slots[0]!.sourceSemantics }] };
  };
  return { scope: 'development-fixture', async verify(request: ContentRequest) {
    try {
      let facts: JsonObject;
      if (request.fact === 'representation') {
        const decoded = await triangle(request.records[0]!);
        facts = { contentKind: 'mesh', staticPose: true, contentBoundsAsset: decoded.bounds, materials: decoded.materials,
          surfaceRanges: [{ kind: 'meshTriangle', nodeIndex: 0, primitiveIndex: 0, count: decoded.indices.length / 3 }] };
      } else if (request.fact === 'family-envelope') {
        const matches = fixedAuthorities.filter(a => a.variantFamilyId === request.context.variantFamilyId);
        if (matches.length !== 1) return fail('missing');
        const authority = matches[0]!, source = request.records.find(r => r.id === authority.representationId && r.payloadDigest === authority.payloadDigest);
        if (!source) return fail('missing');
        if (!list(source.purposes).includes('source')) fail('unsupported');
        const decoded = await triangle(source);
        facts = { logicalBoundsAsset: decoded.bounds, authority: { kind: 'source', representationId: source.id!, payloadDigest: source.payloadDigest! } };
      } else if (request.fact === 'family-contribution') {
        let expected: string | undefined;
        for (const r of request.records) {
          const decoded = await triangle(r), geometry = canonical({ positions: decoded.positions, indices: decoded.indices });
          if (expected !== undefined && geometry !== expected) fail(); expected = geometry;
        }
        facts = { verifiedMembers: request.records.map(r => ({ id: r.id!, payloadDigest: r.payloadDigest! })) };
      } else if (request.fact === 'surface-equivalence') {
        // Exact source geometry in AssetFrame for every member of every revision.
        // Equal bounds/digest/class labels alone never establish equivalence.
        const reps = new Map(request.records.filter(r => r.blob).map(r => [string(r.id), r]));
        const revisions = request.records.filter(r => r.representationIds);
        if (revisions.length < 2) fail();
        for (const family of list(request.context.targetVariantFamilyIds)) {
          let expected: string | undefined;
          for (const revision of revisions) {
            const members = list(revision.representationIds).map(id => reps.get(string(id))).filter((r): r is JsonObject => r?.variantFamilyId === family);
            if (!members.length) fail();
            for (const r of members) {
              // Current verified content can prove a byte/profile/transform-exact
              // historical encoding without reading any weak historical blob.
              const decoded = verifiedGeometry.get(geometryKey(r)) ?? fail('missing');
              const geometry = canonical({ positions: decoded.positions, indices: decoded.indices });
              if (expected !== undefined && geometry !== expected) fail(); expected = geometry;
            }
          }
        }
        facts = { equivalentVariantFamilyIds: request.context.targetVariantFamilyIds! };
      } else {
        const r = request.records[0]!, bytes = await bytesFor(r);
        if (r.mediaKind !== 'image' || object(r.blob).mediaType !== 'image/png' || !fixtureMedia.some(m => m.record.blob.digest === object(r.blob).digest)) fail('unsupported');
        await verifyFixedPng(bytes);
        facts = { mediaKind: 'image', mediaType: 'image/png' };
      }
      return { request, scope: 'development-fixture', outcome: 'verified', facts };
    } catch (error) { return { request, scope: 'development-fixture', outcome: error instanceof ContentFailure ? error.outcome : 'failed' }; }
  } };
}

async function verifyFixedPng(bytes: Uint8Array) {
  const data = Uint8Array.from(bytes), blob = new Blob([data]);
  const inspected = await inspectNativeImageSource({ size: blob.size, mediaType: 'image/png', stream: () => blob.stream() });
  if (inspected.width !== 64 || inspected.height !== 48 || inspected.mediaType !== 'image/png') fail();
  const view = new DataView(data.buffer), compressed: Uint8Array<ArrayBuffer>[] = []; let at = 8;
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const v of b) { c ^= v; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
  while (at < data.length) {
    if (at + 12 > data.length) fail(); const n = view.getUint32(at); if (at + 12 + n > data.length) fail();
    if (crc(data.subarray(at + 4, at + 8 + n)) !== view.getUint32(at + 8 + n)) fail();
    const kind = new TextDecoder().decode(data.subarray(at + 4, at + 8));
    if (kind === 'IDAT') compressed.push(data.slice(at + 8, at + 8 + n)); at += n + 12;
  }
  const reader = new Blob(compressed).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  // This is an exact tiny fixture check, never a generic unbounded image decoder.
  let count = 0;
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break;
    if (count + chunk.value.length > 48 * 193) fail();
    for (let i = 0; i < chunk.value.length; i++) if ((count + i) % 193 === 0 && chunk.value[i] !== 0) fail();
    count += chunk.value.length;
  } } finally { await reader.cancel(); reader.releaseLock(); }
  if (count !== 48 * 193) fail();
}
