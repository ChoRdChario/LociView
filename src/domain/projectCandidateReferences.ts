import type { AtomicCandidate } from './atomicHistory';
import type { ProjectRecordMap } from './projectRecords';
import { immutableKinds, object, list, string, type GraphEdge } from './projectGraphSupport';
import type { JsonValue } from './values';

export interface CandidateReferencePort {
  readonly entities: readonly { map: ProjectRecordMap; id: string }[];
  candidates(path: readonly string[]): readonly AtomicCandidate[];
  resolved(path: readonly string[]): JsonValue | undefined;
  report(path: readonly string[], code: string, kind?: 'invalid' | 'review' | 'orphan' | 'unverified', operationId?: string): void;
  charge(n?: number): void;
  edge(edge: GraphEdge): void;
  root(id: string): void;
}
/** All current candidates reserve references. Historical weak references are not promoted to roots. */
export function inspectCandidateReferences(p: CandidateReferencePort): void {
  const entities = new Set(p.entities.map(e => JSON.stringify([e.map, e.id])));
  const exists = (map: ProjectRecordMap, id: string) => entities.has(JSON.stringify([map, id]));
  const values = (path: readonly string[]) => p.candidates(path).flatMap(c => c.value.kind === 'value' ? [{ value: c.value.value, operationId: c.operationId }] : []);
  const life = (map: ProjectRecordMap, id: string) => p.resolved([map, id, 'lifecycle']);
  const deleted = (map: ProjectRecordMap, id: string) => { const v = life(map, id); return v !== undefined && object(v).state === 'deleted'; };
  const keyOwners = new Map<string, Set<string>>(), ownerPaths = new Map<string, readonly string[]>();
  const reserve = (key: readonly JsonValue[], id: string, path: readonly string[]) => {
    p.charge(); const encoded = JSON.stringify(key), group = keyOwners.get(encoded) ?? new Set<string>(); group.add(id); keyOwners.set(encoded, group); ownerPaths.set(id, path);
  };
  const ref = (path: readonly string[], targetMap: ProjectRecordMap, target: string, operationId?: string, strength: GraphEdge['strength'] = 'strong') => {
    p.charge(); const from = path[0] === 'project' ? 'project' : path[1]!;
    p.edge({ from, to: target, field: path.slice(path[0] === 'project' ? 1 : 2).join('.'), strength });
    if (!exists(targetMap, target)) { if (strength === 'strong') p.report(path, 'missing-candidate-reference', Object.hasOwn(immutableKinds, targetMap) ? 'invalid' : 'orphan', operationId); return; }
    if (strength === 'weak') return;
    if (Object.hasOwn(immutableKinds, targetMap)) {
      if (p.resolved([targetMap, target]) === undefined) p.report(path, 'unresolved-reference', 'review', operationId);
    } else { const targetLife = life(targetMap, target);
      if (targetLife === undefined) p.report(path, 'pending-orphan-reference', 'review', operationId);
      else if (object(targetLife).state === 'deleted') p.report(path, 'deleted-reference', 'orphan', operationId);
    }
  };
  for (const candidate of values(['project', 'defaultSceneId'])) ref(['project', 'defaultSceneId'], 'scenesById', string(candidate.value), candidate.operationId);
  const counts = new Map<string, Set<string>>();
  for (const { map, id } of p.entities) {
    p.charge();
    if (Object.hasOwn(immutableKinds, map)) {
      // A malformed sibling closes the record's projection, not the well-formed
      // candidate's reference inventory. No immutable candidate is selected here.
      for (const c of values([map, id])) {
        p.charge(); const record = object(c.value), path = [map, id];
        if (record.blob) p.edge({ from: id, to: `blob:${string(object(record.blob).digest)}`, field: 'blob', strength: 'strong' });
        for (const [field, targetMap, strength] of [
          ['assetRevisionId', 'assetRevisionsById', 'strong'], ['parentRevisionId', 'assetRevisionsById', 'weak'], ['parentBindingId', 'assetBindingsById', 'weak'],
        ] as const) if (record[field]) ref([...path, field], targetMap, string(record[field]), c.operationId, strength);
        for (const field of ['representationIds', 'derivedFrom']) if (record[field]) for (const target of list(record[field])) ref([...path, field], 'representationsById', string(target), c.operationId);
        for (const field of ['derivation', 'provenance']) if (record[field]) for (const digest of list(object(record[field]).inputBlobDigests))
          p.edge({ from: id, to: `blob:${string(digest)}`, field: `${field}.inputBlobDigests`, strength: 'weak' });
      }
      continue;
    }
    const isDeleted = deleted(map, id);
    if (!isDeleted) p.root(id); // Includes lifecycle conflicts and delete/edit review with a single tombstone setter.
    const path = (field: string) => [map, id, field];
    const endpoints: readonly [string, ProjectRecordMap][] = map === 'captionAttachmentsById' ? [['captionId', 'captionsById'], ['mediaResourceId', 'mediaResourcesById']] :
      map === 'captionTagMembershipsById' ? [['captionId', 'captionsById'], ['tagId', 'captionTagsById']] :
      map === 'sceneAssetMembershipsById' ? [['sceneId', 'scenesById'], ['assetId', 'assetsById']] :
      map === 'sceneCaptionMembershipsById' ? [['sceneId', 'scenesById'], ['captionId', 'captionsById']] : map === 'viewsById' ? [['sceneId', 'scenesById']] : [];
    for (const [field, targetMap] of endpoints) for (const c of values(path(field))) {
      if (!isDeleted) ref(path(field), targetMap, string(c.value), c.operationId);
      if ((map === 'captionAttachmentsById' || map === 'captionTagMembershipsById') && field === 'captionId') {
        const key = JSON.stringify([map, c.value]), entries = counts.get(key) ?? new Set<string>(); entries.add(id); counts.set(key, entries);
      }
    }
    if (isDeleted) continue;
    if (map === 'sceneAssetMembershipsById' || map === 'sceneCaptionMembershipsById' || map === 'captionTagMembershipsById') {
      const [first, second] = endpoints;
      for (const a of values(path(first![0]))) for (const b of values(path(second![0]))) reserve([map, a.value, b.value], id, [map, id]);
    } else if (map === 'scenesById') {
      for (const c of values(path('defaultViewId'))) {
        const view = string(c.value); ref(path('defaultViewId'), 'viewsById', view, c.operationId);
        const scene = p.resolved(['viewsById', view, 'sceneId']);
        if (scene !== undefined && scene !== id) p.report(path('defaultViewId'), 'wrong-scene-entry-view', 'review', c.operationId);
      }
    } else if (map === 'assetsById') {
      for (const c of values(path('status'))) { const status = object(c.value); if (status.kind !== 'ready') continue;
        const bindingId = string(status.activeBindingId); ref(path('status'), 'assetBindingsById', bindingId, c.operationId);
        const binding = p.resolved(['assetBindingsById', bindingId]);
        if (binding !== undefined && object(binding).assetId !== id) p.report(path('status'), 'foreign-binding-owner', 'invalid', c.operationId);
      }
    } else if (map === 'captionsById') {
      for (const c of values(path('anchor'))) { const anchor = object(c.value);
        if (anchor.kind === 'asset') ref(path('anchor'), 'assetsById', string(anchor.assetId), c.operationId);
      }
    } else if (map === 'materialOverridesById') {
      for (const c of values(path('routing'))) {
        const r = object(c.value), scope = object(r.scope), target = object(r.target), assetId = string(target.assetId);
        reserve([map, scope.kind!, scope.sceneId ?? null, assetId, target.variantFamilyId!, target.materialLayoutId!, target.logicalMaterialSlotId!], id, path('routing'));
        ref(path('routing'), 'assetsById', assetId, c.operationId);
        if (scope.kind === 'scene') ref(path('routing'), 'scenesById', string(scope.sceneId), c.operationId);
        const statuses = values(['assetsById', assetId, 'status']);
        for (const s of statuses) {
          p.charge(); const status = object(s.value), binding = status.kind === 'ready' ? p.resolved(['assetBindingsById', string(status.activeBindingId)]) : undefined;
          const revision = binding && object(binding).assetId === assetId ? p.resolved(['assetRevisionsById', string(object(binding).assetRevisionId)]) : undefined;
          if (!revision || object(revision).assetId !== assetId) continue;
          const reps = list(object(revision).representationIds).flatMap(id => { const r = p.resolved(['representationsById', string(id)]); return r ? [object(r)] : []; });
          if (!reps.some(r => r.assetId === assetId && r.variantFamilyId === target.variantFamilyId && r.materialCatalog &&
            object(r.materialCatalog).layoutId === target.materialLayoutId && list(object(r.materialCatalog).slots).some(slot => object(slot).logicalMaterialSlotId === target.logicalMaterialSlotId)))
            p.report(path('routing'), 'candidate-target-not-in-catalog', 'review', c.operationId);
        }
      }
    }
  }
  for (const owners of keyOwners.values()) if (owners.size > 1) for (const owner of owners) p.report(ownerPaths.get(owner)!, 'candidate-semantic-key-reserved', 'review');
  for (const [key, ids] of counts) if (ids.size > 4096) { const [map, captionId] = JSON.parse(key) as string[]; p.report([map!, captionId!, 'captionId'], 'candidate-child-count-exceeded'); }
}
