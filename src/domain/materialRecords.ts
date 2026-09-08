import { validateMaterialIntent, type MaterialIntent } from './materialIntent';
import { lifecycleValue, lifecycleFields, logicalId, recordObject, requiredField, type LifecycleRecord } from './recordFields';
import { DomainValidationError, reject, type JsonObject, type ValueLimits } from './values';
import type { RecordAdmission } from './sceneRecords';

export type MaterialOverrideRecord = MaterialIntent & Readonly<{ id: string; lifecycle: LifecycleRecord;
  routing: JsonObject & Readonly<{
    scope: JsonObject & (Readonly<{ kind: 'project' }> | Readonly<{ kind: 'scene'; sceneId: string }>);
    target: JsonObject & Readonly<{ assetId: string; variantFamilyId: string; materialLayoutId: string; logicalMaterialSlotId: string }>;
  }> }>;
const unknown = (value: JsonObject, fields: readonly string[]): boolean => Object.keys(value).some(key => !fields.includes(key));
const targets = { assetId: 'ast', variantFamilyId: 'fam', materialLayoutId: 'lay', logicalMaterialSlotId: 'slot' } as const;

/** One persisted decoded record, not an active graph/renderer-ready material or authority to write/export. */
export function admitMaterialRecord(input: unknown, limits: ValueLimits, expectedMapKey?: string): RecordAdmission<MaterialOverrideRecord> {
  try {
    // This clones/freezes the entire record once, including unknown members, before field reads.
    const record = validateMaterialIntent(input, limits), key = logicalId(requiredField(record, 'id'), 'ovr', ['id']);
    if (expectedMapKey !== undefined && key !== expectedMapKey) reject('identity', ['id']);
    const lifecycle = lifecycleValue(requiredField(record, 'lifecycle'));
    const routing = recordObject(requiredField(record, 'routing'), ['routing']);
    const scope = recordObject(requiredField(routing, 'scope', ['routing']), ['routing', 'scope']);
    const kind = requiredField(scope, 'kind', ['routing', 'scope']);
    if (kind !== 'project' && kind !== 'scene') reject('value', ['routing', 'scope', 'kind']);
    if (kind === 'scene') logicalId(requiredField(scope, 'sceneId', ['routing', 'scope']), 'scn', ['routing', 'scope', 'sceneId']);
    else if (Object.hasOwn(scope, 'sceneId')) reject('value', ['routing', 'scope', 'sceneId']);
    const target = recordObject(requiredField(routing, 'target', ['routing']), ['routing', 'target']);
    for (const [field, prefix] of Object.entries(targets)) logicalId(requiredField(target, field, ['routing', 'target']), prefix, ['routing', 'target', field]);
    const a = record.appearance, c = record.compositing;
    const hasUnknownFields = unknown(record, ['id', 'routing', 'appearance', 'compositing', 'lifecycle']) ||
      unknown(lifecycle, lifecycleFields) || unknown(routing, ['scope', 'target']) || unknown(scope, kind === 'scene' ? ['kind', 'sceneId'] : ['kind']) ||
      unknown(target, Object.keys(targets)) || unknown(a, ['opacity', 'baseColorSrgb', 'lighting', 'doubleSided', 'chroma']) ||
      (a.chroma !== undefined && unknown(a.chroma, ['keyColorSrgb', 'tolerance', 'softness'])) || unknown(c, ['coverage', 'optics']) ||
      unknown(c.coverage, ['policy', 'alphaCutoff']);
    return Object.freeze({ kind: 'valid-record', record: record as MaterialOverrideRecord, hasUnknownFields });
  } catch (error) {
    if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue });
    throw error;
  }
}
