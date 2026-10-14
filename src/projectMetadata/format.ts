import * as A from '@automerge/automerge/slim';
import { parseJsonWithoutDuplicateMembers } from '../core/json';
import { inspectAtomicHistory, type AtomicChange, type AtomicWrite, type HistoryReadLimits } from '../domain/atomicHistory';
import { canonical, immutableKinds, same } from '../domain/projectGraphSupport';
import { projectRecordMaps, checkProjectHeader } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import type { ProjectSemanticProfile } from '../domain/projectProfile';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { inspectProjectCandidates, type ProjectCandidateInput } from '../domain/projectCandidates';

export const adapterFormatVersion = 'lociview-automerge-atomic-map-1';
export const adapterFormatVersion2 = 'lociview-automerge-atomic-map-2';
export type AdapterFormatVersion = typeof adapterFormatVersion | typeof adapterFormatVersion2;
export function metadataSemanticProfile(adapter: AdapterFormatVersion): ProjectSemanticProfile {
  if (adapter === adapterFormatVersion) return 'map1';
  if (adapter === adapterFormatVersion2) return 'map2';
  return fail('adapter-profile');
}
export interface MetadataLimits extends HistoryReadLimits {
  readonly maxChanges: number;
  readonly maxChangeBytes: number;
  readonly maxTotalBytes: number;
  readonly maxOperations: number;
}
export interface MetadataProof {
  readonly identity: JsonObject;
  readonly envelope: Readonly<{ adapter: 'automerge'; adapterFormatVersion: AdapterFormatVersion;
    lineageProof: Readonly<{ kind: 'automerge-root-change-v1'; rootChangeHash: string }> }>;
}
// Private physical encoding only; dynamic keys never leave this adapter as library objects.
export type PhysicalDoc = A.Doc<Record<string, any>>;
export class MetadataSourceError extends Error {
  constructor(readonly code: string) { super(`Metadata source invalid (${code})`); this.name = 'MetadataSourceError'; }
}
export const fail = (code: string): never => { throw new MetadataSourceError(code); };
export function checkLimits(limits: MetadataLimits): MetadataLimits {
  for (const n of Object.values(limits)) if (!Number.isSafeInteger(n) || n <= 0) fail('limits');
  const required = ['maxNodes', 'maxDepth', 'maxStringScalars', 'maxWork', 'maxChanges', 'maxChangeBytes', 'maxTotalBytes', 'maxOperations'];
  if (required.some(k => !Object.hasOwn(limits, k))) fail('limits');
  cloneCanonicalValue(null, limits);
  return Object.freeze({ ...limits });
}
export function scalar(value: JsonValue, limits: MetadataLimits): A.ImmutableString {
  return new A.ImmutableString(canonical(cloneCanonicalValue(value, limits)));
}
function decodeScalar(value: unknown, limits: MetadataLimits): JsonValue {
  if (typeof value !== 'string' || value.length > limits.maxChangeBytes) fail('scalar');
  try {
    const decoded = cloneCanonicalValue(parseJsonWithoutDuplicateMembers(value as string), limits);
    if (canonical(decoded) !== value) fail('canonical');
    return decoded;
  } catch { return fail('scalar'); }
}
export function checkedChanges(parts: readonly Uint8Array[], limits: MetadataLimits): Uint8Array[] {
  if (!Array.isArray(parts) || parts.length > limits.maxChanges) fail('change-count');
  let total = 0;
  return parts.map(bytes => {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > limits.maxChangeBytes) fail('change-bytes');
    total += bytes.length; if (total > limits.maxTotalBytes) fail('total-bytes');
    return bytes.slice();
  });
}
export function checkedProof(input: MetadataProof, limits: MetadataLimits): MetadataProof {
  const p = cloneCanonicalValue(input, limits) as unknown as MetadataProof;
  if (!p || Object.keys(p).sort().join(',') !== 'envelope,identity' || !p.envelope ||
    Object.keys(p.envelope).sort().join(',') !== 'adapter,adapterFormatVersion,lineageProof' ||
    p.envelope.adapter !== 'automerge' || ![adapterFormatVersion, adapterFormatVersion2].includes(p.envelope.adapterFormatVersion) ||
    !p.envelope.lineageProof || Object.keys(p.envelope.lineageProof).sort().join(',') !== 'kind,rootChangeHash' ||
    p.envelope.lineageProof.kind !== 'automerge-root-change-v1' || !/^[0-9a-f]{64}$/.test(p.envelope.lineageProof.rootChangeHash)) fail('proof');
  checkProjectHeader(new ProjectRecordFields(), 'identity', p.identity);
  return p;
}

