import { describe, expect, it } from 'vitest';
import { HlcClock, compareHlc, formatHlc, parseHlc } from '../../src/core/hlc';

const ACTOR = 'a_TESTACTOR01';

describe('formatHlc / parseHlc', () => {
  it('固定幅フォーマットで往復できる', () => {
    const hlc = formatHlc(1_780_000_000_123, 255, ACTOR);
    expect(hlc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-00ff-a_TESTACTOR01$/);
    const p = parseHlc(hlc);
    expect(p.physical).toBe(1_780_000_000_123);
    expect(p.counter).toBe(255);
    expect(p.actor).toBe(ACTOR);
  });

  it('不正な文字列は例外を投げる', () => {
    expect(() => parseHlc('garbage')).toThrow();
    expect(() => parseHlc('')).toThrow();
  });
});

describe('文字列比較 = 時刻順比較', () => {
  it('physicalが優先される', () => {
    const a = formatHlc(1000, 0xffff, ACTOR);
    const b = formatHlc(1001, 0, ACTOR);
    expect(compareHlc(a, b)).toBeLessThan(0);
  });

  it('同physicalではcounterで順序が付く', () => {
    const a = formatHlc(1000, 5, ACTOR);
    const b = formatHlc(1000, 10, ACTOR);
    expect(compareHlc(a, b)).toBeLessThan(0);
  });

  it('同physical同counterではactorでタイブレークされる', () => {
    const a = formatHlc(1000, 0, 'a_AAA');
    const b = formatHlc(1000, 0, 'a_BBB');
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(a, a)).toBe(0);
  });
});

describe('HlcClock', () => {
  it('時計が止まっていてもtickは単調増加する', () => {
    const clock = new HlcClock(ACTOR, () => 5000);
    const seq = [clock.tick(), clock.tick(), clock.tick()];
    expect(compareHlc(seq[0]!, seq[1]!)).toBeLessThan(0);
    expect(compareHlc(seq[1]!, seq[2]!)).toBeLessThan(0);
  });

  it('時刻が進むとcounterがリセットされる', () => {
    let now = 5000;
    const clock = new HlcClock(ACTOR, () => now);
    clock.tick();
    clock.tick();
    now = 6000;
    const h = parseHlc(clock.tick());
    expect(h.physical).toBe(6000);
    expect(h.counter).toBe(0);
  });

  it('counterあふれ時はphysicalを進める', () => {
    const clock = new HlcClock(ACTOR, () => 5000);
    let last = '';
    for (let i = 0; i <= 0x10001; i++) last = clock.tick();
    const p = parseHlc(last);
    expect(p.physical).toBeGreaterThan(5000);
  });

  it('observe後のtickは観測値より必ず後になる（時計が過去でも）', () => {
    const clock = new HlcClock(ACTOR, () => 1000); // 大きく遅れた時計
    const remote = formatHlc(999_999_999, 42, 'a_REMOTE');
    clock.observe(remote);
    const next = clock.tick();
    expect(compareHlc(next, remote)).toBeGreaterThan(0);
  });

  it('過去のhlcをobserveしても影響しない', () => {
    let now = 10_000;
    const clock = new HlcClock(ACTOR, () => now);
    const t1 = clock.tick();
    clock.observe(formatHlc(1, 0, 'a_OLD'));
    now = 10_001;
    const t2 = clock.tick();
    expect(compareHlc(t1, t2)).toBeLessThan(0);
    expect(parseHlc(t2).physical).toBe(10_001);
  });
});
