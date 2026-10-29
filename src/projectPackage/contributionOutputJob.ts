import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkEditorCapability } from '../projectMetadata/editorAttribution';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { json, newId, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { packageByteHash, readManifestControl } from './manifest';
import { ContributionArchive, ContributionSourceCapture, VerifiedContributionBase } from './contributionSource';
import { contributionDelta, describeContributionTarget, packageSourceLimits } from './contributionEvidence';
import { prepareContributionManifest, writeContributionArchive } from './contributionArchive';
import { workspacePackageRoot, encodePackageValue, evidenceReference, type WorkspaceBaseRecord } from './workspaceBases';
import type { protectedWorkspaceInventory } from './protectedInventory';

const ref = evidenceReference, encode = encodePackageValue, reference = (v: unknown) => ref(encode(v));
const root = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}contribution-output/${technicalId(id)}/`;
const indexPath = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}contribution-output-index/${technicalId(id)}.json`;
const unique = (refs: EvidenceRef[]) => [...new Map(refs.map(r => [r.sha256, r])).values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
type Inventory = ReturnType<typeof protectedWorkspaceInventory>;
interface Inputs { metadata: Uint8Array; manifest: Uint8Array; inventory: Inventory; bases: { records: WorkspaceBaseRecord[] } }
type Artifact = { kind: 'artifactVerified'; archive: EvidenceRef; location: 'opfsArtifact'; sinkId: string };
type Detail = Artifact | { kind: 'externalFileVerified'; archive: EvidenceRef; sinkId: string; profile: 'reselectedFileV1' } |
  { kind: 'cancelled'; stage: 'beforeArtifact' };
interface Step { schema: 'lociview-package-job-step-1'; jobId: string; start: EvidenceRef; previous: EvidenceRef | null; detail: Detail }
const checkRef = (r: EvidenceRef) => {
  if (!r || Object.keys(r).sort().join(',') !== 'byteLength,sha256' || typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256) ||
    !Number.isSafeInteger(r.byteLength) || r.byteLength <= 0 || r.byteLength > L.archiveBytes) fail('output-reference');
};

