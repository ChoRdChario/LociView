/** Output observers never enqueue writes while holding this shared lifetime. */
export async function readOutputArtifacts<T>(locks: LockManager | null, action: () => Promise<T>): Promise<T> {
  return locks ? await locks.request('lociview:output-artifacts:v1', { mode: 'shared' }, action) : action();
}
/** Caller already owns the package-operation lock and Project write queue. */
export async function cleanOutputArtifacts<T>(locks: LockManager, action: () => Promise<T>): Promise<T> {
  return await locks.request('lociview:output-artifacts:v1', { mode: 'exclusive' }, action);
}
