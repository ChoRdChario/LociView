import type { ProjectWorkspaceFS } from '../../platform/fs';
import type { ContentRequest, ProjectContentVerifier } from '../../domain/projectContentChecks';
import type { JsonObject } from '../../domain/values';
import { PersistentContentVerifier, type VerifiedInventoryPort } from '../../projectMetadata/contentEvidence';
import { ProjectMetadataSource, type MetadataProof } from '../../projectMetadata/source';
import { digest, equalBytes, json, metadataPath, readReceipt, writeReceipt } from '../../projectMetadata/persistence';
import { metadataPreparedModels, metadataFixtureLimits as limits } from './metadataFixture';
import { canonicalFixture, fixtureModelBytes } from './modelClosure';
import { inspectProjectCandidates } from '../../domain/projectCandidates';
import { fixtureMedia, type MediaImage } from './mediaHistory';
import type { MetadataMediaPort } from '../../projectMetadata/session';

interface Seed { version: 'synthetic-metadata-1'; proof: MetadataProof; parts: { size: number; digest: string }[] }
export async function writeMetadataSeed(fs: ProjectWorkspaceFS, source: ProjectMetadataSource): Promise<void> {
  const parts = source.originalChanges(), manifest: Seed = { version: 'synthetic-metadata-1', proof: source.proof,
    parts: await Promise.all(parts.map(async bytes => ({ size: bytes.length, digest: await digest(bytes) }))) };
  await writeReceipt(fs, metadataPath(fs, 'seed/manifest.json'), manifest, limits);
  for (const [i, bytes] of parts.entries()) {
    const path = metadataPath(fs, `seed/${i}.amchange`), prior = await fs.readBytes(path);
    if (prior && !equalBytes(prior, bytes)) throw Error('作成途中の記録が一致しません。データは保持しています。');
    if (!prior) await fs.writeBytes(path, bytes);
  }
  const reopened = await readMetadataSeed(fs);
  if (reopened.token !== source.token) throw Error('初期記録の保存を確認できません。');
}
export async function readMetadataSeed(fs: ProjectWorkspaceFS): Promise<ProjectMetadataSource> {
  const manifest = await readReceipt<Seed>(fs, metadataPath(fs, 'seed/manifest.json'), limits);
  if (!manifest || Object.keys(manifest).sort().join(',') !== 'parts,proof,version' || manifest.version !== 'synthetic-metadata-1' ||
    !Array.isArray(manifest.parts) || manifest.parts.length !== 2) throw Error('作成途中の記録を確認できません。データは保持しています。');
  const parts: Uint8Array[] = [];
  for (const [i, part] of manifest.parts.entries()) {
    const path = metadataPath(fs, `seed/${i}.amchange`), file = await fs.readStream(path);
    if (Object.keys(part).sort().join(',') !== 'digest,size' || !Number.isSafeInteger(part.size) || part.size <= 0 ||
      part.size > limits.maxChangeBytes || file?.size !== part.size) throw Error('初期記録の一部を確認できません。データは保持しています。');
    const bytes = await fs.readBytes(path);
    if (!bytes || bytes.length !== part.size || await digest(bytes) !== part.digest) throw Error('初期記録の保存内容が一致しません。');
    parts.push(bytes);
  }
  return ProjectMetadataSource.reopen(parts, manifest.proof, limits);
}

