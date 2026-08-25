// LociMyu からの移行 (docs/02 §6.2)
// Drive フォルダZIP（xlsx + 画像 + モデル）を LociView プロジェクトへ変換する。
//
// LociMyu のシート構造（archived alpha sourceと実データから確認済み。由来はdocs/history/legacy-locimyu-alpha.md）:
//   キャプションシート（任意名、複数可）: id,title,body,color,posX,posY,posZ,imageFileId,createdAt,updatedAt
//   __LM_VIEWS   : id,captionSheetGid,name,bgColor,cameraType,eyeXYZ,targetXYZ,upXYZ,fov,createdAt,updatedAt
//   __LM_MATERIALS: materialKey,opacity,doubleSided,unlitLike,chromaEnable,chromaColor,
//                   chromaTolerance,chromaFeather,roughness,metalness,emissiveHex,updatedAt,updatedBy,sheetGid
//
// 重要な変換規則:
//   - キャプションシート1枚 → 表示セット1つ（シート名=セット名）。docs/07 U-03の運用実態に基づく
//   - __LM_VIEWS / __LM_MATERIALS の行は captionSheetGid / sheetGid で各セットへ割り当てる
//   - captionId は承認済みrecipe 2でsheet/occurrenceを含めて決定的に生成する
//   - imageFileId はオフラインで解決できないため未リンクとして保持（対応表CSVがあれば解決）

import { ulid } from '../core/ids';

export const LOCIMYU_CAPTION_HEADER = [
  'id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt',
] as const;

export const LM_VIEWS_SHEET = '__LM_VIEWS';
export const LM_MATERIALS_SHEET = '__LM_MATERIALS';
export const LM_SHEET_NAMES_SHEET = '__LM_SHEET_NAMES';
export const LM_META_SHEET = '__LM_META';
const INTERNAL_SHEETS = new Set([LM_VIEWS_SHEET, LM_MATERIALS_SHEET, LM_SHEET_NAMES_SHEET, LM_META_SHEET]);
export const LOCIMYU_CAPTION_ID_RECIPE = 'locimyu-caption-id-2' as const;
export const LOCIMYU_SOURCE_RETENTION_NOTICE =
  '元のLociMyu ZIPは別に保管してください。現在のLociView書き出しには、読み取れなかった元データを後から確認するための完全な原本は含まれず、元ZIPのバックアップにはなりません。';
const LOCIMYU_CAPTION_ID_PREFIX = 'lociview:v1:locimyu-caption-id:2:jcs-v1\n';
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** LociMyuが「そのシートで最後に見ていた視点」を記録する予約名 */
export const LAST_VIEW_NAME = '__last';

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
  identity: LociMyuCaptionIdentityPlanV2;
  title: string;
  body: string;
  color: string;
  position: [number, number, number] | null;
  legacyImageFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LociMyuCaptionIdentityKeyV2 {
  legacyId: string;
  occurrence: number;
  sheetIdentity:
    | { kind: 'legacyGid'; value: string }
    | { kind: 'sheetName'; value: string };
}

export interface LociMyuCaptionIdentityPlanV2 {
  recipeId: typeof LOCIMYU_CAPTION_ID_RECIPE;
  key: LociMyuCaptionIdentityKeyV2;
  preimage: string;
  preimageBytes: Uint8Array;
  fullDigest: Uint8Array;
  captionId: string;
}

export type LociMyuSourceValidationCode =
  | 'invalid-legacy-id'
  | 'invalid-sheet-identity'
  | 'non-unique-sheet-name'
  | 'missing-legacy-id'
  | 'duplicate-identity-key';

/** A failure caused by one candidate workbook, safe for candidate fallback. */
export class LociMyuSourceValidationError extends Error {
  override readonly name = 'LociMyuSourceValidationError';

  constructor(
    readonly code: LociMyuSourceValidationCode,
    message: string,
  ) {
    super(message);
  }
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
  /** xlsx上のシート順（1始まり）。Google Sheetsのgidとは別物 */
  gid: string;
  /** 突合に成功したGoogle SheetsのgidR（不明ならnull） */
  legacyGid: string | null;
  captions: LociMyuCaption[];
}

