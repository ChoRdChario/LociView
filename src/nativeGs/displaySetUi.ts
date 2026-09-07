import {
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  nativeCaptionDisplaySetIdV1,
  nativeDisplaySetsV1,
  nativeSavedViewDisplaySetIdV1,
  type NativeProjectSnapshotV1,
} from './schema';

export interface NativeDisplaySetUiSelectionV1 {
  readonly displaySetId: string;
  readonly captionId: string | null;
  readonly savedViewId: string | null;
}

/** Resolves transient IDs against one exact snapshot without inventing relations. */
export function resolveNativeDisplaySetUiSelectionV1(
  snapshot: NativeProjectSnapshotV1,
  requestedDisplaySetId: string,
  requestedCaptionId: string | null,
  requestedSavedViewId: string | null,
): NativeDisplaySetUiSelectionV1 {
  const displaySets = nativeDisplaySetsV1(snapshot);
  const durableActive = snapshot.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
  const displaySetId = displaySets.some((set) => set.id === requestedDisplaySetId)
    ? requestedDisplaySetId
    : displaySets.some((set) => set.id === durableActive)
      ? durableActive
      : displaySets[0]!.id;
  const captionId = requestedCaptionId !== null && snapshot.captions.some((caption) => (
    caption.id === requestedCaptionId && nativeCaptionDisplaySetIdV1(caption) === displaySetId
  )) ? requestedCaptionId : null;
  const views = (snapshot.savedViews ?? []).filter((view) => (
    nativeSavedViewDisplaySetIdV1(view) === displaySetId
  ));
  const defaultSavedViewId = displaySets.find((set) => set.id === displaySetId)?.defaultSavedViewId ?? null;
  const savedViewId = requestedSavedViewId !== null && views.some((view) => view.id === requestedSavedViewId)
    ? requestedSavedViewId
    : defaultSavedViewId !== null && views.some((view) => view.id === defaultSavedViewId)
      ? defaultSavedViewId
      : views[0]?.id ?? null;
  return { displaySetId, captionId, savedViewId };
}
