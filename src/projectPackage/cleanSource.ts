import { sourceIndexInRange, type ProjectContentVerifier } from '../domain/projectContentChecks';
import { canonical, immutableKinds, list, object, same, string } from '../domain/projectGraphSupport';
import { projectRecordMaps, type ProjectRecordMap } from '../domain/projectRecords';
import type { JsonObject, JsonValue } from '../domain/values';
import type { OriginBlobStore, StoredBlobRef } from '../projectMetadata/blobStore';
import { checkedBlobStream } from '../projectMetadata/blobStream';
import { ProjectMetadataSource, type MetadataLimits, type MetadataProof } from '../projectMetadata/source';
import type { MetadataProjectSession, MetadataSessionRead } from '../projectMetadata/session';
import { readProjectScene, type ProjectProviderRead } from '../scene/projectProvider';
import { PACKAGE_LIMITS as L, type AutomaticSummary, type Entry } from './contract';
import { packageSourceLimits } from './contributionEvidence';
import { planWorkspaceClosure } from './closure';
import { selectCleanRecords, prepareCleanRecords, summarizeCleanRecords, type CleanReconstruction } from './cleanRecords';
import { packageByteHash, PackageControlError } from './manifest';
import { checkAbort } from './zipChecks';
import { inspectProjectCandidates } from '../domain/projectCandidates';
import { protectedWorkspaceInventory } from './protectedInventory';

const fail = (code: string): never => { throw new PackageControlError(`clean-${code}`); };
const table = (records: JsonObject, map: ProjectRecordMap) => object(records[map]) as Record<string, JsonObject>;

/** Local source protection, deliberately stricter than history-free ZIP scope. */
export async function cleanProtectedInventory(source: ProjectMetadataSource, bases: readonly Entry[], limits: MetadataLimits) {
  const c = await inspectProjectCandidates(source.read(), limits);
  if (c.kind !== 'project-candidate-inspection' || !same(c.source.schema, { major: 2, minor: source.semanticProfile === 'map2' ? 1 : 0 }) ||
    c.source.recordMaps.some(m => !Object.hasOwn(projectRecordMaps, m))) return fail('source-protection-unverified');
  if (c.fields.some(f => f.hasUnknownFields && f.candidates.some(v => v.value.kind !== 'absent'))) fail('source-protection-unverified');
  return protectedWorkspaceInventory({ ...c, hasUnknownFields: false, fields: c.fields.filter(f => !f.hasUnknownFields) }, bases);
}

async function cleanRecordPlan(source: ProjectMetadataSource, provider: ProjectProviderRead, limits: MetadataLimits, recipe?: CleanReconstruction) {
  if (provider.kind !== 'scene-provider' || provider.token !== source.token) return fail('not-ready');
  const selected = await selectCleanRecords(source, limits);
  const included = new Set(Object.keys(projectRecordMaps).flatMap(m => Object.keys(object(selected[m]))));
  for (const issue of provider.issues) {
    if (!(issue.path[0] === 'identity' || issue.path[0] === 'project' || included.has(issue.path[1]!))) continue;
    if (['opaque-data-protection-required', 'unknown-field-policy', 'anchor-class-not-current', 'source-index-unverified', 'verified-source-index-range-required', 'partial-material-map', 'ambiguous-material-maps'].includes(issue.code)) continue;
    fail('content-unresolved');
  }
  const verifiedHit = (anchor: JsonObject, representation: JsonObject) => {
    const check = provider.inspection.checks.find(c => c.request.token === source.token && c.request.fact === 'representation' && c.outcome === 'verified' && same(c.request.records[0], representation));
    const surface = object(object(anchor.hitEvidence).source).surfaceRef;
    return !!check?.facts && (!surface || sourceIndexInRange(object(surface), check.facts));
  };
  return prepareCleanRecords(selected, limits, verifiedHit, recipe, source.semanticProfile);
}

