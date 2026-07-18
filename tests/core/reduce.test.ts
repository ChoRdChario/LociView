import { describe, expect, it } from 'vitest';
import type { Op } from '../../src/core/schema';
import { getRecord, isVisible, reduce, versionVector, visibleEntities } from '../../src/core/reduce';
import { mulberry32, shuffled, simulateScenario } from '../helpers/sim';

/** テスト用のhlcリテラルを作る（固定幅を守る） */
function hlc(ms: number, counter: number, actor: string): string {
  const iso = new Date(1_780_000_000_000 + ms).toISOString();
  return `${iso}-${counter.toString(16).padStart(4, '0')}-${actor}`;
}

function op(partial: Partial<Op> & Pick<Op, 'op' | 'hlc' | 'actor' | 't' | 'id'>): Op {
  return { user: `usr_${partial.actor}`, e: 'caption', ...partial };
}

describe('フィールド単位LWW', () => {
  const A = 'a_AAA';
  const B = 'a_BBB';

  it('別フィールドの並行編集は両方反映される', () => {
    const ops: Op[] = [
      op({ op: 1, hlc: hlc(0, 0, A), actor: A, t: 'create', id: 'cap1', v: { title: 'orig', body: '' } }),
      op({ op: 2, hlc: hlc(1000, 0, A), actor: A, t: 'update', id: 'cap1', v: { title: 'A-title' } }),
      op({ op: 1, hlc: hlc(1001, 0, B), actor: B, t: 'update', id: 'cap1', v: { body: 'B-body' } }),
    ];
    const rec = getRecord(reduce(ops), 'caption', 'cap1')!;
    expect(rec.fields.title).toBe('A-title');
    expect(rec.fields.body).toBe('B-body');
  });

  it('同一フィールドはhlcが新しい方が勝つ（投入順に依存しない）', () => {
    const ops: Op[] = [
      op({ op: 1, hlc: hlc(0, 0, A), actor: A, t: 'create', id: 'cap1', v: { title: 'orig' } }),
      op({ op: 2, hlc: hlc(2000, 0, A), actor: A, t: 'update', id: 'cap1', v: { title: 'A-late' } }),
      op({ op: 1, hlc: hlc(1000, 0, B), actor: B, t: 'update', id: 'cap1', v: { title: 'B-early' } }),
    ];
    for (const order of [ops, [...ops].reverse()]) {
      const rec = getRecord(reduce(order), 'caption', 'cap1')!;
      expect(rec.fields.title).toBe('A-late');
      expect(rec.fieldWriters.title).toBe('usr_a_AAA');
    }
  });

  it('createdAt/createdByは最初のcreateのものを保持する', () => {
    const ops: Op[] = [
      op({ op: 1, hlc: hlc(500, 0, B), actor: B, t: 'create', id: 'cap1', v: { title: 'B' } }),
      op({ op: 1, hlc: hlc(0, 0, A), actor: A, t: 'create', id: 'cap1', v: { title: 'A' } }),
    ];
    const rec = getRecord(reduce(ops), 'caption', 'cap1')!;
    expect(rec.createdBy).toBe('usr_a_AAA');
    expect(rec.fields.title).toBe('B'); // フィールド値はLWW
  });
});

describe('削除とupdate-wins（docs/02 §4.4）', () => {
  const A = 'a_AAA';
  const B = 'a_BBB';

  it('削除より新しい更新があればエンティティは復活する', () => {
    const ops: Op[] = [
      op({ op: 1, hlc: hlc(0, 0, A), actor: A, t: 'create', id: 'cap1', v: { title: 'x' } }),
      op({ op: 2, hlc: hlc(1000, 0, A), actor: A, t: 'delete', id: 'cap1' }),
      op({ op: 1, hlc: hlc(2000, 0, B), actor: B, t: 'update', id: 'cap1', v: { body: 'revived' } }),
    ];
    const rec = getRecord(reduce(ops), 'caption', 'cap1')!;
    expect(isVisible(rec)).toBe(true);
    expect(rec.fields.body).toBe('revived');
  });

  it('削除が最後ならエンティティは不可視になる', () => {
    const ops: Op[] = [
      op({ op: 1, hlc: hlc(0, 0, A), actor: A, t: 'create', id: 'cap1', v: { title: 'x' } }),
      op({ op: 1, hlc: hlc(1000, 0, B), actor: B, t: 'update', id: 'cap1', v: { body: 'y' } }),
      op({ op: 2, hlc: hlc(2000, 0, A), actor: A, t: 'delete', id: 'cap1' }),
    ];
    const state = reduce(ops);
    expect(isVisible(getRecord(state, 'caption', 'cap1')!)).toBe(false);
    expect(visibleEntities(state, 'caption')).toHaveLength(0);
  });
});

describe('未知エンティティ種別の素通し（docs/02 §9）', () => {
  it('未知kindのopも保持される', () => {
    const A = 'a_AAA';
    const ops: Op[] = [
      op({ op: 1, hlc: hlc(0, 0, A), actor: A, t: 'create', e: 'hologram', id: 'h1', v: { x: 1 } }),
    ];
    const state = reduce(ops);
    expect(getRecord(state, 'hologram', 'h1')!.fields.x).toBe(1);
  });
});

describe('決定性（P0-1: 順序・重複・分割に対する不変性）', () => {
  const SEEDS = [1, 42, 20260718, 777, 31337];

  it('投入順をシャッフルしても結果が一致する', () => {
    for (const seed of SEEDS) {
      const ops = simulateScenario(seed);
      const expected = reduce(ops);
      const rnd = mulberry32(seed * 7 + 1);
      for (let i = 0; i < 5; i++) {
        expect(reduce(shuffled(ops, rnd))).toEqual(expected);
      }
    }
  });

  it('opsを二重に投入しても結果が一致する（重複排除）', () => {
    for (const seed of SEEDS) {
      const ops = simulateScenario(seed);
      expect(reduce([...ops, ...ops])).toEqual(reduce(ops));
    }
  });

  it('任意の分割・結合順で結果が一致する', () => {
    for (const seed of SEEDS) {
      const ops = simulateScenario(seed);
      const rnd = mulberry32(seed * 13 + 5);
      const parts: Op[][] = [[], [], []];
      for (const o of ops) parts[Math.floor(rnd() * 3)]!.push(o);
      const expected = reduce(ops);
      expect(reduce([...parts[2]!, ...parts[0]!, ...parts[1]!])).toEqual(expected);
      expect(reduce([...parts[1]!, ...parts[2]!, ...parts[0]!])).toEqual(expected);
    }
  });

  it('時計スキューがあっても全opが取り込まれる', () => {
    const ops = simulateScenario(99, { actors: 4, steps: 400 });
    const vv = versionVector(ops);
    const total = Object.values(vv).reduce((s, n) => s + n, 0);
    expect(total).toBe(ops.length);
  });
});
