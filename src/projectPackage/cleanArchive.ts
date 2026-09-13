import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { canonical } from '../domain/projectGraphSupport';
import type { JsonValue } from '../domain/values';
import { ProjectMetadataSource, type MetadataLimits } from '../projectMetadata/source';
import { PACKAGE_FORMAT, PACKAGE_WIRE_VERSION, PACKAGE_LIMITS as L } from './contract';
import { CleanSourceCapture, inspectCleanSource } from './cleanSource';
import { packageSourceLimits } from './contributionEvidence';
import { packageByteHash, PackageControlError, readManifestControl } from './manifest';
import { PackageArchive } from './zipArchive';
import { writePackageArchive, type WorkspaceArchiveOptions } from './workspaceArchive';
import { checkAbort } from './zipChecks';

const fail = (code: string): never => { throw new PackageControlError(`clean-${code}`); };
const encode = (v: unknown) => new TextEncoder().encode(canonical(v as JsonValue));
const same = (a: unknown, b: unknown) => canonical(a as JsonValue) === canonical(b as JsonValue);

export function prepareCleanManifest(capture: CleanSourceCapture, options: WorkspaceArchiveOptions) {
  const payloads = [capture.metadata, ...capture.blobs];
  const manifest = encode({ format: PACKAGE_FORMAT, wireVersion: PACKAGE_WIRE_VERSION, purpose: 'clean',
    packageId: options.packageId, createdByVersion: options.createdByVersion, ...(options.memo !== undefined ? { memo: options.memo } : {}),
    identity: capture.proof.identity, metadataEnvelope: capture.proof.envelope, targetHeads: capture.targetHeads,
    metadata: capture.metadata, blobs: capture.blobs, summary: capture.summary,
    payloadTotals: { entryCount: payloads.length, uncompressedBytes: payloads.reduce((n, e) => n + e.byteLength, 0), largestEntryBytes: Math.max(...payloads.map(e => e.byteLength)) } });
  const checksum = new TextEncoder().encode(packageByteHash(manifest));
  return { manifest, checksum, control: readManifestControl(manifest, checksum) };
}
export async function writeCleanArchive(capture: CleanSourceCapture, store: Pick<OriginBlobStore, 'openReadOnly'>,
  destination: WritableStream<Uint8Array>, options: WorkspaceArchiveOptions) {
  let started = false;
  try {
    const bytes = capture.metadataBytes();
    if (bytes.length !== capture.metadata.byteLength || packageByteHash(bytes) !== capture.metadata.sha256) fail('output-changed');
    const controls = prepareCleanManifest(capture, options); started = true;
    return await writePackageArchive(capture, controls, [{ path: 'metadata.am', bytes }], store, destination, options);
  } catch (error) { if (!started) await destination.abort(error).catch(() => {}); throw error; }
}

/** Purpose/history/closure/privacy integrity; profile admission precedes activation. */
export class CleanArchive {
  readonly kind = 'clean-archive-inspection';
  private constructor(readonly archive: PackageArchive, readonly source: ProjectMetadataSource,
    readonly description: Awaited<ReturnType<typeof inspectCleanSource>>) {}
  static async inspect(file: Blob, limits: MetadataLimits, signal?: AbortSignal) {
    const archive = await PackageArchive.inspect(file, signal), manifest = archive.control.manifest;
    if (manifest.purpose !== 'clean') return fail('purpose');
    const bytes = await archive.entryBytes('metadata.am', L.sourceBytes, signal);
    const source = ProjectMetadataSource.fromFullSource(bytes, { identity: manifest.identity, envelope: manifest.metadataEnvelope }, packageSourceLimits(limits));
    if (!same(source.heads, manifest.targetHeads)) fail('heads');
    const description = await inspectCleanSource(source, limits); checkAbort(signal);
    if (!same(description.closure.entries, manifest.blobs) || !same(description.summary, manifest.summary)) fail('summary-or-closure');
    return new CleanArchive(archive, source, description);
  }
}
