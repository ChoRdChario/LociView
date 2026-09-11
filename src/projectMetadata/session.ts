import * as A from '@automerge/automerge/slim';
import type { ProjectWorkspaceFS } from '../platform/fs';
import type { JsonObject } from '../domain/values';
import type { ProjectContentVerifier } from '../domain/projectContentChecks';
import { normalizeCaptionText } from '../domain/captionText';
import { readProjectScene, type ProjectProviderRead } from '../scene/projectProvider';
import { checkLimits, fail, type MetadataLimits } from './format';
import { ProjectMetadataSource } from './source';
import { MetadataRepository, type MetadataStorageFactory } from './repository';
import { TransactionJournal, type JournalStart, type PreparedJournal } from './journal';
import { equalBytes, json, newId, underWriteLease } from './persistence';
import type { MetadataEdit } from './commands';

export type MetadataSessionRead = Readonly<{
  state: 'empty' | 'ready' | 'pending' | 'repair-required';
  source: ProjectMetadataSource | null;
  provider: ProjectProviderRead | null;
  /** Internal technical receipt, never an end-user label. */
  publication: string | null;
}>;

/** New synthetic-workspace service; ordinary ProjectStore/UI and old saved runs do not import it. */
export class MetadataProjectSession {
  private readonly limits: MetadataLimits;
  private readonly repository: MetadataRepository;
  private readonly journal: TransactionJournal;
  private retained: { start: JournalStart; parts: Uint8Array[] } | null = null;
  private last: MetadataSessionRead = { state: 'empty', source: null, provider: null, publication: null };
  constructor(private readonly fs: ProjectWorkspaceFS, storage: MetadataStorageFactory, limits: MetadataLimits,
    /** Owned verifier, fresh durable inventory/evidence per request. Boolean permits initial fact creation only. */
    private readonly verifier: (allowNewEvidence: boolean) => ProjectContentVerifier) {
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
      }
      const provider = await readProjectScene(source!.read(), this.limits, this.verifier(false));
      return this.last = Object.freeze({ state: pending ? 'pending' : this.providerReady(provider) ? 'ready' : 'repair-required',
        source: source!, provider, publication: published.start.transactionId });
    } catch {
      return this.last = Object.freeze({ ...this.last, state: 'repair-required' });
    }
  }

  /** Full current provider/content closure, never only a materialized Caption record. */
  private async checked(source: ProjectMetadataSource, allowNewEvidence: boolean): Promise<ProjectProviderRead> {
    const provider = await readProjectScene(source.read(), this.limits, this.verifier(allowNewEvidence));
    if (!this.providerReady(provider) || provider.kind !== 'scene-provider' || provider.token !== source.token) fail('provider-not-ready');
    return provider;
  }
  private providerReady(provider: ProjectProviderRead): boolean {
    return provider.kind === 'scene-provider' && provider.inspection.checks.every(c => c.outcome === 'verified') &&
      !provider.issues.some(i => ['invalid', 'unverified'].includes(i.kind) || i.code === 'opaque-data-protection-required');
  }

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
    return underWriteLease(this.fs, async () => {
      const read = await this.read();
      if (read.state !== 'ready' || !read.source || read.source.token !== expectedToken) return fail('command-not-ready');
      const entries = await this.journal.entries(), prior = entries.at(-1)!;
      const durable = await this.repository.read(prior.start.repositoryId, prior.start.proof);
      if (!durable || durable.token !== read.source.token) return fail('command-base-changed');
      const provider = await this.checked(durable, false);
      const transactionId = newId();
      const prepared = durable.prepareEdit(expectedToken, command, provider, transactionId);
      const known = new Set(durable.originalChanges().map(b => A.decodeChange(b).hash));
      const parts = prepared.originalChanges().filter(b => !known.has(A.decodeChange(b).hash));
      if (!parts.length) return read; // An unchanged value has no storage transaction.
      const [doc] = A.applyChanges(A.init(), durable.originalChanges());
      this.retained = { start: { transactionId, repositoryId: prior.start.repositoryId, predecessor: prior.start.transactionId,
        purpose: 'localCommand', proof: durable.proof, baseHeads: A.getHeads(doc).sort() }, parts };
      await this.checked(prepared, false);
      return this.resume();
    });
  }

  async retry(): Promise<MetadataSessionRead> { return underWriteLease(this.fs, () => this.resume()); }

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
      prepared = await this.journal.stage(this.retained.start, this.retained.parts);
    } else if (pending?.prepared) prepared = pending.prepared;
    else if (pending) return fail('incomplete-staging-repair');
    else return this.read(); // Already published: no mutation or second publication.

    const parts = await this.journal.validateParts(prepared), start = prepared.start;
    let stored = await this.repository.read(start.repositoryId, start.proof, undefined, start.purpose === 'initialize');
    if (start.purpose === 'localCommand') {
      if (!stored) fail('journal-base-missing');
      const base = await this.repository.read(start.repositoryId, start.proof, start.baseHeads);
      if (!base) fail('journal-base-missing');
    }
    const next = stored ? stored.appendOriginal(parts) : ProjectMetadataSource.reopen(parts, start.proof, this.limits);
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
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    await this.journal.publish(prepared, stored!);
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    this.retained = null;
    const read = await this.read();
    if (read.state !== 'ready' || read.source?.token !== stored!.token) fail('publication-readback');
    return read;
  }
}
