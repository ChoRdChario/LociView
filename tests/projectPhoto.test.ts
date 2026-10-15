import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserPhotoDecoder, inspectValidationPhoto, inspectProjectImage, photoStructure, freshPhotoSelectionIssue } from '../src/projectFiles/photo';
import { photoBytes, photoFixtures } from './helpers/photoFixtures';
import { digest } from '../src/projectMetadata/persistence';
import type { FileValidationLimits } from '../src/projectFiles/validation';

const limits: FileValidationLimits = { maxFileBytes: 100000, maxJsonBytes: 10000, maxItems: 1000, maxValues: 100000, maxPixels: 10000 };
const concat = (...parts: Uint8Array[]) => { const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { b.set(p, at); at += p.length; } return b; };
const ascii = (s: string) => new TextEncoder().encode(s);
function chunk(type: string, payload: Uint8Array) {
  const b = new Uint8Array(8 + payload.length + payload.length % 2); b.set(ascii(type)); new DataView(b.buffer).setUint32(4, payload.length, true); b.set(payload, 8); return b;
}
function riff(...chunks: Uint8Array[]) { const b = concat(ascii('RIFF'), new Uint8Array(4), ascii('WEBP'), ...chunks); new DataView(b.buffer).setUint32(4, b.length - 8, true); return b; }
function chunks(bytes: Uint8Array) { const out: Uint8Array[] = []; for (let p = 12; p < bytes.length;) { const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(p + 4, true); out.push(bytes.slice(p, p + 8 + n + n % 2)); p += 8 + n + n % 2; } return out; }
const bitmap = (width = 8, height = 4) => ({ width, height, close: vi.fn() });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('07e owned photo containers and first/default bitmap admission (not browser animation evidence)', () => {
  it('gives only bounded fresh HEIF hints without admitting or changing shared inspection', async () => {
    const heif = new Uint8Array(24); new DataView(heif.buffer).setUint32(0,24); heif.set(ascii('ftypheic'),4);
    expect(freshPhotoSelectionIssue(heif)).toContain('端末で別のJPEG');
    const compatible = heif.slice(); compatible.set(ascii('isom'),8); compatible.set(ascii('mif1'),16);
    expect(freshPhotoSelectionIssue(compatible)).toContain('元の画像を残し');
    const offset = concat(new Uint8Array(3),compatible).subarray(3); expect(freshPhotoSelectionIssue(offset)).toBe(freshPhotoSelectionIssue(compatible));
    const unknown = heif.slice(); unknown.set(ascii('avif'),8); expect(freshPhotoSelectionIssue(unknown)).toBeNull();
    for (const bytes of [ascii('hevc'), heif.slice(0,15)]) expect(freshPhotoSelectionIssue(bytes)).toBeNull();
    const late = new Uint8Array(140); new DataView(late.buffer).setUint32(0,140); late.set(ascii('ftypisom'),4); late.set(ascii('heic'),132);
    expect(freshPhotoSelectionIssue(late)).toBeNull();
    const decode = vi.fn(async () => bitmap());
    const error = await inspectProjectImage(heif,limits,undefined,undefined,decode).catch(e => e as Error);
    expect(error).toBeInstanceOf(Error); expect((error as Error).message).not.toContain('HEIC'); expect(decode).not.toHaveBeenCalled();
  });
  it('preserves strict corrupt-image diagnostics before any fresh ftyp hint', () => {
    for (const magic of [new Uint8Array([0xff,0xd8,0xff]), ascii('\x89PNG'), ascii('RIFF'), ascii('GIF8')]) {
      const bytes = new Uint8Array(24); new DataView(bytes.buffer).setUint32(0,24); bytes.set(ascii('ftypheic'),4); bytes.set(magic);
      expect(freshPhotoSelectionIssue(bytes)).toBeNull();
    }
  });
  it.each(photoFixtures)('walks original compressed $name to EOF and closes the temporary decode', async fixture => {
    const bytes = photoBytes(fixture.name), image = bitmap(fixture.width, fixture.height), decode = vi.fn(async (_bytes: Uint8Array, _mime: string) => image);
    expect(await digest(bytes)).toBe(fixture.sha256);
    expect(photoStructure(bytes, limits)).toMatchObject({ width: fixture.width, height: fixture.height, frames: fixture.frames });
    expect(await inspectProjectImage(bytes, limits, undefined, undefined, decode)).toBe(fixture.name.startsWith('gif') ? 'image/gif' : 'image/webp');
    expect(decode).toHaveBeenCalledTimes(1); expect(decode.mock.calls[0]![0]).toEqual(bytes); expect(image.close).toHaveBeenCalledTimes(1);
    if (fixture.name === 'gif-interlaced') { const colors = 1 << ((bytes[10]! & 7) + 1); expect(bytes[13 + colors * 3 + 9]! & 64).toBe(64); }
  });
  it.each(photoFixtures)('rejects truncation/trailing of $name before decode', async fixture => {
    const bytes = photoBytes(fixture.name), decode = vi.fn(async () => bitmap());
    for (const b of [bytes.slice(0, -1), concat(bytes, new Uint8Array([0]))]) await expect(inspectValidationPhoto(b, limits, decode)).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it('keeps EXIF opaque, accepts only raw/transpose WebP dimensions and preserves the original Blob', async () => {
    const cs = chunks(photoBytes('webp-lossless-alpha')); const x = new Uint8Array(10); x[0] = 8; x[4] = 7; x[7] = 3; cs.unshift(chunk('VP8X', x));
    const bytes = riff(...cs, chunk('EXIF', ascii('opaque metadata, not TIFF')), chunk('????', new Uint8Array([1])));
    const swapped = bitmap(4, 8); await inspectValidationPhoto(bytes, limits, async () => swapped); expect(swapped.close).toHaveBeenCalledOnce();
    for (const dims of [[9, 4], [8, 5]]) { const image = bitmap(...dims as [number, number]); await expect(inspectValidationPhoto(bytes, limits, async () => image)).rejects.toThrow(); expect(image.close).toHaveBeenCalledOnce(); }
    let source: Blob | undefined, options: ImageBitmapOptions | undefined;
    const image = bitmap(4, 8); vi.stubGlobal('createImageBitmap', async (blob: Blob, opt: ImageBitmapOptions) => { source = blob; options = opt; return image; });
    await inspectValidationPhoto(bytes, limits, browserPhotoDecoder);
    expect(source!.type).toBe('image/webp'); expect(new Uint8Array(await source!.arrayBuffer())).toEqual(bytes);
    expect(options).toEqual({ imageOrientation: 'from-image', colorSpaceConversion: 'default', premultiplyAlpha: 'none' }); expect(image.close).toHaveBeenCalledOnce();
  });
  it('requires exact GIF canvas, actual decoder success and close on failure', async () => {
    const bytes = photoBytes('gif-animated'), image = bitmap(4, 8);
    await expect(inspectValidationPhoto(bytes, limits, async () => image)).rejects.toThrow(); expect(image.close).toHaveBeenCalledOnce();
    await expect(inspectValidationPhoto(bytes, limits, async () => { throw Error('unsupported'); })).rejects.toThrow('表示できません');
  });
  it('walks late animation frames and nested RIFF padding/reconstruction instead of only decoding the first', () => {
    const cs = chunks(photoBytes('webp-animated')), last = cs.at(-1)!; expect(new TextDecoder().decode(last.slice(0, 4))).toBe('ANMF');
    const bounds = last.slice(); bounds[8] = 9; expect(() => photoStructure(riff(...cs.slice(0, -1), bounds), limits)).toThrow();
    const frame = last.slice(8), nested = chunk('ANMF', concat(frame.slice(0, 16), frame.slice(16), frame.slice(16)));
    expect(() => photoStructure(riff(...cs.slice(0, -1), nested), limits)).toThrow();
    const odd = chunk('????', new Uint8Array([3])); odd[9] = 1; expect(() => photoStructure(riff(...cs, odd), limits)).toThrow();
    const duplicate = cs[0]!.slice(); expect(() => photoStructure(riff(...cs, duplicate), limits)).toThrow();
    const noAnimFlag = cs[0]!.slice(); noAnimFlag[8] = noAnimFlag[8]! & ~2; expect(() => photoStructure(riff(noAnimFlag, ...cs.slice(1)), limits)).toThrow();
  });
  it('does not promote the VP8L alpha hint into transparency authority', () => {
    const image = chunks(photoBytes('webp-lossless-alpha')).find(c => new TextDecoder().decode(c.slice(0, 4)) === 'VP8L')!.slice();
    image[12] = image[12]! | 16; const x = new Uint8Array(10); x[4] = 7; x[7] = 3;
    expect(photoStructure(riff(chunk('VP8X', x), image), limits)).toMatchObject({ width: 8, height: 4 });
  });
  it('consumes GCE at unknown graphic blocks but retains it across special-purpose extensions', () => {
    const bytes = photoBytes('gif-palette'), start = 13 + 3 * (1 << ((bytes[10]! & 7) + 1));
    const gce = (index: number) => new Uint8Array([0x21,0xf9,4,1,0,0,index,0]);
    const unknownGraphic = new Uint8Array([0x21,0x02,1,0x3b,0]), comment = new Uint8Array([0x21,0xfe,1,0x3b,0]);
    expect(photoStructure(concat(bytes.slice(0,start),gce(255),unknownGraphic,gce(0),bytes.slice(start)),limits).frames).toBe(1);
    expect(() => photoStructure(concat(bytes.slice(0,start),gce(255),comment,bytes.slice(start)),limits)).toThrow();
  });
  it('bounds every frame, item and inspected byte before bitmap allocation', async () => {
    const bytes = photoBytes('webp-animated'), decode = vi.fn(async () => bitmap());
    for (const patch of [{ maxFileBytes: bytes.length - 1 }, { maxItems: 2 }, { maxValues: bytes.length + 63 }, { maxPixels: 31 }]) await expect(inspectValidationPhoto(bytes, { ...limits, ...patch }, decode)).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it('validates late GIF block lengths, active palette references and terminal controls', () => {
    const bytes = photoBytes('gif-animated');
    for (const b of [concat(bytes.slice(0,-1),new Uint8Array([0x21,0xf9,4,0,0,0,0,0,0x3b])),concat(bytes.slice(0,-1),new Uint8Array([0x21,0xff,11,0x3b]))]) expect(() => photoStructure(b, limits)).toThrow();
    const size = 13 + 3 * (1 << ((bytes[10]! & 7) + 1)), descriptor = bytes.indexOf(0x2c,size), bad = bytes.slice(); bad[descriptor+1] = 9;
    expect(() => photoStructure(bad,limits)).toThrow();
  });
});
