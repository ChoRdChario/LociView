import { Vector3 } from 'three';
import { resolveScene } from '../scene/resolve';
import type { ProjectDisplay } from './displayTypes';

import { placementMatrix, pointInProject, type V3 } from './viewportModel';

/** Verified read projections only. Null means explicit placement is required,
 * never a fallback origin or an inferred relationship/surface. */
export function pinPositionInParent(project: ProjectDisplay, captionId: string, targetId: string, sceneId?: string,
  membership?: (assetId: string) => 'included' | 'absent' | undefined): V3 | null {
  const { resources } = project;
  const scene = sceneId === undefined ? undefined : resolveScene(project.state, resources, sceneId);
  if (scene && scene.kind !== 'ready') return null;
  const field = scene ? scene.composition.captions.find(caption => caption.captionId === captionId)?.anchor : resources.captions[captionId]?.anchor;
  if (field?.kind !== 'value') return null;
  const anchor = field.value, versions = project.modelVersions ?? [];
  if (anchor.kind === 'unplaced') return null;
  const version = (id: string, source = false) => {
    const asset = resources.assets[id];
    if (asset?.lifecycle.kind !== 'value' || asset.lifecycle.value.state !== 'active') return;
    let projection = asset.projection.kind === 'value' ? asset.projection.value : undefined;
    if (scene) {
      const selected = scene.composition.assets.find(member => member.assetId === id);
      const relation = membership?.(id);
      if (selected && (!membership || relation === 'included')) projection = selected.projection;
      else if (selected || !source || relation !== 'absent') return;
    }
    return projection && versions.find(v => v.assetId === id && v.projection.bindingId === projection.bindingId);
  };
  const target = version(targetId); if (!target) return null;
  try {
    let position: V3;
    if (anchor.kind === 'project') {
      if (anchor.projectFrameId !== resources.projectFrameId) return null;
      position = anchor.positionProject;
    } else {
      const source = version(anchor.assetId, true);
      if (!source || source.projection.assetFrameId !== anchor.assetFrameId) return null;
      position = pointInProject(anchor.positionAsset, source.closure.binding.assetToProject);
    }
    const matrix = placementMatrix(target.closure.binding.assetToProject), determinant = matrix.determinant();
    if (!Number.isFinite(determinant) || determinant <= 0) return null;
    const p = new Vector3(...position).applyMatrix4(matrix.invert()).toArray();
    return p.every(Number.isFinite) ? p.map(n => n || 0) as [number, number, number] : null;
  } catch { return null; }
}
