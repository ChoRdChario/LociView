import type { WorkspaceReadableFile } from '../platform/fs';
import { clear, el } from '../ui/dom';
import { isNativeAssetVisibleV1 } from './resolver';
import {
  nativeCaptionDisplaySetIdV1,
  type NativeProjectSnapshotV1,
} from './schema';
import { NativeCaptionSessionUiV1 } from './captionSessionUi';
import {
  placeNativeCaptionOverlayV1,
  type NativeCaptionOverlayMediaV1,
  type NativeCaptionOverlayModelV1,
  type NativeCaptionOverlayPlacementV1,
} from './captionOverlay';
import type { NativeCaptionScreenPointV1 } from './viewer';

const EDGE = 8;
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 180;
const MIN_HEIGHT = 96;
const ARRANGE_GAP = 8;

export function nextNativeCaptionWindowSizeV1(
  current: { readonly widthCss: number; readonly heightCss: number } | null,
): { readonly widthCss: number; readonly heightCss: number } {
  const presets = [
    { widthCss: 220, heightCss: 128 },
    { widthCss: 280, heightCss: 180 },
    { widthCss: 360, heightCss: 250 },
  ] as const;
  const currentWidth = current?.widthCss ?? DEFAULT_WIDTH;
  return presets.find((preset) => preset.widthCss > currentWidth + 1) ?? presets[0];
}

export interface NativeCaptionWindowArrangementV1 {
  readonly leftCss: number;
  readonly topCss: number;
  readonly widthCss: number;
  readonly heightCss: number;
}

/** Returns a non-overlapping grid, or null when even minimum cards cannot fit. */
export function arrangeNativeCaptionWindowsV1(
  stageWidth: number,
  stageHeight: number,
  count: number,
): readonly NativeCaptionWindowArrangementV1[] | null {
  if (count < 1) return [];
  const availableWidth = stageWidth - EDGE * 2;
  const availableHeight = stageHeight - EDGE * 2;
  if (availableWidth < MIN_WIDTH || availableHeight < MIN_HEIGHT) return null;
  const maxColumns = Math.min(count, Math.max(1, Math.floor(
    (availableWidth + ARRANGE_GAP) / (MIN_WIDTH + ARRANGE_GAP),
  )));
  const preferredColumns = Math.min(maxColumns, Math.max(1, Math.floor(
    (availableWidth + ARRANGE_GAP) / (DEFAULT_WIDTH + ARRANGE_GAP),
  )));
  for (let columns = preferredColumns; columns <= maxColumns; columns += 1) {
    const rows = Math.ceil(count / columns);
    const width = Math.min(DEFAULT_WIDTH, Math.floor(
      (availableWidth - ARRANGE_GAP * (columns - 1)) / columns,
    ));
    const height = Math.min(180, Math.floor(
      (availableHeight - ARRANGE_GAP * (rows - 1)) / rows,
    ));
    if (width < MIN_WIDTH || height < MIN_HEIGHT) continue;
    return Array.from({ length: count }, (_, index) => ({
      leftCss: EDGE + (index % columns) * (width + ARRANGE_GAP),
      topCss: EDGE + Math.floor(index / columns) * (height + ARRANGE_GAP),
      widthCss: width,
      heightCss: height,
    }));
  }
  return null;
}

export type NativeCaptionPinAvailabilityV1 = 'available' | 'unplaced' | 'asset-hidden' | 'asset-unavailable';

export interface NativeCaptionWindowModelV1 extends NativeCaptionOverlayModelV1 {
  readonly pinAvailability: NativeCaptionPinAvailabilityV1;
}

export function resolveNativeCaptionWindowV1(
  snapshot: NativeProjectSnapshotV1,
  captionId: string,
  activeDisplaySetId: string,
): NativeCaptionWindowModelV1 | null {
  const caption = snapshot.captions.find((candidate) => candidate.id === captionId);
  if (caption === undefined || nativeCaptionDisplaySetIdV1(caption) !== activeDisplaySetId) return null;
  const asset = caption.anchor === null
    ? undefined
    : snapshot.assets.find((candidate) => candidate.id === caption.anchor?.assetId);
  const pinAvailability: NativeCaptionPinAvailabilityV1 = caption.anchor === null
    ? 'unplaced'
    : asset === undefined
      ? 'asset-unavailable'
      : !isNativeAssetVisibleV1(snapshot, asset.id)
        ? 'asset-hidden'
        : 'available';
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
        label: resource?.label ?? '添付メディア',
        mediaType: resource?.blob.mediaType ?? null,
      };
    }),
    pinAvailability,
  };
}

