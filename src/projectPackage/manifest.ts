import { parseJsonWithoutDuplicateMembers } from '../core/json';
import { hasEditorCapability, EditorAttributionError } from '../projectMetadata/editorAttribution';
import { cloneCanonicalValue, reject, type JsonObject, type JsonValue } from '../domain/values';
import { canonical } from '../domain/projectGraphSupport';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkProjectHeader } from '../domain/projectRecords';
import { NativeSha256 } from '../nativeGs/sha256';
import { PACKAGE_FORMAT, PACKAGE_WIRE_VERSION, PACKAGE_LIMITS as L, SUMMARY_ALGORITHM, SUMMARY_ALGORITHM2, summaryFieldsFor, type SummaryAlgorithm,
  type Entry, type PackageManifest, type PackagePurpose } from './contract';

export class PackageControlError extends Error {
  constructor(readonly code: string) { super(`Invalid package control (${code})`); this.name = 'PackageControlError'; }
}
const fail = (code: string): never => { throw new PackageControlError(code); };
export function packageByteHash(bytes: Uint8Array): string { const hash = new NativeSha256(); hash.update(bytes); return hash.digestHex(); }
/** Unlike the forward-compatible domain reader, all control fields are closed. */
class ClosedFields extends ProjectRecordFields {
  override shape(v: JsonValue, keys: readonly string[], p: readonly string[]): JsonObject {
    const o = super.shape(v, keys, p); if (this.unknown) reject('key', p); return o;
  }
}
export interface ManifestControl {
  readonly kind: 'manifest-control'; readonly manifest: PackageManifest;
  /** Expected entry descriptors only, not verified ZIP/contents or publication authority. */
  readonly entries: readonly Entry[]; readonly archiveByteLength: number;
}
const encoder = new TextEncoder();
export function canonicalControl(input: Uint8Array): JsonValue {
  if (!(input instanceof Uint8Array) || !input.length || input.length > L.controlBytes) return fail('manifest-bytes');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
  const root = cloneCanonicalValue(parseJsonWithoutDuplicateMembers(text, L), L);
  const encoded = encoder.encode(canonical(root));
  if (encoded.length !== input.length || encoded.some((b, i) => b !== input[i])) fail('canonical');
  return root;
}
const common = ['format', 'wireVersion', 'packageId', 'createdByVersion', 'memo', 'summary', 'blobs', 'payloadTotals', 'purpose', 'requiredCapabilities'];
const causal = ['identity', 'metadataEnvelope', 'targetHeads'];
const purposeKeys = {
  teamWorkspace: [...causal, 'metadata'], clean: [...causal, 'metadata'],
  contribution: [...causal, 'base', 'changes'], backup: [...causal, 'metadata', 'protectedInventory', 'exchangeBases', 'baseEvidence'],
  review: ['snapshotId', 'snapshot'],
} as const;
function checkedManifest(root: JsonValue): { manifest: PackageManifest; payloads: Entry[]; controlsBytes: number } {
  const c = new ClosedFields(), obj = c.object(root, []);
  const purpose = c.required(obj, 'purpose', []);
  c.enum(purpose, Object.keys(purposeKeys), ['purpose']);
  const p = purpose as PackagePurpose, r = c.shape(obj, [...common, ...purposeKeys[p]], []);
  if (Object.hasOwn(r, 'requiredCapabilities') && (!hasEditorCapability(r.requiredCapabilities) || p === 'clean' || p === 'review')) throw new EditorAttributionError('invalid-capability');
  const req = (key: string) => c.required(r, key, []);
  c.enum(req('format'), [PACKAGE_FORMAT], ['format']); c.enum(req('wireVersion'), [PACKAGE_WIRE_VERSION], ['wireVersion']);
  c.id(req('packageId'), 'pkg', ['packageId']);
  c.pattern(req('createdByVersion'), /^[\x20-\x7e]{1,128}$/, ['createdByVersion']);
  c.optional(r, 'memo', [], (v, path) => { c.text(v, 256, path); });
  let dependencyReferences = 0;
  const heads = (v: JsonValue, path: readonly string[], min = 1) => {
    const result = c.sorted(v, path, (v, path) => c.digest(v, path), min, L.heads);
    dependencyReferences += result.length; if (dependencyReferences > L.dependencyReferences) fail('dependency-budget');
    return result;
  };
  if (p !== 'review') {
    checkProjectHeader(c, 'identity', req('identity'));
    const env = c.shape(req('metadataEnvelope'), ['adapter', 'adapterFormatVersion', 'lineageProof'], ['metadataEnvelope']);
    c.enum(c.required(env, 'adapter', []), ['automerge'], []);
    c.enum(c.required(env, 'adapterFormatVersion', []), ['lociview-automerge-atomic-map-1', 'lociview-automerge-atomic-map-2'], []);
    const proof = c.shape(c.required(env, 'lineageProof', []), ['kind', 'rootChangeHash'], []);
    c.enum(c.required(proof, 'kind', []), ['automerge-root-change-v1'], []); c.digest(c.required(proof, 'rootChangeHash', []), []);
    heads(req('targetHeads'), ['targetHeads']);
  } else c.id(req('snapshotId'), 'snp', ['snapshotId']);
  const boundedInteger = (v: JsonValue, max: number) => { const n = c.integer(v, []); if (n > max) fail('byte-budget'); return n; };
  const payloads: Entry[] = [], digestLengths = new Map<string, number>(); let controlsBytes = 0;
  const entry = (v: JsonValue, path: string, max: number, suppliedPath = true): Entry => {
    const e = c.shape(v, [...(suppliedPath ? ['path'] : []), 'sha256', 'byteLength'], []);
    if (suppliedPath) c.enum(c.required(e, 'path', []), [path], []);
    const sha256 = c.digest(c.required(e, 'sha256', []), []), byteLength = boundedInteger(c.required(e, 'byteLength', []), max);
    const previous = digestLengths.get(sha256); if (previous !== undefined && previous !== byteLength) fail('digest-length');
    digestLengths.set(sha256, byteLength);
    const descriptor = Object.freeze({ path, sha256, byteLength }); payloads.push(descriptor); return descriptor;
  };
  if (p === 'review') entry(req('snapshot'), 'review.json', L.snapshotBytes);
  else if (p === 'contribution') {
    const base = c.shape(req('base'), ['workspacePackageId', 'workspaceManifestSha256', 'heads'], []);
    c.id(c.required(base, 'workspacePackageId', []), 'pkg', []); c.digest(c.required(base, 'workspaceManifestSha256', []), []);
    heads(c.required(base, 'heads', []), ['base', 'heads']);
    const changes = c.list(req('changes'), L.changes, ['changes']); const positions = new Map<string, number>();
    let total = 0;
    changes.forEach((v, i) => {
      const change = c.shape(v, ['ordinal', 'expectedChangeHash', 'dependencies', 'byteLength', 'bytesSha256'], ['changes', String(i)]);
      if (c.integer(c.required(change, 'ordinal', []), []) !== i) fail('ordinal');
      const hash = c.digest(c.required(change, 'expectedChangeHash', []), []);
      if (positions.has(hash)) fail('duplicate-change'); positions.set(hash, i);
      heads(c.required(change, 'dependencies', []), ['changes', String(i), 'dependencies'], 0);
      const descriptor = entry({ sha256: c.required(change, 'bytesSha256', []), byteLength: c.required(change, 'byteLength', []) },
        `changes/${String(i).padStart(8, '0')}.amchange`, L.changeBytes, false);
      if (!descriptor.byteLength) fail('empty-change'); total += descriptor.byteLength;
      if (total > L.sourceBytes) fail('changes-bytes');
    });
    // External dependencies still require the verified selected base, not a guessed root.
    // Within D, require the lexicographically smallest currently ready native hash.
    const pending = changes.map(() => 0), children = changes.map(() => [] as number[]);
    changes.forEach((v, i) => { const change = v as JsonObject;
      for (const dep of change.dependencies as readonly string[]) {
        const at = positions.get(dep);
        if (at !== undefined) {
          if (at >= i) fail('change-order');
          pending[i]!++; children[at]!.push(i);
        }
      }
    });
    const compare = (a: number, b: number) => {
      const left = (changes[a] as JsonObject).expectedChangeHash as string;
      const right = (changes[b] as JsonObject).expectedChangeHash as string;
      return left < right ? -1 : left > right ? 1 : 0;
    };
    const ready = pending.flatMap((n, i) => n ? [] : [i]).sort(compare);
    for (let i = 0; i < changes.length; i++) {
      if (ready.shift() !== i) fail('change-order');
      for (const child of children[i]!) if (--pending[child]! === 0) ready.push(child);
      ready.sort(compare);
    }
  } else entry(req('metadata'), 'metadata.am', L.sourceBytes);
  if (p === 'backup') {
    controlsBytes += entry(req('protectedInventory'), 'protected-inventory.json', L.controlBytes).byteLength;
    controlsBytes += entry(req('exchangeBases'), 'exchange-bases.json', L.controlBytes).byteLength;
    let previous = '', total = 0;
    for (const v of c.list(req('baseEvidence'), L.baseEvidenceCount, ['baseEvidence'])) {
      const e = c.object(v, []), digest = c.digest(c.required(e, 'sha256', []), []);
      if (digest <= previous) fail('evidence-order'); previous = digest;
      total += entry(v, `base-evidence/sha256/${digest}`, L.sourceBytes, false).byteLength;
      if (total > L.baseEvidenceBytes) fail('evidence-bytes');
    }
  }
  let previous = '', blobBytes = 0;
  const blobs = c.list(req('blobs'), L.blobCount, ['blobs']);
  for (const v of blobs) {
    const e = c.object(v, []), digest = c.digest(c.required(e, 'sha256', []), []);
    if (digest <= previous) fail('blob-order'); previous = digest;
    blobBytes += entry(v, `blobs/sha256/${digest}`, L.blobBytes).byteLength;
    if (blobBytes > L.blobBytes) fail('blob-bytes');
  }
  const sum = c.shape(req('summary'), ['algorithm', 'scope', 'entityClasses', 'fieldClasses', 'blobEntryCount', 'blobBytes'], ['summary']);
  c.enum(c.required(sum, 'algorithm', []), [SUMMARY_ALGORITHM, SUMMARY_ALGORITHM2], []);
  if (p !== 'review') {
    const expected = (r.metadataEnvelope as JsonObject).adapterFormatVersion === 'lociview-automerge-atomic-map-2' ? SUMMARY_ALGORITHM2 : SUMMARY_ALGORITHM;
    if (sum.algorithm !== expected) fail('summary-profile');
  }
  const summaryFields = summaryFieldsFor(sum.algorithm as SummaryAlgorithm);
  const scope = p === 'contribution' ? 'baseDelta' : p === 'clean' || p === 'review' ? 'snapshot' : 'entireHistory';
  c.enum(c.required(sum, 'scope', []), [scope], []);
  if (boundedInteger(c.required(sum, 'blobEntryCount', []), L.blobCount) !== blobs.length ||
      boundedInteger(c.required(sum, 'blobBytes', []), L.blobBytes) !== blobBytes) fail('summary-blobs');
  const entities = Object.keys(summaryFields).filter(k => scope !== 'snapshot' || k !== 'opaque');
  const fields = Object.entries(summaryFields).flatMap(([key, values]) => entities.includes(key) ? values.map(f => `${key}.${f}`) : []);
  if (p === 'review') fields.push('assetsById.record');
  const countTable = (v: JsonValue, allowed: readonly string[]) => {
    const counts = new Map<string, number>(); let previous = '';
    for (const item of c.list(v, allowed.length, [])) {
      const row = c.shape(item, ['class', 'count'], []), key = c.required(row, 'class', []); c.enum(key, allowed, []);
      const label = key as string, count = c.integer(c.required(row, 'count', []), []);
      if (!count || label <= previous) fail('summary-count'); previous = label; counts.set(label, count);
    } return counts;
  };
  const entityCounts = countTable(c.required(sum, 'entityClasses', []), entities);
  for (const [field, count] of countTable(c.required(sum, 'fieldClasses', []), fields))
    if (count > (entityCounts.get(field.split('.')[0]!) ?? 0)) fail('summary-entity');
  const totals = c.shape(req('payloadTotals'), ['entryCount', 'uncompressedBytes', 'largestEntryBytes'], []);
  const total = payloads.reduce((n, e) => n + e.byteLength, 0), largest = Math.max(0, ...payloads.map(e => e.byteLength));
  if (boundedInteger(c.required(totals, 'entryCount', []), L.entryCount - 2) !== payloads.length ||
    boundedInteger(c.required(totals, 'uncompressedBytes', []), L.payloadBytes) !== total ||
    boundedInteger(c.required(totals, 'largestEntryBytes', []), L.payloadBytes) !== largest) fail('payload-totals');
  return { manifest: r as unknown as PackageManifest, payloads, controlsBytes };
}

