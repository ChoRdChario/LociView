import type { PhotoDecoder } from './photo';
import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { ProjectMetadataSource, type MetadataProof } from '../projectMetadata/source';
import { metadataProviderReady, type MetadataProjectSession } from '../projectMetadata/session';
import { digest, equalBytes, json, metadataPath, newId, readReceipt, underWriteLease, writeReceipt } from '../projectMetadata/persistence';
import { same } from '../domain/projectGraphSupport';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { checkContentFacts } from '../domain/projectContentChecks';
import { readProjectScene } from '../scene/projectProvider';
import { readValidationBody } from './content';
import { readValidationInitialRecord, writeValidationInitial, validationInitialOrigin } from './creation';
import { frozenV1Recipe, frozenV1JpegRecipe, frozenV1PhotoRecipe, frozenV1DefaultViewRecipe, frozenV1PlacementRecipe, frozenV1MaterialRecipe, frozenV1OpaqueMaterialRecipe, type FrozenV1Recipe, inspectFrozenV1Source, byteProof, type FrozenV1Plan } from './frozenV1Source';
import { mapFrozenV1Project, frozenV1SourceKey, type FrozenV1MappingEntry } from './frozenV1Mapping';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { fileError, validationMetadataLimits as metadata, type FileValidationLimits } from './validation';

interface ConversionReceipt {
  recipe: FrozenV1Recipe; conversionId: string; projectId: string;
  original: { byteLength: number; digest: string };
  initial: { byteLength: number; digest: string; proof: MetadataProof };
  fingerprints: FrozenV1Plan['fingerprints']; inventory: FrozenV1Plan['inventory'];
  mapping: FrozenV1MappingEntry[]; report: FrozenV1Plan['report'] | JsonObject;
}
const receiptPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'frozen-v1-conversion.json');
const sourcePath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'frozen-v1-conversion-source.zip');
export const hasFrozenV1Conversion = async (fs: ProjectWorkspaceFS, checkBoundInitial = true) => !!await fs.readStream(receiptPath(fs)) || !!await fs.readStream(sourcePath(fs)) ||
  checkBoundInitial && [frozenV1Recipe, frozenV1JpegRecipe, frozenV1PhotoRecipe, frozenV1DefaultViewRecipe, frozenV1PlacementRecipe, frozenV1MaterialRecipe, frozenV1OpaqueMaterialRecipe].includes(await validationInitialOrigin(fs) as FrozenV1Recipe);
// A small origin marker identifies the optional explanation; no ready-time source/report decode.
export const hasFrozenV1MaterialReport = async (fs: ProjectWorkspaceFS) => [frozenV1MaterialRecipe,frozenV1OpaqueMaterialRecipe].includes(await validationInitialOrigin(fs) as FrozenV1Recipe);
const fail = () => fileError('旧形式の変換記録が不足しているか一致しません。保持した記録は上書きしていません。');

