import { Resolver } from 'node:dns/promises';
import { Agent, request as httpsRequest } from 'node:https';
import { checkServerIdentity, connect as tlsConnect, rootCertificates } from 'node:tls';

const EMPTY_DNS_CODES = new Set(['ENODATA', 'ENOTFOUND', 'EAI_NODATA', 'EAI_NONAME']);
const TLS_IDENTITY_CODES = new Set([
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_SIGNATURE_FAILURE',
  'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED',
  'CERT_REVOKED',
  'CERT_UNTRUSTED',
  'INVALID_CA',
  'INVALID_PURPOSE',
  'CERT_REJECTED',
  'CERT_CHAIN_TOO_LONG',
  'CRL_HAS_EXPIRED',
  'CRL_NOT_YET_VALID',
  'CRL_SIGNATURE_FAILURE',
]);

const PRODUCTION_PRIMITIVES = Object.freeze({
  Resolver,
  Agent,
  httpsRequest,
  tlsConnect,
  checkServerIdentity,
  rootCertificates,
});

function errorCode(error) {
  return error !== null && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : '';
}

function dnsEmpty(error) {
  return EMPTY_DNS_CODES.has(errorCode(error));
}

async function resolveFamily(resolver, hostname, family) {
  try {
    const values = family === 4
      ? await resolver.resolve4(hostname)
      : await resolver.resolve6(hostname);
    return values.map((address) => Object.freeze({ address, family }));
  } catch (error) {
    if (dnsEmpty(error)) return [];
    throw error;
  }
}

