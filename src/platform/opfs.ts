// OPFS (Origin Private File System) 実装 (docs/06 §1)
// ブラウザ実行時の標準ワークスペース。Node/テストでは MemoryFS を使う。
// 注意: appendText は read-modify-write で実装している。op追記は逐次化されるため
// （ProjectStore側で書き込みキューを直列化）、これで整合する。

import type { WorkspaceFS, WorkspaceReadableFile, WorkspaceTextCreation } from './fs';

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

async function getDir(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
  const parts = path.split('/').filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(parts[i]!, { create });
    } catch (error) {
      if (!create && isNotFoundError(error)) return null;
      throw error;
    }
  }
  return { dir, name: parts[parts.length - 1]! };
}

export class OpfsFS implements WorkspaceFS {
  private constructor(private readonly root: FileSystemDirectoryHandle) {}

  static async isAvailable(): Promise<boolean> {
    try {
      return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
    } catch {
      return false;
    }
  }

  static async open(): Promise<OpfsFS> {
    const root = await navigator.storage.getDirectory();
    return new OpfsFS(root);
  }

  private async fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
    const loc = await getDir(this.root, path, create);
    if (!loc) return null;
    try {
      return await loc.dir.getFileHandle(loc.name, { create });
    } catch (error) {
      if (!create && isNotFoundError(error)) return null;
      throw error;
    }
  }

  async readText(path: string): Promise<string | null> {
    const h = await this.fileHandle(path, false);
    if (!h) return null;
    return (await h.getFile()).text();
  }

  async writeText(path: string, text: string, creation?:WorkspaceTextCreation): Promise<void> {
    if (creation) {
      creation.assertOwned();
      const previous = await this.fileHandle(path, false);
      creation.assertOwned();
      if (previous) throw Error('opfs: fresh text entry already exists');
    }
    const h = await this.fileHandle(path, true);
    if (!h) throw new Error(`opfs: cannot open ${path}`);
    creation?.assertOwned();
    let w: FileSystemWritableFileStream;
    try { w = await h.createWritable(); }
    catch (error) {
      if (creation) try {
        creation.assertOwned();
        const current = await this.fileHandle(path, false);
        creation.assertOwned();
        if (current) {
          const same = await h.isSameEntry(current);
          creation.assertOwned();
          const file = await current.getFile();
          creation.assertOwned();
          if (!same || file.size !== 0) throw Error('opfs: fresh text entry changed; cleanup refused');
          await this.remove(path);
          creation.assertOwned();
        }
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], '管理ファイルの作成と後片付けに失敗しました。再開用データを保持しています。');
      }
      throw error;
    }
    await w.write(text);
    await w.close();
  }

  async appendText(path: string, text: string): Promise<void> {
    await this.appendData(path, text);
  }

  async appendBytes(path: string, data: Uint8Array): Promise<void> {
    await this.appendData(path, new Uint8Array(data));
  }

  private async appendData(path: string, data: string | Uint8Array): Promise<void> {
    const h = await this.fileHandle(path, true);
    if (!h) throw new Error(`opfs: cannot open ${path}`);
    const size = (await h.getFile()).size;
    const w = await h.createWritable({ keepExistingData: true });
    let chunk: string | ArrayBuffer;
    if (typeof data === 'string') {
      chunk = data;
    } else {
      const copy = new Uint8Array(data.length);
      copy.set(data);
      chunk = copy.buffer;
    }
    await w.write({ type: 'write', position: size, data: chunk });
    await w.close();
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const h = await this.fileHandle(path, false);
    if (!h) return null;
    return new Uint8Array(await (await h.getFile()).arrayBuffer());
  }

  async readBytesFrom(path: string, offset: number): Promise<{ size: number; data: Uint8Array } | null> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('opfs: invalid byte offset');
    const h = await this.fileHandle(path, false);
    if (!h) return null;
    const file = await h.getFile();
    return {
      size: file.size,
      data: new Uint8Array(await file.slice(Math.min(offset, file.size)).arrayBuffer()),
    };
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const h = await this.fileHandle(path, true);
    if (!h) throw new Error(`opfs: cannot open ${path}`);
    const w = await h.createWritable();
    // ArrayBuffer裏付けのコピーを渡す（SharedArrayBuffer由来ビューを型上排除）
    await w.write(new Uint8Array(data));
    await w.close();
  }

  async readStream(path: string): Promise<WorkspaceReadableFile | null> {
    const h = await this.fileHandle(path, false);
    if (!h) return null;
    const file = await h.getFile();
    return {
      size: file.size,
      blob: async () => file,
      stream: () => file.stream() as ReadableStream<Uint8Array>,
    };
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const h = await this.fileHandle(path, true);
    if (!h) throw new Error(`opfs: cannot open ${path}`);
    const writable = await h.createWritable();
    const reader = stream.getReader();
    let pending: Uint8Array<ArrayBuffer> | undefined, used = 0;
    const flush = async () => {
      if (used) { await writable.write(pending!.subarray(0, used)); used = 0; }
    };
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        // Own the complete chunk before a pending write can suspend this loop.
        const bytes = new Uint8Array(result.value);
        if (bytes.length >= 65_536) { await flush(); await writable.write(bytes); }
        else if (bytes.length) {
          pending ??= new Uint8Array(65_536);
          if (bytes.length > pending.length - used) await flush();
          pending.set(bytes, used); used += bytes.length;
          if (used === pending.length) await flush();
        }
      }
      await flush();
      await writable.close();
    } catch (error) {
      try {
        await reader.cancel(error);
      } catch {
        // The original sink failure is authoritative.
      }
      try {
        await writable.abort(error);
      } catch {
        // The original write failure is authoritative.
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const pending = new Set<Promise<void>>();
    let workers = 0, failed = false, failure: unknown;
    const refuse = (error: unknown) => { if (!failed) { failed = true; failure = error; } };
    const walk = async (dir: FileSystemDirectoryHandle, base: string): Promise<void> => {
      let iter: AsyncIterableIterator<[string, FileSystemHandle]> | undefined, done = false;
      try {
        iter = (dir as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries();
        while (!failed) {
          const entry = await iter.next();
          if (entry.done) { done = true; break; }
          if (failed) break;
          const [name, handle] = entry.value, p = base === '' ? name : `${base}/${name}`;
          if (handle.kind === 'directory') {
            // Retain lexical prefix pruning, including partial names.
            const branch = `${p}/`;
            if (prefix.startsWith(branch) || branch.startsWith(prefix)) {
              if (workers < 4) start(handle as FileSystemDirectoryHandle, p);
              else await walk(handle as FileSystemDirectoryHandle, p);
            }
          } else if (p.startsWith(prefix)) out.push(p);
        }
      } catch (error) { refuse(error); }
      finally {
        // Drain an owned iterator on a sibling failure too; preserve the first
        // native failure if closing another iterator also fails.
        try { if (!done && iter?.return) await iter.return(); }
        catch (error) { refuse(error); }
      }
    };
    const start = (dir: FileSystemDirectoryHandle, base: string) => {
      workers++;
      const task = walk(dir, base).catch(refuse).finally(() => { workers--; pending.delete(task); });
      pending.add(task);
    };
    // No directory queue/cache: at capacity the current worker descends
    // serially. The bound is shared by this entire list, not each recursion.
    start(this.root, '');
    while (pending.size) await Promise.all([...pending]);
    if (failed) throw failure;
    return out.sort();
  }

  async exists(path: string): Promise<boolean> {
    return (await this.fileHandle(path, false)) !== null;
  }

  async remove(path: string): Promise<void> {
    const loc = await getDir(this.root, path, false);
    if (!loc) return;
    try {
      await loc.dir.removeEntry(loc.name);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      // 存在しない場合は無視
    }
  }
}
