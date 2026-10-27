import type { PointVisibility } from './validationPointCoverage';
import * as THREE from 'three';
import { pointViewportSample, type PointViewport } from '../domain/pointPresentation';
import { residentMeshFragment, type PinSurfaceTarget, type ResidentSurface, type PickCoverage } from './viewportPicking';
import type { EditableDisplay, V3 } from './viewportModel';

interface Sample { x: number; y: number; ndc: THREE.Vector2 }
interface Point { owner: string; surface: ResidentSurface; index: number; x: number; y: number; depth: number; world: THREE.Vector3 }
/** Reuses the current frame's owned centres; no source IDs or depths are read from GPU colors. */
export function pickPointAwareCreation(display: EditableDisplay, targets: readonly PinSurfaceTarget[], resident: ReadonlyMap<string, ResidentSurface>,
  camera: THREE.Camera, view: PointViewport, pointerX: number, pointerY: number, coverageAt: (ndc: THREE.Vector2) => PickCoverage | undefined, depthBits = 0, visibility?: PointVisibility): { target: PinSurfaceTarget; position: V3; point?: { pointIndex: number } } | null {
  const pixel = pointViewportSample(view, pointerX, pointerY), cw = view.cssWidth, ch = view.cssHeight;
  const sample = (x: number, y: number): Sample => ({ x, y, ndc: new THREE.Vector2(x * 2 / cw - 1, 1 - y * 2 / ch) });
  const clicked = sample(pixel.xCss, pixel.yCss), points: Point[] = [];
  camera.updateMatrixWorld(true);
  for (const [owner, surface] of resident) {
    const p = surface.points; if (!p || p.issue || !surface.asset.visible || !p.object.visible) continue;
    surface.asset.updateMatrixWorld(true);
    if (!Number.isSafeInteger(depthBits) || depthBits < 16 || depthBits > 32) return null;
    const frame = p.project(camera,depthBits);
    for (let index = 0; index < p.positions.length / 3; index++) {
      if (!frame.eligible[index]) continue;
      const world = new THREE.Vector3().fromArray(p.positions, index * 3).applyMatrix4(p.object.matrixWorld);
      points.push({ owner, surface, index, world, x: frame.centersCss[index*2]!, y: frame.centersCss[index*2+1]!, depth: frame.depths[index*3+2]! });
    }
  }
  const radiusError = (p: Point, s: Sample) => 16 * 2**-23 * Math.max(1,Math.abs(p.x),Math.abs(p.y),Math.abs(s.x),Math.abs(s.y),view.cssWidth,view.cssHeight);
  const edgeUnknown = (p: Point,s: Sample) => Math.abs(Math.hypot(p.x-s.x,p.y-s.y)-Math.fround(p.surface.points!.diameter)/2) <= radiusError(p,s);
  const covers = (p: Point, s: Sample) => Math.hypot(p.x - s.x, p.y - s.y) <= Math.fround(p.surface.points!.diameter) / 2;
  // Conservative window-depth conversion envelope at the actual framebuffer precision.
  const depthTolerance = 4 / (2**depthBits-1) + 4 * 2**-23;
  function fragments(s: Sample) {
    const coverage = coverageAt(s.ndc), meshes: { owner: string; depth: number; position: THREE.Vector3; unknown: boolean }[] = [];
    for (const [owner, surface] of resident) {
      if (surface.points) continue;
      const hit = residentMeshFragment(surface, camera, s.ndc, coverage);
      if (hit) meshes.push({ owner, depth: hit.result.point.clone().project(camera).z, position: hit.result.point, unknown: hit.decision !== 'covered' });
    }
    return { meshes, points: points.filter(p => covers(p, s)), uncertain: points.filter(p=>edgeUnknown(p,s)) };
  }
  const current = fragments(clicked); if (current.uncertain.length) return null;
  const meshCoverage = visibility?.mesh(clicked.ndc); if (meshCoverage === 'unknown') return null;
  const exactTarget = (owner: string) => {
    const target = targets.find(t => t.assetId === owner), model = display.models.find(m => m.binding.assetId === owner);
    if (!target || !model || target.token !== display.token || target.sceneId !== display.sceneId || model.binding.id !== target.bindingId || model.assetFrame.id !== target.assetFrameId || model.revision.id !== target.revisionId || model.representation.id !== target.representationId || model.representation.variantFamilyId !== target.familyId || !model.revision.anchorCompatibilityClasses.some(c => c.id === target.compatibilityId && c.targetVariantFamilyIds.includes(target.familyId))) return null;
    return target;
  };
  const pointOrder = (a: Point, b: Point) => a.depth - b.depth || a.surface.points!.representationId.localeCompare(b.surface.points!.representationId) || a.index - b.index;
  const candidate = current.points.sort(pointOrder)[0], mesh = current.meshes.sort((a,b) => a.depth - b.depth)[0];
  function pointHit(p: Point) {
    const target = targets.length === 1 ? exactTarget(p.owner) : null; if (!target) return null;
    if (current.points.some(other => other.owner !== p.owner && Math.abs(other.depth - p.depth) <= depthTolerance)) return null;
    const position = Array.from(p.surface.points!.positions.subarray(p.index*3,p.index*3+3)) as unknown as V3; // Exact source profile has identity representationToAsset.
    return { target, position, point: { pointIndex: p.index } };
  }
  if (candidate && current.points.some(other => other !== candidate && Math.abs(other.depth-candidate.depth) <= depthTolerance && other.depth !== candidate.depth)) return null;
  if(candidate && visibility){
    const seen=visibility.point(candidate.surface,candidate.index,clicked.ndc); if(seen==='unknown')return null;
    if(seen==='visible')return pointHit(candidate);
  } else if(!visibility) {
  if (mesh && (!candidate || mesh.depth <= candidate.depth + depthTolerance)) {
    if (mesh.unknown || candidate && Math.abs(mesh.depth - candidate.depth) <= depthTolerance || current.meshes.some(m => m !== mesh && Math.abs(m.depth - mesh.depth) <= depthTolerance)) return null;
    const target = exactTarget(mesh.owner), surface = resident.get(mesh.owner)!;
    if (!target) return null; const local = surface.asset.worldToLocal(mesh.position.clone());
    return { target, position: local.toArray().map(n => n || 0) as unknown as V3 };
  }
    if(candidate)return pointHit(candidate);
  }
  if(meshCoverage === 'covered') {
    if(!mesh || mesh.unknown || current.meshes.some(m=>m!==mesh && Math.abs(m.depth-mesh.depth)<=depthTolerance))return null;
    const target=exactTarget(mesh.owner); if(!target)return null;
    const local=resident.get(mesh.owner)!.asset.worldToLocal(mesh.position.clone()); return {target,position:local.toArray().map(n=>n||0) as unknown as V3};
  }
  // Proximity never skips a Mesh source fragment at the clicked canonical pixel.
  if (visibility ? meshCoverage !== 'clear' : current.meshes.length>0) return null;
  // Only the explicitly chosen Asset may use proximity; multi-target creation stays ambiguous.
  if (targets.length !== 1) return null;
  const nearby = points.filter(p => p.owner === targets[0]!.assetId && Math.hypot(p.x - clicked.x, p.y - clicked.y) <= 6)
    .sort((a,b) => Math.hypot(a.x-clicked.x,a.y-clicked.y) - Math.hypot(b.x-clicked.x,b.y-clicked.y) || pointOrder(a,b));
  for (const p of nearby) {
    const radius = p.surface.points!.diameter / 2;
    const minI = Math.max(0, Math.ceil((p.x-radius) * pixel.width / cw - .5)), maxI = Math.min(pixel.width-1, Math.floor((p.x+radius) * pixel.width / cw - .5));
    const minJ = Math.max(0, Math.ceil((p.y-radius) * pixel.height / ch - .5)), maxJ = Math.min(pixel.height-1, Math.floor((p.y+radius) * pixel.height / ch - .5));
    let visible = false, unknown = false;
    for (let j = minJ; j <= maxJ && !visible; j++) for (let i = minI; i <= maxI; i++) {
      const s = sample((i+.5)*cw/pixel.width, (j+.5)*ch/pixel.height); if (!covers(p,s)) continue;
      const f = fragments(s); if (f.uncertain.length) { unknown=true; continue; }
      if (f.points.some(other=>other!==p && Math.abs(other.depth-p.depth)<=depthTolerance && (other.owner!==p.owner || other.depth!==p.depth))) { unknown=true; continue; }
      if (!visibility && (f.meshes.some(m => m.unknown && m.depth <= p.depth + depthTolerance || Math.abs(m.depth-p.depth) <= depthTolerance) ||
        f.points.some(other=>other!==p && Math.abs(other.depth-p.depth)<=depthTolerance && (other.owner!==p.owner || other.depth!==p.depth)))) { unknown=true; continue; }
      if (!visibility && f.meshes.some(m => m.depth < p.depth-depthTolerance) || f.points.some(other=>other!==p && other.depth < p.depth-depthTolerance)) continue;
      if(visibility){const seen=visibility.point(p.surface,p.index,s.ndc);if(seen==='unknown'){unknown=true;continue;}if(seen==='hidden')continue;}
      visible = true; break;
    }
    if (visible) return pointHit(p);
    if (unknown) return null;
  }
  return null;
}
