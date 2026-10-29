import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkMutableRecord, mutableFieldsFor, type MutableRecordMap } from '../domain/projectMutableFields';
import { same } from '../domain/projectGraphSupport';
import { normalizeSceneName, type JsonObject, type JsonValue } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { candidateReader, captionCopySource } from './membership';
import { fail, type MetadataLimits } from './format';
import type { MetadataRecordEdit } from './commands';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
export type IdCopies = { sourceId: string; targetId: string }[];
export type CaptionSnapshot = { captionId: string; fields: { field: 'title' | 'body' | 'colorSrgb';
  operationId: string | null; value: { kind: 'value'; value: JsonValue } | { kind: 'absent' } }[] };
export type CaptionRestoreValues = { title: string; body: string; colorSrgb?: number[] };
export type CaptionAuthoringCommand =
  | { kind: 'duplicateCaption'; sceneId: string; sourceId: string; captionId: string; membershipId: string;
      attachments: IdCopies; tags: IdCopies; orderKey: string; eventId: string }
  | { kind: 'restoreCaptionFields'; expected: CaptionSnapshot; values: CaptionRestoreValues }
  | { kind: 'createTag'; tagId: string; label: string; colorSrgb: number[]; orderKey: string; eventId: string }
  | { kind: 'editTag'; tagId: string; label: string; colorSrgb: number[] }
  | { kind: 'deleteTag'; tagId: string; observedIds: string[]; eventId: string }
  | { kind: 'setCaptionTag'; captionId: string; tagId: string; included: boolean; observedIds: string[]; membershipId: string; eventId: string }
  | { kind: 'resolveTagField'; tagId: string; field: 'label' | 'colorSrgb' | 'orderKey'; operationId: string }
  | { kind: 'resolveTagLifecycle'; tagId: string; state: 'active' | 'deleted'; observedOperationIds: string[]; observedIds: string[]; eventId: string };
