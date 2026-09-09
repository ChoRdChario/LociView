import { reviewProjectHistory, type FieldPolicy } from './projectHistoryReview';
import type { AtomicCandidate, AtomicField, AtomicHistory, HistoryReadLimits } from './atomicHistory';
import { checkProjectHeader, checkProjectRecord, projectRecordMaps, type ProjectRecordMap } from './projectRecords';
import { checkMutableField, mutableRecordFields, type MutableRecordMap } from './projectMutableFields';
import { ProjectRecordFields } from './projectRecordFields';
import { checkMaterialCoupling } from './materialIntent';
import { GraphInspection, canonical, immutableDigest, immutableKinds, object, same, type GraphEdge, type GraphIssue } from './projectGraphSupport';
import { inspectModelGraph } from './projectModelGraph';
import { inspectAnchors, inspectResourceGraph } from './projectResourceGraph';
import { inspectCandidateReferences, type CandidateReferencePort } from './projectCandidateReferences';
import { cloneCanonicalValue, DomainValidationError, reject, type JsonObject, type JsonValue, type ValidationIssue } from './values';

export type CandidateField = AtomicField & { readonly policy: FieldPolicy; readonly valid: boolean; readonly validOperationIds: readonly string[]; readonly hasUnknownFields: boolean };
export type CandidateIssue = Readonly<{ path: readonly string[]; kind: 'invalid' | 'review' | 'orphan' | 'unverified'; code: string; operationId?: string }>;
export interface ProjectCandidateInput {
  /** From the adapter's complete decoded-root inspection, including empty maps. */
  readonly schema: JsonObject;
  readonly recordMaps: readonly string[];
  readonly history: AtomicHistory;
}
export type ProjectCandidatesInspection = Readonly<{ kind: 'rejected'; issue: ValidationIssue }> | Readonly<{
  kind: 'project-candidate-inspection'; token: string; source: ProjectCandidateInput; fields: readonly CandidateField[];
  issues: readonly CandidateIssue[]; knownReferences: readonly GraphEdge[]; knownActiveRoots: readonly string[];
  /** Diagnostic partial records ONLY. Missing here may mean conflict, never source deletion. */
  unambiguousRecords: JsonObject; hasUnknownFields: boolean; workUsed: number;
  pendingAuthority: readonly ['verified-blob-profile-semantics', 'closure-projection-and-same-token-provider'];
}>;
const address = (path: readonly string[]) => JSON.stringify(path);
const headerPaths = [['identity'], ['project', 'title'], ['project', 'frame'], ['project', 'defaultSceneId']] as const;

