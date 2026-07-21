// アプリシェル — 画面遷移（ホーム ⇄ ビューア）、identity、ワークスペース選択、キーボード

import { ProjectStore, type Identity } from '../core/store';
import { newId } from '../core/ids';
import { MemoryFS, type WorkspaceFS } from '../platform/fs';
import { OpfsFS } from '../platform/opfs';
import {
  initFileHandlers,
  initInstallPrompt,
  onExternalFileOpen,
  registerPwa,
} from '../platform/pwa';
import { detectFormat, loadModel } from '../viewer/loaders';
import { ViewerCore } from '../viewer/viewer';
import { AppContext } from './context';
import { el, clear } from './dom';
import { infoDialog, promptDialog } from './dialogs';
import { fStr } from './fields';
import { mountHome } from './home';
import { mountViewerScreen } from './viewerScreen';

export async function bootApp(root: HTMLElement): Promise<void> {
  // ---- PWA（オフライン起動・インストール・ファイル関連付け）------------------------
  initFileHandlers();
  initInstallPrompt();
  void registerPwa({
    onUpdate: (applyUpdate) => showToast('新しいバージョンがあります', '更新', applyUpdate),
  });

  // ---- ワークスペース ----------------------------------------------------------
  let fs: WorkspaceFS;
  let storageWarning: string | null = null;
  if (await OpfsFS.isAvailable()) {
    fs = await OpfsFS.open();
    // 永続化を要求（iOSのストレージ削除対策。docs/06 §4）
    try {
      await navigator.storage.persist?.();
    } catch {
      // best-effort
    }
  } else {
    fs = new MemoryFS();
    storageWarning =
      'このブラウザは永続ワークスペース(OPFS)に未対応です。作業内容はタブを閉じると消えます。必ず「書き出し」で保存してください。';
  }

  // ---- 編集者identity（自己発行。docs/02 §3） ------------------------------------
  const identity: Identity = {
    userId: localStorage.getItem('lv-userId') ?? `usr_${newId('usr').slice(4)}`,
    deviceId: localStorage.getItem('lv-deviceId') ?? `dev_${newId('dev').slice(4)}`,
    displayName: localStorage.getItem('lv-displayName') ?? '',
  };
  localStorage.setItem('lv-userId', identity.userId);
  localStorage.setItem('lv-deviceId', identity.deviceId);

  let ctx: AppContext | null = null;
  let unmountViewer: (() => void) | null = null;

  // ---- 保存状態（書き出し済みop数をプロジェクトごとに記録） -----------------------------
  const exportedKey = (projectId: string): string => `lv-exported-${projectId}`;
  function unsavedCount(): number {
    if (ctx === null) return 0;
    const exported = Number(localStorage.getItem(exportedKey(ctx.store.manifest.projectId)) ?? '0');
    return Math.max(0, ctx.store.allOps.length - exported);
  }
  function markExported(): void {
    if (ctx === null) return;
    localStorage.setItem(exportedKey(ctx.store.manifest.projectId), String(ctx.store.allOps.length));
    ctx.notify();
  }

  // ---- プロファイル -------------------------------------------------------------
  async function openProfile(): Promise<void> {
    const name = await promptDialog('プロファイル', '表示名（マージ時に相手へ見える名前）', identity.displayName ?? '');
    if (name === null) return;
    identity.displayName = name;
    localStorage.setItem('lv-displayName', name);
    if (ctx !== null) {
      // プロジェクト内のprofileエンティティも更新
      const existing = ctx.state.byKind.profile?.[identity.userId];
      if (existing !== undefined) {
        ctx.store.dispatch({ t: 'update', e: 'profile', id: identity.userId, v: { displayName: name } });
      } else {
        ctx.store.dispatch({
          t: 'create', e: 'profile', id: identity.userId,
          v: { displayName: name, defaultPinColor: '#eab308' },
        });
      }
    }
  }

  // ---- モデル読込 ---------------------------------------------------------------
  async function loadModelAsset(assetId: string): Promise<void> {
    if (ctx === null) return;
    const asset = ctx.asset(assetId);
    if (asset === null) return;
    const path = fStr(asset, 'path');
    const bytes = await fs.readBytes(`${ctx.dir}/${path}`);
    if (bytes === null) {
      await infoDialog('モデル読込', `ファイルが見つかりません: ${path}（差分ZIPで受け取った場合はフルZIPの取込が必要です）`);
      return;
    }
    const fmt = detectFormat(fStr(asset, 'originalName', path), bytes);
    if (fmt === null) {
      await infoDialog('モデル読込', '対応していない形式です');
      return;
    }
    try {
      const model = await loadModel(fmt, bytes);
      ctx.viewer.setModel(model);
      ctx.ui.activeModelAssetId = assetId;
      // transformの適用
      const t = asset.fields.transform;
      if (typeof t === 'object' && t !== null && !Array.isArray(t)) {
        const o = t as Record<string, unknown>;
        ctx.viewer.setModelTransform({
          scale: typeof o.scale === 'number' ? o.scale : 1,
          upAxis: o.upAxis === 'Z' ? 'Z' : 'Y',
        });
      }
      ctx.syncPins();
      ctx.syncMaterials();
      ctx.notify();
    } catch (e) {
      await infoDialog('モデル読込失敗', e instanceof Error ? e.message : String(e));
    }
  }

  // ---- 画面遷移 ----------------------------------------------------------------
  function showHome(): void {
    if (unmountViewer !== null) {
      unmountViewer();
      unmountViewer = null;
    }
    if (ctx !== null) {
      ctx.viewer.dispose();
      ctx.disposeMedia();
      ctx = null;
    }
    clear(root);
    mountHome(root, {
      fs,
      identity,
      openProject,
      openProfile: () => void openProfile(),
      storageWarning,
    });
  }

  async function openProject(dir: string): Promise<void> {
    const store = await ProjectStore.open(fs, dir, identity);
    if (store.loadErrors.length > 0) {
      const total = store.loadErrors.reduce((s, e) => s + e.errors.length, 0);
      await infoDialog('警告', `ログに破損行が ${total} 行あり、スキップしました（他のデータは無事です）`);
    }
    clear(root);
    const viewer = new ViewerCore();
    ctx = new AppContext(fs, dir, store, viewer, identity);
    unmountViewer = mountViewerScreen(root, ctx, {
      goHome: showHome,
      loadModelAsset,
      markExported,
      unsavedCount,
      openProfile: () => void openProfile(),
    });
    // 最初のモデルを自動表示
    if (ctx.ui.activeModelAssetId !== null) {
      await loadModelAsset(ctx.ui.activeModelAssetId);
    }
    // 開発検証用フック（devビルドのみ）
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__lv = { ctx, fs, viewer, store, loadModelAsset };
    }
  }

  // ---- キーボード ---------------------------------------------------------------
  document.addEventListener('keydown', (ev) => {
    if (ctx === null) return;
    const editing = (ev.target as HTMLElement).tagName === 'INPUT' || (ev.target as HTMLElement).tagName === 'TEXTAREA';
    if (editing) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
      ev.preventDefault();
      ctx.undo.undo();
    } else if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
      ev.preventDefault();
      ctx.undo.redo();
    }
  });

  // ---- OSから開かれたファイル（関連付け・共有シート） -------------------------------
  onExternalFileOpen(async (file) => {
    // ビューアを開いている場合はホームへ戻してから投入する（ホームが受け口の一貫ルール）
    showHome();
    await new Promise((r) => setTimeout(r, 0));
    const dropTarget = root.querySelector('.lv-drop');
    if (dropTarget === null) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  showHome();
}

/** 画面下部の一時通知（更新案内など） */
function showToast(message: string, actionLabel?: string, action?: () => void): void {
  const toast = el('div', { class: 'lv-toast', role: 'status' }, message);
  if (actionLabel !== undefined && action !== undefined) {
    toast.append(
      el('button', {
        class: 'primary mini',
        onclick: () => {
          toast.remove();
          action();
        },
      }, actionLabel),
    );
  }
  toast.append(el('button', { class: 'mini', onclick: () => toast.remove() }, '×'));
  document.body.append(toast);
  setTimeout(() => toast.remove(), 30_000);
}
