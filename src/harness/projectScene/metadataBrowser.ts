import * as A from '@automerge/automerge/slim';
import wasmUrl from '@automerge/automerge/automerge.wasm?url';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { OpfsFS } from '../../platform/opfs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { openMetadataHost, metadataArea } from './metadataHost';
import { createSyntheticViewport } from './viewport';
import { createMetadataWorkspace } from './metadataWorkspace';

/** Serve-only, new synthetic namespace. No old saved/ordinary entry is converted. */
export async function createMetadataBrowserWorkspace(document: Document, run: string, create: boolean) {
  if (!import.meta.env.DEV) throw Error('開発サーバーで開いてください。');
  const response = await fetch(wasmUrl);
  if (!response.ok) throw Error('保存エンジンを読み込めません。再読み込みしてください。');
  await A.initializeWasm(new Uint8Array(await response.arrayBuffer()));
  const host = await openMetadataHost({ run, create, base: await OpfsFS.open(),
    coordinator: ProjectMutationCoordinator.browser(navigator.locks ?? null),
    openStorage: async allowCreate => {
      if (typeof indexedDB.databases !== 'function') throw Error('このブラウザでは保存領域を安全に確認できません。');
      const name = `${metadataArea}-${run}`, databases = await indexedDB.databases();
      if (!databases.some(db => db.name === name) && !allowCreate)
        throw Error('必要な保存領域がありません。既存データは保持しています。');
      // Hold a non-creating connection until the adapter opens. Enumeration alone
      // is a snapshot: a concurrent delete must never turn readonly into create.
      const guard = allowCreate ? undefined : await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.transaction?.abort();
        request.onerror = () => reject(Error('既存の保存領域を開けません。新規作成はしていません。'));
        request.onsuccess = () => resolve(request.result);
      });
      let connection: IDBDatabase;
      try {
        const adapter = new IndexedDBStorageAdapter(name);
        // Pinned 2.5.6 exposes the connection only through this internal field.
        // Isolated here for cleanup; storage reads/writes use its public port.
        connection = await (adapter as unknown as { dbPromise: Promise<IDBDatabase> }).dbPromise;
        if (!connection || !connection.objectStoreNames.contains('documents')) {
          connection?.close(); throw Error('保存領域の形式を確認できません。');
        }
        return { factory: () => adapter, dispose: async () => connection.close() };
      } finally { guard?.close(); }
    } });
  let workspace: ReturnType<typeof createMetadataWorkspace>;
  try { workspace = createMetadataWorkspace(document, host, createSyntheticViewport); }
  catch (error) { await host.dispose(); throw error; }
  const dispose = () => { window.removeEventListener('pagehide', dispose); void workspace.dispose(); };
  window.addEventListener('pagehide', dispose);
  return { root: workspace.root, hasChanges: workspace.hasChanges, dispose };
}
