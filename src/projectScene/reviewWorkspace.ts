import { createCaptionListControls } from '../ui/projectScene/captionListControls';
import { captionListPlanIsCurrent, planCaptionList, type CaptionListContext, type CaptionListPlan } from '../ui/projectScene/captionListState';
import { createCaptionWindowControls } from '../ui/projectScene/captionWindowControls';
import { captionWindowPlanIsCurrent, newCaptionWindowMemory, planCaptionWindow, type CaptionWindowPlan } from '../ui/projectScene/captionWindowState';
import type { SceneUiMemory } from '../ui/projectScene/navigationState';
import type { ViewCameraIntent } from '../ui/projectScene/viewState';
import type { ReviewView } from './reviewView';
import type { ViewportFactory, ProjectViewport } from './viewportPorts';
import { createMediaViewer, createMediaThumbnails, mediaDisplayDescription, type MediaPreviewGroup } from '../ui/projectScene/mediaPreview';
import { createMediaResidencyGate } from '../ui/projectScene/mediaPreviewResources';
import { createCameraGizmo } from '../ui/projectScene/cameraGizmo';
import { contextHelp, mountContextHelp } from '../ui/projectScene/contextHelp';
import { displayBlobRef } from '../domain/portableMedia';
import type { JsonObject } from '../domain/values';

export interface ReviewAppendPort {
  projects(): Promise<readonly { run: string; title: string }[]>;
  inspect(run: string): Promise<{ reason: string; confirm(): Promise<void> }>;
}