/** Complete current candidate values and reference inspection; no winner, storage or SceneResources receipt. */
export async function inspectProjectCandidates(input: unknown, limits: HistoryReadLimits): Promise<ProjectCandidatesInspection> {
  try {
    const raw = cloneCanonicalValue(input, limits), c = new ProjectRecordFields(), envelope = c.object(raw, []);
    if (Object.keys(envelope).sort().join(',') !== 'history,recordMaps,schema') reject('key', []);
    checkProjectHeader(c, 'schema', c.required(envelope, 'schema', []));
    const maps = c.list(c.required(envelope, 'recordMaps', []), limits.maxNodes, ['recordMaps']);
    if (maps.some(m => typeof m !== 'string' || !m.length) || new Set(maps).size !== maps.length ||
      Object.keys(projectRecordMaps).some(map => !maps.includes(map))) reject('missing', ['recordMaps']);
    const read = reviewProjectHistory(c.required(envelope, 'history', []), limits); if (read.kind === 'rejected') return read;
    let work = read.workUsed;
    const charge = (n = 1) => { work += n; if (work > limits.maxWork) reject('limit', ['candidateWork']); };
    const issues: CandidateIssue[] = [...read.issues], fields: CandidateField[] = [], bad = new Set<string>();
    const report = (path: readonly string[], code: string, kind: CandidateIssue['kind'] = 'invalid', operationId?: string) => {
      issues.push(Object.freeze({ path: Object.freeze([...path]), code, kind, ...(operationId ? { operationId } : {}) }));
    };
    let hasUnknownFields = c.unknown || maps.some(map => !Object.hasOwn(projectRecordMaps, map as string));
    const digests = new Map<string, string>();
    for (const f of read.fields) {
      let valid = true, unknown = f.policy === 'unknown'; const validOperationIds: string[] = [];
      for (const candidate of f.candidates) {
        charge(); const guard = new ProjectRecordFields(), [map, id, field] = f.path;
        try {
          const v = candidate.value.kind === 'value' ? candidate.value.value : undefined;
          if (map === 'identity' || map === 'project') {
            const name = map === 'identity' ? 'identity' : id!;
            if (headerPaths.some(p => address(p) === address(f.path))) {
              checkProjectHeader(guard, name, v === undefined ? reject('missing', f.path) : v);
            } else unknown = true;
          } else if (Object.hasOwn(immutableKinds, map!)) {
            const present = v === undefined ? reject('missing', f.path) : v;
            const record = guard.object(present, []); checkProjectRecord(guard, map as ProjectRecordMap, record);
            if (guard.id(guard.required(record, 'id', []), projectRecordMaps[map as ProjectRecordMap], ['id']) !== id) reject('identity', ['id']);
            const encoded = canonical(present), cacheKey = `${map}:${encoded}`;
            let digest = digests.get(cacheKey); if (digest === undefined) { digest = await immutableDigest(immutableKinds[map as keyof typeof immutableKinds], record); digests.set(cacheKey, digest); }
            if (digest !== record.payloadDigest) reject('identity', ['payloadDigest']);
          } else if (Object.hasOwn(mutableRecordFields, map!)) {
            checkMutableField(guard, map as MutableRecordMap, field!, v);
            if (field === 'id' && v !== id) reject('identity', ['id']);
          } else unknown = true;
          unknown ||= guard.unknown;
          validOperationIds.push(candidate.operationId);
        } catch (error) {
          if (!(error instanceof DomainValidationError)) throw error;
          valid = false; report(f.path, `candidate-${error.issue.code}`, 'invalid', candidate.operationId);
        }
      }
      if (!valid) bad.add(address(f.path)); hasUnknownFields ||= unknown;
      fields.push(Object.freeze({ ...f, valid, validOperationIds: Object.freeze(validOperationIds), hasUnknownFields: unknown }));
    }
    const index = new Map(fields.map(f => [address(f.path), f]));
    for (const issue of read.issues) if (issue.kind === 'invalid' || issue.code === 'concurrent-delete-edit') bad.add(address(issue.path));
    const entities = new Map<string, { map: ProjectRecordMap; id: string }>();
    for (const f of fields) if (Object.hasOwn(projectRecordMaps, f.path[0]!)) entities.set(address(f.path.slice(0, 2)), { map: f.path[0] as ProjectRecordMap, id: f.path[1]! });
    if (entities.size > 1_000_000) reject('limit', ['entities']);
    for (const p of headerPaths) if (!index.has(address(p))) { report(p, 'required-field-missing'); bad.add(address(p)); }
    for (const { map, id } of entities.values()) if (Object.hasOwn(mutableRecordFields, map)) {
      for (const [field, rule] of Object.entries(mutableRecordFields[map as MutableRecordMap])) if (!rule.optional && !index.has(address([map, id, field]))) {
        report([map, id, field], 'required-field-missing'); bad.add(address([map, id, field]));
      }
    }
    const getField = (path: readonly string[]) => index.get(address(path));
    const candidates = (path: readonly string[]): readonly AtomicCandidate[] => {
      const f = getField(path); return f ? f.candidates.filter(c => f.validOperationIds.includes(c.operationId)) : [];
    };
    const resolved = (path: readonly string[]): JsonValue | undefined => {
      if (bad.has(address(path))) return undefined;
      const f = getField(path); if (!f?.valid || !f.candidates.length) return undefined;
      // Equal complete immutable registrations have one canonical payload, NOT an operation winner.
      const equalImmutable = path.length === 2 && Object.hasOwn(immutableKinds, path[0]!) && f.candidates.every(v => same(v.value as unknown as JsonValue, f.candidates[0]!.value as unknown as JsonValue));
      if (f.candidates.length !== 1 && !equalImmutable) return undefined;
      const v = f.candidates[0]!.value; return v.kind === 'value' ? v.value : undefined;
    };
    const records: Record<string, any> = { schema: envelope.schema, identity: resolved(['identity']) ?? {}, project: {} };
    for (const map of Object.keys(projectRecordMaps)) records[map] = Object.create(null);
    for (const f of fields) {
      const [map, id, field] = f.path, v = resolved(f.path);
      if (map === 'project' && v !== undefined) records.project[id!] = v;
      else if (Object.hasOwn(immutableKinds, map!)) { if (v !== undefined) records[map!][id!] = v; }
      else if (Object.hasOwn(mutableRecordFields, map!)) {
        const record = records[map!][id!] ??= { id }; if (v !== undefined) record[field!] = v;
      }
    }
    for (const { map, id } of entities.values()) if (map === 'materialOverridesById') {
      const a = resolved([map, id, 'appearance']), comp = resolved([map, id, 'compositing']);
      if (a !== undefined && comp !== undefined) try { checkMaterialCoupling(object(a), object(comp)); }
      catch (error) { if (!(error instanceof DomainValidationError)) throw error; report([map, id, 'appearance'], 'incompatible-material-intent'); }
    }
    const g = new GraphInspection(records); inspectModelGraph(g); inspectResourceGraph(g);
    const anchors: JsonObject[] = [];
    for (const { map, id } of entities.values()) if (map === 'captionsById') for (const c of candidates([map, id, 'anchor'])) if (c.value.kind === 'value') {
      const life = resolved([map, id, 'lifecycle']); anchors.push({ id, anchor: c.value.value, ...(life !== undefined ? { lifecycle: life } : {}) });
    }
    inspectAnchors(g, anchors);
    for (const i of g.issues) report(graphPath(i), i.code, i.kind === 'needs-review' ? 'review' : i.kind);
    const port: CandidateReferencePort = { entities: [...entities.values()], candidates, resolved, charge, report,
      edge: edge => g.edges.push(Object.freeze(edge)), root: id => g.roots.add(id) };
    inspectCandidateReferences(port);
    // Unknown semantics and the exact caller source remain retained, not a clean/export/GC permit.
    if (hasUnknownFields) report([], 'opaque-data-protection-required', 'unverified');
    const frozenRecords = cloneCanonicalValue(records, limits) as JsonObject;
    const uniqueIssues = [...new Map(issues.map(i => [JSON.stringify(i), i])).values()];
    const uniqueEdges = [...new Map(g.edges.map(e => [JSON.stringify(e), e])).values()];
    return Object.freeze({ kind: 'project-candidate-inspection', token: read.history.token, source: raw as unknown as ProjectCandidateInput,
      fields: Object.freeze(fields), issues: Object.freeze(uniqueIssues), knownReferences: Object.freeze(uniqueEdges),
      knownActiveRoots: Object.freeze([...g.roots].sort()), unambiguousRecords: frozenRecords, hasUnknownFields, workUsed: work,
      pendingAuthority: Object.freeze(['verified-blob-profile-semantics', 'closure-projection-and-same-token-provider'] as const) });
  } catch (error) { if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue }); throw error; }
}
function graphPath(i: GraphIssue): readonly string[] { return [i.map, ...(i.id ? [i.id] : []), ...(i.field ? [i.field] : [])]; }
