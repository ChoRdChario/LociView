import type { ProjectWorkspaceFS, WorkspaceReadableFile, WorkspaceTextCreation } from '../platform/fs';
import { fail } from './format';
import { metadataPath, registerReadOperation, registerStagingReadOperation, registerTextCommit, registerWriteFence, technicalId, type MetadataReadPorts, type TextCommitPhase, type TextCommitPorts } from './persistence';
import type { MetadataStorageFactory, MetadataStoragePort } from './repository';

/** Local storage identity only; Project identity and its logical-root lease do not change. */
export type WorkspaceGenerationId = string | null;
export interface GenerationStorageConnection {
  readonly factory: MetadataStorageFactory;
  dispose(): Promise<void>;
}
export type GenerationStorageOpener = (generationId: WorkspaceGenerationId,
  allowCreate: boolean) => Promise<GenerationStorageConnection>;
/** Internal exact-Job binding; does not enable ordinary staging bulk reads. */
export interface StagingReadOwner { assertOwner(fs: ProjectWorkspaceFS, factory: MetadataStorageFactory): void }

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
  input: Readonly<{ generationId: WorkspaceGenerationId; allowCreate: boolean; assertSelected: () => Promise<void>;
    assertWritable?: () => Promise<void>; assertSelectedWritable?: () => Promise<void>;
    auditReadOperations?: boolean; stagingReadOwner?: StagingReadOwner; ordinaryTextCommit?: () => boolean }>,
  openStorage: GenerationStorageOpener) {
  const generationId = checkedId(input.generationId), allowCreate = input.allowCreate,
    assertSelected = input.assertSelected, assertWritable = input.assertWritable, assertSelectedWritable = input.assertSelectedWritable,
    auditReadOperations = input.auditReadOperations === true,
    stagingReadOwner = input.stagingReadOwner?.assertOwner.bind(input.stagingReadOwner);
  if (auditReadOperations && stagingReadOwner || stagingReadOwner && generationId === null) fail('generation-read-binding');
  if (assertSelectedWritable && (!auditReadOperations || stagingReadOwner || assertWritable || allowCreate || generationId === null)) fail('generation-write-binding');
  const logicalRoot = root.projectRoot === null ? '' : canonicalPath(root.projectRoot, false);
  const prefix = logicalRoot ? `${logicalRoot}/` : '';
  const projectRoot = generationId === null ? root.projectRoot : `${prefix}v2/generations/${generationId}`;
  const namespace = projectRoot ?? '';
  let disposed = false;
  const checkState = async (assertState: () => Promise<void>) => {
    if (disposed) fail('generation-closed');
    await assertState();
    if (disposed) fail('generation-closed');
  };
  const check = () => checkState(assertSelected);
  const checkWrite = async () => {
    if (assertSelectedWritable) return checkState(assertSelectedWritable);
    await check(); if (assertWritable) await assertWritable(); await check();
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
    try { await checkWrite(); await action(); await checkWrite(); root.mutationAuthority.assertWorkspaceWriteAuthorized(); }
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
    writeText: (path: string, text: string, creation?:import('../platform/fs').WorkspaceTextCreation) => { ownPath(path); return write(() => root.writeText(path, text, creation)); },
    appendText: (path: string, text: string) => { ownPath(path); return write(() => root.appendText(path, text)); },
    writeBytes: (path: string, bytes: Uint8Array) => {
      ownPath(path); const owned = bytes.slice(); return write(() => root.writeBytes(path, owned));
    },
    appendBytes: (path: string, bytes: Uint8Array) => {
      ownPath(path); const owned = bytes.slice(); return write(() => root.appendBytes(path, owned));
    },
    writeStream: async (path: string, stream: ReadableStream<Uint8Array>) => {
      const guarded = fencedStream(() => stream, checkWrite, reason => stream.cancel(reason));
      try { ownPath(path); await write(() => root.writeStream(path, guarded)); }
      finally { if (!guarded.locked) await guarded.cancel().catch(() => undefined); }
    },
    remove: (path: string) => { ownPath(path); return write(() => root.remove(path)); },
  });
  registerWriteFence(fs, checkWrite);
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
  // Public ports always retain per-I/O audits. The exact restore controller can
  // bind named pure readers only; no shared active-operation switch is used.
  const scopedOperation = async <T>(action: (ports: TextCommitPorts) => Promise<T>, text?: {
    transaction: string; documentKey: string; assertLease(): void
  }): Promise<T> => {
    let active = true;
    let phase: TextCommitPhase = 'journal';
    const reachedReadback = () => phase === 'readback';
    const journalRoot = text && metadataPath(fs, `journal/${technicalId(text.transaction)}/`);
    if (text && (!text.documentKey || text.documentKey === 'storage-adapter-id')) return fail('text-commit-document');
    const audit = text ? checkWrite : check;
    const assertTextOwner = () => {
      if (!text || disposed || !input.ordinaryTextCommit?.()) fail('text-commit-expired');
      text!.assertLease();
      root.mutationAuthority.assertEditable();
      root.mutationAuthority.assertWorkspaceWriteAuthorized();
    };
    const assertLive = () => {
      if (!active || disposed) fail('generation-read-expired');
      if (stagingReadOwner) { root.mutationAuthority.assertEditable(); stagingReadOwner(fs, factory); }
      if (text) assertTextOwner();
    };
    const live = async () => { assertLive(); };
    const perform = async <T>(work: () => Promise<T>): Promise<T> => {
      assertLive(); const result = await work(); assertLive(); return result;
    };
    const denied = async () => fail('generation-read-only');
    const writes = new Set<Promise<void>>();
    let writeError: { error: unknown } | undefined;
    let advancing = false;
    const mutate = (work: () => Promise<void>) => {
      assertLive();
      if (advancing) return fail('text-commit-phase');
      const task = perform(work);
      writes.add(task);
      void task.then(() => writes.delete(task), error => { writeError ??= { error }; writes.delete(task); });
      return task;
    };
    const checkFile = (path: string, names: string[], expectedPhase: TextCommitPhase) => {
      ownPath(path);
      if (!journalRoot || phase !== expectedPhase || !names.some(name => path === journalRoot + name)) fail('text-commit-path');
    };
    // Public ports remain independently fenced while this operation owns its ports.
    const readFs: ProjectWorkspaceFS = Object.freeze({
      projectRoot, mutationAuthority: root.mutationAuthority,
      readText: (path: string) => { ownPath(path); return perform(() => root.readText(path)); },
      readBytes: (path: string) => { ownPath(path); return perform(async () => (await root.readBytes(path))?.slice() ?? null); },
      readBytesFrom: (path: string, offset: number) => {
        ownPath(path);
        if (!Number.isSafeInteger(offset) || offset < 0) return Promise.reject(Error('Invalid byte offset'));
        return perform(async () => { const r = await root.readBytesFrom(path, offset); return r ? { size: r.size, data: r.data.slice() } : null; });
      },
      readStream: (path: string) => {
        ownPath(path); return perform(async () => {
          const file = await root.readStream(path); if (!file) return null;
          return Object.freeze({ size: file.size, stream: () => fencedStream(() => file.stream(), live),
            ...(file.blob ? { blob: () => perform(() => file.blob!()) } : {}) });
        });
      },
      exists: (path: string) => { ownPath(path); return perform(() => root.exists(path)); },
      list: (path: string) => {
        ownPath(path, true); return perform(async () => {
          const paths = await root.list(path);
          for (const item of paths) {
            canonicalPath(item, false);
            if (!item.startsWith(path) || namespace && !within(item, namespace)) fail('generation-list-outside');
          }
          return paths.filter(item => !isReserved(item));
        });
      },
      writeText: text ? (path: string, value: string, creation?: WorkspaceTextCreation) => {
        if (phase === 'journal') checkFile(path, ['staging.json', 'blobsVerified.json'], 'journal');
        else checkFile(path, ['metadataDurable.json', 'published.json'], 'publication');
        return mutate(() => root.writeText(path, value, creation && { assertOwned() { assertLive(); creation.assertOwned(); } }));
      } : denied,
      writeBytes: text ? (path: string, bytes: Uint8Array) => {
        checkFile(path, ['changes/00000000.amchange'], 'journal');
        const copy = bytes.slice(); return mutate(() => root.writeBytes(path, copy));
      } : denied,
      appendText: denied, appendBytes: denied, remove: denied,
      writeStream: async (_path: string, stream: ReadableStream<Uint8Array>) => {
        await stream.cancel().catch(() => undefined); return denied();
      },
    });
    const readFactory: MetadataStorageFactory = () => {
      assertLive();
      const base = connection.factory();
      const documentWrite = (key: string[], work: (owned: string[]) => Promise<void>) => {
        const owned = keyCopy(key);
        if (!text || phase !== 'repository' || owned[0] !== text.documentKey) return fail('text-commit-document');
        return mutate(() => work(owned));
      };
      return {
        load: key => { const owned = keyCopy(key); return perform(async () => (await base.load(owned))?.slice()); },
        loadRange: key => {
          const owned = keyCopy(key); return perform(async () => (await base.loadRange(owned)).map(row => {
            const key = keyCopy(row.key);
            if (!owned.every((part, i) => key[i] === part)) fail('generation-storage-range');
            return { key, data: row.data?.slice() };
          }));
        },
        save: text ? (key, bytes) => { const copy = bytes.slice(); return documentWrite(key, owned => base.save(owned, copy)); } : denied,
        remove: text ? key => documentWrite(key, owned => base.remove(owned)) : denied,
        removeRange: text ? key => documentWrite(key, owned => base.removeRange(owned)) : denied,
      };
    };
    const advance: TextCommitPorts['advance'] = async next => {
      const phases = ['journal', 'repository', 'publication', 'readback'];
      if (!text || advancing || writes.size || phases.indexOf(next) !== phases.indexOf(phase) + 1) return fail('text-commit-phase');
      advancing = true;
      try {
        assertLive(); await audit(); assertLive();
        if (writeError) throw writeError.error;
        phase = next;
      } finally { advancing = false; }
    };
    const ports = { fs: readFs, factory: readFactory, advance, assertCanAcknowledge: assertTextOwner };
    try {
      if (stagingReadOwner || text) assertLive();
      await audit();
      if (stagingReadOwner || text) assertLive();
      if (!stagingReadOwner && !text) { const result = await action(ports); await check(); await live(); return result; }
      let result: T | undefined, failure: unknown, failed = false;
      try { result = await action(ports); }
      catch (error) { failed = true; failure = error; }
      if (text) {
        active = false;
        await Promise.allSettled([...writes]);
        if (writeError && !failed) { failed = true; failure = writeError.error; }
      }
      // Closing refusal takes precedence even when the reader itself failed.
      // No owned result is accepted before this root-backed audit completes.
      await audit();
      if (text) {
        assertTextOwner();
        if (!failed && (advancing || !reachedReadback())) fail('text-commit-phase');
      }
      else await live();
      if (failed) throw failure;
      return result as T;
    }
    finally { active = false; }
  };
  if (auditReadOperations) registerReadOperation(fs, factory, scopedOperation);
  else if (stagingReadOwner) registerStagingReadOperation(fs, factory, scopedOperation);
  if (input.ordinaryTextCommit && assertSelectedWritable && generationId !== null)
    registerTextCommit(fs, factory, input.ordinaryTextCommit, (transaction, documentKey, action, assertLease) =>
      scopedOperation(action, { transaction, documentKey, assertLease }));
  return Object.freeze({ generationId, fs, factory, check,
    async dispose() { if (disposed) return; disposed = true; await connection.dispose(); },
  });
}
