export const NATIVE_IOS_GLTF_TEXTURE_MAX_EDGE = 4096;

export interface NativeDeviceIdentity {
  readonly userAgent: string;
  readonly platform?: string;
  readonly maxTouchPoints?: number;
}

/** iPhone/iPadだけにruntime decode capを適用する。Desktopと保存原本は対象外。 */
export function nativeRuntimeGltfTextureMaxEdge(device: NativeDeviceIdentity): number | null {
  if (/iPhone|iPad|iPod/i.test(device.userAgent)) return NATIVE_IOS_GLTF_TEXTURE_MAX_EDGE;
  const isTouchMacReportedAsIpad = device.platform === 'MacIntel' && (device.maxTouchPoints ?? 0) > 1;
  return isTouchMacReportedAsIpad ? NATIVE_IOS_GLTF_TEXTURE_MAX_EDGE : null;
}
