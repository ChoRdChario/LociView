import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkedProof, fail, type MetadataLimits, type MetadataProof } from '../projectMetadata/format';
import { json, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import { checkRemoteHeads } from '../projectMetadata/remote';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { packageByteHash } from './manifest';

export type RestoreCurrent = { generationId: string | null; publicationId: string; publication: EvidenceRef;
  source: { proof: MetadataProof; heads: string[]; token: string }; bases: EvidenceRef };
export type RestorePrepared = { schema: 'lociview-local-restore-prepared-1'; jobId: string;
  archive: EvidenceRef; manifest: EvidenceRef; metadata: EvidenceRef; protectedInventory: EvidenceRef;
  exchangeBases: EvidenceRef; baseEvidence: EvidenceRef[] };
export type RestoreStart = { schema: 'lociview-local-restore-start-1'; jobId: string; prepared: EvidenceRef;
  previousSelection: EvidenceRef | null; current: RestoreCurrent };
export type GenerationSelection = { schema: 'lociview-local-generation-selection-1'; previous: EvidenceRef | null;
  jobId: string; start: EvidenceRef; destination: { journal: EvidenceRef; publication: EvidenceRef; baseBinding: EvidenceRef } };
export type RestoreResult = { schema: 'lociview-local-restore-result-1'; jobId: string; start: EvidenceRef;
  detail: { kind: 'selected'; selection: EvidenceRef } | { kind: 'cancelled'; stage: 'beforeSelection' | 'beforeInitializationWithoutIndex' } };
export type RestoreControlJob = { id: string; prepared: RestorePrepared | null; start: RestoreStart | null;
  indexed: boolean; dbOpened: boolean; result: RestoreResult | null; abandoned: boolean; destinationFiles: string[] };

export const restoreRef = (value: unknown): EvidenceRef => {
  const bytes = new TextEncoder().encode(json(value)); return { sha256: packageByteHash(bytes), byteLength: bytes.length };
};
export const restoreEqual = (a: unknown, b: unknown) => json(a) === json(b);
export function restoreRoot(fs: ProjectWorkspaceFS) {
  const root = fs.projectRoot;
  if (root !== null && (!root || root.includes('\\') || root.includes('\0') || root.split('/').some(p => !p || p === '.' || p === '..') ||
    /(^|\/)v2\/(generations|local-restore)(\/|$)/.test(root))) fail('restore-logical-root');
  return root ? `${root}/` : '';
}
export const restoreJobPath = (fs: ProjectWorkspaceFS, id: string, name: string) =>
  `${restoreRoot(fs)}v2/local-restore/jobs/${technicalId(id)}/${name}`;
export function restoreLimits(limits: MetadataLimits): MetadataLimits {
  return { ...limits, maxTotalBytes: Math.min(limits.maxTotalBytes, L.controlBytes), maxDepth: Math.min(limits.maxDepth, L.maxDepth),
    maxNodes: Math.min(limits.maxNodes, L.maxNodes), maxStringScalars: Math.min(limits.maxStringScalars, L.maxStringScalars) };
}
/** Existing local package working-space limit; size metadata only, never load retained bodies. */
export async function reserveRestoreControls(fs: ProjectWorkspaceFS, controls: readonly unknown[], additionalEntries: number, archiveBytes = 0) {
  const root = restoreRoot(fs), prefix = `${root}v2/local-restore/`, paths = await fs.list(root);
  const local = paths.filter(p => p.startsWith(prefix) || p.startsWith(`${root}v2/generations/`));
  if (paths.length + additionalEntries > L.entryCount || local.length + additionalEntries > L.entryCount) fail('restore-entry-budget');
  let retained = 0, controlBytes = 0;
  for (const path of paths) {
    if (!path.startsWith(root)) fail('restore-space-path');
    const file = await fs.readStream(path);
    if (!file || !Number.isSafeInteger(file.size) || file.size < 0) return fail('restore-space-read');
    retained += file.size; if (path.startsWith(prefix) && path.endsWith('.json')) controlBytes += file.size;
    if (retained > 2_147_483_648 - 16_777_216) fail('restore-space-budget');
  }
  const added = controls.reduce<number>((n, v) => n + restoreRef(v).byteLength, 0);
  if (controls.some(v => restoreRef(v).byteLength > L.controlBytes) || controlBytes + added > L.controlsBytes) fail('restore-control-budget');
  if (retained + archiveBytes + added > 2_147_483_648 - 16_777_216) fail('restore-space-budget');
}
export async function writeRestoreControl(fs: ProjectWorkspaceFS, path: string, value: unknown, limits: MetadataLimits) {
  const prior = await fs.readStream(path);
  if (!prior) await reserveRestoreControls(fs, [value], 1);
  await writeReceipt(fs, path, value, restoreLimits(limits));
}
function shape(value: any, keys: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys) fail('restore-control-shape');
}
function reference(value: EvidenceRef, max: number = L.controlBytes) {
  shape(value, 'byteLength,sha256');
  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.byteLength) ||
    value.byteLength <= 0 || value.byteLength > max) fail('restore-reference');
}
export function checkRestoreCurrent(value: RestoreCurrent, limits: MetadataLimits) {
  shape(value, 'bases,generationId,publication,publicationId,source');
  if (value.generationId !== null) technicalId(value.generationId);
  technicalId(value.publicationId); reference(value.publication); reference(value.bases, L.controlsBytes);
  shape(value.source, 'heads,proof,token'); checkedProof(value.source.proof, limits); checkRemoteHeads(value.source.heads);
  if (value.source.heads.length > L.heads || value.source.token !== `${value.source.proof.envelope.adapterFormatVersion}:${value.source.proof.envelope.lineageProof.rootChangeHash}:${value.source.heads.join(',')}`)
    fail('restore-current-source');
}
function prepared(value: RestorePrepared, id: string) {
  shape(value, 'archive,baseEvidence,exchangeBases,jobId,manifest,metadata,protectedInventory,schema');
  if (value.schema !== 'lociview-local-restore-prepared-1' || value.jobId !== id) fail('restore-prepared');
  reference(value.archive, L.archiveBytes); reference(value.manifest); reference(value.metadata, L.sourceBytes);
  reference(value.exchangeBases); reference(value.protectedInventory);
  if (!Array.isArray(value.baseEvidence) || value.baseEvidence.length > L.baseEvidenceCount) fail('restore-evidence-budget');
  let total = 0, prior = '';
  for (const ref of value.baseEvidence) {
    reference(ref, L.sourceBytes); total += ref.byteLength;
    if (ref.sha256 <= prior || total > L.baseEvidenceBytes) fail('restore-evidence-budget'); prior = ref.sha256;
  }
}

