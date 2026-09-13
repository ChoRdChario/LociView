import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { json, newId, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { packageByteHash, readManifestControl } from './manifest';
import { WorkspaceSourceCapture } from './workspaceSource';
import { WorkspaceArchive, prepareWorkspaceManifest, writeWorkspaceArchive } from './workspaceArchive';
import type { WorkspaceBaseRecord } from './workspaceBases';
import { protectedWorkspaceInventory } from './protectedInventory';

const encode = (v: unknown) => new TextEncoder().encode(json(v));
const ref = (b: Uint8Array): EvidenceRef => ({ sha256: packageByteHash(b), byteLength: b.length });
const reference = (v: unknown) => ref(encode(v));
const root = (fs: ProjectWorkspaceFS) => `${fs.projectRoot ? `${fs.projectRoot}/` : ''}v2/packages/`;
const unique = (refs: EvidenceRef[]) => [...new Map(refs.map(r => [r.sha256, r])).values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
type Inventory = ReturnType<typeof protectedWorkspaceInventory>;
interface Inputs { metadata: Uint8Array; manifest: Uint8Array; inventory: Inventory; bases: { records: WorkspaceBaseRecord[] } }
type Artifact = { kind: 'artifactVerified'; archive: EvidenceRef; location: 'opfsArtifact'; sinkId: string };
type Detail = Artifact | { kind: 'baseRecorded'; completion: EvidenceRef; baseRecord: EvidenceRef } |
  { kind: 'externalFileVerified'; archive: EvidenceRef; sinkId: string; profile: 'reselectedFileV1' } |
  { kind: 'cancelled'; stage: 'beforeArtifact' };
interface Step { schema: 'lociview-package-job-step-1'; jobId: string; start: EvidenceRef; previous: EvidenceRef | null; detail: Detail }
const checkRef = (r: EvidenceRef, max: number = L.archiveBytes) => {
  if (!r || Object.keys(r).sort().join(',') !== 'byteLength,sha256' || !/^[0-9a-f]{64}$/.test(r.sha256) ||
    !Number.isSafeInteger(r.byteLength) || r.byteLength <= 0 || r.byteLength > max) fail('output-reference');
};

/** Retained output only. Session owns writes; no current-Project substitution or external sink discovery. */
export class WorkspaceOutputJob {
  readonly source: ProjectMetadataSource;
  private constructor(private readonly fs: ProjectWorkspaceFS, readonly id: string, private readonly limits: MetadataLimits,
    private readonly inputs: Inputs) {
    technicalId(id);
    const m = this.manifest();
    this.source = ProjectMetadataSource.fromFullSource(inputs.metadata, { identity: m.identity, envelope: m.metadataEnvelope }, limits);
    if (json(this.source.heads) !== json(m.targetHeads) || json(ref(inputs.metadata)) !== json({ sha256: m.metadata.sha256, byteLength: m.metadata.byteLength })) fail('output-source');
  }
  assertOwner(fs: ProjectWorkspaceFS) { if (fs !== this.fs) fail('output-owner'); }
  path(name: string) { return `${root(this.fs)}output/${this.id}/${name}`; }
  manifest() {
    const m = readManifestControl(this.inputs.manifest, new TextEncoder().encode(packageByteHash(this.inputs.manifest))).manifest;
    if (m.purpose !== 'teamWorkspace') return fail('output-purpose'); return m;
  }
  private records() {
    const m = this.manifest(), capture = { schema: 'lociview-package-capture-1',
      source: { identity: m.identity, metadataEnvelope: m.metadataEnvelope, heads: m.targetHeads }, sourceMetadata: ref(this.inputs.metadata),
      purpose: 'teamWorkspace', scope: { kind: 'wholeProject' }, protectedInventory: reference(this.inputs.inventory), exchangeBases: reference(this.inputs.bases) };
    const prepared = { schema: 'lociview-package-output-1', capture: reference(capture), packageId: m.packageId,
      manifest: ref(this.inputs.manifest), payloads: [m.metadata, ...m.blobs], roots: {
        blobs: this.inputs.inventory.blobs.map(b => ({ sha256: b.sha256, byteLength: b.byteLength })),
        evidence: unique([ref(this.inputs.metadata), ref(this.inputs.manifest), reference(capture), reference(this.inputs.inventory), reference(this.inputs.bases),
          ...this.inputs.bases.records.flatMap(b => [b.evidence.manifest, b.evidence.metadata])]) } };
    const start = { schema: 'lociview-package-job-start-1', jobId: this.id, operation: 'send', prepared: reference(prepared) };
    return { capture, prepared, start };
  }
  static prepare(fs: ProjectWorkspaceFS, capture: WorkspaceSourceCapture, inventory: Inventory, bases: Inputs['bases'], limits: MetadataLimits, version: string) {
    const { manifest } = prepareWorkspaceManifest(capture, { packageId: `pkg_${newId()}`, createdByVersion: version });
    return new WorkspaceOutputJob(fs, newId(), limits, { metadata: capture.metadataBytes(), manifest,
      inventory: structuredClone(inventory), bases: structuredClone(bases) });
  }
  static async ids(fs: ProjectWorkspaceFS) {
    const prefix = `${root(fs)}output/`, paths = await fs.list(prefix);
    if (paths.length > L.entryCount) return fail('output-job-budget');
    let controls = 0;
    for (const path of paths) {
      if (!/^[0-9a-f]{32}\/(metadata\.am|manifest\.json|inventory\.json|bases\.json|capture\.json|prepared\.json|start\.json|abandoned\.json|steps\/[0-9a-f]{64}\.json|artifacts\/[0-9a-f]{32}\.zip)$/.test(path.slice(prefix.length))) fail('output-path');
      if (path.endsWith('.zip') || path.endsWith('/metadata.am')) continue;
      const file = await fs.readStream(path);
      if (!file || file.size > L.controlBytes || (controls += file.size) > L.controlsBytes) fail('output-control-budget');
    }
    return [...new Set(paths.map(p => p.slice(prefix.length).split('/')[0]!))];
  }
  static async state(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    technicalId(id); if (!(await this.ids(fs)).includes(id)) return fail('output-missing');
    const path = `${root(fs)}output/${id}/`, start = await fs.readStream(`${path}start.json`), abandoned = await fs.readStream(`${path}abandoned.json`);
    if (start) { if (abandoned) return fail('output-state'); return 'started' as const; }
    if ((await fs.list(`${path}steps/`)).length) return fail('output-state');
    if (abandoned) {
      if (json(await readReceipt(fs, `${path}abandoned.json`, limits)) !== json(this.abandonment(id))) fail('output-state');
      return 'abandoned' as const;
    }
    return 'unstarted' as const;
  }
  private static abandonment(id: string) { return { schema: 'lociview-workspace-output-abandoned-1', jobId: id, stage: 'beforeStart' }; }
  static async abandon(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if (await this.state(fs, id, limits) === 'started') return fail('output-abandon-denied');
    await writeReceipt(fs, `${root(fs)}output/${id}/abandoned.json`, this.abandonment(id), limits);
  }
  static async open(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (await this.state(fs, id, limits) !== 'started') return fail('output-unstarted');
    const path = `${root(fs)}output/${id}/`;
    const bytes = async (name: string, max: number) => {
      const file = await fs.readStream(`${path}${name}`); if (!file || file.size > max) return fail('output-input-missing');
      const value = await fs.readBytes(`${path}${name}`); if (!value || value.length !== file.size) return fail('output-input-missing'); return value;
    };
    const metadata = await bytes('metadata.am', L.sourceBytes), manifest = await bytes('manifest.json', L.controlBytes);
    const inventory = await readReceipt<Inventory>(fs, `${path}inventory.json`, limits), bases = await readReceipt<Inputs['bases']>(fs, `${path}bases.json`, limits);
    if (!inventory || !bases || Object.keys(bases).join(',') !== 'records' || !Array.isArray(bases.records) || bases.records.length > 16 ||
      Object.keys(inventory).sort().join(',') !== 'blobs,schema' || inventory.schema !== 'lociview-protected-inventory-1' || !Array.isArray(inventory.blobs) || inventory.blobs.length > L.blobCount) return fail('output-input');
    const job = new WorkspaceOutputJob(fs, id, limits, { metadata, manifest, inventory, bases }), expected = job.records();
    for (const [name, value] of Object.entries(expected)) if (json(await readReceipt(fs, `${path}${name}.json`, limits)) !== json(value)) fail('output-input-binding');
    await job.steps(); return job;
  }
  frozenBases() { return structuredClone(this.inputs.bases); }
  frozenInventory() { return structuredClone(this.inputs.inventory); }
  async persist() {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if ((await this.fs.list(this.path(''))).length) fail('output-exists');
    await this.space(this.inputs.metadata.length + this.inputs.manifest.length + encode(this.inputs.inventory).length + encode(this.inputs.bases).length);
    for (const [name, bytes] of [['metadata.am', this.inputs.metadata], ['manifest.json', this.inputs.manifest]] as const) {
      await this.fs.writeBytes(this.path(name), bytes);
      const stored = await this.fs.readBytes(this.path(name)); if (!stored || json(ref(stored)) !== json(ref(bytes))) fail('output-input-readback');
    }
    for (const [name, value] of [['inventory', this.inputs.inventory], ['bases', this.inputs.bases], ...Object.entries(this.records())] as const)
      await writeReceipt(this.fs, this.path(`${name}.json`), value, this.limits);
    return WorkspaceOutputJob.open(this.fs, this.id, this.limits);
  }
  private async space(additional: number) {
    const paths = await this.fs.list(root(this.fs)); if (paths.length > L.entryCount) return fail('output-space-budget');
    let total = additional + L.baseEvidenceBytes;
    for (const path of paths) {
      const file = await this.fs.readStream(path); if (!file || !Number.isSafeInteger(file.size) || file.size < 0) return fail('output-space-read');
      total += file.size; if (total > 2_147_483_648 - 16_777_216) fail('output-space-budget');
    }
  }
  async steps(): Promise<Step[]> {
    const paths = await this.fs.list(this.path('steps/')); if (paths.length > 4) return fail('output-step-budget');
    const rows: Step[] = [], start = reference(this.records().start);
    for (const path of paths) {
      const s = await readReceipt<Step>(this.fs, path, this.limits);
      if (!s || Object.keys(s).sort().join(',') !== 'detail,jobId,previous,schema,start' || s.schema !== 'lociview-package-job-step-1' ||
        s.jobId !== this.id || path !== this.path(`steps/${reference(s).sha256}.json`) || json(s.start) !== json(start)) return fail('output-step');
      rows.push(s);
    }
    const ordered: Step[] = []; let previous: EvidenceRef | null = null;
    while (ordered.length < rows.length) {
      const next = rows.filter(s => json(s.previous) === json(previous));
      if (next.length !== 1 || ordered.includes(next[0]!)) return fail('output-step-chain');
      const s = next[0]!, d = s.detail, kinds = ordered.map(s => s.detail.kind);
      if (!d || kinds.includes(d.kind) || kinds.includes('cancelled')) return fail('output-step-detail');
      if (d.kind === 'artifactVerified') {
        if (ordered.length || Object.keys(d).sort().join(',') !== 'archive,kind,location,sinkId' || d.location !== 'opfsArtifact') return fail('output-step-detail');
        checkRef(d.archive); technicalId(d.sinkId);
      } else if (d.kind === 'baseRecorded') {
        if (Object.keys(d).sort().join(',') !== 'baseRecord,completion,kind' || ordered.length !== 1 || kinds[0] !== 'artifactVerified' || json(d.completion) !== json(reference(ordered[0]))) return fail('output-step-detail');
        checkRef(d.baseRecord, L.controlBytes);
      } else if (d.kind === 'externalFileVerified') {
        if (Object.keys(d).sort().join(',') !== 'archive,kind,profile,sinkId' || !kinds.includes('baseRecorded') || d.profile !== 'reselectedFileV1' ||
          json(d.archive) !== json((ordered[0]!.detail as Artifact).archive)) return fail('output-step-detail');
        technicalId(d.sinkId);
      } else if (d.kind !== 'cancelled' || Object.keys(d).sort().join(',') !== 'kind,stage' || d.stage !== 'beforeArtifact' || ordered.length) return fail('output-step-detail');
      ordered.push(s); previous = reference(s);
    }
    return ordered;
  }
  private async append(detail: Detail) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized(); const rows = await this.steps(), existing = rows.find(s => s.detail.kind === detail.kind);
    if (existing) { if (json(existing.detail) !== json(detail)) return fail('output-observation'); return existing; }
    if (rows.some(s => s.detail.kind === 'cancelled')) return fail('output-cancelled');
    const step: Step = { schema: 'lociview-package-job-step-1', jobId: this.id, start: reference(this.records().start),
      previous: rows.length ? reference(rows.at(-1)) : null, detail };
    await writeReceipt(this.fs, this.path(`steps/${reference(step).sha256}.json`), step, this.limits); await this.steps(); return step;
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
    const blob = await file.blob!(), inspected = await WorkspaceArchive.inspect(blob, this.limits);
    if (json({ sha256: inspected.archive.sha256, byteLength: inspected.archive.byteLength }) !== json(d.archive) ||
      json(inspected.archive.control.manifest) !== json(this.manifest()) || json(ref(await inspected.archive.entryBytes('metadata.am', L.sourceBytes))) !== json(ref(this.inputs.metadata))) fail('output-artifact-mismatch');
    return { blob, step };
  }
  async validateCompletion() {
    const rows = await this.steps(), completed = rows.find(s => s.detail.kind === 'baseRecorded');
    if (!completed || completed.detail.kind !== 'baseRecorded') return;
    const record = this.baseRecord();
    if (json(completed.detail.baseRecord) !== json(reference(record))) return fail('output-base-binding');
    if (json(await readReceipt(this.fs, `${root(this.fs)}bases/${record.workspacePackageId}/${reference(record).sha256}.json`, this.limits)) !== json(record)) return fail('output-base-missing');
    for (const expected of this.originalEvidence()) {
      const e = ref(expected), path = `${root(this.fs)}evidence/${e.sha256}`, file = await this.fs.readStream(path);
      if (!file || file.size !== e.byteLength) return fail('output-base-evidence');
      const stored = await this.fs.readBytes(path); if (!stored || json(ref(stored)) !== json(e)) return fail('output-base-evidence');
    }
    await this.artifactReceipt();
  }
  async generate(store: OriginBlobStore, signal?: AbortSignal) {
    if ((await this.steps()).some(s => s.detail.kind === 'artifactVerified')) { await this.artifact(); return; }
    if ((await this.steps()).length) return fail('output-cancelled');
    const capture = await WorkspaceSourceCapture.restore(this.inputs.metadata, this.source.proof, this.source.token, store, this.limits, signal);
    const m = this.manifest(), options = { packageId: m.packageId, createdByVersion: m.createdByVersion, ...(m.memo !== undefined ? { memo: m.memo } : {}) };
    const prepared = prepareWorkspaceManifest(capture, options);
    if (json(ref(prepared.manifest)) !== json(ref(this.inputs.manifest))) return fail('output-prepared-mismatch');
    await this.space(prepared.control.archiveByteLength);
    const sinkId = newId(), path = this.path(`artifacts/${sinkId}.zip`); if (await this.fs.exists(path)) return fail('output-sink-exists');
    const bridge = new TransformStream<Uint8Array, Uint8Array>(), cancel = new AbortController(), abort = () => cancel.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    const writing = this.fs.writeStream(path, bridge.readable); void writing.catch(e => cancel.abort(e));
    const generating = writeWorkspaceArchive(capture, store, bridge.writable, { ...options, signal: cancel.signal });
    let generated: Awaited<typeof generating>;
    try { [, generated] = await Promise.all([writing, generating]); }
    catch (error) { cancel.abort(error); await Promise.allSettled([writing, generating]); throw error; }
    finally { signal?.removeEventListener('abort', abort); }
    const file = await this.fs.readStream(path); if (!file?.blob || file.size !== generated.byteLength) return fail('output-close-unverified');
    const inspected = await WorkspaceArchive.inspect(await file.blob(), this.limits, signal);
    if (inspected.archive.sha256 !== generated.sha256 || inspected.archive.byteLength !== generated.byteLength || json(inspected.archive.control.manifest) !== json(m)) return fail('output-readback');
    await this.append({ kind: 'artifactVerified', archive: { sha256: generated.sha256, byteLength: generated.byteLength }, location: 'opfsArtifact', sinkId });
  }
  baseRecord(): WorkspaceBaseRecord {
    const m = this.manifest(); return { identity: m.identity, metadataEnvelope: m.metadataEnvelope, workspacePackageId: m.packageId,
      workspaceManifestSha256: packageByteHash(this.inputs.manifest), declaredHeads: [...m.targetHeads],
      evidence: { manifest: ref(this.inputs.manifest), metadata: ref(this.inputs.metadata) }, completions: [{ observation: 'generated' }] };
  }
  originalEvidence() { return [this.inputs.manifest.slice(), this.inputs.metadata.slice()]; }
  async baseRecorded(record: WorkspaceBaseRecord) {
    if (json(record) !== json(this.baseRecord())) return fail('output-base');
    const { step } = await this.artifactReceipt(); await this.append({ kind: 'baseRecorded', completion: reference(step), baseRecord: reference(record) });
  }
  async verifySelected(file: Blob) {
    await this.validateCompletion();
    const { step } = await this.artifact(); if (!(await this.steps()).some(s => s.detail.kind === 'baseRecorded')) return fail('output-base-incomplete');
    const observed = await WorkspaceArchive.inspect(file.slice(), this.limits), expected = (step.detail as Artifact).archive;
    if (observed.archive.sha256 !== expected.sha256 || observed.archive.byteLength !== expected.byteLength) return fail('output-selected-mismatch');
    if (!(await this.steps()).some(s => s.detail.kind === 'externalFileVerified'))
      await this.append({ kind: 'externalFileVerified', archive: expected, sinkId: newId(), profile: 'reselectedFileV1' });
  }
  async cancel() { if ((await this.steps()).some(s => s.detail.kind !== 'cancelled')) return fail('output-cancel-denied'); await this.append({ kind: 'cancelled', stage: 'beforeArtifact' }); }
}

/** Generated table records require the actual generation observation; baseRecorded intentionally follows table commit. */
export async function verifyGeneratedBase(fs: ProjectWorkspaceFS, limits: MetadataLimits, record: WorkspaceBaseRecord, opened?: readonly WorkspaceOutputJob[]) {
  const jobs = opened ? [...opened] : [];
  if (!opened) for (const id of await WorkspaceOutputJob.ids(fs)) if (await WorkspaceOutputJob.state(fs, id, limits) === 'started') jobs.push(await WorkspaceOutputJob.open(fs, id, limits));
  for (const job of jobs) {
    job.assertOwner(fs);
    if (job.manifest().packageId !== record.workspacePackageId) continue;
    if (json(job.baseRecord()) !== json(record)) return fail('output-base-observation');
    await job.artifactReceipt(); return;
  }
  return fail('output-base-observation');
}
