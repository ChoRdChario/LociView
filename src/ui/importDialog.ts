// インポートウィザードUI（FR-02）
// Drive フォルダZIP を投入したときに、中身の確認・プロジェクト名・画像手動リンクを行う。

import {
  IMPORT_DIAGNOSTIC_DISPLAY_LIMIT,
  type ImportPlan,
} from '../assets/importWizard';
import { LOCIMYU_SOURCE_RETENTION_NOTICE, summarizeMigration } from '../io/locimyu';
import { el, clear, fmtBytes } from './dom';
import {
  ImportSourceSelectionController,
  type ImportSourceSelectionOutcome,
} from './importSourceSelection';

export interface ImportWizardResult {
  projectName: string;
  imageLinks: Map<string, string>;
}

export interface ImportWizardOptions {
  /** LociMyu ZIPを中間v1なしでNative projectへ変換するbounded lane。 */
  readonly directNative?: boolean;
}

export function importWizardRetentionNotice(plan: Pick<ImportPlan, 'migration'>): string | null {
  return plan.migration === null ? null : `⚠ ${LOCIMYU_SOURCE_RETENTION_NOTICE}`;
}

export function shouldRebuildImportLinks(outcome: ImportSourceSelectionOutcome): boolean {
  return outcome.kind === 'selected';
}

export interface ImportWizardVisibleDiagnostics {
  selection: string | null;
  currentSource: string[];
  omittedCurrentSource: number;
  background: string[];
  omittedBackground: number;
}

/** Keep current-source facts visible even when the archive has many rejected candidates. */
export function importWizardVisibleDiagnostics(
  plan: Pick<ImportPlan, 'diagnostics'>,
  limitPerGroup = IMPORT_DIAGNOSTIC_DISPLAY_LIMIT,
): ImportWizardVisibleDiagnostics {
  const currentSource = plan.diagnostics.selectedSource.slice(0, limitPerGroup);
  const allBackground = [
    ...plan.diagnostics.archive,
    ...plan.diagnostics.rejectedCandidates,
  ];
  return {
    selection: plan.diagnostics.selection,
    currentSource,
    omittedCurrentSource: plan.diagnostics.selectedSource.length - currentSource.length,
    background: allBackground.slice(0, limitPerGroup),
    omittedBackground: Math.max(0, allBackground.length - limitPerGroup),
  };
}

