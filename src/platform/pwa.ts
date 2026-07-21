// PWA登録と更新通知、ファイルハンドラ受け取り (docs/06 §5)
// - Service Worker登録（本番ビルドのみ。dev では登録しない）
// - 更新は自動適用せず「新しいバージョンがあります」を出す（作業中の切替を避ける）
// - OSのファイル関連付け（launchQueue）と共有シートから開かれたファイルを受け取る

export type FileOpenHandler = (file: File) => void | Promise<void>;

let pendingFile: File | null = null;
let handler: FileOpenHandler | null = null;

function deliver(file: File): void {
  if (handler !== null) void handler(file);
  else pendingFile = file; // アプリ初期化前に届いた場合は保留する
}

/** OSから開かれたファイル（file_handlers / share_target）の受け取りを開始する */
export function initFileHandlers(): void {
  // Launch Queue（Android/デスクトップのファイル関連付け）
  const lq = (window as unknown as {
    launchQueue?: { setConsumer(fn: (params: { files?: FileSystemFileHandle[] }) => void): void };
  }).launchQueue;
  if (lq !== undefined) {
    lq.setConsumer((params) => {
      void (async () => {
        const first = params.files?.[0];
        if (first === undefined) return;
        try {
          deliver(await first.getFile());
        } catch {
          // 権限が得られない場合は何もしない
        }
      })();
    });
  }

  // 共有シート（share_target: POST）は SW 経由で来る想定。SWからのメッセージを受ける
  navigator.serviceWorker?.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data as { type?: string; file?: File } | undefined;
    if (data?.type === 'lv-shared-file' && data.file instanceof File) deliver(data.file);
  });
}

/** アプリ側でファイル受け取りハンドラを登録する（保留分があれば即座に流す） */
export function onExternalFileOpen(fn: FileOpenHandler): void {
  handler = fn;
  if (pendingFile !== null) {
    const f = pendingFile;
    pendingFile = null;
    void fn(f);
  }
}

export interface PwaStatus {
  /** SWが有効（オフライン起動可能） */
  offlineReady: boolean;
  /** 新バージョンが待機中 */
  updateAvailable: boolean;
}

/**
 * Service Workerを登録する。
 * 更新検知時は onUpdate を呼び、ユーザーが承諾したら applyUpdate() でリロードする。
 */
export async function registerPwa(callbacks: {
  onOfflineReady?: () => void;
  onUpdate?: (applyUpdate: () => void) => void;
}): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // devサーバーではSWを使わない

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    if (reg.active !== null && reg.waiting === null) callbacks.onOfflineReady?.();

    const notifyUpdate = (worker: ServiceWorker): void => {
      callbacks.onUpdate?.(() => {
        worker.postMessage({ type: 'SKIP_WAITING' });
        // controllerchange で新SWが有効になったらリロード
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        }, { once: true });
      });
    };

    if (reg.waiting !== null) notifyUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (installing === null) return;
      installing.addEventListener('statechange', () => {
        if (installing.state !== 'installed') return;
        if (navigator.serviceWorker.controller !== null) notifyUpdate(installing);
        else callbacks.onOfflineReady?.();
      });
    });
  } catch {
    // 登録失敗（file://・非HTTPS等）はオフライン機能なしで続行する
  }
}

/** ホーム画面インストールの導線（beforeinstallprompt を捕まえて後から出す） */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(available: boolean) => void>();

export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    installPrompt = ev as BeforeInstallPromptEvent;
    for (const fn of installListeners) fn(true);
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    for (const fn of installListeners) fn(false);
  });
}

export function onInstallAvailability(fn: (available: boolean) => void): () => void {
  installListeners.add(fn);
  fn(installPrompt !== null);
  return () => installListeners.delete(fn);
}

export function canInstall(): boolean {
  return installPrompt !== null;
}

/** インストールを促す。実行できたら true */
export async function promptInstall(): Promise<boolean> {
  if (installPrompt === null) return false;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    installPrompt = null;
    for (const fn of installListeners) fn(false);
    return true;
  }
  return false;
}

/** スタンドアロン起動（ホーム画面から開かれた）かどうか */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