function floatingPlacement(
  stageWidth: number,
  stageHeight: number,
  cardHeight: number,
  index: number,
  preferredPosition: { readonly leftCss: number; readonly topCss: number } | null,
  preferredSize: { readonly widthCss: number; readonly heightCss: number } | null,
): NativeCaptionOverlayPlacementV1 | null {
  if (stageWidth <= EDGE * 2 || stageHeight <= EDGE * 2) return null;
  const width = Math.max(
    Math.min(MIN_WIDTH, stageWidth - EDGE * 2),
    Math.min(preferredSize?.widthCss ?? DEFAULT_WIDTH, stageWidth - EDGE * 2),
  );
  const height = Math.max(
    Math.min(MIN_HEIGHT, stageHeight - EDGE * 2),
    Math.min(preferredSize?.heightCss ?? Math.max(cardHeight, MIN_HEIGHT), stageHeight - EDGE * 2),
  );
  const columns = Math.max(1, Math.floor((stageWidth - EDGE * 2 + 8) / (width + 8)));
  const slotLeft = EDGE + (index % columns) * (width + 8);
  const slotTop = EDGE + Math.floor(index / columns) * (height + ARRANGE_GAP);
  const left = Math.max(EDGE, Math.min(preferredPosition?.leftCss ?? slotLeft, stageWidth - width - EDGE));
  const top = Math.max(EDGE, Math.min(preferredPosition?.topCss ?? slotTop, stageHeight - height - EDGE));
  return {
    leftCss: left,
    topCss: top,
    widthCss: width,
    heightCss: height,
    lineEndXCss: left,
    lineEndYCss: top,
  };
}

export interface NativeCaptionWindowsOptionsV1 {
  readonly stage: HTMLElement;
  readonly state: NativeCaptionSessionUiV1;
  readonly getSnapshot: () => NativeProjectSnapshotV1;
  readonly getSelectedCaptionId: () => string | null;
  readonly getActiveDisplaySetId: () => string;
  readonly projectCaption: (captionId: string) => NativeCaptionScreenPointV1 | null;
  readonly isCaptionAssetAvailable?: (captionId: string) => boolean;
  readonly isPinColorVisible?: (captionId: string) => boolean;
  readonly onShowPinColor?: (captionId: string) => void;
  readonly readMedia: (mediaId: string) => Promise<WorkspaceReadableFile | null>;
  readonly onSelect: (captionId: string) => void;
  readonly onDismiss: (captionId: string) => void;
  readonly onError: (message: string) => void;
}

export interface NativeCaptionWindowsControllerV1 {
  sync(): void;
  arrange(): void;
  openMedia(captionId: string | null, mediaId: string): void;
  dispose(): void;
}

interface WindowRuntime {
  readonly captionId: string;
  readonly card: HTMLElement;
  readonly line: SVGLineElement;
  model: NativeCaptionWindowModelV1 | null;
  signature: string;
  lastPlacement: NativeCaptionOverlayPlacementV1 | null;
  drag: {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly startLeft: number;
    readonly startTop: number;
  } | null;
  resize: {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly startWidth: number;
    readonly startHeight: number;
  } | null;
  status: HTMLElement | null;
  statusMessage: string;
  mediaGeneration: number;
  readonly mediaUrls: Set<string>;
}

interface MediaViewerSelection {
  readonly captionId: string | null;
  readonly mediaIds: readonly string[];
  index: number;
}

interface ThumbnailRequest {
  readonly key: string;
  readonly runtime: WindowRuntime;
  readonly generation: number;
  readonly media: NativeCaptionOverlayMediaV1;
  readonly image: HTMLImageElement;
  readonly status: HTMLElement;
  readonly retry: HTMLButtonElement;
}

