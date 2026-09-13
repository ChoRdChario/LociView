import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { TransactionJournal } from '../projectMetadata/journal';
import { isContributionRemote } from '../projectMetadata/packageRemote';
import { WorkspaceReceiveJob } from './receiveJob';
import { ContributionReceiveJob } from './contributionReceiveJob';

export type ReceiveJob = WorkspaceReceiveJob | ContributionReceiveJob;
export type ReceiveJobKey = { id: string; kind: 'workspace' | 'contribution' };
/** Shared discovery; an absent folder cannot erase an indexed or journal-backed job. */
export async function receiveJobKeys(fs: ProjectWorkspaceFS, limits: MetadataLimits): Promise<ReceiveJobKey[]> {
  const workspace = new Set(await WorkspaceReceiveJob.ids(fs)), contribution = new Set(await ContributionReceiveJob.ids(fs));
  for (const e of await new TransactionJournal(fs, limits).entries()) {
    if (e.prepared?.remote && isContributionRemote(e.prepared.remote)) contribution.add(e.start.transactionId);
    else if (e.start.purpose === 'importWorkspace') workspace.add(e.start.transactionId);
  }
  if ([...workspace].some(id => contribution.has(id))) fail('receive-job-kind-collision');
  return [...[...workspace].map(id => ({ id, kind: 'workspace' as const })), ...[...contribution].map(id => ({ id, kind: 'contribution' as const }))];
}
export function receiveInputState(fs: ProjectWorkspaceFS, key: ReceiveJobKey, limits: MetadataLimits) {
  return key.kind === 'workspace' ? WorkspaceReceiveJob.inputState(fs, key.id, limits) : ContributionReceiveJob.inputState(fs, key.id, limits);
}
export function openReceiveJob(fs: ProjectWorkspaceFS, key: ReceiveJobKey, store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits): Promise<ReceiveJob> {
  return key.kind === 'workspace' ? WorkspaceReceiveJob.open(fs, key.id, limits) : ContributionReceiveJob.open(fs, key.id, store, limits);
}
export async function receiveTerminal(job: ReceiveJob) {
  const steps = await job.steps();
  return steps.some(s => ['baseRecorded', 'contributionPublished', 'contributionAlreadyPresent', 'cancelled'].includes(s.detail.kind));
}
