import { cloneCanonicalValue } from '../domain/values';
import { checkEditorCapability } from './editorAttribution';
import { readManifestControl, packageByteHash, canonicalControl } from '../projectPackage/manifest';
import { PACKAGE_LIMITS, type EvidenceRef } from '../projectPackage/contract';
import { checkedProof, fail, type MetadataLimits, type MetadataProof } from './format';
import { ProjectMetadataSource } from './source';
import { checkRemoteBatch, checkRemoteHeads, type RemoteBatchProof } from './remote';
import { json } from './persistence';
import { CONTRIBUTION_RECONSTRUCTION, contributionOriginals, verifyContributionEvidence,
  type ContributionBaseProof, type ContributionReconstruction, type ContributionEvidenceInput } from '../projectPackage/contributionEvidence';
import type { ChangeEntry } from '../projectPackage/contract';
import { inspectBackupOriginals } from '../projectPackage/backupEvidence';

/** Separate isolated package journal. Never reinterpret a legacy 02 source. */
export interface PackageRemoteBatchProof {
  version: 'lociview-package-remote-1';
  source: { kind: 'fullMetadata'; packageId: string; manifest: EvidenceRef; checksum: EvidenceRef;
    metadata: EvidenceRef; metadataEnvelope: MetadataProof['envelope']; remoteHeads: string[] };
  expectedFinalHeads: string[];
}
export interface ContributionRemoteBatchProof {
  version: 'lociview-package-contribution-1';
  source: { kind: 'contributionDelta'; packageId: string; manifest: EvidenceRef; checksum: EvidenceRef;
    metadataEnvelope: MetadataProof['envelope']; remoteHeads: string[]; base: ContributionBaseProof;
    wireChanges: readonly ChangeEntry[]; reconstruction: ContributionReconstruction };
  expectedFinalHeads: string[];
}
export interface BackupRestoreBatchProof {
  version: 'lociview-package-backup-restore-1';
  source: { kind: 'fullBackup'; packageId: string; manifest: EvidenceRef; checksum: EvidenceRef;
    metadata: EvidenceRef; protectedInventory: EvidenceRef; exchangeBases: EvidenceRef; baseEvidence: EvidenceRef[];
    metadataEnvelope: MetadataProof['envelope']; remoteHeads: string[] };
  expectedFinalHeads: string[];
}
export interface BackupRestoreInput {
  proof: BackupRestoreBatchProof; bytes: Uint8Array; manifestBytes: Uint8Array; checksumBytes: Uint8Array;
  protectedInventoryBytes: Uint8Array; exchangeBasesBytes: Uint8Array; baseEvidenceBytes: Uint8Array[];
}
export type JournalRemoteProof = RemoteBatchProof | PackageRemoteBatchProof | ContributionRemoteBatchProof | BackupRestoreBatchProof;
export interface FullJournalRemoteInput {
  proof: RemoteBatchProof | PackageRemoteBatchProof; bytes: Uint8Array;
  manifestBytes?: Uint8Array; checksumBytes?: Uint8Array;
}
export interface ContributionRemoteInput {
  proof: ContributionRemoteBatchProof; manifestBytes: Uint8Array; checksumBytes: Uint8Array;
  baseManifestBytes: Uint8Array; baseMetadataBytes: Uint8Array; wireParts: readonly Uint8Array[]; derivedTargetBytes: Uint8Array;
}
export type JournalRemoteInput = FullJournalRemoteInput | ContributionRemoteInput | BackupRestoreInput;
export function isPackageRemote(proof: JournalRemoteProof): proof is PackageRemoteBatchProof | ContributionRemoteBatchProof | BackupRestoreBatchProof {
  return !!proof && Object.hasOwn(proof, 'version');
}
export function isContributionRemote(proof: JournalRemoteProof): proof is ContributionRemoteBatchProof {
  return isPackageRemote(proof) && proof.version === 'lociview-package-contribution-1';
}
export function isContributionInput(input: JournalRemoteInput): input is ContributionRemoteInput { return isContributionRemote(input.proof); }
export function isBackupRestore(proof: JournalRemoteProof): proof is BackupRestoreBatchProof {
  return isPackageRemote(proof) && proof.version === 'lociview-package-backup-restore-1';
}
export function isBackupRestoreInput(input: JournalRemoteInput): input is BackupRestoreInput { return isBackupRestore(input.proof); }
function evidence(value: EvidenceRef, max: number): void {
  if (!value || Object.keys(value).sort().join(',') !== 'byteLength,sha256' ||
    typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256) ||
    !Number.isSafeInteger(value.byteLength) || value.byteLength <= 0 || value.byteLength > max) fail('package-remote-evidence');
}
export function checkJournalRemote(remote: JournalRemoteProof, target: MetadataProof, limits: MetadataLimits): void {
  if (!isPackageRemote(remote)) return checkRemoteBatch(remote, target, limits);
  if (isBackupRestore(remote)) {
    if (Object.keys(remote).sort().join(',') !== 'expectedFinalHeads,source,version' || !remote.source ||
      Object.keys(remote.source).sort().join(',') !== 'baseEvidence,checksum,exchangeBases,kind,manifest,metadata,metadataEnvelope,packageId,protectedInventory,remoteHeads') fail('backup-restore-descriptor');
    const s = remote.source;
    if (s.kind !== 'fullBackup' || !/^pkg_[0-9a-f]{32}$/.test(s.packageId) || json(s.metadataEnvelope) !== json(target.envelope)) fail('backup-restore-descriptor');
    for (const r of [s.manifest, s.protectedInventory, s.exchangeBases]) evidence(r, Math.min(PACKAGE_LIMITS.controlBytes, limits.maxTotalBytes));
    evidence(s.metadata, Math.min(PACKAGE_LIMITS.sourceBytes, limits.maxTotalBytes)); evidence(s.checksum, 64);
    checkRemoteHeads(s.remoteHeads); checkRemoteHeads(remote.expectedFinalHeads);
    if (s.checksum.byteLength !== 64 || json(s.remoteHeads) !== json(remote.expectedFinalHeads) ||
      s.remoteHeads.length > Math.min(PACKAGE_LIMITS.heads, limits.maxChanges)) fail('backup-restore-heads');
    if (!Array.isArray(s.baseEvidence) || s.baseEvidence.length > PACKAGE_LIMITS.baseEvidenceCount) fail('backup-restore-evidence');
    let previous = '', bytes = 0;
    for (const r of s.baseEvidence) {
      evidence(r, Math.min(PACKAGE_LIMITS.sourceBytes, limits.maxTotalBytes));
      if (r.sha256 <= previous || (bytes += r.byteLength) > PACKAGE_LIMITS.baseEvidenceBytes) fail('backup-restore-evidence'); previous = r.sha256;
    }
    if (s.manifest.byteLength + 64 + s.protectedInventory.byteLength + s.exchangeBases.byteLength > PACKAGE_LIMITS.controlsBytes) fail('backup-control-budget');
    return;
  }
  if (isContributionRemote(remote)) {
    if (Object.keys(remote).sort().join(',') !== 'expectedFinalHeads,source,version' || !remote.source ||
      Object.keys(remote.source).sort().join(',') !== 'base,checksum,kind,manifest,metadataEnvelope,packageId,reconstruction,remoteHeads,wireChanges') fail('contribution-remote-descriptor');
    const s = remote.source, b = s.base, r = s.reconstruction;
    if (s.kind !== 'contributionDelta' || !/^pkg_[0-9a-f]{32}$/.test(s.packageId) || json(s.metadataEnvelope) !== json(target.envelope) ||
      !b || Object.keys(b).sort().join(',') !== 'declaredHeads,evidence,identity,metadataEnvelope,workspaceManifestSha256,workspacePackageId' ||
      json(b.identity) !== json(target.identity) || json(b.metadataEnvelope) !== json(target.envelope) ||
      !/^pkg_[0-9a-f]{32}$/.test(b.workspacePackageId) || !/^[0-9a-f]{64}$/.test(b.workspaceManifestSha256) ||
      !b.evidence || Object.keys(b.evidence).sort().join(',') !== 'manifest,metadata' ||
      !r || Object.keys(r).sort().join(',') !== 'adapterId,kind,targetMetadata' || r.kind !== 'derivedTargetView' ||
      r.adapterId !== CONTRIBUTION_RECONSTRUCTION) fail('contribution-remote-descriptor');
    evidence(s.manifest, Math.min(PACKAGE_LIMITS.controlBytes, limits.maxTotalBytes)); evidence(s.checksum, 64);
    evidence(b.evidence.manifest, Math.min(PACKAGE_LIMITS.controlBytes, limits.maxTotalBytes));
    evidence(b.evidence.metadata, Math.min(PACKAGE_LIMITS.sourceBytes, limits.maxTotalBytes));
    evidence(r.targetMetadata, Math.min(PACKAGE_LIMITS.sourceBytes, limits.maxTotalBytes));
    if (s.checksum.byteLength !== 64 || b.evidence.manifest.sha256 !== b.workspaceManifestSha256) fail('contribution-remote-descriptor');
    for (const heads of [s.remoteHeads, b.declaredHeads, remote.expectedFinalHeads]) {
      checkRemoteHeads(heads); if (heads.length > Math.min(PACKAGE_LIMITS.heads, limits.maxChanges)) fail('package-remote-head-count');
    }
    if (!Array.isArray(s.wireChanges) || s.wireChanges.length > Math.min(PACKAGE_LIMITS.changes, limits.maxChanges)) fail('contribution-remote-changes');
    let bytes = 0, deps = 0;
    for (const [ordinal, c] of s.wireChanges.entries()) {
      if (!c || Object.keys(c).sort().join(',') !== 'byteLength,bytesSha256,dependencies,expectedChangeHash,ordinal' || c.ordinal !== ordinal ||
        !/^[0-9a-f]{64}$/.test(c.expectedChangeHash)) fail('contribution-remote-changes');
      evidence({ sha256: c.bytesSha256, byteLength: c.byteLength }, Math.min(PACKAGE_LIMITS.changeBytes, limits.maxChangeBytes));
      // Every delta original depends on the retained lineage, never a new root.
      checkRemoteHeads(c.dependencies);
      bytes += c.byteLength; deps += c.dependencies.length;
      if (bytes > Math.min(PACKAGE_LIMITS.sourceBytes, limits.maxTotalBytes) || deps > PACKAGE_LIMITS.dependencyReferences) fail('contribution-remote-budget');
    }
    return;
  }
  if (Object.keys(remote).sort().join(',') !== 'expectedFinalHeads,source,version' || remote.version !== 'lociview-package-remote-1' ||
    !remote.source || Object.keys(remote.source).sort().join(',') !== 'checksum,kind,manifest,metadata,metadataEnvelope,packageId,remoteHeads')
    fail('package-remote-descriptor');
  const s = remote.source;
  if (s.kind !== 'fullMetadata' || typeof s.packageId !== 'string' || !/^pkg_[0-9a-f]{32}$/.test(s.packageId) ||
    json(s.metadataEnvelope) !== json(target.envelope)) fail('package-remote-descriptor');
  evidence(s.manifest, Math.min(PACKAGE_LIMITS.controlBytes, limits.maxTotalBytes));
  evidence(s.metadata, Math.min(PACKAGE_LIMITS.sourceBytes, limits.maxTotalBytes));
  evidence(s.checksum, 64); if (s.checksum.byteLength !== 64) fail('package-remote-checksum');
  checkRemoteHeads(s.remoteHeads); checkRemoteHeads(remote.expectedFinalHeads);
  if (s.remoteHeads.length > Math.min(PACKAGE_LIMITS.heads, limits.maxChanges) ||
    remote.expectedFinalHeads.length > limits.maxChanges) fail('package-remote-head-count');
}
export function remoteMetadata(proof: RemoteBatchProof | PackageRemoteBatchProof | BackupRestoreBatchProof): EvidenceRef {
  return isPackageRemote(proof) ? proof.source.metadata :
    { sha256: proof.source.metadataSha256, byteLength: proof.source.metadataByteLength };
}
function exactBytes(bytes: Uint8Array | undefined, ref: EvidenceRef): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length !== ref.byteLength || packageByteHash(bytes) !== ref.sha256)
    return fail('package-remote-original');
  return bytes;
}

