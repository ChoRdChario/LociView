import * as A from '@automerge/automerge/slim';
import { canonical } from '../domain/projectGraphSupport';
import type { JsonValue } from '../domain/values';
import { ProjectMetadataSource, type MetadataLimits, type MetadataProof } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, SUMMARY_ALGORITHM, type AutomaticSummary, type ChangeEntry, type Entry, type EvidenceRef, type PackageManifest } from './contract';
import { packageByteHash, PackageControlError, readManifestControl } from './manifest';
import { summarizeDeltaHistory, summarizeFullHistory } from './historySummary';
import { planWorkspaceClosure } from './closure';

export const CONTRIBUTION_RECONSTRUCTION = 'lociview-automerge-3.4.1-reachable-originals-1';
export interface ContributionBaseProof {
  identity: MetadataProof['identity']; metadataEnvelope: MetadataProof['envelope'];
  workspacePackageId: string; workspaceManifestSha256: string; declaredHeads: readonly string[];
  evidence: { manifest: EvidenceRef; metadata: EvidenceRef };
}
export interface ContributionReconstruction {
  kind: 'derivedTargetView'; adapterId: typeof CONTRIBUTION_RECONSTRUCTION; targetMetadata: EvidenceRef;
}
export interface VerifiedBaseEvidence { source: ProjectMetadataSource; blobs: readonly Entry[] }
const fail = (code: string): never => { throw new PackageControlError(code); };
const same = (a: unknown, b: unknown) => canonical(a as JsonValue) === canonical(b as JsonValue);
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const reference = (bytes: Uint8Array) => ({ sha256: packageByteHash(bytes), byteLength: bytes.length });
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError'); };

export function packageSourceLimits(limits: MetadataLimits): MetadataLimits {
  return { ...limits, maxChanges: Math.min(limits.maxChanges, L.changes),
    maxChangeBytes: Math.min(limits.maxChangeBytes, L.changeBytes), maxTotalBytes: Math.min(limits.maxTotalBytes, L.sourceBytes),
    maxOperations: Math.min(limits.maxOperations, L.sourceOperations), maxWork: Math.min(limits.maxWork, L.sourceWork),
    maxNodes: Math.min(limits.maxNodes, L.maxNodes), maxDepth: Math.min(limits.maxDepth, L.maxDepth),
    maxStringScalars: Math.min(limits.maxStringScalars, L.maxStringScalars) };
}


