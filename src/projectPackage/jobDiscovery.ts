import { fail } from '../projectMetadata/format';

export interface JobDiscovery<Read> {
  readonly ids: readonly string[];
  read(id: string): Promise<Read>;
}
export type OutputJobRead<Job> = { readonly state: 'started'; readonly job: Job; readonly kinds: readonly string[] } |
  { readonly state: 'unstarted' | 'abandoned' };
export type ReceiveJobRead<Job> = { readonly state: 'started'; readonly job: Job; readonly kinds: readonly string[] } |
  { readonly state: 'input-required' | 'unbound-input' | 'abandoned' };

/** Internal traversal only. Classes supply their own fresh discovery and private loaders. */
export async function withJobDiscovery<Read, Result>(discover: () => Promise<readonly string[]>, load: (id: string) => Promise<Read>,
  action: (observation: JobDiscovery<Read>) => Promise<Result>): Promise<Result> {
  const ids = Object.freeze([...await discover()]), allowed = new Set(ids), pending = new Set<Promise<Read>>();
  let active = true;
  const assertActive = () => { if (!active) fail('job-discovery-expired'); };
  const read = (id: string) => {
    if (!active) return Promise.reject(Error('job-discovery-expired'));
    if (!allowed.has(id)) return Promise.reject(Error('job-discovery-owner'));
    const work = (async () => { assertActive(); const result = await load(id); assertActive(); return result; })();
    pending.add(work); void work.then(() => pending.delete(work), () => pending.delete(work));
    return work;
  };
  try {
    const result = await action(Object.freeze({ ids, read }));
    if (pending.size) { active = false; await Promise.allSettled([...pending]); return fail('job-discovery-unfinished'); }
    return result;
  } finally { active = false; await Promise.allSettled([...pending]); }
}
