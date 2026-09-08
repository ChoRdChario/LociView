/** Decoded-value guards only: no raw JSON, package, causal history or storage admission. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject { readonly [key: string]: JsonValue }
export interface ValueLimits {
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxStringScalars: number;
}
export interface ValidationIssue {
  readonly code: 'type' | 'key' | 'unicode' | 'canonical' | 'limit' | 'value' | 'missing' | 'id' | 'identity';
  readonly path: readonly (string | number)[];
}
export class DomainValidationError extends Error {
  readonly issue: ValidationIssue;
  constructor(code: ValidationIssue['code'], path: readonly (string | number)[]) {
    // Do not embed imported values, paths or filenames in diagnostic text.
    super(`Invalid domain value (${code})`); this.name = 'DomainValidationError';
    this.issue = Object.freeze({ code, path: Object.freeze([...path]) });
  }
}
export const reject = (code: ValidationIssue['code'], path: readonly (string | number)[]): never => {
  throw new DomainValidationError(code, path);
};
export const singleLineControls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

/** Count Unicode scalars without allocating an array; reject unpaired UTF-16 surrogates. */
export function scalarLength(text: string, limit: number, path: readonly (string | number)[]): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) reject('unicode', path);
    } else if (unit >= 0xdc00 && unit <= 0xdfff) reject('unicode', path);
    if (++count > limit) reject('limit', path);
  }
  return count;
}

/** Only a local command normalizes author input. Stored records must already be NFC. */
export function normalizeSceneName(input: string): string {
  if (typeof input !== 'string') return reject('type', ['name']);
  scalarLength(input, Number.MAX_SAFE_INTEGER, ['name']);
  const normalized = input.normalize('NFC');
  scalarLength(normalized, 256, ['name']);
  if (!normalized.trim() || singleLineControls.test(normalized)) reject('value', ['name']);
  return normalized;
}

const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Clone plain decoded JSON, preserving unknown data and freezing an independent
 * result. Inputs must not be host objects, proxies or CRDT library objects.
 * The caller bounds decoding/allocation before this point; limits below bound
 * traversal and the returned copy, not the memory already used by decoding.
 * No default limits imply a measured device/package guarantee.
 */
export function cloneCanonicalValue(input: unknown, limits: ValueLimits): JsonValue {
  if (![limits.maxNodes, limits.maxDepth, limits.maxStringScalars].every(n => Number.isSafeInteger(n) && n > 0) ||
      limits.maxNodes > 5_000_000 || limits.maxDepth > 32) reject('limit', []);
  let nodes = 0;
  const ancestors = new Set<object>();
  const text = (item: string, path: readonly (string | number)[]) => {
    scalarLength(item, limits.maxStringScalars, path);
    if (item !== item.normalize('NFC')) reject('canonical', path);
    return item;
  };
  const clone = (item: unknown, depth: number, path: readonly (string | number)[]): JsonValue => {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) return reject('limit', path);
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') return text(item, path);
    if (typeof item === 'number') return Number.isFinite(item) ? (Object.is(item, -0) ? 0 : item) : reject('value', path);
    if (typeof item !== 'object' || ancestors.has(item)) return reject('type', path);
    const array = Array.isArray(item), proto = Object.getPrototypeOf(item);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return reject('type', path);
    const keys = Reflect.ownKeys(item);
    const count = keys.length - (array ? 1 : 0);
    if (count > limits.maxNodes - nodes) return reject('limit', path);
    if (keys.some(key => typeof key !== 'string')) return reject('key', path);
    const property = (key: string, childPath: readonly (string | number)[]) => {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return reject('type', childPath);
      return clone(descriptor.value, depth + 1, childPath);
    };
    ancestors.add(item);
    try {
      if (array) {
        // Dense own-data arrays only: don't call inherited/accessor elements.
        const length = Object.getOwnPropertyDescriptor(item, 'length')!.value as number;
        if (count !== length) return reject('type', path);
        const out: JsonValue[] = [];
        for (let i = 0; i < length; i++) out.push(property(String(i), [...path, i]));
        return Object.freeze(out);
      }
      const out: Record<string, JsonValue> = Object.create(null);
      for (const key of keys as string[]) {
        if (dangerousKeys.has(key) || singleLineControls.test(key)) return reject('key', [...path, key]);
        text(key, [...path, key]);
        out[key] = property(key, [...path, key]);
      }
      return Object.freeze(out);
    } finally { ancestors.delete(item); }
  };
  return clone(input, 0, []);
}
