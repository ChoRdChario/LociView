// プロジェクト画像ピッカー — 取り込み済みの画像アセットをサムネイル一覧で表示し、
// キャプションへ複数選択で添付する（ZIP内画像の添付・LociMyu画像の結び付けに使う）。
//
// HEICはSafariでは表示できるがChrome等では表示できない。表示できない場合はファイル名を出す。

import { el, clear, fmtBytes } from './dom';
import { fStr, fNum } from './fields';
import type { AppContext } from './context';

/** 選択された assetId 配列を返す。キャンセルはnull */
export function openImagePicker(ctx: AppContext, alreadyAttached: readonly string[]): Promise<string[] | null> {
  return new Promise((resolve) => {
    const assets = ctx.mediaAssets();
    const selected = new Set<string>();
    const attachedSet = new Set(alreadyAttached);

    const backdrop = el('div', { class: 'lv-modal-backdrop' });
    const grid = el('div', { class: 'lv-picker-grid' });
    const countLabel = el('span', { class: 'lv-dim' });

    function updateCount(): void {
      countLabel.textContent = selected.size > 0 ? `${selected.size}件を選択中` : '画像をタップして選択';
    }

    if (assets.length === 0) {
      grid.append(el('div', { class: 'lv-dim lv-pad' }, 'プロジェクトに画像がありません。データタブや添付ボタンから追加できます。'));
    }

    for (const a of assets) {
      const alreadyHere = attachedSet.has(a.id);
      const cell = el('button', {
        class: `lv-picker-cell${alreadyHere ? ' attached' : ''}`,
        type: 'button',
        title: fStr(a, 'originalName'),
        onclick: () => {
          if (selected.has(a.id)) selected.delete(a.id);
          else selected.add(a.id);
          cell.classList.toggle('sel', selected.has(a.id));
          updateCount();
        },
      });
      // サムネイル（HEIC等でデコード失敗したらファイル名にフォールバック）
      const img = el('img', { class: 'lv-picker-thumb', alt: fStr(a, 'originalName'), loading: 'lazy' }) as HTMLImageElement;
      img.addEventListener('error', () => {
        img.remove();
        cell.prepend(el('div', { class: 'lv-picker-noimg' }, '🖼'));
      });
      void ctx.mediaUrl(a.id).then((url) => {
        if (url !== null) img.src = url;
      });
      cell.append(
        img,
        el('div', { class: 'lv-picker-name' }, fStr(a, 'originalName')),
        el('div', { class: 'lv-picker-size' }, alreadyHere ? '添付済み' : fmtBytes(fNum(a, 'size', 0))),
      );
      grid.append(cell);
    }
    updateCount();

    const cancel = el('button', {
      onclick: () => {
        backdrop.remove();
        resolve(null);
      },
    }, 'キャンセル');
    const ok = el('button', {
      class: 'primary',
      onclick: () => {
        backdrop.remove();
        resolve([...selected]);
      },
    }, '添付する');

    const card = el('div', { class: 'lv-modal-card lv-picker-card', role: 'dialog', 'aria-label': 'プロジェクトの画像' },
      el('div', { class: 'lv-modal-title' }, 'プロジェクトの画像から選ぶ'),
      el('div', { class: 'lv-row lv-space' }, countLabel),
      grid,
      el('div', { class: 'lv-modal-actions' }, cancel, ok),
    );
    backdrop.append(card);
    document.body.append(backdrop);
  });
}
