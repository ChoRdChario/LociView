import type { NativeCollaborationConflictV1 } from './captionThreeWayMerge';

const UNSUPPORTED_STATE_GUIDANCE =
  '表示セット、視点、モデルの見え方など、共同編集の対象外にある保存状態が固定基準から変わっています。基準は自動更新していません。互換だった以前の完全バックアップがある場合だけ、それを別途復元してください。ない場合は現在を完全バックアップしたうえで、編集用コピーとして独立して渡してください（元プロジェクトへ共同編集として統合はできません）。';

export function nativeCollaborationOperationErrorMessageV1(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('unsupported Project state')) return UNSUPPORTED_STATE_GUIDANCE;
  if (message.includes('fixed baseline is missing') || message.includes('Project has no fixed baseline')) {
    return '共同編集の固定基準がないため書き出せません。プロジェクトは変更していません。完全なバックアップまたは編集用コピーを使用してください。';
  }
  if (message.includes('baseline lineage does not match')) {
    return '共同編集の固定基準が別のプロジェクトに属しています。自動修復していません。完全なバックアップを保存し、同じ元プロジェクトから作ったファイルか確認してください。';
  }
  if (message.includes('baseline ID does not match')) {
    return '共同編集の固定基準を検証できません。自動修復していません。この状態は共同編集に使わず、完全なバックアップを保存して内容を確認してください。';
  }
  if (message.includes('baseline media is missing or changed')) {
    return '共同編集の固定基準に含まれるメディアが不足または変更されています。自動置換していません。完全なバックアップを保存して内容を確認してください。';
  }
  return message;
}

export function nativeCollaborationConflictMessageV1(
  conflict: NativeCollaborationConflictV1,
): string {
  switch (conflict.code) {
    case 'lineage-mismatch':
      return '別の元プロジェクトから作られたファイルです。同じ共同編集用ファイルから編集した相手のファイルを選んでください。';
    case 'baseline-missing':
    case 'baseline-mismatch':
      return '共同編集の固定基準が一致しません。同じ共同編集用ファイルから編集した相手のファイルを選んでください。';
    case 'baseline-invalid':
      return '共同編集の固定基準を確認できません。完全なバックアップを保存し、元のプロジェクトと受け取ったファイルを確認してください。';
    case 'unsupported-state-difference':
      return UNSUPPORTED_STATE_GUIDANCE;
    case 'unsupported-caption-tags':
      return 'このファイルには現在取り込めないキャプション分類があります。自動変換や推測はしていません。';
    case 'caption-field-conflict':
      return '同じキャプションの同じ項目が双方で変更されています。勝者を自動選択していません。内容を確認して片方へ手動で反映してください。';
    case 'caption-delete-edit-conflict':
      return '一方で削除し、もう一方で編集した同じキャプションがあります。削除と編集のどちらを残すか確認してください。';
    case 'caption-id-conflict':
      return '同じ識別子を持つ別内容のキャプションがあります。自動統合していません。';
    case 'media-baseline-difference':
    case 'media-id-conflict':
      return '同じ識別子を持つメディアの内容が共同編集の基準と一致しません。自動置換していません。';
    case 'caption-media-unreferenced':
    case 'caption-media-missing':
      return 'キャプションとメディアの参照関係を確認できません。ファイル名から関係を推測していません。';
    case 'merged-snapshot-invalid':
      return '統合後の内容を安全なプロジェクトとして検証できなかったため、変更を反映していません。';
  }
}
