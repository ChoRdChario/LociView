import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importNewProject, inspectZip } from '../../src/assets/package';
import { ProjectStore } from '../../src/core/store';
import {
  assertOpenedFrozenV1SourceUnchanged,
  completeOpenedFrozenV1ConversionReport,
  planOpenedFrozenV1ToNative,
  serializeFrozenV1ConversionPreflight,
  serializeFrozenV1ConversionReport,
} from '../../src/nativeGs/frozenV1Conversion';
import {
  createNativeProjectV1,
  nativeActiveMarkerPath,
  nativeProjectRoot,
  openNativeProjectV1,
} from '../../src/nativeGs/storage';
import { MemoryFS, ProjectMutationDeniedError } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';

const fixturePath = resolve('fixtures/v1-migration/native-v1-base.lociview');
const sourceDir = 'projects/prj_01J00000000000000000000000';
const identity = {
  userId: 'usr_01J00000000000000000000999',
  deviceId: 'dev_01J00000000000000000000999',
  displayName: 'Migration test',
};

async function protectSource(fs: MemoryFS) {
  const guard = await ProjectMutationCoordinator.local().tryAcquireSourceSnapshot(
    fs,
    sourceDir,
    'prj_01J00000000000000000000000',
  );
  expect(guard.holdsSourceSnapshotLock).toBe(true);
  expect(guard.holdsWriteLock).toBe(false);
  const store = await ProjectStore.openLegacySource(guard.workspace, sourceDir, identity);
  guard.activateSourceSnapshotAfterDurableReload();
  return { guard, store };
}

