import type { ProjectWorkspaceFS, WorkspaceFS } from '../platform/fs';
import type { MetadataProjectSession } from '../projectMetadata/session';
import type { MetadataLimits } from '../projectMetadata/format';
import { WorkspaceReceiveJob } from '../projectPackage/receiveJob';
import { fileError } from './validation';

/** Actual file entry, isolated from ordinary home. No filename-derived purpose or direct storage edits. */
export class WorkspaceReceiver {
  constructor(private readonly base: WorkspaceFS, private readonly fs: ProjectWorkspaceFS,
    private readonly session: MetadataProjectSession, private readonly limits: MetadataLimits, private readonly locks: LockManager | null) {}
  private async operation<T>(action: () => Promise<T>): Promise<T> {
    if (!this.locks) return fileError('このブラウザではファイル処理を排他的に実行できません。');
    // Await the native request itself: its completion also releases the operation slot.
    return this.locks.request('lociview:package-operation:v1', { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) return fileError('別のファイル処理が進行中です。完了後に再試行してください。');
      return action();
    });
  }
  receive(expectedToken: string, file: Blob) {
    return this.operation(async () => {
      const input = await WorkspaceReceiveJob.prepare(this.fs, file, this.limits);
      let repeated: WorkspaceReceiveJob | undefined;
      for (const id of await WorkspaceReceiveJob.ids(this.fs)) {
        const job = await WorkspaceReceiveJob.open(this.fs, id, this.limits), steps = await job.steps();
        if (!steps.some(s => s.detail.kind === 'baseRecorded' || s.detail.kind === 'cancelled')) return fileError('未完了の受信を再開してください。');
        if (steps.some(s => s.detail.kind === 'baseRecorded') && job.inspection.archive.sha256 === input.inspection.archive.sha256)
          repeated = job;
      }
      return this.session.receiveWorkspace(expectedToken, repeated ?? input);
    });
  }
  retry(id: string) {
    return this.operation(async () => this.session.receiveWorkspace(null, await WorkspaceReceiveJob.open(this.fs, id, this.limits)));
  }
  cancelStale(id: string) {
    return this.operation(async () => this.session.cancelWorkspaceReceive(await WorkspaceReceiveJob.open(this.fs, id, this.limits)));
  }
  async jobs() {
    const result: { id: string; state: 'incomplete' | 'completed' | 'cancelled' | 'repair-required' }[] = [];
    for (const id of await WorkspaceReceiveJob.ids(this.fs)) {
      try {
        const job = await WorkspaceReceiveJob.open(this.fs, id, this.limits), steps = await job.steps();
        await job.validateCompletion();
        result.push({ id, state: steps.some(s => s.detail.kind === 'baseRecorded') ? 'completed' :
          steps.some(s => s.detail.kind === 'cancelled') ? 'cancelled' : 'incomplete' });
      } catch { result.push({ id, state: 'repair-required' }); }
    }
    return result;
  }
}