export interface LociMyuMigration {
  sets: LociMyuSet[];
  views: LociMyuView[];
  materials: LociMyuMaterial[];
  /** 未リンクの画像参照（旧Drive fileId → それを参照するcaptionId群） */
  unlinkedImages: Map<string, string[]>;
  /** legacyGid → セット名。__LM_SHEET_NAMESと出現順から推定した対応 */
  gidToSetName: Map<string, string>;
  /** 対応が推定（=確証がない）かどうか。UIで確認を促すために使う */
  gidMappingIsGuess: boolean;
  warnings: string[];
}

// ---- ヘルパ --------------------------------------------------------------------

function isLociMyuTrimCodeUnit(code: number): boolean {
  return (
    (code >= 0x0009 && code <= 0x000d) ||
    code === 0x0020 ||
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/** Approved, versioned edge trim used by every identity/source-authority field. */
export function lociMyuTrimV1(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isLociMyuTrimCodeUnit(value.charCodeAt(start))) start++;
  while (end > start && isLociMyuTrimCodeUnit(value.charCodeAt(end - 1))) end--;
  return start === 0 && end === value.length ? value : value.slice(start, end);
}

function cell(row: string[] | undefined, i: number): string {
  return lociMyuTrimV1(row?.[i] ?? '');
}

function isCompletelyEmptyRow(row: readonly string[] | undefined): boolean {
  return row === undefined || row.every((value) => lociMyuTrimV1(value) === '');
}

function unicodeScalarLength(
  value: string,
  label: string,
  errorCode: LociMyuSourceValidationCode,
): number {
  let length = 0;
  for (let i = 0; i < value.length; i++) {
    const codeUnit = value.charCodeAt(i);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const low = value.charCodeAt(i + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        throw new LociMyuSourceValidationError(
          errorCode,
          `locimyu identity: ${label} contains a lone surrogate`,
        );
      }
      i++;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new LociMyuSourceValidationError(
        errorCode,
        `locimyu identity: ${label} contains a lone surrogate`,
      );
    }
    length++;
  }
  return length;
}

function validateIdentityString(
  value: string,
  label: string,
  maxScalars: number,
  code: LociMyuSourceValidationCode,
): void {
  if (typeof value !== 'string' || value === '') {
    throw new LociMyuSourceValidationError(code, `locimyu identity: ${label} is empty`);
  }
  if (lociMyuTrimV1(value) !== value) {
    throw new LociMyuSourceValidationError(
      code,
      `locimyu identity: ${label} is not LociMyuTrimV1 canonical`,
    );
  }
  if (unicodeScalarLength(value, label, code) > maxScalars) {
    throw new LociMyuSourceValidationError(
      code,
      `locimyu identity: ${label} exceeds ${maxScalars} Unicode scalars`,
    );
  }
}

function restrictedLegacyJcsV1(key: LociMyuCaptionIdentityKeyV2): string {
  validateIdentityString(key.legacyId, 'legacyId', 128, 'invalid-legacy-id');
  if (!Number.isSafeInteger(key.occurrence) || key.occurrence < 0) {
    throw new Error('locimyu identity: occurrence is outside the safe non-negative range');
  }
  if (key.sheetIdentity.kind !== 'legacyGid' && key.sheetIdentity.kind !== 'sheetName') {
    throw new Error('locimyu identity: unknown sheet identity kind');
  }
  validateIdentityString(key.sheetIdentity.value, 'sheetIdentity.value', 256, 'invalid-sheet-identity');
  return (
    `{"legacyId":${JSON.stringify(key.legacyId)},` +
    `"occurrence":${JSON.stringify(key.occurrence)},` +
    `"sheetIdentity":{"kind":${JSON.stringify(key.sheetIdentity.kind)},` +
    `"value":${JSON.stringify(key.sheetIdentity.value)}}}`
  );
}

async function lociMyuSha256(bytes: Uint8Array): Promise<Uint8Array> {
  const snapshot = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', snapshot.buffer);
  if (!(digest instanceof ArrayBuffer)) {
    throw new Error('locimyu identity: SHA-256 provider returned a non-ArrayBuffer result');
  }
  return new Uint8Array(digest);
}

function digestHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function portableCaptionId(fullDigest: Uint8Array): string {
  let value = 0n;
  for (let i = 0; i < 16; i++) value = (value << 8n) | BigInt(fullDigest[i]!);
  let suffix = '';
  for (let i = 0; i < 26; i++) {
    suffix = CROCKFORD_BASE32[Number(value & 31n)]! + suffix;
    value >>= 5n;
  }
  return `cap_${suffix}`;
}

export async function planLociMyuCaptionIdentity(
  key: LociMyuCaptionIdentityKeyV2,
): Promise<LociMyuCaptionIdentityPlanV2> {
  const keySnapshot: LociMyuCaptionIdentityKeyV2 = {
    legacyId: key.legacyId,
    occurrence: key.occurrence,
    sheetIdentity: { ...key.sheetIdentity },
  };
  const canonicalKey = restrictedLegacyJcsV1(keySnapshot);
  const preimage = `${LOCIMYU_CAPTION_ID_PREFIX}${canonicalKey}`;
  const preimageBytes = new TextEncoder().encode(preimage);
  const fullDigest = new Uint8Array(await lociMyuSha256(new Uint8Array(preimageBytes)));
  if (fullDigest.length !== 32) {
    throw new Error(`locimyu identity: SHA-256 provider returned ${fullDigest.length} bytes`);
  }
  const captionId = portableCaptionId(fullDigest);
  if (!/^cap_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(captionId)) {
    throw new Error('locimyu identity: portable Caption ID postcondition failed');
  }
  return {
    recipeId: LOCIMYU_CAPTION_ID_RECIPE,
    key: keySnapshot,
    preimage,
    preimageBytes,
    fullDigest,
    captionId,
  };
}

