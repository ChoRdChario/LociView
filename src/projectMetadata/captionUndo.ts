import type { JsonObject, JsonValue } from '../domain/values';
import { same, object } from '../domain/projectGraphSupport';
import { mutableFieldsFor, checkMutableRecord, type MutableRecordMap } from '../domain/projectMutableFields';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { candidateReader } from './membership';
import { authoringShape, planCaptionAuthoring, type CaptionSnapshot } from './captionAuthoring';
import { fail, MetadataSourceError, type MetadataLimits } from './format';
import type { MetadataEdit, MetadataRecordEdit } from './commands';
import { metadataImmutableReader } from './records';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
export type CaptionUndoTarget =
  | { kind: 'captionFields'; captionId: string }
  | { kind: 'captionLifecycle'; captionId: string; memberships: string[]; attachments: string[]; tags: string[] }
  | { kind: 'attachmentLifecycle'; captionId: string; attachmentId: string }
  | { kind: 'attachmentField'; captionId: string; attachmentId: string; field: 'altText' | 'orderKey' };
export type UndoField = { field: string; operationId: string | null; value: { kind: 'value'; value: JsonValue } | { kind: 'absent' } };
type UndoMap = 'captionsById' | 'sceneCaptionMembershipsById' | 'captionAttachmentsById' | 'captionTagMembershipsById';
export type CaptionUndoSnapshot = { target: CaptionUndoTarget; rows: { map: UndoMap; id: string; fields: UndoField[] }[]; liveChildren: string[] };
export type CaptionUndoCapture = { target: CaptionUndoTarget; before: CaptionUndoSnapshot | null; unavailable?: true };
export type CaptionUndoReceipt = { before: CaptionUndoSnapshot; after: CaptionUndoSnapshot };
export type CaptionUndoInput = MetadataEdit | { kind: 'newMediaAttachment'; captionId: string; attachmentId: string };
export type CaptionUndoCommand = { kind: 'compensateCaptionAction'; expected: CaptionUndoSnapshot; goal: CaptionUndoSnapshot; eventId: string };
const childMaps = [['sceneCaptionMembershipsById', 'memberships'], ['captionAttachmentsById', 'attachments'], ['captionTagMembershipsById', 'tags']] as const;
const asObject = (v: unknown) => v as JsonObject;
const fieldValue = (row: CaptionUndoSnapshot['rows'][number], name: string) => {
  const f = row.fields.find(f => f.field === name); return f?.value.kind === 'value' ? f.value.value : undefined;
};

/** Complete resolved candidates, including tombstones. Never relax active-only readers. */
export function captionUndoSnapshot(provider: Provider, target: CaptionUndoTarget, limits: MetadataLimits): CaptionUndoSnapshot {
  const r = candidateReader(provider, limits), guard = new ProjectRecordFields(provider.semanticProfile);
  const rows: CaptionUndoSnapshot['rows'] = [];
  const row = (map: UndoMap, id: string, selected?: string[]) => {
    const source = r.records.get(map)?.get(id); if (!source || r.deleteEdits.has(`${map}/${id}`)) fail('caption-undo-unresolved');
    const record: Record<string, JsonValue> = {}, fields: UndoField[] = [];
    for (const name of [...new Set([...source!.keys(), ...Object.keys(mutableFieldsFor(provider.semanticProfile)[map])])].sort()) {
      const value = r.exact(map, id, name); if (value !== undefined) record[name] = value;
      if (!selected || selected.includes(name)) fields.push({ field: name, operationId: source!.get(name)?.candidates[0]?.operationId ?? null,
        value: value === undefined ? { kind: 'absent' } : { kind: 'value', value } });
    }
    checkMutableRecord(guard, map, record); if (guard.unknown || record.id !== id) fail('caption-undo-unresolved');
    rows.push({ map, id, fields }); return record;
  };
  guard.id(target.captionId, 'cap', []);
  const caption = row('captionsById', target.captionId, target.kind === 'captionFields' ? ['id', 'lifecycle', 'title', 'body', 'colorSrgb'] :
    target.kind === 'captionLifecycle' ? undefined : ['id', 'lifecycle']);
  const liveChildren: string[] = [];
  if (target.kind === 'captionLifecycle') {
    authoringShape(target, ['kind', 'captionId', 'memberships', 'attachments', 'tags']);
    for (const [map, key] of childMaps) {
      if (!Array.isArray(target[key]) || new Set(target[key]).size !== target[key].length) fail('caption-undo-target');
      for (const id of [...target[key]].sort()) { const child = row(map, id); if (child.captionId !== target.captionId) fail('caption-undo-owner'); }
      const live = r.related(map, { captionId: target.captionId });
      for (const id of live) { if (!target[key].includes(id)) fail('caption-undo-new-child'); liveChildren.push(`${map}/${id}`); }
    }
  } else {
    if (object(caption.lifecycle).state !== 'active') fail('caption-undo-inactive');
    if (target.kind === 'captionFields') authoringShape(target, ['kind', 'captionId']);
    else {
      authoringShape(target, ['kind', 'captionId', 'attachmentId', ...(target.kind === 'attachmentField' ? ['field'] : [])]);
      if (target.kind !== 'attachmentLifecycle' && (target.kind !== 'attachmentField' || !['altText', 'orderKey'].includes(target.field))) fail('caption-undo-target');
      const attachment = row('captionAttachmentsById', target.attachmentId);
      if (attachment.captionId !== target.captionId || target.kind === 'attachmentField' && object(attachment.lifecycle).state !== 'active') fail('caption-undo-owner');
    }
  }
  return { target, rows, liveChildren: liveChildren.sort() };
}

