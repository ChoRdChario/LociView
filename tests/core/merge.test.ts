import { describe, expect, it } from 'vitest';
import type { Op } from '../../src/core/schema';
import { mergeOps } from '../../src/core/merge';
import { reduce } from '../../src/core/reduce';
import { mulberry32, simulateScenario } from '../helpers/sim';

function hlc(ms: number, counter: number, actor: string): string {
  const iso = new Date(1_780_000_000_000 + ms).toISOString();
  return `${iso}-${counter.toString(16).padStart(4, '0')}-${actor}`;
}

const A = 'a_000000000000A';
const B = 'a_000000000000B';

function op(partial: Partial<Op> & Pick<Op, 'op' | 'hlc' | 'actor' | 't' | 'id'>): Op {
  return { user: `usr_${partial.actor}`, e: 'caption', ...partial };
}

describe('mergeOps', () => {
  const base: Op[] = [
    op({ op: 1, hlc: hlc(0, 0, A), actor: A, t: 'create', id: 'cap1', v: { title: 'X', body: 'b' } }),
  ];

  it('新規・更新・上書きをレポートする', () => {
    const incoming: Op[] = [
      op({ op: 1, hlc: hlc(1000, 0, B), actor: B, t: 'update', id: 'cap1', v: { title: 'Y' } }),
      op({ op: 2, hlc: hlc(2000, 0, B), actor: B, t: 'create', id: 'cap2', v: { title: 'new' } }),
    ];
    const { newOps, report, stateAfter } = mergeOps(base, incoming);
    expect(newOps).toHaveLength(2);
    expect(report.created).toEqual([{ kind: 'caption', id: 'cap2' }]);
    expect(report.updated).toEqual([{ kind: 'caption', id: 'cap1' }]);
    expect(report.overwritten).toHaveLength(1);
    expect(report.overwritten[0]).toMatchObject({
      id: 'cap1',
      field: 'title',
      winnerUser: 'usr_a_000000000000B',
      loserUser: 'usr_a_000000000000A',
    });
    expect(stateAfter.byKind.caption!.cap1!.fields.title).toBe('Y');
  });

  it('取込側が古い場合はrejectedとして記録し、既存値を保持する', () => {
    const baseNewer: Op[] = [
      ...base,
      op({ op: 2, hlc: hlc(5000, 0, A), actor: A, t: 'update', id: 'cap1', v: { title: 'A-newest' } }),
    ];
    const incoming: Op[] = [
      op({ op: 1, hlc: hlc(1000, 0, B), actor: B, t: 'update', id: 'cap1', v: { title: 'B-old' } }),
    ];
    const { report, stateAfter } = mergeOps(baseNewer, incoming);
    expect(stateAfter.byKind.caption!.cap1!.fields.title).toBe('A-newest');
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]).toMatchObject({ field: 'title', loserUser: 'usr_a_000000000000B' });
    expect(report.overwritten).toHaveLength(0);
  });

  it('同じZIPを二度マージしても二度目は何も起きない（冪等）', () => {
    const incoming: Op[] = [
      op({ op: 1, hlc: hlc(1000, 0, B), actor: B, t: 'create', id: 'cap9', v: { title: 'z' } }),
    ];
    const first = mergeOps(base, incoming);
    const merged = [...base, ...first.newOps];
    const second = mergeOps(merged, incoming);
    expect(second.newOps).toHaveLength(0);
    expect(second.report.created).toHaveLength(0);
    expect(second.report.updated).toHaveLength(0);
  });

  it('削除済みエンティティへの新しい更新はrevivedとして報告される', () => {
    const baseDeleted: Op[] = [
      ...base,
      op({ op: 2, hlc: hlc(1000, 0, A), actor: A, t: 'delete', id: 'cap1' }),
    ];
    const incoming: Op[] = [
      op({ op: 1, hlc: hlc(2000, 0, B), actor: B, t: 'update', id: 'cap1', v: { body: 'later' } }),
    ];
    const { report } = mergeOps(baseDeleted, incoming);
    expect(report.revived).toEqual([{ kind: 'caption', id: 'cap1' }]);
  });

  it('マージ後状態は全op一括reduceと完全一致する（増分と一括の等価性）', () => {
    for (const seed of [3, 1234, 55555]) {
      const all = simulateScenario(seed, { actors: 3, steps: 300 });
      const rnd = mulberry32(seed + 9);
      const mine: Op[] = [];
      const theirs: Op[] = [];
      for (const o of all) (rnd() < 0.5 ? mine : theirs).push(o);
      const { stateAfter } = mergeOps(mine, theirs);
      expect(stateAfter).toEqual(reduce(all));
    }
  });
});
