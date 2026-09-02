// ProjectStore: 単方向フローの中枢 (docs/00 §5, docs/03 §4)
//   dispatch(操作) → 自分のログへ1行追記 → 状態を再導出 → 購読者へ通知
// 書き込みは自分のactorIdのファイルのみ。他人のログはマージ時に追加保存されるだけ。

import { formatHlc, HlcClock } from './hlc';
import { newActorId, newId, type IdPrefix } from './ids';
import {
  MAX_LINE_CHARS,
  parseOpsJsonl,
  serializeOps,
  v1OperationLogActor,
  type JsonlParseError,
} from './jsonl';
import {
  createManifest,
  parseCandidateV1ManifestBytes,
  parseManifest,
  readPublishedCandidateV1ManifestBytes,
  type ProjectManifest,
} from './manifest';
import { mergeOps, type MergeReport } from './merge';
import { admitNonDivergentV1Operations, type LocatedV1Operation } from './operationAdmission';
import { reduce, versionVector, type ProjectState } from './reduce';
import { cloneValidatedDispatchOp, type Op, type OpType } from './schema';
import {
  ProjectMutationDeniedError,
  type ProjectAccessState,
  type ProjectSessionMode,
  type ProjectWorkspaceFS,
} from '../platform/fs';

export interface Identity {
  userId: string;
  deviceId: string;
  displayName?: string;
}

export interface DispatchInput {
  t: OpType;
  e: string;
  id: string;
  v?: Record<string, unknown>;
}

export type DurableWritePhase = 'durable' | 'queued' | 'writing' | 'failed';

export interface DurableWriteStatus {
  readonly phase: DurableWritePhase;
  readonly pending: number;
  readonly retryable: boolean;
}

interface PendingAppend {
  readonly path: string;
  readonly text: string;
  readonly bytes: Uint8Array;
  baseLength?: number;
  attempted?: boolean;
}

