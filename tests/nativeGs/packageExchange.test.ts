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
import { MemoryFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator, type ProjectMutationSession } from '../../src/platform/projectLock';
import {
  detectNativePackageContainerKindV1,
  exportNativeExchangePackageV1,
  inspectNativeExchangePackageV1,
  mergeNativeCollaborationPackageV1,
  nativeExchangeDefaultOpenModeV1,
  restoreNativeExchangePackageV1,
} from '../../src/nativeGs/packageExchange';
import {
  exportNativePortablePackageV1,
  inspectNativePortablePackageV1,
  restoreNativePortablePackageV1,
} from '../../src/nativeGs/portablePackage';
import {
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  type NativeCaptionV1,
  type NativeProjectDraftV1,
  type NativeProjectSnapshotV1,
} from '../../src/nativeGs/schema';
import {
  addNativeCaptionImageV1,
  createNativeProjectV1,
  listNativeProjectsV1,
  nativeActiveMarkerPath,
  nativeMediaPath,
  nativeProjectRoot,
  openNativeProjectV1,
  removeNativeCaptionMediaV1,
  saveNativeProjectV1,
  type NativeBinarySource,
} from '../../src/nativeGs/storage';
import { makeNativeDraft, NATIVE_TEST_IDS, testNativeId } from './nativeTestProject';

interface TestProject {
  readonly fs: MemoryFS;
  readonly session: ProjectMutationSession;
  snapshot: NativeProjectSnapshotV1;
}

interface RawZipEntry {
  readonly path: string;
  bytes: Uint8Array;
}

const CAPTION_A = testNativeId('cap', 31);
const CAPTION_B = testNativeId('cap', 32);
const CAPTION_NEW = testNativeId('cap', 33);
const VALID_PNG_BYTES = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));

function caption(id: string, title: string, body: string): NativeCaptionV1 {
  return {
    id,
    title,
    body,
    color: '#4488ff',
    anchor: {
      kind: 'asset',
      assetId: NATIVE_TEST_IDS.meshAsset,
      assetFrameId: NATIVE_TEST_IDS.meshFrame,
      positionAsset: [0, 0, 0],
      authoredAssetRevisionId: NATIVE_TEST_IDS.meshRevision,
      authoredAnchorCompatibilityId: NATIVE_TEST_IDS.meshClass,
      hitEvidence: { method: 'manual' },
    },
  };
}

function binarySource(bytes: Uint8Array, mediaType: string): NativeBinarySource {
  const stable = new Uint8Array(bytes);
  return {
    size: stable.byteLength,
    mediaType,
    stream: () => new Blob([stable], { type: mediaType }).stream(),
  };
}

async function acquireNew(fs: MemoryFS, projectId: string): Promise<ProjectMutationSession> {
  const session = await ProjectMutationCoordinator.local().tryAcquire(fs, nativeProjectRoot(projectId), projectId);
  session.activateNewProject();
  return session;
}

async function makeProject(projectId = NATIVE_TEST_IDS.project): Promise<TestProject> {
  const fs = new MemoryFS();
  const base = makeNativeDraft(2);
  const draft: NativeProjectDraftV1 = {
    ...base.draft,
    project: { ...base.draft.project, id: projectId },
    captions: [
      caption(CAPTION_A, 'Caption A', 'baseline A'),
      caption(CAPTION_B, 'Caption B', 'baseline B'),
    ],
  };
  const session = await acquireNew(fs, projectId);
  const snapshot = await createNativeProjectV1(session.workspace, draft, base.sources);
  return { fs, session, snapshot };
}

async function exportBlob(project: TestProject, purpose: 'collaboration' | 'review' | 'cleanCopy'): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  await exportNativeExchangePackageV1(
    project.session.workspace,
    project.snapshot.project.id,
    purpose,
    new WritableStream<Uint8Array>({ write(chunk) { chunks.push(new Uint8Array(chunk)); } }),
    purpose === 'review' ? { reviewDisplaySetId: NATIVE_DEFAULT_DISPLAY_SET_ID } : {},
  );
  if (purpose === 'collaboration') {
    project.snapshot = (await openNativeProjectV1(project.fs, project.snapshot.project.id)).snapshot;
  }
  return new Blob(chunks.map((chunk) => new Uint8Array(chunk)), { type: 'application/zip' });
}

