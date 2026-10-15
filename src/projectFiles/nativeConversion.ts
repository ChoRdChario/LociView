import { readNativePortableConversionV1 } from '../nativeGs/portablePackage';
import { nativeDisplaySetsV1, type NativeProjectSnapshotV1 } from '../nativeGs/schema';
import { nativeMaterialSlotKey } from '../nativeGs/materialSlots';
import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore, StoredBlobRef } from '../projectMetadata/blobStore';
import { ProjectMetadataSource, type MetadataProof } from '../projectMetadata/source';
import { metadataProviderReady, type MetadataProjectSession } from '../projectMetadata/session';
import { digest, equalBytes, json, metadataPath, newId, readReceipt, underWriteLease, writeReceipt } from '../projectMetadata/persistence';
import { readProjectScene } from '../scene/projectProvider';
import { checkContentFacts } from '../domain/projectContentChecks';
import { same } from '../domain/projectGraphSupport';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import { mapNativeProject, nativeConversionRecipe, nativeAppearanceRecipe, nativeJpegRecipe, nativeAppearanceJpegRecipe, nativeRecipeHasAppearance, nativeRecipeHasJpeg, nativeAppearanceIntent, type NativeConversionRecipe, type NativeMappingEntry, type NativeMaterialWitness, type NativeOccurrence } from './nativeMapping';
import { inspectValidationGlb, inspectValidationJpegGlb, validationGlbUsesJpeg, type ValidatedGlb } from './glb';
import { inspectOccurrenceGlb, inspectOccurrenceJpegGlb, decodeOccurrenceGlb } from './glbOccurrences';
import type { PngDecoder } from './png';
import { inspectValidationImage, type JpegDecoder } from './jpeg';
import { identityPlacement } from './initialProject';
import { readValidationBody } from './content';
import { readValidationInitialRecord, writeValidationInitial, validationInitialOrigin } from './creation';
import { checkFileLimits, fileError, occurrenceGlbProfile, occurrenceJpegGlbProfile, validationMetadataLimits as metadata, type FileValidationLimits } from './validation';

interface ByteProof { byteLength: number; digest: string }
interface ConversionReceipt {
  recipe: NativeConversionRecipe; conversionId: string; projectId: string;
  original: ByteProof; manifest: ByteProof; snapshot: ByteProof;
  initial: ByteProof & { proof: MetadataProof }; mapping: NativeMappingEntry[];
  materialWitness?: NativeMaterialWitness[];
  report: { models: number; scenes: number; captions: number; media: number; originalExcludedFromExports: true };
}
const receiptPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'native-conversion.json');
const sourcePath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'native-conversion-source.zip');
const proof = async (bytes: Uint8Array): Promise<ByteProof> => ({ byteLength: bytes.length, digest: await digest(bytes) });
export const hasNativeConversion = async (fs: ProjectWorkspaceFS, checkBoundInitial = true) => !!await fs.readStream(receiptPath(fs)) || !!await fs.readStream(sourcePath(fs)) ||
  checkBoundInitial && [nativeJpegRecipe, nativeAppearanceJpegRecipe].includes(await validationInitialOrigin(fs) as typeof nativeJpegRecipe | typeof nativeAppearanceJpegRecipe);
async function inspectNativeModel(bytes: Uint8Array, appearance: boolean, limits: FileValidationLimits, png?: PngDecoder, jpeg?: JpegDecoder) {
  const hasJpeg = validationGlbUsesJpeg(bytes, limits);
  const inspect = appearance ? hasJpeg ? inspectOccurrenceJpegGlb : inspectOccurrenceGlb : hasJpeg ? inspectValidationJpegGlb : inspectValidationGlb;
  return inspect(bytes, limits, png, jpeg);
}

