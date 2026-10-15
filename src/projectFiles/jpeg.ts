import { checkFileLimits, fileError, type FileValidationLimits } from './validation';
import { inspectValidationPng, type PngDecoder } from './png';

export type JpegUse = 'photo' | 'glb-texture';
export interface DecodedJpeg { readonly width: number; readonly height: number; close(): void }
export type JpegDecoder = (bytes: Uint8Array, use: JpegUse) => Promise<DecodedJpeg>;
export const browserJpegDecoder: JpegDecoder = async (bytes, use) => {
  if (typeof createImageBitmap !== 'function') return fileError('このブラウザでは画像の内容を検証できません。');
  return createImageBitmap(new Blob([bytes.slice().buffer], { type: 'image/jpeg' }), {
    imageOrientation: 'from-image', colorSpaceConversion: use === 'photo' ? 'default' : 'none', premultiplyAlpha: 'none',
  });
};
export const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8;
const bad = (): never => fileError('JPEGの内容が不正か、未対応の形式です。');

/** Only primary orientation is authority. Other metadata remains original opaque bytes. */
function exifOrientation(bytes: Uint8Array, charge: (n?: number) => void): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8) return bad();
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) return bad();
  const range = (offset: number, size: number) => { if (!Number.isSafeInteger(size) || offset < 0 || offset + size > bytes.length) bad(); };
  const u16 = (offset: number) => { range(offset, 2); return view.getUint16(offset, little); };
  const u32 = (offset: number) => { range(offset, 4); return view.getUint32(offset, little); };
  if (u16(2) !== 42) return bad();
  let next = u32(4), primary = true, orientation = 1; const seen = new Set<number>();
  if (next < 8) return bad();
  while (next) {
    charge(); if (next < 8 || seen.has(next)) return bad(); seen.add(next);
    const count = u16(next); range(next + 2, count * 12 + 4); charge(count);
    let found = false;
    for (let i = 0; i < count; i++) {
      const at = next + 2 + i * 12, tag = u16(at), type = u16(at + 2), length = u32(at + 4);
      const unit = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type];
      // Bounds on known TIFF value containers, without interpreting MakerNote/GPS/XMP.
      if (unit && length * unit > 4) range(u32(at + 8), length * unit);
      if (primary && tag === 0x0112) {
        if (found || type !== 3 || length !== 1) return bad(); found = true; orientation = u16(at + 8);
        if (orientation < 1 || orientation > 8) return bad();
      }
    }
    next = u32(next + 2 + count * 12); primary = false;
  }
  return orientation;
}

