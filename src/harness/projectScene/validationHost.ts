import type { WorkspaceFS } from '../../platform/fs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { technicalId, newId } from '../../projectMetadata/persistence';
import { TransactionJournal } from '../../projectMetadata/journal';
import type { MetadataStorageFactory } from '../../projectMetadata/repository';
import type { OriginBlobStore } from '../../projectMetadata/blobStore';
import type { MetadataSessionRead } from '../../projectMetadata/session';
import { captionDeletionImpact } from '../../projectMetadata/captionDeletion';
import { assetDeletionImpact } from '../../projectMetadata/assetDeletion';
import { prepareValidationCreation, resumeValidationCreation, validationProjectService } from '../../projectFiles/creation';
import { validationMetadataLimits as limits, type FileValidationLimits } from '../../projectFiles/validation';
import type { PngDecoder } from '../../projectFiles/png';
import { sealValidationRecord } from '../../projectFiles/initialProject';
import { cloneCanonicalValue, type JsonObject } from '../../domain/values';
import { metadataProjectView } from './metadataFixture';
import { validationModelVersions } from './validationProjection';
import { metadataIntent } from './metadataIntent';
import type { SyntheticProject } from './fixture';
import type { SyntheticAuthority } from './historyProjection';
import type { SavedWorkspaceHost, LocalOpenMode } from './savedHost';
import type { MediaImage, MediaFileAddition } from './mediaHistory';
import type { ModelPlacementCommand, ModelFileAddition } from './modelTypes';
import { orderBetween } from './viewHistory';
import { resolveScene } from '../../scene/resolve';
import { validationMaterialSlots, validationMaterialIssue } from './validationMaterials';
import { same } from '../../domain/projectGraphSupport';
import type { MaterialIntent } from '../../domain/materialIntent';

export const validationArea = 'lociview-development-validation-1';
export interface ValidationHostOptions {
  mode?: LocalOpenMode;
  run: string; base: WorkspaceFS; coordinator: ProjectMutationCoordinator; store: OriginBlobStore;
  fileLimits: FileValidationLimits; decode?: PngDecoder; initial?: ReturnType<typeof prepareValidationCreation>;
  openStorage(allowCreate: boolean): Promise<{ factory: MetadataStorageFactory; dispose(): Promise<void> }>;
}
const base64 = (bytes: Uint8Array) => { let text = ''; for (let n = 0; n < bytes.length; n += 8192)
  text += String.fromCharCode(...bytes.subarray(n, n + 8192)); return btoa(text); };

