import { planSceneCommand, type SceneAuthoringCommand } from '../scene/commands';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkMutableField, checkMutableRecord } from '../domain/projectMutableFields';
import { checkProjectHeader } from '../domain/projectRecords';
import { normalizeSceneName, type JsonObject } from '../domain/values';
import { candidateReader } from './membership';
import type { MetadataRecordEdit, MetadataWrite } from './commands';
import { fail, type MetadataLimits } from './format';

export interface SceneNameResolution {
  kind: 'resolveSceneName'; sceneId: string;
  choice: { kind: 'candidate'; operationId: string } | { kind: 'manual'; text: string };
}

/** All original names, including equal values; a diagnostic placeholder is not a choice. */
export function sceneNameCandidates(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  sceneId: string, limits: MetadataLimits) {
  const guard = new ProjectRecordFields(); guard.id(sceneId, 'scn', []);
  const r = candidateReader(provider, limits); r.active('scenesById', sceneId);
  const field = r.records.get('scenesById')?.get(sceneId)?.get('name');
  if (!field?.valid || field.hasUnknownFields || field.candidates.length < 2) return fail('scene-name-candidates');
  r.charge(field.validOperationIds.length); const valid = new Set(field.validOperationIds);
  return field.candidates.map(candidate => {
    r.charge();
    if (!valid.has(candidate.operationId) || candidate.value.kind !== 'value' || typeof candidate.value.value !== 'string')
      return fail('scene-name-candidates');
    checkMutableField(guard, 'scenesById', 'name', candidate.value.value);
    if (guard.unknown) fail('scene-name-unknown');
    return { operationId: candidate.operationId, name: candidate.value.value };
  });
}

export function planSceneNameResolution(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  command: SceneNameResolution, limits: MetadataLimits): MetadataWrite[] {
  if (Object.keys(command).sort().join(',') !== 'choice,kind,sceneId') fail('scene-name-shape');
  const choices = sceneNameCandidates(provider, command.sceneId, limits);
  let name: string;
  if (command.choice.kind === 'candidate') {
    if (Object.keys(command.choice).sort().join(',') !== 'kind,operationId') fail('scene-name-shape');
    const operationId = command.choice.operationId, selected = choices.find(c => c.operationId === operationId);
    if (!selected) return fail('scene-name-choice'); name = selected.name;
  } else if (command.choice.kind === 'manual') {
    if (Object.keys(command.choice).sort().join(',') !== 'kind,text' || typeof command.choice.text !== 'string') fail('scene-name-shape');
    name = normalizeSceneName(command.choice.text);
  } else return fail('scene-name-choice');
  const guard = new ProjectRecordFields(); checkMutableField(guard, 'scenesById', 'name', name);
  if (guard.unknown) fail('scene-name-unknown');
  return [{ map: 'scenesById', id: command.sceneId, create: false, fields: { name } }];
}

/** No partial projection-based copy or generic header patch. */
export function planSceneAuthoring(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  command: SceneAuthoringCommand, limits: MetadataLimits): MetadataWrite[] {
  const expected = command.kind === 'createScene' ? ['kind', 'sceneId', 'sourceSceneId', 'activeSceneId', 'name', 'orderKey', 'membershipIds', 'eventId'] :
    command.kind === 'renameScene' ? ['kind', 'sceneId', 'name'] : ['kind', 'sceneId'];
  if (Object.keys(command).sort().join(',') !== expected.sort().join(',')) fail('scene-command-shape');
  const r = candidateReader(provider, limits), guard = new ProjectRecordFields();
  guard.id(command.sceneId, 'scn', []);
  if (command.kind === 'createScene') {
    guard.id(command.sourceSceneId, 'scn', []); guard.id(command.activeSceneId, 'scn', []);
    r.active('scenesById', command.sourceSceneId);
    for (const id of r.related('sceneAssetMembershipsById', { sceneId: command.sourceSceneId })) {
      const edge = r.complete('sceneAssetMembershipsById', id);
      r.active('assetsById', edge.assetId as string);
    }
    const next = planSceneCommand(provider.state, provider.resources, { ...command, kind: 'create' }, command.eventId).next;
    const scene = next.scenes[command.sceneId]!;
    const fields: JsonObject = { id: scene.id, name: (scene.name as { value: string }).value,
      orderKey: command.orderKey, lifecycle: { state: 'active', eventId: command.eventId, reason: 'initial' } };
    checkMutableRecord(guard, 'scenesById', fields);
    const edits: MetadataRecordEdit[] = [{ map: 'scenesById', id: scene.id, create: true, fields }];
    for (const id of command.membershipIds) {
      const edge = next.assetMemberships[id]!;
      const fields: JsonObject = { id, sceneId: scene.id, assetId: edge.resourceId,
        orderKey: (edge.orderKey as { value: string }).value, lifecycle: { state: 'active', eventId: command.eventId, reason: 'initial' } };
      checkMutableRecord(guard, 'sceneAssetMembershipsById', fields);
      edits.push({ map: 'sceneAssetMembershipsById', id, create: true, fields });
    }
    if (guard.unknown) fail('scene-command-unknown'); return edits;
  }
  r.active('scenesById', command.sceneId);
  if (command.kind === 'renameScene') {
    r.exact('scenesById', command.sceneId, 'name');
    const next = planSceneCommand(provider.state, provider.resources, { kind: 'rename', sceneId: command.sceneId, name: command.name },
      `evt_${'0'.repeat(32)}`).next;
    return [{ map: 'scenesById', id: command.sceneId, create: false,
      fields: { name: (next.scenes[command.sceneId]!.name as { value: string }).value } }];
  }
  const current = provider.inspection.candidates.fields.find(f => f.path.join('/') === 'project/defaultSceneId');
  if (!current?.valid || current.hasUnknownFields || current.candidates.length !== 1 ||
    !current.validOperationIds.includes(current.candidates[0]!.operationId) || current.candidates[0]!.value.kind !== 'value')
    fail('scene-default-unresolved');
  checkProjectHeader(guard, 'defaultSceneId', command.sceneId);
  planSceneCommand(provider.state, provider.resources, { kind: 'setDefault', sceneId: command.sceneId }, `evt_${'0'.repeat(32)}`);
  return [{ map: 'project', id: 'defaultSceneId', create: false, fields: { defaultSceneId: command.sceneId } }];
}
