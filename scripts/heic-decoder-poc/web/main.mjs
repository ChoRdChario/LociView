import {
  HEIC_POC_BUDGETS,
  HeicDecoderClient,
  HeicPocDecodeError,
} from './heic-decoder-client.mjs';

const fileInput = document.querySelector('#source');
const decodeButton = document.querySelector('#decode');
const cancelButton = document.querySelector('#cancel');
const repeatButton = document.querySelector('#repeat');
const staleButton = document.querySelector('#stale');
const truncatedButton = document.querySelector('#truncated');
const corruptButton = document.querySelector('#corrupt');
const timeoutButton = document.querySelector('#timeout');
const oversizedButton = document.querySelector('#oversized');
const clearButton = document.querySelector('#clear');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const canvas = document.querySelector('#preview');
const context = canvas.getContext('2d');
const decoder = new HeicDecoderClient();

function selectedFile() {
  return fileInput.files?.[0] ?? null;
}

function readFileBytes(file) {
  if (file.size === 0 || file.size > HEIC_POC_BUDGETS.maxInputBytes) {
    return Promise.reject(
      new HeicPocDecodeError({ status: 8, message: 'input byte length exceeds the PoC budget' }),
    );
  }
  return file.arrayBuffer();
}

function setBusy(busy) {
  for (const button of [
    decodeButton,
    repeatButton,
    staleButton,
    truncatedButton,
    corruptButton,
    timeoutButton,
    oversizedButton,
  ]) {
    button.disabled = busy || !selectedFile();
  }
  cancelButton.disabled = !busy;
}

function releaseDisplay() {
  canvas.width = 1;
  canvas.height = 1;
}

async function fingerprintRgba(rgba) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgba));
  return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
}

function safeResult(decoded, file) {
  return {
    status: decoded.status,
    message: decoded.message,
    inputBytes: file.size,
    declaredMediaType: file.type || '(empty)',
    canonicalMediaType: decoded.mimeCode === 1 ? 'image/heic' : 'image/heif',
    declaredDimensions: [decoded.declaredWidth, decoded.declaredHeight],
    outputDimensions: [decoded.width, decoded.height],
    outputRgbaBytes: decoded.rgbaBytes,
    sourceStride: decoded.sourceStride,
    primaryItemType: `0x${decoded.primaryItemType.toString(16).padStart(8, '0')}`,
    topLevelCount: decoded.topLevelCount,
    trackCount: decoded.trackCount,
    warningCount: decoded.warningCount,
    grid: (decoded.flags & 1) !== 0,
    alpha: (decoded.flags & 2) !== 0,
  };
}

function showDecoded(decoded, file) {
  const rgba = new Uint8ClampedArray(decoded.rgba);
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  context.putImageData(new ImageData(rgba, decoded.width, decoded.height), 0, 0);
  result.textContent = JSON.stringify(safeResult(decoded, file), null, 2);
  status.textContent = 'PASS: decoded and released';
}

function showFailure(error, expected = false) {
  releaseDisplay();
  const detail = error instanceof HeicPocDecodeError ? error.result : { message: error.message };
  result.textContent = JSON.stringify(detail, null, 2);
  status.textContent = `${expected ? 'PASS: explicit rejection' : 'FAIL'} — ${detail.message}`;
}

async function decodeBytes(bytes, file) {
  releaseDisplay();
  setBusy(true);
  status.textContent = 'Decoding in isolated Worker…';
  try {
    const decoded = await decoder.decode(bytes);
    showDecoded(decoded, file);
    return decoded;
  } finally {
    setBusy(false);
  }
}

async function decodeSelected() {
  const file = selectedFile();
  if (!file) return;
  try {
    await decodeBytes(await readFileBytes(file), file);
  } catch (error) {
    if (error?.name !== 'AbortError') showFailure(error);
  }
}

function firstBoxLength(bytes) {
  if (bytes.byteLength < 12) return 0;
  const view = new DataView(bytes);
  const length = view.getUint32(0, false);
  if (length < 12 || length > bytes.byteLength) return 0;
  return length;
}

fileInput.addEventListener('change', () => {
  decoder.cancel('selection changed');
  releaseDisplay();
  result.textContent = '';
  status.textContent = selectedFile() ? 'Ready. Source remains local.' : 'Choose a HEIC/HEIF file.';
  setBusy(false);
});

