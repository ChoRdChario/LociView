import { parseJsonWithoutDuplicateMembers } from '../core/json';
import { canonical } from '../domain/projectGraphSupport';
import { scalarLength, type ValueLimits } from '../domain/values';

/** Self-declared change annotation, never a person/actor identity. Specification08b. */
export type LocalEditorContext = Readonly<{ kind: 'none' }> | Readonly<{ kind: 'self-declared'; name: string }>;
export interface EditorDeclaration { readonly transactionId: string; readonly editor: Readonly<{ kind: 'self-declared'; name: string }> }
export const EDITOR_CAPABILITY = 'editor-attribution-v1' as const;
export type EditorCapabilities = readonly [typeof EDITOR_CAPABILITY];
const prefix = 'lociview:transaction:v2:';
export class EditorAttributionError extends Error {
  constructor(readonly code: 'invalid-declaration' | 'invalid-capability' | 'unsupported-capability' | 'capability-mismatch') {
    super(code === 'unsupported-capability' ? 'このファイルが必要とする機能に対応したLociViewで開いてください。元データは保持しています。' :
      code === 'capability-mismatch' ? '編集者情報と保存記録が一致しません。元ファイルを選び直すか、作成元の端末で確認してください。元データは保持しています。' :
      code === 'invalid-capability' ? 'ファイルの対応機能の記録を確認できません。元ファイルを選び直してください。元データは保持しています。' :
      '編集者情報を確認できません。名前の設定を確認するか、元ファイルを選び直してください。元データは保持しています。');
    this.name = 'EditorAttributionError';
  }
}
const invalid = (): never => { throw new EditorAttributionError('invalid-declaration'); };
const shape = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).sort().join(',') !== keys.sort().join(',')) return invalid();
  return value as Record<string, unknown>;
};
export function editorName(value: unknown, limits?: Pick<ValueLimits, 'maxStringScalars'>): string {
  if (typeof value !== 'string' || !value.length || value.length > 256 || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) return invalid();
  try { scalarLength(value, Math.min(256, limits?.maxStringScalars ?? 256), ['editorName']); } catch { return invalid(); }
  return value;
}
export function captureEditor(input: LocalEditorContext = { kind: 'none' }): LocalEditorContext {
  if (input.kind === 'none') { shape(input, ['kind']); return Object.freeze({ kind: 'none' }); }
  const record = shape(input, ['kind', 'name']);
  if (record.kind !== 'self-declared') return invalid();
  return Object.freeze({ kind: 'self-declared', name: editorName(record.name) });
}
export function editorMessage(transactionId: string, context?: LocalEditorContext): string {
  if (!/^[0-9a-f]{32}$/.test(transactionId)) return invalid();
  const captured = captureEditor(context);
  return captured.kind === 'none' ? `lociview:transaction:v1:${transactionId}` : prefix +
    canonical({ editor: { kind: 'self-declared', name: captured.name }, transactionId });
}
export function inspectEditorMessage(message: string | null | undefined, limits: ValueLimits): EditorDeclaration | undefined {
  if (!message?.startsWith(prefix)) return undefined;
  try {
    const record = shape(parseJsonWithoutDuplicateMembers(message.slice(prefix.length), limits), ['editor', 'transactionId']);
    const editor = shape(record.editor, ['kind', 'name']);
    if (editor.kind !== 'self-declared' || typeof record.transactionId !== 'string' || !/^[0-9a-f]{32}$/.test(record.transactionId)) return invalid();
    const declaration = Object.freeze({ editor: Object.freeze({ kind: 'self-declared' as const, name: editorName(editor.name, limits) }), transactionId: record.transactionId });
    scalarLength(record.transactionId, limits.maxStringScalars, ['transactionId']);
    if (prefix + canonical(declaration) !== message) return invalid();
    return declaration;
  } catch (error) { if (error instanceof EditorAttributionError) throw error; return invalid(); }
}
export function localEditorMessageMatches(message: string | null | undefined, transactionId: string, limits: ValueLimits): boolean {
  return message === `lociview:transaction:v1:${transactionId}` || inspectEditorMessage(message, limits)?.transactionId === transactionId;
}
export const editorCapabilities = (required: boolean): { readonly requiredCapabilities?: EditorCapabilities } =>
  required ? { requiredCapabilities: Object.freeze([EDITOR_CAPABILITY]) } : {};
export function hasEditorCapability(value: unknown): boolean {
  if (value === undefined) return false;
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'string') throw new EditorAttributionError('invalid-capability');
  if (value[0] !== EDITOR_CAPABILITY) throw new EditorAttributionError('unsupported-capability');
  return true;
}
export function checkEditorCapability(value: unknown, required: boolean): void {
  if (hasEditorCapability(value) !== required) throw new EditorAttributionError('capability-mismatch');
}
