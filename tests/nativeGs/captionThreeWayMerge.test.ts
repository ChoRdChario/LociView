import { describe, expect, it } from 'vitest';
import {
  createNativeCollaborationBaselineV1,
  mergeNativeCaptionStateV1,
  validateNativeCollaborationBaselineV1,
} from '../../src/nativeGs/captionThreeWayMerge';
import {
  appendEmptyNativeDisplaySetV1,
  parseNativeSnapshotV1,
  removeNativeAssetV1,
  serializeNativeSnapshotV1,
  type NativeCaptionV1,
  type NativeMediaResourceV1,
  type NativeProjectSnapshotV1,
} from '../../src/nativeGs/schema';
import { makeNativeDraft, NATIVE_TEST_IDS, snapshotFromDraft, testNativeId } from './nativeTestProject';

function caption(ordinal: number, title: string, body: string): NativeCaptionV1 {
  return {
    id: testNativeId('cap', ordinal),
    title,
    body,
    ownerAssetId: NATIVE_TEST_IDS.meshAsset,
    color: '#336699',
    anchor: {
      kind: 'asset',
      assetId: NATIVE_TEST_IDS.meshAsset,
      assetFrameId: NATIVE_TEST_IDS.meshFrame,
      positionAsset: [ordinal, 0, 0],
      authoredAssetRevisionId: NATIVE_TEST_IDS.meshRevision,
      authoredAnchorCompatibilityId: NATIVE_TEST_IDS.meshClass,
      hitEvidence: { method: 'manual' },
    },
  };
}

function fixedBaseline(): NativeProjectSnapshotV1 {
  const source = snapshotFromDraft(makeNativeDraft().draft);
  const snapshot = parseNativeSnapshotV1(serializeNativeSnapshotV1({
    ...source,
    captions: [caption(1, 'A', 'alpha'), caption(2, 'B', 'bravo')],
  }));
  return parseNativeSnapshotV1(serializeNativeSnapshotV1({
    ...snapshot,
    collaborationBaseline: createNativeCollaborationBaselineV1(snapshot),
  }));
}

function replaceCaption(
  snapshot: NativeProjectSnapshotV1,
  id: string,
  update: (caption: NativeCaptionV1) => NativeCaptionV1,
): NativeProjectSnapshotV1 {
  return parseNativeSnapshotV1(serializeNativeSnapshotV1({
    ...snapshot,
    captions: snapshot.captions.map((entry) => entry.id === id ? update(entry) : entry),
  }));
}

function media(ordinal: number, digestChar = 'b'): NativeMediaResourceV1 {
  return {
    id: testNativeId('med', ordinal),
    label: `image-${ordinal}.png`,
    kind: 'image',
    blob: { algorithm: 'sha256', digest: digestChar.repeat(64), byteLength: 12, mediaType: 'image/png' },
  };
}

