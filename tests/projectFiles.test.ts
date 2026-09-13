import { describe, expect, it, vi } from 'vitest';
import * as A from '@automerge/automerge';
import { serializeGlb } from '../src/assets/glbOptimize';
import { MemoryFS, type ProjectWorkspaceFS } from '../src/platform/fs';
import { ProjectMutationCoordinator } from '../src/platform/projectLock';
import { OriginBlobStore } from '../src/projectMetadata/blobStore';
import type { MetadataStorageFactory } from '../src/projectMetadata/repository';
import { MetadataRepository } from '../src/projectMetadata/repository';
import { digest, newId, json, underWriteLease } from '../src/projectMetadata/persistence';
import { validationMetadataLimits as metadata, type FileValidationLimits } from '../src/projectFiles/validation';
import { inspectValidationGlb, validationGlbParts } from '../src/projectFiles/glb';
import { inspectValidationPng } from '../src/projectFiles/png';
import { prepareValidationProject } from '../src/projectFiles/initialProject';
import { prepareValidationCreation, resumeValidationCreation, validationProjectService } from '../src/projectFiles/creation';
import { fixtureMedia, captionAttachments } from '../src/harness/projectScene/mediaHistory';
import { SyntheticSession } from '../src/harness/projectScene/session';
import { readProjectScene } from '../src/scene/projectProvider';
import type { JsonObject } from '../src/domain/values';
import type { Anchor } from '../src/scene/types';
import * as THREE from 'three';
import { validationModelVersions } from '../src/harness/projectScene/validationProjection';
import { metadataProjectView } from '../src/harness/projectScene/metadataFixture';
import { syntheticDisplay, pointInProject } from '../src/harness/projectScene/viewportModel';
import { degreesRotation } from '../src/harness/projectScene/modelTransform';
import { prepareValidationResidents, decodeValidationModel } from '../src/harness/projectScene/validationRender';
import { pickResidentSurface } from '../src/harness/projectScene/viewportPicking';
import { fixtureModelIds } from '../src/harness/projectScene/modelClosure';
import { openValidationHost, validationArea } from '../src/harness/projectScene/validationHost';
import { createValidationModeHost } from '../src/harness/projectScene/validationModeHost';
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
import { planMetadataEdit } from '../src/projectMetadata/commands';
import { prepareValidationModel, sealValidationRecord } from '../src/projectFiles/initialProject';
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
  const options = { base: fs, coordinator, store, fileLimits: budget, decode, run,
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
  async function receivedHostFixture() {
    const f = await workspaceFileFixture(), run = (f.initial.source!.proof.identity.projectId as string).slice(4);
    // Same actual Project history, moved into the host's existing isolated namespace by this fixture only.
    for (const path of await f.fs.list('v2/')) if (!path.startsWith('v2/cas/'))
      await f.fs.writeBytes(`${validationArea}/${run}/${path}`, (await f.fs.readBytes(path))!);
    const options = { run, base: f.fs, coordinator: ProjectMutationCoordinator.browser(f.locks), store: f.store,
      fileLimits: budget, decode, packageLocks: f.locks, openStorage: async () => ({ factory: f.factory, dispose: async () => {} }) };
    return { ...f, options, host: await openValidationHost(options) };
  }
  async function initialWorkspaceHostFixture() {
    const f = await workspaceFileFixture(), r = firstWorkspaceRecipient(), run = (f.source.proof.identity.projectId as string).slice(4);
    const options = { run, base: r.fs, coordinator: ProjectMutationCoordinator.browser(r.locks), store: r.store,
      fileLimits: budget, decode, packageLocks: r.locks, openStorage: async () => ({ factory: r.factory, dispose: async () => {} }) };
    return { ...r, f, run, options };
  }
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
  it('offers clean preflight and opens the independent copy through the existing selector (recorded DOM)', async () => {
    const { f, options } = await initialWorkspaceHostFixture(), original = await openValidationHost({ ...options, workspaceFile: f.file });
    const mode = createValidationModeHost(original, next => openValidationHost({ ...options, mode: next }), () => {});
    const tools = createValidationReceiveControls(new RecordedDocument().asDocument(), mode, () => undefined, () => {}, async () => {});
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)], root = record(tools.root);
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const kind = all(root).find(n => n.attributes.get('aria-label') === '渡す内容')!; kind.value = 'clean'; kind.fire('change');
    expect(button('ファイルを作成')).toBeUndefined(); button('内容を確認').fire('click');
    await vi.waitFor(() => expect(button('ファイルを作成')?.disabled).toBe(false));
    expect(all(root).some(n => n.textContent.includes('シーン 1・モデル 2・キャプション 1・メディア 1'))).toBe(true);
    expect(all(root).some(n => n.textContent.includes('匿名化はしません'))).toBe(true);
    button('ファイルを作成').fire('click'); await vi.waitFor(() => {
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
    expect(button('ファイルを作成').disabled).toBe(true);
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
    expect(button('ファイルを作成').disabled).toBe(true);
    Object.assign(receiveInput, { files: [] }); receiveInput.fire('change');
    s.setSearchComposing(true); button('ファイルを作成').fire('click');
    expect(host.workspaceOutput.jobs).toHaveLength(0);
    expect(all(root).some(n => n.textContent.includes('入力・操作を確定'))).toBe(true);
    s.setSearchComposing(false); button('ファイルを作成').fire('click');
    await vi.waitFor(() => expect(host.workspaceOutput.jobs[0]?.state).toBe('generated'), { timeout: 10000 });
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(click).not.toHaveBeenCalled(); expect(host.read().source!.token).toBe(token);
    expect(workspace.session).toBe(s); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows);
    expect(all(root).some(n => n.textContent.includes('ファイルへの保存は未確認'))).toBe(true);
    button('ダウンロード').fire('click'); await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(host.workspaceOutput.jobs[0]!.state).toBe('generated');
    button('ファイルを選択').fire('click'); expect(tools.hasChanges()).toBe(true);
    const selected = all(root).find(n => n.attributes.get('aria-label') === '保存先のファイルを選択')!;
    const id = host.workspaceOutput.jobs[0]!.id, file = await host.workspaceOutput.download(id);
    Object.assign(selected, { files: [file] }); selected.fire('change');
    await vi.waitFor(() => expect(host.workspaceOutput.jobs[0]!.state).toBe('file-verified'), { timeout: 10000 });
    await vi.waitFor(() => expect(tools.hasChanges()).toBe(false));
    expect(host.read().source!.token).toBe(token);
    await host.mode!.change('view', token, () => {}); tools.render(); expect(button('ファイルを作成').disabled).toBe(true);
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
    let workspace: ReturnType<typeof createSavedWorkspace>, tools: ReturnType<typeof createValidationReceiveControls>;
    tools = createValidationReceiveControls(document, host, () => workspace?.session, () => workspace?.render(), async () => {});
    workspace = createSavedWorkspace(document, host, undefined, () => tools);
    const root = record(workspace.root), all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const button = (text: string) => all(root).find(n => n.tag === 'button' && n.textContent === text)!;
    const input = (name: string) => all(root).find(n => n.attributes.get('aria-label') === name)!;
    expect(host.workspaceOutput.bases).toHaveLength(2);
    const selectedBase = host.workspaceOutput.bases[0]!.selection;
    input('渡す内容').value = 'contribution'; input('渡す内容').fire('change');
    expect(tools.hasChanges()).toBe(true); expect(button('ファイルを作成').disabled).toBe(true);
    expect(input('元にする作業一式').value).toBe('');
    button('閲覧に切り替える').fire('click'); expect(host.mode!.current).toBe('edit');
    const form = all(root).find(n => n.tag === 'form')!;
    expect((form as unknown as HTMLElement).inert).toBe(true);
    input('元にする作業一式').value = selectedBase.workspacePackageId; input('元にする作業一式').fire('change');
    expect(button('ファイルを作成').disabled).toBe(false);
    button('ダウンロード').fire('click'); await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(tools.hasChanges()).toBe(true); expect(input('元にする作業一式').value).toBe(selectedBase.workspacePackageId);
    const s = workspace.session!, memory = s.memory, windows = s.windowMemory, before = host.read().source!.token;
    s.setSearchComposing(true); button('ファイルを作成').fire('click');
    expect(host.workspaceOutput.jobs.filter(j => j.purpose === 'contribution')).toHaveLength(0);
    s.setSearchComposing(false); button('ファイルを作成').fire('click');
    await vi.waitFor(() => expect(host.workspaceOutput.jobs.some(j => j.purpose === 'contribution' && j.state === 'generated')).toBe(true), { timeout: 10000 });
    await vi.waitFor(() => expect(tools.hasChanges()).toBe(false));
    const result = host.workspaceOutput.jobs.find(j => j.purpose === 'contribution')!;
    const archive = await PackageArchive.inspect(await host.workspaceOutput.download(result.id));
    expect(archive.control.manifest).toMatchObject({ purpose: 'contribution', base: selectedBase });
    expect(host.workspaceOutput.bases).toHaveLength(2); expect(host.read().source!.token).toBe(before);
    expect(workspace.session).toBe(s); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows);
    const unavailable = vi.spyOn(WorkspaceSender.prototype, 'availableBases').mockRejectedValueOnce(Error('基準データを確認できません。'));
    await host.refresh(); tools.render();
    const outputStatus = () => all(root).find(n => n.attributes.get('aria-label') === 'ファイルで渡す')!.children.find(n => n.attributes.get('role') === 'status')!;
    expect(outputStatus().textContent).toBe('基準データを確認できません。'); expect(host.workspaceOutput.bases).toEqual([]);
    await host.refresh(); tools.render();
    expect(outputStatus().textContent).not.toBe('基準データを確認できません。'); expect(host.workspaceOutput.bases).toHaveLength(2); unavailable.mockRestore();
    input('渡す内容').value = 'contribution'; input('渡す内容').fire('change');
    const output = all(root).find(n => n.attributes.get('aria-label') === 'ファイルで渡す')!;
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
    const output = input('ファイルで渡す'), button = (text: string) => all(output).find(n => n.tag === 'button' && n.textContent === text)!;
    input('渡す内容').value = 'backup'; input('渡す内容').fire('change');
    const name = input('名前（任意）'); name.fire('compositionstart'); name.value = '調査前'; name.fire('input');
    expect(button('ファイルを作成').disabled).toBe(true); button('ファイルを作成').fire('click');
    expect(host.workspaceOutput.jobs.some(j => j.purpose === 'backup')).toBe(false);
    workspace.render(); expect(input('名前（任意）')).toBe(name); expect(name.value).toBe('調査前');
    name.fire('compositionend'); expect(tools.hasChanges()).toBe(true);
    expect((all(root).find(n => n.tag === 'form') as unknown as HTMLElement).inert).toBe(true);
    all(root).find(n => n.tag === 'button' && n.textContent === '閲覧に切り替える')!.fire('click'); expect(host.mode!.current).toBe('edit');
    name.value = 'x'.repeat(257); name.fire('input'); button('ファイルを作成').fire('click');
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(name.value).toBe('x'.repeat(257)); expect(tools.hasChanges()).toBe(true);
    expect(host.workspaceOutput.jobs.some(j => j.purpose === 'backup')).toBe(false);
    name.value = '調査前'; name.fire('input');
    button('ファイルを選択').fire('click'); expect(button('ファイルを作成').disabled).toBe(true);
    const selected = input('保存先のファイルを選択'); Object.assign(selected, { files: [new Blob(['wrong'])] }); selected.fire('change');
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    button('ダウンロード').fire('click'); await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(tools.busy()).toBe(false));
    expect(button('ファイル確認を取り消す')).toBeDefined(); expect(name.value).toBe('調査前'); expect(input('渡す内容').value).toBe('backup');
    button('ファイル確認を取り消す').fire('click'); expect(tools.hasChanges()).toBe(true);
    const session = workspace.session!, before = host.read().source!.token;
    button('ファイルを作成').fire('click');
    await vi.waitFor(() => expect(host.workspaceOutput.jobs.some(j => j.purpose === 'backup' && j.state === 'generated')).toBe(true), { timeout: 10000 });
    await vi.waitFor(() => expect(tools.hasChanges()).toBe(false));
    const result = host.workspaceOutput.jobs.find(j => j.purpose === 'backup')!;
    expect(result.label).toBe('調査前'); expect(result.state).toBe('generated');
    expect(output.children.find(n => n.attributes.get('role') === 'status')!.textContent).toBe('バックアップを生成しました。ファイルへの保存は未確認です。');
    expect(all(output).some(n => n.textContent.includes('バックアップ 調査前'))).toBe(true);
    const archive = await BackupArchive.inspect(await host.workspaceOutput.download(result.id), metadata);
    expect(archive.archive.control.manifest.purpose).toBe('backup'); expect(host.read().source!.token).toBe(before); expect(workspace.session).toBe(session);
    all(root).find(n => n.tag === 'button' && n.textContent === '閲覧に切り替える')!.fire('click');
    await vi.waitFor(() => expect(host.mode!.busy).toBe(false), { timeout: 10000 });
    expect(host.mode!.current, all(root).filter(n => n.attributes.get('role') === 'status').map(n => n.textContent).join('\n')).toBe('view');
    expect(input('渡す内容').disabled).toBe(true); expect(name.disabled).toBe(true); expect(button('ファイルを作成').disabled).toBe(true);
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
    const viewport: ViewportFactory = () => ({ update(d) { display = d; }, setActive() {},
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
  it('retains initialization originals across interrupted publication; cold retry never reseeds or duplicates', async () => {
    const fs = new TestFS(), store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, lockManager());
    const storage = storageFactory(), prepared = await prepareValidationProject({ run: newId(), title: '中断から再開', models: [{ label: '3Dモデル', bytes: glb() }] }, budget, decode);
    const creation = prepareValidationCreation(prepared), host = validationProjectService(fs, storage, store, budget, decode);
    fs.reject = path => path.endsWith('/published.json');
    await expect(creation.persist(fs, store, host.session)).rejects.toThrow(); expect((await host.session.read()).state).toBe('pending');
    fs.reject = () => false;
    const cold = validationProjectService(fs, storage, store, budget, decode);
    const ready = await resumeValidationCreation(fs, cold.session); expect(ready.state).toBe('ready');
    expect(ready.source!.originalChanges()).toEqual(creation.source.originalChanges());
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
