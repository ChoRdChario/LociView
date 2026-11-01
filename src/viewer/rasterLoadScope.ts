import type { RasterResources, ModelRasterFacts } from './rasterResources';

/** Scheduling only. Actual pinned loader/options/tracker remain with their own engine. */
export function createRasterLoadScope(resources?: RasterResources, signal?: AbortSignal) {
  const controller = new AbortController(), pending = new Set<Promise<void>>(); let closed = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  return {
    load(begin: (done: (value: ImageBitmap) => void, failed: (error: unknown) => void) => void,
      done?: (value: ImageBitmap) => void, failed?: (error: unknown) => void): void {
      if (!resources) return begin(value => done?.(value), error => failed?.(error));
      const work = resources.decode('retry', () => new Promise<ImageBitmap>((resolve, reject) => { begin(resolve, reject); }), value => value.close(), controller.signal);
      const delivered = work.then(value => { try { if (closed) { value.close(); failed?.(new DOMException('Operation aborted', 'AbortError')); } else done?.(value); }
        catch (error) { value.close(); failed?.(error); } }, error => { failed?.(error); }).then(() => {}, () => {});
      pending.add(delivered); void delivered.finally(() => pending.delete(delivered)); return undefined;
    },
    async dispose() { closed = true; controller.abort(); signal?.removeEventListener('abort', abort); await Promise.allSettled([...pending]); },
  };
}

/** Reservation surrounds one model stage; inner native-image queue remains independently reentrant. */
export async function withRasterModelStage<T>(source: { readonly bytes: Uint8Array; readonly raster?: ModelRasterFacts },
  resources: RasterResources | undefined, work: () => Promise<T>): Promise<T> {
  if (!resources) return work();
  return resources.model(async () => {
    const lease = resources.reserve({ cpuBytes: (source.raster?.cpuBytes ?? 0) + source.bytes.length * 4, gpuBytes: 0 }, 'モデルの検証');
    try { return await work(); } finally { lease.release(); }
  });
}

/** Reserve encoded work before the content port can materialize source arrays. */
export async function retainRasterModelReadStage<S extends { readonly bytes?: Uint8Array; readonly raster?: ModelRasterFacts }, T extends { dispose(): void }>(
  byteLength: number, resources: RasterResources | undefined, read: () => Promise<S>, work: (source: S) => Promise<T>): Promise<T> {
  if (!resources) return work(await read());
  return resources.model(async () => {
    const encoded = resources.reserve({ cpuBytes: byteLength * 4, gpuBytes: 0 }, 'モデルの読み込み');
    let images: ReturnType<RasterResources['reserve']> | undefined, result: T | undefined;
    try {
      const source = await read();
      if (source.bytes && source.bytes.length !== byteLength) throw Error('保存したモデルの容量が一致しません。');
      images = resources.reserve({ cpuBytes: source.raster?.cpuBytes ?? 0, gpuBytes: 0 }, 'モデルの画像');
      result = await work(source); encoded.retain({ cpuBytes: source.bytes?.length ?? 0, gpuBytes: 0 }, '表示用モデル');
      const value = result; let closed = false;
      return { ...value, dispose() { if (!closed) { closed = true; try { value.dispose(); } finally { images?.release(); encoded.release(); } } } };
    } catch (error) { try { result?.dispose(); } finally { images?.release(); encoded.release(); } throw error; }
  });
}
