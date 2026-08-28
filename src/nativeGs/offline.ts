import { initializeNativeSparkModule } from './sparkRuntime';

const SPARK_RUNTIME_CACHE = 'lociview-native-gs-runtime-v1';
const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 60_000;

function expectedSparkChunkUrl(): string {
  const base = new URL(import.meta.env.BASE_URL, location.origin);
  return new URL('assets/native-gs-spark-2.1.0.js', base).href;
}

async function cachedSparkChunkCount(): Promise<number> {
  if (!('caches' in globalThis)) return 0;
  const cache = await caches.open(SPARK_RUNTIME_CACHE);
  return (await cache.match(expectedSparkChunkUrl(), { ignoreVary: true }))?.ok === true ? 1 : 0;
}

async function cacheSparkChunkExplicitly(): Promise<Cache> {
  const cache = await caches.open(SPARK_RUNTIME_CACHE);
  const url = expectedSparkChunkUrl();
  if ((await cache.match(url, { ignoreVary: true }))?.ok !== true) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Spark runtime chunkの取得に失敗しました（HTTP ${response.status}）。`);
    await cache.put(url, response.clone());
  }
  if ((await cache.match(url, { ignoreVary: true }))?.ok !== true) {
    throw new Error('Spark runtime chunkをCache Storageへ保存できませんでした。');
  }
  return cache;
}

/** Wait for this registration's first active worker without relying on `ready`, which never rejects. */
export function waitForNativeGsServiceWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs = SERVICE_WORKER_ACTIVATION_TIMEOUT_MS,
): Promise<ServiceWorker> {
  if (registration.active !== null) return Promise.resolve(registration.active);
  return new Promise<ServiceWorker>((resolve, reject) => {
    let observed: ServiceWorker | null = null;
    let settled = false;
    const cleanup = (): void => {
      registration.removeEventListener('updatefound', check);
      observed?.removeEventListener('statechange', check);
      globalThis.clearTimeout(timer);
    };
    const finish = (worker: ServiceWorker): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(worker);
    };
    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const observe = (worker: ServiceWorker | null): void => {
      if (worker === observed) return;
      observed?.removeEventListener('statechange', check);
      observed = worker;
      observed?.addEventListener('statechange', check);
    };
    function check(): void {
      if (registration.active !== null) {
        finish(registration.active);
        return;
      }
      const worker = registration.installing ?? registration.waiting;
      observe(worker);
      if (worker?.state === 'activated') finish(worker);
      else if (worker?.state === 'redundant') fail('Service Workerのinstallに失敗したため、オフライン準備を開始できません。');
    }
    const timer = globalThis.setTimeout(() => {
      fail('Service Workerの準備が完了しませんでした。通信状態を確認して再試行してください。');
    }, timeoutMs);
    registration.addEventListener('updatefound', check);
    check();
  });
}

export async function isNativeGsOfflineReady(registration: ServiceWorkerRegistration | null): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  return registration !== null && registration.active !== null && (await cachedSparkChunkCount()) > 0;
}

/** Explicit user action: initialize Spark and prove its versioned chunk reached Cache Storage. */
export async function prepareNativeGsOffline(
  registration: ServiceWorkerRegistration | null,
): Promise<{ readonly offlineReady: boolean; readonly detail: string }> {
  let preparedCache: Cache | null = null;
  if (import.meta.env.PROD) {
    if (!('serviceWorker' in navigator)) {
      throw new Error('このブラウザではオフライン準備に必要なService Workerを利用できません。');
    }
    if (registration === null) throw new Error('Service Workerを登録できなかったため、オフライン準備を開始できません。');
    // A newly installed worker need not control the page that registered it. The
    // registration lifecycle still proves app-shell install and can reject/timeout.
    await waitForNativeGsServiceWorker(registration);
    preparedCache = await cacheSparkChunkExplicitly();
  }
  try {
    await initializeNativeSparkModule();
  } catch (error) {
    if (preparedCache !== null) await preparedCache.delete(expectedSparkChunkUrl());
    throw error;
  }
  if (import.meta.env.DEV) {
    return { offlineReady: false, detail: '開発serverではSpark runtimeのみ確認済みです。offline cacheはproduction buildで確認します。' };
  }
  if (await isNativeGsOfflineReady(registration)) {
    return { offlineReady: true, detail: 'Spark 2.1.0 runtimeをこの端末のoffline cacheへ保存しました。' };
  }
  throw new Error('Spark runtimeは起動しましたが、offline cache完了を確認できませんでした。');
}
