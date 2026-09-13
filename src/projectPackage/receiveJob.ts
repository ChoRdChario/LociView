import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkedProof, fail, MetadataSourceError, type MetadataLimits, type MetadataProof } from '../projectMetadata/format';
import { digest, json, newId, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import { checkRemoteHeads } from '../projectMetadata/remote';
import { TransactionJournal, type JournalEntry } from '../projectMetadata/journal';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { WorkspaceArchive } from './workspaceArchive';
import { packageByteHash, readManifestControl } from './manifest';
import { planWorkspaceClosure } from './closure';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { summarizeFullHistory } from './historySummary';

export interface ReceiverProof { identity: MetadataProof['identity']; metadataEnvelope: MetadataProof['envelope']; heads: readonly string[] }
interface Start { schema: 'lociview-package-job-start-1'; jobId: string; operation: 'receiveWorkspace'; prepared: EvidenceRef; receiver: ReceiverProof }
interface Prepared { schema: 'lociview-workspace-receive-1'; packageId: string; manifest: EvidenceRef; metadata: EvidenceRef;
  roots: { blobs: EvidenceRef[]; evidence: EvidenceRef[] } }
interface Binding { schema: 'lociview-workspace-input-1'; jobId: string; prepared: EvidenceRef; archive: EvidenceRef }
type InputState = 'started' | 'input-required' | 'unbound-input' | 'abandoned';
type Completion = { kind: 'workspacePublished'; receiver: ReceiverProof; journal: EvidenceRef; publication: EvidenceRef } |
  { kind: 'workspaceAlreadyPresent'; receiver: ReceiverProof; publication: EvidenceRef };
interface Step { schema: 'lociview-package-job-step-1'; jobId: string; start: EvidenceRef; previous: EvidenceRef | null;
  detail: Completion | { kind: 'baseRecorded'; completion: EvidenceRef; baseRecord: EvidenceRef } | { kind: 'cancelled'; stage: 'beforeWorkspaceJournal' } }
export interface ImportedBase { identity: ReceiverProof['identity']; metadataEnvelope: ReceiverProof['metadataEnvelope']; workspacePackageId: string;
  workspaceManifestSha256: string; declaredHeads: readonly string[]; evidence: { manifest: EvidenceRef; metadata: EvidenceRef };
  completions: { observation: 'imported'; publishedReceiverHeads: readonly string[] }[] }
const encoded = (value: unknown) => new TextEncoder().encode(json(value));
const ref = (bytes: Uint8Array): EvidenceRef => ({ sha256: packageByteHash(bytes), byteLength: bytes.length });
const reference = (value: unknown) => ref(encoded(value));
function checkRef(e: EvidenceRef, max: number = L.controlBytes) {
  if (!e || Object.keys(e).sort().join(',') !== 'byteLength,sha256' || typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256) ||
    !Number.isSafeInteger(e.byteLength) || e.byteLength <= 0 || e.byteLength > max) fail('receive-reference');
}
const root = (fs: ProjectWorkspaceFS) => `${fs.projectRoot ? `${fs.projectRoot}/` : ''}v2/packages/`;
const sortedRefs = (refs: EvidenceRef[]) => [...new Map(refs.map(r => [r.sha256, r])).values()].sort((a, b) => a.sha256.localeCompare(b.sha256));

