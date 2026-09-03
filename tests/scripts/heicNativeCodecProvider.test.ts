import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error Checked ESM spike modules intentionally have no declaration files.
import { HEIC_UNSUPPORTED_MESSAGE, createPublicHeicProviderRegistry, presentHeicWithoutLocalFallback } from '../../scripts/heic-native-codec-spike/provider-boundary.mjs';
// @ts-expect-error Checked ESM spike modules intentionally have no declaration files.
import { probeWebCodecsSupport } from '../../scripts/heic-native-codec-spike/web/probe-webcodecs.mjs';

describe('isolated HEIC provider responsibility spike', () => {
  it('rejects the local libde265 PoC from a public registry', () => {
    expect(() => createPublicHeicProviderRegistry([{
      id: 'libde265-local-poc',
      isSupported: async () => true,
      decode: async () => ({}),
    }])).toThrow(/not allowed/);
  });

  it('preserves the original bytes when no public provider is available', async () => {
    const sourceBytes = new Uint8Array([1, 2, 3]);
    const result = await presentHeicWithoutLocalFallback({
      sourceBytes,
      providers: [{
        id: 'webcodecs-hevc',
        isSupported: async () => false,
        decode: async () => ({}),
      }],
    });
    expect(result.status).toBe('unsupported');
    expect(result.sourceBytes).toBe(sourceBytes);
    expect(result.message).toBe(HEIC_UNSUPPORTED_MESSAGE);
  });

  it('does not cascade after the selected public provider fails decode', async () => {
    const secondDecode = vi.fn();
    const sourceBytes = new Uint8Array([4, 5, 6]);
    const result = await presentHeicWithoutLocalFallback({
      sourceBytes,
      providers: [
        {
          id: 'safari-native',
          isSupported: async () => true,
          decode: async () => { throw new Error('native decode failed'); },
        },
        {
          id: 'webcodecs-hevc',
          isSupported: async () => true,
          decode: secondDecode,
        },
      ],
    });
    expect(result).toMatchObject({ status: 'decode-failed', providerId: 'safari-native' });
    expect(result.sourceBytes).toBe(sourceBytes);
    expect(secondDecode).not.toHaveBeenCalled();
  });

  it('isolates source authority from provider mutation and transfer', async () => {
    const sourceBytes = new Uint8Array([7, 8, 9]);
    const result = await presentHeicWithoutLocalFallback({
      sourceBytes,
      providers: [{
        id: 'webcodecs-hevc',
        isSupported: async () => true,
        decode: async (presentationInput: Uint8Array) => {
          presentationInput[0] = 99;
          structuredClone(presentationInput, { transfer: [presentationInput.buffer] });
          return { transferred: true };
        },
      }],
    });
    expect(result.status).toBe('presented');
    expect(result.sourceBytes).toBe(sourceBytes);
    expect([...sourceBytes]).toEqual([7, 8, 9]);
  });

  it('fails closed with preserved source when a capability probe throws', async () => {
    const decode = vi.fn();
    const sourceBytes = new Uint8Array([10, 11]);
    const result = await presentHeicWithoutLocalFallback({
      sourceBytes,
      providers: [{
        id: 'safari-native',
        isSupported: async () => { throw new Error('capability query failed'); },
        decode,
      }],
    });
    expect(result).toMatchObject({
      status: 'capability-failed',
      providerId: 'safari-native',
      message: 'capability query failed',
    });
    expect(result.sourceBytes).toBe(sourceBytes);
    expect([...sourceBytes]).toEqual([10, 11]);
    expect(decode).not.toHaveBeenCalled();
  });

  it('records HEVC support separately from the H.264 control', async () => {
    class MockVideoDecoder {
      static async isConfigSupported(config: { codec: string }) {
        return { supported: config.codec.startsWith('avc1.') };
      }
    }
    const result = await probeWebCodecsSupport({ VideoDecoderClass: MockVideoDecoder });
    const hevc = result.configurations.filter((entry: { id: string }) => entry.id.startsWith('hevc-'));
    const h264 = result.configurations.filter((entry: { id: string }) => entry.id === 'h264-control');
    expect(hevc).toHaveLength(6);
    expect(hevc.every((entry: { supported: boolean }) => !entry.supported)).toBe(true);
    expect(h264).toHaveLength(3);
    expect(h264.every((entry: { supported: boolean }) => entry.supported)).toBe(true);
  });
});
