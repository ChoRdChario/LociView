import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  BlobReader,
  BlobWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  type FileEntry,
} from '@zip.js/zip.js';
import { MemoryFS, type WorkspaceReadableFile } from '../../src/platform/fs';
import { ProjectMutationCoordinator, type ProjectMutationSession } from '../../src/platform/projectLock';
import {
  exportNativePortablePackageV1,
  inspectNativePortablePackageV1,
  NATIVE_PORTABLE_MANIFEST_ENTRY,
  NATIVE_PORTABLE_SNAPSHOT_ENTRY,
  restoreNativePortablePackageV1,
} from '../../src/nativeGs/portablePackage';
import {
  activateNativeManualAssetTransformV1,
  setNativeAssetVisibilityV1,
  type NativeProjectDraftV1,
} from '../../src/nativeGs/schema';
import {
  addNativeAssetV1,
  createNativeProjectV1,
  listNativeProjectsV1,
  nativeActiveMarkerPath,
  nativeProjectRoot,
  nativeMediaPath,
  nativeRepresentationPath,
  nativeSnapshotPath,
  openNativeProjectV1,
  replaceNativeAssetV1,
  saveNativeProjectV1,
} from '../../src/nativeGs/storage';
import { nativeCaptionNeedsReviewV1 } from '../../src/nativeGs/resolver';
import {
  makeGsPlySource,
  makeNativeDraft,
  makeNativeGsReplacement,
  makeNativeMeshImport,
  makeNativePointImport,
  NATIVE_TEST_IDS,
  testNativeId,
} from './nativeTestProject';

class ChunkedMemoryFS extends MemoryFS {
  constructor(private readonly chunkBytes = 4096) {
    super();
  }

  override async readStream(path: string): Promise<WorkspaceReadableFile | null> {
    const bytes = await this.readBytes(path);
    if (bytes === null) return null;
    const stable = new Uint8Array(bytes);
    return {
      size: stable.byteLength,
      blob: async () => new Blob([new Uint8Array(stable)]),
      stream: () => {
        let offset = 0;
        return new ReadableStream<Uint8Array>({
          pull: (controller) => {
            if (offset >= stable.byteLength) {
              controller.close();
              return;
            }
            const end = Math.min(stable.byteLength, offset + this.chunkBytes);
            controller.enqueue(stable.slice(offset, end));
            offset = end;
          },
        });
      },
    };
  }
}

class QuotaAfterPrefixFS extends ChunkedMemoryFS {
  private failed = false;

  override async writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    if (!this.failed && path.includes('/representations/')) {
      this.failed = true;
      const error = new DOMException('Injected quota exhaustion', 'QuotaExceededError');
      const reader = stream.getReader();
      try {
        await reader.read();
        await reader.cancel(error);
      } finally {
        reader.releaseLock();
      }
      throw error;
    }
    await super.writeStream(path, stream);
  }
}

interface RawZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

const VALID_PNG_BYTES = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));

async function storedZipEntries(blob: Blob): Promise<RawZipEntry[]> {
  const reader = new ZipReader(new BlobReader(blob), { strictness: 'strict' });
  try {
    const entries = await reader.getEntries({ strictness: 'strict', checkAmbiguity: true });
    const result: RawZipEntry[] = [];
    for (const entry of entries) {
      expect(entry.directory).toBe(false);
      expect(entry.compressionMethod).toBe(0);
      const bytes = await (entry as FileEntry).getData(new Uint8ArrayWriter(), {
        checkSignature: true,
        strictness: 'strict',
      });
      result.push({ path: entry.filename, bytes });
    }
    return result;
  } finally {
    await reader.close();
  }
}

async function writeStoredZip(entries: readonly RawZipEntry[]): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { level: 0, zip64: false });
  for (const entry of entries) {
    await writer.add(entry.path, new Uint8ArrayReader(entry.bytes), {
      level: 0,
      bufferedWrite: false,
      dataDescriptor: true,
      zip64: false,
    });
  }
  return writer.close(undefined, { zip64: false });
}

