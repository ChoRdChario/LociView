// プロジェクトパッケージ (.lociview) の入出力 (docs/02 §2, §7)
// - export: ワークスペース → ZIP（ops原文そのまま + snapshot.json + captions.csv 同梱）
// - inspect: ZIP → 構造解析（open / merge / 外部形式 の振り分け材料）
// - importNewProject: ZIP → ワークスペースへ新規展開（ops原文を無改変で保存 = 未知フィールド素通し）
// - mergeFromInspection: 開いているプロジェクトへの取込

import { parseHlc } from '../core/hlc';
import { parseOpsJsonl } from '../core/jsonl';
import { parseManifest, type ProjectManifest } from '../core/manifest';
import { mergeOps, type MergeReport } from '../core/merge';
import { reduce, versionVector, visibleEntities, type ProjectState } from '../core/reduce';
import type { Op } from '../core/schema';
import type { ProjectStore } from '../core/store';
import type { WorkspaceFS } from '../platform/fs';
import { buildCaptionsCsv } from '../io/csv';
import {
  readZipEntries,
  sanitizeZipPath,
  writeZipEntries,
  type ZipEntryData,
  type ZipLimits,
} from './zipio';
import { writeVerifiedBytes } from './verifiedWrite';

const decoder = new TextDecoder();
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const ACTOR_ID_PATTERN = /^a_[0-9A-HJKMNP-TV-Z]{13}$/u;

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
  const manifest = manifestEntry !== undefined
    ? parseManifest(fatalUtf8Decoder.decode(manifestEntry.data))
    : null;

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

  // Snapshot every caller-owned value before the first await. The raw JSONL is
  // the imported authority; insp.ops is only an inspection convenience.
  const manifest = parseManifest(JSON.stringify(structuredClone(insp.manifest)));
  const markerBytes = encoder.encode(JSON.stringify(manifest, null, 2));
  const reportedOpsErrorCount = insp.opsErrorCount;
  const opsFiles = insp.opsFiles.map((file) => ({
    path: file.path,
    text: file.text,
    bytes: encoder.encode(file.text),
  }));
  const binaries = uniqueBinaryRegistry(
    insp.binaries.map((entry) => ({ path: entry.path, data: new Uint8Array(entry.data) })),
    'importNewProject',
  );
  const parsedOps: Op[] = [];
  const opsPaths = new Set<string>();
  for (const file of opsFiles) {
    const actor = importOpsActor(file.path);
    if (actor === null || opsPaths.has(file.path)) {
      throw new Error(`importNewProject: invalid or duplicate operation log ${file.path}`);
    }
    opsPaths.add(file.path);
    const parsed = parseOpsJsonl(file.text);
    if (parsed.errors.length > 0) {
      throw new Error(`importNewProject: malformed operation log ${file.path}`);
    }
    if (parsed.ops.some((op) => {
      try {
        return op.actor !== actor || parseHlc(op.hlc).actor !== actor;
      } catch {
        return true;
      }
    })) {
      throw new Error(`importNewProject: operation actor does not match ${file.path}`);
    }
    parsedOps.push(...parsed.ops);
  }
  if (reportedOpsErrorCount !== 0) {
    throw new Error('importNewProject: inspection contains malformed operations');
  }
  for (const path of binaries.keys()) {
    if (
      !path.startsWith('models/') &&
      !path.startsWith('media/') &&
      !path.startsWith('thumbs/')
    ) {
      throw new Error(`importNewProject: invalid binary path ${path}`);
    }
  }

  const required = requiredImportBlobClosure(reduce(parsedOps));
  for (const [path, expectedSize] of required) {
    const source = binaries.get(path);
    if (source === undefined) throw new Error(`importNewProject: missing required binary ${path}`);
    if (expectedSize !== null && source.length !== expectedSize) {
      throw new Error(`importNewProject: binary size mismatch for ${path}`);
    }
  }

  const markerPath = `${dir}/lociview.json`;
  if (await fs.readBytes(markerPath) !== null) {
    throw new Error(`importNewProject: target is already active (${dir})`);
  }
  const expectedActiveLogs = [...opsPaths].map((path) => `${dir}/${path}`).sort();
  const expectedActiveLogSet = new Set(expectedActiveLogs);
  const existingActiveLogs = (await fs.list(`${dir}/ops/`))
    .filter((path) => path.endsWith('.jsonl'));
  if (existingActiveLogs.some((path) => !expectedActiveLogSet.has(path))) {
    throw new Error(`importNewProject: target contains an unexpected active log (${dir})`);
  }

  for (const file of opsFiles) {
    await writeVerifiedBytes(fs, `${dir}/${file.path}`, file.bytes); // raw bytes preserve unknown fields
  }
  for (const [path, data] of binaries) {
    await writeVerifiedBytes(fs, `${dir}/${path}`, data);
  }

  const activeLogs = (await fs.list(`${dir}/ops/`))
    .filter((path) => path.endsWith('.jsonl'))
    .sort();
  if (
    activeLogs.length !== expectedActiveLogs.length ||
    activeLogs.some((path, index) => path !== expectedActiveLogs[index])
  ) {
    throw new Error(`importNewProject: active operation log inventory changed (${dir})`);
  }
  for (const file of opsFiles) {
    const stored = await fs.readBytes(`${dir}/${file.path}`);
    if (stored === null || !bytesEqual(stored, file.bytes)) {
      throw new Error(`importNewProject: operation log verification failed for ${file.path}`);
    }
    const parsed = parseOpsJsonl(decoder.decode(stored));
    if (parsed.errors.length > 0) {
      throw new Error(`importNewProject: stored operation log is malformed ${file.path}`);
    }
  }
  for (const [path, data] of binaries) {
    const stored = await fs.readBytes(`${dir}/${path}`);
    if (stored === null || !bytesEqual(stored, data)) {
      throw new Error(`importNewProject: binary verification failed for ${path}`);
    }
  }
  for (const [path, expectedSize] of required) {
    const expected = binaries.get(path)!;
    const stored = await fs.readBytes(`${dir}/${path}`);
    if (
      stored === null ||
      !bytesEqual(stored, expected) ||
      (expectedSize !== null && stored.length !== expectedSize)
    ) {
      throw new Error(`importNewProject: required binary verification failed for ${path}`);
    }
  }

  await writeVerifiedBytes(fs, markerPath, markerBytes);
  return manifest.projectId;
}

