import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCIMYU_CAPTION_ID_RECIPE,
  LOCIMYU_SOURCE_RETENTION_NOTICE,
  analyzeLociMyuSheets,
  isLociMyuCaptionSheet,
  lociMyuTrimV1,
  planLociMyuCaptionIdentity,
  projectLociMyuCaptionSheetIdentities,
  type LociMyuCaptionIdentityKeyV2,
  type SheetTable,
} from '../../src/io/locimyu';

const CAP_HEADER = ['id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt'];

function captionSheet(name: string, gid: string, rows: string[][]): SheetTable {
  return { name, gid, rows: [CAP_HEADER, ...rows] };
}

function sheetNames(rows: string[][]): SheetTable {
  return {
    name: '__LM_SHEET_NAMES',
    rows: [['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'], ...rows],
  };
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('locimyu-caption-id-2', () => {
  const vectors: Array<{
    key: LociMyuCaptionIdentityKeyV2;
    canonicalKey: string;
    digest: string;
    captionId: string;
  }> = [
    {
      key: { legacyId: 'c_SYNTH_A', occurrence: 0, sheetIdentity: { kind: 'legacyGid', value: '0' } },
      canonicalKey: '{"legacyId":"c_SYNTH_A","occurrence":0,"sheetIdentity":{"kind":"legacyGid","value":"0"}}',
      digest: '1ade732327636cadb583f4e621f3c880e14d093ec00523b35cafee626bbc3309',
      captionId: 'cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40',
    },
    {
      key: { legacyId: 'c_SYNTH_B', occurrence: 0, sheetIdentity: { kind: 'legacyGid', value: '617884617' } },
      canonicalKey: '{"legacyId":"c_SYNTH_B","occurrence":0,"sheetIdentity":{"kind":"legacyGid","value":"617884617"}}',
      digest: '8b53b92ddf5babd667d6221b89f8336bc44c2ad204c8826c05904500180fc582',
      captionId: 'cap_4BAEWJVQTVNFB6FNH23E4ZGCVB',
    },
    {
      key: { legacyId: 'c_DUPLICATE', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: 'A' } },
      canonicalKey: '{"legacyId":"c_DUPLICATE","occurrence":0,"sheetIdentity":{"kind":"sheetName","value":"A"}}',
      digest: 'c7e583e82099c732b7cbbcf191f8807a46cc86e3ce6e64cf20b09b35fdb7a12f',
      captionId: 'cap_67WP1YG84SRWSBFJXWY68ZH03T',
    },
    {
      key: { legacyId: 'c_DUPLICATE', occurrence: 1, sheetIdentity: { kind: 'sheetName', value: 'A' } },
      canonicalKey: '{"legacyId":"c_DUPLICATE","occurrence":1,"sheetIdentity":{"kind":"sheetName","value":"A"}}',
      digest: '0c45adbf105b9ad551c6cdbe44931d193f51e8d93ac5db99f1450c6b23caeba2',
      captionId: 'cap_0C8PPVY42VKBAN3HPDQS29678S',
    },
    {
      key: { legacyId: 'c_DUPLICATE', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: 'B' } },
      canonicalKey: '{"legacyId":"c_DUPLICATE","occurrence":0,"sheetIdentity":{"kind":"sheetName","value":"B"}}',
      digest: 'f88081b973a362541b0629581f218f00e2f04b12598de9966d524b744799080d',
      captionId: 'cap_7RG20VJWX3C9A1P1H9B0FJ33R0',
    },
    {
      key: { legacyId: 'c_合成', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: '写真' } },
      canonicalKey: '{"legacyId":"c_合成","occurrence":0,"sheetIdentity":{"kind":"sheetName","value":"写真"}}',
      digest: '71c01b3b6f58926b2fe975262481405b34ab8d264b9fdfa1582884383d90d993',
      captionId: 'cap_3HR0DKPVTRJ9NJZTBN4RJ82G2V',
    },
  ];

  it('批准済み6ベクトルのpreimage・SHA-256・Caption IDを再現する', async () => {
    for (const vector of vectors) {
      const plan = await planLociMyuCaptionIdentity(vector.key);
      const expectedPreimage = `lociview:v1:locimyu-caption-id:2:jcs-v1\n${vector.canonicalKey}`;
      expect(plan.recipeId).toBe(LOCIMYU_CAPTION_ID_RECIPE);
      expect(plan.key).toEqual(vector.key);
      expect(plan.preimage).toBe(expectedPreimage);
      expect(Array.from(plan.preimageBytes)).toEqual(Array.from(new TextEncoder().encode(expectedPreimage)));
      expect(hex(plan.fullDigest)).toBe(vector.digest);
      expect(plan.captionId).toBe(vector.captionId);
    }
  });

  it('暫定フローの元ZIP保管制限を一般利用者向け文言で固定する', () => {
    expect(LOCIMYU_SOURCE_RETENTION_NOTICE).toContain('元のLociMyu ZIP');
    expect(LOCIMYU_SOURCE_RETENTION_NOTICE).toContain('別に保管');
    expect(LOCIMYU_SOURCE_RETENTION_NOTICE).toContain('元ZIPのバックアップにはなりません');
  });

  it('restricted JCSのfield順・escape・UTF-8・最大safe integerを固定する', async () => {
    const plan = await planLociMyuCaptionIdentity({
      legacyId: 'c_"\\\u0001合',
      occurrence: Number.MAX_SAFE_INTEGER,
      sheetIdentity: { kind: 'sheetName', value: '写"\\真' },
    });
    const canonicalKey = String.raw`{"legacyId":"c_\"\\\u0001合","occurrence":9007199254740991,"sheetIdentity":{"kind":"sheetName","value":"写\"\\真"}}`;
    const expected = `lociview:v1:locimyu-caption-id:2:jcs-v1\n${canonicalKey}`;
    expect(plan.preimage).toBe(expected);
    expect(Array.from(plan.preimageBytes)).toEqual(Array.from(new TextEncoder().encode(expected)));
  });

  it('LociMyuTrimV1の全境界だけを両端から除き、内部と対象外文字を保つ', () => {
    const trimCodes = [
      ...Array.from({ length: 5 }, (_, index) => 0x0009 + index),
      0x0020, 0x00a0, 0x1680,
      ...Array.from({ length: 11 }, (_, index) => 0x2000 + index),
      0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
    ];
    for (const code of trimCodes) {
      const edge = String.fromCodePoint(code);
      expect(lociMyuTrimV1(`${edge}値${edge}`)).toBe('値');
      expect(lociMyuTrimV1(`前${edge}後`)).toBe(`前${edge}後`);
    }
    for (const code of [0x0085, 0x180e, 0x200b]) {
      const excluded = String.fromCodePoint(code);
      expect(lociMyuTrimV1(`${excluded}値${excluded}`)).toBe(`${excluded}値${excluded}`);
    }
  });

  it('NFC/NFDを正規化せず、異なるpreimageとIDにする', async () => {
    const nfc = await planLociMyuCaptionIdentity({
      legacyId: 'c_é', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: 'A' },
    });
    const nfd = await planLociMyuCaptionIdentity({
      legacyId: 'c_e\u0301', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: 'A' },
    });
    expect(nfc.preimage).not.toBe(nfd.preimage);
    expect(nfc.captionId).not.toBe(nfd.captionId);
  });

  it('Unicode scalar数とoccurrenceの批准済み境界を検証する', async () => {
    const base = { occurrence: 0, sheetIdentity: { kind: 'sheetName' as const, value: 'A' } };
    await expect(planLociMyuCaptionIdentity({ ...base, legacyId: '😀'.repeat(128) })).resolves.toBeDefined();
    await expect(planLociMyuCaptionIdentity({ ...base, legacyId: '😀'.repeat(129) })).rejects.toThrow(/128 Unicode scalars/);
    await expect(planLociMyuCaptionIdentity({ legacyId: 'c', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: '😀'.repeat(256) } })).resolves.toBeDefined();
    await expect(planLociMyuCaptionIdentity({ legacyId: 'c', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: '😀'.repeat(257) } })).rejects.toThrow(/256 Unicode scalars/);
    await expect(planLociMyuCaptionIdentity({ legacyId: 'c_\ud800', ...base })).rejects.toThrow(/lone surrogate/);
    await expect(planLociMyuCaptionIdentity({ legacyId: 'c', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: '\udc00' } })).rejects.toThrow(/lone surrogate/);
    await expect(planLociMyuCaptionIdentity({ legacyId: 'c', occurrence: Number.MAX_SAFE_INTEGER, sheetIdentity: { kind: 'sheetName', value: 'A' } })).resolves.toBeDefined();
    for (const occurrence of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(planLociMyuCaptionIdentity({ legacyId: 'c', occurrence, sheetIdentity: { kind: 'sheetName', value: 'A' } })).rejects.toThrow(/occurrence/);
    }
  });

  it('SHA providerの拒否・型違い・長さ違いをfallbackせず拒否する', async () => {
    const key: LociMyuCaptionIdentityKeyV2 = {
      legacyId: 'c', occurrence: 0, sheetIdentity: { kind: 'sheetName', value: 'A' },
    };
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(planLociMyuCaptionIdentity(key)).rejects.toThrow('provider unavailable');
    vi.restoreAllMocks();
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValueOnce(new Uint8Array(32) as unknown as ArrayBuffer);
    await expect(planLociMyuCaptionIdentity(key)).rejects.toThrow(/non-ArrayBuffer/);
    vi.restoreAllMocks();
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValueOnce(new Uint8Array(31).buffer as ArrayBuffer);
    await expect(planLociMyuCaptionIdentity(key)).rejects.toThrow(/31 bytes/);
  });

  it('異なるkeyのfull SHA-256 collisionを拒否する', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer as ArrayBuffer);
    await expect(analyzeLociMyuSheets([
      captionSheet('A', '1', [
        ['c_1', 'one', '', '', '', '', '', '', '', ''],
        ['c_2', 'two', '', '', '', '', '', '', '', ''],
      ]),
    ])).rejects.toThrow(/full SHA-256 collision/);
  });

  it('異なるfull digestの先頭128-bit collisionを拒否する', async () => {
    let call = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async () => {
      const digest = new Uint8Array(32);
      digest.fill(0x5a, 0, 16);
      digest[31] = call++;
      return digest.buffer as ArrayBuffer;
    });
    await expect(analyzeLociMyuSheets([
      captionSheet('A', '1', [
        ['c_1', 'one', '', '', '', '', '', '', '', ''],
        ['c_2', 'two', '', '', '', '', '', '', '', ''],
      ]),
    ])).rejects.toThrow(/truncated Caption ID collision/);
  });

  it('digest待機中にcallerのkeyやtableが変わってもcall-entry snapshotだけを使う', async () => {
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      await gate;
      return realDigest(algorithm, data);
    });
    const tables = [captionSheet('A', '1', [
      ['c_1', 'one', '', '', '', '', '', '', '', ''],
      ['c_2', 'two', '', '', '', '', '', '', '', ''],
    ])];
    const pending = analyzeLociMyuSheets(tables);
    tables[0]!.name = 'mutated';
    tables[0]!.rows[1]![0] = 'c_mutated';
    tables[0]!.rows[2]![1] = 'mutated title';
    resume();
    const migration = await pending;
    expect(migration.sets[0]!.name).toBe('A');
    expect(migration.sets[0]!.captions.map((caption) => [caption.legacyId, caption.title])).toEqual([
      ['c_1', 'one'],
      ['c_2', 'two'],
    ]);
  });
});

