// WorkspaceFS: ワークスペースの抽象 (docs/03 Platform Layer, docs/06 §1)
// 上位層はブラウザ差（OPFS / メモリfallback）を知らない。
// パスは 'projects/<projectId>/ops/a_xxx.jsonl' のようなスラッシュ区切りの論理キー。

export interface WorkspaceFS {
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  appendText(path: string, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array | null>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  /** prefix配下のファイルパス一覧（辞書順） */
  list(prefix: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** テストおよび file:// 起動時のfallback実装（docs/03 §3） */
export class MemoryFS implements WorkspaceFS {
  private files = new Map<string, Uint8Array>();

  async readText(path: string): Promise<string | null> {
    const b = this.files.get(path);
    return b === undefined ? null : decoder.decode(b);
  }

  async writeText(path: string, text: string): Promise<void> {
    this.files.set(path, encoder.encode(text));
  }

  async appendText(path: string, text: string): Promise<void> {
    const prev = this.files.get(path);
    const add = encoder.encode(text);
    if (prev === undefined) {
      this.files.set(path, add);
      return;
    }
    const merged = new Uint8Array(prev.length + add.length);
    merged.set(prev, 0);
    merged.set(add, prev.length);
    this.files.set(path, merged);
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const b = this.files.get(path);
    return b === undefined ? null : new Uint8Array(b);
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, new Uint8Array(data));
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}
