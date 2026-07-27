// GLBテクスチャ軽量化 (docs/06 §5.5)
//
// 目的: iOSのメモリ上限対策。4Kテクスチャは表示時にGPUで1枚64MB（4096²×4）に展開され、
// 数枚でタブが落ちる。取り込み時にテクスチャを縮小した軽量版GLBを作り、表示に使う。
// 原本は無改変で保持する（原本主義。書き出しは原本を使う）。
//
// 依存ゼロ。中核（GLBの解析・再パック）はNodeでテスト可能な純関数。
// 画像のデコード/縮小のみブラウザAPI（createImageBitmap/Canvas）を使う。

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

interface GlbJson {
  buffers?: { byteLength: number; uri?: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string; name?: string }[];
  [k: string]: unknown;
}

export interface GlbParts {
  json: GlbJson;
  bin: Uint8Array;
}

export function parseGlb(glb: Uint8Array): GlbParts | null {
  if (glb.length < 12) return null;
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) return null;
  if (dv.getUint32(4, true) !== 2) return null; // glTF 2.0 のみ

  let off = 12;
  let json: GlbJson | null = null;
  let bin: Uint8Array | null = null;
  while (off + 8 <= glb.length) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > glb.length) break;
    if (type === CHUNK_JSON) {
      json = JSON.parse(new TextDecoder().decode(glb.subarray(start, start + len))) as GlbJson;
    } else if (type === CHUNK_BIN) {
      bin = glb.subarray(start, start + len);
    }
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (json === null) return null;
  return { json, bin: bin ?? new Uint8Array(0) };
}

export function serializeGlb(json: GlbJson, bin: Uint8Array): Uint8Array {
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
  for (let i = 0; i < jsonPad; i++) out[o++] = 0x20; // JSONはスペース埋め
  dv.setUint32(o, bin.length + binPad, true); o += 4;
  dv.setUint32(o, CHUNK_BIN, true); o += 4;
  out.set(bin, o); // BINはゼロ埋め（既定でゼロ）
  return out;
}

/** 画像バイト列 → 変換後（縮小できなければnull） */
export type ImageTransform = (
  bytes: Uint8Array,
  mime: string,
) => Promise<{ bytes: Uint8Array; mime: string } | null>;

export interface RepackResult {
  data: Uint8Array;
  changedImages: number;
}

/**
 * GLB内の埋め込み画像を transform で置き換え、BINを再パックする。
 * bufferViewのbyteOffset/byteLengthを再計算する。accessorはbufferView相対offsetのため不変。
 * 単一の埋め込みバッファ（GLBのBIN）のみ対応。外部bufferや複数bufferは非対応で原本を返す。
 */
export async function repackGlbImages(glb: Uint8Array, transform: ImageTransform): Promise<RepackResult> {
  const parts = parseGlb(glb);
  if (parts === null) return { data: glb, changedImages: 0 };
  const { json, bin } = parts;
  const bvs = json.bufferViews ?? [];
  const images = json.images ?? [];
  if ((json.buffers ?? []).length !== 1) return { data: glb, changedImages: 0 };
  if (json.buffers![0]!.uri !== undefined) return { data: glb, changedImages: 0 };

  // 元のオフセット/長さを先に退避（後で書き換えるため）
  const orig = bvs.map((bv) => ({ off: bv.byteOffset ?? 0, len: bv.byteLength }));

  const replacement = new Map<number, Uint8Array>();
  let changed = 0;
  for (const img of images) {
    if (typeof img.bufferView !== 'number') continue;
    if (typeof img.mimeType !== 'string' || !img.mimeType.startsWith('image/')) continue;
    const region = orig[img.bufferView];
    if (region === undefined) continue;
    const src = bin.subarray(region.off, region.off + region.len);
    let out: { bytes: Uint8Array; mime: string } | null = null;
    try {
      out = await transform(src, img.mimeType);
    } catch {
      out = null; // 1枚の失敗で全体を止めない
    }
    if (out === null) continue;
    replacement.set(img.bufferView, out.bytes);
    img.mimeType = out.mime;
    changed++;
  }
  if (changed === 0) return { data: glb, changedImages: 0 };

  // BINをbufferView index順で再構築（4バイト境界に整列）
  const pieces: Uint8Array[] = [];
  let cursor = 0;
  for (let i = 0; i < bvs.length; i++) {
    const data = replacement.get(i) ?? bin.subarray(orig[i]!.off, orig[i]!.off + orig[i]!.len);
    const pad = (4 - (cursor % 4)) % 4;
    if (pad > 0) {
      pieces.push(new Uint8Array(pad));
      cursor += pad;
    }
    bvs[i]!.byteOffset = cursor;
    bvs[i]!.byteLength = data.length;
    pieces.push(data);
    cursor += data.length;
  }
  const newBin = new Uint8Array(cursor);
  let p = 0;
  for (const piece of pieces) {
    newBin.set(piece, p);
    p += piece.length;
  }
  json.buffers![0]!.byteLength = newBin.length;

  const data = serializeGlb(json, newBin);
  if (data.length >= glb.length) return { data: glb, changedImages: 0 }; // 小さくならなければ原本
  return { data, changedImages: changed };
}