function appearanceSourceKey(prefix: unknown, key: unknown, nested = false): boolean {
  if (typeof prefix !== 'string' || !Array.isArray(key)) return false;
  const simple: Record<string, string> = { ast: 'asset', rev: 'revision', bnd: 'binding', rep: 'representation', cap: 'caption', med: 'media',
    view: 'view', frm: 'frame', scn: 'display-set', lay: 'material-layout', tag: 'tag', ovr: 'mesh-appearance' };
  if (simple[prefix]) return key.length === 2 && key[0] === simple[prefix] && typeof key[1] === 'string';
  const pair: Record<string, string> = { fam: 'family', cmp: 'anchor-class', sam: 'scene-asset', scm: 'scene-caption', tgm: 'caption-tag' };
  if (pair[prefix]) return key.length === 3 && key[0] === pair[prefix] && key.slice(1).every(v => typeof v === 'string');
  const index = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  if (prefix === 'slot') return key.length === 4 && key[0] === 'material-occurrence' && typeof key[1] === 'string' && index(key[2]) && index(key[3]);
  if (prefix === 'att') return key.length === 4 && key[0] === 'attachment' && typeof key[1] === 'string' && index(key[2]) && typeof key[3] === 'string';
  return prefix === 'evt' && !nested && key.length === 3 && key[0] === 'initial-event' && appearanceSourceKey(key[1], key[2], true);
}

async function checkConversionReceipt(r: ConversionReceipt, projectId: string) {
  const keys = (v: unknown, names: string[]) => !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).sort().join(',') === names.sort().join(',');
  const byteProof = (p: ByteProof) => keys(p, ['byteLength', 'digest']) && Number.isSafeInteger(p.byteLength) && p.byteLength > 0 && /^[0-9a-f]{64}$/.test(p.digest);
  if (!keys(r, ['recipe', 'conversionId', 'projectId', 'original', 'manifest', 'snapshot', 'initial', 'mapping', 'report', ...(nativeRecipeHasAppearance(r.recipe) ? ['materialWitness'] : [])]) ||
    ![nativeConversionRecipe, nativeAppearanceRecipe, nativeJpegRecipe, nativeAppearanceJpegRecipe].includes(r.recipe) || r.projectId !== projectId || r.projectId !== `prj_${r.conversionId}` || !/^[0-9a-f]{32}$/.test(r.conversionId) ||
    !byteProof(r.original) || !byteProof(r.manifest) || !byteProof(r.snapshot) || !keys(r.initial, ['byteLength', 'digest', 'proof']) ||
    !byteProof({ byteLength: r.initial.byteLength, digest: r.initial.digest }) || !Array.isArray(r.mapping) || !r.mapping.length ||
    !keys(r.report, ['models', 'scenes', 'captions', 'media', 'originalExcludedFromExports']) || r.report.originalExcludedFromExports !== true ||
    ![r.report.models, r.report.scenes, r.report.captions, r.report.media].every(n => Number.isSafeInteger(n) && n >= 0))
    return fileError('変換元の記録を確認できません。');
  const ids = new Set<string>(), hashes = new Map<string, string>();
  for (const entry of r.mapping) {
    if (!keys(entry, ['id', 'sha256', 'preimage']) || typeof entry.id !== 'string' || typeof entry.preimage !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) || ids.has(entry.id) || !entry.preimage.startsWith(`lociview:${r.recipe}:id:jcs-v1\n`))
      return fileError('変換時の対応表を確認できません。');
    let value: unknown;
    try { value = JSON.parse(entry.preimage.slice(entry.preimage.indexOf('\n') + 1)); } catch { return fileError('変換時の対応表が不正です。'); }
    if (!Array.isArray(value) || value.length !== 4 || value[0] !== r.conversionId || value[1] !== r.original.digest ||
      !['ast', 'rev', 'bnd', 'rep', 'cap', 'med', 'view', 'frm', 'fam', 'cmp', 'scn', 'sam', 'scm', 'att', 'tag', 'tgm', 'lay', 'slot', 'evt', ...(nativeRecipeHasAppearance(r.recipe) ? ['ovr'] : [])].includes(value[2]) ||
      !Array.isArray(value[3]) || entry.id !== `${value[2]}_${entry.sha256.slice(0, 32)}` || await digest(new TextEncoder().encode(entry.preimage)) !== entry.sha256)
      return fileError('変換時の対応表が一致しません。');
    if (nativeRecipeHasAppearance(r.recipe) && !appearanceSourceKey(value[2], value[3])) return fileError('材質変換の識別情報が不正です。');
    if (nativeRecipeHasJpeg(r.recipe) && (entry.preimage !== `lociview:${r.recipe}:id:jcs-v1\n` + JSON.stringify(value) || hashes.has(entry.sha256) && hashes.get(entry.sha256) !== entry.preimage)) return fileError('変換時の対応表が一致しません。');
    ids.add(entry.id); hashes.set(entry.sha256, entry.preimage);
  }
}

