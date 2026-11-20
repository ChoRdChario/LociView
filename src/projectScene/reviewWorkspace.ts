import { createCaptionListControls } from '../ui/projectScene/captionListControls';
import { captionListPlanIsCurrent, planCaptionList, type CaptionListContext, type CaptionListPlan } from '../ui/projectScene/captionListState';
import { createCaptionWindowControls } from '../ui/projectScene/captionWindowControls';
import { captionWindowPlanIsCurrent, captionWindowView, newCaptionWindowMemory, planCaptionWindow, type CaptionWindowMemory, type CaptionWindowPlan } from '../ui/projectScene/captionWindowState';
import type { SceneUiMemory } from '../ui/projectScene/navigationState';
import type { ViewCameraIntent } from '../ui/projectScene/viewState';
import type { ReviewView } from './reviewView';
import type { ViewportFactory, ProjectViewport } from './viewportPorts';
import { createMediaViewer, createMediaThumbnails, mediaDisplayDescription, type MediaPreviewGroup } from '../ui/projectScene/mediaPreview';
import { createMediaResidencyGate } from '../ui/projectScene/mediaPreviewResources';
import { createCameraGizmo } from '../ui/projectScene/cameraGizmo';
import { createPinCameraSurface } from '../ui/projectScene/pinCameraSurface';
import { contextHelp, mountContextHelp } from '../ui/projectScene/contextHelp';
import { createFailureDetails, failurePresentation } from '../ui/projectScene/storageFeedback';
import { displayBlobRef } from '../domain/portableMedia';
import type { JsonObject } from '../domain/values';

export interface ReviewAppendPort {
  projects(): Promise<readonly { run: string; title: string }[]>;
  inspect(run: string): Promise<{ reason: string; confirm(): Promise<void> }>;
}
export interface ReviewReadingPosition {
  memory: SceneUiMemory;
  windows: CaptionWindowMemory;
}
export interface ReviewTextSelection {
  query: string;
  captionId: string | null;
  focus: 'row' | 'detail' | 'search' | null;
  surface: 'list' | 'detail';
  picked: boolean;
  focusedRowId?: string;
  scrollTop?: number;
}

