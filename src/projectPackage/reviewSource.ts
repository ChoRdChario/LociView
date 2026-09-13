import { canonical, same } from '../domain/projectGraphSupport';
import type { ProjectContentVerifier } from '../domain/projectContentChecks';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { MetadataProjectSession, MetadataSessionRead } from '../projectMetadata/session';
import { ProjectMetadataSource, type MetadataLimits, type MetadataProof } from '../projectMetadata/source';
import { readProjectScene, type ProjectProviderRead } from '../scene/projectProvider';
import { verifyCleanBodies } from './cleanSource';
import { packageSourceLimits } from './contributionEvidence';
import { PACKAGE_LIMITS as L } from './contract';
import { PackageControlError } from './manifest';
import { prepareReviewSnapshot, type ReviewReconstruction, type ReviewSelectionOptions } from './reviewSelection';
import { readReviewSnapshot, type ReviewSnapshot } from './reviewSnapshot';
import { checkAbort } from './zipChecks';

const fail = (code: string): never => { throw new PackageControlError(`review-${code}`); };
async function plan(source: ProjectMetadataSource, provider: ProjectProviderRead, limits: MetadataLimits, selection: ReviewSelectionOptions, recipe?: ReviewReconstruction) {
  if (provider.kind !== 'scene-provider' || provider.token !== source.token) return fail('not-ready');
  const result = await prepareReviewSnapshot(source, limits, selection, recipe);
  for (const issue of provider.issues) {
    if (!result.sourceContentIds.has(issue.path[1]!)) continue;
    if (['partial-material-map', 'ambiguous-material-maps'].includes(issue.code)) continue;
    fail('content-unresolved');
  }
  return result;
}

/** A checked frozen export attempt. No Project is created when constructing this snapshot. */
export class ReviewSourceCapture {
  readonly kind = 'review-source-capture';
  private constructor(private readonly original: Uint8Array, readonly source: ProjectMetadataSource, readonly publication: string,
    readonly review: ReviewSnapshot, readonly reconstruction: ReviewReconstruction) {}
  sourceBytes() { return this.original.slice(); }
  snapshotBytes() { return new TextEncoder().encode(canonical(this.review.snapshot)); }
  get token() { return this.source.token; }
  get snapshot() { const bytes = this.snapshotBytes(); return { path: 'review.json', sha256: this.review.token, byteLength: bytes.length }; }
  get blobs() { return this.review.closure.entries; }
  get bodyRefs() { return this.review.closure.semanticRefs; }
  get summary() { return this.review.summary; }

  static async prepare(session: Pick<MetadataProjectSession, 'read'>, expectedToken: string, selection: ReviewSelectionOptions,
    store: Pick<OriginBlobStore, 'openReadOnly'>, requested: MetadataLimits, signal?: AbortSignal) {
    const limits = packageSourceLimits(requested), checked = (r: MetadataSessionRead) => {
      if (r.state !== 'ready' || !r.source || !r.publication || r.source.token !== expectedToken || !r.provider) return fail('not-ready');
      return { source: r.source, publication: r.publication, provider: r.provider };
    };
    checkAbort(signal); const before = checked(await session.read()), original = before.source.encodeFullSource();
    if (original.length > L.sourceBytes) fail('source-budget');
    const source = ProjectMetadataSource.fromFullSource(original, before.source.proof, limits);
    const result = await plan(source, before.provider, limits, selection); checkAbort(signal);
    await verifyCleanBodies(result.review.closure.semanticRefs, store, signal);
    const after = checked(await session.read()); checkAbort(signal); if (after.publication !== before.publication) fail('publication-changed');
    return new ReviewSourceCapture(original, source, before.publication, result.review, result.reconstruction);
  }
  static async restore(input: { source: Uint8Array; sourceProof: MetadataProof; snapshot: Uint8Array; reconstruction: ReviewReconstruction },
    store: Pick<OriginBlobStore, 'openReadOnly'>, verifier: ProjectContentVerifier, requested: MetadataLimits, signal?: AbortSignal) {
    checkAbort(signal); const limits = packageSourceLimits(requested), original = input.source.slice();
    const source = ProjectMetadataSource.fromFullSource(original, input.sourceProof, limits), review = await readReviewSnapshot(input.snapshot, limits);
    const provider = await readProjectScene(source.read(), limits, verifier), result = await plan(source, provider, limits, input.reconstruction.selection, input.reconstruction);
    if (result.review.token !== review.token || !same(result.review.snapshot, review.snapshot)) fail('reconstruction-mismatch');
    await verifyCleanBodies(review.closure.semanticRefs, store, signal); checkAbort(signal);
    return new ReviewSourceCapture(original, source, '', review, result.reconstruction);
  }
}
