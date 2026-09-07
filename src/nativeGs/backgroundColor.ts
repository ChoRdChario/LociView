import type { NativeSolidBackgroundV1 } from './schema';

export const NATIVE_STANDARD_BACKGROUND_HEX = '#101725' as const;

export function normalizeNativeBackgroundHex(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(normalized) ? normalized : null;
}

export function nativeBackgroundFromHex(value: string): NativeSolidBackgroundV1 {
  const hex = normalizeNativeBackgroundHex(value);
  if (hex === null) throw new Error('背景色は # と6桁の16進数で入力してください。');
  return {
    kind: 'solid',
    colorSrgb: [
      Number.parseInt(hex.slice(1, 3), 16) / 255,
      Number.parseInt(hex.slice(3, 5), 16) / 255,
      Number.parseInt(hex.slice(5, 7), 16) / 255,
    ],
  };
}

export function nativeBackgroundHex(background: NativeSolidBackgroundV1): string {
  return `#${background.colorSrgb.map((component) => (
    Math.round(Math.max(0, Math.min(component, 1)) * 255).toString(16).padStart(2, '0')
  )).join('')}`;
}
