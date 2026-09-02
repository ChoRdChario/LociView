import type {
  ProjectAccessState,
  ProjectMutationAuthority,
  ProjectSessionMode,
  ProjectWorkspaceFS,
  WorkspaceReadableFile,
  WorkspaceFS,
} from './fs';
import { ProjectMutationDeniedError } from './fs';

type ReleaseLock = () => void;
type ProjectLockPurpose = 'none' | 'mutation' | 'source-snapshot';

export interface ProjectNamespaceReader {
  readBytes(path: string): Promise<Uint8Array | null>;
  list(prefix: string): Promise<string[]>;
}

const namespaceReaders = new WeakMap<ProjectWorkspaceFS, ProjectNamespaceReader>();

/**
 * Return the read-only whole-workspace view paired with a scoped project
 * capability. This lets storage enforce cross-format identity exclusions
 * without giving a project writer a namespace-wide mutation capability.
 */
export function projectNamespaceReader(fs: ProjectWorkspaceFS): ProjectNamespaceReader {
  if (fs.projectRoot === null) return fs;
  const reader = namespaceReaders.get(fs);
  if (reader === undefined) {
    throw new Error('project lock: scoped workspace has no whole-workspace reader');
  }
  return reader;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function isInsideProject(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

class ScopedProjectWorkspace implements ProjectWorkspaceFS {
  readonly mutationAuthority: ProjectMutationAuthority;

  constructor(
    private readonly base: WorkspaceFS,
    readonly projectRoot: string,
    authority: ProjectMutationAuthority,
  ) {
    if (projectRoot === '' || projectRoot.endsWith('/')) {
      throw new Error(`project lock: invalid project root ${projectRoot}`);
    }
    this.mutationAuthority = authority;
    namespaceReaders.set(this, Object.freeze({
      readBytes: (path: string) => base.readBytes(path),
      list: (prefix: string) => base.list(prefix),
    }));
  }

  private assertPath(path: string): void {
    if (!isInsideProject(this.projectRoot, path)) {
      throw new Error(`project lock: path outside ${this.projectRoot}: ${path}`);
    }
  }

  private async mutate(path: string, action: () => Promise<void>): Promise<void> {
    this.assertPath(path);
    const finish = this.mutationAuthority.beginWorkspaceWrite();
    try {
      await action();
      // A blob written immediately before ownership loss may remain as an orphan,
      // but the caller must not publish metadata after this check fails.
      this.mutationAuthority.assertWorkspaceWriteAuthorized();
    } finally {
      finish();
    }
  }

  async readText(path: string): Promise<string | null> {
    this.assertPath(path);
    return this.base.readText(path);
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.mutate(path, () => this.base.writeText(path, text));
  }

  async appendText(path: string, text: string): Promise<void> {
    await this.mutate(path, () => this.base.appendText(path, text));
  }

  async appendBytes(path: string, data: Uint8Array): Promise<void> {
    await this.mutate(path, () => this.base.appendBytes(path, data));
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    this.assertPath(path);
    return this.base.readBytes(path);
  }

  async readBytesFrom(path: string, offset: number): Promise<{ size: number; data: Uint8Array } | null> {
    this.assertPath(path);
    return this.base.readBytesFrom(path, offset);
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await this.mutate(path, () => this.base.writeBytes(path, data));
  }

  async readStream(path: string): Promise<WorkspaceReadableFile | null> {
    this.assertPath(path);
    return this.base.readStream(path);
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    await this.mutate(path, () => this.base.writeStream(path, stream));
  }

  async list(prefix: string): Promise<string[]> {
    this.assertPath(prefix.endsWith('/') ? prefix.slice(0, -1) : prefix);
    return this.base.list(prefix);
  }

  async exists(path: string): Promise<boolean> {
    this.assertPath(path);
    return this.base.exists(path);
  }

  async remove(path: string): Promise<void> {
    await this.mutate(path, () => this.base.remove(path));
  }
}

export class ProjectMutationSession implements ProjectMutationAuthority {
  readonly workspace: ProjectWorkspaceFS;
  private stateValue: ProjectAccessState = 'read-only';
  private detailValue: string;
  private held = false;
  private activated = false;
  private closing = false;
  private writesSealed = false;
  private activeWorkspaceWrites = 0;
  private readonly idleWaiters = new Set<() => void>();
  private released = false;
  private releaseLock: ReleaseLock | null = null;
  private readonly listeners = new Set<(state: ProjectAccessState) => void>();

  constructor(
    base: WorkspaceFS,
    readonly projectRoot: string,
    readonly projectId: string,
    readonly sessionMode: ProjectSessionMode,
    private readonly lockPurpose: ProjectLockPurpose = sessionMode === 'edit' ? 'mutation' : 'none',
  ) {
    this.detailValue = lockPurpose === 'source-snapshot'
      ? '別の画面がこの従来形式を使用しているため、変換元を保護できません'
      : sessionMode === 'view'
        ? '従来形式は閲覧専用です'
        : '別のEdit modeタブがこのプロジェクトの書込みロックを使用しています';
    this.writesSealed = lockPurpose !== 'mutation';
    this.workspace = new ScopedProjectWorkspace(base, projectRoot, this);
  }

  get accessState(): ProjectAccessState {
    return this.stateValue;
  }

  get accessDetail(): string {
    return this.detailValue;
  }

  get holdsWriteLock(): boolean {
    return this.lockPurpose === 'mutation' && this.held && !this.released;
  }

  get holdsSourceSnapshotLock(): boolean {
    return this.lockPurpose === 'source-snapshot' && this.held && !this.released;
  }

  get holdsExclusiveLock(): boolean {
    return this.lockPurpose !== 'none' && this.held && !this.released;
  }

  assertEditable(): void {
    if (
      this.lockPurpose !== 'mutation' || !this.activated || this.closing ||
      this.stateValue !== 'editable' || !this.held || this.released
    ) {
      throw new ProjectMutationDeniedError(this.stateValue, this.detailValue);
    }
  }

  assertSourceSnapshotProtected(): void {
    if (
      this.lockPurpose !== 'source-snapshot' || !this.activated || this.closing ||
      !this.held || this.released || this.stateValue === 'lock-lost'
    ) {
      throw new ProjectMutationDeniedError(this.stateValue, this.detailValue);
    }
  }

  beginWorkspaceWrite(): () => void {
    this.assertWorkspaceWriteAuthorized();
    this.activeWorkspaceWrites += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.activeWorkspaceWrites -= 1;
      if (this.activeWorkspaceWrites === 0) {
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
      }
    };
  }

  assertWorkspaceWriteAuthorized(): void {
    if (!this.activated || this.writesSealed || !this.held || this.released || this.stateValue === 'lock-lost') {
      throw new ProjectMutationDeniedError(this.stateValue, this.detailValue);
    }
  }

  subscribeAccess(fn: (state: ProjectAccessState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Existing projects may activate only after a fresh durable reload under the held lock. */
  activateAfterDurableReload(): void {
    this.activate('Edit mode（書込みロック取得済み）');
  }

  /** A newly allocated, absent project has no durable state to reload. */
  activateNewProject(): void {
    this.activate('Edit mode（新規プロジェクトの書込みロック取得済み）');
  }

  /** A fresh durable reload may activate protection, but never workspace writes. */
  activateSourceSnapshotAfterDurableReload(): void {
    if (
      this.lockPurpose !== 'source-snapshot' || !this.held || this.released ||
      this.stateValue === 'lock-lost'
    ) {
      throw new ProjectMutationDeniedError(this.stateValue, this.detailValue);
    }
    this.activated = true;
    this.closing = false;
    this.writesSealed = true;
    this.publish('read-only', '変換元を変更から保護しています');
  }

  /** Stop accepting new writes while queued writes are flushed before release. */
  beginClose(): void {
    this.closing = true;
    if (this.stateValue === 'editable') {
      this.publish('read-only', 'プロジェクトを閉じるため保存を完了しています');
    }
  }

  resumeAfterCloseFailure(): void {
    if (
      this.lockPurpose === 'mutation' && this.held && !this.released &&
      this.stateValue !== 'lock-lost'
    ) {
      this.closing = false;
      this.writesSealed = false;
      this.publish('editable', '保存に失敗したためEdit modeと書込みロックを維持しています');
    }
  }

  async waitForWorkspaceIdle(): Promise<void> {
    if (this.activeWorkspaceWrites === 0) return;
    await new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }

  sealWorkspaceWritesForRelease(): boolean {
    if (this.activeWorkspaceWrites !== 0) return false;
    this.writesSealed = true;
    return true;
  }

  denyWriteLock(detail: string): void {
    if (this.released) return;
    this.held = false;
    this.activated = false;
    this.closing = false;
    this.writesSealed = true;
    const release = this.releaseLock;
    this.releaseLock = null;
    release?.();
    this.publish('read-only', detail);
  }

  failClosed(detail = '書込みロックを確認できないため新規書込みを停止しました'): void {
    if (this.released) return;
    this.held = false;
    this.activated = false;
    this.closing = true;
    this.writesSealed = true;
    this.publish('lock-lost', detail);
    const release = this.releaseLock;
    this.releaseLock = null;
    release?.();
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.held = false;
    this.activated = false;
    this.closing = true;
    this.writesSealed = true;
    const release = this.releaseLock;
    this.releaseLock = null;
    release?.();
    this.publish(
      'read-only',
      this.lockPurpose === 'source-snapshot'
        ? '変換元の保護を終了しました'
        : this.sessionMode === 'view' ? '閲覧を終了しました' : 'Edit modeを終了しました',
    );
  }

  /** @internal coordinator grant hook */
  grant(release: ReleaseLock): void {
    if (this.released) {
      release();
      return;
    }
    this.held = true;
    this.activated = false;
    this.closing = false;
    this.writesSealed = this.lockPurpose !== 'mutation';
    this.releaseLock = release;
    this.publish(
      'read-only',
      this.lockPurpose === 'source-snapshot'
        ? '変換元を保護しました。端末保存済みデータを再確認しています'
        : '書込みロックを取得しました。端末保存済みデータを再読込しています',
    );
  }

  private activate(detail: string): void {
    if (
      this.lockPurpose !== 'mutation' || !this.held || this.released ||
      this.stateValue === 'lock-lost'
    ) {
      throw new ProjectMutationDeniedError(this.stateValue, this.detailValue);
    }
    this.activated = true;
    this.closing = false;
    this.writesSealed = false;
    this.publish('editable', detail);
  }

  private publish(state: ProjectAccessState, detail: string): void {
    const changed = state !== this.stateValue || detail !== this.detailValue;
    this.stateValue = state;
    this.detailValue = detail;
    if (!changed) return;
    for (const fn of this.listeners) fn(state);
  }
}

/** Project-lifetime, non-queued single-writer acquisition. */
export class ProjectMutationCoordinator {
  private readonly localHolders: Set<string> | null;

  private constructor(
    private readonly lockManager: LockManager | null,
    local: boolean,
  ) {
    this.localHolders = local ? new Set<string>() : null;
  }

  static browser(lockManager: LockManager | null): ProjectMutationCoordinator {
    return new ProjectMutationCoordinator(lockManager, false);
  }

  /** Tab-local MemoryFS and deterministic acceptance use this backend. */
  static local(): ProjectMutationCoordinator {
    return new ProjectMutationCoordinator(null, true);
  }

  /** Deliberate View mode: read-only and never touches the lock manager. */
  openView(
    base: WorkspaceFS,
    projectRoot: string,
    projectId: string,
  ): ProjectMutationSession {
    return new ProjectMutationSession(base, projectRoot, projectId, 'view');
  }

  async tryAcquire(
    base: WorkspaceFS,
    projectRoot: string,
    projectId: string,
  ): Promise<ProjectMutationSession> {
    return this.tryAcquireExclusive(base, projectRoot, projectId, 'mutation');
  }

  async tryAcquireSourceSnapshot(
    base: WorkspaceFS,
    projectRoot: string,
    projectId: string,
  ): Promise<ProjectMutationSession> {
    return this.tryAcquireExclusive(base, projectRoot, projectId, 'source-snapshot');
  }

  private async tryAcquireExclusive(
    base: WorkspaceFS,
    projectRoot: string,
    projectId: string,
    purpose: 'mutation' | 'source-snapshot',
  ): Promise<ProjectMutationSession> {
    const session = new ProjectMutationSession(
      base,
      projectRoot,
      projectId,
      purpose === 'mutation' ? 'edit' : 'view',
      purpose,
    );
    const lockName = `lociview:project:${projectId}:mutation`;

    if (this.localHolders !== null) {
      if (this.localHolders.has(lockName)) return session;
      this.localHolders.add(lockName);
      session.grant(() => this.localHolders?.delete(lockName));
      return session;
    }

    if (this.lockManager === null) {
      session.denyWriteLock(
        purpose === 'source-snapshot'
          ? 'このブラウザでは変換元を排他的に保護できません'
          : 'Web Locks APIを利用できないためEdit modeは読み取り専用です',
      );
      return session;
    }

    const started = deferred();
    const hold = deferred();
    let callbackStarted = false;
    let intentionalRelease = false;
    try {
      const request = this.lockManager.request(
        lockName,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          callbackStarted = true;
          if (lock === null) {
            session.denyWriteLock(
              purpose === 'source-snapshot'
                ? '別の画面がこの従来形式を使用しているため変換を開始できません'
                : '別のEdit modeタブが書込みロックを使用しているため読み取り専用です',
            );
            started.resolve();
            return;
          }
          session.grant(() => {
            intentionalRelease = true;
            hold.resolve();
          });
          started.resolve();
          await hold.promise;
        },
      );
      void request.then(
        () => {
          if (session.holdsExclusiveLock && !intentionalRelease) {
            session.failClosed(
              purpose === 'source-snapshot'
                ? '変換元の保護が予期せず終了したため変換を停止しました'
                : '書込みロックが予期せず終了したため新規書込みを停止しました',
            );
          }
        },
        () => {
          if (!callbackStarted) started.resolve();
          if (session.holdsExclusiveLock) {
            session.failClosed(
              purpose === 'source-snapshot'
                ? '変換元の保護を維持できないため変換を停止しました'
                : '書込みロックの維持に失敗したため新規書込みを停止しました',
            );
          } else {
            session.denyWriteLock(
              purpose === 'source-snapshot'
                ? '変換元を保護できないため変換を開始できません'
                : '書込みロックを取得できないためEdit modeは読み取り専用です',
            );
          }
        },
      );
      await started.promise;
    } catch {
      session.denyWriteLock(
        purpose === 'source-snapshot'
          ? '変換元を保護できないため変換を開始できません'
          : '書込みロックを利用できないためEdit modeは読み取り専用です',
      );
    }
    return session;
  }
}
