import { describe, expect, it } from 'vitest';
import {
  NATIVE_IOS_GLTF_TEXTURE_MAX_EDGE,
  nativeRuntimeGltfTextureMaxEdge,
} from '../../src/nativeGs/mobileTexturePolicy';

describe('native iOS GLTF texture policy', () => {
  it('caps iPhone and iPad without changing Desktop policy', () => {
    expect(nativeRuntimeGltfTextureMaxEdge({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }))
      .toBe(NATIVE_IOS_GLTF_TEXTURE_MAX_EDGE);
    expect(nativeRuntimeGltfTextureMaxEdge({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }))
      .toBe(NATIVE_IOS_GLTF_TEXTURE_MAX_EDGE);
    expect(nativeRuntimeGltfTextureMaxEdge({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' }))
      .toBeNull();
  });

  it('recognizes iPadOS when Safari reports a touch-capable MacIntel platform', () => {
    expect(nativeRuntimeGltfTextureMaxEdge({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    })).toBe(4096);
    expect(nativeRuntimeGltfTextureMaxEdge({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })).toBeNull();
  });
});
