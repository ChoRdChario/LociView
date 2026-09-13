import * as A from '@automerge/automerge/slim';
import { canonical } from '../domain/projectGraphSupport';
import type { JsonValue } from '../domain/values';
import type { OriginBlobStore, StoredBlobRef } from '../projectMetadata/blobStore';
import { checkedBlobStream } from '../projectMetadata/blobStream';
import type { MetadataProjectSession, MetadataSessionRead } from '../projectMetadata/session';
import { ProjectMetadataSource, type MetadataLimits } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, SUMMARY_ALGORITHM, type AutomaticSummary, type ChangeEntry, type Entry, type PackageManifest } from './contract';
import { packageByteHash, PackageControlError, readManifestControl } from './manifest';
import { summarizeDeltaHistory, summarizeFullHistory } from './historySummary';
import { planWorkspaceClosure } from './closure';
import { packageSourceLimits } from './workspaceSource';
import type { WorkspaceBaseStore } from './workspaceBases';
import { checkAbort } from './zipChecks';
import { PackageArchive } from './zipArchive';

export type ContributionManifest = Extract<PackageManifest, { purpose: 'contribution' }>;
export type ContributionBaseSelection = ContributionManifest['base'];
export const CONTRIBUTION_RECONSTRUCTION = 'lociview-automerge-3.4.1-reachable-originals-1';
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
    if (!same(source.heads, m.targetHeads)) return fail('contribution-base-heads');
    const inspection = await source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork }); checkAbort(signal);
    const counts = summarizeFullHistory(inspection), closure = planWorkspaceClosure(inspection.candidates);
    if (counts.hasOpaque || counts.workUsed + closure.workUsed > L.inspectionWork || !same(closure.entries, m.blobs) ||
      !same(counts.entityClasses, m.summary.entityClasses) || !same(counts.fieldClasses, m.summary.fieldClasses)) return fail('contribution-base-source');
    const base = new VerifiedContributionBase(manifestBytes, metadataBytes, source,
      Object.freeze({ workspacePackageId: m.packageId, workspaceManifestSha256: packageByteHash(manifestBytes), heads: m.targetHeads }), m.blobs, closure.semanticRefs);
    await base.verifyInventory(store, signal); return base;
  }
  async verifyInventory(store: Pick<OriginBlobStore, 'inspect'>, signal?: AbortSignal) {
    checkAbort(signal);
    for (const ref of this.bodyRefs) {
      checkAbort(signal); if (await store.inspect(ref) !== 'verified-present') return fail('contribution-base-payload-unavailable'); checkAbort(signal);
    }
    checkAbort(signal);
  }
}

function originalIndex(source: ProjectMetadataSource) {
  return new Map(source.originalChanges().map(bytes => { const c = A.decodeChange(bytes); return [c.hash, { bytes, deps: c.deps }] as const; }));
}
/** Wire D uses incremental lexical readiness, not the receiver journal's ready batches. */
function delta(base: ProjectMetadataSource, target: ProjectMetadataSource, limits: MetadataLimits) {
  if (!same(base.proof, target.proof)) return fail('contribution-lineage');
  const known = originalIndex(base), pending = originalIndex(target); let work = 0, dependencies = 0;
  for (const [hash, part] of pending) {
    dependencies += part.deps.length; if (dependencies > L.dependencyReferences) fail('contribution-dependency-budget');
    const prior = known.get(hash); if (!prior) continue;
    if (!equal(prior.bytes, part.bytes)) fail('contribution-original-identity'); pending.delete(hash);
  }
  const parts: Uint8Array[] = [], changes: ChangeEntry[] = [];
  while (pending.size) {
    const ready: string[] = [];
    for (const [hash, part] of pending) {
      work += 1 + part.deps.length; if (work > limits.maxWork) fail('contribution-work-budget');
      if (part.deps.every(dep => known.has(dep))) ready.push(hash);
    }
    const hash = ready.sort()[0]; if (!hash) return fail('contribution-dependencies');
    const part = pending.get(hash)!;
    changes.push(Object.freeze({ ordinal: parts.length, expectedChangeHash: hash, dependencies: Object.freeze([...part.deps].sort()),
      byteLength: part.bytes.length, bytesSha256: packageByteHash(part.bytes) }));
    parts.push(part.bytes); known.set(hash, part); pending.delete(hash);
  }
  return { parts, changes: Object.freeze(changes), workUsed: work };
}
function targetView(base: ProjectMetadataSource, parts: readonly Uint8Array[], heads: readonly string[], limits: MetadataLimits) {
  // The temporary native union may contain container collisions from unrelated
  // branches. Validate the selected sender target, not that temporary domain view.
  const index = originalIndex(base), selected = new Set<string>(), queue = [...heads]; let work = 0;
  for (const bytes of parts) {
    const c = A.decodeChange(bytes), prior = index.get(c.hash);
    work += 1 + c.deps.length; if (work > limits.maxWork) fail('contribution-work-budget');
    if (prior && !equal(prior.bytes, bytes)) fail('contribution-original-identity');
    if (c.deps.some(dep => !index.has(dep))) fail('contribution-dependencies');
    index.set(c.hash, { bytes, deps: c.deps });
  }
  while (queue.length) {
    if (++work > limits.maxWork) fail('contribution-work-budget');
    const hash = queue.pop()!; if (selected.has(hash)) continue;
    const found = index.get(hash); if (!found) return fail('contribution-target-missing');
    selected.add(hash); queue.push(...found.deps);
  }
  const target = ProjectMetadataSource.reopen([...index].filter(([hash]) => selected.has(hash)).map(([, p]) => p.bytes), base.proof, limits);
  if (!same(target.heads, heads)) return fail('contribution-target-heads'); return target;
}
async function describeTarget(base: VerifiedContributionBase, target: ProjectMetadataSource, changes: readonly ChangeEntry[], signal?: AbortSignal) {
  const inspection = await target.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork }); checkAbort(signal);
  const counts = summarizeDeltaHistory(inspection, new Set(changes.map(c => c.expectedChangeHash))), closure = planWorkspaceClosure(inspection.candidates);
  if (counts.hasOpaque || counts.workUsed + closure.workUsed > L.inspectionWork) return fail('contribution-inspection-budget');
  const guaranteed = new Map(base.blobs.map(e => [e.sha256, e.byteLength]));
  const blobs = Object.freeze(closure.entries.filter(e => {
    const prior = guaranteed.get(e.sha256);
    if (prior !== undefined && prior !== e.byteLength) fail('contribution-digest-length'); return prior === undefined;
  }));
  const summary: AutomaticSummary = Object.freeze({ algorithm: SUMMARY_ALGORITHM, scope: 'baseDelta',
    entityClasses: counts.entityClasses, fieldClasses: counts.fieldClasses, blobEntryCount: blobs.length, blobBytes: blobs.reduce((n, e) => n + e.byteLength, 0) });
  return { blobs, bodyRefs: Object.freeze(closure.semanticRefs.filter(r => !guaranteed.has(r.digest))), summary };
}

