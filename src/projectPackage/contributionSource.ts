import * as A from '@automerge/automerge/slim';
import { capabilityUnion, checkRequiredCapabilities } from '../projectMetadata/requiredCapabilities';
import { canonical } from '../domain/projectGraphSupport';
import type { JsonValue } from '../domain/values';
import type { OriginBlobStore, StoredBlobRef } from '../projectMetadata/blobStore';
import { checkedBlobStream } from '../projectMetadata/blobStream';
import type { MetadataProjectSession, MetadataSessionRead } from '../projectMetadata/session';
import { ProjectMetadataSource, type MetadataLimits, type MetadataProof } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, type AutomaticSummary, type ChangeEntry, type Entry, type PackageManifest } from './contract';
import { packageByteHash, PackageControlError, readManifestControl } from './manifest';
import { summarizeFullHistory } from './historySummary';
import { planWorkspaceClosure } from './closure';
import { packageSourceLimits } from './workspaceSource';
import type { WorkspaceBaseStore } from './workspaceBases';
import { checkAbort } from './zipChecks';
import { PackageArchive } from './zipArchive';

export type ContributionManifest = Extract<PackageManifest, { purpose: 'contribution' }>;
export type ContributionBaseSelection = ContributionManifest['base'];
export { CONTRIBUTION_RECONSTRUCTION } from './contributionEvidence';
import { CONTRIBUTION_RECONSTRUCTION, contributionDelta as delta, contributionTargetView as targetView,
  describeContributionTarget as describeTarget, verifyFrozenBase, verifyContributionEvidence,
  type ContributionBaseProof, type ContributionReconstruction } from './contributionEvidence';
const fail = (code: string): never => { throw new PackageControlError(code); };
const same = (a: unknown, b: unknown) => canonical(a as JsonValue) === canonical(b as JsonValue);
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const reference = (bytes: Uint8Array) => Object.freeze({ sha256: packageByteHash(bytes), byteLength: bytes.length });
type BodyStore = Pick<OriginBlobStore, 'inspect' | 'openReadOnly'>;

/** Exact available local base. No caller-supplied inventory or filename-based selection. */
export class VerifiedContributionBase {
  private constructor(private readonly manifestOriginal: Uint8Array, private readonly metadataOriginal: Uint8Array,
    readonly source: ProjectMetadataSource, readonly selection: ContributionBaseSelection,
    readonly blobs: readonly Entry[], readonly bodyRefs: readonly StoredBlobRef[]) { Object.freeze(this); }
  manifestBytes() { return this.manifestOriginal.slice(); }
  metadataBytes() { return this.metadataOriginal.slice(); }
  proof() { return Object.freeze({ identity: this.source.proof.identity, metadataEnvelope: this.source.proof.envelope,
    workspacePackageId: this.selection.workspacePackageId, workspaceManifestSha256: this.selection.workspaceManifestSha256,
    declaredHeads: this.selection.heads, evidence: Object.freeze({ manifest: reference(this.manifestOriginal), metadata: reference(this.metadataOriginal) }) }); }

