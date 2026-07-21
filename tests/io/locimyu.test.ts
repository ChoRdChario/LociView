import { describe, expect, it } from 'vitest';
import {
  analyzeLociMyuSheets,
  isLociMyuCaptionSheet,
  legacyCaptionId,
  type SheetTable,
} from '../../src/io/locimyu';

const CAP_HEADER = ['id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt'];

function captionSheet(name: string, gid: string, rows: string[][]): SheetTable {
  return { name, gid, rows: [CAP_HEADER, ...rows] };
}

describe('legacyCaptionId', () => {
  it('決定的で、異なる旧idからは異なるIDになる', () => {
    expect(legacyCaptionId('c_abc123')).toBe(legacyCaptionId('c_abc123'));
    expect(legacyCaptionId('c_abc123')).not.toBe(legacyCaptionId('c_abc124'));
    expect(legacyCaptionId('c_abc123')).toMatch(/^cap_LM[0-9A-Z]+$/);
  });

  it('200件規模で衝突しない', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) ids.add(legacyCaptionId(`c_${i.toString(36)}${i * 7}`));
    expect(ids.size).toBe(500);
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
  it('キャプションシート1枚 → 表示セット1つに変換する', () => {
    const m = analyzeLociMyuSheets([
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
    expect(first.captionId).toBe(legacyCaptionId('c_a1'));
  });

  it('複数シート → 複数セット（見え方セット運用の継承）', () => {
    const m = analyzeLociMyuSheets([
      captionSheet('通常表示', '1', [['c_1', 'A', '', '', '0', '0', '0', '', '', '']]),
      captionSheet('半透明', '2', [['c_2', 'B', '', '', '1', '1', '1', '', '', '']]),
    ]);
    expect(m.sets.map((s) => s.name)).toEqual(['通常表示', '半透明']);
  });

  it('ソフト削除された空行をスキップする', () => {
    const m = analyzeLociMyuSheets([
      captionSheet('S', '1', [
        ['c_1', 'A', '', '', '0', '0', '0', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['c_3', 'C', '', '', '1', '1', '1', '', '', ''],
      ]),
    ]);
    expect(m.sets[0]!.captions.map((c) => c.title)).toEqual(['A', 'C']);
  });

  it('__LM_VIEWS を解析し、__last行は「前回の視点」として移行する', () => {
    const viewsHeader = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
    const m = analyzeLociMyuSheets([
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

  it('__LM_SHEET_NAMES があればgid対応を確定できる', () => {
    const viewsHeader = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
    const m = analyzeLociMyuSheets([
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

  it('空欄の数値列は既定値になる（Number("")=0 で潰れないこと）', () => {
    // 実データではfov列が空欄で、これが0になると平行投影のfrustumが潰れて何も映らなくなった
    const viewsHeader = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
    const m = analyzeLociMyuSheets([
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

  it('__LM_SHEET_NAMES / __LM_META は警告対象にしない', () => {
    const m = analyzeLociMyuSheets([
      captionSheet('S', '1', [['c_1', 'A', '', '', '0', '0', '0', '', '', '']]),
      { name: '__LM_SHEET_NAMES', gid: '2', rows: [['sheetGid', 'displayName']] },
      { name: '__LM_META', gid: '3', rows: [['key', 'value'], ['glbFileId', 'xyz']] },
    ]);
    expect(m.warnings).toHaveLength(0);
  });

  it('__LM_MATERIALS はappend-onlyの最終行が有効', () => {
    const matHeader = ['materialKey', 'opacity', 'doubleSided', 'unlitLike', 'chromaEnable', 'chromaColor', 'chromaTolerance', 'chromaFeather', 'roughness', 'metalness', 'emissiveHex', 'updatedAt', 'updatedBy', 'sheetGid'];
    const m = analyzeLociMyuSheets([
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

  it('imageFileId参照を未リンクとして集計する', () => {
    const m = analyzeLociMyuSheets([
      captionSheet('S', '1', [
        ['c_1', 'A', '', '', '0', '0', '0', 'img_X', '', ''],
        ['c_2', 'B', '', '', '0', '0', '0', 'img_X', '', ''],
        ['c_3', 'C', '', '', '0', '0', '0', 'img_Y', '', ''],
      ]),
    ]);
    expect(m.unlinkedImages.size).toBe(2);
    expect(m.unlinkedImages.get('img_X')).toHaveLength(2);
  });

  it('LociMyu形式でないシートは警告してスキップする', () => {
    const m = analyzeLociMyuSheets([
      { name: '経費精算', gid: '1', rows: [['日付', '金額'], ['5/1', '1000']] },
    ]);
    expect(m.sets).toHaveLength(0);
    expect(m.warnings.some((w) => w.includes('経費精算'))).toBe(true);
  });
});
