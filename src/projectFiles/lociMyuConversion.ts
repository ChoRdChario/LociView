import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { ProjectMetadataSource, type MetadataProof } from '../projectMetadata/source';
import { metadataProviderReady, type MetadataProjectSession } from '../projectMetadata/session';
import { digest, equalBytes, json, metadataPath, newId, readReceipt, underWriteLease, writeReceipt } from '../projectMetadata/persistence';
import { same } from '../domain/projectGraphSupport';
import { DomainValidationError, type JsonObject } from '../domain/values';
import { checkContentFacts } from '../domain/projectContentChecks';
import { readProjectScene } from '../scene/projectProvider';
import { readValidationBody } from './content';
import { readValidationInitialRecord, writeValidationInitial, validationInitialOrigin } from './creation';
import { lociMyuRecipe, lociMyuEvidence, openLociMyuSource, planLociMyuSource, lociMyuByteProof, LociMyuPreflightError, type LociMyuSourcePlan, type OpenedLociMyuSource } from './lociMyuSource';
import { mapLociMyuProject, lociMyuSourceKey, type LociMyuMappingEntry } from './lociMyuMapping';
import type { PngDecoder } from './png';
import { fileError, validationMetadataLimits as metadata, type FileValidationLimits } from './validation';

interface ConversionReceipt {
  recipe: typeof lociMyuRecipe; conversionId: string; projectId: string; original: { byteLength: number; digest: string };
  initial: { byteLength: number; digest: string; proof: MetadataProof }; selection: number; workbook: LociMyuSourcePlan['workbook'];
  confirmation: LociMyuSourcePlan['confirmation']; title: string; fingerprints: LociMyuSourcePlan['fingerprints']; inventory: LociMyuSourcePlan['inventory'];
  sourceIdentities: JsonObject[]; mapping: LociMyuMappingEntry[]; report: JsonObject;
}
const receiptPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'locimyu-conversion.json');
const sourcePath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'locimyu-conversion-source.zip');
export const hasLociMyuConversion = async (fs: ProjectWorkspaceFS, checkBoundInitial = true) => !!await fs.readStream(receiptPath(fs)) || !!await fs.readStream(sourcePath(fs)) ||
  checkBoundInitial && await validationInitialOrigin(fs) === lociMyuRecipe;
const fail = () => fileError('LociMyuの変換記録が不足しているか一致しません。保持した記録は上書きしていません。');
const reportBlob = (report: JsonObject) => new Blob([json(lociMyuEvidence(report))], { type: 'application/json' });
const ascii = (value: unknown) => json(lociMyuEvidence(value)).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
async function writeLociMyuReceipt(fs: ProjectWorkspaceFS, receipt: ConversionReceipt) {
  const text = ascii(receipt); if (text.length > metadata.maxTotalBytes - 1024) return fail();
  const chunks: string[] = []; for (let i = 0; i < text.length; i += 50000) chunks.push(text.slice(i, i + 50000));
  await writeReceipt(fs, receiptPath(fs), { version: 'locimyu-conversion-evidence-1', chunks }, metadata);
}
async function readLociMyuReceipt(fs: ProjectWorkspaceFS): Promise<ConversionReceipt | null> {
  const envelope = await readReceipt<{ version: string; chunks: string[] }>(fs, receiptPath(fs), metadata); if (!envelope) return null;
  if (Object.keys(envelope).sort().join(',') !== 'chunks,version' || envelope.version !== 'locimyu-conversion-evidence-1' || !Array.isArray(envelope.chunks) || !envelope.chunks.length ||
    envelope.chunks.some((s, i) => typeof s !== 'string' || !/^[\x00-\x7f]*$/.test(s) || !s.length || s.length > 50000 || i < envelope.chunks.length - 1 && s.length !== 50000)) return fail();
  const text = envelope.chunks.join(''); if (text.length > metadata.maxTotalBytes - 1024) return fail();
  let receipt: ConversionReceipt; try { receipt = JSON.parse(text); } catch { return fail(); }
  if (ascii(receipt) !== text) return fail(); return receipt;
}

