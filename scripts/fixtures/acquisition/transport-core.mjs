import { isIP } from 'node:net';
import { LIMITS, MODE_B_ORIGINS } from './constants.mjs';
import { AcquisitionError } from './errors.mjs';

const MODE_B_LOCATOR =
  /^https:\/\/github\.com\/ChoRdChario\/LociView\/releases\/download\/fixtures-v[0-9]+(?:\.[0-9]+)*\/(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$))[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9])?(?![\s\S])/iu;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ORIGIN_GITHUB = MODE_B_ORIGINS[0];
const ORIGIN_ASSETS = MODE_B_ORIGINS[1];
const RAW_FAILURES = new Set([
  'aborted',
  'dns-io',
  'tcp-io',
  'tls-io',
  'tls-identity',
  'http-parse',
  'stream-io',
]);

function frozenHead(state) {
  return Object.freeze({
    sourceIdentity: state.sourceIdentity,
    redirectOrigins: Object.freeze([...state.redirectOrigins]),
    redirectCount: state.redirectOrigins.length,
    finalOrigin: state.finalOrigin,
    status: state.status,
    declaredBytes: state.declaredBytes,
  });
}

export class ModeBTransportError extends AcquisitionError {
  constructor(code, transportHead, hopIndex = null) {
    super(code, hopIndex);
    this.name = 'ModeBTransportError';
    this.transportHead = transportHead;
  }
}

function transportFailure(attempt, state, code, hopIndex) {
  const candidate = new ModeBTransportError(code, frozenHead(state), hopIndex);
  const fixed = attempt.fix(candidate, code, hopIndex);
  if (fixed instanceof ModeBTransportError) throw fixed;
  throw new ModeBTransportError(fixed.code, frozenHead(state), fixed.hopIndex);
}

function transportCheckpoint(attempt, state, hopIndex) {
  try {
    attempt.checkpoint();
  } catch (error) {
    const fixed = attempt.fix(error, 'E_STREAM_IO', hopIndex);
    throw new ModeBTransportError(fixed.code, frozenHead(state), fixed.hopIndex);
  }
}

function exactObject(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function normalizedOrigin(url) {
  return `https://${url.hostname}:443`;
}

function authorizeUrl(value, initial, state, attempt, hopIndex) {
  let url;
  try { url = new URL(value); } catch { transportFailure(attempt, state, initial ? 'E_URL_POLICY' : 'E_REDIRECT_POLICY', hopIndex); }
  const origin = normalizedOrigin(url);
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.port !== '' ||
    url.hostname.endsWith('.') ||
    !MODE_B_ORIGINS.includes(origin) ||
    (url.search !== '' && origin !== ORIGIN_ASSETS) ||
    /[\\\u0000-\u001f\u007f]/u.test(url.pathname)
  ) transportFailure(attempt, state, initial ? 'E_URL_POLICY' : 'E_REDIRECT_POLICY', hopIndex);
  if (origin === ORIGIN_GITHUB && !MODE_B_LOCATOR.test(url.href)) {
    transportFailure(attempt, state, initial ? 'E_URL_POLICY' : 'E_REDIRECT_POLICY', hopIndex);
  }
  if (initial && (url.search !== '' || url.href !== value)) {
    transportFailure(attempt, state, 'E_URL_POLICY', hopIndex);
  }
  return Object.freeze({
    href: url.href,
    hostname: url.hostname,
    origin,
    pathAndQuery: `${url.pathname}${url.search}`,
  });
}

function validRawLocation(value) {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    /[\\\u0000-\u001f\u007f]/u.test(value)
  ) return false;
  let authorityStart = null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) {
    if (!value.startsWith('https://')) return false;
    authorityStart = 'https://'.length;
  } else if (value.startsWith('//')) {
    authorityStart = 2;
  }
  if (authorityStart === null) return true;
  const remainder = value.slice(authorityStart);
  if (remainder === '' || /^[/?#]/u.test(remainder)) return false;
  const boundary = remainder.search(/[/?#]/u);
  const authority = boundary === -1 ? remainder : remainder.slice(0, boundary);
  return !authority.includes('@');
}

function parseIpv4(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) return null;
    const number = Number(part);
    if (number > 255) return null;
    bytes.push(number);
  }
  return Object.freeze({ family: 4, bytes: Uint8Array.from(bytes), text: bytes.join('.') });
}

function ipv4Tail(tokens) {
  if (tokens.length === 0 || !tokens.at(-1).includes('.')) return tokens;
  const ipv4 = parseIpv4(tokens.at(-1));
  if (ipv4 === null) return null;
  return [
    ...tokens.slice(0, -1),
    ((ipv4.bytes[0] << 8) | ipv4.bytes[1]).toString(16),
    ((ipv4.bytes[2] << 8) | ipv4.bytes[3]).toString(16),
  ];
}

function parseHextets(side) {
  if (side === '') return [];
  let tokens = side.split(':');
  tokens = ipv4Tail(tokens);
  if (
    tokens === null ||
    tokens.some((token) => !/^[0-9a-f]{1,4}$/iu.test(token))
  ) return null;
  return tokens.map((token) => Number.parseInt(token, 16));
}

function canonicalIpv6(words) {
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < words.length;) {
    if (words[index] !== 0) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < words.length && words[end] === 0) end += 1;
    if (end - index > bestLength && end - index >= 2) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }
  if (bestStart === -1) return words.map((word) => word.toString(16)).join(':');
  const left = words.slice(0, bestStart).map((word) => word.toString(16)).join(':');
  const right = words.slice(bestStart + bestLength).map((word) => word.toString(16)).join(':');
  if (left === '' && right === '') return '::';
  if (left === '') return `::${right}`;
  if (right === '') return `${left}::`;
  return `${left}::${right}`;
}

