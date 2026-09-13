import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { fail, MetadataSourceError, type MetadataLimits } from '../projectMetadata/format';
import { json, newId, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import { checkRemoteHeads } from '../projectMetadata/remote';
import { TransactionJournal, type JournalEntry } from '../projectMetadata/journal';
import type { ContributionRemoteInput } from '../projectMetadata/packageRemote';
import { PACKAGE_LIMITS as L, type EvidenceRef, type ChangeEntry } from './contract';
import { WorkspaceBaseStore, workspacePackageRoot, evidenceReference, encodePackageValue, type ReceiverProof } from './workspaceBases';
import { ContributionArchive, VerifiedContributionBase } from './contributionSource';
import type { ContributionBaseProof, ContributionReconstruction } from './contributionEvidence';
import { PackageArchive } from './zipArchive';
import { planWorkspaceClosure } from './closure';

type Store = Pick<OriginBlobStore, 'inspect'>;
type Start = { schema: 'lociview-package-job-start-1'; operation: 'receiveContribution'; jobId: string; prepared: EvidenceRef; receiver: ReceiverProof };
interface Prepared { schema: 'lociview-contribution-receive-1'; packageId: string; manifest: EvidenceRef;
  base: ContributionBaseProof; wireChanges: readonly ChangeEntry[]; reconstruction: ContributionReconstruction;
  roots: { blobs: EvidenceRef[]; evidence: EvidenceRef[] } }
type InputState = 'started' | 'input-required' | 'unbound-input' | 'abandoned';
type Completion = { kind: 'contributionPublished'; receiver: ReceiverProof; journal: EvidenceRef; publication: EvidenceRef } |
  { kind: 'contributionAlreadyPresent'; receiver: ReceiverProof; publication: EvidenceRef };
interface Step { schema: 'lociview-package-job-step-1'; jobId: string; start: EvidenceRef; previous: null;
  detail: Completion | { kind: 'cancelled'; stage: 'beforeContributionJournal' } }
const ref = evidenceReference, reference = (v: unknown) => ref(encodePackageValue(v));
const root = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}contribution-receive/${technicalId(id)}/`;
const indexPath = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}contribution-index/${technicalId(id)}.json`;
function checkRef(r: EvidenceRef, max: number = L.controlBytes) {
  if (!r || Object.keys(r).sort().join(',') !== 'byteLength,sha256' || typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256) ||
    !Number.isSafeInteger(r.byteLength) || r.byteLength <= 0 || r.byteLength > max) fail('contribution-job-reference');
}

