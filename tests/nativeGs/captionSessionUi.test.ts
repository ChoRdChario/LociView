import { describe, expect, it } from 'vitest';
import { NativeCaptionSessionUiV1 } from '../../src/nativeGs/captionSessionUi';
import {
  arrangeNativeCaptionWindowsV1,
  nextNativeCaptionWindowSizeV1,
  resolveNativeCaptionWindowV1,
} from '../../src/nativeGs/captionWindows';
import { NATIVE_DEFAULT_DISPLAY_SET_ID } from '../../src/nativeGs/schema';
import { makeNativeDraft, NATIVE_TEST_IDS, snapshotFromDraft, testNativeId } from './nativeTestProject';

function windowSnapshot() {
  const snapshot = snapshotFromDraft(makeNativeDraft().draft);
  const secondCaptionId = testNativeId('cap', 2);
  const otherSetId = testNativeId('set', 2);
  return {
    snapshot: {
      ...snapshot,
      captions: [
        {
          id: NATIVE_TEST_IDS.caption,
          title: 'A', body: 'first', color: '#112233',
          anchor: {
            kind: 'asset' as const,
            assetId: NATIVE_TEST_IDS.gsAsset,
            assetFrameId: NATIVE_TEST_IDS.gsFrame,
            positionAsset: [0, 0, 0] as const,
            authoredAssetRevisionId: NATIVE_TEST_IDS.gsRevision,
            authoredAnchorCompatibilityId: NATIVE_TEST_IDS.gsClass,
            hitEvidence: { method: 'manual' as const },
          },
        },
        {
          id: secondCaptionId,
          title: 'B', body: 'second', color: '#445566', anchor: null,
        },
      ],
      displaySets: [
        { id: NATIVE_DEFAULT_DISPLAY_SET_ID, name: 'Default', orderKey: '000000', defaultSavedViewId: null },
        { id: otherSetId, name: 'Other', orderKey: otherSetId.slice(4), defaultSavedViewId: null },
      ],
    },
    secondCaptionId,
    otherSetId,
  };
}

describe('native Caption session UI state', () => {
  it('keeps authoring colors per DisplaySet without deriving them from selection or filters', () => {
    const state = new NativeCaptionSessionUiV1();
    const otherSetId = testNativeId('set', 2);
    expect(state.authoringColor(NATIVE_DEFAULT_DISPLAY_SET_ID)).toBe('#eab308');
    state.setAuthoringColor(NATIVE_DEFAULT_DISPLAY_SET_ID, '#AABBCC');
    expect(state.authoringColor(NATIVE_DEFAULT_DISPLAY_SET_ID)).toBe('#aabbcc');
    expect(state.authoringColor(otherSetId)).toBe('#eab308');
    expect(() => state.setAuthoringColor(otherSetId, 'yellow')).toThrow(/6桁の16進数/);
  });

  it('retains exact comparison IDs, never duplicates the selected follower, and preserves phone intent', () => {
    const state = new NativeCaptionSessionUiV1();
    const { secondCaptionId, otherSetId } = windowSnapshot();
    state.setRetained(NATIVE_DEFAULT_DISPLAY_SET_ID, NATIVE_TEST_IDS.caption, true);
    expect(state.openCaptionIds(NATIVE_DEFAULT_DISPLAY_SET_ID, secondCaptionId)).toEqual([
      NATIVE_TEST_IDS.caption, secondCaptionId,
    ]);
    expect(state.openCaptionIds(NATIVE_DEFAULT_DISPLAY_SET_ID, NATIVE_TEST_IDS.caption)).toEqual([
      NATIVE_TEST_IDS.caption,
    ]);
    state.setComparisonMode(NATIVE_DEFAULT_DISPLAY_SET_ID, 'single');
    expect(state.openCaptionIds(NATIVE_DEFAULT_DISPLAY_SET_ID, secondCaptionId)).toEqual([secondCaptionId]);
    expect(state.retainedCount(NATIVE_DEFAULT_DISPLAY_SET_ID)).toBe(1);
    state.setComparisonMode(NATIVE_DEFAULT_DISPLAY_SET_ID, 'all');
    expect(state.openCaptionIds(NATIVE_DEFAULT_DISPLAY_SET_ID, secondCaptionId)).toHaveLength(2);
    expect(state.openCaptionIds(otherSetId, null)).toEqual([]);
    expect(state.retainedCount(NATIVE_DEFAULT_DISPLAY_SET_ID)).toBe(1);
  });

  it('reconciles deleted or foreign-set windows without discarding valid session state', () => {
    const state = new NativeCaptionSessionUiV1();
    const { snapshot, secondCaptionId } = windowSnapshot();
    state.setRetained(NATIVE_DEFAULT_DISPLAY_SET_ID, NATIVE_TEST_IDS.caption, true);
    state.setRetained(NATIVE_DEFAULT_DISPLAY_SET_ID, secondCaptionId, true);
    state.setPosition(secondCaptionId, { leftCss: 10, topCss: 20 });
    state.setResolvedPlacement(secondCaptionId, {
      leftCss: 12, topCss: 22, widthCss: 280, heightCss: 180,
    });
    state.reconcile({ ...snapshot, captions: snapshot.captions.slice(0, 1) });
    expect(state.retainedCount(NATIVE_DEFAULT_DISPLAY_SET_ID)).toBe(1);
    expect(state.position(secondCaptionId)).toBeNull();
    expect(state.resolvedPlacement(secondCaptionId)).toBeNull();
    expect(state.openCaptionIds(NATIVE_DEFAULT_DISPLAY_SET_ID, NATIVE_TEST_IDS.caption)).toEqual([
      NATIVE_TEST_IDS.caption,
    ]);
  });

  it('keeps a resolved temporary placement while a retained window is suspended', () => {
    const state = new NativeCaptionSessionUiV1();
    state.setRetained(NATIVE_DEFAULT_DISPLAY_SET_ID, NATIVE_TEST_IDS.caption, true);
    state.setResolvedPlacement(NATIVE_TEST_IDS.caption, {
      leftCss: 24, topCss: 36, widthCss: 280, heightCss: 180,
    });
    state.setComparisonMode(NATIVE_DEFAULT_DISPLAY_SET_ID, 'single');
    expect(state.resolvedPlacement(NATIVE_TEST_IDS.caption)).toEqual({
      leftCss: 24, topCss: 36, widthCss: 280, heightCss: 180,
    });
  });
});

