import { createGsProxyWorkflow } from './gsProxyWorkflow';
import { assertValidationBodyAllocation } from '../projectFiles/bodyBudget';
import type { PhotoDecoder } from '../projectFiles/photo';
import type { MediaDecoders } from '../projectFiles/media';
import type { WorkspaceFS } from '../platform/fs';
import { ProjectMutationCoordinator, type ProjectMutationSession } from '../platform/projectLock';
import { technicalId, newId, metadataPath, json } from '../projectMetadata/persistence';
import { TransactionJournal } from '../projectMetadata/journal';
import type { MetadataStorageFactory } from '../projectMetadata/repository';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { unreceivedWeakMedia, type MetadataSessionRead } from '../projectMetadata/session';
import type { MetadataEdit } from '../projectMetadata/commands';
import { captionDeletionImpact } from '../projectMetadata/captionDeletion';
import { assetDeletionImpact } from '../projectMetadata/assetDeletion';
import { prepareValidationCreation, resumeValidationCreation, validationProjectService } from '../projectFiles/creation';
import { hasNativeConversion, resumeNativeConversion } from '../projectFiles/nativeConversion';
import { nativeSpatialConversionSourceRequired } from '../projectFiles/nativeSpatialConversion';
import { hasFrozenV1Conversion, resumeFrozenV1Conversion, hasFrozenV1MaterialReport, readFrozenV1MaterialReport } from '../projectFiles/frozenV1Conversion';
import { hasLociMyuConversion, resumeLociMyuConversion, readLociMyuConversionReport } from '../projectFiles/lociMyuConversion';
import { validationMetadataLimits as limits, type FileValidationLimits, type ProjectFilePolicy } from '../projectFiles/validation';
import type { PngDecoder } from '../projectFiles/png';
import type { JpegDecoder } from '../projectFiles/jpeg';
import { sealValidationRecord, validationModelFile } from '../projectFiles/initialProject';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { metadataProjectView } from './providerProjection';
import { validationModelVersions } from './validationProjection';
import type { ProjectDisplay } from './displayTypes';
import type { ProjectAuthority } from './hostPorts';
import type { SavedWorkspaceHost, LocalOpenMode } from './hostPorts';
import type { MediaImage, MediaFileAddition } from './mediaDisplay';
import type { ModelPlacementCommand, ModelFileAddition, ModelFileReplacement } from './modelTypes';
import { isSavedModel, isSavedMesh } from './modelTypes';
import { classifyMeshSource } from '../projectFiles/meshSource';
import { orderBetween } from './viewDisplay';
import { resolveScene } from '../scene/resolve';
import { validationMaterialSlots, validationMaterialIssue } from './validationMaterials';
import { same } from '../domain/projectGraphSupport';
import type { MaterialIntent } from '../domain/materialIntent';
import { selectedMaterialResolution } from '../projectMetadata/materialResolution';
import { WorkspaceReceiver, workspaceFileOperation, type WorkspaceReceiveState } from '../projectFiles/receiveWorkspace';
import type { PreparedReviewEdit } from '../projectPackage/reviewEdit';
import { ReviewEditJob } from '../projectPackage/reviewEditJob';
import { reviewEditChildBinding, type ReviewEditState, type ReviewEditBinding } from '../projectPackage/reviewEditControls';
import { WorkspaceSender, type WorkspaceOutputState, type ContributionBaseChoice } from '../projectFiles/sendWorkspace';
import { WorkspaceArchive } from '../projectPackage/workspaceArchive';
import { CleanArchive } from '../projectPackage/cleanArchive';
import { PackageArchive } from '../projectPackage/zipArchive';
import { BackupRestoreJob, type RestoreDatabasePorts } from '../projectPackage/backupRestoreJob';
import { readRestoreControls } from '../projectPackage/restoreControls';
import { PACKAGE_LIMITS, type EvidenceRef } from '../projectPackage/contract';
import { BackupArchive } from '../projectPackage/backupArchive';
import { openValidationGeneration, validationGenerationDatabases, validationGenerationService, inspectValidationFirstBackup } from './validationGeneration';

