import { detectFormat, disposeModelResources, loadModel } from '../viewer/loaders';
import type { ProjectMutationSession } from '../platform/projectLock';
import type { AppContext } from './context';
import { fStr } from './fields';

export interface ModelDisplayOwner {
  readonly context: AppContext;
  readonly access: ProjectMutationSession;
  readonly navigation: number;
}

/** App-owned display preparation; never changes Project records or source files. */
export function createModelDisplayLoader(
  owner: () => ModelDisplayOwner | null,
  report: (title: string, message: string) => Promise<void>,
  recovered: () => void,
) {
  let generation = 0;
  let pending: AbortController | null = null;
  let recoveryTarget: { context: AppContext; assetId: string } | null = null;
  function cancel(): void {
    generation += 1;
    pending?.abort();
    pending = null;
  }
  async function load(assetId: string, restoredRecovery?: number): Promise<void> {
    cancel();
    const captured = owner();
    if (captured === null) return;
    const { context: ctx } = captured;
    if (restoredRecovery !== undefined && ctx.viewer.displayRecovery !== restoredRecovery) return;
    if (ctx.viewer.displayRecovery === null) recoveryTarget = null;
    else if (restoredRecovery !== undefined) recoveryTarget = { context: ctx, assetId };
    const display = ctx.viewer.prepareDisplay();
    if (display !== 'ready') {
      if (display === 'failed') await report('3D表示を再開できませんでした', '他のアプリを閉じてから、Modelタブの「表示」で再試行してください。');
      return;
    }
    const controller = new AbortController();
    pending = controller;
    const started = generation;
    let recovery = ctx.viewer.displayRecovery;
    const owned = (): boolean => {
      const live = owner();
      return live?.context === ctx && live.access === captured.access && live.navigation === captured.navigation
        && generation === started && !controller.signal.aborted;
    };
    const current = (): boolean => owned() && ctx.viewer.isDisplayAvailable() && ctx.viewer.displayRecovery === recovery;
    let adopted = false;
    try {
      if (recovery !== null && (recoveryTarget?.context !== ctx || recoveryTarget.assetId !== assetId)) {
        // An intentional different-model selection keeps normal camera fitting.
        ctx.viewer.finishDisplayRecovery(recovery);
        recovery = null;
        recoveryTarget = null;
      }
      const asset = ctx.asset(assetId);
      if (asset === null) {
        if (recovery !== null) ctx.viewer.finishDisplayRecovery(recovery);
        return;
      }
      const originalPath = fStr(asset, 'path');
      const optimizedPath = fStr(asset, 'optimizedPath');
      let displayPath = optimizedPath || originalPath;
      let bytes = await ctx.fs.readBytes(`${ctx.dir}/${displayPath}`);
      if (!current()) return;
      if (bytes === null && optimizedPath !== '') {
        displayPath = originalPath;
        bytes = await ctx.fs.readBytes(`${ctx.dir}/${displayPath}`);
        if (!current()) return;
      }
      if (bytes === null) throw new Error('ファイルが見つかりません。差分ZIPで受け取った場合はフルZIPの取込が必要です。');
      const format = detectFormat(displayPath, bytes);
      if (format === null) throw new Error('対応していない形式です。');
      const model = await loadModel(format, bytes, { signal: controller.signal });
      if (!current() || ctx.asset(assetId) !== asset) {
        disposeModelResources(model.root);
        return;
      }
      adopted = true;
      ctx.viewer.setModel(model);
      ctx.ui.activeModelAssetId = assetId;
      ctx.ui.loadedModelAssetId = assetId;
      const transform = asset.fields.transform;
      const t = typeof transform === 'object' && transform !== null && !Array.isArray(transform)
        ? transform as Record<string, unknown> : {};
      ctx.viewer.setModelTransform({ scale: typeof t.scale === 'number' ? t.scale : 1, upAxis: t.upAxis === 'Z' ? 'Z' : 'Y' });
      ctx.syncPins();
      ctx.syncMaterials();
      if (recovery !== null) {
        ctx.viewer.finishDisplayRecovery(recovery);
        recoveryTarget = null;
      }
      ctx.notify();
      if (recovery !== null) recovered();
    } catch (error) {
      if (owned() && ctx.viewer.isDisplayAvailable()
          && (ctx.viewer.displayRecovery === recovery || ctx.viewer.displayRecovery === null)) {
        if (adopted) {
          ctx.ui.loadedModelAssetId = null;
          ctx.viewer.clearModel();
          ctx.notify();
        }
        // Keep the same-Asset camera/point settings for the existing 「表示」 retry.
        await report('モデル読込失敗', error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (pending === controller) pending = null;
    }
  }
  function reset(): void {
    cancel();
    recoveryTarget = null;
  }
  return { load, cancel, reset };
}
