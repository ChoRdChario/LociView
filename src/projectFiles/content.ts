import type { ProjectWorkspaceFS, WorkspaceReadableFile } from '../platform/fs';
import type { ContentRequest, ProjectContentVerifier } from '../domain/projectContentChecks';
import { checkContentFacts } from '../domain/projectContentChecks';
import { canonical, same } from '../domain/projectGraphSupport';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { PersistentContentVerifier } from '../projectMetadata/contentEvidence';
import { blobInventory } from '../projectMetadata/blobInventory';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import type { MetadataMediaPort } from '../projectMetadata/session';
import { inspectValidationGlb, type ValidatedGlb } from './glb';
import { inspectValidationPng, type PngDecoder } from './png';
import { fileError, fileObject, validationGlbProfile, validationMetadataLimits, type FileValidationLimits } from './validation';
import { identityPlacement } from './initialProject';

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
  constructor(private readonly fs: ProjectWorkspaceFS, readonly store: OriginBlobStore,
    readonly limits: FileValidationLimits, private readonly decode?: PngDecoder) {}
  async model(record: JsonObject): Promise<ValidatedGlb> {
    if (!same(record.formatProfile, await validationGlbProfile()) || record.contentKind !== 'mesh' || record.role !== 'meshPrimary' ||
      !same(record.representationToAsset, { ...identityPlacement(), reflection: 'none' }) || !same(record.purposes, ['source', 'display']) ||
      !same(record.derivedFrom, [])) return fileError('保存したモデルの形式を確認できません。');
    const blob = fileObject(record.blob) as JsonObject;
    if (blob.mediaType !== 'model/gltf-binary') return fileError('保存したモデルの本体形式が一致しません。');
    return inspectValidationGlb(await readValidationBody(await this.store.open(blob), this.limits.maxFileBytes), this.limits, this.decode);
  }
  async image(record: JsonObject): Promise<Uint8Array> {
    const blob = fileObject(record.blob) as JsonObject;
    if (record.mediaKind !== 'image' || blob.mediaType !== 'image/png') return fileError('この検証版で扱える添付はPNGのみです。');
    const bytes = await readValidationBody(await this.store.open(blob), this.limits.maxFileBytes);
    await inspectValidationPng(bytes, this.limits, this.decode); return bytes;
  }
  async stage(record: JsonObject, token: string): Promise<void> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    // An explicit file preparation must have staged this exact blob first.
    const result = await this.verifier(true).verify({ token, fact: 'media', records: [record], context: {} }) as { outcome: string };
    if (result.outcome !== 'verified') return fileError('追加する画像の保存を確認できません。');
  }
  async verify(blobs: readonly JsonObject[]): Promise<void> {
    for (const blob of blobs) {
      if (blob.mediaType !== 'image/png') return fileError('追加する画像形式が不正です。');
      const bytes = await readValidationBody(await this.store.open(blob), this.limits.maxFileBytes);
      await inspectValidationPng(bytes, this.limits, this.decode);
    }
  }
  verifier(allowNewEvidence: boolean): ProjectContentVerifier {
    const executor: ProjectContentVerifier = { scope: 'development-validation', verify: q => this.execute(q) };
    return new PersistentContentVerifier(this.fs, validationMetadataLimits, executor, 'validation-glb-png-executor-1',
      blobInventory(this.store, validationMetadataLimits), allowNewEvidence);
  }
  private async execute(input: ContentRequest) {
    const request = cloneCanonicalValue(input, validationMetadataLimits) as unknown as ContentRequest;
    const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-validation', outcome, ...(facts ? { facts } : {}) });
    if (request.records.length !== 1) return response('unsupported'); // No inferred equivalence or multi-output proof.
    const record = request.records[0]!;
    let facts: JsonObject;
    if (request.fact === 'media') {
      await this.image(record); facts = { mediaKind: 'image', mediaType: 'image/png' };
    } else if (request.fact === 'representation' || request.fact === 'family-envelope' || request.fact === 'family-contribution') {
      const decoded = await this.model(record);
      if (!same(record.logicalBoundsAsset, decoded.bounds)) return response('failed');
      const rawCatalog = fileObject(record.materialCatalog), slots = rawCatalog.slots;
      if (!Array.isArray(slots) || slots.length !== decoded.materials.length) return response('failed');
      const actual = new Set(decoded.materials.map(canonical));
      for (const slot of slots) { const s = fileObject(slot); if (!actual.delete(canonical({ sourceLocator: s.sourceLocator, sourceSemantics: s.sourceSemantics } as JsonObject))) return response('failed'); }
      if (actual.size) return response('failed');
      facts = request.fact === 'representation' ? { contentKind: 'mesh', staticPose: true, contentBoundsAsset: decoded.bounds,
        materials: [...decoded.materials], surfaceRanges: [...decoded.surfaceRanges] } : request.fact === 'family-envelope' ?
        { logicalBoundsAsset: decoded.bounds, authority: { kind: 'source', representationId: record.id!, payloadDigest: record.payloadDigest! } } :
        { verifiedMembers: [{ id: record.id!, payloadDigest: record.payloadDigest! }] };
    } else return response('unsupported');
    checkContentFacts(request, facts); return response('verified', facts);
  }
}
