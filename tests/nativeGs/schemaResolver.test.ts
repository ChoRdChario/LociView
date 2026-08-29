import { describe, expect, it } from 'vitest';
import {
  activeNativeBindingV1,
  activeNativeRepresentationsV1,
  isNativeAssetVisibleV1,
  resolveNativeGsSliceV1,
  type NativeResourceStateV1,
} from '../../src/nativeGs/resolver';
import {
  activateNativeManualAssetTransformV1,
  NATIVE_ACTIVE_FORMAT,
  normalizeNativeSim3,
  parseNativeActiveMarkerV1,
  parseNativeSnapshotV1,
  setNativeAssetVisibilityV1,
  serializeNativeActiveMarkerV1,
  serializeNativeSnapshotV1,
  type NativeProjectSnapshotV1,
} from '../../src/nativeGs/schema';
import { makeNativeDraft, NATIVE_TEST_IDS, snapshotFromDraft, testNativeId } from './nativeTestProject';

function healthyStates(snapshot: NativeProjectSnapshotV1): Map<string, NativeResourceStateV1> {
  return new Map(snapshot.representations.map((representation) => [
    representation.id,
    { availability: 'ready' as const, registration: 'known' as const },
  ]));
}

function withSecondSameKindAssets(snapshot: NativeProjectSnapshotV1): {
  readonly snapshot: NativeProjectSnapshotV1;
  readonly meshAssetId: string;
  readonly meshRepresentationId: string;
  readonly gsAssetId: string;
  readonly gsRepresentationId: string;
  readonly proxyRepresentationId: string;
} {
  const sourceMeshAsset = snapshot.assets.find((asset) => asset.id === NATIVE_TEST_IDS.meshAsset)!;
  const sourceMeshBinding = activeNativeBindingV1(snapshot, sourceMeshAsset.id)!;
  const sourceMeshRevision = snapshot.assetRevisions.find((revision) => revision.id === sourceMeshBinding.assetRevisionId)!;
  const sourceMesh = snapshot.representations.find((representation) => representation.id === NATIVE_TEST_IDS.meshRepresentation)!;
  const sourceAsset = snapshot.assets.find((asset) => asset.id === NATIVE_TEST_IDS.gsAsset)!;
  const sourceBinding = activeNativeBindingV1(snapshot, sourceAsset.id)!;
  const sourceRevision = snapshot.assetRevisions.find((revision) => revision.id === sourceBinding.assetRevisionId)!;
  const sourceGs = snapshot.representations.find((representation) => representation.id === NATIVE_TEST_IDS.gsRepresentation)!;
  const sourceProxy = snapshot.representations.find((representation) => representation.id === NATIVE_TEST_IDS.proxyRepresentation)!;
  const meshAssetId = testNativeId('ast', 60);
  const meshBindingId = testNativeId('bnd', 60);
  const meshRevisionId = testNativeId('rev', 60);
  const meshRepresentationId = testNativeId('rep', 60);
  const meshFamilyId = testNativeId('fam', 60);
  const assetId = testNativeId('ast', 70);
  const assetFrameId = testNativeId('frm', 70);
  const bindingId = testNativeId('bnd', 70);
  const revisionId = testNativeId('rev', 70);
  const gsRepresentationId = testNativeId('rep', 70);
  const proxyRepresentationId = testNativeId('rep', 71);
  const gsFamilyId = testNativeId('fam', 70);
  const candidate: NativeProjectSnapshotV1 = {
    ...snapshot,
    assets: [...snapshot.assets, {
      ...sourceMeshAsset,
      id: meshAssetId,
      label: 'second Mesh',
      assetFrameId: testNativeId('frm', 60),
      status: { kind: 'ready', activeBindingId: meshBindingId },
    }, {
      ...sourceAsset,
      id: assetId,
      label: 'second GS',
      assetFrameId,
      status: { kind: 'ready', activeBindingId: bindingId },
    }],
    assetBindingRevisions: [...snapshot.assetBindingRevisions, {
      ...sourceMeshBinding,
      id: meshBindingId,
      assetId: meshAssetId,
      assetRevisionId: meshRevisionId,
    }, {
      ...sourceBinding,
      id: bindingId,
      assetId,
      assetRevisionId: revisionId,
    }],
    assetRevisions: [...snapshot.assetRevisions, {
      ...sourceMeshRevision,
      id: meshRevisionId,
      assetId: meshAssetId,
      representationIds: [meshRepresentationId],
      anchorCompatibilityClasses: [{
        id: testNativeId('cls', 60),
        targetVariantFamilyIds: [meshFamilyId],
      }],
    }, {
      ...sourceRevision,
      id: revisionId,
      assetId,
      representationIds: [gsRepresentationId, proxyRepresentationId],
      anchorCompatibilityClasses: [{
        id: testNativeId('cls', 70),
        targetVariantFamilyIds: [gsFamilyId],
      }],
    }],
    representations: [...snapshot.representations, {
      ...sourceMesh,
      id: meshRepresentationId,
      assetId: meshAssetId,
      representationFrameId: testNativeId('frm', 61),
      variantFamilyId: meshFamilyId,
    }, {
      ...sourceGs,
      id: gsRepresentationId,
      assetId,
      representationFrameId: testNativeId('frm', 71),
      variantFamilyId: gsFamilyId,
    }, {
      ...sourceProxy,
      id: proxyRepresentationId,
      assetId,
      representationFrameId: testNativeId('frm', 72),
      variantFamilyId: testNativeId('fam', 71),
      derivedFrom: [gsRepresentationId],
      proxyForGsVariantFamilyId: gsFamilyId,
    }],
  };
  return {
    snapshot: parseNativeSnapshotV1(serializeNativeSnapshotV1(candidate)),
    meshAssetId,
    meshRepresentationId,
    gsAssetId: assetId,
    gsRepresentationId,
    proxyRepresentationId,
  };
}