function importOpsActor(path: string): string | null {
  if (
    path === '' ||
    sanitizeZipPath(path) !== path ||
    !path.startsWith('ops/') ||
    !path.endsWith('.jsonl')
  ) {
    return null;
  }
  const filename = path.slice('ops/'.length);
  if (filename.length <= '.jsonl'.length || filename.includes('/')) return null;
  const actor = filename.slice(0, -'.jsonl'.length);
  return ACTOR_ID_PATTERN.test(actor) ? actor : null;
}

function requiredImportBlobClosure(state: ProjectState): Map<string, number | null> {
  const required = new Map<string, number | null>();
  for (const asset of visibleEntities(state, 'asset')) {
    registerImportRequiredBlob(required, asset.fields.path, asset.fields.size, ['models/', 'media/']);
    const optimizedPath = asset.fields.optimizedPath;
    if (optimizedPath !== undefined && optimizedPath !== '') {
      registerImportRequiredBlob(required, optimizedPath, asset.fields.optimizedSize, ['models/']);
    }
  }
  return required;
}

function registerImportRequiredBlob(
  required: Map<string, number | null>,
  rawPath: unknown,
  rawSize: unknown,
  namespaces: readonly ('models/' | 'media/')[],
): void {
  if (
    typeof rawPath !== 'string' ||
    rawPath === '' ||
    rawPath.endsWith('/') ||
    sanitizeZipPath(rawPath) !== rawPath ||
    !namespaces.some((namespace) => rawPath.startsWith(namespace))
  ) {
    throw new Error(`importNewProject: invalid required binary path ${String(rawPath)}`);
  }
  let size: number | null;
  if (rawSize === undefined) size = null;
  else if (typeof rawSize === 'number' && Number.isSafeInteger(rawSize) && rawSize >= 0) size = rawSize;
  else throw new Error(`importNewProject: invalid required binary size for ${rawPath}`);

  const previous = required.get(rawPath);
  if (previous !== undefined && previous !== null && size !== null && previous !== size) {
    throw new Error(`importNewProject: conflicting required binary size for ${rawPath}`);
  }
  required.set(rawPath, previous ?? size);
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
  const reportedOpsErrorCount = insp.opsErrorCount;
  if (reportedOpsErrorCount !== 0) {
    throw new Error('merge: inspection contains malformed operations');
  }
  const incomingOps = structuredClone(insp.ops);
  const binaries = uniqueBinaryRegistry(insp.binaries);
  await store.flush();
  const baselineOps = structuredClone([...store.allOps]);
  const baselineOpsSnapshot = JSON.stringify(baselineOps);
  const baselineState = store.state;
  const preview = mergeOps(baselineOps, incomingOps);
  const required = requiredBlobClosure(preview.stateAfter, baselineState);
  const writes: Array<{ path: string; data: Uint8Array }> = [];
  const expectedBytes = new Map<string, Uint8Array>();

  for (const [path, expectedSize] of required) {
    const source = binaries.get(path);
    if (source !== undefined && expectedSize !== null && source.length !== expectedSize) {
      throw new Error(`merge: binary size mismatch for ${path}`);
    }
    const absolutePath = `${dir}/${path}`;
    const existing = await fs.readBytes(absolutePath);
    if (source !== undefined) {
      if (existing === null) {
        writes.push({ path: absolutePath, data: source });
      } else if (!bytesEqual(existing, source)) {
        throw new Error(`merge: binary collision for ${path}`);
      }
      expectedBytes.set(path, new Uint8Array(source));
    } else if (existing === null) {
      throw new Error(`merge: missing required binary ${path}`);
    } else {
      expectedBytes.set(path, new Uint8Array(existing));
    }
    if (existing !== null && expectedSize !== null && existing.length !== expectedSize) {
      throw new Error(`merge: required binary verification failed for ${path}`);
    }
  }

  for (const write of writes) await writeVerifiedBytes(fs, write.path, write.data);
  for (const [path, expected] of expectedBytes) {
    const stored = await fs.readBytes(`${dir}/${path}`);
    if (stored === null || !bytesEqual(stored, expected)) {
      throw new Error(`merge: required binary verification failed for ${path}`);
    }
  }
  if (
    store.allOps.length !== baselineOps.length ||
    JSON.stringify(store.allOps) !== baselineOpsSnapshot
  ) {
    throw new Error('merge: target changed during binary preflight');
  }

  const report = store.mergeExternal(incomingOps);
  await store.flush();
  return report;
}

