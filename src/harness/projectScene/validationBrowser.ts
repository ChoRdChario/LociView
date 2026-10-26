import { OpfsFS } from '../../platform/opfs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { OriginBlobStore } from '../../projectMetadata/blobStore';
import { validationMetadataLimits, type FileValidationLimits } from '../../projectFiles/validation';
import { initializeBrowserMetadata, openBrowserMetadataStorage, browserMetadataDatabaseNames, browserOriginalDatabasePresent } from './browserMetadataStorage';
import { openValidationEntry, validationArea, measureValidation, type ValidationTiming } from './validationHost';
import { listValidationProjects } from './validationCatalog';
import { createValidationWorkspace } from './validationWorkspace';
import { prepareValidationResidents, prepareReadonlyResidents } from './validationRender';
import { sceneViewportFactory } from './viewport';
import { syntheticDisplay } from './viewportModel';
import type { SyntheticProject } from './fixture';
import { generationDatabaseName } from '../../projectMetadata/generationScope';
import { isSavedModel } from './modelTypes';
import { createValidationUiState } from './browserUiState';

// Conservative execution budgets for this development lane, not measured product capacity.
export const validationBrowserLimits: FileValidationLimits = { maxFileBytes: 64 * 1024 * 1024,
  maxJsonBytes: 4 * 1024 * 1024, maxItems: 100_000, maxValues: 8_000_000, maxPixels: 16_777_216 };
export async function createValidationBrowserWorkspace(document: Document, run?: string) {
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'project-scene-validation')
    throw Error('開発サーバーまたは専用の検証ビルドで開いてください。');
  await initializeBrowserMetadata();
  const metrics = new Map<string, { count: number; milliseconds: number }>(); let measures = 0;
  const publish = (stage: string, milliseconds: number) => {
    if (++measures > 2000) return;
    performance.measure(`lociview.${stage}`, { start: performance.now() - milliseconds, duration: milliseconds,
      detail: { io: Object.fromEntries([...metrics].map(([key, value]) => [key, { ...value }])) } });
  };
  const timing: ValidationTiming | undefined = new URL(location.href).searchParams.get('timings') === '1' ? (stage, milliseconds) => {
    if (!stage.startsWith('io.')) { publish(stage, milliseconds); return; }
    const previous = metrics.get(stage) ?? { count: 0, milliseconds: 0 };
    metrics.set(stage, { count: previous.count + 1, milliseconds: previous.milliseconds + milliseconds });
  } : undefined;
  if (timing) document.addEventListener('lociview-timing-snapshot', () => publish('snapshot', 0));
  const observed = <T extends object>(target: T, label: (method: string, args: unknown[]) => string): T => !timing ? target : new Proxy(target, {
    get(object, key) {
      const value: unknown = Reflect.get(object, key, object);
      if (typeof key !== 'string' || typeof value !== 'function') return value;
      return (...args: unknown[]) => measureValidation(timing, label(key, args), () => Reflect.apply(value, object, args));
    },
  });
  const base = observed(await OpfsFS.open(), (method, args) => {
    const path = typeof args[0] === 'string' ? args[0] : '';
    const family = path.includes('/v2/local-restore/') ? 'restore-controls' : path.includes('/v2/packages/') ? 'packages' : path.includes('/v2/metadata/') ? 'metadata' : 'other';
    return `io.opfs.${family}.${method}`;
  }), locks = navigator.locks ?? null;
  const openStorage = async (name: string, create: boolean) => {
    const connection = await openBrowserMetadataStorage(name, create);
    return { ...connection, factory: () => observed(connection.factory(), method => `io.idb.${method}`) };
  };
  const options = { base, timing, coordinator: ProjectMutationCoordinator.browser(locks), fileLimits: validationBrowserLimits, packageLocks: locks,
    generations: (id: string) => { const original = `${validationArea}-${id}`, prefix = `${original}-generation-`;
      return { listGenerations: async () => (await browserMetadataDatabaseNames()).filter(name => name.startsWith(prefix)).map(name => name.slice(prefix.length)),
        originalDatabasePresent: () => browserOriginalDatabasePresent(original),
        open: (generation: string | null, create: boolean) => openStorage(generationDatabaseName(original, generation), create) };
    },
    store: new OriginBlobStore(base, { maxBlobBytes: validationBrowserLimits.maxFileBytes,
      maxChunkBytes: 16 * 1024 * 1024, maxChunks: 100_000, metadata: validationMetadataLimits }, locks) };
  const storage = (id: string, create: boolean) => openStorage(`${validationArea}-${id}`, create);
  const uiState = createValidationUiState();
  const workspace = createValidationWorkspace(document, { ...options, lastProject: uiState.lastProject,
    storageEstimate: typeof navigator.storage?.estimate === 'function' ? () => navigator.storage.estimate() : undefined,
    productEditor: new URL(location.href).searchParams.get('editor') === 'project',
    list: () => listValidationProjects(options, storage),
    open: (id, initial, mode, workspaceFile, reviewEdit, firstBackup) => openValidationEntry({ ...options, run: id, initial, mode, workspaceFile, reviewEdit, firstBackup, openStorage: create => storage(id, create) }),
    renderModelCandidate: async (host, display) => {
      const resident = await prepareReadonlyResidents(display.models, { modelContent: record => host.content.modelContent(record, true) });
      return { factory: sceneViewportFactory(resident), dispose: () => resident.dispose() };
    },
    renderReview: async view => {
      const resident = await prepareReadonlyResidents(view.models, view.content);
      try {
        const display = view.display(null, null);
        for (const model of view.models) resident.validate(model, display.savedMaterials?.[model.assetId]);
        return { factory: sceneViewportFactory(resident), dispose: () => resident.dispose() };
      } catch (error) { resident.dispose(); throw error; }
    },
    render: async host => {
      const resident = await prepareValidationResidents(host.authority.read().modelVersions!, host.content);
      try {
        const prepare = async (next: SyntheticProject) => {
          await resident.prepare(next.modelVersions!);
          for (const scene of Object.values(next.state.scenes)) {
            if (scene.lifecycle.kind !== 'value' || scene.lifecycle.value.state !== 'active') continue;
            const display = syntheticDisplay(next, scene.id, null, null);
            for (const model of display.models) if (isSavedModel(model)) resident.validate(model, display.savedMaterials?.[model.binding.assetId]);
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
