import { describe, expect, it } from 'vitest';
import { createNativePlacedCaptionV1 } from '../../src/nativeGs/captionPlacement';
import { resolveNativeCaptionOverlayV1 } from '../../src/nativeGs/captionOverlay';
import {
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  nativeCaptionDisplaySetIdV1,
  type NativeCaptionV1,
} from '../../src/nativeGs/schema';
import {
  makeNativeDraft,
  NATIVE_TEST_IDS,
  snapshotFromDraft,
  testNativeId,
} from './nativeTestProject';

const ACTIVE_SET_ID = testNativeId('set', 2);

function anchor(positionAsset: readonly [number, number, number] = [0.25, 0.5, 0.75]) {
  return {
    kind: 'asset' as const,
    assetId: NATIVE_TEST_IDS.gsAsset,
    assetFrameId: NATIVE_TEST_IDS.gsFrame,
    positionAsset,
    authoredAssetRevisionId: NATIVE_TEST_IDS.gsRevision,
    authoredAnchorCompatibilityId: NATIVE_TEST_IDS.gsClass,
    hitEvidence: { method: 'manual' as const },
  };
}

describe('native Caption placement', () => {
  it('puts a new Caption in the active non-default DisplaySet before save', () => {
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
    const caption = createNativePlacedCaptionV1({
      existing: null,
      captionId: NATIVE_TEST_IDS.caption,
      activeDisplaySetId: ACTIVE_SET_ID,
      anchor: anchor(),
    });
    const working = {
      ...snapshot,
      displaySets: [
        { id: NATIVE_DEFAULT_DISPLAY_SET_ID, name: 'Default', orderKey: '000000', defaultSavedViewId: null },
        { id: ACTIVE_SET_ID, name: 'Inspection', orderKey: '000001', defaultSavedViewId: null },
      ],
      presentation: { ...snapshot.presentation, activeDisplaySetId: ACTIVE_SET_ID },
      captions: [caption],
    };

    expect(caption.displaySetId).toBe(ACTIVE_SET_ID);
    expect(resolveNativeCaptionOverlayV1(working, caption.id, ACTIVE_SET_ID)).not.toBeNull();
    expect(resolveNativeCaptionOverlayV1(working, caption.id, NATIVE_DEFAULT_DISPLAY_SET_ID)).toBeNull();
  });

  it('preserves the original DisplaySet when an existing Caption is repositioned', () => {
    const existing: NativeCaptionV1 = {
      id: NATIVE_TEST_IDS.caption,
      title: 'Existing',
      body: 'Keep this Caption in its original set.',
      displaySetId: ACTIVE_SET_ID,
      anchor: anchor(),
    };
    const repositioned = createNativePlacedCaptionV1({
      existing,
      captionId: testNativeId('cap', 99),
      activeDisplaySetId: testNativeId('set', 3),
      anchor: anchor([1, 2, 3]),
    });

    expect(repositioned).toMatchObject({
      id: existing.id,
      title: existing.title,
      displaySetId: ACTIVE_SET_ID,
      ownerAssetId: NATIVE_TEST_IDS.gsAsset,
      anchor: { positionAsset: [1, 2, 3] },
    });

    const olderDefaultCaption = { ...existing, displaySetId: undefined };
    expect(nativeCaptionDisplaySetIdV1(createNativePlacedCaptionV1({
      existing: olderDefaultCaption,
      captionId: testNativeId('cap', 100),
      activeDisplaySetId: ACTIVE_SET_ID,
      anchor: anchor([3, 2, 1]),
    }))).toBe(NATIVE_DEFAULT_DISPLAY_SET_ID);
  });
});
