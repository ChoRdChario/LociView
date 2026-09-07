// Disposable protocol adapter, NOT a production ProjectDocV2 schema/validator.
import * as A from '@automerge/automerge';
import { NativeSha256 } from '../../src/nativeGs/sha256';
import { parseJsonWithoutDuplicateMembers } from '../../src/core/json';

export { A };
// The full domain validator is an injected test port; this module owns history.
export type Doc = A.Doc<Record<string, any>>;
export const LIMIT = { count: 64, part: 1024 * 1024, metadata: 8 * 1024 * 1024, journal: 256 * 1024 } as const;
export const FORMAT = 'automerge-js-3.4.1-isolated-probe';
export interface Ref { algorithm: 'sha256'; digest: string; byteLength: number; mediaType: string }
export interface Target {
  identity: { projectId: string; historyEpoch: string; lineageSeed: string };
  metadataEnvelope: { adapter: 'automerge'; adapterFormatVersion: string;
    lineageProof: { kind: 'automerge-root-change-v1'; rootChangeHash: string } };
}
export interface Part { ordinal: number; expectedChangeHash: string; dependencies: string[]; byteLength: number; bytesSha256: string }
export interface Batch {
  kind: 'localCommand' | 'remotePackageMerge'; baseHeads: string[];
  exactChangeSetDigest: string; changes: Part[];
  source?: { packageId: string; metadataSha256: string; metadataByteLength: number;
    metadataEnvelope: Target['metadataEnvelope']; remoteHeads: string[] };
  expectedFinalHeads?: string[];
}
export type Journal = { transactionId: string; purpose: Batch['kind']; target: Target } & (
  { state: 'staging'; sourceResume: { kind: 'none' } } |
  { state: 'blobsVerified' | 'metadataDurable'; stagedBlobs: Ref[]; metadataBatch: Batch });
