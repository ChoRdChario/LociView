import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeImageBitmapWithinMaxEdge,
  disposeModelResources,
  loadModel,
  uploadModelTexturesAndReleaseBitmaps,
} from '../../src/viewer/loaders';
import { fitRasterWithinMaxEdge, pngDimensions } from '../../src/viewer/rasterDimensions';

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function bitmap(width: number, height: number): ImageBitmap & { close: ReturnType<typeof vi.fn> } {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

function texturedGlb(image: Uint8Array): Uint8Array {
  const positions = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const indices = new Uint8Array(new Uint16Array([0, 1, 2]).buffer);
  const imageOffset = positions.byteLength + 8;
  const binLength = Math.ceil((imageOffset + image.byteLength) / 4) * 4;
  const bin = new Uint8Array(binLength);
  bin.set(positions, 0);
  bin.set(indices, positions.byteLength);
  bin.set(image, imageOffset);
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
      { buffer: 0, byteOffset: imageOffset, byteLength: image.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    images: [{ bufferView: 2, mimeType: 'image/png' }],
    samplers: [{ minFilter: 9987, magFilter: 9729 }],
    textures: [{ sampler: 0, source: 0 }],
    materials: [{ name: 'cockpit', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedJsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const total = 12 + 8 + paddedJsonLength + 8 + bin.byteLength;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, paddedJsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + paddedJsonLength);
  glb.set(jsonBytes, 20);
  const binHeader = 20 + paddedJsonLength;
  view.setUint32(binHeader, bin.byteLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  glb.set(bin, binHeader + 8);
  return glb;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bounded runtime texture decode', () => {
  it('fits portrait and landscape rasters without upsampling', () => {
    expect(fitRasterWithinMaxEdge({ width: 8192, height: 4096 }, 4096)).toEqual({ width: 4096, height: 2048 });
    expect(fitRasterWithinMaxEdge({ width: 2048, height: 8192 }, 4096)).toEqual({ width: 1024, height: 4096 });
    expect(fitRasterWithinMaxEdge({ width: 1024, height: 512 }, 4096)).toEqual({ width: 1024, height: 512 });
    expect(() => fitRasterWithinMaxEdge({ width: 1, height: 1 }, 0)).toThrow(/maximum edge/);
  });

  it('reads only a valid PNG IHDR', () => {
    expect(pngDimensions(pngHeader(8192, 4096))).toEqual({ width: 8192, height: 4096 });
    const invalid = pngHeader(8192, 4096);
    invalid[7] = 0;
    expect(pngDimensions(invalid)).toBeNull();
  });

  it('requests an aspect-preserving 4096px decode and leaves compressed bytes unchanged', async () => {
    const source = pngHeader(8192, 4096);
    const before = source.slice();
    const decoded = bitmap(4096, 2048);
    const calls: ImageBitmapOptions[] = [];
    const decode = (async (_blob: Blob, options?: ImageBitmapOptions) => {
      calls.push(options ?? {});
      return decoded;
    }) as typeof createImageBitmap;

    await expect(decodeImageBitmapWithinMaxEdge(new Blob([source.buffer as ArrayBuffer], { type: 'image/png' }), 4096, decode))
      .resolves.toBe(decoded);
    expect(calls).toEqual([expect.objectContaining({
      resizeWidth: 4096,
      resizeHeight: 2048,
      resizeQuality: 'high',
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    })]);
    expect(source).toEqual(before);
  });

  it('rejects instead of silently falling back when the browser ignores the cap', async () => {
    const decoded = bitmap(8192, 4096);
    const decode = (async () => decoded) as unknown as typeof createImageBitmap;
    await expect(decodeImageBitmapWithinMaxEdge(
      new Blob([pngHeader(8192, 4096).buffer as ArrayBuffer], { type: 'image/png' }),
      4096,
      decode,
    )).rejects.toThrow(/exceeded the 4096px runtime limit/);
    expect(decoded.close).toHaveBeenCalledTimes(1);
  });

  it('skips embedded texture pixels during material-only inspection', async () => {
    const decode = vi.fn(() => Promise.reject(new Error('must not decode')));
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', decode);
    const loaded = await loadModel('glb', texturedGlb(pngHeader(8192, 4096)), {
      gltfTextures: { kind: 'skip' },
    });
    try {
      expect(loaded.materials.map((entry) => entry.name)).toContain('cockpit');
      expect(decode).not.toHaveBeenCalled();
    } finally {
      disposeModelResources(loaded.root);
    }
  });

  it('uses the bounded loader for an embedded GLB texture', async () => {
    const decoded = bitmap(4096, 2048);
    const decode = vi.fn(async (_blob: Blob, _options?: ImageBitmapOptions) => decoded);
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', decode);
    const source = texturedGlb(pngHeader(8192, 4096));
    const before = source.slice();
    const loaded = await loadModel('glb', source, { gltfTextures: { kind: 'max-edge', maxEdge: 4096 } });
    try {
      expect(decode).toHaveBeenCalledTimes(1);
      expect(decode.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ resizeWidth: 4096, resizeHeight: 2048 }));
      expect(source).toEqual(before);
    } finally {
      disposeModelResources(loaded.root);
    }
  });

  it('turns a swallowed embedded-texture failure into a GLB activation failure', async () => {
    const decoded = bitmap(8192, 4096);
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => decoded));
    await expect(loadModel(
      'glb',
      texturedGlb(pngHeader(8192, 4096)),
      { gltfTextures: { kind: 'max-edge', maxEdge: 4096 } },
    )).rejects.toThrow(/embedded texture activation failed/);
    expect(decoded.close).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith(expect.stringMatching(/^blob:/));
  });
});

