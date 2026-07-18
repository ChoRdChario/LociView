// キャプションCSVの入出力 (docs/02 §6.1)
// - エクスポート: UTF-8 BOM付き・完全精度座標・formula injection対策
// - インポート: captionId突き合わせで「変わったセルだけ」を差分プランにする
// - 座標コピペ / modelName一括付け替えを第一級ユースケースとして扱う

import { isVisible, visibleEntities, type EntityRecord, type ProjectState } from '../core/reduce';
import type { ProjectStore } from '../core/store';

export const CSV_BOM = '\uFEFF';

export const CSV_HEADER = [
  'captionId',
  'setName',
  'title',
  'body',
  'color',
  'tags',
  'attachmentNames',
  'modelName',
  'posX',
  'posY',
  'posZ',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
] as const;

const TAG_SEP = ';';

// ---- 値ヘルパ ----------------------------------------------------------------

function str(rec: EntityRecord, field: string): string {
  const v = rec.fields[field];
  return typeof v === 'string' ? v : '';
}

function strArr(rec: EntityRecord, field: string): string[] {
  const v = rec.fields[field];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

interface Anchor {
  modelAssetId?: string;
  position?: [number, number, number];
  [k: string]: unknown;
}

function anchorOf(rec: EntityRecord): Anchor | null {
  const v = rec.fields.anchor;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  return v as Anchor;
}

// ---- CSV基礎 -----------------------------------------------------------------

/** formula injection対策: 危険な先頭文字にアポストロフィを付ける（数値列には適用しない） */
export function guardCell(s: string): string {
  return /^[=+\-@\t]/.test(s) ? `'${s}` : s;
}

/** guardCellの決定的逆変換 */
export function unguardCell(s: string): string {
  return s.startsWith("'") && /^[=+\-@\t]/.test(s.slice(1)) ? s.slice(1) : s;
}

function escapeField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC4180準拠の小型CSVパーサ（BOM除去・CRLF・引用対応） */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (c === '\r' && src[i + 1] === '\n') i += 2;
      else i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 末尾の完全な空行を除去
  while (rows.length > 0 && rows[rows.length - 1]!.every((f) => f === '')) rows.pop();
  return rows;
}

// ---- エクスポート --------------------------------------------------------------

function lookupName(state: ProjectState, kind: string, id: string, nameField: string): string {
  const rec = state.byKind[kind]?.[id];
  if (rec === undefined || !isVisible(rec)) return '';
  return str(rec, nameField);
}

function displayName(state: ProjectState, userId: string): string {
  const p = state.byKind.profile?.[userId];
  if (p !== undefined && isVisible(p)) {
    const n = str(p, 'displayName');
    if (n !== '') return n;
  }
  return userId;
}

