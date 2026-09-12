import { describe, expect, it, vi } from 'vitest';
import * as A from '@automerge/automerge';
import { serializeGlb } from '../src/assets/glbOptimize';
import { MemoryFS } from '../src/platform/fs';
import { ProjectMutationCoordinator } from '../src/platform/projectLock';
import { OriginBlobStore } from '../src/projectMetadata/blobStore';
import type { MetadataStorageFactory } from '../src/projectMetadata/repository';
import { digest, newId } from '../src/projectMetadata/persistence';
import { validationMetadataLimits as metadata, type FileValidationLimits } from '../src/projectFiles/validation';
import { inspectValidationGlb, validationGlbParts } from '../src/projectFiles/glb';
import { inspectValidationPng } from '../src/projectFiles/png';
import { prepareValidationProject } from '../src/projectFiles/initialProject';
import { prepareValidationCreation, resumeValidationCreation, validationProjectService } from '../src/projectFiles/creation';
import { fixtureMedia, captionAttachments } from '../src/harness/projectScene/mediaHistory';
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
import { listValidationProjects } from '../src/harness/projectScene/validationCatalog';
import { createSavedWorkspace } from '../src/harness/projectScene/metadataWorkspace';
import { planPinMode } from '../src/ui/projectScene/pinModeState';
import { planModelList } from '../src/ui/projectScene/modelListState';
import { RecordedDocument } from './ui/domRecorder';
import { record, type RecordedNode } from './ui/domRecorder';
import { createValidationWorkspace, type ValidationWorkspacePorts } from '../src/harness/projectScene/validationWorkspace';
import { createMediaControls } from '../src/harness/projectScene/mediaControls';
import { createModelAdditionControls } from '../src/harness/projectScene/modelAdditionControls';
import { planMetadataEdit } from '../src/projectMetadata/commands';
import { prepareValidationModel, sealValidationRecord } from '../src/projectFiles/initialProject';
import { validationModelFacts } from '../src/projectFiles/modelFacts';
import { planNavigation } from '../src/ui/projectScene/navigationState';

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

async function openFileCaption() {
  const fs = new TestFS(), locks = lockManager(), run = newId(), factory = storageFactory();
  const coordinator = ProjectMutationCoordinator.browser(locks);
  const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
  const options = { base: fs, coordinator, store, fileLimits: budget, decode, run,
    openStorage: async () => ({ factory, dispose: async () => {} }) };
  const initial = prepareValidationCreation(await prepareValidationProject({ run, title: '追加の検証', models: [{ label: '3Dモデル', bytes: glb() }] }, budget, decode));
  const host = await openValidationHost({ ...options, initial }), workspace = createSavedWorkspace(new RecordedDocument().asDocument(), host);
  const s = workspace.session!, model = s.snapshot.modelVersions![0]!;
  s.setViewportState(true, [model.assetId], null); s.acceptPinCreation(s.pinCreationTargets()[0]!, [3, 0.5, 0]);
  s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }));
  await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
  return { fs, store, options, host, workspace, s, captionId: s.memory.selectedCaptionId! };
}

describe('limited real-format validation (synthetic GLB bytes, injected PNG decoder, memory storage)', () => {
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
    for (let i = 0; i < 2; i++) {
      add.fire('click'); Object.assign(input, { files: [file] }); input.fire('change');
      await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
      expect(s.message).toBe(''); expect(s.snapshot.modelVersions).toHaveLength(i + 2);
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
    expect(cold.authority.read().resources.captions[captionId]).toEqual(originalCaption); await cold.dispose();
  }, 20_000);
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
    expect(s.snapshot.mediaChoices).toHaveLength(1); expect(s.snapshot.mediaChoices![0]!.label).toBe(file.name);
    expect(modelRead).not.toHaveBeenCalled(); expect(file.arrayBuffer).toHaveBeenCalledOnce();
    const parts = host.read().source!.originalChanges(); controls.dispose(); await workspace.dispose();
    const cold = await openValidationHost(options);
    expect(cold.read().source!.originalChanges()).toEqual(parts);
    expect(captionAttachments(cold.authority.read().mediaData, captionId).ready).toEqual(rows);
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
    expect(s.media.cancelFile()).toBe(false); bytes.fill(0);
    s.retryWorking(); await vi.waitFor(() => expect(s.acknowledgment.state).toBe('idle'));
    expect(file.arrayBuffer).toHaveBeenCalledOnce(); expect(put).toHaveBeenCalledTimes(2);
    expect(captionAttachments(s.snapshot.mediaData, captionId).ready).toHaveLength(1);
    const media = s.snapshot.mediaChoices![0]!; expect(media.blob.digest).toBe(await digest(png));
    const published = host.read().publication; await host.authority.retry!(); expect(host.read().publication).toBe(published);
    fs.reject = p => p.endsWith('/published.json');
    s.media.addFile(s.mediaContext(), { name: '二つ目PNG', size: png.length, arrayBuffer: async () => png.slice().buffer });
    await vi.waitFor(() => expect(s.acknowledgment.state).toBe('failed'));
    expect(captionAttachments(s.snapshot.mediaData, captionId).ready).toHaveLength(1);
    const pendingPaths = (await fs.list(`${validationArea}/${options.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(pendingPaths.map(p => fs.readBytes(p)));
    await workspace.dispose(); fs.reject = () => false;
    const cold = await openValidationHost(options); expect(cold.read().state).toBe('pending');
    await cold.authority.retry!();
    expect(captionAttachments(cold.authority.read().mediaData, captionId).ready).toHaveLength(2);
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
      open: vi.fn(async (run, initial) => host = await openValidationHost({ ...options, run, initial, openStorage: create => openStorage(run, create) })) };
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
    await vi.waitFor(() => expect(all(root).some(n => n.textContent === '選択から作成 — 保存済み ')).toBe(true));
    button('開く').fire('click'); await vi.waitFor(() => expect(u.selected).toBe(id));
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
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
    await vi.waitFor(() => expect(all(afterRoot).some(n => n.textContent === '保存を再試行')).toBe(true));
    all(afterRoot).find(n => n.textContent === '保存を再試行')!.fire('click');
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
    const mounted = createSavedWorkspace(new RecordedDocument().asDocument(), host), s = mounted.session!;
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
    const reads = fs.reads;
    await host.authority.write(host.read().source!.token, { [`caption/${captionId}/title`]: '現地の確認' });
    expect(fs.reads).toBe(reads); const parts = host.read().source!.originalChanges(); await mounted.dispose();
    expect(await listValidationProjects(options, async (_id, create) => openStorage(create)))
      .toEqual([{ run, title: '現場の記録', state: 'ready' }]);
    const cold = await openValidationHost({ ...options, run, openStorage });
    expect(cold.authority.read().resources.captions[captionId]!.title).toEqual({ kind: 'value', value: '現地の確認' });
    expect(cold.authority.read().mediaData!.images![image.id]!.base64).toBe(fixtureMedia[0]!.base64);
    expect(cold.read().source!.originalChanges()).toEqual(parts); await cold.dispose();
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
