import { Vector3 } from 'three';
import type { SyntheticProject } from './fixture';
import { modelVersion, syntheticVersions } from './modelFixture';
import { placementMatrix, pointInProject, type V3 } from './viewportModel';

/** Verified read projections only. Null means explicit placement is required,
 * never a fallback origin or an inferred relationship/surface. */
export function pinPositionInParent(project: SyntheticProject, captionId: string, targetId: string): V3 | null {
  const { resources } = project, field = resources.captions[captionId]?.anchor;
  if (field?.kind !== 'value') return null;
  const anchor = field.value, versions = project.modelVersions ?? syntheticVersions;
  const version = (id: string) => {
    const p = resources.assets[id]?.projection;
    return p?.kind === 'value' ? modelVersion(id, p.value.bindingId, versions) : undefined;
  };
  const target = version(targetId); if (!target) return null;
  try {
    let position: V3;
    if (anchor.kind === 'project') {
      if (anchor.projectFrameId !== resources.projectFrameId) return null;
      position = anchor.positionProject;
    } else {
      const source = version(anchor.assetId);
      if (!source || source.projection.assetFrameId !== anchor.assetFrameId) return null;
      position = pointInProject(anchor.positionAsset, source.closure.binding.assetToProject);
    }
    const matrix = placementMatrix(target.closure.binding.assetToProject), determinant = matrix.determinant();
    if (!Number.isFinite(determinant) || determinant <= 0) return null;
    const p = new Vector3(...position).applyMatrix4(matrix.invert()).toArray();
    return p.every(Number.isFinite) ? p.map(n => n || 0) as [number, number, number] : null;
  } catch { return null; }
}
