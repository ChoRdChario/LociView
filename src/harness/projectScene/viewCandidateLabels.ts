import type { ProjectProviderRead } from '../../scene/projectProvider';
type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
type ChoiceField = 'name' | 'orderKey' | 'camera' | 'background' | 'defaultViewId';
export const viewLabel = (p: Provider, id: string) => {
  const views = p.details.mutable.viewsById, row = views[id], name = row?.name, scene = row?.sceneId;
  const sceneId = scene?.kind === 'value' && typeof scene.value === 'string' ? scene.value : '', scenes = p.details.mutable.scenesById;
  const sceneName = scenes[sceneId]?.name, sceneNumber = Object.keys(scenes).sort().indexOf(sceneId) + 1;
  const knownScene = sceneName?.kind === 'value' && typeof sceneName.value === 'string';
  const duplicateScene = knownScene && Object.values(scenes).filter(r => r.name?.kind === 'value' && r.name.value === sceneName.value).length > 1;
  const scope = knownScene ? `${sceneName.value}${duplicateScene ? `（シーン ${sceneNumber}）` : ''}` : sceneId ? `シーン ${sceneNumber}` : 'シーンを確認';
  const number = Object.keys(views).sort().indexOf(id) + 1;
  const known = name?.kind === 'value' && typeof name.value === 'string';
  const duplicate = known && Object.values(views).filter(r => r.name?.kind === 'value' && r.name.value === name.value &&
    r.sceneId?.kind === 'value' && r.sceneId.value === sceneId).length > 1;
  return `${scope} › ${known ? `${name.value}${duplicate ? `（視点 ${number}）` : ''}` : `視点 ${number}`}`;
};
/** Description only: values used by the command always come from complete original candidates. */
export function viewDescription(p: Provider, id: string, field: ChoiceField, value: unknown, sceneId: string): string {
  if (field === 'defaultViewId') return value === undefined ? '開始視点なし' : viewLabel(p, value as string);
  if (field === 'name') return value as string;
  if (field === 'camera') {
    const camera = value as { position: number[]; target: number[]; up: number[];
      projection: { kind: string; verticalFovRadians?: number; verticalSpan?: number } };
    const projection = camera.projection.kind === 'perspective' ? `透視投影・縦画角 ${camera.projection.verticalFovRadians} rad` :
      `平行投影・縦幅 ${camera.projection.verticalSpan}`;
    return `${projection}／位置 ${camera.position.join(' / ')}／注視点 ${camera.target.join(' / ')}／上方向 ${camera.up.join(' / ')}`;
  }
  if (field === 'background') return `単色・sRGB ${(value as { colorSrgb: number[] }).colorSrgb.join(' / ')}`;
  const rows: { name: string; key: string }[] = []; let unresolved = false;
  for (const [otherId, r] of Object.entries(p.details.mutable.viewsById)) {
    if (otherId === id || r.sceneId?.kind === 'value' && r.sceneId.value !== sceneId) continue;
    if (r.lifecycle?.kind === 'value' && (r.lifecycle.value as { state?: string }).state === 'deleted') continue;
    if (r.id?.kind !== 'value' || r.id.value !== otherId || r.projectFrameId?.kind !== 'value' || r.projectFrameId.value !== p.resources.projectFrameId ||
      r.sceneId?.kind !== 'value' || r.lifecycle?.kind !== 'value' || (r.lifecycle.value as { state?: string }).state !== 'active' ||
      p.issues.some(i => i.path[0] === 'viewsById' && i.path[1] === otherId && i.code === 'concurrent-delete-edit') ||
      r.orderKey?.kind !== 'value' || typeof r.orderKey.value !== 'string') {
      unresolved = true; continue;
    }
    rows.push({ name: viewLabel(p, otherId), key: r.orderKey.value });
  }
  const key = value as string, before = rows.filter(r => r.key < key).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).at(-1),
    after = rows.filter(r => r.key > key).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)[0], ties = rows.filter(r => r.key === key);
  return [before ? `「${before.name}」の後` : '先頭側', after ? `「${after.name}」の前` : '末尾側',
    ...(ties.length ? [`同じ順序：${ties.map(r => r.name).join('、')}`] : []), ...(unresolved ? ['未解決の視点は比較から除外'] : [])].join('／');
}
