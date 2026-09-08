import { value, type Field, type Membership } from '../../scene/types';
import { resolveScene } from '../../scene/resolve';
import { createSyntheticProject, freezeSynthetic, type SyntheticProject } from './fixture';
import type { DevelopmentHistory, HistoryCell, HistorySnapshot } from './historyPort';

export const captionKey = (id: string, field: 'title' | 'body' | 'color') => `caption/${id}/${field}`;
export const membershipKey = (id: string) => `membership/${id}`;
const initial = createSyntheticProject();
const fields = ['title', 'body', 'color'] as const;
export function historySeed(): Readonly<Record<string, string>> {
  return Object.fromEntries([
    ...Object.values(initial.resources.captions).flatMap(c => fields.map(field => {
      const cell = field === 'color' ? initial.colors[c.id]! : c[field];
      if (cell.kind !== 'value') throw new Error('合成データの初期値がありません。');
      return [captionKey(c.id, field), cell.value];
    })),
    ...Object.values(initial.state.assetMemberships).map(edge => [membershipKey(edge.id), JSON.stringify(edge)]),
  ]);
}
const projectField = (cell: HistoryCell): Field<string> => cell.kind === 'value' ? value(cell.value) :
  { kind: 'unresolved', reason: 'conflict' };

/** Exact known fixture projection. This is not an importer for arbitrary Project data. */
export function projectHistory(snapshot: HistorySnapshot): SyntheticProject {
  const captions = { ...initial.resources.captions }, colors = { ...initial.colors };
  const memberships: Record<string, Membership> = {};
  const expected = new Set(Object.keys(historySeed()).filter(key => key.startsWith('caption/')));
  for (const [key, cell] of Object.entries(snapshot.cells)) {
    const candidates = cell.kind === 'value' ? [cell.value] : cell.candidates.map(c => c.value);
    if (!candidates.length) throw new Error('更新候補がありません。');
    if (expected.delete(key)) {
      const [, id, field] = key.split('/');
      if (!id || !field || candidates.some(c => c.length > 65_536)) throw new Error('更新内容を確認してください。');
      if (field === 'color') {
        if (candidates.some(c => !/^#[0-9a-f]{6}$/i.test(c))) throw new Error('ピン色を確認してください。');
        colors[id] = projectField(cell);
      } else if (field === 'title' || field === 'body') {
        captions[id] = { ...captions[id]!, [field]: projectField(cell) };
      }
    } else if (/^membership\/sam_[0-9a-f]{32}$/.test(key)) {
      const edges = candidates.map(text => JSON.parse(text) as Membership);
      const first = edges[0]!;
      // Identity/ownership/order never change in this bounded include/exclude port.
      // A conflict only projects lifecycle as unresolved; it does not choose an edge.
      for (const edge of edges) {
        if (!edge || membershipKey(edge.id) !== key || !initial.state.scenes[edge.sceneId] ||
          !initial.resources.assets[edge.resourceId] || edge.lifecycle?.kind !== 'value' ||
          !['active', 'deleted'].includes(edge.lifecycle.value.state) || edge.orderKey?.kind !== 'value' ||
          edge.sceneId !== first.sceneId || edge.resourceId !== first.resourceId ||
          edge.orderKey.value !== (first.orderKey.kind === 'value' ? first.orderKey.value : null))
          throw new Error('モデル所属の更新を確認してください。');
      }
      memberships[first.id] = cell.kind === 'value' ? first : { ...first, lifecycle: { kind: 'unresolved', reason: 'conflict' } };
    } else throw new Error('この開発版で扱わない更新です。');
  }
  if (expected.size || Object.keys(initial.state.assetMemberships).some(id => !memberships[id]))
    throw new Error('必要な更新内容がありません。');
  const result: SyntheticProject = { ...initial,
    state: { ...initial.state, token: snapshot.token, assetMemberships: memberships },
    resources: { ...initial.resources, token: snapshot.token, captions }, colors };
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