  static async select(bases: Pick<WorkspaceBaseStore, 'read' | 'readEvidence'>, selected: ContributionBaseSelection,
    store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits, signal?: AbortSignal) {
    checkAbort(signal);
    // Copy a small closed selection before awaiting mutable caller state.
    if (!selected || Object.keys(selected).sort().join(',') !== 'heads,workspaceManifestSha256,workspacePackageId' ||
      !/^pkg_[0-9a-f]{32}$/.test(selected.workspacePackageId) || !/^[0-9a-f]{64}$/.test(selected.workspaceManifestSha256) ||
      !Array.isArray(selected.heads) || !selected.heads.length || selected.heads.length > L.heads ||
      selected.heads.some(h => typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) ||
      !same(selected.heads, [...new Set(selected.heads)].sort())) return fail('contribution-base-selection');
    const selection = { workspacePackageId: selected.workspacePackageId, workspaceManifestSha256: selected.workspaceManifestSha256, heads: [...selected.heads] };
    const rows = await bases.read(); checkAbort(signal);
    const record = rows.find(r => same({ workspacePackageId: r.workspacePackageId, workspaceManifestSha256: r.workspaceManifestSha256, heads: r.declaredHeads }, selection));
    if (!record) return fail('contribution-base-unavailable');
    const manifestBytes = (await bases.readEvidence(record.evidence.manifest)).slice(); checkAbort(signal);
    const metadataBytes = (await bases.readEvidence(record.evidence.metadata)).slice(); checkAbort(signal);
    const m = readManifestControl(manifestBytes, new TextEncoder().encode(selection.workspaceManifestSha256)).manifest;
    if (m.purpose !== 'teamWorkspace' || m.packageId !== selection.workspacePackageId || !same(m.targetHeads, selection.heads) ||
      !same(m.identity, record.identity) || !same(m.metadataEnvelope, record.metadataEnvelope) ||
      !same(reference(manifestBytes), record.evidence.manifest) || !same(reference(metadataBytes), record.evidence.metadata) ||
      m.metadata.byteLength !== metadataBytes.length || m.metadata.sha256 !== packageByteHash(metadataBytes)) return fail('contribution-base-evidence');
    const source = ProjectMetadataSource.fromFullSource(metadataBytes, { identity: m.identity, envelope: m.metadataEnvelope }, packageSourceLimits(limits));
    checkRequiredCapabilities(m.requiredCapabilities, source.requiredCapabilities);
    if (!same(source.heads, m.targetHeads)) return fail('contribution-base-heads');
    const inspection = await source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork }); checkAbort(signal);
    const counts = summarizeFullHistory(inspection), closure = planWorkspaceClosure(inspection.candidates);
    if (counts.hasOpaque || counts.workUsed + closure.workUsed > L.inspectionWork || !same(closure.entries, m.blobs) ||
      !same(counts.entityClasses, m.summary.entityClasses) || !same(counts.fieldClasses, m.summary.fieldClasses)) return fail('contribution-base-source');
    const base = new VerifiedContributionBase(manifestBytes, metadataBytes, source,
      Object.freeze({ workspacePackageId: m.packageId, workspaceManifestSha256: packageByteHash(manifestBytes), heads: m.targetHeads }), m.blobs, closure.semanticRefs);
    await base.verifyInventory(store, signal); return base;
  }
  /** Frozen journal/job evidence only; fresh admission still uses select(). */
  static async fromFrozenEvidence(proof: ContributionBaseProof, manifest: Uint8Array, metadata: Uint8Array, limits: MetadataLimits) {
    const manifestBytes = manifest.slice(), metadataBytes = metadata.slice();
    const ownedProof = JSON.parse(canonical(proof as unknown as JsonValue)) as ContributionBaseProof;
    const verified = await verifyFrozenBase(ownedProof, manifestBytes, metadataBytes, limits);
    return new VerifiedContributionBase(manifestBytes, metadataBytes, verified.source,
      Object.freeze({ workspacePackageId: verified.manifest.packageId, workspaceManifestSha256: packageByteHash(manifestBytes), heads: verified.manifest.targetHeads }),
      verified.blobs, verified.bodyRefs);
  }
  async verifyInventory(store: Pick<OriginBlobStore, 'inspect'>, signal?: AbortSignal) {
    checkAbort(signal);
    for (const ref of this.bodyRefs) {
      checkAbort(signal); if (await store.inspect(ref) !== 'verified-present') return fail('contribution-base-payload-unavailable'); checkAbort(signal);
    }
    checkAbort(signal);
  }
}