async function checkReceipt(r: ConversionReceipt, projectId: string) {
  const keys = (v: unknown, names: string[]) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === names.sort().join(',');
  const proof = (p: unknown): boolean => keys(p, ['byteLength', 'digest']) && Number.isSafeInteger((p as ConversionReceipt['original']).byteLength) &&
    (p as ConversionReceipt['original']).byteLength > 0 && /^[0-9a-f]{64}$/.test((p as ConversionReceipt['original']).digest);
  if (!keys(r, ['recipe', 'conversionId', 'projectId', 'original', 'initial', 'fingerprints', 'inventory', 'mapping', 'report']) ||
    ![frozenV1Recipe, frozenV1JpegRecipe, frozenV1PhotoRecipe, frozenV1DefaultViewRecipe, frozenV1PlacementRecipe, frozenV1MaterialRecipe, frozenV1OpaqueMaterialRecipe].includes(r.recipe) || !/^[0-9a-f]{32}$/.test(r.conversionId) || r.projectId !== projectId || projectId !== `prj_${r.conversionId}` ||
    !proof(r.original) || !keys(r.initial, ['byteLength', 'digest', 'proof']) || !proof({ byteLength: r.initial.byteLength, digest: r.initial.digest }) ||
    !Array.isArray(r.mapping) || !r.mapping.length) return fail();
  const ids = new Set<string>(), hashes = new Map<string, string>();
  for (const entry of r.mapping) {
    if (!keys(entry, ['id', 'preimage', 'sha256']) || typeof entry.id !== 'string' || typeof entry.preimage !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) || ids.has(entry.id)) return fail();
    const prefix = `lociview:${r.recipe}:id:jcs-v1\n`; let tuple: unknown;
    try { tuple = JSON.parse(entry.preimage.slice(prefix.length)); } catch { return fail(); }
    if (!Array.isArray(tuple) || tuple.length !== 4 || tuple[0] !== r.conversionId || tuple[1] !== r.original.digest ||
      !frozenV1SourceKey(tuple[2], tuple[3], false, r.recipe) || entry.preimage !== prefix + JSON.stringify(tuple) ||
      entry.id !== `${tuple[2]}_${entry.sha256.slice(0, 32)}` || await digest(new TextEncoder().encode(entry.preimage)) !== entry.sha256 ||
      (r.recipe === frozenV1MaterialRecipe || r.recipe === frozenV1OpaqueMaterialRecipe) && hashes.has(entry.sha256) && hashes.get(entry.sha256) !== entry.preimage) return fail();
    ids.add(entry.id); hashes.set(entry.sha256, entry.preimage);
  }
}
function materialReport(plan: Extract<FrozenV1Plan, { recipe: typeof frozenV1MaterialRecipe | typeof frozenV1OpaqueMaterialRecipe }>, mapped?: Awaited<ReturnType<typeof mapFrozenV1Project>>, source?: ProjectMetadataSource): JsonObject {
  return { ...plan.report, materialMappings: source ? mapped!.materialMappings : [], targetIdentity: source?.proof.identity ?? null,
    initialProof: source ? cloneCanonicalValue(source.proof, metadata) : null };
}
const reportBlob = (original: ConversionReceipt['original'], report: JsonObject, recipe:FrozenV1Recipe) => new Blob([json({ format: 'lociview-frozen-v1-to-project-scene-report', version: 1,
  recipe, original, ...report, capturedBeforePublication: true, originalExcludedFromExports: true,
  sourceAndReportMustBeSavedSeparately: true })], { type: 'application/json' });
async function verifyRetained(r: ConversionReceipt, source: ProjectMetadataSource, plan: FrozenV1Plan) {
  if (source.semanticProfile !== 'map2') return fail();
  await checkReceipt(r, source.proof.identity.projectId as string);
  if (plan.recipe !== r.recipe || json(source.proof) !== json(r.initial.proof) || json(plan.fingerprints) !== json(r.fingerprints) ||
    json(plan.inventory) !== json(r.inventory) || (plan.recipe !== frozenV1MaterialRecipe && plan.recipe !== frozenV1OpaqueMaterialRecipe) && json(plan.report) !== json(r.report)) return fail();
  // Derive expected values against captured identity; never bootstrap/regenerate initial history.
  const expected = await mapFrozenV1Project(plan, r.conversionId, r.original.digest, source.proof.identity);
  if (json(expected.mapping) !== json(r.mapping) || (plan.recipe === frozenV1MaterialRecipe || plan.recipe === frozenV1OpaqueMaterialRecipe) && json(materialReport(plan, expected, source)) !== json(r.report)) return fail();
  const original = await source.inspectOriginal({ maxNodes: metadata.maxNodes, maxWork: metadata.maxWork });
  if (original.candidates.hasUnknownFields || json(original.candidates.unambiguousRecords) !== json(expected.records)) return fail();
}