describe('native Caption collaboration three-way merge', () => {
  it('merges distinct edits and a new Caption with image, then reimports idempotently', () => {
    const baseline = fixedBaseline();
    const local = replaceCaption(baseline, testNativeId('cap', 1), (entry) => ({ ...entry, title: 'A local' }));
    const image = media(1);
    const incoming = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...replaceCaption(baseline, testNativeId('cap', 2), (entry) => ({ ...entry, body: 'B incoming' })),
      captions: [
        ...replaceCaption(baseline, testNativeId('cap', 2), (entry) => ({ ...entry, body: 'B incoming' })).captions,
        { ...caption(3, 'C', 'charlie'), attachmentMediaIds: [image.id] },
      ],
      mediaResources: [image],
    }));

    const result = mergeNativeCaptionStateV1(local, incoming);
    expect(result.kind).toBe('merged');
    if (result.kind !== 'merged') throw new Error('expected merge');
    expect(result.changed).toBe(true);
    expect(result.snapshot.captions.map((entry) => [entry.id, entry.title, entry.body])).toEqual([
      [testNativeId('cap', 1), 'A local', 'alpha'],
      [testNativeId('cap', 2), 'B', 'B incoming'],
      [testNativeId('cap', 3), 'C', 'charlie'],
    ]);
    expect(result.snapshot.mediaResources).toEqual([image]);

    const repeated = mergeNativeCaptionStateV1(result.snapshot, incoming);
    expect(repeated).toEqual(expect.objectContaining({ kind: 'merged', changed: false }));
  });

  it('collects same-field and delete-vs-edit conflicts without a candidate snapshot', () => {
    const baseline = fixedBaseline();
    const local = replaceCaption(baseline, testNativeId('cap', 1), (entry) => ({ ...entry, body: 'local' }));
    const incoming = replaceCaption(baseline, testNativeId('cap', 1), (entry) => ({ ...entry, body: 'incoming' }));
    const conflict = mergeNativeCaptionStateV1(local, incoming);
    expect(conflict).toEqual(expect.objectContaining({
      kind: 'conflict',
      conflicts: expect.arrayContaining([expect.objectContaining({
        code: 'caption-field-conflict', captionId: testNativeId('cap', 1), field: 'body',
      })]),
    }));

    const deleted = { ...baseline, captions: baseline.captions.filter((entry) => entry.id !== testNativeId('cap', 1)) };
    const deleteEdit = mergeNativeCaptionStateV1(deleted, incoming);
    expect(deleteEdit).toEqual(expect.objectContaining({
      kind: 'conflict',
      conflicts: expect.arrayContaining([expect.objectContaining({ code: 'caption-delete-edit-conflict' })]),
    }));
  });

  it('uses the established yellow default when merging legacy missing Caption colors', () => {
    const baselineWithMissingColor = (() => {
      const baseline = fixedBaseline();
      const withoutColors = {
        ...baseline,
        captions: baseline.captions.map(({ color: _color, ...caption }) => caption),
      };
      const parsed = parseNativeSnapshotV1(serializeNativeSnapshotV1({
        ...withoutColors,
        collaborationBaseline: undefined,
      }));
      return parseNativeSnapshotV1(serializeNativeSnapshotV1({
        ...parsed,
        collaborationBaseline: createNativeCollaborationBaselineV1(parsed),
      }));
    })();
    const captionId = testNativeId('cap', 1);
    const localDefault = replaceCaption(baselineWithMissingColor, captionId, (entry) => ({ ...entry, color: '#eab308' }));
    const incomingBlue = replaceCaption(baselineWithMissingColor, captionId, (entry) => ({ ...entry, color: '#3366ff' }));
    const blueResult = mergeNativeCaptionStateV1(localDefault, incomingBlue);
    expect(blueResult.kind).toBe('merged');
    if (blueResult.kind !== 'merged') throw new Error('expected default-color merge');
    expect(blueResult.snapshot.captions.find((entry) => entry.id === captionId)?.color).toBe('#3366ff');

    const incomingWhite = replaceCaption(baselineWithMissingColor, captionId, (entry) => ({ ...entry, color: '#ffffff' }));
    const whiteResult = mergeNativeCaptionStateV1(baselineWithMissingColor, incomingWhite);
    expect(whiteResult.kind).toBe('merged');
    if (whiteResult.kind !== 'merged') throw new Error('expected explicit-white merge');
    expect(whiteResult.snapshot.captions.find((entry) => entry.id === captionId)?.color).toBe('#ffffff');
  });

  it('rejects unsupported Project/tag changes and divergent new IDs', () => {
    const baseline = fixedBaseline();
    const hidden = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...baseline,
      presentation: { ...baseline.presentation, hiddenAssetIds: [NATIVE_TEST_IDS.gsAsset] },
    }));
    expect(mergeNativeCaptionStateV1(baseline, hidden)).toEqual(expect.objectContaining({
      kind: 'conflict',
      conflicts: expect.arrayContaining([expect.objectContaining({ code: 'unsupported-state-difference' })]),
    }));

    const tagged = replaceCaption(baseline, testNativeId('cap', 1), (entry) => ({ ...entry, tags: ['new-tag'] }));
    expect(mergeNativeCaptionStateV1(baseline, tagged)).toEqual(expect.objectContaining({
      kind: 'conflict',
      conflicts: expect.arrayContaining([expect.objectContaining({ code: 'unsupported-caption-tags' })]),
    }));

    const newLocal = { ...baseline, captions: [...baseline.captions, caption(3, 'left', 'same id')] };
    const newIncoming = { ...baseline, captions: [...baseline.captions, caption(3, 'right', 'same id')] };
    expect(mergeNativeCaptionStateV1(newLocal, newIncoming)).toEqual(expect.objectContaining({
      kind: 'conflict',
      conflicts: expect.arrayContaining([expect.objectContaining({ code: 'caption-id-conflict' })]),
    }));
  });

  it('rejects a fixed-baseline media record that is missing or changed in current media', () => {
    const base = snapshotFromDraft(makeNativeDraft().draft);
    const baselineMedia = media(8);
    const withMedia = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...base,
      mediaResources: [baselineMedia],
    }));
    const fixed = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...withMedia,
      collaborationBaseline: createNativeCollaborationBaselineV1(withMedia),
    }));
    const missing = parseNativeSnapshotV1(serializeNativeSnapshotV1({ ...fixed, mediaResources: [] }));
    expect(() => validateNativeCollaborationBaselineV1(missing)).toThrow(/baseline media is missing or changed/);
    const changed = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...fixed,
      mediaResources: [{ ...baselineMedia, label: 'changed.png' }],
    }));
    expect(() => validateNativeCollaborationBaselineV1(changed)).toThrow(/baseline media is missing or changed/);
  });

  it('rejects incoming media that no merged Caption references', () => {
    const baseline = fixedBaseline();
    const orphan = media(9);
    const incoming = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...baseline,
      mediaResources: [orphan],
    }));
    expect(mergeNativeCaptionStateV1(baseline, incoming)).toEqual(expect.objectContaining({
      kind: 'conflict',
      conflicts: expect.arrayContaining([expect.objectContaining({
        code: 'caption-media-unreferenced', mediaId: orphan.id,
      })]),
    }));
  });

  it('keeps the historical baseline parseable after an unsupported Asset removal', () => {
    const baseline = fixedBaseline();
    const withoutCaption = { ...baseline, captions: [] };
    const removed = removeNativeAssetV1(withoutCaption, NATIVE_TEST_IDS.meshAsset);
    expect(() => parseNativeSnapshotV1(serializeNativeSnapshotV1(removed))).not.toThrow();
    expect(() => validateNativeCollaborationBaselineV1(removed)).toThrow(/unsupported Project state/);
  });

  it('allows a local DisplaySet edit without rebasing the fixed collaboration state', () => {
    const baseline = fixedBaseline();
    const baselineRecord = baseline.collaborationBaseline;
    const changed = appendEmptyNativeDisplaySetV1(baseline, testNativeId('set', 3), 'Field review');
    expect(changed.collaborationBaseline).toEqual(baselineRecord);
    expect(() => parseNativeSnapshotV1(serializeNativeSnapshotV1(changed))).not.toThrow();
    expect(() => validateNativeCollaborationBaselineV1(changed)).toThrow(/unsupported Project state/);
  });

  it('round-trips and validates the optional self-contained baseline', () => {
    const snapshot = fixedBaseline();
    expect(parseNativeSnapshotV1(serializeNativeSnapshotV1(snapshot))).toEqual(snapshot);
    expect(() => validateNativeCollaborationBaselineV1(snapshot)).not.toThrow();
    const tampered = {
      ...snapshot,
      collaborationBaseline: { ...snapshot.collaborationBaseline!, baselineId: 'f'.repeat(64) },
    };
    expect(() => validateNativeCollaborationBaselineV1(tampered)).toThrow(/baseline ID/);
  });
});
