import type { RestartableByteSource } from './plyProfile';
import { NativeSha256, type NativeStreamDigest } from './sha256';

export type NativeImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export type NativeImageAdmissionErrorCode =
  | 'heic-device-conversion-required'
  | 'unsupported-image-content'
  | 'image-content-invalid'
  | 'image-declaration-conflict';

export const HEIC_DEVICE_CONVERSION_GUIDANCE =
  'この版ではHEIC／HEIF画像を直接追加できません。端末上で別のJPEGとして書き出し、作成したJPEGを選び直してください。iPhoneでは「プレビュー」の「書き出す」または「ショートカット」の画像変換を利用できます。元の写真は変更されません。';

export class NativeImageAdmissionError extends Error {
  constructor(
    readonly code: NativeImageAdmissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NativeImageAdmissionError';
  }
}

export interface NativeImageAdmission extends NativeStreamDigest {
  readonly mediaType: NativeImageMediaType;
  readonly width: number;
  readonly height: number;
}

interface SourceEdges extends NativeStreamDigest {
  readonly prefix: Uint8Array;
  readonly suffix: Uint8Array;
}

// Container metadata must reach a real frame/image payload promptly. Keeping
// the bounded prefix also avoids buffering an entire user-selected image.
const PREFIX_LIMIT = 1024 * 1024;
const SUFFIX_LIMIT = 16;
const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1',
]);

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
}

function appendSuffix(previous: Uint8Array, chunk: Uint8Array): Uint8Array {
  if (chunk.byteLength >= SUFFIX_LIMIT) return chunk.slice(chunk.byteLength - SUFFIX_LIMIT);
  const joined = new Uint8Array(Math.min(SUFFIX_LIMIT, previous.byteLength + chunk.byteLength));
  const previousLength = Math.min(previous.byteLength, joined.byteLength - chunk.byteLength);
  joined.set(previous.subarray(previous.byteLength - previousLength), 0);
  joined.set(chunk, previousLength);
  return joined;
}

async function inspectSourceEdges(
  source: RestartableByteSource,
  signal?: AbortSignal,
): Promise<SourceEdges> {
  const reader = source.stream().getReader();
  const prefix = new Uint8Array(PREFIX_LIMIT);
  let prefixLength = 0;
  let suffix: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let byteLength = 0;
  const hash = new NativeSha256();
  try {
    for (;;) {
      aborted(signal);
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      hash.update(chunk);
      byteLength += chunk.byteLength;
      if (!Number.isSafeInteger(byteLength)) {
        throw new NativeImageAdmissionError('image-content-invalid', '画像が大きすぎるため追加できません。');
      }
      if (prefixLength < PREFIX_LIMIT) {
        const take = Math.min(PREFIX_LIMIT - prefixLength, chunk.byteLength);
        prefix.set(chunk.subarray(0, take), prefixLength);
        prefixLength += take;
      }
      suffix = appendSuffix(suffix, chunk);
    }
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      // Preserve the inspection failure.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  return {
    prefix: prefix.slice(0, prefixLength),
    suffix,
    byteLength,
    sha256: hash.digestHex(),
  };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) return '';
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint32be(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (((bytes[offset]! * 0x1000000) + (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0);
}

function uint32le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return ((bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! * 0x1000000)) >>> 0);
}

