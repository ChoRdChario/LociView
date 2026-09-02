// 従来形式のデータタブ — 閲覧専用sourceから新しい形式へ進む唯一の作業導線。

import { LOCIMYU_SOURCE_RETENTION_NOTICE } from '../../io/locimyu';
import { el, fmtBytes } from '../dom';
import type { AppContext } from '../context';
import { infoDialog } from '../dialogs';

export interface DataTabDeps {
  convertOpenedV1ToNative: (onStatus: (message: string) => void) => Promise<void>;
}

/** Retained for historical package-export acceptance; no candidate UI calls it. */
export function packageExportCompletionMessage(
  kind: 'full' | 'diff',
  byteLength: number,
): string {
  return `${fmtBytes(byteLength)} のダウンロードを開始しました（ブラウザでの保存完了は未確認です）。${kind === 'diff'
    ? '（opsのみの軽量差分。相手がモデル・画像を持っている場合の受け渡し用）'
    : `LociMyuから取り込んだプロジェクトの場合: ${LOCIMYU_SOURCE_RETENTION_NOTICE}`}`;
}

export function mountDataTab(container: HTMLElement, ctx: AppContext, deps: DataTabDeps): () => void {
  let conversionInFlight = false;
  const conversionStatus = el(
    'p',
    { class: 'lv-dim', role: 'status' },
    '保存されている従来形式は変更せず、編集できる新しいプロジェクトを作ります。',
  );
  const convert = el('button', {
    class: 'primary',
    onclick: () => {
      if (conversionInFlight) return;
      conversionInFlight = true;
      convert.setAttribute('disabled', 'true');
      void deps.convertOpenedV1ToNative((message) => { conversionStatus.textContent = message; })
        .catch(async (error) => {
          conversionStatus.textContent = error instanceof Error ? error.message : String(error);
          await infoDialog('新しい形式へ変換', conversionStatus.textContent);
        })
        .finally(() => {
          conversionInFlight = false;
          convert.removeAttribute('disabled');
        });
    },
  }, '新しい形式へ変換して編集');

  container.append(
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, '従来形式・閲覧専用'),
      el('div', { class: 'lv-row' }, convert),
      conversionStatus,
    ),
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, 'プロジェクト情報'),
      el('div', { class: 'lv-dim' },
        `名称: ${ctx.store.manifest.name} / 作成: ${ctx.store.manifest.createdAt.slice(0, 10)}`),
    ),
  );

  return () => {};
}
