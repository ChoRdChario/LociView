import type { WorkspaceFS } from '../../platform/fs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { technicalId, newId, metadataPath, json } from '../../projectMetadata/persistence';
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
import { validationModelVersions, validationDeclaredBodyBytes } from './validationProjection';
import { metadataIntent } from './metadataIntent';
import type { SyntheticProject } from './fixture';
import type { SyntheticAuthority } from './historyProjection';
import type { SavedWorkspaceHost, LocalOpenMode } from './savedHost';
import type { MediaImage, MediaFileAddition } from './mediaHistory';
import type { ModelPlacementCommand, ModelFileAddition, ModelFileReplacement } from './modelTypes';
import { orderBetween } from './viewHistory';
import { resolveScene } from '../../scene/resolve';
import { validationMaterialSlots, validationMaterialIssue } from './validationMaterials';
import { same } from '../../domain/projectGraphSupport';
import type { MaterialIntent } from '../../domain/materialIntent';
import { WorkspaceReceiver, workspaceFileOperation, type WorkspaceReceiveState } from '../../projectFiles/receiveWorkspace';
import type { PreparedReviewEdit } from '../../projectPackage/reviewEdit';
import { ReviewEditJob } from '../../projectPackage/reviewEditJob';
import { reviewEditChildBinding, type ReviewEditState } from '../../projectPackage/reviewEditControls';
import { WorkspaceSender, type WorkspaceOutputState, type ContributionBaseChoice } from '../../projectFiles/sendWorkspace';
import { WorkspaceArchive } from '../../projectPackage/workspaceArchive';
import { CleanArchive } from '../../projectPackage/cleanArchive';
import { PackageArchive } from '../../projectPackage/zipArchive';
import { BackupRestoreJob, type RestoreDatabasePorts } from '../../projectPackage/backupRestoreJob';
import { readRestoreControls } from '../../projectPackage/restoreControls';
import { openValidationGeneration, validationGenerationDatabases, validationGenerationService } from './validationGeneration';

export const validationArea = 'lociview-development-validation-1';
export interface ValidationHostOptions {
  mode?: LocalOpenMode;
  run: string; base: WorkspaceFS; coordinator: ProjectMutationCoordinator; store: OriginBlobStore;
  fileLimits: FileValidationLimits; decode?: PngDecoder; initial?: ReturnType<typeof prepareValidationCreation>;
  workspaceFile?: Blob;
  reviewEdit?: PreparedReviewEdit;
  packageLocks?: LockManager | null;
  generations?: (run: string) => RestoreDatabasePorts;
  openStorage(allowCreate: boolean): Promise<{ factory: MetadataStorageFactory; dispose(): Promise<void> }>;
}
const base64 = (bytes: Uint8Array) => { let text = ''; for (let n = 0; n < bytes.length; n += 8192)
  text += String.fromCharCode(...bytes.subarray(n, n + 8192)); return btoa(text); };

