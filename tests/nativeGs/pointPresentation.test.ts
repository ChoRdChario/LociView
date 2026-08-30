import { describe, expect, it } from 'vitest';
import {
  clampNativePointDiameterCssPixels,
  selectNativeProjectedPoint,
  type NativeProjectedPointPick,
} from '../../src/nativeGs/pointPresentation';

describe('native ordinary-point presentation', () => {
  it('clamps the live diameter and selects deterministically inside the CSS footprint', () => {
    expect(clampNativePointDiameterCssPixels(Number.NaN)).toBe(3);
    expect(clampNativePointDiameterCssPixels(-10)).toBe(1);
    expect(clampNativePointDiameterCssPixels(50)).toBe(20);

    const candidates: NativeProjectedPointPick[] = [
      { representationId: 'rep_b', pointIndex: 0, xCss: 104, yCss: 100, depth: 0.2, world: [2, 0, 0] },
      { representationId: 'rep_a', pointIndex: 2, xCss: 104, yCss: 100, depth: 0.1, world: [1, 0, 0] },
      { representationId: 'rep_a', pointIndex: 1, xCss: 120, yCss: 100, depth: -1, world: [0, 0, 0] },
    ];
    expect(selectNativeProjectedPoint(candidates, { xCss: 100, yCss: 100 }, 3)).toEqual(candidates[1]);
    expect(selectNativeProjectedPoint(candidates, { xCss: 0, yCss: 0 }, 3)).toBeNull();
  });
});
