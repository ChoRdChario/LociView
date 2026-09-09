import { projectRecordMaps } from '../../src/domain/projectRecords';
import { immutableKinds } from '../../src/domain/projectGraphSupport';
import type { AtomicChange, AtomicWrite } from '../../src/domain/atomicHistory';
import type { ProjectCandidateInput } from '../../src/domain/projectCandidates';
import type { JsonValue } from '../../src/domain/values';
import { fixture } from './projectRecordsFixture';

/** Decoded synthetic adapter evidence only; never metadata-library/source proof. */
export function candidateFixture(records = fixture()): ProjectCandidateInput {
  const fields: { path: string[]; value: JsonValue }[] = [{ path: ['identity'], value: records.identity }];
  for (const [field, value] of Object.entries(records.project)) fields.push({ path: ['project', field], value: value as JsonValue });
  for (const map of Object.keys(projectRecordMaps)) for (const [id, record] of Object.entries(records[map])) {
    if (Object.hasOwn(immutableKinds, map)) fields.push({ path: [map, id], value: record as JsonValue });
    else for (const [field, value] of Object.entries(record as object)) fields.push({ path: [map, id, field], value: value as JsonValue });
  }
  for (const key of Object.keys(records)) if (!['schema', 'identity', 'project', ...Object.keys(projectRecordMaps)].includes(key)) fields.push({ path: [key], value: records[key] });
  return { schema: records.schema, recordMaps: Object.keys(projectRecordMaps), history: { token: 'synthetic:root', heads: ['root'],
    changes: [{ id: 'root', deps: [], writes: fields.map((f, i) => ({ ...f, operationId: `seed-${i}`, value: { kind: 'value', value: f.value } })) }] } };
}
export const candidateWrite = (operationId: string, path: readonly string[], value: JsonValue | undefined): AtomicWrite => ({ operationId, path,
  value: value === undefined ? { kind: 'absent' } : { kind: 'value', value } });
export function withCandidateChanges(source: ProjectCandidateInput, changes: readonly AtomicChange[]): ProjectCandidateInput {
  const all = [...source.history.changes, ...changes], parents = new Set(all.flatMap(c => c.deps)), heads = all.filter(c => !parents.has(c.id)).map(c => c.id);
  return { ...source, history: { token: `synthetic:${heads.join(',')}`, heads, changes: all } };
}
