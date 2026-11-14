import type { ProjectWorkspaceFS, WorkspaceFS } from '../platform/fs';
import type { MetadataProjectSession } from '../projectMetadata/session';
import type { MetadataLimits } from '../projectMetadata/format';
import { WorkspaceReceiveJob } from '../projectPackage/receiveJob';
import { fileError } from './validation';
import { json } from '../projectMetadata/persistence';
import { OriginBlobStore } from '../projectMetadata/blobStore';
import { PACKAGE_LIMITS as L } from '../projectPackage/contract';
import { PackageArchive } from '../projectPackage/zipArchive';
import { PackageControlError } from '../projectPackage/manifest';
import { ContributionReceiveJob } from '../projectPackage/contributionReceiveJob';
import { CleanInputJob } from '../projectPackage/cleanInputJob';
import { receiveJobKeys, openReceiveJob, withReceiveJobDiscovery, type ReceiveJob } from '../projectPackage/receiveJobs';
import { reviewEditChildBinding, type ReviewEditBinding } from '../projectPackage/reviewEditControls';

export interface WorkspaceReceiveState { id: string; state: 'incomplete' | 'completed' | 'cancelled' | 'repair-required' | 'input-required' | 'unbound-input' | 'abandoned' | 'stale' }

export async function workspaceFileOperation<T>(locks: LockManager | null, action: () => Promise<T>): Promise<T> {
  if (!locks) return fileError('このブラウザではファイル処理を排他的に実行できません。');
  return locks.request('lociview:package-operation:v1', { mode: 'exclusive', ifAvailable: true }, lock => {
    if (!lock) return fileError('別のファイル処理が進行中です。完了後に再試行してください。'); return action();
  });
}

