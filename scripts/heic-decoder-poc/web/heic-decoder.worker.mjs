import createLociViewHeicDecoder from './heic-decoder.mjs';

const RESULT_BYTES = 80;

function readResult(module, pointer) {
  if (!Number.isInteger(pointer) || pointer <= 0 || pointer + RESULT_BYTES > module.HEAPU8.length) {
    throw new Error('decoder returned an invalid result pointer');
  }

  const view = new DataView(module.HEAPU8.buffer, pointer, RESULT_BYTES);
  const u32 = (offset) => view.getUint32(offset, true);
  const i32 = (offset) => view.getInt32(offset, true);
  const messagePointer = u32(72);
  const messageBytes = u32(76);
  if (messagePointer + messageBytes > module.HEAPU8.length) {
    throw new Error('decoder returned an invalid message range');
  }

  return {
    abiVersion: u32(0),
    status: i32(4),
    heifErrorCode: i32(8),
    heifSuberrorCode: i32(12),
    mimeCode: u32(16),
    flags: u32(20),
    declaredWidth: u32(24),
    declaredHeight: u32(28),
    width: u32(32),
    height: u32(36),
    rgbaPointer: u32(40),
    sourceStride: u32(44),
    rowBytes: u32(48),
    rgbaBytes: u32(52),
    primaryItemType: u32(56),
    topLevelCount: u32(60),
    trackCount: u32(64),
    warningCount: u32(68),
    message: new TextDecoder().decode(
      module.HEAPU8.slice(messagePointer, messagePointer + messageBytes),
    ),
  };
}

function safeShutdown(module) {
  if (!module) return;
  try {
    module._lv_heic_shutdown();
  } catch {
    // Worker termination remains the final resource boundary.
  }
}

self.onmessage = async (event) => {
  const { requestId, input, budgets } = event.data ?? {};
  if (typeof requestId !== 'string' || !(input instanceof ArrayBuffer) || !budgets) {
    self.postMessage({ requestId, ok: false, status: -1, message: 'invalid worker request' });
    self.close();
    return;
  }

  let module;
  try {
    module = await createLociViewHeicDecoder({
      locateFile: (path) => new URL(path, import.meta.url).href,
      print: () => {},
      printErr: () => {},
    });
    const initStatus = module._lv_heic_init();
    if (initStatus !== 0) throw new Error(`decoder initialization failed (${initStatus})`);

    const inputPointer = module._lv_heic_alloc_input(input.byteLength, budgets.maxInputBytes);
    if (inputPointer === 0 || inputPointer + input.byteLength > module.HEAPU8.length) {
      throw new Error('input is empty, over budget, or could not be allocated');
    }
    module.HEAPU8.set(new Uint8Array(input), inputPointer);

    const resultPointer = module._lv_heic_decode(
      budgets.maxDimension,
      budgets.maxPixels,
      budgets.maxOutputBytes,
      budgets.maxTotalMemory,
      budgets.maxItems,
      budgets.maxTiles,
    );
    const result = readResult(module, resultPointer);
    if (result.abiVersion !== 1) throw new Error(`unsupported result ABI ${result.abiVersion}`);

    if (result.status !== 0) {
      module._lv_heic_release();
      module._lv_heic_shutdown();
      self.postMessage({ requestId, ok: false, ...result, rgbaPointer: undefined });
      self.close();
      return;
    }

    const expectedBytes = result.width * result.height * 4;
    if (
      result.width === 0 ||
      result.height === 0 ||
      !Number.isSafeInteger(expectedBytes) ||
      expectedBytes !== result.rgbaBytes ||
      result.rowBytes !== result.width * 4 ||
      result.rgbaPointer + result.rgbaBytes > module.HEAPU8.length
    ) {
      throw new Error('decoder returned an inconsistent RGBA range');
    }

    // Refresh HEAPU8 after decode because Wasm memory may have grown.
    const rgba = module.HEAPU8.slice(
      result.rgbaPointer,
      result.rgbaPointer + result.rgbaBytes,
    );
    module._lv_heic_release();
    module._lv_heic_shutdown();
    self.postMessage(
      {
        requestId,
        ok: true,
        ...result,
        rgbaPointer: undefined,
        rgba: rgba.buffer,
      },
      [rgba.buffer],
    );
    self.close();
  } catch (error) {
    safeShutdown(module);
    self.postMessage({
      requestId,
      ok: false,
      status: -1,
      message: error instanceof Error ? error.message : 'unknown decoder failure',
    });
    self.close();
  }
};
