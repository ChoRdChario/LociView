import type { WorkspaceFS } from '../../platform/fs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { MetadataProjectSession, type MetadataSessionRead } from '../../projectMetadata/session';
import type { MetadataStorageFactory } from '../../projectMetadata/repository';
import { technicalId, underWriteLease } from '../../projectMetadata/persistence';
import { TransactionJournal } from '../../projectMetadata/journal';
import { createMetadataFixture, metadataFixtureLimits as limits, metadataProjectView } from './metadataFixture';
import { MetadataFixtureContent, readMetadataSeed, writeMetadataSeed } from './metadataStorage';
import type { SyntheticAuthority } from './historyProjection';
import { metadataIntent } from './metadataIntent';

export const metadataArea = 'lociview-development-metadata-1';
export interface MetadataHostOptions {
  run: string; create: boolean; base: WorkspaceFS; coordinator: ProjectMutationCoordinator;
  openStorage(allowCreate: boolean): Promise<{ factory: MetadataStorageFactory; dispose(): Promise<void> }>;
}
export async function openMetadataHost(options: MetadataHostOptions) {
  const run = technicalId(options.run), root = `${metadataArea}/${run}`;
  const lease = await options.coordinator.tryAcquire(options.base, root, `${metadataArea}:${run}`), fs = lease.workspace;
  let connection: Awaited<ReturnType<MetadataHostOptions['openStorage']>> | undefined;
  try {
    const existing = await options.base.list(`${root}/`), fresh = existing.length === 0;
    if (fresh && (!options.create || !lease.holdsWriteLock)) throw Error('保存データがありません。元のリンクを確認してください。');
    if (fresh) {
      lease.activateNewProject();
      await underWriteLease(fs, () => writeMetadataSeed(fs, createMetadataFixture(run)));
    }
    const seed = await readMetadataSeed(fs), journal = new TransactionJournal(fs, limits);
    if (seed.proof.identity.projectId !== `prj_${run}`) throw Error('保存領域とプロジェクトが一致しません。');
    const entries = await journal.entries();
    // Only a known, unpublished initialization can create its isolated database.
    connection = await options.openStorage(lease.holdsWriteLock && entries.length === 0);
    const content = new MetadataFixtureContent(fs), service = new MetadataProjectSession(fs, connection.factory, limits, allow => content.verifier(allow));
    let last = await service.read(), busy = false, closed = false, failure = '';
    if (last.state === 'repair-required') throw Error('保存内容を確認できません。データは保持しています。');
    if (!fresh && lease.holdsWriteLock) lease.activateAfterDurableReload();
    let operation: Promise<unknown> | undefined;
    const execute = async <T>(action: () => Promise<T>): Promise<T> => {
      if (closed || busy) throw Error('処理が完了するまでお待ちください。');
      busy = true; failure = '';
      const work = action(); operation = work;
      try { const result = await work; if (closed) throw Error('画面を閉じました。保存結果は再度開いて確認してください。'); return result; }
      catch { failure = '保存を完了できません。変更を保持しています。再試行してください。'; throw Error(failure); }
      finally { busy = false; if (operation === work) operation = undefined; }
    };
    const ready = (read: MetadataSessionRead) => {
      last = read;
      if (read.state !== 'ready' || !read.provider) throw Error('未完了の保存があります。元の変更から復旧してください。');
      return metadataProjectView(read.provider);
    };
    const initialize = async () => {
      await underWriteLease(fs, () => content.prepare());
      return ready(await service.createFromSource(seed));
    };
    if (last.state === 'empty' && options.create && lease.holdsWriteLock) {
      try { await execute(initialize); } catch { last = await service.read(); }
    }
    const authority: SyntheticAuthority = {
      storage: 'saved-development', writeScope: 'caption-text',
      capabilities: { pins: true, membership: true, color: true, views: true, materials: true },
      get readOnly() { return fs.mutationAuthority.accessState !== 'editable' || closed; },
      read: () => { if (!last.provider) throw Error('保存した画面はまだありません。'); return metadataProjectView(last.provider); },
      status: () => ({ kind: busy ? 'checking' : failure || last.state !== 'ready' ? 'failed' : 'idle', error: failure || '未完了の保存があります。' }),
      write: (token, changes, context) => execute(async () => {
        if (authority.readOnly) throw Error('このタブは閲覧専用です。');
        return ready(await service.edit(token, metadataIntent(changes, authority.read(), context)));
      }),
      retry: () => execute(async () => {
        if (authority.readOnly) throw Error('このタブは閲覧専用です。');
        const before = await service.read();
        if (before.state === 'empty') return initialize();
        return ready(await service.retry());
      }),
    };
    return {
      authority, content, read: () => last, hasPending: () => busy || !!failure || !['ready'].includes(last.state),
      refresh: () => execute(async () => { last = await service.read(); if (last.state === 'repair-required') throw Error('保存状態の確認が必要です。'); return last; }),
      async dispose() {
        if (closed) return; closed = true; lease.beginClose();
        try { await operation; } catch { /* Retained journals remain for the next open. No success acknowledgment. */ }
        await lease.waitForWorkspaceIdle(); lease.sealWorkspaceWritesForRelease(); lease.release();
        await connection!.dispose();
      },
    };
  } catch (error) {
    lease.beginClose(); await lease.waitForWorkspaceIdle(); lease.sealWorkspaceWritesForRelease(); lease.release();
    await connection?.dispose(); throw error;
  }
}
