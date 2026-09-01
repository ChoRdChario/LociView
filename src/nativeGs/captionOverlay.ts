import type { WorkspaceReadableFile } from '../platform/fs';
import { clear, el } from '../ui/dom';
import { isNativeAssetVisibleV1 } from './resolver';
import {
  nativeCaptionDisplaySetIdV1,
  type NativeProjectSnapshotV1,
} from './schema';
import type { NativeCaptionScreenPointV1 } from './viewer';

const OVERLAY_WIDTH_CSS_PX = 280;
const OVERLAY_GAP_CSS_PX = 14;
const OVERLAY_EDGE_CSS_PX = 8;
const OVERLAY_ANCHOR_MARGIN_CSS_PX = 10;
const OVERLAY_MIN_WIDTH_CSS_PX = 180;
const OVERLAY_MIN_HEIGHT_CSS_PX = 96;

export interface NativeCaptionOverlayMediaV1 {
  readonly id: string;
  readonly label: string;
  readonly mediaType: string | null;
}

export interface NativeCaptionOverlayModelV1 {
  readonly captionId: string;
  readonly title: string;
  readonly body: string;
  readonly color: string;
  readonly media: readonly NativeCaptionOverlayMediaV1[];
}

export interface NativeCaptionOverlayPlacementV1 {
  readonly leftCss: number;
  readonly topCss: number;
  readonly widthCss: number;
  readonly heightCss: number;
  readonly lineEndXCss: number;
  readonly lineEndYCss: number;
}

export interface NativeCaptionOverlayPositionV1 {
  readonly leftCss: number;
  readonly topCss: number;
}

export interface NativeCaptionOverlaySizeV1 {
  readonly widthCss: number;
  readonly heightCss: number;
}

export function resolveNativeCaptionOverlayV1(
  snapshot: NativeProjectSnapshotV1,
  selectedCaptionId: string | null,
  activeDisplaySetId: string,
): NativeCaptionOverlayModelV1 | null {
  if (selectedCaptionId === null) return null;
  const caption = snapshot.captions.find((candidate) => candidate.id === selectedCaptionId);
  if (
    caption === undefined || caption.anchor === null ||
    nativeCaptionDisplaySetIdV1(caption) !== activeDisplaySetId ||
    !snapshot.assets.some((asset) => asset.id === caption.anchor?.assetId) ||
    !isNativeAssetVisibleV1(snapshot, caption.anchor.assetId)
  ) return null;

  const resources = new Map((snapshot.mediaResources ?? []).map((media) => [media.id, media]));
  return {
    captionId: caption.id,
    title: caption.title.trim() === '' ? '（無題）' : caption.title,
    body: caption.body,
    color: caption.color ?? '#eab308',
    media: (caption.attachmentMediaIds ?? []).map((mediaId) => {
      const resource = resources.get(mediaId);
      return {
        id: mediaId,
        label: resource?.label ?? '添付画像',
        mediaType: resource?.blob.mediaType ?? null,
      };
    }),
  };
}

