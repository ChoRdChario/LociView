// 決定性テスト用のシナリオシミュレータ
// 複数actorが時計スキューを持ちながら create/update/delete/sync を行う op 集合を、
// シードから再現可能な形で生成する。

import { HlcClock } from '../../src/core/hlc';
import type { Op } from '../../src/core/schema';

/** 再現可能な擬似乱数（mulberry32） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(arr: readonly T[], rnd: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface SimOptions {
  actors?: number;
  steps?: number;
}

const ACTOR_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function actorIdForIndex(index: number): string {
  let value = index;
  const digits = new Array<string>(13);
  for (let position = digits.length - 1; position >= 0; position -= 1) {
    digits[position] = ACTOR_ALPHABET[value % 32]!;
    value = Math.floor(value / 32);
  }
  if (value !== 0) throw new Error('simulation actor index is too large');
  return `a_${digits.join('')}`;
}

export function simulateScenario(seed: number, opts: SimOptions = {}): Op[] {
  const rnd = mulberry32(seed);
  const nActors = opts.actors ?? 3;
  const steps = opts.steps ?? 200;

  let globalTime = 1_780_000_000_000; // 2026年ごろのepoch ms
  const actors = Array.from({ length: nActors }, (_, i) => {
    const skew = Math.floor((rnd() - 0.5) * 20_000); // 端末時計±10秒の狂い
    const actorId = actorIdForIndex(i);
    return {
      actorId,
      userId: `usr_SIM${i}`,
      seq: 0,
      clock: new HlcClock(actorId, () => globalTime + skew),
      ops: [] as Op[],
      known: [] as string[],
    };
  });

  const kinds = ['caption', 'set', 'view'] as const;
  const fields = ['title', 'body', 'color', 'posX'] as const;

  for (let s = 0; s < steps; s++) {
    globalTime += Math.floor(rnd() * 500);
    const a = actors[Math.floor(rnd() * nActors)]!;
    const r = rnd();

    if (r < 0.25 || a.known.length === 0) {
      const kind = kinds[Math.floor(rnd() * kinds.length)]!;
      const id = `${kind}_${s}_${a.actorId}`;
      a.known.push(id);
      a.ops.push({
        op: ++a.seq,
        hlc: a.clock.tick(),
        actor: a.actorId,
        user: a.userId,
        t: 'create',
        e: kind,
        id,
        v: { title: `t${s}`, color: '#fff' },
      });
    } else if (r < 0.75) {
      const id = a.known[Math.floor(rnd() * a.known.length)]!;
      const kind = id.split('_')[0]!;
      const f = fields[Math.floor(rnd() * fields.length)]!;
      a.ops.push({
        op: ++a.seq,
        hlc: a.clock.tick(),
        actor: a.actorId,
        user: a.userId,
        t: 'update',
        e: kind,
        id,
        v: { [f]: `v${s}` },
      });
    } else if (r < 0.85) {
      const id = a.known[Math.floor(rnd() * a.known.length)]!;
      const kind = id.split('_')[0]!;
      a.ops.push({
        op: ++a.seq,
        hlc: a.clock.tick(),
        actor: a.actorId,
        user: a.userId,
        t: 'delete',
        e: kind,
        id,
      });
    } else {
      // sync: 他actorのログを観測（マージ受信のシミュレーション）
      const b = actors[Math.floor(rnd() * nActors)]!;
      if (b !== a) {
        for (const o of b.ops) a.clock.observe(o.hlc);
        for (const id of b.known) if (!a.known.includes(id)) a.known.push(id);
      }
    }
  }

  return actors.flatMap((a) => a.ops);
}
