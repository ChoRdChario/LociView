import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  inspectNativeGsPlyV1,
  inspectNativePointPlyV1,
  NativeGsPlyError,
  type RestartableByteSource,
} from '../../src/nativeGs/plyProfile';
import { detectFormat } from '../../src/viewer/loaders';
import { makeGsPlySource } from './nativeTestProject';

function withSize(source: RestartableByteSource, size: number): RestartableByteSource {
  return { size, stream: () => source.stream() };
}

async function expectCode(source: RestartableByteSource, code: NativeGsPlyError['code']): Promise<void> {
  await expect(inspectNativeGsPlyV1(source)).rejects.toMatchObject({ code });
}

describe('native Graphdeco PLY structural profile', () => {
  it.each([2, 3] as const)('derives SH%s count, stride and exact payload from the header', async (degree) => {
    const fixture = makeGsPlySource(degree, 3);
    await expect(inspectNativeGsPlyV1(fixture.source)).resolves.toEqual({ kind: 'supported-gs', facts: fixture.facts });
  });

  it('admits a representative-scale count without reading or allocating its payload', async () => {
    const fixture = makeGsPlySource(2, 1);
    const header = fixture.bytes.slice(0, fixture.facts.headerByteLength);
    const count = 4_766_975;
    const headerText = new TextDecoder().decode(header).replace('element vertex 1', `element vertex ${count}`);
    const headerBytes = new TextEncoder().encode(headerText);
    let cancelled = false;
    const source: RestartableByteSource = {
      size: headerBytes.byteLength + count * 164,
      stream: () => new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(headerBytes);
        },
        cancel() {
          cancelled = true;
        },
      }),
    };
    const result = await inspectNativeGsPlyV1(source);
    expect(result).toMatchObject({ kind: 'supported-gs', facts: { shDegree: 2, splatCount: count, recordStrideBytes: 164 } });
    expect(cancelled).toBe(true);
  });

  it('rejects truncation and trailing bytes from header arithmetic', async () => {
    const fixture = makeGsPlySource(3, 2);
    await expectCode(withSize(fixture.source, fixture.source.size - 1), 'PLY_PAYLOAD_TRUNCATED');
    await expectCode(withSize(fixture.source, fixture.source.size + 1), 'PLY_TRAILING_BYTES');
  });

  it('does not route a marker-free ordinary PLY as GS', async () => {
    const bytes = new TextEncoder().encode([
      'ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'property float y', 'property float z', 'end_header', '0 0 0', '',
    ].join('\n'));
    const blob = new Blob([bytes]);
    await expect(inspectNativeGsPlyV1({ size: blob.size, stream: () => blob.stream() })).resolves.toEqual({ kind: 'ordinary-ply' });
  });

  it('fails closed for partial GS and big-endian profiles', async () => {
    const fixture = makeGsPlySource(2, 1);
    const text = new TextDecoder().decode(fixture.bytes.slice(0, fixture.facts.headerByteLength));
    const partialHeader = new TextEncoder().encode(text.replace('property float f_rest_23\n', ''));
    const partialBlob = new Blob([partialHeader, new Uint8Array(fixture.facts.payloadByteLength)]);
    await expectCode({ size: partialBlob.size, stream: () => partialBlob.stream() }, 'PLY_GS_PROFILE_UNSUPPORTED');

    const bigHeader = new TextEncoder().encode(text.replace('binary_little_endian', 'binary_big_endian'));
    const bigBlob = new Blob([bigHeader, new Uint8Array(fixture.facts.payloadByteLength)]);
    await expectCode({ size: bigBlob.size, stream: () => bigBlob.stream() }, 'PLY_GS_PROFILE_UNSUPPORTED');
  });
});