/** Closed fresh-initialization shape, not a causal envelope relabeled as clean. */
export async function inspectCleanSource(source: ProjectMetadataSource, limits: MetadataLimits) {
  source.assertFreshInitialization();
  const records = await selectCleanRecords(source, limits), inspection = await source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork });
  source.assertFreshInitialization(Object.keys(projectRecordMaps).filter(m => !Object.hasOwn(immutableKinds, m)).reduce((n, m) => n + Object.keys(object(records[m])).length, 0));
  const expected = new Map<string, JsonValue>([['["schema"]', records.schema!], ['["identity"]', records.identity!]]);
  if (source.semanticProfile === 'map2') expected.set('["semanticProfile"]', 'map2');
  for (const [key, value] of Object.entries(object(records.project))) expected.set(canonical(['project', key]), value);
  for (const map of Object.keys(projectRecordMaps) as ProjectRecordMap[]) for (const record of Object.values(table(records, map))) {
    if (Object.hasOwn(immutableKinds, map)) expected.set(canonical([map, record.id!]), record);
    else {
      const life = object(record.lifecycle);
      if (life.state !== 'active' || life.reason !== 'initial') fail('lifecycle');
      for (const [key, value] of Object.entries(record)) expected.set(canonical([map, record.id!, key]), value);
    }
    if (record.parentRevisionId !== undefined || record.parentBindingId !== undefined || record.materialCompatibilityMaps !== undefined || record.derivation !== undefined) fail('private-fields');
    if (map === 'assetsById' && object(record.status).expectedDigest !== undefined) fail('private-fields');
  }
  const observed = new Set<string>();
  for (const scalar of inspection.scalars) {
    const path = canonical(scalar.path);
    if (observed.has(path) || !expected.has(path) || scalar.value.kind !== 'value' || !same(expected.get(path), scalar.value.value)) fail('hidden-history');
    observed.add(path);
  }
  if (observed.size !== expected.size) fail('incomplete-source');
  const closure = planWorkspaceClosure(inspection.candidates), includedBlobs = new Set(closure.entries.map(e => e.sha256));
  for (const revision of Object.values(table(records, 'assetRevisionsById')))
    if (list(object(revision.provenance).inputBlobDigests).some(d => !includedBlobs.has(string(d)))) fail('private-provenance');
  for (const caption of Object.values(table(records, 'captionsById'))) {
    const a = object(caption.anchor); if (a.kind !== 'asset') continue;
    const hit = a.hitEvidence ? object(a.hitEvidence) : undefined;
    if (!hit && a.authoredAssetRevisionId !== undefined) fail('weak-revision');
    if (hit?.method === 'manual') {
      const status = object(table(records, 'assetsById')[string(a.assetId)]?.status), binding = status?.kind === 'ready' && table(records, 'assetBindingsById')[string(status.activeBindingId)];
      const revision = binding && table(records, 'assetRevisionsById')[string(binding.assetRevisionId)];
      const compatible = revision && list(revision.anchorCompatibilityClasses).some(c => object(c).id === a.authoredAnchorCompatibilityId);
      if (a.authoredAssetRevisionId !== (compatible ? revision.id : undefined)) fail('manual-revision');
    } else if (hit) {
      const weak = hit.source && object(hit.source);
      if ((a.authoredAssetRevisionId !== undefined) !== !!weak || weak && (!table(records, 'assetRevisionsById')[string(a.authoredAssetRevisionId)] || !table(records, 'representationsById')[string(weak.representationId)])) fail('weak-source');
    }
  }
  return { records, closure, summary: summarizeCleanRecords(records, closure.entries, source.semanticProfile) };
}

/** Owned fresh output plus separate source evidence; neither is a durable job. */
export class CleanSourceCapture {
  readonly kind = 'clean-source-capture';
  private constructor(private readonly original: Uint8Array, readonly source: ProjectMetadataSource,
    readonly output: ProjectMetadataSource, readonly publication: string, readonly blobs: readonly Entry[],
    readonly bodyRefs: readonly StoredBlobRef[], readonly summary: AutomaticSummary, readonly metadata: Entry,
    readonly reconstruction: CleanReconstruction) {}
  sourceBytes() { return this.original.slice(); }
  metadataBytes() { return this.output.encodeFullSource(); }
  get token() { return this.source.token; }
  get proof() { return this.output.proof; }
  get targetHeads() { return this.output.heads; }
  get requiredCapabilities() { return this.output.requiredCapabilities; }

