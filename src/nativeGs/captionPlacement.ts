import type { NativeCaptionV1 } from './schema';

export interface NativeCaptionPlacementInputV1 {
  readonly existing: NativeCaptionV1 | null;
  readonly captionId: string;
  readonly activeDisplaySetId: string;
  readonly anchor: Exclude<NativeCaptionV1['anchor'], null>;
}

/** Builds the Caption record accepted by both the working snapshot and Viewer. */
export function createNativePlacedCaptionV1(input: NativeCaptionPlacementInputV1): NativeCaptionV1 {
  const existing = input.existing;
  return {
    ...(existing ?? {}),
    id: existing?.id ?? input.captionId,
    title: existing?.title ?? 'Caption',
    body: existing?.body ?? '',
    color: existing?.color ?? '#eab308',
    ...(existing === null ? { displaySetId: input.activeDisplaySetId } : {}),
    ownerAssetId: input.anchor.assetId,
    anchor: input.anchor,
  };
}
