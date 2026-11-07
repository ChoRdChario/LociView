import { createRasterResources, rasterBytes, type RasterLease, type RasterResources, type RasterPriority } from '../../viewer/rasterResources';
import { rasterDimensions } from '../../viewer/rasterDimensions';

type Source = () => Promise<Blob>;
export type MediaDimensions=(bytes:Uint8Array,mime:string)=>{readonly width:number;readonly height:number}|null;
export interface MediaResourceLease<T> { readonly ready: Promise<T>; release(): void }
export type MediaResidency = (signal: AbortSignal) => Promise<{ release(): void }>;
/** Presentation-only ownership, shared by editing and standalone viewing. */
export function createMediaResidencyGate(document: Document, changed: () => void, idle: () => Promise<void>, live: () => boolean) {
  const owners = new Set<symbol>();
  const acquire: MediaResidency = async signal => {
    signal.throwIfAborted(); if (!live()) throw new DOMException('画面を閉じました。', 'AbortError');
    if (!document.defaultView?.matchMedia?.('(pointer: coarse)').matches) return { release() {} };
    const owner = Symbol('image-residency'); owners.add(owner);
    const release = () => { if (!owners.delete(owner) || !live()) return; try { changed(); } catch { /* Cleanup remains complete; a failed view cannot grant source authority. */ } };
    try {
      // A gallery may request a thumbnail during render; apply hidden state after that render.
      await Promise.resolve(); if (!live()) throw new DOMException('画面を閉じました。', 'AbortError');
      changed(); await idle(); signal.throwIfAborted(); if (!live()) throw new DOMException('画面を閉じました。', 'AbortError');
      return { release };
    } catch (error) { release(); throw error; }
  };
  return { acquire, get active() { return owners.size > 0; } };
}
interface Thumbnail { users: number; stamp: number; bytes: number; controller: AbortController; ready: Promise<Blob>; blob?: Blob; lease?: RasterLease }