export const validationArea = 'lociview-development-validation-1';
export type ValidationTiming = (stage: string, milliseconds: number) => void;
/** Optional local diagnostics; observers never change an operation's outcome. */
export function measureValidation<T>(observer: ValidationTiming | undefined, stage: string, action: () => Promise<T>): Promise<T> {
  if (!observer) return action();
  const started = performance.now();
  return action().finally(() => { try { observer(stage, performance.now() - started); } catch { /* Diagnostics have no authority. */ } });
}
export interface ValidationHostOptions {
  timing?: ValidationTiming;
  /** Typed UI reads images through its scoped per-resource port. Legacy projection stays eager. */
  lazyImages?: boolean;
  mode?: LocalOpenMode;
  run: string; base: WorkspaceFS; coordinator: ProjectMutationCoordinator; store: OriginBlobStore;
  fileLimits: FileValidationLimits; filePolicy?: ProjectFilePolicy; decode?: PngDecoder; jpeg?: JpegDecoder; photo?: PhotoDecoder; mediaDecoders?:MediaDecoders; initial?: ReturnType<typeof prepareValidationCreation>;
  workspaceFile?: Blob;
  reviewEdit?: PreparedReviewEdit;
  firstBackup?: Readonly<{ file: Blob; archive: EvidenceRef }>;
  packageLocks?: LockManager | null;
  generations?: (run: string) => RestoreDatabasePorts;
  openStorage(allowCreate: boolean): Promise<{ factory: MetadataStorageFactory; dispose(): Promise<void> }>;
}

export type ValidationNormalHost = Awaited<ReturnType<typeof openValidationHost>>;
type FirstRestoreDisplay = (next: ProjectDisplay, content: ValidationNormalHost['content']) => Promise<void>;
export interface FirstBackupRecovery {
  readonly kind: 'first-backup-recovery'; readonly run: string; readonly readOnly: boolean;
  state(): Readonly<{ phase: 'preview' | 'beforeStart' | 'pending' | 'terminal'; title: string; fileName: string | null; memo: string | null; error: string; replacing: boolean; cancellable: boolean; retryable: boolean }>;
  confirm(prepare: FirstRestoreDisplay): Promise<ValidationNormalHost>;
  retry(prepare: FirstRestoreDisplay): Promise<ValidationNormalHost>;
  edit(): Promise<ValidationNormalHost | FirstBackupRecovery>;
  cancel(): Promise<void>; abandon(): Promise<void>; dispose(): Promise<void>;
}

