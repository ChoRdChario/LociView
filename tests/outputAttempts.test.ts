import { describe, expect, it, vi } from 'vitest';
import '@automerge/automerge';
import { TestFS, glb, lockManager, storageFactory } from './helpers/projectFileFixtures';
import { OriginBlobStore } from '../src/projectMetadata/blobStore';
import { validationMetadataLimits as metadata } from '../src/projectFiles/validation';
import { validationProjectService, prepareValidationCreation } from '../src/projectFiles/creation';
import { prepareValidationProject } from '../src/projectFiles/initialProject';
import { newId, digest, json } from '../src/projectMetadata/persistence';
import { packageByteHash } from '../src/projectPackage/manifest';
import { WorkspaceSender } from '../src/projectFiles/sendWorkspace';
import { outputJobKeys, openOutputJob } from '../src/projectPackage/outputJobs';
import { BackupOutputJob } from '../src/projectPackage/backupOutputJob';
import { PACKAGE_LIMITS } from '../src/projectPackage/contract';
import { BackupArchive } from '../src/projectPackage/backupArchive';
import { OutputCleanupRead } from '../src/projectPackage/outputCleanupRead';

const limits = { maxFileBytes: 1_000_000, maxJsonBytes: 100_000, maxItems: 10_000, maxValues: 100_000, maxPixels: 10_000 };
async function setup() {
  const fs = new TestFS(), locks = lockManager(), factory = storageFactory(),
    store = new OriginBlobStore(fs, { metadata, maxBlobBytes: limits.maxFileBytes, maxChunkBytes: 1000000, maxChunks: 1000 }, locks);
  const initial = prepareValidationCreation(await prepareValidationProject({ run: newId(), title: '整理の検証', models: [{ label: 'モデル', bytes: glb() }] }, limits));
  const service = validationProjectService(fs, factory, store, limits), ready = await initial.persist(fs, store, service.session);
  return { fs, locks, factory, store, ...service, token: ready.source!.token, sender: new WorkspaceSender(fs, service.session, store, metadata, locks) };
}
async function hashes(fs: TestFS) { return Object.fromEntries(await Promise.all((await fs.list('')).map(async path => [path, await digest((await fs.readBytes(path))!)]))); }
describe('regenerable output attempts only', () => {
  it('cleans all five output kinds and preserves every acknowledged ZIP, source and exchange base', async () => {
    const r = await setup(), workspace = await r.sender.generate(r.token), base = (await r.sender.availableBases())[0]!.selection;
    const read = await r.session.read(); if (read.provider?.kind !== 'scene-provider') throw Error('provider');
    const sceneId = Object.keys(read.provider.state.scenes)[0]!;
    const ids = [workspace, await r.sender.generateBackup(r.token), await r.sender.generateClean(r.token), await r.sender.generateReview(r.token, { sceneId }), await r.sender.generateContribution(r.token, base)];
    const before = await hashes(r.fs), expected = new Map<string, string>();
    for (const key of await outputJobKeys(r.fs)) {
      const job = await openOutputJob(r.fs, key, metadata), path = job.path(`artifacts/${newId()}.zip`);
      await r.fs.writeBytes(path, new Uint8Array(17)); expected.set(path, key.id);
    }
    expect(await r.sender.cleanup(r.token)).toEqual({ removedFiles: 5, removedBytes: 85, failedFiles: 0, retainedUncertain: false });
    expect(await hashes(r.fs)).toEqual(before);
    for (const id of ids) expect((await r.sender.download(id)).size).toBeGreaterThan(0);
    const cold = validationProjectService(r.fs, r.factory, r.store, limits); expect((await cold.session.read()).source!.token).toBe(r.token);
    expect((await r.sender.cleanup(r.token)).removedFiles).toBe(0);
  });
  it('repairs an oversized failed attempt without weakening normal discovery, then retries the same frozen backup', async () => {
    const r = await setup(), original = r.fs.writeStream.bind(r.fs);
    const failure = vi.spyOn(r.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (!path.endsWith('.zip')) return original(path, stream);
      await r.fs.writeBytes(path, new Uint8Array(19)); await stream.cancel(); throw Error('injected output failure');
    });
    await expect(r.sender.generateBackup(r.token)).rejects.toThrow(); failure.mockRestore();
    const key = (await outputJobKeys(r.fs))[0]!, job = await BackupOutputJob.open(r.fs, key.id, metadata), controls = await hashes(r.fs), path = (await r.fs.list(job.path('artifacts/')))[0]!;
    const real = r.fs.readStream.bind(r.fs), large = vi.spyOn(r.fs, 'readStream').mockImplementation(async p => {
      const f = await real(p); return p === path && f ? { ...f, size: PACKAGE_LIMITS.archiveBytes + 1 } : f;
    });
    await expect(r.sender.jobs()).rejects.toThrow('output-space-budget');
    expect(await r.sender.cleanup(r.token)).toMatchObject({ removedFiles: 1, removedBytes: PACKAGE_LIMITS.archiveBytes + 1 }); large.mockRestore();
    delete controls[path]; expect(await hashes(r.fs)).toEqual(controls);
    expect(await r.sender.retry(key.id)).toBe(key.id);
    expect((await BackupArchive.inspect(await r.sender.download(key.id), metadata)).source.token).toBe(r.token);
  });
  it('retains uncertain controls and retries partial removal failures', async () => {
    const r = await setup(), id = await r.sender.generateBackup(r.token), job = await BackupOutputJob.open(r.fs, id, metadata);
    const a = job.path(`artifacts/${newId()}.zip`), b = job.path(`artifacts/${newId()}.zip`); await r.fs.writeBytes(a, new Uint8Array(5)); await r.fs.writeBytes(b, new Uint8Array(7));
    const remove = r.fs.remove.bind(r.fs), failing = vi.spyOn(r.fs, 'remove').mockImplementation(p => p === a ? Promise.reject(Error('held')) : remove(p));
    expect(await r.sender.cleanup(r.token)).toMatchObject({ removedFiles: 1, failedFiles: 1 }); failing.mockRestore();
    expect(await r.sender.cleanup(r.token)).toMatchObject({ removedFiles: 1, removedBytes: 5 });
    await r.fs.writeBytes(a, new Uint8Array(5)); await r.fs.writeText(job.path('capture.json'), '{}');
    expect(await r.sender.cleanup(r.token)).toMatchObject({ removedFiles: 0, retainedUncertain: true }); expect(await r.fs.exists(a)).toBe(true);
  });
  it('expires cleanup-only admission and never grants cleanup without package locks', async () => {
    const r = await setup(); let escaped!: OutputCleanupRead;
    await OutputCleanupRead.run(r.fs, async (_, scope) => { escaped = scope; }); expect(() => escaped.assertOwner(r.fs)).toThrow('output-cleanup-scope');
    await expect(new WorkspaceSender(r.fs, r.session, r.store, metadata, null).cleanup(r.token)).rejects.toThrow('排他的');
  });
  it('leaves every namespace untouched when malformed paths can conceal a cross-kind ID collision', async () => {
    const r = await setup(), id = await r.sender.generateBackup(r.token), job = await BackupOutputJob.open(r.fs, id, metadata);
    await r.fs.writeBytes(job.path(`artifacts/${newId()}.zip`), new Uint8Array(7));
    await r.fs.writeText(`v2/packages/review-output/${id}/unknown.json`, '{}');
    const before = await hashes(r.fs); expect(await r.sender.cleanup(r.token)).toMatchObject({ removedFiles: 0, retainedUncertain: true });
    expect(await hashes(r.fs)).toEqual(before);
  });
  it('keeps cancellation terminal after cleanup and stops further deletion on authority loss', async () => {
    const r = await setup(), original = r.fs.writeStream.bind(r.fs);
    const failed = vi.spyOn(r.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (!path.endsWith('.zip')) return original(path, stream); await r.fs.writeBytes(path, new Uint8Array(11)); await stream.cancel(); throw Error('partial');
    });
    await expect(r.sender.generateBackup(r.token)).rejects.toThrow(); failed.mockRestore();
    const key = (await outputJobKeys(r.fs))[0]!, job = await BackupOutputJob.open(r.fs, key.id, metadata); await r.sender.cancel(key.id);
    const extra = job.path(`artifacts/${newId()}.zip`); await r.fs.writeBytes(extra, new Uint8Array(13));
    const before = await hashes(r.fs), attempts = await r.fs.list(job.path('artifacts/'));
    let lost = false; const originalAuthority = r.fs.mutationAuthority;
    Object.defineProperty(r.fs, 'mutationAuthority', { configurable: true, value: { ...originalAuthority,
      assertEditable() { if (lost) throw Error('lost lease'); }, assertWorkspaceWriteAuthorized() { if (lost) throw Error('lost lease'); } } });
    const remove = r.fs.remove.bind(r.fs), removal = vi.spyOn(r.fs, 'remove').mockImplementation(async path => { await remove(path); lost = true; });
    await expect(r.sender.cleanup(r.token)).rejects.toThrow('lost lease'); expect(removal).toHaveBeenCalledTimes(1); removal.mockRestore();
    lost = false; expect((await r.sender.cleanup(r.token)).removedFiles).toBe(1);
    for (const path of attempts) delete before[path]; expect(await hashes(r.fs)).toEqual(before);
    expect((await r.sender.jobs())[0]!.state).toBe('cancelled'); await expect(r.sender.retry(key.id)).rejects.toThrow('output-cancelled');
    expect((await validationProjectService(r.fs, r.factory, r.store, limits).session.read()).source!.token).toBe(r.token);
  });
  it('keeps attempts of a Workspace with a rehashed but invalid completed-base binding', async () => {
    const r = await setup(), id = await r.sender.generate(r.token), key = (await outputJobKeys(r.fs)).find(k => k.id === id)!, job = await openOutputJob(r.fs, key, metadata);
    const step = structuredClone((await job.steps()).find(s => s.detail.kind === 'baseRecorded')!); if (step.detail.kind !== 'baseRecorded') throw Error('completion');
    const bytes = (value: unknown) => new TextEncoder().encode(json(value));
    const old = job.path(`steps/${packageByteHash(bytes(step))}.json`), forged = { ...step, detail: { ...step.detail, baseRecord: { ...step.detail.baseRecord, sha256: 'f'.repeat(64) } } };
    await r.fs.remove(old); await r.fs.writeBytes(job.path(`steps/${packageByteHash(bytes(forged))}.json`), bytes(forged));
    await r.fs.writeBytes(job.path(`artifacts/${newId()}.zip`), new Uint8Array(7)); const before = await hashes(r.fs);
    expect(await r.sender.cleanup(r.token)).toMatchObject({ removedFiles: 0, retainedUncertain: true }); expect(await hashes(r.fs)).toEqual(before);
  });
});