/** Exact original delta capture; no storage mutation, retained-base update or save receipt. */
export class ContributionSourceCapture {
  readonly kind = 'contribution-source-capture';
  private constructor(private readonly bytes: Uint8Array, readonly base: VerifiedContributionBase, readonly target: ProjectMetadataSource, readonly token: string, readonly publication: string | null,
    private readonly originals: readonly Uint8Array[], readonly changes: readonly ChangeEntry[], readonly blobs: readonly Entry[],
    readonly bodyRefs: readonly StoredBlobRef[], readonly summary: AutomaticSummary) { Object.freeze(this); }
  changeBytes(ordinal: number) { const b = this.originals[ordinal]; if (!b) return fail('contribution-ordinal'); return b.slice(); }
  metadataBytes() { return this.bytes.slice(); }
  static async prepare(session: Pick<MetadataProjectSession, 'read'>, expectedToken: string, base: VerifiedContributionBase,
    store: BodyStore, limits: MetadataLimits, signal?: AbortSignal) {
    const ready = (read: MetadataSessionRead) => {
      if (read.state !== 'ready' || !read.source || !read.publication || read.source.token !== expectedToken ||
        read.provider?.kind !== 'scene-provider' || read.provider.token !== expectedToken) return fail('contribution-not-ready');
      return { source: read.source, publication: read.publication };
    };
    checkAbort(signal); const before = ready(await session.read()); checkAbort(signal);
    const result = await this.collect(before.source.encodeFullSource(), before.source.proof, expectedToken, before.publication, base, store, limits, signal);
    const after = ready(await session.read()); checkAbort(signal);
    if (after.publication !== before.publication) fail('contribution-publication-changed');
    return result;
  }
  /** Frozen job originals only; never a live Session readiness assertion. */
  static restore(bytes: Uint8Array, proof: MetadataProof, token: string, base: VerifiedContributionBase,
    store: BodyStore, limits: MetadataLimits, signal?: AbortSignal) {
    return this.collect(bytes.slice(), proof, token, null, base, store, limits, signal);
  }
  private static async collect(bytes: Uint8Array, proof: MetadataProof, expectedToken: string, publication: string | null,
    base: VerifiedContributionBase, store: BodyStore, limits: MetadataLimits, signal?: AbortSignal) {
    checkAbort(signal);
    const bounded = packageSourceLimits(limits), target = ProjectMetadataSource.fromFullSource(bytes, proof, bounded);
    if (target.token !== expectedToken) return fail('contribution-source-mismatch');
    await base.verifyInventory(store, signal);
    const d = delta(base.source, target, bounded), description = await describeTarget(base, target, d.changes, signal);
    const refs = new Map(description.bodyRefs.map(r => [r.digest, r]));
    let reads = 0, measured = 0; const streamLimits = { maxBlobBytes: L.blobBytes, maxChunkBytes: L.chunkBytes, maxChunks: L.streamChunks };
    for (const entry of description.blobs) {
      checkAbort(signal); const file = await store.openReadOnly(refs.get(entry.sha256)!, streamLimits); checkAbort(signal);
      if (file.size !== entry.byteLength) fail('contribution-body-size'); let verified = false;
      const reader = checkedBlobStream(file.stream(), streamLimits, () => { verified = true; },
        { digest: entry.sha256, byteLength: entry.byteLength }, signal).getReader();
      try {
        for (;;) {
          checkAbort(signal); if (++reads > L.packageChunks) fail('contribution-stream-budget');
          const r = await reader.read(); checkAbort(signal); if (r.done) break;
          measured += r.value.length; if (measured > L.blobBytes) fail('contribution-body-budget');
        }
        if (!verified) fail('contribution-body-incomplete');
      } catch (error) { try { await reader.cancel(error); } catch { /* Preserve original error. */ } throw error; }
      finally { reader.releaseLock(); }
    }
    await base.verifyInventory(store, signal); checkAbort(signal);
    return new ContributionSourceCapture(bytes, base, target, expectedToken, publication, d.parts, d.changes,
      description.blobs, description.bodyRefs, description.summary);
  }
}

