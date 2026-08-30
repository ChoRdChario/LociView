import { describe, expect, it } from 'vitest';
import { MemoryFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';
import {
  activeNativeBindingV1,
  activeNativeRepresentationsV1,
  isNativeAssetVisibleV1,
  nativeCaptionNeedsReviewV1,
} from '../../src/nativeGs/resolver';
import {
  activateNativeManualAssetTransformV1,
  normalizeNativeSim3,
  removeNativeAssetV1,
  setNativeAssetVisibilityV1,
} from '../../src/nativeGs/schema';
import {
  addNativeAssetV1,
  assertNativeProjectDoesNotMixV1,
  createNativeProjectV1,
  deleteNativeProjectV1,
  listNativeProjectsV1,
  nativeActiveMarkerPath,
  nativeProjectRoot,
  nativeRepresentationPath,
  openNativeProjectV1,
  replaceNativeAssetV1,
  saveNativeProjectV1,
} from '../../src/nativeGs/storage';
import {
  makeNativeDraft,
  makeNativeGsReplacement,
  makeNativeMeshImport,
  makeNativeMeshReplacement,
  makeNativePointImport,
  NATIVE_TEST_IDS,
  testNativeId,
} from './nativeTestProject';

class RecordingMemoryFS extends MemoryFS {
  readonly writes: string[] = [];
  failBeforePath: string | null = null;

  override async writeText(path: string, text: string): Promise<void> {
    if (path.includes(this.failBeforePath ?? '\0')) throw new Error('injected write failure');
    await super.writeText(path, text);
    this.writes.push(path);
  }

  override async writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    if (path.includes(this.failBeforePath ?? '\0')) throw new Error('injected stream failure');
    await super.writeStream(path, stream);
    this.writes.push(path);
  }
}

class CorruptActiveMarkerMemoryFS extends RecordingMemoryFS {
  override async writeText(path: string, text: string): Promise<void> {
    if (path.endsWith('/active.json')) {
      const marker = JSON.parse(text) as { snapshotByteLength: number };
      marker.snapshotByteLength += 1;
      await super.writeText(path, JSON.stringify(marker));
      return;
    }
    await super.writeText(path, text);
  }
}

class LoseLockAfterMarkerCommitFS extends RecordingMemoryFS {
  onMarkerCommitted: (() => void) | null = null;

  override async writeText(path: string, text: string): Promise<void> {
    await super.writeText(path, text);
    if (path.endsWith('/active.json')) this.onMarkerCommitted?.();
  }
}

async function editable(fs: MemoryFS) {
  const coordinator = ProjectMutationCoordinator.local();
  const session = await coordinator.tryAcquire(fs, nativeProjectRoot(NATIVE_TEST_IDS.project), NATIVE_TEST_IDS.project);
  session.activateNewProject();
  return session;
}

