import { reject, type JsonObject, type JsonValue } from './values';

export type LifecycleRecord = JsonObject & (
  | { readonly state: 'active'; readonly eventId: string;
      readonly reason?: 'initial' | 'restore' | 'migrationResolution' | 'conflictResolution' }
  | { readonly state: 'deleted'; readonly eventId: string;
      readonly reason: 'userDelete' | 'replacement' | 'migrationResolution' | 'conflictResolution' });
export const lifecycleFields: readonly string[] = Object.freeze(['state', 'eventId', 'reason']);
const activeReasons = new Set(['initial', 'restore', 'migrationResolution', 'conflictResolution']);
const deletedReasons = new Set(['userDelete', 'replacement', 'migrationResolution', 'conflictResolution']);

/** Internal field checks on a tree already admitted by cloneCanonicalValue. */
export const recordObject = (item: JsonValue, path: readonly string[]): JsonObject =>
  item !== null && typeof item === 'object' && !Array.isArray(item) ? item as JsonObject : reject('type', path);
export const requiredField = (record: JsonObject, field: string, parent: readonly string[] = []): JsonValue =>
  Object.hasOwn(record, field) ? record[field]! : reject('missing', [...parent, field]);
export const logicalId = (item: JsonValue, prefix: string, path: readonly string[]): string =>
  typeof item === 'string' && new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(item) ? item : reject('id', path);
export function lifecycleValue(item: JsonValue): LifecycleRecord {
  const lifecycle = recordObject(item, ['lifecycle']), state = requiredField(lifecycle, 'state', ['lifecycle']);
  logicalId(requiredField(lifecycle, 'eventId', ['lifecycle']), 'evt', ['lifecycle', 'eventId']);
  if (state !== 'active' && state !== 'deleted') reject('value', ['lifecycle', 'state']);
  if (state === 'deleted' || Object.hasOwn(lifecycle, 'reason')) {
    const reason = requiredField(lifecycle, 'reason', ['lifecycle']);
    if (typeof reason !== 'string' || !(state === 'active' ? activeReasons : deletedReasons).has(reason)) reject('value', ['lifecycle', 'reason']);
  }
  return lifecycle as LifecycleRecord;
}