export interface OriginalScalar extends AtomicWrite { readonly changeHash: string }
export interface OriginalInspectionBudget { readonly maxNodes: number; readonly maxWork: number }

/** Optional owned inspection; never expose partial operations through a caller callback. */
export async function inspectOriginalSource(doc: PhysicalDoc, proof: MetadataProof, limits: MetadataLimits, budget: OriginalInspectionBudget) {
  if (![budget.maxNodes, budget.maxWork].every(n => Number.isSafeInteger(n) && n > 0)) fail('original-budget');
  const detail = inspectPhysicalDetail(doc, proof, limits, budget);
  const candidates = await inspectProjectCandidates(detail.input, limits);
  if (candidates.kind !== 'project-candidate-inspection' || candidates.issues.some(i => i.kind === 'invalid')) return fail('original-candidates');
  const workUsed = detail.workUsed + candidates.workUsed;
  if (workUsed > budget.maxWork) fail('original-work-budget');
  return Object.freeze({ input: detail.input, candidates, scalars: detail.scalars, nodesUsed: detail.nodesUsed, workUsed });
}

/** All raw structure before projection. No traversal of a materialized winner to recover paths. */
export function inspectPhysical(doc: PhysicalDoc, inputProof: MetadataProof, limits: MetadataLimits): ProjectCandidateInput {
  return inspectPhysicalDetail(doc, inputProof, limits).input;
}
/** Encoding witness only, never a selected/default View. Include overwritten original scalars. */
export function originalEntryWitness(doc: PhysicalDoc, proof: MetadataProof, limits: MetadataLimits, sceneId: string): string {
  const detail = inspectPhysicalDetail(doc, proof, limits, { maxNodes: limits.maxNodes, maxWork: limits.maxWork });
  let work = detail.workUsed;
  for (const op of detail.scalars) {
    if (++work > limits.maxWork) fail('original-work-budget');
    if (op.path.length !== 3 || op.path[0] !== 'scenesById' || op.path[1] !== sceneId || op.path[2] !== 'defaultViewId' || op.value.kind !== 'value') continue;
    const value = op.value.value;
    if (typeof value === 'string' && /^view_[0-9a-f]{32}$/.test(value)) return value;
  }
  return fail('entry-absence-witness');
}
function inspectPhysicalDetail(doc: PhysicalDoc, inputProof: MetadataProof, limits: MetadataLimits, originalBudget?: OriginalInspectionBudget) {
  const proof = checkedProof(inputProof, limits), rootHash = proof.envelope.lineageProof.rootChangeHash;
  const profile = metadataSemanticProfile(proof.envelope.adapterFormatVersion), map2 = profile === 'map2';
  const bytes = checkedChanges(A.getAllChanges(doc), limits);
  if (!bytes.length) fail('empty-history');
  const decoded = bytes.map(b => A.decodeChange(b));
  const byHash = new Map(decoded.map(c => [c.hash, c]));
  if (byHash.size !== decoded.length) fail('duplicate-change');
  const roots = decoded.filter(c => !c.deps.length);
  if (roots.length !== 1 || roots[0]!.hash !== rootHash) fail('root-proof');
  const containers = new Map<string, { path: string[]; birth: string }>([['_root', { path: [], birth: rootHash }]]);
  const occupied = new Set<string>(), ancestors = new Map<string, Set<string>>();
  const changes: AtomicChange[] = [], scalars = new Map<string, { objectId: string; key: string }>();
  let work = 0, operations = 0, schema: JsonObject | undefined, identity: JsonValue | undefined, profileMarker: JsonValue | undefined;
  const originals: OriginalScalar[] = []; let nodesUsed = 0;
  const collect = (changeHash: string, operationId: string, path: string[], value: AtomicWrite['value']) => {
    if (!originalBudget) return;
    // Count additional owned record/path/value nodes across ALL original writes.
    nodesUsed += 3 + path.length;
    const pending: JsonValue[] = value.kind === 'value' ? [value.value] : [];
    while (pending.length) {
      if (++nodesUsed > originalBudget.maxNodes) fail('original-node-budget');
      const v = pending.pop();
      if (v !== null && typeof v === 'object') {
        const children = Object.values(v);
        if (nodesUsed + pending.length + children.length > originalBudget.maxNodes) fail('original-node-budget');
        for (const child of children) pending.push(child);
      }
    }
    if (nodesUsed > originalBudget.maxNodes || work + nodesUsed > originalBudget.maxWork) fail('original-node-budget');
    originals.push(Object.freeze({ changeHash, operationId, path: Object.freeze([...path]), value: Object.freeze(value) }));
  };
  const charge = (n = 1) => { work += n; if (work > limits.maxWork) fail('work-limit'); };
  // Order the read projection only. Encoded source bytes are never rewritten.
  const pending = new Map(byHash);
  while (pending.size) {
    let advanced = false;
    for (const [hash, change] of pending) {
      charge(change.deps.length + 1);
      if (!change.deps.every(dep => ancestors.has(dep))) continue;
      const prior = new Set<string>();
      for (const dep of change.deps) { prior.add(dep); for (const a of ancestors.get(dep)!) { charge(); prior.add(a); } }
      ancestors.set(hash, prior);
      const writes = new Map<string, AtomicWrite>();
      for (const [offset, op] of change.ops.entries()) {
        if (++operations > limits.maxOperations) fail('operation-limit'); charge();
        const operationId = `${change.startOp + offset}@${change.actor}`, parent = containers.get(op.obj);
        if (!parent || (parent.birth !== hash && !prior.has(parent.birth)) ||
          typeof op.key !== 'string' || !op.key || ('insert' in op && op.insert)) fail('structure');
        // An array of path strings does not exercise the domain's object-key guard.
        cloneCanonicalValue({ [op.key]: null }, limits);
        const path = [...parent!.path, op.key];
        const address = canonical(path), root = parent!.path.length === 0;
        if (op.action === 'makeMap') {
          const rootCollection = root && hash === rootHash && (op.key === 'project' || Object.hasOwn(projectRecordMaps, op.key));
          const record = !root && parent!.path.length === 1 && Object.hasOwn(projectRecordMaps, path[0]!) &&
            !Object.hasOwn(immutableKinds, path[0]!);
          if ((!rootCollection && !record) || (record && hash === rootHash) || op.pred.length || occupied.has(address)) fail('container-replacement');
          occupied.add(address); containers.set(operationId, { path, birth: hash }); continue;
        }
        // Never erase/replace an established container, even if later restored.
        if (occupied.has(address) || !['set', 'del'].includes(op.action)) fail('structure');
        if (root && (op.key === 'project' || Object.hasOwn(projectRecordMaps, op.key))) fail('structure');
        if (!root && parent!.path.length === 1 && parent!.path[0] !== 'project' && !Object.hasOwn(immutableKinds, path[0]!)) fail('record-scalar');
        const headerKeys = map2 ? ['schema', 'identity', 'semanticProfile'] : ['schema', 'identity'];
        if (root && headerKeys.includes(op.key) && (hash !== rootHash || op.action !== 'set')) fail('root-mutation');
        if (hash === rootHash && (!root || !headerKeys.includes(op.key) || op.action !== 'set')) fail('populated-bootstrap');
        const value = op.action === 'del' ? { kind: 'absent' as const } : (() => {
          if (op.datatype !== undefined) fail('scalar-datatype');
          return { kind: 'value' as const, value: decodeScalar(op.value, limits) };
        })();
        if (hash === rootHash) {
          if (writes.has(address)) fail('root-rewrite');
          if (op.key === 'schema' && value.kind === 'value') schema = value.value as JsonObject;
          if (op.key === 'identity' && value.kind === 'value') identity = value.value;
          if (op.key === 'semanticProfile' && value.kind === 'value') profileMarker = value.value;
        }
        scalars.set(address, { objectId: op.obj, key: op.key });
        collect(hash, operationId, path, value);
        writes.set(address, { operationId, path, value });
      }
      // Schema is the separately checked source header, not an entity field.
      changes.push({ id: hash, deps: [...change.deps].sort(), writes: [...writes.values()].filter(w =>
        w.path[0] !== 'schema' && !(map2 && w.path.length === 1 && w.path[0] === 'semanticProfile')) });
      pending.delete(hash); advanced = true;
    }
    if (!advanced) fail('incomplete-history');
  }
  const root = byHash.get(rootHash)!;
  if (root.ops.length !== 3 + Object.keys(projectRecordMaps).length + (map2 ? 1 : 0) || !schema || !same(identity, proof.identity) ||
    map2 && profileMarker !== 'map2') fail('bootstrap');
  for (const key of ['project', ...Object.keys(projectRecordMaps)]) if (!occupied.has(canonical([key]))) fail('root-collections');
  checkProjectHeader(new ProjectRecordFields(profile), 'schema', schema!);
  const heads = A.getHeads(doc).sort(), token = `${proof.envelope.adapterFormatVersion}:${rootHash}:${heads.join(',')}`;
  const read = inspectAtomicHistory({ token, heads, changes }, { ...limits, maxWork: limits.maxWork - work });
  if (read.kind !== 'atomic-history-inspection') return fail('atomic-history');
  // Check the complete live field candidates against the library, not its winner.
  for (const field of read.fields) {
    charge(); const item = scalars.get(canonical(field.path))!;
    const parentPath = containers.get(item.objectId)!.path;
    let object: any = doc;
    for (const key of parentPath) object = object[key];
    if (A.getObjectId(object) !== item.objectId) fail('container-identity');
    const present = field.candidates.filter(c => c.value.kind === 'value');
    const actual = Object.entries(A.getConflicts(object, item.key) ?? {});
    if (actual.length && (actual.length !== present.length || actual.some(([id, value]) => {
      const candidate = present.find(c => c.operationId === id);
      // Pinned getConflicts returns raw strings, unlike materialized ImmutableString fields.
      return typeof value !== 'string' || !candidate || candidate.value.kind !== 'value' || canonical(candidate.value.value) !== value;
    }))) fail('candidate-mismatch');
    if (!present.length && Object.hasOwn(object, item.key)) fail('absent-mismatch');
    if (present.length > 1 && !actual.length) fail('missing-conflicts');
    if (present.length === 1) {
      const value = object[item.key], c = present[0]!;
      if (!(value instanceof A.ImmutableString) || c.value.kind !== 'value' || value.toString() !== canonical(c.value.value)) fail('value-mismatch');
    }
  }
  const input = Object.freeze({ ...(map2 ? { semanticProfile: profile } : {}), schema: schema!, recordMaps: Object.freeze(Object.keys(projectRecordMaps)), history: read.history });
  return { input, scalars: Object.freeze(originals), nodesUsed, workUsed: work + nodesUsed + read.workUsed };
}