/** First-only recovery owns the root lease until a real selected Host accepts it once. */
export async function openValidationEntry(options: ValidationHostOptions): Promise<ValidationNormalHost | FirstBackupRecovery> {
  const run = technicalId(options.run), root = `${validationArea}/${run}`;
  if (options.firstBackup && (options.initial || options.workspaceFile || options.reviewEdit || options.mode === 'view'))
    throw Error('バックアップを一つ選択し、編集で復元してください。');
  const input = options.firstBackup ? { file: options.firstBackup.file.slice(0), archive: { ...options.firstBackup.archive } } : undefined;
  const archive = input ? await BackupArchive.inspect(input.file, limits) : undefined;
  const inputName = options.firstBackup && 'name' in options.firstBackup.file && typeof options.firstBackup.file.name === 'string' ? options.firstBackup.file.name.slice(0, 256) : null;
  if (archive && (archive.source.proof.identity.projectId !== `prj_${run}` || archive.archive.sha256 !== input!.archive.sha256 || archive.archive.byteLength !== input!.archive.byteLength))
    throw Error('バックアップと開く場所が一致しません。');
  const lease = options.mode === 'view' ? options.coordinator.openView(options.base, root, `${validationArea}:${run}`) :
    await options.coordinator.tryAcquire(options.base, root, `${validationArea}:${run}`);
  const ordinary = { ...options, firstBackup: undefined }, databases = validationGenerationDatabases(options);
  let handedOff = false, closed = false, busy = false, operation: Promise<unknown> | undefined, failure = '', selectedRecovery = false;
  let prepared: BackupRestoreJob | undefined, existing: ValidationNormalHost | undefined;
  let title = '名前を確認できないプロジェクト', memo: string | null = null;
  let control: Awaited<ReturnType<typeof inspectValidationFirstBackup>>;
  const release = async () => { lease.beginClose(); await lease.waitForWorkspaceIdle(); lease.sealWorkspaceWritesForRelease(); lease.release(); };
  try {
    control = await inspectValidationFirstBackup(lease.workspace, options);
    if (!input && !control) { const opened = await openNormalValidationHost(ordinary, lease); handedOff = true; return opened; }
    if (input && !control) {
      const controls = await readRestoreControls(lease.workspace, limits);
      const rootPaths = await lease.workspace.list(`${root}/`);
      if (controls.selection || rootPaths.some(path => !path.startsWith(`${root}/v2/local-restore/`)) || await databases.originalDatabasePresent?.() === true) {
        existing = await openNormalValidationHost(ordinary, lease); await existing.backupRestore.prepare(input.file);
      } else prepared = await BackupRestoreJob.prepareFirstOpen(lease.workspace, input.file, limits, databases);
    } else if (input && control) {
      if (control.controls.pending) throw Error('先に中断したバックアップの復元を確認してください。');
      prepared = await BackupRestoreJob.prepareFirstOpen(lease.workspace, input.file, limits, databases);
    }
    const knownArchive = archive ?? (control?.controls.pending?.start ? (await BackupRestoreJob.open(lease.workspace, control.owner.id, limits, databases)).inspection : undefined);
    if (knownArchive) {
      const fields = (await knownArchive.source.inspectOriginal({ maxNodes: PACKAGE_LIMITS.inspectionNodes, maxWork: PACKAGE_LIMITS.inspectionWork })).candidates.fields,
        field = fields.find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'title'), candidate = field?.valid && field.candidates.length === 1 ? field.candidates[0]?.value : undefined;
      if (candidate?.kind === 'value' && typeof candidate.value === 'string' && candidate.value.trim()) title = candidate.value;
      memo = knownArchive.archive.control.manifest.memo ?? null;
    }
  } catch (error) { if (existing) await existing.dispose(); else if (!handedOff) await release(); throw error; }
  const reload = async () => { const records = await readRestoreControls(lease.workspace, limits); selectedRecovery = !!records.selection;
    control = await inspectValidationFirstBackup(lease.workspace, options); if (control?.controls.pending || selectedRecovery) prepared = undefined; };
  const activate = () => { if (!lease.holdsWriteLock || options.mode === 'view') throw Error('編集を開始して復元してください。');
    if (lease.accessState !== 'editable') lease.activateNewProject(); };
  const execute = async <T>(action: () => Promise<T>): Promise<T> => {
    if (closed || busy || handedOff) throw Error('復元の処理を確認してください。'); busy = true; failure = '';
    const work = action(); operation = work;
    try { return await work; } catch (error) { failure = error instanceof Error ? error.message : '復元を完了できません。';
      try { await reload(); } catch { /* Keep the first failure and retained bytes. */ } throw error;
    } finally { busy = false; if (operation === work) operation = undefined; }
  };
  const adopt = async () => {
    if (closed) throw Error('画面を閉じました。復元先は再度開いて確認してください。');
    const opened = await openNormalValidationHost(ordinary, lease); handedOff = true; return opened;
  };
  const runJob = async (job: BackupRestoreJob, prepare: FirstRestoreDisplay) => {
    const staging = await job.openStaging(databases), service = validationGenerationService(staging, options);
    try {
      const read = await service.session.initializeBackup(job), next = await validationProjectFrom(read, service.content);
      if (!next) throw Error('復元先の表示を確認できません。');
      await prepare(next, service.content);
      if (closed) throw Error('画面を閉じました。復元記録は保持しています。');
      await job.select(null, service, databases, scope => validationGenerationService(scope, options));
    } finally { service.content.releasePreparedImages(); service.content.releasePreparedModels(); await staging.dispose(); }
    return adopt();
  };
  return {
    kind: 'first-backup-recovery', run, get readOnly() { return options.mode === 'view' || !lease.holdsWriteLock; },
    state: () => ({ phase: selectedRecovery || existing && (existing.backupRestore.pending || existing.backupRestore.needsDisplay) ? 'pending' : prepared || existing ? 'preview' : control?.controls.pending ? control.owner.start ? 'pending' : 'beforeStart' : 'terminal',
      title, fileName: inputName, memo, error: failure, replacing: !!existing,
      cancellable: !selectedRecovery && (existing ? existing.backupRestore.cancellable || !existing.backupRestore.pending : !!prepared || !!control?.controls.pending),
      retryable: !!existing?.backupRestore.retryable || selectedRecovery || !!control?.controls.pending?.indexed }),
    confirm: prepare => execute(async () => {
      if (existing) { await existing.backupRestore.confirm(prepare); handedOff = true; return existing; }
      if (!prepared) throw Error('復元するファイルを確認してください。');
      activate(); const job = await prepared.persist(null, databases); prepared = undefined; return runJob(job, prepare);
    }),
    retry: prepare => execute(async () => {
      if (existing) { await existing.backupRestore.retry(prepare); handedOff = true; return existing; }
      activate(); await reload();
      const controls = await readRestoreControls(lease.workspace, limits);
      if (controls.selection) { await BackupRestoreJob.resumeSelection(lease.workspace, limits, databases, scope => validationGenerationService(scope, options)); return adopt(); }
      if (!control?.controls.pending?.start) throw Error('開始前の復元記録を取りやめ、ファイルを選び直してください。');
      return runJob(await BackupRestoreJob.open(lease.workspace, control.owner.id, limits, databases), prepare);
    }),
    edit: () => execute(async () => {
      if (lease.holdsWriteLock && options.mode !== 'view') throw Error('すでに編集用の復元を開いています。');
      lease.release();
      const candidate = await openValidationEntry({ ...options, mode: 'edit', firstBackup: input ? { ...input, file: inputName ? new File([input.file], inputName) : input.file } : undefined });
      if ('kind' in candidate ? candidate.readOnly : candidate.authority.readOnly) { await candidate.dispose(); throw Error('別のタブで編集中です。この確認画面から再試行できます。'); }
      handedOff = true; return candidate;
    }),
    cancel: () => execute(async () => {
      if (existing) { if (existing.backupRestore.pending) await existing.backupRestore.cancel(); else existing.backupRestore.clearPreparation(); return; }
      if (prepared) { prepared = undefined; return; }
      activate(); await reload(); if (!control?.controls.pending?.start) throw Error('取りやめる復元を確認してください。');
      await BackupRestoreJob.cancel(lease.workspace, control.owner.id, limits, databases); await reload();
    }),
    abandon: () => execute(async () => { activate(); await reload(); if (!control?.controls.pending || control.owner.start) throw Error('開始前の復元記録を確認してください。');
      await BackupRestoreJob.abandon(lease.workspace, control.owner.id, limits, databases); await reload(); }),
    async dispose() { if (closed) return; closed = true; try { await operation; } catch { /* Retain failed input. */ }
      if (!handedOff) { if (existing) await existing.dispose(); else await release(); } },
  };
}
const base64 = (bytes: Uint8Array) => { let text = ''; for (let n = 0; n < bytes.length; n += 8192)
  text += String.fromCharCode(...bytes.subarray(n, n + 8192)); return btoa(text); };

