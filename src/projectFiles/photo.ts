import { inspectValidationImage, type JpegDecoder } from './jpeg';
import type { PngDecoder } from './png';
import { checkFileLimits, fileError, type FileValidationLimits } from './validation';

export type PhotoMime = 'image/webp' | 'image/gif';
export interface DecodedPhoto { readonly width: number; readonly height: number; close(): void }
export type PhotoDecoder = (bytes: Uint8Array, mime: PhotoMime) => Promise<DecodedPhoto>;
export const browserPhotoDecoder: PhotoDecoder = async (bytes, mime) => {
  if (typeof createImageBitmap !== 'function') return fileError('このブラウザでは画像の内容を検証できません。');
  return createImageBitmap(new Blob([bytes.slice().buffer], { type: mime }), {
    imageOrientation: 'from-image', colorSpaceConversion: 'default', premultiplyAlpha: 'none',
  });
};
const ascii = (bytes: Uint8Array, at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
export const isAdditionalPhoto = (bytes: Uint8Array) =>
  ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP' || /^GIF8[79]a$/.test(ascii(bytes, 0, 6));
/** Fresh-selection refusal guidance only; never a format-admission or retained-read proof. */
export function freshPhotoSelectionIssue(bytes: Uint8Array): string | null {
  // Keep even damaged familiar image prefixes on their existing strict diagnostic path.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 || ascii(bytes, 0, 4) === '\x89PNG' ||
    ascii(bytes, 0, 4) === 'RIFF' || ascii(bytes, 0, 4) === 'GIF8') return null;
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return null;
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (size < 16 || size > bytes.length || size % 4) return null;
  const brands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
  const known = (at: number) => brands.includes(ascii(bytes, at, 4));
  if (!known(8)) {
    let found = false;
    for (let at = 16; at + 4 <= Math.min(size, 128); at += 4) if (known(at)) { found = true; break; }
    if (!found) return null;
  }
  return 'HEIC/HEIF画像は直接読み込めません。元の画像を残し、端末で別のJPEGを書き出して選び直してください。';
}
const bad = (): never => fileError('WebP/GIFの構造が不正か、この検証の上限を超えています。');

