import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail, type MetadataLimits, type MetadataProof } from '../projectMetadata/format';
import { digest, json, readReceipt, writeReceipt } from '../projectMetadata/persistence';
import { checkRemoteHeads } from '../projectMetadata/remote';
import { TransactionJournal } from '../projectMetadata/journal';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { packageByteHash, readManifestControl } from './manifest';
import { planWorkspaceClosure } from './closure';
import { summarizeFullHistory } from './historySummary';
import { verifyGeneratedBase, WorkspaceOutputJob } from './outputJob';

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
export interface WorkspaceBaseRecord { identity: ReceiverProof['identity']; metadataEnvelope: ReceiverProof['metadataEnvelope']; workspacePackageId: string;
  workspaceManifestSha256: string; declaredHeads: readonly string[]; evidence: { manifest: EvidenceRef; metadata: EvidenceRef };
  completions: ({ observation: 'imported'; publishedReceiverHeads: readonly string[] } | { observation: 'generated' })[] }

export const encodePackageValue = (value: unknown) => new TextEncoder().encode(json(value));
export const evidenceReference = (bytes: Uint8Array): EvidenceRef => ({ sha256: packageByteHash(bytes), byteLength: bytes.length });
const ref = evidenceReference, reference = (value: unknown) => ref(encodePackageValue(value));
export const workspacePackageRoot = (fs: ProjectWorkspaceFS) => `${fs.projectRoot ? `${fs.projectRoot}/` : ''}v2/packages/`;
function validCompletion(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.observation === 'generated' ? Object.keys(v).join(',') === 'observation' :
    v.observation === 'imported' && Object.keys(v).sort().join(',') === 'observation,publishedReceiverHeads';
}
export async function receiveJobIds(fs: ProjectWorkspaceFS): Promise<string[]> {
    const prefix = `${workspacePackageRoot(fs)}receive/`, paths = await fs.list(prefix);
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

/** Shared retained-base authority. Imported evidence checks stay unchanged. */
export class WorkspaceBaseStore {
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly limits: MetadataLimits, private readonly proof: MetadataProof) {}
  async read(): Promise<WorkspaceBaseRecord[]> {
    const outputs: WorkspaceOutputJob[] = [];
    for (const id of await WorkspaceOutputJob.ids(this.fs)) if (await WorkspaceOutputJob.state(this.fs, id, this.limits) === 'started') {
      const job = await WorkspaceOutputJob.open(this.fs, id, this.limits); await job.validateCompletion(); outputs.push(job);
    }
    const prefix = `${workspacePackageRoot(this.fs)}bases/`, paths = await this.fs.list(prefix), rows: WorkspaceBaseRecord[] = [], keys = new Map<string, string>();
    const evidence = new Map<string, number>(); let controlBytes = 0, sourceWork = 0, sourceNodes = 0;
    if (paths.length > L.entryCount) fail('receive-base-budget');
    for (const path of paths) {
      const file = await this.fs.readStream(path); if (!file || file.size > L.controlBytes || (controlBytes += file.size) > L.controlsBytes) return fail('receive-base-budget');
      const r = await readReceipt<WorkspaceBaseRecord>(this.fs, path, this.limits);
      if (!r || Object.keys(r).sort().join(',') !== 'completions,declaredHeads,evidence,identity,metadataEnvelope,workspaceManifestSha256,workspacePackageId' ||
        typeof r.workspacePackageId !== 'string' || !/^pkg_[0-9a-f]{32}$/.test(r.workspacePackageId) ||
        path !== `${prefix}${r.workspacePackageId}/${reference(r).sha256}.json` ||
        json(r.identity) !== json(this.proof.identity) || json(r.metadataEnvelope) !== json(this.proof.envelope) ||
        !r.evidence || Object.keys(r.evidence).sort().join(',') !== 'manifest,metadata' ||
        !Array.isArray(r.completions) || r.completions.length !== 1 || !validCompletion(r.completions[0])) return fail('receive-base-record');
      checkRemoteHeads(r.declaredHeads); if (r.completions[0]!.observation === 'imported') checkRemoteHeads(r.completions[0]!.publishedReceiverHeads);
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
      await this.verifyBaseObservation(r, outputs);
      if (keys.size > 16) fail('receive-base-budget'); rows.push(r);
    }
    return rows;
  }
  /** A local imported base requires an actual prior observation, not plausible-looking heads. */
  private async verifyBaseObservation(record: WorkspaceBaseRecord, outputs: readonly WorkspaceOutputJob[]): Promise<void> {
    const completion = record.completions[0]!;
    if (completion.observation === 'generated') return verifyGeneratedBase(this.fs, this.limits, record, outputs);
    const entries = await new TransactionJournal(this.fs, this.limits).entries(), heads = completion.publishedReceiverHeads;
    const publication = entries.find(e => e.publication && json(e.publication.heads) === json(heads));
    if (!publication?.publication || json(publication.start.proof) !== json({ identity: record.identity, envelope: record.metadataEnvelope })) return fail('receive-base-observation');
    for (const id of await receiveJobIds(this.fs)) {
      const prefix = `${workspacePackageRoot(this.fs)}receive/${id}/`, start = await readReceipt<Start>(this.fs, `${prefix}start.json`, this.limits);
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
  async readEvidence(e: EvidenceRef): Promise<Uint8Array> {
    if (!e || Object.keys(e).sort().join(',') !== 'byteLength,sha256' || typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256) ||
      !Number.isSafeInteger(e.byteLength) || e.byteLength <= 0 || e.byteLength > L.sourceBytes) return fail('receive-base-evidence');
    const path = `${workspacePackageRoot(this.fs)}evidence/${e.sha256}`, file = await this.fs.readStream(path);
    if (!file || file.size !== e.byteLength || file.size > L.sourceBytes) return fail('receive-base-evidence');
    const bytes = await this.fs.readBytes(path); if (!bytes || bytes.length !== e.byteLength || await digest(bytes) !== e.sha256) return fail('receive-base-evidence');
    return bytes;
  }

  async snapshot() {
    const groups = new Map<string, WorkspaceBaseRecord>();
    for (const row of await this.read()) {
      const previous = groups.get(row.workspacePackageId);
      const completions = [...(previous?.completions ?? []), ...row.completions];
      groups.set(row.workspacePackageId, { ...row, completions: [...new Map(completions.map(c => [json(c), c])).entries()]
        .sort(([a], [b]) => a.localeCompare(b)).map(([, c]) => c) });
    }
    return { records: [...groups.values()].sort((a, b) => a.workspacePackageId.localeCompare(b.workspacePackageId)) };
  }
  async payloads(records: readonly WorkspaceBaseRecord[]) {
    const payloads = [];
    for (const r of records) {
      const m = readManifestControl(await this.readEvidence(r.evidence.manifest), new TextEncoder().encode(r.workspaceManifestSha256)).manifest;
      if (m.purpose !== 'teamWorkspace') return fail('output-base-purpose'); payloads.push(...m.blobs);
    }
    return payloads;
  }
  async preflightGenerated(record: WorkspaceBaseRecord) {
    const rows = await this.read(), keys = new Set(rows.map(r => r.workspacePackageId)), evidence = new Map<string, number>();
    keys.add(record.workspacePackageId);
    for (const r of [...rows, record]) {
      if (r.workspacePackageId === record.workspacePackageId && json({ ...r, completions: [] }) !== json({ ...record, completions: [] })) fail('output-base-conflict');
      for (const e of [r.evidence.manifest, r.evidence.metadata]) {
        if (evidence.has(e.sha256) && evidence.get(e.sha256) !== e.byteLength) fail('output-base-evidence'); evidence.set(e.sha256, e.byteLength);
      }
    }
    if (keys.size > 16 || evidence.size > L.baseEvidenceCount || [...evidence.values()].reduce((a, b) => a + b, 0) > L.baseEvidenceBytes) fail('output-base-budget');
  }
  async recordGenerated(job: WorkspaceOutputJob) {
    job.assertOwner(this.fs); const record = job.baseRecord(); await this.preflightGenerated(record); await job.artifactReceipt();
    const path = `${workspacePackageRoot(this.fs)}bases/${record.workspacePackageId}/${reference(record).sha256}.json`;
    if ((await job.steps()).some(s => s.detail.kind === 'baseRecorded')) {
      if (json(await readReceipt(this.fs, path, this.limits)) !== json(record)) return fail('output-base-missing'); return record;
    }
    for (const bytes of job.originalEvidence()) {
      const e = ref(bytes), path = `${workspacePackageRoot(this.fs)}evidence/${e.sha256}`;
      if (!await this.fs.readStream(path)) { this.fs.mutationAuthority.assertWorkspaceWriteAuthorized(); await this.fs.writeBytes(path, bytes); }
      await this.readEvidence(e);
    }
    await writeReceipt(this.fs, path, record, this.limits); await this.read(); return record;
  }
}