function parseIpv6(value) {
  if (typeof value !== 'string' || value.includes('%') || isIP(value) !== 6) return null;
  if ((value.match(/::/gu) ?? []).length > 1) return null;
  const compressed = value.includes('::');
  const [leftText, rightText = ''] = compressed ? value.split('::') : [value, ''];
  const left = parseHextets(leftText);
  const right = parseHextets(rightText);
  if (left === null || right === null) return null;
  const missing = 8 - left.length - right.length;
  if ((compressed && missing < 1) || (!compressed && missing !== 0)) return null;
  const words = [...left, ...Array(missing).fill(0), ...right];
  if (words.length !== 8) return null;
  const bytes = new Uint8Array(16);
  words.forEach((word, index) => {
    bytes[index * 2] = word >>> 8;
    bytes[index * 2 + 1] = word & 0xff;
  });
  if (
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  ) {
    const mapped = bytes.slice(12);
    return Object.freeze({ family: 4, bytes: mapped, text: [...mapped].join('.') });
  }
  return Object.freeze({ family: 6, bytes, text: canonicalIpv6(words) });
}

export function normalizeIpAddress(value) {
  return parseIpv4(value) ?? parseIpv6(value);
}

function prefixMatches(bytes, network, prefix) {
  const full = Math.floor(prefix / 8);
  const remainder = prefix % 8;
  for (let index = 0; index < full; index += 1) {
    if (bytes[index] !== network[index]) return false;
  }
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return (bytes[full] & mask) === (network[full] & mask);
}

const IPV4_DENY = Object.freeze([
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].map(([address, prefix]) => Object.freeze({
  bytes: parseIpv4(address).bytes,
  prefix,
})));

const IPV6_DENY = Object.freeze([
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2620:4f:8000::', 48],
  ['3fff::', 20],
].map(([address, prefix]) => Object.freeze({
  bytes: parseIpv6(address).bytes,
  prefix,
})));

export function isPublicRoutableAddress(address) {
  const normalized = typeof address === 'string' ? normalizeIpAddress(address) : address;
  if (normalized === null || normalized === undefined) return false;
  if (normalized.family === 4) {
    return !IPV4_DENY.some((entry) => prefixMatches(normalized.bytes, entry.bytes, entry.prefix));
  }
  if (!prefixMatches(normalized.bytes, Uint8Array.from([0x20]), 3)) return false;
  return !IPV6_DENY.some((entry) => prefixMatches(normalized.bytes, entry.bytes, entry.prefix));
}

function sameAddress(left, right) {
  const normalized = normalizeIpAddress(left);
  return (
    normalized !== null &&
    normalized.family === right.family &&
    normalized.bytes.length === right.bytes.length &&
    normalized.bytes.every((byte, index) => byte === right.bytes[index])
  );
}

function rawFailure(attempt, state, kind, hopIndex) {
  if (!RAW_FAILURES.has(kind)) transportFailure(attempt, state, 'E_STREAM_IO', hopIndex);
  const mapping = {
    aborted: attempt.primaryError?.code ?? 'E_CANCELLED',
    'dns-io': 'E_DNS_IO',
    'tcp-io': 'E_TCP_IO',
    'tls-io': 'E_TLS_IO',
    'tls-identity': 'E_TLS_IDENTITY',
    'http-parse': 'E_STREAM_IO',
    'stream-io': 'E_STREAM_IO',
  };
  transportFailure(attempt, state, mapping[kind], hopIndex);
}