/** Frozen delta output. No generated-base observation or current-source substitution. */
export class ContributionOutputJob {
  readonly source: ProjectMetadataSource;
  private constructor(private readonly fs: ProjectWorkspaceFS, readonly id: string, private readonly limits: MetadataLimits,
    private readonly inputs: Inputs, readonly base: VerifiedContributionBase) {
    technicalId(id); const m = this.manifest();
    this.source = ProjectMetadataSource.fromFullSource(inputs.metadata, { identity: m.identity, envelope: m.metadataEnvelope }, packageSourceLimits(limits));
    checkEditorCapability(m.requiredCapabilities, base.source.includesDeclaredEditorNames || this.source.includesDeclaredEditorNames);
    if (json(this.source.heads) !== json(m.targetHeads) || json(base.selection) !== json(m.base)) fail('output-source');
  }
  assertOwner(fs: ProjectWorkspaceFS) { if (fs !== this.fs) fail('output-owner'); }
  path(name: string) { return `${root(this.fs, this.id)}${name}`; }
  manifest() {
    const m = readManifestControl(this.inputs.manifest, new TextEncoder().encode(packageByteHash(this.inputs.manifest))).manifest;
    if (m.purpose !== 'contribution') return fail('output-purpose'); return m;
  }
  private records() {
    const m = this.manifest(), capture = { schema: 'lociview-package-capture-1',
      source: { identity: m.identity, metadataEnvelope: m.metadataEnvelope, heads: m.targetHeads }, sourceMetadata: ref(this.inputs.metadata),
      purpose: 'contribution', scope: { kind: 'wholeProject' }, protectedInventory: reference(this.inputs.inventory),
      exchangeBases: reference(this.inputs.bases), base: this.base.proof() };
    const prepared = { schema: 'lociview-package-output-1', capture: reference(capture), packageId: m.packageId,
      manifest: ref(this.inputs.manifest), payloads: [...m.changes.map(c => ({ path: `changes/${String(c.ordinal).padStart(8, '0')}.amchange`,
        sha256: c.bytesSha256, byteLength: c.byteLength })), ...m.blobs], roots: {
        blobs: this.inputs.inventory.blobs.map(b => ({ sha256: b.sha256, byteLength: b.byteLength })),
        evidence: unique([ref(this.inputs.metadata), ref(this.inputs.manifest), reference(capture), reference(this.inputs.inventory), reference(this.inputs.bases),
          ref(this.base.manifestBytes()), ref(this.base.metadataBytes()), ...this.inputs.bases.records.flatMap(b => [b.evidence.manifest, b.evidence.metadata])]) } };
    const start = { schema: 'lociview-package-job-start-1', jobId: this.id, operation: 'send', prepared: reference(prepared) };
    return { capture, prepared, start };
  }
  private index() { return { schema: 'lociview-contribution-output-index-1', jobId: this.id, prepared: reference(this.records().prepared) }; }
  static prepare(fs: ProjectWorkspaceFS, capture: ContributionSourceCapture, inventory: Inventory, bases: Inputs['bases'], limits: MetadataLimits, version: string) {
    const { manifest } = prepareContributionManifest(capture, { packageId: `pkg_${newId()}`, createdByVersion: version });
    return new ContributionOutputJob(fs, newId(), limits, { metadata: capture.metadataBytes(), manifest,
      inventory: structuredClone(inventory), bases: structuredClone(bases) }, capture.base);
  }
  static async ids(fs: ProjectWorkspaceFS) {
    const prefix = `${workspacePackageRoot(fs)}contribution-output/`, ix = `${workspacePackageRoot(fs)}contribution-output-index/`;
    const paths = [...await fs.list(prefix), ...await fs.list(ix)]; if (paths.length > L.entryCount) return fail('output-job-budget');
    const ids = new Set<string>(); let controls = 0;
    for (const path of paths) {
      const indexed = path.startsWith(ix), tail = path.slice((indexed ? ix : prefix).length);
      if (!(indexed ? /^[0-9a-f]{32}\.json$/ : /^[0-9a-f]{32}\/(metadata\.am|manifest\.json|base-manifest\.json|base-metadata\.am|inventory\.json|bases\.json|capture\.json|prepared\.json|start\.json|abandoned\.json|steps\/[0-9a-f]{64}\.json|artifacts\/[0-9a-f]{32}\.zip)$/).test(tail)) fail('output-path');
      ids.add(tail.slice(0, 32)); const f = await fs.readStream(path);
      if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('output-input-missing');
      if (path.endsWith('.zip')) { if (f.size > L.archiveBytes) fail('output-space-budget'); }
      else if (path.endsWith('.am')) { if (f.size > L.sourceBytes) fail('output-space-budget'); }
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
      if (!prepared || json(ix) !== json({ schema: 'lociview-contribution-output-index-1', jobId: id, prepared: reference(prepared) })) fail('output-index');
    }
    if (start) { if (abandoned || !ix) return fail('output-state'); return 'started' as const; }
    if ((await fs.list(`${path}steps/`)).length) return fail('output-state');
    if (abandoned) {
      if (json(await readReceipt(fs, `${path}abandoned.json`, limits)) !== json(this.abandonment(id))) fail('output-state');
      return 'abandoned' as const;
    }
    return 'unstarted' as const;
  }
  private static abandonment(id: string) { return { schema: 'lociview-contribution-output-abandoned-1', jobId: id, stage: 'beforeStart' }; }
  static async abandon(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if (await this.state(fs, id, limits) === 'started') return fail('output-abandon-denied');
    await writeReceipt(fs, `${root(fs, id)}abandoned.json`, this.abandonment(id), limits);
  }
  static async open(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (await this.state(fs, id, limits) !== 'started') return fail('output-unstarted');
    const path = root(fs, id), bytes = async (name: string, max: number) => {
      const f = await fs.readStream(`${path}${name}`); if (!f || f.size > max) return fail('output-input-missing');
      const b = await fs.readBytes(`${path}${name}`); if (!b || b.length !== f.size) return fail('output-input-missing'); return b;
    };
    const metadata = await bytes('metadata.am', L.sourceBytes), manifest = await bytes('manifest.json', L.controlBytes);
    const m = readManifestControl(manifest, new TextEncoder().encode(packageByteHash(manifest))).manifest;
    if (m.purpose !== 'contribution') return fail('output-purpose');
    const bm = await bytes('base-manifest.json', L.controlBytes), bd = await bytes('base-metadata.am', L.sourceBytes);
    const base = await VerifiedContributionBase.fromFrozenEvidence({ identity: m.identity, metadataEnvelope: m.metadataEnvelope,
      workspacePackageId: m.base.workspacePackageId, workspaceManifestSha256: m.base.workspaceManifestSha256, declaredHeads: m.base.heads,
      evidence: { manifest: ref(bm), metadata: ref(bd) } }, bm, bd, limits);
    const inventory = await readReceipt<Inventory>(fs, `${path}inventory.json`, limits), bases = await readReceipt<Inputs['bases']>(fs, `${path}bases.json`, limits);
    if (!inventory || !bases || Object.keys(bases).join(',') !== 'records' || !Array.isArray(bases.records) || bases.records.length > 16 ||
      Object.keys(inventory).sort().join(',') !== 'blobs,schema' || inventory.schema !== 'lociview-protected-inventory-1' || !Array.isArray(inventory.blobs) || inventory.blobs.length > L.blobCount) return fail('output-input');
    const job = new ContributionOutputJob(fs, id, limits, { metadata, manifest, inventory, bases }, base);
    for (const [name, value] of Object.entries(job.records())) if (json(await readReceipt(fs, `${path}${name}.json`, limits)) !== json(value)) fail('output-input-binding');
    const delta = contributionDelta(base.source, job.source, packageSourceLimits(limits));
    const description = await describeContributionTarget(base, job.source, delta.changes);
    if (json(delta.changes) !== json(m.changes) || json(description.blobs) !== json(m.blobs) || json(description.summary) !== json(m.summary)) fail('output-source');
    await job.steps(); return job;
  }
  frozenBases() { return structuredClone(this.inputs.bases); }
  frozenInventory() { return structuredClone(this.inputs.inventory); }
  async persist() {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if ((await this.fs.list(this.path(''))).length || await this.fs.exists(indexPath(this.fs, this.id))) fail('output-exists');
    await this.space(this.inputs.metadata.length + this.inputs.manifest.length + this.base.manifestBytes().length + this.base.metadataBytes().length + encode(this.inputs.inventory).length + encode(this.inputs.bases).length);
    for (const [name, bytes] of [['metadata.am', this.inputs.metadata], ['manifest.json', this.inputs.manifest],
      ['base-manifest.json', this.base.manifestBytes()], ['base-metadata.am', this.base.metadataBytes()]] as const) {
      await this.fs.writeBytes(this.path(name), bytes);
      const stored = await this.fs.readBytes(this.path(name)); if (!stored || json(ref(stored)) !== json(ref(bytes))) fail('output-input-readback');
    }
    const { capture, prepared, start } = this.records();
    for (const [name, value] of [['inventory', this.inputs.inventory], ['bases', this.inputs.bases], ['capture', capture], ['prepared', prepared]] as const)
      await writeReceipt(this.fs, this.path(`${name}.json`), value, this.limits);
    await writeReceipt(this.fs, indexPath(this.fs, this.id), this.index(), this.limits);
    await writeReceipt(this.fs, this.path('start.json'), start, this.limits);
    return ContributionOutputJob.open(this.fs, this.id, this.limits);
  }
  private async space(additional: number) {
    const paths = await this.fs.list(workspacePackageRoot(this.fs)); if (paths.length > L.entryCount) return fail('output-space-budget');
    let total = additional + L.baseEvidenceBytes;
    for (const path of paths) {
      const f = await this.fs.readStream(path); if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('output-space-read');
      total += f.size; if (total > 2_147_483_648 - 16_777_216) fail('output-space-budget');
    }
  }
  async steps(): Promise<Step[]> {
    const paths = await this.fs.list(this.path('steps/')); if (paths.length > 2) return fail('output-step-budget');
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
  async artifact(store: Pick<OriginBlobStore, 'inspect'>) {
    const { file, step, detail: d } = await this.artifactReceipt();
    const blob = await file.blob!(), inspected = await ContributionArchive.inspect(blob, this.base, store, this.limits);
    if (json({ sha256: inspected.archive.sha256, byteLength: inspected.archive.byteLength }) !== json(d.archive) ||
      json(inspected.archive.control.manifest) !== json(this.manifest())) fail('output-artifact-mismatch');
    return { blob, step };
  }
  async validateCompletion() { if ((await this.steps()).some(s => s.detail.kind === 'artifactVerified')) await this.artifactReceipt(); }
  async generate(store: OriginBlobStore, signal?: AbortSignal) {
    if ((await this.steps()).some(s => s.detail.kind === 'artifactVerified')) { await this.artifact(store); return; }
    if ((await this.steps()).length) return fail('output-cancelled');
    const capture = await ContributionSourceCapture.restore(this.inputs.metadata, this.source.proof, this.source.token, this.base, store, this.limits, signal);
    const m = this.manifest(), options = { packageId: m.packageId, createdByVersion: m.createdByVersion, ...(m.memo !== undefined ? { memo: m.memo } : {}) };
    const prepared = prepareContributionManifest(capture, options);
    if (json(ref(prepared.manifest)) !== json(ref(this.inputs.manifest))) return fail('output-prepared-mismatch');
    await this.space(prepared.control.archiveByteLength);
    const sinkId = newId(), path = this.path(`artifacts/${sinkId}.zip`); if (await this.fs.exists(path)) return fail('output-sink-exists');
    const bridge = new TransformStream<Uint8Array, Uint8Array>(), cancel = new AbortController(), abort = () => cancel.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    const writing = this.fs.writeStream(path, bridge.readable); void writing.catch(e => cancel.abort(e));
    const generating = writeContributionArchive(capture, store, bridge.writable, { ...options, signal: cancel.signal });
    let generated: Awaited<typeof generating>;
    try { [, generated] = await Promise.all([writing, generating]); }
    catch (error) { cancel.abort(error); await Promise.allSettled([writing, generating]); throw error; }
    finally { signal?.removeEventListener('abort', abort); }
    const file = await this.fs.readStream(path); if (!file?.blob || file.size !== generated.byteLength) return fail('output-close-unverified');
    const inspected = await ContributionArchive.inspect(await file.blob(), this.base, store, this.limits, signal);
    if (inspected.archive.sha256 !== generated.sha256 || inspected.archive.byteLength !== generated.byteLength || json(inspected.archive.control.manifest) !== json(m)) return fail('output-readback');
    await this.append({ kind: 'artifactVerified', archive: { sha256: generated.sha256, byteLength: generated.byteLength }, location: 'opfsArtifact', sinkId });
  }
  async verifySelected(file: Blob, store: Pick<OriginBlobStore, 'inspect'>) {
    const { step } = await this.artifact(store), observed = await ContributionArchive.inspect(file.slice(), this.base, store, this.limits), expected = (step.detail as Artifact).archive;
    if (observed.archive.sha256 !== expected.sha256 || observed.archive.byteLength !== expected.byteLength) return fail('output-selected-mismatch');
    if (!(await this.steps()).some(s => s.detail.kind === 'externalFileVerified'))
      await this.append({ kind: 'externalFileVerified', archive: expected, sinkId: newId(), profile: 'reselectedFileV1' });
  }
  async cancel() { if ((await this.steps()).some(s => s.detail.kind !== 'cancelled')) return fail('output-cancel-denied'); await this.append({ kind: 'cancelled', stage: 'beforeArtifact' }); }
}