describe('native ordinary-point PLY profile', () => {
  it('stream-validates the existing 20k XYZ+RGB sample without treating it as Mesh or GS', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../../public/samples/points.ply', import.meta.url)));
    expect(detectFormat('renamed-as-mesh.obj', bytes.subarray(0, 64 * 1024))).toBe('ply');
    const blob = new Blob([bytes]);
    await expect(inspectNativePointPlyV1({ size: blob.size, stream: () => blob.stream() })).resolves.toEqual({
      kind: 'supported-point',
      facts: { pointCount: 20_000, headerByteLength: 164, encoding: 'ascii' },
    });
  });

  it('rejects a vertex-only near-miss and invalid payload before publication', async () => {
    const nearMiss = new Blob([[
      'ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'property float y', 'property float z',
      'end_header', '0 0 0', '',
    ].join('\n')]);
    await expect(inspectNativePointPlyV1({ size: nearMiss.size, stream: () => nearMiss.stream() }))
      .rejects.toMatchObject({ code: 'PLY_POINT_PROFILE_UNSUPPORTED' });

    const invalidRgb = new Blob([[
      'ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'property float y', 'property float z',
      'property uchar red', 'property uchar green', 'property uchar blue', 'end_header', '0 0 0 256 0 0', '',
    ].join('\n')]);
    await expect(inspectNativePointPlyV1({ size: invalidRgb.size, stream: () => invalidRgb.stream() }))
      .rejects.toMatchObject({ code: 'PLY_POINT_PAYLOAD_INVALID' });
  });

  it('rejects non-ASCII and non-decimal XYZ tokens', async () => {
    const make = (row: string): Blob => new Blob([[
      'ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'property float y', 'property float z',
      'property uchar red', 'property uchar green', 'property uchar blue', 'end_header', row, '',
    ].join('\n')]);
    for (const invalid of [make('0x10 0 0 1 2 3'), make('0\u00a00 0 1 2 3')]) {
      await expect(inspectNativePointPlyV1({ size: invalid.size, stream: () => invalid.stream() }))
        .rejects.toMatchObject({ code: 'PLY_POINT_PAYLOAD_INVALID' });
    }
  });

  it('rejects an unterminated oversized row before retaining the whole payload', async () => {
    const header = new TextEncoder().encode([
      'ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'property float y', 'property float z',
      'property uchar red', 'property uchar green', 'property uchar blue', 'end_header', '',
    ].join('\n'));
    const payloadChunk = new TextEncoder().encode('1'.repeat(64));
    let payloadPulls = 0;
    const source: RestartableByteSource = {
      size: header.byteLength + 4096,
      stream: () => {
        let headerSent = false;
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!headerSent) {
              headerSent = true;
              controller.enqueue(header);
              return;
            }
            payloadPulls += 1;
            if (payloadPulls > 64) controller.close();
            else controller.enqueue(payloadChunk);
          },
        });
      },
    };
    await expect(inspectNativePointPlyV1(source)).rejects.toMatchObject({ code: 'PLY_POINT_PAYLOAD_INVALID' });
    expect(payloadPulls).toBeLessThan(64);
  });

  it('keeps a face-bearing ordinary PLY on the existing Mesh path and rejects GS as Point', async () => {
    const mesh = new Blob([[
      'ply', 'format ascii 1.0', 'element vertex 3', 'property float x', 'property float y', 'property float z',
      'property float opacity',
      'element face 1', 'property list uchar int vertex_indices',
      'element edge 0', 'property int vertex1', 'end_header',
      '0 0 0 1', '1 0 0 1', '0 1 0 1', '3 0 1 2', '',
    ].join('\n')]);
    await expect(inspectNativeGsPlyV1({ size: mesh.size, stream: () => mesh.stream() })).resolves.toEqual({ kind: 'ordinary-ply' });
    await expect(inspectNativePointPlyV1({ size: mesh.size, stream: () => mesh.stream() })).resolves.toEqual({ kind: 'mesh-ply' });

    const gs = makeGsPlySource(2, 1);
    await expect(inspectNativePointPlyV1(gs.source)).rejects.toMatchObject({ code: 'PLY_POINT_PROFILE_UNSUPPORTED' });
  });
});
