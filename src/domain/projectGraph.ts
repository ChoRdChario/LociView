import { admitProjectRecords, projectRecordMaps, type ProjectRecordsAdmission, type ProjectRecordMap } from './projectRecords';
import { canonical, GraphInspection, immutableDigest, immutableKinds, object, same, string, type GraphEdge, type GraphIssue } from './projectGraphSupport';
import { inspectModelGraph } from './projectModelGraph';
import { inspectResourceGraph } from './projectResourceGraph';
import type { JsonObject, ValueLimits } from './values';

export type ProjectGraphInspection = Readonly<{ kind: 'rejected'; input: 'current' | 'prior'; issue: Extract<ProjectRecordsAdmission, { kind: 'rejected' }>['issue'] }> |
  Readonly<{ kind: 'record-graph-inspection'; records: JsonObject; hasUnknownFields: boolean; issues: readonly GraphIssue[];
    knownReferences: readonly GraphEdge[]; knownActiveRoots: readonly string[];
    pendingAuthority: readonly ['all-candidates-and-causality', 'verified-blob-profile-semantics', 'same-token-provider']; }>;

/**
 * One Stage B component, NEVER a valid-Project/SceneResources/save/GC receipt.
 * This reads whole current records, not CRDT winners. The eventual adapter must
 * preserve/check all candidates and immutable provenance before any projection.
 */
export async function inspectProjectGraph(input: unknown, limits: ValueLimits, priorInput?: unknown): Promise<ProjectGraphInspection> {
  const current = admitProjectRecords(input, limits); if (current.kind === 'rejected') return Object.freeze({ ...current, input: 'current' });
  const prior = priorInput === undefined ? undefined : admitProjectRecords(priorInput, limits);
  if (prior?.kind === 'rejected') return Object.freeze({ ...prior, input: 'prior' });
  const g = new GraphInspection(current.records);
  if (prior) inspectPrior(g, prior.records);
  // Sequential hashes bound concurrent preimages; platform failure propagates as failure, never invalid-data/success.
  for (const [map, kind] of Object.entries(immutableKinds)) for (const record of g.all(map as ProjectRecordMap)) {
    if (await immutableDigest(kind, record) !== record.payloadDigest) g.issue(map as ProjectRecordMap, string(record.id), 'payloadDigest', 'immutable-digest-mismatch');
  }
  inspectModelGraph(g); inspectResourceGraph(g);
  if (current.hasUnknownFields) g.issue('project', undefined, '', 'opaque-data-protection-required', 'unverified');
  if (current.records.migrationSupport !== undefined) g.issue('project', undefined, 'migrationSupport', 'migration-support-authority-required', 'unverified');
  const issues = g.issues.map(issue => ({ issue, key: canonical(issue as unknown as JsonObject) }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(({ issue }) => issue);
  return Object.freeze({ kind: 'record-graph-inspection', records: current.records, hasUnknownFields: current.hasUnknownFields,
    issues: Object.freeze(issues), knownReferences: Object.freeze(g.edges), knownActiveRoots: Object.freeze([...g.roots].sort()),
    pendingAuthority: Object.freeze(['all-candidates-and-causality', 'verified-blob-profile-semantics', 'same-token-provider'] as const) });
}

function inspectPrior(g: GraphInspection, prior: JsonObject) {
  if (!same(g.records.identity, prior.identity)) { g.issue('identity', undefined, '', 'prior-lineage-mismatch'); return; }
  if (!same(object(g.records.project).frame, object(prior.project).frame)) g.issue('project', undefined, 'frame', 'immutable-identity-changed');
  const fields: Partial<Record<ProjectRecordMap, readonly string[]>> = { assetsById: ['assetFrameId'], viewsById: ['sceneId', 'projectFrameId'],
    sceneAssetMembershipsById: ['sceneId', 'assetId'], sceneCaptionMembershipsById: ['sceneId', 'captionId'] };
  for (const map of Object.keys(projectRecordMaps) as ProjectRecordMap[]) for (const [id, oldValue] of Object.entries(object(prior[map]))) {
    const record = g.table(map)[id], old = object(oldValue);
    if (!record) { g.issue(map, id, '', 'record-removed-without-tombstone'); continue; }
    if (map in immutableKinds) {
      if (!same(record, old)) g.issue(map, id, '', 'immutable-payload-changed');
    } else for (const field of fields[map] ?? []) if (!same(record[field], old[field])) g.issue(map, id, field, 'immutable-identity-changed');
  }
}
