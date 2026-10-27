import { openNativePortableConversionStreamsV1 } from '../nativeGs/portablePackage';
import { digestNativeStream } from '../nativeGs/sha256';
import { NATIVE_GS_PROFILE_ID, NATIVE_POINT_PROFILE_ID, nativeDisplaySetsV1, type NativeProjectSnapshotV1 } from '../nativeGs/schema';
import { nativeMaterialSlotKey } from '../nativeGs/materialSlots';
import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore, StoredBlobRef } from '../projectMetadata/blobStore';
import { ProjectMetadataSource, type MetadataProof } from '../projectMetadata/source';
import { TransactionJournal } from '../projectMetadata/journal';
import { metadataProviderReady, type MetadataProjectSession } from '../projectMetadata/session';
import { digest, json, metadataPath, newId, readReceipt, underWriteLease, writeReceipt } from '../projectMetadata/persistence';
import { checkContentFacts } from '../domain/projectContentChecks';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { readProjectScene } from '../scene/projectProvider';
import { mapNativeProject, nativeSpatialRecipe, type NativeModelFacts, type NativeMaterialWitness, type NativeMappingEntry, type NativeOccurrence } from './nativeMapping';
import { nativePointSourceProfile, nativeProxySourceProfile, nativeSpatialModelBounds } from './nativeSpatial';
import { inspectPointPly } from './pointPly';
import { inspectGsPlyStream, gsSourceProfile, gsBlobStream } from './gsPly';
import { inspectValidationGlb, inspectValidationJpegGlb, validationGlbUsesJpeg } from './glb';
import { inspectOccurrenceGlb, inspectOccurrenceJpegGlb, captureLegacyOccurrenceProof } from './glbOccurrences';
import { readValidationBody, validationGsEquivalenceSource } from './content';
import { assertValidationModelClosures, validationDeclaredBodyBytes } from './modelFacts';
import { inspectProjectImage, projectImageMime, type PhotoDecoder } from './photo';
import { identityPlacement } from './initialProject';
import { readValidationInitialRecord, writeValidationInitial } from './creation';
import { projectFilePolicy, fileError, validationMetadataLimits as metadata, type ProjectFilePolicyInput } from './validation';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';

type Archive = NonNullable<Awaited<ReturnType<typeof openNativePortableConversionStreamsV1>>>;
type ByteProof = {byteLength: number; digest: string};
type Mapped = Awaited<ReturnType<typeof mapNativeProject>>;
interface Receipt {
  recipe: typeof nativeSpatialRecipe; conversionId: string; projectId: string;
  original: ByteProof; originalRef: StoredBlobRef; manifest: ByteProof; snapshot: ByteProof;
  initial: ByteProof & {proof: MetadataProof}; mapping: NativeMappingEntry[];
  materialWitness: NativeMaterialWitness[]; spatialWitness: JsonObject[];
  report: {models: number; scenes: number; captions: number; media: number; originalExcludedFromExports: true;
    effects: {nativePointUnitsPreserved: true; existingPinsPreserved: true; gsDisplayMayDiffer: boolean; proxySelectionDoubleSided: boolean}};
}
const path = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'native-conversion.json');
const same = (a: unknown, b: unknown) => a === undefined || b === undefined ? a === b : json(a) === json(b);
const proof = async (bytes: Uint8Array): Promise<ByteProof> => ({byteLength: bytes.length, digest: await digest(bytes)});
const originalProof = async (source: Archive['original'], signal?: AbortSignal): Promise<ByteProof> => {const p = await digestNativeStream(source.stream(),signal); return {byteLength: p.byteLength, digest: p.sha256};};
const spatial = (s: NativeProjectSnapshotV1) => s.representations.some(r => r.role !== 'meshPrimary');
function reportFor(snapshot: NativeProjectSnapshotV1): Receipt['report'] {
  return {models: snapshot.assets.length, scenes: nativeDisplaySetsV1(snapshot).length, captions: snapshot.captions.length, media: snapshot.mediaResources?.length ?? 0,
    originalExcludedFromExports: true, effects: {nativePointUnitsPreserved: true, existingPinsPreserved: true,
      gsDisplayMayDiffer: snapshot.representations.some(r => r.role === 'gsPrimary'), proxySelectionDoubleSided: snapshot.representations.some(r => r.role === 'interactionProxy')}};
}

