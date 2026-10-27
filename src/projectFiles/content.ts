import { inspectProjectImage, projectImageMime, freshPhotoSelectionIssue, type PhotoDecoder } from './photo';
import type { ProjectWorkspaceFS, WorkspaceReadableFile } from '../platform/fs';
import type { ContentRequest, ProjectContentVerifier } from '../domain/projectContentChecks';
import { checkContentFacts } from '../domain/projectContentChecks';
import { canonical, same } from '../domain/projectGraphSupport';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { PersistentContentVerifier } from '../projectMetadata/contentEvidence';
import { blobInventory } from '../projectMetadata/blobInventory';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { MetadataMediaPort } from '../projectMetadata/session';
import { digest, newId } from '../projectMetadata/persistence';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import { inspectValidationGlb, inspectValidationJpegGlb, inspectFreshValidationGlb, type ValidatedGlb } from './glb';
import { inspectOccurrenceGlb, inspectOccurrenceJpegGlb } from './glbOccurrences';
import { inspectPointPly, isPointModel, isGsModel, isGlbModel, pointSourceProfile, pointSourceMediaType, type ValidatedModel } from './pointPly';
import { gsSourceProfile, inspectGsPly, hasGsPlySignature } from './gsPly';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { fileError, fileObject, validationGlbProfile, occurrenceGlbProfile, jpegGlbProfile, occurrenceJpegGlbProfile, validationMetadataLimits, type FileValidationLimits } from './validation';
import { identityPlacement, prepareValidationModel, sealValidationRecord, validationFileLabel, type ValidationFile } from './initialProject';

export async function readValidationBody(file: WorkspaceReadableFile, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maxBytes) return fileError('保存した本体が検査の上限を超えています。');
  const bytes = new Uint8Array(file.size), reader = file.stream().getReader(); let offset = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break;
      if (!(next.value instanceof Uint8Array) || next.value.length > bytes.length - offset) return fileError('保存した本体の大きさが一致しません。');
      bytes.set(next.value, offset); offset += next.value.length;
    }
    if (offset !== file.size) return fileError('保存した本体が不足しています。');
    return bytes;
  } finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
}

