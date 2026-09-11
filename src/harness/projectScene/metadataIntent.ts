import { parseJsonWithoutDuplicateMembers } from '../../core/json';
import { cloneCanonicalValue, type JsonObject } from '../../domain/values';
import { normalizeCaptionText } from '../../domain/captionText';
import type { Anchor, Membership } from '../../scene/types';
import type { MetadataEdit } from '../../projectMetadata/commands';
import type { SyntheticProject } from './fixture';
import { metadataFixtureLimits as limits } from './metadataFixture';
import { fixtureMedia } from './mediaHistory';

const fail = (): never => { throw Error('この保存経路では対応していない編集です。'); };
const keys = (v: object, expected: string[]) => { if (Object.keys(v).sort().join(',') !== expected.sort().join(',')) fail(); };
const parse = (text: string): JsonObject => {
  if (typeof text !== 'string' || text.length > limits.maxStringScalars * 2) return fail();
  const v = cloneCanonicalValue(parseJsonWithoutDuplicateMembers(text), limits);
  if (!v || Array.isArray(v) || typeof v !== 'object') return fail(); return v as JsonObject;
};
const color = (text: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(text)) return fail();
  return text.slice(1).match(/../g)!.map(n => parseInt(n, 16) / 255);
};
function membership(key: string, text: string): Membership {
  const raw = parse(text); keys(raw, ['id', 'sceneId', 'resourceId', 'lifecycle', 'orderKey']);
  if (key !== `membership/${raw.id}` || typeof raw.sceneId !== 'string' || typeof raw.resourceId !== 'string') fail();
  const e = raw as unknown as Membership;
  if (e.lifecycle?.kind !== 'value' || e.orderKey?.kind !== 'value') return fail();
  keys(e.lifecycle, ['kind', 'value']); keys(e.orderKey, ['kind', 'value']);
  keys(e.lifecycle.value, ['state', 'reason', 'eventId']);
  return e;
}
/** Exact internal UI intents, not a flat-map importer or inferred file purpose. */
export function metadataIntent(changes: Readonly<Record<string, string>>, project: SyntheticProject,
  context?: { sceneId: string }): MetadataEdit {
  const rows = Object.entries(changes); if (!rows.length || rows.length > 6 || rows.some(([, v]) => typeof v !== 'string')) return fail();
  if (rows[0]![0].startsWith('attachment/')) {
    const attachmentId = rows[0]![0].split('/')[1]!;
    if (!context?.sceneId || !/^att_[0-9a-f]{32}$/.test(attachmentId) || rows.some(([k]) => !k.startsWith(`attachment/${attachmentId}/`))) return fail();
    const fields = Object.fromEntries(rows.map(([k, text]) => [k.slice(`attachment/${attachmentId}/`.length), text]));
    if ('mediaResourceId' in fields) {
      keys(fields, ['captionId', 'mediaResourceId', 'altText', 'orderKey', 'lifecycle']);
      const life = parse(fields.lifecycle!); keys(life, ['state', 'eventId', 'reason']);
      const media = fixtureMedia.find(m => m.record.id === fields.mediaResourceId);
      if (!media || life.state !== 'active' || life.reason !== 'initial' || typeof life.eventId !== 'string') return fail();
      return { kind: 'createAttachment', attachmentId, sceneId: context.sceneId, captionId: fields.captionId!,
        media: media.record, orderKey: fields.orderKey!, altText: fields.altText!, eventId: life.eventId };
    }
    const caption = project.mediaData?.records[attachmentId]?.captionId;
    if (caption?.kind !== 'value') return fail();
    if ('lifecycle' in fields) {
      keys(fields, ['lifecycle']); const life = parse(fields.lifecycle!); keys(life, ['state', 'eventId', 'reason']);
      if (life.state !== 'deleted' || life.reason !== 'userDelete' || typeof life.eventId !== 'string') return fail();
      return { kind: 'deleteAttachment', attachmentId, sceneId: context.sceneId, captionId: caption.value, eventId: life.eventId };
    }
    const name = Object.keys(fields)[0];
    if (rows.length !== 1 || (name !== 'altText' && name !== 'orderKey')) return fail();
    return { kind: 'editAttachment', attachmentId, sceneId: context.sceneId, captionId: caption.value, field: name, value: fields[name]! };
  }
  if (rows[0]![0].startsWith('material/')) {
    const overrideId = rows[0]![0].split('/')[1]!;
    if (!context?.sceneId || !/^ovr_[0-9a-f]{32}$/.test(overrideId) || rows.some(([k]) => !k.startsWith(`material/${overrideId}/`))) return fail();
    const fields = Object.fromEntries(rows.map(([k, text]) => [k.slice(`material/${overrideId}/`.length), text]));
    if ('routing' in fields) {
      keys(fields, ['routing', 'appearance', 'compositing', 'lifecycle']); const life = parse(fields.lifecycle!);
      keys(life, ['state', 'eventId', 'reason']);
      if (life.state !== 'active' || life.reason !== 'initial' || typeof life.eventId !== 'string') return fail();
      return { kind: 'createMaterial', sceneId: context.sceneId, overrideId, routing: parse(fields.routing!),
        appearance: parse(fields.appearance!), compositing: parse(fields.compositing!), eventId: life.eventId };
    }
    if ('appearance' in fields) {
      keys(fields, ['appearance']); return { kind: 'editMaterial', sceneId: context.sceneId, overrideId, appearance: parse(fields.appearance!) };
    }
    keys(fields, ['lifecycle']); const life = parse(fields.lifecycle!); keys(life, ['state', 'eventId', 'reason']);
    if (life.state !== 'deleted' || life.reason !== 'userDelete' || typeof life.eventId !== 'string') return fail();
    return { kind: 'resetMaterial', sceneId: context.sceneId, overrideId, eventId: life.eventId };
  }
  if (rows[0]![0].startsWith('scene/')) {
    if (rows.length !== 1 || !context?.sceneId || rows[0]![0] !== `scene/${context.sceneId}/entry`) return fail();
    const raw: unknown = parseJsonWithoutDuplicateMembers(rows[0]![1]);
    if (raw !== null && (typeof raw !== 'string' || !/^view_[0-9a-f]{32}$/.test(raw))) return fail();
    return { kind: 'setEntryView', sceneId: context.sceneId, viewId: raw };
  }
  if (rows[0]![0].startsWith('view/')) {
    const viewId = rows[0]![0].split('/')[1]!;
    if (!context?.sceneId || !/^view_[0-9a-f]{32}$/.test(viewId) ||
      rows.some(([k]) => !k.startsWith(`view/${viewId}/`))) return fail();
    const fields = Object.fromEntries(rows.map(([key, text]) => [key.slice(`view/${viewId}/`.length), text]));
    if ('identity' in fields) {
      keys(fields, ['identity', 'name', 'order', 'camera', 'background', 'lifecycle']);
      const identity = parse(fields.identity!), life = parse(fields.lifecycle!);
      keys(identity, ['id', 'sceneId', 'projectFrameId']); keys(life, ['state', 'eventId', 'reason']);
      if (identity.id !== viewId || identity.sceneId !== context.sceneId || identity.projectFrameId !== project.resources.projectFrameId ||
        life.state !== 'active' || life.reason !== 'initial' || typeof life.eventId !== 'string') return fail();
      return { kind: 'createView', sceneId: context.sceneId, viewId, projectFrameId: project.resources.projectFrameId,
        name: fields.name!, orderKey: fields.order!, camera: parse(fields.camera!), background: parse(fields.background!), eventId: life.eventId };
    }
    if ('lifecycle' in fields) {
      keys(fields, ['lifecycle']); const life = parse(fields.lifecycle!); keys(life, ['state', 'eventId', 'reason']);
      if (life.state !== 'deleted' || life.reason !== 'userDelete' || typeof life.eventId !== 'string') return fail();
      return { kind: 'deleteView', sceneId: context.sceneId, viewId, eventId: life.eventId };
    }
    if (Object.keys(fields).some(k => !['name', 'order', 'camera', 'background'].includes(k))) return fail();
    return { kind: 'editView', sceneId: context.sceneId, viewId, edits: {
      ...(fields.name !== undefined ? { name: fields.name } : {}), ...(fields.order !== undefined ? { orderKey: fields.order } : {}),
      ...(fields.camera !== undefined ? { camera: parse(fields.camera) } : {}),
      ...(fields.background !== undefined ? { background: parse(fields.background) } : {}),
    } };
  }
  const captions = rows.filter(([key]) => key.startsWith('caption/'));
  if (captions.length) {
    const captionId = captions[0]![0].split('/')[1]!;
    if (!/^cap_[0-9a-f]{32}$/.test(captionId) || captions.some(([k]) => k.split('/')[1] !== captionId)) return fail();
    const fields = Object.fromEntries(captions.map(([k, v]) => [k.slice(`caption/${captionId}/`.length), v]));
    if ('anchor' in fields) {
      if (!context?.sceneId) return fail();
      const anchor = parse(fields.anchor!) as unknown as Anchor;
      if (!('identity' in fields)) {
        if (rows.length !== 1) return fail();
        return { kind: 'movePin', captionId, sceneId: context.sceneId, anchor };
      }
      keys(fields, ['anchor', 'identity', 'title', 'body', 'color']);
      if (rows.length !== 6 || fields.title !== '' || fields.body !== '' || fields.color !== '#a08045') return fail();
      const m = rows.find(([k]) => k.startsWith('membership/scm_')); if (!m) return fail();
      const e = membership(...m), identity = parse(fields.identity!); keys(identity, ['assetId', 'assetFrameId', 'eventId']);
      if (anchor.kind !== 'asset' || identity.assetId !== anchor.assetId || identity.assetFrameId !== anchor.assetFrameId ||
        e.sceneId !== context.sceneId || e.resourceId !== captionId || e.orderKey.kind !== 'value' || e.orderKey.value !== 'Z' ||
        e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'active' || e.lifecycle.value.reason !== 'initial' ||
        e.lifecycle.value.eventId !== identity.eventId) return fail();
      return { kind: 'addPin', captionId, sceneId: context.sceneId, membershipId: e.id, eventId: e.lifecycle.value.eventId, anchor };
    }
    if (rows.length !== captions.length || Object.keys(fields).some(k => !['title', 'body', 'color'].includes(k))) return fail();
    return { kind: 'editCaption', captionId, edits: {
      ...(fields.title !== undefined ? { title: normalizeCaptionText('title', fields.title) } : {}),
      ...(fields.body !== undefined ? { body: normalizeCaptionText('body', fields.body) } : {}),
      ...(fields.color !== undefined ? { colorSrgb: color(fields.color) } : {}),
    } };
  }
  if (rows.length !== 1 || !/^membership\/(sam|scm)_[0-9a-f]{32}$/.test(rows[0]![0])) return fail();
  const e = membership(...rows[0]!), resourceKind = e.id.startsWith('sam_') ? 'asset' : 'caption';
  if (e.lifecycle.kind !== 'value' || e.orderKey.kind !== 'value') return fail();
  const eventId = e.lifecycle.value.eventId;
  if (e.lifecycle.value.state === 'active' && e.lifecycle.value.reason === 'initial')
    return { kind: 'include', resourceKind, sceneId: e.sceneId, resourceId: e.resourceId, membershipId: e.id, orderKey: e.orderKey.value, eventId };
  const prior = (resourceKind === 'asset' ? project.state.assetMemberships : project.state.captionMemberships)[e.id];
  if (e.lifecycle.value.state !== 'deleted' || e.lifecycle.value.reason !== 'userDelete' || !prior ||
    prior.sceneId !== e.sceneId || prior.resourceId !== e.resourceId || prior.orderKey.kind !== 'value' || prior.orderKey.value !== e.orderKey.value) return fail();
  return { kind: 'exclude', resourceKind, membershipId: e.id, eventId };
}
