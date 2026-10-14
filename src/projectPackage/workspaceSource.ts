import type { MetadataProjectSession, MetadataSessionRead } from '../projectMetadata/session';
import { ProjectMetadataSource, type MetadataLimits, type MetadataProof } from '../projectMetadata/source';
import type { OriginBlobStore, StoredBlobRef } from '../projectMetadata/blobStore';
import { checkedBlobStream } from '../projectMetadata/blobStream';
import { PACKAGE_LIMITS as L, summaryAlgorithm, type AutomaticSummary, type Entry } from './contract';
import { packageByteHash, PackageControlError } from './manifest';
import { summarizeFullHistory } from './historySummary';
import { planWorkspaceClosure } from './closure';

export { packageSourceLimits } from './contributionEvidence';
import { packageSourceLimits } from './contributionEvidence';

/** Owned capture only: no ZIP artifact, durable job, exchange base or file receipt. */
export class WorkspaceSourceCapture {
  readonly kind = 'workspace-source-capture';
  private constructor(private readonly bytes: Uint8Array, readonly token: string, readonly publication: string | null,
    readonly proof: MetadataProof, readonly targetHeads: readonly string[], readonly metadata: Entry,
    readonly blobs: readonly Entry[], readonly summary: AutomaticSummary, readonly bodyRefs: readonly StoredBlobRef[]) { Object.freeze(this); }
  metadataBytes(): Uint8Array { return this.bytes.slice(); }

  static async prepare(session: Pick<MetadataProjectSession, 'read'>, expectedToken: string,
    store: Pick<OriginBlobStore, 'openReadOnly'>, limits: MetadataLimits, signal?: AbortSignal): Promise<WorkspaceSourceCapture> {
    const fail = (code: string): never => { throw new PackageControlError(code); };
    const abort = () => { if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError'); };
    const checked = (read: MetadataSessionRead) => {
      if (read.state !== 'ready' || !read.source || !read.publication || read.source.token !== expectedToken ||
        read.provider?.kind !== 'scene-provider' || read.provider.token !== expectedToken) return fail('workspace-not-ready');
      return { source: read.source, publication: read.publication };
    };
    abort(); const before = checked(await session.read()); abort();
    const bytes = before.source.encodeFullSource();
    const result = await this.collect(bytes, before.source.proof, expectedToken, before.publication, store, limits, signal, before.source.originalChanges());
    const after = checked(await session.read()); abort();
    if (after.publication !== before.publication) fail('workspace-publication-changed');
    return result;
  }

  /** Retained job originals only; this does not assert current Session/publication readiness. */
  static restore(bytes: Uint8Array, proof: MetadataProof, token: string, store: Pick<OriginBlobStore, 'openReadOnly'>,
    limits: MetadataLimits, signal?: AbortSignal) {
    return this.collect(bytes.slice(), proof, token, null, store, limits, signal);
  }
  private static async collect(bytes: Uint8Array, proof: MetadataProof, expectedToken: string, publication: string | null,
    store: Pick<OriginBlobStore, 'openReadOnly'>, limits: MetadataLimits, signal?: AbortSignal, originalInput?: readonly Uint8Array[]) {
    const fail = (code: string): never => { throw new PackageControlError(code); };
    const abort = () => { if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError'); };
    abort(); const sourceLimits = packageSourceLimits(limits);
    if (bytes.length > L.sourceBytes) fail('workspace-source-budget');
    const reopened = ProjectMetadataSource.fromFullSource(bytes, proof, sourceLimits);
    if (reopened.token !== expectedToken) fail('workspace-source-mismatch');
    // Verify the exact original changes, independently of the full-source encoding.
    const originals = originalInput ?? reopened.originalChanges(), restored = reopened.originalChanges();
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
    const metadata = Object.freeze({ path: 'metadata.am', sha256: packageByteHash(bytes), byteLength: bytes.length });
    const summary: AutomaticSummary = Object.freeze({ algorithm: summaryAlgorithm(reopened.semanticProfile), scope: 'entireHistory',
      entityClasses: counts.entityClasses, fieldClasses: counts.fieldClasses, blobEntryCount: closure.entries.length, blobBytes: measuredBytes });
    return new WorkspaceSourceCapture(bytes, expectedToken, publication, reopened.proof,
      Object.freeze(reopened.heads), metadata, closure.entries, summary, closure.semanticRefs);
  }
}