/** Reconstructed sender target only. Receiver M, profile admission and publication are separate. */
export class ContributionArchive {
  readonly kind = 'contribution-archive-inspection';
  private constructor(readonly archive: PackageArchive, readonly base: VerifiedContributionBase, readonly target: ProjectMetadataSource,
    private readonly originals: readonly Uint8Array[], readonly bodyRefs: readonly StoredBlobRef[], private readonly derived: Uint8Array) { Object.freeze(this); }
  changeBytes(ordinal: number) { const b = this.originals[ordinal]; if (!b) return fail('contribution-ordinal'); return b.slice(); }
  derivedTargetBytes() { return this.derived.slice(); }
  reconstruction(): Readonly<ContributionReconstruction> { return Object.freeze({ kind: 'derivedTargetView', adapterId: CONTRIBUTION_RECONSTRUCTION, targetMetadata: reference(this.derived) }); }
  static async restore(file: Blob, base: VerifiedContributionBase, derived: Uint8Array,
    reconstruction: ContributionReconstruction, store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits) {
    derived = derived.slice(); reconstruction = JSON.parse(canonical(reconstruction as unknown as JsonValue)) as ContributionReconstruction;
    const archive = await PackageArchive.inspect(file), m = archive.control.manifest;
    if (m.purpose !== 'contribution') return fail('contribution-purpose');
    const parts: Uint8Array[] = [];
    for (const entry of m.changes) parts.push(await archive.entryBytes(`changes/${String(entry.ordinal).padStart(8, '0')}.amchange`, limits.maxChangeBytes));
    const verified = await verifyContributionEvidence({ manifestBytes: await archive.entryBytes('manifest.json', L.controlBytes),
      checksumBytes: await archive.entryBytes('manifest.sha256', 64), base: base.proof(), baseManifestBytes: base.manifestBytes(),
      baseMetadataBytes: base.metadataBytes(), wireParts: parts, derivedTargetBytes: derived, reconstruction }, limits);
    await base.verifyInventory(store);
    return new ContributionArchive(archive, base, verified.target, parts, verified.bodyRefs, derived.slice());
  }
  static async inspect(file: Blob, base: VerifiedContributionBase, store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits, signal?: AbortSignal) {
    const archive = await PackageArchive.inspect(file, signal), m = archive.control.manifest;
    if (m.purpose !== 'contribution') return fail('contribution-purpose');
    if (!same(m.base, base.selection) || !same(m.identity, base.source.proof.identity) || !same(m.metadataEnvelope, base.source.proof.envelope)) return fail('contribution-base-mismatch');
    await base.verifyInventory(store, signal); const bounded = packageSourceLimits(limits), parts: Uint8Array[] = []; let size = 0;
    for (const entry of m.changes) {
      const bytes = await archive.entryBytes(`changes/${String(entry.ordinal).padStart(8, '0')}.amchange`, bounded.maxChangeBytes, signal);
      size += bytes.length; if (size > bounded.maxTotalBytes || parts.length >= bounded.maxChanges) fail('contribution-source-budget');
      const c = A.decodeChange(bytes);
      if (c.hash !== entry.expectedChangeHash || !same([...c.deps].sort(), entry.dependencies) || bytes.length !== entry.byteLength ||
        packageByteHash(bytes) !== entry.bytesSha256) fail('contribution-wire-original'); parts.push(bytes);
    }
    const target = targetView(base.source, parts, m.targetHeads, bounded), d = delta(base.source, target, bounded);
    checkRequiredCapabilities(m.requiredCapabilities, capabilityUnion(base.source.requiredCapabilities, target.requiredCapabilities));
    if (!same(d.changes, m.changes) || d.parts.length !== parts.length || parts.some((b, i) => !equal(b, d.parts[i]!))) return fail('contribution-delta-mismatch');
    const description = await describeTarget(base, target, d.changes, signal);
    if (!same(description.blobs, m.blobs) || !same(description.summary, m.summary)) return fail('contribution-summary-closure');
    await base.verifyInventory(store, signal); checkAbort(signal);
    const derived = target.encodeFullSource(), reopened = ProjectMetadataSource.fromFullSource(derived, target.proof, bounded);
    if (reopened.token !== target.token || !same(reopened.originalChanges().map(packageByteHash).sort(), target.originalChanges().map(packageByteHash).sort())) fail('contribution-derived-target');
    return new ContributionArchive(archive, base, target, parts, description.bodyRefs, derived);
  }
}
