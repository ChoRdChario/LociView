import { describe, expect, it } from 'vitest';
import {
  NativeCaptionMediaSelectionV1,
  placeNativeCaptionOverlayV1,
  resolveNativeCaptionOverlayV1,
} from '../../src/nativeGs/captionOverlay';
import { NATIVE_DEFAULT_DISPLAY_SET_ID } from '../../src/nativeGs/schema';
import {
  makeNativeDraft,
  NATIVE_TEST_IDS,
  snapshotFromDraft,
  testNativeId,
} from './nativeTestProject';

function snapshotWithCaption() {
  const snapshot = snapshotFromDraft(makeNativeDraft().draft);
  const mediaId = testNativeId('med', 1);
  return {
    ...snapshot,
    captions: [{
      id: NATIVE_TEST_IDS.caption,
      title: 'Inspection',
      body: 'Linked to the selected GS Asset.',
      color: '#22c55e',
      attachmentMediaIds: [mediaId],
      anchor: {
        kind: 'asset' as const,
        assetId: NATIVE_TEST_IDS.gsAsset,
        assetFrameId: NATIVE_TEST_IDS.gsFrame,
        positionAsset: [0.25, 0.5, 0.75] as const,
        authoredAssetRevisionId: NATIVE_TEST_IDS.gsRevision,
        authoredAnchorCompatibilityId: NATIVE_TEST_IDS.gsClass,
        hitEvidence: { method: 'manual' as const },
      },
    }],
    mediaResources: [{
      id: mediaId,
      label: 'Inspection photo',
      kind: 'image' as const,
      blob: {
        algorithm: 'sha256' as const,
        digest: 'b'.repeat(64),
        byteLength: 8,
        mediaType: 'image/png',
      },
    }],
  };
}

describe('native Caption selection overlay', () => {
  it('resolves the selected placed Caption and its existing image metadata', () => {
    const snapshot = snapshotWithCaption();
    expect(resolveNativeCaptionOverlayV1(snapshot, NATIVE_TEST_IDS.caption, NATIVE_DEFAULT_DISPLAY_SET_ID)).toEqual({
      captionId: NATIVE_TEST_IDS.caption,
      title: 'Inspection',
      body: 'Linked to the selected GS Asset.',
      color: '#22c55e',
      media: [{ id: testNativeId('med', 1), label: 'Inspection photo', mediaType: 'image/png' }],
    });
  });

  it('does not invent an overlay for an unplaced, inactive-set or hidden Caption', () => {
    const snapshot = snapshotWithCaption();
    expect(resolveNativeCaptionOverlayV1(
      { ...snapshot, captions: [{ ...snapshot.captions[0]!, anchor: null }] },
      NATIVE_TEST_IDS.caption,
      NATIVE_DEFAULT_DISPLAY_SET_ID,
    )).toBeNull();
    expect(resolveNativeCaptionOverlayV1(
      { ...snapshot, captions: [{ ...snapshot.captions[0]!, displaySetId: testNativeId('set', 2) }] },
      NATIVE_TEST_IDS.caption,
      NATIVE_DEFAULT_DISPLAY_SET_ID,
    )).toBeNull();
    expect(resolveNativeCaptionOverlayV1(
      { ...snapshot, presentation: { ...snapshot.presentation, hiddenAssetIds: [NATIVE_TEST_IDS.gsAsset] } },
      NATIVE_TEST_IDS.caption,
      NATIVE_DEFAULT_DISPLAY_SET_ID,
    )).toBeNull();
  });

  it('flips and clamps the card inside the current stage', () => {
    const centered = placeNativeCaptionOverlayV1(800, 600, 120, { xCss: 300, yCss: 300, visible: true });
    expect(centered).toMatchObject({ leftCss: 314, topCss: 166, widthCss: 280, lineEndXCss: 314 });

    const nearTopRight = placeNativeCaptionOverlayV1(320, 240, 100, { xCss: 305, yCss: 12, visible: true });
    expect(nearTopRight).toMatchObject({ leftCss: 11, topCss: 26, widthCss: 280, lineEndXCss: 291 });
    expect(nearTopRight!.topCss + 100).toBeLessThanOrEqual(232);
    expect(placeNativeCaptionOverlayV1(
      320,
      240,
      100,
      { xCss: 160, yCss: 120, visible: true },
      { leftCss: 999, topCss: -20 },
    )).toMatchObject({ leftCss: 32, topCss: 8, widthCss: 280 });
    expect(placeNativeCaptionOverlayV1(320, 240, 100, { xCss: 20, yCss: 20, visible: false })).toBeNull();
    expect(placeNativeCaptionOverlayV1(320, 240, 100, { xCss: -8, yCss: 120, visible: true })).toMatchObject({
      leftCss: 8,
      widthCss: 280,
    });
    expect(placeNativeCaptionOverlayV1(320, 240, 100, { xCss: -11, yCss: 120, visible: true })).toBeNull();
    expect(placeNativeCaptionOverlayV1(320, 240, 100, { xCss: 160, yCss: 251, visible: true })).toBeNull();

    expect(placeNativeCaptionOverlayV1(
      800,
      600,
      120,
      { xCss: 300, yCss: 300, visible: true },
      { leftCss: 100, topCss: 80 },
      { widthCss: 420, heightCss: 260 },
    )).toMatchObject({ leftCss: 100, topCss: 80, widthCss: 420, heightCss: 260 });
    expect(placeNativeCaptionOverlayV1(
      320,
      240,
      100,
      { xCss: 160, yCss: 120, visible: true },
      { leftCss: 100, topCss: 100 },
      { widthCss: 20, heightCss: 20 },
    )).toMatchObject({ widthCss: 180, heightCss: 96 });
    expect(placeNativeCaptionOverlayV1(
      320,
      240,
      100,
      { xCss: 160, yCss: 120, visible: true },
      { leftCss: 100, topCss: 100 },
      { widthCss: 999, heightCss: 999 },
    )).toMatchObject({ leftCss: 8, topCss: 8, widthCss: 304, heightCss: 224 });
  });

  it('rejects an asynchronous media result from a former selection', () => {
    const selection = new NativeCaptionMediaSelectionV1();
    const first = selection.select('caption-a\u0000media-a');
    expect(selection.accepts(first)).toBe(true);
    const second = selection.select('caption-b\u0000media-b');
    expect(selection.accepts(first)).toBe(false);
    expect(selection.accepts(second)).toBe(true);
    selection.invalidate();
    expect(selection.accepts(second)).toBe(false);
  });
});
