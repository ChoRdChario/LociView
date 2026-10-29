export const EDITOR_CAPABILITY = 'editor-attribution-v1' as const;
export const PORTABLE_MEDIA_CAPABILITY = 'portable-heic-display-v1' as const;
const known = [EDITOR_CAPABILITY, PORTABLE_MEDIA_CAPABILITY] as const;
export type ReaderCapability = typeof known[number];
export type ReaderCapabilities = readonly ReaderCapability[];
export class RequiredCapabilityError extends Error {
  constructor(readonly code: 'invalid-capability' | 'unsupported-capability' | 'capability-mismatch') {
    super(code === 'unsupported-capability' ? 'このファイルが必要とする機能に対応したLociViewで開いてください。元データは保持しています。' :
      code === 'capability-mismatch' ? '対応機能と保存記録が一致しません。元ファイルを選び直してください。元データは保持しています。' :
      'ファイルの対応機能の記録を確認できません。元ファイルを選び直してください。元データは保持しています。');
    this.name = 'RequiredCapabilityError';
  }
}
export function readRequiredCapabilities(value: unknown): ReaderCapabilities {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || !value.length || value.length > known.length || value.some(v => typeof v !== 'string'))
    throw new RequiredCapabilityError('invalid-capability');
  for (const capability of value) if (!(known as readonly string[]).includes(capability)) throw new RequiredCapabilityError('unsupported-capability');
  if (value.some((v, i) => i > 0 && value[i - 1]! >= v)) throw new RequiredCapabilityError('invalid-capability');
  return Object.freeze([...value]) as ReaderCapabilities;
}
export const capabilityUnion = (...groups: readonly (ReaderCapabilities | undefined)[]): ReaderCapabilities =>
  Object.freeze([...new Set(groups.flatMap(g => g ?? []))].sort());
export function capabilityFields(values: ReaderCapabilities): { readonly requiredCapabilities?: ReaderCapabilities } {
  const required = capabilityUnion(values);
  return required.length ? { requiredCapabilities: required } : {};
}
export const requiresCapability = (value: unknown, capability: ReaderCapability): boolean => readRequiredCapabilities(value).includes(capability);
export const hasEditorCapability = (value: unknown): boolean => requiresCapability(value, EDITOR_CAPABILITY);
export const hasPortableMediaCapability = (value: unknown): boolean => requiresCapability(value, PORTABLE_MEDIA_CAPABILITY);
export function checkRequiredCapabilities(value: unknown, expected: ReaderCapabilities): void {
  if (readRequiredCapabilities(value).join('|') !== capabilityUnion(expected).join('|')) throw new RequiredCapabilityError('capability-mismatch');
}
