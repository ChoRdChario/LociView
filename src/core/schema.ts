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

const ACTOR_PATTERN = /^a_[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{13}$/u;
const ULID_PATTERN = /^[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}$/u;
const USER_PATTERN = /^usr_[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}$/u;
const LOCIMYU_CAPTION_PATTERN = /^cap_LM[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{24}$/u;
const KNOWN_KIND_PREFIX: Readonly<Record<KnownEntityKind, string>> = Object.freeze({
  set: 'set',
  caption: 'cap',
  view: 'view',
  material: 'mat',
  asset: 'ast',
  meta: 'meta',
  profile: 'usr',
});
const HLC_COUNTER_PATTERN = /^[0-9a-f]{4}$/u;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const COMMON_KEYS = ['op', 'hlc', 'actor', 'user', 't', 'e', 'id'] as const;
const VALUE_KEYS = [...COMMON_KEYS, 'v'] as const;
const INVALID_JSON = Symbol('invalid-json');

type JsonClone = null | boolean | number | string | JsonClone[] | { [key: string]: JsonClone };

function isUnicodeScalarText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function cloneJsonValue(
  value: unknown,
  ancestors: Set<object>,
  requireUnicodeScalarText: boolean,
): JsonClone | typeof INVALID_JSON {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return !requireUnicodeScalarText || isUnicodeScalarText(value) ? value : INVALID_JSON;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : INVALID_JSON;
  if (typeof value !== 'object') return INVALID_JSON;
  if (ancestors.has(value)) return INVALID_JSON;

  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype)) {
    return INVALID_JSON;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return INVALID_JSON;

  ancestors.add(value);
  try {
    if (isArray) {
      const itemKeys = ownKeys.filter((key) => key !== 'length') as string[];
      if (itemKeys.length !== value.length) return INVALID_JSON;
      const out: JsonClone[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
          return INVALID_JSON;
        }
        const item = cloneJsonValue(descriptor.value, ancestors, requireUnicodeScalarText);
        if (item === INVALID_JSON) return INVALID_JSON;
        out.push(item);
      }
      return out;
    }

    const out: { [key: string]: JsonClone } = {};
    const normalizedKeys = new Set<string>();
    for (const key of ownKeys as string[]) {
      if (DANGEROUS_KEYS.has(key)) return INVALID_JSON;
      if (requireUnicodeScalarText && !isUnicodeScalarText(key)) return INVALID_JSON;
      const normalized = key.normalize('NFC');
      if (normalizedKeys.has(normalized)) return INVALID_JSON;
      normalizedKeys.add(normalized);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
        return INVALID_JSON;
      }
      const item = cloneJsonValue(descriptor.value, ancestors, requireUnicodeScalarText);
      if (item === INVALID_JSON) return INVALID_JSON;
      out[key] = item;
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

/** Decoded JSON objectを検証し、呼出側から独立したordinary objectを返す。 */
export function cloneValidatedJsonObject(
  value: unknown,
  requireUnicodeScalarText = false,
): Record<string, unknown> | null {
  try {
    const cloned = cloneJsonValue(value, new Set(), requireUnicodeScalarText);
    return cloned === INVALID_JSON || !isPlainObject(cloned)
      ? null
      : cloned as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasExactKeys(o: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(o);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(o, key));
}

function hasCanonicalHlc(hlc: string, actor: string): boolean {
  const iso = hlc.slice(0, 24);
  const counter = hlc.slice(25, 29);
  if (hlc !== `${iso}-${counter}-${actor}` || !HLC_COUNTER_PATTERN.test(counter)) return false;
  const physical = Date.parse(iso);
  if (!Number.isFinite(physical)) return false;
  try {
    return new Date(physical).toISOString() === iso;
  } catch {
    return false;
  }
}

/**
 * JSONとして復元可能なv1 operationを検証し、呼出側から独立したコピーを返す。
 * raw JSON の重複キー検出、field policy、既知ID/user policy、resource budgetは別境界。
 */
export function cloneValidatedOp(x: unknown): Op | null {
  try {
    const o = cloneValidatedJsonObject(x, true);
    if (o === null) return null;
    if (o.t !== 'create' && o.t !== 'update' && o.t !== 'delete') return null;
    const expectedKeys = o.t === 'delete' ? COMMON_KEYS : VALUE_KEYS;
    if (!hasExactKeys(o, expectedKeys)) return null;
    if (typeof o.op !== 'number' || !Number.isSafeInteger(o.op) || o.op < 1) return null;
    if (typeof o.actor !== 'string' || !ACTOR_PATTERN.test(o.actor)) return null;
    if (typeof o.hlc !== 'string' || !hasCanonicalHlc(o.hlc, o.actor)) return null;
    if (typeof o.user !== 'string' || o.user.length > LIMITS.maxUserLen) return null;
    if (
      typeof o.e !== 'string' ||
      o.e.length < 1 ||
      o.e.length > LIMITS.maxKindLen ||
      DANGEROUS_KEYS.has(o.e)
    ) return null;
    if (
      typeof o.id !== 'string' ||
      o.id.length < 1 ||
      o.id.length > LIMITS.maxIdLen ||
      DANGEROUS_KEYS.has(o.id)
    ) return null;
    if (o.t !== 'delete') {
      if (!isPlainObject(o.v) || Object.keys(o.v).length > LIMITS.maxFieldsPerOp) return null;
    }
    return o as unknown as Op;
  } catch {
    return null;
  }
}

const DISALLOWED_SINGLE_LINE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const DISALLOWED_CAPTION_BODY = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u;

export function isPortableSingleLineText(value: unknown): value is string {
  return typeof value === 'string' && !DISALLOWED_SINGLE_LINE.test(value);
}

export function isPortableCaptionBodyText(value: unknown): value is string {
  return typeof value === 'string' && !DISALLOWED_CAPTION_BODY.test(value);
}

export function replacePortableSingleLineControls(value: string, replacement: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu, replacement);
}

function optionalSingleLine(fields: Readonly<Record<string, unknown>>, key: string): boolean {
  return !Object.hasOwn(fields, key) || isPortableSingleLineText(fields[key]);
}

function optionalSingleLineArray(fields: Readonly<Record<string, unknown>>, key: string): boolean {
  if (!Object.hasOwn(fields, key)) return true;
  const value = fields[key];
  return Array.isArray(value) && value.every(isPortableSingleLineText);
}

function finiteVec3(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function optionalCaptionAnchor(fields: Readonly<Record<string, unknown>>): boolean {
  if (!Object.hasOwn(fields, 'anchor') || fields.anchor === null) return true;
  if (!isPlainObject(fields.anchor)) return false;
  const anchor = fields.anchor;
  if (Object.hasOwn(anchor, 'modelAssetId') && !isPortableSingleLineText(anchor.modelAssetId)) return false;
  if (Object.hasOwn(anchor, 'position') && !finiteVec3(anchor.position)) return false;
  if (Object.hasOwn(anchor, 'normal') && !finiteVec3(anchor.normal)) return false;
  return true;
}

function optionalCameraState(fields: Readonly<Record<string, unknown>>): boolean {
  if (!Object.hasOwn(fields, 'cameraState')) return true;
  const value = fields.cameraState;
  if (!isPlainObject(value)) return false;
  if (!finiteVec3(value.eye) || !finiteVec3(value.target) || !finiteVec3(value.up)) return false;
  if (typeof value.fov !== 'number' || !Number.isFinite(value.fov) || value.fov <= 1 || value.fov >= 179) return false;
  return typeof value.ortho === 'boolean';
}

/**
 * Active-state policy for known v1 fields. Unknown fields remain exact forward-
 * compatible evidence and are deliberately not filtered recursively.
 */
export function isCandidateV1OperationActive(op: Op): boolean {
  if (op.user !== '' && !USER_PATTERN.test(op.user)) return false;
  if (KNOWN_ENTITY_KINDS.includes(op.e as KnownEntityKind)) {
    const prefix = KNOWN_KIND_PREFIX[op.e as KnownEntityKind];
    const historicalLociMyu = op.e === 'caption' && LOCIMYU_CAPTION_PATTERN.test(op.id);
    const canonicalPrefix = `${prefix}_`;
    if (!historicalLociMyu && (
      !op.id.startsWith(canonicalPrefix) ||
      !ULID_PATTERN.test(op.id.slice(canonicalPrefix.length))
    )) return false;
  }
  if (op.v === undefined) return true;
  switch (op.e) {
    case 'set':
      return optionalSingleLine(op.v, 'name');
    case 'caption':
      return optionalSingleLine(op.v, 'setId') &&
        optionalSingleLine(op.v, 'title') &&
        (!Object.hasOwn(op.v, 'body') || isPortableCaptionBodyText(op.v.body)) &&
        optionalSingleLine(op.v, 'color') &&
        optionalSingleLineArray(op.v, 'tags') &&
        optionalSingleLineArray(op.v, 'attachments') &&
        optionalCaptionAnchor(op.v);
    case 'view':
      return optionalSingleLine(op.v, 'setId') &&
        optionalSingleLine(op.v, 'name') &&
        optionalSingleLine(op.v, 'background') &&
        optionalCameraState(op.v);
    case 'material':
      return optionalSingleLine(op.v, 'setId') &&
        optionalSingleLine(op.v, 'modelAssetId') &&
        optionalSingleLine(op.v, 'materialKey');
    case 'asset':
      return optionalSingleLine(op.v, 'kind') &&
        optionalSingleLine(op.v, 'path') &&
        optionalSingleLine(op.v, 'optimizedPath') &&
        optionalSingleLine(op.v, 'originalName') &&
        optionalSingleLine(op.v, 'mime');
    case 'profile':
      return optionalSingleLine(op.v, 'displayName') &&
        optionalSingleLine(op.v, 'defaultPinColor');
    default:
      return true;
  }
}

/**
 * Local dispatch input is a smaller closed envelope than a persisted operation.
 * Clone it before combining it with store-owned sequence/clock metadata so extra
 * members, accessors and caller aliases cannot bypass the persisted-op gate.
 */
export function cloneValidatedDispatchOp(
  x: unknown,
  metadata: Pick<Op, 'op' | 'hlc' | 'actor' | 'user'>,
): Op | null {
  try {
    const input = cloneValidatedJsonObject(x);
    if (input === null) return null;
    if (input.t !== 'create' && input.t !== 'update' && input.t !== 'delete') return null;
    const expectedKeys = input.t === 'delete' ? ['t', 'e', 'id'] : ['t', 'e', 'id', 'v'];
    if (!hasExactKeys(input, expectedKeys)) return null;
    return cloneValidatedOp({ ...metadata, ...input });
  } catch {
    return null;
  }
}

/** 構造検証。falseの行は取込時にスキップし警告する（例外は投げない） */
export function validateOp(x: unknown): x is Op {
  return cloneValidatedOp(x) !== null;
}