class DurableAppendDivergedError extends Error {
  constructor(path: string) {
    super(`store: durable append diverged for ${path}`);
    this.name = 'DurableAppendDivergedError';
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const fatalTextDecoder = new TextDecoder('utf-8', { fatal: true });

export type ProjectWritePolicy = 'writable' | 'read-only-source';

const ENTITY_PREFIX: Record<string, IdPrefix> = {
  caption: 'cap',
  set: 'set',
  view: 'view',
  material: 'mat',
  asset: 'ast',
  profile: 'usr',
};

/** エンティティ種別に対応する新規IDを発行する（Undo等、store外からのID事前確保用） */
export function entityIdFor(kind: string): string {
  const prefix = ENTITY_PREFIX[kind];
  return prefix !== undefined ? newId(prefix) : `${kind}_${newId('ast').slice(4)}`;
}

export class ProjectStore {
  private ops: Op[] = [];
  private stateCache: ProjectState;
  private seq = 0;
  private readonly clock: HlcClock;
  private readonly listeners = new Set<(state: ProjectState) => void>();
  private readonly durabilityListeners = new Set<(status: DurableWriteStatus) => void>();
  private readonly pendingAppends: PendingAppend[] = [];
  private pendingHead = 0;
  private readonly durableLogLengths = new Map<string, number>();
  private activeDrain: Promise<void> | null = null;
  private durabilityValue: DurableWriteStatus = Object.freeze({
    phase: 'durable',
    pending: 0,
    retryable: false,
  });
  /** 起動時に読んだログの破損行（UIで警告表示する） */
  readonly loadErrors: { file: string; errors: JsonlParseError[] }[] = [];

  readonly actorId: string;

  private constructor(
    readonly workspace: ProjectWorkspaceFS,
    readonly dir: string,
    readonly manifest: ProjectManifest,
    readonly identity: Identity,
    readonly writePolicy: ProjectWritePolicy = 'writable',
  ) {
    if (workspace.projectRoot !== null && workspace.projectRoot !== dir) {
      throw new Error(`store: project workspace root mismatch (${workspace.projectRoot} !== ${dir})`);
    }
    this.actorId = newActorId();
    this.clock = new HlcClock(this.actorId);
    this.stateCache = reduce([]);
  }

  // ---- ライフサイクル -------------------------------------------------------

  private static initializeNew(
    fs: ProjectWorkspaceFS,
    dir: string,
    manifest: ProjectManifest,
    identity: Identity,
  ): ProjectStore {
    const store = new ProjectStore(fs, dir, manifest, identity, 'writable');
    store.createEntity('set', { name: '標準', order: 1 });
    store.dispatch({
      t: 'create',
      e: 'profile',
      id: identity.userId,
      v: { displayName: identity.displayName ?? '', defaultPinColor: '#eab308' },
    });
    return store;
  }

  /** 新規プロジェクト作成。既定の表示セットと自分のprofileを添えて初期化する */
  static async create(fs: ProjectWorkspaceFS, dir: string, name: string, identity: Identity): Promise<ProjectStore> {
    return ProjectStore.createWithManifest(fs, dir, createManifest(name), identity);
  }

  /** A caller that acquired the projectId lock before first write uses this factory. */
  static async createWithManifest(
    fs: ProjectWorkspaceFS,
    dir: string,
    manifestInput: ProjectManifest,
    identity: Identity,
  ): Promise<ProjectStore> {
    const manifest = parseManifest(JSON.stringify(manifestInput));
    await fs.writeText(`${dir}/lociview.json`, JSON.stringify(manifest, null, 2));
    const store = ProjectStore.initializeNew(fs, dir, manifest, identity);
    await store.flush();
    return store;
  }

  /**
   * 新規プロジェクトを completion marker なしで初期化する。
   * 呼出側は必要な全authorityをdurableにした後でmanifestを最後に公開する。
   */
  static async createUnpublished(
    fs: ProjectWorkspaceFS,
    dir: string,
    name: string,
    identity: Identity,
    manifestInput?: ProjectManifest,
  ): Promise<ProjectStore> {
    const manifest = manifestInput === undefined
      ? createManifest(name)
      : parseManifest(JSON.stringify(manifestInput));
    if (manifest.name !== name) throw new Error('store: preallocated manifest name mismatch');
    const store = ProjectStore.initializeNew(fs, dir, manifest, identity);
    await store.flush();
    return store;
  }

  /** 既存プロジェクトを開く。全opsを読み、時計を観測済み最大値まで進める */
  static async open(fs: ProjectWorkspaceFS, dir: string, identity: Identity): Promise<ProjectStore> {
    return ProjectStore.openWithPolicy(fs, dir, identity, 'writable');
  }

  /** Public-candidate compatibility source: readable/convertible, never writable. */
  static async openLegacySource(
    fs: ProjectWorkspaceFS,
    dir: string,
    identity: Identity,
  ): Promise<ProjectStore> {
    return ProjectStore.openWithPolicy(fs, dir, identity, 'read-only-source');
  }

  private static async openWithPolicy(
    fs: ProjectWorkspaceFS,
    dir: string,
    identity: Identity,
    writePolicy: ProjectWritePolicy,
  ): Promise<ProjectStore> {
    const manifestBytes = await readPublishedCandidateV1ManifestBytes(fs, dir);
    if (manifestBytes === null) throw new Error(`store: no manifest in ${dir}`);
    let manifest: ProjectManifest;
    if (writePolicy === 'read-only-source') {
      manifest = parseCandidateV1ManifestBytes(manifestBytes);
    } else {
      manifest = parseManifest(textDecoder.decode(manifestBytes));
    }
    const store = new ProjectStore(fs, dir, manifest, identity, writePolicy);

    const opsFiles = await fs.list(`${dir}/ops/`);
    const located: LocatedV1Operation[] = [];
    for (const file of opsFiles) {
      if (!file.endsWith('.jsonl')) continue;
      const bytes = await fs.readBytes(file);
      if (bytes === null) continue;
      store.durableLogLengths.set(file, bytes.length);
      let text: string;
      try {
        text = fatalTextDecoder.decode(bytes);
      } catch {
        throw new Error(`store: invalid UTF-8 operation log ${file}`);
      }
      const { entries, errors } = parseOpsJsonl(text, {
        candidateReadOnly: writePolicy === 'read-only-source',
      });
      if (writePolicy === 'read-only-source') {
        const actor = v1OperationLogActor(file, `${dir}/ops/`);
        if (actor === null) {
          errors.push({ line: 1, reason: 'operation actor/path mismatch' });
        } else {
          for (const entry of entries) {
            if (entry.op.actor !== actor) {
              errors.push({ line: entry.line, reason: 'operation actor/path mismatch' });
            } else {
              located.push({ op: entry.op, line: entry.line, source: file });
            }
          }
        }
      } else {
        located.push(...entries.map(({ op, line }) => ({ op, line, source: file })));
      }
      if (errors.length > 0) store.loadErrors.push({ file, errors });
    }
    if (writePolicy === 'writable') {
      store.ingest(located.map(({ op }) => op));
      return store;
    }
    const admitted = admitNonDivergentV1Operations(located);
    for (const record of admitted.divergent) {
      let issue = store.loadErrors.find(({ file }) => file === record.source);
      if (issue === undefined) {
        issue = { file: record.source, errors: [] };
        store.loadErrors.push(issue);
      }
      if (!issue.errors.some(({ line }) => line === record.line)) {
        issue.errors.push({ line: record.line, reason: 'divergent operation identity' });
      }
    }
    store.ingest(admitted.accepted.map(({ op }) => op));
    return store;
  }

  // ---- 読み取り -------------------------------------------------------------

  get state(): ProjectState {
    return this.stateCache;
  }

  get allOps(): readonly Op[] {
    return this.ops;
  }

  get vector(): Record<string, number> {
    return versionVector(this.ops);
  }

  get durabilityStatus(): DurableWriteStatus {
    return this.durabilityValue;
  }

  get accessState(): ProjectAccessState {
    return this.workspace.mutationAuthority.accessState;
  }

  get sessionMode(): ProjectSessionMode {
    return this.workspace.mutationAuthority.sessionMode;
  }

  get accessDetail(): string {
    return this.workspace.mutationAuthority.accessDetail;
  }

  get canMutate(): boolean {
    return this.writePolicy === 'writable' && this.accessState === 'editable';
  }

  subscribe(fn: (state: ProjectState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeDurability(fn: (status: DurableWriteStatus) => void): () => void {
    this.durabilityListeners.add(fn);
    return () => this.durabilityListeners.delete(fn);
  }

  subscribeAccess(fn: (state: ProjectAccessState) => void): () => void {
    return this.workspace.mutationAuthority.subscribeAccess(fn);
  }

  assertMutationAllowed(): void {
    if (this.writePolicy !== 'writable') {
      throw new ProjectMutationDeniedError(
        'read-only',
        '従来形式は閲覧専用です。新しい形式へ変換して編集してください。',
      );
    }
    this.workspace.mutationAuthority.assertEditable();
  }

  assertSourceSnapshotProtected(): void {
    this.workspace.mutationAuthority.assertSourceSnapshotProtected();
  }

  assertWorkspace(fs: ProjectWorkspaceFS, dir: string): void {
    if (fs !== this.workspace || dir !== this.dir) {
      throw new Error('store: mutation workspace does not match the opened project');
    }
  }

  // ---- 書き込み（自分のopのみ） ----------------------------------------------

  /** エンティティ作成。IDを発行して返す */
  createEntity(kind: string, v: Record<string, unknown>): string {
    const prefix = ENTITY_PREFIX[kind];
    const id = prefix !== undefined ? newId(prefix) : `${kind}_${newId('ast').slice(4)}`;
    this.dispatch({ t: 'create', e: kind, id, v });
    return id;
  }

  updateEntity(kind: string, id: string, patch: Record<string, unknown>): void {
    this.dispatch({ t: 'update', e: kind, id, v: patch });
  }

  deleteEntity(kind: string, id: string): void {
    this.dispatch({ t: 'delete', e: kind, id });
  }

  dispatch(input: DispatchInput): Op {
    this.assertMutationAllowed();
    // HLCの値は可変だが文字幅は固定なので、時計とseqを進めない純粋な候補で
    // 永続化される1行全体の上限を先に検証する。
    const prospectiveOp = cloneValidatedDispatchOp(input, {
      op: this.seq + 1,
      hlc: formatHlc(0, 0, this.actorId),
      actor: this.actorId,
      user: this.identity.userId,
    });
    if (prospectiveOp === null) throw new Error('store: invalid local operation');
    const prospectiveLine = serializeOps([prospectiveOp]);
    if (prospectiveLine.length - 1 > MAX_LINE_CHARS) {
      throw new Error('store: local operation line is too long');
    }

    const op: Op = {
      ...prospectiveOp,
      op: this.seq + 1,
      hlc: this.clock.tick(),
    };
    this.seq += 1;
    this.ops.push(op);
    this.recompute(false);
    this.enqueueAppend(`${this.dir}/ops/${this.actorId}.jsonl`, serializeOps([op]));
    this.notify();
    return op;
  }

  // ---- マージ（他人のopの取込） ----------------------------------------------

  /**
   * 外部opsを取り込む。差分のみをactorごとのログファイルへ追記保存し、レポートを返す。
   * 自分のログファイルには触れない（docs/02 §7）。
   */
  mergeExternal(incoming: readonly Op[]): MergeReport {
    this.assertMutationAllowed();
    const { newOps, report, stateAfter } = mergeOps(this.ops, incoming);
    if (newOps.length === 0) return report;

    for (const o of newOps) this.clock.observe(o.hlc);
    this.ops.push(...newOps);
    this.stateCache = stateAfter;

    // 自分のactorのopが外部から来た場合（同一人物の別コピー等）はseqを追従させる
    const ownMax = this.vector[this.actorId] ?? 0;
    if (ownMax > this.seq) this.seq = ownMax;

    const byActor = new Map<string, Op[]>();
    for (const o of newOps) {
      const arr = byActor.get(o.actor) ?? [];
      arr.push(o);
      byActor.set(o.actor, arr);
    }
    for (const [actor, ops] of byActor) {
      this.enqueueAppend(`${this.dir}/ops/${actor}.jsonl`, serializeOps(ops));
    }
    this.notify();
    return report;
  }

  /** 書き込みキューの完了を待つ（テスト・エクスポート前に使用） */
  async flush(): Promise<void> {
    for (;;) {
      if (this.activeDrain === null) {
        if (this.pendingCount() === 0) return;
        this.publishDurability('queued');
        this.startDrain();
      }
      const drain = this.activeDrain;
      if (drain === null) continue;
      await drain;
      if (this.pendingCount() === 0) return;
    }
  }

  // ---- 内部 -----------------------------------------------------------------

  private ingest(ops: Op[]): void {
    this.ops = ops;
    for (const o of ops) this.clock.observe(o.hlc);
    this.seq = this.vector[this.actorId] ?? 0;
    this.recompute();
  }

  private recompute(shouldNotify = true): void {
    // 全再導出。数千op規模では十分高速。肥大時はsnapshot+差分適用に切替（docs/02 §4.5）
    this.stateCache = reduce(this.ops);
    if (shouldNotify) this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.stateCache);
  }

  private enqueueAppend(path: string, text: string): void {
    this.pendingAppends.push({ path, text, bytes: textEncoder.encode(text) });
    if (this.durabilityValue.phase === 'failed') {
      this.publishDurability('failed', this.durabilityValue.retryable);
      return;
    }
    this.publishDurability(this.durabilityValue.phase === 'writing' ? 'writing' : 'queued');
    this.startDrain();
  }

  private startDrain(): void {
    if (this.activeDrain !== null || this.pendingCount() === 0) return;
    const drain = Promise.resolve().then(() => this.drainAppends());
    this.activeDrain = drain;
    void drain
      .catch(() => undefined)
      .finally(() => {
        if (this.activeDrain !== drain) return;
        this.activeDrain = null;
        if (this.pendingCount() === 0) {
          this.publishDurability('durable');
        } else if (this.durabilityValue.phase !== 'failed') {
          this.publishDurability('queued');
          this.startDrain();
        }
      });
  }

  private async drainAppends(): Promise<void> {
    while (this.pendingCount() > 0) {
      const next = this.pendingAppends[this.pendingHead];
      if (next === undefined) return;
      this.publishDurability('writing');
      try {
        await this.persistAppend(next);
      } catch (error) {
        this.publishDurability('failed', !(error instanceof DurableAppendDivergedError));
        throw error;
      }
      this.pendingHead += 1;
      if (this.pendingHead === this.pendingAppends.length) {
        this.pendingAppends.length = 0;
        this.pendingHead = 0;
      }
      this.publishDurability(this.pendingCount() === 0 ? 'durable' : 'queued');
    }
  }

  private async persistAppend(append: PendingAppend): Promise<void> {
    if (append.baseLength === undefined) {
      append.baseLength = this.durableLogLengths.get(append.path) ?? 0;
    }
    const baseLength = append.baseLength;
    const desiredLength = baseLength + append.bytes.length;

    if (append.attempted !== true) {
      append.attempted = true;
      try {
        await this.workspace.appendText(append.path, append.text);
      } catch (error) {
        await this.classifyAfterWrite(append, baseLength, desiredLength, error);
        return;
      }
      await this.classifyAfterWrite(
        append,
        baseLength,
        desiredLength,
        new Error(`store: durable append verification failed for ${append.path}`),
      );
      return;
    }

    const disposition = await this.inspectAppend(append, baseLength);
    if (disposition.kind === 'complete') {
      this.durableLogLengths.set(append.path, desiredLength);
      return;
    }
    if (disposition.kind === 'diverged') throw new DurableAppendDivergedError(append.path);

    try {
      if (disposition.kind === 'base') {
        await this.workspace.appendText(append.path, append.text);
      } else {
        await this.workspace.appendBytes(append.path, append.bytes.slice(disposition.additionOffset));
      }
    } catch (error) {
      await this.classifyAfterWrite(append, baseLength, desiredLength, error);
      return;
    }
    await this.classifyAfterWrite(
      append,
      baseLength,
      desiredLength,
      new Error(`store: durable append verification failed for ${append.path}`),
    );
  }

  private async classifyAfterWrite(
    append: PendingAppend,
    baseLength: number,
    desiredLength: number,
    originalError: unknown,
  ): Promise<void> {
    let disposition: AppendByteDisposition;
    try {
      disposition = await this.inspectAppend(append, baseLength);
    } catch {
      throw originalError;
    }
    if (disposition.kind === 'complete') {
      this.durableLogLengths.set(append.path, desiredLength);
      return;
    }
    if (disposition.kind === 'diverged') throw new DurableAppendDivergedError(append.path);
    throw originalError;
  }

  private async inspectAppend(
    append: PendingAppend,
    baseLength: number,
  ): Promise<AppendByteDisposition> {
    const tail = await this.workspace.readBytesFrom(append.path, baseLength);
    if (tail === null) return baseLength === 0 ? { kind: 'base' } : { kind: 'diverged' };
    if (tail.size < baseLength || tail.size !== baseLength + tail.data.length) {
      return { kind: 'diverged' };
    }
    return classifyAppendTail(tail.data, append.bytes);
  }

  private publishDurability(phase: DurableWritePhase, retryable = phase === 'failed'): void {
    const next = Object.freeze({
      phase,
      pending: this.pendingCount(),
      retryable,
    });
    if (
      next.phase === this.durabilityValue.phase &&
      next.pending === this.durabilityValue.pending &&
      next.retryable === this.durabilityValue.retryable
    ) {
      return;
    }
    this.durabilityValue = next;
    for (const fn of this.durabilityListeners) fn(next);
  }

  private pendingCount(): number {
    return this.pendingAppends.length - this.pendingHead;
  }
}

type AppendByteDisposition =
  | { readonly kind: 'base' }
  | { readonly kind: 'partial'; readonly additionOffset: number }
  | { readonly kind: 'complete' }
  | { readonly kind: 'diverged' };

function classifyAppendTail(
  current: Uint8Array,
  addition: Uint8Array,
): AppendByteDisposition {
  if (current.length === 0) return { kind: 'base' };
  if (current.length > addition.length) return { kind: 'diverged' };
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== addition[index]) return { kind: 'diverged' };
  }
  if (current.length === addition.length) return { kind: 'complete' };
  return { kind: 'partial', additionOffset: current.length };
}
