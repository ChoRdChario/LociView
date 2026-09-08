/** Native textarea displays CRLF/lone CR as LF; source/draft text must not be rewritten. */
export const textareaText = (text: string): string => text.replace(/\r\n?/g, '\n');
export interface TextareaEditRange { readonly start: number; readonly end: number; readonly inputType: string }
export type TextareaEditResult = Readonly<{ kind: 'mapped'; text: string }> |
  Readonly<{ kind: 'blocked'; text: string; reason: string }>;
const blocked = (text: string): TextareaEditResult => ({ kind: 'blocked', text,
  reason: '改行の編集範囲を確認できません。入力を控えてから取り消し、編集し直してください。' });

export function mapTextareaEdit(previousRaw: string, nextValue: string, range?: TextareaEditRange): TextareaEditResult {
  const before = textareaText(previousRaw), after = textareaText(nextValue);
  if (before === after) return { kind: 'mapped', text: previousRaw };
  const splice = (start: number, end: number): TextareaEditResult | null => {
    const insertedLength = after.length - (before.length - (end - start));
    if (start < 0 || end < start || end > before.length || insertedLength < 0 ||
      after.slice(0, start) !== before.slice(0, start) || after.slice(start + insertedLength) !== before.slice(end)) return null;
    const rawOffset = (offset: number) => {
      let raw = 0;
      for (let display = 0; display < offset; display++, raw++) if (previousRaw[raw] === '\r' && previousRaw[raw + 1] === '\n') raw++;
      return raw;
    };
    return { kind: 'mapped', text: previousRaw.slice(0, rawOffset(start)) + after.slice(start, start + insertedLength) + previousRaw.slice(rawOffset(end)) };
  };
  if (range && typeof range.inputType === 'string' && [range.start, range.end].every(Number.isSafeInteger)) {
    let { start, end } = range;
    const removed = before.length - after.length;
    if (start === end && removed > 0) {
      if (/^delete.*Backward$/.test(range.inputType)) start -= removed;
      else if (/^delete.*Forward$/.test(range.inputType)) end += removed;
    }
    if (range.inputType.startsWith('insert') || range.inputType.startsWith('delete')) {
      const exact = splice(start, end); if (exact) return exact;
    }
  }
  // Without a verified native edit range, only non-newline edits are unambiguous.
  // In particular, repeated visually identical newlines cannot identify which
  // CR/CRLF token was deleted. Never invent its survivor or normalize the source.
  let start = 0, end = before.length, afterEnd = after.length;
  while (start < end && start < afterEnd && before[start] === after[start]) start++;
  while (end > start && afterEnd > start && before[end - 1] === after[afterEnd - 1]) { end--; afterEnd--; }
  if (previousRaw.includes('\r') && (before.slice(start, end).includes('\n') || after.slice(start, afterEnd).includes('\n')))
    return blocked(nextValue);
  return splice(start, end) ?? blocked(nextValue);
}
