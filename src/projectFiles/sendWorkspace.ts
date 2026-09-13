import type { ProjectWorkspaceFS } from '../platform/fs';
import type { MetadataProjectSession } from '../projectMetadata/session';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { MetadataLimits } from '../projectMetadata/format';
import { json } from '../projectMetadata/persistence';
import { WorkspaceOutputJob } from '../projectPackage/outputJob';
import { ContributionOutputJob } from '../projectPackage/contributionOutputJob';
import { outputJobKeys, outputJobClass, openOutputJob, validateOutputProtection } from '../projectPackage/outputJobs';
import { VerifiedContributionBase, type ContributionBaseSelection } from '../projectPackage/contributionSource';
import { WorkspaceBaseStore } from '../projectPackage/workspaceBases';
import { workspaceFileOperation } from './receiveWorkspace';
import { fileError } from './validation';

export interface WorkspaceOutputState { id: string; purpose: 'teamWorkspace' | 'contribution'; token?: string; cancellable?: boolean; state: 'unstarted' | 'incomplete' | 'generated' | 'file-verified' | 'abandoned' | 'cancelled' | 'repair-required' }
export interface ContributionBaseChoice { selection: ContributionBaseSelection; label: string }
/** Explicit same-Project output commands. Download handoff has no completion receipt. */
export class WorkspaceSender {
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly session: MetadataProjectSession,
    private readonly store: OriginBlobStore, private readonly limits: MetadataLimits, private readonly locks: LockManager | null) {}
  generate(token: string, signal?: AbortSignal) { return workspaceFileOperation(this.locks, () => this.session.createWorkspaceOutput(token, this.store, '0.0.1', signal)); }
  generateContribution(token: string, selection: ContributionBaseSelection, signal?: AbortSignal) {
    const owned = structuredClone(selection);
    return workspaceFileOperation(this.locks, () => this.session.createContributionOutput(token, owned, this.store, '0.0.1', signal));
  }
  private async key(id: string) {
    const key = (await outputJobKeys(this.fs)).find(k => k.id === id);
    if (!key) return fileError('生成データを確認できません。'); return key;
  }
  retry(id: string, signal?: AbortSignal) { return workspaceFileOperation(this.locks, async () => (await this.key(id)).kind === 'workspace' ?
    this.session.resumeWorkspaceOutput(id, this.store, signal) : this.session.resumeContributionOutput(id, this.store, signal)); }
  cancel(id: string) { return workspaceFileOperation(this.locks, async () => (await this.key(id)).kind === 'workspace' ?
    this.session.cancelWorkspaceOutput(id) : this.session.cancelContributionOutput(id)); }
  verifyFile(id: string, file: Blob) { return workspaceFileOperation(this.locks, async () => (await this.key(id)).kind === 'workspace' ?
    this.session.verifyWorkspaceOutput(id, file) : this.session.verifyContributionOutput(id, file, this.store)); }
  async availableBases(): Promise<ContributionBaseChoice[]> {
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
    return workspaceFileOperation(this.locks, async () => {
      const job = await openOutputJob(this.fs, await this.key(id), this.limits);
      if (job instanceof ContributionOutputJob) {
        await validateOutputProtection(this.fs, job, this.store, this.limits); return (await job.artifact(this.store)).blob;
      }
      if (!(await job.steps()).some(s => s.detail.kind === 'baseRecorded')) return fileError('ファイル生成の続きを実行してください。');
      const records = await new WorkspaceBaseStore(this.fs, this.limits, job.source.proof).read();
      if (!records.some(r => json(r) === json(job.baseRecord()))) return fileError('受け渡しの記録を確認できません。');
      return (await job.artifact()).blob;
    });
  }
  async jobs(): Promise<WorkspaceOutputState[]> {
    const result: WorkspaceOutputState[] = [];
    let bases: ReturnType<WorkspaceBaseStore['read']> | undefined;
    for (const key of await outputJobKeys(this.fs)) {
      const { id } = key, purpose = key.kind === 'workspace' ? 'teamWorkspace' as const : 'contribution' as const;
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
        result.push({ id, purpose, token: job.source.token, cancellable: kinds.length === 0, state: kinds.includes('cancelled') ? 'cancelled' : kinds.includes('externalFileVerified') ? 'file-verified' :
          kinds.includes(key.kind === 'workspace' ? 'baseRecorded' : 'artifactVerified') ? 'generated' : 'incomplete' });
      } catch { result.push({ id, purpose, state: 'repair-required' }); }
    }
    return result;
  }
}