/** New validation namespace only; no synthetic seed, guessed Project or old-store fallback. */
export async function openValidationHost(options: ValidationHostOptions) {
  const run = technicalId(options.run), root = `${validationArea}/${run}`;
  if (options.mode === 'view' && options.initial) throw Error('閲覧ではプロジェクトを作成できません。');
  if (options.initial && options.initial.source.proof.identity.projectId !== `prj_${run}`) throw Error('作成先を確認してください。');
  const lease = options.mode === 'view' ? options.coordinator.openView(options.base, root, `${validationArea}:${run}`) :
    await options.coordinator.tryAcquire(options.base, root, `${validationArea}:${run}`), fs = lease.workspace;
  let connection: Awaited<ReturnType<ValidationHostOptions['openStorage']>> | undefined, operation: Promise<unknown> | undefined;
  let closed = false, busy = false, failure = '';
  const dispose = async () => { if (closed) return; closed = true; lease.beginClose();
    try { await operation; } catch { /* Stored journal/initial input remain authoritative, never silently discarded. */ }
    await lease.waitForWorkspaceIdle(); lease.sealWorkspaceWritesForRelease(); lease.release(); await connection?.dispose(); };
  try {
    const fresh = !(await options.base.list(`${root}/`)).length;
    if (fresh && (!options.initial || !lease.holdsWriteLock)) throw Error('保存データがありません。プロジェクトを選び直してください。');
    if (!fresh && options.initial) throw Error('作成先に保存データがあります。既存データは変更していません。');
    if (fresh) lease.activateNewProject();
    connection = await options.openStorage(fresh && !!options.initial && lease.holdsWriteLock);
    const { content, session } = validationProjectService(fs, connection.factory, options.store, options.fileLimits, options.decode);
    let last = await session.read(), project: SyntheticProject | undefined;
    let prepareDisplay: ((next: SyntheticProject) => Promise<void>) | undefined;
    const images: Record<string, MediaImage> = {};
    const projectView = async (read: MetadataSessionRead) => {
      if (read.source && read.source.proof.identity.projectId !== `prj_${run}`) throw Error('保存領域とプロジェクトが一致しません。');
      if (read.provider?.kind !== 'scene-provider') return;
      const versions = await validationModelVersions(read.provider);
      for (const [id, field] of Object.entries(read.provider.details.immutable.mediaResourcesById)) {
        if (field.kind !== 'value') throw Error('保存した画像の情報を確認できません。');
        if (!images[id]) images[id] = { record: field.value as unknown as MediaImage['record'], base64: base64(await content.image(field.value)) };
      }
      const next = { ...metadataProjectView(read.provider, { ...images }, versions), mediaChoices: Object.values(images).map(i => i.record), validationFiles: true };
      await prepareDisplay?.(next);
      if (closed) throw Error('画面を閉じました。保存内容は再度開いて確認してください。');
      project = next;
    };
    await projectView(last);
    if (!fresh && lease.holdsWriteLock && last.state !== 'repair-required') lease.activateAfterDurableReload();
    const ready = async (read: MetadataSessionRead) => { last = read; await projectView(read);
      if (read.state !== 'ready' || !project) throw Error('保存が未完了です。元の変更から再試行してください。'); return project; };
    const execute = async <T>(action: () => Promise<T>, inputCommand = false): Promise<T> => {
      if (closed || busy) throw Error('処理の完了をお待ちください。'); busy = true; failure = '';
      const before = last.source?.token;
      const work = action(); operation = work;
      try { const result = await work; if (closed) throw Error('画面を閉じました。保存結果は再度開いて確認してください。'); return result; }
      catch (error) { last = await session.read();
        if (inputCommand && last.state === 'ready' && last.source?.token === before) throw error;
        failure = error instanceof Error ? error.message : '保存できません。入力は保持しています。'; throw error; }
      finally { busy = false; if (operation === work) operation = undefined; }
    };
    const resume = async () => {
      const before = await session.read(), entries = await new TransactionJournal(fs, limits).entries();
      const result = await ready(before.state === 'empty' && options.initial ? await options.initial.persist(fs, options.store, session) :
        before.state === 'empty' || entries.length === 1 && entries[0]!.start.purpose === 'initialize' && before.state !== 'ready'
          ? await resumeValidationCreation(fs, session, `prj_${run}`) : await session.retry());
      content.releasePreparedImages(); content.releasePreparedModels(); return result;
    };
    if (fresh) { try { await execute(resume); } catch { /* Keep the prepared creation object and the visible failure for explicit retry. */ } }
    const editable = () => { if (closed || fs.mutationAuthority.accessState !== 'editable') throw Error('このタブは閲覧専用です。'); };
    const addMediaFile = (token: string, input: MediaFileAddition) => {
      const selected = input.file, target = { sceneId: input.sceneId, captionId: input.captionId, attachmentId: input.attachmentId,
        orderKey: input.orderKey, eventId: input.eventId };
      const file = { name: selected.name, size: selected.size, arrayBuffer: selected.arrayBuffer.bind(selected) };
      return execute(async () => {
      editable();
      const before = await session.read();
      if (before.state !== 'ready' || before.provider?.kind !== 'scene-provider' || before.source?.token !== token)
        throw Error('対象が更新されています。キャプションを選び直してください。');
      // Enforce the same total validation budget before allocating the selected body.
      const bodies = new Map<string, number>();
      for (const map of [before.provider.details.immutable.representationsById, before.provider.details.immutable.mediaResourcesById])
        for (const field of Object.values(map)) {
          if (field.kind !== 'value') throw Error('保存した本体の情報を確認してください。');
          const blob = field.value.blob as { digest: string; byteLength: number }; bodies.set(blob.digest, blob.byteLength);
        }
      if (!Number.isSafeInteger(file.size) || file.size <= 0 || [...bodies.values()].reduce((sum, size) => sum + size, file.size) > options.fileLimits.maxFileBytes)
        throw Error('画像を含む合計がこの検証の上限を超えています。');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length !== file.size) throw Error('選択した画像の大きさが一致しません。');
      const media = await content.prepareImage({ label: file.name, bytes });
      try { const result = await ready(await session.edit(token, { kind: 'createAttachment', ...target, media, altText: '' }));
        content.releasePreparedImages(); return result;
      } catch (error) { if ((await session.read()).state === 'ready') content.releasePreparedImages(); throw error; }
      }, true);
    };
    const authority: SyntheticAuthority = {
      storage: 'saved-development', writeScope: 'caption-text',
      capabilities: { pins: true, membership: true, color: true, views: true, media: true, materials: true, sceneAuthoring: true, placement: true, transform: true },
      get readOnly() { return closed || fs.mutationAuthority.accessState !== 'editable'; },
      read: () => { if (!project) throw Error('プロジェクトの作成が未完了です。'); return project; },
      status: () => ({ kind: busy ? 'checking' : failure || last.state !== 'ready' ? 'failed' : 'idle', error: failure || '更新が未完了です。' }),
      write: (token, changes, context) => execute(async () => {
        editable(); const command = metadataIntent(changes, authority.read(), context);
        if (command.kind === 'createMaterial' || command.kind === 'editMaterial') {
          const current = command.kind === 'editMaterial' ? project?.materialData?.records[command.overrideId] : undefined;
          const routing = command.kind === 'createMaterial' ? command.routing : current?.routing.kind === 'value' ? current.routing.value : null;
          const compositing = command.kind === 'createMaterial' ? command.compositing : current?.compositing.kind === 'value' ? current.compositing.value : null;
          const slots = project?.modelVersions?.flatMap(v => v.closure.shape === 'saved-glb' ? validationMaterialSlots(v.closure) : []) ?? [];
          const slot = slots.find(s => same(s.target as unknown as JsonObject, routing?.target as JsonObject | undefined));
          if (!slot || !compositing) throw Error('設定するモデルと材質を確認してください。');
          const issue = validationMaterialIssue(slot, { appearance: command.appearance, compositing } as MaterialIntent);
          if (issue) throw Error(issue);
        }
        return ready(await session.edit(token, command));
      }, true),
      authorScene: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      reparentPin: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      captionDeletionImpact: (token, id) => { if (last.provider?.kind !== 'scene-provider' || token !== last.provider.token) throw Error('内容が更新されています。'); return captionDeletionImpact(last.provider, id, limits); },
      deleteCaption: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      assetDeletionImpact: (token, id) => { if (last.provider?.kind !== 'scene-provider' || token !== last.provider.token) throw Error('内容が更新されています。'); return assetDeletionImpact(last.provider, id, limits); },
      deleteAsset: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      addMediaFile,
      addModelFile: (token, input: ModelFileAddition) => {
        const target = { sceneId: input.sceneId, assetId: input.assetId }, selected = input.file;
        const file = { name: selected.name, size: selected.size, arrayBuffer: selected.arrayBuffer.bind(selected) };
        return execute(async () => {
          editable(); const before = await session.read();
          if (before.state !== 'ready' || before.source?.token !== token || before.provider?.kind !== 'scene-provider')
            throw Error('対象が更新されています。シーンを選び直してください。');
          const view = authority.read(), scene = resolveScene(view.state, view.resources, target.sceneId);
          if (scene.kind !== 'ready') throw Error('追加先のシーンを確認してください。');
          const edges = Object.values(view.state.assetMemberships).filter(e => e.sceneId === target.sceneId);
          if (edges.some(e => e.lifecycle.kind !== 'value' || e.orderKey.kind !== 'value')) throw Error('モデル一覧の未解決の状態を確認してください。');
          const orders = edges.filter(e => e.lifecycle.kind === 'value' && e.lifecycle.value.state === 'active')
            .map(e => (e.orderKey as { value: string }).value).sort();
          const orderKey = orderBetween(orders.at(-1) ?? null, null), bodies = new Map<string, number>();
          for (const map of [before.provider.details.immutable.representationsById, before.provider.details.immutable.mediaResourcesById])
            for (const field of Object.values(map)) {
              if (field.kind !== 'value') throw Error('保存した本体の情報を確認してください。');
              const b = field.value.blob as { digest: string; byteLength: number }; bodies.set(b.digest, b.byteLength);
            }
          if (!Number.isSafeInteger(file.size) || file.size <= 0 || [...bodies.values()].reduce((sum, size) => sum + size, file.size) > options.fileLimits.maxFileBytes)
            throw Error('モデルを含む合計がこの検証の上限を超えています。');
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.length !== file.size) throw Error('選択したモデルの大きさが一致しません。');
          const records = await content.prepareModel({ label: file.name, bytes }, target.assetId);
          try {
            const result = await ready(await session.edit(token, { kind: 'addAsset', sceneId: target.sceneId, ...records,
              membership: { id: `sam_${newId()}`, sceneId: target.sceneId, assetId: target.assetId, orderKey,
                lifecycle: { state: 'active', reason: 'initial', eventId: `evt_${newId()}` } } }));
            content.releasePreparedModels(); return result;
          } catch (error) { if ((await session.read()).state === 'ready') content.releasePreparedModels(); throw error; }
        }, true);
      },
      transformModel: (token, input: ModelPlacementCommand) => {
        const captured = cloneCanonicalValue(input as unknown as JsonObject, limits) as unknown as ModelPlacementCommand;
        return execute(async () => {
          editable(); const before = await session.read();
          if (before.state !== 'ready' || before.source?.token !== token || before.provider?.kind !== 'scene-provider')
            throw Error('モデルが更新されています。配置の入力を保持しています。');
          const versions = await validationModelVersions(before.provider);
          const source = versions.find(v => v.assetId === captured.assetId && v.projection.bindingId === captured.expectedBindingId)?.closure;
          if (!source || source.shape !== 'saved-glb') throw Error('配置するモデルを確認してください。');
          const binding = await sealValidationRecord('asset-binding-revision', { id: captured.bindingId, assetId: captured.assetId,
            assetRevisionId: source.revision.id, parentBindingId: source.binding.id, method: 'manual',
            assetToProject: captured.placement as unknown as JsonObject });
          return ready(await session.edit(token, { kind: 'transformAsset', sceneId: captured.sceneId, assetId: captured.assetId,
            expectedBindingId: captured.expectedBindingId, binding }));
        }, true);
      },
      retry: () => execute(async () => { editable(); return resume(); }),
    };
    const host: SavedWorkspaceHost = { authority, limits, read: () => last, hasPending: () => busy || !!failure || last.state !== 'ready',
      refresh: () => execute(async () => { last = await session.read(); await projectView(last); return last; }),
      resolve: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      dispose: async () => { await dispose(); content.releasePreparedImages(); content.releasePreparedModels(); prepareDisplay = undefined; } };
    return { ...host, content, get accessDetail() { return options.mode === 'view' ? '閲覧専用です。' : lease.accessDetail; },
      setDisplayPreparation(callback: (next: SyntheticProject) => Promise<void>) {
      if (closed || prepareDisplay) throw Error('モデル表示の接続を確認してください。');
      prepareDisplay = callback; return () => { if (prepareDisplay === callback) prepareDisplay = undefined; };
    } };
  } catch (error) { await dispose(); throw error; }
}
