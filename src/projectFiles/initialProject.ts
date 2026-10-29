import type { PhotoDecoder } from './photo';
import { inspectProjectMedia, type MediaDecoders } from './media';
import { immutableDigest } from '../domain/projectGraphSupport';
import { admitProjectRecords, projectRecordMaps } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { digest, newId, technicalId } from '../projectMetadata/persistence';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import { inspectFreshValidationGlb, validationGlbUsesJpeg } from './glb';
import { inspectPointPly, isPointPly, pointSourceProfile, pointSourceMediaType } from './pointPly';
import { hasGsPlySignature, inspectGsPly, gsSourceProfile, inspectGsPlyFile, captureGsBlob } from './gsPly';
import { classifyMeshSource, inspectMeshSource, meshSourceProfile } from './meshSource';
import { meshSourceDeclarations, meshSourceFormat } from '../domain/meshSource';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { PACKAGE_LIMITS } from '../projectPackage/contract';
import { checkFileLimits, fileError, validationGlbProfile, jpegGlbProfile, validationMetadataLimits, projectFilePolicy, type ProjectFilePolicyInput } from './validation';

export interface ValidationFile { readonly label: string; readonly bytes: Uint8Array; readonly file?: never }
export interface ValidationBlobFile { readonly label: string; readonly file: Blob; readonly bytes?: never }
export type ValidationModelFile = ValidationFile | ValidationBlobFile;
/** Same-source GS replacement only. Bounds are always recomputed from the new body. */
export interface GsModelPreparation { readonly representationToAsset: JsonObject }
export interface ValidationPackageFile { readonly label: string; readonly package: Blob }
export type ValidationByteBody = { readonly ref: StoredBlobRef; readonly bytes: Uint8Array; readonly file?: never };
export type ValidationBlobBody = { readonly ref: StoredBlobRef; readonly file: Blob; readonly bytes?: never };
export type ValidationBody = ValidationByteBody | ValidationBlobBody;
export interface PreparedValidationModel<B extends ValidationBody = ValidationByteBody> {
  readonly asset: JsonObject; readonly revision: JsonObject; readonly representation: JsonObject; readonly binding: JsonObject; readonly body: B;
}
export interface PreparedValidationProject<B extends ValidationBody = ValidationByteBody> {
  readonly records: JsonObject & { schema: JsonObject; identity: JsonObject };
  readonly blobs: readonly B[];
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

/** Own native input before awaits; GS and opted-in packages retain native views. */
export function validationModelFile(input: {label:string;file:Blob}, budget: ProjectFilePolicyInput): Promise<ValidationModelFile>;
export function validationModelFile(input: {label:string;file:Blob}, budget: ProjectFilePolicyInput, keepPackage: true, maxBufferedBytes?:number): Promise<ValidationModelFile | ValidationPackageFile>;
export async function validationModelFile(input: {label:string;file:Blob}, budget: ProjectFilePolicyInput, keepPackage=false, maxBufferedBytes?:number): Promise<ValidationModelFile | ValidationPackageFile> {
  const policy=projectFilePolicy(budget), limits=policy.nonGs;
  const name=input.label,file=captureGsBlob(input.file);
  if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>Math.max(policy.gs.maxFileBytes, keepPackage && policy.projectBodyBytes>limits.maxFileBytes ? PACKAGE_LIMITS.archiveBytes : limits.maxFileBytes))return fileError('選択したファイルがこの検証の上限を超えています。');
  const prefix=new Uint8Array(await file.slice(0,65536).arrayBuffer());
  if(isPointPly(prefix)&&hasGsPlySignature(prefix)){
    if(file.size>policy.gs.maxFileBytes)return fileError('GSが容量の上限を超えています。');
    return {label:name,file};
  }
  // Dispatch hint only: existing archive/conversion inspectors still admit all bytes.
  if(keepPackage&&prefix[0]===0x50&&prefix[1]===0x4b&&
    (prefix[2]===3&&prefix[3]===4||prefix[2]===5&&prefix[3]===6||prefix[2]===7&&prefix[3]===8))return {label:name,package:file};
  if(file.size>Math.min(limits.maxFileBytes,maxBufferedBytes ?? limits.maxFileBytes))return fileError('選択したファイルが容量の上限を超えています。');
  return {label:name,bytes:new Uint8Array(await file.arrayBuffer())};
}

