import { ProjectRecordFields } from '../domain/projectRecordFields';
import type { ProjectSemanticProfile } from '../domain/projectProfile';
import { checkMutableField, mutableRecordFields } from '../domain/projectMutableFields';
import { object, list, same } from '../domain/projectGraphSupport';
import { validateMaterialIntent, type MaterialIntent } from '../domain/materialIntent';
import type { JsonObject } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { projectMaterialRoutes } from '../scene/projectMaterialRoutes';
import { candidateReader } from './membership';
import { metadataImmutableReader } from './records';
import { fail, type MetadataLimits } from './format';
import type { MetadataWrite } from './commands';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
const map = 'materialOverridesById';
export type MaterialResolution = {
  kind: 'resolveMaterialIntent'; sceneId: string; overrideId: string;
  appearanceOperationId: string; compositingOperationId: string;
} | {
  kind: 'resolveMaterialDuplicates'; sceneId: string; overrideId: string;
  observedOverrideIds: string[]; eventId: string;
};
const shape = (o: object, keys: string) => { if (Object.keys(o).sort().join(',') !== keys) fail('material-resolution-shape'); };

/** Exact source atoms and reservations. Duplicate buckets are not display authority. */
export function materialResolutionContext(p: Provider, sceneId: string, overrideId: string, limits: MetadataLimits) {
  const r = candidateReader(p, limits), c = new ProjectRecordFields(p.semanticProfile);
  c.id(sceneId, 'scn', []); c.id(overrideId, 'ovr', []);
  r.active('scenesById', sceneId); r.active(map, overrideId);
  const routing = object(r.exact(map, overrideId, 'routing'));
  checkMutableField(c, map, 'routing', routing); if (c.unknown) fail('material-resolution-unknown');
  const scope = object(routing.scope), target = object(routing.target), assetId = target.assetId as string;
  if (scope.kind === 'scene' && scope.sceneId !== sceneId) fail('material-scene');
  r.active('assetsById', assetId);
  const projection = p.resources.assets[assetId]?.projection;
  if (projection?.kind !== 'value') return fail('material-target');
  const immutable = metadataImmutableReader(p, limits); let found = false;
  for (const id of projection.value.representationIds) {
    r.charge(); const rep = immutable('representationsById', id);
    if (rep.assetId !== assetId || rep.variantFamilyId !== target.variantFamilyId || !rep.materialCatalog) continue;
    const catalog = object(rep.materialCatalog); if (catalog.layoutId !== target.materialLayoutId) continue;
    for (const slot of list(catalog.slots).map(object)) {
      r.charge(); if (slot.logicalMaterialSlotId !== target.logicalMaterialSlotId) continue;
      if (!same(slot.sourceSemantics, { coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'lit', doubleSided: false })) fail('material-source');
      found = true;
    }
  }
  if (!found) fail('material-target');
  const ids: string[] = [];
  for (const [id, fields] of r.records.get(map) ?? []) {
    r.charge(); const lifecycle = p.details.mutable[map][id]?.lifecycle;
    if (lifecycle?.kind === 'value' && object(lifecycle.value).state === 'deleted' && !r.deleteEdits.has(`${map}/${id}`)) continue;
    r.charge(p.inspection.candidates.fields.length + (fields.get('routing')?.candidates.length ?? 1));
    const routes = projectMaterialRoutes(p, id);
    if (!routes.complete) fail('material-routing-unresolved');
    if (!routes.routes.some(route => same(route as unknown as JsonObject, routing))) continue;
    r.active(map, id);
    if (routes.hasUnknownFields || !same(r.exact(map, id, 'routing'), routing)) fail('material-routing-unresolved');
    ids.push(id);
  }
  const atoms = (id: string, field: 'appearance' | 'compositing') => {
    const fields = r.records.get(map)?.get(id);
    if (!fields || [...fields.keys()].some(f => !Object.hasOwn(mutableRecordFields[map], f))) fail('material-resolution-unknown');
    const f = fields!.get(field);
    if (!f?.valid || f.hasUnknownFields || !f.candidates.length) return fail('material-resolution-candidates');
    r.charge(f.validOperationIds.length); const valid = new Set(f.validOperationIds);
    return f.candidates.map(atom => {
      r.charge(); const check = new ProjectRecordFields(p.semanticProfile);
      if (!valid.has(atom.operationId) || atom.value.kind !== 'value') return fail('material-resolution-candidates');
      checkMutableField(check, map, field, atom.value.value);
      if (check.unknown) fail('material-resolution-unknown');
      return { operationId: atom.operationId, value: object(atom.value.value) };
    });
  };
  return { routing, ids: ids.sort(), atoms };
}
export function checkedResolutionIntent(appearance: JsonObject, compositing: JsonObject, limits: MetadataLimits, profile: ProjectSemanticProfile = 'map1'): MaterialIntent {
  const intent = validateMaterialIntent({ appearance, compositing }, limits, profile);
  if (intent.compositing.optics === 'transmission' || ['smoothBlend', 'ditherCoverage'].includes(intent.compositing.coverage.policy) ||
    (profile !== 'map2' || intent.appearance.chroma?.enabled !== false) && (intent.appearance.chroma?.softness ?? 0) > 0 ||
    (intent.compositing.coverage.policy === 'inherit' && (intent.appearance.opacity ?? 1) < 1)) fail('material-unsupported');
  return intent;
}
/** Used by the real-file host too, before journaling, for exact-slot capability admission. */
export function selectedMaterialResolution(p: Provider, command: MaterialResolution, limits: MetadataLimits) {
  const context = materialResolutionContext(p, command.sceneId, command.overrideId, limits);
  const intents = new Map<string, MaterialIntent>();
  if (command.kind === 'resolveMaterialIntent') {
    shape(command, 'appearanceOperationId,compositingOperationId,kind,overrideId,sceneId');
    const a = context.atoms(command.overrideId, 'appearance'), c = context.atoms(command.overrideId, 'compositing');
    if (a.length < 2 && c.length < 2) fail('material-resolution-not-conflicted');
    const appearance = a.find(v => v.operationId === command.appearanceOperationId), compositing = c.find(v => v.operationId === command.compositingOperationId);
    if (!appearance || !compositing) return fail('material-resolution-choice');
    intents.set(command.overrideId, checkedResolutionIntent(appearance.value, compositing.value, limits, p.semanticProfile));
  } else {
    shape(command, 'eventId,kind,observedOverrideIds,overrideId,sceneId');
    new ProjectRecordFields().id(command.eventId, 'evt', []);
    const ids = context.ids, seen = command.observedOverrideIds;
    if (ids.length < 2 || !ids.includes(command.overrideId) || seen.length !== ids.length || new Set(seen).size !== ids.length || !ids.every(id => seen.includes(id)))
      fail('material-resolution-candidates');
    for (const id of ids) {
      const a = context.atoms(id, 'appearance'), c = context.atoms(id, 'compositing');
      if (a.length !== 1 || c.length !== 1) fail('material-resolution-unresolved');
      intents.set(id, checkedResolutionIntent(a[0]!.value, c[0]!.value, limits, p.semanticProfile));
    }
  }
  return { ...context, intents };
}
export function planMaterialResolution(p: Provider, command: MaterialResolution, limits: MetadataLimits): MetadataWrite[] {
  const selected = selectedMaterialResolution(p, command, limits);
  if (command.kind === 'resolveMaterialIntent') {
    const intent = selected.intents.get(command.overrideId)!;
    const fields: Record<string, JsonObject> = {};
    for (const field of ['appearance', 'compositing'] as const)
      if (selected.atoms(command.overrideId, field).length > 1) fields[field] = intent[field];
    return [{ map, id: command.overrideId, create: false, fields }];
  }
  return selected.ids.filter(id => id !== command.overrideId).map(id => ({ map, id, create: false,
    fields: { lifecycle: { state: 'deleted', eventId: command.eventId, reason: 'conflictResolution' } } }));
}
