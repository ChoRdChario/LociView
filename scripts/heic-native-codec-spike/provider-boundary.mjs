export const HEIC_UNSUPPORTED_MESSAGE =
  'HEIC source preserved, but no supported decoder is available on this device.';

export const PUBLIC_HEIC_PROVIDER_IDS = Object.freeze([
  'safari-native',
  'webcodecs-hevc',
]);

const PUBLIC_PROVIDER_SET = new Set(PUBLIC_HEIC_PROVIDER_IDS);

export function createPublicHeicProviderRegistry(providers) {
  const seen = new Set();
  const registry = [];
  for (const provider of providers) {
    if (!provider || !PUBLIC_PROVIDER_SET.has(provider.id)) {
      throw new Error(`HEIC provider is not allowed in the public registry: ${provider?.id ?? '(missing id)'}`);
    }
    if (seen.has(provider.id)) {
      throw new Error(`duplicate HEIC provider: ${provider.id}`);
    }
    if (typeof provider.isSupported !== 'function' || typeof provider.decode !== 'function') {
      throw new Error(`HEIC provider ${provider.id} does not implement the spike contract`);
    }
    seen.add(provider.id);
    registry.push(provider);
  }
  return Object.freeze(registry);
}

export async function presentHeicWithoutLocalFallback({ sourceBytes, providers, context = {} }) {
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0) {
    throw new TypeError('sourceBytes must be a non-empty Uint8Array');
  }

  const registry = createPublicHeicProviderRegistry(providers);
  let selected = null;
  for (const provider of registry) {
    try {
      if (await provider.isSupported(context)) {
        selected = provider;
        break;
      }
    } catch (error) {
      return Object.freeze({
        status: 'capability-failed',
        sourceBytes,
        providerId: provider.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!selected) {
    return Object.freeze({
      status: 'unsupported',
      sourceBytes,
      providerId: null,
      message: HEIC_UNSUPPORTED_MESSAGE,
    });
  }

  try {
    // A provider may transfer or mutate its input. It receives a disposable
    // presentation copy, never the caller's source-byte authority.
    const presentationInput = sourceBytes.slice();
    const presentation = await selected.decode(presentationInput, context);
    return Object.freeze({
      status: 'presented',
      sourceBytes,
      providerId: selected.id,
      presentation,
    });
  } catch (error) {
    return Object.freeze({
      status: 'decode-failed',
      sourceBytes,
      providerId: selected.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
