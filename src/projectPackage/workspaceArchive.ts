import { ZipWriter, Uint8ArrayReader, type ReadableReader } from '@zip.js/zip.js';
import { canonical } from '../domain/projectGraphSupport';
import type { JsonValue } from '../domain/values';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { checkedBlobStream } from '../projectMetadata/blobStream';
import { ProjectMetadataSource, type MetadataLimits } from '../projectMetadata/source';
import { NativeSha256 } from '../nativeGs/sha256';
import { PACKAGE_FORMAT, PACKAGE_WIRE_VERSION, PACKAGE_LIMITS as L, type Entry } from './contract';
import { packageByteHash, PackageControlError, readManifestControl } from './manifest';
import { WorkspaceSourceCapture, packageSourceLimits } from './workspaceSource';
import { summarizeFullHistory } from './historySummary';
import { planWorkspaceClosure } from './closure';
import { checkAbort, rejectNestedZip } from './zipChecks';
import { PackageArchive } from './zipArchive';

const fail = (code: string): never => { throw new PackageControlError(code); };
const encode = (value: JsonValue) => new TextEncoder().encode(canonical(value));
const same = (a: unknown, b: unknown) => canonical(a as JsonValue) === canonical(b as JsonValue);
export interface WorkspaceArchiveOptions { readonly packageId: string; readonly createdByVersion: string; readonly memo?: string; readonly signal?: AbortSignal }
/** One exact builder for pre-write binding and ZIP generation; no durable completion. */
export function prepareWorkspaceManifest(capture: WorkspaceSourceCapture, options: WorkspaceArchiveOptions) {
  const payloads = [capture.metadata, ...capture.blobs];
  const manifest = encode({ format: PACKAGE_FORMAT, wireVersion: PACKAGE_WIRE_VERSION, purpose: 'teamWorkspace',
    packageId: options.packageId, createdByVersion: options.createdByVersion, ...(options.memo !== undefined ? { memo: options.memo } : {}),
    identity: capture.proof.identity, metadataEnvelope: capture.proof.envelope, targetHeads: capture.targetHeads,
    metadata: capture.metadata, blobs: capture.blobs, summary: capture.summary,
    payloadTotals: { entryCount: payloads.length, uncompressedBytes: payloads.reduce((n, e) => n + e.byteLength, 0),
      largestEntryBytes: Math.max(...payloads.map(e => e.byteLength)) } } as unknown as JsonValue);
  const checksum = new TextEncoder().encode(packageByteHash(manifest)), control = readManifestControl(manifest, checksum);
  return { manifest, checksum, control };
}
const zipOptions = (signal: AbortSignal) => ({ level: 0, bufferedWrite: false, dataDescriptor: true, dataDescriptorSignature: true,
  zip64: false, extendedTimestamp: false, version: 20, versionMadeBy: 20, msDosCompatible: true,
  internalFileAttributes: 0, externalFileAttributes: 0, useUnicodeFileNames: true, keepOrder: true,
  lastModDate: new Date(1980, 0, 1, 0, 0, 0), useWebWorkers: false, signal });

// Pull-sized views precede the second digest clone and zip.js's eager ChunkStream.
// Hold at most one checked raw chunk; do not enqueue a large chunk's slices at once.
export function workspaceInputChunks(input: ReadableStream<Uint8Array>, signal: AbortSignal, charge: () => void): ReadableStream<Uint8Array> {
  const reader = input.getReader(); let pending: Uint8Array | undefined, at = 0, reads = 0, released = false;
  const onAbort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  const release = () => { pending = undefined; if (!released) { released = true; signal.removeEventListener('abort', onAbort); reader.releaseLock(); } };
  signal.addEventListener('abort', onAbort, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        checkAbort(signal);
        if (!pending) {
          charge(); if (++reads > L.streamChunks) fail('zip-stream-budget');
          const result = await reader.read(); checkAbort(signal);
          if (result.done) { release(); controller.close(); return; }
          if (!(result.value instanceof Uint8Array) || result.value.length > L.chunkBytes) fail('zip-input-budget');
          pending = result.value; at = 0;
        }
        const end = Math.min(at + 65_536, pending!.length);
        controller.enqueue(pending!.subarray(at, end)); at = end;
        if (at === pending!.length) pending = undefined;
      } catch (error) {
        try { await reader.cancel(error); } catch { /* Preserve original failure. */ }
        release(); controller.error(error);
      }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { release(); } },
  }, { highWaterMark: 0 });
}

