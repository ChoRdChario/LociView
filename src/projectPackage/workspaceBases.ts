import * as A from '@automerge/automerge/slim';
import { checkRequiredCapabilities, PORTABLE_MEDIA_CAPABILITY, SCENE_PLACEMENT_CAPABILITY } from '../projectMetadata/requiredCapabilities';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail, type MetadataLimits, type MetadataProof } from '../projectMetadata/format';
import { digest, json, readReceipt, withMetadataRead, writeReceipt } from '../projectMetadata/persistence';
import { checkRemoteHeads } from '../projectMetadata/remote';
import { TransactionJournal, type JournalEntry } from '../projectMetadata/journal';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { packageByteHash, readManifestControl } from './manifest';
import { packageSourceLimits } from './workspaceSource';
import { planWorkspaceClosure } from './closure';
import { summarizeFullHistory } from './historySummary';
import { WorkspaceOutputJob } from './outputJob';
import { readBackupBases, backupEvidenceRefs } from './backupEvidence';

export interface ReceiverProof { identity: MetadataProof['identity']; metadataEnvelope: MetadataProof['envelope']; heads: readonly string[] }
type Start = { schema: 'lociview-package-job-start-1'; jobId: string; prepared: EvidenceRef } &
  ({ operation: 'receiveWorkspace'; receiver: ReceiverProof } |
   { operation: 'importWorkspace'; destination: Omit<ReceiverProof, 'heads'> });
interface Prepared { schema: 'lociview-workspace-receive-1'; packageId: string; manifest: EvidenceRef; metadata: EvidenceRef;
  roots: { blobs: EvidenceRef[]; evidence: EvidenceRef[] } }
interface Binding { schema: 'lociview-workspace-input-1'; jobId: string; prepared: EvidenceRef; archive: EvidenceRef }
type InputState = 'started' | 'input-required' | 'unbound-input' | 'abandoned';
type Completion = { kind: 'workspacePublished'; receiver: ReceiverProof; journal: EvidenceRef; publication: EvidenceRef } |
  { kind: 'workspaceAlreadyPresent'; receiver: ReceiverProof; publication: EvidenceRef };
interface Step { schema: 'lociview-package-job-step-1'; jobId: string; start: EvidenceRef; previous: EvidenceRef | null;
  detail: Completion | { kind: 'baseRecorded'; completion: EvidenceRef; baseRecord: EvidenceRef } | { kind: 'cancelled'; stage: 'beforeWorkspaceJournal' } }
interface ReceiveObservations { ids(): Promise<string[]>; controls(id: string): Promise<{ start: Start | null; prepared: Prepared | null }>; steps(id: string): Promise<{ path: string; step: Step | null }[]> }
export interface WorkspaceBaseRecord { identity: ReceiverProof['identity']; metadataEnvelope: ReceiverProof['metadataEnvelope']; workspacePackageId: string;
  workspaceManifestSha256: string; declaredHeads: readonly string[]; evidence: { manifest: EvidenceRef; metadata: EvidenceRef };
  completions: ({ observation: 'imported'; publishedReceiverHeads: readonly string[] } | { observation: 'generated' })[]; label?: string }