async function restoreBlob(blob: Blob): Promise<TestProject & { readonly purpose: string }> {
  const inspection = await inspectNativeExchangePackageV1(blob);
  const fs = new MemoryFS();
  const session = await acquireNew(fs, inspection.snapshot.project.id);
  const restored = await restoreNativeExchangePackageV1(session.workspace, fs, blob);
  return { fs, session, snapshot: restored.snapshot, purpose: restored.purpose };
}

async function exportBackupBlob(project: TestProject): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  await exportNativePortablePackageV1(
    project.session.workspace,
    project.snapshot.project.id,
    new WritableStream<Uint8Array>({ write(chunk) { chunks.push(new Uint8Array(chunk)); } }),
  );
  return new Blob(chunks.map((chunk) => new Uint8Array(chunk)), { type: 'application/zip' });
}

async function restoreBackupBlob(blob: Blob): Promise<TestProject> {
  const inspection = await inspectNativePortablePackageV1(blob);
  const fs = new MemoryFS();
  const session = await acquireNew(fs, inspection.snapshot.project.id);
  const restored = await restoreNativePortablePackageV1(session.workspace, fs, blob);
  return { fs, session, snapshot: restored.snapshot };
}

function editCaption(
  snapshot: NativeProjectSnapshotV1,
  captionId: string,
  patch: Partial<Pick<NativeCaptionV1, 'title' | 'body' | 'color' | 'anchor' | 'attachmentMediaIds'>>,
): NativeProjectSnapshotV1 {
  return {
    ...snapshot,
    captions: snapshot.captions.map((entry) => entry.id === captionId ? { ...entry, ...patch } : entry),
  };
}

async function branchPair(): Promise<{ readonly local: TestProject; readonly incoming: TestProject }> {
  const local = await makeProject();
  const baselinePackage = await exportBlob(local, 'collaboration');
  const incoming = await restoreBlob(baselinePackage);
  expect(incoming.purpose).toBe('collaboration');
  return { local, incoming };
}

async function addIncomingCaptionWithImage(project: TestProject): Promise<string> {
  const bytes = VALID_PNG_BYTES;
  project.snapshot = await saveNativeProjectV1(project.session.workspace, {
    ...project.snapshot,
    captions: [
      ...project.snapshot.captions,
      caption(CAPTION_NEW, 'Incoming image Caption', 'new on B'),
    ],
  });
  project.snapshot = await addNativeCaptionImageV1(
    project.session.workspace,
    project.snapshot,
    CAPTION_NEW,
    'Incoming Caption image.png',
    binarySource(bytes, 'image/png'),
  );
  const mediaId = project.snapshot.captions.find((entry) => entry.id === CAPTION_NEW)?.attachmentMediaIds?.[0];
  if (mediaId === undefined) throw new Error('expected attached image ID');
  return mediaId;
}