/** Frozen original-input owner; writes are only called under the Session's Project lease. */
export class ContributionReceiveJob {
  private constructor(private readonly fs: ProjectWorkspaceFS, readonly id: string, private readonly store: Store,
    private readonly limits: MetadataLimits, readonly inspection: ContributionArchive, private readonly input: Blob,
    readonly start: Start | null, private readonly reselected = false) {}
  assertOwner(fs: ProjectWorkspaceFS) { if (fs !== this.fs) fail('receive-job-owner'); }
  path(name: string) { return `${root(this.fs, this.id)}${name}`; }
  manifest() { const m = this.inspection.archive.control.manifest; if (m.purpose !== 'contribution') return fail('contribution-purpose'); return m; }
  private descriptor(): Prepared {
    const m = this.manifest(), manifest = this.inspection.archive.control.entries.find(e => e.path === 'manifest.json')!;
    const base = this.inspection.base.proof(), reconstruction = this.inspection.reconstruction();
    const evidence = [base.evidence.manifest, base.evidence.metadata, { sha256: manifest.sha256, byteLength: manifest.byteLength }, reconstruction.targetMetadata,
      ...m.changes.map(c => ({ sha256: c.bytesSha256, byteLength: c.byteLength }))];
    return { schema: 'lociview-contribution-receive-1', packageId: m.packageId, manifest: { sha256: manifest.sha256, byteLength: manifest.byteLength },
      base, wireChanges: m.changes, reconstruction, roots: { blobs: m.blobs.map(b => ({ sha256: b.sha256, byteLength: b.byteLength })),
        evidence: [...new Map(evidence.map(e => [e.sha256, e])).values()].sort((a, b) => a.sha256.localeCompare(b.sha256)) } };
  }
  static async prepare(fs: ProjectWorkspaceFS, file: Blob, store: Store, limits: MetadataLimits) {
    if (!(file instanceof Blob)) return fail('receive-file');
    const input = file.slice(), archive = await PackageArchive.inspect(input), m = archive.control.manifest;
    if (m.purpose !== 'contribution') return fail('contribution-purpose');
    const base = await VerifiedContributionBase.select(new WorkspaceBaseStore(fs, limits, { identity: m.identity, envelope: m.metadataEnvelope }), m.base, store, limits);
    return new ContributionReceiveJob(fs, newId(), store, limits, await ContributionArchive.inspect(input, base, store, limits), input, null);
  }
  static async ids(fs: ProjectWorkspaceFS): Promise<string[]> {
    const prefix = `${workspacePackageRoot(fs)}contribution-receive/`, ix = `${workspacePackageRoot(fs)}contribution-index/`;
    const paths = [...await fs.list(prefix), ...await fs.list(ix)];
    if (paths.length > L.entryCount) fail('contribution-job-count');
    const ids = new Set<string>(); let controls = 0, sourceBytes = 0;
    for (const path of paths) {
      const indexed = path.startsWith(ix), tail = path.slice((indexed ? ix : prefix).length);
      if (!(indexed ? /^[0-9a-f]{32}\.json$/ : /^[0-9a-f]{32}\/(input\.zip|input\.json|prepared\.json|start\.json|abandoned\.json|base-manifest\.json|base-metadata\.am|derived-target-metadata\.am|steps\/[0-9a-f]{64}\.json)$/).test(tail)) fail('contribution-job-path');
      ids.add(tail.slice(0, 32)); const f = await fs.readStream(path);
      if (!f || !Number.isSafeInteger(f.size) || f.size < 0) fail('contribution-job-size');
      if (path.endsWith('/input.zip')) { if (f!.size > L.archiveBytes) fail('contribution-job-size'); continue; }
      if (path.endsWith('.am')) { if (f!.size > L.sourceBytes || (sourceBytes += f!.size) > 2_147_483_648 - 16_777_216) fail('contribution-job-size'); }
      else if (f!.size > L.controlBytes || (controls += f!.size) > L.controlsBytes) fail('contribution-job-size');
    }
    return [...ids];
  }
  private static abandonment(id: string) { return { schema: 'lociview-contribution-input-abandoned-1', jobId: id, stage: 'beforeStart' }; }
  private static async binding(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    const p = await readReceipt<Prepared>(fs, `${root(fs, id)}prepared.json`, limits), binding = await readReceipt<any>(fs, `${root(fs, id)}input.json`, limits);
    if (!p || !binding || Object.keys(p).sort().join(',') !== 'base,manifest,packageId,reconstruction,roots,schema,wireChanges' ||
      p.schema !== 'lociview-contribution-receive-1' || !/^pkg_[0-9a-f]{32}$/.test(p.packageId) ||
      Object.keys(binding).sort().join(',') !== 'archive,jobId,prepared,schema' || binding.schema !== 'lociview-contribution-input-1' ||
      binding.jobId !== id || json(binding.prepared) !== json(reference(p))) fail('contribution-input-binding');
    checkRef(binding.archive, L.archiveBytes); checkRef(p!.manifest);
    if (!p!.base?.evidence || !p!.reconstruction) fail('contribution-input-binding');
    checkRef(p!.base.evidence.manifest); checkRef(p!.base.evidence.metadata, L.sourceBytes); checkRef(p!.reconstruction.targetMetadata, L.sourceBytes);
    const ix = await readReceipt(fs, indexPath(fs, id), limits);
    if (ix && json(ix) !== json({ schema: 'lociview-contribution-job-index-1', jobId: id, prepared: reference(p) })) fail('contribution-index');
    return { prepared: p!, binding: binding as { archive: EvidenceRef }, index: ix };
  }
  static async inputState(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits): Promise<InputState> {
    if (!(await this.ids(fs)).includes(id)) return fail('contribution-job-missing');
    const path = root(fs, id), started = await fs.readStream(`${path}start.json`), abandoned = await fs.readStream(`${path}abandoned.json`);
    if (started) { if (abandoned) fail('contribution-input-state'); return 'started'; }
    if ((await new TransactionJournal(fs, limits).entries()).some(e => e.start.transactionId === id) || (await fs.list(`${path}steps/`)).length) fail('contribution-input-state');
    const indexed = !!(await fs.readStream(indexPath(fs, id)));
    if (abandoned) {
      if (json(await readReceipt(fs, `${path}abandoned.json`, limits)) !== json(this.abandonment(id))) fail('contribution-input-state');
      if (indexed) await this.binding(fs, id, limits); return 'abandoned';
    }
    try { await this.binding(fs, id, limits); return 'input-required'; }
    catch (error) {
      if (!indexed && error instanceof MetadataSourceError && ['receipt-invalid', 'contribution-input-binding', 'contribution-job-reference'].includes(error.code)) return 'unbound-input';
      throw error;
    }
  }
  private static async evidence(fs: ProjectWorkspaceFS, id: string, p: Prepared, limits: MetadataLimits) {
    const read = async (name: string, r: EvidenceRef) => {
      const f = await fs.readStream(`${root(fs, id)}${name}`); if (!f || f.size !== r.byteLength) return fail('contribution-job-original');
      const bytes = await fs.readBytes(`${root(fs, id)}${name}`);
      if (!bytes || json(ref(bytes)) !== json(r)) return fail('contribution-job-original'); return bytes;
    };
    const base = await VerifiedContributionBase.fromFrozenEvidence(p.base, await read('base-manifest.json', p.base.evidence.manifest),
      await read('base-metadata.am', p.base.evidence.metadata), limits);
    return { base, derived: await read('derived-target-metadata.am', p.reconstruction.targetMetadata) };
  }
  static async open(fs: ProjectWorkspaceFS, id: string, store: Store, limits: MetadataLimits) {
    if (await this.inputState(fs, id, limits) !== 'started') return fail('contribution-input-incomplete');
    const { prepared, binding, index } = await this.binding(fs, id, limits), path = root(fs, id);
    const start = await readReceipt<Start>(fs, `${path}start.json`, limits);
    if (!start || !index || Object.keys(start).sort().join(',') !== 'jobId,operation,prepared,receiver,schema' ||
      start.schema !== 'lociview-package-job-start-1' || start.operation !== 'receiveContribution' || start.jobId !== id ||
      json(start.prepared) !== json(reference(prepared)) || !start.receiver || Object.keys(start.receiver).sort().join(',') !== 'heads,identity,metadataEnvelope') fail('contribution-start');
    const receiver = start!.receiver; checkRemoteHeads(receiver.heads);
    if (json(receiver.identity) !== json(prepared.base.identity) || json(receiver.metadataEnvelope) !== json(prepared.base.metadataEnvelope)) fail('contribution-lineage');
    const f = await fs.readStream(`${path}input.zip`); if (!f?.blob || f.size !== binding.archive.byteLength) return fail('contribution-input-incomplete');
    const input = await f.blob(); if (input.size !== f.size) fail('contribution-input-size');
    const e = await this.evidence(fs, id, prepared, limits), inspection = await ContributionArchive.restore(input, e.base, e.derived, prepared.reconstruction, store, limits);
    const job = new ContributionReceiveJob(fs, id, store, limits, inspection, input, start!);
    if (inspection.archive.sha256 !== binding.archive.sha256 || json(job.descriptor()) !== json(prepared)) fail('contribution-input-binding');
    await job.steps(); return job;
  }
  static async reselect(fs: ProjectWorkspaceFS, id: string, file: Blob, store: Store, limits: MetadataLimits) {
    if (await this.inputState(fs, id, limits) !== 'input-required') return fail('contribution-reselect-denied');
    const { prepared, binding } = await this.binding(fs, id, limits), e = await this.evidence(fs, id, prepared, limits);
    const input = file.slice(), inspection = await ContributionArchive.restore(input, e.base, e.derived, prepared.reconstruction, store, limits);
    const job = new ContributionReceiveJob(fs, id, store, limits, inspection, input, null, true);
    if (inspection.archive.sha256 !== binding.archive.sha256 || input.size !== binding.archive.byteLength || json(job.descriptor()) !== json(prepared)) fail('contribution-reselected-file');
    return job;
  }
  async preflightBase() {
    if (!this.start && !this.reselected) {
      const selected = await VerifiedContributionBase.select(new WorkspaceBaseStore(this.fs, this.limits, this.inspection.target.proof),
        this.inspection.base.selection, this.store, this.limits);
      if (json(selected.proof()) !== json(this.inspection.base.proof())) fail('contribution-base-evidence');
    }
    await this.inspection.base.verifyInventory(this.store);
  }
  /** Includes base guarantees even when absent from the current sender target. */
  async inventory() {
    const closure = planWorkspaceClosure((await this.inspection.target.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork })).candidates);
    return [...new Map([...this.inspection.base.bodyRefs, ...closure.semanticRefs].map(b => [json(b), { ...b }])).values()];
  }
  async persist(receiver: ReceiverProof, additionalBytes: number) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if (this.start || !this.reselected && (await this.fs.list(this.path(''))).length) fail('contribution-job-exists');
    if (this.reselected && await ContributionReceiveJob.inputState(this.fs, this.id, this.limits) !== 'input-required') fail('contribution-reselect-denied');
    let existing = 0; const paths = await this.fs.list(workspacePackageRoot(this.fs));
    if (paths.length > L.entryCount) fail('receive-space-budget');
    for (const path of paths) { const f = await this.fs.readStream(path); if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('receive-space-read'); existing += f.size; }
    const p = this.descriptor(), originals: [string, Uint8Array][] = [['base-manifest.json', this.inspection.base.manifestBytes()],
      ['base-metadata.am', this.inspection.base.metadataBytes()], ['derived-target-metadata.am', this.inspection.derivedTargetBytes()]];
    const overhead = originals.reduce((n, [, b]) => n + b.length, 0) + encodePackageValue(p).length * 4;
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0 || existing + this.input.size + overhead + additionalBytes > 2_147_483_648 - 16_777_216) fail('receive-space-budget');
    const write = (name: string, value: unknown) => writeReceipt(this.fs, this.path(name), value, this.limits);
    await write('prepared.json', p); await write('input.json', { schema: 'lociview-contribution-input-1', jobId: this.id, prepared: reference(p),
      archive: { sha256: this.inspection.archive.sha256, byteLength: this.input.size } });
    for (const [name, bytes] of originals) {
      if (this.reselected) { const found = await this.fs.readBytes(this.path(name)); if (!found || json(ref(found)) !== json(ref(bytes))) fail('contribution-job-original'); }
      else await this.fs.writeBytes(this.path(name), bytes);
    }
    await this.fs.writeStream(this.path('input.zip'), this.input.stream());
    const e = await ContributionReceiveJob.evidence(this.fs, this.id, p, this.limits), f = await this.fs.readStream(this.path('input.zip'));
    if (!f?.blob || f.size !== this.input.size) return fail('contribution-input-incomplete');
    const inspected = await ContributionArchive.restore(await f.blob(), e.base, e.derived, p.reconstruction, this.store, this.limits);
    if (inspected.archive.sha256 !== this.inspection.archive.sha256) fail('contribution-input-binding');
    await writeReceipt(this.fs, indexPath(this.fs, this.id), { schema: 'lociview-contribution-job-index-1', jobId: this.id, prepared: reference(p) }, this.limits);
    await write('start.json', { schema: 'lociview-package-job-start-1', operation: 'receiveContribution', jobId: this.id, prepared: reference(p), receiver });
    return ContributionReceiveJob.open(this.fs, this.id, this.store, this.limits);
  }
  static async abandon(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if (await this.inputState(fs, id, limits) === 'started') fail('contribution-abandon-denied');
    await writeReceipt(fs, `${root(fs, id)}abandoned.json`, this.abandonment(id), limits);
    if (await this.inputState(fs, id, limits) !== 'abandoned') fail('contribution-input-state');
  }
  async steps(): Promise<Step[]> {
    if (!this.start) return [];
    const paths = await this.fs.list(this.path('steps/')); if (paths.length > 1) fail('contribution-step-count');
    if (!paths.length) return [];
    const s = await readReceipt<Step>(this.fs, paths[0]!, this.limits);
    if (!s || paths[0] !== this.path(`steps/${reference(s).sha256}.json`) || Object.keys(s).sort().join(',') !== 'detail,jobId,previous,schema,start' ||
      s.schema !== 'lociview-package-job-step-1' || s.jobId !== this.id || s.previous !== null || json(s.start) !== json(reference(this.start))) return fail('contribution-step');
    const d = s.detail;
    if (d?.kind === 'cancelled') { if (json(d) !== json({ kind: 'cancelled', stage: 'beforeContributionJournal' })) fail('contribution-step'); }
    else {
      if (!d || !['contributionPublished', 'contributionAlreadyPresent'].includes(d.kind) || Object.keys(d).sort().join(',') !==
        (d.kind === 'contributionPublished' ? 'journal,kind,publication,receiver' : 'kind,publication,receiver') ||
        !d.receiver || Object.keys(d.receiver).sort().join(',') !== 'heads,identity,metadataEnvelope' ||
        json(d.receiver.identity) !== json(this.start.receiver.identity) || json(d.receiver.metadataEnvelope) !== json(this.start.receiver.metadataEnvelope)) fail('contribution-step');
      checkRemoteHeads(d.receiver.heads); checkRef(d.publication); if (d.kind === 'contributionPublished') checkRef(d.journal);
      if (d.kind === 'contributionAlreadyPresent' && json(d.receiver) !== json(this.start.receiver)) fail('receive-stale');
    }
    return [s];
  }
  private async append(detail: Step['detail']) {
    if (!this.start) return fail('contribution-start'); const existing = (await this.steps())[0];
    if (existing) { if (json(existing.detail) !== json(detail)) fail('contribution-observation-mismatch'); return; }
    const s: Step = { schema: 'lociview-package-job-step-1', jobId: this.id, start: reference(this.start), previous: null, detail };
    await writeReceipt(this.fs, this.path(`steps/${reference(s).sha256}.json`), s, this.limits); await this.steps();
  }
  async cancelStale() { await this.append({ kind: 'cancelled', stage: 'beforeContributionJournal' }); }
  async publicationReference() { const d = (await this.steps())[0]?.detail; if (d?.kind === 'cancelled') return fail('receive-cancelled'); return d ?? null; }
  async validateCompletion() {
    if ((await this.steps())[0]?.detail.kind === 'cancelled') {
      if ((await new TransactionJournal(this.fs, this.limits).entries()).some(e => e.start.transactionId === this.id)) fail('contribution-cancelled-journal');
      return;
    }
    const d = await this.publicationReference(); if (!d) return;
    const entry = (await new TransactionJournal(this.fs, this.limits).entries()).find(e => e.publication && json(reference(e.publication)) === json(d.publication));
    if (!entry?.publication || json(entry.publication.heads) !== json(d.receiver.heads)) fail('receive-observation-missing');
    if (d.kind === 'contributionPublished' && (entry!.start.transactionId !== this.id || entry!.start.purpose !== 'remotePackageMerge' ||
      json(reference(entry!.prepared)) !== json(d.journal) || json(entry!.prepared?.remote) !== json((await this.journalInput([...d.receiver.heads])).proof))) fail('receive-journal-originals');
    if (d.kind === 'contributionAlreadyPresent' && (await new TransactionJournal(this.fs, this.limits).entries()).some(e => e.start.transactionId === this.id)) fail('receive-observation-missing');
  }
  async finish(entry: JournalEntry, receiver: ReceiverProof, zero: boolean) {
    if (!this.start || !entry.publication || !entry.prepared || json(entry.publication.heads) !== json(receiver.heads) ||
      json(receiver.identity) !== json(this.start.receiver.identity) || json(receiver.metadataEnvelope) !== json(this.start.receiver.metadataEnvelope)) fail('receive-publication-proof');
    if (zero && json(receiver) !== json(this.start!.receiver) || !zero && (entry.start.transactionId !== this.id || entry.start.purpose !== 'remotePackageMerge' ||
      json(entry.prepared!.remote) !== json((await this.journalInput([...receiver.heads])).proof))) fail('receive-publication-job');
    await this.append(zero ? { kind: 'contributionAlreadyPresent', receiver, publication: reference(entry.publication) } :
      { kind: 'contributionPublished', receiver, publication: reference(entry.publication), journal: reference(entry.prepared) });
  }
  async journalInput(expectedFinalHeads: string[]): Promise<ContributionRemoteInput> {
    const p = this.descriptor(), m = this.manifest(), archive = this.inspection.archive;
    const manifestBytes = await archive.entryBytes('manifest.json', L.controlBytes), checksumBytes = await archive.entryBytes('manifest.sha256', 64);
    return { proof: { version: 'lociview-package-contribution-1', source: { kind: 'contributionDelta', packageId: m.packageId,
      manifest: p.manifest, checksum: ref(checksumBytes), metadataEnvelope: m.metadataEnvelope, remoteHeads: [...m.targetHeads],
      base: p.base, wireChanges: p.wireChanges, reconstruction: p.reconstruction }, expectedFinalHeads }, manifestBytes, checksumBytes,
      baseManifestBytes: this.inspection.base.manifestBytes(), baseMetadataBytes: this.inspection.base.metadataBytes(),
      wireParts: m.changes.map(c => this.inspection.changeBytes(c.ordinal)), derivedTargetBytes: this.inspection.derivedTargetBytes() };
  }
}
