// ビューア画面 — ステージ + パネル（PC: 右 / スマホ: ボトムシート3段階）
// タブ: Caption / Material / Model / Views / データ（コンセンサス確定構成）

import { compareHlc } from '../core/hlc';
import { el, clear } from './dom';
import { fAnchor, fNum, fStr } from './fields';
import type { AppContext } from './context';
import { confirmDialog, promptDialog } from './dialogs';
import { currentPinColor, mountCaptionTab } from './tabs/caption';
import { mountDataTab } from './tabs/data';
import { mountMaterialTab } from './tabs/material';
import { mountModelTab } from './tabs/model';
import { applyViewRecordToViewer, mountViewsTab } from './tabs/views';
import { mountCaptionOverlay } from './overlay';
import { describeProjectAccess, describeSaveStatus, type PackageExportStatus } from './saveStatus';

export interface ViewerScreenDeps {
  goHome: () => void;
  loadModelAsset: (assetId: string) => Promise<void>;
  unexportedCount: () => number;
  persistentWorkspace: boolean;
  packageExportStatus: () => PackageExportStatus;
  setPackageExportStatus: (status: PackageExportStatus) => void;
  openProfile: () => void;
  retryProjectAccess: () => void;
}

const TABS = [
  ['caption', 'Caption'],
  ['material', 'Material'],
  ['model', 'Model'],
  ['views', 'Views'],
  ['data', 'データ'],
] as const;
type TabId = (typeof TABS)[number][0];

type SheetState = 'collapsed' | 'half' | 'full';

