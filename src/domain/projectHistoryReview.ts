import { inspectAtomicHistory, HistoryIndex, type AtomicCandidate, type AtomicField, type AtomicHistory, type HistoryReadLimits } from './atomicHistory';
import { canonical, immutableKinds } from './projectGraphSupport';
import { projectRecordMaps, type ProjectRecordMap } from './projectRecords';
import { lifecycleValue, logicalId } from './recordFields';
import { DomainValidationError, reject, type ValidationIssue } from './values';

export type FieldPolicy = 'immutable' | 'existence' | 'root-default' | 'parent' | 'optional-default' | 'spatial' | 'order' | 'scalar' | 'unknown';
export type HistoryIssue = Readonly<{ path: readonly string[]; kind: 'invalid' | 'review' | 'unverified'; code: string }>;
export type ProjectHistoryReview = Readonly<{ kind: 'rejected'; issue: ValidationIssue }> | Readonly<{ kind: 'project-history-inspection';
  history: AtomicHistory; fields: readonly (AtomicField & { readonly policy: FieldPolicy })[]; issues: readonly HistoryIssue[]; workUsed: number;
  pendingAuthority: readonly ['candidate-values-and-graph', 'verified-blob-profile-semantics', 'same-token-provider'] }>;

/** Known semantic paths are a neutral read representation, not persisted field names in a new adapter. */
export function projectFieldPolicy(path: readonly string[]): FieldPolicy {
  const [map, id, field] = path;
  if (map === 'identity') { if (path.length !== 1) reject('value', ['atomicPath']); return 'immutable'; }
  if (map === 'project') {
    if (path.length !== 2) reject('value', ['atomicPath']);
    return id === 'frame' ? 'immutable' : id === 'title' ? 'scalar' : id === 'defaultSceneId' ? 'root-default' : 'unknown';
  }
  if (!Object.hasOwn(projectRecordMaps, map!)) return 'unknown';
  logicalId(id!, projectRecordMaps[map as ProjectRecordMap], ['atomicPath', 'id']);
  if (Object.hasOwn(immutableKinds, map!)) { if (path.length !== 2) reject('value', ['atomicPath']); return 'immutable'; }
  if (path.length !== 3) reject('value', ['atomicPath']);
  if (field === 'id' || (map === 'assetsById' && field === 'assetFrameId') || (map === 'viewsById' && ['sceneId', 'projectFrameId'].includes(field!)) ||
    (map === 'sceneAssetMembershipsById' && ['sceneId', 'assetId'].includes(field!)) || (map === 'sceneCaptionMembershipsById' && ['sceneId', 'captionId'].includes(field!))) return 'immutable';
  if (field === 'lifecycle' || (map === 'assetsById' && field === 'status')) return 'existence';
  if ((map === 'captionAttachmentsById' && ['captionId', 'mediaResourceId'].includes(field!)) || (map === 'captionTagMembershipsById' && ['captionId', 'tagId'].includes(field!)) || (map === 'materialOverridesById' && field === 'routing')) return 'parent';
  if (map === 'scenesById' && field === 'defaultViewId') return 'optional-default';
  if ((map === 'captionsById' && field === 'anchor') || (map === 'viewsById' && ['camera', 'background'].includes(field!)) || (map === 'materialOverridesById' && ['appearance', 'compositing'].includes(field!))) return 'spatial';
  if (field === 'orderKey' && ['scenesById', 'viewsById', 'captionAttachmentsById', 'captionTagsById', 'sceneAssetMembershipsById', 'sceneCaptionMembershipsById'].includes(map!)) return 'order';
  const scalars: Partial<Record<ProjectRecordMap, readonly string[]>> = { assetsById: ['label'], captionsById: ['title', 'body', 'colorSrgb'], captionAttachmentsById: ['altText'], captionTagsById: ['label', 'colorSrgb'], scenesById: ['name'], viewsById: ['name'] };
  return scalars[map as ProjectRecordMap]?.includes(field!) ? 'scalar' : 'unknown';
}

