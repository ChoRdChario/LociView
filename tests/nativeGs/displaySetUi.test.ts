import { describe, expect, it } from 'vitest';
import { resolveNativeDisplaySetUiSelectionV1 } from '../../src/nativeGs/displaySetUi';
import { NATIVE_DEFAULT_DISPLAY_SET_ID, type NativeProjectSnapshotV1 } from '../../src/nativeGs/schema';
import { makeNativeDraft, NATIVE_TEST_IDS, snapshotFromDraft, testNativeId } from './nativeTestProject';

describe('native DisplaySet transient selection reconciliation', () => {
  it('keeps valid exact IDs and rejects a Caption or view from another set', () => {
    const base = snapshotFromDraft(makeNativeDraft().draft);
    const otherSetId = testNativeId('set', 2);
    const defaultViewId = testNativeId('view', 1);
    const otherViewId = testNativeId('view', 2);
    const snapshot: NativeProjectSnapshotV1 = {
      ...base,
      displaySets: [
        { id: NATIVE_DEFAULT_DISPLAY_SET_ID, name: 'Default', orderKey: '0', defaultSavedViewId: defaultViewId },
        { id: otherSetId, name: 'Other', orderKey: '1', defaultSavedViewId: otherViewId },
      ],
      captions: [{ id: NATIVE_TEST_IDS.caption, title: 'A', body: '', anchor: null }],
      savedViews: [
        {
          id: defaultViewId, name: 'Default view', orderKey: '0', projectFrameId: base.project.frame.id,
          camera: { projection: { kind: 'perspective', verticalFovRadians: Math.PI / 3 }, position: [1, 1, 1], target: [0, 0, 0], up: [0, 1, 0] },
          background: { kind: 'solid' as const, colorSrgb: [0, 0, 0] as const },
        },
        {
          id: otherViewId, name: 'Other view', orderKey: '1', projectFrameId: base.project.frame.id,
          camera: { projection: { kind: 'perspective', verticalFovRadians: Math.PI / 3 }, position: [2, 2, 2], target: [0, 0, 0], up: [0, 1, 0] },
          background: { kind: 'solid' as const, colorSrgb: [0, 0, 0] as const }, displaySetId: otherSetId,
        },
      ],
    };
    expect(resolveNativeDisplaySetUiSelectionV1(
      snapshot, NATIVE_DEFAULT_DISPLAY_SET_ID, NATIVE_TEST_IDS.caption, defaultViewId,
    )).toEqual({ displaySetId: NATIVE_DEFAULT_DISPLAY_SET_ID, captionId: NATIVE_TEST_IDS.caption, savedViewId: defaultViewId });
    expect(resolveNativeDisplaySetUiSelectionV1(
      snapshot, otherSetId, NATIVE_TEST_IDS.caption, defaultViewId,
    )).toEqual({ displaySetId: otherSetId, captionId: null, savedViewId: otherViewId });
  });

  it('falls back from an unsaved missing set to durable presentation, then its default view', () => {
    const base = snapshotFromDraft(makeNativeDraft().draft);
    expect(resolveNativeDisplaySetUiSelectionV1(
      base, testNativeId('set', 99), NATIVE_TEST_IDS.caption, testNativeId('view', 99),
    )).toEqual({ displaySetId: NATIVE_DEFAULT_DISPLAY_SET_ID, captionId: null, savedViewId: null });
  });
});
