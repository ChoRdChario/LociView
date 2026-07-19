// キャプションオーバーレイ — 選択中キャプションのウィンドウを3Dステージ上に表示し、
// ピンとウィンドウを線で結ぶ（LociMyu caption.viewer.overlay の継承）。
// 表示専用（編集はパネル側）。位置はビューアの描画ティックごとに追従する。

import { el, clear } from './dom';
import { fAnchor, fStr, fStrArr } from './fields';
import type { AppContext } from './context';

const WIN_W = 220;
const GAP = 14; // ピンからウィンドウまでの余白

export function mountCaptionOverlay(stage: HTMLElement, ctx: AppContext): () => void {
  // SVG結線レイヤ（ステージ全面・入力透過）
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lv-overlay-svg');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke-width', '1.5');
  svg.append(line);

  const win = el('div', { class: 'lv-cap-overlay', role: 'note' });
  stage.append(svg, win);

  let shownCaptionId: string | null = null;

  /** 内容の再構築（選択・内容が変わった時だけ） */
  function renderContent(): void {
    const cap = ctx.selectedCaption();
    if (cap === null) {
      shownCaptionId = null;
      win.style.display = 'none';
      svg.style.display = 'none';
      return;
    }
    shownCaptionId = cap.id;
    win.style.display = '';
    svg.style.display = '';
    const color = fStr(cap, 'color', '#eab308');
    line.setAttribute('stroke', color);
    win.style.borderColor = color;

    clear(win);
    const title = fStr(cap, 'title');
    win.append(el('b', {}, title !== '' ? title : '(無題)'));
    const body = fStr(cap, 'body');
    if (body !== '') win.append(el('div', { class: 'lv-cap-overlay-body' }, body));
    const atts = fStrArr(cap, 'attachments');
    if (atts.length > 0) {
      const thumbs = el('div', { class: 'lv-thumbs' });
      for (const astId of atts.slice(0, 3)) {
        const img = el('img', { class: 'lv-thumb sm', alt: '添付' }) as HTMLImageElement;
        void ctx.mediaUrl(astId).then((url) => {
          if (url !== null) img.src = url;
        });
        thumbs.append(img);
      }
      if (atts.length > 3) thumbs.append(el('span', { class: 'lv-dim' }, `+${atts.length - 3}`));
      win.append(thumbs);
    }
  }

  /** 位置の追従（毎ティック。DOMはtransformのみ触る） */
  function updatePosition(): void {
    if (shownCaptionId === null) return;
    const cap = ctx.selectedCaption();
    if (cap === null) return;
    const anchor = fAnchor(cap);
    if (anchor?.position === undefined) {
      win.style.display = 'none';
      svg.style.display = 'none';
      return;
    }
    const p = ctx.viewer.projectModelPoint(anchor.position);
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    if (!p.visible || p.x < -50 || p.x > stageW + 50 || p.y < -50 || p.y > stageH + 50) {
      win.style.display = 'none';
      svg.style.display = 'none';
      return;
    }
    win.style.display = '';
    svg.style.display = '';

    // ウィンドウはピンの右上を基本に、はみ出すなら左・下へ反転
    const winH = win.offsetHeight;
    let wx = p.x + GAP;
    let wy = p.y - winH - GAP;
    if (wx + WIN_W > stageW - 8) wx = p.x - WIN_W - GAP;
    if (wy < 8) wy = p.y + GAP;
    wx = Math.max(8, Math.min(wx, stageW - WIN_W - 8));
    wy = Math.max(8, Math.min(wy, stageH - winH - 8));
    win.style.transform = `translate(${Math.round(wx)}px, ${Math.round(wy)}px)`;

    // 結線: ピン → ウィンドウの最寄り辺の中点
    const cxWin = wx + WIN_W / 2;
    const lineX = p.x < cxWin ? wx : wx + WIN_W;
    const lineY = wy + Math.min(winH / 2, 24);
    line.setAttribute('x1', String(p.x));
    line.setAttribute('y1', String(p.y));
    line.setAttribute('x2', String(lineX));
    line.setAttribute('y2', String(lineY));
  }

  const offChange = ctx.onChange(() => {
    renderContent();
    updatePosition();
  });
  const offTick = ctx.viewer.onRenderTick(updatePosition);

  renderContent();
  updatePosition();

  return () => {
    offChange();
    offTick();
    svg.remove();
    win.remove();
  };
}
