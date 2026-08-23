import { describe, expect, it } from 'vitest';
import { MAX_LINE_CHARS, parseOpsJsonl, serializeOps } from '../../src/core/jsonl';
import type { Op } from '../../src/core/schema';

function sampleOps(): Op[] {
  const iso = new Date(1_780_000_000_000).toISOString();
  return [
    {
      op: 1,
      hlc: `${iso}-0000-a_000000000000A`,
      actor: 'a_000000000000A',
      user: 'usr_1',
      t: 'create',
      e: 'caption',
      id: 'cap1',
      v: { title: '日本語タイトル', body: 'a"b\\c', posX: 0.1234567890123456 },
    },
    {
      op: 2,
      hlc: `${iso}-0001-a_000000000000A`,
      actor: 'a_000000000000A',
      user: 'usr_1',
      t: 'delete',
      e: 'caption',
      id: 'cap1',
    },
  ];
}

describe('serializeOps / parseOpsJsonl', () => {
  it('往復して等価（数値精度・日本語・エスケープ含む）', () => {
    const ops = sampleOps();
    const text = serializeOps(ops);
    const { ops: parsed, errors } = parseOpsJsonl(text);
    expect(errors).toHaveLength(0);
    expect(parsed).toEqual(ops);
  });

  it('空文字列は空結果', () => {
    const { ops, errors } = parseOpsJsonl('');
    expect(ops).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('CRLFと空行を許容する', () => {
    const text = serializeOps(sampleOps()).replace(/\n/g, '\r\n') + '\r\n\r\n';
    const { ops, errors } = parseOpsJsonl(text);
    expect(errors).toHaveLength(0);
    expect(ops).toHaveLength(2);
  });

  it('破損行はスキップして残りを読む', () => {
    const good = serializeOps(sampleOps());
    const text = 'NOT JSON\n' + good + '{"op":"bad"}\n';
    const { ops, errors } = parseOpsJsonl(text);
    expect(ops).toHaveLength(2);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({ line: 1, reason: 'invalid JSON' });
    expect(errors[1]!.reason).toBe('schema violation');
  });

  it('過大な行は拒否する', () => {
    const long = '{"pad":"' + 'x'.repeat(MAX_LINE_CHARS) + '"}';
    const { ops, errors } = parseOpsJsonl(long);
    expect(ops).toHaveLength(0);
    expect(errors[0]!.reason).toBe('line too long');
  });

  it('スキーマ違反の行を弾く（vなしのcreate等）', () => {
    const iso = new Date(1_780_000_000_000).toISOString();
    const bad = JSON.stringify({ op: 1, hlc: `${iso}-0000-a_A`, actor: 'a_A', user: 'u', t: 'create', e: 'caption', id: 'c1' });
    const { ops, errors } = parseOpsJsonl(bad + '\n');
    expect(ops).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});
