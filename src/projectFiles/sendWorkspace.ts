import type { ProjectWorkspaceFS } from '../platform/fs';
import type { MetadataProjectSession } from '../projectMetadata/session';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { MetadataLimits } from '../projectMetadata/format';
import { json } from '../projectMetadata/persistence';
import { WorkspaceOutputJob } from '../projectPackage/outputJob';
import { WorkspaceBaseStore } from '../projectPackage/workspaceBases';
import { workspaceFileOperation } from './receiveWorkspace';
import { fileError } from './validation';

export interface WorkspaceOutputState { id: string; token?: string; cancellable?: boolean; state: 'unstarted' | 'incomplete' | 'generated' | 'file-verified' | 'abandoned' | 'cancelled' | 'repair-required' }
/** Explicit same-Project output commands. Download handoff has no completion receipt. */
export class WorkspaceSender {
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly session: MetadataProjectSession,
    private readonly store: OriginBlobStore, private readonly limits: MetadataLimits, private readonly locks: LockManager | null) {}
  generate(token: string, signal?: AbortSignal) { return workspaceFileOperation(this.locks, () => this.session.createWorkspaceOutput(token, this.store, '0.0.1', signal)); }
  retry(id: string, signal?: AbortSignal) { return workspaceFileOperation(this.locks, () => this.session.resumeWorkspaceOutput(id, this.store, signal)); }
  cancel(id: string) { return workspaceFileOperation(this.locks, () => this.session.cancelWorkspaceOutput(id)); }
  verifyFile(id: string, file: Blob) { return workspaceFileOperation(this.locks, () => this.session.verifyWorkspaceOutput(id, file)); }
  download(id: string) {
    return workspaceFileOperation(this.locks, async () => {
      const job = await WorkspaceOutputJob.open(this.fs, id, this.limits);
      if (!(await job.steps()).some(s => s.detail.kind === 'baseRecorded')) return fileError('ファイル生成の続きを実行してください。');
      const records = await new WorkspaceBaseStore(this.fs, this.limits, job.source.proof).read();
      if (!records.some(r => json(r) === json(job.baseRecord()))) return fileError('受け渡しの記録を確認できません。');
      return (await job.artifact()).blob;
    });
  }
  async jobs(): Promise<WorkspaceOutputState[]> {
    const result: WorkspaceOutputState[] = [];
    let bases: ReturnType<WorkspaceBaseStore['read']> | undefined;
    for (const id of await WorkspaceOutputJob.ids(this.fs)) {
      try {
        const state = await WorkspaceOutputJob.state(this.fs, id, this.limits);
        if (state !== 'started') { result.push({ id, state, cancellable: state === 'unstarted' }); continue; }
        const job = await WorkspaceOutputJob.open(this.fs, id, this.limits), steps = await job.steps(), kinds = steps.map(s => s.detail.kind);
        if (kinds.includes('artifactVerified')) await job.artifactReceipt();
        await job.validateCompletion();
        if (kinds.includes('baseRecorded')) {
          const rows = await (bases ??= new WorkspaceBaseStore(this.fs, this.limits, job.source.proof).read());
          if (!rows.some(r => json(r) === json(job.baseRecord()))) throw Error('output-base-missing');
        }
        result.push({ id, token: job.source.token, cancellable: kinds.length === 0, state: kinds.includes('cancelled') ? 'cancelled' : kinds.includes('externalFileVerified') ? 'file-verified' :
          kinds.includes('baseRecorded') ? 'generated' : 'incomplete' });
      } catch { result.push({ id, state: 'repair-required' }); }
    }
    return result;
  }
}
