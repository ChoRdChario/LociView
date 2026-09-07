import type { NativeExportPurposeV1 } from './exportHandoff';

export function newNativeExportAttemptTokenV1(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/** One retained fallback result owns one exact path, even across browser windows. */
export function nativeExportStagePathV1(
  projectId: string,
  snapshotId: string,
  purpose: NativeExportPurposeV1,
  attemptToken: string,
): string {
  if (!/^[a-z0-9_]+$/iu.test(projectId) || !/^[a-z0-9_]+$/iu.test(snapshotId)) {
    throw new Error('書き出し対象の識別子が不正です。');
  }
  if (!/^[0-9a-f]{32}$/u.test(attemptToken)) throw new Error('書き出し試行の識別子が不正です。');
  return `native-backup-staging/${projectId}/${snapshotId}-${purpose}-${attemptToken}.lociview`;
}
