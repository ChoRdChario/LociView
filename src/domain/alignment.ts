/** Renderer-neutral positive-uniform placement math; no model or storage access. */
export type AlignmentPoint = readonly [number, number, number];
export interface AlignmentPlacement { readonly translation: AlignmentPoint; readonly rotationXYZW: readonly [number, number, number, number]; readonly uniformScale: number }
export interface AlignmentBounds { readonly min: AlignmentPoint; readonly max: AlignmentPoint }
export function alignmentVector(point: AlignmentPoint, placement: AlignmentPlacement): AlignmentPoint {
  const [qx, qy, qz, qw] = placement.rotationXYZW, x = point[0] * placement.uniformScale, y = point[1] * placement.uniformScale, z = point[2] * placement.uniformScale;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}
export function boundsCentre(bounds: AlignmentBounds): AlignmentPoint { return bounds.min.map((v, i) => v / 2 + bounds.max[i]! / 2) as unknown as AlignmentPoint; }
export function placementAroundPivot(before: AlignmentPlacement, next: AlignmentPlacement, pivot: AlignmentPoint): AlignmentPlacement {
  const old = alignmentVector(pivot, before), current = alignmentVector(pivot, next);
  const translation = next.translation.map((v, i) => v + old[i]! - current[i]!) as unknown as AlignmentPoint;
  if (!translation.every(Number.isFinite)) throw Error('配置の値が大きすぎます。'); return { ...next, translation };
}
export function fitAlignmentBounds(bounds: AlignmentBounds, placement: AlignmentPlacement, referenceBounds: AlignmentBounds, reference: AlignmentPlacement): AlignmentPlacement {
  const diagonal = (b: AlignmentBounds, p: AlignmentPlacement) => {
    const points: AlignmentPoint[] = [];
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) points.push(alignmentVector([x, y, z], p));
    return Math.hypot(...[0, 1, 2].map(i => Math.max(...points.map(v => v[i]!)) - Math.min(...points.map(v => v[i]!))));
  };
  const from = diagonal(bounds, placement), to = diagonal(referenceBounds, reference), scale = placement.uniformScale * to / from;
  if (!Number.isFinite(scale) || scale <= 0 || from <= 0 || to <= 0) throw Error('広がりのあるモデルを基準にしてください。');
  const referenceCentre = alignmentVector(boundsCentre(referenceBounds), reference);
  const next = { ...placement, uniformScale: scale }, sourceCentre = alignmentVector(boundsCentre(bounds), next);
  const translation = sourceCentre.map((v, i) => reference.translation[i]! + referenceCentre[i]! - v) as unknown as AlignmentPoint;
  if (!translation.every(Number.isFinite)) throw Error('配置の値が大きすぎます。'); return { ...next, translation };
}
