import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createNodeRawPortForTest } from '../../scripts/fixtures/acquisition/transport-node.mjs';

type Behavior = {
  pendingDns?: boolean;
  pendingDns6?: boolean;
  dns4ErrorCode?: string;
  authorized?: boolean;
  alpnProtocol?: string;
  remoteAddress?: string;
  socketError?: { code: string; afterConnect: boolean };
  requestErrorCode?: string;
  requestThrows?: boolean;
  informationalValues?: string[];
  informationalWireBytes?: number[];
  coalescedFinalBodyBytes?: number;
  emitContinue?: boolean;
};

function codedError(code: string): NodeJS.ErrnoException {
  const error = new Error('synthetic transport failure') as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function rawRequest(signal = new AbortController().signal): Record<string, unknown> {
  return Object.freeze({
    hostname: 'github.com',
    pinnedAddress: '1.1.1.1',
    family: 4,
    port: 443,
    servername: 'github.com',
    method: 'GET',
    pathAndQuery: '/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/test.glb',
    headers: Object.freeze([
      Object.freeze(['Host', 'github.com']),
      Object.freeze(['Accept-Encoding', 'identity']),
      Object.freeze(['Connection', 'close']),
    ]),
    maxHeaderBytes: 64 * 1024,
    signal,
  });
}

function harness(behavior: Behavior = {}) {
  const observations: Record<string, any> = {
    resolverHosts: [],
    resolverCancels: 0,
    agentOptions: [],
    tlsOptions: [],
    requestOptions: [],
    agentDestroyed: 0,
    requestDestroyed: 0,
  };
  const pendingDnsRejects: Array<(error: Error) => void> = [];

  class FakeResolver {
    resolve4(hostname: string): Promise<string[]> {
      observations.resolverHosts.push([hostname, 4]);
      if (behavior.dns4ErrorCode !== undefined) {
        return Promise.reject(codedError(behavior.dns4ErrorCode));
      }
      if (!behavior.pendingDns) return Promise.resolve(['1.1.1.1']);
      return new Promise((_, reject) => pendingDnsRejects.push(reject));
    }

    resolve6(hostname: string): Promise<string[]> {
      observations.resolverHosts.push([hostname, 6]);
      if (!behavior.pendingDns && !behavior.pendingDns6) {
        return Promise.resolve(['2606:4700:4700::1111']);
      }
      return new Promise((_, reject) => pendingDnsRejects.push(reject));
    }

    cancel(): void {
      observations.resolverCancels += 1;
      for (const reject of pendingDnsRejects.splice(0)) reject(codedError('ECANCELLED'));
    }
  }

  class FakeAgent {
    createConnection!: (options: unknown, callback: (error: Error | null, socket?: FakeSocket) => void) => void;

    constructor(options: Record<string, unknown>) {
      observations.agentOptions.push(options);
    }

    destroy(): void {
      observations.agentDestroyed += 1;
    }
  }

  class FakeSocket extends EventEmitter {
    authorized = behavior.authorized ?? true;
    alpnProtocol = behavior.alpnProtocol ?? 'http/1.1';
    remoteAddress = behavior.remoteAddress ?? '1.1.1.1';
    destroyed = false;

    destroy(error?: Error): void {
      this.destroyed = true;
      if (error !== undefined) queueMicrotask(() => this.emit('error', error));
    }
  }

  const checkServerIdentity = vi.fn();
  const tlsConnect = (options: Record<string, unknown>): FakeSocket => {
    observations.tlsOptions.push(options);
    const socket = new FakeSocket();
    queueMicrotask(() => {
      const failure = behavior.socketError;
      if (failure !== undefined && !failure.afterConnect) {
        socket.emit('error', codedError(failure.code));
        return;
      }
      socket.emit('connect');
      if (failure !== undefined) socket.emit('error', codedError(failure.code));
      else socket.emit('secureConnect');
    });
    return socket;
  };

  const httpsRequest = (options: Record<string, any>): EventEmitter & {
    end(): void;
    destroy(): void;
  } => {
    observations.requestOptions.push(options);
    if (behavior.requestThrows) throw codedError('ERR_SYNTHETIC_REQUEST');
    const request = new EventEmitter() as EventEmitter & { end(): void; destroy(): void };
    let requestDestroyed = false;
    request.destroy = () => {
      requestDestroyed = true;
      observations.requestDestroyed += 1;
    };
    request.end = () => {
      queueMicrotask(() => {
        options.agent.createConnection({}, (error: Error | null, socket?: FakeSocket) => {
          if (error !== null) {
            request.emit('error', error);
            return;
          }
          if (behavior.requestErrorCode !== undefined) {
            request.emit('error', codedError(behavior.requestErrorCode));
            return;
          }
          for (const [index, value] of (behavior.informationalValues ?? []).entries()) {
            const wireBytes = behavior.informationalWireBytes?.[index] ?? 0;
            if (wireBytes > 0) {
              const prefix = Buffer.from('HTTP/1.1 103 Early Hints\r\nLink: ');
              const suffix = Buffer.from('\r\n\r\n');
              socket?.emit('data', Buffer.concat([
                prefix,
                Buffer.alloc(Math.max(0, wireBytes - prefix.byteLength - suffix.byteLength), 0x20),
                suffix,
              ]));
            }
            if (requestDestroyed) return;
            request.emit('information', {
              httpVersion: '1.1',
              statusCode: 103,
              statusMessage: 'Early Hints',
              rawHeaders: ['Link', value],
            });
            if (behavior.emitContinue) request.emit('continue');
            if (requestDestroyed) return;
          }
          const message = new EventEmitter() as EventEmitter & Record<string | symbol, any>;
          Object.assign(message, {
            httpVersion: '1.1',
            statusCode: 200,
            statusMessage: 'OK',
            rawHeaders: ['Content-Length', '3'],
            socket,
            complete: true,
            destroy: () => undefined,
          });
          message[Symbol.asyncIterator] = async function* () {
            yield Buffer.from('abc');
          };
          if (behavior.coalescedFinalBodyBytes !== undefined) {
            socket?.emit('data', Buffer.concat([
              Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\n'),
              Buffer.alloc(behavior.coalescedFinalBodyBytes, 0x61),
            ]));
          }
          if (requestDestroyed) return;
          request.emit('response', message);
        });
      });
    };
    return request;
  };

  const port = createNodeRawPortForTest({
    Resolver: FakeResolver,
    Agent: FakeAgent,
    httpsRequest,
    tlsConnect,
    checkServerIdentity,
    rootCertificates: ['synthetic-system-root'],
  });
  return { port, observations, checkServerIdentity, AgentClass: FakeAgent };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('production Node raw transport adapter without network access', () => {
  it('resolves A then AAAA and wires a private pinned TLS/HTTPS request with fixed trust', async () => {
    const fake = harness();
    await expect(fake.port.resolveAll('github.com', new AbortController().signal)).resolves.toEqual({
      ok: true,
      answers: [
        { address: '1.1.1.1', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ],
    });
    expect(fake.observations.resolverHosts).toEqual([
      ['github.com', 4],
      ['github.com', 6],
    ]);

    const opened = await fake.port.open(rawRequest());
    expect(opened.ok).toBe(true);
    expect(fake.observations.agentOptions).toEqual([{
      keepAlive: false,
      maxCachedSessions: 0,
      maxSockets: 1,
      maxTotalSockets: 1,
      scheduling: 'fifo',
    }]);
    expect(fake.observations.tlsOptions).toHaveLength(1);
    expect(fake.observations.tlsOptions[0]).toEqual({
      host: '1.1.1.1',
      port: 443,
      family: 4,
      servername: 'github.com',
      rejectUnauthorized: true,
      checkServerIdentity: fake.checkServerIdentity,
      ca: ['synthetic-system-root'],
      ALPNProtocols: ['http/1.1'],
      autoSelectFamily: false,
    });
    expect(fake.observations.requestOptions).toHaveLength(1);
    expect(fake.observations.requestOptions[0]).toEqual({
      protocol: 'https:',
      hostname: 'github.com',
      port: 443,
      method: 'GET',
      path: '/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/test.glb',
      headers: {
        Host: 'github.com',
        'Accept-Encoding': 'identity',
        Connection: 'close',
      },
      setHost: false,
      agent: expect.any(fake.AgentClass),
      servername: 'github.com',
      rejectUnauthorized: true,
      checkServerIdentity: fake.checkServerIdentity,
      ca: ['synthetic-system-root'],
      ALPNProtocols: ['http/1.1'],
      insecureHTTPParser: false,
      maxHeaderSize: 64 * 1024,
      autoSelectFamily: false,
      signal: expect.any(AbortSignal),
    });
    expect(fake.observations.requestOptions[0]).not.toHaveProperty('lookup');
    expect(fake.observations.requestOptions[0]).not.toHaveProperty('proxy');

    const chunks: Buffer[] = [];
    for await (const chunk of opened.response.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8')).toBe('abc');
    expect(opened.response.remoteAddress).toBe('1.1.1.1');
    expect(opened.response.complete()).toBe(true);
    expect(fake.observations.agentDestroyed).toBe(1);
  });

  it('cancels its private DNS resolver and reports only the fixed aborted kind', async () => {
    const fake = harness({ pendingDns: true });
    const controller = new AbortController();
    const pending = fake.port.resolveAll('github.com', controller.signal);
    controller.abort();
    await expect(pending).resolves.toEqual({ ok: false, kind: 'aborted' });
    expect(fake.observations.resolverCancels).toBe(1);
  });

  it('cancels the other DNS family when one family fails', async () => {
    const fake = harness({ dns4ErrorCode: 'ESERVFAIL', pendingDns6: true });
    await expect(fake.port.resolveAll('github.com', new AbortController().signal))
      .resolves.toEqual({ ok: false, kind: 'dns-io' });
    expect(fake.observations.resolverCancels).toBe(1);
  });

  it('enforces one cumulative header budget across informational and final blocks', async () => {
    const over = harness({ informationalValues: ['x'.repeat(33_000), 'y'.repeat(33_000)] });
    await expect(over.port.open(rawRequest())).resolves.toEqual({ ok: false, kind: 'http-parse' });
    expect(over.observations.requestDestroyed).toBe(1);

    const oneHundredOnce = harness({
      informationalValues: ['x'.repeat(33_000)],
      emitContinue: true,
    });
    const opened = await oneHundredOnce.port.open(rawRequest());
    expect(opened.ok).toBe(true);
    expect(opened.response.headerBytes).toBeGreaterThan(33_000);
    expect(opened.response.headerBytes).toBeLessThan(64 * 1024);
    opened.response.destroy();

    const normalizedWhitespace = harness({
      informationalValues: ['x', 'y'],
      informationalWireBytes: [40_000, 40_000],
    });
    await expect(normalizedWhitespace.port.open(rawRequest()))
      .resolves.toEqual({ ok: false, kind: 'http-parse' });
    expect(normalizedWhitespace.observations.requestDestroyed).toBe(1);

    const coalescedBody = harness({ coalescedFinalBodyBytes: 80_000 });
    const coalescedOpened = await coalescedBody.port.open(rawRequest());
    expect(coalescedOpened.ok).toBe(true);
    expect(coalescedOpened.response.headerBytes).toBeLessThan(64 * 1024);
    coalescedOpened.response.destroy();
  });

  it.each([
    ['unauthorized certificate', { authorized: false }, 'tls-identity'],
    ['wrong ALPN', { alpnProtocol: 'h2' }, 'tls-identity'],
    ['remote-address mismatch', { remoteAddress: '8.8.8.8' }, 'tls-identity'],
    ['certificate identity error', { socketError: { code: 'ERR_TLS_CERT_ALTNAME_INVALID', afterConnect: false } }, 'tls-identity'],
    ['OpenSSL invalid CA error', { socketError: { code: 'INVALID_CA', afterConnect: false } }, 'tls-identity'],
    ['TCP error', { socketError: { code: 'ECONNREFUSED', afterConnect: false } }, 'tcp-io'],
    ['TLS error', { socketError: { code: 'ECONNRESET', afterConnect: true } }, 'tls-io'],
    ['HTTP parser error', { requestErrorCode: 'HPE_INVALID_HEADER_TOKEN' }, 'http-parse'],
    ['synchronous request error', { requestThrows: true }, 'tcp-io'],
  ] as const)('maps %s without exposing its raw error', async (_label, behavior, kind) => {
    const fake = harness(behavior);
    await expect(fake.port.open(rawRequest())).resolves.toEqual({ ok: false, kind });
  });
});
