import { describe, expect, it } from 'vitest';
import {
  NATIVE_STANDARD_BACKGROUND_HEX,
  nativeBackgroundFromHex,
  nativeBackgroundHex,
  normalizeNativeBackgroundHex,
} from '../../src/nativeGs/backgroundColor';

describe('native 3D background color controls', () => {
  it('normalizes only complete six-digit sRGB input', () => {
    expect(normalizeNativeBackgroundHex(' #A0b1C2 ')).toBe('#a0b1c2');
    for (const value of ['', '#123', '101725', '#gg0000', '#10172500']) {
      expect(normalizeNativeBackgroundHex(value)).toBeNull();
    }
  });

  it('round-trips the standard color without changing its meaning', () => {
    expect(nativeBackgroundHex(nativeBackgroundFromHex(NATIVE_STANDARD_BACKGROUND_HEX)))
      .toBe(NATIVE_STANDARD_BACKGROUND_HEX);
    expect(() => nativeBackgroundFromHex('#123')).toThrow(/6桁/);
  });
});