describe('native project blob-first/marker-last publication', () => {
  it('streams every Representation, verifies it, then publishes snapshot and active marker last', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft(2);
    const snapshot = await createNativeProjectV1(session.workspace, draft, sources);
    expect(fs.writes.at(-1)).toBe(nativeActiveMarkerPath(snapshot.project.id));
    for (const representation of snapshot.representations) {
      expect(await fs.exists(nativeRepresentationPath(snapshot.project.id, representation.id))).toBe(true);
      expect(representation.blob.byteLength).toBe(sources.get(representation.id)?.size);
      expect(representation.blob.digest).toMatch(/^[0-9a-f]{64}$/);
    }
    await expect(openNativeProjectV1(fs, snapshot.project.id)).resolves.toMatchObject({
      snapshot: { snapshotId: snapshot.snapshotId, generation: 1 },
      missingRepresentationIds: [],
      sizeMismatchRepresentationIds: [],
    });
    expect(await listNativeProjectsV1(fs)).toEqual([{
      projectId: snapshot.project.id,
      title: draft.project.title,
      generation: 1,
      snapshotId: snapshot.snapshotId,
    }]);
    session.release();
  });

  it.each(['representations/', '/snapshots/'])('never activates a project when %s persistence fails', async (faultPath) => {
    const fs = new RecordingMemoryFS();
    fs.failBeforePath = faultPath;
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    await expect(createNativeProjectV1(session.workspace, draft, sources)).rejects.toThrow('injected');
    expect(await fs.exists(nativeActiveMarkerPath(draft.project.id))).toBe(false);
    expect(await listNativeProjectsV1(fs)).toEqual([]);
    session.release();
  });

  it('rejects an active marker whose snapshot byte length changes on read-back', async () => {
    const fs = new CorruptActiveMarkerMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    await expect(createNativeProjectV1(session.workspace, draft, sources)).rejects.toThrow(/marker read-back/);
    await expect(openNativeProjectV1(fs, draft.project.id)).rejects.toThrow(/active snapshot verification failed/);
    session.release();
  });

  it('admits an exact active marker that committed immediately before lock loss', async () => {
    const fs = new LoseLockAfterMarkerCommitFS();
    const session = await editable(fs);
    fs.onMarkerCommitted = () => session.failClosed('injected post-commit lock loss');
    const { draft, sources } = makeNativeDraft();
    const snapshot = await createNativeProjectV1(session.workspace, draft, sources);
    expect(session.accessState).toBe('lock-lost');
    await expect(openNativeProjectV1(fs, snapshot.project.id)).resolves.toMatchObject({
      snapshot: { snapshotId: snapshot.snapshotId },
    });
    expect(await listNativeProjectsV1(fs)).toHaveLength(1);
    session.release();
  });

  it('publishes metadata updates without rewriting immutable representation bytes', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    const first = await createNativeProjectV1(session.workspace, draft, sources);
    const binaryWriteCount = fs.writes.filter((path) => path.endsWith('.bin')).length;
    const aligned = activateNativeManualAssetTransformV1(
      first,
      NATIVE_TEST_IDS.gsAsset,
      testNativeId('bnd', 91),
      {
        translation: [8, 1.5, -4],
        rotationXYZW: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
        uniformScale: 0.5,
      },
    );
    const next = await saveNativeProjectV1(session.workspace, {
      ...setNativeAssetVisibilityV1(aligned, NATIVE_TEST_IDS.meshAsset, false),
      savedViews: [{
        id: NATIVE_TEST_IDS.savedView,
        name: 'Overview',
        orderKey: '0001',
        projectFrameId: NATIVE_TEST_IDS.projectFrame,
        camera: {
          position: [6, 4, 8],
          target: [0, 0, 0],
          up: [0, 1, 0],
          projection: { kind: 'perspective', verticalFovRadians: Math.PI / 3 },
        },
        background: { kind: 'solid', colorSrgb: [0.1, 0.2, 0.3] },
      }],
    });
    expect(next.generation).toBe(2);
    expect(fs.writes.filter((path) => path.endsWith('.bin'))).toHaveLength(binaryWriteCount);
    const reopened = (await openNativeProjectV1(fs, first.project.id)).snapshot;
    expect(reopened.presentation.hiddenAssetIds).toEqual([NATIVE_TEST_IDS.meshAsset]);
    expect(reopened.savedViews).toEqual(next.savedViews);
    expect(reopened.representations).toEqual(first.representations);
    expect(activeNativeBindingV1(reopened, NATIVE_TEST_IDS.gsAsset)?.assetToProject).toEqual(normalizeNativeSim3({
      translation: [8, 1.5, -4],
      rotationXYZW: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      uniformScale: 0.5,
    }));
    expect(activeNativeBindingV1(reopened, NATIVE_TEST_IDS.meshAsset)?.assetToProject).toEqual(
      activeNativeBindingV1(first, NATIVE_TEST_IDS.meshAsset)?.assetToProject,
    );
    session.release();
  });

  it('publishes an Asset removal without rewriting or deleting immutable source bytes', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft(2);
    const first = await createNativeProjectV1(session.workspace, draft, sources);
    const removedRepresentationIds = first.representations
      .filter((representation) => representation.assetId === NATIVE_TEST_IDS.gsAsset)
      .map((representation) => representation.id);
    const binaryWriteCount = fs.writes.filter((path) => path.endsWith('.bin')).length;

    const saved = await saveNativeProjectV1(
      session.workspace,
      removeNativeAssetV1(first, NATIVE_TEST_IDS.gsAsset),
    );
    const reopened = (await openNativeProjectV1(fs, first.project.id)).snapshot;

    expect(saved.generation).toBe(first.generation + 1);
    expect(reopened.assets.map((asset) => asset.id)).toEqual([NATIVE_TEST_IDS.meshAsset]);
    expect(reopened.representations.map((representation) => representation.id)).toEqual([
      NATIVE_TEST_IDS.meshRepresentation,
    ]);
    expect(fs.writes.filter((path) => path.endsWith('.bin'))).toHaveLength(binaryWriteCount);
    for (const representationId of removedRepresentationIds) {
      expect(await fs.exists(nativeRepresentationPath(first.project.id, representationId))).toBe(true);
    }
    expect(await fs.exists(nativeRepresentationPath(first.project.id, NATIVE_TEST_IDS.meshRepresentation))).toBe(true);
    session.release();
  });

  it('adds one same-kind Asset by streaming only its new bytes before snapshot and marker publication', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft(2);
    const first = await createNativeProjectV1(session.workspace, draft, sources);
    const binaryWriteCount = fs.writes.filter((path) => path.endsWith('.bin')).length;
    const added = makeNativeMeshImport();
    const next = await addNativeAssetV1(session.workspace, first, added.imported, added.sources);

    expect(next.generation).toBe(2);
    expect(next.assets.filter((asset) => (
      next.representations.some((representation) => representation.assetId === asset.id && representation.role === 'meshPrimary')
    ))).toHaveLength(2);
    expect(next.representations.slice(0, first.representations.length)).toEqual(first.representations);
    expect(fs.writes.filter((path) => path.endsWith('.bin'))).toHaveLength(binaryWriteCount + 1);
    expect(fs.writes.at(-1)).toBe(nativeActiveMarkerPath(next.project.id));
    expect(isNativeAssetVisibleV1(next, added.assetId)).toBe(true);
    expect(await fs.readBytes(nativeRepresentationPath(next.project.id, added.representationId))).toEqual(added.bytes);
    await expect(openNativeProjectV1(fs, next.project.id)).resolves.toMatchObject({
      snapshot: { snapshotId: next.snapshotId, generation: 2 },
      missingRepresentationIds: [],
      sizeMismatchRepresentationIds: [],
    });
    session.release();
  });

  it('publishes an exact ordinary-point Asset and rejects an invalid point payload before writing it', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft(2);
    const first = await createNativeProjectV1(session.workspace, draft, sources);
    const added = makeNativePointImport();
    const next = await addNativeAssetV1(session.workspace, first, added.imported, added.sources);

    expect(next.representations.find((entry) => entry.id === added.representationId)).toMatchObject({
      role: 'pointPrimary',
      contentKind: 'pointCloud',
      pointPly: { pointCount: 3, encoding: 'ascii' },
    });
    expect(await fs.readBytes(nativeRepresentationPath(next.project.id, added.representationId))).toEqual(added.bytes);
    expect((await openNativeProjectV1(fs, next.project.id)).snapshot).toEqual(next);

    const invalid = makeNativePointImport(301);
    const invalidBytes = new TextEncoder().encode(
      new TextDecoder().decode(invalid.bytes).replace(' 255\n', ' 256\n'),
    );
    expect(invalidBytes.byteLength).toBe(invalid.bytes.byteLength);
    const invalidBlob = new Blob([invalidBytes], { type: 'application/octet-stream' });
    const invalidSources = new Map([[invalid.representationId, {
      size: invalidBlob.size,
      mediaType: invalidBlob.type,
      stream: () => invalidBlob.stream(),
    }]]);

    await expect(addNativeAssetV1(session.workspace, next, invalid.imported, invalidSources)).rejects.toMatchObject({
      code: 'PLY_POINT_PAYLOAD_INVALID',
    });
    expect(await fs.exists(nativeRepresentationPath(next.project.id, invalid.representationId))).toBe(false);
    expect((await openNativeProjectV1(fs, next.project.id)).snapshot).toEqual(next);
    session.release();
  });

  it('keeps the prior active snapshot and removes staged import bytes when snapshot publication fails', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    const first = await createNativeProjectV1(session.workspace, draft, sources);
    const added = makeNativeMeshImport();
    fs.failBeforePath = '/snapshots/';

    await expect(addNativeAssetV1(session.workspace, first, added.imported, added.sources)).rejects.toThrow('injected');
    expect((await openNativeProjectV1(fs, first.project.id)).snapshot).toMatchObject({
      snapshotId: first.snapshotId,
      generation: first.generation,
      assets: first.assets,
      representations: first.representations,
    });
    expect(await fs.exists(nativeRepresentationPath(first.project.id, added.representationId))).toBe(false);
    session.release();
  });

  it('replaces Mesh and GS content while preserving Asset identity, placement and reviewable Captions', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const base = makeNativeDraft(2);
    const draft = {
      ...base.draft,
      captions: [{
        id: NATIVE_TEST_IDS.caption,
        title: 'Retained GS Caption',
        body: 'body and position must not move',
        anchor: {
          kind: 'asset' as const,
          assetId: NATIVE_TEST_IDS.gsAsset,
          assetFrameId: NATIVE_TEST_IDS.gsFrame,
          positionAsset: [1.25, -0.5, 2.75] as const,
          authoredAssetRevisionId: NATIVE_TEST_IDS.gsRevision,
          authoredAnchorCompatibilityId: NATIVE_TEST_IDS.gsClass,
          hitEvidence: { method: 'manual' as const },
        },
      }],
    };
    const first = await createNativeProjectV1(session.workspace, draft, base.sources);
    const meshBindingBefore = activeNativeBindingV1(first, NATIVE_TEST_IDS.meshAsset)!;
    const gsBindingBefore = activeNativeBindingV1(first, NATIVE_TEST_IDS.gsAsset)!;
    const oldRepresentationIds = first.representations.map((entry) => entry.id);

    const meshReplacement = makeNativeMeshReplacement(first, NATIVE_TEST_IDS.meshAsset);
    const afterMesh = await replaceNativeAssetV1(
      session.workspace,
      first,
      meshReplacement.imported,
      meshReplacement.sources,
    );
    expect(afterMesh.assets.find((asset) => asset.id === NATIVE_TEST_IDS.meshAsset)).toMatchObject({
      id: NATIVE_TEST_IDS.meshAsset,
      label: 'ordinary Mesh',
      assetFrameId: NATIVE_TEST_IDS.meshFrame,
      status: { activeBindingId: meshReplacement.imported.binding.id },
    });
    expect(activeNativeBindingV1(afterMesh, NATIVE_TEST_IDS.meshAsset)?.assetToProject).toEqual(meshBindingBefore.assetToProject);
    expect(activeNativeBindingV1(afterMesh, NATIVE_TEST_IDS.gsAsset)).toEqual(gsBindingBefore);
    expect(activeNativeRepresentationsV1(afterMesh, NATIVE_TEST_IDS.meshAsset).map((entry) => entry.id)).toEqual([
      meshReplacement.representationId,
    ]);
    expect(afterMesh.representations.map((entry) => entry.id)).toEqual(expect.arrayContaining(oldRepresentationIds));

    const gsReplacement = makeNativeGsReplacement(afterMesh, NATIVE_TEST_IDS.gsAsset);
    const afterGs = await replaceNativeAssetV1(
      session.workspace,
      afterMesh,
      gsReplacement.imported,
      gsReplacement.sources,
    );
    expect(activeNativeBindingV1(afterGs, NATIVE_TEST_IDS.gsAsset)?.assetToProject).toEqual(gsBindingBefore.assetToProject);
    expect(activeNativeRepresentationsV1(afterGs, NATIVE_TEST_IDS.gsAsset).map((entry) => entry.id).sort()).toEqual([
      gsReplacement.gsRepresentationId,
      gsReplacement.proxyRepresentationId,
    ].sort());
    expect(afterGs.captions).toEqual(first.captions);
    expect(nativeCaptionNeedsReviewV1(afterGs, afterGs.captions[0]!)).toBe(true);
    for (const representationId of [
      ...oldRepresentationIds,
      meshReplacement.representationId,
      gsReplacement.gsRepresentationId,
      gsReplacement.proxyRepresentationId,
    ]) {
      expect(await fs.exists(nativeRepresentationPath(afterGs.project.id, representationId))).toBe(true);
    }
    expect(fs.writes.at(-1)).toBe(nativeActiveMarkerPath(afterGs.project.id));
    session.release();
  });

  it('keeps the prior active snapshot when replacement publication fails', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const base = makeNativeDraft();
    const first = await createNativeProjectV1(session.workspace, base.draft, base.sources);
    const durableBefore = (await openNativeProjectV1(fs, first.project.id)).snapshot;
    const replacement = makeNativeMeshReplacement(first, NATIVE_TEST_IDS.meshAsset, 160);
    fs.failBeforePath = '/snapshots/';

    await expect(replaceNativeAssetV1(
      session.workspace,
      first,
      replacement.imported,
      replacement.sources,
    )).rejects.toThrow('injected');
    expect((await openNativeProjectV1(fs, first.project.id)).snapshot).toEqual(durableBefore);
    expect(await fs.exists(nativeRepresentationPath(first.project.id, replacement.representationId))).toBe(false);
    session.release();
  });

  it('refuses v1/native identity mixing and immutable path overwrite', async () => {
    const fs = new RecordingMemoryFS();
    await fs.writeText('projects/meta_01ARZ3NDEKTSV4RRFFQ69G5FAV/lociview.json', JSON.stringify({
      format: 'lociview-project',
      schemaVersion: 1,
      projectId: NATIVE_TEST_IDS.project,
      name: 'v1 collision',
      createdAt: '2026-08-28T00:00:00.000Z',
      generator: 'test',
    }));
    await expect(assertNativeProjectDoesNotMixV1(fs, NATIVE_TEST_IDS.project)).rejects.toThrow(/mixed/);
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    await fs.writeBytes(nativeRepresentationPath(draft.project.id, NATIVE_TEST_IDS.meshRepresentation), new Uint8Array([1]));
    await expect(createNativeProjectV1(session.workspace, draft, sources)).rejects.toThrow(/already exists/);
    expect(await fs.exists(nativeActiveMarkerPath(draft.project.id))).toBe(false);
    session.release();
  });

  it('refuses a stale deletion confirmation, then removes the exact confirmed snapshot', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    const first = await createNativeProjectV1(session.workspace, draft, sources);
    const current = await saveNativeProjectV1(session.workspace, {
      ...first,
      presentation: { ...first.presentation, displayMode: 'gs-only' },
    });
    await expect(deleteNativeProjectV1(session.workspace, draft.project.id, first)).rejects.toThrow(/changed/);
    await expect(openNativeProjectV1(fs, draft.project.id)).resolves.toMatchObject({
      snapshot: { snapshotId: current.snapshotId },
    });
    await deleteNativeProjectV1(session.workspace, draft.project.id, current);
    expect(await fs.list(`${nativeProjectRoot(draft.project.id)}/`)).toEqual([]);
    expect(await listNativeProjectsV1(fs)).toEqual([]);
    session.release();
  });
});
