import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { ProjectContentVerifier } from '../domain/projectContentChecks';
import { fail, type MetadataLimits, type MetadataProof } from '../projectMetadata/format';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { json, newId, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { packageByteHash, readManifestControl } from './manifest';
import { ReviewSourceCapture } from './reviewSource';
import { readReviewSnapshot, type ReviewSnapshot } from './reviewSnapshot';
import type { ReviewReconstruction } from './reviewSelection';
import { ReviewArchive, prepareReviewManifest } from './reviewArchive';
import { writePackageArchive } from './workspaceArchive';
import { packageSourceLimits } from './contributionEvidence';
import { workspacePackageRoot, type WorkspaceBaseRecord } from './workspaceBases';
import type { protectedWorkspaceInventory } from './protectedInventory';
import { checkAbort } from './zipChecks';

const encode = (v: unknown) => new TextEncoder().encode(json(v));
const ref = (b: Uint8Array): EvidenceRef => ({ sha256: packageByteHash(b), byteLength: b.length });
const reference = (v: unknown) => ref(encode(v));
const root = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}review-output/${technicalId(id)}/`;
const indexPath = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}review-output-index/${technicalId(id)}.json`;
const unique = (refs: EvidenceRef[]) => [...new Map(refs.map(r => [r.sha256, r])).values()].sort((a, b) => a.sha256 < b.sha256 ? -1 : 1);
type Inventory = ReturnType<typeof protectedWorkspaceInventory>;
interface Inputs { original: Uint8Array; sourceProof: MetadataProof; snapshot: Uint8Array; manifest: Uint8Array;
  reconstruction: ReviewReconstruction; inventory: Inventory; bases: { records: WorkspaceBaseRecord[] } }
type Artifact = { kind: 'artifactVerified'; archive: EvidenceRef; location: 'opfsArtifact'; sinkId: string };
type Detail = Artifact | { kind: 'externalFileVerified'; archive: EvidenceRef; sinkId: string; profile: 'reselectedFileV1' } | { kind: 'cancelled'; stage: 'beforeArtifact' };
interface Step { schema: 'lociview-package-job-step-1'; jobId: string; start: EvidenceRef; previous: EvidenceRef | null; detail: Detail }
const checkRef = (v: EvidenceRef) => {
  if (!v || Object.keys(v).sort().join(',') !== 'byteLength,sha256' || typeof v.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(v.sha256) ||
    !Number.isSafeInteger(v.byteLength) || v.byteLength <= 0 || v.byteLength > L.archiveBytes) fail('output-reference');
};

