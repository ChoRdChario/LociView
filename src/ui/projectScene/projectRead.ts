import { resolveScene } from '../../scene/resolve';
import { value, type Field } from '../../scene/types';
import type { JsonValue, JsonObject } from '../../domain/values';
import type { WorkspaceProvider } from './projectWorkspacePorts';
import type { CaptionListItem } from './captionListState';
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
      if (scene !== sceneId || owner !== asset.id || !activeRecord(fields)) uncertain = true;
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
    if (!target || target.captionId !== captionId || !activeRecord(fields)) return [];
    const media = fieldValue(provider.details.immutable.mediaResourcesById[target.mediaResourceId]);
    return [{ id, media, fields, label: typeof media?.label === 'string' ? media.label : 'メディア',
      order: String(fieldValue(fields.orderKey) ?? ''), alt: String(fieldValue(fields.altText) ?? '') }];
  }).sort((a, b) => a.order < b.order ? -1 : a.order > b.order ? 1 : a.id.localeCompare(b.id));
}
/** An unresolved relation may belong to this caption; never turn it into a known zero. */
export function projectMediaUncertain(provider: WorkspaceProvider, captionId: string): boolean {
  return Object.entries(provider.details.mutable.captionAttachmentsById).some(([id, fields]) => {
    const lifecycle = fieldValue(fields.lifecycle) as JsonObject | undefined;
    if (lifecycle?.state === 'deleted') return false;
    const target = fieldValue(provider.details.attachments[id]);
    if (target && target.captionId !== captionId) return false;
    return !target || lifecycle?.state !== 'active' || fields.orderKey?.kind !== 'value' || fields.altText?.kind !== 'value' ||
      provider.details.immutable.mediaResourcesById[target.mediaResourceId]?.kind !== 'value';
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
export function projectCaptions(provider: WorkspaceProvider, sceneId: string): readonly CaptionListItem[] {
  const scene = resolveScene(provider.state, provider.resources, sceneId);
  if (scene.kind !== 'ready') return [];
  return scene.composition.captions.map(c => {
    const colorField = provider.details.mutable.captionsById[c.captionId]?.colorSrgb;
    const color = fieldValue(colorField);
    const hex = Array.isArray(color) && color.length === 3 && color.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
      ? '#' + color.map(n => Math.round(Number(n) * 255).toString(16).padStart(2, '0')).join('') : colorField?.kind === 'value' && color === undefined ? '#a08045' : null;
    const anchor = fieldValue(c.anchor), assetId = anchor?.kind === 'asset' ? anchor.assetId : anchor?.kind === 'unplaced' ? anchor.ownerAssetId : null;
    const label = assetId ? provider.details.mutable.assetsById[assetId]?.label : undefined;
    return { id: c.captionId, title: c.title, body: c.body, color: hex ? value(hex) : unknown<string>(),
      owner: c.anchor.kind === 'unresolved' ? c.anchor : assetId ? value({ kind: 'asset' as const, assetId, name: label as Field<string> ?? unknown<string>() }) :
        anchor?.kind === 'project' ? value({ kind: 'project' as const }) : value({ kind: 'none' as const }),
      mediaCount: projectMediaUncertain(provider, c.captionId) ? unknown<number>() : value(projectAttachments(provider, c.captionId).length),
      pin: c.marker === 'visible' ? 'visible' : c.marker === 'unplaced' ? 'unplaced' : c.marker === 'needsReview' ? 'needsReview' : 'unavailable' };
  });
}
