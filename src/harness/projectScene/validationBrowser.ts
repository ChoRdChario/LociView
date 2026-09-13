import { OpfsFS } from '../../platform/opfs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { OriginBlobStore } from '../../projectMetadata/blobStore';
import { validationMetadataLimits, type FileValidationLimits } from '../../projectFiles/validation';
import { initializeBrowserMetadata, openBrowserMetadataStorage, browserMetadataDatabaseNames } from './browserMetadataStorage';
import { openValidationHost, validationArea } from './validationHost';
import { listValidationProjects } from './validationCatalog';
import { createValidationWorkspace } from './validationWorkspace';
import { prepareValidationResidents } from './validationRender';
import { sceneViewportFactory } from './viewport';
import { syntheticDisplay } from './viewportModel';
import type { SyntheticProject } from './fixture';
import { generationDatabaseName } from '../../projectMetadata/generationScope';

// Conservative execution budgets for this development lane, not measured product capacity.
export const validationBrowserLimits: FileValidationLimits = { maxFileBytes: 64 * 1024 * 1024,
  maxJsonBytes: 4 * 1024 * 1024, maxItems: 100_000, maxValues: 8_000_000, maxPixels: 16_777_216 };
export async function createValidationBrowserWorkspace(document: Document, run?: string) {
  if (!import.meta.env.DEV) throw Error('開発サーバーで開いてください。');
  await initializeBrowserMetadata();
  const base = await OpfsFS.open(), locks = navigator.locks ?? null;
  const options = { base, coordinator: ProjectMutationCoordinator.browser(locks), fileLimits: validationBrowserLimits, packageLocks: locks,
    generations: (id: string) => { const original = `${validationArea}-${id}`, prefix = `${original}-generation-`;
      return { listGenerations: async () => (await browserMetadataDatabaseNames()).filter(name => name.startsWith(prefix)).map(name => name.slice(prefix.length)),
        open: (generation: string | null, create: boolean) => openBrowserMetadataStorage(generationDatabaseName(original, generation), create) };
    },
    store: new OriginBlobStore(base, { maxBlobBytes: validationBrowserLimits.maxFileBytes,
      maxChunkBytes: 16 * 1024 * 1024, maxChunks: 100_000, metadata: validationMetadataLimits }, locks) };
  const storage = (id: string, create: boolean) => openBrowserMetadataStorage(`${validationArea}-${id}`, create);
  const workspace = createValidationWorkspace(document, { ...options,
    list: () => listValidationProjects(options, storage),
    open: (id, initial, mode, workspaceFile) => openValidationHost({ ...options, run: id, initial, mode, workspaceFile, openStorage: create => storage(id, create) }),
    render: async host => {
      const resident = await prepareValidationResidents(host.authority.read().modelVersions!, host.content);
      try {
        const prepare = async (next: SyntheticProject) => {
          await resident.prepare(next.modelVersions!);
          for (const scene of Object.values(next.state.scenes)) {
            if (scene.lifecycle.kind !== 'value' || scene.lifecycle.value.state !== 'active') continue;
            const display = syntheticDisplay(next, scene.id, null, null);
            for (const model of display.models) if (model.shape === 'saved-glb') resident.validate(model, display.savedMaterials?.[model.binding.assetId]);
          }
        };
        await prepare(host.authority.read());
        const detach = host.setDisplayPreparation(prepare);
        return { factory: sceneViewportFactory(resident), dispose: () => { detach(); resident.dispose(); } };
      } catch (error) { resident.dispose(); throw error; }
    },
    selected: (id, mode) => {
      const url = new URL(location.href); url.searchParams.delete('create');
      if (id) url.searchParams.set('run', id); else url.searchParams.delete('run');
      if (id && mode === 'view') url.searchParams.set('access', 'view'); else url.searchParams.delete('access');
      history.replaceState(null, '', url);
    },
  }, run, new URL(location.href).searchParams.get('access') === 'view' ? 'view' : 'edit');
  const dispose = () => { window.removeEventListener('pagehide', dispose); void workspace.dispose(); };
  window.addEventListener('pagehide', dispose);
  return { root: workspace.root, hasChanges: workspace.hasChanges, dispose };
}
