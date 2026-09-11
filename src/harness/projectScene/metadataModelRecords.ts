import { checkProjectRecord } from '../../domain/projectRecords';
import { ProjectRecordFields } from '../../domain/projectRecordFields';
import { object, list } from '../../domain/projectGraphSupport';
import type { JsonObject } from '../../domain/values';
import { canonicalFixture, fixtureRecordDigest, readFixtureModel } from './modelClosure';
import { syntheticPreparedVersions } from './modelFixture';

/** Exact two payloads and unchanged semantics; IDs may belong to an independent copy. */
export function knownMetadataRepresentation(record: JsonObject) {
  try {
    const guard = new ProjectRecordFields(); checkProjectRecord(guard, 'representationsById', record); if (guard.unknown) return;
    const catalog = object(record.materialCatalog), slots = list(catalog.slots); if (slots.length !== 1) return;
    for (const known of syntheticPreparedVersions) {
      const template = known.closure.representation;
      const payload = { ...template, id: record.id, assetId: record.assetId, representationFrameId: record.representationFrameId,
        variantFamilyId: record.variantFamilyId, materialCatalog: { ...template.materialCatalog, layoutId: catalog.layoutId,
          slots: [{ ...template.materialCatalog.slots[0], logicalMaterialSlotId: object(slots[0]).logicalMaterialSlotId }] } };
      const expected = { ...payload, payloadDigest: fixtureRecordDigest('representation', payload) };
      if (canonicalFixture(record) === canonicalFixture(expected)) return known;
    }
  } catch { /* Unknown, malformed or incomplete input is not an executable fixture. */ }
}

export function readMetadataModel(assetFrameId: string, binding: JsonObject, revision: JsonObject, representation: JsonObject) {
  const known = knownMetadataRepresentation(representation); if (!known) throw Error('保存したモデル本体を確認できません。');
  return readFixtureModel(canonicalFixture({ ...known.closure, assetFrame: { ...known.closure.assetFrame, id: assetFrameId },
    representationFrame: { ...known.closure.representationFrame, id: representation.representationFrameId }, binding, revision, representation }));
}