/** Capturing Undo eligibility is advisory: existing conflict-preserving deletion still works. */
export function beginCaptionUndo(provider: Provider, input: CaptionUndoInput, limits: MetadataLimits): CaptionUndoCapture | null {
  let target: CaptionUndoTarget, created = false;
  switch (input.kind) {
    case 'editCaption': target = { kind: 'captionFields', captionId: input.captionId }; break;
    case 'addPin': target = { kind: 'captionLifecycle', captionId: input.captionId, memberships: [input.membershipId], attachments: [], tags: [] }; created = true; break;
    case 'duplicateCaption': target = { kind: 'captionLifecycle', captionId: input.captionId, memberships: [input.membershipId], attachments: input.attachments.map(v => v.targetId), tags: input.tags.map(v => v.targetId) }; created = true; break;
    case 'deleteCaption': target = { kind: 'captionLifecycle', captionId: input.captionId, memberships: [...input.observedMembershipIds], attachments: [...input.observedAttachmentIds], tags: [...input.observedTagMembershipIds] }; break;
    case 'newMediaAttachment': case 'createAttachment': target = { kind: 'attachmentLifecycle', captionId: input.captionId, attachmentId: input.attachmentId }; created = true; break;
    case 'deleteAttachment': target = { kind: 'attachmentLifecycle', captionId: input.captionId, attachmentId: input.attachmentId }; break;
    case 'editAttachment': target = { kind: 'attachmentField', captionId: input.captionId, attachmentId: input.attachmentId, field: input.field }; break;
    default: return null;
  }
  try { return { target, before: created ? null : captionUndoSnapshot(provider, target, limits) }; }
  catch (error) { if (error instanceof MetadataSourceError) return { target, before: null, unavailable: true }; throw error; }
}

export function finishCaptionUndo(provider: Provider, capture: CaptionUndoCapture, limits: MetadataLimits): CaptionUndoReceipt | null {
  if (capture.unavailable) return fail('caption-undo-unavailable');
  const after = captionUndoSnapshot(provider, capture.target, limits);
  const before = capture.before ?? structuredClone(after);
  if (!capture.before) {
    for (const row of before.rows) {
      if (capture.target.kind === 'attachmentLifecycle' && row.map === 'captionsById') continue;
      const life = row.fields.find(f => f.field === 'lifecycle')!;
      life.operationId = null; life.value = { kind: 'value', value: { state: 'deleted', reason: 'userDelete', eventId: object(fieldValue(row, 'lifecycle')).eventId! } };
    }
    before.liveChildren = [];
  }
  return same(asObject(before), asObject(after)) ? null : { before, after };
}