/** Actual file entry, isolated from ordinary home. No filename-derived purpose or direct storage edits. */
export class WorkspaceReceiver {
  private readonly store: OriginBlobStore;
  constructor(private readonly base: WorkspaceFS, private readonly fs: ProjectWorkspaceFS,
    private readonly session: MetadataProjectSession, private readonly limits: MetadataLimits, private readonly locks: LockManager | null) {
    this.store = new OriginBlobStore(base, { metadata: limits, maxBlobBytes: L.blobBytes, maxChunkBytes: L.chunkBytes, maxChunks: L.streamChunks }, locks);
  }
  private async key(id: string) {
    const found = (await receiveJobKeys(this.fs, this.limits)).find(k => k.id === id);
    if (!found) return fileError('受信データがありません。修復が必要です。'); return found;
  }
  private apply(token: string | null, job: ReceiveJob) {
    return job instanceof CleanInputJob ? this.session.initializeClean(job) : job instanceof ContributionReceiveJob ? this.session.receiveContribution(token, job) :
      job.importing ? this.session.importWorkspace(job) : this.session.receiveWorkspace(token, job);
  }
  private async operation<T>(action: () => Promise<T>): Promise<T> {
    return workspaceFileOperation(this.locks, action);
  }
  /** Initial file entry has no receiver token or synthetic bootstrap. */
  importWorkspace(file: Blob | PackageArchive) {
    return this.operation(async () => {
      const archive = file instanceof PackageArchive ? await file.reopenCapturedControl() : await PackageArchive.inspect(file);
      return archive.control.manifest.purpose === 'clean' ? this.session.initializeClean(await CleanInputJob.fromSelectedArchive(this.fs, archive, this.limits)) :
        this.session.importWorkspace(await WorkspaceReceiveJob.fromSelectedArchive(this.fs, archive, this.limits));
    });
  }
  receive(expectedToken: string, file: Blob | PackageArchive) {
    return this.operation(async () => {
      const archive = file instanceof PackageArchive ? await file.reopenCapturedControl() : await PackageArchive.inspect(file), purpose = archive.control.manifest.purpose;
      if (purpose === 'clean') return fileError('独立コピーはプロジェクト一覧の「ファイルを開く」から開いてください。現在の作業は変更していません。');
      let input: ReceiveJob;
      try { input = purpose === 'contribution' ? await ContributionReceiveJob.fromSelectedArchive(this.fs, archive, this.store, this.limits) :
        await WorkspaceReceiveJob.fromSelectedArchive(this.fs, archive, this.limits); }
      catch (error) {
        if (error instanceof PackageControlError && error.code === 'contribution-base-unavailable')
          return fileError('先に、この変更分の元になった作業一式を開いてください。元のデータは変更していません。');
        throw error;
      }
      const repeatedKey = await withReceiveJobDiscovery(this.fs, this.store, this.limits, async rows => {
        let matching: (typeof rows)[number]['key'] | undefined;
        for (const row of rows) {
          const observed = await row.read();
          if (observed.state === 'abandoned') continue;
          if (observed.state !== 'started') return fileError('中断した受信を確認してください。');
          if (!observed.kinds.some(kind => ['baseRecorded', 'contributionPublished', 'contributionAlreadyPresent', 'cleanPublished', 'cancelled'].includes(kind))) return fileError('未完了の受信を再開してください。');
          if (!observed.kinds.includes('cancelled') && observed.job.inspection.archive.sha256 === input.inspection.archive.sha256) matching = row.key;
        }
        return matching;
      });
      const repeated = repeatedKey ? await openReceiveJob(this.fs, repeatedKey, this.store, this.limits) : undefined;
      if (repeated instanceof WorkspaceReceiveJob && repeated.importing) {
        const current = await this.session.read();
        if (current.state !== 'ready' || current.source?.token !== expectedToken) return fileError('入力・更新を確定してから受信してください。');
        return this.session.importWorkspace(repeated);
      }
      return this.apply(expectedToken, repeated ?? input);
    });
  }
  retry(id: string) {
    return this.operation(async () => {
      return this.apply(null, await openReceiveJob(this.fs, await this.key(id), this.store, this.limits));
    });
  }
  cancelStale(id: string) {
    return this.operation(async () => {
      const job = await openReceiveJob(this.fs, await this.key(id), this.store, this.limits);
      if (job instanceof CleanInputJob) return fileError('開始したコピーの読み込みは取り消せません。元の入力から再開してください。');
      return job instanceof ContributionReceiveJob ? this.session.cancelContributionReceive(job) : this.session.cancelWorkspaceReceive(job);
    });
  }
  reselectInput(expectedToken: string, id: string, file: Blob) {
    return this.operation(async () => this.apply(expectedToken, (await this.key(id)).kind === 'contribution' ?
      await ContributionReceiveJob.reselect(this.fs, id, file, this.store, this.limits) : await WorkspaceReceiveJob.reselect(this.fs, id, file, this.limits)));
  }
  reselectImportedInput(id: string, file: Blob) {
    return this.operation(async () => (await this.key(id)).kind === 'clean' ?
      this.session.initializeClean(await CleanInputJob.reselect(this.fs, id, file, this.limits)) : this.session.importWorkspace(await WorkspaceReceiveJob.reselect(this.fs, id, file, this.limits)));
  }
  abandonInput(id: string) {
    return this.operation(async () => { const key = await this.key(id); return key.kind === 'clean' ? this.session.abandonCleanInput(id) :
      key.kind === 'contribution' ? this.session.abandonContributionInput(id) : this.session.abandonWorkspaceInput(id); });
  }
  async jobs(options: { completedReviewChildren?: ReadonlyMap<string, Readonly<ReviewEditBinding>> } = {}) {
    if ((options.completedReviewChildren?.size ?? 0) > L.entryCount) return fileError('受信記録が検査の上限を超えています。');
    // One display reload only. No command or recovery consumes this observation.
    const completed = new Map([...options.completedReviewChildren ?? []].map(([id, binding]) => [id, structuredClone(binding)]));
    const result: WorkspaceReceiveState[] = [];
    // The journal is also an authority: a deleted input directory must not hide its import.
    await withReceiveJobDiscovery(this.fs, this.store, this.limits, async (rows, entries) => {
    for (const row of rows) {
      const { key } = row;
      const { id } = key;
      try {
        const observed = key.kind === 'clean' ? completed.get(id) : undefined;
        if (observed) {
          const binding = await reviewEditChildBinding(this.fs, id, this.limits).catch(() => undefined);
          if (binding && json(binding) === json(observed)) continue;
        }
        const observedJob = await row.read();
        if (observedJob.state !== 'started') { result.push({ id, state: observedJob.state }); continue; }
        const { job, kinds } = observedJob;
        const stale = job.start && 'receiver' in job.start && !kinds.length && !entries.some(e => e.start.transactionId === id) &&
          json((await this.session.read()).source?.heads) !== json(job.start.receiver.heads);
        const cancelled = kinds.includes('cancelled');
        if (cancelled && entries.some(e => e.start.transactionId === id)) throw Error('取りやめた受信の履歴を確認してください。');
        result.push({ id, state: cancelled ? 'cancelled' : kinds.some(kind => ['baseRecorded', 'contributionPublished', 'contributionAlreadyPresent', 'cleanPublished'].includes(kind)) ? 'completed' : stale ? 'stale' : 'incomplete' });
      } catch { result.push({ id, state: 'repair-required' }); }
    }
    });
    return result;
  }
}
