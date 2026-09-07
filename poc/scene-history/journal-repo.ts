// Pinned 2.5.6 storage seam, disposable only. No DocHandle/autosave lifecycle.
import { Repo, type StorageAdapterInterface } from '@automerge/automerge-repo/slim';
import { require } from './journal-format';
type Backend = NonNullable<Repo['storageSubsystem']>;
export class LeasedStorage implements StorageAdapterInterface {
  private readonly pending = new Set<Promise<void>>();
  private open = true;
  constructor(private readonly storage: StorageAdapterInterface, private readonly writable: () => boolean) {}
  load = (key: string[]) => this.storage.load(key);
  loadRange = (key: string[]) => this.storage.loadRange(key);
  private write(fn: () => Promise<void>): Promise<void> {
    require(this.open && this.writable(), 'metadata write without browser lease');
    const task = fn(); this.pending.add(task);
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task)); return task;
  }
  save = (key: string[], bytes: Uint8Array) => this.write(() => this.storage.save(key, bytes));
  remove = (key: string[]) => this.write(() => this.storage.remove(key));
  removeRange = (key: string[]) => this.write(() => this.storage.removeRange(key));
  async close(): Promise<void> {
    this.open = false; // A later lease must never revive this old port.
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}

export async function withRepoStorage<T>(adapter: StorageAdapterInterface, writable: () => boolean,
  task: (backend: Backend) => Promise<T>): Promise<T> {
  const storage = new LeasedStorage(adapter, writable); let repo: Repo | undefined;
  try {
    // Repo constructs storage identity asynchronously. Prepare under the writer
    // lease, or refuse BEFORE construction, so read-only open cannot seed a DB.
    if (!await storage.load(['storage-adapter-id'])) {
      require(writable(), 'missing storage identity; repair required');
      await storage.save(['storage-adapter-id'], new TextEncoder().encode(crypto.randomUUID()));
    }
    repo = new Repo({ storage, network: [] }); await repo.storageId();
    require(repo.storageSubsystem, 'missing pinned repository storage seam');
    // These version-pinned hidden APIs are not a production-adoption decision.
    // saveDoc awaits the actual IDB adapter (including snapshot compaction).
    return await task(repo.storageSubsystem);
  } finally {
    await storage.close();
    // No handles exist. shutdown is only empty flush + zero network disconnects.
    if (repo) await repo.shutdown();
  }
}
