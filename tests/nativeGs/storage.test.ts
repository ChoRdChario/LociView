import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { MemoryFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';
import { candidateV1ImportReceiptPath } from '../../src/core/manifest';
import {
  activeNativeBindingV1,
  activeNativeRepresentationsV1,
  isNativeAssetVisibleV1,
  nativeCaptionNeedsReviewV1,
} from '../../src/nativeGs/resolver';
import {
  activateNativeManualAssetTransformV1,
  appendNativeSavedViewAsDisplaySetDefaultV1,
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  normalizeNativeSim3,
  removeNativeAssetV1,
  setNativeAssetVisibilityV1,
} from '../../src/nativeGs/schema';
import {
  addNativeAssetV1,
  addNativeCaptionImageV1,
  assertNativeProjectDoesNotMixV1,
  createNativeProjectV1,
  deleteNativeProjectV1,
  listNativeProjectsV1,
  nativeActiveMarkerPath,
  nativeMediaPath,
  nativeProjectRoot,
  nativeRepresentationPath,
  openNativeProjectV1,
  replaceNativeAssetV1,
  restoreNativeProjectV1,
  saveNativeProjectV1,
} from '../../src/nativeGs/storage';
import { digestNativeBytes } from '../../src/nativeGs/sha256';
import {
  makeNativeDraft,
  makeNativeGsReplacement,
  makeNativeMeshImport,
  makeNativeMeshReplacement,
  makeNativePointImport,
  NATIVE_TEST_IDS,
  testNativeId,
} from './nativeTestProject';

const VALID_PNG_BYTES = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));
const VALID_JPEG_BYTES = new Uint8Array(Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==',
  'base64',
));
const EMPTY_PAYLOAD_IMAGE_ENVELOPES = [
  ['empty.jpg', 'image/jpeg', new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0,
    0xff, 0xd9,
  ])],
  ['empty.png', 'image/png', new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ])],
  ['empty.gif', 'image/gif', new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0,
    0, 0, 0, 0xff, 0xff, 0xff,
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0,
    2, 0, 0x3b,
  ])],
  ['empty.webp', 'image/webp', new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ])],
] as const;

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

class ChangingCandidatePublicationFS extends RecordingMemoryFS {
  private markerReadCount = 0;

