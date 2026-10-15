import type { ProjectWorkspaceFS } from '../../platform/fs';
import { openWorkspaceGeneration } from '../../projectMetadata/generationScope';
import { BackupRestoreJob, type RestoreDatabasePorts } from '../../projectPackage/backupRestoreJob';
import { readRestoreControls, restoreEqual } from '../../projectPackage/restoreControls';
import { validationProjectService } from '../../projectFiles/creation';
import { validationMetadataLimits as limits } from '../../projectFiles/validation';
import type { ValidationHostOptions } from './validationHost';

type Options = Pick<ValidationHostOptions, 'run' | 'openStorage' | 'generations' | 'store' | 'fileLimits' | 'decode' | 'jpeg' | 'photo'>;
export function validationGenerationDatabases(options: Pick<Options, 'run' | 'openStorage' | 'generations'>): RestoreDatabasePorts {
  // Original-only injected hosts cannot activate or invent a dedicated database.
  return options.generations?.(options.run) ?? { listGenerations: async () => [], open: (id, create) => {
    if (id !== null) throw Error('復元用の保存領域に接続できません。元のデータは保持しています。');
    return options.openStorage(create);
  } };
}

export function validationGenerationService(scope: Pick<Awaited<ReturnType<typeof openWorkspaceGeneration>>, 'fs' | 'factory' | 'check'>,
  options: Pick<Options, 'store' | 'fileLimits' | 'decode' | 'jpeg' | 'photo'>) {
  return { fs: scope.fs, factory: scope.factory, store: options.store,
    ...validationProjectService(scope.fs, scope.factory, options.store, options.fileLimits, options.decode, scope.check, options.jpeg, options.photo) };
}

/** Inspect first-only controls before an original DB opener can be reached. No Session is fabricated. */
export async function inspectValidationFirstBackup(root: ProjectWorkspaceFS, options: Options) {
  const controls = await readRestoreControls(root, limits, 'detect');
  if (controls.selection || !controls.jobs.some(job => job.prepared?.schema === 'lociview-local-restore-prepared-2')) return;
  const owner = controls.pending ?? controls.jobs.find(job => job.prepared?.schema === 'lociview-local-restore-prepared-2')!;
  if (owner.prepared?.schema !== 'lociview-local-restore-prepared-2') throw Error('復元記録の出自を確認できません。');
  if (owner.prepared.backup.proof.identity.projectId !== `prj_${options.run}`) throw Error('復元記録と保存場所のプロジェクトが一致しません。');
  const databases = validationGenerationDatabases(options), absence = await BackupRestoreJob.observeAbsence(root, limits, databases, owner.prepared.backup.proof, controls.pending?.id);
  if (controls.pending && !restoreEqual(absence, owner.prepared.absence)) throw Error('復元先の状態が変わりました。記録は保持しています。');
  return { controls, owner };
}

/** Host and catalog resolve exactly the same FS/DB generation. Never recreate an existing database. */
export async function openValidationGeneration(root: ProjectWorkspaceFS, options: Options, create = false) {
  const databases = validationGenerationDatabases(options);
  let service: ReturnType<typeof validationGenerationService> | undefined;
  const controls = await readRestoreControls(root, limits);
  if (!controls.selection && controls.jobs.some(job => job.prepared?.schema === 'lociview-local-restore-prepared-2'))
    throw Error('バックアップの初回復元を再開してください。');
  if (!options.generations && controls.jobs.length) throw Error('復元用の保存領域に接続できません。');
  const scope = create ? await openWorkspaceGeneration(root, { generationId: null, allowCreate: true, auditReadOperations: true,
    assertSelected: async () => { const current = await readRestoreControls(root, limits);
      if (current.selection) throw Error('プロジェクトの作成先が変わりました。'); },
    assertWritable: async () => { if ((await readRestoreControls(root, limits)).pending) throw Error('バックアップの復元が未完了です。'); } }, databases.open) :
    await BackupRestoreJob.openSelected(root, limits, databases, selected => service = validationGenerationService(selected, options));
  try {
    service ??= validationGenerationService(scope, options);
    const current = await readRestoreControls(root, limits);
    const handoff = current.tail && !current.jobs.find(j => j.id === current.tail!.jobId)?.result;
    return { ...scope, service, restorePending: !!current.pending || !!handoff };
  } catch (error) { await scope.dispose(); throw error; }
}
