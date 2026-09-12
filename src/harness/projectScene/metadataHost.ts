import type { WorkspaceFS } from '../../platform/fs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { MetadataProjectSession, metadataProviderReady, type MetadataSessionRead } from '../../projectMetadata/session';
import type { MetadataStorageFactory } from '../../projectMetadata/repository';
import { digest, newId, technicalId, underWriteLease } from '../../projectMetadata/persistence';
import { TransactionJournal } from '../../projectMetadata/journal';
import { createMetadataFixture, metadataFixtureLimits as limits, metadataProjectView } from './metadataFixture';
import { MetadataFixtureContent, readMetadataSeed, writeMetadataSeed } from './metadataStorage';
import { metadataModelFacts } from './metadataModelFacts';
import type { SyntheticAuthority } from './historyProjection';
import { captionDeletionImpact } from '../../projectMetadata/captionDeletion';
import { assetDeletionImpact } from '../../projectMetadata/assetDeletion';
import { metadataIntent } from './metadataIntent';
import type { FullMetadataSource } from '../../projectMetadata/remote';
import { fixtureIds } from './fixture';
import type { MetadataEdit } from '../../projectMetadata/commands';
import { readProjectScene } from '../../scene/projectProvider';
import { createFixtureModel, fixtureModelIds } from './modelClosure';
import { cloneCanonicalValue, type JsonObject } from '../../domain/values';

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
    const content = new MetadataFixtureContent(fs), service = new MetadataProjectSession(fs, connection.factory, limits, allow => content.verifier(allow), content, metadataModelFacts(content));
    let last = await service.read(), busy = false, closed = false, failure = '';
    if (last.state === 'repair-required') throw Error('保存内容を確認できません。データは保持しています。');
    if (!fresh && lease.holdsWriteLock) lease.activateAfterDurableReload();
    let operation: Promise<unknown> | undefined;
    const execute = async <T>(action: () => Promise<T>, refusedMessage?: string): Promise<T> => {
      if (closed || busy) throw Error('処理が完了するまでお待ちください。');
      busy = true; failure = '';
      const work = action(); operation = work;
      try { const result = await work; if (closed) throw Error('画面を閉じました。保存結果は再度開いて確認してください。'); return result; }
      catch (error) {
        if (refusedMessage) {
          // A rejected input is not an incomplete save. Do not offer a storage
          // retry that would acknowledge the unchanged Project as a received one.
          last = await service.read();
          if (last.state === 'ready') throw Error(`${refusedMessage}保存内容は保持しています。${error instanceof Error ? error.message : ''}`);
        }
        failure = '保存を完了できません。変更を保持しています。再試行してください。'; throw Error(failure, { cause: error });
      }
      finally { busy = false; if (operation === work) operation = undefined; }
    };
    const ready = (read: MetadataSessionRead) => {
      last = read;
      if (read.state !== 'ready' || !read.provider) throw Error('未完了の保存があります。元の変更から復旧してください。');
      return metadataProjectView(read.provider, content.images);
    };
    const initialize = async () => {
      await underWriteLease(fs, async () => {
        const prepared = await content.prepare(seed);
        const provider = await readProjectScene(seed.read(), limits, content.verifier(true));
        if (provider.kind !== 'scene-provider' || !metadataProviderReady(provider, limits)) throw Error('初期モデルを確認できません。');
        for (const model of prepared.filter(m => m.closure.shape === 'updated')) {
          const current = provider.resources.assets[model.assetId]?.projection;
          const scene = Object.values(provider.state.assetMemberships).find(e => e.resourceId === model.assetId &&
            e.lifecycle.kind === 'value' && e.lifecycle.value.state === 'active');
          if (current?.kind !== 'value' || !scene) throw Error('準備するモデルの配置を確認できません。');
          const binding = provider.details.immutable.assetBindingsById[current.value.bindingId];
          if (binding?.kind !== 'value') throw Error('準備するモデルの配置を確認できません。');
          const target = createFixtureModel({ ...fixtureModelIds(model.closure), binding: `bnd_${newId()}` }, model.closure.shape,
            binding.value.assetToProject as unknown as Parameters<typeof createFixtureModel>[2], current.value.bindingId);
          const candidate = seed.prepareEdit(seed.token, { kind: 'activatePreparedRevision', sceneId: scene.sceneId, assetId: model.assetId,
            expectedBindingId: current.value.bindingId, revisionId: model.projection.revisionId,
            binding: cloneCanonicalValue(target.binding, limits) as JsonObject }, provider, newId());
          const checked = await readProjectScene(candidate.read(), limits, content.verifier(true));
          if (!metadataProviderReady(checked, limits)) throw Error('更新モデルの準備を確認できません。');
        }
      });
      return ready(await service.createFromSource(seed));
    };
    if (last.state === 'empty' && options.create && lease.holdsWriteLock) {
      try { await execute(initialize); } catch { last = await service.read(); }
    }
    const authority: SyntheticAuthority = {
      storage: 'saved-development', writeScope: 'caption-text',
      capabilities: { pins: true, membership: true, color: true, views: true, materials: true, media: true, placement: true, transform: true, preparedRevision: true, sceneAuthoring: true },
      get readOnly() { return fs.mutationAuthority.accessState !== 'editable' || closed; },
      read: () => { if (!last.provider) throw Error('保存した画面はまだありません。'); return metadataProjectView(last.provider, content.images); },
      status: () => ({ kind: busy ? 'checking' : failure || last.state !== 'ready' ? 'failed' : 'idle', error: failure || '未完了の更新があります。' }),
      write: (token, changes, context) => execute(async () => {
        if (authority.readOnly) throw Error('このタブは閲覧専用です。');
        return ready(await service.edit(token, metadataIntent(changes, authority.read(), context)));
      }, '変更を適用できません。'),
      authorScene: (token, command) => execute(async () => {
        if (authority.readOnly) throw Error('このタブは閲覧専用です。');
        if (!['createScene', 'renameScene', 'setDefaultScene'].includes(command.kind)) throw Error('シーンの操作を確認してください。');
        return ready(await service.edit(token, command));
      }, 'シーンを変更できません。'),
      captionDeletionImpact: (token, captionId) => {
        if (last.provider?.kind !== 'scene-provider' || token !== last.provider.state.token) throw Error('内容が更新されています。選び直してください。');
        return captionDeletionImpact(last.provider, captionId, limits);
      },
      deleteCaption: (token, command) => execute(async () => {
        if (authority.readOnly) throw Error('このタブは閲覧専用です。');
        if (command.kind !== 'deleteCaption') throw Error('削除対象を確認してください。');
        return ready(await service.edit(token, command));
      }, 'キャプションを削除できません。'),
      assetDeletionImpact: (token, assetId) => {
        if (last.provider?.kind !== 'scene-provider' || token !== last.provider.state.token) throw Error('内容が更新されています。選び直してください。');
        return assetDeletionImpact(last.provider, assetId, limits);
      },
      deleteAsset: (token, command) => execute(async () => {
        if (authority.readOnly) throw Error('このタブは閲覧専用です。');
        if (command.kind !== 'deleteAsset') throw Error('削除対象を確認してください。');
        return ready(await service.edit(token, command));
      }, 'モデルを削除できません。'),
      retry: () => execute(async () => {
        if (authority.readOnly) throw Error('このタブは閲覧専用です。');
        const before = await service.read();
        if (before.state === 'empty') return initialize();
        return ready(await service.retry());
      }),
    };
    const demos = new Map<string, FullMetadataSource>();
    const demoSource = async (kind: 'title' | 'membership' | 'model' | 'assetMembership'): Promise<FullMetadataSource> => {
      const cached = demos.get(kind); if (cached) return cached;
      const packageId = kind === 'title' ? `pkg_${run}` : `pkg_${(await digest(new TextEncoder().encode(`synthetic-${kind}:${run}`))).slice(0, 32)}`;
      const previous = (await journal.entries()).find(e => e.prepared?.remote?.source.packageId === packageId);
      let demoInput: FullMetadataSource;
      if (previous?.prepared?.remote) {
        const descriptor = previous.prepared.remote.source, path = journal.path(previous.start.transactionId, 'source-metadata.am');
        const file = await fs.readStream(path);
        if (!file || file.size !== descriptor.metadataByteLength || file.size > limits.maxTotalBytes)
          throw Error('受信元の保存データを確認できません。');
        const bytes = await fs.readBytes(path);
        if (!bytes || bytes.length !== file.size) throw Error('受信元の保存データを確認できません。');
        demoInput = { packageId: descriptor.packageId, metadataBytes: bytes, proof: previous.start.proof, remoteHeads: descriptor.remoteHeads };
      } else {
        // Branch from the original synthetic seed, not the receiver's edited state.
        let remote: typeof seed;
        if (kind === 'model') {
          const provider = await readProjectScene(seed.read(), limits, content.verifier(false));
          if (provider.kind !== 'scene-provider') throw Error('更新元のモデルを確認できません。');
          const versions = metadataProjectView(provider, content.images).modelVersions!;
          const current = versions.find(v => v.assetId === fixtureIds.equipment && v.closure.shape === 'original');
          const target = versions.find(v => v.assetId === fixtureIds.equipment && v.closure.shape === 'updated');
          if (!current || !target) throw Error('この保存データには更新する合成モデルがありません。');
          const binding = createFixtureModel({ ...fixtureModelIds(target.closure), binding: `bnd_${newId()}` }, 'updated',
            current.closure.binding.assetToProject, current.projection.bindingId).binding;
          remote = seed.prepareEdit(seed.token, { kind: 'activatePreparedRevision', sceneId: fixtureIds.overview, assetId: fixtureIds.equipment,
            expectedBindingId: current.projection.bindingId, revisionId: target.projection.revisionId,
            binding: cloneCanonicalValue(binding, limits) as JsonObject }, provider, newId());
        } else remote = kind === 'title' ? await seed.prepareCaptionText(seed.token, fixtureIds.shared, 'title', '配布された記録') :
          seed.prepareEdit(seed.token, { kind: 'include', sceneId: fixtureIds.detail,
            resourceKind: kind === 'assetMembership' ? 'asset' : 'caption', resourceId: kind === 'assetMembership' ? fixtureIds.structure : fixtureIds.second,
            membershipId: `${kind === 'assetMembership' ? 'sam' : 'scm'}_${newId()}`, orderKey: 'B', eventId: `evt_${newId()}` },
          await readProjectScene(seed.read(), limits, content.verifier(false)), newId());
        demoInput = { packageId, metadataBytes: remote.encodeFullSource(), proof: remote.proof, remoteHeads: remote.heads };
      }
      demos.set(kind, demoInput);
      return demoInput;
    };
    const receive = (expectedToken: string, input?: FullMetadataSource, demo: 'title' | 'membership' | 'model' | 'assetMembership' = 'title') => execute(async () => {
      if (authority.readOnly) throw Error('このタブは閲覧専用です。');
      return ready(await service.receiveFullSource(expectedToken, input ?? await demoSource(demo)));
    }, '更新を受け取れません。');
    const resolve = (expectedToken: string, command: Extract<MetadataEdit, { kind: 'resolveCaptionText' | 'resolveCaptionField' | 'resolveCaptionMembership' | 'resolveAssetMembership' | 'resolveAssetStatus' | 'resolveDefaultScene' }>) => execute(async () => {
      if (authority.readOnly) throw Error('このタブは閲覧専用です。');
      return ready(await service.edit(expectedToken, command));
    }, '競合を解消できません。');
    return {
      authority, content, receive, resolve, limits, read: () => last, hasPending: () => busy || !!failure || !['ready'].includes(last.state),
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