/** UI-only derivatives. Original bytes/metadata/packages are never rewritten. */
export function createMediaPreviewResources(document: Document, raster: RasterResources, options: {
  readonly edge?: number; readonly cacheBytes?: number;
  readonly dimensions?:MediaDimensions;
  readonly residency?: MediaResidency;
  readonly derive?: (blob: Blob, width: number, height: number, signal: AbortSignal) => Promise<Blob>;
} = {}) {
  const edge = options.edge ?? 320, maximum = options.cacheBytes ?? 16 * 1024 * 1024;
  if (!Number.isSafeInteger(edge) || edge <= 0 || !Number.isSafeInteger(maximum) || maximum <= 0) throw Error('縮小画像の条件を確認してください。');
  const input = createRasterResources({ cpuBytes: 0, gpuBytes: 0 }), thumbnails = new Map<string, Thumbnail>();
  const originals = new Set<() => void>(), listeners = new Set<() => void>(), jobs = new Set<Promise<unknown>>(); let bytes = 0, stamp = 0, closed = false, thumbnailsActive = true;
  let retirement: Promise<void> | undefined;
  const own = <T>(work: Promise<T>): Promise<T> => { jobs.add(work); void work.then(() => jobs.delete(work), () => jobs.delete(work)); return work; };
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
  async function shape(blob: Blob, signal: AbortSignal) {
    const header = new Uint8Array(await blob.slice(0, 32).arrayBuffer()); check(signal);
    const png = blob.type === 'image/png' && rasterDimensions(header, blob.type);
    if (png) {
      // PNG eXIf can change displayed orientation. Unknown orientation keeps the old exact path.
      let resize = true, windowStart = 0, windowBytes = header;
      for (let at = 8; at + 8 <= blob.size;) {
        if (at < windowStart || at + 8 > windowStart + windowBytes.length) {
          windowStart = at; windowBytes = new Uint8Array(await blob.slice(at, at + 4096).arrayBuffer()); check(signal);
        }
        const chunk = windowBytes.subarray(at - windowStart, at - windowStart + 8);
        const size = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0), type = String.fromCharCode(...chunk.subarray(4));
        if (type === 'eXIf') { resize = false; break; }
        if (size + at + 12 > blob.size) { resize = false; break; }
        at += size + 12;
      }
      return { ...png, resize };
    }
    if (blob.type === 'image/gif' && header.length >= 10) { const view = new DataView(header.buffer); return { width: view.getUint16(6,true), height: view.getUint16(8,true), resize: true }; }
    const lease = raster.reserve({ cpuBytes: blob.size, gpuBytes: 0 }, '画像の情報');
    try {
      const data = new Uint8Array(await blob.arrayBuffer()); check(signal);
      const supplied = options.dimensions?.(data, blob.type);
      if (supplied) return { ...supplied, resize: blob.type === 'image/jpeg' };
      const native = rasterDimensions(data, blob.type);
      if (native) return { ...native, resize: false };
      const view = new DataView(data.buffer), ascii = (at: number, n: number) => String.fromCharCode(...data.subarray(at, at + n));
      if (data.length >= 10 && /^GIF8[79]a$/.test(ascii(0, 6))) return { width: view.getUint16(6, true), height: view.getUint16(8, true), resize: true };
      if (data.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
        const uint24 = (at: number) => data[at]! + data[at + 1]! * 256 + data[at + 2]! * 65536;
        for (let at = 12; at + 8 <= data.length;) {
          const size = view.getUint32(at + 4, true), body = at + 8; if (body + size > data.length) break;
          if (ascii(at, 4) === 'VP8X' && size >= 10) return { width: uint24(body + 4) + 1, height: uint24(body + 7) + 1, resize: false };
          if (ascii(at, 4) === 'VP8L' && size >= 5) { const bits = view.getUint32(body + 1, true); return { width: (bits & 16383) + 1, height: (bits >>> 14 & 16383) + 1, resize: false }; }
          if (ascii(at, 4) === 'VP8 ' && size >= 10) return { width: view.getUint16(body + 6, true) & 16383, height: view.getUint16(body + 8, true) & 16383, resize: false };
          at = body + size + (size & 1);
        }
      }
      throw Error('画像の大きさを確認できません。原本は保持しています。');
    } finally { lease.release(); }
  }
  const derive = async (blob: Blob, width: number, height: number, signal: AbortSignal, resize: boolean) => {
    if (options.derive) return options.derive(blob, width, height, signal);
    check(signal);
    const bitmap = await createImageBitmap(blob, resize ? { resizeWidth: width, resizeHeight: height, resizeQuality: 'high', imageOrientation: 'from-image' } : undefined);
    let canvas: HTMLCanvasElement | undefined;
    try {
      check(signal); canvas = document.createElement('canvas');
      // The actual bitmap includes Exif orientation; keep its displayed aspect ratio.
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw Error('縮小画像を準備できません。');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const output = canvas;
      const result = await new Promise<Blob>((resolve, reject) => output.toBlob(result => result ? resolve(result) : reject(Error('縮小画像を準備できません。')), 'image/png'));
      check(signal); return result;
    } finally { try { bitmap.close(); } finally { if (canvas) canvas.width = canvas.height = 1; } }
  };
  return {
    thumbnail(key: string, source: Source, priority: RasterPriority = 'thumbnail', byteLength?: number): MediaResourceLease<Blob> {
      let entry = thumbnails.get(key);
      if (!entry) {
        const controller = new AbortController();
        entry = { users: 0, stamp: ++stamp, bytes: 0, controller, ready: Promise.resolve(new Blob()) };
        const target = entry; thumbnails.set(key, entry);
        let residency: { release(): void } | undefined;
        entry.ready = Promise.resolve().then(async () => { residency = await options.residency?.(controller.signal); check(controller.signal);
          return input.decode(priority, async signal => {
          check(signal); makeRoom(edge * edge * 4); target.bytes = edge * edge * 4; bytes += target.bytes;
          const blob = await readSource(source, signal, byteLength); check(signal); const dimensions = await shape(blob, signal); check(signal);
          const scale = Math.min(1, edge / Math.max(dimensions.width, dimensions.height)), width = Math.max(1, Math.round(dimensions.width * scale)), height = Math.max(1, Math.round(dimensions.height * scale));
          const result = await raster.decode(priority, async nativeSignal => {
            check(nativeSignal); const lease = raster.reserve({ cpuBytes: rasterBytes(dimensions.width, dimensions.height) + blob.size * 2 + rasterBytes(width, height), gpuBytes: 0 }, '縮小画像の生成');
            try { return await derive(blob, width, height, nativeSignal, dimensions.resize); } finally { lease.release(); }
          }, () => {}, signal);
          check(signal); target.lease = raster.reserve({ cpuBytes: rasterBytes(width, height), gpuBytes: 0 }, '縮小画像');
          target.blob = result; return result;
          }, () => {}, controller.signal);
        }).catch(error => { drop(key, target); throw error; }).finally(() => residency?.release());
        own(entry.ready); void entry.ready.catch(() => {});
      }
      const owned = entry; owned.users++; owned.stamp = ++stamp; let released = false;
      return { ready: owned.ready, release() { if (released) return; released = true; owned.users--; owned.stamp = ++stamp;
        if (!owned.users && !owned.blob) drop(key, owned); } };
    },
    original(source: Source, byteLength?: number): MediaResourceLease<HTMLImageElement> {
      const controller = new AbortController(); let releaseImage: (() => void) | undefined, released = false, settled = false, residency: { release(): void } | undefined;
      const retire = () => { const owned = residency; residency = undefined; owned?.release(); };
      const release = () => { if (released) return; released = true; controller.abort(); releaseImage?.(); if (settled) retire(); originals.delete(release); };
      originals.add(release);
      const ready = Promise.resolve().then(async () => { residency = await options.residency?.(controller.signal); check(controller.signal);
        return input.decode('original', async signal => {
        check(signal); const blob = await readSource(source, signal, byteLength); check(signal); const dimensions = await shape(blob, signal); check(signal);
        return raster.decode('original', async nativeSignal => {
          check(nativeSignal); const lease = raster.reserve({ cpuBytes: rasterBytes(dimensions.width, dimensions.height) + blob.size, gpuBytes: 0 }, '原寸画像');
          const image = document.createElement('img'); let url: string | undefined, cleaned = false, decoding = true;
          const cleanup = () => { if (cleaned) return; cleaned = true; image.removeAttribute('src'); image.remove(); if (url) URL.revokeObjectURL(url); lease.release(); };
          releaseImage = () => { if (!decoding) cleanup(); };
          try { url = URL.createObjectURL(blob); image.decoding = 'async'; image.src = url; await image.decode(); check(nativeSignal); return image; }
          catch (error) { cleanup(); throw error; } finally { decoding = false; }
        }, image => { image.removeAttribute('src'); releaseImage?.(); }, signal);
        }, image => { image.removeAttribute('src'); releaseImage?.(); }, controller.signal);
      }).catch(error => { releaseImage?.(); originals.delete(release); retire(); throw error; }).finally(() => { settled = true; if (released) retire(); });
      own(ready); void ready.catch(() => {});
      return { ready, release };
    },
    dispose() {
      if (retirement) return retirement;
      let finish!: () => void, fail!: (error: unknown) => void;
      retirement = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
      void retirement.catch(() => {}); closed = true;
      const errors: unknown[] = [], attempt = (action: () => void) => { try { action(); } catch (error) { errors.push(error); } };
      for (const release of [...originals]) attempt(release);
      for (const [key, entry] of [...thumbnails]) attempt(() => drop(key, entry)); listeners.clear();
      void (async () => {
        try { await input.dispose(); } catch (error) { errors.push(error); }
        await Promise.allSettled([...jobs]);
        if (errors.length) throw new AggregateError(errors, '画像の終了処理を完了できませんでした。再読み込みしてください。');
      })().then(finish, fail);
      return retirement;
    },
    get thumbnailsActive() { return thumbnailsActive; },
    setThumbnailsActive(active: boolean) { if (closed || active === thumbnailsActive) return; thumbnailsActive = active; for (const changed of [...listeners]) changed(); },
    subscribe(changed: () => void) { listeners.add(changed); return () => { listeners.delete(changed); }; },
    snapshot: () => ({ entries: thumbnails.size, cacheBytes: bytes, originals: originals.size }),
  };
}
export type MediaPreviewResources = ReturnType<typeof createMediaPreviewResources>;