function uint16be(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function uint16le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function isHeifFamily(prefix: Uint8Array): boolean {
  if (prefix.byteLength < 12 || ascii(prefix, 4, 4) !== 'ftyp') return false;
  const boxLength = uint32be(prefix, 0);
  if (boxLength === null || boxLength < 12) return false;
  if (HEIF_BRANDS.has(ascii(prefix, 8, 4))) return true;
  const available = Math.min(boxLength, prefix.byteLength);
  for (let offset = 16; offset + 4 <= available; offset += 4) {
    if (HEIF_BRANDS.has(ascii(prefix, offset, 4))) return true;
  }
  return false;
}

interface DetectedImage {
  readonly mediaType: NativeImageMediaType | 'image/heif';
  readonly width: number | null;
  readonly height: number | null;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensionsWithPayload(prefix: Uint8Array): readonly [number, number] | null {
  let offset = 2;
  let dimensions: readonly [number, number] | null = null;
  while (offset < prefix.byteLength) {
    if (prefix[offset] !== 0xff) return null;
    while (offset < prefix.byteLength && prefix[offset] === 0xff) offset += 1;
    if (offset >= prefix.byteLength) return null;
    const marker = prefix[offset++]!;
    if (marker === 0xd9 || marker === 0xd8 || marker === 0x00) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = uint16be(prefix, offset);
    if (segmentLength === null || segmentLength < 2 || offset + segmentLength > prefix.byteLength) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = uint16be(prefix, offset + 3);
      const width = uint16be(prefix, offset + 5);
      if (segmentLength < 7 || width === null || height === null || width < 1 || height < 1) return null;
      dimensions = [width, height];
    }
    if (marker === 0xda) {
      if (dimensions === null || segmentLength < 8) return null;
      const componentCount = prefix[offset + 2];
      if (componentCount === undefined || componentCount < 1 || segmentLength !== 6 + 2 * componentCount) return null;
      let scanOffset = offset + segmentLength;
      let entropyBytes = 0;
      while (scanOffset < prefix.byteLength) {
        if (prefix[scanOffset] !== 0xff) {
          entropyBytes += 1;
          scanOffset += 1;
          continue;
        }
        while (scanOffset < prefix.byteLength && prefix[scanOffset] === 0xff) scanOffset += 1;
        if (scanOffset >= prefix.byteLength) break;
        const scanMarker = prefix[scanOffset++]!;
        if (scanMarker === 0x00) {
          entropyBytes += 1;
          continue;
        }
        if (scanMarker >= 0xd0 && scanMarker <= 0xd7) continue;
        if (scanMarker === 0xd9) return entropyBytes > 0 ? dimensions : null;
        // A later progressive scan or table marker is valid only after this
        // scan has carried some entropy-coded image data.
        return entropyBytes > 0 ? dimensions : null;
      }
      return entropyBytes > 0 ? dimensions : null;
    }
    offset += segmentLength;
  }
  return null;
}

function pngDimensions(prefix: Uint8Array, byteLength: number): readonly [number, number] | null {
  if (uint32be(prefix, 8) !== 13 || ascii(prefix, 12, 4) !== 'IHDR') return null;
  const width = uint32be(prefix, 16);
  const height = uint32be(prefix, 20);
  if (width === null || height === null || width < 1 || height < 1) return null;
  let offset = 8;
  let sawNonEmptyIdat = false;
  for (;;) {
    const chunkLength = uint32be(prefix, offset);
    const chunkKind = ascii(prefix, offset + 4, 4);
    if (chunkLength === null || chunkKind.length !== 4) return null;
    const chunkEnd = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > byteLength) return null;
    if (chunkKind === 'IDAT' && chunkLength > 0) sawNonEmptyIdat = true;
    if (chunkEnd > prefix.byteLength) return sawNonEmptyIdat ? [width, height] : null;
    if (chunkKind === 'IEND') return chunkLength === 0 && sawNonEmptyIdat && chunkEnd === byteLength
      ? [width, height]
      : null;
    offset = chunkEnd;
  }
}

function gifHasImagePayload(prefix: Uint8Array, byteLength: number): boolean {
  const packed = prefix[10];
  if (packed === undefined) return false;
  const hasGlobalColorTable = (packed & 0x80) !== 0;
  let offset = 13 + (hasGlobalColorTable ? 3 * (2 ** ((packed & 0x07) + 1)) : 0);
  while (offset < prefix.byteLength) {
    const kind = prefix[offset];
    if (kind === 0x2c) {
      const width = uint16le(prefix, offset + 5);
      const height = uint16le(prefix, offset + 7);
      const imagePacked = prefix[offset + 9];
      if (width === null || height === null || width < 1 || height < 1 || imagePacked === undefined) return false;
      const hasLocalColorTable = (imagePacked & 0x80) !== 0;
      offset += 10 + (hasLocalColorTable ? 3 * (2 ** ((imagePacked & 0x07) + 1)) : 0);
      if (!hasGlobalColorTable && !hasLocalColorTable) return false;
      const minimumCodeSize = prefix[offset];
      if (minimumCodeSize === undefined || minimumCodeSize < 2 || minimumCodeSize > 8) return false;
      offset += 1;
      let sawImageData = false;
      for (;;) {
        const blockLength = prefix[offset];
        if (blockLength === undefined) return byteLength > prefix.byteLength && sawImageData;
        offset += 1;
        if (blockLength === 0) return sawImageData;
        sawImageData = true;
        offset += blockLength;
        if (offset > prefix.byteLength) return byteLength > prefix.byteLength;
      }
    }
    if (kind !== 0x21 || offset + 2 > prefix.byteLength) return false;
    offset += 2;
    for (;;) {
      const blockLength = prefix[offset];
      if (blockLength === undefined) return false;
      offset += 1;
      if (blockLength === 0) break;
      offset += blockLength;
      if (offset > prefix.byteLength) return false;
    }
  }
  return false;
}

