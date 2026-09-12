import * as THREE from 'three';
import type { SyntheticDisplay, V3 } from './viewportModel';

/** Ephemeral exact resident target; never saved source provenance or an inferred relation. */
export interface PinSurfaceTarget {
  readonly token: string; readonly sceneId: string; readonly assetId: string; readonly assetFrameId: string;
  readonly bindingId: string; readonly revisionId: string; readonly representationId: string;
  readonly familyId: string; readonly compatibilityId: string;
}
export interface ResidentSurface { readonly mesh: THREE.Object3D; readonly asset: THREE.Group; dispose?(): void }

/** Other resident models can occlude, never become the requested target. */
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
    if (!surface.asset.visible || !surface.mesh.visible) return undefined;
    surface.asset.updateMatrixWorld(true);
    // Camera near/far planes are not Euclidean ray distances, especially for orthographic views.
    return ray.intersectObject(surface.mesh, true).find(result => {
      if (!(result.object instanceof THREE.Mesh)) return false;
      let node: THREE.Object3D | null = result.object;
      while (node) { if (!node.visible) return false; node = node.parent; }
      const materials = result.object.material, material = Array.isArray(materials) ? materials[result.face?.materialIndex ?? -1] : materials;
      if (!material?.visible) return false;
      const p = result.point.clone().project(camera);
      return [p.x, p.y, p.z].every(Number.isFinite) && p.z >= -1 && p.z <= 1;
    });
  }
  const chosen = hit(selected); if (!chosen) return null;
  const material = (chosen.object as THREE.Mesh).material;
  const chosenMaterial = Array.isArray(material) ? material[chosen.face?.materialIndex ?? -1] : material;
  // Until alpha-aware picking is connected, do not put a pin on an invisible texture hole
  // or pick through a potentially transparent foreground. Surface choice stays explicit.
  if (!chosenMaterial || chosenMaterial.transparent || chosenMaterial.alphaTest > 0 || chosenMaterial.opacity < 1) return null;
  for (const [id, surface] of resident) {
    if (id === target.assetId) continue;
    const occluder = hit(surface);
    // Numerically indistinguishable opaque surfaces have no safe front winner.
    const tolerance = 1e-9 * Math.max(1, chosen.distance, occluder?.distance ?? 0);
    if (occluder && occluder.distance <= chosen.distance + tolerance) return null;
  }
  const p = selected.asset.worldToLocal(chosen.point.clone());
  return [p.x, p.y, p.z].every(Number.isFinite) ? [p.x || 0, p.y || 0, p.z || 0] : null;
}

/** Creation only: the user's visible surface supplies its exact model identity. */
export function pickResidentCreation(display: SyntheticDisplay, targets: readonly PinSurfaceTarget[],
  resident: ReadonlyMap<string, ResidentSurface>, camera: THREE.Camera, ndc: THREE.Vector2) {
  const hits = targets.flatMap(target => {
    const position = pickResidentSurface(display, target, resident, camera, ndc);
    return position ? [{ target, position }] : [];
  });
  return hits.length === 1 ? hits[0]! : null;
}
