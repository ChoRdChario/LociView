import { describe, expect, it } from 'vitest';
import { createNativeExportPreflightV1, sameNativeExportPreflightV1 } from '../../src/nativeGs/exportPreflight';
import { NATIVE_DEFAULT_DISPLAY_SET_ID, parseNativeSnapshotV1, serializeNativeSnapshotV1 } from '../../src/nativeGs/schema';
import { makeNativeDraft, NATIVE_TEST_IDS, snapshotFromDraft, testNativeId } from './nativeTestProject';

describe('native export preflight', () => {
  it('uses the explicitly requested review set rather than the saved active set', () => {
    const base = snapshotFromDraft(makeNativeDraft().draft);
    const reviewSetId = testNativeId('set', 2);
    const snapshot = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...base,
      presentation: { ...base.presentation, activeDisplaySetId: NATIVE_DEFAULT_DISPLAY_SET_ID },
      displaySets: [
        { id: NATIVE_DEFAULT_DISPLAY_SET_ID, name: 'Default', orderKey: '0', defaultSavedViewId: null },
        { id: reviewSetId, name: 'Review', orderKey: '1', defaultSavedViewId: null },
      ],
      captions: [{
        id: NATIVE_TEST_IDS.caption, title: 'Review note', body: '', displaySetId: reviewSetId,
        ownerAssetId: NATIVE_TEST_IDS.meshAsset, anchor: null,
      }],
    }));
    const preflight = createNativeExportPreflightV1(snapshot, {
      projectId: snapshot.project.id, purpose: 'review', reviewDisplaySetId: reviewSetId,
    });
    expect(preflight).toMatchObject({
      reviewDisplaySetId: reviewSetId, reviewDisplaySetName: 'Review', reviewDisplaySetLabel: 'Review', captionCount: 1,
    });
    expect(snapshot.presentation.activeDisplaySetId).toBe(NATIVE_DEFAULT_DISPLAY_SET_ID);
  });

  it('includes source identity and counts in stale equality', () => {
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
    const intent = { projectId: snapshot.project.id, purpose: 'backup' as const };
    const first = createNativeExportPreflightV1(snapshot, intent);
    expect(sameNativeExportPreflightV1(first, { ...first })).toBe(true);
    expect(sameNativeExportPreflightV1(first, { ...first, sourceGeneration: first.sourceGeneration + 1 })).toBe(false);
  });

  it('uses projected byte counts and disambiguates equal review-set names', () => {
    const base = snapshotFromDraft(makeNativeDraft().draft);
    const reviewSetId = testNativeId('set', 2);
    const snapshot = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...base,
      displaySets: [
        { id: NATIVE_DEFAULT_DISPLAY_SET_ID, name: '確認', orderKey: '0', defaultSavedViewId: null },
        { id: reviewSetId, name: '確認', orderKey: '1', defaultSavedViewId: null },
      ],
    }));
    const preflight = createNativeExportPreflightV1(snapshot, {
      projectId: snapshot.project.id, purpose: 'review', reviewDisplaySetId: reviewSetId,
    });
    expect(preflight.reviewDisplaySetLabel).toBe('確認（同名 2/2）');
    expect(preflight.representationByteLength).toBe(
      snapshot.representations.reduce((sum, item) => sum + item.blob.byteLength, 0),
    );
    expect(preflight.mediaByteLength).toBe(0);
  });
});
