import type { ProjectWorkspaceFS } from '../platform/fs';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { checkLimits, fail, type MetadataLimits } from '../projectMetadata/format';
import { openWorkspaceGeneration, type GenerationStorageOpener } from '../projectMetadata/generationScope';
import { newId, underWriteLease } from '../projectMetadata/persistence';
import type { MetadataProjectSession } from '../projectMetadata/session';
import { TransactionJournal } from '../projectMetadata/journal';
import { MetadataRepository, type MetadataStorageFactory } from '../projectMetadata/repository';
import type { BackupRestoreInput } from '../projectMetadata/packageRemote';
import { packageByteHash } from './manifest';
import { BackupArchive } from './backupArchive';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { WorkspaceBaseStore } from './workspaceBases';
import { receiveJobKeys, receiveInputState, openReceiveJob, receiveTerminal } from './receiveJobs';
import { outputJobKeys, outputJobClass, openOutputJob, outputTerminal } from './outputJobs';
import { checkAbort } from './zipChecks';
import { checkRestoreCurrent, readRestoreControls, reconcileRestoreDatabases, reserveRestoreControls, writeRestoreControl, restoreEqual, restoreJobPath, restoreRef, restoreRoot,
  type RestoreCurrent, type RestorePrepared, type RestoreStart, type RestoreControlJob, type GenerationSelection } from './restoreControls';

/** Existing ready service, not UI-supplied heads or a filename-based Project identity. */
export interface RestoreSourcePorts {
  readonly fs: ProjectWorkspaceFS;
  readonly session: Pick<MetadataProjectSession, 'read'>;
  readonly store: Pick<OriginBlobStore, 'inspect' | 'openReadOnly'>;
  readonly factory?: MetadataStorageFactory;
}
export interface RestoreDatabasePorts {
  /** Enumerate only this logical Project's dedicated generation DB IDs; failure must reject. */
  listGenerations(): Promise<string[]>;
  open: GenerationStorageOpener;
}
const evidence = ({ sha256, byteLength }: EvidenceRef): EvidenceRef => ({ sha256, byteLength });
const terminal = (job: RestoreControlJob) => job.abandoned || job.result !== null;

