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
import { digest, equalBytes, json, newId, underWriteLease } from './persistence';
import { canonicalMetadataEdit, planMetadataEdit, type MetadataEdit } from './commands';
import { checkRemoteStored, copyFullSource, planRemoteChanges, type FullMetadataSource, type RemoteBatchProof } from './remote';

/** Owned finite content boundary. Stage may introduce bytes; recovery may only verify saved bytes. */
export interface MetadataMediaPort {
  stage(record: JsonObject, token: string): Promise<void>;
  verify(blobs: readonly JsonObject[]): Promise<void>;
}
export interface MetadataModelFactPlan { readonly baseToken: string; readonly finalToken: string; stage(): Promise<void> }
export interface MetadataModelFactPort { plan(base: ProjectMetadataSource, next: ProjectMetadataSource): Promise<MetadataModelFactPlan | null> }

export type MetadataSessionRead = Readonly<{
  state: 'empty' | 'ready' | 'pending' | 'repair-required';
  source: ProjectMetadataSource | null;
  provider: ProjectProviderRead | null;
  /** Internal technical receipt, never an end-user label. */
  publication: string | null;
}>;

/** Readiness of the whole Project; inactive weak records retain their diagnostics. */
export function metadataProviderReady(provider: ProjectProviderRead, limits: MetadataLimits): boolean {
  if (provider.kind !== 'scene-provider' || provider.inspection.checks.some(c => c.outcome !== 'verified')) return false;
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
  return !provider.issues.some(issue => {
    charge();
    if (issue.kind === 'unverified' && issue.code === 'verified-profile-content-bounds-catalog-required' && issue.path.length === 3 &&
      issue.path[0] === 'representationsById' && issue.path[2] === 'formatProfile' && !active.has(issue.path[1]!)) return false;
    return ['invalid', 'unverified'].includes(issue.kind) || issue.code === 'opaque-data-protection-required';
  });
}

/** New synthetic-workspace service; ordinary ProjectStore/UI and old saved runs do not import it. */
export class MetadataProjectSession {
  private readonly limits: MetadataLimits;
  private readonly repository: MetadataRepository;
  private readonly journal: TransactionJournal;
  private retained: { start: JournalStart; parts: Uint8Array[]; stagedBlobs?: JsonObject[];
    modelFacts?: { plan: MetadataModelFactPlan; next: ProjectMetadataSource };
    remote?: { proof: RemoteBatchProof; bytes: Uint8Array };
    introduction?: { source: ProjectMetadataSource; command: Extract<MetadataEdit, { kind: 'createAttachment' }> } } | null = null;
  private last: MetadataSessionRead = { state: 'empty', source: null, provider: null, publication: null };
  constructor(private readonly fs: ProjectWorkspaceFS, storage: MetadataStorageFactory, limits: MetadataLimits,
    /** Owned verifier, fresh durable inventory/evidence per request. Boolean permits initial fact creation only. */
    private readonly verifier: (allowNewEvidence: boolean) => ProjectContentVerifier,
    private readonly media?: MetadataMediaPort, private readonly modelFacts?: MetadataModelFactPort) {
    this.limits = checkLimits(limits); this.repository = new MetadataRepository(fs, storage, this.limits);
    this.journal = new TransactionJournal(fs, this.limits);
  }

  async read(): Promise<MetadataSessionRead> {
    try {
      const entries = await this.journal.entries(), published = entries.filter(e => e.publication).at(-1);
      const pending = entries.some(e => !e.publication) || !!this.retained;
      if (!published) return this.last = Object.freeze({ state: pending ? 'pending' : 'empty', source: null, provider: null, publication: null });
      const source = await this.repository.read(published.start.repositoryId, published.start.proof, published.publication!.heads);
      if (!source) fail('published-source-missing');
      const originals = new Map(source!.originalChanges().map(b => [A.decodeChange(b).hash, b]));
      for (const entry of entries.filter(e => e.publication)) {
        for (const head of entry.publication!.heads) if (!originals.has(head)) fail('published-history-missing');
        for (const bytes of await this.journal.validateParts(entry.prepared!)) {
          const included = originals.get(A.decodeChange(bytes).hash);
          if (!included || !equalBytes(included, bytes)) fail('published-transaction-missing');
        }
        if (entry.prepared!.remote) {
          const base = await this.repository.read(entry.start.repositoryId, entry.start.proof, entry.start.baseHeads);
          if (!base) fail('remote-base-missing');
          await this.journal.validateRemote(entry.prepared!, base!);
        }
      }
      const provider = await readProjectScene(source!.read(), this.limits, this.verifier(false), { verifyRetainedMedia: !!this.media });
      return this.last = Object.freeze({ state: pending ? 'pending' : this.providerReady(provider) ? 'ready' : 'repair-required',
        source: source!, provider, publication: published.start.transactionId });
    } catch {
      return this.last = Object.freeze({ ...this.last, state: 'repair-required' });
    }
  }

