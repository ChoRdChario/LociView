// プロジェクトパッケージ (.lociview) の入出力 (docs/02 §2, §7)
// - export: ワークスペース → ZIP（ops原文そのまま + snapshot.json + captions.csv 同梱）
// - inspect: ZIP → 構造解析（open / merge / 外部形式 の振り分け材料）
// - importNewProject: ZIP → ワークスペースへ新規展開（ops原文を無改変で保存 = 未知フィールド素通し）
// - mergeFromInspection: 開いているプロジェクトへの取込

import { parseOpsJsonl } from '../core/jsonl';
import { parseManifest, type ProjectManifest } from '../core/manifest';
import type { MergeReport } from '../core/merge';
import { reduce, versionVector } from '../core/reduce';
import type { Op } from '../core/schema';
import type { ProjectStore } from '../core/store';
import type { WorkspaceFS } from '../platform/fs';
import { buildCaptionsCsv } from '../io/csv';
import { readZipEntries, writeZipEntries, type ZipEntryData, type ZipLimits } from './zipio';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** ZIP内の分類結果 */
export interface ZipInspection {
  kind: 'lociview' | 'foreign';
  manifest: ProjectManifest | null;
  /** ops原文（無改変保存用） */
  opsFiles: { path: string; text: string }[];
  /** パース済みop（マージ・表示用）。破損行はスキップ済み */
  ops: Op[];
  opsErrorCount: number;
  /** models/ media/ thumbs/ のバイナリ */
  binaries: ZipEntryData[];
  /** 上記以外（foreign判定時のウィザード用材料） */
  others: ZipEntryData[];
}

export async function inspectZip(bytes: Uint8Array, limits?: ZipLimits): Promise<ZipInspection> {
  const entries = await readZipEntries(bytes, limits);
  const manifestEntry = entries.find((e) => e.path === 'lociview.json');
  const manifest = manifestEntry !== undefined ? parseManifest(decoder.decode(manifestEntry.data)) : null;

  const opsFiles: { path: string; text: string }[] = [];
  const ops: Op[] = [];
  let opsErrorCount = 0;
  const binaries: ZipEntryData[] = [];
  const others: ZipEntryData[] = [];

  for (const e of entries) {
    if (e.path === 'lociview.json' || e.path === 'snapshot.json' || e.path === 'captions.csv') continue;
    if (e.path.startsWith('ops/') && e.path.endsWith('.jsonl')) {
      const text = decoder.decode(e.data);
      const parsed = parseOpsJsonl(text);
      opsFiles.push({ path: e.path, text });
      ops.push(...parsed.ops);
      opsErrorCount += parsed.errors.length;
    } else if (e.path.startsWith('models/') || e.path.startsWith('media/') || e.path.startsWith('thumbs/')) {
      binaries.push(e);
    } else {
      others.push(e);
    }
  }

  return {
    kind: manifest !== null ? 'lociview' : 'foreign',
    manifest,
    opsFiles,
    ops,
    opsErrorCount,
    binaries,
    others,
  };
}

/** 新規プロジェクトとしてワークスペースへ展開する。dirは 'projects/<projectId>' 想定 */
export async function importNewProject(fs: WorkspaceFS, dir: string, insp: ZipInspection): Promise<string> {
  if (insp.kind !== 'lociview' || insp.manifest === null) {
    throw new Error('importNewProject: not a lociview package');
  }
  await fs.writeText(`${dir}/lociview.json`, JSON.stringify(insp.manifest, null, 2));
  for (const f of insp.opsFiles) {
    await fs.writeText(`${dir}/${f.path}`, f.text); // 原文のまま（未知フィールド保持）
  }
  for (const b of insp.binaries) {
    await fs.writeBytes(`${dir}/${b.path}`, b.data);
  }
  return insp.manifest.projectId;
}

/** 開いているプロジェクトへZIPをマージする。バイナリは未知のものだけコピー */
export async function mergeFromInspection(
  fs: WorkspaceFS,
  dir: string,
  store: ProjectStore,
  insp: ZipInspection,
): Promise<MergeReport> {
  if (insp.kind !== 'lociview' || insp.manifest === null) {
    throw new Error('merge: not a lociview package');
  }
  if (insp.manifest.projectId !== store.manifest.projectId) {
    throw new Error(
      `merge: project mismatch (${insp.manifest.projectId} != ${store.manifest.projectId})`,
    );
  }
  const report = store.mergeExternal(insp.ops);
  for (const b of insp.binaries) {
    const path = `${dir}/${b.path}`;
    if (!(await fs.exists(path))) {
      await fs.writeBytes(path, b.data);
    }
  }
  await store.flush();
  return report;
}

/** ワークスペースのプロジェクトをZIPへ書き出す */
export async function exportProjectZip(fs: WorkspaceFS, dir: string, store: ProjectStore): Promise<Uint8Array> {
  await store.flush();
  const entries: ZipEntryData[] = [];

  const manifestText = await fs.readText(`${dir}/lociview.json`);
  if (manifestText === null) throw new Error('export: missing manifest');
  entries.push({ path: 'lociview.json', data: encoder.encode(manifestText) });

  for (const file of await fs.list(`${dir}/ops/`)) {
    if (!file.endsWith('.jsonl')) continue;
    const data = await fs.readBytes(file);
    if (data !== null) entries.push({ path: file.slice(dir.length + 1), data });
  }

  for (const prefix of ['models/', 'media/', 'thumbs/'] as const) {
    for (const file of await fs.list(`${dir}/${prefix}`)) {
      const data = await fs.readBytes(file);
      if (data !== null) entries.push({ path: file.slice(dir.length + 1), data });
    }
  }

  // 派生キャッシュ: snapshot.json（高速起動用）と captions.csv（人間閲覧用）
  const state = reduce([...store.allOps]);
  const snapshot = {
    schemaVersion: store.manifest.schemaVersion,
    vector: versionVector([...store.allOps]),
    state,
  };
  entries.push({ path: 'snapshot.json', data: encoder.encode(JSON.stringify(snapshot)) });
  entries.push({ path: 'captions.csv', data: encoder.encode(buildCaptionsCsv(state)) });

  return writeZipEntries(entries);
}

/** opsのみの軽量差分ZIP (docs/05 §3.5)。相手が原本を持っている回覧運用向け */
export async function exportOpsOnlyZip(fs: WorkspaceFS, dir: string, store: ProjectStore): Promise<Uint8Array> {
  await store.flush();
  const entries: ZipEntryData[] = [];
  const manifestText = await fs.readText(`${dir}/lociview.json`);
  if (manifestText === null) throw new Error('export: missing manifest');
  entries.push({ path: 'lociview.json', data: encoder.encode(manifestText) });
  for (const file of await fs.list(`${dir}/ops/`)) {
    if (!file.endsWith('.jsonl')) continue;
    const data = await fs.readBytes(file);
    if (data !== null) entries.push({ path: file.slice(dir.length + 1), data });
  }
  return writeZipEntries(entries);
}
