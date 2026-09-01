import { describe, expect, it } from 'vitest';
import {
  jpegSize,
  parseGlb,
  pngSize,
  repackGlbImages,
  serializeGlb,
  type ImageTransform,
} from '../../src/assets/glbOptimize';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** テスト用GLBを組み立てる */
function buildGlb(json: unknown, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let o = 0;
  dv.setUint32(o, GLB_MAGIC, true); o += 4;
  dv.setUint32(o, 2, true); o += 4;
  dv.setUint32(o, total, true); o += 4;
  dv.setUint32(o, jsonBytes.length + jsonPad, true); o += 4;
  dv.setUint32(o, CHUNK_JSON, true); o += 4;
  out.set(jsonBytes, o); o += jsonBytes.length;
  for (let i = 0; i < jsonPad; i++) out[o++] = 0x20;
  dv.setUint32(o, bin.length + binPad, true); o += 4;
  dv.setUint32(o, CHUNK_BIN, true); o += 4;
  out.set(bin, o);
  return out;
}

describe('parseGlb / serializeGlb', () => {
  it('往復して JSON と BIN が保たれる', () => {
    const json = { asset: { version: '2.0' }, buffers: [{ byteLength: 6 }] };
    const bin = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const glb = buildGlb(json, bin);
    const parsed = parseGlb(glb)!;
    expect(parsed.json).toEqual(json);
    expect([...parsed.bin.subarray(0, 6)]).toEqual([1, 2, 3, 4, 5, 6]);

    const re = parseGlb(serializeGlb(parsed.json, parsed.bin.subarray(0, 6)))!;
    expect(re.json).toEqual(json);
  });

  it('GLBでないものはnull', () => {
    expect(parseGlb(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(parseGlb(new TextEncoder().encode('solid stl'))).toBeNull();
  });
});

describe('repackGlbImages', () => {
  // geometry(bv0, 8B) の後ろに image(bv1, 10B) を置いたGLB
  const geom = new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17]);
  const image = new Uint8Array([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);

  function makeGlb(): Uint8Array {
    const bin = new Uint8Array(8 + 10);
    bin.set(geom, 0);
    bin.set(image, 8);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 18 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 8 },
        { buffer: 0, byteOffset: 8, byteLength: 10 },
      ],
      accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 2, type: 'VEC3' }],
      images: [{ bufferView: 1, mimeType: 'image/jpeg' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    };
    return buildGlb(json, bin);
  }

  it('画像だけ置換し、ジオメトリとaccessorを保つ', async () => {
    const shrink: ImageTransform = async () => ({ bytes: new Uint8Array([200, 201, 202, 203]), mime: 'image/jpeg' });
    const { data, changedImages } = await repackGlbImages(makeGlb(), shrink);
    expect(changedImages).toBe(1);

    const parsed = parseGlb(data)!;
    // geometry(bv0)は不変
    const bv0 = parsed.json.bufferViews![0]!;
    expect(bv0.byteOffset).toBe(0);
    expect(bv0.byteLength).toBe(8);
    expect([...parsed.bin.subarray(0, 8)]).toEqual([...geom]);
    // image(bv1)は縮小され、4バイト境界に整列して配置される
    const bv1 = parsed.json.bufferViews![1]!;
    expect(bv1.byteOffset).toBe(8);
    expect(bv1.byteLength).toBe(4);
    expect([...parsed.bin.subarray(8, 12)]).toEqual([200, 201, 202, 203]);
    // accessorのbufferView相対offsetは不変
    const accessors = parsed.json.accessors as { byteOffset: number }[];
    expect(accessors[0]!.byteOffset).toBe(0);
    expect(parsed.json.buffers![0]!.byteLength).toBe(12);
  });

  it('境界整列: 画像サイズが4の倍数でなくても後続がずれない', async () => {
    // bv0(image, 3B) の後に bv1(geometry, 8B) を置く
    const bin = new Uint8Array(4 + 8); // image 3B + pad1 + geom 8B
    bin.set([1, 2, 3], 0);
    bin.set([20, 21, 22, 23, 24, 25, 26, 27], 4);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 12 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 3 },
        { buffer: 0, byteOffset: 4, byteLength: 8 },
      ],
      images: [{ bufferView: 0, mimeType: 'image/png' }],
    };
    const glb = buildGlb(json, bin);
    const grow: ImageTransform = async () => ({ bytes: new Uint8Array([9, 9, 9, 9, 9]), mime: 'image/png' });
    // 画像を5Bに（元3Bより大きいが、テスト目的は整列確認。全体は縮まないので原本が返る場合がある）
    const { data } = await repackGlbImages(glb, grow);
    const parsed = parseGlb(data)!;
    const bv1 = parsed.json.bufferViews![1]!;
    // 後続ジオメトリは必ず4バイト境界にあり、中身が保たれる
    expect(bv1.byteOffset! % 4).toBe(0);
    expect([...parsed.bin.subarray(bv1.byteOffset!, bv1.byteOffset! + 8)]).toEqual([20, 21, 22, 23, 24, 25, 26, 27]);
  });

  it('変換がnull（縮小不要）なら原本を返す', async () => {
    const noop: ImageTransform = async () => null;
    const glb = makeGlb();
    const { data, changedImages } = await repackGlbImages(glb, noop);
    expect(changedImages).toBe(0);
    expect(data).toBe(glb);
  });

  it('外部bufferや複数bufferは原本を返す', async () => {
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 4, uri: 'data:...' }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
    };
    const glb = buildGlb(json, new Uint8Array([1, 2, 3, 4]));
    const t: ImageTransform = async () => ({ bytes: new Uint8Array([9]), mime: 'image/jpeg' });
    const { changedImages } = await repackGlbImages(glb, t);
    expect(changedImages).toBe(0);
  });
});

describe('画像サイズ読取', () => {
  it('pngSize: IHDRから幅高さを読む', () => {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    b.set([0x49, 0x48, 0x44, 0x52], 12);
    const dv = new DataView(b.buffer);
    dv.setUint32(16, 4096);
    dv.setUint32(20, 2048);
    expect(pngSize(b)).toEqual({ w: 4096, h: 2048 });
  });

  it('jpegSize: SOF0から幅高さを読む', () => {
    // FFD8 FFC0 0011 08 [h:0800] [w:1000] ...
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x08, 0x00, 0x10, 0x00, 0x03]);
    expect(jpegSize(b)).toEqual({ w: 0x1000, h: 0x0800 });
  });

  it('jpegSize: APP0を飛ばしてSOFに到達する', () => {
    const b = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0 長さ4
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x00, 0x06, 0x00, 0x03,
    ]);
    expect(jpegSize(b)).toEqual({ w: 0x0600, h: 0x0400 });
  });
});