function responseShape(response) {
  return (
    exactObject(response, [
      'statusCode',
      'rawHeaders',
      'headerBytes',
      'remoteAddress',
      'body',
      'complete',
      'destroy',
    ]) &&
    (response.statusCode === null || Number.isInteger(response.statusCode)) &&
    Array.isArray(response.rawHeaders) &&
    response.rawHeaders.every((entry) => typeof entry === 'string') &&
    Number.isSafeInteger(response.headerBytes) &&
    response.headerBytes >= 0 &&
    (response.remoteAddress === null || typeof response.remoteAddress === 'string') &&
    response.body?.[Symbol.asyncIterator] !== undefined &&
    typeof response.complete === 'function' &&
    typeof response.destroy === 'function'
  );
}

function headerValues(rawHeaders, name) {
  if (rawHeaders.length % 2 !== 0) return null;
  const values = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const headerName = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(headerName) ||
      /[\u0000\u000a\u000d]/u.test(value)
    ) return null;
    if (headerName.toLowerCase() === name) values.push(value);
  }
  return values;
}

function classifiedStatus(status) {
  if (status === 200) return null;
  if (REDIRECT_STATUSES.has(status)) return 'redirect';
  if (status === 401 || status === 403 || status === 407) return 'E_HTTP_AUTH';
  if (status === 404) return 'E_HTTP_NOT_FOUND';
  if (status === 408) return 'E_HTTP_408';
  if (status === 425) return 'E_HTTP_425';
  if (status === 429) return 'E_HTTP_429';
  if (status >= 400 && status <= 499) return 'E_HTTP_OTHER_4XX';
  if (status >= 500 && status <= 599) return 'E_HTTP_5XX';
  return 'E_HTTP_UNEXPECTED_STATUS';
}

function declaredLength(response, expectedBytes, attempt, state, hopIndex) {
  const values = headerValues(response.rawHeaders, 'content-length');
  if (values === null) transportFailure(attempt, state, 'E_STREAM_IO', hopIndex);
  if (values.length === 0) return null;
  if (values.length !== 1 || !/^(?:0|[1-9][0-9]*)$/u.test(values[0])) {
    transportFailure(attempt, state, 'E_DECLARED_LENGTH', hopIndex);
  }
  const value = Number(values[0]);
  if (!Number.isSafeInteger(value)) transportFailure(attempt, state, 'E_DECLARED_LENGTH', hopIndex);
  state.declaredBytes = value;
  if (value !== expectedBytes) transportFailure(attempt, state, 'E_DECLARED_LENGTH', hopIndex);
  return value;
}

function validateEncoding(response, attempt, state, hopIndex) {
  const values = headerValues(response.rawHeaders, 'content-encoding');
  if (values === null) transportFailure(attempt, state, 'E_STREAM_IO', hopIndex);
  if (
    values.length > 1 ||
    (values.length === 1 && values[0].toLowerCase() !== 'identity')
  ) transportFailure(attempt, state, 'E_CONTENT_ENCODING', hopIndex);
}

function createHopTimer(clockPort, attempt, state, hopIndex, abortHop) {
  let rejectTimeout;
  const expired = new Promise((_, reject) => {
    rejectTimeout = reject;
  });
  const timer = clockPort.setTimeout(() => {
    const fixed = attempt.fix(new AcquisitionError('E_CONNECT_TIMEOUT', hopIndex));
    abortHop();
    rejectTimeout(new ModeBTransportError(fixed.code, frozenHead(state), fixed.hopIndex));
  }, LIMITS.connectMs);
  timer?.unref?.();
  return Object.freeze({
    expired,
    clear() { clockPort.clearTimeout(timer); },
  });
}

async function raceHop(operation, timer, attempt, state, hopIndex) {
  transportCheckpoint(attempt, state, hopIndex);
  try {
    const result = await Promise.race([operation, timer.expired]);
    transportCheckpoint(attempt, state, hopIndex);
    return result;
  } catch (error) {
    if (error instanceof ModeBTransportError) throw error;
    const fixed = attempt.fix(error, 'E_STREAM_IO', hopIndex);
    throw new ModeBTransportError(fixed.code, frozenHead(state), fixed.hopIndex);
  }
}

