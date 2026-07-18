// op スキーマ (docs/02 §4.1)
// 未知のエンティティ種別・未知フィールドは検証を通し、保持して素通しする（docs/02 §9）。

export const KNOWN_ENTITY_KINDS = ['set', 'caption', 'view', 'material', 'asset', 'meta', 'profile'] as const;
export type KnownEntityKind = (typeof KNOWN_ENTITY_KINDS)[number];

export const OP_TYPES = ['create', 'update', 'delete'] as const;
export type OpType = (typeof OP_TYPES)[number];

export interface Op {
  /** actor内シーケンス番号（1始まり単調増加）。(actor, op) が opId */
  op: number;
  hlc: string;
  actor: string;
  /** 表示・集計用のuserId */
  user: string;
  t: OpType;
  /** エンティティ種別。未知の値も許容する（前方互換） */
  e: string;
  id: string;
  /** create: 全フィールド / update: 変更フィールドのみ / delete: なし */
  v?: Record<string, unknown>;
}

// 健全性ガード用の上限（docs/02 §8）
export const LIMITS = {
  maxIdLen: 128,
  maxActorLen: 64,
  maxUserLen: 64,
  maxKindLen: 32,
  maxHlcLen: 96,
  maxFieldsPerOp: 256,
} as const;

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
}

/** 構造検証。falseの行は取込時にスキップし警告する（例外は投げない） */
export function validateOp(x: unknown): x is Op {
  if (!isPlainObject(x)) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.op !== 'number' || !Number.isInteger(o.op) || o.op < 1 || o.op > Number.MAX_SAFE_INTEGER) return false;
  if (typeof o.hlc !== 'string' || o.hlc.length < 32 || o.hlc.length > LIMITS.maxHlcLen || o.hlc[23] !== 'Z') return false;
  if (typeof o.actor !== 'string' || o.actor.length < 1 || o.actor.length > LIMITS.maxActorLen) return false;
  if (typeof o.user !== 'string' || o.user.length > LIMITS.maxUserLen) return false;
  if (o.t !== 'create' && o.t !== 'update' && o.t !== 'delete') return false;
  if (typeof o.e !== 'string' || o.e.length < 1 || o.e.length > LIMITS.maxKindLen) return false;
  if (typeof o.id !== 'string' || o.id.length < 1 || o.id.length > LIMITS.maxIdLen) return false;
  if (o.v !== undefined) {
    if (!isPlainObject(o.v)) return false;
    if (Object.keys(o.v).length > LIMITS.maxFieldsPerOp) return false;
  }
  if ((o.t === 'create' || o.t === 'update') && o.v === undefined) return false;
  return true;
}