function webpBitstreamDimensions(
  prefix: Uint8Array,
  dataOffset: number,
  chunkLength: number,
  chunkKind: string,
): readonly [number, number] | null {
  if (chunkKind === 'VP8 ') {
    if (
      chunkLength <= 10 || dataOffset + 11 > prefix.byteLength ||
      prefix[dataOffset + 3] !== 0x9d || prefix[dataOffset + 4] !== 0x01 || prefix[dataOffset + 5] !== 0x2a
    ) return null;
    const width = (uint16le(prefix, dataOffset + 6) ?? 0) & 0x3fff;
    const height = (uint16le(prefix, dataOffset + 8) ?? 0) & 0x3fff;
    return width > 0 && height > 0 ? [width, height] : null;
  }
  if (chunkKind === 'VP8L') {
    if (chunkLength <= 5 || dataOffset + 6 > prefix.byteLength || prefix[dataOffset] !== 0x2f) return null;
    const b0 = prefix[dataOffset + 1]!;
    const b1 = prefix[dataOffset + 2]!;
    const b2 = prefix[dataOffset + 3]!;
    const b3 = prefix[dataOffset + 4]!;
    return [1 + b0 + ((b1 & 0x3f) << 8), 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10)];
  }
  return null;
}

function uint24le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 > bytes.byteLength) return null;
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function webpDimensionsWithPayload(prefix: Uint8Array, byteLength: number): readonly [number, number] | null {
  let offset = 12;
  let canvasDimensions: readonly [number, number] | null = null;
  while (offset + 8 <= prefix.byteLength) {
    const chunkKind = ascii(prefix, offset, 4);
    const chunkLength = uint32le(prefix, offset + 4);
    if (chunkLength === null) return null;
    const dataOffset = offset + 8;
    const chunkEnd = dataOffset + chunkLength;
    const paddedEnd = chunkEnd + (chunkLength & 1);
    if (!Number.isSafeInteger(paddedEnd) || paddedEnd > byteLength) return null;
    if (chunkKind === 'VP8X') {
      if (chunkLength !== 10 || chunkEnd > prefix.byteLength) return null;
      const widthMinusOne = uint24le(prefix, dataOffset + 4);
      const heightMinusOne = uint24le(prefix, dataOffset + 7);
      if (widthMinusOne === null || heightMinusOne === null) return null;
      canvasDimensions = [widthMinusOne + 1, heightMinusOne + 1];
    } else {
      const payloadDimensions = webpBitstreamDimensions(prefix, dataOffset, chunkLength, chunkKind);
      if (payloadDimensions !== null) return canvasDimensions ?? payloadDimensions;
      if (chunkKind === 'ANMF') {
        if (chunkLength <= 24 || dataOffset + 24 > prefix.byteLength) return null;
        let nestedOffset = dataOffset + 16;
        while (nestedOffset + 8 <= Math.min(chunkEnd, prefix.byteLength)) {
          const nestedKind = ascii(prefix, nestedOffset, 4);
          const nestedLength = uint32le(prefix, nestedOffset + 4);
          if (nestedLength === null) return null;
          const nestedDataOffset = nestedOffset + 8;
          const nestedEnd = nestedDataOffset + nestedLength;
          if (nestedEnd + (nestedLength & 1) > chunkEnd) return null;
          const nestedDimensions = webpBitstreamDimensions(prefix, nestedDataOffset, nestedLength, nestedKind);
          if (nestedDimensions !== null) return canvasDimensions ?? nestedDimensions;
          nestedOffset = nestedEnd + (nestedLength & 1);
        }
      }
    }
    if (paddedEnd > prefix.byteLength) return null;
    offset = paddedEnd;
  }
  return null;
}

