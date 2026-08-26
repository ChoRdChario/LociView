// Undo/Redo（FR-14）— op-logの追記だけで実現する。
// undo = 逆向きの通常編集opを積む。履歴は消えず、マージしても安全。
// スタックはセッションローカル（このウィンドウで自分が行った操作のみが対象）。

import { isVisible } from '../core/reduce';
import { entityIdFor, type DispatchInput, type ProjectStore } from '../core/store';

interface UndoEntry {
  undo: DispatchInput[];
  redo: DispatchInput[];
}

const MAX_STACK = 200;

export class UndoManager {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];

  constructor(private readonly store: ProjectStore) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** エンティティ作成（IDを返す） */
  create(kind: string, v: Record<string, unknown>): string {
    const id = entityIdFor(kind);
    this.perform({
      redo: [{ t: 'create', e: kind, id, v }],
      undo: [{ t: 'delete', e: kind, id }],
    });
    return id;
  }

  update(kind: string, id: string, patch: Record<string, unknown>): void {
    const rec = this.store.state.byKind[kind]?.[id];
    const prev: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      // 既存値がない場合はnull（op-logにフィールド削除はないため、明示nullで戻す）
      prev[key] = rec !== undefined && key in rec.fields ? rec.fields[key] : null;
    }
    this.perform({
      redo: [{ t: 'update', e: kind, id, v: patch }],
      undo: [{ t: 'update', e: kind, id, v: prev }],
    });
  }

  delete(kind: string, id: string): void {
    const rec = this.store.state.byKind[kind]?.[id];
    // 復活はupdate-wins規則による（削除より新しいupdateがエンティティを蘇生する）
    const revive: DispatchInput[] =
      rec !== undefined && isVisible(rec)
        ? [{ t: 'update', e: kind, id, v: { ...rec.fields } }]
        : [];
    this.perform({
      redo: [{ t: 'delete', e: kind, id }],
      undo: revive,
    });
  }

  /** 複数操作を1回のUndo単位に束ねる（例: 新規セット作成+キャプション移動） */
  transaction(fn: (tx: UndoManager) => void): void {
    const collector = new UndoManager(this.store);
    fn(collector);
    const merged: UndoEntry = {
      redo: collector.undoStack.flatMap((e) => e.redo),
      undo: [...collector.undoStack].reverse().flatMap((e) => e.undo),
    };
    this.undoStack.push(merged);
    if (this.undoStack.length > MAX_STACK) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    this.store.assertMutationAllowed();
    const entry = this.undoStack.pop();
    if (entry === undefined) return;
    for (const input of entry.undo) this.store.dispatch(input);
    this.redoStack.push(entry);
  }

  redo(): void {
    this.store.assertMutationAllowed();
    const entry = this.redoStack.pop();
    if (entry === undefined) return;
    for (const input of entry.redo) this.store.dispatch(input);
    this.undoStack.push(entry);
  }

  private perform(entry: UndoEntry): void {
    for (const input of entry.redo) this.store.dispatch(input);
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_STACK) this.undoStack.shift();
    this.redoStack = [];
  }
}
