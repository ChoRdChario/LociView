import * as THREE from 'three';
import { resolveScene } from '../../scene/resolve';
import { captionColorKey } from '../../ui/projectScene/captionListState';
import { freezeSynthetic, type SyntheticProject } from './fixture';
import { modelVersion, syntheticVersions } from './modelFixture';
import { readFixtureModel, canonicalFixture, type FixtureModelClosure, type FixturePlacement } from './modelClosure';

export type V3 = readonly [number, number, number];
export interface Bounds { readonly min: V3; readonly max: V3 }
export interface DisplayPin { readonly id: string; readonly title: string; readonly color: string; readonly position: V3 }
export interface SyntheticDisplay {
  readonly token: string; readonly sceneId: string; readonly projectFrameId: string;
  readonly models: readonly FixtureModelClosure[]; readonly pins: readonly DisplayPin[];
  readonly bounds: Bounds | null; readonly selectedId: string | null;
}
export interface CameraPose {
  readonly position: V3; readonly target: V3; readonly up: V3;
  readonly projection: { readonly kind: 'perspective'; readonly verticalFov: number } |
    { readonly kind: 'orthographic'; readonly verticalSpan: number };
}
const tuple = (v: THREE.Vector3): V3 => {
  if (![v.x, v.y, v.z].every(Number.isFinite)) throw new Error('表示座標が扱える範囲を超えています。');
  return [v.x || 0, v.y || 0, v.z || 0];
};
export function placementMatrix(t: FixturePlacement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(...t.translation), new THREE.Quaternion(...t.rotationXYZW), new THREE.Vector3().setScalar(t.uniformScale));
}
export function pointInProject(point: V3, placement: FixturePlacement): V3 {
  return tuple(new THREE.Vector3(...point).applyMatrix4(placementMatrix(placement)));
}
export function projectBounds(bounds: Bounds, placement: FixturePlacement): Bounds {
  const box = new THREE.Box3();
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]])
    box.expandByPoint(new THREE.Vector3(...pointInProject([x, y, z], placement)));
  return { min: tuple(box.min), max: tuple(box.max) };
}
export function syntheticDisplay(project: SyntheticProject, sceneId: string, pinColors: readonly string[] | null, selectedId: string | null): SyntheticDisplay {
  const resolved = resolveScene(project.state, project.resources, sceneId);
  if (resolved.kind !== 'ready') throw new Error('シーンの表示を確認してください。');
  const models = resolved.composition.assets.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)).map(asset => {
    const version = modelVersion(asset.assetId, asset.projection.bindingId, project.modelVersions ?? syntheticVersions);
    if (!version) throw new Error('表示する合成モデルを確認してください。');
    return readFixtureModel(canonicalFixture(version.closure));
  });
  const box = new THREE.Box3();
  for (const model of models) {
    const b = projectBounds(model.representation.logicalBoundsAsset, model.binding.assetToProject);
    box.union(new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)));
  }
  const pins: DisplayPin[] = [];
  for (const caption of resolved.composition.captions) {
    if (caption.marker !== 'visible' || caption.anchor.kind !== 'value') continue;
    const color = captionColorKey(project.colors[caption.captionId] ?? { kind: 'unresolved', reason: 'invalid' });
    if (!color || (pinColors !== null && !pinColors.includes(color))) continue;
    const anchor = caption.anchor.value;
    const model = anchor.kind === 'asset' ? models.find(m => m.binding.assetId === anchor.assetId) : null;
    const position = anchor.kind === 'project' ? anchor.positionProject : model ? pointInProject(anchor.positionAsset, model.binding.assetToProject) : null;
    if (position) pins.push({ id: caption.captionId, color, position,
      title: caption.title.kind === 'value' && caption.title.value.trim() ? caption.title.value : 'キャプション' });
  }
  return freezeSynthetic({ token: project.state.token, sceneId, projectFrameId: project.resources.projectFrameId, models, pins, selectedId,
    bounds: box.isEmpty() ? null : { min: tuple(box.min), max: tuple(box.max) } });
}
export const defaultPose = (): CameraPose => ({ position: [0, 1, 3], target: [0, 0, 0], up: [0, 1, 0],
  projection: { kind: 'perspective', verticalFov: Math.PI / 4 } });
export function fittedPose(bounds: Bounds, pose: CameraPose, aspect: number, axis?: string): CameraPose {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('表示領域の大きさを確認してください。');
  const box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max)), target = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6);
  const axes: Record<string, V3> = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
  const direction = axis && axes[axis] ? new THREE.Vector3(...axes[axis]!) : new THREE.Vector3(...pose.position).sub(new THREE.Vector3(...pose.target)).normalize();
  const fov = pose.projection.kind === 'perspective' ? pose.projection.verticalFov : Math.PI / 4;
  const half = Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * aspect));
  const distance = radius / Math.sin(half) * 1.1;
  const projection = pose.projection.kind === 'perspective' ? pose.projection : { kind: 'orthographic' as const, verticalSpan: 2 * radius * 1.1 / Math.min(1, aspect) };
  return freezeSynthetic({ position: tuple(target.clone().addScaledVector(direction, distance)), target: tuple(target),
    up: axis === '+y' ? [0, 0, -1] : axis === '-y' ? [0, 0, 1] : axis ? [0, 1, 0] : pose.up, projection } as CameraPose);
}
export function switchProjection(pose: CameraPose, kind: 'perspective' | 'orthographic'): CameraPose {
  if (pose.projection.kind === kind) return pose;
  const target = new THREE.Vector3(...pose.target), offset = new THREE.Vector3(...pose.position).sub(target);
  if (pose.projection.kind === 'perspective') return freezeSynthetic({ ...pose,
    projection: { kind: 'orthographic', verticalSpan: 2 * offset.length() * Math.tan(pose.projection.verticalFov / 2) } });
  const fov = 2 * Math.atan(pose.projection.verticalSpan / (2 * offset.length()));
  if (!Number.isFinite(fov) || fov <= 0 || fov >= Math.PI) throw new Error('投影方式を変更できません。表示範囲を確認してください。');
  return freezeSynthetic({ ...pose, projection: { kind: 'perspective', verticalFov: fov } });
}
