import { describe, it, expect, vi } from 'vitest';
import { inspectValidationJpeg, jpegStructure, browserJpegDecoder } from '../src/projectFiles/jpeg';
import { digest } from '../src/projectMetadata/persistence';
import { jpegBytes, jpegFixtures } from './helpers/jpegFixtures';

const limits = { maxFileBytes: 1_000_000, maxJsonBytes: 100_000, maxItems: 10_000, maxValues: 1_000_000, maxPixels: 10_000 };
describe('bounded JPEG admission', () => {
  for (const name of Object.keys(jpegFixtures) as (keyof typeof jpegFixtures)[]) it(`validates real compressed ${name} with owned temporary decode`, async () => {
    const bytes = jpegBytes(name), fixture = jpegFixtures[name], close = vi.fn();
    expect(await digest(bytes)).toBe(fixture.sha256);
    const decode = vi.fn(async () => ({ width: fixture.width, height: fixture.height, close }));
    await expect(inspectValidationJpeg(bytes, limits, 'photo', decode)).resolves.toMatchObject({ width: fixture.width, height: fixture.height });
    expect(decode).toHaveBeenCalledWith(bytes, 'photo'); expect(close).toHaveBeenCalledOnce();
  });
  it('admits standard grayscale/progressive textures but refuses oriented and Exif-only textures before decode', async () => {
    const decode = vi.fn(async () => ({ width: 8, height: 4, close() {} }));
    for (const name of ['rgb-baseline', 'rgb-progressive', 'l-baseline', 'l-progressive'] as const)
      await expect(inspectValidationJpeg(jpegBytes(name), limits, 'glb-texture', decode)).resolves.toMatchObject({ width: 8, height: 4 });
    decode.mockClear();
    for (const name of ['rgb-exif-6', 'rgb-exif-only-6'] as const)
      await expect(inspectValidationJpeg(jpegBytes(name), limits, 'glb-texture', decode)).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it('rejects truncation, extra image, unsupported frame, broken scan references and budgets before decode', async () => {
    const bytes = jpegBytes('rgb-baseline'), frame = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xc0), scan = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xda);
    const unsupported = bytes.slice(); unsupported[frame + 1] = 0xc3;
    const missingComponent = bytes.slice(); missingComponent[scan + 5] = 99;
    const decode = vi.fn();
    for (const bad of [bytes.subarray(0, -1), new Uint8Array([...bytes, ...bytes]), unsupported, missingComponent])
      await expect(inspectValidationJpeg(bad, limits, 'photo', decode)).rejects.toThrow();
    expect(() => jpegStructure(bytes, { ...limits, maxPixels: 31 }, 'photo')).toThrow();
    expect(() => jpegStructure(bytes, { ...limits, maxItems: 1 }, 'photo')).toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it('closes mismatched decoded dimensions and propagates decoder failure without admission', async () => {
    const close = vi.fn();
    await expect(inspectValidationJpeg(jpegBytes('rgb-exif-6'), limits, 'photo', async () => ({ width: 8, height: 4, close }))).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
    await expect(inspectValidationJpeg(jpegBytes('rgb-baseline'), limits, 'photo', async () => { throw Error('decode'); })).rejects.toThrow();
  });
  it('keeps primary and thumbnail orientation separate and refuses duplicate primary containers even without a tag', () => {
    expect(jpegStructure(jpegBytes('rgb-primary-1-thumbnail-6'), limits, 'photo').orientation).toBe(1);
    const bytes = jpegBytes('rgb-exif-6'), offset = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xe1), end = offset + 2 + bytes[offset + 2]! * 256 + bytes[offset + 3]!;
    const duplicate = new Uint8Array([...bytes.subarray(0, end), ...bytes.subarray(offset, end), ...bytes.subarray(end)]);
    expect(() => jpegStructure(duplicate, limits, 'photo')).toThrow();
    const absent = bytes.slice(); absent[offset + 20] = 0x13; // valid opaque tag 0x0113, not primary Orientation.
    for (const second of [bytes, absent]) expect(() => jpegStructure(new Uint8Array([...absent.subarray(0, end), ...second.subarray(offset, end), ...absent.subarray(end)]), limits, 'photo')).toThrow();
    const bad = bytes.slice(), orientation = offset + 10 + 8 + 2 + 8; bad[orientation] = 9;
    expect(() => jpegStructure(bad, limits, 'photo')).toThrow();
  });
  it('charges marker and entropy fill and rejects 16-bit used quantization for every supported 8-bit frame', () => {
    const bytes = jpegBytes('rgb-extended-sequential'), at = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xdb), size = bytes[at + 2]! * 256 + bytes[at + 3]!, values = bytes.subarray(at + 5, at + 69);
    const table = new Uint8Array([0xff, 0xdb, 0, 131, 0x10, ...[...values].flatMap(v => [0, v])]);
    const changed = new Uint8Array([...bytes.subarray(0, at), ...table, ...bytes.subarray(at + 2 + size)]);
    expect(() => jpegStructure(changed, limits, 'photo')).toThrow();
    const fill = new Uint8Array([...bytes.subarray(0, 2), ...Array(2000).fill(255), ...bytes.subarray(2)]);
    expect(() => jpegStructure(fill, { ...limits, maxValues: 1000 }, 'photo')).toThrow();
    const scan = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xda), after = scan + 2 + bytes[scan + 2]! * 256 + bytes[scan + 3]!;
    const entropyFill = new Uint8Array([...bytes.subarray(0, after), 0, ...Array(2000).fill(255), 0xd9]);
    expect(() => jpegStructure(entropyFill, { ...limits, maxValues: 1000 }, 'photo')).toThrow();
  });
  it('accepts JFIF grayscale Adobe0 and ordered YCbCr Adobe1 while refusing contradictory transforms', () => {
    const insert = (bytes: Uint8Array, transform: number) => {
      const end = 4 + bytes[4]! * 256 + bytes[5]!;
      return new Uint8Array([...bytes.subarray(0, end), 255, 238, 0, 14, 65, 100, 111, 98, 101, 0, 100, 0, 0, 0, 0, transform, ...bytes.subarray(end)]);
    };
    expect(jpegStructure(insert(jpegBytes('l-baseline'), 0), limits, 'glb-texture')).toMatchObject({ width: 8, height: 4 });
    expect(jpegStructure(insert(jpegBytes('rgb-progressive'), 1), limits, 'glb-texture')).toMatchObject({ width: 8, height: 4 });
    expect(() => jpegStructure(insert(jpegBytes('rgb-baseline'), 0), limits, 'glb-texture')).toThrow();
    expect(() => jpegStructure(insert(jpegBytes('l-progressive'), 1), limits, 'glb-texture')).toThrow();
  });
  it('checks block budgets per interleaved scan and permits progressive DC-only completion', () => {
    // Framing/reference unit only: intentionally tiny entropy is never pixel-admission evidence.
    const bytes = jpegBytes('rgb-baseline'), frame = bytes.findIndex((b, i) => b === 255 && bytes[i + 1] === 0xc0), scan = bytes.findIndex((b, i) => b === 255 && bytes[i + 1] === 0xda);
    const header = bytes.slice(0, scan); header[frame + 1] = 0xc1;
    for (const offset of [11, 14, 17]) header[frame + offset] = 0x44;
    const sequential = new Uint8Array([...header, ...[1, 2, 3].flatMap(id => [255, 218, 0, 8, 1, id, 0, 0, 63, 0, 0]), 255, 217]);
    expect(jpegStructure(sequential, limits, 'photo')).toMatchObject({ width: 8, height: 4 });
    const interleaved = new Uint8Array([...header, ...bytes.subarray(scan)]);
    expect(() => jpegStructure(interleaved, limits, 'photo')).toThrow();
    header[frame + 1] = 0xc2;
    const dcOnly = new Uint8Array([...header, ...[1, 2, 3].flatMap(id => [255, 218, 0, 8, 1, id, 0, 0, 0, 0, 0]), 255, 217]);
    expect(jpegStructure(dcOnly, limits, 'photo')).toMatchObject({ width: 8, height: 4 });
  });
  it('keeps baseline Huffman destinations/selectors at 0–1 while allowing extended sequential table2', () => {
    const bytes = jpegBytes('rgb-baseline'), tableAt = bytes.findIndex((b, i) => b === 255 && bytes[i + 1] === 0xc4), tableEnd = tableAt + 2 + bytes[tableAt + 2]! * 256 + bytes[tableAt + 3]!;
    const scan = bytes.findIndex((b, i) => b === 255 && bytes[i + 1] === 0xda), frame = bytes.findIndex((b, i) => b === 255 && bytes[i + 1] === 0xc0), table = bytes.slice(tableAt, tableEnd); table[4] = 2;
    const extra = new Uint8Array([...bytes.subarray(0, scan), ...table, ...bytes.subarray(scan)]);
    expect(() => jpegStructure(extra, limits, 'photo')).toThrow();
    extra[frame + 1] = 0xc1; extra[scan + table.length + 6] = 0x20;
    expect(jpegStructure(extra, limits, 'photo')).toMatchObject({ width: 8, height: 4 });
  });
  it('separates original photo color/orientation intent from texture intent without resizing', async () => {
    const bitmap = { width: 8, height: 4, close() {} }, create = vi.fn(async (_blob: Blob, _options?: ImageBitmapOptions) => bitmap);
    vi.stubGlobal('createImageBitmap', create);
    try {
      await browserJpegDecoder(jpegBytes('rgb-baseline'), 'photo');
      expect(create.mock.calls[0]?.[1]).toEqual({ imageOrientation: 'from-image', colorSpaceConversion: 'default', premultiplyAlpha: 'none' });
      await browserJpegDecoder(jpegBytes('rgb-baseline'), 'glb-texture');
      expect(create.mock.calls[1]?.[1]).toEqual({ imageOrientation: 'from-image', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    } finally { vi.unstubAllGlobals(); }
  });
});
