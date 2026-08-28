import { describe, expect, it } from 'vitest';
import { resolveNativeGsSliceV1, type NativeResourceStateV1 } from '../../src/nativeGs/resolver';
import {
  NATIVE_ACTIVE_FORMAT,
  parseNativeActiveMarkerV1,
  parseNativeSnapshotV1,
  serializeNativeActiveMarkerV1,
  serializeNativeSnapshotV1,
  type NativeProjectSnapshotV1,
} from '../../src/nativeGs/schema';
import { makeNativeDraft, NATIVE_TEST_IDS, snapshotFromDraft } from './nativeTestProject';

function healthyStates(snapshot: NativeProjectSnapshotV1): Map<string, NativeResourceStateV1> {
  return new Map(snapshot.representations.map((representation) => [
    representation.id,
    { availability: 'ready' as const, registration: 'known' as const },
  ]));
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

  it('degrades missing GS to Mesh-only and both visual failures to none', () => {
    const snapshot = snapshotFromDraft(makeNativeDraft().draft);
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
    const snapshot = {
      ...snapshotFromDraft(makeNativeDraft().draft),
      presentation: { displayMode: 'mesh-only' as const, captionTargetAssetId: NATIVE_TEST_IDS.gsAsset },
    };
    expect(resolveNativeGsSliceV1(snapshot, healthyStates(snapshot))).toMatchObject({
      effectiveDisplayMode: 'mesh-only',
      interaction: { enabled: false, reason: expect.stringContaining('not visible') },
    });
  });
});
