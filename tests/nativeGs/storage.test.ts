import { describe, expect, it } from 'vitest';
import { MemoryFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';
import {
  assertNativeProjectDoesNotMixV1,
  createNativeProjectV1,
  deleteNativeProjectV1,
  listNativeProjectsV1,
  nativeActiveMarkerPath,
  nativeProjectRoot,
  nativeRepresentationPath,
  openNativeProjectV1,
  saveNativeProjectV1,
} from '../../src/nativeGs/storage';
import { makeNativeDraft, NATIVE_TEST_IDS } from './nativeTestProject';

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
    const next = await saveNativeProjectV1(session.workspace, {
      ...first,
      presentation: { ...first.presentation, displayMode: 'gs-only' },
    });
    expect(next.generation).toBe(2);
    expect(fs.writes.filter((path) => path.endsWith('.bin'))).toHaveLength(binaryWriteCount);
    expect((await openNativeProjectV1(fs, first.project.id)).snapshot.presentation.displayMode).toBe('gs-only');
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
