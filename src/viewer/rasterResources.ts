/** Modeled owned resources, not OS RAM/VRAM measurements or source admission. */
export interface RasterIntent { readonly cpuBytes: number; readonly gpuBytes: number }
/** Temporary facts from inspected source bytes; never written into a package. */
export interface ModelRasterFacts extends RasterIntent {
  readonly images: readonly { readonly width: number; readonly height: number }[];
  readonly maximumEdge: number;
}
export type RasterPriority = 'original' | 'retry' | 'thumbnail';
export class RasterResourceError extends Error {
  constructor(readonly code: 'invalid' | 'unavailable' | 'closed', detail: string) {
    super(detail); this.name = 'RasterResourceError';
  }
}
const unit = 8192 * 8192 * 4;
export const desktopRasterIntent = Object.freeze({ cpuBytes: 10 * unit, gpuBytes: 8 * unit });
const valid = (n: number) => Number.isSafeInteger(n) && n >= 0;
const aborted = (signal: AbortSignal) => signal.reason ?? new DOMException('Operation aborted', 'AbortError');
export function rasterBytes(width: number, height: number, mipmaps = false): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    throw new RasterResourceError('invalid', '画像の大きさを確認してください。');
  let bytes = 0;
  for (;;) {
    bytes += width * height * 4;
    if (!valid(bytes)) throw new RasterResourceError('invalid', '画像の大きさを確認してください。');
    if (!mipmaps || width === 1 && height === 1) return bytes;
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  }
}
export interface RasterLease {
  readonly owner: string; readonly intent: RasterIntent;
  /** Release scratch only after it is no longer owned; cannot grow a lease. */
  retain(intent: RasterIntent, owner?: string): void;
  release(): void;
}
interface Job<T = unknown> {
  readonly priority: RasterPriority; readonly controller: AbortController;
  readonly work: (signal: AbortSignal) => Promise<T>; readonly late: (value: T) => void | Promise<void>;
  readonly resolve: (value: T) => void; readonly reject: (error: unknown) => void; detach(): void;
}
const rank: Record<RasterPriority, number> = { original: 0, retry: 1, thumbnail: 2 };

/** Separate native-work admission from live leases. Never waits for its own bytes. */
export function createRasterResources(limit: RasterIntent = desktopRasterIntent) {
  if (!valid(limit.cpuBytes) || !valid(limit.gpuBytes)) throw new RasterResourceError('invalid', '資源の条件を確認してください。');
  const capacity = { ...limit }, leases = new Set<RasterLease>(), queued: Job<any>[] = [];
  let usedCpu = 0, usedGpu = 0, closed = false, active: Job<any> | null = null, draining: Promise<void> | null = null;
  let modelTail: Promise<void> = Promise.resolve();
  function reserve(intent: RasterIntent, label: string): RasterLease {
    if (closed) throw new RasterResourceError('closed', '表示の準備を終了しました。');
    if (!valid(intent.cpuBytes) || !valid(intent.gpuBytes)) throw new RasterResourceError('invalid', '資源の条件を確認してください。');
    if (intent.cpuBytes > capacity.cpuBytes - usedCpu || intent.gpuBytes > capacity.gpuBytes - usedGpu)
      throw new RasterResourceError('unavailable', '表示に必要な資源を準備できません。原寸画像を閉じるか、表示するモデルを減らして再試行してください。');
    let current = Object.freeze({ ...intent }), owner = label, released = false;
    usedCpu += current.cpuBytes; usedGpu += current.gpuBytes;
    const lease: RasterLease = {
      get owner() { return owner; }, get intent() { return current; },
      retain(next, nextOwner = owner) {
        if (released || !valid(next.cpuBytes) || !valid(next.gpuBytes) || next.cpuBytes > current.cpuBytes || next.gpuBytes > current.gpuBytes)
          throw new RasterResourceError('invalid', '資源の所有を確認してください。');
        usedCpu -= current.cpuBytes - next.cpuBytes; usedGpu -= current.gpuBytes - next.gpuBytes;
        current = Object.freeze({ ...next }); owner = nextOwner;
      },
      release() { if (!released) { released = true; usedCpu -= current.cpuBytes; usedGpu -= current.gpuBytes; leases.delete(lease); } },
    };
    leases.add(lease); return lease;
  }
  function start() {
    if (active || closed) return;
    queued.sort((a, b) => rank[a.priority] - rank[b.priority]);
    const job = queued.shift(); if (!job) return;
    if (job.controller.signal.aborted) { job.detach(); job.reject(aborted(job.controller.signal)); start(); return; }
    active = job;
    draining = Promise.resolve().then(async () => {
      try {
        if (job.controller.signal.aborted) throw aborted(job.controller.signal);
        const value = await job.work(job.controller.signal);
        if (job.controller.signal.aborted) { await job.late(value); throw aborted(job.controller.signal); }
        job.resolve(value);
      } catch (error) { job.reject(error); }
      finally { job.detach(); active = null; draining = null; start(); }
    });
  }
  function decode<T>(priority: RasterPriority, work: (signal: AbortSignal) => Promise<T>,
    late: (value: T) => void | Promise<void>, signal?: AbortSignal): Promise<T> {
    if (closed) return Promise.reject(new RasterResourceError('closed', '表示の準備を終了しました。'));
    if (signal?.aborted) return Promise.reject(aborted(signal));
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const cancel = () => {
        controller.abort(signal?.reason);
        const at = queued.indexOf(job); if (at >= 0) { queued.splice(at, 1); job.detach(); reject(aborted(controller.signal)); }
      };
      const job: Job<T> = { priority, controller, work, late, resolve, reject, detach: () => signal?.removeEventListener('abort', cancel) };
      signal?.addEventListener('abort', cancel, { once: true }); queued.push(job); start();
    });
  }
  return {
    reserve, decode,
    model<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      const next = modelTail.then(() => {
        if (closed) throw new RasterResourceError('closed', '表示の準備を終了しました。');
        if (signal?.aborted) throw aborted(signal); return work();
      });
      modelTail = next.then(() => {}, () => {}); return next;
    },
    snapshot: () => ({ cpuBytes: usedCpu, gpuBytes: usedGpu, leases: leases.size, queued: queued.length, active: !!active, closed }),
    async dispose() {
      if (!closed) {
        closed = true;
        for (const job of queued.splice(0)) { job.controller.abort(); job.detach(); job.reject(aborted(job.controller.signal)); }
        active?.controller.abort();
      }
      await draining;
      await modelTail;
      // Owners close their images/templates and return leases. Disposal is not evidence of memory release.
    },
  };
}
export type RasterResources = ReturnType<typeof createRasterResources>;
