import {
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  nativeCaptionDisplaySetIdV1,
  nativeCaptionOwnerAssetIdV1,
  parseNativeSnapshotV1,
  serializeNativeSnapshotV1,
  type NativeCaptionV1,
  type NativeCollaborationBaselineV1,
  type NativeMediaResourceV1,
  type NativeProjectSnapshotV1,
} from './schema';
import { digestNativeBytes } from './sha256';

const CANONICAL_ENVELOPE_SNAPSHOT_ID = 'snp_00000000000000000000000000';

export type NativeCollaborationConflictCodeV1 =
  | 'lineage-mismatch'
  | 'baseline-missing'
  | 'baseline-mismatch'
  | 'baseline-invalid'
  | 'unsupported-state-difference'
  | 'unsupported-caption-tags'
  | 'caption-field-conflict'
  | 'caption-delete-edit-conflict'
  | 'caption-id-conflict'
  | 'media-baseline-difference'
  | 'media-id-conflict'
  | 'caption-media-unreferenced'
  | 'caption-media-missing'
  | 'merged-snapshot-invalid';

export interface NativeCollaborationConflictV1 {
  readonly code: NativeCollaborationConflictCodeV1;
  readonly message: string;
  readonly captionId?: string;
  readonly field?: string;
  readonly mediaId?: string;
}

export type NativeCaptionThreeWayMergeResultV1 =
  | {
      readonly kind: 'merged';
      readonly snapshot: NativeProjectSnapshotV1;
      readonly changed: boolean;
      readonly conflicts: readonly [];
    }
  | {
      readonly kind: 'conflict';
      readonly conflicts: readonly NativeCollaborationConflictV1[];
    };