/** Local frozen review attempt. The source proof/recipe never enters the ZIP. */
export class ReviewOutputJob {
  readonly source: ProjectMetadataSource;
  private constructor(private readonly fs: ProjectWorkspaceFS, readonly id: string, private readonly limits: MetadataLimits, private readonly inputs: Inputs,
    readonly review: ReviewSnapshot) {
    technicalId(id); const m = this.manifest();
    this.source = ProjectMetadataSource.fromFullSource(inputs.original, inputs.sourceProof, packageSourceLimits(limits));
    if (review.token !== m.snapshot.sha256 || inputs.snapshot.length !== m.snapshot.byteLength ||
      packageByteHash(inputs.snapshot) !== review.token || review.snapshot.snapshotId !== m.snapshotId ||
      json(review.closure.entries) !== json(m.blobs) || json(review.summary) !== json(m.summary)) fail('output-source');
  }
  assertOwner(fs: ProjectWorkspaceFS) { if (fs !== this.fs) fail('output-owner'); }
  path(name: string) { return `${root(this.fs, this.id)}${name}`; }
  manifest() {
    const m = readManifestControl(this.inputs.manifest, new TextEncoder().encode(packageByteHash(this.inputs.manifest))).manifest;
    if (m.purpose !== 'review') return fail('output-purpose'); return m;
  }
  private records() {
    const m = this.manifest(), capture = { schema: 'lociview-package-capture-1',
      source: { identity: this.source.proof.identity, metadataEnvelope: this.source.proof.envelope, heads: this.source.heads }, sourceMetadata: ref(this.inputs.original),
      purpose: 'review', scope: { kind: 'scene', sceneId: this.inputs.reconstruction.selection.sceneId }, protectedInventory: reference(this.inputs.inventory), exchangeBases: reference(this.inputs.bases) };
    const prepared = { schema: 'lociview-package-output-1', capture: reference(capture), packageId: m.packageId,
      manifest: ref(this.inputs.manifest), payloads: [m.snapshot, ...m.blobs], roots: {
        blobs: this.inputs.inventory.blobs.map(b => ({ sha256: b.sha256, byteLength: b.byteLength })),
        evidence: unique([ref(this.inputs.original), ref(this.inputs.snapshot), ref(this.inputs.manifest), reference(this.inputs.reconstruction), reference(capture),
          reference(this.inputs.inventory), reference(this.inputs.bases), ...this.inputs.bases.records.flatMap(b => [b.evidence.manifest, b.evidence.metadata])]) } };
    return { capture, prepared, start: { schema: 'lociview-package-job-start-1', jobId: this.id, operation: 'reviewCopy', prepared: reference(prepared) } };
  }
  static prepare(fs: ProjectWorkspaceFS, capture: ReviewSourceCapture, inventory: Inventory, bases: Inputs['bases'], limits: MetadataLimits, version: string) {
    const { manifest } = prepareReviewManifest(capture, { packageId: `pkg_${newId()}`, createdByVersion: version });
    return new ReviewOutputJob(fs, newId(), limits, { original: capture.sourceBytes(), sourceProof: capture.source.proof, snapshot: capture.snapshotBytes(), manifest,
      reconstruction: structuredClone(capture.reconstruction), inventory: structuredClone(inventory), bases: structuredClone(bases) }, capture.review);
  }
  static async ids(fs: ProjectWorkspaceFS) {
    const prefix = `${workspacePackageRoot(fs)}review-output/`, ix = `${workspacePackageRoot(fs)}review-output-index/`;
    const paths = [...await fs.list(prefix), ...await fs.list(ix)], ids = new Set<string>(); let controls = 0;
    if (paths.length > L.entryCount) fail('output-job-budget');
    for (const path of paths) {
      const indexed = path.startsWith(ix), tail = path.slice((indexed ? ix : prefix).length);
      if (!(indexed ? /^[0-9a-f]{32}\.json$/ : /^[0-9a-f]{32}\/(source\.am|review\.json|manifest\.json|review-reconstruction\.json|inventory\.json|bases\.json|capture\.json|prepared\.json|start\.json|abandoned\.json|steps\/[0-9a-f]{64}\.json|artifacts\/[0-9a-f]{32}\.zip)$/).test(tail)) fail('output-path');
      ids.add(tail.slice(0, 32));
      const f = await fs.readStream(path); if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('output-input-missing');
      if (path.endsWith('.zip')) { if (f.size > L.archiveBytes) fail('output-space-budget'); }
      else if (path.endsWith('.am') || path.endsWith('/review.json')) { if (f.size > L.sourceBytes) fail('output-space-budget'); }
      else if (f.size > L.controlBytes || (controls += f.size) > L.controlsBytes) fail('output-control-budget');
    }
    return [...ids];
  }
  static async state(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (!(await this.ids(fs)).includes(technicalId(id))) return fail('output-missing');
    const path = root(fs, id), start = await fs.readStream(`${path}start.json`), abandoned = await fs.readStream(`${path}abandoned.json`);
    const ix = await readReceipt(fs, indexPath(fs, id), limits);
    if (ix) {
      const prepared = await readReceipt(fs, `${path}prepared.json`, limits);
      if (!prepared || json(ix) !== json({ schema: 'lociview-review-output-index-1', jobId: id, prepared: reference(prepared) })) fail('output-index');
    }
    if (start) { if (abandoned || !ix) return fail('output-state'); return 'started' as const; }
    if ((await fs.list(`${path}steps/`)).length) return fail('output-state');
    if (abandoned) { if (json(await readReceipt(fs, `${path}abandoned.json`, limits)) !== json(this.abandonment(id))) fail('output-state'); return 'abandoned' as const; }
    return 'unstarted' as const;
  }
  private static abandonment(id: string) { return { schema: 'lociview-review-output-abandoned-1', jobId: id, stage: 'beforeStart' }; }
  static async abandon(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (await this.state(fs, id, limits) === 'started') return fail('output-abandon-denied');
    await writeReceipt(fs, `${root(fs, id)}abandoned.json`, this.abandonment(id), limits);
  }
  static async open(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (await this.state(fs, id, limits) !== 'started') return fail('output-unstarted');
    const path = root(fs, id), bytes = async (name: string, max: number) => {
      const f = await fs.readStream(`${path}${name}`); if (!f || f.size > max) return fail('output-input-missing');
      const b = await fs.readBytes(`${path}${name}`); if (!b || b.length !== f.size) return fail('output-input-missing'); return b;
    };
    const original = await bytes('source.am', L.sourceBytes), snapshot = await bytes('review.json', L.sourceBytes), manifest = await bytes('manifest.json', L.controlBytes);
    const capture = await readReceipt<{ source: { identity: MetadataProof['identity']; metadataEnvelope: MetadataProof['envelope'] } }>(fs, `${path}capture.json`, limits);
    const inventory = await readReceipt<Inventory>(fs, `${path}inventory.json`, limits), bases = await readReceipt<Inputs['bases']>(fs, `${path}bases.json`, limits),
      reconstruction = await readReceipt<ReviewReconstruction>(fs, `${path}review-reconstruction.json`, limits);
    if (!capture?.source || !inventory || !bases || !reconstruction || Object.keys(bases).join(',') !== 'records' || !Array.isArray(bases.records) || bases.records.length > 16 ||
      Object.keys(inventory).sort().join(',') !== 'blobs,schema' || inventory.schema !== 'lociview-protected-inventory-1' || !Array.isArray(inventory.blobs) || inventory.blobs.length > L.blobCount) return fail('output-input');
    const job = new ReviewOutputJob(fs, id, limits, { original, snapshot, manifest, inventory, bases, reconstruction,
      sourceProof: { identity: capture.source.identity, envelope: capture.source.metadataEnvelope } }, await readReviewSnapshot(snapshot, limits));
    for (const [name, value] of Object.entries(job.records())) if (json(await readReceipt(fs, `${path}${name}.json`, limits)) !== json(value)) fail('output-input-binding');
    await job.steps(); return job;
  }
  frozenBases() { return structuredClone(this.inputs.bases); }
  frozenInventory() { return structuredClone(this.inputs.inventory); }
  async persist() {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if ((await this.fs.list(this.path(''))).length) fail('output-exists');
    const { capture, prepared, start } = this.records();
    const receipts = [['review-reconstruction', this.inputs.reconstruction], ['inventory', this.inputs.inventory], ['bases', this.inputs.bases], ['capture', capture], ['prepared', prepared]] as const;
    const ix = { schema: 'lociview-review-output-index-1', jobId: this.id, prepared: reference(prepared) };
    await this.space(this.inputs.original.length + this.inputs.snapshot.length + this.inputs.manifest.length +
      receipts.reduce((n, [, value]) => n + encode(value).length, 0) + encode(ix).length + encode(start).length);
    for (const [name, bytes] of [['source.am', this.inputs.original], ['review.json', this.inputs.snapshot], ['manifest.json', this.inputs.manifest]] as const) {
      await this.fs.writeBytes(this.path(name), bytes);
      const stored = await this.fs.readBytes(this.path(name)); if (!stored || json(ref(stored)) !== json(ref(bytes))) fail('output-input-readback');
    }
    for (const [name, value] of receipts)
      await writeReceipt(this.fs, this.path(`${name}.json`), value, this.limits);
    await writeReceipt(this.fs, indexPath(this.fs, this.id), ix, this.limits);
    await writeReceipt(this.fs, this.path('start.json'), start, this.limits);
    return this;
  }
  private async space(additional: number) {
    const paths = await this.fs.list(workspacePackageRoot(this.fs)); if (paths.length > L.entryCount) fail('output-space-budget');
    let total = additional + L.baseEvidenceBytes;
    for (const path of paths) { const f = await this.fs.readStream(path); if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('output-space-read');
      if ((total += f.size) > 2_147_483_648 - 16_777_216) fail('output-space-budget'); }
  }
  async steps(): Promise<Step[]> {
    const paths = await this.fs.list(this.path('steps/')); if (paths.length > 2) return fail('output-step-budget');
    const rows: Step[] = [], start = reference(this.records().start);
    for (const path of paths) {
      const s = await readReceipt<Step>(this.fs, path, this.limits);
      if (!s || Object.keys(s).sort().join(',') !== 'detail,jobId,previous,schema,start' || s.schema !== 'lociview-package-job-step-1' ||
        s.jobId !== this.id || path !== this.path(`steps/${reference(s).sha256}.json`) || json(s.start) !== json(start)) return fail('output-step'); rows.push(s);
    }
    const ordered: Step[] = []; let previous: EvidenceRef | null = null;
    while (ordered.length < rows.length) {
      const next = rows.filter(s => json(s.previous) === json(previous)); if (next.length !== 1 || ordered.includes(next[0]!)) return fail('output-step-chain');
      const s = next[0]!, d = s.detail;
      if (!d) return fail('output-step-detail');
      if (d.kind === 'artifactVerified') {
        if (ordered.length || Object.keys(d).sort().join(',') !== 'archive,kind,location,sinkId' || d.location !== 'opfsArtifact') return fail('output-step-detail'); checkRef(d.archive); technicalId(d.sinkId);
      } else if (d.kind === 'externalFileVerified') {
        const first = ordered[0]?.detail;
        if (ordered.length !== 1 || first?.kind !== 'artifactVerified' || Object.keys(d).sort().join(',') !== 'archive,kind,profile,sinkId' || d.profile !== 'reselectedFileV1' || json(d.archive) !== json(first.archive)) return fail('output-step-detail'); technicalId(d.sinkId);
      } else if (d.kind !== 'cancelled' || Object.keys(d).sort().join(',') !== 'kind,stage' || d.stage !== 'beforeArtifact' || ordered.length) return fail('output-step-detail');
      ordered.push(s); previous = reference(s);
    }
    return ordered;
  }
  private async append(detail: Detail) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized(); const rows = await this.steps(), prior = rows.find(s => s.detail.kind === detail.kind);
    if (prior) { if (json(prior.detail) !== json(detail)) return fail('output-observation'); return; }
    if (rows.some(s => s.detail.kind === 'cancelled')) return fail('output-cancelled');
    const step: Step = { schema: 'lociview-package-job-step-1', jobId: this.id, start: reference(this.records().start), previous: rows.length ? reference(rows.at(-1)) : null, detail };
    await writeReceipt(this.fs, this.path(`steps/${reference(step).sha256}.json`), step, this.limits); await this.steps();
  }
  async artifactReceipt() {
    const step = (await this.steps()).find(s => s.detail.kind === 'artifactVerified'); if (!step || step.detail.kind !== 'artifactVerified') return fail('output-unverified');
    const d = step.detail, file = await this.fs.readStream(this.path(`artifacts/${d.sinkId}.zip`)); if (!file?.blob || file.size !== d.archive.byteLength) return fail('output-artifact-missing');
    return { file, step, detail: d };
  }
  async artifact() {
    const { file, step, detail } = await this.artifactReceipt(), blob = await file.blob!(), inspected = await ReviewArchive.inspect(blob, this.limits);
    if (json({ sha256: inspected.archive.sha256, byteLength: inspected.archive.byteLength }) !== json(detail.archive) || json(inspected.archive.control.manifest) !== json(this.manifest())) fail('output-artifact-mismatch');
    return { blob, step };
  }
  async validateCompletion() { if ((await this.steps()).some(s => s.detail.kind === 'artifactVerified')) await this.artifactReceipt(); }
  async generate(store: OriginBlobStore, verifier: ProjectContentVerifier, signal?: AbortSignal) {
    // Warm retry reopens durable inputs too. A memory copy cannot conceal loss.
    const saved = await ReviewOutputJob.open(this.fs, this.id, this.limits);
    if (json(saved.records()) !== json(this.records())) fail('output-input-binding');
    const capture = await ReviewSourceCapture.restore({ source: saved.inputs.original, sourceProof: saved.source.proof, snapshot: saved.inputs.snapshot,
      reconstruction: saved.inputs.reconstruction }, store, verifier, this.limits, signal);
    if ((await this.steps()).some(s => s.detail.kind === 'artifactVerified')) { await this.artifact(); return; }
    if ((await this.steps()).length) return fail('output-cancelled');
    const m = this.manifest(), controls = { manifest: this.inputs.manifest, checksum: new TextEncoder().encode(packageByteHash(this.inputs.manifest)) };
    if (json(prepareReviewManifest(capture, { packageId: m.packageId, createdByVersion: m.createdByVersion }).control.manifest) !== json(m)) fail('output-prepared-mismatch');
    await this.space(readManifestControl(controls.manifest, controls.checksum).archiveByteLength);
    const sinkId = newId(), path = this.path(`artifacts/${sinkId}.zip`); if (await this.fs.exists(path)) return fail('output-sink-exists');
    const bridge = new TransformStream<Uint8Array, Uint8Array>(), cancel = new AbortController(), abort = () => cancel.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    const writing = this.fs.writeStream(path, bridge.readable);
    void writing.catch(e => { cancel.abort(e); void bridge.readable.cancel(e).catch(() => {}); });
    const generating = writePackageArchive(capture, controls, [{ path: 'review.json', bytes: this.inputs.snapshot }], store, bridge.writable,
      { packageId: m.packageId, createdByVersion: m.createdByVersion, signal: cancel.signal });
    let generated: Awaited<typeof generating>;
    try { [, generated] = await Promise.all([writing, generating]); }
    catch (error) { cancel.abort(error); await Promise.allSettled([writing, generating]); throw error; }
    finally { signal?.removeEventListener('abort', abort); }
    const file = await this.fs.readStream(path); if (!file?.blob || file.size !== generated.byteLength) return fail('output-close-unverified');
    const inspected = await ReviewArchive.inspect(await file.blob(), this.limits, signal); checkAbort(signal);
    if (inspected.archive.sha256 !== generated.sha256 || json(inspected.archive.control.manifest) !== json(m)) fail('output-readback');
    if (json((await ReviewOutputJob.open(this.fs, this.id, this.limits)).records()) !== json(this.records())) fail('output-input-binding');
    await this.append({ kind: 'artifactVerified', archive: { sha256: generated.sha256, byteLength: generated.byteLength }, location: 'opfsArtifact', sinkId });
  }
  async verifySelected(file: Blob) {
    const { step } = await this.artifact(), observed = await ReviewArchive.inspect(file.slice(), this.limits), expected = (step.detail as Artifact).archive;
    if (observed.archive.sha256 !== expected.sha256 || observed.archive.byteLength !== expected.byteLength) return fail('output-selected-mismatch');
    if (!(await this.steps()).some(s => s.detail.kind === 'externalFileVerified')) await this.append({ kind: 'externalFileVerified', archive: expected, sinkId: newId(), profile: 'reselectedFileV1' });
  }
  async cancel() { if ((await this.steps()).some(s => s.detail.kind !== 'cancelled')) return fail('output-cancel-denied'); await this.append({ kind: 'cancelled', stage: 'beforeArtifact' }); }
}
