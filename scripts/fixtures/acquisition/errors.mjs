const DEFINITIONS = Object.freeze({
  E_USAGE: [2, false],
  E_DESCRIPTOR: [2, false],
  E_SCHEMA: [2, false],
  E_URL_POLICY: [3, false],
  E_REDIRECT_POLICY: [3, false],
  E_ADDRESS_POLICY: [3, false],
  E_SECRET_POLICY: [3, false],
  E_DNS_IO: [4, true],
  E_TCP_IO: [4, true],
  E_TLS_IO: [4, true],
  E_STREAM_IO: [4, true],
  E_TLS_IDENTITY: [4, false],
  E_HTTP_AUTH: [4, false],
  E_HTTP_NOT_FOUND: [4, false],
  E_HTTP_OTHER_4XX: [4, false],
  E_HTTP_UNEXPECTED_STATUS: [4, false],
  E_HTTP_408: [4, true],
  E_HTTP_425: [4, true],
  E_HTTP_429: [4, true],
  E_HTTP_5XX: [4, true],
  E_CONTENT_ENCODING: [4, false],
  E_CANCELLED: [4, false],
  E_CONNECT_TIMEOUT: [4, true],
  E_IDLE_TIMEOUT: [4, true],
  E_OVERALL_TIMEOUT: [4, true],
  E_DECLARED_LENGTH: [5, false],
  E_OVERSIZE: [5, false],
  E_EXTRA_BYTES: [5, false],
  E_DIGEST_MISMATCH: [5, false],
  E_TRUNCATED: [5, true],
  E_LOCK_BUSY: [6, true],
  E_NO_SPACE: [6, true],
  E_LOCAL_IO: [6, true],
  E_CONTAINMENT: [6, false],
  E_LINK: [6, false],
  E_CACHE_MISMATCH: [6, false],
  E_PUBLISH_CONFLICT: [6, false],
  E_RECEIPT_SCHEMA: [6, false],
  E_RECEIPT_PRIVACY: [6, false],
  E_RECEIPT_IO: [6, true],
});

export const ERROR_CODES = Object.freeze(Object.keys(DEFINITIONS));

export class AcquisitionError extends Error {
  constructor(code, hopIndex = null, options = undefined) {
    if (!Object.hasOwn(DEFINITIONS, code)) throw new TypeError('unknown acquisition error code');
    super(code, options);
    this.name = 'AcquisitionError';
    this.code = code;
    this.hopIndex = Number.isInteger(hopIndex) && hopIndex >= 0 ? hopIndex : null;
  }
}

export function errorDefinition(code) {
  const definition = DEFINITIONS[code];
  if (definition === undefined) throw new TypeError('unknown acquisition error code');
  return Object.freeze({ exitCode: definition[0], retryable: definition[1] });
}

export function publicError(error) {
  const normalized = error instanceof AcquisitionError ? error : new AcquisitionError('E_LOCAL_IO');
  const definition = errorDefinition(normalized.code);
  return Object.freeze({
    code: normalized.code,
    exitCode: definition.exitCode,
    retryable: definition.retryable,
    hopIndex: normalized.hopIndex,
  });
}

export function fail(code, hopIndex = null, cause = undefined) {
  throw new AcquisitionError(code, hopIndex, cause === undefined ? undefined : { cause });
}

export function normalizeError(error, fallbackCode, hopIndex = null) {
  return error instanceof AcquisitionError ? error : new AcquisitionError(fallbackCode, hopIndex, { cause: error });
}
