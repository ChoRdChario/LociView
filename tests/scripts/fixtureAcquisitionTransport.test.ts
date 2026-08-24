import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createTestAttemptControl } from '../../scripts/fixtures/acquisition/attempt.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createModeBTransportForTest, isPublicRoutableAddress, normalizeIpAddress } from '../../scripts/fixtures/acquisition/transport-core.mjs';

type JsonObject = Record<string, any>;

const locator =
  'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/synthetic.glb';
const assetRedirect =
  'https://release-assets.githubusercontent.com/github-production-release-asset/1/synthetic.glb?sig=ephemeral';

function response(overrides: JsonObject = {}): JsonObject {
  let destroyed = false;
  return {
    statusCode: 200,
    rawHeaders: ['Content-Length', '3'],
    headerBytes: 64,
    remoteAddress: '8.8.8.8',
    body: (async function* () { yield Buffer.from('abc'); })(),
    complete: () => true,
    destroy: () => { destroyed = true; },
    destroyed: () => destroyed,
    ...overrides,
  };
}

function rawPort(
  responses: JsonObject[],
  answers: JsonObject[] = [{ address: '8.8.8.8', family: 4 }],
): {
  port: JsonObject;
  requests: JsonObject[];
  resolutions: string[];
} {
  const requests: JsonObject[] = [];
  const resolutions: string[] = [];
  return {
    requests,
    resolutions,
    port: {
      async resolveAll(hostname: string) {
        resolutions.push(hostname);
        return { ok: true, answers: structuredClone(answers) };
      },
      async open(request: JsonObject) {
        requests.push(request);
        const next = responses.shift();
        if (next === undefined) return { ok: false, kind: 'tcp-io' };
        const { destroyed: _testOnly, ...raw } = next;
        return { ok: true, response: raw };
      },
    },
  };
}

