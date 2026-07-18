// モーダルダイアログ部品（マージレポート・確認・CSV取込プラン）

import type { MergeReport } from '../core/merge';
import type { CsvImportPlan } from '../io/csv';
import { el, clear } from './dom';

function openModal(title: string, body: HTMLElement, actions: HTMLElement[]): HTMLElement {
  const backdrop = el('div', { class: 'lv-modal-backdrop' });
  const card = el(
    'div',
    { class: 'lv-modal-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'lv-modal-title' }, title),
    body,
    el('div', { class: 'lv-modal-actions' }, ...actions),
  );
  backdrop.append(card);
  document.body.append(backdrop);
  return backdrop;
}

export function closeModal(node: HTMLElement): void {
  node.remove();
}

export function confirmDialog(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const body = el('div', { class: 'lv-modal-body' }, message);
    const cancel = el('button', {
      onclick: () => {
        closeModal(root);
        resolve(false);
      },
    }, 'キャンセル');
    const ok = el('button', {
      class: 'primary',
      onclick: () => {
        closeModal(root);
        resolve(true);
      },
    }, 'OK');
    const root = openModal(title, body, [cancel, ok]);
  });
}

export function infoDialog(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const body = el('div', { class: 'lv-modal-body' }, message);
    const ok = el('button', {
      class: 'primary',
      onclick: () => {
        closeModal(root);
        resolve();
      },
    }, 'OK');
    const root = openModal(title, body, [ok]);
  });
}

/** マージレポート（docs/05 §3.4）。「自分の値に戻す」はコールバックで通常編集として積む */
export function mergeReportDialog(
  report: MergeReport,
  sourceLabel: string,
  displayName: (userId: string) => string,
  restoreField: (kind: string, id: string, field: string, hlcOfLoser: string) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const body = el('div', { class: 'lv-modal-body' });
    const row = (icon: string, cls: string, text: string): HTMLElement =>
      el('div', { class: 'lv-mr-row' }, el('span', { class: `lv-mr-ico ${cls}` }, icon), text);

    body.append(row('＋', 'ok', `新規 ${report.created.length}件`));
    body.append(row('~', 'info', `更新 ${report.updated.length}件`));
    body.append(row('−', 'bad', `削除 ${report.deleted.length}件`));
    if (report.revived.length > 0) body.append(row('↩', 'info', `復活 ${report.revived.length}件`));

    if (report.overwritten.length > 0) {
      body.append(row('⚠', 'warn', `自動解決（上書き） ${report.overwritten.length}件`));
      for (const o of report.overwritten) {
        const detail = el(
          'div',
          { class: 'lv-mr-detail' },
          `${o.id.slice(0, 12)}… の「${o.field}」: ${displayName(o.loserUser)} の変更が ${displayName(o.winnerUser)} の変更で上書きされました `,
          el('button', {
            class: 'mini',
            onclick: (ev) => {
              restoreField(o.kind, o.id, o.field, o.loserHlc);
              (ev.target as HTMLButtonElement).disabled = true;
              (ev.target as HTMLButtonElement).textContent = '戻しました';
            },
          }, '自分の値に戻す'),
        );
        body.append(detail);
      }
    }
    if (report.rejected.length > 0) {
      body.append(row('⚠', 'warn', `取込側が古かったため保持 ${report.rejected.length}件`));
    }

    const ok = el('button', {
      class: 'primary',
      onclick: () => {
        closeModal(root);
        resolve();
      },
    }, 'OK');
    const root = openModal(`統合結果 — ${sourceLabel}`, body, [ok]);
  });
}

/** CSV取込プランの確認（削除は既定OFFのチェックで明示適用） */
export function csvPlanDialog(
  plan: CsvImportPlan,
): Promise<{ apply: boolean; applyDeletes: boolean }> {
  return new Promise((resolve) => {
    const body = el('div', { class: 'lv-modal-body' });
    body.append(el('div', {}, `更新 ${plan.updates.length}件 / 新規 ${plan.creates.length}件 / 新規セット ${plan.newSetNames.length}件`));
    const delCheck = el('input', { type: 'checkbox' }) as HTMLInputElement;
    if (plan.deleteCandidates.length > 0) {
      body.append(
        el('label', { class: 'lv-mr-detail' }, delCheck,
          ` CSVに無い ${plan.deleteCandidates.length}件のキャプションを削除する（既定では削除しません）`),
      );
    }
    if (plan.issues.length > 0) {
      const issues = el('div', { class: 'lv-mr-detail warn' });
      for (const i of plan.issues.slice(0, 8)) issues.append(el('div', {}, `⚠ ${i}`));
      if (plan.issues.length > 8) issues.append(el('div', {}, `…他${plan.issues.length - 8}件`));
      body.append(issues);
    }
    const cancel = el('button', {
      onclick: () => {
        closeModal(root);
        resolve({ apply: false, applyDeletes: false });
      },
    }, 'キャンセル');
    const ok = el('button', {
      class: 'primary',
      onclick: () => {
        closeModal(root);
        resolve({ apply: true, applyDeletes: delCheck.checked });
      },
    }, '取り込む');
    const root = openModal('CSV取込の確認', body, [cancel, ok]);
  });
}

/** 汎用の入力ダイアログ */
export function promptDialog(title: string, placeholder: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', placeholder, value: initial }) as HTMLInputElement;
    const body = el('div', { class: 'lv-modal-body' }, input);
    const cancel = el('button', {
      onclick: () => {
        closeModal(root);
        resolve(null);
      },
    }, 'キャンセル');
    const ok = el('button', {
      class: 'primary',
      onclick: () => {
        closeModal(root);
        resolve(input.value.trim() === '' ? null : input.value.trim());
      },
    }, 'OK');
    const root = openModal(title, body, [cancel, ok]);
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok.click();
    });
  });
}

export { clear };
