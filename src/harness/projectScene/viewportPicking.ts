import * as THREE from 'three';
import type { SyntheticDisplay, V3 } from './viewportModel';

/** Ephemeral exact resident target; never saved source provenance or an inferred relation. */
export interface PinSurfaceTarget {
  readonly token: string; readonly sceneId: string; readonly assetId: string; readonly assetFrameId: string;
  readonly bindingId: string; readonly revisionId: string; readonly representationId: string;
  readonly familyId: string; readonly compatibilityId: string;
}
export interface ResidentSurface { readonly mesh: THREE.Mesh; readonly asset: THREE.Group }

/** Exact opaque fixture only. Other resident meshes can occlude, never become targets. */
export function pickResidentSurface(display: SyntheticDisplay, target: PinSurfaceTarget,
  resident: ReadonlyMap<string, ResidentSurface>, camera: THREE.Camera, ndc: THREE.Vector2): V3 | null {
  if (![ndc.x, ndc.y].every(Number.isFinite) || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 ||
    display.token !== target.token || display.sceneId !== target.sceneId) return null;
  const model = display.models.find(m => m.binding.assetId === target.assetId), selected = resident.get(target.assetId);
  if (!model || !selected || model.binding.id !== target.bindingId || model.assetFrame.id !== target.assetFrameId ||
    model.revision.id !== target.revisionId || model.representation.id !== target.representationId ||
    model.representation.variantFamilyId !== target.familyId || !model.revision.anchorCompatibilityClasses.some(c =>
      c.id === target.compatibilityId && c.targetVariantFamilyIds.includes(target.familyId))) return null;
  camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  // This viewport permits a negative orthographic near plane. Three's default
  // camera-plane origin would discard visible geometry behind that plane.
  if (camera instanceof THREE.OrthographicCamera) ray.ray.origin.set(ndc.x, ndc.y, -1).unproject(camera);
  function hit(surface: ResidentSurface) {
    const material = surface.mesh.material;
    if (!surface.asset.visible || !surface.mesh.visible || Array.isArray(material) || !material.visible) return undefined;
    surface.asset.updateMatrixWorld(true);
    // Camera near/far planes are not Euclidean ray distances, especially for orthographic views.
    return ray.intersectObject(surface.mesh, false).find(result => {
      const p = result.point.clone().project(camera);
      return [p.x, p.y, p.z].every(Number.isFinite) && p.z >= -1 && p.z <= 1;
    });
  }
  const chosen = hit(selected); if (!chosen) return null;
  for (const [id, surface] of resident) {
    if (id === target.assetId) continue;
    const occluder = hit(surface); if (occluder && occluder.distance < chosen.distance) return null;
  }
  const p = selected.asset.worldToLocal(chosen.point.clone());
  return [p.x, p.y, p.z].every(Number.isFinite) ? [p.x || 0, p.y || 0, p.z || 0] : null;
}
