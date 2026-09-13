import { cloneCanonicalValue } from '../domain/values';
import { readManifestControl, packageByteHash } from '../projectPackage/manifest';
import { PACKAGE_LIMITS, type EvidenceRef } from '../projectPackage/contract';
import { checkedProof, fail, type MetadataLimits, type MetadataProof } from './format';
import { ProjectMetadataSource } from './source';
import { checkRemoteBatch, checkRemoteHeads, type RemoteBatchProof } from './remote';
import { json } from './persistence';

/** Separate isolated package journal. Never reinterpret a legacy 02 source. */
export interface PackageRemoteBatchProof {
  version: 'lociview-package-remote-1';
  source: { kind: 'fullMetadata'; packageId: string; manifest: EvidenceRef; checksum: EvidenceRef;
    metadata: EvidenceRef; metadataEnvelope: MetadataProof['envelope']; remoteHeads: string[] };
  expectedFinalHeads: string[];
}
export type JournalRemoteProof = RemoteBatchProof | PackageRemoteBatchProof;
export interface JournalRemoteInput {
  proof: JournalRemoteProof; bytes: Uint8Array;
  manifestBytes?: Uint8Array; checksumBytes?: Uint8Array;
}
export function isPackageRemote(proof: JournalRemoteProof): proof is PackageRemoteBatchProof {
  return !!proof && Object.hasOwn(proof, 'version');
}
function evidence(value: EvidenceRef, max: number): void {
  if (!value || Object.keys(value).sort().join(',') !== 'byteLength,sha256' ||
    typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256) ||
    !Number.isSafeInteger(value.byteLength) || value.byteLength <= 0 || value.byteLength > max) fail('package-remote-evidence');
}
export function checkJournalRemote(remote: JournalRemoteProof, target: MetadataProof, limits: MetadataLimits): void {
  if (!isPackageRemote(remote)) return checkRemoteBatch(remote, target, limits);
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
export function remoteMetadata(proof: JournalRemoteProof): EvidenceRef {
  return isPackageRemote(proof) ? proof.source.metadata :
    { sha256: proof.source.metadataSha256, byteLength: proof.source.metadataByteLength };
}
function exactBytes(bytes: Uint8Array | undefined, ref: EvidenceRef): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length !== ref.byteLength || packageByteHash(bytes) !== ref.sha256)
    return fail('package-remote-original');
  return bytes;
}

/** Pure source/manifest binding. Does not authorize archive, body, profile or imported-base completion. */
export function validateJournalRemote(input: JournalRemoteInput, target: MetadataProof, limits: MetadataLimits): ProjectMetadataSource {
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
  if (json(result.heads) !== json(source.remoteHeads)) fail('remote-source-heads');
  return result;
}

/** Capture all originals before any await/write so caller mutation cannot alter a staged transaction. */
export function captureJournalRemote(input: JournalRemoteInput, target: MetadataProof, limits: MetadataLimits): JournalRemoteInput {
  checkedProof(target, limits);
  if (!input || typeof input !== 'object') return fail('remote-input');
  const proof = cloneCanonicalValue(input.proof, limits) as unknown as JournalRemoteProof;
  checkJournalRemote(proof, target, limits);
  const expected = isPackageRemote(proof) ? 'bytes,checksumBytes,manifestBytes,proof' : 'bytes,proof';
  if (Object.keys(input).sort().join(',') !== expected) fail('remote-input');
  const copy = (bytes: Uint8Array | undefined, ref: EvidenceRef) => {
    if (!(bytes instanceof Uint8Array) || bytes.length !== ref.byteLength) return fail('package-remote-original');
    return bytes.slice();
  };
  const result: JournalRemoteInput = { proof, bytes: copy(input.bytes, remoteMetadata(proof)), ...(isPackageRemote(proof) ? {
    manifestBytes: copy(input.manifestBytes, proof.source.manifest), checksumBytes: copy(input.checksumBytes, proof.source.checksum),
  } : {}) };
  validateJournalRemote(result, target, limits); return result;
}
