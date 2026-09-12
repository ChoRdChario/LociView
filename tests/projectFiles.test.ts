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
import { fixtureMedia } from '../src/harness/projectScene/mediaHistory';
import { readProjectScene } from '../src/scene/projectProvider';
import type { JsonObject } from '../src/domain/values';
import type { Anchor } from '../src/scene/types';

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

describe('limited real-format validation (synthetic GLB bytes, injected PNG decoder, memory storage)', () => {
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
    const media = Object.values(prepared.records.mediaResourcesById as Record<string, JsonObject>)[0]!; expect(await cold.content.image(media)).toEqual(png);
    const ref = prepared.blobs[0]!.ref, receipt = JSON.parse((await fs.readText(`v2/cas/sha256/${ref.digest.slice(0, 2)}/${ref.digest.slice(2)}.json`))!);
    const body = prepared.blobs[0]!.bytes.slice(); body[body.length - 1] = body[body.length - 1]! ^ 1; await fs.writeBytes(`v2/cas/objects/${receipt.objectId}.bin`, body);
    await expect(cold.content.model(rep)).rejects.toThrow(); expect((await cold.session.read()).state).toBe('repair-required'); otherLease.release();
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
