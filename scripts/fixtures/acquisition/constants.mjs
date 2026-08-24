import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const ACQUISITION_RELATIVE_ROOT = '.artifacts/acquisition';
export const ACQUISITION_ROOT = resolve(REPOSITORY_ROOT, '.artifacts', 'acquisition');

export const DESCRIPTOR_SCHEMA_VERSION = 'g0-fixture-release-restore-1';
export const DESCRIPTOR_SCHEMA_PATH = 'fixtures/acquisition/schema/g0-fixture-release-restore-1.schema.json';
export const RECEIPT_SCHEMA_VERSION = 'g0-fixture-release-restore-receipt-1';
export const RECEIPT_SCHEMA_PATH = 'fixtures/acquisition/schema/g0-fixture-release-restore-receipt-1.schema.json';
export const DESCRIPTOR_ROOT = 'fixtures/acquisition/descriptors/';

export const MODE_B_ORIGINS = Object.freeze([
  'https://github.com:443',
  'https://release-assets.githubusercontent.com:443',
]);

export const LIMITS = Object.freeze({
  bodyBytes: 2 * 1024 * 1024 * 1024,
  bodyProbeBytes: 2 * 1024 * 1024 * 1024 + 1,
  connectMs: 15_000,
  idleMs: 30_000,
  overallMs: 30 * 60 * 1000,
  redirects: 5,
  headerBytes: 64 * 1024,
  dnsAnswers: 16,
  descriptorBytes: 64 * 1024,
  receiptBytes: 128 * 1024,
  rootBytes: 6n * 1024n * 1024n * 1024n,
  freeHeadroomBytes: 512n * 1024n * 1024n,
  directoryEntries: 1_000,
  jsonDepth: 8,
  jsonMembers: 128,
  jsonArrayItems: 16,
  jsonStringCodeUnits: 2_048,
  gitMetadataBytes: 2_048,
  gitTimeoutMs: 120_000,
});

export const FALSE_CREDIT = Object.freeze({
  stableFixtureIdentity: false,
  registryAdopted: false,
  g0Credit: false,
  rendererOrProfileRatified: false,
  deviceEvidence: false,
});

export const TIER_NAMES = Object.freeze([
  'partial',
  'unverified',
  'verified-transport',
  'receipts',
]);
