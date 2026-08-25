import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE,
  applyImportPlan,
  buildImportPlan,
  selectSource,
  sniffImageExt,
} from '../../src/assets/importWizard';
import { writeZipEntries, readZipEntries } from '../../src/assets/zipio';
import { isVisible, visibleEntities } from '../../src/core/reduce';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import { makeXlsx } from '../helpers/makeXlsx';

const USER: Identity = { userId: 'usr_M', deviceId: 'dev_M', displayName: '移行者' };
const enc = new TextEncoder();

const CAP_HEADER = ['id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt'];
const VIEWS_HEADER = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
const MAT_HEADER = ['materialKey', 'opacity', 'doubleSided', 'unlitLike', 'chromaEnable', 'chromaColor', 'chromaTolerance', 'chromaFeather', 'roughness', 'metalness', 'emissiveHex', 'updatedAt', 'updatedBy', 'sheetGid'];

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function captionCsvBytes(rows: string[][]): Uint8Array {
  return enc.encode([CAP_HEADER, ...rows].map((row) => row.join(',')).join('\n'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Google Drive のフォルダZIPダウンロードを模した ZIP を作る */
async function makeDriveZip(opts: { withFileIdMap?: boolean } = {}): Promise<Uint8Array> {
  const xlsx = await makeXlsx([
    {
      name: '通常表示',
      rows: [
        CAP_HEADER,
        ['c_a1', '北壁の亀裂', '幅3mm', '#eab308', '1.5', '2', '-3', 'DRIVEID_A', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'],
        ['c_a2', '基礎の露出', '', '#f87171', '0.5', '0', '0', '', '', ''],
      ],
    },
    {
      name: '半透明・内部',
      rows: [
        CAP_HEADER,
        ['c_b1', '内部の空洞', '', '#4ade80', '0', '1', '0', '', '', ''],
      ],
    },
    {
      name: '__LM_VIEWS',
      rows: [
        VIEWS_HEADER,
        ['v_1', '1', '全景', '#202124', 'perspective', '1', '2', '3', '0', '0', '0', '0', '1', '0', '50', '', ''],
      ],
    },
    {
      name: '__LM_MATERIALS',
      rows: [
        MAT_HEADER,
        ['Wall', '0.4', 'true', 'false', 'false', '', '', '', '', '', '', '', '', '2'],
      ],
    },
  ]);

  // 最小STL（cube相当は不要。ヘッダのみで検出される）
  const stl = enc.encode('solid s\nfacet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\nendsolid s\n');

  const entries = [
    { path: 'LociMyu Save - 現場A.xlsx', data: xlsx },
    { path: 'site.stl', data: stl },
    { path: '写真/kiretsu_01.jpg', data: enc.encode('JPEGDATA') },
    { path: '写真/kiso.png', data: enc.encode('PNGDATA') },
  ];
  if (opts.withFileIdMap === true) {
    entries.push({
      path: 'fileid-map.csv',
      data: enc.encode('fileId,filename\nDRIVEID_A,kiretsu_01.jpg\n'),
    });
  }
  return writeZipEntries(entries);
}

describe('buildImportPlan', () => {
  it('Drive ZIPの中身を分類し、LociMyu移行を検出する', async () => {
    const zip = await makeDriveZip();
    const plan = await buildImportPlan(await readZipEntries(zip));

    expect(plan.models.map((m) => m.name)).toEqual(['site.stl']);
    expect(plan.images.map((i) => i.name).sort()).toEqual(['kiretsu_01.jpg', 'kiso.png']);
    expect(plan.migration).not.toBeNull();
    expect(plan.migration!.sets.map((s) => s.name)).toEqual(['通常表示', '半透明・内部']);
    expect(plan.migration!.views).toHaveLength(1);
    expect(plan.migration!.materials).toHaveLength(1);
    expect(plan.migration!.unlinkedImages.size).toBe(1);
  });

  it('fileId対応表CSVを読み分ける（キャプションCSVと混同しない）', async () => {
    const zip = await makeDriveZip({ withFileIdMap: true });
    const plan = await buildImportPlan(await readZipEntries(zip));
    expect(plan.fileIdMap.get('DRIVEID_A')).toBe('kiretsu_01.jpg');
    expect(plan.tables.some((t) => t.name === 'fileid-map')).toBe(false);
  });

  it('raw Caption CSVをfileId対応表と誤認せず、trim済みfilenameとrecord順でidentity化する', async () => {
    const captionCsv = [
      CAP_HEADER.join(','),
      'c_DUPLICATE,first,,,,,,,,',
      'c_OTHER,other,,,,,,,,',
      'c_DUPLICATE,second,,,,,,,,',
    ].join('\n');
    const zip = await writeZipEntries([
      { path: '\u3000A\u00a0.csv', data: enc.encode(captionCsv) },
      { path: 'fileid-map.csv', data: enc.encode('fileId,filename\nDRIVEID_A,photo.png\n') },
    ]);
    const plan = await buildImportPlan(await readZipEntries(zip));
    expect(plan.sources).toHaveLength(1);
    expect(plan.fileIdMap.get('DRIVEID_A')).toBe('photo.png');
    const duplicates = plan.migration!.sets[0]!.captions.filter((caption) => caption.legacyId === 'c_DUPLICATE');
    expect(duplicates.map((caption) => caption.identity.key)).toEqual([
      { legacyId: 'c_DUPLICATE', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: 'A' } },
      { legacyId: 'c_DUPLICATE', occurrence: 1, sheetIdentity: { kind: 'sheetName', value: 'A' } },
    ]);
    expect(duplicates.map((caption) => caption.captionId)).toEqual([
      'cap_67WP1YG84SRWSBFJXWY68ZH03T',
      'cap_0C8PPVY42VKBAN3HPDQS29678S',
    ]);
  });

  it('拡張子のない画像をマジックバイトで取り込む（Drive由来のHEIC等）', async () => {
    // 先頭がJPEGマジックの拡張子なしファイル
    const jpeg = new Uint8Array(16);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0], 0);
    // HEIC (ftyp heic)
    const heic = new Uint8Array(16);
    heic.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
    const zip = await writeZipEntries([
      { path: '202506-16-17', data: jpeg },
      { path: 'IMG_9592', data: heic },
      { path: 'notes.txt', data: enc.encode('hello') },
    ]);
    const plan = await buildImportPlan(await readZipEntries(zip));
    expect(plan.images.map((i) => i.name).sort()).toEqual(['202506-16-17', 'IMG_9592']);
  });

  it('sniffImageExt: マジックバイトから拡張子を判定', () => {
    expect(sniffImageExt(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpg');
    expect(sniffImageExt(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('png');
    const heic = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(sniffImageExt(heic)).toBe('heic');
    expect(sniffImageExt(new TextEncoder().encode('plain text!!'))).toBeNull();
  });

  it('Excelロックファイル・隠しファイルを無視する', async () => {
    const zip = await writeZipEntries([
      { path: '~$book.xlsx', data: enc.encode('PK') },
      { path: '.DS_Store', data: enc.encode('x') },
      { path: 'a.png', data: enc.encode('PNG') },
    ]);
    const plan = await buildImportPlan(await readZipEntries(zip));
    expect(plan.images).toHaveLength(1);
    expect(plan.tables).toHaveLength(0);
  });

  it('読めないxlsxの内部parser/path詳細を通常warningへ露出しない', async () => {
    const plan = await buildImportPlan([
      { path: 'broken.xlsx', data: Uint8Array.of(0x50, 0x4b, 0, 0, 0) },
    ]);
    expect(plan.diagnostics.archive).toEqual(['broken.xlsx を安全に読み取れませんでした']);
    expect(plan.warnings).toEqual(['broken.xlsx を安全に読み取れませんでした']);
    expect(plan.warnings.join('\n')).not.toMatch(/workbook\.xml|central directory|zip/u);
  });

  it('未認識の現在候補でも、その候補の診断を構造化stateに保持する', async () => {
    const plan = await buildImportPlan([
      { path: 'generic.csv', data: enc.encode('name,value\nfoo,bar\n') },
    ]);
    expect(plan.migration).toBeNull();
    expect(plan.diagnostics.selectedSource).toContain(
      'LociMyu形式のキャプションシートが見つかりませんでした',
    );
    expect(plan.warnings).toContain('LociMyu形式のキャプションシートが見つかりませんでした');
  });
});

describe('raw XLSX Caption identity authority', () => {
  async function identityFromWorkbook(mapRows: string[][], legacyId: string): Promise<{
    key: unknown;
    captionId: string;
  }> {
    const xlsx = await makeXlsx([
      { name: 'A', rows: [CAP_HEADER, [legacyId, 'caption', '', '', '', '', '', '', '', '']] },
      {
        name: '__LM_SHEET_NAMES',
        rows: [['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'], ...mapRows],
      },
    ]);
    const plan = await buildImportPlan(await readZipEntries(await writeZipEntries([
      { path: 'raw.xlsx', data: xlsx },
    ])));
    const caption = plan.migration!.sets[0]!.captions[0]!;
    return { key: caption.identity.key, captionId: caption.captionId };
  }

  it('exact duplicate map pairをdedupeしてauthoritative GIDを使う', async () => {
    const identity = await identityFromWorkbook([
      ['0', '', 'A', ''],
      ['0', '', 'A', ''],
    ], 'c_SYNTH_A');
    expect(identity).toEqual({
      key: { legacyId: 'c_SYNTH_A', occurrence: 0, sheetIdentity: { kind: 'legacyGid', value: '0' } },
      captionId: 'cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40',
    });
  });

  it.each([
    ['incomplete row', [['0', '', '', ''], ['0', '', 'A', '']]],
    ['GID-to-title conflict', [['0', '', 'A', ''], ['0', '', 'B', '']]],
    ['title-to-GID conflict', [['0', '', 'A', ''], ['1', '', 'A', '']]],
  ])('%sをrow-order winnerにせずsheetName fallbackにする', async (_label, rows) => {
    const identity = await identityFromWorkbook(rows, 'c_DUPLICATE');
    expect(identity).toEqual({
      key: { legacyId: 'c_DUPLICATE', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: 'A' } },
      captionId: 'cap_67WP1YG84SRWSBFJXWY68ZH03T',
    });
  });

  it('sheet-map row permutationでkeyとIDが変わらない', async () => {
    const rows = [['99', '', 'B', ''], ['0', '', 'A', ''], ['0', '', 'A', '']];
    const first = await identityFromWorkbook(rows, 'c_SYNTH_A');
    const second = await identityFromWorkbook([...rows].reverse(), 'c_SYNTH_A');
    expect(first).toEqual(second);
    expect(first.captionId).toBe('cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40');
  });
});

describe('複数スプレッドシート（実データで判明した問題の回帰テスト）', () => {
  /** 本体とバックアップの2つのxlsxを含むZIP */
  async function makeZipWithBackup(): Promise<Uint8Array> {
    const main = await makeXlsx([
      { name: 'シート1', rows: [CAP_HEADER, ['c_1', '本体の記録', '', '', '1', '1', '1', '', '', '']] },
    ]);
    const backup = await makeXlsx([
      { name: 'シート1', rows: [CAP_HEADER, ['c_1', '古い記録', '', '', '9', '9', '9', '', '', '']] },
    ]);
    return writeZipEntries([
      { path: 'LociMyu Save.xlsx', data: main },
      { path: 'LociMyu Save backup.xlsx', data: backup },
    ]);
  }

  it('複数ある場合は1つだけを採用する（両方取り込むとIDが衝突して所属セットが壊れる）', async () => {
    const plan = await buildImportPlan(await readZipEntries(await makeZipWithBackup()));
    expect(plan.sources).toHaveLength(2);
    expect(plan.sources[plan.selectedSourceIndex]!.fileName).toBe('LociMyu Save.xlsx');
    expect(plan.migration!.sets).toHaveLength(1);
    expect(plan.migration!.sets[0]!.captions[0]!.title).toBe('本体の記録');
    expect(plan.warnings.some((w) => w.includes('2個見つかりました'))).toBe(true);
  });

  it('採用するスプレッドシートを切り替えられる', async () => {
    const plan = await buildImportPlan(await readZipEntries(await makeZipWithBackup()));
    const backupIndex = plan.sources.findIndex((s) => s.looksLikeBackup);
    await selectSource(plan, backupIndex);
    expect(plan.migration!.sets[0]!.captions[0]!.title).toBe('古い記録');
  });

  it('既定候補が不正でも、同じZIP内の正常な候補を自動選択して不正候補を残す', async () => {
    const invalidMain = await makeXlsx([
      {
        name: 'シート1',
        rows: [
          CAP_HEADER,
          ['', 'IDがない行', '', '', '', '', '', '', '', ''],
          ['c_2', '件数を多くする行', '', '', '', '', '', '', '', ''],
        ],
      },
    ]);
    const validBackup = await makeXlsx([
      { name: 'シート1', rows: [CAP_HEADER, ['c_valid', '正常なバックアップ', '', '', '', '', '', '', '', '']] },
    ]);
    const plan = await buildImportPlan(await readZipEntries(await writeZipEntries([
      { path: 'LociMyu Save.xlsx', data: invalidMain },
      { path: 'LociMyu Save backup.xlsx', data: validBackup },
    ])));
    expect(plan.sources).toHaveLength(2);
    expect(plan.sources[plan.selectedSourceIndex]!.fileName).toBe('LociMyu Save backup.xlsx');
    expect(plan.migration!.sets[0]!.captions[0]!.title).toBe('正常なバックアップ');
    expect(plan.warnings.some((warning) => warning.includes('LociMyu Save.xlsx は取り込めませんでした'))).toBe(true);
  });

  it('全候補が不正なerrorは先頭5件と省略件数だけを通常表示へ渡す', async () => {
    const entries = Array.from({ length: 6 }, (_unused, index) => ({
      path: `invalid-${index}.csv`,
      data: captionCsvBytes([['', `invalid ${index}`, '', '', '', '', '', '', '', '']]),
    }));
    const failure = await buildImportPlan(entries).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    for (let index = 0; index < 5; index++) expect(message).toContain(`invalid-${index}.csv`);
    expect(message).not.toContain('invalid-5.csv');
    expect(message).toContain('他1件の候補');
  });

  it('予約シートと完全空行を件数に数えず、実CaptionのあるLociMyu候補をgeneric/空候補より先にする', async () => {
    const emptyCurrent = await makeXlsx([
      {
        name: '__LM_META',
        rows: [CAP_HEADER, ['c_internal', '予約シートの行', '', '', '', '', '', '', '', '']],
      },
      {
        name: '空の現行シート',
        rows: [CAP_HEADER, ...Array.from({ length: 20 }, () => ['\u3000', '', '', '', '', '', '', '', '', ''])],
      },
    ]);
    const populatedBackup = await makeXlsx([
      {
        name: '記録',
        rows: [CAP_HEADER, ['c_valid', '実際の記録', '', '', '', '', '', '', '', '']],
      },
    ]);
    const plan = await buildImportPlan([
      { path: 'unrelated-current.xlsx', data: emptyCurrent },
      { path: 'LociMyu Save backup.xlsx', data: populatedBackup },
      { path: 'unrelated.csv', data: enc.encode('name,value\nfoo,bar\n') },
    ]);

    expect(plan.sources.find((source) => source.fileName === 'unrelated-current.xlsx')!.captionCount).toBe(0);
    expect(plan.sources[plan.selectedSourceIndex]!.fileName).toBe('LociMyu Save backup.xlsx');
    expect(plan.migration!.sets[0]!.captions[0]!.title).toBe('実際の記録');
  });

  it('recognized・実件数・archive順の各比較段を決定的に適用する', async () => {
    const cases: Array<{
      label: string;
      entries: Array<{ path: string; data: Uint8Array }>;
      expected: string;
    }> = [
      {
        label: 'recognized-empty precedes generic',
        entries: [
          { path: 'generic.csv', data: enc.encode('name,value\nfoo,bar\n') },
          { path: 'recognized-empty.csv', data: captionCsvBytes([]) },
        ],
        expected: 'recognized-empty.csv',
      },
      {
        label: 'greater admitted count wins within the same class',
        entries: [
          { path: 'one.csv', data: captionCsvBytes([['c_1', 'one', '', '', '', '', '', '', '', '']]) },
          { path: 'two.csv', data: captionCsvBytes([
            ['c_1', 'one', '', '', '', '', '', '', '', ''],
            ['c_2', 'two', '', '', '', '', '', '', '', ''],
          ]) },
        ],
        expected: 'two.csv',
      },
      {
        label: 'archive order wins an exact tie',
        entries: [
          { path: 'first.csv', data: captionCsvBytes([['c_1', 'first', '', '', '', '', '', '', '', '']]) },
          { path: 'second.csv', data: captionCsvBytes([['c_2', 'second', '', '', '', '', '', '', '', '']]) },
        ],
        expected: 'first.csv',
      },
    ];

    for (const testCase of cases) {
      const plan = await buildImportPlan(testCase.entries);
      expect(plan.sources[plan.selectedSourceIndex]!.fileName, testCase.label).toBe(testCase.expected);
    }
  });

  it.each(['full', 'truncated'] as const)(
    '%s digest collisionを正常な別候補へfall-throughさせない',
    async (collisionKind) => {
      let digestCall = 0;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async () => {
        const digest = new Uint8Array(32);
        if (collisionKind === 'truncated') digest[31] = digestCall++;
        return digest.buffer as ArrayBuffer;
      });
      const collisionCandidate = captionCsvBytes([
        ['c_1', 'one', '', '', '', '', '', '', '', ''],
        ['c_2', 'two', '', '', '', '', '', '', '', ''],
      ]);
      const validAlternate = captionCsvBytes([
        ['c_valid', 'valid', '', '', '', '', '', '', '', ''],
      ]);

      const failure = await buildImportPlan([
        { path: 'collision.csv', data: collisionCandidate },
        { path: 'valid.csv', data: validAlternate },
      ]).then(
        () => null,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE);
      expect((failure as Error & { cause?: Error }).cause?.message).toContain(
        collisionKind === 'full' ? 'full SHA-256 collision' : 'truncated Caption ID collision',
      );
    },
  );

  it('WebCrypto/内部失敗を候補不正へ降格せず、詳細を通常warningへ露出しない', async () => {
    const workbook = await makeXlsx([
      { name: '記録', rows: [CAP_HEADER, ['c_valid', '記録', '', '', '', '', '', '', '', '']] },
    ]);
    const providerFailure = new Error('sensitive provider detail');
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(providerFailure);

    const failure = await buildImportPlan([
      { path: 'LociMyu Save.xlsx', data: workbook },
      { path: 'unrelated.csv', data: enc.encode('name,value\nfoo,bar\n') },
    ]).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE);
    expect((failure as Error).message).not.toContain('sensitive provider detail');
    expect((failure as Error & { cause?: unknown }).cause).toBe(providerFailure);
  });

  it('source切替成功時に現在候補のwarningと使用中ファイル表示を丸ごと置換する', async () => {
    const main = await makeXlsx([
      {
        name: '現行',
        rows: [CAP_HEADER, ['c_main', '現行', '', '', 'x', '1', '2', '', '', '']],
      },
    ]);
    const backup = await makeXlsx([
      {
        name: '旧版',
        rows: [CAP_HEADER, ['c_backup', '旧版', '', '', '1', '2', '3', '', '', '']],
      },
    ]);
    const plan = await buildImportPlan([
      { path: 'LociMyu Save.xlsx', data: main },
      { path: 'LociMyu Save backup.xlsx', data: backup },
    ]);
    expect(plan.diagnostics.selectedSource.some((warning) => warning.includes('「現行」'))).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('「LociMyu Save.xlsx」を使用します'))).toBe(true);

    const backupIndex = plan.sources.findIndex((source) => source.looksLikeBackup);
    await selectSource(plan, backupIndex);

    expect(plan.diagnostics.selectedSource).toEqual([]);
    expect(plan.warnings.some((warning) => warning.includes('「現行」'))).toBe(false);
    expect(plan.warnings.some((warning) => warning.includes('「LociMyu Save backup.xlsx」を使用します'))).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('「LociMyu Save.xlsx」を使用します'))).toBe(false);
  });

  it('source切替はcall-entry snapshotを解析し、失敗時は現在の選択を原子的に保つ', async () => {
    const plan = await buildImportPlan(await readZipEntries(await makeZipWithBackup()));
    const backupIndex = plan.sources.findIndex((source) => source.looksLikeBackup);
    const backup = plan.sources[backupIndex]!;
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      await gate;
      return realDigest(algorithm, data);
    });
    const pending = selectSource(plan, backupIndex);
    backup.tables[0]!.name = 'mutated';
    backup.tables[0]!.rows[1]![0] = 'c_mutated';
    backup.tables[0]!.rows[1]![1] = 'mutated title';
    resume();
    await pending;
    expect(plan.tables[0]!.name).toBe('シート1');
    expect(plan.migration!.sets[0]!.captions[0]!.legacyId).toBe('c_1');
    expect(plan.migration!.sets[0]!.captions[0]!.title).toBe('古い記録');

    vi.restoreAllMocks();
    const selectedIndex = plan.selectedSourceIndex;
    const selectedTables = plan.tables;
    const selectedMigration = plan.migration;
    const warnings = plan.warnings;
    backup.tables[0]!.rows[1]![0] = '';
    await expect(selectSource(plan, backupIndex)).rejects.toThrow('LOCIMYU_ID_MISSING_LEGACY_ID:2');
    expect(plan.selectedSourceIndex).toBe(selectedIndex);
    expect(plan.tables).toBe(selectedTables);
    expect(plan.migration).toBe(selectedMigration);
    expect(plan.warnings).toBe(warnings);
  });
});

