import { resolveScene } from '../../scene/resolve';
import { same } from '../../domain/projectGraphSupport';
import { value, type Field, type Caption } from '../../scene/types';
import type { JsonValue, JsonObject } from '../../domain/values';
import type { WorkspaceProvider } from './projectWorkspacePorts';
import type { CaptionListItem } from './captionListState';
import type { CaptionIncludeSource } from './captionIncludeState';
import type { ModelListSource, ModelMembership } from './modelListState';

export const fieldValue = <T>(f: Field<T> | undefined): T | undefined => f?.kind === 'value' ? f.value : undefined;
export function projectIdentity(provider: WorkspaceProvider): string {
  const field = provider.inspection.candidates.fields.find(f => f.path.length === 1 && f.path[0] === 'identity');
  const atom = field?.valid && field.candidates.length === 1 ? field.candidates[0] : undefined;
  return atom?.value.kind === 'value' ? String((atom.value.value as JsonObject).projectId ?? '') : '';
}
const unknown = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
export const activeRecord = (fields: Readonly<Record<string, Field<JsonValue | undefined>>>): boolean =>
  (fieldValue(fields.lifecycle) as JsonObject | undefined)?.state === 'active';
export function projectModels(provider: WorkspaceProvider, sceneId: string, projectId: string, hidden: readonly string[],
  viewport: { ready: boolean; issue: string | null; assetIds?: readonly string[] }): ModelListSource {
  if (resolveScene(provider.state, provider.resources, sceneId).kind !== 'ready') return { kind: 'unavailable', token: provider.token, projectId, sceneId, reason: 'シーンの状態を確認してください。' };
  return { kind: 'ready', token: provider.token, projectId, sceneId, items: Object.values(provider.resources.assets).map(asset => {
    const edges: { id: string; order: Field<string> }[] = []; let uncertain = false;
    for (const [id, fields] of Object.entries(provider.details.mutable.sceneAssetMembershipsById)) {
      if ((fieldValue(fields.lifecycle) as JsonObject | undefined)?.state === 'deleted') continue;
      const scene = fieldValue(fields.sceneId), owner = fieldValue(fields.assetId);
      if (typeof scene === 'string' && scene !== sceneId || typeof owner === 'string' && owner !== asset.id) continue;
      const edge = provider.state.assetMemberships[id];
      if (scene !== sceneId || owner !== asset.id || !activeRecord(fields) || fieldValue(fields.id) !== id || fields.orderKey?.kind !== 'value' ||
        !edge || edge.sceneId !== sceneId || edge.resourceId !== asset.id || fieldValue(edge.lifecycle)?.state !== 'active' ||
        provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[0] === 'sceneAssetMembershipsById' && i.path[1] === id)) uncertain = true;
      else edges.push({ id, order: fields.orderKey as Field<string> });
    }
    const membership: Field<ModelMembership> = uncertain || edges.length > 1 ? unknown() : edges[0] ?
      value({ kind: 'included', membershipId: edges[0].id, sceneId, assetId: asset.id, orderKey: edges[0].order }) : value({ kind: 'absent' });
    const shown = viewport.ready && viewport.assetIds?.includes(asset.id) && asset.projection.kind === 'value';
    return { id: asset.id, name: provider.details.mutable.assetsById[asset.id]!.label as Field<string>,
      lifecycle: asset.lifecycle.kind === 'value' ? value(asset.lifecycle.value.state) : asset.lifecycle,
      membership, display: value(membership.kind === 'value' && membership.value.kind === 'absent' ? 'outsideScene' : membership.kind === 'value' && hidden.includes(asset.id) ? 'temporarilyHidden' : !shown ? 'unavailable' : 'visible'),
      displayReason: uncertain || membership.kind !== 'value' ? 'モデルの所属・更新候補を確認してください。' : shown ? null : viewport.issue ?? '3D表示を確認してください。' };
  }) };
}
export function projectAttachments(provider: WorkspaceProvider, captionId: string) {
  return Object.entries(provider.details.mutable.captionAttachmentsById).flatMap(([id, fields]) => {
    const target = fieldValue(provider.details.attachments[id]);
    if (!target || target.captionId !== captionId || !activeRecord(fields) || provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[0] === 'captionAttachmentsById' && i.path[1] === id)) return [];
    const media = fieldValue(provider.details.immutable.mediaResourcesById[target.mediaResourceId]);
    return [{ id, media, fields, label: typeof media?.label === 'string' ? media.label : 'メディア',
      order: String(fieldValue(fields.orderKey) ?? ''), alt: String(fieldValue(fields.altText) ?? '') }];
  }).sort((a, b) => a.order < b.order ? -1 : a.order > b.order ? 1 : a.id.localeCompare(b.id));
}
/** An unresolved relation may belong to this caption; never turn it into a known zero. */
export function projectMediaUncertain(provider: WorkspaceProvider, captionId: string): boolean {
  return Object.entries(provider.details.mutable.captionAttachmentsById).some(([id, fields]) => {
    const lifecycle = fieldValue(fields.lifecycle) as JsonObject | undefined;
    const deleteEdit = provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[0] === 'captionAttachmentsById' && i.path[1] === id);
    if (lifecycle?.state === 'deleted' && !deleteEdit) return false;
    const target = fieldValue(provider.details.attachments[id]);
    if (target && target.captionId !== captionId) return false;
    return deleteEdit || !target || lifecycle?.state !== 'active' || fields.orderKey?.kind !== 'value' ||
      provider.details.immutable.mediaResourcesById[target.mediaResourceId]?.kind !== 'value';
  });
}
export function projectMediaResources(provider: WorkspaceProvider) {
  return Object.entries(provider.details.immutable.mediaResourcesById).flatMap(([id, field]) => {
    const record = fieldValue(field), blob = record?.blob as JsonObject | undefined;
    const verified = record && provider.inspection.checks.some(c => c.outcome === 'verified' && c.request.token === provider.token &&
      c.request.fact === 'media' && c.request.records.length === 1 && same(c.request.records[0]!, record));
    return verified && record.id === id && record.mediaKind === 'image' && (['image/png','image/jpeg','image/webp','image/gif'].includes(String(blob?.mediaType))) && typeof record.label === 'string' ? [{ id, record, label: record.label }] : [];
  });
}
export function projectCaptionSceneCount(provider: WorkspaceProvider, captionId: string): Field<number> {
  const scenes = new Set<string>();
  for (const fields of Object.values(provider.details.mutable.sceneCaptionMembershipsById)) {
    const lifecycle = fieldValue(fields.lifecycle) as JsonObject | undefined;
    if (lifecycle?.state === 'deleted') continue;
    const caption = fieldValue(fields.captionId);
    if (typeof caption === 'string' && caption !== captionId) continue;
    const scene = fieldValue(fields.sceneId);
    if (caption !== captionId || lifecycle?.state !== 'active' || typeof scene !== 'string' || scenes.has(scene)) return unknown<number>();
    scenes.add(scene);
  }
  return value(scenes.size);
}
export function projectCaptions(provider: WorkspaceProvider, sceneId: string, hiddenAssetIds: readonly string[] = []): readonly CaptionListItem[] {
  const scene = resolveScene(provider.state, provider.resources, sceneId);
  if (scene.kind !== 'ready') return [];
  const models = projectModels(provider, sceneId, projectIdentity(provider), hiddenAssetIds, { ready: false, issue: null });
  return scene.composition.captions.map(c => { const anchor = fieldValue(c.anchor), item = anchor?.kind === 'asset' && models.kind === 'ready' ? models.items.find(a => a.id === anchor.assetId) : undefined;
    const projection = anchor?.kind === 'asset' ? fieldValue(provider.resources.assets[anchor.assetId]?.projection) : undefined;
    const ownerHidden = anchor?.kind === 'asset' && item?.lifecycle.kind === 'value' && item.lifecycle.value === 'active' && item.membership.kind === 'value' &&
      projection?.assetFrameId === anchor.assetFrameId &&
      !provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[0] === 'assetsById' && i.path[1] === anchor.assetId) &&
      (item.membership.value.kind === 'absent' || hiddenAssetIds.includes(anchor.assetId) && scene.composition.assets.some(a => a.assetId === anchor.assetId));
    return { ...projectCaptionItem(provider, { ...c, id: c.captionId }, c.marker === 'unplaced' ? 'unplaced' : ownerHidden ? 'ownerHidden' : c.marker === 'visible' ? 'visible' : c.marker === 'needsReview' ? 'needsReview' : 'unavailable'),
      needsReview: c.marker === 'needsReview' || anchor?.kind === 'asset' && !!projection && !projection.anchorCompatibilityIds.includes(anchor.authoredAnchorCompatibilityId) }; });
}
function projectCaptionItem(provider: WorkspaceProvider, c: Pick<Caption, 'id' | 'title' | 'body' | 'anchor'>, pin: CaptionListItem['pin']): CaptionListItem {
    const colorField = provider.details.mutable.captionsById[c.id]?.colorSrgb;
    const color = fieldValue(colorField);
    const hex = Array.isArray(color) && color.length === 3 && color.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
      ? '#' + color.map(n => Math.round(Number(n) * 255).toString(16).padStart(2, '0')).join('') : colorField?.kind === 'value' && color === undefined ? '#a08045' : null;
    const anchor = fieldValue(c.anchor), assetId = anchor?.kind === 'asset' ? anchor.assetId : anchor?.kind === 'unplaced' ? anchor.ownerAssetId : null;
    const label = assetId ? provider.details.mutable.assetsById[assetId]?.label : undefined;
    return { id: c.id, title: c.title, body: c.body, color: hex ? value(hex) : unknown<string>(),
      owner: c.anchor.kind === 'unresolved' ? c.anchor : assetId ? value({ kind: 'asset' as const, assetId, name: label as Field<string> ?? unknown<string>() }) :
        anchor?.kind === 'project' ? value({ kind: 'project' as const }) : value({ kind: 'none' as const }),
      mediaCount: projectMediaUncertain(provider, c.id) ? unknown<number>() : value(projectAttachments(provider, c.id).length), pin };
}
/** Whole Project inventory; unresolved raw endpoints must never become absence. */
export function projectCaptionInventory(provider: WorkspaceProvider, sceneId: string, hiddenAssetIds: readonly string[] = []): CaptionIncludeSource {
  const scene = resolveScene(provider.state, provider.resources, sceneId), scope = { token: provider.token, sceneId };
  if (scene.kind !== 'ready') return { ...scope, kind: 'unavailable', reason: 'シーンの状態を確認してください。' };
  const counts = new Map<string, number>(), uncertain = new Set<string>(); let uncertainAll = false;
  const deleteEdits = new Set(provider.issues.filter(i => i.code === 'concurrent-delete-edit').map(i => `${i.path[0]}/${i.path[1]}`));
  for (const [id, fields] of Object.entries(provider.details.mutable.sceneCaptionMembershipsById)) {
    const lifecycle = fieldValue(fields.lifecycle) as JsonObject | undefined, deleteEdit = deleteEdits.has(`sceneCaptionMembershipsById/${id}`);
    const owner = fieldValue(fields.captionId), target = fieldValue(fields.sceneId);
    if (typeof target !== 'string') { uncertainAll = true; continue; }
    if (target !== sceneId) continue;
    const edge = provider.state.captionMemberships[id];
    if (typeof owner !== 'string') uncertainAll = true;
    else if (fieldValue(fields.id) !== id || fields.orderKey?.kind !== 'value' || !lifecycle || deleteEdit) uncertain.add(owner);
    else if (lifecycle.state === 'deleted') continue;
    else if (lifecycle.state !== 'active' || !edge || edge.resourceId !== owner || edge.sceneId !== sceneId || fieldValue(edge.lifecycle)?.state !== 'active') uncertain.add(owner);
    else counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  const visibleOwners = new Set(scene.composition.assets.map(a => a.assetId).filter(id => !hiddenAssetIds.includes(id)));
  return { ...scope, kind: 'ready', items: Object.values(provider.resources.captions).map(caption => {
    const anchor = fieldValue(caption.anchor), owner = anchor?.kind === 'asset' ? anchor.assetId : null, count = counts.get(caption.id) ?? 0;
    return { caption: projectCaptionItem(provider, caption, anchor?.kind === 'unplaced' ? 'unplaced' : owner && !visibleOwners.has(owner) ? 'ownerHidden' : 'unavailable'),
      lifecycle: caption.lifecycle.kind === 'value' && !deleteEdits.has(`captionsById/${caption.id}`) ? value(caption.lifecycle.value.state) : unknown(),
      membership: uncertainAll || uncertain.has(caption.id) || count > 1 ? unknown() : value(count ? 'included' : 'absent') };
  }) };
}
