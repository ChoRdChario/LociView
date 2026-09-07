import { describe, expect, it } from 'vitest';
import { NativePinColorFilter, nativePinColorKey } from '../../src/nativeGs/pinColorFilter';

const colors = ['#d0a050', '#7293b0', '#b56c61', '#829779'];

describe('session-local pin colors', () => {
  it.each(Array.from({ length: 16 }, (_, index) => index))('keeps exact selection mask %i including zero', (mask) => {
    const filter = new NativePinColorFilter();
    colors.forEach((color, index) => {
      if ((mask & (1 << index)) === 0) filter.toggle('set-a', color, colors);
    });
    expect(colors.map((color) => filter.includes('set-a', color)))
      .toEqual(colors.map((_, index) => (mask & (1 << index)) !== 0));
    expect(filter.includes('set-a', '#abcdef')).toBe(mask === 15);
  });

  it('distinguishes explicit partial selection from all-mode even after toggling every color back on', () => {
    const filter = new NativePinColorFilter();
    filter.toggle('a', colors[0]!, colors);
    filter.toggle('a', colors[0]!, colors);
    expect(filter.selected('a')).not.toBeNull();
    expect(filter.includes('a', '#123456')).toBe(false);
    filter.all('a');
    expect(filter.includes('a', '#123456')).toBe(true);
  });

  it('retains per-set zero and colors that temporarily disappear; a new session starts all', () => {
    const filter = new NativePinColorFilter();
    filter.toggle('a', '#fff', ['#fff']);
    expect(filter.selected('a')?.size).toBe(0);
    expect(filter.includes('b', '#fff')).toBe(true);
    filter.show('a', '#fff');
    filter.toggle('a', '#000', ['#000']);
    expect(filter.includes('a', '#fff')).toBe(true);
    expect(new NativePinColorFilter().selected('a')).toBeNull();
  });

  it('normalizes keys and returns isolated read-only views', () => {
    expect(nativePinColorKey(' #AbC ')).toBe('#aabbcc');
    expect(nativePinColorKey(undefined)).toBe('#eab308');
    const filter = new NativePinColorFilter();
    filter.toggle('a', '#FFF', ['#FFFFFF', '#000000']);
    expect(filter.includes('a', '#ffffff')).toBe(false);
    (filter.selected('a') as Set<string>).clear();
    expect(filter.includes('a', '#000')).toBe(true);
  });
});
