import { readNativePortableConversionV1 } from '../nativeGs/portablePackage';
import { nativeDisplaySetsV1 } from '../nativeGs/schema';
import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore, StoredBlobRef } from '../projectMetadata/blobStore';
import { ProjectMetadataSource, type MetadataProof } from '../projectMetadata/source';
import { metadataProviderReady, type MetadataProjectSession } from '../projectMetadata/session';
import { digest, equalBytes, json, metadataPath, newId, readReceipt, underWriteLease, writeReceipt } from '../projectMetadata/persistence';
import { readProjectScene } from '../scene/projectProvider';
import { checkContentFacts } from '../domain/projectContentChecks';
import { same } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import { mapNativeProject, nativeConversionRecipe, type NativeMappingEntry } from './nativeMapping';
import { inspectValidationGlb, type ValidatedGlb } from './glb';
import { inspectValidationPng, type PngDecoder } from './png';
import { identityPlacement } from './initialProject';
import { readValidationBody } from './content';
import { readValidationInitialRecord, writeValidationInitial } from './creation';
import { checkFileLimits, fileError, validationMetadataLimits as metadata, type FileValidationLimits } from './validation';

interface ByteProof { byteLength: number; digest: string }
interface ConversionReceipt {
  recipe: typeof nativeConversionRecipe; conversionId: string; projectId: string;
  original: ByteProof; manifest: ByteProof; snapshot: ByteProof;
  initial: ByteProof & { proof: MetadataProof }; mapping: NativeMappingEntry[];
  report: { models: number; scenes: number; captions: number; media: number; originalExcludedFromExports: true };
}
const receiptPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'native-conversion.json');
const sourcePath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'native-conversion-source.zip');
const proof = async (bytes: Uint8Array): Promise<ByteProof> => ({ byteLength: bytes.length, digest: await digest(bytes) });
export const hasNativeConversion = async (fs: ProjectWorkspaceFS) => !!await fs.readStream(receiptPath(fs));

async function checkConversionReceipt(r: ConversionReceipt, projectId: string) {
  const keys = (v: unknown, names: string[]) => !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).sort().join(',') === names.sort().join(',');
  const byteProof = (p: ByteProof) => keys(p, ['byteLength', 'digest']) && Number.isSafeInteger(p.byteLength) && p.byteLength > 0 && /^[0-9a-f]{64}$/.test(p.digest);
  if (!keys(r, ['recipe', 'conversionId', 'projectId', 'original', 'manifest', 'snapshot', 'initial', 'mapping', 'report']) ||
    r.recipe !== nativeConversionRecipe || r.projectId !== projectId || r.projectId !== `prj_${r.conversionId}` || !/^[0-9a-f]{32}$/.test(r.conversionId) ||
    !byteProof(r.original) || !byteProof(r.manifest) || !byteProof(r.snapshot) || !keys(r.initial, ['byteLength', 'digest', 'proof']) ||
    !byteProof({ byteLength: r.initial.byteLength, digest: r.initial.digest }) || !Array.isArray(r.mapping) || !r.mapping.length ||
    !keys(r.report, ['models', 'scenes', 'captions', 'media', 'originalExcludedFromExports']) || r.report.originalExcludedFromExports !== true ||
    ![r.report.models, r.report.scenes, r.report.captions, r.report.media].every(n => Number.isSafeInteger(n) && n >= 0))
    return fileError('変換元の記録を確認できません。');
  const ids = new Set<string>();
  for (const entry of r.mapping) {
    if (!keys(entry, ['id', 'sha256', 'preimage']) || typeof entry.id !== 'string' || typeof entry.preimage !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) || ids.has(entry.id) || !entry.preimage.startsWith(`lociview:${nativeConversionRecipe}:id:jcs-v1\n`))
      return fileError('変換時の対応表を確認できません。');
    let value: unknown;
    try { value = JSON.parse(entry.preimage.slice(entry.preimage.indexOf('\n') + 1)); } catch { return fileError('変換時の対応表が不正です。'); }
    if (!Array.isArray(value) || value.length !== 4 || value[0] !== r.conversionId || value[1] !== r.original.digest ||
      !['ast', 'rev', 'bnd', 'rep', 'cap', 'med', 'view', 'frm', 'fam', 'cmp', 'scn', 'sam', 'scm', 'att', 'tag', 'tgm', 'lay', 'slot', 'evt'].includes(value[2]) ||
      !Array.isArray(value[3]) || entry.id !== `${value[2]}_${entry.sha256.slice(0, 32)}` || await digest(new TextEncoder().encode(entry.preimage)) !== entry.sha256)
      return fileError('変換時の対応表が一致しません。');
    ids.add(entry.id);
  }
}

