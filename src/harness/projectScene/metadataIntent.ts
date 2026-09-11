import { parseJsonWithoutDuplicateMembers } from '../../core/json';
import { cloneCanonicalValue, type JsonObject } from '../../domain/values';
import { normalizeCaptionText } from '../../domain/captionText';
import type { Anchor, Membership } from '../../scene/types';
import type { MetadataEdit } from '../../projectMetadata/commands';
import type { SyntheticProject } from './fixture';
import { metadataFixtureLimits as limits } from './metadataFixture';

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
