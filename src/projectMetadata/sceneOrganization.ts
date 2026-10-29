import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkMutableRecord, mutableFieldsFor } from '../domain/projectMutableFields';
import { object } from '../domain/projectGraphSupport';
import { normalizeSceneName, type JsonObject, type JsonValue } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { projectMaterialRoutes } from '../scene/projectMaterialRoutes';
import { candidateReader, captionCopySource } from './membership';
import { appendCaptionCopy, authoringShape, authoringWriter, equalAuthoringIds, type IdCopies } from './captionAuthoring';
import { fail, type MetadataLimits } from './format';
import type { MetadataWrite } from './commands';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
export type SceneOrganizationCommand =
  | { kind: 'duplicateScene'; sourceId: string; sceneId: string; name: string; orderKey: string; ids: IdCopies; eventId: string }
  | { kind: 'deleteSceneContents'; sceneId: string; observedIds: string[]; eventId: string }
  | { kind: 'reorderScene'; sceneId: string; beforeId: string | null; afterId: string | null; orderKey: string }
  | { kind: 'resolveSceneOrder'; sceneId: string; operationId: string }
  | { kind: 'restoreScene'; sceneId: string; observedOperationIds: string[]; eventId: string };
export function orderedAuthoringScenes(provider: Provider, limits: MetadataLimits) {
  const r = candidateReader(provider, limits);
  return r.related('scenesById', {}).map(id => ({ id, orderKey: r.exact('scenesById', id, 'orderKey')! }))
    .sort((a, b) => a.orderKey! < b.orderKey! ? -1 : a.orderKey! > b.orderKey! ? 1 : String(a.id).localeCompare(String(b.id)));
}
export function organizationSceneSource(provider: Provider, sceneId: string, limits: MetadataLimits) {
  const r = candidateReader(provider, limits), scene = r.complete('scenesById', sceneId);
  const assets = r.related('sceneAssetMembershipsById', { sceneId }).map(id => r.complete('sceneAssetMembershipsById', id));
  const captions = r.related('sceneCaptionMembershipsById', { sceneId }).map(id => r.complete('sceneCaptionMembershipsById', id));
  if (new Set(assets.map(e => e.assetId)).size !== assets.length || new Set(captions.map(e => e.captionId)).size !== captions.length) fail('organization-duplicate-membership');
  for (const edge of assets) r.active('assetsById', edge.assetId as string);
  for (const edge of captions) r.active('captionsById', edge.captionId as string);
  const views = r.related('viewsById', { sceneId }).map(id => r.complete('viewsById', id));
  const materials: JsonObject[] = [];
  for (const id of r.records.get('materialOverridesById')?.keys() ?? []) {
    const routes = projectMaterialRoutes(provider, id);
    if (routes.complete && !routes.hasUnknownFields && routes.routes.every(route => route.scope.kind !== 'scene' || route.scope.sceneId !== sceneId)) continue;
    const lifecycle = object(r.exact('materialOverridesById', id, 'lifecycle'));
    if (lifecycle.state === 'deleted' && !r.deleteEdits.has(`materialOverridesById/${id}`)) continue;
    if (!routes.complete || routes.hasUnknownFields) fail('organization-material-scope');
    materials.push(r.complete('materialOverridesById', id));
  }
  if (scene.defaultViewId && !views.some(v => v.id === scene.defaultViewId)) fail('organization-entry-view');
  const ordered = (rows: JsonObject[]) => rows.sort((a, b) => a.orderKey! < b.orderKey! ? -1 : a.orderKey! > b.orderKey! ? 1 : String(a.id).localeCompare(String(b.id)));
  return { scene, assets: ordered(assets), captions: ordered(captions), views: ordered(views), materials };
}
export function sceneOrderChoices(provider: Provider, sceneId: string, limits: MetadataLimits) {
  const r = candidateReader(provider, limits); r.active('scenesById', sceneId);
  const field = r.records.get('scenesById')?.get(sceneId)?.get('orderKey'), guard = new ProjectRecordFields();
  if (!field?.valid || field.hasUnknownFields || field.candidates.length < 2) return fail('organization-order-candidates');
  return field.candidates.map(c => {
    if (!field.validOperationIds.includes(c.operationId) || c.value.kind !== 'value') return fail('organization-order-candidates');
    guard.order(c.value.value, []); return { operationId: c.operationId, orderKey: c.value.value as string };
  });
}
/** Explicit recovery may run before any active Scene exists. Never restores children. */
export function sceneRestoreSource(provider: Provider, sceneId: string, limits: MetadataLimits) {
  const r = candidateReader(provider, limits), fields = r.records.get('scenesById')?.get(sceneId), field = fields?.get('lifecycle');
  if (!fields || !field?.valid || field.hasUnknownFields || !field.candidates.length) return fail('organization-restore-source');
  if (!field.candidates.every(c => field.validOperationIds.includes(c.operationId) && c.value.kind === 'value')) fail('organization-restore-source');
  const record: Record<string, JsonValue> = {};
  for (const name of new Set([...fields.keys(), ...Object.keys(mutableFieldsFor(provider.semanticProfile).scenesById)])) {
    if (name === 'lifecycle') continue; const v = r.exact('scenesById', sceneId, name); if (v !== undefined) record[name] = v;
  }
  const guard = new ProjectRecordFields(provider.semanticProfile); guard.id(sceneId, 'scn', []);
  checkMutableRecord(guard, 'scenesById', { ...record, lifecycle: { state: 'active', reason: 'restore', eventId: 'evt_' + '0'.repeat(32) } });
  if (guard.unknown || record.id !== sceneId) fail('organization-restore-source');
  const startup = provider.inspection.candidates.fields.find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'defaultSceneId');
  if (!startup?.valid || startup.hasUnknownFields || !startup.candidates.length || startup.candidates.some(c =>
    !startup.validOperationIds.includes(c.operationId) || c.value.kind !== 'value' || typeof c.value.value !== 'string')) fail('organization-restore-default');
  for (const candidate of startup!.candidates) if (candidate.value.kind === 'value') guard.id(candidate.value.value, 'scn', []);
  if (record.defaultViewId !== undefined) {
    const view = r.complete('viewsById', record.defaultViewId as string);
    if (view.sceneId !== sceneId || view.projectFrameId !== provider.resources.projectFrameId) fail('organization-restore-entry');
  }
  return { record, operationIds: field.candidates.map(c => c.operationId) };
}
export function planSceneOrganization(provider: Provider, command: SceneOrganizationCommand, limits: MetadataLimits): MetadataWrite[] {
  const r = candidateReader(provider, limits), w = authoringWriter(provider), edits: MetadataWrite[] = w.edits;
  switch (command.kind) {
    case 'duplicateScene': {
      authoringShape(command, ['kind', 'sourceId', 'sceneId', 'name', 'orderKey', 'ids', 'eventId']);
      const s = organizationSceneSource(provider, command.sourceId, limits), lifecycle = w.lifecycle(command.eventId, 'active'); w.fresh(command.sceneId, 'scn');
      const expected = [...s.assets, ...s.captions, ...s.views, ...s.materials].map(v => v.id as string);
      for (const edge of s.captions) { const c = captionCopySource(provider, edge.captionId as string, limits); expected.push(c.caption.id as string, ...c.attachments.map(a => a.id as string), ...c.tags.map(t => t.id as string)); }
      if (!equalAuthoringIds(command.ids.map(v => v.sourceId), expected)) fail('organization-copy-ids');
      for (const pair of command.ids) authoringShape(pair, ['sourceId', 'targetId']);
      const copied = (sourceId: string) => command.ids.find(v => v.sourceId === sourceId)?.targetId ?? fail('organization-copy-id');
      w.create('scenesById', { id: command.sceneId, name: normalizeSceneName(command.name), orderKey: command.orderKey, lifecycle,
        ...(s.scene.defaultViewId ? { defaultViewId: copied(s.scene.defaultViewId as string) } : {}) });
      const orderKey = (index: number) => (index + 1).toString(36).padStart(13, '0');
      for (const [index, source] of s.assets.entries()) { const target = copied(source.id as string); w.fresh(target, 'sam'); w.create('sceneAssetMembershipsById', { ...source, id: target, sceneId: command.sceneId, orderKey: orderKey(index), lifecycle }); }
      for (const [index, edge] of s.captions.entries()) {
        const c = captionCopySource(provider, edge.captionId as string, limits);
        const copyIds = (rows: JsonObject[]) => rows.map(v => ({ sourceId: v.id as string, targetId: copied(v.id as string) }));
        appendCaptionCopy(provider, { kind: 'duplicateCaption', sourceId: edge.captionId as string, captionId: copied(edge.captionId as string),
          sceneId: command.sceneId, membershipId: copied(edge.id as string), orderKey: orderKey(index), attachments: copyIds(c.attachments), tags: copyIds(c.tags), eventId: command.eventId }, limits, w);
      }
      for (const [index, source] of s.views.entries()) { const target = copied(source.id as string); w.fresh(target, 'view'); w.create('viewsById', { ...source, id: target, sceneId: command.sceneId, orderKey: orderKey(index), lifecycle }); }
      for (const source of s.materials) { const target = copied(source.id as string); w.fresh(target, 'ovr'); w.create('materialOverridesById', { ...source, id: target, lifecycle, routing: { ...object(source.routing), scope: { kind: 'scene', sceneId: command.sceneId } } }); }
      break;
    }
    case 'deleteSceneContents': {
      authoringShape(command, ['kind', 'sceneId', 'observedIds', 'eventId']);
      const s = organizationSceneSource(provider, command.sceneId, limits), scenes = r.related('scenesById', {});
      if (provider.state.defaultSceneId.kind !== 'value' || provider.state.defaultSceneId.value === command.sceneId || scenes.length < 2) fail('organization-default-last');
      if (!equalAuthoringIds(command.observedIds, [...s.assets, ...s.captions, ...s.views, ...s.materials].map(v => v.id as string))) fail('organization-dependencies');
      const lifecycle = w.lifecycle(command.eventId, 'deleted');
      for (const [map, rows] of [['sceneAssetMembershipsById', s.assets], ['sceneCaptionMembershipsById', s.captions], ['viewsById', s.views], ['materialOverridesById', s.materials]] as const)
        for (const row of rows) edits.push({ map, id: row.id as string, create: false, fields: { lifecycle } });
      edits.push({ map: 'scenesById', id: command.sceneId, create: false, fields: { lifecycle }, remove: ['defaultViewId'] }); break;
    }
    case 'reorderScene': {
      authoringShape(command, ['kind', 'sceneId', 'beforeId', 'afterId', 'orderKey']); w.guard.order(command.orderKey, []); r.active('scenesById', command.sceneId); r.exact('scenesById', command.sceneId, 'orderKey');
      const others = orderedAuthoringScenes(provider, limits).filter(s => s.id !== command.sceneId), index = command.beforeId === null ? 0 : others.findIndex(s => s.id === command.beforeId) + 1;
      if (command.beforeId !== null && index === 0 || (others[index]?.id ?? null) !== command.afterId ||
        index > 0 && !(others[index - 1]!.orderKey! < command.orderKey) || index < others.length && !(command.orderKey < others[index]!.orderKey!)) fail('organization-order');
      edits.push({ map: 'scenesById', id: command.sceneId, create: false, fields: { orderKey: command.orderKey } }); break;
    }
    case 'resolveSceneOrder': {
      authoringShape(command, ['kind', 'sceneId', 'operationId']); const choice = sceneOrderChoices(provider, command.sceneId, limits).find(c => c.operationId === command.operationId);
      if (!choice) return fail('organization-order-choice'); edits.push({ map: 'scenesById', id: command.sceneId, create: false, fields: { orderKey: choice.orderKey } }); break;
    }
    case 'restoreScene': {
      authoringShape(command, ['kind', 'sceneId', 'observedOperationIds', 'eventId']); const source = sceneRestoreSource(provider, command.sceneId, limits);
      if (!equalAuthoringIds(command.observedOperationIds, source.operationIds)) fail('organization-restore-observed'); w.guard.id(command.eventId, 'evt', []);
      edits.push({ map: 'scenesById', id: command.sceneId, create: false, fields: { lifecycle: { state: 'active', eventId: command.eventId, reason: 'restore' } } });
      edits.push({ map: 'project', id: 'defaultSceneId', create: false, fields: { defaultSceneId: command.sceneId } }); break;
    }
  }
  return edits;
}
