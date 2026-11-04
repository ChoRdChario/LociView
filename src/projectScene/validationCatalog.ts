import type { MetadataSessionRead, ValidationHostOptions } from './validationHost';
import { measureValidation, validationArea } from './validationHost';
import { openValidationGeneration, inspectValidationFirstBackup } from './validationGeneration';
import { WorkspaceReceiver } from '../projectFiles/receiveWorkspace';
import { WorkspaceSender } from '../projectFiles/sendWorkspace';
import { validationMetadataLimits } from '../projectFiles/validation';
import { reviewEditStates } from '../projectPackage/reviewEditControls';
import { chooseStartupScene, resolveScene } from '../scene/resolve';

export interface ValidationProjectEntry { run: string; title: string; state: 'ready' | 'incomplete' | 'unavailable'; firstRestore?: 'pending' | 'terminal' }
export type ValidationStorage = (run: string, create: boolean) => ReturnType<ValidationHostOptions['openStorage']>;
export interface ResumeReading {
  token: string;
  sceneId: string;
  title: string;
  records: readonly { id: string; title: string; body: string }[];
}
export interface ResumeReadingRequest { run: string; show(reading: ResumeReading | null): void }
/** Read-only enumeration of this opt-in namespace, never an old Project or a mutable ready flag. */
export async function listValidationProjects(options: Omit<ValidationHostOptions, 'run' | 'initial' | 'openStorage'>,
  openStorage: ValidationStorage, reading?: ResumeReadingRequest): Promise<ValidationProjectEntry[]> {
  const measure = <T>(stage: string, action: () => Promise<T>) => measureValidation(options.timing, `catalog.${stage}`, action);
  const prefix = `${validationArea}/`, runs = [...new Set((await options.base.list(prefix))
    .map(path => path.slice(prefix.length).split('/')[0]!).filter(id => /^[0-9a-f]{32}$/.test(id)))];
  const result: ValidationProjectEntry[] = [];
  for (const run of runs) {
    const lease = options.coordinator.openView(options.base, `${prefix}${run}`, `${validationArea}:${run}`);
    let storage: Awaited<ReturnType<typeof openValidationGeneration>> | undefined;
    const show = (value: ResumeReading | null) => {
      if (reading?.run === run) try { reading.show(value); } catch { /* Reading does not decide catalog readiness. */ }
    };
    try {
      const project = { ...options, run, openStorage: (create: boolean) => openStorage(run, create) };
      const first = await measure('first-restore', () => inspectValidationFirstBackup(lease.workspace, project));
      if (first) { result.push({ run, title: first.controls.pending ? 'バックアップの初回復元が未完了' : 'プロジェクトなし・復元記録を保持',
        state: first.controls.pending ? 'incomplete' : 'unavailable', firstRestore: first.controls.pending ? 'pending' : 'terminal' }); continue; }
      const observation: { selected?: MetadataSessionRead } = {};
      storage = await measure('generation', () => openValidationGeneration(lease.workspace,
        { ...project, observeCatalogRead: read => { observation.selected = read; } }));
      const { session, fs } = storage.service;
      const read = observation.selected ?? await measure('session', () => session.read()), provider = read.provider;
      if (read.source && read.source.proof.identity.projectId !== `prj_${run}`) throw Error('Project mismatch');
      const title = provider?.kind === 'scene-provider' ? provider.inspection.candidates.fields
        .find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'title') : undefined;
      const candidate = title?.valid && title.candidates.length === 1 ? title.candidates[0]?.value : undefined;
      const label = candidate?.kind === 'value' && typeof candidate.value === 'string' ? candidate.value : '名前を確認できないプロジェクト';
      if (reading?.run === run && observation.selected && !storage.restorePending && read.state === 'ready' &&
        read.source?.proof.identity.projectId === `prj_${run}` && provider?.kind === 'scene-provider') {
        const { sceneId } = chooseStartupScene(provider.state);
        if (sceneId) {
          const scene = resolveScene(provider.state, provider.resources, sceneId);
          if (scene.kind === 'ready') {
            const records = scene.composition.captions.flatMap(c => c.title.kind === 'value' && c.body.kind === 'value'
              ? [{ id: c.captionId, title: c.title.value, body: c.body.value }] : []);
            if (records.length) {
              await storage.check();
              show({ token: provider.token, sceneId, title: label, records });
            }
          }
        }
      }
      const jobs = await measure('receive', () => new WorkspaceReceiver(options.base, fs, session, validationMetadataLimits, null).jobs());
      const outputs = await measure('output', () => new WorkspaceSender(fs, session, options.store, validationMetadataLimits, null).jobs());
      const copies = await measure('review-copies', () => reviewEditStates(fs, validationMetadataLimits));
      const entry: ValidationProjectEntry = { run, title: label,
        state: read.state === 'repair-required' || [...jobs, ...outputs, ...copies].some(j => j.state === 'repair-required') ? 'unavailable' :
          storage.restorePending || copies.some(j => !['completed', 'abandoned'].includes(j.state)) || read.state !== 'ready' || jobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state)) ||
          outputs.some(j => !['generated', 'file-verified', 'cancelled', 'abandoned'].includes(j.state)) ? 'incomplete' : 'ready' };
      if (entry.state !== 'ready') show(null);
      result.push(entry);
    } catch { show(null); result.push({ run, title: '保存内容を確認できないプロジェクト', state: 'unavailable' }); }
    finally { await storage?.dispose(); lease.release(); }
  }
  return result;
}
