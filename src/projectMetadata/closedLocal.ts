import * as A from '@automerge/automerge/slim';
import type { EvidenceRef } from '../projectPackage/contract';
import type { JournalStart, Publication } from './journal';
import { checkedChanges, fail, type MetadataLimits } from './format';
import { digest, equalBytes, json, technicalId } from './persistence';

/** Private terminal evidence only: this is neither an edit nor a publication. */
export interface ClosedLocalReceipt {
  schema: 'lociview-metadata-closed-local-1';
  transactionId: string;
  repositoryId: string;
  start: EvidenceRef;
  effectivePublication: { transactionId: string; receipt: EvidenceRef; heads: string[] };
  baseChangeSet: { sha256: string; count: number };
  resolution: 'retain-published-state';
}

export async function closedLocalReference(value: unknown): Promise<EvidenceRef> {
  const bytes = new TextEncoder().encode(json(value));
  return { sha256: await digest(bytes), byteLength: bytes.length };
}

/** Seal the actual validated source, never a union of Journal descriptors. */
export async function closedLocalBase(changes: readonly Uint8Array[], limits: MetadataLimits) {
  const originals = new Map<string, Uint8Array>();
  for (const bytes of checkedChanges(changes, limits)) {
    const hash = A.decodeChange(bytes).hash;
    if (originals.has(hash)) return fail('closed-local-duplicate-change');
    originals.set(hash, bytes);
  }
  const rows = await Promise.all([...originals].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(async ([expectedChangeHash, bytes]) =>
    ({ expectedChangeHash, byteLength: bytes.length, bytesSha256: await digest(bytes) })));
  const sha256 = await digest(new TextEncoder().encode(`lociview:metadata:closed-local-base:jcs-v1\n${json({ changes: rows })}`));
  return { seal: { sha256, count: rows.length }, originals };
}

export function assertClosedLocalOriginals(actual: ReadonlyMap<string, Uint8Array>, expected: ReadonlyMap<string, Uint8Array>) {
  if (actual.size !== expected.size) return fail('closed-local-repository-changed');
  for (const [hash, bytes] of expected) {
    const stored = actual.get(hash);
    if (!stored || !equalBytes(stored, bytes)) return fail('closed-local-repository-changed');
  }
}

function keys(value: unknown, expected: string): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === expected;
}
function evidence(value: unknown, limits: MetadataLimits): value is EvidenceRef {
  return keys(value, 'byteLength,sha256') && typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256) &&
    Number.isSafeInteger(value.byteLength) && (value.byteLength as number) > 0 && (value.byteLength as number) <= limits.maxTotalBytes;
}

/** Structural binding; the Session separately proves complete source/DB equality. */
export async function validateClosedLocal(receipt: ClosedLocalReceipt, start: JournalStart,
  effective: { start: JournalStart; publication: Publication }, limits: MetadataLimits) {
  if (!keys(receipt, 'baseChangeSet,effectivePublication,repositoryId,resolution,schema,start,transactionId') ||
    receipt.schema !== 'lociview-metadata-closed-local-1' || receipt.resolution !== 'retain-published-state' ||
    start.purpose !== 'localCommand' || receipt.transactionId !== start.transactionId || receipt.repositoryId !== start.repositoryId ||
    !evidence(receipt.start, limits) || !keys(receipt.effectivePublication, 'heads,receipt,transactionId') ||
    !evidence(receipt.effectivePublication.receipt, limits) || !keys(receipt.baseChangeSet, 'count,sha256') ||
    !Number.isSafeInteger(receipt.baseChangeSet.count) || receipt.baseChangeSet.count <= 0 || receipt.baseChangeSet.count > limits.maxChanges ||
    typeof receipt.baseChangeSet.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.baseChangeSet.sha256))
    return fail('closed-local-receipt');
  technicalId(receipt.transactionId); technicalId(receipt.repositoryId); technicalId(receipt.effectivePublication.transactionId);
  if (receipt.effectivePublication.transactionId !== effective.start.transactionId ||
    json(receipt.start) !== json(await closedLocalReference(start)) ||
    json(receipt.effectivePublication.receipt) !== json(await closedLocalReference(effective.publication)) ||
    json(receipt.effectivePublication.heads) !== json(effective.publication.heads) ||
    json(start.baseHeads) !== json(effective.publication.heads) || start.repositoryId !== effective.start.repositoryId ||
    json(start.proof) !== json(effective.start.proof)) return fail('closed-local-binding');
}
