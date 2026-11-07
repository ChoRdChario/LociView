import {expect} from 'vitest';
import {serializeGlb} from '../../src/assets/glbOptimize';
import {MemoryFS} from '../../src/platform/fs';
import type {MetadataStorageFactory} from '../../src/projectMetadata/repository';
import {fixtureMedia} from '../../src/harness/projectScene/mediaHistory';
import {WorkingAcknowledgment} from '../../src/harness/projectScene/acknowledgment';

const png = Uint8Array.from(atob(fixtureMedia[0]!.base64), c => c.charCodeAt(0));
export function glb(mutate: (json: any, bin: Uint8Array) => void = () => {}, textured = false, imageBytes = png) {
  const bin = new Uint8Array(36 + (textured ? 24 + imageBytes.length : 0));
  new Float32Array(bin.buffer, 0, 9).set([-1, 0, 0, 1, 0, 0, 0, 2, 0]);
  const json: any = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [3, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.8, 1], roughnessFactor: 0.7 } }] };
  if (textured) {
    new Float32Array(bin.buffer, 36, 6).set([0, 0, 1, 0, 0.5, 1]); bin.set(imageBytes, 60);
    json.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: imageBytes.length });
    json.accessors.push({ bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' });
    json.meshes[0].primitives[0].attributes.TEXCOORD_0 = 1;
    json.images = [{ bufferView: 2, mimeType: 'image/png' }]; json.textures = [{ source: 0 }];
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  }
  mutate(json, bin); return serializeGlb(json, bin);
}
export function lockManager() {
  const held = new Set<string>();
  return { async request(name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<unknown>) {
    if (held.has(name)) return callback(null); held.add(name);
    try { return await callback({ name, mode: 'exclusive' }); } finally { held.delete(name); }
  } } as unknown as LockManager;
}
export function storageFactory() {
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
export class TestFS extends MemoryFS {
  reject = (_: string) => false; reads = 0;
  override async writeText(path: string, text: string) { if (this.reject(path)) throw Error('injected quota'); return super.writeText(path, text); }
  override async writeBytes(path: string, bytes: Uint8Array) { if (this.reject(path)) throw Error('injected quota'); return super.writeBytes(path, bytes); }
  override async writeStream(path: string, stream: ReadableStream<Uint8Array>) {
    if (this.reject(path)) { await stream.cancel(); throw Error('injected quota'); } return super.writeStream(path, stream);
  }
  override async readStream(path: string) { const file = await super.readStream(path); if (!file || !path.startsWith('v2/cas/objects/')) return file;
    return { size: file.size, stream: () => { this.reads++; return file.stream(); } }; }
}

// Wait for the operation owner's confirmation/render, not a storage-publication
// snapshot or vi.waitFor's incidental 1s polling deadline.
export async function acknowledge(ack: WorkingAcknowledgment | readonly WorkingAcknowledgment[], action: () => void,
  expected: 'idle' | 'failed' = 'idle', requireChecking = true) {
  const owners = ack instanceof WorkingAcknowledgment ? [ack] : ack;
  const unsubscribes: (() => void)[] = [];
  try {
    await new Promise<void>(resolve => {
      const settled = () => { if (owners.every(owner => owner.state !== 'checking')) resolve(); };
      for (const owner of owners) unsubscribes.push(owner.subscribe(settled));
      action();
      if (requireChecking) expect(owners.some(owner => owner.state === 'checking')).toBe(true);
      settled();
    });
  } finally { for (const unsubscribe of unsubscribes) unsubscribe(); }
  for (const owner of owners) expect(owner.state).toBe(expected);
}
