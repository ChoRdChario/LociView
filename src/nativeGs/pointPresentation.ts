export const NATIVE_POINT_DIAMETER_MIN_CSS_PX = 1;
export const NATIVE_POINT_DIAMETER_DEFAULT_CSS_PX = 3;
export const NATIVE_POINT_DIAMETER_MAX_CSS_PX = 20;
export const NATIVE_POINT_PICK_RADIUS_CSS_PX = 6;

export interface NativeProjectedPointPick {
  readonly representationId: string;
  readonly pointIndex: number;
  readonly xCss: number;
  readonly yCss: number;
  readonly depth: number;
  readonly world: readonly [number, number, number];
}

export function clampNativePointDiameterCssPixels(value: number): number {
  if (!Number.isFinite(value)) return NATIVE_POINT_DIAMETER_DEFAULT_CSS_PX;
  return Math.min(NATIVE_POINT_DIAMETER_MAX_CSS_PX, Math.max(NATIVE_POINT_DIAMETER_MIN_CSS_PX, value));
}

/** Stable screen-space selection for the bounded ordinary-point path. */
export function selectNativeProjectedPoint(
  candidates: Iterable<NativeProjectedPointPick>,
  pointer: Readonly<{ xCss: number; yCss: number }>,
  diameterCssPixels: number,
): NativeProjectedPointPick | null {
  const radius = Math.max(NATIVE_POINT_PICK_RADIUS_CSS_PX, clampNativePointDiameterCssPixels(diameterCssPixels) / 2);
  const radiusSquared = radius * radius;
  let selected: { readonly candidate: NativeProjectedPointPick; readonly distanceSquared: number } | null = null;
  for (const candidate of candidates) {
    const distanceSquared = (candidate.xCss - pointer.xCss) ** 2 + (candidate.yCss - pointer.yCss) ** 2;
    if (distanceSquared > radiusSquared) continue;
    if (
      selected === null || distanceSquared < selected.distanceSquared ||
      (distanceSquared === selected.distanceSquared && (
        candidate.depth < selected.candidate.depth ||
        (candidate.depth === selected.candidate.depth && (
          candidate.representationId < selected.candidate.representationId ||
          (candidate.representationId === selected.candidate.representationId && candidate.pointIndex < selected.candidate.pointIndex)
        ))
      ))
    ) selected = { candidate, distanceSquared };
  }
  return selected?.candidate ?? null;
}
