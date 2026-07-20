// 最小xlsxリーダー（読み取り専用）
//
// SheetJS(npm版)には修正版が公開されていないPrototype Pollution/ReDoS脆弱性があり、
// 他人が作ったZIPを解析する本アプリでは採用できない（docs/03 §5 supply chain）。
// 必要なのは「セル値を文字列として読む」だけなので、xlsx（=ZIP+XML）を自前で読む。
// 依存ゼロ・Node/ブラウザ共通・正規表現は線形時間で書く（ReDoS回避）。

import { readZipEntries, type ZipLimits } from '../assets/zipio';
import type { SheetTable } from './locimyu';

const decoder = new TextDecoder();

/** XML実体参照の復号（xlsxが出力するのはこの5種+数値参照） */
function unescapeXml(s: string): string {
  if (!s.includes('&')) return s;
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // &amp;は最後（二重復号を防ぐ）
}

/** <si>…</si> ごとに内部の <t> を連結する（リッチテキストは複数<t>に分かれる） */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    const inner = m[1] ?? '';
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner)) !== null) text += unescapeXml(t[1] ?? '');
    out.push(text);
  }
  return out;
}

/** A1形式の列参照 → 0始まり列インデックス */
function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break; // A-Z以外（数字部）で終了
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

interface SheetMeta {
  name: string;
  /** workbook.xml の sheetId（LociMyuのgidとは別物だが、順序の識別子として使う） */
  sheetId: string;
  rid: string;
}

function parseWorkbook(xml: string): SheetMeta[] {
  const out: SheetMeta[] = [];
  const re = /<sheet\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1];
    const sheetId = /\bsheetId="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const rid = /\br:id="([^"]*)"/.exec(attrs)?.[1] ?? '';
    if (name !== undefined) out.push({ name: unescapeXml(name), sheetId, rid });
  }
  return out;
}

function parseRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const id = /\bId="([^"]*)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]*)"/.exec(attrs)?.[1];
    if (id !== undefined && target !== undefined) map.set(id, unescapeXml(target));
  }
  return map;
}

const MAX_ROWS = 100_000;
const MAX_COLS = 512;

function parseSheet(xml: string, shared: readonly string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowM: RegExpExecArray | null;
  while ((rowM = rowRe.exec(xml)) !== null && rows.length < MAX_ROWS) {
    const rowXml = rowM[1] ?? '';
    const cells: string[] = [];
    // <c r="A1" t="s"><v>0</v></c> / <c ...><is><t>inline</t></is></c> / 空セル <c/>
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cM: RegExpExecArray | null;
    while ((cM = cRe.exec(rowXml)) !== null) {
      const attrs = cM[1] ?? '';
      const inner = cM[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1] ?? 'n';
      const idx = ref !== undefined ? colIndex(ref) : cells.length;
      if (idx < 0 || idx >= MAX_COLS) continue;

      let value = '';
      if (type === 'inlineStr') {
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let t: RegExpExecArray | null;
        while ((t = tRe.exec(inner)) !== null) value += unescapeXml(t[1] ?? '');
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) {
          const raw = unescapeXml(v);
          if (type === 's') {
            value = shared[Number(raw)] ?? '';
          } else if (type === 'b') {
            value = raw === '1' ? 'TRUE' : 'FALSE';
          } else {
            value = raw; // 数値・日付シリアル値は文字列のまま渡す
          }
        }
      }
      while (cells.length < idx) cells.push('');
      cells[idx] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** xlsxバイト列 → シート配列（全セル文字列） */
export async function readXlsx(bytes: Uint8Array, limits?: ZipLimits): Promise<SheetTable[]> {
  const entries = await readZipEntries(bytes, limits);
  const byPath = new Map(entries.map((e) => [e.path, e.data]));

  const workbookBytes = byPath.get('xl/workbook.xml');
  if (workbookBytes === undefined) throw new Error('xlsx: xl/workbook.xml が見つかりません');
  const sheets = parseWorkbook(decoder.decode(workbookBytes));

  const sharedBytes = byPath.get('xl/sharedStrings.xml');
  const shared = sharedBytes !== undefined ? parseSharedStrings(decoder.decode(sharedBytes)) : [];

  const relsBytes = byPath.get('xl/_rels/workbook.xml.rels');
  const rels = relsBytes !== undefined ? parseRels(decoder.decode(relsBytes)) : new Map<string, string>();

  const out: SheetTable[] = [];
  sheets.forEach((meta, i) => {
    const target = rels.get(meta.rid);
    const path =
      target !== undefined
        ? target.startsWith('/')
          ? target.slice(1)
          : `xl/${target.replace(/^\.\//, '')}`
        : `xl/worksheets/sheet${i + 1}.xml`;
    const data = byPath.get(path) ?? byPath.get(`xl/worksheets/sheet${i + 1}.xml`);
    if (data === undefined) return;
    out.push({
      name: meta.name,
      gid: meta.sheetId !== '' ? meta.sheetId : String(i),
      rows: parseSheet(decoder.decode(data), shared),
    });
  });
  return out;
}

/** xlsxかどうかの判定（ZIP magic + [Content_Types].xml） */
export function looksLikeXlsx(name: string, bytes: Uint8Array): boolean {
  if (!name.toLowerCase().endsWith('.xlsx')) return false;
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}