function backupControls(input: BackupRestoreInput, target: MetadataProof, limits: MetadataLimits) {
  checkJournalRemote(input.proof, target, limits);
  if (Object.keys(input).sort().join(',') !== 'baseEvidenceBytes,bytes,checksumBytes,exchangeBasesBytes,manifestBytes,proof,protectedInventoryBytes') fail('backup-restore-input');
  const s = input.proof.source;
  const m = readManifestControl(exactBytes(input.manifestBytes, s.manifest), exactBytes(input.checksumBytes, s.checksum)).manifest;
  const ref = ({ sha256, byteLength }: EvidenceRef) => ({ sha256, byteLength });
  if (m.purpose !== 'backup' || m.packageId !== s.packageId || json(m.identity) !== json(target.identity) || json(m.metadataEnvelope) !== json(target.envelope) ||
    json(m.targetHeads) !== json(s.remoteHeads) || json(ref(m.metadata)) !== json(s.metadata) || json(ref(m.protectedInventory)) !== json(s.protectedInventory) ||
    json(ref(m.exchangeBases)) !== json(s.exchangeBases) || json(m.baseEvidence) !== json(s.baseEvidence)) return fail('backup-restore-manifest');
  exactBytes(input.bytes, s.metadata); exactBytes(input.protectedInventoryBytes, s.protectedInventory); exactBytes(input.exchangeBasesBytes, s.exchangeBases);
  if (!Array.isArray(input.baseEvidenceBytes) || input.baseEvidenceBytes.length !== s.baseEvidence.length) fail('backup-restore-evidence');
  s.baseEvidence.forEach((r, i) => exactBytes(input.baseEvidenceBytes[i], r)); return m;
}
/** Retained metadata/control proof only; body/profile and destination authority remain separate. */
export async function validateBackupRestore(input: BackupRestoreInput, target: MetadataProof, limits: MetadataLimits) {
  const m = backupControls(input, target, limits), s = input.proof.source;
  const source = ProjectMetadataSource.fromFullSource(input.bytes, target, limits);
  if (json(source.heads) !== json(s.remoteHeads)) fail('backup-restore-heads');
  const description = await inspectBackupOriginals(source, input.exchangeBasesBytes,
    s.baseEvidence.map((reference, i) => ({ reference, bytes: input.baseEvidenceBytes[i]! })), limits);
  checkEditorCapability(m.requiredCapabilities, description.includesDeclaredEditorNames);
  if (s.manifest.byteLength + 64 + s.protectedInventory.byteLength + s.exchangeBases.byteLength + description.baseControlBytes > PACKAGE_LIMITS.controlsBytes) fail('backup-control-budget');
  if (json(canonicalControl(input.protectedInventoryBytes)) !== json(description.inventory) || json(m.blobs) !== json(description.blobs) ||
    json(m.summary) !== json(description.summary)) fail('backup-restore-inventory');
  return { source, description };
}

