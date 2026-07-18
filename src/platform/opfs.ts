// OPFS (Origin Private File System) 実装 (docs/06 §1)
// ブラウザ実行時の標準ワークスペース。Node/テストでは MemoryFS を使う。
// 注意: appendText は read-modify-write で実装している。op追記は逐次化されるため
// （ProjectStore側で書き込みキューを直列化）、これで整合する。

import type { WorkspaceFS } from './fs';

async function getDir(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
  const parts = path.split('/').filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(parts[i]!, { create });
    } catch {
      return null;
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
    } catch {
      return null;
    }
  }

  async readText(path: string): Promise<string | null> {
    const h = await this.fileHandle(path, false);
    if (!h) return null;
    return (await h.getFile()).text();
  }

  async writeText(path: string, text: string): Promise<void> {
    const h = await this.fileHandle(path, true);
    if (!h) throw new Error(`opfs: cannot open ${path}`);
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
  }

  async appendText(path: string, text: string): Promise<void> {
    const h = await this.fileHandle(path, true);
    if (!h) throw new Error(`opfs: cannot open ${path}`);
    const size = (await h.getFile()).size;
    const w = await h.createWritable({ keepExistingData: true });
    await w.write({ type: 'write', position: size, data: text });
    await w.close();
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const h = await this.fileHandle(path, false);
    if (!h) return null;
    return new Uint8Array(await (await h.getFile()).arrayBuffer());
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const h = await this.fileHandle(path, true);
    if (!h) throw new Error(`opfs: cannot open ${path}`);
    const w = await h.createWritable();
    // ArrayBuffer裏付けのコピーを渡す（SharedArrayBuffer由来ビューを型上排除）
    await w.write(new Uint8Array(data));
    await w.close();
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, base: string): Promise<void> => {
      // entries() はDOM型定義に未収載だが全実装ブラウザに存在する
      const iter = (dir as unknown as {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      }).entries();
      for await (const [name, handle] of iter) {
        const p = base === '' ? name : `${base}/${name}`;
        if (handle.kind === 'directory') {
          await walk(handle as FileSystemDirectoryHandle, p);
        } else if (p.startsWith(prefix)) {
          out.push(p);
        }
      }
    };
    await walk(this.root, '');
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
    } catch {
      // 存在しない場合は無視
    }
  }
}
