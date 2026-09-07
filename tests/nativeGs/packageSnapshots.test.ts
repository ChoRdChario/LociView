import { describe, expect, it } from 'vitest';
import { createNativeCollaborationBaselineV1 } from '../../src/nativeGs/captionThreeWayMerge';
import {
  buildNativeCleanCopySnapshotPlanV1,
  buildNativeCollaborationSnapshotPlanV1,
  buildNativeReviewSnapshotPlanV1,
} from '../../src/nativeGs/packageSnapshots';
import {
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  nativeDisplaySetsV1,
  parseNativeSnapshotV1,
  serializeNativeSnapshotV1,
} from '../../src/nativeGs/schema';
import { makeNativeDraft, NATIVE_TEST_IDS, snapshotFromDraft, testNativeId } from './nativeTestProject';

function sourceSnapshot() {
  const mediaId = testNativeId('med', 1);
  const raw = {
    ...snapshotFromDraft(makeNativeDraft().draft),
    presentation: {
      ...snapshotFromDraft(makeNativeDraft().draft).presentation,
      hiddenAssetIds: [NATIVE_TEST_IDS.gsAsset],
    },
    captions: [{
      id: testNativeId('cap', 1),
      title: 'Visible Caption',
      body: 'Body',
      ownerAssetId: NATIVE_TEST_IDS.meshAsset,
      attachmentMediaIds: [mediaId],
      anchor: {
        kind: 'asset' as const,
        assetId: NATIVE_TEST_IDS.meshAsset,
        assetFrameId: NATIVE_TEST_IDS.meshFrame,
        positionAsset: [1, 2, 3] as const,
        authoredAssetRevisionId: NATIVE_TEST_IDS.meshRevision,
        authoredAnchorCompatibilityId: NATIVE_TEST_IDS.meshClass,
        hitEvidence: { method: 'manual' as const },
      },
    }],
    mediaResources: [{
      id: mediaId,
      label: 'photo.png',
      kind: 'image' as const,
      blob: { algorithm: 'sha256' as const, digest: 'd'.repeat(64), byteLength: 10, mediaType: 'image/png' },
    }],
  };
  const parsed = parseNativeSnapshotV1(serializeNativeSnapshotV1(raw));
  return parseNativeSnapshotV1(serializeNativeSnapshotV1({
    ...parsed,
    collaborationBaseline: createNativeCollaborationBaselineV1(parsed),
  }));
}

