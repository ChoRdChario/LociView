// マージ (docs/02 §7) とマージレポート (docs/05 §3.4)
// マージ = 既知opとの差分抽出 + 和集合reduce。破壊的操作は存在しない。
// レポートは「何が増え、何が変わり、どの自動解決が起きたか」を人間可読に列挙する。

import { compareHlc } from './hlc';
import { cloneValidatedOp, type Op } from './schema';
import { dedupeOps, isVisible, opKey, reduce, type ProjectState } from './reduce';

export interface EntityRef {
  kind: string;
  id: string;
}

export interface OverwriteInfo extends EntityRef {
  field: string;
  winnerUser: string;
  loserUser: string;
  winnerHlc: string;
  loserHlc: string;
}

export interface MergeReport {
  created: EntityRef[];
  updated: EntityRef[];
  deleted: EntityRef[];
  revived: EntityRef[];
  /** 取込側の書き込みが既存値（別ユーザー）を上書きしたフィールド */
  overwritten: OverwriteInfo[];
  /** 取込側の書き込みが既存のより新しい値（別ユーザー）に敗れたフィールド */
  rejected: OverwriteInfo[];
}

export interface MergeResult {
  /** 既知でなかったopのみ（これを自分のワークスペースに追加保存する） */
  newOps: Op[];
  report: MergeReport;
  stateAfter: ProjectState;
}

export function mergeOps(baseOps: readonly Op[], incomingOps: readonly Op[]): MergeResult {
  const base = cloneOperationBatch(baseOps, 'base');
  const incoming = cloneOperationBatch(incomingOps, 'incoming');
  const baseKeys = new Set(base.map(opKey));
  const newOps = dedupeOps(incoming).filter((o) => !baseKeys.has(opKey(o)));

  const before = reduce(base);
  const after = reduce([...base, ...newOps]);
  const report = buildReport(before, after, newOps);
  return { newOps, report, stateAfter: after };
}

function cloneOperationBatch(ops: readonly Op[], role: 'base' | 'incoming'): Op[] {
  const cloned: Op[] = [];
  for (const op of ops) {
    const validated = cloneValidatedOp(op);
    if (validated === null) throw new Error(`merge: invalid ${role} operation`);
    cloned.push(validated);
  }
  return cloned;
}

function buildReport(before: ProjectState, after: ProjectState, newOps: readonly Op[]): MergeReport {
  const report: MergeReport = {
    created: [],
    updated: [],
    deleted: [],
    revived: [],
    overwritten: [],
    rejected: [],
  };

  for (const [kind, idMap] of Object.entries(after.byKind)) {
    for (const [id, recAfter] of Object.entries(idMap)) {
      const recBefore = before.byKind[kind]?.[id];
      const visBefore = recBefore !== undefined && isVisible(recBefore);
      const visAfter = isVisible(recAfter);

      if (!visBefore && visAfter) {
        if (recBefore !== undefined && recBefore.deletedAt !== null) {
          report.revived.push({ kind, id });
        } else {
          report.created.push({ kind, id });
        }
        continue;
      }
      if (visBefore && !visAfter) {
        report.deleted.push({ kind, id });
        continue;
      }
      if (!visBefore && !visAfter) continue;

      // 両方可視: フィールド差分と自動解決の検出
      let changed = false;
      for (const [field, clockAfter] of Object.entries(recAfter.fieldClocks)) {
        const clockBefore = recBefore!.fieldClocks[field];
        if (clockBefore === clockAfter) continue;
        changed = true;
        const winnerUser = recAfter.fieldWriters[field] ?? '';
        const loserUser = clockBefore !== undefined ? (recBefore!.fieldWriters[field] ?? '') : '';
        if (clockBefore !== undefined && winnerUser !== loserUser) {
          report.overwritten.push({
            kind,
            id,
            field,
            winnerUser,
            loserUser,
            winnerHlc: clockAfter,
            loserHlc: clockBefore,
          });
        }
      }
      if (changed) report.updated.push({ kind, id });
    }
  }

  // 取込側が敗れた書き込み（既存の方が新しかったフィールド）
  for (const o of newOps) {
    if (o.t === 'delete' || !o.v) continue;
    const rec = after.byKind[o.e]?.[o.id];
    if (!rec) continue;
    for (const field of Object.keys(o.v)) {
      const winningClock = rec.fieldClocks[field];
      if (winningClock !== undefined && compareHlc(winningClock, o.hlc) > 0) {
        const winnerUser = rec.fieldWriters[field] ?? '';
        if (winnerUser !== o.user) {
          report.rejected.push({
            kind: o.e,
            id: o.id,
            field,
            winnerUser,
            loserUser: o.user,
            winnerHlc: winningClock,
            loserHlc: o.hlc,
          });
        }
      }
    }
  }

  return report;
}