  /** Full current provider/content closure, never only a materialized Caption record. */
  private async checked(source: ProjectMetadataSource, allowNewEvidence: boolean): Promise<ProjectProviderRead> {
    const provider = await readProjectScene(source.read(), this.limits, this.verifier(allowNewEvidence), { verifyRetainedMedia: !!this.media });
    if (!this.providerReady(provider) || provider.kind !== 'scene-provider' || provider.token !== source.token) fail('provider-not-ready');
    return provider;
  }
  private providerReady(provider: ProjectProviderRead): boolean { return metadataProviderReady(provider, this.limits); }

  async create(records: { schema: JsonObject; identity: JsonObject } & JsonObject): Promise<MetadataSessionRead> {
    return this.createFromSource(ProjectMetadataSource.bootstrap(records.schema, records.identity, this.limits).initialize(records));
  }
  /** Host-retained initialization originals; never a package importer. */
  async createFromSource(source: ProjectMetadataSource): Promise<MetadataSessionRead> {
    return underWriteLease(this.fs, async () => {
      if ((await this.read()).state !== 'empty') fail('workspace-not-empty');
      if (source.originalChanges().length !== 2) fail('initialization-source');
      const transactionId = newId();
      this.retained = { start: { transactionId, repositoryId: transactionId, predecessor: null,
        purpose: 'initialize', proof: source.proof, baseHeads: [] }, parts: source.originalChanges() };
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

  async edit(expectedToken: string, command: MetadataEdit): Promise<MetadataSessionRead> {
    command = canonicalMetadataEdit(command, this.limits);
    return underWriteLease(this.fs, async () => {
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
        const [doc] = A.applyChanges(A.init(), durable.originalChanges());
        this.retained = { start: { transactionId, repositoryId: prior.start.repositoryId, predecessor: prior.start.transactionId,
          purpose: 'localCommand', proof: durable.proof, baseHeads: A.getHeads(doc).sort() }, parts: [],
          stagedBlobs: [command.media.blob as JsonObject], introduction: { source: durable, command } };
        return this.resume();
      }
      const prepared = durable.prepareEdit(expectedToken, command, provider, transactionId);
      const known = new Set(durable.originalChanges().map(b => A.decodeChange(b).hash));
      const parts = prepared.originalChanges().filter(b => !known.has(A.decodeChange(b).hash));
      if (!parts.length) return read; // An unchanged value has no storage transaction.
      const facts = await this.prepareModelFacts(durable, prepared);
      if (!facts) await this.checked(prepared, false); // Refused preparation must not become a pending save.
      const [doc] = A.applyChanges(A.init(), durable.originalChanges());
      this.retained = { start: { transactionId, repositoryId: prior.start.repositoryId, predecessor: prior.start.transactionId,
        purpose: 'localCommand', proof: durable.proof, baseHeads: A.getHeads(doc).sort() }, parts,
        ...(facts ? { modelFacts: { plan: facts, next: prepared } } : {}) };
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
      const read = await this.read();
      if (read.state !== 'ready' || !read.source || read.source.token !== expectedToken) return fail('receive-not-ready');
      const prior = (await this.journal.entries()).at(-1)!;
      const base = await this.repository.read(prior.start.repositoryId, prior.start.proof);
      if (!base || base.token !== read.source.token) return fail('receive-base-changed');
      const { parts, final } = planRemoteChanges(base, remote, this.limits);
      // Validate the final required content/candidates without observing a transient prefix.
      const facts = await this.prepareModelFacts(base, final);
      if (!facts) await this.checked(final, false);
      if (!parts.length) return read;
      this.retained = { start: { transactionId: newId(), repositoryId: prior.start.repositoryId,
        predecessor: prior.start.transactionId, purpose: 'remotePackageMerge', proof: base.proof, baseHeads: base.heads },
        parts, ...(facts ? { modelFacts: { plan: facts, next: final } } : {}), remote: { bytes: captured.metadataBytes, proof: {
          source: { packageId: captured.packageId, metadataSha256, metadataByteLength: captured.metadataBytes.length,
            metadataEnvelope: captured.proof.envelope, remoteHeads: remote.heads }, expectedFinalHeads: final.heads } } };
      return this.resume();
    });
  }

  async retry(): Promise<MetadataSessionRead> { return underWriteLease(this.fs, () => this.resume()); }

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

  private async resume(): Promise<MetadataSessionRead> {
    const entries = await this.journal.entries(), pending = entries.find(e => !e.publication);
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
        const base = await this.repository.read(this.retained.start.repositoryId, this.retained.start.proof, this.retained.start.baseHeads);
        if (!base || base.token !== plan.baseToken || next.token !== plan.finalToken) fail('model-facts-base');
        await plan.stage(); await this.checked(next, false);
        delete this.retained.modelFacts; // Prepared/cold recovery can only verify already stored facts.
      }
      if (this.retained.introduction) {
        const { source, command } = this.retained.introduction;
        await this.journal.begin(this.retained.start);
        await this.media!.stage(command.media, source.token);
        const durable = await this.repository.read(this.retained.start.repositoryId, source.proof);
        if (!durable || durable.token !== source.token) return fail('media-base-changed');
        const next = durable.prepareEdit(source.token, command, await this.checked(durable, false), this.retained.start.transactionId);
        const known = new Set(durable.originalChanges().map(b => A.decodeChange(b).hash));
        this.retained.parts = next.originalChanges().filter(b => !known.has(A.decodeChange(b).hash));
        delete this.retained.introduction; // From here, retry can only replay these originals.
      }
      await this.verifyDelta(this.retained.stagedBlobs);
      if (this.retained.stagedBlobs?.length) {
        const stored = await this.repository.read(this.retained.start.repositoryId, this.retained.start.proof);
        if (!stored) return fail('journal-base-missing');
        await this.checked(stored.appendOriginal(this.retained.parts), false);
      }
      // Once prepared, disk is the recovery source. Never conceal loss of an
      // acknowledged source/part by recreating it from this writer's memory.
      prepared = pending?.prepared ??
        await this.journal.stage(this.retained.start, this.retained.parts, this.retained.stagedBlobs, this.retained.remote);
    } else if (pending?.prepared) prepared = pending.prepared;
    else if (pending) return fail('incomplete-staging-repair');
    else return this.read(); // Already published: no mutation or second publication.

    await this.verifyDelta(prepared.stagedBlobs);
    const parts = await this.journal.validateParts(prepared), start = prepared.start;
    let stored = await this.repository.read(start.repositoryId, start.proof, undefined, start.purpose === 'initialize');
    if (start.purpose !== 'initialize') {
      if (!stored) fail('journal-base-missing');
      const base = await this.repository.read(start.repositoryId, start.proof, start.baseHeads);
      if (!base) fail('journal-base-missing');
    }
    let next: ProjectMetadataSource;
    if (start.purpose === 'remotePackageMerge') {
      const base = await this.repository.read(start.repositoryId, start.proof, start.baseHeads);
      if (!stored || !base) return fail('remote-base-missing');
      next = await this.journal.validateRemote(prepared, base);
      checkRemoteStored(stored, base, next, !!pending?.durable);
    } else next = stored ? stored.appendOriginal(parts) : ProjectMetadataSource.reopen(parts, start.proof, this.limits);
    // Exact pending changes can coexist with legitimate extra local heads; never rebase or choose a winner.
    await this.checked(next, start.purpose === 'initialize');
    await this.repository.persist(start.repositoryId, next);
    stored = await this.repository.read(start.repositoryId, start.proof);
    if (!stored) fail('durable-source-missing');
    const actual = new Map(stored!.originalChanges().map(b => [A.decodeChange(b).hash, b]));
    for (const bytes of parts) {
      const saved = actual.get(A.decodeChange(bytes).hash);
      if (!saved || !equalBytes(saved, bytes)) fail('durable-change-missing');
    }
    await this.checked(stored!, false);
    if (prepared.remote && json(stored!.heads) !== json(prepared.remote.expectedFinalHeads)) fail('remote-final-heads');
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    await this.journal.publish(prepared, stored!);
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    this.retained = null;
    const read = await this.read();
    if (read.state !== 'ready' || read.source?.token !== stored!.token) fail('publication-readback');
    return read;
  }
  private async verifyDelta(blobs: readonly JsonObject[] = []): Promise<void> {
    if (!blobs.length) return;
    if (!this.media) fail('media-unconnected');
    await this.media!.verify(blobs);
  }
  private async prepareModelFacts(base: ProjectMetadataSource, next: ProjectMetadataSource) {
    const plan = await this.modelFacts?.plan(base, next);
    if (plan && (plan.baseToken !== base.token || plan.finalToken !== next.token)) fail('model-facts-token');
    return plan ?? null;
  }
}
