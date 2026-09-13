import type { ValidationHostOptions } from './validationHost';
import { validationArea } from './validationHost';
import { validationProjectService } from '../../projectFiles/creation';
import { WorkspaceReceiver } from '../../projectFiles/receiveWorkspace';
import { validationMetadataLimits } from '../../projectFiles/validation';

export interface ValidationProjectEntry { run: string; title: string; state: 'ready' | 'incomplete' | 'unavailable' }
export type ValidationStorage = (run: string, create: boolean) => ReturnType<ValidationHostOptions['openStorage']>;
/** Read-only enumeration of this opt-in namespace, never an old Project or a mutable ready flag. */
export async function listValidationProjects(options: Omit<ValidationHostOptions, 'run' | 'initial' | 'openStorage'>,
  openStorage: ValidationStorage): Promise<ValidationProjectEntry[]> {
  const prefix = `${validationArea}/`, runs = [...new Set((await options.base.list(prefix))
    .map(path => path.slice(prefix.length).split('/')[0]!).filter(id => /^[0-9a-f]{32}$/.test(id)))];
  const result: ValidationProjectEntry[] = [];
  for (const run of runs) {
    const lease = options.coordinator.openView(options.base, `${prefix}${run}`, `${validationArea}:${run}`);
    let storage: Awaited<ReturnType<ValidationStorage>> | undefined;
    try {
      storage = await openStorage(run, false);
      const { session } = validationProjectService(lease.workspace, storage.factory, options.store, options.fileLimits, options.decode);
      const read = await session.read(), provider = read.provider;
      const jobs = await new WorkspaceReceiver(options.base, lease.workspace, session, validationMetadataLimits, null).jobs();
      if (read.source && read.source.proof.identity.projectId !== `prj_${run}`) throw Error('Project mismatch');
      const title = provider?.kind === 'scene-provider' ? provider.inspection.candidates.fields
        .find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'title') : undefined;
      const candidate = title?.valid && title.candidates.length === 1 ? title.candidates[0]?.value : undefined;
      result.push({ run, title: candidate?.kind === 'value' && typeof candidate.value === 'string' ? candidate.value : '名前を確認できないプロジェクト',
        state: read.state === 'repair-required' || jobs.some(j => j.state === 'repair-required') ? 'unavailable' :
          read.state !== 'ready' || jobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state)) ? 'incomplete' : 'ready' });
    } catch { result.push({ run, title: '保存内容を確認できないプロジェクト', state: 'unavailable' }); }
    finally { await storage?.dispose(); lease.release(); }
  }
  return result;
}
