// 連結画像ウィンドウ — キャプション窓から線が伸びた大きな画像ウィンドウ。
// 拡大縮小（ピンチ/ホイール/ダブルタップ + フィット/原寸/2倍）、回転90°、
// 画像加工（白黒化・階調反転・明るさ・コントラスト、表示のみ）、全画面、前後送り。
//
// 加工はすべてCSS filterで表示にのみ適用し、原本は変更しない（原本主義）。

import { el, clear } from './dom';
import { fStr } from './fields';
import type { AppContext } from './context';

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;

interface Filters {
  gray: boolean;
  invert: boolean;
  brightness: number; // 0.2–2.5
  contrast: number; // 0.2–2.5
}

const DEFAULT_FILTERS: Filters = { gray: false, invert: false, brightness: 1, contrast: 1 };

export function openImageWindow(ctx: AppContext, attachmentIds: string[], startIndex: number): void {
  const stage = (document.querySelector('.lv-stage') as HTMLElement | null) ?? document.body;

  let idx = Math.max(0, Math.min(startIndex, attachmentIds.length - 1));
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let rotation = 0; // 0/90/180/270
  let naturalW = 0;
  let naturalH = 0;
  let filters: Filters = { ...DEFAULT_FILTERS };
  let fullscreen = false;

  // ---- DOM --------------------------------------------------------------------
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lv-imgwin-line');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke', '#eab308');
  line.setAttribute('stroke-width', '2');
  svg.append(line);

  const img = el('img', { class: 'lv-imgwin-img', alt: '', draggable: 'false' }) as HTMLImageElement;
  const viewport = el('div', { class: 'lv-imgwin-viewport' }, img);

  const nameLabel = el('span', { class: 'lv-imgwin-name' });
  const zoomLabel = el('span', { class: 'lv-imgwin-zoom' });
  const counter = el('span', { class: 'lv-dim' });

  const adjustPanel = el('div', { class: 'lv-imgwin-adjust' });

  const root = el('div', { class: 'lv-imgwin', role: 'dialog', 'aria-label': '画像' });

  // 倍率スライダー（log スケール: 低倍率側にも解像度を残す）。0–1000 → scale
  const zoomSlider = el('input', {
    type: 'range', min: '0', max: '1000', step: '1', value: '0', class: 'lv-imgwin-zoomrange',
    'aria-label': '倍率',
    oninput: (ev) => {
      const rect = viewport.getBoundingClientRect();
      setScale(sliderToScale(Number((ev.target as HTMLInputElement).value) / 1000), rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
  }) as HTMLInputElement;

  // ---- 変換・フィルタ適用 --------------------------------------------------------
  function scaleToSlider(s: number): number {
    return Math.log(Math.max(s, MIN_SCALE) / MIN_SCALE) / Math.log(MAX_SCALE / MIN_SCALE);
  }
  function sliderToScale(t: number): number {
    return MIN_SCALE * Math.pow(MAX_SCALE / MIN_SCALE, t);
  }
  function applyTransform(): void {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotation}deg)`;
    zoomLabel.textContent = naturalW > 0 ? `${naturalW}×${naturalH} · ${Math.round(scale * 100)}%` : '';
    // スライダー操作中は上書きしない
    if (document.activeElement !== zoomSlider) {
      zoomSlider.value = String(Math.round(scaleToSlider(scale) * 1000));
    }
  }
  function applyFilter(): void {
    const parts: string[] = [];
    if (filters.gray) parts.push('grayscale(1)');
    if (filters.invert) parts.push('invert(1)');
    if (filters.brightness !== 1) parts.push(`brightness(${filters.brightness})`);
    if (filters.contrast !== 1) parts.push(`contrast(${filters.contrast})`);
    img.style.filter = parts.join(' ');
  }

  function viewportSize(): { w: number; h: number } {
    const r = viewport.getBoundingClientRect();
    return { w: Math.max(r.width, 1), h: Math.max(r.height, 1) };
  }

  function containScale(): number {
    if (naturalW === 0) return 1;
    const { w, h } = viewportSize();
    // 90/270度回転時は幅高さが入れ替わる
    const rotated = rotation % 180 !== 0;
    const iw = rotated ? naturalH : naturalW;
    const ih = rotated ? naturalW : naturalH;
    return Math.min(w / iw, h / ih);
  }

  function fit(): void {
    scale = containScale();
    tx = 0;
    ty = 0;
    applyTransform();
  }
  function setScale(next: number, cx?: number, cy?: number): void {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    if (cx !== undefined && cy !== undefined) {
      const rect = viewport.getBoundingClientRect();
      const ox = cx - (rect.left + rect.width / 2);
      const oy = cy - (rect.top + rect.height / 2);
      const k = clamped / scale;
      tx = ox + (tx - ox) * k;
      ty = oy + (ty - oy) * k;
    }
    scale = clamped;
    applyTransform();
  }

  // ---- 画像の切替 ---------------------------------------------------------------
  async function show(i: number): Promise<void> {
    idx = (i + attachmentIds.length) % attachmentIds.length;
    counter.textContent = attachmentIds.length > 1 ? `${idx + 1} / ${attachmentIds.length}` : '';
    rotation = 0;
    filters = { ...DEFAULT_FILTERS };
    applyFilter();
    renderAdjust();
    const astId = attachmentIds[idx]!;
    const asset = ctx.asset(astId);
    nameLabel.textContent = asset !== null ? fStr(asset, 'originalName') : '';
    naturalW = 0;
    naturalH = 0;
    img.removeAttribute('src');
    img.style.display = '';
    noimg.style.display = 'none';
    const url = await ctx.mediaUrl(astId);
    if (url === null) {
      showNoImage('メディアを読み込めません');
      return;
    }
    img.src = url;
  }

  const noimg = el('div', { class: 'lv-imgwin-noimg' });
  function showNoImage(msg: string): void {
    img.style.display = 'none';
    noimg.style.display = '';
    noimg.textContent = msg;
  }
  img.addEventListener('load', () => {
    naturalW = img.naturalWidth;
    naturalH = img.naturalHeight;
    fit();
  });
  img.addEventListener('error', () => showNoImage('表示できない形式です（HEIC等）'));

  // ---- 操作 -------------------------------------------------------------------
  function close(): void {
    if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
    document.removeEventListener('keydown', onKey);
    offTick();
    svg.remove();
    root.remove();
  }
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') close();
    else if (ev.key === 'ArrowRight' && attachmentIds.length > 1) void show(idx + 1);
    else if (ev.key === 'ArrowLeft' && attachmentIds.length > 1) void show(idx - 1);
    else if (ev.key === '+') setScale(scale * 1.25);
    else if (ev.key === '-') setScale(scale / 1.25);
  };
  document.addEventListener('keydown', onKey);

  viewport.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    setScale(scale * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX, ev.clientY);
  }, { passive: false });

  // パン + ピンチ
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  viewport.addEventListener('pointerdown', (ev) => {
    viewport.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      pinchStartScale = scale;
    }
  });
  viewport.addEventListener('pointermove', (ev) => {
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
      setScale(pinchStartScale * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinchStartDist));
    }
  });
  const endPointer = (ev: PointerEvent): void => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
  };
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('dblclick', (ev) => {
    if (Math.abs(scale - containScale()) < 0.01) setScale(2, ev.clientX, ev.clientY);
    else fit();
  });

  function toggleFullscreen(): void {
    fullscreen = !fullscreen;
    root.classList.toggle('fullscreen', fullscreen);
    svg.style.display = fullscreen ? 'none' : '';
    requestAnimationFrame(() => fit());
  }

  // ---- 加工パネル --------------------------------------------------------------
  let adjustOpen = false;
  function renderAdjust(): void {
    clear(adjustPanel);
    if (!adjustOpen) {
      adjustPanel.style.display = 'none';
      return;
    }
    adjustPanel.style.display = '';
    const grayBtn = el('button', {
      class: filters.gray ? 'active' : '',
      onclick: () => { filters.gray = !filters.gray; applyFilter(); renderAdjust(); },
    }, '白黒');
    const invBtn = el('button', {
      class: filters.invert ? 'active' : '',
      onclick: () => { filters.invert = !filters.invert; applyFilter(); renderAdjust(); },
    }, '階調反転');
    const brightOut = el('output', {}, `${Math.round(filters.brightness * 100)}%`);
    const bright = el('input', {
      type: 'range', min: '0.2', max: '2.5', step: '0.05', value: String(filters.brightness),
      oninput: (ev) => {
        filters.brightness = Number((ev.target as HTMLInputElement).value);
        brightOut.textContent = `${Math.round(filters.brightness * 100)}%`;
        applyFilter();
      },
    });
    const contOut = el('output', {}, `${Math.round(filters.contrast * 100)}%`);
    const cont = el('input', {
      type: 'range', min: '0.2', max: '2.5', step: '0.05', value: String(filters.contrast),
      oninput: (ev) => {
        filters.contrast = Number((ev.target as HTMLInputElement).value);
        contOut.textContent = `${Math.round(filters.contrast * 100)}%`;
        applyFilter();
      },
    });
    adjustPanel.append(
      el('div', { class: 'lv-row' }, grayBtn, invBtn,
        el('button', { onclick: () => { filters = { ...DEFAULT_FILTERS }; applyFilter(); renderAdjust(); } }, 'リセット'),
      ),
      el('div', { class: 'lv-row' }, el('span', { class: 'lv-imgwin-adjlabel' }, '明るさ'), bright, brightOut),
      el('div', { class: 'lv-row' }, el('span', { class: 'lv-imgwin-adjlabel' }, 'コントラスト'), cont, contOut),
    );
  }

  // ---- 組み立て ----------------------------------------------------------------
  const btn = (label: string, onclick: () => void, title?: string): HTMLElement =>
    el('button', { class: 'mini', onclick, ...(title !== undefined ? { title } : {}) }, label);

  const toolbar = el('div', { class: 'lv-imgwin-toolbar' },
    nameLabel,
    counter,
    el('span', { class: 'lv-flex1' }),
    zoomLabel,
    el('button', { class: 'mini', onclick: close, 'aria-label': '閉じる' }, '×'),
  );

  const controls = el('div', { class: 'lv-imgwin-controls' },
    btn('フィット', () => fit(), '全体表示に戻す'),
    el('span', { class: 'lv-imgwin-zoomwrap' }, el('span', { class: 'lv-dim' }, '−'), zoomSlider, el('span', { class: 'lv-dim' }, '＋')),
    btn('⟳', () => { rotation = (rotation + 90) % 360; fit(); }, '90°回転'),
    btn('加工', () => { adjustOpen = !adjustOpen; renderAdjust(); }, '白黒・反転・明るさ・コントラスト'),
    btn('⛶', () => toggleFullscreen(), '全画面'),
    ...(attachmentIds.length > 1
      ? [btn('‹', () => void show(idx - 1), '前へ'), btn('›', () => void show(idx + 1), '次へ')]
      : []),
  );

  root.append(toolbar, viewport, noimg, adjustPanel, controls);
  stage.append(svg, root);
  renderAdjust();
  void show(idx);

  // ---- キャプション窓との結線（毎ティック追従） ------------------------------------
  function updateLine(): void {
    if (fullscreen) return;
    const capWin = document.querySelector('.lv-cap-overlay') as HTMLElement | null;
    const stageRect = stage.getBoundingClientRect();
    if (capWin === null || capWin.style.display === 'none') {
      svg.style.display = 'none';
      return;
    }
    const cr = capWin.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    if (cr.width === 0) {
      svg.style.display = 'none';
      return;
    }
    svg.style.display = '';
    // キャプション窓の中心 → 画像ウィンドウの最寄り辺の中点（ステージ座標系）
    const ccx = cr.left + cr.width / 2 - stageRect.left;
    const ccy = cr.top + cr.height / 2 - stageRect.top;
    const rcx = rr.left + rr.width / 2 - stageRect.left;
    const edgeX = ccx < rcx ? rr.left - stageRect.left : rr.right - stageRect.left;
    const edgeY = Math.max(rr.top - stageRect.top + 12, Math.min(ccy, rr.bottom - stageRect.top - 12));
    line.setAttribute('x1', String(Math.round(ccx)));
    line.setAttribute('y1', String(Math.round(ccy)));
    line.setAttribute('x2', String(Math.round(edgeX)));
    line.setAttribute('y2', String(Math.round(edgeY)));
  }
  const offTick = ctx.viewer.onRenderTick(updateLine);
  updateLine();
}