/** Null means no v1 identity, never a failed v1 read or unsupported conversion. */
export async function prepareFrozenV1Conversion(input: Blob, limits: FileValidationLimits, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder) {
  const opened = await inspectFrozenV1Source(input, limits, decode, jpeg, photo); if (!opened) return null;
  const { plan, original } = opened, originalProof = await byteProof(original);
  let explanation = (plan.recipe === frozenV1MaterialRecipe || plan.recipe === frozenV1OpaqueMaterialRecipe) ? materialReport(plan) : undefined;
  let attempt: Promise<Awaited<ReturnType<typeof create>>> | undefined;
  async function create() {
    const conversionId = newId(), mapped = await mapFrozenV1Project(plan, conversionId, originalProof.digest);
    const source = ProjectMetadataSource.bootstrap(mapped.records.schema, mapped.records.identity, metadata, { semanticProfile: 'map2' }).initialize(mapped.records);
    const media = mapped.records.mediaResourcesById as JsonObject;
    const provider = await readProjectScene(source.read(), metadata, { scope: 'development-validation', verify: async request => {
      const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-validation', outcome, ...(facts ? { facts } : {}) });
      if (request.records.length !== 1) return response('unsupported');
      const record = request.records[0]!; let facts: JsonObject;
      if (request.fact === 'media' && same(media[record.id as string], record)) facts = { mediaKind: 'image', mediaType: (record.blob as JsonObject).mediaType! };
      else {
        const known = mapped.targetModels.get(record.id as string); if (!known || !same(known.record, record)) return response('unsupported');
        const model = known.model;
        if (request.fact === 'representation') facts = { contentKind: 'mesh', staticPose: true, contentBoundsAsset: model.bounds, materials: [...model.materials], surfaceRanges: [...model.surfaceRanges] };
        else if (request.fact === 'family-envelope') facts = { logicalBoundsAsset: model.bounds, authority: { kind: 'source', representationId: record.id!, payloadDigest: record.payloadDigest! } };
        else if (request.fact === 'family-contribution') facts = { verifiedMembers: [{ id: record.id!, payloadDigest: record.payloadDigest! }] };
        else return response('unsupported');
      }
      checkContentFacts(request, facts); return response('verified', facts);
    } }, { verifyRetainedMedia: true });
    if (provider.kind !== 'scene-provider' || !metadataProviderReady(provider, metadata)) return fileError('元のモデル・記録の関係をそのまま変換できません。');
    const receipt: ConversionReceipt = { recipe: plan.recipe, conversionId, projectId: `prj_${conversionId}`, original: originalProof,
      initial: { ...await byteProof(source.encodeFullSource()), proof: source.proof }, fingerprints: plan.fingerprints, inventory: plan.inventory,
      mapping: mapped.mapping, report: (plan.recipe === frozenV1MaterialRecipe || plan.recipe === frozenV1OpaqueMaterialRecipe) ? materialReport(plan, mapped, source) : plan.report };
    await verifyRetained(receipt, source, plan);
    if ((plan.recipe === frozenV1MaterialRecipe || plan.recipe === frozenV1OpaqueMaterialRecipe)) explanation = receipt.report as JsonObject;
    return { source, async persist(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession) {
      const before = await session.read(), existing = await readReceipt<ConversionReceipt>(fs, receiptPath(fs), metadata);
      if (existing) {
        if (json(existing) !== json(receipt)) return fail();
        return resumeFrozenV1Conversion(fs, store, session, limits, receipt.projectId, decode, jpeg, photo);
      }
      if (before.state !== 'empty') return fileError('作成先が空ではありません。既存の記録は変更していません。');
      if ((plan.recipe === frozenV1MaterialRecipe || plan.recipe === frozenV1OpaqueMaterialRecipe)) {
        const actual = await inspectFrozenV1Source(new Blob([original.slice().buffer]), limits, decode, jpeg, photo);
        if (!actual) return fail(); await verifyRetained(receipt, source, actual.plan);
      }
      await underWriteLease(fs, async () => {
        await writeReceipt(fs, receiptPath(fs), receipt, metadata);
        const old = await fs.readBytes(sourcePath(fs)); if (old && !equalBytes(old, original)) return fail();
        if (!old) await fs.writeBytes(sourcePath(fs), original);
        const saved = await fs.readBytes(sourcePath(fs)); if (!saved || !equalBytes(saved, original)) return fail();
        await writeValidationInitial(fs, source, receipt.recipe);
      });
      const saved = await readReceipt<ConversionReceipt>(fs, receiptPath(fs), metadata), initial = await readValidationInitialRecord(fs);
      if (json(saved) !== json(receipt) || initial.receipt.digest !== receipt.initial.digest || initial.receipt.version !== 'validation-initial-2' || initial.receipt.originRecipe !== receipt.recipe) return fail();
      await verifyRetained(receipt, initial.source, plan);
      for (const body of mapped.blobs) await store.put(new Blob([body.bytes.slice().buffer]).stream(), body.ref.mediaType, body.ref);
      return session.createFromSource(source);
    } };
  }
  return { summary: Object.freeze({ ...plan.report, sourceOnly: Object.freeze({ ...plan.report.sourceOnly }) }), create: () => attempt ??= create(),
    ...((plan.recipe === frozenV1MaterialRecipe || plan.recipe === frozenV1OpaqueMaterialRecipe) ? { report: () => reportBlob(originalProof, explanation!, plan.recipe) } : {}) };
}