export const authoringShape = (v: object, expected: string[]) => {
  if (Object.keys(v).sort().join(',') !== [...expected].sort().join(',')) fail('authoring-command-shape');
};
export const equalAuthoringIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set(a).size === a.length && a.every(id => b.includes(id));
export function authoringWriter(provider: Provider) {
  const guard = new ProjectRecordFields(provider.semanticProfile), edits: MetadataRecordEdit[] = [];
  const reserved = new Set(provider.inspection.candidates.fields.filter(f => f.path.length >= 2).map(f => f.path[1]!));
  return { guard, edits,
    fresh(id: string, prefix: string) { guard.id(id, prefix, []); if (reserved.has(id)) fail('authoring-id'); reserved.add(id); },
    lifecycle(eventId: string, state: 'active' | 'deleted') {
      guard.id(eventId, 'evt', []); return { state, eventId, reason: state === 'active' ? 'initial' : 'userDelete' };
    },
    create(map: MutableRecordMap, fields: JsonObject) {
      checkMutableRecord(guard, map, fields); if (guard.unknown) fail('authoring-unknown'); edits.push({ map, id: fields.id as string, create: true, fields });
    },
  };
}
export function captionSnapshot(provider: Provider, captionId: string, limits: MetadataLimits): CaptionSnapshot {
  const r = candidateReader(provider, limits); r.complete('captionsById', captionId);
  return { captionId, fields: (['title', 'body', 'colorSrgb'] as const).map(field => {
    const v = r.exact('captionsById', captionId, field), f = r.records.get('captionsById')?.get(captionId)?.get(field);
    return { field, operationId: f?.candidates[0]?.operationId ?? null, value: v === undefined ? { kind: 'absent' } : { kind: 'value', value: v } };
  }) };
}
/** Shared by explicit Caption copy and Scene copy; the original is never edited. */
export function appendCaptionCopy(provider: Provider, command: Extract<CaptionAuthoringCommand, { kind: 'duplicateCaption' }>,
  limits: MetadataLimits, writer: ReturnType<typeof authoringWriter>) {
  const s = captionCopySource(provider, command.sourceId, limits), lifecycle = writer.lifecycle(command.eventId, 'active');
  writer.fresh(command.captionId, 'cap'); writer.fresh(command.membershipId, 'scm');
  writer.create('captionsById', { ...s.caption, id: command.captionId, lifecycle });
  writer.create('sceneCaptionMembershipsById', { id: command.membershipId, sceneId: command.sceneId, captionId: command.captionId, orderKey: command.orderKey, lifecycle });
  for (const [map, rows, ids, prefix] of [['captionAttachmentsById', s.attachments, command.attachments, 'att'], ['captionTagMembershipsById', s.tags, command.tags, 'tgm']] as const) {
    if (!equalAuthoringIds(ids.map(v => v.sourceId), rows.map(v => v.id as string))) fail('authoring-copy-children');
    for (const [index, record] of rows.entries()) {
      const target = ids.find(v => v.sourceId === record.id)!; authoringShape(target, ['sourceId', 'targetId']); writer.fresh(target.targetId, prefix);
      writer.create(map, { ...record, id: target.targetId, captionId: command.captionId, lifecycle,
        ...(map === 'captionAttachmentsById' ? { orderKey: (index + 1).toString(36).padStart(13, '0') } : {}) });
    }
  }
}
/** Explicit existing-schema authoring. No generic patch or history rollback. */
export function planCaptionAuthoring(provider: Provider, command: CaptionAuthoringCommand, limits: MetadataLimits): MetadataRecordEdit[] {
  const r = candidateReader(provider, limits), w = authoringWriter(provider), { guard, edits } = w;
  const remove = (map: MutableRecordMap, id: string, eventId: string) => {
    r.complete(map, id); edits.push({ map, id, create: false, fields: { lifecycle: w.lifecycle(eventId, 'deleted') } });
  };
  switch (command.kind) {
    case 'duplicateCaption': {
      authoringShape(command, ['kind', 'sceneId', 'sourceId', 'captionId', 'membershipId', 'attachments', 'tags', 'orderKey', 'eventId']);
      r.active('scenesById', command.sceneId);
      const edges = r.related('sceneCaptionMembershipsById', { sceneId: command.sceneId, captionId: command.sourceId });
      if (edges.length !== 1) fail('authoring-copy-membership'); r.complete('sceneCaptionMembershipsById', edges[0]!);
      appendCaptionCopy(provider, command, limits, w); break;
    }
    case 'restoreCaptionFields': {
      authoringShape(command, ['kind', 'expected', 'values']);
      const current = captionSnapshot(provider, command.expected.captionId, limits);
      if (!same(current as unknown as JsonObject, command.expected as unknown as JsonObject)) fail('authoring-undo-changed');
      authoringShape(command.values, ['title', 'body', ...(Object.hasOwn(command.values, 'colorSrgb') ? ['colorSrgb'] : [])]);
      if (typeof command.values.title !== 'string' || typeof command.values.body !== 'string') fail('authoring-undo-text');
      const fields: Record<string, JsonValue> = { title: command.values.title, body: command.values.body,
        ...(command.values.colorSrgb !== undefined ? { colorSrgb: command.values.colorSrgb } : {}) };
      const absent: 'colorSrgb'[] = command.values.colorSrgb === undefined ? ['colorSrgb'] : [];
      const restored = { ...r.complete('captionsById', current.captionId), ...fields }; for (const name of absent) delete restored[name];
      checkMutableRecord(guard, 'captionsById', restored); if (guard.unknown) fail('authoring-unknown');
      edits.push({ map: 'captionsById', id: current.captionId, create: false, fields, ...(absent.length ? { remove: absent } : {}) }); break;
    }
    case 'createTag': {
      authoringShape(command, ['kind', 'tagId', 'label', 'colorSrgb', 'orderKey', 'eventId']); w.fresh(command.tagId, 'tag');
      w.create('captionTagsById', { id: command.tagId, label: normalizeSceneName(command.label), colorSrgb: command.colorSrgb, orderKey: command.orderKey, lifecycle: w.lifecycle(command.eventId, 'active') }); break;
    }
    case 'editTag': {
      authoringShape(command, ['kind', 'tagId', 'label', 'colorSrgb']); const old = r.complete('captionTagsById', command.tagId);
      const fields = { label: normalizeSceneName(command.label), colorSrgb: command.colorSrgb };
      checkMutableRecord(guard, 'captionTagsById', { ...old, ...fields }); if (guard.unknown) fail('authoring-unknown');
      edits.push({ map: 'captionTagsById', id: command.tagId, create: false, fields }); break;
    }
    case 'deleteTag': {
      authoringShape(command, ['kind', 'tagId', 'observedIds', 'eventId']); r.complete('captionTagsById', command.tagId);
      const ids = r.related('captionTagMembershipsById', { tagId: command.tagId }); if (!equalAuthoringIds(command.observedIds, ids)) fail('authoring-tag-dependencies');
      for (const id of ids) remove('captionTagMembershipsById', id, command.eventId); remove('captionTagsById', command.tagId, command.eventId); break;
    }
    case 'setCaptionTag': {
      authoringShape(command, ['kind', 'captionId', 'tagId', 'included', 'observedIds', 'membershipId', 'eventId']);
      r.complete('captionsById', command.captionId); r.complete('captionTagsById', command.tagId);
      const ids = r.related('captionTagMembershipsById', { captionId: command.captionId, tagId: command.tagId });
      if (!equalAuthoringIds(command.observedIds, ids) || typeof command.included !== 'boolean' || command.included === (ids.length > 0)) fail('authoring-tag-membership');
      if (command.included) { w.fresh(command.membershipId, 'tgm'); w.create('captionTagMembershipsById', { id: command.membershipId, captionId: command.captionId, tagId: command.tagId, lifecycle: w.lifecycle(command.eventId, 'active') }); }
      else for (const id of ids) remove('captionTagMembershipsById', id, command.eventId); break;
    }
    case 'resolveTagField': {
      authoringShape(command, ['kind', 'tagId', 'field', 'operationId']); guard.id(command.tagId, 'tag', []);
      if (!['label', 'colorSrgb', 'orderKey'].includes(command.field) || r.exact('captionTagsById', command.tagId, 'id') !== command.tagId) fail('authoring-tag-field');
      const field = r.records.get('captionTagsById')?.get(command.tagId)?.get(command.field);
      if (!field?.valid || field.hasUnknownFields || field.candidates.length < 2 || !field.validOperationIds.includes(command.operationId)) fail('authoring-tag-choice');
      const choice = field!.candidates.find(c => c.operationId === command.operationId);
      if (!choice) return fail('authoring-tag-choice');
      if (choice.value.kind === 'absent') {
        if (command.field !== 'colorSrgb') return fail('authoring-tag-choice');
        edits.push({ map: 'captionTagsById', id: command.tagId, create: false, fields: {}, remove: ['colorSrgb'] }); break;
      }
      if (choice.value.kind !== 'value') return fail('authoring-tag-choice');
      const value = choice!.value as { kind: 'value'; value: JsonValue };
      if (command.field === 'label') guard.text(value.value, 256, []); else if (command.field === 'orderKey') guard.order(value.value, []); else guard.color(value.value, []);
      edits.push({ map: 'captionTagsById', id: command.tagId, create: false, fields: { [command.field]: value.value } }); break;
    }
    case 'resolveTagLifecycle': {
      authoringShape(command, ['kind', 'tagId', 'state', 'observedOperationIds', 'observedIds', 'eventId']); guard.id(command.eventId, 'evt', []);
      if (!['active', 'deleted'].includes(command.state) || r.exact('captionTagsById', command.tagId, 'id') !== command.tagId) fail('authoring-tag-lifecycle');
      const lifecycle = r.records.get('captionTagsById')?.get(command.tagId)?.get('lifecycle');
      if (!lifecycle?.valid || lifecycle.hasUnknownFields || !lifecycle.candidates.length || !equalAuthoringIds(command.observedOperationIds, lifecycle.candidates.map(c => c.operationId)) ||
        lifecycle.candidates.some(c => !lifecycle.validOperationIds.includes(c.operationId))) fail('authoring-tag-lifecycle');
      const record: Record<string, JsonValue> = { id: command.tagId, lifecycle: { state: command.state, eventId: command.eventId, reason: command.state === 'active' ? 'restore' : 'conflictResolution' } };
      for (const name of new Set([...(r.records.get('captionTagsById')?.get(command.tagId)?.keys() ?? []), ...Object.keys(mutableFieldsFor(provider.semanticProfile).captionTagsById)])) {
        if (name === 'lifecycle') continue; const value = r.exact('captionTagsById', command.tagId, name); if (value !== undefined) record[name] = value;
      }
      checkMutableRecord(guard, 'captionTagsById', record); if (guard.unknown) fail('authoring-unknown');
      const ids = r.related('captionTagMembershipsById', { tagId: command.tagId }); if (!equalAuthoringIds(command.observedIds, ids)) fail('authoring-tag-dependencies');
      if (command.state === 'deleted') for (const id of ids) remove('captionTagMembershipsById', id, command.eventId);
      edits.push({ map: 'captionTagsById', id: command.tagId, create: false, fields: { lifecycle: record.lifecycle! } }); break;
    }
  }
  return edits;
}
