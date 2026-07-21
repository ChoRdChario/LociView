// AppContext — 画面間で共有する状態と導出ヘルパ。
// データの正本はProjectStore（reduce済みstate）。ここにはUI一時状態のみ置く。

import type { EntityRecord, ProjectState } from '../core/reduce';
import { isVisible, visibleEntities } from '../core/reduce';
import type { Identity, ProjectStore } from '../core/store';
import type { WorkspaceFS } from '../platform/fs';
import type { ViewerCore } from '../viewer/viewer';
import type { ChromaSettings } from '../viewer/shaderPatch';
import { fAnchor, fStr } from './fields';
import { UndoManager } from './undo';

export interface UiState {
  activeSetId: string | null;
  activeModelAssetId: string | null;
  selectedCaptionId: string | null;
  /** 「ピンを移動」ボタンで切り替える移動ギズモ表示（選択変更でOFFに戻る） */
  pinMoveMode: boolean;
  search: string;
  colorFilter: Set<string>;
}

export class AppContext {
  readonly undo: UndoManager;
  readonly ui: UiState = {
    activeSetId: null,
    activeModelAssetId: null,
    selectedCaptionId: null,
    pinMoveMode: false,
    search: '',
    colorFilter: new Set(),
  };
  /** 添付・サムネイル用のblob URLキャッシュ（assetId → URL） */
  readonly mediaUrls = new Map<string, string>();

  private listeners = new Set<() => void>();

  constructor(
    readonly fs: WorkspaceFS,
    readonly dir: string,
    readonly store: ProjectStore,
    readonly viewer: ViewerCore,
    readonly identity: Identity,
  ) {
    this.undo = new UndoManager(store);
    store.subscribe(() => this.notify());
    // 既定セット・既定モデルの初期解決
    const sets = this.sets();
    this.ui.activeSetId = sets[0]?.id ?? null;
    const models = this.modelAssets();
    this.ui.activeModelAssetId = models[0]?.id ?? null;
  }

  get state(): ProjectState {
    return this.store.state;
  }

  // ---- 導出 ---------------------------------------------------------------

  sets(): EntityRecord[] {
    return visibleEntities(this.state, 'set').sort(
      (a, b) =>
        (typeof a.fields.order === 'number' ? (a.fields.order as number) : 999) -
          (typeof b.fields.order === 'number' ? (b.fields.order as number) : 999) ||
        (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    );
  }

  modelAssets(): EntityRecord[] {
    return visibleEntities(this.state, 'asset').filter((a) => fStr(a, 'kind') === 'model');
  }

  asset(id: string | null): EntityRecord | null {
    if (id === null) return null;
    const rec = this.state.byKind.asset?.[id];
    return rec !== undefined && isVisible(rec) ? rec : null;
  }

  /** アクティブセットのキャプション（検索・色フィルタ適用済み、作成順） */
  captions(): EntityRecord[] {
    const setId = this.ui.activeSetId;
    const q = this.ui.search.trim().toLowerCase();
    return visibleEntities(this.state, 'caption')
      .filter((c) => setId === null || fStr(c, 'setId') === setId)
      .filter((c) => {
        if (this.ui.colorFilter.size > 0 && !this.ui.colorFilter.has(fStr(c, 'color'))) return false;
        if (q === '') return true;
        return (
          fStr(c, 'title').toLowerCase().includes(q) || fStr(c, 'body').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }

  selectedCaption(): EntityRecord | null {
    if (this.ui.selectedCaptionId === null) return null;
    const rec = this.state.byKind.caption?.[this.ui.selectedCaptionId];
    return rec !== undefined && isVisible(rec) ? rec : null;
  }

  /** アクティブセット×アクティブモデルのマテリアル設定 */
  materialSettings(): EntityRecord[] {
    return visibleEntities(this.state, 'material').filter(
      (m) =>
        fStr(m, 'setId') === this.ui.activeSetId &&
        fStr(m, 'modelAssetId') === this.ui.activeModelAssetId,
    );
  }

  /** アクティブセットのビュープリセット（保存順） */
  views(): EntityRecord[] {
    return visibleEntities(this.state, 'view')
      .filter((v) => fStr(v, 'setId') === this.ui.activeSetId)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }

  displayName(userId: string | null): string {
    if (userId === null) return '';
    const p = this.state.byKind.profile?.[userId];
    if (p !== undefined && isVisible(p)) {
      const n = fStr(p, 'displayName');
      if (n !== '') return n;
    }
    return userId.slice(0, 12) + '…';
  }

  // ---- ビューア同期 ----------------------------------------------------------

  /** アクティブセットのピンをビューアへ反映する */
  syncPins(): void {
    this.viewer.clearPins();
    for (const c of this.captions()) {
      const anchor = fAnchor(c);
      if (anchor?.position === undefined) continue;
      if (anchor.modelAssetId !== undefined && anchor.modelAssetId !== this.ui.activeModelAssetId) continue;
      this.viewer.addPin({ id: c.id, position: anchor.position, color: fStr(c, 'color', '#eab308') });
    }
    this.viewer.setPinSelected(this.ui.selectedCaptionId);
  }

  /** セットのマテリアル設定をビューアへ適用する */
  syncMaterials(): void {
    this.viewer.resetAllMaterials();
    for (const m of this.materialSettings()) {
      const key = fStr(m, 'materialKey');
      if (key === '') continue;
      const chromaRaw = m.fields.chroma;
      let chroma: ChromaSettings | null | undefined;
      if (typeof chromaRaw === 'object' && chromaRaw !== null && !Array.isArray(chromaRaw)) {
        const o = chromaRaw as Record<string, unknown>;
        chroma = o.enable === true
          ? {
              enable: true,
              color: typeof o.color === 'string' ? o.color : '#000000',
              tolerance: typeof o.tolerance === 'number' ? o.tolerance : 0.1,
              feather: typeof o.feather === 'number' ? o.feather : 0,
            }
          : null;
      }
      this.viewer.applyMaterialProps(key, {
        opacity: typeof m.fields.opacity === 'number' ? (m.fields.opacity as number) : undefined,
        doubleSided:
          typeof m.fields.doubleSided === 'boolean' ? (m.fields.doubleSided as boolean) : undefined,
        // LociMyu由来は unlitLike、LociView新規は unlit
        unlit:
          m.fields.unlit === true || m.fields.unlitLike === true
            ? true
            : m.fields.unlit === false || m.fields.unlitLike === false
              ? false
              : undefined,
        chroma,
      });
    }
  }

  // ---- 通知 -----------------------------------------------------------------

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    for (const fn of this.listeners) fn();
  }

  async mediaUrl(assetId: string): Promise<string | null> {
    const cached = this.mediaUrls.get(assetId);
    if (cached !== undefined) return cached;
    const asset = this.asset(assetId);
    if (asset === null) return null;
    const path = fStr(asset, 'path');
    if (path === '') return null;
    const bytes = await this.fs.readBytes(`${this.dir}/${path}`);
    if (bytes === null) return null;
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: fStr(asset, 'mime', 'application/octet-stream') }));
    this.mediaUrls.set(assetId, url);
    return url;
  }

  disposeMedia(): void {
    for (const url of this.mediaUrls.values()) URL.revokeObjectURL(url);
    this.mediaUrls.clear();
  }
}