async function storedZipEntries(blob: Blob): Promise<RawZipEntry[]> {
  const reader = new ZipReader(new BlobReader(blob), { strictness: 'strict' });
  try {
    const entries = await reader.getEntries({ strictness: 'strict', checkAmbiguity: true });
    const result: RawZipEntry[] = [];
    for (const entry of entries) {
      if (entry.directory) continue;
      result.push({
        path: entry.filename,
        bytes: await (entry as FileEntry).getData(new Uint8ArrayWriter(), {
          checkSignature: true,
          checkAmbiguity: true,
          checkOverlappingEntry: true,
          strictness: 'strict',
        }),
      });
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
  return writer.close();
}

describe('native package exchange v1', () => {
  it('requires one exact DisplaySet only for review and writes no package bytes on invalid intent', async () => {
    const source = await makeProject();
    const attempt = async (
      purpose: 'collaboration' | 'review' | 'cleanCopy',
      options: { readonly reviewDisplaySetId?: string } = {},
    ): Promise<number> => {
      let writtenBytes = 0;
      const destination = new WritableStream<Uint8Array>({
        write(chunk) { writtenBytes += chunk.byteLength; },
      });
      await expect(exportNativeExchangePackageV1(
        source.session.workspace,
        source.snapshot.project.id,
        purpose,
        destination,
        options,
      )).rejects.toThrow();
      return writtenBytes;
    };
    await expect(attempt('review')).resolves.toBe(0);
    await expect(attempt('collaboration', { reviewDisplaySetId: NATIVE_DEFAULT_DISPLAY_SET_ID })).resolves.toBe(0);
    await expect(attempt('review', { reviewDisplaySetId: testNativeId('set', 99) })).resolves.toBe(0);
    source.session.release();
  });

  it('does not publish the first collaboration baseline when already cancelled', async () => {
    const source = await makeProject();
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    let writtenBytes = 0;
    await expect(exportNativeExchangePackageV1(
      source.session.workspace,
      source.snapshot.project.id,
      'collaboration',
      new WritableStream<Uint8Array>({ write(chunk) { writtenBytes += chunk.byteLength; } }),
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(writtenBytes).toBe(0);
    expect((await openNativeProjectV1(source.fs, source.snapshot.project.id)).snapshot.collaborationBaseline)
      .toBeUndefined();
    source.session.release();
  });

  it('routes backup and all exchange purposes by manifest content', async () => {
    const source = await makeProject();
    const backup = await exportBackupBlob(source);
    expect(await detectNativePackageContainerKindV1(backup)).toBe('backup');
    for (const purpose of ['collaboration', 'review', 'cleanCopy'] as const) {
      expect(await detectNativePackageContainerKindV1(await exportBlob(source, purpose))).toBe('exchange');
    }
    expect(nativeExchangeDefaultOpenModeV1('review')).toBe('view');
    expect(nativeExchangeDefaultOpenModeV1('collaboration')).toBe('edit');
    expect(nativeExchangeDefaultOpenModeV1('cleanCopy')).toBe('edit');
    source.session.release();
  });

  it('omits only a detached nonbaseline image from collaboration while other package purposes and the sender retain it', async () => {
    const local = await makeProject();
    local.snapshot = await addNativeCaptionImageV1(
      local.session.workspace,
      local.snapshot,
      CAPTION_A,
      'Baseline reference image.png',
      binarySource(VALID_PNG_BYTES, 'image/png'),
    );
    const baselineMediaId = local.snapshot.captions.find((entry) => entry.id === CAPTION_A)?.attachmentMediaIds?.[0];
    if (baselineMediaId === undefined) throw new Error('expected baseline image ID');
    const baselinePackage = await exportBlob(local, 'collaboration');
    const incoming = await restoreBlob(baselinePackage);

    local.snapshot = await removeNativeCaptionMediaV1(
      local.session.workspace, local.snapshot, CAPTION_A, baselineMediaId,
    );
    local.snapshot = await addNativeCaptionImageV1(
      local.session.workspace,
      local.snapshot,
      CAPTION_A,
      'Detached nonbaseline image.png',
      binarySource(VALID_PNG_BYTES, 'image/png'),
    );
    const nonbaselineMediaId = local.snapshot.captions.find((entry) => entry.id === CAPTION_A)?.attachmentMediaIds?.[0];
    if (nonbaselineMediaId === undefined) throw new Error('expected nonbaseline image ID');
    local.snapshot = await removeNativeCaptionMediaV1(
      local.session.workspace, local.snapshot, CAPTION_A, nonbaselineMediaId,
    );
    const senderBefore = local.snapshot;
    const senderPathsBefore = await local.fs.list(`${nativeProjectRoot(local.snapshot.project.id)}/`);
    const baselineBytesBefore = await local.fs.readBytes(nativeMediaPath(local.snapshot.project.id, baselineMediaId));
    const nonbaselineBytesBefore = await local.fs.readBytes(nativeMediaPath(local.snapshot.project.id, nonbaselineMediaId));
    expect(baselineBytesBefore).toEqual(VALID_PNG_BYTES);
    expect(nonbaselineBytesBefore).toEqual(VALID_PNG_BYTES);
    expect(senderBefore.collaborationBaseline?.mediaResources.map((media) => media.id)).toEqual([baselineMediaId]);

    const collaborationPackage = await exportBlob(local, 'collaboration');
    const collaborationInspection = await inspectNativeExchangePackageV1(collaborationPackage);
    expect(collaborationInspection.snapshot.mediaResources?.map((media) => media.id)).toEqual([baselineMediaId]);
    expect(collaborationInspection.manifest.media.map((media) => media.id)).toEqual([baselineMediaId]);
    expect(collaborationInspection.snapshot.captions.find((caption) => caption.id === CAPTION_A)?.attachmentMediaIds).toEqual([]);
    const collaborationEntries = await storedZipEntries(collaborationPackage);
    expect(collaborationEntries.some((entry) => entry.path === `native/media/${baselineMediaId}.bin`)).toBe(true);
    expect(collaborationEntries.some((entry) => entry.path === `native/media/${nonbaselineMediaId}.bin`)).toBe(false);
    expect(local.snapshot).toEqual(senderBefore);
    expect(await local.fs.list(`${nativeProjectRoot(local.snapshot.project.id)}/`)).toEqual(senderPathsBefore);
    expect(await local.fs.readBytes(nativeMediaPath(local.snapshot.project.id, baselineMediaId))).toEqual(baselineBytesBefore);
    expect(await local.fs.readBytes(nativeMediaPath(local.snapshot.project.id, nonbaselineMediaId))).toEqual(nonbaselineBytesBefore);

    const backup = await exportBackupBlob(local);
    const restoredBackup = await restoreBackupBlob(backup);
    expect(restoredBackup.snapshot.mediaResources?.map((media) => media.id)).toEqual([baselineMediaId, nonbaselineMediaId]);
    expect(restoredBackup.snapshot.collaborationBaseline).toEqual(senderBefore.collaborationBaseline);
    expect(await restoredBackup.fs.readBytes(nativeMediaPath(restoredBackup.snapshot.project.id, baselineMediaId))).toEqual(baselineBytesBefore);
    expect(await restoredBackup.fs.readBytes(nativeMediaPath(restoredBackup.snapshot.project.id, nonbaselineMediaId))).toEqual(nonbaselineBytesBefore);

    const cleanCopy = await exportBlob(local, 'cleanCopy');
    const restoredClean = await restoreBlob(cleanCopy);
    expect(restoredClean.snapshot.mediaResources?.map((media) => media.id)).toEqual([baselineMediaId, nonbaselineMediaId]);
    expect(restoredClean.snapshot.collaborationBaseline).toBeUndefined();
    expect(await restoredClean.fs.readBytes(nativeMediaPath(restoredClean.snapshot.project.id, baselineMediaId))).toEqual(baselineBytesBefore);
    expect(await restoredClean.fs.readBytes(nativeMediaPath(restoredClean.snapshot.project.id, nonbaselineMediaId))).toEqual(nonbaselineBytesBefore);

    const firstImport = await mergeNativeCollaborationPackageV1(
      incoming.session.workspace, incoming.snapshot.project.id, collaborationPackage,
    );
    expect(firstImport).toMatchObject({ kind: 'merged' });
    if (firstImport.kind !== 'merged') throw new Error('expected detached baseline media merge');
    incoming.snapshot = firstImport.snapshot;
    expect(incoming.snapshot.captions.find((caption) => caption.id === CAPTION_A)?.attachmentMediaIds).toEqual([]);
    expect(incoming.snapshot.mediaResources?.map((media) => media.id)).toEqual([baselineMediaId]);
    expect(await incoming.fs.readBytes(nativeMediaPath(incoming.snapshot.project.id, baselineMediaId))).toEqual(baselineBytesBefore);
    expect(await incoming.fs.readBytes(nativeMediaPath(incoming.snapshot.project.id, nonbaselineMediaId))).toBeNull();
    const receiverBeforeDuplicate = incoming.snapshot;
    const secondImport = await mergeNativeCollaborationPackageV1(
      incoming.session.workspace, incoming.snapshot.project.id, collaborationPackage,
    );
    expect(secondImport).toMatchObject({ kind: 'noop' });
    expect((await openNativeProjectV1(incoming.fs, incoming.snapshot.project.id)).snapshot).toEqual(receiverBeforeDuplicate);
    local.session.release();
    incoming.session.release();
    restoredBackup.session.release();
    restoredClean.session.release();
  });

  it('merges independent Caption edits and new image bytes, then treats duplicate import as a no-op', async () => {
    const { local, incoming } = await branchPair();
    local.snapshot = await saveNativeProjectV1(
      local.session.workspace,
      editCaption(local.snapshot, CAPTION_A, { body: 'edited on A' }),
    );
    incoming.snapshot = await saveNativeProjectV1(
      incoming.session.workspace,
      editCaption(incoming.snapshot, CAPTION_B, { title: 'Caption B edited on B' }),
    );
    const incomingMediaId = await addIncomingCaptionWithImage(incoming);
    const packageBlob = await exportBlob(incoming, 'collaboration');

    const result = await mergeNativeCollaborationPackageV1(
      local.session.workspace,
      local.snapshot.project.id,
      packageBlob,
      {
        onStatus(message) {
          if (message === 'Collaboration changes merged and active.') {
            throw new Error('simulated post-publication observer failure');
          }
        },
      },
    );
    expect(result.kind).toBe('merged');
    if (result.kind !== 'merged') throw new Error('expected representative collaboration merge');
    local.snapshot = result.snapshot;
    expect(local.snapshot.captions.find((entry) => entry.id === CAPTION_A)?.body).toBe('edited on A');
    expect(local.snapshot.captions.find((entry) => entry.id === CAPTION_B)?.title).toBe('Caption B edited on B');
    expect(local.snapshot.captions.find((entry) => entry.id === CAPTION_NEW)?.attachmentMediaIds).toEqual([incomingMediaId]);
    expect(await local.fs.readBytes(nativeMediaPath(local.snapshot.project.id, incomingMediaId))).toEqual(
      await incoming.fs.readBytes(nativeMediaPath(incoming.snapshot.project.id, incomingMediaId)),
    );

    const beforeDuplicate = local.snapshot;
    const duplicate = await mergeNativeCollaborationPackageV1(
      local.session.workspace,
      local.snapshot.project.id,
      packageBlob,
    );
    expect(duplicate).toMatchObject({ kind: 'noop' });
    expect((await openNativeProjectV1(local.fs, local.snapshot.project.id)).snapshot).toEqual(beforeDuplicate);
    local.session.release();
    incoming.session.release();
  });

  it('reports edit/edit and delete/edit conflicts without publishing any local change', async () => {
    const editPair = await branchPair();
    editPair.local.snapshot = await saveNativeProjectV1(
      editPair.local.session.workspace,
      editCaption(editPair.local.snapshot, CAPTION_A, { body: 'local body' }),
    );
    editPair.incoming.snapshot = await saveNativeProjectV1(
      editPair.incoming.session.workspace,
      editCaption(editPair.incoming.snapshot, CAPTION_A, { body: 'incoming body' }),
    );
    const editPackage = await exportBlob(editPair.incoming, 'collaboration');
    const beforeEditConflict = editPair.local.snapshot;
    const editConflict = await mergeNativeCollaborationPackageV1(
      editPair.local.session.workspace,
      editPair.local.snapshot.project.id,
      editPackage,
    );
    expect(editConflict.kind).toBe('conflict');
    if (editConflict.kind !== 'conflict') throw new Error('expected edit conflict');
    expect(editConflict.conflicts).toContainEqual(expect.objectContaining({
      code: 'caption-field-conflict', captionId: CAPTION_A, field: 'body',
    }));
    expect((await openNativeProjectV1(editPair.local.fs, beforeEditConflict.project.id)).snapshot).toEqual(beforeEditConflict);
    editPair.local.session.release();
    editPair.incoming.session.release();

    const deletePair = await branchPair();
    deletePair.local.snapshot = await saveNativeProjectV1(deletePair.local.session.workspace, {
      ...deletePair.local.snapshot,
      captions: deletePair.local.snapshot.captions.filter((entry) => entry.id !== CAPTION_B),
    });
    deletePair.incoming.snapshot = await saveNativeProjectV1(
      deletePair.incoming.session.workspace,
      editCaption(deletePair.incoming.snapshot, CAPTION_B, { title: 'incoming edit after local delete' }),
    );
    const deletePackage = await exportBlob(deletePair.incoming, 'collaboration');
    const beforeDeleteConflict = deletePair.local.snapshot;
    const deleteConflict = await mergeNativeCollaborationPackageV1(
      deletePair.local.session.workspace,
      deletePair.local.snapshot.project.id,
      deletePackage,
    );
    expect(deleteConflict.kind).toBe('conflict');
    if (deleteConflict.kind !== 'conflict') throw new Error('expected delete/edit conflict');
    expect(deleteConflict.conflicts).toContainEqual(expect.objectContaining({
      code: 'caption-delete-edit-conflict', captionId: CAPTION_B,
    }));
    expect((await openNativeProjectV1(deletePair.local.fs, beforeDeleteConflict.project.id)).snapshot).toEqual(beforeDeleteConflict);
    deletePair.local.session.release();
    deletePair.incoming.session.release();
  });

  it('rejects another lineage and keeps review/share and clean-copy identities non-mergeable', async () => {
    const source = await makeProject();
    const collaborationPackage = await exportBlob(source, 'collaboration');
    const other = await makeProject(testNativeId('prj', 91));
    const otherPackage = await exportBlob(other, 'collaboration');
    const mismatch = await mergeNativeCollaborationPackageV1(
      source.session.workspace,
      source.snapshot.project.id,
      otherPackage,
    );
    expect(mismatch).toMatchObject({ kind: 'conflict', conflicts: [{ code: 'lineage-mismatch' }] });

    const reviewPackage = await exportBlob(source, 'review');
    const review = await restoreBlob(reviewPackage);
    expect(review.purpose).toBe('review');
    expect(review.snapshot.project.id).not.toBe(source.snapshot.project.id);
    expect(review.snapshot.collaborationBaseline).toBeUndefined();
    await expect(mergeNativeCollaborationPackageV1(
      source.session.workspace,
      source.snapshot.project.id,
      reviewPackage,
    )).rejects.toThrow(/not for collaboration/);

    const cleanPackage = await exportBlob(source, 'cleanCopy');
    const clean = await restoreBlob(cleanPackage);
    expect(clean.purpose).toBe('cleanCopy');
    expect(clean.snapshot.project.id).not.toBe(source.snapshot.project.id);
    expect(clean.snapshot.collaborationBaseline).toBeUndefined();
    clean.snapshot = await saveNativeProjectV1(clean.session.workspace, {
      ...clean.snapshot,
      project: { ...clean.snapshot.project, title: 'Editable clean copy' },
    });
    expect((await openNativeProjectV1(clean.fs, clean.snapshot.project.id)).snapshot.project.title).toBe('Editable clean copy');
    await expect(mergeNativeCollaborationPackageV1(
      source.session.workspace,
      source.snapshot.project.id,
      cleanPackage,
    )).rejects.toThrow(/not for collaboration/);

    const cleanCollaboration = await exportBlob(clean, 'collaboration');
    const isolatedLineage = await mergeNativeCollaborationPackageV1(
      source.session.workspace,
      source.snapshot.project.id,
      cleanCollaboration,
    );
    expect(isolatedLineage).toMatchObject({ kind: 'conflict', conflicts: [{ code: 'lineage-mismatch' }] });

    expect((await inspectNativeExchangePackageV1(collaborationPackage)).manifest.purpose).toBe('collaboration');
    source.session.release();
    other.session.release();
    review.session.release();
    clean.session.release();
  });

  it('preserves the collaboration baseline through ordinary backup/restore', async () => {
    const { local, incoming } = await branchPair();
    incoming.snapshot = await saveNativeProjectV1(
      incoming.session.workspace,
      editCaption(incoming.snapshot, CAPTION_B, { body: 'after backup branch edit' }),
    );
    const incomingPackage = await exportBlob(incoming, 'collaboration');
    const backup = await exportBackupBlob(local);
    const restored = await restoreBackupBlob(backup);
    expect(restored.snapshot.collaborationBaseline).toEqual(local.snapshot.collaborationBaseline);

    const result = await mergeNativeCollaborationPackageV1(
      restored.session.workspace,
      restored.snapshot.project.id,
      incomingPackage,
    );
    expect(result.kind).toBe('merged');
    if (result.kind !== 'merged') throw new Error('expected post-backup collaboration merge');
    expect(result.snapshot.captions.find((entry) => entry.id === CAPTION_B)?.body).toBe('after backup branch edit');
    local.session.release();
    incoming.session.release();
    restored.session.release();
  });

  it('rejects valid-ZIP-CRC binary corruption and leaves the destination inactive', async () => {
    const source = await makeProject();
    const packageBlob = await exportBlob(source, 'cleanCopy');
    const entries = await storedZipEntries(packageBlob);
    const binary = entries.find((entry) => entry.path.startsWith('native/representations/'))!;
    binary.bytes[0] = (binary.bytes[0] ?? 0) ^ 0xff;
    const corrupt = await writeStoredZip(entries);
    const inspection = await inspectNativeExchangePackageV1(corrupt);
    const target = new MemoryFS();
    const session = await acquireNew(target, inspection.snapshot.project.id);
    await expect(restoreNativeExchangePackageV1(session.workspace, target, corrupt)).rejects.toThrow(/size\/SHA-256 mismatch/);
    expect(await target.exists(nativeActiveMarkerPath(inspection.snapshot.project.id))).toBe(false);
    expect(await listNativeProjectsV1(target)).toEqual([]);
    session.release();
    source.session.release();
  });

  it('verifies a semantically duplicate collaboration package before returning no-op', async () => {
    const { local, incoming } = await branchPair();
    const packageBlob = await exportBlob(incoming, 'collaboration');
    const entries = await storedZipEntries(packageBlob);
    const binary = entries.find((entry) => entry.path.startsWith('native/representations/'))!;
    binary.bytes[0] = (binary.bytes[0] ?? 0) ^ 0xff;
    const corrupt = await writeStoredZip(entries);
    const before = local.snapshot;
    await expect(mergeNativeCollaborationPackageV1(
      local.session.workspace,
      local.snapshot.project.id,
      corrupt,
    )).rejects.toThrow(/size\/SHA-256 mismatch/);
    expect((await openNativeProjectV1(local.fs, local.snapshot.project.id)).snapshot).toEqual(before);
    local.session.release();
    incoming.session.release();
  });

  it('rejects same-size corrupted local media that overlaps the incoming package', async () => {
    const { local, incoming } = await branchPair();
    const mediaId = await addIncomingCaptionWithImage(incoming);
    const packageBlob = await exportBlob(incoming, 'collaboration');
    const first = await mergeNativeCollaborationPackageV1(
      local.session.workspace,
      local.snapshot.project.id,
      packageBlob,
    );
    expect(first.kind).toBe('merged');
    if (first.kind !== 'merged') throw new Error('expected initial media merge');
    local.snapshot = first.snapshot;
    const path = nativeMediaPath(local.snapshot.project.id, mediaId);
    const original = await local.fs.readBytes(path);
    if (original === null) throw new Error('expected merged local media');
    const corrupt = new Uint8Array(original);
    corrupt[corrupt.length - 1] = (corrupt.at(-1) ?? 0) ^ 0xff;
    await local.fs.writeBytes(path, corrupt);
    const before = (await openNativeProjectV1(local.fs, local.snapshot.project.id)).snapshot;

    const result = await mergeNativeCollaborationPackageV1(
      local.session.workspace,
      local.snapshot.project.id,
      packageBlob,
    );
    expect(result).toEqual(expect.objectContaining({
      kind: 'conflict',
      conflicts: expect.arrayContaining([expect.objectContaining({ code: 'media-id-conflict', mediaId })]),
    }));
    expect((await openNativeProjectV1(local.fs, local.snapshot.project.id)).snapshot).toEqual(before);
    expect(await local.fs.readBytes(path)).toEqual(corrupt);
    local.session.release();
    incoming.session.release();
  });
});
