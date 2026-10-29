import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPortableHeic, browserHeicRasterEncoder, inspectPortableHeic } from '../src/projectFiles/portableHeic';
import { prepareProjectMedia } from '../src/projectFiles/media';
import { capabilityFields, capabilityUnion, checkRequiredCapabilities, readRequiredCapabilities, EDITOR_CAPABILITY as E, PORTABLE_MEDIA_CAPABILITY as P } from '../src/projectMetadata/requiredCapabilities';
import { portablePng, fixturePngDecoder } from './helpers/portableHeicFixtures';
const raw = new Uint8Array(readFileSync(new URL('./fixtures/daily-media/owned-still.heic', import.meta.url)));
const limits = { maxFileBytes: 1_000_000, maxJsonBytes: 100_000, maxItems: 10_000, maxValues: 100_000, maxPixels: 10_000 };
const raster = portablePng(), encode = async () => new Blob([raster.slice().buffer], { type: 'image/png' });
const bitmap = () => ({ width: 96, height: 64, close: vi.fn() });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('portable HEIC operation ownership and finite reader requirements', () => {
  it('retains full pixels and original input, normalizes incapable-browser guidance', async () => {
    const image = bitmap(), before = raw.slice();
    const result = await createPortableHeic(raw, limits, async () => image, fixturePngDecoder, encode);
    expect(result).toEqual({ bytes: raster, width: 96, height: 64 }); expect(raw).toEqual(before); expect(image.close).toHaveBeenCalledOnce();
    await expect(prepareProjectMedia(raw, limits, fixturePngDecoder, undefined, undefined, { heic: async () => { throw new DOMException('Cannot decode', 'InvalidStateError'); } })).rejects.toThrow('HEIC');
  });
  it.each(['decode', 'encode', 'png'] as const)('retires held %s on timeout and closes late resources', async stage => {
    vi.useFakeTimers(); let finish!: (value: any) => void; const held = new Promise<any>(resolve => { finish = resolve; }), image = bitmap(), decoded = bitmap();
    const pending = createPortableHeic(raw, limits, async () => stage === 'decode' ? held : image,
      stage === 'png' ? async () => held : fixturePngDecoder, stage === 'encode' ? async () => held : encode);
    const rejected = expect(pending).rejects.toThrow(); await vi.advanceTimersByTimeAsync(20_000); await rejected;
    finish(stage === 'decode' ? image : stage === 'encode' ? await encode() : decoded); await vi.advanceTimersByTimeAsync(0);
    expect(image.close).toHaveBeenCalledOnce(); if (stage === 'png') expect(decoded.close).toHaveBeenCalledOnce();
  });
  it('aborts asynchronous canvas export, clearing its pixels and ignoring late callbacks', async () => {
    let callback!: BlobCallback; const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob: (done: BlobCallback) => { callback = done; } };
    vi.stubGlobal('document', { createElement: () => canvas }); const controller = new AbortController();
    const pending = browserHeicRasterEncoder(bitmap(), controller.signal), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected; expect([canvas.width, canvas.height]).toEqual([0, 0]); callback(await encode());
  });
  it.each(['null', 'throw'] as const)('cleans a canvas when export returns %s', async kind => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (done: BlobCallback) => { if (kind === 'throw') throw Error('Canvas export failed'); done(null); } };
    vi.stubGlobal('document', { createElement: () => canvas }); await expect(browserHeicRasterEncoder(bitmap(), new AbortController().signal)).rejects.toThrow(); expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
  it.each(['mime', 'bytes', 'dimensions', 'size'] as const)('rejects invalid raster %s without returning a prepared image', async kind => {
    const image = bitmap(), bytes = kind === 'bytes' ? new Uint8Array([1,2,3]) : kind === 'dimensions' ? portablePng(64,48) : kind === 'size' ? new Uint8Array(1_000_001) : raster;
    await expect(createPortableHeic(raw, limits, async () => image, fixturePngDecoder, async () => new Blob([bytes.slice().buffer], { type: kind === 'mime' ? 'image/jpeg' : 'image/png' }))).rejects.toThrow(); expect(image.close).toHaveBeenCalledOnce();
  });
  it('checks structure and independently decoded PNG without requesting a native HEIC decode', async () => {
    const display = { kind: 'native-heic-raster-v1' as const, blob: { mediaType: 'image/png' }, width: 96, height: 64 };
    expect(await inspectPortableHeic(raw, raster, display, limits, fixturePngDecoder)).toEqual({ sourceCheck: 'structure', displayCheck: 'decoded', width: 96, height: 64 });
    await expect(inspectPortableHeic(raw, raster, { ...display, width: 64 }, limits, fixturePngDecoder)).rejects.toThrow();
  });
  it('accepts only canonical nonempty known requirement sets and checks exact source agreement', () => {
    for (const values of [[], [E], [P], [E,P]] as const) {
      const fields = capabilityFields(values); expect(readRequiredCapabilities(fields.requiredCapabilities)).toEqual(values); checkRequiredCapabilities(fields.requiredCapabilities, values);
    }
    expect(capabilityUnion([P], [E], [P])).toEqual([E,P]);
    for (const invalid of [[], [E,E], [P,E], ['unknown'], [E,P,'unknown'], 'portable-heic-display-v1']) expect(() => readRequiredCapabilities(invalid)).toThrow();
    for (const [actual, required] of [[undefined,[P]], [[P],[]], [[E],[E,P]]] as const) expect(() => checkRequiredCapabilities(actual, required)).toThrow();
  });
});