/** Concrete existing-Project receive owner. All mutation is inside the Session's Project lease. */
export class WorkspaceReceiveJob {
  private constructor(private readonly fs: ProjectWorkspaceFS, readonly id: string, private readonly limits: MetadataLimits,
    readonly inspection: WorkspaceArchive, private readonly input: Blob, readonly start: Start | null, private readonly reselected = false) {}
  assertOwner(fs: ProjectWorkspaceFS) { if (fs !== this.fs) fail('receive-job-owner'); }
  path(name: string) { return `${root(this.fs)}receive/${this.id}/${name}`; }
  manifest() { const m = this.inspection.archive.control.manifest; if (m.purpose !== 'teamWorkspace') return fail('receive-purpose'); return m; }
  private descriptor(): Prepared {
    const m = this.manifest(), control = this.inspection.archive.control;
    const original = control.entries.find(e => e.path === 'manifest.json')!;
    const manifest = { sha256: original.sha256, byteLength: original.byteLength };
    const metadata = { sha256: m.metadata.sha256, byteLength: m.metadata.byteLength };
    return { schema: 'lociview-workspace-receive-1', packageId: m.packageId, manifest, metadata,
      roots: { blobs: m.blobs.map(b => ({ sha256: b.sha256, byteLength: b.byteLength })), evidence: sortedRefs([manifest, metadata]) } };
  }
  static async prepare(fs: ProjectWorkspaceFS, file: Blob, limits: MetadataLimits): Promise<WorkspaceReceiveJob> {
    if (!(file instanceof Blob)) return fail('receive-file');
    const input = file.slice(0, file.size), inspection = await WorkspaceArchive.inspect(input, limits);
    return new WorkspaceReceiveJob(fs, newId(), limits, inspection, input, null);
  }
  static async ids(fs: ProjectWorkspaceFS): Promise<string[]> {
    const prefix = `${root(fs)}receive/`, paths = await fs.list(prefix);
    if (paths.length > L.entryCount) fail('receive-job-count');
    let controls = 0;
    for (const path of paths) {
      if (!/^[0-9a-f]{32}\/(input\.zip|input\.json|prepared\.json|start\.json|abandoned\.json|steps\/[0-9a-f]{64}\.json)$/.test(path.slice(prefix.length))) fail('receive-job-path');
      if (path.endsWith('/input.zip')) continue;
      const file = await fs.readStream(path);
      if (!file || file.size > L.controlBytes || (controls += file.size) > L.controlsBytes) return fail('receive-control-budget');
    }
    return [...new Set(paths.map(p => p.slice(prefix.length).split('/')[0]!))];
  }
  /** Absence is checked separately from parsing: torn acknowledged starts are never unstarted. */
  static async inputState(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits): Promise<InputState> {
    technicalId(id); if (!(await this.ids(fs)).includes(id)) return fail('receive-job-missing');
    const path = `${root(fs)}receive/${id}/`;
    const started = await fs.readStream(`${path}start.json`), abandoned = await fs.readStream(`${path}abandoned.json`);
    if (started) { if (abandoned) return fail('receive-input-state'); return 'started'; }
    if ((await new TransactionJournal(fs, limits).entries()).some(e => e.start.transactionId === id) ||
      (await fs.list(`${path}steps/`)).length) return fail('receive-input-state');
    if (abandoned) {
      if (json(await readReceipt(fs, `${path}abandoned.json`, limits)) !== json(this.abandonment(id))) return fail('receive-input-state');
      return 'abandoned';
    }
    try { await this.inputBinding(fs, id, limits); return 'input-required'; }
    catch (error) {
      if (error instanceof MetadataSourceError && ['receipt-invalid', 'receive-input-binding', 'receive-reference'].includes(error.code)) return 'unbound-input';
      throw error;
    }
  }
  private static abandonment(id: string) { return { schema: 'lociview-workspace-input-abandoned-1', jobId: id, stage: 'beforeStart' }; }
  private static async inputBinding(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    const path = `${root(fs)}receive/${id}/`, binding = await readReceipt<Binding>(fs, `${path}input.json`, limits),
      prepared = await readReceipt<Prepared>(fs, `${path}prepared.json`, limits);
    if (!binding || !prepared || Object.keys(binding).sort().join(',') !== 'archive,jobId,prepared,schema' ||
      binding.schema !== 'lociview-workspace-input-1' || binding.jobId !== id || json(binding.prepared) !== json(reference(prepared))) return fail('receive-input-binding');
    checkRef(binding.archive, L.archiveBytes);
    if (Object.keys(prepared).sort().join(',') !== 'manifest,metadata,packageId,roots,schema' || prepared.schema !== 'lociview-workspace-receive-1' ||
      typeof prepared.packageId !== 'string' || !/^pkg_[0-9a-f]{32}$/.test(prepared.packageId) || !prepared.roots ||
      Object.keys(prepared.roots).sort().join(',') !== 'blobs,evidence' || !Array.isArray(prepared.roots.blobs) || !Array.isArray(prepared.roots.evidence)) return fail('receive-input-binding');
    checkRef(prepared.manifest); checkRef(prepared.metadata, L.sourceBytes);
    for (const r of prepared.roots.blobs) checkRef(r, L.archiveBytes);
    for (const r of prepared.roots.evidence) checkRef(r, L.sourceBytes);
    return { binding, prepared };
  }
  static async reselect(fs: ProjectWorkspaceFS, id: string, file: Blob, limits: MetadataLimits) {
    if (await this.inputState(fs, id, limits) !== 'input-required') return fail('receive-reselect-denied');
    const candidate = await this.prepare(fs, file, limits);
    const job = new WorkspaceReceiveJob(fs, id, limits, candidate.inspection, candidate.input, null, true);
    await job.checkReselected(); return job;
  }
  private async checkReselected() {
    if (await WorkspaceReceiveJob.inputState(this.fs, this.id, this.limits) !== 'input-required') return fail('receive-reselect-denied');
    const { binding, prepared } = await WorkspaceReceiveJob.inputBinding(this.fs, this.id, this.limits);
    if (json(binding.archive) !== json({ sha256: this.inspection.archive.sha256, byteLength: this.input.size }) ||
      json(prepared) !== json(this.descriptor())) fail('receive-reselected-file');
  }
  static async abandon(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits): Promise<void> {
    fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const state = await this.inputState(fs, id, limits);
    if (state === 'started') return fail('receive-abandon-denied');
    await writeReceipt(fs, `${root(fs)}receive/${id}/abandoned.json`, this.abandonment(id), limits);
    if (await this.inputState(fs, id, limits) !== 'abandoned') fail('receive-input-state');
  }
  static async open(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits): Promise<WorkspaceReceiveJob> {
    if (await this.inputState(fs, id, limits) !== 'started') return fail('receive-input-incomplete');
    const path = `${root(fs)}receive/${id}/`;
    const readLimits = { ...limits, maxTotalBytes: Math.min(limits.maxTotalBytes, L.controlBytes) };
    const start = await readReceipt<Start>(fs, `${path}start.json`, readLimits);
    const binding = await readReceipt<Binding>(fs, `${path}input.json`, readLimits);
    const prepared = await readReceipt<Prepared>(fs, `${path}prepared.json`, readLimits);
    const file = await fs.readStream(`${path}input.zip`);
    if (!start || !binding || !prepared || !file?.blob || file.size > L.archiveBytes) return fail('receive-input-incomplete');
    const blob = await file.blob(); if (blob.size !== file.size) return fail('receive-input-size');
    const inspection = await WorkspaceArchive.inspect(blob, limits), job = new WorkspaceReceiveJob(fs, id, limits, inspection, blob, start);
    if (json(binding) !== json({ schema: 'lociview-workspace-input-1', jobId: id, prepared: reference(prepared), archive: { sha256: inspection.archive.sha256, byteLength: inspection.archive.byteLength } }) ||
      json(prepared) !== json(job.descriptor())) fail('receive-input-binding');
    if (Object.keys(start).sort().join(',') !== 'jobId,operation,prepared,receiver,schema' || start.schema !== 'lociview-package-job-start-1' ||
      start.operation !== 'receiveWorkspace' || start.jobId !== id || json(start.prepared) !== json(reference(prepared)) || !start.receiver ||
      Object.keys(start.receiver).sort().join(',') !== 'heads,identity,metadataEnvelope') fail('receive-start');
    checkedProof({ identity: start.receiver.identity, envelope: start.receiver.metadataEnvelope }, limits); checkRemoteHeads(start.receiver.heads);
    if (json(start.receiver.identity) !== json(inspection.source.proof.identity) || json(start.receiver.metadataEnvelope) !== json(inspection.source.proof.envelope)) fail('receive-lineage');
    await job.steps(); return job;
  }
  async persist(receiver: ReceiverProof, additionalBytes: number): Promise<WorkspaceReceiveJob> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if (this.start) return fail('receive-job-exists');
    if (this.reselected) await this.checkReselected();
    else if ((await this.fs.list(this.path(''))).length) return fail('receive-job-exists');
    const ids = await WorkspaceReceiveJob.ids(this.fs);
    let existing = 0;
    for (const id of ids) {
      const state = await WorkspaceReceiveJob.inputState(this.fs, id, this.limits);
      existing += (await this.fs.readStream(`${root(this.fs)}receive/${id}/input.zip`))?.size ?? 0;
      if (this.reselected && id === this.id || state === 'abandoned') continue;
      if (state !== 'started') return fail('receive-job-unfinished');
      const prior = await WorkspaceReceiveJob.open(this.fs, id, this.limits);
      if (!(await prior.steps()).some(s => s.detail.kind === 'baseRecorded' || s.detail.kind === 'cancelled')) fail('receive-job-unfinished');
    }
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0 || existing + this.input.size + additionalBytes > 2_147_483_648 - 16_777_216) fail('receive-space-budget');
    const prepared = this.descriptor(), start: Start = { schema: 'lociview-package-job-start-1', jobId: this.id, operation: 'receiveWorkspace',
      prepared: reference(prepared), receiver };
    await this.write('prepared.json', prepared);
    await this.write('input.json', { schema: 'lociview-workspace-input-1', jobId: this.id, prepared: reference(prepared),
      archive: { sha256: this.inspection.archive.sha256, byteLength: this.input.size } });
    await this.fs.writeStream(this.path('input.zip'), this.input.stream());
    const stored = await this.fs.readStream(this.path('input.zip'));
    if (!stored?.blob || stored.size !== this.input.size) return fail('receive-spool-incomplete');
    const saved = await WorkspaceArchive.inspect(await stored.blob(), this.limits);
    if (saved.archive.sha256 !== this.inspection.archive.sha256 || saved.archive.byteLength !== this.input.size) fail('receive-spool-mismatch');
    await this.write('start.json', start);
    return WorkspaceReceiveJob.open(this.fs, this.id, this.limits);
  }
  private write(name: string, value: unknown) { return writeReceipt(this.fs, this.path(name), value, { ...this.limits, maxTotalBytes: Math.min(L.controlBytes, this.limits.maxTotalBytes) }); }
  async steps(): Promise<Step[]> {
    if (!this.start) return [];
    const paths = await this.fs.list(this.path('steps/')); if (paths.length > 2) fail('receive-step-count');
    const rows: Step[] = [];
    for (const path of paths) {
      const s = await readReceipt<Step>(this.fs, path, this.limits);
      if (!s || path !== this.path(`steps/${reference(s).sha256}.json`) || Object.keys(s).sort().join(',') !== 'detail,jobId,previous,schema,start' ||
        s.schema !== 'lociview-package-job-step-1' || s.jobId !== this.id || json(s.start) !== json(reference(this.start))) return fail('receive-step');
      rows.push(s);
    }
    const first = rows.find(s => s.previous === null), second = rows.find(s => s !== first);
    if (rows.length && (!first || !['workspacePublished', 'workspaceAlreadyPresent', 'cancelled'].includes(first.detail?.kind))) fail('receive-step-chain');
    if (first?.detail.kind === 'cancelled' && (rows.length !== 1 || json(first.detail) !== json({ kind: 'cancelled', stage: 'beforeWorkspaceJournal' }))) fail('receive-step-chain');
    if (second && (second.detail.kind !== 'baseRecorded' || json(second.previous) !== json(reference(first)) || json(second.detail.completion) !== json(reference(first)))) fail('receive-step-chain');
    if (first && first.detail.kind !== 'cancelled') {
      const d = first.detail;
      if (d.kind === 'baseRecorded' || Object.keys(d).sort().join(',') !== (d.kind === 'workspacePublished' ? 'journal,kind,publication,receiver' : 'kind,publication,receiver') ||
        !d.receiver || Object.keys(d.receiver).sort().join(',') !== 'heads,identity,metadataEnvelope' ||
        json(d.receiver.identity) !== json(this.start.receiver.identity) || json(d.receiver.metadataEnvelope) !== json(this.start.receiver.metadataEnvelope)) return fail('receive-step-detail');
      checkRemoteHeads(d.receiver.heads); checkRef(d.publication); if (d.kind === 'workspacePublished') checkRef(d.journal);
    }
    if (second?.detail.kind === 'baseRecorded') {
      if (Object.keys(second.detail).sort().join(',') !== 'baseRecord,completion,kind') fail('receive-step-detail');
      checkRef(second.detail.baseRecord); checkRef(second.detail.completion);
    }
    return first ? [first, ...(second ? [second] : [])] : [];
  }
  async cancelStale() { await this.append({ kind: 'cancelled', stage: 'beforeWorkspaceJournal' }); }
  async inventory() { return planWorkspaceClosure((await this.inspection.source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork })).candidates).semanticRefs.map(r => ({ ...r })); }
  async publicationReference() {
    const first = (await this.steps())[0];
    if (!first) return null;
    if (first.detail.kind === 'cancelled') return fail('receive-cancelled');
    if (first.detail.kind === 'baseRecorded') return fail('receive-step-chain');
    return first.detail;
  }
  async validateCompletion(): Promise<void> {
    const rows = await this.steps(), last = rows.at(-1);
    if (last?.detail.kind !== 'baseRecorded') return;
    const first = rows[0]!, d = first.detail;
    if (d.kind !== 'workspaceAlreadyPresent' && d.kind !== 'workspacePublished') return fail('receive-step-detail');
    const entry = (await new TransactionJournal(this.fs, this.limits).entries()).find(e => e.publication && json(reference(e.publication)) === json(d.publication));
    if (!entry?.publication || json(entry.publication.heads) !== json(d.receiver.heads)) return fail('receive-observation-missing');
    if (d.kind === 'workspacePublished' && (entry.start.transactionId !== this.id || json(reference(entry.prepared)) !== json(d.journal) ||
      json(entry.prepared?.remote) !== json((await this.journalInput([...d.receiver.heads])).proof))) fail('receive-journal-originals');
    if (d.kind === 'workspaceAlreadyPresent' && json(d.receiver) !== json(this.start!.receiver)) fail('receive-stale');
    const bases = await this.readBases(), expected = this.baseRecord(d.receiver);
    if (json(reference(expected)) !== json(last.detail.baseRecord) || !bases.some(b => json(b) === json(expected))) fail('receive-base-missing');
  }
  async preflightBase(): Promise<void> {
    const rows = await this.readBases(), expected = this.baseRecord({ identity: this.inspection.source.proof.identity,
      metadataEnvelope: this.inspection.source.proof.envelope, heads: this.inspection.source.heads });
    const keys = new Set(rows.map(r => r.workspacePackageId)), refs = new Map<string, number>(); keys.add(expected.workspacePackageId);
    for (const r of [...rows, expected]) {
      if (r.workspacePackageId === expected.workspacePackageId && json({ ...r, completions: [] }) !== json({ ...expected, completions: [] })) fail('receive-base-conflict');
      for (const e of [r.evidence.manifest, r.evidence.metadata]) {
        if (refs.has(e.sha256) && refs.get(e.sha256) !== e.byteLength) fail('receive-base-evidence'); refs.set(e.sha256, e.byteLength);
      }
    }
    if (keys.size > 16 || refs.size > L.baseEvidenceCount || [...refs.values()].reduce((a, b) => a + b, 0) > L.baseEvidenceBytes) fail('receive-base-budget');
  }
  private async append(detail: Step['detail']): Promise<Step> {
    if (!this.start) return fail('receive-start-missing');
    const rows = await this.steps(), prior = rows.find(s => s.detail.kind === detail.kind);
    if (prior) { if (json(prior.detail) !== json(detail)) fail('receive-observation-mismatch'); return prior; }
    const previous = rows.at(-1), s: Step = { schema: 'lociview-package-job-step-1', jobId: this.id, start: reference(this.start),
      previous: previous ? reference(previous) : null, detail };
    await this.write(`steps/${reference(s).sha256}.json`, s); await this.steps(); return s;
  }
  async finish(entry: JournalEntry, receiver: ReceiverProof, zero: boolean): Promise<void> {
    if (!this.start || !entry.publication || !entry.prepared) return fail('receive-publication-missing');
    const m = this.manifest();
    if (json(receiver.heads) !== json(entry.publication.heads) || json(receiver.identity) !== json(m.identity) || json(receiver.metadataEnvelope) !== json(m.metadataEnvelope)) fail('receive-publication-proof');
    if (!zero && (entry.start.transactionId !== this.id || entry.prepared.remote?.source.packageId !== m.packageId)) fail('receive-publication-job');
    if (zero && json(receiver) !== json(this.start.receiver)) fail('receive-stale');
    const detail: Completion = zero ? { kind: 'workspaceAlreadyPresent', receiver, publication: reference(entry.publication) } :
      { kind: 'workspacePublished', receiver, journal: reference(entry.prepared), publication: reference(entry.publication) };
    const observed = await this.append(detail), record = await this.recordBase(receiver);
    await this.append({ kind: 'baseRecorded', completion: reference(observed), baseRecord: reference(record) });
  }
  private async original(path: string): Promise<Uint8Array> { return this.inspection.archive.entryBytes(path, path === 'metadata.am' ? L.sourceBytes : L.controlBytes); }
  private baseRecord(receiver: ReceiverProof): ImportedBase {
    const m = this.manifest(), descriptor = this.descriptor();
    return { identity: m.identity, metadataEnvelope: m.metadataEnvelope, workspacePackageId: m.packageId,
      workspaceManifestSha256: descriptor.manifest.sha256, declaredHeads: m.targetHeads,
      evidence: { manifest: descriptor.manifest, metadata: descriptor.metadata }, completions: [{ observation: 'imported', publishedReceiverHeads: receiver.heads }] };
  }
  private async recordBase(receiver: ReceiverProof): Promise<ImportedBase> {
    const m = this.manifest(), descriptor = this.descriptor(), record = this.baseRecord(receiver);
    const prefix = `${root(this.fs)}bases/`, bases = await this.readBases(), packages = new Set<string>();
    for (const r of bases) {
      packages.add(r.workspacePackageId);
      if (r.workspacePackageId === m.packageId && json({ ...r, completions: [] }) !== json({ ...record, completions: [] })) fail('receive-base-conflict');
    }
    packages.add(m.packageId); if (packages.size > 16) fail('receive-base-budget');
    const already = (await this.steps()).find(s => s.detail.kind === 'baseRecorded');
    const path = `${prefix}${m.packageId}/${reference(record).sha256}.json`;
    if (already) {
      if (already.detail.kind !== 'baseRecorded' || json(already.detail.baseRecord) !== json(reference(record)) || json(await readReceipt(this.fs, path, this.limits)) !== json(record)) fail('receive-base-missing');
      return record;
    }
    for (const [name, e] of [['manifest.json', descriptor.manifest], ['metadata.am', descriptor.metadata]] as const) {
      const bytes = await this.original(name), path = `${root(this.fs)}evidence/${e.sha256}`, prior = await this.fs.readStream(path);
      if (prior) await this.readEvidence(e);
      else { this.fs.mutationAuthority.assertWorkspaceWriteAuthorized(); await this.fs.writeBytes(path, bytes); await this.readEvidence(e); }
    }
    await writeReceipt(this.fs, path, record, this.limits); return record;
  }
  private async readBases(): Promise<ImportedBase[]> {
    const prefix = `${root(this.fs)}bases/`, paths = await this.fs.list(prefix), rows: ImportedBase[] = [], keys = new Map<string, string>();
    const evidence = new Map<string, number>(); let controlBytes = 0, sourceWork = 0, sourceNodes = 0;
    if (paths.length > L.entryCount) fail('receive-base-budget');
    for (const path of paths) {
      const file = await this.fs.readStream(path); if (!file || file.size > L.controlBytes || (controlBytes += file.size) > L.controlsBytes) return fail('receive-base-budget');
      const r = await readReceipt<ImportedBase>(this.fs, path, this.limits);
      if (!r || Object.keys(r).sort().join(',') !== 'completions,declaredHeads,evidence,identity,metadataEnvelope,workspaceManifestSha256,workspacePackageId' ||
        typeof r.workspacePackageId !== 'string' || !/^pkg_[0-9a-f]{32}$/.test(r.workspacePackageId) ||
        path !== `${prefix}${r.workspacePackageId}/${reference(r).sha256}.json` ||
        json(r.identity) !== json(this.inspection.source.proof.identity) || json(r.metadataEnvelope) !== json(this.inspection.source.proof.envelope) ||
        !r.evidence || Object.keys(r.evidence).sort().join(',') !== 'manifest,metadata' ||
        !Array.isArray(r.completions) || r.completions.length !== 1 || Object.keys(r.completions[0]!).sort().join(',') !== 'observation,publishedReceiverHeads' ||
        r.completions[0]!.observation !== 'imported') return fail('receive-base-record');
      checkRemoteHeads(r.declaredHeads); checkRemoteHeads(r.completions[0]!.publishedReceiverHeads);
      for (const e of [r.evidence.manifest, r.evidence.metadata]) {
        if (evidence.has(e.sha256) && evidence.get(e.sha256) !== e.byteLength) fail('receive-base-evidence');
        evidence.set(e.sha256, e.byteLength);
      }
      if (evidence.size > L.baseEvidenceCount || [...evidence.values()].reduce((a, b) => a + b, 0) > L.baseEvidenceBytes) fail('receive-base-budget');
      const manifestBytes = await this.readEvidence(r.evidence.manifest), metadataBytes = await this.readEvidence(r.evidence.metadata);
      const m = readManifestControl(manifestBytes, new TextEncoder().encode(r.workspaceManifestSha256)).manifest;
      if (m.purpose !== 'teamWorkspace' || m.packageId !== r.workspacePackageId || json(m.identity) !== json(r.identity) || json(m.metadataEnvelope) !== json(r.metadataEnvelope) ||
        json(m.targetHeads) !== json(r.declaredHeads) || json({ sha256: m.metadata.sha256, byteLength: m.metadata.byteLength }) !== json(r.evidence.metadata)) fail('receive-base-manifest');
      const source = ProjectMetadataSource.fromFullSource(metadataBytes, { identity: r.identity, envelope: r.metadataEnvelope }, this.limits);
      if (json(source.heads) !== json(r.declaredHeads)) fail('receive-base-heads');
      const inspection = await source.inspectOriginal({ maxNodes: L.inspectionNodes - sourceNodes, maxWork: L.inspectionWork - sourceWork });
      sourceWork += inspection.workUsed; sourceNodes += inspection.scalars.length;
      const summary = summarizeFullHistory(inspection), closure = planWorkspaceClosure(inspection.candidates);
      sourceWork += summary.workUsed + closure.workUsed;
      if (sourceWork > L.inspectionWork || sourceNodes > L.inspectionNodes || summary.hasOpaque || json(closure.entries) !== json(m.blobs) ||
        json(summary.entityClasses) !== json(m.summary.entityClasses) || json(summary.fieldClasses) !== json(m.summary.fieldClasses)) fail('receive-base-source');
      const value = json({ ...r, completions: [] }), prior = keys.get(r.workspacePackageId);
      if (prior && prior !== value) fail('receive-base-conflict'); keys.set(r.workspacePackageId, value);
      await this.verifyBaseObservation(r);
      if (keys.size > 16) fail('receive-base-budget'); rows.push(r);
    }
    return rows;
  }
  /** A local imported base requires an actual prior observation, not plausible-looking heads. */
  private async verifyBaseObservation(record: ImportedBase): Promise<void> {
    const entries = await new TransactionJournal(this.fs, this.limits).entries(), heads = record.completions[0]!.publishedReceiverHeads;
    const publication = entries.find(e => e.publication && json(e.publication.heads) === json(heads));
    if (!publication?.publication || json(publication.start.proof) !== json({ identity: record.identity, envelope: record.metadataEnvelope })) return fail('receive-base-observation');
    for (const id of await WorkspaceReceiveJob.ids(this.fs)) {
      const prefix = `${root(this.fs)}receive/${id}/`, start = await readReceipt<Start>(this.fs, `${prefix}start.json`, this.limits);
      if (!start) continue;
      const prepared = await readReceipt<Prepared>(this.fs, `${prefix}prepared.json`, this.limits);
      if (!prepared || prepared.packageId !== record.workspacePackageId) continue;
      if (Object.keys(start).sort().join(',') !== 'jobId,operation,prepared,receiver,schema' || start.schema !== 'lociview-package-job-start-1' ||
        start.jobId !== id || start.operation !== 'receiveWorkspace' || json(start.prepared) !== json(reference(prepared)) ||
        json(prepared.manifest) !== json(record.evidence.manifest) || json(prepared.metadata) !== json(record.evidence.metadata)) fail('receive-base-observation');
      const paths = await this.fs.list(`${prefix}steps/`); if (paths.length > 2) fail('receive-step-count');
      let found = false, roots = 0;
      for (const path of paths) {
        const step = await readReceipt<Step>(this.fs, path, this.limits);
        if (!step || path !== `${prefix}steps/${reference(step).sha256}.json` || step.schema !== 'lociview-package-job-step-1' ||
          step.jobId !== id || json(step.start) !== json(reference(start))) return fail('receive-base-observation');
        if (step.previous !== null) continue; roots++;
        const receiver: ReceiverProof = { identity: record.identity, metadataEnvelope: record.metadataEnvelope, heads };
        const detail: Completion = publication.start.transactionId === id ? { kind: 'workspacePublished', receiver,
          journal: reference(publication.prepared), publication: reference(publication.publication) } :
          { kind: 'workspaceAlreadyPresent', receiver, publication: reference(publication.publication) };
        if (json(step) !== json({ schema: 'lociview-package-job-step-1', jobId: id, start: reference(start), previous: null, detail })) continue;
        if (detail.kind === 'workspaceAlreadyPresent' && json(start.receiver) !== json(receiver)) fail('receive-base-observation');
        if (detail.kind === 'workspacePublished') {
          const checksum = ref(new TextEncoder().encode(record.workspaceManifestSha256));
          const remote = { version: 'lociview-package-remote-1', source: { kind: 'fullMetadata', packageId: record.workspacePackageId,
            manifest: record.evidence.manifest, checksum, metadata: record.evidence.metadata, metadataEnvelope: record.metadataEnvelope, remoteHeads: record.declaredHeads }, expectedFinalHeads: heads };
          if (json(publication.prepared?.remote) !== json(remote)) fail('receive-base-observation');
        }
        found = true;
      }
      if (roots > 1) fail('receive-step-chain'); if (found) return;
    }
    fail('receive-base-observation');
  }
  private async readEvidence(e: EvidenceRef): Promise<Uint8Array> {
    if (!e || Object.keys(e).sort().join(',') !== 'byteLength,sha256' || typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256) ||
      !Number.isSafeInteger(e.byteLength) || e.byteLength <= 0 || e.byteLength > L.sourceBytes) return fail('receive-base-evidence');
    const path = `${root(this.fs)}evidence/${e.sha256}`, file = await this.fs.readStream(path);
    if (!file || file.size !== e.byteLength || file.size > L.sourceBytes) return fail('receive-base-evidence');
    const bytes = await this.fs.readBytes(path); if (!bytes || bytes.length !== e.byteLength || await digest(bytes) !== e.sha256) return fail('receive-base-evidence');
    return bytes;
  }
  async journalInput(finalHeads: string[]) {
    const d = this.descriptor(), m = this.manifest(), checksumBytes = await this.original('manifest.sha256');
    return { bytes: await this.original('metadata.am'), manifestBytes: await this.original('manifest.json'), checksumBytes,
      proof: { version: 'lociview-package-remote-1' as const, source: { kind: 'fullMetadata' as const, packageId: m.packageId,
        manifest: d.manifest, checksum: ref(checksumBytes), metadata: d.metadata, metadataEnvelope: m.metadataEnvelope, remoteHeads: [...m.targetHeads] }, expectedFinalHeads: finalHeads } };
  }
}