  override async readBytes(path: string): Promise<Uint8Array | null> {
    const bytes = await super.readBytes(path);
    if (!path.endsWith('/lociview.json') || bytes === null) return bytes;
    this.markerReadCount += 1;
    if (this.markerReadCount % 2 === 1) return bytes;
    const changed = new Uint8Array(bytes.length + 1);
    changed.set(bytes);
    changed[bytes.length] = 0x20;
    return changed;
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

  it('checks an external source authority immediately before snapshot and marker publication', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    let publicationChecks = 0;
    await expect(createNativeProjectV1(
      session.workspace,
      draft,
      sources,
      undefined,
      new Map(),
      async () => {
        const ordinal = ++publicationChecks;
        await Promise.resolve();
        if (ordinal === 2) throw new Error('injected source fingerprint mismatch');
      },
    )).rejects.toThrow(/source fingerprint mismatch/);
    expect(publicationChecks).toBe(2);
    expect(fs.writes.some((path) => path.includes('/snapshots/'))).toBe(true);
    expect(await fs.exists(nativeActiveMarkerPath(draft.project.id))).toBe(false);
    expect(await listNativeProjectsV1(fs)).toEqual([]);
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
    const savedView = {
      id: NATIVE_TEST_IDS.savedView,
      name: 'Overview',
      orderKey: '0001',
      projectFrameId: NATIVE_TEST_IDS.projectFrame,
      camera: {
        position: [6, 4, 8] as const,
        target: [0, 0, 0] as const,
        up: [0, 1, 0] as const,
        projection: { kind: 'perspective' as const, verticalFovRadians: Math.PI / 3 },
      },
      background: { kind: 'solid' as const, colorSrgb: [0.1, 0.2, 0.3] as const },
    };
    const next = await saveNativeProjectV1(session.workspace, appendNativeSavedViewAsDisplaySetDefaultV1(
      setNativeAssetVisibilityV1(aligned, NATIVE_TEST_IDS.meshAsset, false),
      NATIVE_DEFAULT_DISPLAY_SET_ID,
      savedView,
    ));
    expect(next.generation).toBe(2);
    expect(fs.writes.filter((path) => path.endsWith('.bin'))).toHaveLength(binaryWriteCount);
    const reopened = (await openNativeProjectV1(fs, first.project.id)).snapshot;
    expect(reopened.presentation.hiddenAssetIds).toEqual([NATIVE_TEST_IDS.meshAsset]);
    expect(reopened.savedViews).toEqual(next.savedViews);
    expect(reopened.displaySets).toEqual(next.displaySets);
    expect(reopened.displaySets?.[0]?.defaultSavedViewId).toBe(savedView.id);
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

  it('refuses Asset publication when existing Caption media bytes are unavailable', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const base = makeNativeDraft(2);
    const mediaId = testNativeId('med', 95);
    const mediaBlob = new Blob([VALID_PNG_BYTES], { type: 'image/png' });
    const draft = {
      ...base.draft,
      mediaResources: [{ id: mediaId, label: 'Caption image', kind: 'image' as const, mediaType: 'image/png' }],
    };
    const first = await createNativeProjectV1(
      session.workspace,
      draft,
      base.sources,
      undefined,
      new Map([[mediaId, {
        size: mediaBlob.size,
        mediaType: mediaBlob.type,
        stream: () => mediaBlob.stream(),
      }]]),
    );
    await fs.remove(nativeMediaPath(first.project.id, mediaId));
    const added = makeNativeMeshImport();
    await expect(addNativeAssetV1(session.workspace, first, added.imported, added.sources)).rejects.toThrow(/media bytes are unavailable/);
    expect((await openNativeProjectV1(fs, first.project.id)).snapshot).toMatchObject({
      snapshotId: first.snapshotId,
      generation: first.generation,
      assets: first.assets,
      representations: first.representations,
      mediaResources: first.mediaResources,
    });
    expect(await fs.exists(nativeRepresentationPath(first.project.id, added.representationId))).toBe(false);
    session.release();
  });

  it('does not activate a new Project when media bytes change after create preflight', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const base = makeNativeDraft(2);
    const mediaId = testNativeId('med', 96);
    const paddedHeic = new Uint8Array(VALID_JPEG_BYTES.byteLength);
    paddedHeic.set([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
      0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
    ]);
    let streamCall = 0;
    const changingSource = {
      size: VALID_JPEG_BYTES.byteLength,
      mediaType: 'image/jpeg',
      stream: () => new Blob([
        Uint8Array.from(streamCall++ === 0 ? VALID_JPEG_BYTES : paddedHeic),
      ], { type: 'image/jpeg' }).stream(),
    };
    const draft = {
      ...base.draft,
      captions: [{
        id: NATIVE_TEST_IDS.caption,
        title: 'Create preflight target',
        body: '',
        attachmentMediaIds: [mediaId],
        anchor: null,
      }],
      mediaResources: [{
        id: mediaId,
        label: 'Device export.jpg',
        kind: 'image' as const,
        mediaType: 'image/jpeg' as const,
      }],
    };

    await expect(createNativeProjectV1(
      session.workspace,
      draft,
      base.sources,
      undefined,
      new Map([[mediaId, changingSource]]),
    )).rejects.toThrow(/changed after content inspection/);
    expect(await fs.exists(nativeMediaPath(draft.project.id, mediaId))).toBe(false);
    expect(await fs.exists(nativeActiveMarkerPath(draft.project.id))).toBe(false);
    expect(await listNativeProjectsV1(fs)).toEqual([]);
    session.release();
  });