/** Four finite effects only: lifecycle, Caption text/color, one attachment description/order. */
export function planCaptionUndo(provider: Provider, command: CaptionUndoCommand, limits: MetadataLimits): MetadataRecordEdit[] {
  authoringShape(command, ['kind', 'expected', 'goal', 'eventId']);
  const { expected, goal } = command, target = expected.target;
  if (!same(asObject(expected), asObject(captionUndoSnapshot(provider, target, limits))) || !same(asObject(target), asObject(goal.target))) fail('caption-undo-changed');
  if (target.kind === 'captionFields') {
    const row = goal.rows.find(r => r.map === 'captionsById' && r.id === target.captionId); if (!row) return fail('caption-undo-goal');
    return planCaptionAuthoring(provider, { kind: 'restoreCaptionFields', expected: { captionId: target.captionId,
      fields: ['title', 'body', 'colorSrgb'].map(name => expected.rows[0]!.fields.find(f => f.field === name)!) as CaptionSnapshot['fields'] },
      values: { title: fieldValue(row, 'title') as string, body: fieldValue(row, 'body') as string,
        ...(fieldValue(row, 'colorSrgb') === undefined ? {} : { colorSrgb: fieldValue(row, 'colorSrgb') as number[] }) } }, limits);
  }
  const r = candidateReader(provider, limits), guard = new ProjectRecordFields(provider.semanticProfile);
  if (target.kind === 'attachmentField') {
    const row = goal.rows.find(v => v.map === 'captionAttachmentsById' && v.id === target.attachmentId); if (!row) return fail('caption-undo-goal');
    const value = fieldValue(row, target.field), current = r.complete('captionAttachmentsById', target.attachmentId);
    if (typeof value !== 'string' && !(target.field === 'altText' && value === undefined)) fail('caption-undo-goal');
    const fields = value === undefined ? {} : { [target.field]: value }, restored: Record<string, JsonValue> = { ...current, ...fields };
    if (value === undefined) delete restored.altText;
    checkMutableRecord(guard, 'captionAttachmentsById', restored);
    if (guard.unknown) fail('caption-undo-goal');
    return [{ map: 'captionAttachmentsById', id: target.attachmentId, create: false, fields, ...(value === undefined ? { remove: ['altText'] } : {}) }];
  }
  guard.id(command.eventId, 'evt', []);
  for (const change of provider.inspection.candidates.source.history.changes) for (const write of change.writes) {
    r.charge(); if (write.path[2] === 'lifecycle' && write.value.kind === 'value' && object(write.value.value).eventId === command.eventId) fail('caption-undo-event-reused');
  }
  const affected = expected.rows.filter(row => target.kind === 'captionLifecycle' || row.map === 'captionAttachmentsById');
  const desired = affected.map(row => object(fieldValue(goal.rows.find(v => v.map === row.map && v.id === row.id) ?? { ...row, fields: [] }, 'lifecycle')).state);
  if (!desired.length || desired.some(state => state !== desired[0]) || !['active', 'deleted'].includes(desired[0] as string)) fail('caption-undo-goal');
  for (const row of affected) {
    const old = object(fieldValue(row, 'lifecycle')).state;
    if (old === desired[0] || !['active', 'deleted'].includes(old as string)) fail('caption-undo-state');
    if (desired[0] !== 'active') continue;
    if (row.map === 'sceneCaptionMembershipsById') r.active('scenesById', fieldValue(row, 'sceneId') as string);
    if (row.map === 'captionTagMembershipsById') r.active('captionTagsById', fieldValue(row, 'tagId') as string);
    if (row.map === 'captionAttachmentsById') metadataImmutableReader(provider, limits)('mediaResourcesById', fieldValue(row, 'mediaResourceId') as string);
  }
  return affected.map(row => ({ map: row.map as MutableRecordMap, id: row.id, create: false,
    fields: { lifecycle: { state: desired[0]!, reason: desired[0] === 'active' ? 'restore' : 'userDelete', eventId: command.eventId } } }));
}

/** Rebase only exact prior operation identities, never an equal-value foreign edit. */
export function rebaseCaptionUndo(snapshot: CaptionUndoSnapshot, from: CaptionUndoSnapshot, to: CaptionUndoSnapshot): CaptionUndoSnapshot {
  const result = structuredClone(snapshot);
  for (const row of result.rows) for (const field of row.fields) {
    const before = from.rows.find(r => r.map === row.map && r.id === row.id)?.fields.find(f => f.field === field.field);
    const after = to.rows.find(r => r.map === row.map && r.id === row.id)?.fields.find(f => f.field === field.field);
    if (before && after && same(asObject(field), asObject(before))) Object.assign(field, structuredClone(after));
  }
  return result;
}
