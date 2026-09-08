import type * as Automerge from '@automerge/automerge/slim';
import { inspectAtomicHistory, type AtomicChange, type AtomicWrite, type HistoryReadLimits } from '../../src/domain/atomicHistory';
import { canonical } from '../../src/domain/projectGraphSupport';
import type { JsonValue } from '../../src/domain/values';

type Api = typeof Automerge;
type Data = { cells: Record<string, Automerge.ImmutableString> };
export interface FlatReadMapping {
  /** Development schema mapping only; not a filename/path heuristic or portable format. */
  path(key: string): readonly string[];
  value(key: string, text: string): JsonValue;
}
const fail = (): never => { throw new Error('Original atomic read evidence is inconsistent'); };

/**
 * Isolated 3.4.1 flat-string proof. Every original op is checked. The complete
 * final-write DAG also represents absent candidates that getConflicts omits.
 * No Repo/storage, general Automerge schema adapter or production promotion.
 */
export function readFlatAtomicHistory(A: Api, doc: Automerge.Doc<Data>, mapping: FlatReadMapping, limits: HistoryReadLimits) {
  const objectId = A.getObjectId(doc.cells); if (!objectId) fail();
  const paths = new Map<string, string>(), pathKeys = new Map<string, string>();
  const allSets = new Map<string, { key: string; text: string }>(), removed = new Set<string>();
  const changes: AtomicChange[] = [], rawKeys = new Set<string>();
  for (const bytes of A.getAllChanges(doc)) {
    const change = A.decodeChange(bytes), writes = new Map<string, AtomicWrite>();
    change.ops.forEach((op, i) => {
      const operationId = `${change.startOp + i}@${change.actor}`;
      if (op.obj === '_root' && op.key === 'cells' && op.action === 'makeMap' && operationId === objectId && op.pred.length === 0) return;
      if (op.obj !== objectId || typeof op.key !== 'string' || !['set', 'del'].includes(op.action) || ('insert' in op && op.insert) ||
        (op.action === 'set' && (typeof op.value !== 'string' || op.datatype !== undefined))) fail();
      const key = op.key as string, path = mapping.path(key), encoded = canonical(path), previous = paths.get(key), previousKey = pathKeys.get(encoded);
      if ((previous !== undefined && previous !== encoded) || (previousKey !== undefined && previousKey !== key)) fail();
      paths.set(key, encoded); pathKeys.set(encoded, key); rawKeys.add(key);
      if (op.action === 'set') allSets.set(operationId, { key, text: op.value as string });
      for (const pred of op.pred) removed.add(pred);
      writes.set(key, { operationId, path, value: op.action === 'set' ? { kind: 'value', value: mapping.value(key, op.value as string) } : { kind: 'absent' } });
    });
    changes.push({ id: change.hash, deps: [...change.deps].sort(), writes: [...writes.values()] });
  }
  // Enumeration order can differ between actors with identical original heads.
  // Canonicalize only this read view; never rewrite encoded changes or operation IDs.
  changes.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const heads = A.getHeads(doc).sort(), read = inspectAtomicHistory({ token: `memory-history:${heads.join(',')}`, heads, changes }, limits);
  if (read.kind === 'rejected') return read;
  const byPath = new Map(read.fields.map(f => [canonical(f.path), f]));
  // Compare all live string setters with original operations and the actual library
  // candidates. Also inspect keys deleted from the materialized map.
  for (const key of rawKeys) {
    const field = byPath.get(paths.get(key)!) ?? fail();
    const live = [...allSets].filter(([id, v]) => v.key === key && !removed.has(id));
    const present = field.candidates.filter(c => c.value.kind === 'value');
    if (live.length !== present.length || live.some(([id]) => !present.some(c => c.operationId === id))) fail();
    const conflicts = A.getConflicts(doc.cells, key);
    const actual = Object.entries(conflicts ?? {});
    if (actual.length && (actual.length !== live.length || actual.some(([id, value]) => value === null || !live.some(([opId, v]) => opId === id && v.text === value.toString())))) fail();
    if (!live.length) { if (Object.hasOwn(doc.cells, key)) fail(); }
    else if (live.length === 1) { const value = doc.cells[key]; if (!(value instanceof A.ImmutableString) || value.toString() !== live[0]![1].text) fail(); }
    else if (!actual.length) fail();
  }
  if (Object.keys(doc.cells).some(key => !rawKeys.has(key))) fail();
  return read;
}
