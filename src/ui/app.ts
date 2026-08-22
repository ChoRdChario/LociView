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
import { el, clear, fmtBytes } from './dom';
import { infoDialog, promptDialog } from './dialogs';
import { fNum, fStr } from './fields';
import { mountHome } from './home';
import { mountViewerScreen } from './viewerScreen';
import type { PackageExportStatus } from './saveStatus';

/** これを超えるモデルは開いた時点で自動読み込みせず、手動表示に委ねる（iOSメモリ対策） */
const AUTO_LOAD_LIMIT = 25 * 1024 * 1024;

export async function bootApp(root: HTMLElement): Promise<void> {
  // ---- PWA（オフライン起動・インストール・ファイル関連付け）------------------------
  initFileHandlers();
  initInstallPrompt();
  void registerPwa({
    onUpdate: (applyUpdate) => showToast('新しいバージョンがあります', '更新', applyUpdate),
  });

  // ---- ワークスペース ----------------------------------------------------------
  let fs: WorkspaceFS;
  let persistentWorkspace = false;
  let storageWarning: string | null = null;
  if (await OpfsFS.isAvailable()) {
    fs = await OpfsFS.open();
    persistentWorkspace = true;
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
  let packageExportStatus: PackageExportStatus = Object.freeze({ phase: 'idle' });

  // ---- 保存状態（書き出し済みop数をプロジェクトごとに記録） -----------------------------
  const exportedKey = (dir: string): string => `lv-package-covered:${dir}`;
  function unexportedCount(): number {
    if (ctx === null) return 0;
    const current = ctx.store.allOps.length;
    const stored = localStorage.getItem(exportedKey(ctx.dir));
    if (stored === null) return current;
    const covered = Number(stored);
    if (!Number.isSafeInteger(covered) || covered < 0 || covered > current) return current;
    return current - covered;
  }
  function setPackageExportStatus(dir: string, status: PackageExportStatus): void {
    if (ctx === null || ctx.dir !== dir) return;
    packageExportStatus = status;
    if (status.phase === 'download-started') {
      localStorage.setItem(exportedKey(dir), String(status.coveredOpCount));
    }
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
    // 軽量版があればそれを表示に使う（原本は書き出し用に保持）。iOSメモリ対策
    const optPath = fStr(asset, 'optimizedPath');
    const displayPath = optPath !== '' ? optPath : fStr(asset, 'path');
    let bytes = await fs.readBytes(`${ctx.dir}/${displayPath}`);
    if (bytes === null && optPath !== '') {
      bytes = await fs.readBytes(`${ctx.dir}/${fStr(asset, 'path')}`); // 軽量版が無ければ原本
    }
    if (bytes === null) {
      await infoDialog('モデル読込', `ファイルが見つかりません（差分ZIPで受け取った場合はフルZIPの取込が必要です）`);
      return;
    }
    const fmt = detectFormat(displayPath, bytes);
    if (fmt === null) {
      await infoDialog('モデル読込', '対応していない形式です');
      return;
    }
    try {
      const model = await loadModel(fmt, bytes);
      ctx.viewer.setModel(model);
      ctx.ui.activeModelAssetId = assetId;
      ctx.ui.loadedModelAssetId = assetId; // 実際に描画された（「表示中」判定の根拠）
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
    packageExportStatus = Object.freeze({ phase: 'idle' });
    if (store.loadErrors.length > 0) {
      const total = store.loadErrors.reduce((s, e) => s + e.errors.length, 0);
      await infoDialog('警告', `ログに破損行が ${total} 行あり、スキップしました（他のデータは無事です）`);
    }
    clear(root);
    const viewer = new ViewerCore();
    ctx = new AppContext(fs, dir, store, viewer, identity);
    // メモリ不足でGLが落ちたら、白画面のままにせず状況を伝える
    let contextLostShown = false;
    viewer.onContextLost(() => {
      // 描画は失われたので「表示中」を解除し、再表示できる状態に戻す
      if (ctx !== null) {
        ctx.ui.loadedModelAssetId = null;
        ctx.notify();
      }
      if (contextLostShown) return;
      contextLostShown = true;
      void infoDialog(
        '表示を停止しました',
        '端末のメモリが不足したため、3D表示を停止しました。' +
          'より軽いモデルでお試しいただくか、他のアプリを閉じてから開き直してください。' +
          '（キャプションや記録は失われていません）',
      );
    });
    unmountViewer = mountViewerScreen(root, ctx, {
      goHome: showHome,
      loadModelAsset,
      unexportedCount,
      persistentWorkspace,
      packageExportStatus: () => packageExportStatus,
      setPackageExportStatus: (status) => setPackageExportStatus(dir, status),
      openProfile: () => void openProfile(),
    });
    // 最初のモデルを自動表示。ただし大きいモデルは自動で読まない。
    // （iOSはタブのメモリ上限が厳しく、開くたびに巨大モデルを読むとクラッシュが繰り返す。
    //  自動表示を外すことで、開く操作自体は必ず成功し、ユーザーが表示可否を選べる）
    if (ctx.ui.activeModelAssetId !== null) {
      const asset = ctx.asset(ctx.ui.activeModelAssetId);
      // 軽量版があればその大きさで判定する（軽量化により自動表示できる場合が増える）
      const optSize = asset !== null ? fNum(asset, 'optimizedSize', 0) : 0;
      const size = optSize > 0 ? optSize : asset !== null ? fNum(asset, 'size', 0) : 0;
      if (size > AUTO_LOAD_LIMIT) {
        await infoDialog(
          'モデルの表示',
          `モデル（${fmtBytes(size)}）が大きいため、自動では表示していません。\n\n` +
            'Modelタブの「表示」から読み込めます。端末のメモリに余裕がないと表示できないことがあります' +
            '（その場合は画面が再読み込みされます）。まずは軽い操作で問題がないか確かめてください。',
        );
      } else {
        await loadModelAsset(ctx.ui.activeModelAssetId);
      }
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
