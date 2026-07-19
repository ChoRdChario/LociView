// ビューア画面 — ステージ + パネル（PC: 右 / スマホ: ボトムシート3段階）
// タブ: Caption / Material / Model / Views / データ（コンセンサス確定構成）

import { compareHlc } from '../core/hlc';
import { el, clear } from './dom';
import { fStr } from './fields';
import type { AppContext } from './context';
import { confirmDialog, promptDialog } from './dialogs';
import { currentPinColor, mountCaptionTab } from './tabs/caption';
import { mountDataTab } from './tabs/data';
import { mountMaterialTab } from './tabs/material';
import { mountModelTab } from './tabs/model';
import { applyViewRecordToViewer, mountViewsTab } from './tabs/views';
import { mountCaptionOverlay } from './overlay';

export interface ViewerScreenDeps {
  goHome: () => void;
  loadModelAsset: (assetId: string) => Promise<void>;
  markExported: () => void;
  unsavedCount: () => number;
  openProfile: () => void;
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
  const undoBtn = el('button', { title: '元に戻す (Ctrl+Z)', onclick: () => { ctx.undo.undo(); } }, '↺');
  const redoBtn = el('button', { title: 'やり直す (Ctrl+Y)', onclick: () => { ctx.undo.redo(); } }, '↻');

  const topbar = el('header', { class: 'lv-topbar' },
    el('button', { onclick: deps.goHome, title: 'ホームへ' }, '☰'),
    el('b', { class: 'lv-projname' }, ctx.store.manifest.name),
    saveStatus,
    el('span', { class: 'lv-flex1' }),
    undoBtn, redoBtn,
    el('button', { onclick: deps.openProfile, class: 'lv-profile' }, ctx.displayName(ctx.identity.userId)),
  );

  // ---- ステージ ---------------------------------------------------------------

  const canvas = el('canvas', { class: 'lv-gl' }) as HTMLCanvasElement;
  const stage = el('div', { class: 'lv-stage' }, canvas);
  ctx.viewer.init(canvas);
  const unmountOverlay = mountCaptionOverlay(stage, ctx);
  // 保存済みのピンサイズ設定を適用（Viewsタブのスライダーと連動）
  ctx.viewer.setPinScale(Number(localStorage.getItem('lv-pin-scale') ?? '1'));

  // ---- パネル（セット切替 + タブ） ------------------------------------------------

  const setSelect = el('select', { class: 'lv-set-select' }) as HTMLSelectElement;
  setSelect.addEventListener('change', () => {
    void switchSet(setSelect.value);
  });
  const addSetBtn = el('button', {
    onclick: () => {
      void promptDialog('新しい表示セット', 'セット名（例: 半透明・内部指摘用）').then((name) => {
        if (name === null) return;
        const id = ctx.undo.create('set', { name, order: ctx.sets().length + 1 });
        void switchSet(id);
      });
    },
  }, '＋');
  const renameSetBtn = el('button', {
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

  root.append(el('div', { class: 'lv-viewer-layout' }, topbar, el('div', { class: 'lv-main' }, stage, panel)));

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
          markExported: deps.markExported,
        }));
        break;
    }
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
    const n = deps.unsavedCount();
    saveStatus.textContent = n > 0 ? `✓ 自動保存済み ・ 未書き出しの変更 ${n}件` : '✓ 自動保存済み ・ 書き出し済み';
    undoBtn.disabled = !ctx.undo.canUndo;
    redoBtn.disabled = !ctx.undo.canRedo;
  }

  const offChange = ctx.onChange(() => {
    renderSetSelect();
    renderStatus();
    ctx.syncPins();
    const refresh = refreshers.get(activeTab);
    if (refresh !== undefined) refresh();
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
    offChange();
    unmountOverlay();
  };
}
