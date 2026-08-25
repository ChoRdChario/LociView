// データタブ — 入出力の集約（コンセンサスQ2: 閲覧/編集と入出力の機能群分離）
// 取込/マージ・書き出し（フルZIP/差分ZIP/CSV）・CSV取込・モデル追加

import { exportOpsOnlyZip, exportProjectZip, inspectZip, mergeFromInspection } from '../../assets/package';
import { addModelAsset } from '../../assets/modelAsset';
import { detectFormat } from '../../viewer/loaders';
import { applyCsvPlan, buildCaptionsCsv, planCaptionsCsvImport } from '../../io/csv';
import { LOCIMYU_SOURCE_RETENTION_NOTICE } from '../../io/locimyu';
import { el, downloadBlob, fmtBytes } from '../dom';
import type { AppContext } from '../context';
import { csvPlanDialog, infoDialog, mergeReportDialog } from '../dialogs';
import { generateAndStartPackageDownload } from '../packageExport';
import type { PackageExportStatus } from '../saveStatus';

export interface DataTabDeps {
  loadModelAsset: (assetId: string) => Promise<void>;
  setPackageExportStatus: (status: PackageExportStatus) => void;
}

export function packageExportCompletionMessage(
  kind: 'full' | 'diff',
  byteLength: number,
): string {
  return `${fmtBytes(byteLength)} のダウンロードを開始しました（ブラウザでの保存完了は未確認です）。${kind === 'diff'
    ? '（opsのみの軽量差分。相手がモデル・画像を持っている場合の受け渡し用）'
    : `LociMyuから取り込んだプロジェクトの場合: ${LOCIMYU_SOURCE_RETENTION_NOTICE}`}`;
}

