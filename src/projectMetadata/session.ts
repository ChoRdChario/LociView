import { issuePointAnchorProof } from './pointAnchorProof';
import { recordBlobRefs } from '../domain/portableMedia';
import { captureEditor, type LocalEditorContext } from './editorAttribution';
import { capabilityFields, capabilityUnion, readRequiredCapabilities, checkRequiredCapabilities, EDITOR_CAPABILITY, PORTABLE_MEDIA_CAPABILITY, hasPortableMediaCapability, type ReaderCapabilities } from './requiredCapabilities';
import { reactivatedCaptionMedia } from './captionReactivation';
import type { Anchor } from '../scene/types';
import * as A from '@automerge/automerge/slim';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { ProjectContentVerifier } from '../domain/projectContentChecks';
import { normalizeCaptionText } from '../domain/captionText';
import { readProjectScene, type ProjectProviderRead } from '../scene/projectProvider';
import { checkLimits, fail, type MetadataLimits } from './format';
import { ProjectMetadataSource } from './source';
import { MetadataRepository, type MetadataStorageFactory } from './repository';
import { TransactionJournal, type JournalStart, type PreparedJournal } from './journal';
import { digest, equalBytes, json, newId, underWriteLease, metadataPath } from './persistence';
import { canonicalMetadataEdit, planMetadataEdit, type MetadataEdit } from './commands';
import { checkRemoteStored, copyFullSource, initialWorkspaceChanges, planRemoteChanges, type FullMetadataSource, type RemoteBatchProof } from './remote';
import { WorkspaceReceiveJob, type ReceiverProof } from '../projectPackage/receiveJob';
import { isContributionRemote, type JournalRemoteInput } from './packageRemote';
import { ContributionReceiveJob } from '../projectPackage/contributionReceiveJob';
import { assertContributionBaseInReceiver } from '../projectPackage/contributionEvidence';
import { receiveJobKeys, receiveInputState, openReceiveJob, receiveTerminal, type ReceiveJob } from '../projectPackage/receiveJobs';
import { packageByteHash } from '../projectPackage/manifest';
import type { OriginBlobStore } from './blobStore';
import { WorkspaceOutputJob } from '../projectPackage/outputJob';
import { ContributionOutputJob } from '../projectPackage/contributionOutputJob';
import { BackupOutputJob, checkedBackupLabel, measureBackupOutput, type BackupOutputTiming } from '../projectPackage/backupOutputJob';
import { BackupSourceCapture } from '../projectPackage/backupSource';
import { CleanOutputJob } from '../projectPackage/cleanOutputJob';
import { CleanInputJob } from '../projectPackage/cleanInputJob';
import { assertReviewEditSlot } from '../projectPackage/reviewEditControls';
import { CleanSourceCapture, cleanProtectedInventory } from '../projectPackage/cleanSource';
import { selectCleanRecords } from '../projectPackage/cleanRecords';
import { ReviewOutputJob } from '../projectPackage/reviewOutputJob';
import { ReviewSourceCapture } from '../projectPackage/reviewSource';
import { prepareReviewSnapshot, type ReviewSelectionOptions } from '../projectPackage/reviewSelection';
import { ContributionSourceCapture, VerifiedContributionBase, type ContributionBaseSelection } from '../projectPackage/contributionSource';
import { outputJobKeys, outputJobClass, openOutputJob, outputTerminal, validateOutputProtection } from '../projectPackage/outputJobs';
import { WorkspaceBaseStore } from '../projectPackage/workspaceBases';
import { WorkspaceSourceCapture } from '../projectPackage/workspaceSource';
import { protectedWorkspaceInventory } from '../projectPackage/protectedInventory';
import { PACKAGE_LIMITS } from '../projectPackage/contract';
import type { BackupRestoreJob } from '../projectPackage/backupRestoreJob';

/** Owned finite content boundary. Stage may introduce bytes; recovery may only verify saved bytes. */
export interface MetadataMediaPort {
  /** Route admission before retaining/staging a new media command; no writes. */
  assertIntroduction?(provider: Extract<ProjectProviderRead,{kind:'scene-provider'}>,record:JsonObject):void;
  stage(record: JsonObject, token: string): Promise<void>;
  verify(blobs: readonly JsonObject[], mediaRecords?: readonly JsonObject[]): Promise<void>;
  inventory?(blobs: readonly JsonObject[]): Promise<void>;
  /** Owned evidence/presence witness; never accepts an incoming verified bit. */
  retained?(record: JsonObject): Promise<boolean>;
}
export interface MetadataModelFactPlan { readonly baseToken: string | null; readonly finalToken: string; readonly stagedBlobs?: readonly JsonObject[]; stage(): Promise<void> }
export interface MetadataModelFactPort { preparePointAnchor?(source: ProjectMetadataSource, provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, command: Extract<MetadataEdit, { kind: 'addPin' | 'movePin' }>): Promise<Anchor>;
  /** Route-owned read-only admission at existing planning/read/recovery fences. */
  assertProvider?(provider: Extract<ProjectProviderRead, {kind:'scene-provider'}>): void;
  plan(base: ProjectMetadataSource, next: ProjectMetadataSource): Promise<MetadataModelFactPlan | null>;
  planRestored?(next: ProjectMetadataSource, bodyFor: (ref: JsonObject) => Blob, refs: readonly JsonObject[]): Promise<MetadataModelFactPlan>;
  planImported?(next: ProjectMetadataSource, bodyFor: (ref: JsonObject) => Blob, hasIncoming?: (ref: JsonObject) => boolean): Promise<MetadataModelFactPlan>;
  planReceived?(base: ProjectMetadataSource, next: ProjectMetadataSource, bodyFor: (ref: JsonObject) => Blob, hasIncoming?: (ref: JsonObject) => boolean): Promise<MetadataModelFactPlan> }

export type MetadataSessionRead = Readonly<{
  state: 'empty' | 'ready' | 'pending' | 'repair-required';
  source: ProjectMetadataSource | null;
  provider: ProjectProviderRead | null;
  /** Internal technical receipt, never an end-user label. */
  publication: string | null;
}>;

function weakContent(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, limits: MetadataLimits) {
  const candidates = provider.inspection.candidates, active = new Set(candidates.knownActiveRoots), queue = [...active];
  const outgoing = new Map<string, string[]>(); let work = provider.inspection.workUsed;
  const charge = () => { if (++work > limits.maxWork) fail('provider-readiness-limit'); };
  for (const edge of candidates.knownReferences) {
    charge(); if (edge.strength !== 'strong') continue;
    const targets = outgoing.get(edge.from) ?? []; targets.push(edge.to); outgoing.set(edge.from, targets);
  }
  for (let i = 0; i < queue.length; i++) for (const id of outgoing.get(queue[i]!) ?? []) {
    charge(); if (!active.has(id)) { active.add(id); queue.push(id); }
  }
  const checkedMedia = new Set(provider.inspection.checks.filter(c => c.request.fact === 'media').flatMap(c => c.request.records.map(r => r.id as string)));
  const media = new Set(provider.issues.filter(issue => {
    charge(); return issue.kind === 'unverified' && issue.code === 'verified-media-bytes-required' && issue.path.length === 3 &&
      issue.path[0] === 'mediaResourcesById' && issue.path[2] === 'blob' && !active.has(issue.path[1]!) && !checkedMedia.has(issue.path[1]!);
  }).map(issue => issue.path[1]!));
  return { active, media, charge };
}
/** Exact unrequested weak records; unavailable, never successful content checks. */
export function unreceivedWeakMedia(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, limits: MetadataLimits): ReadonlySet<string> {
  return weakContent(provider, limits).media;
}
/** Readiness of the whole Project; inactive weak records retain their diagnostics. */
export function metadataProviderReady(provider: ProjectProviderRead, limits: MetadataLimits): boolean {
  if (provider.kind !== 'scene-provider' || provider.inspection.checks.some(c => c.outcome !== 'verified')) return false;
  const { active, media, charge } = weakContent(provider, limits);
  return !provider.issues.some(issue => {
    charge();
    if (issue.kind === 'unverified' && issue.code === 'verified-profile-content-bounds-catalog-required' && issue.path.length === 3 &&
      issue.path[0] === 'representationsById' && issue.path[2] === 'formatProfile' && !active.has(issue.path[1]!)) return false;
    if (issue.kind === 'unverified' && issue.code === 'verified-media-bytes-required' && issue.path.length === 3 &&
      issue.path[0] === 'mediaResourcesById' && issue.path[2] === 'blob' && media.has(issue.path[1]!)) return false;
    if (issue.kind === 'unverified' && issue.path.length === 3 && issue.path[0] === 'captionsById' && issue.path[2] === 'anchor' &&
      ['source-index-unverified', 'verified-source-index-range-required'].includes(issue.code)) {
      const anchor = provider.resources.captions[issue.path[1]!]?.anchor;
      if (anchor?.kind === 'value' && anchor.value.kind === 'asset' && anchor.value.hitEvidence?.source?.surfaceRef &&
        !active.has(anchor.value.hitEvidence.source.representationId)) return false;
    }
    return ['invalid', 'unverified'].includes(issue.kind) || issue.code === 'opaque-data-protection-required';
  });
}