describe('native Caption comparison content', () => {
  it('offers a tap/click size cycle in addition to drag resizing', () => {
    expect(nextNativeCaptionWindowSizeV1(null)).toEqual({ widthCss: 360, heightCss: 250 });
    expect(nextNativeCaptionWindowSizeV1({ widthCss: 360, heightCss: 250 }))
      .toEqual({ widthCss: 220, heightCss: 128 });
    expect(nextNativeCaptionWindowSizeV1({ widthCss: 220, heightCss: 128 }))
      .toEqual({ widthCss: 280, heightCss: 180 });
  });

  it('arranges fitting cards without overlap and declines an impossible narrow stack', () => {
    const placements = arrangeNativeCaptionWindowsV1(600, 320, 3);
    expect(placements).not.toBeNull();
    expect(placements).toHaveLength(3);
    if (placements === null) throw new Error('expected a fitting arrangement');
    for (let left = 0; left < placements.length; left += 1) {
      for (let right = left + 1; right < placements.length; right += 1) {
        const a = placements[left]!;
        const b = placements[right]!;
        expect(
          a.leftCss + a.widthCss <= b.leftCss || b.leftCss + b.widthCss <= a.leftCss ||
          a.topCss + a.heightCss <= b.topCss || b.topCss + b.heightCss <= a.topCss,
        ).toBe(true);
      }
    }
    expect(arrangeNativeCaptionWindowsV1(280, 280, 3)).toBeNull();
  });

  it('keeps content available when a pin is unplaced or its Asset is hidden', () => {
    const { snapshot, secondCaptionId } = windowSnapshot();
    expect(resolveNativeCaptionWindowV1(snapshot, secondCaptionId, NATIVE_DEFAULT_DISPLAY_SET_ID))
      .toMatchObject({ captionId: secondCaptionId, pinAvailability: 'unplaced' });
    expect(resolveNativeCaptionWindowV1({
      ...snapshot,
      presentation: { ...snapshot.presentation, hiddenAssetIds: [NATIVE_TEST_IDS.gsAsset] },
    }, NATIVE_TEST_IDS.caption, NATIVE_DEFAULT_DISPLAY_SET_ID))
      .toMatchObject({ captionId: NATIVE_TEST_IDS.caption, pinAvailability: 'asset-hidden' });
  });
});
