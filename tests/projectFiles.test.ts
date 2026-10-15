import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as A from '@automerge/automerge';
import { serializeGlb } from '../src/assets/glbOptimize';
import { MemoryFS, type ProjectWorkspaceFS } from '../src/platform/fs';
import { ProjectMutationCoordinator } from '../src/platform/projectLock';
import { OriginBlobStore } from '../src/projectMetadata/blobStore';
import type { MetadataStorageFactory } from '../src/projectMetadata/repository';
import { MetadataRepository } from '../src/projectMetadata/repository';
import { digest, newId, json, underWriteLease } from '../src/projectMetadata/persistence';
import { validationMetadataLimits as metadata, occurrenceGlbProfile, occurrenceGlbProfileText, type FileValidationLimits } from '../src/projectFiles/validation';
import { inspectValidationGlb, validationGlbParts } from '../src/projectFiles/glb';
import { inspectOccurrenceGlb, decodeOccurrenceGlb } from '../src/projectFiles/glbOccurrences';
import { inspectValidationPng } from '../src/projectFiles/png';
import { prepareValidationProject } from '../src/projectFiles/initialProject';
import { prepareValidationCreation, resumeValidationCreation, validationProjectService } from '../src/projectFiles/creation';
import { fixtureMedia, captionAttachments } from '../src/harness/projectScene/mediaHistory';
import { SyntheticSession } from '../src/harness/projectScene/session';
import { readProjectScene } from '../src/scene/projectProvider';
import { resolveScene } from '../src/scene/resolve';
import type { JsonObject } from '../src/domain/values';
import type { Anchor } from '../src/scene/types';
import * as THREE from 'three';
import { validationModelVersions } from '../src/harness/projectScene/validationProjection';
import { metadataProjectView } from '../src/harness/projectScene/metadataFixture';
import { syntheticDisplay, pointInProject } from '../src/harness/projectScene/viewportModel';
import { degreesRotation } from '../src/harness/projectScene/modelTransform';
import { prepareValidationResidents, prepareReadonlyResidents, decodeValidationModel } from '../src/harness/projectScene/validationRender';
import { createModelCandidatePreview, type ModelCandidateRenderer } from '../src/harness/projectScene/modelCandidatePreview';
import { assetStatusCandidates } from '../src/projectMetadata/assetStatus';
import { assetMembershipGroups } from '../src/projectMetadata/membership';
import { assetCopySource, prepareAssetMembershipCopy } from '../src/projectMetadata/modelMembership';
import { pickResidentSurface } from '../src/harness/projectScene/viewportPicking';
import { fixtureModelIds } from '../src/harness/projectScene/modelClosure';
import { openValidationHost, validationArea } from '../src/harness/projectScene/validationHost';
import { createValidationModeHost } from '../src/harness/projectScene/validationModeHost';
import { productSources } from '../src/harness/projectScene/productSources';
import { projectCaptions, projectMediaResources, projectMediaUncertain, projectCaptionInventory } from '../src/ui/projectScene/projectRead';
import { listValidationProjects } from '../src/harness/projectScene/validationCatalog';
import { createSavedWorkspace } from '../src/harness/projectScene/metadataWorkspace';
import type { DisplayCapture } from '../src/harness/projectScene/viewSession';
import type { ViewportFactory } from '../src/harness/projectScene/viewportHost';
import { planPinMode } from '../src/ui/projectScene/pinModeState';
import { planModelList } from '../src/ui/projectScene/modelListState';
import { planCaptionList } from '../src/ui/projectScene/captionListState';
import { planCaptionInclude } from '../src/ui/projectScene/captionIncludeState';
import { editCaptionDraft, planCaptionApply } from '../src/ui/projectScene/captionDetailState';
import { RecordedDocument } from './ui/domRecorder';
import { record, type RecordedNode } from './ui/domRecorder';
import { createValidationWorkspace, type ValidationWorkspacePorts } from '../src/harness/projectScene/validationWorkspace';
import { createMediaControls } from '../src/harness/projectScene/mediaControls';
import { createModelAdditionControls } from '../src/harness/projectScene/modelAdditionControls';
import { createModelUpdateControls } from '../src/harness/projectScene/developmentControls';
import { planMetadataEdit } from '../src/projectMetadata/commands';
import { materialResolutionContext } from '../src/projectMetadata/materialResolution';
import { identityPlacement, prepareValidationModel, sealValidationRecord } from '../src/projectFiles/initialProject';
import { validationModelFacts, validationReceivedFacts } from '../src/projectFiles/modelFacts';
import { ValidationContent } from '../src/projectFiles/content';
import { ProjectMetadataSource } from '../src/projectMetadata/source';
import { planRemoteChanges } from '../src/projectMetadata/remote';
import { planNavigation } from '../src/ui/projectScene/navigationState';
import { planMaterial, materialTargetKey, editMaterialDraft, type MaterialIntentRequest } from '../src/ui/projectScene/materialState';
import { validationMaterialSlots, validationMaterialIssue } from '../src/harness/projectScene/validationMaterials';
import { materialKey } from '../src/harness/projectScene/materialHistory';
import { canonicalFixture } from '../src/harness/projectScene/modelClosure';
import type { MaterialIntent } from '../src/domain/materialIntent';
import { hardChroma } from '../src/viewer/hardChroma';
import { WorkspaceReceiver } from '../src/projectFiles/receiveWorkspace';
import { WorkspaceSender } from '../src/projectFiles/sendWorkspace';
import { WorkspaceOutputJob } from '../src/projectPackage/outputJob';
import { ContributionOutputJob } from '../src/projectPackage/contributionOutputJob';
import { BackupOutputJob } from '../src/projectPackage/backupOutputJob';
import { CleanOutputJob } from '../src/projectPackage/cleanOutputJob';
import { CleanInputJob } from '../src/projectPackage/cleanInputJob';
import { CleanArchive } from '../src/projectPackage/cleanArchive';
import { ReviewArchive } from '../src/projectPackage/reviewArchive';
import { ReviewOutputJob } from '../src/projectPackage/reviewOutputJob';
import { PreparedReviewEdit } from '../src/projectPackage/reviewEdit';
import { ReviewEditJob } from '../src/projectPackage/reviewEditJob';
import { reviewEditRoot } from '../src/projectPackage/reviewEditControls';
import { prepareReviewView } from '../src/harness/projectScene/reviewView';
import { inspectReviewSnapshot, prepareReviewEdit } from '../src/projectPackage/reviewSnapshot';
import { BackupArchive, writeBackupArchive } from '../src/projectPackage/backupArchive';
import { BackupSourceCapture } from '../src/projectPackage/backupSource';
import { backupEncode, backupEvidenceRefs } from '../src/projectPackage/backupEvidence';
import { BackupRestoreJob, type RestoreDatabasePorts } from '../src/projectPackage/backupRestoreJob';
import { readRestoreControls, reserveRestoreControls, restoreRef, writeRestoreControl } from '../src/projectPackage/restoreControls';
import { PACKAGE_LIMITS } from '../src/projectPackage/contract';
import { PackageArchive } from '../src/projectPackage/zipArchive';
import { WorkspaceBaseStore } from '../src/projectPackage/workspaceBases';
import { WorkspaceReceiveJob } from '../src/projectPackage/receiveJob';
import { WorkspaceSourceCapture } from '../src/projectPackage/workspaceSource';
import { WorkspaceArchive, writeWorkspaceArchive } from '../src/projectPackage/workspaceArchive';
import { VerifiedContributionBase, ContributionSourceCapture, ContributionArchive } from '../src/projectPackage/contributionSource';
import { writeContributionArchive } from '../src/projectPackage/contributionArchive';
import { TransactionJournal } from '../src/projectMetadata/journal';
import { createValidationReceiveControls } from '../src/harness/projectScene/validationReceiveControls';
import { ContributionReceiveJob } from '../src/projectPackage/contributionReceiveJob';
import { remoteEvidenceBytes } from '../src/projectMetadata/packageRemote';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { prepareNativeConversion, resumeNativeConversion } from '../src/projectFiles/nativeConversion';
import { nativeConversionIds, nativeAppearanceRecipe } from '../src/projectFiles/nativeMapping';

const budget: FileValidationLimits = { maxFileBytes: 1_000_000, maxJsonBytes: 100_000, maxItems: 10_000, maxValues: 100_000, maxPixels: 10_000 };
const png = Uint8Array.from(atob(fixtureMedia[0]!.base64), c => c.charCodeAt(0));
// Decoder injection observes calls/failure/disposal, NOT actual browser/raster acceptance.
const decode = vi.fn(async (_: Uint8Array) => ({ width: 64, height: 48, close: vi.fn() }));
function glb(mutate: (json: any, bin: Uint8Array) => void = () => {}, textured = false) {
  const bin = new Uint8Array(36 + (textured ? 24 + png.length : 0));
  new Float32Array(bin.buffer, 0, 9).set([-1, 0, 0, 1, 0, 0, 0, 2, 0]);
  const json: any = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [3, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.8, 1], roughnessFactor: 0.7 } }] };
  if (textured) {
    new Float32Array(bin.buffer, 36, 6).set([0, 0, 1, 0, 0.5, 1]); bin.set(png, 60);
    json.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: png.length });
    json.accessors.push({ bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' });
    json.meshes[0].primitives[0].attributes.TEXCOORD_0 = 1;
    json.images = [{ bufferView: 2, mimeType: 'image/png' }]; json.textures = [{ source: 0 }];
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  }
  mutate(json, bin); return serializeGlb(json, bin);
}
function lockManager() {
  const held = new Set<string>();
  return { async request(name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<unknown>) {
    if (held.has(name)) return callback(null); held.add(name);
    try { return await callback({ name, mode: 'exclusive' }); } finally { held.delete(name); }
  } } as unknown as LockManager;
}
function storageFactory() {
  const rows = new Map<string, Uint8Array>();
  const matches = (key: string, prefix: string[]) => prefix.every((p, i) => JSON.parse(key)[i] === p);
  const factory: MetadataStorageFactory = () => ({
    load: async key => rows.get(JSON.stringify(key))?.slice(),
    save: async (key, bytes) => { rows.set(JSON.stringify(key), bytes.slice()); },
    remove: async key => { rows.delete(JSON.stringify(key)); },
    loadRange: async prefix => [...rows].filter(([key]) => matches(key, prefix)).map(([key, data]) => ({ key: JSON.parse(key), data: data.slice() })),
    removeRange: async prefix => { for (const key of rows.keys()) if (matches(key, prefix)) rows.delete(key); },
  });
  return factory;
}
/** Native source bytes built here only; no private files or external sample distribution. */
async function nativeConversionFile(change: (snapshot: any) => void = () => {}, badBody = false, modelBytes = glb()) {
  const id = (prefix: string, n: number) => `${prefix}_${n.toString().padStart(26, '0')}`;
  const model = modelBytes.slice(), blob = { algorithm: 'sha256', digest: await digest(model), byteLength: model.length, mediaType: 'model/gltf-binary' };
  const imageBlob = { algorithm: 'sha256', digest: await digest(png), byteLength: png.length, mediaType: 'image/png' };
  const set = id('set', 0), second = id('set', 2);
  const snapshot: any = { format: 'lociview-native-project-snapshot', schemaVersion: 1, snapshotId: id('snp', 1), generation: 1,
    project: { id: id('prj', 1), title: '変換する記録', frame: { id: id('frm', 1), handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } } },
    assets: [2, 1].map(n => ({ id: id('ast', n), label: n === 1 ? '建物' : '非表示の設備', assetFrameId: id('frm', n + 1),
      status: { kind: 'ready', activeBindingId: id('bnd', n) }, ...(n === 1 ? { pinScale: 1.5 } : {}) })),
    assetBindingRevisions: [1, 2].map(n => ({ id: id('bnd', n), assetId: id('ast', n), assetRevisionId: id('rev', n),
      assetToProject: { ...identityPlacement(), translation: [n, 0, 0] }, method: 'manual' })),
    assetRevisions: [1, 2].map(n => ({ id: id('rev', n), assetId: id('ast', n), representationIds: [id('rep', n)],
      anchorCompatibilityClasses: [{ id: id('cls', n), targetVariantFamilyIds: [id('fam', n)] }] })),
    representations: [1, 2].map(n => ({ id: id('rep', n), assetId: id('ast', n), representationFrameId: id('frm', n + 3),
      contentKind: 'mesh', purposes: ['source', 'display'], role: 'meshPrimary', variantFamilyId: id('fam', n),
      formatProfile: { id: 'lociview-native-model-glb-v1' }, blob, representationToAsset: { ...identityPlacement(), reflection: 'none' }, derivedFrom: [] })),
    presentation: { displayMode: 'gs-only', captionTargetAssetId: null, hiddenAssetIds: [id('ast', 2)], activeDisplaySetId: second },
    displaySets: [{ id: second, name: '観察', orderKey: 'ZZ', defaultSavedViewId: id('view', 1) }, { id: set, name: '全体', orderKey: 'AA', defaultSavedViewId: null }],
    savedViews: [{ id: id('view', 1), displaySetId: second, name: '記録した視点', orderKey: 'old', projectFrameId: id('frm', 1),
      camera: { position: [1, 2, 8], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 0.7 } },
      background: { kind: 'solid', colorSrgb: [0.1, 0.2, 0.3] } }],
    captions: [{ id: id('cap', 1), title: '既存のピン', body: '本文を保持', displaySetId: second, tags: ['観察', '記録'], attachmentMediaIds: [id('med', 2), id('med', 1)],
      anchor: { kind: 'asset', assetId: id('ast', 1), assetFrameId: id('frm', 2), positionAsset: [3, 0.5, 0], authoredAssetRevisionId: id('rev', 1),
        authoredAnchorCompatibilityId: id('cls', 1), hitEvidence: { method: 'manual' } } },
    { id: id('cap', 2), title: '未配置の記録', body: '', displaySetId: second, tags: ['記録'], color: '#123456', anchor: null }],
    mediaResources: [1, 2].map(n => ({ id: id('med', n), label: `画像 ${n}`, kind: 'image', blob: imageBlob })) };
  change(snapshot);
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const manifest = { format: 'lociview-native-portable-backup', packageVersion: 2,
    nativeSnapshot: { schemaVersion: 1, projectId: snapshot.project.id, snapshotId: snapshot.snapshotId, generation: snapshot.generation,
      entry: 'native/snapshot.json', byteLength: bytes.length, algorithm: 'sha256', digest: await digest(bytes) },
    representations: snapshot.representations.map((r: any) => ({ representationId: r.id, entry: `native/representations/${r.id}.bin`, ...r.blob })),
    media: snapshot.mediaResources.map((m: any) => ({ mediaId: m.id, entry: `native/media/${m.id}.bin`, ...m.blob })) };
  const writer = new ZipWriter(new Uint8ArrayWriter());
  const add = (path: string, data: Uint8Array) => writer.add(path, new Uint8ArrayReader(data), { level: 0 });
  await add('native/package.json', new TextEncoder().encode(JSON.stringify(manifest))); await add('native/snapshot.json', bytes);
  for (const r of manifest.representations) { const b = model.slice(); if (badBody) b[0] = 0; await add(r.entry, b); }
  for (const m of manifest.media) await add(m.entry, png);
  return new Blob([(await writer.close()).slice().buffer]);
}
async function nativeAppearanceFile(change: (snapshot: any) => void = () => {}, model = glb(j => {
  j.nodes.push({ mesh: 0, translation: [-3, 0, 0] }); j.scenes[0].nodes.push(1);
})) {
  return nativeConversionFile(s => {
    const asset = s.assets.find((a: any) => a.label === '建物'), rep = s.representations.find((r: any) => r.assetId === asset.id), revision = s.assetRevisions.find((r: any) => r.assetId === asset.id);
    s.meshMaterialAppearances = s.displaySets.map((set: any, i: number) => ({ id: `mat_${String(i + 1).padStart(26, '0')}`,
      displaySetId: set.id, assetId: asset.id, authoredAssetRevisionId: revision.id, representationId: rep.id, materialSlotKey: 'm/0/0',
      opacity: 1, doubleSided: i === 0, unlit: i === 0,
      chroma: { enabled: false, colorSrgb: [0.5 / 255, 1.5 / 255, 254.5 / 255], tolerance: 0.3, feather: 0 } }));
    change(s);
  }, false, model);
}
class TestFS extends MemoryFS {
  reject = (_: string) => false; reads = 0;
  override async writeText(path: string, text: string) { if (this.reject(path)) throw Error('injected quota'); return super.writeText(path, text); }
  override async writeBytes(path: string, bytes: Uint8Array) { if (this.reject(path)) throw Error('injected quota'); return super.writeBytes(path, bytes); }
  override async writeStream(path: string, stream: ReadableStream<Uint8Array>) {
    if (this.reject(path)) { await stream.cancel(); throw Error('injected quota'); } return super.writeStream(path, stream);
  }
  override async readStream(path: string) { const file = await super.readStream(path); if (!file || !path.startsWith('v2/cas/objects/')) return file;
    return { size: file.size, stream: () => { this.reads++; return file.stream(); } }; }
}

async function openFileCaption(modelBytes = glb()) {
  const fs = new TestFS(), locks = lockManager(), run = newId(), factory = storageFactory();
  const coordinator = ProjectMutationCoordinator.browser(locks);
  const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
  const options = { base: fs, coordinator, store, fileLimits: budget, decode, run, packageLocks: locks,
    openStorage: async () => ({ factory, dispose: async () => {} }) };
  const initial = prepareValidationCreation(await prepareValidationProject({ run, title: '追加の検証', models: [{ label: '3Dモデル', bytes: modelBytes }] }, budget, decode));
  const host = await openValidationHost({ ...options, initial }), workspace = createSavedWorkspace(new RecordedDocument().asDocument(), host);
  const s = workspace.session!, model = s.snapshot.modelVersions![0]!;
  s.setViewportState(true, [model.assetId], null); s.acceptPinCreation(s.pinCreationTargets()[0]!, [3, 0.5, 0]);
  s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }));
  await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
  return { fs, store, options, host, workspace, s, captionId: s.memory.selectedCaptionId! };
}

describe('limited real-format validation (synthetic GLB bytes, injected PNG decoder, memory storage)', () => {
  it('Native appearance conversion fixes the approved recipe-2 identity vectors and distinct occurrence locators', async () => {
    expect(new TextEncoder().encode(occurrenceGlbProfileText)).toHaveLength(1198);
    expect(await occurrenceGlbProfile()).toEqual({ id: 'development-validation-glb-occurrence-1', specificationSha256: '9bbf1243a3786d54a6439104614c46e502a3cdfa20dc9e9d610ee1da42cf059f' });
    const ids = nativeConversionIds('0'.repeat(32), '1'.repeat(64), nativeAppearanceRecipe);
    for (const [prefix, key, bytes, sha] of [
      ['cap', ['caption', 'cap_00000000000000000000000001'], 203, '85c0e680cf0491cdcb521fec8af712ec2cac1c23f95dac35aae47505f20db4a8'],
      ['slot', ['material-occurrence', 'rep_00000000000000000000000001', 0, 0], 220, 'dd4b486ecc4c8241a8addd75570baddc31c82c22b1e74892f6f49d1549397572'],
      ['slot', ['material-occurrence', 'rep_00000000000000000000000001', 1, 0], 220, 'e0f336959c1452758cce2ad54045e8aec6c2ec30f4e30146b2ff2b953dfdf5cb'],
      ['ovr', ['mesh-appearance', 'mat_00000000000000000000000001'], 211, '643aa03e4d714d507eb5d542a2efbee8b82d070689a52e6b2859ecd1ac2d8df5'],
      ['evt', ['initial-event', 'ovr', ['mesh-appearance', 'mat_00000000000000000000000001']], 235, 'dc927f6982fca7244f5b5beffabf6bc55eda7ef68b834eea96517da8cabcebad'],
      ['tag', ['tag', '記録'], 175, '8f6b117eb0f5c1f6fe150fda62b2646a9c6ce3c8390697c8896edd706e8ebfe0'],
    ] as const) {
      const id = await ids.id(prefix, key), row = ids.report().find(r => r.id === id)!;
      expect(row.sha256).toBe(sha); expect(new TextEncoder().encode(row.preimage)).toHaveLength(bytes); expect(id).toBe(`${prefix}_${sha.slice(0, 32)}`);
    }
    const bytes = glb(j => { const p = j.meshes[0].primitives[0]; j.meshes[0].primitives.push({ attributes: { POSITION: 0 } }, { ...p });
      j.nodes.push({ mesh: 0, translation: [-3, 0, 0] }); j.scenes[0].nodes.push(1); });
    const source = await inspectOccurrenceGlb(bytes, budget, decode), decoded = await decodeOccurrenceGlb(source);
    try {
      expect(source.materials).toHaveLength(6); expect(decoded.occurrenceSlots.map(r => [r.nodeIndex, r.primitiveIndex, r.slotIndex])).toEqual([[0, 0, 0], [0, 1, 1], [0, 2, 2], [1, 0, 3], [1, 1, 4], [1, 2, 5]]);
      expect(new Set(decoded.occurrenceSlots.map(r => r.node.material)).size).toBe(6);
      expect(decoded.occurrenceSlots.map(r => r.childPath)).toEqual([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]);
      expect(source.bytes).toEqual(bytes); expect(decoded.materialLocators.size).toBe(6);
    } finally { decoded.dispose(); }
  });
  it('Native appearance conversion retains exact witness and latent values through interrupted initialization, retry and later edits', async () => {
    const file = await nativeAppearanceFile(), input = await file.arrayBuffer();
    const prepared = await prepareNativeConversion(file, budget, decode), initial = await prepared!.create();
    const fs = new TestFS(), locks = lockManager(), storage = storageFactory();
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const own = validationProjectService(fs, storage, store, budget, decode), projectId = initial.source.proof.identity.projectId as string;
    fs.reject = p => p.endsWith('/published.json'); await expect(initial.persist(fs, store, own.session)).rejects.toThrow('quota'); fs.reject = () => false;
    const path = (await fs.list('')).find(p => p.endsWith('/native-conversion.json'))!, receiptBytes = await fs.readBytes(path), receipt = JSON.parse(new TextDecoder().decode(receiptBytes!));
    expect(receipt.recipe).toBe(nativeAppearanceRecipe); expect(receipt.materialWitness).toHaveLength(4);
    const oldIds = nativeConversionIds(receipt.conversionId, receipt.original.digest); await oldIds.id('cap', ['caption', 'cap_00000000000000000000000001']);
    const downgraded = { ...receipt, recipe: 'native-project-scene-recipe-1', mapping: oldIds.report() }; delete downgraded.materialWitness;
    const cold = validationProjectService(fs, storage, store, budget, decode);
    await fs.writeBytes(path, new TextEncoder().encode(json(downgraded)));
    await expect(resumeNativeConversion(fs, store, cold.session, budget, projectId, decode)).rejects.toThrow('材質変換の版');
    expect(JSON.parse(new TextDecoder().decode((await fs.readBytes(path))!))).toEqual(downgraded);
    await fs.writeBytes(path, receiptBytes!);
    const ready = await resumeNativeConversion(fs, store, cold.session, budget, projectId, decode);
    expect(ready.source!.originalChanges()).toEqual(initial.source.originalChanges()); expect(await fs.readBytes(path)).toEqual(receiptBytes);
    const p = ready.provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    const appearances = Object.values(p.details.mutable.materialOverridesById).map(fields => fields.appearance);
    expect(appearances).toHaveLength(2);
    for (const a of appearances) expect(a).toMatchObject({ kind: 'value', value: { opacity: 1, chroma: { enabled: false, keyColorSrgb: [0, 1 / 255, 1], tolerance: 0.3 / Math.sqrt(3), softness: 0.0001 / Math.sqrt(3) } } });
    const captionId = Object.keys(p.resources.captions)[0]!, edited = await cold.session.edit(ready.source!.token, { kind: 'editCaption', captionId, edits: { body: '材質変換後の編集' } });
    expect((await initial.persist(fs, store, cold.session)).source!.originalChanges()).toEqual(edited.source!.originalChanges());
    await fs.writeBytes(path, new TextEncoder().encode(json(downgraded)));
    await expect(resumeNativeConversion(fs, store, cold.session, budget, projectId, decode)).rejects.toThrow('材質変換の版');
    for (const change of [(r: typeof receipt) => { delete r.materialWitness[0].childPath; },
      (r: typeof receipt) => { r.materialWitness[0].childPath = [1]; }]) {
      const broken = structuredClone(receipt); change(broken);
      await fs.writeBytes(path, new TextEncoder().encode(json(broken)));
      await expect(resumeNativeConversion(fs, store, cold.session, budget, projectId, decode)).rejects.toThrow('対応表');
      expect(JSON.parse(new TextDecoder().decode((await fs.readBytes(path))!))).toEqual(broken);
      expect((await cold.session.read()).source!.token).toBe(edited.source!.token);
    }
    expect((await cold.session.read()).source!.token).toBe(edited.source!.token); expect(await file.arrayBuffer()).toEqual(input);
  });
  it.each(['opacity', 'chroma', 'slot', 'family', 'source-alpha'] as const)('Native appearance conversion refuses the whole unsupported %s input', async kind => {
    const bytes = glb(j => { if (kind === 'source-alpha') j.materials[0].alphaMode = 'BLEND'; });
    const file = await nativeAppearanceFile(s => {
      const a = s.meshMaterialAppearances[1];
      if (kind === 'opacity') a.opacity = 0.5;
      if (kind === 'chroma') a.chroma.enabled = true;
      if (kind === 'slot') a.materialSlotKey = 'm/99/0';
      if (kind === 'family') { const r = s.representations.find((r: any) => r.id === a.representationId), id = `rep_${'3'.padStart(26, '0')}`;
        s.representations.push({ ...r, id }); s.assetRevisions.find((r: any) => r.id === a.authoredAssetRevisionId).representationIds.push(id); }
    }, bytes), before = await file.arrayBuffer();
    await expect(prepareNativeConversion(file, budget, decode)).rejects.toThrow(); expect(await file.arrayBuffer()).toEqual(before);
  });
  it('Native conversion fixes the four approved scoped identity vectors', async () => {
    const ids = nativeConversionIds('0'.repeat(32), '1'.repeat(64));
    for (const [prefix, key, length, sha] of [
      ['cap', ['caption', 'cap_00000000000000000000000001'], 203, 'f1be0614826b7daa9f6d470193829e54bc09ddac17e6aa697e07227252844a8f'],
      ['scn', ['display-set', 'set_00000000000000000000000000'], 207, '519c529e6d755a3998beb6dfda85c4e03a2bead7a989a81c1882db9a69c95d15'],
      ['att', ['attachment', 'cap_00000000000000000000000001', 0, 'med_00000000000000000000000001'], 241, '51269b1dab7f424afd57923b69c5a2ae8d0688313e690beb8819220387603181'],
      ['tag', ['tag', '記録'], 175, '951d88c365fa03ead6179c6a99bd92efdb2f9fecbcced50323a4966e169b4725'],
    ] as const) {
      const id = await ids.id(prefix, key); expect(id).toBe(`${prefix}_${sha.slice(0, 32)}`);
      const entry = ids.report().find(e => e.id === id)!; expect(entry.sha256).toBe(sha); expect(new TextEncoder().encode(entry.preimage)).toHaveLength(length);
      expect(await ids.id(prefix, key)).toBe(id);
    }
    expect(ids.report()).toHaveLength(4);
  });
  it('Native conversion rejects unsupported input without allocating a Project or changing its original', async () => {
    const altered = await nativeConversionFile(() => {}, true), original = await altered.arrayBuffer();
    await expect(prepareNativeConversion(altered, budget, decode)).rejects.toThrow('本体が元の記録と一致');
    expect(await altered.arrayBuffer()).toEqual(original);
    const tags = await prepareNativeConversion(await nativeConversionFile(s => { s.captions[1].tags = ['記録', '観察']; }), budget, decode);
    await expect(tags!.create()).rejects.toThrow('タグの並び');
    const camera = await prepareNativeConversion(await nativeConversionFile(s => { s.savedViews[0].camera.up = [0, 2, 0]; }), budget, decode);
    await expect(camera!.create()).rejects.toThrow();
    const file = await nativeConversionFile(), one = await prepareNativeConversion(file, budget, decode), two = await prepareNativeConversion(file, budget, decode);
    const first = await one!.create(); expect(await one!.create()).toBe(first);
    expect((await two!.create()).source.proof.identity).not.toEqual(first.source.proof.identity);
    const implicit = await prepareNativeConversion(await nativeConversionFile(s => {
      delete s.displaySets; delete s.savedViews; delete s.presentation.activeDisplaySetId;
      for (const c of s.captions) delete c.displaySetId;
    }), budget, decode);
    expect(implicit!.summary.scenes).toBe(1);
    expect((await implicit!.create()).source.originalChanges()).toHaveLength(2);
  });
  it('Native conversion connects file preview to editing, first placement, named backup, Workspace and independent reopen (recorded DOM)', async () => {
    const fs = new TestFS(), locks = lockManager(), coordinator = ProjectMutationCoordinator.browser(locks);
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const options = { base: fs, coordinator, store, fileLimits: budget, decode, packageLocks: locks }, factories = new Map<string, MetadataStorageFactory>();
    const openStorage = async (run: string, create: boolean) => {
      if (!factories.has(run)) { if (!create) throw Error('missing database'); factories.set(run, storageFactory()); }
      return { factory: factories.get(run)!, dispose: async () => {} };
    };
    let host: Awaited<ReturnType<typeof openValidationHost>> | undefined;
    const ports: ValidationWorkspacePorts = { fileLimits: budget, decode, selected: vi.fn(), list: () => listValidationProjects(options, openStorage),
      render: async () => ({ factory: () => { throw Error('No GPU in recorded DOM'); }, dispose() {} }),
      open: vi.fn(async (run, initial, mode, workspaceFile) => host = await openValidationHost({ ...options, run, initial, mode, workspaceFile, openStorage: c => openStorage(run, c) })) };
    const ui = createValidationWorkspace(new RecordedDocument().asDocument(), ports), root = record(ui.root);
    const all = (node: RecordedNode): RecordedNode[] => [node, ...node.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const input = all(root).find(n => n.attributes.get('aria-label') === 'ファイルを選択')!;
    await vi.waitFor(() => expect(button('ファイルを開く').disabled).toBe(false));
    const file = await nativeConversionFile(), original = await file.arrayBuffer(); Object.assign(input, { files: [file] });
    input.parent!.parent!.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(button('新しいプロジェクトに変換').parent!.hidden).toBe(false));
    expect(ports.open).not.toHaveBeenCalled(); expect(await fs.list('')).toEqual([]);
    button('キャンセル').fire('click'); expect(button('新しいプロジェクトに変換').parent!.hidden).toBe(true);
    input.parent!.parent!.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(button('新しいプロジェクトに変換').parent!.hidden).toBe(false));
    fs.reject = path => path.endsWith('/published.json'); button('新しいプロジェクトに変換').fire('click');
    await vi.waitFor(() => expect(host?.read().state).toBe('pending'), { timeout: 8000 });
    await vi.waitFor(() => expect(ui.selected).toBeTruthy());
    await vi.waitFor(() => expect(button('更新を再試行')?.hidden).toBe(false));
    const run = ui.selected!, originalChanges = host!.read().source?.originalChanges(); await ui.dispose(); fs.reject = () => false;
    host = await ports.open(run); expect(host.read().state).toBe('pending'); expect(host.workspaceFiles.initialImport).toBe(false);
    await host.authority.retry!(); expect(host.read().state).toBe('ready');
    if (originalChanges) expect(host.read().source!.originalChanges()).toEqual(originalChanges);
    const project = host.authority.read(), p = host.read().provider!;
    expect(p.kind).toBe('scene-provider'); if (p.kind !== 'scene-provider') throw Error('provider');
    expect(p.semanticProfile).toBe('map2'); expect(p.resources.projectFrameId).toBeTruthy();
    const scenes = Object.values(p.state.scenes).sort((a, b) => (a.orderKey as any).value.localeCompare((b.orderKey as any).value));
    expect(scenes.map(s => s.name)).toEqual([{ kind: 'value', value: '観察' }, { kind: 'value', value: '全体' }]);
    expect(Object.keys(p.resources.assets)).toHaveLength(2); expect(Object.keys(p.state.assetMemberships)).toHaveLength(2);
    expect(project.mediaChoices).toHaveLength(2); expect(project.mediaChoices![0]!.blob).toEqual(project.mediaChoices![1]!.blob);
    const captions = Object.values(p.resources.captions), placed = captions.find(c => c.title.kind === 'value' && c.title.value === '既存のピン')!;
    const unplaced = captions.find(c => c.title.kind === 'value' && c.title.value === '未配置の記録')!;
    expect(unplaced.anchor).toEqual({ kind: 'value', value: { kind: 'unplaced' } });
    expect(p.details.mutable.captionsById[placed.id]!.colorSrgb).toEqual({ kind: 'value', value: [234 / 255, 179 / 255, 8 / 255] });
    await host!.authority.write(host!.read().source!.token, { [`caption/${placed.id}/body`]: '変換後の追記' });
    if (placed.anchor.kind !== 'value' || placed.anchor.value.kind !== 'asset') throw Error('placed');
    await host!.authority.reparentPin!(host!.read().source!.token, { kind: 'reparentPin', sceneId: scenes[0]!.id, captionId: unplaced.id,
      anchor: { ...placed.anchor.value, positionAsset: [4, 1, 0] } });
    // A permanent conversion receipt must not divert later edit recovery back to initialization.
    fs.reject = path => path.endsWith('/blobsVerified.json');
    await expect(Promise.resolve(host!.authority.write(host!.read().source!.token, { [`caption/${placed.id}/body`]: '通常編集の中断から復旧' })).then(() => undefined)).rejects.toThrow();
    fs.reject = () => false; await host.authority.retry!();
    await host!.dispose(); host = await ports.open(run); expect(host.read().state).toBe('ready');
    expect(host.authority.read().resources.captions[placed.id]!.body).toEqual({ kind: 'value', value: '通常編集の中断から復旧' });
    const edited = host!.read().source!, backupId = await host!.workspaceOutput.generateBackup(edited.token, '変換後の確認');
    const backup = await host!.workspaceOutput.download(backupId), inspectedBackup = await BackupArchive.inspect(backup, metadata);
    // The accepted name is local display/filename metadata, never silently shared as memo.
    expect(host!.workspaceOutput.jobs.find(j => j.id === backupId)!.label).toBe('変換後の確認');
    expect(inspectedBackup.archive.control.manifest.memo).toBeUndefined();
    expect(inspectedBackup.source.originalChanges()).toEqual(edited.originalChanges());
    const workspaceId = await host!.workspaceOutput.generate(edited.token), workspaceFile = await host!.workspaceOutput.download(workspaceId);
    const sent = await WorkspaceArchive.inspect(workspaceFile, metadata);
    for (const archive of [sent.archive, inspectedBackup.archive]) expect(archive.control.entries.some(e => /native|conversion/.test(e.path))).toBe(false);
    expect(await prepareNativeConversion(workspaceFile, budget, decode)).toBeNull();
    expect(await file.arrayBuffer()).toEqual(original); await host!.dispose();
    const cold = await openValidationHost({ ...options, run, openStorage: c => openStorage(run, c) });
    expect(cold.read().source!.originalChanges()).toEqual(edited.originalChanges()); await cold.dispose();
    const receiverFs = new TestFS(), receiverStore = new OriginBlobStore(receiverFs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const received = await openValidationHost({ ...options, base: receiverFs, store: receiverStore, run, workspaceFile,
      openStorage: async () => ({ factory: storageFactory(), dispose: async () => {} }) });
    expect(received.read().state).toBe('ready'); expect(received.read().source!.originalChanges()).toEqual(edited.originalChanges());
    expect(received.authority.read().resources.captions[unplaced.id]!.anchor).toEqual({ kind: 'value', value: { ...placed.anchor.value, positionAsset: [4, 1, 0] } });
    await received.dispose();
  });
  it('Native conversion retries a first later edit before staging without requiring its private original', async () => {
    const fs = new TestFS(), locks = lockManager(), storage = storageFactory();
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const initial = await (await prepareNativeConversion(await nativeConversionFile(), budget, decode))!.create();
    const options = { base: fs, coordinator: ProjectMutationCoordinator.browser(locks), store, fileLimits: budget, decode, packageLocks: locks,
      run: (initial.source.proof.identity.projectId as string).slice(4), openStorage: async () => ({ factory: storage, dispose: async () => {} }) };
    const host = await openValidationHost({ ...options, initial }); expect(host.read().state).toBe('ready');
    const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const captionId = Object.keys(provider.resources.captions)[0]!;
    const sourcePath = (await fs.list('')).find(path => path.endsWith('/native-conversion-source.zip'))!;
    const initialStaging = (await fs.list('')).filter(path => path.endsWith('/staging.json'));
    expect(initialStaging).toHaveLength(1);
    expect(await fs.readBytes(initialStaging[0]!.replace('/staging.json', '/published.json'))).not.toBeNull();
    expect(await fs.readBytes(sourcePath)).not.toBeNull(); await fs.remove(sourcePath);
    fs.reject = path => path.endsWith('/staging.json');
    await expect(Promise.resolve(host.authority.write(host.read().source!.token, { [`caption/${captionId}/body`]: '保存開始前の中断から復旧' }))).rejects.toThrow('injected quota');
    expect(host.read().state).toBe('pending');
    expect((await fs.list('')).filter(path => path.endsWith('/staging.json'))).toEqual(initialStaging);
    fs.reject = () => false; await host.authority.retry!();
    expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '保存開始前の中断から復旧' });
    expect(await fs.readBytes(sourcePath)).toBeNull();
    const edited = host.read().source!.originalChanges(); await host.dispose();
    const cold = await openValidationHost(options);
    expect(cold.read().state).toBe('ready'); expect(cold.read().source!.originalChanges()).toEqual(edited);
    expect(cold.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '保存開始前の中断から復旧' });
    expect(await fs.readBytes(sourcePath)).toBeNull(); await cold.dispose();
  });
  it('Native conversion resumes exact initialization and never resets later edits or repairs acknowledged source loss', async () => {
    const fs = new TestFS(), locks = lockManager(), store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const storage = storageFactory(), initial = await (await prepareNativeConversion(await nativeConversionFile(), budget, decode))!.create();
    const service = validationProjectService(fs, storage, store, budget, decode), projectId = initial.source.proof.identity.projectId as string;
    fs.reject = p => p.endsWith('/published.json'); await expect(initial.persist(fs, store, service.session)).rejects.toThrow();
    expect((await service.session.read()).state).toBe('pending'); fs.reject = () => false;
    const cold = validationProjectService(fs, storage, store, budget, decode);
    const ready = await resumeNativeConversion(fs, store, cold.session, budget, projectId);
    expect(ready.source!.originalChanges()).toEqual(initial.source.originalChanges());
    const p = ready.provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    const captionId = Object.keys(p.resources.captions)[0]!;
    const edited = await cold.session.edit(ready.source!.token, { kind: 'editCaption', captionId, edits: { body: '復旧後の編集' } });
    expect((await initial.persist(fs, store, cold.session)).source!.originalChanges()).toEqual(edited.source!.originalChanges());
    const sourcePath = (await fs.list('')).find(path => path.endsWith('/native-conversion-source.zip'))!;
    await fs.remove(sourcePath);
    await expect(initial.persist(fs, store, cold.session)).rejects.toThrow('記録が不足');
    expect(await fs.readBytes(sourcePath)).toBeNull(); expect((await cold.session.read()).source!.token).toBe(edited.source!.token);
  });
  it('creates and reopens from the exact generated walkthrough GLB without relaxing unknown-field rejection', async () => {
    const root = resolve('.artifacts/fixtures'); mkdirSync(root, { recursive: true });
    const directory = mkdtempSync(join(root, 'sample-regression-'));
    try {
      execFileSync(process.execPath, ['scripts/gen-samples.mjs', '--out-dir', directory]);
      const bytes = new Uint8Array(readFileSync(join(directory, 'tri.glb')));
      const inspected = await inspectValidationGlb(bytes, budget), parts = validationGlbParts(bytes, budget);
      expect(inspected.bytes).toEqual(bytes);
      const altered = structuredClone(parts.json), material = (altered.materials as any[])[0].pbrMetallicRoughness;
      expect(material.roughnessFactor).toBe(0.8); expect(material).not.toHaveProperty('roughness');
      material.roughness = material.roughnessFactor; delete material.roughnessFactor;
      await expect(inspectValidationGlb(serializeGlb(altered, parts.bin), budget)).rejects.toThrow('未対応のデータ');
      const opened = await openFileCaption(bytes), original = opened.host.read().source!.originalChanges();
      expect(opened.host.read().state).toBe('ready'); expect(opened.captionId).toBeTruthy();
      await opened.workspace.dispose();
      const cold = await openValidationHost(opened.options);
      expect(cold.read().state).toBe('ready'); expect(cold.read().source!.originalChanges()).toEqual(original);
      expect(cold.authority.read().resources.captions[opened.captionId]).toBeDefined();
      await cold.dispose();
    } finally {
      // Only this call's generated files; no recursive deletion or public samples.
      for (const name of ['cube.stl', 'cube.obj', 'points.ply', 'tri.glb']) {
        try { unlinkSync(join(directory, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      rmdirSync(directory);
    }
  });
  async function receivedFixture(reuseModel = false) {
    const fs = new TestFS(), locks = lockManager(), store = new OriginBlobStore(fs,
      { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const prepared = structuredClone(await prepareValidationProject({ run: newId(), title: 'チームの作業', models: [{ label: '最初のモデル', bytes: glb() }] }, budget, decode));
    const captionId = `cap_${newId()}`, project = prepared.records.project as JsonObject;
    (prepared.records.captionsById as Record<string, JsonObject>)[captionId] = { id: captionId, title: '最初の記録', body: '',
      lifecycle: { state: 'active', eventId: `evt_${newId()}`, reason: 'initial' }, colorSrgb: [1, 0, 0],
      anchor: { kind: 'project', projectFrameId: (project.frame as JsonObject).id!, positionProject: [0, 0, 0] } };
    const factory = storageFactory(), receiver = validationProjectService(fs, factory, store, budget, decode);
    const initial = await prepareValidationCreation(prepared).persist(fs, store, receiver.session);
    const local = await receiver.session.editCaption(initial.source!.token, captionId, 'body', '手元の追記');
    const bytes = reuseModel ? glb() : glb(j => { j.nodes[0].translation = [8, 0, 0]; });
    const model = await prepareValidationModel({ label: '受信したモデル', bytes }, budget, decode), sceneId = project.defaultSceneId as string;
    const { body: _body, ...records } = model;
    const introduced = initial.source!.prepareEdit(initial.source!.token, { kind: 'addAsset', sceneId, ...records,
      membership: { id: `sam_${newId()}`, sceneId, assetId: model.asset.id!, orderKey: 'B', lifecycle: { state: 'active', reason: 'initial', eventId: `evt_${newId()}` } } }, initial.provider!, newId());
    const image = await sealValidationRecord('media-resource', { id: `med_${newId()}`, label: '受信画像', mediaKind: 'image',
      blob: { algorithm: 'sha256', digest: await digest(png), byteLength: png.length, mediaType: 'image/png' } });
    const doc = A.change(A.load<Record<string, any>>(introduced.encodeFullSource()), draft => {
      draft.mediaResourcesById[image.id as string] = new A.ImmutableString(json(image));
    });
    const remote = ProjectMetadataSource.fromFullSource(A.save(doc), initial.source!.proof, metadata);
    const final = planRemoteChanges(local.source!, remote, metadata).final;
    const bodyFor = vi.fn((ref: JsonObject) => new Blob([ref.digest === model.body.ref.digest ? bytes.slice().buffer : png.slice().buffer], { type: 'application/octet-stream' }));
    return { fs, store, receiver, initial, local, final, model, image, captionId, bodyFor, bytes, locks, factory, remote, prepared };
  }
  async function workspaceFileFixture(transform?: (source: ProjectMetadataSource) => ProjectMetadataSource) {
    const f = await receivedFixture(), senderFS = new TestFS();
    const senderStore = new OriginBlobStore(senderFS, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, lockManager());
    for (const b of f.prepared.blobs) await senderStore.put(new Blob([b.bytes.slice().buffer]).stream(), b.ref.mediaType, b.ref);
    await senderStore.put(new Blob([f.bytes.slice().buffer]).stream(), f.model.body.ref.mediaType, f.model.body.ref);
    await senderStore.put(new Blob([png.slice().buffer]).stream(), 'image/png', f.image.blob as JsonObject);
    const attachmentId = `att_${newId()}`;
    const doc = A.change(A.load<Record<string, any>>(f.remote.encodeFullSource()), d => {
      d.captionAttachmentsById[attachmentId] = Object.fromEntries(Object.entries({ id: attachmentId, captionId: f.captionId,
        mediaResourceId: f.image.id, altText: '', orderKey: 'A', lifecycle: { state: 'active', reason: 'initial', eventId: `evt_${newId()}` } })
        .map(([key, value]) => [key, new A.ImmutableString(json(value))]));
    });
    const original = ProjectMetadataSource.fromFullSource(A.save(doc), f.remote.proof, metadata), source = transform ? transform(original) : original;
    const content = new ValidationContent(senderFS, senderStore, budget, decode);
    const provider = await underWriteLease(senderFS, () => readProjectScene(source.read(), metadata, content.verifier(true), { verifyRetainedMedia: true }));
    const publication = newId();
    const capture = await WorkspaceSourceCapture.prepare({ read: async () => ({ state: 'ready', source, provider, publication }) }, source.token, senderStore, metadata);
    const chunks: Uint8Array[] = [];
    await writeWorkspaceArchive(capture, senderStore, new WritableStream<Uint8Array>({ write: bytes => { chunks.push(bytes.slice()); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    const file = new Blob(chunks.map(b => b.slice().buffer));
    const reopen = () => validationProjectService(f.fs, f.factory, f.store, budget, decode);
    const receiver = new WorkspaceReceiver(f.fs, f.fs, f.receiver.session, metadata, f.locks);
    return { ...f, source, file, receiverService: receiver, reopen, capture, senderStore };
  }
  function firstWorkspaceRecipient() {
    const fs = new TestFS(), factory = storageFactory(), locks = lockManager();
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const reopen = () => {
      const { session } = validationProjectService(fs, factory, store, budget, decode);
      return { session, receiver: new WorkspaceReceiver(fs, fs, session, metadata, locks) };
    };
    return { fs, factory, store, locks, reopen, ...reopen() };
  }
  async function contributionFile(session: ReturnType<typeof validationProjectService>['session'], fs: ProjectWorkspaceFS, store: OriginBlobStore) {
    const current = await session.read(), bases = new WorkspaceBaseStore(fs, metadata, current.source!.proof), snapshot = await bases.snapshot(), row = snapshot.records[0]!;
    const base = await VerifiedContributionBase.select(bases, { workspacePackageId: row.workspacePackageId,
      workspaceManifestSha256: row.workspaceManifestSha256, heads: row.declaredHeads }, store, metadata);
    const capture = await ContributionSourceCapture.prepare(session, current.source!.token, base, store, metadata), chunks: BlobPart[] = [];
    await writeContributionArchive(capture, store, new WritableStream({ write(b) { chunks.push(b.slice() as BlobPart); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    return { file: new Blob(chunks), capture, snapshot, current };
  }
  async function contributionTeam() {
    const f = await workspaceFileFixture(), r = firstWorkspaceRecipient();
    await f.receiverService.receive(f.local.source!.token, f.file); await r.receiver.importWorkspace(f.file);
    const before = await f.receiver.session.read();
    await f.receiver.session.editCaption(before.source!.token, f.captionId, 'title', '変更分の記録');
    return { f, r, sent: await contributionFile(f.receiver.session, f.fs, f.store) };
  }
  async function restoreFileFixture() {
    const f = await workspaceFileFixture(); await f.receiverService.receive(f.local.source!.token, f.file);
    const session = f.reopen().session, current = await session.read(), sender = new WorkspaceSender(f.fs, session, f.store, metadata, f.locks);
    const backupId = await sender.generateBackup(current.source!.token), file = await sender.download(backupId);
    const factories = new Map<string, MetadataStorageFactory>();
    const databases: RestoreDatabasePorts = {
      listGenerations: vi.fn(async () => [...factories.keys()]),
      open: vi.fn(async (id, allowCreate) => {
        if (id === null) return { factory: f.factory, dispose: vi.fn(async () => {}) };
        if (!factories.has(id) && allowCreate) factories.set(id, storageFactory());
        const factory = factories.get(id); if (!factory) throw Error('database does not exist');
        return { factory, dispose: vi.fn(async () => {}) };
      }),
    };
    const ports = { fs: f.fs, session, store: f.store };
    const prepare = () => BackupRestoreJob.prepare(f.fs, ports, file, metadata, databases);
    return { ...f, session, current, sender, backupFile: file, databases, factories, ports, prepare };
  }
  it('initializes backup originals in the owned generation, preserves old work and keeps edits on reentry', async () => {
    const f = await restoreFileFixture(), originalFiles = await f.fs.list(''), originalBytes = await Promise.all(originalFiles.map(p => f.fs.readBytes(p))),
      originalDb = await f.factory().loadRange([]), job = await (await f.prepare()).persist(f.ports, f.databases), scope = await job.openStaging(f.databases);
    const service = validationProjectService(scope.fs, scope.factory, f.store, budget, decode);
    await expect(f.session.initializeBackup(job)).rejects.toThrow('restore-staging-owner');
    await expect(validationProjectService(scope.fs, f.factory, f.store, budget, decode).session.initializeBackup(job)).rejects.toThrow('restore-staging-owner');
    const done = await service.session.initializeBackup(job);
    expect(done.state).toBe('ready'); expect(done.source!.originalChanges()).toEqual(job.inspection.source.originalChanges());
    expect(done.source!.heads).toEqual(job.inspection.source.heads);
    expect(await f.factory().loadRange([])).toEqual(originalDb);
    expect(await Promise.all(originalFiles.map(p => f.fs.readBytes(p)))).toEqual(originalBytes);
    const journal = new TransactionJournal(scope.fs, metadata), first = (await journal.entries())[0]!;
    expect(first.start.purpose).toBe('restoreBackup');
    const p = first.prepared!, preimage = { transactionId: job.id, target: { identity: p.start.proof.identity, metadataEnvelope: p.start.proof.envelope },
      purpose: 'restoreBackup', stagedBlobs: p.stagedBlobs ?? [], metadataBatch: { kind: 'restoreBackup', baseHeads: [], changes: p.changes, ...p.remote } };
    expect(p.exactChangeSetDigest).toBe(await digest(new TextEncoder().encode(`lociview:v2:backup-restore:jcs-v1\n${json(preimage)}`)));
    await expect(journal.validateImport(p)).rejects.toThrow('import-journal');
    const edited = await service.session.editCaption(done.source!.token, f.captionId, 'body', '復元後の追記');
    const before = await scope.factory().loadRange([]), paths = await scope.fs.list(scope.fs.projectRoot!), bytes = await Promise.all(paths.map(p => scope.fs.readBytes(p)));
    expect((await service.session.initializeBackup(job)).source!.token).toBe(edited.source!.token);
    expect(await scope.factory().loadRange([])).toEqual(before); expect(await Promise.all(paths.map(p => scope.fs.readBytes(p)))).toEqual(bytes);
    expect((await readRestoreControls(f.fs, metadata)).selection).toBeNull(); // Metadata publication is not a selected restore.
    const bases = new WorkspaceBaseStore(scope.fs, metadata, done.source!.proof), snapshot = await bases.snapshot();
    expect(snapshot).toEqual(await new WorkspaceBaseStore(f.fs, metadata, done.source!.proof).snapshot());
    const peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(f.file);
    const sent = await contributionFile(service.session, scope.fs, f.store), peerBefore = await peer.session.read();
    const received = await peer.receiver.receive(peerBefore.source!.token, sent.file);
    if (received.provider?.kind !== 'scene-provider') throw Error('provider');
    expect(received.provider.resources.captions[f.captionId]!.body).toEqual({ kind: 'value', value: '復元後の追記' });
    const peerEdit = await peer.session.editCaption(received.source!.token, f.captionId, 'title', '復元先へ返送');
    const reply = await contributionFile(peer.session, peer.fs, peer.store);
    const receiver = new WorkspaceReceiver(f.fs, scope.fs, service.session, metadata, f.locks);
    const merged = await receiver.receive(edited.source!.token, reply.file);
    if (merged.provider?.kind !== 'scene-provider') throw Error('provider');
    expect(merged.provider.resources.captions[f.captionId]!.title).toEqual({ kind: 'value', value: '復元先へ返送' });
    expect(merged.provider.resources.captions[f.captionId]!.body).toEqual({ kind: 'value', value: '復元後の追記' });
    expect((await receiver.receive(merged.source!.token, reply.file)).source!.token).toBe(merged.source!.token);
    expect(await bases.snapshot()).toEqual(snapshot); expect(peerEdit.state).toBe('ready');
    const bindingPath = `${scope.fs.projectRoot}/v2/metadata/restored-bases.json`;
    await f.fs.remove(bindingPath);
    await expect(service.session.initializeBackup(job)).rejects.toThrow();
    expect((await service.session.read()).state).toBe('repair-required');
    await expect(bases.read()).rejects.toThrow('restore-base-binding');
    expect(await f.fs.exists(bindingPath)).toBe(false);
    await scope.dispose();
  }, 60_000);
  it('cold-recovers backup initialization only with its original job and rejects lost acknowledged source', async () => {
    const f = await restoreFileFixture(), job = await (await f.prepare()).persist(f.ports, f.databases), scope = await job.openStaging(f.databases);
    const service = validationProjectService(scope.fs, scope.factory, f.store, budget, decode);
    f.fs.reject = path => path.endsWith('/blobsVerified.json');
    await expect(service.session.initializeBackup(job)).rejects.toThrow('injected quota'); f.fs.reject = () => false; await scope.dispose();
    const coldJob = await BackupRestoreJob.open(f.fs, job.id, metadata, f.databases), cold = await coldJob.openStaging(f.databases),
      reopened = validationProjectService(cold.fs, cold.factory, f.store, budget, decode);
    await expect(reopened.session.retry()).rejects.toThrow('restore-job-recovery-required');
    expect((await reopened.session.initializeBackup(coldJob)).state).toBe('ready');
    const path = new TransactionJournal(cold.fs, metadata).path(job.id, 'source-exchange-bases.json'); await cold.fs.remove(path);
    await expect(reopened.session.initializeBackup(coldJob)).rejects.toThrow();
    expect(await cold.fs.exists(path)).toBe(false); expect((await reopened.session.read()).state).toBe('repair-required');
    expect((await f.session.read()).source!.token).toBe(f.current.source!.token); await cold.dispose();
  }, 60_000);
  it('restores labeled historical bases and verifies base-only saved bodies without repairing their later corruption', async () => {
    const f = await restoreFileFixture(), bases = new WorkspaceBaseStore(f.fs, metadata, f.current.source!.proof), table = await bases.snapshot();
    table.records[0]!.label = '配布時点';
    const doc = A.change(A.load<Record<string, any>>(f.current.source!.encodeFullSource()), draft => {
      for (const key of ['assetsById', 'captionsById', 'captionAttachmentsById', 'sceneAssetMembershipsById', 'sceneCaptionMembershipsById', 'materialOverridesById', 'captionTagMembershipsById'])
        for (const row of Object.values(draft[key]) as Record<string, any>[]) row.lifecycle = new A.ImmutableString(json({ state: 'deleted', reason: 'userDelete', eventId: `evt_${newId()}` }));
    });
    const source = ProjectMetadataSource.fromFullSource(A.save(doc), f.current.source!.proof, metadata), evidence = [];
    for (const reference of backupEvidenceRefs(table)) evidence.push({ reference, bytes: await bases.readEvidence(reference) });
    const capture = await BackupSourceCapture.restore(source.encodeFullSource(), source.proof, source.token, backupEncode(table), evidence, f.store, metadata);
    expect((capture.description.inventory as JsonObject).blobs).toEqual(capture.blobs.map(e => ({ sha256: e.sha256, byteLength: e.byteLength, reasons: ['exchangeBase'] })));
    const chunks: BlobPart[] = [];
    await writeBackupArchive(capture, f.store, new WritableStream({ write(b) { chunks.push(b.slice() as BlobPart); } }), { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    const job = await (await BackupRestoreJob.prepare(f.fs, f.ports, new Blob(chunks), metadata, f.databases)).persist(f.ports, f.databases), scope = await job.openStaging(f.databases);
    const service = validationProjectService(scope.fs, scope.factory, f.store, budget, decode), bodyRead = vi.spyOn(f.store, 'open'), priorReads = f.fs.reads;
    const done = await service.session.initializeBackup(job); expect(done.state).toBe('ready');
    expect(new Set(bodyRead.mock.calls.map(c => c[0].digest))).toEqual(new Set(capture.bodyRefs.map(r => r.digest)));
    expect(f.fs.reads - priorReads).toBeGreaterThanOrEqual(capture.bodyRefs.length);
    expect(await new WorkspaceBaseStore(scope.fs, metadata, source.proof).snapshot()).toEqual(table);
    const body = capture.bodyRefs[0]!, receipt = JSON.parse((await f.fs.readText(`v2/cas/sha256/${body.digest.slice(0, 2)}/${body.digest.slice(2)}.json`))!);
    const path = `v2/cas/objects/${receipt.objectId}.bin`, corrupt = (await f.fs.readBytes(path))!.slice(); corrupt[0] = corrupt[0]! ^ 255;
    await f.fs.writeBytes(path, corrupt);
    await expect(service.session.initializeBackup(job)).rejects.toThrow(); expect(await f.fs.readBytes(path)).toEqual(corrupt);
    await scope.dispose();
  }, 60_000);
  it('does not substitute historical rows for a lost acknowledged post-restore receive receipt', async () => {
    const f = await restoreFileFixture(), job = await (await f.prepare()).persist(f.ports, f.databases), scope = await job.openStaging(f.databases),
      service = validationProjectService(scope.fs, scope.factory, f.store, budget, decode), done = await service.session.initializeBackup(job),
      receiver = new WorkspaceReceiver(f.fs, scope.fs, service.session, metadata, f.locks);
    const read = await receiver.receive(done.source!.token, f.file); expect(read.source!.token).toBe(done.source!.token);
    const bases = new WorkspaceBaseStore(scope.fs, metadata, done.source!.proof), rows = await bases.read();
    expect(rows).toHaveLength(2); expect(rows[0]).toEqual(rows[1]);
    for (const path of await scope.fs.list(`${scope.fs.projectRoot}/v2/packages/bases/`)) await f.fs.remove(path);
    for (const path of await scope.fs.list(`${scope.fs.projectRoot}/v2/packages/evidence/`)) await f.fs.remove(path);
    await expect(bases.read()).rejects.toThrow('receive-base-missing');
    await expect(bases.readEvidence(rows[0]!.evidence.metadata)).rejects.toThrow('receive-base-missing');
    await expect(receiver.receive(read.source!.token, f.file)).rejects.toThrow();
    expect(await scope.fs.list(`${scope.fs.projectRoot}/v2/packages/bases/`)).toEqual([]); await scope.dispose();
  }, 60_000);
  it('selects restored data once, cold-recovers its result and permits a second explicit restore with old writers fenced', async () => {
    const f = await restoreFileFixture();
    const ports = (scope: { fs: ProjectWorkspaceFS; factory: MetadataStorageFactory }) => ({ fs: scope.fs, factory: scope.factory, store: f.store,
      session: validationProjectService(scope.fs, scope.factory, f.store, budget, decode).session });
    const original = await BackupRestoreJob.openSelected(f.fs, metadata, f.databases, ports);
    const job = await (await BackupRestoreJob.prepare(f.fs, original.ports, f.backupFile, metadata, f.databases)).persist(original.ports, f.databases),
      staging = await job.openStaging(f.databases), destination = ports(staging);
    expect((await original.ports.session.read()).source!.token).toBe(f.current.source!.token);
    await expect((original.ports.session as ReturnType<typeof validationProjectService>['session']).editCaption(f.current.source!.token, f.captionId, 'body', '拒否される編集')).rejects.toThrow('restore-pending');
    const initialized = await destination.session.initializeBackup(job); expect(initialized.state).toBe('ready');
    const retainedInput = (await f.fs.readBytes(job.path('input.zip')))!;
    const corruptInput = retainedInput.slice(); corruptInput[128] = corruptInput[128]! ^ 1;
    await f.fs.writeBytes(job.path('input.zip'), corruptInput);
    await expect(job.select(original.ports, destination, f.databases, ports)).rejects.toThrow();
    expect((await readRestoreControls(f.fs, metadata)).selection).toBeNull();
    // Remove only the injected fault in the in-memory fixture; production never repairs acknowledged input.
    await f.fs.writeBytes(job.path('input.zip'), retainedInput);
    f.fs.reject = path => path.endsWith('/result.json');
    await expect(job.select(original.ports, destination, f.databases, ports)).rejects.toThrow('injected quota');
    expect((await readRestoreControls(f.fs, metadata)).tail!.jobId).toBe(job.id);
    await expect(original.check()).rejects.toThrow('restore-generation-retired');
    await expect(staging.check()).rejects.toThrow('restore-staging-retired');
    f.fs.reject = () => false;
    const selection = await BackupRestoreJob.resumeSelection(f.fs, metadata, f.databases, ports);
    expect(await BackupRestoreJob.resumeSelection(f.fs, metadata, f.databases, ports)).toEqual(selection);
    const selected = await BackupRestoreJob.openSelected(f.fs, metadata, f.databases, ports), selectedPorts = ports(selected);
    const edited = await selectedPorts.session.editCaption(initialized.source!.token, f.captionId, 'body', '切替後の編集');
    expect((await selectedPorts.session.read()).source!.token).toBe(edited.source!.token);
    await f.fs.writeBytes(job.path('input.zip'), corruptInput);
    await expect(BackupRestoreJob.prepare(f.fs, selectedPorts, f.backupFile, metadata, f.databases)).rejects.toThrow();
    expect((await readRestoreControls(f.fs, metadata)).jobs).toHaveLength(1);
    await f.fs.writeBytes(job.path('input.zip'), retainedInput);
    const again = await (await BackupRestoreJob.prepare(f.fs, selectedPorts, f.backupFile, metadata, f.databases)).persist(selectedPorts, f.databases),
      stagedAgain = await again.openStaging(f.databases), againPorts = ports(stagedAgain);
    await againPorts.session.initializeBackup(again); await again.select(selectedPorts, againPorts, f.databases, ports);
    await expect(selected.check()).rejects.toThrow('restore-generation-retired');
    const final = await BackupRestoreJob.openSelected(f.fs, metadata, f.databases, ports);
    expect(final.generationId).toBe(again.id); expect((await final.ports.session.read()).source!.token).toBe(initialized.source!.token);
    expect((await readRestoreControls(f.fs, metadata)).selections).toHaveLength(2);
    // Original generation retains its exact history; it is not the active resolver fallback.
    expect((await f.session.read()).source!.token).toBe(f.current.source!.token);
    await Promise.all([original.dispose(), staging.dispose(), selected.dispose(), stagedAgain.dispose(), final.dispose()]);
  }, 60_000);
  it('rejects cancelled backup capabilities and a complete-looking but incomplete original set', async () => {
    const f = await restoreFileFixture(), job = await (await f.prepare()).persist(f.ports, f.databases), scope = await job.openStaging(f.databases),
      service = validationProjectService(scope.fs, scope.factory, f.store, budget, decode), { input, inspection } = await job.initialization(scope.fs, scope.factory);
    const journal = new TransactionJournal(scope.fs, metadata), start = { transactionId: job.id, repositoryId: job.id, predecessor: null,
      purpose: 'restoreBackup' as const, proof: inspection.source.proof, baseHeads: [] };
    await expect(underWriteLease(scope.fs, () => journal.stage(start, inspection.source.originalChanges().slice(0, 2), [], input))).rejects.toThrow('restore-complete-set');
    expect((await journal.entries())[0]?.prepared).toBeNull();
    await BackupRestoreJob.cancel(f.fs, job.id, metadata, f.databases);
    await expect(service.session.initializeBackup(job)).rejects.toThrow('restore-staging-retired'); await scope.dispose();
  }, 60_000);
  it('reserves restore terminal controls and counts original files and retained bodies before any write', async () => {
    const fs = new TestFS(), listed = vi.spyOn(fs, 'list');
    listed.mockResolvedValue(Array.from({ length: PACKAGE_LIMITS.entryCount - 3 }, (_, i) => `original/${i}`));
    await expect(reserveRestoreControls(fs, [{ stage: 'later' }], 7)).rejects.toThrow('restore-entry-budget'); listed.mockRestore();
    await fs.writeText('retained/body', '');
    const read = fs.readStream.bind(fs), opened = vi.spyOn(fs, 'readStream').mockImplementation(async path => {
      const file = await read(path); return file && path === 'retained/body' ? { ...file, size: 2_147_483_648 - 16_777_216 - 20 } : file;
    });
    await expect(reserveRestoreControls(fs, [{ stage: 'db-opened-and-terminal-result' }], 2)).rejects.toThrow('restore-space-budget');
    await expect(writeRestoreControl(fs, `v2/local-restore/jobs/${newId()}/abandoned.json`, { retained: 'no room for terminal record' }, metadata)).rejects.toThrow('restore-space-budget');
    expect(await fs.list('v2/local-restore/')).toEqual([]); opened.mockRestore();
  });
  it('rejects lookalike restore control filenames and unknown generation namespaces', async () => {
    const fs = new TestFS(), id = newId(), path = `v2/local-restore/jobs/${id}/preparedXjson`;
    await fs.writeText(path, '{}'); await expect(readRestoreControls(fs, metadata)).rejects.toThrow('restore-control-path');
    await fs.remove(path); await fs.writeText(`v2/generations/${id}/v2/metadata/orphan`, '{}');
    await expect(readRestoreControls(fs, metadata)).rejects.toThrow('restore-orphan-generation');
  });
  it('owns a confirmed restore ZIP and fences its separate staging scope without changing current work', async () => {
    const f = await restoreFileFixture(), originalFiles = await f.fs.list(''), originalDb = await f.factory().loadRange([]);
    const bytes = await Promise.all(originalFiles.map(p => f.fs.readBytes(p))), prepared = await f.prepare();
    expect(await f.fs.list('v2/local-restore/')).toEqual([]);
    expect(Object.isFrozen(prepared.current.source.heads)).toBe(true);
    const job = await prepared.persist(f.ports, f.databases), state = await readRestoreControls(f.fs, metadata);
    expect(state.selection).toBeNull(); expect(state.pending).toMatchObject({ id: job.id, indexed: true, dbOpened: false });
    expect(job.inspection.source.proof).toEqual(f.current.source!.proof);
    const scope = await job.openStaging(f.databases);
    expect(f.databases.open).toHaveBeenLastCalledWith(job.id, true);
    expect((await readRestoreControls(f.fs, metadata)).pending?.dbOpened).toBe(true);
    const inspect = vi.spyOn(BackupArchive, 'inspect'), path = `${scope.fs.projectRoot}/v2/metadata/test-content`;
    await underWriteLease(scope.fs, async () => { await scope.fs.writeText(path, 'retained'); await scope.factory().save(['test'], new Uint8Array([1, 2])); });
    const stream = (await scope.fs.readStream(path))!.stream();
    await scope.fs.readText(path); await scope.factory().load(['test']);
    expect(inspect).not.toHaveBeenCalled(); inspect.mockRestore();
    await BackupRestoreJob.cancel(f.fs, job.id, metadata, f.databases);
    await expect(scope.fs.readText(path)).rejects.toThrow('restore-staging-retired');
    await expect(scope.factory().save(['test'], new Uint8Array([9]))).rejects.toThrow('restore-staging-retired');
    await expect(stream.getReader().read()).rejects.toThrow('restore-staging-retired');
    expect(await f.fs.readText(path)).toBe('retained');
    expect(await f.factory().loadRange([])).toEqual(originalDb);
    expect(await Promise.all(originalFiles.map(p => f.fs.readBytes(p)))).toEqual(bytes);
    expect((await f.reopen().session.read()).source!.token).toBe(f.current.source!.token);
    await scope.dispose();
  }, 30000);
  it('rejects restore confirmation after same-head base changes and after local edits before any restore write', async () => {
    const f = await restoreFileFixture(), prepared = await f.prepare();
    await f.sender.generate(f.current.source!.token);
    expect((await f.session.read()).source!.token).toBe(f.current.source!.token);
    await expect(prepared.persist(f.ports, f.databases)).rejects.toThrow('restore-confirmation-stale');
    const next = await f.prepare();
    await f.session.editCaption(f.current.source!.token, f.captionId, 'body', '後の作業');
    await expect(next.persist(f.ports, f.databases)).rejects.toThrow('restore-confirmation-stale');
    expect(await f.fs.list('v2/local-restore/')).toEqual([]); expect(f.databases.open).not.toHaveBeenCalled();
  }, 30000);
  it('rejects corrupt or wrong-purpose restore input without storage writes', async () => {
    const f = await restoreFileFixture(), bytes = new Uint8Array(await f.backupFile.arrayBuffer()); bytes[128] = bytes[128]! ^ 1;
    await expect(BackupRestoreJob.prepare(f.fs, f.ports, new Blob([bytes]), metadata, f.databases)).rejects.toThrow();
    await expect(BackupRestoreJob.prepare(f.fs, f.ports, f.file, metadata, f.databases)).rejects.toThrow('backup-purpose');
    expect(await f.fs.list('v2/local-restore/')).toEqual([]);
  }, 30000);
  it('refuses restore preparation and confirmation while a completed output has lost its acknowledged artifact', async () => {
    const f = await restoreFileFixture(), prepared = await f.prepare();
    const artifact = (await f.fs.list('v2/packages/backup-output/')).find(p => p.includes('/artifacts/') && p.endsWith('.zip'))!;
    expect(artifact).toBeDefined(); await f.fs.remove(artifact);
    expect((await f.session.read()).source!.token).toBe(f.current.source!.token);
    await expect(f.prepare()).rejects.toThrow('output-artifact-missing');
    await expect(prepared.persist(f.ports, f.databases)).rejects.toThrow('output-artifact-missing');
    expect(await f.fs.list('v2/local-restore/')).toEqual([]); expect(await f.fs.exists(artifact)).toBe(false);
    expect(f.databases.open).not.toHaveBeenCalled();
  }, 30000);
  it.each(['input.zip', 'start.json'] as const)('preserves a pre-Start restore interruption at %s until explicit abandonment', async stage => {
    const f = await restoreFileFixture(), prepared = await f.prepare();
    f.fs.reject = p => p === prepared.path(stage);
    await expect(prepared.persist(f.ports, f.databases)).rejects.toThrow('injected quota'); f.fs.reject = () => false;
    expect((await readRestoreControls(f.fs, metadata)).pending).toMatchObject({ id: prepared.id, start: null });
    await expect(prepared.persist(f.ports, f.databases)).rejects.toThrow('restore-job-exists');
    await expect(f.prepare()).rejects.toThrow('restore-pending');
    const paths = await f.fs.list('v2/local-restore/'), saved = await Promise.all(paths.map(p => f.fs.readBytes(p)));
    await BackupRestoreJob.abandon(f.fs, prepared.id, metadata, f.databases);
    expect(await Promise.all(paths.map(p => f.fs.readBytes(p)))).toEqual(saved);
    expect((await f.prepare()).id).not.toBe(prepared.id); expect(f.databases.open).not.toHaveBeenCalled();
  }, 30000);
  it('does not recreate a lost restore Index and proves absence before explicit pre-initialization cancellation', async () => {
    const f = await restoreFileFixture(), prepared = await f.prepare(), index = `v2/local-restore/index/${prepared.id}.json`;
    f.fs.reject = p => p === index;
    await expect(prepared.persist(f.ports, f.databases)).rejects.toThrow('injected quota'); f.fs.reject = () => false;
    const cold = await BackupRestoreJob.open(f.fs, prepared.id, metadata, f.databases);
    await expect(cold.openStaging(f.databases)).rejects.toThrow('restore-staging-retired');
    const list = f.databases.listGenerations;
    f.databases.listGenerations = async () => { throw Error('probe unavailable'); };
    await expect(BackupRestoreJob.cancel(f.fs, prepared.id, metadata, f.databases)).rejects.toThrow('probe unavailable');
    expect(await f.fs.exists(prepared.path('result.json'))).toBe(false); f.databases.listGenerations = list;
    f.factories.set(prepared.id, storageFactory());
    await expect(BackupRestoreJob.cancel(f.fs, prepared.id, metadata, f.databases)).rejects.toThrow('restore-orphan-database');
    f.factories.delete(prepared.id);
    await BackupRestoreJob.cancel(f.fs, prepared.id, metadata, f.databases);
    expect(JSON.parse((await f.fs.readText(prepared.path('result.json')))!)).toMatchObject({ detail: { kind: 'cancelled', stage: 'beforeInitializationWithoutIndex' } });
    expect(await f.fs.exists(index)).toBe(false);
    await expect(cold.openStaging(f.databases)).rejects.toThrow('restore-not-pending');
    expect((await readRestoreControls(f.fs, metadata)).selection).toBeNull();
  }, 30000);
  it('cold-opens only an existing restore DB and finishes an interrupted empty-DB acknowledgment', async () => {
    const f = await restoreFileFixture(), job = await (await f.prepare()).persist(f.ports, f.databases);
    f.fs.reject = p => p === job.path('db-opened.json');
    await expect(job.openStaging(f.databases)).rejects.toThrow('injected quota'); f.fs.reject = () => false;
    expect(f.factories.has(job.id)).toBe(true);
    const cold = await BackupRestoreJob.open(f.fs, job.id, metadata, f.databases), scope = await cold.openStaging(f.databases);
    expect(f.databases.open).toHaveBeenLastCalledWith(job.id, false);
    expect((await readRestoreControls(f.fs, metadata)).pending?.dbOpened).toBe(true);
    await scope.dispose(); f.factories.delete(job.id);
    await expect(BackupRestoreJob.open(f.fs, job.id, metadata, f.databases)).rejects.toThrow('restore-database-missing');
    await expect(job.openStaging(f.databases)).rejects.toThrow('restore-database-missing');
    expect(f.factories.has(job.id)).toBe(false);
  }, 30000);
  it('does not turn a cold uncreated restore DB into permission to create and retains acknowledged input loss', async () => {
    const f = await restoreFileFixture(), job = await (await f.prepare()).persist(f.ports, f.databases);
    const cold = await BackupRestoreJob.open(f.fs, job.id, metadata, f.databases);
    await expect(cold.openStaging(f.databases)).rejects.toThrow('database does not exist');
    expect(f.databases.open).toHaveBeenLastCalledWith(job.id, false);
    await f.fs.remove(job.path('input.zip'));
    await expect(job.openStaging(f.databases)).rejects.toThrow('restore-input-missing');
    expect(f.factories.size).toBe(0); expect(await f.fs.exists(job.path('input.zip'))).toBe(false);
  }, 30000);
  it('refuses unacknowledged restore destination data instead of fabricating a DB acknowledgment', async () => {
    const f = await restoreFileFixture(), job = await (await f.prepare()).persist(f.ports, f.databases), factory = storageFactory();
    f.factories.set(job.id, factory); await factory().save(['unexpected'], new Uint8Array([1]));
    const cold = await BackupRestoreJob.open(f.fs, job.id, metadata, f.databases);
    await expect(cold.openStaging(f.databases)).rejects.toThrow('restore-unacknowledged-database');
    expect(await f.fs.exists(job.path('db-opened.json'))).toBe(false);
    await f.fs.writeText(`v2/generations/${job.id}/v2/metadata/unacknowledged`, 'retained');
    await expect(readRestoreControls(f.fs, metadata)).rejects.toThrow('restore-orphan-generation');
  }, 30000);
  it('structurally reads a restore selection tail, refuses activation and detects its lost terminal witness (not initialization evidence)', async () => {
    const f = await restoreFileFixture(), job = await (await f.prepare()).persist(f.ports, f.databases), scope = await job.openStaging(f.databases);
    const selection = { schema: 'lociview-local-generation-selection-1', previous: null, jobId: job.id, start: restoreRef(job.start),
      destination: { journal: restoreRef({ fake: 'journal' }), publication: restoreRef({ fake: 'publication' }), baseBinding: restoreRef({ fake: 'base' }) } };
    const path = `v2/local-restore/selections/${restoreRef(selection).sha256}.json`;
    // Deliberately write only control fixtures. These refs cannot activate an uninitialized destination.
    await f.fs.writeText(path, json(selection));
    expect((await readRestoreControls(f.fs, metadata)).tail?.jobId).toBe(job.id);
    await expect(f.prepare()).rejects.toThrow('restore-pending');
    await expect(scope.check()).rejects.toThrow('restore-staging-retired');
    await f.fs.writeText(job.path('result.json'), json({ schema: 'lociview-local-restore-result-1', jobId: job.id, start: restoreRef(job.start), detail: { kind: 'selected', selection: restoreRef(selection) } }));
    await expect(BackupRestoreJob.openSelected(f.fs, metadata, f.databases, selected => ({ fs: selected.fs,
      factory: selected.factory, store: f.store, ...validationProjectService(selected.fs, selected.factory, f.store, budget, decode) }))).rejects.toThrow();
    await f.fs.remove(path);
    await expect(readRestoreControls(f.fs, metadata)).rejects.toThrow('restore-selected-missing');
    await scope.dispose();
  }, 30000);
  it('freezes selected-Scene review output and cold retries without source edits, bases or a false file-save acknowledgment', async () => {
    const f = await workspaceFileFixture(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const selected = await f.local.source!.inspectOriginal({ maxNodes: 100000, maxWork: 1000000 });
    const sceneId = selected.candidates.fields.find(field => field.path[0] === 'scenesById')!.path[1]!;
    const beforeBases = await new WorkspaceBaseStore(f.fs, metadata, f.local.source!.proof).snapshot();
    const preview = await sender.previewReview(f.local.source!.token, { sceneId }); expect(preview.models).toBeGreaterThan(0);
    const write = f.fs.writeStream.bind(f.fs); let stopped = false;
    vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (!stopped && path.includes('/review-output/') && path.includes('/artifacts/')) { stopped = true; throw Error('review sink opening failed'); }
      return write(path, stream);
    });
    await expect(sender.generateReview(f.local.source!.token, { sceneId })).rejects.toThrow('review sink opening failed');
    const [id] = await ReviewOutputJob.ids(f.fs), job = await ReviewOutputJob.open(f.fs, id!, metadata), manifest = job.manifest();
    const later = await f.receiver.session.editCaption(f.local.source!.token, f.captionId, 'body', '共有用生成の後に追記');
    const cold = new WorkspaceSender(f.fs, f.reopen().session, f.store, metadata, f.locks);
    await cold.retry(id!); const file = await cold.download(id!), review = await ReviewArchive.inspect(file, metadata);
    expect(review.archive.control.manifest).toEqual(manifest); expect(review).not.toHaveProperty('source');
    expect((await cold.jobs()).find(j => j.id === id)).toMatchObject({ purpose: 'review', state: 'generated' });
    expect(JSON.stringify(review.review.snapshot)).not.toContain('共有用生成の後に追記');
    expect((await f.receiver.session.read()).source!.token).toBe(later.source!.token);
    expect(await new WorkspaceBaseStore(f.fs, metadata, f.local.source!.proof).snapshot()).toEqual(beforeBases);
    await cold.verifyFile(id!, file); expect((await cold.jobs()).find(j => j.id === id)?.state).toBe('file-verified');
    for (const path of await f.fs.list(`v2/packages/review-output/${id}/`)) await f.fs.remove(path);
    expect(await cold.jobs()).toContainEqual(expect.objectContaining({ id, purpose: 'review', state: 'repair-required' }));
    await expect(cold.generateReview(later.source!.token, { sceneId })).rejects.toThrow();
  }, 60000);
  it('connects clean copy to independent editing and cold reopen without an exchange base', async () => {
    const f = await workspaceFileFixture(), current = await f.receiverService.receive(f.local.source!.token, f.file);
    const sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks), sourceBytes = current.source!.encodeFullSource();
    const beforeBases = await new WorkspaceBaseStore(f.fs, metadata, current.source!.proof).snapshot();
    const id = await sender.generateClean(current.source!.token), file = await sender.download(id), clean = await CleanArchive.inspect(file, metadata);
    expect(clean.source.proof.identity).not.toEqual(current.source!.proof.identity);
    expect(clean.source.originalChanges()).toHaveLength(2);
    expect((await sender.jobs()).find(j => j.id === id)).toMatchObject({ purpose: 'clean', state: 'generated' });
    expect((await f.receiver.session.read()).source!.encodeFullSource()).toEqual(sourceBytes);
    expect(await new WorkspaceBaseStore(f.fs, metadata, current.source!.proof).snapshot()).toEqual(beforeBases);
    const r = firstWorkspaceRecipient(), imported = await r.receiver.importWorkspace(file);
    expect(imported.state).toBe('ready'); expect(imported.source!.originalChanges()).toEqual(clean.source.originalChanges());
    expect(await new WorkspaceBaseStore(r.fs, metadata, imported.source!.proof).read()).toEqual([]);
    const captionId = Object.keys((clean.description.records.captionsById as Record<string, unknown>))[0]!;
    expect(captionId).not.toBe(f.captionId);
    const edited = await r.session.editCaption(imported.source!.token, captionId, 'body', '独立した記録');
    const cold = r.reopen(), [jobId] = await CleanInputJob.ids(r.fs);
    expect((await cold.session.read()).source!.originalChanges()).toEqual(edited.source!.originalChanges());
    expect((await cold.receiver.retry(jobId!)).source!.token).toBe(edited.source!.token);
    await expect(cold.receiver.receive(edited.source!.token, file)).rejects.toThrow('独立コピー');
    await expect(cold.receiver.importWorkspace(file)).rejects.toThrow('clean-import-not-empty');
    expect((await cold.receiver.jobs())[0]).toMatchObject({ state: 'completed' });
    await sender.verifyFile(id, file); expect((await sender.jobs()).find(j => j.id === id)?.state).toBe('file-verified');
    await r.fs.remove(`v2/packages/clean-input/${jobId}/input.zip`);
    expect((await cold.session.read()).state).toBe('repair-required');
    await expect(cold.receiver.retry(jobId!)).rejects.toThrow();
    expect((await f.receiver.session.read()).source!.encodeFullSource()).toEqual(sourceBytes);
  }, 60000);
  it('cold-retries frozen clean output and interrupted independent initialization without reseeding', async () => {
    const f = await workspaceFileFixture(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const write = f.fs.writeStream.bind(f.fs); let stopped = false;
    vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (!stopped && path.includes('/clean-output/') && path.includes('/artifacts/')) {
        stopped = true; const reader = stream.getReader(), chunk = await reader.read();
        await f.fs.writeBytes(path, chunk.value!.slice(0, 24)); await reader.cancel(); throw Error('partial clean output');
      }
      return write(path, stream);
    });
    await expect(sender.generateClean(f.local.source!.token)).rejects.toThrow();
    const [id] = await CleanOutputJob.ids(f.fs), job = await CleanOutputJob.open(f.fs, id!, metadata), expected = job.manifest();
    const later = await f.receiver.session.editCaption(f.local.source!.token, f.captionId, 'body', 'コピー生成後の記録');
    const coldSender = new WorkspaceSender(f.fs, f.reopen().session, f.store, metadata, f.locks);
    await coldSender.retry(id!); const file = await coldSender.download(id!);
    expect((await CleanArchive.inspect(file, metadata)).archive.control.manifest).toEqual(expected);
    expect((await f.receiver.session.read()).source!.token).toBe(later.source!.token);
    const r = firstWorkspaceRecipient(); r.fs.reject = p => p.includes('/journal/') && p.endsWith('/published.json');
    await expect(r.receiver.importWorkspace(file)).rejects.toThrow();
    const [inputId] = await CleanInputJob.ids(r.fs); expect((await r.session.read()).state).toBe('pending');
    await expect(r.session.retry()).rejects.toThrow('receive-job-recovery-required');
    r.fs.reject = () => false; const cold = r.reopen(), ready = await cold.receiver.retry(inputId!);
    expect(ready.state).toBe('ready'); expect(ready.source!.originalChanges()).toEqual(job.output.originalChanges());
    expect((await cold.receiver.retry(inputId!)).publication).toBe(ready.publication);
    expect(await new WorkspaceBaseStore(r.fs, metadata, ready.source!.proof).read()).toEqual([]);
  }, 60000);
  it('refuses lost clean output and stale pre-Start input without replenishing acknowledged bytes', async () => {
    const f = await workspaceFileFixture(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    // A failure before the sink takes a reader must settle, not leave the bridge hanging.
    const write = f.fs.writeStream.bind(f.fs); let refused = false;
    vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (!refused && path.includes('/clean-output/') && path.includes('/artifacts/')) { refused = true; throw Error('sink opening failed'); }
      return write(path, stream);
    });
    await expect(sender.generateClean(f.local.source!.token)).rejects.toThrow('sink opening failed');
    const [id] = await CleanOutputJob.ids(f.fs); await sender.retry(id!); const file = await sender.download(id!);
    const r = firstWorkspaceRecipient(); r.fs.reject = p => p.includes('/clean-input/') && p.endsWith('/input.zip');
    await expect(r.receiver.importWorkspace(file)).rejects.toThrow(); r.fs.reject = () => false;
    const [inputId] = await CleanInputJob.ids(r.fs), stale = await CleanInputJob.reselect(r.fs, inputId!, file, metadata);
    await underWriteLease(r.fs, () => stale.persist(0)); // Durable Start, no metadata journal yet.
    const zip = `v2/packages/clean-input/${inputId}/input.zip`; await r.fs.remove(zip);
    await expect(r.session.initializeClean(stale)).rejects.toThrow('clean-input-reselect-denied');
    expect(await r.fs.exists(zip)).toBe(false);
    for (const path of await f.fs.list(`v2/packages/clean-output/${id}/`)) await f.fs.remove(path);
    const cold = new WorkspaceSender(f.fs, f.reopen().session, f.store, metadata, f.locks);
    expect(await cold.jobs()).toContainEqual(expect.objectContaining({ id, state: 'repair-required' }));
    await expect(cold.generateClean(f.local.source!.token)).rejects.toThrow();
  }, 60000);
  it('generates separate named backups with exact originals and no base advancement or save claim', async () => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const before = await f.receiver.session.read(), token = before.source!.token, label = '現地調査前';
    const id = await sender.generateBackup(token, label), file = await sender.download(id), job = await BackupOutputJob.open(f.fs, id, metadata);
    const inspected = await BackupArchive.inspect(file, metadata);
    expect(inspected.source.encodeFullSource()).toEqual(before.source!.encodeFullSource());
    expect(inspected.description.table).toEqual(sent.snapshot);
    expect(inspected.archive.control.manifest).toMatchObject({ purpose: 'backup', targetHeads: before.source!.heads });
    expect(inspected.archive.control.manifest).not.toHaveProperty('memo');
    expect(JSON.parse((await f.fs.readText(job.path('start.json')))!)).toMatchObject({ operation: 'manualCheckpoint', label });
    expect(await new WorkspaceBaseStore(f.fs, metadata, before.source!.proof).snapshot()).toEqual(sent.snapshot);
    expect((await f.receiver.session.read()).publication).toBe(before.publication);
    const reads = f.fs.reads;
    expect((await sender.jobs()).find(j => j.id === id)).toMatchObject({ purpose: 'backup', state: 'generated', label, stale: false });
    expect(f.fs.reads).toBe(reads); // Listing checks facts/receipts, not model streams.
    const second = await sender.generateBackup(token, label), other = await sender.download(second);
    expect(second).not.toBe(id); expect((await BackupOutputJob.open(f.fs, second, metadata)).manifest().packageId).not.toBe(job.manifest().packageId);
    await expect(sender.verifyFile(id, other)).rejects.toThrow('output-selected-mismatch');
    await sender.verifyFile(id, file); const writes = vi.spyOn(f.fs, 'writeText');
    await sender.verifyFile(id, file); expect(writes).not.toHaveBeenCalled(); writes.mockRestore();
    expect((await job.steps()).map(s => s.detail.kind)).toEqual(['artifactVerified', 'externalFileVerified']);
    // A new generated Workspace observation makes the old backup stale even at identical heads.
    await sender.generate(token); const listReads = f.fs.reads;
    expect((await sender.jobs()).find(j => j.id === id)).toMatchObject({ state: 'file-verified', stale: true });
    expect(f.fs.reads).toBe(listReads); expect((await f.receiver.session.read()).source!.token).toBe(token);
    expect((await BackupArchive.inspect(await sender.download(id), metadata)).description.table).toEqual(sent.snapshot);
  }, 20000);
  it('cold-retries partial backup output from frozen originals and keeps later edits outside the named checkpoint', async () => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const writeStream = f.fs.writeStream.bind(f.fs); let interrupted = false;
    vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (!interrupted && path.includes('/backup-output/') && path.includes('/artifacts/')) {
        interrupted = true; const reader = stream.getReader(), part = await reader.read();
        await f.fs.writeBytes(path, part.value!.slice(0, 24)); await reader.cancel(); throw Error('partial backup output');
      }
      return writeStream(path, stream);
    });
    const token = sent.current.source!.token, selection = (await sender.availableBases())[0]!.selection;
    await expect(sender.generateBackup(token, '中断前')).rejects.toThrow();
    const id = (await sender.jobs())[0]!.id, job = await BackupOutputJob.open(f.fs, id, metadata), manifest = job.manifest();
    await expect(sender.generate(token)).rejects.toThrow('output-pending');
    await expect(sender.generateContribution(token, selection)).rejects.toThrow('output-pending');
    await expect(sender.generateBackup(token)).rejects.toThrow('output-pending');
    const later = await f.receiver.session.editCaption(token, f.captionId, 'body', '作成開始後の記録');
    const cold = f.reopen(), retry = new WorkspaceSender(f.fs, cold.session, f.store, metadata, f.locks);
    await retry.retry(id); const result = await BackupArchive.inspect(await retry.download(id), metadata);
    expect(result.archive.control.manifest).toEqual(manifest); expect(result.source.encodeFullSource()).toEqual(sent.current.source!.encodeFullSource());
    expect(result.description.table).toEqual(sent.snapshot); expect((await cold.session.read()).source!.token).toBe(later.source!.token);
    expect((await retry.jobs()).find(j => j.id === id)).toMatchObject({ state: 'generated', label: '中断前', stale: true });
    expect(await f.fs.list(job.path('artifacts/'))).toHaveLength(2);
    const paths = await f.fs.list(''), writes = vi.spyOn(f.fs, 'writeText'); await retry.retry(id);
    expect(await f.fs.list('')).toEqual(paths); expect(writes).not.toHaveBeenCalled();
  }, 15000);
  it.each(['metadata.am', 'base-evidence', 'artifact', 'index', 'whole-job'] as const)('does not replenish lost acknowledged backup output %s', async lost => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const token = sent.current.source!.token, selection = (await sender.availableBases())[0]!.selection;
    const id = await sender.generateBackup(token, '保護対象'), file = await sender.download(id), prefix = `v2/packages/backup-output/${id}/`;
    const targets = lost === 'whole-job' ? await f.fs.list(prefix) : lost === 'artifact' ? await f.fs.list(`${prefix}artifacts/`) :
      lost === 'base-evidence' ? (await f.fs.list(`${prefix}base-evidence/`)).slice(0, 1) :
      [lost === 'index' ? `v2/packages/backup-output-index/${id}.json` : `${prefix}${lost}`];
    expect(targets.length).toBeGreaterThan(0); for (const path of targets) await f.fs.remove(path);
    const before = await f.fs.list(''), writes = vi.spyOn(f.fs, 'writeText'), writeBytes = vi.spyOn(f.fs, 'writeBytes');
    expect((await sender.jobs()).find(j => j.id === id)!.state).toBe('repair-required');
    await expect(sender.retry(id)).rejects.toThrow(); await expect(sender.download(id)).rejects.toThrow();
    await expect(sender.verifyFile(id, file)).rejects.toThrow(); await expect(sender.generate(token)).rejects.toThrow();
    await expect(sender.generateContribution(token, selection)).rejects.toThrow(); await expect(sender.generateBackup(token)).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled(); expect(writeBytes).not.toHaveBeenCalled(); expect(await f.fs.list('')).toEqual(before);
  }, 15000);
  it('rejects acknowledged backup original loss after Start even on the initial warm generation', async () => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const write = f.fs.writeText.bind(f.fs);
    vi.spyOn(f.fs, 'writeText').mockImplementation(async (path, text) => {
      await write(path, text);
      if (path.includes('/backup-output/') && path.endsWith('/start.json'))
        await f.fs.remove(path.replace(/start\.json$/, 'metadata.am'));
    });
    await expect(sender.generateBackup(sent.current.source!.token, '原本保持')).rejects.toThrow('output-input-missing');
    const [id] = await BackupOutputJob.ids(f.fs), prefix = `v2/packages/backup-output/${id}/`;
    expect(await f.fs.list(`${prefix}steps/`)).toEqual([]); expect(await f.fs.list(`${prefix}artifacts/`)).toEqual([]);
    expect((await sender.jobs()).find(j => j.id === id)!.state).toBe('repair-required');
    expect((await f.receiver.session.read()).source!.token).toBe(sent.current.source!.token);
  });
  it('keeps backup cancellation during final durable-original validation incomplete and retryable', async () => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const cancel = new AbortController(), write = f.fs.writeStream.bind(f.fs), read = f.fs.readBytes.bind(f.fs); let artifactClosed = false;
    vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      await write(path, stream); if (path.includes('/backup-output/') && path.includes('/artifacts/')) artifactClosed = true;
    });
    vi.spyOn(f.fs, 'readBytes').mockImplementation(async path => {
      const bytes = await read(path);
      if (artifactClosed && path.includes('/backup-output/') && path.endsWith('/metadata.am')) cancel.abort();
      return bytes;
    });
    await expect(sender.generateBackup(sent.current.source!.token, '中止前', cancel.signal)).rejects.toThrow();
    const [id] = await BackupOutputJob.ids(f.fs), job = await BackupOutputJob.open(f.fs, id!, metadata);
    expect(await job.steps()).toEqual([]); expect((await sender.jobs()).find(j => j.id === id)!.state).toBe('incomplete');
    await sender.retry(id!); expect((await sender.jobs()).find(j => j.id === id)).toMatchObject({ state: 'generated', label: '中止前' });
    expect((await f.receiver.session.read()).source!.token).toBe(sent.current.source!.token);
  });
  it('abandons pre-Start backup explicitly, refuses invalid names without writes and obeys other output slots', async () => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks), token = sent.current.source!.token;
    const before = await f.fs.list('');
    for (const label of ['x\ny', 'x'.repeat(257)]) await expect(sender.generateBackup(token, label)).rejects.toThrow();
    expect(await f.fs.list('')).toEqual(before);
    f.fs.reject = p => p.includes('/backup-output/') && p.endsWith('/start.json');
    await expect(sender.generateBackup(token, '開始前')).rejects.toThrow('injected quota'); f.fs.reject = () => false;
    const job = (await sender.jobs())[0]!; expect(job).toMatchObject({ purpose: 'backup', state: 'unstarted', cancellable: true });
    await expect(sender.retry(job.id)).rejects.toThrow('output-unstarted'); await expect(sender.generate(token)).rejects.toThrow('output-pending');
    await sender.cancel(job.id); expect((await sender.jobs())[0]!.state).toBe('abandoned');
    const selection = (await sender.availableBases())[0]!.selection;
    f.fs.reject = p => p.includes('/contribution-output/') && p.includes('/artifacts/');
    await expect(sender.generateContribution(token, selection)).rejects.toThrow(); f.fs.reject = () => false;
    await expect(sender.generateBackup(token)).rejects.toThrow('output-pending');
    const pending = (await sender.jobs()).find(j => j.state === 'incomplete')!; await sender.cancel(pending.id);
    const id = await sender.generateBackup(token); expect((await sender.jobs()).find(j => j.id === id)!.state).toBe('generated');
    // IDs cannot identify two different output kinds, even before either is opened.
    await f.fs.writeText(`v2/packages/contribution-output-index/${id}.json`, '{}');
    await expect(sender.jobs()).rejects.toThrow('output-job-kind-collision');
    await expect(sender.generateBackup(token)).rejects.toThrow('output-job-kind-collision');
  }, 15000);
  it('generates durable Contribution files for two actual rounds without advancing either base or reading old model bodies', async () => {
    const { f, r, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const choices = await sender.availableBases(), beforeReads = f.fs.reads;
    const id = await sender.generateContribution(sent.current.source!.token, choices[0]!.selection), file = await sender.download(id);
    expect(f.fs.reads).toBe(beforeReads);
    const job = await ContributionOutputJob.open(f.fs, id, metadata);
    expect((await job.steps()).map(s => s.detail.kind)).toEqual(['artifactVerified']);
    const inspected = await ContributionArchive.inspect(file, sent.capture.base, f.store, metadata);
    expect(inspected.target.token).toBe(sent.current.source!.token);
    expect(inspected.archive.control.manifest).toMatchObject({ purpose: 'contribution', base: choices[0]!.selection });
    expect((await sender.jobs()).find(j => j.id === id)).toMatchObject({ purpose: 'contribution', state: 'generated' });
    await expect(sender.verifyFile(id, sent.file)).rejects.toThrow('output-selected-mismatch');
    await sender.verifyFile(id, file);
    const writes = vi.spyOn(f.fs, 'writeText'); await sender.verifyFile(id, file); expect(writes).not.toHaveBeenCalled(); writes.mockRestore();
    const remote = await r.session.read(), local = await r.session.editCaption(remote.source!.token, f.captionId, 'body', '受信側の追記');
    const received = await r.receiver.receive(local.source!.token, file), reply = new WorkspaceSender(r.fs, r.session, r.store, metadata, r.locks);
    const rBases = await new WorkspaceBaseStore(r.fs, metadata, received.source!.proof).snapshot();
    const replyId = await reply.generateContribution(received.source!.token, (await reply.availableBases())[0]!.selection);
    const returned = await f.receiverService.receive(sent.current.source!.token, await reply.download(replyId));
    expect(returned.source!.token).toBe(received.source!.token);
    expect(await new WorkspaceBaseStore(f.fs, metadata, returned.source!.proof).snapshot()).toEqual(sent.snapshot);
    expect(await new WorkspaceBaseStore(r.fs, metadata, received.source!.proof).snapshot()).toEqual(rBases);
    const cold = r.reopen(), replay = await cold.receiver.receive(received.source!.token, file);
    expect(replay.source!.token).toBe(received.source!.token);
    expect((await sender.jobs()).find(j => j.id === id)!.state).toBe('file-verified');
  }, 20000);
  it('cold-retries a partial Contribution artifact from frozen originals and blocks competing Workspace generation', async () => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const selection = (await sender.availableBases())[0]!.selection, writeStream = f.fs.writeStream.bind(f.fs); let interrupted = false;
    vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (!interrupted && path.includes('/contribution-output/') && path.includes('/artifacts/')) {
        interrupted = true; const reader = stream.getReader(), part = await reader.read();
        await f.fs.writeBytes(path, part.value!.slice(0, 24)); await reader.cancel(); throw Error('partial Contribution output');
      }
      return writeStream(path, stream);
    });
    await expect(sender.generateContribution(sent.current.source!.token, selection)).rejects.toThrow();
    const id = (await sender.jobs())[0]!.id, job = await ContributionOutputJob.open(f.fs, id, metadata), m = job.manifest();
    await expect(sender.generate(sent.current.source!.token)).rejects.toThrow('output-pending');
    const edited = await f.receiver.session.editCaption(sent.current.source!.token, f.captionId, 'body', '生成を始めた後の編集');
    const cold = f.reopen(), retry = new WorkspaceSender(f.fs, cold.session, f.store, metadata, f.locks);
    await retry.retry(id); const result = await ContributionArchive.inspect(await retry.download(id), job.base, f.store, metadata);
    expect(result.archive.control.manifest).toEqual(m); expect(result.target.token).toBe(sent.current.source!.token);
    expect((await cold.session.read()).source!.token).toBe(edited.source!.token);
    expect(await f.fs.list(job.path('artifacts/'))).toHaveLength(2);
    const paths = await f.fs.list(''), writes = vi.spyOn(f.fs, 'writeText'); await retry.retry(id);
    expect(await f.fs.list('')).toEqual(paths); expect(writes).not.toHaveBeenCalled();
  }, 15000);
  it.each(['metadata.am', 'base-metadata.am', 'artifact', 'index', 'whole-job'] as const)('does not replenish lost acknowledged Contribution output %s', async lost => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const selection = (await sender.availableBases())[0]!.selection, id = await sender.generateContribution(sent.current.source!.token, selection);
    const file = await sender.download(id), prefix = `v2/packages/contribution-output/${id}/`;
    const targets = lost === 'whole-job' ? await f.fs.list(prefix) : lost === 'artifact' ? await f.fs.list(`${prefix}artifacts/`) :
      [lost === 'index' ? `v2/packages/contribution-output-index/${id}.json` : `${prefix}${lost}`];
    for (const path of targets) await f.fs.remove(path);
    const before = await f.fs.list(''), writes = vi.spyOn(f.fs, 'writeText');
    expect((await sender.jobs()).find(j => j.id === id)!.state).toBe('repair-required');
    await expect(sender.retry(id)).rejects.toThrow(); await expect(sender.download(id)).rejects.toThrow();
    await expect(sender.verifyFile(id, file)).rejects.toThrow();
    await expect(sender.generate(sent.current.source!.token)).rejects.toThrow();
    await expect(sender.generateContribution(sent.current.source!.token, selection)).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled(); expect(await f.fs.list('')).toEqual(before);
  }, 15000);
  it('abandons indexed before-Start Contribution output explicitly and rejects a concurrent unfinished Workspace', async () => {
    const { f, sent } = await contributionTeam(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const selection = (await sender.availableBases())[0]!.selection;
    f.fs.reject = p => p.includes('/contribution-output/') && p.endsWith('/start.json');
    await expect(sender.generateContribution(sent.current.source!.token, selection)).rejects.toThrow('injected quota'); f.fs.reject = () => false;
    const job = (await sender.jobs())[0]!; expect(job).toMatchObject({ state: 'unstarted', cancellable: true });
    await expect(sender.retry(job.id)).rejects.toThrow('output-unstarted');
    await expect(sender.generate(sent.current.source!.token)).rejects.toThrow('output-pending');
    await sender.cancel(job.id); expect((await sender.jobs())[0]!.state).toBe('abandoned');
    f.fs.reject = p => p.includes('/output/') && p.includes('/artifacts/');
    await expect(sender.generate(sent.current.source!.token)).rejects.toThrow(); f.fs.reject = () => false;
    await expect(sender.generateContribution(sent.current.source!.token, selection)).rejects.toThrow('output-pending');
    const pending = (await sender.jobs()).find(j => j.state === 'incomplete')!; await sender.cancel(pending.id);
    const id = await sender.generateContribution(sent.current.source!.token, selection);
    expect((await sender.jobs()).find(j => j.id === id)!.state).toBe('generated');
  }, 15000);
  it('receives Contribution through the same file service for two rounds, retaining originals/conflicts and exact bases', async () => {
    const { f, r, sent } = await contributionTeam(), initial = await r.session.read();
    const rBases = await new WorkspaceBaseStore(r.fs, metadata, initial.source!.proof).snapshot();
    const local = await r.session.editCaption(initial.source!.token, f.captionId, 'body', '受け手の記録'), reads = r.fs.reads;
    const result = await r.receiver.receive(local.source!.token, sent.file); expect(result.state).toBe('ready');
    const originalSet = (s: ProjectMetadataSource) => s.originalChanges().map(b => [A.decodeChange(b).hash, [...b]]).sort();
    expect(originalSet(result.source!)).toEqual(originalSet(planRemoteChanges(local.source!, sent.current.source!, metadata).final));
    if (result.provider?.kind !== 'scene-provider') throw Error('provider');
    expect(result.provider.resources.captions[f.captionId]!.body.kind).toBe('unresolved');
    expect(r.fs.reads).toBe(reads); // Existing model/image bodies are not streamed for delta discovery/receive.
    const reply = await contributionFile(r.session, r.fs, r.store), back = await f.receiverService.receive(sent.current.source!.token, reply.file);
    expect(back.source!.token).toBe(result.source!.token);
    const tx = (await new TransactionJournal(f.fs, metadata).entries()).at(-1)!;
    expect(tx.prepared!.changes.length).toBeLessThan(reply.capture.changes.length); // receiver M differs from wire D.
    expect(await new WorkspaceBaseStore(f.fs, metadata, back.source!.proof).snapshot()).toEqual(sent.snapshot);
    expect(await new WorkspaceBaseStore(r.fs, metadata, result.source!.proof).snapshot()).toEqual(rBases);
    const cold = r.reopen(), writes = vi.spyOn(r.fs, 'writeText');
    expect((await cold.receiver.receive(result.source!.token, sent.file)).source!.token).toBe(result.source!.token);
    expect(writes).not.toHaveBeenCalled(); writes.mockRestore();
  }, 15000); // Several complete file rounds; not a product latency guarantee.
  it.each(['prepared', 'completion'] as const)('cold-recovers Contribution %s interruption without changing source/base or publishing twice', async point => {
    const { f, r, sent } = await contributionTeam(), before = await r.session.read();
    r.fs.reject = p => point === 'prepared' ? p.endsWith('/metadataDurable.json') : p.includes('/contribution-receive/') && p.includes('/steps/');
    await expect(r.receiver.receive(before.source!.token, sent.file)).rejects.toThrow('injected quota'); r.fs.reject = () => false;
    const [id] = await ContributionReceiveJob.ids(r.fs), job = await ContributionReceiveJob.open(r.fs, id!, r.store, metadata);
    const journal = new TransactionJournal(r.fs, metadata), entry = (await journal.entries()).find(e => e.start.transactionId === id)!;
    const input = await job.journalInput(entry.prepared!.remote!.expectedFinalHeads);
    for (const [name, bytes] of remoteEvidenceBytes(input)) expect(await r.fs.readBytes(journal.path(id!, name))).toEqual(bytes);
    expect(await r.fs.readBytes(journal.path(id!, 'source-metadata.am'))).toBeNull();
    if (point === 'prepared') {
      expect((await r.session.read()).source!.token).toBe(before.source!.token);
      await expect(r.reopen().session.retry()).rejects.toThrow('receive-job-recovery-required');
    } else {
      const read = await r.session.read(); await r.session.editCaption(read.source!.token, f.captionId, 'title', '受信後の編集');
    }
    const cold = r.reopen(), done = await cold.receiver.retry(id!); expect(done.state).toBe('ready');
    const writes = vi.spyOn(r.fs, 'writeText'); expect((await cold.receiver.retry(id!)).source!.token).toBe(done.source!.token);
    expect(writes).not.toHaveBeenCalled(); writes.mockRestore();
    expect((await journal.entries()).filter(e => e.start.transactionId === id)).toHaveLength(1);
    expect((await cold.receiver.jobs()).find(j => j.id === id)!.state).toBe('completed');
  });
  it('keeps M=0 job/index completion separate from metadata and blocks lost-job output', async () => {
    const { f, sent } = await contributionTeam(), journal = new TransactionJournal(f.fs, metadata), before = await journal.entries();
    f.fs.reject = p => p.includes('/contribution-receive/') && p.includes('/steps/');
    await expect(f.receiverService.receive(sent.current.source!.token, sent.file)).rejects.toThrow('injected quota'); f.fs.reject = () => false;
    const [id] = await ContributionReceiveJob.ids(f.fs); expect(await journal.entries()).toEqual(before);
    expect((await f.receiverService.jobs()).find(j => j.id === id)!.state).toBe('incomplete');
    const sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    await expect(sender.generate(sent.current.source!.token)).rejects.toThrow();
    const cold = new WorkspaceReceiver(f.fs, f.fs, f.reopen().session, metadata, f.locks);
    await cold.retry(id!); expect(await journal.entries()).toEqual(before);
    const later = await f.receiver.session.editCaption(sent.current.source!.token, f.captionId, 'title', '後の記録');
    expect((await cold.retry(id!)).source!.token).toBe(later.source!.token);
    for (const path of await f.fs.list(`v2/packages/contribution-receive/${id}/`)) await f.fs.remove(path);
    expect((await cold.jobs()).find(j => j.id === id)!.state).toBe('repair-required');
    await expect(sender.generate(later.source!.token)).rejects.toThrow();
    expect(await f.fs.exists(`v2/packages/contribution-index/${id}.json`)).toBe(true);
  });
  it.each(['input.zip', 'start.json'])('reselects the exact Contribution after %s interruption from frozen evidence', async stop => {
    const { r, sent } = await contributionTeam(), before = await r.session.read(), pathsBefore = await r.fs.list('');
    r.fs.reject = p => p.includes('/contribution-receive/') && p.endsWith(`/${stop}`);
    await expect(r.receiver.receive(before.source!.token, sent.file)).rejects.toThrow('injected quota'); r.fs.reject = () => false;
    const [id] = await ContributionReceiveJob.ids(r.fs), prefix = `v2/packages/contribution-receive/${id}/`;
    expect(await ContributionReceiveJob.inputState(r.fs, id!, metadata)).toBe('input-required');
    expect(await r.fs.exists(`v2/packages/contribution-index/${id}.json`)).toBe(stop === 'start.json');
    const evidencePaths = ['base-manifest.json', 'base-metadata.am', 'derived-target-metadata.am'].map(p => prefix + p);
    const originals = await Promise.all(evidencePaths.map(p => r.fs.readBytes(p)));
    const cold = r.reopen(), write = vi.spyOn(r.fs, 'writeBytes');
    await expect(cold.receiver.reselectInput(before.source!.token, id!, new Blob(['wrong file']))).rejects.toThrow();
    expect(write).not.toHaveBeenCalled(); write.mockRestore();
    // Frozen recovery must not re-select the live table; fresh admission still does.
    const select = vi.spyOn(VerifiedContributionBase, 'select').mockRejectedValue(Error('live base unavailable'));
    try { expect((await cold.receiver.reselectInput(before.source!.token, id!, sent.file)).state).toBe('ready'); }
    finally { select.mockRestore(); }
    expect(await Promise.all(evidencePaths.map(p => r.fs.readBytes(p)))).toEqual(originals);
    expect((await r.fs.list('')).length).toBeGreaterThan(pathsBefore.length);
    expect((await cold.receiver.jobs()).find(j => j.id === id)!.state).toBe('completed');
  });
  it('recovers an exact Contribution prefix without exposing it or reserializing its originals', async () => {
    const { r, sent } = await contributionTeam(), before = await r.session.read();
    const planned = planRemoteChanges(before.source!, sent.current.source!, metadata); expect(planned.parts.length).toBeGreaterThan(1);
    const prefix = before.source!.appendOriginal(planned.parts.slice(0, 1)), persist = MetadataRepository.prototype.persist;
    let partial = false;
    const fault = vi.spyOn(MetadataRepository.prototype, 'persist').mockImplementation(async function (this: MetadataRepository, id, expected) {
      if (!partial && expected.token === planned.final.token) { partial = true; await persist.call(this, id, prefix); throw Error('prefix interrupted'); }
      return persist.call(this, id, expected);
    });
    try { await expect(r.receiver.receive(before.source!.token, sent.file)).rejects.toThrow('prefix interrupted'); }
    finally { fault.mockRestore(); }
    expect(partial).toBe(true); const [id] = await ContributionReceiveJob.ids(r.fs), journal = new TransactionJournal(r.fs, metadata);
    const entry = (await journal.entries()).find(e => e.start.transactionId === id)!;
    const raw = await new MetadataRepository(r.fs, r.factory, metadata).read(entry.start.repositoryId, before.source!.proof);
    expect(raw!.token).toBe(prefix.token); expect(entry.publication).toBeNull();
    const cold = r.reopen(); expect((await cold.session.read()).source!.token).toBe(before.source!.token);
    const recovered = await cold.receiver.retry(id!);
    expect(recovered.source!.originalChanges()).toEqual(planned.final.originalChanges());
    expect((await journal.entries()).filter(e => e.start.transactionId === id && e.publication)).toHaveLength(1);
  });
  it.each(['wire', 'base', 'derived', 'index', 'job'] as const)('refuses lost acknowledged Contribution %s and never replenishes from reselected input', async part => {
    const { r, sent } = await contributionTeam(), before = await r.session.read();
    await r.receiver.receive(before.source!.token, sent.file);
    const [id] = await ContributionReceiveJob.ids(r.fs), journal = new TransactionJournal(r.fs, metadata);
    const sourcePaths = await r.fs.list(journal.path(id!, ''));
    const path = part === 'wire' ? sourcePaths.find(p => p.includes('/wire-changes/'))! : part === 'base' ? sourcePaths.find(p => p.includes('/base-evidence/'))! :
      part === 'derived' ? journal.path(id!, 'derived-target-metadata.am') : part === 'index' ? `v2/packages/contribution-index/${id}.json` :
      `v2/packages/contribution-receive/${id}/start.json`;
    await r.fs.remove(path); const writes = vi.spyOn(r.fs, 'writeBytes'), controls = vi.spyOn(r.fs, 'writeText');
    const cold = r.reopen(); await expect(cold.receiver.retry(id!)).rejects.toThrow();
    await expect(cold.receiver.reselectInput(before.source!.token, id!, sent.file)).rejects.toThrow();
    expect(await r.fs.exists(path)).toBe(false); expect(writes).not.toHaveBeenCalled(); expect(controls).not.toHaveBeenCalled();
    writes.mockRestore(); controls.mockRestore();
  });
  it('explains a missing Contribution base without mutating the existing Project', async () => {
    const { f, sent } = await contributionTeam(), separate = firstWorkspaceRecipient();
    // A local Project with no retained Workspace observation cannot use the delta.
    await prepareValidationCreation(f.prepared).persist(separate.fs, separate.store, separate.session);
    const read = await separate.session.read(), before = await separate.fs.list('');
    await expect(separate.receiver.receive(read.source!.token, sent.file)).rejects.toThrow('元になった作業一式');
    expect(await separate.fs.list('')).toEqual(before); expect((await separate.session.read()).source!.token).toBe(read.source!.token);
  });
  it.each(['body', 'facts'])('receives a new Contribution PNG, cold-recovers, and refuses acknowledged %s loss', async missing => {
    const { f, r } = await contributionTeam(), sender = f.receiver, current = await sender.session.read();
    if (current.provider?.kind !== 'scene-provider') throw Error('provider');
    const sceneId = Object.keys(current.provider.state.scenes)[0]!;
    const included = await sender.session.edit(current.source!.token, { kind: 'include', sceneId, resourceKind: 'caption', resourceId: f.captionId,
      membershipId: `scm_${newId()}`, orderKey: 'C', eventId: `evt_${newId()}` });
    const bytes = Uint8Array.from(atob(fixtureMedia[1]!.base64), c => c.charCodeAt(0));
    const media = await underWriteLease(f.fs, () => sender.content.prepareImage({ label: '追加画像', bytes }));
    const attachmentId = `att_${newId()}`;
    await sender.session.edit(included.source!.token, { kind: 'createAttachment', sceneId, captionId: f.captionId, attachmentId, media,
      orderKey: 'C', altText: '', eventId: `evt_${newId()}` });
    const sent = await contributionFile(sender.session, f.fs, f.store); expect(sent.capture.blobs).toHaveLength(1);
    expect(sent.capture.blobs[0]!.sha256).toBe(await digest(bytes));
    const before = new Set(await r.fs.list('')), read = await r.session.read();
    r.fs.reject = p => p.endsWith('/metadataDurable.json');
    await expect(r.receiver.receive(read.source!.token, sent.file)).rejects.toThrow('injected quota'); r.fs.reject = () => false;
    const [id] = await ContributionReceiveJob.ids(r.fs), cold = r.reopen(), recovered = await cold.receiver.retry(id!);
    expect(recovered.state).toBe('ready');
    if (recovered.provider?.kind !== 'scene-provider') throw Error('provider');
    expect(recovered.provider.details.attachments[attachmentId]?.kind).toBe('value');
    const path = (await r.fs.list('')).find(p => !before.has(p) && (missing === 'body' ? p.startsWith('v2/cas/objects/') : p.startsWith('v2/metadata/evidence/')))!;
    expect(path).toBeDefined(); await r.fs.remove(path);
    const writes = vi.spyOn(r.fs, 'writeBytes'), controls = vi.spyOn(r.fs, 'writeText');
    await expect(r.reopen().receiver.retry(id!)).rejects.toThrow();
    expect(await r.fs.exists(path)).toBe(false); expect(writes).not.toHaveBeenCalled(); expect(controls).not.toHaveBeenCalled();
    writes.mockRestore(); controls.mockRestore();
  }, 15000);
  it('captures a Contribution from a real imported-base record without reading unchanged GLB/PNG or advancing that base', async () => {
    const f = await workspaceFileFixture(), imported = await f.receiverService.receive(f.local.source!.token, f.file);
    const bases = new WorkspaceBaseStore(f.fs, metadata, imported.source!.proof), before = await bases.snapshot(), row = before.records[0]!;
    expect(imported.source!.heads).not.toEqual(f.source.heads);
    const preflight = vi.spyOn(WorkspaceBaseStore.prototype, 'preflightRecord');
    try {
      const job = (await f.receiverService.jobs())[0]!;
      await f.receiverService.retry(job.id);
      expect(preflight).toHaveBeenCalled();
      for (const [record] of preflight.mock.calls) expect(record.completions).toEqual([
        { observation: 'imported', publishedReceiverHeads: imported.source!.heads }]);
      expect(await bases.snapshot()).toEqual(before); // No phantom observation/receipt reserved on replay.
    } finally { preflight.mockRestore(); }
    const edited = await f.receiver.session.editCaption(imported.source!.token, f.captionId, 'title', '差分で返す記録');
    const originals = (s: ProjectMetadataSource) => s.originalChanges().sort((a, b) => A.decodeChange(a).hash.localeCompare(A.decodeChange(b).hash));
    const read = vi.spyOn(f.store, 'openReadOnly'), sourceBefore = originals(edited.source!);
    const base = await VerifiedContributionBase.select(bases, { workspacePackageId: row.workspacePackageId,
      workspaceManifestSha256: row.workspaceManifestSha256, heads: row.declaredHeads }, f.store, metadata);
    const capture = await ContributionSourceCapture.prepare(f.receiver.session, edited.source!.token, base, f.store, metadata);
    expect(capture.changes.length).toBeGreaterThan(0); expect(capture.blobs).toHaveLength(0);
    const chunks: BlobPart[] = [];
    await writeContributionArchive(capture, f.store, new WritableStream({ write(bytes) { chunks.push(bytes.slice() as BlobPart); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    const inspected = await ContributionArchive.inspect(new Blob(chunks), base, f.store, metadata);
    expect(inspected.target.heads).toEqual(edited.source!.heads);
    expect(originals(inspected.target)).toEqual(sourceBefore); expect(read).not.toHaveBeenCalled();
    expect(await bases.snapshot()).toEqual(before);
    expect(originals((await f.reopen().session.read()).source!)).toEqual(sourceBefore);
    read.mockRestore();
  });
  it('imports the complete Workspace originals, edits and returns files through two team rounds without a new lineage', async () => {
    const f = await workspaceFileFixture(), r = firstWorkspaceRecipient();
    expect(f.source.originalChanges().length).toBeGreaterThan(2);
    const imported = await r.receiver.importWorkspace(f.file);
    expect(imported.state).toBe('ready'); expect(imported.source!.proof).toEqual(f.source.proof);
    expect(imported.source!.originalChanges()).toEqual(f.source.originalChanges());
    const initial = (await new TransactionJournal(r.fs, metadata).entries())[0]!;
    expect(initial.start).toMatchObject({ purpose: 'importWorkspace', predecessor: null, baseHeads: [], repositoryId: initial.start.transactionId });
    expect(initial.publication!.heads).toEqual(f.source.heads);
    expect((await r.receiver.jobs())[0]!.state).toBe('completed');
    const edited = await r.session.editCaption(imported.source!.token, f.captionId, 'title', '参加者の確認');
    const replay = await r.receiver.receive(edited.source!.token, f.file);
    expect(replay.source!.originalChanges()).toEqual(edited.source!.originalChanges());
    const sender = new WorkspaceSender(r.fs, r.session, r.store, metadata, r.locks);
    const output = await sender.download(await sender.generate(replay.source!.token));
    const received = await f.receiverService.receive(f.local.source!.token, output);
    const fields = received.provider!.kind === 'scene-provider' ? received.provider!.details.mutable.captionsById[f.captionId]! : null;
    expect(fields?.title).toEqual({ kind: 'value', value: '参加者の確認' });
    expect(fields?.body).toEqual({ kind: 'value', value: '手元の追記' });
    const secondSender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const returnFile = await secondSender.download(await secondSender.generate(received.source!.token));
    const cold = r.reopen(), returned = await cold.receiver.receive(replay.source!.token, returnFile);
    const again = await cold.receiver.receive(returned.source!.token, returnFile);
    expect(again.source!.originalChanges()).toEqual(returned.source!.originalChanges());
    expect((await new TransactionJournal(r.fs, metadata).entries()).filter(e => e.start.purpose === 'importWorkspace')).toHaveLength(1);
    expect((await r.reopen().session.read()).source!.originalChanges()).toEqual(again.source!.originalChanges());
  });
  it('imports branching original histories with semantic candidates, never the materialized winner', async () => {
    const f = await workspaceFileFixture(source => {
      const captionId = Object.keys(A.load<Record<string, any>>(source.encodeFullSource()).captionsById)[0]!;
      const branches = ['候補一', '候補二'].map(title => A.change(A.load<Record<string, any>>(source.encodeFullSource()), d => {
        d.captionsById[captionId].title = new A.ImmutableString(json(title));
      }));
      return ProjectMetadataSource.fromFullSource(A.save(A.merge(branches[0]!, branches[1]!)), source.proof, metadata);
    });
    const r = firstWorkspaceRecipient(), read = await r.receiver.importWorkspace(f.file);
    expect(read.source!.heads).toHaveLength(2); expect(read.source!.originalChanges()).toEqual(f.source.originalChanges());
    expect(read.state).toBe('ready');
    const inspect = await read.source!.inspectOriginal({ maxNodes: metadata.maxNodes, maxWork: metadata.maxWork });
    expect(inspect.candidates.fields.find(field => field.path.join('/') === `captionsById/${f.captionId}/title`)!.candidates).toHaveLength(2);
  });
  it.each(['blobsVerified.json', 'metadataDurable.json', 'published.json', '/bases/'])('cold-recovers a first import interrupted at %s without reinitializing', async marker => {
    const f = await workspaceFileFixture(), r = firstWorkspaceRecipient();
    r.fs.reject = path => path.includes(marker);
    await expect(r.receiver.importWorkspace(f.file)).rejects.toThrow('injected quota');
    const id = (await WorkspaceReceiveJob.ids(r.fs))[0]!;
    r.fs.reject = () => false;
    const cold = r.reopen();
    expect((await cold.receiver.jobs())[0]!.state).toBe('incomplete');
    if (marker !== '/bases/') await expect(cold.session.retry()).rejects.toThrow('receive-job-recovery-required');
    const recovered = await cold.receiver.retry(id);
    expect(recovered.source!.originalChanges()).toEqual(f.source.originalChanges());
    expect((await cold.receiver.jobs())[0]!.state).toBe('completed');
    expect((await cold.receiver.retry(id)).source!.originalChanges()).toEqual(recovered.source!.originalChanges());
    expect(await new TransactionJournal(r.fs, metadata).entries()).toHaveLength(1);
  });
  it('requires the original import job after directory loss and never refills acknowledged evidence', async () => {
    const f = await workspaceFileFixture(), r = firstWorkspaceRecipient();
    r.fs.reject = path => path.endsWith('/published.json');
    await expect(r.receiver.importWorkspace(f.file)).rejects.toThrow(); r.fs.reject = () => false;
    const id = (await WorkspaceReceiveJob.ids(r.fs))[0]!;
    for (const path of await r.fs.list(`v2/packages/receive/${id}/`)) await r.fs.remove(path);
    const cold = r.reopen();
    expect(await cold.receiver.jobs()).toEqual([{ id, state: 'repair-required' }]);
    await expect(cold.session.retry()).rejects.toThrow('receive-job-recovery-required');
    await expect(cold.receiver.importWorkspace(f.file)).rejects.toThrow('receive-job-missing');
    expect((await cold.session.read()).source).toBeNull();
  });
  it('rejects surviving metadata after filesystem receipts are lost, and lost import jobs cannot enable output', async () => {
    const f = await workspaceFileFixture(), r = firstWorkspaceRecipient();
    r.fs.reject = path => path.includes('/bases/');
    await expect(r.receiver.importWorkspace(f.file)).rejects.toThrow(); r.fs.reject = () => false;
    const read = await r.session.read(), id = (await WorkspaceReceiveJob.ids(r.fs))[0]!;
    expect(read.state).toBe('ready');
    for (const path of await r.fs.list(`v2/packages/receive/${id}/`)) await r.fs.remove(path);
    const cold = r.reopen(), sender = new WorkspaceSender(r.fs, cold.session, r.store, metadata, r.locks);
    await expect(sender.generate(read.source!.token)).rejects.toThrow('receive-job-missing');
    expect(await r.fs.list('v2/packages/output/')).toEqual([]);
    for (const path of await r.fs.list('v2/metadata/')) await r.fs.remove(path);
    const before = await r.fs.list(''), originals = await r.factory().loadRange([]);
    await expect(r.reopen().receiver.importWorkspace(f.file)).rejects.toThrow('import-existing-repository');
    expect(await r.fs.list('')).toEqual(before); expect(await r.factory().loadRange([])).toEqual(originals);
  });
  it('revalidates the original imported strong facts even after later edits make that model inactive', async () => {
    const f = await workspaceFileFixture(), r = firstWorkspaceRecipient();
    let read = await r.receiver.importWorkspace(f.file);
    if (read.provider?.kind !== 'scene-provider') throw Error('provider');
    const assetId = f.model.asset.id as string;
    for (const [membershipId, fields] of Object.entries(read.provider.details.mutable.sceneAssetMembershipsById)) {
      if (fields.assetId?.kind === 'value' && fields.assetId.value === assetId)
        read = await r.session.edit(read.source!.token, { kind: 'exclude', resourceKind: 'asset', membershipId, eventId: `evt_${newId()}` });
    }
    read = await r.session.edit(read.source!.token, { kind: 'deleteAsset', assetId, eventId: `evt_${newId()}` });
    for (const path of await r.fs.list('v2/metadata/evidence/')) {
      const evidence = JSON.parse((await r.fs.readText(path))!);
      if (evidence.key.records.some((record: JsonObject) => record.id === f.model.representation.id)) await r.fs.remove(path);
    }
    const cold = r.reopen(); expect((await cold.session.read()).state).toBe('ready');
    await expect(cold.receiver.receive(read.source!.token, f.file)).rejects.toThrow('provider-not-ready');
    expect((await cold.session.read()).source!.originalChanges()).toEqual(read.source!.originalChanges());
  });
  it('generates actual Workspace files and receives again through the same base table without changing original local work', async () => {
    const f = await workspaceFileFixture(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const id = await sender.generate(f.local.source!.token), first = await sender.download(id);
    expect((await sender.jobs())[0]!.state).toBe('generated');
    expect((await f.receiver.session.read()).publication).toBe(f.local.publication);
    const decoded = await WorkspaceArchive.inspect(first, metadata);
    expect(decoded.source.originalChanges()).toEqual(f.local.source!.originalChanges());
    const write = vi.spyOn(f.fs, 'writeText'); write.mockClear();
    await expect(sender.verifyFile(id, f.file)).rejects.toThrow('output-selected-mismatch');
    expect(write).not.toHaveBeenCalled();
    await sender.verifyFile(id, first); expect((await sender.jobs())[0]!.state).toBe('file-verified');
    await f.receiverService.receive(f.local.source!.token, first);
    const bases = new WorkspaceBaseStore(f.fs, metadata, f.local.source!.proof), folded = await bases.snapshot();
    expect(folded.records[0]!.completions.map(c => c.observation).sort()).toEqual(['generated', 'imported']);
    const received = await f.receiverService.receive((await f.receiver.session.read()).source!.token, f.file);
    const secondId = await sender.generate(received.source!.token), second = await WorkspaceArchive.inspect(await sender.download(secondId), metadata);
    expect(second.source.originalChanges()).toEqual(received.source!.originalChanges());
    expect((await bases.snapshot()).records).toHaveLength(3);
    const reads = vi.fn(), readStream = f.fs.readStream.bind(f.fs);
    vi.spyOn(f.fs, 'readStream').mockImplementation(async path => {
      const file = await readStream(path); return file?.blob && path.endsWith('.zip') ? { ...file, blob: async () => { reads(); return file.blob!(); } } : file;
    });
    await sender.jobs(); expect(reads).not.toHaveBeenCalled();
  }, 60000);
  it('retries output with original frozen bytes after later edits and after the generated-base handoff was interrupted', async () => {
    const f = await workspaceFileFixture(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const writeStream = f.fs.writeStream.bind(f.fs); let interrupted = false;
    vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (!interrupted && path.includes('/artifacts/')) {
        interrupted = true; const reader = stream.getReader(), part = await reader.read();
        await f.fs.writeBytes(path, part.value!.slice(0, 24)); await reader.cancel(); throw Error('interrupted output');
      }
      return writeStream(path, stream);
    });
    await expect(sender.generate(f.local.source!.token)).rejects.toThrow();
    const id = (await sender.jobs())[0]!.id, before = await WorkspaceOutputJob.open(f.fs, id, metadata), packageId = before.manifest().packageId;
    expect((await sender.jobs())[0]).toMatchObject({ state: 'incomplete', cancellable: true });
    const edited = await f.receiver.session.editCaption(f.local.source!.token, f.captionId, 'body', '後から書いた記録');
    const writeText = f.fs.writeText.bind(f.fs); let failedBase = false;
    vi.spyOn(f.fs, 'writeText').mockImplementation(async (path, text) => {
      if (!failedBase && path.includes('/output/') && text.includes('"kind":"baseRecorded"')) { failedBase = true; throw Error('base step interruption'); }
      return writeText(path, text);
    });
    await expect(sender.retry(id)).rejects.toThrow('base step interruption');
    expect((await sender.jobs())[0]).toMatchObject({ state: 'incomplete', cancellable: false });
    const cold = f.reopen(), coldSender = new WorkspaceSender(f.fs, cold.session, f.store, metadata, f.locks);
    await coldSender.retry(id); const file = await coldSender.download(id), inspected = await WorkspaceArchive.inspect(file, metadata);
    expect(inspected.archive.control.manifest.packageId).toBe(packageId);
    expect(inspected.source.originalChanges()).toEqual(f.local.source!.originalChanges());
    expect((await cold.session.read()).source!.token).toBe(edited.source!.token);
    expect((await f.fs.list(`v2/packages/output/${id}/artifacts/`))).toHaveLength(2);
    const paths = await f.fs.list(''); await coldSender.retry(id); expect(await f.fs.list('')).toEqual(paths);
  }, 60000);
  it.each(['base', 'artifact'] as const)('refuses a lost acknowledged %s without replenishing it on output or confirmation', async kind => {
    const f = await workspaceFileFixture(), sender = new WorkspaceSender(f.fs, f.receiver.session, f.store, metadata, f.locks);
    const id = await sender.generate(f.local.source!.token), file = await sender.download(id), base = (await f.fs.list('v2/packages/bases/'))[0]!;
    const target = kind === 'base' ? base : (await f.fs.list(`v2/packages/output/${id}/artifacts/`))[0]!;
    await f.fs.remove(target); const paths = await f.fs.list(''), write = vi.spyOn(f.fs, 'writeText'); write.mockClear();
    await expect(sender.generate(f.local.source!.token)).rejects.toThrow();
    await expect(sender.verifyFile(id, file)).rejects.toThrow();
    await expect(sender.retry(id)).rejects.toThrow();
    expect(await f.fs.list('')).toEqual(paths); expect(write).not.toHaveBeenCalled();
    expect((await sender.jobs())[0]!.state).toBe('repair-required');
  }, 60000);
  it('reselects only the exact bound Workspace after an interrupted copy, without touching acknowledged data', async () => {
    const f = await workspaceFileFixture(), originalWrite = f.fs.writeStream.bind(f.fs);
    let interrupt = true;
    vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (interrupt && path.endsWith('/input.zip')) {
        const reader = stream.getReader(), chunk = await reader.read(); await reader.cancel();
        await f.fs.writeBytes(path, chunk.value!.slice(0, 32)); throw Error('interrupted copy');
      }
      return originalWrite(path, stream);
    });
    await expect(f.receiverService.receive(f.local.source!.token, f.file)).rejects.toThrow('interrupted copy');
    const job = (await f.receiverService.jobs())[0]!; expect(job.state).toBe('input-required');
    const path = `v2/packages/receive/${job.id}/input.zip`, prefix = await f.fs.readBytes(path), before = await f.fs.list('');
    const altered: Uint8Array[] = [];
    await writeWorkspaceArchive(f.capture, f.senderStore, new WritableStream({ write: b => { altered.push(b.slice()); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    await expect(f.receiverService.reselectInput(f.local.source!.token, job.id, new Blob(altered.map(b => b.slice().buffer))))
      .rejects.toThrow('receive-reselected-file');
    expect(await f.fs.list('')).toEqual(before); expect(await f.fs.readBytes(path)).toEqual(prefix);
    expect((await f.receiver.session.read()).source!.token).toBe(f.local.source!.token);
    interrupt = false;
    const cold = f.reopen(), service = new WorkspaceReceiver(f.fs, f.fs, cold.session, metadata, f.locks);
    expect((await service.reselectInput(f.local.source!.token, job.id, f.file)).state).toBe('ready');
    expect(await service.jobs()).toEqual([{ id: job.id, state: 'completed' }]);
    await expect(service.reselectInput((await cold.session.read()).source!.token, job.id, f.file)).rejects.toThrow('receive-reselect-denied');
    await expect(service.abandonInput(job.id)).rejects.toThrow('receive-abandon-denied');
  });
  it('explicitly abandons old unbound fragments, retains their bytes and never resurrects the job', async () => {
    const f = await workspaceFileFixture(), id = newId(), path = `v2/packages/receive/${id}/input.zip`;
    await f.fs.writeBytes(path, new Uint8Array([1, 2, 3]));
    expect(await f.receiverService.jobs()).toEqual([{ id, state: 'unbound-input' }]);
    await expect(f.receiverService.receive(f.local.source!.token, f.file)).rejects.toThrow('中断した受信');
    await f.receiverService.abandonInput(id);
    const cold = new WorkspaceReceiver(f.fs, f.fs, f.reopen().session, metadata, f.locks);
    await cold.abandonInput(id); expect(await cold.jobs()).toEqual([{ id, state: 'abandoned' }]);
    expect(await f.fs.readBytes(path)).toEqual(new Uint8Array([1, 2, 3]));
    await expect(cold.reselectInput(f.local.source!.token, id, f.file)).rejects.toThrow('receive-reselect-denied');
    expect((await cold.receive(f.local.source!.token, f.file)).state).toBe('ready');
    expect((await cold.jobs()).map(j => j.state).sort()).toEqual(['abandoned', 'completed']);
  });
  it('never treats a torn start, lost start with journal, or failed absence read as unacknowledged input', async () => {
    const f = await workspaceFileFixture(), id = newId(), prefix = `v2/packages/receive/${id}/`;
    await f.fs.writeText(`${prefix}start.json`, '{');
    await expect(f.receiverService.abandonInput(id)).rejects.toThrow('receive-abandon-denied');
    expect((await f.receiverService.jobs())[0]!.state).toBe('repair-required');
    await f.fs.remove(`${prefix}start.json`); // Test fixture only: create a separate simulated interrupted copy.
    await f.fs.writeBytes(`${prefix}input.zip`, new Uint8Array([1]));
    const read = f.fs.readStream.bind(f.fs), spy = vi.spyOn(f.fs, 'readStream').mockImplementation(async path => {
      if (path === `${prefix}start.json`) throw Error('unavailable start'); return read(path);
    });
    await expect(f.receiverService.abandonInput(id)).rejects.toThrow('unavailable start');
    expect(await f.fs.readText(`${prefix}abandoned.json`)).toBeNull(); spy.mockRestore();
    await f.receiverService.abandonInput(id);
    await f.receiverService.receive(f.local.source!.token, f.file);
    const done = (await f.receiverService.jobs()).find(j => j.state === 'completed')!;
    await f.fs.remove(`v2/packages/receive/${done.id}/start.json`);
    await expect(f.receiverService.abandonInput(done.id)).rejects.toThrow('receive-input-state');
    expect((await f.receiverService.jobs()).find(j => j.id === done.id)!.state).toBe('repair-required');
  });
  async function receivedHostFixture(transform?: (source: ProjectMetadataSource) => ProjectMetadataSource) {
    const f = await workspaceFileFixture(transform), run = (f.initial.source!.proof.identity.projectId as string).slice(4);
    // Same actual Project history, moved into the host's existing isolated namespace by this fixture only.
    for (const path of await f.fs.list('v2/')) if (!path.startsWith('v2/cas/'))
      await f.fs.writeBytes(`${validationArea}/${run}/${path}`, (await f.fs.readBytes(path))!);
    const options = { run, base: f.fs, coordinator: ProjectMutationCoordinator.browser(f.locks), store: f.store,
      fileLimits: budget, decode, packageLocks: f.locks, openStorage: async () => ({ factory: f.factory, dispose: async () => {} }) };
    return { ...f, options, host: await openValidationHost(options) };
  }
  async function initialWorkspaceHostFixture(transform?: (source: ProjectMetadataSource) => ProjectMetadataSource) {
    const f = await workspaceFileFixture(transform), r = firstWorkspaceRecipient(), run = (f.source.proof.identity.projectId as string).slice(4);
    const options = { run, base: r.fs, coordinator: ProjectMutationCoordinator.browser(r.locks), store: r.store,
      fileLimits: budget, decode, packageLocks: r.locks, openStorage: async () => ({ factory: r.factory, dispose: async () => {} }) };
    return { ...r, f, run, options };
  }
  async function productWorkspaceFixture(includeInitial = false, duplicateModels = false, withTag = false, profile: 'map1' | 'map2' = 'map1',
    initial?: NonNullable<Parameters<typeof openValidationHost>[0]['initial']>) {
    const r = firstWorkspaceRecipient(), run = initial ? (initial.source.proof.identity.projectId as string).slice(4) : newId(), captionId = `cap_${newId()}`;
    const options = { run, base: r.fs, coordinator: ProjectMutationCoordinator.browser(r.locks), store: r.store,
      fileLimits: budget, decode, packageLocks: r.locks, openStorage: async () => ({ factory: r.factory, dispose: async () => {} }) };
    // Use an admitted conversion or one fresh GLB, without unrelated receive/replacement histories.
    const prepared = initial ? undefined : structuredClone(await prepareValidationProject({ run, title: '統合画面の検証', models: [{ label: 'モデル', bytes: glb() }],
      media: includeInitial ? [{ label: '受信画像', bytes: png }] : [] }, budget, decode));
    if (includeInitial && prepared) {
      const project = prepared.records.project as JsonObject, sceneId = project.defaultSceneId!;
      const active = () => ({ state: 'active', eventId: `evt_${newId()}`, reason: 'initial' });
      (prepared.records.captionsById as Record<string, JsonObject>)[captionId] = { id: captionId, title: '最初の記録', body: '', colorSrgb: [1, 0, 0],
        lifecycle: active(), anchor: { kind: 'project', projectFrameId: (project.frame as JsonObject).id!, positionProject: [0, 0, 0] } };
      const membershipId = `scm_${newId()}`, attachmentId = `att_${newId()}`;
      (prepared.records.sceneCaptionMembershipsById as Record<string, JsonObject>)[membershipId] = { id: membershipId, sceneId, captionId, orderKey: 'A', lifecycle: active() };
      (prepared.records.captionAttachmentsById as Record<string, JsonObject>)[attachmentId] = { id: attachmentId, captionId,
        mediaResourceId: Object.keys(prepared.records.mediaResourcesById!)[0]!, orderKey: 'A', altText: '', lifecycle: active() };
      if (withTag) { const tagId = `tag_${newId()}`, edgeId = `tgm_${newId()}`;
        (prepared.records.captionTagsById as Record<string, JsonObject>)[tagId] = { id: tagId, label: '調査対象', colorSrgb: [1, 0, 0], orderKey: 'A', lifecycle: active() };
        (prepared.records.captionTagMembershipsById as Record<string, JsonObject>)[edgeId] = { id: edgeId, captionId, tagId, lifecycle: active() };
      }
    }
    if (duplicateModels && prepared) { const edges = prepared.records.sceneAssetMembershipsById as Record<string, JsonObject>, first = Object.values(edges)[0]!, id = `sam_${newId()}`;
      edges[id] = { ...first, id, orderKey: 'B' }; }
    const host = await openValidationHost({ ...options, initial: initial ?? prepareValidationCreation(prepared!, profile) });
    const file = includeInitial ? await host.workspaceOutput.download(await host.workspaceOutput.generate(host.read().source!.token)) : undefined;
    const f = { ...r, run, options, f: { captionId, file } };
    const legacy = vi.spyOn(host.authority, 'write').mockImplementation(() => { throw Error('product UI must dispatch typed commands'); });
    const dispatch = vi.spyOn(host, 'dispatch'), document = new RecordedDocument().asDocument(), create = document.createElement.bind(document), downloads = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = create(tag); if (tag === 'a') Object.assign(node, { click: downloads }); return node;
    });
    let cameraEpoch = 1, display: Parameters<ReturnType<ViewportFactory>['update']>[0] | undefined, issue: string | null = null;
    let projected: typeof display, holdFrame = false, viewportDragging = false, notifyViewport = () => {}, pinPoint = { x: 30, y: 40 };
    let extent = { left: 10, top: 20, width: 600, height: 400 };
    const retryViewport = vi.fn(() => { issue = null; }), reservePointer = vi.fn();
    let payload: DisplayCapture = { camera: { position: [1, 0, 5], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: Math.PI / 4 } },
      background: { kind: 'solid', colorSrgb: [0.123456, 0.654321, 0.333333] } };
    const camera = vi.fn((intent: Parameters<ReturnType<ViewportFactory>['camera']>[0]) => { cameraEpoch++;
      payload = { ...payload, camera: { ...payload.camera, position: [cameraEpoch, 0, 5], ...(intent.kind === 'projection' ? { projection: intent.projection === 'perspective' ?
        { kind: 'perspective' as const, verticalFovRadians: Math.PI / 4 } : { kind: 'orthographic' as const, verticalSpan: 5 } } : {}) } }; });
    const recall = vi.fn((next: DisplayCapture) => { payload = structuredClone(next); cameraEpoch++; });
    const background = vi.fn((next: DisplayCapture['background'], verify?: () => void) => { const before = payload;
      payload = { ...payload, background: next }; cameraEpoch++; try { verify?.(); } catch (error) { payload = before; cameraEpoch++; throw error; } });
    let proposeModel: Parameters<ViewportFactory>[3], proposePin: Parameters<ViewportFactory>[2];
    const pick = vi.fn((targets: Parameters<NonNullable<ReturnType<ViewportFactory>['pickCreation']>>[0], _x: number, _y: number) =>
      targets[0] ? { target: targets[0], position: [0.25, 0.5, 0] as const } : null);
    const factory: ViewportFactory = (canvas, changed, pin, model) => { proposeModel = model; proposePin = pin; notifyViewport = changed;
      Object.assign(canvas, { getBoundingClientRect: () => ({ ...extent }) });
      return { update: next => { display = next; if (!holdFrame) projected = next; }, setActive() {}, setPinPointerActive: reservePointer, camera, retry: retryViewport, dispose: vi.fn(), pickCreation: pick,
        capture: () => structuredClone(payload), recall, setBackground: background,
        read: () => ({ ready: !!projected, token: String(cameraEpoch), pickToken: String(cameraEpoch), display: projected, pins: projected?.pins.map(p => ({ id: p.id, ...pinPoint, visible: true })) ?? [],
          issue, notice: '検証用の表示通知', dragging: viewportDragging, projection: payload.camera.projection.kind, axis: null }) };
    };
    let opened = false, liveHost = host; const imageReads = [vi.spyOn(host.content, 'image')];
    const ui = createValidationWorkspace(document, { productEditor: true, fileLimits: budget, decode, list: async () => [], selected() {},
      open: async (_run, _initial, mode) => { if (!opened) { opened = true; return host; } liveHost = await openValidationHost({ ...options, mode }); imageReads.push(vi.spyOn(liveHost.content, 'image')); return liveHost; },
      render: async () => ({ factory, dispose() {} }) }, f.run);
    const root = record(ui.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const named = (label: string, parent = root) => all(parent).find(n => n.attributes.get('aria-label') === label)!;
    const button = (text: string, parent = root) => all(parent).find(n => n.tag === 'button' && n.textContent === text)!;
    await vi.waitFor(() => expect(all(root).some(n => n.className === 'lv-project-workspace')).toBe(true));
    const editor = all(root).find(n => n.className === 'lv-project-workspace')!, status = all(editor).find(n => n.className === 'lv-operation-status')!;
    const edited = async (action: () => void) => {
      const before = host.read().source!.token; action();
      await vi.waitFor(() => expect(host.read().source!.token).not.toBe(before), { timeout: 10000 });
      await vi.waitFor(() => expect(status.dataset.busy).toBe('false'), { timeout: 10000 });
    };
    return { f, host, ui, editor, root, all, named, button, edited, status, downloads, legacy, dispatch, pick,
      moveCamera: () => camera({ kind: 'fit' }), display: () => display, setIssue: (text: string) => { issue = text; }, retryViewport, camera, recall, background,
      payload: () => structuredClone(payload), liveHost: () => liveHost, imageReads, reservePointer, refresh: () => notifyViewport(), viewportFactory: factory,
      holdFrame(value: boolean) { holdFrame = value; if (!value) { projected = display; notifyViewport(); } },
      pinPoint(value: typeof pinPoint) { pinPoint = value; notifyViewport(); },
      extent(value: typeof extent) { extent = value; notifyViewport(); },
      dragging(value: boolean) { viewportDragging = value; notifyViewport(); },
      proposePin: (...args: Parameters<NonNullable<Parameters<ViewportFactory>[2]>>) => proposePin?.(...args),
      proposeModel: (...args: Parameters<NonNullable<Parameters<ViewportFactory>[3]>>) => proposeModel?.(...args) };
  }
  it('Native appearance conversion connects product editing, occurrence clones, named backup, independent Workspace/review and exact cold reopen', async () => {
    const input = await nativeAppearanceFile(), inputBytes = await input.arrayBuffer();
    const initial = await (await prepareNativeConversion(input, budget, decode))!.create();
    const h = await productWorkspaceFixture(false, false, false, 'map2', initial), { host, editor, button, named, edited } = h;
    const sceneId = h.display()!.sceneId, visible = h.display()!.models[0]!; if (visible.shape !== 'saved-glb') throw Error('saved model');
    const model = host.authority.read().modelVersions!.find(v => v.assetId === visible.binding.assetId)!, c = model.closure;
    if (c.shape !== 'saved-glb') throw Error('saved model');
    const slots = validationMaterialSlots(c), slot = slots.find(s => s.locator.slotIndex === 0)!, other = slots.find(s => s.locator.slotIndex === 1)!;
    const effects = () => h.display()!.savedMaterials![model.assetId]!;
    expect(effects()[slot.target.logicalMaterialSlotId]).toMatchObject({ appearance: { lighting: 'unlit', doubleSided: true } });
    expect(effects()[slot.target.logicalMaterialSlotId]).not.toHaveProperty('appearance.chroma');
    expect(effects()[other.target.logicalMaterialSlotId]).toBeUndefined();
    const residents = await prepareValidationResidents(host.authority.read().modelVersions!, host.content);
    const surface = residents.create(c, effects()), plain = residents.create(c);
    const materials = (root: THREE.Object3D) => { const result: THREE.Material[] = []; root.traverse(n => { if (n instanceof THREE.Mesh) result.push(n.material); }); return result; };
    const changed = materials(surface.mesh), originals = materials(plain.mesh);
    expect(changed[0]).toBeInstanceOf(THREE.MeshBasicMaterial); expect(changed[0]!.side).toBe(THREE.DoubleSide);
    expect(changed[1]).toBeInstanceOf(THREE.MeshStandardMaterial); expect(changed[1]!.side).toBe(THREE.FrontSide);
    expect(originals.every(m => m instanceof THREE.MeshStandardMaterial && m.side === THREE.FrontSide)).toBe(true);
    expect(new Set([...changed, ...originals]).size).toBe(4); surface.dispose!(); plain.dispose!(); residents.dispose();

    button('材質', editor).fire('click'); const panel = named('材質の作業', editor), target = named('モデル', panel);
    target.value = model.assetId; target.fire('change'); const face = named('面', panel);
    face.value = face.children.find(n => n.textContent === '面の材質 1')!.value; face.fire('change');
    button('設定を編集', panel).fire('click'); expect(named('照明', panel).value).toBe('unlit'); expect(named('表示する面', panel).value).toBe('double');
    named('照明', panel).value = 'lit'; named('照明', panel).fire('change');
    named('表示する面', panel).value = 'front'; named('表示する面', panel).fire('change'); await edited(() => button('変更を適用', panel).fire('click'));
    expect(effects()[slot.target.logicalMaterialSlotId]).toMatchObject({ appearance: { lighting: 'lit', doubleSided: false } });
    expect(effects()[other.target.logicalMaterialSlotId]).toBeUndefined(); expect(h.legacy).not.toHaveBeenCalled();
    button('全体', named('シーン', editor)).fire('click');
    expect(h.display()!.sceneId).not.toBe(sceneId);
    expect(effects()[slot.target.logicalMaterialSlotId]).toMatchObject({ appearance: { lighting: 'inherit', doubleSided: false } });
    button('観察', named('シーン', editor)).fire('click'); expect(h.display()!.sceneId).toBe(sceneId);
    expect(effects()[slot.target.logicalMaterialSlotId]).toMatchObject({ appearance: { lighting: 'lit', doubleSided: false } });
    const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const raw = Object.values(provider.details.mutable.materialOverridesById).map(r => r.appearance);
    expect(raw).toHaveLength(2); for (const a of raw) expect(a).toMatchObject({ kind: 'value', value: { chroma: { enabled: false,
      keyColorSrgb: [0, 1 / 255, 1], tolerance: 0.3 / Math.sqrt(3), softness: 0.0001 / Math.sqrt(3) } } });
    const source = host.read().source!, backupId = await host.workspaceOutput.generateBackup(source.token, '材質の保存');
    const backup = await BackupArchive.inspect(await host.workspaceOutput.download(backupId), metadata);
    expect(backup.source.originalChanges()).toEqual(source.originalChanges());
    expect(host.workspaceOutput.jobs.find(j => j.id === backupId)!.label).toBe('材質の保存');
    const workspace = await host.workspaceOutput.download(await host.workspaceOutput.generate(source.token)), peer = firstWorkspaceRecipient();
    expect((await peer.receiver.importWorkspace(workspace)).state).toBe('ready');
    expect((await peer.session.read()).source!.originalChanges()).toEqual(source.originalChanges());
    expect((await peer.fs.list('')).some(p => p.includes('native-conversion'))).toBe(false);
    const review = await prepareReviewView(await host.workspaceOutput.download(await host.workspaceOutput.generateReview(source.token, { sceneId })), budget, decode);
    expect(review.models).toHaveLength(1); expect(review.models[0]!.representation.formatProfile).toEqual(await occurrenceGlbProfile());
    const reviewedEffects = review.display(null, null).savedMaterials![review.models[0]!.assetId]!;
    expect(Object.values(reviewedEffects)).toEqual(Object.values(effects()));
    const readonly = await prepareReadonlyResidents(review.models, review.content), viewed = readonly.create(review.models[0]!, reviewedEffects);
    expect(materials(viewed.mesh).every(m => m instanceof THREE.MeshStandardMaterial && m.side === THREE.FrontSide)).toBe(true);
    viewed.dispose!(); readonly.dispose();
    for (const archive of [backup.archive, (await WorkspaceArchive.inspect(workspace, metadata)).archive, review.inspection.archive])
      expect(archive.control.entries.some(e => /native|conversion/.test(e.path))).toBe(false);
    expect(await input.arrayBuffer()).toEqual(inputBytes); await h.ui.dispose();
    const cold = await openValidationHost(h.f.options); expect(cold.read().source!.originalChanges()).toEqual(source.originalChanges());
    expect(cold.authority.read().modelVersions!.map(v => v.closure.representation.formatProfile)).toEqual([await occurrenceGlbProfile(), await occurrenceGlbProfile()]);
    await cold.dispose();
  });
  it('connects colored Shift and numeric pins, local owner reveal, map2 scale retry and exact cold resume', async () => {
    const h = await productWorkspaceFixture(false, false, false, 'map2'), { host, editor, named, button, all, edited } = h;
    const canvas = named('3Dモデルの表示', editor), color = named('追加色', editor), before = host.read().source!.token;
    color.fire('focus'); color.value = '#123456'; color.fire('input');
    const down = { pointerId: 41, button: 0, isPrimary: true, clientX: 80, clientY: 90, shiftKey: true };
    canvas.fire('pointerdown', { ...down, ctrlKey: true }); canvas.fire('pointerup', down); await Promise.resolve();
    canvas.fire('pointerdown', down); canvas.fire('pointermove', { ...down, shiftKey: false }); canvas.fire('pointerup', down); await Promise.resolve();
    canvas.fire('pointerdown', down); canvas.fire('pointerdown', { ...down, pointerId: 42, isPrimary: false }); canvas.fire('pointerup', down); canvas.fire('pointerup', { ...down, pointerId: 42 }); await Promise.resolve();
    canvas.fire('pointerdown', down); h.extent({ left: 11, top: 20, width: 600, height: 400 }); canvas.fire('pointerup', down); await Promise.resolve();
    canvas.fire('pointerdown', down); canvas.fire('pointerup', down); color.value = '#654321'; color.fire('input'); await Promise.resolve();
    expect(h.pick).not.toHaveBeenCalled(); expect(host.read().source!.token).toBe(before);
    color.value = '#123456'; color.fire('input');
    canvas.fire('pointerdown', down); expect(h.reservePointer).toHaveBeenLastCalledWith(true); canvas.fire('pointerup', down); await Promise.resolve();
    expect(h.pick).toHaveBeenCalledTimes(1); expect(color.disabled).toBe(true);
    await edited(() => button('位置を確定', editor).fire('click'));
    const first = h.dispatch.mock.lastCall![1]; if (first.kind !== 'addPin') throw Error('add');
    expect(first.colorSrgb).toEqual([0x12 / 255, 0x34 / 255, 0x56 / 255]);
    const position = host.authority.read().resources.captions[first.captionId]!.anchor;
    expect(position).toMatchObject({ kind: 'value', value: { positionAsset: [0.25, 0.5, 0] } });
    const camera = h.payload(), count = h.dispatch.mock.calls.length;
    button('モデル', editor).fire('click'); const panel = named('モデルの作業', editor), rows = named('プロジェクトのモデル一覧', panel);
    rows.children[0]!.children[0]!.fire('click'); button('隠す', panel).fire('click'); button('キャプション', editor).fire('click');
    const body = named('本文', editor); body.value = '表示を戻しても残す'; body.fire('input');
    expect(button('モデルを表示', named('キャプション一覧', editor)).disabled).toBe(false);
    button('モデルを表示', named('キャプション一覧', editor)).fire('click');
    expect(body.value).toBe('表示を戻しても残す'); expect(h.display()!.hiddenAssetIds).toEqual([]); expect(h.payload()).toEqual(camera);
    expect(h.dispatch).toHaveBeenCalledTimes(count); await edited(() => button('変更を適用', editor).fire('click'));
    color.fire('focus'); color.value = '#abcdef'; color.fire('input');
    const target = named('追加先モデル', editor); expect(target.value).toBe(''); expect(button('このモデルに追加', editor).disabled).toBe(true);
    target.fire('focus'); target.value = target.children[1]!.value; target.fire('change'); button('このモデルに追加', editor).fire('click');
    for (const axis of ['X', 'Y', 'Z']) expect(named(`位置 ${axis}`, editor).value).toBe('');
    expect(button('位置を確定', editor).disabled).toBe(true);
    for (const [axis, value] of [['X', '-2.5'], ['Y', '0']]) { const input = named(`位置 ${axis}`, editor); input.value = value!; input.fire('input'); }
    const z = named('位置 Z', editor); z.fire('compositionstart'); z.value = '1e-2'; expect(button('位置を確定', editor).disabled).toBe(true); z.fire('compositionend');
    expect(button('位置を確定', editor).disabled).toBe(false); await edited(() => button('位置を確定', editor).fire('click'));
    const second = h.dispatch.mock.lastCall![1]; if (second.kind !== 'addPin') throw Error('add');
    expect(second.colorSrgb).toEqual([0xab / 255, 0xcd / 255, 0xef / 255]);
    expect(host.authority.read().resources.captions[second.captionId]!.anchor).toMatchObject({ value: { positionAsset: [-2.5, 0, 0.01] } });
    expect(host.authority.read().resources.captions[first.captionId]!.anchor).toEqual(position);
    button('モデル', editor).fire('click');
    const size = named('ピンの表示倍率', panel); expect(size.value).toBe('1'); size.fire('focus'); size.value = '2.5'; size.fire('input');
    h.f.fs.reject = path => path.endsWith('/published.json'); button('倍率を適用', panel).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 }); await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    expect(size.value).toBe('2.5'); const changes = host.read().source!.originalChanges().length;
    h.f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click'));
    expect(host.read().source!.originalChanges()).toHaveLength(changes + 1);
    expect(h.display()!.pins.filter(p => [first.captionId, second.captionId].includes(p.id)).map(p => p.scale)).toEqual([2.5, 2.5]);
    expect(all(editor).filter(n => n.className === 'lv-project-marker').every(n => n.style.transform?.includes('scale(2.5)'))).toBe(true);
    expect(h.payload()).toEqual(camera);
    const model = host.authority.read().modelVersions![0]!, edge = Object.values(host.authority.read().state.assetMemberships).find(e => e.resourceId === model.assetId)!;
    await host.dispatch(host.read().source!.token, { kind: 'exclude', resourceKind: 'asset', membershipId: edge.id, eventId: `evt_${newId()}` }); h.refresh();
    button('キャプション', editor).fire('click');
    await edited(() => button('モデルを表示', named('キャプション一覧', editor)).fire('click'));
    expect(h.dispatch.mock.lastCall![1]).toMatchObject({ kind: 'include', resourceKind: 'asset', resourceId: model.assetId });
    expect(h.display()!.models).toHaveLength(1); const source = host.read().source!;
    const backup = await host.workspaceOutput.download(await host.workspaceOutput.generateBackup(source.token, '倍率の保存'));
    expect((await BackupArchive.inspect(backup, metadata)).source.originalChanges()).toEqual(source.originalChanges());
    button('閲覧に切り替える').fire('click'); await vi.waitFor(() => expect(h.liveHost().authority.readOnly).toBe(true));
    const readonlyDispatch = vi.spyOn(h.liveHost(), 'dispatch');
    button('モデル', editor).fire('click'); button('隠す', panel).fire('click'); button('キャプション', editor).fire('click');
    button('モデルを表示', named('キャプション一覧', editor)).fire('click');
    expect(h.display()!.hiddenAssetIds).toEqual([]); expect(readonlyDispatch).not.toHaveBeenCalled(); expect(h.liveHost().read().source!.token).toBe(source.token);
    await h.ui.dispose(); const cold = await openValidationHost(h.f.options);
    expect(cold.read().source!.semanticProfile).toBe('map2'); expect(cold.read().source!.originalChanges()).toEqual(source.originalChanges());
    expect(cold.authority.read().resources.captions[first.captionId]!.anchor).toEqual(position);
    expect((cold.read().provider as Extract<Awaited<ReturnType<typeof readProjectScene>>, { kind: 'scene-provider' }>).details.mutable.assetsById[model.assetId]!.pinScale).toEqual({ kind: 'value', value: 2.5 });
    await cold.dispose();
  });
  it('manages product Scenes and shared Caption membership through exact retry, file exchange and cold startup', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, named, button, all, edited } = h, captionId = h.f.f.captionId;
    const initial = host.authority.read(), firstScene = Object.keys(initial.state.scenes)[0]!, firstName = initial.state.scenes[firstScene]!.name;
    if (firstName.kind !== 'value') throw Error('name');
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click');
    const parent = named('変更先モデル', editor); parent.fire('focus'); parent.value = initial.modelVersions![0]!.assetId; parent.fire('change'); button('位置を確認', editor).fire('click');
    await edited(() => button('親モデルと位置を確定', editor).fire('click'));
    const firstWindow = named('最初の記録', named('キャプションのウィンドウ', editor)); named('大きさを変更', firstWindow).fire('keydown', { key: 'ArrowRight', preventDefault() {} });
    const form = named('シーンの変更', editor), name = named('シーン名', form); name.value = '現地'; name.fire('input');
    expect(all(form).some(n => n.textContent.includes('キャプションは追加されません'))).toBe(true);
    await edited(() => form.fire('submit', { preventDefault() {} }));
    const created = h.dispatch.mock.lastCall![1]; if (created.kind !== 'createScene') throw Error('create'); const secondScene = created.sceneId;
    expect(h.display()!.sceneId).toBe(secondScene); expect(host.authority.read().state.defaultSceneId).toEqual(initial.state.defaultSceneId);
    expect(Object.values(host.authority.read().state.captionMemberships).some(e => e.sceneId === secondScene)).toBe(false);
    expect(Object.values(host.authority.read().state.assetMemberships).filter(e => e.sceneId === secondScene)).toHaveLength(1);
    button('名前を変更', editor).fire('click'); name.fire('compositionstart'); name.value = '現地の調査'; name.fire('input');
    expect(button('モデル', editor).disabled).toBe(true); expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true); name.fire('compositionend');
    const beforeRename = host.read().source!; h.f.fs.reject = path => path.endsWith('/published.json'); form.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 }); await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    expect(host.read().source!.token).toBe(beforeRename.token); expect(name.value).toBe('現地の調査'); expect(button('取り消す', form).disabled).toBe(true);
    h.f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click'));
    expect(host.read().source!.originalChanges()).toHaveLength(beforeRename.originalChanges().length + 1); expect(h.display()!.sceneId).toBe(secondScene);
    button('開始シーンにする', editor).fire('click'); expect(all(form).some(n => n.textContent.includes('次にプロジェクトを開くとき'))).toBe(true);
    await edited(() => form.fire('submit', { preventDefault() {} })); expect(h.display()!.sceneId).toBe(secondScene);
    button('モデル', editor).fire('click'); const models = named('モデルの作業', editor); named('プロジェクトのモデル一覧', models).children[0]!.children[0]!.fire('click');
    const visible = named('このシーンに表示', models); visible.checked = false; await edited(() => visible.fire('change'));
    button('キャプション', editor).fire('click'); expect(h.display()!.models).toHaveLength(0);
    const picker = named('キャプションの追加・除外', editor), choices = named('キャプション', picker), query = named('検索', picker);
    choices.value = captionId; choices.fire('change'); expect(all(picker).some(n => n.textContent.includes('モデルは非表示のまま'))).toBe(true);
    const resources = host.authority.read().resources.captions;
    await edited(() => button('このシーンに追加', picker).fire('click')); expect(h.display()!.models).toHaveLength(0); expect(h.display()!.selectedId).toBeNull();
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click'); expect(h.display()!.selectedId).toBe(captionId);
    query.fire('compositionstart'); query.value = '検索中'; query.fire('input'); expect(button('このシーンから外す', picker).disabled).toBe(true); expect(button('モデル', editor).disabled).toBe(true);
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true); query.fire('compositionend'); expect(choices.value).toBe(captionId);
    const beforeExclude = host.read().source!, edge = Object.values(host.authority.read().state.captionMemberships).find(e => e.sceneId === secondScene && e.resourceId === captionId)!;
    h.f.fs.reject = path => path.endsWith('/published.json'); button('このシーンから外す', picker).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 }); await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    expect(host.read().source!.token).toBe(beforeExclude.token); expect(h.display()!.selectedId).toBe(captionId); expect(named('最初の記録', named('キャプションのウィンドウ', editor))).toBeDefined();
    const staged = (await h.f.fs.list('')).filter(path => path.endsWith('.amchange')), bytes = await Promise.all(staged.map(path => h.f.fs.readBytes(path)));
    h.f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click')); expect(await Promise.all(staged.map(path => h.f.fs.readBytes(path)))).toEqual(bytes);
    expect(h.display()!.selectedId).toBeNull(); expect(host.authority.read().resources.captions).toEqual(resources); expect(choices.value).toBe(captionId); expect(query.value).toBe('検索中');
    expect(host.authority.read().state.captionMemberships[edge.id]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    await edited(() => button('このシーンに追加', picker).fire('click'));
    expect(Object.values(host.authority.read().state.captionMemberships).filter(e => e.sceneId === secondScene && e.lifecycle.kind === 'value' && e.lifecycle.value.state === 'active').map(e => e.id)).not.toContain(edge.id);
    button(firstName.value, named('シーン', editor)).fire('click'); expect(h.display()!.sceneId).toBe(firstScene);
    expect(named('最初の記録', named('キャプションのウィンドウ', editor)).style.width).toBe('300px');
    const shared = await host.workspaceOutput.download(await host.workspaceOutput.generate(host.read().source!.token)), peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(shared);
    await peer.session.edit((await peer.session.read()).source!.token, { kind: 'renameScene', sceneId: secondScene, name: '共同作業で変更したシーン' });
    const receive = named('更新ファイルを選択'); Object.assign(receive, { files: [(await contributionFile(peer.session, peer.fs, peer.store)).file] }); receive.fire('change');
    await edited(() => receive.parent!.parent!.fire('submit', { preventDefault() {} })); await vi.waitFor(() => expect(all(h.root).some(n => n.textContent === '更新を受け取りました。')).toBe(true), { timeout: 10000 });
    Object.assign(receive, { files: [] }); receive.fire('change'); expect(h.display()!.sceneId).toBe(firstScene);
    const final = host.read().source!; await h.ui.dispose(); const cold = await openValidationHost(h.f.options); expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges());
    const coldUi = createValidationWorkspace(new RecordedDocument().asDocument(), { productEditor: true, fileLimits: budget, decode, list: async () => [], selected() {},
      open: async () => cold, render: async () => ({ factory: h.viewportFactory, dispose() {} }) }, h.f.run);
    await vi.waitFor(() => expect(h.display()!.sceneId).toBe(secondScene));
    expect(cold.authority.read().state.scenes[secondScene]!.name).toEqual({ kind: 'value', value: '共同作業で変更したシーン' });
    expect(cold.authority.read().state.defaultSceneId).toEqual({ kind: 'value', value: secondScene }); expect(h.legacy).not.toHaveBeenCalled(); await coldUi.dispose();
  });
  it('recovers product Scene names with retained text and resolves cold startup only after exact saved acknowledgement', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, edited, button, named, all } = h, captionId = h.f.f.captionId;
    const a = Object.keys(host.authority.read().state.scenes)[0]!, b = `scn_${newId()}`, c = `scn_${newId()}`;
    for (const [id, name, order] of [[b, '調査', 'B'], [c, '別の入口', 'C']]) await host.dispatch(host.read().source!.token,
      { kind: 'createScene', sceneId: id!, activeSceneId: a, sourceSceneId: a, name: name!, orderKey: order!, membershipIds: [`sam_${newId()}`], eventId: `evt_${newId()}` });
    h.refresh(); const shared = host.read().source!, seed = await host.workspaceOutput.download(await host.workspaceOutput.generate(shared.token));
    const base = host.workspaceOutput.bases.find(b => b.selection.heads.length === shared.heads.length && b.selection.heads.every(head => shared.heads.includes(head)))!.selection;
    const peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(seed);
    await host.dispatch(host.read().source!.token, { kind: 'renameScene', sceneId: a, name: '手元の名前' });
    await host.dispatch(host.read().source!.token, { kind: 'setDefaultScene', sceneId: b }); h.refresh();
    await peer.session.edit((await peer.session.read()).source!.token, { kind: 'renameScene', sceneId: a, name: '相手の名前' });
    await peer.session.edit((await peer.session.read()).source!.token, { kind: 'setDefaultScene', sceneId: c });
    const receive = async () => { const input = named('更新ファイルを選択'); Object.assign(input, { files: [(await contributionFile(peer.session, peer.fs, peer.store)).file] }); input.fire('change');
      await edited(() => input.parent!.parent!.fire('submit', { preventDefault() {} })); await vi.waitFor(() => expect(all(h.root).some(n => n.textContent === '更新を受け取りました。')).toBe(true));
      Object.assign(input, { files: [] }); input.fire('change'); };
    await receive(); named('キャプション一覧', editor).children[0]!.children[0]!.fire('click');
    const body = named('本文', named('キャプションの詳細', editor)); body.value = '未適用の本文'; body.fire('input');
    const form = all(named('記録の競合', editor)).find(n => n.tag === 'li' && n.attributes.get('aria-label')?.endsWith('の名前'))!;
    const choice = all(form).find(n => n.tag === 'select')!, text = all(form).find(n => n.tag === 'textarea')!, apply = button('競合を解消', form);
    expect(choice.value).toBe(''); choice.value = 'manual'; choice.fire('change'); text.value = ' \n'; text.fire('input'); expect(apply.disabled).toBe(true);
    text.fire('compositionstart'); text.value = '共同の名前'; text.fire('input'); expect(apply.disabled).toBe(true); expect(button('モデル', editor).disabled).toBe(true); text.fire('compositionend');
    const camera = h.payload(), current = h.display()!.sceneId; await edited(() => apply.fire('click'));
    expect(body.value).toBe('未適用の本文'); expect(h.display()!.sceneId).toBe(current); expect(h.payload()).toEqual(camera); expect(h.recall).not.toHaveBeenCalled();
    const startup = named('開始シーンの競合', editor), startChoice = all(startup).find(n => n.tag === 'select')!;
    const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const selected = provider.inspection.candidates.fields.find(f => f.path.join('/') === 'project/defaultSceneId')!.candidates.find(c => c.value.kind === 'value' && c.value.value === b)!;
    startChoice.value = selected.operationId; startChoice.fire('change'); expect(button('競合を解消', startup).disabled).toBe(true);
    button('選択を取り消す', startup).fire('click'); button('取り消す', named('キャプションの詳細', editor)).fire('click'); button('変更を取り消す', editor).fire('click');
    const freshStart = named('開始シーンの競合', editor), freshChoice = all(freshStart).find(n => n.tag === 'select')!;
    freshChoice.value = selected.operationId; freshChoice.fire('change'); await edited(() => button('競合を解消', freshStart).fire('click'));
    expect(h.display()!.sceneId).toBe(a); expect(h.payload()).toEqual(camera);
    const reply = await host.workspaceOutput.download(await host.workspaceOutput.generateContribution(host.read().source!.token, base));
    await peer.receiver.receive((await peer.session.read()).source!.token, reply);
    await host.dispatch(host.read().source!.token, { kind: 'setDefaultScene', sceneId: a }); h.refresh();
    await peer.session.edit((await peer.session.read()).source!.token, { kind: 'setDefaultScene', sceneId: c }); await receive();
    const before = host.read().source!, view = await openValidationHost({ ...h.f.options, mode: 'view' }), viewFactory = vi.fn(h.viewportFactory); let viewOpens = 0;
    const viewUi = createValidationWorkspace(new RecordedDocument().asDocument(), { productEditor: true, fileLimits: budget, decode, list: async () => [], selected() {},
      open: async () => { if (++viewOpens === 1) return view; throw Error('別の編集タブが使用中です。'); }, render: async () => ({ factory: viewFactory, dispose() {} }) }, h.f.run), viewRoot = record(viewUi.root);
    await vi.waitFor(() => expect(all(viewRoot).some(n => n.tag === 'button' && n.textContent === '編集を開始する')).toBe(true));
    all(viewRoot).find(n => n.tag === 'button' && n.textContent === '編集を開始する')!.fire('click');
    await vi.waitFor(() => expect(all(viewRoot).some(n => n.textContent === '別の編集タブが使用中です。')).toBe(true)); expect(viewFactory).not.toHaveBeenCalled();
    expect(all(viewRoot).find(n => n.tag === 'button' && n.textContent === '編集を開始する')!.disabled).toBe(false); await viewUi.dispose();
    await h.ui.dispose(); const cold = await openValidationHost(h.f.options), factory = vi.fn(h.viewportFactory).mockImplementationOnce(() => { throw Error('初回の表示準備に失敗しました。'); });
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { productEditor: true, fileLimits: budget, decode, list: async () => [], selected() {}, open: async () => cold,
      render: async () => ({ factory, dispose() {} }) }, h.f.run), root = record(u.root);
    const coldNamed = (label: string) => all(root).find(n => n.attributes.get('aria-label') === label)!, coldButton = (label: string) => all(root).find(n => n.tag === 'button' && n.textContent === label)!;
    await vi.waitFor(() => expect(coldNamed('残す開始シーン')).toBeDefined()); expect(factory).not.toHaveBeenCalled(); expect(all(root).some(n => n.className === 'lv-project-workspace')).toBe(false);
    const cp = cold.read().provider!; if (cp.kind !== 'scene-provider') throw Error('provider');
    const start = cp.inspection.candidates.fields.find(f => f.path.join('/') === 'project/defaultSceneId')!.candidates.find(c => c.value.kind === 'value' && c.value.value === a)!;
    const select = coldNamed('残す開始シーン'); expect(select.value).toBe(''); select.value = start.operationId; select.fire('change');
    expect(coldButton('ファイルに保存').disabled).toBe(true); h.f.fs.reject = path => path.endsWith('/published.json'); coldButton('開始シーンを確定').fire('click');
    await vi.waitFor(() => expect(cold.authority.status!().kind).toBe('failed')); expect(factory).not.toHaveBeenCalled(); expect(select.value).toBe(start.operationId);
    const paths = (await h.f.fs.list('')).filter(p => p.endsWith('.amchange')), bytes = await Promise.all(paths.map(p => h.f.fs.readBytes(p)));
    h.f.fs.reject = () => false; coldButton('更新を再試行').fire('click'); await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    expect(coldButton('更新を再試行').hidden).toBe(false); expect(all(root).some(n => n.className === 'lv-project-workspace')).toBe(false);
    coldButton('更新を再試行').fire('click'); await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    expect(await Promise.all(paths.map(p => h.f.fs.readBytes(p)))).toEqual(bytes); expect(cold.read().source!.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    expect(h.display()!.sceneId).toBe(a); coldNamed('キャプション一覧').children[0]!.children[0]!.fire('click');
    coldNamed('本文').value = '復旧後の本文'; coldNamed('本文').fire('input'); coldButton('変更を適用').fire('click');
    await vi.waitFor(() => expect(cold.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '復旧後の本文' }));
    const final = await cold.workspaceOutput.download(await cold.workspaceOutput.generateContribution(cold.read().source!.token, base));
    const received = await peer.receiver.receive((await peer.session.read()).source!.token, final); expect(received.source!.heads).toEqual(cold.read().source!.heads);
    expect((await peer.receiver.receive(received.source!.token, final)).source!.token).toBe(received.source!.token); expect(h.legacy).not.toHaveBeenCalled(); await u.dispose();
  });
  it('recovers product Caption parents and independent duplicate records through exact retry, returned files and cold reopen', async () => {
    const h = await productWorkspaceFixture(true, false, true), { host, editor, named, button, all, edited } = h, captionId = h.f.f.captionId;
    const sceneId = Object.keys(host.authority.read().state.scenes)[0]!, seed = host.read().source!, base = host.workspaceOutput.bases[0]!.selection;
    const peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(h.f.f.file!);
    const p = () => { const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider'); return provider; };
    const receive = async () => { const input = named('更新ファイルを選択'); Object.assign(input, { files: [(await contributionFile(peer.session, peer.fs, peer.store)).file] }); input.fire('change');
      await edited(() => input.parent!.parent!.fire('submit', { preventDefault() {} })); await vi.waitFor(() => expect(all(h.root).some(n => n.textContent === '更新を受け取りました。')).toBe(true)); Object.assign(input, { files: [] }); input.fire('change'); };
    const returnFile = async () => host.workspaceOutput.download(await host.workspaceOutput.generateContribution(host.read().source!.token, base));
    const selectCaption = (id: string) => { const items = projectCaptions(p(), sceneId); const index = items.findIndex(c => c.id === id); expect(index).toBeGreaterThanOrEqual(0); named('キャプション一覧', editor).children[index]!.children[0]!.fire('click'); };
    selectCaption(captionId); button('プロジェクトから削除', named('キャプションの削除', editor)).fire('click'); await edited(() => button('削除する', named('削除の確認', editor)).fire('click'));
    const beforeChildren = structuredClone([p().details.mutable.sceneCaptionMembershipsById, p().details.mutable.captionAttachmentsById, p().details.mutable.captionTagMembershipsById]);
    await peer.session.edit(seed.token, { kind: 'editCaption', captionId, edits: { body: '削除と同時の追記' } }); await receive();
    expect(projectCaptions(p(), sceneId)).toHaveLength(0);
    const life = all(named('記録の競合', editor)).find(n => n.tag === 'li' && n.attributes.get('aria-label')?.endsWith('：削除と編集'))!;
    expect(all(life).some(n => n.textContent.includes('削除済み・復元しません'))).toBe(true); const lifeChoice = all(life).find(n => n.tag === 'select')!;
    lifeChoice.value = 'active'; lifeChoice.fire('change'); await edited(() => button('競合を解消', life).fire('click'));
    expect([p().details.mutable.sceneCaptionMembershipsById, p().details.mutable.captionAttachmentsById, p().details.mutable.captionTagMembershipsById]).toEqual(beforeChildren);
    expect(projectCaptions(p(), sceneId)).toHaveLength(0); expect(captionAttachments(host.authority.read().mediaData, captionId).ready).toHaveLength(0);
    await peer.receiver.receive((await peer.session.read()).source!.token, await returnFile());
    const picker = named('キャプションの追加・除外', editor), choose = named('キャプション', picker); choose.value = captionId; choose.fire('change'); await edited(() => button('このシーンに追加', picker).fire('click'));
    selectCaption(captionId); const media = named('画像の整理', editor), stored = named('登録済みメディア', media); stored.open = true; stored.fire('toggle');
    button('受信画像', named('メディアを選択', media)).fire('click'); await edited(() => button('選択したメディアを添付', media).fire('click'));
    const attachment = captionAttachments(host.authority.read().mediaData, captionId).ready[0]!;
    await peer.session.edit((await peer.session.read()).source!.token, { kind: 'include', sceneId, resourceKind: 'caption', resourceId: captionId, membershipId: `scm_${newId()}`, orderKey: 'B', eventId: `evt_${newId()}` }); await receive();
    expect(projectCaptions(p(), sceneId)).toHaveLength(0);
    const duplicate = all(named('記録の競合', editor)).find(n => n.tag === 'li' && n.attributes.get('aria-label')?.endsWith('の重複登録'))!;
    const selects = all(duplicate).filter(n => n.tag === 'select'), original = selects[0]!, decision = selects[1]!;
    expect(original.value).toBe(''); expect(decision.value).toBe(''); original.value = original.children[1]!.value; original.fire('change'); expect(button('競合を解消', duplicate).disabled).toBe(true);
    decision.value = 'both'; decision.fire('change'); const originalCaption = host.authority.read().resources.captions[captionId];
    h.f.fs.reject = path => path.endsWith('/published.json'); button('競合を解消', duplicate).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed')); await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    expect(Object.keys(host.authority.read().resources.captions)).toEqual([captionId]); expect(decision.value).toBe('both');
    const staged = (await h.f.fs.list('')).filter(path => path.endsWith('.amchange')), bytes = await Promise.all(staged.map(path => h.f.fs.readBytes(path)));
    h.f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click')); expect(await Promise.all(staged.map(path => h.f.fs.readBytes(path)))).toEqual(bytes);
    const copyId = Object.keys(host.authority.read().resources.captions).find(id => id !== captionId)!; expect(copyId).toBeTruthy(); expect(host.authority.read().resources.captions[captionId]).toEqual(originalCaption);
    const copied = captionAttachments(host.authority.read().mediaData, copyId).ready[0]!; expect(copied.id).not.toBe(attachment.id); expect(copied.mediaResourceId).toEqual(attachment.mediaResourceId);
    selectCaption(copyId); const body = named('本文', named('キャプションの詳細', editor)); body.value = 'コピーだけの本文'; body.fire('input'); await edited(() => button('変更を適用', named('キャプションの詳細', editor)).fire('click'));
    expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '削除と同時の追記' });
    const result = await returnFile(), received = await peer.receiver.receive((await peer.session.read()).source!.token, result);
    expect((await peer.receiver.receive(received.source!.token, result)).source!.token).toBe(received.source!.token);
    const final = host.read().source!; await h.ui.dispose(); const cold = await openValidationHost(h.f.options); expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges());
    expect(cold.authority.read().resources.captions[copyId]!.body).toEqual({ kind: 'value', value: 'コピーだけの本文' }); expect(h.legacy).not.toHaveBeenCalled(); await cold.dispose();
  });
  it('resolves product Caption text, complete pin candidates and absent color without changing camera or hidden owners', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, named, button, all, edited } = h, captionId = h.f.f.captionId;
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click'); const assetId = host.authority.read().modelVersions![0]!.assetId;
    const parent = named('変更先モデル', editor); parent.fire('focus'); parent.value = assetId; parent.fire('change'); button('位置を確認', editor).fire('click'); await edited(() => button('親モデルと位置を確定', editor).fire('click'));
    const shared = host.read().source!, initial = host.authority.read().resources.captions[captionId]!.anchor; if (initial.kind !== 'value' || initial.value.kind !== 'asset') throw Error('anchor');
    const anchor = initial.value, seed = await host.workspaceOutput.download(await host.workspaceOutput.generate(shared.token)), base = host.workspaceOutput.bases.find(b => b.selection.heads.length === shared.heads.length && b.selection.heads.every(head => shared.heads.includes(head)))!.selection;
    const peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(seed);
    await host.dispatch(host.read().source!.token, { kind: 'movePin', sceneId: h.display()!.sceneId, captionId, anchor: { ...anchor, positionAsset: [1, 2, 3] } });
    await host.dispatch(host.read().source!.token, { kind: 'editCaption', captionId, edits: { body: '手元の本文', colorSrgb: [0, 1, 0] } }); h.refresh();
    button('モデル', editor).fire('click'); const models = named('モデルの作業', editor); named('プロジェクトのモデル一覧', models).children[0]!.children[0]!.fire('click'); button('隠す', models).fire('click'); button('キャプション', editor).fire('click');
    const remoteAnchor = { ...anchor, positionAsset: [4, 2, 1] }, doc = A.change(A.load<Record<string, any>>(shared.encodeFullSource()), d => {
      d.captionsById[captionId].body = new A.ImmutableString(json('相手の本文')); d.captionsById[captionId].anchor = new A.ImmutableString(json(remoteAnchor)); delete d.captionsById[captionId].colorSrgb;
    });
    const source = ProjectMetadataSource.fromFullSource(A.save(doc), shared.proof, metadata), content = new ValidationContent(h.f.fs, h.f.store, budget, decode);
    const provider = await underWriteLease(h.f.fs, () => readProjectScene(source.read(), metadata, content.verifier(true)));
    const publication = newId(), capture = await WorkspaceSourceCapture.prepare({ read: async () => ({ state: 'ready', source, provider, publication }) }, source.token, h.f.store, metadata), chunks: BlobPart[] = [];
    await writeWorkspaceArchive(capture, h.f.store, new WritableStream({ write: b => { chunks.push(b.slice() as BlobPart); } }), { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    const input = named('更新ファイルを選択'); Object.assign(input, { files: [new Blob(chunks)] }); input.fire('change'); await edited(() => input.parent!.parent!.fire('submit', { preventDefault() {} }));
    await vi.waitFor(() => expect(all(h.root).some(n => n.textContent === '更新を受け取りました。')).toBe(true)); Object.assign(input, { files: [] }); input.fire('change');
    const area = named('記録の競合', editor), form = (suffix: string) => all(area).find(n => n.tag === 'li' && n.attributes.get('aria-label')?.endsWith(suffix))!;
    let bodyForm = form('：本文'), select = all(bodyForm).find(n => n.tag === 'select')!, text = all(bodyForm).find(n => n.tag === 'textarea')!;
    select.value = 'manual'; select.fire('change'); text.fire('compositionstart'); text.value = '統合した本文\n<img src=x>'; text.fire('input'); expect(button('競合を解消', bodyForm).disabled).toBe(true); text.fire('compositionend');
    const sceneId = h.display()!.sceneId; await host.dispatch(host.read().source!.token, { kind: 'renameScene', sceneId, name: '更新された名前' }); h.refresh();
    expect(text.value).toContain('<img src=x>'); expect(button('競合を解消', bodyForm).disabled).toBe(true); button('選択を取り消す', bodyForm).fire('click');
    bodyForm = form('：本文'); select = all(bodyForm).find(n => n.tag === 'select')!; text = all(bodyForm).find(n => n.tag === 'textarea')!; select.value = 'manual'; select.fire('change'); text.value = '統合した本文\n<img src=x>'; text.fire('input');
    const camera = h.payload(); await edited(() => button('競合を解消', bodyForm).fire('click')); expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '統合した本文\n<img src=x>' });
    let anchorForm = form('：ピン位置'), anchorChoice = all(anchorForm).find(n => n.tag === 'select')!; const option = anchorChoice.children.find(n => n.textContent.includes('4 / 2 / 1'))!;
    anchorChoice.value = option.value; anchorChoice.fire('change'); expect(h.display()!.preview).toBeUndefined(); expect(h.display()!.hiddenAssetIds).toEqual([assetId]); button('選択を取り消す', anchorForm).fire('click');
    button('モデル', editor).fire('click'); button('表示', models).fire('click'); button('キャプション', editor).fire('click'); button('ピンを追加', editor).fire('click');
    anchorForm = form('：ピン位置'); anchorChoice = all(anchorForm).find(n => n.tag === 'select')!; expect(anchorChoice.disabled).toBe(true); expect(h.display()!.preview).toBeUndefined(); button('取り消す', named('ピンの操作', editor)).fire('click');
    anchorChoice.value = option.value; anchorChoice.fire('change'); expect(h.display()!.preview).toEqual(pointInProject([4, 2, 1], host.authority.read().modelVersions![0]!.closure.binding.assetToProject)); expect(h.display()!.pinEdit).toBeUndefined();
    h.f.fs.reject = path => path.endsWith('/published.json'); button('競合を解消', anchorForm).fire('click'); await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed')); await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    h.f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click')); expect(host.authority.read().resources.captions[captionId]!.anchor).toEqual({ kind: 'value', value: remoteAnchor });
    const colorForm = form('：ピンの色'), color = all(colorForm).find(n => n.tag === 'select')!; color.value = color.children.find(n => n.textContent.includes('未設定'))!.value; color.fire('change'); await edited(() => button('競合を解消', colorForm).fire('click'));
    const p = host.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider'); expect(p.details.mutable.captionsById[captionId]!.colorSrgb).toEqual({ kind: 'value', value: undefined }); expect(h.payload()).toEqual(camera); expect(h.recall).not.toHaveBeenCalled();
    const file = await host.workspaceOutput.download(await host.workspaceOutput.generateContribution(host.read().source!.token, base)), received = await peer.receiver.receive((await peer.session.read()).source!.token, file);
    expect(received.source!.heads).toEqual(host.read().source!.heads); const final = host.read().source!; await h.ui.dispose(); const cold = await openValidationHost(h.f.options); expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges()); await cold.dispose();
  });
  it('guards product Scene drafts against IME, camera gestures and stale source while keeping readonly inventory usable', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, named, button, all, edited } = h, captionId = h.f.f.captionId;
    const form = named('シーンの変更', editor), name = named('シーン名', form); name.value = '作業中'; name.fire('input'); await edited(() => form.fire('submit', { preventDefault() {} }));
    button('名前を変更', editor).fire('click'); name.fire('compositionstart'); name.value = '未確定の名称'; name.fire('input');
    expect(button('名前を確定', form).disabled).toBe(true); expect(button('モデル', editor).disabled).toBe(true); name.fire('compositionend');
    const calls = h.dispatch.mock.calls.length; h.dragging(true); expect(button('名前を確定', form).disabled).toBe(true); form.fire('submit', { preventDefault() {} }); expect(h.dispatch).toHaveBeenCalledTimes(calls); h.dragging(false);
    await host.dispatch(host.read().source!.token, { kind: 'editCaption', captionId, edits: { body: '入力中に届いた更新' } }); h.refresh();
    expect(name.value).toBe('未確定の名称'); expect(button('名前を確定', form).disabled).toBe(true); button('取り消す', form).fire('click');
    const count = Object.keys(host.authority.read().state.scenes).length; name.fire('focus'); await host.dispatch(host.read().source!.token, { kind: 'editCaption', captionId, edits: { body: 'フォーカス後の更新' } }); h.refresh();
    name.value = '古い対象への追加'; name.fire('input'); expect(button('シーンを追加', form).disabled).toBe(true); form.fire('submit', { preventDefault() {} }); expect(Object.keys(host.authority.read().state.scenes)).toHaveLength(count); button('取り消す', form).fire('click');
    button('開始シーンにする', editor).fire('click'); await host.dispatch(host.read().source!.token, { kind: 'editCaption', captionId, edits: { body: '確認中に届いた更新' } }); h.refresh();
    expect(button('開始シーンを設定', form).disabled).toBe(true); button('取り消す', form).fire('click');
    button('閲覧に切り替える').fire('click'); await vi.waitFor(() => expect(button('編集を開始する')?.disabled).toBe(false), { timeout: 10000 });
    expect(name.disabled).toBe(true); expect(button('名前を変更', editor).disabled).toBe(true); expect(button('開始シーンにする', editor).disabled).toBe(true);
    const picker = named('キャプションの追加・除外', editor), choices = named('キャプション', picker), query = named('検索', picker); choices.value = captionId; choices.fire('change');
    expect(button('このシーンに追加', picker).disabled).toBe(true); expect(query.readOnly).toBe(false);
    query.fire('compositionstart'); query.value = '最初'; query.fire('input'); expect(button('編集を開始する').disabled).toBe(true);
    const current = h.liveHost(), base = current.read(); if (base.provider?.kind !== 'scene-provider') throw Error('provider');
    const updated = base.source!.prepareEdit(base.source!.token, { kind: 'editCaption', captionId, edits: { body: '再描画前の更新' } }, base.provider, newId());
    const provider = await readProjectScene(updated.read(), metadata, current.content.verifier(false)); if (provider.kind !== 'scene-provider') throw Error('provider');
    const unread = vi.spyOn(current, 'read').mockImplementation(() => ({ ...base, source: updated, provider }));
    query.value = '最初の記録'; query.fire('compositionend'); expect(query.value).toBe('最初の記録'); expect(choices.value).toBe(captionId); expect(button('編集を開始する').disabled).toBe(false);
    unread.mockRestore(); h.refresh(); expect(h.ui.hasChanges()).toBe(false); expect(all(named('キャプション一覧', editor)).some(n => n.className === 'lv-caption-select')).toBe(false); await h.ui.dispose();
  });
  it('keeps raw ambiguous product Caption membership uncertain without blocking independent text conflicts', async () => {
    const h = await productWorkspaceFixture(true), source = h.host.read().source!, sceneId = Object.keys(h.host.authority.read().state.scenes)[0]!, captionId = h.f.f.captionId;
    const original = A.load<Record<string, any>>(source.encodeFullSource()), edgeId = Object.keys(original.sceneCaptionMembershipsById)[0]!;
    const scalar = (v: string | JsonObject) => new A.ImmutableString(canonicalFixture(v));
    const read = async (doc: typeof original) => { const p = await readProjectScene(ProjectMetadataSource.fromFullSource(A.save(doc), source.proof, metadata).read(), metadata, h.host.content.verifier(false));
      if (p.kind !== 'scene-provider') throw Error('provider'); const inventory = projectCaptionInventory(p, sceneId); if (inventory.kind !== 'ready') throw Error('inventory'); return inventory.items.find(i => i.caption.id === captionId)!; };
    const deleted = A.change(A.clone(original), d => { d.sceneCaptionMembershipsById[edgeId].lifecycle = scalar({ state: 'deleted', eventId: `evt_${newId()}`, reason: 'userDelete' }); });
    expect((await read(deleted)).membership).toEqual({ kind: 'value', value: 'absent' });
    const unknownOwner = A.change(A.clone(original), d => { d.sceneCaptionMembershipsById[edgeId].captionId = scalar('not-an-id'); });
    expect((await read(unknownOwner)).membership.kind).toBe('unresolved');
    const duplicate = A.change(A.clone(original), d => { const id = `scm_${newId()}`; d.sceneCaptionMembershipsById[id] = { ...d.sceneCaptionMembershipsById[edgeId], id: scalar(id) }; });
    expect((await read(duplicate)).membership.kind).toBe('unresolved');
    const edgeEdit = A.change(A.clone(original), d => { d.sceneCaptionMembershipsById[edgeId].orderKey = scalar('B'); });
    expect((await read(A.merge(deleted, edgeEdit))).membership.kind).toBe('unresolved');
    const parallelOrder = A.change(A.clone(original), d => { d.sceneCaptionMembershipsById[edgeId].orderKey = scalar('C'); });
    expect((await read(A.merge(edgeEdit, parallelOrder))).membership.kind).toBe('unresolved');
    const unknownScene = A.change(A.clone(original), d => { d.sceneCaptionMembershipsById[edgeId].sceneId = scalar('not-a-scene'); d.sceneCaptionMembershipsById[edgeId].captionId = scalar(`cap_${newId()}`); });
    expect((await read(unknownScene)).membership.kind).toBe('unresolved');
    const titles = ['候補 A', '候補 B'].map(text => A.change(A.clone(original), d => { d.captionsById[captionId].title = scalar(text); }));
    const textConflict = await read(A.merge(titles[0]!, titles[1]!)); expect(textConflict.caption.title.kind).toBe('unresolved'); expect(textConflict.lifecycle).toEqual({ kind: 'value', value: 'active' }); expect(textConflict.membership).toEqual({ kind: 'value', value: 'included' });
    await h.ui.dispose();
  });
  it('deletes one shared product Caption after exact dependency confirmation, retaining resources through retry, files and cold reopen', async () => {
    const h = await productWorkspaceFixture(true, false, true), { host, editor, named, button, edited, all } = h, captionId = h.f.f.captionId;
    const sceneId = Object.keys(host.authority.read().state.scenes)[0]!, secondScene = `scn_${newId()}`;
    await host.dispatch(host.read().source!.token, { kind: 'createScene', sceneId: secondScene, activeSceneId: sceneId, sourceSceneId: sceneId, name: '別の調査', orderKey: 'B',
      membershipIds: [`sam_${newId()}`], eventId: `evt_${newId()}` });
    await host.dispatch(host.read().source!.token, { kind: 'include', sceneId: secondScene, resourceKind: 'caption', resourceId: captionId, membershipId: `scm_${newId()}`, orderKey: 'A', eventId: `evt_${newId()}` }); h.refresh();
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click');
    const area = named('キャプションの削除', editor), box = named('削除の確認', area), windows = named('キャプションのウィンドウ', editor);
    button('プロジェクトから削除', area).fire('click'); expect(all(box).filter(n => n.tag === 'li')).toHaveLength(4);
    expect(all(box).some(n => n.textContent.includes('別の調査'))).toBe(true); expect(all(box).some(n => n.textContent.includes('受信画像'))).toBe(true); expect(all(box).some(n => n.textContent.includes('調査対象'))).toBe(true);
    const beforeCancel = host.read().source!.token; expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true); expect(named('本文', editor).readOnly).toBe(true);
    button('取り消す', box).fire('click'); expect(host.read().source!.token).toBe(beforeCancel);
    button('プロジェクトから削除', area).fire('click'); await host.dispatch(beforeCancel, { kind: 'editCaption', captionId, edits: { body: '確認中の更新' } }); h.refresh();
    expect(button('削除する', box).disabled).toBe(true); expect(all(box).some(n => n.textContent.includes('影響を確認し直してください'))).toBe(true);
    button('取り消す', box).fire('click'); button('プロジェクトから削除', area).fire('click');
    const calls = h.dispatch.mock.calls.length; h.dragging(true); expect(button('削除する', box).disabled).toBe(true);
    button('削除する', box).disabled = false; button('削除する', box).fire('click'); expect(h.dispatch).toHaveBeenCalledTimes(calls); h.dragging(false);
    const p = host.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    const before = host.read().source!, impact = host.authority.captionDeletionImpact!(before.token, captionId), immutable = p.details.immutable;
    h.f.fs.reject = path => path.endsWith('/published.json'); button('削除する', box).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 }); await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    expect(host.read().source!.token).toBe(before.token); expect(all(windows).some(n => n.attributes.get('aria-label') === '最初の記録')).toBe(true); expect(button('取り消す', box).disabled).toBe(true);
    const files = (await h.f.fs.list('')).filter(path => path.endsWith('.amchange')), bytes = await Promise.all(files.map(path => h.f.fs.readBytes(path)));
    h.f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click'));
    expect(await Promise.all(files.map(path => h.f.fs.readBytes(path)))).toEqual(bytes); expect(host.read().source!.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    const after = host.read().provider!; if (after.kind !== 'scene-provider') throw Error('provider');
    expect(after.details.immutable).toEqual(immutable); expect(after.resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '確認中の更新' });
    expect(after.resources.captions[captionId]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    for (const [map, edges] of [['sceneCaptionMembershipsById', impact.memberships], ['captionAttachmentsById', impact.attachments], ['captionTagMembershipsById', impact.tags]] as const)
      for (const edge of edges) expect(after.details.mutable[map][edge.id]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    expect(after.details.mutable.captionTagsById[impact.tags[0]!.tagId]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    expect(all(windows).some(n => n.attributes.get('aria-label') === '最初の記録')).toBe(false); expect(named('本文', editor).value).toBe('');
    const final = host.read().source!, output = await host.workspaceOutput.download(await host.workspaceOutput.generate(final.token)); await h.ui.dispose();
    const cold = await openValidationHost(h.f.options); expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges()); await cold.dispose();
    const peer = firstWorkspaceRecipient(); expect((await peer.receiver.importWorkspace(output)).state).toBe('ready');
    expect((await peer.session.read()).source!.originalChanges()).toEqual(final.originalChanges()); expect(h.legacy).not.toHaveBeenCalled();
  });
  it('preserves product drafts on incoming Caption deletion and exposes retained concurrent edits without stale apply', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, named, button, all } = h, captionId = h.f.f.captionId;
    const deleting = firstWorkspaceRecipient(), editing = firstWorkspaceRecipient(); await deleting.receiver.importWorkspace(h.f.f.file!); await editing.receiver.importWorkspace(h.f.f.file!);
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click'); const body = named('本文', editor); body.value = '残しておく未適用の入力'; body.fire('input');
    expect(button('プロジェクトから削除', named('キャプションの削除', editor)).disabled).toBe(true);
    const impact = host.authority.captionDeletionImpact!(host.read().source!.token, captionId);
    await deleting.session.edit((await deleting.session.read()).source!.token, { kind: 'deleteCaption', captionId, eventId: `evt_${newId()}`,
      observedMembershipIds: impact.memberships.map(e => e.id), observedAttachmentIds: impact.attachments.map(e => e.id), observedTagMembershipIds: impact.tags.map(e => e.id) });
    // Exercise an external service update while the UI owns an unsaved draft.
    await host.workspaceFiles.receive(host.read().source!.token, (await contributionFile(deleting.session, deleting.fs, deleting.store)).file); h.refresh();
    expect(body.value).toBe('残しておく未適用の入力'); expect(body.readOnly).toBe(true); expect(button('変更を適用', editor).disabled).toBe(true);
    expect(all(editor).some(n => n.textContent.includes('この記録は削除されたか'))).toBe(true);
    await editing.session.edit((await editing.session.read()).source!.token, { kind: 'editCaption', captionId, edits: { body: '同時に届く追記' } });
    await host.workspaceFiles.receive(host.read().source!.token, (await contributionFile(editing.session, editing.fs, editing.store)).file); h.refresh();
    expect(body.value).toBe('残しておく未適用の入力'); expect(all(named('記録の状態', editor)).some(n => n.textContent.includes('削除と編集が競合'))).toBe(true);
    button('取り消す', named('キャプションの詳細', editor)).fire('click'); button('変更を取り消す', editor).fire('click');
    expect(body.value).toBe(''); expect(h.ui.hasChanges()).toBe(false); await h.ui.dispose();
  });
  it('changes product pin parents explicitly with position-preserving preview, target-only surface input, exact retry and cold reopen', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, named, button, edited, all } = h, captionId = h.f.f.captionId;
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click'); expect(button('位置を調整', editor).disabled).toBe(true);
    const destination = named('変更先モデル', editor), first = host.authority.read().modelVersions![0]!;
    expect(destination.value).toBe(''); expect(button('位置を確認', editor).disabled).toBe(true);
    const choose = (assetId: string) => { destination.fire('focus'); destination.value = assetId; destination.fire('change'); button('位置を確認', editor).fire('click'); };
    choose(first.assetId); expect(h.display()!.preview).toEqual([0, 0, 0]); await edited(() => button('親モデルと位置を確定', editor).fire('click'));
    const secondId = `ast_${newId()}`, bytes = glb(); await host.authority.addModelFile!(host.read().source!.token, { sceneId: Object.keys(host.authority.read().state.scenes)[0]!, assetId: secondId,
      file: { name: '変更先', size: bytes.length, arrayBuffer: async () => bytes.slice().buffer } });
    const second = host.authority.read().modelVersions!.find(v => v.assetId === secondId)!;
    await host.authority.transformModel!(host.read().source!.token, { sceneId: Object.keys(host.authority.read().state.scenes)[0]!, assetId: secondId, expectedBindingId: second.projection.bindingId,
      bindingId: `bnd_${newId()}`, placement: { translation: [4, 2, 0], rotationXYZW: degreesRotation(['0', '0', '90']), uniformScale: 2 } }); h.refresh();
    const beforePreview = host.read().source!; choose(secondId);
    expect(h.display()!.preview![0]).toBeCloseTo(0, 10); expect(h.display()!.preview![1]).toBeCloseTo(0, 10);
    expect(all(named('ピンの操作', editor)).some(n => n.textContent.includes('モデルがないシーンでは一覧のみ'))).toBe(true);
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true); button('取り消す', named('ピンの操作', editor)).fire('click'); expect(host.read().source!.token).toBe(beforePreview.token);
    const canvas = named('3Dモデルの表示', editor), pointer = { pointerId: 8, isPrimary: true, button: 0, clientX: 50, clientY: 60 };
    choose(secondId); button('面で位置を指定', editor).fire('click'); canvas.fire('pointerdown', pointer); button('取り消す', named('ピンの操作', editor)).fire('click');
    choose(secondId); button('面で位置を指定', editor).fire('click'); const picks = h.pick.mock.calls.length; canvas.fire('pointerup', pointer); await Promise.resolve(); expect(h.pick).toHaveBeenCalledTimes(picks);
    button('取り消す', named('ピンの操作', editor)).fire('click');
    const firstEdge = Object.values(host.authority.read().state.assetMemberships).find(e => e.resourceId === first.assetId)!;
    await host.dispatch(host.read().source!.token, { kind: 'exclude', resourceKind: 'asset', membershipId: firstEdge.id, eventId: `evt_${newId()}` }); h.refresh();
    const before = host.read().source!, original = host.authority.read();
    const missingSource = vi.spyOn(host.authority, 'read').mockImplementation(() => ({ ...original, modelVersions: original.modelVersions!.filter(v => v.assetId !== first.assetId) })); h.refresh();
    choose(secondId); expect(h.display()!.preview).toBeUndefined(); expect(named('位置 X', editor).parent!.parent!.hidden).toBe(true);
    expect(all(editor).some(n => n.textContent.includes('元の位置を確認できません'))).toBe(true); expect(h.reservePointer.mock.lastCall).toEqual([true]);
    canvas.fire('pointerdown', pointer); canvas.fire('pointerup', pointer); await Promise.resolve(); expect(h.pick.mock.lastCall![0].map(t => t.assetId)).toEqual([secondId]);
    missingSource.mockRestore(); h.refresh();
    button('面で位置を指定', editor).fire('click'); canvas.fire('pointerdown', pointer); canvas.fire('pointerup', pointer); await Promise.resolve();
    const x = named('位置 X', editor); x.fire('compositionstart'); x.value = '0.9'; x.fire('input');
    expect(h.proposePin(h.display()!.pinEdit!.target, [9, 9, 9])).toBe(false); expect(x.value).toBe('0.9'); expect(button('親モデルと位置を確定', editor).disabled).toBe(true); x.fire('compositionend');
    expect(h.proposePin(h.display()!.pinEdit!.target, [0.75, 0.5, 0])).toBe(true);
    h.dragging(true); expect(button('親モデルと位置を確定', editor).disabled).toBe(true); h.dragging(false);
    h.f.fs.reject = path => path.endsWith('/published.json'); button('親モデルと位置を確定', editor).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 }); await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    expect(host.read().source!.token).toBe(before.token); expect(named('位置 X', editor).value).toBe('0.75');
    h.f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click'));
    const current = host.authority.read(), changed = current.resources.captions[captionId]!;
    expect(changed.anchor).toMatchObject({ value: { assetId: secondId, positionAsset: [0.75, 0.5, 0] } }); expect(current.state.captionMemberships).toEqual(original.state.captionMemberships);
    expect(current.resources.captions[captionId]).toEqual({ ...original.resources.captions[captionId], anchor: changed.anchor }); expect(current.mediaData).toEqual(original.mediaData);
    await host.dispatch(host.read().source!.token, { kind: 'include', sceneId: Object.keys(current.state.scenes)[0]!, resourceKind: 'asset', resourceId: first.assetId,
      membershipId: `sam_${newId()}`, orderKey: 'C', eventId: `evt_${newId()}` }); h.refresh();
    destination.fire('focus'); await host.dispatch(host.read().source!.token, { kind: 'editCaption', captionId, edits: { body: '新しい内容' } }); h.refresh();
    destination.value = first.assetId; destination.fire('change'); expect(destination.value).toBe('');
    choose(first.assetId); const stale = named('位置 X', editor).value; await host.dispatch(host.read().source!.token, { kind: 'editCaption', captionId, edits: { body: '仮配置中の更新' } }); h.refresh();
    expect(button('親モデルと位置を確定', editor).disabled).toBe(true); expect(named('位置 X', editor).value).toBe(stale); button('取り消す', named('ピンの操作', editor)).fire('click');
    const final = host.read().source!, output = await host.workspaceOutput.download(await host.workspaceOutput.generate(final.token)); await h.ui.dispose();
    const cold = await openValidationHost(h.f.options); expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges()); expect(cold.authority.read().resources.captions[captionId]!.anchor).toEqual(changed.anchor); await cold.dispose();
    const peer = firstWorkspaceRecipient(); expect((await peer.receiver.importWorkspace(output)).state).toBe('ready'); expect((await peer.session.read()).source!.originalChanges()).toEqual(final.originalChanges()); expect(h.legacy).not.toHaveBeenCalled();
  });
  it('compares product Captions in stable Scene-local windows with guarded gestures and one shared image viewer (recorded DOM)', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, all, button, named, edited } = h;
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click');
    button('ピンを追加', editor).fire('click'); const canvas = named('3Dモデルの表示', editor), pointer = { pointerId: 7, button: 0, isPrimary: true, clientX: 80, clientY: 90 };
    canvas.fire('pointerdown', pointer); canvas.fire('pointerup', pointer); await Promise.resolve(); await edited(() => button('位置を確定', editor).fire('click'));
    const title = named('タイトル', editor); title.value = '比較する記録'; title.fire('input'); await edited(() => button('変更を適用', named('キャプションの詳細', editor)).fire('click'));
    const source = host.read().source!, windows = named('キャプションのウィンドウ', editor), cards = () => all(windows).filter(n => n.className === 'lv-caption-window');
    expect(cards()).toHaveLength(2); const a = named('最初の記録', windows), b = named('比較する記録', windows), bClose = button('×', b);
    const body = named('本文', editor), detail = named('キャプションの詳細', editor), scroll = all(a).find(n => n.className === 'lv-caption-window-body')!;
    scroll.scrollTop = 70; body.value = '未適用の本文'; body.fire('input'); body.fire('compositionstart');
    button('最初の記録', a).fire('click'); expect(body.value).toBe('未適用の本文'); expect(title.value).toBe('比較する記録');
    bClose.fire('click'); expect(cards()).toEqual([a]); expect(body.value).toBe('未適用の本文');
    button('ウィンドウを表示', detail).fire('click'); expect(cards()).toHaveLength(2); expect(body.value).toBe('未適用の本文');
    button('×', named('比較する記録', windows)).fire('click');
    named('キャプション一覧', editor).children.find(row => all(row).some(n => n.textContent === '比較する記録'))!.children[0]!.fire('click');
    expect(cards()).toHaveLength(2); expect(body.value).toBe('未適用の本文');
    const handle = named('大きさを変更', a), initial = { ...a.style }, drag = { button: 0, pointerId: 3, clientX: 100, clientY: 100, preventDefault() {} };
    handle.fire('pointerdown', drag); handle.fire('pointermove', { ...drag, clientX: 190 }); handle.fire('pointerup', drag);
    button('ウィンドウを並べる', editor).fire('click'); expect(a.style).toEqual(initial); expect(handle.disabled).toBe(true);
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true); body.fire('compositionend');
    expect(all(a).some(n => n.textContent === '未適用の本文')).toBe(false);
    button('取り消す', detail).fire('click'); button('変更を取り消す', detail).fire('click'); expect(body.value).toBe('');
    await vi.waitFor(() => expect(all(a).filter(n => n.tag === 'img')).toHaveLength(1)); const image = all(a).find(n => n.tag === 'img')!;
    button('モデル', editor).fire('click'); button('画像を表示', a).fire('click'); const viewer = named('画像ビューア', editor);
    expect(viewer.open).toBe(true); expect(named('メディア', editor).contains(viewer)).toBe(false);
    expect(all(editor).filter(n => n.tag === 'dialog')).toHaveLength(1); expect(all(viewer).some(n => n.textContent.includes('最初の記録'))).toBe(true);
    named('閉じる', viewer).fire('click'); button('キャプション', editor).fire('click');
    handle.fire('keydown', { key: 'ArrowRight', preventDefault() {} }); expect(a.style.width).toBe('300px');
    const beforeDrag = { ...a.style }; handle.fire('pointerdown', drag);
    expect(h.reservePointer).toHaveBeenLastCalledWith(true);
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true); expect(button('閲覧に切り替える').disabled).toBe(true); expect(button('正面', editor).disabled).toBe(true);
    button('正面', editor).fire('click'); expect(h.camera).not.toHaveBeenCalled(); handle.fire('pointermove', { ...drag, clientX: 190, clientY: 150 });
    handle.fire('keydown', { key: 'Escape', preventDefault() {} }); handle.fire('pointerup', drag); expect(a.style).toEqual(beforeDrag);
    expect(h.reservePointer).toHaveBeenLastCalledWith(false);
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(false);
    handle.fire('pointerdown', drag); handle.fire('pointermove', { ...drag, clientX: 140 }); handle.fire('pointerup', drag);
    expect(a.style.width).toBe('340px'); handle.fire('click', { detail: 1 }); expect(a.style.width).toBe('340px');
    expect(all(a)).toContain(image); expect(all(a)).toContain(scroll); expect(scroll.scrollTop).toBe(70);
    handle.fire('pointerdown', drag); handle.fire('pointermove', { ...drag, clientX: 200 }); h.extent({ left: 10, top: 20, width: 520, height: 350 });
    expect(a.style.width).toBe('340px'); expect(button('ファイルに保存', named('ファイル')).disabled).toBe(false);
    expect(h.reservePointer).toHaveBeenLastCalledWith(false);
    handle.fire('pointerup', drag); h.extent({ left: 10, top: 20, width: 600, height: 400 }); expect(a.style.width).toBe('340px');
    expect(host.read().source!.originalChanges()).toEqual(source.originalChanges());
    const oldScene = Object.values(host.authority.read().state.scenes)[0]!, oldName = oldScene.name.kind === 'value' ? oldScene.name.value : '';
    const sceneName = named('シーン名', editor); sceneName.value = '比較用の別シーン'; sceneName.fire('input');
    await edited(() => button('シーンを追加', editor).parent!.fire('submit', { preventDefault() {} })); expect(cards()).toHaveLength(0);
    button(oldName, named('シーン', editor)).fire('click'); expect(cards()).toHaveLength(2); expect(named('最初の記録', windows).style.width).toBe('340px');
    const final = host.read().source!; await h.ui.dispose(); const cold = await openValidationHost(h.f.options);
    expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges()); await cold.dispose(); expect(h.legacy).not.toHaveBeenCalled();
  });
  it('rejects same-token stale product projections for comparison lines without losing window content', async () => {
    const h = await productWorkspaceFixture(true), { editor, named, button, all, host, edited } = h;
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click');
    const target = named('変更先モデル', editor); target.fire('focus'); target.value = host.authority.read().modelVersions![0]!.assetId; target.fire('change'); button('位置を確認', editor).fire('click');
    await edited(() => button('親モデルと位置を確定', editor).fire('click'));
    h.pinPoint({ x: 500, y: 300 });
    const windows = named('キャプションのウィンドウ', editor), card = named('最初の記録', windows), line = all(windows).find(n => n.className === 'lv-caption-window-line')!;
    expect(line.hidden).toBe(false); const token = host.read().source!.token;
    button('モデル', editor).fire('click'); named('プロジェクトのモデル一覧', editor).children[0]!.children[0]!.fire('click');
    const hide = button('隠す', editor); expect(hide.disabled).toBe(false);
    h.holdFrame(true); hide.fire('click'); expect(h.display()!.hiddenAssetIds).toHaveLength(1);
    expect(host.read().source!.token).toBe(token); expect(line.hidden).toBe(true); expect(all(windows)).toContain(card);
    h.holdFrame(false); expect(line.hidden).toBe(true); button('表示', editor).fire('click'); expect(line.hidden).toBe(false);
    h.pinPoint({ x: Number.NaN, y: 300 }); expect(line.hidden).toBe(true); h.pinPoint({ x: 500, y: 300 }); expect(line.hidden).toBe(false);
    h.setIssue('描画の再開が必要です。'); named('検索', editor).fire('input'); expect(line.hidden).toBe(true);
    expect(windows.contains(button('3D表示を再試行', editor))).toBe(false); expect(named('3Dモデルの表示', editor).parent!.contains(button('3D表示を再試行', editor))).toBe(false);
    button('3D表示を再試行', editor).fire('click'); expect(h.retryViewport).toHaveBeenCalledTimes(1); expect(all(windows)).toContain(card);
    await h.ui.dispose();
  });
  it('connects the product model panel through local visibility, placement retry, GLB add/replace and cold reopen (injected viewport)', async () => {
    const h = await productWorkspaceFixture(true), { host, button, named, editor, edited, all } = h;
    button('モデル', editor).fire('click'); const panel = named('モデルの作業', editor), rows = named('プロジェクトのモデル一覧', panel);
    rows.children[0]!.children[0]!.fire('click'); const initial = host.authority.read().modelVersions![0]!, assetId = initial.assetId;
    const beforeLocal = host.read().source!.token;
    button('隠す', panel).fire('click'); expect(h.display()!.hiddenAssetIds).toEqual([assetId]);
    button('表示', panel).fire('click'); expect(h.display()!.hiddenAssetIds).toEqual([]); expect(host.read().source!.token).toBe(beforeLocal);
    button('配置を調整', panel).fire('click'); const x = named('モデル位置 X', panel); x.value = '2.5'; x.fire('input');
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true);
    x.fire('compositionstart'); const target = h.display()!.modelEdit!.target;
    expect(h.proposeModel(target, [9, 0, 0])).toBe(false); x.fire('compositionend');
    expect(h.display()!.modelEdit!.position).toEqual([2.5, 0, 0]);
    h.f.fs.reject = path => path.endsWith('/published.json'); button('配置を確定', panel).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 });
    await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    expect(x.value).toBe('2.5'); const changes = host.read().source!.originalChanges().length;
    h.f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click'));
    const moved = host.authority.read().modelVersions!.find(v => v.assetId === assetId)!;
    expect(moved.closure.binding.assetToProject.translation).toEqual([2.5, 0, 0]);
    expect(moved.closure.binding.assetToProject.rotationXYZW).toEqual(initial.closure.binding.assetToProject.rotationXYZW);
    expect(host.read().source!.originalChanges()).toHaveLength(changes + 1);
    button('配置を調整', panel).fire('click'); button('配置を確定', panel).fire('click'); expect(host.read().source!.originalChanges()).toHaveLength(changes + 1);
    const file = (label: string) => { const input = named(label, panel); Object.assign(input, { files: [Object.assign(new Blob([glb().slice().buffer]), { name: 'triangle.glb' })] }); return input; };
    button('モデルを差し替える', panel).fire('click'); const replacement = file('モデルを差し替える'); replacement.fire('change');
    expect(all(panel).some(n => n.textContent.includes('材質の調整は引き継ぎません'))).toBe(true);
    await edited(() => button('差し替えを確定', panel).fire('click'));
    expect(host.authority.read().modelVersions!.find(v => v.assetId === assetId)!.closure.binding.assetToProject.translation).toEqual([2.5, 0, 0]);
    button('3Dモデルを追加', panel).fire('click'); const add = file('3Dモデルを追加'); await edited(() => add.fire('change'));
    expect(h.display()!.models).toHaveLength(2); expect(h.legacy).not.toHaveBeenCalled();
    const source = host.read().source!, workspace = await host.workspaceOutput.download(await host.workspaceOutput.generate(source.token));
    await h.ui.dispose(); const cold = await openValidationHost(h.f.options);
    expect(cold.read().source!.originalChanges()).toEqual(source.originalChanges()); expect(cold.authority.read().modelVersions).toHaveLength(2);
    const peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(workspace); expect((await peer.session.read()).source!.token).toBe(source.token);
    await cold.dispose();
  });
  it('preserves Caption drafts and model search IME, and resolves duplicate models as independent copies through product commands', async () => {
    const h = await productWorkspaceFixture(true, true, false, 'map2'), { button, named, editor, host, all, edited } = h;
    all(editor).find(n => n.className === 'lv-project-marker')!.fire('click');
    const body = named('本文', editor); body.value = '未適用の記録'; body.fire('input'); button('モデル', editor).fire('click');
    const panel = named('モデルの作業', editor); expect(button('3Dモデルを追加', panel).disabled).toBe(true);
    button('キャプション', editor).fire('click'); expect(body.value).toBe('未適用の記録'); await edited(() => button('変更を適用', editor).fire('click'));
    button('モデル', editor).fire('click');
    named('プロジェクトのモデル一覧', panel).children[0]!.children[0]!.fire('click');
    const size = named('ピンの表示倍率', panel); size.fire('focus'); size.value = '2'; size.fire('input');
    const beforeSize = host.read().source!.token, calls = h.dispatch.mock.calls.length;
    expect(named('重複するモデル', panel).disabled).toBe(true); expect(named('残すモデル登録', panel).disabled).toBe(true);
    button('選択を確定', panel).fire('click'); expect(h.dispatch).toHaveBeenCalledTimes(calls); expect(host.read().source!.token).toBe(beforeSize); expect(size.value).toBe('2');
    button('倍率の変更を取り消す', panel).fire('click');
    let decision = named('重複するモデル', panel); decision.value = 'both'; decision.fire('change');
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true);
    button('選択を取り消す', named('モデルの更新候補', panel)).fire('click');
    expect(named('重複するモデル', panel).value).toBe('one'); expect(button('ファイルに保存', named('ファイル')).disabled).toBe(false);
    decision = named('重複するモデル', panel); decision.value = 'both'; decision.fire('change');
    const keep = named('残すモデル登録', panel); keep.value = keep.children[1]!.value; keep.fire('change');
    const search = named('検索', panel);
    search.fire('compositionstart'); expect(button('選択を確定', panel).disabled).toBe(true); search.fire('compositionend');
    await edited(() => button('選択を確定', panel).fire('click'));
    expect(host.authority.read().modelVersions).toHaveLength(2); const command = h.dispatch.mock.calls.map(c => c[1]).find(c => c.kind === 'resolveAssetMembership')!;
    expect(command).toMatchObject({ choice: 'both', copies: [expect.anything()] });
    const ids = host.authority.read().modelVersions!.map(v => v.assetId); expect(new Set(ids).size).toBe(2); expect(h.legacy).not.toHaveBeenCalled(); await h.ui.dispose();
  });
  it('connects product Saved Views and material scope to exact capture, typed writes and file reopen (injected viewport)', async () => {
    const h = await productWorkspaceFixture(true), { host, button, named, editor, edited, all } = h;
    button('保存した視点', editor).fire('click'); const views = named('視点の作業', editor), author = named('視点の作成と管理', views), background = named('3D背景', views);
    const captured = h.payload(); button('視点を作る', author).fire('click'); const name = named('視点の名称', author); name.value = '正確な視点'; name.fire('input');
    expect(named('背景色', background).readOnly).toBe(true);
    await edited(() => button('視点を追加', author).fire('click'));
    const command = h.dispatch.mock.calls.map(c => c[1]).find(c => c.kind === 'createView')!; if (command.kind !== 'createView') throw Error('view');
    expect(command.camera).toEqual(captured.camera); expect(command.background).toEqual(captured.background);
    const entry = named('シーンを開いたときの視点', views); entry.value = command.viewId; entry.fire('change');
    expect(h.recall).not.toHaveBeenCalled(); await edited(() => button('設定を適用', views).fire('click')); expect(h.recall).not.toHaveBeenCalled();
    const color = named('背景色', background); color.value = '#123456'; color.fire('input'); button('背景に適用', background).fire('click'); expect(h.background).toHaveBeenCalledTimes(1);
    const token = host.read().source!.token; button('表示', views).fire('click'); expect(h.recall).toHaveBeenCalledTimes(1); expect(h.payload()).toEqual(captured); expect(host.read().source!.token).toBe(token);
    button('材質', editor).fire('click'); const materials = named('材質の作業', editor);
    const model = named('モデル', materials); model.value = host.authority.read().modelVersions![0]!.assetId; model.fire('change');
    const surface = named('面', materials); surface.value = surface.children.find(n => n.value !== '')!.value; surface.fire('change');
    button('設定を編集', materials).fire('click'); const lighting = named('照明', materials); lighting.value = 'unlit'; lighting.fire('change');
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true); await edited(() => button('変更を適用', materials).fire('click'));
    const material = h.dispatch.mock.calls.map(c => c[1]).find(c => c.kind === 'createMaterial')!; if (material.kind !== 'createMaterial') throw Error('material');
    expect(material.routing.scope).toEqual({ kind: 'scene', sceneId: command.sceneId }); expect(material.appearance.lighting).toBe('unlit');
    const scope = named('適用範囲', materials); scope.value = 'project'; scope.fire('change'); button('設定を編集', materials).fire('click');
    named('照明', materials).value = 'lit'; named('照明', materials).fire('change'); await edited(() => button('変更を適用', materials).fire('click'));
    expect(h.dispatch.mock.calls.some(c => c[1].kind === 'createMaterial' && (c[1].routing.scope as JsonObject).kind === 'project')).toBe(true);
    const target = material.routing.target as JsonObject, effects = h.display()!.savedMaterials![target.assetId as string]!;
    expect(effects[target.logicalMaterialSlotId as string]).toMatchObject({ appearance: { lighting: 'unlit' } });
    scope.value = 'scene'; scope.fire('change'); button('この範囲の設定を解除', materials).fire('click');
    await edited(() => button('設定を解除する', materials).fire('click'));
    expect(h.display()!.savedMaterials![target.assetId as string]![target.logicalMaterialSlotId as string]).toMatchObject({ appearance: { lighting: 'lit' } });
    expect(h.legacy).not.toHaveBeenCalled(); const source = host.read().source!, blob = await host.workspaceOutput.download(await host.workspaceOutput.generate(source.token));
    await h.ui.dispose(); const peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(blob);
    const reopened = (await peer.session.read()).source!; expect(reopened.originalChanges()).toEqual(source.originalChanges());
    const cold = await openValidationHost(h.f.options); expect(cold.read().source!.originalChanges()).toEqual(source.originalChanges()); await cold.dispose();
    expect(all(editor).length).toBeGreaterThan(0);
  });
  it('keeps every material owner conflict and exact View candidates in the product read adapter', async () => {
    const h = await productWorkspaceFixture(), seed = h.host.read().source!, snapshot = h.host.authority.read(), model = snapshot.modelVersions![0]!;
    if (model.closure.shape !== 'saved-glb') throw Error('saved GLB');
    const sceneId = Object.keys(snapshot.state.scenes)[0]!, target = validationMaterialSlots(model.closure)[0]!.target;
    const ids = [`ovr_${'1'.repeat(32)}`, `ovr_${'2'.repeat(32)}`], viewId = `view_${newId()}`, active = { state: 'active', eventId: `evt_${newId()}`, reason: 'initial' };
    const base = A.change(A.load<Record<string, any>>(seed.encodeFullSource()), doc => {
      ids.forEach(id => { doc.materialOverridesById[id] = Object.fromEntries(Object.entries({ id, routing: { target, scope: { kind: 'scene', sceneId } },
        appearance: { lighting: 'unlit' }, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' }, lifecycle: active }).map(([key, value]) => [key, new A.ImmutableString(canonicalFixture(value))])); });
      doc.viewsById[viewId] = Object.fromEntries(Object.entries({ id: viewId, sceneId, projectFrameId: snapshot.resources.projectFrameId, name: '比較する視点', orderKey: 'A', lifecycle: active,
        camera: h.payload().camera, background: h.payload().background }).map(([key, value]) => [key, new A.ImmutableString(canonicalFixture(value))]));
    });
    const branches = ['lit', 'inherit'].map(lighting => A.change(A.clone(base), doc => {
      doc.materialOverridesById[ids[1]!].appearance = new A.ImmutableString(canonicalFixture({ lighting }));
      doc.viewsById[viewId].name = new A.ImmutableString(canonicalFixture(`視点 ${lighting}`));
    }));
    const source = ProjectMetadataSource.fromFullSource(A.save(A.merge(branches[0]!, branches[1]!)), seed.proof, metadata);
    const provider = await readProjectScene(source.read(), metadata, h.host.content.verifier(false));
    const projected = metadataProjectView(provider, {}, snapshot.modelVersions);
    const facade = createValidationModeHost({ ...h.host, read: () => ({ ...h.host.read(), provider, source }), authority: { ...h.host.authority, read: () => projected } }, async () => { throw Error('read only fixture'); }, () => {});
    const ports = productSources(facade), groups = ports.materials(sceneId).review;
    expect(groups.some(g => g.overrideId === ids[1] && g.appearance.length === 2)).toBe(true);
    expect(groups.filter(g => g.owners.length === 2)).toHaveLength(1);
    expect(groups.flatMap(g => g.owners).every(o => o.label.includes('内容の競合') || o.label.includes('照明'))).toBe(true);
    const views = ports.viewReview(sceneId); expect(views).toHaveLength(1); expect(views[0]!.choices.map(c => c.label).sort()).toEqual(['視点 inherit', '視点 lit']);
    expect(views[0]!.target).toEqual({ kind: 'view', viewId, field: 'name' }); expect(h.host.read().source!.token).toBe(seed.token); await h.ui.dispose();
  });
  it('connects the product composition through typed edits, pin/media, named backup, two file rounds and cold reopen (injected viewport)', async () => {
    const { f, host, ui, editor, root, all, named, button, edited, status, downloads, legacy, dispatch, pick, moveCamera, display } = await productWorkspaceFixture();
    const initialCaptionIds = new Set(Object.keys(host.authority.read().resources.captions));
    expect(named('プロジェクト名', editor).textContent).toBe('統合画面の検証');
    expect(named('再開データの状態', editor).textContent).toBe('このブラウザに再開用データがあります。');
    expect(named('保存ファイルの状態', editor).textContent).toContain('未確認');
    const initialSceneCount = Object.keys(host.authority.read().state.scenes).length;
    button('ピンを追加', editor).fire('click'); const canvas = named('3Dモデルの表示', editor);
    const down = { pointerId: 7, button: 0, isPrimary: true, clientX: 80, clientY: 90 };
    canvas.fire('pointerdown', down); moveCamera(); canvas.fire('pointerup', down); await Promise.resolve(); expect(pick).not.toHaveBeenCalled();
    canvas.fire('pointerdown', down); canvas.fire('pointermove', { ...down, clientX: 100 }); canvas.fire('pointermove', down); canvas.fire('pointerup', down); await Promise.resolve(); expect(pick).not.toHaveBeenCalled();
    canvas.fire('pointerdown', down); canvas.fire('lostpointercapture', down); canvas.fire('pointerup', down); await Promise.resolve(); expect(pick).not.toHaveBeenCalled();
    canvas.fire('pointerdown', down); canvas.fire('pointerup', down); await Promise.resolve();
    expect(pick).toHaveBeenCalledWith(expect.anything(), 70, 70);
    await edited(() => button('位置を確定', editor).fire('click'));
    const captionId = Object.keys(host.authority.read().resources.captions).find(id => !initialCaptionIds.has(id))!;
    expect(captionId).toBeTruthy();
    const title = named('タイトル', editor), body = named('本文', editor), output = named('ファイル');
    title.fire('compositionstart'); title.value = '新しい記録'; title.fire('input');
    expect(button('ファイルに保存', output).disabled).toBe(true);
    title.fire('compositionend'); body.value = '最初の本文'; body.fire('input');
    const beforeHelp = host.read().source!.token, cameraBeforeHelp = display()!.token;
    Object.assign(named('ヘルプ', editor), { open: true });
    expect(body.value).toBe('最初の本文'); expect(host.read().source!.token).toBe(beforeHelp); expect(display()!.token).toBe(cameraBeforeHelp);
    expect(named('再開データの状態', editor).textContent).toBe('入力中の内容はまだ確定していません。');
    const search = named('検索', editor); search.value = '見つからない語'; search.fire('input');
    button('選択した項目を表示', editor).fire('click'); expect(body.value).toBe('最初の本文');
    expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '' });
    f.fs.reject = path => path.endsWith('/published.json');
    const apply = button('変更を適用', editor), beforeChanges = host.read().source!.originalChanges().length;
    apply.fire('click'); apply.fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 });
    await vi.waitFor(() => expect(status.dataset.busy).toBe('false'));
    expect(body.value).toBe('最初の本文'); expect(title.value).toBe('新しい記録');
    const retained = (await f.fs.list(`${validationArea}/${f.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(retained.map(p => f.fs.readBytes(p)));
    f.fs.reject = () => false; await edited(() => button('更新を再試行', editor).fire('click'));
    expect(host.read().source!.originalChanges()).toHaveLength(beforeChanges + 1);
    expect(await Promise.all(retained.map(p => f.fs.readBytes(p)))).toEqual(originals);
    expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '最初の本文' });
    const colors = named('ピンの色', editor), colorButton = all(colors).find(n => n.tag === 'button' && n.attributes.get('aria-pressed') === 'true')!;
    colorButton.fire('click'); expect(display()!.pins.some(p => p.id === captionId)).toBe(false);
    button('全色', colors).fire('click'); expect(display()!.pins.some(p => p.id === captionId)).toBe(true);
    const mediaInput = named('メディアを追加', editor); mediaInput.fire('click');
    Object.assign(mediaInput, { files: [Object.assign(new Blob([png.slice().buffer]), { name: '確認画像.png' })] });
    await edited(() => mediaInput.fire('change'));
    expect(captionAttachments(host.authority.read().mediaData, captionId).ready).toHaveLength(1);
    const firstScene = host.authority.read().state.defaultSceneId; if (firstScene.kind !== 'value') throw Error('scene');
    const firstName = host.authority.read().state.scenes[firstScene.value]!.name; if (firstName.kind !== 'value') throw Error('name');
    const sceneName = named('シーン名', editor); sceneName.value = '二つ目のシーン'; sceneName.fire('input');
    await edited(() => all(editor).find(n => n.tag === 'form' && all(n).includes(sceneName))!.fire('submit', { preventDefault() {} }));
    expect(Object.keys(host.authority.read().state.scenes)).toHaveLength(initialSceneCount + 1);
    button(firstName.value, named('シーン', editor)).fire('click');
    const selectedPin = all(editor).find(n => n.tag === 'button' && n.className === 'lv-project-marker' && n.textContent === '新しい記録')!;
    selectedPin.fire('click');
    const name = named('名前（任意）', output); name.value = '作業の保存'; name.fire('input');
    button('ファイルに保存', output).fire('click'); await vi.waitFor(() => expect(downloads).toHaveBeenCalledTimes(1), { timeout: 10000 });
    const backup = host.workspaceOutput.jobs.find(j => j.purpose === 'backup')!;
    expect((await BackupArchive.inspect(await host.workspaceOutput.download(backup.id), metadata)).source.originalChanges()).toEqual(host.read().source!.originalChanges());
    await vi.waitFor(() => expect(output.children.find(n => n.attributes.get('role') === 'status')!.dataset.busy).toBe('false'));
    expect(named('保存ファイルの状態', editor).textContent).toContain('未確認');
    button('ファイルを選択', output).fire('click');
    const verify = named('保存先のファイルを選択', output); Object.assign(verify, { files: [await host.workspaceOutput.download(backup.id)] }); verify.fire('change');
    await vi.waitFor(() => expect(named('保存ファイルの状態', editor).textContent).toContain('一致しています'), { timeout: 10000 });
    const verifiedToken = host.read().source!.token;
    button('相手に渡す', output).fire('click'); button('ダウンロード', output).fire('click');
    await vi.waitFor(() => expect(downloads).toHaveBeenCalledTimes(2), { timeout: 10000 });
    const workspaceJob = host.workspaceOutput.jobs.find(j => j.purpose === 'teamWorkspace')!;
    expect(host.read().source!.token).toBe(verifiedToken); expect(host.workspaceOutput.jobs.find(j => j.id === backup.id)!.stale).toBe(true);
    expect(named('保存ファイルの状態', editor).textContent).toContain('未確認');
    const workspaceFile = await host.workspaceOutput.download(workspaceJob.id), peer = firstWorkspaceRecipient();
    const sharedBaseId = (await WorkspaceArchive.inspect(workspaceFile, metadata)).archive.control.manifest.packageId;
    await peer.receiver.importWorkspace(workspaceFile);
    const token = (await peer.session.read()).source!.token;
    await peer.session.edit(token, { kind: 'editCaption', captionId, edits: { body: '相手の本文1' } });
    const peerSender = new WorkspaceSender(peer.fs, peer.session, peer.store, metadata, peer.locks);
    const returned = async () => {
      const current = (await peer.session.read()).source!, base = (await peerSender.availableBases()).find(b => b.selection.workspacePackageId === sharedBaseId)!.selection;
      return peerSender.download(await peerSender.generateContribution(current.token, base));
    };
    const receive = async (file: Blob) => {
      const input = named('更新ファイルを選択'); Object.assign(input, { files: [file] }); input.fire('change');
      await edited(() => input.parent!.parent!.fire('submit', { preventDefault() {} }));
      await vi.waitFor(() => expect(all(root).some(n => n.textContent === '更新を受け取りました。')).toBe(true), { timeout: 10000 });
      Object.assign(input, { files: [] }); input.fire('change');
    };
    await receive(await returned());
    expect(named('本文', editor).value).toBe('相手の本文1');
    const nextTitle = named('タイトル', editor); nextTitle.value = '送り手の追記'; nextTitle.fire('input'); await edited(() => button('変更を適用', editor).fire('click'));
    button('相手に渡す', output).fire('click'); const kind = named('渡す内容', output); kind.value = 'contribution'; kind.fire('change');
    const base = named('元にする作業一式', output); base.value = sharedBaseId; base.fire('change');
    button('ダウンロード', output).fire('click'); await vi.waitFor(() => expect(downloads).toHaveBeenCalledTimes(3), { timeout: 10000 });
    const contribution = host.workspaceOutput.jobs.find(j => j.purpose === 'contribution')!;
    await peer.receiver.receive((await peer.session.read()).source!.token, await host.workspaceOutput.download(contribution.id));
    await peer.session.edit((await peer.session.read()).source!.token, { kind: 'editCaption', captionId, edits: { body: '相手の本文2' } });
    await receive(await returned());
    expect(named('本文', editor).value).toBe('相手の本文2'); expect(named('タイトル', editor).value).toBe('送り手の追記');
    const exact = host.read().source!.originalChanges(); expect(legacy).not.toHaveBeenCalled(); expect(dispatch).toHaveBeenCalled(); await ui.dispose();
    const cold = await openValidationHost(f.options);
    expect(cold.read().source!.originalChanges()).toEqual(exact); expect(cold.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '相手の本文2' });
    expect(captionAttachments(cold.authority.read().mediaData, captionId).ready).toHaveLength(1); await cold.dispose();
  });
  it('keeps product composition inputs through rejected edits and published display failure, with exact retry and renderer recovery (injected viewport)', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, named, button, status, edited } = h;
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click');
    const body = named('本文', editor); body.value = '未適用の入力'; body.fire('input');
    h.dispatch.mockRejectedValueOnce(Error('injected admission rejection'));
    button('変更を適用', editor).fire('click');
    await vi.waitFor(() => expect(status.dataset.busy).toBe('false'));
    expect(host.authority.status!().kind).toBe('idle'); expect(body.readOnly).toBe(true);
    expect(button('入力を修正する', editor).hidden).toBe(false);
    button('入力を修正する', editor).fire('click'); expect(body.value).toBe('未適用の入力'); expect(body.readOnly).toBe(false);
    body.value = '修正した入力'; body.fire('input'); await edited(() => button('変更を適用', editor).fire('click'));
    const parent = named('変更先モデル', editor); parent.fire('focus'); parent.value = host.authority.read().modelVersions![0]!.assetId; parent.fire('change'); button('位置を確認', editor).fire('click');
    button('面で位置を指定', editor).fire('click');
    const canvas = named('3Dモデルの表示', editor), pointer = { pointerId: 1, isPrimary: true, button: 0, clientX: 40, clientY: 50 };
    canvas.fire('pointerdown', pointer); canvas.fire('pointerup', pointer); await Promise.resolve();
    const x = named('位置 X', editor); x.value = '0.375'; x.fire('input');
    const prepare = vi.fn().mockRejectedValueOnce(Error('injected post-publication display failure')).mockResolvedValue(undefined);
    const detach = host.setDisplayPreparation(prepare), before = host.read().source!.token;
    button('親モデルと位置を確定', editor).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 });
    await vi.waitFor(() => expect(status.dataset.busy).toBe('false'));
    expect(host.read().source!.token).not.toBe(before); expect(h.display()!.token).toBe(before);
    expect(x.value).toBe('0.375'); expect(x.disabled).toBe(true); expect(button('取り消す', named('ピンの操作', editor)).disabled).toBe(true);
    expect(button('入力を修正する', editor).hidden).toBe(true);
    const original = host.read().source!.originalChanges(); button('更新を再試行', editor).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('idle'), { timeout: 10000 });
    await vi.waitFor(() => expect(status.dataset.busy).toBe('false'));
    expect(host.read().source!.originalChanges()).toEqual(original); expect(h.display()!.token).toBe(host.read().source!.token);
    expect(prepare).toHaveBeenCalledTimes(2); detach();
    h.setIssue('表示を再開してください。'); named('検索', editor).fire('input');
    expect(h.all(editor).some(n => n.textContent?.includes('表示を再開してください。'))).toBe(true);
    expect(h.all(editor).some(n => n.textContent?.includes('検証用の表示通知'))).toBe(true);
    h.retryViewport.mockImplementationOnce(() => { throw Error('描画環境の復旧を待って再試行してください。'); });
    expect(() => button('3D表示を再試行', editor).fire('click')).not.toThrow();
    expect(h.all(editor).some(n => n.textContent?.includes('描画環境の復旧を待って'))).toBe(true);
    button('3D表示を再試行', editor).fire('click'); expect(h.retryViewport).toHaveBeenCalledTimes(2);
    expect(button('3D表示を再試行', editor).hidden).toBe(true);
    h.camera.mockImplementationOnce(() => { throw Error('表示するモデルがありません。'); });
    expect(() => button('正面', editor).fire('click')).not.toThrow();
    expect(h.all(editor).some(n => n.textContent?.includes('表示するモデルがありません。'))).toBe(true); await h.ui.dispose();
  });
  it('resolves product composition conflicts only after explicit choice and reports image display failure without stale callbacks (recorded DOM)', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, named, button, edited } = h, captionId = h.f.f.captionId;
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click');
    const peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(h.f.f.file!);
    const body = named('本文', editor); body.value = '手元で残したい内容'; body.fire('input');
    await edited(() => button('変更を適用', editor).fire('click'));
    await peer.session.edit((await peer.session.read()).source!.token, { kind: 'editCaption', captionId, edits: { body: '相手からの内容' } });
    const input = named('更新ファイルを選択'); Object.assign(input, { files: [(await contributionFile(peer.session, peer.fs, peer.store)).file] }); input.fire('change');
    await edited(() => input.parent!.parent!.fire('submit', { preventDefault() {} }));
    await vi.waitFor(() => expect(h.all(h.root).some(n => n.textContent === '更新を受け取りました。')).toBe(true), { timeout: 10000 });
    Object.assign(input, { files: [] }); input.fire('change');
    expect(host.authority.read().resources.captions[captionId]!.body.kind).toBe('unresolved'); expect(body.readOnly).toBe(true);
    const area = named('記録の競合', editor), select = h.all(area).find(n => n.tag === 'select')!;
    const option = select.children.find(n => n.textContent.endsWith('：相手からの内容'))!; select.value = option.value; select.fire('change');
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true);
    named('検索', editor).fire('input'); expect(h.all(area).find(n => n.tag === 'select')!.value).toBe(option.value);
    await edited(() => button('競合を解消', area).fire('click'));
    expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '相手からの内容' });
    const media = named('メディア', editor), gallery = named('添付画像', media), viewer = named('画像ビューア', editor);
    button('画像を表示', gallery).fire('click'); expect(viewer.open).toBe(true);
    const images = () => h.all(viewer).filter(n => n.tag === 'img'); await vi.waitFor(() => expect(images(), h.all(viewer).map(n => n.textContent).join(' ')).toHaveLength(1));
    const old = images()[0]!; old.fire('error'); expect(h.all(viewer).some(n => n.textContent.includes('画像を表示できません'))).toBe(true);
    named('検索', editor).fire('input'); expect(button('画像を再試行', viewer).hidden).toBe(false);
    button('画像を再試行', viewer).fire('click'); await vi.waitFor(() => { expect(images()).toHaveLength(1); expect(images()[0]).not.toBe(old); });
    old.fire('error'); expect(button('画像を再試行', viewer).hidden).toBe(true);
    const failed = images()[0]!; failed.fire('error'); expect(button('画像を再試行', viewer).hidden).toBe(false);
    button('画像を再試行', viewer).fire('click'); await vi.waitFor(() => { expect(images()).toHaveLength(1); expect(images()[0]).not.toBe(failed); });
    failed.fire('load'); images()[0]!.fire('load'); expect(images()[0]!.hidden).toBe(false); expect(button('画像を再試行', viewer).hidden).toBe(true);
    await h.ui.dispose();
  });
  it('organizes reused PNG attachments through product editing, exact retry, comparison, file exchange and last-detachment cold reopen', async () => {
    const h = await productWorkspaceFixture(true), { host, editor, named, button, edited, all } = h, firstCaption = h.f.f.captionId;
    const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const resources = Object.values(provider.details.immutable.mediaResourcesById);
    if (resources[0]?.kind !== 'value') throw Error('media'); const mediaRecord = resources[0].value;
    button('ピンを追加', editor).fire('click'); const canvas = named('3Dモデルの表示', editor), pointer = { pointerId: 8, isPrimary: true, button: 0, clientX: 70, clientY: 80 };
    canvas.fire('pointerdown', pointer); canvas.fire('pointerup', pointer); await Promise.resolve(); await edited(() => button('位置を確定', editor).fire('click'));
    const captionId = Object.keys(host.authority.read().resources.captions).find(id => id !== firstCaption)!;
    const media = named('画像の整理', editor), stored = named('登録済みメディア', media); stored.open = true; stored.fire('toggle');
    for (let i = 0; i < 2; i++) { button('受信画像', named('メディアを選択', media)).fire('click'); await edited(() => button('選択したメディアを添付', media).fire('click')); }
    const rows = () => captionAttachments(host.authority.read().mediaData, captionId).ready;
    const ids = rows().map(r => r.id); expect(new Set(ids).size).toBe(2); expect(rows().every(r => r.mediaResourceId.kind === 'value' && r.mediaResourceId.value === mediaRecord.id)).toBe(true);
    expect(captionAttachments(host.authority.read().mediaData, firstCaption).ready).toHaveLength(1);
    const reused = host.read().provider!; if (reused.kind !== 'scene-provider') throw Error('provider'); expect(Object.keys(reused.details.immutable.mediaResourcesById)).toHaveLength(1);
    const editArea = named('添付の編集', media); button('説明を編集', editArea).fire('click'); const input = named('メディアの説明', media);
    input.fire('compositionstart'); input.value = '位置を比較する画像'; input.fire('input');
    expect(button('ファイルに保存', named('ファイル')).disabled).toBe(true); expect(button('モデル', editor).disabled).toBe(true);
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click'); expect(input.value).toBe('位置を比較する画像');
    expect(button('説明を適用', media).disabled).toBe(true);
    input.fire('compositionend'); const before = host.read().source!.originalChanges().length;
    h.f.fs.reject = path => path.endsWith('/published.json'); button('説明を適用', media).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 }); await vi.waitFor(() => expect(h.status.dataset.busy).toBe('false'));
    expect(input.value).toBe('位置を比較する画像'); const paths = (await h.f.fs.list(`${validationArea}/${h.f.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(paths.map(p => h.f.fs.readBytes(p))); h.f.fs.reject = () => false;
    await edited(() => button('更新を再試行', editor).fire('click')); expect(host.read().source!.originalChanges()).toHaveLength(before + 1);
    expect(await Promise.all(paths.map(p => h.f.fs.readBytes(p)))).toEqual(originals); expect(rows()[0]!.altText).toEqual({ kind: 'value', value: '位置を比較する画像' });
    await edited(() => button('後へ', editArea).fire('click')); expect(rows().map(r => r.id)).toEqual([ids[1], ids[0]]);
    button('説明を編集', editArea).fire('click'); input.value = '未適用の説明'; input.fire('input'); button('画像を表示', named('添付画像', media)).fire('click');
    const viewer = named('画像ビューア', editor); expect(all(editor).filter(n => n.tag === 'dialog')).toHaveLength(1); expect(viewer.open).toBe(true);
    viewer.fire('keydown', { key: 'ArrowRight', preventDefault() {}, stopPropagation() {} }); expect(all(viewer).some(n => n.textContent === '2 / 2')).toBe(true);
    expect(input.value).toBe('未適用の説明'); named('閉じる', viewer).fire('click');
    button('取り消す', named('説明の編集', media)).fire('click');
    button('添付を解除', editArea).fire('click'); expect(rows()).toHaveLength(2); await edited(() => button('添付を解除する', media).fire('click'));
    expect(rows().map(r => r.id)).toEqual([ids[0]]); expect(captionAttachments(host.authority.read().mediaData, firstCaption).ready).toHaveLength(1);
    const peer = firstWorkspaceRecipient(), shared = await host.workspaceOutput.download(await host.workspaceOutput.generate(host.read().source!.token));
    await peer.receiver.importWorkspace(shared); await peer.session.edit((await peer.session.read()).source!.token,
      { kind: 'editAttachment', sceneId: Object.keys(host.authority.read().state.scenes)[0]!, captionId, attachmentId: ids[0]!, field: 'altText', value: '相手の画像説明' });
    const receive = named('更新ファイルを選択'); Object.assign(receive, { files: [(await contributionFile(peer.session, peer.fs, peer.store)).file] }); receive.fire('change');
    await edited(() => receive.parent!.parent!.fire('submit', { preventDefault() {} })); await vi.waitFor(() => expect(all(h.root).some(n => n.textContent === '更新を受け取りました。')).toBe(true), { timeout: 10000 });
    Object.assign(receive, { files: [] }); receive.fire('change'); expect(all(editArea).some(n => n.textContent === '相手の画像説明')).toBe(true);
    button('添付を解除', editArea).fire('click'); await edited(() => button('添付を解除する', media).fire('click')); expect(rows()).toHaveLength(0);
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click'); expect(captionAttachments(host.authority.read().mediaData, firstCaption).ready).toHaveLength(1);
    button('添付を解除', editArea).fire('click'); await edited(() => button('添付を解除する', media).fire('click'));
    expect(captionAttachments(host.authority.read().mediaData, firstCaption).ready).toHaveLength(0); expect(h.imageReads[0]).toHaveBeenCalledTimes(1);
    const final = host.read().source!, output = await host.workspaceOutput.download(await host.workspaceOutput.generate(final.token)); await h.ui.dispose();
    const cold = await openValidationHost(h.f.options); expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges());
    expect(captionAttachments(cold.authority.read().mediaData, captionId).ready).toHaveLength(0); expect(captionAttachments(cold.authority.read().mediaData, firstCaption).ready).toHaveLength(0);
    expect(await cold.content.image(mediaRecord, true)).toEqual(png);
    const emptyOrigin = firstWorkspaceRecipient(), emptyRead = await emptyOrigin.receiver.importWorkspace(output); expect(emptyRead.state).toBe('ready');
    const reopened = firstWorkspaceRecipient(); await reopened.store.put(new Blob([png.slice().buffer]).stream(), 'image/png', mediaRecord.blob as JsonObject);
    const options = { ...h.f.options, base: reopened.fs, store: reopened.store, coordinator: ProjectMutationCoordinator.browser(reopened.locks),
      packageLocks: reopened.locks, openStorage: async () => ({ factory: reopened.factory, dispose: async () => {} }) };
    const recipient = await openValidationHost({ ...options, workspaceFile: output });
    expect(recipient.read().state).toBe('ready'); expect(recipient.read().source!.originalChanges()).toEqual(final.originalChanges());
    expect(recipient.authority.read().mediaChoices).toEqual([]);
    const unavailableProvider = recipient.read().provider!; if (unavailableProvider.kind !== 'scene-provider') throw Error('provider');
    expect(projectMediaResources(unavailableProvider)).toEqual([]);
    expect(recipient.read().provider).toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: 'verified-media-bytes-required' })]) });
    await recipient.dispatch(recipient.read().source!.token, { kind: 'editCaption', captionId, edits: { body: '受け取り先で編集を継続' } });
    const model = glb(j => { j.nodes[0].translation = [2, 0, 0]; });
    await recipient.authority.addModelFile!(recipient.read().source!.token, { sceneId: Object.keys(recipient.authority.read().state.scenes)[0]!,
      assetId: `ast_${newId()}`, file: { name: '追加するモデル', size: model.length, arrayBuffer: async () => model.slice().buffer } });
    await recipient.workspaceOutput.generate(recipient.read().source!.token); const continued = recipient.read().source!; await recipient.dispose();
    const recipientCold = await openValidationHost(options); expect(recipientCold.read().state).toBe('ready');
    expect(recipientCold.read().source!.originalChanges()).toEqual(continued.originalChanges()); await recipientCold.dispose();
    expect(h.legacy).not.toHaveBeenCalled(); await cold.dispose();
  });
  it('reloads the exact PNG from the current image service after product view/edit handoff', async () => {
    const h = await productWorkspaceFixture(true), { editor, named, button, all } = h;
    named('キャプション一覧', editor).children[0]!.children[0]!.fire('click');
    const gallery = named('添付画像', editor); await vi.waitFor(() => expect(all(gallery).filter(n => n.tag === 'img')).toHaveLength(1)); expect(h.imageReads[0]).toHaveBeenCalledTimes(1);
    const card = named('最初の記録', named('キャプションのウィンドウ', editor)), viewer = named('画像ビューア', editor);
    button('画像を表示', card).fire('click'); expect(viewer.open).toBe(true);
    const initial = h.host, token = initial.read().source!.token; button('閲覧に切り替える').fire('click');
    await vi.waitFor(() => expect(button('編集を開始する')?.disabled).toBe(false), { timeout: 10000 });
    await vi.waitFor(() => expect(h.imageReads[1]).toHaveBeenCalledTimes(1)); expect(h.liveHost()).not.toBe(initial); expect(h.liveHost().read().source!.token).toBe(token);
    expect(all(gallery).filter(n => n.tag === 'img')).toHaveLength(1); expect(button('説明を編集', named('画像の整理', editor)).disabled).toBe(true);
    expect(button('プロジェクトから削除', named('キャプションの削除', editor)).disabled).toBe(true); expect(named('変更先モデル', editor).disabled).toBe(true);
    expect(viewer.open).toBe(false); const size = named('大きさを変更', card); expect(size.disabled).toBe(false);
    size.fire('keydown', { key: 'ArrowRight', preventDefault() {} }); expect(card.style.width).toBe('300px');
    button('画像を表示', card).fire('click'); expect(viewer.open).toBe(true);
    button('編集を開始する').fire('click'); await vi.waitFor(() => expect(button('閲覧に切り替える')?.disabled).toBe(false), { timeout: 10000 });
    await vi.waitFor(() => expect(h.imageReads[2]).toHaveBeenCalledTimes(1)); expect(viewer.open).toBe(false); expect(card.style.width).toBe('300px');
    expect(h.liveHost().read().source!.token).toBe(token); await h.ui.dispose();
  });
  it('keeps product attachment counts known for description conflicts and unknown for concurrent deletion/edit', async () => {
    const h = await productWorkspaceFixture(true), source = h.host.read().source!, original = A.load<Record<string, any>>(source.encodeFullSource());
    const attachmentId = Object.keys(original.captionAttachmentsById)[0]!, captionId = h.f.f.captionId, sceneId = Object.keys(h.host.authority.read().state.scenes)[0]!;
    const branches = ['説明 A', '説明 B'].map(text => A.change(A.clone(original), d => { d.captionAttachmentsById[attachmentId].altText = new A.ImmutableString(canonicalFixture(text)); }));
    const read = async (doc: typeof original) => readProjectScene(ProjectMetadataSource.fromFullSource(A.save(doc), source.proof, metadata).read(), metadata, h.host.content.verifier(false));
    const alt = await read(A.merge(branches[0]!, branches[1]!)); if (alt.kind !== 'scene-provider') throw Error('provider');
    expect(projectMediaUncertain(alt, captionId)).toBe(false); expect(projectCaptions(alt, sceneId).find(c => c.id === captionId)!.mediaCount).toEqual({ kind: 'value', value: 1 });
    const deleted = A.change(A.clone(original), d => { d.captionAttachmentsById[attachmentId].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'deleted', eventId: `evt_${newId()}`, reason: 'userDelete' })); });
    const conflict = await read(A.merge(deleted, branches[0]!)); if (conflict.kind !== 'scene-provider') throw Error('provider');
    expect(projectMediaUncertain(conflict, captionId)).toBe(true); expect(projectCaptions(conflict, sceneId).find(c => c.id === captionId)!.mediaCount.kind).toBe('unresolved');
    await h.ui.dispose();
  });
  async function restoredWorkspaceHostFixture() {
    const f = await initialWorkspaceHostFixture(), factories = new Map<string, MetadataStorageFactory>();
    const databases: RestoreDatabasePorts = { listGenerations: async () => [...factories.keys()], open: async (id, create) => {
      if (id === null) return f.options.openStorage();
      if (!factories.has(id) && create) factories.set(id, storageFactory());
      const factory = factories.get(id); if (!factory) throw Error('missing generation database');
      return { factory, dispose: async () => {} };
    } };
    const options = { ...f.options, generations: () => databases };
    const host = await openValidationHost({ ...options, workspaceFile: f.f.file });
    const backupId = await host.workspaceOutput.generateBackup(host.read().source!.token, '作業前');
    return { ...f, options, host, factories, backup: await host.workspaceOutput.download(backupId) };
  }
  it('connects backup restoration to editing, two-way Contribution and cold selected-host/catalog reopen', async () => {
    const f = await restoredWorkspaceHostFixture(), host = f.host, token = host.read().source!.token;
    await host.authority.write(token, { [`caption/${f.f.captionId}/body`]: '復元前の作業' });
    const before = host.read().source!.token, originalDb = await f.factory().loadRange([]), oldModel = host.authority.read().modelVersions![0]!, oldContent = host.content;
    let stagedContent: typeof host.content | undefined;
    await host.backupRestore.prepare(f.backup);
    const prepare = vi.fn(async (next: ReturnType<typeof host.authority.read>, content: typeof host.content) => {
      stagedContent = content;
      expect(host.read().source!.token).toBe(before); expect(next.state.token).toBe(token);
      expect(host.backupRestore.pending).toBe(true);
    });
    await host.backupRestore.confirm(prepare); expect(prepare).toHaveBeenCalledOnce();
    await expect(oldContent.model(oldModel.closure.representation)).rejects.toThrow();
    await expect(stagedContent!.model(oldModel.closure.representation)).rejects.toThrow();
    expect(host.read().source!.token).toBe(token); expect(host.hasPending()).toBe(true);
    await expect(host.workspaceOutput.generate(token)).rejects.toThrow();
    host.backupRestore.displayReady(token);
    await host.authority.write(token, { [`caption/${f.f.captionId}/body`]: '復元後の追記' });
    const choice = host.workspaceOutput.bases[0]!.selection;
    const id = await host.workspaceOutput.generateContribution(host.read().source!.token, choice);
    const peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(f.f.file);
    const received = await peer.receiver.receive((await peer.session.read()).source!.token, await host.workspaceOutput.download(id));
    if (received.provider?.kind !== 'scene-provider') throw Error('provider');
    expect(received.provider.resources.captions[f.f.captionId]!.body).toEqual({ kind: 'value', value: '復元後の追記' });
    await peer.session.editCaption(received.source!.token, f.f.captionId, 'title', '返送された確認');
    const reply = await contributionFile(peer.session, peer.fs, peer.store);
    await host.workspaceFiles.receive(host.read().source!.token, reply.file);
    const final = host.read().source!.token;
    await host.workspaceFiles.receive(final, reply.file); expect(host.read().source!.token).toBe(final);
    expect(await f.factory().loadRange([])).toEqual(originalDb);
    expect((await listValidationProjects(f.options, f.options.openStorage))[0]!.state).toBe('ready');
    await host.dispose();
    const cold = await openValidationHost(f.options);
    expect(cold.read().source!.token).toBe(final); expect(cold.hasPending()).toBe(false);
    expect(cold.authority.read().resources.captions[f.f.captionId]!.title).toEqual({ kind: 'value', value: '返送された確認' });
    expect(cold.authority.read().modelVersions!.some(m => m.assetId === oldModel.assetId)).toBe(true);
    expect(cold.workspaceOutput.bases.some(b => b.selection.workspacePackageId === choice.workspacePackageId)).toBe(true);
    await cold.dispose();
  }, 60000);
  it('keeps a pre-switch render failure on old data, cancels explicitly, and cold-recovers a missing selection Result', async () => {
    const f = await restoredWorkspaceHostFixture(), host = f.host, token = host.read().source!.token;
    await host.backupRestore.prepare(f.backup);
    await expect(host.backupRestore.confirm(async () => { throw Error('restore renderer unavailable'); })).rejects.toThrow('restore renderer unavailable');
    expect(host.read().source!.token).toBe(token); expect(host.backupRestore.cancellable).toBe(true);
    expect((await listValidationProjects(f.options, f.options.openStorage))[0]!.state).toBe('incomplete');
    await host.backupRestore.cancel(); expect(host.hasPending()).toBe(false);
    const prefix = `${validationArea}/${f.run}/v2/local-restore/`;
    expect(await f.fs.list(`${prefix}selections/`)).toEqual([]);
    await host.backupRestore.prepare(f.backup);
    f.fs.reject = p => p.startsWith(prefix) && p.endsWith('/result.json');
    await expect(host.backupRestore.confirm(async () => {})).rejects.toThrow('injected quota'); f.fs.reject = () => false;
    expect((await f.fs.list(`${prefix}selections/`)).length).toBe(1);
    expect(host.hasPending()).toBe(true); await host.dispose();
    const cold = await openValidationHost(f.options);
    expect(cold.backupRestore.pending).toBe(true);
    await cold.backupRestore.retry(async () => {}); cold.backupRestore.displayReady(cold.read().source!.token);
    expect(cold.hasPending()).toBe(false); expect((await f.fs.list(`${prefix}selections/`)).length).toBe(1);
    expect((await listValidationProjects(f.options, f.options.openStorage))[0]!.state).toBe('ready');
    await cold.dispose();
  }, 30000);
  it('keeps restore recovery reachable and remounts a fresh editor with one resident owner (recorded DOM)', async () => {
    const f = await restoredWorkspaceHostFixture(), host = f.host, backupToken = host.read().source!.token;
    await host.authority.write(backupToken, { [`caption/${f.f.captionId}/body`]: '復元前の作業' });
    const before = host.read().source!.token, disposals: ReturnType<typeof vi.fn>[] = [];
    let failRender = false;
    const render: ValidationWorkspacePorts['render'] = vi.fn(async target => {
      if (failRender) throw Error('restore renderer unavailable');
      const detach = target.setDisplayPreparation(async () => {}), dispose = vi.fn(detach); disposals.push(dispose);
      return { factory: (() => { throw Error('Recorded DOM has no GPU'); }) as ViewportFactory, dispose };
    });
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode,
      list: async () => [], selected() {}, render, open: async () => host }, f.run);
    const root = record(u.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true), { timeout: 10000 });
    const oldRetry = all(root).filter(n => n.tag === 'button' && n.textContent === '更新を再試行').at(-1)!;
    const input = all(root).find(n => n.attributes.get('aria-label') === 'バックアップを選択')!;
    Object.assign(input, { files: [f.backup] }); input.fire('change'); button('内容を確認').fire('click');
    await vi.waitFor(() => expect(button('このバックアップから復元')?.disabled).toBe(false), { timeout: 10000 });
    failRender = true; button('このバックアップから復元').fire('click');
    await vi.waitFor(() => expect(button('復元を再開')?.disabled).toBe(false), { timeout: 10000 });
    expect(host.read().source!.token).toBe(before); expect(oldRetry.hidden).toBe(true);
    oldRetry.fire('click'); // Even a retained handler cannot create a failed editor acknowledgment.
    failRender = false; button('復元を再開').fire('click');
    await vi.waitFor(() => expect(host.hasPending()).toBe(false), { timeout: 20000 });
    expect(host.read().source!.token).toBe(backupToken); expect(host.backupRestore.needsDisplay).toBe(false);
    expect(all(root)).not.toContain(oldRetry); expect(disposals).toHaveLength(2);
    expect(disposals[0]).toHaveBeenCalledOnce(); expect(disposals[1]).not.toHaveBeenCalled();
    await u.dispose(); expect(disposals[1]).toHaveBeenCalledOnce();
  }, 60000);
  it('refuses a content read completing after its generation retires', async () => {
    const fs = new TestFS(), locks = lockManager(), store = new OriginBlobStore(fs,
      { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const ref = await store.put(new Blob([png.slice().buffer]).stream(), 'image/png');
    let retired = false, release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const decoder = vi.fn(async () => { await waiting; return { width: 64, height: 48, close() {} }; });
    const content = new ValidationContent(fs, store, budget, decoder, async () => { if (retired) throw Error('retired generation'); });
    const record = { mediaKind: 'image', blob: ref as unknown as JsonObject };
    const read = content.image(record), refused = expect(read).rejects.toThrow('retired generation');
    await vi.waitFor(() => expect(decoder).toHaveBeenCalledOnce()); retired = true; release(); await refused;
    await expect(content.image(record)).rejects.toThrow('retired generation'); expect(decoder).toHaveBeenCalledOnce();
  });
  it('enters Contribution recovery from a warm mounted View and refuses a separate repair job (recorded DOM)', async () => {
    const { f, fs, options } = await initialWorkspaceHostFixture();
    const first = await openValidationHost({ ...options, workspaceFile: f.file }); await first.dispose();
    await f.receiverService.receive(f.local.source!.token, f.file);
    const senderRead = await f.receiver.session.read();
    await f.receiver.session.editCaption(senderRead.source!.token, f.captionId, 'title', '変更分の記録');
    const sent = await contributionFile(f.receiver.session, f.fs, f.store);
    const view = await openValidationHost({ ...options, mode: 'view' });
    const host = createValidationModeHost(view, mode => openValidationHost({ ...options, mode }), () => {});
    const u = createSavedWorkspace(new RecordedDocument().asDocument(), host,
      undefined, (s, changed) => createValidationReceiveControls(new RecordedDocument().asDocument(), host, () => s, changed, async () => {}));
    const originalSession = u.session, root = record(u.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const writer = await openValidationHost(options);
    fs.reject = p => p.includes('/contribution-receive/') && p.endsWith('/input.zip');
    await expect(writer.workspaceFiles.receive(writer.read().source!.token, sent.file)).rejects.toThrow('injected quota');
    fs.reject = () => false; await writer.dispose();
    button('再開用データを確認').fire('click');
    await vi.waitFor(() => { expect(host.mode!.recoveryAvailable).toBe(true); expect(button('編集を開始する').disabled).toBe(false); });
    expect(host.read().state).toBe('ready'); expect(host.hasPending()).toBe(true);
    // A distinct damaged job must not be mistaken for this recoverable pre-start input.
    const jobs = host.workspaceFiles.jobs; jobs.push({ id: newId(), state: 'repair-required' });
    expect(host.mode!.recoveryAvailable).toBe(false);
    button('編集を開始する').fire('click'); expect(host.mode!.current).toBe('view'); jobs.pop();
    button('編集を開始する').fire('click'); await vi.waitFor(() => { expect(host.mode!.current).toBe('edit'); expect(host.mode!.busy).toBe(false); });
    expect(u.session).toBe(originalSession);
    const id = host.workspaceFiles.jobs.find(j => j.state === 'input-required')!.id;
    await host.workspaceFiles.reselectInput(host.read().source!.token, id, sent.file); u.render();
    expect(host.hasPending()).toBe(false); expect(host.workspaceFiles.jobs.find(j => j.id === id)!.state).toBe('completed');
    await u.dispose();
  });
  it('opens a review read-only, then explicitly creates an editable independent copy and cold reopens it (recorded DOM)', async () => {
    const { host, workspace, s, options } = await openFileCaption();
    s.media.addFile(s.mediaContext(), { name: '添付PNG', size: png.length, arrayBuffer: async () => png.slice().buffer });
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'color', color: '#123456' }))).toBe(true);
    s.setViewportState(true, s.snapshot.modelVersions!.map(m => m.assetId), null);
    expect(s.acceptPinCreation(s.pinCreationTargets()[0]!, [1, 0, 0])).toBe(true);
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }));
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    const model = s.snapshot.modelVersions![0]!.closure; if (model.shape !== 'saved-glb') throw Error('saved model');
    const slot = validationMaterialSlots(model)[0]!, overrideId = `ovr_${newId()}`;
    const intent: MaterialIntent = { appearance: { lighting: 'unlit' }, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' } };
    await host.authority.write(host.read().source!.token, Object.fromEntries(Object.entries({ routing: { scope: { kind: 'project' }, target: slot.target },
      ...intent, lifecycle: { state: 'active', eventId: `evt_${newId()}`, reason: 'initial' } }).map(([k, v]) => [materialKey(overrideId, k), canonicalFixture(v)])), { sceneId: s.sceneId });
    const token = host.read().source!.token, mode = createValidationModeHost(host, async () => { throw Error('unexpected mode switch'); }, () => {});
    const tools = createValidationReceiveControls(new RecordedDocument().asDocument(), mode, () => s, () => {}, async () => {});
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)], root = record(tools.root);
    const button = (label: string) => all(root).find(n => n.tag === 'button' && n.textContent === label)!;
    button('シーンを共有').fire('click');
    const scenes = all(root).find(n => n.attributes.get('aria-label') === '渡すシーン')!; scenes.value = s.sceneId; scenes.fire('change');
    button('内容を確認').fire('click'); await vi.waitFor(() => expect(button('ダウンロード')?.disabled).toBe(false));
    expect(all(root).some(n => n.textContent.includes('キャプション 2・メディア 1'))).toBe(true);
    button('ダウンロード').fire('click'); await vi.waitFor(() => {
      expect(host.workspaceOutput.error).toBeFalsy(); expect(button('ダウンロード')?.disabled).toBe(false);
    }, { timeout: 10000 });
    const file = await host.workspaceOutput.download(host.workspaceOutput.jobs[0]!.id), prepared = await prepareReviewView(file, budget, decode);
    expect(prepared.models[0]).not.toHaveProperty('binding'); expect(prepared.models[0]).not.toHaveProperty('revision');
    expect(prepared.models[0]!.representation).not.toHaveProperty('payloadDigest'); expect(prepared.display(null, null).pins).toHaveLength(2);
    expect(prepared.images.size).toBe(1); expect(host.read().source!.token).toBe(token);
    expect(Object.values(prepared.display(null, null).savedMaterials![prepared.models[0]!.assetId]!)).toEqual([intent]);
    // Inject an independently admitted optional-field omission at the pure View projection boundary.
    const noColor = structuredClone(prepared.inspection.review.snapshot), firstCaption = Object.values(noColor.captionsById as JsonObject)[0] as Record<string, JsonObject[string]>;
    delete firstCaption.colorSrgb;
    const omitted = await inspectReviewSnapshot(noColor, metadata), inspect = vi.spyOn(ReviewArchive, 'inspect').mockResolvedValueOnce({ ...prepared.inspection, review: omitted });
    try { const noColorView = await prepareReviewView(file, budget, decode);
      expect(noColorView.source.captions.find(c => c.id === firstCaption.id)!.color).toEqual({ kind: 'value', value: '#a08045' });
      expect(noColorView.inspection.review.snapshot.captionsById).toEqual(noColor.captionsById);
    } finally { inspect.mockRestore(); }
    const open = vi.fn<ValidationWorkspacePorts['open']>(async () => { throw Error('injected copy host opening failure'); });
    const render = vi.fn<ValidationWorkspacePorts['render']>(async () => { throw Error('review must not fabricate a Project'); });
    let display: Parameters<ReturnType<ViewportFactory>['update']>[0];
    let starts = 0;
    const renderReview = vi.fn(async () => ({ dispose() {}, factory: ((_canvas, _changed, pin, model) => {
      expect(pin).toBeUndefined(); expect(model).toBeUndefined();
      if (++starts === 1) throw Error('injected renderer startup refusal');
      return { update(next) { display = next; }, setActive() {}, camera() {}, retry() {}, dispose() {},
        read: () => ({ display, token: 'recorded-review-camera', ready: true, issue: null, dragging: false, projection: 'perspective', axis: null,
          pins: display?.pins.map(p => ({ id: p.id, x: 40, y: 60, visible: true })) ?? [] }) };
    }) as ViewportFactory }));
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, selected() {}, list: async () => [], open, render, renderReview });
    const page = record(u.root), openButton = () => all(page).find(n => n.tag === 'button' && n.textContent === 'ファイルを開く')!;
    await vi.waitFor(() => expect(openButton().disabled).toBe(false));
    const input = all(page).find(n => n.attributes.get('aria-label') === 'ファイルを選択')!;
    Object.assign(input, { files: [file] }); input.parent!.parent!.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(all(page).some(n => n.textContent.includes('編集プロジェクトは作成していません'))).toBe(true));
    expect(open).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled(); expect(renderReview).toHaveBeenCalledOnce();
    const rows = all(page).filter(n => n.className === 'lv-caption-select'); expect(rows).toHaveLength(2);
    rows[0]!.fire('click'); rows[1]!.fire('click'); expect(all(page).filter(n => n.className === 'lv-caption-window')).toHaveLength(2);
    const retry = all(page).find(n => n.tag === 'button' && n.textContent === '3D表示を再試行')!;
    expect(retry.hidden).toBe(false); expect(all(page).some(n => n.textContent === 'injected renderer startup refusal')).toBe(true);
    retry.fire('click'); expect(starts).toBe(2); expect(retry.hidden).toBe(true);
    expect(all(page).filter(n => n.className === 'lv-caption-window')).toHaveLength(2);
    expect(all(page).some(n => n.tag === 'button' && n.textContent === 'ピンを追加')).toBe(false);
    expect(display!.readOnly).toBe(true); expect(u.selected).toBeNull();
    const mediaCaption = prepared.source.captions.findIndex(c => c.mediaCount.kind === 'value' && c.mediaCount.value > 0);
    rows[mediaCaption]!.fire('click');
    const mediaPanel = all(page).find(n => n.attributes.get('aria-label') === '選択中のキャプションのメディア')!;
    all(mediaPanel).find(n => n.tag === 'button' && n.textContent === '画像を表示')!.fire('click');
    const mediaViewer = all(page).find(n => n.attributes.get('aria-label') === '画像ビューア')!;
    expect(mediaViewer.open).toBe(true); expect(all(mediaViewer).filter(n => n.tag === 'img')).toHaveLength(1);
    expect(all(page).filter(n => n.tag === 'dialog')).toHaveLength(1); expect(open).not.toHaveBeenCalled();
    all(mediaViewer).find(n => n.attributes.get('aria-label') === '閉じる')!.fire('click'); expect(mediaViewer.open).toBe(false);
    const pageButton = (text: string) => all(page).find(n => n.tag === 'button' && n.textContent === text)!;
    pageButton('編集コピーを作る').fire('click'); expect(open).not.toHaveBeenCalled();
    expect(all(page).find(n => n.attributes.get('aria-label') === '編集コピーの確認')!.hidden).toBe(false);
    pageButton('コピーを作成').fire('click');
    await vi.waitFor(() => expect(all(page).some(n => n.textContent === 'injected copy host opening failure')).toBe(true));
    expect(all(page).filter(n => n.className === 'lv-caption-window')).toHaveLength(2); expect(u.selected).toBeNull();
    const attempt = open.mock.calls[0]![4]!, factory = storageFactory(); let copied: Awaited<ReturnType<typeof openValidationHost>> | undefined;
    const nextOptions = { ...options, run: attempt.run, openStorage: async () => ({ factory, dispose: async () => {} }) };
    open.mockImplementation(async (run, initial, mode, workspaceFile, reviewEdit) => copied = await openValidationHost({ ...nextOptions, run, initial, mode, workspaceFile, reviewEdit }));
    render.mockResolvedValue({ factory: (() => { throw Error('Recorded DOM has no GPU'); }) as ViewportFactory, dispose() {} });
    pageButton('コピーを作成').fire('click');
    await vi.waitFor(() => { expect(render).toHaveBeenCalledOnce(); expect(copied!.hasPending()).toBe(false); }, { timeout: 10000 });
    expect(open.mock.calls[1]![4]).toBe(attempt); expect(u.selected).toBe(attempt.run);
    expect(copied!.workspaceFiles.reviewCopies[0]!.state).toBe('completed'); expect(copied!.workspaceFiles.jobs).toEqual([]);
    expect(copied!.read().source!.proof).not.toEqual(host.read().source!.proof); expect(copied!.workspaceOutput.bases).toEqual([]);
    const sceneId = Object.keys(copied!.authority.read().state.scenes)[0]!;
    await copied!.authority.authorScene!(copied!.read().source!.token, { kind: 'renameScene', sceneId, name: '閲覧コピーでの作業' });
    const updated = copied!.read().source!.token;
    await copied!.workspaceFiles.retryReviewCopy(attempt.id); expect(copied!.read().source!.token).toBe(updated);
    await u.dispose(); const cold = await openValidationHost(nextOptions);
    expect(cold.read().source!.token).toBe(updated); expect(cold.hasPending()).toBe(false);
    expect(cold.authority.read().modelVersions).toHaveLength(1); expect(cold.workspaceOutput.bases).toEqual([]);
    expect(host.read().source!.token).toBe(token); expect(await digest(new Uint8Array(await file.arrayBuffer()))).toBe(attempt.descriptor().original.sha256);
    await cold.dispose(); tools.dispose(); await workspace.dispose();
  }, 60000);
  it.each(['original', 'child', 'completion'] as const)('cold resumes a review edit-copy stopped at %s through one parent recovery row', async stage => {
    const source = await openFileCaption(), id = await source.host.workspaceOutput.generateReview(source.host.read().source!.token, { sceneId: source.s.sceneId });
    const file = await source.host.workspaceOutput.download(id), prepared = await PreparedReviewEdit.prepare(file, metadata);
    const fs = new TestFS(), locks = lockManager(), factory = storageFactory();
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const creates: boolean[] = [], options = { base: fs, coordinator: ProjectMutationCoordinator.browser(locks), store,
      fileLimits: budget, decode, run: prepared.run, packageLocks: locks, openStorage: async (create: boolean) => { creates.push(create); return { factory, dispose: async () => {} }; } };
    await expect(openValidationHost({ ...options, reviewEdit: prepared, packageLocks: null })).rejects.toThrow('排他的');
    expect(await fs.list(`${validationArea}/${prepared.run}/v2/packages/review-edit/`)).toEqual([]);
    fs.reject = path => stage === 'original' ? path.includes('/review-edit/') && path.endsWith('/original.zip') :
      stage === 'child' ? path.includes('/clean-input/') && path.endsWith('/input.zip') : path.includes('/review-edit/') && path.endsWith('/published.json');
    const first = await openValidationHost({ ...options, reviewEdit: prepared });
    expect(first.hasPending()).toBe(true); expect(first.workspaceFiles.jobs).toEqual([]);
    expect(first.workspaceFiles.reviewCopies).toEqual([{ id: prepared.id, childId: prepared.childId, state: stage === 'original' ? 'input-required' : 'incomplete' }]);
    if (first.read().source) {
      await expect(first.authority.authorScene!(first.read().source!.token, { kind: 'renameScene', sceneId: Object.keys(prepared.clean.description.records.scenesById!)[0]!, name: '禁止' })).rejects.toThrow('編集コピー');
      await expect(first.workspaceOutput.generate(first.read().source!.token)).rejects.toThrow('編集コピー');
    }
    await first.dispose(); fs.reject = () => false;
    const listed = await listValidationProjects(options, (_run, create) => options.openStorage(create));
    expect(listed).toEqual([expect.objectContaining({ run: prepared.run, state: 'incomplete' })]);
    const cold = await openValidationHost(options), mode = createValidationModeHost(cold, next => openValidationHost({ ...options, mode: next }), () => {});
    const tools = createValidationReceiveControls(new RecordedDocument().asDocument(), mode, () => undefined, () => {}, async () => {});
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)], nodes = all(record(tools.root));
    expect(nodes.some(n => n.textContent === '元のファイルを選び直す')).toBe(false); // Private clean ZIP never appears.
    if (stage === 'original') {
      await expect(cold.workspaceFiles.reselectReviewCopy(prepared.id, new Blob(['not a review']))).rejects.toThrow();
      await cold.workspaceFiles.reselectReviewCopy(prepared.id, file);
    } else await cold.workspaceFiles.retryReviewCopy(prepared.id);
    expect(cold.hasPending()).toBe(false); expect(cold.read().source!.originalChanges()).toEqual(prepared.clean.source.originalChanges());
    const sceneId = Object.keys(cold.authority.read().state.scenes)[0]!;
    await cold.authority.authorScene!(cold.read().source!.token, { kind: 'renameScene', sceneId, name: 'コピーの後続編集' });
    const token = cold.read().source!.token; await cold.workspaceFiles.retryReviewCopy(prepared.id); expect(cold.read().source!.token).toBe(token);
    expect(cold.workspaceOutput.bases).toEqual([]); tools.dispose(); await mode.dispose();
    const reopened = await openValidationHost(options); expect(reopened.read().source!.token).toBe(token); expect(reopened.hasPending()).toBe(false);
    expect(creates.slice(2).every(create => !create)).toBe(true); await reopened.dispose(); await source.workspace.dispose();
  }, 60000);
  it('refuses acknowledged review parent/child evidence loss and preserves independent edits', async () => {
    const source = await openFileCaption(), id = await source.host.workspaceOutput.generateReview(source.host.read().source!.token, { sceneId: source.s.sceneId });
    const file = await source.host.workspaceOutput.download(id), prepared = await PreparedReviewEdit.prepare(file, metadata);
    // Three different losses share the same exact fixture; none can be repaired by regenerating bytes.
    for (const loss of ['parent', 'parent-start', 'child'] as const) {
      const r = firstWorkspaceRecipient(), job = new ReviewEditJob(r.fs, r.session, metadata);
      r.fs.reject = p => p.includes('/journal/') && p.endsWith('/blobsVerified.json');
      await expect(job.start(prepared).then(() => 'unexpected success')).rejects.toThrow(); r.fs.reject = () => false;
      expect((await new TransactionJournal(r.fs, metadata).entries())).toHaveLength(1);
      const parentRoot = reviewEditRoot(r.fs, prepared.id), childRoot = `v2/packages/clean-input/${prepared.childId}/`;
      if (loss === 'parent') {
        for (const path of await r.fs.list(parentRoot)) await r.fs.remove(path);
        await r.fs.remove(`v2/packages/review-edit-index/${prepared.id}.json`);
      } else if (loss === 'parent-start') {
        await r.fs.remove(`${parentRoot}start.json`); await r.fs.remove(`${parentRoot}original.zip`);
      } else {
        for (const path of await r.fs.list(childRoot)) await r.fs.remove(path);
        await r.fs.remove(`v2/packages/clean-input-index/${prepared.childId}.json`);
      }
      const before = await r.fs.list(''), writer = vi.spyOn(r.fs, 'writeStream');
      const cold = r.reopen(), retry = new ReviewEditJob(r.fs, cold.session, metadata);
      await expect(retry.retry(prepared.id)).rejects.toThrow();
      await expect(retry.reselect(prepared.id, file)).rejects.toThrow();
      await expect(retry.abandon(prepared.id)).rejects.toThrow();
      await expect(cold.session.retry()).rejects.toThrow();
      expect((await retry.states())[0]).toMatchObject({ childId: prepared.childId, state: 'repair-required' });
      expect(writer).not.toHaveBeenCalled(); expect(await r.fs.list('')).toEqual(before);
    }
    await source.workspace.dispose();
  }, 60000);
  it('offers clean preflight and opens the independent copy through the existing selector (recorded DOM)', async () => {
    const { f, options } = await initialWorkspaceHostFixture(), original = await openValidationHost({ ...options, workspaceFile: f.file });
    const mode = createValidationModeHost(original, next => openValidationHost({ ...options, mode: next }), () => {});
    const tools = createValidationReceiveControls(new RecordedDocument().asDocument(), mode, () => undefined, () => {}, async () => {});
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)], root = record(tools.root);
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    button('独立コピーを作る').fire('click');
    expect(button('ダウンロード')).toBeUndefined(); button('内容を確認').fire('click');
    await vi.waitFor(() => expect(button('ダウンロード')?.disabled).toBe(false));
    expect(all(root).some(n => n.textContent.includes('シーン 1・モデル 2・キャプション 1・メディア 1'))).toBe(true);
    expect(all(root).some(n => n.textContent.includes('匿名化はしません'))).toBe(true);
    button('ダウンロード').fire('click'); await vi.waitFor(() => {
      expect(original.workspaceOutput.jobs[0]?.state).toBe('generated'); expect(button('ダウンロード')?.disabled).toBe(false);
    }, { timeout: 10000 });
    const file = await original.workspaceOutput.download(original.workspaceOutput.jobs[0]!.id), inspected = await CleanArchive.inspect(file, metadata);
    tools.dispose(); await mode.dispose();
    const run = (inspected.source.proof.identity.projectId as string).slice(4), factory = storageFactory();
    const nextOptions = { ...options, run, openStorage: async () => ({ factory, dispose: async () => {} }) };
    let host: Awaited<ReturnType<typeof openValidationHost>> | undefined;
    const render = vi.fn(async () => ({ factory: (() => { throw Error('Recorded DOM has no GPU'); }) as ViewportFactory, dispose() {} }));
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, selected() {}, render,
      list: async () => [], open: async (_run, initial, mode, workspaceFile) => host = await openValidationHost({ ...nextOptions, run: _run, initial, mode, workspaceFile }) });
    const page = record(u.root), open = () => all(page).find(n => n.tag === 'button' && n.textContent === 'ファイルを開く')!;
    await vi.waitFor(() => expect(open().disabled).toBe(false));
    const input = all(page).find(n => n.attributes.get('aria-label') === 'ファイルを選択')!;
    Object.assign(input, { files: [file] }); input.parent!.parent!.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce(), { timeout: 10000 });
    expect(host!.read().source!.originalChanges()).toEqual(inspected.source.originalChanges());
    expect(host!.authority.read().modelVersions).toHaveLength(2);
    const sceneId = Object.keys(host!.authority.read().state.scenes)[0]!;
    await host!.authority.authorScene!(host!.read().source!.token, { kind: 'renameScene', sceneId, name: 'コピーでの作業' });
    const token = host!.read().source!.token; await u.dispose();
    await expect(openValidationHost({ ...nextOptions, workspaceFile: file })).rejects.toThrow('プロジェクト一覧から再開');
    const cold = await openValidationHost(nextOptions); expect(cold.read().source!.token).toBe(token);
    expect(cold.workspaceOutput.bases).toEqual([]); await cold.dispose();
  }, 60000);
  it('opens a first Workspace from the existing selector and receives later selection by identity (recorded DOM)', async () => {
    const { f, options, run } = await initialWorkspaceHostFixture();
    let host: Awaited<ReturnType<typeof openValidationHost>> | undefined;
    const render = vi.fn(async () => ({ factory: (() => { throw Error('Recorded DOM has no GPU'); }) as ViewportFactory, dispose() {} }));
    const ports: ValidationWorkspacePorts = { fileLimits: budget, decode, selected: vi.fn(), render,
      list: () => listValidationProjects(options, options.openStorage),
      open: async (_run, initial, mode, workspaceFile) => host = await openValidationHost({ ...options, run: _run, initial, mode, workspaceFile }) };
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), ports), root = record(u.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    await vi.waitFor(() => expect(button('ファイルを開く').disabled).toBe(false));
    const input = all(root).find(n => n.attributes.get('aria-label') === 'ファイルを選択')!, form = input.parent!.parent!;
    Object.assign(input, { files: [new Blob(['broken'])] }); form.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(button('ファイルを開く').disabled).toBe(false)); expect(host).toBeUndefined();
    Object.assign(input, { files: [f.file] }); form.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce(), { timeout: 10000 });
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    expect(u.selected).toBe(run); expect(host!.read().source!.originalChanges()).toEqual(f.source.originalChanges());
    expect(host!.authority.read().modelVersions).toHaveLength(2);
    const sceneId = Object.keys(host!.authority.read().state.scenes)[0]!;
    await host!.authority.authorScene!(host!.read().source!.token, { kind: 'renameScene', sceneId, name: '手元のシーン名' });
    const originals = host!.read().source!.originalChanges();
    button('プロジェクトを選ぶ').fire('click'); await vi.waitFor(() => expect(u.selected).toBeNull());
    await vi.waitFor(() => expect(button('ファイルを開く').disabled).toBe(false));
    Object.assign(input, { files: [f.file] }); form.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2), { timeout: 10000 });
    expect(host!.read().source!.originalChanges()).toEqual(originals); await u.dispose();
  });
  it('recovers source-less initial input through the same file controls after View-to-Edit, before renderer preparation', async () => {
    const { f, fs, options, run } = await initialWorkspaceHostFixture(), originalWrite = fs.writeStream.bind(fs);
    const interrupted = vi.spyOn(fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (path.endsWith('/input.zip')) { await stream.cancel(); throw Error('initial input interrupted'); }
      return originalWrite(path, stream);
    });
    const first = await openValidationHost({ ...options, workspaceFile: f.file });
    expect(first.read().source).toBeNull(); expect(first.workspaceFiles.jobs[0]!.state).toBe('input-required');
    expect(first.hasPending()).toBe(true); await first.dispose(); interrupted.mockRestore();
    const render = vi.fn(async () => ({ factory: (() => { throw Error('Recorded DOM has no GPU'); }) as ViewportFactory, dispose() {} }));
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, list: async () => [], selected() {}, render,
      open: async (_run, _initial, mode) => openValidationHost({ ...options, mode }) }, run, 'view');
    const root = record(u.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    await vi.waitFor(() => expect(button('元のファイルを選び直す')).toBeDefined());
    expect(button('元のファイルを選び直す').disabled).toBe(true); expect(render).not.toHaveBeenCalled();
    button('編集を開始する').fire('click'); await vi.waitFor(() => expect(button('元のファイルを選び直す').disabled).toBe(false));
    for (const n of all(root).filter(n => n.type === 'file')) Object.assign(n, { click: vi.fn() });
    button('元のファイルを選び直す').fire('click');
    const input = all(root).find(n => n.attributes.get('aria-label') === '元のファイルを選び直す')!;
    Object.assign(input, { files: [f.file] }); input.fire('change'); input.parent!.parent!.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce(), { timeout: 10000 });
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    await u.dispose();
  });
  it('keeps cold projection failure recoverable and catalog incomplete until imported-base completion', async () => {
    const { f, fs, options, run } = await initialWorkspaceHostFixture();
    fs.reject = p => p.includes('/bases/');
    const first = await openValidationHost({ ...options, workspaceFile: f.file });
    expect(first.read().state).toBe('ready'); expect(first.hasPending()).toBe(true); const id = first.workspaceFiles.jobs[0]!.id;
    await first.dispose(); fs.reject = () => false;
    expect((await listValidationProjects(options, options.openStorage))[0]!.state).toBe('incomplete');
    const image = vi.spyOn(ValidationContent.prototype, 'image').mockRejectedValue(Error('cold image projection'));
    const view = await openValidationHost({ ...options, mode: 'view' });
    expect(view.display()).toBeUndefined(); expect(view.hasPending()).toBe(true);
    const mode = createValidationModeHost(view, access => openValidationHost({ ...options, mode: access }), () => {});
    await mode.mode!.change('edit', mode.read().source!.token, () => { throw Error('must not publish unfinished display'); });
    expect(mode.authority.readOnly).toBe(false); image.mockRestore();
    await mode.workspaceFiles.retry(id); expect(mode.hasPending()).toBe(false);
    expect(mode.authority.read().modelVersions).toHaveLength(2); await mode.dispose();
    expect((await listValidationProjects(options, options.openStorage))[0]!.state).toBe('ready');
    for (const path of await fs.list(`${validationArea}/${run}/v2/packages/receive/${id}/`)) await fs.remove(path);
    expect((await listValidationProjects(options, options.openStorage))[0]!.state).toBe('unavailable');
  });
  it('refuses same-ID/different-lineage import and unfinished local creation without changing existing data', async () => {
    const { f, fs, options, run } = await initialWorkspaceHostFixture();
    const initial = prepareValidationCreation(await prepareValidationProject({ run, title: '別系統', models: [{ label: '3Dモデル', bytes: glb() }] }, budget, decode));
    fs.reject = p => p.endsWith('/published.json');
    const pending = await openValidationHost({ ...options, initial }); await pending.dispose(); fs.reject = () => false;
    const paths = await fs.list(''), bytes = await Promise.all(paths.map(p => fs.readBytes(p)));
    const refused = await openValidationHost({ ...options, workspaceFile: f.file });
    expect(refused.hasPending()).toBe(true); expect(refused.workspaceFiles.jobs).toHaveLength(0); await refused.dispose();
    expect(await fs.list('')).toEqual(paths); expect(await Promise.all(paths.map(p => fs.readBytes(p)))).toEqual(bytes);
    const completed = await openValidationHost(options); await completed.authority.retry!(); const original = completed.read().source!; await completed.dispose();
    await expect(openValidationHost({ ...options, workspaceFile: f.file })).rejects.toThrow('一致しません');
    const reopened = await openValidationHost(options); expect(reopened.read().source!.originalChanges()).toEqual(original.originalChanges()); await reopened.dispose();
  });
  it('returns to the catalog after explicit abandonment of a source-less input without pretending it is ready', async () => {
    const { f, fs, options, run } = await initialWorkspaceHostFixture(), write = fs.writeStream.bind(fs);
    const interrupted = vi.spyOn(fs, 'writeStream').mockImplementation(async (p, stream) => {
      if (p.endsWith('/input.zip')) { await stream.cancel(); throw Error('stop input'); } return write(p, stream);
    });
    const first = await openValidationHost({ ...options, workspaceFile: f.file }); await first.dispose(); interrupted.mockRestore();
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, selected() {}, list: async () => [],
      render: async () => { throw Error('empty import must not render'); }, open: async () => openValidationHost(options) }, run);
    const root = record(u.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    await vi.waitFor(() => expect(button('この受信を取りやめる')).toBeDefined());
    button('この受信を取りやめる').fire('click'); button('取りやめる').fire('click');
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === '受信を取りやめました。')).toBe(true));
    button('プロジェクトを選ぶ').fire('click'); await vi.waitFor(() => expect(u.selected).toBeNull()); await u.dispose();
    const cold = await openValidationHost(options); expect(cold.read().state).toBe('empty'); expect(cold.hasPending()).toBe(false); await cold.dispose();
  });
  it('keeps file tools mutually guarded with startup Scene selection before a Session exists (recorded DOM)', async () => {
    const f = await workspaceFileFixture(source => {
      const branches = [0, 1].map(() => {
        const doc = A.load<Record<string, any>>(source.encodeFullSource()), scene = String(doc.project.defaultSceneId);
        return A.change(doc, d => { delete d.project.defaultSceneId; d.project.defaultSceneId = new A.ImmutableString(scene); });
      });
      return ProjectMetadataSource.fromFullSource(A.save(A.merge(branches[0]!, branches[1]!)), source.proof, metadata);
    }), r = firstWorkspaceRecipient(), run = (f.source.proof.identity.projectId as string).slice(4);
    const options = { run, base: r.fs, coordinator: ProjectMutationCoordinator.browser(r.locks), store: r.store, fileLimits: budget, decode,
      packageLocks: r.locks, openStorage: async () => ({ factory: r.factory, dispose: async () => {} }) };
    const opened = await openValidationHost({ ...options, workspaceFile: f.file });
    const host = createValidationModeHost(opened, mode => openValidationHost({ ...options, mode }), () => {}), document = new RecordedDocument().asDocument();
    let workspace: ReturnType<typeof createSavedWorkspace> | undefined;
    const tools = createValidationReceiveControls(document, host, () => workspace?.session, () => workspace?.render(), async () => {}, () => workspace?.inputPending() ?? false);
    workspace = createSavedWorkspace(document, host, undefined, undefined, tools);
    expect(workspace.session).toBeUndefined();
    const root = record(workspace.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const select = all(root).find(n => n.attributes.get('aria-label') === '残す開始シーン')!, input = all(root).find(n => n.attributes.get('aria-label') === '更新ファイルを選択')!;
    Object.assign(input, { files: [f.file] }); input.fire('change'); expect(select.disabled).toBe(true);
    Object.assign(input, { files: [] }); input.fire('change');
    select.value = select.children[1]!.value; select.fire('change'); expect(button('開始シーンを確定').disabled).toBe(false);
    expect(button('ファイルに保存').disabled).toBe(true);
    const token = host.read().source!.token; Object.assign(input, { files: [f.file] }); input.fire('change'); input.parent!.parent!.fire('submit', { preventDefault() {} });
    expect(host.read().source!.token).toBe(token); expect(all(root).some(n => n.textContent.includes('入力・操作を確定'))).toBe(true);
    Object.assign(input, { files: [] }); input.fire('change'); button('開始シーンを確定').fire('click');
    await vi.waitFor(() => expect(workspace!.session).toBeDefined(), { timeout: 10000 });
    expect(all(root).filter(n => n === record(tools.root))).toHaveLength(1); await workspace.dispose();
  });
  it('connects output, deliberate handoff and file confirmation with the same editor input guards (recorded DOM)', async () => {
    const f = await receivedHostFixture(), host = createValidationModeHost(f.host, mode => openValidationHost({ ...f.options, mode }), () => {});
    const document = new RecordedDocument().asDocument(), click = vi.fn(), create = document.createElement.bind(document);
    // Observe authored handoff calls only, NOT browser download or native file-dialog evidence.
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = create(tag); if (tag === 'a' || tag === 'input') Object.assign(node, { click }); return node;
    });
    let workspace: ReturnType<typeof createSavedWorkspace>, tools: ReturnType<typeof createValidationReceiveControls>;
    tools = createValidationReceiveControls(document, host, () => workspace?.session, () => workspace?.render(), async () => {});
    workspace = createSavedWorkspace(document, host, undefined, () => tools);
    const s = workspace.session!, root = record(tools.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const token = host.read().source!.token, memory = s.memory, windows = s.windowMemory;
    const receiveInput = all(root).find(n => n.attributes.get('aria-label') === '更新ファイルを選択')!;
    Object.assign(receiveInput, { files: [f.file] }); receiveInput.fire('change');
    expect(button('ファイルに保存').disabled).toBe(true);
    Object.assign(receiveInput, { files: [] }); receiveInput.fire('change');
    s.setSearchComposing(true); button('ファイルに保存').fire('click');
    expect(host.workspaceOutput.jobs).toHaveLength(0);
    expect(all(root).some(n => n.textContent.includes('入力・操作を確定'))).toBe(true);
    s.setSearchComposing(false); button('ファイルに保存').fire('click');
    await vi.waitFor(() => expect(host.workspaceOutput.jobs[0]?.state).toBe('generated'), { timeout: 10000 });
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(click).toHaveBeenCalledTimes(1); expect(host.read().source!.token).toBe(token);
    expect(workspace.session).toBe(s); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows);
    expect(all(root).some(n => n.textContent.includes('ファイルへの保存は未確認'))).toBe(true);
    button('ダウンロード').fire('click'); await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(host.workspaceOutput.jobs[0]!.state).toBe('generated');
    button('ファイルを選択').fire('click'); expect(tools.hasChanges()).toBe(true);
    const selected = all(root).find(n => n.attributes.get('aria-label') === '保存先のファイルを選択')!;
    const id = host.workspaceOutput.jobs[0]!.id, file = await host.workspaceOutput.download(id);
    Object.assign(selected, { files: [file] }); selected.fire('change');
    await vi.waitFor(() => expect(host.workspaceOutput.jobs[0]!.state).toBe('file-verified'), { timeout: 10000 });
    await vi.waitFor(() => expect(tools.hasChanges()).toBe(false));
    expect(host.read().source!.token).toBe(token);
    await host.mode!.change('view', token, () => {}); tools.render(); expect(button('ファイルに保存').disabled).toBe(true);
    expect(button('ダウンロード').disabled).toBe(false);
    workspace.dispose(); await host.dispose();
  }, 60000);
  it('requires an explicit Contribution base while its own generation remains available and other input stays guarded (recorded DOM)', async () => {
    const { f, options } = await initialWorkspaceHostFixture(), initial = await openValidationHost({ ...options, workspaceFile: f.file });
    await initial.workspaceOutput.generate(initial.read().source!.token);
    const host = createValidationModeHost(initial, mode => openValidationHost({ ...options, mode }), () => {});
    const document = new RecordedDocument().asDocument();
    const create = document.createElement.bind(document), download = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = create(tag); if (tag === 'a') Object.assign(node, { click: download }); return node;
    });
    let workspace: ReturnType<typeof createSavedWorkspace>, tools: ReturnType<typeof createValidationReceiveControls>, outputSettled: (() => void) | undefined;
    tools = createValidationReceiveControls(document, host, () => workspace?.session, () => {
      workspace?.render(); if (outputSettled && !tools.busy()) { outputSettled(); outputSettled = undefined; }
    }, async () => {});
    workspace = createSavedWorkspace(document, host, undefined, () => tools);
    const root = record(workspace.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const input = (name: string) => all(root).find(n => n.attributes.get('aria-label') === name)!;
    expect(host.workspaceOutput.bases).toHaveLength(2);
    const selectedBase = host.workspaceOutput.bases[0]!.selection;
    button('相手に渡す').fire('click');
    input('渡す内容').value = 'contribution'; input('渡す内容').fire('change');
    expect(tools.hasChanges()).toBe(true); expect(button('ダウンロード').disabled).toBe(true);
    expect(input('渡す内容').children.map(n => n.value)).toEqual(['teamWorkspace', 'contribution']);
    expect(input('元にする作業一式').value).toBe('');
    button('閲覧に切り替える').fire('click'); expect(host.mode!.current).toBe('edit');
    const form = all(root).find(n => n.tag === 'form')!;
    expect((form as unknown as HTMLElement).inert).toBe(true);
    input('元にする作業一式').value = selectedBase.workspacePackageId; input('元にする作業一式').fire('change');
    expect(button('ダウンロード').disabled).toBe(false);
    const history = all(root).find(n => n.tag === 'summary' && n.textContent === '作成したファイル')!.parent!;
    all(history).find(n => n.tag === 'button' && n.textContent === 'ダウンロード')!.fire('click');
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(tools.hasChanges()).toBe(true); expect(input('元にする作業一式').value).toBe(selectedBase.workspacePackageId);
    const s = workspace.session!, memory = s.memory, windows = s.windowMemory, before = host.read().source!.token;
    s.setSearchComposing(true); button('ダウンロード').fire('click');
    expect(host.workspaceOutput.jobs.filter(j => j.purpose === 'contribution')).toHaveLength(0);
    s.setSearchComposing(false);
    const completion = new Promise<void>(resolve => { outputSettled = resolve; }); button('ダウンロード').fire('click');
    await vi.waitFor(() => expect(host.workspaceOutput.jobs.some(j => j.purpose === 'contribution' && j.state === 'generated')).toBe(true), { timeout: 10000 });
    await completion; expect(tools.hasChanges()).toBe(false);
    const result = host.workspaceOutput.jobs.find(j => j.purpose === 'contribution')!;
    const archive = await PackageArchive.inspect(await host.workspaceOutput.download(result.id));
    expect(archive.control.manifest).toMatchObject({ purpose: 'contribution', base: selectedBase });
    expect(host.workspaceOutput.bases).toHaveLength(2); expect(host.read().source!.token).toBe(before);
    expect(workspace.session).toBe(s); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows);
    const unavailable = vi.spyOn(WorkspaceSender.prototype, 'availableBases').mockRejectedValueOnce(Error('基準データを確認できません。'));
    await host.refresh(); tools.render();
    const outputStatus = () => all(root).find(n => n.attributes.get('aria-label') === 'ファイル')!.children.find(n => n.attributes.get('role') === 'status')!;
    expect(outputStatus().textContent).toBe('基準データを確認できません。'); expect(host.workspaceOutput.bases).toEqual([]);
    await host.refresh(); tools.render();
    expect(outputStatus().textContent).not.toBe('基準データを確認できません。'); expect(host.workspaceOutput.bases).toHaveLength(2); unavailable.mockRestore();
    button('相手に渡す').fire('click'); input('渡す内容').value = 'contribution'; input('渡す内容').fire('change');
    const output = all(root).find(n => n.attributes.get('aria-label') === 'ファイル')!;
    all(output).find(n => n.tag === 'button' && n.textContent === '選択を取り消す')!.fire('click'); expect(tools.hasChanges()).toBe(false);
    await workspace.dispose();
  }, 20000);
  it('keeps backup names and file choices through IME, failures and unrelated download without claiming external save (recorded DOM)', async () => {
    const { f, options } = await initialWorkspaceHostFixture(), initial = await openValidationHost({ ...options, workspaceFile: f.file });
    await initial.workspaceOutput.generate(initial.read().source!.token);
    const host = createValidationModeHost(initial, mode => openValidationHost({ ...options, mode }), () => {});
    const document = new RecordedDocument().asDocument(), create = document.createElement.bind(document), download = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = create(tag); if (tag === 'a' || tag === 'input') Object.assign(node, { click: tag === 'a' ? download : () => {} }); return node;
    });
    let workspace: ReturnType<typeof createSavedWorkspace>;
    const tools = createValidationReceiveControls(document, host, () => workspace?.session, () => workspace?.render(), async () => {});
    workspace = createSavedWorkspace(document, host, undefined, () => tools);
    const root = record(workspace.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const input = (name: string) => all(root).find(n => n.attributes.get('aria-label') === name)!;
    const output = input('ファイル'), button = (text: string) => all(output).find(n => n.tag === 'button' && n.textContent === text)!;
    const status = output.children.find(n => n.attributes.get('role') === 'status')!;
    expect(status.className).toBe('lv-operation-status'); expect(status.dataset.busy).toBe('false');
    expect(input('渡す内容')).toBeUndefined(); expect(button('保存').attributes.get('aria-pressed')).toBe('true');
    const name = input('名前（任意）'); name.fire('compositionstart'); name.value = '調査前'; name.fire('input');
    expect(button('ファイルに保存').disabled).toBe(true); button('ファイルに保存').fire('click');
    expect(host.workspaceOutput.jobs.some(j => j.purpose === 'backup')).toBe(false);
    workspace.render(); expect(input('名前（任意）')).toBe(name); expect(name.value).toBe('調査前');
    name.fire('compositionend'); expect(tools.hasChanges()).toBe(true);
    expect((all(root).find(n => n.tag === 'form') as unknown as HTMLElement).inert).toBe(true);
    all(root).find(n => n.tag === 'button' && n.textContent === '閲覧に切り替える')!.fire('click'); expect(host.mode!.current).toBe('edit');
    name.value = 'x'.repeat(257); name.fire('input'); button('ファイルに保存').fire('click');
    expect(status.dataset.busy).toBe('true'); expect(status.textContent).toBe('ファイルを作成しています。');
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(status.dataset.busy).toBe('false'); expect(status.textContent).not.toBe('ファイルを作成しています。');
    expect(name.value).toBe('x'.repeat(257)); expect(tools.hasChanges()).toBe(true);
    expect(host.workspaceOutput.jobs.some(j => j.purpose === 'backup')).toBe(false);
    name.value = '調査前'; name.fire('input');
    button('ファイルを選択').fire('click'); expect(button('ファイルに保存').disabled).toBe(true);
    const selected = input('保存先のファイルを選択'); Object.assign(selected, { files: [new Blob(['wrong'])] }); selected.fire('change');
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    button('ダウンロード').fire('click'); await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(button('ファイル確認を取り消す')).toBeDefined(); expect(name.value).toBe('調査前'); expect(button('保存').attributes.get('aria-pressed')).toBe('true');
    button('ファイル確認を取り消す').fire('click'); expect(tools.hasChanges()).toBe(true);
    const session = workspace.session!, before = host.read().source!.token;
    const generate = host.workspaceOutput.generateBackup.bind(host.workspaceOutput);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const generating = vi.spyOn(host.workspaceOutput, 'generateBackup').mockImplementation(async (...args) => { await gate; return generate(...args); });
    let handoffStatus: { busy: string; text: string } | undefined;
    download.mockImplementationOnce(() => {
      handoffStatus = { busy: status.dataset.busy!, text: status.textContent };
      throw Error('injected browser handoff failure');
    });
    const save = button('ファイルに保存'); save.fire('click');
    expect(status.dataset.busy).toBe('true'); expect(status.textContent).toBe('ファイルを作成しています。');
    expect(name.disabled).toBe(true); expect(button('ファイルに保存').disabled).toBe(true);
    save.fire('click'); button('ファイルに保存').fire('click'); expect(generating).toHaveBeenCalledOnce();
    release();
    await vi.waitFor(() => expect(host.workspaceOutput.jobs.some(j => j.purpose === 'backup' && j.state === 'generated')).toBe(true), { timeout: 10000 });
    await vi.waitFor(() => expect(tools.hasChanges()).toBe(false));
    expect(status.dataset.busy).toBe('false'); generating.mockRestore();
    expect(handoffStatus).toEqual({ busy: 'true', text: 'ダウンロードを準備しています。' });
    const result = host.workspaceOutput.jobs.find(j => j.purpose === 'backup')!;
    expect(result.label).toBe('調査前'); expect(result.state).toBe('generated');
    expect(output.children.find(n => n.attributes.get('role') === 'status')!.textContent).toContain('作成したファイルから再試行');
    const history = all(output).find(n => n.tag === 'summary' && n.textContent === '作成したファイル')!.parent!;
    expect(history.open).toBe(true); expect(download).toHaveBeenCalledTimes(2);
    const savedRow = all(history).find(n => n.textContent.startsWith('バックアップ 調査前'))!.parent!;
    all(savedRow).find(n => n.tag === 'button' && n.textContent === 'ダウンロード')!.fire('click');
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(host.workspaceOutput.jobs.filter(j => j.purpose === 'backup').map(j => j.id)).toEqual([result.id]);
    expect(output.children.find(n => n.attributes.get('role') === 'status')!.textContent).toBe('ダウンロードを開始しました。保存先で完了を確認してください。');
    expect(download).toHaveBeenCalledTimes(3);
    expect((download.mock.contexts[2] as unknown as HTMLAnchorElement).download).toBe('LociView-調査前.zip');
    expect(all(output).some(n => n.textContent.includes('バックアップ 調査前'))).toBe(true);
    const archive = await BackupArchive.inspect(await host.workspaceOutput.download(result.id), metadata);
    expect(archive.archive.control.manifest.purpose).toBe('backup'); expect(host.read().source!.token).toBe(before); expect(workspace.session).toBe(session);
    all(root).find(n => n.tag === 'button' && n.textContent === '閲覧に切り替える')!.fire('click');
    await vi.waitFor(() => expect(host.mode!.busy).toBe(false), { timeout: 10000 });
    expect(host.mode!.current, all(root).filter(n => n.attributes.get('role') === 'status').map(n => n.textContent).join('\n')).toBe('view');
    expect(button('保存').disabled).toBe(true); expect(name.disabled).toBe(true); expect(button('ファイルに保存').disabled).toBe(true);
    await workspace.dispose();
  }, 20000);
  it('refreshes warm output recovery and catalog state for both kinds without replacing the saved editor', async () => {
    const { f, fs, options } = await initialWorkspaceHostFixture(), initial = await openValidationHost({ ...options, workspaceFile: f.file });
    await initial.dispose();
    const view = await openValidationHost({ ...options, mode: 'view' }), host = createValidationModeHost(view, mode => openValidationHost({ ...options, mode }), () => {});
    const ui = createSavedWorkspace(new RecordedDocument().asDocument(), host), s = ui.session, memory = s!.memory;
    const writer = await openValidationHost(options), token = writer.read().source!.token;
    await writer.workspaceOutput.generate(token);
    const choice = writer.workspaceOutput.bases[0]!.selection;
    fs.reject = p => p.includes('/contribution-output/') && p.includes('/artifacts/');
    await expect(writer.workspaceOutput.generateContribution(token, choice)).rejects.toThrow(); fs.reject = () => false;
    const id = writer.workspaceOutput.jobs.find(j => j.purpose === 'contribution')!.id; await writer.dispose();
    await host.refresh(); ui.render();
    expect(ui.session).toBe(s); expect(s!.memory).toBe(memory);
    expect(host.workspaceOutput.bases).toHaveLength(2);
    expect(host.workspaceOutput.jobs.map(j => j.state).sort()).toEqual(['generated', 'incomplete']);
    expect((await listValidationProjects(options, options.openStorage))[0]!.state).toBe('incomplete');
    await host.mode!.change('edit', token, () => {}); await host.workspaceOutput.retry(id);
    expect((await listValidationProjects(options, options.openStorage))[0]!.state).toBe('ready');
    const prefix = `${validationArea}/${options.run}/v2/packages/contribution-output/${id}/`;
    for (const path of await fs.list(prefix)) await fs.remove(path);
    await host.refresh();
    expect(host.workspaceOutput.jobs.find(j => j.id === id)!.state).toBe('repair-required');
    expect((await listValidationProjects(options, options.openStorage))[0]!.state).toBe('unavailable');
    await ui.dispose();
    const discovery = vi.spyOn(WorkspaceSender.prototype, 'jobs').mockRejectedValueOnce(Error('出力一覧を確認できません。'));
    const cold = await openValidationHost(options); discovery.mockRestore();
    expect(cold.read().state).toBe('ready'); expect(cold.workspaceOutput.error).toBe('出力一覧を確認できません。');
    expect(cold.workspaceOutput.bases).toEqual([]);
    await expect(cold.workspaceOutput.generate(token)).rejects.toThrow('中断したファイル生成');
    await cold.dispose();
  }, 20000);
  it('receives a Workspace through the same editor, preserves local input/windows and retries failed display without republishing (recorded DOM)', async () => {
    const f = await receivedHostFixture(), host = createValidationModeHost(f.host, mode => openValidationHost({ ...f.options, mode }), () => {});
    const document = new RecordedDocument().asDocument();
    let workspace: ReturnType<typeof createSavedWorkspace>, tools: ReturnType<typeof createValidationReceiveControls>;
    tools = createValidationReceiveControls(document, host, () => workspace?.session, () => workspace?.render(), async () => {});
    workspace = createSavedWorkspace(document, host, undefined, () => tools);
    const s = workspace.session!, root = record(tools.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const form = all(root).find(n => n.tag === 'form')!, input = all(root).find(n => n.type === 'file')!;
    const before = s.snapshot.state.token, memory = s.memory, windows = s.windowMemory;
    Object.assign(input, { files: [f.file] }); input.fire('change');
    s.setSearchComposing(true); form.fire('submit', { preventDefault() {} });
    expect(host.read().source!.token).toBe(before); expect(all(root).some(n => n.textContent.includes('入力・操作を確定'))).toBe(true);
    s.setSearchComposing(false); let failDisplay = true;
    const prepare = vi.fn(async () => { if (failDisplay) throw Error('injected receive display'); });
    host.setDisplayPreparation(prepare); form.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === 'injected receive display')).toBe(true), { timeout: 10000 });
    expect(s.snapshot.state.token).toBe(before); expect(host.hasPending()).toBe(true);
    const publication = host.read().publication; expect(host.read().state).toBe('ready');
    expect(host.workspaceFiles.jobs).toHaveLength(1); expect(host.workspaceFiles.jobs[0]!.state).toBe('completed');
    all(root).find(n => n.tag === 'button' && n.textContent === '受信を再開')!.fire('click');
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(host.hasPending()).toBe(true); expect(host.authority.status!().kind).toBe('failed');
    expect(s.snapshot.state.token).toBe(before);
    failDisplay = false;
    all(root).find(n => n.tag === 'button' && n.textContent === '受信を再開')!.fire('click');
    await vi.waitFor(() => expect(host.hasPending()).toBe(false), { timeout: 10000 });
    await vi.waitFor(() => expect(s.snapshot.modelVersions).toHaveLength(2));
    expect(host.read().publication).toBe(publication); expect(workspace.session).toBe(s);
    expect(s.memory.selectedCaptionId).toBe(memory.selectedCaptionId); expect(s.windowMemory).toEqual(windows);
    expect(s.snapshot.mediaChoices).toHaveLength(1);
    const provider = host.read().provider;
    expect(provider?.kind === 'scene-provider' && provider.resources.captions[f.captionId]!.body)
      .toEqual({ kind: 'value', value: '手元の追記' });
    Object.assign(input, { files: [] }); input.fire('change'); await workspace.dispose();
  });
  it('connects real-file text conflicts to explicit resolution, guarded input, retry, ordinary editing and a second Contribution round (recorded DOM)', async () => {
    const f = await receivedHostFixture(source => {
      const doc = A.change(A.load<Record<string, any>>(source.encodeFullSource()), d => {
        const captionId = Object.keys(d.captionsById)[0]!, sceneId = Object.keys(d.scenesById)[0]!, id = `scm_${newId()}`;
        d.captionsById[captionId].body = new A.ImmutableString(json('受信した本文'));
        d.sceneCaptionMembershipsById[id] = Object.fromEntries(Object.entries({ id, sceneId, captionId, orderKey: 'A',
          lifecycle: { state: 'active', reason: 'initial', eventId: `evt_${newId()}` } }).map(([k, v]) => [k, new A.ImmutableString(json(v))]));
      });
      return ProjectMetadataSource.fromFullSource(A.save(doc), source.proof, metadata);
    });
    const ports: ValidationWorkspacePorts = { fileLimits: budget, decode, list: async () => [], selected: vi.fn(),
      open: vi.fn(async () => f.host), render: async () => ({ factory: () => { throw Error('Recorded DOM has no GPU'); }, dispose() {} }) };
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), ports, f.options.run), root = record(u.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const named = (label: string, parent = root) => all(parent).find(n => n.attributes.get('aria-label') === label)!;
    const button = (text: string, parent = root) => all(parent).find(n => n.tag === 'button' && n.textContent === text)!;
    const choose = (node: RecordedNode, value: string) => { node.value = value; node.fire(node.tag === 'select' ? 'change' : 'input'); };
    const value = () => f.host.authority.read().resources.captions[f.captionId]!.body;
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    expect(button('開発用の更新を受け取る')).toBeUndefined();
    const fileInput = named('更新ファイルを選択'), receive = fileInput.parent!.parent!;
    const setFile = (file: Blob) => { Object.assign(fileInput, { files: [file] }); fileInput.fire('change'); };
    const submit = () => receive.fire('submit', { preventDefault() {} });
    const clearFile = () => { Object.assign(fileInput, { files: [] }); button('選択を取り消す', receive).fire('click'); };
    const received = () => vi.waitFor(() => {
      expect(all(root).some(n => n.textContent === '更新を受け取りました。')).toBe(true);
      expect(button('更新を受け取る').disabled).toBe(false);
    }, { timeout: 10000 });
    setFile(f.file); submit();
    await vi.waitFor(() => expect(value().kind).toBe('unresolved'), { timeout: 10000 });
    await received(); clearFile();
    const list = named('未解決の候補'); expect(list.children).toHaveLength(1);
    let form = list.children[0]!, choice = all(form).find(n => n.tag === 'select')!, text = all(form).find(n => n.tag === 'textarea')!;
    expect(choice.value).toBe(''); expect(button('競合を解消', form).disabled).toBe(true);
    expect(all(form).some(n => n.textContent.includes('手元の追記'))).toBe(true);
    expect(all(form).some(n => n.textContent.includes('受信した本文'))).toBe(true);
    choose(choice, 'manual'); choose(text, '合意した本文'); const token = f.host.read().source!.token;
    text.fire('compositionstart'); button('競合を解消', form).fire('click');
    expect(button('競合を解消', form).disabled).toBe(true); expect(f.host.read().source!.token).toBe(token);
    button('プロジェクトを選ぶ').fire('click');
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.includes('プロジェクトを切り替えて'))).toBe(true));
    expect(u.selected).toBe(f.options.run); expect(ports.open).toHaveBeenCalledOnce();
    button('閲覧に切り替える').fire('click'); expect(f.host.authority.readOnly).toBe(false);
    setFile(f.file); submit(); expect(f.host.read().source!.token).toBe(token);
    expect(all(root).some(n => n.textContent.includes('入力・操作を確定'))).toBe(true);
    clearFile(); text.fire('compositionend'); expect(text.value).toBe('合意した本文');
    expect(button('競合を解消', form).disabled).toBe(false);
    f.fs.reject = path => path.endsWith('/published.json'); button('競合を解消', form).fire('click');
    await vi.waitFor(() => expect(f.host.authority.status!().kind).toBe('failed'));
    expect(text.value).toBe('合意した本文'); expect(u.hasChanges()).toBe(true);
    const paths = (await f.fs.list(`${validationArea}/${f.options.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => f.fs.readBytes(p)));
    f.fs.reject = () => false; button('更新を再試行', named('更新の確認')).fire('click');
    await vi.waitFor(() => expect(value()).toEqual({ kind: 'value', value: '合意した本文' }));
    await vi.waitFor(() => expect(list.children).toHaveLength(0));
    expect(await Promise.all(paths.map(p => f.fs.readBytes(p)))).toEqual(bytes);
    all(root).find(n => n.className === 'lv-caption-select')!.fire('click');
    const detail = named('キャプションの詳細'); choose(named('本文', detail), '解消後の追記');
    expect(button('変更を適用', detail).disabled).toBe(false); button('変更を適用', detail).fire('click');
    await vi.waitFor(() => expect(value()).toEqual({ kind: 'value', value: '解消後の追記' }));

    const participant = firstWorkspaceRecipient(), first = await participant.receiver.importWorkspace(f.file);
    await participant.session.editCaption(first.source!.token, f.captionId, 'body', '二巡目の本文');
    const reply = await contributionFile(participant.session, participant.fs, participant.store);
    setFile(reply.file); submit();
    await vi.waitFor(() => expect(value().kind).toBe('unresolved'), { timeout: 10000 });
    await received(); clearFile();
    form = list.children[0]!; choice = all(form).find(n => n.tag === 'select')!;
    expect(choice.value).toBe('');
    const provider = f.host.read().provider; if (provider?.kind !== 'scene-provider') throw Error('provider');
    const field = provider.inspection.candidates.fields.find(v => v.path.join('/') === `captionsById/${f.captionId}/body`)!;
    const candidate = field.candidates.find(c => c.value.kind === 'value' && c.value.value === '二巡目の本文')!;
    choose(choice, candidate.operationId); button('競合を解消', form).fire('click');
    await vi.waitFor(() => expect(value()).toEqual({ kind: 'value', value: '二巡目の本文' }));
    await vi.waitFor(() => expect(list.children).toHaveLength(0));
    const final = f.host.read().source!; setFile(reply.file); submit();
    await received(); clearFile();
    expect(f.host.read().source!.token).toBe(final.token); expect(f.host.read().source!.originalChanges()).toEqual(final.originalChanges());
    const resolve = vi.spyOn(f.host, 'resolve'); await u.dispose();
    button('競合を解消', form).fire('click'); expect(resolve).not.toHaveBeenCalled(); resolve.mockRestore();
    const cold = await openValidationHost(f.options);
    expect(cold.authority.read().resources.captions[f.captionId]!.body).toEqual({ kind: 'value', value: '二巡目の本文' });
    expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges());
    const originals = new Map(final.originalChanges().map(b => [A.decodeChange(b).hash, b]));
    for (const b of [...f.local.source!.originalChanges(), ...reply.current.source!.originalChanges()]) expect(originals.get(A.decodeChange(b).hash)).toEqual(b);
    await cold.dispose();
  }, 30000);
  it('connects real-file pin, Scene and View choices, preserves warm display and explicitly recovers cold startup before returning edits', async () => {
    const f = await openFileCaption(), { host, captionId } = f, sceneId = f.s.sceneId, secondScene = `scn_${newId()}`, viewId = `view_${newId()}`;
    const capture = () => ({ camera: { position: [1, 2, 8] as const, target: [0, 0, 0] as const, up: [0, 1, 0] as const,
      projection: { kind: 'perspective' as const, verticalFovRadians: 0.7 } }, background: { kind: 'solid' as const, colorSrgb: [0.2, 0.3, 0.4] as const } });
    await host.authority.authorScene!(host.read().source!.token, { kind: 'createScene', sceneId: secondScene, sourceSceneId: sceneId,
      activeSceneId: sceneId, name: '詳細', orderKey: 'B', membershipIds: [`sam_${newId()}`], eventId: `evt_${newId()}` });
    const write = (changes: Record<string, string>) => host.authority.write(host.read().source!.token, changes, { sceneId });
    await write({ [`view/${viewId}/identity`]: json({ id: viewId, sceneId, projectFrameId: f.s.snapshot.resources.projectFrameId }),
      [`view/${viewId}/name`]: '入口', [`view/${viewId}/order`]: 'M', [`view/${viewId}/camera`]: json(capture().camera),
      [`view/${viewId}/background`]: json(capture().background), [`view/${viewId}/lifecycle`]: json({ state: 'active', reason: 'initial', eventId: `evt_${newId()}` }) });
    await write({ [`scene/${sceneId}/entry`]: json(viewId) });
    const seed = host.read().source!, original = host.authority.read(), anchor = original.resources.captions[captionId]!.anchor;
    if (anchor.kind !== 'value' || anchor.value.kind !== 'asset') throw Error('asset anchor');
    const assetId = anchor.value.assetId, initialFile = await host.workspaceOutput.download(await host.workspaceOutput.generate(seed.token));
    const base = host.workspaceOutput.bases[0]!.selection, peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(initialFile);
    await write({ [`caption/${captionId}/anchor`]: json({ ...anchor.value, positionAsset: [1, 2, 3] }) });
    await write({ [`caption/${captionId}/color`]: '#123456', [`caption/${captionId}/body`]: '手元の記録' });
    await host.authority.authorScene!(host.read().source!.token, { kind: 'renameScene', sceneId, name: '手元のシーン' });
    await write({ [`view/${viewId}/name`]: '手元の視点', [`view/${viewId}/camera`]: json({ ...capture().camera, position: [3, 2, 8] }),
      [`view/${viewId}/background`]: json({ kind: 'solid', colorSrgb: [0.4, 0.5, 0.6] }) });
    await write({ [`view/${viewId}/order`]: 'A' }); await write({ [`scene/${sceneId}/entry`]: 'null' });
    await host.authority.authorScene!(host.read().source!.token, { kind: 'setDefaultScene', sceneId: secondScene });
    const remoteAnchor = { ...anchor.value, positionAsset: [4, 2, 1] }, remoteCamera = { position: [9, 3, 6], target: [1, 1, 0], up: [0, 1, 0],
      projection: { kind: 'orthographic', verticalSpan: 12.34567 } }, remoteBackground = { kind: 'solid', colorSrgb: [0.1234567, 0.8, 0.2] };
    const fields: ['captionsById' | 'scenesById' | 'viewsById', string, string, unknown][] = [['captionsById', captionId, 'anchor', remoteAnchor], ['captionsById', captionId, 'colorSrgb', undefined],
      ['scenesById', sceneId, 'name', '受信側のシーン'], ['scenesById', sceneId, 'defaultViewId', viewId],
      ['viewsById', viewId, 'name', '受信側の視点'], ['viewsById', viewId, 'orderKey', 'Z'],
      ['viewsById', viewId, 'camera', remoteCamera], ['viewsById', viewId, 'background', remoteBackground]];
    // Concurrent whole-field source fixture. Import still uses the real archive/content/history checks.
    const doc = A.change(A.load<Record<string, any>>(seed.encodeFullSource()), d => {
      for (const [map, id, key, value] of fields) {
        delete d[map][id][key]; if (value !== undefined) d[map][id][key] = new A.ImmutableString(json(value));
      }
      delete d.project.defaultSceneId; d.project.defaultSceneId = new A.ImmutableString(json(sceneId));
    });
    const remote = ProjectMetadataSource.fromFullSource(A.save(doc), seed.proof, metadata), contentFS = new TestFS(),
      content = new ValidationContent(contentFS, f.store, budget, decode);
    const provider = await underWriteLease(contentFS, () => readProjectScene(remote.read(), metadata, content.verifier(true)));
    const publication = newId(), send = await WorkspaceSourceCapture.prepare({ read: async () => ({ state: 'ready', source: remote, provider, publication }) }, remote.token, f.store, metadata);
    const chunks: BlobPart[] = []; await writeWorkspaceArchive(send, f.store, new WritableStream({ write: b => { chunks.push(b.slice() as BlobPart); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' }); const incoming = new Blob(chunks);
    await peer.receiver.receive((await peer.session.read()).source!.token, incoming);
    f.workspace.unmount();
    let display: ReturnType<typeof syntheticDisplay> | undefined;
    const recall = vi.fn(), background = vi.fn(), factory = vi.fn(() => ({ update(next: Parameters<ReturnType<import('../src/harness/projectScene/viewportHost').ViewportFactory>['update']>[0]) {
      if (next.readOnly) throw Error('editor'); display = next;
    }, setActive() {}, capture, recall, setBackground: background, camera() {}, retry() {}, dispose() {},
    read: () => ({ token: 'local-camera', ready: true, issue: null, dragging: false, projection: 'perspective' as const, axis: null, pins: [] }) }));
    const ports: ValidationWorkspacePorts = { fileLimits: budget, decode, list: async () => [], selected() {}, open: async () => host,
      render: async () => ({ factory, dispose() {} }) };
    let u = createValidationWorkspace(new RecordedDocument().asDocument(), ports, f.options.run), root = record(u.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const named = (label: string, parent = root) => all(parent).find(n => n.attributes.get('aria-label') === label)!;
    const button = (text: string, parent = root) => all(parent).find(n => n.tag === 'button' && n.textContent === text)!;
    const choose = (node: RecordedNode, value: string) => { node.value = value; node.fire(node.tag === 'select' ? 'change' : 'input'); };
    const mounted = () => vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    await mounted();
    // The warm editor's explicit Scene remains local even while its shared startup changes.
    button('手元のシーン', named('シーン')).fire('click'); expect(display!.sceneId).toBe(sceneId); const factoryCount = factory.mock.calls.length;
    const input = named('更新ファイルを選択'), receive = input.parent!.parent!;
    Object.assign(input, { files: [incoming] }); input.fire('change'); receive.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === '更新を受け取りました。')).toBe(true), { timeout: 10000 });
    Object.assign(input, { files: [] }); button('選択を取り消す', receive).fire('click');
    const p = () => { const value = host.read().provider; if (value?.kind !== 'scene-provider') throw Error('provider'); return value; };
    const list = named('未解決の候補'); expect(list.children).toHaveLength(8);
    expect(display!.sceneId).toBe(sceneId); expect(display!.models.every(m => m.shape === 'saved-glb')).toBe(true);
    expect(display!.pins.some(pin => pin.id === captionId)).toBe(false); expect(p().state.defaultSceneId.kind).toBe('unresolved');
    for (const [map, id, key, remoteValue] of fields) {
      const expected = key === 'defaultViewId' ? undefined : remoteValue;
      const field = p().inspection.candidates.fields.find(c => c.path.join('/') === `${map}/${id}/${key}`)!;
      expect(field.candidates).toHaveLength(2);
      const selected = field.candidates.find(c => expected === undefined ? c.value.kind === 'absent' : c.value.kind === 'value' && json(c.value.value) === json(expected))!;
      const form = list.children.find(n => all(n).some(c => c.tag === 'option' && c.value === selected.operationId))!;
      const select = all(form).find(n => n.tag === 'select')!, confirm = button('競合を解消', form), before = host.read().source!;
      expect(select.value).toBe(''); expect(confirm.disabled).toBe(true); choose(select, selected.operationId);
      expect(host.read().source!.token).toBe(before.token); expect(recall).not.toHaveBeenCalled(); expect(background).not.toHaveBeenCalled();
      if (key === 'anchor') {
        expect(display!.preview).toEqual(pointInProject(remoteAnchor.positionAsset as [number, number, number], original.modelVersions![0]!.closure.binding.assetToProject));
        expect(display!.pinEdit).toBeUndefined(); expect(display!.pins.some(pin => pin.id === captionId)).toBe(false);
        f.fs.reject = path => path.endsWith('/published.json'); confirm.fire('click');
        await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'));
        expect(host.read().source!.token).toBe(before.token);
        const paths = (await f.fs.list(`${validationArea}/${f.options.run}/`)).filter(path => path.endsWith('.amchange'));
        const bytes = await Promise.all(paths.map(path => f.fs.readBytes(path)));
        select.value = field.candidates.find(c => c.operationId !== selected.operationId)!.operationId;
        f.fs.reject = () => false; button('更新を再試行', named('更新の確認')).fire('click');
        await vi.waitFor(() => expect(host.read().source!.token).not.toBe(before.token));
        expect(await Promise.all(paths.map(path => f.fs.readBytes(path)))).toEqual(bytes);
      } else {
        Object.assign(input, { files: [incoming] }); input.fire('change'); confirm.fire('click');
        expect(confirm.disabled).toBe(true); expect(host.read().source!.token).toBe(before.token);
        Object.assign(input, { files: [] }); button('選択を取り消す', receive).fire('click'); confirm.fire('click');
      }
      await vi.waitFor(() => expect(list.children.includes(form)).toBe(false));
      expect(p().details.mutable[map][id]![key]).toEqual({ kind: 'value', value: expected });
      expect(display!.sceneId).toBe(sceneId); expect(factory).toHaveBeenCalledTimes(factoryCount);
      expect(recall).not.toHaveBeenCalled(); expect(background).not.toHaveBeenCalled();
    }
    expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '手元の記録' });
    expect(host.authority.read().modelVersions).toEqual(original.modelVersions);
    expect(host.authority.read().state.assetMemberships).toEqual(original.state.assetMemberships);
    all(root).find(n => n.className === 'lv-caption-select')!.fire('click');
    const detail = named('キャプションの詳細'); choose(named('本文', detail), '解消後の記録'); button('変更を適用', detail).fire('click');
    await vi.waitFor(() => expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '解消後の記録' }));
    expect(p().details.mutable.captionsById[captionId]!.colorSrgb).toEqual({ kind: 'value', value: undefined });
    const warm = host.read().source!; await u.dispose();
    const cold = await openValidationHost(f.options); factory.mockClear();
    u = createValidationWorkspace(new RecordedDocument().asDocument(), { ...ports, open: async () => cold }, f.options.run); root = record(u.root); await mounted();
    expect(factory).not.toHaveBeenCalled(); expect(named('開始シーンの競合').hidden).toBe(false);
    const startup = named('残す開始シーン'); expect(startup.value).toBe(''); expect(button('開始シーンを確定').disabled).toBe(true);
    const coldProvider = cold.read().provider!; if (coldProvider.kind !== 'scene-provider') throw Error('provider');
    const selected = coldProvider.inspection.candidates.fields.find(c => c.path.join('/') === 'project/defaultSceneId')!.candidates
      .find(c => c.value.kind === 'value' && c.value.value === sceneId)!;
    choose(startup, selected.operationId); button('開始シーンを確定').fire('click');
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce()); expect(display!.sceneId).toBe(sceneId);
    expect(cold.read().source!.originalChanges()).toHaveLength(warm.originalChanges().length + 1);
    await cold.authority.write(cold.read().source!.token, { [`view/${viewId}/name`]: '解消後の視点' }, { sceneId });
    await cold.authority.authorScene!(cold.read().source!.token, { kind: 'renameScene', sceneId, name: '解消後のシーン' });
    const final = cold.read().source!, reply = await cold.workspaceOutput.download(await cold.workspaceOutput.generateContribution(final.token, base));
    const received = await peer.receiver.receive((await peer.session.read()).source!.token, reply);
    expect(received.source!.heads).toEqual(final.heads);
    expect(new Map(received.source!.originalChanges().map(b => [A.decodeChange(b).hash, b]))).toEqual(new Map(final.originalChanges().map(b => [A.decodeChange(b).hash, b])));
    expect((await peer.receiver.receive(received.source!.token, reply)).source!.token).toBe(received.source!.token);
    await u.dispose(); const reopened = await openValidationHost(f.options);
    expect(reopened.read().source!.originalChanges()).toEqual(final.originalChanges()); expect(new SyntheticSession(reopened.authority).sceneId).toBe(sceneId);
    expect(reopened.authority.read().resources.captions[captionId]!.anchor).toEqual({ kind: 'value', value: remoteAnchor });
    expect(reopened.authority.read().viewData!.records[viewId]!.camera).toEqual({ kind: 'value', value: remoteCamera });
    expect(assetId).toBe(reopened.authority.read().modelVersions![0]!.assetId); await reopened.dispose();
  }, 60000);
  it('restores a received Caption parent, explicitly reattaches, keeps independent duplicates and returns their edits through real files (recorded DOM)', async () => {
    const f = await initialWorkspaceHostFixture(source => {
      const doc = A.change(A.load<Record<string, any>>(source.encodeFullSource()), d => {
        const captionId = Object.keys(d.captionsById)[0]!, sceneId = Object.keys(d.scenesById)[0]!, id = `scm_${newId()}`;
        d.sceneCaptionMembershipsById[id] = Object.fromEntries(Object.entries({ id, sceneId, captionId, orderKey: 'A',
          lifecycle: { state: 'active', reason: 'initial', eventId: `evt_${newId()}` } }).map(([k, v]) => [k, new A.ImmutableString(json(v))]));
      });
      return ProjectMetadataSource.fromFullSource(A.save(doc), source.proof, metadata);
    });
    const host = await openValidationHost({ ...f.options, workspaceFile: f.f.file }), peer = firstWorkspaceRecipient();
    const seed = await peer.receiver.importWorkspace(f.f.file), captionId = f.f.captionId, sceneId = Object.keys(host.authority.read().state.scenes)[0]!;
    const originalAttachment = captionAttachments(host.authority.read().mediaData, captionId).ready[0]!.id;
    const oldEdge = Object.keys(host.authority.read().state.captionMemberships)[0]!;
    const provider = () => { const p = host.read().provider; if (p?.kind !== 'scene-provider') throw Error('provider'); return p; };
    const children = () => [provider().details.mutable.sceneCaptionMembershipsById[oldEdge], provider().details.mutable.captionAttachmentsById[originalAttachment]];
    const ports: ValidationWorkspacePorts = { fileLimits: budget, decode, list: async () => [], selected: vi.fn(), open: async () => host,
      render: async () => ({ factory: () => { throw Error('Recorded DOM has no GPU'); }, dispose() {} }) };
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), ports, f.run), root = record(u.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const named = (label: string, parent = root) => all(parent).find(n => n.attributes.get('aria-label') === label)!;
    const button = (text: string, parent = root) => all(parent).find(n => n.tag === 'button' && n.textContent === text)!;
    const choose = (node: RecordedNode, value: string) => { node.value = value; node.fire(node.tag === 'select' ? 'change' : 'input'); };
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    const fileInput = named('更新ファイルを選択'), receive = fileInput.parent!.parent!;
    const receiveFile = async (file: Blob) => {
      Object.assign(fileInput, { files: [file] }); fileInput.fire('change'); receive.fire('submit', { preventDefault() {} });
      await vi.waitFor(() => expect(button('更新を受け取る').disabled).toBe(false), { timeout: 10000 });
      Object.assign(fileInput, { files: [] }); button('選択を取り消す', receive).fire('click');
    };
    const returnFile = async () => host.workspaceOutput.download(await host.workspaceOutput.generateContribution(
      host.read().source!.token, host.workspaceOutput.bases[0]!.selection));
    const selectCaption = (id: string) => {
      const snapshot = host.authority.read(), scene = resolveScene(snapshot.state, snapshot.resources, sceneId);
      if (scene.kind === 'blocked') throw Error('scene');
      const index = scene.composition.captions.findIndex(c => c.captionId === id); expect(index).toBeGreaterThanOrEqual(0);
      all(root).filter(n => n.className === 'lv-caption-select')[index]!.fire('click');
    };
    selectCaption(captionId); button('プロジェクトから削除').fire('click'); button('削除する', named('削除の確認')).fire('click');
    await vi.waitFor(() => expect(host.authority.read().resources.captions[captionId]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'deleted' } }));
    const tombstones = children(); expect(tombstones.every(c => {
      const life = c?.lifecycle; return life?.kind === 'value' && (life.value as JsonObject).state === 'deleted';
    })).toBe(true);
    await peer.session.editCaption(seed.source!.token, captionId, 'body', '削除と同時の追記');
    await receiveFile((await contributionFile(peer.session, peer.fs, peer.store)).file);
    expect(provider().issues.some(i => i.code === 'concurrent-delete-edit')).toBe(true);
    const lifecycle = named('キャプションの削除・復元'), lifeChoice = all(lifecycle).find(n => n.tag === 'select')!, restoreButton = button('選択を確定', lifecycle);
    expect(lifeChoice.value).toBe(''); expect(button('選択を確定', lifecycle).disabled).toBe(true);
    expect(all(lifecycle).some(n => n.textContent.includes('削除済み・復元しません'))).toBe(true);
    const unchangedFields = () => provider().inspection.candidates.fields.filter(v => v.path.join('/') !== `captionsById/${captionId}/lifecycle`).map(v => ({ path: v.path, candidates: v.candidates }));
    const beforeRestore = unchangedFields(); choose(lifeChoice, 'active'); button('選択を確定', lifecycle).fire('click');
    await vi.waitFor(() => expect(host.authority.read().resources.captions[captionId]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'active', reason: 'restore' } }));
    expect(unchangedFields()).toEqual(beforeRestore); expect(children()).toEqual(tombstones);
    expect(captionAttachments(host.authority.read().mediaData, captionId).ready).toHaveLength(0);
    const restored = await peer.receiver.receive((await peer.session.read()).source!.token, await returnFile());
    // Both parties see the restored parent, but neither sees the other's new registration yet.
    const include = all(root).find(n => n.className === 'lv-caption-include')!;
    choose(named('キャプション', include), captionId); button('このシーンに追加', include).fire('click');
    await vi.waitFor(() => expect(button('このシーンから外す', include)?.disabled).toBe(false));
    selectCaption(captionId); const media = named('メディア');
    button(f.f.image.label as string, named('メディアを選択', media)).fire('click'); button('選択したメディアを添付', media).fire('click');
    await vi.waitFor(() => expect(captionAttachments(host.authority.read().mediaData, captionId).ready).toHaveLength(1));
    const attachment = captionAttachments(host.authority.read().mediaData, captionId).ready[0]!; expect(attachment.id).not.toBe(originalAttachment);
    await peer.session.edit(restored.source!.token, { kind: 'include', sceneId, resourceKind: 'caption', resourceId: captionId,
      membershipId: `scm_${newId()}`, orderKey: 'B', eventId: `evt_${newId()}` });
    await receiveFile((await contributionFile(peer.session, peer.fs, peer.store)).file);
    const duplicates = named('重複した登録'), original = named('元として残す登録', duplicates), choice = named('重複の解消方法', duplicates), copyButton = button('登録の重複を解消', duplicates);
    expect(original.value).toBe(''); expect(choice.value).toBe(''); expect(button('登録の重複を解消', duplicates).disabled).toBe(true);
    choose(original, original.children[1]!.value); choose(choice, 'both');
    const sourceCaption = host.authority.read().resources.captions[captionId], token = host.read().source!.token;
    button('プロジェクトを選ぶ').fire('click');
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.includes('プロジェクトを切り替えて'))).toBe(true)); expect(u.selected).toBe(f.run);
    Object.assign(fileInput, { files: [f.f.file] }); fileInput.fire('change'); receive.fire('submit', { preventDefault() {} });
    expect(host.read().source!.token).toBe(token); expect(button('登録の重複を解消', duplicates).disabled).toBe(true);
    Object.assign(fileInput, { files: [] }); button('選択を取り消す', receive).fire('click');
    f.fs.reject = path => path.endsWith('/published.json'); button('登録の重複を解消', duplicates).fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'));
    expect(Object.keys(host.authority.read().resources.captions)).toEqual([captionId]); expect(choice.value).toBe('both');
    const paths = (await f.fs.list(`${validationArea}/${f.run}/`)).filter(p => p.endsWith('.amchange')), bytes = await Promise.all(paths.map(p => f.fs.readBytes(p)));
    f.fs.reject = () => false; button('更新を再試行', named('更新の確認')).fire('click');
    await vi.waitFor(() => expect(duplicates.children).toHaveLength(0));
    expect(await Promise.all(paths.map(p => f.fs.readBytes(p)))).toEqual(bytes);
    const copyId = Object.keys(host.authority.read().resources.captions).find(id => id !== captionId)!; expect(copyId).toBeTruthy();
    expect(Object.keys(host.authority.read().resources.captions)).toHaveLength(2);
    const copiedAttachment = captionAttachments(host.authority.read().mediaData, copyId).ready[0]!;
    expect(copiedAttachment.id).not.toBe(attachment.id); expect(copiedAttachment.mediaResourceId).toEqual(attachment.mediaResourceId);
    selectCaption(copyId); const detail = named('キャプションの詳細');
    expect(named('本文', detail).readOnly, 'independent copy body must be editable').toBe(false);
    choose(named('本文', detail), 'コピーだけの追記');
    expect(button('変更を適用', detail).disabled, 'independent copy edit must be actionable').toBe(false);
    // Await the actual command dispatched by the button, not an incidental 1s
    // polling deadline. This file roundtrip is not a storage-latency assertion.
    const clickWrite = async (control: RecordedNode) => {
      expect(control.disabled).toBe(false);
      const write = vi.spyOn(host.authority, 'write');
      try {
        control.fire('click');
        expect(write).toHaveBeenCalledTimes(1);
        expect(write.mock.results[0]!.type).toBe('return');
        await write.mock.results[0]!.value;
      } finally { write.mockRestore(); }
    };
    await clickWrite(button('変更を適用', detail));
    await vi.waitFor(() => expect(host.authority.read().resources.captions[copyId]!.body, JSON.stringify({
      status: host.authority.status?.(), originalBody: host.authority.read().resources.captions[captionId]!.body,
      selected: all(root).filter(n => n.className === 'lv-caption-select').map(n => n.attributes.get('aria-current')),
    })).toEqual({ kind: 'value', value: 'コピーだけの追記' }));
    // Host publication precedes UI acknowledgment; do not click through its busy state.
    await vi.waitFor(() => expect(button('説明を編集', media).disabled).toBe(false));
    button('説明を編集', media).fire('click'); choose(named('メディアの説明', media), 'コピーだけの添付説明');
    await clickWrite(button('説明を適用', media));
    await vi.waitFor(() => expect(captionAttachments(host.authority.read().mediaData, copyId).ready[0]!.altText).toEqual({ kind: 'value', value: 'コピーだけの添付説明' }));
    expect(host.authority.read().resources.captions[captionId]).toEqual(sourceCaption);
    expect(captionAttachments(host.authority.read().mediaData, captionId).ready).toEqual([attachment]); expect(children()).toEqual(tombstones);
    const final = host.read().source!, file = await returnFile(), received = await peer.receiver.receive((await peer.session.read()).source!.token, file);
    expect(received.source!.token).toBe(final.token);
    // Concurrent branches admit multiple topological orders; identity is exact bytes by change hash.
    const changeMap = (source: ProjectMetadataSource) => new Map(source.originalChanges().map(b => [A.decodeChange(b).hash, b]));
    expect(changeMap(received.source!)).toEqual(changeMap(final));
    expect((await peer.receiver.receive(received.source!.token, file)).source!.originalChanges()).toEqual(received.source!.originalChanges());
    const resolve = vi.spyOn(host, 'resolve'); await u.dispose(); restoreButton.fire('click'); copyButton.fire('click');
    expect(resolve).not.toHaveBeenCalled(); resolve.mockRestore();
    const cold = await openValidationHost(f.options);
    expect(cold.read().source!.token).toBe(final.token); expect(changeMap(cold.read().source!)).toEqual(changeMap(final));
    expect(cold.authority.read().resources.captions[copyId]!.body).toEqual({ kind: 'value', value: 'コピーだけの追記' });
    expect(captionAttachments(cold.authority.read().mediaData, copyId).ready[0]).toMatchObject({ id: copiedAttachment.id,
      altText: { kind: 'value', value: 'コピーだけの添付説明' } });
    const originals = new Map(final.originalChanges().map(b => [A.decodeChange(b).hash, b]));
    for (const b of seed.source!.originalChanges()) expect(originals.get(A.decodeChange(b).hash)).toEqual(b);
    await cold.dispose();
  }, 30000);
  it('shows cold input recovery before mounting the real-file editor and blocks readonly receive', async () => {
    const f = await receivedHostFixture(), writeStream = f.fs.writeStream.bind(f.fs);
    const interrupted = vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (path.endsWith('/input.zip')) { await stream.cancel(); throw Error('injected quota'); }
      return writeStream(path, stream);
    });
    await expect(f.host.workspaceFiles.receive(f.host.read().source!.token, f.file)).rejects.toThrow('injected quota');
    expect(f.host.hasPending()).toBe(true); const id = f.host.workspaceFiles.jobs[0]!.id;
    await expect(f.host.authority.authorScene!(f.host.read().source!.token, { kind: 'renameScene', sceneId: Object.keys(f.host.authority.read().state.scenes)[0]!, name: '拒否' })).rejects.toThrow('中断した受信');
    await f.host.dispose(); interrupted.mockRestore();
    const view = await openValidationHost({ ...f.options, mode: 'view' });
    await expect(view.workspaceFiles.reselectInput(view.read().source!.token, id, f.file)).rejects.toThrow('閲覧専用'); await view.dispose();
    const render = vi.fn(async () => ({ factory: (() => { throw Error('Recorded DOM has no GPU'); }) as ViewportFactory, dispose() {} }));
    const workspace = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, list: async () => [], selected() {}, render,
      open: async (_run, _initial, mode) => openValidationHost({ ...f.options, mode }) }, f.options.run, 'view');
    const root = record(workspace.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === '元のファイルを選び直す')).toBe(true));
    expect(render).not.toHaveBeenCalled();
    expect(all(root).find(n => n.tag === 'button' && n.textContent === '元のファイルを選び直す')!.disabled).toBe(true);
    all(root).find(n => n.tag === 'button' && n.textContent === '編集を開始する')!.fire('click');
    await vi.waitFor(() => expect(all(root).find(n => n.tag === 'button' && n.textContent === '元のファイルを選び直す')!.disabled).toBe(false));
    for (const n of all(root).filter(n => n.type === 'file')) Object.assign(n, { click: vi.fn() }); // Native picker is not simulated.
    all(root).find(n => n.tag === 'button' && n.textContent === '元のファイルを選び直す')!.fire('click');
    const input = all(root).find(n => n.attributes.get('aria-label') === '元のファイルを選び直す')!;
    Object.assign(input, { files: [f.file] }); input.fire('change');
    input.parent!.parent!.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce(), { timeout: 10000 });
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    await workspace.dispose();
  });
  it('keeps cold output recovery available when the model renderer fails (recorded DOM)', async () => {
    const f = await receivedHostFixture(), writeStream = f.fs.writeStream.bind(f.fs);
    const interrupted = vi.spyOn(f.fs, 'writeStream').mockImplementation(async (path, stream) => {
      if (path.includes('/artifacts/')) { await stream.cancel(); throw Error('output interrupted'); }
      return writeStream(path, stream);
    });
    await expect(f.host.workspaceOutput.generate(f.host.read().source!.token)).rejects.toThrow();
    expect(f.host.hasPending()).toBe(false); await f.host.dispose(); interrupted.mockRestore();
    const workspace = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, list: async () => [], selected() {},
      render: async () => { throw Error('renderer unavailable'); }, open: async (_run, _initial, mode) => openValidationHost({ ...f.options, mode }) }, f.options.run);
    const root = record(workspace.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === 'renderer unavailable')).toBe(true));
    const retry = all(root).find(n => n.tag === 'button' && n.textContent === '生成を再開')!;
    expect(retry.disabled).toBe(false); retry.fire('click');
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.includes('生成済み・ファイルへの保存は未確認'))).toBe(true), { timeout: 10000 });
    await vi.waitFor(() => expect(workspace.hasChanges()).toBe(false)); await workspace.dispose();
  });
  it('counts retained output artifact sizes against receive capacity before writing new input', async () => {
    const f = await workspaceFileFixture(), path = `v2/packages/output/${newId()}/artifacts/${newId()}.zip`;
    await f.fs.writeBytes(path, new Uint8Array([0])); const read = f.fs.readStream.bind(f.fs);
    // Virtual file size only; no GiB allocation or performance claim.
    vi.spyOn(f.fs, 'readStream').mockImplementation(async p => p === path ? { size: 2_147_483_648, stream: () => { throw Error('body must not be read'); } } : read(p));
    const before = await f.fs.list('');
    await expect(f.receiverService.receive(f.local.source!.token, f.file)).rejects.toThrow('receive-space-budget');
    expect(await f.fs.list('')).toEqual(before); expect((await f.receiver.session.read()).source!.token).toBe(f.local.source!.token);
  });
  it('receives an actual Workspace ZIP with new GLB/PNG, retains local edits, records the declared base and replays without writes', async () => {
    const f = await workspaceFileFixture(), result = await f.receiverService.receive(f.local.source!.token, f.file);
    expect(result.state).toBe('ready'); expect(result.provider?.kind).toBe('scene-provider');
    if (result.provider?.kind !== 'scene-provider') throw Error('provider');
    expect(result.provider.resources.captions[f.captionId]!.body).toEqual({ kind: 'value', value: '手元の追記' });
    expect(result.provider.details.immutable.representationsById[f.model.representation.id as string]).toBeDefined();
    const jobs = await f.receiverService.jobs(); expect(jobs).toHaveLength(1); expect(jobs[0]!.state).toBe('completed');
    const paths = await f.fs.list('v2/packages/bases/'); expect(paths).toHaveLength(1);
    const base = JSON.parse((await f.fs.readText(paths[0]!))!);
    expect(base.declaredHeads).toEqual(f.source.heads); expect(base.completions[0].publishedReceiverHeads).toEqual(result.source!.heads);
    expect(result.source!.heads).not.toEqual(f.source.heads);
    const cold = f.reopen(), service = new WorkspaceReceiver(f.fs, f.fs, cold.session, metadata, f.locks), writes = vi.spyOn(f.fs, 'writeText');
    expect((await service.receive(result.source!.token, f.file)).source!.token).toBe(result.source!.token);
    expect((await service.retry(jobs[0]!.id)).source!.token).toBe(result.source!.token); expect(writes).not.toHaveBeenCalled();
    expect(await f.fs.list('v2/packages/bases/')).toEqual(paths);
  });
  it.each(['facts', 'prepared', 'observation', 'base'] as const)('cold-recovers actual Workspace input after %s interruption without duplicate publication', async point => {
    const f = await workspaceFileFixture();
    f.fs.reject = p => point === 'facts' ? p.includes('/metadata/evidence/') : point === 'prepared' ? p.endsWith('/metadataDurable.json') : point === 'observation' ? p.includes('/steps/') : p.includes('/packages/bases/');
    await expect(f.receiverService.receive(f.local.source!.token, f.file)).rejects.toThrow('injected quota');
    const ids = await WorkspaceReceiveJob.ids(f.fs); expect(ids).toHaveLength(1);
    f.fs.reject = () => false;
    if (point === 'observation' || point === 'base') {
      const published = await f.receiver.session.read();
      await f.receiver.session.editCaption(published.source!.token, f.captionId, 'title', '受信処理の後の追記');
    }
    const cold = f.reopen(), service = new WorkspaceReceiver(f.fs, f.fs, cold.session, metadata, f.locks);
    const result = await service.retry(ids[0]!); expect(result.state).toBe('ready');
    expect((await new TransactionJournal(f.fs, metadata).entries()).filter(e => e.start.transactionId === ids[0])).toHaveLength(1);
    const before = (await new TransactionJournal(f.fs, metadata).entries()).length;
    expect((await service.retry(ids[0]!)).source!.token).toBe(result.source!.token);
    expect((await new TransactionJournal(f.fs, metadata).entries())).toHaveLength(before);
  });
  it('records zero-change Workspace receipt and keeps its original publication after later local editing', async () => {
    const f = await workspaceFileFixture(), first = await f.receiverService.receive(f.local.source!.token, f.file);
    const chunks: Uint8Array[] = [];
    await writeWorkspaceArchive(f.capture, f.senderStore, new WritableStream<Uint8Array>({ write: b => { chunks.push(b.slice()); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    const journal = new TransactionJournal(f.fs, metadata), before = (await journal.entries()).length;
    await f.receiverService.receive(first.source!.token, new Blob(chunks.map(b => b.slice().buffer)));
    expect((await journal.entries())).toHaveLength(before);
    const jobs = await f.receiverService.jobs();
    const zeroId = (await Promise.all(jobs.map(async j => ({ id: j.id, steps: await (await WorkspaceReceiveJob.open(f.fs, j.id, metadata)).steps() })))).find(j => j.steps[0]?.detail.kind === 'workspaceAlreadyPresent')!.id;
    const edited = await f.receiver.session.editCaption(first.source!.token, f.captionId, 'title', '受信後の追記');
    expect((await f.receiverService.retry(zeroId)).source!.token).toBe(edited.source!.token);
    const step = (await (await WorkspaceReceiveJob.open(f.fs, zeroId, metadata)).steps())[0]!;
    expect(step.detail.kind === 'workspaceAlreadyPresent' && step.detail.receiver.heads).toEqual(first.source!.heads);
  });
  it('preserves acknowledged receive failures for missing originals and lost base evidence', async () => {
    const f = await workspaceFileFixture(); f.fs.reject = p => p.endsWith('/metadataDurable.json');
    await expect(f.receiverService.receive(f.local.source!.token, f.file)).rejects.toThrow('injected quota');
    f.fs.reject = () => false;
    const id = (await WorkspaceReceiveJob.ids(f.fs))[0]!, inputPath = `v2/packages/receive/${id}/input.zip`, original = (await f.fs.readBytes(inputPath))!;
    await f.fs.remove(inputPath); const writes = vi.spyOn(f.fs, 'writeBytes');
    await expect(f.receiverService.retry(id)).rejects.toThrow('receive-input-incomplete'); expect(writes).not.toHaveBeenCalled();
    await expect(f.receiver.session.retry()).rejects.toThrow('receive-job-recovery-required');
    await expect(f.receiver.session.recoverInitialization(f.initial.source!)).rejects.toThrow('receive-job-recovery-required');
    await f.fs.writeBytes(inputPath, original); // Test-controlled restoration, never an importer repair.
    const result = await f.receiverService.retry(id); expect(result.state).toBe('ready');
    const base = JSON.parse((await f.fs.readText((await f.fs.list('v2/packages/bases/'))[0]!))!);
    await f.fs.remove(`v2/packages/evidence/${base.evidence.metadata.sha256}`); writes.mockClear();
    await expect(f.receiverService.retry(id)).rejects.toThrow('receive-base-evidence'); expect(writes).not.toHaveBeenCalled();
    expect((await f.receiverService.jobs())[0]!.state).toBe('repair-required');
  });
  it('rejects fabricated imported completion heads even with intact Workspace evidence and a correct record digest', async () => {
    const f = await workspaceFileFixture(), saved = await f.receiverService.receive(f.local.source!.token, f.file);
    const originalPath = (await f.fs.list('v2/packages/bases/'))[0]!, row = JSON.parse((await f.fs.readText(originalPath))!);
    row.completions[0].publishedReceiverHeads = ['b'.repeat(64)];
    const encoded = new TextEncoder().encode(json(row));
    await f.fs.writeText(`v2/packages/bases/${row.workspacePackageId}/${await digest(encoded)}.json`, json(row));
    const writes = vi.spyOn(f.fs, 'writeText');
    await expect(f.receiverService.receive(saved.source!.token, f.file)).rejects.toThrow('receive-base-observation');
    expect(writes).not.toHaveBeenCalled(); expect((await f.receiver.session.read()).source!.token).toBe(saved.source!.token);
  });
  it('cancels only an explicitly stale pre-journal receive and rejects corrupted input before any writes', async () => {
    const f = await workspaceFileFixture(), job = await WorkspaceReceiveJob.prepare(f.fs, f.file, metadata);
    await underWriteLease(f.fs, () => job.persist({ identity: f.local.source!.proof.identity, metadataEnvelope: f.local.source!.proof.envelope, heads: f.local.source!.heads }, 4_194_304));
    await expect(f.receiverService.cancelStale(job.id)).rejects.toThrow('receive-not-stale');
    const changed = await f.receiver.session.editCaption(f.local.source!.token, f.captionId, 'title', '新しい作業');
    await expect(f.receiverService.retry(job.id)).rejects.toThrow('receive-stale');
    await f.receiverService.cancelStale(job.id);
    expect((await f.receiverService.jobs())[0]!.state).toBe('cancelled');
    const corrupted = new Uint8Array(await f.file.arrayBuffer()); corrupted[0] = 0;
    const writes = vi.spyOn(f.fs, 'writeText');
    await expect(f.receiverService.receive(changed.source!.token, new Blob([corrupted.buffer]))).rejects.toThrow(); expect(writes).not.toHaveBeenCalled();
    expect((await f.receiverService.receive(changed.source!.token, f.file)).state).toBe('ready');
  });
  it('admits original received GLB/PNG records without allocating IDs or writes, stages facts and keeps local Caption history', async () => {
    const f = await receivedFixture(), originals = f.final.originalChanges(), files = await f.fs.list('');
    const plan = await validationReceivedFacts(f.receiver.content, f.local.source!, f.final, f.bodyFor);
    expect(await f.fs.list('')).toEqual(files); expect(plan.stagedBlobs).toHaveLength(2);
    await underWriteLease(f.fs, () => plan.stage());
    const provider = await readProjectScene(f.final.read(), metadata, f.receiver.content.verifier(false), { verifyRetainedMedia: true });
    expect(provider.kind).toBe('scene-provider'); if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(provider.inspection.checks.every(c => c.outcome === 'verified')).toBe(true);
    expect(f.final.originalChanges()).toEqual(originals);
    expect(provider.resources.captions[f.captionId]!.body).toEqual({ kind: 'value', value: '手元の追記' });
    expect(provider.inspection.candidates.unambiguousRecords.representationsById).toHaveProperty(f.model.representation.id as string);
    expect((await f.receiver.session.read()).source!.token).toBe(f.local.source!.token); // Admission is not publication.
    const writes = vi.spyOn(f.fs, 'writeText'); await underWriteLease(f.fs, () => plan.stage()); expect(writes).not.toHaveBeenCalled();
  });
  it('refuses cumulative size before opening incoming bodies and never repairs a missing old body under a new ID', async () => {
    const f = await receivedFixture(true), small = new ValidationContent(f.fs, f.store, { ...budget, maxFileBytes: f.bytes.length }, decode);
    await expect(validationReceivedFacts(small, f.local.source!, f.final, f.bodyFor)).rejects.toThrow('合計'); expect(f.bodyFor).not.toHaveBeenCalled();
    const object = (await f.fs.list('v2/cas/objects/'))[0]!; await f.fs.remove(object);
    const put = vi.spyOn(f.store, 'put');
    await expect(validationReceivedFacts(f.receiver.content, f.local.source!, f.final, f.bodyFor)).rejects.toThrow();
    expect(put).not.toHaveBeenCalled(); expect(await f.fs.readBytes(object)).toBeNull();
  });
  it.each(['body', 'cas-receipt', 'fact', 'both-receipts'] as const)('rejects owned weak initial PNG %s loss after cold reopen without incoming repair', async missing => {
    const r = firstWorkspaceRecipient(), service = validationProjectService(r.fs, r.factory, r.store, budget, decode);
    const prepared = await prepareValidationProject({ run: newId(), title: '元画像を保持', models: [{ label: 'モデル', bytes: glb() }], media: [{ label: '画像', bytes: png }] }, budget, decode);
    const before = await prepareValidationCreation(prepared).persist(r.fs, r.store, service.session);
    const image = Object.values(prepared.records.mediaResourcesById as Record<string, JsonObject>)[0]!, ref = image.blob as JsonObject, hash = ref.digest as string;
    const receipt = `v2/cas/sha256/${hash.slice(0, 2)}/${hash.slice(2)}.json`, object = `v2/cas/objects/${JSON.parse((await r.fs.readText(receipt))!).objectId}.bin`;
    let fact: string | undefined;
    for (const path of await r.fs.list('v2/metadata/evidence/')) if (JSON.parse((await r.fs.readText(path))!).key.fact === 'media') fact = path;
    expect(fact).toBeTruthy();
    const removed = missing === 'body' ? [object] : missing === 'cas-receipt' ? [receipt] : missing === 'fact' ? [fact!] : [receipt, fact!];
    for (const path of removed) await r.fs.remove(path);
    const remaining = await r.fs.list(''), writes = vi.spyOn(r.fs, 'writeText'), puts = vi.spyOn(r.store, 'put');
    const cold = validationProjectService(r.fs, r.factory, r.store, budget, decode), read = await cold.session.read();
    expect(read.state).toBe('repair-required'); expect(read.source!.originalChanges()).toEqual(before.source!.originalChanges());
    await expect(validationReceivedFacts(cold.content, before.source!, before.source!, () => new Blob([png.slice().buffer]), () => true)).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled(); expect(puts).not.toHaveBeenCalled(); expect(await r.fs.list('')).toEqual(remaining);
    for (const path of removed) expect(await r.fs.readBytes(path)).toBeNull();
  });
  it('does not recreate weak initial PNG evidence after prepared publication was interrupted', async () => {
    const r = firstWorkspaceRecipient(), service = validationProjectService(r.fs, r.factory, r.store, budget, decode);
    const prepared = await prepareValidationProject({ run: newId(), title: '中断した作成', models: [{ label: 'モデル', bytes: glb() }], media: [{ label: '画像', bytes: png }] }, budget, decode);
    r.fs.reject = path => path.endsWith('/published.json');
    await expect(prepareValidationCreation(prepared).persist(r.fs, r.store, service.session)).rejects.toThrow('quota'); r.fs.reject = () => false;
    const entry = (await new TransactionJournal(r.fs, metadata).entries())[0]!; expect(entry.prepared).not.toBeNull(); expect(entry.publication).toBeNull();
    const ref = Object.values(prepared.records.mediaResourcesById as Record<string, JsonObject>)[0]!.blob as JsonObject, hash = ref.digest as string;
    await r.fs.remove(`v2/cas/sha256/${hash.slice(0, 2)}/${hash.slice(2)}.json`);
    for (const path of await r.fs.list('v2/metadata/evidence/')) if (JSON.parse((await r.fs.readText(path))!).key.fact === 'media') await r.fs.remove(path);
    const files = await r.fs.list(''), writes = vi.spyOn(r.fs, 'writeText');
    await expect(validationProjectService(r.fs, r.factory, r.store, budget, decode).session.retry()).rejects.toThrow('provider-not-ready');
    expect(writes).not.toHaveBeenCalled(); expect(await r.fs.list('')).toEqual(files);
  });
  it('loads earlier owned weak PNG witnesses before a cold prepared-command retry', async () => {
    const f = await receivedFixture(), ref = { algorithm: 'sha256' as const, digest: await digest(png), byteLength: png.length, mediaType: 'image/png' };
    const image = await sealValidationRecord('media-resource', { id: `med_${newId()}`, label: '保持する画像', mediaKind: 'image', blob: ref });
    // This source is initialized locally, including its unattached PNG admission.
    const r = firstWorkspaceRecipient(), own = validationProjectService(r.fs, r.factory, r.store, budget, decode);
    const prepared = structuredClone(f.prepared); (prepared.records.mediaResourcesById as Record<string, JsonObject>)[image.id as string] = image;
    const initial = await prepareValidationCreation({ ...prepared, blobs: [...prepared.blobs, { ref, bytes: png.slice() }] }).persist(r.fs, r.store, own.session);
    r.fs.reject = path => path.endsWith('/published.json');
    await expect(own.session.editCaption(initial.source!.token, f.captionId, 'body', '中断した編集')).rejects.toThrow('quota'); r.fs.reject = () => false;
    const hash = (image.blob as JsonObject).digest as string; await r.fs.remove(`v2/cas/sha256/${hash.slice(0, 2)}/${hash.slice(2)}.json`);
    for (const path of await r.fs.list('v2/metadata/evidence/')) if (JSON.parse((await r.fs.readText(path))!).key.fact === 'media') await r.fs.remove(path);
    const files = await r.fs.list(''), writes = vi.spyOn(r.fs, 'writeText');
    await expect(r.reopen().session.retry()).rejects.toThrow('provider-not-ready'); expect(writes).not.toHaveBeenCalled(); expect(await r.fs.list('')).toEqual(files);
  });
  it('retains a physical import witness for preowned PNG bytes when no body was staged', async () => {
    const f = await workspaceFileFixture(), r = firstWorkspaceRecipient();
    for (const ref of f.capture.bodyRefs) await r.store.put((await f.senderStore.openReadOnly(ref)).stream(), ref.mediaType, ref);
    const imported = await r.receiver.importWorkspace(f.file), entry = (await new TransactionJournal(r.fs, metadata).entries())[0]!;
    expect(entry.prepared!.stagedBlobs).toBeUndefined();
    const sceneId = Object.keys((imported.provider as Extract<NonNullable<typeof imported.provider>, { kind: 'scene-provider' }>).state.scenes)[0]!;
    const included = await r.session.edit(imported.source!.token, { kind: 'include', sceneId, resourceKind: 'caption', resourceId: f.captionId,
      membershipId: `scm_${newId()}`, orderKey: 'A', eventId: `evt_${newId()}` });
    const attachmentId = Object.keys((included.provider as Extract<NonNullable<typeof included.provider>, { kind: 'scene-provider' }>).details.attachments)[0]!;
    const detached = await r.session.edit(included.source!.token, { kind: 'deleteAttachment', sceneId, captionId: f.captionId, attachmentId, eventId: `evt_${newId()}` });
    const ref = f.image.blob as JsonObject, hash = ref.digest as string;
    await r.fs.remove(`v2/cas/sha256/${hash.slice(0, 2)}/${hash.slice(2)}.json`);
    for (const path of await r.fs.list('v2/metadata/evidence/')) if (JSON.parse((await r.fs.readText(path))!).key.fact === 'media') await r.fs.remove(path);
    const files = await r.fs.list(''), writes = vi.spyOn(r.fs, 'writeText'), read = await r.reopen().session.read();
    expect(read.state).toBe('repair-required'); expect(read.source!.originalChanges()).toEqual(detached.source!.originalChanges());
    expect(writes).not.toHaveBeenCalled(); expect(await r.fs.list('')).toEqual(files);
  });
  it.each(['missing', 'corrupt'] as const)('requires strong PNG bytes even when weak selection declines a %s incoming body', async fault => {
    const f = await workspaceFileFixture(), final = planRemoteChanges(f.local.source!, f.source, metadata).final, puts = vi.spyOn(f.store, 'put'), writes = vi.spyOn(f.fs, 'writeText');
    const input = vi.fn((ref: JsonObject) => {
      if (ref.digest !== (f.image.blob as JsonObject).digest) return f.bodyFor(ref);
      if (fault === 'missing') throw Error('missing PNG');
      const bytes = png.slice(); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; return new Blob([bytes.buffer]);
    });
    await expect(validationReceivedFacts(f.receiver.content, f.local.source!, final, input, () => false)).rejects.toThrow();
    expect(input.mock.calls.some(([ref]) => ref.digest === (f.image.blob as JsonObject).digest)).toBe(true);
    expect(puts).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); expect((await f.receiver.session.read()).source!.token).toBe(f.local.source!.token);
  });
  it('leaves storage untouched when readonly admission discovers corrupt reused bytes under a new record ID', async () => {
    const f = await receivedFixture(true), path = (await f.fs.list('v2/cas/objects/'))[0]!, bytes = (await f.fs.readBytes(path))!;
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await f.fs.writeBytes(path, bytes);
    const originalFiles = await f.fs.list(''), writes = vi.spyOn(f.fs, 'writeText'), puts = vi.spyOn(f.store, 'put');
    await expect(validationReceivedFacts(f.receiver.content, f.local.source!, f.final, f.bodyFor)).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled(); expect(puts).not.toHaveBeenCalled(); expect(await f.fs.list('')).toEqual(originalFiles);
  });
  it('does not regenerate acknowledged incoming body or fact evidence on retry', async () => {
    for (const missing of ['body', 'fact'] as const) {
      const f = await receivedFixture(), before = new Set(await f.fs.list(''));
      const plan = await validationReceivedFacts(f.receiver.content, f.local.source!, f.final, f.bodyFor); await underWriteLease(f.fs, () => plan.stage());
      const path = (await f.fs.list('')).find(p => !before.has(p) && (missing === 'body' ? p.startsWith('v2/cas/objects/') : p.startsWith('v2/metadata/evidence/')))!;
      expect(path).toBeTruthy(); await f.fs.remove(path); const put = vi.spyOn(f.store, 'put');
      await expect(underWriteLease(f.fs, () => plan.stage())).rejects.toThrow(); expect(put).not.toHaveBeenCalled(); expect(await f.fs.readBytes(path)).toBeNull();
    }
  });
  it('checks original received profile, role, transform, material/bounds and blob digest even after decoding', async () => {
    const f = await receivedFixture(), record = f.model.representation, original = structuredClone(record), file = new Blob([f.bytes.slice().buffer]);
    for (const mutate of [(r: any) => { r.formatProfile.id = 'unapproved'; }, (r: any) => { r.role = 'interactionProxy'; },
      (r: any) => { r.representationToAsset.uniformScale = 2; }, (r: any) => { r.blob.mediaType = 'image/png'; },
      (r: any) => { r.blob.digest = '0'.repeat(64); }]) {
      const copy = structuredClone(record); mutate(copy);
      await expect(f.receiver.content.inspectReceived({ token: f.final.token, fact: 'representation', records: [copy], context: {} }, file)).rejects.toThrow();
    }
    for (const mutate of [(r: any) => { r.logicalBoundsAsset.min[0]--; }, (r: any) => { r.materialCatalog.slots = []; }]) {
      const copy = structuredClone(record); mutate(copy);
      expect(await f.receiver.content.inspectReceived({ token: f.final.token, fact: 'representation', records: [copy], context: {} }, file)).toMatchObject({ outcome: 'failed' });
    }
    expect(record).toEqual(original);
  });
  it('replaces an explicitly selected GLB, retains team edits and returns corrected same-Asset pins through real files', async () => {
    const f = await openFileCaption(), { host, workspace, s, captionId } = f, sceneId = s.sceneId;
    const assetId = s.snapshot.modelVersions![0]!.assetId, secondScene = `scn_${newId()}`;
    await host.authority.authorScene!(host.read().source!.token, { kind: 'createScene', sceneId: secondScene, sourceSceneId: sceneId,
      activeSceneId: sceneId, name: '詳細', orderKey: 'B', membershipIds: [`sam_${newId()}`], eventId: `evt_${newId()}` });
    await host.authority.transformModel!(host.read().source!.token, { sceneId, assetId,
      expectedBindingId: host.authority.read().modelVersions![0]!.projection.bindingId, bindingId: `bnd_${newId()}`,
      placement: { translation: [1, 2, 3], rotationXYZW: [0, 0, 0, 1], uniformScale: 2 } });
    const initialFile = await host.workspaceOutput.download(await host.workspaceOutput.generate(host.read().source!.token));
    const r = firstWorkspaceRecipient(), peerOptions = { ...f.options, base: r.fs, store: r.store, coordinator: ProjectMutationCoordinator.browser(r.locks),
      packageLocks: r.locks, openStorage: async () => ({ factory: r.factory, dispose: async () => {} }) };
    const peer = await openValidationHost({ ...peerOptions, workspaceFile: initialFile });
    await peer.authority.write(peer.read().source!.token, { [`caption/${captionId}/body`]: '未送信の現場記録' });
    const attachmentId = `att_${newId()}`;
    await peer.authority.addMediaFile!(peer.read().source!.token, { sceneId, captionId, attachmentId, eventId: `evt_${newId()}`, orderKey: 'A',
      file: { name: '現場画像', size: png.length, arrayBuffer: async () => png.slice().buffer } });
    const pw = createSavedWorkspace(new RecordedDocument().asDocument(), peer), ps = pw.session!;
    const localCaption = ps.snapshot.resources.captions[captionId]!, localAttachments = captionAttachments(ps.snapshot.mediaData, captionId).ready;
    s.refreshHistory(); s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId }));
    const old = s.snapshot, oldModel = old.modelVersions![0]!, oldChanges = host.read().source!.originalChanges();
    if (oldModel.closure.shape !== 'saved-glb') throw Error('model');
    const residents = await prepareValidationResidents(old.modelVersions!, host.content), oldSurface = residents.create(oldModel.closure);
    let failDisplay = true;
    const prepare = vi.fn(async (next: typeof old) => { await residents.prepare(next.modelVersions!); if (failDisplay) throw Error('injected replacement display'); });
    const detach = host.setDisplayPreparation(prepare);
    const control = createModelUpdateControls(new RecordedDocument().asDocument(), s, () => control.render()), root = record(control.root);
    const button = (text: string) => root.children.find(n => n.tag === 'button' && n.textContent === text)!;
    const input = root.children.find(n => n.type === 'file')!;
    Object.assign(input, { click: vi.fn() }); // Recorded DOM does not open native file dialogs.
    const bytes = glb(j => { j.nodes[0].translation = [3, 0, 0.25]; }), exactBytes = bytes.slice();
    const file = { name: '更新モデル', size: bytes.length, arrayBuffer: vi.fn(async () => bytes.buffer as ArrayBuffer) };
    const earlierExclude = planModelList(s.modelContext(), { kind: 'membership', assetId, included: false });
    const choose = () => { control.render(); button('3Dモデルを差し替える').fire('click'); Object.assign(input, { files: [file] }); input.fire('change'); };
    choose(); expect(host.read().source!.originalChanges()).toEqual(oldChanges); expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(planModelList(s.modelContext(), { kind: 'membership', assetId, included: false }).kind).toBe('blocked');
    expect(s.acceptModel(earlierExclude)).toBe(false); expect(host.read().source!.originalChanges()).toEqual(oldChanges);
    expect(root.children.some(n => n.textContent.includes('2シーン'))).toBe(true); expect(workspace.hasChanges()).toBe(true);
    button('選択を取り消す').fire('click'); expect(workspace.hasChanges()).toBe(false); expect(s.snapshot).toBe(old);
    choose(); s.setSearchComposing(true); control.render(); expect(button('差し替える').disabled).toBe(true);
    button('差し替える').fire('click'); expect(file.arrayBuffer).not.toHaveBeenCalled(); s.setSearchComposing(false); control.render();
    f.fs.reject = path => path.endsWith('/published.json'); button('差し替える').fire('click');
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'), { timeout: 10000 });
    expect(s.snapshot).toBe(old); expect(s.modelReplacementSelection?.command.file.name).toBe('更新モデル');
    expect(s.cancelModelReplacement()).toBe(false);
    const paths = (await f.fs.list(`${validationArea}/${f.options.run}/`)).filter(p => p.endsWith('.amchange'));
    const originalBytes = await Promise.all(paths.map(p => f.fs.readBytes(p)));
    bytes.fill(0); f.fs.reject = () => false; s.retryWorking();
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'), { timeout: 10000 });
    expect(host.read().state).toBe('ready'); expect(s.snapshot).toBe(old); expect(s.message).toContain('injected replacement display');
    const published = host.read().publication, publishedChanges = host.read().source!.originalChanges();
    failDisplay = false; s.retryWorking();
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'), { timeout: 10000 });
    expect(host.read().publication).toBe(published); expect(host.read().source!.originalChanges()).toEqual(publishedChanges);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(s.modelReplacementSelection).toBeNull(); expect(file.arrayBuffer).toHaveBeenCalledOnce();
    expect(await Promise.all(paths.map(p => f.fs.readBytes(p)))).toEqual(originalBytes);
    const updated = s.snapshot.modelVersions![0]!;
    expect(updated.projection.revisionId).not.toBe(oldModel.projection.revisionId);
    expect(updated.projection.assetFrameId).toBe(oldModel.projection.assetFrameId);
    expect(updated.closure.binding.assetToProject).toEqual(oldModel.closure.binding.assetToProject);
    expect((updated.closure.representation.blob as JsonObject).digest).toBe(await digest(exactBytes));
    if (updated.closure.shape !== 'saved-glb') throw Error('model');
    const updatedSurface = residents.create(updated.closure);
    expect(new THREE.Box3().setFromObject(oldSurface.asset, true).min.z).toBe(3);
    expect(new THREE.Box3().setFromObject(updatedSurface.asset, true).min.z).toBe(3.5);
    oldSurface.dispose?.(); updatedSurface.dispose?.();
    expect(s.snapshot.resources.captions).toEqual(old.resources.captions);
    expect(s.snapshot.state.assetMemberships).toEqual(old.state.assetMemberships);
    for (const id of [sceneId, secondScene]) {
      const view = resolveScene(s.snapshot.state, s.snapshot.resources, id); if (view.kind === 'blocked') throw Error('scene');
      expect(view.composition.assets[0]!.projection.revisionId).toBe(updated.projection.revisionId);
    }
    const updatedFile = await host.workspaceOutput.download(await host.workspaceOutput.generate(host.read().source!.token));
    await peer.workspaceFiles.receive(peer.read().source!.token, updatedFile); ps.refreshHistory();
    expect(ps.snapshot.resources.captions[captionId]).toEqual(localCaption);
    expect(captionAttachments(ps.snapshot.mediaData, captionId).ready).toEqual(localAttachments);
    expect(ps.composition.captions.find(c => c.captionId === captionId)!.marker).toBe('needsReview');
    expect(ps.snapshot.colors[captionId]).toEqual(old.colors[captionId]);
    const oldPin = syntheticDisplay(old, sceneId, null, captionId).pins.find(p => p.id === captionId)!;
    expect(syntheticDisplay(ps.snapshot, sceneId, null, captionId).pins.find(p => p.id === captionId))
      .toMatchObject({ position: oldPin.position, color: oldPin.color, status: 'needsReview' });
    ps.setViewportState(true, [assetId], null); expect(ps.acceptList(planCaptionList(ps.captionContext(), { kind: 'select', captionId }))).toBe(true);
    expect(ps.acceptPin(planPinMode(ps.pinContext(), { kind: 'move' }))).toBe(true);
    expect(ps.acceptPinSurface(ps.pinSurfaceTarget()!, [3, 0.5, 0.25], true)).toBe(true);
    ps.acceptPin(planPinMode(ps.pinContext(), { kind: 'finish' }));
    await vi.waitFor(() => expect(ps.acknowledgment.state).toBe('idle'), { timeout: 10000 });
    expect(ps.composition.captions.find(c => c.captionId === captionId)!.marker).toBe('visible');
    expect(ps.snapshot.resources.captions[captionId]!.anchor).toMatchObject({ kind: 'value', value: { assetId,
      authoredAssetRevisionId: updated.projection.revisionId, positionAsset: [3, 0.5, 0.25] } });
    const reply = await peer.workspaceOutput.download(await peer.workspaceOutput.generateContribution(peer.read().source!.token, peer.workspaceOutput.bases[0]!.selection));
    await host.workspaceFiles.receive(host.read().source!.token, reply); s.refreshHistory();
    expect(s.snapshot.resources.captions[captionId]).toEqual(ps.snapshot.resources.captions[captionId]);
    expect(captionAttachments(s.snapshot.mediaData, captionId).ready).toEqual(localAttachments);
    const final = host.read().source!; await host.workspaceFiles.receive(final.token, reply);
    expect(host.read().source!.token).toBe(final.token); expect(host.read().source!.originalChanges()).toEqual(final.originalChanges());
    control.dispose(); const write = vi.spyOn(host.authority as Required<Pick<typeof host.authority, 'replaceModelFile'>>, 'replaceModelFile');
    button('差し替える').fire('click'); expect(write).not.toHaveBeenCalled(); write.mockRestore();
    detach(); residents.dispose(); await workspace.dispose(); await pw.dispose(); const cold = await openValidationHost(f.options);
    expect(cold.read().source!.token).toBe(final.token); expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges());
    expect(captionAttachments(cold.authority.read().mediaData, captionId).ready).toEqual(localAttachments);
    await cold.dispose();
  }, 60000);
  it('rejects stale, malformed and inferred replacement closures without modifying the existing Project', async () => {
    const { host, workspace, s, options } = await openFileCaption(), old = s.snapshot.modelVersions![0]!, assetId = old.assetId, sceneId = s.sceneId;
    const before = host.read().source!, provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const model = await prepareValidationModel({ label: '更新', bytes: glb() }, budget, decode, assetId);
    const binding = await sealValidationRecord('asset-binding-revision', { id: model.binding.id!, assetId,
      assetRevisionId: model.revision.id!, assetToProject: old.closure.binding.assetToProject as unknown as JsonObject, parentBindingId: old.projection.bindingId, method: 'manual' });
    const command = { kind: 'replaceAssetModel' as const, sceneId, assetId, expectedBindingId: old.projection.bindingId,
      revision: model.revision, representation: model.representation, binding };
    expect(planMetadataEdit(provider, command, metadata)).toHaveLength(4);
    for (const change of [(c: any) => { c.expectedBindingId = `bnd_${newId()}`; },
      (c: any) => { c.binding.assetToProject.uniformScale = 3; }, (c: any) => { c.representation.extra = true; },
      (c: any) => { c.revision.anchorCompatibilityClasses[0].id = old.projection.anchorCompatibilityIds[0]; },
      (c: any) => { c.representation.materialCatalog.slots[0].logicalMaterialSlotId = old.closure.representation.materialCatalog.slots[0]!.logicalMaterialSlotId; }]) {
      const copy = structuredClone(command); change(copy); expect(() => planMetadataEdit(provider, copy, metadata)).toThrow();
    }
    const file = { name: '不正', size: 3, arrayBuffer: vi.fn(async () => new Uint8Array(3).buffer) };
    const input = { sceneId, assetId, expectedBindingId: old.projection.bindingId, file };
    await expect(host.authority.replaceModelFile!('stale', input)).rejects.toThrow('更新'); expect(file.arrayBuffer).not.toHaveBeenCalled();
    const view = await openValidationHost(options); await expect(view.authority.replaceModelFile!(before.token, input)).rejects.toThrow('閲覧専用'); await view.dispose();
    await expect(host.authority.replaceModelFile!(before.token, input)).rejects.toThrow();
    expect(host.hasPending()).toBe(false); expect(host.read().source!.originalChanges()).toEqual(before.originalChanges());
    expect(host.authority.read().modelVersions![0]).toEqual(old);
    s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId }));
    expect(s.selectModelReplacement({ token: before.token, ...input }, file)).toBe(true);
    await host.authority.write(before.token, { [`caption/${s.memory.selectedCaptionId!}/body`]: '別の更新' });
    s.refreshHistory(); const after = host.read().source!;
    expect(s.confirmModelReplacement()).toBe(false); expect(s.message).toContain('更新');
    expect(s.modelReplacementSelection?.target.token).toBe(before.token);
    expect(host.read().source!.originalChanges()).toEqual(after.originalChanges()); expect(s.cancelModelReplacement()).toBe(true);
    await workspace.dispose();
  });
  it('compares competing real GLB replacements without authority, explicitly resolves and returns the chosen model through files', async () => {
    const f = await openFileCaption(), { host, captionId, options } = f, sceneId = f.s.sceneId;
    const assetId = f.s.snapshot.modelVersions![0]!.assetId, secondScene = `scn_${newId()}`, otherAsset = `ast_${newId()}`, otherBytes = glb();
    await host.authority.addModelFile!(host.read().source!.token, { sceneId, assetId: otherAsset,
      file: { name: '別のモデル', size: otherBytes.length, arrayBuffer: async () => otherBytes.slice().buffer } });
    await host.authority.authorScene!(host.read().source!.token, { kind: 'createScene', sceneId: secondScene, sourceSceneId: sceneId,
      activeSceneId: sceneId, name: '詳細', orderKey: 'B', membershipIds: [`sam_${newId()}`, `sam_${newId()}`], eventId: `evt_${newId()}` });
    const seedFile = await host.workspaceOutput.download(await host.workspaceOutput.generate(host.read().source!.token));
    const r = firstWorkspaceRecipient(), peerOptions = { ...options, base: r.fs, store: r.store, coordinator: ProjectMutationCoordinator.browser(r.locks),
      packageLocks: r.locks, openStorage: async () => ({ factory: r.factory, dispose: async () => {} }) };
    const peer = await openValidationHost({ ...peerOptions, workspaceFile: seedFile });
    const replacements = new Map<string, Uint8Array>();
    for (const [target, z] of [[host, 0.5], [peer, 1]] as const) {
      const bytes = glb(j => { j.nodes[0].translation = [3, 0, z]; });
      await target.authority.replaceModelFile!(target.read().source!.token, { sceneId, assetId,
        expectedBindingId: target.authority.read().modelVersions!.find(m => m.assetId === assetId)!.projection.bindingId,
        file: { name: '更新モデル', size: bytes.length, arrayBuffer: async () => bytes.slice().buffer } });
      replacements.set(target.authority.read().modelVersions!.find(m => m.assetId === assetId)!.projection.revisionId, bytes);
    }
    await host.authority.write(host.read().source!.token, { [`caption/${captionId}/body`]: '手元の現場記録' });
    await peer.authority.addMediaFile!(peer.read().source!.token, { sceneId, captionId, attachmentId: `att_${newId()}`, eventId: `evt_${newId()}`, orderKey: 'A',
      file: { name: '現場画像', size: png.length, arrayBuffer: async () => png.slice().buffer } });
    const incoming = await peer.workspaceOutput.download(await peer.workspaceOutput.generate(peer.read().source!.token));
    f.workspace.unmount();
    let failPreview = false;
    const displays: Parameters<ModelCandidateRenderer>[0][] = [], factories: ReturnType<typeof vi.fn>[] = [], releases: ReturnType<typeof vi.fn>[] = [];
    const renderModelCandidate: NonNullable<ValidationWorkspacePorts['renderModelCandidate']> = async (target, display) => {
      if (failPreview) throw Error('injected candidate body read');
      const resident = await prepareReadonlyResidents(display.models, { model: record => target.content.model(record, true) });
      const surface = resident.create(display.models[0]!);
      expect(new THREE.Box3().setFromObject(surface.asset, true).min.z).toBe(display.bounds!.min[2]); surface.dispose?.();
      const dispose = vi.fn(() => resident.dispose()); releases.push(dispose);
      let shown: typeof display | undefined;
      const factory = vi.fn((_canvas: HTMLCanvasElement, _changed: () => void) => ({ update(next: typeof display) { shown = next; }, setActive() {},
        read: () => ({ ready: true, display: shown, pins: [], issue: null, token: display.token, dragging: false, projection: 'perspective' as const, axis: null }),
        camera: vi.fn(), retry() {}, dispose: vi.fn() })); factories.push(factory); displays.push(display);
      return { factory, dispose };
    };
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, list: async () => [], selected() {},
      open: async () => host, render: async () => ({ factory: () => { throw Error('Recorded DOM has no GPU'); }, dispose() {} }), renderModelCandidate }, options.run);
    const root = record(u.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const named = (label: string, parent = root) => all(parent).find(n => n.attributes.get('aria-label') === label)!;
    const button = (text: string, parent = root) => all(parent).find(n => n.tag === 'button' && n.textContent === text)!;
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    const input = named('更新ファイルを選択'), receive = input.parent!.parent!;
    Object.assign(input, { files: [incoming] }); input.fire('change'); receive.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === '更新を受け取りました。')).toBe(true), { timeout: 10000 });
    Object.assign(input, { files: [] }); button('選択を取り消す', receive).fire('click');
    const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const candidates = assetStatusCandidates(provider, assetId, host.limits); expect(candidates).toHaveLength(2);
    const before = host.read().source!, snapshot = host.authority.read();
    for (const id of [sceneId, secondScene]) expect(syntheticDisplay(snapshot, id, null, null).models.map(m => m.binding.assetId)).toEqual([otherAsset]);
    expect(snapshot.resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '手元の現場記録' });
    const attachments = captionAttachments(snapshot.mediaData, captionId).ready; expect(attachments).toHaveLength(1);
    const list = named('モデルの競合'), choice = named('残すモデルと配置', list), confirm = button('このモデルと配置を使う', list);
    expect(choice.value).toBe(''); expect(confirm.disabled).toBe(true); expect(displays).toHaveLength(0);
    const canvas = named('モデル候補の3D表示', list), readBody = vi.spyOn(host.content, 'model');
    button('候補 1 を表示', list).fire('click'); expect(canvas.style.visibility).toBe('hidden');
    await vi.waitFor(() => expect(factories).toHaveLength(1)); expect(canvas.style.visibility).toBe('visible');
    failPreview = true; button('候補 2 を表示', list).fire('click'); expect(canvas.style.visibility).toBe('hidden');
    await vi.waitFor(() => expect(all(list).some(n => n.textContent === 'injected candidate body read')).toBe(true));
    expect(canvas.style.visibility).toBe('hidden'); expect(choice.value).toBe(''); expect(host.read().source!.token).toBe(before.token);
    failPreview = false; button('表示を再試行', list).fire('click'); await vi.waitFor(() => expect(factories).toHaveLength(2));
    expect(canvas.style.visibility).toBe('visible');
    expect(releases[0]).toHaveBeenCalledOnce(); expect(readBody.mock.calls.every(c => c[1] === true)).toBe(true); readBody.mockRestore();
    for (const [i, display] of displays.entries()) {
      const candidate = candidates[i]!, rep = display.models[0]!.representation;
      expect(display).toMatchObject({ readOnly: true, pins: [], selectedId: null });
      expect(display.pinEdit).toBeUndefined(); expect(display.modelEdit).toBeUndefined(); expect(display.savedMaterials).toBeUndefined();
      expect(display.models[0]).toMatchObject({ key: candidate.binding.id, assetId, assetToProject: candidate.binding.assetToProject });
      expect(rep.id).toBe((candidate.revision.representationIds as string[])[0]);
      expect((await host.content.model(rep, true)).bytes).toEqual(replacements.get(candidate.revision.id as string));
      expect(factories[i]!.mock.calls[0]).toHaveLength(2); // No editor callbacks, even when the Project is editable.
    }
    expect(host.read().source!.originalChanges()).toEqual(before.originalChanges()); expect(host.authority.read()).toBe(snapshot);
    choice.value = candidates[1]!.operationId; choice.fire('change'); expect(confirm.disabled).toBe(false);
    Object.assign(input, { files: [incoming] }); input.fire('change'); expect(confirm.disabled).toBe(true); confirm.fire('click');
    expect(host.read().source!.token).toBe(before.token); expect(choice.value).toBe(candidates[1]!.operationId);
    Object.assign(input, { files: [] }); button('選択を取り消す', receive).fire('click');
    f.fs.reject = path => path.endsWith('/published.json'); confirm.fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 });
    expect(host.authority.read()).toBe(snapshot);
    const paths = (await f.fs.list(`${validationArea}/${options.run}/`)).filter(p => p.endsWith('.amchange')), bytes = await Promise.all(paths.map(p => f.fs.readBytes(p)));
    // Disabled native input cannot replace the captured command during exact retry.
    choice.value = candidates[0]!.operationId; choice.fire('change'); f.fs.reject = () => false;
    button('更新を再試行', named('更新の確認')).fire('click');
    await vi.waitFor(() => expect(list.children).toHaveLength(0), { timeout: 10000 });
    expect(await Promise.all(paths.map(p => f.fs.readBytes(p)))).toEqual(bytes); expect(releases[1]).toHaveBeenCalledOnce();
    const selected = candidates[1]!, confirmed = host.authority.read(), final = host.read().source!;
    for (const id of [sceneId, secondScene]) expect(syntheticDisplay(confirmed, id, null, null).models.find(m => m.binding.assetId === assetId)!.binding).toEqual(selected.binding);
    expect(confirmed.resources.captions).toEqual(snapshot.resources.captions); expect(captionAttachments(confirmed.mediaData, captionId).ready).toEqual(attachments);
    const reply = await host.workspaceOutput.download(await host.workspaceOutput.generateContribution(final.token, host.workspaceOutput.bases[0]!.selection));
    await peer.workspaceFiles.receive(peer.read().source!.token, reply);
    const changeMap = (source: ProjectMetadataSource) => new Map(source.originalChanges().map(b => [A.decodeChange(b).hash, b]));
    expect(changeMap(peer.read().source!)).toEqual(changeMap(final));
    expect(peer.authority.read().resources.assets[assetId]!.projection).toEqual(confirmed.resources.assets[assetId]!.projection);
    const exact = peer.read().source!.originalChanges(); await peer.workspaceFiles.receive(peer.read().source!.token, reply);
    expect(peer.read().source!.originalChanges()).toEqual(exact);
    const resolve = vi.spyOn(host, 'resolve'); await u.dispose(); confirm.fire('click'); expect(resolve).not.toHaveBeenCalled(); resolve.mockRestore(); await peer.dispose();
    const cold = await openValidationHost(options); expect(changeMap(cold.read().source!)).toEqual(changeMap(final));
    const coldModel = cold.authority.read().modelVersions!.find(m => m.assetId === assetId)!;
    expect(coldModel.projection.revisionId).toBe(selected.revision.id);
    expect((await cold.content.model(coldModel.closure.representation as unknown as JsonObject, true)).bytes).toEqual(replacements.get(selected.revision.id as string));
    await cold.dispose();
  }, 60000);
  it('keeps multiple real GLB copies with every effective material and returns independent edits through files', async () => {
    const modelBytes = glb(j => { j.materials.push({}, {}); j.meshes[0].primitives.push(
      { attributes: { POSITION: 0 }, material: 1 }, { attributes: { POSITION: 0 }, material: 2 }); });
    const f = await openFileCaption(modelBytes), { host, s, options } = f, otherScene = s.sceneId, sceneId = `scn_${newId()}`;
    const original = s.snapshot.modelVersions![0]!, assetId = original.assetId, caption = s.snapshot.resources.captions[f.captionId];
    if (original.closure.shape !== 'saved-glb') throw Error('saved model');
    await host.authority.authorScene!(host.read().source!.token, { kind: 'createScene', sceneId, sourceSceneId: otherScene,
      activeSceneId: otherScene, name: '詳細', orderKey: 'B', membershipIds: [`sam_${newId()}`], eventId: `evt_${newId()}` });
    s.refreshHistory(); s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId }));
    const slots = [...validationMaterialSlots(original.closure)].sort((a, b) => Number(a.locator.materialIndex) - Number(b.locator.materialIndex));
    const material = async (index: number, scope: 'project' | 'scene', appearance: JsonObject) => {
      const fields = { routing: { scope: scope === 'scene' ? { kind: scope, sceneId } : { kind: scope }, target: slots[index]!.target },
        appearance, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' }, lifecycle: { state: 'active', reason: 'initial', eventId: `evt_${newId()}` } };
      const id = `ovr_${newId()}`; await host.authority.write(host.read().source!.token,
        Object.fromEntries(Object.entries(fields).map(([key, value]) => [materialKey(id, key), canonicalFixture(value)])), { sceneId });
    };
    await material(0, 'project', { lighting: 'unlit' }); await material(0, 'scene', { doubleSided: true }); await material(1, 'project', { lighting: 'unlit' });
    s.refreshHistory(); expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'membership', assetId, included: false }))).toBe(false);
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    const seed = await host.workspaceOutput.download(await host.workspaceOutput.generate(host.read().source!.token));
    const sharedBase = host.workspaceOutput.bases[0]!.selection;
    const peers: Awaited<ReturnType<typeof openValidationHost>>[] = [];
    for (let i = 0; i < 2; i++) {
      const r = firstWorkspaceRecipient(); peers.push(await openValidationHost({ ...options, base: r.fs, store: r.store,
        coordinator: ProjectMutationCoordinator.browser(r.locks), packageLocks: r.locks,
        openStorage: async () => ({ factory: r.factory, dispose: async () => {} }), workspaceFile: seed }));
    }
    for (const target of [host, ...peers]) {
      const editor = new SyntheticSession(target.authority);
      editor.acceptNavigation(planNavigation(editor.snapshot.state, editor.session, editor.pending, { kind: 'scene', sceneId }));
      editor.acceptModel(planModelList(editor.modelContext(), { kind: 'membership', assetId, included: true }));
      await vi.waitFor(() => expect(editor.acknowledgment.state).toBe('idle'));
    }
    const incoming = await peers[0]!.workspaceOutput.download(await peers[0]!.workspaceOutput.generate(peers[0]!.read().source!.token));
    await host.workspaceFiles.receive(host.read().source!.token, await peers[1]!.workspaceOutput.download(await peers[1]!.workspaceOutput.generate(peers[1]!.read().source!.token)));
    f.workspace.unmount();
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, list: async () => [], selected() {},
      open: async () => host, render: async () => ({ factory: () => { throw Error('Recorded DOM has no GPU'); }, dispose() {} }) }, options.run);
    const root = record(u.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const named = (label: string, parent = root) => all(parent).find(n => n.attributes.get('aria-label') === label)!;
    const button = (text: string, parent = root) => all(parent).find(n => n.tag === 'button' && n.textContent === text)!;
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    const input = named('更新ファイルを選択'), receive = input.parent!.parent!;
    Object.assign(input, { files: [incoming] }); input.fire('change'); receive.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === '更新を受け取りました。')).toBe(true), { timeout: 10000 });
    Object.assign(input, { files: [] }); button('選択を取り消す', receive).fire('click');
    const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const group = assetMembershipGroups(provider, metadata)[0]!; expect(group.edgeIds).toHaveLength(3);
    const before = host.read().source!, beforeView = host.authority.read(), bodyPut = vi.spyOn(f.store, 'put');
    const form = named('重複したモデル登録'), originalChoice = named('元として残す登録', form), decision = named('重複の解消方法', form);
    const confirm = button('登録の重複を解消', form); expect(confirm.disabled).toBe(true);
    originalChoice.value = group.edgeIds[1]!; originalChoice.fire('change'); decision.value = 'both'; decision.fire('change');
    expect(confirm.disabled).toBe(false);
    f.fs.reject = p => p.endsWith('/published.json'); confirm.fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'), { timeout: 10000 });
    expect(host.authority.read()).toBe(beforeView); expect(bodyPut).not.toHaveBeenCalled();
    const paths = (await f.fs.list(`${validationArea}/${options.run}/`)).filter(p => p.endsWith('.amchange')), parts = await Promise.all(paths.map(p => f.fs.readBytes(p)));
    originalChoice.value = group.edgeIds[0]!; decision.value = 'one'; f.fs.reject = () => false;
    button('更新を再試行', named('更新の確認')).fire('click');
    await vi.waitFor(() => expect(form.children).toHaveLength(0), { timeout: 10000 });
    expect(await Promise.all(paths.map(p => f.fs.readBytes(p)))).toEqual(parts); expect(bodyPut).not.toHaveBeenCalled(); bodyPut.mockRestore();
    const copied = host.authority.read(), copies = copied.modelVersions!.filter(m => m.assetId !== assetId); expect(copies).toHaveLength(2);
    expect(copied.state.assetMemberships[group.edgeIds[1]!]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'active' } });
    expect(copied.modelVersions!.find(m => m.assetId === assetId)).toEqual(original); expect(copied.resources.captions[f.captionId]).toEqual(caption);
    expect(syntheticDisplay(copied, otherScene, null, null).models.map(m => m.binding.assetId)).toEqual([assetId]);
    const resident = await prepareValidationResidents(copied.modelVersions!, host.content), display = syntheticDisplay(copied, sceneId, null, null);
    const initialMaterials = structuredClone(display.savedMaterials), otherSceneMaterials = structuredClone(syntheticDisplay(copied, otherScene, null, null).savedMaterials);
    const unchangedMaterials = (snapshot: typeof copied) => {
      const now = syntheticDisplay(snapshot, sceneId, null, null).savedMaterials;
      expect(now?.[assetId]).toEqual(initialMaterials?.[assetId]);
      expect(now?.[copies[1]!.assetId]).toEqual(initialMaterials?.[copies[1]!.assetId]);
      expect(syntheticDisplay(snapshot, otherScene, null, null).savedMaterials).toEqual(otherSceneMaterials);
    };
    for (const copy of copies) {
      if (copy.closure.shape !== 'saved-glb') throw Error('saved copy');
      expect(copy.closure.representation.blob).toEqual(original.closure.representation.blob);
      expect(copy.closure.binding.parentBindingId).toBeUndefined();
      const targets = [...validationMaterialSlots(copy.closure)].sort((a, b) => Number(a.locator.materialIndex) - Number(b.locator.materialIndex));
      expect(targets).toHaveLength(3);
      const effects = display.savedMaterials![copy.assetId]!;
      expect(effects[targets[0]!.target.logicalMaterialSlotId]).toEqual({ appearance: { doubleSided: true }, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' } }); // Scene replaces, not overlays Project.
      expect(effects[targets[1]!.target.logicalMaterialSlotId]).toMatchObject({ appearance: { lighting: 'unlit' } });
      expect(effects[targets[2]!.target.logicalMaterialSlotId]).toBeUndefined();
      expect(targets.map(t => t.locator)).toEqual(slots.map(t => t.locator));
      expect(targets.every(t => !slots.some(old => old.target.logicalMaterialSlotId === t.target.logicalMaterialSlotId))).toBe(true);
      resident.validate(copy.closure, effects); const surface = resident.create(copy.closure as any); surface.dispose?.();
    }
    resident.dispose();
    const editor = new SyntheticSession(host.authority), chosen = copies[0]!;
    if (chosen.closure.shape !== 'saved-glb') throw Error('saved copy');
    editor.acceptNavigation(planNavigation(editor.snapshot.state, editor.session, editor.pending, { kind: 'scene', sceneId }));
    editor.setViewportState(true, copied.modelVersions!.map(m => m.assetId), null);
    editor.acceptModel(planModelList(editor.modelContext(), { kind: 'select', assetId: chosen.assetId }));
    expect(editor.beginModelPlacement()).toBe(true); editor.changeModelPlacement(['1', '2', '3']); editor.finishModelPlacement();
    await vi.waitFor(() => expect(editor.acknowledgment.state).toBe('idle'));
    const target = validationMaterialSlots(chosen.closure).find(t => t.locator.materialIndex === 0)!;
    const action = (r: MaterialIntentRequest) => { const plan = planMaterial(editor.materialContext(), r);
      expect(plan.kind).not.toBe('blocked'); return editor.acceptMaterial(plan); };
    action({ kind: 'model', assetId: chosen.assetId }); action({ kind: 'surface', key: materialTargetKey(target.target) });
    action({ kind: 'scope', scope: 'scene' }); action({ kind: 'begin' });
    const draft = editor.materialContext().draft!; editor.acceptMaterial({ kind: 'draft', baseDraft: draft, draft: editMaterialDraft(draft, 'doubleSided', 'front') });
    action({ kind: 'apply' }); await vi.waitFor(() => expect(editor.acknowledgment.state).toBe('idle'));
    expect(syntheticDisplay(editor.snapshot, sceneId, null, null).savedMaterials![chosen.assetId]![target.target.logicalMaterialSlotId]).toMatchObject({ appearance: { doubleSided: false } });
    unchangedMaterials(editor.snapshot);
    const updated = glb(j => { j.nodes[0].translation = [5, 0, 1]; });
    await host.authority.replaceModelFile!(host.read().source!.token, { sceneId, assetId: chosen.assetId,
      expectedBindingId: host.authority.read().modelVersions!.find(m => m.assetId === chosen.assetId)!.projection.bindingId,
      file: { name: 'コピーだけ更新', size: updated.length, arrayBuffer: async () => updated.slice().buffer } });
    const final = host.read().source!, finalView = host.authority.read();
    unchangedMaterials(finalView);
    expect(finalView.modelVersions!.find(m => m.assetId === assetId)).toEqual(original);
    expect(finalView.modelVersions!.find(m => m.assetId === copies[1]!.assetId)).toEqual(copies[1]);
    expect(finalView.resources.captions[f.captionId]).toEqual(caption);
    expect(finalView.modelVersions!.find(m => m.assetId === chosen.assetId)!.closure.binding.assetToProject.translation).toEqual([1, 2, 3]);
    const reply = await host.workspaceOutput.download(await host.workspaceOutput.generateContribution(final.token, sharedBase));
    const peer = peers[0]!; await peer.workspaceFiles.receive(peer.read().source!.token, reply);
    const changes = (source: ProjectMetadataSource) => new Map(source.originalChanges().map(bytes => [A.decodeChange(bytes).hash, bytes]));
    expect(changes(peer.read().source!)).toEqual(changes(final)); expect(peer.authority.read().modelVersions).toEqual(finalView.modelVersions);
    const exact = peer.read().source!.originalChanges(); await peer.workspaceFiles.receive(peer.read().source!.token, reply); expect(peer.read().source!.originalChanges()).toEqual(exact);
    expect([...changes(before)].every(([hash, bytes]) => json(changes(final).get(hash)) === json(bytes))).toBe(true);
    await u.dispose(); for (const p of peers) await p.dispose();
    const cold = await openValidationHost(options); expect(changes(cold.read().source!)).toEqual(changes(final)); expect(cold.authority.read().modelVersions).toEqual(finalView.modelVersions);
    expect((await cold.content.model(cold.authority.read().modelVersions!.find(m => m.assetId === chosen.assetId)!.closure.representation as JsonObject, true)).bytes).toEqual(updated);
    await cold.dispose();
  }, 60000);
  it('stages only missing fresh facts for multiple copied GLBs and never repairs acknowledged loss', async () => {
    const f = await receivedFixture(), base = f.initial.source!, provider = f.initial.provider!;
    if (provider.kind !== 'scene-provider') throw Error('provider');
    const assetId = Object.keys(provider.resources.assets)[0]!, sceneId = Object.keys(provider.state.scenes)[0]!;
    const source = assetCopySource(provider, sceneId, assetId, metadata), prefix = (p: string) => `${p}_${newId()}`;
    const copies = await Promise.all([0, 1].map(() => prepareAssetMembershipCopy(source, prefix('sam'), prefix)));
    // Known synthetic input for the fact port; the connected file test exercises the actual resolution command.
    const doc = A.change(A.load<Record<string, any>>(base.encodeFullSource()), draft => {
      for (const copy of copies) {
        for (const [map, record] of [['representationsById', copy.representation], ['assetRevisionsById', copy.revision], ['assetBindingsById', copy.binding]] as const)
          draft[map][record.id as string] = new A.ImmutableString(json(record));
        const life = { state: 'active', reason: 'initial', eventId: prefix('evt') };
        for (const [map, record] of [['assetsById', { ...source.asset, id: copy.ids.asset, assetFrameId: copy.ids.assetFrame,
          status: { kind: 'ready', activeBindingId: copy.ids.binding }, lifecycle: life }], ['sceneAssetMembershipsById', {
          id: copy.ids.membership, sceneId, assetId: copy.ids.asset, orderKey: 'B', lifecycle: life }]] as const)
          draft[map][record.id as string] = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, new A.ImmutableString(json(value))]));
      }
    });
    const next = ProjectMetadataSource.fromFullSource(A.save(doc), base.proof, metadata), content = f.receiver.content;
    const before = new Set(await f.fs.list('')), put = vi.spyOn(f.store, 'put'), prepared = vi.spyOn(content, 'inspectPreparedModel');
    const plan = (await validationModelFacts(content).plan(base, next))!;
    expect(plan.stagedBlobs).toEqual([]); expect(prepared).not.toHaveBeenCalled();
    let writes = 0; f.fs.reject = path => path.includes('/evidence/') && !before.has(path) && ++writes === 2;
    await expect(underWriteLease(f.fs, () => plan.stage())).rejects.toThrow('injected quota');
    const freshPaths = async () => (await f.fs.list('')).filter(path => path.includes('/evidence/') && !before.has(path));
    const first = (await freshPaths())[0]!; expect(await freshPaths()).toHaveLength(1);
    const firstBytes = await f.fs.readBytes(first), observe = vi.spyOn(f.fs, 'writeText');
    f.fs.reject = () => false; await underWriteLease(f.fs, () => plan.stage());
    expect(await freshPaths()).toHaveLength(4); expect(await f.fs.readBytes(first)).toEqual(firstBytes);
    expect(observe.mock.calls.some(([path]) => path === first)).toBe(false); expect(put).not.toHaveBeenCalled();
    await f.fs.remove(first); const reads = f.fs.reads;
    await expect(underWriteLease(f.fs, () => plan.stage())).rejects.toThrow();
    expect(await f.fs.readBytes(first)).toBeNull(); expect(f.fs.reads).toBe(reads);
    for (const path of (await f.fs.list('')).filter(p => p.startsWith('v2/cas/objects/'))) await f.fs.remove(path);
    await expect(validationModelFacts(content).plan(base, next)).rejects.toThrow();
    expect(prepared).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
    expect((await f.receiver.session.read()).source!.token).toBe(f.local.source!.token);
  }, 30000);
  it('disposes superseded, stale and closed candidate previews without invoking their renderers', async () => {
    type Display = Parameters<ModelCandidateRenderer>[0]; type Prepared = Awaited<ReturnType<ModelCandidateRenderer>>;
    const pending: ((p: Prepared) => void)[] = [], prepare = vi.fn(() => new Promise<Prepared>(resolve => pending.push(resolve)));
    let current = true; const ui = createModelCandidatePreview(new RecordedDocument().asDocument(), prepare, () => current);
    const display: Display = { readOnly: true, token: 'candidate', sceneId: 'preview', projectFrameId: 'frame', models: [], pins: [], bounds: null, selectedId: null };
    const unused = () => ({ factory: vi.fn(() => { throw Error('must not mount stale geometry'); }), dispose: vi.fn() });
    ui.show('候補 1', display); ui.show('候補 2', display); const first = unused(); pending[0]!(first);
    await vi.waitFor(() => expect(first.dispose).toHaveBeenCalledOnce()); expect(first.factory).not.toHaveBeenCalled();
    current = false; const stale = unused(); pending[1]!(stale);
    await vi.waitFor(() => expect(stale.dispose).toHaveBeenCalledOnce()); expect(stale.factory).not.toHaveBeenCalled(); ui.render();
    expect(record(ui.root).hidden).toBe(true); current = true; ui.show('候補 1', display); ui.dispose();
    const closed = unused(); pending[2]!(closed); await vi.waitFor(() => expect(closed.dispose).toHaveBeenCalledOnce()); expect(closed.factory).not.toHaveBeenCalled();
    ui.show('候補 2', display); expect(prepare).toHaveBeenCalledTimes(3);
  });
  it('connects explicit pin parent changes to the GLB validation authority and reopens the same Caption', async () => {
    const { options, workspace, host, s, captionId } = await openFileCaption();
    const bytes = glb(); s.addModelFile({ token: s.snapshot.state.token, sceneId: s.sceneId }, {
      name: '変更先モデル', size: bytes.length, arrayBuffer: async () => bytes.buffer as ArrayBuffer });
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    const target = s.snapshot.modelVersions!.find(v => v.assetId !== s.snapshot.captionOwners[captionId]!.assetId)!;
    s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId }));
    const before = host.read().source!.originalChanges().length, old = s.snapshot.resources.captions[captionId]!;
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'reparent', assetId: target.assetId }))).toBe(true);
    const preview = s.pinPreviewAnchor!; expect(preview).toMatchObject({ assetId: target.assetId, assetFrameId: target.projection.assetFrameId });
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }));
    expect(s.acknowledgment.state).toBe('checking');
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(host.read().source!.originalChanges()).toHaveLength(before + 1);
    expect(s.snapshot.resources.captions[captionId]).toEqual({ ...old, anchor: { kind: 'value', value: preview } });
    await workspace.dispose(); const cold = await openValidationHost(options);
    expect(cold.authority.read().resources.captions[captionId]).toEqual({ ...old, anchor: { kind: 'value', value: preview } }); await cold.dispose();
  });
  it('creates a real-GLB pin with its chosen initial color in one change and cold-reopens it without retaining the local preference', async () => {
    const { options, workspace, host, s, captionId: existingId } = await openFileCaption();
    const root = record(workspace.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (label: string) => all(root).find(n => n.tag === 'button' && n.textContent === label)!;
    const color = all(root).find(n => n.attributes.get('aria-label') === '追加色')!;
    const original = s.snapshot, before = host.read().source!.originalChanges().length;
    color.fire('focus'); color.value = '#123456'; color.fire('input');
    expect(s.snapshot).toBe(original); expect(host.read().source!.originalChanges()).toHaveLength(before);
    button('ピンを追加').fire('click'); expect(s.acceptPinCreation(s.pinCreationTargets()[0]!, [3, 0.75, 0])).toBe(true); workspace.render();
    button('位置を確定').fire('click'); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    const id = s.memory.selectedCaptionId!, changes = host.read().source!.originalChanges();
    expect(id).not.toBe(existingId); expect(changes).toHaveLength(before + 1);
    expect(s.snapshot.colors[id]).toEqual({ kind: 'value', value: '#123456' });
    expect(s.snapshot.colors[existingId]).toEqual(original.colors[existingId]);
    await workspace.dispose(); const cold = await openValidationHost(options);
    expect(cold.authority.read().colors[id]).toEqual({ kind: 'value', value: '#123456' });
    expect(cold.read().source!.originalChanges()).toEqual(changes);
    const reopened = createSavedWorkspace(new RecordedDocument().asDocument(), cold);
    expect(reopened.session!.pinContext().memory.addColor).toBe('#a08045'); await reopened.dispose();
  });

  it('opens deliberate View without a lock and refuses every write path before file reads', async () => {
    const { workspace, options, captionId, fs } = await openFileCaption(); await workspace.dispose();
    const acquire = vi.spyOn(options.coordinator, 'tryAcquire');
    const bytes = vi.spyOn(fs, 'writeBytes'), text = vi.spyOn(fs, 'writeText'), metadataWrite = vi.fn();
    const connection = await options.openStorage();
    const tracked: MetadataStorageFactory = () => { const port = connection.factory(); return { ...port,
      save: (key, data) => { metadataWrite(); return port.save(key, data); },
      remove: key => { metadataWrite(); return port.remove(key); },
      removeRange: key => { metadataWrite(); return port.removeRange(key); } }; };
    const view = await openValidationHost({ ...options, mode: 'view', openStorage: async () => ({ factory: tracked, dispose: connection.dispose }) });
    expect(acquire).not.toHaveBeenCalled(); expect(view.authority.readOnly).toBe(true);
    expect(metadataWrite).not.toHaveBeenCalled(); expect(bytes).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
    const editor = await openValidationHost(options); expect(editor.authority.readOnly).toBe(false);
    const token = view.read().source!.token, original = view.read().source!.originalChanges(), paths = await fs.list('');
    const file = { name: '選択ファイル', size: 12, arrayBuffer: vi.fn(async () => new ArrayBuffer(12)) };
    for (const command of [
      () => view.authority.write(token, { [`caption/${captionId}/title`]: '拒否' }),
      () => view.authority.authorScene!(token, { kind: 'renameScene', sceneId: 'scn_missing', name: '拒否' }),
      () => view.authority.deleteCaption!(token, {} as never), () => view.authority.deleteAsset!(token, {} as never),
      () => view.authority.addMediaFile!(token, { file } as never), () => view.authority.addModelFile!(token, { file } as never),
      () => view.authority.transformModel!(token, {} as never), () => view.resolve(token, {} as never), () => view.authority.retry!(),
    ]) await expect(command()).rejects.toThrow('閲覧専用');
    expect(file.arrayBuffer).not.toHaveBeenCalled(); expect(bytes).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
    expect(metadataWrite).not.toHaveBeenCalled();
    expect(await fs.list('')).toEqual(paths); expect(view.read().source!.originalChanges()).toEqual(original);
    await view.dispose(); await editor.dispose();
    const initial = prepareValidationCreation(await prepareValidationProject({ run: options.run, title: '作成不可', models: [{ label: '3D', bytes: glb() }] }, budget, decode));
    acquire.mockClear(); await expect(openValidationHost({ ...options, initial, mode: 'view' })).rejects.toThrow('作成できません');
    expect(acquire).not.toHaveBeenCalled();
  });
  it('hands View to fresh durable Edit without remounting Scene, camera, windows or filters; guards input and releases Edit', async () => {
    const { options, workspace, host: writer, captionId, fs } = await openFileCaption();
    const defaultScene = workspace.session!.sceneId, secondScene = `scn_${newId()}`;
    await writer.authority.authorScene!(writer.read().source!.token, { kind: 'createScene', sceneId: secondScene,
      sourceSceneId: defaultScene, activeSceneId: defaultScene, name: '個別の確認', orderKey: 'z',
      membershipIds: [`sam_${newId()}`], eventId: `evt_${newId()}` });
    const writerSession = workspace.session!; writerSession.refreshHistory();
    expect(writerSession.acceptNavigation(planNavigation(writerSession.snapshot.state, writerSession.session, null, { kind: 'scene', sceneId: secondScene }))).toBe(true);
    writerSession.acceptInclude(planCaptionInclude(writerSession.includeContext(), { kind: 'select', captionId }));
    writerSession.acceptInclude(planCaptionInclude(writerSession.includeContext(), { kind: 'include' }));
    await vi.waitFor(() => expect(writerSession.acknowledgment.state).toBe('idle'));
    const initial = await openValidationHost({ ...options, mode: 'view' });
    const changed = vi.fn(), open = vi.fn(mode => openValidationHost({ ...options, mode }));
    const host = createValidationModeHost(initial, open, changed);
    const display: DisplayCapture = { camera: { position: [5, 2, 9], target: [1, 0, 0], up: [0, 1, 0],
      projection: { kind: 'perspective', verticalFovRadians: 0.7 } }, background: { kind: 'solid', colorSrgb: [0.1, 0.2, 0.3] } };
    const recall = vi.fn(), camera = vi.fn(), dispose = vi.fn(), viewport: ViewportFactory = vi.fn(canvas => {
      // Fixed authored extent, not browser layout or native pointer-capture evidence.
      Object.assign(canvas, { getBoundingClientRect: () => ({ width: 900, height: 600 }) });
      return { update() {}, setActive() {},
      read: () => ({ token: 'camera', ready: true, issue: null, dragging: false, projection: 'perspective' as const, axis: null, pins: [] }),
      capture: () => display, recall, camera, retry() {}, dispose }; });
    const mounted = createSavedWorkspace(new RecordedDocument().asDocument(), host, viewport), s = mounted.session!, root = record(mounted.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (label: string) => all(root).find(n => n.tag === 'button' && n.textContent === label)!;
    expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, null, { kind: 'scene', sceneId: secondScene }))).toBe(true);
    s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId }));
    s.acceptList(planCaptionList(s.captionContext(), { kind: 'search', query: '現地' }));
    mounted.render();
    const resize = all(root).find(n => n.attributes.get('aria-label') === '大きさを変更')!;
    const original = s.snapshot;
    resize.fire('click', { detail: 0 }); // Local window sizing is available in intentional View.
    expect(s.windowMemory.placements[0]!.rect.width).toBe(360); expect(s.snapshot).toBe(original); expect(s.readOnly).toBe(true);
    const memory = s.memory, windows = s.windowMemory, scene = s.sceneId;
    expect(scene).not.toBe(defaultScene); expect(memory.search).toBe('現地'); expect(windows.retained).toContain(captionId);
    const cameraCalls = camera.mock.calls.length, recallCalls = recall.mock.calls.length;
    // Another writer blocks Edit but never closes the existing viewer or acquires on its behalf.
    button('編集を開始する').fire('click'); await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(host.mode!.busy).toBe(false)); mounted.render();
    expect(s.readOnly).toBe(true); expect(s.memory).toBe(memory); expect(dispose).not.toHaveBeenCalled();
    expect(all(root).some(n => n.textContent.includes('ロック'))).toBe(true);
    await writer.authority.write(writer.read().source!.token, { [`caption/${captionId}/title`]: '現地の最新記録' });
    await workspace.dispose(); open.mockClear();
    // Local IME/camera/window interactions must not even start lease acquisition.
    for (const gesture of [(b: boolean) => s.setSearchComposing(b), (b: boolean) => s.setViewportDragging(b)]) {
      gesture(true); button('編集を開始する').fire('click'); expect(open).not.toHaveBeenCalled(); gesture(false);
    }
    mounted.render(); // These direct test setters do not send the host's normal changed notification.
    const pointer = { button: 0, pointerId: 6, clientX: 360, clientY: 280, preventDefault() {} };
    resize.fire('pointerdown', pointer); expect(s.interactionPending).toBe('window');
    resize.fire('pointermove', { ...pointer, clientX: 410 });
    button('編集を開始する').fire('click'); expect(open).not.toHaveBeenCalled();
    resize.fire('pointercancel', pointer); expect(s.interactionPending).toBeNull(); expect(s.windowMemory).toBe(windows);
    button('編集を開始する').fire('click');
    await vi.waitFor(() => expect(button('閲覧に切り替える')?.disabled).toBe(false));
    expect(mounted.session).toBe(s); expect(s.sceneId).toBe(scene); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows);
    expect(s.snapshot.resources.captions[captionId]!.title).toEqual({ kind: 'value', value: '現地の最新記録' });
    expect(viewport).toHaveBeenCalledOnce(); expect(recall).toHaveBeenCalledTimes(recallCalls);
    expect(camera).toHaveBeenCalledTimes(cameraCalls); expect(dispose).not.toHaveBeenCalled();
    expect(changed).toHaveBeenLastCalledWith('edit'); expect(s.readOnly).toBe(false);
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'color', color: '#345678' }))).toBe(true);
    // A source draft is also blocked at the shared Session guard (no silent input loss).
    const detail = s.detailContext(), draft = editCaptionDraft(detail.draft!, detail.source, 'body', '未適用のメモ');
    expect(s.acceptDetail({ kind: 'draft', baseDraft: detail.draft!, draft })).toBe(true);
    const count = open.mock.calls.length;
    button('閲覧に切り替える').fire('click'); expect(open).toHaveBeenCalledTimes(count); expect(s.detailContext().draft).toBe(draft);
    fs.reject = p => p.endsWith('/published.json');
    const apply = planCaptionApply(s.detailContext()); if (apply.kind !== 'apply') throw Error(apply.reason);
    expect(s.acceptDetail(apply)).toBe(false);
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    button('閲覧に切り替える').fire('click'); expect(open).toHaveBeenCalledTimes(count);
    expect(s.detailContext().draft).toBe(draft); expect(host.mode!.current).toBe('edit');
    fs.reject = () => false; s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(s.snapshot.resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '未適用のメモ' });
    button('閲覧に切り替える').fire('click'); await vi.waitFor(() => expect(button('編集を開始する')?.disabled).toBe(false));
    expect(s.readOnly).toBe(true); expect(s.windowMemory).toBe(windows); expect(s.memory).toBe(memory);
    expect(s.pinContext().memory.addColor).toBe('#345678');
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'color', color: '#ffffff' }))).toBe(false);
    const other = await openValidationHost(options); expect(other.authority.readOnly).toBe(false); await other.dispose(); await mounted.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('keeps old View and releases failed, corrupt or late Edit candidates, blocking facade commands throughout handoff', async () => {
    const { options, workspace } = await openFileCaption(); await workspace.dispose();
    const initial = await openValidationHost({ ...options, mode: 'view' });
    let fail: 'lock' | 'read' | 'decode' | 'publish' | 'late' = 'lock', candidate: Awaited<ReturnType<typeof openValidationHost>> | undefined;
    let finish!: () => void; const released = vi.fn();
    const host = createValidationModeHost(initial, async mode => {
      if (fail === 'lock') return openValidationHost({ ...options, coordinator: ProjectMutationCoordinator.browser(null), mode });
      if (fail === 'read') return openValidationHost({ ...options, mode, openStorage: async () => { throw Error('injected read failure'); } });
      candidate = await openValidationHost({ ...options, mode });
      const dispose = candidate.dispose; candidate.dispose = async () => { released(); await dispose(); };
      if (fail === 'late') await new Promise<void>(resolve => { finish = resolve; }); return candidate;
    }, () => {});
    host.setDisplayPreparation(async () => { if (fail === 'decode') throw Error('injected decode failure'); });
    const token = host.read().source!.token, project = host.authority.read();
    for (const kind of ['lock', 'read', 'decode', 'publish'] as const) {
      fail = kind;
      await expect(host.mode!.change('edit', token, () => { if (fail === 'publish') throw Error('injected publication failure'); })).rejects.toThrow();
      expect(host.mode!.current).toBe('view'); expect(host.authority.read()).toBe(project); expect(host.read().source!.token).toBe(token);
      const probe = await openValidationHost(options); expect(probe.authority.readOnly).toBe(false); await probe.dispose();
    }
    expect(released).toHaveBeenCalledTimes(2);
    fail = 'late'; const pending = host.mode!.change('edit', token, () => { throw Error('must never publish'); });
    const rejected = expect(pending).rejects.toThrow('閉じました');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await expect(host.authority.write(token, {})).rejects.toThrow('切替');
    await expect(host.refresh()).rejects.toThrow('切替'); await expect(host.resolve(token, {} as never)).rejects.toThrow('切替');
    const closing = host.dispose(); finish(); await rejected; await closing; expect(released).toHaveBeenCalledTimes(3);
    const probe = await openValidationHost(options); expect(probe.authority.readOnly).toBe(false); await probe.dispose();
  });
  it('lets an already-mounted View acquire recovery-only Edit after observing an interrupted external update', async () => {
    const { options, workspace, host: writer, captionId, fs } = await openFileCaption();
    const view = await openValidationHost({ ...options, mode: 'view' });
    const host = createValidationModeHost(view, mode => openValidationHost({ ...options, mode }), () => {});
    const mounted = createSavedWorkspace(new RecordedDocument().asDocument(), host), s = mounted.session!, root = record(mounted.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (label: string) => all(root).find(n => n.tag === 'button' && n.textContent === label)!;
    const token = s.snapshot.state.token;
    fs.reject = p => p.endsWith('/published.json');
    await expect(writer.authority.write(writer.read().source!.token, { [`caption/${captionId}/title`]: '中断した記録' })).rejects.toThrow();
    await workspace.dispose(); fs.reject = () => false;
    button('再開用データを確認').fire('click'); await vi.waitFor(() => expect(host.read().state).toBe('pending'));
    await vi.waitFor(() => expect(button('編集を開始する').disabled).toBe(false));
    expect(s.snapshot.state.token).toBe(token); expect(s.pending).toBe('update');
    button('編集を開始する').fire('click'); await vi.waitFor(() => expect(button('閲覧に切り替える')?.disabled).toBe(false));
    expect(host.read().state).toBe('pending'); expect(s.pending).toBe('update'); expect(s.snapshot.state.token).toBe(token);
    expect(all(root).some(n => n.textContent === '更新の復旧が必要です。')).toBe(true);
    button('閲覧に切り替える').fire('click'); expect(host.mode!.current).toBe('edit');
    expect(s.retryWorking()).toBe(false); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle')); mounted.render();
    expect(host.read().state).toBe('ready'); expect(s.snapshot.resources.captions[captionId]!.title).toEqual({ kind: 'value', value: '中断した記録' });
    expect(mounted.session).toBe(s); await mounted.dispose();
  });
  it('maps all GLB slots by explicit primitive association and edits instance clones without changing PNG/PBR originals', async () => {
    vi.stubGlobal('self', globalThis);
    const bitmap = { width: 64, height: 48, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    try {
      const bytes = glb(j => {
        j.materials.push({ pbrMetallicRoughness: { baseColorFactor: [0.7, 0.4, 0.1, 1] } }, {}); // Includes an unused declared slot.
        const p = j.meshes[0].primitives[0];
        j.meshes[0].primitives = [{ ...p, material: 1 }, p, { attributes: { POSITION: 0 } }, { ...p }];
        j.nodes.push({ mesh: 0, translation: [-3, 0, 0] }); j.scenes[0].nodes.push(1);
      }, true);
      const { host, workspace, s } = await openFileCaption(bytes), c = s.snapshot.modelVersions![0]!.closure;
      if (c.shape !== 'saved-glb') throw Error('saved model');
      const slots = validationMaterialSlots(c), slot = slots.find(v => v.locator.kind === 'gltfMaterial' && v.locator.materialIndex === 0)!;
      expect(slots).toHaveLength(4);
      const inspected = await host.content.model(c.representation), decoded = await decodeValidationModel(inspected);
      const originals: THREE.MeshStandardMaterial[] = [];
      decoded.root.traverse(n => { if (n instanceof THREE.Mesh) originals.push(n.material as THREE.MeshStandardMaterial); });
      expect(originals).toHaveLength(8);
      expect(originals.map(m => decoded.materialLocators.get(m))).toEqual([1, 0, null, 0, 1, 0, null, 0].map(i => i === null ?
        { kind: 'representationMaterial', slotIndex: 0 } : { kind: 'gltfMaterial', materialIndex: i }));
      const residents = await prepareValidationResidents(s.snapshot.modelVersions!, host.content, async () => decoded);
      const intent: MaterialIntent = { appearance: { lighting: 'unlit', doubleSided: true, baseColorSrgb: [0.3, 0.4, 0.5],
        chroma: { keyColorSrgb: [0.1, 0.2, 0.3], tolerance: 0.2, softness: 0 } }, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' } };
      const changed = residents.create(c, { [slot.target.logicalMaterialSlotId]: intent }), untouched = residents.create(c);
      const mats = (root: THREE.Object3D) => { const result: (THREE.MeshStandardMaterial | THREE.MeshBasicMaterial)[] = [];
        root.traverse(n => { if (n instanceof THREE.Mesh) result.push(n.material); }); return result; };
      const edited = mats(changed.mesh), expectedColor = new THREE.Color().setRGB(0.3, 0.4, 0.5, THREE.SRGBColorSpace);
      for (const i of [1, 3, 5, 7]) {
        expect(edited[i]).toBeInstanceOf(THREE.MeshBasicMaterial); expect(edited[i]!.side).toBe(THREE.DoubleSide);
        expect(edited[i]!.color).toEqual(expectedColor); expect(edited[i]!.map).toBe(originals[i]!.map);
        expect(hardChroma(edited[i]!)).toEqual({ keyColorSrgb: [0.1, 0.2, 0.3], tolerance: 0.2 });
      }
      for (const i of [0, 2, 4, 6]) {
        expect(edited[i]).toBeInstanceOf(THREE.MeshStandardMaterial); expect(edited[i]!.color).toEqual(originals[i]!.color);
        expect(hardChroma(edited[i]!)).toBeUndefined();
      }
      expect(edited[1]).toBe(edited[3]); expect(mats(untouched.mesh)[1]).not.toBe(edited[1]);
      changed.dispose!(); const reset = residents.create(c), restored = mats(reset.mesh)[1] as THREE.MeshStandardMaterial;
      expect(restored).toBeInstanceOf(THREE.MeshStandardMaterial); expect(restored.roughness).toBe(0.7); expect(restored.color.r).toBe(0.2);
      expect(restored.map).toBe(originals[1]!.map); expect(restored.side).toBe(THREE.FrontSide); expect(bitmap.close).not.toHaveBeenCalled();
      expect(hardChroma(restored)).toBeUndefined(); expect(hardChroma(originals[1]!)).toBeUndefined();
      expect(inspected.bytes).toEqual(bytes); expect(originals[1]!.color.r).toBe(0.2);
      reset.dispose!(); untouched.dispose!(); residents.dispose(); expect(bitmap.close).toHaveBeenCalledOnce(); await workspace.dispose();
    } finally { vi.unstubAllGlobals(); }
  });
  it('resolves received real-file material pairs and duplicate owners, edits/resets and returns exact history (recorded DOM)', async () => {
    const f = await openFileCaption(), { host, captionId } = f, sceneId = f.s.sceneId;
    const closure = f.s.snapshot.modelVersions![0]!.closure; if (closure.shape !== 'saved-glb') throw Error('model');
    const slot = validationMaterialSlots(closure)[0]!, id = `ovr_${newId()}`, duplicate = `ovr_${newId()}`, fallback = `ovr_${newId()}`;
    const route = { scope: { kind: 'scene', sceneId }, target: slot.target }, inherit = { coverage: { policy: 'inherit' }, optics: 'inherit' };
    const material = (owner: string, scope: object, appearance: object) => Object.fromEntries(Object.entries({ routing: { scope, target: slot.target }, appearance,
      compositing: inherit, lifecycle: { state: 'active', eventId: `evt_${newId()}`, reason: 'initial' } }).map(([k, v]) => [materialKey(owner, k), json(v)]));
    await host.authority.write(host.read().source!.token, material(fallback, { kind: 'project' }, { doubleSided: true }), { sceneId });
    await host.authority.write(host.read().source!.token, material(id, route.scope, { lighting: 'lit' }), { sceneId });
    const seed = host.read().source!, initial = await host.workspaceOutput.download(await host.workspaceOutput.generate(seed.token));
    const base = host.workspaceOutput.bases[0]!.selection, peer = firstWorkspaceRecipient(); await peer.receiver.importWorkspace(initial);
    await host.authority.write(seed.token, { [`caption/${captionId}/body`]: '手元の記録を保持' });
    const chosenAppearance = { lighting: 'lit', chroma: { keyColorSrgb: [0.123456789, 0.8, 0.2], tolerance: 0.12345678, softness: 0 } };
    const branch = (appearance: object, compositing: object, add = false) => A.change(A.load<Record<string, any>>(seed.encodeFullSource()), d => {
      for (const [key, value] of Object.entries({ appearance, compositing })) {
        delete d.materialOverridesById[id][key]; d.materialOverridesById[id][key] = new A.ImmutableString(json(value));
      }
      if (add) d.materialOverridesById[duplicate] = Object.fromEntries(Object.entries({ id: duplicate, routing: route,
        appearance: { lighting: 'unlit' }, compositing: inherit, lifecycle: { state: 'active', eventId: `evt_${newId()}`, reason: 'initial' } })
        .map(([k, v]) => [k, new A.ImmutableString(json(v))]));
    });
    const a = branch({ lighting: 'unlit' }, { coverage: { policy: 'opaque' }, optics: 'surface' }, true),
      b = branch(chosenAppearance, inherit), c = branch({ lighting: 'lit' }, { coverage: { policy: 'mask', alphaCutoff: 0.5 }, optics: 'surface' });
    const merged = A.merge(A.merge(A.clone(a), A.clone(b)), A.clone(c));
    const remote = ProjectMetadataSource.fromFullSource(A.save(merged), seed.proof, metadata), contentFS = new TestFS(), content = new ValidationContent(contentFS, f.store, budget, decode);
    const provider = await underWriteLease(contentFS, () => readProjectScene(remote.read(), metadata, content.verifier(true))), publication = newId();
    const send = await WorkspaceSourceCapture.prepare({ read: async () => ({ state: 'ready', source: remote, provider, publication }) }, remote.token, f.store, metadata);
    const chunks: BlobPart[] = []; await writeWorkspaceArchive(send, f.store, new WritableStream({ write: b => { chunks.push(b.slice() as BlobPart); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' }); const incoming = new Blob(chunks);
    await peer.receiver.receive((await peer.session.read()).source!.token, incoming); f.workspace.unmount();
    let display: ReturnType<typeof syntheticDisplay> | undefined;
    const recall = vi.fn(), factory = vi.fn(() => ({ update(next: any) { display = next; }, setActive() {}, capture: (): DisplayCapture => ({
      camera: { position: [1, 2, 8], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 0.7 } },
      background: { kind: 'solid', colorSrgb: [0.2, 0.3, 0.4] } }), recall,
      setBackground() {}, camera() {}, retry() {}, dispose() {}, read: () => ({ token: 'local-camera', ready: true, issue: null, dragging: false, projection: 'perspective' as const, axis: null, pins: [] }) }));
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), { fileLimits: budget, decode, list: async () => [], selected() {}, open: async () => host,
      render: async () => ({ factory, dispose() {} }) }, f.options.run), root = record(u.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const named = (label: string, parent = root) => all(parent).find(n => n.attributes.get('aria-label') === label)!;
    const button = (text: string, parent = root) => all(parent).find(n => n.tag === 'button' && n.textContent === text)!;
    const choose = (node: RecordedNode, value: string) => { node.value = value; node.fire('change'); };
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    const input = named('更新ファイルを選択'), receive = input.parent!.parent!;
    Object.assign(input, { files: [incoming] }); input.fire('change'); receive.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === '更新を受け取りました。')).toBe(true), { timeout: 10000 });
    Object.assign(input, { files: [] }); button('選択を取り消す', receive).fire('click');
    const p = () => { const p = host.read().provider; if (p?.kind !== 'scene-provider') throw Error('provider'); return p; };
    const tools = named('マテリアルの更新候補'), form = tools.children.find(n => n.attributes.get('aria-label')?.endsWith('見え方の競合'))!;
    const appearance = named('見え方', form), compositing = named('被覆・光学', form), confirm = button('選択を確定', form);
    expect(appearance.value).toBe(''); expect(compositing.value).toBe(''); expect(confirm.disabled).toBe(true);
    const ctx = materialResolutionContext(p(), sceneId, id, metadata), before = host.read().source!;
    const operation = (field: 'appearance' | 'compositing', value: object) => ctx.atoms(id, field).find(v => json(v.value) === json(value))!.operationId;
    choose(appearance, operation('appearance', chosenAppearance)); choose(compositing, operation('compositing', { coverage: { policy: 'opaque' }, optics: 'surface' }));
    expect(host.read().source!.token).toBe(before.token); expect(recall).not.toHaveBeenCalled();
    const writes = vi.spyOn(f.fs, 'writeBytes'); writes.mockClear(); confirm.fire('click');
    await vi.waitFor(() => expect(form.children.some(n => n.attributes.get('role') === 'status' && !!n.textContent)).toBe(true));
    await vi.waitFor(() => expect(host.hasPending()).toBe(false)); expect(host.read().source!.token).toBe(before.token); expect(writes).not.toHaveBeenCalled();
    // Unsupported real-GLB mask is structurally legal, but cannot bypass host capability checks.
    choose(appearance, operation('appearance', { lighting: 'lit' })); choose(compositing, operation('compositing', { coverage: { policy: 'mask', alphaCutoff: 0.5 }, optics: 'surface' }));
    await expect(host.resolve(before.token, { kind: 'resolveMaterialIntent', sceneId, overrideId: id,
      appearanceOperationId: appearance.value, compositingOperationId: compositing.value })).rejects.toThrow('未接続');
    expect(host.read().source!.token).toBe(before.token); expect(writes).not.toHaveBeenCalled();
    confirm.fire('click'); expect(all(form).filter(n => n.attributes.get('role') === 'status').map(n => n.textContent).join(' ')).toContain('未接続');
    expect(host.read().source!.token).toBe(before.token); expect(writes).not.toHaveBeenCalled();
    choose(appearance, operation('appearance', chosenAppearance)); choose(compositing, operation('compositing', inherit));
    const unchangedToken = host.read().source!.token;
    Object.assign(input, { files: [incoming] }); input.fire('change'); confirm.fire('click');
    expect(confirm.disabled).toBe(true); expect(host.read().source!.token).toBe(unchangedToken);
    Object.assign(input, { files: [] }); button('選択を取り消す', receive).fire('click');
    all(root).find(n => n.className === 'lv-caption-select')!.fire('click');
    const detailBody = named('本文', named('キャプションの詳細'));
    detailBody.fire('compositionstart'); confirm.fire('click'); expect(confirm.disabled).toBe(true); expect(host.read().source!.token).toBe(unchangedToken);
    detailBody.fire('compositionend'); expect(confirm.disabled).toBe(false);
    const explicit = { kind: 'resolveMaterialIntent' as const, sceneId, overrideId: id, appearanceOperationId: appearance.value, compositingOperationId: compositing.value };
    await expect(host.resolve('stale', explicit)).rejects.toThrow('更新');
    const readonly = await openValidationHost(f.options); await expect(readonly.resolve(before.token, explicit)).rejects.toThrow('閲覧専用'); await readonly.dispose();
    expect(host.read().source!.token).toBe(before.token);
    f.fs.reject = path => path.endsWith('/published.json'); confirm.fire('click');
    await vi.waitFor(() => expect(host.authority.status!().kind).toBe('failed'));
    const paths = (await f.fs.list(`${validationArea}/${f.options.run}/`)).filter(p => p.endsWith('.amchange')), bytes = await Promise.all(paths.map(p => f.fs.readBytes(p)));
    expect(host.read().source!.token).toBe(before.token); appearance.value = operation('appearance', { lighting: 'unlit' });
    f.fs.reject = () => false; button('更新を再試行', named('更新の確認')).fire('click');
    await vi.waitFor(() => expect(tools.children.includes(form)).toBe(false));
    expect(await Promise.all(paths.map(p => f.fs.readBytes(p)))).toEqual(bytes);
    expect(materialResolutionContext(p(), sceneId, id, metadata).atoms(id, 'appearance')).toEqual([{ operationId: expect.any(String), value: chosenAppearance }]);
    // Duplicate still withholds the Scene override; Project fallback is not merged into it.
    expect(display!.savedMaterials![closure.binding.assetId]![slot.target.logicalMaterialSlotId]).toMatchObject({ appearance: { doubleSided: true } });
    const dupForm = tools.children.find(n => n.attributes.get('aria-label')?.endsWith('設定の重複'))!;
    choose(named('残す設定', dupForm), id); button('選んだ設定を残す', dupForm).fire('click');
    await vi.waitFor(() => expect(p().details.mutable.materialOverridesById[duplicate]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'deleted', reason: 'conflictResolution' } }));
    expect(display!.savedMaterials![closure.binding.assetId]![slot.target.logicalMaterialSlotId]).toEqual({ appearance: chosenAppearance, compositing: inherit });
    expect(factory).toHaveBeenCalledOnce(); expect(recall).not.toHaveBeenCalled(); expect(display!.sceneId).toBe(sceneId);
    const unchangedFallback = p().details.mutable.materialOverridesById[fallback];
    await host.authority.write(host.read().source!.token, { [materialKey(id, 'appearance')]: json({ ...chosenAppearance, lighting: 'unlit' }) }, { sceneId });
    await host.authority.write(host.read().source!.token, { [materialKey(id, 'lifecycle')]: json({ state: 'deleted', eventId: `evt_${newId()}`, reason: 'userDelete' }) }, { sceneId });
    expect(p().details.mutable.materialOverridesById[fallback]).toEqual(unchangedFallback);
    expect(syntheticDisplay(host.authority.read(), sceneId, null, null).savedMaterials![closure.binding.assetId]![slot.target.logicalMaterialSlotId]).toMatchObject({ appearance: { doubleSided: true } });
    expect(host.authority.read().resources.captions[captionId]!.body).toEqual({ kind: 'value', value: '手元の記録を保持' });
    const final = host.read().source!, reply = await host.workspaceOutput.download(await host.workspaceOutput.generateContribution(final.token, base));
    const received = await peer.receiver.receive((await peer.session.read()).source!.token, reply);
    expect(received.source!.heads).toEqual(final.heads);
    expect(new Map(received.source!.originalChanges().map(b => [A.decodeChange(b).hash, b]))).toEqual(new Map(final.originalChanges().map(b => [A.decodeChange(b).hash, b])));
    expect((await peer.receiver.receive(received.source!.token, reply)).source!.token).toBe(received.source!.token);
    await u.dispose(); confirm.fire('click'); expect(host.read().source!.token).toBe(final.token);
    const cold = await openValidationHost(f.options);
    expect(cold.read().source!.originalChanges()).toEqual(final.originalChanges()); expect(cold.authority.read().modelVersions![0]!.closure).toEqual(closure); await cold.dispose();
  }, 60000);
  it('connects saved GLB material scope/edit/reset and cold reopen; failed save retains draft and never reloads warm model bodies', async () => {
    const { host, workspace, s, fs, options } = await openFileCaption(glb(j => { j.materials.push({}); }));
    const c = s.snapshot.modelVersions![0]!.closure; if (c.shape !== 'saved-glb') throw Error('saved model');
    const residents = await prepareValidationResidents(s.snapshot.modelVersions!, host.content);
    const detach = host.setDisplayPreparation(async next => {
      await residents.prepare(next.modelVersions!); const display = syntheticDisplay(next, s.sceneId, null, null);
      for (const m of display.models) if (m.shape === 'saved-glb') residents.validate(m, display.savedMaterials?.[m.binding.assetId]);
    });
    const request = (r: MaterialIntentRequest) => { const plan = planMaterial(s.materialContext(), r); expect(plan.kind).not.toBe('blocked');
      expect(s.acceptMaterial(plan)).toBe(plan.kind !== 'apply' && plan.kind !== 'remove'); };
    const change = (field: 'lighting' | 'doubleSided' | 'chroma' | 'keyColor', text: string) => { const draft = s.materialContext().draft!;
      expect(s.acceptMaterial({ kind: 'draft', baseDraft: draft, draft: editMaterialDraft(draft, field, text) })).toBe(true); };
    request({ kind: 'model', assetId: c.binding.assetId });
    const context = s.materialContext(); if (context.source.kind !== 'ready') throw Error('ready');
    const surfaces = context.source.models[0]!.surfaces; if (surfaces.kind !== 'value') throw Error('surfaces');
    expect(surfaces.value).toHaveLength(2); expect(surfaces.value.every(v => v.fieldIssues.chroma === null && v.fieldIssues.softness)).toBe(true);
    const slot = validationMaterialSlots(c).find(v => v.locator.materialIndex === 0)!;
    request({ kind: 'surface', key: materialTargetKey(slot.target) }); request({ kind: 'scope', scope: 'project' });
    const reads = fs.reads, before = s.snapshot;
    request({ kind: 'begin' }); change('lighting', 'unlit'); change('chroma', 'on'); change('keyColor', '#ff0000');
    fs.reject = p => p.endsWith('/published.json'); request({ kind: 'apply' });
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    expect(s.snapshot).toBe(before); expect(s.materialContext().draft?.edits.lighting).toBe('unlit'); expect(host.hasPending()).toBe(true);
    fs.reject = () => false; s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(s.materialContext().draft).toBeNull();
    const effect = () => syntheticDisplay(s.snapshot, s.sceneId, null, null).savedMaterials![c.binding.assetId]![slot.target.logicalMaterialSlotId];
    expect(effect()).toMatchObject({ appearance: { lighting: 'unlit', chroma: { keyColorSrgb: [1, 0, 0], tolerance: 0.1, softness: 0 } } });
    request({ kind: 'scope', scope: 'scene' }); request({ kind: 'begin' }); change('lighting', 'lit'); change('doubleSided', 'double'); request({ kind: 'apply' });
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle')); expect(effect()).toMatchObject({ appearance: { lighting: 'lit', doubleSided: true } });
    request({ kind: 'remove' }); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle')); expect(effect()).toMatchObject({ appearance: { lighting: 'unlit' } });
    expect(fs.reads).toBe(reads); const parts = host.read().source!.originalChanges(), sceneId = s.sceneId;
    detach(); residents.dispose(); await workspace.dispose(); const cold = await openValidationHost(options);
    expect(cold.read().source!.originalChanges()).toEqual(parts);
    expect(syntheticDisplay(cold.authority.read(), sceneId, null, null).savedMaterials![c.binding.assetId]![slot.target.logicalMaterialSlotId]).toMatchObject({ appearance: { lighting: 'unlit', chroma: { keyColorSrgb: [1, 0, 0], tolerance: 0.1, softness: 0 } } });
    await cold.dispose();
  }, 20_000);
  it('rejects unsupported saved material edits before journal mutation and exposes non-editable original source semantics', async () => {
    const { host, workspace, s, fs } = await openFileCaption(glb(j => { j.materials.push({ alphaMode: 'MASK', doubleSided: true }); }));
    const c = s.snapshot.modelVersions![0]!.closure; if (c.shape !== 'saved-glb') throw Error('saved model');
    const slots = validationMaterialSlots(c), intent: MaterialIntent = { appearance: { lighting: 'unlit' }, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' } };
    expect(validationMaterialIssue(slots.find(v => v.locator.materialIndex === 1)!, intent)).toContain('未接続');
    const slot = slots.find(v => v.locator.materialIndex === 0)!, id = `ovr_${newId()}`, token = s.snapshot.state.token;
    const changes = Object.fromEntries(Object.entries({ routing: { scope: { kind: 'project' }, target: slot.target },
      appearance: { chroma: { keyColorSrgb: [1, 0, 0], tolerance: 0, softness: 0.1 } }, compositing: intent.compositing,
      lifecycle: { state: 'active', eventId: `evt_${newId()}`, reason: 'initial' } }).map(([k, v]) => [materialKey(id, k), canonicalFixture(v)]));
    const paths = await fs.list(''); await expect(host.authority.write(token, changes, { sceneId: s.sceneId })).rejects.toThrow('未接続');
    expect(host.read().source!.token).toBe(token); expect(host.hasPending()).toBe(false); expect(await fs.list('')).toEqual(paths);
    await workspace.dispose();
  });
  it('adds one GLB in the captured Scene through the model tab; invalid selection remains cancellable and equal bytes create independent Assets', async () => {
    const { host, workspace, s, options, captionId } = await openFileCaption();
    const initial = s.snapshot.modelVersions![0]!, originalCaption = s.snapshot.resources.captions[captionId];
    s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'task', task: 'models' }));
    const controls = createModelAdditionControls(new RecordedDocument().asDocument(), s, () => controls.render()), root = record(controls.root);
    const add = root.children.find(n => n.tag === 'button')!, input = root.children.find(n => n.type === 'file')!;
    Object.assign(input, { click: vi.fn() }); controls.render(); expect(root.hidden).toBe(false);
    const base = host.read().source!.token;
    add.fire('click'); Object.assign(input, { files: [{ name: '不正', size: 3, arrayBuffer: async () => new Uint8Array(3).buffer }] }); input.fire('change');
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(host.hasPending()).toBe(false); expect(host.read().source!.token).toBe(base); expect(workspace.hasChanges()).toBe(true);
    controls.render(); const cancel = root.children.find(n => n.textContent === '選択を取り消す')!;
    expect(cancel.hidden).toBe(false); cancel.fire('click'); expect(workspace.hasChanges()).toBe(false);
    const sceneId = s.sceneId, readModel = vi.spyOn(host.content, 'model'), file = { name: '3Dモデル', size: glb().length, arrayBuffer: vi.fn(async () => glb().buffer as ArrayBuffer) };
    s.setViewportState(true, [initial.assetId], null);
    expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'visibility', action: 'hide', assetId: initial.assetId }))).toBe(true);
    for (let i = 0; i < 2; i++) {
      add.fire('click'); Object.assign(input, { files: [file] }); input.fire('change');
      await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
      expect(s.message).toBe(''); expect(s.snapshot.modelVersions).toHaveLength(i + 2);
      expect(s.hiddenAssetIds).toEqual([initial.assetId]); // New additions are not captured by old hide choices.
      expect(workspace.hasChanges()).toBe(false); controls.render();
    }
    const versions = s.snapshot.modelVersions!; expect(new Set(versions.map(v => v.assetId)).size).toBe(3);
    expect(new Set(versions.map(v => (v.closure.representation.blob as JsonObject).digest)).size).toBe(1);
    expect(s.snapshot.resources.captions[captionId]).toEqual(originalCaption);
    expect(versions.find(v => v.assetId === initial.assetId)).toEqual(initial); expect(readModel.mock.calls.every(([r]) => r.id !== initial.closure.representation.id)).toBe(true);
    expect(Object.values(s.snapshot.state.assetMemberships).every(m => m.sceneId === sceneId)).toBe(true);
    const added = s.modelContext().memory.assetId!; expect(added).not.toBe(initial.assetId);
    s.setViewportState(true, versions.map(v => v.assetId), null); expect(s.beginModelPlacement()).toBe(true);
    s.changeModelPlacement(['1', '2', '3']); s.finishModelPlacement();
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    const parts = host.read().source!.originalChanges(); controls.dispose(); await workspace.dispose();
    const cold = await openValidationHost(options); expect(cold.read().source!.originalChanges()).toEqual(parts);
    expect(cold.authority.read().modelVersions!.find(v => v.assetId === added)!.closure.binding.assetToProject.translation).toEqual([1, 2, 3]);
    expect(cold.authority.read().resources.captions[captionId]).toEqual(originalCaption);
    const reopened = createSavedWorkspace(new RecordedDocument().asDocument(), cold);
    expect(reopened.session!.hiddenAssetIds).toEqual([]); await reopened.dispose();
  }, 20_000);
  it('lets readonly viewers hide and restore a real GLB from its Caption without writes, body reads or clearing the window', async () => {
    const { host, workspace, options, captionId } = await openFileCaption();
    const readOnly = await openValidationHost(options); expect(readOnly.authority.readOnly).toBe(true);
    let display: ReturnType<typeof syntheticDisplay>, ready = true;
    const viewport: ViewportFactory = () => ({ update(d) { if (d.readOnly) throw Error('expected editor display'); display = d; }, setActive() {},
      read: () => ({ token: 'display', ready, issue: ready ? null : 'injected display failure', dragging: false, projection: 'perspective', axis: null,
        pins: display?.pins.map(p => ({ id: p.id, x: 30, y: 30, visible: true })) ?? [] }), camera() {}, retry() {}, dispose() {} });
    const mounted = createSavedWorkspace(new RecordedDocument().asDocument(), readOnly, viewport), s = mounted.session!, root = record(mounted.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const model = s.snapshot.modelVersions![0]!, original = s.snapshot, parts = readOnly.read().source!.originalChanges();
    const readBody = vi.spyOn(readOnly.content, 'model'), write = vi.spyOn(readOnly.authority, 'write');
    expect(s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId }))).toBe(true);
    const window = s.windowMemory;
    button('モデル').fire('click');
    expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: model.assetId }))).toBe(true); mounted.render();
    const modelRoot = all(root).find(n => n.className === 'lv-model-browser')!; expect((modelRoot as unknown as HTMLElement).inert).not.toBe(true);
    expect(all(modelRoot).find(n => n.type === 'checkbox')!.disabled).toBe(true);
    expect(button('隠す').disabled).toBe(false); button('隠す').fire('click');
    expect(display!.pins).toEqual([]); expect(s.captionContext().source).toMatchObject({ captions: [expect.objectContaining({ id: captionId, pin: 'ownerHidden' })] });
    expect(s.windowMemory).toBe(window); expect(mounted.hasChanges()).toBe(false);
    ready = false; mounted.render();
    expect(s.modelContext().source).toMatchObject({ items: [expect.objectContaining({ display: { kind: 'value', value: 'unavailable' } })] });
    expect(all(root).some(n => n.textContent === 'injected display failure' && !n.hidden)).toBe(true);
    expect(button('すべて表示').disabled).toBe(false); button('すべて表示').fire('click');
    expect(s.hiddenAssetIds).toEqual([]); expect(all(root).some(n => n.textContent === 'injected display failure' && !n.hidden)).toBe(true);
    ready = true; mounted.render(); button('隠す').fire('click');
    button('キャプション').fire('click'); expect(button('モデルを表示').disabled).toBe(false); button('モデルを表示').fire('click');
    expect(s.hiddenAssetIds).toEqual([]); expect(display!.pins.map(p => p.id)).toContain(captionId); expect(s.windowMemory).toBe(window);
    expect(s.snapshot).toBe(original); expect(readOnly.read().source!.originalChanges()).toEqual(parts);
    expect(write).not.toHaveBeenCalled(); expect(readBody).not.toHaveBeenCalled();
    await mounted.dispose(); await workspace.dispose();
  });
  it('retains a failed new GLB body and exact changes for retry, then cold-recovers prepared addition only once', async () => {
    const { host, workspace, s, options, fs, store } = await openFileCaption();
    const bytes = glb(j => { j.nodes[0].translation = [8, 0, 0]; }), original = bytes.slice();
    const file = { name: '追加', size: bytes.length, arrayBuffer: vi.fn(async () => bytes.buffer as ArrayBuffer) };
    vi.spyOn(store, 'put').mockRejectedValueOnce(Error('injected GLB quota'));
    s.addModelFile({ token: s.snapshot.state.token, sceneId: s.sceneId }, file);
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    expect(host.read().state).toBe('pending'); expect(s.snapshot.modelVersions).toHaveLength(1); expect(s.cancelModelFile()).toBe(false);
    bytes.fill(0); s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(file.arrayBuffer).toHaveBeenCalledOnce(); expect(s.snapshot.modelVersions).toHaveLength(2);
    expect((s.snapshot.modelVersions!.find(v => v.assetId === s.modelContext().memory.assetId)!.closure.representation.blob as JsonObject).digest).toBe(await digest(original));
    fs.reject = p => p.endsWith('/published.json');
    s.addModelFile({ token: s.snapshot.state.token, sceneId: s.sceneId }, { name: 'さらに追加', size: glb().length, arrayBuffer: async () => glb().buffer as ArrayBuffer });
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed')); expect(s.snapshot.modelVersions).toHaveLength(2);
    const paths = (await fs.list(`${validationArea}/${options.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(paths.map(p => fs.readBytes(p)));
    await workspace.dispose(); fs.reject = () => false;
    const cold = await openValidationHost(options); expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(cold.authority.read().modelVersions).toHaveLength(3);
    const parts = cold.read().source!.originalChanges(), publication = cold.read().publication;
    for (const b of originals) expect(parts.some(p => p.length === b!.length && p.every((v, i) => v === b![i]))).toBe(true);
    await cold.authority.retry!(); expect(cold.read().publication).toBe(publication); expect(cold.read().source!.originalChanges()).toEqual(parts); await cold.dispose();
  }, 20_000);
  it('retains old display after new GLB publication fails to render and retries the same Asset without reopening the editor', async () => {
    const { host, workspace, s } = await openFileCaption(), old = s.snapshot;
    const prepare = vi.fn().mockRejectedValueOnce(Error('injected model display')).mockResolvedValue(undefined);
    const detach = host.setDisplayPreparation(prepare), file = { name: '表示確認', size: glb().length, arrayBuffer: vi.fn(async () => glb().buffer as ArrayBuffer) };
    s.addModelFile({ token: s.snapshot.state.token, sceneId: s.sceneId }, file);
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    expect(host.read().state).toBe('ready'); expect(host.hasPending()).toBe(true); expect(s.snapshot).toBe(old);
    expect(host.authority.read().state.token).toBe(old.state.token); expect(s.hasModelFileSelection).toBe(true);
    const parts = host.read().source!.originalChanges(), publication = host.read().publication;
    s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(s.snapshot.modelVersions).toHaveLength(2); expect(s.hasModelFileSelection).toBe(false);
    expect(host.read().publication).toBe(publication); expect(host.read().source!.originalChanges()).toEqual(parts);
    expect(prepare).toHaveBeenCalledTimes(2); expect(file.arrayBuffer).toHaveBeenCalledOnce(); detach(); await workspace.dispose();
  }, 15_000);
  it('does not replenish acknowledged new model evidence on retry, and cold unprepared addition remains repair-required', async () => {
    for (const phase of ['new-fact', 'lost-fact', 'cold-unprepared'] as const) {
      const { host, workspace, s, options, fs } = await openFileCaption();
      const prefix = `${validationArea}/${options.run}/`, before = await fs.list(prefix), token = s.snapshot.state.token;
      let attempted = false;
      fs.reject = p => phase === 'new-fact' ? p.includes('/evidence/') && !before.includes(p) && (attempted = true) : p.endsWith('/changes/00000000.amchange');
      s.addModelFile({ token, sceneId: s.sceneId }, { name: '障害確認', size: glb().length, arrayBuffer: async () => glb().buffer as ArrayBuffer });
      await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
      expect(host.read().source!.token).toBe(token); expect(s.snapshot.modelVersions).toHaveLength(1);
      fs.reject = () => false;
      if (phase === 'new-fact') {
        expect(attempted).toBe(true); s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
        expect(s.snapshot.modelVersions).toHaveLength(2); await workspace.dispose();
      } else if (phase === 'lost-fact') {
        const added = (await fs.list(prefix)).find(p => p.includes('/evidence/') && !before.includes(p)); expect(added).toBeDefined();
        await fs.remove(added!); s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
        expect(await fs.readBytes(added!)).toBeNull(); expect(s.snapshot.modelVersions).toHaveLength(1); await workspace.dispose();
      } else {
        await workspace.dispose(); const cold = await openValidationHost(options); expect(cold.read().state).toBe('pending');
        await expect(cold.authority.retry!()).rejects.toThrow('incomplete-staging-repair');
        expect(cold.authority.read().modelVersions).toHaveLength(1); await cold.dispose();
      }
    }
  }, 20_000);
  it('rejects stale/read-only/oversized model additions before reading and rejects historical nested identity collisions', async () => {
    const { host, workspace, s, options } = await openFileCaption();
    const file = { name: 'GLB', size: glb().length, arrayBuffer: vi.fn(async () => glb().buffer as ArrayBuffer) };
    const command = { sceneId: s.sceneId, assetId: `ast_${newId()}`, file }, token = s.snapshot.state.token;
    await expect(host.authority.addModelFile!('stale', command)).rejects.toThrow('更新');
    await expect(host.authority.addModelFile!(token, { ...command, file: { ...file, size: budget.maxFileBytes } })).rejects.toThrow('上限');
    const readonly = await openValidationHost(options); await expect(readonly.authority.addModelFile!(token, command)).rejects.toThrow('閲覧専用'); await readonly.dispose();
    expect(file.arrayBuffer).not.toHaveBeenCalled(); const source = host.read().source!, provider = host.read().provider!;
    if (provider.kind !== 'scene-provider') throw Error('provider');
    const { body: _body, ...records } = await prepareValidationModel({ label: '独立モデル', bytes: glb() }, budget, decode);
    const edit = { kind: 'addAsset' as const, sceneId: s.sceneId, ...records, membership: { id: `sam_${newId()}`, sceneId: s.sceneId,
      assetId: records.asset.id!, orderKey: 'Z', lifecycle: { state: 'active', reason: 'initial', eventId: `evt_${newId()}` } } };
    expect(planMetadataEdit(provider, edit, metadata)).toHaveLength(5);
    const old = s.snapshot.modelVersions![0]!.closure;
    for (const change of [() => { edit.asset = { ...edit.asset, assetFrameId: old.assetFrame.id }; }, () => { edit.asset = { ...edit.asset, id: old.binding.assetId }; },
      () => { (edit.representation.materialCatalog as any).slots[0].logicalMaterialSlotId = old.representation.materialCatalog.slots[0]!.logicalMaterialSlotId; }]) {
      const saved = structuredClone(edit); change(); expect(() => planMetadataEdit(provider, edit, metadata)).toThrow(); Object.assign(edit, saved);
    }
    const prepared = await host.content.prepareModel({ label: '所有する入力', bytes: glb() }, `ast_${newId()}`);
    const other = { ...edit, ...prepared, membership: { ...edit.membership, assetId: prepared.asset.id! } };
    const corrupt = await sealValidationRecord('representation', { ...prepared.representation, logicalBoundsAsset: { min: [0, 0, 0], max: [1, 1, 1] } });
    await expect(validationModelFacts(host.content).plan(source, source.prepareEdit(token, { ...other, representation: corrupt }, provider, newId()))).rejects.toThrow();
    expect(host.hasPending()).toBe(false); expect(host.read().source!.token).toBe(token); await workspace.dispose();
  }, 15_000);
  it('prepares added residents atomically, retains old geometry after partial decode failure and disposes late completion', async () => {
    const prepared = await prepareValidationProject({ run: newId(), title: '表示準備', models: [0, 1, 2].map(i => ({ label: `${i}`, bytes: glb() })) }, budget, decode);
    const initial = prepareValidationCreation(prepared), fs = new TestFS(), locks = lockManager();
    const coordinator = ProjectMutationCoordinator.browser(locks), run = prepared.records.identity.projectId!.toString().slice(4);
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1000000, maxChunks: 10000, metadata }, locks);
    const host = await openValidationHost({ run, initial, base: fs, coordinator, store, fileLimits: budget, decode,
      openStorage: async () => ({ factory: storageFactory(), dispose: async () => {} }) });
    const versions = host.authority.read().modelVersions!, releases: ReturnType<typeof vi.fn>[] = [];
    let fail = false; const decoder = vi.fn(async (source: Awaited<ReturnType<typeof inspectValidationGlb>>) => {
      if (fail && releases.length === 2) throw Error('second new decode');
      const model = await decodeValidationModel(source), dispose = vi.fn(model.dispose); releases.push(dispose); return { ...model, dispose };
    });
    const reads = vi.spyOn(host.content, 'model'), cache = await prepareValidationResidents([versions[0]!], host.content, decoder);
    const old = cache.create(versions[0]!.closure as any); fail = true;
    await expect(cache.prepare(versions)).rejects.toThrow('second new decode'); expect(releases[0]).not.toHaveBeenCalled(); expect(releases[1]).toHaveBeenCalledOnce();
    expect(old.asset.children).toHaveLength(1); expect(() => cache.create(versions[1]!.closure as any)).toThrow();
    fail = false; await cache.prepare(versions); expect(reads.mock.calls.filter(([r]) => r.id === versions[0]!.closure.representation.id)).toHaveLength(1);
    cache.create(versions[1]!.closure as any).dispose!(); old.dispose!(); cache.dispose();
    let finish!: (value: any) => void; const delayed = await prepareValidationResidents([], host.content, () => new Promise(resolve => { finish = resolve; }));
    const pending = delayed.prepare([versions[0]!]); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    delayed.dispose(); const release = vi.fn(); finish({ root: new THREE.Group(), dispose: release }); await expect(pending).rejects.toThrow('閉じ'); expect(release).toHaveBeenCalledOnce();
    await host.dispose();
  }, 15_000);
  it('previews/cancels and saves GLB placement only, preserving nested geometry, pin coordinates and body evidence on reopen', async () => {
    const { host, workspace, s, options, captionId, fs } = await openFileCaption();
    const old = s.snapshot, source = old.modelVersions![0]!.closure, reads = fs.reads, parts = host.read().source!.originalChanges();
    expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: source.binding.assetId }))).toBe(true);
    expect(s.beginModelPlacement()).toBe(true); s.setModelTransformMode('rotate');
    s.changeModelTransform(['0', '0', '90'], '2', true); expect(s.finishModelPlacement()).toBe(false);
    s.changeModelTransform(['0', '0', '90'], '0', false); expect(s.modelPlacementProposal()).toBeUndefined(); expect(s.finishModelPlacement()).toBe(false);
    s.changeModelTransform(['0', '0', '90'], '2'); const proposal = s.modelPlacementProposal()!;
    expect(s.acceptModelPosition(proposal.target, [10, 2, -1], proposal.manipulation)).toBe(true);
    const placement = { translation: [10, 2, -1] as const, rotationXYZW: degreesRotation(['0', '0', '90']), uniformScale: 2 };
    const preview = syntheticDisplay(s.snapshot, s.sceneId, null, captionId, s.modelPlacementProposal());
    const anchor = old.resources.captions[captionId]!.anchor;
    if (anchor.kind !== 'value' || anchor.value.kind !== 'asset') throw Error('expected authored Asset anchor');
    expect(preview.pins[0]!.position).toEqual(pointInProject(anchor.value.positionAsset, placement));
    expect(preview.models[0]!.representation).toEqual(source.representation); expect(s.snapshot).toBe(old);
    expect(s.finishModelPlacement(true)).toBe(true); expect(host.read().source!.originalChanges()).toEqual(parts);
    expect(syntheticDisplay(s.snapshot, s.sceneId, null, captionId).pins[0]!.position).toEqual(pointInProject(anchor.value.positionAsset, source.binding.assetToProject));
    s.beginModelPlacement(); s.changeModelPlacement(['10', '2', '-1']); s.changeModelTransform(['0', '0', '90'], '2'); s.finishModelPlacement();
    const prepared = s.modelPlacement!.preparedBindingId;
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(s.modelPlacement).toBeNull(); const saved = s.snapshot.modelVersions![0]!.closure;
    expect(saved.binding).toMatchObject({ id: prepared, method: 'manual', parentBindingId: source.binding.id, assetRevisionId: source.revision.id, assetToProject: placement });
    expect(saved.revision).toEqual(source.revision); expect(saved.representation).toEqual(source.representation);
    expect(saved.assetFrame).toEqual(source.assetFrame); expect(saved.representationFrame).toEqual(source.representationFrame);
    expect(s.snapshot.resources.captions).toEqual(old.resources.captions); expect(s.snapshot.state.assetMemberships).toEqual(old.state.assetMemberships);
    expect(fs.reads).toBe(reads); expect(host.read().source!.originalChanges()).toHaveLength(parts.length + 1);
    const residentReads = vi.spyOn(host.content, 'model'), residents = await prepareValidationResidents(old.modelVersions!, host.content);
    if (source.shape !== 'saved-glb' || saved.shape !== 'saved-glb') throw Error('expected saved model');
    const originalResident = residents.create(source), movedResident = residents.create(saved);
    expect(new THREE.Box3().setFromObject(originalResident.mesh).min.x).toBe(2);
    expect(movedResident.asset.matrix.elements.slice(12, 15)).toEqual(placement.translation);
    expect(movedResident.mesh.position).toEqual(originalResident.mesh.position);
    expect(residentReads).toHaveBeenCalledOnce(); originalResident.dispose?.(); movedResident.dispose?.(); residents.dispose();
    const after = host.read().source!.originalChanges(); s.beginModelPlacement(); expect(s.finishModelPlacement()).toBe(true);
    expect(host.read().source!.originalChanges()).toEqual(after); await workspace.dispose();
    const cold = await openValidationHost(options);
    expect(cold.authority.read().modelVersions![0]!.closure.binding).toEqual(saved.binding);
    expect(cold.authority.read().resources.captions).toEqual(old.resources.captions);
    expect(cold.read().source!.originalChanges()).toEqual(after); await cold.dispose();
  }, 15_000);
  it('keeps the exact GLB binding/draft on save failure, cold-recovers once and rejects stale/read-only/invalid transforms', async () => {
    const { host, workspace, s, options, fs } = await openFileCaption();
    const source = s.snapshot.modelVersions![0]!.closure, old = s.snapshot, reads = fs.reads;
    s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: source.binding.assetId })); s.beginModelPlacement();
    s.changeModelTransform(['20', '30', '40'], '3'); fs.reject = p => p.endsWith('/published.json'); s.finishModelPlacement();
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    const bindingId = s.modelPlacement!.preparedBindingId!;
    expect(s.snapshot).toBe(old); expect(workspace.hasChanges()).toBe(true); expect(s.finishModelPlacement(true)).toBe(false);
    expect(s.changeModelTransform(['0', '0', '0'], '1')).toBe(false); expect(fs.reads).toBe(reads);
    const paths = (await fs.list(`${validationArea}/${options.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(paths.map(p => fs.readBytes(p)));
    fs.reject = () => false; s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(s.snapshot.modelVersions![0]!.closure.binding.id).toBe(bindingId); expect(fs.reads).toBe(reads);
    expect(await Promise.all(paths.map(p => fs.readBytes(p)))).toEqual(originals);
    const token = host.read().source!.token, baseline = host.read().source!.originalChanges();
    const command = { sceneId: s.sceneId, assetId: source.binding.assetId, expectedBindingId: bindingId, bindingId: `bnd_${newId()}`,
      placement: { translation: [0, 0, 0] as const, rotationXYZW: [0, 0, 0, 1] as const, uniformScale: 2 } };
    await expect(host.authority.transformModel!('stale', command)).rejects.toThrow();
    await expect(host.authority.transformModel!(token, { ...command, expectedBindingId: source.binding.id })).rejects.toThrow();
    await expect(host.authority.transformModel!(token, { ...command, sceneId: `scn_${newId()}` })).rejects.toThrow();
    for (const placement of [{ ...command.placement, uniformScale: 0 }, { ...command.placement, uniformScale: -1 },
      { ...command.placement, rotationXYZW: [0, 0, 0, 2] as const }]) await expect(host.authority.transformModel!(token, { ...command, placement })).rejects.toThrow();
    const readonly = await openValidationHost(options);
    await expect(readonly.authority.transformModel!(token, command)).rejects.toThrow('閲覧専用'); await readonly.dispose();
    expect(host.hasPending()).toBe(false); expect(host.read().source!.originalChanges()).toEqual(baseline);
    s.beginModelPlacement(); s.changeModelTransform(['40', '50', '60'], '4'); fs.reject = p => p.endsWith('/published.json'); s.finishModelPlacement();
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed')); const secondId = s.modelPlacement!.preparedBindingId!;
    await workspace.dispose(); fs.reject = () => false;
    const cold = await openValidationHost(options); expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(cold.authority.read().modelVersions![0]!.closure.binding.id).toBe(secondId);
    const publication = cold.read().publication, after = cold.read().source!.originalChanges(); await cold.authority.retry!();
    expect(cold.read().publication).toBe(publication); expect(cold.read().source!.originalChanges()).toEqual(after); await cold.dispose();
  }, 15_000);
  it('adds a selected PNG through the existing media editor, retains invalid input and reopens the exact attachment', async () => {
    const { host, workspace, s, options, captionId } = await openFileCaption();
    const modelRead = vi.spyOn(host.content, 'model');
    const controls = createMediaControls(new RecordedDocument().asDocument(), s.media, () => controls.render()), root = record(controls.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (label: string) => all(root).find(n => n.tag === 'button' && n.textContent === label)!;
    const input = all(root).find(n => n.type === 'file')!, dialog = vi.fn(); Object.assign(input, { click: dialog });
    controls.render(); expect(button('メディアを追加').disabled).toBe(false);
    const original = host.read().source!.token;
    button('メディアを追加').fire('click'); expect(dialog).toHaveBeenCalledOnce();
    Object.assign(input, { files: [{ name: '破損.png', size: 4, arrayBuffer: async () => new Uint8Array(4).buffer }] }); input.fire('change');
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(host.hasPending()).toBe(false); expect(host.read().source!.token).toBe(original);
    expect(workspace.hasChanges()).toBe(true); controls.render();
    expect(button('選択を取り消す').disabled).toBe(false); button('選択を取り消す').fire('click');
    expect(workspace.hasChanges()).toBe(false);
    button('メディアを追加').fire('click');
    const file = { name: '内容で検査.glb', size: png.length, arrayBuffer: vi.fn(async () => png.slice().buffer) };
    Object.assign(input, { files: [file] }); input.fire('change');
    expect(workspace.hasChanges()).toBe(true);
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(s.media.message).toBe(''); expect(workspace.hasChanges()).toBe(false);
    const rows = captionAttachments(s.snapshot.mediaData, captionId).ready; expect(rows).toHaveLength(1);
    expect(s.captionContext().source).toMatchObject({ captions: [expect.objectContaining({ id: captionId, mediaCount: { kind: 'value', value: 1 } })] });
    expect(s.includeContext().source).toMatchObject({ items: [expect.objectContaining({ caption: expect.objectContaining({ id: captionId, mediaCount: { kind: 'value', value: 1 } }) })] });
    expect(s.snapshot.mediaChoices).toHaveLength(1); expect(s.snapshot.mediaChoices![0]!.label).toBe(file.name);
    expect(modelRead).not.toHaveBeenCalled(); expect(file.arrayBuffer).toHaveBeenCalledOnce();
    const parts = host.read().source!.originalChanges(); controls.dispose(); await workspace.dispose();
    const cold = await openValidationHost(options);
    expect(cold.read().source!.originalChanges()).toEqual(parts);
    expect(captionAttachments(cold.authority.read().mediaData, captionId).ready).toEqual(rows);
    expect(new SyntheticSession(cold.authority).captionContext().source).toMatchObject({ captions: [expect.objectContaining({ id: captionId, mediaCount: { kind: 'value', value: 1 } })] });
    expect(Object.values(cold.authority.read().mediaData!.images!)[0]!.base64).toBe(fixtureMedia[0]!.base64);
    await cold.dispose();
  }, 15_000);
  it('retries failed PNG staging from owned input and cold-recovers prepared attachment changes without duplication', async () => {
    const { host, workspace, s, options, captionId, fs, store } = await openFileCaption();
    const original = host.read().source!.token, bytes = png.slice();
    const file = { name: '追加PNG', size: bytes.length, arrayBuffer: vi.fn(async () => bytes.buffer) };
    const put = vi.spyOn(store, 'put').mockRejectedValueOnce(Error('injected body quota'));
    s.media.addFile(s.mediaContext(), file);
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    expect(host.read().state).toBe('pending'); expect(host.read().source!.token).toBe(original);
    expect(captionAttachments(s.snapshot.mediaData, captionId).ready).toHaveLength(0);
    expect(s.captionContext().source).toMatchObject({ captions: [expect.objectContaining({ mediaCount: { kind: 'value', value: 0 } })] });
    expect(s.media.cancelFile()).toBe(false); bytes.fill(0);
    s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(file.arrayBuffer).toHaveBeenCalledOnce(); expect(put).toHaveBeenCalledTimes(2);
    expect(captionAttachments(s.snapshot.mediaData, captionId).ready).toHaveLength(1);
    expect(s.captionContext().source).toMatchObject({ captions: [expect.objectContaining({ mediaCount: { kind: 'value', value: 1 } })] });
    const media = s.snapshot.mediaChoices![0]!; expect(media.blob.digest).toBe(await digest(png));
    const published = host.read().publication; await host.authority.retry!(); expect(host.read().publication).toBe(published);
    fs.reject = p => p.endsWith('/published.json');
    s.media.addFile(s.mediaContext(), { name: '二つ目PNG', size: png.length, arrayBuffer: async () => png.slice().buffer });
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    expect(captionAttachments(s.snapshot.mediaData, captionId).ready).toHaveLength(1);
    expect(s.captionContext().source).toMatchObject({ captions: [expect.objectContaining({ mediaCount: { kind: 'value', value: 1 } })] });
    const pendingPaths = (await fs.list(`${validationArea}/${options.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(pendingPaths.map(p => fs.readBytes(p)));
    await workspace.dispose(); fs.reject = () => false;
    const cold = await openValidationHost(options); expect(cold.read().state).toBe('pending');
    await cold.authority.retry!();
    expect(captionAttachments(cold.authority.read().mediaData, captionId).ready).toHaveLength(2);
    expect(new SyntheticSession(cold.authority).captionContext().source).toMatchObject({ captions: [expect.objectContaining({ mediaCount: { kind: 'value', value: 2 } })] });
    const after = cold.read().source!.originalChanges(), publication = cold.read().publication;
    for (const bytes of originals) expect(after.some(b => b.length === bytes!.length && b.every((v, i) => v === bytes![i]))).toBe(true);
    await cold.authority.retry!(); expect(cold.read().publication).toBe(publication);
    expect(cold.read().source!.originalChanges()).toEqual(after); await cold.dispose();
  }, 15_000);
  it('rejects stale targets, read-only tabs and over-budget files before reading or modifying the selected input', async () => {
    const { host, workspace, s, options, captionId } = await openFileCaption();
    const file = { name: 'PNG', size: png.length, arrayBuffer: vi.fn(async () => png.slice().buffer) };
    const command = { file, sceneId: s.sceneId, captionId, attachmentId: `att_${newId()}`, eventId: `evt_${newId()}`, orderKey: 'A' };
    const token = host.read().source!.token, original = host.read().source!.originalChanges();
    await expect(host.authority.addMediaFile!('stale', command)).rejects.toThrow('更新');
    await expect(host.authority.addMediaFile!(token, { ...command, file: { ...file, size: budget.maxFileBytes } })).rejects.toThrow('上限');
    const readonly = await openValidationHost(options); expect(readonly.authority.readOnly).toBe(true);
    await expect(readonly.authority.addMediaFile!(token, command)).rejects.toThrow('閲覧専用'); await readonly.dispose();
    expect(file.arrayBuffer).not.toHaveBeenCalled(); expect(host.hasPending()).toBe(false);
    expect(host.read().source!.originalChanges()).toEqual(original); await workspace.dispose();
  }, 15_000);
  it('keeps a post-publication gallery failure visible and confirms the same attachment on retry', async () => {
    const { host, workspace, s, captionId } = await openFileCaption();
    const before = host.read().source!.token, readImage = host.content.image.bind(host.content); let failDisplay = true;
    vi.spyOn(host.content, 'image').mockImplementation(async record => {
      if (host.read().source!.token !== before && failDisplay) { failDisplay = false; throw Error('injected gallery read'); }
      return readImage(record);
    });
    const file = { name: '保存後の表示確認', size: png.length, arrayBuffer: vi.fn(async () => png.slice().buffer) };
    s.media.addFile(s.mediaContext(), file);
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    expect(host.read().state).toBe('ready'); expect(host.hasPending()).toBe(true);
    expect(workspace.hasChanges()).toBe(true); expect(s.snapshot.state.token).toBe(before);
    const publication = host.read().publication, parts = host.read().source!.originalChanges();
    s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(host.hasPending()).toBe(false); expect(workspace.hasChanges()).toBe(false);
    expect(host.read().publication).toBe(publication); expect(host.read().source!.originalChanges()).toEqual(parts);
    expect(captionAttachments(s.snapshot.mediaData, captionId).ready).toHaveLength(1);
    expect(file.arrayBuffer).toHaveBeenCalledOnce(); await workspace.dispose();
  }, 15_000);
  it('connects file selection/create/list/reopen, guards composition/pending save and disposes a late renderer (recorded DOM only)', async () => {
    const fs = new TestFS(), locks = lockManager(), coordinator = ProjectMutationCoordinator.browser(locks);
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const options = { base: fs, coordinator, store, fileLimits: budget, decode }, storage = new Map<string, MetadataStorageFactory>();
    const openStorage = async (id: string, create: boolean) => {
      if (!storage.has(id)) { if (!create) throw Error('missing'); storage.set(id, storageFactory()); }
      return { factory: storage.get(id)!, dispose: async () => {} };
    };
    let host: Awaited<ReturnType<typeof openValidationHost>> | undefined;
    const released = vi.fn(), draw: ValidationWorkspacePorts['render'] = async () => ({
      factory: () => { throw Error('Recorded DOM has no GPU'); }, dispose: released });
    const ports: ValidationWorkspacePorts = { fileLimits: budget, decode, selected: vi.fn(),
      list: () => listValidationProjects(options, openStorage), render: draw,
      open: vi.fn(async (run, initial, mode) => host = await openValidationHost({ ...options, run, initial, mode, openStorage: create => openStorage(run, create) })) };
    const u = createValidationWorkspace(new RecordedDocument().asDocument(), ports), root = record(u.root);
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const title = all(root).find(n => n.attributes.get('aria-label') === 'プロジェクト名')!, files = all(root).find(n => n.attributes.get('aria-label') === '3Dモデルとメディアを選択')!;
    const form = files.parent!.parent!, submit = () => form.fire('submit', { preventDefault() {} });
    await vi.waitFor(() => expect(button('一覧を更新').parent && !u.hasChanges()).toBe(true));
    title.fire('compositionstart'); submit(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(ports.open).not.toHaveBeenCalled(); expect(u.hasChanges()).toBe(true); title.fire('compositionend');
    // Filename is intentionally misleading: content, not the suffix, decides the admission route.
    const bytes = glb(), file = { name: '現場.png', size: bytes.length, arrayBuffer: async () => bytes.slice().buffer };
    Object.assign(files, { files: [file] }); title.value = '選択から作成'; submit();
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true), { timeout: 5000 });
    expect(host!.authority.read().modelVersions).toHaveLength(1); const id = u.selected!;
    expect(host!.read().source!.semanticProfile).toBe('map2');
    expect(host!.read().source!.proof.envelope.adapterFormatVersion).toBe('lociview-automerge-atomic-map-2');
    // The recorded file input does not implement the browser's value='' -> files reset.
    Object.assign(files, { files: [] });
    const s = host!.authority.read(), sceneId = Object.keys(s.state.scenes)[0]!;
    fs.reject = p => p.endsWith('/published.json');
    await expect(host!.authority.authorScene!(s.state.token, { kind: 'renameScene', sceneId, name: '未完了の改名' })).rejects.toThrow();
    button('プロジェクトを選ぶ').fire('click'); await new Promise(resolve => setTimeout(resolve, 0));
    expect(u.selected).toBe(id); expect(u.hasChanges()).toBe(true);
    fs.reject = () => false; await host!.authority.retry!();
    button('プロジェクトを選ぶ').fire('click');
    await vi.waitFor(() => expect(u.selected).toBeNull());
    expect(released).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === '選択から作成 — 再開用データ ')).toBe(true));
    button('閲覧で開く').fire('click'); await vi.waitFor(() => expect(u.selected).toBe(id));
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    expect(host!.authority.readOnly).toBe(true); expect(ports.selected).toHaveBeenLastCalledWith(id, 'view');
    expect(host!.read().source!.semanticProfile).toBe('map2');
    button('編集を開始する').fire('click');
    await vi.waitFor(() => expect(button('閲覧に切り替える')?.disabled).toBe(false));
    expect(host!.authority.readOnly).toBe(false); expect(ports.selected).toHaveBeenLastCalledWith(id, 'edit');
    await u.dispose(); expect(released).toHaveBeenCalledTimes(2);
    let finish!: (r: Awaited<ReturnType<ValidationWorkspacePorts['render']>>) => void;
    const lateRelease = vi.fn(), lateRender = vi.fn(() => new Promise<Awaited<ReturnType<ValidationWorkspacePorts['render']>>>(r => { finish = r; }));
    const late = createValidationWorkspace(new RecordedDocument().asDocument(), { ...ports, render: lateRender }, id);
    await vi.waitFor(() => expect(lateRender).toHaveBeenCalledOnce());
    const closing = late.dispose(); finish({ factory: () => { throw Error('must not mount after disposal'); }, dispose: lateRelease });
    await closing; expect(lateRelease).toHaveBeenCalledOnce();
    const reopened = await ports.open(id); expect(reopened.authority.readOnly).toBe(false);
    // Publication may be ready while host-owned image/projection preparation has failed.
    let displayFailed = true; const originalRetry = reopened.authority.retry!;
    reopened.hasPending = () => displayFailed;
    reopened.authority.retry = async () => { const p = await originalRetry(); displayFailed = false; return p; };
    const afterSave = createValidationWorkspace(new RecordedDocument().asDocument(), { ...ports, open: async () => reopened }, id);
    const afterRoot = record(afterSave.root);
    await vi.waitFor(() => expect(all(afterRoot).some(n => n.textContent === '更新を再試行')).toBe(true));
    all(afterRoot).find(n => n.textContent === '更新を再試行')!.fire('click');
    await vi.waitFor(() => expect(all(afterRoot).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    await afterSave.dispose();
  });
  it('connects the same editor to actual saved models/media, correct Project scope, catalog and independent reopen', async () => {
    const fs = new TestFS(), locks = lockManager(), coordinator = ProjectMutationCoordinator.browser(locks), run = newId();
    await fs.writeText('projects/unchanged/record.txt', 'old project');
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const factory = storageFactory(), options = { base: fs, coordinator, store, fileLimits: budget, decode };
    let opened = false; const openStorage = async (create: boolean) => {
      if (!opened && !create) throw Error('no database'); opened = true; return { factory, dispose: async () => {} };
    };
    const initial = prepareValidationCreation(await prepareValidationProject({ run, title: '現場の記録',
      models: [{ label: '実形状', bytes: glb() }], media: [{ label: '確認用PNG', bytes: png }] }, budget, decode));
    const host = await openValidationHost({ ...options, run, initial, openStorage });
    expect(host.hasPending()).toBe(false); expect(host.authority.read().validationFiles).toBe(true);
    let display: DisplayCapture = { camera: { position: [1, 2, 8], target: [0, 0, 0], up: [0, 1, 0],
      projection: { kind: 'perspective', verticalFovRadians: 0.7 } }, background: { kind: 'solid', colorSrgb: [1, 1, 1] } }, token = 0;
    const viewport: ViewportFactory = () => ({ update() {}, setActive() {},
      read: () => ({ token: String(token), ready: true, issue: null, dragging: false, projection: 'perspective', axis: null, pins: [] }),
      capture: () => display, setBackground: (background, verify) => { display = { ...display, background }; verify?.(); token++; },
      recall: payload => { display = payload; token++; }, camera() {}, retry() {}, dispose() {} });
    const mounted = createSavedWorkspace(new RecordedDocument().asDocument(), host, viewport), s = mounted.session!;
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)], root = record(mounted.root);
    const button = (r: RecordedNode, text: string) => all(r).find(n => n.tag === 'button' && n.textContent === text)!;
    const named = (r: RecordedNode, name: string) => all(r).find(n => n.attributes.get('aria-label') === name)!;
    const model = s.snapshot.modelVersions![0]!;
    expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: model.assetId }))).toBe(true);
    expect(s.snapshot.projectId).toBe(`prj_${run}`); expect(s.snapshot.mediaChoices).toHaveLength(1);
    const source = host.read().source!;
    await expect(host.authority.write('stale', { 'invalid/key': 'refused' })).rejects.toThrow();
    expect(host.hasPending()).toBe(false); expect(host.read().source!.token).toBe(source.token);
    s.setViewportState(true, [model.assetId], null);
    expect(s.acceptPinCreation(s.pinCreationTargets()[0]!, [3, 0.5, 0])).toBe(true);
    expect(mounted.hasChanges()).toBe(true);
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }));
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    const captionId = s.memory.selectedCaptionId!; expect(captionId).toBeTruthy();
    const image = s.snapshot.mediaChoices![0]!;
    s.media.add(s.mediaContext(), image.id);
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(Object.values(s.snapshot.mediaData!.records)).toHaveLength(1);
    expect(s.snapshot.mediaData!.images![image.id]!.base64).toBe(fixtureMedia[0]!.base64);
    const beforeBackground = host.read().source!.token, originalCamera = display.camera;
    mounted.render(); button(root, '視点').fire('click');
    const bg = named(root, '3D背景'), hex = named(bg, '背景色'); hex.value = '#2468ac'; hex.fire('input');
    expect(mounted.hasChanges()).toBe(true); button(bg, '背景に適用').fire('click');
    expect(mounted.hasChanges()).toBe(false); expect(display.camera).toBe(originalCamera);
    expect(host.read().source!.token).toBe(beforeBackground);
    const captured = display; expect(captured.background.colorSrgb).toEqual([36 / 255, 104 / 255, 172 / 255]);
    const author = named(root, '視点の作成と管理'); button(author, '視点を作る').fire('click');
    const name = named(author, '視点の名称'); name.value = '現地の表示'; name.fire('input'); button(author, '視点を追加').fire('click');
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    const viewId = Object.keys(s.snapshot.viewData!.records)[0]!;
    expect(s.snapshot.viewData!.records[viewId]!.background).toEqual({ kind: 'value', value: captured.background });
    const reads = fs.reads;
    await host.authority.write(host.read().source!.token, { [`caption/${captionId}/title`]: '現地の確認' });
    expect(fs.reads).toBe(reads); const parts = host.read().source!.originalChanges(); await mounted.dispose();
    expect(await listValidationProjects(options, async (_id, create) => openStorage(create)))
      .toEqual([{ run, title: '現場の記録', state: 'ready' }]);
    const cold = await openValidationHost({ ...options, run, openStorage });
    expect(cold.authority.read().resources.captions[captionId]!.title).toEqual({ kind: 'value', value: '現地の確認' });
    expect(cold.authority.read().mediaData!.images![image.id]!.base64).toBe(fixtureMedia[0]!.base64);
    expect(cold.read().source!.originalChanges()).toEqual(parts);
    display = { ...display, background: { kind: 'solid', colorSrgb: [0, 0, 0] } }; token++;
    const reopened = createSavedWorkspace(new RecordedDocument().asDocument(), cold, viewport), reopenedRoot = record(reopened.root);
    button(reopenedRoot, '視点').fire('click');
    const choices = all(reopenedRoot).find(n => n.tag === 'select' && n.attributes.get('aria-label') === '保存した視点')!;
    choices.value = viewId; choices.fire('change'); button(named(reopenedRoot, '保存した視点'), '表示').fire('click');
    expect(display).toEqual(captured); await reopened.dispose();
    expect(await fs.readText('projects/unchanged/record.txt')).toBe('old project');
    await expect(openValidationHost({ ...options, run, initial, openStorage })).rejects.toThrow('既存データ');
  });
  it('lists incomplete creation without making it ready, recovers exact initial bytes and rejects another Project before publication', async () => {
    const fs = new TestFS(), locks = lockManager(), coordinator = ProjectMutationCoordinator.browser(locks), run = newId();
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const factory = storageFactory(), openStorage = async () => ({ factory, dispose: async () => {} });
    const options = { base: fs, coordinator, store, fileLimits: budget, decode, openStorage, run };
    const initial = prepareValidationCreation(await prepareValidationProject({ run, title: '作成途中', models: [{ label: '3Dモデル', bytes: glb() }] }, budget, decode));
    fs.reject = p => p.endsWith('/published.json'); const first = await openValidationHost({ ...options, initial });
    expect(first.read().state).toBe('pending'); expect(first.hasPending()).toBe(true);
    expect((await listValidationProjects(options, openStorage))[0]!.state).toBe('incomplete');
    const readonly = await openValidationHost(options); expect(readonly.authority.readOnly).toBe(true);
    await expect(readonly.authority.retry!()).rejects.toThrow('閲覧専用'); await readonly.dispose(); await first.dispose();
    fs.reject = () => false;
    const cold = await openValidationHost(options); await cold.authority.retry!();
    expect(cold.read().source!.originalChanges()).toEqual(initial.source.originalChanges());
    const publication = cold.read().publication; await cold.authority.retry!(); expect(cold.read().publication).toBe(publication); await cold.dispose();
    const wrong = newId(), target = `${validationArea}/${wrong}`;
    for (const path of (await fs.list(`${validationArea}/${run}/`)).filter(p => p.endsWith('/validation-initial.json') || p.endsWith('/validation-initial.am')))
      await fs.writeBytes(path.replace(`${validationArea}/${run}`, target), (await fs.readBytes(path))!);
    const emptyFactory = storageFactory(), wrongHost = await openValidationHost({ ...options, run: wrong,
      openStorage: async () => ({ factory: emptyFactory, dispose: async () => {} }) });
    await expect(wrongHost.authority.retry!()).rejects.toThrow('一致');
    expect(wrongHost.read().publication).toBeNull();
    expect((await fs.list(target)).filter(p => p.endsWith('/start.json'))).toEqual([]); await wrongHost.dispose();
  });
  it('derives source locators, transformed geometry bounds, surface counts and PNG decode from actual bytes', async () => {
    const bytes = glb(() => {}, true), before = bytes.slice(); decode.mockClear();
    const result = await inspectValidationGlb(bytes, budget, decode);
    expect(result.bounds).toEqual({ min: [2, 0, 0], max: [4, 2, 0] });
    expect(result.surfaceRanges).toEqual([{ kind: 'meshTriangle', nodeIndex: 0, primitiveIndex: 0, count: 1 }]);
    expect(result.materials[0]).toMatchObject({ sourceLocator: { kind: 'gltfMaterial', materialIndex: 0 }, sourceSemantics: { coverage: { kind: 'opaque' }, lighting: 'lit' } });
    expect(decode).toHaveBeenCalledTimes(1); expect((await decode.mock.results[0]!.value).close).toHaveBeenCalledTimes(1);
    expect(bytes).toEqual(before); expect(result.bytes).toEqual(before); expect(result.bytes).not.toBe(bytes);
    const implicit = await inspectValidationGlb(glb(j => { delete j.meshes[0].primitives[0].material; delete j.materials; }), budget, decode);
    expect(implicit.materials).toHaveLength(1); expect(implicit.materials[0]!.sourceLocator).toEqual({ kind: 'representationMaterial', slotIndex: 0 });
  });
  it('rejects omitted/unsupported resources, malformed geometry/graphs, partial containers and exhausted work without a loader fallback', async () => {
    const cases = [
      (j: any) => { j.buffers[0].uri = 'https://example.invalid/source'; },
      (j: any) => { j.animations = []; }, (j: any) => { j.skins = []; }, (j: any) => { j.nodes[0].skin = 0; },
      (j: any) => { j.meshes[0].primitives[0].targets = []; }, (j: any) => { j.meshes[0].primitives[0].mode = 0; },
      (j: any) => { j.accessors[0].sparse = {}; }, (j: any) => { j.accessors[0].count = 4; },
      (j: any) => { j.accessors[0].min = [0, 0, 0]; }, (j: any) => { j.meshes[0].primitives[0].material = 99; },
      (j: any) => { j.nodes[0].children = [0]; }, (j: any) => { delete j.scene; j.scenes.push({ nodes: [0] }); },
      (j: any) => { j.extensionsUsed = ['KHR_materials_transmission']; },
      (j: any) => { j.materials[0].extensions = { KHR_materials_unlit: {} }; },
      (j: any) => { delete j.nodes[0].translation; j.nodes[0].matrix = [1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
    ];
    for (const modify of cases) await expect(inspectValidationGlb(glb(modify), budget, decode)).rejects.toThrow();
    await expect(inspectValidationGlb(glb((_, bin) => new DataView(bin.buffer).setFloat32(0, NaN, true)), budget, decode)).rejects.toThrow();
    await expect(inspectValidationGlb(glb(), { ...budget, maxValues: 1 }, decode)).rejects.toThrow('上限');
    const short = glb().slice(0, -1); expect(() => validationGlbParts(short, budget)).toThrow();
    const wrong = glb(); new DataView(wrong.buffer).setUint32(8, wrong.length + 4, true); expect(() => validationGlbParts(wrong, budget)).toThrow();
    const dup = glb(); const text = new TextDecoder().decode(dup); // Same-length duplicate decoded property.
    const source = text.indexOf('"scene":0'); dup.set(new TextEncoder().encode('"asset":0'), source);
    expect(() => validationGlbParts(dup, budget)).toThrow();
  });
  it('checks every PNG chunk, refuses CRC/truncation/decoder errors and closes failed-size decodes', async () => {
    await expect(inspectValidationPng(png, budget, decode)).resolves.toEqual({ width: 64, height: 48 });
    const bad = png.slice(); bad[45] = bad[45]! ^ 1;
    await expect(inspectValidationPng(bad, budget, decode)).rejects.toThrow('壊れ');
    await expect(inspectValidationPng(png.slice(0, -12), budget, decode)).rejects.toThrow();
    await expect(inspectValidationPng(png, { ...budget, maxPixels: 1 }, decode)).rejects.toThrow();
    await expect(inspectValidationPng(png, budget, async () => { throw Error('decode'); })).rejects.toThrow('表示できません');
    const close = vi.fn(); await expect(inspectValidationPng(png, budget, async () => ({ width: 1, height: 1, close }))).rejects.toThrow(); expect(close).toHaveBeenCalledOnce();
    await expect(inspectValidationGlb(glb(j => { j.images[0].uri = 'missing.png'; }, true), budget, decode)).rejects.toThrow();
    await expect(inspectValidationGlb(glb(j => { delete j.meshes[0].primitives[0].attributes.TEXCOORD_0; }, true), budget, decode)).rejects.toThrow('UV');
  });
  it('creates from saved GLB/PNG, edits an actual-model pin, reopens original history and refuses corrupted saved bytes', async () => {
    expect(typeof A.init).toBe('function');
    const fs = new TestFS(), locks = lockManager(), store = new OriginBlobStore(fs,
      { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const run = newId(), root = `validation-test/${run}`, coordinator = ProjectMutationCoordinator.local();
    const lease = await coordinator.tryAcquire(fs, root, run); lease.activateNewProject();
    const storage = storageFactory(), prepared = await prepareValidationProject({ run, title: '実形式の検証', models: [{ label: '異なる形状', bytes: glb() }], media: [{ label: '検証画像', bytes: png }] }, budget, decode);
    const creation = prepareValidationCreation(prepared), host = validationProjectService(lease.workspace, storage, store, budget, decode);
    const initial = await creation.persist(lease.workspace, store, host.session);
    expect(initial.state).toBe('ready'); expect(initial.source!.originalChanges()).toEqual(creation.source.originalChanges());
    expect(initial.provider?.kind).toBe('scene-provider');
    const sceneId = (prepared.records.project as JsonObject).defaultSceneId as string;
    const asset = Object.values(prepared.records.assetsById as Record<string, JsonObject>)[0]!, revision = Object.values(prepared.records.assetRevisionsById as Record<string, any>)[0]!;
    const captionId = `cap_${newId()}`, anchor: Anchor & { hitEvidence: { method: 'manual' } } = { kind: 'asset', assetId: asset.id as string, assetFrameId: asset.assetFrameId as string,
      authoredAssetRevisionId: revision.id, authoredAnchorCompatibilityId: revision.anchorCompatibilityClasses[0].id, positionAsset: [0, 0.5, 0], hitEvidence: { method: 'manual' } };
    const reads = fs.reads;
    const pinned = await host.session.edit(initial.source!.token, { kind: 'addPin', sceneId, captionId, membershipId: `scm_${newId()}`, eventId: `evt_${newId()}`, anchor });
    const edited = await host.session.editCaption(pinned.source!.token, captionId, 'title', '現地で記録');
    expect(edited.state).toBe('ready'); expect(fs.reads).toBe(reads);
    lease.release();
    const otherLease = await coordinator.tryAcquire(fs, root, run); otherLease.activateAfterDurableReload();
    const cold = validationProjectService(otherLease.workspace, storage, new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks), budget, decode);
    const reopened = await cold.session.read(); expect(reopened.state).toBe('ready'); expect(reopened.source!.originalChanges()).toEqual(edited.source!.originalChanges()); expect(fs.reads).toBe(reads);
    const rep = Object.values(prepared.records.representationsById as Record<string, JsonObject>)[0]!;
    expect((await cold.content.model(rep)).bounds).toEqual({ min: [2, 0, 0], max: [4, 2, 0] });
    const versions = await validationModelVersions(reopened.provider!), model = versions[0]!.closure;
    expect(model.shape).toBe('saved-glb'); if (model.shape !== 'saved-glb') throw Error('expected saved model');
    expect(model.representation).toEqual(rep); expect(() => fixtureModelIds(model)).toThrow('未接続');
    const projected = metadataProjectView(reopened.provider!, {}, versions), display = syntheticDisplay(projected, sceneId, null, captionId);
    expect(display.materials).toEqual({}); expect(display.models).toHaveLength(1); expect(display.pins[0]!.position).toEqual([0, 0.5, 0]);
    const residents = await prepareValidationResidents(versions, cold.content), surface = residents.create(model);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.set(3, 0.5, 5); camera.lookAt(3, 0.5, 0);
    const family = versions[0]!.families[0]!;
    const point = pickResidentSurface(display, { token: display.token, sceneId, assetId: model.binding.assetId, assetFrameId: model.assetFrame.id,
      bindingId: model.binding.id, revisionId: model.revision.id, representationId: model.representation.id, familyId: family.id, compatibilityId: family.compatibilityId },
      new Map([[model.binding.assetId, surface]]), camera, new THREE.Vector2(0, 0));
    expect(point?.[0]).toBeCloseTo(3); expect(point?.[1]).toBeCloseTo(0.5); expect(point?.[2]).toBeCloseTo(0);
    const bodyReads = fs.reads; surface.dispose!(); residents.create(model).dispose!(); expect(fs.reads).toBe(bodyReads);
    residents.dispose(); expect(() => residents.create(model)).toThrow('再確認');
    const media = Object.values(prepared.records.mediaResourcesById as Record<string, JsonObject>)[0]!; expect(await cold.content.image(media)).toEqual(png);
    const ref = prepared.blobs[0]!.ref, receipt = JSON.parse((await fs.readText(`v2/cas/sha256/${ref.digest.slice(0, 2)}/${ref.digest.slice(2)}.json`))!);
    const body = prepared.blobs[0]!.bytes.slice(); body[body.length - 1] = body[body.length - 1]! ^ 1; await fs.writeBytes(`v2/cas/objects/${receipt.objectId}.bin`, body);
    await expect(cold.content.model(rep)).rejects.toThrow(); expect((await cold.session.read()).state).toBe('repair-required'); otherLease.release();
  });
  it('keeps multi-node PNG/PBR/unlit/alpha source semantics and closes decoded bitmaps (injected raster, actual GLTF loader)', async () => {
    const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { const bitmap = { width: 64, height: 48, close: vi.fn() }; bitmaps.push(bitmap); return bitmap; }));
    try {
      const bytes = glb(j => {
        j.nodes.push({ mesh: 0, translation: [-3, 0, 0] }); j.scenes[0].nodes.push(1);
        j.extensionsUsed = ['KHR_materials_unlit'];
        j.materials.push({ ...j.materials[0], alphaMode: 'MASK', alphaCutoff: 0.4, doubleSided: true, extensions: { KHR_materials_unlit: {} } });
        j.meshes[0].primitives.push({ ...j.meshes[0].primitives[0], material: 1 });
      }, true);
      const inspected = await inspectValidationGlb(bytes, budget, decode), result = await decodeValidationModel(inspected);
      const meshes: THREE.Mesh[] = []; result.root.traverse(n => { if (n instanceof THREE.Mesh) meshes.push(n); });
      expect(meshes).toHaveLength(4);
      const materials = meshes.map(n => n.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial);
      expect(materials.every(m => !!m.map && m.map.image.width === 64)).toBe(true);
      expect(materials.filter(m => m instanceof THREE.MeshStandardMaterial).every(m => m.roughness === 0.7 && m.color.r === 0.2)).toBe(true);
      expect(materials.filter(m => m instanceof THREE.MeshBasicMaterial).every(m => m.alphaTest === 0.4 && m.side === THREE.DoubleSide)).toBe(true);
      expect(bitmaps.length).toBeGreaterThan(0); result.dispose(); result.dispose();
      for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
      vi.stubGlobal('createImageBitmap', async () => { throw Error('injected decoder failure'); });
      await expect(decodeValidationModel(inspected)).rejects.toThrow('テクスチャ');
      await expect(decodeValidationModel({ ...await inspectValidationGlb(glb(), budget, decode), surfaceRanges: [] })).rejects.toThrow('一致');
    } finally { vi.unstubAllGlobals(); }
  });
  it.each(['map1', 'map2'] as const)('retains %s initialization originals across interrupted publication; cold retry never reseeds or duplicates', async profile => {
    const fs = new TestFS(), store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, lockManager());
    const storage = storageFactory(), prepared = await prepareValidationProject({ run: newId(), title: '中断から再開', models: [{ label: '3Dモデル', bytes: glb() }] }, budget, decode);
    const creation = profile === 'map1' ? prepareValidationCreation(prepared) : prepareValidationCreation(prepared, profile), host = validationProjectService(fs, storage, store, budget, decode);
    fs.reject = path => path.endsWith('/published.json');
    await expect(creation.persist(fs, store, host.session)).rejects.toThrow(); expect((await host.session.read()).state).toBe('pending');
    fs.reject = () => false;
    const cold = validationProjectService(fs, storage, store, budget, decode);
    const ready = await resumeValidationCreation(fs, cold.session); expect(ready.state).toBe('ready');
    expect(ready.source!.originalChanges()).toEqual(creation.source.originalChanges());
    expect(ready.source!.semanticProfile).toBe(profile);
    const before = await fs.list(''); expect((await resumeValidationCreation(fs, cold.session)).publication).toBe(ready.publication); expect(await fs.list('')).toEqual(before);
    expect((await readProjectScene(ready.source!.read(), metadata, cold.content.verifier(false))).kind).toBe('scene-provider');
    await expect(creation.persist(fs, store, cold.session)).rejects.toThrow('空ではありません');
    expect(await digest(prepared.blobs[0]!.bytes)).toBe(prepared.blobs[0]!.ref.digest);
  });
  it('completes only missing unprepared initialization bytes; rejects wrong source, torn or acknowledged missing parts', async () => {
    for (const phase of ['unprepared', 'torn', 'prepared'] as const) {
      const fs = new TestFS(), store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, lockManager());
      const storage = storageFactory(), prepared = await prepareValidationProject({ run: newId(), title: '早期中断', models: [{ label: '3Dモデル', bytes: glb() }] }, budget, decode);
      const creation = prepareValidationCreation(prepared), host = validationProjectService(fs, storage, store, budget, decode);
      fs.reject = path => phase === 'prepared' ? path.endsWith('/published.json') : path.endsWith('/changes/00000001.amchange');
      await expect(creation.persist(fs, store, host.session)).rejects.toThrow(); fs.reject = () => false;
      const before = await fs.list(''), initialParts = before.filter(p => p.includes('/changes/'));
      const cold = validationProjectService(fs, storage, store, budget, decode);
      if (phase === 'unprepared') {
        const other = prepareValidationCreation(await prepareValidationProject({ run: newId(), title: '別Project', models: [{ label: '3Dモデル', bytes: glb() }] }, budget, decode));
        await expect(cold.session.recoverInitialization(other.source)).rejects.toThrow('initial-recovery-source');
        expect(await fs.list('')).toEqual(before);
        const ready = await resumeValidationCreation(fs, cold.session); expect(ready.state).toBe('ready');
        expect(ready.source!.originalChanges()).toEqual(creation.source.originalChanges());
        expect((await fs.list('')).filter(p => p.endsWith('/staging.json'))).toHaveLength(1);
      } else {
        if (phase === 'prepared') await fs.remove(initialParts[0]!); else await fs.writeBytes(initialParts[0]!, new Uint8Array([0]));
        await expect(resumeValidationCreation(fs, cold.session)).rejects.toThrow();
        // The old in-memory writer must not repair acknowledged loss either.
        if (phase === 'prepared') await expect(host.session.retry()).rejects.toThrow();
        expect(await fs.readBytes(initialParts[0]!)).toEqual(phase === 'prepared' ? null : new Uint8Array([0]));
        expect((await cold.session.read()).state).not.toBe('ready');
      }
    }
  });
});
