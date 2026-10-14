import type { ProjectWorkspaceFS } from '../../platform/fs';
import { openWorkspaceGeneration } from '../../projectMetadata/generationScope';
import { BackupRestoreJob, type RestoreDatabasePorts } from '../../projectPackage/backupRestoreJob';
import { readRestoreControls } from '../../projectPackage/restoreControls';
import { validationProjectService } from '../../projectFiles/creation';
import { validationMetadataLimits as limits } from '../../projectFiles/validation';
import type { ValidationHostOptions } from './validationHost';

type Options = Pick<ValidationHostOptions, 'run' | 'openStorage' | 'generations' | 'store' | 'fileLimits' | 'decode'>;
export function validationGenerationDatabases(options: Pick<Options, 'run' | 'openStorage' | 'generations'>): RestoreDatabasePorts {
  // Original-only injected hosts cannot activate or invent a dedicated database.
  return options.generations?.(options.run) ?? { listGenerations: async () => [], open: (id, create) => {
    if (id !== null) throw Error('復元用の保存領域に接続できません。元のデータは保持しています。');
    return options.openStorage(create);
  } };
}

export function validationGenerationService(scope: Pick<Awaited<ReturnType<typeof openWorkspaceGeneration>>, 'fs' | 'factory' | 'check'>,
  options: Pick<Options, 'store' | 'fileLimits' | 'decode'>) {
  return { fs: scope.fs, factory: scope.factory, store: options.store,
    ...validationProjectService(scope.fs, scope.factory, options.store, options.fileLimits, options.decode, scope.check) };
}

/** Host and catalog resolve exactly the same FS/DB generation. Never recreate an existing database. */
export async function openValidationGeneration(root: ProjectWorkspaceFS, options: Options, create = false) {
  const databases = validationGenerationDatabases(options);
  let service: ReturnType<typeof validationGenerationService> | undefined;
  const controls = await readRestoreControls(root, limits);
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
