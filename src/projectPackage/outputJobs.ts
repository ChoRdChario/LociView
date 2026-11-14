import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { WorkspaceOutputJob } from './outputJob';
import { ContributionOutputJob } from './contributionOutputJob';
import { BackupOutputJob } from './backupOutputJob';
import { CleanOutputJob } from './cleanOutputJob';
import { ReviewOutputJob } from './reviewOutputJob';
import { cleanProtectedInventory } from './cleanSource';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { json, withMetadataRead } from '../projectMetadata/persistence';
import { WorkspaceBaseStore } from './workspaceBases';
import { protectedWorkspaceInventory } from './protectedInventory';
import { PACKAGE_LIMITS as L } from './contract';
import { withJobDiscovery, type JobDiscovery, type OutputJobRead } from './jobDiscovery';

export type OutputJobKey = { id: string; kind: 'workspace' | 'contribution' | 'backup' | 'clean' | 'review' };
export type OutputJob = WorkspaceOutputJob | ContributionOutputJob | BackupOutputJob | CleanOutputJob | ReviewOutputJob;
export interface OutputJobDiscoveryRow { readonly key: OutputJobKey; read(): Promise<OutputJobRead<OutputJob>> }
/** Admit every namespace/collision before any per-row consumer runs. No Job escapes the owning read. */
export function withOutputJobDiscovery<Result>(fs: ProjectWorkspaceFS, limits: MetadataLimits,
  action: (rows: readonly OutputJobDiscoveryRow[]) => Promise<Result>): Promise<Result> {
  return WorkspaceOutputJob.withDiscovery(fs, limits, workspace => ContributionOutputJob.withDiscovery(fs, limits, contribution =>
    BackupOutputJob.withDiscovery(fs, limits, backup => CleanOutputJob.withDiscovery(fs, limits, clean =>
      ReviewOutputJob.withDiscovery(fs, limits, review => {
        const rows: OutputJobDiscoveryRow[] = [], ids = new Set<string>();
        const add = <Job extends OutputJob>(kind: OutputJobKey['kind'], scope: JobDiscovery<OutputJobRead<Job>>) => {
          for (const id of scope.ids) {
            if (ids.has(id)) fail('output-job-kind-collision'); ids.add(id);
            rows.push({ key: { kind, id }, read: () => scope.read(id) });
          }
        };
        add('workspace', workspace); add('contribution', contribution); add('backup', backup); add('clean', clean); add('review', review);
        return action(rows);
      })))));
}
/** Display only: every loaded Backup has already checked its private original inventory. */
export function withProtectedOutputJobDiscovery<Result>(fs: ProjectWorkspaceFS, limits: MetadataLimits, store: Pick<OriginBlobStore, 'inspect'>,
  action: (rows: readonly { key: OutputJobKey; read(): Promise<{ observed: OutputJobRead<OutputJob>; protection?: Awaited<ReturnType<typeof validateOutputProtection>> }> }[]) => Promise<Result>) {
  const owned = { ...limits };
  return withOutputJobDiscovery(fs, owned, rows => {
    const byId = new Map(rows.map(row => [row.key.id, row]));
    const snapshots = new Map<string, Promise<Awaited<ReturnType<typeof readProtectionSnapshot>>>>();
    return withJobDiscovery(async () => [...byId.keys()], async id => {
      const observed = await byId.get(id)!.read();
      if (observed.state !== 'started' || !(observed.job instanceof BackupOutputJob)) return { observed };
      const job = observed.job, proof = structuredClone(job.source.proof), key = json(proof);
      let pending = snapshots.get(key);
      if (!pending) { pending = readProtectionSnapshot(fs, owned, proof); snapshots.set(key, pending); }
      let current: Awaited<ReturnType<typeof readProtectionSnapshot>>;
      try { current = await pending; } catch (error) { snapshots.delete(key); throw error; }
      // The exact private description was admitted by Backup.openStarted in this traversal.
      await validateFrozenProtection(fs, job, store, current, job.frozenInventory(), job.manifest().blobs);
      return { observed, protection: { bases: current.bases, snapshot: structuredClone(current.snapshot), proof: structuredClone(current.proof) } };
    }, scope => action(rows.map(row => {
      const id = row.key.id; return { key: { ...row.key }, read: () => scope.read(id) };
    })));
  });
}
export async function outputJobKeys(fs: ProjectWorkspaceFS): Promise<OutputJobKey[]> {
  return withMetadataRead(fs, undefined, ({ fs }) => readOutputJobKeys(fs));
}
async function readOutputJobKeys(fs: ProjectWorkspaceFS): Promise<OutputJobKey[]> {
  const workspace = await WorkspaceOutputJob.ids(fs), contribution = await ContributionOutputJob.ids(fs);
  const backup = await BackupOutputJob.ids(fs), clean = await CleanOutputJob.ids(fs), review = await ReviewOutputJob.ids(fs), ids = [...workspace, ...contribution, ...backup, ...clean, ...review];
  if (new Set(ids).size !== ids.length) fail('output-job-kind-collision');
  return [...workspace.map(id => ({ id, kind: 'workspace' as const })), ...contribution.map(id => ({ id, kind: 'contribution' as const })), ...backup.map(id => ({ id, kind: 'backup' as const })), ...clean.map(id => ({ id, kind: 'clean' as const })), ...review.map(id => ({ id, kind: 'review' as const }))];
}
export function outputJobClass(key: OutputJobKey) { return key.kind === 'workspace' ? WorkspaceOutputJob : key.kind === 'backup' ? BackupOutputJob : key.kind === 'clean' ? CleanOutputJob : key.kind === 'review' ? ReviewOutputJob : ContributionOutputJob; }
export function openOutputJob(fs: ProjectWorkspaceFS, key: OutputJobKey, limits: MetadataLimits): Promise<OutputJob> { return outputJobClass(key).open(fs, key.id, limits); }
export async function outputTerminal(job: OutputJob) {
  const steps = await job.steps(), terminal = job instanceof WorkspaceOutputJob ? 'baseRecorded' : 'artifactVerified';
  return steps.some(s => s.detail.kind === terminal || s.detail.kind === 'cancelled');
}
/** Later observations may be added; none of the capture's protected evidence may disappear. */
export async function validateOutputProtection(fs: ProjectWorkspaceFS, job: OutputJob, store: Pick<OriginBlobStore, 'inspect'>, limits: MetadataLimits) {
  job.assertOwner(fs);
  const proof = structuredClone(job.source.proof);
  const current = await readProtectionSnapshot(fs, limits, proof), { bases } = current, frozen = job.frozenBases();
  validateFrozenBases(job, current);
  const payloads = await bases.payloads(frozen.records);
  const inventory = job instanceof CleanOutputJob || job instanceof ReviewOutputJob ? await cleanProtectedInventory(job.source, payloads, limits) :
    protectedWorkspaceInventory((await job.source.inspectOriginal({ maxWork: L.inspectionWork, maxNodes: L.inspectionNodes })).candidates, payloads);
  await validateFrozenProtection(fs, job, store, current, inventory, inventory.blobs);
  return current;
}
async function readProtectionSnapshot(fs: ProjectWorkspaceFS, limits: MetadataLimits, proof: OutputJob['source']['proof']) {
  const bases = new WorkspaceBaseStore(fs, limits, proof), snapshot = await bases.snapshot(); return { bases, snapshot, proof };
}
function validateFrozenBases(job: OutputJob, { snapshot, proof }: Awaited<ReturnType<typeof readProtectionSnapshot>>) {
  if (json(job.source.proof) !== json(proof)) return fail('output-protected-lineage');
  const frozen = job.frozenBases();
  for (const r of frozen.records) {
    const found = snapshot.records.find(b => b.workspacePackageId === r.workspacePackageId);
    if (!found || json({ ...found, completions: [] }) !== json({ ...r, completions: [] }) ||
      r.completions.some(c => !found.completions.some(v => json(v) === json(c)))) return fail('output-frozen-base-missing');
  }
}
async function validateFrozenProtection(fs: ProjectWorkspaceFS, job: OutputJob, store: Pick<OriginBlobStore, 'inspect'>,
  current: Awaited<ReturnType<typeof readProtectionSnapshot>>, inventory: ReturnType<OutputJob['frozenInventory']>, bodies: readonly { sha256: string; byteLength: number }[]) {
  job.assertOwner(fs); validateFrozenBases(job, current);
  if (json(inventory) !== json(job.frozenInventory())) return fail('output-frozen-inventory');
  for (const b of bodies) if (await store.inspect({ algorithm: 'sha256', digest: b.sha256, byteLength: b.byteLength, mediaType: 'application/octet-stream' }) !== 'verified-present') return fail('output-protected-body-missing');
}
