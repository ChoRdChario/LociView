import { probeWebCodecsSupport } from './probe-webcodecs.mjs';

const runButton = document.querySelector('#run');
const result = document.querySelector('#result');

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  result.textContent = 'Checking local browser capability…';
  try {
    const probe = await probeWebCodecsSupport();
    result.textContent = JSON.stringify({
      spike: 'lociview-heic-native-codec-v1',
      userAgent: navigator.userAgent,
      secureContext: globalThis.isSecureContext,
      ...probe,
    }, null, 2);
  } catch (error) {
    result.textContent = JSON.stringify({
      spike: 'lociview-heic-native-codec-v1',
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }, null, 2);
  } finally {
    runButton.disabled = false;
  }
});
