import { describe, expect, it } from 'vitest';
import { inspectNativeGsPlyV1, NativeGsPlyError, type RestartableByteSource } from '../../src/nativeGs/plyProfile';
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
