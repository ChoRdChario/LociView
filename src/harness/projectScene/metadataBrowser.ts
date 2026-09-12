import { initializeBrowserMetadata, openBrowserMetadataStorage } from './browserMetadataStorage';
import { OpfsFS } from '../../platform/opfs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { openMetadataHost, metadataArea } from './metadataHost';
import { createSyntheticViewport } from './viewport';
import { createMetadataWorkspace } from './metadataWorkspace';

/** Serve-only, new synthetic namespace. No old saved/ordinary entry is converted. */
export async function createMetadataBrowserWorkspace(document: Document, run: string, create: boolean) {
  if (!import.meta.env.DEV) throw Error('開発サーバーで開いてください。');
  await initializeBrowserMetadata();
  const host = await openMetadataHost({ run, create, base: await OpfsFS.open(),
    coordinator: ProjectMutationCoordinator.browser(navigator.locks ?? null),
    openStorage: allowCreate => openBrowserMetadataStorage(`${metadataArea}-${run}`, allowCreate) });
  let workspace: ReturnType<typeof createMetadataWorkspace>;
  try { workspace = createMetadataWorkspace(document, host, createSyntheticViewport); }
  catch (error) { await host.dispose(); throw error; }
  const dispose = () => { window.removeEventListener('pagehide', dispose); void workspace.dispose(); };
  window.addEventListener('pagehide', dispose);
  return { root: workspace.root, hasChanges: workspace.hasChanges, dispose };
}
