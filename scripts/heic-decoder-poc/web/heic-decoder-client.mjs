export const HEIC_POC_BUDGETS = Object.freeze({
  maxInputBytes: 32 * 1024 * 1024,
  maxDimension: 16_384,
  maxPixels: 50_000_000,
  maxOutputBytes: 200 * 1024 * 1024,
  maxTotalMemory: 384 * 1024 * 1024,
  maxItems: 1_024,
  maxTiles: 256,
  timeoutMs: 20_000,
});

export class HeicPocDecodeError extends Error {
  constructor(result) {
    super(result.message || 'HEIC decode failed');
    this.name = 'HeicPocDecodeError';
    this.result = result;
  }
}

function abortError(reason) {
  return new DOMException(reason, 'AbortError');
}

function boundedBudgets(overrides) {
  const budgets = {};
  for (const [name, ceiling] of Object.entries(HEIC_POC_BUDGETS)) {
    const requested = overrides[name];
    if (requested === undefined) {
      budgets[name] = ceiling;
      continue;
    }
    if (!Number.isSafeInteger(requested) || requested < 0) {
      throw new TypeError(`${name} must be a non-negative safe integer`);
    }
    budgets[name] = Math.min(ceiling, requested);
  }
  return Object.freeze(budgets);
}

export class HeicDecoderClient {
  #active = null;
  #sequence = 0;

  decode(input, overrides = {}) {
    if (!(input instanceof ArrayBuffer)) {
      return Promise.reject(new TypeError('decode input must be an ArrayBuffer'));
    }

    let budgets;
    try {
      budgets = boundedBudgets(overrides);
    } catch (error) {
      return Promise.reject(error);
    }
    if (input.byteLength === 0 || input.byteLength > budgets.maxInputBytes) {
      return Promise.reject(
        new HeicPocDecodeError({ status: 8, message: 'input byte length exceeds the PoC budget' }),
      );
    }

    this.cancel('superseded by a newer decode request');
    const requestId = `${Date.now().toString(36)}-${(++this.#sequence).toString(36)}`;
    const worker = new Worker(new URL('./heic-decoder.worker.mjs', import.meta.url), {
      type: 'module',
      name: 'lociview-heic-decoder-poc',
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.#active?.requestId !== requestId) return;
        worker.terminate();
        this.#active = null;
        reject(new HeicPocDecodeError({ status: -2, message: 'decode timed out' }));
      }, budgets.timeoutMs);

      this.#active = { requestId, worker, timeout, reject };
      worker.onmessage = (event) => {
        if (this.#active?.requestId !== requestId || event.data?.requestId !== requestId) return;
        clearTimeout(timeout);
        worker.terminate();
        this.#active = null;
        if (event.data.ok) resolve(event.data);
        else reject(new HeicPocDecodeError(event.data));
      };
      worker.onerror = (event) => {
        if (this.#active?.requestId !== requestId) return;
        clearTimeout(timeout);
        worker.terminate();
        this.#active = null;
        reject(new HeicPocDecodeError({ status: -1, message: event.message || 'Worker failed' }));
      };
      worker.postMessage({ requestId, input, budgets }, [input]);
    });
  }

  cancel(reason = 'decode cancelled') {
    const active = this.#active;
    if (!active) return false;
    clearTimeout(active.timeout);
    active.worker.terminate();
    this.#active = null;
    active.reject(abortError(reason));
    return true;
  }

  close() {
    this.cancel('decoder closed');
  }
}