async function checkReceipt(r: ConversionReceipt, projectId: string) {
  const keys = (v: unknown, names: string[]) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === names.sort().join(',');
  const proof = (p: unknown): boolean => keys(p, ['byteLength', 'digest']) && Number.isSafeInteger((p as ConversionReceipt['original']).byteLength) &&
    (p as ConversionReceipt['original']).byteLength > 0 && /^[0-9a-f]{64}$/.test((p as ConversionReceipt['original']).digest);
  if (!keys(r, ['recipe', 'conversionId', 'projectId', 'original', 'initial', 'selection', 'workbook', 'confirmation', 'title', 'fingerprints', 'inventory', 'sourceIdentities', 'mapping', 'report']) ||
    r.recipe !== lociMyuRecipe || !/^[0-9a-f]{32}$/.test(r.conversionId) || r.projectId !== projectId || projectId !== `prj_${r.conversionId}` || !proof(r.original) ||
    !keys(r.initial, ['byteLength', 'digest', 'proof']) || !proof({ byteLength: r.initial.byteLength, digest: r.initial.digest }) || !Number.isSafeInteger(r.selection) || r.selection < 0 ||
    !keys(r.workbook, ['path', 'byteLength', 'digest']) || typeof r.workbook.path !== 'string' || typeof r.title !== 'string' || !Array.isArray(r.mapping) || !r.mapping.length) return fail();
  const ids = new Set<string>(), hashes = new Map<string, string>();
  for (const entry of r.mapping) {
    if (!keys(entry, ['id', 'preimage', 'sha256']) || typeof entry.id !== 'string' || typeof entry.preimage !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256) || ids.has(entry.id)) return fail();
    const prefix = `lociview:${lociMyuRecipe}:id:jcs-v1\n`; let tuple: unknown;
    try { tuple = JSON.parse(entry.preimage.slice(prefix.length)); } catch { return fail(); }
    if (!Array.isArray(tuple) || tuple.length !== 5 || tuple[0] !== r.conversionId || tuple[1] !== r.original.digest || tuple[2] !== r.workbook.path || !lociMyuSourceKey(tuple[3], tuple[4]) ||
      entry.preimage !== prefix + JSON.stringify(tuple) || entry.id !== `${tuple[3]}_${entry.sha256.slice(0, 32)}` || await digest(new TextEncoder().encode(entry.preimage)) !== entry.sha256 ||
      hashes.has(entry.sha256) && hashes.get(entry.sha256) !== entry.preimage) return fail();
    ids.add(entry.id); hashes.set(entry.sha256, entry.preimage);
  }
}
function makeReport(original: ConversionReceipt['original'], evaluated: Awaited<ReturnType<typeof planLociMyuSource>>, mapped?: Awaited<ReturnType<typeof mapLociMyuProject>>, source?: ProjectMetadataSource): JsonObject {
  const { base, plan, relation } = evaluated;
  return lociMyuEvidence({ format: 'lociview-locimyu-to-project-scene-report', version: 1, recipe: lociMyuRecipe,
    original, workbook: base.workbook, confirmedTitle: base.title, confirmation: base.confirmation, relationBasis: relation,
    inventory: base.inventory, fingerprints: base.fingerprints, accounting: base.accounting, sourceEvidence: base.sourceEvidence,
    converted: { models: plan ? 1 : 0, scenes: plan?.scenes.length ?? 0, captions: plan?.scenes.reduce((n, s) => n + s.captions.length, 0) ?? 0, media: plan?.media.length ?? 0, views: plan?.views.length ?? 0 },
    issues: base.issues, sourceIdentities: mapped?.sourceIdentities ?? [], mapping: source ? mapped?.mapping ?? [] : [],
    targetIdentity: source?.proof.identity ?? null, initialProof: source?.proof ?? null, capturedBeforePublication: true,
    originalExcludedFromExports: true, sourceAndReportMustBeSavedSeparately: true }) as JsonObject;
}
async function verifyRetained(r: ConversionReceipt, source: ProjectMetadataSource, opened: OpenedLociMyuSource) {
  if (source.semanticProfile !== 'map2') return fail(); await checkReceipt(r, source.proof.identity.projectId as string);
  const evaluated = await planLociMyuSource(opened, r.selection, r.title, r.confirmation !== null), plan = evaluated.plan;
  if (!plan || json(source.proof) !== json(r.initial.proof) || json(plan.workbook) !== json(r.workbook) || json(plan.confirmation) !== json(r.confirmation) ||
    json(plan.fingerprints) !== json(r.fingerprints) || json(plan.inventory) !== json(r.inventory)) return fail();
  const expected = await mapLociMyuProject(plan, r.conversionId, r.original.digest, source.proof.identity);
  if (json(expected.mapping) !== json(r.mapping) || json(expected.sourceIdentities) !== json(r.sourceIdentities) || json(makeReport(r.original, evaluated, expected, source)) !== json(r.report)) return fail();
  const original = await source.inspectOriginal({ maxNodes: metadata.maxNodes, maxWork: metadata.maxWork });
  if (original.candidates.hasUnknownFields || json(original.candidates.unambiguousRecords) !== json(expected.records)) return fail();
  return expected;
}