export function prepareValidationModel(input: ValidationFile, budget: ProjectFilePolicyInput, decode?: PngDecoder, assetId?: string, jpeg?: JpegDecoder, gsContext?: GsModelPreparation): Promise<PreparedValidationModel>;
export function prepareValidationModel(input: ValidationModelFile, budget: ProjectFilePolicyInput, decode?: PngDecoder, assetId?: string, jpeg?: JpegDecoder, gsContext?: GsModelPreparation): Promise<PreparedValidationModel<ValidationBody>>;
export async function prepareValidationModel(input: ValidationModelFile, budget: ProjectFilePolicyInput, decode?: PngDecoder, assetId = fresh('ast'), jpeg?: JpegDecoder, gsContext?: GsModelPreparation): Promise<PreparedValidationModel<ValidationBody>> {
  const policy=projectFilePolicy(budget), limits=policy.nonGs;
  checkFileLimits(limits);
  const context = gsContext && cloneCanonicalValue(gsContext as unknown as JsonObject, validationMetadataLimits) as unknown as GsModelPreparation;
  if (context) {
    const fields = new ProjectRecordFields(); fields.transform(context.representationToAsset, [], true);
    if (fields.unknown || Object.keys(context).join(',') !== 'representationToAsset') return fileError('差し替えるGSの座標変換を確認してください。');
  }
  if (!/^ast_[0-9a-f]{32}$/.test(assetId)) return fileError('追加するモデルの識別情報を確認してください。');
  const name = validationFileLabel(input.label), file = input.file && captureGsBlob(input.file);
  if(!file&&input.bytes!.length>limits.maxFileBytes)return fileError('大きなGSは元ファイルから選択してください。');
  const ply = !!file || isPointPly(input.bytes!), gs = !!file || ply && hasGsPlySignature(input.bytes!), mesh=!gs?classifyMeshSource(input.bytes!):null,point = ply && !gs && !mesh;
  if (context && !gs) return fileError('差し替えにはGSファイルを選択してください。');
  const inspected = mesh?await inspectMeshSource(mesh,input.bytes!,limits,decode,jpeg):file ? await inspectGsPlyFile(file, policy.gs, context) : gs ? await inspectGsPly(input.bytes!, policy.gs, context) : point ? await inspectPointPly(input.bytes!, limits) : await inspectFreshValidationGlb(input.bytes!.slice(), limits, decode, jpeg);
  const ref: StoredBlobRef = { algorithm: 'sha256', digest: inspected.kind==='gs' ? inspected.digest : await digest(inspected.bytes), byteLength: inspected.kind==='gs' ? inspected.byteLength : inspected.bytes.length, mediaType: mesh?meshSourceDeclarations[mesh].mediaType:ply ? pointSourceMediaType : 'model/gltf-binary' };
  const body: ValidationBody = inspected.kind==='gs' && inspected.file ? {ref,file:inspected.file} : {ref,bytes:inspected.bytes!};
  const revisionId = fresh('rev'), representationId = fresh('rep'), bindingId = fresh('bnd');
  const familyId = fresh('fam'), compatibilityId = fresh('cmp'), layoutId = fresh('lay');
  const slots = inspected.materials.map(material => ({ ...material, logicalMaterialSlotId: fresh('slot') }))
    .sort((a, b) => a.logicalMaterialSlotId.localeCompare(b.logicalMaterialSlotId));
  const representation = await sealValidationRecord('representation', {
    id: representationId, assetId, representationFrameId: fresh('frm'), contentKind: gs ? 'gaussianSplat' : point ? 'pointCloud' : 'mesh', purposes: ['source', 'display'], role: gs ? 'gsPrimary' : point ? 'pointPrimary' : 'meshPrimary',
    variantFamilyId: familyId, formatProfile: await (mesh?meshSourceProfile(mesh):gs ? gsSourceProfile() : point ? pointSourceProfile() : validationGlbUsesJpeg(inspected.bytes!, limits) ? jpegGlbProfile() : validationGlbProfile()), blob: ref as unknown as JsonObject,
    representationToAsset: context?.representationToAsset ?? { ...identityPlacement(), reflection: 'none' }, logicalBoundsAsset: inspected.bounds,
    derivedFrom: [], ...(!gs ? { materialCatalog: { layoutId, slots } } : {}),
  });
  const revision = await sealValidationRecord('asset-revision', { id: revisionId, assetId, representationIds: [representationId],
    anchorCompatibilityClasses: [{ id: compatibilityId, targetVariantFamilyIds: [familyId] }],
    provenance: { origin: 'import', sourceMediaType: ref.mediaType, inputBlobDigests: [ref.digest] } });
  const binding = await sealValidationRecord('asset-binding-revision', { id: bindingId, assetId, assetRevisionId: revisionId,
    assetToProject: identityPlacement(), method: 'import' });
  const asset: JsonObject = { id: assetId, label: name, assetFrameId: fresh('frm'), status: { kind: 'ready', activeBindingId: bindingId },
    lifecycle: { state: 'active', reason: 'initial', eventId: fresh('evt') } };
  return { asset, revision, representation, binding, body };
}