function originalIndex(source: ProjectMetadataSource) {
  return new Map(source.originalChanges().map(bytes => { const c = A.decodeChange(bytes); return [c.hash, { bytes, deps: c.deps }] as const; }));
}
/** Wire D uses incremental lexical readiness, not the receiver journal's ready batches. */
export function contributionDelta(base: ProjectMetadataSource, target: ProjectMetadataSource, limits: MetadataLimits) {
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
export function contributionTargetView(base: ProjectMetadataSource, parts: readonly Uint8Array[], heads: readonly string[], limits: MetadataLimits) {
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
export async function describeContributionTarget(base: VerifiedBaseEvidence, target: ProjectMetadataSource, changes: readonly ChangeEntry[], signal?: AbortSignal) {
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


export function frozenBaseSource(proof: ContributionBaseProof, manifestBytes: Uint8Array, metadataBytes: Uint8Array, limits: MetadataLimits) {
  if (!proof || Object.keys(proof).sort().join(',') !== 'declaredHeads,evidence,identity,metadataEnvelope,workspaceManifestSha256,workspacePackageId' ||
    !proof.evidence || Object.keys(proof.evidence).sort().join(',') !== 'manifest,metadata' ||
    !same(reference(manifestBytes), proof.evidence.manifest) || !same(reference(metadataBytes), proof.evidence.metadata)) fail('contribution-base-evidence');
  const m = readManifestControl(manifestBytes, new TextEncoder().encode(proof.workspaceManifestSha256)).manifest;
  if (m.purpose !== 'teamWorkspace' || m.packageId !== proof.workspacePackageId || !same(m.targetHeads, proof.declaredHeads) ||
    !same(m.identity, proof.identity) || !same(m.metadataEnvelope, proof.metadataEnvelope) ||
    m.metadata.byteLength !== metadataBytes.length || m.metadata.sha256 !== packageByteHash(metadataBytes)) return fail('contribution-base-evidence');
  const source = ProjectMetadataSource.fromFullSource(metadataBytes, { identity: m.identity, envelope: m.metadataEnvelope }, packageSourceLimits(limits));
  if (!same(source.heads, m.targetHeads)) fail('contribution-base-heads');
  return { source, manifest: m, blobs: m.blobs };
}
export async function verifyFrozenBase(proof: ContributionBaseProof, manifestBytes: Uint8Array, metadataBytes: Uint8Array, limits: MetadataLimits) {
  const base = frozenBaseSource(proof, manifestBytes, metadataBytes, limits);
  const inspection = await base.source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork });
  const counts = summarizeFullHistory(inspection), closure = planWorkspaceClosure(inspection.candidates), m = base.manifest;
  if (counts.hasOpaque || counts.workUsed + closure.workUsed > L.inspectionWork || !same(closure.entries, m.blobs) ||
    !same(counts.entityClasses, m.summary.entityClasses) || !same(counts.fieldClasses, m.summary.fieldClasses)) fail('contribution-base-source');
  return { ...base, bodyRefs: closure.semanticRefs };
}
export interface ContributionEvidenceInput {
  manifestBytes: Uint8Array; checksumBytes: Uint8Array; base: ContributionBaseProof;
  baseManifestBytes: Uint8Array; baseMetadataBytes: Uint8Array; wireParts: readonly Uint8Array[];
  derivedTargetBytes: Uint8Array; reconstruction: ContributionReconstruction;
}
/** Pure exact original binding. No archive, CAS, storage, Session or base-table lookup. */
export function contributionOriginals(input: ContributionEvidenceInput, limits: MetadataLimits) {
  const m = readManifestControl(input.manifestBytes, input.checksumBytes).manifest;
  const base = frozenBaseSource(input.base, input.baseManifestBytes, input.baseMetadataBytes, limits), bounded = packageSourceLimits(limits);
  if (m.purpose !== 'contribution' || !same(m.identity, base.source.proof.identity) || !same(m.metadataEnvelope, base.source.proof.envelope) ||
    !same(m.base, { workspacePackageId: input.base.workspacePackageId, workspaceManifestSha256: input.base.workspaceManifestSha256, heads: input.base.declaredHeads }))
    return fail('contribution-base-mismatch');
  if (!Array.isArray(input.wireParts) || input.wireParts.length !== m.changes.length ||
    input.wireParts.length > bounded.maxChanges) fail('contribution-wire-original');
  let size = 0;
  for (const [i, b] of input.wireParts.entries()) {
    const d = m.changes[i]!;
    if (!(b instanceof Uint8Array) || !b.length || b.length > bounded.maxChangeBytes ||
      (size += b.length) > bounded.maxTotalBytes || b.length !== d.byteLength || packageByteHash(b) !== d.bytesSha256) fail('contribution-wire-original');
    const c = A.decodeChange(b);
    if (c.hash !== d.expectedChangeHash || !same([...c.deps].sort(), d.dependencies)) fail('contribution-wire-original');
  }
  const target = contributionTargetView(base.source, input.wireParts, m.targetHeads, bounded), d = contributionDelta(base.source, target, bounded);
  if (!same(d.changes, m.changes) || d.parts.some((b, i) => !equal(b, input.wireParts[i]!))) fail('contribution-delta-mismatch');
  const reconstruction = input.reconstruction;
  if (!reconstruction || !same(reconstruction, { kind: 'derivedTargetView', adapterId: CONTRIBUTION_RECONSTRUCTION,
    targetMetadata: reference(input.derivedTargetBytes) })) fail('contribution-derived-descriptor');
  const saved = ProjectMetadataSource.fromFullSource(input.derivedTargetBytes, target.proof, bounded);
  if (!same(saved.heads, target.heads) || !same(saved.originalChanges().map(packageByteHash).sort(), target.originalChanges().map(packageByteHash).sort())) fail('contribution-derived-target');
  return { base, target: saved, manifest: m };
}
export async function verifyContributionEvidence(input: ContributionEvidenceInput, limits: MetadataLimits) {
  const verified = contributionOriginals(input, limits);
  await verifyFrozenBase(input.base, input.baseManifestBytes, input.baseMetadataBytes, limits);
  const description = await describeContributionTarget(verified.base, verified.target, verified.manifest.changes);
  if (!same(description.blobs, verified.manifest.blobs) || !same(description.summary, verified.manifest.summary)) fail('contribution-summary-closure');
  return { ...verified, bodyRefs: description.bodyRefs };
}
/** A retained base is usable only if every original already belongs to receiver R. */
export function assertContributionBaseInReceiver(base: ProjectMetadataSource, receiver: ProjectMetadataSource) {
  if (!same(base.proof, receiver.proof)) fail('contribution-lineage');
  const index = originalIndex(receiver);
  for (const [hash, original] of originalIndex(base)) {
    const found = index.get(hash); if (!found || !equal(original.bytes, found.bytes)) fail('contribution-receiver-base-missing');
  }
}
