import * as A from '@automerge/automerge/slim';
import { cloneCanonicalValue } from '../domain/values';
import { checkedProof, fail, type MetadataLimits, type MetadataProof } from './format';
import { ProjectMetadataSource } from './source';
import { equalBytes, json } from './persistence';

/** Internal complete-source input only. No delta, package decoder or blob introduction. */
export interface FullMetadataSource {
  packageId: string;
  metadataBytes: Uint8Array;
  proof: MetadataProof;
  remoteHeads: readonly string[];
}
export interface RemoteBatchProof {
  source: { packageId: string; metadataSha256: string; metadataByteLength: number;
    metadataEnvelope: MetadataProof['envelope']; remoteHeads: string[] };
  expectedFinalHeads: string[];
}
export function checkRemoteHeads(heads: unknown): asserts heads is string[] {
  if (!Array.isArray(heads) || !heads.length || heads.some(h => typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) ||
    json(heads) !== json([...new Set(heads)].sort())) fail('remote-heads');
}
export function copyFullSource(input: FullMetadataSource, limits: MetadataLimits): FullMetadataSource {
  if (!input || Object.keys(input).sort().join(',') !== 'metadataBytes,packageId,proof,remoteHeads' ||
    !(input.metadataBytes instanceof Uint8Array) || !input.metadataBytes.length || input.metadataBytes.length > limits.maxTotalBytes)
    fail('full-source-input');
  const descriptor = cloneCanonicalValue({ packageId: input.packageId, proof: input.proof, remoteHeads: input.remoteHeads }, limits) as unknown as Omit<FullMetadataSource, 'metadataBytes'>;
  if (typeof descriptor.packageId !== 'string' || !/^pkg_[0-9a-f]{32}$/.test(descriptor.packageId)) fail('remote-package-id');
  checkedProof(descriptor.proof, limits); checkRemoteHeads(descriptor.remoteHeads);
  return { ...descriptor, metadataBytes: input.metadataBytes.slice() };
}
export function checkRemoteBatch(remote: RemoteBatchProof, proof: MetadataProof, limits: MetadataLimits): void {
  if (!remote || Object.keys(remote).sort().join(',') !== 'expectedFinalHeads,source' || !remote.source ||
    Object.keys(remote.source).sort().join(',') !== 'metadataByteLength,metadataEnvelope,metadataSha256,packageId,remoteHeads') fail('remote-descriptor');
  const s = remote.source;
  if (!/^pkg_[0-9a-f]{32}$/.test(s.packageId) || !/^[0-9a-f]{64}$/.test(s.metadataSha256) ||
    !Number.isSafeInteger(s.metadataByteLength) || s.metadataByteLength <= 0 || s.metadataByteLength > limits.maxTotalBytes ||
    json(s.metadataEnvelope) !== json(proof.envelope)) fail('remote-descriptor');
  checkRemoteHeads(s.remoteHeads); checkRemoteHeads(remote.expectedFinalHeads);
}

/** Complete source-derived set, dependency-topological with lexicographic rank ties. */
export function planRemoteChanges(base: ProjectMetadataSource, remote: ProjectMetadataSource, limits: MetadataLimits) {
  if (json(base.proof) !== json(remote.proof)) fail('remote-lineage');
  const known = new Map(base.originalChanges().map(b => [A.decodeChange(b).hash, b]));
  const pending = new Map<string, { bytes: Uint8Array; deps: string[] }>();
  for (const bytes of remote.originalChanges()) {
    const c = A.decodeChange(bytes), prior = known.get(c.hash);
    if (prior && !equalBytes(prior, bytes)) fail('remote-change-identity');
    if (!prior) pending.set(c.hash, { bytes, deps: c.deps });
  }
  const parts: Uint8Array[] = []; let work = 0;
  while (pending.size) {
    work += pending.size; if (work > limits.maxWork) fail('remote-work-budget');
    const ready = [...pending.keys()].filter(hash => pending.get(hash)!.deps.every(dep => known.has(dep))).sort();
    if (!ready.length) fail('remote-dependencies');
    for (const hash of ready) {
      const { bytes } = pending.get(hash)!; parts.push(bytes); known.set(hash, bytes); pending.delete(hash);
    }
  }
  return { parts, final: base.appendOriginal(parts) };
}

/** First import has no receiver base: retain every original, in dependency-ready batches. */
export function initialWorkspaceChanges(source: ProjectMetadataSource, limits: MetadataLimits): Uint8Array[] {
  const pending = new Map(source.originalChanges().map(bytes => {
    const c = A.decodeChange(bytes); return [c.hash, { bytes, deps: c.deps }] as const;
  }));
  const known = new Set<string>(), parts: Uint8Array[] = []; let work = 0;
  while (pending.size) {
    work += pending.size; if (work > limits.maxWork) fail('import-work-budget');
    const ready = [...pending.keys()].filter(hash => pending.get(hash)!.deps.every(dep => known.has(dep))).sort();
    if (!ready.length) fail('import-dependencies');
    for (const hash of ready) { parts.push(pending.get(hash)!.bytes); known.add(hash); pending.delete(hash); }
  }
  return parts;
}

/** Do not fill a missing acknowledged base/change or absorb an unexpected writer. */
export function checkRemoteStored(stored: ProjectMetadataSource, base: ProjectMetadataSource,
  final: ProjectMetadataSource, acknowledged: boolean): void {
  const actual = new Map(stored.originalChanges().map(b => [A.decodeChange(b).hash, b]));
  const allowed = new Map(final.originalChanges().map(b => [A.decodeChange(b).hash, b]));
  for (const [hash, bytes] of actual) {
    const expected = allowed.get(hash); if (!expected || !equalBytes(expected, bytes)) fail('remote-unexpected-writer');
  }
  for (const bytes of (acknowledged ? final : base).originalChanges()) {
    const found = actual.get(A.decodeChange(bytes).hash);
    if (!found || !equalBytes(found, bytes)) fail(acknowledged ? 'remote-acknowledged-change-missing' : 'remote-base-missing');
  }
  if (acknowledged && json(stored.heads) !== json(final.heads)) fail('remote-final-heads');
}