/** Actual saved-content executor. A fixture/native profile cannot authorize this path. */
export class ValidationContent implements MetadataMediaPort {
  private readonly preparedImages = new Map<string, { record: JsonObject; bytes: Uint8Array; ref: StoredBlobRef }>();
  private readonly preparedModels = new Map<string, Awaited<ReturnType<typeof prepareValidationModel>>>();
  constructor(private readonly fs: ProjectWorkspaceFS, readonly store: OriginBlobStore,
    readonly limits: FileValidationLimits, private readonly decode?: PngDecoder,
    private readonly checkRead?: () => Promise<void>, private readonly jpeg?: JpegDecoder, private readonly photo?: PhotoDecoder) {}
  /** Owned input only; no body or Project write until the existing journal stages it. */
  async prepareImage(input: ValidationFile): Promise<JsonObject> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const label = validationFileLabel(input.label);
    if (!input.bytes.length || input.bytes.length > this.limits.maxFileBytes) return fileError('画像がこの検証の上限を超えています。');
    const bytes = input.bytes.slice(), issue = freshPhotoSelectionIssue(bytes); if (issue) return fileError(issue);
    const mediaType = await inspectProjectImage(bytes, this.limits, this.decode, this.jpeg, this.photo);
    const ref: StoredBlobRef = { algorithm: 'sha256', digest: await digest(bytes), byteLength: bytes.length, mediaType };
    const record = await sealValidationRecord('media-resource', { id: `med_${newId()}`, label, mediaKind: 'image', blob: ref as unknown as JsonObject });
    this.preparedImages.set(record.id as string, { record, bytes, ref });
    return cloneCanonicalValue(record, validationMetadataLimits) as JsonObject;
  }
  releasePreparedImages(): void { this.preparedImages.clear(); }
  releasePreparedModels(): void { this.preparedModels.clear(); }
  releasePreparedModel(id:string):void { this.preparedModels.delete(id); }
  async prepareModel(input: ValidationFile, assetId: string) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const prepared = await prepareValidationModel(input, this.limits, this.decode, assetId, this.jpeg);
    this.preparedModels.set(prepared.representation.id as string, prepared);
    const { body: _body, ...records } = prepared;
    return cloneCanonicalValue(records, validationMetadataLimits) as typeof records;
  }
  async prepareGsProxy(input: ValidationFile, assetId: string, familyId: string): Promise<JsonObject> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const p=await prepareValidationModel(input,this.limits,this.decode,assetId,this.jpeg);
    if(p.representation.role!=='meshPrimary') return fileError('位置指定用の面にはGLBを選択してください。');
    const {payloadDigest:_old,...raw}=p.representation;
    const representation=await sealValidationRecord('representation',{...raw,role:'interactionProxy',purposes:['interaction'],proxyForGsVariantFamilyId:familyId});
    this.preparedModels.set(representation.id as string,{...p,representation});return cloneCanonicalValue(representation,validationMetadataLimits) as JsonObject;
  }
  preparedModelRef(record: JsonObject): JsonObject { return { ...this.preparedModel(record).body.ref }; }
  private preparedModel(record: JsonObject) {
    const p = this.preparedModels.get(record.id as string);
    if (!p || !same(record, p.representation)) return fileError('追加するモデルの入力を確認できません。');
    return p;
  }
  async inspectPreparedModel(request: ContentRequest) {
    return this.execute(request, { model: await this.inspectModel(request.records[0]!, this.preparedModel(request.records[0]!).body.bytes.slice()) });
  }
  async stagePreparedModel(record: JsonObject): Promise<void> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const { body } = this.preparedModel(record);
    await this.store.put(new Blob([body.bytes.slice().buffer]).stream(), body.ref.mediaType, body.ref);
  }
  private modelDeclaration(record: JsonObject) { return validationModelDeclaration(record); }
  /** Kept GLB-specific for existing converter/decoder clients. */
  async model(record: JsonObject, readOnly = false): Promise<ValidatedGlb> {
    const result = await this.modelContent(record, readOnly); if (!isGlbModel(result)) return fileError('この経路ではGLBモデルを選択してください。'); return result;
  }
  async modelContent(record: JsonObject, readOnly = false): Promise<ValidatedModel> {
    await this.checkRead?.(); const blob = await this.modelDeclaration(record);
    const model = await this.inspectModel(record, await readValidationBody(await (readOnly ? this.store.openReadOnly(blob) : this.store.open(blob)), this.limits.maxFileBytes));
    await this.checkRead?.(); return model;
  }
  private imageDeclaration(record: JsonObject): JsonObject {
    const blob = fileObject(record.blob) as JsonObject;
    if (record.mediaKind !== 'image' || !projectImageMime(blob.mediaType)) return fileError('この画像形式にはまだ対応していません。');
    return blob;
  }
  async image(record: JsonObject, readOnly = false): Promise<Uint8Array> {
    await this.checkRead?.();
    const blob = this.imageDeclaration(record);
    const bytes = await readValidationBody(await (readOnly ? this.store.openReadOnly(blob) : this.store.open(blob)), this.limits.maxFileBytes);
    await this.inspectImage(bytes, blob); await this.checkRead?.(); return bytes;
  }
  private async inspectImage(bytes: Uint8Array, blob: JsonObject) {
    if (await inspectProjectImage(bytes, this.limits, this.decode, this.jpeg, this.photo) !== blob.mediaType) return fileError('画像の本体形式が一致しません。');
  }
  private inspectModel(record: JsonObject, bytes: Uint8Array) {
    return inspectDeclaredValidationModel(record, bytes, this.limits, this.decode, this.jpeg);
  }
  /** Original incoming record and immutable range, no ID allocation or storage/evidence writes. */
  async inspectReceived(input: ContentRequest, file: Blob) {
    const request = cloneCanonicalValue(input, validationMetadataLimits) as unknown as ContentRequest;
    if (request.records.length !== 1 || !(file instanceof Blob)) return fileError('受信する本体を確認できません。');
    const record = request.records[0]!, check = new ProjectRecordFields(); check.blob(record.blob!, []);
    if (check.unknown) return fileError('受信する本体の情報が不正です。');
    const ref = record.blob as JsonObject;
    if (file.size !== ref.byteLength || file.size <= 0 || file.size > this.limits.maxFileBytes) return fileError('受信する本体の大きさが不正です。');
    if (request.fact === 'media') this.imageDeclaration(record); else await this.modelDeclaration(record);
    const bytes = await readValidationBody({ size: file.size, stream: () => file.stream() }, this.limits.maxFileBytes);
    if (await digest(bytes) !== ref.digest) return fileError('受信する本体が一致しません。');
    if (request.fact === 'media') {
      await this.inspectImage(bytes, ref); return this.execute(request, { image: bytes });
    }
    return this.execute(request, { model: await this.inspectModel(record, bytes) });
  }
  /** Fresh facts for a new record reusing an already verified body; no receipt creation here. */
  inspectStored(request: ContentRequest) { return this.execute(request, undefined, true); }
  async inspectReceivedEquivalence(request: ContentRequest, file: Blob) {
    const gs=validationGsEquivalenceSource(request); if(!gs) return fileError('GSの同一表面を確認できません。');
    const ref=await this.modelDeclaration(gs);
    if(file.size!==ref.byteLength || file.size>this.limits.maxFileBytes) return fileError('GSの原本の大きさが一致しません。');
    const bytes=await readValidationBody(file,this.limits.maxFileBytes);
    if(await digest(bytes)!==ref.digest)return fileError('GSの原本が一致しません。');
    return this.execute(request,{model:await this.inspectModel(gs,bytes)});
  }
  async stageReceived(file: Blob, ref: JsonObject): Promise<void> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    await this.store.put(file.stream(), ref.mediaType as string, ref);
  }
  async stage(record: JsonObject, token: string): Promise<void> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const prepared = this.preparedImages.get(record.id as string);
    if (prepared) {
      if (!same(record, prepared.record)) return fileError('追加する画像の情報が一致しません。');
      await this.store.put(new Blob([prepared.bytes.slice().buffer]).stream(), prepared.ref.mediaType, prepared.ref);
    }
    // Existing catalog choices are already saved; new selections stage exact owned bytes.
    const result = await this.verifier(true).verify({ token, fact: 'media', records: [record], context: {} }) as { outcome: string };
    if (result.outcome !== 'verified') return fileError('追加する画像の保存を確認できません。');
  }
  async verify(blobs: readonly JsonObject[]): Promise<void> {
    for (const blob of blobs) {
      const bytes = await readValidationBody(await this.store.open(blob), this.limits.maxFileBytes);
      if (projectImageMime(blob.mediaType)) await this.inspectImage(bytes, blob);
      else if (blob.mediaType === 'model/gltf-binary') await inspectFreshValidationGlb(bytes, this.limits, this.decode, this.jpeg);
      else if (blob.mediaType === pointSourceMediaType) await (hasGsPlySignature(bytes) ? inspectGsPly(bytes, this.limits) : inspectPointPly(bytes, this.limits));
      else return fileError('追加する本体形式が不正です。');
    }
  }
  async inventory(blobs: readonly JsonObject[]): Promise<void> {
    for (const blob of blobs) if (await this.store.inspect(blob) !== 'verified-present') return fileError('受信ファイルの本体を確認できません。');
  }
  /** Project-owned fact witness. An unrelated origin's CAS body grants no media admission. */
  async retained(record: JsonObject): Promise<boolean> {
    return this.verifier(false).hasEvidence({ token: 'retained-media', fact: 'media', records: [record], context: {} });
  }
  verifier(allowNewEvidence: boolean): PersistentContentVerifier {
    const executor: ProjectContentVerifier = { scope: 'development-validation', verify: q => this.execute(q) };
    return new PersistentContentVerifier(this.fs, validationMetadataLimits, executor, 'validation-glb-png-executor-1',
      blobInventory(this.store, validationMetadataLimits), allowNewEvidence);
  }
  private async execute(input: ContentRequest, prepared?: { model?: ValidatedModel; image?: Uint8Array }, readOnly = false) {
    const request = cloneCanonicalValue(input, validationMetadataLimits) as unknown as ContentRequest;
    const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-validation', outcome, ...(facts ? { facts } : {}) });
    if(request.fact==='surface-equivalence') {
      const gs=validationGsEquivalenceSource(request); if(!gs)return response('unsupported');
      const decoded=prepared?.model ?? await this.modelContent(gs,readOnly); if(!isGsModel(decoded))return response('failed');
      const facts={equivalentVariantFamilyIds:request.context.targetVariantFamilyIds!};checkContentFacts(request,facts);return response('verified',facts);
    }
    if (request.records.length !== 1) return response('unsupported'); // No inferred equivalence or multi-output proof.
    const record = request.records[0]!;
    let facts: JsonObject;
    if (request.fact === 'media') {
      this.imageDeclaration(record); if (!prepared?.image) await this.image(record, readOnly);
      facts = { mediaKind: 'image', mediaType: this.imageDeclaration(record).mediaType! };
    } else if (request.fact === 'representation' || request.fact === 'family-envelope' || request.fact === 'family-contribution') {
      await this.modelDeclaration(record); // Prepared decoding never bypasses declared profile/role/transform checks.
      const decoded = prepared?.model ?? await this.modelContent(record, readOnly);
      if (!same(record.logicalBoundsAsset, decoded.bounds)) return response('failed');
      const slots = isGsModel(decoded) && record.materialCatalog === undefined ? [] : fileObject(record.materialCatalog).slots;
      if (!Array.isArray(slots) || slots.length !== decoded.materials.length) return response('failed');
      const actual = new Set(decoded.materials.map(canonical));
      for (const slot of slots) { const s = fileObject(slot); if (!actual.delete(canonical({ sourceLocator: s.sourceLocator, sourceSemantics: s.sourceSemantics } as JsonObject))) return response('failed'); }
      if (actual.size) return response('failed');
      facts = request.fact === 'representation' ? { contentKind: isGsModel(decoded) ? 'gaussianSplat' : isPointModel(decoded) ? 'pointCloud' : 'mesh', staticPose: true, contentBoundsAsset: decoded.bounds,
        materials: [...decoded.materials], surfaceRanges: [...decoded.surfaceRanges] } : request.fact === 'family-envelope' ?
        { logicalBoundsAsset: decoded.bounds, authority: { kind: same(record.purposes, ['display']) || record.role === 'interactionProxy' ? 'first-verified-output' : 'source', representationId: record.id!, payloadDigest: record.payloadDigest! } } :
        { verifiedMembers: [{ id: record.id!, payloadDigest: record.payloadDigest! }] };
    } else return response('unsupported');
    checkContentFacts(request, facts); return response('verified', facts);
  }
}