async function validationProjectFrom(read: MetadataSessionRead, sourceContent: ReturnType<typeof validationProjectService>['content'], cache: Record<string, MediaImage> = {}, lazyImages = false) {
  if (read.provider?.kind !== 'scene-provider') return;
  const versions = await validationModelVersions(read.provider), unavailable = unreceivedWeakMedia(read.provider, limits), available: Record<string, MediaImage> = {};
  for (const [id, field] of Object.entries(read.provider.details.immutable.mediaResourcesById)) {
    if (unavailable.has(id)) continue;
    if (field.kind !== 'value') throw Error('保存したメディアの情報を確認できません。');
    if (lazyImages) continue;
    if (!cache[id]) cache[id] = { record: field.value as unknown as MediaImage['record'], base64: base64(await sourceContent.image(field.value)) };
    available[id] = cache[id]!;
  }
  return { ...metadataProjectView(read.provider, available, versions), mediaChoices: lazyImages ? Object.entries(read.provider.details.immutable.mediaResourcesById)
    .flatMap(([id, field]) => !unavailable.has(id) && field.kind === 'value' ? [field.value as unknown as MediaImage['record']] : []) : Object.values(available).map(i => i.record), validationFiles: true };
}

/** New validation namespace only; no synthetic seed, guessed Project or old-store fallback. */
export async function openValidationHost(options: ValidationHostOptions) {
  if (options.firstBackup) throw Error('バックアップの初回復元用の入口を使ってください。');
  return openNormalValidationHost(options);
}
async function openNormalValidationHost(options: ValidationHostOptions, inheritedLease?: ProjectMutationSession) {
  const measure = <T>(stage: string, action: () => Promise<T>) => measureValidation(options.timing, stage, action);
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
  const lease = inheritedLease ?? (options.mode === 'view' ? options.coordinator.openView(options.base, root, `${validationArea}:${run}`) :
    await options.coordinator.tryAcquire(options.base, root, `${validationArea}:${run}`));
  let connection: Awaited<ReturnType<typeof openValidationGeneration>> | undefined, operation: Promise<unknown> | undefined;
  let closed = false, busy = false, failure = '', ownsLease = !inheritedLease;
  const dispose = async () => { if (closed) return; closed = true; if (ownsLease) lease.beginClose();
    try { await operation; } catch { /* Stored journal/initial input remain authoritative, never silently discarded. */ }
    await lease.waitForWorkspaceIdle(); if (ownsLease) { lease.sealWorkspaceWritesForRelease(); lease.release(); } await connection?.dispose(); };
  try {
    if (await inspectValidationFirstBackup(lease.workspace, options)) throw Error('バックアップの初回復元を専用の入口から再開してください。');
    const fresh = !(await options.base.list(`${root}/`)).length;
    if (fresh && (!(options.initial || incoming || options.reviewEdit) || !lease.holdsWriteLock)) throw Error('保存データがありません。プロジェクトを選び直してください。');
    if (!fresh && options.initial) throw Error('作成先に保存データがあります。既存データは変更していません。');
    if (fresh) lease.activateNewProject();
    connection = await openValidationGeneration(lease.workspace, options, fresh && !!(options.initial || incoming || options.reviewEdit) && lease.holdsWriteLock);
    let { fs, content, session } = connection.service;
    let receiver = new WorkspaceReceiver(options.base, fs, session, limits, options.packageLocks ?? null);
    let sender = new WorkspaceSender(fs, session, options.store, limits, options.packageLocks ?? null, options.timing ? (stage, ms) => options.timing!(`host.backup.${stage}`, ms) : undefined);
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
    const reloadOutput = async (current?: MetadataSessionRead) => {
      try {
        if (unfinishedReceive()) {
          outputJobs = await measure('host.output.jobs', () => sender.jobs());
          outputBases = await measure('host.output.bases', () => sender.availableBases());
        } else {
          const overview = await measure('host.output.overview', () => current ? sender.outputOverview(current) : sender.outputOverview());
          outputJobs = overview.jobs; outputBases = overview.bases;
        }
        outputDiscoveryFailure = '';
      }
      catch (error) { outputBases = []; outputDiscoveryFailure = error instanceof Error ? error.message : '受け渡しの記録を確認できません。'; }
    };
    const unfinishedOutput = () => outputJobs.some(j => ['unstarted', 'incomplete', 'repair-required'].includes(j.state));
    let receiveJobs: WorkspaceReceiveState[] = [], receiveFailure = '', receiveDisplayPending = false;
    let reviewCopies: ReviewEditState[] = [], reviewCopyError = '';
    const reviewPending = () => !!reviewCopyError || reviewCopies.some(j => !['completed', 'abandoned'].includes(j.state));
    const unfinishedReceive = () => reviewPending() || receiveJobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state));
    const reloadReceive = async (current?: MetadataSessionRead) => {
      const completed = new Map<string, Readonly<ReviewEditBinding>>();
      try { reviewCopies = await measure('host.receive.review-copies', () => new ReviewEditJob(fs, session, limits).states(child => completed.set(child.childId, child.binding))); reviewCopyError = ''; }
      catch { completed.clear(); reviewCopyError = '編集コピーの元データを確認できません。修復が必要です。'; }
      const jobs = await measure('host.receive.jobs', () => receiver.jobs({ completedReviewChildren: completed })); receiveJobs = [];
      const children = new Set(reviewCopies.flatMap(j => j.childId ? [j.childId] : []));
      for (const job of jobs) {
        if (children.has(job.id) || await reviewEditChildBinding(fs, job.id, limits).catch(() => true)) continue;
        receiveJobs.push(job);
      }
      await reloadOutput(!unfinishedReceive() && current?.state === 'ready' ? current : undefined);
    };
    await reloadReceive();
    let last = await session.read(), project: ProjectDisplay | undefined;
    if (incoming instanceof CleanArchive && last.source) throw Error('この独立コピーの再開用データがあります。ファイルを取り込まず、プロジェクト一覧から再開してください。');
    if (last.source && (last.source.proof.identity.projectId !== `prj_${run}` || incoming && json(last.source.proof) !== json(incoming.source.proof)))
      throw Error('ファイルと再開用データのプロジェクトが一致しません。既存データは変更していません。');
    let localInitial = !!options.initial || await hasNativeConversion(fs, false) || await hasLociMyuConversion(fs, false) || await hasFrozenV1Conversion(fs, false) || !!await fs.readStream(metadataPath(fs, 'validation-initial.json')) ||
      (await new TransactionJournal(fs, limits).entries()).some(e => e.start.purpose === 'initialize');
    let prepareDisplay: ((next: ProjectDisplay) => Promise<void>) | undefined;
    let images: Record<string, MediaImage> = {};
    const projectFrom = async (read: MetadataSessionRead, sourceContent = content, cache = images) => {
      if (read.source && read.source.proof.identity.projectId !== `prj_${run}`) throw Error('保存領域とプロジェクトが一致しません。');
      return validationProjectFrom(read, sourceContent, cache, options.lazyImages);
    };
    const projectView = async (read: MetadataSessionRead) => {
      const next = await measure('host.display.data', () => projectFrom(read)); if (!next) return;
      await measure('host.display.prepare', async () => { await prepareDisplay?.(next); });
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
    let gsProxy:ReturnType<typeof createGsProxyWorkflow>|undefined;
    const resume = async (reselected?: Blob) => {
      if (unfinishedReceive()) throw Error('「更新ファイル」の中断した受信を確認してください。');
      if (receiveDisplayPending && last.state === 'ready') {
        const result = await ready(await session.read()); receiveFailure = ''; receiveDisplayPending = false; return result;
      }
      const before = await session.read(), entries = await new TransactionJournal(fs, limits).entries();
      if (before.state === 'empty' && !localInitial) throw Error('作業一式を選択するか、プロジェクト一覧へ戻ってください。');
      const initializing = before.state === 'empty' || entries.length === 1 && entries[0]!.start.purpose === 'initialize' && !entries[0]!.publication && before.state !== 'ready';
      const result = await ready(initializing && await hasNativeConversion(fs) ? await resumeNativeConversion(fs, options.store, session, options.filePolicy ?? options.fileLimits, `prj_${run}`, options.decode, options.jpeg, options.photo, reselected) :
        before.state === 'empty' && options.initial ? await options.initial.persist(fs, options.store, session) :
        initializing && await hasLociMyuConversion(fs) ? await resumeLociMyuConversion(fs, options.store, session, options.fileLimits, `prj_${run}`, options.decode, options.jpeg, options.photo) :
        initializing && await hasFrozenV1Conversion(fs) ? await resumeFrozenV1Conversion(fs, options.store, session, options.fileLimits, `prj_${run}`, options.decode, options.jpeg, options.photo) :
        initializing ? await resumeValidationCreation(fs, session, `prj_${run}`) : await session.retry());
      gsProxy?.completed();content.releasePreparedImages(); content.releasePreparedModels(); return result;
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
        const result = await measure('host.review-copy.command', () => workspaceFileOperation(options.packageLocks ?? null, () => action(new ReviewEditJob(fs, session, limits))));
        await reloadReceive(result || undefined); last = result ?? await session.read();
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
      generate: (token: string) => measure('host.workspace.total', () => outputAction(() => measure('host.workspace.generate', () => sender.generate(token)))),
      generateClean: (token: string) => outputAction(() => sender.generateClean(token)),
      previewClean: (token: string) => outputAction(() => sender.previewClean(token)),
      previewReview: (token: string, selection: Parameters<typeof sender.previewReview>[1]) => outputAction(() => sender.previewReview(token, selection)),
      generateReview: (token: string, selection: Parameters<typeof sender.generateReview>[1]) => outputAction(() => sender.generateReview(token, selection)),
      generateBackup: (token: string, label?: string) => measure('host.backup.total', () => outputAction(() => measure('host.backup.generate', () => sender.generateBackup(token, label)))),
      generateContribution: (token: string, selection: ContributionBaseChoice['selection']) => measure('host.contribution.total', () => outputAction(() => measure('host.contribution.generate', () => sender.generateContribution(token, selection)))),
      retry: (id: string) => outputAction(() => sender.retry(id), true),
      cancel: (id: string) => outputAction(() => sender.cancel(id), true),
      verifyFile: (id: string, file: Blob) => measure('host.file.verify.total', () => outputAction(() => measure('host.file.verify', () => sender.verifyFile(id, file)), true)),
      download: (id: string) => measure('host.download', () => execute(() => {
        if (reviewPending()) throw Error('編集コピーの作成を完了してください。');
        if (connection?.restorePending || restoreRetired || restoreDisplayPending) throw Error('復元を完了してからファイルを渡してください。');
        return sender.download(id);
      }, true)),
    };
    type PrepareRestoreDisplay = (next: ProjectDisplay, source: typeof content) => Promise<void>;
    const restorePorts = () => ({ fs, factory: connection!.factory, session, store: options.store });
    const adoptSelected = async () => {
      // From this point even an opening/display failure must never expose the retired editor as editable.
      restoreRetired = true; restoreDisplayPending = true; restoreEpoch++;
      const previous = connection!, next = await openValidationGeneration(rootFs, options);
      connection = next; ({ fs, content, session } = next.service);
      receiver = new WorkspaceReceiver(options.base, fs, session, limits, options.packageLocks ?? null);
      sender = new WorkspaceSender(fs, session, options.store, limits, options.packageLocks ?? null, options.timing ? (stage, ms) => options.timing!(`host.backup.${stage}`, ms) : undefined);
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
      if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > content.limits.maxFileBytes)
        throw Error('メディアを含む合計がこの検証の上限を超えています。');
      assertValidationBodyAllocation(before.provider,content.policy,file.size);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length !== file.size) throw Error('選択したメディアの大きさが一致しません。');
      const media = await content.prepareImage({ label: file.name, bytes });
      try { const result = await ready(await session.edit(token, { kind: 'createAttachment', ...target, media, altText: '' }));
        content.releasePreparedImages(); return result;
      } catch (error) { if ((await session.read()).state === 'ready') content.releasePreparedImages(); throw error; }
      }, true);
    };
    // Both UI compositions share the same command, profile and publication boundary.
    const commitCommand = (token: string, input: MetadataEdit | (() => MetadataEdit)) => execute(async () => {
      editable();
      const command = typeof input === 'function' ? input() : input;
      if (command.kind === 'createMaterial' || command.kind === 'editMaterial') {
        const current = command.kind === 'editMaterial' ? project?.materialData?.records[command.overrideId] : undefined;
        const routing = command.kind === 'createMaterial' ? command.routing : current?.routing.kind === 'value' ? current.routing.value : null;
        const compositing = command.compositing ?? (current?.compositing.kind === 'value' ? current.compositing.value : null);
        const slots = project?.modelVersions?.flatMap(v => isSavedMesh(v.closure) ? validationMaterialSlots(v.closure) : []) ?? [];
        const slot = slots.find(s => same(s.target as unknown as JsonObject, routing?.target as JsonObject | undefined));
        if (!slot || !compositing) throw Error('設定するモデルと材質を確認してください。');
        const issue = validationMaterialIssue(slot, { appearance: command.appearance ?? (current?.appearance.kind === 'value' ? current.appearance.value : undefined), compositing } as MaterialIntent, project?.semanticProfile);
        if (issue) throw Error(issue);
      }
      if (command.kind === 'resolveMaterialIntent' || command.kind === 'resolveMaterialDuplicates') {
        const before = await session.read();
        if (before.state !== 'ready' || before.provider?.kind !== 'scene-provider' || before.source?.token !== token) throw Error('材質が更新されています。選び直してください。');
        const selected = (()=>{try{return selectedMaterialResolution(before.provider, command, limits);}catch(error){
          if(error instanceof Error&&'code' in error&&error.code==='material-unsupported')throw Error('選択した見え方は、このモデルでは使用できません。別の設定を選択してください。');
          throw error;
        }})();
        const versions = await validationModelVersions(before.provider);
        const slots = versions.flatMap(v => isSavedMesh(v.closure) ? validationMaterialSlots(v.closure) : []);
        const slot = slots.find(s => same(s.target as unknown as JsonObject, selected.routing.target));
        if (!slot) throw Error('設定するモデルと材質を確認してください。');
        for (const [id,intent] of selected.intents) {
          if(command.kind==='resolveMaterialDuplicates'&&id!==command.overrideId)continue;
          const issue = validationMaterialIssue(slot, intent, before.provider.semanticProfile); if (issue) throw Error(issue);
        }
      }
      const display = await ready(await measure('host.edit', () => session.edit(token, command)));
      return { display, read: last };
    }, true);
    const dispatch = async (token: string, command: MetadataEdit) => (await commitCommand(token, command)).read;
    gsProxy=createGsProxyWorkflow(content,async()=>{editable();const r=await session.read();if(r.state!=='ready'||!r.provider)throw Error('更新を完了してください。');return r.provider;},(token,command)=>execute(async()=>{editable();return ready(await session.edit(token,command));},true));
    const authority: ProjectAuthority = {
      prepareGsProxy: gsProxy.prepare, commitGsProxy: gsProxy.commit, cancelGsProxy: gsProxy.cancel,
      storage: 'saved-development', writeScope: 'caption-text',
      capabilities: { pins: true, membership: true, color: true, views: true, media: true, materials: true, sceneAuthoring: true, placement: true, transform: true },
      get readOnly() { return closed || fs.mutationAuthority.accessState !== 'editable'; },
      read: () => { if (restoreRetired || !project) throw Error('再開用データの表示が未完了です。'); return project; },
      status: () => ({ kind: busy ? 'checking' : failure || connection?.restorePending || restoreRetired || restoreDisplayPending || receiveDisplayPending || unfinishedReceive() || last.state !== 'ready' ? 'failed' : 'idle',
        retryable: !(connection?.restorePending || restoreRetired || restoreDisplayPending),
        error: restoreFailure || failure || (connection?.restorePending || restoreRetired || restoreDisplayPending ? 'バックアップの復元が未完了です。' : '') || (receiveDisplayPending ? receiveFailure : '') || (unfinishedReceive() ? '「更新ファイル」の中断した受信を確認してください。' : '更新が未完了です。') }),
      authorScene: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      reparentPin: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      captionDeletionImpact: (token, id) => { if (last.provider?.kind !== 'scene-provider' || token !== last.provider.token) throw Error('内容が更新されています。'); return captionDeletionImpact(last.provider, id, limits); },
      deleteCaption: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      assetDeletionImpact: (token, id) => { if (last.provider?.kind !== 'scene-provider' || token !== last.provider.token) throw Error('内容が更新されています。'); return assetDeletionImpact(last.provider, id, limits); },
      deleteAsset: (token, command) => execute(async () => { editable(); return ready(await session.edit(token, command)); }, true),
      addMediaFile,
      addModelFile: (token, input: ModelFileAddition) => {
        const target = { sceneId: input.sceneId, assetId: input.assetId }, selected = input.file;
        const file = { name: selected.name, size: selected.size, blob: selected.blob?.slice(), arrayBuffer: selected.arrayBuffer.bind(selected) };
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
          if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > content.policy.gs.maxFileBytes || !file.blob&&file.size>content.limits.maxFileBytes)
            throw Error('モデルを含む合計がこの検証の上限を超えています。');
          assertValidationBodyAllocation(before.provider,content.policy,file.size);
          const input = file.blob ? await validationModelFile({label:file.name,file:file.blob},content.policy) : {label:file.name,bytes:new Uint8Array(await file.arrayBuffer())};
          if ((input.file ? input.file.size : input.bytes.length) !== file.size) throw Error('選択したモデルの大きさが一致しません。');
          const records = await content.prepareModel(input, target.assetId);
          try {
            const result = await ready(await session.edit(token, { kind: records.representation.role==='gsPrimary' ? 'addGsAsset' : 'addAsset', sceneId: target.sceneId, ...records,
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
          if (!source || !isSavedMesh(source) || scene.kind !== 'ready' || !scene.composition.assets.some(a => a.assetId === target.assetId))
            throw Error('差し替えるモデルを確認してください。');
          if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > content.limits.maxFileBytes)
            throw Error('モデルを含む合計がこの検証の上限を超えています。');
          assertValidationBodyAllocation(before.provider,content.policy,file.size);
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.length !== file.size) throw Error('選択したモデルの大きさが一致しません。');
          if (!(bytes.length>=4&&new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true)===0x46546c67)&&!classifyMeshSource(bytes)) throw Error('差し替えには面を持つ3Dモデルを選択してください。点群の差し替えはまだ利用できません。');
          const prepared = await content.prepareModel({ label: file.name, bytes }, target.assetId);
          try {
            if(prepared.representation.role!=='meshPrimary')throw Error('差し替えには面を持つ3Dモデルを選択してください。');
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
          if (!source || !isSavedModel(source)) throw Error('配置するモデルを確認してください。');
          const binding = await sealValidationRecord('asset-binding-revision', { id: captured.bindingId, assetId: captured.assetId,
            assetRevisionId: source.revision.id, parentBindingId: source.binding.id, method: captured.fitReference ? 'bounds' : 'manual',
            assetToProject: captured.placement as unknown as JsonObject });
          return ready(await session.edit(token, captured.fitReference ? { kind: 'fitAssetBounds', sceneId: captured.sceneId, assetId: captured.assetId,
            expectedBindingId: captured.expectedBindingId, binding, referenceAssetId: captured.fitReference.assetId, expectedReferenceBindingId: captured.fitReference.bindingId } :
            { kind: 'transformAsset', sceneId: captured.sceneId, assetId: captured.assetId, expectedBindingId: captured.expectedBindingId, binding }));
        }, true);
      },
      retry: () => execute(async () => { editable(true); return resume(); }),
      nativeConversionRecovery: {sourceRequired: () => nativeSpatialConversionSourceRequired(fs,options.store),
        reselect: file => execute(async () => {editable(true); return resume(file);})},
    };
    const emptyImport = () => !localInitial && last.state === 'empty' && !outputDiscoveryFailure && !unfinishedReceive() && !unfinishedOutput();
    const host: SavedWorkspaceHost = { authority, limits, read: () => last, hasPending: () => busy || !!connection?.restorePending || restoreRetired || restoreDisplayPending || receiveDisplayPending || unfinishedReceive() ||
      !emptyImport() && (!!failure || last.state !== 'ready'),
      refresh: () => execute(async () => { await reloadReceive(); last = await session.read(); await projectView(last); return last; }),
      resolve: async (token, command) => (await commitCommand(token, command)).display,
      dispose: async () => { await dispose(); content.releasePreparedImages(); content.releasePreparedModels(); prepareDisplay = undefined; } };
    ownsLease = true;
    return { ...host, dispatch, get content() { return content; }, workspaceFiles, workspaceOutput, backupRestore, display: () => restoreRetired ? undefined : project,
      conversionReportAvailable: async () => await hasLociMyuConversion(fs, false) || await hasFrozenV1MaterialReport(fs),
      conversionReport: () => execute(async () => await readLociMyuConversionReport(fs, options.fileLimits, `prj_${run}`, options.decode, options.jpeg, options.photo) ??
        await readFrozenV1MaterialReport(fs, options.fileLimits, `prj_${run}`, options.decode, options.jpeg, options.photo), true),
      get accessDetail() { return options.mode === 'view' ? '閲覧専用です。' : lease.accessDetail; },
      setDisplayPreparation(callback: (next: ProjectDisplay) => Promise<void>) {
      if (closed || prepareDisplay) throw Error('モデル表示の接続を確認してください。');
      prepareDisplay = callback; return () => { if (prepareDisplay === callback) prepareDisplay = undefined; };
    } };
  } catch (error) { await dispose(); throw error; }
}
