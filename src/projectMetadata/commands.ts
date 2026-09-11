import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { checkMutableField, checkMutableRecord, type MutableRecordMap } from '../domain/projectMutableFields';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { object } from '../domain/projectGraphSupport';
import { planSceneCommand } from '../scene/commands';
import { resolveScene } from '../scene/resolve';
import { value, type Anchor, type Field, type Membership } from '../scene/types';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { fail, type MetadataLimits } from './format';

export type MetadataEdit =
  | { kind: 'editCaption'; captionId: string; edits: { title?: string; body?: string; colorSrgb?: readonly number[] } }
  | { kind: 'addPin'; sceneId: string; captionId: string; membershipId: string; eventId: string; anchor: Anchor }
  | { kind: 'movePin'; sceneId: string; captionId: string; anchor: Anchor }
  | { kind: 'include'; sceneId: string; resourceKind: 'asset' | 'caption'; resourceId: string; membershipId: string; orderKey: string; eventId: string }
  | { kind: 'exclude'; resourceKind: 'asset' | 'caption'; membershipId: string; eventId: string };
export interface MetadataRecordEdit { map: MutableRecordMap; id: string; create: boolean; fields: JsonObject }
type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
const exact = <T>(field: Field<T> | undefined): T => field?.kind === 'value' ? field.value : fail('command-unresolved');
const json = (v: unknown) => v as JsonValue;
const shape = (v: JsonObject, keys: string[]) => {
  if (Object.keys(v).sort().join(',') !== keys.sort().join(',')) fail('command-shape');
};