function checkAppearanceSubset(snapshot: NativeProjectSnapshotV1, models: ReadonlyMap<string, ValidatedGlb>, rows: ReadonlyMap<string, readonly NativeOccurrence[]>, limits: FileValidationLimits) {
  if (!snapshot.meshMaterialAppearances?.length || snapshot.collaborationBaseline) return fileError('この材質設定を含むファイルは、まだ変換できません。');
  const families = new Map<string, number>(), targets = new Map<string, { row: NativeOccurrence; semantics: JsonValue | undefined }>(); let count = 0;
  for (const r of snapshot.representations) {
    if (r.role !== 'meshPrimary' || r.contentKind !== 'mesh' || r.formatProfile.id !== 'lociview-native-model-glb-v1' ||
      !same(r.purposes, ['source', 'display']) || !same({ ...r.representationToAsset }, { ...identityPlacement(), reflection: 'none' }) ||
      r.derivedFrom.length || r.proxyForGsVariantFamilyId !== undefined || r.gsPly !== undefined || r.pointPly !== undefined || r.blob.mediaType !== 'model/gltf-binary')
      return fileError('この検証版で変換できるモデルは、静的GLBのみです。');
    const key = `${r.assetId}/${r.variantFamilyId}`; families.set(key, (families.get(key) ?? 0) + 1);
    const model = models.get(r.id), slots = rows.get(r.id);
    if (!model?.occurrences || !slots || slots.length !== model.materials.length) return fileError('元の材質の対応が不足しています。');
    count += slots.length; if (count > limits.maxItems) return fileError('材質の面の数が検査の上限を超えています。');
    const semantics = new Map(model.materials.map(m => [(m.sourceLocator as JsonObject).slotIndex, m.sourceSemantics]));
    for (const row of slots) {
      const target = `${r.id}/${nativeMaterialSlotKey(row.childPath, row.materialArraySlot)}`;
      if (targets.has(target)) return fileError('元の材質の面が重複しています。');
      targets.set(target, { row, semantics: semantics.get(row.slotIndex) });
    }
  }
  const byRep = new Map(snapshot.representations.map(r => [r.id, r]));
  for (const a of snapshot.meshMaterialAppearances) {
    const r = byRep.get(a.representationId)!, target = targets.get(`${r.id}/${a.materialSlotKey}`);
    if (a.opacity !== 1 || a.chroma.enabled || !target || families.get(`${r.assetId}/${r.variantFamilyId}`) !== 1 ||
      !same(target.semantics, { coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'lit', doubleSided: false }))
      return fileError('この材質設定は、まだそのまま変換できません。不透明度1・透過色が無効の、不透明な元材質が対象です。');
  }
}