decodeButton.addEventListener('click', decodeSelected);

cancelButton.addEventListener('click', () => {
  if (decoder.cancel()) {
    status.textContent = 'PASS: Worker terminated by cancel';
    setBusy(false);
  }
});

repeatButton.addEventListener('click', async () => {
  const file = selectedFile();
  if (!file) return;
  try {
    let expectedFingerprint = null;
    for (let index = 0; index < 3; index += 1) {
      const decoded = await decodeBytes(await readFileBytes(file), file);
      const fingerprint = await fingerprintRgba(decoded.rgba);
      expectedFingerprint ??= fingerprint;
      if (fingerprint !== expectedFingerprint) throw new Error('decoder output changed between runs');
      releaseDisplay();
    }
    const decoded = await decodeBytes(await readFileBytes(file), file);
    if ((await fingerprintRgba(decoded.rgba)) !== expectedFingerprint) {
      throw new Error('decoder output changed after final reopen');
    }
    status.textContent = 'PASS: deterministic output across three close/reopen cycles';
  } catch (error) {
    showFailure(error);
  }
});

staleButton.addEventListener('click', async () => {
  const file = selectedFile();
  if (!file) return;
  releaseDisplay();
  setBusy(true);
  try {
    const first = decoder.decode(await readFileBytes(file)).then(
      () => 'unexpected-success',
      (error) => error.name,
    );
    const second = decoder.decode(await readFileBytes(file));
    const firstOutcome = await first;
    const decoded = await second;
    if (firstOutcome !== 'AbortError') throw new Error(`first request was not cancelled: ${firstOutcome}`);
    showDecoded(decoded, file);
    status.textContent = 'PASS: stale request cancelled; newest request displayed';
  } catch (error) {
    showFailure(error);
  } finally {
    setBusy(false);
  }
});

truncatedButton.addEventListener('click', async () => {
  const file = selectedFile();
  if (!file) return;
  const bytes = await readFileBytes(file);
  const ftypLength = firstBoxLength(bytes);
  if (ftypLength === 0 || ftypLength === bytes.byteLength) {
    showFailure(new Error('Could not construct an ftyp-only truncation probe.'));
    return;
  }
  try {
    await decodeBytes(bytes.slice(0, ftypLength), file);
    showFailure(new Error('truncated input was accepted'));
  } catch (error) {
    showFailure(error, true);
  }
});

corruptButton.addEventListener('click', async () => {
  const file = selectedFile();
  if (!file) return;
  const bytes = new Uint8Array(await readFileBytes(file));
  if (bytes.byteLength >= 8) bytes.set([0x62, 0x61, 0x64, 0x21], 4);
  try {
    await decodeBytes(bytes.buffer, file);
    showFailure(new Error('corrupt input was accepted'));
  } catch (error) {
    showFailure(error, true);
  }
});

timeoutButton.addEventListener('click', async () => {
  const file = selectedFile();
  if (!file) return;
  releaseDisplay();
  setBusy(true);
  try {
    await decoder.decode(await readFileBytes(file), { timeoutMs: 0 });
    showFailure(new Error('timeout probe completed instead of timing out'));
  } catch (error) {
    const detail = error instanceof HeicPocDecodeError ? error.result : null;
    if (detail?.status !== -2) {
      showFailure(error);
      return;
    }
    result.textContent = JSON.stringify(detail, null, 2);
    status.textContent = 'PASS: timeout terminated Worker';
  } finally {
    setBusy(false);
  }
});

oversizedButton.addEventListener('click', async () => {
  releaseDisplay();
  try {
    await decoder.decode(new ArrayBuffer(HEIC_POC_BUDGETS.maxInputBytes + 1));
    showFailure(new Error('oversized input was accepted'));
  } catch (error) {
    const detail = error instanceof HeicPocDecodeError ? error.result : null;
    if (detail?.status !== 8) {
      showFailure(error);
      return;
    }
    result.textContent = JSON.stringify(detail, null, 2);
    status.textContent = 'PASS: oversized input rejected before Worker';
  }
});

clearButton.addEventListener('click', () => {
  decoder.close();
  fileInput.value = '';
  releaseDisplay();
  result.textContent = '';
  status.textContent = 'Cleared. Worker and display resources released.';
  setBusy(false);
});

window.addEventListener('pagehide', () => decoder.close());
setBusy(false);