/** Actual ZIP generation into an owned sink, not a job, retained base or external-file receipt. */
export async function writeWorkspaceArchive(capture: WorkspaceSourceCapture, store: Pick<OriginBlobStore, 'openReadOnly'>,
  destination: WritableStream<Uint8Array>, options: WorkspaceArchiveOptions) {
  let started = false;
  try {
    const metadata = capture.metadataBytes();
    if (metadata.length !== capture.metadata.byteLength || packageByteHash(metadata) !== capture.metadata.sha256) fail('workspace-source-mismatch');
    const controls = prepareWorkspaceManifest(capture, options); started = true;
    return await writeCausalArchive(capture, controls, [{ path: 'metadata.am', bytes: metadata }], store, destination, options);
  } catch (error) { if (!started) await destination.abort(error).catch(() => {}); throw error; }
}

/** Shared bounded container writer only; source/base authority belongs to purpose-specific captures. */
export async function writeCausalArchive(capture: Pick<WorkspaceSourceCapture, 'blobs' | 'bodyRefs'>,
  controls: { manifest: Uint8Array; checksum: Uint8Array }, originals: readonly ({ path: string; bytes: Uint8Array } | (Entry & { read: () => Uint8Array }))[],
  store: Pick<OriginBlobStore, 'openReadOnly'>, destination: WritableStream<Uint8Array>, options: WorkspaceArchiveOptions) {
  const cancel = new AbortController(), abort = () => cancel.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  let pipeline: Promise<void> | undefined;
  try {
    checkAbort(options.signal);
    const manifest = controls.manifest.slice(), checksum = controls.checksum.slice(), control = readManifestControl(manifest, checksum);
    if (!['teamWorkspace', 'contribution', 'backup'].includes(control.manifest.purpose)) fail('zip-purpose');
    const source = originals.map(e => {
      if ('bytes' in e) { const bytes = e.bytes.slice(); return { path: e.path, sha256: packageByteHash(bytes), byteLength: bytes.length, read: () => bytes }; }
      return { path: e.path, sha256: e.sha256, byteLength: e.byteLength, read: e.read };
    });
    if (!same(control.entries.slice(2), [...source.map(({ path, sha256, byteLength }) => ({ path, sha256, byteLength })), ...capture.blobs])) fail('zip-source-table');
    const bridge = new TransformStream<Uint8Array, Uint8Array>();
    const hash = new NativeSha256(); let byteLength = 0, chunks = 0, bodyReads = 0, finished = false;
    const output = new TransformStream<Uint8Array, Uint8Array>({ transform(bytes, controller) {
      checkAbort(cancel.signal);
      if (!(bytes instanceof Uint8Array) || bytes.length > L.chunkBytes || ++chunks + bodyReads > L.packageChunks || bytes.length > control.archiveByteLength - byteLength) fail('zip-output-budget');
      hash.update(bytes); byteLength += bytes.length; controller.enqueue(bytes);
    }, flush() { checkAbort(cancel.signal); if (byteLength !== control.archiveByteLength) fail('zip-output-size'); finished = true; } });
    pipeline = bridge.readable.pipeThrough(output).pipeTo(destination, { signal: cancel.signal });
    void pipeline.catch(error => { cancel.abort(error); });
    const writer = new ZipWriter(bridge.writable, zipOptions(cancel.signal));
    for (const { path, bytes } of [{ path: 'manifest.json', bytes: manifest }, { path: 'manifest.sha256', bytes: checksum }]) {
      checkAbort(cancel.signal); await writer.add(path, new Uint8ArrayReader(bytes), zipOptions(cancel.signal)); checkAbort(cancel.signal);
    }
    // Backup loaders provide one owned entry copy at a time, not another aggregate.
    for (const entry of source) {
      checkAbort(cancel.signal); const bytes = entry.read();
      if (bytes.length !== entry.byteLength || packageByteHash(bytes) !== entry.sha256) fail('zip-source-bytes');
      await writer.add(entry.path, new Uint8ArrayReader(bytes), zipOptions(cancel.signal)); checkAbort(cancel.signal);
    }
    const refs = new Map(capture.bodyRefs.map(ref => [ref.digest, ref]));
    const limits = { maxBlobBytes: L.blobBytes, maxChunkBytes: L.chunkBytes, maxChunks: L.streamChunks };
    const charge = () => { if (++bodyReads + chunks > L.packageChunks) fail('zip-read-budget'); };
    for (const entry of capture.blobs) {
      checkAbort(cancel.signal); const ref = refs.get(entry.sha256); if (!ref) fail('workspace-body-ref');
      const file = await store.openReadOnly(ref!, limits); checkAbort(cancel.signal);
      if (file.size !== entry.byteLength) fail('workspace-body-size');
      let verified = false, prefixAt = 0; const prefix = new Uint8Array(4);
      const guard = new TransformStream<Uint8Array, Uint8Array>({ transform(bytes, controller) {
        charge();
        const size = Math.min(4 - prefixAt, bytes.length); prefix.set(bytes.subarray(0, size), prefixAt); prefixAt += size;
        if (prefixAt === 4) rejectNestedZip(prefix); controller.enqueue(bytes);
      } });
      const divided = workspaceInputChunks(file.stream(), cancel.signal, charge);
      const stream = checkedBlobStream(divided, { ...limits, maxChunkBytes: 65_536 }, () => { verified = true; },
        { digest: entry.sha256, byteLength: entry.byteLength }, cancel.signal).pipeThrough(guard);
      try { await writer.add(entry.path, { readable: stream, size: entry.byteLength } as ReadableReader & { size: number }, zipOptions(cancel.signal)); }
      finally { try { await stream.cancel(); } catch { /* Entry codec may still own the stream. */ } }
      if (!verified) fail('workspace-body-incomplete'); checkAbort(cancel.signal);
    }
    checkAbort(cancel.signal); await writer.close(undefined, { zip64: false }); await pipeline; checkAbort(cancel.signal);
    if (!finished) fail('zip-output-incomplete');
    return Object.freeze({ kind: control.manifest.purpose === 'teamWorkspace' ? 'generated-workspace-archive' as const :
      control.manifest.purpose === 'backup' ? 'generated-backup-archive' as const : 'generated-contribution-archive' as const,
      byteLength, sha256: hash.digestHex(), manifest: control.manifest });
  } catch (error) {
    cancel.abort(error);
    if (pipeline) await pipeline.catch(() => {});
    else await destination.abort(error).catch(() => {});
    throw error;
  } finally { options.signal?.removeEventListener('abort', abort); }
}

