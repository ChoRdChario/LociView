import type { ValidationHostOptions } from './validationHost';
import { validationArea } from './validationHost';
import { openValidationGeneration, inspectValidationFirstBackup } from './validationGeneration';
import { WorkspaceReceiver } from '../../projectFiles/receiveWorkspace';
import { WorkspaceSender } from '../../projectFiles/sendWorkspace';
import { validationMetadataLimits } from '../../projectFiles/validation';
import { reviewEditStates } from '../../projectPackage/reviewEditControls';

export interface ValidationProjectEntry { run: string; title: string; state: 'ready' | 'incomplete' | 'unavailable'; firstRestore?: 'pending' | 'terminal' }
export type ValidationStorage = (run: string, create: boolean) => ReturnType<ValidationHostOptions['openStorage']>;
/** Read-only enumeration of this opt-in namespace, never an old Project or a mutable ready flag. */
export async function listValidationProjects(options: Omit<ValidationHostOptions, 'run' | 'initial' | 'openStorage'>,
  openStorage: ValidationStorage): Promise<ValidationProjectEntry[]> {
  const prefix = `${validationArea}/`, runs = [...new Set((await options.base.list(prefix))
    .map(path => path.slice(prefix.length).split('/')[0]!).filter(id => /^[0-9a-f]{32}$/.test(id)))];
  const result: ValidationProjectEntry[] = [];
  for (const run of runs) {
    const lease = options.coordinator.openView(options.base, `${prefix}${run}`, `${validationArea}:${run}`);
    let storage: Awaited<ReturnType<typeof openValidationGeneration>> | undefined;
    try {
      const first = await inspectValidationFirstBackup(lease.workspace, { ...options, run, openStorage: create => openStorage(run, create) });
      if (first) { result.push({ run, title: first.controls.pending ? 'バックアップの初回復元が未完了' : 'プロジェクトなし・復元記録を保持',
        state: first.controls.pending ? 'incomplete' : 'unavailable', firstRestore: first.controls.pending ? 'pending' : 'terminal' }); continue; }
      storage = await openValidationGeneration(lease.workspace, { ...options, run, openStorage: create => openStorage(run, create) });
      const { session, fs } = storage.service;
      const read = await session.read(), provider = read.provider;
      const jobs = await new WorkspaceReceiver(options.base, fs, session, validationMetadataLimits, null).jobs();
      const outputs = await new WorkspaceSender(fs, session, options.store, validationMetadataLimits, null).jobs();
      const copies = await reviewEditStates(fs, validationMetadataLimits);
      if (read.source && read.source.proof.identity.projectId !== `prj_${run}`) throw Error('Project mismatch');
      const title = provider?.kind === 'scene-provider' ? provider.inspection.candidates.fields
        .find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'title') : undefined;
      const candidate = title?.valid && title.candidates.length === 1 ? title.candidates[0]?.value : undefined;
      result.push({ run, title: candidate?.kind === 'value' && typeof candidate.value === 'string' ? candidate.value : '名前を確認できないプロジェクト',
        state: read.state === 'repair-required' || [...jobs, ...outputs, ...copies].some(j => j.state === 'repair-required') ? 'unavailable' :
          storage.restorePending || copies.some(j => !['completed', 'abandoned'].includes(j.state)) || read.state !== 'ready' || jobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state)) ||
          outputs.some(j => !['generated', 'file-verified', 'cancelled', 'abandoned'].includes(j.state)) ? 'incomplete' : 'ready' });
    } catch { result.push({ run, title: '保存内容を確認できないプロジェクト', state: 'unavailable' }); }
    finally { await storage?.dispose(); lease.release(); }
  }
  return result;
}