/** No IDs or persistent state are allocated until the user confirms create(). */
export async function prepareNativeConversion(input: Blob, limits: FileValidationLimits, decode?: PngDecoder) {
  checkFileLimits(limits);
  const file = input.slice(0, input.size), native = await readNativePortableConversionV1(file, limits);
  if (!native) return null;
  const { snapshot } = native;
  if (snapshot.collaborationBaseline) return fileError('この共同作業用のNativeファイルは、まだ変換できません。');
  if (snapshot.meshMaterialAppearances?.length) return fileError('マテリアルの調整を含むNativeファイルは、まだ変換できません。');
  const models = new Map<string, ValidatedGlb>(), blobs: { ref: StoredBlobRef; bytes: Uint8Array }[] = [];
  for (const r of snapshot.representations) {
    if (r.role !== 'meshPrimary' || r.contentKind !== 'mesh' || r.formatProfile.id !== 'lociview-native-model-glb-v1' ||
      !same(r.purposes, ['source', 'display']) || !same({ ...r.representationToAsset }, { ...identityPlacement(), reflection: 'none' }) ||
      r.derivedFrom.length || r.proxyForGsVariantFamilyId !== undefined || r.gsPly !== undefined || r.pointPly !== undefined || r.blob.mediaType !== 'model/gltf-binary')
      return fileError('この検証版で変換できるモデルは、静的GLBのみです。');
    const bytes = native.bodies.get(native.manifest.representations.find(m => m.representationId === r.id)!.entry)!;
    if (await digest(bytes) !== r.blob.digest) return fileError('モデル本体が元の記録と一致しません。');
    models.set(r.id, await inspectValidationGlb(bytes, limits, decode)); blobs.push({ ref: { ...r.blob }, bytes });
  }
  for (const m of snapshot.mediaResources ?? []) {
    if (m.blob.mediaType !== 'image/png') return fileError('この検証版で変換できるメディアは、PNGのみです。');
    const bytes = native.bodies.get(native.manifest.media!.find(e => e.mediaId === m.id)!.entry)!;
    if (await digest(bytes) !== m.blob.digest) return fileError('画像本体が元の記録と一致しません。');
    await inspectValidationPng(bytes, limits, decode); blobs.push({ ref: { ...m.blob }, bytes });
  }
  const originalBytes = await readValidationBody({ size: file.size, stream: () => file.stream() }, limits.maxFileBytes);
  const original = await proof(originalBytes), manifest = await proof(native.manifestBytes), snapshotProof = await proof(native.snapshotBytes);
  const report = { models: snapshot.assets.length, scenes: nativeDisplaySetsV1(snapshot).length, captions: snapshot.captions.length,
    media: snapshot.mediaResources?.length ?? 0, originalExcludedFromExports: true as const };
  let attempt: Promise<Awaited<ReturnType<typeof create>>> | undefined;
  async function create() {
    const conversionId = newId(), mapped = await mapNativeProject(snapshot, models, conversionId, original.digest);
    const source = ProjectMetadataSource.bootstrap(mapped.records.schema, mapped.records.identity, metadata, { semanticProfile: 'map2' }).initialize(mapped.records);
    // Full target graph admission with owned, already inspected input. No second decode per content fact.
    const targetModels = mapped.targetModels;
    const targetMedia = mapped.records.mediaResourcesById as JsonObject;
    const provider = await readProjectScene(source.read(), metadata, { scope: 'development-validation', verify: async request => {
      const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-validation', outcome, ...(facts ? { facts } : {}) });
      if (request.records.length !== 1) return response('unsupported');
      const record = request.records[0]!; let facts: JsonObject;
      if (request.fact === 'media' && same(targetMedia[record.id as string], record)) facts = { mediaKind: 'image', mediaType: 'image/png' };
      else {
        const known = targetModels.get(record.id as string);
        if (!known || !same(known.record, record)) return response('unsupported');
        const model = known.model;
        if (request.fact === 'representation') facts = { contentKind: 'mesh', staticPose: true, contentBoundsAsset: model.bounds, materials: [...model.materials], surfaceRanges: [...model.surfaceRanges] };
        else if (request.fact === 'family-envelope') facts = { logicalBoundsAsset: model.bounds, authority: { kind: 'source', representationId: record.id!, payloadDigest: record.payloadDigest! } };
        else if (request.fact === 'family-contribution') facts = { verifiedMembers: [{ id: record.id!, payloadDigest: record.payloadDigest! }] };
        else return response('unsupported');
      }
      checkContentFacts(request, facts); return response('verified', facts);
    } }, { verifyRetainedMedia: true });
    if (provider.kind !== 'scene-provider' || !metadataProviderReady(provider, metadata)) return fileError('モデルや記録の対応関係をそのまま変換できません。');
    for (const [id, expected] of mapped.reviewStates) {
      const anchor = provider.resources.captions[id]?.anchor;
      if (anchor?.kind !== 'value') return fileError('キャプションの位置を変換できません。');
      let needsReview = false;
      if (anchor.value.kind === 'asset') {
        const owner = provider.resources.assets[anchor.value.assetId]?.projection;
        if (owner?.kind !== 'value') return fileError('ピンの親モデルを確認できません。');
        needsReview = !owner.value.anchorCompatibilityIds.includes(anchor.value.authoredAnchorCompatibilityId);
      }
      if (needsReview !== expected) return fileError('要確認ピンの状態をそのまま変換できません。');
    }
    const bytes = source.encodeFullSource();
    const receipt: ConversionReceipt = { recipe: nativeConversionRecipe, conversionId, projectId: `prj_${conversionId}`,
      original, manifest, snapshot: snapshotProof, initial: { ...await proof(bytes), proof: source.proof }, mapping: mapped.mapping, report };
    return { source, async persist(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession) {
      const before = await session.read();
      const existing = await readReceipt<ConversionReceipt>(fs, receiptPath(fs), metadata);
      if (existing) {
        if (json(existing) !== json(receipt)) return fileError('作成先は別のプロジェクトです。');
        return resumeNativeConversion(fs, store, session, limits, receipt.projectId);
      }
      if (before.state !== 'empty') return fileError('作成先が空ではありません。');
      await underWriteLease(fs, async () => {
        await writeReceipt(fs, receiptPath(fs), receipt, metadata);
        const old = await fs.readBytes(sourcePath(fs));
        if (old && !equalBytes(old, originalBytes)) return fileError('変換元の記録が一致しません。上書きしていません。');
        if (!old) await fs.writeBytes(sourcePath(fs), originalBytes);
        const saved = await fs.readBytes(sourcePath(fs));
        if (!saved || !equalBytes(saved, originalBytes)) return fileError('変換元の記録を保持できません。');
        await writeValidationInitial(fs, source);
      });
      for (const body of blobs) await store.put(new Blob([body.bytes.slice().buffer]).stream(), body.ref.mediaType, body.ref);
      return session.createFromSource(source);
    } };
  }
  return { summary: Object.freeze({ ...report }), create: () => attempt ??= create() };
}

