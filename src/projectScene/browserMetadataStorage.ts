import * as A from '@automerge/automerge/slim';
import wasmUrl from '@automerge/automerge/automerge.wasm?url';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';

/** Local pinned engine; shared by the two opt-in development hosts only. */
export async function initializeBrowserMetadata() {
  const response = await fetch(wasmUrl);
  if (!response.ok) throw Error('保存エンジンを読み込めません。再読み込みしてください。');
  await A.initializeWasm(new Uint8Array(await response.arrayBuffer()));
}
export async function browserMetadataDatabaseNames(): Promise<string[]> {
  if (typeof indexedDB.databases !== 'function') throw Error('このブラウザでは保存領域を安全に確認できません。');
  return (await indexedDB.databases()).flatMap(db => db.name ? [db.name] : []);
}
/** First-backup absence needs a complete successful observation; unnamed entries are unknown. */
export async function browserOriginalDatabasePresent(name: string): Promise<boolean> {
  if (typeof indexedDB.databases !== 'function') throw Error('このブラウザでは元の保存領域の未存在を確認できません。');
  const databases = await indexedDB.databases();
  if (!Array.isArray(databases) || databases.some(db => !db || typeof db.name !== 'string' || !db.name))
    throw Error('元の保存領域を確認できません。既存データは変更していません。');
  return databases.some(db => db.name === name);
}
export async function openBrowserMetadataStorage(name: string, allowCreate: boolean) {
  if (!(await browserMetadataDatabaseNames()).includes(name) && !allowCreate)
    throw Error('必要な保存領域がありません。既存データは保持しています。');
  // Keep a non-creating connection until the adapter has opened; enumeration is only a snapshot.
  const guard = allowCreate ? undefined : await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => reject(Error('既存の保存領域を開けません。新規作成はしていません。'));
    request.onsuccess = () => resolve(request.result);
  });
  try {
    const adapter = new IndexedDBStorageAdapter(name);
    // Pinned 2.5.6 cleanup seam; actual storage uses the public adapter port.
    const connection = await (adapter as unknown as { dbPromise: Promise<IDBDatabase> }).dbPromise;
    if (!connection || !connection.objectStoreNames.contains('documents')) {
      connection?.close(); throw Error('保存領域の形式を確認できません。');
    }
    return { factory: () => adapter, dispose: async () => connection.close() };
  } finally { guard?.close(); }
}
