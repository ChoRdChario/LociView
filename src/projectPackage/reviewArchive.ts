import { canonical, same } from '../domain/projectGraphSupport';
import type { JsonValue } from '../domain/values';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { MetadataLimits } from '../projectMetadata/source';
import { capabilityFields, checkRequiredCapabilities } from '../projectMetadata/requiredCapabilities';
import { PACKAGE_FORMAT, PACKAGE_WIRE_VERSION, PACKAGE_LIMITS as L } from './contract';
import { packageByteHash, PackageControlError, readManifestControl } from './manifest';
import { ReviewSourceCapture } from './reviewSource';
import { readReviewSnapshot, reviewCapabilities, type ReviewSnapshot } from './reviewSnapshot';
import { PackageArchive } from './zipArchive';
import { writePackageArchive, type WorkspaceArchiveOptions } from './workspaceArchive';
import { checkAbort } from './zipChecks';

const fail = (code: string): never => { throw new PackageControlError(`review-${code}`); };
export function prepareReviewManifest(capture: ReviewSourceCapture, options: WorkspaceArchiveOptions) {
  const payloads = [capture.snapshot, ...capture.blobs], manifest = new TextEncoder().encode(canonical({ format: PACKAGE_FORMAT, wireVersion: PACKAGE_WIRE_VERSION,
    purpose: 'review', packageId: options.packageId, createdByVersion: options.createdByVersion, ...capabilityFields(reviewCapabilities(capture.review)), ...(options.memo !== undefined ? { memo: options.memo } : {}),
    snapshotId: capture.review.snapshot.snapshotId!, snapshot: capture.snapshot, blobs: capture.blobs as unknown as JsonValue, summary: capture.summary as unknown as JsonValue,
    payloadTotals: { entryCount: payloads.length, uncompressedBytes: payloads.reduce((n, e) => n + e.byteLength, 0), largestEntryBytes: Math.max(...payloads.map(e => e.byteLength)) } }));
  const checksum = new TextEncoder().encode(packageByteHash(manifest));
  return { manifest, checksum, control: readManifestControl(manifest, checksum) };
}
export async function writeReviewArchive(capture: ReviewSourceCapture, store: Pick<OriginBlobStore, 'openReadOnly'>,
  destination: WritableStream<Uint8Array>, options: WorkspaceArchiveOptions) {
  let started = false;
  try {
    const bytes = capture.snapshotBytes(); if (bytes.length !== capture.snapshot.byteLength || packageByteHash(bytes) !== capture.snapshot.sha256) fail('snapshot-changed');
    const controls = prepareReviewManifest(capture, options); started = true;
    return await writePackageArchive(capture, controls, [{ path: 'review.json', bytes }], store, destination, options);
  } catch (error) { if (!started) await destination.abort(error).catch(() => {}); throw error; }
}

/** History-free standalone inspection; this does not initialize metadata or acknowledge storage. */
export class ReviewArchive {
  readonly kind = 'review-archive-inspection';
  private constructor(readonly archive: PackageArchive, readonly review: ReviewSnapshot) { Object.freeze(this); }
  static async inspect(file: Blob, limits: MetadataLimits, signal?: AbortSignal) {
    return this.fromArchive(await PackageArchive.inspect(file, signal), limits, signal);
  }
  /** Only the currently live input owner may reuse its immutable native capture. */
  async reopen(limits: MetadataLimits) { return ReviewArchive.fromArchive(await this.archive.reopenCapturedControl(), limits); }
  private static async fromArchive(archive: PackageArchive, limits: MetadataLimits, signal?: AbortSignal) {
    const manifest = archive.control.manifest;
    if (manifest.purpose !== 'review') return fail('purpose');
    const review = await readReviewSnapshot(await archive.entryBytes('review.json', L.snapshotBytes, signal), limits); checkAbort(signal);
    checkRequiredCapabilities(manifest.requiredCapabilities, reviewCapabilities(review));
    if (review.snapshot.snapshotId !== manifest.snapshotId || !same(review.closure.entries as unknown as JsonValue, manifest.blobs as unknown as JsonValue) ||
      !same(review.summary as unknown as JsonValue, manifest.summary as unknown as JsonValue)) fail('summary-or-closure');
    return new ReviewArchive(archive, review);
  }
}
