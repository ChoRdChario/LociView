import * as A from '@automerge/automerge/slim';
import wasmUrl from '@automerge/automerge/automerge.wasm?url';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { OpfsFS } from '../../platform/opfs';
import { ProjectMutationCoordinator } from '../../platform/projectLock';
import { openMetadataHost, metadataArea } from './metadataHost';
import { SyntheticSession } from './session';
import { createDevelopmentWorkspace } from './workspace';
import { createSyntheticViewport } from './viewport';

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
  let disposed = false, refreshing = false, workspace: ReturnType<typeof createDevelopmentWorkspace> | undefined;
  const root = document.createElement('section'), tools = document.createElement('section');
  const check = document.createElement('button'), restore = document.createElement('button'), status = document.createElement('p');
  check.type = restore.type = 'button'; check.textContent = '保存状態を確認'; restore.textContent = '保存を再試行';
  status.setAttribute('role', 'status'); tools.append(check, restore, status); root.append(tools);
  const render = () => {
    if (disposed) return;
    if (!workspace && host.read().provider) {
      workspace = createDevelopmentWorkspace(document, new SyntheticSession(host.authority), { viewportFactory: createSyntheticViewport });
      root.append(workspace.root);
    }
    check.disabled = restore.disabled = refreshing;
    restore.hidden = !!workspace || host.authority.readOnly || host.read().state === 'ready';
    if (!workspace) status.textContent = host.authority.readOnly ?
      '未完了の保存があります。このタブは閲覧専用です。編集用タブで復旧してください。' : '未完了の保存があります。元の変更から再試行できます。';
    workspace?.render();
  };
  const refresh = async (retry: boolean) => {
    if (disposed || refreshing) return;
    // A readonly tab may re-read after the writer recovers. It cannot own drafts;
    // an editable tab retains all pending input and never silently replaces it.
    if (workspace && !workspace.session.readOnly && (workspace.session.pending || workspace.session.workingBlock && !retry)) {
      status.textContent = '入力・保存を確定するか、取り消してから確認してください。'; return;
    }
    refreshing = true; check.disabled = restore.disabled = true;
    try {
      if (retry) await host.authority.retry!(); else await host.refresh();
      if (disposed) return;
      if (workspace && host.read().provider) workspace.session.refreshHistory();
      status.textContent = host.read().state === 'ready' ? '保存した内容を確認しました。' : '未完了の保存があります。';
    } catch (error) { if (!disposed) status.textContent = error instanceof Error ? error.message : '保存を確認できません。データは保持しています。'; }
    finally { refreshing = false; render(); }
  };
  check.addEventListener('click', () => { void refresh(false); });
  restore.addEventListener('click', () => { void refresh(true); });
  try { render(); } catch (error) { workspace?.dispose(); await host.dispose(); throw error; }
  const dispose = () => {
    if (disposed) return; disposed = true; window.removeEventListener('pagehide', dispose);
    workspace?.dispose(); root.remove(); void host.dispose();
  };
  window.addEventListener('pagehide', dispose);
  return { root, hasChanges: () => host.hasPending() || !!workspace?.session.pending, dispose };
}
