import { value, type Field, type Membership } from '../../scene/types';
import { resolveScene } from '../../scene/resolve';
import { createSyntheticProject, freezeSynthetic, type SyntheticProject } from './fixture';
import type { DevelopmentHistory, HistoryCell, HistorySnapshot } from './historyPort';
import { decodeSyntheticAnchor } from './modelFixture';
import { modelHistorySeed, projectModelHistory } from './modelHistory';
import { projectViewHistory, viewHistorySeed } from './viewHistory';
import { projectMaterialHistory } from './materialHistory';
import { mediaSeed, projectMediaHistory } from './mediaHistory';

export const captionKey = (id: string, field: 'title' | 'body' | 'color' | 'anchor' | 'template') => `caption/${id}/${field}`;
export const bindingKey = (id: string) => `asset/${id}/binding`;
export const membershipKey = (id: string) => `membership/${id}`;
const initial = createSyntheticProject();
const fields = ['title', 'body', 'color', 'anchor'] as const;
export function historySeed(): Readonly<Record<string, string>> {
  return Object.fromEntries([
    ...Object.values(initial.resources.captions).flatMap(c => fields.map(field => {
      const cell = field === 'color' ? initial.colors[c.id]! : c[field];
      if (cell.kind !== 'value') throw new Error('合成データの初期値がありません。');
      return [captionKey(c.id, field), field === 'anchor' ? JSON.stringify(cell.value) : cell.value as string];
    })),
    ...Object.entries(modelHistorySeed()),
    ...Object.entries(viewHistorySeed()),
    ...Object.entries(mediaSeed()),
    ...Object.values(initial.state.assetMemberships).map(edge => [membershipKey(edge.id), JSON.stringify(edge)]),
    ...Object.values(initial.state.captionMemberships).map(edge => [membershipKey(edge.id), JSON.stringify(edge)]),
  ]);
}
const projectField = (cell: HistoryCell): Field<string> => cell.kind === 'value' ? value(cell.value) :
  { kind: 'unresolved', reason: 'conflict' };