/** Structural control inspection only: never grants a selected destination capability. */
export async function readRestoreControls(fs: ProjectWorkspaceFS, limits: MetadataLimits) {
  const prefix = `${restoreRoot(fs)}v2/local-restore/`, paths = await fs.list(prefix), readLimits = restoreLimits(limits);
  if (paths.length > L.entryCount || new Set(paths).size !== paths.length) fail('restore-control-budget');
  const byJob = new Map<string, Map<string, string>>(), selectionPaths: string[] = [], sizes = new Map<string, number>();
  let controlBytes = 0, nodes = 0, work = 0;
  for (const path of paths) {
    if (!path.startsWith(prefix)) fail('restore-control-path');
    const local = path.slice(prefix.length), job = /^jobs\/([0-9a-f]{32})\/(input\.zip|prepared\.json|start\.json|db-opened\.json|result\.json|abandoned\.json)$/.exec(local),
      index = /^index\/([0-9a-f]{32})\.json$/.exec(local);
    if (job || index) {
      const id = (job ?? index)![1]!, files = byJob.get(id) ?? new Map<string, string>();
      files.set(job ? job[2]! : 'index', path); byJob.set(id, files);
    } else if (/^selections\/[0-9a-f]{64}\.json$/.test(local)) selectionPaths.push(path);
    else fail('restore-control-path');
    const file = await fs.readStream(path);
    if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > (job?.[2] === 'input.zip' ? L.archiveBytes : readLimits.maxTotalBytes)) return fail('restore-control-size');
    sizes.set(path, file.size);
    if (job?.[2] !== 'input.zip') { controlBytes += file.size; if (controlBytes > L.controlsBytes) fail('restore-control-budget'); }
  }
  const read = async <T>(path: string): Promise<T> => {
    const value = await readReceipt<T>(fs, path, readLimits); if (!value) return fail('restore-control-missing');
    if (restoreRef(value).byteLength !== sizes.get(path)) fail('restore-control-changed');
    // Cumulative parsing/inspection budget, including all retained jobs.
    const pending: unknown[] = [value];
    while (pending.length) {
      const item = pending.pop(); if (++nodes > L.inspectionNodes || ++work > L.inspectionWork) fail('restore-inspection-budget');
      if (item && typeof item === 'object') for (const child of Object.values(item)) pending.push(child);
      else if (typeof item === 'string') { work += item.length; if (work > L.inspectionWork) fail('restore-inspection-budget'); }
    }
    return value;
  };
  const jobs: RestoreControlJob[] = [];
  for (const [id, files] of byJob) {
    const start = files.has('start.json') ? await read<RestoreStart>(files.get('start.json')!) : null;
    const abandoned = files.has('abandoned.json');
    if (abandoned && !restoreEqual(await read(files.get('abandoned.json')!), { schema: 'lociview-local-restore-abandoned-1', jobId: id, stage: 'beforeStart' })) fail('restore-abandoned');
    if (!start) {
      if (files.has('index') || files.has('db-opened.json') || files.has('result.json')) fail('restore-start-missing');
      // Pre-Start bytes may be torn; abandonment does not trust or overwrite them.
      jobs.push({ id, prepared: null, start: null, indexed: false, dbOpened: false, result: null, abandoned, destinationFiles: [] }); continue;
    }
    if (abandoned) fail('restore-input-state');
    shape(start, 'current,jobId,prepared,previousSelection,schema');
    if (start.schema !== 'lociview-local-restore-start-1' || start.jobId !== id) fail('restore-start');
    reference(start.prepared); if (start.previousSelection !== null) reference(start.previousSelection);
    checkRestoreCurrent(start.current, limits);
    if (start.current.generationId === id) fail('restore-start');
    const description = files.has('prepared.json') ? await read<RestorePrepared>(files.get('prepared.json')!) : null;
    if (!description || !restoreEqual(restoreRef(description), start.prepared)) return fail('restore-prepared-missing');
    prepared(description, id);
    if (!files.has('input.zip') || sizes.get(files.get('input.zip')!) !== description.archive.byteLength) fail('restore-input-missing');
    const indexed = files.has('index'), dbOpened = files.has('db-opened.json'), startRef = restoreRef(start);
    if (indexed && !restoreEqual(await read(files.get('index')!), { schema: 'lociview-local-restore-index-1', jobId: id, start: startRef })) fail('restore-index');
    if (dbOpened && (!indexed || !restoreEqual(await read(files.get('db-opened.json')!), {
      schema: 'lociview-local-restore-db-opened-1', jobId: id, start: startRef, generationId: id }))) fail('restore-db-opened');
    const result = files.has('result.json') ? await read<RestoreResult>(files.get('result.json')!) : null;
    if (result) {
      shape(result, 'detail,jobId,schema,start');
      if (result.schema !== 'lociview-local-restore-result-1' || result.jobId !== id || !restoreEqual(result.start, startRef)) fail('restore-result');
      if (result.detail?.kind === 'selected') { shape(result.detail, 'kind,selection'); reference(result.detail.selection); if (!indexed || !dbOpened) fail('restore-selected-incomplete'); }
      else {
        shape(result.detail, 'kind,stage');
        if (result.detail.kind !== 'cancelled' || result.detail.stage !== (indexed ? 'beforeSelection' : 'beforeInitializationWithoutIndex') || !indexed && dbOpened) fail('restore-cancelled');
      }
    }
    jobs.push({ id, prepared: description, start, indexed, dbOpened, result, abandoned: false, destinationFiles: [] });
  }
  const jobMap = new Map(jobs.map(job => [job.id, job])), selections: GenerationSelection[] = [];
  for (const path of selectionPaths) {
    const s = await read<GenerationSelection>(path);
    shape(s, 'destination,jobId,previous,schema,start');
    if (s.schema !== 'lociview-local-generation-selection-1' || path !== `${prefix}selections/${restoreRef(s).sha256}.json`) fail('restore-selection');
    technicalId(s.jobId); reference(s.start); if (s.previous !== null) reference(s.previous);
    shape(s.destination, 'baseBinding,journal,publication'); for (const r of Object.values(s.destination)) reference(r);
    const job = jobMap.get(s.jobId);
    if (!job?.start || !job.indexed || !job.dbOpened || job.result?.detail.kind === 'cancelled' || !restoreEqual(s.start, restoreRef(job.start)) ||
      !restoreEqual(s.previous, job.start.previousSelection) || selections.some(v => v.jobId === s.jobId)) fail('restore-selection-job');
    selections.push(s);
  }
  const chain: GenerationSelection[] = []; let previous: EvidenceRef | null = null;
  for (;;) {
    const next = selections.filter(s => restoreEqual(s.previous, previous));
    if (next.length > 1) fail('restore-selection-fork'); if (!next.length) break;
    chain.push(next[0]!); previous = restoreRef(next[0]); if (chain.length > selections.length) fail('restore-selection-cycle');
  }
  if (chain.length !== selections.length) fail('restore-selection-predecessor');
  for (const job of jobs) {
    if (!job.start) continue;
    const parent = job.start.previousSelection === null ? null : chain.find(s => restoreEqual(restoreRef(s), job.start!.previousSelection));
    if (parent === undefined || job.start.current.generationId !== (parent?.jobId ?? null)) fail('restore-start-selection');
    if (job.result?.detail.kind === 'selected') {
      const selected = chain.find(s => s.jobId === job.id);
      if (!selected || !restoreEqual(restoreRef(selected), job.result.detail.selection)) fail('restore-selected-missing');
    }
  }
  const generations = `${restoreRoot(fs)}v2/generations/`, generationFiles = await fs.list(generations);
  if (paths.length + generationFiles.length > L.entryCount) fail('restore-entry-budget');
  for (const path of generationFiles) {
    if (!path.startsWith(generations)) fail('restore-generation-path');
    const match = /^([0-9a-f]{32})\/(.+)$/.exec(path.slice(generations.length)), job = match && jobMap.get(match[1]!);
    if (!job?.start || !job.indexed || !job.dbOpened || path.includes('\\') || path.includes('\0') || path.split('/').some(p => !p || p === '.' || p === '..')) return fail('restore-orphan-generation');
    job.destinationFiles.push(path);
  }
  const pending = jobs.filter(job => !job.abandoned && !job.result && !chain.some(s => s.jobId === job.id));
  if (pending.length > 1 || pending.some(job => job.start && !restoreEqual(job.start.previousSelection, previous))) fail('restore-pending-chain');
  return { jobs, selections: chain, tail: chain.at(-1) ?? null, selection: previous, pending: pending[0] ?? null };
}

/** Host supplies successfully enumerated IDs for this logical Project's DB family. */
export async function reconcileRestoreDatabases(fs: ProjectWorkspaceFS, limits: MetadataLimits, listGenerations: () => Promise<string[]>) {
  const state = await readRestoreControls(fs, limits), ids = [...await listGenerations()];
  if (ids.length > L.entryCount || new Set(ids).size !== ids.length) fail('restore-database-list');
  for (const id of ids) {
    technicalId(id); const job = state.jobs.find(job => job.id === id);
    if (!job?.start || !job.indexed || job.result?.detail.kind === 'cancelled' && job.result.detail.stage === 'beforeInitializationWithoutIndex') fail('restore-orphan-database');
  }
  for (const job of state.jobs) if (job.dbOpened && !ids.includes(job.id)) fail('restore-database-missing');
  return { ...state, databaseIds: ids };
}
