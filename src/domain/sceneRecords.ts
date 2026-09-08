import { cloneCanonicalValue, DomainValidationError, reject, scalarLength, singleLineControls,
  type JsonObject, type ValidationIssue, type ValueLimits } from './values';
import { recordObject as object, requiredField as required, logicalId as id, lifecycleValue, lifecycleFields, type LifecycleRecord } from './recordFields';
export type { LifecycleRecord } from './recordFields';

export type SceneRecordKind = 'scene' | 'assetMembership' | 'captionMembership';
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
    const lifecycle = lifecycleValue(required(record, 'lifecycle'));
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
      Object.keys(lifecycle).some(field => !lifecycleFields.includes(field));
    return Object.freeze({ kind: 'valid-record', record: record as SceneRecordByKind[K], hasUnknownFields });
  } catch (error) {
    if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue });
    throw error;
  }
}
