import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { json } from '../projectMetadata/persistence';
import { OutputCleanupRead } from './outputCleanupRead';
import { outputJobClass, validateOutputProtection, type OutputJobKey } from './outputJobs';

export interface OutputCleanupResult { removedFiles: number; removedBytes: number; failedFiles: number; retainedUncertain: boolean }
/** Caller holds package, Project write and artifact-exclusive lifetimes. No acknowledged artifact is a target. */
export function removeOutputAttempts(writeFS: ProjectWorkspaceFS, store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits): Promise<OutputCleanupResult> {
  return OutputCleanupRead.run(writeFS, async (fs, scope) => {
    const result: OutputCleanupResult = { removedFiles: 0, removedBytes: 0, failedFiles: 0, retainedUncertain: false }, keys: OutputJobKey[] = [];
    for (const kind of ['workspace', 'contribution', 'backup', 'clean', 'review'] as const) {
      try { for (const id of await outputJobClass({ kind, id: '' }).ids(fs, scope)) keys.push({ kind, id }); }
      catch { scope.assertOwner(fs); result.retainedUncertain = true; }
    }
    // An invalid namespace can conceal an ID collision with a valid one.
    if (result.retainedUncertain) return result;
    const collisions = new Set(keys.filter((key, i) => keys.some((other, j) => i !== j && key.id === other.id)).map(key => key.id));
    for (const key of keys) {
      if (collisions.has(key.id)) { result.retainedUncertain = true; continue; }
      let candidates: string[], fingerprint: string, job: Awaited<ReturnType<ReturnType<typeof outputJobClass>['open']>>;
      try {
        const cls = outputJobClass(key);
        if (await cls.state(fs, key.id, limits, scope) !== 'started') { result.retainedUncertain = true; continue; }
        job = await cls.open(fs, key.id, limits, scope);
        const steps = await job.steps(), acknowledged = steps.find(row => row.detail.kind === 'artifactVerified');
        if (acknowledged) await job.artifactReceipt();
        await job.validateCompletion();
        await validateOutputProtection(fs, job, store, limits);
        fingerprint = json(steps);
        const prefix = job.path('artifacts/');
        candidates = (await fs.list(prefix)).filter(path => path !== (acknowledged?.detail.kind === 'artifactVerified' ? job.path(`artifacts/${acknowledged.detail.sinkId}.zip`) : null));
        if (candidates.some(path => !path.startsWith(prefix) || !/^[0-9a-f]{32}\.zip$/.test(path.slice(prefix.length)))) fail('output-cleanup-path');
      } catch { scope.assertOwner(fs); result.retainedUncertain = true; continue; }
      for (const path of candidates) {
        scope.assertOwner(fs);
        if (json(await job.steps()) !== fingerprint) return fail('output-cleanup-changed');
        const file = await fs.readStream(path);
        if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || !Number.isSafeInteger(result.removedBytes + file.size)) {
          result.retainedUncertain = true; continue;
        }
        writeFS.mutationAuthority.assertWorkspaceWriteAuthorized();
        try {
          await writeFS.remove(path); writeFS.mutationAuthority.assertWorkspaceWriteAuthorized();
          if (await fs.exists(path)) { result.failedFiles++; continue; }
          result.removedFiles++; result.removedBytes += file.size;
        } catch { scope.assertOwner(fs); result.failedFiles++; }
      }
    }
    return result;
  });
}
