import type { NativeCaptionV1 } from './schema';

export interface NativeCaptionListFilter {
  readonly query: string;
  readonly assetId: string | null;
}

/** UI-only Caption finding. The returned order always follows the snapshot. */
export function filterNativeCaptionListV1(
  captions: readonly NativeCaptionV1[],
  filter: NativeCaptionListFilter,
): NativeCaptionV1[] {
  const query = filter.query.trim().toLowerCase();
  return captions.filter((caption) => {
    if (filter.assetId !== null && caption.anchor.assetId !== filter.assetId) return false;
    if (query === '') return true;
    return caption.title.toLowerCase().includes(query) || caption.body.toLowerCase().includes(query);
  });
}
