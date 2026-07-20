import { describe, expect, it } from 'vitest';
import { looksLikeXlsx, readXlsx } from '../../src/io/xlsx';
import { makeXlsx } from '../helpers/makeXlsx';

describe('readXlsx', () => {
  it('sharedStrings方式のシートを読める', async () => {
    const bytes = await makeXlsx([
      { name: 'Sheet1', rows: [['a', 'b'], ['1', '日本語']] },
    ]);
    const tables = await readXlsx(bytes);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('Sheet1');
    expect(tables[0]!.rows).toEqual([['a', 'b'], ['1', '日本語']]);
  });

  it('inlineStr方式のシートも読める', async () => {
    const bytes = await makeXlsx([{ name: 'S', rows: [['x'], ['y']] }], false);
    const tables = await readXlsx(bytes);
    expect(tables[0]!.rows).toEqual([['x'], ['y']]);
  });

  it('複数シートを順序どおり読む', async () => {
    const bytes = await makeXlsx([
      { name: '記録A', rows: [['1']] },
      { name: '__LM_VIEWS', rows: [['id']] },
    ]);
    const tables = await readXlsx(bytes);
    expect(tables.map((t) => t.name)).toEqual(['記録A', '__LM_VIEWS']);
    expect(tables[0]!.gid).toBe('1');
    expect(tables[1]!.gid).toBe('2');
  });

  it('空セルを詰めずに列位置を保つ', async () => {
    const bytes = await makeXlsx([{ name: 'S', rows: [['a', '', 'c']] }]);
    const tables = await readXlsx(bytes);
    expect(tables[0]!.rows[0]).toEqual(['a', '', 'c']);
  });

  it('XML実体参照を復号する', async () => {
    const bytes = await makeXlsx([{ name: 'S', rows: [['a<b>&"c"', 'x&amp;y']] }]);
    const tables = await readXlsx(bytes);
    expect(tables[0]!.rows[0]![0]).toBe('a<b>&"c"');
    expect(tables[0]!.rows[0]![1]).toBe('x&amp;y'); // 二重復号しない
  });

  it('workbook.xmlが無いZIPは明確に失敗する', async () => {
    const { writeZipEntries } = await import('../../src/assets/zipio');
    const bytes = await writeZipEntries([{ path: 'a.txt', data: new TextEncoder().encode('x') }]);
    await expect(readXlsx(bytes)).rejects.toThrow(/workbook/);
  });
});

describe('looksLikeXlsx', () => {
  it('拡張子とZIPマジックの両方を見る', async () => {
    const bytes = await makeXlsx([{ name: 'S', rows: [['a']] }]);
    expect(looksLikeXlsx('book.xlsx', bytes)).toBe(true);
    expect(looksLikeXlsx('book.csv', bytes)).toBe(false);
    expect(looksLikeXlsx('book.xlsx', new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });
});
