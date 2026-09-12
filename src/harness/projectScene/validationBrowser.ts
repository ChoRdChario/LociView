import { OpfsFS } from '../../platform/opfs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { OriginBlobStore } from '../../projectMetadata/blobStore';
import { validationMetadataLimits, type FileValidationLimits } from '../../projectFiles/validation';
import { initializeBrowserMetadata, openBrowserMetadataStorage } from './browserMetadataStorage';
import { openValidationHost, validationArea } from './validationHost';
import { listValidationProjects } from './validationCatalog';
import { createValidationWorkspace } from './validationWorkspace';
import { prepareValidationResidents } from './validationRender';
import { sceneViewportFactory } from './viewport';

// Conservative execution budgets for this development lane, not measured product capacity.
export const validationBrowserLimits: FileValidationLimits = { maxFileBytes: 64 * 1024 * 1024,
  maxJsonBytes: 4 * 1024 * 1024, maxItems: 100_000, maxValues: 8_000_000, maxPixels: 16_777_216 };
export async function createValidationBrowserWorkspace(document: Document, run?: string) {
  if (!import.meta.env.DEV) throw Error('開発サーバーで開いてください。');
  await initializeBrowserMetadata();
  const base = await OpfsFS.open(), locks = navigator.locks ?? null;
  const options = { base, coordinator: ProjectMutationCoordinator.browser(locks), fileLimits: validationBrowserLimits,
    store: new OriginBlobStore(base, { maxBlobBytes: validationBrowserLimits.maxFileBytes,
      maxChunkBytes: 16 * 1024 * 1024, maxChunks: 100_000, metadata: validationMetadataLimits }, locks) };
  const storage = (id: string, create: boolean) => openBrowserMetadataStorage(`${validationArea}-${id}`, create);
  const workspace = createValidationWorkspace(document, { ...options,
    list: () => listValidationProjects(options, storage),
    open: (id, initial) => openValidationHost({ ...options, run: id, initial, openStorage: create => storage(id, create) }),
    render: async host => {
      const resident = await prepareValidationResidents(host.authority.read().modelVersions!, host.content);
      try {
        const detach = host.setDisplayPreparation(next => resident.prepare(next.modelVersions!));
        return { factory: sceneViewportFactory(resident), dispose: () => { detach(); resident.dispose(); } };
      } catch (error) { resident.dispose(); throw error; }
    },
    selected: id => {
      const url = new URL(location.href); url.searchParams.delete('create');
      if (id) url.searchParams.set('run', id); else url.searchParams.delete('run'); history.replaceState(null, '', url);
    },
  }, run);
  const dispose = () => { window.removeEventListener('pagehide', dispose); void workspace.dispose(); };
  window.addEventListener('pagehide', dispose);
  return { root: workspace.root, hasChanges: workspace.hasChanges, dispose };
}