/** Exact existing triangles and explicit known PNGs only; no general CAS/decoder or user-file admission. */
export class MetadataFixtureContent implements VerifiedInventoryPort, MetadataMediaPort {
  readonly counts = { bodyBytes: 0, inventoryChecks: 0, mediaBytes: 0 };
  readonly images: Record<string, MediaImage> = {};
  constructor(private readonly fs: ProjectWorkspaceFS) {}
  private bodyPath(hash: string) { return metadataPath(this.fs, `fixture-content/${hash}.bin`); }
  private inventoryPath(hash: string) { return metadataPath(this.fs, `fixture-inventory/${hash}.json`); }
  private known(record: JsonObject) { return metadataPreparedModels.find(m => json(m.closure.representation) === json(record)); }
  private knownMedia(record: JsonObject) { return fixtureMedia.find(m => json(m.record) === json(record)); }
  private mediaReceipt(record: typeof fixtureMedia[number]['record']) { return { version: 'synthetic-png-inventory-1', blob: record.blob }; }
  async stage(record: JsonObject, token: string): Promise<void> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const media = this.knownMedia(record); if (!media) throw Error('この経路では既知の合成画像だけを追加できます。');
    const bytes = Uint8Array.from(atob(media.base64), c => c.charCodeAt(0)), path = this.bodyPath(media.record.blob.digest);
    const prior = await this.fs.readBytes(path);
    if (prior && !equalBytes(prior, bytes)) throw Error('保存した画像が一致しません。上書きしていません。');
    if (!prior) await this.fs.writeBytes(path, bytes);
    const saved = await this.fs.readBytes(path);
    if (!saved || !equalBytes(saved, bytes) || await digest(saved) !== media.record.blob.digest) throw Error('画像の保存を確認できません。');
    await writeReceipt(this.fs, this.inventoryPath(media.record.blob.digest), this.mediaReceipt(media.record), limits);
    // New evidence permission is for this exact explicitly staged record only.
    const result = await this.mediaVerifier(true).verify({ token, fact: 'media', records: [record], context: {} }) as { outcome: string };
    if (result.outcome !== 'verified') throw Error('保存した画像の検証を完了できません。');
  }
  async verify(blobs: readonly JsonObject[]): Promise<void> {
    for (const blob of blobs) {
      const media = fixtureMedia.find(m => json(m.record.blob) === json(blob));
      if (!media || await this.inspect({ token: 'delta', fact: 'media', records: [media.record], context: {} }) !== 'verified-present')
        throw Error('保存した画像を確認できません。元のデータは保持しています。');
      await this.loadImage(media!);
    }
  }
  private async loadImage(media: typeof fixtureMedia[number]): Promise<void> {
    const { blob, id } = media.record; delete this.images[id];
    const file = await this.fs.readStream(this.bodyPath(blob.digest));
    if (file?.size !== blob.byteLength) throw Error('保存した画像本体がありません。');
    const bytes = await this.fs.readBytes(this.bodyPath(blob.digest));
    if (!bytes) throw Error('保存した画像本体がありません。'); this.counts.mediaBytes += bytes.length;
    if (bytes.length !== blob.byteLength || await digest(bytes) !== blob.digest) throw Error('保存した画像本体が一致しません。');
    this.images[id] = { record: media.record, base64: btoa(String.fromCharCode(...bytes)) };
  }
  async prepare(seed: ProjectMetadataSource) {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const inspection = await inspectProjectCandidates(seed.read(), limits);
    if (inspection.kind !== 'project-candidate-inspection' || inspection.hasUnknownFields) throw Error('初期モデルの宣言を確認できません。');
    const models = [];
    for (const field of inspection.fields.filter(f => f.path[0] === 'representationsById')) {
      const value = field.candidates[0]?.value;
      const known = field.valid && field.candidates.length === 1 && value?.kind === 'value' && this.known(value.value as JsonObject);
      if (!known) throw Error('初期モデルの宣言を確認できません。');
      for (const [map, record] of [['assetRevisionsById', known.closure.revision], ['assetBindingsById', known.closure.binding]] as const) {
        const f = inspection.fields.find(f => f.path[0] === map && f.path[1] === record.id), v = f?.candidates[0]?.value;
        if (!f?.valid || f.candidates.length !== 1 || v?.kind !== 'value' || canonicalFixture(v.value) !== canonicalFixture(record))
          throw Error('初期モデルの参照を確認できません。');
      }
      models.push(known);
    }
    if (!models.length) throw Error('初期モデルがありません。');
    for (const model of models) await this.prepareBody(model);
    return models;
  }
  private async prepareBody(model: typeof metadataPreparedModels[number]) {
    const bytes = fixtureModelBytes(model.closure.shape), expected = model.closure.representation;
    if (await digest(bytes) !== expected.blob.digest || bytes.length !== expected.blob.byteLength) throw Error('合成モデルの内容が一致しません。');
    const path = this.bodyPath(expected.blob.digest), prior = await this.fs.readBytes(path);
    if (prior && !equalBytes(prior, bytes)) throw Error('保存した合成モデルが一致しません。上書きしていません。');
    if (!prior) await this.fs.writeBytes(path, bytes);
    const saved = await this.fs.readBytes(path);
    if (!saved || !equalBytes(saved, bytes)) throw Error('合成モデルの保存を確認できません。');
    await writeReceipt(this.fs, this.inventoryPath(expected.blob.digest),
      { version: 'synthetic-triangle-inventory-1', blob: expected.blob, profile: expected.formatProfile }, limits);
  }
  async inspect(request: ContentRequest): ReturnType<VerifiedInventoryPort['inspect']> {
    this.counts.inventoryChecks++;
    for (const record of request.records) {
      if (request.fact === 'media') {
        const media = this.knownMedia(record); if (!media) return 'unverified';
        delete this.images[media.record.id];
        const blob = media.record.blob, receipt = await readReceipt(this.fs, this.inventoryPath(blob.digest), limits);
        if (!receipt) return 'missing';
        if (json(receipt) !== json(this.mediaReceipt(media.record))) return 'suspect';
        const file = await this.fs.readStream(this.bodyPath(blob.digest));
        if (!file) return 'missing'; if (file.size !== blob.byteLength) return 'suspect';
        continue;
      }
      const known = this.known(record); if (!known) return 'unverified';
      const { blob, formatProfile } = known.closure.representation;
      const receipt = await readReceipt(this.fs, this.inventoryPath(blob.digest), limits);
      if (!receipt) return 'missing';
      if (json(receipt) !== json({ version: 'synthetic-triangle-inventory-1', blob, profile: formatProfile })) return 'suspect';
      const file = await this.fs.readStream(this.bodyPath(blob.digest));
      if (!file) return 'missing'; if (file.size !== blob.byteLength) return 'suspect';
    }
    return request.records.length ? 'verified-present' : 'unverified';
  }
  verifier(allowNewEvidence: boolean): ProjectContentVerifier {
    const triangle = new PersistentContentVerifier(this.fs, limits, { scope: 'development-fixture', verify: q => this.execute(q) },
      'synthetic-triangle-executor-1', this, allowNewEvidence);
    const media = this.mediaVerifier(false);
    return { scope: 'development-fixture', verify: q => q.fact === 'media' ? media.verify(q) : triangle.verify(q) };
  }
  private mediaVerifier(allow: boolean) {
    const verifier = new PersistentContentVerifier(this.fs, limits, { scope: 'development-fixture', verify: async request => {
      const record = request.records.length === 1 && this.knownMedia(request.records[0]!);
      if (request.fact !== 'media' || !record || await this.inspect(request) !== 'verified-present')
        return { request, scope: 'development-fixture', outcome: 'failed' };
      return { request, scope: 'development-fixture', outcome: 'verified', facts: { mediaKind: 'image', mediaType: 'image/png' } };
    } }, 'synthetic-png-executor-1', this, allow);
    // Bounded image display verification, outside inventory.inspect's no-body-I/O contract.
    return { scope: 'development-fixture' as const, verify: async (request: ContentRequest) => {
      const media = request.records.length === 1 && this.knownMedia(request.records[0]!);
      if (!media) return { request, scope: 'development-fixture', outcome: 'failed' };
      await this.loadImage(media);
      const result = await verifier.verify(request);
      // Inventory checks may invalidate cached display sources; publish only after all checks.
      if ((result as { outcome: string }).outcome === 'verified') await this.loadImage(media);
      return result;
    } };
  }
  private async execute(request: ContentRequest): Promise<unknown> {
    const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-fixture', outcome, ...(facts ? { facts } : {}) });
    if (!['representation', 'family-envelope'].includes(request.fact) || request.records.length !== 1 ||
      await this.inspect(request) !== 'verified-present') return response('unsupported');
    const known = this.known(request.records[0]!)!, record = known.closure.representation;
    const bytes = await this.fs.readBytes(this.bodyPath(record.blob.digest));
    if (!bytes) return response('missing'); this.counts.bodyBytes += bytes.length;
    if (await digest(bytes) !== record.blob.digest || !equalBytes(bytes, fixtureModelBytes(known.closure.shape))) return response('failed');
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as { positions: number[]; indices: number[] };
    const points = decoded.positions.map((p, i) => p + record.representationToAsset.translation[i % 3]!);
    const axes = [0, 1, 2].map(i => points.filter((_, j) => j % 3 === i));
    const bounds = { min: axes.map(a => Math.min(...a)), max: axes.map(a => Math.max(...a)) };
    if (request.fact === 'family-envelope') {
      if (request.context.assetId !== record.assetId || request.context.variantFamilyId !== record.variantFamilyId) return response('failed');
      return response('verified', { logicalBoundsAsset: bounds, authority: { kind: 'source', representationId: record.id, payloadDigest: record.payloadDigest } });
    }
    return response('verified', { contentKind: 'mesh', staticPose: true, contentBoundsAsset: bounds,
      materials: [{ sourceLocator: { kind: 'representationMaterial', slotIndex: 0 },
        sourceSemantics: { coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'lit', doubleSided: false } }],
      surfaceRanges: [{ kind: 'meshTriangle', nodeIndex: 0, primitiveIndex: 0, count: decoded.indices.length / 3 }] });
  }
}