/** Closed proof of unchanged GS identity across Proxy-only revisions. */
export function validationGsEquivalenceSource(request: ContentRequest): JsonObject | null {
  if(request.fact!=='surface-equivalence' || Object.keys(request.context).sort().join('|')!=='assetId|classId|targetVariantFamilyIds')return null;
  const gs=request.records.filter(r=>r.role==='gsPrimary'), revisions=request.records.filter(r=>r.anchorCompatibilityClasses!==undefined);
  if(gs.length!==1 || revisions.length<2 || request.records.length!==revisions.length+1)return null;
  const source=gs[0]!;
  if(source.assetId!==request.context.assetId || !same(source.formatProfile,{id:'development-validation-gs-ply-f32le-sh0-4-1',specificationSha256:'e298cbb7b7202229ddfe4c834328854fc610109ccf38dbeb6a3f8d9d50954bee'}) || !same(request.context.targetVariantFamilyIds,[source.variantFamilyId!]))return null;
  for(const r of revisions) if(r.assetId!==source.assetId || !Array.isArray(r.representationIds) || !r.representationIds.includes(source.id!) || !Array.isArray(r.anchorCompatibilityClasses) ||
    !r.anchorCompatibilityClasses.some(c=>same(c,{id:request.context.classId!,targetVariantFamilyIds:request.context.targetVariantFamilyIds!})))return null;
  return source;
}