/** Cold recovery checks retained input; it never regenerates IDs or initial Automerge changes. */
export async function resumeNativeConversion(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession,
  limits: FileValidationLimits, projectId: string) {
  const receipt = await readReceipt<ConversionReceipt>(fs, receiptPath(fs), metadata);
  if (!receipt) return fileError('変換元の記録を確認できません。');
  await checkConversionReceipt(receipt, projectId);
  const { source, receipt: initial } = await readValidationInitialRecord(fs);
  if (source.proof.identity.projectId !== projectId || json(source.proof) !== json(receipt.initial.proof) || initial.byteLength !== receipt.initial.byteLength ||
    initial.digest !== receipt.initial.digest) return fileError('変換時の初期記録が一致しません。');
  const saved = await fs.readStream(sourcePath(fs));
  if (!saved || saved.size !== receipt.original.byteLength) return fileError('変換元ファイルの記録が不足しています。');
  const original = await readValidationBody(saved, limits.maxFileBytes);
  if (await digest(original) !== receipt.original.digest) return fileError('変換元ファイルの記録が一致しません。');
  const before = await session.read();
  if (before.state === 'ready') {
    if (json(before.source!.proof) !== json(source.proof)) return fileError('再開先のプロジェクトが一致しません。');
    return before;
  }
  if (before.state !== 'pending' && before.state !== 'empty') return fileError('変換が未完了です。修復が必要です。');
  const native = await readNativePortableConversionV1(new Blob([original.slice().buffer]), limits);
  if (!native || json(await proof(native.manifestBytes)) !== json(receipt.manifest) || json(await proof(native.snapshotBytes)) !== json(receipt.snapshot))
    return fileError('変換元の内容が記録と一致しません。');
  for (const item of [...native.manifest.representations, ...native.manifest.media ?? []]) {
    const ref: StoredBlobRef = { algorithm: item.algorithm, digest: item.digest, byteLength: item.byteLength, mediaType: item.mediaType };
    const presence = await store.inspect(ref);
    if (presence === 'unverified') await store.put(new Blob([native.bodies.get(item.entry)!.slice().buffer]).stream(), ref.mediaType, ref);
    else if (presence !== 'verified-present') return fileError('記録済みのモデルまたは画像に修復が必要です。');
  }
  return before.state === 'pending' ? session.recoverInitialization(source) : session.createFromSource(source);
}