async function editPackage(
  blob: Blob,
  edit: (entries: RawZipEntry[]) => void,
): Promise<Blob> {
  const entries = await storedZipEntries(blob);
  edit(entries);
  return writeStoredZip(entries);
}

async function acquireNew(fs: MemoryFS, projectId = NATIVE_TEST_IDS.project): Promise<ProjectMutationSession> {
  const session = await ProjectMutationCoordinator.local().tryAcquire(fs, nativeProjectRoot(projectId), projectId);
  session.activateNewProject();
  return session;
}

async function makeSourceProject(withMedia = false): Promise<{
  readonly fs: ChunkedMemoryFS;
  readonly session: ProjectMutationSession;
  readonly snapshot: Awaited<ReturnType<typeof createNativeProjectV1>>;
  readonly mediaId: string | null;
  readonly mediaBytes: Uint8Array | null;
}> {
  const fs = new ChunkedMemoryFS();
  const base = makeNativeDraft(2);
  const gs = makeGsPlySource(2, 512);
  const mediaId = testNativeId('med', 94);
  const mediaBytes = VALID_PNG_BYTES;
  const mediaBlob = new Blob([mediaBytes], { type: 'image/png' });
  const detailedDraft: NativeProjectDraftV1 = {
    ...base.draft,
    representations: base.draft.representations.map((representation) => (
      representation.id === NATIVE_TEST_IDS.gsRepresentation
        ? { ...representation, gsPly: gs.facts }
        : representation
    )),
    captions: [{
      id: NATIVE_TEST_IDS.caption,
      title: 'GS Caption',
      body: 'portable body',
      anchor: {
        kind: 'asset',
        assetId: NATIVE_TEST_IDS.gsAsset,
        assetFrameId: NATIVE_TEST_IDS.gsFrame,
        positionAsset: [1.25, -0.5, 2.75],
        authoredAssetRevisionId: NATIVE_TEST_IDS.gsRevision,
        authoredAnchorCompatibilityId: NATIVE_TEST_IDS.gsClass,
        hitEvidence: { method: 'manual' },
      },
      ...(withMedia ? { attachmentMediaIds: [mediaId] } : {}),
    }, {
      id: testNativeId('cap', 93),
      title: 'Unrelated Caption',
      body: 'must survive portable restore',
      anchor: {
        kind: 'asset',
        assetId: NATIVE_TEST_IDS.meshAsset,
        assetFrameId: NATIVE_TEST_IDS.meshFrame,
        positionAsset: [-2, 0.25, 4],
        authoredAssetRevisionId: NATIVE_TEST_IDS.meshRevision,
        authoredAnchorCompatibilityId: NATIVE_TEST_IDS.meshClass,
        hitEvidence: { method: 'manual' },
      },
    }],
    savedViews: [{
      id: NATIVE_TEST_IDS.savedView,
      name: 'Portable overview',
      orderKey: '0001',
      projectFrameId: NATIVE_TEST_IDS.projectFrame,
      camera: {
        position: [8, 6, 10],
        target: [1, 0, -2],
        up: [0, 1, 0],
        projection: { kind: 'orthographic', verticalSpan: 14 },
      },
      background: { kind: 'solid', colorSrgb: [0.05, 0.1, 0.2] },
    }],
    ...(withMedia ? {
      // Schema-1 label is display text, not a filename or format authority.
      mediaResources: [{ id: mediaId, label: 'Historical display label.heic', kind: 'image', mediaType: 'image/png' }],
    } : {}),
  };
  const sources = new Map(base.sources);
  sources.set(NATIVE_TEST_IDS.gsRepresentation, gs.source);
  const session = await acquireNew(fs);
  const mediaSources = withMedia
    ? new Map([[mediaId, {
      size: mediaBlob.size,
      mediaType: mediaBlob.type,
      stream: () => mediaBlob.stream(),
    }]])
    : new Map();
  const created = await createNativeProjectV1(session.workspace, detailedDraft, sources, undefined, mediaSources);
  const added = makeNativeMeshImport();
  const multiAsset = await addNativeAssetV1(session.workspace, created, added.imported, added.sources);
  const point = makeNativePointImport();
  const withPoint = await addNativeAssetV1(session.workspace, multiAsset, point.imported, point.sources);
  const replacement = makeNativeGsReplacement(withPoint, NATIVE_TEST_IDS.gsAsset, 180);
  const replaced = await replaceNativeAssetV1(
    session.workspace,
    withPoint,
    replacement.imported,
    replacement.sources,
  );
  const aligned = activateNativeManualAssetTransformV1(
    replaced,
    NATIVE_TEST_IDS.gsAsset,
    testNativeId('bnd', 92),
    {
      translation: [6, 2, -3],
      rotationXYZW: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      uniformScale: 0.625,
    },
  );
  const snapshot = await saveNativeProjectV1(
    session.workspace,
    setNativeAssetVisibilityV1(aligned, NATIVE_TEST_IDS.meshAsset, false),
  );
  return {
    fs,
    session,
    snapshot,
    mediaId: withMedia ? mediaId : null,
    mediaBytes: withMedia ? mediaBytes : null,
  };
}