/** Pure structural preflight. Success is not ZIP, DAG, summary-content, blob or import admission. */
export function readManifestControl(input: Uint8Array, checksum: Uint8Array): ManifestControl {
  try {
    if (!(input instanceof Uint8Array) || input.length > L.controlBytes || !(checksum instanceof Uint8Array) || checksum.length !== 64) fail('control-bytes');
    const bytes = input.slice(), checksumBytes = checksum.slice();
    const sha256 = packageByteHash(bytes), sum = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(checksumBytes);
    if (!/^[0-9a-f]{64}$/.test(sum) || sum !== sha256) fail('checksum');
    const { manifest, payloads, controlsBytes } = checkedManifest(canonicalControl(bytes));
    if (bytes.length + 64 + controlsBytes > L.controlsBytes) fail('controls-budget');
    const entries = Object.freeze([
      Object.freeze({ path: 'manifest.json', sha256, byteLength: bytes.length }),
      Object.freeze({ path: 'manifest.sha256', sha256: packageByteHash(checksumBytes), byteLength: 64 }), ...payloads,
    ]);
    const overhead = 22 + entries.reduce((n, e) => n + 30 + 16 + 46 + e.path.length * 2, 0);
    const archiveByteLength = overhead + entries.reduce((n, e) => n + e.byteLength, 0);
    if (entries.length > L.entryCount || overhead > L.containerMetadataBytes || archiveByteLength > L.archiveBytes) fail('archive-budget');
    return Object.freeze({ kind: 'manifest-control', manifest, entries, archiveByteLength });
  } catch (e) { if (e instanceof PackageControlError) throw e; return fail('manifest-shape'); }
}

/** Compare measured entry descriptors, not a central-directory declaration as proof of payload bytes. */
export function checkPackageEntryTable(control: ManifestControl, observed: readonly Entry[], archiveByteLength: number): void {
  if (observed.length !== control.entries.length || archiveByteLength !== control.archiveByteLength) fail('entry-table');
  control.entries.forEach((expected, i) => {
    const actual = observed[i];
    if (!actual || actual.path !== expected.path || actual.byteLength !== expected.byteLength || actual.sha256 !== expected.sha256) fail('entry-table');
  });
}
