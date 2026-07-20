// テスト用の最小xlsx生成器（inlineStr方式とsharedStrings方式の両方を出せる）

import { writeZipEntries } from '../../src/assets/zipio';

const enc = new TextEncoder();

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface XlsxSheetSpec {
  name: string;
  rows: string[][];
}

/**
 * @param useSharedStrings trueならsharedStrings.xml経由（実際のGoogle Sheets出力に近い）
 */
export async function makeXlsx(
  sheets: readonly XlsxSheetSpec[],
  useSharedStrings = true,
): Promise<Uint8Array> {
  const shared: string[] = [];
  const sharedIndex = new Map<string, number>();
  const sheetXmls: string[] = [];

  for (const sheet of sheets) {
    let rowsXml = '';
    sheet.rows.forEach((row, r) => {
      let cellsXml = '';
      row.forEach((value, c) => {
        if (value === '') return;
        const ref = `${colName(c)}${r + 1}`;
        if (useSharedStrings) {
          let idx = sharedIndex.get(value);
          if (idx === undefined) {
            idx = shared.length;
            shared.push(value);
            sharedIndex.set(value, idx);
          }
          cellsXml += `<c r="${ref}" t="s"><v>${idx}</v></c>`;
        } else {
          cellsXml += `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
        }
      });
      rowsXml += `<row r="${r + 1}">${cellsXml}</row>`;
    });
    sheetXmls.push(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`,
    );
  }

  const sheetsXml = sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsXml}</sheets></workbook>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('')}</Relationships>`;

  const sharedXml = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared
    .map((s) => `<si><t>${esc(s)}</t></si>`)
    .join('')}</sst>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`;

  const entries = [
    { path: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { path: 'xl/workbook.xml', data: enc.encode(workbook) },
    { path: 'xl/_rels/workbook.xml.rels', data: enc.encode(relsXml) },
    ...sheetXmls.map((xml, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(xml) })),
  ];
  if (useSharedStrings) entries.push({ path: 'xl/sharedStrings.xml', data: enc.encode(sharedXml) });
  return writeZipEntries(entries);
}
