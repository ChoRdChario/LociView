import { describe, expect, it } from 'vitest';
import { filterNativeCaptionListV1 } from '../../src/nativeGs/captionList';
import type { NativeCaptionV1 } from '../../src/nativeGs/schema';

function caption(id: string, assetId: string, title: string, body: string): NativeCaptionV1 {
  return {
    id,
    title,
    body,
    anchor: {
      kind: 'asset',
      assetId,
      assetFrameId: `frame-${assetId}`,
      positionAsset: [0, 0, 0],
      authoredAssetRevisionId: 'revision',
      authoredAnchorCompatibilityId: 'compatibility',
      hitEvidence: { method: 'manual' },
    },
  };
}

describe('native Caption list filtering', () => {
  const captions = [
    caption('caption-a', 'asset-a', 'Engine inspection', '左側パネル'),
    caption('caption-b', 'asset-b', '脚庫', 'Landing GEAR detail'),
    caption('caption-c', 'asset-a', '尾翼', '塗装の記録'),
  ];

  it('matches title or body like ordinary-v1 search and preserves snapshot order', () => {
    expect(filterNativeCaptionListV1(captions, { query: '  gear ', assetId: null }).map((entry) => entry.id))
      .toEqual(['caption-b']);
    expect(filterNativeCaptionListV1(captions, { query: 'INSPECTION', assetId: null }).map((entry) => entry.id))
      .toEqual(['caption-a']);
    expect(captions.map((entry) => entry.id)).toEqual(['caption-a', 'caption-b', 'caption-c']);
  });

  it('filters independently by owning Asset and composes with text search', () => {
    expect(filterNativeCaptionListV1(captions, { query: '', assetId: 'asset-a' }).map((entry) => entry.id))
      .toEqual(['caption-a', 'caption-c']);
    expect(filterNativeCaptionListV1(captions, { query: '塗装', assetId: 'asset-a' }).map((entry) => entry.id))
      .toEqual(['caption-c']);
    expect(filterNativeCaptionListV1(captions, { query: '脚庫', assetId: 'asset-a' })).toEqual([]);
  });
});
