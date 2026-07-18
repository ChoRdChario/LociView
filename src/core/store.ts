// ProjectStore: 単方向フローの中枢 (docs/00 §5, docs/03 §4)
//   dispatch(操作) → 自分のログへ1行追記 → 状態を再導出 → 購読者へ通知
// 書き込みは自分のactorIdのファイルのみ。他人のログはマージ時に追加保存されるだけ。

import { HlcClock } from './hlc';
import { actorIdFrom, newId, type IdPrefix } from './ids';
import { parseOpsJsonl, serializeOps, type JsonlParseError } from './jsonl';
import { createManifest, parseManifest, type ProjectManifest } from './manifest';
import { mergeOps, type MergeReport } from './merge';
import { reduce, versionVector, type ProjectState } from './reduce';
import type { Op, OpType } from './schema';
import type { WorkspaceFS } from '../platform/fs';

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
  private writeQueue: Promise<void> = Promise.resolve();
  /** 起動時に読んだログの破損行（UIで警告表示する） */
  readonly loadErrors: { file: string; errors: JsonlParseError[] }[] = [];

  readonly actorId: string;

  private constructor(
    private readonly fs: WorkspaceFS,
    private readonly dir: string,
    readonly manifest: ProjectManifest,
    readonly identity: Identity,
  ) {
    this.actorId = actorIdFrom(identity.userId, identity.deviceId);
    this.clock = new HlcClock(this.actorId);
    this.stateCache = reduce([]);
  }

  // ---- ライフサイクル -------------------------------------------------------

  /** 新規プロジェクト作成。既定の表示セットと自分のprofileを添えて初期化する */
  static async create(fs: WorkspaceFS, dir: string, name: string, identity: Identity): Promise<ProjectStore> {
    const manifest = createManifest(name);
    await fs.writeText(`${dir}/lociview.json`, JSON.stringify(manifest, null, 2));
    const store = new ProjectStore(fs, dir, manifest, identity);
    store.createEntity('set', { name: '標準', order: 1 });
    store.dispatch({
      t: 'create',
      e: 'profile',
      id: identity.userId,
      v: { displayName: identity.displayName ?? '', defaultPinColor: '#eab308' },
    });
    await store.flush();
    return store;
  }

  /** 既存プロジェクトを開く。全opsを読み、時計を観測済み最大値まで進める */
  static async open(fs: WorkspaceFS, dir: string, identity: Identity): Promise<ProjectStore> {
    const manifestText = await fs.readText(`${dir}/lociview.json`);
    if (manifestText === null) throw new Error(`store: no manifest in ${dir}`);
    const manifest = parseManifest(manifestText);
    const store = new ProjectStore(fs, dir, manifest, identity);

    const opsFiles = await fs.list(`${dir}/ops/`);
    const all: Op[] = [];
    for (const file of opsFiles) {
      if (!file.endsWith('.jsonl')) continue;
      const text = await fs.readText(file);
      if (text === null) continue;
      const { ops, errors } = parseOpsJsonl(text);
      if (errors.length > 0) store.loadErrors.push({ file, errors });
      all.push(...ops);
    }
    store.ingest(all);
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

  subscribe(fn: (state: ProjectState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
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
    const op: Op = {
      op: ++this.seq,
      hlc: this.clock.tick(),
      actor: this.actorId,
      user: this.identity.userId,
      t: input.t,
      e: input.e,
      id: input.id,
      ...(input.v !== undefined ? { v: input.v } : {}),
    };
    this.ops.push(op);
    this.recompute();
    this.enqueueAppend(`${this.dir}/ops/${this.actorId}.jsonl`, serializeOps([op]));
    return op;
  }

  // ---- マージ（他人のopの取込） ----------------------------------------------

  /**
   * 外部opsを取り込む。差分のみをactorごとのログファイルへ追記保存し、レポートを返す。
   * 自分のログファイルには触れない（docs/02 §7）。
   */
  mergeExternal(incoming: readonly Op[]): MergeReport {
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
    await this.writeQueue;
  }

  // ---- 内部 -----------------------------------------------------------------

  private ingest(ops: Op[]): void {
    this.ops = ops;
    for (const o of ops) this.clock.observe(o.hlc);
    this.seq = this.vector[this.actorId] ?? 0;
    this.recompute();
  }

  private recompute(): void {
    // 全再導出。数千op規模では十分高速。肥大時はsnapshot+差分適用に切替（docs/02 §4.5）
    this.stateCache = reduce(this.ops);
    this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.stateCache);
  }

  private enqueueAppend(path: string, text: string): void {
    this.writeQueue = this.writeQueue.then(() => this.fs.appendText(path, text));
  }
}
