import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { checkRequiredCapabilities } from '../projectMetadata/requiredCapabilities';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { json, newId, readReceipt, technicalId, withMetadataRead, writeReceipt } from '../projectMetadata/persistence';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { packageByteHash, readManifestControl, canonicalControl } from './manifest';
import { BackupArchive, prepareBackupManifest } from './backupArchive';
import { BackupSourceCapture } from './backupSource';
import { backupEncode, inspectBackupOriginals } from './backupEvidence';
import { packageSourceLimits } from './contributionEvidence';
import { writeCausalArchive } from './workspaceArchive';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { workspacePackageRoot, encodePackageValue, evidenceReference } from './workspaceBases';
import { checkAbort } from './zipChecks';

const ref = evidenceReference, encode = encodePackageValue, reference = (v: unknown) => ref(encode(v));
const root = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}backup-output/${technicalId(id)}/`;
const indexPath = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}backup-output-index/${technicalId(id)}.json`;
const unique = (refs: EvidenceRef[]) => [...new Map(refs.map(r => [r.sha256, r])).values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
type Description = Awaited<ReturnType<typeof inspectBackupOriginals>>;
interface Inputs { manifest: Uint8Array; originals: readonly { path: string; bytes: Uint8Array }[]; description: Description }
type Artifact = { kind: 'artifactVerified'; archive: EvidenceRef; location: 'opfsArtifact'; sinkId: string };
type Detail = Artifact | { kind: 'externalFileVerified'; archive: EvidenceRef; sinkId: string; profile: 'reselectedFileV1' } |
  { kind: 'cancelled'; stage: 'beforeArtifact' };
interface Step { schema: 'lociview-package-job-step-1'; jobId: string; start: EvidenceRef; previous: EvidenceRef | null; detail: Detail }
const checkRef = (r: EvidenceRef) => {
  if (!r || Object.keys(r).sort().join(',') !== 'byteLength,sha256' || typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256) ||
    !Number.isSafeInteger(r.byteLength) || r.byteLength <= 0 || r.byteLength > L.archiveBytes) fail('output-reference');
};

export type BackupOutputTiming = (stage: 'ready-before' | 'slot-before' | 'protection-before' | 'ready-final' | 'ready-finish' | 'slot-finish' | 'protection-finish' | 'capture' | 'persist' | 'finish' | 'job' | 'inputs-before' | 'space' | 'stream-close' | 'artifact-inspect' | 'inputs-after' | 'receipt', milliseconds: number) => void;
/** Optional local observations have no authority over output or recovery. */
export function measureBackupOutput<T>(observer: BackupOutputTiming | undefined, stage: Parameters<BackupOutputTiming>[0], action: () => Promise<T>): Promise<T> {
  if (!observer) return action();
  const started = performance.now();
  return action().finally(() => { try { observer(stage, performance.now() - started); } catch { /* Diagnostics have no authority. */ } });
}

