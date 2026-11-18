/** Presentation only. A friendly error never acknowledges a write or permits cleanup. */
export function storageFailureText(error:unknown):string|undefined {
  if((error instanceof Error || typeof DOMException!=='undefined'&&error instanceof DOMException)&&error.name==='QuotaExceededError')
    return '保存容量が不足しています。空き容量を増やしてから再試行してください。このサイトのデータを削除すると、再開用データも消えます。';
  if(error instanceof Error&&error.name==='MetadataSourceError'&&'code' in error&&error.code==='output-space-budget')
    return '保存・受け渡し用データが、この版の検査上限を超えています。端末の空き容量とは別の制限です。保存済みデータは保持しています。';
  return undefined;
}

/** Explains a refusal; it neither repairs nor authorizes overwriting stored data. */
export function metadataFailureText(message: string | undefined): string | undefined {
  if (message?.startsWith('Metadata source invalid (closed-local-'))
    return '再開に必要な情報を確認できません。中断記録は削除していません。';
  if (message === 'Metadata source invalid (incomplete-staging-repair)')
    return '中断した変更の情報が揃っていないため、再開できません。保存済みのデータは削除しないでください。';
  if (message === 'Metadata source invalid (receipt-invalid)' || message === 'Metadata source invalid (receipt-read)' ||
    message === 'Metadata source invalid (restore-destination-not-ready)')
    return '保存情報を確認できないため、処理を停止しました。このブラウザのデータは削除しないでください。';
  return undefined;
}