describe('LociMyu Caption identity source authority', () => {
  it('同一sheet内と別sheetの重複legacy IDをoccurrence別の批准済みIDにする', async () => {
    const migration = await analyzeLociMyuSheets([
      captionSheet('A', '1', [
        ['c_DUPLICATE', 'A0', '', '', '', '', '', '', '', ''],
        ['c_OTHER', 'other', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['c_DUPLICATE', 'A1', '', '', '', '', '', '', '', ''],
      ]),
      captionSheet('B', '2', [['c_DUPLICATE', 'B0', '', '', '', '', '', '', '', '']]),
    ]);
    expect(migration.sets.flatMap((set) => set.captions)
      .filter((caption) => caption.legacyId === 'c_DUPLICATE')
      .map((caption) => caption.captionId)).toEqual([
      'cap_67WP1YG84SRWSBFJXWY68ZH03T',
      'cap_0C8PPVY42VKBAN3HPDQS29678S',
      'cap_7RG20VJWX3C9A1P1H9B0FJ33R0',
    ]);
  });

  it('別ID行の並べ替えでは重複IDのidentityが変わらない', async () => {
    const rowsA = [
      ['c_DUPLICATE', 'first', '', '', '', '', '', '', '', ''],
      ['c_OTHER', 'other', '', '', '', '', '', '', '', ''],
      ['c_DUPLICATE', 'second', '', '', '', '', '', '', '', ''],
    ];
    const rowsB = [rowsA[1]!, rowsA[0]!, rowsA[2]!];
    const first = await analyzeLociMyuSheets([captionSheet('A', '1', rowsA)]);
    const second = await analyzeLociMyuSheets([captionSheet('A', '1', rowsB)]);
    const duplicateIds = (migration: Awaited<ReturnType<typeof analyzeLociMyuSheets>>) =>
      migration.sets[0]!.captions.filter((caption) => caption.legacyId === 'c_DUPLICATE')
        .map((caption) => caption.captionId);
    expect(duplicateIds(first)).toEqual(duplicateIds(second));
  });

  it('exact duplicate map pairはdedupeし、exact GIDをidentityにする', async () => {
    const table = captionSheet('A', '1', [['c_SYNTH_A', 'A', '', '', '', '', '', '', '', '']]);
    const map = sheetNames([['0', '', 'A', ''], ['0', '', 'A', '']]);
    const projection = projectLociMyuCaptionSheetIdentities([table, map]);
    expect(projection.get(table)).toEqual({ kind: 'legacyGid', value: '0' });
    const migration = await analyzeLociMyuSheets([table, map]);
    expect(migration.sets[0]!.captions[0]!.captionId).toBe('cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40');
  });

  it.each([
    ['mappingなし', []],
    ['incomplete GID taint', [['0', '', '', ''], ['0', '', 'A', '']]],
    ['incomplete title taint', [['', '', 'A', ''], ['0', '', 'A', '']]],
    ['GIDからtitleのforward conflict', [['0', '', 'A', ''], ['0', '', 'B', '']]],
    ['titleからGIDのreverse conflict', [['0', '', 'A', ''], ['1', '', 'A', '']]],
  ])('%s はsheetName fallbackにする', async (_label, rows) => {
    const table = captionSheet('A', '1', [['c_1', 'A', '', '', '', '', '', '', '', '']]);
    const tables = rows.length === 0 ? [table] : [table, sheetNames(rows)];
    const migration = await analyzeLociMyuSheets(tables);
    expect(migration.sets[0]!.captions[0]!.identity.key.sheetIdentity).toEqual({ kind: 'sheetName', value: 'A' });
  });

  it('map row順を変えてもauthority keyと最終IDが変わらない', async () => {
    const mapRows = [['99', '', 'B', ''], ['0', '', 'A', ''], ['0', '', 'A', '']];
    const analyze = (rows: string[][]) => analyzeLociMyuSheets([
      captionSheet('A', '1', [['c_SYNTH_A', 'A', '', '', '', '', '', '', '', '']]),
      sheetNames(rows),
    ]);
    const first = await analyze(mapRows);
    const second = await analyze([...mapRows].reverse());
    expect(first.sets[0]!.captions[0]!.identity.key).toEqual(second.sets[0]!.captions[0]!.identity.key);
    expect(first.sets[0]!.captions[0]!.captionId).toBe(second.sets[0]!.captions[0]!.captionId);
  });

  it('trim後に同名となるCaption sheetsを曖昧なfallbackとして拒否する', async () => {
    await expect(analyzeLociMyuSheets([
      captionSheet('A', '1', [['c_1', 'one', '', '', '', '', '', '', '', '']]),
      captionSheet('\u3000A\u00a0', '2', [['c_2', 'two', '', '', '', '', '', '', '', '']]),
    ])).rejects.toThrow('LOCIMYU_ID_NON_UNIQUE_SHEET_NAME');
  });

  it('空白だけの完全空行は無視し、その他のmissing/over-limit IDを全体拒否する', async () => {
    const accepted = await analyzeLociMyuSheets([
      captionSheet('A', '1', [['\u3000', '\u00a0', '', '', '', '', '', '', '', ''], ['c_1', 'one', '', '', '', '', '', '', '', '']]),
    ]);
    expect(accepted.sets[0]!.captions).toHaveLength(1);
    await expect(analyzeLociMyuSheets([
      captionSheet('A', '1', [['', 'nonempty', '', '', '', '', '', '', '', '']]),
    ])).rejects.toThrow('LOCIMYU_ID_MISSING_LEGACY_ID:2');
    await expect(analyzeLociMyuSheets([
      captionSheet('A', '1', [['x'.repeat(129), 'too long', '', '', '', '', '', '', '', '']]),
    ])).rejects.toThrow(/128 Unicode scalars/);
  });
});

describe('isLociMyuCaptionSheet', () => {
  it('ヘッダでLociMyu形式を判定する', () => {
    expect(isLociMyuCaptionSheet([CAP_HEADER])).toBe(true);
    expect(isLociMyuCaptionSheet([['ID', 'Title', 'Body', 'Color', 'PosX', 'PosY', 'PosZ']])).toBe(true);
    expect(isLociMyuCaptionSheet([['名前', '住所']])).toBe(false);
    expect(isLociMyuCaptionSheet([])).toBe(false);
  });
});

describe('analyzeLociMyuSheets', () => {
  it('キャプションシート1枚 → 表示セット1つに変換する', async () => {
    const m = await analyzeLociMyuSheets([
      captionSheet('半透明・内部指摘用', '111', [
        ['c_a1', '北壁の亀裂', '幅3mm', '#eab308', '1.5', '2', '-3', 'drive_img_1', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'],
        ['c_a2', '基礎の露出', '', '#f87171', '0', '0', '0', '', '', ''],
      ]),
    ]);
    expect(m.sets).toHaveLength(1);
    expect(m.sets[0]!.name).toBe('半透明・内部指摘用');
    expect(m.sets[0]!.captions).toHaveLength(2);
    const first = m.sets[0]!.captions[0]!;
    expect(first.title).toBe('北壁の亀裂');
    expect(first.position).toEqual([1.5, 2, -3]);
    expect(first.color).toBe('#eab308');
    expect(first.identity.key).toEqual({
      legacyId: 'c_a1',
      occurrence: 0,
      sheetIdentity: { kind: 'sheetName', value: '半透明・内部指摘用' },
    });
    expect(first.captionId).toMatch(/^cap_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  });

  it('複数シート → 複数セット（見え方セット運用の継承）', async () => {
    const m = await analyzeLociMyuSheets([
      captionSheet('通常表示', '1', [['c_1', 'A', '', '', '0', '0', '0', '', '', '']]),
      captionSheet('半透明', '2', [['c_2', 'B', '', '', '1', '1', '1', '', '', '']]),
    ]);
    expect(m.sets.map((s) => s.name)).toEqual(['通常表示', '半透明']);
  });

  it('ソフト削除された空行をスキップする', async () => {
    const m = await analyzeLociMyuSheets([
      captionSheet('S', '1', [
        ['c_1', 'A', '', '', '0', '0', '0', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['c_3', 'C', '', '', '1', '1', '1', '', '', ''],
      ]),
    ]);
    expect(m.sets[0]!.captions.map((c) => c.title)).toEqual(['A', 'C']);
  });

  it('__LM_VIEWS を解析し、__last行は「前回の視点」として移行する', async () => {
    const viewsHeader = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
    const m = await analyzeLociMyuSheets([
      captionSheet('S', '77', [['c_1', 'A', '', '', '0', '0', '0', '', '', '']]),
      {
        name: '__LM_VIEWS',
        gid: '9',
        rows: [
          viewsHeader,
          ['v_1', '77', '全景', '#202124', 'perspective', '1', '2', '3', '0', '0', '0', '0', '1', '0', '50', '', ''],
          ['v_2', '77', '__last', '', 'perspective', '9', '9', '9', '0', '0', '0', '0', '1', '0', '45', '', ''],
          ['v_3', '77', '正面', '', 'orthographic', '0', '0', '5', '0', '0', '0', '0', '1', '0', '45', '', ''],
        ],
      },
    ]);
    // 実データ（ki84）では名前付きビューが存在せず __last のみだった。
    // __last は「そのシートで最後に見ていた視点」であり、移行する価値がある
    expect(m.views.map((v) => v.name)).toEqual(['全景', '前回の視点', '正面']);
    expect(m.views[0]!.cameraState.eye).toEqual([1, 2, 3]);
    expect(m.views[0]!.cameraState.fov).toBe(50);
    expect(m.views[0]!.bgColor).toBe('#202124');
    expect(m.views[2]!.cameraState.ortho).toBe(true);
    expect(m.views[0]!.sheetGid).toBe('77');
  });

  it('__LM_SHEET_NAMES があればgid対応を確定できる', async () => {
    const viewsHeader = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
    const m = await analyzeLociMyuSheets([
      captionSheet('シート1', '1', [['c_1', 'A', '', '', '0', '0', '0', '', '', '']]),
      captionSheet('透過用', '2', [['c_2', 'B', '', '', '1', '1', '1', '', '', '']]),
      {
        name: '__LM_SHEET_NAMES',
        gid: '3',
        rows: [
          ['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'],
          ['0', '写真確認', 'シート1', ''],
        ],
      },
      {
        name: '__LM_VIEWS',
        gid: '4',
        rows: [
          viewsHeader,
          ['v_1', '0', '__last', '', 'perspective', '1', '1', '1', '0', '0', '0', '0', '1', '0', '45', '', ''],
          ['v_2', '999888', '__last', '', 'perspective', '2', '2', '2', '0', '0', '0', '0', '1', '0', '45', '', ''],
        ],
      },
    ]);
    // gid=0 は対応表から確定、999888 は残ったセットへ推定割り当て
    expect(m.sets[0]!.legacyGid).toBe('0');
    expect(m.sets[1]!.legacyGid).toBe('999888');
    expect(m.gidMappingIsGuess).toBe(true);
    expect(m.gidToSetName.get('0')).toBe('シート1');
    expect(m.gidToSetName.get('999888')).toBe('透過用');
  });

  it('空欄の数値列は既定値になる（Number("")=0 で潰れないこと）', async () => {
    // 実データではfov列が空欄で、これが0になると平行投影のfrustumが潰れて何も映らなくなった
    const viewsHeader = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
    const m = await analyzeLociMyuSheets([
      captionSheet('S', '1', [['c_1', 'A', '', '', '0', '0', '0', '', '', '']]),
      {
        name: '__LM_VIEWS',
        gid: '2',
        rows: [
          viewsHeader,
          ['v_1', '0', '__last', '', 'orthographic', '1', '2', '3', '0', '0', '0', '', '', '', '', '', ''],
        ],
      },
    ]);
    expect(m.views[0]!.cameraState.fov).toBe(45); // 空欄 → 既定値
    expect(m.views[0]!.cameraState.up).toEqual([0, 1, 0]); // 空欄 → Y-up
  });

  it('__LM_SHEET_NAMES / __LM_META は警告対象にしない', async () => {
    const m = await analyzeLociMyuSheets([
      captionSheet('S', '1', [['c_1', 'A', '', '', '0', '0', '0', '', '', '']]),
      { name: '__LM_SHEET_NAMES', gid: '2', rows: [['sheetGid', 'displayName']] },
      { name: '__LM_META', gid: '3', rows: [['key', 'value'], ['glbFileId', 'xyz']] },
    ]);
    expect(m.warnings).toHaveLength(0);
  });

  it('__LM_MATERIALS はappend-onlyの最終行が有効', async () => {
    const matHeader = ['materialKey', 'opacity', 'doubleSided', 'unlitLike', 'chromaEnable', 'chromaColor', 'chromaTolerance', 'chromaFeather', 'roughness', 'metalness', 'emissiveHex', 'updatedAt', 'updatedBy', 'sheetGid'];
    const m = await analyzeLociMyuSheets([
      captionSheet('S', '55', [['c_1', 'A', '', '', '0', '0', '0', '', '', '']]),
      {
        name: '__LM_MATERIALS',
        gid: '8',
        rows: [
          matHeader,
          ['Wall', '1', 'false', 'false', 'false', '', '', '', '', '', '', '', '', '55'],
          ['Wall', '0.35', 'true', 'true', 'false', '', '', '', '', '', '', '', '', '55'],
          ['Glass', '0.8', 'false', 'false', 'TRUE', '#00ff00', '0.2', '0.05', '', '', '', '', '', '55'],
        ],
      },
    ]);
    expect(m.materials).toHaveLength(2);
    const wall = m.materials.find((x) => x.materialKey === 'Wall')!;
    expect(wall.opacity).toBe(0.35); // 最終行が勝つ
    expect(wall.doubleSided).toBe(true);
    expect(wall.unlitLike).toBe(true);
    const glass = m.materials.find((x) => x.materialKey === 'Glass')!;
    expect(glass.chroma).toEqual({ enable: true, color: '#00ff00', tolerance: 0.2, feather: 0.05 });
  });

  it('imageFileId参照を未リンクとして集計する', async () => {
    const m = await analyzeLociMyuSheets([
      captionSheet('S', '1', [
        ['c_1', 'A', '', '', '0', '0', '0', 'img_X', '', ''],
        ['c_2', 'B', '', '', '0', '0', '0', 'img_X', '', ''],
        ['c_3', 'C', '', '', '0', '0', '0', 'img_Y', '', ''],
      ]),
    ]);
    expect(m.unlinkedImages.size).toBe(2);
    expect(m.unlinkedImages.get('img_X')).toHaveLength(2);
  });

  it('LociMyu形式でないシートは警告してスキップする', async () => {
    const m = await analyzeLociMyuSheets([
      { name: '経費精算', gid: '1', rows: [['日付', '金額'], ['5/1', '1000']] },
    ]);
    expect(m.sets).toHaveLength(0);
    expect(m.warnings.some((w) => w.includes('経費精算'))).toBe(true);
  });
});
