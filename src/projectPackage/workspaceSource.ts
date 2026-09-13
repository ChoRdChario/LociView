import type { MetadataProjectSession, MetadataSessionRead } from '../projectMetadata/session';
import { ProjectMetadataSource, type MetadataLimits, type MetadataProof } from '../projectMetadata/source';
import type { OriginBlobStore, StoredBlobRef } from '../projectMetadata/blobStore';
import { checkedBlobStream } from '../projectMetadata/blobStream';
import { PACKAGE_LIMITS as L, SUMMARY_ALGORITHM, type AutomaticSummary, type Entry } from './contract';
import { packageByteHash, PackageControlError } from './manifest';
import { summarizeFullHistory } from './historySummary';
import { planWorkspaceClosure } from './closure';

export function packageSourceLimits(limits: MetadataLimits): MetadataLimits {
  return { ...limits, maxChanges: Math.min(limits.maxChanges, L.changes),
    maxChangeBytes: Math.min(limits.maxChangeBytes, L.changeBytes), maxTotalBytes: Math.min(limits.maxTotalBytes, L.sourceBytes),
    maxOperations: Math.min(limits.maxOperations, L.sourceOperations), maxWork: Math.min(limits.maxWork, L.sourceWork),
    maxNodes: Math.min(limits.maxNodes, L.maxNodes), maxDepth: Math.min(limits.maxDepth, L.maxDepth),
    maxStringScalars: Math.min(limits.maxStringScalars, L.maxStringScalars) };
}

/** Owned capture only: no ZIP artifact, durable job, exchange base or file receipt. */
export class WorkspaceSourceCapture {
  readonly kind = 'workspace-source-capture';
  private constructor(private readonly bytes: Uint8Array, readonly token: string, readonly publication: string,
    readonly proof: MetadataProof, readonly targetHeads: readonly string[], readonly metadata: Entry,
    readonly blobs: readonly Entry[], readonly summary: AutomaticSummary, readonly bodyRefs: readonly StoredBlobRef[]) { Object.freeze(this); }
  metadataBytes(): Uint8Array { return this.bytes.slice(); }

  static async prepare(session: Pick<MetadataProjectSession, 'read'>, expectedToken: string,
    store: Pick<OriginBlobStore, 'openReadOnly'>, limits: MetadataLimits, signal?: AbortSignal): Promise<WorkspaceSourceCapture> {
    const fail = (code: string): never => { throw new PackageControlError(code); };
    const sourceLimits = packageSourceLimits(limits);
    const abort = () => { if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError'); };
    const checked = (read: MetadataSessionRead) => {
      if (read.state !== 'ready' || !read.source || !read.publication || read.source.token !== expectedToken ||
        read.provider?.kind !== 'scene-provider' || read.provider.token !== expectedToken) return fail('workspace-not-ready');
      return { source: read.source, publication: read.publication };
    };
    abort(); const before = checked(await session.read()); abort();
    const bytes = before.source.encodeFullSource();
    if (bytes.length > L.sourceBytes) fail('workspace-source-budget');
    const reopened = ProjectMetadataSource.fromFullSource(bytes, before.source.proof, sourceLimits);
    if (reopened.token !== expectedToken) fail('workspace-source-mismatch');
    // Verify the exact original changes, independently of the full-source encoding.
    const originals = before.source.originalChanges(), restored = reopened.originalChanges();
    const expected = new Map(originals.map(b => [packageByteHash(b), b]));
    if (originals.length !== restored.length || originals.length > L.changes) fail('workspace-source-mismatch');
    for (const part of restored) {
      const prior = expected.get(packageByteHash(part));
      if (!prior || prior.length !== part.length || prior.some((v, i) => v !== part[i])) fail('workspace-source-mismatch');
    }
    const inspection = await reopened.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork }); abort();
    const counts = summarizeFullHistory(inspection);
    if (counts.hasOpaque) fail('opaque-inventory-required');
    const closure = planWorkspaceClosure(inspection.candidates);
    if (counts.workUsed + closure.workUsed > L.inspectionWork) fail('workspace-work-budget');
    const refs = new Map(closure.semanticRefs.map(r => [r.digest, r]));
    const streamLimits = { maxBlobBytes: L.blobBytes, maxChunkBytes: L.chunkBytes, maxChunks: L.streamChunks };
    let reads = 0, measuredBytes = 0;
    for (const entry of closure.entries) {
      abort();
      const file = await store.openReadOnly(refs.get(entry.sha256)!, streamLimits); abort();
      if (file.size !== entry.byteLength) fail('workspace-body-size');
      let verified = false;
      const stream = checkedBlobStream(file.stream(), streamLimits,
        () => { verified = true; }, { digest: entry.sha256, byteLength: entry.byteLength }, signal);
      const reader = stream.getReader();
      try {
        for (;;) {
          abort(); if (++reads > L.packageChunks) fail('workspace-stream-budget');
          const chunk = await reader.read(); abort(); if (chunk.done) break;
          measuredBytes += chunk.value.length; if (measuredBytes > L.blobBytes) fail('workspace-body-budget');
        }
        if (!verified) fail('workspace-body-incomplete');
      } catch (error) { try { await reader.cancel(error); } catch { /* Preserve original failure. */ } throw error; }
      finally { reader.releaseLock(); }
    }
    const after = checked(await session.read()); abort();
    if (after.publication !== before.publication) fail('workspace-publication-changed');
    const metadata = Object.freeze({ path: 'metadata.am', sha256: packageByteHash(bytes), byteLength: bytes.length });
    const summary: AutomaticSummary = Object.freeze({ algorithm: SUMMARY_ALGORITHM, scope: 'entireHistory',
      entityClasses: counts.entityClasses, fieldClasses: counts.fieldClasses, blobEntryCount: closure.entries.length, blobBytes: measuredBytes });
    return new WorkspaceSourceCapture(bytes, expectedToken, before.publication, reopened.proof,
      Object.freeze(reopened.heads), metadata, closure.entries, summary, closure.semanticRefs);
  }
}