async function exportBlob(source: Awaited<ReturnType<typeof makeSourceProject>>): Promise<{
  readonly blob: Blob;
  readonly result: Awaited<ReturnType<typeof exportNativePortablePackageV1>>;
}> {
  const chunks: Uint8Array[] = [];
  const destination = new WritableStream<Uint8Array>({
    write(chunk) { chunks.push(new Uint8Array(chunk)); },
  });
  const result = await exportNativePortablePackageV1(
    source.session.workspace,
    source.snapshot.project.id,
    destination,
  );
  return { blob: new Blob(chunks.map((chunk) => new Uint8Array(chunk))), result };
}

async function expectInactive(fs: MemoryFS, projectId = NATIVE_TEST_IDS.project): Promise<void> {
  expect(await fs.exists(nativeActiveMarkerPath(projectId))).toBe(false);
  expect(await listNativeProjectsV1(fs)).toEqual([]);
  expect(await fs.list(`${nativeProjectRoot(projectId)}/`)).toEqual([]);
}

describe('native portable .lociview streamed backup/restore', () => {
  it('uses package v2 only when Caption image media is present and restores exact STORE bytes', async () => {
    const source = await makeSourceProject(true);
    const mediaId = source.mediaId!;
    const { blob, result } = await exportBlob(source);
    expect(result.manifest.packageVersion).toBe(2);
    expect(result.manifest.media).toEqual([expect.objectContaining({ mediaId, mediaType: 'image/png' })]);
    expect(result.metrics.mediaByteLength).toBe(source.mediaBytes!.byteLength);

    const entries = await storedZipEntries(blob);
    const mediaEntry = entries.find((entry) => entry.path === `native/media/${mediaId}.bin`);
    expect(mediaEntry?.bytes).toEqual(source.mediaBytes);

    const inspection = await inspectNativePortablePackageV1(blob);
    expect(inspection.manifest.packageVersion).toBe(2);
    expect(inspection.snapshot.captions[0]?.attachmentMediaIds).toEqual([mediaId]);
    expect(inspection.snapshot.mediaResources?.[0]?.label).toBe('Historical display label.heic');

    const target = new ChunkedMemoryFS();
    const restoreSession = await acquireNew(target);
    const restored = await restoreNativePortablePackageV1(restoreSession.workspace, target, blob);
    expect(restored.snapshot).toEqual(source.snapshot);
    expect(await target.readBytes(nativeMediaPath(restored.snapshot.project.id, mediaId))).toEqual(source.mediaBytes);
    restoreSession.release();
    source.session.release();
  });

  it('round-trips the exact snapshot and every Mesh/Point/GS/Proxy byte through STORE entries', async () => {
    const source = await makeSourceProject();
    const { blob, result } = await exportBlob(source);
    const entries = await storedZipEntries(blob);
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      NATIVE_PORTABLE_MANIFEST_ENTRY,
      NATIVE_PORTABLE_SNAPSHOT_ENTRY,
      ...source.snapshot.representations.map((representation) => (
        `native/representations/${representation.id}.bin`
      )),
    ].sort());
    expect(entries).toHaveLength(source.snapshot.representations.length + 2);
    expect(result.metrics.packageByteLength).toBe(blob.size);
    expect(result.metrics.maxApplicationChunkBytes).toBeLessThan(result.metrics.representationByteLength);

    const inspection = await inspectNativePortablePackageV1(blob);
    expect(inspection.snapshot.captions[0]).toMatchObject({
      body: 'portable body',
      anchor: { assetId: NATIVE_TEST_IDS.gsAsset, positionAsset: [1.25, -0.5, 2.75] },
    });
    expect(inspection.snapshot.captions[1]).toMatchObject({
      title: 'Unrelated Caption',
      body: 'must survive portable restore',
      anchor: { assetId: NATIVE_TEST_IDS.meshAsset, positionAsset: [-2, 0.25, 4] },
    });
    expect(inspection.snapshot.presentation.hiddenAssetIds).toEqual([NATIVE_TEST_IDS.meshAsset]);
    expect(inspection.snapshot.savedViews).toEqual(source.snapshot.savedViews);
    expect(nativeCaptionNeedsReviewV1(inspection.snapshot, inspection.snapshot.captions[0]!)).toBe(true);
    const target = new ChunkedMemoryFS();
    const restoreSession = await acquireNew(target);
    const restored = await restoreNativePortablePackageV1(restoreSession.workspace, target, blob);
    expect(restored.snapshot).toEqual(source.snapshot);
    expect(await target.readText(nativeSnapshotPath(restored.snapshot.project.id, restored.snapshot.snapshotId))).toBe(
      await source.fs.readText(nativeSnapshotPath(source.snapshot.project.id, source.snapshot.snapshotId)),
    );
    expect((await openNativeProjectV1(target, source.snapshot.project.id)).snapshot).toEqual(source.snapshot);
    expect(nativeCaptionNeedsReviewV1(restored.snapshot, restored.snapshot.captions[0]!)).toBe(true);
    for (const representation of source.snapshot.representations) {
      expect(await target.readBytes(nativeRepresentationPath(source.snapshot.project.id, representation.id))).toEqual(
        await source.fs.readBytes(nativeRepresentationPath(source.snapshot.project.id, representation.id)),
      );
    }
    restoreSession.release();
    source.session.release();
  });

  it('rejects unknown, extra and missing package structure before touching the destination', async () => {
    const source = await makeSourceProject();
    const { blob } = await exportBlob(source);
    const invalidPackages = [
      await editPackage(blob, (entries) => {
        const manifest = entries.find((entry) => entry.path === NATIVE_PORTABLE_MANIFEST_ENTRY)!;
        const value = JSON.parse(new TextDecoder().decode(manifest.bytes)) as { packageVersion: number };
        value.packageVersion = 2;
        (manifest as { bytes: Uint8Array }).bytes = new TextEncoder().encode(JSON.stringify(value));
      }),
      await editPackage(blob, (entries) => { entries.push({ path: 'native/extra.bin', bytes: new Uint8Array([1]) }); }),
      await editPackage(blob, (entries) => {
        entries.splice(entries.findIndex((entry) => entry.path === NATIVE_PORTABLE_SNAPSHOT_ENTRY), 1);
      }),
    ];
    for (const invalid of invalidPackages) {
      const target = new ChunkedMemoryFS();
      const session = await acquireNew(target);
      await expect(restoreNativePortablePackageV1(session.workspace, target, invalid)).rejects.toThrow();
      await expectInactive(target);
      session.release();
    }
    source.session.release();
  });

  it('rejects valid-ZIP-CRC binary corruption by manifest SHA and leaves no active project', async () => {
    const source = await makeSourceProject();
    const { blob } = await exportBlob(source);
    const corrupt = await editPackage(blob, (entries) => {
      const representation = entries.find((entry) => entry.path.endsWith(`${NATIVE_TEST_IDS.meshRepresentation}.bin`))!;
      representation.bytes[0] = (representation.bytes[0] ?? 0) ^ 0xff;
    });
    await expect(inspectNativePortablePackageV1(corrupt)).resolves.toMatchObject({
      snapshot: { project: { id: NATIVE_TEST_IDS.project } },
    });
    const target = new ChunkedMemoryFS();
    const session = await acquireNew(target);
    await expect(restoreNativePortablePackageV1(session.workspace, target, corrupt)).rejects.toThrow(/size\/SHA-256 mismatch/);
    await expectInactive(target);
    session.release();
    source.session.release();
  });

  it('cancellation after the first verified Representation cleans staging and never publishes active', async () => {
    const source = await makeSourceProject();
    const { blob } = await exportBlob(source);
    const target = new ChunkedMemoryFS();
    const session = await acquireNew(target);
    const abort = new AbortController();
    await expect(restoreNativePortablePackageV1(session.workspace, target, blob, {
      signal: abort.signal,
      onStatus(message) {
        if (message.includes('Verified meshPrimary')) abort.abort(new DOMException('test cancellation', 'AbortError'));
      },
    })).rejects.toThrow(/test cancellation|aborted/i);
    await expectInactive(target);
    session.release();
    source.session.release();
  });

  it('aborts the destination when source preflight fails so a fallback sink settles', async () => {
    const source = await makeSourceProject();
    await source.fs.remove(nativeRepresentationPath(source.snapshot.project.id, NATIVE_TEST_IDS.meshRepresentation));
    const bridge = new TransformStream<Uint8Array, Uint8Array>();
    const sink = bridge.readable.pipeTo(new WritableStream<Uint8Array>({ write() { /* discard */ } }));
    void sink.catch(() => {});
    await expect(exportNativePortablePackageV1(
      source.session.workspace,
      source.snapshot.project.id,
      bridge.writable,
    )).rejects.toThrow(/unavailable/i);
    await expect(sink).rejects.toThrow(/unavailable/i);
    source.session.release();
  });

  it('does not report a completed backup when export is cancelled during binary streaming', async () => {
    const source = await makeSourceProject();
    const abort = new AbortController();
    const destination = new WritableStream<Uint8Array>({ write() { /* discard partial test output */ } });
    await expect(exportNativePortablePackageV1(
      source.session.workspace,
      source.snapshot.project.id,
      destination,
      {
        signal: abort.signal,
        onStatus(message) {
          if (message.startsWith('Streaming ')) abort.abort(new DOMException('test export cancellation', 'AbortError'));
        },
      },
    )).rejects.toThrow(/cancel|abort/i);
    await expect(openNativeProjectV1(source.fs, source.snapshot.project.id)).resolves.toMatchObject({
      snapshot: { snapshotId: source.snapshot.snapshotId },
    });
    source.session.release();
  });

  it('quota failure after consuming a stream prefix settles, cleans staging and never publishes active', async () => {
    const source = await makeSourceProject();
    const { blob } = await exportBlob(source);
    const target = new QuotaAfterPrefixFS();
    const session = await acquireNew(target);
    await expect(restoreNativePortablePackageV1(session.workspace, target, blob)).rejects.toThrow(/quota/i);
    await expectInactive(target);
    session.release();
    source.session.release();
  });

  it('does not delete or overwrite a pre-existing inactive destination root', async () => {
    const source = await makeSourceProject();
    const { blob } = await exportBlob(source);
    const target = new ChunkedMemoryFS();
    const sentinelPath = `${nativeProjectRoot(NATIVE_TEST_IDS.project)}/foreign-sentinel.bin`;
    const sentinel = new Uint8Array([7, 8, 9]);
    await target.writeBytes(sentinelPath, sentinel);
    const session = await acquireNew(target);
    await expect(restoreNativePortablePackageV1(session.workspace, target, blob)).rejects.toThrow(/root is not empty/);
    expect(await target.readBytes(sentinelPath)).toEqual(sentinel);
    expect(await target.exists(nativeActiveMarkerPath(NATIVE_TEST_IDS.project))).toBe(false);
    session.release();
    source.session.release();
  });
});
