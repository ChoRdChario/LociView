import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  HEIC_DEVICE_CONVERSION_GUIDANCE,
  inspectNativeImageSource,
} from '../../src/nativeGs/imageMediaAdmission';

function source(bytes: Uint8Array, mediaType = '') {
  const blob = new Blob([Uint8Array.from(bytes)], { type: mediaType });
  return { size: blob.size, mediaType: blob.type, stream: () => blob.stream() };
}

function decoded(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

const JPEG_BYTES = decoded(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==',
);
const PNG_BYTES = decoded('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
const GIF_BYTES = decoded('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
const WEBP_BYTES = decoded('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA');
const HEIC_BYTES = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
  0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
]);
const EMPTY_PAYLOAD_IMAGES = [
  ['JPEG', new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0,
    0xff, 0xd9,
  ]), 'image/jpeg', 'empty.jpg'],
  ['PNG', new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]), 'image/png', 'empty.png'],
  ['GIF', new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0,
    0, 0, 0, 0xff, 0xff, 0xff,
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0,
    2, 0, 0x3b,
  ]), 'image/gif', 'empty.gif'],
  ['WebP', new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]), 'image/webp', 'empty.webp'],
] as const;

describe('Native candidate image byte admission', () => {
  it('canonicalizes a device-exported JPEG whose browser MIME declaration is empty', async () => {
    await expect(inspectNativeImageSource(source(JPEG_BYTES), { filenameHint: 'converted.jpg' })).resolves.toMatchObject({
      mediaType: 'image/jpeg',
      byteLength: JPEG_BYTES.byteLength,
      width: 1,
      height: 1,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });

  it.each([
    ['PNG', PNG_BYTES, 'image/png', 'photo.png'],
    ['GIF', GIF_BYTES, 'image/gif', 'photo.gif'],
    ['WebP', WEBP_BYTES, 'image/webp', 'photo.webp'],
  ])('admits a decodable 1x1 %s container', async (_label, bytes, mediaType, filenameHint) => {
    await expect(inspectNativeImageSource(source(bytes, mediaType), { filenameHint })).resolves.toMatchObject({
      mediaType,
      width: 1,
      height: 1,
    });
  });

  it.each([
    ['honest declaration', 'photo.heic', 'image/heic'],
    ['disguised as JPEG', 'photo.jpg', 'image/jpeg'],
    ['extension-only corrupt candidate', 'photo.heif', 'application/octet-stream'],
  ])('requires device conversion for %s', async (_case, label, mediaType) => {
    const bytes = label.endsWith('.heif') ? new Uint8Array([1, 2, 3, 4]) : HEIC_BYTES;
    const failure = await inspectNativeImageSource(source(bytes, mediaType), { filenameHint: label })
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'heic-device-conversion-required' });
    expect((failure as Error).message).toBe(HEIC_DEVICE_CONVERSION_GUIDANCE);
  });

  it('rejects a truncated JPEG and a declaration/content conflict', async () => {
    await expect(inspectNativeImageSource(
      source(JPEG_BYTES.slice(0, -2), 'image/jpeg'),
      { filenameHint: 'truncated.jpg' },
    )).rejects.toMatchObject({ code: 'image-content-invalid' });
    await expect(inspectNativeImageSource(
      source(JPEG_BYTES, 'image/png'),
      { filenameHint: 'photo.png' },
    )).rejects.toMatchObject({ code: 'image-declaration-conflict' });
  });

  it('does not accept a marker-only JPEG or signature/IEND-only PNG', async () => {
    await expect(inspectNativeImageSource(
      source(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9]), 'image/jpeg'),
      { filenameHint: 'fake.jpg' },
    )).rejects.toMatchObject({ code: 'image-content-invalid' });
    const fakePng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    await expect(inspectNativeImageSource(
      source(fakePng, 'image/png'),
      { filenameHint: 'fake.png' },
    )).rejects.toMatchObject({ code: 'image-content-invalid' });
  });

  it.each(EMPTY_PAYLOAD_IMAGES)(
    'rejects a structurally framed %s container with no image payload',
    async (_label, bytes, mediaType, filenameHint) => {
      await expect(inspectNativeImageSource(
        source(bytes, mediaType),
        { filenameHint },
      )).rejects.toMatchObject({ code: 'image-content-invalid' });
    },
  );

  it('requires a canonical MIME declaration for persisted package sources', async () => {
    await expect(inspectNativeImageSource(
      source(JPEG_BYTES),
      { requireCanonicalDeclaration: true },
    )).rejects.toMatchObject({ code: 'image-declaration-conflict' });
  });

  it('does not interpret a persisted display label as a filename authority', async () => {
    await expect(inspectNativeImageSource(
      source(JPEG_BYTES, 'image/jpeg'),
      { requireCanonicalDeclaration: true },
    )).resolves.toMatchObject({ mediaType: 'image/jpeg' });
  });

  it('does not misclassify a raw .hevc filename as a HEIC still image', async () => {
    await expect(inspectNativeImageSource(
      source(new Uint8Array([1, 2, 3, 4]), 'application/octet-stream'),
      { filenameHint: 'clip.hevc' },
    )).rejects.toMatchObject({ code: 'unsupported-image-content' });
  });
});
