import { createRasterResources, rasterBytes, type RasterLease, type RasterResources, type RasterPriority } from '../../viewer/rasterResources';
import { rasterDimensions } from '../../viewer/rasterDimensions';

type Source = () => Promise<Blob>;
export type MediaDimensions=(bytes:Uint8Array,mime:string)=>{readonly width:number;readonly height:number}|null;
export interface MediaResourceLease<T> { readonly ready: Promise<T>; release(): void }
interface Thumbnail { users: number; stamp: number; bytes: number; controller: AbortController; ready: Promise<Blob>; blob?: Blob; lease?: RasterLease }

/** UI-only derivatives. Original bytes/metadata/packages are never rewritten. */
export function createMediaPreviewResources(document: Document, raster: RasterResources, options: {
  readonly edge?: number; readonly cacheBytes?: number;
  readonly dimensions?:MediaDimensions;
  readonly derive?: (blob: Blob, width: number, height: number, signal: AbortSignal) => Promise<Blob>;
} = {}) {
  const edge = options.edge ?? 320, maximum = options.cacheBytes ?? 16 * 1024 * 1024;
  if (!Number.isSafeInteger(edge) || edge <= 0 || !Number.isSafeInteger(maximum) || maximum <= 0) throw Error('縮小画像の条件を確認してください。');
  const input = createRasterResources({ cpuBytes: 0, gpuBytes: 0 }), thumbnails = new Map<string, Thumbnail>();
  const originals = new Set<() => void>(); let bytes = 0, stamp = 0, closed = false;
  const check = (signal: AbortSignal) => { if (closed || signal.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError'); };
  const readSource = async (source: Source, signal: AbortSignal, byteLength?: number) => {
    const lease = byteLength === undefined ? undefined : raster.reserve({cpuBytes:byteLength * 4,gpuBytes:0},'画像の読み込み');
    try { check(signal); const blob = await source(); check(signal); if (byteLength !== undefined && blob.size !== byteLength) throw Error('画像の容量が一致しません。'); return blob; }
    finally { lease?.release(); }
  };
  const drop = (key: string, entry: Thumbnail) => { if (thumbnails.get(key) === entry) thumbnails.delete(key);
    entry.controller.abort(); entry.lease?.release(); entry.lease = undefined; bytes -= entry.bytes; entry.bytes = 0; };
  const makeRoom = (needed: number) => {
    for (const [key, entry] of [...thumbnails].sort((a, b) => a[1].stamp - b[1].stamp)) {
      if (bytes + needed <= maximum) break; if (!entry.users) drop(key, entry);
    }
    if (bytes + needed > maximum) throw Error('縮小画像を準備できません。ほかの画像を閉じて再試行してください。');
  };
  async function shape(blob: Blob) {
    const lease = raster.reserve({ cpuBytes: blob.size, gpuBytes: 0 }, '画像の情報');
    try {
      const data = new Uint8Array(await blob.arrayBuffer()), native = rasterDimensions(data, blob.type);
      if (native) return native;
      const view = new DataView(data.buffer), ascii = (at: number, n: number) => String.fromCharCode(...data.subarray(at, at + n));
      if (data.length >= 10 && /^GIF8[79]a$/.test(ascii(0, 6))) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
      if (data.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
        const uint24 = (at: number) => data[at]! + data[at + 1]! * 256 + data[at + 2]! * 65536;
        for (let at = 12; at + 8 <= data.length;) {
          const size = view.getUint32(at + 4, true), body = at + 8; if (body + size > data.length) break;
          if (ascii(at, 4) === 'VP8X' && size >= 10) return { width: uint24(body + 4) + 1, height: uint24(body + 7) + 1 };
          if (ascii(at, 4) === 'VP8L' && size >= 5) { const bits = view.getUint32(body + 1, true); return { width: (bits & 16383) + 1, height: (bits >>> 14 & 16383) + 1 }; }
          if (ascii(at, 4) === 'VP8 ' && size >= 10) return { width: view.getUint16(body + 6, true) & 16383, height: view.getUint16(body + 8, true) & 16383 };
          at = body + size + (size & 1);
        }
      }
      const supplied=options.dimensions?.(data,blob.type);if(supplied)return supplied;
      throw Error('画像の大きさを確認できません。原本は保持しています。');
    } finally { lease.release(); }
  }
  const derive = options.derive ?? (async (blob: Blob, width: number, height: number) => {
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas');
    try {
      // The actual bitmap includes Exif orientation; keep its displayed aspect ratio.
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw Error('縮小画像を準備できません。');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(Error('縮小画像を準備できません。')), 'image/png'));
    } finally { bitmap.close(); canvas.width = canvas.height = 1; }
  });
  return {
    thumbnail(key: string, source: Source, priority: RasterPriority = 'thumbnail', byteLength?: number): MediaResourceLease<Blob> {
      let entry = thumbnails.get(key);
      if (!entry) {
        const controller = new AbortController();
        entry = { users: 0, stamp: ++stamp, bytes: 0, controller, ready: Promise.resolve(new Blob()) };
        const target = entry; thumbnails.set(key, entry);
        entry.ready = input.decode(priority, async signal => {
          check(signal); makeRoom(edge * edge * 4); target.bytes = edge * edge * 4; bytes += target.bytes;
          const blob = await readSource(source, signal, byteLength); check(signal); const dimensions = await shape(blob); check(signal);
          const scale = Math.min(1, edge / Math.max(dimensions.width, dimensions.height)), width = Math.max(1, Math.round(dimensions.width * scale)), height = Math.max(1, Math.round(dimensions.height * scale));
          const result = await raster.decode(priority, async nativeSignal => {
            check(nativeSignal); const lease = raster.reserve({ cpuBytes: rasterBytes(dimensions.width, dimensions.height) + blob.size * 2 + rasterBytes(width, height), gpuBytes: 0 }, '縮小画像の生成');
            try { return await derive(blob, width, height, nativeSignal); } finally { lease.release(); }
          }, () => {}, signal);
          check(signal); target.lease = raster.reserve({ cpuBytes: rasterBytes(width, height), gpuBytes: 0 }, '縮小画像');
          target.blob = result; return result;
        }, () => {}, controller.signal).catch(error => { drop(key, target); throw error; });
        void entry.ready.catch(() => {});
      }
      const owned = entry; owned.users++; owned.stamp = ++stamp; let released = false;
      return { ready: owned.ready, release() { if (released) return; released = true; owned.users--; owned.stamp = ++stamp;
        if (!owned.users && !owned.blob) drop(key, owned); } };
    },
    original(source: Source, byteLength?: number): MediaResourceLease<HTMLImageElement> {
      const controller = new AbortController(); let releaseImage: (() => void) | undefined, released = false;
      const release = () => { if (released) return; released = true; controller.abort(); releaseImage?.(); originals.delete(release); };
      originals.add(release);
      const ready = input.decode('original', async signal => {
        check(signal); const blob = await readSource(source, signal, byteLength); check(signal); const dimensions = await shape(blob); check(signal);
        return raster.decode('original', async nativeSignal => {
          check(nativeSignal); const lease = raster.reserve({ cpuBytes: rasterBytes(dimensions.width, dimensions.height) + blob.size, gpuBytes: 0 }, '原寸画像');
          const image = document.createElement('img'); let url: string | undefined, cleaned = false, decoding = true;
          const cleanup = () => { if (cleaned) return; cleaned = true; image.removeAttribute('src'); image.remove(); if (url) URL.revokeObjectURL(url); lease.release(); };
          releaseImage = () => { if (!decoding) cleanup(); };
          try { url = URL.createObjectURL(blob); image.decoding = 'async'; image.src = url; await image.decode(); check(nativeSignal); return image; }
          catch (error) { cleanup(); throw error; } finally { decoding = false; }
        }, image => { image.removeAttribute('src'); releaseImage?.(); }, signal);
      }, image => { image.removeAttribute('src'); releaseImage?.(); }, controller.signal);
      void ready.catch(() => { releaseImage?.(); originals.delete(release); });
      return { ready, release };
    },
    async dispose() { if (closed) return; closed = true; for (const release of [...originals]) release();
      for (const [key, entry] of [...thumbnails]) drop(key, entry); await input.dispose(); },
    snapshot: () => ({ entries: thumbnails.size, cacheBytes: bytes, originals: originals.size }),
  };
}
export type MediaPreviewResources = ReturnType<typeof createMediaPreviewResources>;