/** Frozen manual backup. No base advancement, automatic promotion or restore authority. */
export class BackupOutputJob {
  readonly source: ProjectMetadataSource;
  private constructor(private readonly fs: ProjectWorkspaceFS, readonly id: string, private readonly limits: MetadataLimits,
    private readonly inputs: Inputs, readonly label?: string, sourceFromOpen?: ProjectMetadataSource) {
    technicalId(id); checkedBackupLabel(label); const m = this.manifest();
    this.source = sourceFromOpen ?? ProjectMetadataSource.fromFullSource(this.original('metadata.am'), { identity: m.identity, envelope: m.metadataEnvelope }, packageSourceLimits(limits));
    if (json(this.source.heads) !== json(m.targetHeads)) fail('output-source');
  }
  private original(path: string) { const entry = this.inputs.originals.find(e => e.path === path); if (!entry) return fail('output-input-missing'); return entry.bytes; }
  assertOwner(fs: ProjectWorkspaceFS) { if (fs !== this.fs) fail('output-owner'); }
  path(name: string) { return `${root(this.fs, this.id)}${name}`; }
  manifest() {
    const m = readManifestControl(this.inputs.manifest, new TextEncoder().encode(packageByteHash(this.inputs.manifest))).manifest;
    if (m.purpose !== 'backup') return fail('output-purpose'); return m;
  }
  private records() {
    const m = this.manifest(), capture = { schema: 'lociview-package-capture-1',
      source: { identity: m.identity, metadataEnvelope: m.metadataEnvelope, heads: m.targetHeads }, sourceMetadata: ref(this.original('metadata.am')),
      purpose: 'backup', scope: { kind: 'wholeProject' }, protectedInventory: ref(this.original('protected-inventory.json')),
      exchangeBases: ref(this.original('exchange-bases.json')) };
    const payloads = [...this.inputs.originals.map(e => ({ path: e.path, ...ref(e.bytes) })), ...m.blobs];
    const prepared = { schema: 'lociview-package-output-1', capture: reference(capture), packageId: m.packageId,
      manifest: ref(this.inputs.manifest), payloads, roots: { blobs: m.blobs.map(({ sha256, byteLength }) => ({ sha256, byteLength })),
        evidence: unique([ref(this.inputs.manifest), reference(capture), ...this.inputs.originals.map(e => ref(e.bytes))]) } };
    const start = { schema: 'lociview-package-job-start-1', jobId: this.id, operation: 'manualCheckpoint',
      prepared: reference(prepared), ...(this.label !== undefined ? { label: this.label } : {}) };
    return { capture, prepared, start };
  }
  private index() { return { schema: 'lociview-backup-output-index-1', jobId: this.id, prepared: reference(this.records().prepared) }; }
  static prepare(fs: ProjectWorkspaceFS, capture: BackupSourceCapture, limits: MetadataLimits, version: string, label?: string) {
    checkedBackupLabel(label);
    const { manifest } = prepareBackupManifest(capture, { packageId: `pkg_${newId()}`, createdByVersion: version });
    return new BackupOutputJob(fs, newId(), limits, { manifest, originals: capture.originals().map(e => ({ path: e.path, bytes: e.read() })),
      description: capture.description }, label);
  }
  static async ids(fs: ProjectWorkspaceFS) {
    return withMetadataRead(fs, undefined, ({ fs }) => this.idsDirect(fs));
  }
  private static async idsDirect(fs: ProjectWorkspaceFS) {
    const prefix = `${workspacePackageRoot(fs)}backup-output/`, ix = `${workspacePackageRoot(fs)}backup-output-index/`;
    const paths = [...await fs.list(prefix), ...await fs.list(ix)]; if (paths.length > L.entryCount) return fail('output-job-budget');
    const ids = new Set<string>(); let controls = 0;
    for (const path of paths) {
      const indexed = path.startsWith(ix), tail = path.slice((indexed ? ix : prefix).length);
      if (!(indexed ? /^[0-9a-f]{32}\.json$/ : /^[0-9a-f]{32}\/(metadata\.am|manifest\.json|protected-inventory\.json|exchange-bases\.json|base-evidence\/sha256\/[0-9a-f]{64}|capture\.json|prepared\.json|start\.json|abandoned\.json|steps\/[0-9a-f]{64}\.json|artifacts\/[0-9a-f]{32}\.zip)$/).test(tail)) fail('output-path');
      ids.add(tail.slice(0, 32)); const f = await fs.readStream(path);
      if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('output-input-missing');
      if (path.endsWith('.zip')) { if (f.size > L.archiveBytes) fail('output-space-budget'); }
      else if (path.endsWith('.am') || path.includes('/base-evidence/')) { if (f.size > L.sourceBytes) fail('output-space-budget'); }
      else if (f.size > L.controlBytes || (controls += f.size) > L.controlsBytes) fail('output-control-budget');
    }
    return [...ids];
  }
  static async state(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    const ownedId = technicalId(id), ownedLimits = { ...limits };
    return withMetadataRead(fs, undefined, ({ fs }) => this.stateDirect(fs, ownedId, ownedLimits));
  }
  private static async stateDirect(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (!(await this.ids(fs)).includes(technicalId(id))) return fail('output-missing');
    const path = root(fs, id), start = await fs.readStream(`${path}start.json`), abandoned = await fs.readStream(`${path}abandoned.json`);
    const ix = await readReceipt(fs, indexPath(fs, id), limits);
    if (ix) {
      const prepared = await readReceipt(fs, `${path}prepared.json`, limits);
      if (!prepared || json(ix) !== json({ schema: 'lociview-backup-output-index-1', jobId: id, prepared: reference(prepared) })) fail('output-index');
    }
    if (start) { if (abandoned || !ix) return fail('output-state'); return 'started' as const; }
    if ((await fs.list(`${path}steps/`)).length) return fail('output-state');
    if (abandoned) {
      if (json(await readReceipt(fs, `${path}abandoned.json`, limits)) !== json(this.abandonment(id))) fail('output-state');
      return 'abandoned' as const;
    }
    return 'unstarted' as const;
  }
  private static abandonment(id: string) { return { schema: 'lociview-backup-output-abandoned-1', jobId: id, stage: 'beforeStart' }; }
  static async abandon(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if (await this.state(fs, id, limits) === 'started') return fail('output-abandon-denied');
    await writeReceipt(fs, `${root(fs, id)}abandoned.json`, this.abandonment(id), limits);
  }
  static async open(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (await this.state(fs, id, limits) !== 'started') return fail('output-unstarted');
    const path = root(fs, id), bytes = async (name: string, max: number) => {
      const f = await fs.readStream(`${path}${name}`); if (!f || f.size > max) return fail('output-input-missing');
      const b = await fs.readBytes(`${path}${name}`); if (!b || b.length !== f.size) return fail('output-input-missing'); return b.slice();
    };
    const manifest = await bytes('manifest.json', L.controlBytes), control = readManifestControl(manifest, new TextEncoder().encode(packageByteHash(manifest)));
    const m = control.manifest; if (m.purpose !== 'backup' || m.memo !== undefined) return fail('output-purpose');
    const originals: { path: string; bytes: Uint8Array }[] = [];
    for (const entry of control.entries.slice(2, 5 + m.baseEvidence.length)) {
      const value = await bytes(entry.path, entry.path === 'metadata.am' || entry.path.startsWith('base-evidence/') ? L.sourceBytes : L.controlBytes);
      if (json(ref(value)) !== json({ sha256: entry.sha256, byteLength: entry.byteLength })) fail('output-input-binding');
      originals.push({ path: entry.path, bytes: value });
    }
    const source = ProjectMetadataSource.fromFullSource(originals[0]!.bytes, { identity: m.identity, envelope: m.metadataEnvelope }, packageSourceLimits(limits));
    const evidence = m.baseEvidence.map((reference, i) => ({ reference, bytes: originals[i + 3]!.bytes }));
    const description = await inspectBackupOriginals(source, originals[2]!.bytes, evidence, limits);
    checkRequiredCapabilities(m.requiredCapabilities, description.requiredCapabilities);
    if (json(description.inventory) !== json(canonicalControl(originals[1]!.bytes)) || json(description.blobs) !== json(m.blobs) ||
      json(description.summary) !== json(m.summary) || manifest.length + 64 + originals[1]!.bytes.length + originals[2]!.bytes.length + description.baseControlBytes > L.controlsBytes) fail('output-source');
    const start = await readReceipt<{ label?: string }>(fs, `${path}start.json`, limits);
    const job = new BackupOutputJob(fs, id, limits, { manifest, originals, description }, start?.label, source);
    for (const [name, value] of Object.entries(job.records())) if (json(await readReceipt(fs, `${path}${name}.json`, limits)) !== json(value)) fail('output-input-binding');
    await job.steps(); return job;
  }
  frozenBases() { return structuredClone(this.inputs.description.table); }
  frozenInventory() { return structuredClone(this.inputs.description.inventory); }
  async persist() {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if ((await this.fs.list(this.path(''))).length || await this.fs.exists(indexPath(this.fs, this.id))) fail('output-exists');
    await this.space(this.inputs.manifest.length + this.inputs.originals.reduce((n, e) => n + e.bytes.length, 0));
    for (const { path, bytes } of [{ path: 'manifest.json', bytes: this.inputs.manifest }, ...this.inputs.originals]) {
      await this.fs.writeBytes(this.path(path), bytes);
      const stored = await this.fs.readBytes(this.path(path)); if (!stored || json(ref(stored)) !== json(ref(bytes))) fail('output-input-readback');
    }
    const { capture, prepared, start } = this.records();
    for (const [name, value] of [['capture', capture], ['prepared', prepared]] as const)
      await writeReceipt(this.fs, this.path(`${name}.json`), value, this.limits);
    await writeReceipt(this.fs, indexPath(this.fs, this.id), this.index(), this.limits);
    await writeReceipt(this.fs, this.path('start.json'), start, this.limits);
    // No second aggregate original copy; callers reopen independently for cold recovery.
    return this;
  }
  private async space(additional: number) {
    const prefix = workspacePackageRoot(this.fs);
    return withMetadataRead(this.fs, undefined, async ({ fs }) => {
      const paths = await fs.list(prefix); if (paths.length > L.entryCount) return fail('output-space-budget');
      let total = additional + L.baseEvidenceBytes;
      for (const path of paths) {
        const f = await fs.readStream(path); if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('output-space-read');
        total += f.size; if (total > 2_147_483_648 - 16_777_216) fail('output-space-budget');
      }
    });
  }
  async steps(): Promise<Step[]> {
    const path = this.path(''), id = this.id, start = reference(this.records().start), limits = { ...this.limits };
    return withMetadataRead(this.fs, undefined, ({ fs }) => this.stepsDirect(fs, path, id, start, limits));
  }
  private async stepsDirect(fs: ProjectWorkspaceFS, prefix: string, id: string, start: EvidenceRef, limits: MetadataLimits): Promise<Step[]> {
    const paths = await fs.list(`${prefix}steps/`); if (paths.length > 2) return fail('output-step-budget');
    const rows: Step[] = [];
    for (const path of paths) {
      const s = await readReceipt<Step>(fs, path, limits);
      if (!s || Object.keys(s).sort().join(',') !== 'detail,jobId,previous,schema,start' || s.schema !== 'lociview-package-job-step-1' ||
        s.jobId !== id || path !== `${prefix}steps/${reference(s).sha256}.json` || json(s.start) !== json(start)) return fail('output-step');
      rows.push(s);
    }
    const ordered: Step[] = []; let previous: EvidenceRef | null = null;
    while (ordered.length < rows.length) {
      const next = rows.filter(s => json(s.previous) === json(previous));
      if (next.length !== 1 || ordered.includes(next[0]!)) return fail('output-step-chain');
      const s = next[0]!, d = s.detail;
      if (!d) return fail('output-step-detail');
      if (d.kind === 'artifactVerified') {
        if (ordered.length || Object.keys(d).sort().join(',') !== 'archive,kind,location,sinkId' || d.location !== 'opfsArtifact') return fail('output-step-detail');
        checkRef(d.archive); technicalId(d.sinkId);
      } else if (d.kind === 'externalFileVerified') {
        const prior = ordered[0]?.detail;
        if (ordered.length !== 1 || prior?.kind !== 'artifactVerified' || Object.keys(d).sort().join(',') !== 'archive,kind,profile,sinkId' ||
          d.profile !== 'reselectedFileV1' || json(d.archive) !== json(prior.archive)) return fail('output-step-detail');
        technicalId(d.sinkId);
      } else if (d.kind !== 'cancelled' || Object.keys(d).sort().join(',') !== 'kind,stage' || d.stage !== 'beforeArtifact' || ordered.length) return fail('output-step-detail');
      ordered.push(s); previous = reference(s);
    }
    return ordered;
  }
  private async append(detail: Detail) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized(); const rows = await this.steps(), existing = rows.find(s => s.detail.kind === detail.kind);
    if (existing) { if (json(existing.detail) !== json(detail)) return fail('output-observation'); return; }
    if (rows.some(s => s.detail.kind === 'cancelled')) return fail('output-cancelled');
    const step: Step = { schema: 'lociview-package-job-step-1', jobId: this.id, start: reference(this.records().start),
      previous: rows.length ? reference(rows.at(-1)) : null, detail };
    await writeReceipt(this.fs, this.path(`steps/${reference(step).sha256}.json`), step, this.limits); await this.steps();
  }
  async artifactReceipt() {
    const step = (await this.steps()).find(s => s.detail.kind === 'artifactVerified');
    if (!step || step.detail.kind !== 'artifactVerified') return fail('output-unverified');
    const d = step.detail, file = await this.fs.readStream(this.path(`artifacts/${d.sinkId}.zip`));
    if (!file?.blob || file.size !== d.archive.byteLength) return fail('output-artifact-missing');
    return { file, step, detail: d };
  }
  async artifact() {
    const { file, step, detail: d } = await this.artifactReceipt();
    const blob = await file.blob!(), inspected = await BackupArchive.inspect(blob, this.limits);
    if (json({ sha256: inspected.archive.sha256, byteLength: inspected.archive.byteLength }) !== json(d.archive) ||
      json(inspected.archive.control.manifest) !== json(this.manifest())) fail('output-artifact-mismatch');
    return { blob, step };
  }
  async validateCompletion() { if ((await this.steps()).some(s => s.detail.kind === 'artifactVerified')) await this.artifactReceipt(); }
  private async validateInputs(signal?: AbortSignal) {
    checkAbort(signal);
    // Sequential readback: the warm path must not hide loss behind its memory copy.
    const id = this.id, limits = { ...this.limits };
    const originals = [{ path: 'manifest.json', bytes: this.inputs.manifest }, ...this.inputs.originals]
      .map(entry => ({ path: this.path(entry.path), expected: ref(entry.bytes) }));
    const records = Object.entries(this.records()).map(([name, value]) => ({ path: this.path(`${name}.json`), expected: json(value) }));
    await withMetadataRead(this.fs, undefined, async ({ fs }) => {
      if (await BackupOutputJob.state(fs, id, limits) !== 'started') fail('output-unstarted');
      for (const entry of originals) {
        checkAbort(signal);
        const file = await fs.readStream(entry.path);
        if (!file || file.size !== entry.expected.byteLength) fail('output-input-missing');
        const stored = await fs.readBytes(entry.path);
        if (!stored || json(ref(stored)) !== json(entry.expected)) fail('output-input-binding');
      }
      for (const record of records)
        if (json(await readReceipt(fs, record.path, limits)) !== record.expected) fail('output-input-binding');
      checkAbort(signal);
    });
    // Cancellation during the closing structural audit also prevents publication.
    checkAbort(signal);
  }
  async generate(store: OriginBlobStore, signal?: AbortSignal, timing?: BackupOutputTiming) {
    const measure = <T>(stage: Parameters<BackupOutputTiming>[0], action: () => Promise<T>) => measureBackupOutput(timing, stage, action);
    await measure('inputs-before', () => this.validateInputs(signal));
    if ((await this.steps()).some(s => s.detail.kind === 'artifactVerified')) { await this.artifact(); return; }
    if ((await this.steps()).length) return fail('output-cancelled');
    const m = this.manifest(), options = { packageId: m.packageId, createdByVersion: m.createdByVersion };
    const controls = { manifest: this.inputs.manifest, checksum: new TextEncoder().encode(packageByteHash(this.inputs.manifest)) };
    await measure('space', () => this.space(readManifestControl(controls.manifest, controls.checksum).archiveByteLength));
    const sinkId = newId(), path = this.path(`artifacts/${sinkId}.zip`); if (await this.fs.exists(path)) return fail('output-sink-exists');
    const bridge = new TransformStream<Uint8Array, Uint8Array>(), cancel = new AbortController(), abort = () => cancel.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    const generated = await measure('stream-close', async () => {
      const writing = this.fs.writeStream(path, bridge.readable); void writing.catch(e => cancel.abort(e));
      const originals = this.inputs.originals.map(e => ({ path: e.path, ...ref(e.bytes), read: () => e.bytes.slice() }));
      const generating = writeCausalArchive({ blobs: m.blobs, bodyRefs: this.inputs.description.bodyRefs }, controls, originals, store, bridge.writable, { ...options, signal: cancel.signal });
      try { const [, result] = await Promise.all([writing, generating]); return result; }
      catch (error) { cancel.abort(error); await Promise.allSettled([writing, generating]); throw error; }
      finally { signal?.removeEventListener('abort', abort); }
    });
    const inspected = await measure('artifact-inspect', async () => {
      const file = await this.fs.readStream(path); if (!file?.blob || file.size !== generated.byteLength) return fail('output-close-unverified');
      return BackupArchive.inspect(await file.blob(), this.limits, signal);
    });
    if (inspected.archive.sha256 !== generated.sha256 || inspected.archive.byteLength !== generated.byteLength || json(inspected.archive.control.manifest) !== json(m)) return fail('output-readback');
    await measure('inputs-after', () => this.validateInputs(signal));
    await measure('receipt', () => this.append({ kind: 'artifactVerified', archive: { sha256: generated.sha256, byteLength: generated.byteLength }, location: 'opfsArtifact', sinkId }));
  }

  async verifySelected(file: Blob) {
    const { step } = await this.artifact(), observed = await BackupArchive.inspect(file.slice(), this.limits), expected = (step.detail as Artifact).archive;
    if (observed.archive.sha256 !== expected.sha256 || observed.archive.byteLength !== expected.byteLength) return fail('output-selected-mismatch');
    if (!(await this.steps()).some(s => s.detail.kind === 'externalFileVerified'))
      await this.append({ kind: 'externalFileVerified', archive: expected, sinkId: newId(), profile: 'reselectedFileV1' });
  }
  async cancel() { if ((await this.steps()).some(s => s.detail.kind !== 'cancelled')) return fail('output-cancel-denied'); await this.append({ kind: 'cancelled', stage: 'beforeArtifact' }); }
}


/** Strict local label only; no filename or Project metadata interpretation. */
export function checkedBackupLabel(label?: string) {
  if (label === undefined) return;
  const c = new ProjectRecordFields(); c.text(canonicalControl(backupEncode(label)), 256, []);
}