/** Inspection only. Every unknown candidate and historical value is retained; no field winner or Project projection. */
export function reviewProjectHistory(input: unknown, limits: HistoryReadLimits): ProjectHistoryReview {
  const read = inspectAtomicHistory(input, limits); if (read.kind === 'rejected') return read;
  try {
    const index = new HistoryIndex(read.history, limits.maxWork - read.workUsed), issues: HistoryIssue[] = [], allWrites = new Map<string, AtomicCandidate[]>();
    const key = (path: readonly string[]) => JSON.stringify(path);
    for (const change of read.history.changes) for (const write of change.writes) {
      const address = key(write.path), group = allWrites.get(address) ?? []; group.push({ ...write, changeId: change.id }); allWrites.set(address, group);
    }
    const issue = (path: readonly string[], code: string, kind: HistoryIssue['kind'] = 'invalid') => issues.push(Object.freeze({ path, code, kind }));
    const fields = read.fields.map(f => {
      const policy = projectFieldPolicy(f.path), history = allWrites.get(key(f.path))!;
      if (policy === 'unknown') issue(f.path, 'unknown-field-policy', 'unverified');
      else if (policy === 'immutable') {
        const first = history[0]!.value, expected = first.kind === 'value' ? canonical(first.value) : undefined;
        const changed = history.some(v => v.value.kind === 'absent' || canonical(v.value.value) !== expected);
        if (changed) issue(f.path, 'immutable-history-mutation');
        const exactImmutableRecord = f.path.length === 2 && Object.hasOwn(immutableKinds, f.path[0]!);
        if (f.candidates.length > 1 && (!exactImmutableRecord || changed)) issue(f.path, 'immutable-field-conflict');
      } else if (f.candidates.length > 1) issue(f.path, 'atomic-field-conflict', 'review');
      return Object.freeze({ ...f, policy });
    });
    const entityWrites = new Map<string, AtomicCandidate[]>();
    for (const versions of allWrites.values()) for (const write of versions) if (write.path.length === 3 && Object.hasOwn(projectRecordMaps, write.path[0]!)) {
      const id = key(write.path.slice(0, 2)), group = entityWrites.get(id) ?? []; group.push(write); entityWrites.set(id, group);
    }
    for (const writes of entityWrites.values()) {
      const life = writes.filter(w => w.path[2] === 'lifecycle').map(w => ({ write: w, event: w.value.kind === 'value' ? lifecycleValue(w.value.value) : reject('missing', ['lifecycle']) }));
      if (!life.length) { issue(Object.freeze(writes[0]!.path.slice(0, 2)), 'lifecycle-history-required', 'unverified'); continue; }
      const edits = writes.filter(w => w.path[2] !== 'lifecycle'), eventIds = new Set<string>();
      for (const l of life) {
        if (eventIds.has(l.event.eventId)) issue(l.write.path, 'lifecycle-event-reused'); eventIds.add(l.event.eventId);
        if (l.event.state === 'active' && (l.event.reason === 'initial' || l.event.reason === undefined) && life.some(d => d.event.state === 'deleted' && index.before(d.write.changeId, l.write.changeId))) issue(l.write.path, 'initial-after-delete');
      }
      for (const deleted of life.filter(l => l.event.state === 'deleted')) for (const edit of edits) {
        index.charge();
        if (index.before(deleted.write.changeId, edit.changeId) && !life.some(r => r.event.state === 'active' && ['restore', 'conflictResolution', 'migrationResolution'].includes(r.event.reason ?? '') &&
          (r.write.changeId === edit.changeId || index.before(r.write.changeId, edit.changeId)) && index.before(deleted.write.changeId, r.write.changeId))) issue(edit.path, 'edit-after-delete-without-restore');
      }
      const latest = life.filter(l => !life.some(other => index.before(l.write.changeId, other.write.changeId)));
      for (const d of latest.filter(l => l.event.state === 'deleted')) if (edits.some(e => e.changeId !== d.write.changeId && !index.before(e.changeId, d.write.changeId) && !index.before(d.write.changeId, e.changeId))) issue(d.write.path, 'concurrent-delete-edit', 'review');
    }
    const deduplicated = [...new Map(issues.map(i => [JSON.stringify(i), i])).values()];
    return Object.freeze({ kind: 'project-history-inspection', history: read.history, fields: Object.freeze(fields), issues: Object.freeze(deduplicated),
      workUsed: read.workUsed + index.workUsed,
      pendingAuthority: Object.freeze(['candidate-values-and-graph', 'verified-blob-profile-semantics', 'same-token-provider'] as const) });
  } catch (error) { if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue }); throw error; }
}