/** Check retained correspondence; never regenerate metadata or replace acknowledged evidence. */
async function verifyMaterialWitness(r: ConversionReceipt, source: ProjectMetadataSource, snapshot: NativeProjectSnapshotV1,
  models: ReadonlyMap<string, ValidatedGlb>, rows: ReadonlyMap<string, readonly NativeOccurrence[]>, limits: FileValidationLimits) {
  cloneCanonicalValue(r, metadata); await checkConversionReceipt(r, r.projectId);
  const count = [...rows.values()].reduce((n, list) => n + list.length, 0);
  if (!Array.isArray(r.materialWitness) || r.materialWitness.length !== count || count > limits.maxItems) return fileError('材質の対応表が不足しているか、検査の上限を超えています。');
  const inspection = await source.inspectOriginal({ maxNodes: metadata.maxNodes, maxWork: metadata.maxWork });
  const fields = new Map(inspection.candidates.fields.map(f => [JSON.stringify(f.path), f]));
  const exact = (path: string[]) => {
    const field = fields.get(JSON.stringify(path)), value = field?.valid && field.candidates.length === 1 ? field.candidates[0]!.value : undefined;
    if (value?.kind !== 'value') return fileError('変換時の初期記録が不明です。'); return value.value;
  };
  const mapping = new Map(r.mapping.map(entry => [entry.preimage, entry.id]));
  const mapped = (prefix: string, key: unknown[]) => {
    const value = mapping.get(`lociview:${r.recipe}:id:jcs-v1\n` + JSON.stringify([r.conversionId, r.original.digest, prefix, key]));
    if (!value) return fileError('変換時の識別情報が不足しています。'); return value;
  };
  const expected: NativeMaterialWitness[] = [], byTarget = new Map<string, NativeMaterialWitness>();
  for (const rep of snapshot.representations) {
    const id = mapped('rep', ['representation', rep.id]), record = exact(['representationsById', id]) as JsonObject;
    const layout = mapped('lay', ['material-layout', rep.id]), model = models.get(rep.id)!, sourceRows = rows.get(rep.id)!;
    const profile = await (model.jpeg ? occurrenceJpegGlbProfile() : occurrenceGlbProfile());
    const rowByRank = new Map(sourceRows.map(row => [row.slotIndex, row]));
    const slots = model.materials.map(material => { const row = rowByRank.get((material.sourceLocator as JsonObject).slotIndex as number)!;
      return { ...material, logicalMaterialSlotId: mapped('slot', ['material-occurrence', rep.id, row.nodeIndex, row.primitiveIndex]) }; });
    slots.sort((a, b) => a.logicalMaterialSlotId.localeCompare(b.logicalMaterialSlotId));
    if (!same(record.formatProfile, profile) || !same(record.blob, { ...rep.blob }) || !same(record.materialCatalog, { layoutId: layout, slots }) ||
      record.assetId !== mapped('ast', ['asset', rep.assetId]) || record.variantFamilyId !== mapped('fam', ['family', rep.assetId, rep.variantFamilyId]) ||
      record.representationFrameId !== mapped('frm', ['frame', rep.representationFrameId])) return fileError('元のモデルと変換時の材質記録が一致しません。');
    for (const row of sourceRows) {
      const witness: NativeMaterialWitness = { nativeRepresentationId: rep.id, sourceGlbSha256: rep.blob.digest,
        childPath: [...row.childPath], materialArraySlot: 0, nodeIndex: row.nodeIndex, primitiveIndex: row.primitiveIndex,
        sourceMaterialIndex: row.materialIndex, slotIndex: row.slotIndex, targetRepresentationId: id, targetProfile: { ...profile },
        targetMaterialLayoutId: layout, targetLogicalMaterialSlotId: mapped('slot', ['material-occurrence', rep.id, row.nodeIndex, row.primitiveIndex]) };
      expected.push(witness); byTarget.set(`${rep.id}/${nativeMaterialSlotKey(row.childPath, 0)}`, witness);
    }
  }
  expected.sort((a, b) => a.nativeRepresentationId.localeCompare(b.nativeRepresentationId) || a.nodeIndex - b.nodeIndex || a.primitiveIndex - b.primitiveIndex);
  if (json(expected) !== json(r.materialWitness)) return fileError('保持した材質の対応表が一致しません。補修していません。');
  const overrides = new Set(inspection.candidates.fields.filter(f => f.path[0] === 'materialOverridesById').map(f => f.path[1]));
  if (overrides.size !== snapshot.meshMaterialAppearances!.length) return fileError('材質設定の件数が一致しません。');
  const reps = new Map(snapshot.representations.map(rep => [rep.id, rep]));
  for (const a of snapshot.meshMaterialAppearances!) {
    const witness = byTarget.get(`${a.representationId}/${a.materialSlotKey}`)!, rep = reps.get(a.representationId)!;
    const key = ['mesh-appearance', a.id], id = mapped('ovr', key), intent = nativeAppearanceIntent(a);
    const target = { assetId: mapped('ast', ['asset', a.assetId]), variantFamilyId: mapped('fam', ['family', rep.assetId, rep.variantFamilyId]),
      materialLayoutId: witness.targetMaterialLayoutId, logicalMaterialSlotId: witness.targetLogicalMaterialSlotId };
    if (exact(['materialOverridesById', id, 'id']) !== id ||
      !same(exact(['materialOverridesById', id, 'routing']), { scope: { kind: 'scene', sceneId: mapped('scn', ['display-set', a.displaySetId]) }, target }) ||
      !same(exact(['materialOverridesById', id, 'appearance']), intent.appearance) || !same(exact(['materialOverridesById', id, 'compositing']), intent.compositing) ||
      !same(exact(['materialOverridesById', id, 'lifecycle']), { state: 'active', reason: 'initial', eventId: mapped('evt', ['initial-event', 'ovr', key]) }))
      return fileError('元の材質設定と初期記録が一致しません。');
  }
}