describe('Three.js model resource release', () => {
  it('uploads shared textures before closing their ImageBitmap and closes each resource once', () => {
    const decoded = bitmap(4096, 2048);
    const texture = new THREE.Texture(decoded);
    const textureDispose = vi.spyOn(texture, 'dispose');
    const firstMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const secondMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const firstMaterialDispose = vi.spyOn(firstMaterial, 'dispose');
    const secondMaterialDispose = vi.spyOn(secondMaterial, 'dispose');
    const geometry = new THREE.BufferGeometry();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, firstMaterial), new THREE.Mesh(geometry, secondMaterial));
    const initTexture = vi.fn();

    uploadModelTexturesAndReleaseBitmaps({ initTexture } as unknown as THREE.WebGLRenderer, root);
    disposeModelResources(root);

    expect(initTexture).toHaveBeenCalledTimes(1);
    expect(initTexture).toHaveBeenCalledWith(texture);
    expect(decoded.close).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(firstMaterialDispose).toHaveBeenCalledTimes(1);
    expect(secondMaterialDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it('closes each distinct bitmap immediately after the textures sharing it are uploaded', () => {
    const events: string[] = [];
    const firstBitmap = bitmap(4096, 2048);
    const secondBitmap = bitmap(2048, 4096);
    firstBitmap.close.mockImplementation(() => { events.push('close:first'); });
    secondBitmap.close.mockImplementation(() => { events.push('close:second'); });
    const firstTexture = new THREE.Texture(firstBitmap);
    firstTexture.name = 'first';
    const firstTextureClone = new THREE.Texture(firstBitmap);
    firstTextureClone.name = 'first-clone';
    const secondTexture = new THREE.Texture(secondBitmap);
    secondTexture.name = 'second';
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: firstTexture })),
      new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: firstTextureClone })),
      new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: secondTexture })),
    );
    const initTexture = vi.fn((texture: THREE.Texture) => { events.push(`upload:${texture.name}`); });

    uploadModelTexturesAndReleaseBitmaps({ initTexture } as unknown as THREE.WebGLRenderer, root);
    expect(events).toEqual([
      'upload:first',
      'upload:first-clone',
      'close:first',
      'upload:second',
      'close:second',
    ]);
    disposeModelResources(root);
    expect(firstBitmap.close).toHaveBeenCalledTimes(1);
    expect(secondBitmap.close).toHaveBeenCalledTimes(1);
  });
});
