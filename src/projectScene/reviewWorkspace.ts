import { createCaptionListControls } from '../ui/projectScene/captionListControls';
import { captionListPlanIsCurrent, planCaptionList, type CaptionListContext, type CaptionListPlan } from '../ui/projectScene/captionListState';
import { createCaptionWindowControls } from '../ui/projectScene/captionWindowControls';
import { captionWindowPlanIsCurrent, newCaptionWindowMemory, planCaptionWindow, type CaptionWindowPlan } from '../ui/projectScene/captionWindowState';
import type { SceneUiMemory } from '../ui/projectScene/navigationState';
import type { ViewCameraIntent } from '../ui/projectScene/viewState';
import type { ReviewView } from './reviewView';
import type { ViewportFactory, ProjectViewport } from './viewportPorts';
import { createMediaViewer, createMediaThumbnails, mediaDisplayDescription, type MediaPreviewGroup } from '../ui/projectScene/mediaPreview';
import { createCameraGizmo } from '../ui/projectScene/cameraGizmo';
import { mountContextHelp } from '../ui/projectScene/contextHelp';

/** Standalone snapshot viewing. Only an explicitly confirmed handoff may create an editing Project. */
export function createReviewWorkspace(document: Document, view: ReviewView, factory: ViewportFactory, editCopy?: () => void | Promise<void>) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const root = make('main'); root.className = 'lv-development lv-review-workspace'; root.setAttribute('aria-label', '閲覧用のシーン');
  const stopHelp = mountContextHelp(document, root);
  const header = make('header'); header.className = 'lv-development-header'; header.append(make('span', 'LociView'), make('h1', view.title), make('span', '閲覧中'));
  const content = make('div'); content.className = 'lv-development-content';
  const stage = make('section'); stage.className = 'lv-development-stage'; const viewport = make('section'); viewport.className = 'lv-development-viewport'; viewport.setAttribute('aria-label', '3D表示');
  const canvas = make('canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', '3Dモデルの表示');
  const overlay = make('div'); overlay.className = 'lv-development-pin-layer';
  const sidebar = make('aside'); sidebar.className = 'lv-development-sidebar'; sidebar.setAttribute('aria-label', '閲覧パネル');
  const sceneName = make('h2', view.sceneName), emptyCaptions=make('p','このシーンにキャプションはありません。'),status = make('p'), retry = make('button', '3D表示を再試行'); status.setAttribute('role', 'status'); retry.type = 'button';
  const footer = make('p', '閲覧用ファイルです。元ファイルとブラウザのプロジェクトは変更しません。');
  viewport.append(canvas, overlay); stage.append(viewport); content.append(stage, sidebar); root.append(header, status, retry, content, footer);
  const mediaViewer = createMediaViewer(document); root.append(mediaViewer.root);
  let memory: SceneUiMemory = { selectedCaptionId: null, search: '', pinColors: null, listScrollTop: 0, ownerFilter: { kind: 'all' } };
  let windowsMemory = newCaptionWindowMemory(view.source.sceneId), composing = false, moving = false, disposed = false, rendering = false;
  let runtime: ProjectViewport | undefined, display = view.display(null, null), failure = '', rendererFailure = '';
  const copy = make('button', '編集コピーを作る'), confirmation = make('section'); copy.type = 'button'; copy.hidden = !editCopy;
  confirmation.hidden = true; confirmation.setAttribute('aria-label', '編集コピーの確認');
  confirmation.append(make('p', '独立したプロジェクトを作成します。元ファイルは変更しません。元のプロジェクトへの変更分の返送には使えません。'));
  const effects = view.inspection.review.editEffect;
  if (effects.missingModelCaptions || effects.newlyNeedsReviewCaptions) confirmation.append(make('p',
    `対応モデルなし：${effects.missingModelCaptions}件。要確認になるピン：${effects.newlyNeedsReviewCaptions}件。位置が分かるピンは残します。`));
  const confirmCopy = make('button', 'コピーを作成'), cancelCopy = make('button', '戻る'); confirmCopy.type = cancelCopy.type = 'button';
  confirmation.append(confirmCopy, cancelCopy); header.append(copy); root.append(confirmation);
  copy.addEventListener('click', () => { if (!disposed && !composing && !moving) confirmation.hidden = false; });
  cancelCopy.addEventListener('click', () => { confirmation.hidden = true; });
  confirmCopy.addEventListener('click', () => {
    if (disposed || composing || moving || confirmation.hidden || confirmCopy.disabled) return;
    confirmCopy.disabled = cancelCopy.disabled = copy.disabled = true;
    void Promise.resolve().then(() => editCopy?.()).catch(error => { if (!disposed) { failure = (error as Error).message; paint(); } })
      .finally(() => { if (!disposed) confirmCopy.disabled = cancelCopy.disabled = copy.disabled = false; });
  });
  const pins = new Map<string, HTMLButtonElement>();
  const context = (): CaptionListContext => ({ source: view.source, memory, pending: composing ? 'composition' : null, mutationBlock: '閲覧用ファイルです。' });
  function windowPlan(plan: CaptionWindowPlan) {
    if (disposed || !captionWindowPlanIsCurrent(plan, view.source, windowsMemory, memory.selectedCaptionId) || plan.kind === 'blocked') return false;
    windowsMemory = plan.memory; render(); return true;
  }
  function openWindow(captionId: string) {
    memory = { ...memory, selectedCaptionId: captionId };
    const plan = planCaptionWindow(view.source, windowsMemory, captionId, { kind: 'open', captionId });
    if (plan.kind === 'change') windowsMemory = plan.memory;
  }
  function accept(plan: CaptionListPlan) {
    if (disposed || !captionListPlanIsCurrent(plan, context())) return;
    if (plan.kind === 'blocked') { failure = plan.reason; paint(); return; }
    if (plan.kind === 'change' && plan.intent === 'scroll') {
      memory = plan.memory; list.render(context()); return;
    }
    if (plan.kind === 'change') { memory = plan.memory; if (plan.intent === 'select' && memory.selectedCaptionId) openWindow(memory.selectedCaptionId); }
    else if (plan.kind === 'unchanged' && plan.explicitSelection) openWindow(plan.explicitSelection.captionId);
    else if (plan.kind === 'effect' && plan.action === 'review') openWindow(plan.captionId);
    else return;
    failure = ''; render();
    if (plan.kind === 'change' && (plan.intent === 'select' || plan.intent === 'revealSelection') ||
      plan.kind === 'unchanged' && plan.explicitSelection || plan.kind === 'effect') list.revealSelected();
  }
  const list = createCaptionListControls(document, accept, active => { composing = active; paint(); });
  const mediaGroup = (captionId: string): MediaPreviewGroup => {
    const caption = view.source.captions.find(c => c.id === captionId);
    return { scope: JSON.stringify([view.source.token, captionId]), label: caption?.title.kind === 'value' ? caption.title.value || 'キャプション' : 'キャプション',
      items: view.attachments.filter(a => a.captionId === captionId).map(a => {
        const media = (view.inspection.review.snapshot.mediaResourcesById as Record<string, { label: string;mediaKind:'image'|'video'|'audio';portableDisplay?:unknown }>)[String(a.mediaResourceId)];
        const blob = view.images.get(String(a.mediaResourceId));
        return { id: String(a.id), resourceId: String(a.mediaResourceId), label: media?.label ?? 'メディア',kind:media?.mediaKind, description: mediaDisplayDescription(String(a.altText || ''),media?.portableDisplay!==undefined), image: blob ? { blob } : null };
      }) };
  };
  const gallery = (captionId: string) => {
    const root = make('section'); root.className = 'lv-development-media-gallery'; root.setAttribute('aria-label', '添付メディア');
    const thumbs = createMediaThumbnails(document, () => disposed ? null : mediaGroup(captionId), mediaViewer); root.append(thumbs.root);
    return { root, render: thumbs.render, dispose() { thumbs.dispose(); root.remove(); } };
  };
  const windows = createCaptionWindowControls(document, windowPlan, active => { moving = active; paint(); }, gallery);
  const selectedMedia = make('section'); selectedMedia.setAttribute('aria-label', '選択中のキャプションのメディア');
  let panelGallery: ReturnType<typeof gallery> | null = null, panelCaption: string | null = null;
  viewport.append(windows.root); sidebar.append(sceneName, emptyCaptions, list.root, selectedMedia);
  const views = make('details'), title = make('summary', '視点'); views.append(title);
  const cameraAction = (action: () => void) => {
    if (disposed || composing || moving) return; try { action(); failure = ''; } catch (error) { failure = (error as Error).message; } paint();
  };
  const cameraButtons: HTMLButtonElement[] = [];
  const cameraButton = (text: string, action: () => void) => { const button = make('button', text); button.type = 'button'; button.addEventListener('click', () => { if (!button.disabled) cameraAction(action); }); cameraButtons.push(button); views.append(button); };
  const camera = (intent: ViewCameraIntent) => { if (!runtime) throw Error('3D表示を確認してください。'); runtime.camera(intent); };
  const axes = { right: '+x', left: '-x', top: '+y', bottom: '-y', front: '+z', back: '-z' } as const;
  const cameraGizmo = createCameraGizmo(document, axis => cameraAction(() => camera({ kind: 'axis', axis: axes[axis] })), () => cameraAction(() => camera({ kind: 'fit' })));
  viewport.append(cameraGizmo.root);
  const projectionLabel = make('label', '投影方式'), projection = make('select'); projection.setAttribute('aria-label', '投影方式');
  for (const [value, text] of [['perspective', '透視投影'], ['orthographic', '平行投影']]) { const option = make('option', text); option.value = value!; projection.append(option); }
  projectionLabel.append(projection); views.append(projectionLabel);
  projection.addEventListener('change', () => { if (!projection.disabled) cameraAction(() => camera({ kind: 'projection', projection: projection.value === 'orthographic' ? 'orthographic' : 'perspective' })); });
  for (const saved of view.views) cameraButton(String(saved.name), () => { if (!runtime?.recall) throw Error('視点を呼び出せません。'); runtime.recall(view.capture(String(saved.id))); });
  sidebar.append(views, windows.tools);
  function paint() {
    if (disposed) return; const observation = runtime?.read(), ready = !!observation?.ready && observation.display === display;
    const cameraBlocked = !ready || composing || moving || !!observation?.dragging;
    let captured: unknown; try { captured = runtime?.capture?.().camera; } catch { /* Camera preparation remains local. */ }
    cameraGizmo.render({ camera: captured, axis: observation?.axis ?? null, blocked: cameraBlocked || !display.bounds });
    projection.disabled = cameraBlocked; projection.value = observation?.projection ?? 'perspective';
    for (const button of cameraButtons) button.disabled = cameraBlocked || !runtime?.recall;
    status.textContent = rendererFailure || failure || observation?.issue || observation?.notice || ''; retry.hidden = !!runtime && !observation?.issue&&!observation?.retryAvailable;
    const wanted = new Set(display.pins.map(p => p.id));
    for (const [id, pin] of pins) if (!wanted.has(id)) { pin.remove(); pins.delete(id); }
    for (const pin of display.pins) {
      let button = pins.get(pin.id);
      if (!button) { button = make('button'); button.type = 'button'; button.className = 'lv-development-pin';
        button.addEventListener('click', () => accept(planCaptionList(context(), { kind: 'select', captionId: pin.id }))); pins.set(pin.id, button); overlay.append(button); }
      button.textContent = pin.title || 'キャプション'; button.style.backgroundColor = pin.color; button.setAttribute('aria-current', String(memory.selectedCaptionId === pin.id));
      button.style.transform = `translate(-50%, -50%) scale(${pin.scale ?? 1})`;
      button.dataset.status = pin.status;
      const point = observation?.pins.find(p => p.id === pin.id); button.hidden = !ready || !point?.visible;
      if (point) { button.style.left = `${point.x}px`; button.style.top = `${point.y}px`; }
    }
    const bounds = canvas.getBoundingClientRect?.() ?? { width: 0, height: 0 }; windows.project({ ready, width: bounds.width, height: bounds.height,
      sourceToken: display.token, sceneId: display.sceneId, pins: ready ? observation!.pins : [] });
  }
  function render() {
    if (disposed || rendering) return; rendering = true;
    try { list.render(context());
      if (panelCaption !== memory.selectedCaptionId) { panelGallery?.dispose(); panelCaption = memory.selectedCaptionId;
        panelGallery = panelCaption ? gallery(panelCaption) : null; if (panelGallery) selectedMedia.append(panelGallery.root); }
      panelGallery?.render(); mediaViewer.render();
      windows.render({ source: view.source, memory: windowsMemory, selectedId: memory.selectedCaptionId,
      moveBlock: composing ? '文字の入力を確定してください。' : null });
      const empty=view.source.captions.length===0;emptyCaptions.hidden=!empty;list.root.hidden=selectedMedia.hidden=windows.tools.hidden=empty;
      display = view.display(memory.pinColors, memory.selectedCaptionId); runtime?.update(display); paint(); }
    catch (error) { failure = (error as Error).message; paint(); } finally { rendering = false; }
  }
  function startRenderer() {
    let candidate: ProjectViewport | undefined;
    try { candidate = factory(canvas, paint); candidate.update(display); candidate.setActive(true); runtime = candidate; rendererFailure = ''; }
    catch (error) { candidate?.dispose(); rendererFailure = (error as Error).message; }
  }
  retry.addEventListener('click', () => {
    if (disposed || composing || moving) return;
    try { if (runtime) runtime.retry(); else startRenderer(); failure = ''; }
    catch (error) { failure = (error as Error).message; } paint();
  });
  render();
  startRenderer(); paint();
  return { root, render, hasChanges: () => composing || moving, dispose() { if (disposed) return; disposed = true;
    cameraGizmo.dispose(); stopHelp(); list.dispose(); panelGallery?.dispose(); windows.dispose(); mediaViewer.dispose(); runtime?.dispose(); pins.clear(); root.remove(); } };
}
