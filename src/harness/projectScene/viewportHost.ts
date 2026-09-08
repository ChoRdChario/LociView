import { createViewControls } from '../../ui/projectScene/viewControls';
import { newViewMemory, viewPlanIsCurrent, type ViewContext, type ViewCameraIntent, type ViewAxis } from '../../ui/projectScene/viewState';
import { planCaptionList } from '../../ui/projectScene/captionListState';
import { createCaptionWindowControls } from '../../ui/projectScene/captionWindowControls';
import { sceneSwitchReason } from '../../ui/projectScene/navigationState';
import { value } from '../../scene/types';
import { syntheticDisplay, type SyntheticDisplay } from './viewportModel';
import type { SyntheticSession } from './session';

export interface ViewportObservation {
  readonly token: string; readonly ready: boolean; readonly issue: string | null; readonly dragging: boolean;
  readonly projection: 'perspective' | 'orthographic'; readonly axis: ViewAxis | null;
  readonly pins: readonly { id: string; x: number; y: number; visible: boolean }[];
}
export interface SyntheticViewport {
  update(display: SyntheticDisplay): void; setActive(active: boolean): void;
  read(): ViewportObservation; camera(intent: ViewCameraIntent): void; retry(): void; dispose(): void;
}
export type ViewportFactory = (canvas: HTMLCanvasElement, changed: () => void) => SyntheticViewport;

/** DOM/read-port adapter, not a second camera implementation or durable service. */
export function createViewportHost(document: Document, session: SyntheticSession, changed: () => void, factory?: ViewportFactory) {
  const root = document.createElement('section'); root.className = 'lv-development-viewport'; root.setAttribute('aria-label', '3D表示');
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', '合成モデルの3D表示');
  const overlay = document.createElement('div'); overlay.className = 'lv-development-pin-layer';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '3D表示を再試行';
  root.append(canvas, overlay);
  let disposed = false, display: SyntheticDisplay | null = null, error: string | null = null;
  let rendering = false, hasRendered = false;
  let runtime: SyntheticViewport | undefined, context: ViewContext, pinKey = '';
  const pins = new Map<string, HTMLButtonElement>();
  const view = createViewControls(document, plan => {
    if (disposed || !viewPlanIsCurrent(plan, currentContext())) return;
    if (plan.kind !== 'camera' || !runtime) return;
    try { runtime.camera(plan.action); error = null; } catch (e) { error = text(e); }
    paint();
  });
  const windows = createCaptionWindowControls(document, plan => {
    const accepted = session.acceptWindow(plan); changed(); return accepted;
  }, active => { session.setWindowDragging(active); changed(); });
  const renderStatus = document.createElement('div'); renderStatus.className = 'lv-development-render-status';
  renderStatus.append(status, retry);
  // Keep failure/retry outside the floating-window stack so comparison cannot cover recovery.
  root.append(windows.root); view.stageTools.append(windows.tools, renderStatus);
  function text(e: unknown) { return e instanceof Error ? e.message : '3D表示を確認してください。'; }
  function currentContext(): ViewContext {
    const observation = runtime?.read(), scope = { sceneId: session.sceneId, projectFrameId: session.snapshot.resources.projectFrameId };
    return { source: { ...scope, token: session.snapshot.state.token, kind: 'unavailable', reason: '保存した視点は未接続です。' },
      memory: newViewMemory(session.sceneId), runtime: { ...scope, token: observation?.token ?? 'unconnected',
        ...(observation?.ready && !error ? { kind: 'ready' as const, projection: observation.projection, axis: observation.axis,
          bounds: value(display?.bounds ? 'available' as const : 'empty' as const) } :
          { kind: 'unavailable' as const, reason: error ?? observation?.issue ?? '3D表示は未接続です。' }) },
      cameraBlock: observation?.dragging ? 'カメラ操作を終えてください。' : session.pending === 'window' ? sceneSwitchReason('window') : null,
      mutationBlock: '保存した視点の編集は未接続です。', cameraFeedback: { kind: 'idle' }, entryFeedback: { kind: 'idle' } };
  }
  function paint() {
    if (disposed) return;
    context = currentContext(); view.render(context);
    const observed = runtime?.read();
    const rect = canvas.getBoundingClientRect?.();
    windows.project({ ready: Boolean(observed?.ready && !error), width: rect?.width ?? 0, height: rect?.height ?? 0, pins: observed?.pins ?? [] });
    const dragChanged = session.setViewportDragging(observed?.dragging ?? false);
    const stateChanged = session.setViewportState(Boolean(observed?.ready && !error), display?.models.map(m => m.binding.assetId) ?? [], error ?? observed?.issue ?? null);
    status.textContent = error ?? observed?.issue ?? (observed?.ready ? '' : '3D表示は未接続です。'); status.hidden = !status.textContent;
    retry.hidden = !factory || (!error && !observed?.issue);
    // Preserve measurable layout while initialization waits for attachment/resize.
    canvas.style.visibility = error || !observed?.ready ? 'hidden' : 'visible';
    for (const [id, pin] of pins) {
      const p = observed?.pins.find(p => p.id === id); pin.hidden = Boolean(error || !observed?.ready || !p?.visible);
      if (p) { pin.style.left = `${p.x}px`; pin.style.top = `${p.y}px`; }
    }
    if ((dragChanged || stateChanged) && hasRendered && !rendering) changed();
  }
  try { runtime = factory?.(canvas, paint); } catch (e) { error = text(e); }
  const tryAgain = () => {
    if (disposed) return;
    error = null;
    try { if (!runtime) runtime = factory?.(canvas, paint); else runtime.retry(); }
    catch (e) { error = text(e); }
    render(true);
  };
  retry.addEventListener('click', tryAgain);
  function render(active: boolean) {
    if (disposed) return;
    rendering = true;
    try {
      windows.render({ source: session.captionContext().source, memory: session.windowMemory,
        selectedId: session.memory.selectedCaptionId, moveBlock: session.pending ? sceneSwitchReason(session.pending) : null });
      display = syntheticDisplay(session.snapshot, session.sceneId, session.memory.pinColors, session.memory.selectedCaptionId);
      const key = JSON.stringify([display.token, display.sceneId, display.pins, display.selectedId]);
      if (key !== pinKey) {
        pinKey = key; pins.clear(); overlay.replaceChildren();
        for (const source of display.pins) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = source.title;
          button.className = 'lv-development-pin'; button.style.backgroundColor = source.color;
          button.setAttribute('aria-pressed', String(source.id === display.selectedId)); button.title = source.title;
          const expected = display;
          button.addEventListener('click', () => {
            if (disposed || button.hidden || display?.token !== expected.token || display.sceneId !== expected.sceneId ||
              !display.pins.some(pin => pin.id === source.id)) return;
            session.acceptList(planCaptionList(session.captionContext(), { kind: 'select', captionId: source.id })); changed();
          });
          pins.set(source.id, button); overlay.append(button);
        }
      }
      runtime?.update(display); runtime?.setActive(active); error = null;
    } catch (e) { error = text(e); runtime?.setActive(false); }
    paint(); rendering = false; hasRendered = true;
  }
  return { root, view: view.root, stageTools: view.stageTools, render,
    get connected() { return Boolean(runtime?.read().ready && !error); },
    dispose() { disposed = true; windows.dispose(); runtime?.dispose(); view.dispose(); retry.removeEventListener('click', tryAgain); root.remove(); } };
}