function digestText(text: string): string {
  return digestNativeBytes(new TextEncoder().encode(text)).sha256;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function sortedCaptions(captions: readonly NativeCaptionV1[]): readonly NativeCaptionV1[] {
  return [...captions].sort((left, right) => left.id.localeCompare(right.id));
}

function sortedMedia(media: readonly NativeMediaResourceV1[]): readonly NativeMediaResourceV1[] {
  return [...media].sort((left, right) => left.id.localeCompare(right.id));
}

export function nativeUnsupportedStateSha256V1(snapshot: NativeProjectSnapshotV1): string {
  const {
    snapshotId: _snapshotId,
    generation: _generation,
    captions: _captions,
    mediaResources: _mediaResources,
    collaborationBaseline: _collaborationBaseline,
    ...state
  } = snapshot;
  const canonical: NativeProjectSnapshotV1 = {
    ...state,
    snapshotId: CANONICAL_ENVELOPE_SNAPSHOT_ID,
    generation: 1,
    captions: [],
  };
  return digestText(serializeNativeSnapshotV1(canonical));
}

function baselinePayload(
  lineageProjectId: string,
  unsupportedStateSha256: string,
  captions: readonly NativeCaptionV1[],
  mediaResources: readonly NativeMediaResourceV1[],
): string {
  return canonicalJson({
    version: 1,
    lineageProjectId,
    unsupportedStateSha256,
    captions: sortedCaptions(captions),
    mediaResources: sortedMedia(mediaResources),
  });
}

export function nativeCollaborationBaselineIdV1(
  baseline: Omit<NativeCollaborationBaselineV1, 'baselineId'>,
): string {
  return digestText(baselinePayload(
    baseline.lineageProjectId,
    baseline.unsupportedStateSha256,
    baseline.captions,
    baseline.mediaResources,
  ));
}

export function createNativeCollaborationBaselineV1(
  snapshot: NativeProjectSnapshotV1,
): NativeCollaborationBaselineV1 {
  const record = {
    version: 1 as const,
    lineageProjectId: snapshot.project.id,
    unsupportedStateSha256: nativeUnsupportedStateSha256V1(snapshot),
    captions: sortedCaptions(snapshot.captions),
    mediaResources: sortedMedia(snapshot.mediaResources ?? []),
  };
  return { ...record, baselineId: nativeCollaborationBaselineIdV1(record) };
}

export function validateNativeCollaborationBaselineV1(snapshot: NativeProjectSnapshotV1): void {
  const baseline = snapshot.collaborationBaseline;
  if (baseline === undefined) throw new Error('native collaboration: Project has no fixed baseline');
  if (baseline.lineageProjectId !== snapshot.project.id) {
    throw new Error('native collaboration: baseline lineage does not match the Project');
  }
  if (nativeCollaborationBaselineIdV1(baseline) !== baseline.baselineId) {
    throw new Error('native collaboration: baseline ID does not match its canonical content');
  }
  if (nativeUnsupportedStateSha256V1(snapshot) !== baseline.unsupportedStateSha256) {
    throw new Error('native collaboration: unsupported Project state changed after the fixed baseline');
  }
}

function same(valueA: unknown, valueB: unknown): boolean {
  return canonicalJson(valueA) === canonicalJson(valueB);
}

function captionTags(caption: NativeCaptionV1): readonly string[] {
  return caption.tags ?? [];
}

function captionAttachments(caption: NativeCaptionV1): readonly string[] {
  return caption.attachmentMediaIds ?? [];
}

function captionColor(caption: NativeCaptionV1): string {
  return caption.color ?? '#eab308';
}

function captionSemanticValue(caption: NativeCaptionV1): unknown {
  return {
    title: caption.title,
    body: caption.body,
    ownerAssetId: nativeCaptionOwnerAssetIdV1(caption),
    displaySetId: nativeCaptionDisplaySetIdV1(caption),
    color: captionColor(caption),
    tags: captionTags(caption),
    attachmentMediaIds: captionAttachments(caption),
    anchor: caption.anchor,
  };
}

function sameCaption(left: NativeCaptionV1, right: NativeCaptionV1): boolean {
  return same(captionSemanticValue(left), captionSemanticValue(right));
}

function mergeAtomic<T>(
  baseline: T,
  local: T,
  incoming: T,
  equals: (left: T, right: T) => boolean,
): { readonly value: T; readonly conflict: boolean } {
  if (equals(local, incoming)) return { value: local, conflict: false };
  if (equals(local, baseline)) return { value: incoming, conflict: false };
  if (equals(incoming, baseline)) return { value: local, conflict: false };
  return { value: local, conflict: true };
}

function mergeCaptionFields(
  baseline: NativeCaptionV1,
  local: NativeCaptionV1,
  incoming: NativeCaptionV1,
  conflicts: NativeCollaborationConflictV1[],
): NativeCaptionV1 {
  const result: Record<string, unknown> = { id: baseline.id };
  const owner = mergeAtomic(
    nativeCaptionOwnerAssetIdV1(baseline),
    nativeCaptionOwnerAssetIdV1(local),
    nativeCaptionOwnerAssetIdV1(incoming),
    Object.is,
  );
  if (owner.conflict) {
    conflicts.push({
      code: 'caption-field-conflict',
      captionId: baseline.id,
      field: 'ownerAssetId',
      message: `Caption ${baseline.id} changed ownerAssetId differently in both copies`,
    });
  }
  if (
    owner.value !== null &&
    (local.ownerAssetId !== undefined || owner.value !== nativeCaptionOwnerAssetIdV1(local))
  ) result.ownerAssetId = owner.value;
  const fields = [
    { name: 'title', baseline: baseline.title, local: local.title, incoming: incoming.title, equals: Object.is },
    { name: 'body', baseline: baseline.body, local: local.body, incoming: incoming.body, equals: Object.is },
    {
      name: 'displaySetId', baseline: baseline.displaySetId, local: local.displaySetId, incoming: incoming.displaySetId,
      equals: (left: string | undefined, right: string | undefined) => (
        (left ?? NATIVE_DEFAULT_DISPLAY_SET_ID) === (right ?? NATIVE_DEFAULT_DISPLAY_SET_ID)
      ),
    },
    {
      name: 'color', baseline: baseline.color, local: local.color, incoming: incoming.color,
      equals: (left: string | undefined, right: string | undefined) => (left ?? '#eab308') === (right ?? '#eab308'),
    },
    {
      name: 'anchor', baseline: baseline.anchor, local: local.anchor, incoming: incoming.anchor,
      equals: same,
    },
    {
      name: 'attachmentMediaIds', baseline: baseline.attachmentMediaIds, local: local.attachmentMediaIds,
      incoming: incoming.attachmentMediaIds,
      equals: (left: readonly string[] | undefined, right: readonly string[] | undefined) => same(left ?? [], right ?? []),
    },
  ] as const;

  for (const field of fields) {
    const merged = mergeAtomic(field.baseline, field.local, field.incoming, field.equals as never);
    if (merged.conflict) {
      conflicts.push({
        code: 'caption-field-conflict',
        captionId: baseline.id,
        field: field.name,
        message: `Caption ${baseline.id} changed ${field.name} differently in both copies`,
      });
    }
    if (merged.value !== undefined) result[field.name] = merged.value;
  }
  if (baseline.tags !== undefined) result.tags = baseline.tags;
  return result as unknown as NativeCaptionV1;
}

function mergeCaptions(
  baseline: readonly NativeCaptionV1[],
  local: readonly NativeCaptionV1[],
  incoming: readonly NativeCaptionV1[],
  conflicts: NativeCollaborationConflictV1[],
): readonly NativeCaptionV1[] {
  const baselineById = new Map(baseline.map((caption) => [caption.id, caption]));
  const localById = new Map(local.map((caption) => [caption.id, caption]));
  const incomingById = new Map(incoming.map((caption) => [caption.id, caption]));
  const ids = new Set([...baselineById.keys(), ...localById.keys(), ...incomingById.keys()]);
  const merged: NativeCaptionV1[] = [];

  for (const id of [...ids].sort()) {
    const base = baselineById.get(id);
    const left = localById.get(id);
    const right = incomingById.get(id);
    if (base === undefined) {
      const candidate = left ?? right;
      if (candidate === undefined) continue;
      if (captionTags(candidate).length > 0 || (left !== undefined && captionTags(left).length > 0) || (right !== undefined && captionTags(right).length > 0)) {
        conflicts.push({
          code: 'unsupported-caption-tags', captionId: id, field: 'tags',
          message: `New Caption ${id} contains tags, which are outside the first collaboration merge`,
        });
      }
      if (left !== undefined && right !== undefined && !sameCaption(left, right)) {
        conflicts.push({
          code: 'caption-id-conflict', captionId: id,
          message: `New Caption ${id} has different content in both copies`,
        });
      }
      merged.push(candidate);
      continue;
    }

    if (left === undefined && right === undefined) continue;
    if (left === undefined) {
      if (right !== undefined && !sameCaption(right, base)) {
        conflicts.push({
          code: 'caption-delete-edit-conflict', captionId: id,
          message: `Caption ${id} was deleted locally and edited in the incoming copy`,
        });
      }
      continue;
    }
    if (right === undefined) {
      if (!sameCaption(left, base)) {
        conflicts.push({
          code: 'caption-delete-edit-conflict', captionId: id,
          message: `Caption ${id} was edited locally and deleted in the incoming copy`,
        });
      }
      continue;
    }
    if (!same(captionTags(left), captionTags(base)) || !same(captionTags(right), captionTags(base))) {
      conflicts.push({
        code: 'unsupported-caption-tags', captionId: id, field: 'tags',
        message: `Caption ${id} changed tags, which are outside the first collaboration merge`,
      });
    }
    merged.push(mergeCaptionFields(base, left, right, conflicts));
  }
  return merged;
}

function mergeMedia(
  baseline: readonly NativeMediaResourceV1[],
  local: readonly NativeMediaResourceV1[],
  incoming: readonly NativeMediaResourceV1[],
  conflicts: NativeCollaborationConflictV1[],
): readonly NativeMediaResourceV1[] {
  const baselineById = new Map(baseline.map((media) => [media.id, media]));
  const localById = new Map(local.map((media) => [media.id, media]));
  const incomingById = new Map(incoming.map((media) => [media.id, media]));
  const ids = new Set([...baselineById.keys(), ...localById.keys(), ...incomingById.keys()]);
  const merged: NativeMediaResourceV1[] = [];
  for (const id of [...ids].sort()) {
    const base = baselineById.get(id);
    const left = localById.get(id);
    const right = incomingById.get(id);
    if (base !== undefined) {
      if (left === undefined || right === undefined || !same(left, base) || !same(right, base)) {
        conflicts.push({
          code: 'media-baseline-difference', mediaId: id,
          message: `Baseline media ${id} is missing or has changed metadata`,
        });
      }
      merged.push(left ?? right ?? base);
      continue;
    }
    const candidate = left ?? right;
    if (candidate === undefined) continue;
    if (left !== undefined && right !== undefined && !same(left, right)) {
      conflicts.push({
        code: 'media-id-conflict', mediaId: id,
        message: `New media ${id} has different label, size, type or SHA-256 in both copies`,
      });
    }
    merged.push(candidate);
  }
  return merged;
}

function baselineConflict(
  local: NativeProjectSnapshotV1,
  incoming: NativeProjectSnapshotV1,
): readonly NativeCollaborationConflictV1[] {
  if (local.project.id !== incoming.project.id) {
    return [{ code: 'lineage-mismatch', message: 'The incoming package belongs to a different Project lineage' }];
  }
  if (local.collaborationBaseline === undefined || incoming.collaborationBaseline === undefined) {
    return [{ code: 'baseline-missing', message: 'Both Project copies require the same fixed collaboration baseline' }];
  }
  if (local.collaborationBaseline.baselineId !== incoming.collaborationBaseline.baselineId ||
      !same(local.collaborationBaseline, incoming.collaborationBaseline)) {
    return [{ code: 'baseline-mismatch', message: 'The Project copies do not share the same collaboration baseline' }];
  }
  const conflicts: NativeCollaborationConflictV1[] = [];
  for (const [label, snapshot] of [['local', local], ['incoming', incoming]] as const) {
    try {
      validateNativeCollaborationBaselineV1(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      conflicts.push({
        code: message.includes('unsupported Project state') ? 'unsupported-state-difference' : 'baseline-invalid',
        message: `${label} copy: ${message}`,
      });
    }
  }
  return conflicts;
}

export function mergeNativeCaptionStateV1(
  local: NativeProjectSnapshotV1,
  incoming: NativeProjectSnapshotV1,
): NativeCaptionThreeWayMergeResultV1 {
  const early = baselineConflict(local, incoming);
  if (early.length > 0) return { kind: 'conflict', conflicts: early };
  const baseline = local.collaborationBaseline!;
  const conflicts: NativeCollaborationConflictV1[] = [];
  const mediaResources = mergeMedia(
    baseline.mediaResources,
    local.mediaResources ?? [],
    incoming.mediaResources ?? [],
    conflicts,
  );
  const captions = mergeCaptions(baseline.captions, local.captions, incoming.captions, conflicts);
  const referencedMediaIds = new Set(captions.flatMap((caption) => caption.attachmentMediaIds ?? []));
  const existingMediaIds = new Set([
    ...baseline.mediaResources.map((media) => media.id),
    ...(local.mediaResources ?? []).map((media) => media.id),
  ]);
  for (const media of incoming.mediaResources ?? []) {
    if (!existingMediaIds.has(media.id) && !referencedMediaIds.has(media.id)) {
      conflicts.push({
        code: 'caption-media-unreferenced', mediaId: media.id,
        message: `Incoming media ${media.id} is not referenced by the merged Caption set`,
      });
    }
  }
  const mediaIds = new Set(mediaResources.map((media) => media.id));
  for (const caption of captions) {
    for (const mediaId of caption.attachmentMediaIds ?? []) {
      if (!mediaIds.has(mediaId)) {
        conflicts.push({
          code: 'caption-media-missing', captionId: caption.id, mediaId,
          message: `Caption ${caption.id} references missing media ${mediaId}`,
        });
      }
    }
  }
  if (conflicts.length > 0) return { kind: 'conflict', conflicts };

  let candidate: NativeProjectSnapshotV1;
  try {
    candidate = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...local,
      captions,
      mediaResources,
    }));
  } catch (error) {
    return {
      kind: 'conflict',
      conflicts: [{
        code: 'merged-snapshot-invalid',
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }
  const changed = !same(sortedCaptions(candidate.captions), sortedCaptions(local.captions)) ||
    !same(sortedMedia(candidate.mediaResources ?? []), sortedMedia(local.mediaResources ?? []));
  return { kind: 'merged', snapshot: changed ? candidate : local, changed, conflicts: [] };
}
