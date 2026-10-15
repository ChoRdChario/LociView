import { inspectProjectImage, type PhotoDecoder } from './photo';
import { immutableDigest } from '../domain/projectGraphSupport';
import { admitProjectRecords, projectRecordMaps } from '../domain/projectRecords';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { digest, newId, technicalId } from '../projectMetadata/persistence';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import { inspectFreshValidationGlb, validationGlbUsesJpeg } from './glb';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { checkFileLimits, fileError, validationGlbProfile, jpegGlbProfile, validationMetadataLimits, type FileValidationLimits } from './validation';

export interface ValidationFile { readonly label: string; readonly bytes: Uint8Array }
export interface PreparedValidationProject {
  readonly records: JsonObject & { schema: JsonObject; identity: JsonObject };
  readonly blobs: readonly { readonly ref: StoredBlobRef; readonly bytes: Uint8Array }[];
}
export const sealValidationRecord = async (kind: string, record: JsonObject): Promise<JsonObject> =>
  ({ ...record, payloadDigest: await immutableDigest(kind, record) });
export const validationFileLabel = (input: string) => {
  if (typeof input !== 'string') return fileError('名前を入力してください。');
  const result = input.normalize('NFC').trim();
  if (!result || [...result].length > 256 || /[\u0000-\u001f\u007f]/u.test(result)) return fileError('名前は256文字以内の1行で入力してください。');
  return result;
};
const label = validationFileLabel;
const fresh = (prefix: string) => `${prefix}_${newId()}`;
export const identityPlacement = () => ({ translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });

export async function prepareValidationModel(input: ValidationFile, limits: FileValidationLimits, decode?: PngDecoder, assetId = fresh('ast'), jpeg?: JpegDecoder) {
  checkFileLimits(limits);
  if (!/^ast_[0-9a-f]{32}$/.test(assetId)) return fileError('追加するモデルの識別情報を確認してください。');
  const name = validationFileLabel(input.label), inspected = await inspectFreshValidationGlb(input.bytes.slice(), limits, decode, jpeg);
  const ref: StoredBlobRef = { algorithm: 'sha256', digest: await digest(inspected.bytes), byteLength: inspected.bytes.length, mediaType: 'model/gltf-binary' };
  const revisionId = fresh('rev'), representationId = fresh('rep'), bindingId = fresh('bnd');
  const familyId = fresh('fam'), compatibilityId = fresh('cmp'), layoutId = fresh('lay');
  const slots = inspected.materials.map(material => ({ ...material, logicalMaterialSlotId: fresh('slot') }))
    .sort((a, b) => a.logicalMaterialSlotId.localeCompare(b.logicalMaterialSlotId));
  const representation = await sealValidationRecord('representation', {
    id: representationId, assetId, representationFrameId: fresh('frm'), contentKind: 'mesh', purposes: ['source', 'display'], role: 'meshPrimary',
    variantFamilyId: familyId, formatProfile: await (validationGlbUsesJpeg(inspected.bytes, limits) ? jpegGlbProfile() : validationGlbProfile()), blob: ref as unknown as JsonObject,
    representationToAsset: { ...identityPlacement(), reflection: 'none' }, logicalBoundsAsset: inspected.bounds,
    derivedFrom: [], materialCatalog: { layoutId, slots },
  });
  const revision = await sealValidationRecord('asset-revision', { id: revisionId, assetId, representationIds: [representationId],
    anchorCompatibilityClasses: [{ id: compatibilityId, targetVariantFamilyIds: [familyId] }],
    provenance: { origin: 'import', sourceMediaType: ref.mediaType, inputBlobDigests: [ref.digest] } });
  const binding = await sealValidationRecord('asset-binding-revision', { id: bindingId, assetId, assetRevisionId: revisionId,
    assetToProject: identityPlacement(), method: 'import' });
  const asset: JsonObject = { id: assetId, label: name, assetFrameId: fresh('frm'), status: { kind: 'ready', activeBindingId: bindingId },
    lifecycle: { state: 'active', reason: 'initial', eventId: fresh('evt') } };
  return { asset, revision, representation, binding, body: { ref, bytes: inspected.bytes } };
}

/** New local identities from inspected files, never inferred from filenames or another Project. */
export async function prepareValidationProject(input: { run: string; title: string; models: readonly ValidationFile[]; media?: readonly ValidationFile[] },
  limits: FileValidationLimits, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder): Promise<PreparedValidationProject> {
  checkFileLimits(limits);
  const run = technicalId(input.run), title = label(input.title), sceneId = fresh('scn'), frameId = fresh('frm');
  if (!input.models.length || input.models.length + (input.media?.length ?? 0) > limits.maxItems) return fileError('3Dモデルを選択してください。');
  const total = [...input.models, ...input.media ?? []].reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (!Number.isSafeInteger(total) || total > limits.maxFileBytes) return fileError('選択したファイルの合計がこの検証の上限を超えています。');
  // Own the complete selection before decoding awaits; later caller edits cannot swap a file.
  const models = input.models.map(file => ({ label: label(file.label), bytes: file.bytes.slice() }));
  const media = (input.media ?? []).map(file => ({ label: label(file.label), bytes: file.bytes.slice() }));
  const records = Object.fromEntries(Object.keys(projectRecordMaps).map(k => [k, {}])) as Record<string, JsonValue>;
  const table = (map: keyof typeof projectRecordMaps) => records[map] as Record<string, JsonValue>;
  const add = (map: keyof typeof projectRecordMaps, record: JsonObject) => { table(map)[record.id as string] = record; };
  const active = () => ({ state: 'active', reason: 'initial', eventId: fresh('evt') });
  const blobs: { ref: StoredBlobRef; bytes: Uint8Array }[] = [];
  const blob = async (bytes: Uint8Array, mediaType: string): Promise<StoredBlobRef> => {
    const ref: StoredBlobRef = { algorithm: 'sha256', digest: await digest(bytes), byteLength: bytes.length, mediaType };
    blobs.push({ ref, bytes }); return ref;
  };
  records.schema = { major: 2, minor: 0 };
  records.identity = { projectId: `prj_${run}`, historyEpoch: fresh('hep'), lineageSeed: newId() + newId() };
  records.project = { title, defaultSceneId: sceneId, frame: { id: frameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'meters', metersPerProjectUnit: 1 } } };
  add('scenesById', { id: sceneId, name: '全体', orderKey: 'A', lifecycle: active() });
  for (const [index, file] of models.entries()) {
    const model = await prepareValidationModel(file, limits, decode, undefined, jpeg); blobs.push(model.body);
    add('representationsById', model.representation); add('assetRevisionsById', model.revision);
    add('assetBindingsById', model.binding); add('assetsById', model.asset);
    add('sceneAssetMembershipsById', { id: fresh('sam'), sceneId, assetId: model.asset.id!, orderKey: `A${index.toString(36).padStart(8, '0')}`, lifecycle: active() });
  }
  for (const file of media) {
    const name = label(file.label), bytes = file.bytes.slice(), mime = await inspectProjectImage(bytes, limits, decode, jpeg, photo);
    const ref = await blob(bytes, mime);
    add('mediaResourcesById', await sealValidationRecord('media-resource', { id: fresh('med'), label: name, mediaKind: 'image', blob: ref as unknown as JsonObject }));
  }
  const checked = admitProjectRecords(records, validationMetadataLimits);
  if (checked.kind !== 'valid-records' || checked.hasUnknownFields) return fileError('初期プロジェクトの内容を確認できません。');
  return { records: cloneCanonicalValue(checked.records, validationMetadataLimits) as PreparedValidationProject['records'], blobs };
}
