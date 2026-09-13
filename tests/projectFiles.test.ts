import { describe, expect, it, vi } from 'vitest';
import * as A from '@automerge/automerge';
import { serializeGlb } from '../src/assets/glbOptimize';
import { MemoryFS } from '../src/platform/fs';
import { ProjectMutationCoordinator } from '../src/platform/projectLock';
import { OriginBlobStore } from '../src/projectMetadata/blobStore';
import type { MetadataStorageFactory } from '../src/projectMetadata/repository';
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
import { WorkspaceBaseStore } from '../src/projectPackage/workspaceBases';
import { WorkspaceReceiveJob } from '../src/projectPackage/receiveJob';
import { WorkspaceSourceCapture } from '../src/projectPackage/workspaceSource';
import { WorkspaceArchive, writeWorkspaceArchive } from '../src/projectPackage/workspaceArchive';
import { TransactionJournal } from '../src/projectMetadata/journal';
import { createValidationReceiveControls } from '../src/harness/projectScene/validationReceiveControls';

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
  async function workspaceFileFixture() {
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
    const source = ProjectMetadataSource.fromFullSource(A.save(doc), f.remote.proof, metadata);
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
    const title = all(root).find(n => n.attributes.get('aria-label') === 'プロジェクト名')!, files = all(root).find(n => n.type === 'file')!;
    const form = all(root).find(n => n.tag === 'form')!, submit = () => form.fire('submit', { preventDefault() {} });
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
