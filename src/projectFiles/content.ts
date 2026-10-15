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
import type { PngDecoder } from './png';
import { inspectValidationImage, type JpegDecoder } from './jpeg';
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
    private readonly checkRead?: () => Promise<void>, private readonly jpeg?: JpegDecoder) {}
  /** Owned input only; no body or Project write until the existing journal stages it. */
  async prepareImage(input: ValidationFile): Promise<JsonObject> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const label = validationFileLabel(input.label);
    if (!input.bytes.length || input.bytes.length > this.limits.maxFileBytes) return fileError('画像がこの検証の上限を超えています。');
    const bytes = input.bytes.slice(), mediaType = await inspectValidationImage(bytes, this.limits, this.decode, this.jpeg);
    const ref: StoredBlobRef = { algorithm: 'sha256', digest: await digest(bytes), byteLength: bytes.length, mediaType };
    const record = await sealValidationRecord('media-resource', { id: `med_${newId()}`, label, mediaKind: 'image', blob: ref as unknown as JsonObject });
    this.preparedImages.set(record.id as string, { record, bytes, ref });
    return cloneCanonicalValue(record, validationMetadataLimits) as JsonObject;
  }
  releasePreparedImages(): void { this.preparedImages.clear(); }
  releasePreparedModels(): void { this.preparedModels.clear(); }
  async prepareModel(input: ValidationFile, assetId: string) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const prepared = await prepareValidationModel(input, this.limits, this.decode, assetId, this.jpeg);
    this.preparedModels.set(prepared.representation.id as string, prepared);
    const { body: _body, ...records } = prepared;
    return cloneCanonicalValue(records, validationMetadataLimits) as typeof records;
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
  private async modelDeclaration(record: JsonObject): Promise<JsonObject> {
    if (!(await Promise.all([validationGlbProfile(), occurrenceGlbProfile(), jpegGlbProfile(), occurrenceJpegGlbProfile()])).some(p => same(record.formatProfile, p)) || record.contentKind !== 'mesh' || record.role !== 'meshPrimary' ||
      !same(record.representationToAsset, { ...identityPlacement(), reflection: 'none' }) ||
      !same(record.purposes, ['source', 'display']) && !same(record.purposes, ['display']) ||
      !same(record.derivedFrom, [])) return fileError('保存したモデルの形式を確認できません。');
    const blob = fileObject(record.blob) as JsonObject;
    if (blob.mediaType !== 'model/gltf-binary') return fileError('保存したモデルの本体形式が一致しません。');
    return blob;
  }
  async model(record: JsonObject, readOnly = false): Promise<ValidatedGlb> {
    await this.checkRead?.();
    const blob = await this.modelDeclaration(record);
    const model = await this.inspectModel(record, await readValidationBody(await (readOnly ? this.store.openReadOnly(blob) : this.store.open(blob)), this.limits.maxFileBytes));
    await this.checkRead?.(); return model;
  }
  private imageDeclaration(record: JsonObject): JsonObject {
    const blob = fileObject(record.blob) as JsonObject;
    if (record.mediaKind !== 'image' || blob.mediaType !== 'image/png' && blob.mediaType !== 'image/jpeg') return fileError('この画像形式にはまだ対応していません。');
    return blob;
  }
  async image(record: JsonObject, readOnly = false): Promise<Uint8Array> {
    await this.checkRead?.();
    const blob = this.imageDeclaration(record);
    const bytes = await readValidationBody(await (readOnly ? this.store.openReadOnly(blob) : this.store.open(blob)), this.limits.maxFileBytes);
    await this.inspectImage(bytes, blob); await this.checkRead?.(); return bytes;
  }
  private async inspectImage(bytes: Uint8Array, blob: JsonObject) {
    if (await inspectValidationImage(bytes, this.limits, this.decode, this.jpeg) !== blob.mediaType) return fileError('画像の本体形式が一致しません。');
  }
  private async inspectModel(record: JsonObject, bytes: Uint8Array) {
    const inspect = same(record.formatProfile, await occurrenceJpegGlbProfile()) ? inspectOccurrenceJpegGlb :
      same(record.formatProfile, await jpegGlbProfile()) ? inspectValidationJpegGlb :
      same(record.formatProfile, await occurrenceGlbProfile()) ? inspectOccurrenceGlb : inspectValidationGlb;
    return inspect(bytes, this.limits, this.decode, this.jpeg);
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
      if (blob.mediaType === 'image/png' || blob.mediaType === 'image/jpeg') await this.inspectImage(bytes, blob);
      else if (blob.mediaType === 'model/gltf-binary') await inspectFreshValidationGlb(bytes, this.limits, this.decode, this.jpeg);
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
  private async execute(input: ContentRequest, prepared?: { model?: ValidatedGlb; image?: Uint8Array }, readOnly = false) {
    const request = cloneCanonicalValue(input, validationMetadataLimits) as unknown as ContentRequest;
    const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-validation', outcome, ...(facts ? { facts } : {}) });
    if (request.records.length !== 1) return response('unsupported'); // No inferred equivalence or multi-output proof.
    const record = request.records[0]!;
    let facts: JsonObject;
    if (request.fact === 'media') {
      this.imageDeclaration(record); if (!prepared?.image) await this.image(record, readOnly);
      facts = { mediaKind: 'image', mediaType: this.imageDeclaration(record).mediaType! };
    } else if (request.fact === 'representation' || request.fact === 'family-envelope' || request.fact === 'family-contribution') {
      await this.modelDeclaration(record); // Prepared decoding never bypasses declared profile/role/transform checks.
      const decoded = prepared?.model ?? await this.model(record, readOnly);
      if (!same(record.logicalBoundsAsset, decoded.bounds)) return response('failed');
      const rawCatalog = fileObject(record.materialCatalog), slots = rawCatalog.slots;
      if (!Array.isArray(slots) || slots.length !== decoded.materials.length) return response('failed');
      const actual = new Set(decoded.materials.map(canonical));
      for (const slot of slots) { const s = fileObject(slot); if (!actual.delete(canonical({ sourceLocator: s.sourceLocator, sourceSemantics: s.sourceSemantics } as JsonObject))) return response('failed'); }
      if (actual.size) return response('failed');
      facts = request.fact === 'representation' ? { contentKind: 'mesh', staticPose: true, contentBoundsAsset: decoded.bounds,
        materials: [...decoded.materials], surfaceRanges: [...decoded.surfaceRanges] } : request.fact === 'family-envelope' ?
        { logicalBoundsAsset: decoded.bounds, authority: { kind: same(record.purposes, ['display']) ? 'first-verified-output' : 'source', representationId: record.id!, payloadDigest: record.payloadDigest! } } :
        { verifiedMembers: [{ id: record.id!, payloadDigest: record.payloadDigest! }] };
    } else return response('unsupported');
    checkContentFacts(request, facts); return response('verified', facts);
  }
}