/** Standalone snapshot viewing. Only an explicitly confirmed handoff may create an editing Project. */
export function createReviewWorkspace(document: Document, view: ReviewView, factory: ViewportFactory, editCopy?: () => void | Promise<void>, append?: ReviewAppendPort,
  switchScene?: (id: string) => Promise<void> | void, openProject?: () => void, position?: ReviewReadingPosition, reading?: ReviewTextSelection) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const root = make('main'); root.className = 'lv-development lv-review-workspace'; root.setAttribute('aria-label', '閲覧用のシーン');
  const stopHelp = mountContextHelp(document, root);
  const header = make('header'), heading = make('h1', view.title), readingBadge = make('span', '閲覧中'), files = make('details');
  const fileToggle = make('summary', 'ファイル'), actions = make('div');
  header.className = 'lv-development-header lv-review-header';
  heading.title = view.title;
  heading.tabIndex = -1;
  files.className = 'lv-review-files';
  files.append(fileToggle, actions);
  files.hidden = !editCopy && !append && !openProject;
  header.append(heading, readingBadge, files);
  function dismissFiles(event: Event): void {
    if (files.open && !files.contains(event.target as Node)) files.open = false;
  }
  document.addEventListener?.('pointerdown', dismissFiles);
  document.addEventListener?.('focusin', dismissFiles);
  files.addEventListener('keydown', event => {
    if (event.key === 'Escape' && files.open && !event.isComposing) {
      event.preventDefault();
      files.open = false;
      fileToggle.focus();
    }
  });
  function restoreActionFocus(button: HTMLButtonElement): void {
    files.open = true;
    button.focus();
  }
  const content = make('div'); content.className = 'lv-development-content';
  const stage = make('section'); stage.className = 'lv-development-stage'; const viewport = make('section'); viewport.className = 'lv-development-viewport'; viewport.setAttribute('aria-label', '3D表示');
  const canvas = make('canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', '3Dモデルの表示');
  const searchRecords = make('button', '記録を検索'); searchRecords.type = 'button'; searchRecords.className = 'lv-stage-search';
  const overlay = make('div'); overlay.className = 'lv-development-pin-layer';
  const sidebar = make('aside'); sidebar.className = 'lv-development-sidebar'; sidebar.setAttribute('aria-label', '閲覧パネル');
  const emptyCaptions=make('p','このシーンに記録はありません。'),status = make('p'), retry = make('button', '3D表示を再試行'); status.setAttribute('role', 'status'); retry.type = 'button';
  const renderStatus = make('div'), failureDetails = createFailureDetails(document); renderStatus.className = 'lv-review-render-status'; renderStatus.append(status, retry, failureDetails.root);
  const cameraSurface = createPinCameraSurface(document, canvas, searchRecords, overlay, viewport,
    () => !disposed && !handoffBusy && !composing && !moving && !content.inert, activatePin);
  viewport.append(cameraSurface, renderStatus); stage.append(viewport); content.append(stage, sidebar); root.append(header, content);
  let readingDetail = false;
  const mediaWork = createMediaResidencyGate(document, render, () => runtime?.idle?.() ?? Promise.resolve(), () => !disposed, () => !!phone?.matches && readingDetail);
  const mediaViewer = createMediaViewer(document, view.rasterResources,view.imageDimensions,mediaWork.acquire); root.append(mediaViewer.root);
  let memory: SceneUiMemory = position?.memory ?? { selectedCaptionId: null, search: '', pinColors: null, listScrollTop: 0, ownerFilter: { kind: 'all' } };
  if (reading) memory = { ...memory, search: reading.query, selectedCaptionId: reading.captionId ?? memory.selectedCaptionId,
    listScrollTop: reading.scrollTop ?? (reading.query === memory.search ? memory.listScrollTop : 0) };
  const phone = document.defaultView?.matchMedia?.('(pointer: coarse) and (max-width: 760px), (pointer: coarse) and (max-width: 950px) and (max-height: 480px)');
  let windowsMemory = position?.windows ?? newCaptionWindowMemory(view.source.sceneId), composing = false, moving = false, disposed = false, rendering = false;
  let runtime: ProjectViewport | undefined, display = view.display(null, null), failure = '', rendererFailure = '';
  let retirement: Promise<void> | undefined;
  const copy = make('button', '編集コピーを作る'), confirmation = make('section'); copy.type = 'button'; copy.hidden = !editCopy;
  confirmation.hidden = true; confirmation.tabIndex = -1; confirmation.className = 'lv-review-handoff';
  confirmation.setAttribute('aria-label', '編集コピーの確認');
  confirmation.append(make('h2', '編集コピーを作成'), make('p', '独立したプロジェクトを作成します。元ファイルは変更しません。元のプロジェクトへの変更分の返送には使えません。'));
  const effects = view.inspection.review.editEffect;
  if (effects.missingModelCaptions || effects.newlyNeedsReviewCaptions) confirmation.append(make('p',
    `対応モデルなし：${effects.missingModelCaptions}件。要確認になるピン：${effects.newlyNeedsReviewCaptions}件。位置が分かるピンは残します。`));
  const confirmCopy = make('button', 'コピーを作成'), cancelCopy = make('button', '戻る'); confirmCopy.type = cancelCopy.type = 'button';
  let handoffBusy = false, refreshAppend = () => {};
  const setHandoffBusy = (active: boolean) => {
    handoffBusy = active; confirmCopy.disabled = cancelCopy.disabled = copy.disabled = active; refreshAppend(); render();
  };
  confirmation.append(confirmCopy, cancelCopy); actions.append(copy); root.insertBefore(confirmation, content);
  copy.addEventListener('click', () => {
    if (disposed || handoffBusy || copy.disabled || composing || moving) return;
    files.open = false;
    confirmation.hidden = false;
    confirmation.focus();
  });
  cancelCopy.addEventListener('click', () => {
    if (handoffBusy || cancelCopy.disabled) return;
    confirmation.hidden = true;
    restoreActionFocus(copy);
  });
  confirmCopy.addEventListener('click', () => {
    if (disposed || handoffBusy || composing || moving || confirmation.hidden || confirmCopy.disabled) return;
    setHandoffBusy(true);
    void Promise.resolve().then(async () => { await runtime?.idle?.(); if (!disposed) await editCopy?.(); }).catch(error => { if (!disposed) { failure = (error as Error).message; paint(); } })
      .finally(() => { if (!disposed) setHandoffBusy(false); });
  });
  if (append) {
    const open = make('button', '既存に追加'), panel = make('section'), select = make('select'), label = make('label', '追加先'),
      note = make('p'), confirm = make('button', 'シーンを追加'), cancel = make('button', 'キャンセル');
    panel.className = 'lv-review-handoff'; panel.hidden = true; panel.setAttribute('aria-label', 'シーンの追加');
    open.type = confirm.type = cancel.type = 'button'; confirm.disabled = true;
    note.setAttribute('role', 'status'); select.setAttribute('aria-label', '追加先'); label.append(select);
    const count = (name: string) => view.inspection.review.summary.entityClasses.find(entry => entry.class === name)?.count ?? 0;
    const models = Object.values(view.inspection.review.snapshot.assetsById as JsonObject).filter(asset => (asset as JsonObject).kind === 'visual').length;
    panel.append(make('h2', count('scenesById') > 1 ? `${count('scenesById')}シーンを追加` : view.sceneName), make('p', `モデル ${models}・記録 ${count('captionsById')}・メディア ${count('mediaResourcesById')}`),
      label, note, confirm, cancel);
    actions.append(open); root.insertBefore(panel, content);
    let revision = 0, pending: (() => Promise<void>) | undefined, loading = false, hasProjects = false;
    refreshAppend = () => {
      open.disabled = handoffBusy || loading; select.disabled = handoffBusy || loading || !hasProjects;
      confirm.disabled = handoffBusy || !pending; cancel.disabled = handoffBusy;
    };
    refreshAppend();
    const selectProject = async () => {
      if (disposed || handoffBusy || select.disabled) return;
      const current = ++revision, run = select.value;
      pending = undefined; note.textContent = ''; refreshAppend();
      if (!run) return;
      note.textContent = '追加先を確認しています。';
      try {
        const checked = await append.inspect(run);
        if (disposed || current !== revision) return;
        note.textContent = checked.reason ? `${checked.reason} 単独で作業するには「編集コピーを作る」を選べます。` : '';
        if (!checked.reason) pending = checked.confirm;
      } catch (error) { if (!disposed && current === revision) note.textContent = (error as Error).message; }
      finally { if (!disposed && current === revision) refreshAppend(); }
    };
    open.addEventListener('click', () => {
      if (disposed || handoffBusy || composing || moving || open.disabled) return;
      const current = ++revision;
      files.open = false;
      panel.tabIndex = -1;
      confirmation.hidden = true;
      panel.hidden = false;
      panel.focus();
      loading = true;
      hasProjects = false;
      pending = undefined;
      refreshAppend();
      select.replaceChildren(); note.textContent = 'プロジェクトを確認しています。';
      void append.projects().then(projects => {
        if (disposed || current !== revision) return;
        const placeholder = make('option', 'プロジェクトを選ぶ'); placeholder.value = ''; select.append(placeholder);
        const names = new Map<string, number>();
        for (const project of projects) names.set(project.title, (names.get(project.title) ?? 0) + 1);
        for (const project of projects) {
          const title = names.get(project.title) === 1 ? project.title : `${project.title}（${project.run.slice(-8)}）`;
          const option = make('option', title); option.value = project.run; select.append(option);
        }
        hasProjects = !!projects.length; loading = false; refreshAppend();
        note.textContent = projects.length ? '' : '追加できるプロジェクトがありません。';
        if (projects.length && !handoffBusy) select.focus();
      }).catch(error => { if (!disposed && current === revision) note.textContent = (error as Error).message; })
        .finally(() => { if (!disposed && current === revision) { loading = false; refreshAppend(); } });
    });
    select.addEventListener('change', () => { void selectProject(); });
    cancel.addEventListener('click', () => {
      if (handoffBusy || cancel.disabled) return;
      revision++;
      loading = false;
      pending = undefined;
      panel.hidden = true;
      refreshAppend();
      restoreActionFocus(open);
    });
    copy.addEventListener('click', () => { if (!copy.disabled && !handoffBusy) { revision++; loading = false; pending = undefined; panel.hidden = true; refreshAppend(); } });
    confirm.addEventListener('click', () => {
      if (!pending || handoffBusy || confirm.disabled || disposed || composing || moving) return;
      const apply = pending;
      setHandoffBusy(true);
      content.inert = true;
      note.textContent = 'シーンを追加しています。';
      void Promise.resolve().then(async () => { await runtime?.idle?.(); if (!disposed) await apply(); }).catch(error => { if (!disposed) note.textContent = (error as Error).message; }).finally(() => {
        if (disposed) return;
        // A stale preview cannot be used again. Re-selecting refreshes it.
        pending = undefined; select.value = ''; setHandoffBusy(false);
        content.inert = false;
      });
    });
  }
  if (openProject) {
    const back = make('button', '別のプロジェクトを開く');
    back.type = 'button';
    back.addEventListener('click', () => {
      if (disposed || handoffBusy || moving || composing) return;
      openProject();
    });
    actions.append(back);
  }
  const pins = new Map<string, HTMLButtonElement>();
  const context = (): CaptionListContext => ({ source: view.source, memory, pending: composing ? 'composition' : null, mutationBlock: '閲覧用ファイルです。' });
  function windowPlan(plan: CaptionWindowPlan) {
    if (disposed || !captionWindowPlanIsCurrent(plan, view.source, windowsMemory, memory.selectedCaptionId) || plan.kind === 'blocked') return false;
    windowsMemory = plan.memory; render(); return true;
  }
  function selectCaption(captionId: string) {
    memory = { ...memory, selectedCaptionId: captionId };
    if (phone?.matches) { readingDetail = true; return; }
    const plan = planCaptionWindow(view.source, windowsMemory, captionId, { kind: 'open', captionId });
    if (plan.kind === 'change') windowsMemory = plan.memory;
  }
  function accept(plan: CaptionListPlan) {
    if (disposed || !captionListPlanIsCurrent(plan, context())) return;
    if (plan.kind === 'blocked') { failure = plan.reason; paint(); return; }
    if (plan.kind === 'change' && (plan.intent === 'scroll' || plan.intent === 'search')) {
      memory = plan.memory;
      if (plan.intent === 'scroll') list.acceptScroll(context());
      else { list.render(context()); updateSteps(); }
      return;
    }
    if (plan.kind === 'change') {
      memory = plan.memory;
      if (plan.intent === 'select' && memory.selectedCaptionId) selectCaption(memory.selectedCaptionId);
    } else if (plan.kind === 'unchanged' && plan.explicitSelection) {
      selectCaption(plan.explicitSelection.captionId);
    } else if (plan.kind === 'effect' && plan.action === 'review') {
      selectCaption(plan.captionId);
    } else return;

    failure = '';
    render();
    const explicitlySelected = plan.kind === 'change' && plan.intent === 'select' ||
      plan.kind === 'unchanged' && !!plan.explicitSelection || plan.kind === 'effect';
    const revealSelection = plan.kind === 'change' && plan.intent === 'revealSelection';
    if (explicitlySelected || revealSelection) list.revealSelected();
    if (explicitlySelected && phone?.matches && !selectedText.hidden) {
      revealReading(selectedText, 'start');
      selectedText.focus({ preventScroll: true });
    }
  }
  const list = createCaptionListControls(document, accept, active => { composing = active; paint(); }, { compact: true });
  const searchBlocked = () => disposed || composing || moving || handoffBusy || !!runtime?.read().dragging;
  searchRecords.addEventListener('click', () => {
    if (searchBlocked() || content.inert || !view.source.captions.length) return;
    list.focusSearch(); revealReading(list.root, 'nearest');
  });
  const mediaGroup = (captionId: string): MediaPreviewGroup => {
    const caption = view.source.captions.find(c => c.id === captionId);
    return { scope: JSON.stringify([view.source.token, captionId]), label: caption?.title.kind === 'value' ? caption.title.value || '記録' : '記録',
      items: view.attachments.filter(a => a.captionId === captionId).map(a => {
        const media = (view.inspection.review.snapshot.mediaResourcesById as Record<string, JsonObject & { label: string;mediaKind:'image'|'video'|'audio';portableDisplay?:JsonObject }>)[String(a.mediaResourceId)];
        const blob = view.images.get(String(a.mediaResourceId));
        return { id: String(a.id), resourceId: String(a.mediaResourceId), label: media?.label ?? 'メディア',kind:media?.mediaKind, description: mediaDisplayDescription(String(a.altText || ''),media?.portableDisplay!==undefined), image: blob && media ? { key: JSON.stringify([view.source.token, displayBlobRef(media)]), byteLength: Number(displayBlobRef(media).byteLength), load: () => view.content.image(media) } : null };
      }) };
  };
  const gallery = (captionId: string) => {
    const root = make('section'); root.className = 'lv-development-media-gallery'; root.setAttribute('aria-label', '添付メディア');
    const thumbs = createMediaThumbnails(document, () => disposed ? null : mediaGroup(captionId), mediaViewer); root.append(thumbs.root);
    return { root, render: thumbs.render, dispose() { thumbs.dispose(); root.remove(); } };
  };
  const windows = createCaptionWindowControls(document, windowPlan, active => { moving = active; paint(); }, gallery);
  const selectedMedia = make('section'); selectedMedia.setAttribute('aria-label', '選択中の記録のメディア');
  const selectedText = make('section'), recordTitle = make(switchScene && view.scenes.length > 1 ? 'h2' : 'h3'), recordBody = make('p');
  selectedText.setAttribute('aria-label', '記録の詳細'); selectedText.tabIndex = -1; selectedText.className = 'lv-caption-value';
  const readingContent = make('div'); readingContent.className = 'lv-review-reading-content';
  const updateHeaderHeight = () => root.style.setProperty('--lv-review-header-height', `${header.offsetHeight}px`);
  const HeaderObserver = document.defaultView?.ResizeObserver;
  const headerObserver = HeaderObserver ? new HeaderObserver(updateHeaderHeight) : null;
  headerObserver?.observe(header);
  function revealReading(target: HTMLElement, block: ScrollLogicalPosition): void {
    if (phone?.matches) {
      updateHeaderHeight();
      sidebar.scrollIntoView?.({ block: 'end', behavior: 'auto' });
    }
    target.scrollIntoView?.({ block, behavior: 'auto' });
  }
  const recordHeader = make('header'), returnTo3D = make('button', '3Dに戻る');
  recordHeader.className = 'lv-review-record-header'; returnTo3D.type = 'button'; returnTo3D.className = 'lv-review-return';
  const previous = make('button', '前の記録'), next = make('button', '次の記録');
  const activeWindow = () => !phone?.matches ? captionWindowView(view.source, windowsMemory, memory.selectedCaptionId).visibleIds.at(-1) : undefined;
  function updateSteps() {
    const neighbors = list.neighbors(activeWindow() ?? memory.selectedCaptionId);
    previous.hidden = next.hidden = !neighbors.previous && !neighbors.next;
    previous.disabled = !neighbors.previous || composing || moving || handoffBusy;
    next.disabled = !neighbors.next || composing || moving || handoffBusy;
    recordHeader.hidden = !memory.selectedCaptionId || previous.hidden && next.hidden;
  }
  function step(direction: 'previous' | 'next') {
    if (searchBlocked() || content.inert) return;
    const active = activeWindow(), base = context();
    const stepContext = active ? { ...base, memory: { ...memory, selectedCaptionId: active } } : base;
    const plan = planCaptionList(stepContext, { kind: 'step', direction });
    if (plan.kind !== 'change') return;
    const captionId = plan.memory.selectedCaptionId!;
    const replace = active ? planCaptionWindow(view.source, windowsMemory, captionId,
      { kind: 'replace', captionId, fromCaptionId: active, rect: windows.placement(active) }) : undefined;
    if (replace?.kind === 'blocked') return;
    if (replace) windowsMemory = replace.memory;
    if (phone?.matches) readingDetail = true;
    memory = plan.memory; render(); list.revealSelected();
    if ((direction === 'next' ? next : previous).disabled) (direction === 'next' ? previous : next).focus({ preventScroll: true });
  }
  previous.type = next.type = 'button';
  previous.addEventListener('click', () => step('previous')); next.addEventListener('click', () => step('next'));
  recordHeader.append(previous, next);
  header.insertBefore(returnTo3D, files);
  selectedText.append(recordHeader, recordTitle, recordBody, selectedMedia);
  returnTo3D.addEventListener('click', () => {
    if (searchBlocked() || content.inert) return;
    requestStage();
    root.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    canvas.focus({ preventScroll: true });
  });
  let panelGallery: ReturnType<typeof gallery> | null = null, panelCaption: string | null = null;
  const sceneHeader = make('div'); sceneHeader.className = 'lv-review-scene-header';
  let sceneSelect: HTMLSelectElement | undefined;
  if (switchScene && view.scenes.length > 1) {
    const select = make('select'); sceneSelect = select; select.setAttribute('aria-label', '表示するシーン');
    for (const scene of view.scenes) {
      const option = make('option', String(scene.name)); option.value = String(scene.id); select.append(option);
    }
    select.value = view.source.sceneId;
    select.addEventListener('change', async () => {
      const id = select.value; select.value = view.source.sceneId;
      if (disposed || handoffBusy || composing || moving || select.disabled) return;
      select.disabled = true; content.inert = true;
      try { await switchScene(id); }
      finally { if (!disposed) { select.disabled = false; content.inert = false; } }
    });
    sceneHeader.append(select);
  } else {
    const sceneTitle = make('h2', view.sceneName); sceneTitle.title = view.sceneName;
    sceneHeader.append(sceneTitle);
  }
  viewport.append(windows.root); readingContent.append(emptyCaptions, list.root, selectedText); sidebar.append(sceneHeader, readingContent);
  const views = make('details'); views.append(make('summary', 'その他の視点'));
  const cameraAction = (action: () => void) => {
    if (disposed || composing || moving) return; try { action(); failure = ''; } catch (error) { failure = (error as Error).message; } paint();
  };
  const cameraButtons: HTMLButtonElement[] = [];
  const requestStage = () => {
    if (readingDetail) {
      readingDetail = false;
      returnTo3D.hidden = true;
      readingBadge.hidden = false;
    }
    mediaWork.resume();
  };
  const resumeStage = (event: Event) => { if (event.target !== searchRecords && event.target !== retry) requestStage(); };
  viewport.addEventListener('pointerdown', resumeStage, true);
  viewport.addEventListener('focusin', resumeStage);
  const stageObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    if (entries.some(entry => entry.intersectionRatio >= 0.95)) {
      if (!mediaViewer.root.open) requestStage();
    } else if (phone?.matches && memory.selectedCaptionId && !readingDetail) {
      readingDetail = true;
      render();
    }
  }, { threshold: 0.95 });
  stageObserver?.observe(viewport);
  const cameraButton = (container: HTMLElement, text: string, viewId: string) => {
    const button = make('button', text); button.type = 'button';
    button.addEventListener('click', () => { if (!button.disabled) cameraAction(() => {
      if (!runtime?.recall) throw Error('視点を呼び出せません。');
      runtime.recall(view.capture(viewId));
    }); });
    cameraButtons.push(button); container.append(button);
  };
  const camera = (intent: ViewCameraIntent) => { if (!runtime) throw Error('3D表示を確認してください。'); runtime.camera(intent); };
  const axes = { right: '+x', left: '-x', top: '+y', bottom: '-y', front: '+z', back: '-z' } as const;
  const cameraGizmo = createCameraGizmo(document, axis => cameraAction(() => camera({ kind: 'axis', axis: axes[axis] })), () => cameraAction(() => camera({ kind: 'fit' })),event=>{
    if(event.phase==='end')return runtime?.navigateCamera?.(event)??false;
    if(disposed||composing||moving||event.phase==='begin'&&runtime?.read().dragging)return false;
    return runtime?.navigateCamera?.(event)??false;
  });
  viewport.append(cameraGizmo.root);
  const projection = make('select'); projection.setAttribute('aria-label', '投影方式');
  for (const [value, text] of [['perspective', '透視投影'], ['orthographic', '平行投影']]) { const option = make('option', text); option.value = value!; projection.append(option); }
  const projectionArea=make('section');projectionArea.className='lv-camera-projection';projectionArea.append(projection);cameraGizmo.root.append(projectionArea);
  const projectionHelp=contextHelp(document,'投影方式：透視投影・平行投影を切り替えます。',[projection]);
  (projectionHelp.children[0] as HTMLElement).hidden=true;projectionArea.append(projectionHelp);
  projection.addEventListener('change', () => { if (!projection.disabled) cameraAction(() => camera({ kind: 'projection', projection: projection.value === 'orthographic' ? 'orthographic' : 'perspective' })); });
  if (view.entryViewId) cameraButton(sceneHeader, '開始視点に戻る', view.entryViewId);
  const drawingNotice = make('p'); drawingNotice.className = 'lv-drawing-notice'; sceneHeader.append(drawingNotice);
  const alternatives = view.views.filter(saved => saved.id !== view.entryViewId);
  const names = new Map<string, number>();
  for (const saved of view.views) names.set(String(saved.name), (names.get(String(saved.name)) ?? 0) + 1);
  alternatives.forEach((saved, index) => {
    const name = String(saved.name);
    cameraButton(views, (names.get(name) ?? 0) > 1 ? `${index + 1} · ${name}` : name, String(saved.id));
  });
  views.hidden = !alternatives.length; readingContent.append(views);
  let gesture: { pointer: number; node: HTMLButtonElement; x: number; y: number; startX: number; startY: number;
    id: string; kind: 'orbit' | 'pan'; started: boolean } | undefined;
  let suppressClick = false;
  function endPinGesture() {
    const held = gesture;
    gesture = undefined;
    if (!held) return;
    if (held.started) runtime?.navigateCamera?.({ phase: 'end', id: held.id });
    if (held.node.hasPointerCapture?.(held.pointer)) held.node.releasePointerCapture(held.pointer);
  }
  overlay.addEventListener('contextmenu', event => event.preventDefault());
  overlay.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') { suppressClick = false; return; }
    suppressClick = false;
    if (gesture) { suppressClick = true; endPinGesture(); return; }
    if (searchBlocked() || content.inert || !runtime?.navigateCamera || !event.isPrimary || event.button !== 0 && event.button !== 2 ||
        event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const node = (event.target as Element).closest<HTMLButtonElement>('.lv-development-pin');
    if (!node || !overlay.contains(node)) return;
    gesture = { pointer: event.pointerId, node, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      id: crypto.randomUUID(), kind: event.button === 2 ? 'pan' : 'orbit', started: false };
    try { node.setPointerCapture(event.pointerId); } catch { endPinGesture(); }
  });
  overlay.addEventListener('pointermove', event => {
    const held = gesture;
    if (!held || held.pointer !== event.pointerId) return;
    if (!event.buttons || disposed || handoffBusy || composing || moving || content.inert) { endPinGesture(); return; }
    if (!held.started) {
      if (Math.hypot(event.clientX-held.startX, event.clientY-held.startY) <= 4) return;
      suppressClick = true;
      held.started = runtime?.navigateCamera?.({ phase:'begin', id:held.id, kind:held.kind }) === true;
      if (!held.started) { endPinGesture(); return; }
    }
    const dx = event.clientX-held.x, dy = event.clientY-held.y;
    held.x = event.clientX; held.y = event.clientY;
    event.preventDefault();
    if (!runtime?.navigateCamera?.({ phase:'move', id:held.id, dx, dy })) endPinGesture();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) overlay.addEventListener(type, event => {
    if (gesture?.pointer === event.pointerId) endPinGesture();
  });
  function activatePin(node: HTMLButtonElement, event: MouseEvent) {
    if ((event.detail && suppressClick) || searchBlocked() || content.inert) return;
    const id = node.dataset.captionId;
    if (!id) return;
    accept(planCaptionList(context(), { kind: 'select', captionId: pickPin(event, node, id) }));
  }
  function pickPin(event: MouseEvent, node: HTMLButtonElement, id: string) {
    if (event.type !== 'pointerup' && !event.detail) return id; // Keyboard activation names the exact pin.
    let nearest = node, distance = Infinity;
    for (const hit of document.elementsFromPoint(event.clientX, event.clientY)) {
      if (hit.parentElement !== overlay || !hit.hasAttribute('data-caption-id')) continue;
      const box = hit.getBoundingClientRect();
      const delta = Math.hypot(box.left + box.width / 2 - event.clientX, box.top + box.height / 2 - event.clientY);
      if (delta < distance) { nearest = hit as HTMLButtonElement; distance = delta; }
    }
    return nearest.dataset.captionId ?? id;
  }
  function paint() {
    if (disposed) return; const observation = runtime?.read(), ready = !!observation?.ready && observation.display === display;
    searchRecords.hidden = !view.source.captions.length; searchRecords.disabled = searchBlocked();
    returnTo3D.disabled = searchBlocked();
    if (sceneSelect) sceneSelect.disabled = handoffBusy || composing || moving || content.inert;
    const cameraReady=!!(observation?.cameraReady??observation?.ready)&&observation?.display===display;
    const cameraBlocked = !cameraReady || composing || moving || !!observation?.dragging;
    let captured: unknown=observation?.camera; try { captured ??= runtime?.capture?.().camera; } catch { /* Camera preparation remains local. */ }
    const selectedPin = ready && display.pins.some(pin => pin.id === memory.selectedCaptionId) ? observation!.pins.find(pin => pin.id === memory.selectedCaptionId) : undefined;
    cameraGizmo.render({ camera: captured, axis: observation?.axis ?? null, blocked: cameraBlocked || !display.bounds,navigationBlocked:!cameraReady||composing||moving,navigating:observation?.navigating,navigationAvailable:!!runtime?.navigateCamera,selectedPinOffscreen:selectedPin?.visible===false });
    projection.disabled = cameraBlocked; projection.value = observation?.projection ?? 'perspective';
    for (const button of cameraButtons) button.disabled = cameraBlocked || !runtime?.recall;
    const drawing = observation?.display === display && !rendererFailure && !observation?.issue ? observation?.drawingNotice ?? '' : '';
    if (drawingNotice.textContent !== drawing) drawingNotice.textContent = drawing;
    const error = rendererFailure || failure || observation?.issue;
    let presented: ReturnType<typeof failurePresentation> | undefined;
    if (error) {
      let fallback = '処理を完了できません。元のファイルは保持しています。詳細を確認して再試行してください。';
      if (rendererFailure || !failure && observation?.issue) fallback = '3Dを表示できません。「3D表示を再試行」を選択してください。記録と元ファイルは保持しています。';
      presented = failurePresentation(error, fallback);
    }
    const nextStatus = presented?.message ?? observation?.notice ?? '';
    failureDetails.render(presented?.diagnostic);
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    const retryLabel = mediaWork.parked ? '3Dを表示' : '3D表示を再試行';
    if (retry.textContent !== retryLabel) retry.textContent = retryLabel;
    retry.hidden = !mediaWork.parked && !!runtime && !observation?.issue&&!observation?.retryAvailable;
    renderStatus.hidden = !status.textContent && retry.hidden;
    const wanted = new Set(display.pins.map(p => p.id));
    for (const [id, pin] of pins) if (!wanted.has(id)) { if (gesture?.node === pin) endPinGesture(); pin.remove(); pins.delete(id); }
    for (const pin of display.pins) {
      let button = pins.get(pin.id);
      if (!button) { button = make('button'); button.type = 'button'; button.className = 'lv-development-pin';
        button.dataset.captionId = pin.id;
        const node = button;
        button.addEventListener('click', event => activatePin(node, event)); pins.set(pin.id, button); overlay.append(button); }
      const title = pin.title || '無題';
      button.textContent = title; button.setAttribute('aria-label', title);
      button.style.setProperty?.('--lv-pin-color', pin.color); button.setAttribute('aria-current', String(memory.selectedCaptionId === pin.id));
      button.style.setProperty?.('--lv-pin-scale', String(pin.scale ?? 1));
      button.dataset.status = pin.status;
      if (pin.status === 'needsReview') button.setAttribute('aria-description', '位置を要確認');
      else button.removeAttribute('aria-description');
      const point = observation?.pins.find(p => p.id === pin.id);
      const offscreen = !ready || !point?.visible;
      button.hidden = offscreen && gesture?.node !== button;
      button.style.opacity = offscreen ? '0' : '';
      if (point) { button.style.left = `${point.x}px`; button.style.top = `${point.y}px`; }
    }
    const bounds = canvas.getBoundingClientRect?.() ?? { width: 0, height: 0 }; windows.project({ ready, width: bounds.width, height: bounds.height,
      sourceToken: display.token, sceneId: display.sceneId, pins: ready ? observation!.pins : [] });
  }
  function render() {
    if (disposed || rendering) return; rendering = true;
    try { list.render(context());
      const selectedCaption = view.source.captions.find(row => row.id === memory.selectedCaptionId);
      const selectedWindowVisible = !phone?.matches && !!memory.selectedCaptionId &&
        captionWindowView(view.source, windowsMemory, memory.selectedCaptionId).visibleIds.includes(memory.selectedCaptionId);
      const item = selectedWindowVisible ? undefined : selectedCaption;
      const detailChanged = readingContent.dataset.detail !== String(!!item);
      readingContent.dataset.detail = String(!!item);
      selectedText.hidden = !selectedCaption;
      returnTo3D.hidden = !phone?.matches || !item || !readingDetail;
      readingBadge.hidden = !returnTo3D.hidden;
      recordTitle.hidden = recordBody.hidden = !item;
      updateSteps();
      recordTitle.textContent = item?.title.kind === 'value' ? item.title.value || '無題' : '無題';
      recordBody.textContent = item?.body.kind === 'value' ? item.body.value : '';
      if (panelCaption !== memory.selectedCaptionId) { panelGallery?.dispose(); panelCaption = memory.selectedCaptionId;
        panelGallery = panelCaption ? gallery(panelCaption) : null; if (panelGallery) selectedMedia.append(panelGallery.root); }
      selectedMedia.hidden = selectedWindowVisible || !selectedCaption;
      panelGallery?.render(!selectedMedia.hidden); mediaViewer.render();
      windows.render({ source: view.source, memory: windowsMemory, selectedId: memory.selectedCaptionId,
      visible: !phone?.matches, moveBlock: composing ? '文字の入力を確定してください。' : null });
      const empty=view.source.captions.length===0;emptyCaptions.hidden=!empty;list.root.hidden=windows.tools.hidden=empty;
      if (detailChanged) list.revealSelected();
      display = view.display(memory.pinColors, memory.selectedCaptionId); runtime?.setActive(!handoffBusy && !mediaWork.active && document.hidden !== true); runtime?.update(display); paint(); }
    catch (error) { failure = (error as Error).message; paint(); } finally { rendering = false; }
  }
  function startRenderer() {
    let candidate: ProjectViewport | undefined;
    try { candidate = factory(canvas, paint); candidate.update(display); candidate.setActive(!handoffBusy && !mediaWork.active && document.hidden !== true); runtime = candidate; rendererFailure = ''; }
    catch (error) { candidate?.dispose(); rendererFailure = (error as Error).message; }
  }
  retry.addEventListener('click', () => {
    if (disposed || composing || moving) return;
    if (mediaWork.parked) { requestStage(); canvas.focus({ preventScroll: true }); return; }
    try { if (runtime) runtime.retry(); else startRenderer(); failure = ''; }
    catch (error) { failure = (error as Error).message; } paint();
  });
  document.addEventListener?.('visibilitychange',render);
  const layoutChanged = () => { if (!phone?.matches) requestStage(); render(); };
  phone?.addEventListener?.('change',layoutChanged);
  if (reading?.picked && reading.captionId) selectCaption(reading.captionId);
  render();
  startRenderer(); paint();
  return { root, header, readingPosition: (): ReviewReadingPosition => ({ memory, windows: windowsMemory }),
    focusTitle: () => {
      if (reading?.focus === 'search') list.focusSearch();
      else if (reading?.focusedRowId) list.focusSelection(reading.focusedRowId);
      else if (reading?.focus === 'detail' && reading.captionId && phone?.matches) selectedText.focus();
      else if (reading?.focus) list.focusSelection();
      else heading.focus();
    }, render, hasChanges: () => composing || moving, dispose() {
    if (retirement) return retirement;
    let finish!: () => void, fail!: (error: unknown) => void;
    retirement = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
    void retirement.catch(() => {}); disposed = true;
    const errors: unknown[] = [], attempt = <T>(action: () => T): T | undefined => { try { return action(); } catch (error) { errors.push(error); } };
    attempt(endPinGesture); stageObserver?.disconnect(); headerObserver?.disconnect();
    attempt(() => document.removeEventListener?.('pointerdown', dismissFiles));
    attempt(() => document.removeEventListener?.('focusin', dismissFiles));
    attempt(() => document.removeEventListener?.('visibilitychange',render));
    attempt(() => phone?.removeEventListener?.('change',layoutChanged));
    for (const stop of [() => cameraGizmo.dispose(), stopHelp, () => list.dispose(), () => panelGallery?.dispose(), () => windows.dispose()]) attempt(stop);
    const media = attempt(() => mediaViewer.dispose()); attempt(() => runtime?.dispose()); pins.clear(); attempt(() => root.remove());
    const viewport = attempt(() => runtime?.idle?.());
    void Promise.allSettled([media, viewport]).then(results => {
      errors.push(...results.flatMap(result => result.status === 'rejected' ? [result.reason] : []));
      if (errors.length) throw new AggregateError(errors, '表示の終了処理を完了できませんでした。再読み込みしてください。');
    }).then(finish, fail);
    return retirement;
  } };
}