/** Pure source/manifest binding. Does not authorize archive, body, profile or imported-base completion. */
function validateFullJournalRemote(input: FullJournalRemoteInput, target: MetadataProof, limits: MetadataLimits): ProjectMetadataSource {
  checkJournalRemote(input.proof, target, limits);
  const proof = input.proof, source = proof.source;
  const bytes = exactBytes(input.bytes, remoteMetadata(proof));
  if (isPackageRemote(proof)) {
    if (Object.keys(input).sort().join(',') !== 'bytes,checksumBytes,manifestBytes,proof') fail('package-remote-input');
    const s = proof.source, control = readManifestControl(exactBytes(input.manifestBytes, s.manifest), exactBytes(input.checksumBytes, s.checksum));
    const m = control.manifest;
    if (m.purpose !== 'teamWorkspace' || m.packageId !== s.packageId || json(m.identity) !== json(target.identity) ||
      json(m.metadataEnvelope) !== json(target.envelope) || json(m.targetHeads) !== json(s.remoteHeads) ||
      m.metadata.byteLength !== s.metadata.byteLength || m.metadata.sha256 !== s.metadata.sha256) fail('package-remote-manifest');
  } else if (Object.keys(input).sort().join(',') !== 'bytes,proof') fail('remote-input');
  const result = ProjectMetadataSource.fromFullSource(bytes, target, limits);
  if (isPackageRemote(proof)) checkEditorCapability(readManifestControl(input.manifestBytes!, input.checksumBytes!).manifest.requiredCapabilities, result.includesDeclaredEditorNames);
  if (json(result.heads) !== json(source.remoteHeads)) fail('remote-source-heads');
  return result;
}