function responseBody(response, attempt, state, hopIndex, clockPort, cleanupAbortListener) {
  let idleReject;
  let idleTimer;
  let closed = false;
  const idleExpired = new Promise((_, reject) => { idleReject = reject; });
  idleExpired.catch(() => {});
  const cleanup = () => {
    if (idleTimer !== undefined) clockPort.clearTimeout(idleTimer);
    cleanupAbortListener();
  };
  const armIdle = () => {
    if (idleTimer !== undefined) clockPort.clearTimeout(idleTimer);
    idleTimer = clockPort.setTimeout(() => {
      const fixed = attempt.fix(new AcquisitionError('E_IDLE_TIMEOUT', hopIndex));
      response.destroy();
      idleReject(new ModeBTransportError(fixed.code, frozenHead(state), fixed.hopIndex));
    }, LIMITS.idleMs);
    idleTimer?.unref?.();
  };
  armIdle();
  const iterable = Object.freeze({
    async *[Symbol.asyncIterator]() {
      const iterator = response.body[Symbol.asyncIterator]();
      try {
        while (true) {
          transportCheckpoint(attempt, state, hopIndex);
          let item;
          try { item = await Promise.race([iterator.next(), idleExpired]); } catch (error) {
            if (error instanceof ModeBTransportError) throw error;
            rawFailure(attempt, state, attempt.primaryError === null ? 'stream-io' : 'aborted', hopIndex);
          }
          transportCheckpoint(attempt, state, hopIndex);
          if (item.done) {
            closed = true;
            cleanup();
            let complete = false;
            try { complete = response.complete() === true; } catch {
              transportFailure(attempt, state, 'E_STREAM_IO', hopIndex);
            }
            if (!complete) {
              transportFailure(attempt, state, 'E_TRUNCATED', hopIndex);
            }
            return;
          }
          if (!(item.value instanceof Uint8Array)) {
            transportFailure(attempt, state, 'E_STREAM_IO', hopIndex);
          }
          if (item.value.byteLength === 0) continue;
          armIdle();
          yield item.value;
        }
      } finally {
        cleanup();
        if (!closed) {
          response.destroy();
          void iterator.return?.().catch?.(() => {});
        }
      }
    },
  });
  return Object.freeze({
    iterable,
    abort() {
      if (closed) return;
      closed = true;
      cleanup();
      response.destroy();
    },
  });
}

function productionClockPort() {
  return Object.freeze({ setTimeout, clearTimeout });
}

