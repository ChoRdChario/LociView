import type { ProjectWorkspaceFS } from '../platform/fs';
import { cloneCanonicalValue } from '../domain/values';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { checkLimits, fail, type MetadataLimits } from '../projectMetadata/format';
import { openWorkspaceGeneration, type GenerationStorageOpener } from '../projectMetadata/generationScope';
import { newId, underWriteLease } from '../projectMetadata/persistence';
import type { MetadataProjectSession } from '../projectMetadata/session';
import { TransactionJournal } from '../projectMetadata/journal';
import { BackupArchive } from './backupArchive';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { WorkspaceBaseStore } from './workspaceBases';
import { receiveJobKeys, receiveInputState, openReceiveJob, receiveTerminal } from './receiveJobs';
import { outputJobKeys, outputJobClass, openOutputJob, outputTerminal } from './outputJobs';
import { checkAbort } from './zipChecks';
import { checkRestoreCurrent, readRestoreControls, reconcileRestoreDatabases, reserveRestoreControls, writeRestoreControl, restoreEqual, restoreJobPath, restoreRef, restoreRoot,
  type RestoreCurrent, type RestorePrepared, type RestoreStart, type RestoreControlJob } from './restoreControls';

/** Existing ready service, not UI-supplied heads or a filename-based Project identity. */
export interface RestoreSourcePorts {
  readonly fs: ProjectWorkspaceFS;
  readonly session: Pick<MetadataProjectSession, 'read'>;
  readonly store: Pick<OriginBlobStore, 'inspect'>;
}
export interface RestoreDatabasePorts {
  /** Enumerate only this logical Project's dedicated generation DB IDs; failure must reject. */
  listGenerations(): Promise<string[]>;
  open: GenerationStorageOpener;
}
const evidence = ({ sha256, byteLength }: EvidenceRef): EvidenceRef => ({ sha256, byteLength });
const terminal = (job: RestoreControlJob) => job.abandoned || job.result !== null;