function contributionEvidence(input: ContributionRemoteInput, target: MetadataProof, limits: MetadataLimits): ContributionEvidenceInput {
  checkJournalRemote(input.proof, target, limits);
  if (Object.keys(input).sort().join(',') !== 'baseManifestBytes,baseMetadataBytes,checksumBytes,derivedTargetBytes,manifestBytes,proof,wireParts') fail('contribution-remote-input');
  const s = input.proof.source;
  const manifest = readManifestControl(exactBytes(input.manifestBytes, s.manifest), exactBytes(input.checksumBytes, s.checksum)).manifest;
  if (manifest.purpose !== 'contribution' || manifest.packageId !== s.packageId || json(manifest.identity) !== json(target.identity) ||
    json(manifest.metadataEnvelope) !== json(target.envelope) || json(manifest.targetHeads) !== json(s.remoteHeads) ||
    json(manifest.changes) !== json(s.wireChanges)) fail('contribution-remote-manifest');
  return { manifestBytes: input.manifestBytes, checksumBytes: input.checksumBytes, base: s.base,
    baseManifestBytes: exactBytes(input.baseManifestBytes, s.base.evidence.manifest),
    baseMetadataBytes: exactBytes(input.baseMetadataBytes, s.base.evidence.metadata), wireParts: input.wireParts,
    derivedTargetBytes: exactBytes(input.derivedTargetBytes, s.reconstruction.targetMetadata), reconstruction: s.reconstruction };
}
export async function validateJournalRemote(input: JournalRemoteInput, target: MetadataProof, limits: MetadataLimits): Promise<ProjectMetadataSource> {
  if (isBackupRestoreInput(input)) return (await validateBackupRestore(input, target, limits)).source;
  if (!isContributionInput(input)) return validateFullJournalRemote(input, target, limits);
  return (await verifyContributionEvidence(contributionEvidence(input, target, limits), limits)).target;
}

