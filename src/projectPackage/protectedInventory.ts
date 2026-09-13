import type { ProjectCandidatesInspection } from '../domain/projectCandidates';
import { canonical, immutableKinds, type GraphEdge } from '../domain/projectGraphSupport';
import type { JsonObject, JsonValue } from '../domain/values';
import { PACKAGE_LIMITS as L, type Entry } from './contract';
import { PackageControlError } from './manifest';
import { planWorkspaceClosure } from './closure';

type Reason = 'current' | 'conflict' | 'exchangeBase';
type Candidates = Extract<ProjectCandidatesInspection, { kind: 'project-candidate-inspection' }>;
/** Exact known-profile reason inventory. Base entries must come from verified retained evidence. */
export function protectedWorkspaceInventory(candidates: Candidates, baseEntries: readonly Entry[]) {
  const fail = (): never => { throw new PackageControlError('protected-inventory'); };
  const closure = planWorkspaceClosure(candidates), fields = new Map(candidates.fields.map(f => [JSON.stringify(f.path), f]));
  const maps = new Map<string, string>(), outgoing = new Map<string, GraphEdge[]>();
  let work = closure.workUsed;
  const charge = () => { if (++work > L.closureWork) fail(); };
  for (const f of candidates.fields) {
    charge(); if (f.path[0] === 'identity' || f.path[0] === 'project') continue;
    const id = f.path[1]!, map = f.path[0]!;
    if (maps.has(id) && maps.get(id) !== map) fail(); maps.set(id, map);
  }
  const ambiguous = (path: string[]) => {
    charge(); const f = fields.get(JSON.stringify(path));
    if (!f || !f.valid || !f.candidates.length || f.candidates.some(c => !f.validOperationIds.includes(c.operationId))) return fail();
    if (path.length === 2 && Object.hasOwn(immutableKinds, path[0]!)) {
      if (f.candidates.some(c => c.value.kind !== 'value')) return fail();
      return new Set(f.candidates.map(c => canonical(c.value as unknown as JsonValue))).size !== 1;
    }
    return f.candidates.length !== 1 || f.candidates[0]!.value.kind !== 'value';
  };
  const deleteEdit = new Set(candidates.issues.filter(i => i.code === 'concurrent-delete-edit').map(i => i.path[1]));
  const normalize = (id: string, reason: 'current' | 'conflict'): 'current' | 'conflict' => {
    if (id === 'project' || id.startsWith('blob:')) return reason;
    const map = maps.get(id); if (!map) return fail();
    return !Object.hasOwn(immutableKinds, map) && (ambiguous([map, id, 'lifecycle']) || deleteEdit.has(id)) ? 'conflict' : reason;
  };
  for (const e of candidates.knownReferences) {
    charge(); if (e.strength !== 'strong') continue;
    const edges = outgoing.get(e.from) ?? []; edges.push(e); outgoing.set(e.from, edges);
  }
  const reasons = new Map<string, Set<Reason>>(), seen = new Set<string>(), queue: { id: string; reason: 'current' | 'conflict' }[] = [];
  const visit = (id: string, input: 'current' | 'conflict') => {
    charge(); const reason = normalize(id, input), key = `${id}:${reason}`;
    if (!seen.has(key)) { seen.add(key); queue.push({ id, reason }); }
    if (seen.size > L.closureRecords * 2) fail();
  };
  for (const id of candidates.knownActiveRoots) visit(id, 'current');
  for (let i = 0; i < queue.length; i++) {
    const { id, reason } = queue[i]!;
    if (id.startsWith('blob:')) { const r = reasons.get(id.slice(5)) ?? new Set<Reason>(); r.add(reason); reasons.set(id.slice(5), r); }
    for (const edge of outgoing.get(id) ?? []) {
      charge(); const map = maps.get(id), path = id === 'project' ? ['project', edge.field.split('.')[0]!] :
        map && Object.hasOwn(immutableKinds, map) ? [map, id] : map ? [map, id, edge.field.split('.')[0]!] : fail();
      const conflict = ambiguous(path); visit(edge.to, conflict ? 'conflict' : reason);
    }
  }
  const blobs = new Map<string, { sha256: string; byteLength: number; reasons: Set<Reason> }>();
  for (const e of closure.entries) {
    const r = reasons.get(e.sha256); if (!r?.size) fail(); blobs.set(e.sha256, { sha256: e.sha256, byteLength: e.byteLength, reasons: r! });
  }
  if (reasons.size !== blobs.size) fail();
  for (const e of baseEntries) {
    charge();
    if (!/^[0-9a-f]{64}$/.test(e.sha256) || e.path !== `blobs/sha256/${e.sha256}` || !Number.isSafeInteger(e.byteLength) || e.byteLength <= 0) fail();
    const existing = blobs.get(e.sha256);
    if (existing && existing.byteLength !== e.byteLength) fail();
    const r = existing ?? { sha256: e.sha256, byteLength: e.byteLength, reasons: new Set<Reason>() };
    r.reasons.add('exchangeBase'); blobs.set(e.sha256, r);
  }
  if (blobs.size > L.blobCount || [...blobs.values()].reduce((n, b) => n + b.byteLength, 0) > L.blobBytes) fail();
  const value = { schema: 'lociview-protected-inventory-1', blobs: [...blobs.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
    .map(b => ({ sha256: b.sha256, byteLength: b.byteLength, reasons: [...b.reasons].sort() })) };
  if (new TextEncoder().encode(canonical(value as JsonObject)).length > L.controlBytes) fail();
  return value;
}