export function placeNativeCaptionOverlayV1(
  stageWidthCss: number,
  stageHeightCss: number,
  cardHeightCss: number,
  point: NativeCaptionScreenPointV1,
  preferredPosition?: NativeCaptionOverlayPositionV1 | null,
  preferredSize?: NativeCaptionOverlaySizeV1 | null,
): NativeCaptionOverlayPlacementV1 | null {
  if (
    !point.visible || !Number.isFinite(point.xCss) || !Number.isFinite(point.yCss) ||
    stageWidthCss <= OVERLAY_EDGE_CSS_PX * 2 || stageHeightCss <= OVERLAY_EDGE_CSS_PX * 2 ||
    point.xCss < -OVERLAY_ANCHOR_MARGIN_CSS_PX ||
    point.xCss > stageWidthCss + OVERLAY_ANCHOR_MARGIN_CSS_PX ||
    point.yCss < -OVERLAY_ANCHOR_MARGIN_CSS_PX ||
    point.yCss > stageHeightCss + OVERLAY_ANCHOR_MARGIN_CSS_PX
  ) return null;

  const availableWidth = stageWidthCss - OVERLAY_EDGE_CSS_PX * 2;
  const availableHeight = stageHeightCss - OVERLAY_EDGE_CSS_PX * 2;
  const width = preferredSize === undefined || preferredSize === null
    ? Math.max(1, Math.min(OVERLAY_WIDTH_CSS_PX, availableWidth))
    : Math.max(
        Math.min(OVERLAY_MIN_WIDTH_CSS_PX, availableWidth),
        Math.min(preferredSize.widthCss, availableWidth),
      );
  const height = preferredSize === undefined || preferredSize === null
    ? Math.max(1, Math.min(cardHeightCss, availableHeight))
    : Math.max(
        Math.min(OVERLAY_MIN_HEIGHT_CSS_PX, availableHeight),
        Math.min(preferredSize.heightCss, availableHeight),
      );
  let left = preferredPosition?.leftCss ?? point.xCss + OVERLAY_GAP_CSS_PX;
  let top = preferredPosition?.topCss ?? point.yCss - height - OVERLAY_GAP_CSS_PX;
  if (preferredPosition === undefined || preferredPosition === null) {
    if (left + width > stageWidthCss - OVERLAY_EDGE_CSS_PX) left = point.xCss - width - OVERLAY_GAP_CSS_PX;
    if (top < OVERLAY_EDGE_CSS_PX) top = point.yCss + OVERLAY_GAP_CSS_PX;
  }
  left = Math.max(OVERLAY_EDGE_CSS_PX, Math.min(left, stageWidthCss - width - OVERLAY_EDGE_CSS_PX));
  top = Math.max(OVERLAY_EDGE_CSS_PX, Math.min(top, stageHeightCss - height - OVERLAY_EDGE_CSS_PX));
  const centerX = left + width / 2;
  return {
    leftCss: left,
    topCss: top,
    widthCss: width,
    heightCss: height,
    lineEndXCss: point.xCss < centerX ? left : left + width,
    lineEndYCss: top + Math.min(height / 2, 28),
  };
}

export interface NativeCaptionMediaTicketV1 {
  readonly generation: number;
  readonly selectionKey: string;
}

export class NativeCaptionMediaSelectionV1 {
  private generation = 0;
  private selectionKey = '';

  select(selectionKey: string): NativeCaptionMediaTicketV1 {
    if (selectionKey !== this.selectionKey) {
      this.selectionKey = selectionKey;
      this.generation += 1;
    }
    return { generation: this.generation, selectionKey: this.selectionKey };
  }

  invalidate(): void {
    this.selectionKey = '';
    this.generation += 1;
  }

  accepts(ticket: NativeCaptionMediaTicketV1): boolean {
    return ticket.generation === this.generation && ticket.selectionKey === this.selectionKey;
  }
}

export interface NativeCaptionOverlayOptionsV1 {
  readonly stage: HTMLElement;
  readonly getSnapshot: () => NativeProjectSnapshotV1;
  readonly getSelectedCaptionId: () => string | null;
  readonly getActiveDisplaySetId: () => string;
  readonly projectCaption: (captionId: string) => NativeCaptionScreenPointV1 | null;
  readonly readMedia: (mediaId: string) => Promise<WorkspaceReadableFile | null>;
  readonly onDismiss: () => void;
  readonly onError: (message: string) => void;
}

export interface NativeCaptionOverlayControllerV1 {
  sync(): void;
  dispose(): void;
}

