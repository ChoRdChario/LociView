import type { ProjectWorkspaceFS } from '../platform/fs';
import type { MetadataProjectSession } from '../projectMetadata/session';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { MetadataLimits } from '../projectMetadata/format';
import { json, withMetadataRead } from '../projectMetadata/persistence';
import { WorkspaceOutputJob } from '../projectPackage/outputJob';
import { ContributionOutputJob } from '../projectPackage/contributionOutputJob';
import { BackupOutputJob } from '../projectPackage/backupOutputJob';
import { CleanOutputJob } from '../projectPackage/cleanOutputJob';
import { ReviewOutputJob } from '../projectPackage/reviewOutputJob';
import type { ReviewSelectionOptions } from '../projectPackage/reviewSelection';
import { protectedWorkspaceInventory } from '../projectPackage/protectedInventory';
import { PACKAGE_LIMITS as L } from '../projectPackage/contract';
import { outputJobKeys, outputJobClass, openOutputJob, validateOutputProtection } from '../projectPackage/outputJobs';
import { VerifiedContributionBase, type ContributionBaseSelection } from '../projectPackage/contributionSource';
import { WorkspaceBaseStore } from '../projectPackage/workspaceBases';
import { workspaceFileOperation } from './receiveWorkspace';
import { fileError } from './validation';

