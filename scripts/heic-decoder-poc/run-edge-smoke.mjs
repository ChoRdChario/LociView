import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const DEFAULT_EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value == null) {
      throw new Error(`expected --name value pairs; received ${name ?? '(end)'}`);
    }
    values.set(name.slice(2), value);
  }
  return values;
}

function parseResult(state) {
  try {
    return JSON.parse(state.result);
  } catch {
    return { message: state.result || '(empty result)' };
  }
}

async function pageState(page) {
  return page.evaluate(() => ({
    status: document.querySelector('#status')?.textContent ?? '',
    result: document.querySelector('#result')?.textContent ?? '',
    width: document.querySelector('#preview')?.width ?? 0,
    height: document.querySelector('#preview')?.height ?? 0,
  }));
}

async function waitForState(page, accept, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  while (Date.now() < deadline) {
    state = await pageState(page);
    if (accept(state)) return state;
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out waiting for ${description}; last value: ${JSON.stringify(state)}`);
}

async function selectFile(page, absolutePath) {
  await page.locator('#source').setInputFiles(absolutePath);
  await waitForState(page, (state) => state.status.startsWith('Ready.'), 'file selection');
}

async function runAction(page, selector, accept, description, timeoutMs = 30_000) {
  const before = await pageState(page);
  await page.locator(selector).click();
  return waitForState(
    page,
    (state) => (state.status !== before.status || state.result !== before.result) && accept(state),
    description,
    timeoutMs,
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ['source', 'playwright-root']) {
    if (!args.has(required)) throw new Error(`--${required} is required`);
  }

  const sourcePath = path.resolve(args.get('source'));
  const unsupportedPath = args.has('unsupported') ? path.resolve(args.get('unsupported')) : null;
  const collectionPath = args.has('collection') ? path.resolve(args.get('collection')) : null;
  const pageUrl = args.get('url') ?? 'http://127.0.0.1:4199/';
  const edgePath = args.get('edge') ?? DEFAULT_EDGE;
  const playwrightEntry = path.join(path.resolve(args.get('playwright-root')), 'index.mjs');
  const { chromium } = await import(pathToFileURL(playwrightEntry).href);
  const artifactRoot = path.resolve('.artifacts', 'heic-decoder-poc');
  const screenshotPath = path.join(artifactRoot, 'edge-poc-result.png');

  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
    args: [
      '--no-first-run',
      '--disable-default-apps',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--metrics-recording-only',
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const networkUrls = [];
  const runtimeExceptions = [];
  page.on('request', (request) => networkUrls.push(request.url()));
  page.on('pageerror', (error) => runtimeExceptions.push(error.message));

  try {
    await page.goto(pageUrl, { waitUntil: 'load' });

    await selectFile(page, sourcePath);
    const decoded = await runAction(
      page,
      '#decode',
      (state) => state.status === 'PASS: decoded and released',
      'normal HEIC decode',
      60_000,
    );
    const decodedResult = parseResult(decoded);

    await context.setOffline(true);
    let offlineAfterWarm;
    try {
      await page.evaluate(() => {
        document.querySelector('#status').textContent = 'Ready for offline replay.';
        document.querySelector('#result').textContent = '';
      });
      offlineAfterWarm = await runAction(
        page,
        '#decode',
        (state) => state.status === 'PASS: decoded and released',
        'cached decoder assets while network is disconnected',
        60_000,
      );
    } finally {
      await context.setOffline(false);
    }

    await page.evaluate(() => {
      const decode = document.querySelector('#decode');
      const cancel = document.querySelector('#cancel');
      const observer = new MutationObserver(() => {
        if (!cancel.disabled) {
          observer.disconnect();
          cancel.click();
        }
      });
      observer.observe(cancel, { attributes: true, attributeFilter: ['disabled'] });
      decode.click();
    });
    const cancelled = await waitForState(
      page,
      (state) => state.status === 'PASS: Worker terminated by cancel',
      'explicit Worker cancellation',
    );

    const repeated = await runAction(
      page,
      '#repeat',
      (state) => state.status === 'PASS: deterministic output across three close/reopen cycles',
      'deterministic output across three close/reopen cycles',
      120_000,
    );
    const stale = await runAction(
      page,
      '#stale',
      (state) => state.status === 'PASS: stale request cancelled; newest request displayed',
      'stale request cancellation',
      60_000,
    );
    const truncated = await runAction(
      page,
      '#truncated',
      (state) => state.status.startsWith('PASS: explicit rejection'),
      'truncated input rejection',
    );
    const corrupt = await runAction(
      page,
      '#corrupt',
      (state) => state.status.startsWith('PASS: explicit rejection'),
      'corrupt input rejection',
    );
    const timeout = await runAction(
      page,
      '#timeout',
      (state) => state.status === 'PASS: timeout terminated Worker',
      'timeout Worker termination',
    );
    const oversized = await runAction(
      page,
      '#oversized',
      (state) => state.status === 'PASS: oversized input rejected before Worker',
      'oversized input rejection',
    );
    const recovered = await runAction(
      page,
      '#decode',
      (state) => state.status === 'PASS: decoded and released',
      'decode after explicit failures',
      60_000,
    );

    for (const [name, state] of [
      ['cancel', cancelled],
      ['truncated', truncated],
      ['corrupt', corrupt],
      ['timeout', timeout],
      ['oversized', oversized],
    ]) {
      if (state.width !== 1 || state.height !== 1) {
        throw new Error(`${name} retained a stale display: ${state.width}x${state.height}`);
      }
    }

    let unsupported = null;
    if (unsupportedPath) {
      await selectFile(page, unsupportedPath);
      unsupported = await runAction(
        page,
        '#decode',
        (state) => state.status.startsWith('FAIL'),
        'unsupported codec rejection',
      );
      if (unsupported.width !== 1 || unsupported.height !== 1) {
        throw new Error('unsupported codec rejection retained a stale display');
      }
    }

    let collection = null;
    if (collectionPath) {
      await selectFile(page, collectionPath);
      collection = await runAction(
        page,
        '#decode',
        (state) => state.status.startsWith('FAIL'),
        'multi-image/sequence rejection',
      );
      if (collection.width !== 1 || collection.height !== 1) {
        throw new Error('multi-image/sequence rejection retained a stale display');
      }
    }

    await selectFile(page, sourcePath);
    await runAction(
      page,
      '#decode',
      (state) => state.status === 'PASS: decoded and released',
      'final decode before screenshot',
      60_000,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const externalUrls = networkUrls.filter((url) => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      try {
        const parsed = new URL(url);
        return parsed.hostname !== '127.0.0.1' && parsed.protocol !== 'about:';
      } catch {
        return true;
      }
    });
    const report = {
      smoke: 'lociview-edge-heic-decoder-poc-v1',
      browser: await browser.version(),
      normalDecode: {
        status: decoded.status,
        dimensions: decodedResult.outputDimensions,
        rgbaBytes: decodedResult.outputRgbaBytes,
        canonicalMediaType: decodedResult.canonicalMediaType,
        topLevelCount: decodedResult.topLevelCount,
        trackCount: decodedResult.trackCount,
      },
      offlineAfterWarm: offlineAfterWarm.status,
      cancel: cancelled.status,
      repeatedCleanup: repeated.status,
      staleSelection: stale.status,
      failureDisplayReleased: true,
      truncated: { status: truncated.status, result: parseResult(truncated) },
      corrupt: { status: corrupt.status, result: parseResult(corrupt) },
      timeout: { status: timeout.status, result: parseResult(timeout) },
      oversized: { status: oversized.status, result: parseResult(oversized) },
      recovery: recovered.status,
      unsupportedCodec: unsupported && { status: unsupported.status, result: parseResult(unsupported) },
      collectionOrSequence: collection && { status: collection.status, result: parseResult(collection) },
      network: {
        requestedSameOriginUrls: [...new Set(networkUrls)].length,
        externalUrls,
      },
      runtimeExceptions,
      screenshot: screenshotPath,
    };

    if (externalUrls.length > 0) throw new Error(`external requests detected: ${externalUrls.join(', ')}`);
    if (runtimeExceptions.length > 0) {
      throw new Error(`page exceptions detected: ${runtimeExceptions.join(', ')}`);
    }
    const reportPath = path.join(artifactRoot, 'edge-poc-result.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

await run();