describe('gid突合（実データで判明した問題の回帰テスト）', () => {
  it('指数表記のgidでもマテリアルが正しいセットへ割り当てられる', async () => {
    // Google Sheetsのgidはxlsxで指数表記になる（6.17884617E8）。
    // 数値正規化とlegacyGid解決の両方が効かないと、全マテリアルが先頭セットに寄る
    const xlsx = await makeXlsx([
      { name: 'シート1', rows: [CAP_HEADER, ['c_1', 'A', '', '', '0', '0', '0', '', '', '']] },
      { name: '透過用', rows: [CAP_HEADER, ['c_2', 'B', '', '', '1', '1', '1', '', '', '']] },
      {
        name: '__LM_SHEET_NAMES',
        rows: [['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'], ['0', '写真', 'シート1', '']],
      },
      {
        name: '__LM_MATERIALS',
        rows: [
          MAT_HEADER,
          ['Outside', '1', 'false', 'true', 'false', '', '', '', '', '', '', '', '', '0'],
          ['Outside', '0.2', 'false', 'true', 'false', '', '', '', '', '', '', '', '', '617884617'],
        ],
      },
    ]);
    const zip = await writeZipEntries([
      { path: 'save.xlsx', data: xlsx },
      { path: 'model.stl', data: enc.encode('solid s\nendsolid s\n') },
    ]);
    const plan = await buildImportPlan(await readZipEntries(zip));
    expect(plan.migration!.sets[0]!.legacyGid).toBe('0');
    expect(plan.migration!.sets[1]!.legacyGid).toBe('617884617');

    const fs = new MemoryFS();
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    const store = await ProjectStore.open(fs, result.dir, USER);
    const sets = visibleEntities(store.state, 'set');
    const mats = visibleEntities(store.state, 'material');
    expect(mats).toHaveLength(2);
    const setA = sets.find((s) => s.fields.name === 'シート1')!;
    const setB = sets.find((s) => s.fields.name === '透過用')!;
    expect(mats.find((m) => m.fields.setId === setA.id)!.fields.opacity).toBe(1);
    expect(mats.find((m) => m.fields.setId === setB.id)!.fields.opacity).toBe(0.2);
  });

  it('クロマキーは設定値を保持したまま無効で取り込む（LociMyuでは効いていなかったため）', async () => {
    const xlsx = await makeXlsx([
      { name: 'S', rows: [CAP_HEADER, ['c_1', 'A', '', '', '0', '0', '0', '', '', '']] },
      {
        name: '__LM_MATERIALS',
        rows: [
          MAT_HEADER,
          ['Wall', '1', 'false', 'false', 'TRUE', '#ffffff', '1', '0', '', '', '', '', '', '0'],
        ],
      },
    ]);
    const zip = await writeZipEntries([
      { path: 'save.xlsx', data: xlsx },
      { path: 'model.stl', data: enc.encode('solid s\nendsolid s\n') },
    ]);
    const plan = await buildImportPlan(await readZipEntries(zip));
    const fs = new MemoryFS();
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    expect(result.chromaDisabledCount).toBe(1);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const chroma = visibleEntities(store.state, 'material')[0]!.fields.chroma as Record<string, unknown>;
    expect(chroma.enable).toBe(false); // 当時の見え方を保つ
    expect(chroma.color).toBe('#ffffff'); // 値は捨てない
    expect(chroma.tolerance).toBe(1);
  });

  it('unlitLikeはunlitフィールドとして移行される', async () => {
    const xlsx = await makeXlsx([
      { name: 'S', rows: [CAP_HEADER, ['c_1', 'A', '', '', '0', '0', '0', '', '', '']] },
      {
        name: '__LM_MATERIALS',
        rows: [MAT_HEADER, ['Wall', '1', 'false', 'TRUE', 'false', '', '', '', '', '', '', '', '', '0']],
      },
    ]);
    const zip = await writeZipEntries([{ path: 'save.xlsx', data: xlsx }]);
    const plan = await buildImportPlan(await readZipEntries(zip));
    const fs = new MemoryFS();
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    const store = await ProjectStore.open(fs, result.dir, USER);
    expect(visibleEntities(store.state, 'material')[0]!.fields.unlit).toBe(true);
  });
});