/** Preview owns the original ZIP. Each evaluation binds one exact workbook/title/relation decision. */
export async function prepareLociMyuConversion(input: Blob, limits: FileValidationLimits, decode?: PngDecoder) {
  const result = await openLociMyuSource(input, limits, decode); if (!result) return null;
  const opened = result;
  const originalProof = await lociMyuByteProof(opened.original);
  return {
    sources: opened.imported.sources.map((s, index) => ({ index, path: s.archivePath, captions: s.captionCount, diagnostics: s.validationFailure?.message ?? null })),
    selectedSourceIndex: opened.imported.selectedSourceIndex,
    suggestedTitle: ('name' in input && typeof input.name === 'string' ? input.name : 'LociMyu').replace(/\.[^.]*$/, ''),
    async evaluate(selection: number, title: string, confirmRelations = false) {
      const evaluated = await planLociMyuSource(opened, selection, title, confirmRelations);
      let mappedPreview: Awaited<ReturnType<typeof mapLociMyuProject>> | undefined;
      if (evaluated.plan) {
        try { mappedPreview = await mapLociMyuProject(evaluated.plan, '0'.repeat(32), originalProof.digest, { projectId: `prj_${'0'.repeat(32)}`, historyEpoch: `hep_${'0'.repeat(32)}`, lineageSeed: '0'.repeat(64) }); }
        catch (error) {
          if (!(error instanceof LociMyuPreflightError || error instanceof DomainValidationError)) throw error;
          evaluated.base.issues.push({ severity: 'blocking', sheet: null, row: null, sourceId: null, field: 'target', reason: error.message, impact: '省略・修正せずには保存できないため作成しません。', candidates: [] });
          evaluated.plan = null;
        }
      }
      const report = makeReport(originalProof, evaluated, mappedPreview);
      let attempt: Promise<Awaited<ReturnType<typeof create>>> | undefined;
      async function create() {
        const plan = evaluated.plan; if (!plan || !mappedPreview) return fileError('変換の問題を確認してください。');
        const conversionId = newId(), mapped = await mapLociMyuProject(plan, conversionId, originalProof.digest);
        const source = ProjectMetadataSource.bootstrap(mapped.records.schema, mapped.records.identity, metadata, { semanticProfile: 'map2' }).initialize(mapped.records);
        const media = mapped.records.mediaResourcesById as JsonObject;
        const provider = await readProjectScene(source.read(), metadata, { scope: 'development-validation', verify: async request => {
          const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-validation', outcome, ...(facts ? { facts } : {}) });
          if (request.records.length !== 1) return response('unsupported');
          const record = request.records[0]!; let facts: JsonObject;
          if (request.fact === 'media' && same(media[record.id as string], record)) facts = { mediaKind: 'image', mediaType: 'image/png' };
          else {
            const known = mapped.targetModels.get(record.id as string); if (!known || !same(known.record, record)) return response('unsupported'); const model = known.model;
            if (request.fact === 'representation') facts = { contentKind: 'mesh', staticPose: true, contentBoundsAsset: model.bounds, materials: [...model.materials], surfaceRanges: [...model.surfaceRanges] };
            else if (request.fact === 'family-envelope') facts = { logicalBoundsAsset: model.bounds, authority: { kind: 'source', representationId: record.id!, payloadDigest: record.payloadDigest! } };
            else if (request.fact === 'family-contribution') facts = { verifiedMembers: [{ id: record.id!, payloadDigest: record.payloadDigest! }] };
            else return response('unsupported');
          }
          checkContentFacts(request, facts); return response('verified', facts);
        } }, { verifyRetainedMedia: true });
        if (provider.kind !== 'scene-provider' || !metadataProviderReady(provider, metadata)) return fileError('元のモデル・記録の関係をそのまま変換できません。');
        const receipt: ConversionReceipt = { recipe: lociMyuRecipe, conversionId, projectId: `prj_${conversionId}`, original: originalProof,
          initial: { ...await lociMyuByteProof(source.encodeFullSource()), proof: source.proof }, selection, workbook: plan.workbook, confirmation: plan.confirmation, title,
          fingerprints: plan.fingerprints, inventory: plan.inventory, sourceIdentities: mapped.sourceIdentities, mapping: mapped.mapping, report: makeReport(originalProof, evaluated, mapped, source) };
        await verifyRetained(receipt, source, opened);
        return { source, async persist(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession) {
          const before = await session.read(), existing = await readLociMyuReceipt(fs);
          if (existing) { if (json(existing) !== json(receipt)) return fail(); return resumeLociMyuConversion(fs, store, session, limits, receipt.projectId, decode); }
          if (before.state !== 'empty') return fileError('作成先が空ではありません。既存の記録は変更していません。');
          await underWriteLease(fs, async () => {
            await writeLociMyuReceipt(fs, receipt);
            const old = await fs.readBytes(sourcePath(fs)); if (old && !equalBytes(old, opened.original)) return fail();
            if (!old) await fs.writeBytes(sourcePath(fs), opened.original);
            const saved = await fs.readBytes(sourcePath(fs)); if (!saved || !equalBytes(saved, opened.original)) return fail();
            await writeValidationInitial(fs, source, lociMyuRecipe);
          });
          const saved = await readLociMyuReceipt(fs), initial = await readValidationInitialRecord(fs);
          if (json(saved) !== json(receipt) || initial.receipt.digest !== receipt.initial.digest || initial.receipt.version !== 'validation-initial-2' || initial.receipt.originRecipe !== lociMyuRecipe) return fail();
          await verifyRetained(receipt, initial.source, opened);
          for (const b of mapped.blobs) await store.put(new Blob([b.bytes.slice().buffer]).stream(), b.ref.mediaType, b.ref);
          return session.createFromSource(source);
        } };
      }
      return { relation: evaluated.relation, summary: report.converted as JsonObject, blocked: !evaluated.plan,
        report: () => reportBlob(report), create: () => attempt ??= create() };
    },
  };
}
async function retained(fs: ProjectWorkspaceFS, limits: FileValidationLimits, projectId: string, decode?: PngDecoder) {
  const receipt = await readLociMyuReceipt(fs); if (!receipt) return fail(); await checkReceipt(receipt, projectId);
  const initial = await readValidationInitialRecord(fs);
  if (initial.receipt.byteLength !== receipt.initial.byteLength || initial.receipt.digest !== receipt.initial.digest || initial.receipt.version !== 'validation-initial-2' || initial.receipt.originRecipe !== lociMyuRecipe) return fail();
  const raw = await fs.readStream(sourcePath(fs)); if (!raw || raw.size !== receipt.original.byteLength) return fail();
  const original = await readValidationBody(raw, limits.maxFileBytes); if (await digest(original) !== receipt.original.digest) return fail();
  const opened = await openLociMyuSource(new Blob([original.slice().buffer]), limits, decode); if (!opened) return fail();
  const mapped = await verifyRetained(receipt, initial.source, opened); return { receipt, initial, mapped };
}
export async function resumeLociMyuConversion(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession, limits: FileValidationLimits, projectId: string, decode?: PngDecoder) {
  const { initial, mapped } = await retained(fs, limits, projectId, decode), before = await session.read();
  if (before.state === 'ready') { if (json(before.source!.proof) !== json(initial.source.proof)) return fail(); return before; }
  if (before.state !== 'pending' && before.state !== 'empty') return fail();
  for (const body of mapped.blobs) {
    const presence = await store.inspect(body.ref);
    if (presence === 'unverified') await store.put(new Blob([body.bytes.slice().buffer]).stream(), body.ref.mediaType, body.ref);
    else if (presence !== 'verified-present') return fileError('保存済みのモデルまたは画像に修復が必要です。');
  }
  return before.state === 'pending' ? session.recoverInitialization(initial.source) : session.createFromSource(initial.source);
}
/** Explicit private report export only; never part of any package output purpose. */
export async function readLociMyuConversionReport(fs: ProjectWorkspaceFS, limits: FileValidationLimits, projectId: string, decode?: PngDecoder): Promise<Blob | null> {
  if (!await hasLociMyuConversion(fs)) return null;
  return reportBlob((await retained(fs, limits, projectId, decode)).receipt.report);
}
