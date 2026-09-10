import type { ProjectWorkspaceFS } from '../../platform/fs';
import type { ContentRequest, ProjectContentVerifier } from '../../domain/projectContentChecks';
import type { JsonObject } from '../../domain/values';
import { PersistentContentVerifier, type VerifiedInventoryPort } from '../../projectMetadata/contentEvidence';
import { ProjectMetadataSource, type MetadataProof } from '../../projectMetadata/source';
import { digest, equalBytes, json, metadataPath, readReceipt, writeReceipt } from '../../projectMetadata/persistence';
import { metadataModels, metadataSeedBody, metadataFixtureLimits as limits } from './metadataFixture';

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

/** Two exact pre-existing triangle fixtures only; no general CAS/decoder or user-file admission. */
export class MetadataFixtureContent implements VerifiedInventoryPort {
  readonly counts = { bodyBytes: 0, inventoryChecks: 0 };
  constructor(private readonly fs: ProjectWorkspaceFS) {}
  private bodyPath(hash: string) { return metadataPath(this.fs, `fixture-content/${hash}.bin`); }
  private inventoryPath(hash: string) { return metadataPath(this.fs, `fixture-inventory/${hash}.json`); }
  private known(record: JsonObject) { return metadataModels.find(m => json(m.closure.representation) === json(record)); }
  async prepare(): Promise<void> {
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const bytes = metadataSeedBody(), expected = metadataModels[0]!.closure.representation;
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
    return new PersistentContentVerifier(this.fs, limits, { scope: 'development-fixture', verify: q => this.execute(q) },
      'synthetic-triangle-executor-1', this, allowNewEvidence);
  }
  private async execute(request: ContentRequest): Promise<unknown> {
    const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-fixture', outcome, ...(facts ? { facts } : {}) });
    if (!['representation', 'family-envelope'].includes(request.fact) || request.records.length !== 1 ||
      await this.inspect(request) !== 'verified-present') return response('unsupported');
    const known = this.known(request.records[0]!)!, record = known.closure.representation;
    const bytes = await this.fs.readBytes(this.bodyPath(record.blob.digest));
    if (!bytes) return response('missing'); this.counts.bodyBytes += bytes.length;
    if (await digest(bytes) !== record.blob.digest || !equalBytes(bytes, metadataSeedBody())) return response('failed');
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
