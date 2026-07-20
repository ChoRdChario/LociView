// LociMyu からの移行 (docs/02 §6.2)
// Drive フォルダZIP（xlsx + 画像 + モデル）を LociView プロジェクトへ変換する。
//
// LociMyu のシート構造（audit_source から確認済み）:
//   キャプションシート（任意名、複数可）: id,title,body,color,posX,posY,posZ,imageFileId,createdAt,updatedAt
//   __LM_VIEWS   : id,captionSheetGid,name,bgColor,cameraType,eyeXYZ,targetXYZ,upXYZ,fov,createdAt,updatedAt
//   __LM_MATERIALS: materialKey,opacity,doubleSided,unlitLike,chromaEnable,chromaColor,
//                   chromaTolerance,chromaFeather,roughness,metalness,emissiveHex,updatedAt,updatedBy,sheetGid
//
// 重要な変換規則:
//   - キャプションシート1枚 → 表示セット1つ（シート名=セット名）。docs/07 U-03の運用実態に基づく
//   - __LM_VIEWS / __LM_MATERIALS の行は captionSheetGid / sheetGid で各セットへ割り当てる
//   - captionId は旧idから決定的に生成（同じZIPを二度取り込んでもマージで重複しない）
//   - imageFileId はオフラインで解決できないため未リンクとして保持（対応表CSVがあれば解決）

import { ulid } from '../core/ids';

export const LOCIMYU_CAPTION_HEADER = [
  'id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt',
] as const;

export const LM_VIEWS_SHEET = '__LM_VIEWS';
export const LM_MATERIALS_SHEET = '__LM_MATERIALS';

/** 表形式データ（xlsx/csvパーサからの入力を共通化） */
export interface SheetTable {
  name: string;
  /** gid（xlsxからは取れないためシート順インデックスを代用。undefined可） */
  gid?: string;
  rows: string[][];
}

