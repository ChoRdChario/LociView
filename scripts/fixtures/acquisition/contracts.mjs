import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  DESCRIPTOR_SCHEMA_PATH,
  DESCRIPTOR_SCHEMA_VERSION,
  FALSE_CREDIT,
  LIMITS,
  MODE_B_ORIGINS,
  RECEIPT_SCHEMA_PATH,
  RECEIPT_SCHEMA_VERSION,
  REPOSITORY_ROOT,
} from './constants.mjs';
import { errorDefinition, fail } from './errors.mjs';
import { parseBoundedJsonBytes } from './json.mjs';
import { readTrustedDescriptorBytes } from './repository.mjs';

const MODE_B_LOCATOR =
  /^https:\/\/github\.com\/ChoRdChario\/LociView\/releases\/download\/fixtures-v[0-9]+(?:\.[0-9]+)*\/(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$))[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9])?(?![\s\S])/iu;
const STRICT_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u;
const PORTABLE_ID = /^[a-z0-9][a-z0-9._-]{2,95}(?![\s\S])/u;
const SHA256 = /^[0-9a-f]{64}(?![\s\S])/u;
const NO_RECEIPT_CODES = new Set(['E_USAGE', 'E_DESCRIPTOR', 'E_SCHEMA', 'E_LOCK_BUSY']);
const STATUS_FAILURE_CODES = new Set([
  'E_REDIRECT_POLICY',
  'E_HTTP_AUTH',
  'E_HTTP_NOT_FOUND',
  'E_HTTP_OTHER_4XX',
  'E_HTTP_UNEXPECTED_STATUS',
  'E_HTTP_408',
  'E_HTTP_425',
  'E_HTTP_429',
  'E_HTTP_5XX',
]);
const EXACT_MATCH_FAILURE_CODES = new Set([
  'E_OVERALL_TIMEOUT',
  'E_LOCAL_IO',
  'E_CONTAINMENT',
  'E_LINK',
  'E_CACHE_MISMATCH',
  'E_PUBLISH_CONFLICT',
  'E_RECEIPT_SCHEMA',
  'E_RECEIPT_PRIVACY',
  'E_RECEIPT_IO',
]);
const PRIVACY_PATTERNS = Object.freeze([
  /(?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=]/iu,
  /(?:x-amz-(?:signature|credential|security-token)|x-goog-(?:signature|credential))/iu,
  /[?&](?:access[_-]?token|api[_-]?key|auth|credential|password|secret|signature|token)=/iu,
  /https?:\/\/[^/\s]*@/iu,
]);

let descriptorValidator;
let receiptValidator;