export function workspaceBaseProof(row: WorkspaceBaseRecord) {
  const { completions: _observations, label: _label, ...proof } = row; return proof;
}
function foldBases(rows: readonly WorkspaceBaseRecord[]) {
  const groups = new Map<string, WorkspaceBaseRecord>();
  for (const row of rows) {
    const previous = groups.get(row.workspacePackageId);
    if (previous && json(workspaceBaseProof(previous)) !== json(workspaceBaseProof(row))) fail('receive-base-conflict');
    const completions = [...(previous?.completions ?? []), ...row.completions], label = previous?.label ?? row.label;
    groups.set(row.workspacePackageId, { ...row, ...(label !== undefined ? { label } : {}), completions:
      [...new Map(completions.map(c => [json(c), c])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, c]) => c) });
  }
  return { records: [...groups.values()].sort((a, b) => a.workspacePackageId.localeCompare(b.workspacePackageId)) };
}

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
    const limits = { ...this.limits }, proof = structuredClone(this.proof);
    return withMetadataRead(this.fs, undefined, ({ fs }) => new WorkspaceBaseStore(fs, limits, proof).readDirect());
  }
  /** Display facts are projected and discarded one source at a time; commands select fresh evidence. */
  async displayFacts(store: Pick<OriginBlobStore, 'inspect'>, currentEditorChanges: readonly string[]) {
    const limits = { ...this.limits }, proof = structuredClone(this.proof), current = [...currentEditorChanges];
    return withMetadataRead(this.fs, undefined, async ({ fs }) => {
      const facts = new Map<string, { changes: number; named: boolean; portable: boolean; scenePlacement: boolean; deltaNamed: boolean }>();
      const rows = await new WorkspaceBaseStore(fs, limits, proof).readDirect(async (row, source, closure) => {
        for (const ref of closure.semanticRefs) if (await store.inspect(ref) !== 'verified-present') fail('contribution-base-payload-unavailable');
        const hashes = new Set(source.read().history.changes.map(c => c.id));
        facts.set(row.workspacePackageId, { changes: source.originalChanges().length, named: source.includesDeclaredEditorNames,
          portable: source.requiredCapabilities.includes(PORTABLE_MEDIA_CAPABILITY),
          scenePlacement: source.requiredCapabilities.includes(SCENE_PLACEMENT_CAPABILITY), deltaNamed: current.some(id => !hashes.has(id)) });
      });
      return rows.map(record => ({ record, ...facts.get(record.workspacePackageId)! }));
    });
  }
  private async readDirect(project?: (row: WorkspaceBaseRecord, source: ProjectMetadataSource, closure: ReturnType<typeof planWorkspaceClosure>) => Promise<void>): Promise<WorkspaceBaseRecord[]> {
    const journal = new TransactionJournal(this.fs, this.limits);
    let entries: Promise<readonly JournalEntry[]> | undefined;
    const readEntries = () => entries ??= journal.entries();
    let receiveIds: Promise<string[]> | undefined;
    const receiveControls = new Map<string, Promise<{ start: Start | null; prepared: Prepared | null }>>();
    const receiveSteps = new Map<string, Promise<{ path: string; step: Step | null }[]>>();
    const observations = {
      ids: () => receiveIds ??= receiveJobIds(this.fs),
      controls: (id: string) => {
        let value = receiveControls.get(id);
        if (!value) { const prefix = `${workspacePackageRoot(this.fs)}receive/${id}/`;
          value = (async () => { const start = await readReceipt<Start>(this.fs, `${prefix}start.json`, this.limits);
            return { start, prepared: start ? await readReceipt<Prepared>(this.fs, `${prefix}prepared.json`, this.limits) : null }; })(); receiveControls.set(id, value); }
        return value;
      },
      steps: (id: string) => {
        let value = receiveSteps.get(id);
        if (!value) { value = (async () => {
          const paths = await this.fs.list(`${workspacePackageRoot(this.fs)}receive/${id}/steps/`);
          if (paths.length > 2) fail('receive-step-count');
          const rows: { path: string; step: Step | null }[] = [];
          for (const path of paths) rows.push({ path, step: await readReceipt<Step>(this.fs, path, this.limits) }); return rows;
        })(); receiveSteps.set(id, value); } return value;
      },
    };
    const outputs: { job: WorkspaceOutputJob; kinds: readonly string[] }[] = [];
    await WorkspaceOutputJob.withDiscovery(this.fs, this.limits, async scope => {
      for (const id of scope.ids) { const observed = await scope.read(id);
        if (observed.state === 'started') outputs.push({ job: observed.job, kinds: observed.kinds }); }
    });
    const prefix = `${workspacePackageRoot(this.fs)}bases/`, paths = await this.fs.list(prefix), rows: WorkspaceBaseRecord[] = [];
    let controlBytes = 0;
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
      // Local receipts always require their own copies, even when a restore holds identical evidence.
      await this.verifyBaseObservation(r, outputs, readEntries, observations); rows.push(r);
    }
    await this.requireLocalObservations(rows, observations);
    const restored = await journal.readRestoredBases(await readEntries());
    const historical = restored ? readBackupBases(restored.input.exchangeBasesBytes, this.proof).table.records : [];
    const originals = new Map(restored?.input.proof.source.baseEvidence.map((e, i) => [e.sha256, restored.input.baseEvidenceBytes[i]!]) ?? []);
    const requiredLocal = new Set(rows.flatMap(row => [row.evidence.manifest, row.evidence.metadata]).map(e => `${e.sha256}:${e.byteLength}`));
    rows.push(...historical);
    await this.checkSources(rows, async e => requiredLocal.has(`${e.sha256}:${e.byteLength}`) ? this.readLocalEvidenceBytes(e) :
      originals.get(e.sha256) ?? this.readLocalEvidenceBytes(e), controlBytes, project);
    return rows;
  }
  /** A completed local receive witnesses its own receipt; restored history cannot replace it. */
  private async requireLocalObservations(rows: readonly WorkspaceBaseRecord[], observed?: ReceiveObservations) {
    for (const id of await (observed?.ids() ?? receiveJobIds(this.fs))) {
      const prefix = `${workspacePackageRoot(this.fs)}receive/${id}/`;
      const steps = observed ? await observed.steps(id) : await (async () => {
        const paths = await this.fs.list(`${prefix}steps/`); if (paths.length > 2) fail('receive-step-count');
        const values: { path: string; step: Step | null }[] = [];
        for (const path of paths) values.push({ path, step: await readReceipt<Step>(this.fs, path, this.limits) }); return values;
      })();
      for (const { path, step } of steps) {
        if (!step || step.detail?.kind !== 'baseRecorded') continue;
        const { prepared, start } = observed ? await observed.controls(id) : { prepared: await readReceipt<Prepared>(this.fs, `${prefix}prepared.json`, this.limits),
          start: await readReceipt<Start>(this.fs, `${prefix}start.json`, this.limits) };
        if (!start || !prepared || step.schema !== 'lociview-package-job-step-1' || step.jobId !== id ||
          path !== `${prefix}steps/${reference(step).sha256}.json` || json(step.start) !== json(reference(start)) ||
          json(start.prepared) !== json(reference(prepared)) || !rows.some(r => r.workspacePackageId === prepared.packageId &&
            json(reference(r)) === json(step.detail.kind === 'baseRecorded' ? step.detail.baseRecord : null))) fail('receive-base-missing');
      }
    }
  }
  /** One combined budget for restored history and later real observations. */
  private async checkSources(rows: readonly WorkspaceBaseRecord[], read: (e: EvidenceRef) => Promise<Uint8Array>, controlBytes = 0,
    project?: (row: WorkspaceBaseRecord, source: ProjectMetadataSource, closure: ReturnType<typeof planWorkspaceClosure>) => Promise<void>) {
    const table = foldBases(rows), tableBytes = encodePackageValue(table), parsed = readBackupBases(tableBytes, this.proof);
    backupEvidenceRefs(table);
    if (controlBytes + tableBytes.length + parsed.baseControlBytes > L.controlsBytes) fail('receive-base-budget');
    let sourceWork = 0, sourceNodes = 0, dependencies = parsed.dependencies, operations = 0;
    for (const r of table.records) {
      const manifestBytes = await read(r.evidence.manifest), metadataBytes = await read(r.evidence.metadata);
      for (const [e, bytes] of [[r.evidence.manifest, manifestBytes], [r.evidence.metadata, metadataBytes]] as const)
        if (bytes.length !== e.byteLength || packageByteHash(bytes) !== e.sha256) fail('receive-base-evidence');
      const m = readManifestControl(manifestBytes, new TextEncoder().encode(r.workspaceManifestSha256)).manifest;
      if (m.purpose !== 'teamWorkspace' || m.packageId !== r.workspacePackageId || json(m.identity) !== json(r.identity) || json(m.metadataEnvelope) !== json(r.metadataEnvelope) ||
        json(m.targetHeads) !== json(r.declaredHeads) || json({ sha256: m.metadata.sha256, byteLength: m.metadata.byteLength }) !== json(r.evidence.metadata)) fail('receive-base-manifest');
      const source = ProjectMetadataSource.fromFullSource(metadataBytes, { identity: r.identity, envelope: r.metadataEnvelope }, project ? packageSourceLimits(this.limits) : this.limits);
      checkRequiredCapabilities(m.requiredCapabilities, source.requiredCapabilities);
      if (json(source.heads) !== json(r.declaredHeads)) fail('receive-base-heads');
      for (const bytes of source.originalChanges()) { const change = A.decodeChange(bytes); dependencies += change.deps.length; operations += change.ops.length; }
      if (dependencies > L.dependencyReferences || operations > 100_000) fail('receive-base-budget');
      const inspection = await source.inspectOriginal({ maxNodes: L.inspectionNodes - sourceNodes, maxWork: L.inspectionWork - sourceWork });
      sourceWork += inspection.workUsed; sourceNodes += inspection.nodesUsed;
      const summary = summarizeFullHistory(inspection), closure = planWorkspaceClosure(inspection.candidates);
      sourceWork += summary.workUsed + closure.workUsed;
      if (sourceWork > L.inspectionWork || sourceNodes > L.inspectionNodes || summary.hasOpaque || json(closure.entries) !== json(m.blobs) ||
        json(summary.entityClasses) !== json(m.summary.entityClasses) || json(summary.fieldClasses) !== json(m.summary.fieldClasses)) fail('receive-base-source');
      await project?.(r, source, closure);
    }
  }
  /** A local imported base requires an actual prior observation, not plausible-looking heads. */
  private async verifyBaseObservation(record: WorkspaceBaseRecord, outputs: readonly { job: WorkspaceOutputJob; kinds: readonly string[] }[], readEntries: () => Promise<readonly JournalEntry[]>,
    observations: ReceiveObservations): Promise<void> {
    const completion = record.completions[0]!;
    if (completion.observation === 'generated') {
      const found = outputs.find(({ job }) => job.manifest().packageId === record.workspacePackageId);
      if (!found || !found.kinds.includes('artifactVerified') || json(found.job.baseRecord()) !== json(record)) return fail('output-base-observation');
      found.job.assertOwner(this.fs); return;
    }
    const entries = await readEntries(), heads = completion.publishedReceiverHeads;
    const publication = entries.find(e => e.publication && json(e.publication.heads) === json(heads));
    if (!publication?.publication || json(publication.start.proof) !== json({ identity: record.identity, envelope: record.metadataEnvelope })) return fail('receive-base-observation');
    for (const id of await observations.ids()) {
      const prefix = `${workspacePackageRoot(this.fs)}receive/${id}/`, { start, prepared } = await observations.controls(id);
      if (!start) continue;
      if (!prepared || prepared.packageId !== record.workspacePackageId) continue;
      const importing = start.operation === 'importWorkspace';
      if (Object.keys(start).sort().join(',') !== (importing ? 'destination,jobId,operation,prepared,schema' : 'jobId,operation,prepared,receiver,schema') || start.schema !== 'lociview-package-job-start-1' ||
        start.jobId !== id || !['receiveWorkspace', 'importWorkspace'].includes(start.operation) || json(start.prepared) !== json(reference(prepared)) ||
        json(prepared.manifest) !== json(record.evidence.manifest) || json(prepared.metadata) !== json(record.evidence.metadata)) fail('receive-base-observation');
      if (importing && (json(start.destination) !== json({ identity: record.identity, metadataEnvelope: record.metadataEnvelope }) ||
        publication.start.purpose !== 'importWorkspace' || publication.start.transactionId !== id || json(heads) !== json(record.declaredHeads))) fail('import-base-observation');
      let found = false, roots = 0;
      for (const { path, step } of await observations.steps(id)) {
        if (!step || path !== `${prefix}steps/${reference(step).sha256}.json` || step.schema !== 'lociview-package-job-step-1' ||
          step.jobId !== id || json(step.start) !== json(reference(start))) return fail('receive-base-observation');
        if (step.previous !== null) continue; roots++;
        const receiver: ReceiverProof = { identity: record.identity, metadataEnvelope: record.metadataEnvelope, heads };
        const detail: Completion = publication.start.transactionId === id ? { kind: 'workspacePublished', receiver,
          journal: reference(publication.prepared), publication: reference(publication.publication) } :
          { kind: 'workspaceAlreadyPresent', receiver, publication: reference(publication.publication) };
        if (json(step) !== json({ schema: 'lociview-package-job-step-1', jobId: id, start: reference(start), previous: null, detail })) continue;
        if (detail.kind === 'workspaceAlreadyPresent' && (start.operation !== 'receiveWorkspace' || json(start.receiver) !== json(receiver))) fail('receive-base-observation');
        if (detail.kind === 'workspacePublished') {
          if (publication.start.purpose !== (importing ? 'importWorkspace' : 'remotePackageMerge')) fail('receive-base-observation');
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
  private async readLocalEvidenceBytes(e: EvidenceRef): Promise<Uint8Array> {
    if (!e || Object.keys(e).sort().join(',') !== 'byteLength,sha256' || typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256) ||
      !Number.isSafeInteger(e.byteLength) || e.byteLength <= 0 || e.byteLength > L.sourceBytes) return fail('receive-base-evidence');
    const path = `${workspacePackageRoot(this.fs)}evidence/${e.sha256}`, file = await this.fs.readStream(path);
    if (!file || file.size !== e.byteLength || file.size > L.sourceBytes) return fail('receive-base-evidence');
    const bytes = await this.fs.readBytes(path); if (!bytes || bytes.length !== e.byteLength) return fail('receive-base-evidence');
    return bytes.slice();
  }
  private async readLocalEvidence(e: EvidenceRef): Promise<Uint8Array> {
    const bytes = await this.readLocalEvidenceBytes(e);
    if (await digest(bytes) !== e.sha256) fail('receive-base-evidence'); return bytes;
  }

  async readEvidence(e: EvidenceRef): Promise<Uint8Array> {
    const owned = structuredClone(e), limits = { ...this.limits }, proof = structuredClone(this.proof);
    return withMetadataRead(this.fs, undefined, ({ fs }) => new WorkspaceBaseStore(fs, limits, proof).readEvidenceDirect(owned));
  }
  private async readEvidenceDirect(e: EvidenceRef): Promise<Uint8Array> {
    const restored = await new TransactionJournal(this.fs, this.limits).readRestoredBases();
    return this.readObservedEvidence(e, restored);
  }
  private readObservedEvidence(e: EvidenceRef, restored: Awaited<ReturnType<TransactionJournal['readRestoredBases']>>): Promise<Uint8Array> {
    return this.observedEvidenceReader(restored)(e);
  }
  private observedEvidenceReader(restored: Awaited<ReturnType<TransactionJournal['readRestoredBases']>>) {
    let locals: Promise<Set<string>> | undefined;
    const localReferences = () => locals ??= (async () => {
      const prefix = `${workspacePackageRoot(this.fs)}bases/`, paths = await this.fs.list(prefix);
      if (paths.length > L.entryCount) fail('receive-base-budget');
      let controls = 0; const rows: WorkspaceBaseRecord[] = [], refs = new Set<string>();
      for (const path of paths) {
        const file = await this.fs.readStream(path);
        if (!file || file.size > L.controlBytes || (controls += file.size) > L.controlsBytes) fail('receive-base-budget');
        const row = await readReceipt<WorkspaceBaseRecord>(this.fs, path, this.limits);
        if (!row?.evidence) return fail('receive-base-record');
        rows.push(row); for (const ref of [row.evidence.manifest, row.evidence.metadata]) if (ref) refs.add(ref.sha256);
      }
      await this.requireLocalObservations(rows); return refs;
    })();
    return async (e: EvidenceRef): Promise<Uint8Array> => {
      if (restored && json(restored.entry.start.proof) !== json(this.proof)) return fail('receive-base-lineage');
      const index = restored?.input.proof.source.baseEvidence.findIndex(r => json(r) === json(e)) ?? -1;
      if (!restored || index < 0) return this.readLocalEvidence(e);
      // Local observations still require local bytes; a matching restored copy cannot hide their loss.
      if ((await localReferences()).has(e.sha256) || await this.fs.readStream(`${workspacePackageRoot(this.fs)}evidence/${e.sha256}`)) await this.readLocalEvidence(e);
      return restored.input.baseEvidenceBytes[index]!.slice();
    };
  }

  async snapshot() {
    return foldBases(await this.read());
  }
  async payloads(records: readonly WorkspaceBaseRecord[]) {
    const owned = structuredClone(records), limits = { ...this.limits }, proof = structuredClone(this.proof);
    return withMetadataRead(this.fs, undefined, ({ fs }) => new WorkspaceBaseStore(fs, limits, proof).payloadsDirect(owned));
  }
  private async payloadsDirect(records: readonly WorkspaceBaseRecord[]) {
    const payloads = [];
    let read: ReturnType<WorkspaceBaseStore['observedEvidenceReader']> | undefined;
    for (const r of records) {
      read ??= this.observedEvidenceReader(await new TransactionJournal(this.fs, this.limits).readRestoredBases());
      const m = readManifestControl(await read(r.evidence.manifest), new TextEncoder().encode(r.workspaceManifestSha256)).manifest;
      if (m.purpose !== 'teamWorkspace') return fail('output-base-purpose'); payloads.push(...m.blobs);
    }
    return payloads;
  }
  async preflightRecord(record: WorkspaceBaseRecord, originalEvidence: readonly Uint8Array[]) {
    const rows = await this.read(), keys = new Set(rows.map(r => r.workspacePackageId)), evidence = new Map<string, number>();
    keys.add(record.workspacePackageId);
    for (const r of [...rows, record]) {
      if (r.workspacePackageId === record.workspacePackageId && json(workspaceBaseProof(r)) !== json(workspaceBaseProof(record))) fail('output-base-conflict');
      for (const e of [r.evidence.manifest, r.evidence.metadata]) {
        if (evidence.has(e.sha256) && evidence.get(e.sha256) !== e.byteLength) fail('output-base-evidence'); evidence.set(e.sha256, e.byteLength);
      }
    }
    if (keys.size > 16 || evidence.size > L.baseEvidenceCount || [...evidence.values()].reduce((a, b) => a + b, 0) > L.baseEvidenceBytes) fail('output-base-budget');
    {
      const originals = new Map(originalEvidence.map(bytes => [packageByteHash(bytes), bytes]));
      const prefix = `${workspacePackageRoot(this.fs)}bases/`, paths = await this.fs.list(prefix);
      let controls = paths.includes(`${prefix}${record.workspacePackageId}/${reference(record).sha256}.json`) ? 0 : encodePackageValue(record).length;
      for (const path of paths) { const file = await this.fs.readStream(path); if (!file) return fail('receive-base-record'); controls += file.size; }
      await this.checkSources([...rows, record], async e => originals.get(e.sha256) ?? this.readEvidence(e), controls);
    }
  }
  async recordGenerated(job: WorkspaceOutputJob) {
    job.assertOwner(this.fs); const record = job.baseRecord(); await this.preflightRecord(record, job.originalEvidence()); await job.artifactReceipt();
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
