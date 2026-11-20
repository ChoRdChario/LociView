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

/** Copy only: neither retry eligibility nor the underlying failure is changed. */
export function failurePresentation(error: unknown, fallback: string): Readonly<{ message: string; diagnostic?: string }> {
  const raw = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  const known = storageFailureText(error) ?? metadataFailureText(raw);
  const technical = /THREE\.|WebGLRenderer|Error creating WebGL|(?:TypeError|RangeError|ReferenceError|DOMException):|Metadata source invalid|Failed to (?:fetch|execute)/u.test(raw);
  const message = known ?? (!technical && /[\u3040-\u30ff\u3400-\u9fff]/u.test(raw) ? raw : fallback);
  const causes = error instanceof AggregateError ? error.errors.map(value => value instanceof Error ? value.message : String(value)).join('\n') : '';
  const diagnostic = [raw !== message ? raw : '', causes].filter(Boolean).join('\n');
  return diagnostic ? { message, diagnostic } : { message };
}

/** Closed by default; updating a message does not move focus or discard its details. */
export function createFailureDetails(document: Document) {
  const root = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('pre');
  summary.textContent = '詳細'; root.className = 'lv-failure-details'; root.hidden = true; root.append(summary, text);
  return { root, render(diagnostic: string | undefined) {
    root.hidden = !diagnostic;
    if (text.textContent !== (diagnostic ?? '')) text.textContent = diagnostic ?? '';
  } };
}