describe('opened frozen-v1 to native conversion', () => {
  it('preserves the representative source, converts exact values, and reports every unsupported value', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const { guard, store } = await protectSource(fs);

    const sourceManifestBefore = await fs.readBytes(`${sourceDir}/lociview.json`);
    const sourceOpsBefore = await fs.readBytes(`${sourceDir}/ops/a_000000000000A.jsonl`);
    const sourceModelBefore = await fs.readBytes(`${sourceDir}/models/ast_01J00000000000000000000020.glb`);
    const sourceImageBefore = await fs.readBytes(`${sourceDir}/media/ast_01J00000000000000000000021.png`);
    const plan = await planOpenedFrozenV1ToNative(guard.workspace, sourceDir, store);

    expect(plan.blockingIssueCount).toBe(0);
    expect(plan.draft.project.id).not.toBe(store.manifest.projectId);
    expect(plan.draft.assets).toHaveLength(1);
    expect(plan.draft.displaySets).toHaveLength(2);
    expect(plan.draft.captions).toHaveLength(2);
    expect(plan.draft.mediaResources).toHaveLength(1);
    expect(plan.draft.savedViews).toHaveLength(1);
    expect(plan.draft.meshMaterialAppearances).toHaveLength(0);
    expect(plan.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'material-key-unresolved',
      'orthographic-view-reported',
      'source-field-reported',
      'deleted-records-reported',
    ]));
    expect(plan.draft.assets[0]?.pinScale).toBe(1);
    expect(plan.issues.find((entry) => entry.code === 'material-key-unresolved')?.sourceValue).toContain('"opacity"');

    const placed = plan.draft.captions.find((caption) => caption.id === 'cap_01J00000000000000000000030');
    const unplaced = plan.draft.captions.find((caption) => caption.id === 'cap_01J00000000000000000000031');
    expect(placed).toMatchObject({
      title: 'Synthetic surface pin',
      body: 'base body',
      ownerAssetId: 'ast_01J00000000000000000000020',
      displaySetId: 'set_01J00000000000000000000010',
      color: '#eab308',
      tags: ['synthetic'],
      anchor: { assetId: 'ast_01J00000000000000000000020', positionAsset: [0.25, 0.5, 0] },
    });
    expect(placed?.attachmentMediaIds).toHaveLength(1);
    expect(unplaced?.anchor).toBeNull();
    expect(unplaced?.ownerAssetId).toBeUndefined();

    const targetSession = await ProjectMutationCoordinator.local().tryAcquire(
      fs,
      nativeProjectRoot(plan.draft.project.id),
      plan.draft.project.id,
    );
    targetSession.activateNewProject();
    const snapshot = await createNativeProjectV1(
      targetSession.workspace,
      plan.draft,
      plan.representationSources,
      undefined,
      plan.mediaSources,
      async () => { await assertOpenedFrozenV1SourceUnchanged(plan, guard.workspace, store); },
    );
    const after = await assertOpenedFrozenV1SourceUnchanged(plan, guard.workspace, store);
    const report = completeOpenedFrozenV1ConversionReport(plan, snapshot, after);
    expect(report.source.unchanged).toBe(true);
    expect(report.source.before.aggregateSha256).toBe(report.source.after.aggregateSha256);
    expect(report.convertedCounts.Asset).toBe(1);
    expect(report.convertedCounts.Caption).toBe(2);
    const userReport = serializeFrozenV1ConversionReport(report);
    const userReportValue = JSON.parse(userReport) as {
      format: string;
      source: Record<string, unknown>;
      target: { title: string };
      mappings: Array<{ note?: string }>;
      issues: Array<{ message: string }>;
      sourceUnchanged: boolean;
    };
    expect(userReportValue.format).toBe('lociview-conventional-to-new-project-report');
    expect(userReportValue.source).not.toHaveProperty('projectDir');
    expect(userReportValue.source).not.toHaveProperty('files');
    expect(userReportValue.sourceUnchanged).toBe(true);
    expect(userReportValue.target.title).toContain('(新しい形式)');
    expect([
      userReportValue.format,
      ...userReportValue.mappings.flatMap(({ note }) => note === undefined ? [] : [note]),
      ...userReportValue.issues.map(({ message }) => message),
    ].join('\n')).not.toMatch(/legacy|frozen[- ]?v1|\bv1\b|writer|operation[- ]log|\bnative\b/iu);

    const opened = await openNativeProjectV1(fs, snapshot.project.id);
    expect(opened.missingRepresentationIds).toEqual([]);
    expect(opened.missingMediaIds).toEqual([]);
    expect(opened.snapshot.captions).toEqual(snapshot.captions);
    expect(opened.snapshot.displaySets).toEqual(snapshot.displaySets);
    expect(opened.snapshot.savedViews).toEqual(snapshot.savedViews);

    expect(await fs.readBytes(`${sourceDir}/lociview.json`)).toEqual(sourceManifestBefore);
    expect(await fs.readBytes(`${sourceDir}/ops/a_000000000000A.jsonl`)).toEqual(sourceOpsBefore);
    expect(await fs.readBytes(`${sourceDir}/models/ast_01J00000000000000000000020.glb`)).toEqual(sourceModelBefore);
    expect(await fs.readBytes(`${sourceDir}/media/ast_01J00000000000000000000021.png`)).toEqual(sourceImageBefore);
    targetSession.release();
    guard.release();
  });

  it('keeps a malformed imported Caption anchor inactive and blocks conversion', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const writable = await ProjectStore.open(fs, sourceDir, identity);
    writable.updateEntity('caption', 'cap_01J00000000000000000000031', {
      anchor: {
        modelAssetId: 'ast_01J00000000000000000000020',
        position: ['invalid', 0, 0],
      },
    });
    await writable.flush();
    const { guard, store } = await protectSource(fs);

    expect(store.loadErrors.flatMap(({ errors }) => errors))
      .toContainEqual(expect.objectContaining({ reason: 'schema violation' }));
    await expect(planOpenedFrozenV1ToNative(guard.workspace, sourceDir, store))
      .rejects.toThrow(/malformed operation-log lines/iu);
    guard.release();
  });

  it('blocks an explicit Caption reference to an unavailable DisplaySet instead of guessing a fallback', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const writable = await ProjectStore.open(fs, sourceDir, identity);
    writable.updateEntity('caption', 'cap_01J00000000000000000000030', {
      setId: 'set_01J00000000000000000000999',
    });
    await writable.flush();
    const { guard, store } = await protectSource(fs);

    const plan = await planOpenedFrozenV1ToNative(guard.workspace, sourceDir, store);
    expect(plan.blockingIssueCount).toBeGreaterThan(0);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      severity: 'blocking',
      code: 'caption-set-unresolved',
      sourceId: 'cap_01J00000000000000000000030',
    }));
    expect(plan.draft.captions.some((caption) => caption.id === 'cap_01J00000000000000000000030')).toBe(false);
    const userPreflight = JSON.parse(serializeFrozenV1ConversionPreflight(plan)) as {
      format: string;
      source: Record<string, unknown>;
      plannedTarget: { title: string };
      mappings: Array<{ note?: string }>;
      issues: Array<{ message: string }>;
    };
    expect(userPreflight.source).not.toHaveProperty('projectDir');
    expect(userPreflight.source).not.toHaveProperty('files');
    expect(userPreflight.plannedTarget.title).toContain('(新しい形式)');
    expect([
      userPreflight.format,
      ...userPreflight.mappings.flatMap(({ note }) => note === undefined ? [] : [note]),
      ...userPreflight.issues.map(({ message }) => message),
    ].join('\n')).not.toMatch(/legacy|frozen[- ]?v1|\bv1\b|writer|operation[- ]log|\bnative\b/iu);
    guard.release();
  });

  it('keeps a malformed Saved View camera inactive and blocks conversion', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const writable = await ProjectStore.open(fs, sourceDir, identity);
    writable.updateEntity('view', 'view_01J00000000000000000000040', {
      setId: 'set_01J00000000000000000000999',
      cameraState: null,
    });
    await writable.flush();
    const { guard, store } = await protectSource(fs);

    expect(store.loadErrors.flatMap(({ errors }) => errors))
      .toContainEqual(expect.objectContaining({ reason: 'schema violation' }));
    await expect(planOpenedFrozenV1ToNative(guard.workspace, sourceDir, store))
      .rejects.toThrow(/malformed operation-log lines/iu);
    guard.release();
  });

  it('blocks an explicitly unsupported image MIME instead of guessing from its filename', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const writable = await ProjectStore.open(fs, sourceDir, identity);
    writable.updateEntity('asset', 'ast_01J00000000000000000000021', {
      mime: 'image/svg+xml',
      originalName: 'looks-like-png.png',
    });
    await writable.flush();
    const { guard, store } = await protectSource(fs);

    const plan = await planOpenedFrozenV1ToNative(guard.workspace, sourceDir, store);
    expect(plan.blockingIssueCount).toBeGreaterThan(0);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      severity: 'blocking',
      code: 'image-source-invalid',
      sourceId: 'ast_01J00000000000000000000021',
    }));
    expect(plan.draft.mediaResources).toHaveLength(0);
    guard.release();
  });

  it('retains the complete source value in accounting issues without truncation', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const writable = await ProjectStore.open(fs, sourceDir, identity);
    const tail = 'full-evidence-'.repeat(60);
    writable.updateEntity('material', 'mat_01J00000000000000000000050', { accountingTail: tail });
    await writable.flush();
    const { guard, store } = await protectSource(fs);

    const plan = await planOpenedFrozenV1ToNative(guard.workspace, sourceDir, store);
    const materialIssue = plan.issues.find((entry) => entry.code === 'material-key-unresolved');
    expect(materialIssue?.sourceValue).toContain(tail);
    expect(materialIssue?.sourceValue).not.toContain('...');
    guard.release();
  });

  it('does not publish a Native marker when source bytes change during conversion', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const { guard, store } = await protectSource(fs);
    const plan = await planOpenedFrozenV1ToNative(guard.workspace, sourceDir, store);
    const target = await ProjectMutationCoordinator.local().tryAcquire(
      fs,
      nativeProjectRoot(plan.draft.project.id),
      plan.draft.project.id,
    );
    target.activateNewProject();
    const sourcePath = `${sourceDir}/ops/a_000000000000A.jsonl`;
    const original = await fs.readBytes(sourcePath);
    if (original === null) throw new Error('source log missing');
    let changed = false;

    await expect(createNativeProjectV1(
      target.workspace,
      plan.draft,
      plan.representationSources,
      undefined,
      plan.mediaSources,
      async () => {
        if (!changed) {
          changed = true;
          const modified = new Uint8Array(original.length + 1);
          modified.set(original);
          modified[modified.length - 1] = 0x20;
          await fs.writeBytes(sourcePath, modified);
        }
        await assertOpenedFrozenV1SourceUnchanged(plan, guard.workspace, store);
      },
    )).rejects.toThrow(/source changed/iu);
    expect(await fs.readBytes(nativeActiveMarkerPath(plan.draft.project.id))).toBeNull();
    target.release();
    guard.release();
  });

  it('does not publish a Native marker when source protection is lost before publication', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const { guard, store } = await protectSource(fs);
    const plan = await planOpenedFrozenV1ToNative(guard.workspace, sourceDir, store);
    const target = await ProjectMutationCoordinator.local().tryAcquire(
      fs,
      nativeProjectRoot(plan.draft.project.id),
      plan.draft.project.id,
    );
    target.activateNewProject();
    let assertionCount = 0;

    await expect(createNativeProjectV1(
      target.workspace,
      plan.draft,
      plan.representationSources,
      undefined,
      plan.mediaSources,
      () => {
        assertionCount += 1;
        if (assertionCount === 2) guard.failClosed('simulated source protection loss');
        store.assertSourceSnapshotProtected();
      },
    )).rejects.toBeInstanceOf(ProjectMutationDeniedError);
    expect(assertionCount).toBe(2);
    expect(await fs.readBytes(nativeActiveMarkerPath(plan.draft.project.id))).toBeNull();
    target.release();
    guard.release();
  });
});