/** Serial, bounded source inspection. Only compact checked facts survive each body. */
async function inspect(archive: Archive, budget: ProjectFilePolicyInput, png?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder, signal?: AbortSignal) {
  const policy = projectFilePolicy(budget), limits = policy.nonGs, snapshot = archive.snapshot;
  if (!spatial(snapshot) || snapshot.collaborationBaseline) return fileError('このNativeファイルはこの変換経路の対象ではありません。');
  const models = new Map<string, NativeModelFacts>(), rows = new Map<string, readonly NativeOccurrence[]>();
  const publicBodies: {entry: string; ref: StoredBlobRef}[] = [], sizes = new Map<string, number>(); let total = 0, occurrenceCount = 0;
  const add = (entry: string, ref: StoredBlobRef) => {
    const old = sizes.get(ref.digest);
    if (old !== undefined && old !== ref.byteLength) return fileError('同じ本体の大きさが一致しません。');
    if (old === undefined) {total += ref.byteLength; sizes.set(ref.digest, ref.byteLength);}
    if (total > Math.min(536870912, policy.projectBodyBytes)) return fileError('モデルと画像の合計が変換の上限を超えています。');
    publicBodies.push({entry, ref});
  };
  for (const r of snapshot.representations) {
    signal?.throwIfAborted();
    const entry = archive.manifest.representations.find(m => m.representationId === r.id)!.entry, source = archive.bodies.get(entry)!;
    const gs = r.role === 'gsPrimary', point = r.role === 'pointPrimary', proxy = r.role === 'interactionProxy';
    if ((!gs && !point && !proxy && r.role !== 'meshPrimary') || source.size > (gs ? policy.gs : limits).maxFileBytes ||
      !same(r.purposes, proxy ? ['interaction'] : ['source', 'display']) || (!proxy && r.derivedFrom.length) ||
      (!gs && !proxy && r.proxyForGsVariantFamilyId !== undefined)) return fileError('モデルの形式や対応をそのまま変換できません。');
    const ref: StoredBlobRef = {...r.blob, ...(gs || point ? {mediaType: 'application/ply'} : {})}; add(entry, ref);
    if (gs) {
      if (r.formatProfile.id !== NATIVE_GS_PROFILE_ID || r.contentKind !== 'gaussianSplat' || r.blob.mediaType !== 'application/octet-stream' || !r.gsPly || r.pointPly) return fileError('GSの元の形式を確認できません。');
      const model = await inspectGsPlyStream(source, policy.gs, {representationToAsset: {...r.representationToAsset}},signal);
      if (!same(r.gsPly, {shDegree: model.degree, splatCount: model.count, headerByteLength: model.headerBytes, recordStrideBytes: model.stride, payloadByteLength: source.size - model.headerBytes}) ||
        model.digest !== ref.digest || model.byteLength !== ref.byteLength) return fileError('GSの本体と元の記録が一致しません。');
      models.set(r.id, {bounds: model.bounds, materials: model.materials, surfaceRanges: model.surfaceRanges});
      continue;
    }
    const bytes = await readValidationBody(source, limits.maxFileBytes);
    if (await digest(bytes) !== ref.digest) return fileError('モデルの本体と元の記録が一致しません。');
    if (point) {
      if (r.formatProfile.id !== NATIVE_POINT_PROFILE_ID || r.contentKind !== 'pointCloud' || r.blob.mediaType !== 'application/octet-stream' || !r.pointPly || r.gsPly) return fileError('点群の元の形式を確認できません。');
      const model = await inspectPointPly(bytes, limits), header = new TextDecoder('ascii').decode(bytes.subarray(0,65536)).match(/(?:^|\r?\n)end_header\r?\n/);
      if (!header || !same(r.pointPly, {pointCount: model.positions.length / 3, headerByteLength: header.index! + header[0].length, encoding: 'ascii'})) return fileError('点群の本体と元の記録が一致しません。');
      const record = {formatProfile: await nativePointSourceProfile(), representationToAsset: {...r.representationToAsset}};
      models.set(r.id, {bounds: nativeSpatialModelBounds(record, model), materials: model.materials, surfaceRanges: model.surfaceRanges});
      continue;
    }
    if (r.contentKind !== 'mesh' || r.formatProfile.id !== 'lociview-native-model-glb-v1' || r.blob.mediaType !== 'model/gltf-binary' || r.gsPly || r.pointPly ||
      !proxy && !same(r.representationToAsset, {...identityPlacement(), reflection: 'none'})) return fileError('このモデル形式はまだ変換できません。GLBが対象です。');
    if (proxy) {
      const parent = snapshot.representations.find(s => s.id === r.derivedFrom[0]);
      if (r.derivedFrom.length !== 1 || !parent || parent.role !== 'gsPrimary' || parent.assetId !== r.assetId ||
        parent.variantFamilyId !== r.proxyForGsVariantFamilyId || r.variantFamilyId === parent.variantFamilyId) return fileError('位置指定用の面とGSの対応が不正です。');
    }
    const usesJpeg = validationGlbUsesJpeg(bytes, limits), inspectGlb = proxy ? usesJpeg ? inspectValidationJpegGlb : inspectValidationGlb : usesJpeg ? inspectOccurrenceJpegGlb : inspectOccurrenceGlb;
    const model = await inspectGlb(bytes, limits, png, jpeg);
    if (!proxy) {
      occurrenceCount += model.occurrences!.length; if (occurrenceCount > limits.maxItems) return fileError('材質の面の数が上限を超えています。');
      const captured = await captureLegacyOccurrenceProof(model,signal);
      rows.set(r.id, captured.rows.map(row => ({childPath: [...row.childPath], materialArraySlot: row.materialArraySlot, nodeIndex: row.nodeIndex, primitiveIndex: row.primitiveIndex, materialIndex: row.materialIndex, slotIndex: row.slotIndex})));
    }
    models.set(r.id, {bounds: proxy ? nativeSpatialModelBounds({formatProfile: await nativeProxySourceProfile(), representationToAsset: {...r.representationToAsset}}, model) : model.bounds,
      materials: model.materials, surfaceRanges: model.surfaceRanges, ...(model.jpeg ? {jpeg: true as const} : {}), ...(model.occurrences ? {occurrences: model.occurrences} : {})});
  }
  for (const revision of snapshot.assetRevisions) {
    const reps = revision.representationIds.map(id => snapshot.representations.find(r => r.id === id)!), visuals = reps.filter(r => r.role !== 'interactionProxy'), proxies = reps.filter(r => r.role === 'interactionProxy');
    if (visuals.length !== 1 || proxies.length > 1 || proxies.length && (visuals[0]!.role !== 'gsPrimary' || proxies[0]!.derivedFrom[0] !== visuals[0]!.id)) return fileError('保持されたモデル履歴の組み合わせにはまだ対応していません。');
  }
  for (const a of snapshot.meshMaterialAppearances ?? []) {
    const r = snapshot.representations.find(r => r.id === a.representationId)!, row = rows.get(r.id)?.find(row => nativeMaterialSlotKey(row.childPath, row.materialArraySlot) === a.materialSlotKey);
    const material = row && models.get(r.id)!.materials.find(m => (m.sourceLocator as JsonObject).slotIndex === row.slotIndex);
    if (r.role !== 'meshPrimary' || !row || !material || a.opacity !== 1 || a.chroma.enabled ||
      snapshot.representations.filter(s => s.assetId === r.assetId && s.variantFamilyId === r.variantFamilyId).length !== 1 ||
      !same(material.sourceSemantics, {coverage: {kind: 'opaque'}, optics: 'surface', lighting: 'lit', doubleSided: false})) return fileError('この材質設定はまだそのまま変換できません。');
  }
  for (const m of snapshot.mediaResources ?? []) {
    signal?.throwIfAborted();
    if (!projectImageMime(m.blob.mediaType)) return fileError('この画像形式はまだ変換できません。');
    const entry = archive.manifest.media!.find(s => s.mediaId === m.id)!.entry, source = archive.bodies.get(entry)!; add(entry, {...m.blob});
    const bytes = await readValidationBody(source, limits.maxFileBytes);
    if (await digest(bytes) !== m.blob.digest || await inspectProjectImage(bytes, limits, png, jpeg, photo) !== m.blob.mediaType) return fileError('画像の本体と元の記録が一致しません。');
  }
  signal?.throwIfAborted();
  return {models, rows, publicBodies};
}

