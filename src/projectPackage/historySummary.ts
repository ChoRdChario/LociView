import type { ProjectMetadataSource } from '../projectMetadata/source';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkProjectHeader, checkProjectRecord, type ProjectRecordMap } from '../domain/projectRecords';
import { checkMutableField, mutableRecordFields, type MutableRecordMap } from '../domain/projectMutableFields';
import { immutableKinds, canonical } from '../domain/projectGraphSupport';
import { DomainValidationError, type JsonObject } from '../domain/values';
import { PACKAGE_LIMITS as L, SUMMARY_FIELDS } from './contract';
import { PackageControlError } from './manifest';

export type OriginalInspection = Awaited<ReturnType<ProjectMetadataSource['inspectOriginal']>>;

/** Exact addressed-entity counts. Original addresses/values never enter the summary. */
export function summarizeFullHistory(inspection: OriginalInspection) {
  const entities = new Map<string, Set<string>>(), fields = new Map<string, Set<string>>();
  let workUsed = inspection.workUsed;
  const add = (map: Map<string, Set<string>>, key: string, entity: string) => {
    const set = map.get(key) ?? new Set<string>(); set.add(entity); map.set(key, set);
  };
  const opaque = (entity: string) => { add(entities, 'opaque', entity); add(fields, 'opaque.field', entity); };
  // Each node can be revisited by the existing semantic validator; charge this
  // whole finite traversal before invoking it, not a fresh budget per scalar.
  workUsed += inspection.nodesUsed;
  for (const op of inspection.scalars) {
    if (++workUsed > L.inspectionWork) throw new PackageControlError('summary-work-budget');
    const [map, id, field] = op.path;
    let entity = canonical(op.path.slice(0, 2)), group = map!, name: string | undefined;
    const c = new ProjectRecordFields();
    try {
      if (map === 'schema' || map === 'identity' || map === 'project') {
        entity = 'project'; group = 'project'; name = map === 'project' ? id : map;
        if (!SUMMARY_FIELDS.project.includes(name as typeof SUMMARY_FIELDS.project[number])) { add(entities, group, entity); opaque(entity); continue; }
        if (op.value.kind === 'value') checkProjectHeader(c, name!, op.value.value);
      } else if (Object.hasOwn(immutableKinds, map!)) {
        name = 'record';
        if (op.value.kind === 'value') checkProjectRecord(c, map as ProjectRecordMap, op.value.value as JsonObject);
      } else if (Object.hasOwn(mutableRecordFields, map!)) {
        name = field;
        if (!Object.hasOwn(mutableRecordFields[map as MutableRecordMap], field!)) { add(entities, group, entity); opaque(entity); continue; }
        if (op.value.kind === 'value') checkMutableField(c, map as MutableRecordMap, field!, op.value.value);
      } else { opaque(canonical(op.path)); continue; }
    } catch (error) {
      if (error instanceof DomainValidationError) throw new PackageControlError('summary-historical-value-unsupported');
      throw error;
    }
    add(entities, group, entity); add(fields, `${group}.${name}`, entity);
    if (c.unknown) opaque(entity);
  }
  const counts = (map: Map<string, Set<string>>) => Object.freeze([...map.keys()].sort().map(key => Object.freeze({ class: key, count: map.get(key)!.size })));
  return Object.freeze({ entityClasses: counts(entities), fieldClasses: counts(fields), hasOpaque: entities.has('opaque'), workUsed });
}