/** Exact input tuple shared by saved content and history-free viewing. No MIME/profile fallback. */
export async function validationModelDeclaration(record: JsonObject, use: 'saved' | 'review' = 'saved'): Promise<JsonObject> {
  const point = same(record.formatProfile, await pointSourceProfile());
  const gs = same(record.formatProfile, await gsSourceProfile());
  const proxy = record.role === 'interactionProxy' && (await Promise.all([validationGlbProfile(), jpegGlbProfile()])).some(p => same(record.formatProfile,p));
  const glb = (await Promise.all([validationGlbProfile(), occurrenceGlbProfile(), jpegGlbProfile(), occurrenceJpegGlbProfile()])).some(p => same(record.formatProfile, p));
  if ((!point && !glb && !gs) || record.contentKind !== (gs ? 'gaussianSplat' : point ? 'pointCloud' : 'mesh') || record.role !== (proxy ? 'interactionProxy' : gs ? 'gsPrimary' : point ? 'pointPrimary' : 'meshPrimary') ||
    !gs && !same(record.representationToAsset, { ...identityPlacement(), reflection: 'none' }) ||
    (proxy ? !same(record.purposes,['interaction']) : use === 'review' ? !same(record.purposes, ['display']) : !same(record.purposes, ['source', 'display']) && !same(record.purposes, ['display'])) ||
    use === 'saved' && !same(record.derivedFrom, [])) return fileError('保存したモデルの形式を確認できません。');
  const blob = fileObject(record.blob) as JsonObject;
  if (blob.mediaType !== (point || gs ? pointSourceMediaType : 'model/gltf-binary')) return fileError('保存したモデルの本体形式が一致しません。');
  return blob;
}
export async function inspectDeclaredValidationModel(record: JsonObject, bytes: Uint8Array, limits: FileValidationLimits,
  png?: PngDecoder, jpeg?: JpegDecoder, use: 'saved' | 'review' = 'saved'): Promise<ValidatedModel> {
  await validationModelDeclaration(record, use);
  if (same(record.formatProfile, await pointSourceProfile())) return inspectPointPly(bytes, limits);
  if (same(record.formatProfile, await gsSourceProfile())) return inspectGsPly(bytes, limits, { representationToAsset: record.representationToAsset as JsonObject, logicalBoundsAsset: record.logicalBoundsAsset as JsonObject });
  const inspect = same(record.formatProfile, await occurrenceJpegGlbProfile()) ? inspectOccurrenceJpegGlb :
    same(record.formatProfile, await jpegGlbProfile()) ? inspectValidationJpegGlb :
    same(record.formatProfile, await occurrenceGlbProfile()) ? inspectOccurrenceGlb : inspectValidationGlb;
  return inspect(bytes, limits, png, jpeg);
}
