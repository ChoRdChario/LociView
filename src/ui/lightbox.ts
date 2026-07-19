// メディアライトボックス — 添付画像/映像の拡大表示ユーティリティ
// ズーム（ホイール/ピンチ/ボタン）・パン（ドラッグ）・全画面・前後送り・Esc/×で閉じる

import { el, clear } from './dom';
import { fStr } from './fields';
import type { AppContext } from './context';

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;

export function openLightbox(ctx: AppContext, attachmentIds: string[], startIndex: number): void {
  let idx = Math.max(0, Math.min(startIndex, attachmentIds.length - 1));
  let scale = 1;
  let tx = 0;
  let ty = 0;

  const mediaWrap = el('div', { class: 'lv-lb-media' });
  const counter = el('span', { class: 'lv-dim' });
  const nameLabel = el('span', { class: 'lv-lb-name' });

  const zoomLabel = el('span', { class: 'lv-dim lv-lb-zoom' }, '100%');

  function applyTransform(): void {
    const target = mediaWrap.firstElementChild as HTMLElement | null;
    if (target !== null) {
      target.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }

  function setScale(next: number, cx?: number, cy?: number): void {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    if (cx !== undefined && cy !== undefined) {
      // 指定点を中心にズーム（画面座標基準）
      const rect = mediaWrap.getBoundingClientRect();
      const ox = cx - (rect.left + rect.width / 2);
      const oy = cy - (rect.top + rect.height / 2);
      const k = clamped / scale;
      tx = ox + (tx - ox) * k;
      ty = oy + (ty - oy) * k;
    }
    scale = clamped;
    applyTransform();
  }

  function resetView(): void {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }

  async function show(i: number): Promise<void> {
    idx = (i + attachmentIds.length) % attachmentIds.length;
    resetView();
    clear(mediaWrap);
    counter.textContent = attachmentIds.length > 1 ? `${idx + 1} / ${attachmentIds.length}` : '';
    const astId = attachmentIds[idx]!;
    const asset = ctx.asset(astId);
    nameLabel.textContent = asset !== null ? fStr(asset, 'originalName') : '';
    const url = await ctx.mediaUrl(astId);
    if (url === null) {
      mediaWrap.append(el('div', { class: 'lv-dim' }, 'メディアを読み込めません（差分ZIPの場合はフルZIPが必要です）'));
      return;
    }
    if (asset !== null && fStr(asset, 'kind') === 'video') {
      const video = el('video', { class: 'lv-lb-item', controls: true }) as HTMLVideoElement;
      video.src = url;
      mediaWrap.append(video);
    } else {
      const img = el('img', { class: 'lv-lb-item', alt: nameLabel.textContent ?? '添付' }) as HTMLImageElement;
      img.src = url;
      img.draggable = false;
      mediaWrap.append(img);
    }
    applyTransform();
  }

  // ---- 操作 -------------------------------------------------------------------

  const root = el('div', { class: 'lv-lightbox', role: 'dialog', 'aria-label': '添付メディア' });

  function close(): void {
    if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
    document.removeEventListener('keydown', onKey);
    root.remove();
  }

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') close();
    else if (ev.key === 'ArrowRight') void show(idx + 1);
    else if (ev.key === 'ArrowLeft') void show(idx - 1);
    else if (ev.key === '+') setScale(scale * 1.25);
    else if (ev.key === '-') setScale(scale / 1.25);
  };
  document.addEventListener('keydown', onKey);

  // ホイールズーム
  mediaWrap.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    setScale(scale * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX, ev.clientY);
  }, { passive: false });

  // ドラッグパン + ピンチズーム（Pointer Events）
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  mediaWrap.addEventListener('pointerdown', (ev) => {
    mediaWrap.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      pinchStartScale = scale;
    }
  });
  mediaWrap.addEventListener('pointermove', (ev) => {
    const prev = pointers.get(ev.pointerId);
    if (prev === undefined) return;
    if (pointers.size === 1) {
      tx += ev.clientX - prev.x;
      ty += ev.clientY - prev.y;
      applyTransform();
    }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2 && pinchStartDist > 0) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      setScale(pinchStartScale * (dist / pinchStartDist));
    }
  });
  const endPointer = (ev: PointerEvent): void => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
  };
  mediaWrap.addEventListener('pointerup', endPointer);
  mediaWrap.addEventListener('pointercancel', endPointer);
  mediaWrap.addEventListener('dblclick', (ev) => {
    if (scale === 1) setScale(2.5, ev.clientX, ev.clientY);
    else resetView();
  });

  const toolbar = el('div', { class: 'lv-lb-toolbar' },
    nameLabel,
    counter,
    el('span', { class: 'lv-flex1' }),
    el('button', { onclick: () => setScale(scale / 1.25), 'aria-label': '縮小' }, '−'),
    zoomLabel,
    el('button', { onclick: () => setScale(scale * 1.25), 'aria-label': '拡大' }, '＋'),
    el('button', { onclick: () => resetView() }, '100%'),
    el('button', {
      'aria-label': '全画面',
      onclick: () => {
        if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
        else void root.requestFullscreen().catch(() => {});
      },
    }, '⛶'),
    el('button', { onclick: close, 'aria-label': '閉じる' }, '×'),
  );

  root.append(
    toolbar,
    mediaWrap,
    attachmentIds.length > 1
      ? el('button', { class: 'lv-lb-nav prev', onclick: () => void show(idx - 1), 'aria-label': '前へ' }, '‹')
      : '',
    attachmentIds.length > 1
      ? el('button', { class: 'lv-lb-nav next', onclick: () => void show(idx + 1), 'aria-label': '次へ' }, '›')
      : '',
  );
  document.body.append(root);
  void show(idx);
}