  it('rejects disguised HEIC before any Caption write, then admits a separately exported JPEG', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const base = makeNativeDraft(2);
    const draft = {
      ...base.draft,
      captions: [{
        id: NATIVE_TEST_IDS.caption,
        title: 'Device conversion target',
        body: '',
        anchor: {
          kind: 'asset' as const,
          assetId: NATIVE_TEST_IDS.gsAsset,
          assetFrameId: NATIVE_TEST_IDS.gsFrame,
          positionAsset: [0, 0, 0] as const,
          authoredAssetRevisionId: NATIVE_TEST_IDS.gsRevision,
          authoredAnchorCompatibilityId: NATIVE_TEST_IDS.gsClass,
          hitEvidence: { method: 'manual' as const },
        },
      }],
    };
    const first = await createNativeProjectV1(session.workspace, draft, base.sources);
    const durableBefore = (await openNativeProjectV1(fs, first.project.id)).snapshot;
    const writesBefore = [...fs.writes];
    const heicBytes = new Uint8Array([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
      0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
    ]);
    const disguisedHeic = new Blob([heicBytes], { type: 'image/jpeg' });

    await expect(addNativeCaptionImageV1(
      session.workspace,
      first,
      NATIVE_TEST_IDS.caption,
      'photo.jpg',
      { size: disguisedHeic.size, mediaType: disguisedHeic.type, stream: () => disguisedHeic.stream() },
    )).rejects.toMatchObject({ code: 'heic-device-conversion-required' });
    expect(fs.writes).toEqual(writesBefore);
    expect((await openNativeProjectV1(fs, first.project.id)).snapshot).toEqual(durableBefore);

    for (const [name, mediaType, bytes] of EMPTY_PAYLOAD_IMAGE_ENVELOPES) {
      const emptyPayload = new Blob([Uint8Array.from(bytes)], { type: mediaType });
      await expect(addNativeCaptionImageV1(
        session.workspace,
        first,
        NATIVE_TEST_IDS.caption,
        name,
        { size: emptyPayload.size, mediaType: emptyPayload.type, stream: () => emptyPayload.stream() },
      )).rejects.toMatchObject({ code: 'image-content-invalid' });
      expect((await openNativeProjectV1(fs, first.project.id)).snapshot).toEqual(durableBefore);
      expect(await fs.list(`${nativeProjectRoot(first.project.id)}/media/`)).toEqual([]);
    }

    const paddedHeic = new Uint8Array(VALID_JPEG_BYTES.byteLength);
    paddedHeic.set(heicBytes);
    let streamCall = 0;
    const changingSource = {
      size: VALID_JPEG_BYTES.byteLength,
      mediaType: 'image/jpeg',
      stream: () => new Blob([
        Uint8Array.from(streamCall++ < 2 ? VALID_JPEG_BYTES : paddedHeic),
      ], { type: 'image/jpeg' }).stream(),
    };
    await expect(addNativeCaptionImageV1(
      session.workspace,
      first,
      NATIVE_TEST_IDS.caption,
      'changing.jpg',
      changingSource,
    )).rejects.toThrow(/changed after content inspection/);
    expect((await openNativeProjectV1(fs, first.project.id)).snapshot).toEqual(durableBefore);
    expect(await fs.list(`${nativeProjectRoot(first.project.id)}/media/`)).toEqual([]);

    // The compatibility path produces a genuinely decodable new JPEG file. An
    // empty browser MIME declaration is allowed because bytes are authoritative.
    const jpegBytes = VALID_JPEG_BYTES;
    const convertedJpeg = new Blob([jpegBytes]);
    const next = await addNativeCaptionImageV1(
      session.workspace,
      first,
      NATIVE_TEST_IDS.caption,
      'converted.jpg',
      { size: convertedJpeg.size, mediaType: convertedJpeg.type, stream: () => convertedJpeg.stream() },
    );
    const media = next.mediaResources?.[0];
    expect(next.generation).toBe(first.generation + 1);
    expect(media?.blob.mediaType).toBe('image/jpeg');
    expect(next.captions[0]?.attachmentMediaIds).toEqual([media?.id]);
    expect(await fs.readBytes(nativeMediaPath(next.project.id, media!.id))).toEqual(jpegBytes);
    expect((await openNativeProjectV1(fs, next.project.id)).snapshot).toEqual(next);

    // A package can lie consistently in its MIME metadata and digest. The
    // restore service still inspects the actual bytes and leaves no project.
    const heicDigest = digestNativeBytes(heicBytes);
    const forged = {
      ...next,
      mediaResources: next.mediaResources?.map((entry) => entry.id === media!.id ? {
        ...entry,
        blob: {
          ...entry.blob,
          byteLength: heicDigest.byteLength,
          digest: heicDigest.sha256,
        },
      } : entry),
    };
    const target = new RecordingMemoryFS();
    const restoreSession = await editable(target);
    await expect(restoreNativeProjectV1(
      restoreSession.workspace,
      target,
      forged,
      base.sources,
      undefined,
      undefined,
      undefined,
      new Map([[media!.id, {
        size: disguisedHeic.size,
        mediaType: disguisedHeic.type,
        stream: () => disguisedHeic.stream(),
      }]]),
    )).rejects.toMatchObject({ code: 'heic-device-conversion-required' });
    expect(await target.list(`${nativeProjectRoot(next.project.id)}/`)).toEqual([]);
    restoreSession.release();

    for (const [, mediaType, bytes] of EMPTY_PAYLOAD_IMAGE_ENVELOPES) {
      const invalidDigest = digestNativeBytes(bytes);
      const invalidSnapshot = {
        ...next,
        mediaResources: next.mediaResources?.map((entry) => entry.id === media!.id ? {
          ...entry,
          blob: {
            ...entry.blob,
            byteLength: invalidDigest.byteLength,
            digest: invalidDigest.sha256,
            mediaType,
          },
        } : entry),
      };
      const invalidBlob = new Blob([Uint8Array.from(bytes)], { type: mediaType });
      const invalidTarget = new RecordingMemoryFS();
      const invalidRestoreSession = await editable(invalidTarget);
      await expect(restoreNativeProjectV1(
        invalidRestoreSession.workspace,
        invalidTarget,
        invalidSnapshot,
        base.sources,
        undefined,
        undefined,
        undefined,
        new Map([[media!.id, {
          size: invalidBlob.size,
          mediaType: invalidBlob.type,
          stream: () => invalidBlob.stream(),
        }]]),
      )).rejects.toMatchObject({ code: 'image-content-invalid' });
      expect(await invalidTarget.list(`${nativeProjectRoot(next.project.id)}/`)).toEqual([]);
      invalidRestoreSession.release();
    }
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
      assets: base.draft.assets.map((asset) => asset.id === NATIVE_TEST_IDS.gsAsset
        ? { ...asset, pinScale: 100 }
        : asset),
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
    const meshReplacementWithIncomingPinScale = {
      ...meshReplacement,
      imported: {
        ...meshReplacement.imported,
        asset: { ...meshReplacement.imported.asset, pinScale: 50 },
      },
    };
    const afterMesh = await replaceNativeAssetV1(
      session.workspace,
      first,
      meshReplacementWithIncomingPinScale.imported,
      meshReplacementWithIncomingPinScale.sources,
    );
    expect(afterMesh.assets.find((asset) => asset.id === NATIVE_TEST_IDS.meshAsset)).toMatchObject({
      id: NATIVE_TEST_IDS.meshAsset,
      label: 'ordinary Mesh',
      assetFrameId: NATIVE_TEST_IDS.meshFrame,
      status: { activeBindingId: meshReplacement.imported.binding.id },
    });
    expect(activeNativeBindingV1(afterMesh, NATIVE_TEST_IDS.meshAsset)?.assetToProject).toEqual(meshBindingBefore.assetToProject);
    expect(afterMesh.assets.find((asset) => asset.id === NATIVE_TEST_IDS.meshAsset)?.pinScale).toBeUndefined();
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
    expect(afterGs.assets.find((asset) => asset.id === NATIVE_TEST_IDS.gsAsset)?.pinScale).toBe(100);
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
    const { draft, sources } = makeNativeDraft();
    await expect(assertNativeProjectDoesNotMixV1(fs, NATIVE_TEST_IDS.project)).resolves.toBeUndefined();
    await fs.writeText('projects/meta_01ARZ3NDEKTSV4RRFFQ69G5FAV/lociview.json', JSON.stringify({
      format: 'lociview-project',
      schemaVersion: 1,
      projectId: NATIVE_TEST_IDS.project,
      name: 'v1 collision',
      createdAt: '2026-08-28T00:00:00.000Z',
      generator: 'test',
    }));
    await expect(assertNativeProjectDoesNotMixV1(fs, NATIVE_TEST_IDS.project)).rejects.toThrow(
      /同じ識別情報の従来形式/,
    );
    const session = await editable(fs);
    const writesBeforeCollisionCheck = [...fs.writes];
    await expect(createNativeProjectV1(session.workspace, draft, sources)).rejects.toThrow(
      /同じ識別情報の従来形式/,
    );
    expect(fs.writes).toEqual(writesBeforeCollisionCheck);
    expect(await fs.exists(nativeActiveMarkerPath(draft.project.id))).toBe(false);

    await fs.remove('projects/meta_01ARZ3NDEKTSV4RRFFQ69G5FAV/lociview.json');
    await fs.writeBytes(nativeRepresentationPath(draft.project.id, NATIVE_TEST_IDS.meshRepresentation), new Uint8Array([1]));
    await expect(createNativeProjectV1(session.workspace, draft, sources)).rejects.toThrow(/already exists/);
    expect(await fs.exists(nativeActiveMarkerPath(draft.project.id))).toBe(false);
    session.release();
  });

  it('keeps an active Native Project listed beside an incomplete conventional-source marker', async () => {
    const fs = new RecordingMemoryFS();
    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    const snapshot = await createNativeProjectV1(session.workspace, draft, sources);
    const sourceDir = 'projects/incomplete-collision-source';
    const manifestBytes = new TextEncoder().encode(`${JSON.stringify({
      format: 'lociview-project',
      schemaVersion: 1,
      projectId: snapshot.project.id,
      name: 'incomplete conventional source',
      createdAt: '2026-09-03T00:00:00.000Z',
      generator: 'test',
    })}\n`);
    await fs.writeBytes(candidateV1ImportReceiptPath(sourceDir), manifestBytes);
    await fs.writeBytes(`${sourceDir}/lociview.json`, manifestBytes.slice(0, -1));

    await expect(assertNativeProjectDoesNotMixV1(fs, snapshot.project.id)).resolves.toBeUndefined();
    expect(await listNativeProjectsV1(fs)).toEqual([{
      projectId: snapshot.project.id,
      title: snapshot.project.title,
      generation: snapshot.generation,
      snapshotId: snapshot.snapshotId,
    }]);
    session.release();
  });

  it('fails closed before Native writes when a conventional publication changes during namespace inspection', async () => {
    const fs = new ChangingCandidatePublicationFS();
    await fs.writeText('projects/changing-source/lociview.json', JSON.stringify({
      format: 'lociview-project',
      schemaVersion: 1,
      projectId: NATIVE_TEST_IDS.project,
      name: 'changing conventional source',
      createdAt: '2026-09-03T00:00:00.000Z',
      generator: 'test',
    }));
    await expect(assertNativeProjectDoesNotMixV1(fs, NATIVE_TEST_IDS.project)).rejects.toThrow(
      /publication changed while reading/,
    );

    const session = await editable(fs);
    const { draft, sources } = makeNativeDraft();
    const writesBeforeCreate = [...fs.writes];
    await expect(createNativeProjectV1(session.workspace, draft, sources)).rejects.toThrow(
      /publication changed while reading/,
    );
    expect(fs.writes).toEqual(writesBeforeCreate);
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