function witnesses(snapshot: NativeProjectSnapshotV1, mapped: Mapped, conversionId: string, sourceDigest: string): JsonObject[] {
  const entries = new Map(mapped.mapping.map(m => [m.preimage, m.id]));
  return snapshot.representations.map(r => {
    const id = entries.get(`lociview:${nativeSpatialRecipe}:id:jcs-v1\n` + JSON.stringify([conversionId, sourceDigest, 'rep', ['representation',r.id]]))!;
    const target = mapped.targetModels.get(id)!.record;
    return {nativeRepresentationId: r.id, sourceBlob: {...r.blob}, sourceProfile: {...r.formatProfile}, sourceRepresentationFrameId: r.representationFrameId, targetRepresentationFrameId: target.representationFrameId!, targetRepresentationId: id, targetBlob: target.blob!, targetProfile: target.formatProfile!, representationToAsset: target.representationToAsset!,
      logicalBoundsAsset: target.logicalBoundsAsset!, derivedFrom: target.derivedFrom!, proxyForGsVariantFamilyId: target.proxyForGsVariantFamilyId ?? null, nativePlyFacts: r.gsPly ? {...r.gsPly} : r.pointPly ? {...r.pointPly} : null};
  }).sort((a,b) => String(a.nativeRepresentationId).localeCompare(String(b.nativeRepresentationId)));
}
async function admit(source: ProjectMetadataSource, mapped: Mapped, budget: ProjectFilePolicyInput) {
  const provider = await readProjectScene(source.read(), metadata, {scope: 'development-validation', verify: async request => {
    let facts: JsonObject;
    if (validationGsEquivalenceSource(request)) facts = {equivalentVariantFamilyIds: request.context.targetVariantFamilyIds!};
    else if (request.records.length === 1) {
      const record = request.records[0]!, known = mapped.targetModels.get(record.id as string);
      if (request.fact === 'media' && same((mapped.records.mediaResourcesById as JsonObject)[record.id as string], record)) facts = {mediaKind: 'image', mediaType: (record.blob as JsonObject).mediaType!};
      else if (!known || !same(known.record, record)) return {request, scope: 'development-validation', outcome: 'unsupported'};
      else if (request.fact === 'representation') facts = {contentKind: record.contentKind!, staticPose: true, contentBoundsAsset: known.model.bounds, materials: [...known.model.materials], surfaceRanges: [...known.model.surfaceRanges]};
      else if (request.fact === 'family-envelope') facts = {logicalBoundsAsset: known.model.bounds, authority: {kind: record.role === 'interactionProxy' ? 'first-verified-output' : 'source', representationId: record.id!, payloadDigest: record.payloadDigest!}};
      else if (request.fact === 'family-contribution') facts = {verifiedMembers: [{id: record.id!, payloadDigest: record.payloadDigest!}]};
      else return {request, scope: 'development-validation', outcome: 'unsupported'};
    } else return {request, scope: 'development-validation', outcome: 'unsupported'};
    checkContentFacts(request, facts); return {request, scope: 'development-validation', outcome: 'verified', facts};
  }}, {verifyRetainedMedia: true});
  if (provider.kind !== 'scene-provider' || !metadataProviderReady(provider, metadata)) return fileError('モデルや記録の対応をそのまま変換できません。');
  assertValidationModelClosures(provider); validationDeclaredBodyBytes(provider, projectFilePolicy(budget));
  for (const [id, expected] of mapped.reviewStates) {
    const anchor = provider.resources.captions[id]?.anchor; if (anchor?.kind !== 'value') return fileError('記録の位置を確認できません。');
    const owner = anchor.value.kind === 'asset' ? provider.resources.assets[anchor.value.assetId]?.projection : undefined;
    if (anchor.value.kind === 'asset' && owner?.kind !== 'value' || (anchor.value.kind === 'asset' && owner?.kind === 'value' && !owner.value.anchorCompatibilityIds.includes(anchor.value.authoredAnchorCompatibilityId)) !== expected) return fileError('要確認ピンの状態をそのまま変換できません。');
  }
}
function checkReceipt(r: Receipt, projectId: string) {
  cloneCanonicalValue(r, metadata);
  const keys = (value: unknown, names: string[]) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === names.sort().join(',');
  if (!r || Object.keys(r).sort().join(',') !== ['recipe','conversionId','projectId','original','originalRef','manifest','snapshot','initial','mapping','materialWitness','spatialWitness','report'].sort().join(',') ||
    r.recipe !== nativeSpatialRecipe || !/^[0-9a-f]{32}$/.test(r.conversionId) || r.projectId !== projectId || projectId !== `prj_${r.conversionId}` ||
    ![r.original,r.manifest,r.snapshot].every(p => keys(p,['byteLength','digest'])) || !keys(r.initial,['byteLength','digest','proof']) ||
    !same(r.originalRef, {algorithm: 'sha256', digest: r.original.digest, byteLength: r.original.byteLength, mediaType: 'application/zip'}) ||
    ![r.original,r.manifest,r.snapshot,r.initial].every(p => p && Number.isSafeInteger(p.byteLength) && p.byteLength > 0 && /^[0-9a-f]{64}$/.test(p.digest)) ||
    !Array.isArray(r.mapping) || !Array.isArray(r.spatialWitness) || !Array.isArray(r.materialWitness)) return fileError('変換元の記録を確認できません。');
}
async function started(fs: ProjectWorkspaceFS, expected: MetadataProof): Promise<boolean> {
  const entries = await new TransactionJournal(fs, metadata).entries();
  if (!entries.length) return false;
  if (entries[0]!.start.purpose !== 'initialize' || !same(entries[0]!.start.proof, expected)) return fileError('変換先の初期化記録が一致しません。');
  return true;
}