/** Root-owned input and staging only. No selection/publication API before the full destination verifier exists. */
export class BackupRestoreJob {
  private warmCreate = false;
  private constructor(private readonly root: ProjectWorkspaceFS, readonly id: string, private readonly limits: MetadataLimits,
    readonly inspection: BackupArchive, private readonly file: Blob, readonly current: RestoreCurrent,
    readonly previousSelection: EvidenceRef | null, readonly start: RestoreStart | null) {
    this.current = cloneCanonicalValue(current, limits) as unknown as RestoreCurrent;
    this.previousSelection = cloneCanonicalValue(previousSelection, limits) as EvidenceRef | null;
    this.start = cloneCanonicalValue(start, limits) as unknown as RestoreStart | null;
  }
  path(name: string) { return restoreJobPath(this.root, this.id, name); }
  private descriptor(): RestorePrepared {
    const archive = this.inspection.archive, manifest = archive.control.manifest;
    if (manifest.purpose !== 'backup') return fail('restore-purpose');
    return { schema: 'lociview-local-restore-prepared-1', jobId: this.id,
      archive: { sha256: archive.sha256, byteLength: archive.byteLength },
      manifest: evidence(archive.control.entries.find(e => e.path === 'manifest.json')!), metadata: evidence(manifest.metadata),
      protectedInventory: evidence(manifest.protectedInventory), exchangeBases: evidence(manifest.exchangeBases),
      baseEvidence: manifest.baseEvidence.map(evidence) };
  }
  private static async current(root: ProjectWorkspaceFS, ports: RestoreSourcePorts, limits: MetadataLimits,
    state: Awaited<ReturnType<typeof readRestoreControls>>): Promise<RestoreCurrent> {
    if (state.pending) return fail('restore-pending');
    // A parsed chain is not proof of a restored destination. Its initializer/verifier is the next connection.
    if (state.tail) return fail('restore-destination-verification-required');
    if (ports.fs.mutationAuthority !== root.mutationAuthority || ports.fs.projectRoot !== root.projectRoot) fail('restore-current-scope');
    const before = await ports.session.read();
    if (before.state !== 'ready' || !before.source || !before.publication || before.provider?.kind !== 'scene-provider' ||
      before.provider.token !== before.source.token) return fail('restore-current-not-ready');
    for (const key of await receiveJobKeys(ports.fs, limits)) {
      const input = await receiveInputState(ports.fs, key, limits);
      if (input === 'abandoned') continue;
      if (input !== 'started') return fail('restore-receive-pending');
      const job = await openReceiveJob(ports.fs, key, ports.store, limits);
      if (!await receiveTerminal(job)) return fail('restore-receive-pending');
      await job.validateCompletion();
    }
    for (const key of await outputJobKeys(ports.fs)) {
      const outputState = await outputJobClass(key).state(ports.fs, key.id, limits);
      if (outputState === 'abandoned') continue;
      if (outputState !== 'started') return fail('restore-output-pending');
      const job = await openOutputJob(ports.fs, key, limits);
      if (!await outputTerminal(job)) return fail('restore-output-pending');
      await job.validateCompletion();
    }
    const journal = new TransactionJournal(ports.fs, limits), publication = (await journal.entries()).find(e => e.start.transactionId === before.publication)?.publication;
    if (!publication || !restoreEqual(publication.heads, before.source.heads)) return fail('restore-current-publication');
    const bases = await new WorkspaceBaseStore(ports.fs, limits, before.source.proof).snapshot();
    const after = await ports.session.read();
    if (after.state !== 'ready' || after.publication !== before.publication || after.source?.token !== before.source.token) return fail('restore-current-changed');
    const current: RestoreCurrent = { generationId: null, publicationId: before.publication, publication: restoreRef(publication),
      source: { proof: before.source.proof, heads: [...before.source.heads], token: before.source.token }, bases: restoreRef(bases) };
    checkRestoreCurrent(current, limits); return current;
  }
  static async prepare(root: ProjectWorkspaceFS, ports: RestoreSourcePorts, file: Blob, limits: MetadataLimits,
    databases: RestoreDatabasePorts, signal?: AbortSignal) {
    const checked = checkLimits(limits); restoreRoot(root); checkAbort(signal);
    if (!(file instanceof Blob)) return fail('restore-file');
    const owned = file.slice(0, file.size), inspection = await BackupArchive.inspect(owned, checked, signal);
    const state = await reconcileRestoreDatabases(root, checked, () => databases.listGenerations()), current = await this.current(root, ports, checked, state);
    if (!restoreEqual(current.source.proof, inspection.source.proof)) fail('restore-project-identity');
    checkAbort(signal); return new BackupRestoreJob(root, newId(), checked, inspection, owned, current, state.selection, null);
  }
  /** Explicit confirmation. Recheck the whole captured work before the first write under its original lease. */
  async persist(ports: RestoreSourcePorts, databases: RestoreDatabasePorts, signal?: AbortSignal) {
    return underWriteLease(this.root, async () => {
      checkAbort(signal); if (this.start) return fail('restore-already-started');
      const state = await reconcileRestoreDatabases(this.root, this.limits, () => databases.listGenerations());
      if (state.jobs.some(job => job.id === this.id)) fail('restore-job-exists');
      const current = await BackupRestoreJob.current(this.root, ports, this.limits, state);
      if (!restoreEqual(current, this.current) || !restoreEqual(state.selection, this.previousSelection)) fail('restore-confirmation-stale');
      const prepared = this.descriptor(), start: RestoreStart = { schema: 'lociview-local-restore-start-1', jobId: this.id,
        prepared: restoreRef(prepared), previousSelection: this.previousSelection, current };
      // Reserve control and entry budgets before writing, not after leaving a new unresumable job.
      const startRef = restoreRef(start), futureRef = { sha256: 'f'.repeat(64), byteLength: L.controlBytes };
      const index = { schema: 'lociview-local-restore-index-1', jobId: this.id, start: startRef };
      // Include later DbOpened, Selection and the largest terminal result, even though this unit cannot select.
      const reserved = [prepared, start, index, { schema: 'lociview-local-restore-db-opened-1', jobId: this.id, start: startRef, generationId: this.id },
        { schema: 'lociview-local-generation-selection-1', jobId: this.id, previous: this.previousSelection, start: startRef,
          destination: { journal: futureRef, publication: futureRef, baseBinding: futureRef } },
        { schema: 'lociview-local-restore-result-1', jobId: this.id, start: startRef, detail: { kind: 'selected', selection: futureRef } }];
      await reserveRestoreControls(this.root, reserved, 7, this.file.size);
      checkAbort(signal); await this.write('prepared.json', prepared);
      await this.root.writeStream(this.path('input.zip'), this.file.stream().pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) { checkAbort(signal); controller.enqueue(chunk); }, flush() { checkAbort(signal); },
      })));
      const saved = await BackupRestoreJob.inspectInput(this.root, this.id, prepared, this.limits, signal);
      if (!restoreEqual(saved.source.proof, current.source.proof)) fail('restore-project-identity');
      checkAbort(signal); await this.write('start.json', start);
      await writeRestoreControl(this.root, `${restoreRoot(this.root)}v2/local-restore/index/${this.id}.json`, index, this.limits);
      const job = await BackupRestoreJob.open(this.root, this.id, this.limits, databases, signal);
      job.warmCreate = true; return job;
    });
  }
  private static async inspectInput(root: ProjectWorkspaceFS, id: string, prepared: RestorePrepared, limits: MetadataLimits, signal?: AbortSignal) {
    checkAbort(signal); const file = await root.readStream(restoreJobPath(root, id, 'input.zip'));
    if (!file?.blob || file.size !== prepared.archive.byteLength || file.size > L.archiveBytes) return fail('restore-input-missing');
    const blob = await file.blob(); if (blob.size !== file.size) return fail('restore-input-size');
    const inspection = await BackupArchive.inspect(blob, limits, signal);
    if (!restoreEqual({ sha256: inspection.archive.sha256, byteLength: inspection.archive.byteLength }, prepared.archive)) fail('restore-input-mismatch');
    return inspection;
  }
  static async open(root: ProjectWorkspaceFS, id: string, limits: MetadataLimits, databases: RestoreDatabasePorts, signal?: AbortSignal) {
    const state = await reconcileRestoreDatabases(root, limits, () => databases.listGenerations()), job = state.jobs.find(j => j.id === id);
    if (!job?.start || !job.prepared || terminal(job) || state.tail?.jobId === id) return fail('restore-not-pending');
    const inspection = await this.inspectInput(root, id, job.prepared, limits, signal);
    if (!restoreEqual(inspection.source.proof, job.start.current.source.proof)) fail('restore-project-identity');
    const file = await root.readStream(restoreJobPath(root, id, 'input.zip'));
    if (!file?.blob) return fail('restore-input-missing');
    const owned = await file.blob(), result = new BackupRestoreJob(root, id, checkLimits(limits), inspection, owned,
      job.start.current, job.start.previousSelection, job.start);
    if (!restoreEqual(result.descriptor(), job.prepared)) fail('restore-input-descriptor');
    checkAbort(signal); return result;
  }
  private async pending(requireDb: boolean) {
    const state = await readRestoreControls(this.root, this.limits), job = state.pending;
    if (!this.start || job?.id !== this.id || !job.indexed || !restoreEqual(job.start, this.start) ||
      !restoreEqual(job.prepared, this.descriptor()) || requireDb && !job.dbOpened) return fail('restore-staging-retired');
    return job;
  }
  async openStaging(databases: RestoreDatabasePorts, signal?: AbortSignal) {
    return underWriteLease(this.root, async () => {
      const allowCreate = this.warmCreate; this.warmCreate = false;
      // Reinspect acknowledged input once at opening; lightweight per-operation checks never hash the ZIP.
      await BackupRestoreJob.open(this.root, this.id, this.limits, databases, signal);
      const job = await this.pending(false); checkAbort(signal);
      let opening = true;
      const scope = await openWorkspaceGeneration(this.root, { generationId: this.id, allowCreate,
        assertSelected: async () => { await this.pending(!opening); } }, databases.open);
      try {
        if (!job.dbOpened) {
          if ((await scope.factory().loadRange([])).length) fail('restore-unacknowledged-database');
          checkAbort(signal); await this.write('db-opened.json', { schema: 'lociview-local-restore-db-opened-1', jobId: this.id,
            start: restoreRef(this.start), generationId: this.id });
        }
        opening = false; checkAbort(signal); await scope.check(); return scope;
      } catch (error) { await scope.dispose().catch(() => {}); throw error; }
    });
  }
  private write(name: string, value: unknown) { return writeRestoreControl(this.root, this.path(name), value, this.limits); }
  /** Never deletes original or generation data. Missing Index is cancellable only before all initialization. */
  static async cancel(root: ProjectWorkspaceFS, id: string, limits: MetadataLimits, databases: RestoreDatabasePorts) {
    return underWriteLease(root, async () => {
      const state = await reconcileRestoreDatabases(root, limits, () => databases.listGenerations()), job = state.jobs.find(j => j.id === id);
      if (!job?.start || job.abandoned || state.selections.some(s => s.jobId === id) || job.result?.detail.kind === 'selected') return fail('restore-cancel-denied');
      if (job.result?.detail.kind === 'cancelled') return;
      if (!job.indexed && (job.dbOpened || job.destinationFiles.length || state.databaseIds.includes(id))) fail('restore-cancel-denied');
      await writeRestoreControl(root, restoreJobPath(root, id, 'result.json'), { schema: 'lociview-local-restore-result-1', jobId: id,
        start: restoreRef(job.start), detail: { kind: 'cancelled', stage: job.indexed ? 'beforeSelection' : 'beforeInitializationWithoutIndex' } }, limits);
      await readRestoreControls(root, limits);
    });
  }
  static async abandon(root: ProjectWorkspaceFS, id: string, limits: MetadataLimits, databases: RestoreDatabasePorts) {
    return underWriteLease(root, async () => {
      const state = await reconcileRestoreDatabases(root, limits, () => databases.listGenerations()), job = state.jobs.find(j => j.id === id);
      if (!job || job.start || job.indexed || job.dbOpened || job.destinationFiles.length || state.databaseIds.includes(id) || state.selections.some(s => s.jobId === id)) fail('restore-abandon-denied');
      await writeRestoreControl(root, restoreJobPath(root, id, 'abandoned.json'), { schema: 'lociview-local-restore-abandoned-1', jobId: id, stage: 'beforeStart' }, limits);
      await readRestoreControls(root, limits);
    });
  }
}