describe('native exchange snapshot builders', () => {
  it('does not project collaboration media without a fixed baseline', () => {
    const source = snapshotFromDraft(makeNativeDraft().draft);
    expect(() => buildNativeCollaborationSnapshotPlanV1(source)).toThrow(/baseline is missing/);
  });

  it('builds a fully re-keyed visible review closure without lineage metadata', () => {
    const source = sourceSnapshot();
    const hiddenMediaId = testNativeId('med', 2);
    const sourceWithHiddenCaption = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...source,
      captions: [
        ...source.captions,
        {
          id: testNativeId('cap', 2),
          title: 'Hidden GS Caption',
          body: 'Must not be shared',
          ownerAssetId: NATIVE_TEST_IDS.gsAsset,
          attachmentMediaIds: [hiddenMediaId],
          anchor: null,
        },
      ],
      mediaResources: [
        ...(source.mediaResources ?? []),
        {
          id: hiddenMediaId,
          label: 'hidden.png',
          kind: 'image' as const,
          blob: { algorithm: 'sha256' as const, digest: 'e'.repeat(64), byteLength: 8, mediaType: 'image/png' },
        },
      ],
    }));
    const plan = buildNativeReviewSnapshotPlanV1(sourceWithHiddenCaption, NATIVE_DEFAULT_DISPLAY_SET_ID);
    expect(plan.snapshot.project.id).not.toBe(source.project.id);
    expect(plan.snapshot.collaborationBaseline).toBeUndefined();
    expect(plan.snapshot.assets).toHaveLength(1);
    expect(plan.snapshot.assets[0]!.id).not.toBe(NATIVE_TEST_IDS.meshAsset);
    expect(plan.snapshot.representations).toHaveLength(1);
    expect(plan.snapshot.captions).toHaveLength(1);
    expect(plan.snapshot.captions[0]!.id).not.toBe(source.captions[0]!.id);
    expect(plan.snapshot.mediaResources?.[0]!.id).not.toBe(source.mediaResources?.[0]!.id);
    expect(plan.representationSourceIds.get(plan.snapshot.representations[0]!.id)).toBe(NATIVE_TEST_IDS.meshRepresentation);
    expect(plan.mediaSourceIds.get(plan.snapshot.mediaResources![0]!.id)).toBe(source.mediaResources![0]!.id);
    expect(plan.snapshot.captions.some((caption) => caption.title === 'Hidden GS Caption')).toBe(false);
    expect(plan.snapshot.mediaResources).toHaveLength(1);
    const serialized = serializeNativeSnapshotV1(plan.snapshot);
    for (const sourceId of [
      source.project.id,
      NATIVE_TEST_IDS.meshAsset,
      NATIVE_TEST_IDS.meshRevision,
      NATIVE_TEST_IDS.meshRepresentation,
      source.captions[0]!.id,
      source.mediaResources![0]!.id,
    ]) expect(serialized).not.toContain(sourceId);
  });

  it('includes and re-keys the visible GS source/display/Proxy closure', () => {
    const source = sourceSnapshot();
    const allVisible = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...source,
      presentation: { ...source.presentation, hiddenAssetIds: [] },
    }));
    const plan = buildNativeReviewSnapshotPlanV1(allVisible, NATIVE_DEFAULT_DISPLAY_SET_ID);
    expect(plan.snapshot.assets).toHaveLength(2);
    expect(plan.snapshot.representations.map((entry) => entry.role).sort()).toEqual([
      'gsPrimary', 'interactionProxy', 'meshPrimary',
    ]);
    const proxy = plan.snapshot.representations.find((entry) => entry.role === 'interactionProxy');
    const gs = plan.snapshot.representations.find((entry) => entry.role === 'gsPrimary');
    expect(proxy?.proxyForGsVariantFamilyId).toBe(gs?.variantFamilyId);
    expect(proxy?.derivedFrom).toEqual([gs?.id]);

    const serialized = serializeNativeSnapshotV1(plan.snapshot);
    for (const sourceId of [
      source.project.id,
      source.project.frame.id,
      ...source.assets.flatMap((asset) => [asset.id, asset.assetFrameId, asset.status.activeBindingId]),
      ...source.assetBindingRevisions.map((binding) => binding.id),
      ...source.assetRevisions.flatMap((revision) => [
        revision.id,
        ...revision.representationIds,
        ...revision.anchorCompatibilityClasses.flatMap((entry) => [entry.id, ...entry.targetVariantFamilyIds]),
      ]),
      ...source.representations.flatMap((representation) => [
        representation.id,
        representation.representationFrameId,
        representation.variantFamilyId,
      ]),
      ...source.captions.map((caption) => caption.id),
      ...(source.mediaResources ?? []).map((media) => media.id),
    ]) expect(serialized).not.toContain(sourceId);
  });

  it('builds a complete editable copy with a new Project lineage and no baseline', () => {
    const source = sourceSnapshot();
    const plan = buildNativeCleanCopySnapshotPlanV1(source);
    expect(plan.snapshot.project.id).not.toBe(source.project.id);
    expect(plan.snapshot.snapshotId).not.toBe(source.snapshotId);
    expect(plan.snapshot.generation).toBe(1);
    expect(plan.snapshot.collaborationBaseline).toBeUndefined();
    expect(plan.snapshot.assets).toEqual(source.assets);
    expect(plan.snapshot.captions).toEqual(source.captions);
    expect(plan.representationSourceIds.get(NATIVE_TEST_IDS.meshRepresentation)).toBe(NATIVE_TEST_IDS.meshRepresentation);
  });

  it('includes an unplaced Caption when its durable owner is visible', () => {
    const source = sourceSnapshot();
    const plan = buildNativeReviewSnapshotPlanV1({
      ...source,
      captions: [{ ...source.captions[0]!, anchor: null }],
    }, NATIVE_DEFAULT_DISPLAY_SET_ID);
    expect(plan.snapshot.captions).toHaveLength(1);
    expect(plan.snapshot.captions[0]).toEqual(expect.objectContaining({
      anchor: null,
      ownerAssetId: plan.snapshot.assets[0]!.id,
    }));
  });

  it('fails closed instead of guessing the owner of an old unplaced review Caption', () => {
    const source = sourceSnapshot();
    const { ownerAssetId: _ownerAssetId, ...withoutOwner } = source.captions[0]!;
    expect(() => buildNativeReviewSnapshotPlanV1({
      ...source,
      captions: [{ ...withoutOwner, anchor: null }],
    }, NATIVE_DEFAULT_DISPLAY_SET_ID)).toThrow(/no durable owning Asset/);
  });

  it('projects only nonbaseline unreferenced media from collaboration output', () => {
    const source = sourceSnapshot();
    const orphanId = testNativeId('med', 9);
    const withOrphan = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...source,
      mediaResources: [
        ...(source.mediaResources ?? []),
        {
          id: orphanId,
          label: 'detached.png',
          kind: 'image',
          blob: { algorithm: 'sha256', digest: '9'.repeat(64), byteLength: 9, mediaType: 'image/png' },
        },
      ],
    }));
    const plan = buildNativeCollaborationSnapshotPlanV1(withOrphan);
    expect(withOrphan.mediaResources?.map((media) => media.id)).toContain(orphanId);
    expect(plan.snapshot.mediaResources?.map((media) => media.id)).not.toContain(orphanId);
    expect(plan.snapshot.mediaResources?.map((media) => media.id)).toEqual(
      source.collaborationBaseline?.mediaResources.map((media) => media.id),
    );
    expect(plan.mediaSourceIds.has(orphanId)).toBe(false);
    expect(plan.snapshot.collaborationBaseline).toEqual(source.collaborationBaseline);
  });

  it('builds review output from the exact requested saved DisplaySet', () => {
    const source = sourceSnapshot();
    const setId = testNativeId('set', 2);
    const captionId = testNativeId('cap', 3);
    const selected = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...source,
      displaySets: [
        ...nativeDisplaySetsV1(source).map((set) => ({ ...set, id: NATIVE_DEFAULT_DISPLAY_SET_ID })),
        { id: setId, name: 'Field review', orderKey: '000001', defaultSavedViewId: null },
      ],
      captions: [
        ...source.captions,
        {
          ...source.captions[0]!, id: captionId, title: 'Selected set Caption',
          displaySetId: setId, attachmentMediaIds: [],
        },
      ],
    }));
    const plan = buildNativeReviewSnapshotPlanV1(selected, setId);
    expect(plan.snapshot.displaySets?.[0]?.name).toBe('Field review');
    expect(plan.snapshot.captions.map((caption) => caption.title)).toEqual(['Selected set Caption']);
    expect(selected.presentation.activeDisplaySetId).not.toBe(setId);
    expect(() => buildNativeReviewSnapshotPlanV1(selected, testNativeId('set', 99)))
      .toThrow(/selected DisplaySet is unavailable/);
  });
});