describe('native snapshot v1 and fixed degradation outcomes', () => {
  it('round-trips the approved records, nonidentity transform and GS-local Caption position', () => {
    const { draft } = makeNativeDraft(2);
    const ids = NATIVE_TEST_IDS;
    const snapshot: NativeProjectSnapshotV1 = {
      ...snapshotFromDraft(draft),
      captions: [{
        id: ids.caption,
        title: 'GS Caption',
        body: '',
        anchor: {
          kind: 'asset',
          assetId: ids.gsAsset,
          assetFrameId: ids.gsFrame,
          positionAsset: [1.25, -0.5, 2.75],
          authoredAssetRevisionId: ids.gsRevision,
          authoredAnchorCompatibilityId: ids.gsClass,
          hitEvidence: { method: 'manual' },
        },
      }],
    };
    const parsed = parseNativeSnapshotV1(serializeNativeSnapshotV1(snapshot));
    expect(parsed.assetBindingRevisions.find((binding) => binding.id === ids.gsBinding)?.assetToProject).toEqual({
      translation: [1.25, 0.5, -0.25],
      rotationXYZW: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
      uniformScale: 1.5,
    });
    expect(parsed.captions[0]?.anchor).toMatchObject({
      assetId: ids.gsAsset,
      positionAsset: [1.25, -0.5, 2.75],
      hitEvidence: { method: 'manual' },
    });
  });

  it('appends one manual binding and activates only the selected Asset transform', () => {
    const ids = NATIVE_TEST_IDS;
    const original = snapshotFromDraft(makeNativeDraft().draft);
    const meshBinding = activeNativeBindingV1(original, ids.meshAsset);
    const transform = {
      translation: [7.5, -2, 3.25] as const,
      rotationXYZW: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const,
      uniformScale: 0.75,
    };
    const aligned = activateNativeManualAssetTransformV1(
      original,
      ids.gsAsset,
      testNativeId('bnd', 0),
      transform,
    );

    expect(aligned.assetBindingRevisions).toHaveLength(original.assetBindingRevisions.length + 1);
    expect(aligned.assetBindingRevisions[0]?.id).toBe(testNativeId('bnd', 0));
    expect(activeNativeBindingV1(aligned, ids.gsAsset)).toMatchObject({
      id: testNativeId('bnd', 0),
      assetRevisionId: ids.gsRevision,
      assetToProject: normalizeNativeSim3(transform),
      method: 'manual',
    });
    expect(activeNativeBindingV1(aligned, ids.meshAsset)).toEqual(meshBinding);
    expect(aligned.assetBindingRevisions).toContainEqual(activeNativeBindingV1(original, ids.gsAsset));
  });

  it('resolves only the active Asset revision while validating retained history', () => {
    const ids = NATIVE_TEST_IDS;
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
    const inactiveRepresentationId = testNativeId('rep', 90);
    const inactiveRevisionId = testNativeId('rev', 90);
    const inactiveFamilyId = testNativeId('fam', 90);
    const inactiveRepresentation = {
      ...snapshot.representations.find((entry) => entry.id === ids.gsRepresentation)!,
      id: inactiveRepresentationId,
      representationFrameId: testNativeId('frm', 90),
      variantFamilyId: inactiveFamilyId,
    };
    const withInactiveRevision: NativeProjectSnapshotV1 = {
      ...snapshot,
      representations: [...snapshot.representations, inactiveRepresentation],
      assetRevisions: [...snapshot.assetRevisions, {
        id: inactiveRevisionId,
        assetId: ids.gsAsset,
        representationIds: [inactiveRepresentationId],
        anchorCompatibilityClasses: [{
          id: testNativeId('cls', 90),
          targetVariantFamilyIds: [inactiveFamilyId],
        }],
      }],
    };
    const parsed = parseNativeSnapshotV1(serializeNativeSnapshotV1(withInactiveRevision));
    expect(activeNativeRepresentationsV1(parsed, ids.gsAsset).map((entry) => entry.id)).toEqual([
      ids.gsRepresentation,
      ids.proxyRepresentation,
    ]);
    expect(resolveNativeGsSliceV1(parsed, healthyStates(parsed)).visibleRepresentationIds).not.toContain(inactiveRepresentationId);

    const invalidRetainedBinding: NativeProjectSnapshotV1 = {
      ...snapshot,
      assetBindingRevisions: snapshot.assetBindingRevisions.map((binding) => binding.id === ids.gsBinding
        ? { ...binding, assetId: ids.meshAsset }
        : binding),
    };
    expect(() => serializeNativeSnapshotV1(invalidRetainedBinding)).toThrow(/retained binding ownership/);
  });

  it('fails closed on unknown schema versions and duplicate JSON members', () => {
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
    const text = serializeNativeSnapshotV1(snapshot);
    expect(() => parseNativeSnapshotV1(text.replace('"schemaVersion":1', '"schemaVersion":2'))).toThrow(/unsupported/);
    expect(() => parseNativeSnapshotV1(text.replace('{"format":', '{"format":"duplicate","format":'))).toThrow(/duplicate/);
    const marker = serializeNativeActiveMarkerV1({
      format: NATIVE_ACTIVE_FORMAT,
      schemaVersion: 1,
      projectId: NATIVE_TEST_IDS.project,
      generation: 1,
      snapshotId: NATIVE_TEST_IDS.snapshot,
      snapshotByteLength: 1,
      snapshotSha256: '00'.repeat(32),
    });
    expect(() => parseNativeActiveMarkerV1(marker.replace('"schemaVersion":1', '"schemaVersion":2'))).toThrow(/unsupported/);
  });

  it('opens a legacy snapshot without per-Asset visibility as all visible', () => {
    const legacy = snapshotFromDraft(makeNativeDraft().draft);
    const legacyText = serializeNativeSnapshotV1({
      ...legacy,
      presentation: { displayMode: 'mesh-only', captionTargetAssetId: NATIVE_TEST_IDS.gsAsset },
    }).replace(',"hiddenAssetIds":[]', '');
    const parsed = parseNativeSnapshotV1(legacyText);

    expect(parsed.presentation.hiddenAssetIds).toEqual([]);
    expect(resolveNativeGsSliceV1(parsed, healthyStates(parsed))).toMatchObject({
      effectiveDisplayMode: 'mixed',
      interaction: { enabled: true, surfaceRepresentationId: NATIVE_TEST_IDS.proxyRepresentation },
    });
  });

  it('keeps same-kind GS visibility and dedicated Proxy eligibility independent', () => {
    const base = snapshotFromDraft(makeNativeDraft().draft);
    const second = withSecondSameKindAssets(base);
    const hiddenFirstGs = setNativeAssetVisibilityV1(second.snapshot, NATIVE_TEST_IDS.gsAsset, false);
    const hiddenFirst = setNativeAssetVisibilityV1(hiddenFirstGs, NATIVE_TEST_IDS.meshAsset, false);
    const targetingSecond = {
      ...hiddenFirst,
      presentation: { ...hiddenFirst.presentation, captionTargetAssetId: second.gsAssetId },
    };
    const resolution = resolveNativeGsSliceV1(targetingSecond, healthyStates(targetingSecond));

    expect(isNativeAssetVisibleV1(targetingSecond, NATIVE_TEST_IDS.gsAsset)).toBe(false);
    expect(isNativeAssetVisibleV1(targetingSecond, second.gsAssetId)).toBe(true);
    expect(isNativeAssetVisibleV1(targetingSecond, second.meshAssetId)).toBe(true);
    expect(resolution.visibleRepresentationIds).not.toContain(NATIVE_TEST_IDS.meshRepresentation);
    expect(resolution.visibleRepresentationIds).toContain(second.meshRepresentationId);
    expect(resolution.visibleRepresentationIds).not.toContain(NATIVE_TEST_IDS.gsRepresentation);
    expect(resolution.visibleRepresentationIds).toContain(second.gsRepresentationId);
    expect(resolution.interaction).toMatchObject({
      enabled: true,
      targetAssetId: second.gsAssetId,
      surfaceRepresentationId: second.proxyRepresentationId,
    });

    const targetingHiddenFirst = {
      ...targetingSecond,
      presentation: { ...targetingSecond.presentation, captionTargetAssetId: NATIVE_TEST_IDS.gsAsset },
    };
    expect(resolveNativeGsSliceV1(targetingHiddenFirst, healthyStates(targetingHiddenFirst)).interaction).toEqual({
      enabled: false,
      reason: 'The selected Asset is hidden.',
    });
    expect(targetingSecond.assetBindingRevisions).toEqual(second.snapshot.assetBindingRevisions);
    expect(targetingSecond.captions).toEqual(second.snapshot.captions);
    expect(targetingSecond.representations).toEqual(second.snapshot.representations);
  });

  it('rejects duplicate or missing hidden Asset IDs', () => {
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
    expect(() => serializeNativeSnapshotV1({
      ...snapshot,
      presentation: {
        ...snapshot.presentation,
        hiddenAssetIds: [NATIVE_TEST_IDS.gsAsset, NATIVE_TEST_IDS.gsAsset],
      },
    })).toThrow(/hidden Asset IDs must be unique/);
    expect(() => serializeNativeSnapshotV1({
      ...snapshot,
      presentation: { ...snapshot.presentation, hiddenAssetIds: [testNativeId('ast', 99)] },
    })).toThrow(/hidden Asset is missing/);
  });

  it('uses Mesh itself and only the explicitly bound same-GS-Asset Proxy', () => {
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
    const states = healthyStates(snapshot);
    expect(resolveNativeGsSliceV1(snapshot, states).interaction).toEqual({
      enabled: true,
      targetAssetId: NATIVE_TEST_IDS.gsAsset,
      surfaceRepresentationId: NATIVE_TEST_IDS.proxyRepresentation,
      targetRole: 'gsPrimary',
    });
    const meshTarget = { ...snapshot, presentation: { ...snapshot.presentation, captionTargetAssetId: NATIVE_TEST_IDS.meshAsset } };
    expect(resolveNativeGsSliceV1(meshTarget, states).interaction).toMatchObject({
      enabled: true,
      surfaceRepresentationId: NATIVE_TEST_IDS.meshRepresentation,
      targetRole: 'meshPrimary',
    });
  });

  it('keeps each unrelated visual Asset usable when the other one fails', () => {
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
    const missingMesh = healthyStates(snapshot);
    missingMesh.set(NATIVE_TEST_IDS.meshRepresentation, { availability: 'missing', registration: 'known' });
    expect(resolveNativeGsSliceV1(snapshot, missingMesh)).toMatchObject({
      effectiveDisplayMode: 'gs-only',
      interaction: { enabled: true, targetAssetId: NATIVE_TEST_IDS.gsAsset },
    });

    const states = healthyStates(snapshot);
    states.set(NATIVE_TEST_IDS.gsRepresentation, { availability: 'missing', registration: 'known' });
    expect(resolveNativeGsSliceV1(snapshot, states)).toMatchObject({ effectiveDisplayMode: 'mesh-only' });
    states.set(NATIVE_TEST_IDS.meshRepresentation, { availability: 'failed', registration: 'known' });
    expect(resolveNativeGsSliceV1(snapshot, states)).toMatchObject({
      effectiveDisplayMode: 'none',
      interaction: { enabled: false },
    });
  });

  it('keeps GS visible but disables interaction for missing Proxy, broken binding or unknown registration', () => {
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
    const states = healthyStates(snapshot);
    states.set(NATIVE_TEST_IDS.proxyRepresentation, { availability: 'missing', registration: 'known' });
    expect(resolveNativeGsSliceV1(snapshot, states)).toMatchObject({
      effectiveDisplayMode: 'mixed',
      interaction: { enabled: false, reason: expect.stringContaining('Proxy') },
    });

    const broken = {
      ...snapshot,
      representations: snapshot.representations.map((representation) => representation.id === NATIVE_TEST_IDS.proxyRepresentation
        ? { ...representation, proxyForGsVariantFamilyId: NATIVE_TEST_IDS.meshFamily }
        : representation),
    };
    expect(resolveNativeGsSliceV1(broken, healthyStates(broken))).toMatchObject({
      effectiveDisplayMode: 'mixed',
      interaction: { enabled: false, reason: expect.stringContaining('binding') },
    });

    const unknown = healthyStates(snapshot);
    unknown.set(NATIVE_TEST_IDS.proxyRepresentation, { availability: 'ready', registration: 'unknown' });
    expect(resolveNativeGsSliceV1(snapshot, unknown)).toMatchObject({
      interaction: { enabled: false, reason: expect.stringContaining('registration') },
    });
  });

  it('does not raycast a GS Proxy while GS is hidden', () => {
    const snapshot = setNativeAssetVisibilityV1(snapshotFromDraft(makeNativeDraft().draft), NATIVE_TEST_IDS.gsAsset, false);
    expect(resolveNativeGsSliceV1(snapshot, healthyStates(snapshot))).toMatchObject({
      effectiveDisplayMode: 'mesh-only',
      interaction: { enabled: false, reason: expect.stringContaining('hidden') },
    });
  });
});
