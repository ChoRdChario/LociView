import { validateNativeCollaborationBaselineV1 } from './captionThreeWayMerge';
import type { NativeExportIntentV1, NativeExportPurposeV1 } from './exportHandoff';
import {
  buildNativeCleanCopySnapshotPlanV1,
  buildNativeCollaborationSnapshotPlanV1,
  buildNativeReviewSnapshotPlanV1,
} from './packageSnapshots';
import { nativeDisplaySetsV1, type NativeProjectSnapshotV1 } from './schema';
import { nativeChoiceLabelsByIdV1 } from './choiceLabels';

export interface NativeExportPreflightV1 {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly sourceSnapshotId: string;
  readonly sourceGeneration: number;
  readonly purpose: NativeExportPurposeV1;
  readonly reviewDisplaySetId: string | null;
  readonly reviewDisplaySetName: string | null;
  readonly reviewDisplaySetLabel: string | null;
  readonly assetCount: number;
  readonly captionCount: number;
  readonly mediaCount: number;
  readonly representationByteLength: number;
  readonly mediaByteLength: number;
}

export function createNativeExportPreflightV1(
  source: NativeProjectSnapshotV1,
  intent: NativeExportIntentV1,
): NativeExportPreflightV1 {
  if (source.project.id !== intent.projectId) throw new Error('書き出すプロジェクトが一致しません。');
  let projected = source;
  let reviewDisplaySetId: string | null = null;
  let reviewDisplaySetName: string | null = null;
  let reviewDisplaySetLabel: string | null = null;
  if (intent.purpose === 'collaboration') {
    if (source.collaborationBaseline !== undefined) {
      validateNativeCollaborationBaselineV1(source);
      projected = buildNativeCollaborationSnapshotPlanV1(source).snapshot;
    }
  } else if (intent.purpose === 'review') {
    const displaySet = nativeDisplaySetsV1(source).find((set) => set.id === intent.reviewDisplaySetId);
    if (displaySet === undefined) throw new Error('選んだ表示セットは保存済みプロジェクトにありません。');
    reviewDisplaySetId = displaySet.id;
    reviewDisplaySetName = displaySet.name;
    reviewDisplaySetLabel = nativeChoiceLabelsByIdV1(nativeDisplaySetsV1(source)).get(displaySet.id) ?? displaySet.name;
    projected = buildNativeReviewSnapshotPlanV1(source, displaySet.id).snapshot;
  } else if (intent.purpose === 'cleanCopy') {
    projected = buildNativeCleanCopySnapshotPlanV1(source).snapshot;
  }
  return {
    projectId: source.project.id,
    projectTitle: source.project.title,
    sourceSnapshotId: source.snapshotId,
    sourceGeneration: source.generation,
    purpose: intent.purpose,
    reviewDisplaySetId,
    reviewDisplaySetName,
    reviewDisplaySetLabel,
    assetCount: projected.assets.length,
    captionCount: projected.captions.length,
    mediaCount: projected.mediaResources?.length ?? 0,
    representationByteLength: projected.representations.reduce((sum, entry) => sum + entry.blob.byteLength, 0),
    mediaByteLength: (projected.mediaResources ?? []).reduce((sum, entry) => sum + entry.blob.byteLength, 0),
  };
}

export function sameNativeExportPreflightV1(
  left: NativeExportPreflightV1,
  right: NativeExportPreflightV1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
