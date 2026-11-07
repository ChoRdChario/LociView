/** Presentation only. A friendly error never acknowledges a write or permits cleanup. */
export function storageFailureText(error:unknown):string|undefined {
  if((error instanceof Error || typeof DOMException!=='undefined'&&error instanceof DOMException)&&error.name==='QuotaExceededError')
    return '保存容量が不足しています。空き容量を増やしてから再試行してください。このサイトのデータを削除すると、再開用データも消えます。';
  if(error instanceof Error&&error.name==='MetadataSourceError'&&'code' in error&&error.code==='output-space-budget')
    return '保存・受け渡し用データが、この版の検査上限を超えています。端末の空き容量とは別の制限です。保存済みデータは保持しています。';
  return undefined;
}
