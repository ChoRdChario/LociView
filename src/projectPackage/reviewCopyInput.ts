import type { ProjectWorkspaceFS, WorkspaceReadableFile } from '../platform/fs';
import { object, same, string } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import { checkLimits, fail, type MetadataLimits } from '../projectMetadata/format';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { TransactionJournal, type JournalEntry, type JournalStart, type PreparedJournal } from '../projectMetadata/journal';
import { readRequiredCapabilities } from '../projectMetadata/requiredCapabilities';
import { equalBytes, json, newId, readReceiptSnapshot, technicalId, withMetadataRead, writeReceipt } from '../projectMetadata/persistence';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { packageReference as reference } from './cleanInputDescriptor';
import { inspectCleanSource } from './cleanSource';
import type { CleanReconstruction } from './cleanRecords';
import { packageSourceLimits } from './contributionEvidence';
import { prepareReviewEdit } from './reviewSnapshot';
import { ReviewArchive } from './reviewArchive';
import { packageByteHash } from './manifest';
import { workspacePackageRoot } from './workspaceBases';
import type { OutputIntegrityRead } from './outputIntegrityRead';

const root = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}review-copy/${technicalId(id)}/`;
const index = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}review-copy-index/${technicalId(id)}.json`;
const bytesRef = (bytes: Uint8Array): EvidenceRef => ({ sha256: packageByteHash(bytes), byteLength: bytes.length });
const unique = (refs: readonly EvidenceRef[]) => {
  const found = new Map<string, EvidenceRef>();
  for (const ref of refs) {
    if (found.has(ref.sha256) && found.get(ref.sha256)!.byteLength !== ref.byteLength) fail('review-copy-reference');
    found.set(ref.sha256, { sha256: ref.sha256, byteLength: ref.byteLength });
  }
  return [...found.values()].sort((a, b) => a.sha256 < b.sha256 ? -1 : 1);
};
async function control<T>(fs: ProjectWorkspaceFS, path: string, limits: MetadataLimits): Promise<T | null> {
  const file = await fs.readStream(path);
  if (file && (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > L.controlBytes)) fail('review-copy-control-budget');
  return readReceiptSnapshot<T>(file, limits);
}
async function boundedBytes(file: WorkspaceReadableFile | null, expected: EvidenceRef, max: number) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > max || file.size !== expected.byteLength) return fail('review-copy-metadata');
  const bytes = new Uint8Array(file.size), reader = file.stream().getReader(); let at = 0, failed = false, failure: unknown;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      if (!(part.value instanceof Uint8Array) || !part.value.length || part.value.length > bytes.length - at) fail('review-copy-metadata');
      bytes.set(part.value, at); at += part.value.length;
    }
    if (at !== bytes.length || packageByteHash(bytes) !== expected.sha256) fail('review-copy-metadata');
  } catch (error) { failed = true; failure = error; }
  finally {
    try { await reader.cancel(); } catch (error) { if (!failed) { failed = true; failure = error; } }
    try { reader.releaseLock(); } catch (error) { if (!failed) { failed = true; failure = error; } }
  }
  if (failed) throw failure;
  return bytes;
}
type Description = Awaited<ReturnType<typeof inspectCleanSource>>;
export type ReviewCopyDescriptor = ReturnType<PreparedReviewCopy['descriptor']>;
export type ReviewCopyState = { id: string; state: 'incomplete' | 'input-required' | 'unbound-input' | 'repair-required' | 'completed' | 'abandoned' };
function checkDescriptor(value: ReviewCopyDescriptor, limits: MetadataLimits) {
  if (!value || Object.keys(value).sort().join(',') !== 'destination,initialChanges,jobId,metadata,original,recipe,roots,schema,snapshot' ||
    value.schema !== 'lociview-review-copy-1') fail('review-copy-descriptor');
  technicalId(value.jobId);
  const ref = (value: EvidenceRef, max: number) => {
    if (!value || Object.keys(value).sort().join(',') !== 'byteLength,sha256' || typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256) ||
      !Number.isSafeInteger(value.byteLength) || value.byteLength <= 0 || value.byteLength > max) fail('review-copy-reference');
  };
  ref(value.original, L.archiveBytes); ref(value.snapshot, L.snapshotBytes); ref(value.recipe, L.controlBytes); ref(value.metadata, Math.min(limits.maxTotalBytes, L.sourceBytes));
  if (!Array.isArray(value.initialChanges) || value.initialChanges.length !== 2 || !value.roots || Object.keys(value.roots).sort().join(',') !== 'blobs,evidence' ||
    !Array.isArray(value.roots.blobs) || value.roots.blobs.length > L.entryCount || !Array.isArray(value.roots.evidence) || value.roots.evidence.length > 6) fail('review-copy-roots');
  for (const entry of value.initialChanges) ref(entry, limits.maxChangeBytes);
  for (const entry of value.roots.blobs) ref(entry, L.blobBytes);
  for (const entry of value.roots.evidence) ref(entry, L.archiveBytes);
}
const marker = (kind: 'index' | 'start', id: string, prepared: EvidenceRef) => ({ schema: `lociview-review-copy-${kind}-1`, jobId: id, prepared });
const abandonment = (id: string) => ({ schema: 'lociview-review-copy-abandoned-1', jobId: id, stage: 'beforeStart' });