function strictUtc(value) {
  if (typeof value !== 'string' || STRICT_UTC.exec(value) === null) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function compileSchema(relativePath, maximumBytes, failureCode) {
  try {
    const bytes = readFileSync(resolve(REPOSITORY_ROOT, ...relativePath.split('/')));
    if (bytes.byteLength > maximumBytes) fail(failureCode);
    const schema = JSON.parse(bytes.toString('utf8'));
    const ajv = new Ajv2020({
      strict: true,
      allErrors: false,
      validateFormats: true,
      allowUnionTypes: false,
      coerceTypes: false,
      removeAdditional: false,
      useDefaults: false,
      $data: false,
    });
    ajv.addFormat('strict-utc', { type: 'string', validate: strictUtc });
    return ajv.compile(schema);
  } catch (error) {
    fail(failureCode, null, error);
  }
}

function getDescriptorValidator() {
  descriptorValidator ??= compileSchema(DESCRIPTOR_SCHEMA_PATH, LIMITS.descriptorBytes, 'E_SCHEMA');
  return descriptorValidator;
}

function getReceiptValidator() {
  receiptValidator ??= compileSchema(RECEIPT_SCHEMA_PATH, LIMITS.receiptBytes, 'E_RECEIPT_SCHEMA');
  return receiptValidator;
}

function wellFormed(value) {
  if (typeof value.isWellFormed === 'function') return value.isWellFormed();
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function inspectStrings(value, failureCode, isUrlPath, path = []) {
  if (typeof value === 'string') {
    if (!wellFormed(value) || (!isUrlPath(path) && value.length > LIMITS.jsonStringCodeUnits)) {
      fail(failureCode);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectStrings(entry, failureCode, isUrlPath, [...path, index]));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (!wellFormed(key) || key.length > LIMITS.jsonStringCodeUnits) fail(failureCode);
      inspectStrings(entry, failureCode, isUrlPath, [...path, key]);
    }
  }
}

function descriptorUrlPath(path) {
  return path.length === 1 && path[0] === 'locator';
}

function receiptUrlPath(path) {
  return (
    (path.length === 1 && path[0] === 'sourceIdentity') ||
    (path.length === 2 && path[0] === 'transport' && path[1] === 'finalOrigin') ||
    (path.length === 3 && path[0] === 'transport' && path[1] === 'redirectOrigins')
  );
}

function assertCanonicalLocator(locator, failureCode) {
  if (typeof locator !== 'string' || !MODE_B_LOCATOR.test(locator)) fail(failureCode);
  let parsed;
  try { parsed = new URL(locator); } catch (error) { fail(failureCode, null, error); }
  if (
    parsed.href !== locator ||
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.host !== 'github.com' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) fail(failureCode);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

function schemaValid(validator, value, failureCode) {
  let valid = false;
  try { valid = validator(value) === true; } catch (error) { fail(failureCode, null, error); }
  if (!valid) fail(failureCode);
}

export function validateModeBDescriptorObject(value) {
  schemaValid(getDescriptorValidator(), value, 'E_SCHEMA');
  inspectStrings(value, 'E_SCHEMA', descriptorUrlPath);
  if (!PORTABLE_ID.test(value.requestId) || !SHA256.test(value.expectedSha256)) fail('E_SCHEMA');
  assertCanonicalLocator(value.locator, 'E_URL_POLICY');
  return deepFreeze(value);
}

export function parseModeBDescriptorBytes(bytes) {
  return validateModeBDescriptorObject(parseBoundedJsonBytes(bytes, LIMITS.descriptorBytes, 'E_SCHEMA'));
}

export async function loadTrustedModeBDescriptor(
  descriptorPath,
  repositoryRoot = REPOSITORY_ROOT,
  attemptControl = undefined,
) {
  attemptControl?.checkpoint();
  const trusted = await readTrustedDescriptorBytes(descriptorPath, repositoryRoot, attemptControl);
  attemptControl?.checkpoint();
  const value = parseModeBDescriptorBytes(trusted.bytes);
  attemptControl?.checkpoint();
  return Object.freeze({
    path: trusted.path,
    absolutePath: trusted.absolutePath,
    sha256: trusted.sha256,
    value,
  });
}

function walkStrings(value, visit) {
  if (typeof value === 'string') {
    visit(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => walkStrings(entry, visit));
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((entry) => walkStrings(entry, visit));
  }
}

export function validateReceiptPrivacy(receipt) {
  let bad = false;
  walkStrings(receipt, (value) => {
    if (
      PRIVACY_PATTERNS.some((pattern) => pattern.test(value)) ||
      (
        /^https?:\/\//iu.test(value) &&
        value !== receipt.sourceIdentity &&
        !MODE_B_ORIGINS.includes(value)
      )
    ) bad = true;
  });
  if (bad) fail('E_RECEIPT_PRIVACY');
  return receipt;
}

function statusFailureCode(status) {
  if (status === 200) return null;
  if ([301, 302, 303, 307, 308].includes(status)) return 'E_REDIRECT_POLICY';
  if (status === 401 || status === 403 || status === 407) return 'E_HTTP_AUTH';
  if (status === 404) return 'E_HTTP_NOT_FOUND';
  if (status === 408) return 'E_HTTP_408';
  if (status === 425) return 'E_HTTP_425';
  if (status === 429) return 'E_HTTP_429';
  if (status >= 400 && status <= 499) return 'E_HTTP_OTHER_4XX';
  if (status >= 500 && status <= 599) return 'E_HTTP_5XX';
  return 'E_HTTP_UNEXPECTED_STATUS';
}

export function verifiedCacheRelativePath(sha256) {
  return `verified-transport/sha256-${sha256}.blob`;
}

function assertReceiptSemantics(receipt, descriptorContext) {
  const descriptor = descriptorContext.value;
  if (
    !PORTABLE_ID.test(receipt.requestId) ||
    !PORTABLE_ID.test(receipt.attemptId) ||
    !SHA256.test(receipt.descriptor.sha256) ||
    (receipt.transport.measuredSha256 !== null && !SHA256.test(receipt.transport.measuredSha256))
  ) fail('E_RECEIPT_SCHEMA');
  if (
    receipt.descriptor.path !== descriptorContext.path ||
    receipt.descriptor.sha256 !== descriptorContext.sha256 ||
    receipt.requestId !== descriptor.requestId
  ) fail('E_RECEIPT_SCHEMA');

  assertCanonicalLocator(descriptor.locator, 'E_RECEIPT_SCHEMA');
  if (
    receipt.sourceIdentity !== null &&
    receipt.sourceIdentity !== descriptor.locator
  ) fail('E_RECEIPT_SCHEMA');
  const stableIdentity = receipt.sourceIdentity === descriptor.locator;
  if (receipt.stableTransportIdentity !== stableIdentity) fail('E_RECEIPT_SCHEMA');

  const transport = receipt.transport;
  if (
    transport.redirectCount !== transport.redirectOrigins.length ||
    transport.redirectOrigins.some((origin) => !MODE_B_ORIGINS.includes(origin))
  ) fail('E_RECEIPT_SCHEMA');
  if (transport.status !== null && transport.finalOrigin === null) fail('E_RECEIPT_SCHEMA');
  if (
    (transport.measuredBytes > 0 || transport.streamEnded) &&
    transport.status !== 200
  ) fail('E_RECEIPT_SCHEMA');
  if (transport.measuredBytes > descriptor.expectedBytes + 1) fail('E_RECEIPT_SCHEMA');
  if (transport.streamEnded && transport.measuredBytes > descriptor.expectedBytes) {
    fail('E_RECEIPT_SCHEMA');
  }

  const tupleMatches = (
    transport.streamEnded &&
    transport.measuredBytes === descriptor.expectedBytes &&
    transport.measuredSha256 === descriptor.expectedSha256
  );
  if (
    (!transport.streamEnded && transport.expectedMatch !== null) ||
    (transport.streamEnded && transport.expectedMatch !== tupleMatches)
  ) fail('E_RECEIPT_SCHEMA');

  if (
    transport.declaredBytes !== null &&
    transport.declaredBytes !== descriptor.expectedBytes &&
    receipt.error?.code !== 'E_DECLARED_LENGTH'
  ) fail('E_RECEIPT_SCHEMA');

  const expectedLocalPath = verifiedCacheRelativePath(descriptor.expectedSha256);
  if (
    receipt.local.relativePath !== null &&
    receipt.local.relativePath !== expectedLocalPath
  ) fail('E_RECEIPT_SCHEMA');

  if (Date.parse(receipt.startedAtUtc) > Date.parse(receipt.completedAtUtc)) {
    fail('E_RECEIPT_SCHEMA');
  }

  if (receipt.error !== null) {
    if (NO_RECEIPT_CODES.has(receipt.error.code)) fail('E_RECEIPT_SCHEMA');
    const definition = errorDefinition(receipt.error.code);
    if (
      receipt.error.exitCode !== definition.exitCode ||
      receipt.error.retryable !== definition.retryable ||
      (receipt.error.hopIndex !== null && receipt.error.hopIndex > transport.redirectCount)
    ) fail('E_RECEIPT_SCHEMA');
    if (
      transport.status !== null &&
      transport.status !== 200 &&
      receipt.error.code !== statusFailureCode(transport.status)
    ) fail('E_RECEIPT_SCHEMA');
    if (
      STATUS_FAILURE_CODES.has(receipt.error.code) &&
      (
        transport.status === null ||
        transport.status === 200 ||
        receipt.error.code !== statusFailureCode(transport.status)
      )
    ) fail('E_RECEIPT_SCHEMA');
    if (
      receipt.error.code === 'E_DECLARED_LENGTH' &&
      (
        transport.status !== 200 ||
        transport.declaredBytes === descriptor.expectedBytes ||
        transport.measuredBytes !== 0 ||
        transport.measuredSha256 !== null ||
        transport.streamEnded ||
        transport.expectedMatch !== null
      )
    ) fail('E_RECEIPT_SCHEMA');
    if (
      receipt.error.code === 'E_CONTENT_ENCODING' &&
      (
        transport.status !== 200 ||
        (transport.declaredBytes !== null && transport.declaredBytes !== descriptor.expectedBytes) ||
        transport.measuredBytes !== 0 ||
        transport.measuredSha256 !== null ||
        transport.streamEnded ||
        transport.expectedMatch !== null
      )
    ) fail('E_RECEIPT_SCHEMA');
    if (
      receipt.error.code === 'E_EXTRA_BYTES' &&
      (
        transport.streamEnded ||
        transport.measuredBytes !== descriptor.expectedBytes + 1 ||
        transport.measuredSha256 !== null ||
        transport.expectedMatch !== null
      )
    ) fail('E_RECEIPT_SCHEMA');
    if (
      receipt.error.code === 'E_DIGEST_MISMATCH' &&
      (
        !transport.streamEnded ||
        transport.measuredBytes !== descriptor.expectedBytes ||
        transport.measuredSha256 === descriptor.expectedSha256 ||
        transport.expectedMatch !== false
      )
    ) fail('E_RECEIPT_SCHEMA');
    if (
      receipt.error.code === 'E_TRUNCATED' &&
      (
        transport.status !== 200 ||
        transport.measuredBytes > descriptor.expectedBytes ||
        (
          transport.streamEnded &&
          (
            transport.measuredBytes >= descriptor.expectedBytes ||
            transport.measuredSha256 === null ||
            transport.expectedMatch !== false
          )
        ) ||
        (
          !transport.streamEnded &&
          (transport.measuredSha256 !== null || transport.expectedMatch !== null)
        )
      )
    ) fail('E_RECEIPT_SCHEMA');
    if (receipt.error.code === 'E_OVERSIZE') fail('E_RECEIPT_SCHEMA');
    if (transport.streamEnded && transport.expectedMatch === false) {
      const requiredCode = transport.measuredBytes < descriptor.expectedBytes
        ? 'E_TRUNCATED'
        : 'E_DIGEST_MISMATCH';
      if (receipt.error.code !== requiredCode) fail('E_RECEIPT_SCHEMA');
    }
    if (transport.expectedMatch === true && !EXACT_MATCH_FAILURE_CODES.has(receipt.error.code)) {
      fail('E_RECEIPT_SCHEMA');
    }
  }

  if (
    receipt.stableFixtureIdentity !== FALSE_CREDIT.stableFixtureIdentity ||
    receipt.registryAdopted !== FALSE_CREDIT.registryAdopted ||
    receipt.g0Credit !== FALSE_CREDIT.g0Credit ||
    receipt.rendererOrProfileRatified !== FALSE_CREDIT.rendererOrProfileRatified ||
    receipt.deviceEvidence !== FALSE_CREDIT.deviceEvidence
  ) fail('E_RECEIPT_SCHEMA');

  return receipt;
}

export function validateModeBReceiptObject(receipt, descriptorContext) {
  if (
    descriptorContext === null ||
    typeof descriptorContext !== 'object' ||
    descriptorContext.value?.schemaVersion !== DESCRIPTOR_SCHEMA_VERSION
  ) fail('E_RECEIPT_SCHEMA');
  schemaValid(getReceiptValidator(), receipt, 'E_RECEIPT_SCHEMA');
  inspectStrings(receipt, 'E_RECEIPT_SCHEMA', receiptUrlPath);
  validateReceiptPrivacy(receipt);
  assertReceiptSemantics(receipt, descriptorContext);
  return deepFreeze(receipt);
}

export function parseModeBReceiptEnvelope(bytes) {
  const receipt = parseBoundedJsonBytes(bytes, LIMITS.receiptBytes, 'E_RECEIPT_SCHEMA');
  schemaValid(getReceiptValidator(), receipt, 'E_RECEIPT_SCHEMA');
  inspectStrings(receipt, 'E_RECEIPT_SCHEMA', receiptUrlPath);
  validateReceiptPrivacy(receipt);
  if (
    !PORTABLE_ID.test(receipt.requestId) ||
    !PORTABLE_ID.test(receipt.attemptId) ||
    !SHA256.test(receipt.descriptor.sha256) ||
    (receipt.transport.measuredSha256 !== null && !SHA256.test(receipt.transport.measuredSha256))
  ) fail('E_RECEIPT_SCHEMA');
  return deepFreeze(receipt);
}

export function parseModeBReceiptBytes(bytes, descriptorContext) {
  const receipt = parseModeBReceiptEnvelope(bytes);
  return validateModeBReceiptObject(receipt, descriptorContext);
}

export function modeBReceiptIdentity() {
  return Object.freeze({
    schemaPath: RECEIPT_SCHEMA_PATH,
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    mode: 'release-restore',
    trustTier: 'pre-adoption-transport-only',
  });
}
