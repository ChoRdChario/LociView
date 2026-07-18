import { describe, expect, it } from 'vitest';
import {
  applyCsvPlan,
  buildCaptionsCsv,
  guardCell,
  parseCsv,
  planCaptionsCsvImport,
  unguardCell,
} from '../../src/io/csv';
import { visibleEntities } from '../../src/core/reduce';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';

const USER_A: Identity = { userId: 'usr_AAA', deviceId: 'dev_A1', displayName: '田中' };

async function makeStore(): Promise<{ store: ProjectStore; astId: string; capId: string }> {
  const store = await ProjectStore.create(new MemoryFS(), 'p', 'test', USER_A);
  const astId = store.createEntity('asset', {
    kind: 'model',
    path: 'models/a.glb',
    originalName: 'site.glb',
  });
  const capId = store.createEntity('caption', {
    title: '亀裂',
    body: '幅3mm、=注意',
    color: '#eab308',
    tags: ['構造', '要観察'],
    attachments: [],
    anchor: { modelAssetId: astId, position: [0.1234567890123456, -2.5, 100] },
  });
  return { store, astId, capId };
}

describe('parseCsv', () => {
  it('引用・カンマ・改行・BOMを処理できる', () => {
    const text = '﻿a,b,c\r\n"x,y",".""q",line1\nplain,,last\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x,y', '."q', 'line1'],
      ['plain', '', 'last'],
    ]);
  });

  it('引用フィールド内の改行を保持する', () => {
    expect(parseCsv('a,"1行目\n2行目"\n')).toEqual([['a', '1行目\n2行目']]);
  });
});

describe('formula injectionガード', () => {
  it('危険な先頭文字をエスケープし、決定的に復元できる', () => {
    for (const s of ['=SUM(A1)', '+1', '-cmd', '@x', '普通のテキスト', '', "'quoted"]) {
      expect(unguardCell(guardCell(s))).toBe(s);
    }
    expect(guardCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(guardCell('安全')).toBe('安全');
  });
});

describe('buildCaptionsCsv', () => {
  it('BOM付き・完全精度座標・表示名で出力する', async () => {
    const { store } = await makeStore();
    const csv = buildCaptionsCsv(store.state);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('0.1234567890123456'); // 完全精度
    expect(csv).toContain('site.glb');
    expect(csv).toContain('構造;要観察');
    expect(csv).toContain('田中'); // profile表示名
    expect(csv).toContain('幅3mm、=注意'); // セル先頭でない=はガード対象外（素通しが正しい）
  });

  it('セル先頭の危険文字はガードされ、往復で差分にならない', async () => {
    const { store } = await makeStore();
    store.createEntity('caption', {
      title: '=SUM(A1)',
      body: '',
      color: '#f00',
      tags: [],
      attachments: [],
    });
    const csv = buildCaptionsCsv(store.state);
    expect(csv).toContain("'=SUM(A1)"); // エクスポート時にガード
    const plan = planCaptionsCsvImport(csv, store.state);
    expect(plan.updates).toHaveLength(0); // 取込時に対称的に復元され、差分ゼロ
    expect(plan.issues).toHaveLength(0);
  });
});

describe('CSV往復（UC4: スプレッドシート運用）', () => {
  it('無編集の往復では差分ゼロ', async () => {
    const { store } = await makeStore();
    const csv = buildCaptionsCsv(store.state);
    const plan = planCaptionsCsvImport(csv, store.state);
    expect(plan.updates).toHaveLength(0);
    expect(plan.creates).toHaveLength(0);
    expect(plan.deleteCandidates).toHaveLength(0);
    expect(plan.issues).toHaveLength(0);
  });

  it('タイトル変更と座標コピペが差分として検出・適用される', async () => {
    const { store, capId } = await makeStore();
    let csv = buildCaptionsCsv(store.state);
    csv = csv.replace('亀裂', '亀裂（拡大中）').replace('0.1234567890123456', '9.9');

    const plan = planCaptionsCsvImport(csv, store.state);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.id).toBe(capId);
    expect(plan.updates[0]!.patch.title).toBe('亀裂（拡大中）');
    const anchor = plan.updates[0]!.patch.anchor as { position: number[] };
    expect(anchor.position).toEqual([9.9, -2.5, 100]);

    applyCsvPlan(store, plan);
    const rec = store.state.byKind.caption![capId]!;
    expect(rec.fields.title).toBe('亀裂（拡大中）');
  });

  it('captionIdなし行は新規作成、未知setNameは新規セットになる', async () => {
    const { store } = await makeStore();
    const csv =
      buildCaptionsCsv(store.state) +
      ',新セット,追加ピン,本文,#00ff00,タグ1,,site.glb,1,2,3,,,,\r\n';
    const plan = planCaptionsCsvImport(csv, store.state);
    expect(plan.creates).toHaveLength(1);
    expect(plan.newSetNames).toEqual(['新セット']);

    applyCsvPlan(store, plan);
    const sets = visibleEntities(store.state, 'set');
    expect(sets.map((s) => s.fields.name)).toContain('新セット');
    const captions = visibleEntities(store.state, 'caption');
    expect(captions).toHaveLength(2);
    const added = captions.find((c) => c.fields.title === '追加ピン')!;
    const newSet = sets.find((s) => s.fields.name === '新セット')!;
    expect(added.fields.setId).toBe(newSet.id);
  });

  it('CSVから行を消すとdeleteCandidatesに載る（自動削除はしない）', async () => {
    const { store, capId } = await makeStore();
    const header = buildCaptionsCsv(store.state).split('\r\n')[0]!;
    const plan = planCaptionsCsvImport(header + '\r\n', store.state);
    expect(plan.deleteCandidates).toEqual([capId]);
    expect(plan.updates).toHaveLength(0);
  });

  it('modelName書き換えでモデル一括付替えになる', async () => {
    const { store, capId } = await makeStore();
    const ast2 = store.createEntity('asset', {
      kind: 'model',
      path: 'models/b.glb',
      originalName: 'new-model.glb',
    });
    const csv = buildCaptionsCsv(store.state).replace('site.glb', 'new-model.glb');
    const plan = planCaptionsCsvImport(csv, store.state);
    expect(plan.updates).toHaveLength(1);
    const anchor = plan.updates[0]!.patch.anchor as { modelAssetId: string };
    expect(anchor.modelAssetId).toBe(ast2);

    applyCsvPlan(store, plan);
    const rec = store.state.byKind.caption![capId]!;
    expect((rec.fields.anchor as { modelAssetId: string }).modelAssetId).toBe(ast2);
  });

  it('不明なcaptionId・不正座標はissueとして報告される', async () => {
    const { store } = await makeStore();
    const header = buildCaptionsCsv(store.state);
    const csv = header + 'cap_UNKNOWN,,x,,,,,,,,,,,,\r\n';
    const plan = planCaptionsCsvImport(csv, store.state);
    expect(plan.issues.some((i) => i.includes('不明なcaptionId'))).toBe(true);
  });
});