describe('applyImportPlan（LociMyu移行）', () => {
  it('セット・キャプション・ビュー・マテリアルを引き継いで新規プロジェクトを作る', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const expectedKiretsuId = plan.migration!.sets[0]!.captions[0]!.captionId;
    const result = await applyImportPlan(fs, USER, plan, { projectName: '現場A（移行）' });

    expect(result.captionCount).toBe(3);
    expect(result.setCount).toBe(2);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const sets = visibleEntities(store.state, 'set');
    expect(sets.map((s) => s.fields.name)).toEqual(['通常表示', '半透明・内部']);

    const captions = visibleEntities(store.state, 'caption');
    expect(captions).toHaveLength(3);
    const kiretsu = captions.find((c) => c.fields.title === '北壁の亀裂')!;
    expect(kiretsu.id).toBe(expectedKiretsuId);
    expect((kiretsu.fields.anchor as { position: number[] }).position).toEqual([1.5, 2, -3]);
    // キャプションは所属セットに正しく割り当てられる
    const setA = sets.find((s) => s.fields.name === '通常表示')!;
    expect(kiretsu.fields.setId).toBe(setA.id);

    const views = visibleEntities(store.state, 'view');
    expect(views).toHaveLength(1);
    expect(views[0]!.fields.name).toBe('全景');
    expect(views[0]!.fields.background).toBe('#202124');

    const materials = visibleEntities(store.state, 'material');
    expect(materials).toHaveLength(1);
    expect(materials[0]!.fields.opacity).toBe(0.4);

    // モデル・画像がアセットとして登記され、実体も保存されている
    const assets = visibleEntities(store.state, 'asset');
    expect(assets.filter((a) => a.fields.kind === 'model')).toHaveLength(1);
    expect(assets.filter((a) => a.fields.kind === 'image')).toHaveLength(2);
    for (const a of assets) {
      expect(await fs.exists(`${result.dir}/${a.fields.path as string}`)).toBe(true);
    }
  });

  it('既定セットは移行セットで置き換えられる（空セットが残らない）', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    const store = await ProjectStore.open(fs, result.dir, USER);
    expect(visibleEntities(store.state, 'set').map((s) => s.fields.name)).not.toContain('標準');
  });

  it('fileId対応表があれば画像を自動リンクする', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip({ withFileIdMap: true })));
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    expect(result.linkedImages).toBe(1);
    expect(result.unlinkedImages).toBe(0);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const kiretsu = visibleEntities(store.state, 'caption').find((c) => c.fields.title === '北壁の亀裂')!;
    const attachments = kiretsu.fields.attachments as string[];
    expect(attachments).toHaveLength(1);
    const asset = store.state.byKind.asset![attachments[0]!]!;
    expect(asset.fields.originalName).toBe('kiretsu_01.jpg');
  });

  it('手動リンクで画像を結び付けられる', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const captionId = plan.migration!.sets[0]!.captions[0]!.captionId;
    const links = new Map([[captionId, 'kiso.png']]);
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p', imageLinks: links });
    expect(result.linkedImages).toBe(1);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const cap = store.state.byKind.caption![captionId]!;
    const astId = (cap.fields.attachments as string[])[0]!;
    expect(store.state.byKind.asset![astId]!.fields.originalName).toBe('kiso.png');
  });

  it('未リンク画像は legacyImageFileId を保持し、後から解決できる', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const captionId = plan.migration!.sets[0]!.captions[0]!.captionId;
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    expect(result.unlinkedImages).toBe(1);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const cap = store.state.byKind.caption![captionId]!;
    expect(cap.fields.legacyImageFileId).toBe('DRIVEID_A');
  });

  it('同じZIPを二度移行してもキャプションIDが一致する（重複しない）', async () => {
    const fs1 = new MemoryFS();
    const fs2 = new MemoryFS();
    const zip = await makeDriveZip();
    const r1 = await applyImportPlan(fs1, USER, await buildImportPlan(await readZipEntries(zip)), { projectName: 'p1' });
    const r2 = await applyImportPlan(fs2, USER, await buildImportPlan(await readZipEntries(zip)), { projectName: 'p2' });
    const s1 = await ProjectStore.open(fs1, r1.dir, USER);
    const s2 = await ProjectStore.open(fs2, r2.dir, USER);
    const ids1 = visibleEntities(s1.state, 'caption').map((c) => c.id).sort();
    const ids2 = visibleEntities(s2.state, 'caption').map((c) => c.id).sort();
    expect(ids1).toEqual(ids2);
  });

  it('移行後のプロジェクトは通常どおりZIP往復できる', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const result = await applyImportPlan(fs, USER, plan, { projectName: '移行済み' });
    const store = await ProjectStore.open(fs, result.dir, USER);

    const { exportProjectZip, inspectZip, importNewProject } = await import('../../src/assets/package');
    const zip = await exportProjectZip(fs, result.dir, store);
    const fs2 = new MemoryFS();
    await importNewProject(fs2, 'projects/re', await inspectZip(zip));
    const store2 = await ProjectStore.open(fs2, 'projects/re', USER);
    expect(store2.state).toEqual(store.state);
  });

  it('preview migrationを改変されてもselected raw tablesからcanonical IDを再構築する', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const canonicalId = plan.migration!.sets[0]!.captions[0]!.captionId;
    plan.migration!.sets[0]!.captions[0]!.captionId = 'cap_00000000000000000000000000';
    plan.migration!.sets[0]!.captions[0]!.identity.captionId = 'cap_00000000000000000000000000';
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'preview tamper' });
    const store = await ProjectStore.open(fs, result.dir, USER);
    expect(visibleEntities(store.state, 'caption').some((caption) => caption.id === canonicalId)).toBe(true);
    expect(store.state.byKind.caption?.cap_00000000000000000000000000).toBeUndefined();
  });

  it('apply call-entry後のtable・asset mutationを遮断する', async () => {
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const canonicalId = plan.migration!.sets[0]!.captions[0]!.captionId;
    const originalModelBytes = new Uint8Array(plan.models[0]!.data);
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      await gate;
      return realDigest(algorithm, data);
    });
    const fs = new MemoryFS();
    const pending = applyImportPlan(fs, USER, plan, { projectName: 'snapshot' });
    const selected = plan.sources[plan.selectedSourceIndex]!;
    selected.tables[0]!.name = 'mutated sheet';
    selected.tables[0]!.rows[1]![0] = 'c_mutated';
    selected.tables[0]!.rows[1]![1] = 'mutated title';
    plan.models[0]!.name = 'mutated.stl';
    plan.models[0]!.data.fill(0x6d);
    resume();
    const result = await pending;
    const store = await ProjectStore.open(fs, result.dir, USER);
    const caption = store.state.byKind.caption![canonicalId]!;
    expect(caption.fields.title).toBe('北壁の亀裂');
    const model = visibleEntities(store.state, 'asset').find((asset) => asset.fields.kind === 'model')!;
    expect(model.fields.originalName).toBe('site.stl');
    expect(await fs.readBytes(`${result.dir}/${model.fields.path as string}`)).toEqual(originalModelBytes);
  });

  it('raw tableのidentity preflight失敗時はworkspace・plan・map・buffersを一切変えない', async () => {
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip({ withFileIdMap: true })));
    const migration = plan.migration;
    const fileIdMap = plan.fileIdMap;
    const modelData = plan.models[0]!.data;
    const imageData = plan.images[0]!.data;
    const modelBytes = new Uint8Array(modelData);
    const imageBytes = new Uint8Array(imageData);
    plan.tables[0]!.rows[1]![0] = '';
    const fs = new MemoryFS();
    await expect(applyImportPlan(fs, USER, plan, { projectName: 'invalid' }))
      .rejects.toThrow('LOCIMYU_ID_MISSING_LEGACY_ID:2');
    expect(await fs.list('')).toEqual([]);
    expect(plan.migration).toBe(migration);
    expect(plan.fileIdMap).toBe(fileIdMap);
    expect(plan.fileIdMap.get('DRIVEID_A')).toBe('kiretsu_01.jpg');
    expect(plan.models[0]!.data).toBe(modelData);
    expect(plan.images[0]!.data).toBe(imageData);
    expect(plan.models[0]!.data).toEqual(modelBytes);
    expect(plan.images[0]!.data).toEqual(imageBytes);
  });

  it('crypto collision時もworkspace write 0件でcaller buffersを保持する', async () => {
    const xlsx = await makeXlsx([
      {
        name: 'A',
        rows: [
          CAP_HEADER,
          ['c_1', 'one', '', '', '', '', '', '', '', ''],
          ['c_2', 'two', '', '', '', '', '', '', '', ''],
        ],
      },
    ]);
    const plan = await buildImportPlan(await readZipEntries(await writeZipEntries([
      { path: 'raw.xlsx', data: xlsx },
      { path: 'model.stl', data: enc.encode('solid s\nendsolid s\n') },
    ])));
    const migration = plan.migration;
    const modelData = plan.models[0]!.data;
    const modelBytes = new Uint8Array(modelData);
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer as ArrayBuffer);
    const fs = new MemoryFS();
    const failure = await applyImportPlan(fs, USER, plan, { projectName: 'collision' }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(IMPORT_SOURCE_ANALYSIS_FAILURE_NOTICE);
    expect((failure as Error & { cause?: Error }).cause?.message).toContain('full SHA-256 collision');
    expect(await fs.list('')).toEqual([]);
    expect(plan.migration).toBe(migration);
    expect(plan.models[0]!.data).toBe(modelData);
    expect(plan.models[0]!.data).toEqual(modelBytes);
  });

  it('identity planningのpreimageとfull digestをproject state/logへ永続化しない', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const forbiddenDigest = hex(plan.migration!.sets[0]!.captions[0]!.identity.fullDigest);
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'no identity internals' });
    const storedText = (await Promise.all((await fs.list(result.dir)).map(async (path) =>
      await fs.readText(path) ?? '',
    ))).join('\n');
    expect(storedText).not.toContain('lociview:v1:locimyu-caption-id:2:jcs-v1');
    expect(storedText).not.toContain(forbiddenDigest);
  });
});
