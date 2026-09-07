import type { NativeExchangePurposeV1 } from './packageExchange';

export type NativeImportPurposeV1 = 'backup' | NativeExchangePurposeV1;

export interface NativeImportDisclosureV1 {
  readonly detected: string;
  readonly nextAction: string;
  readonly openingMode: string;
  readonly sourceTreatment: string;
  readonly confirmLabel: string;
  readonly action: 'restore' | 'open-existing';
}

export interface NativeImportInspectionIdentityV1 {
  readonly purpose: NativeImportPurposeV1;
  readonly projectId: string;
  readonly snapshotId: string;
  readonly generation: number;
  /** Normalized, validated manifest metadata including every content digest. */
  readonly manifestIdentity: string;
  readonly representationByteLength: number;
  readonly mediaByteLength: number;
}

export function nativeImportDisclosureV1(
  purpose: NativeImportPurposeV1,
  sameProjectExists: boolean,
): NativeImportDisclosureV1 {
  const sourceTreatment = '選択したファイルは変更しません。';
  if (purpose === 'backup') {
    return {
      detected: 'LociViewの完全バックアップ',
      nextAction: 'この端末へ同じプロジェクトを復元します。',
      openingMode: '復元後は、この端末のプロジェクト一覧へ戻ります。',
      sourceTreatment,
      confirmLabel: 'この端末に復元',
      action: 'restore',
    };
  }
  if (purpose === 'collaboration' && sameProjectExists) {
    return {
      detected: 'LociViewの共同編集用ファイル',
      nextAction: '同じプロジェクトがこの端末にあります。この画面では復元せず、既存プロジェクトで変更を取り込みます。',
      openingMode: '対象プロジェクトを編集で開きます。開いた後、「共同編集の変更を受け取る」を選びます。',
      sourceTreatment,
      confirmLabel: '対象プロジェクトを編集して開く',
      action: 'open-existing',
    };
  }
  if (purpose === 'collaboration') {
    return {
      detected: 'LociViewの共同編集用ファイル',
      nextAction: 'この端末へ作業用のプロジェクトとして復元します。',
      openingMode: '復元後、編集で開きます。',
      sourceTreatment,
      confirmLabel: '復元して編集',
      action: 'restore',
    };
  }
  if (purpose === 'review') {
    return {
      detected: 'LociViewの閲覧共有用ファイル',
      nextAction: '選ばれた表示内容を、この端末へ独立したプロジェクトとして復元します。',
      openingMode: '最初は閲覧のみで開きます。元のプロジェクトへ変更を統合するファイルではありません。',
      sourceTreatment,
      confirmLabel: '復元して閲覧',
      action: 'restore',
    };
  }
  return {
    detected: 'LociViewの編集用コピー',
    nextAction: '元とは別のプロジェクトとして、この端末へ復元します。',
    openingMode: '復元後、編集で開きます。元のプロジェクトへ変更を統合するファイルではありません。',
    sourceTreatment,
    confirmLabel: '別のプロジェクトとして編集',
    action: 'restore',
  };
}

export function sameNativeImportInspectionV1(
  left: NativeImportInspectionIdentityV1,
  right: NativeImportInspectionIdentityV1,
): boolean {
  return left.purpose === right.purpose &&
    left.projectId === right.projectId &&
    left.snapshotId === right.snapshotId &&
    left.generation === right.generation &&
    left.manifestIdentity === right.manifestIdentity &&
    left.representationByteLength === right.representationByteLength &&
    left.mediaByteLength === right.mediaByteLength;
}