export function mountDataTab(container: HTMLElement, ctx: AppContext, deps: DataTabDeps): () => void {
  // ---- 取込 / マージ ---------------------------------------------------------

  const zipInput = el('input', { type: 'file', accept: '.zip,.lociview', style: 'display:none' }) as HTMLInputElement;
  zipInput.addEventListener('change', () => {
    const file = zipInput.files?.[0];
    if (file !== undefined) void importZipFile(file);
    zipInput.value = '';
  });

  async function importZipFile(file: File): Promise<void> {
    try {
      const insp = await inspectZip(new Uint8Array(await file.arrayBuffer()));
      if (insp.kind !== 'lociview' || insp.manifest === null) {
        await infoDialog(
          '取込',
          'LociViewプロジェクトではありません。Drive のフォルダZIP等を新規プロジェクトとして取り込むには、ホーム画面（左上の☰）から投入してください。',
        );
        return;
      }
      if (insp.manifest.projectId !== ctx.store.manifest.projectId) {
        await infoDialog('取込', `別プロジェクト「${insp.manifest.name}」のZIPです。ホーム画面から開いてください。`);
        return;
      }
      const report = await mergeFromInspection(ctx.fs, ctx.dir, ctx.store, insp);
      if (insp.opsErrorCount > 0) {
        await infoDialog('警告', `破損していた ${insp.opsErrorCount} 行をスキップしました`);
      }
      await mergeReportDialog(
        report,
        file.name,
        (uid) => ctx.displayName(uid),
        (kind, id, field, loserHlc) => {
          // 「自分の値に戻す」— 敗れたopの値を探して通常編集として積む（履歴は消えない）
          const op = ctx.store.allOps.find((o) => o.hlc === loserHlc && o.id === id);
          const value = op?.v?.[field];
          if (value !== undefined) ctx.undo.update(kind, id, { [field]: value });
        },
      );
      ctx.notify();
    } catch (e) {
      await infoDialog('取込失敗', e instanceof Error ? e.message : String(e));
    }
  }

  // ---- CSV取込 ---------------------------------------------------------------

  const csvInput = el('input', { type: 'file', accept: '.csv', style: 'display:none' }) as HTMLInputElement;
  csvInput.addEventListener('change', () => {
    const file = csvInput.files?.[0];
    if (file !== undefined) void importCsvFile(file);
    csvInput.value = '';
  });

  async function importCsvFile(file: File): Promise<void> {
    const text = await file.text();
    const plan = planCaptionsCsvImport(text, ctx.state);
    const { apply, applyDeletes } = await csvPlanDialog(plan);
    if (!apply) return;
    ctx.undo.transaction((tx) => {
      applyCsvPlan(ctx.store, plan);
      if (applyDeletes) {
        for (const id of plan.deleteCandidates) tx.delete('caption', id);
      }
    });
    ctx.notify();
  }

  // ---- モデル追加 -------------------------------------------------------------

  const modelInput = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply', style: 'display:none' }) as HTMLInputElement;
  modelInput.addEventListener('change', () => {
    const file = modelInput.files?.[0];
    if (file !== undefined) void addModelFile(file);
    modelInput.value = '';
  });

  async function addModelFile(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (detectFormat(file.name, bytes) === null) {
      await infoDialog('モデル追加', `対応していない形式です: ${file.name}（GLB/OBJ/STL/PLY）`);
      return;
    }
    // 原本保存 + GLBは軽量版も生成（iOSメモリ対策）
    const astId = await addModelAsset(ctx.fs, ctx.dir, ctx.store, file.name, bytes);
    await deps.loadModelAsset(astId);
  }

  // ---- 書き出し ---------------------------------------------------------------

  async function doExport(kind: 'full' | 'diff' | 'csv'): Promise<void> {
    const name = ctx.store.manifest.name;
    if (kind === 'csv') {
      downloadBlob(buildCaptionsCsv(ctx.state), `${name}-captions.csv`, 'text/csv');
      return;
    }
    try {
      const { bytes } = await generateAndStartPackageDownload(
        kind,
        ctx.store.allOps.length,
        () => kind === 'full'
          ? exportProjectZip(ctx.fs, ctx.dir, ctx.store)
          : exportOpsOnlyZip(ctx.fs, ctx.dir, ctx.store),
        (data) => downloadBlob(
          data,
          `${name}${kind === 'diff' ? '-diff' : ''}.lociview`,
          'application/zip',
        ),
        deps.setPackageExportStatus,
      );
      await infoDialog(
        'ダウンロード開始',
        packageExportCompletionMessage(kind, bytes.length),
      );
    } catch (error) {
      await infoDialog('書き出し失敗', error instanceof Error ? error.message : String(error));
    }
  }

  // ---- 画面 -------------------------------------------------------------------

  container.append(
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, '取込'),
      el('div', { class: 'lv-row' },
        el('button', { class: 'primary', onclick: () => zipInput.click() }, 'ZIP取込 / マージ'),
        el('button', { onclick: () => csvInput.click() }, 'CSV取込'),
      ),
      el('div', { class: 'lv-dim' }, '同一プロジェクトのZIPは自動でマージされ、結果レポートが表示されます。CSVはスプレッドシート編集の反映用（変更はあなたの編集として記録されます）。'),
    ),
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, '書き出し'),
      el('div', { class: 'lv-row' },
        el('button', { class: 'primary', onclick: () => void doExport('full') }, 'フルZIP'),
        el('button', { onclick: () => void doExport('diff') }, '差分ZIP（軽量）'),
        el('button', { onclick: () => void doExport('csv') }, 'CSV'),
      ),
      el('div', { class: 'lv-dim' }, 'フルZIPにはモデル・画像・閲覧用captions.csvが同梱されます。ビューPNG・閲覧用HTML書き出しはPhase 2/3で追加予定。'),
    ),
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, 'モデル追加'),
      el('div', { class: 'lv-row' },
        el('button', { onclick: () => modelInput.click() }, 'モデルファイルを追加（GLB/OBJ/STL/PLY）'),
      ),
    ),
    el('div', { class: 'lv-grp' },
      el('div', { class: 'lv-hint' }, 'プロジェクト情報'),
      el('div', { class: 'lv-dim' },
        `名称: ${ctx.store.manifest.name} / ID: ${ctx.store.manifest.projectId.slice(0, 20)}… / 作成: ${ctx.store.manifest.createdAt.slice(0, 10)}`),
    ),
    zipInput, csvInput, modelInput,
  );

  return () => {};
}
