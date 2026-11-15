import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { TransactionJournal } from '../projectMetadata/journal';
import { isContributionRemote } from '../projectMetadata/packageRemote';
import { WorkspaceReceiveJob } from './receiveJob';
import { ContributionReceiveJob } from './contributionReceiveJob';
import { CleanInputJob } from './cleanInputJob';
import { ReviewCopyInputJob } from './reviewCopyInput';
import type { OutputIntegrityRead } from './outputIntegrityRead';
import type { ReceiveJobRead } from './jobDiscovery';

/** All namespace and journal collisions are checked before a row can be observed. */
export function withReceiveJobDiscovery<Result>(fs: ProjectWorkspaceFS, store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits,
  action: (rows: readonly { key: ReceiveJobKey; read(): Promise<ReceiveJobRead<ReceiveJob>> }[], entries: Awaited<ReturnType<TransactionJournal['entries']>>) => Promise<Result>, integrity?: OutputIntegrityRead) {
  return WorkspaceReceiveJob.withDiscovery(fs, limits, workspace => ContributionReceiveJob.withDiscovery(fs, store, limits, contribution =>
    CleanInputJob.withDiscovery(fs, limits, async clean => {
      const entries = await new TransactionJournal(fs, limits).entries();
      await ReviewCopyInputJob.ids(fs, limits, entries);
      const physical = { workspace: new Set(workspace.ids), contribution: new Set(contribution.ids), clean: new Set(clean.ids) };
      const ids = { workspace: new Set(physical.workspace), contribution: new Set(physical.contribution), clean: new Set(physical.clean) };
      for (const e of entries) {
        if (e.prepared?.remote && isContributionRemote(e.prepared.remote)) ids.contribution.add(e.start.transactionId);
        else if (e.start.purpose === 'importWorkspace') ids.workspace.add(e.start.transactionId);
        else if (e.start.purpose === 'importClean') ids.clean.add(e.start.transactionId);
      }
      if ([...ids.workspace].some(id => ids.contribution.has(id) || ids.clean.has(id)) || [...ids.contribution].some(id => ids.clean.has(id))) fail('receive-job-kind-collision');
      const scopes = { workspace, contribution, clean };
      const missing = { workspace: 'receive-job-missing', contribution: 'contribution-job-missing', clean: 'clean-input-missing' };
      const rows = (['workspace', 'contribution', 'clean'] as const).flatMap(kind => [...ids[kind]].map(id => ({
        key: { id, kind }, read: async (): Promise<ReceiveJobRead<ReceiveJob>> => {
          try { return await scopes[kind].read(id); }
          catch (error) {
            if (!physical[kind].has(id) && error instanceof Error && error.message === 'job-discovery-owner') fail(missing[kind]);
            throw error;
          }
        },
      })));
      return action(rows, entries);
    }, integrity)));
}

export type ReceiveJob = WorkspaceReceiveJob | ContributionReceiveJob | CleanInputJob;
export type ReceiveJobKey = { id: string; kind: 'workspace' | 'contribution' | 'clean' };
/** Shared discovery; an absent folder cannot erase an indexed or journal-backed job. */
export async function receiveJobKeys(fs: ProjectWorkspaceFS, limits: MetadataLimits): Promise<ReceiveJobKey[]> {
  const workspace = new Set(await WorkspaceReceiveJob.ids(fs)), contribution = new Set(await ContributionReceiveJob.ids(fs));
  const clean = new Set(await CleanInputJob.ids(fs));
  const entries = await new TransactionJournal(fs, limits).entries();
  await ReviewCopyInputJob.ids(fs, limits, entries);
  for (const e of entries) {
    if (e.prepared?.remote && isContributionRemote(e.prepared.remote)) contribution.add(e.start.transactionId);
    else if (e.start.purpose === 'importWorkspace') workspace.add(e.start.transactionId);
    else if (e.start.purpose === 'importClean') clean.add(e.start.transactionId);
  }
  if ([...workspace].some(id => contribution.has(id) || clean.has(id)) || [...contribution].some(id => clean.has(id))) fail('receive-job-kind-collision');
  return [...[...workspace].map(id => ({ id, kind: 'workspace' as const })), ...[...contribution].map(id => ({ id, kind: 'contribution' as const })), ...[...clean].map(id => ({ id, kind: 'clean' as const }))];
}
export function receiveInputState(fs: ProjectWorkspaceFS, key: ReceiveJobKey, limits: MetadataLimits) {
  return key.kind === 'clean' ? CleanInputJob.inputState(fs, key.id, limits) : key.kind === 'workspace' ? WorkspaceReceiveJob.inputState(fs, key.id, limits) : ContributionReceiveJob.inputState(fs, key.id, limits);
}
export function openReceiveJob(fs: ProjectWorkspaceFS, key: ReceiveJobKey, store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits, integrity?: OutputIntegrityRead): Promise<ReceiveJob> {
  return key.kind === 'clean' ? CleanInputJob.open(fs, key.id, limits, integrity) : key.kind === 'workspace' ? WorkspaceReceiveJob.open(fs, key.id, limits) : ContributionReceiveJob.open(fs, key.id, store, limits);
}
export async function receiveTerminal(job: ReceiveJob) {
  const steps = await job.steps();
  return steps.some(s => ['baseRecorded', 'contributionPublished', 'contributionAlreadyPresent', 'cleanPublished', 'cancelled'].includes(s.detail.kind));
}
