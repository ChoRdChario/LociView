import { scalarLength, singleLineControls, reject } from './values';

/** Local authoring only. Stored/source text is never normalized by this helper. */
export function normalizeCaptionText(field: 'title' | 'body', input: string): string {
  scalarLength(input, Number.MAX_SAFE_INTEGER, [field]);
  const normalized = input.normalize('NFC');
  scalarLength(normalized, field === 'title' ? 512 : 65_536, [field]);
  const controls = field === 'title' ? singleLineControls : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u;
  if (controls.test(normalized)) reject('value', [field]);
  // Empty title/body are valid. TAB/LF/CR in body retain their exact sequence.
  return normalized;
}
