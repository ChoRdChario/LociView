import type { ProjectWorkspaceFS, WorkspaceReadableFile } from '../platform/fs';
import { fail } from './format';
import { registerWriteFence, technicalId } from './persistence';
import type { MetadataStorageFactory, MetadataStoragePort } from './repository';

/** Local storage identity only; Project identity and its logical-root lease do not change. */
export type WorkspaceGenerationId = string | null;
export interface GenerationStorageConnection {
  readonly factory: MetadataStorageFactory;
  dispose(): Promise<void>;
}
export type GenerationStorageOpener = (generationId: WorkspaceGenerationId,
  allowCreate: boolean) => Promise<GenerationStorageConnection>;

const reserved = ['v2/generations', 'v2/local-restore'];
const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`);
function checkedId(id: WorkspaceGenerationId): WorkspaceGenerationId { return id === null ? null : technicalId(id); }

/** Both old names and old Repo keys remain byte-for-byte unchanged. */
export function generationDatabaseName(original: string, id: WorkspaceGenerationId): string {
  const checked = checkedId(id);
  if (!original) return fail('generation-database-name');
  return checked === null ? original : `${original}-generation-${checked}`;
}

function canonicalPath(path: string, prefix: boolean): string {
  const value = prefix && path.endsWith('/') ? path.slice(0, -1) : path;
  if ((!value && !prefix) || value.includes('\\') || value.includes('\0') || value.startsWith('/') ||
    (value && value.split('/').some(p => !p || p === '.' || p === '..'))) return fail('generation-path');
  return value;
}

/** No read starts before the fence; an already opened lazy handle is fenced again. */
function fencedStream(open: () => ReadableStream<Uint8Array>, check: () => Promise<void>,
  cancelUnused?: (reason: unknown) => Promise<void>): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, closed = false;
  const release = () => { reader?.releaseLock(); reader = undefined; };
  const cancel = async (reason: unknown) => {
    if (closed) return;
    closed = true;
    try { if (reader) await reader.cancel(reason); else await cancelUnused?.(reason); }
    finally { release(); }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        await check(); if (closed) return;
        reader ??= open().getReader();
        const part = await reader.read();
        const bytes = part.done ? undefined : part.value.slice();
        await check(); if (closed) return;
        if (part.done) { closed = true; release(); controller.close(); }
        else controller.enqueue(bytes!);
      } catch (error) {
        if (closed) return;
        try { await cancel(error); } catch { /* Preserve the refusal, not a cleanup error. */ }
        controller.error(error);
      }
    },
    cancel,
  }, { highWaterMark: 0 });
}

/**
 * Internal preparation boundary, not a selector or permission to restore.
 * The root controller supplies an exact selection/staging-job fence reading the
 * unwrapped root. The opener MUST isolate each generation in its own database.
 */
export async function openWorkspaceGeneration(root: ProjectWorkspaceFS,
  input: Readonly<{ generationId: WorkspaceGenerationId; allowCreate: boolean; assertSelected: () => Promise<void> }>,
  openStorage: GenerationStorageOpener) {
  const generationId = checkedId(input.generationId), allowCreate = input.allowCreate,
    assertSelected = input.assertSelected;
  const logicalRoot = root.projectRoot === null ? '' : canonicalPath(root.projectRoot, false);
  const prefix = logicalRoot ? `${logicalRoot}/` : '';
  const projectRoot = generationId === null ? root.projectRoot : `${prefix}v2/generations/${generationId}`;
  const namespace = projectRoot ?? '';
  let disposed = false;
  const check = async () => {
    if (disposed) fail('generation-closed');
    await assertSelected();
    if (disposed) fail('generation-closed');
  };
  const ownPath = (path: string, listing = false) => {
    const canonical = canonicalPath(path, listing);
    if (namespace && !within(canonical, namespace)) fail('generation-path-outside');
    if (generationId === null && reserved.some(p => within(canonical, `${prefix}${p}`))) fail('generation-path-reserved');
    return path;
  };
  const isReserved = (path: string) => generationId === null && reserved.some(p => within(path, `${prefix}${p}`));
  const read = async <T>(action: () => Promise<T>): Promise<T> => {
    await check(); const result = await action(); await check(); return result;
  };
  const write = async (action: () => Promise<void>) => {
    root.mutationAuthority.assertWorkspaceWriteAuthorized();
    const finish = root.mutationAuthority.beginWorkspaceWrite();
    try { await read(action); root.mutationAuthority.assertWorkspaceWriteAuthorized(); }
    finally { finish(); }
  };
  const fs: ProjectWorkspaceFS = Object.freeze({
    projectRoot, mutationAuthority: root.mutationAuthority,
    readText: (path: string) => { ownPath(path); return read(() => root.readText(path)); },
    readBytes: (path: string) => { ownPath(path); return read(async () => (await root.readBytes(path))?.slice() ?? null); },
    readBytesFrom: (path: string, offset: number) => {
      ownPath(path);
      if (!Number.isSafeInteger(offset) || offset < 0) return Promise.reject(Error('Invalid byte offset'));
      return read(async () => { const result = await root.readBytesFrom(path, offset);
        return result ? { size: result.size, data: result.data.slice() } : null; });
    },
    readStream: (path: string) => {
      ownPath(path);
      return read(async (): Promise<WorkspaceReadableFile | null> => {
        const file = await root.readStream(path); if (!file) return null;
        return Object.freeze({ size: file.size,
          stream: () => fencedStream(() => file.stream(), check),
          ...(file.blob ? { blob: () => read(() => file.blob!()) } : {}),
        });
      });
    },
    exists: (path: string) => { ownPath(path); return read(() => root.exists(path)); },
    list: (path: string) => {
      ownPath(path, true);
      return read(async () => {
        const paths = await root.list(path);
        for (const item of paths) {
          canonicalPath(item, false);
          if (!item.startsWith(path) || namespace && !within(item, namespace)) fail('generation-list-outside');
        }
        return paths.filter(item => !isReserved(item));
      });
    },
    writeText: (path: string, text: string) => { ownPath(path); return write(() => root.writeText(path, text)); },
    appendText: (path: string, text: string) => { ownPath(path); return write(() => root.appendText(path, text)); },
    writeBytes: (path: string, bytes: Uint8Array) => {
      ownPath(path); const owned = bytes.slice(); return write(() => root.writeBytes(path, owned));
    },
    appendBytes: (path: string, bytes: Uint8Array) => {
      ownPath(path); const owned = bytes.slice(); return write(() => root.appendBytes(path, owned));
    },
    writeStream: async (path: string, stream: ReadableStream<Uint8Array>) => {
      const guarded = fencedStream(() => stream, check, reason => stream.cancel(reason));
      try { ownPath(path); await write(() => root.writeStream(path, guarded)); }
      finally { if (!guarded.locked) await guarded.cancel().catch(() => undefined); }
    },
    remove: (path: string) => { ownPath(path); return write(() => root.remove(path)); },
  });
  registerWriteFence(fs, check);
  await check();
  const connection = await openStorage(generationId, allowCreate);
  try { await check(); } catch (error) { disposed = true; await connection.dispose().catch(() => undefined); throw error; }
  const keyCopy = (key: string[]) => {
    if (!Array.isArray(key) || key.some(k => typeof k !== 'string')) fail('generation-storage-key');
    return [...key];
  };
  const factory: MetadataStorageFactory = () => {
    if (disposed) fail('generation-closed');
    const base = connection.factory();
    return {
      load: key => { const owned = keyCopy(key); return read(async () => (await base.load(owned))?.slice()); },
      save: (key, bytes) => { const owned = keyCopy(key), data = bytes.slice(); return write(() => base.save(owned, data)); },
      remove: key => { const owned = keyCopy(key); return write(() => base.remove(owned)); },
      loadRange: key => { const owned = keyCopy(key); return read(async () => {
        const rows = await base.loadRange(owned);
        return rows.map(row => {
          const key = keyCopy(row.key);
          if (!owned.every((part, i) => key[i] === part)) fail('generation-storage-range');
          return { key, data: row.data?.slice() };
        });
      }); },
      removeRange: key => { const owned = keyCopy(key); return write(() => base.removeRange(owned)); },
    } satisfies MetadataStoragePort;
  };
  return Object.freeze({ generationId, fs, factory, check,
    async dispose() { if (disposed) return; disposed = true; await connection.dispose(); },
  });
}