async function verifyJpegMapping(receipt: ConversionReceipt, source: ProjectMetadataSource, snapshot: NativeProjectSnapshotV1,
  models: ReadonlyMap<string, ValidatedGlb>, rows: ReadonlyMap<string, readonly NativeOccurrence[]>) {
  if (!nativeRecipeHasJpeg(receipt.recipe)) return;
  if (source.semanticProfile !== 'map2' || snapshot.collaborationBaseline || !same(receipt.report, {
    models: snapshot.assets.length, scenes: nativeDisplaySetsV1(snapshot).length, captions: snapshot.captions.length,
    media: snapshot.mediaResources?.length ?? 0, originalExcludedFromExports: true,
  })) return fileError('変換時の記録の版が一致しません。');
  for (const r of snapshot.representations) if (r.role !== 'meshPrimary' || r.contentKind !== 'mesh' || r.formatProfile.id !== 'lociview-native-model-glb-v1' ||
    !same(r.purposes, ['source', 'display']) || !same({ ...r.representationToAsset }, { ...identityPlacement(), reflection: 'none' }) ||
    r.derivedFrom.length || r.proxyForGsVariantFamilyId !== undefined || r.gsPly !== undefined || r.pointPly !== undefined || r.blob.mediaType !== 'model/gltf-binary')
    return fileError('元のモデルの形式をそのまま変換できません。');
  const expected = await mapNativeProject(snapshot, models, receipt.conversionId, receipt.original.digest,
    nativeRecipeHasAppearance(receipt.recipe) ? rows : undefined, source.proof.identity);
  const original = await source.inspectOriginal({ maxNodes: metadata.maxNodes, maxWork: metadata.maxWork });
  if (expected.recipe !== receipt.recipe || json(expected.mapping) !== json(receipt.mapping) || original.candidates.hasUnknownFields ||
    json(original.candidates.unambiguousRecords) !== json(expected.records)) return fileError('変換元と保持した初期記録が一致しません。');
}