export interface LociMyuCaption {
  legacyId: string;
  captionId: string;
  title: string;
  body: string;
  color: string;
  position: [number, number, number] | null;
  legacyImageFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LociMyuView {
  name: string;
  sheetGid: string;
  bgColor: string | null;
  cameraState: {
    eye: [number, number, number];
    target: [number, number, number];
    up: [number, number, number];
    fov: number;
    ortho: boolean;
  };
}

export interface LociMyuMaterial {
  sheetGid: string;
  materialKey: string;
  opacity: number;
  doubleSided: boolean;
  unlitLike: boolean;
  chroma: { enable: boolean; color: string; tolerance: number; feather: number } | null;
}

export interface LociMyuSet {
  name: string;
  gid: string;
  captions: LociMyuCaption[];
}

export interface LociMyuMigration {
  sets: LociMyuSet[];
  views: LociMyuView[];
  materials: LociMyuMaterial[];
  /** 未リンクの画像参照（旧Drive fileId → それを参照するcaptionId群） */
  unlinkedImages: Map<string, string[]>;
  warnings: string[];
}

// ---- ヘルパ --------------------------------------------------------------------

function cell(row: string[] | undefined, i: number): string {
  return (row?.[i] ?? '').trim();
}

function num(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normHex(v: string): string | null {
  const s = v.trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

function truthy(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/** 旧id → LociView captionId（決定的。同一ZIPの再取込で重複しない） */
export function legacyCaptionId(legacyId: string): string {
  // 旧idは 'c_xxxxxxxx' 形式。ULID風の固定長へ決定的にマップする
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < legacyId.length; i++) {
    const c = legacyId.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let out = '';
  let a = h1;
  let b = h2;
  for (let i = 0; i < 13; i++) {
    out += B32[a % 32];
    a = Math.floor(a / 32) + (i === 6 ? b : 0);
  }
  for (let i = 0; i < 13; i++) {
    out += B32[b % 32];
    b = Math.floor(b / 32) + 7;
  }
  return `cap_LM${out.slice(0, 24)}`;
}

/** ヘッダ行がLociMyuキャプションシートかを判定する */
export function isLociMyuCaptionSheet(rows: string[][]): boolean {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  if (header.length < 7) return false;
  const expect = LOCIMYU_CAPTION_HEADER.slice(0, 7).map((h) => h.toLowerCase());
  return expect.every((h, i) => header[i] === h);
}

// ---- 本体 ----------------------------------------------------------------------

export function analyzeLociMyuSheets(tables: readonly SheetTable[]): LociMyuMigration {
  const result: LociMyuMigration = {
    sets: [],
    views: [],
    materials: [],
    unlinkedImages: new Map(),
    warnings: [],
  };

  for (const table of tables) {
    const name = table.name.trim();
    const gid = table.gid ?? String(table.rows.length); // gid不明時は識別子を仮置き

    if (name === LM_VIEWS_SHEET) {
      parseViews(table, result);
      continue;
    }
    if (name === LM_MATERIALS_SHEET) {
      parseMaterials(table, result);
      continue;
    }
    if (!isLociMyuCaptionSheet(table.rows)) {
      if (table.rows.length > 1) {
        result.warnings.push(`シート「${name}」はLociMyu形式ではないためスキップしました`);
      }
      continue;
    }

    const captions: LociMyuCaption[] = [];
    for (let r = 1; r < table.rows.length; r++) {
      const row = table.rows[r];
      const legacyId = cell(row, 0);
      if (legacyId === '') continue; // ソフト削除された空行

      const px = cell(row, 4);
      const py = cell(row, 5);
      const pz = cell(row, 6);
      let position: [number, number, number] | null = null;
      if (px !== '' && py !== '' && pz !== '') {
        const nx = Number(px);
        const ny = Number(py);
        const nz = Number(pz);
        if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) {
          position = [nx, ny, nz];
        } else {
          result.warnings.push(`「${name}」${r + 1}行目: 座標が数値ではありません`);
        }
      }

      const captionId = legacyCaptionId(legacyId);
      const imageFileId = cell(row, 7);
      if (imageFileId !== '') {
        const list = result.unlinkedImages.get(imageFileId) ?? [];
        list.push(captionId);
        result.unlinkedImages.set(imageFileId, list);
      }

      captions.push({
        legacyId,
        captionId,
        title: cell(row, 1),
        body: cell(row, 2),
        color: normHex(cell(row, 3)) ?? '#eab308',
        position,
        legacyImageFileId: imageFileId !== '' ? imageFileId : null,
        createdAt: cell(row, 8),
        updatedAt: cell(row, 9),
      });
    }
    result.sets.push({ name: name !== '' ? name : `セット${result.sets.length + 1}`, gid, captions });
  }

  if (result.sets.length === 0) {
    result.warnings.push('LociMyu形式のキャプションシートが見つかりませんでした');
  }
  return result;
}

function parseViews(table: SheetTable, result: LociMyuMigration): void {
  for (let r = 1; r < table.rows.length; r++) {
    const row = table.rows[r];
    const id = cell(row, 0);
    if (id === '') continue;
    const name = cell(row, 2);
    if (name === '__last') continue; // 内部用の最終ビュー行は移行しない
    result.views.push({
      name: name !== '' ? name : `ビュー${result.views.length + 1}`,
      sheetGid: cell(row, 1),
      bgColor: normHex(cell(row, 3)),
      cameraState: {
        eye: [num(cell(row, 5), 0), num(cell(row, 6), 0), num(cell(row, 7), 0)],
        target: [num(cell(row, 8), 0), num(cell(row, 9), 0), num(cell(row, 10), 0)],
        up: [num(cell(row, 11), 0), num(cell(row, 12), 1), num(cell(row, 13), 0)],
        fov: num(cell(row, 14), 45),
        ortho: cell(row, 4).toLowerCase() === 'orthographic',
      },
    });
  }
}

function parseMaterials(table: SheetTable, result: LociMyuMigration): void {
  // 同一 (sheetGid, materialKey) は最終行が有効（LociMyuはappend-only運用）
  const latest = new Map<string, LociMyuMaterial>();
  for (let r = 1; r < table.rows.length; r++) {
    const row = table.rows[r];
    const materialKey = cell(row, 0);
    if (materialKey === '') continue;
    const sheetGid = cell(row, 13);
    const chromaEnable = truthy(cell(row, 4));
    latest.set(`${sheetGid} ${materialKey}`, {
      sheetGid,
      materialKey,
      opacity: num(cell(row, 1), 1),
      doubleSided: truthy(cell(row, 2)),
      unlitLike: truthy(cell(row, 3)),
      chroma: chromaEnable
        ? {
            enable: true,
            color: normHex(cell(row, 5)) ?? '#000000',
            tolerance: num(cell(row, 6), 0.1),
            feather: num(cell(row, 7), 0),
          }
        : null,
    });
  }
  result.materials.push(...latest.values());
}

/** fileId → filename 対応表CSV（Apps Script出力）を読み、未リンク画像を解決する */
export function parseFileIdMap(csvRows: readonly string[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of csvRows) {
    const a = (row[0] ?? '').trim();
    const b = (row[1] ?? '').trim();
    if (a === '' || b === '') continue;
    if (a.toLowerCase() === 'fileid' || a.toLowerCase() === 'id') continue; // ヘッダ
    map.set(a, b);
  }
  return map;
}

/** 移行結果の要約（ウィザード表示用） */
export function summarizeMigration(m: LociMyuMigration): string {
  const capCount = m.sets.reduce((s, set) => s + set.captions.length, 0);
  const parts = [
    `表示セット ${m.sets.length}件（${m.sets.map((s) => s.name).join('、')}）`,
    `キャプション ${capCount}件`,
  ];
  if (m.views.length > 0) parts.push(`ビュー ${m.views.length}件`);
  if (m.materials.length > 0) parts.push(`マテリアル設定 ${m.materials.length}件`);
  if (m.unlinkedImages.size > 0) parts.push(`未リンク画像参照 ${m.unlinkedImages.size}件`);
  return parts.join(' / ');
}

/** 新しいULIDを発行（テストからのモック用に切り出し） */
export function newSetId(): string {
  return `set_${ulid()}`;
}