async function retained(fs: ProjectWorkspaceFS, limits: FileValidationLimits, projectId: string, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder) {
  const receipt = await readReceipt<ConversionReceipt>(fs, receiptPath(fs), metadata); if (!receipt) return fail();
  await checkReceipt(receipt, projectId);
  const initial = await readValidationInitialRecord(fs);
  if (initial.receipt.byteLength !== receipt.initial.byteLength || initial.receipt.digest !== receipt.initial.digest || initial.receipt.version !== 'validation-initial-2' || initial.receipt.originRecipe !== receipt.recipe) return fail();
  const raw = await fs.readStream(sourcePath(fs)); if (!raw || raw.size !== receipt.original.byteLength) return fail();
  const original = await readValidationBody(raw, limits.maxFileBytes); if (await digest(original) !== receipt.original.digest) return fail();
  const opened = await inspectFrozenV1Source(new Blob([original.slice().buffer]), limits, decode, jpeg, photo); if (!opened) return fail();
  await verifyRetained(receipt, initial.source, opened.plan);
  return { receipt, initial, opened };
}
export async function resumeFrozenV1Conversion(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession,
  limits: FileValidationLimits, projectId: string, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder) {
  const { initial, opened } = await retained(fs, limits, projectId, decode, jpeg, photo);
  const before = await session.read();
  if (before.state === 'ready') { if (json(before.source!.proof) !== json(initial.source.proof)) return fail(); return before; }
  if (before.state !== 'pending' && before.state !== 'empty') return fail();
  for (const body of [...opened.plan.models, ...opened.plan.media]) {
    const presence = await store.inspect(body.ref);
    if (presence === 'unverified') await store.put(new Blob([body.bytes.slice().buffer]).stream(), body.ref.mediaType, body.ref);
    else if (presence !== 'verified-present') return fileError('保存済みのモデルまたは画像に修復が必要です。');
  }
  return before.state === 'pending' ? session.recoverInitialization(initial.source) : session.createFromSource(initial.source);
}
/** Explicit new6 explanation only; never included in ordinary package output. */
export async function readFrozenV1MaterialReport(fs: ProjectWorkspaceFS, limits: FileValidationLimits, projectId: string, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder): Promise<Blob | null> {
  if (!await hasFrozenV1MaterialReport(fs)) return null;
  const { receipt } = await retained(fs, limits, projectId, decode, jpeg, photo);
  if ((receipt.recipe !== frozenV1MaterialRecipe && receipt.recipe !== frozenV1OpaqueMaterialRecipe)) return fail();
  return reportBlob(receipt.original, receipt.report as JsonObject, receipt.recipe);
}