/** New validation namespace only; no synthetic seed, guessed Project or old-store fallback. */
export async function openValidationHost(options: ValidationHostOptions) {
  const run = technicalId(options.run), root = `${validationArea}/${run}`;
  if (options.mode === 'view' && options.initial) throw Error('閲覧ではプロジェクトを作成できません。');
  if (options.mode === 'view' && options.workspaceFile) throw Error('閲覧では作業一式を取り込めません。');
  if (options.mode === 'view' && options.reviewEdit) throw Error('閲覧中は編集コピーを作成できません。');
  if ([options.initial, options.workspaceFile, options.reviewEdit].filter(Boolean).length > 1) throw Error('作成元を一つ選択してください。');
  if (options.reviewEdit && options.reviewEdit.run !== run) throw Error('編集コピーの作成先を確認してください。');
  const inspectInput = async (file: Blob) => (await PackageArchive.inspect(file)).control.manifest.purpose === 'clean' ? CleanArchive.inspect(file, limits) : WorkspaceArchive.inspect(file, limits);
  const incoming = options.workspaceFile ? await inspectInput(options.workspaceFile) : undefined;
  if (incoming && incoming.source.proof.identity.projectId !== `prj_${run}`) throw Error('ファイルのプロジェクトと開く場所が一致しません。');
  if (options.initial && options.initial.source.proof.identity.projectId !== `prj_${run}`) throw Error('作成先を確認してください。');
  const lease = options.mode === 'view' ? options.coordinator.openView(options.base, root, `${validationArea}:${run}`) :
    await options.coordinator.tryAcquire(options.base, root, `${validationArea}:${run}`);
  let connection: Awaited<ReturnType<typeof openValidationGeneration>> | undefined, operation: Promise<unknown> | undefined;
  let closed = false, busy = false, failure = '';
  const dispose = async () => { if (closed) return; closed = true; lease.beginClose();
    try { await operation; } catch { /* Stored journal/initial input remain authoritative, never silently discarded. */ }
    await lease.waitForWorkspaceIdle(); lease.sealWorkspaceWritesForRelease(); lease.release(); await connection?.dispose(); };
  try {
    const fresh = !(await options.base.list(`${root}/`)).length;
    if (fresh && (!(options.initial || incoming || options.reviewEdit) || !lease.holdsWriteLock)) throw Error('保存データがありません。プロジェクトを選び直してください。');
    if (!fresh && options.initial) throw Error('作成先に保存データがあります。既存データは変更していません。');
    if (fresh) lease.activateNewProject();
    connection = await openValidationGeneration(lease.workspace, options, fresh && !!(options.initial || incoming || options.reviewEdit) && lease.holdsWriteLock);
    let { fs, content, session } = connection.service;
    let receiver = new WorkspaceReceiver(options.base, fs, session, limits, options.packageLocks ?? null);
    let sender = new WorkspaceSender(fs, session, options.store, limits, options.packageLocks ?? null);
    const databases = validationGenerationDatabases(options), rootFs = lease.workspace;
    let restoreControls = await readRestoreControls(rootFs, limits), restoreFailure = '', restoreRetired = false,
      restoreDisplayPending = false, restoreEpoch = 0, preparedRestore: BackupRestoreJob | undefined;
    const reloadRestore = async () => {
      restoreControls = await readRestoreControls(rootFs, limits);
      connection!.restorePending = !!restoreControls.pending || !!restoreControls.tail &&
        !restoreControls.jobs.find(j => j.id === restoreControls.tail!.jobId)?.result;
    };
    let outputJobs: WorkspaceOutputState[] = [], outputFailure = '';
    let outputBases: ContributionBaseChoice[] = [], outputDiscoveryFailure = '';
    const reloadOutput = async () => {
      try { outputJobs = await sender.jobs(); outputBases = await sender.availableBases(); outputDiscoveryFailure = ''; }
      catch (error) { outputBases = []; outputDiscoveryFailure = error instanceof Error ? error.message : '受け渡しの記録を確認できません。'; }
    };
    const unfinishedOutput = () => outputJobs.some(j => ['unstarted', 'incomplete', 'repair-required'].includes(j.state));
    let receiveJobs: WorkspaceReceiveState[] = [], receiveFailure = '', receiveDisplayPending = false;
    let reviewCopies: ReviewEditState[] = [], reviewCopyError = '';
    const reviewPending = () => !!reviewCopyError || reviewCopies.some(j => !['completed', 'abandoned'].includes(j.state));
    const unfinishedReceive = () => reviewPending() || receiveJobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state));
    const reloadReceive = async () => {
      try { reviewCopies = await new ReviewEditJob(fs, session, limits).states(); reviewCopyError = ''; }
      catch { reviewCopyError = '編集コピーの元データを確認できません。修復が必要です。'; }
      const jobs = await receiver.jobs(); receiveJobs = [];
      const children = new Set(reviewCopies.flatMap(j => j.childId ? [j.childId] : []));
      for (const job of jobs) {
        if (children.has(job.id) || await reviewEditChildBinding(fs, job.id, limits).catch(() => true)) continue;
        receiveJobs.push(job);
      }
      await reloadOutput();
    };
    await reloadReceive();
    let last = await session.read(), project: SyntheticProject | undefined;
    if (incoming instanceof CleanArchive && last.source) throw Error('この独立コピーの再開用データがあります。ファイルを取り込まず、プロジェクト一覧から再開してください。');
    if (last.source && (last.source.proof.identity.projectId !== `prj_${run}` || incoming && json(last.source.proof) !== json(incoming.source.proof)))
      throw Error('ファイルと再開用データのプロジェクトが一致しません。既存データは変更していません。');
    let localInitial = !!options.initial || !!await fs.readStream(metadataPath(fs, 'validation-initial.json')) ||
      (await new TransactionJournal(fs, limits).entries()).some(e => e.start.purpose === 'initialize');
    let prepareDisplay: ((next: SyntheticProject) => Promise<void>) | undefined;
    let images: Record<string, MediaImage> = {};
    const projectFrom = async (read: MetadataSessionRead, sourceContent = content, cache = images) => {
      if (read.source && read.source.proof.identity.projectId !== `prj_${run}`) throw Error('保存領域とプロジェクトが一致しません。');
      if (read.provider?.kind !== 'scene-provider') return;
      const versions = await validationModelVersions(read.provider);
      for (const [id, field] of Object.entries(read.provider.details.immutable.mediaResourcesById)) {
        if (field.kind !== 'value') throw Error('保存した画像の情報を確認できません。');
        if (!cache[id]) cache[id] = { record: field.value as unknown as MediaImage['record'], base64: base64(await sourceContent.image(field.value)) };
      }
      return { ...metadataProjectView(read.provider, { ...cache }, versions), mediaChoices: Object.values(cache).map(i => i.record), validationFiles: true };
    };
    const projectView = async (read: MetadataSessionRead) => {
      const next = await projectFrom(read); if (!next) return;
      await prepareDisplay?.(next);
      if (closed) throw Error('画面を閉じました。保存内容は再度開いて確認してください。');
      project = next;
    };
    try { await projectView(last); }
    catch (error) { receiveDisplayPending = true; receiveFailure = error instanceof Error ? error.message : '表示を準備できません。再開用データは保持しています。'; }
    if (!fresh && lease.holdsWriteLock && last.state !== 'repair-required') lease.activateAfterDurableReload();
    const ready = async (read: MetadataSessionRead) => { last = read; await projectView(read);
      if (read.state !== 'ready' || !project) throw Error('保存が未完了です。元の変更から再試行してください。'); return project; };
    const execute = async <T>(action: () => Promise<T>, inputCommand = false): Promise<T> => {
      if (closed || busy) throw Error('処理の完了をお待ちください。'); busy = true; failure = '';
      const before = last.source?.token;
      const work = action(); operation = work;
      try { const result = await work; if (closed) throw Error('画面を閉じました。保存結果は再度開いて確認してください。'); return result; }
      catch (error) {
        if (!restoreRetired) { try { last = await session.read(); } catch { /* Preserve the operation's failure; do not replace selected data with old state. */ } }
        if (inputCommand && last.state === 'ready' && last.source?.token === before) throw error;
        failure = error instanceof Error ? error.message : '保存できません。入力は保持しています。'; throw error; }
      finally { busy = false; if (operation === work) operation = undefined; }
    };
    const resume = async () => {
      if (unfinishedReceive()) throw Error('「更新ファイル」の中断した受信を確認してください。');
      if (receiveDisplayPending && last.state === 'ready') {
        const result = await ready(await session.read()); receiveFailure = ''; receiveDisplayPending = false; return result;
      }
      const before = await session.read(), entries = await new TransactionJournal(fs, limits).entries();
      if (before.state === 'empty' && !localInitial) throw Error('作業一式を選択するか、プロジェクト一覧へ戻ってください。');
      const result = await ready(before.state === 'empty' && options.initial ? await options.initial.persist(fs, options.store, session) :
        before.state === 'empty' || entries.length === 1 && entries[0]!.start.purpose === 'initialize' && before.state !== 'ready'
          ? await resumeValidationCreation(fs, session, `prj_${run}`) : await session.retry());
      content.releasePreparedImages(); content.releasePreparedModels(); return result;
    };
    if (fresh && options.initial) { try { await execute(resume); } catch { /* Keep exact creation input for retry. */ } }
    const editable = (recovery = false) => {
      if (closed || fs.mutationAuthority.accessState !== 'editable') throw Error('このタブは閲覧専用です。');
      if (connection?.restorePending || restoreRetired || restoreDisplayPending) throw Error('バックアップの復元が未完了です。復元を再開するか、取りやめてください。');
      if (reviewPending()) throw Error('編集コピーの作成を再開するか、開始前の作成を取りやめてください。');
      if (!recovery && unfinishedReceive()) throw Error('中断した受信を確認してから編集してください。');
    };
    const receiveAction = (action: () => Promise<MetadataSessionRead | void>) => execute(async () => {
      editable(true); receiveFailure = '';
      try {
        const result = await action(); await reloadReceive();
        if (!result && !last.source) { last = await session.read(); receiveDisplayPending = false; return; }
        receiveDisplayPending = true;
        const project = await ready(result ?? await session.read()); receiveDisplayPending = false; return project;
      } catch (error) {
        receiveFailure = error instanceof Error ? error.message : '受信できません。元のデータは保持しています。';
        await reloadReceive(); throw error;
      }
    }, true);
    const reviewAction = (action: (job: ReviewEditJob) => Promise<MetadataSessionRead | void>) => execute(async () => {
      if (closed || fs.mutationAuthority.accessState !== 'editable' || connection?.restorePending || restoreRetired || restoreDisplayPending)
        throw Error('編集を開始してからコピー作成を再開してください。');
      try {
        const result = await workspaceFileOperation(options.packageLocks ?? null, () => action(new ReviewEditJob(fs, session, limits)));
        await reloadReceive(); last = result ?? await session.read();
        if (last.state === 'ready' && !reviewPending()) { receiveDisplayPending = true; await ready(last); receiveDisplayPending = false; }
      } catch (error) { await reloadReceive(); throw error; }
    }, true);
    const workspaceFiles = {
      get jobs() { return receiveJobs; }, get error() { return receiveFailure; },
      get initialImport() { return !last.source && !localInitial && !reviewPending(); },
      get reviewCopies() { return reviewCopies; }, get reviewCopyError() { return reviewCopyError; },
      retryReviewCopy: (id: string) => reviewAction(job => job.retry(id)),
      reselectReviewCopy: (id: string, file: Blob) => reviewAction(job => job.reselect(id, file)),
      abandonReviewCopy: (id: string) => reviewAction(job => job.abandon(id)),
      refresh: () => execute(reloadReceive, true),
      receive: (token: string, file: Blob) => receiveAction(async () => {
        if (last.state !== 'ready' || token !== last.source?.token) throw Error('入力・更新を確定してから受信してください。');
        return receiver.receive(token, file);
      }),
      importWorkspace: (file: Blob) => receiveAction(async () => {
        if ((await inspectInput(file)).source.proof.identity.projectId !== `prj_${run}`)
          throw Error('別のプロジェクトです。プロジェクト一覧から開いてください。');
        return receiver.importWorkspace(file);
      }),
      retry: (id: string) => receiveAction(() => receiver.retry(id)),
      reselectInput: (token: string, id: string, file: Blob) => receiveAction(() => receiver.reselectInput(token, id, file)),
      reselectImportedInput: (id: string, file: Blob) => receiveAction(() => receiver.reselectImportedInput(id, file)),
      abandonInput: (id: string) => receiveAction(() => receiver.abandonInput(id)),
      cancelStale: (id: string) => receiveAction(() => receiver.cancelStale(id)),
    };
    if (options.reviewEdit) {
      try {
        const existing = reviewCopies.find(j => j.id === options.reviewEdit!.id);
        await reviewAction(job => existing ? job.retry(existing.id) : job.start(options.reviewEdit!));
      } catch (error) {
        // Before any parent evidence exists, only the caller still owns the exact attempt and View.
        if (!reviewCopies.some(j => j.id === options.reviewEdit!.id) && !reviewCopyError) throw error;
        // Otherwise retain the dedicated recovery Host, never silently return to a fresh destination.
      }
    }
    if (options.workspaceFile) {
      try { await (last.state === 'ready' && last.source ? workspaceFiles.receive(last.source.token, options.workspaceFile) :
        workspaceFiles.importWorkspace(options.workspaceFile)); }
      catch { /* File and incomplete originals stay available through the same recovery controls. */ }
    }
    const outputAction = <T>(action: () => Promise<T>, recovery = false) => execute(async () => {
      editable(); if (!recovery && (outputDiscoveryFailure || unfinishedOutput() || last.state !== 'ready')) throw Error('中断したファイル生成を確認してください。');
      outputFailure = '';
      try { return await action(); }
      catch (error) { outputFailure = error instanceof Error ? error.message : 'ファイル処理を完了できません。'; throw error; }
      finally { await reloadOutput(); }
    }, true);
    const workspaceOutput = {
      get jobs() { return outputJobs; }, get error() { return outputFailure || outputDiscoveryFailure; },
      get bases() { return outputBases; },
      generate: (token: string) => outputAction(() => sender.generate(token)),
      generateClean: (token: string) => outputAction(() => sender.generateClean(token)),
      previewClean: (token: string) => outputAction(() => sender.previewClean(token)),
      previewReview: (token: string, selection: Parameters<typeof sender.previewReview>[1]) => outputAction(() => sender.previewReview(token, selection)),
      generateReview: (token: string, selection: Parameters<typeof sender.generateReview>[1]) => outputAction(() => sender.generateReview(token, selection)),
      generateBackup: (token: string, label?: string) => outputAction(() => sender.generateBackup(token, label)),
      generateContribution: (token: string, selection: ContributionBaseChoice['selection']) => outputAction(() => sender.generateContribution(token, selection)),
      retry: (id: string) => outputAction(() => sender.retry(id), true),
      cancel: (id: string) => outputAction(() => sender.cancel(id), true),
      verifyFile: (id: string, file: Blob) => outputAction(() => sender.verifyFile(id, file), true),
      download: (id: string) => execute(() => {
        if (reviewPending()) throw Error('編集コピーの作成を完了してください。');
        if (connection?.restorePending || restoreRetired || restoreDisplayPending) throw Error('復元を完了してからファイルを渡してください。');
        return sender.download(id);
      }, true),
    };
    type PrepareRestoreDisplay = (next: SyntheticProject, source: typeof content) => Promise<void>;
    const restorePorts = () => ({ fs, factory: connection!.factory, session, store: options.store });
    const adoptSelected = async () => {
      // From this point even an opening/display failure must never expose the retired editor as editable.
      restoreRetired = true; restoreDisplayPending = true; restoreEpoch++;
      const previous = connection!, next = await openValidationGeneration(rootFs, options);
      connection = next; ({ fs, content, session } = next.service);
      receiver = new WorkspaceReceiver(options.base, fs, session, limits, options.packageLocks ?? null);
      sender = new WorkspaceSender(fs, session, options.store, limits, options.packageLocks ?? null);
      project = undefined; images = {}; localInitial = false;
      try {
        last = await session.read(); project = await projectFrom(last);
        if (last.state !== 'ready' || !project) throw Error('復元先の表示を再開してください。');
        await reloadReceive(); await reloadRestore(); receiveDisplayPending = false; receiveFailure = ''; restoreRetired = false;
      } finally {
        previous.service.content.releasePreparedImages(); previous.service.content.releasePreparedModels(); await previous.dispose();
      }
    };
    const restoreAction = <T>(action: () => Promise<T>) => execute(async () => {
      if (reviewPending()) throw Error('編集コピーの作成を完了してください。');
      if (!options.generations) throw Error('この画面では復元用の保存領域に接続できません。');
      if (closed || !lease.holdsWriteLock) throw Error('復元するには編集を開始してください。');
      restoreFailure = '';
      try { return await action(); }
      catch (error) { restoreFailure = error instanceof Error ? error.message : '復元を完了できません。元のデータは保持しています。'; throw error; }
      finally { await reloadRestore(); }
    }, true);
    const runRestore = async (job: BackupRestoreJob, prepare: PrepareRestoreDisplay) => {
      const staging = await job.openStaging(databases), destination = validationGenerationService(staging, options);
      try {
        const initialized = await destination.session.initializeBackup(job), next = await projectFrom(initialized, destination.content, {});
        if (!next) throw Error('復元するシーンを確認できません。');
        await prepare(next, destination.content);
        if (closed) throw Error('画面を閉じました。復元は未完了です。');
        await job.select(restorePorts(), destination, databases, scope => validationGenerationService(scope, options));
        await adoptSelected(); preparedRestore = undefined;
      } catch (error) {
        const control = await readRestoreControls(rootFs, limits);
        if (control.tail?.jobId === job.id && connection?.generationId !== job.id) {
          try { await adoptSelected(); } catch { /* Selected-data recovery stays visible; no old-generation fallback. */ }
        }
        throw error;
      } finally { destination.content.releasePreparedImages(); destination.content.releasePreparedModels(); await staging.dispose(); }
    };
    const backupRestore = {
      get enabled() { return !!options.generations; }, get error() { return restoreFailure; },
      get pending() { return !!connection?.restorePending || restoreRetired; }, get needsDisplay() { return restoreDisplayPending; },
      get epoch() { return restoreEpoch; },
      get cancellable() { return !!restoreControls.pending; },
      get retryable() { return restoreRetired || restoreDisplayPending || !!restoreControls.tail &&
        !restoreControls.jobs.find(j => j.id === restoreControls.tail!.jobId)?.result || !!restoreControls.pending?.start && restoreControls.pending.indexed; },
      prepare: (file: Blob) => restoreAction(async () => {
        editable(); if (last.state !== 'ready' || receiveDisplayPending || unfinishedReceive() || unfinishedOutput() || outputDiscoveryFailure)
          throw Error('未完了の更新を確認してください。');
        preparedRestore = await BackupRestoreJob.prepare(rootFs, restorePorts(), file, limits, databases);
      }),
      clearPreparation: () => { if (busy) throw Error('処理の完了をお待ちください。'); preparedRestore = undefined; },
      confirm: (prepare: PrepareRestoreDisplay) => restoreAction(async () => {
        if (!preparedRestore) throw Error('復元するファイルを選び直してください。');
        const job = await preparedRestore.persist(restorePorts(), databases); await reloadRestore(); await runRestore(job, prepare);
      }),
      retry: (prepare: PrepareRestoreDisplay) => restoreAction(async () => {
        await reloadRestore();
        if (restoreControls.pending) {
          const job = await BackupRestoreJob.open(rootFs, restoreControls.pending.id, limits, databases); await runRestore(job, prepare);
        } else {
          if (!restoreControls.tail) throw Error('再開する復元がありません。');
          await BackupRestoreJob.resumeSelection(rootFs, limits, databases, scope => validationGenerationService(scope, options));
          await adoptSelected(); await prepare(project!, content);
        }
      }),
      cancel: () => restoreAction(async () => {
        await reloadRestore(); const job = restoreControls.pending;
        if (!job) throw Error('切替済みの復元は取り消せません。');
        if (job.start) await BackupRestoreJob.cancel(rootFs, job.id, limits, databases);
        else await BackupRestoreJob.abandon(rootFs, job.id, limits, databases);
        preparedRestore = undefined;
      }),
      displayReady(token: string) {
        if (restoreRetired || connection?.restorePending || last.state !== 'ready' || token !== last.source?.token) throw Error('復元先を再確認してください。');
        restoreDisplayPending = false; restoreFailure = ''; failure = '';
      },
    };
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
      if (!Number.isSafeInteger(file.size) || file.size <= 0 || validationDeclaredBodyBytes(before.provider, limits) + file.size > options.fileLimits.maxFileBytes)
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
      read: () => { if (restoreRetired || !project) throw Error('再開用データの表示が未完了です。'); return project; },
      status: () => ({ kind: busy ? 'checking' : failure || connection?.restorePending || restoreRetired || restoreDisplayPending || receiveDisplayPending || unfinishedReceive() || last.state !== 'ready' ? 'failed' : 'idle',
        retryable: !(connection?.restorePending || restoreRetired || restoreDisplayPending),
        error: restoreFailure || failure || (connection?.restorePending || restoreRetired || restoreDisplayPending ? 'バックアップの復元が未完了です。' : '') || (receiveDisplayPending ? receiveFailure : '') || (unfinishedReceive() ? '「更新ファイル」の中断した受信を確認してください。' : '更新が未完了です。') }),
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
          const orderKey = orderBetween(orders.at(-1) ?? null, null);
          if (!Number.isSafeInteger(file.size) || file.size <= 0 || validationDeclaredBodyBytes(before.provider, limits) + file.size > options.fileLimits.maxFileBytes)
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
      replaceModelFile: (token, input: ModelFileReplacement) => {
        const target = { sceneId: input.sceneId, assetId: input.assetId, expectedBindingId: input.expectedBindingId }, selected = input.file;
        const file = { name: selected.name, size: selected.size, arrayBuffer: selected.arrayBuffer.bind(selected) };
        return execute(async () => {
          editable(); const before = await session.read();
          if (before.state !== 'ready' || before.source?.token !== token || before.provider?.kind !== 'scene-provider')
            throw Error('対象が更新されています。差し替えるモデルを確認してください。');
          const versions = await validationModelVersions(before.provider);
          const source = versions.find(v => v.assetId === target.assetId && v.projection.bindingId === target.expectedBindingId)?.closure;
          const view = authority.read(), scene = resolveScene(view.state, view.resources, target.sceneId);
          if (!source || source.shape !== 'saved-glb' || scene.kind !== 'ready' || !scene.composition.assets.some(a => a.assetId === target.assetId))
            throw Error('差し替えるモデルを確認してください。');
          if (!Number.isSafeInteger(file.size) || file.size <= 0 || validationDeclaredBodyBytes(before.provider, limits) + file.size > options.fileLimits.maxFileBytes)
            throw Error('モデルを含む合計がこの検証の上限を超えています。');
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.length !== file.size) throw Error('選択したモデルの大きさが一致しません。');
          const prepared = await content.prepareModel({ label: file.name, bytes }, target.assetId);
          try {
            const binding = await sealValidationRecord('asset-binding-revision', { id: prepared.binding.id!, assetId: target.assetId,
              assetRevisionId: prepared.revision.id!, parentBindingId: source.binding.id, method: 'manual', assetToProject: source.binding.assetToProject as unknown as JsonObject });
            const result = await ready(await session.edit(token, { kind: 'replaceAssetModel', ...target,
              revision: prepared.revision, representation: prepared.representation, binding }));
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
      retry: () => execute(async () => { editable(true); return resume(); }),
    };
    const emptyImport = () => !localInitial && last.state === 'empty' && !outputDiscoveryFailure && !unfinishedReceive() && !unfinishedOutput();
    const host: SavedWorkspaceHost = { authority, limits, read: () => last, hasPending: () => busy || !!connection?.restorePending || restoreRetired || restoreDisplayPending || receiveDisplayPending || unfinishedReceive() ||
      !emptyImport() && (!!failure || last.state !== 'ready'),
      refresh: () => execute(async () => { await reloadReceive(); last = await session.read(); await projectView(last); return last; }),
      resolve: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      dispose: async () => { await dispose(); content.releasePreparedImages(); content.releasePreparedModels(); prepareDisplay = undefined; } };
    return { ...host, get content() { return content; }, workspaceFiles, workspaceOutput, backupRestore, display: () => restoreRetired ? undefined : project,
      get accessDetail() { return options.mode === 'view' ? '閲覧専用です。' : lease.accessDetail; },
      setDisplayPreparation(callback: (next: SyntheticProject) => Promise<void>) {
      if (closed || prepareDisplay) throw Error('モデル表示の接続を確認してください。');
      prepareDisplay = callback; return () => { if (prepareDisplay === callback) prepareDisplay = undefined; };
    } };
  } catch (error) { await dispose(); throw error; }
}