/** Complete container framing; compressed pixels stay with the actual decoder. */
export function photoStructure(bytes: Uint8Array, limits: FileValidationLimits) {
  checkFileLimits(limits); if (bytes.length > limits.maxFileBytes) return bad();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let work = bytes.length, items = 0;
  const charge = (n = 1) => { work += n; if (!Number.isSafeInteger(work) || work > limits.maxValues) return bad(); };
  const item = () => { if (++items > limits.maxItems) return bad(); };
  const pixels = (w: number, h: number) => { if (!w || !h || !Number.isSafeInteger(w * h) || w * h > limits.maxPixels) return bad(); };
  const u16 = (at: number) => view.getUint16(at, true);
  const u24 = (at: number) => bytes[at]! + bytes[at + 1]! * 256 + bytes[at + 2]! * 65536;
  charge(0);
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    if (bytes.length < 20 || view.getUint32(4, true) !== bytes.length - 8 || bytes.length % 2) return bad();
    type Chunk = { type: string; start: number; end: number };
    const chunks = (start: number, end: number): Chunk[] => {
      const result: Chunk[] = [];
      while (start < end) {
        item(); if (start + 8 > end) return bad();
        const size = view.getUint32(start + 4, true), next = start + 8 + size, padded = next + size % 2;
        if (padded > end || size % 2 && bytes[next] !== 0) return bad();
        result.push({ type: ascii(bytes, start, 4), start: start + 8, end: next }); start = padded;
      }
      return result;
    };
    const bitmap = (c: Chunk) => {
      const n = c.end - c.start, p = c.start;
      if (c.type === 'VP8L') {
        if (n < 6 || bytes[p] !== 0x2f) return bad();
        const bits = view.getUint32(p + 1, true); if (bits >>> 29) return bad();
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: false /* VP8L alpha_is_used is a non-authoritative decoder hint. */ };
      }
      if (c.type !== 'VP8 ' || n < 11 || (bytes[p]! & 1) || (bytes[p]! >> 1 & 7) > 3 || !(bytes[p]! & 16) ||
        ascii(bytes, p + 3, 3) !== '\x9d\x01\x2a' || u24(p) >>> 5 > n - 10) return bad();
      return { width: u16(p + 6) & 0x3fff, height: u16(p + 8) & 0x3fff, alpha: false };
    };
    const known = new Set(['VP8X', 'ICCP', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L', 'EXIF', 'XMP ']);
    const frame = (cs: Chunk[], w: number, h: number) => {
      let alpha: Chunk | undefined, image: ReturnType<typeof bitmap> | undefined;
      for (const c of cs) {
        if (c.type === 'ALPH') { if (alpha || image || c.end - c.start < 2 || (bytes[c.start]! & 3) > 1 || (bytes[c.start]! >> 4 & 3) > 1) return bad(); alpha = c; }
        else if (c.type === 'VP8 ' || c.type === 'VP8L') {
          if (image || alpha && c.type === 'VP8L') return bad(); image = bitmap(c);
          if (image.width !== w || image.height !== h) return bad();
        } else if (known.has(c.type)) return bad();
      }
      if (!image || alpha && (bytes[alpha.start]! & 3) === 0 && alpha.end - alpha.start !== 1 + w * h) return bad();
      return !!alpha || image.alpha;
    };
    const cs = chunks(12, bytes.length), x = cs[0]!;
    if (x.type !== 'VP8X') {
      const image = bitmap(x); pixels(image.width, image.height); charge(image.width * image.height);
      if (cs.slice(1).some(c => known.has(c.type))) return bad();
      return { ...image, mime: 'image/webp' as const, frames: 1 };
    }
    if (x.end - x.start !== 10) return bad();
    const flags = bytes[x.start]!, width = u24(x.start + 4) + 1, height = u24(x.start + 7) + 1;
    pixels(width, height); if (width * height > 0xffffffff) return bad();
    let anim = false, frames = 0, alpha = false, icc = false, exif = false, xmp = false;
    const still: Chunk[] = [];
    for (const c of cs.slice(1)) {
      if (c.type === 'VP8X') return bad();
      if (c.type === 'ICCP') { if (icc || frames || still.length || anim) return bad(); icc = true; }
      else if (c.type === 'EXIF') exif = true;
      else if (c.type === 'XMP ') xmp = true;
      else if (c.type === 'ANIM') { if (!(flags & 2) || anim || frames || still.length || c.end - c.start !== 6) return bad(); anim = true; }
      else if (c.type === 'ANMF') {
        if (!anim || still.length || c.end - c.start < 16) return bad();
        const p = c.start, w = u24(p + 6) + 1, h = u24(p + 9) + 1;
        if (u24(p) * 2 + w > width || u24(p + 3) * 2 + h > height) return bad();
        charge(width * height); alpha = frame(chunks(p + 16, c.end), w, h) || alpha; frames++;
      } else if (['ALPH', 'VP8 ', 'VP8L'].includes(c.type)) { if (flags & 2) return bad(); still.push(c); }
    }
    if (!(flags & 2)) { alpha = frame(still, width, height); charge(width * height); frames = 1; }
    if (!frames || !!(flags & 2) !== anim || !!(flags & 32) !== icc || !!(flags & 8) !== exif || !!(flags & 4) !== xmp || alpha && !(flags & 16)) return bad();
    return { width, height, mime: 'image/webp' as const, frames };
  }
  if (!/^GIF8[79]a$/.test(ascii(bytes, 0, 6)) || bytes.length < 14) return bad();
  const width = u16(6), height = u16(8); pixels(width, height);
  let at = 13, frames = 0, control: { transparent: number | undefined } | undefined;
  const take = (n: number) => { if (at + n > bytes.length) return bad(); const p = at; at += n; return p; };
  const palette = (packed: number) => packed & 128 ? 1 << ((packed & 7) + 1) : 0;
  const global = palette(bytes[10]!); take(global * 3);
  if (global && bytes[11]! >= global) return bad();
  const blocks = () => { let count = 0; for (;;) { item(); const n = bytes[take(1)]!; if (!n) return count; take(n); count += n; } };
  while (at < bytes.length) {
    item(); const marker = bytes[take(1)];
    if (marker === 0x3b) { if (at !== bytes.length || !frames || control) return bad(); return { width, height, mime: 'image/gif' as const, frames }; }
    if (marker === 0x2c) {
      const p = take(9), w = u16(p + 4), h = u16(p + 6), packed = bytes[p + 8]!, local = palette(packed);
      if (!w || !h || u16(p) + w > width || u16(p + 2) + h > height || packed & 24) return bad();
      take(local * 3); const colors = local || global;
      if (!colors || control?.transparent !== undefined && control.transparent >= colors) return bad();
      const codeSize = bytes[take(1)]!; if (codeSize < 2 || codeSize > 8 || !blocks()) return bad();
      charge(width * height); frames++; control = undefined; continue;
    }
    if (marker !== 0x21) return bad(); const label = bytes[take(1)];
    if (label === 0xf9) {
      if (control || bytes[take(1)] !== 4) return bad(); const p = take(4), flags = bytes[p]!;
      if (flags & 224 || (flags >> 2 & 7) > 3 || bytes[take(1)] !== 0) return bad();
      control = { transparent: flags & 1 ? bytes[p + 3] : undefined };
    } else if (label === 0xff) { if (bytes[take(1)] !== 11) return bad(); take(11); blocks(); }
    else if (label === 0x01) {
      if (bytes[take(1)] !== 12 || !global) return bad(); const p = take(12);
      if (!u16(p + 4) || !u16(p + 6) || u16(p) + u16(p + 4) > width || u16(p + 2) + u16(p + 6) > height ||
        !bytes[p + 8] || !bytes[p + 9] || bytes[p + 10]! >= global || bytes[p + 11]! >= global || control?.transparent !== undefined && control.transparent >= global) return bad();
      blocks(); control = undefined;
    } else { blocks(); if (label! <= 0x7f) control = undefined; }
  }
  return bad();
}

export async function inspectValidationPhoto(input: Uint8Array, limits: FileValidationLimits, decode: PhotoDecoder = browserPhotoDecoder) {
  checkFileLimits(limits); if (input.length > limits.maxFileBytes) return bad();
  const bytes = input.slice(), shape = photoStructure(bytes, limits); let bitmap: DecodedPhoto | undefined;
  try {
    bitmap = await decode(bytes, shape.mime);
    if (!(bitmap.width === shape.width && bitmap.height === shape.height || shape.mime === 'image/webp' && bitmap.width === shape.height && bitmap.height === shape.width)) return bad();
  } catch { return fileError('WebP/GIFの画像を表示できません。'); }
  finally { bitmap?.close(); }
  return shape;
}
export async function inspectProjectImage(bytes: Uint8Array, limits: FileValidationLimits, png?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder) {
  if (isAdditionalPhoto(bytes)) return (await inspectValidationPhoto(bytes, limits, photo)).mime;
  return inspectValidationImage(bytes, limits, png, jpeg);
}
export const projectImageMime = (mime: unknown): mime is 'image/png' | 'image/jpeg' | PhotoMime =>
  mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/gif';