/** Fixed actual metadata and one immutable original; no generated Clean container. */
export class PreparedReviewCopy {
  readonly kind = 'direct-review-copy';
  private readonly recipeText: string;
  private readonly descriptorText: string;
  private constructor(readonly id: string, readonly original: Blob, readonly review: ReviewArchive,
    reconstruction: CleanReconstruction, readonly source: ProjectMetadataSource, readonly description: Description,
    private readonly metadata: Uint8Array) {
    this.recipeText = json(reconstruction);
    const originalRef = { sha256: review.archive.sha256, byteLength: original.size }, snapshot = reference(review.review.snapshot),
      recipe = reference(reconstruction), metadataRef = bytesRef(metadata), initialChanges = source.originalChanges().map(bytesRef);
    this.descriptorText = json({ schema: 'lociview-review-copy-1', jobId: id, original: originalRef, snapshot, recipe, metadata: metadataRef,
      destination: source.proof, initialChanges, roots: { blobs: unique(description.closure.entries),
        evidence: unique([originalRef, snapshot, recipe, metadataRef, ...initialChanges]) } });
    Object.freeze(this);
  }
  get run() { return technicalId(string(this.source.proof.identity.projectId).slice(4)); }
  descriptor(): { schema: 'lociview-review-copy-1'; jobId: string; original: EvidenceRef; snapshot: EvidenceRef; recipe: EvidenceRef; metadata: EvidenceRef;
    destination: ProjectMetadataSource['proof']; initialChanges: EvidenceRef[]; roots: { blobs: EvidenceRef[]; evidence: EvidenceRef[] } } { return JSON.parse(this.descriptorText); }
  reconstruction(): CleanReconstruction { return JSON.parse(this.recipeText); }
  metadataBytes() { return this.metadata.slice(); }
  static async fromInspectedReview(input: ReviewArchive, limits: MetadataLimits) {
    limits = checkLimits(limits);
    const review = await input.reopen(limits), { records, reconstruction, semanticProfile } = await prepareReviewEdit(review.review, limits);
    const source = ProjectMetadataSource.bootstrap(object(records.schema), object(records.identity), packageSourceLimits(limits), { time: 0, semanticProfile }).initialize(records, { time: 0 });
    const description = await inspectCleanSource(source, limits);
    return new PreparedReviewCopy(newId(), review.archive.sourceSnapshot(), review, reconstruction, source, description, source.encodeFullSource());
  }
  /** Cold retry loads the stored actual source; rebuilding records never rebuilds its actor. */
  static async restore(id: string, review: ReviewArchive, descriptor: ReviewCopyDescriptor, recipe: CleanReconstruction, metadata: Uint8Array, limits: MetadataLimits) {
    technicalId(id);
    const owned = metadata.slice(), source = ProjectMetadataSource.fromFullSource(owned, descriptor.destination, packageSourceLimits(limits));
    const plan = await prepareReviewEdit(review.review, limits, recipe), description = await inspectCleanSource(source, limits);
    if (!same(plan.records, description.records) || plan.semanticProfile !== source.semanticProfile) fail('review-copy-reconstruction');
    const result = new PreparedReviewCopy(id, review.archive.sourceSnapshot(), review, plan.reconstruction, source, description, owned);
    if (json(result.descriptor()) !== json(descriptor)) fail('review-copy-binding');
    return result;
  }
}