  static async prepare(session: Pick<MetadataProjectSession, 'read'>, expectedToken: string,
    store: Pick<OriginBlobStore, 'openReadOnly'>, requested: MetadataLimits, signal?: AbortSignal) {
    const limits = packageSourceLimits(requested);
    const checked = (r: MetadataSessionRead) => {
      if (r.state !== 'ready' || !r.source || !r.publication || r.source.token !== expectedToken || r.provider?.kind !== 'scene-provider' || r.provider.token !== expectedToken) return fail('not-ready');
      return { source: r.source, publication: r.publication, provider: r.provider };
    };
    checkAbort(signal); const before = checked(await session.read()), original = before.source.encodeFullSource();
    if (original.length > L.sourceBytes) fail('source-budget');
    const source = ProjectMetadataSource.fromFullSource(original, before.source.proof, limits);
    const { records, reconstruction } = await cleanRecordPlan(source, before.provider, limits); checkAbort(signal);
    const output = ProjectMetadataSource.bootstrap(object(records.schema), object(records.identity), limits, { time: 0, semanticProfile: source.semanticProfile }).initialize(records, { time: 0 });
    const description = await inspectCleanSource(output, limits); checkAbort(signal);
    await verifyCleanBodies(description.closure.semanticRefs, store, signal);
    const after = checked(await session.read()); checkAbort(signal);
    if (after.publication !== before.publication) fail('publication-changed');
    const bytes = output.encodeFullSource(), metadata = { path: 'metadata.am', sha256: packageByteHash(bytes), byteLength: bytes.length };
    return new CleanSourceCapture(original, source, output, before.publication, description.closure.entries,
      description.closure.semanticRefs, description.summary, metadata, reconstruction);
  }

  /** Exact retained attempt only: no new IDs, actor/root, source lookup or publication. */
  static async restore(input: { source: Uint8Array; sourceProof: MetadataProof; output: Uint8Array; outputProof: MetadataProof; reconstruction: CleanReconstruction },
    store: Pick<OriginBlobStore, 'openReadOnly'>, verifier: ProjectContentVerifier, requested: MetadataLimits, signal?: AbortSignal) {
    checkAbort(signal); const limits = packageSourceLimits(requested), original = input.source.slice(), bytes = input.output.slice();
    const source = ProjectMetadataSource.fromFullSource(original, input.sourceProof, limits), output = ProjectMetadataSource.fromFullSource(bytes, input.outputProof, limits);
    if (source.semanticProfile !== output.semanticProfile) fail('reconstruction-profile');
    const provider = await readProjectScene(source.read(), limits, verifier);
    const { records, reconstruction } = await cleanRecordPlan(source, provider, limits, input.reconstruction); checkAbort(signal);
    const description = await inspectCleanSource(output, limits);
    if (!same(records, description.records)) fail('reconstruction-mismatch');
    await verifyCleanBodies(description.closure.semanticRefs, store, signal); checkAbort(signal);
    return new CleanSourceCapture(original, source, output, '', description.closure.entries, description.closure.semanticRefs,
      description.summary, { path: 'metadata.am', sha256: packageByteHash(bytes), byteLength: bytes.length }, reconstruction);
  }
}

export async function verifyCleanBodies(refs: readonly StoredBlobRef[], store: Pick<OriginBlobStore, 'openReadOnly'>, signal?: AbortSignal) {
  let chunks = 0, bytes = 0;
  const limits = { maxBlobBytes: L.blobBytes, maxChunkBytes: L.chunkBytes, maxChunks: L.streamChunks };
  for (const ref of new Map(refs.map(r => [r.digest, r])).values()) {
    checkAbort(signal); const file = await store.openReadOnly(ref, limits); checkAbort(signal);
    if (file.size !== ref.byteLength) fail('body-size');
    let verified = false;
    const reader = checkedBlobStream(file.stream(), limits, () => { verified = true; }, ref, signal).getReader();
    try {
      for (;;) { checkAbort(signal); if (++chunks > L.packageChunks) fail('stream-budget');
        const chunk = await reader.read(); checkAbort(signal); if (chunk.done) break;
        if ((bytes += chunk.value.length) > L.blobBytes) fail('body-budget'); }
      if (!verified) fail('body-incomplete');
    } catch (error) { try { await reader.cancel(error); } catch { /* Retain original failure. */ } throw error; }
    finally { reader.releaseLock(); }
  }
}