export function createModeBTransportForTest(rawPort, clockPort = productionClockPort()) {
  if (
    !exactObject(rawPort, ['resolveAll', 'open']) ||
    typeof rawPort.resolveAll !== 'function' ||
    typeof rawPort.open !== 'function' ||
    !exactObject(clockPort, ['setTimeout', 'clearTimeout']) ||
    typeof clockPort.setTimeout !== 'function' ||
    typeof clockPort.clearTimeout !== 'function'
  ) throw new TypeError('invalid raw Mode-B transport port');

  return Object.freeze({
    async openModeBResponse({ locator, expectedBytes, attempt }) {
      const state = {
        sourceIdentity: null,
        redirectOrigins: [],
        finalOrigin: null,
        status: null,
        declaredBytes: null,
      };
      if (
        attempt === null ||
        typeof attempt !== 'object' ||
        typeof attempt.checkpoint !== 'function' ||
        typeof attempt.fix !== 'function'
      ) throw new TypeError('invalid Mode-B attempt guard');
      if (
        typeof locator !== 'string' ||
        !Number.isSafeInteger(expectedBytes) ||
        expectedBytes < 1 ||
        expectedBytes > LIMITS.bodyBytes
      ) transportFailure(attempt, state, 'E_URL_POLICY', 0);
      let current = authorizeUrl(locator, true, state, attempt, 0);
      state.sourceIdentity = current.href;

      for (let hopIndex = 0; hopIndex <= LIMITS.redirects; hopIndex += 1) {
        const hopAbort = new AbortController();
        const abortFromAttempt = () => hopAbort.abort();
        attempt.signal?.addEventListener('abort', abortFromAttempt, { once: true });
        if (attempt.signal?.aborted) hopAbort.abort();
        const timer = createHopTimer(clockPort, attempt, state, hopIndex, () => hopAbort.abort());
        let response;
        let bodyHandedOff = false;
        try {
          const resolution = await raceHop(
            rawPort.resolveAll(current.hostname, hopAbort.signal),
            timer,
            attempt,
            state,
            hopIndex,
          );
          if (
            !exactObject(resolution, ['ok', ...(resolution?.ok === true ? ['answers'] : ['kind'])]) ||
            typeof resolution.ok !== 'boolean'
          ) transportFailure(attempt, state, 'E_DNS_IO', hopIndex);
          if (!resolution.ok) rawFailure(attempt, state, resolution.kind, hopIndex);
          if (
            !Array.isArray(resolution.answers) ||
            resolution.answers.length > LIMITS.dnsAnswers
          ) transportFailure(attempt, state, 'E_ADDRESS_POLICY', hopIndex);
          if (resolution.answers.length === 0) {
            transportFailure(attempt, state, 'E_DNS_IO', hopIndex);
          }
          const answers = resolution.answers.map((answer) => {
            if (
              !exactObject(answer, ['address', 'family']) ||
              (answer.family !== 4 && answer.family !== 6) ||
              typeof answer.address !== 'string'
            ) transportFailure(attempt, state, 'E_ADDRESS_POLICY', hopIndex);
            const normalized = normalizeIpAddress(answer.address);
            if (
              normalized === null ||
              !isPublicRoutableAddress(normalized) ||
              (answer.family === 4 && isIP(answer.address) !== 4) ||
              (answer.family === 6 && isIP(answer.address) !== 6)
            ) transportFailure(attempt, state, 'E_ADDRESS_POLICY', hopIndex);
            return normalized;
          });
          const pinned = answers[0];
          const opened = await raceHop(
            rawPort.open(Object.freeze({
              hostname: current.hostname,
              pinnedAddress: pinned.text,
              family: pinned.family,
              port: 443,
              servername: current.hostname,
              method: 'GET',
              pathAndQuery: current.pathAndQuery,
              headers: Object.freeze([
                Object.freeze(['Host', current.hostname]),
                Object.freeze(['Accept-Encoding', 'identity']),
                Object.freeze(['Connection', 'close']),
              ]),
              maxHeaderBytes: LIMITS.headerBytes,
              signal: hopAbort.signal,
            })),
            timer,
            attempt,
            state,
            hopIndex,
          );
          if (
            !exactObject(opened, ['ok', ...(opened?.ok === true ? ['response'] : ['kind'])]) ||
            typeof opened.ok !== 'boolean'
          ) transportFailure(attempt, state, 'E_STREAM_IO', hopIndex);
          if (!opened.ok) rawFailure(attempt, state, opened.kind, hopIndex);
          response = opened.response;
          if (
            !responseShape(response) ||
            response.headerBytes > LIMITS.headerBytes
          ) transportFailure(attempt, state, 'E_STREAM_IO', hopIndex);
          if (!sameAddress(response.remoteAddress, pinned)) {
            transportFailure(attempt, state, 'E_TLS_IDENTITY', hopIndex);
          }
          state.finalOrigin = current.origin;
          const status = response.statusCode;
          if (!Number.isInteger(status) || status < 100 || status > 999) {
            state.status = null;
            response.destroy();
            transportFailure(attempt, state, 'E_STREAM_IO', hopIndex);
          }
          state.status = status;
          timer.clear();

          const classification = classifiedStatus(status);
          if (classification === 'redirect') {
            const locations = headerValues(response.rawHeaders, 'location');
            response.destroy();
            if (
              locations === null ||
              locations.length !== 1 ||
              state.redirectOrigins.length >= LIMITS.redirects
            ) transportFailure(attempt, state, 'E_REDIRECT_POLICY', hopIndex);
            let nextValue;
            if (!validRawLocation(locations[0])) {
              transportFailure(attempt, state, 'E_REDIRECT_POLICY', hopIndex);
            }
            try { nextValue = new URL(locations[0], current.href).href; } catch {
              transportFailure(attempt, state, 'E_REDIRECT_POLICY', hopIndex);
            }
            const next = authorizeUrl(nextValue, false, state, attempt, hopIndex);
            state.redirectOrigins.push(next.origin);
            state.status = null;
            state.declaredBytes = null;
            current = next;
            continue;
          }
          if (classification !== null) {
            response.destroy();
            transportFailure(attempt, state, classification, hopIndex);
          }

          try {
            state.declaredBytes = declaredLength(
              response,
              expectedBytes,
              attempt,
              state,
              hopIndex,
            );
            validateEncoding(response, attempt, state, hopIndex);
          } catch (error) {
            response.destroy();
            throw error;
          }
          const head = frozenHead(state);
          const bodyController = responseBody(
            response,
            attempt,
            state,
            hopIndex,
            clockPort,
            () => attempt.signal?.removeEventListener('abort', abortFromAttempt),
          );
          bodyHandedOff = true;
          return Object.freeze({
            head,
            body: bodyController.iterable,
            abort: bodyController.abort,
          });
        } finally {
          timer.clear();
          if (!bodyHandedOff) {
            hopAbort.abort();
            attempt.signal?.removeEventListener('abort', abortFromAttempt);
            try { response?.destroy?.(); } catch { /* fixed transport outcome remains */ }
          }
        }
      }
      transportFailure(attempt, state, 'E_REDIRECT_POLICY', LIMITS.redirects);
    },
  });
}