/** Exact original delta capture; no storage mutation, retained-base update or save receipt. */
export class ContributionSourceCapture {
  readonly kind = 'contribution-source-capture';
  private constructor(readonly base: VerifiedContributionBase, readonly target: ProjectMetadataSource, readonly token: string, readonly publication: string,
    private readonly originals: readonly Uint8Array[], readonly changes: readonly ChangeEntry[], readonly blobs: readonly Entry[],
    readonly bodyRefs: readonly StoredBlobRef[], readonly summary: AutomaticSummary) { Object.freeze(this); }
  changeBytes(ordinal: number) { const b = this.originals[ordinal]; if (!b) return fail('contribution-ordinal'); return b.slice(); }
  static async prepare(session: Pick<MetadataProjectSession, 'read'>, expectedToken: string, base: VerifiedContributionBase,
    store: BodyStore, limits: MetadataLimits, signal?: AbortSignal) {
    const ready = (read: MetadataSessionRead) => {
      if (read.state !== 'ready' || !read.source || !read.publication || read.source.token !== expectedToken ||
        read.provider?.kind !== 'scene-provider' || read.provider.token !== expectedToken) return fail('contribution-not-ready');
      return { source: read.source, publication: read.publication };
    };
    checkAbort(signal); const before = ready(await session.read()); checkAbort(signal);
    await base.verifyInventory(store, signal);
    const bounded = packageSourceLimits(limits), target = ProjectMetadataSource.fromFullSource(before.source.encodeFullSource(), before.source.proof, bounded);
    if (target.token !== expectedToken) return fail('contribution-source-mismatch');
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
    await base.verifyInventory(store, signal); const after = ready(await session.read()); checkAbort(signal);
    if (after.publication !== before.publication) fail('contribution-publication-changed');
    return new ContributionSourceCapture(base, target, expectedToken, before.publication, d.parts, d.changes,
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
  reconstruction() { return Object.freeze({ kind: 'derivedTargetView', adapterId: CONTRIBUTION_RECONSTRUCTION, targetMetadata: reference(this.derived) }); }
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
    if (!same(d.changes, m.changes) || d.parts.length !== parts.length || parts.some((b, i) => !equal(b, d.parts[i]!))) return fail('contribution-delta-mismatch');
    const description = await describeTarget(base, target, d.changes, signal);
    if (!same(description.blobs, m.blobs) || !same(description.summary, m.summary)) return fail('contribution-summary-closure');
    await base.verifyInventory(store, signal); checkAbort(signal);
    const derived = target.encodeFullSource(), reopened = ProjectMetadataSource.fromFullSource(derived, target.proof, bounded);
    if (reopened.token !== target.token || !same(reopened.originalChanges().map(packageByteHash).sort(), target.originalChanges().map(packageByteHash).sort())) fail('contribution-derived-target');
    return new ContributionArchive(archive, base, target, parts, description.bodyRefs, derived);
  }
}
