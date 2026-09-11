import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { checkMutableField, checkMutableRecord, type MutableRecordMap } from '../domain/projectMutableFields';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkProjectRecord } from '../domain/projectRecords';
import { list, object, same } from '../domain/projectGraphSupport';
import { validateMaterialIntent } from '../domain/materialIntent';
import { projectMaterialRoutes } from '../scene/projectMaterialRoutes';
import { planSceneCommand } from '../scene/commands';
import { resolveScene } from '../scene/resolve';
import { value, type Anchor, type Field, type Membership } from '../scene/types';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { fail, type MetadataLimits } from './format';
import { normalizeCaptionText } from '../domain/captionText';
import { planCaptionMembershipResolution, type CaptionMembershipResolution } from './membership';
import { metadataImmutableReader } from './records';
import { assetStatusCandidates } from './assetStatus';

export type MetadataEdit =
  | CaptionMembershipResolution
  | { kind: 'resolveAssetStatus'; assetId: string; operationId: string }
  | { kind: 'activatePreparedRevision'; sceneId: string; assetId: string; expectedBindingId: string; revisionId: string; binding: JsonObject }
  | { kind: 'moveAsset'; sceneId: string; assetId: string; expectedBindingId: string; binding: JsonObject }
  | { kind: 'editCaption'; captionId: string; edits: { title?: string; body?: string; colorSrgb?: readonly number[] } }
  | { kind: 'resolveCaptionText'; captionId: string; field: 'title' | 'body';
      choice: { kind: 'candidate'; operationId: string } | { kind: 'manual'; text: string } }
  | { kind: 'addPin'; sceneId: string; captionId: string; membershipId: string; eventId: string; anchor: Anchor }
  | { kind: 'movePin'; sceneId: string; captionId: string; anchor: Anchor }
  | { kind: 'include'; sceneId: string; resourceKind: 'asset' | 'caption'; resourceId: string; membershipId: string; orderKey: string; eventId: string }
  | { kind: 'exclude'; resourceKind: 'asset' | 'caption'; membershipId: string; eventId: string }
  | { kind: 'createView'; sceneId: string; viewId: string; projectFrameId: string; name: string; orderKey: string;
      camera: JsonObject; background: JsonObject; eventId: string }
  | { kind: 'editView'; sceneId: string; viewId: string; edits: { name?: string; orderKey?: string; camera?: JsonObject; background?: JsonObject } }
  | { kind: 'deleteView'; sceneId: string; viewId: string; eventId: string }
  | { kind: 'setEntryView'; sceneId: string; viewId: string | null }
  | { kind: 'createMaterial'; sceneId: string; overrideId: string; routing: JsonObject; appearance: JsonObject; compositing: JsonObject; eventId: string }
  | { kind: 'editMaterial'; sceneId: string; overrideId: string; appearance: JsonObject }
  | { kind: 'resetMaterial'; sceneId: string; overrideId: string; eventId: string }
  | { kind: 'createAttachment'; sceneId: string; captionId: string; attachmentId: string; media: JsonObject; orderKey: string; altText: string; eventId: string }
  | { kind: 'editAttachment'; sceneId: string; captionId: string; attachmentId: string; field: 'altText' | 'orderKey'; value: string }
  | { kind: 'deleteAttachment'; sceneId: string; captionId: string; attachmentId: string; eventId: string };
export interface MetadataRecordEdit { map: MutableRecordMap | 'mediaResourcesById' | 'assetBindingsById'; id: string; create: boolean; fields: JsonObject; remove?: readonly 'defaultViewId'[] }
type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
const exact = <T>(field: Field<T> | undefined): T => field?.kind === 'value' ? field.value : fail('command-unresolved');
const json = (v: unknown) => v as JsonValue;
const shape = (v: JsonObject, keys: string[]) => {
  if (Object.keys(v).sort().join(',') !== keys.sort().join(',')) fail('command-shape');
};
export function canonicalMetadataEdit(input: MetadataEdit, limits: MetadataLimits): MetadataEdit {
  if (input?.kind === 'resolveCaptionText' && input.choice?.kind === 'manual' && typeof input.choice.text === 'string')
    input = { ...input, choice: { ...input.choice, text: normalizeCaptionText(input.field, input.choice.text) } };
  return cloneCanonicalValue(input, limits) as unknown as MetadataEdit;
}

