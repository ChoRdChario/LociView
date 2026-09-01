import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importNewProject, inspectZip } from '../../src/assets/package';
import { ProjectStore } from '../../src/core/store';
import {
  assertOpenedFrozenV1SourceUnchanged,
  completeOpenedFrozenV1ConversionReport,
  planOpenedFrozenV1ToNative,
} from '../../src/nativeGs/frozenV1Conversion';
import { createNativeProjectV1, nativeProjectRoot, openNativeProjectV1 } from '../../src/nativeGs/storage';
import { MemoryFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';

const fixturePath = resolve('fixtures/v1-migration/native-v1-base.lociview');
const sourceDir = 'projects/prj_01J00000000000000000000000';

describe('opened frozen-v1 to native conversion', () => {
  it('preserves the representative source, converts exact values, and reports every unsupported value', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const store = await ProjectStore.open(fs, sourceDir, {
      userId: 'usr_01J00000000000000000000999',
      deviceId: 'dev_01J00000000000000000000999',
      displayName: 'Migration test',
    });

    const sourceManifestBefore = await fs.readBytes(`${sourceDir}/lociview.json`);
    const sourceOpsBefore = await fs.readBytes(`${sourceDir}/ops/a_000000000000A.jsonl`);
    const sourceModelBefore = await fs.readBytes(`${sourceDir}/models/ast_01J00000000000000000000020.glb`);
    const sourceImageBefore = await fs.readBytes(`${sourceDir}/media/ast_01J00000000000000000000021.png`);
    const plan = await planOpenedFrozenV1ToNative(fs, sourceDir, store);

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
    );
    const after = await assertOpenedFrozenV1SourceUnchanged(plan, fs, store);
    const report = completeOpenedFrozenV1ConversionReport(plan, snapshot, after);
    expect(report.source.unchanged).toBe(true);
    expect(report.source.before.aggregateSha256).toBe(report.source.after.aggregateSha256);
    expect(report.convertedCounts.Asset).toBe(1);
    expect(report.convertedCounts.Caption).toBe(2);

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
  });

  it('retains an explicit model owner when an imported Caption position is invalid', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const store = await ProjectStore.open(fs, sourceDir, {
      userId: 'usr_01J00000000000000000000999',
      deviceId: 'dev_01J00000000000000000000999',
      displayName: 'Migration test',
    });
    store.updateEntity('caption', 'cap_01J00000000000000000000031', {
      anchor: {
        modelAssetId: 'ast_01J00000000000000000000020',
        position: ['invalid', 0, 0],
      },
    });
    await store.flush();

    const plan = await planOpenedFrozenV1ToNative(fs, sourceDir, store);
    expect(plan.draft.captions.find((caption) => caption.id === 'cap_01J00000000000000000000031')).toMatchObject({
      ownerAssetId: 'ast_01J00000000000000000000020',
      anchor: null,
    });
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'caption-anchor-unresolved' }));
  });

  it('blocks an explicit Caption reference to an unavailable DisplaySet instead of guessing a fallback', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const store = await ProjectStore.open(fs, sourceDir, {
      userId: 'usr_01J00000000000000000000999',
      deviceId: 'dev_01J00000000000000000000999',
      displayName: 'Migration test',
    });
    store.updateEntity('caption', 'cap_01J00000000000000000000030', {
      setId: 'set_01J00000000000000000000999',
    });
    await store.flush();

    const plan = await planOpenedFrozenV1ToNative(fs, sourceDir, store);
    expect(plan.blockingIssueCount).toBeGreaterThan(0);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      severity: 'blocking',
      code: 'caption-set-unresolved',
      sourceId: 'cap_01J00000000000000000000030',
    }));
    expect(plan.draft.captions.some((caption) => caption.id === 'cap_01J00000000000000000000030')).toBe(false);
  });

  it('blocks an unresolved Saved View DisplaySet even when its camera is also malformed', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const store = await ProjectStore.open(fs, sourceDir, {
      userId: 'usr_01J00000000000000000000999',
      deviceId: 'dev_01J00000000000000000000999',
      displayName: 'Migration test',
    });
    store.updateEntity('view', 'view_01J00000000000000000000040', {
      setId: 'set_01J00000000000000000000999',
      cameraState: null,
    });
    await store.flush();

    const plan = await planOpenedFrozenV1ToNative(fs, sourceDir, store);
    expect(plan.blockingIssueCount).toBeGreaterThan(0);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      severity: 'blocking',
      code: 'saved-view-set-unresolved',
      sourceId: 'view_01J00000000000000000000040',
    }));
    expect((plan.draft.savedViews ?? []).some((view) => view.id === 'view_01J00000000000000000000040')).toBe(false);
  });

  it('blocks an explicitly unsupported image MIME instead of guessing from its filename', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const store = await ProjectStore.open(fs, sourceDir, {
      userId: 'usr_01J00000000000000000000999',
      deviceId: 'dev_01J00000000000000000000999',
      displayName: 'Migration test',
    });
    store.updateEntity('asset', 'ast_01J00000000000000000000021', {
      mime: 'image/svg+xml',
      originalName: 'looks-like-png.png',
    });
    await store.flush();

    const plan = await planOpenedFrozenV1ToNative(fs, sourceDir, store);
    expect(plan.blockingIssueCount).toBeGreaterThan(0);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      severity: 'blocking',
      code: 'image-source-invalid',
      sourceId: 'ast_01J00000000000000000000021',
    }));
    expect(plan.draft.mediaResources).toHaveLength(0);
  });

  it('retains the complete source value in accounting issues without truncation', async () => {
    const fs = new MemoryFS();
    const inspection = await inspectZip(new Uint8Array(await readFile(fixturePath)));
    await importNewProject(fs, sourceDir, inspection);
    const store = await ProjectStore.open(fs, sourceDir, {
      userId: 'usr_01J00000000000000000000999',
      deviceId: 'dev_01J00000000000000000000999',
      displayName: 'Migration test',
    });
    const tail = 'full-evidence-'.repeat(60);
    store.updateEntity('material', 'mat_01J00000000000000000000050', { accountingTail: tail });
    await store.flush();

    const plan = await planOpenedFrozenV1ToNative(fs, sourceDir, store);
    const materialIssue = plan.issues.find((entry) => entry.code === 'material-key-unresolved');
    expect(materialIssue?.sourceValue).toContain(tail);
    expect(materialIssue?.sourceValue).not.toContain('...');
  });
});