/** Root-owned restore. All generation changes retain the same Project identity and logical lease. */
export class BackupRestoreJob {
  private warmCreate = false;
  private scopes = new WeakMap<ProjectWorkspaceFS, { factory: MetadataStorageFactory; check: () => Promise<void> }>();
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
    state: Awaited<ReturnType<typeof readRestoreControls>>, ownPending?: string): Promise<RestoreCurrent> {
    if (state.pending && state.pending.id !== ownPending || state.tail && !state.jobs.find(j => j.id === state.tail!.jobId)?.result)
      return fail('restore-pending');
    const generationId = state.tail?.jobId ?? null, expectedRoot = generationId === null ? root.projectRoot : `${restoreRoot(root)}v2/generations/${generationId}`;
    if (ports.fs.mutationAuthority !== root.mutationAuthority || ports.fs.projectRoot !== expectedRoot) fail('restore-current-scope');
    if (state.tail) {
      const job = state.jobs.find(j => j.id === state.tail!.jobId)!;
      if (!ports.factory) return fail('restore-destination-verification-required');
      await this.verifyDestination(root, ports, ports.factory, job, limits, state.tail);
    }
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
    const current: RestoreCurrent = { generationId, publicationId: before.publication, publication: restoreRef(publication),
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
        opening = false; checkAbort(signal); await scope.check();
        this.scopes.set(scope.fs, { factory: scope.factory, check: scope.check }); return scope;
      } catch (error) { await scope.dispose().catch(() => {}); throw error; }
    });
  }
  async assertStaging(fs: ProjectWorkspaceFS, factory: MetadataStorageFactory) {
    const scope = this.scopes.get(fs);
    if (!scope || scope.factory !== factory) return fail('restore-staging-owner'); await scope.check();
  }
  /** Reinspect owned disk bytes, not caller fields; binds the exact FS and DB capability pair. */
  async initialization(fs: ProjectWorkspaceFS, factory: MetadataStorageFactory) {
    await this.assertStaging(fs, factory);
    const inspection = await BackupRestoreJob.inspectInput(this.root, this.id, this.descriptor(), this.limits);
    const archive = inspection.archive, m = archive.control.manifest; if (m.purpose !== 'backup') return fail('restore-purpose');
    const bytes = await archive.entryBytes('metadata.am', L.sourceBytes), manifestBytes = await archive.entryBytes('manifest.json', L.controlBytes),
      checksumBytes = await archive.entryBytes('manifest.sha256', 64), protectedInventoryBytes = await archive.entryBytes('protected-inventory.json', L.controlBytes),
      exchangeBasesBytes = await archive.entryBytes('exchange-bases.json', L.controlBytes), baseEvidenceBytes: Uint8Array[] = [];
    for (const r of m.baseEvidence) baseEvidenceBytes.push(await archive.entryBytes(`base-evidence/sha256/${r.sha256}`, L.sourceBytes));
    const input: BackupRestoreInput = { bytes, manifestBytes, checksumBytes, protectedInventoryBytes, exchangeBasesBytes, baseEvidenceBytes,
      proof: { version: 'lociview-package-backup-restore-1', source: { kind: 'fullBackup', packageId: m.packageId,
        manifest: { sha256: packageByteHash(manifestBytes), byteLength: manifestBytes.length }, checksum: { sha256: packageByteHash(checksumBytes), byteLength: 64 },
        metadata: evidence(m.metadata), protectedInventory: evidence(m.protectedInventory), exchangeBases: evidence(m.exchangeBases), baseEvidence: m.baseEvidence.map(evidence),
        metadataEnvelope: m.metadataEnvelope, remoteHeads: [...m.targetHeads] }, expectedFinalHeads: [...m.targetHeads] } };
    await this.assertStaging(fs, factory); return { inspection, input };
  }
  inventory(): JsonObject[] { return this.inspection.description.bodyRefs.map(r => ({ ...r })); }
  private static async verifyDestination(root: ProjectWorkspaceFS, ports: RestoreSourcePorts, factory: MetadataStorageFactory, job: RestoreControlJob,
    limits: MetadataLimits, selected?: GenerationSelection) {
    if (!job.prepared) return fail('restore-destination-job');
    // Selection must not acknowledge a destination whose retained recovery archive is already corrupt.
    await this.inspectInput(root, job.id, job.prepared, limits);
    const restored = await new TransactionJournal(ports.fs, limits).readRestoredBases();
    if (!job.prepared || !job.start || !job.dbOpened || !restored || restored.entry.start.transactionId !== job.id ||
      !restoreEqual(restored.entry.start.proof, job.start.current.source.proof)) return fail('restore-destination-journal');
    const original = restored.input.proof.source;
    for (const key of ['manifest', 'metadata', 'protectedInventory', 'exchangeBases', 'baseEvidence'] as const)
      if (!restoreEqual(original[key], job.prepared[key])) fail('restore-destination-originals');
    const destination = { journal: restoreRef(restored.entry.prepared), publication: restoreRef(restored.entry.publication), baseBinding: restoreRef(restored.binding) };
    if (selected && !restoreEqual(destination, selected.destination)) fail('restore-destination-binding');
    const read = await ports.session.read();
    if (read.state !== 'ready' || !read.source || !read.publication || read.provider?.kind !== 'scene-provider' ||
      read.provider.token !== read.source.token) return fail('restore-destination-not-ready');
    const saved = await new MetadataRepository(ports.fs, factory, limits).read(restored.entry.start.repositoryId, restored.source.proof, read.source.heads);
    if (saved?.token !== read.source.token) return fail('restore-destination-database');
    for (const ref of restored.description.bodyRefs) {
      const file = await ports.store.openReadOnly(ref), reader = file.stream().getReader();
      try { while (!(await reader.read()).done) { /* verified stream, no body accumulation */ } }
      finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
    }
    await new WorkspaceBaseStore(ports.fs, limits, restored.source.proof).snapshot();
    return { destination, read };
  }
  /** Resolve existing selected data only. Read permission survives a pending restore; ordinary writes do not. */
  static async openSelected(root: ProjectWorkspaceFS, limits: MetadataLimits, databases: RestoreDatabasePorts,
    createPorts: (scope: Awaited<ReturnType<typeof openWorkspaceGeneration>>) => RestoreSourcePorts) {
    const state = await reconcileRestoreDatabases(root, limits, () => databases.listGenerations()), selected = state.selection,
      generationId = state.tail?.jobId ?? null;
    const checkSelected = async () => {
      const next = await readRestoreControls(root, limits);
      if (!restoreEqual(next.selection, selected)) fail('restore-generation-retired'); return next;
    };
    const scope = await openWorkspaceGeneration(root, { generationId, allowCreate: false, auditReadOperations: true,
      assertSelected: async () => { await checkSelected(); },
      assertWritable: async () => { const next = await checkSelected();
        if (next.pending || next.tail && !next.jobs.find(j => j.id === next.tail!.jobId)?.result) fail('restore-pending'); } }, databases.open);
    try {
      const ports = createPorts(scope);
      if (ports.fs !== scope.fs || ports.factory !== scope.factory) fail('restore-selected-scope');
      if (state.tail) {
        const job = state.jobs.find(j => j.id === generationId)!;
        if (!job.prepared) return fail('restore-destination-job');
        await this.verifyDestination(root, ports, scope.factory, job, limits, state.tail);
      }
      await scope.check(); return { ...scope, ports, selection: selected, pending: state.pending };
    } catch (error) { await scope.dispose().catch(() => {}); throw error; }
  }
  /** One authoritative switch. An already retained switch is completed, never rewritten or rolled back. */
  async select(current: RestoreSourcePorts, destination: RestoreSourcePorts & { factory: MetadataStorageFactory }, databases: RestoreDatabasePorts,
    createSelectedPorts: (scope: Awaited<ReturnType<typeof openWorkspaceGeneration>>) => RestoreSourcePorts) {
    return underWriteLease(this.root, async () => {
      let state: Awaited<ReturnType<typeof readRestoreControls>> = await reconcileRestoreDatabases(this.root, this.limits, () => databases.listGenerations());
      const selected = state.selections.find(s => s.jobId === this.id), job = state.jobs.find(j => j.id === this.id);
      if (!this.start || !job?.start || !restoreEqual(job.start, this.start)) return fail('restore-selection-job');
      if (selected) {
        if (state.tail !== selected) return fail('restore-generation-retired');
        const reopened = await BackupRestoreJob.openSelected(this.root, this.limits, databases, createSelectedPorts);
        await reopened.dispose();
      } else {
        await this.assertStaging(destination.fs, destination.factory);
        if (!restoreEqual(state.selection, this.previousSelection)) return fail('restore-confirmation-stale');
        const now = await BackupRestoreJob.current(this.root, current, this.limits, state, this.id);
        if (!restoreEqual(now, this.current)) return fail('restore-confirmation-stale');
        const verified = await BackupRestoreJob.verifyDestination(this.root, destination, destination.factory, job, this.limits);
        // Recheck source and selection after streamed destination verification, inside the same root queue.
        state = await readRestoreControls(this.root, this.limits);
        if (state.pending?.id !== this.id || !restoreEqual(state.selection, this.previousSelection) ||
          !restoreEqual(await BackupRestoreJob.current(this.root, current, this.limits, state, this.id), this.current)) fail('restore-confirmation-stale');
        const selection: GenerationSelection = { schema: 'lociview-local-generation-selection-1', jobId: this.id,
          previous: this.previousSelection, start: restoreRef(this.start), destination: verified.destination };
        await writeRestoreControl(this.root, `${restoreRoot(this.root)}v2/local-restore/selections/${restoreRef(selection).sha256}.json`, selection, this.limits);
      }
      state = await readRestoreControls(this.root, this.limits);
      if (state.tail?.jobId !== this.id) return fail('restore-selection-readback');
      await this.write('result.json', { schema: 'lociview-local-restore-result-1', jobId: this.id, start: restoreRef(this.start),
        detail: { kind: 'selected', selection: state.selection } });
      return state.selection!;
    });
  }
  static async resumeSelection(root: ProjectWorkspaceFS, limits: MetadataLimits, databases: RestoreDatabasePorts,
    createPorts: (scope: Awaited<ReturnType<typeof openWorkspaceGeneration>>) => RestoreSourcePorts) {
    return underWriteLease(root, async () => {
      const scope = await this.openSelected(root, limits, databases, createPorts);
      try {
        const state = await readRestoreControls(root, limits), job = state.jobs.find(j => j.id === state.tail?.jobId);
        if (!job?.start || !state.tail || !restoreEqual(scope.selection, state.selection)) return fail('restore-selection-readback');
        await writeRestoreControl(root, restoreJobPath(root, job.id, 'result.json'), {
          schema: 'lociview-local-restore-result-1', jobId: job.id, start: restoreRef(job.start),
          detail: { kind: 'selected', selection: state.selection } }, limits);
        return state.selection!;
      } finally { await scope.dispose(); }
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
