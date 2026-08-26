// WorkspaceFS: ワークスペースの抽象 (docs/03 Platform Layer, docs/06 §1)
// 上位層はブラウザ差（OPFS / メモリfallback）を知らない。
// パスは 'projects/<projectId>/ops/a_xxx.jsonl' のようなスラッシュ区切りの論理キー。

export interface WorkspaceFS {
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  appendText(path: string, text: string): Promise<void>;
  appendBytes(path: string, data: Uint8Array): Promise<void>;
  readBytes(path: string): Promise<Uint8Array | null>;
  /** Returns the total file size plus an exact copy of bytes from offset to EOF. */
  readBytesFrom(path: string, offset: number): Promise<{ size: number; data: Uint8Array } | null>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  /** prefix配下のファイルパス一覧（辞書順） */
  list(prefix: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
}

export type ProjectAccessState = 'editable' | 'read-only' | 'lock-lost';
export type ProjectSessionMode = 'view' | 'edit';

export class ProjectMutationDeniedError extends Error {
  constructor(readonly accessState: ProjectAccessState, message?: string) {
    super(message ?? `project mutation denied: ${accessState}`);
    this.name = 'ProjectMutationDeniedError';
  }
}

/** One project session's synchronous mutation authority. */
export interface ProjectMutationAuthority {
  readonly sessionMode: ProjectSessionMode;
  readonly accessState: ProjectAccessState;
  readonly accessDetail: string;
  assertEditable(): void;
  beginWorkspaceWrite(): () => void;
  assertWorkspaceWriteAuthorized(): void;
  subscribeAccess(fn: (state: ProjectAccessState) => void): () => void;
}

/**
 * A filesystem capability already bound to one project and one authority.
 * Persistent production stores accept this type, never a raw OPFS handle.
 */
export interface ProjectWorkspaceFS extends WorkspaceFS {
  /** `null` is reserved for tab-local MemoryFS/test use. */
  readonly projectRoot: string | null;
  readonly mutationAuthority: ProjectMutationAuthority;
}

export const LOCAL_PROJECT_MUTATION_AUTHORITY: ProjectMutationAuthority = Object.freeze({
  sessionMode: 'edit' as const,
  accessState: 'editable' as const,
  accessDetail: 'tab-local workspace',
  assertEditable: () => undefined,
  beginWorkspaceWrite: () => () => undefined,
  assertWorkspaceWriteAuthorized: () => undefined,
  subscribeAccess: () => () => undefined,
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** テストおよび file:// 起動時のfallback実装（docs/03 §3） */
export class MemoryFS implements ProjectWorkspaceFS {
  readonly projectRoot = null;
  readonly mutationAuthority = LOCAL_PROJECT_MUTATION_AUTHORITY;
  private files = new Map<string, Uint8Array>();

  async readText(path: string): Promise<string | null> {
    const b = this.files.get(path);
    return b === undefined ? null : decoder.decode(b);
  }

  async writeText(path: string, text: string): Promise<void> {
    this.files.set(path, encoder.encode(text));
  }

  async appendText(path: string, text: string): Promise<void> {
    this.appendData(path, encoder.encode(text));
  }

  async appendBytes(path: string, data: Uint8Array): Promise<void> {
    this.appendData(path, new Uint8Array(data));
  }

  private appendData(path: string, add: Uint8Array): void {
    const prev = this.files.get(path);
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

  async readBytesFrom(path: string, offset: number): Promise<{ size: number; data: Uint8Array } | null> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('fs: invalid byte offset');
    const bytes = this.files.get(path);
    if (bytes === undefined) return null;
    return { size: bytes.length, data: bytes.slice(Math.min(offset, bytes.length)) };
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