function detectedImage(edges: SourceEdges): DetectedImage | null {
  const { prefix, suffix, byteLength } = edges;
  if (isHeifFamily(prefix)) return { mediaType: 'image/heif', width: null, height: null };
  if (byteLength >= 4 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) {
    const dimensions = jpegDimensionsWithPayload(prefix);
    if (suffix.byteLength >= 2 && suffix.at(-2) === 0xff && suffix.at(-1) === 0xd9 && dimensions !== null) {
      return { mediaType: 'image/jpeg', width: dimensions[0], height: dimensions[1] };
    }
    throw new NativeImageAdmissionError('image-content-invalid', 'JPEG画像が不完全なため追加できません。');
  }
  if (
    byteLength >= 20 && prefix[0] === 0x89 && prefix[1] === 0x50 && prefix[2] === 0x4e && prefix[3] === 0x47 &&
    prefix[4] === 0x0d && prefix[5] === 0x0a && prefix[6] === 0x1a && prefix[7] === 0x0a
  ) {
    const iend = new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    const dimensions = pngDimensions(prefix, byteLength);
    if (
      dimensions !== null && suffix.byteLength >= iend.byteLength &&
      iend.every((value, index) => suffix[suffix.byteLength - iend.byteLength + index] === value)
    ) {
      return { mediaType: 'image/png', width: dimensions[0], height: dimensions[1] };
    }
    throw new NativeImageAdmissionError('image-content-invalid', 'PNG画像が不完全なため追加できません。');
  }
  const gifHeader = ascii(prefix, 0, 6);
  if (byteLength >= 14 && (gifHeader === 'GIF87a' || gifHeader === 'GIF89a')) {
    const width = (prefix[6] ?? 0) | ((prefix[7] ?? 0) << 8);
    const height = (prefix[8] ?? 0) | ((prefix[9] ?? 0) << 8);
    if (width > 0 && height > 0 && suffix.at(-1) === 0x3b && gifHasImagePayload(prefix, byteLength)) {
      return { mediaType: 'image/gif', width, height };
    }
    throw new NativeImageAdmissionError('image-content-invalid', 'GIF画像が不完全なため追加できません。');
  }
  if (byteLength >= 20 && ascii(prefix, 0, 4) === 'RIFF' && ascii(prefix, 8, 4) === 'WEBP') {
    const riffLength = uint32le(prefix, 4);
    const dimensions = webpDimensionsWithPayload(prefix, byteLength);
    if (
      riffLength !== null && riffLength + 8 === byteLength && dimensions !== null
    ) return { mediaType: 'image/webp', width: dimensions[0], height: dimensions[1] };
    throw new NativeImageAdmissionError('image-content-invalid', 'WebP画像が不完全なため追加できません。');
  }
  return null;
}

function declaredMediaType(value: string): string {
  return value.trim().toLowerCase().split(';', 1)[0] ?? '';
}

function hintedMediaType(filename: string): NativeImageMediaType | 'image/heif' | null {
  const lower = filename.trim().toLowerCase();
  if (/\.(?:heic|heif|heix)$/u.test(lower)) return 'image/heif';
  if (/\.(?:jpe?g|jfif)$/u.test(lower)) return 'image/jpeg';
  if (/\.png$/u.test(lower)) return 'image/png';
  if (/\.gif$/u.test(lower)) return 'image/gif';
  if (/\.webp$/u.test(lower)) return 'image/webp';
  return null;
}

/**
 * Determines the bounded candidate image family from bytes. It is deliberately
 * not a decoder or a claim that every pixel is valid; malformed envelopes fail
 * before any Native publication and browser decode still reports display errors.
 */
export async function inspectNativeImageSource(
  source: RestartableByteSource & { readonly mediaType: string },
  options: {
    readonly filenameHint?: string;
    readonly requireCanonicalDeclaration?: boolean;
    readonly signal?: AbortSignal;
  } = {},
): Promise<NativeImageAdmission> {
  if (!Number.isSafeInteger(source.size) || source.size < 1) {
    throw new NativeImageAdmissionError('image-content-invalid', '空または大きさを確認できない画像は追加できません。');
  }
  const edges = await inspectSourceEdges(source, options.signal);
  if (edges.byteLength !== source.size) {
    throw new NativeImageAdmissionError('image-content-invalid', '選択した画像の大きさが読み取り中に変化しました。');
  }
  const detected = detectedImage(edges);
  const declared = declaredMediaType(source.mediaType);
  const hinted = hintedMediaType(options.filenameHint ?? '');
  if (detected?.mediaType === 'image/heif' || declared === 'image/heic' || declared === 'image/heif' || hinted === 'image/heif') {
    throw new NativeImageAdmissionError('heic-device-conversion-required', HEIC_DEVICE_CONVERSION_GUIDANCE);
  }
  if (detected === null) {
    throw new NativeImageAdmissionError(
      'unsupported-image-content',
      '画像の内容を確認できませんでした。PNG、JPEG、WebP、GIFのいずれかを選んでください。',
    );
  }
  const declarationIsOptional = declared === '' || declared === 'application/octet-stream';
  if ((!declarationIsOptional && declared !== detected.mediaType) || (hinted !== null && hinted !== detected.mediaType)) {
    throw new NativeImageAdmissionError(
      'image-declaration-conflict',
      'ファイル名または画像形式の情報と、実際の画像内容が一致しないため追加しませんでした。',
    );
  }
  if (options.requireCanonicalDeclaration === true && declared !== detected.mediaType) {
    throw new NativeImageAdmissionError(
      'image-declaration-conflict',
      '保存データの画像形式と、実際の画像内容が一致しないため読み込みませんでした。',
    );
  }
  return {
    mediaType: detected.mediaType,
    width: detected.width!,
    height: detected.height!,
    byteLength: edges.byteLength,
    sha256: edges.sha256,
  };
}
