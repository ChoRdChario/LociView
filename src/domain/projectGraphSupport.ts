import type { ProjectRecordMap } from './projectRecords';
import type { JsonObject, JsonValue } from './values';

/** Internal helpers: inputs have already passed whole-root canonical admission. */
export const object = (v: JsonValue | undefined) => v as JsonObject;
export const list = (v: JsonValue | undefined) => v as readonly JsonValue[];
export const string = (v: JsonValue | undefined) => v as string;
export const active = (r: JsonObject | undefined) => !!r && object(r.lifecycle).state === 'active';
export const canonical = (v: JsonValue): string => v !== null && typeof v === 'object'
  ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
    : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(object(v)[k]!)}`).join(',')}}`
  : JSON.stringify(v);
export const same = (a: JsonValue | undefined, b: JsonValue | undefined) => a === undefined || b === undefined ? a === b : canonical(a) === canonical(b);
export type GraphIssue = Readonly<{ map: ProjectRecordMap | 'project' | 'identity'; id?: string; field: string;
  kind: 'invalid' | 'orphan' | 'needs-review' | 'unverified'; code: string }>;
export type GraphEdge = Readonly<{ from: string; to: string; field: string; strength: 'strong' | 'weak' }>;
export const immutableKinds = { representationsById: 'representation', assetRevisionsById: 'asset-revision',
  assetBindingsById: 'asset-binding-revision', mediaResourcesById: 'media-resource' } as const;

/** Uses actual canonical metadata bytes. No fixture hash/decoder/receipt can replace it. */
export async function immutableDigest(kind: string, record: JsonObject): Promise<string> {
  const { payloadDigest: _, ...payload } = record;
  const bytes = new TextEncoder().encode(`lociview:v2:immutable:${kind}:jcs-v1\n${canonical(payload)}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}

export class GraphInspection {
  readonly issues: GraphIssue[] = [];
  readonly edges: GraphEdge[] = [];
  readonly roots = new Set<string>();
  private readonly issueKeys = new Set<string>();
  constructor(readonly records: JsonObject) {}
  table(map: ProjectRecordMap): Readonly<Record<string, JsonObject>> { return object(this.records[map]) as Readonly<Record<string, JsonObject>>; }
  all(map: ProjectRecordMap): readonly JsonObject[] { return Object.values(this.table(map)); }
  issue(map: GraphIssue['map'], id: string | undefined, field: string, code: string, kind: GraphIssue['kind'] = 'invalid') {
    const key = JSON.stringify([map, id, field, code, kind]); if (this.issueKeys.has(key)) return;
    this.issueKeys.add(key); this.issues.push(Object.freeze({ map, ...(id === undefined ? {} : { id }), field, kind, code }));
  }
  edge(from: string, to: string, field: string, strength: GraphEdge['strength'] = 'strong') {
    this.edges.push(Object.freeze({ from, to, field, strength }));
  }
  ref(map: ProjectRecordMap, record: JsonObject, field: string, targetMap: ProjectRecordMap, strength: GraphEdge['strength'] = 'strong') {
    const target = string(record[field]); this.edge(string(record.id), target, field, strength);
    const resolved = this.table(targetMap)[target]; if (!resolved) this.issue(map, string(record.id), field, 'missing-reference');
    return resolved;
  }
}