/** Capture all originals before any await/write so caller mutation cannot alter a staged transaction. */
export function captureJournalRemote<T extends JournalRemoteInput>(input: T, target: MetadataProof, limits: MetadataLimits): T {
  checkedProof(target, limits);
  if (!input || typeof input !== 'object') return fail('remote-input');
  const proof = cloneCanonicalValue(input.proof, limits) as unknown as JournalRemoteProof;
  checkJournalRemote(proof, target, limits);
  if (isBackupRestoreInput(input) && isBackupRestore(proof)) {
    backupControls(input, target, limits);
    return { proof, bytes: input.bytes.slice(), manifestBytes: input.manifestBytes.slice(), checksumBytes: input.checksumBytes.slice(),
      protectedInventoryBytes: input.protectedInventoryBytes.slice(), exchangeBasesBytes: input.exchangeBasesBytes.slice(),
      baseEvidenceBytes: input.baseEvidenceBytes.map(b => b.slice()) } as T;
  }
  if (isBackupRestoreInput(input) || isBackupRestore(proof)) return fail('backup-restore-input');
  if (isContributionInput(input) && isContributionRemote(proof)) {
    const evidence = contributionEvidence(input, target, limits);
    contributionOriginals(evidence, limits);
    const result: ContributionRemoteInput = { proof, manifestBytes: evidence.manifestBytes.slice(), checksumBytes: evidence.checksumBytes.slice(),
      baseManifestBytes: evidence.baseManifestBytes.slice(), baseMetadataBytes: evidence.baseMetadataBytes.slice(),
      wireParts: evidence.wireParts.map(b => b.slice()), derivedTargetBytes: evidence.derivedTargetBytes.slice() };
    contributionOriginals(contributionEvidence(result, target, limits), limits); return result as T;
  }
  if (isContributionInput(input) || isContributionRemote(proof)) return fail('contribution-remote-input');
  const expected = isPackageRemote(proof) ? 'bytes,checksumBytes,manifestBytes,proof' : 'bytes,proof';
  if (Object.keys(input).sort().join(',') !== expected) fail('remote-input');
  const copy = (bytes: Uint8Array | undefined, ref: EvidenceRef) => {
    if (!(bytes instanceof Uint8Array) || bytes.length !== ref.byteLength) return fail('package-remote-original');
    return bytes.slice();
  };
  const result: FullJournalRemoteInput = { proof, bytes: copy(input.bytes, remoteMetadata(proof)), ...(isPackageRemote(proof) ? {
    manifestBytes: copy(input.manifestBytes, proof.source.manifest), checksumBytes: copy(input.checksumBytes, proof.source.checksum),
  } : {}) };
  validateFullJournalRemote(result, target, limits); return result as T;
}