export function buildCaptionsCsv(state: ProjectState): string {
  const captions = visibleEntities(state, 'caption').sort((a, b) =>
    (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1,
  );
  const lines: string[] = [CSV_HEADER.join(',')];
  for (const rec of captions) {
    const anchor = anchorOf(rec);
    const pos = anchor?.position;
    const modelName =
      anchor?.modelAssetId !== undefined
        ? lookupName(state, 'asset', anchor.modelAssetId, 'originalName')
        : '';
    const setId = str(rec, 'setId');
    const attachmentNames = strArr(rec, 'attachments')
      .map((astId) => lookupName(state, 'asset', astId, 'originalName'))
      .filter((n) => n !== '')
      .join(TAG_SEP);
    const cells = [
      rec.id,
      guardCell(setId !== '' ? lookupName(state, 'set', setId, 'name') : ''),
      guardCell(str(rec, 'title')),
      guardCell(str(rec, 'body')),
      str(rec, 'color'),
      guardCell(strArr(rec, 'tags').join(TAG_SEP)),
      guardCell(attachmentNames),
      guardCell(modelName),
      pos !== undefined ? String(pos[0]) : '',
      pos !== undefined ? String(pos[1]) : '',
      pos !== undefined ? String(pos[2]) : '',
      guardCell(rec.createdBy !== null ? displayName(state, rec.createdBy) : ''),
      rec.createdAt !== null ? rec.createdAt.slice(0, 24) : '',
      guardCell(rec.fieldWriters.title !== undefined ? displayName(state, rec.fieldWriters.title) : ''),
      rec.lastWrite !== null ? rec.lastWrite.slice(0, 24) : '',
    ];
    lines.push(cells.map(escapeField).join(','));
  }
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

// ---- インポート（差分プラン生成） ------------------------------------------------

export interface CsvImportPlan {
  /** 既存キャプションへの変更（変わったフィールドのみ） */
  updates: { id: string; patch: Record<string, unknown> }[];
  /** captionIdなし行 → 新規作成 */
  creates: { v: Record<string, unknown> }[];
  /** CSVに存在しない既存キャプション（削除はUI確認後に実行する） */
  deleteCandidates: string[];
  /** 未解決のsetName（取込時に新規セットを作る必要がある） */
  newSetNames: string[];
  issues: string[];
}

export function planCaptionsCsvImport(csvText: string, state: ProjectState): CsvImportPlan {
  const plan: CsvImportPlan = { updates: [], creates: [], deleteCandidates: [], newSetNames: [], issues: [] };
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    plan.issues.push('CSVが空です');
    return plan;
  }

  const header = rows[0]!;
  const col = new Map<string, number>();
  header.forEach((h, i) => col.set(h.trim(), i));
  for (const required of ['captionId', 'title']) {
    if (!col.has(required)) {
      plan.issues.push(`必須列がありません: ${required}`);
      return plan;
    }
  }
  const cell = (row: string[], name: string): string | null => {
    const i = col.get(name);
    if (i === undefined) return null;
    return unguardCell(row[i] ?? '');
  };

  // 名前解決テーブル
  const setsByName = new Map<string, string>();
  for (const s of visibleEntities(state, 'set')) setsByName.set(str(s, 'name'), s.id);
  const assetsByName = new Map<string, string>();
  for (const a of visibleEntities(state, 'asset')) assetsByName.set(str(a, 'originalName'), a.id);

  const captions = new Map<string, EntityRecord>();
  for (const c of visibleEntities(state, 'caption')) captions.set(c.id, c);

  const seenIds = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const id = (cell(row, 'captionId') ?? '').trim();
    const patch: Record<string, unknown> = {};

    const title = cell(row, 'title');
    const body = cell(row, 'body');
    const color = cell(row, 'color');
    const tagsRaw = cell(row, 'tags');
    const setName = cell(row, 'setName');
    const modelName = cell(row, 'modelName');
    const px = cell(row, 'posX');
    const py = cell(row, 'posY');
    const pz = cell(row, 'posZ');

    const existing = id !== '' ? captions.get(id) : undefined;
    if (id !== '' && existing === undefined) {
      plan.issues.push(`行${r + 1}: 不明なcaptionId ${id}（スキップ）`);
      continue;
    }

    // setName → setId
    let setId: string | undefined;
    if (setName !== null && setName !== '') {
      setId = setsByName.get(setName);
      if (setId === undefined && !plan.newSetNames.includes(setName)) {
        plan.newSetNames.push(setName);
      }
    }

    // 座標・モデルの解決
    let position: [number, number, number] | undefined;
    if (px !== null && px !== '' && py !== null && py !== '' && pz !== null && pz !== '') {
      const nx = Number(px);
      const ny = Number(py);
      const nz = Number(pz);
      if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) {
        position = [nx, ny, nz];
      } else {
        plan.issues.push(`行${r + 1}: 座標が数値ではありません（座標は変更しません）`);
      }
    }
    let modelAssetId: string | undefined;
    if (modelName !== null && modelName !== '') {
      modelAssetId = assetsByName.get(modelName);
      if (modelAssetId === undefined) {
        plan.issues.push(`行${r + 1}: 不明なmodelName「${modelName}」（モデルは変更しません）`);
      }
    }

    if (existing !== undefined) {
      seenIds.add(id);
      if (title !== null && title !== str(existing, 'title')) patch.title = title;
      if (body !== null && body !== str(existing, 'body')) patch.body = body;
      if (color !== null && color !== '' && color !== str(existing, 'color')) patch.color = color;
      if (tagsRaw !== null) {
        const tags = tagsRaw === '' ? [] : tagsRaw.split(TAG_SEP).map((t) => t.trim()).filter((t) => t !== '');
        if (JSON.stringify(tags) !== JSON.stringify(strArr(existing, 'tags'))) patch.tags = tags;
      }
      if (setId !== undefined && setId !== str(existing, 'setId')) patch.setId = setId;
      if (setName !== null && setName !== '' && setId === undefined) {
        patch.__newSetName = setName; // 適用時に新規セットIDへ差し替える
      }

      const anchor = anchorOf(existing);
      const oldPos = anchor?.position;
      const posChanged =
        position !== undefined &&
        (oldPos === undefined ||
          oldPos[0] !== position[0] ||
          oldPos[1] !== position[1] ||
          oldPos[2] !== position[2]);
      const modelChanged = modelAssetId !== undefined && modelAssetId !== anchor?.modelAssetId;
      if (posChanged || modelChanged) {
        // 座標/モデルの手動変更 → fallback情報(nodePath等)は陳腐化するため破棄し、素のアンカーにする
        patch.anchor = {
          modelAssetId: modelAssetId ?? anchor?.modelAssetId,
          position: position ?? oldPos,
        };
      }

      if (Object.keys(patch).length > 0) plan.updates.push({ id, patch });
    } else {
      // 新規行
      const v: Record<string, unknown> = {
        title: title ?? '',
        body: body ?? '',
        color: color !== null && color !== '' ? color : '#eab308',
        tags:
          tagsRaw !== null && tagsRaw !== ''
            ? tagsRaw.split(TAG_SEP).map((t) => t.trim()).filter((t) => t !== '')
            : [],
        attachments: [],
      };
      if (setId !== undefined) v.setId = setId;
      else if (setName !== null && setName !== '') v.__newSetName = setName;
      if (position !== undefined) {
        v.anchor = { modelAssetId, position };
      }
      plan.creates.push({ v });
    }
  }

  for (const id of captions.keys()) {
    if (!seenIds.has(id)) plan.deleteCandidates.push(id);
  }
  return plan;
}

// ---- プラン適用 -----------------------------------------------------------------

/**
 * プランをstoreへ適用する。変更は「取込を実行した人の編集」として記録される（docs/02 §6.1 帰属の意味論）。
 * deleteCandidatesはここでは実行しない（UIで確認後、明示的にdeleteEntityを呼ぶ）。
 */
export function applyCsvPlan(store: ProjectStore, plan: CsvImportPlan): void {
  const newSetIds = new Map<string, string>();
  for (const name of plan.newSetNames) {
    newSetIds.set(name, store.createEntity('set', { name, order: 999 }));
  }
  const resolveNewSet = (v: Record<string, unknown>): Record<string, unknown> => {
    const marker = v.__newSetName;
    if (typeof marker === 'string') {
      const { __newSetName: _drop, ...rest } = v;
      const setId = newSetIds.get(marker);
      return setId !== undefined ? { ...rest, setId } : rest;
    }
    return v;
  };
  for (const u of plan.updates) {
    store.updateEntity('caption', u.id, resolveNewSet(u.patch));
  }
  for (const c of plan.creates) {
    store.createEntity('caption', resolveNewSet(c.v));
  }
}