export function mountNativeCaptionWindowsV1(
  options: NativeCaptionWindowsOptionsV1,
): NativeCaptionWindowsControllerV1 {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ng-caption-overlay-line');
  const windowLayer = el('div', { class: 'ng-caption-window-layer' });
  const arrangeButton = el('button', {}, '整列');
  const modeButton = el('button', {});
  const comparisonNotice = el('span', { class: 'ng-caption-window-notice', hidden: true });
  const comparisonTools = el('div', { class: 'ng-caption-window-tools', hidden: true }, comparisonNotice, arrangeButton, modeButton);
  options.stage.append(svg, windowLayer, comparisonTools);
  const runtimes = new Map<string, WindowRuntime>();
  let animationFrame = 0;
  let disposed = false;
  let imageWindow: HTMLElement | null = null;
  let imageWindowGeneration = 0;
  let imageSelectionGeneration = 0;
  let imageUrl: string | null = null;
  let imageReturnFocus: HTMLElement | null = null;
  let mediaViewerSelection: MediaViewerSelection | null = null;
  let requestedMediaLoad: {
    readonly windowGeneration: number;
    readonly selectionGeneration: number;
    readonly media: NativeCaptionOverlayMediaV1;
    readonly image: HTMLImageElement;
  } | null = null;
  let mediaLoadRunning = false;
  let imageElement: HTMLImageElement | null = null;
  let imageMessage: HTMLElement | null = null;
  let imageRetry: HTMLButtonElement | null = null;
  let imageLabel: HTMLElement | null = null;
  let imageCounter: HTMLElement | null = null;
  let imagePrevious: HTMLButtonElement | null = null;
  let imageNext: HTMLButtonElement | null = null;
  let keydownListener: ((event: KeyboardEvent) => void) | null = null;
  const thumbnailRequests = new Map<string, ThumbnailRequest>();
  let thumbnailLoadRunning = false;

  const revokeImageUrl = (): void => {
    if (imageUrl === null) return;
    URL.revokeObjectURL(imageUrl);
    imageUrl = null;
  };

  const closeImageWindow = (restoreFocus = true): void => {
    const returnCaptionId = mediaViewerSelection?.captionId ?? null;
    imageWindowGeneration += 1;
    imageSelectionGeneration += 1;
    requestedMediaLoad = null;
    revokeImageUrl();
    imageWindow?.remove();
    imageWindow = null;
    mediaViewerSelection = null;
    imageElement = null;
    imageMessage = null;
    imageRetry = null;
    imageLabel = null;
    imageCounter = null;
    imagePrevious = null;
    imageNext = null;
    if (keydownListener !== null) document.removeEventListener('keydown', keydownListener);
    keydownListener = null;
    const returnFocus = imageReturnFocus;
    imageReturnFocus = null;
    if (restoreFocus && !disposed && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else if (restoreFocus && !disposed && returnCaptionId !== null) {
      const card = runtimes.get(returnCaptionId)?.card;
      if (card?.isConnected) card.focus({ preventScroll: true });
    }
  };

  const resolveMedia = (mediaId: string): NativeCaptionOverlayMediaV1 | null => {
    const media = (options.getSnapshot().mediaResources ?? []).find((candidate) => candidate.id === mediaId);
    return media === undefined ? null : { id: media.id, label: media.label, mediaType: media.blob.mediaType };
  };

  const pumpMediaLoad = async (): Promise<void> => {
    if (mediaLoadRunning) return;
    mediaLoadRunning = true;
    try {
      while (requestedMediaLoad !== null && !disposed) {
        const request = requestedMediaLoad;
        requestedMediaLoad = null;
        try {
          if (request.media.mediaType === null) throw new Error('このメディアの形式を確認できません。');
          const source = await options.readMedia(request.media.id);
          if (source === null) throw new Error('このメディアを端末内から読み込めません。');
          const blob = await new Response(source.stream(), {
            headers: { 'Content-Type': request.media.mediaType },
          }).blob();
          if (
            disposed || request.windowGeneration !== imageWindowGeneration ||
            request.selectionGeneration !== imageSelectionGeneration || imageWindow === null ||
            imageElement !== request.image || requestedMediaLoad !== null
          ) continue;
          revokeImageUrl();
          const url = URL.createObjectURL(blob);
          imageUrl = url;
          const isCurrent = (): boolean => (
            !disposed && request.windowGeneration === imageWindowGeneration &&
            request.selectionGeneration === imageSelectionGeneration && imageWindow !== null &&
            imageElement === request.image && request.image.isConnected && request.image.src === url
          );
          request.image.addEventListener('load', () => {
            if (!isCurrent()) return;
            imageMessage!.hidden = true;
            imageRetry!.hidden = true;
          }, { once: true });
          request.image.addEventListener('error', () => {
            if (!isCurrent()) return;
            revokeImageUrl();
            request.image.hidden = true;
            imageMessage!.hidden = false;
            imageMessage!.textContent = 'この画像形式は表示できません。';
            imageRetry!.hidden = false;
          }, { once: true });
          request.image.alt = request.media.label;
          request.image.src = url;
          request.image.hidden = false;
        } catch (error) {
          if (
            request.windowGeneration !== imageWindowGeneration ||
            request.selectionGeneration !== imageSelectionGeneration || imageWindow === null ||
            imageElement !== request.image || requestedMediaLoad !== null
          ) continue;
          request.image.hidden = true;
          imageMessage!.hidden = false;
          imageMessage!.textContent = error instanceof Error ? error.message : String(error);
          imageRetry!.hidden = false;
        }
      }
    } finally {
      mediaLoadRunning = false;
      if (requestedMediaLoad !== null && !disposed) void pumpMediaLoad();
    }
  };

  const showSelectedMedia = (): void => {
    const selection = mediaViewerSelection;
    if (selection === null || imageWindow === null) return;
    const mediaId = selection.mediaIds[selection.index];
    const media = mediaId === undefined ? null : resolveMedia(mediaId);
    if (media === null) {
      closeImageWindow();
      options.onError('選択したメディアは現在のプロジェクトにありません。');
      return;
    }
    imageLabel!.textContent = media.label;
    imageCounter!.textContent = selection.mediaIds.length > 1 ? `${selection.index + 1} / ${selection.mediaIds.length}` : '';
    imagePrevious!.disabled = selection.mediaIds.length < 2;
    imageNext!.disabled = selection.mediaIds.length < 2;
    revokeImageUrl();
    const image = el('img', { class: 'ng-caption-image', alt: '', hidden: true }) as HTMLImageElement;
    imageElement!.replaceWith(image);
    imageElement = image;
    imageMessage!.hidden = false;
    imageMessage!.textContent = '読み込んでいます…';
    imageRetry!.hidden = true;
    requestedMediaLoad = {
      windowGeneration: imageWindowGeneration,
      selectionGeneration: ++imageSelectionGeneration,
      media,
      image,
    };
    void pumpMediaLoad();
  };

  const stepMedia = (offset: number): void => {
    const selection = mediaViewerSelection;
    if (selection === null || selection.mediaIds.length < 1) return;
    selection.index = (selection.index + offset + selection.mediaIds.length) % selection.mediaIds.length;
    showSelectedMedia();
  };

  const openMedia = (captionId: string | null, mediaId: string): void => {
    const snapshot = options.getSnapshot();
    const caption = captionId === null ? undefined : snapshot.captions.find((candidate) => candidate.id === captionId);
    if (captionId !== null && (
      caption === undefined || nativeCaptionDisplaySetIdV1(caption) !== options.getActiveDisplaySetId() ||
      !(caption.attachmentMediaIds ?? []).includes(mediaId)
    )) {
      options.onError('選択したキャプションの添付メディアを確認できません。');
      return;
    }
    const mediaIds = captionId === null ? [mediaId] : [...(caption!.attachmentMediaIds ?? [])];
    const index = mediaIds.indexOf(mediaId);
    if (index < 0 || resolveMedia(mediaId) === null) {
      options.onError('選択したメディアを確認できません。');
      return;
    }
    const nextReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeImageWindow(false);
    imageReturnFocus = nextReturnFocus;
    const image = el('img', { class: 'ng-caption-image', alt: '', hidden: true }) as HTMLImageElement;
    const message = el('p', { class: 'ng-caption-image-unavailable' }, '読み込んでいます…');
    const retry = el('button', { hidden: true }, '再試行') as HTMLButtonElement;
    const label = el('strong');
    const counter = el('span', { class: 'ng-note' });
    const previous = el('button', { 'aria-label': '前のメディア' }, '前へ') as HTMLButtonElement;
    const next = el('button', { 'aria-label': '次のメディア' }, '次へ') as HTMLButtonElement;
    const close = el('button', { class: 'ng-icon-button', 'aria-label': 'メディアを閉じる' }, '×');
    const root = el('div', {
      class: 'ng-caption-image-window', role: 'dialog', 'aria-label': 'キャプションのメディア', tabindex: '-1',
    },
    el('div', { class: 'ng-caption-image-toolbar' }, label, counter, previous, next, close),
    el('div', { class: 'ng-caption-image-stage' }, image, message, retry));
    imageWindow = root;
    imageElement = image;
    imageMessage = message;
    imageRetry = retry;
    imageLabel = label;
    imageCounter = counter;
    imagePrevious = previous;
    imageNext = next;
    mediaViewerSelection = { captionId, mediaIds, index };
    options.stage.append(root);
    retry.addEventListener('click', showSelectedMedia);
    previous.addEventListener('click', () => stepMedia(-1));
    next.addEventListener('click', () => stepMedia(1));
    close.addEventListener('click', () => closeImageWindow());
    root.addEventListener('pointerdown', (event) => { if (event.target === root) closeImageWindow(); });
    keydownListener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeImageWindow();
      } else if (root.contains(event.target as Node) && event.key === 'ArrowLeft') {
        event.preventDefault();
        stepMedia(-1);
      } else if (root.contains(event.target as Node) && event.key === 'ArrowRight') {
        event.preventDefault();
        stepMedia(1);
      }
    };
    document.addEventListener('keydown', keydownListener);
    close.focus({ preventScroll: true });
    showSelectedMedia();
  };

  const cancelRuntimeMedia = (runtime: WindowRuntime): void => {
    runtime.mediaGeneration += 1;
    for (const url of runtime.mediaUrls) URL.revokeObjectURL(url);
    runtime.mediaUrls.clear();
    for (const [key, request] of thumbnailRequests) {
      if (request.runtime === runtime) thumbnailRequests.delete(key);
    }
  };

  const showThumbnailFailure = (request: ThumbnailRequest, message: string): void => {
    if (
      disposed || runtimes.get(request.runtime.captionId) !== request.runtime ||
      request.generation !== request.runtime.mediaGeneration || !request.image.isConnected
    ) return;
    request.image.hidden = true;
    request.status.hidden = false;
    request.status.textContent = message;
    request.retry.hidden = false;
    request.retry.disabled = false;
  };

  const pumpThumbnailLoads = async (): Promise<void> => {
    if (thumbnailLoadRunning) return;
    thumbnailLoadRunning = true;
    try {
      while (thumbnailRequests.size > 0 && !disposed) {
        const request = thumbnailRequests.values().next().value as ThumbnailRequest | undefined;
        if (request === undefined) break;
        thumbnailRequests.delete(request.key);
        if (
          runtimes.get(request.runtime.captionId) !== request.runtime ||
          request.generation !== request.runtime.mediaGeneration || !request.image.isConnected
        ) continue;
        try {
          if (request.media.mediaType === null) throw new Error('形式を確認できません');
          const source = await options.readMedia(request.media.id);
          if (source === null) throw new Error('端末内から読み込めません');
          const blob = await new Response(source.stream(), {
            headers: { 'Content-Type': request.media.mediaType },
          }).blob();
          if (
            disposed || runtimes.get(request.runtime.captionId) !== request.runtime ||
            request.generation !== request.runtime.mediaGeneration || !request.image.isConnected
          ) continue;
          const url = URL.createObjectURL(blob);
          request.runtime.mediaUrls.add(url);
          const isCurrent = (): boolean => (
            !disposed && runtimes.get(request.runtime.captionId) === request.runtime &&
            request.generation === request.runtime.mediaGeneration && request.image.isConnected &&
            request.image.src === url
          );
          request.image.addEventListener('load', () => {
            if (!isCurrent()) return;
            request.status.hidden = true;
            request.retry.hidden = true;
          }, { once: true });
          request.image.addEventListener('error', () => {
            if (!isCurrent()) return;
            if (request.runtime.mediaUrls.delete(url)) URL.revokeObjectURL(url);
            showThumbnailFailure(request, '一覧表示できません');
          }, { once: true });
          request.image.alt = request.media.label;
          request.image.src = url;
          request.image.hidden = false;
        } catch (error) {
          showThumbnailFailure(request, error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      thumbnailLoadRunning = false;
      if (thumbnailRequests.size > 0 && !disposed) void pumpThumbnailLoads();
    }
  };

  const queueRuntimeThumbnail = (
    runtime: WindowRuntime,
    media: NativeCaptionOverlayMediaV1,
    image: HTMLImageElement,
    status: HTMLElement,
    retry: HTMLButtonElement,
  ): void => {
    const request: ThumbnailRequest = {
      key: `${runtime.captionId}\u0000${media.id}`,
      runtime,
      generation: runtime.mediaGeneration,
      media,
      image,
      status,
      retry,
    };
    image.hidden = true;
    status.hidden = false;
    status.textContent = '読込中…';
    retry.hidden = true;
    retry.disabled = true;
    thumbnailRequests.set(request.key, request);
    void pumpThumbnailLoads();
  };

  const renderRuntime = (runtime: WindowRuntime, model: NativeCaptionWindowModelV1): void => {
    cancelRuntimeMedia(runtime);
    clear(runtime.card);
    runtime.line.setAttribute('stroke', model.color);
    runtime.card.style.borderColor = model.color;
    const selected = options.getSelectedCaptionId() === model.captionId;
    const retained = options.state.isRetained(options.getActiveDisplaySetId(), model.captionId);
    const retain = el('button', {
      'aria-pressed': String(retained),
      'aria-label': retained ? '比較用の保持を解除' : '比較用にこのウィンドウを残す',
    }, retained ? '保持中' : '残す');
    const sizePreset = el('button', { 'aria-label': 'ウィンドウの大きさを切り替える' }, '大きさ');
    const close = el('button', { class: 'ng-caption-overlay-close', 'aria-label': 'このキャプションを閉じる' }, '×');
    retain.addEventListener('click', () => {
      const setId = options.getActiveDisplaySetId();
      const wasRetained = options.state.isRetained(setId, model.captionId);
      options.state.setRetained(setId, model.captionId, !wasRetained);
      if (wasRetained && !selected) options.onSelect(model.captionId);
      sync();
    });
    close.addEventListener('click', () => {
      options.state.close(options.getActiveDisplaySetId(), model.captionId);
      options.onDismiss(model.captionId);
      sync();
    });
    sizePreset.addEventListener('click', () => {
      options.state.setSize(model.captionId, nextNativeCaptionWindowSizeV1(options.state.size(model.captionId)));
      options.state.bringToFront(model.captionId);
      if (!selected) options.onSelect(model.captionId);
      sync();
    });
    const header = el('header', {}, el('strong', {}, model.title), retain, sizePreset, close);
    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.target as Element).closest('button') !== null || runtime.lastPlacement === null) return;
      options.state.bringToFront(model.captionId);
      if (!selected) options.onSelect(model.captionId);
      runtime.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: runtime.lastPlacement.leftCss,
        startTop: runtime.lastPlacement.topCss,
      };
      header.setPointerCapture(event.pointerId);
      runtime.card.dataset.dragging = 'true';
      event.preventDefault();
    });
    header.addEventListener('pointermove', (event) => {
      if (runtime.drag?.pointerId !== event.pointerId) return;
      options.state.setPosition(model.captionId, {
        leftCss: runtime.drag.startLeft + event.clientX - runtime.drag.startX,
        topCss: runtime.drag.startTop + event.clientY - runtime.drag.startY,
      });
      event.preventDefault();
    });
    const finishDrag = (event: PointerEvent): void => {
      if (runtime.drag?.pointerId !== event.pointerId) return;
      if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
      runtime.drag = null;
      delete runtime.card.dataset.dragging;
    };
    header.addEventListener('pointerup', finishDrag);
    header.addEventListener('pointercancel', finishDrag);
    const status = el('p', { class: 'ng-caption-window-state', hidden: true });
    runtime.status = status;
    runtime.statusMessage = '\u0000';
    const content = el('div', { class: 'ng-caption-overlay-content' }, header, status);
    content.addEventListener('click', (event) => {
      if ((event.target as Element).closest('button') !== null || selected) return;
      options.state.bringToFront(model.captionId);
      options.onSelect(model.captionId);
    });
    if (model.body !== '') content.append(el('div', { class: 'ng-caption-overlay-body' }, model.body));
    const thumbnailsToQueue: Array<readonly [
      NativeCaptionOverlayMediaV1, HTMLImageElement, HTMLElement, HTMLButtonElement,
    ]> = [];
    if (model.media.length > 0) {
      const media = el('div', { class: 'ng-caption-overlay-thumbnails' });
      for (const item of model.media.slice(0, 3)) {
        const image = el('img', { alt: '', hidden: true }) as HTMLImageElement;
        const thumbnailStatus = el('span', { class: 'ng-caption-thumbnail-status' }, '読込中…');
        const button = el('button', {
          class: 'ng-caption-overlay-thumbnail', 'aria-label': `メディアを開く：${item.label}`,
        }, image, thumbnailStatus);
        const retry = el('button', {
          class: 'ng-caption-thumbnail-retry', hidden: true,
          'aria-label': `一覧画像を再読み込み：${item.label}`,
        }, '再試行') as HTMLButtonElement;
        button.addEventListener('click', () => {
          options.state.bringToFront(model.captionId);
          if (!selected) options.onSelect(model.captionId);
          openMedia(model.captionId, item.id);
        });
        retry.addEventListener('click', () => {
          queueRuntimeThumbnail(runtime, item, image, thumbnailStatus, retry);
        });
        media.append(el('div', { class: 'ng-caption-thumbnail-item' }, button, retry));
        thumbnailsToQueue.push([item, image, thumbnailStatus, retry]);
      }
      if (model.media.length > 3) {
        const more = el('button', { class: 'ng-caption-thumbnail-more' }, `ほか ${model.media.length - 3}件`);
        more.addEventListener('click', () => {
          options.state.bringToFront(model.captionId);
          if (!selected) options.onSelect(model.captionId);
          openMedia(model.captionId, model.media[3]!.id);
        });
        media.append(more);
      }
      content.append(media);
    }
    const resize = el('button', {
      class: 'ng-caption-overlay-resize', 'aria-label': 'ウィンドウの大きさをドラッグして変更',
      title: 'ドラッグして大きさを変更',
    }, '↘');
    resize.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || runtime.lastPlacement === null) return;
      options.state.setPosition(model.captionId, {
        leftCss: runtime.lastPlacement.leftCss, topCss: runtime.lastPlacement.topCss,
      });
      runtime.resize = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: runtime.lastPlacement.widthCss,
        startHeight: runtime.lastPlacement.heightCss,
      };
      resize.setPointerCapture(event.pointerId);
      runtime.card.dataset.resizing = 'true';
      event.preventDefault();
    });
    resize.addEventListener('pointermove', (event) => {
      if (runtime.resize?.pointerId !== event.pointerId) return;
      options.state.setSize(model.captionId, {
        widthCss: Math.max(1, runtime.resize.startWidth + event.clientX - runtime.resize.startX),
        heightCss: Math.max(1, runtime.resize.startHeight + event.clientY - runtime.resize.startY),
      });
      event.preventDefault();
    });
    const finishResize = (event: PointerEvent): void => {
      if (runtime.resize?.pointerId !== event.pointerId) return;
      if (resize.hasPointerCapture(event.pointerId)) resize.releasePointerCapture(event.pointerId);
      runtime.resize = null;
      delete runtime.card.dataset.resizing;
    };
    resize.addEventListener('pointerup', finishResize);
    resize.addEventListener('pointercancel', finishResize);
    runtime.card.append(content, resize);
    for (const [item, image, thumbnailStatus, retry] of thumbnailsToQueue) {
      queueRuntimeThumbnail(runtime, item, image, thumbnailStatus, retry);
    }
  };

  const createRuntime = (captionId: string): WindowRuntime => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke-width', '2');
    svg.append(line);
    const card = el('article', {
      class: 'ng-caption-overlay', role: 'note', tabindex: '-1', 'data-caption-id': captionId,
    });
    windowLayer.append(card);
    const runtime: WindowRuntime = {
      captionId, card, line, model: null, signature: '', lastPlacement: null,
      drag: null, resize: null, status: null, statusMessage: '',
      mediaGeneration: 0, mediaUrls: new Set(),
    };
    runtimes.set(captionId, runtime);
    return runtime;
  };

  const syncImageWindow = (): void => {
    const selection = mediaViewerSelection;
    if (selection === null) return;
    const snapshot = options.getSnapshot();
    if (selection.captionId !== null) {
      const caption = snapshot.captions.find((candidate) => candidate.id === selection.captionId);
      if (
        caption === undefined || nativeCaptionDisplaySetIdV1(caption) !== options.getActiveDisplaySetId() ||
        selection.mediaIds.some((id) => !(caption.attachmentMediaIds ?? []).includes(id))
      ) closeImageWindow();
    } else if (selection.mediaIds.some((id) => resolveMedia(id) === null)) closeImageWindow();
  };

  const sync = (): void => {
    if (disposed) return;
    const snapshot = options.getSnapshot();
    options.state.reconcile(snapshot);
    const setId = options.getActiveDisplaySetId();
    const selected = options.getSelectedCaptionId();
    if (selected !== null) options.state.bringToFront(selected);
    const allIds = options.state.allOpenCaptionIds(setId, selected);
    const openIds = options.state.openCaptionIds(setId, selected);
    const openSet = new Set(openIds);
    for (const [id, runtime] of runtimes) {
      if (openSet.has(id)) continue;
      cancelRuntimeMedia(runtime);
      runtime.line.remove();
      runtime.card.remove();
      runtimes.delete(id);
    }
    for (const id of openIds) {
      const model = resolveNativeCaptionWindowV1(snapshot, id, setId);
      if (model === null) continue;
      const runtime = runtimes.get(id) ?? createRuntime(id);
      const signature = JSON.stringify([
        model, id === selected, options.state.isRetained(setId, id),
      ]);
      runtime.model = model;
      runtime.card.setAttribute('aria-current', String(id === selected));
      if (signature !== runtime.signature) {
        runtime.signature = signature;
        renderRuntime(runtime, model);
      }
    }
    comparisonTools.hidden = allIds.length < 2;
    modeButton.textContent = options.state.comparisonMode(setId) === 'all' ? '1枚ずつ' : '並べて表示';
    modeButton.setAttribute('aria-pressed', String(options.state.comparisonMode(setId) === 'single'));
    syncImageWindow();
  };

  const arrange = (): void => {
    const setId = options.getActiveDisplaySetId();
    const ids = options.state.allOpenCaptionIds(setId, options.getSelectedCaptionId());
    const placements = arrangeNativeCaptionWindowsV1(
      options.stage.clientWidth, options.stage.clientHeight, ids.length,
    );
    if (placements === null) {
      options.state.setComparisonMode(setId, 'single');
      comparisonNotice.hidden = false;
      comparisonNotice.textContent = '画面に収まらないため1枚ずつ表示';
      sync();
      return;
    }
    options.state.arrange(ids);
    ids.forEach((id, index) => {
      const placement = placements[index]!;
      options.state.setPosition(id, { leftCss: placement.leftCss, topCss: placement.topCss });
      options.state.setSize(id, { widthCss: placement.widthCss, heightCss: placement.heightCss });
      const runtime = runtimes.get(id);
      if (runtime !== undefined) runtime.lastPlacement = null;
    });
    comparisonNotice.hidden = true;
    comparisonNotice.textContent = '';
    sync();
  };

  arrangeButton.addEventListener('click', arrange);
  modeButton.addEventListener('click', () => {
    const setId = options.getActiveDisplaySetId();
    options.state.setComparisonMode(setId, options.state.comparisonMode(setId) === 'all' ? 'single' : 'all');
    comparisonNotice.hidden = true;
    comparisonNotice.textContent = '';
    sync();
  });

  const updatePositions = (): void => {
    sync();
    const setId = options.getActiveDisplaySetId();
    const selected = options.getSelectedCaptionId();
    const ids = options.state.openCaptionIds(setId, selected);
    ids.forEach((id, index) => {
      const runtime = runtimes.get(id);
      const model = runtime?.model;
      if (runtime === undefined || model === null || model === undefined) return;
      if (options.state.size(id) === null) runtime.card.style.height = '';
      const assetAvailable = model.pinAvailability !== 'available' || options.isCaptionAssetAvailable?.(id) !== false;
      const point = model.pinAvailability === 'available' && assetAvailable ? options.projectCaption(id) : null;
      const preferredPosition = options.state.position(id);
      const preferredSize = options.state.size(id);
      const anchored = point === null ? null : placeNativeCaptionOverlayV1(
        options.stage.clientWidth, options.stage.clientHeight, runtime.card.offsetHeight,
        point, preferredPosition, preferredSize,
      );
      const priorPlacement = runtime.lastPlacement ?? options.state.resolvedPlacement(id);
      const previousPosition = preferredPosition ?? (priorPlacement === null ? null : {
        leftCss: priorPlacement.leftCss,
        topCss: priorPlacement.topCss,
      });
      const previousSize = preferredSize ?? (priorPlacement === null ? null : {
        widthCss: priorPlacement.widthCss,
        heightCss: priorPlacement.heightCss,
      });
      const placement = anchored ?? floatingPlacement(
        options.stage.clientWidth, options.stage.clientHeight, runtime.card.offsetHeight,
        index, previousPosition, previousSize,
      );
      if (placement === null) {
        runtime.card.style.display = 'none';
        runtime.line.style.display = 'none';
        return;
      }
      runtime.lastPlacement = placement;
      options.state.setResolvedPlacement(id, {
        leftCss: placement.leftCss,
        topCss: placement.topCss,
        widthCss: placement.widthCss,
        heightCss: placement.heightCss,
      });
      if (preferredPosition !== null && (
        preferredPosition.leftCss !== placement.leftCss || preferredPosition.topCss !== placement.topCss
      )) {
        options.state.setPosition(id, { leftCss: placement.leftCss, topCss: placement.topCss });
      }
      if (preferredSize !== null && (
        preferredSize.widthCss !== placement.widthCss || preferredSize.heightCss !== placement.heightCss
      )) {
        options.state.setSize(id, { widthCss: placement.widthCss, heightCss: placement.heightCss });
      }
      runtime.card.style.display = '';
      runtime.card.style.width = `${placement.widthCss}px`;
      runtime.card.style.height = `${placement.heightCss}px`;
      runtime.card.style.transform = `translate(${Math.round(placement.leftCss)}px, ${Math.round(placement.topCss)}px)`;
      runtime.card.style.zIndex = String(ids.indexOf(id));
      const colorVisible = options.isPinColorVisible?.(id) !== false;
      const showConnector = anchored !== null && colorVisible;
      runtime.line.style.display = showConnector ? '' : 'none';
      if (showConnector) {
        runtime.line.setAttribute('x1', String(point!.xCss));
        runtime.line.setAttribute('y1', String(point!.yCss));
        runtime.line.setAttribute('x2', String(placement.lineEndXCss));
        runtime.line.setAttribute('y2', String(placement.lineEndYCss));
      }
      const status = runtime.status!;
      let message = '';
      if (model.pinAvailability === 'unplaced') message = 'ピンは未配置です。';
      else if (model.pinAvailability === 'asset-hidden') message = '所属モデルが非表示です。';
      else if (model.pinAvailability === 'asset-unavailable' || !assetAvailable) message = '所属モデルを利用できません。';
      else if (anchored === null) message = 'ピンは画面外です。';
      else if (!colorVisible) message = '色の絞り込みでピンを非表示にしています。';
      if (runtime.statusMessage !== message) {
        runtime.statusMessage = message;
        clear(status);
        status.hidden = message === '';
        if (message !== '') {
          status.append(el('span', {}, message));
          if (model.pinAvailability === 'available' && assetAvailable && !colorVisible) {
            const show = el('button', {}, '表示');
            show.addEventListener('click', () => options.onShowPinColor?.(id));
            status.append(show);
          }
        }
      }
    });
    animationFrame = requestAnimationFrame(updatePositions);
  };

  updatePositions();
  return {
    sync,
    arrange,
    openMedia,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      closeImageWindow();
      for (const runtime of runtimes.values()) {
        cancelRuntimeMedia(runtime);
        runtime.card.remove();
      }
      runtimes.clear();
      svg.remove();
      windowLayer.remove();
      comparisonTools.remove();
    },
  };
}