/** All locations are derived from closed descriptors, never imported paths. */
export function remoteEvidenceDescriptors(proof: JournalRemoteProof): [string, EvidenceRef][] {
  if (isBackupRestore(proof)) {
    const s = proof.source;
    return [['source-manifest.json', s.manifest], ['source-manifest.sha256', s.checksum], ['source-metadata.am', s.metadata],
      ['source-protected-inventory.json', s.protectedInventory], ['source-exchange-bases.json', s.exchangeBases],
      ...s.baseEvidence.map(r => [`base-evidence/${r.sha256}`, r] as [string, EvidenceRef])];
  }
  if (isContributionRemote(proof)) {
    const s = proof.source;
    return [['source-manifest.json', s.manifest], ['source-manifest.sha256', s.checksum],
      [`base-evidence/${s.base.evidence.manifest.sha256}`, s.base.evidence.manifest],
      [`base-evidence/${s.base.evidence.metadata.sha256}`, s.base.evidence.metadata],
      ['derived-target-metadata.am', s.reconstruction.targetMetadata],
      ...s.wireChanges.map(c => [`wire-changes/${String(c.ordinal).padStart(8, '0')}.amchange`, { sha256: c.bytesSha256, byteLength: c.byteLength }] as [string, EvidenceRef])];
  }
  return [...(isPackageRemote(proof) ? [['source-manifest.json', proof.source.manifest], ['source-manifest.sha256', proof.source.checksum]] as [string, EvidenceRef][] : []),
    ['source-metadata.am', remoteMetadata(proof)]];
}
export function remoteEvidenceBytes(input: JournalRemoteInput): [string, Uint8Array][] {
  if (isBackupRestoreInput(input)) return [['source-manifest.json', input.manifestBytes], ['source-manifest.sha256', input.checksumBytes],
    ['source-metadata.am', input.bytes], ['source-protected-inventory.json', input.protectedInventoryBytes], ['source-exchange-bases.json', input.exchangeBasesBytes],
    ...input.proof.source.baseEvidence.map((r, i) => [`base-evidence/${r.sha256}`, input.baseEvidenceBytes[i]!] as [string, Uint8Array])];
  if (isContributionInput(input)) {
    const s = input.proof.source;
    return [['source-manifest.json', input.manifestBytes], ['source-manifest.sha256', input.checksumBytes],
      [`base-evidence/${s.base.evidence.manifest.sha256}`, input.baseManifestBytes],
      [`base-evidence/${s.base.evidence.metadata.sha256}`, input.baseMetadataBytes],
      ['derived-target-metadata.am', input.derivedTargetBytes],
      ...input.wireParts.map((b, i) => [`wire-changes/${String(i).padStart(8, '0')}.amchange`, b] as [string, Uint8Array])];
  }
  return [...(isPackageRemote(input.proof) ? [['source-manifest.json', input.manifestBytes!], ['source-manifest.sha256', input.checksumBytes!]] as [string, Uint8Array][] : []),
    ['source-metadata.am', input.bytes]];
}
export function remoteInputFromEvidence(proof: JournalRemoteProof, bytes: ReadonlyMap<string, Uint8Array>): JournalRemoteInput {
  if (isBackupRestore(proof)) return { proof, bytes: bytes.get('source-metadata.am')!, manifestBytes: bytes.get('source-manifest.json')!,
    checksumBytes: bytes.get('source-manifest.sha256')!, protectedInventoryBytes: bytes.get('source-protected-inventory.json')!,
    exchangeBasesBytes: bytes.get('source-exchange-bases.json')!, baseEvidenceBytes: proof.source.baseEvidence.map(r => bytes.get(`base-evidence/${r.sha256}`)!) };
  if (isContributionRemote(proof)) return { proof, manifestBytes: bytes.get('source-manifest.json')!, checksumBytes: bytes.get('source-manifest.sha256')!,
    baseManifestBytes: bytes.get(`base-evidence/${proof.source.base.evidence.manifest.sha256}`)!,
    baseMetadataBytes: bytes.get(`base-evidence/${proof.source.base.evidence.metadata.sha256}`)!, derivedTargetBytes: bytes.get('derived-target-metadata.am')!,
    wireParts: proof.source.wireChanges.map(c => bytes.get(`wire-changes/${String(c.ordinal).padStart(8, '0')}.amchange`)! ) };
  return { proof, bytes: bytes.get('source-metadata.am')!, ...(isPackageRemote(proof) ? {
    manifestBytes: bytes.get('source-manifest.json')!, checksumBytes: bytes.get('source-manifest.sha256')!,
  } : {}) };
}
