import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE,
  buildImportPlan,
} from '../../src/assets/importWizard';
import { LOCIMYU_SOURCE_RETENTION_NOTICE } from '../../src/io/locimyu';
import {
  importWizardRetentionNotice,
  importWizardVisibleDiagnostics,
  lociMyuHeicDeviceConversionNotice,
  shouldRebuildImportLinks,
} from '../../src/ui/importDialog';
import { ImportSourceSelectionController } from '../../src/ui/importSourceSelection';
import { packageExportCompletionMessage } from '../../src/ui/tabs/data';

const CAP_HEADER = [
  'id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt',
];
const encoder = new TextEncoder();

function captionCsv(id: string, title: string): Uint8Array {
  return encoder.encode([
    CAP_HEADER.join(','),
    [id, title, '', '', '', '', '', '', '', ''].join(','),
  ].join('\n'));
}

async function twoSourcePlan(options: { invalidBackup?: boolean } = {}) {
  return buildImportPlan([
    { path: 'main.csv', data: captionCsv('c_main', '現行') },
    {
      path: 'backup.csv',
      data: captionCsv(options.invalidBackup === true ? '' : 'c_backup', '旧版'),
    },
  ]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ImportSourceSelectionController', () => {
  it('source確認中は確定不可にし、完了後だけ選択を反映する', async () => {
    const plan = await twoSourcePlan();
    const backupIndex = plan.sources.findIndex((source) => source.looksLikeBackup);
    const controller = new ImportSourceSelectionController();
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      await gate;
      return realDigest(algorithm, data);
    });

    let settled = false;
    const pending = controller.select(plan, backupIndex).finally(() => { settled = true; });
    expect(controller.pending).toBe(true);
    expect(controller.canConfirm).toBe(false);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(plan.sources[plan.selectedSourceIndex]!.fileName).toBe('main.csv');

    resume();
    const outcome = await pending;
    expect(outcome).toEqual({ kind: 'selected' });
    expect(controller.pending).toBe(false);
    expect(controller.canConfirm).toBe(true);
    expect(plan.sources[plan.selectedSourceIndex]!.fileName).toBe('backup.csv');
    expect(shouldRebuildImportLinks(outcome)).toBe(true);
  });

  it('source入力不正では以前のpreview・warning・手動画像リンクを保つ', async () => {
    const plan = await twoSourcePlan({ invalidBackup: true });
    const backupIndex = plan.sources.findIndex((source) => source.looksLikeBackup);
    const controller = new ImportSourceSelectionController();
    const selectedIndex = plan.selectedSourceIndex;
    const selectedTables = plan.tables;
    const selectedMigration = plan.migration;
    const warnings = plan.warnings;
    const imageLinks = new Map([['cap_existing', 'photo.png']]);

    const outcome = await controller.select(plan, backupIndex);
    if (shouldRebuildImportLinks(outcome)) imageLinks.clear();

    expect(outcome.kind).toBe('rejected');
    expect(controller.error).toContain('LOCIMYU_ID_MISSING_LEGACY_ID:2');
    expect(controller.canConfirm).toBe(true);
    expect(plan.selectedSourceIndex).toBe(selectedIndex);
    expect(plan.tables).toBe(selectedTables);
    expect(plan.migration).toBe(selectedMigration);
    expect(plan.warnings).toBe(warnings);
    expect(imageLinks).toEqual(new Map([['cap_existing', 'photo.png']]));
  });

  it('provider/unknown失敗は詳細を出さず、wizard再構築まで確定と再選択を止める', async () => {
    const plan = await twoSourcePlan();
    const backupIndex = plan.sources.findIndex((source) => source.looksLikeBackup);
    const controller = new ImportSourceSelectionController();
    const selectedIndex = plan.selectedSourceIndex;
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('sensitive provider detail'));

    const outcome = await controller.select(plan, backupIndex);

    expect(outcome).toEqual({
      kind: 'fatal',
      previousIndex: selectedIndex,
      message: IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE,
    });
    if (outcome.kind !== 'fatal') throw new Error('expected fatal source selection');
    expect(outcome.message).not.toContain('sensitive provider detail');
    expect(controller.fatal).toBe(true);
    expect(controller.canConfirm).toBe(false);
    expect(controller.canSelect).toBe(false);
    expect(plan.selectedSourceIndex).toBe(selectedIndex);
    expect(shouldRebuildImportLinks(outcome)).toBe(false);
    await expect(controller.select(plan, backupIndex)).resolves.toEqual(outcome);
  });
});

describe('import wizard diagnostics', () => {
  it('多数の拒否候補があっても現在選択noticeと現在候補warningを独立表示する', async () => {
    const rejected = Array.from({ length: 6 }, (_unused, index) => ({
      path: `invalid-${index}.csv`,
      data: captionCsv('', `不正${index}`),
    }));
    const coordinateWarning = encoder.encode([
      CAP_HEADER.join(','),
      ['c_valid', '現行', '', '', 'not-a-number', '1', '2', '', '', ''].join(','),
    ].join('\n'));
    const plan = await buildImportPlan([
      ...rejected,
      { path: 'valid.csv', data: coordinateWarning },
    ]);

    const visible = importWizardVisibleDiagnostics(plan);
    expect(plan.diagnostics.rejectedCandidates).toHaveLength(6);
    expect(visible.selection).toContain('「valid.csv」を使用します');
    expect(visible.currentSource.some((warning) => warning.includes('座標が数値ではありません'))).toBe(true);
    expect(visible.background).toHaveLength(5);
    expect(visible.omittedBackground).toBe(1);
  });
});

describe('LociMyu source-retention notices', () => {
  it('import確認とfull export完了経路が同じ保持注意を表示する', async () => {
    const plan = await buildImportPlan([
      { path: 'main.csv', data: captionCsv('c_main', '現行') },
    ]);

    expect(importWizardRetentionNotice(plan)).toContain(LOCIMYU_SOURCE_RETENTION_NOTICE);
    expect(importWizardRetentionNotice({ migration: null })).toBeNull();
    expect(packageExportCompletionMessage('full', 1024)).toContain(LOCIMYU_SOURCE_RETENTION_NOTICE);
    expect(packageExportCompletionMessage('diff', 1024)).not.toContain(LOCIMYU_SOURCE_RETENTION_NOTICE);
  });

  it('HEIC inventoryを非添付・元ZIP保持・手動JPEG追加として案内する', async () => {
    const heic = new Uint8Array([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
      0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
    ]);
    const plan = await buildImportPlan([
      { path: 'main.csv', data: captionCsv('c_main', '現行') },
      { path: 'images/photo.heic', data: heic },
    ]);

    const notice = lociMyuHeicDeviceConversionNotice(plan);
    expect(notice).toContain('添付せず説明ファイルへ記録');
    expect(notice).toContain('元ZIPを保管');
    expect(notice).toContain('別のJPEG');
    expect(notice).toContain('表示セット名とキャプション名が示された画像だけ');
    expect(notice).toContain('対応先を確認できない画像は自動で関連付けません');
  });
});