/** No IDs or persistent state are allocated until the user confirms create(). */
export async function prepareNativeConversion(input: Blob, limits: FileValidationLimits, decode?: PngDecoder, jpeg?: JpegDecoder) {
  checkFileLimits(limits);
  const file = input.slice(0, input.size), native = await readNativePortableConversionV1(file, limits);
  if (!native) return null;
  const { snapshot } = native;
  if (snapshot.collaborationBaseline) return fileError('この共同作業用のNativeファイルは、まだ変換できません。');
  const appearance = !!snapshot.meshMaterialAppearances?.length;
  const sourceWitness = new Map<string, readonly NativeOccurrence[]>(); let occurrenceCount = 0;
  const models = new Map<string, ValidatedGlb>(), blobs: { ref: StoredBlobRef; bytes: Uint8Array }[] = [];
  for (const r of snapshot.representations) {
    if (r.role !== 'meshPrimary' || r.contentKind !== 'mesh' || r.formatProfile.id !== 'lociview-native-model-glb-v1' ||
      !same(r.purposes, ['source', 'display']) || !same({ ...r.representationToAsset }, { ...identityPlacement(), reflection: 'none' }) ||
      r.derivedFrom.length || r.proxyForGsVariantFamilyId !== undefined || r.gsPly !== undefined || r.pointPly !== undefined || r.blob.mediaType !== 'model/gltf-binary')
      return fileError('この検証版で変換できるモデルは、静的GLBのみです。');
    const bytes = native.bodies.get(native.manifest.representations.find(m => m.representationId === r.id)!.entry)!;
    if (await digest(bytes) !== r.blob.digest) return fileError('モデル本体が元の記録と一致しません。');
    const model = await inspectNativeModel(bytes, appearance, limits, decode, jpeg);
    models.set(r.id, model); blobs.push({ ref: { ...r.blob }, bytes });
    if (appearance) { occurrenceCount += model.occurrences!.length; if (occurrenceCount > limits.maxItems) return fileError('材質の面の数が検査の上限を超えています。');
      const decoded = await decodeOccurrenceGlb(model);
      try { sourceWitness.set(r.id, decoded.occurrenceSlots.map(({ node: _node, ...row }) => row)); } finally { decoded.dispose(); } }
  }
  for (const m of snapshot.mediaResources ?? []) {
    if (m.blob.mediaType !== 'image/png' && m.blob.mediaType !== 'image/jpeg') return fileError('この画像形式はまだ変換できません。');
    const bytes = native.bodies.get(native.manifest.media!.find(e => e.mediaId === m.id)!.entry)!;
    if (await digest(bytes) !== m.blob.digest) return fileError('画像本体が元の記録と一致しません。');
    if (await inspectValidationImage(bytes, limits, decode, jpeg) !== m.blob.mediaType) return fileError('画像本体の形式が一致しません。'); blobs.push({ ref: { ...m.blob }, bytes });
  }
  if (appearance) checkAppearanceSubset(snapshot, models, sourceWitness, limits);
  const originalBytes = await readValidationBody({ size: file.size, stream: () => file.stream() }, limits.maxFileBytes);
  const original = await proof(originalBytes), manifest = await proof(native.manifestBytes), snapshotProof = await proof(native.snapshotBytes);
  const report = { models: snapshot.assets.length, scenes: nativeDisplaySetsV1(snapshot).length, captions: snapshot.captions.length,
    media: snapshot.mediaResources?.length ?? 0, originalExcludedFromExports: true as const };
  let attempt: Promise<Awaited<ReturnType<typeof create>>> | undefined;
  async function create() {
    const conversionId = newId(), mapped = await mapNativeProject(snapshot, models, conversionId, original.digest, appearance ? sourceWitness : undefined);
    const source = ProjectMetadataSource.bootstrap(mapped.records.schema, mapped.records.identity, metadata, { semanticProfile: 'map2' }).initialize(mapped.records);
    // Full target graph admission with owned, already inspected input. No second decode per content fact.
    const targetModels = mapped.targetModels;
    const targetMedia = mapped.records.mediaResourcesById as JsonObject;
    const provider = await readProjectScene(source.read(), metadata, { scope: 'development-validation', verify: async request => {
      const response = (outcome: string, facts?: JsonObject) => ({ request, scope: 'development-validation', outcome, ...(facts ? { facts } : {}) });
      if (request.records.length !== 1) return response('unsupported');
      const record = request.records[0]!; let facts: JsonObject;
      if (request.fact === 'media' && same(targetMedia[record.id as string], record)) facts = { mediaKind: 'image', mediaType: (record.blob as JsonObject).mediaType! };
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
    const receipt: ConversionReceipt = { recipe: mapped.recipe, conversionId, projectId: `prj_${conversionId}`,
      original, manifest, snapshot: snapshotProof, initial: { ...await proof(bytes), proof: source.proof }, mapping: mapped.mapping, report,
      ...(appearance ? { materialWitness: mapped.materialWitness } : {}) };
    if (appearance) await verifyMaterialWitness(receipt, source, snapshot, models, sourceWitness, limits);
    await verifyJpegMapping(receipt, source, snapshot, models, sourceWitness);
    return { source, async persist(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession) {
      const before = await session.read();
      const existing = await readReceipt<ConversionReceipt>(fs, receiptPath(fs), metadata);
      if (existing) {
        if (json(existing) !== json(receipt)) return fileError('作成先は別のプロジェクトです。');
        return resumeNativeConversion(fs, store, session, limits, receipt.projectId, decode, jpeg);
      }
      if (before.state !== 'empty') return fileError('作成先が空ではありません。');
      await underWriteLease(fs, async () => {
        await writeReceipt(fs, receiptPath(fs), receipt, metadata);
        const old = await fs.readBytes(sourcePath(fs));
        if (old && !equalBytes(old, originalBytes)) return fileError('変換元の記録が一致しません。上書きしていません。');
        if (!old) await fs.writeBytes(sourcePath(fs), originalBytes);
        const saved = await fs.readBytes(sourcePath(fs));
        if (!saved || !equalBytes(saved, originalBytes)) return fileError('変換元の記録を保持できません。');
        await writeValidationInitial(fs, source, receipt.recipe === nativeJpegRecipe || receipt.recipe === nativeAppearanceJpegRecipe ? receipt.recipe : undefined);
      });
      if (appearance || nativeRecipeHasJpeg(receipt.recipe)) {
        const saved = await readReceipt<ConversionReceipt>(fs, receiptPath(fs), metadata), retained = await readValidationInitialRecord(fs);
        if (json(saved) !== json(receipt) || retained.receipt.digest !== receipt.initial.digest) return fileError('変換時の材質記録が一致しません。');
        if (appearance) await verifyMaterialWitness(receipt, retained.source, snapshot, models, sourceWitness, limits);
        await verifyJpegMapping(receipt, retained.source, snapshot, models, sourceWitness);
      }
      for (const body of blobs) await store.put(new Blob([body.bytes.slice().buffer]).stream(), body.ref.mediaType, body.ref);
      return session.createFromSource(source);
    } };
  }
  return { summary: Object.freeze({ ...report }), create: () => attempt ??= create() };
}

/** Cold recovery checks retained input; it never regenerates IDs or initial Automerge changes. */
export async function resumeNativeConversion(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession,
  limits: FileValidationLimits, projectId: string, decode?: PngDecoder, jpeg?: JpegDecoder) {
  const receipt = await readReceipt<ConversionReceipt>(fs, receiptPath(fs), metadata);
  if (!receipt) return fileError('変換元の記録を確認できません。');
  await checkConversionReceipt(receipt, projectId);
  const { source, receipt: initial } = await readValidationInitialRecord(fs);
  if ((nativeRecipeHasJpeg(receipt.recipe) ? initial.version !== 'validation-initial-2' || initial.originRecipe !== receipt.recipe : initial.version !== 'validation-initial-1') || source.proof.identity.projectId !== projectId || json(source.proof) !== json(receipt.initial.proof) || initial.byteLength !== receipt.initial.byteLength ||
    initial.digest !== receipt.initial.digest) return fileError('変換時の初期記録が一致しません。');
  // A changed receipt must not downgrade retained recipe-2 source into the old retry path.
  if (receipt.recipe === nativeConversionRecipe && source.read().history.changes.some(c => c.writes.some(w =>
    w.path[0] === 'materialOverridesById' || w.path[0] === 'representationsById' && w.value.kind === 'value' &&
      ['development-validation-glb-occurrence-1', 'development-validation-glb-jpeg-1', 'development-validation-glb-occurrence-jpeg-1'].includes(String(((w.value.value as JsonObject).formatProfile as JsonObject)?.id)))))
    return fileError('材質変換の版と初期記録が一致しません。');
  const saved = await fs.readStream(sourcePath(fs));
  if (!saved || saved.size !== receipt.original.byteLength) return fileError('変換元ファイルの記録が不足しています。');
  const original = await readValidationBody(saved, limits.maxFileBytes);
  if (await digest(original) !== receipt.original.digest) return fileError('変換元ファイルの記録が一致しません。');
  let checkedNative: NonNullable<Awaited<ReturnType<typeof readNativePortableConversionV1>>> | undefined;
  if (nativeRecipeHasAppearance(receipt.recipe) || nativeRecipeHasJpeg(receipt.recipe)) {
    checkedNative = await readNativePortableConversionV1(new Blob([original.slice().buffer]), limits) ?? undefined;
    if (!checkedNative || json(await proof(checkedNative.manifestBytes)) !== json(receipt.manifest) || json(await proof(checkedNative.snapshotBytes)) !== json(receipt.snapshot)) return fileError('変換元の内容が記録と一致しません。');
    const models = new Map<string, ValidatedGlb>(), rows = new Map<string, readonly NativeOccurrence[]>(); let occurrenceCount = 0;
    for (const r of checkedNative.snapshot.representations) {
      const body = checkedNative.bodies.get(checkedNative.manifest.representations.find(m => m.representationId === r.id)!.entry)!;
      if (await digest(body) !== r.blob.digest) return fileError('元のモデル本体が一致しません。');
      const model = await inspectNativeModel(body, nativeRecipeHasAppearance(receipt.recipe), limits, decode, jpeg); models.set(r.id, model);
      if (nativeRecipeHasAppearance(receipt.recipe)) {
        occurrenceCount += model.occurrences!.length; if (occurrenceCount > limits.maxItems) return fileError('材質の面の数が検査の上限を超えています。');
        const decoded = await decodeOccurrenceGlb(model);
        try { rows.set(r.id, decoded.occurrenceSlots.map(({ node: _node, ...row }) => row)); } finally { decoded.dispose(); }
      }
    }
    if (nativeRecipeHasJpeg(receipt.recipe)) {
      let hasJpeg = [...models.values()].some(m => m.jpeg);
      for (const m of checkedNative.snapshot.mediaResources ?? []) {
        const body = checkedNative.bodies.get(checkedNative.manifest.media!.find(e => e.mediaId === m.id)!.entry)!;
        if (await inspectValidationImage(body, limits, decode, jpeg) !== m.blob.mediaType) return fileError('元の画像形式が一致しません。');
        hasJpeg ||= m.blob.mediaType === 'image/jpeg';
      }
      if (!hasJpeg || !!checkedNative.snapshot.meshMaterialAppearances?.length !== nativeRecipeHasAppearance(receipt.recipe))
        return fileError('変換の版と変換元が一致しません。');
    }
    if (nativeRecipeHasAppearance(receipt.recipe)) {
      checkAppearanceSubset(checkedNative.snapshot, models, rows, limits);
      await verifyMaterialWitness(receipt, source, checkedNative.snapshot, models, rows, limits);
    }
    await verifyJpegMapping(receipt, source, checkedNative.snapshot, models, rows);
  }
  const before = await session.read();
  if (before.state === 'ready') {
    if (json(before.source!.proof) !== json(source.proof)) return fileError('再開先のプロジェクトが一致しません。');
    return before;
  }
  if (before.state !== 'pending' && before.state !== 'empty') return fileError('変換が未完了です。修復が必要です。');
  const native = checkedNative ?? await readNativePortableConversionV1(new Blob([original.slice().buffer]), limits);
  if (!native || json(await proof(native.manifestBytes)) !== json(receipt.manifest) || json(await proof(native.snapshotBytes)) !== json(receipt.snapshot))
    return fileError('変換元の内容が記録と一致しません。');
  if (!!native.snapshot.meshMaterialAppearances?.length !== (nativeRecipeHasAppearance(receipt.recipe)))
    return fileError('材質変換の版と変換元が一致しません。');
  for (const item of [...native.manifest.representations, ...native.manifest.media ?? []]) {
    const ref: StoredBlobRef = { algorithm: item.algorithm, digest: item.digest, byteLength: item.byteLength, mediaType: item.mediaType };
    const presence = await store.inspect(ref);
    if (presence === 'unverified') await store.put(new Blob([native.bodies.get(item.entry)!.slice().buffer]).stream(), ref.mediaType, ref);
    else if (presence !== 'verified-present') return fileError('記録済みのモデルまたは画像に修復が必要です。');
  }
  return before.state === 'pending' ? session.recoverInitialization(source) : session.createFromSource(source);
}
