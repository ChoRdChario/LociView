import type { desktopOfflineManifest } from './desktopOfflinePorts';

type Entry = ReturnType<typeof desktopOfflineManifest>[number];
interface ResourcePorts {
  readonly manifest: readonly Entry[];
  readonly cacheName: string;
  key(url: string): string | undefined;
  readonly caches: Pick<CacheStorage, 'open'>;
  fetch(request: Request): Promise<Response>;
  readonly subtle: Pick<SubtleCrypto, 'digest'>;
}
interface Repair {
  readonly abort: AbortController;
  readonly promise: Promise<void>;
  users: number;
}
const cancelled = () => new DOMException('Resource preparation cancelled', 'AbortError');
const assertLive = (signal?: AbortSignal) => { if (signal?.aborted) throw signal.reason ?? cancelled(); };
/** Native Cache I/O cannot be interrupted; detach this caller and reject late results. */
function waitForCaller<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const end = (ok: boolean, value: unknown) => {
      if (finished) return; finished = true; signal.removeEventListener('abort', stop);
      if (ok) resolve(value as T); else reject(value);
    };
    const stop = () => end(false, signal.reason ?? cancelled());
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    void work.then(value => end(true, value), error => end(false, error));
  });
}

/** Current build's exact app resources only. No Project ports or cross-request result cache. */
export function createDesktopOfflineResources(ports: ResourcePorts) {
  const entries = new Map(ports.manifest.map(entry => [entry.url, entry]));
  const repairs = new Map<string, Repair>();
  const valid = async (response: Response | undefined, entry: Entry) => {
    if (!response?.ok || response.type === 'opaque' || response.type === 'opaqueredirect') return false;
    const digest = new Uint8Array(await ports.subtle.digest('SHA-384', await response.arrayBuffer()));
    return `sha384-${btoa(String.fromCharCode(...digest))}` === entry.integrity;
  };
  const cached = async (cache: Cache, key: string, entry: Entry, signal?: AbortSignal, keepBody = false) => {
    assertLive(signal);
    const response = await cache.match(key);
    let checked = false;
    try { checked = await valid(keepBody ? response?.clone() : response, entry); }
    finally { if (keepBody && !checked) void response?.body?.cancel().catch(() => {}); }
    assertLive(signal);
    return checked ? response : undefined;
  };
  const repair = (entry: Entry, key: string, signal?: AbortSignal): Promise<void> => {
    assertLive(signal);
    let shared = repairs.get(entry.url);
    if (!shared || shared.abort.signal.aborted) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(cancelled()), 45_000);
      let task: Repair;
      const promise = (async () => {
        const cache = await ports.caches.open(ports.cacheName);
        // Another completed request may already have repaired this exact key.
        if (await cached(cache, key, entry, abort.signal)) return;
        const replacement = await ports.fetch(new Request(entry.url, {
          integrity: entry.integrity, cache: 'reload', credentials: 'same-origin',
          mode: 'same-origin', redirect: 'error', signal: abort.signal,
        }));
        assertLive(abort.signal);
        if (replacement.redirected || replacement.url && replacement.url !== entry.url || !await valid(replacement.clone(), entry))
          throw Error('Resource integrity mismatch');
        assertLive(abort.signal);
        await cache.put(key, replacement);
        assertLive(abort.signal);
        if (!await cached(cache, key, entry, abort.signal)) throw Error('Resource readback mismatch');
      })().finally(() => {
        clearTimeout(timer);
        if (repairs.get(entry.url) === task) repairs.delete(entry.url);
      });
      task = { abort, users: 0, promise };
      shared = task; repairs.set(entry.url, task);
    }
    const task = shared;
    task.users++;
    return new Promise<void>((resolve, reject) => {
      let finished = false;
      const end = (ok: boolean, error?: unknown) => {
        if (finished) return;
        finished = true; signal?.removeEventListener('abort', stop); task.abort.signal.removeEventListener('abort', sharedStop);
        if (--task.users === 0) task.abort.abort(cancelled());
        if (ok) resolve(); else reject(error);
      };
      const stop = () => end(false, signal?.reason ?? cancelled());
      const sharedStop = () => end(false, task.abort.signal.reason ?? cancelled());
      signal?.addEventListener('abort', stop, { once: true });
      task.abort.signal.addEventListener('abort', sharedStop, { once: true });
      if (signal?.aborted) stop();
      if (task.abort.signal.aborted) sharedStop();
      void task.promise.then(() => end(true), error => end(false, error));
    });
  };
  const read = async (url: string, allowRepair: boolean, signal: AbortSignal | undefined, keepBody: boolean): Promise<Response | undefined> => {
      assertLive(signal);
      const entry = entries.get(url), key = entry && ports.key(url);
      if (!entry || !key) return undefined;
      const cache = await ports.caches.open(ports.cacheName);
      const response = await cached(cache, key, entry, signal, keepBody);
      if (response || !allowRepair) return response;
      await repair(entry, key, signal);
      // Each consumer owns its own body, and rereads the committed cache bytes.
      const saved = await cached(cache, key, entry, signal, keepBody);
      if (!saved) throw Error('Resource readback mismatch');
      return saved;
  };
  return {
    read: (url: string, allowRepair: boolean, signal?: AbortSignal) => waitForCaller(read(url, allowRepair, signal, true), signal),
    check: async (url: string, allowRepair: boolean, signal?: AbortSignal) => !!await waitForCaller(read(url, allowRepair, signal, false), signal),
  };
}
