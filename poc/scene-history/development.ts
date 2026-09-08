import type * as Automerge from '@automerge/automerge/slim';
import type { DevelopmentHistory, HistorySnapshot, MemoryUpdate } from '../../src/harness/projectScene/historyPort';

type Api = typeof Automerge;
type Data = { cells: Record<string, Automerge.ImmutableString> };
type Doc = Automerge.Doc<Data>;
type Change = { readonly bytes: Uint8Array; readonly deps: readonly string[] };
// Limits for this disposable, page-memory demonstration only, not product guarantees.
const countLimit = 128, partLimit = 1024 * 1024, totalLimit = 8 * partLimit;
const equal = (a: readonly string[], b: readonly string[]) => [...a].sort().join(',') === [...b].sort().join(',');
function fail(): never { throw new Error('更新を適用できません。元の編集は保持しています。'); }

/** Candidate remains isolated here. No Repo, persistence, network, or package writer. */
export function createDevelopmentPair(A: Api, seed: Readonly<Record<string, string>>,
  validate: (snapshot: HistorySnapshot, previous?: HistorySnapshot) => void): readonly [DevelopmentHistory, DevelopmentHistory] {
  const bootstrap = A.from<Data>({ cells: Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, new A.ImmutableString(v)])) });
  const base = A.getHeads(bootstrap).sort();
  const heads = (doc: Doc) => A.getHeads(doc).sort();
  function index(bytes: readonly Uint8Array[]): Map<string, Change> {
    if (bytes.length > countLimit || bytes.some(b => !(b instanceof Uint8Array) || b.length > partLimit) ||
      bytes.reduce((sum, b) => sum + b.length, 0) > totalLimit) fail();
    const result = new Map<string, Change>();
    for (const raw of bytes) {
      const decoded = A.decodeChange(raw);
      if (result.has(decoded.hash)) fail();
      result.set(decoded.hash, { bytes: raw.slice(), deps: [...decoded.deps] });
    }
    return result;
  }
  function reachable(changes: Map<string, Change>, roots: readonly string[]): Set<string> {
    const found = new Set<string>(), pending = [...roots];
    while (pending.length) {
      const hash = pending.pop()!;
      if (found.has(hash)) continue;
      const change = changes.get(hash); if (!change) fail();
      found.add(hash); pending.push(...change.deps);
    }
    return found;
  }
  const rootHashes = (changes: Map<string, Change>) => [...changes].filter(([, c]) => !c.deps.length).map(([hash]) => hash).sort();
  const roots = rootHashes(index(A.getAllChanges(bootstrap)));
  function snapshot(doc: Doc): HistorySnapshot {
    const cellVersions: Record<string, string> = {};
    // Fixed 3.4.1 flat ImmutableString map only. getConflicts omits single setters.
    // Decode original changes (already bounded above), never derive versions from values/heads.
    const objectId = A.getObjectId(doc.cells), setters = new Map<string, Set<string>>(), removed = new Map<string, Set<string>>();
    if (!objectId) fail();
    for (const bytes of A.getAllChanges(doc)) {
      const change = A.decodeChange(bytes);
      change.ops.forEach((op, i) => {
        if (op.obj !== objectId) return;
        if (typeof op.key !== 'string' || !['set', 'del'].includes(op.action) || ('insert' in op && op.insert) ||
          (op.action === 'set' && (typeof op.value !== 'string' || op.datatype !== undefined))) fail();
        const live = setters.get(op.key) ?? new Set<string>(), dead = removed.get(op.key) ?? new Set<string>();
        if (op.action === 'set') live.add(`${change.startOp + i}@${change.actor}`);
        op.pred.forEach(id => dead.add(id)); setters.set(op.key, live); removed.set(op.key, dead);
      });
    }
    const cells = Object.freeze(
      Object.fromEntries(Object.keys(doc.cells).map(key => {
        const conflicts = A.getConflicts(doc.cells, key);
        const candidates = Object.entries(conflicts ?? {}).map(([id, v]) => {
          // 3.4.1 getConflicts exposes immutable-string candidates as JS strings,
          // while the materialized map property remains ImmutableString.
          if (typeof v !== 'string' && !(v instanceof A.ImmutableString)) fail();
          return Object.freeze({ id, value: v.toString() });
        }).sort((a, b) => a.id.localeCompare(b.id));
        const ids = [...(setters.get(key) ?? [])].filter(id => !removed.get(key)?.has(id)).sort();
        if (!ids.length || (candidates.length > 1 && !equal(ids, candidates.map(c => c.id)))) fail();
        cellVersions[key] = JSON.stringify([objectId, key, ids]);
        const v = doc.cells[key]; if (!(v instanceof A.ImmutableString)) fail();
        return [key, candidates.length > 1 ? Object.freeze({ kind: 'conflict' as const, candidates: Object.freeze(candidates) }) :
          Object.freeze({ kind: 'value' as const, value: v.toString() })];
      })));
    return Object.freeze({ token: `memory-history:${heads(doc).join(',')}`, cells, cellVersions: Object.freeze(cellVersions) });
  }
  function participant(): DevelopmentHistory {
    // clone without actor option allocates an independent actor; edits never mutate the bootstrap.
    let doc = A.clone(bootstrap);
    function publish(staged: Doc): HistorySnapshot {
      index(A.getAllChanges(staged));
      const next = snapshot(staged); validate(next, snapshot(doc)); doc = staged; return next;
    }
    function checkToken(token: string) {
      if (token !== snapshot(doc).token) throw new Error('更新されています。操作を選び直してください。');
    }
    const detached = () => A.clone(doc, { actor: A.getActorId(doc) });
    return {
      read: () => snapshot(doc),
      write(token, changes) {
        checkToken(token);
        if (!Object.keys(changes).length) return snapshot(doc);
        for (const [key, v] of Object.entries(changes)) {
          if (typeof v !== 'string' || snapshot(doc).cells[key]?.kind === 'conflict') fail();
        }
        return publish(A.change(detached(), { time: 0, message: 'synthetic local command' }, draft => {
          for (const [key, v] of Object.entries(changes)) {
            // Explicit same-value writes still record their exact causal field edit.
            if (draft.cells[key]?.toString() === v) delete draft.cells[key];
            draft.cells[key] = new A.ImmutableString(v);
          }
        }));
      },
      choose(token, key, candidateId) {
        checkToken(token);
        const cell = snapshot(doc).cells[key];
        if (cell?.kind !== 'conflict') fail();
        const chosen = cell.candidates.find(c => c.id === candidateId); if (!chosen) fail();
        return publish(A.change(detached(), { time: 0, message: 'explicit synthetic candidate choice' }, draft => {
          // A same-value assignment alone can be a no-op; choice must causally resolve all candidates.
          delete draft.cells[key]; draft.cells[key] = new A.ImmutableString(chosen.value);
        }));
      },
      exportUpdate() {
        const all = index(A.getAllChanges(doc)), seen = reachable(all, base), target = heads(doc);
        const included = reachable(all, target);
        return { base: [...base], target, roots: [...roots],
          changes: [...all].filter(([h]) => included.has(h) && !seen.has(h)).map(([, c]) => c.bytes.slice()) };
      },
      receive(update: MemoryUpdate) {
        if (!equal(update.base, base) || !equal(update.roots, roots)) fail();
        const local = index(A.getAllChanges(doc)), incoming = index(update.changes), combined = new Map([...local, ...incoming]);
        const origin = reachable(combined, base), target = reachable(combined, update.target);
        if (new Set(update.target).size !== update.target.length || [...origin].some(h => !target.has(h))) fail();
        if (!equal(rootHashes(combined), roots) || !equal([...target].filter(h => !origin.has(h)), [...incoming.keys()])) fail();
        const added = [...incoming].filter(([h]) => !local.has(h));
        if (!added.length) return { snapshot: snapshot(doc), added: 0 };
        const [staged] = A.applyChanges(detached(), added.map(([, c]) => c.bytes));
        if (A.getMissingDeps(staged, []).length || !equal([...index(A.getAllChanges(staged)).keys()], [...combined.keys()])) fail();
        return { snapshot: publish(staged), added: added.length };
      },
    };
  }
  validate(snapshot(bootstrap));
  return [participant(), participant()];
}
