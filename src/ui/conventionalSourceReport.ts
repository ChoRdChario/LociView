export interface ConventionalSourceIssue {
  readonly path: string;
  readonly line: number;
  readonly reason: string;
}

function fileLabel(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || '不明なファイル';
}

function reasonLabel(reason: string): string {
  if (reason === 'divergent operation identity') return '同じ記録番号に異なる内容があります';
  if (reason === 'operation actor/path mismatch') return '記録の保存先と識別情報が一致しません';
  if (reason === 'schema violation') return '記録の形式が正しくありません';
  if (reason === 'line too long') return '1行の長さが上限を超えています';
  if (reason === 'too many lines') return '記録件数が上限を超えています';
  if (/duplicate/iu.test(reason)) return '同じ項目名が重複しています';
  return '安全な形式として読み取れません';
}

export function serializeConventionalSourceReport(
  issues: readonly ConventionalSourceIssue[],
): string {
  return JSON.stringify({
    format: 'lociview-conventional-source-report-1',
    result: '閲覧への反映なし／変換不可',
    issues: issues.map(({ path, line, reason }) => ({
      file: fileLabel(path),
      line,
      reason: reasonLabel(reason),
    })),
  }, null, 2);
}
