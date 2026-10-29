import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { editorCapabilities } from '../projectMetadata/editorAttribution';
import { canonical } from '../domain/projectGraphSupport';
import type { JsonValue } from '../domain/values';
import { PACKAGE_FORMAT, PACKAGE_WIRE_VERSION } from './contract';
import { packageByteHash, readManifestControl } from './manifest';
import { ContributionSourceCapture } from './contributionSource';
import { writeCausalArchive, type WorkspaceArchiveOptions } from './workspaceArchive';
import { checkAbort } from './zipChecks';

/** Exact controls for a frozen delta, not a durable output or save receipt. */
export function prepareContributionManifest(capture: ContributionSourceCapture, options: WorkspaceArchiveOptions) {
  const payloads = [...capture.changes, ...capture.blobs];
  const manifest = new TextEncoder().encode(canonical({ format: PACKAGE_FORMAT, wireVersion: PACKAGE_WIRE_VERSION, purpose: 'contribution',
    packageId: options.packageId, createdByVersion: options.createdByVersion, ...(options.memo !== undefined ? { memo: options.memo } : {}),
    identity: capture.target.proof.identity, metadataEnvelope: capture.target.proof.envelope, targetHeads: capture.target.heads,
    base: capture.base.selection, changes: capture.changes, blobs: capture.blobs, summary: capture.summary,
    ...editorCapabilities(capture.base.source.includesDeclaredEditorNames || capture.target.includesDeclaredEditorNames),
    payloadTotals: { entryCount: payloads.length, uncompressedBytes: payloads.reduce((n, e) => n + e.byteLength, 0),
      largestEntryBytes: Math.max(0, ...payloads.map(e => e.byteLength)) } } as unknown as JsonValue));
  const checksum = new TextEncoder().encode(packageByteHash(manifest));
  return { manifest, checksum, control: readManifestControl(manifest, checksum) };
}

export async function writeContributionArchive(capture: ContributionSourceCapture, store: Pick<OriginBlobStore, 'inspect' | 'openReadOnly'>,
  destination: WritableStream<Uint8Array>, options: WorkspaceArchiveOptions) {
  const owned = { packageId: options.packageId, createdByVersion: options.createdByVersion, memo: options.memo, signal: options.signal };
  let started = false;
  try {
    await capture.base.verifyInventory(store, owned.signal);
    const controls = prepareContributionManifest(capture, owned), originals = capture.changes.map(c => ({
      path: `changes/${String(c.ordinal).padStart(8, '0')}.amchange`, bytes: capture.changeBytes(c.ordinal) }));
    started = true;
    const result = await writeCausalArchive(capture, controls, originals, store, destination, owned);
    await capture.base.verifyInventory(store, owned.signal); checkAbort(owned.signal); return result;
  } catch (error) { if (!started) await destination.abort(error).catch(() => {}); throw error; }
}
