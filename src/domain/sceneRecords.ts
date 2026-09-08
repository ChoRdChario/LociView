import { cloneCanonicalValue, DomainValidationError, reject, scalarLength, singleLineControls,
  type JsonObject, type JsonValue, type ValidationIssue, type ValueLimits } from './values';

export type SceneRecordKind = 'scene' | 'assetMembership' | 'captionMembership';
export type LifecycleRecord = JsonObject & (
  | { readonly state: 'active'; readonly eventId: string;
      readonly reason?: 'initial' | 'restore' | 'migrationResolution' | 'conflictResolution' }
  | { readonly state: 'deleted'; readonly eventId: string;
      readonly reason: 'userDelete' | 'replacement' | 'migrationResolution' | 'conflictResolution' });
export type SceneRecord = JsonObject & { readonly id: string; readonly name: string;
  readonly orderKey: string; readonly defaultViewId?: string; readonly lifecycle: LifecycleRecord };
export type AssetMembershipRecord = JsonObject & { readonly id: string; readonly sceneId: string;
  readonly assetId: string; readonly orderKey: string; readonly lifecycle: LifecycleRecord };
export type CaptionMembershipRecord = JsonObject & { readonly id: string; readonly sceneId: string;
  readonly captionId: string; readonly orderKey: string; readonly lifecycle: LifecycleRecord };
export interface SceneRecordByKind {
  scene: SceneRecord;
  assetMembership: AssetMembershipRecord;
  captionMembership: CaptionMembershipRecord;
}
export type RecordAdmission<T> = Readonly<{ kind: 'valid-record'; record: T; hasUnknownFields: boolean }> |
  Readonly<{ kind: 'rejected'; issue: ValidationIssue }>;
const prefixes = { scene: 'scn', assetMembership: 'sam', captionMembership: 'scm' } as const;
const known = {
  scene: new Set(['id', 'name', 'orderKey', 'defaultViewId', 'lifecycle']),
  assetMembership: new Set(['id', 'sceneId', 'assetId', 'orderKey', 'lifecycle']),
  captionMembership: new Set(['id', 'sceneId', 'captionId', 'orderKey', 'lifecycle']),
};
const lifeFields = new Set(['state', 'eventId', 'reason']);
const activeReasons = new Set(['initial', 'restore', 'migrationResolution', 'conflictResolution']);
const deletedReasons = new Set(['userDelete', 'replacement', 'migrationResolution', 'conflictResolution']);
const object = (item: JsonValue, path: readonly string[]): JsonObject =>
  item !== null && typeof item === 'object' && !Array.isArray(item) ? item as JsonObject : reject('type', path);
const required = (record: JsonObject, field: string, parent: readonly string[] = []): JsonValue =>
  Object.hasOwn(record, field) ? record[field]! : reject('missing', [...parent, field]);
const id = (item: JsonValue, prefix: string, path: readonly string[]): string =>
  typeof item === 'string' && new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(item) ? item : reject('id', path);

/**
 * Individual persisted record shape only. Never confers Project/graph/history/
 * blob validity, fresh-ID provenance, edit authority or history-free permission.
 * Unknown minor members remain in the immutable result, including lifecycle.
 */
export function admitSceneRecord<K extends SceneRecordKind>(kind: K, input: unknown,
  limits: ValueLimits, expectedMapKey?: string): RecordAdmission<SceneRecordByKind[K]> {
  try {
    if (!Object.hasOwn(prefixes, kind)) reject('value', []);
    const record = object(cloneCanonicalValue(input, limits), []);
    const key = id(required(record, 'id'), prefixes[kind], ['id']);
    if (expectedMapKey !== undefined && key !== expectedMapKey) reject('identity', ['id']);
    const order = required(record, 'orderKey');
    if (typeof order !== 'string' || !/^[0-9A-Za-z]{1,64}$/.test(order)) reject('value', ['orderKey']);
    const lifecycle = object(required(record, 'lifecycle'), ['lifecycle']);
    const state = required(lifecycle, 'state', ['lifecycle']);
    id(required(lifecycle, 'eventId', ['lifecycle']), 'evt', ['lifecycle', 'eventId']);
    if (state !== 'active' && state !== 'deleted') reject('value', ['lifecycle', 'state']);
    if (state === 'deleted' || Object.hasOwn(lifecycle, 'reason')) {
      const reason = required(lifecycle, 'reason', ['lifecycle']);
      if (typeof reason !== 'string' || !(state === 'active' ? activeReasons : deletedReasons).has(reason))
        reject('value', ['lifecycle', 'reason']);
    }
    if (kind === 'scene') {
      const name = required(record, 'name');
      if (typeof name !== 'string') reject('type', ['name']);
      scalarLength(name as string, 256, ['name']);
      if (singleLineControls.test(name as string)) reject('value', ['name']);
      if (Object.hasOwn(record, 'defaultViewId')) id(record.defaultViewId!, 'view', ['defaultViewId']);
    } else {
      id(required(record, 'sceneId'), 'scn', ['sceneId']);
      const field = kind === 'assetMembership' ? 'assetId' : 'captionId';
      id(required(record, field), kind === 'assetMembership' ? 'ast' : 'cap', [field]);
    }
    const hasUnknownFields = Object.keys(record).some(field => !known[kind].has(field)) ||
      Object.keys(lifecycle).some(field => !lifeFields.has(field));
    return Object.freeze({ kind: 'valid-record', record: record as SceneRecordByKind[K], hasUnknownFields });
  } catch (error) {
    if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue });
    throw error;
  }
}
