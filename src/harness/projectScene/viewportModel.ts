import * as THREE from 'three';
import { resolveScene } from '../../scene/resolve';
import { captionColorKey } from '../../ui/projectScene/captionListState';
import { freezeSynthetic, type SyntheticProject } from './fixture';
import { modelVersion, syntheticVersions } from './modelFixture';
import { readFixtureModel, canonicalFixture, type FixturePlacement } from './modelClosure';
import type { DisplayModelClosure, ReadonlyRenderModel } from './modelTypes';
import { readProjectCamera, readSolidBackground } from './viewHistory';
import type { DisplayCapture } from './viewSession';
import { materialTarget, targetKey, resolveFixtureMaterial } from './materialHistory';
import type { MaterialIntent } from '../../domain/materialIntent';
import type { GizmoProposal, ModelPlacementTarget, PinGizmoProposal } from './pinGizmo';
import { proposedPlacement } from './modelTransform';
import { validationMaterialSlots, validationMaterialIssue, type ValidationMaterialEffects } from './validationMaterials';

export type V3 = readonly [number, number, number];
export interface Bounds { readonly min: V3; readonly max: V3 }
export interface DisplayPin {
  readonly id: string; readonly title: string; readonly color: string; readonly position: V3;
  readonly status: 'normal' | 'needsReview';
}
export interface SyntheticDisplay {
  readonly readOnly?: false;
  readonly token: string; readonly sceneId: string; readonly projectFrameId: string;
  readonly models: readonly DisplayModelClosure[]; readonly pins: readonly DisplayPin[];
  /** Residents remain loaded. This local filter controls rendering, bounds and picking only. */
  readonly hiddenAssetIds?: readonly string[];
  readonly bounds: Bounds | null; readonly selectedId: string | null;
  /** UI-only proposed position, distinct from the confirmed Caption markers. */
  readonly preview?: V3;
  readonly pinEdit?: PinGizmoProposal;
  readonly modelEdit?: GizmoProposal<ModelPlacementTarget>;
  readonly materials?: Readonly<Record<string, ReturnType<typeof resolveFixtureMaterial> | { readonly issue: string }>>;
  readonly savedMaterials?: Readonly<Record<string, ValidationMaterialEffects>>;
  readonly materialNotices?: readonly string[];
  readonly entry?: { readonly kind: 'none' } | { readonly kind: 'blocked'; readonly reason: string } | { readonly kind: 'ready'; readonly payload: DisplayCapture };
}
export interface ReadonlyDisplay extends Omit<SyntheticDisplay, 'models' | 'readOnly' | 'pinEdit' | 'modelEdit' | 'preview'> {
  readonly readOnly: true; readonly models: readonly ReadonlyRenderModel[];
  readonly pinEdit?: never; readonly modelEdit?: never; readonly preview?: never;
}
export type RenderDisplay = SyntheticDisplay | ReadonlyDisplay;
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
export function syntheticDisplay(project: SyntheticProject, sceneId: string, pinColors: readonly string[] | null, selectedId: string | null,
  modelEdit?: GizmoProposal<ModelPlacementTarget>, hiddenAssetIds: readonly string[] = []): SyntheticDisplay {
  const resolved = resolveScene(project.state, project.resources, sceneId);
  if (resolved.kind !== 'ready') throw new Error('シーンの表示を確認してください。');
  const models = resolved.composition.assets.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)).map(asset => {
    const version = modelVersion(asset.assetId, asset.projection.bindingId, project.modelVersions ?? syntheticVersions);
    if (!version) throw new Error('表示するモデルを確認してください。');
    return version.closure.shape === 'saved-glb' ? version.closure : readFixtureModel(canonicalFixture(version.closure));
  });
  const materials = Object.fromEntries(models.filter(c => c.shape !== 'saved-glb').map(c => {
    const target = materialTarget(c), intent = resolved.composition.materials.find(m => targetKey(m.target) === targetKey(target))?.intent as MaterialIntent | undefined;
    try { return [c.binding.assetId, resolveFixtureMaterial(intent)]; }
    catch (e) { return [c.binding.assetId, { issue: e instanceof Error ? e.message : '見え方を確認してください。' }]; }
  }));
  const savedMaterials = Object.fromEntries(models.filter(c => c.shape === 'saved-glb').map(model => [model.binding.assetId,
    Object.fromEntries(validationMaterialSlots(model).flatMap(slot => {
      const intent = resolved.composition.materials.find(m => targetKey(m.target) === targetKey(slot.target))?.intent as MaterialIntent | undefined;
      if (!intent) return []; const issue = validationMaterialIssue(slot, intent);
      return [[slot.target.logicalMaterialSlotId, issue ? { issue } : intent]];
    }))]));
  const activeTargets = new Set(models.flatMap(m => m.shape === 'saved-glb' ? validationMaterialSlots(m).map(s => targetKey(s.target)) : [targetKey(materialTarget(m))]));
  const materialNotices = Object.values(project.materialData?.records ?? {}).flatMap(r => {
    if (r.lifecycle.kind === 'value' && r.lifecycle.value.state === 'deleted') return [];
    if (r.routing.kind !== 'value') return ['見え方の適用先に競合があります。'];
    const route = r.routing.value;
    if (route.scope.kind === 'scene' && route.scope.sceneId !== sceneId) return [];
    if (!models.some(m => m.binding.assetId === route.target.assetId)) return [];
    return !activeTargets.has(targetKey(route.target)) ? ['以前のモデルの設定は適用していません。モデルと面の対応を確認してください。'] :
      r.lifecycle.kind !== 'value' || r.intent.kind !== 'value' || resolved.issues.some(i => i.entityId === r.id)
        ? ['見え方の設定に競合があります。この範囲の設定は適用していません。'] : [];
  });
  const box = new THREE.Box3();
  const hidden = new Set(hiddenAssetIds);
  for (const model of models) {
    if (hidden.has(model.binding.assetId)) continue;
    const b = projectBounds(model.representation.logicalBoundsAsset, model.binding.assetToProject);
    box.union(new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)));
  }
  const pins: DisplayPin[] = [];
  for (const caption of resolved.composition.captions) {
    if (caption.marker === 'suppressed' || caption.anchor.kind !== 'value') continue;
    const color = captionColorKey(project.colors[caption.captionId] ?? { kind: 'unresolved', reason: 'invalid' });
    if (!color || (pinColors !== null && !pinColors.includes(color))) continue;
    const anchor = caption.anchor.value;
    if (anchor.kind === 'asset' && hidden.has(anchor.assetId)) continue;
    const model = anchor.kind === 'asset' ? models.find(m => m.binding.assetId === anchor.assetId) : null;
    const placement = model && modelEdit?.target.assetId === model.binding.assetId
      ? proposedPlacement(model.binding.assetToProject, modelEdit) : model?.binding.assetToProject;
    const position = anchor.kind === 'project' ? anchor.positionProject : placement ? pointInProject(anchor.positionAsset, placement) : null;
    if (position) pins.push({ id: caption.captionId, color, position, status: caption.marker === 'needsReview' ? 'needsReview' : 'normal',
      title: caption.title.kind === 'value' && caption.title.value.trim() ? caption.title.value : 'キャプション' });
  }
  const pointer = project.state.scenes[sceneId]!.defaultViewId;
  let entry: SyntheticDisplay['entry'] = { kind: 'none' };
  if (pointer.kind !== 'value' || pointer.value !== null) {
    const v = pointer.kind === 'value' && pointer.value ? project.resources.views[pointer.value] : undefined;
    entry = { kind: 'blocked', reason: '開始時の視点を確認してください。カメラは変更していません。' };
    if (v && v.sceneId === sceneId && v.projectFrameId === project.resources.projectFrameId && v.lifecycle.kind === 'value' &&
      v.lifecycle.value.state === 'active' && v.camera.kind === 'value' && v.background.kind === 'value') {
      try { entry = { kind: 'ready', payload: { camera: readProjectCamera(v.camera.value), background: readSolidBackground(v.background.value) } }; }
      catch { /* Keep the explicit entry diagnostic; never fit or choose another View. */ }
    }
  }
  return freezeSynthetic({ token: project.state.token, sceneId, projectFrameId: project.resources.projectFrameId, models, pins, hiddenAssetIds, selectedId, entry, materials, savedMaterials, modelEdit, materialNotices: [...new Set(materialNotices)],
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
