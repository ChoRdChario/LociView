import { describe, expect, it } from 'vitest';
import { actorIdFrom, newActorId, newId, ulid } from '../../src/core/ids';

describe('ulid', () => {
  it('26文字のCrockford Base32を生成する', () => {
    const id = ulid();
    expect(id).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  it('衝突しない（5000件）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(ulid());
    expect(seen.size).toBe(5000);
  });

  it('時刻順に文字列ソートできる', () => {
    const a = ulid(1_780_000_000_000);
    const b = ulid(1_780_000_100_000);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
  });
});

describe('newId', () => {
  it('prefix付きIDを生成する', () => {
    expect(newId('cap')).toMatch(/^cap_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
    expect(newId('prj')).toMatch(/^prj_/);
  });
});

describe('actorIdFrom', () => {
  it('同一入力から常に同じactorIdを導出する（決定的）', () => {
    const a1 = actorIdFrom('usr_ABC', 'dev_XYZ');
    const a2 = actorIdFrom('usr_ABC', 'dev_XYZ');
    expect(a1).toBe(a2);
    expect(a1).toMatch(/^a_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{13}$/);
  });

  it('異なる入力からは異なるactorIdになる', () => {
    const a = actorIdFrom('usr_ABC', 'dev_XYZ');
    const b = actorIdFrom('usr_ABC', 'dev_OTHER');
    const c = actorIdFrom('usr_DEF', 'dev_XYZ');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('newActorId', () => {
  it('ProjectStore lifetime用のcanonical actorをCSPRNGで自己発行する', () => {
    const actors = Array.from({ length: 128 }, () => newActorId());
    expect(actors.every((actor) => /^a_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{13}$/u.test(actor))).toBe(true);
    expect(new Set(actors).size).toBe(actors.length);
  });
});