function num(v: string, fallback: number): number {
  // Number('') は 0 を返し isFinite も通るため、空欄は明示的に既定値へ倒す。
  // （実データのfov列が空欄で、fov=0 → 平行投影のfrustumが潰れる不具合があった）
  if (lociMyuTrimV1(v) === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normHex(v: string): string | null {
  const s = lociMyuTrimV1(v);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

function truthy(v: string): boolean {
  const s = lociMyuTrimV1(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/** ヘッダ行がLociMyuキャプションシートかを判定する */
export function isLociMyuCaptionSheet(rows: string[][]): boolean {
  const header = (rows[0] ?? []).map((h) => lociMyuTrimV1(h).toLowerCase());
  if (header.length < 7) return false;
  const expect = LOCIMYU_CAPTION_HEADER.slice(0, 7).map((h) => h.toLowerCase());
  return expect.every((h, i) => header[i] === h);
}

/** Exact candidate-row count: reserved sheets and completely empty rows do not count. */
export function countLociMyuCaptionSourceRows(tables: readonly SheetTable[]): number {
  let count = 0;
  for (const table of tables) {
    if (INTERNAL_SHEETS.has(lociMyuTrimV1(table.name)) || !isLociMyuCaptionSheet(table.rows)) continue;
    for (const row of table.rows.slice(1)) {
      if (!isCompletelyEmptyRow(row)) count++;
    }
  }
  return count;
}

// ---- 本体 ----------------------------------------------------------------------

export type LociMyuCaptionSheetIdentity = LociMyuCaptionIdentityKeyV2['sheetIdentity'];

/**
 * Pure, order-independent __LM_SHEET_NAMES authority projection used by ID
 * planning. View/material activation intentionally keeps its historical path
 * until the reviewed deferred-review destination exists.
 */
export function projectLociMyuCaptionSheetIdentities(
  tables: readonly SheetTable[],
): Map<SheetTable, LociMyuCaptionSheetIdentity> {
  const captionTables = tables.filter((table) =>
    !INTERNAL_SHEETS.has(lociMyuTrimV1(table.name)) && isLociMyuCaptionSheet(table.rows),
  );
  const captionTablesByName = new Map<string, SheetTable[]>();
  for (const table of captionTables) {
    const name = lociMyuTrimV1(table.name);
    const matches = captionTablesByName.get(name) ?? [];
    matches.push(table);
    captionTablesByName.set(name, matches);
  }
  for (const [name, matches] of captionTablesByName) {
    if (matches.length > 1) {
      throw new LociMyuSourceValidationError(
        'non-unique-sheet-name',
        'LOCIMYU_ID_NON_UNIQUE_SHEET_NAME',
      );
    }
  }

  const titlesByGid = new Map<string, Set<string>>();
  const gidsByTitle = new Map<string, Set<string>>();
  const taintedGids = new Set<string>();
  const taintedTitles = new Set<string>();
  for (const table of tables) {
    if (lociMyuTrimV1(table.name) !== LM_SHEET_NAMES_SHEET) continue;
    for (const row of table.rows.slice(1)) {
      if (isCompletelyEmptyRow(row)) continue;
      const gid = cell(row, 0);
      const sheetTitle = cell(row, 2);
      const title = sheetTitle !== '' ? sheetTitle : cell(row, 1);
      if (gid === '' || title === '') {
        if (gid !== '') taintedGids.add(gid);
        if (title !== '') taintedTitles.add(title);
        continue;
      }
      const titles = titlesByGid.get(gid) ?? new Set<string>();
      titles.add(title);
      titlesByGid.set(gid, titles);
      const gids = gidsByTitle.get(title) ?? new Set<string>();
      gids.add(gid);
      gidsByTitle.set(title, gids);
    }
  }

  const projection = new Map<SheetTable, LociMyuCaptionSheetIdentity>();
  for (const table of captionTables) {
    const name = lociMyuTrimV1(table.name);
    const candidateGids = gidsByTitle.get(name);
    const candidateGid = candidateGids?.size === 1 ? [...candidateGids][0]! : null;
    const reverseTitles = candidateGid === null ? undefined : titlesByGid.get(candidateGid);
    const authoritative =
      candidateGid !== null &&
      !taintedTitles.has(name) &&
      !taintedGids.has(candidateGid) &&
      reverseTitles?.size === 1 &&
      reverseTitles.has(name);
    const identity: LociMyuCaptionSheetIdentity = authoritative
      ? { kind: 'legacyGid', value: candidateGid }
      : { kind: 'sheetName', value: name };
    validateIdentityString(identity.value, 'sheetIdentity.value', 256, 'invalid-sheet-identity');
    projection.set(table, identity);
  }
  return projection;
}

function preflightLociMyuCaptionIdentityKeys(
  tables: readonly SheetTable[],
  projection: ReadonlyMap<SheetTable, LociMyuCaptionSheetIdentity>,
): void {
  const canonicalKeys = new Set<string>();
  for (const table of tables) {
    const name = lociMyuTrimV1(table.name);
    if (INTERNAL_SHEETS.has(name) || !isLociMyuCaptionSheet(table.rows)) continue;
    const sheetIdentity = projection.get(table);
    if (sheetIdentity === undefined) throw new Error('LOCIMYU_ID_MISSING_SHEET_PROJECTION');
    const occurrenceByLegacyId = new Map<string, number>();
    for (let r = 1; r < table.rows.length; r++) {
      const row = table.rows[r];
      if (isCompletelyEmptyRow(row)) continue;
      const legacyId = cell(row, 0);
      if (legacyId === '') {
        throw new LociMyuSourceValidationError(
          'missing-legacy-id',
          `LOCIMYU_ID_MISSING_LEGACY_ID:${r + 1}`,
        );
      }
      const occurrence = occurrenceByLegacyId.get(legacyId) ?? 0;
      occurrenceByLegacyId.set(legacyId, occurrence + 1);
      const canonicalKey = restrictedLegacyJcsV1({
        legacyId,
        occurrence,
        sheetIdentity: { ...sheetIdentity },
      });
      if (canonicalKeys.has(canonicalKey)) {
        throw new LociMyuSourceValidationError(
          'duplicate-identity-key',
          'locimyu identity: duplicate canonical identity key',
        );
      }
      canonicalKeys.add(canonicalKey);
    }
  }
}

interface LociMyuIdentityRegistry {
  readonly preimages: Set<string>;
  readonly fullDigestOwners: Map<string, string>;
  readonly portableOwners: Map<string, string>;
}

function newIdentityRegistry(): LociMyuIdentityRegistry {
  return {
    preimages: new Set(),
    fullDigestOwners: new Map(),
    portableOwners: new Map(),
  };
}

function registerIdentityPlan(
  identity: LociMyuCaptionIdentityPlanV2,
  registry: LociMyuIdentityRegistry,
): void {
  if (registry.preimages.has(identity.preimage)) {
    throw new LociMyuSourceValidationError(
      'duplicate-identity-key',
      'locimyu identity: duplicate canonical identity key',
    );
  }
  const fullDigest = digestHex(identity.fullDigest);
  const fullOwner = registry.fullDigestOwners.get(fullDigest);
  if (fullOwner !== undefined && fullOwner !== identity.preimage) {
    throw new Error('locimyu identity: full SHA-256 collision');
  }
  const portableOwner = registry.portableOwners.get(identity.captionId);
  if (portableOwner !== undefined && portableOwner !== identity.preimage) {
    throw new Error('locimyu identity: truncated Caption ID collision');
  }
  registry.preimages.add(identity.preimage);
  registry.fullDigestOwners.set(fullDigest, identity.preimage);
  registry.portableOwners.set(identity.captionId, identity.preimage);
}

export async function analyzeLociMyuSheets(
  inputTables: readonly SheetTable[],
): Promise<LociMyuMigration> {
  // Every caller-owned source value is captured before the first await. This
  // prevents a delayed digest from mixing rows from different source states.
  const tables: SheetTable[] = inputTables.map((table) => ({
    name: table.name,
    ...(table.gid === undefined ? {} : { gid: table.gid }),
    rows: table.rows.map((row) => [...row]),
  }));
  const result: LociMyuMigration = {
    sets: [],
    views: [],
    materials: [],
    unlinkedImages: new Map(),
    gidToSetName: new Map(),
    gidMappingIsGuess: false,
    warnings: [],
  };
  const captionSheetIdentities = projectLociMyuCaptionSheetIdentities(tables);
  preflightLociMyuCaptionIdentityKeys(tables, captionSheetIdentities);
  const identityRegistry = newIdentityRegistry();

  for (const table of tables) {
    const name = lociMyuTrimV1(table.name);
    const gid = table.gid ?? String(table.rows.length); // gid不明時は識別子を仮置き

    if (name === LM_VIEWS_SHEET) {
      parseViews(table, result);
      continue;
    }
    if (name === LM_MATERIALS_SHEET) {
      parseMaterials(table, result);
      continue;
    }
    if (INTERNAL_SHEETS.has(name)) continue; // 対応表等は後段で使う（警告は出さない）
    if (!isLociMyuCaptionSheet(table.rows)) {
      if (table.rows.length > 1) {
        result.warnings.push(`シート「${name}」はLociMyu形式ではないためスキップしました`);
      }
      continue;
    }

    const captions: LociMyuCaption[] = [];
    const occurrenceByLegacyId = new Map<string, number>();
    const sheetIdentity = captionSheetIdentities.get(table);
    if (sheetIdentity === undefined) {
      throw new Error('LOCIMYU_ID_MISSING_SHEET_PROJECTION');
    }
    for (let r = 1; r < table.rows.length; r++) {
      const row = table.rows[r];
      if (isCompletelyEmptyRow(row)) continue;
      const legacyId = cell(row, 0);
      if (legacyId === '') {
        throw new LociMyuSourceValidationError(
          'missing-legacy-id',
          `LOCIMYU_ID_MISSING_LEGACY_ID:${r + 1}`,
        );
      }
      const occurrence = occurrenceByLegacyId.get(legacyId) ?? 0;
      occurrenceByLegacyId.set(legacyId, occurrence + 1);
      const identity = await planLociMyuCaptionIdentity({
        legacyId,
        occurrence,
        sheetIdentity: { ...sheetIdentity },
      });
      registerIdentityPlan(identity, identityRegistry);

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

      const captionId = identity.captionId;
      const imageFileId = cell(row, 7);
      if (imageFileId !== '') {
        const list = result.unlinkedImages.get(imageFileId) ?? [];
        list.push(captionId);
        result.unlinkedImages.set(imageFileId, list);
      }

      captions.push({
        legacyId,
        captionId,
        identity,
        title: cell(row, 1),
        body: cell(row, 2),
        color: normHex(cell(row, 3)) ?? '#eab308',
        position,
        legacyImageFileId: imageFileId !== '' ? imageFileId : null,
        createdAt: cell(row, 8),
        updatedAt: cell(row, 9),
      });
    }
    result.sets.push({
      name: name !== '' ? name : `セット${result.sets.length + 1}`,
      gid,
      legacyGid: null,
      captions,
    });
  }

  resolveLegacyGids(tables, result);

  if (result.sets.length === 0) {
    result.warnings.push('LociMyu形式のキャプションシートが見つかりませんでした');
  }
  return result;
}

/**
 * Google Sheetsのgid（__LM_VIEWS/__LM_MATERIALSが参照）と、xlsx上のシートを対応付ける。
 *
 * xlsxエクスポートではgidが失われるため直接の対応が取れない。次の順で解決する:
 *   1. __LM_SHEET_NAMES（gid ↔ シート名の対応表。LociMyuが記録している）— 確実
 *   2. 残りは「gidの初出順」と「キャプションシートの並び順」を突き合わせて推定 — 要確認
 *
 * 推定を含む場合は gidMappingIsGuess を立て、UIで対応の確認・修正を促す。
 */
function resolveLegacyGids(tables: readonly SheetTable[], result: LociMyuMigration): void {
  // gidの初出順（__LM_VIEWS → __LM_MATERIALS の順に走査）
  const gidOrder: string[] = [];
  const pushGid = (g: string): void => {
    if (g !== '' && !gidOrder.includes(g)) gidOrder.push(g);
  };
  for (const v of result.views) pushGid(v.sheetGid);
  for (const m of result.materials) pushGid(m.sheetGid);
  if (gidOrder.length === 0) return;

  // 1) 対応表による確定
  const nameByGid = new Map<string, string>();
  for (const table of tables) {
    if (lociMyuTrimV1(table.name) !== LM_SHEET_NAMES_SHEET) continue;
    for (const row of table.rows.slice(1)) {
      const gid = cell(row, 0);
      // sheetTitle（実シート名）を優先、無ければdisplayName
      const title = cell(row, 2) !== '' ? cell(row, 2) : cell(row, 1);
      if (gid !== '' && title !== '') nameByGid.set(gid, title);
    }
  }

  const setsByName = new Map<string, LociMyuSet>();
  for (const s of result.sets) if (!setsByName.has(s.name)) setsByName.set(s.name, s);

  const assignedGids = new Set<string>();
  for (const [gid, title] of nameByGid) {
    const set = setsByName.get(title);
    if (set !== undefined && set.legacyGid === null) {
      set.legacyGid = gid;
      assignedGids.add(gid);
      result.gidToSetName.set(gid, set.name);
    }
  }

  // 2) 残りを出現順で推定（LociMyuはシート作成順にgidを記録するため概ね一致する）
  const remainingGids = gidOrder.filter((g) => !assignedGids.has(g));
  const remainingSets = result.sets.filter((s) => s.legacyGid === null);
  const pairs = Math.min(remainingGids.length, remainingSets.length);
  if (pairs > 0) result.gidMappingIsGuess = true;
  for (let i = 0; i < pairs; i++) {
    const gid = remainingGids[i]!;
    const set = remainingSets[i]!;
    set.legacyGid = gid;
    result.gidToSetName.set(gid, set.name);
  }
}

function parseViews(table: SheetTable, result: LociMyuMigration): void {
  for (let r = 1; r < table.rows.length; r++) {
    const row = table.rows[r];
    const id = cell(row, 0);
    if (id === '') continue;
    const rawName = cell(row, 2);
    // __last は「そのシートで最後に見ていた視点」。名前付きビューを保存していない
    // 運用が実際に存在するため、これも「前回の視点」として移行する
    const name =
      rawName === LAST_VIEW_NAME
        ? '前回の視点'
        : rawName !== ''
          ? rawName
          : `ビュー${result.views.length + 1}`;
    result.views.push({
      name,
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
    const a = lociMyuTrimV1(row[0] ?? '');
    const b = lociMyuTrimV1(row[1] ?? '');
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