/** Standalone snapshot viewing. Only an explicitly confirmed handoff may create an editing Project. */
export function createReviewWorkspace(document: Document, view: ReviewView, factory: ViewportFactory, editCopy?: () => void | Promise<void>, append?: ReviewAppendPort,
  switchScene?: (id: string) => Promise<void> | void) {
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
  const footer = make('p', '閲覧用ファイルです。');
  viewport.append(canvas, overlay); stage.append(viewport); content.append(stage, sidebar); root.append(header, status, retry, content, footer);
  const mediaWork = createMediaResidencyGate(document, render, () => runtime?.idle?.() ?? Promise.resolve(), () => !disposed);
  const mediaViewer = createMediaViewer(document, view.rasterResources,view.imageDimensions,mediaWork.acquire); root.append(mediaViewer.root);
  let memory: SceneUiMemory = { selectedCaptionId: null, search: '', pinColors: null, listScrollTop: 0, ownerFilter: { kind: 'all' } };
  const phone = document.defaultView?.matchMedia?.('(pointer: coarse) and (max-width: 760px), (pointer: coarse) and (max-width: 950px) and (max-height: 480px)');
  let windowsMemory = newCaptionWindowMemory(view.source.sceneId), composing = false, moving = false, disposed = false, rendering = false;
  let runtime: ProjectViewport | undefined, display = view.display(null, null), failure = '', rendererFailure = '';
  let retirement: Promise<void> | undefined;
  const copy = make('button', '編集コピーを作る'), confirmation = make('section'); copy.type = 'button'; copy.hidden = !editCopy;
  confirmation.hidden = true; confirmation.setAttribute('aria-label', '編集コピーの確認');
  confirmation.append(make('p', '独立したプロジェクトを作成します。元ファイルは変更しません。元のプロジェクトへの変更分の返送には使えません。'));
  const effects = view.inspection.review.editEffect;
  if (effects.missingModelCaptions || effects.newlyNeedsReviewCaptions) confirmation.append(make('p',
    `対応モデルなし：${effects.missingModelCaptions}件。要確認になるピン：${effects.newlyNeedsReviewCaptions}件。位置が分かるピンは残します。`));
  const confirmCopy = make('button', 'コピーを作成'), cancelCopy = make('button', '戻る'); confirmCopy.type = cancelCopy.type = 'button';
  let handoffBusy = false, refreshAppend = () => {};
  const setHandoffBusy = (active: boolean) => {
    handoffBusy = active; confirmCopy.disabled = cancelCopy.disabled = copy.disabled = active; refreshAppend(); render();
  };
  confirmation.append(confirmCopy, cancelCopy); header.append(copy); root.append(confirmation);
  copy.addEventListener('click', () => { if (!disposed && !handoffBusy && !copy.disabled && !composing && !moving) confirmation.hidden = false; });
  cancelCopy.addEventListener('click', () => { if (!handoffBusy && !cancelCopy.disabled) confirmation.hidden = true; });
  confirmCopy.addEventListener('click', () => {
    if (disposed || handoffBusy || composing || moving || confirmation.hidden || confirmCopy.disabled) return;
    setHandoffBusy(true);
    void Promise.resolve().then(async () => { await runtime?.idle?.(); if (!disposed) await editCopy?.(); }).catch(error => { if (!disposed) { failure = (error as Error).message; paint(); } })
      .finally(() => { if (!disposed) setHandoffBusy(false); });
  });
  if (append) {
    const open = make('button', '既存に追加'), panel = make('section'), select = make('select'), label = make('label', '追加先'),
      note = make('p'), confirm = make('button', 'シーンを追加'), cancel = make('button', 'キャンセル');
    panel.className = 'lv-review-append'; panel.hidden = true; panel.setAttribute('aria-label', 'シーンの追加');
    open.type = confirm.type = cancel.type = 'button'; confirm.disabled = true;
    note.setAttribute('role', 'status'); select.setAttribute('aria-label', '追加先'); label.append(select);
    const count = (name: string) => view.inspection.review.summary.entityClasses.find(entry => entry.class === name)?.count ?? 0;
    const models = Object.values(view.inspection.review.snapshot.assetsById as JsonObject).filter(asset => (asset as JsonObject).kind === 'visual').length;
    panel.append(make('h2', count('scenesById') > 1 ? `${count('scenesById')}シーンを追加` : view.sceneName), make('p', `モデル ${models}・キャプション ${count('captionsById')}・メディア ${count('mediaResourcesById')}`),
      label, note, confirm, cancel);
    header.append(open); root.insertBefore(panel, content);
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
      confirmation.hidden = true; panel.hidden = false; loading = true; hasProjects = false; pending = undefined; refreshAppend();
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
    cancel.addEventListener('click', () => { if(handoffBusy || cancel.disabled)return; revision++; loading = false; pending = undefined; panel.hidden = true; refreshAppend(); open.focus(); });
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
  const pins = new Map<string, HTMLButtonElement>();
  const context = (): CaptionListContext => ({ source: view.source, memory, pending: composing ? 'composition' : null, mutationBlock: '閲覧用ファイルです。' });
  function windowPlan(plan: CaptionWindowPlan) {
    if (disposed || !captionWindowPlanIsCurrent(plan, view.source, windowsMemory, memory.selectedCaptionId) || plan.kind === 'blocked') return false;
    windowsMemory = plan.memory; render(); return true;
  }
  function openWindow(captionId: string) {
    memory = { ...memory, selectedCaptionId: captionId };
    if (phone?.matches) return;
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
  const selectedMedia = make('section'); selectedMedia.setAttribute('aria-label', '選択中のキャプションのメディア');
  const selectedText = make('section'), recordTitle = make('h3'), recordBody = make('p');
  selectedText.setAttribute('aria-label', 'キャプションの詳細'); selectedText.tabIndex = -1; selectedText.className = 'lv-caption-value';
  selectedText.append(recordTitle, recordBody);
  let panelGallery: ReturnType<typeof gallery> | null = null, panelCaption: string | null = null;
  const sceneHeader = make('div'); sceneHeader.className = 'lv-review-scene-header'; sceneHeader.append(sceneName);
  if (switchScene && view.scenes.length > 1) {
    const select = make('select'); select.setAttribute('aria-label', '表示するシーン');
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
  }
  viewport.append(windows.root); sidebar.append(sceneHeader, emptyCaptions, list.root, selectedText, selectedMedia);
  const views = make('details'); views.append(make('summary', 'その他の視点'));
  const cameraAction = (action: () => void) => {
    if (disposed || composing || moving) return; try { action(); failure = ''; } catch (error) { failure = (error as Error).message; } paint();
  };
  const cameraButtons: HTMLButtonElement[] = [];
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
  const alternatives = view.views.filter(saved => saved.id !== view.entryViewId);
  const names = new Map<string, number>();
  for (const saved of view.views) names.set(String(saved.name), (names.get(String(saved.name)) ?? 0) + 1);
  alternatives.forEach((saved, index) => {
    const name = String(saved.name);
    cameraButton(views, (names.get(name) ?? 0) > 1 ? `${index + 1} · ${name}` : name, String(saved.id));
  });
  views.hidden = !alternatives.length; sidebar.append(views);
  function paint() {
    if (disposed) return; const observation = runtime?.read(), ready = !!observation?.ready && observation.display === display;
    const cameraReady=!!(observation?.cameraReady??observation?.ready)&&observation?.display===display;
    const cameraBlocked = !cameraReady || composing || moving || !!observation?.dragging;
    let captured: unknown=observation?.camera; try { captured ??= runtime?.capture?.().camera; } catch { /* Camera preparation remains local. */ }
    cameraGizmo.render({ camera: captured, axis: observation?.axis ?? null, blocked: cameraBlocked || !display.bounds,navigationBlocked:!cameraReady||composing||moving,navigating:observation?.navigating,navigationAvailable:!!runtime?.navigateCamera });
    projection.disabled = cameraBlocked; projection.value = observation?.projection ?? 'perspective';
    for (const button of cameraButtons) button.disabled = cameraBlocked || !runtime?.recall;
    status.textContent = rendererFailure || failure || observation?.issue || observation?.notice || ''; retry.hidden = !!runtime && !observation?.issue&&!observation?.retryAvailable;
    const wanted = new Set(display.pins.map(p => p.id));
    for (const [id, pin] of pins) if (!wanted.has(id)) { pin.remove(); pins.delete(id); }
    for (const pin of display.pins) {
      let button = pins.get(pin.id);
      if (!button) { button = make('button'); button.type = 'button'; button.className = 'lv-development-pin';
        button.addEventListener('click', () => {
          accept(planCaptionList(context(), { kind: 'select', captionId: pin.id }));
          if (phone?.matches && memory.selectedCaptionId === pin.id) selectedText.focus();
        }); pins.set(pin.id, button); overlay.append(button); }
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
      const item = phone?.matches ? view.source.captions.find(row => row.id === memory.selectedCaptionId) : undefined;
      selectedText.hidden = !item;
      recordTitle.textContent = item?.title.kind === 'value' ? item.title.value : '';
      recordBody.textContent = item?.body.kind === 'value' ? item.body.value : '';
      if (panelCaption !== memory.selectedCaptionId) { panelGallery?.dispose(); panelCaption = memory.selectedCaptionId;
        panelGallery = panelCaption ? gallery(panelCaption) : null; if (panelGallery) selectedMedia.append(panelGallery.root); }
      panelGallery?.render(); mediaViewer.render();
      windows.render({ source: view.source, memory: windowsMemory, selectedId: memory.selectedCaptionId,
      visible: !phone?.matches, moveBlock: composing ? '文字の入力を確定してください。' : null });
      const empty=view.source.captions.length===0;emptyCaptions.hidden=!empty;list.root.hidden=selectedMedia.hidden=windows.tools.hidden=empty;
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
    try { if (runtime) runtime.retry(); else startRenderer(); failure = ''; }
    catch (error) { failure = (error as Error).message; } paint();
  });
  document.addEventListener?.('visibilitychange',render);
  phone?.addEventListener?.('change',render);
  render();
  startRenderer(); paint();
  return { root, render, hasChanges: () => composing || moving, dispose() {
    if (retirement) return retirement;
    let finish!: () => void, fail!: (error: unknown) => void;
    retirement = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
    void retirement.catch(() => {}); disposed = true;
    const errors: unknown[] = [], attempt = <T>(action: () => T): T | undefined => { try { return action(); } catch (error) { errors.push(error); } };
    attempt(() => document.removeEventListener?.('visibilitychange',render));
    attempt(() => phone?.removeEventListener?.('change',render));
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