/** Exact known fixture projection. This is not an importer for arbitrary Project data. */
export function projectHistory(snapshot: HistorySnapshot, previous?: HistorySnapshot): SyntheticProject {
  const models = projectModelHistory(snapshot, previous);
  const views = projectViewHistory(snapshot, previous);
  const materials = projectMaterialHistory(snapshot, models.versions.map(v => v.closure), previous);
  const captions = { ...initial.resources.captions }, colors = { ...initial.colors }, assets = models.assets;
  const memberships: Record<string, Membership> = {}, captionMemberships: Record<string, Membership> = {};
  const captionTemplates = { ...initial.captionTemplates };
  const expected = new Set(Object.keys(historySeed()).filter(key => key.startsWith('caption/')));
  const copies: Record<string, { templateId: string; sourceId: string; eventId: string }> = {};
  // Only fixture-derived Caption identities; known attachments are validated as a complete closure below.
  for (const [key, cell] of Object.entries(snapshot.cells)) {
    if (!/^caption\/cap_[0-9a-f]{32}\/template$/.test(key)) continue;
    const id = key.split('/')[1]!;
    if (initial.resources.captions[id] || cell.kind !== 'value') throw new Error('コピーの識別情報を確認してください。');
    const meta = JSON.parse(cell.value) as (typeof copies)[string];
    if (!meta || Object.keys(meta).sort().join(',') !== 'eventId,sourceId,templateId' ||
      !initial.resources.captions[meta.templateId] || !/^cap_[0-9a-f]{32}$/.test(meta.sourceId) ||
      !/^evt_[0-9a-f]{32}$/.test(meta.eventId) || meta.sourceId === id)
      throw new Error('コピーの参照関係を確認してください。');
    copies[id] = meta; captionTemplates[id] = meta.templateId;
    captions[id] = { ...initial.resources.captions[meta.templateId]!, id,
      lifecycle: value({ state: 'active', eventId: meta.eventId, reason: 'conflictResolution' }) };
    expected.add(key); fields.forEach(field => expected.add(captionKey(id, field)));
  }
  for (const [id, meta] of Object.entries(copies)) {
    const seen = new Set([id]); let sourceId = meta.sourceId;
    while (copies[sourceId]) {
      if (seen.has(sourceId)) throw new Error('コピーの参照が循環しています。');
      seen.add(sourceId); sourceId = copies[sourceId]!.sourceId;
    }
    if (sourceId !== meta.templateId) throw new Error('コピーの所有モデルを確認してください。');
  }
  // Local edits and incoming updates cannot replace an already known immutable copy identity.
  for (const [key, old] of Object.entries(previous?.cells ?? {})) {
    if (key.endsWith('/template') && JSON.stringify(snapshot.cells[key]) !== JSON.stringify(old))
      throw new Error('コピーの識別情報は変更できません。');
  }
  for (const [key, cell] of Object.entries(snapshot.cells)) {
    if (['model/', 'asset/', 'view/', 'scene/', 'material/', 'media/', 'attachment/'].some(prefix => key.startsWith(prefix))) continue; // Known graphs checked together.
    const candidates = cell.kind === 'value' ? [cell.value] : cell.candidates.map(c => c.value);
    if (!candidates.length) throw new Error('更新候補がありません。');
    if (expected.delete(key)) {
      const [, id, field] = key.split('/');
      if (!id || !field || candidates.some(c => c.length > 65_536)) throw new Error('更新内容を確認してください。');
      if (field === 'template') continue;
      if (field === 'anchor') {
        const anchors = candidates.map(candidate => decodeSyntheticAnchor(candidate, captionTemplates[id]!));
        captions[id] = { ...captions[id]!, anchor: cell.kind === 'value' ? value(anchors[0]!) :
          { kind: 'unresolved', reason: 'conflict' } };
      } else if (field === 'color') {
        if (candidates.some(c => !/^#[0-9a-f]{6}$/i.test(c))) throw new Error('ピン色を確認してください。');
        colors[id] = projectField(cell);
      } else if (field === 'title' || field === 'body') {
        captions[id] = { ...captions[id]!, [field]: projectField(cell) };
      }
    } else if (/^membership\/(sam|scm)_[0-9a-f]{32}$/.test(key)) {
      const edges = candidates.map(text => JSON.parse(text) as Membership);
      const first = edges[0]!;
      const isCaption = key.startsWith('membership/scm_');
      // Identity/ownership/order never change in this bounded include/exclude port.
      // A conflict only projects lifecycle as unresolved; it does not choose an edge.
      for (const edge of edges) {
        if (!edge || Object.keys(edge).sort().join(',') !== 'id,lifecycle,orderKey,resourceId,sceneId' ||
          membershipKey(edge.id) !== key || !initial.state.scenes[edge.sceneId] ||
          !(isCaption ? captions : assets)[edge.resourceId] || edge.lifecycle?.kind !== 'value' ||
          !['active', 'deleted'].includes(edge.lifecycle.value.state) || edge.orderKey?.kind !== 'value' ||
          !/^[0-9A-Za-z]{1,64}$/.test(edge.orderKey.value) || !/^evt_[0-9a-f]{32}$/.test(edge.lifecycle.value.eventId) ||
          edge.sceneId !== first.sceneId || edge.resourceId !== first.resourceId ||
          edge.orderKey.value !== (first.orderKey.kind === 'value' ? first.orderKey.value : null))
          throw new Error('シーン所属の更新を確認してください。');
      }
      const before = previous?.cells[key];
      const oldEdges = before?.kind === 'value' ? [before.value] : before?.candidates.map(c => c.value) ?? [];
      if (oldEdges.some(text => { const edge = JSON.parse(text) as Membership;
        return edge.sceneId !== first.sceneId || edge.resourceId !== first.resourceId ||
          JSON.stringify(edge.orderKey) !== JSON.stringify(first.orderKey); })) throw new Error('所属の参照先は変更できません。');
      (isCaption ? captionMemberships : memberships)[first.id] = cell.kind === 'value' ? first :
        { ...first, lifecycle: { kind: 'unresolved', reason: 'conflict' } };
    } else throw new Error('この開発版で扱わない更新です。');
  }
  if (expected.size || Object.keys(initial.state.assetMemberships).some(id => !memberships[id]) ||
    Object.keys(initial.state.captionMemberships).some(id => !captionMemberships[id]) ||
    Object.keys(copies).some(id => !Object.values(captionMemberships).some(edge => edge.resourceId === id)))
    throw new Error('必要な更新内容がありません。');
  const media = projectMediaHistory(snapshot, Object.keys(captions), previous);
  const result: SyntheticProject = { ...initial, mediaData: media,
    state: { ...initial.state, scenes: views.scenes, token: snapshot.token, assetMemberships: memberships, captionMemberships },
    resources: { ...initial.resources, token: snapshot.token, captions, assets, views: views.data.records, materials: materials.records }, colors, captionTemplates, viewData: views.data, materialData: materials,
    modelNames: models.names, modelVersions: models.versions };
  for (const id of Object.keys(result.state.scenes)) {
    if (resolveScene(result.state, result.resources, id).kind !== 'ready') throw new Error('シーンを確認してください。');
  }
  return freezeSynthetic(result);
}
export interface SyntheticAuthority {
  read(): SyntheticProject;
  write(token: string, changes: Readonly<Record<string, string>>): SyntheticProject;
}
export function historyAuthority(history: DevelopmentHistory): SyntheticAuthority {
  return { read: () => projectHistory(history.read()),
    write: (token, changes) => projectHistory(history.write(token, changes)) };
}
