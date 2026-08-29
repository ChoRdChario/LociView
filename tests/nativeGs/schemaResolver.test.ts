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
  updateSelectedNativeCaptionV1,
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

  it('defaults old snapshots to no SavedViews and round-trips valid perspective and orthographic views', () => {
    const base = snapshotFromDraft(makeNativeDraft().draft);
    const oldRecord = JSON.parse(serializeNativeSnapshotV1(base)) as Record<string, unknown>;
    delete oldRecord.savedViews;
    expect(parseNativeSnapshotV1(`${JSON.stringify(oldRecord)}\n`).savedViews).toEqual([]);

    const perspective = {
      id: NATIVE_TEST_IDS.savedView,
      name: 'Overview',
      orderKey: '0001',
      projectFrameId: NATIVE_TEST_IDS.projectFrame,
      camera: {
        position: [5, 4, 8] as const,
        target: [0, 0, 0] as const,
        up: [0, 1, 0] as const,
        projection: { kind: 'perspective' as const, verticalFovRadians: Math.PI / 3 },
      },
      background: { kind: 'solid' as const, colorSrgb: [16 / 255, 23 / 255, 37 / 255] as const },
    };
    const orthographic = {
      ...perspective,
      id: testNativeId('view', 2),
      name: 'Plan',
      orderKey: '0002',
      camera: {
        position: [0, 10, 0] as const,
        target: [0, 0, 0] as const,
        up: [0, 0, -1] as const,
        projection: { kind: 'orthographic' as const, verticalSpan: 12 },
      },
    };
    const parsed = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...base,
      savedViews: [orthographic, perspective],
    }));
    expect(parsed.savedViews).toEqual([perspective, orthographic]);
  });

  it('rejects invalid or foreign SavedView camera records instead of repairing them', () => {
    const base = snapshotFromDraft(makeNativeDraft().draft);
    const valid = {
      id: NATIVE_TEST_IDS.savedView,
      name: 'Overview',
      orderKey: '0001',
      projectFrameId: NATIVE_TEST_IDS.projectFrame,
      camera: {
        position: [2, 2, 2] as const,
        target: [0, 0, 0] as const,
        up: [0, 1, 0] as const,
        projection: { kind: 'perspective' as const, verticalFovRadians: Math.PI / 4 },
      },
      background: { kind: 'solid' as const, colorSrgb: [0, 0.25, 1] as const },
    };
    const parseWith = (savedViews: readonly unknown[]) => parseNativeSnapshotV1(JSON.stringify({ ...base, savedViews }));

    expect(() => parseWith([{ ...valid, projectFrameId: testNativeId('frm', 99) }])).toThrow(/ProjectFrame is foreign/);
    expect(() => parseWith([{ ...valid, camera: { ...valid.camera, target: valid.camera.position } }])).toThrow(/position and target must differ/);
    expect(() => parseWith([{ ...valid, camera: { ...valid.camera, up: [-2, -2, -2] } }])).toThrow(/must not be parallel/);
    expect(() => parseWith([{
      ...valid,
      camera: { ...valid.camera, projection: { kind: 'perspective', verticalFovRadians: Math.PI } },
    }])).toThrow(/between zero and pi/);
    expect(() => parseWith([{ ...valid, background: { kind: 'solid', colorSrgb: [0, 1.01, 0] } }])).toThrow(/must be normalized/);
    expect(() => parseWith([valid, valid])).toThrow(/duplicate SavedView id/);
  });

  it('updates only the selected Caption and fails closed if its stable ID disappears', () => {
    const ids = NATIVE_TEST_IDS;
    const first = {
      id: ids.caption,
      title: 'first',
      body: 'before',
      anchor: {
        kind: 'asset' as const,
        assetId: ids.gsAsset,
        assetFrameId: ids.gsFrame,
        positionAsset: [1, 2, 3] as const,
        authoredAssetRevisionId: ids.gsRevision,
        authoredAnchorCompatibilityId: ids.gsClass,
        hitEvidence: { method: 'manual' as const },
      },
    };
    const second = {
      ...first,
      id: testNativeId('cap', 2),
      title: 'unrelated',
      body: 'must survive exactly',
      anchor: { ...first.anchor, positionAsset: [-4, 5, 6] as const },
    };
    const snapshot: NativeProjectSnapshotV1 = {
      ...snapshotFromDraft(makeNativeDraft().draft),
      captions: [first, second],
    };
    const updated = updateSelectedNativeCaptionV1(snapshot, first.id, {
      ...first,
      title: 'edited',
      body: 'after',
      anchor: { ...first.anchor, positionAsset: [7, 8, 9] },
    });

    expect(updated.captions).toHaveLength(2);
    expect(updated.captions[0]).toMatchObject({
      id: first.id,
      title: 'edited',
      body: 'after',
      anchor: { positionAsset: [7, 8, 9] },
    });
    expect(updated.captions[1]).toBe(second);
    expect(parseNativeSnapshotV1(serializeNativeSnapshotV1(updated)).captions[1]).toEqual(second);
    const third = {
      ...first,
      id: testNativeId('cap', 3),
      title: 'new Caption',
      anchor: { ...first.anchor, positionAsset: [10, 11, 12] as const },
    };
    const appended = updateSelectedNativeCaptionV1(updated, null, third);
    expect(appended.captions).toEqual([updated.captions[0], second, third]);
    const editedThird = updateSelectedNativeCaptionV1(appended, third.id, { ...third, body: 'third edited' });
    expect(editedThird.captions.slice(0, 2)).toEqual(appended.captions.slice(0, 2));
    expect(editedThird.captions[2]).toMatchObject({ id: third.id, body: 'third edited' });
    expect(() => updateSelectedNativeCaptionV1(snapshot, testNativeId('cap', 3), first)).toThrow(/selected Caption identity changed/);
    expect(() => updateSelectedNativeCaptionV1(
      { ...snapshot, captions: [second] },
      first.id,
      first,
    )).toThrow(/selected Caption is missing/);
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