/** New local identities from inspected files, never inferred from filenames or another Project. */
type ValidationProjectInput<F = ValidationFile> = { run: string; title: string; models: readonly F[]; media?: readonly ValidationFile[] };
export function prepareValidationProject(input: ValidationProjectInput, budget: ProjectFilePolicyInput, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder, mediaDecoders?:MediaDecoders): Promise<PreparedValidationProject>;
export function prepareValidationProject(input: ValidationProjectInput<ValidationModelFile>, budget: ProjectFilePolicyInput, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder, mediaDecoders?:MediaDecoders): Promise<PreparedValidationProject<ValidationBody>>;
export async function prepareValidationProject(input: ValidationProjectInput<ValidationModelFile>,
  budget: ProjectFilePolicyInput, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder, mediaDecoders?:MediaDecoders): Promise<PreparedValidationProject<ValidationBody>> {
  const policy=projectFilePolicy(budget), limits=policy.nonGs;
  checkFileLimits(limits);
  const run = technicalId(input.run), title = label(input.title), sceneId = fresh('scn'), frameId = fresh('frm');
  if (!input.models.length || input.models.length + (input.media?.length ?? 0) > limits.maxItems) return fileError('3Dモデルを選択してください。');
  const total = [...input.models, ...input.media ?? []].reduce((sum, file) => sum + (file.file ? file.file.size : file.bytes.byteLength), 0);
  if (!Number.isSafeInteger(total)) return fileError('選択したファイルの合計を確認してください。');
  // Native selections do not materialize the aggregate. Bound owned byte preparation separately.
  const ownedBytes=[...input.models,...input.media ?? []].reduce((n,f)=>n+(f.file ? 0 : f.bytes.byteLength),0);
  if(ownedBytes>limits.maxFileBytes)return fileError('選択したファイルの合計が容量の上限を超えています。');
  // Own the complete selection before decoding awaits; later caller edits cannot swap a file.
  const models: ValidationModelFile[] = input.models.map(file => file.file ? {label:label(file.label),file:captureGsBlob(file.file)} : {label:label(file.label),bytes:file.bytes.slice()});
  const media = (input.media ?? []).map(file => ({ label: label(file.label), bytes: file.bytes.slice() }));
  const records = Object.fromEntries(Object.keys(projectRecordMaps).map(k => [k, {}])) as Record<string, JsonValue>;
  const table = (map: keyof typeof projectRecordMaps) => records[map] as Record<string, JsonValue>;
  const add = (map: keyof typeof projectRecordMaps, record: JsonObject) => { table(map)[record.id as string] = record; };
  const active = () => ({ state: 'active', reason: 'initial', eventId: fresh('evt') });
  const blobs: ValidationBody[] = [];
  const blob = async (bytes: Uint8Array, mediaType: string): Promise<StoredBlobRef> => {
    const ref: StoredBlobRef = { algorithm: 'sha256', digest: await digest(bytes), byteLength: bytes.length, mediaType };
    blobs.push({ ref, bytes }); return ref;
  };
  records.schema = { major: 2, minor: 0 };
  records.identity = { projectId: `prj_${run}`, historyEpoch: fresh('hep'), lineageSeed: newId() + newId() };
  records.project = { title, defaultSceneId: sceneId, frame: { id: frameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'meters', metersPerProjectUnit: 1 } } };
  add('scenesById', { id: sceneId, name: 'シーン 1', orderKey: 'A', lifecycle: active() });
  for (const [index, file] of models.entries()) {
    const model = await prepareValidationModel(file, policy, decode, undefined, jpeg); blobs.push(model.body);
    if (model.representation.contentKind === 'gaussianSplat' || ['stl','ply','obj'].includes(meshSourceFormat(model.representation.formatProfile)??'')) records.project = { ...(records.project as JsonObject), frame: { id: frameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } } };
    add('representationsById', model.representation); add('assetRevisionsById', model.revision);
    add('assetBindingsById', model.binding); add('assetsById', model.asset);
    add('sceneAssetMembershipsById', { id: fresh('sam'), sceneId, assetId: model.asset.id!, orderKey: `A${index.toString(36).padStart(8, '0')}`, lifecycle: active() });
  }
  for (const file of media) {
    const name = label(file.label), bytes = file.bytes.slice(), {mediaKind,mediaType} = await inspectProjectMedia(bytes, limits, decode, jpeg, photo,mediaDecoders);
    const ref = await blob(bytes, mediaType);
    add('mediaResourcesById', await sealValidationRecord('media-resource', { id: fresh('med'), label: name, mediaKind, blob: ref as unknown as JsonObject }));
  }
  const sizes=new Map<string,number>();
  for(const body of blobs){const prior=sizes.get(body.ref.digest);if(prior!==undefined&&prior!==body.ref.byteLength)return fileError('本体の大きさが一致しません。');sizes.set(body.ref.digest,body.ref.byteLength);}
  if([...sizes.values()].reduce((n,size)=>n+size,0)>policy.projectBodyBytes)return fileError('モデルとメディアの合計が容量の上限を超えています。');
  const checked = admitProjectRecords(records, validationMetadataLimits);
  if (checked.kind !== 'valid-records' || checked.hasUnknownFields) return fileError('初期プロジェクトの内容を確認できません。');
  return { records: cloneCanonicalValue(checked.records, validationMetadataLimits) as PreparedValidationProject['records'], blobs };
}