export function mountNativeCaptionOverlayV1(
  options: NativeCaptionOverlayOptionsV1,
): NativeCaptionOverlayControllerV1 {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ng-caption-overlay-line');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke-width', '2');
  svg.append(line);
  const card = el('article', { class: 'ng-caption-overlay', role: 'note' });
  options.stage.append(svg, card);

  const mediaSelection = new NativeCaptionMediaSelectionV1();
  const mediaUrls = new Map<string, string>();
  const mediaLoads = new Map<string, Promise<string | null>>();
  let currentModel: NativeCaptionOverlayModelV1 | null = null;
  let contentSignature = '';
  let mediaSelectionKey = '';
  let animationFrame = 0;
  let imageWindow: HTMLElement | null = null;
  let imageWindowGeneration = 0;
  let keydownListener: ((event: KeyboardEvent) => void) | null = null;
  let manualPosition: NativeCaptionOverlayPositionV1 | null = null;
  let manualSize: NativeCaptionOverlaySizeV1 | null = null;
  let lastPlacement: NativeCaptionOverlayPlacementV1 | null = null;
  let dragState: {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly startLeft: number;
    readonly startTop: number;
  } | null = null;
  let resizeState: {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly startWidth: number;
    readonly startHeight: number;
  } | null = null;
  let disposed = false;

  const revokeMedia = (): void => {
    for (const url of mediaUrls.values()) URL.revokeObjectURL(url);
    mediaUrls.clear();
    mediaLoads.clear();
  };

  const closeImageWindow = (): void => {
    imageWindowGeneration += 1;
    imageWindow?.remove();
    imageWindow = null;
    if (keydownListener !== null) document.removeEventListener('keydown', keydownListener);
    keydownListener = null;
  };

  const resetMediaSelection = (selectionKey: string): void => {
    closeImageWindow();
    mediaSelection.invalidate();
    revokeMedia();
    mediaSelectionKey = selectionKey;
    mediaSelection.select(selectionKey);
  };

  const loadMediaUrl = async (media: NativeCaptionOverlayMediaV1): Promise<string | null> => {
    const cached = mediaUrls.get(media.id);
    if (cached !== undefined) return cached;
    const pending = mediaLoads.get(media.id);
    if (pending !== undefined) return pending;
    const ticket = mediaSelection.select(mediaSelectionKey);
    const load = (async (): Promise<string | null> => {
      try {
        if (media.mediaType === null) return null;
        const source = await options.readMedia(media.id);
        if (source === null) return null;
        const blob = await new Response(source.stream(), {
          headers: { 'Content-Type': media.mediaType },
        }).blob();
        const url = URL.createObjectURL(blob);
        if (!mediaSelection.accepts(ticket)) {
          URL.revokeObjectURL(url);
          return null;
        }
        mediaUrls.set(media.id, url);
        return url;
      } catch (error) {
        if (mediaSelection.accepts(ticket)) {
          options.onError(error instanceof Error ? error.message : String(error));
        }
        return null;
      } finally {
        if (mediaSelection.accepts(ticket)) mediaLoads.delete(media.id);
      }
    })();
    mediaLoads.set(media.id, load);
    return load;
  };

  const openImageWindow = (startIndex: number): void => {
    const model = currentModel;
    if (model === null || model.media.length === 0) return;
    closeImageWindow();
    const generation = imageWindowGeneration;
    let index = Math.max(0, Math.min(startIndex, model.media.length - 1));
    let showGeneration = 0;
    const image = el('img', { class: 'ng-caption-image', alt: '' }) as HTMLImageElement;
    const unavailable = el('p', { class: 'ng-caption-image-unavailable' }, '画像を読み込んでいます…');
    const label = el('strong');
    const counter = el('span', { class: 'ng-note' });
    const previous = el('button', { 'aria-label': '前の画像' }, '前へ') as HTMLButtonElement;
    const next = el('button', { 'aria-label': '次の画像' }, '次へ') as HTMLButtonElement;
    const close = el('button', { 'aria-label': '画像を閉じる' }, '閉じる');
    const root = el('div', { class: 'ng-caption-image-window', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'キャプション画像' },
      el('div', { class: 'ng-caption-image-toolbar' }, label, counter, previous, next, close),
      el('div', { class: 'ng-caption-image-stage' }, image, unavailable),
    );
    imageWindow = root;
    options.stage.append(root);

    const show = async (nextIndex: number): Promise<void> => {
      const requestGeneration = ++showGeneration;
      index = (nextIndex + model.media.length) % model.media.length;
      const media = model.media[index]!;
      label.textContent = media.label;
      counter.textContent = model.media.length > 1 ? `${index + 1} / ${model.media.length}` : '';
      previous.disabled = model.media.length < 2;
      next.disabled = model.media.length < 2;
      image.style.display = 'none';
      image.removeAttribute('src');
      unavailable.style.display = '';
      unavailable.textContent = '画像を読み込んでいます…';
      const url = await loadMediaUrl(media);
      if (
        disposed || generation !== imageWindowGeneration || imageWindow !== root ||
        requestGeneration !== showGeneration
      ) return;
      if (url === null) {
        unavailable.textContent = 'この画像は端末内で利用できません。';
        return;
      }
      image.alt = media.label;
      image.src = url;
      image.style.display = '';
      unavailable.style.display = 'none';
    };
    image.addEventListener('error', () => {
      image.style.display = 'none';
      unavailable.style.display = '';
      unavailable.textContent = 'この画像形式は表示できません。';
    });
    previous.addEventListener('click', () => { void show(index - 1); });
    next.addEventListener('click', () => { void show(index + 1); });
    close.addEventListener('click', closeImageWindow);
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) closeImageWindow();
    });
    keydownListener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeImageWindow();
      else if (event.key === 'ArrowLeft' && model.media.length > 1) void show(index - 1);
      else if (event.key === 'ArrowRight' && model.media.length > 1) void show(index + 1);
    };
    document.addEventListener('keydown', keydownListener);
    void show(index);
  };

  const renderContent = (model: NativeCaptionOverlayModelV1): void => {
    clear(card);
    line.setAttribute('stroke', model.color);
    card.style.borderColor = model.color;
    const close = el('button', { class: 'ng-caption-overlay-close', 'aria-label': 'キャプションを閉じる' }, '×');
    close.addEventListener('click', options.onDismiss);
    const header = el('header', {}, el('strong', {}, model.title), close);
    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.target as Element).closest('button') !== null || lastPlacement === null) return;
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: lastPlacement.leftCss,
        startTop: lastPlacement.topCss,
      };
      header.setPointerCapture(event.pointerId);
      card.dataset.dragging = 'true';
      event.preventDefault();
    });
    header.addEventListener('pointermove', (event) => {
      if (dragState?.pointerId !== event.pointerId) return;
      manualPosition = {
        leftCss: dragState.startLeft + event.clientX - dragState.startX,
        topCss: dragState.startTop + event.clientY - dragState.startY,
      };
      event.preventDefault();
    });
    const finishDrag = (event: PointerEvent): void => {
      if (dragState?.pointerId !== event.pointerId) return;
      if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
      dragState = null;
      delete card.dataset.dragging;
    };
    header.addEventListener('pointerup', finishDrag);
    header.addEventListener('pointercancel', finishDrag);
    const content = el('div', { class: 'ng-caption-overlay-content' }, header);
    if (model.body !== '') content.append(el('div', { class: 'ng-caption-overlay-body' }, model.body));
    if (model.media.length > 0) {
      const thumbnails = el('div', { class: 'ng-caption-overlay-thumbnails' });
      model.media.slice(0, 3).forEach((media, index) => {
        const button = el('button', {
          class: 'ng-caption-overlay-thumbnail',
          'aria-label': `画像を開く：${media.label}`,
        }, el('span', {}, '画像'));
        button.addEventListener('click', () => openImageWindow(index));
        const expectedKey = mediaSelectionKey;
        void loadMediaUrl(media).then((url) => {
          if (url === null || expectedKey !== mediaSelectionKey || !button.isConnected) return;
          clear(button);
          button.append(el('img', { src: url, alt: media.label }));
        });
        thumbnails.append(button);
      });
      if (model.media.length > 3) {
        const more = el('button', { class: 'ng-caption-overlay-thumbnail' }, `+${model.media.length - 3}`);
        more.addEventListener('click', () => openImageWindow(3));
        thumbnails.append(more);
      }
      content.append(thumbnails);
    }
    const resize = el('button', {
      class: 'ng-caption-overlay-resize',
      'aria-label': 'キャプションウィンドウの大きさを変更',
      title: 'ドラッグして大きさを変更',
    }, '↘');
    resize.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || lastPlacement === null) return;
      manualPosition = {
        leftCss: lastPlacement.leftCss,
        topCss: lastPlacement.topCss,
      };
      resizeState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: lastPlacement.widthCss,
        startHeight: lastPlacement.heightCss,
      };
      resize.setPointerCapture(event.pointerId);
      card.dataset.resizing = 'true';
      event.preventDefault();
    });
    resize.addEventListener('pointermove', (event) => {
      if (resizeState?.pointerId !== event.pointerId) return;
      manualSize = {
        widthCss: Math.max(1, resizeState.startWidth + event.clientX - resizeState.startX),
        heightCss: Math.max(1, resizeState.startHeight + event.clientY - resizeState.startY),
      };
      event.preventDefault();
    });
    const clearResize = (event: PointerEvent): void => {
      if (resizeState?.pointerId !== event.pointerId) return;
      resizeState = null;
      delete card.dataset.resizing;
    };
    const finishResize = (event: PointerEvent): void => {
      if (resizeState?.pointerId !== event.pointerId) return;
      if (resize.hasPointerCapture(event.pointerId)) resize.releasePointerCapture(event.pointerId);
      clearResize(event);
    };
    resize.addEventListener('pointerup', finishResize);
    resize.addEventListener('pointercancel', finishResize);
    resize.addEventListener('lostpointercapture', clearResize);
    card.append(content, resize);
  };

  const sync = (): void => {
    if (disposed) return;
    const next = resolveNativeCaptionOverlayV1(
      options.getSnapshot(),
      options.getSelectedCaptionId(),
      options.getActiveDisplaySetId(),
    );
    if (next === null) {
      if (currentModel !== null) resetMediaSelection('');
      currentModel = null;
      contentSignature = '';
      manualPosition = null;
      manualSize = null;
      lastPlacement = null;
      dragState = null;
      resizeState = null;
      delete card.dataset.dragging;
      delete card.dataset.resizing;
      card.style.height = '';
      card.style.display = 'none';
      svg.style.display = 'none';
      return;
    }
    if (currentModel?.captionId !== next.captionId) {
      manualPosition = null;
      manualSize = null;
      lastPlacement = null;
      dragState = null;
      resizeState = null;
      delete card.dataset.dragging;
      delete card.dataset.resizing;
      card.style.height = '';
    }
    const nextMediaKey = `${next.captionId}\u0000${next.media.map((media) => media.id).join('\u0000')}`;
    if (nextMediaKey !== mediaSelectionKey) resetMediaSelection(nextMediaKey);
    const nextSignature = JSON.stringify([next.captionId, next.title, next.body, next.color, next.media]);
    currentModel = next;
    if (nextSignature !== contentSignature) {
      contentSignature = nextSignature;
      renderContent(next);
    }
  };

  const updatePosition = (): void => {
    sync();
    const model = currentModel;
    if (model !== null) {
      card.style.display = '';
      if (manualSize === null) card.style.height = '';
    }
    const point = model === null ? null : options.projectCaption(model.captionId);
    const placement = point === null ? null : placeNativeCaptionOverlayV1(
      options.stage.clientWidth,
      options.stage.clientHeight,
      card.offsetHeight,
      point,
      manualPosition,
      manualSize,
    );
    if (placement === null) {
      lastPlacement = null;
      card.style.display = 'none';
      svg.style.display = 'none';
    } else {
      lastPlacement = placement;
      if (manualPosition !== null) {
        manualPosition = { leftCss: placement.leftCss, topCss: placement.topCss };
      }
      if (manualSize !== null) {
        manualSize = { widthCss: placement.widthCss, heightCss: placement.heightCss };
      }
      card.style.display = '';
      svg.style.display = '';
      card.style.width = `${placement.widthCss}px`;
      // Even the automatic size gets an explicit, stage-clamped height for the
      // painted frame. The next frame clears it before measuring again, so
      // asynchronously loaded thumbnails can still grow the natural card while
      // long content always has a definite scroll container.
      card.style.height = `${placement.heightCss}px`;
      card.style.transform = `translate(${Math.round(placement.leftCss)}px, ${Math.round(placement.topCss)}px)`;
      line.setAttribute('x1', String(point!.xCss));
      line.setAttribute('y1', String(point!.yCss));
      line.setAttribute('x2', String(placement.lineEndXCss));
      line.setAttribute('y2', String(placement.lineEndYCss));
    }
    animationFrame = requestAnimationFrame(updatePosition);
  };

  updatePosition();
  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      closeImageWindow();
      mediaSelection.invalidate();
      revokeMedia();
      svg.remove();
      card.remove();
    },
  };
}
