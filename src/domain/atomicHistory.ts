import { cloneCanonicalValue, DomainValidationError, reject, type JsonValue, type ValidationIssue, type ValueLimits } from './values';
import { canonical } from './projectGraphSupport';

export type AtomicValue = Readonly<{ kind: 'value'; value: JsonValue }> | Readonly<{ kind: 'absent' }>;
export interface AtomicWrite { readonly operationId: string; readonly path: readonly string[]; readonly value: AtomicValue }
export interface AtomicChange { readonly id: string; readonly deps: readonly string[]; readonly writes: readonly AtomicWrite[] }
export interface AtomicHistory { readonly token: string; readonly heads: readonly string[]; readonly changes: readonly AtomicChange[] }
export interface AtomicCandidate extends AtomicWrite { readonly changeId: string }
export interface AtomicField { readonly path: readonly string[]; readonly candidates: readonly AtomicCandidate[] }
export interface HistoryReadLimits extends ValueLimits { readonly maxWork: number }
export type AtomicHistoryInspection = Readonly<{ kind: 'rejected'; issue: ValidationIssue }> |
  Readonly<{ kind: 'atomic-history-inspection'; history: AtomicHistory; fields: readonly AtomicField[]; workUsed: number }>;

/** Internal bounded DAG queries. No new persisted history, clock ordering or CRDT writer. */
export class HistoryIndex {
  readonly byId: ReadonlyMap<string, AtomicChange>;
  private work = 0;
  private readonly cache = new Map<string, ReadonlySet<string>>();
  constructor(readonly history: AtomicHistory, private readonly maxWork: number) { this.byId = new Map(history.changes.map(c => [c.id, c])); }
  get workUsed(): number { return this.work; }
  charge(n = 1): void { this.work += n; if (this.work > this.maxWork) reject('limit', ['historyWork']); }
  ancestors(id: string): ReadonlySet<string> {
    this.charge(); const cached = this.cache.get(id); if (cached) return cached;
    const result = new Set<string>(), pending = [...this.byId.get(id)!.deps];
    while (pending.length) { this.charge(); const dep = pending.pop()!; if (result.has(dep)) continue; result.add(dep);
      for (const parent of this.byId.get(dep)!.deps) { this.charge(); pending.push(parent); }
    }
    this.cache.set(id, result); return result;
  }
  before(a: string, b: string): boolean { return a !== b && this.ancestors(b).has(a); }
}

/**
 * Complete original-change evidence supplied by an adapter, NOT imported JSON authority.
 * Reject malformed/partial DAGs. Retain absence, same-value concurrent writes and
 * overwritten history; don't use serialized order, timestamps or a library winner.
 */
export function inspectAtomicHistory(input: unknown, limits: HistoryReadLimits): AtomicHistoryInspection {
  try {
    if (!Number.isSafeInteger(limits.maxWork) || limits.maxWork < 1) reject('limit', ['maxWork']);
    const raw = cloneCanonicalValue(input, limits), obj = (v: any, keys: readonly string[], p: (string | number)[]): any => {
      if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(v, k))) reject('type', p); return v;
    };
    const nonempty = (v: unknown, p: (string | number)[]) => { if (typeof v !== 'string' || !v.length) reject('type', p); };
    const strings = (v: unknown, p: (string | number)[]) => { if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x.length) || new Set(v).size !== v.length) reject('value', p); };
    const r = obj(raw, ['token', 'heads', 'changes'], []); nonempty(r.token, ['token']); strings(r.heads, ['heads']);
    if (!Array.isArray(r.changes) || !r.changes.length) reject('missing', ['changes']);
    const ids = new Set<string>(), opIds = new Set<string>();
    r.changes.forEach((item: unknown, i: number) => {
      const p = ['changes', i], c = obj(item, ['id', 'deps', 'writes'], p); nonempty(c.id, [...p, 'id']); strings(c.deps, [...p, 'deps']);
      if (ids.has(c.id)) reject('identity', [...p, 'id']); ids.add(c.id);
      if (!Array.isArray(c.writes)) reject('type', [...p, 'writes']); const paths = new Set<string>();
      c.writes.forEach((item: unknown, j: number) => {
        const q = [...p, 'writes', j], w = obj(item, ['operationId', 'path', 'value'], q); nonempty(w.operationId, [...q, 'operationId']);
        if (opIds.has(w.operationId)) reject('identity', [...q, 'operationId']); opIds.add(w.operationId);
        if (!Array.isArray(w.path) || !w.path.length || w.path.some((k: unknown) => typeof k !== 'string' || !k.length)) reject('value', [...q, 'path']);
        const key = canonical(w.path); if (paths.has(key)) reject('identity', [...q, 'path']); paths.add(key);
        if (!w.value || (w.value.kind !== 'value' && w.value.kind !== 'absent')) reject('value', [...q, 'value']);
        obj(w.value, w.value.kind === 'value' ? ['kind', 'value'] : ['kind'], [...q, 'value']);
      });
    });
    const history = raw as unknown as AtomicHistory, dependents = new Map<string, string[]>(), counts = new Map<string, number>(), tips = new Set(ids), ready: string[] = [];
    history.changes.forEach((c, i) => { counts.set(c.id, c.deps.length); if (!c.deps.length) ready.push(c.id);
      for (const dep of c.deps) { if (!ids.has(dep)) reject('missing', ['changes', i, 'deps']); tips.delete(dep); const ds = dependents.get(dep) ?? []; ds.push(c.id); dependents.set(dep, ds); }
    });
    for (let i = 0; i < ready.length; i++) for (const next of dependents.get(ready[i]!) ?? []) { const left = counts.get(next)! - 1; counts.set(next, left); if (!left) ready.push(next); }
    if (ready.length !== ids.size) reject('value', ['changes']);
    if (history.heads.length !== tips.size || history.heads.some(id => !tips.has(id))) reject('identity', ['heads']);
    const index = new HistoryIndex(history, limits.maxWork), versions = new Map<string, AtomicCandidate[]>();
    for (const change of history.changes) for (const write of change.writes) {
      const key = canonical(write.path), group = versions.get(key) ?? []; group.push(Object.freeze({ ...write, changeId: change.id })); versions.set(key, group);
    }
    const fields = [...versions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, versions]) => {
      const candidates = versions.filter(v => !versions.some(other => index.before(v.changeId, other.changeId)))
        .sort((a, b) => a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0);
      return Object.freeze({ path: versions[0]!.path, candidates: Object.freeze(candidates) });
    });
    return Object.freeze({ kind: 'atomic-history-inspection', history, fields: Object.freeze(fields), workUsed: index.workUsed });
  } catch (error) { if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue }); throw error; }
}