function attempt(): ReturnType<typeof createTestAttemptControl> {
  return createTestAttemptControl({
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
}

async function open(
  raw: JsonObject,
  input: JsonObject = {},
): Promise<{ opened: JsonObject; control: ReturnType<typeof createTestAttemptControl> }> {
  const control = input.attempt ?? attempt();
  const transport = createModeBTransportForTest(raw);
  const opened = await transport.openModeBResponse({
    locator,
    expectedBytes: 3,
    attempt: control,
    ...input,
  });
  return { opened, control };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Mode-B URL, redirect and request policy', () => {
  it.each([
    locator.replace('https:', 'http:'),
    locator.replace('github.com/', 'user:pass@github.com/'),
    locator.replace('github.com/', 'github.com:444/'),
    `${locator}?token=secret`,
    `${locator}#fragment`,
    locator.replace('github.com', 'example.com'),
    locator.replace('synthetic.glb', 'CON'),
  ])('rejects an unauthorized initial locator before DNS: %s', async (badLocator) => {
    const fake = rawPort([response()]);
    const control = attempt();
    await expect(createModeBTransportForTest(fake.port).openModeBResponse({
      locator: badLocator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({
      code: 'E_URL_POLICY',
      transportHead: { sourceIdentity: null },
    });
    expect(fake.resolutions).toEqual([]);
    control.close();
  });

  it('reauthorizes a signed asset redirect and pins one address per hop', async () => {
    const redirect = response({
      statusCode: 302,
      rawHeaders: ['Location', assetRedirect],
      body: (async function* () { throw new Error('redirect body must not be consumed'); })(),
    });
    const fake = rawPort([redirect, response()]);
    const { opened, control } = await open(fake.port);
    expect(opened.head).toEqual({
      sourceIdentity: locator,
      redirectOrigins: ['https://release-assets.githubusercontent.com:443'],
      redirectCount: 1,
      finalOrigin: 'https://release-assets.githubusercontent.com:443',
      status: 200,
      declaredBytes: 3,
    });
    expect(fake.resolutions).toEqual([
      'github.com',
      'release-assets.githubusercontent.com',
    ]);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]).toMatchObject({
      hostname: 'github.com',
      pinnedAddress: '8.8.8.8',
      family: 4,
      port: 443,
      servername: 'github.com',
      method: 'GET',
      headers: [
        ['Host', 'github.com'],
        ['Accept-Encoding', 'identity'],
        ['Connection', 'close'],
      ],
      maxHeaderBytes: 65536,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of opened.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('abc');
    control.close();
  });

  it.each([
    [[], 'missing'],
    [['Location', assetRedirect, 'Location', assetRedirect], 'duplicate'],
    [['Location', 'https://github.com/other/path'], 'path'],
    [['Location', `${locator}?forbidden=query`], 'query'],
    [['Location', 'https://example.com/secret'], 'origin'],
    [['Location', assetRedirect.replace('https://', 'https://@')], 'empty userinfo'],
    [['Location', assetRedirect.replace('https://', '//@')], 'network-path userinfo'],
    [['Location', assetRedirect.replace('https://', 'https:\\\\')], 'backslash authority'],
    [['Location', assetRedirect.replace('/synthetic.glb', '\\synthetic.glb')], 'backslash path'],
    [['Location', assetRedirect.replace('https://', 'https:////@')], 'extra-slash absolute userinfo'],
    [['Location', assetRedirect.replace('https://', '///@')], 'extra-slash network userinfo'],
    [['Location', assetRedirect.replace('https://', 'https:@')], 'missing-slash absolute userinfo'],
    [['Location', assetRedirect.replace('https://', 'https:')], 'missing-slash absolute URL'],
  ])('rejects %s redirect Location without disclosing it', async (rawHeaders) => {
    const fake = rawPort([response({ statusCode: 302, rawHeaders })]);
    const control = attempt();
    await expect(createModeBTransportForTest(fake.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({ code: 'E_REDIRECT_POLICY' });
    control.close();
  });

  it('allows five redirects and rejects the sixth', async () => {
    const locations = [
      assetRedirect,
      locator,
      assetRedirect,
      locator,
      assetRedirect,
      locator,
    ];
    const replies = locations.map((location) => response({
      statusCode: 302,
      rawHeaders: ['Location', location],
    }));
    const fake = rawPort(replies);
    const control = attempt();
    await expect(createModeBTransportForTest(fake.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({
      code: 'E_REDIRECT_POLICY',
      transportHead: { redirectCount: 5, status: 302 },
    });
    expect(fake.requests).toHaveLength(6);
    control.close();
  });
});

describe('Mode-B DNS and address pinning', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.0.2.1',
    '192.168.0.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fe80::1',
    'ff00::1',
    '2001:db8::1',
    '2002::1',
    '2620:4f:8000::1',
    '3fff::1',
  ])('classifies a special-use address as non-public: %s', (address) => {
    expect(isPublicRoutableAddress(address)).toBe(false);
  });

  it.each([
    ['8.8.8.8', 4],
    ['1.1.1.1', 4],
    ['2606:4700:4700::1111', 6],
    ['2001:4860:4860::8888', 6],
    ['::ffff:8.8.8.8', 4],
  ])('normalizes a public address without widening its family: %s', (address, family) => {
    const normalized = normalizeIpAddress(address);
    expect(normalized).toMatchObject({ family });
    expect(isPublicRoutableAddress(normalized)).toBe(true);
  });

  it('rejects zero, seventeen, malformed and mixed public/private answers', async () => {
    for (const answers of [
      [],
      Array.from({ length: 17 }, () => ({ address: '8.8.8.8', family: 4 })),
      [{ address: '008.8.8.8', family: 4 }],
      [{ address: '8.8.8.8', family: 6 }],
      [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }],
    ]) {
      const fake = rawPort([response()], answers);
      const control = attempt();
      await expect(createModeBTransportForTest(fake.port).openModeBResponse({
        locator,
        expectedBytes: 3,
        attempt: control,
      })).rejects.toMatchObject({
        code: answers.length === 0 ? 'E_DNS_IO' : 'E_ADDRESS_POLICY',
      });
      expect(fake.requests).toEqual([]);
      control.close();
    }
  });

  it('counts duplicates but pins only the first vetted answer without fallback', async () => {
    const answers = [
      { address: '1.1.1.1', family: 4 },
      { address: '8.8.8.8', family: 4 },
      { address: '8.8.8.8', family: 4 },
    ];
    const fake = rawPort([response({ remoteAddress: '1.1.1.1' })], answers);
    const { opened, control } = await open(fake.port);
    expect(fake.requests[0]!.pinnedAddress).toBe('1.1.1.1');
    opened.abort();
    control.close();
  });

  it('rejects a connected remote address that differs from the pin', async () => {
    const fake = rawPort([response({ remoteAddress: '1.1.1.1' })]);
    const control = attempt();
    await expect(createModeBTransportForTest(fake.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({ code: 'E_TLS_IDENTITY' });
    control.close();
  });
});

describe('Mode-B HTTP status and header policy', () => {
  it.each([
    [100, 'E_HTTP_UNEXPECTED_STATUS'],
    [199, 'E_HTTP_UNEXPECTED_STATUS'],
    [201, 'E_HTTP_UNEXPECTED_STATUS'],
    [206, 'E_HTTP_UNEXPECTED_STATUS'],
    [299, 'E_HTTP_UNEXPECTED_STATUS'],
    [300, 'E_HTTP_UNEXPECTED_STATUS'],
    [304, 'E_HTTP_UNEXPECTED_STATUS'],
    [399, 'E_HTTP_UNEXPECTED_STATUS'],
    [400, 'E_HTTP_OTHER_4XX'],
    [401, 'E_HTTP_AUTH'],
    [403, 'E_HTTP_AUTH'],
    [404, 'E_HTTP_NOT_FOUND'],
    [407, 'E_HTTP_AUTH'],
    [408, 'E_HTTP_408'],
    [425, 'E_HTTP_425'],
    [429, 'E_HTTP_429'],
    [499, 'E_HTTP_OTHER_4XX'],
    [500, 'E_HTTP_5XX'],
    [599, 'E_HTTP_5XX'],
    [600, 'E_HTTP_UNEXPECTED_STATUS'],
    [999, 'E_HTTP_UNEXPECTED_STATUS'],
  ])('classifies status %i as %s', async (status, code) => {
    const fake = rawPort([response({ statusCode: status, rawHeaders: [] })]);
    const control = attempt();
    await expect(createModeBTransportForTest(fake.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({
      code,
      transportHead: { status },
    });
    control.close();
  });

  it.each([99, 1000, null])('maps invalid status %s to stream I/O with null receipt status', async (status) => {
    const fake = rawPort([response({ statusCode: status })]);
    const control = attempt();
    await expect(createModeBTransportForTest(fake.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({
      code: 'E_STREAM_IO',
      transportHead: { status: null },
    });
    control.close();
  });

  it.each([
    [['Content-Length', '03'], 'E_DECLARED_LENGTH'],
    [['Content-Length', '3', 'Content-Length', '3'], 'E_DECLARED_LENGTH'],
    [['Content-Length', '4'], 'E_DECLARED_LENGTH'],
    [['Content-Length', '9007199254740992'], 'E_DECLARED_LENGTH'],
    [['Content-Encoding', 'gzip'], 'E_CONTENT_ENCODING'],
    [['Content-Encoding', 'identity', 'Content-Encoding', 'identity'], 'E_CONTENT_ENCODING'],
  ])('rejects ambiguous final-200 headers as %s', async (rawHeaders, code) => {
    const fake = rawPort([response({ rawHeaders })]);
    const control = attempt();
    await expect(createModeBTransportForTest(fake.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({ code });
    control.close();
  });

  it('accepts absent length and identity encoding but rejects a 64KiB+1 header fact', async () => {
    const accepted = rawPort([response({
      rawHeaders: ['Content-Encoding', 'identity'],
      headerBytes: 65536,
    })]);
    const { opened, control } = await open(accepted.port);
    expect(opened.head.declaredBytes).toBeNull();
    opened.abort();
    control.close();

    const rejected = rawPort([response({ headerBytes: 65537 })]);
    const rejectedControl = attempt();
    await expect(createModeBTransportForTest(rejected.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: rejectedControl,
    })).rejects.toMatchObject({ code: 'E_STREAM_IO' });
    rejectedControl.close();
  });
});

describe('Mode-B connect and body timers', () => {
  it('mirrors an already-aborted attempt into DNS before the raw resolver starts', async () => {
    const external = new AbortController();
    external.abort();
    let resolverSawAborted = false;
    let openCalls = 0;
    const port = {
      resolveAll: async (_hostname: string, signal: AbortSignal) => {
        resolverSawAborted = signal.aborted;
        return new Promise(() => {});
      },
      open: async () => {
        openCalls += 1;
        return { ok: false, kind: 'tcp-io' };
      },
    };
    const control = createTestAttemptControl({
      setTimer: () => 1,
      clearTimer: () => undefined,
      externalSignal: external.signal,
    });
    await expect(createModeBTransportForTest(port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({ code: 'E_CANCELLED' });
    expect(resolverSawAborted).toBe(true);
    expect(openCalls).toBe(0);
    control.close();
  });

  it('aborts the hop signal when a DNS rejection ends without handing off a body', async () => {
    const resolverSignals: AbortSignal[] = [];
    const port = {
      resolveAll: async (_hostname: string, signal: AbortSignal) => {
        resolverSignals.push(signal);
        return { ok: true, answers: [] };
      },
      open: async () => ({ ok: false, kind: 'tcp-io' }),
    };
    const control = attempt();
    await expect(createModeBTransportForTest(port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    })).rejects.toMatchObject({ code: 'E_DNS_IO' });
    expect(resolverSignals).toHaveLength(1);
    expect(resolverSignals[0]!.aborted).toBe(true);
    control.close();
  });

  it('times out a hop that never resolves DNS', async () => {
    vi.useFakeTimers();
    const port = {
      resolveAll: async () => new Promise(() => {}),
      open: async () => ({ ok: false, kind: 'tcp-io' }),
    };
    const control = attempt();
    const pending = createModeBTransportForTest(port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: control,
    });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'E_CONNECT_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    control.close();
  });

  it('does not refresh body idle time for empty chunks and does refresh for data', async () => {
    vi.useFakeTimers();
    const emptyThenWait = response({
      body: (async function* () {
        yield Buffer.alloc(0);
        await new Promise(() => {});
      })(),
    });
    const emptyFake = rawPort([emptyThenWait]);
    const emptyControl = attempt();
    const emptyOpened = await createModeBTransportForTest(emptyFake.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: emptyControl,
    });
    const emptyPending = emptyOpened.body[Symbol.asyncIterator]().next();
    const emptyRejection = expect(emptyPending).rejects.toMatchObject({ code: 'E_IDLE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(30000);
    await emptyRejection;
    emptyControl.close();

    const dataThenWait = response({
      body: (async function* () {
        yield Buffer.from('a');
        await new Promise(() => {});
      })(),
    });
    const dataFake = rawPort([dataThenWait]);
    const dataControl = attempt();
    const dataOpened = await createModeBTransportForTest(dataFake.port).openModeBResponse({
      locator,
      expectedBytes: 3,
      attempt: dataControl,
    });
    const iterator = dataOpened.body[Symbol.asyncIterator]();
    await vi.advanceTimersByTimeAsync(29999);
    await expect(iterator.next()).resolves.toMatchObject({ value: Buffer.from('a'), done: false });
    const pending = iterator.next();
    await vi.advanceTimersByTimeAsync(29999);
    let settled = false;
    void pending.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    const dataRejection = expect(pending).rejects.toMatchObject({ code: 'E_IDLE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1);
    await dataRejection;
    dataControl.close();
  });
});
