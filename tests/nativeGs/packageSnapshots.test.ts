import { describe, expect, it } from 'vitest';
import { createNativeCollaborationBaselineV1 } from '../../src/nativeGs/captionThreeWayMerge';
import {
  buildNativeCleanCopySnapshotPlanV1,
  buildNativeReviewSnapshotPlanV1,
} from '../../src/nativeGs/packageSnapshots';
import { parseNativeSnapshotV1, serializeNativeSnapshotV1 } from '../../src/nativeGs/schema';
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
    const plan = buildNativeReviewSnapshotPlanV1(sourceWithHiddenCaption);
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
    const plan = buildNativeReviewSnapshotPlanV1(allVisible);
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
    });
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
    })).toThrow(/no durable owning Asset/);
  });
});