/** Bounded codestream framing and scan references; pixel/entropy decoding belongs to the actual decoder. */
export function jpegStructure(bytes: Uint8Array, limits: FileValidationLimits, use: JpegUse) {
  checkFileLimits(limits);
  if (bytes.length > limits.maxFileBytes || !isJpeg(bytes)) return bad();
  let at = 2, items = 0, work = 0, frame = 0, width = 0, height = 0, orientation = 1, exif = false, jfif = false, scans = 0, interval = 0;
  let adobe: number | undefined;
  const charge = (n = 1) => { work += n; if (!Number.isSafeInteger(work) || work > limits.maxValues) bad(); };
  const quant = new Map<number, { precision: number; values: string }>(), huffman = new Map<string, number[]>();
  const components = new Map<number, { q: number; blocks: number; precision: number[]; quant?: string }>();
  const u16 = (offset: number) => bytes[offset]! * 256 + bytes[offset + 1]!;
  while (at < bytes.length) {
    if (++items > limits.maxItems || bytes[at++] !== 0xff) return bad();
    while (bytes[at] === 0xff) { charge(); at++; }
    const marker = bytes[at++]; if (marker === undefined || marker === 0 || marker === 0xd8 || marker >= 0xd0 && marker <= 0xd7) return bad();
    if (marker === 0xd9) {
      if (at !== bytes.length || !frame || !scans || [...components.values()].some(c => c.precision[0] === -1)) return bad();
      if (use === 'glb-texture' && (!jfif || orientation !== 1 || [...components.keys()].some((id, index) => id !== index + 1))) return bad();
      if (adobe !== undefined && (adobe > 1 || components.size === 1 && adobe !== 0 || use === 'glb-texture' && components.size === 3 && adobe !== 1)) return bad();
      if (use === 'photo' && !jfif && !exif) return bad();
      return { width, height, orientation };
    }
    if (at + 2 > bytes.length) return bad();
    const size = u16(at), start = at + 2, end = at + size;
    if (size < 2 || end > bytes.length) return bad(); at = end; charge(size);
    const data = bytes.subarray(start, end);
    if (marker >= 0xe0 && marker <= 0xef || marker === 0xfe) {
      if (marker === 0xe0 && data.length >= 5 && data.subarray(0, 5).every((n, i) => n === [74, 70, 73, 70, 0][i])) {
        if (jfif || start !== 6 || data.length < 14 || data[5] !== 1 || data[7]! > 2 || !u16(start + 8) || !u16(start + 10) || data.length !== 14 + 3 * data[12]! * data[13]!) return bad();
        jfif = true;
      }
      if (marker === 0xe1 && data.length >= 6 && data.subarray(0, 6).every((n, i) => n === [69, 120, 105, 102, 0, 0][i])) {
        if (exif) return bad(); exif = true; orientation = exifOrientation(data.subarray(6), charge);
      }
      // Adobe's declared transform cannot contradict the accepted JFIF Y/YCbCr layout.
      if (marker === 0xee && data.length >= 5 && data.subarray(0, 5).every((n, i) => n === [65, 100, 111, 98, 101][i])) {
        if (data.length !== 12 || adobe !== undefined && adobe !== data[11]) return bad(); adobe = data[11]!;
      }
      continue;
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (frame || data.length < 6 || data[0] !== 8 || ![1, 3].includes(data[5]!)) return bad();
      frame = marker; height = u16(start + 1); width = u16(start + 3);
      if (!width || !height || width * height > limits.maxPixels || data.length !== 6 + 3 * data[5]!) return bad();
      for (let i = 6; i < data.length; i += 3) {
        const id = data[i]!, h = data[i + 1]! >> 4, v = data[i + 1]! & 15, q = data[i + 2]!;
        if (components.has(id) || !h || h > 4 || !v || v > 4 || q > 3) return bad();
        components.set(id, { q, blocks: h * v, precision: Array(64).fill(-1) });
      }
      if (frame === 0xc0 && [...huffman.keys()].some(key => Number(key.split('/')[1]) > 1)) return bad(); continue;
    }
    if (marker === 0xdb) {
      let i = 0;
      while (i < data.length) {
        const info = data[i++]!, precision = info >> 4, id = info & 15, length = 64 * (precision + 1);
        if (precision > 1 || id > 3 || i + length > data.length) return bad();
        const values = data.subarray(i, i + length);
        for (let n = 0; n < length; n += precision + 1) if (!(precision ? values[n]! * 256 + values[n + 1]! : values[n]!)) return bad();
        quant.set(id, { precision, values: Array.from(values).join(',') }); i += length;
      }
      if (!i) return bad(); continue;
    }
    if (marker === 0xc4) {
      let i = 0;
      while (i < data.length) {
        const info = data[i++]!, kind = info >> 4, id = info & 15;
        if (kind > 1 || id > 3 || frame === 0xc0 && id > 1 || i + 16 > data.length) return bad();
        let count = 0, available = 1;
        for (let n = 0; n < 16; n++) { const k = data[i++]!; count += k; available = available * 2 - k; if (available < 0) return bad(); }
        if (!count || count > 256 || i + count > data.length || available === 0) return bad();
        huffman.set(`${kind}/${id}`, Array.from(data.subarray(i, i + count))); i += count;
      }
      if (!i) return bad(); continue;
    }
    if (marker === 0xdd) { if (data.length !== 2) return bad(); interval = u16(start); continue; }
    if (marker !== 0xda || !frame || data.length < 4) return bad();
    const count = data[0]!;
    if (!count || count > components.size || data.length !== 1 + 2 * count + 3) return bad();
    const ss = data[data.length - 3]!, se = data[data.length - 2]!, ah = data[data.length - 1]! >> 4, al = data[data.length - 1]! & 15;
    if (ss > se || se > 63 || ah > 13 || al > 13 || (frame !== 0xc2 ? ss !== 0 || se !== 63 || ah !== 0 || al !== 0 : ss === 0 ? se !== 0 : count !== 1)) return bad();
    const scan = new Set<number>(); let blocks = 0;
    for (let i = 0; i < count; i++) {
      const id = data[1 + 2 * i]!, tables = data[2 + 2 * i]!, dc = tables >> 4, ac = tables & 15, c = components.get(id);
      if (!c || scan.has(id) || dc > 3 || ac > 3 || frame === 0xc0 && (dc > 1 || ac > 1)) return bad(); scan.add(id); blocks += c.blocks;
      const q = quant.get(c.q);
      if (!q || q.precision !== 0 || c.quant !== undefined && c.quant !== `${q.precision}/${q.values}`) return bad();
      c.quant = `${q.precision}/${q.values}`;
      if (ss > 0 && c.precision[0] === -1) return bad();
      for (let coefficient = ss; coefficient <= se; coefficient++) {
        if (ah === 0 ? c.precision[coefficient] !== -1 : ah !== al + 1 || c.precision[coefficient] !== ah) return bad(); c.precision[coefficient] = al;
      }
      const dcValues = huffman.get(`0/${dc}`), acValues = huffman.get(`1/${ac}`);
      if (ss === 0 && ah === 0 && (!dcValues || dcValues.some(n => n > 11)) || se > 0 && (!acValues || acValues.some(n => (n & 15) > 10 || frame !== 0xc2 && (n & 15) === 0 && n !== 0 && n !== 0xf0))) return bad();
    }
    if (count > 1 && blocks > 10) return bad();
    scans++; let entropy = 0, restart = 0;
    while (at < bytes.length) {
      charge(); if (bytes[at++] !== 0xff) { entropy++; continue; }
      const markerAt = at - 1; let fill = false;
      while (bytes[at] === 0xff) { charge(); at++; fill = true; }
      const code = bytes[at]; if (code === undefined) return bad();
      if (code === 0) { if (fill) return bad(); at++; entropy++; continue; }
      if (code >= 0xd0 && code <= 0xd7) {
        if (!interval || code !== 0xd0 + restart || !entropy) return bad(); restart = (restart + 1) % 8; at++; entropy = 0; continue;
      }
      at = markerAt; break;
    }
    if (!entropy) return bad();
  }
  return bad();
}

export async function inspectValidationJpeg(input: Uint8Array, limits: FileValidationLimits, use: JpegUse, decode: JpegDecoder = browserJpegDecoder) {
  checkFileLimits(limits); if (input.length > limits.maxFileBytes) return bad();
  const bytes = input.slice(), structure = jpegStructure(bytes, limits, use), swapped = use === 'photo' && structure.orientation >= 5;
  const width = swapped ? structure.height : structure.width, height = swapped ? structure.width : structure.height;
  let image: DecodedJpeg | undefined;
  try { image = await decode(bytes, use); if (image.width !== width || image.height !== height) return fileError('JPEGの表示サイズが一致しません。'); }
  catch { return fileError('JPEGの画像を表示できません。'); }
  finally { image?.close(); }
  return { width, height, orientation: structure.orientation };
}

/** Fresh owned image selection; declarations on retained records are checked separately. */
export async function inspectValidationImage(bytes: Uint8Array, limits: FileValidationLimits, png?: PngDecoder, jpeg?: JpegDecoder) {
  if (isJpeg(bytes)) { await inspectValidationJpeg(bytes, limits, 'photo', jpeg); return 'image/jpeg' as const; }
  await inspectValidationPng(bytes, limits, png); return 'image/png' as const;
}
