import type { ProjectDisplay } from './displayTypes';
import { canonicalDisplay } from './displaySupport';
import {routingKey} from './materialDisplay';
export function describeMaterialCandidate(field: string, text: string, project: ProjectDisplay): string {
  const v = JSON.parse(text);
  if (field === 'lifecycle') return v.state === 'deleted' ? '設定を解除' : '設定を残す';
  if (field === 'routing') {
    const scene = v.scope.kind === 'scene' ? project.state.scenes[v.scope.sceneId]?.name : null;
    return `${project.modelNames[v.target.assetId] ?? 'モデル'} — ${scene?.kind === 'value' ? scene.value : 'プロジェクト共通'} — マテリアル ${v.target.logicalMaterialSlotId}`;
  }
  if (field === 'appearance') return `${v.lighting === 'unlit' ? '照明なし' : v.lighting === 'lit' ? '照明あり' : '元の照明'}・${v.doubleSided ? '両面' : v.doubleSided === false ? '片面' : '元の面設定'}・不透明度 ${(v.opacity ?? 1) * 100}%` +
    (v.baseColorSrgb ? `・色 ${v.baseColorSrgb.join(' / ')}` : '') + (v.chroma ? `・色抜き${project.semanticProfile === 'map2' && v.chroma.enabled === false ? '無効（設定保持）' : ''} ${v.chroma.keyColorSrgb.join(' / ')}、許容 ${v.chroma.tolerance}、ぼかし ${v.chroma.softness}` : '・色抜きなし') +
    (Object.keys(v).some(k => !['lighting', 'doubleSided', 'opacity', 'baseColorSrgb', 'chroma'].includes(k)) ? '・未対応の追加設定あり' : '');
  return `被覆 ${v.coverage.policy}${v.coverage.alphaCutoff !== undefined ? `・しきい値 ${v.coverage.alphaCutoff}` : ''}・光学 ${v.optics}`;
}

export function describeMaterialTarget(id: string, project: ProjectDisplay): string {
  const review = project.materialReviewData ?? project.materialData, record = review?.records[id];
  if (record?.routing.kind !== 'value') return `適用先を確認 — 設定 ${id}`;
  const route = record.routing.value;
  const peers = Object.values(review!.records).filter(r =>
    r.candidates.some(c => routingKey(c) === routingKey(route)) && (r.lifecycle.kind !== 'value' || r.lifecycle.value.state !== 'deleted'));
  return describeMaterialCandidate('routing', canonicalDisplay(route), project) + (peers.length > 1 ? ` — 設定 ${id}` : '');
}