export function mountViewerScreen(root: HTMLElement, ctx: AppContext, deps: ViewerScreenDeps): () => void {
  let activeTab: TabId = 'caption';
  let sheet: SheetState = 'half';

  // ---- トップバー -------------------------------------------------------------

  const saveStatus = el('span', { class: 'lv-dim lv-savestatus' });
  const accessStatus = el('span', { class: 'lv-badge' });
  const retryAccessBtn = el('button', {
    class: 'mini',
    title: '編集権限を再取得し、端末に保存された最新状態を再読込します',
    onclick: deps.retryProjectAccess,
  }, '再取得して再読込');
  retryAccessBtn.hidden = true;
  const retrySaveBtn = el('button', {
    class: 'mini',
    title: '端末ワークスペースへの保存を再試行',
    onclick: () => {
      void ctx.store.flush().catch(() => undefined);
    },
  }, '保存を再試行');
  retrySaveBtn.hidden = true;
  const undoBtn = el('button', { 'data-project-mutation': '', title: '元に戻す (Ctrl+Z)', onclick: () => { ctx.undo.undo(); } }, '↺');
  const redoBtn = el('button', { 'data-project-mutation': '', title: 'やり直す (Ctrl+Y)', onclick: () => { ctx.undo.redo(); } }, '↻');
  const profileBtn = el('button', {
    'data-project-mutation': '',
    onclick: deps.openProfile,
    class: 'lv-profile',
  }, ctx.displayName(ctx.identity.userId));

  const topbar = el('header', { class: 'lv-topbar' },
    el('button', { onclick: deps.goHome, title: 'ホームへ' }, '☰'),
    el('b', { class: 'lv-projname' }, ctx.store.manifest.name),
    accessStatus,
    retryAccessBtn,
    saveStatus,
    retrySaveBtn,
    el('span', { class: 'lv-flex1' }),
    undoBtn, redoBtn,
    profileBtn,
  );

  // ---- ステージ ---------------------------------------------------------------

  const canvas = el('canvas', { class: 'lv-gl' }) as HTMLCanvasElement;
  const stage = el('div', { class: 'lv-stage' }, canvas);
  ctx.viewer.init(canvas);
  const unmountOverlay = mountCaptionOverlay(stage, ctx);

  // ---- パネル（セット切替 + タブ） ------------------------------------------------

  const setSelect = el('select', { class: 'lv-set-select' }) as HTMLSelectElement;
  setSelect.addEventListener('change', () => {
    void switchSet(setSelect.value);
  });
  const addSetBtn = el('button', {
    'data-project-mutation': '',
    onclick: () => {
      void promptDialog('新しい表示セット', 'セット名（例: 半透明・内部指摘用）').then((name) => {
        if (name === null) return;
        const id = ctx.undo.create('set', { name, order: ctx.sets().length + 1 });
        void switchSet(id);
      });
    },
  }, '＋');
  const renameSetBtn = el('button', {
    'data-project-mutation': '',
    title: 'セット名変更',
    onclick: () => {
      const setId = ctx.ui.activeSetId;
      if (setId === null) return;
      const rec = ctx.state.byKind.set?.[setId];
      void promptDialog('セット名の変更', 'セット名', rec !== undefined ? fStr(rec, 'name') : '').then((name) => {
        if (name !== null) ctx.undo.update('set', setId, { name });
      });
    },
  }, '✎');
  const deleteSetBtn = el('button', {
    'data-project-mutation': '',
    title: 'セット削除',
    onclick: () => {
      const setId = ctx.ui.activeSetId;
      if (setId === null || ctx.sets().length <= 1) return;
      void confirmDialog('セットの削除', 'このセットと所属キャプションを削除しますか？（マージ・Undoで復元できます）').then((ok) => {
        if (!ok) return;
        ctx.undo.transaction((tx) => {
          for (const c of ctx.captions()) tx.delete('caption', c.id);
          tx.delete('set', setId);
        });
        const next = ctx.sets().find((s) => s.id !== setId);
        void switchSet(next?.id ?? null);
      });
    },
  }, '🗑');

  const tabBar = el('nav', { class: 'lv-tabs', role: 'tablist' });
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const [id, label] of TABS) {
    const btn = el('button', {
      role: 'tab',
      onclick: () => {
        activeTab = id;
        if (sheet === 'collapsed') setSheet('half');
        renderTabs();
      },
    }, label) as HTMLButtonElement;
    tabButtons.set(id, btn);
    tabBar.append(btn);
  }

  const tabBody = el('div', { class: 'lv-tab-body' });
  const handle = el('div', { class: 'lv-sheet-handle', onclick: () => cycleSheet() }, el('div', { class: 'lv-handle-bar' }));

  const panel = el('aside', { class: 'lv-panel', 'data-sheet': sheet },
    handle,
    el('div', { class: 'lv-set-row' }, setSelect, addSetBtn, renameSetBtn, deleteSetBtn),
    tabBar,
    tabBody,
  );

  const layout = el('div', { class: 'lv-viewer-layout' }, topbar, el('div', { class: 'lv-main' }, stage, panel));
  const blockUnauthorizedMutation = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-project-mutation]') === null) return;
    if (ctx.store.canMutate) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  layout.addEventListener('click', blockUnauthorizedMutation, true);
  layout.addEventListener('input', blockUnauthorizedMutation, true);
  layout.addEventListener('change', blockUnauthorizedMutation, true);
  root.append(layout);

  // ---- タブ描画 ---------------------------------------------------------------

  const refreshers = new Map<TabId, () => void>();

  function renderTabs(): void {
    for (const [id, btn] of tabButtons) {
      btn.setAttribute('aria-selected', id === activeTab ? 'true' : 'false');
    }
    clear(tabBody);
    const containerEl = el('div', { class: 'lv-tab-inner' });
    tabBody.append(containerEl);
    switch (activeTab) {
      case 'caption':
        refreshers.set('caption', mountCaptionTab(containerEl, ctx));
        break;
      case 'material':
        refreshers.set('material', mountMaterialTab(containerEl, ctx));
        break;
      case 'model':
        refreshers.set('model', mountModelTab(containerEl, ctx, { loadModelAsset: deps.loadModelAsset }));
        break;
      case 'views':
        refreshers.set('views', mountViewsTab(containerEl, ctx));
        break;
      case 'data':
        refreshers.set('data', mountDataTab(containerEl, ctx, {
          loadModelAsset: deps.loadModelAsset,
          setPackageExportStatus: deps.setPackageExportStatus,
        }));
        break;
    }
    applyMutationControls();
  }

  // ---- セット切替（キャプション・マテリアル・ビューが一括で変わる。docs/02 §5 set） ----

  async function switchSet(setId: string | null): Promise<void> {
    ctx.ui.activeSetId = setId;
    ctx.ui.selectedCaptionId = null;
    ctx.syncPins();
    ctx.syncMaterials();
    // セットの最新ビューを適用（LociMyu挙動の継承）
    const views = ctx.views();
    let latest: { id: string; hlc: string } | null = null;
    for (const v of views) {
      if (v.lastWrite !== null && (latest === null || compareHlc(v.lastWrite, latest.hlc) > 0)) {
        latest = { id: v.id, hlc: v.lastWrite };
      }
    }
    if (latest !== null) applyViewRecordToViewer(ctx, latest.id);
    ctx.notify();
  }

  // ---- ボトムシート（スマホ） ----------------------------------------------------

  function setSheet(s: SheetState): void {
    sheet = s;
    panel.setAttribute('data-sheet', s);
  }
  function cycleSheet(): void {
    setSheet(sheet === 'collapsed' ? 'half' : sheet === 'half' ? 'full' : 'collapsed');
  }

  // ---- ビューアイベント結線 ------------------------------------------------------

  const offPick = ctx.viewer.onPick((hit) => {
    if (!ctx.store.canMutate) return;
    // ピン追加（PC: Shift+Click / スマホ: 長押し）
    const id = ctx.undo.create('caption', {
      setId: ctx.ui.activeSetId,
      title: '',
      body: '',
      color: currentPinColor(),
      tags: [],
      attachments: [],
      anchor: {
        modelAssetId: ctx.ui.activeModelAssetId,
        position: hit.position,
        ...(hit.normal !== null ? { normal: hit.normal } : {}),
      },
    });
    ctx.ui.selectedCaptionId = id;
    activeTab = 'caption';
    if (panelIsSheet()) setSheet('full'); // 現場動線: 打ったら即編集
    renderTabs();
    ctx.notify();
  });

  const offSelect = ctx.viewer.onPinSelect((id) => {
    ctx.ui.selectedCaptionId = id;
    activeTab = 'caption';
    if (panelIsSheet() && sheet === 'collapsed') setSheet('half');
    renderTabs();
    ctx.notify();
  });

  // 何もない場所のタップ/クリック = 選択解除（オーバーレイを閉じる）
  const offMiss = ctx.viewer.onTapMiss(() => {
    if (ctx.ui.selectedCaptionId === null) return;
    ctx.ui.selectedCaptionId = null;
    ctx.viewer.setPinSelected(null);
    ctx.notify();
  });

  // ギズモドラッグ確定 → アンカー位置を通常編集として記録（Undo可・マージ可）
  const offMove = ctx.viewer.onPinMove((id, position) => {
    if (!ctx.store.canMutate) return;
    const rec = ctx.state.byKind.caption?.[id];
    if (rec === undefined) return;
    const anchor = fAnchor(rec) ?? {};
    ctx.undo.update('caption', id, { anchor: { ...anchor, position } });
  });

  function panelIsSheet(): boolean {
    return globalThis.matchMedia('(max-width: 899px)').matches;
  }

  // ---- 再描画 -----------------------------------------------------------------

  function renderSetSelect(): void {
    clear(setSelect);
    for (const s of ctx.sets()) {
      const opt = el('option', { value: s.id }, `表示セット: ${fStr(s, 'name', '(無名)')}`);
      setSelect.append(opt);
    }
    if (ctx.ui.activeSetId !== null) setSelect.value = ctx.ui.activeSetId;
  }

  function renderStatus(): void {
    const access = describeProjectAccess(ctx.store.accessState, ctx.store.accessDetail);
    accessStatus.textContent = access.compactText;
    accessStatus.title = access.detailText;
    accessStatus.classList.toggle('lv-warn', ctx.store.accessState === 'lock-lost');
    retryAccessBtn.hidden = !access.canRetry;
    const status = describeSaveStatus(
      ctx.store.durabilityStatus,
      deps.unexportedCount(),
      deps.persistentWorkspace,
      deps.packageExportStatus(),
    );
    saveStatus.textContent = status.compactText;
    saveStatus.title = status.detailText;
    retrySaveBtn.hidden = !status.canRetry;
    retrySaveBtn.disabled = !ctx.store.canMutate;
    undoBtn.disabled = !ctx.store.canMutate || !ctx.undo.canUndo;
    redoBtn.disabled = !ctx.store.canMutate || !ctx.undo.canRedo;
    profileBtn.disabled = !ctx.store.canMutate;
    addSetBtn.disabled = !ctx.store.canMutate;
    renameSetBtn.disabled = !ctx.store.canMutate;
    deleteSetBtn.disabled = !ctx.store.canMutate;
    applyMutationControls();
  }

  function applyMutationControls(): void {
    const disabled = !ctx.store.canMutate;
    for (const control of tabBody.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('[data-project-mutation]')) {
      control.disabled = disabled;
    }
  }

  let lastSelectedForMove: string | null = null;
  const offChange = ctx.onChange(() => {
    renderSetSelect();
    renderStatus();
    ctx.syncPins();
    // ピンサイズはモデルassetのpinScaleに保存され、マージで全員に共有される
    const activeAsset = ctx.asset(ctx.ui.activeModelAssetId);
    if (activeAsset !== null) ctx.viewer.setPinScale(fNum(activeAsset, 'pinScale', 1));
    // 移動ギズモは「ピンを移動」ボタンONの間だけ表示。選択が変わったらOFFへ戻す
    if (ctx.ui.selectedCaptionId !== lastSelectedForMove) {
      lastSelectedForMove = ctx.ui.selectedCaptionId;
      ctx.ui.pinMoveMode = false;
    }
    ctx.viewer.showPinGizmo(
      ctx.store.canMutate && ctx.ui.pinMoveMode ? ctx.ui.selectedCaptionId : null,
    );
    const refresh = refreshers.get(activeTab);
    if (refresh !== undefined) refresh();
    applyMutationControls();
  });

  // 初期描画
  renderSetSelect();
  renderStatus();
  renderTabs();
  ctx.syncPins();
  ctx.syncMaterials();

  return () => {
    offPick();
    offSelect();
    offMiss();
    offMove();
    offChange();
    unmountOverlay();
    layout.removeEventListener('click', blockUnauthorizedMutation, true);
    layout.removeEventListener('input', blockUnauthorizedMutation, true);
    layout.removeEventListener('change', blockUnauthorizedMutation, true);
  };
}
