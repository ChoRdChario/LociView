import { active, GraphInspection, list, object, string } from './projectGraphSupport';
import type { ProjectRecordMap } from './projectRecords';
import type { JsonObject } from './values';
const knownUnavailable = (r: JsonObject | undefined) => !r || (r.lifecycle !== undefined && !active(r));

/** Current records only. Candidate reservation and causal delete/edit still gate the provider. */
export function inspectResourceGraph(g: GraphInspection): void {
  const project = object(g.records.project), frameId = object(project.frame ?? {}).id, scenes = g.table('scenesById');
  const defaultId = string(project.defaultSceneId); g.roots.add('project');
  if (defaultId !== undefined) { g.edge('project', defaultId, 'defaultSceneId');
    if (!active(scenes[defaultId])) g.issue('project', undefined, 'defaultSceneId', 'unavailable-default-scene', 'needs-review'); }
  for (const map of ['scenesById', 'captionsById', 'captionAttachmentsById', 'captionTagsById', 'captionTagMembershipsById', 'sceneAssetMembershipsById', 'sceneCaptionMembershipsById', 'viewsById', 'materialOverridesById'] as const)
    for (const r of g.all(map)) if (active(r)) g.roots.add(string(r.id));
  for (const media of g.all('mediaResourcesById')) {
    g.edge(string(media.id), `blob:${string(object(media.blob).digest)}`, 'blob');
    g.issue('mediaResourcesById', string(media.id), 'blob', 'verified-media-bytes-required', 'unverified');
  }
  const endpoint = (map: ProjectRecordMap, r: JsonObject, field: string, targetMap: ProjectRecordMap, immutable = false) => {
    if (r[field] === undefined) return;
    const id = string(r[field]), target = g.table(targetMap)[id]; g.edge(string(r.id), id, field);
    if (active(r) && (!target || (!immutable && knownUnavailable(target)))) g.issue(map, string(r.id), field, 'unavailable-endpoint', 'orphan');
    else if (active(r) && !immutable && target?.lifecycle === undefined) g.issue(map, string(r.id), field, 'pending-orphan-reference', 'needs-review');
  };
  for (const [map, fields] of [
    ['captionAttachmentsById', [['captionId', 'captionsById'], ['mediaResourceId', 'mediaResourcesById']]],
    ['captionTagMembershipsById', [['captionId', 'captionsById'], ['tagId', 'captionTagsById']]],
    ['sceneAssetMembershipsById', [['sceneId', 'scenesById'], ['assetId', 'assetsById']]],
    ['sceneCaptionMembershipsById', [['sceneId', 'scenesById'], ['captionId', 'captionsById']]],
  ] as const) for (const r of g.all(map)) for (const [field, targetMap] of fields) endpoint(map, r, field, targetMap, targetMap === 'mediaResourcesById');
  for (const [map, keys] of [['sceneAssetMembershipsById', ['sceneId', 'assetId']], ['sceneCaptionMembershipsById', ['sceneId', 'captionId']], ['captionTagMembershipsById', ['captionId', 'tagId']]] as const)
    duplicates(g, map, r => keys.some(k => r[k] === undefined) ? undefined : JSON.stringify(keys.map(k => r[k])));
  for (const view of g.all('viewsById')) {
    endpoint('viewsById', view, 'sceneId', 'scenesById');
    if (view.projectFrameId !== undefined && frameId !== undefined && view.projectFrameId !== frameId) g.issue('viewsById', string(view.id), 'projectFrameId', 'wrong-project-frame');
  }
  for (const scene of g.all('scenesById')) if (scene.defaultViewId) {
    const view = g.table('viewsById')[string(scene.defaultViewId)]; g.edge(string(scene.id), string(scene.defaultViewId), 'defaultViewId');
    if (active(scene) && (!active(view) || view!.sceneId !== scene.id || view!.projectFrameId !== frameId))
      g.issue('scenesById', string(scene.id), 'defaultViewId', 'unavailable-entry-view', 'needs-review');
  }
  inspectAnchors(g);
  const materials = g.all('materialOverridesById');
  for (const m of materials) {
    if (m.routing === undefined) continue;
    const id = string(m.id), routing = object(m.routing), target = object(routing.target), scope = object(routing.scope), asset = g.table('assetsById')[string(target.assetId)];
    g.edge(id, string(target.assetId), 'routing.target.assetId');
    if (scope.kind === 'scene') { g.edge(id, string(scope.sceneId), 'routing.scope.sceneId');
      if (active(m) && knownUnavailable(scenes[string(scope.sceneId)])) g.issue('materialOverridesById', id, 'routing', 'unavailable-endpoint', 'orphan'); }
    if (!active(m)) continue;
    if (!active(asset)) { g.issue('materialOverridesById', id, 'routing', knownUnavailable(asset) ? 'unavailable-endpoint' : 'pending-orphan-reference', knownUnavailable(asset) ? 'orphan' : 'needs-review'); continue; }
    if (asset!.status === undefined) continue;
    const status = object(asset!.status), binding = status.kind === 'ready' ? g.table('assetBindingsById')[string(status.activeBindingId)] : undefined;
    const revision = binding && binding.assetId === asset!.id ? g.table('assetRevisionsById')[string(binding.assetRevisionId)] : undefined;
    const current = revision && revision.assetId === asset!.id ? list(revision.representationIds).map(repId => g.table('representationsById')[string(repId)]).filter((r): r is JsonObject => !!r && r.assetId === asset!.id) : [];
    if (!current.some(r => r.variantFamilyId === target.variantFamilyId && r.materialCatalog && object(r.materialCatalog).layoutId === target.materialLayoutId &&
      list(object(r.materialCatalog).slots).some(s => object(s).logicalMaterialSlotId === target.logicalMaterialSlotId)))
      g.issue('materialOverridesById', id, 'routing', 'target-not-in-current-catalog', 'needs-review');
  }
  duplicates(g, 'materialOverridesById', m => { if (m.routing === undefined) return undefined; const r = object(m.routing), s = object(r.scope), t = object(r.target);
    return JSON.stringify([s.kind, s.sceneId ?? null, t.assetId, t.variantFamilyId, t.materialLayoutId, t.logicalMaterialSlotId]); });
}

