export const DEFAULT_CONFIGURATIONS = Object.freeze([
  Object.freeze({
    id: 'hevc-main-level-93',
    config: Object.freeze({ codec: 'hvc1.1.6.L93.B0', codedWidth: 1920, codedHeight: 1080 }),
  }),
  Object.freeze({
    id: 'hevc-upstream-example-normalized',
    config: Object.freeze({ codec: 'hvc1.1.6.L120.90', codedWidth: 451, codedHeight: 461 }),
  }),
  Object.freeze({
    id: 'h264-control',
    config: Object.freeze({ codec: 'avc1.42001E', codedWidth: 640, codedHeight: 480 }),
  }),
]);

const ACCELERATION_PREFERENCES = Object.freeze([
  'no-preference',
  'prefer-hardware',
  'prefer-software',
]);

export async function probeWebCodecsSupport({
  VideoDecoderClass = globalThis.VideoDecoder,
  configurations = DEFAULT_CONFIGURATIONS,
} = {}) {
  const result = {
    videoDecoderPresent: typeof VideoDecoderClass === 'function',
    encodedVideoChunkPresent: typeof globalThis.EncodedVideoChunk === 'function',
    configurations: [],
  };

  if (!result.videoDecoderPresent || typeof VideoDecoderClass.isConfigSupported !== 'function') {
    return result;
  }

  for (const candidate of configurations) {
    for (const hardwareAcceleration of ACCELERATION_PREFERENCES) {
      const config = { ...candidate.config, hardwareAcceleration };
      try {
        const support = await VideoDecoderClass.isConfigSupported(config);
        result.configurations.push({
          id: candidate.id,
          codec: config.codec,
          hardwareAcceleration,
          supported: support.supported === true,
        });
      } catch (error) {
        result.configurations.push({
          id: candidate.id,
          codec: config.codec,
          hardwareAcceleration,
          supported: false,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
      }
    }
  }
  return result;
}