/** Plan only from the Session's fresh verified provider. Not a generic patch/import API. */
export function planMetadataEdit(provider: Provider, input: MetadataEdit, limits: MetadataLimits): readonly MetadataRecordEdit[] {
  const command = canonicalMetadataEdit(input, limits), raw = command as unknown as JsonObject;
  const c = new ProjectRecordFields(), result: MetadataRecordEdit[] = [];
  const row = (map: MutableRecordMap, id: string) => {
    const r = provider.details.mutable[map][id];
    if (!r || exact(r.id) !== id || object(exact(r.lifecycle)).state !== 'active') return fail('command-inactive');
    return r;
  };
  const add = (map: MutableRecordMap, id: string, fields: JsonObject, create = false, remove: readonly 'defaultViewId'[] = []) => {
    if (create) checkMutableRecord(c, map, fields);
    else {
      const r = row(map, id);
      for (const [name, v] of [...Object.entries(fields), ...remove.map(name => [name, undefined] as const)]) {
        if (map === 'captionsById' && r[name]?.kind !== 'value') fail('caption-unresolved');
        const oldCheck = new ProjectRecordFields(); checkMutableField(oldCheck, map, name, exact(r[name]));
        if (oldCheck.unknown) fail('command-unknown-value');
        checkMutableField(c, map, name, v);
      }
    }
    if (c.unknown) fail('command-unknown'); result.push({ map, id, fields, create, ...(remove.length ? { remove } : {}) });
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
  const view = (sceneId: string, viewId: string) => {
    c.id(sceneId, 'scn', []); c.id(viewId, 'view', []); row('scenesById', sceneId);
    const r = row('viewsById', viewId);
    if (exact(r.sceneId) !== sceneId || exact(r.projectFrameId) !== provider.resources.projectFrameId) fail('view-scope');
    return r;
  };
  const capture = (camera: JsonObject, background: JsonObject) => {
    c.camera(camera, []); c.background(background, []);
    if (background.kind !== 'solid') fail('view-solid-only');
  };
  const material = (sceneId: string, routing: JsonObject, owner?: string) => {
    checkMutableField(c, 'materialOverridesById', 'routing', routing);
    if (c.unknown) fail('material-unknown-routing');
    row('scenesById', sceneId);
    const scope = object(routing.scope), target = object(routing.target);
    if (scope.kind === 'scene' && scope.sceneId !== sceneId) fail('material-scene');
    const assetId = target.assetId as string; row('assetsById', assetId);
    const projection = exact(provider.resources.assets[assetId]?.projection);
    let found = false;
    for (const repId of projection.representationIds) {
      const rep = exact(provider.details.immutable.representationsById[repId]);
      if (rep.assetId !== assetId || rep.variantFamilyId !== target.variantFamilyId || !rep.materialCatalog) continue;
      const catalog = object(rep.materialCatalog); if (catalog.layoutId !== target.materialLayoutId) continue;
      for (const slot of list(catalog.slots).map(object)) if (slot.logicalMaterialSlotId === target.logicalMaterialSlotId) {
        if (!same(slot.sourceSemantics, { coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'lit', doubleSided: false })) fail('material-source');
        found = true;
      }
    }
    if (!found) fail('material-target');
    for (const [id, r] of Object.entries(provider.details.mutable.materialOverridesById)) {
      if (r.lifecycle?.kind === 'value' && object(r.lifecycle.value).state === 'deleted') continue;
      const reservations = projectMaterialRoutes(provider, id);
      if (!reservations.complete) fail('material-routing-unresolved');
      if (!reservations.routes.some(route => same(json(route), routing))) continue;
      if (id !== owner || r.routing?.kind !== 'value' || r.lifecycle?.kind !== 'value' || reservations.hasUnknownFields)
        fail('material-reserved');
    }
  };
  const materialIntent = (appearance: JsonObject, compositing: JsonObject) => {
    checkMutableField(c, 'materialOverridesById', 'appearance', appearance);
    checkMutableField(c, 'materialOverridesById', 'compositing', compositing);
    const intent = validateMaterialIntent({ appearance, compositing }, limits);
    if (c.unknown || intent.compositing.optics === 'transmission' ||
      ['smoothBlend', 'ditherCoverage'].includes(intent.compositing.coverage.policy) ||
      (intent.appearance.chroma?.softness ?? 0) > 0 ||
      (intent.compositing.coverage.policy === 'inherit' && (intent.appearance.opacity ?? 1) < 1)) fail('material-unsupported');
  };
  switch (command.kind) {
    case 'resolveAssetStatus': {
      shape(raw, ['kind', 'assetId', 'operationId']);
      const candidates = assetStatusCandidates(provider, command.assetId, limits);
      const selected = candidates.find(c => c.operationId === command.operationId);
      if (!selected) fail('asset-resolution-choice');
      result.push({ map: 'assetsById', id: command.assetId, create: false, fields: { status: selected!.status } }); break;
    }
    case 'resolveCaptionMembership': return planCaptionMembershipResolution(provider, command, limits);
    case 'activatePreparedRevision': {
      shape(raw, ['kind', 'sceneId', 'assetId', 'expectedBindingId', 'revisionId', 'binding']);
      row('scenesById', command.sceneId); row('assetsById', command.assetId);
      memberships('asset', command.sceneId, command.assetId);
      const resolved = resolveScene(provider.state, provider.resources, command.sceneId);
      const projection = resolved.kind === 'ready' ? resolved.composition.assets.find(a => a.assetId === command.assetId)?.projection : undefined;
      if (!projection || projection.bindingId !== command.expectedBindingId || projection.revisionId === command.revisionId) fail('revision-stale');
      const old = exact(provider.details.immutable.assetBindingsById[command.expectedBindingId]), next = command.binding;
      const readImmutable = metadataImmutableReader(provider, limits);
      const revision = readImmutable('assetRevisionsById', command.revisionId);
      checkProjectRecord(c, 'assetBindingsById', old); checkProjectRecord(c, 'assetBindingsById', next);
      checkProjectRecord(c, 'assetRevisionsById', revision);
      if (revision.id !== command.revisionId || revision.assetId !== command.assetId || !list(revision.representationIds).length) fail('revision-target');
      for (const id of list(revision.representationIds)) {
        const rep = readImmutable('representationsById', String(id));
        checkProjectRecord(c, 'representationsById', rep);
        if (rep.assetId !== command.assetId) fail('revision-target');
      }
      if (c.unknown) fail('revision-unknown');
      shape(old, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method', 'payloadDigest', ...(old.parentBindingId ? ['parentBindingId'] : [])]);
      shape(next, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method', 'payloadDigest', 'parentBindingId']);
      if (next.id === old.id || next.assetId !== command.assetId || old.assetId !== command.assetId ||
        old.assetRevisionId !== projection!.revisionId || next.assetRevisionId !== command.revisionId || next.parentBindingId !== old.id ||
        next.method !== 'manual' || !same(old.assetToProject, next.assetToProject)) fail('revision-placement');
      // Target content/family facts are rechecked by Session before any journal.
      // Caption authored coordinates/classes remain untouched and may need review.
      result.push({ map: 'assetBindingsById', id: next.id as string, create: true, fields: next });
      add('assetsById', command.assetId, { status: { kind: 'ready', activeBindingId: next.id! } }); break;
    }
    case 'moveAsset': {
      shape(raw, ['kind', 'sceneId', 'assetId', 'expectedBindingId', 'binding']);
      row('scenesById', command.sceneId); row('assetsById', command.assetId);
      memberships('asset', command.sceneId, command.assetId);
      const resolved = resolveScene(provider.state, provider.resources, command.sceneId);
      const projection = resolved.kind === 'ready' ? resolved.composition.assets.find(a => a.assetId === command.assetId)?.projection : undefined;
      if (!projection || projection.bindingId !== command.expectedBindingId) fail('placement-stale');
      const old = exact(provider.details.immutable.assetBindingsById[command.expectedBindingId]), next = command.binding;
      checkProjectRecord(c, 'assetBindingsById', old); checkProjectRecord(c, 'assetBindingsById', next);
      if (c.unknown) fail('placement-unknown');
      const before = object(old.assetToProject), after = object(next.assetToProject);
      if (next.id === old.id || next.assetId !== command.assetId || old.assetId !== command.assetId ||
        next.assetRevisionId !== old.assetRevisionId || old.assetRevisionId !== projection!.revisionId ||
        next.parentBindingId !== old.id || next.method !== 'manual' ||
        !same(before.rotationXYZW, after.rotationXYZW) || before.uniformScale !== after.uniformScale)
        fail('placement-translation-only');
      // No optional registration evidence or unknown subtree is silently discarded.
      shape(old, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method', 'payloadDigest', ...(old.parentBindingId ? ['parentBindingId'] : [])]);
      shape(next, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method', 'payloadDigest', 'parentBindingId']);
      result.push({ map: 'assetBindingsById', id: next.id as string, create: true, fields: next });
      add('assetsById', command.assetId, { status: { kind: 'ready', activeBindingId: next.id! } });
      break;
    }
    case 'createAttachment': case 'editAttachment': case 'deleteAttachment': {
      shape(raw, command.kind === 'createAttachment' ? ['kind', 'sceneId', 'captionId', 'attachmentId', 'media', 'orderKey', 'altText', 'eventId'] :
        command.kind === 'editAttachment' ? ['kind', 'sceneId', 'captionId', 'attachmentId', 'field', 'value'] :
          ['kind', 'sceneId', 'captionId', 'attachmentId', 'eventId']);
      row('scenesById', command.sceneId); row('captionsById', command.captionId);
      memberships('caption', command.sceneId, command.captionId);
      const scene = resolveScene(provider.state, provider.resources, command.sceneId);
      if (scene.kind !== 'ready' || !scene.composition.captions.some(c => c.captionId === command.captionId)) fail('attachment-scene');
      // Unresolved ownership/order cannot disappear from the set being reordered.
      for (const [id, r] of Object.entries(provider.details.mutable.captionAttachmentsById)) {
        const owner = exact(r.captionId), life = object(exact(r.lifecycle));
        if (owner !== command.captionId || life.state === 'deleted') continue;
        exact(provider.details.attachments[id]); exact(r.orderKey);
      }
      if (command.kind === 'createAttachment') {
        const media = command.media; checkProjectRecord(c, 'mediaResourcesById', media);
        c.id(media.id!, 'med', []); if (c.unknown) fail('media-unknown');
        const prior = provider.details.immutable.mediaResourcesById[media.id as string];
        if (prior) { if (!same(exact(prior), media)) fail('media-record-mismatch'); }
        else result.push({ map: 'mediaResourcesById', id: media.id as string, create: true, fields: media });
        add('captionAttachmentsById', command.attachmentId, { id: command.attachmentId, captionId: command.captionId,
          mediaResourceId: media.id!, altText: command.altText, orderKey: command.orderKey,
          lifecycle: { state: 'active', reason: 'initial', eventId: command.eventId } }, true);
      } else {
        const r = row('captionAttachmentsById', command.attachmentId), target = exact(provider.details.attachments[command.attachmentId]);
        if (target.captionId !== command.captionId) fail('attachment-owner');
        for (const name of ['captionId', 'mediaResourceId', 'lifecycle']) {
          checkMutableField(c, 'captionAttachmentsById', name, exact(r[name])); if (c.unknown) fail('attachment-unknown');
        }
        if (command.kind === 'editAttachment') {
          if (!['altText', 'orderKey'].includes(command.field)) fail('attachment-field');
          add('captionAttachmentsById', command.attachmentId, { [command.field]: command.value });
        } else add('captionAttachmentsById', command.attachmentId, { lifecycle: { state: 'deleted', reason: 'userDelete', eventId: command.eventId } });
      }
      break;
    }
    case 'editCaption': {
      shape(raw, ['kind', 'captionId', 'edits']); c.id(command.captionId, 'cap', []);
      const fields = command.edits as JsonObject, names = Object.keys(fields);
      if (!names.length || names.some(n => !['title', 'body', 'colorSrgb'].includes(n))) fail('caption-field');
      add('captionsById', command.captionId, fields); break;
    }
    case 'resolveCaptionText': {
      shape(raw, ['kind', 'captionId', 'field', 'choice']); c.id(command.captionId, 'cap', []);
      row('captionsById', command.captionId);
      if (!['title', 'body'].includes(command.field)) fail('caption-field');
      const field = provider.inspection.candidates.fields.find(f => f.path.length === 3 &&
        f.path[0] === 'captionsById' && f.path[1] === command.captionId && f.path[2] === command.field);
      if (!field?.valid || field.hasUnknownFields || field.candidates.length < 2 ||
        field.candidates.some(v => v.value.kind !== 'value' || typeof v.value.value !== 'string' || !field.validOperationIds.includes(v.operationId)))
        return fail('caption-resolution-candidates');
      let text: string;
      if (command.choice.kind === 'candidate') {
        shape(command.choice as unknown as JsonObject, ['kind', 'operationId']);
        const operationId = command.choice.operationId, selected = field.candidates.find(v => v.operationId === operationId);
        if (!selected || selected.value.kind !== 'value' || typeof selected.value.value !== 'string') return fail('caption-resolution-choice');
        text = selected.value.value;
      } else if (command.choice.kind === 'manual') {
        shape(command.choice as unknown as JsonObject, ['kind', 'text']);
        if (typeof command.choice.text !== 'string') return fail('caption-field');
        text = normalizeCaptionText(command.field, command.choice.text);
      } else return fail('caption-resolution-choice');
      checkMutableField(c, 'captionsById', command.field, text);
      // Explicit resolution alone may replace a conflicted field. The source
      // token and this complete candidate set bind the user's chosen context.
      result.push({ map: 'captionsById', id: command.captionId, create: false, fields: { [command.field]: text } }); break;
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
    case 'createView': {
      shape(raw, ['kind', 'sceneId', 'viewId', 'projectFrameId', 'name', 'orderKey', 'camera', 'background', 'eventId']);
      row('scenesById', command.sceneId);
      if (command.projectFrameId !== provider.resources.projectFrameId) fail('view-frame');
      capture(command.camera, command.background);
      add('viewsById', command.viewId, { id: command.viewId, sceneId: command.sceneId, projectFrameId: command.projectFrameId,
        name: command.name, orderKey: command.orderKey, camera: command.camera, background: command.background,
        lifecycle: { state: 'active', eventId: command.eventId, reason: 'initial' } }, true); break;
    }
    case 'editView': {
      shape(raw, ['kind', 'sceneId', 'viewId', 'edits']); view(command.sceneId, command.viewId);
      const fields = command.edits as JsonObject, names = Object.keys(fields);
      if (!names.length || names.some(n => !['name', 'orderKey', 'camera', 'background'].includes(n)) ||
        ('orderKey' in fields && names.length !== 1) || ('camera' in fields) !== ('background' in fields)) fail('view-fields');
      if ('camera' in fields) capture(command.edits.camera!, command.edits.background!);
      add('viewsById', command.viewId, fields); break;
    }
    case 'deleteView': {
      shape(raw, ['kind', 'sceneId', 'viewId', 'eventId']); view(command.sceneId, command.viewId);
      for (const r of Object.values(provider.details.mutable.scenesById))
        if (exact(r.defaultViewId) === command.viewId) fail('view-referenced');
      add('viewsById', command.viewId, { lifecycle: { state: 'deleted', eventId: command.eventId, reason: 'userDelete' } }); break;
    }
    case 'setEntryView': {
      shape(raw, ['kind', 'sceneId', 'viewId']);
      if (command.viewId !== null) view(command.sceneId, command.viewId);
      // Existing Scene command validates same-Scene reference and resolved capture.
      planSceneCommand(provider.state, provider.resources, { kind: 'setView', sceneId: command.sceneId, viewId: command.viewId },
        `evt_${'0'.repeat(32)}`); // Pure validation only; no lifecycle/event is authored.
      add('scenesById', command.sceneId, command.viewId === null ? {} : { defaultViewId: command.viewId }, false,
        command.viewId === null ? ['defaultViewId'] : []); break;
    }
    case 'createMaterial': {
      shape(raw, ['kind', 'sceneId', 'overrideId', 'routing', 'appearance', 'compositing', 'eventId']);
      material(command.sceneId, command.routing); materialIntent(command.appearance, command.compositing);
      add('materialOverridesById', command.overrideId, { id: command.overrideId, routing: command.routing,
        appearance: command.appearance, compositing: command.compositing,
        lifecycle: { state: 'active', eventId: command.eventId, reason: 'initial' } }, true); break;
    }
    case 'editMaterial': case 'resetMaterial': {
      shape(raw, ['kind', 'sceneId', 'overrideId', command.kind === 'editMaterial' ? 'appearance' : 'eventId']);
      const r = row('materialOverridesById', command.overrideId);
      checkMutableField(c, 'materialOverridesById', 'lifecycle', exact(r.lifecycle));
      const routing = exact(r.routing) as JsonObject, appearance = exact(r.appearance) as JsonObject, compositing = exact(r.compositing) as JsonObject;
      exact(provider.resources.materials[command.overrideId]?.intent);
      material(command.sceneId, routing, command.overrideId); materialIntent(appearance, compositing);
      if (command.kind === 'editMaterial') {
        materialIntent(command.appearance, compositing); add('materialOverridesById', command.overrideId, { appearance: command.appearance });
      } else add('materialOverridesById', command.overrideId, { lifecycle: { state: 'deleted', eventId: command.eventId, reason: 'userDelete' } });
      break;
    }
    default: fail('command-kind');
  }
  return result;
}
