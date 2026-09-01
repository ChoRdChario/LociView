export interface RasterDimensions {
  readonly width: number;
  readonly height: number;
}

export function pngDimensions(bytes: Uint8Array): RasterDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length < 24 || signature.some((value, index) => bytes[index] !== value) ||
    bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52
  ) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export function jpegDimensions(bytes: Uint8Array): RasterDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) return null;
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

export function rasterDimensions(bytes: Uint8Array, mediaType: string): RasterDimensions | null {
  if (mediaType === 'image/png') return pngDimensions(bytes);
  if (mediaType === 'image/jpeg' || mediaType === 'image/jpg') return jpegDimensions(bytes);
  return pngDimensions(bytes) ?? jpegDimensions(bytes);
}

export function fitRasterWithinMaxEdge(
  dimensions: RasterDimensions,
  maxEdge: number,
): RasterDimensions {
  if (!Number.isSafeInteger(maxEdge) || maxEdge < 1) throw new Error('runtime texture maximum edge is invalid');
  const largest = Math.max(dimensions.width, dimensions.height);
  if (largest <= maxEdge) return dimensions;
  const scale = maxEdge / largest;
  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  };
}