async function resolveAll(primitives, hostname, signal) {
  if (typeof hostname !== 'string' || signal?.aborted) {
    return Object.freeze({ ok: false, kind: 'aborted' });
  }
  const resolver = new primitives.Resolver();
  let cancelled = false;
  const abort = () => {
    if (cancelled) return;
    cancelled = true;
    try { resolver.cancel(); } catch { /* fixed DNS outcome remains */ }
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const [ipv4, ipv6] = await Promise.all([
      resolveFamily(resolver, hostname, 4),
      resolveFamily(resolver, hostname, 6),
    ]);
    if (signal?.aborted) return Object.freeze({ ok: false, kind: 'aborted' });
    return Object.freeze({
      ok: true,
      answers: Object.freeze([...ipv4, ...ipv6]),
    });
  } catch {
    abort();
    return Object.freeze({
      ok: false,
      kind: signal?.aborted ? 'aborted' : 'dns-io',
    });
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

function remoteMatchesPin(remoteAddress, pinnedAddress, family) {
  if (typeof remoteAddress !== 'string') return false;
  if (family === 4) {
    return (
      remoteAddress === pinnedAddress ||
      remoteAddress.toLowerCase() === `::ffff:${pinnedAddress}`
    );
  }
  return remoteAddress.toLowerCase() === pinnedAddress.toLowerCase();
}

function tlsIdentityFailure(error) {
  const code = errorCode(error);
  return (
    TLS_IDENTITY_CODES.has(code) ||
    code.startsWith('ERR_TLS_CERT_') ||
    code.startsWith('CERT_')
  );
}

function rawHeaderBytes(message) {
  let bytes = Buffer.byteLength(
    `HTTP/${message.httpVersion} ${message.statusCode ?? ''} ${message.statusMessage ?? ''}\r\n`,
    'latin1',
  ) + 2;
  for (let index = 0; index < message.rawHeaders.length; index += 2) {
    bytes += Buffer.byteLength(
      `${message.rawHeaders[index]}: ${message.rawHeaders[index + 1]}\r\n`,
      'latin1',
    );
  }
  return bytes;
}

function open(primitives, rawRequest) {
  return new Promise((accept) => {
    if (rawRequest.signal?.aborted) {
      accept(Object.freeze({ ok: false, kind: 'aborted' }));
      return;
    }

    let settled = false;
    let tcpConnected = false;
    let tlsSocket;
    let clientRequest;
    let responseMessage;
    let cumulativeHeaderBytes = 0;
    let wireHeaderBytes = 0;
    let pendingWireHeader = Buffer.alloc(0);
    let finalWireHeaderSeen = false;
    let headersAccepted = false;
    let cleanup = () => {};
    const finish = (result) => {
      if (settled) return;
      settled = true;
      accept(Object.freeze(result));
    };
    const rejectHeaderBudget = () => {
      if (settled) return;
      finish({ ok: false, kind: 'http-parse' });
      clientRequest?.destroy();
      tlsSocket?.destroy();
      cleanup();
    };
    const observeWireHeaders = (chunk) => {
      if (headersAccepted || finalWireHeaderSeen || settled) return;
      if (!(chunk instanceof Uint8Array)) {
        rejectHeaderBudget();
        return;
      }
      let incoming = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      while (incoming.byteLength > 0) {
        const remaining = rawRequest.maxHeaderBytes - wireHeaderBytes;
        const take = Math.min(
          incoming.byteLength,
          Math.max(0, remaining - pendingWireHeader.byteLength + 1),
        );
        const candidate = Buffer.concat([
          pendingWireHeader,
          incoming.subarray(0, take),
        ]);
        const boundary = candidate.indexOf('\r\n\r\n');
        if (boundary === -1) {
          if (candidate.byteLength > remaining || take < incoming.byteLength) {
            rejectHeaderBudget();
            return;
          }
          pendingWireHeader = candidate;
          return;
        }
        const blockBytes = boundary + 4;
        wireHeaderBytes += blockBytes;
        if (wireHeaderBytes > rawRequest.maxHeaderBytes) {
          rejectHeaderBudget();
          return;
        }
        const lineEnd = candidate.indexOf('\r\n');
        const statusLine = lineEnd === -1
          ? ''
          : candidate.subarray(0, lineEnd).toString('latin1');
        const statusMatch = /^HTTP\/1\.[01] ([0-9]{3})(?: |(?![\s\S]))/u.exec(statusLine);
        const status = statusMatch === null ? null : Number(statusMatch[1]);
        if (status === null || status < 100 || status > 999) {
          rejectHeaderBudget();
          return;
        }
        const consumedFromIncoming = blockBytes - pendingWireHeader.byteLength;
        pendingWireHeader = Buffer.alloc(0);
        incoming = incoming.subarray(consumedFromIncoming);
        if (status === 101 || status >= 200) {
          finalWireHeaderSeen = true;
          return;
        }
      }
    };
    const agent = new primitives.Agent({
      keepAlive: false,
      maxCachedSessions: 0,
      maxSockets: 1,
      maxTotalSockets: 1,
      scheduling: 'fifo',
    });

    agent.createConnection = (_options, callback) => {
      let callbackUsed = false;
      const complete = (error, socket) => {
        if (callbackUsed) return;
        callbackUsed = true;
        callback(error, socket);
      };
      try {
        tlsSocket = primitives.tlsConnect({
          host: rawRequest.pinnedAddress,
          port: 443,
          family: rawRequest.family,
          servername: rawRequest.servername,
          rejectUnauthorized: true,
          checkServerIdentity: primitives.checkServerIdentity,
          ca: primitives.rootCertificates,
          ALPNProtocols: ['http/1.1'],
          autoSelectFamily: false,
        });
      } catch (error) {
        error.acquisitionKind = 'tls-io';
        complete(error);
        return undefined;
      }
      tlsSocket.prependListener('data', observeWireHeaders);
      tlsSocket.once('connect', () => { tcpConnected = true; });
      tlsSocket.once('secureConnect', () => {
        if (
          tlsSocket.authorized !== true ||
          tlsSocket.alpnProtocol !== 'http/1.1' ||
          !remoteMatchesPin(
            tlsSocket.remoteAddress,
            rawRequest.pinnedAddress,
            rawRequest.family,
          )
        ) {
          const error = new Error('TLS identity rejected');
          error.acquisitionKind = 'tls-identity';
          tlsSocket.destroy(error);
          complete(error);
          return;
        }
        complete(null, tlsSocket);
      });
      tlsSocket.once('error', (error) => {
        if (callbackUsed) return;
        error.acquisitionKind = (
          tlsIdentityFailure(error) ||
          (
            typeof tlsSocket.authorizationError === 'string' &&
            tlsSocket.authorizationError !== ''
          )
        )
          ? 'tls-identity'
          : tcpConnected
            ? 'tls-io'
            : 'tcp-io';
        complete(error);
      });
      return undefined;
    };

    cleanup = () => {
      rawRequest.signal?.removeEventListener('abort', abort);
      tlsSocket?.removeListener('data', observeWireHeaders);
      agent.destroy();
    };
    const abort = () => {
      responseMessage?.destroy();
      clientRequest?.destroy();
      tlsSocket?.destroy();
      if (!settled) finish({ ok: false, kind: 'aborted' });
      cleanup();
    };
    rawRequest.signal?.addEventListener('abort', abort, { once: true });

    try {
      const headers = Object.fromEntries(rawRequest.headers);
      clientRequest = primitives.httpsRequest({
        protocol: 'https:',
        hostname: rawRequest.hostname,
        port: 443,
        method: 'GET',
        path: rawRequest.pathAndQuery,
        headers,
        setHost: false,
        agent,
        servername: rawRequest.servername,
        rejectUnauthorized: true,
        checkServerIdentity: primitives.checkServerIdentity,
        ca: primitives.rootCertificates,
        ALPNProtocols: ['http/1.1'],
        insecureHTTPParser: false,
        maxHeaderSize: rawRequest.maxHeaderBytes,
        autoSelectFamily: false,
        signal: rawRequest.signal,
      });
    } catch {
      cleanup();
      finish({ ok: false, kind: 'tcp-io' });
      return;
    }

    clientRequest.once('response', (message) => {
      let finalHeaderBytes;
      try { finalHeaderBytes = rawHeaderBytes(message); } catch {
        finish({ ok: false, kind: 'http-parse' });
        message.destroy();
        cleanup();
        return;
      }
      cumulativeHeaderBytes += finalHeaderBytes;
      const observedHeaderBytes = Math.max(
        cumulativeHeaderBytes,
        wireHeaderBytes + pendingWireHeader.byteLength,
      );
      if (
        !Number.isSafeInteger(observedHeaderBytes) ||
        observedHeaderBytes > rawRequest.maxHeaderBytes
      ) {
        finish({ ok: false, kind: 'http-parse' });
        message.destroy();
        cleanup();
        return;
      }
      headersAccepted = true;
      tlsSocket?.removeListener('data', observeWireHeaders);
      responseMessage = message;
      const body = Object.freeze({
        [Symbol.asyncIterator]() {
          const iterator = message[Symbol.asyncIterator]();
          return {
            async next() {
              try {
                const result = await iterator.next();
                if (result.done) cleanup();
                return result;
              } catch (error) {
                cleanup();
                throw error;
              }
            },
            async return() {
              try { return await iterator.return?.() ?? { done: true, value: undefined }; }
              finally { cleanup(); }
            },
            [Symbol.asyncIterator]() { return this; },
          };
        },
      });
      finish({
        ok: true,
        response: Object.freeze({
          statusCode: message.statusCode ?? null,
          rawHeaders: Object.freeze([...message.rawHeaders]),
          headerBytes: observedHeaderBytes,
          remoteAddress: message.socket.remoteAddress ?? null,
          body,
          complete: () => message.complete,
          destroy: () => {
            message.destroy();
            clientRequest.destroy();
            cleanup();
          },
        }),
      });
    });

    clientRequest.once('upgrade', (message, socket) => {
      let finalHeaderBytes;
      try { finalHeaderBytes = rawHeaderBytes(message); } catch {
        finish({ ok: false, kind: 'http-parse' });
        socket.destroy();
        cleanup();
        return;
      }
      cumulativeHeaderBytes += finalHeaderBytes;
      const observedHeaderBytes = Math.max(
        cumulativeHeaderBytes,
        wireHeaderBytes + pendingWireHeader.byteLength,
      );
      if (
        !Number.isSafeInteger(observedHeaderBytes) ||
        observedHeaderBytes > rawRequest.maxHeaderBytes
      ) {
        finish({ ok: false, kind: 'http-parse' });
        socket.destroy();
        cleanup();
        return;
      }
      headersAccepted = true;
      tlsSocket?.removeListener('data', observeWireHeaders);
      responseMessage = message;
      finish({
        ok: true,
        response: Object.freeze({
          statusCode: message.statusCode ?? null,
          rawHeaders: Object.freeze([...message.rawHeaders]),
          headerBytes: observedHeaderBytes,
          remoteAddress: socket.remoteAddress ?? null,
          body: Object.freeze({
            async *[Symbol.asyncIterator]() { /* 101 is classified before body use */ },
          }),
          complete: () => true,
          destroy: () => {
            socket.destroy();
            clientRequest.destroy();
            cleanup();
          },
        }),
      });
    });

    clientRequest.on('information', (message) => {
      if (settled) return;
      let bytes;
      try { bytes = rawHeaderBytes(message); } catch {
        bytes = rawRequest.maxHeaderBytes + 1;
      }
      cumulativeHeaderBytes += bytes;
      if (
        Number.isSafeInteger(cumulativeHeaderBytes) &&
        cumulativeHeaderBytes <= rawRequest.maxHeaderBytes &&
        wireHeaderBytes <= rawRequest.maxHeaderBytes
      ) return;
      finish({ ok: false, kind: 'http-parse' });
      clientRequest.destroy();
      tlsSocket?.destroy();
      cleanup();
    });

    clientRequest.once('error', (error) => {
      if (settled) return;
      const kind = rawRequest.signal?.aborted
        ? 'aborted'
        : error.acquisitionKind ??
          (tlsIdentityFailure(error)
            ? 'tls-identity'
            : tcpConnected
              ? 'http-parse'
              : 'tcp-io');
      cleanup();
      finish({ ok: false, kind });
    });
    clientRequest.end();
  });
}

function createNodeRawPort(primitives) {
  const keys = primitives !== null && typeof primitives === 'object'
    ? Object.keys(primitives).sort()
    : [];
  if (
    JSON.stringify(keys) !== JSON.stringify([
      'Agent',
      'Resolver',
      'checkServerIdentity',
      'httpsRequest',
      'rootCertificates',
      'tlsConnect',
    ]) ||
    typeof primitives.Resolver !== 'function' ||
    typeof primitives.Agent !== 'function' ||
    typeof primitives.httpsRequest !== 'function' ||
    typeof primitives.tlsConnect !== 'function' ||
    typeof primitives.checkServerIdentity !== 'function' ||
    !Array.isArray(primitives.rootCertificates) ||
    !primitives.rootCertificates.every((certificate) => typeof certificate === 'string')
  ) throw new TypeError('invalid Node transport primitives');
  const fixed = Object.freeze({
    Resolver: primitives.Resolver,
    Agent: primitives.Agent,
    httpsRequest: primitives.httpsRequest,
    tlsConnect: primitives.tlsConnect,
    checkServerIdentity: primitives.checkServerIdentity,
    rootCertificates: Object.freeze([...primitives.rootCertificates]),
  });
  return Object.freeze({
    resolveAll(hostname, signal) {
      return resolveAll(fixed, hostname, signal);
    },
    open(rawRequest) {
      return open(fixed, rawRequest);
    },
  });
}

// Import-only seam for offline tests. Production transport.mjs always binds NODE_RAW_PORT.
export function createNodeRawPortForTest(primitives) {
  return createNodeRawPort(primitives);
}

export const NODE_RAW_PORT = createNodeRawPort(PRODUCTION_PRIMITIVES);