function uniqueBinaryRegistry(
  entries: readonly ZipEntryData[],
  operation = 'merge',
): Map<string, Uint8Array> {
  const registry = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (
      entry.path === '' ||
      entry.path.endsWith('/') ||
      sanitizeZipPath(entry.path) !== entry.path
    ) {
      throw new Error(`${operation}: invalid binary path ${entry.path}`);
    }
    if (registry.has(entry.path)) throw new Error(`${operation}: duplicate binary path ${entry.path}`);
    registry.set(entry.path, new Uint8Array(entry.data));
  }
  return registry;
}

function requiredBlobClosure(
  state: ProjectState,
  baselineState: ProjectState,
): Map<string, number | null> {
  const required = new Map<string, number | null>();
  const baselineAssets = new Map(
    visibleEntities(baselineState, 'asset').map((asset) => [asset.id, asset.fields]),
  );
  for (const asset of visibleEntities(state, 'asset')) {
    const baselineFields = baselineAssets.get(asset.id);
    registerRequiredBlob(
      required,
      asset.fields.path,
      asset.fields.size,
      baselineFields !== undefined,
      baselineFields?.path,
      baselineFields?.size,
      ['models/', 'media/'],
      true,
    );
    const optimizedPath = asset.fields.optimizedPath;
    if (optimizedPath !== undefined && optimizedPath !== '') {
      registerRequiredBlob(
        required,
        optimizedPath,
        asset.fields.optimizedSize,
        baselineFields !== undefined,
        baselineFields?.optimizedPath,
        baselineFields?.optimizedSize,
        ['models/'],
        true,
      );
    }
  }
  return required;
}

function registerRequiredBlob(
  required: Map<string, number | null>,
  rawPath: unknown,
  rawSize: unknown,
  baselineExists: boolean,
  baselinePath: unknown,
  baselineSize: unknown,
  namespaces: readonly ('models/' | 'media/')[],
  pathRequired: boolean,
): void {
  const referenceChanged =
    !baselineExists ||
    !Object.is(rawPath, baselinePath) ||
    !Object.is(rawSize, baselineSize);
  if (typeof rawPath !== 'string') {
    if (!referenceChanged || (!pathRequired && rawPath === undefined)) return;
    throw new Error(`merge: invalid required binary path ${String(rawPath)}`);
  }
  const invalidPath =
    rawPath === '' ||
    sanitizeZipPath(rawPath) !== rawPath ||
    !namespaces.some((namespace) => rawPath.startsWith(namespace)) ||
    rawPath.endsWith('/');
  if (invalidPath) {
    if (!referenceChanged) return;
    throw new Error(`merge: invalid required binary path ${String(rawPath)}`);
  }
  let size: number | null;
  if (rawSize === undefined) {
    if (referenceChanged) throw new Error(`merge: missing required binary size for ${rawPath}`);
    size = null;
  } else if (typeof rawSize === 'number' && Number.isSafeInteger(rawSize) && rawSize >= 0) {
    size = rawSize;
  } else {
    throw new Error(`merge: invalid required binary size for ${rawPath}`);
  }
  const previous = required.get(rawPath);
  if (previous !== undefined && previous !== null && size !== null && previous !== size) {
    throw new Error(`merge: conflicting required binary size for ${rawPath}`);
  }
  required.set(rawPath, previous ?? size);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
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