export interface WorkspaceOutputState { id: string; purpose: 'teamWorkspace' | 'contribution' | 'backup' | 'clean' | 'review'; label?: string; stale?: boolean; token?: string; cancellable?: boolean; state: 'unstarted' | 'incomplete' | 'generated' | 'file-verified' | 'abandoned' | 'cancelled' | 'repair-required' }
export interface ContributionBaseChoice { selection: ContributionBaseSelection; label: string }
/** Explicit same-Project output commands. Download handoff has no completion receipt. */
export class WorkspaceSender {
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly session: MetadataProjectSession,
    private readonly store: OriginBlobStore, private readonly limits: MetadataLimits, private readonly locks: LockManager | null) {}
  generate(token: string, signal?: AbortSignal) { return workspaceFileOperation(this.locks, () => this.session.createWorkspaceOutput(token, this.store, '0.0.1', signal)); }
  generateClean(token: string, signal?: AbortSignal) { return workspaceFileOperation(this.locks, () => this.session.createCleanOutput(token, this.store, '0.0.1', signal)); }
  previewClean(token: string) { return this.session.previewCleanOutput(token); }
  generateReview(token: string, selection: ReviewSelectionOptions, signal?: AbortSignal) { return workspaceFileOperation(this.locks, () => this.session.createReviewOutput(token, selection, this.store, '0.0.1', signal)); }
  previewReview(token: string, selection: ReviewSelectionOptions) { return this.session.previewReviewOutput(token, selection); }
  generateBackup(token: string, label?: string, signal?: AbortSignal) {
    return workspaceFileOperation(this.locks, () => this.session.createManualCheckpoint(token, label, this.store, '0.0.1', signal));
  }
  generateContribution(token: string, selection: ContributionBaseSelection, signal?: AbortSignal) {
    const owned = structuredClone(selection);
    return workspaceFileOperation(this.locks, () => this.session.createContributionOutput(token, owned, this.store, '0.0.1', signal));
  }
  private async key(id: string) {
    const key = (await outputJobKeys(this.fs)).find(k => k.id === id);
    if (!key) return fileError('生成データを確認できません。'); return key;
  }
  retry(id: string, signal?: AbortSignal) { return workspaceFileOperation(this.locks, async () => {
    const key = await this.key(id); return key.kind === 'workspace' ? this.session.resumeWorkspaceOutput(id, this.store, signal) :
      key.kind === 'clean' ? this.session.resumeCleanOutput(id, this.store, signal) :
      key.kind === 'review' ? this.session.resumeReviewOutput(id, this.store, signal) :
      key.kind === 'backup' ? this.session.resumeBackupOutput(id, this.store, signal) : this.session.resumeContributionOutput(id, this.store, signal);
  }); }
  cancel(id: string) { return workspaceFileOperation(this.locks, async () => {
    const key = await this.key(id); return key.kind === 'workspace' ? this.session.cancelWorkspaceOutput(id) :
      key.kind === 'clean' ? this.session.cancelCleanOutput(id) :
      key.kind === 'review' ? this.session.cancelReviewOutput(id) :
      key.kind === 'backup' ? this.session.cancelBackupOutput(id) : this.session.cancelContributionOutput(id);
  }); }
  verifyFile(id: string, file: Blob) { return workspaceFileOperation(this.locks, async () => {
    const key = await this.key(id); return key.kind === 'workspace' ? this.session.verifyWorkspaceOutput(id, file) :
      key.kind === 'clean' ? this.session.verifyCleanOutput(id, file, this.store) :
      key.kind === 'review' ? this.session.verifyReviewOutput(id, file, this.store) :
      key.kind === 'backup' ? this.session.verifyBackupOutput(id, file, this.store) : this.session.verifyContributionOutput(id, file, this.store);
  }); }
  async availableBases(): Promise<ContributionBaseChoice[]> {
    return withMetadataRead(this.fs, undefined, ({ fs }) =>
      new WorkspaceSender(fs, this.session, this.store, this.limits, this.locks).availableBasesDirect());
  }
  private async availableBasesDirect(): Promise<ContributionBaseChoice[]> {
    const read = await this.session.read(); if (read.state !== 'ready' || !read.source) return [];
    const bases = new WorkspaceBaseStore(this.fs, this.limits, read.source.proof), rows = await bases.read();
    const choices: ContributionBaseChoice[] = [];
    for (const [i, r] of rows.entries()) {
      const selection = { workspacePackageId: r.workspacePackageId, workspaceManifestSha256: r.workspaceManifestSha256, heads: [...r.declaredHeads] };
      const base = await VerifiedContributionBase.select(bases, selection, this.store, this.limits);
      choices.push({ selection, label: `作業一式 ${i + 1}（${r.completions.some(c => c.observation === 'imported') ? '受信' : '作成'}・変更 ${base.source.originalChanges().length} 件）` });
    }
    return choices;
  }
  download(id: string) {
    return workspaceFileOperation(this.locks, () => withMetadataRead(this.fs, undefined, ({ fs }) =>
      new WorkspaceSender(fs, this.session, this.store, this.limits, this.locks).downloadDirect(id)));
  }
  private async downloadDirect(id: string) {
      const job = await openOutputJob(this.fs, await this.key(id), this.limits);
      if (job instanceof BackupOutputJob || job instanceof CleanOutputJob || job instanceof ReviewOutputJob) {
        await validateOutputProtection(this.fs, job, this.store, this.limits); return (await job.artifact()).blob;
      }
      if (job instanceof ContributionOutputJob) {
        await validateOutputProtection(this.fs, job, this.store, this.limits); return (await job.artifact(this.store)).blob;
      }
      if (!(await job.steps()).some(s => s.detail.kind === 'baseRecorded')) return fileError('ファイル生成の続きを実行してください。');
      const records = await new WorkspaceBaseStore(this.fs, this.limits, job.source.proof).read();
      if (!records.some(r => json(r) === json(job.baseRecord()))) return fileError('受け渡しの記録を確認できません。');
      return (await job.artifact()).blob;
  }
  async jobs(): Promise<WorkspaceOutputState[]> {
    return withMetadataRead(this.fs, undefined, ({ fs }) =>
      new WorkspaceSender(fs, this.session, this.store, this.limits, this.locks).jobsDirect());
  }
  private async jobsDirect(): Promise<WorkspaceOutputState[]> {
    const result: WorkspaceOutputState[] = [];
    let bases: ReturnType<WorkspaceBaseStore['read']> | undefined;
    for (const key of await outputJobKeys(this.fs)) {
      const { id } = key, purpose = key.kind === 'workspace' ? 'teamWorkspace' as const : key.kind;
      try {
        const state = await outputJobClass(key).state(this.fs, id, this.limits);
        if (state !== 'started') { result.push({ id, purpose, state, cancellable: state === 'unstarted' }); continue; }
        const job = await openOutputJob(this.fs, key, this.limits), steps = await job.steps(), kinds: string[] = steps.map(s => s.detail.kind);
        if (kinds.includes('artifactVerified')) await job.artifactReceipt();
        await job.validateCompletion();
        if (job instanceof WorkspaceOutputJob && kinds.includes('baseRecorded')) {
          const rows = await (bases ??= new WorkspaceBaseStore(this.fs, this.limits, job.source.proof).read());
          if (!rows.some(r => json(r) === json(job.baseRecord()))) throw Error('output-base-missing');
        }
        let extra: { label?: string; stale?: boolean } = {};
        if (job instanceof BackupOutputJob) {
          await validateOutputProtection(this.fs, job, this.store, this.limits);
          const current = await this.session.read(); if (!current.source) throw Error('output-source-missing');
          const currentBases = new WorkspaceBaseStore(this.fs, this.limits, current.source.proof), snapshot = await currentBases.snapshot();
          const inspection = await current.source.inspectOriginal({ maxNodes: L.inspectionNodes, maxWork: L.inspectionWork });
          const inventory = protectedWorkspaceInventory(inspection.candidates, await currentBases.payloads(snapshot.records));
          extra = { label: job.label, stale: current.source.token !== job.source.token || json(snapshot) !== json(job.frozenBases()) || json(inventory) !== json(job.frozenInventory()) };
        }
        result.push({ id, purpose, ...extra, token: job.source.token, cancellable: kinds.length === 0, state: kinds.includes('cancelled') ? 'cancelled' : kinds.includes('externalFileVerified') ? 'file-verified' :
          kinds.includes(key.kind === 'workspace' ? 'baseRecorded' : 'artifactVerified') ? 'generated' : 'incomplete' });
      } catch { result.push({ id, purpose, state: 'repair-required' }); }
    }
    return result;
  }
}
