import * as A from '@automerge/automerge/slim';
import type { EvidenceRef } from '../projectPackage/contract';
import type { JournalStart, Publication } from './journal';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkedChanges, fail, type MetadataLimits } from './format';
import { digest, equalBytes, json, technicalId } from './persistence';

/** Private terminal evidence only: this is neither an edit nor a publication. */
interface ClosedLocalBaseReceipt {
  transactionId: string;
  repositoryId: string;
  start: EvidenceRef;
  effectivePublication: { transactionId: string; receipt: EvidenceRef; heads: string[] };
  baseChangeSet: { sha256: string; count: number };
  resolution: 'retain-published-state';
}
export interface UnpreparedLocalPart {
  path: 'changes/00000000.amchange'; byteLength: number; sha256: string;
}
export type ClosedLocalReceipt = ClosedLocalBaseReceipt & (
  { schema: 'lociview-metadata-closed-local-1' } |
  { schema: 'lociview-metadata-closed-local-2'; unpreparedParts: [UnpreparedLocalPart] });

/** One bounded file observation; unprepared bytes are sealed, never decoded. */
export async function readUnpreparedLocalPart(fs: ProjectWorkspaceFS, path: string, limits: MetadataLimits): Promise<UnpreparedLocalPart | null> {
  const file = await fs.readStream(path);
  if (!file) return null;
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limits.maxTotalBytes) return fail('closed-local-part-budget');
  const bytes = new Uint8Array(file.size), reader = file.stream().getReader();
  let offset = 0, work = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (++work > limits.maxWork || !(chunk.value instanceof Uint8Array) || chunk.value.length > bytes.length - offset)
        return fail('closed-local-part-read');
      bytes.set(chunk.value, offset); offset += chunk.value.length;
    }
    if (offset !== bytes.length) return fail('closed-local-part-read');
    return { path: 'changes/00000000.amchange', byteLength: bytes.length, sha256: await digest(bytes) };
  } finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
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
  const schema2 = receipt?.schema === 'lociview-metadata-closed-local-2';
  if (!keys(receipt, schema2 ? 'baseChangeSet,effectivePublication,repositoryId,resolution,schema,start,transactionId,unpreparedParts' :
    'baseChangeSet,effectivePublication,repositoryId,resolution,schema,start,transactionId') ||
    !schema2 && receipt.schema !== 'lociview-metadata-closed-local-1' || receipt.resolution !== 'retain-published-state' ||
    start.purpose !== 'localCommand' || receipt.transactionId !== start.transactionId || receipt.repositoryId !== start.repositoryId ||
    !evidence(receipt.start, limits) || !keys(receipt.effectivePublication, 'heads,receipt,transactionId') ||
    !evidence(receipt.effectivePublication.receipt, limits) || !keys(receipt.baseChangeSet, 'count,sha256') ||
    !Number.isSafeInteger(receipt.baseChangeSet.count) || receipt.baseChangeSet.count <= 0 || receipt.baseChangeSet.count > limits.maxChanges ||
    typeof receipt.baseChangeSet.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.baseChangeSet.sha256))
    return fail('closed-local-receipt');
  if (schema2) {
    const parts = receipt.unpreparedParts, part = parts?.[0];
    if (!Array.isArray(parts) || parts.length !== 1 || !keys(part, 'byteLength,path,sha256') ||
      part.path !== 'changes/00000000.amchange' || !Number.isSafeInteger(part.byteLength) || part.byteLength < 0 || part.byteLength > limits.maxTotalBytes ||
      typeof part.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(part.sha256)) return fail('closed-local-part');
  }
  technicalId(receipt.transactionId); technicalId(receipt.repositoryId); technicalId(receipt.effectivePublication.transactionId);
  if (receipt.effectivePublication.transactionId !== effective.start.transactionId ||
    json(receipt.start) !== json(await closedLocalReference(start)) ||
    json(receipt.effectivePublication.receipt) !== json(await closedLocalReference(effective.publication)) ||
    json(receipt.effectivePublication.heads) !== json(effective.publication.heads) ||
    json(start.baseHeads) !== json(effective.publication.heads) || start.repositoryId !== effective.start.repositoryId ||
    json(start.proof) !== json(effective.start.proof)) return fail('closed-local-binding');
}
