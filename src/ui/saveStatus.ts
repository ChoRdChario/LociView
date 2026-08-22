import type { DurableWriteStatus } from '../core/store';

export interface SaveStatusPresentation {
  readonly compactText: string;
  readonly detailText: string;
  readonly canRetry: boolean;
}

export type PackageKind = 'full' | 'diff';

export type PackageExportStatus =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'generating'; kind: PackageKind; coveredOpCount: number }>
  | Readonly<{ phase: 'generated'; kind: PackageKind; bytes: number; coveredOpCount: number }>
  | Readonly<{ phase: 'download-started'; kind: PackageKind; bytes: number; coveredOpCount: number }>
  | Readonly<{ phase: 'failed'; kind: PackageKind; coveredOpCount: number }>;

/** Device/session durability and package-download freshness are independent axes. */
export function describeSaveStatus(
  status: DurableWriteStatus,
  unexportedChanges: number,
  persistentWorkspace: boolean,
  packageStatus: PackageExportStatus,
): SaveStatusPresentation {
  const changeText = unexportedChanges > 0
    ? `未ダウンロードの変更 ${unexportedChanges}件`
    : 'ダウンロード待ちの変更なし';
  const packageText = describePackageExportStatus(packageStatus);
  const suffix = `${changeText} ・ ${packageText}`;
  const packageCompact = describeCompactPackageStatus(packageStatus);
  const changeCompact = unexportedChanges > 0 ? `未DL ${unexportedChanges}` : null;

  if (status.phase === 'failed') {
    const workspace = persistentWorkspace ? '端末保存失敗' : 'タブ保持失敗';
    return {
      compactText: [`⚠ ${workspace}`, changeCompact, packageCompact].filter(Boolean).join(' ・ '),
      detailText: `${persistentWorkspace ? '端末ワークスペースへの保存' : 'このタブ内での一時保持'}に失敗 ・ ${status.retryable ? '再試行できます' : '復旧が必要です'} ・ ${suffix}`,
      canRetry: status.retryable,
    };
  }
  if (status.phase === 'queued') {
    return {
      compactText: [persistentWorkspace ? '端末保存待ち' : 'タブ保持待ち', changeCompact, packageCompact].filter(Boolean).join(' ・ '),
      detailText: `${persistentWorkspace ? '端末ワークスペースへの保存待ち' : 'このタブ内での一時保持待ち'} ・ ${suffix}`,
      canRetry: false,
    };
  }
  if (status.phase === 'writing') {
    return {
      compactText: [persistentWorkspace ? '端末保存中…' : 'タブ保持中…', changeCompact, packageCompact].filter(Boolean).join(' ・ '),
      detailText: `${persistentWorkspace ? '端末ワークスペースへ書き込み中' : 'このタブ内へ一時保持中'} ・ ${suffix}`,
      canRetry: false,
    };
  }
  return {
    compactText: [persistentWorkspace ? '✓ 端末書込完了' : 'タブ内のみ', changeCompact, packageCompact].filter(Boolean).join(' ・ '),
    detailText: `${persistentWorkspace ? '端末ワークスペースへの書き込み完了' : 'このタブ内に一時保持（端末未保存）'} ・ ${suffix}`,
    canRetry: false,
  };
}

function describeCompactPackageStatus(status: PackageExportStatus): string {
  if (status.phase === 'idle') return 'ZIP未生成';
  if (status.phase === 'generating') return 'ZIP生成中';
  if (status.phase === 'generated') return 'ZIP生成済';
  if (status.phase === 'download-started') return 'DL開始済';
  return 'ZIP生成失敗';
}

export function describePackageExportStatus(status: PackageExportStatus): string {
  if (status.phase === 'idle') return 'パッケージ: 未生成';
  const label = status.kind === 'full' ? 'フル' : '差分';
  if (status.phase === 'generating') return `パッケージ: ${label}生成中…`;
  if (status.phase === 'generated') return `パッケージ: ${label}生成済み（ダウンロード未開始）`;
  if (status.phase === 'download-started') {
    return `パッケージ: ${label}ダウンロード開始（完了未確認）`;
  }
  return `パッケージ: ${label}生成失敗`;
}
