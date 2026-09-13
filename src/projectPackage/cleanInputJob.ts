import type { ProjectWorkspaceFS } from '../platform/fs';
import { equalBytes, json, newId, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { TransactionJournal, type JournalEntry, type PreparedJournal } from '../projectMetadata/journal';
import { CleanArchive } from './cleanArchive';
import { PACKAGE_LIMITS as L } from './contract';
import { packageByteHash } from './manifest';
import { workspacePackageRoot } from './workspaceBases';

const reference = (value: unknown) => { const b = new TextEncoder().encode(json(value)); return { sha256: packageByteHash(b), byteLength: b.length }; };
const root = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}clean-input/${technicalId(id)}/`;
const index = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}clean-input-index/${technicalId(id)}.json`;

/** Independent input authority, never a Workspace base or a merge into existing work. */
export class CleanInputJob {
  private constructor(private readonly fs: ProjectWorkspaceFS, readonly id: string, private readonly limits: MetadataLimits,
    readonly inspection: CleanArchive, private readonly input: Blob, readonly start: { operation: 'importClean' } | null, private readonly reselected = false) {}
  assertOwner(fs: ProjectWorkspaceFS) { if (fs !== this.fs) fail('clean-input-owner'); }
  path(name: string) { return `${root(this.fs, this.id)}${name}`; }
  private descriptor() {
    const a = this.inspection.archive, m = a.control.manifest;
    if (m.purpose !== 'clean') return fail('clean-input-purpose');
    const manifest = a.control.entries.find(e => e.path === 'manifest.json')!, metadata = m.metadata;
    const refs = [manifest, metadata].map(({ sha256, byteLength }) => ({ sha256, byteLength })).sort((a, b) => a.sha256 < b.sha256 ? -1 : 1);
    return { schema: 'lociview-clean-input-1', jobId: this.id, archive: { sha256: a.sha256, byteLength: a.byteLength },
      manifest: { sha256: manifest.sha256, byteLength: manifest.byteLength }, metadata: { sha256: metadata.sha256, byteLength: metadata.byteLength },
      destination: this.inspection.source.proof, roots: { blobs: m.blobs.map(({ sha256, byteLength }) => ({ sha256, byteLength })), evidence: refs } };
  }
  private startRecord() { return { schema: 'lociview-clean-input-start-1', jobId: this.id, input: reference(this.descriptor()) }; }
  static async prepare(fs: ProjectWorkspaceFS, file: Blob, limits: MetadataLimits) {
    if (!(file instanceof Blob)) return fail('clean-input-file');
    const input = file.slice(); return new CleanInputJob(fs, newId(), limits, await CleanArchive.inspect(input, limits), input, null);
  }
  static async ids(fs: ProjectWorkspaceFS) {
    const prefix = `${workspacePackageRoot(fs)}clean-input/`, ix = `${workspacePackageRoot(fs)}clean-input-index/`;
    const paths = await fs.list(prefix), indices = await fs.list(ix); let controls = 0;
    if (paths.length + indices.length > L.entryCount) fail('clean-input-budget');
    for (const path of [...paths, ...indices]) {
      if (!(path.startsWith(prefix) ? /^[0-9a-f]{32}\/(input\.zip|input\.json|start\.json|published\.json|abandoned\.json)$/.test(path.slice(prefix.length)) : /^[0-9a-f]{32}\.json$/.test(path.slice(ix.length)))) fail('clean-input-path');
      const file = await fs.readStream(path); if (!file || !Number.isSafeInteger(file.size) || file.size < 0) return fail('clean-input-missing');
      if (path.endsWith('.zip') ? file.size > L.archiveBytes : file.size > L.controlBytes || (controls += file.size) > L.controlsBytes) fail('clean-input-budget');
    }
    return [...new Set([...paths.map(p => p.slice(prefix.length, prefix.length + 32)), ...indices.map(p => p.slice(ix.length, ix.length + 32))])];
  }
  private static abandonment(id: string) { return { schema: 'lociview-clean-input-abandoned-1', jobId: id, stage: 'beforeStart' }; }
  static async inputState(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (!(await this.ids(fs)).includes(technicalId(id))) return fail('clean-input-missing');
    const path = root(fs, id), start = await fs.readStream(`${path}start.json`), abandoned = await fs.readStream(`${path}abandoned.json`);
    if (start) { if (abandoned) fail('clean-input-state'); return 'started' as const; }
    if ((await new TransactionJournal(fs, limits).entries()).some(e => e.start.transactionId === id) || await fs.exists(`${path}published.json`)) fail('clean-input-state');
    if (abandoned) { if (json(await readReceipt(fs, `${path}abandoned.json`, limits)) !== json(this.abandonment(id))) fail('clean-input-state'); return 'abandoned' as const; }
    return 'input-required' as const;
  }
  static async reselect(fs: ProjectWorkspaceFS, id: string, file: Blob, limits: MetadataLimits) {
    if (await this.inputState(fs, id, limits) !== 'input-required') return fail('clean-input-reselect-denied');
    const candidate = await this.prepare(fs, file, limits), job = new CleanInputJob(fs, id, limits, candidate.inspection, candidate.input, null, true);
    await job.checkBinding(); return job;
  }
  private async checkBinding() {
    if (json(await readReceipt(this.fs, this.path('input.json'), this.limits)) !== json(this.descriptor()) ||
      json(await readReceipt(this.fs, index(this.fs, this.id), this.limits)) !== json({ schema: 'lociview-clean-input-index-1', jobId: this.id, input: reference(this.descriptor()) })) fail('clean-input-binding');
  }
  static async open(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (await this.inputState(fs, id, limits) !== 'started') return fail('clean-input-incomplete');
    const f = await fs.readStream(`${root(fs, id)}input.zip`); if (!f?.blob || f.size > L.archiveBytes) return fail('clean-input-missing');
    const blob = await f.blob(); if (blob.size !== f.size) fail('clean-input-size');
    const job = new CleanInputJob(fs, id, limits, await CleanArchive.inspect(blob, limits), blob, { operation: 'importClean' });
    await job.checkBinding();
    if (json(await readReceipt(fs, job.path('start.json'), limits)) !== json(job.startRecord())) fail('clean-input-start');
    return job;
  }
  async persist(additionalBytes: number) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if (this.start) return fail('clean-input-exists');
    if (this.reselected) {
      if (await CleanInputJob.inputState(this.fs, this.id, this.limits) !== 'input-required') return fail('clean-input-reselect-denied');
      await this.checkBinding();
    } else if ((await this.fs.list(this.path(''))).length) fail('clean-input-exists');
    let size = 0; const paths = await this.fs.list(workspacePackageRoot(this.fs)); if (paths.length > L.entryCount) fail('clean-input-budget');
    for (const path of paths) { const f = await this.fs.readStream(path); if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('clean-input-size'); size += f.size; }
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0 || size + this.input.size + additionalBytes + 4 * L.controlBytes > 2_147_483_648 - 16_777_216) fail('clean-input-budget');
    await writeReceipt(this.fs, this.path('input.json'), this.descriptor(), this.limits);
    await writeReceipt(this.fs, index(this.fs, this.id), { schema: 'lociview-clean-input-index-1', jobId: this.id, input: reference(this.descriptor()) }, this.limits);
    await this.fs.writeStream(this.path('input.zip'), this.input.stream());
    const f = await this.fs.readStream(this.path('input.zip')); if (!f?.blob || f.size !== this.input.size) return fail('clean-input-spool');
    const saved = await CleanArchive.inspect(await f.blob(), this.limits);
    if (saved.archive.sha256 !== this.inspection.archive.sha256) fail('clean-input-spool');
    await writeReceipt(this.fs, this.path('start.json'), this.startRecord(), this.limits);
    return CleanInputJob.open(this.fs, this.id, this.limits);
  }
  async inventory() { return this.inspection.description.closure.semanticRefs.map(r => ({ ...r })); }
  async validateJournal(prepared: PreparedJournal) {
    const saved = await CleanInputJob.open(this.fs, this.id, this.limits), source = saved.inspection.source, s = prepared.start;
    if (s.purpose !== 'importClean' || s.transactionId !== this.id || s.repositoryId !== this.id || s.predecessor !== null || s.baseHeads.length ||
      prepared.remote || json(s.proof) !== json(source.proof)) return fail('clean-input-journal');
    const parts = await new TransactionJournal(this.fs, this.limits).validateParts(prepared), original = source.originalChanges();
    if (parts.length !== original.length || parts.some((p, i) => !equalBytes(p, original[i]!))) fail('clean-input-originals');
    return source;
  }
  private async publication(entry?: JournalEntry) {
    entry ??= (await new TransactionJournal(this.fs, this.limits).entries()).find(e => e.start.transactionId === this.id);
    if (!entry?.prepared || !entry.publication) return fail('clean-input-unpublished');
    const source = await this.validateJournal(entry.prepared);
    if (json(entry.publication.heads) !== json(source.heads)) fail('clean-input-publication');
    return { schema: 'lociview-clean-input-published-1', jobId: this.id, start: reference(this.startRecord()),
      journal: reference(entry.prepared), publication: reference(entry.publication) };
  }
  async complete() { await writeReceipt(this.fs, this.path('published.json'), await this.publication(), this.limits); }
  async steps() {
    const p = await readReceipt(this.fs, this.path('published.json'), this.limits);
    if (!p) return [];
    if (json(p) !== json(await this.publication())) fail('clean-input-completion');
    return [{ detail: { kind: 'cleanPublished' as const } }];
  }
  async validateCompletion() { await this.steps(); }
  static async abandon(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (await this.inputState(fs, id, limits) === 'started') return fail('clean-input-abandon-denied');
    await writeReceipt(fs, `${root(fs, id)}abandoned.json`, this.abandonment(id), limits);
  }
}