/** キャプション → 画像ファイル名 の手動リンクを含むウィザード。キャンセル時はnull */
export function importWizardDialog(
  plan: ImportPlan,
  defaultName: string,
  options: ImportWizardOptions = {},
): Promise<ImportWizardResult | null> {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'lv-modal-backdrop' });
    const nameInput = el('input', { type: 'text', value: defaultName, placeholder: 'プロジェクト名' }) as HTMLInputElement;
    const imageLinks = new Map<string, string>();
    const sourceSelection = new ImportSourceSelectionController();
    let okButton: HTMLButtonElement | null = null;

    // ---- スプレッドシートの選択（複数ある場合） ----
    const sourceSection = el('div', { class: 'lv-grp' });
    if (plan.sources.length > 1) {
      const sourceSelect = el('select', {
        onchange: async (ev) => {
          const select = ev.target as HTMLSelectElement;
          const selection = sourceSelection.select(plan, Number(select.value));
          select.disabled = true;
          if (okButton !== null) okButton.disabled = !sourceSelection.canConfirm;
          const outcome = await selection;
          if (outcome.kind !== 'selected') select.value = String(outcome.previousIndex);
          select.disabled = !sourceSelection.canSelect;
          if (okButton !== null) okButton.disabled = !sourceSelection.canConfirm;
          renderSummary();
          if (shouldRebuildImportLinks(outcome)) renderLinkSection();
        },
      }) as HTMLSelectElement;
      plan.sources.forEach((s, i) => {
        const label = `${s.fileName}（キャプション${s.captionCount}件${s.looksLikeBackup ? '・バックアップ？' : ''}）`;
        sourceSelect.append(el('option', { value: String(i) }, label));
      });
      sourceSelect.value = String(plan.selectedSourceIndex);
      sourceSection.append(
        el('div', { class: 'lv-hint' }, '使用するスプレッドシート'),
        sourceSelect,
        el('div', { class: 'lv-dim' },
          '複数見つかりました。1つだけを取り込みます（両方取り込むと同じキャプションが二重になります）'),
      );
    }

    // ---- 中身の要約 ----
    const summary = el('div', { class: 'lv-modal-body' });
    const line = (label: string, value: string): HTMLElement =>
      el('div', { class: 'lv-mr-row' }, el('span', { class: 'lv-mr-ico info' }, '·'), `${label}: ${value}`);

    function renderSummary(): void {
      clear(summary);
      const totalBytes =
        [...plan.models, ...plan.images, ...plan.videos].reduce((s, f) => s + f.data.length, 0);
      summary.append(
        line('モデル', plan.models.length > 0 ? plan.models.map((m) => m.name).join('、') : 'なし'),
        line('画像', `${plan.images.length}枚`),
      );
      if (plan.videos.length > 0) summary.append(line('映像', `${plan.videos.length}件`));
      summary.append(line('合計サイズ', fmtBytes(totalBytes)));

      if (plan.migration !== null) {
        summary.append(
          el('div', { class: 'lv-mr-row' },
            el('span', { class: 'lv-mr-ico ok' }, '✓'),
            'LociMyuのデータを検出しました',
          ),
          el('div', { class: 'lv-mr-detail' }, summarizeMigration(plan.migration)),
          el('div', { class: 'lv-mr-detail' }, 'キャプションシートは表示セットとして引き継がれます'),
        );
        if (options.directNative) {
          summary.append(
            el('div', { class: 'lv-mr-detail' }, '新しいNative LociView projectへ直接変換します。中間のv1 projectは作りません。'),
            el('div', { class: 'lv-mr-detail warn' },
              '元のLociMyu ZIPは別途保管してください。exactに確定できない画像・見え方・視点は自動推測せずconversion reportへ記録します。'),
          );
        } else {
          const retentionNotice = importWizardRetentionNotice(plan);
          if (retentionNotice !== null) {
            summary.append(el('div', { class: 'lv-mr-detail warn' }, retentionNotice));
          }
        }
        // マテリアル・ビューの割り当て（gidが推定の場合は明示する）
        if (plan.migration.gidToSetName.size > 0) {
          const assign = [...plan.migration.gidToSetName.values()].join('、');
          summary.append(
            el('div', { class: 'lv-mr-detail' },
              `見え方の設定（マテリアル・視点）の割り当て先: ${assign}` +
                (plan.migration.gidMappingIsGuess
                  ? '（一部はシートの並び順から推定しました。取込後にMaterialタブで確認してください）'
                  : ''),
            ),
          );
        }
      } else if (plan.blockedLociMyuSource !== null && plan.blockedLociMyuSource !== undefined) {
        const skipsMissingIdRows = options.directNative && plan.blockedLociMyuSource.code === 'missing-legacy-id';
        summary.append(
          el('div', { class: 'lv-mr-row' },
            el('span', { class: 'lv-mr-ico warn' }, '⚠'),
            skipsMissingIdRows
              ? 'Caption IDが空の行は空行として扱います'
              : 'LociMyuデータを検出しましたが、安全なCaption IDを作れない行があります',
          ),
          el('div', { class: 'lv-mr-detail warn' },
            skipsMissingIdRows
              ? '元のLociMyu ZIPは別途保管してください。その行からCaptionは作らずconversion reportへ記録します。元ZIPは変更せず、残りの有効なデータをNative projectへ変換します。'
              : '元のLociMyu ZIPは別途保管してください。「取り込み内容を確認」を押すとconversion reportを保存し、不完全なNative projectは作りません。'),
        );
      } else if (plan.tables.length > 0) {
        summary.append(
          el('div', { class: 'lv-mr-row' },
            el('span', { class: 'lv-mr-ico warn' }, '⚠'),
            'スプレッドシートはありますが、LociMyu形式ではありませんでした',
          ),
        );
      }
      const diagnostics = importWizardVisibleDiagnostics(plan);
      if (diagnostics.selection !== null) {
        summary.append(el('div', { class: 'lv-mr-detail warn' }, `⚠ ${diagnostics.selection}`));
      }
      for (const w of diagnostics.currentSource) {
        summary.append(el('div', { class: 'lv-mr-detail warn' }, `⚠ 現在のスプレッドシート: ${w}`));
      }
      if (diagnostics.omittedCurrentSource > 0) {
        summary.append(el('div', { class: 'lv-mr-detail warn' },
          `⚠ 現在のスプレッドシートに他${diagnostics.omittedCurrentSource}件の確認事項があります`));
      }
      for (const w of diagnostics.background) {
        summary.append(el('div', { class: 'lv-mr-detail warn' }, `⚠ ${w}`));
      }
      if (diagnostics.omittedBackground > 0) {
        summary.append(el('div', { class: 'lv-mr-detail warn' },
          `⚠ 使用しなかった候補など、他${diagnostics.omittedBackground}件の確認事項があります`));
      }
      if (sourceSelection.error !== null) {
        summary.append(el('div', { class: 'lv-mr-detail warn' }, `⚠ ${sourceSelection.error}`));
      }
    }
    renderSummary();

    // ---- 画像の手動リンク ----
    const linkSection = el('div', { class: 'lv-grp' });
    function renderLinkSection(): void {
      clear(linkSection);
      imageLinks.clear();
      if (options.directNative) return;
      const unlinked = plan.migration?.unlinkedImages ?? new Map<string, string[]>();
      // fileId対応表で解決できるものを除外
      const needLink = [...unlinked.entries()].filter(([fileId]) => !plan.fileIdMap.has(fileId));
      if (needLink.length === 0 || plan.images.length === 0) return;

      linkSection.append(
        el('div', { class: 'lv-hint' }, `画像の対応付け（${needLink.length}件）`),
        el('div', { class: 'lv-dim' },
          'LociMyuはGoogle Drive上のファイルIDで画像を参照していたため、オフラインでは自動対応できません。必要なものだけ選んでください（後からでも設定できます）。'),
      );
      for (const [fileId, captionIds] of needLink.slice(0, 30)) {
        const select = el('select', {}) as HTMLSelectElement;
        select.append(el('option', { value: '' }, '— 対応付けしない —'));
        for (const img of plan.images) select.append(el('option', { value: img.name }, img.name));
        select.addEventListener('change', () => {
          for (const capId of captionIds) {
            if (select.value === '') imageLinks.delete(capId);
            else imageLinks.set(capId, select.value);
          }
        });
        linkSection.append(
          el('div', { class: 'lv-row lv-space' },
            el('span', { class: 'lv-dim' }, `${fileId.slice(0, 14)}… （${captionIds.length}件のキャプション）`),
            select,
          ),
        );
      }
      if (needLink.length > 30) {
        linkSection.append(el('div', { class: 'lv-dim' }, `他 ${needLink.length - 30}件は取込後に設定できます`));
      }
    }
    renderLinkSection();

    // ---- 組み立て ----
    const cancel = el('button', {
      onclick: () => {
        backdrop.remove();
        resolve(null);
      },
    }, 'キャンセル');
    const ok = el('button', {
      class: 'primary',
      onclick: () => {
        if (!sourceSelection.canConfirm) return;
        backdrop.remove();
        resolve({
          projectName: nameInput.value.trim() !== '' ? nameInput.value.trim() : defaultName,
          imageLinks,
        });
      },
    }, options.directNative ? '取り込み内容を確認' : '取り込む') as HTMLButtonElement;
    okButton = ok;

    const card = el('div', { class: 'lv-modal-card', role: 'dialog', 'aria-label': 'インポート' },
      el('div', { class: 'lv-modal-title' }, options.directNative ? 'LociMyu ZIPをNative projectへ変換' : 'ZIPの取り込み'),
      el('div', { class: 'lv-grp' },
        el('div', { class: 'lv-hint' }, 'プロジェクト名'),
        nameInput,
      ),
      sourceSection,
      summary,
      linkSection,
      el('div', { class: 'lv-modal-actions' }, cancel, ok),
    );
    backdrop.append(card);
    document.body.append(backdrop);
    nameInput.focus();
    nameInput.select();
  });
}

export { clear };