/** Contextual recovery affordance; never offers re-creation after acknowledgement. */
export async function nativeSpatialConversionSourceRequired(fs: ProjectWorkspaceFS, store: OriginBlobStore): Promise<boolean> {
  const receipt = await readReceipt<Receipt>(fs,path(fs),metadata);
  if (!receipt || receipt.recipe !== nativeSpatialRecipe) return false;
  checkReceipt(receipt,receipt.projectId);
  const initial = await readValidationInitialRecord(fs);
  return !await started(fs,initial.source.proof) && await store.inspect(receipt.originalRef) === 'unverified';
}

export async function prepareNativeSpatialConversion(input: Blob, budget: ProjectFilePolicyInput, png?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const policy = projectFilePolicy(budget), file = Blob.prototype.slice.call(input) as Blob;
  const archive = await openNativePortableConversionStreamsV1(file, { ...policy.nonGs, maxFileBytes: Math.min(536870912, policy.gs.maxFileBytes) },signal);
  if (!archive) return null;
  let inspected: Awaited<ReturnType<typeof inspect>>, original: ByteProof, manifest: ByteProof, snapshotProof: ByteProof;
  try {
    if (!spatial(archive.snapshot)) return null;
    inspected = await inspect(archive, policy, png, jpeg, photo,signal); original = await originalProof(archive.original,signal);
    manifest = await proof(archive.manifestBytes); snapshotProof = await proof(archive.snapshotBytes);
  } finally {await archive.close();}
  signal?.throwIfAborted();
  const snapshot = archive.snapshot, report = reportFor(snapshot);
  let attempt: Promise<Awaited<ReturnType<typeof create>>> | undefined;
  async function create() {
    const conversionId = newId(), mapped = await mapNativeProject(snapshot, inspected.models, conversionId, original.digest, inspected.rows);
    const source = ProjectMetadataSource.bootstrap(mapped.records.schema, mapped.records.identity, metadata, {semanticProfile: 'map2'}).initialize(mapped.records);
    await admit(source, mapped, policy);
    const receipt: Receipt = {recipe: nativeSpatialRecipe, conversionId, projectId: `prj_${conversionId}`, original, originalRef: {algorithm: 'sha256', ...original, mediaType: 'application/zip'},
      manifest, snapshot: snapshotProof, initial: {...await proof(source.encodeFullSource()), proof: source.proof}, mapping: mapped.mapping, materialWitness: mapped.materialWitness, spatialWitness: witnesses(snapshot,mapped,conversionId,original.digest), report};
    return {source, async persist(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession) {
      const old = await readReceipt<Receipt>(fs, path(fs), metadata);
      if (old && !same(old,receipt)) return fileError('作成先は別の変換処理です。');
      if (!old) {
        if ((await session.read()).state !== 'empty') return fileError('作成先が空ではありません。');
        await underWriteLease(fs, async () => {await writeValidationInitial(fs, source, nativeSpatialRecipe); await writeReceipt(fs, path(fs), receipt, metadata);});
      }
      return resumeNativeSpatialConversion(fs, store, session, policy, receipt.projectId, png, jpeg, photo, file);
    }};
  }
  return {summary: Object.freeze({...report, effects: Object.freeze({...report.effects}), nativeSpatial: Object.freeze({points: snapshot.representations.filter(r => r.role === 'pointPrimary').length,
    gs: snapshot.representations.filter(r => r.role === 'gsPrimary').length, proxies: snapshot.representations.filter(r => r.role === 'interactionProxy').length})}), create: () => attempt ??= create()};
}

