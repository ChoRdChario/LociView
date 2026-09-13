import type { MetadataProjectSession, MetadataSessionRead } from '../projectMetadata/session';
import { ProjectMetadataSource, type MetadataLimits, type MetadataProof } from '../projectMetadata/source';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { checkedBlobStream } from '../projectMetadata/blobStream';
import type { WorkspaceBaseStore } from './workspaceBases';
import { PACKAGE_LIMITS as L } from './contract';
import { packageByteHash, PackageControlError } from './manifest';
import { packageSourceLimits } from './contributionEvidence';
import { backupEncode, backupEvidenceRefs, readBackupBases, inspectBackupOriginals, type BackupEvidenceBytes } from './backupEvidence';
import { workspaceInputChunks } from './workspaceArchive';
import { checkAbort } from './zipChecks';

const fail = (code: string): never => { throw new PackageControlError(code); };
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
type Description = Awaited<ReturnType<typeof inspectBackupOriginals>>;
/** Owned original backup. No live-job authority, file save or replacement receipt. */
export class BackupSourceCapture {
  readonly kind = 'backup-source-capture';
  private constructor(private readonly bytes: Uint8Array, private readonly tableBytes: Uint8Array,
    private readonly evidence: readonly BackupEvidenceBytes[], readonly source: ProjectMetadataSource,
    readonly publication: string | null, readonly description: Description) { Object.freeze(this); }
  get token() { return this.source.token; }
  get proof() { return this.source.proof; }
  get targetHeads() { return this.source.heads; }
  get blobs() { return this.description.blobs; }
  get bodyRefs() { return this.description.bodyRefs; }
  get summary() { return this.description.summary; }
  /** Descriptors/loaders keep the writer from cloning the whole original set again. */
  originals() {
    const fixed = [{ path: 'metadata.am', bytes: this.bytes },
      { path: 'protected-inventory.json', bytes: backupEncode(this.description.inventory) },
      { path: 'exchange-bases.json', bytes: this.tableBytes },
      ...this.evidence.map(e => ({ path: `base-evidence/sha256/${e.reference.sha256}`, bytes: e.bytes }))];
    return fixed.map(e => Object.freeze({ path: e.path, byteLength: e.bytes.length, sha256: packageByteHash(e.bytes), read: () => e.bytes.slice() }));
  }
  static async prepare(session: Pick<MetadataProjectSession, 'read'>, expectedToken: string,
    bases: Pick<WorkspaceBaseStore, 'snapshot' | 'readEvidence'>, store: Pick<OriginBlobStore, 'openReadOnly'>,
    limits: MetadataLimits, signal?: AbortSignal) {
    const ready = (read: MetadataSessionRead) => {
      if (read.state !== 'ready' || !read.source || !read.publication || read.source.token !== expectedToken ||
        read.provider?.kind !== 'scene-provider' || read.provider.token !== expectedToken) return fail('backup-not-ready');
      return { source: read.source, publication: read.publication };
    };
    checkAbort(signal); const before = ready(await session.read()); checkAbort(signal);
    const bytes = before.source.encodeFullSource(), source = ProjectMetadataSource.fromFullSource(bytes, before.source.proof, packageSourceLimits(limits));
    const tableBytes = backupEncode(await bases.snapshot()); checkAbort(signal);
    const { table } = readBackupBases(tableBytes, source.proof), evidence: BackupEvidenceBytes[] = [];
    for (const reference of backupEvidenceRefs(table)) {
      evidence.push({ reference, bytes: (await bases.readEvidence(reference)).slice() }); checkAbort(signal);
    }
    const result = await this.collect(bytes, source, tableBytes, evidence, before.publication, store, limits, signal);
    if (!equal(tableBytes, backupEncode(await bases.snapshot()))) fail('backup-bases-changed');
    const after = ready(await session.read()); checkAbort(signal);
    if (before.publication !== after.publication) fail('backup-publication-changed'); return result;
  }
  /** Caller originals copied before the first await. No current Session assertion. */
  static restore(bytes: Uint8Array, proof: MetadataProof, token: string, tableBytes: Uint8Array,
    evidence: readonly BackupEvidenceBytes[], store: Pick<OriginBlobStore, 'openReadOnly'>, limits: MetadataLimits, signal?: AbortSignal) {
    checkAbort(signal);
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > Math.min(limits.maxTotalBytes, L.sourceBytes) ||
      !(tableBytes instanceof Uint8Array) || !tableBytes.length || tableBytes.length > L.controlBytes ||
      !Array.isArray(evidence) || evidence.length > L.baseEvidenceCount) return fail('backup-original-budget');
    const owned = bytes.slice(), source = ProjectMetadataSource.fromFullSource(owned, proof, packageSourceLimits(limits));
    if (source.token !== token) return fail('backup-source-mismatch');
    // Validate finite declarations before cloning any evidence buffer.
    const table = tableBytes.slice(), refs = backupEvidenceRefs(readBackupBases(table, source.proof).table);
    if (evidence.length !== refs.length) return fail('backup-evidence-union');
    if (!equal(backupEncode(evidence.map(e => e.reference)), backupEncode(refs))) return fail('backup-evidence-union');
    const copies = evidence.map((e, i) => { if (!(e.bytes instanceof Uint8Array) || e.bytes.length !== refs[i]!.byteLength) return fail('backup-evidence-size');
      return { reference: refs[i]!, bytes: e.bytes.slice() }; });
    return this.collect(owned, source, table, copies, null, store, limits, signal);
  }
  private static async collect(bytes: Uint8Array, source: ProjectMetadataSource, table: Uint8Array, evidence: readonly BackupEvidenceBytes[],
    publication: string | null, store: Pick<OriginBlobStore, 'openReadOnly'>, limits: MetadataLimits, signal?: AbortSignal) {
    const description = await inspectBackupOriginals(source, table, evidence, limits, signal);
    const refs = new Map(description.bodyRefs.map(r => [r.digest, r]));
    const streamLimits = { maxBlobBytes: L.blobBytes, maxChunkBytes: 65_536, maxChunks: L.streamChunks };
    const cancellation = signal ?? new AbortController().signal; let reads = 0;
    const charge = () => { if (++reads > L.packageChunks) fail('backup-stream-budget'); };
    for (const entry of description.blobs) {
      checkAbort(signal); const file = await store.openReadOnly(refs.get(entry.sha256)!, { ...streamLimits, maxChunkBytes: L.chunkBytes }); checkAbort(signal);
      if (file.size !== entry.byteLength) fail('backup-body-size'); let verified = false;
      const reader = checkedBlobStream(workspaceInputChunks(file.stream(), cancellation, charge), streamLimits, () => { verified = true; },
        { digest: entry.sha256, byteLength: entry.byteLength }, signal).getReader();
      try { for (;;) { checkAbort(signal); charge(); const r = await reader.read(); checkAbort(signal); if (r.done) break; }
        if (!verified) fail('backup-body-incomplete');
      } catch (error) { try { await reader.cancel(error); } catch { /* Original failure wins. */ } throw error; }
      finally { reader.releaseLock(); }
    }
    checkAbort(signal); return new BackupSourceCapture(bytes, table, evidence, source, publication, description);
  }
}