/** Plan only from the Session's fresh verified provider. Not a generic patch/import API. */
export function planMetadataEdit(provider: Provider, input: MetadataEdit, limits: MetadataLimits): readonly MetadataRecordEdit[] {
  const command = cloneCanonicalValue(input, limits) as unknown as MetadataEdit, raw = command as unknown as JsonObject;
  const c = new ProjectRecordFields(), result: MetadataRecordEdit[] = [];
  const row = (map: MutableRecordMap, id: string) => {
    const r = provider.details.mutable[map][id];
    if (!r || exact(r.id) !== id || object(exact(r.lifecycle)).state !== 'active') return fail('command-inactive');
    return r;
  };
  const add = (map: MutableRecordMap, id: string, fields: JsonObject, create = false) => {
    if (create) checkMutableRecord(c, map, fields);
    else {
      const r = row(map, id);
      for (const [name, v] of Object.entries(fields)) {
        if (map === 'captionsById' && r[name]?.kind !== 'value') fail('caption-unresolved');
        const oldCheck = new ProjectRecordFields(); checkMutableField(oldCheck, map, name, exact(r[name]));
        if (oldCheck.unknown) fail('command-unknown-value');
        checkMutableField(c, map, name, v);
      }
    }
    if (c.unknown) fail('command-unknown'); result.push({ map, id, fields, create });
  };
  // Unprojectable memberships still reserve semantic keys. Never make a duplicate
  // merely because one endpoint/lifecycle was omitted from the resolved Scene table.
  const memberships = (kind: 'asset' | 'caption', sceneId: string, resourceId: string) => {
    const map = kind === 'asset' ? 'sceneAssetMembershipsById' : 'sceneCaptionMembershipsById';
    for (const r of Object.values(provider.details.mutable[map])) {
      if (exact(r.sceneId) !== sceneId) continue;
      if (exact(r[kind === 'asset' ? 'assetId' : 'captionId']) !== resourceId) continue;
      exact(r.id); exact(r.lifecycle); exact(r.orderKey);
    }
  };
  const edge = (kind: 'asset' | 'caption', e: Membership, create: boolean) => {
    const map = kind === 'asset' ? 'sceneAssetMembershipsById' : 'sceneCaptionMembershipsById';
    add(map, e.id, create ? { id: e.id, sceneId: e.sceneId, [kind === 'asset' ? 'assetId' : 'captionId']: e.resourceId,
      orderKey: exact(e.orderKey), lifecycle: json(exact(e.lifecycle)) } : { lifecycle: json(exact(e.lifecycle)) }, create);
  };
  const pin = (sceneId: string, anchor: Anchor) => {
    c.id(sceneId, 'scn', []); c.anchor(json(anchor), []);
    const evidence = object(json(anchor)).hitEvidence;
    if (anchor.kind !== 'asset' || !evidence || object(evidence).method !== 'manual' || c.unknown) return fail('pin-manual-only');
    row('scenesById', sceneId); row('assetsById', anchor.assetId);
    memberships('asset', sceneId, anchor.assetId);
    const resolved = resolveScene(provider.state, provider.resources, sceneId);
    if (resolved.kind !== 'ready') return fail('pin-scene');
    const model = resolved.composition.assets.find(a => a.assetId === anchor.assetId)?.projection;
    if (!model || model.assetFrameId !== anchor.assetFrameId || model.revisionId !== anchor.authoredAssetRevisionId ||
      !model.anchorCompatibilityIds.includes(anchor.authoredAnchorCompatibilityId)) return fail('pin-model-changed');
    return resolved.composition;
  };
  switch (command.kind) {
    case 'editCaption': {
      shape(raw, ['kind', 'captionId', 'edits']); c.id(command.captionId, 'cap', []);
      const fields = command.edits as JsonObject, names = Object.keys(fields);
      if (!names.length || names.some(n => !['title', 'body', 'colorSrgb'].includes(n))) fail('caption-field');
      add('captionsById', command.captionId, fields); break;
    }
    case 'movePin': {
      shape(raw, ['kind', 'sceneId', 'captionId', 'anchor']);
      const before = exact(provider.resources.captions[command.captionId]?.anchor), after = command.anchor;
      if (before.kind !== 'asset' || after.kind !== 'asset' || before.assetId !== after.assetId || before.assetFrameId !== after.assetFrameId)
        fail('pin-owner-changed');
      const oldCheck = new ProjectRecordFields(); oldCheck.anchor(json(before), []);
      if (oldCheck.unknown) fail('pin-unknown-anchor');
      memberships('caption', command.sceneId, command.captionId);
      if (!pin(command.sceneId, after).captions.some(c => c.captionId === command.captionId)) fail('pin-not-in-scene');
      const merged = { ...object(json(before)), ...object(json(after)) };
      // Manual placement explicitly replaces known hit evidence and normal. Do
      // not silently erase unknown anchor/evidence subtrees from an old source.
      const oldEvidence = object(json(before)).hitEvidence;
      if (oldEvidence && Object.keys(object(oldEvidence)).some(k => !['method', 'confidence', 'source'].includes(k))) fail('pin-unknown-evidence');
      delete merged.normalAsset;
      add('captionsById', command.captionId, { anchor: merged }); break;
    }
    case 'addPin': {
      shape(raw, ['kind', 'sceneId', 'captionId', 'membershipId', 'eventId', 'anchor']);
      pin(command.sceneId, command.anchor); c.id(command.eventId, 'evt', []);
      const lifecycle = { state: 'active' as const, eventId: command.eventId, reason: 'initial' as const };
      add('captionsById', command.captionId, { id: command.captionId, title: '', body: '', colorSrgb: [160 / 255, 128 / 255, 69 / 255],
        lifecycle, anchor: json(command.anchor) }, true);
      memberships('caption', command.sceneId, command.captionId);
      const resources = { ...provider.resources, captions: { ...provider.resources.captions,
        [command.captionId]: { id: command.captionId, title: value(''), body: value(''), lifecycle: value(lifecycle), anchor: value(command.anchor) } } };
      const plan = planSceneCommand(provider.state, resources, { kind: 'include', resourceKind: 'caption', sceneId: command.sceneId,
        resourceId: command.captionId, membershipId: command.membershipId, orderKey: 'Z' }, command.eventId);
      edge('caption', plan.next.captionMemberships[command.membershipId]!, true); break;
    }
    case 'include': case 'exclude': {
      shape(raw, command.kind === 'include' ? ['kind', 'sceneId', 'resourceKind', 'resourceId', 'membershipId', 'orderKey', 'eventId'] :
        ['kind', 'resourceKind', 'membershipId', 'eventId']);
      if (!['asset', 'caption'].includes(command.resourceKind)) fail('membership-kind');
      const kind = command.resourceKind, map = kind === 'asset' ? 'sceneAssetMembershipsById' : 'sceneCaptionMembershipsById';
      const prior = command.kind === 'exclude' ? row(map, command.membershipId) : undefined;
      const sceneId = command.kind === 'include' ? command.sceneId : exact(prior!.sceneId) as string;
      const resourceId = command.kind === 'include' ? command.resourceId : exact(prior![kind === 'asset' ? 'assetId' : 'captionId']) as string;
      memberships(kind, sceneId, resourceId);
      const plan = planSceneCommand(provider.state, provider.resources, command, command.eventId);
      edge(kind, (kind === 'asset' ? plan.next.assetMemberships : plan.next.captionMemberships)[command.membershipId]!, command.kind === 'include'); break;
    }
    default: fail('command-kind');
  }
  return result;
}