/** Fixed identity/initial bytes, original-CAS acknowledgement and complete source proof on every retry. */
export async function resumeNativeSpatialConversion(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession,
  budget: ProjectFilePolicyInput, projectId: string, png?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder, reselected?: Blob) {
  const receipt = await readReceipt<Receipt>(fs,path(fs),metadata); if (!receipt) return fileError('変換元の記録がありません。'); checkReceipt(receipt, projectId);
  const policy = projectFilePolicy(budget), initial = await readValidationInitialRecord(fs), source = initial.source;
  if (initial.receipt.version !== 'validation-initial-2' || initial.receipt.originRecipe !== nativeSpatialRecipe || !same(initial.receipt.proof, receipt.initial.proof) ||
    initial.receipt.digest !== receipt.initial.digest || initial.receipt.byteLength !== receipt.initial.byteLength) return fileError('変換時の初期記録が一致しません。');
  const acknowledged = await started(fs, source.proof), state = await store.inspect(receipt.originalRef);
  if (state === 'unverified' && !acknowledged) {
    if (!reselected || reselected.size !== receipt.original.byteLength) return fileError('変換元のファイルを選び直して再開してください。');
    const blob = Blob.prototype.slice.call(reselected) as Blob, p = await digestNativeStream(gsBlobStream(blob));
    if (p.sha256 !== receipt.original.digest || p.byteLength !== receipt.original.byteLength) return fileError('選択したファイルは変換元と一致しません。');
    await store.put(gsBlobStream(blob), 'application/zip', receipt.originalRef);
  } else if (state !== 'verified-present') return fileError('保持した変換元の本体に修復が必要です。');
  const stored = await store.openReadOnly(receipt.originalRef);
  if (!stored.blob) return fileError('この環境では変換元をファイルのまま再開できません。原本と再開用の記録は保持しています。');
  const file = await stored.blob();
  const archive = await openNativePortableConversionStreamsV1(file, {...policy.nonGs, maxFileBytes: Math.min(536870912,policy.gs.maxFileBytes)});
  if (!archive) return fileError('保持した変換元の形式が一致しません。');
  try {
    if (!same(await originalProof(archive.original), receipt.original) || !same(await proof(archive.manifestBytes), receipt.manifest) || !same(await proof(archive.snapshotBytes), receipt.snapshot)) return fileError('保持した変換元の内容が一致しません。');
    const inspected = await inspect(archive,policy,png,jpeg,photo), mapped = await mapNativeProject(archive.snapshot,inspected.models,receipt.conversionId,receipt.original.digest,inspected.rows,source.proof.identity);
    const original = await source.inspectOriginal({maxNodes:metadata.maxNodes,maxWork:metadata.maxWork});
    if (mapped.recipe !== nativeSpatialRecipe || original.candidates.hasUnknownFields || !same(original.candidates.unambiguousRecords,mapped.records) || !same(mapped.mapping,receipt.mapping) ||
      !same(mapped.materialWitness,receipt.materialWitness) || !same(witnesses(archive.snapshot,mapped,receipt.conversionId,receipt.original.digest),receipt.spatialWitness) ||
      !same(receipt.report, reportFor(archive.snapshot))) return fileError('変換元と初期記録の対応が一致しません。補修していません。');
    await admit(source,mapped,policy);
    for (const body of inspected.publicBodies) {
      const presence = await store.inspect(body.ref);
      if (presence === 'unverified' && !acknowledged) await store.put(archive.bodies.get(body.entry)!.stream(),body.ref.mediaType,body.ref);
      else if (presence !== 'verified-present') return fileError('記録済みのモデルや画像に修復が必要です。');
      else {const reader = (await store.openReadOnly(body.ref)).stream().getReader(); try {while (!(await reader.read()).done) { /* full readback */ }} finally {await reader.cancel(); reader.releaseLock();}}
    }
    const before = await session.read();
    if (before.state === 'ready') {if (!same(before.source!.proof,source.proof)) return fileError('再開先のプロジェクトが一致しません。'); return before;}
    const unfinished = (await new TransactionJournal(fs,metadata).entries()).find(e => !e.publication);
    if (unfinished?.start.purpose === 'initialize') return session.recoverInitialization(source);
    if (before.state === 'pending') return session.retry();
    if (before.state !== 'empty') return fileError('変換先の記録に修復が必要です。');
    return session.createFromSource(source);
  } finally {await archive.close();}
}