// ---- 画像サイズの軽量読取（フルデコードを避けるため） -------------------------------

export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) }; // IHDR: 8(sig)+4(len)+4('IHDR')
}

export function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    // SOF0-15（DHT/JPG/DAC を除く）に幅高さがある
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: dv.getUint16(i + 7), h: dv.getUint16(i + 5) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // スタンドアロンマーカー
      continue;
    }
    i += 2 + dv.getUint16(i + 2); // セグメント長でスキップ
  }
  return null;
}

function scaleTo(w: number, h: number, maxSize: number): { w: number; h: number } {
  const s = maxSize / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function encodeCanvas(
  bitmap: ImageBitmap,
  w: number,
  h: number,
  type: string,
  quality: number,
): Promise<Uint8Array | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    if (ctx === null) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await c.convertToBlob({ type, quality });
    return new Uint8Array(await blob.arrayBuffer());
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx === null) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, type, quality));
  if (blob === null) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/** ブラウザ用: テクスチャを maxSize 以下へ縮小する ImageTransform */
export function browserImageDownscaler(maxSize: number, quality: number): ImageTransform {
  return async (bytes, mime) => {
    const dim = mime === 'image/png' ? pngSize(bytes) : jpegSize(bytes);
    if (dim !== null && Math.max(dim.w, dim.h) <= maxSize) return null; // 既に十分小さい

    const blob = new Blob([bytes as BlobPart], { type: mime });
    const target = dim !== null ? scaleTo(dim.w, dim.h, maxSize) : null;
    let bitmap: ImageBitmap;
    try {
      // resizeオプションが効けばフルデコード（4Kで64MB）を避けられる（iOSのメモリ対策の要）
      bitmap =
        target !== null
          ? await createImageBitmap(blob, {
              resizeWidth: target.w,
              resizeHeight: target.h,
              resizeQuality: 'high',
            })
          : await createImageBitmap(blob);
    } catch {
      bitmap = await createImageBitmap(blob);
    }

    let { width: w, height: h } = bitmap;
    if (Math.max(w, h) > maxSize) {
      const s = scaleTo(w, h, maxSize);
      w = s.w;
      h = s.h;
    }
    // 縮小不要（resize済みで既に小さい）ならCanvasへ等倍描画で再エンコードのみ
    const type = mime === 'image/png' ? 'image/png' : 'image/jpeg';
    const out = await encodeCanvas(bitmap, w, h, type, quality);
    bitmap.close?.();
    if (out === null || out.length >= bytes.length) return null; // 得しないなら原本維持
    return { bytes: out, mime: type };
  };
}

export interface OptimizeOptions {
  maxTextureSize?: number;
  quality?: number;
}

/** ブラウザでGLBのテクスチャを縮小する。GLBでない/縮小不要なら changedImages:0 で原本を返す */
export async function optimizeGlb(bytes: Uint8Array, opts: OptimizeOptions = {}): Promise<RepackResult> {
  const maxTextureSize = opts.maxTextureSize ?? 1024;
  const quality = opts.quality ?? 0.82;
  return repackGlbImages(bytes, browserImageDownscaler(maxTextureSize, quality));
}

/** 軽量化できたときだけ縮小後バイト列を返す（できなければnull）。import optionに渡しやすい形 */
export async function optimizeGlbBytes(bytes: Uint8Array, opts?: OptimizeOptions): Promise<Uint8Array | null> {
  const r = await optimizeGlb(bytes, opts);
  return r.changedImages > 0 ? r.data : null;
}
