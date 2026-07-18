// op-log の畳み込み (docs/02 §4.3, §4.4)
// - (actor, op) で重複排除 → hlc昇順で全順序化 → フィールド単位LWWで適用
// - 削除は tombstone。削除より新しい書き込みがあれば復活する（update-wins）
// - 入力集合が同じなら、投入順・分割によらず結果は同一（決定性）。tests/core/reduce.test.ts で担保

import { compareHlc } from './hlc';
import type { Op } from './schema';

export interface EntityRecord {
  id: string;
  kind: string;
  /** LWW適用後の現在値 */
  fields: Record<string, unknown>;
  /** フィールドごとの最終書き込みhlc */
  fieldClocks: Record<string, string>;
  /** フィールドごとの最終書き込みuser（マージレポート用） */
  fieldWriters: Record<string, string>;
  /** 最初のcreate（hlc / user）。監査表示用 */
  createdAt: string | null;
  createdBy: string | null;
  /** create/updateの最大hlc（可視性判定に使用） */
  lastWrite: string | null;
  /** deleteの最大hlc */
  deletedAt: string | null;
}

export interface ProjectState {
  /** kind → id → record。未知kindもそのまま保持する */
  byKind: Record<string, Record<string, EntityRecord>>;
}

export function opKey(o: Op): string {
  return `${o.actor}#${o.op}`;
}

export function dedupeOps(ops: readonly Op[]): Op[] {
  const seen = new Set<string>();
  const out: Op[] = [];
  for (const o of ops) {
    const k = opKey(o);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(o);
    }
  }
  return out;
}

/** hlc昇順の全順序。hlcはactorを含むため衝突は同一actor内のみ → seqでタイブレーク */
export function sortOps(ops: readonly Op[]): Op[] {
  return [...ops].sort(
    (a, b) =>
      compareHlc(a.hlc, b.hlc) ||
      (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0) ||
      a.op - b.op,
  );
}

export function reduce(ops: readonly Op[]): ProjectState {
  const sorted = sortOps(dedupeOps(ops));
  const byKind: ProjectState['byKind'] = {};

  for (const o of sorted) {
    const kindMap = (byKind[o.e] ??= {});
    const rec = (kindMap[o.id] ??= {
      id: o.id,
      kind: o.e,
      fields: {},
      fieldClocks: {},
      fieldWriters: {},
      createdAt: null,
      createdBy: null,
      lastWrite: null,
      deletedAt: null,
    });

    if (o.t === 'delete') {
      if (rec.deletedAt === null || compareHlc(o.hlc, rec.deletedAt) > 0) {
        rec.deletedAt = o.hlc;
      }
      continue;
    }

    if (o.t === 'create' && rec.createdAt === null) {
      rec.createdAt = o.hlc;
      rec.createdBy = o.user;
    }
    if (o.v) {
      for (const [k, val] of Object.entries(o.v)) {
        const prev = rec.fieldClocks[k];
        if (prev === undefined || compareHlc(o.hlc, prev) > 0) {
          rec.fields[k] = val;
          rec.fieldClocks[k] = o.hlc;
          rec.fieldWriters[k] = o.user;
        }
      }
    }
    if (rec.lastWrite === null || compareHlc(o.hlc, rec.lastWrite) > 0) {
      rec.lastWrite = o.hlc;
    }
  }

  return { byKind };
}

/** 可視性: 未削除、または削除より新しい書き込みがある（update-wins） */
export function isVisible(rec: EntityRecord): boolean {
  if (rec.deletedAt === null) return rec.lastWrite !== null;
  return rec.lastWrite !== null && compareHlc(rec.lastWrite, rec.deletedAt) > 0;
}

export function visibleEntities(state: ProjectState, kind: string): EntityRecord[] {
  return Object.values(state.byKind[kind] ?? {}).filter(isVisible);
}

export function getRecord(state: ProjectState, kind: string, id: string): EntityRecord | undefined {
  return state.byKind[kind]?.[id];
}

/** actor → 既知の最大seq（バージョンベクトル。snapshot.jsonとマージ差分抽出に使用） */
export function versionVector(ops: readonly Op[]): Record<string, number> {
  const vv: Record<string, number> = {};
  for (const o of ops) {
    if ((vv[o.actor] ?? 0) < o.op) vv[o.actor] = o.op;
  }
  return vv;
}