const blobKey = (ref: JsonObject) => `${ref.digest}:${ref.byteLength}`;
function incomingBlobs(blobs: readonly { sha256: string; byteLength: number }[]) {
  const available = new Set(blobs.map(b => `${b.sha256}:${b.byteLength}`));
  return (ref: JsonObject) => ref.algorithm === 'sha256' && available.has(blobKey(ref));
}

/** New synthetic-workspace service; ordinary ProjectStore/UI and old saved runs do not import it. */
export class MetadataProjectSession {
  private readonly limits: MetadataLimits;
  private readonly repository: MetadataRepository;
  private readonly journal: TransactionJournal;
  private acknowledgedMedia = new Set<string>();
  private acknowledgedLocalChanges = new Set<string>();
  private acknowledgmentsLoaded = false;
  private retained: { start: JournalStart; parts: Uint8Array[]; stagedBlobs?: JsonObject[];
    modelFacts?: { plan: MetadataModelFactPlan; next: ProjectMetadataSource };
    remote?: JournalRemoteInput;
    introduction?: { source: ProjectMetadataSource; command: Extract<MetadataEdit, { kind: 'createAttachment' }>; editor: LocalEditorContext } } | null = null;
  private last: MetadataSessionRead = { state: 'empty', source: null, provider: null, publication: null };
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly storage: MetadataStorageFactory, limits: MetadataLimits,
    /** Owned verifier, fresh durable inventory/evidence per request. Boolean permits initial fact creation only. */
    private readonly verifier: (allowNewEvidence: boolean) => ProjectContentVerifier,
    private readonly media?: MetadataMediaPort, private readonly modelFacts?: MetadataModelFactPort) {
    this.limits = checkLimits(limits); this.repository = new MetadataRepository(fs, storage, this.limits);
    this.journal = new TransactionJournal(fs, this.limits);
  }

  async read(): Promise<MetadataSessionRead> {
    try {
      const entries = await this.journal.entries(), published = entries.filter(e => e.publication).at(-1);
      await this.journal.readRestoredBases(entries);
      const pending = entries.some(e => !e.publication) || !!this.retained;
      if (!published) return this.last = Object.freeze({ state: pending ? 'pending' : 'empty', source: null, provider: null, publication: null });
      const source = await this.repository.read(published.start.repositoryId, published.start.proof, published.publication!.heads);
      if (!source) fail('published-source-missing');
      const originals = new Map(source!.originalChanges().map(b => [A.decodeChange(b).hash, b]));
      const acknowledged = new Set<string>(), localChanges = new Set<string>();
      let witnessWork = 0;
      const witness = () => { if (++witnessWork > this.limits.maxWork) fail('retained-media-limit'); };
      let inheritedCapabilities: ReaderCapabilities = [];
      for (const entry of entries.filter(e => e.publication)) {
        const partHashes = new Set<string>();
        witness();
        for (const head of entry.publication!.heads) if (!originals.has(head)) fail('published-history-missing');
        for (const bytes of await this.journal.validateParts(entry.prepared!)) {
          partHashes.add(A.decodeChange(bytes).hash);
          const included = originals.get(A.decodeChange(bytes).hash);
          if (!included || !equalBytes(included, bytes)) fail('published-transaction-missing');
          if (['initialize', 'localCommand', 'importClean'].includes(entry.start.purpose)) localChanges.add(A.decodeChange(bytes).hash);
        }
        if (entry.start.purpose === 'importWorkspace') await this.journal.validateImport(entry.prepared!);
        else if (entry.start.purpose === 'importClean') await (await CleanInputJob.open(this.fs, entry.start.transactionId, this.limits)).validateJournal(entry.prepared!);
        else if (entry.start.purpose === 'restoreBackup') { /* Original history and binding checked together above. */ }
        else if (entry.prepared!.remote) {
          const base = await this.repository.read(entry.start.repositoryId, entry.start.proof, entry.start.baseHeads);
          if (!base) fail('remote-base-missing');
          await this.journal.validateRemote(entry.prepared!, base!);
        }
        for (const ref of entry.prepared!.stagedBlobs ?? []) { witness(); acknowledged.add(blobKey(ref)); }
        const incoming = await this.journal.receivedInfo(entry.prepared!);
        checkRequiredCapabilities(entry.start.requiredCapabilities, capabilityUnion(inheritedCapabilities, source!.requiredCapabilitiesForChanges(partHashes), incoming.requiredCapabilities));
        inheritedCapabilities = readRequiredCapabilities(entry.start.requiredCapabilities);
        for (const ref of incoming.blobs) { witness(); acknowledged.add(`${ref.sha256}:${ref.byteLength}`); }
      }
      checkRequiredCapabilities(published.start.requiredCapabilities, capabilityUnion(inheritedCapabilities, source!.requiredCapabilities));
      this.acknowledgedMedia = acknowledged;
      this.acknowledgedLocalChanges = localChanges;
      this.acknowledgmentsLoaded = true;
      const provider = await readProjectScene(source!.read(), this.limits, this.verifier(false), { verifyRetainedMedia: this.retainedSelection(source!) });
      return this.last = Object.freeze({ state: pending ? 'pending' : this.providerReady(provider) ? 'ready' : 'repair-required',
        source: source!, provider, publication: published.start.transactionId });
    } catch {
      return this.last = Object.freeze({ ...this.last, state: 'repair-required' });
    }
  }

  /** Full current provider/content closure, never only a materialized Caption record. */
  private async checked(source: ProjectMetadataSource, allowNewEvidence: boolean): Promise<ProjectProviderRead> {
    const provider = await readProjectScene(source.read(), this.limits, this.verifier(allowNewEvidence), {
      verifyRetainedMedia: allowNewEvidence && !!this.media ? true : this.retainedSelection(source) });
    if (!this.providerReady(provider) || provider.kind !== 'scene-provider' || provider.token !== source.token) fail('provider-not-ready');
    return provider;
  }
  private retainedSelection(source: ProjectMetadataSource) {
    const acknowledged = new Set(this.acknowledgedMedia); let work = 0;
    for (const change of source.read().history.changes) {
      if (++work > this.limits.maxWork) fail('retained-media-limit');
      if (!this.acknowledgedLocalChanges.has(change.id)) continue;
      for (const w of change.writes) {
        if (++work > this.limits.maxWork) fail('retained-media-limit');
        if (w.path[0] === 'mediaResourcesById' && w.path.length === 2 && w.value.kind === 'value') {
          const record = w.value.value as JsonObject;
          if (record && typeof record === 'object' && record.blob && typeof record.blob === 'object')
            for (const ref of recordBlobRefs(record)) acknowledged.add(blobKey(ref));
        }
      }
    }
    return async (record: JsonObject): Promise<boolean> => !!this.media &&
      (recordBlobRefs(record).every(ref=>acknowledged.has(blobKey(ref))) || (this.media.retained ? await this.media.retained(record) : true));
  }
  private providerReady(provider: ProjectProviderRead): boolean {
    if(!metadataProviderReady(provider,this.limits))return false;
    if(provider.kind==='scene-provider')this.modelFacts?.assertProvider?.(provider);
    return true;
  }

  async create(records: { schema: JsonObject; identity: JsonObject } & JsonObject): Promise<MetadataSessionRead> {
    return this.createFromSource(ProjectMetadataSource.bootstrap(records.schema, records.identity, this.limits).initialize(records));
  }
  /** Host-retained initialization originals; never a package importer. */
  async createFromSource(source: ProjectMetadataSource): Promise<MetadataSessionRead> {
    return underWriteLease(this.fs, async () => {
      await assertReviewEditSlot(this.fs, this.limits);
      if ((await this.read()).state !== 'empty') fail('workspace-not-empty');
      if (source.originalChanges().length !== 2) fail('initialization-source');
      const transactionId = newId();
      this.retained = { start: { transactionId, repositoryId: transactionId, predecessor: null,
        purpose: 'initialize', proof: source.proof, baseHeads: [], ...capabilityFields(source.requiredCapabilities) }, parts: source.originalChanges() };
      await this.checked(source, true);
      return this.resume();
    });
  }

  async editCaption(expectedToken: string, captionId: string, field: 'title' | 'body', text: string): Promise<MetadataSessionRead> {
    return this.editCaptionTexts(expectedToken, captionId, { [field]: text });
  }
  async editCaptionTexts(expectedToken: string, captionId: string, edits: Readonly<Partial<Record<'title' | 'body', string>>>): Promise<MetadataSessionRead> {
    const normalized: Partial<Record<'title' | 'body', string>> = {};
    for (const [field, text] of Object.entries(edits)) {
      if ((field !== 'title' && field !== 'body') || typeof text !== 'string') return fail('caption-field');
      normalized[field] = normalizeCaptionText(field, text);
    }
    return this.edit(expectedToken, { kind: 'editCaption', captionId, edits: normalized });
  }

  async edit(expectedToken: string, command: MetadataEdit, editor?: LocalEditorContext): Promise<MetadataSessionRead> {
    editor = captureEditor(editor);
    command = canonicalMetadataEdit(command, this.limits);
    return underWriteLease(this.fs, async () => {
      await assertReviewEditSlot(this.fs, this.limits);
      const read = await this.read();
      if (read.state !== 'ready' || !read.source || read.source.token !== expectedToken) return fail('command-not-ready');
      const entries = await this.journal.entries(), prior = entries.at(-1)!;
      const durable = await this.repository.read(prior.start.repositoryId, prior.start.proof);
      if (!durable || durable.token !== read.source.token) return fail('command-base-changed');
      const provider = await this.checked(durable, false);
      const transactionId = newId();
      if (command.kind === 'createAttachment') {
        if (!this.media || provider.kind !== 'scene-provider') fail('media-unconnected');
        planMetadataEdit(provider as Extract<ProjectProviderRead, { kind: 'scene-provider' }>, command, this.limits);
        this.media!.assertIntroduction?.(provider as Extract<ProjectProviderRead,{kind:'scene-provider'}>,command.media);
        const [doc] = A.applyChanges(A.init(), durable.originalChanges());
        this.retained = { start: { transactionId, repositoryId: prior.start.repositoryId, predecessor: prior.start.transactionId,
          purpose: 'localCommand', proof: durable.proof, baseHeads: A.getHeads(doc).sort(),
          ...capabilityFields(capabilityUnion(readRequiredCapabilities(prior.start.requiredCapabilities), editor.kind === 'self-declared' ? [EDITOR_CAPABILITY] : [], command.media.portableDisplay ? [PORTABLE_MEDIA_CAPABILITY] : [])) }, parts: [],
          stagedBlobs: [...recordBlobRefs(command.media)], introduction: { source: durable, command, editor } };
        return this.resume();
      }
      let pointProof;
      if ((command.kind === 'addPin' || command.kind === 'movePin') && command.anchor.kind === 'asset' && command.anchor.hitEvidence?.method === 'point-cloud') {
        if (!this.modelFacts?.preparePointAnchor || provider.kind !== 'scene-provider') fail('point-anchor-unconnected');
        const owned = await this.modelFacts!.preparePointAnchor!(durable, provider as Extract<ProjectProviderRead, { kind: 'scene-provider' }>, command);
        if (json(owned) !== json(command.anchor)) fail('point-anchor-position');
        pointProof = issuePointAnchorProof(durable, command, transactionId);
      }
      const prepared = durable.prepareEdit(expectedToken, command, provider, transactionId, pointProof, editor);
      const known = new Set(durable.originalChanges().map(b => A.decodeChange(b).hash));
      const parts = prepared.originalChanges().filter(b => !known.has(A.decodeChange(b).hash));
      if (!parts.length) return read; // An unchanged value has no storage transaction.
      const facts = await this.prepareModelFacts(durable, prepared);
      if (!facts) await this.checked(prepared, false); // Refused preparation must not become a pending save.
      await this.verifyDelta(await reactivatedCaptionMedia(durable, prepared, this.limits), prepared.requiredCapabilities.includes(PORTABLE_MEDIA_CAPABILITY) ? prepared.mediaRecords() : undefined);
      const [doc] = A.applyChanges(A.init(), durable.originalChanges());
      this.retained = { start: { transactionId, repositoryId: prior.start.repositoryId, predecessor: prior.start.transactionId,
        purpose: 'localCommand', proof: durable.proof, baseHeads: A.getHeads(doc).sort(),
        ...capabilityFields(capabilityUnion(readRequiredCapabilities(prior.start.requiredCapabilities), prepared.requiredCapabilities)) }, parts,
        ...(facts ? { modelFacts: { plan: facts, next: prepared }, stagedBlobs: facts.stagedBlobs?.map(b => JSON.parse(json(b)) as JsonObject) } : {}) };
      return this.resume();
    });
  }

  /** Accepted full-source receive only. No package wire, new body staging or exchange-base update. */
  async receiveFullSource(expectedToken: string, input: FullMetadataSource): Promise<MetadataSessionRead> {
    const captured = copyFullSource(input, this.limits);
    const remote = ProjectMetadataSource.fromFullSource(captured.metadataBytes, captured.proof, this.limits);
    if (json(remote.heads) !== json(captured.remoteHeads)) fail('remote-source-heads');
    const metadataSha256 = await digest(captured.metadataBytes);
    return underWriteLease(this.fs, async () => {
      await assertReviewEditSlot(this.fs, this.limits);
      const read = await this.read();
      if (read.state !== 'ready' || !read.source || read.source.token !== expectedToken) return fail('receive-not-ready');
      const prior = (await this.journal.entries()).at(-1)!;
      const base = await this.repository.read(prior.start.repositoryId, prior.start.proof);
      if (!base || base.token !== read.source.token) return fail('receive-base-changed');
      const { parts, final } = planRemoteChanges(base, remote, this.limits);
      // Validate the final required content/candidates without observing a transient prefix.
      const facts = await this.prepareModelFacts(base, final);
      if (facts?.stagedBlobs?.length) fail('receive-new-body-unconnected');
      if (!facts) await this.checked(final, false);
      if (!parts.length) return read;
      this.retained = { start: { transactionId: newId(), repositoryId: prior.start.repositoryId,
        predecessor: prior.start.transactionId, purpose: 'remotePackageMerge', proof: base.proof, baseHeads: base.heads,
        ...capabilityFields(capabilityUnion(readRequiredCapabilities(prior.start.requiredCapabilities), final.requiredCapabilities)) },
        parts, ...(facts ? { modelFacts: { plan: facts, next: final } } : {}), remote: { bytes: captured.metadataBytes, proof: {
          source: { packageId: captured.packageId, metadataSha256, metadataByteLength: captured.metadataBytes.length,
            metadataEnvelope: captured.proof.envelope, remoteHeads: remote.heads }, expectedFinalHeads: final.heads } } };
      return this.resume();
    });
  }

  async retry(): Promise<MetadataSessionRead> { return underWriteLease(this.fs, async () => { await assertReviewEditSlot(this.fs, this.limits); return this.resume(); }); }

  private async outputReady() {
    await assertReviewEditSlot(this.fs, this.limits);
    const read = await this.read(); if (read.state !== 'ready' || !read.source || !read.publication) return fail('output-not-ready');
    for (const key of await receiveJobKeys(this.fs, this.limits)) {
      const state = await receiveInputState(this.fs, key, this.limits);
      if (state === 'abandoned') continue;
      if (state !== 'started') return fail('output-receive-pending');
      const job = await openReceiveJob(this.fs, key, this.receiveStore(), this.limits);
      if (!await receiveTerminal(job)) return fail('output-receive-pending');
      await job.validateCompletion();
    }
    return read;
  }
  private async finishWorkspaceOutput(job: WorkspaceOutputJob, store: OriginBlobStore, signal?: AbortSignal) {
    job.assertOwner(this.fs); const current = await this.outputReady();
    if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
    await this.assertOutputSlot(job.id);
    const { bases } = await validateOutputProtection(this.fs, job, store, this.limits);
    await bases.preflightRecord(job.baseRecord(), job.originalEvidence()); await job.generate(store, signal);
    await job.baseRecorded(await bases.recordGenerated(job)); return job.id;
  }
  async createWorkspaceOutput(expectedToken: string, store: OriginBlobStore, version: string, signal?: AbortSignal) {
    return underWriteLease(this.fs, async () => {
      const read = await this.outputReady(); if (read.source!.token !== expectedToken) return fail('output-stale');
      await this.assertOutputSlot();
      const bases = new WorkspaceBaseStore(this.fs, this.limits, read.source!.proof), snapshot = await bases.snapshot();
      const capture = await WorkspaceSourceCapture.prepare(this, expectedToken, store, this.limits, signal);
      const inspection = await read.source!.inspectOriginal({ maxWork: PACKAGE_LIMITS.inspectionWork, maxNodes: PACKAGE_LIMITS.inspectionNodes });
      const inventory = protectedWorkspaceInventory(inspection.candidates, await bases.payloads(snapshot.records));
      for (const b of inventory.blobs) if (await store.inspect({ algorithm: 'sha256', digest: b.sha256, byteLength: b.byteLength, mediaType: 'application/octet-stream' }) !== 'verified-present') return fail('output-protected-body-missing');
      const job = WorkspaceOutputJob.prepare(this.fs, capture, inventory, snapshot, this.limits, version);
      await bases.preflightRecord(job.baseRecord(), job.originalEvidence()); await job.persist(); return this.finishWorkspaceOutput(job, store, signal);
    });
  }
  async resumeWorkspaceOutput(id: string, store: OriginBlobStore, signal?: AbortSignal) {
    return underWriteLease(this.fs, async () => this.finishWorkspaceOutput(await WorkspaceOutputJob.open(this.fs, id, this.limits), store, signal));
  }
  async verifyWorkspaceOutput(id: string, file: Blob) {
    return underWriteLease(this.fs, async () => {
      await this.outputReady(); const job = await WorkspaceOutputJob.open(this.fs, id, this.limits);
      await new WorkspaceBaseStore(this.fs, this.limits, job.source.proof).read(); await job.verifySelected(file);
    });
  }
  async cancelWorkspaceOutput(id: string) {
    return underWriteLease(this.fs, async () => {
      if (await WorkspaceOutputJob.state(this.fs, id, this.limits) === 'started') await (await WorkspaceOutputJob.open(this.fs, id, this.limits)).cancel();
      else await WorkspaceOutputJob.abandon(this.fs, id, this.limits);
    });
  }
  private async assertOutputSlot(ownId?: string) {
    for (const key of await outputJobKeys(this.fs)) {
      if (key.id === ownId) continue;
      const state = await outputJobClass(key).state(this.fs, key.id, this.limits);
      if (state === 'abandoned') continue;
      if (state !== 'started') return fail('output-pending');
      const job = await openOutputJob(this.fs, key, this.limits);
      if (!await outputTerminal(job)) return fail('output-pending');
      await job.validateCompletion();
    }
  }
  private async finishContributionOutput(job: ContributionOutputJob, store: OriginBlobStore, signal?: AbortSignal) {
    job.assertOwner(this.fs); const current = await this.outputReady();
    if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
    await this.assertOutputSlot(job.id);
    await validateOutputProtection(this.fs, job, store, this.limits);
    await job.generate(store, signal); return job.id;
  }
  async createContributionOutput(expectedToken: string, selection: ContributionBaseSelection, store: OriginBlobStore, version: string, signal?: AbortSignal) {
    selection = structuredClone(selection);
    return underWriteLease(this.fs, async () => {
      const read = await this.outputReady(); if (read.source!.token !== expectedToken) return fail('output-stale');
      await this.assertOutputSlot();
      const bases = new WorkspaceBaseStore(this.fs, this.limits, read.source!.proof), snapshot = await bases.snapshot();
      const base = await VerifiedContributionBase.select(bases, selection, store, this.limits, signal);
      const capture = await ContributionSourceCapture.prepare(this, expectedToken, base, store, this.limits, signal);
      const inspection = await read.source!.inspectOriginal({ maxWork: PACKAGE_LIMITS.inspectionWork, maxNodes: PACKAGE_LIMITS.inspectionNodes });
      const inventory = protectedWorkspaceInventory(inspection.candidates, await bases.payloads(snapshot.records));
      const job = ContributionOutputJob.prepare(this.fs, capture, inventory, snapshot, this.limits, version);
      await validateOutputProtection(this.fs, job, store, this.limits);
      const current = await this.outputReady();
      if (current.source!.token !== expectedToken || current.publication !== capture.publication) return fail('output-stale');
      await job.persist(); return this.finishContributionOutput(job, store, signal);
    });
  }
  async resumeContributionOutput(id: string, store: OriginBlobStore, signal?: AbortSignal) {
    return underWriteLease(this.fs, async () => this.finishContributionOutput(await ContributionOutputJob.open(this.fs, id, this.limits), store, signal));
  }
  async verifyContributionOutput(id: string, file: Blob, store: OriginBlobStore) {
    return underWriteLease(this.fs, async () => {
      const current = await this.outputReady(), job = await ContributionOutputJob.open(this.fs, id, this.limits);
      if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
      await validateOutputProtection(this.fs, job, store, this.limits); await job.verifySelected(file, store);
    });
  }
  async cancelContributionOutput(id: string) {
    return underWriteLease(this.fs, async () => {
      if (await ContributionOutputJob.state(this.fs, id, this.limits) === 'started') await (await ContributionOutputJob.open(this.fs, id, this.limits)).cancel();
      else await ContributionOutputJob.abandon(this.fs, id, this.limits);
    });
  }

  private async finishBackupOutput(job: BackupOutputJob, store: OriginBlobStore, signal?: AbortSignal, timing?: BackupOutputTiming) {
    job.assertOwner(this.fs); const current = await this.outputReady();
    if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
    await this.assertOutputSlot(job.id); await validateOutputProtection(this.fs, job, store, this.limits);
    await measureBackupOutput(timing, 'job', () => job.generate(store, signal, timing)); return job.id;
  }
  async createManualCheckpoint(expectedToken: string, label: string | undefined, store: OriginBlobStore, version: string, signal?: AbortSignal, timing?: BackupOutputTiming) {
    checkedBackupLabel(label);
    return underWriteLease(this.fs, async () => {
      const read = await this.outputReady(); if (read.source!.token !== expectedToken) return fail('output-stale');
      await this.assertOutputSlot();
      const bases = new WorkspaceBaseStore(this.fs, this.limits, read.source!.proof);
      const capture = await measureBackupOutput(timing, 'capture', () => BackupSourceCapture.prepare(this, expectedToken, bases, store, this.limits, signal));
      const job = BackupOutputJob.prepare(this.fs, capture, this.limits, version, label);
      await validateOutputProtection(this.fs, job, store, this.limits);
      const current = await this.outputReady();
      if (current.source!.token !== expectedToken || current.publication !== capture.publication || json(await bases.snapshot()) !== json(job.frozenBases())) return fail('output-stale');
      await measureBackupOutput(timing, 'persist', () => job.persist()); return measureBackupOutput(timing, 'finish', () => this.finishBackupOutput(job, store, signal, timing));
    });
  }
  async resumeBackupOutput(id: string, store: OriginBlobStore, signal?: AbortSignal, timing?: BackupOutputTiming) {
    return underWriteLease(this.fs, async () => this.finishBackupOutput(await BackupOutputJob.open(this.fs, id, this.limits), store, signal, timing));
  }
  async verifyBackupOutput(id: string, file: Blob, store: OriginBlobStore) {
    return underWriteLease(this.fs, async () => {
      const current = await this.outputReady(), job = await BackupOutputJob.open(this.fs, id, this.limits);
      if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
      await validateOutputProtection(this.fs, job, store, this.limits); await job.verifySelected(file);
    });
  }
  async cancelBackupOutput(id: string) {
    return underWriteLease(this.fs, async () => {
      if (await BackupOutputJob.state(this.fs, id, this.limits) === 'started') await (await BackupOutputJob.open(this.fs, id, this.limits)).cancel();
      else await BackupOutputJob.abandon(this.fs, id, this.limits);
    });
  }

  private async finishCleanOutput(job: CleanOutputJob, store: OriginBlobStore, signal?: AbortSignal) {
    job.assertOwner(this.fs); const current = await this.outputReady();
    if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
    await this.assertOutputSlot(job.id); await validateOutputProtection(this.fs, job, store, this.limits);
    await job.generate(store, this.verifier(false), signal); return job.id;
  }
  async previewCleanOutput(expectedToken: string) {
    const read = await this.outputReady(); if (read.source!.token !== expectedToken) return fail('output-stale');
    const records = await selectCleanRecords(read.source!, this.limits);
    const count = (name: string) => Object.keys(records[name] as JsonObject).length;
    return { token: expectedToken, scenes: count('scenesById'), models: count('assetsById'), captions: count('captionsById'), media: count('mediaResourcesById') };
  }
  async createCleanOutput(expectedToken: string, store: OriginBlobStore, version: string, signal?: AbortSignal) {
    return underWriteLease(this.fs, async () => {
      const read = await this.outputReady(); if (read.source!.token !== expectedToken) return fail('output-stale');
      await this.assertOutputSlot();
      const bases = new WorkspaceBaseStore(this.fs, this.limits, read.source!.proof), snapshot = await bases.snapshot();
      const capture = await CleanSourceCapture.prepare(this, expectedToken, store, this.limits, signal);
      const inventory = await cleanProtectedInventory(read.source!, await bases.payloads(snapshot.records), this.limits);
      const job = CleanOutputJob.prepare(this.fs, capture, inventory, snapshot, this.limits, version);
      await validateOutputProtection(this.fs, job, store, this.limits);
      const current = await this.outputReady();
      if (current.source!.token !== expectedToken || current.publication !== capture.publication || json(await bases.snapshot()) !== json(snapshot)) return fail('output-stale');
      await job.persist(); return this.finishCleanOutput(job, store, signal);
    });
  }
  async resumeCleanOutput(id: string, store: OriginBlobStore, signal?: AbortSignal) {
    return underWriteLease(this.fs, async () => this.finishCleanOutput(await CleanOutputJob.open(this.fs, id, this.limits), store, signal));
  }
  async verifyCleanOutput(id: string, file: Blob, store: OriginBlobStore) {
    return underWriteLease(this.fs, async () => {
      const current = await this.outputReady(), job = await CleanOutputJob.open(this.fs, id, this.limits);
      if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
      await validateOutputProtection(this.fs, job, store, this.limits); await job.verifySelected(file);
    });
  }
  async cancelCleanOutput(id: string) {
    return underWriteLease(this.fs, async () => {
      if (await CleanOutputJob.state(this.fs, id, this.limits) === 'started') await (await CleanOutputJob.open(this.fs, id, this.limits)).cancel();
      else await CleanOutputJob.abandon(this.fs, id, this.limits);
    });
  }

  private async finishReviewOutput(job: ReviewOutputJob, store: OriginBlobStore, signal?: AbortSignal) {
    job.assertOwner(this.fs); const current = await this.outputReady();
    if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
    await this.assertOutputSlot(job.id); await validateOutputProtection(this.fs, job, store, this.limits);
    await job.generate(store, this.verifier(false), signal); return job.id;
  }
  async previewReviewOutput(expectedToken: string, selection: ReviewSelectionOptions) {
    const read = await this.outputReady(); if (read.source!.token !== expectedToken) return fail('output-stale');
    const { review, omittedEntryView } = await prepareReviewSnapshot(read.source!, this.limits, selection);
    const count = (name: string) => Object.keys(review.snapshot[name] as JsonObject).length;
    return { token: expectedToken, sceneId: selection.sceneId, name: (review.snapshot.scene as JsonObject).name as string,
      models: Object.values(review.snapshot.assetsById as JsonObject).filter(a => (a as JsonObject).kind === 'visual').length,
      captions: count('captionsById'), media: count('mediaResourcesById'), ...review.editEffect, omittedEntryView };
  }
  async createReviewOutput(expectedToken: string, selection: ReviewSelectionOptions, store: OriginBlobStore, version: string, signal?: AbortSignal) {
    const owned = structuredClone(selection);
    return underWriteLease(this.fs, async () => {
      const read = await this.outputReady(); if (read.source!.token !== expectedToken) return fail('output-stale');
      await this.assertOutputSlot();
      const bases = new WorkspaceBaseStore(this.fs, this.limits, read.source!.proof), snapshot = await bases.snapshot();
      const capture = await ReviewSourceCapture.prepare(this, expectedToken, owned, store, this.limits, signal);
      const inventory = await cleanProtectedInventory(read.source!, await bases.payloads(snapshot.records), this.limits);
      const job = ReviewOutputJob.prepare(this.fs, capture, inventory, snapshot, this.limits, version);
      await validateOutputProtection(this.fs, job, store, this.limits);
      const current = await this.outputReady();
      if (current.source!.token !== expectedToken || current.publication !== capture.publication || json(await bases.snapshot()) !== json(snapshot)) return fail('output-stale');
      await job.persist(); return this.finishReviewOutput(job, store, signal);
    });
  }
  async resumeReviewOutput(id: string, store: OriginBlobStore, signal?: AbortSignal) {
    return underWriteLease(this.fs, async () => this.finishReviewOutput(await ReviewOutputJob.open(this.fs, id, this.limits), store, signal));
  }
  async verifyReviewOutput(id: string, file: Blob, store: OriginBlobStore) {
    return underWriteLease(this.fs, async () => {
      const current = await this.outputReady(), job = await ReviewOutputJob.open(this.fs, id, this.limits);
      if (json(current.source!.proof) !== json(job.source.proof)) return fail('output-lineage');
      await validateOutputProtection(this.fs, job, store, this.limits); await job.verifySelected(file);
    });
  }
  async cancelReviewOutput(id: string) {
    return underWriteLease(this.fs, async () => {
      if (await ReviewOutputJob.state(this.fs, id, this.limits) === 'started') await (await ReviewOutputJob.open(this.fs, id, this.limits)).cancel();
      else await ReviewOutputJob.abandon(this.fs, id, this.limits);
    });
  }

  /** Exact history-free input, admitted as a new independent Project only. */
  async initializeClean(input: CleanInputJob): Promise<MetadataSessionRead> {
    input.assertOwner(this.fs);
    return underWriteLease(this.fs, async () => {
      await this.assertReceiveSlot(input.id);
      if (!this.modelFacts?.planImported || !this.media?.inventory) return fail('clean-import-unconnected');
      let job = input.start ? await CleanInputJob.open(this.fs, input.id, this.limits) : input;
      const entries = await this.journal.entries(), own = entries.find(e => e.start.transactionId === job.id), source = job.inspection.source;
      if (own && (own.start.purpose !== 'importClean' || json(own.start.proof) !== json(source.proof)) || entries.length && !own ||
        this.retained && this.retained.start.transactionId !== job.id) return fail('clean-import-not-empty');
      if (!own && (await this.fs.list(metadataPath(this.fs, ''))).length) return fail('clean-import-not-empty');
      await this.repository.assertImportNamespace(own?.start.repositoryId);
      const inventory = await job.inventory();
      if (own?.publication) {
        await job.validateJournal(own.prepared!); await this.checked(source, false); await this.media.inventory(inventory);
        this.retained = null; const current = await this.read();
        if (current.state !== 'ready') return fail('clean-import-replay-not-ready');
        await job.complete(); return current;
      }
      if (entries.some(e => e !== own)) return fail('clean-import-other-transaction');
      if (!own?.prepared) {
        const facts = await this.modelFacts.planImported(source, ref => job.inspection.archive.entryBlob(`blobs/sha256/${ref.digest}`), incomingBlobs(job.inspection.archive.control.manifest.blobs));
        if (facts.baseToken !== null || facts.finalToken !== source.token) return fail('model-facts-token');
        const introduced = new Set((facts.stagedBlobs ?? []).map(b => b.digest));
        await this.media.inventory(inventory.filter(b => !introduced.has(b.digest)));
        const parts = source.originalChanges();
        if (!job.start) job = await job.persist((facts.stagedBlobs ?? []).reduce((n, b) => n + (b.byteLength as number), 0) + parts.reduce((n, b) => n + b.length * 4, 0));
        this.retained = { start: own?.start ?? { transactionId: job.id, repositoryId: job.id, predecessor: null,
          purpose: 'importClean', proof: source.proof, baseHeads: [], ...capabilityFields(source.requiredCapabilities) }, parts,
          ...(facts.stagedBlobs?.length ? { stagedBlobs: [...facts.stagedBlobs] } : {}),
          modelFacts: { next: source, plan: { ...facts, stage: async () => { await facts.stage(); await this.media!.inventory!(inventory); } } } };
      } else { this.retained = null; await job.validateJournal(own.prepared); await this.media.inventory(inventory); }
      await this.resume(job); await job.complete(); return this.read();
    });
  }
  async abandonCleanInput(id: string) {
    return underWriteLease(this.fs, () => CleanInputJob.abandon(this.fs, id, this.limits));
  }

  /** Owned pending restore generation only. Publication is not root selection or restoration completion. */
  async initializeBackup(job: BackupRestoreJob): Promise<MetadataSessionRead> {
    await job.assertStaging(this.fs, this.storage);
    return underWriteLease(this.fs, async () => {
      if (!this.modelFacts?.planRestored || !this.media) return fail('backup-restore-unconnected');
      const { inspection, input } = await job.initialization(this.fs, this.storage), source = inspection.source;
      const inventory = inspection.description.bodyRefs.map(r => ({ ...r }));
      const entries = await this.journal.entries(), own = entries.find(e => e.start.transactionId === job.id);
      if (own && (own.start.purpose !== 'restoreBackup' || json(own.start.proof) !== json(source.proof)) ||
        entries.length && !own || this.retained && this.retained.start.transactionId !== job.id) return fail('restore-not-empty');
      if (!own && (await this.fs.list(metadataPath(this.fs, ''))).length) return fail('restore-not-empty');
      await this.repository.assertImportNamespace(own?.start.repositoryId);
      if (own?.prepared && json(own.prepared.remote) !== json(input.proof)) return fail('restore-journal-originals');
      if (own?.publication) {
        await this.journal.validateRestore(own.prepared!); await this.media.verify(inventory, inspection.description.mediaRecords);
        this.retained = null;
        const current = await this.read();
        if (current.state !== 'ready' || !current.source) return fail('restore-replay-not-ready');
        return current; // Preserve all legitimate later originals, not just backup heads.
      }
      if (entries.some(e => e !== own)) return fail('restore-other-transaction');
      if (!own?.prepared) {
        const facts = await this.modelFacts.planRestored(source, ref => inspection.archive.entryBlob(`blobs/sha256/${ref.digest}`), inventory);
        if (facts.baseToken !== null || facts.finalToken !== source.token) return fail('model-facts-token');
        this.retained = { start: own?.start ?? { transactionId: job.id, repositoryId: job.id, predecessor: null,
          purpose: 'restoreBackup', proof: source.proof, baseHeads: [], ...capabilityFields(readRequiredCapabilities(inspection.archive.control.manifest.requiredCapabilities)) }, parts: initialWorkspaceChanges(source, this.limits), remote: input,
          ...(facts.stagedBlobs?.length ? { stagedBlobs: [...facts.stagedBlobs] } : {}), modelFacts: { next: source, plan: facts } };
      } else this.retained = null;
      await this.resume(undefined, job);
      const current = await this.read();
      if (current.state !== 'ready' || current.publication !== job.id || current.source?.token !== source.token) return fail('restore-publication-readback');
      return current;
    });
  }

  /** First Workspace introduction: original history, never a reconstructed local initialization. */
  async importWorkspace(input: WorkspaceReceiveJob): Promise<MetadataSessionRead> {
    input.assertOwner(this.fs);
    return underWriteLease(this.fs, async () => {
      await this.assertReceiveSlot(input.id);
      if (!this.modelFacts?.planImported || !this.media?.inventory || input.start && !input.importing) return fail('workspace-import-unconnected');
      let job = input;
      const entries = await this.journal.entries(), own = entries.find(e => e.start.transactionId === job.id);
      if (own && (own.start.purpose !== 'importWorkspace' || json(own.start.proof) !== json(job.inspection.source.proof)) ||
        entries.length && !own || this.retained && this.retained.start.transactionId !== job.id) return fail('import-not-empty');
      if (!own && (await this.fs.list(metadataPath(this.fs, ''))).length) return fail('import-not-empty');
      await this.repository.assertImportNamespace(own?.start.repositoryId);
      const source = job.inspection.source;
      await job.preflightBase({ identity: source.proof.identity, metadataEnvelope: source.proof.envelope, heads: source.heads });
      const inventory = await job.inventory(), remote = await job.journalInput(source.heads);
      if (own?.prepared && json(own.prepared.remote) !== json(remote.proof)) return fail('receive-journal-originals');
      if (own?.publication) {
        await this.journal.validateImport(own.prepared!);
        const current = await this.read();
        if (current.state !== 'ready' || !current.source) return fail('import-replay-not-ready');
        await this.checked(source, false);
        await this.media.inventory(inventory);
        await job.finish(own, { identity: source.proof.identity, metadataEnvelope: source.proof.envelope, heads: source.heads }, false);
        return current; // Later local originals/heads are never replaced by the imported snapshot.
      }
      if (entries.some(e => e !== own)) return fail('import-other-transaction');
      if (!own?.prepared) {
        const parts = initialWorkspaceChanges(source, this.limits);
        const facts = await this.modelFacts.planImported(source, ref => job.inspection.archive.entryBlob(`blobs/sha256/${ref.digest}`), incomingBlobs(job.inspection.archive.control.manifest.blobs));
        if (facts.baseToken !== null || facts.finalToken !== source.token) return fail('model-facts-token');
        const introduced = new Set((facts.stagedBlobs ?? []).map(b => b.digest));
        await this.media.inventory(inventory.filter(b => !introduced.has(b.digest)));
        if (!job.start) job = await job.persist(null, (facts.stagedBlobs ?? []).reduce((n, b) => n + (b.byteLength as number), 0) +
          parts.reduce((n, b) => n + b.length * 2, 0) + source.encodeFullSource().length * 3 + 4_194_304);
        this.retained = { start: own?.start ?? { transactionId: job.id, repositoryId: job.id, predecessor: null,
          purpose: 'importWorkspace', proof: source.proof, baseHeads: [], ...capabilityFields(source.requiredCapabilities) }, parts, remote,
          ...(facts.stagedBlobs?.length ? { stagedBlobs: [...facts.stagedBlobs] } : {}),
          modelFacts: { next: source, plan: { ...facts, stage: async () => { await facts.stage(); await this.media!.inventory!(inventory); } } } };
      } else { this.retained = null; await this.media.inventory(inventory); }
      await this.resume(job);
      const receipt = (await this.journal.entries()).find(e => e.start.transactionId === job.id);
      if (!receipt?.publication || json(receipt.publication.heads) !== json(source.heads)) return fail('import-final-publication');
      await job.finish(receipt, { identity: source.proof.identity, metadataEnvelope: source.proof.envelope, heads: source.heads }, false);
      return this.read();
    });
  }

  /** Isolated actual Workspace receive. Job spool/base remain separate from metadata publication. */
  async receiveWorkspace(expectedToken: string | null, input: WorkspaceReceiveJob): Promise<MetadataSessionRead> {
    input.assertOwner(this.fs);
    return underWriteLease(this.fs, async () => {
      await this.assertReceiveSlot(input.id);
      if (!this.modelFacts?.planReceived || !this.media?.inventory || input.importing) return fail('workspace-receive-unconnected');
      let job = input;
      await job.preflightBase(); // Reject an incompatible/corrupt retained base before any Project write.
      const entries = await this.journal.entries(), prior = entries.filter(e => e.publication).at(-1);
      if (!prior?.publication) return fail('receive-not-ready');
      const current = await this.read();
      if (!current.source || current.state === 'repair-required' || expectedToken !== null && current.source.token !== expectedToken ||
        !job.start && current.state !== 'ready') return fail('receive-not-ready');
      const own = entries.find(e => e.start.transactionId === job.id), observed = await job.publicationReference();
      if (own?.prepared && json(own.prepared.remote) !== json((await job.journalInput(own.prepared.remote?.expectedFinalHeads ?? [])).proof)) return fail('receive-journal-originals');
      if (observed) {
        const receipt = entries.find(e => e.publication && packageByteHash(new TextEncoder().encode(json(e.publication))) === observed.publication.sha256);
        if (!receipt?.publication || observed.kind === 'workspacePublished' && receipt.start.transactionId !== job.id ||
          observed.kind === 'workspaceAlreadyPresent' && own) return fail('receive-observation-missing');
        const frozen = await this.repository.read(receipt.start.repositoryId, receipt.start.proof, observed.receiver.heads);
        if (!frozen || planRemoteChanges(frozen, job.inspection.source, this.limits).parts.length) return fail('receive-inclusion');
        await this.checked(frozen, false); await this.media.inventory(await job.inventory());
        await job.finish(receipt, observed.receiver, observed.kind === 'workspaceAlreadyPresent');
        return this.read();
      }
      const receiver = job.start?.operation === 'receiveWorkspace' ? job.start.receiver :
        { identity: current.source.proof.identity, metadataEnvelope: current.source.proof.envelope, heads: current.source.heads };
      const base = await this.repository.read(prior.start.repositoryId, { identity: receiver.identity, envelope: receiver.metadataEnvelope }, receiver.heads);
      if (!base) return fail('receive-base-missing');
      if (!own && base.token !== current.source.token) return fail('receive-stale');
      if (entries.some(e => !e.publication && e !== own)) return fail('receive-other-transaction');
      const { parts, final } = planRemoteChanges(base, job.inspection.source, this.limits);
      await job.preflightBase({ identity: final.proof.identity, metadataEnvelope: final.proof.envelope, heads: final.heads });
      const inventory = await job.inventory();
      if (!parts.length) await this.media.inventory(inventory);
      if (own && (json(own.start.proof) !== json(base.proof) || json(own.start.baseHeads) !== json(base.heads))) return fail('receive-job-journal');
      if (!own?.prepared) {
        const facts = await this.modelFacts.planReceived(base, final, ref => job.inspection.archive.entryBlob(`blobs/sha256/${ref.digest}`), incomingBlobs(job.inspection.archive.control.manifest.blobs));
        const introduced = new Set((facts.stagedBlobs ?? []).map(b => b.digest));
        await this.media.inventory(inventory.filter(b => !introduced.has(b.digest)));
        if (!job.start) {
          const additional = (facts.stagedBlobs ?? []).reduce((n, b) => n + (b.byteLength as number), 0) +
            parts.reduce((n, b) => n + b.length * 2, 0) + job.inspection.source.encodeFullSource().length * 3 + 4_194_304;
          job = await job.persist(receiver, additional);
        }
        if (parts.length) {
          this.retained = { start: own?.start ?? { transactionId: job.id, repositoryId: prior.start.repositoryId,
            predecessor: prior.start.transactionId, purpose: 'remotePackageMerge', proof: base.proof, baseHeads: base.heads,
            ...capabilityFields(capabilityUnion(readRequiredCapabilities(prior.start.requiredCapabilities), final.requiredCapabilities)) },
            parts, ...(facts.stagedBlobs?.length ? { stagedBlobs: [...facts.stagedBlobs] } : {}), modelFacts: { plan: {
              ...facts, stage: async () => { await facts.stage(); await this.media!.inventory!(inventory); },
            }, next: final },
            remote: await job.journalInput(final.heads) };
        }
      } else { this.retained = null; await this.media.inventory(inventory); } // Prepared recovery verifies the complete guaranteed inventory too.
      if (parts.length && !own?.publication) await this.resume(job);
      const receipt = parts.length ? (await this.journal.entries()).find(e => e.start.transactionId === job.id) : prior;
      if (!receipt?.publication || json(receipt.publication.heads) !== json(final.heads)) return fail('receive-final-publication');
      await this.checked(final, false); await this.media.inventory(await job.inventory());
      const published: ReceiverProof = { identity: final.proof.identity, metadataEnvelope: final.proof.envelope, heads: final.heads };
      await job.finish(receipt, published, !parts.length);
      return this.read();
    });
  }
  async cancelWorkspaceReceive(job: WorkspaceReceiveJob): Promise<void> {
    job.assertOwner(this.fs);
    return underWriteLease(this.fs, async () => {
      if (job.start?.operation !== 'receiveWorkspace' || (await this.journal.entries()).some(e => e.start.transactionId === job.id) || (await job.steps()).length) return fail('receive-cancel-denied');
      const current = await this.read();
      if (current.state !== 'ready' || !current.source || json(current.source.heads) === json(job.start.receiver.heads)) fail('receive-not-stale');
      await job.cancelStale();
    });
  }
  async abandonWorkspaceInput(id: string): Promise<void> {
    return underWriteLease(this.fs, async () => {
      const read = await this.read();
      if (this.retained || read.state !== 'ready' && (read.state !== 'empty' || (await this.fs.list(metadataPath(this.fs, ''))).length)) return fail('receive-abandon-not-ready');
      await WorkspaceReceiveJob.abandon(this.fs, id, this.limits);
    });
  }

  private receiveStore() {
    return { inspect: async (ref: import('./blobStore').StoredBlobRef) => {
      if (!this.media?.inventory) return fail('media-unconnected'); await this.media.inventory([{ ...ref }]); return 'verified-present' as const;
    } };
  }
  private async assertReceiveSlot(ownId: string) {
    await assertReviewEditSlot(this.fs, this.limits, ownId);
    for (const key of await receiveJobKeys(this.fs, this.limits)) {
      if (key.id === ownId) continue;
      const state = await receiveInputState(this.fs, key, this.limits);
      if (state === 'abandoned') continue;
      if (state !== 'started') return fail('receive-job-unfinished');
      const job = await openReceiveJob(this.fs, key, this.receiveStore(), this.limits);
      if (!await receiveTerminal(job)) fail('receive-job-unfinished'); await job.validateCompletion();
    }
  }
  /** Actual delta input; wire D is retained separately from receiver M. No base advancement. */
  async receiveContribution(expectedToken: string | null, input: ContributionReceiveJob): Promise<MetadataSessionRead> {
    input.assertOwner(this.fs);
    return underWriteLease(this.fs, async () => {
      await this.assertReceiveSlot(input.id);
      if (!this.modelFacts?.planReceived || !this.media?.inventory) return fail('contribution-receive-unconnected');
      let job = input; await job.preflightBase();
      const entries = await this.journal.entries(), prior = entries.filter(e => e.publication).at(-1), own = entries.find(e => e.start.transactionId === job.id);
      if (!prior?.publication || this.retained && this.retained.start.transactionId !== job.id) return fail('receive-not-ready');
      const current = await this.read();
      if (!current.source || current.state === 'repair-required' || expectedToken !== null && current.source.token !== expectedToken ||
        !job.start && current.state !== 'ready') return fail('receive-not-ready');
      if (own?.prepared && json(own.prepared.remote) !== json((await job.journalInput(own.prepared.remote?.expectedFinalHeads ?? [])).proof)) fail('receive-journal-originals');
      const observed = await job.publicationReference();
      if (observed) {
        await job.validateCompletion();
        const receipt = entries.find(e => e.publication && packageByteHash(new TextEncoder().encode(json(e.publication))) === observed.publication.sha256);
        if (!receipt?.publication || observed.kind === 'contributionPublished' && receipt.start.transactionId !== job.id ||
          observed.kind === 'contributionAlreadyPresent' && own) return fail('receive-observation-missing');
        const frozen = await this.repository.read(receipt.start.repositoryId, receipt.start.proof, observed.receiver.heads);
        if (!frozen) return fail('receive-base-missing');
        assertContributionBaseInReceiver(job.inspection.base.source, frozen);
        if (planRemoteChanges(frozen, job.inspection.target, this.limits).parts.length) fail('receive-inclusion');
        await this.checked(frozen, false); await this.media.inventory(await job.inventory()); return this.read();
      }
      const receiver = job.start?.receiver ?? { identity: current.source.proof.identity, metadataEnvelope: current.source.proof.envelope, heads: current.source.heads };
      const base = await this.repository.read(prior.start.repositoryId, { identity: receiver.identity, envelope: receiver.metadataEnvelope }, receiver.heads);
      if (!base) return fail('receive-base-missing');
      if (!own && base.token !== current.source.token) fail('receive-stale');
      if (entries.some(e => !e.publication && e !== own)) fail('receive-other-transaction');
      assertContributionBaseInReceiver(job.inspection.base.source, base);
      const { parts, final } = planRemoteChanges(base, job.inspection.target, this.limits), inventory = await job.inventory();
      if (own && (json(own.start.proof) !== json(base.proof) || json(own.start.baseHeads) !== json(base.heads))) fail('receive-job-journal');
      if (!own?.prepared) {
        const facts = parts.length ? await this.modelFacts.planReceived(base, final, r => job.inspection.archive.entryBlob(`blobs/sha256/${r.digest}`), incomingBlobs(job.inspection.archive.control.manifest.blobs)) : null;
        const introduced = new Set((facts?.stagedBlobs ?? []).map(b => b.digest));
        await this.media.inventory(inventory.filter(b => !introduced.has(b.digest)));
        if (!job.start) {
          const proof = await job.journalInput(final.heads);
          const evidenceBytes = proof.manifestBytes.length + proof.checksumBytes.length + proof.baseManifestBytes.length + proof.baseMetadataBytes.length +
            proof.derivedTargetBytes.length + proof.wireParts.reduce((n, b) => n + b.length, 0);
          job = await job.persist(receiver, evidenceBytes + parts.reduce((n, b) => n + b.length * 2, 0) +
            final.encodeFullSource().length * 2 + (facts?.stagedBlobs ?? []).reduce((n, b) => n + (b.byteLength as number), 0) + 4_194_304);
        }
        if (parts.length && facts) this.retained = { start: own?.start ?? { transactionId: job.id, repositoryId: prior.start.repositoryId,
          predecessor: prior.start.transactionId, purpose: 'remotePackageMerge', proof: base.proof, baseHeads: base.heads,
          ...capabilityFields(capabilityUnion(readRequiredCapabilities(prior.start.requiredCapabilities), final.requiredCapabilities)) }, parts,
          remote: await job.journalInput(final.heads), ...(facts.stagedBlobs?.length ? { stagedBlobs: [...facts.stagedBlobs] } : {}),
          modelFacts: { next: final, plan: { ...facts, stage: async () => { await facts.stage(); await this.media!.inventory!(inventory); } } } };
      } else { this.retained = null; await this.media.inventory(inventory); }
      if (parts.length && !own?.publication) await this.resume(job);
      const receipt = parts.length ? (await this.journal.entries()).find(e => e.start.transactionId === job.id) : prior;
      if (!receipt?.publication || json(receipt.publication.heads) !== json(final.heads)) return fail('receive-final-publication');
      await this.checked(final, false); await this.media.inventory(await job.inventory());
      await job.finish(receipt, { identity: final.proof.identity, metadataEnvelope: final.proof.envelope, heads: final.heads }, !parts.length);
      return this.read();
    });
  }
  async cancelContributionReceive(job: ContributionReceiveJob) {
    job.assertOwner(this.fs);
    return underWriteLease(this.fs, async () => {
      if (!job.start || (await this.journal.entries()).some(e => e.start.transactionId === job.id) || (await job.steps()).length) fail('receive-cancel-denied');
      const read = await this.read();
      if (read.state !== 'ready' || !read.source || json(read.source.heads) === json(job.start!.receiver.heads)) fail('receive-not-stale');
      await job.cancelStale();
    });
  }
  async abandonContributionInput(id: string) {
    return underWriteLease(this.fs, async () => {
      if (this.retained || (await this.read()).state !== 'ready') fail('receive-abandon-not-ready');
      await ContributionReceiveJob.abandon(this.fs, id, this.limits);
    });
  }

  /** Owned initial-source receipt only. Complete an unprepared first initialization, never a merge. */
  async recoverInitialization(source: ProjectMetadataSource): Promise<MetadataSessionRead> {
    return underWriteLease(this.fs, async () => {
      const entries = await this.journal.entries(), pending = entries.find(e => !e.publication);
      if (!pending || pending.prepared) return this.resume();
      const start = pending.start, parts = source.originalChanges();
      if (entries.length !== 1 || start.purpose !== 'initialize' || start.predecessor !== null || start.baseHeads.length ||
        json(start.proof) !== json(source.proof) || parts.length !== 2 ||
        this.retained && json(this.retained.start) !== json(start)) return fail('initial-recovery-source');
      const expected = parts.map((_, i) => this.journal.path(start.transactionId, `changes/${String(i).padStart(8, '0')}.amchange`));
      const paths = await this.fs.list(this.journal.path(start.transactionId, 'changes/'));
      if (paths.some(path => !expected.includes(path))) return fail('initial-recovery-extra-part');
      for (const [i, path] of expected.entries()) {
        const existing = await this.fs.readStream(path);
        if (existing) {
          if (existing.size !== parts[i]!.length) return fail('initial-recovery-part');
          const bytes = await this.fs.readBytes(path);
          if (!bytes || !equalBytes(bytes, parts[i]!)) return fail('initial-recovery-part');
        }
      }
      await this.checked(source, true);
      this.retained = { start, parts }; return this.resume();
    });
  }

  private async resume(receiveJob?: ReceiveJob, restoreJob?: BackupRestoreJob): Promise<MetadataSessionRead> {
    const entries = await this.journal.entries(), pending = entries.find(e => !e.publication);
    if (!this.acknowledgmentsLoaded && entries.some(e => e.publication)) {
      await this.read();
      if (!this.acknowledgmentsLoaded) return fail('retained-media-witness');
    }
    const transactionId = pending?.start.transactionId ?? this.retained?.start.transactionId;
    if ((pending?.start ?? this.retained?.start)?.purpose === 'restoreBackup') {
      if (!restoreJob || restoreJob.id !== transactionId || !this.media) return fail('restore-job-recovery-required');
      await restoreJob.assertStaging(this.fs, this.storage);
    }
    if (transactionId && ((pending?.start ?? this.retained?.start)?.purpose === 'importWorkspace' ||
      (pending?.start ?? this.retained?.start)?.purpose === 'importClean' ||
      !!pending?.prepared?.remote && isContributionRemote(pending.prepared.remote) ||
      !!this.retained?.remote && isContributionRemote(this.retained.remote.proof) ||
      (await ContributionReceiveJob.ids(this.fs)).includes(transactionId) ||
      (await WorkspaceReceiveJob.ids(this.fs)).includes(transactionId))) {
      if (!receiveJob || receiveJob.id !== transactionId || !this.media?.inventory) return fail('receive-job-recovery-required');
      receiveJob.assertOwner(this.fs);
    }
    let prepared: PreparedJournal;
    if (this.retained) {
      if (pending && json(pending.start) !== json(this.retained.start)) fail('retry-other-transaction');
      if (!pending && entries.at(-1)?.start.transactionId === this.retained.start.transactionId) {
        this.retained = null; return this.read(); // Marker persisted but its acknowledgment was interrupted.
      }
      const predecessor = entries.filter(e => e.publication).at(-1)?.start.transactionId ?? null;
      if (predecessor !== this.retained.start.predecessor) fail('retry-predecessor');
      if (this.retained.modelFacts) {
        const { plan, next } = this.retained.modelFacts;
        await this.journal.begin(this.retained.start);
        if (pending?.prepared) fail('model-facts-after-prepared');
        if (this.retained.start.purpose === 'importWorkspace' || this.retained.start.purpose === 'restoreBackup' || this.retained.start.purpose === 'importClean') {
          if (plan.baseToken !== null || next.token !== plan.finalToken) fail('model-facts-base');
        } else {
          const base = await this.repository.read(this.retained.start.repositoryId, this.retained.start.proof, this.retained.start.baseHeads);
          if (!base || base.token !== plan.baseToken || next.token !== plan.finalToken) fail('model-facts-base');
        }
        await plan.stage(); await this.checked(next, false);
        delete this.retained.modelFacts; // Prepared/cold recovery can only verify already stored facts.
      }
      if (this.retained.introduction) {
        const { source, command, editor } = this.retained.introduction;
        await this.journal.begin(this.retained.start);
        await this.media!.stage(command.media, source.token);
        const durable = await this.repository.read(this.retained.start.repositoryId, source.proof);
        if (!durable || durable.token !== source.token) return fail('media-base-changed');
        const next = durable.prepareEdit(source.token, command, await this.checked(durable, false), this.retained.start.transactionId, undefined, editor);
        const known = new Set(durable.originalChanges().map(b => A.decodeChange(b).hash));
        this.retained.parts = next.originalChanges().filter(b => !known.has(A.decodeChange(b).hash));
        delete this.retained.introduction; // From here, retry can only replay these originals.
      }
      await this.verifyDelta(this.retained.stagedBlobs, this.retained.stagedBlobs?.length ? await this.mediaVerificationContext(this.retained.start, this.retained.parts, restoreJob?.inspection.description.mediaRecords) : undefined);
      if (this.retained.stagedBlobs?.length) {
        if (this.retained.start.purpose === 'importWorkspace' || this.retained.start.purpose === 'restoreBackup' || this.retained.start.purpose === 'importClean') {
          await this.checked(ProjectMetadataSource.reopen(this.retained.parts, this.retained.start.proof, this.limits), false);
        } else {
          const stored = await this.repository.read(this.retained.start.repositoryId, this.retained.start.proof);
          if (!stored) return fail('journal-base-missing');
          await this.checked(stored.appendOriginal(this.retained.parts), false);
        }
      }
      // Once prepared, disk is the recovery source. Never conceal loss of an
      // acknowledged source/part by recreating it from this writer's memory.
      prepared = pending?.prepared ??
        await this.journal.stage(this.retained.start, this.retained.parts, this.retained.stagedBlobs, this.retained.remote);
    } else if (pending?.prepared) prepared = pending.prepared;
    else if (pending) return fail('incomplete-staging-repair');
    else return this.read(); // Already published: no mutation or second publication.

    // Portable records need their complete original metadata before body verification.
    // Legacy transactions keep the original early ref-only check.
    const portable = !!prepared.stagedBlobs?.length && hasPortableMediaCapability(prepared.start.requiredCapabilities);
    const checkedParts = portable ? await this.journal.validateParts(prepared) : undefined;
    await this.verifyDelta(prepared.stagedBlobs, checkedParts ? await this.mediaVerificationContext(prepared.start, checkedParts, restoreJob?.inspection.description.mediaRecords) : undefined);
    const parts = checkedParts ?? await this.journal.validateParts(prepared), start = prepared.start;
    const initial = start.purpose === 'initialize' || start.purpose === 'importWorkspace' || start.purpose === 'restoreBackup' || start.purpose === 'importClean';
    let stored = await this.repository.read(start.repositoryId, start.proof, undefined, initial);
    let localBase: ProjectMetadataSource | null = null;
    if (!initial) {
      if (!stored) fail('journal-base-missing');
      const base = await this.repository.read(start.repositoryId, start.proof, start.baseHeads);
      if (!base) fail('journal-base-missing');
      if (start.purpose === 'localCommand') localBase = base;
    }
    let next: ProjectMetadataSource;
    if (start.purpose === 'remotePackageMerge') {
      const base = await this.repository.read(start.repositoryId, start.proof, start.baseHeads);
      if (!stored || !base) return fail('remote-base-missing');
      next = await this.journal.validateRemote(prepared, base);
      checkRemoteStored(stored, base, next, !!pending?.durable);
    } else if (start.purpose === 'importWorkspace' || start.purpose === 'restoreBackup' || start.purpose === 'importClean') {
      if (start.purpose === 'importClean' && !(receiveJob instanceof CleanInputJob)) return fail('clean-input-recovery-required');
      next = start.purpose === 'importClean' ? await (receiveJob as CleanInputJob).validateJournal(prepared) :
        start.purpose === 'restoreBackup' ? await this.journal.validateRestore(prepared) : await this.journal.validateImport(prepared);
      const allowed = new Map(next.originalChanges().map(b => [A.decodeChange(b).hash, b]));
      for (const bytes of stored?.originalChanges() ?? []) {
        const original = allowed.get(A.decodeChange(bytes).hash);
        if (!original || !equalBytes(original, bytes)) fail('import-unexpected-writer');
      }
      if (pending?.durable && (!stored || stored.token !== next.token)) fail('import-acknowledged-change-missing');
    } else next = stored ? stored.appendOriginal(parts) : ProjectMetadataSource.reopen(parts, start.proof, this.limits);
    // Prepared recovery is verify-only too, including an initial weak PNG whose
    // two local receipts disappeared before publication. The originals above are validated.
    let witnessWork = 0;
    const witness = () => { if (++witnessWork > this.limits.maxWork) fail('retained-media-limit'); };
    for (const ref of prepared.stagedBlobs ?? []) { witness(); this.acknowledgedMedia.add(blobKey(ref)); }
    const incoming = await this.journal.receivedInfo(prepared);
    const predecessor = entries.find(e => e.start.transactionId === start.predecessor);
    checkRequiredCapabilities(start.requiredCapabilities, capabilityUnion(readRequiredCapabilities(predecessor?.start.requiredCapabilities), next.requiredCapabilities, incoming.requiredCapabilities));
    for (const ref of incoming.blobs) { witness(); this.acknowledgedMedia.add(`${ref.sha256}:${ref.byteLength}`); }
    if (['initialize', 'localCommand', 'importClean'].includes(start.purpose))
      for (const part of prepared.changes) { witness(); this.acknowledgedLocalChanges.add(part.expectedChangeHash); }
    // Exact pending changes can coexist with legitimate extra local heads; never rebase or choose a winner.
    await this.checked(next, false);
    if (localBase) {
      const restored = localBase.appendOriginal(parts);
      await this.verifyDelta(await reactivatedCaptionMedia(localBase, restored, this.limits), restored.requiredCapabilities.includes(PORTABLE_MEDIA_CAPABILITY) ? restored.mediaRecords() : undefined);
    }
    if (receiveJob) await this.media!.inventory!(await receiveJob.inventory());
    if (restoreJob) await this.media!.verify(restoreJob.inventory(), restoreJob.inspection.description.mediaRecords);
    await this.repository.persist(start.repositoryId, next);
    stored = await this.repository.read(start.repositoryId, start.proof);
    if (!stored) fail('durable-source-missing');
    checkRequiredCapabilities(start.requiredCapabilities, capabilityUnion(readRequiredCapabilities(predecessor?.start.requiredCapabilities), stored!.requiredCapabilities, incoming.requiredCapabilities));
    const actual = new Map(stored!.originalChanges().map(b => [A.decodeChange(b).hash, b]));
    for (const bytes of parts) {
      const saved = actual.get(A.decodeChange(bytes).hash);
      if (!saved || !equalBytes(saved, bytes)) fail('durable-change-missing');
    }
    await this.checked(stored!, false);
    if (start.purpose === 'importClean' && stored!.token !== next.token) fail('clean-import-final-heads');
    if (prepared.remote && json(stored!.heads) !== json(prepared.remote.expectedFinalHeads)) fail('remote-final-heads');
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    await this.journal.publish(prepared, stored!);
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    this.retained = null;
    const read = await this.read();
    if (read.state !== 'ready' || read.source?.token !== stored!.token) fail('publication-readback');
    return read;
  }
  private async mediaVerificationContext(start: JournalStart, parts: readonly Uint8Array[], archived: readonly JsonObject[] = []) {
    if (!hasPortableMediaCapability(start.requiredCapabilities)) return undefined;
    const initial = ['initialize', 'importWorkspace', 'restoreBackup', 'importClean'].includes(start.purpose);
    const base = initial ? null : await this.repository.read(start.repositoryId, start.proof, start.baseHeads);
    if (!initial && !base) return fail('journal-base-missing');
    const candidate = initial ? ProjectMetadataSource.reopen(parts, start.proof, this.limits) : base!.appendOriginal(parts);
    return [...candidate.mediaRecords(), ...archived];
  }
  private async verifyDelta(blobs: readonly JsonObject[] = [], mediaRecords?: readonly JsonObject[]): Promise<void> {
    if (!blobs.length) return;
    if (!this.media) fail('media-unconnected');
    await this.media!.verify(blobs, mediaRecords);
  }
  private async prepareModelFacts(base: ProjectMetadataSource, next: ProjectMetadataSource) {
    const plan = await this.modelFacts?.plan(base, next);
    if (plan && (plan.baseToken !== base.token || plan.finalToken !== next.token)) fail('model-facts-token');
    return plan ?? null;
  }
}
