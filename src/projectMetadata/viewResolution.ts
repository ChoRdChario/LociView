import type { ProjectProviderRead } from '../scene/projectProvider';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkMutableField } from '../domain/projectMutableFields';
import { normalizeSceneName, type JsonValue } from '../domain/values';
import { candidateReader } from './membership';
import type { MetadataWrite } from './commands';
import { fail, type MetadataLimits } from './format';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
export type ViewChoiceField = 'name' | 'orderKey' | 'camera' | 'background';
export type ViewResolution = {
  kind: 'resolveViewField'; sceneId: string; viewId: string; field: ViewChoiceField;
  choice: { kind: 'candidate'; operationId: string } | { kind: 'manual'; text: string };
} | { kind: 'resolveEntryView'; sceneId: string; operationId: string };
type Reader = ReturnType<typeof candidateReader>;

function activeView(r: Reader, viewId: string, frameId: string) {
  const c = new ProjectRecordFields(); c.id(viewId, 'view', []);
  r.active('viewsById', viewId);
  const sceneId = r.exact('viewsById', viewId, 'sceneId'); c.id(sceneId!, 'scn', []);
  r.active('scenesById', sceneId as string);
  if (r.exact('viewsById', viewId, 'projectFrameId') !== frameId) fail('view-resolution-frame');
  return sceneId as string;
}
function candidates(r: Reader, map: 'viewsById' | 'scenesById', id: string, name: string) {
  const field = r.records.get(map)?.get(id)?.get(name);
  if (!field?.valid || field.hasUnknownFields || field.candidates.length < 2) return fail('view-resolution-candidates');
  r.charge(field.validOperationIds.length); const valid = new Set(field.validOperationIds);
  return field.candidates.map(candidate => {
    r.charge(); if (!valid.has(candidate.operationId)) fail('view-resolution-candidates');
    const c = new ProjectRecordFields(), v = candidate.value.kind === 'value' ? candidate.value.value : undefined;
    checkMutableField(c, map, name, v);
    if (c.unknown) fail('view-resolution-unknown');
    return { operationId: candidate.operationId, value: candidate.value };
  });
}

/** Complete original atoms only. Other conflicted fields are not implicitly resolved. */
export function viewFieldCandidates(provider: Provider, viewId: string, field: ViewChoiceField, limits: MetadataLimits) {
  if (!['name', 'orderKey', 'camera', 'background'].includes(field)) return fail('view-resolution-field');
  const r = candidateReader(provider, limits), sceneId = activeView(r, viewId, provider.resources.projectFrameId);
  const choices = candidates(r, 'viewsById', viewId, field);
  // This host's established background profile is solid-only, not every future schema variant.
  if (field === 'background' && choices.some(c => c.value.kind !== 'value' ||
    (c.value.value as { kind?: string }).kind !== 'solid')) fail('view-solid-only');
  return { sceneId, candidates: choices };
}
export function entryViewCandidates(provider: Provider, sceneId: string, limits: MetadataLimits) {
  const c = new ProjectRecordFields(); c.id(sceneId, 'scn', []);
  const r = candidateReader(provider, limits); r.active('scenesById', sceneId);
  const choices = candidates(r, 'scenesById', sceneId, 'defaultViewId');
  for (const choice of choices) if (choice.value.kind === 'value' &&
    activeView(r, choice.value.value as string, provider.resources.projectFrameId) !== sceneId) fail('view-resolution-scene');
  return { sceneId, candidates: choices };
}

export function planViewResolution(provider: Provider, command: ViewResolution, limits: MetadataLimits): MetadataWrite[] {
  const shape = (o: object, keys: string) => { if (Object.keys(o).sort().join(',') !== keys) fail('view-resolution-shape'); };
  if (command.kind === 'resolveEntryView') {
    shape(command, 'kind,operationId,sceneId');
    const choice = entryViewCandidates(provider, command.sceneId, limits).candidates.find(c => c.operationId === command.operationId);
    if (!choice) return fail('view-resolution-choice');
    return [{ map: 'scenesById', id: command.sceneId, create: false,
      fields: choice.value.kind === 'value' ? { defaultViewId: choice.value.value } : {},
      ...(choice.value.kind === 'absent' ? { remove: ['defaultViewId'] as const } : {}) }];
  }
  shape(command, 'choice,field,kind,sceneId,viewId');
  const checked = viewFieldCandidates(provider, command.viewId, command.field, limits);
  if (checked.sceneId !== command.sceneId) fail('view-resolution-scene');
  let value: JsonValue;
  if (command.choice.kind === 'candidate') {
    shape(command.choice, 'kind,operationId'); const operationId = command.choice.operationId;
    const choice = checked.candidates.find(c => c.operationId === operationId);
    if (choice?.value.kind !== 'value') return fail('view-resolution-choice'); value = choice.value.value;
  } else if (command.choice.kind === 'manual' && command.field === 'name') {
    shape(command.choice, 'kind,text'); value = normalizeSceneName(command.choice.text);
  } else return fail('view-resolution-choice');
  return [{ map: 'viewsById', id: command.viewId, create: false, fields: { [command.field]: value } }];
}