/** New direct initialization authority. Legacy parent/child jobs remain separate. */
export class ReviewCopyInputJob {
  readonly purpose = 'copyReview' as const;
  private constructor(private readonly fs: ProjectWorkspaceFS, readonly id: string, private readonly limits: MetadataLimits,
    private readonly prepared: PreparedReviewCopy, readonly start: boolean) {}
  assertOwner(fs: ProjectWorkspaceFS) { if (fs !== this.fs) fail('review-copy-owner'); }
  path(name: string) { return `${root(this.fs, this.id)}${name}`; }
  get source() { return this.prepared.source; }
  get blobEntries() { return this.prepared.description.closure.entries; }
  binding() { return reference(this.prepared.descriptor()); }
  bodyBlob(ref: JsonObject) {
    const entry = this.blobEntries.find(e => e.sha256 === ref.digest && e.byteLength === ref.byteLength);
    if (!entry) return fail('review-copy-body');
    return this.prepared.review.archive.entryBlob(entry.path);
  }
  static prepare(fs: ProjectWorkspaceFS, prepared: PreparedReviewCopy, limits: MetadataLimits) {
    return new ReviewCopyInputJob(fs, prepared.id, checkLimits(limits), prepared, false);
  }
  private static async physicalIds(fs: ProjectWorkspaceFS) {
    const base = workspacePackageRoot(fs), prefix = `${base}review-copy/`, ix = `${base}review-copy-index/`, paths = [...await fs.list(prefix), ...await fs.list(ix)];
    if (paths.length > L.entryCount) fail('review-copy-budget');
    const ids = new Set<string>(); let controls = 0;
    for (const path of paths) {
      const indexed = path.startsWith(ix), tail = path.slice((indexed ? ix : prefix).length);
      if (!(indexed ? /^[0-9a-f]{32}\.json$/ : /^[0-9a-f]{32}\/(prepared\.json|recipe\.json|metadata\.am|original\.zip|start\.json|published\.json|abandoned\.json)$/).test(tail)) fail('review-copy-path');
      ids.add(technicalId(tail.slice(0, 32)));
      const file = await fs.readStream(path);
      if (!file || !Number.isSafeInteger(file.size) || file.size < 0) fail('review-copy-size');
      const max = path.endsWith('/original.zip') ? L.archiveBytes : path.endsWith('/metadata.am') ? L.sourceBytes : L.controlBytes;
      if (file!.size > max || (!path.endsWith('/original.zip') && (controls += file!.size) > L.controlsBytes + L.sourceBytes)) fail('review-copy-budget');
    }
    return ids;
  }
  static async ids(fs: ProjectWorkspaceFS, limits: MetadataLimits, entries?: readonly JournalEntry[]) {
    const ids = await this.physicalIds(fs), observed = entries ?? await new TransactionJournal(fs, limits).entries();
    for (const entry of observed) if (entry.start.purpose === 'copyReview') ids.add(entry.start.transactionId);
    await this.checkKinds(fs, ids, observed);
    return [...ids];
  }
  private static async checkKinds(fs: ProjectWorkspaceFS, ids: ReadonlySet<string>, observed: readonly JournalEntry[]) {
    for (const entry of observed) if (ids.has(entry.start.transactionId) && entry.start.purpose !== 'copyReview') fail('review-copy-kind-collision');
    if (ids.size) {
      const base = workspacePackageRoot(fs);
      for (const namespace of ['review-edit', 'review-edit-index', 'receive', 'contribution-receive', 'contribution-index', 'clean-input', 'clean-input-index',
        'scene-append', 'output', 'backup-output', 'backup-output-index', 'contribution-output', 'contribution-output-index', 'clean-output', 'clean-output-index', 'review-output', 'review-output-index']) {
        const prefix = `${base}${namespace}/`;
        for (const path of await fs.list(prefix)) if (ids.has(path.slice(prefix.length, prefix.length + 32))) fail('review-copy-kind-collision');
      }
    }
  }
  static async open(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits, integrity?: OutputIntegrityRead) {
    limits = checkLimits(limits); technicalId(id);
    if (!(await this.ids(fs, limits)).includes(id)) return fail('review-copy-missing');
    return this.openKnown(fs, id, limits, undefined, integrity);
  }
  private static async openKnown(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits, replacement?: Blob, integrity?: OutputIntegrityRead) {
    const path = root(fs, id), descriptor = await control<ReviewCopyDescriptor>(fs, `${path}prepared.json`, limits);
    if (!descriptor || descriptor.jobId !== id || descriptor.schema !== 'lociview-review-copy-1') return fail('review-copy-missing');
    checkDescriptor(descriptor, limits);
    const binding = reference(descriptor), start = await control(fs, `${path}start.json`, limits), abandoned = await control(fs, `${path}abandoned.json`, limits);
    if (abandoned || start && json(start) !== json(marker('start', id, binding))) fail('review-copy-state');
    if (json(await control(fs, index(fs, id), limits)) !== json(marker('index', id, binding))) fail('review-copy-index');
    if (replacement && start) fail('review-copy-reselect-denied');
    const recipe = await control<CleanReconstruction>(fs, `${path}recipe.json`, limits);
    if (!recipe || json(reference(recipe)) !== json(descriptor.recipe)) return fail('review-copy-recipe');
    const metadata = await boundedBytes(await fs.readStream(`${path}metadata.am`), descriptor.metadata, Math.min(limits.maxTotalBytes, L.sourceBytes));
    let review: ReviewArchive;
    if (replacement) {
      if (await fs.exists(`${path}original.zip`)) fail('review-copy-reselect-denied');
      review = await ReviewArchive.inspect(replacement.slice(), limits);
    } else if (integrity) {
      const archive = await integrity.archive(fs, `${path}original.zip`, descriptor.original, { descriptor, start }, limits);
      review = await ReviewArchive.fromSelectedArchive(archive, limits);
    } else {
      const file = await fs.readStream(`${path}original.zip`);
      if (!file?.blob || file.size !== descriptor.original.byteLength || file.size > L.archiveBytes) return fail('review-copy-original');
      const blob = await file.blob(); if (blob.size !== file.size) fail('review-copy-original');
      review = await ReviewArchive.inspect(blob, limits);
    }
    const prepared = await PreparedReviewCopy.restore(id, review, descriptor, recipe, metadata, limits);
    return new ReviewCopyInputJob(fs, id, limits, prepared, !!start);
  }
  async inventory() { return this.prepared.description.closure.semanticRefs.map(ref => ({ ...ref })); }
  async persist(additionalBytes: number) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    if (this.start) return fail('review-copy-started');
    const descriptor = this.prepared.descriptor(), binding = reference(descriptor);
    if (await this.fs.exists(this.path('start.json')) || await this.fs.exists(this.path('abandoned.json')) ||
      (await new TransactionJournal(this.fs, this.limits).entries()).length) fail('review-copy-existing-authority');
    const other = await ReviewCopyInputJob.ids(this.fs, this.limits);
    await ReviewCopyInputJob.checkKinds(this.fs, new Set([...other, this.id]), await new TransactionJournal(this.fs, this.limits).entries());
    if (other.some(id => id !== this.id)) fail('review-copy-existing-authority');
    for (const value of [descriptor, this.prepared.reconstruction(), marker('index', this.id, binding), marker('start', this.id, binding)])
      if (reference(value).byteLength > L.controlBytes) fail('review-copy-control-budget');
    let bytes = 0; const paths = await this.fs.list(workspacePackageRoot(this.fs));
    if (paths.length > L.entryCount) fail('review-copy-budget');
    for (const path of paths) { const file = await this.fs.readStream(path); if (!file || !Number.isSafeInteger(file.size) || file.size < 0) return fail('review-copy-size'); bytes += file.size; }
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0 || !Number.isSafeInteger(bytes) ||
      bytes + this.prepared.original.size + descriptor.metadata.byteLength + additionalBytes + 8 * L.controlBytes > 2_147_483_648 - 16_777_216) fail('review-copy-budget');
    await writeReceipt(this.fs, this.path('prepared.json'), descriptor, this.limits);
    await writeReceipt(this.fs, index(this.fs, this.id), marker('index', this.id, binding), this.limits);
    await writeReceipt(this.fs, this.path('recipe.json'), this.prepared.reconstruction(), this.limits);
    if (!await this.fs.exists(this.path('metadata.am'))) await this.fs.writeBytes(this.path('metadata.am'), this.prepared.metadataBytes());
    if (!await this.fs.exists(this.path('original.zip'))) await this.fs.writeStream(this.path('original.zip'), this.prepared.original.stream());
    await ReviewCopyInputJob.open(this.fs, this.id, this.limits);
    await writeReceipt(this.fs, this.path('start.json'), marker('start', this.id, binding), this.limits);
    return ReviewCopyInputJob.open(this.fs, this.id, this.limits);
  }
  static async validateJournalFresh(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits, prepared: PreparedJournal, integrity?: OutputIntegrityRead, observedJournal?: readonly JournalEntry[]) {
    if (observedJournal) {
      limits = checkLimits(limits); technicalId(id);
      if (!integrity) return fail('output-journal-owner');
      integrity.assertOwner(fs, limits);
      if (!(await this.ids(fs, limits, observedJournal)).includes(id)) return fail('review-copy-missing');
      const job = await this.openKnown(fs, id, limits, undefined, integrity), source = await job.validateOpenedJournal(prepared);
      integrity.assertOwner(fs, limits); return source;
    }
    const job = await this.open(fs, id, limits, integrity);
    return job.validateOpenedJournal(prepared);
  }
  async validateJournal(prepared: PreparedJournal) { return ReviewCopyInputJob.validateJournalFresh(this.fs, this.id, this.limits, prepared); }
  assertJournalStart(start: JournalStart) {
    const source = this.source;
    if (!this.start || start.purpose !== 'copyReview' || start.transactionId !== this.id || start.repositoryId !== this.id || start.predecessor !== null || start.baseHeads.length ||
      json(start.reviewCopy) !== json(this.binding()) || json(start.proof) !== json(source.proof) ||
      json(readRequiredCapabilities(start.requiredCapabilities)) !== json(source.requiredCapabilities)) fail('review-copy-journal');
  }
  private async validateOpenedJournal(prepared: PreparedJournal) {
    const source = this.source; this.assertJournalStart(prepared.start);
    if (prepared.remote) fail('review-copy-journal');
    const parts = await new TransactionJournal(this.fs, this.limits).validateParts(prepared), originals = source.originalChanges();
    if (parts.length !== originals.length || parts.some((part, i) => !equalBytes(part, originals[i]!))) fail('review-copy-parts');
    return source;
  }
  private publicationRecord(entry: JournalEntry) {
    if (!entry.prepared || !entry.publication || json(entry.publication.heads) !== json(this.source.heads)) return fail('review-copy-unpublished');
    return { schema: 'lociview-review-copy-published-1', jobId: this.id, start: reference(marker('start', this.id, this.binding())),
      journal: reference(entry.prepared), publication: reference(entry.publication) };
  }
  async complete() {
    const entry = (await new TransactionJournal(this.fs, this.limits).entries()).find(e => e.start.transactionId === this.id);
    if (!entry?.prepared) return fail('review-copy-unpublished');
    await this.validateJournal(entry.prepared);
    await writeReceipt(this.fs, this.path('published.json'), this.publicationRecord(entry), this.limits);
  }
  static async states(fs: ProjectWorkspaceFS, limits: MetadataLimits, integrity?: OutputIntegrityRead): Promise<ReviewCopyState[]> {
    return this.readStates(fs, limits, integrity);
  }
  private static async readStates(fs: ProjectWorkspaceFS, limits: MetadataLimits, integrity?: OutputIntegrityRead, observedJournal?: readonly JournalEntry[]): Promise<ReviewCopyState[]> {
    limits = checkLimits(limits);
    if (observedJournal) { if (!integrity) return fail('output-journal-owner'); integrity.assertOwner(fs, limits); }
    const inspect = async (fs: ProjectWorkspaceFS, scoped?: OutputIntegrityRead) => {
      if (observedJournal) scoped!.assertOwner(fs, limits);
      const entries = observedJournal ?? await new TransactionJournal(fs, limits).entries(), ids = await this.ids(fs, limits, entries), states: ReviewCopyState[] = [];
      for (const id of ids) {
        const path = root(fs, id), entry = entries.find(e => e.start.transactionId === id);
        let unacknowledged = false;
        try {
          const abandoned = await control(fs, `${path}abandoned.json`, limits), started = await control(fs, `${path}start.json`, limits), published = await control(fs, `${path}published.json`, limits);
          if (abandoned) {
            if (started || published || entry || json(abandoned) !== json(abandonment(id))) fail('review-copy-state');
            states.push({ id, state: 'abandoned' }); continue;
          }
          if (!started && (entry || published)) fail('review-copy-state');
          unacknowledged = !started && !entry && !published;
          if (!started && !await fs.exists(`${path}original.zip`)) {
            const descriptor = await control<ReviewCopyDescriptor>(fs, `${path}prepared.json`, limits), recipe = await control(fs, `${path}recipe.json`, limits);
            if (!descriptor || descriptor.jobId !== id || descriptor.schema !== 'lociview-review-copy-1' || !recipe ||
              json(await control(fs, index(fs, id), limits)) !== json(marker('index', id, reference(descriptor))) || json(reference(recipe)) !== json(descriptor.recipe)) fail('review-copy-incomplete');
            checkDescriptor(descriptor!, limits);
            await boundedBytes(await fs.readStream(`${path}metadata.am`), descriptor!.metadata, Math.min(limits.maxTotalBytes, L.sourceBytes));
            states.push({ id, state: 'input-required' }); continue;
          }
          const job = await this.openKnown(fs, id, limits, undefined, scoped);
          if (entry) job.assertJournalStart(entry.start);
          if (entry?.prepared) await job.validateOpenedJournal(entry.prepared);
          if (published) {
            if (!entry?.prepared) fail('review-copy-unpublished');
            if (json(published) !== json(job.publicationRecord(entry!))) fail('review-copy-completion');
            states.push({ id, state: 'completed' });
          } else states.push({ id, state: 'incomplete' });
        } catch { states.push({ id, state: unacknowledged ? 'unbound-input' : 'repair-required' }); }
      }
      if (observedJournal) scoped!.assertOwner(fs, limits);
      return states;
    };
    if (integrity) { let result: ReviewCopyState[] = []; await integrity.withMetadataRead(fs, limits, async (fs, scope) => { result = await inspect(fs, scope); }); return result; }
    return withMetadataRead(fs, undefined, ({ fs }) => inspect(fs));
  }
  static async assertSlot(fs: ProjectWorkspaceFS, limits: MetadataLimits, ownId?: string, integrity?: OutputIntegrityRead, observedJournal?: readonly JournalEntry[]) {
    for (const state of await this.readStates(fs, limits, integrity, observedJournal)) {
      if (state.state === 'completed' || state.state === 'abandoned') continue;
      if (state.id !== ownId || !['incomplete', 'input-required'].includes(state.state)) fail('review-copy-pending');
    }
  }
  /** Existing selected text-commit scope only; strict open/recovery/output recheck all payloads. */
  static async assertTextSlot(fs: ProjectWorkspaceFS, limits: MetadataLimits, admitted: readonly JournalEntry[]) {
    for (const id of await this.ids(fs, limits, admitted)) {
      const path = root(fs, id), entry = admitted.find(e => e.start.transactionId === id);
      const abandoned = await control(fs, `${path}abandoned.json`, limits), start = await control(fs, `${path}start.json`, limits), published = await control(fs, `${path}published.json`, limits);
      if (abandoned && !entry && !start && !published && json(abandoned) === json(abandonment(id))) continue;
      const descriptor = await control<ReviewCopyDescriptor>(fs, `${path}prepared.json`, limits);
      if (!descriptor) return fail('review-copy-pending');
      checkDescriptor(descriptor, limits);
      const binding = reference(descriptor);
      if (abandoned || descriptor.jobId !== id || !entry?.prepared || !entry.publication || entry.start.purpose !== 'copyReview' ||
        entry.start.repositoryId !== id || entry.start.predecessor !== null || entry.start.baseHeads.length ||
        json(entry.start.proof) !== json(descriptor.destination) || json(entry.start.reviewCopy) !== json(binding) ||
        json(start) !== json(marker('start', id, binding)) || json(await control(fs, index(fs, id), limits)) !== json(marker('index', id, binding)) ||
        json(entry.prepared.changes.map(p => ({ sha256: p.bytesSha256, byteLength: p.byteLength }))) !== json(descriptor.initialChanges) ||
        json(published) !== json({ schema: 'lociview-review-copy-published-1', jobId: id, start: reference(marker('start', id, binding)),
          journal: reference(entry.prepared), publication: reference(entry.publication) })) fail('review-copy-pending');
    }
  }
  static async retry(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    if (!(await this.ids(fs, limits)).includes(technicalId(id))) return fail('review-copy-missing');
    const state = (await this.states(fs, limits)).find(row => row.id === id);
    if (!state || !['incomplete', 'completed'].includes(state.state)) return fail('review-copy-retry-denied');
    return this.open(fs, id, limits);
  }
  static async reselect(fs: ProjectWorkspaceFS, id: string, file: Blob, limits: MetadataLimits) {
    const state = (await this.states(fs, limits)).find(row => row.id === technicalId(id));
    if (state?.state !== 'input-required') return fail('review-copy-reselect-denied');
    return this.openKnown(fs, id, checkLimits(limits), file);
  }
  static async abandon(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
    const state = (await this.states(fs, limits)).find(row => row.id === technicalId(id));
    if (!state || !['input-required', 'unbound-input', 'abandoned'].includes(state.state) || await fs.exists(`${root(fs, id)}start.json`) ||
      (await new TransactionJournal(fs, limits).entries()).some(e => e.start.transactionId === id)) fail('review-copy-abandon-denied');
    await writeReceipt(fs, `${root(fs, id)}abandoned.json`, abandonment(id), limits);
  }
}
