import { createViewControls } from '../../ui/projectScene/viewControls';
import { createViewAuthorControls } from '../../ui/projectScene/viewAuthoringControls';
import { type ViewContext, type ViewCameraIntent, type ViewAxis } from '../../ui/projectScene/viewState';
import { planCaptionList } from '../../ui/projectScene/captionListState';
import { createCaptionWindowControls } from '../../ui/projectScene/captionWindowControls';
import { sceneSwitchReason } from '../../ui/projectScene/navigationState';
import { value } from '../../scene/types';
import { pointInProject, syntheticDisplay, type SyntheticDisplay, type V3 } from './viewportModel';
import type { PinSurfaceTarget } from './viewportPicking';
import type { SyntheticSession } from './session';
import type { DisplayCapture } from './viewSession';
import { createMediaGallery } from './mediaControls';

export interface ViewportObservation {
  readonly token: string; readonly ready: boolean; readonly issue: string | null; readonly dragging: boolean;
  /** Changes for geometry/camera lifetime, but not an Orbit start/end without movement. */
  readonly pickToken?: string;
  readonly manipulating?: boolean;
  readonly notice?: string | null;
  readonly projection: 'perspective' | 'orthographic'; readonly axis: ViewAxis | null;
  readonly pins: readonly { id: string; x: number; y: number; visible: boolean }[];
  readonly preview?: { readonly x: number; readonly y: number; readonly visible: boolean };
}
export interface SyntheticViewport {
  update(display: SyntheticDisplay): void; setActive(active: boolean): void;
  read(): ViewportObservation; camera(intent: ViewCameraIntent): void; retry(): void; dispose(): void;
  capture?(): DisplayCapture; recall?(payload: DisplayCapture): void;
  pick?(target: PinSurfaceTarget, xCss: number, yCss: number): V3 | null;
}
export type ViewportFactory = (canvas: HTMLCanvasElement, changed: () => void,
  proposePin?: (target: PinSurfaceTarget, positionAsset: V3) => boolean) => SyntheticViewport;

