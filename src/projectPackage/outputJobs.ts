import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { WorkspaceOutputJob } from './outputJob';
import { ContributionOutputJob } from './contributionOutputJob';
import { BackupOutputJob } from './backupOutputJob';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { json } from '../projectMetadata/persistence';
import { WorkspaceBaseStore } from './workspaceBases';
import { protectedWorkspaceInventory } from './protectedInventory';
import { PACKAGE_LIMITS as L } from './contract';

export type OutputJobKey = { id: string; kind: 'workspace' | 'contribution' | 'backup' };
export type OutputJob = WorkspaceOutputJob | ContributionOutputJob | BackupOutputJob;
export async function outputJobKeys(fs: ProjectWorkspaceFS): Promise<OutputJobKey[]> {
  const workspace = await WorkspaceOutputJob.ids(fs), contribution = await ContributionOutputJob.ids(fs);
  const backup = await BackupOutputJob.ids(fs), ids = [...workspace, ...contribution, ...backup];
  if (new Set(ids).size !== ids.length) fail('output-job-kind-collision');
  return [...workspace.map(id => ({ id, kind: 'workspace' as const })), ...contribution.map(id => ({ id, kind: 'contribution' as const })), ...backup.map(id => ({ id, kind: 'backup' as const }))];
}
export function outputJobClass(key: OutputJobKey) { return key.kind === 'workspace' ? WorkspaceOutputJob : key.kind === 'backup' ? BackupOutputJob : ContributionOutputJob; }
export function openOutputJob(fs: ProjectWorkspaceFS, key: OutputJobKey, limits: MetadataLimits): Promise<OutputJob> { return outputJobClass(key).open(fs, key.id, limits); }
export async function outputTerminal(job: OutputJob) {
  const steps = await job.steps(), terminal = job instanceof WorkspaceOutputJob ? 'baseRecorded' : 'artifactVerified';
  return steps.some(s => s.detail.kind === terminal || s.detail.kind === 'cancelled');
}
/** Later observations may be added; none of the capture's protected evidence may disappear. */
export async function validateOutputProtection(fs: ProjectWorkspaceFS, job: OutputJob, store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits) {
  job.assertOwner(fs);
  const bases = new WorkspaceBaseStore(fs, limits, job.source.proof), snapshot = await bases.snapshot(), frozen = job.frozenBases();
  for (const r of frozen.records) {
    const found = snapshot.records.find(b => b.workspacePackageId === r.workspacePackageId);
    if (!found || json({ ...found, completions: [] }) !== json({ ...r, completions: [] }) ||
      r.completions.some(c => !found.completions.some(v => json(v) === json(c)))) return fail('output-frozen-base-missing');
  }
  const inspection = await job.source.inspectOriginal({ maxWork: L.inspectionWork, maxNodes: L.inspectionNodes });
  const inventory = protectedWorkspaceInventory(inspection.candidates, await bases.payloads(frozen.records));
  if (json(inventory) !== json(job.frozenInventory())) return fail('output-frozen-inventory');
  for (const b of inventory.blobs) if (await store.inspect({ algorithm: 'sha256', digest: b.sha256, byteLength: b.byteLength, mediaType: 'application/octet-stream' }) !== 'verified-present') return fail('output-protected-body-missing');
  return bases;
}