export type Prepared = Extract<Journal, { metadataBatch: Batch }>;
export function require(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`journal probe: ${message}`); }
export function sha(bytes: Uint8Array): string { const hash = new NativeSha256(); hash.update(bytes); return hash.digestHex(); }
const encoder = new TextEncoder();
export const heads = (doc: Doc) => [...A.getHeads(doc)].sort();
export function canonical(value: unknown): string {
  let nodes = 0;
  const text = (s: string) => {
    require(s === s.normalize('NFC') && !/[\uD800-\uDFFF]/u.test(s), 'invalid canonical string');
    return JSON.stringify(s);
  };
  const visit = (v: unknown, depth: number): string => {
    require(++nodes <= 10_000 && depth <= 32, 'canonical budget');
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'string') return text(v);
    if (typeof v === 'number') { require(Number.isFinite(v), 'nonfinite value'); return JSON.stringify(v); }
    if (Array.isArray(v)) return '[' + v.map(item => visit(item, depth + 1)).join(',') + ']';
    require(!!v && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v)), 'not plain JSON');
    return '{' + Object.keys(v as object).sort().map(key => {
      require(!['__proto__', 'prototype', 'constructor'].includes(key), 'unsafe key');
      return text(key) + ':' + visit((v as Record<string, unknown>)[key], depth + 1);
    }).join(',') + '}';
  };
  return visit(value, 0);
}
export const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export const jsonBytes = (value: unknown) => encoder.encode(canonical(value));
export function parse(bytes: Uint8Array): any {
  require(bytes.length > 0 && bytes.length <= LIMIT.journal, 'JSON byte budget');
  const value = parseJsonWithoutDuplicateMembers(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  canonical(value); return value;
}
function keys(value: any, expected: string[]) {
  require(value && typeof value === 'object' && !Array.isArray(value), 'expected record');
  require(same(Object.keys(value).sort(), [...expected].sort()), 'invalid record members');
}
export function hash(value: unknown): asserts value is string {
  require(typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value), 'invalid hash');
}
export function transaction(value: unknown): asserts value is string {
  require(typeof value === 'string' && value.length === 32 && /^[0-9a-f]{32}$/.test(value), 'invalid transaction');
}
function hashes(value: any) {
  require(Array.isArray(value) && value.length <= LIMIT.count, 'hash list budget');
  value.forEach(hash); require(same(value, [...new Set(value)].sort()), 'noncanonical hash set');
}
function length(value: unknown, max: number, positive = true) {
  require(Number.isSafeInteger(value) && (value as number) >= (positive ? 1 : 0) && (value as number) <= max, 'invalid length');
}
export function refs(value: any): asserts value is Ref[] {
  require(Array.isArray(value) && value.length <= LIMIT.count, 'blob list budget');
  let previous = '';
  for (const ref of value) {
    keys(ref, ['algorithm', 'digest', 'byteLength', 'mediaType']); hash(ref.digest);
    require(ref.algorithm === 'sha256' && ref.digest > previous, 'unordered/duplicate blob digest'); previous = ref.digest;
    length(ref.byteLength, Number.MAX_SAFE_INTEGER, false);
    require(typeof ref.mediaType === 'string' && ref.mediaType.length <= 127 && !/[^\x21-\x7e]/.test(ref.mediaType) &&
      /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(ref.mediaType), 'invalid media type');
  }
}
export function target(value: any): asserts value is Target {
  keys(value, ['identity', 'metadataEnvelope']); keys(value.identity, ['projectId', 'historyEpoch', 'lineageSeed']);
  require(typeof value.identity.projectId === 'string' && value.identity.projectId.length === 36 &&
    /^prj_[0-9a-f]{32}$/.test(value.identity.projectId) && typeof value.identity.historyEpoch === 'string' &&
    value.identity.historyEpoch.length === 36 && /^hep_[0-9a-f]{32}$/.test(value.identity.historyEpoch), 'invalid identity');
  hash(value.identity.lineageSeed);
  const envelope = value.metadataEnvelope; keys(envelope, ['adapter', 'adapterFormatVersion', 'lineageProof']);
  require(envelope.adapter === 'automerge' && envelope.adapterFormatVersion === FORMAT, 'wrong adapter');
  keys(envelope.lineageProof, ['kind', 'rootChangeHash']);
  require(envelope.lineageProof.kind === 'automerge-root-change-v1', 'wrong root proof'); hash(envelope.lineageProof.rootChangeHash);
}
export function seal(journal: Prepared): string {
  const { exactChangeSetDigest: _ignored, ...metadataBatch } = journal.metadataBatch;
  return sha(encoder.encode('lociview:v2:metadata-change-set:jcs-v1\n' + canonical({
    transactionId: journal.transactionId, target: journal.target, purpose: journal.purpose,
    stagedBlobs: journal.stagedBlobs, metadataBatch,
  })));
}
export function decodeJournal(bytes: Uint8Array): Journal {
  const j = parse(bytes); transaction(j.transactionId); target(j.target);
  require(['localCommand', 'remotePackageMerge'].includes(j.purpose), 'wrong purpose');
  if (j.state === 'staging') {
    keys(j, ['transactionId', 'target', 'purpose', 'state', 'sourceResume']); keys(j.sourceResume, ['kind']);
    require(j.sourceResume.kind === 'none', 'unsupported synthetic lease'); return j;
  }
  keys(j, ['transactionId', 'target', 'purpose', 'state', 'stagedBlobs', 'metadataBatch']);
  require(['blobsVerified', 'metadataDurable'].includes(j.state), 'invalid state'); refs(j.stagedBlobs);
  const b = j.metadataBatch; const remote = j.purpose === 'remotePackageMerge';
  keys(b, ['kind', 'baseHeads', 'exactChangeSetDigest', 'changes', ...(remote ? ['source', 'expectedFinalHeads'] : [])]);
  require(b.kind === j.purpose, 'batch purpose mismatch'); hashes(b.baseHeads); hash(b.exactChangeSetDigest);
  require(Array.isArray(b.changes) && b.changes.length > 0 && b.changes.length <= LIMIT.count, 'change count');
  require(remote || b.changes.length === 1, 'local change count');
  const seen = new Set(); let total = 0;
  b.changes.forEach((p: any, ordinal: number) => {
    keys(p, ['ordinal', 'expectedChangeHash', 'dependencies', 'byteLength', 'bytesSha256']);
    require(p.ordinal === ordinal, 'noncontiguous ordinal'); hash(p.expectedChangeHash); hash(p.bytesSha256); hashes(p.dependencies);
    length(p.byteLength, LIMIT.part); total += p.byteLength;
    require(!seen.has(p.expectedChangeHash), 'duplicate change'); seen.add(p.expectedChangeHash);
  });
  require(total <= LIMIT.metadata, 'aggregate change bytes');
  if (remote) {
    keys(b.source, ['packageId', 'metadataSha256', 'metadataByteLength', 'metadataEnvelope', 'remoteHeads']);
    require(typeof b.source.packageId === 'string' && b.source.packageId.length === 36 && /^pkg_[0-9a-f]{32}$/.test(b.source.packageId), 'invalid package identity');
    hash(b.source.metadataSha256); length(b.source.metadataByteLength, LIMIT.metadata); hashes(b.source.remoteHeads); hashes(b.expectedFinalHeads);
    require(same(b.source.metadataEnvelope, j.target.metadataEnvelope), 'source envelope mismatch');
  }
  require(seal(j) === b.exactChangeSetDigest, 'journal digest mismatch'); return j;
}
export function index(doc: Doc): Map<string, { bytes: Uint8Array; deps: string[] }> {
  const map = new Map<string, { bytes: Uint8Array; deps: string[] }>(); let total = 0;
  for (const bytes of A.getAllChanges(doc)) {
    total += bytes.length; require(map.size < LIMIT.count && total <= LIMIT.metadata && bytes.length <= LIMIT.part, 'history budget');
    const decoded = A.decodeChange(bytes); hash(decoded.hash);
    require(!map.has(decoded.hash), 'duplicate history'); map.set(decoded.hash, { bytes, deps: [...decoded.deps].sort() });
  }
  return map;
}
export function ordered(parts: Uint8Array[], known: Set<string>): Uint8Array[] {
  const remaining = new Map(parts.map(bytes => [A.decodeChange(bytes).hash, bytes]));
  require(remaining.size === parts.length, 'duplicate ordered part'); const readyKnown = new Set(known); const result: Uint8Array[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter(([, bytes]) => A.decodeChange(bytes).deps.every(dep => readyKnown.has(dep))).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    require(ready.length, 'missing dependency');
    for (const [h, bytes] of ready) { remaining.delete(h); readyKnown.add(h); result.push(bytes); }
  }
  return result;
}
export function atHeads(doc: Doc, selected: string[]): Doc {
  const all = index(doc); const visited = new Set<string>(); const pending = [...selected];
  while (pending.length) {
    const h = pending.pop()!; if (visited.has(h)) continue;
    const entry = all.get(h); require(entry, 'missing base dependency'); visited.add(h); pending.push(...entry!.deps);
  }
  const bytes = ordered([...visited].map(h => all.get(h)!.bytes), new Set());
  return A.applyChanges(A.init<Record<string, any>>(), bytes)[0];
}
export function validateRoot(doc: Doc, expected: Target): void {
  target(expected); const all = index(doc); const rootHash = expected.metadataEnvelope.lineageProof.rootChangeHash;
  const root = all.get(rootHash); require(root && root.deps.length === 0, 'root not present');
  require([...all].filter(([, p]) => !p.deps.length).length === 1 && A.getMissingDeps(doc, []).length === 0, 'unrelated root/history');
  const bootstrap = A.applyChanges(A.init<Record<string, any>>(), [root!.bytes])[0];
  require(same(JSON.parse(JSON.stringify(bootstrap.identity)), expected.identity) &&
    same(JSON.parse(JSON.stringify(doc.identity)), expected.identity), 'wrong target identity');
  require(same(JSON.parse(JSON.stringify(bootstrap.schema)), { major: 2, minor: 0 }), 'wrong bootstrap schema');
  // Caller supplies synthetic empty collection names; this is not the full v2 schema.
  require(Object.keys(bootstrap).every(key => ['schema', 'identity'].includes(key) ||
    (bootstrap[key] && typeof bootstrap[key] === 'object' && Object.keys(bootstrap[key]).length === 0)), 'nonempty bootstrap collection');
  require(Object.keys(A.getConflicts(doc, 'identity') ?? {}).length <= 1, 'conflicting identity');
  for (const name of ['projectId', 'historyEpoch', 'lineageSeed'])
    require(Object.keys(A.getConflicts(doc.identity, name) ?? {}).length <= 1, 'conflicting identity');
}
export function load(bytes: Uint8Array, expected: Target): Doc {
  require(bytes.length > 0 && bytes.length <= LIMIT.metadata, 'metadata byte budget');
  const doc = A.load<Record<string, any>>(bytes); validateRoot(doc, expected); return doc;
}
export function missing(base: Doc, source: Doc): Uint8Array[] {
  const known = new Set(index(base).keys());
  return ordered([...index(source)].filter(([h]) => !known.has(h)).map(([, p]) => p.bytes), known);
}