/** DOM/read-port adapter, not a second camera implementation or durable service. */
export function createViewportHost(document: Document, session: SyntheticSession, changed: () => void, factory?: ViewportFactory) {
  const root = document.createElement('section'); root.className = 'lv-development-viewport'; root.setAttribute('aria-label', '3D表示');
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', '合成モデルの3D表示');
  const overlay = document.createElement('div'); overlay.className = 'lv-development-pin-layer';
  const preview = document.createElement('div'); preview.className = 'lv-development-pin-preview'; preview.textContent = '仮の位置'; preview.hidden = true;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '3D表示を再試行';
  root.append(canvas, overlay, preview);
  let disposed = false, display: SyntheticDisplay | null = null, error: string | null = null;
  let rendering = false, hasRendered = false;
  let active = false, gestureGeneration = 0;
  const pressed = new Set<number>();
  let gesture: { id: number; x: number; y: number; target: PinSurfaceTarget; stamp: string; shortcut: boolean; shifted: boolean } | null = null;
  let runtime: SyntheticViewport | undefined, context: ViewContext, pinKey = '';
  let authorConfirmationMemory: ViewContext['memory'] | undefined;
  const pins = new Map<string, HTMLButtonElement>();
  const view = createViewControls(document, plan => {
    if (disposed) return;
    session.views.accept(plan, currentContext(), payload => {
      if (!runtime || plan.kind !== 'camera') throw new Error('3D表示を確認してください。');
      if (payload) { if (!runtime.recall) throw new Error('視点の呼び出しは未接続です。'); runtime.recall(payload); }
      else runtime.camera(plan.action);
    }); changed();
  });
  const author = createViewAuthorControls(document, event => {
    if (disposed) return;
    const take = runtime?.capture ? () => runtime!.capture!() : undefined;
    const before = session.views.authorContext(currentContext(), take);
    const accepted = session.views.acceptAuthor(event, before);
    if (event.kind === 'apply' && (accepted || session.workingBlock)) authorConfirmationMemory = before.view.memory;
    if (accepted && event.kind === 'apply') {
      // Clear the exact receipt-confirmed draft on its original UI target before
      // showing the newly created selection; never bypass the pending-target guard.
      const after = session.views.authorContext(currentContext(), take);
      author.render({ ...after, view: { ...after.view, memory: before.view.memory } });
      authorConfirmationMemory = undefined;
    }
    changed();
  });
  view.root.append(author.root);
  const windows = createCaptionWindowControls(document, plan => {
    const accepted = session.acceptWindow(plan); changed(); return accepted;
  }, active => { session.setWindowDragging(active); changed(); }, captionId => createMediaGallery(document, () => session.snapshot, captionId));
  const renderStatus = document.createElement('div'); renderStatus.className = 'lv-development-render-status';
  renderStatus.append(status, retry);
  // Keep failure/retry outside the floating-window stack so comparison cannot cover recovery.
  root.append(windows.root); view.stageTools.append(windows.tools, renderStatus);
  function text(e: unknown) { return e instanceof Error ? e.message : '3D表示を確認してください。'; }
  function currentContext(): ViewContext {
    const observation = runtime?.read(), scope = { sceneId: session.sceneId, projectFrameId: session.snapshot.resources.projectFrameId };
    return session.views.context({ ...scope, token: observation?.token ?? 'unconnected',
        ...(observation?.ready && !error ? { kind: 'ready' as const, projection: observation.projection, axis: observation.axis,
          bounds: value(display?.bounds ? 'available' as const : 'empty' as const) } :
          { kind: 'unavailable' as const, reason: error ?? observation?.issue ?? '3D表示は未接続です。' }) },
      observation?.dragging ? 'カメラ操作を終えてください。' : session.pending && !['text', 'composition'].includes(session.pending) ? sceneSwitchReason(session.pending) :
        session.pending === 'composition' && session.views.pending !== 'composition' ? sceneSwitchReason('composition') : null);
  }
  function paint() {
    if (disposed) return;
    context = currentContext(); view.render(context);
    const authorContext = session.views.authorContext(context, runtime?.capture ? () => runtime!.capture!() : undefined);
    if (authorConfirmationMemory && !authorContext.draft) {
      if (author.render({ ...authorContext, view: { ...context, memory: authorConfirmationMemory } })) authorConfirmationMemory = undefined;
    }
    author.render(authorContext);
    const observed = runtime?.read();
    if (!observed?.ready || observed.manipulating || error) { gesture = null; gestureGeneration++; }
    const rect = canvas.getBoundingClientRect?.();
    windows.project({ ready: Boolean(observed?.ready && !error), width: rect?.width ?? 0, height: rect?.height ?? 0, pins: observed?.pins ?? [] });
    const dragChanged = session.setViewportDragging(observed?.dragging ?? false);
    const stateChanged = session.setViewportState(Boolean(observed?.ready && !error), display?.models.filter(m => !('issue' in (display?.materials?.[m.binding.assetId] ?? {}))).map(m => m.binding.assetId) ?? [], error ?? observed?.issue ?? observed?.notice ?? null);
    status.textContent = error ?? observed?.issue ?? observed?.notice ?? (observed?.ready ? '' : '3D表示は未接続です。'); status.hidden = !status.textContent;
    retry.hidden = !factory || (!error && !observed?.issue);
    // Preserve measurable layout while initialization waits for attachment/resize.
    canvas.style.visibility = error || !observed?.ready ? 'hidden' : 'visible';
    for (const [id, pin] of pins) {
      const p = observed?.pins.find(p => p.id === id); pin.hidden = Boolean(error || !observed?.ready || !p?.visible);
      if (p) { pin.style.left = `${p.x}px`; pin.style.top = `${p.y}px`; }
    }
    const ghost = observed?.preview;
    preview.hidden = Boolean(error || !observed?.ready || !ghost?.visible);
    if (ghost) { preview.style.left = `${ghost.x}px`; preview.style.top = `${ghost.y}px`; }
    if ((dragChanged || stateChanged) && hasRendered && !rendering) changed();
  }
  const proposePin = (target: PinSurfaceTarget, position: V3) => {
    const accepted = session.acceptPinSurface(target, position, true); changed(); return accepted;
  };
  try { runtime = factory?.(canvas, paint, proposePin); } catch (e) { error = text(e); }
  const tryAgain = () => {
    if (disposed) return;
    gesture = null; pressed.clear(); gestureGeneration++;
    error = null;
    try { if (!runtime) runtime = factory?.(canvas, paint, proposePin); else runtime.retry(); }
    catch (e) { error = text(e); }
    render(true);
  };
  retry.addEventListener('click', tryAgain);
  function gestureStamp(): string | null {
    if (!active || !runtime?.read().ready || error || !runtime.capture) return null;
    const rect = canvas.getBoundingClientRect();
    if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
    try { return JSON.stringify([runtime.read().pickToken, runtime.capture(), rect.left, rect.top, rect.width, rect.height]); } catch { return null; }
  }
  const modified = (e: PointerEvent) => e.altKey || e.ctrlKey || e.metaKey;
  const down = (e: PointerEvent) => {
    pressed.add(e.pointerId); gesture = null; gestureGeneration++;
    const activeTarget = session.pinSurfaceTarget(), shortcut = !activeTarget && e.shiftKey;
    const target = activeTarget ?? (shortcut ? session.pinShortcutTarget() : null), stamp = gestureStamp();
    if (shortcut && !target && !session.pinCoordinates) { session.message = '追加先モデルを選び、入力中の操作を終えてください。'; changed(); }
    if (pressed.size !== 1 || !e.isPrimary || e.button !== 0 || modified(e) || !runtime?.pick || !target || !stamp ||
      ![e.clientX, e.clientY].every(Number.isFinite)) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, target, stamp, shortcut, shifted: Boolean(e.shiftKey) };
  };
  const move = (e: PointerEvent) => {
    if (gesture?.id === e.pointerId && (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY) ||
      Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 4 || modified(e) || Boolean(e.shiftKey) !== gesture.shifted)) { gesture = null; gestureGeneration++; }
  };
  const up = (e: PointerEvent) => {
    const start = gesture, generation = gestureGeneration; move(e); pressed.delete(e.pointerId);
    const eligible = start && start === gesture && e.pointerId === start.id && e.button === 0 && !modified(e) && pressed.size === 0;
    gesture = null;
    if (!eligible) return;
    // OrbitControls handles pointerup/end in the same dispatch. Do not mistake
    // its start/end on a stationary press for a drag, or capture mid-orbit state.
    queueMicrotask(() => {
      if (disposed || !active || generation !== gestureGeneration || pressed.size || start.stamp !== gestureStamp() ||
        JSON.stringify(start.target) !== JSON.stringify(start.shortcut ? session.pinShortcutTarget() : session.pinSurfaceTarget())) return;
      const rect = canvas.getBoundingClientRect();
      try {
        const hit = runtime?.pick?.(start.target, e.clientX - rect.left, e.clientY - rect.top);
        if (hit) { if (start.shortcut) session.acceptPinShortcut(start.target, hit); else session.acceptPinSurface(start.target, hit); }
        else session.message = '選んだモデルの面を指定してください。指定中の位置は変えていません。';
      } catch (e) { session.message = `${text(e)} 指定中の位置は保持しています。`; }
      changed();
    });
  };
  const cancel = (e: PointerEvent) => { pressed.delete(e.pointerId); gesture = null; gestureGeneration++; };
  const lost = (e: PointerEvent) => { if (pressed.has(e.pointerId)) cancel(e); };
  canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true); canvas.addEventListener('pointercancel', cancel, true); canvas.addEventListener('lostpointercapture', lost, true);
  function render(nextActive: boolean) {
    if (disposed) return;
    if (!nextActive) { gesture = null; pressed.clear(); gestureGeneration++; }
    active = nextActive;
    rendering = true;
    try {
      windows.render({ source: session.captionContext().source, memory: session.windowMemory,
        selectedId: session.memory.selectedCaptionId, moveBlock: session.pending ? sceneSwitchReason(session.pending) : null });
      display = syntheticDisplay(session.snapshot, session.sceneId, session.memory.pinColors, session.memory.selectedCaptionId);
      const proposed = session.pinPreviewAnchor;
      const owner = proposed?.kind === 'asset' ? display.models.find(m => m.binding.assetId === proposed.assetId) : undefined;
      if (proposed?.kind === 'asset' && owner) {
        const position = pointInProject(proposed.positionAsset, owner.binding.assetToProject), target = session.pinSurfaceTarget(true);
        display = { ...display, preview: position, ...(target ? { pinEdit: { target, position,
          enabled: !!session.pinSurfaceTarget(false, true) } } : {}) };
      }
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
    get pickingConnected() { return Boolean(active && runtime?.read().ready && runtime.pick && !error); },
    dispose() { disposed = true; gesture = null; pressed.clear(); gestureGeneration++; windows.dispose(); runtime?.dispose(); author.dispose(); view.dispose();
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move, true); canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel, true); canvas.removeEventListener('lostpointercapture', lost, true);
      retry.removeEventListener('click', tryAgain); root.remove(); } };
}