/** ZIP and complete causal metadata integrity; decoded profiles/publication still require admission. */
export class WorkspaceArchive {
  readonly kind = 'workspace-archive-inspection';
  private constructor(readonly archive: PackageArchive, readonly source: ProjectMetadataSource, readonly blobs: readonly Entry[]) { Object.freeze(this); }
  static async inspect(file: Blob, limits: MetadataLimits, signal?: AbortSignal): Promise<WorkspaceArchive> {
    const archive = await PackageArchive.inspect(file, signal), manifest = archive.control.manifest;
    if (manifest.purpose !== 'teamWorkspace') return fail('workspace-purpose');
    const bytes = await archive.entryBytes('metadata.am', L.sourceBytes, signal);
    const source = ProjectMetadataSource.fromFullSource(bytes, { identity: manifest.identity, envelope: manifest.metadataEnvelope }, packageSourceLimits(limits));
    if (!same(source.heads, manifest.targetHeads)) return fail('workspace-heads');
    const inspection = await source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork }); checkAbort(signal);
    const counts = summarizeFullHistory(inspection); if (counts.hasOpaque) return fail('opaque-inventory-required');
    const closure = planWorkspaceClosure(inspection.candidates);
    if (counts.workUsed + closure.workUsed > L.inspectionWork) return fail('workspace-work-budget');
    if (!same(closure.entries, manifest.blobs)) return fail('workspace-closure');
    if (!same(counts.entityClasses, manifest.summary.entityClasses) || !same(counts.fieldClasses, manifest.summary.fieldClasses)) return fail('workspace-summary');
    return new WorkspaceArchive(archive, source, closure.entries);
  }
}