function duplicates(g: GraphInspection, map: ProjectRecordMap, key: (r: JsonObject) => string | undefined) {
  const groups = new Map<string, string[]>();
  for (const r of g.all(map)) if (active(r)) { const k = key(r); if (k === undefined) continue; const ids = groups.get(k) ?? []; ids.push(string(r.id)); groups.set(k, ids); }
  for (const ids of groups.values()) if (ids.length > 1) for (const id of ids) g.issue(map, id, '', 'duplicate-semantic-key', 'needs-review');
}

/** Also accepts all checked anchor candidates, with no scalar/candidate winner. */
export function inspectAnchors(g: GraphInspection, captions: readonly JsonObject[] = g.all('captionsById')) {
  const owners = new Map<string, Set<string>>();
  const register = (id: string, owner: string) => { const ids = owners.get(id) ?? new Set<string>(); ids.add(owner); owners.set(id, ids); };
  for (const r of g.all('assetRevisionsById')) for (const c of list(r.anchorCompatibilityClasses)) register(string(object(c).id), string(r.assetId));
  for (const c of captions) { if (c.anchor === undefined) continue; const a = object(c.anchor); if (a.kind === 'asset') register(string(a.authoredAnchorCompatibilityId), string(a.assetId)); }
  for (const r of g.all('assetRevisionsById')) if (list(r.anchorCompatibilityClasses).some(c => owners.get(string(object(c).id))!.size > 1))
    g.issue('assetRevisionsById', string(r.id), 'anchorCompatibilityClasses', 'foreign-anchor-class-owner');
  const invalidRevisions = new Set(g.issues.filter(i => i.kind === 'invalid' && i.map === 'assetRevisionsById').map(i => i.id));
  for (const c of captions) {
    if (c.anchor === undefined) continue;
    const id = string(c.id), a = object(c.anchor), issue = (code: string, kind: 'invalid' | 'orphan' | 'needs-review' | 'unverified' = 'invalid') => g.issue('captionsById', id, 'anchor', code, kind);
    if (a.kind === 'project') { const frame = object(object(g.records.project).frame ?? {}).id;
      if (frame !== undefined && a.projectFrameId !== frame) issue('wrong-project-frame'); continue; }
    const asset = g.table('assetsById')[string(a.assetId)]; g.edge(id, string(a.assetId), 'anchor.assetId');
    if (!asset) { if (active(c)) issue('unavailable-anchor-owner', 'orphan'); }
    else if (asset.assetFrameId !== undefined && asset.assetFrameId !== a.assetFrameId) issue('wrong-asset-frame');
    else if (knownUnavailable(asset) && active(c)) issue('unavailable-anchor-owner', 'orphan');
    else if (asset.lifecycle === undefined && active(c)) issue('pending-orphan-reference', 'needs-review');
    if (owners.get(string(a.authoredAnchorCompatibilityId))!.size > 1) issue('foreign-anchor-class-owner');
    const evidence = a.hitEvidence ? object(a.hitEvidence) : {}, source = evidence.source ? object(evidence.source) : undefined;
    if (a.authoredAssetRevisionId) g.edge(id, string(a.authoredAssetRevisionId), 'anchor.authoredAssetRevisionId', 'weak');
    if (source) g.edge(id, string(source.representationId), 'anchor.hitEvidence.source', 'weak');
    const revision = a.authoredAssetRevisionId ? g.table('assetRevisionsById')[string(a.authoredAssetRevisionId)] : undefined;
    const klass = revision && list(revision.anchorCompatibilityClasses).map(object).find(k => k.id === a.authoredAnchorCompatibilityId);
    if (revision && (revision.assetId !== a.assetId || !klass)) issue('wrong-authored-revision-or-class');
    const r = source && g.table('representationsById')[string(source.representationId)];
    if (r) {
      const matrix: Record<string, readonly string[]> = { mesh: ['meshPrimary', 'visualPatch'], 'point-cloud': ['pointPrimary'], 'direct-splat': ['gsPrimary'], 'gpu-id-depth': ['gsPrimary'], proxy: ['interactionProxy'] };
      const surfaceKinds: Record<string, string> = { mesh: 'meshTriangle', 'point-cloud': 'pointSample', 'direct-splat': 'splatSample', 'gpu-id-depth': 'splatSample', proxy: 'meshTriangle' };
      if (r.assetId !== a.assetId || !matrix[string(evidence.method)]?.includes(string(r.role)) || (source!.surfaceRef && object(source!.surfaceRef).kind !== surfaceKinds[string(evidence.method)]) ||
        (revision && !list(revision.representationIds).includes(r.id!)) || (klass && !list(klass.targetVariantFamilyIds).includes((r.role === 'interactionProxy' ? r.proxyForGsVariantFamilyId : r.variantFamilyId)!))) issue('wrong-anchor-source');
      if (source!.surfaceRef) issue('verified-source-index-range-required', 'unverified');
    }
    // Absent weak history/source is not a reason to drop the canonical position.
    if (asset?.status !== undefined && active(asset) && active(c)) {
      const status = object(asset.status), binding = status.kind === 'ready' ? g.table('assetBindingsById')[string(status.activeBindingId)] : undefined;
      const current = binding && binding.assetId === asset.id ? g.table('assetRevisionsById')[string(binding.assetRevisionId)] : undefined;
      if (current && current.assetId === asset.id) {
        if (invalidRevisions.has(string(current.id))) issue('invalid-current-revision');
        else if (!list(current.anchorCompatibilityClasses).some(k => object(k).id === a.authoredAnchorCompatibilityId)) issue('anchor-class-not-current', 'needs-review');
      }
    }
  }
}
