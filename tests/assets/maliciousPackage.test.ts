import { beforeAll, describe, expect, it, vi } from 'vitest';
import { importNewProject, inspectZip, mergeFromInspection } from '../../src/assets/package';
import { applyImportPlan, buildImportPlan } from '../../src/assets/importWizard';
import {
  readZipEntries,
  ZipGuardError,
  type ZipLimits,
} from '../../src/assets/zipio';
import { SCHEMA_VERSION } from '../../src/core/manifest';
import { actorIdFrom } from '../../src/core/ids';
import { visibleEntities } from '../../src/core/reduce';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import {
  rawZipEntryShapes,
  writeDirectZip,
  writeZipWithMismatchedLocalName,
  writeZipWithAliasedEntryName,
  type RawZipEntryShape,
} from '../helpers/maliciousZip';
import {
  objectIntrinsicsMatch,
  restoreObjectIntrinsics,
  snapshotObjectIntrinsics,
} from '../helpers/objectIntrinsics';

const encoder = new TextEncoder();
const USER: Identity = {
  userId: 'usr_00000000000000000000000090',
  deviceId: 'dev_00000000000000000000000090',
  displayName: '検証者',
};
const CONTROL_PATH = 'projects/control/keep.bin';
const CONTROL_BYTES = encoder.encode('control-project-must-not-change');
const FIXED_CREATED_AT = '2026-01-02T03:04:05.000Z';
const PROJECT_ID = 'prj_00000000000000000000000090';
const MIXED_ACTOR = actorIdFrom(USER.userId, USER.deviceId);
const MIXED_USER_ID = USER.userId;
const MIXED_CAPTION_ID = 'cap_00000000000000000000000091';
const BASE_CAPTION_ID = 'cap_00000000000000000000000092';
const MIXED_BINARY_PATH = 'media/mixed-valid-member.bin';
const MALFORMED_RAW_FILENAME = new Uint8Array([
  ...encoder.encode('media/'),
  0xc3,
  0x28,
  ...encoder.encode('.bin'),
]);
const UNIX_TYPE_MASK = 0o170000;
const UNIX_SYMLINK_MODE = 0o120777;
const UNIX_FIFO_MODE = 0o010644;

class CountingMemoryFS extends MemoryFS {
  mutationCalls = 0;
  readonly mutationPaths: string[] = [];

  resetMutationCalls(): void {
    this.mutationCalls = 0;
    this.mutationPaths.length = 0;
  }

  private recordMutation(path: string): void {
    this.mutationCalls += 1;
    this.mutationPaths.push(path);
  }

  override async writeText(path: string, text: string): Promise<void> {
    this.recordMutation(path);
    await super.writeText(path, text);
  }

  override async appendText(path: string, text: string): Promise<void> {
    this.recordMutation(path);
    await super.appendText(path, text);
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.recordMutation(path);
    await super.writeBytes(path, data);
  }

  override async remove(path: string): Promise<void> {
    this.recordMutation(path);
    await super.remove(path);
  }
}

type FixtureId =
  | 'unsafe-traversal'
  | 'invalid-manifest-schema'
  | 'nested-archive'
  | 'encrypted-entry'
  | 'unsupported-compression'
  | 'mixed-valid-invalid'
  | 'raw-duplicate-path'
  | 'raw-duplicate-path-reversed'
  | 'normalized-separator-collision'
  | 'unicode-normalization-collision'
  | 'unicode-normalization-collision-reversed'
  | 'platform-case-collision'
  | 'platform-case-collision-reversed'
  | 'duplicate-manifest'
  | 'duplicate-manifest-reversed'
  | 'invalid-utf8-manifest'
  | 'future-schema'
  | 'malformed-utf8-entry-name'
  | 'symlink-entry'
  | 'special-mode-entry'
  | 'unsafe-directory-path'
  | 'directory-count-bypass'
  | 'local-central-name-mismatch';

type ManifestAmbiguityId =
  | 'duplicate-json-member'
  | 'manifest-decoded-duplicate-top-forward'
  | 'manifest-decoded-duplicate-top-reverse'
  | 'manifest-decoded-duplicate-nested-forward'
  | 'manifest-decoded-duplicate-nested-reverse'
  | 'manifest-nfc-collision-top-forward'
  | 'manifest-nfc-collision-top-reverse'
  | 'manifest-nfc-collision-nested-forward'
  | 'manifest-nfc-collision-nested-reverse';

type ManifestScalarId =
  | 'manifest-lone-high-surrogate-name'
  | 'manifest-lone-low-surrogate-nested-key';

type ManifestReservedId =
  | 'manifest-reserved-dunder-proto-root'
  | 'manifest-reserved-dunder-proto-nested'
  | 'manifest-reserved-dunder-proto-deep'
  | 'manifest-reserved-prototype-root'
  | 'manifest-reserved-prototype-nested'
  | 'manifest-reserved-prototype-deep'
  | 'manifest-reserved-constructor-root'
  | 'manifest-reserved-constructor-nested'
  | 'manifest-reserved-constructor-deep';

interface ImportAttempt {
  inspectionRejected: boolean;
  inspectionError: unknown;
  importRejected: boolean;
  active: boolean;
  candidateFiles: string[];
  mutationCalls: number;
  completionMarkerMutationCount: number;
  controlUnchanged: boolean;
  mixedValidCaptionVisible: boolean;
}

interface ForeignImportAttempt {
  inspectionRejected: boolean;
  mutationCalls: number;
  activeMarkerCount: number;
}

interface ExistingMergeAttempt {
  rawLogUnchanged: boolean;
  allOpsUnchanged: boolean;
  stateUnchanged: boolean;
  reopenedStateUnchanged: boolean;
  internalClockAndSequenceUnchanged: boolean;
  authoritativeUnchanged: boolean;
}

interface RawManifestMember {
  rawKey: string;
  value: string;
}

interface ManifestAmbiguityCase {
  id: ManifestAmbiguityId;
  relation: 'exact-duplicate' | 'decoded-equivalent' | 'nfc-collision';
  depth: 'top-level' | 'nested';
  members: readonly [RawManifestMember, RawManifestMember];
  manifestText: string;
}

interface ManifestAmbiguityResult {
  initialized: boolean;
  controlUnchanged: boolean;
  completionMarkerNeverPublished: boolean;
  sentinelNeverActive: boolean;
  existingAuthorityUnchanged: boolean;
}

interface ManifestScalarCase {
  id: ManifestScalarId;
  location: 'known-name-value' | 'unknown-nested-key';
  escapedScalar: '\\uD83D' | '\\uDE00';
  manifestText: string;
}

type ManifestScalarResult = ManifestAmbiguityResult;

interface ManifestReservedCase {
  id: ManifestReservedId;
  decodedKey: '__proto__' | 'prototype' | 'constructor';
  depth: 'root' | 'nested' | 'deep';
  rawKey: string;
  pollutionProperty: string;
  manifestText: string;
}

interface ManifestReservedResult extends ManifestAmbiguityResult {
  objectIntrinsicsIntact: boolean;
}

function bytesEqual(left: Uint8Array | null, right: Uint8Array): boolean {
  return left !== null && left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function manifestBytes(overrides: Readonly<Record<string, unknown>> = {}): Uint8Array {
  return encoder.encode(JSON.stringify({
    format: 'lociview-project',
    schemaVersion: SCHEMA_VERSION,
    projectId: PROJECT_ID,
    name: 'malicious envelope fixture',
    createdAt: FIXED_CREATED_AT,
    generator: 'LociView/test',
    ...overrides,
  }));
}

function replaceBytesOnce(source: Uint8Array, marker: Uint8Array, replacement: Uint8Array): Uint8Array {
  let foundAt = -1;
  for (let offset = 0; offset <= source.length - marker.length; offset += 1) {
    let matches = true;
    for (let index = 0; index < marker.length; index += 1) {
      if (source[offset + index] !== marker[index]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    if (foundAt !== -1) throw new Error('invalid UTF-8 fixture marker is not unique');
    foundAt = offset;
  }
  if (foundAt === -1) throw new Error('invalid UTF-8 fixture marker is missing');

  const result = new Uint8Array(source.length - marker.length + replacement.length);
  result.set(source.subarray(0, foundAt), 0);
  result.set(replacement, foundAt);
  result.set(source.subarray(foundAt + marker.length), foundAt + replacement.length);
  return result;
}

function invalidUtf8ManifestBytes(): Uint8Array {
  const marker = '__INVALID_UTF8_NAME__';
  const valid = manifestBytes({ name: marker });
  // C3 must be followed by a continuation byte; 28 is ASCII '('. A non-fatal
  // TextDecoder replaces the bad byte and leaves the JSON syntactically valid.
  return replaceBytesOnce(valid, encoder.encode(marker), new Uint8Array([0xc3, 0x28]));
}

function validMixedOpLine(): string {
  return JSON.stringify({
    op: 2,
    hlc: `2099-01-02T03:04:05.000Z-0000-${MIXED_ACTOR}`,
    actor: MIXED_ACTOR,
    user: MIXED_USER_ID,
    t: 'create',
    e: 'caption',
    id: MIXED_CAPTION_ID,
    v: { title: 'valid member must not activate alone' },
  });
}

function baseTargetOpLine(): string {
  return JSON.stringify({
    op: 1,
    hlc: `2098-01-02T03:04:04.000Z-0000-${MIXED_ACTOR}`,
    actor: MIXED_ACTOR,
    user: MIXED_USER_ID,
    t: 'create',
    e: 'caption',
    id: BASE_CAPTION_ID,
    v: { title: 'existing target member' },
  });
}

function mixedOpsWireText(): string {
  return `${baseTargetOpLine()}\n${validMixedOpLine()}\n{"op":\n`;
}

function containsBytes(source: Uint8Array | null, needle: Uint8Array): boolean {
  if (source === null) return false;
  for (let offset = 0; offset <= source.length - needle.length; offset += 1) {
    if (needle.every((byte, index) => source[offset + index] === byte)) return true;
  }
  return false;
}

async function attemptNewProject(
  id: FixtureId | ManifestAmbiguityId | ManifestScalarId | ManifestReservedId,
  zip: Uint8Array,
  limits?: ZipLimits,
): Promise<ImportAttempt> {
  const fs = new CountingMemoryFS();
  const dir = `projects/malicious-${id}`;
  await fs.writeBytes(CONTROL_PATH, CONTROL_BYTES);
  const controlInventoryBefore = await fs.list('projects/control/');
  fs.resetMutationCalls();

  let inspectionRejected = false;
  let inspectionError: unknown = null;
  let importRejected = false;
  let inspection: Awaited<ReturnType<typeof inspectZip>> | null = null;
  try {
    inspection = await inspectZip(zip, limits);
  } catch (error) {
    inspectionRejected = true;
    inspectionError = error;
  }
  if (inspection !== null) {
    try {
      await importNewProject(fs, dir, inspection);
    } catch {
      importRejected = true;
    }
  }

  const active = await fs.exists(`${dir}/lociview.json`);
  let mixedValidCaptionVisible = false;
  if (active) {
    try {
      const store = await ProjectStore.open(fs, dir, USER);
      mixedValidCaptionVisible = visibleEntities(store.state, 'caption')
        .some(({ id: captionId }) => captionId === MIXED_CAPTION_ID);
    } catch {
      // An active but unreadable candidate is still partial activation.
    }
  }

  const controlInventoryAfter = await fs.list('projects/control/');
  return {
    inspectionRejected,
    inspectionError,
    importRejected,
    active,
    candidateFiles: await fs.list(`${dir}/`),
    mutationCalls: fs.mutationCalls,
    completionMarkerMutationCount: fs.mutationPaths
      .filter((path) => path === `${dir}/lociview.json`).length,
    controlUnchanged:
      JSON.stringify(controlInventoryAfter) === JSON.stringify(controlInventoryBefore) &&
      bytesEqual(await fs.readBytes(CONTROL_PATH), CONTROL_BYTES),
    mixedValidCaptionVisible,
  };
}

function rejectedBeforeActivation(outcome: ImportAttempt): boolean {
  return outcome.inspectionRejected || outcome.importRejected;
}

function candidateIsUnmodified(outcome: ImportAttempt): boolean {
  return !outcome.active && outcome.candidateFiles.length === 0;
}

function candidateIsInactive(outcome: ImportAttempt): boolean {
  return !outcome.active;
}

async function capturedReadError(zip: Uint8Array, limits: ZipLimits): Promise<unknown> {
  try {
    await readZipEntries(zip, limits);
    return null;
  } catch (error) {
    return error;
  }
}

function duplicateJsonMemberManifestBytes(): Uint8Array {
  const manifest = new TextDecoder().decode(manifestBytes());
  const marker = '"name":"malicious envelope fixture"';
  const duplicate = `${marker},"name":"duplicate member"`;
  if (!manifest.includes(marker)) throw new Error('duplicate JSON member fixture marker is missing');
  return encoder.encode(manifest.replace(marker, duplicate));
}

function rawManifestWithExtra(extraMembers: string): string {
  const manifest = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes());
  if (!manifest.endsWith('}')) throw new Error('manifest ambiguity fixture is not an object');
  return `${manifest.slice(0, -1)},${extraMembers}}`;
}

function replaceTextOnce(source: string, marker: string, replacement: string): string {
  const first = source.indexOf(marker);
  if (first < 0 || source.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`manifest fixture marker must occur exactly once: ${marker}`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + marker.length)}`;
}

function isUnicodeScalarText(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= text.length) return false;
      const next = text.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function rawMemberText(member: RawManifestMember): string {
  return `${member.rawKey}:${JSON.stringify(member.value)}`;
}

function jsonObjectDepthAt(text: string, end: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < end; index += 1) {
    const char = text[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    }
  }
  return depth;
}

function ownJsonValue(object: Record<string, unknown>, key: string): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new Error(`missing own JSON member: ${key}`);
  }
  return descriptor.value;
}

function manifestReservedContainer(
  root: Record<string, unknown>,
  depth: ManifestReservedCase['depth'],
): Record<string, unknown> {
  if (depth === 'root') return root;
  const future = ownJsonValue(root, 'future');
  if (typeof future !== 'object' || future === null || Array.isArray(future)) {
    throw new Error('reserved manifest future container is invalid');
  }
  if (depth === 'nested') return future as Record<string, unknown>;
  const items = ownJsonValue(future as Record<string, unknown>, 'items');
  if (!Array.isArray(items) || typeof items[0] !== 'object' || items[0] === null ||
      Array.isArray(items[0])) {
    throw new Error('reserved manifest deep container is invalid');
  }
  return items[0] as Record<string, unknown>;
}

function countDangerousOwnKeys(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + countDangerousOwnKeys(item), 0);
  }
  if (typeof value !== 'object' || value === null) return 0;
  const record = value as Record<string, unknown>;
  return Reflect.ownKeys(record).reduce((count, key) => {
    if (typeof key !== 'string') return count;
    const dangerous = key === '__proto__' || key === 'prototype' || key === 'constructor';
    return count + (dangerous ? 1 : 0) + countDangerousOwnKeys(ownJsonValue(record, key));
  }, 0);
}

function makeManifestAmbiguityCase(
  id: ManifestAmbiguityId,
  relation: ManifestAmbiguityCase['relation'],
  depth: ManifestAmbiguityCase['depth'],
  forwardMembers: readonly [RawManifestMember, RawManifestMember],
  reversed = false,
): ManifestAmbiguityCase {
  const members: [RawManifestMember, RawManifestMember] = reversed
    ? [forwardMembers[1], forwardMembers[0]]
    : [forwardMembers[0], forwardMembers[1]];
  const pairText = members.map(rawMemberText).join(',');
  const extra = depth === 'nested' ? `"future":{${pairText}}` : pairText;
  return { id, relation, depth, members, manifestText: rawManifestWithExtra(extra) };
}

const DECODED_TOP_MEMBERS = [
  { rawKey: '"future"', value: 'literal top member' },
  { rawKey: '"fut\\u0075re"', value: 'escaped top member' },
] as const satisfies readonly [RawManifestMember, RawManifestMember];
const DECODED_NESTED_MEMBERS = [
  { rawKey: '"label"', value: 'literal nested member' },
  { rawKey: '"la\\u0062el"', value: 'escaped nested member' },
] as const satisfies readonly [RawManifestMember, RawManifestMember];
const NFC_MEMBERS = [
  { rawKey: '"\\u00e9"', value: 'NFC member' },
  { rawKey: '"e\\u0301"', value: 'NFD member' },
] as const satisfies readonly [RawManifestMember, RawManifestMember];

const MANIFEST_AMBIGUITY_CASES: readonly ManifestAmbiguityCase[] = [
  {
    id: 'duplicate-json-member',
    relation: 'exact-duplicate',
    depth: 'top-level',
    members: [
      { rawKey: '"name"', value: 'malicious envelope fixture' },
      { rawKey: '"name"', value: 'duplicate member' },
    ],
    manifestText: new TextDecoder('utf-8', { fatal: true })
      .decode(duplicateJsonMemberManifestBytes()),
  },
  makeManifestAmbiguityCase(
    'manifest-decoded-duplicate-top-forward',
    'decoded-equivalent',
    'top-level',
    DECODED_TOP_MEMBERS,
  ),
  makeManifestAmbiguityCase(
    'manifest-decoded-duplicate-top-reverse',
    'decoded-equivalent',
    'top-level',
    DECODED_TOP_MEMBERS,
    true,
  ),
  makeManifestAmbiguityCase(
    'manifest-decoded-duplicate-nested-forward',
    'decoded-equivalent',
    'nested',
    DECODED_NESTED_MEMBERS,
  ),
  makeManifestAmbiguityCase(
    'manifest-decoded-duplicate-nested-reverse',
    'decoded-equivalent',
    'nested',
    DECODED_NESTED_MEMBERS,
    true,
  ),
  makeManifestAmbiguityCase(
    'manifest-nfc-collision-top-forward',
    'nfc-collision',
    'top-level',
    NFC_MEMBERS,
  ),
  makeManifestAmbiguityCase(
    'manifest-nfc-collision-top-reverse',
    'nfc-collision',
    'top-level',
    NFC_MEMBERS,
    true,
  ),
  makeManifestAmbiguityCase(
    'manifest-nfc-collision-nested-forward',
    'nfc-collision',
    'nested',
    NFC_MEMBERS,
  ),
  makeManifestAmbiguityCase(
    'manifest-nfc-collision-nested-reverse',
    'nfc-collision',
    'nested',
    NFC_MEMBERS,
    true,
  ),
];

const MANIFEST_AMBIGUITY_REVERSE_PAIRS = [
  [
    'manifest-decoded-duplicate-top-forward',
    'manifest-decoded-duplicate-top-reverse',
  ],
  [
    'manifest-decoded-duplicate-nested-forward',
    'manifest-decoded-duplicate-nested-reverse',
  ],
  ['manifest-nfc-collision-top-forward', 'manifest-nfc-collision-top-reverse'],
  ['manifest-nfc-collision-nested-forward', 'manifest-nfc-collision-nested-reverse'],
] as const satisfies readonly (readonly [ManifestAmbiguityId, ManifestAmbiguityId])[];

const MANIFEST_AMBIGUITY_CONTROL_TEXT = rawManifestWithExtra(
  '"\\u00e9":"top NFC singleton",' +
  '"future":{"la\\u0062el":"nested escaped singleton",' +
  '"\\u00e9":"nested NFC singleton"}',
);
const MANIFEST_AMBIGUITY_OPS_TEXT = `${baseTargetOpLine()}\n${validMixedOpLine()}\n`;
const MANIFEST_NAME_MEMBER = '"name":"malicious envelope fixture"';
const VALID_ASTRAL_ESCAPE = '\\uD83D\\uDE00';
const VALID_ASTRAL_SCALAR = String.fromCodePoint(0x1f600);
const MANIFEST_SCALAR_CASES: readonly ManifestScalarCase[] = [
  {
    id: 'manifest-lone-high-surrogate-name',
    location: 'known-name-value',
    escapedScalar: '\\uD83D',
    manifestText: replaceTextOnce(
      new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes()),
      MANIFEST_NAME_MEMBER,
      '"name":"\\uD83D"',
    ),
  },
  {
    id: 'manifest-lone-low-surrogate-nested-key',
    location: 'unknown-nested-key',
    escapedScalar: '\\uDE00',
    manifestText: rawManifestWithExtra('"future":{"\\uDE00":"invalid scalar key"}'),
  },
];
const MANIFEST_SCALAR_CONTROL_TEXT = replaceTextOnce(
  rawManifestWithExtra(
    '"future":{"\\uD83D\\uDE00":"valid astral scalar key"}',
  ),
  MANIFEST_NAME_MEMBER,
  '"name":"\\uD83D\\uDE00"',
);
const RESERVED_KEY_SPECS = [
  { decodedKey: '__proto__', idPart: 'dunder-proto', escapedKey: '__pr\\u006fto__' },
  { decodedKey: 'prototype', idPart: 'prototype', escapedKey: 'pr\\u006ftotype' },
  { decodedKey: 'constructor', idPart: 'constructor', escapedKey: 'constr\\u0075ctor' },
] as const;
const RESERVED_DEPTHS = ['root', 'nested', 'deep'] as const;

function makeManifestReservedCase(
  keyIndex: number,
  depthIndex: number,
): ManifestReservedCase {
  const keySpec = RESERVED_KEY_SPECS[keyIndex]!;
  const depth = RESERVED_DEPTHS[depthIndex]!;
  const rawKey = keyIndex === depthIndex ? keySpec.escapedKey : keySpec.decodedKey;
  const pollutionProperty = `polluted_${keySpec.idPart.replace('-', '_')}_${depth}`;
  const dangerousMember = `"${rawKey}":{"${pollutionProperty}":true}`;
  const extra = depth === 'root'
    ? dangerousMember
    : depth === 'nested'
      ? `"future":{${dangerousMember}}`
      : `"future":{"items":[{${dangerousMember}}]}`;
  return {
    id: `manifest-reserved-${keySpec.idPart}-${depth}` as ManifestReservedId,
    decodedKey: keySpec.decodedKey,
    depth,
    rawKey,
    pollutionProperty,
    manifestText: rawManifestWithExtra(extra),
  };
}

const MANIFEST_RESERVED_CASES: readonly ManifestReservedCase[] = RESERVED_KEY_SPECS.flatMap(
  (_key, keyIndex) => RESERVED_DEPTHS.map((_depth, depthIndex) =>
    makeManifestReservedCase(keyIndex, depthIndex)),
);
const MANIFEST_RESERVED_CONTROL_NAME = '__proto__';
const MANIFEST_RESERVED_CONTROL_TEXT = replaceTextOnce(
  rawManifestWithExtra(
    '"__proto__Safe":"__proto__",' +
    '"future":{"protot\\u0079peSafe":"prototype",' +
    '"items":[{"constr\\u0075ctorSafe":"constructor"}]}',
  ),
  MANIFEST_NAME_MEMBER,
  `"name":"${MANIFEST_RESERVED_CONTROL_NAME}"`,
);

async function attemptForeignNormalizedCollision(zip: Uint8Array): Promise<ForeignImportAttempt> {
  const fs = new CountingMemoryFS();
  let inspectionRejected = false;
  let entries: Awaited<ReturnType<typeof readZipEntries>> | null = null;
  try {
    entries = await readZipEntries(zip);
  } catch {
    inspectionRejected = true;
  }
  if (entries !== null) {
    const plan = await buildImportPlan(entries);
    await applyImportPlan(fs, USER, plan, { projectName: 'foreign collision fixture' });
  }
  return {
    inspectionRejected,
    mutationCalls: fs.mutationCalls,
    activeMarkerCount: (await fs.list('projects/'))
      .filter((path) => path.endsWith('/lociview.json')).length,
  };
}

async function activeManifestAndLogSnapshot(fs: MemoryFS, dir: string): Promise<string> {
  const manifestPath = `${dir}/lociview.json`;
  const activeLogPaths = (await fs.list(`${dir}/ops/`))
    .filter((path) => path.endsWith('.jsonl'));
  const paths = [manifestPath, ...activeLogPaths];
  const entries = await Promise.all(paths.map(async (path) => {
    const bytes = await fs.readBytes(path);
    if (bytes === null) throw new Error(`active authority disappeared while snapshotting: ${path}`);
    return [path.slice(dir.length + 1), Array.from(bytes)] as const;
  }));
  return JSON.stringify(entries);
}

async function attemptExistingProjectMerge(zip: Uint8Array): Promise<ExistingMergeAttempt> {
  const fs = new CountingMemoryFS();
  const twinFs = new MemoryFS();
  const dir = 'projects/malicious-existing-merge';
  const twinDir = 'projects/malicious-existing-merge-control';
  const logPath = `${dir}/ops/${MIXED_ACTOR}.jsonl`;
  const twinLogPath = `${twinDir}/ops/${MIXED_ACTOR}.jsonl`;
  await fs.writeBytes(`${dir}/lociview.json`, manifestBytes());
  await fs.writeText(logPath, `${baseTargetOpLine()}\n`);
  await twinFs.writeBytes(`${twinDir}/lociview.json`, manifestBytes());
  await twinFs.writeText(twinLogPath, `${baseTargetOpLine()}\n`);
  const store = await ProjectStore.open(fs, dir, USER);
  const twinStore = await ProjectStore.open(twinFs, twinDir, USER);

  const rawBefore = await fs.readBytes(logPath);
  if (rawBefore === null) throw new Error('mixed merge target log setup failed');
  const allOpsBefore = JSON.stringify(store.allOps);
  const stateBefore = JSON.stringify(store.state);
  const authorityBefore = await activeManifestAndLogSnapshot(fs, dir);
  const publishedStates: string[] = [];
  const unsubscribe = store.subscribe((state) => publishedStates.push(JSON.stringify(state)));
  fs.resetMutationCalls();
  let inspection: Awaited<ReturnType<typeof inspectZip>> | null = null;
  try {
    inspection = await inspectZip(zip);
  } catch {
    // A thrown rejection and a future typed blocked result are both acceptable.
  }
  if (inspection !== null) {
    try {
      await mergeFromInspection(fs, dir, store, inspection);
    } catch {
      // The active-state assertions below are the contract, not the error shape.
    }
  }
  unsubscribe();

  const rawLogUnchanged = bytesEqual(await fs.readBytes(logPath), rawBefore);
  const allOpsUnchanged = JSON.stringify(store.allOps) === allOpsBefore;
  const stateUnchanged = JSON.stringify(store.state) === stateBefore;
  const authorityBytesUnchanged =
    await activeManifestAndLogSnapshot(fs, dir) === authorityBefore;
  const authorityPathsUnmutated = fs.mutationPaths.every((path) =>
    path !== `${dir}/lociview.json` &&
    !(path.startsWith(`${dir}/ops/`) && path.endsWith('.jsonl')));
  const publishedStatesUnchanged = publishedStates.every((state) => state === stateBefore);
  let reopenedStateUnchanged = false;
  try {
    const reopened = await ProjectStore.open(fs, dir, USER);
    reopenedStateUnchanged =
      JSON.stringify(reopened.allOps) === allOpsBefore &&
      JSON.stringify(reopened.state) === stateBefore;
  } catch {
    // An unreadable active project is not a safe quarantine outcome.
  }

  const probeInput = {
    t: 'create' as const,
    e: 'caption',
    id: 'cap_00000000000000000000000093',
    v: { title: 'post-rejection clock probe' },
  };
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(FIXED_CREATED_AT));
  let targetProbe: ReturnType<ProjectStore['dispatch']>;
  let controlProbe: ReturnType<ProjectStore['dispatch']>;
  try {
    targetProbe = store.dispatch(probeInput);
    controlProbe = twinStore.dispatch(probeInput);
  } finally {
    now.mockRestore();
  }
  await Promise.all([store.flush(), twinStore.flush()]);
  const internalClockAndSequenceUnchanged =
    JSON.stringify(targetProbe) === JSON.stringify(controlProbe);

  return {
    rawLogUnchanged,
    allOpsUnchanged,
    stateUnchanged,
    reopenedStateUnchanged,
    internalClockAndSequenceUnchanged,
    authoritativeUnchanged:
      rawLogUnchanged &&
      allOpsUnchanged &&
      stateUnchanged &&
      authorityBytesUnchanged &&
      authorityPathsUnmutated &&
      publishedStatesUnchanged &&
      reopenedStateUnchanged &&
      internalClockAndSequenceUnchanged,
  };
}

function hasVisibleCaption(store: ProjectStore, captionId: string): boolean {
  return visibleEntities(store.state, 'caption').some(({ id }) => id === captionId);
}

function pollutionPropertiesInvisible(properties: readonly string[]): boolean {
  const fresh = {};
  return properties.every((property) =>
    !Reflect.has(fresh, property) && !Reflect.has(Object, property));
}

async function validManifestControlRoundTrips(
  zip: Uint8Array,
  expectedName: string,
  pollutionProperties: readonly string[] = [],
): Promise<boolean> {
  const intrinsicSnapshot = snapshotObjectIntrinsics();
  try {
    const inspection = await inspectZip(zip);
    const inspectionIsExact =
      inspection.kind === 'lociview' &&
      inspection.manifest?.projectId === PROJECT_ID &&
      inspection.manifest.name === expectedName &&
      inspection.opsErrorCount === 0 &&
      inspection.opsFiles.length === 1 &&
      inspection.opsFiles[0]?.text === MANIFEST_AMBIGUITY_OPS_TEXT &&
      inspection.ops.length === 2;
    if (!inspectionIsExact) return false;

    const importedFs = new MemoryFS();
    const importedDir = 'projects/valid-manifest-control';
    await importNewProject(importedFs, importedDir, inspection);
    const imported = await ProjectStore.open(importedFs, importedDir, USER);
    const importedOkay =
      imported.manifest.name === expectedName &&
      hasVisibleCaption(imported, BASE_CAPTION_ID) &&
      hasVisibleCaption(imported, MIXED_CAPTION_ID);
    const importedReopened = await ProjectStore.open(importedFs, importedDir, USER);
    const importedReopenedOkay =
      importedReopened.manifest.name === expectedName &&
      hasVisibleCaption(importedReopened, BASE_CAPTION_ID) &&
      hasVisibleCaption(importedReopened, MIXED_CAPTION_ID);

    const mergedFs = new MemoryFS();
    const mergedDir = 'projects/valid-manifest-merge-control';
    await mergedFs.writeBytes(`${mergedDir}/lociview.json`, manifestBytes());
    await mergedFs.writeText(
      `${mergedDir}/ops/${MIXED_ACTOR}.jsonl`,
      `${baseTargetOpLine()}\n`,
    );
    const merged = await ProjectStore.open(mergedFs, mergedDir, USER);
    await mergeFromInspection(mergedFs, mergedDir, merged, inspection);
    await merged.flush();
    const mergedOkay =
      hasVisibleCaption(merged, BASE_CAPTION_ID) &&
      hasVisibleCaption(merged, MIXED_CAPTION_ID);
    const mergedReopened = await ProjectStore.open(mergedFs, mergedDir, USER);
    const mergedReopenedOkay =
      hasVisibleCaption(mergedReopened, BASE_CAPTION_ID) &&
      hasVisibleCaption(mergedReopened, MIXED_CAPTION_ID);

    return (
      importedOkay &&
      importedReopenedOkay &&
      mergedOkay &&
      mergedReopenedOkay &&
      objectIntrinsicsMatch(intrinsicSnapshot) &&
      pollutionPropertiesInvisible(pollutionProperties)
    );
  } catch {
    return false;
  } finally {
    restoreObjectIntrinsics(intrinsicSnapshot);
  }
}

async function attemptManifestReservedCase(
  reservedCase: ManifestReservedCase,
  zip: Uint8Array,
): Promise<ManifestReservedResult> {
  let importOutcome: ImportAttempt | null = null;
  let importIntrinsicsIntact = false;
  const importSnapshot = snapshotObjectIntrinsics();
  try {
    importOutcome = await attemptNewProject(reservedCase.id, zip);
    importIntrinsicsIntact =
      objectIntrinsicsMatch(importSnapshot) &&
      pollutionPropertiesInvisible([reservedCase.pollutionProperty]);
  } finally {
    restoreObjectIntrinsics(importSnapshot);
  }
  if (importOutcome === null) throw new Error(`reserved manifest import did not complete: ${reservedCase.id}`);

  let mergeOutcome: ExistingMergeAttempt | null = null;
  let mergeIntrinsicsIntact = false;
  const mergeSnapshot = snapshotObjectIntrinsics();
  try {
    mergeOutcome = await attemptExistingProjectMerge(zip);
    mergeIntrinsicsIntact =
      objectIntrinsicsMatch(mergeSnapshot) &&
      pollutionPropertiesInvisible([reservedCase.pollutionProperty]);
  } finally {
    restoreObjectIntrinsics(mergeSnapshot);
  }
  if (mergeOutcome === null) throw new Error(`reserved manifest merge did not complete: ${reservedCase.id}`);

  return {
    initialized: true,
    controlUnchanged: importOutcome.controlUnchanged,
    completionMarkerNeverPublished:
      !importOutcome.active && importOutcome.completionMarkerMutationCount === 0,
    sentinelNeverActive: !importOutcome.mixedValidCaptionVisible,
    existingAuthorityUnchanged: mergeOutcome.authoritativeUnchanged,
    objectIntrinsicsIntact: importIntrinsicsIntact && mergeIntrinsicsIntact,
  };
}

describe('G0 characterization: malicious ZIP envelope', () => {
  let outcomes: Record<FixtureId, ImportAttempt>;
  let existingMergeOutcome: ExistingMergeAttempt;
  let foreignCollisionOutcome: ForeignImportAttempt;
  let fixtureShapes: Record<string, RawZipEntryShape[]>;
  let manifestAmbiguityShapes: Record<ManifestAmbiguityId, RawZipEntryShape[]>;
  let manifestAmbiguityDeterministic: Record<ManifestAmbiguityId, boolean>;
  let manifestAmbiguityControlShape: RawZipEntryShape[];
  let manifestAmbiguityControlAccepted = false;
  let manifestAmbiguityResults = Object.fromEntries(
    MANIFEST_AMBIGUITY_CASES.map(({ id }) => [id, {
      initialized: false,
      controlUnchanged: false,
      completionMarkerNeverPublished: false,
      sentinelNeverActive: false,
      existingAuthorityUnchanged: false,
    }]),
  ) as Record<ManifestAmbiguityId, ManifestAmbiguityResult>;
  let manifestScalarShapes: Record<ManifestScalarId, RawZipEntryShape[]>;
  let manifestScalarDeterministic: Record<ManifestScalarId, boolean>;
  let manifestScalarControlShape: RawZipEntryShape[];
  let manifestScalarControlDeterministic = false;
  let manifestScalarControlRoundTrips = false;
  let manifestScalarResults = Object.fromEntries(
    MANIFEST_SCALAR_CASES.map(({ id }) => [id, {
      initialized: false,
      controlUnchanged: false,
      completionMarkerNeverPublished: false,
      sentinelNeverActive: false,
      existingAuthorityUnchanged: false,
    }]),
  ) as Record<ManifestScalarId, ManifestScalarResult>;
  let manifestReservedShapes: Record<ManifestReservedId, RawZipEntryShape[]>;
  let manifestReservedDeterministic: Record<ManifestReservedId, boolean>;
  let manifestReservedControlShape: RawZipEntryShape[];
  let manifestReservedControlDeterministic = false;
  let manifestReservedControlRoundTrips = false;
  let manifestReservedResults = Object.fromEntries(
    MANIFEST_RESERVED_CASES.map(({ id }) => [id, {
      initialized: false,
      controlUnchanged: false,
      completionMarkerNeverPublished: false,
      sentinelNeverActive: false,
      existingAuthorityUnchanged: false,
      objectIntrinsicsIntact: false,
    }]),
  ) as Record<ManifestReservedId, ManifestReservedResult>;
  let limitErrors: Record<'entries' | 'entryBytes' | 'totalBytes', unknown>;
  let representativeFixtureIsDeterministic: boolean;

  beforeAll(async () => {
    const rawDuplicateTarget = 'models/raw-a.glb';
    const rawDuplicateSource = 'models/raw-b.glb';
    const duplicateManifestSource = 'lociview.jsox';

    const unsafeTraversalZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      { path: '../outside.bin', data: encoder.encode('must-not-escape') },
    ]);
    const invalidSchemaZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes({ schemaVersion: 'not-a-number' }) },
    ]);
    const nestedArchiveZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      { path: 'nested.zip', data: encoder.encode('PK') },
    ]);
    const encryptedZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      {
        path: 'media/encrypted.bin',
        data: new Uint8Array(0),
        options: {
          passThrough: true,
          encrypted: true,
          compressionMethod: 0,
          uncompressedSize: 0,
          signature: 0,
        },
      },
    ]);
    const unsupportedCompressionZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      {
        path: 'media/unsupported.bin',
        data: new Uint8Array(0),
        options: {
          passThrough: true,
          compressionMethod: 12,
          uncompressedSize: 0,
          signature: 0,
        },
      },
    ]);
    const mixedOpsText = mixedOpsWireText();
    const mixedZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      {
        path: `ops/${MIXED_ACTOR}.jsonl`,
        data: encoder.encode(mixedOpsText),
      },
      { path: MIXED_BINARY_PATH, data: encoder.encode('valid binary member of mixed package') },
    ]);
    const rawDuplicateZip = await writeZipWithAliasedEntryName([
      { path: 'lociview.json', data: manifestBytes() },
      { path: rawDuplicateTarget, data: encoder.encode('first raw payload') },
      { path: rawDuplicateSource, data: encoder.encode('second raw payload') },
    ], rawDuplicateSource, rawDuplicateTarget);
    const rawDuplicateReversedZip = await writeZipWithAliasedEntryName([
      { path: 'lociview.json', data: manifestBytes() },
      { path: rawDuplicateSource, data: encoder.encode('second raw payload') },
      { path: rawDuplicateTarget, data: encoder.encode('first raw payload') },
    ], rawDuplicateSource, rawDuplicateTarget);
    const normalizedEntries = [
      { path: 'lociview.json', data: manifestBytes() },
      { path: 'models/repeat//blob.glb', data: encoder.encode('first normalized payload') },
      { path: 'models/repeat/blob.glb', data: encoder.encode('second normalized payload') },
    ];
    const normalizedSeparatorZip = await writeDirectZip(normalizedEntries);
    const normalizedSeparatorZipAgain = await writeDirectZip(normalizedEntries);
    const unicodeNormalizationZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      { path: 'media/caf\u00e9.jpg', data: encoder.encode('NFC payload') },
      { path: 'media/cafe\u0301.jpg', data: encoder.encode('NFD payload') },
    ]);
    const unicodeNormalizationReversedZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      { path: 'media/cafe\u0301.jpg', data: encoder.encode('NFD payload') },
      { path: 'media/caf\u00e9.jpg', data: encoder.encode('NFC payload') },
    ]);
    const platformCaseZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      { path: 'models/Case.glb', data: encoder.encode('upper-case payload') },
      { path: 'models/case.glb', data: encoder.encode('lower-case payload') },
    ]);
    const platformCaseReversedZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      { path: 'models/case.glb', data: encoder.encode('lower-case payload') },
      { path: 'models/Case.glb', data: encoder.encode('upper-case payload') },
    ]);
    const duplicateManifestZip = await writeZipWithAliasedEntryName([
      {
        path: 'lociview.json',
        data: manifestBytes({ projectId: 'prj_00000000000000000000000091' }),
      },
      {
        path: duplicateManifestSource,
        data: manifestBytes({ projectId: 'prj_00000000000000000000000092' }),
      },
    ], duplicateManifestSource, 'lociview.json');
    const duplicateManifestReversedZip = await writeZipWithAliasedEntryName([
      {
        path: duplicateManifestSource,
        data: manifestBytes({ projectId: 'prj_00000000000000000000000092' }),
      },
      {
        path: 'lociview.json',
        data: manifestBytes({ projectId: 'prj_00000000000000000000000091' }),
      },
    ], duplicateManifestSource, 'lociview.json');
    const invalidUtf8Zip = await writeDirectZip([
      { path: 'lociview.json', data: invalidUtf8ManifestBytes() },
    ]);
    const futureSchemaZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes({ schemaVersion: SCHEMA_VERSION + 1 }) },
    ]);
    const malformedUtf8EntryNameZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      {
        path: 'media/raw-name.bin',
        data: encoder.encode('malformed filename payload'),
        options: {
          useUnicodeFileNames: true,
          encodeText: (text) => text === 'media/raw-name.bin' ? MALFORMED_RAW_FILENAME : undefined,
        },
      },
    ]);
    const symlinkZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      {
        path: 'media/link.bin',
        data: encoder.encode('target.bin'),
        options: { unixMode: UNIX_SYMLINK_MODE },
      },
    ]);
    const specialModeZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      {
        path: 'media/fifo.bin',
        data: new Uint8Array(0),
        options: { unixMode: UNIX_FIFO_MODE },
      },
    ]);
    const unsafeDirectoryZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      { path: '../escape', options: { directory: true } },
    ]);
    const directoryCountZip = await writeDirectZip([
      { path: 'lociview.json', data: manifestBytes() },
      { path: 'directory-a', options: { directory: true } },
      { path: 'directory-b', options: { directory: true } },
    ]);
    const manifestAmbiguityZips = {} as Record<ManifestAmbiguityId, Uint8Array>;
    manifestAmbiguityShapes = {} as Record<ManifestAmbiguityId, RawZipEntryShape[]>;
    manifestAmbiguityDeterministic = {} as Record<ManifestAmbiguityId, boolean>;
    for (const ambiguityCase of MANIFEST_AMBIGUITY_CASES) {
      const entries = [
        { path: 'lociview.json', data: encoder.encode(ambiguityCase.manifestText) },
        {
          path: `ops/${MIXED_ACTOR}.jsonl`,
          data: encoder.encode(MANIFEST_AMBIGUITY_OPS_TEXT),
        },
      ];
      const zip = await writeDirectZip(entries);
      const repeatedZip = await writeDirectZip(entries);
      manifestAmbiguityZips[ambiguityCase.id] = zip;
      manifestAmbiguityShapes[ambiguityCase.id] = await rawZipEntryShapes(zip);
      manifestAmbiguityDeterministic[ambiguityCase.id] = bytesEqual(repeatedZip, zip);
    }
    const manifestAmbiguityControlZip = await writeDirectZip([
      { path: 'lociview.json', data: encoder.encode(MANIFEST_AMBIGUITY_CONTROL_TEXT) },
      {
        path: `ops/${MIXED_ACTOR}.jsonl`,
        data: encoder.encode(MANIFEST_AMBIGUITY_OPS_TEXT),
      },
    ]);
    manifestAmbiguityControlShape = await rawZipEntryShapes(manifestAmbiguityControlZip);
    const manifestScalarZips = {} as Record<ManifestScalarId, Uint8Array>;
    manifestScalarShapes = {} as Record<ManifestScalarId, RawZipEntryShape[]>;
    manifestScalarDeterministic = {} as Record<ManifestScalarId, boolean>;
    for (const scalarCase of MANIFEST_SCALAR_CASES) {
      const entries = [
        { path: 'lociview.json', data: encoder.encode(scalarCase.manifestText) },
        {
          path: `ops/${MIXED_ACTOR}.jsonl`,
          data: encoder.encode(MANIFEST_AMBIGUITY_OPS_TEXT),
        },
      ];
      const zip = await writeDirectZip(entries);
      const repeatedZip = await writeDirectZip(entries);
      manifestScalarZips[scalarCase.id] = zip;
      manifestScalarShapes[scalarCase.id] = await rawZipEntryShapes(zip);
      manifestScalarDeterministic[scalarCase.id] = bytesEqual(repeatedZip, zip);
    }
    const manifestScalarControlEntries = [
      { path: 'lociview.json', data: encoder.encode(MANIFEST_SCALAR_CONTROL_TEXT) },
      {
        path: `ops/${MIXED_ACTOR}.jsonl`,
        data: encoder.encode(MANIFEST_AMBIGUITY_OPS_TEXT),
      },
    ];
    const manifestScalarControlZip = await writeDirectZip(manifestScalarControlEntries);
    const repeatedManifestScalarControlZip = await writeDirectZip(manifestScalarControlEntries);
    manifestScalarControlShape = await rawZipEntryShapes(manifestScalarControlZip);
    manifestScalarControlDeterministic = bytesEqual(
      repeatedManifestScalarControlZip,
      manifestScalarControlZip,
    );
    const manifestReservedZips = {} as Record<ManifestReservedId, Uint8Array>;
    manifestReservedShapes = {} as Record<ManifestReservedId, RawZipEntryShape[]>;
    manifestReservedDeterministic = {} as Record<ManifestReservedId, boolean>;
    for (const reservedCase of MANIFEST_RESERVED_CASES) {
      const entries = [
        { path: 'lociview.json', data: encoder.encode(reservedCase.manifestText) },
        {
          path: `ops/${MIXED_ACTOR}.jsonl`,
          data: encoder.encode(MANIFEST_AMBIGUITY_OPS_TEXT),
        },
      ];
      const zip = await writeDirectZip(entries);
      const repeatedZip = await writeDirectZip(entries);
      manifestReservedZips[reservedCase.id] = zip;
      manifestReservedShapes[reservedCase.id] = await rawZipEntryShapes(zip);
      manifestReservedDeterministic[reservedCase.id] = bytesEqual(repeatedZip, zip);
    }
    const manifestReservedControlEntries = [
      { path: 'lociview.json', data: encoder.encode(MANIFEST_RESERVED_CONTROL_TEXT) },
      {
        path: `ops/${MIXED_ACTOR}.jsonl`,
        data: encoder.encode(MANIFEST_AMBIGUITY_OPS_TEXT),
      },
    ];
    const manifestReservedControlZip = await writeDirectZip(manifestReservedControlEntries);
    const repeatedManifestReservedControlZip = await writeDirectZip(
      manifestReservedControlEntries,
    );
    manifestReservedControlShape = await rawZipEntryShapes(manifestReservedControlZip);
    manifestReservedControlDeterministic = bytesEqual(
      repeatedManifestReservedControlZip,
      manifestReservedControlZip,
    );
    const centralName = 'models/central.glb';
    const localName = 'models/locally.glb';
    const localCentralMismatchZip = await writeZipWithMismatchedLocalName([
      { path: 'lociview.json', data: manifestBytes() },
      { path: centralName, data: encoder.encode('mismatched name payload') },
    ], centralName, localName);
    const foreignNormalizedCollisionZip = await writeDirectZip([
      { path: 'folder//photo.jpg', data: encoder.encode('first image') },
      { path: 'folder/photo.jpg', data: encoder.encode('second image') },
    ]);

    const entryCountLimitZip = await writeDirectZip([
      { path: 'a.bin', data: new Uint8Array([1]) },
      { path: 'b.bin', data: new Uint8Array([2]) },
    ]);
    const entrySizeLimitZip = await writeDirectZip([
      { path: 'entry.bin', data: new Uint8Array([1, 2]) },
    ]);
    const totalSizeLimitZip = await writeDirectZip([
      { path: 'a.bin', data: new Uint8Array([1]) },
      { path: 'b.bin', data: new Uint8Array([2]) },
    ]);
    limitErrors = {
      entries: await capturedReadError(entryCountLimitZip, {
        maxEntries: 1,
        maxEntryBytes: 1,
        maxTotalBytes: 2,
      }),
      entryBytes: await capturedReadError(entrySizeLimitZip, {
        maxEntries: 1,
        maxEntryBytes: 1,
        maxTotalBytes: 2,
      }),
      totalBytes: await capturedReadError(totalSizeLimitZip, {
        maxEntries: 2,
        maxEntryBytes: 1,
        maxTotalBytes: 1,
      }),
    };

    representativeFixtureIsDeterministic = bytesEqual(
      normalizedSeparatorZipAgain,
      normalizedSeparatorZip,
    );
    fixtureShapes = {
      mixed: await rawZipEntryShapes(mixedZip),
      rawDuplicate: await rawZipEntryShapes(rawDuplicateZip),
      rawDuplicateReversed: await rawZipEntryShapes(rawDuplicateReversedZip),
      normalized: await rawZipEntryShapes(normalizedSeparatorZip),
      unicode: await rawZipEntryShapes(unicodeNormalizationZip),
      unicodeReversed: await rawZipEntryShapes(unicodeNormalizationReversedZip),
      platformCase: await rawZipEntryShapes(platformCaseZip),
      platformCaseReversed: await rawZipEntryShapes(platformCaseReversedZip),
      duplicateManifest: await rawZipEntryShapes(duplicateManifestZip),
      duplicateManifestReversed: await rawZipEntryShapes(duplicateManifestReversedZip),
      invalidUtf8Manifest: await rawZipEntryShapes(invalidUtf8Zip),
      futureSchema: await rawZipEntryShapes(futureSchemaZip),
      malformedUtf8Name: await rawZipEntryShapes(malformedUtf8EntryNameZip),
      encrypted: await rawZipEntryShapes(encryptedZip),
      unsupportedCompression: await rawZipEntryShapes(unsupportedCompressionZip),
      symlink: await rawZipEntryShapes(symlinkZip),
      specialMode: await rawZipEntryShapes(specialModeZip),
      unsafeDirectory: await rawZipEntryShapes(unsafeDirectoryZip),
      directoryCount: await rawZipEntryShapes(directoryCountZip),
      duplicateJsonMember: manifestAmbiguityShapes['duplicate-json-member'],
      localCentralMismatch: await rawZipEntryShapes(localCentralMismatchZip),
      foreignNormalizedCollision: await rawZipEntryShapes(foreignNormalizedCollisionZip),
    };

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      outcomes = {
        'unsafe-traversal': await attemptNewProject('unsafe-traversal', unsafeTraversalZip),
        'invalid-manifest-schema': await attemptNewProject('invalid-manifest-schema', invalidSchemaZip),
        'nested-archive': await attemptNewProject('nested-archive', nestedArchiveZip),
        'encrypted-entry': await attemptNewProject('encrypted-entry', encryptedZip),
        'unsupported-compression': await attemptNewProject(
          'unsupported-compression',
          unsupportedCompressionZip,
        ),
        'mixed-valid-invalid': await attemptNewProject('mixed-valid-invalid', mixedZip),
        'raw-duplicate-path': await attemptNewProject('raw-duplicate-path', rawDuplicateZip),
        'raw-duplicate-path-reversed': await attemptNewProject(
          'raw-duplicate-path-reversed',
          rawDuplicateReversedZip,
        ),
        'normalized-separator-collision': await attemptNewProject(
          'normalized-separator-collision',
          normalizedSeparatorZip,
        ),
        'unicode-normalization-collision': await attemptNewProject(
          'unicode-normalization-collision',
          unicodeNormalizationZip,
        ),
        'unicode-normalization-collision-reversed': await attemptNewProject(
          'unicode-normalization-collision-reversed',
          unicodeNormalizationReversedZip,
        ),
        'platform-case-collision': await attemptNewProject('platform-case-collision', platformCaseZip),
        'platform-case-collision-reversed': await attemptNewProject(
          'platform-case-collision-reversed',
          platformCaseReversedZip,
        ),
        'duplicate-manifest': await attemptNewProject('duplicate-manifest', duplicateManifestZip),
        'duplicate-manifest-reversed': await attemptNewProject(
          'duplicate-manifest-reversed',
          duplicateManifestReversedZip,
        ),
        'invalid-utf8-manifest': await attemptNewProject('invalid-utf8-manifest', invalidUtf8Zip),
        'future-schema': await attemptNewProject('future-schema', futureSchemaZip),
        'malformed-utf8-entry-name': await attemptNewProject(
          'malformed-utf8-entry-name',
          malformedUtf8EntryNameZip,
        ),
        'symlink-entry': await attemptNewProject('symlink-entry', symlinkZip),
        'special-mode-entry': await attemptNewProject('special-mode-entry', specialModeZip),
        'unsafe-directory-path': await attemptNewProject('unsafe-directory-path', unsafeDirectoryZip),
        'directory-count-bypass': await attemptNewProject(
          'directory-count-bypass',
          directoryCountZip,
          {
            maxEntries: 1,
            maxEntryBytes: manifestBytes().length,
            maxTotalBytes: manifestBytes().length,
          },
        ),
        'local-central-name-mismatch': await attemptNewProject(
          'local-central-name-mismatch',
          localCentralMismatchZip,
        ),
      };
      existingMergeOutcome = await attemptExistingProjectMerge(mixedZip);
      foreignCollisionOutcome = await attemptForeignNormalizedCollision(
        foreignNormalizedCollisionZip,
      );
      try {
        const controlInspection = await inspectZip(manifestAmbiguityControlZip);
        manifestAmbiguityControlAccepted =
          controlInspection.kind === 'lociview' &&
          controlInspection.manifest?.projectId === PROJECT_ID &&
          controlInspection.opsErrorCount === 0 &&
          controlInspection.opsFiles.length === 1 &&
          controlInspection.opsFiles[0]?.text === MANIFEST_AMBIGUITY_OPS_TEXT &&
          controlInspection.ops.length === 2;
      } catch {
        manifestAmbiguityControlAccepted = false;
      }
      manifestScalarControlRoundTrips = await validManifestControlRoundTrips(
        manifestScalarControlZip,
        VALID_ASTRAL_SCALAR,
      );
      for (const ambiguityCase of MANIFEST_AMBIGUITY_CASES) {
        const zip = manifestAmbiguityZips[ambiguityCase.id];
        const importOutcome = await attemptNewProject(ambiguityCase.id, zip);
        const mergeOutcome = await attemptExistingProjectMerge(zip);
        manifestAmbiguityResults[ambiguityCase.id] = {
          initialized: true,
          controlUnchanged: importOutcome.controlUnchanged,
          completionMarkerNeverPublished:
            !importOutcome.active && importOutcome.completionMarkerMutationCount === 0,
          sentinelNeverActive: !importOutcome.mixedValidCaptionVisible,
          existingAuthorityUnchanged: mergeOutcome.authoritativeUnchanged,
        };
      }
      for (const scalarCase of MANIFEST_SCALAR_CASES) {
        const zip = manifestScalarZips[scalarCase.id];
        const importOutcome = await attemptNewProject(scalarCase.id, zip);
        const mergeOutcome = await attemptExistingProjectMerge(zip);
        manifestScalarResults[scalarCase.id] = {
          initialized: true,
          controlUnchanged: importOutcome.controlUnchanged,
          completionMarkerNeverPublished:
            !importOutcome.active && importOutcome.completionMarkerMutationCount === 0,
          sentinelNeverActive: !importOutcome.mixedValidCaptionVisible,
          existingAuthorityUnchanged: mergeOutcome.authoritativeUnchanged,
        };
      }
      for (const reservedCase of MANIFEST_RESERVED_CASES) {
        manifestReservedResults[reservedCase.id] = await attemptManifestReservedCase(
          reservedCase,
          manifestReservedZips[reservedCase.id],
        );
      }
      manifestReservedControlRoundTrips = await validManifestControlRoundTrips(
        manifestReservedControlZip,
        MANIFEST_RESERVED_CONTROL_NAME,
        MANIFEST_RESERVED_CASES.map(({ pollutionProperty }) => pollutionProperty),
      );
    } finally {
      warn.mockRestore();
    }
  });

  describe('tests-only fixture shape', () => {
    const names = (key: string): string[] => fixtureShapes[key]!.map(({ filename }) => filename);
    const payloadText = (key: string, filename: string): string => {
      const payload = fixtureShapes[key]!.find((entry) => entry.filename === filename)?.payload;
      if (payload === null || payload === undefined) throw new Error(`missing fixture payload: ${key}/${filename}`);
      return new TextDecoder().decode(payload);
    };

    it('builds byte-identical archives twice with the fixed writer configuration', () => {
      expect(representativeFixtureIsDeterministic).toBe(true);
    });

    it('registers every manifest ambiguity case once and reproduces every ZIP byte-for-byte', () => {
      expect(MANIFEST_AMBIGUITY_CASES.map(({ id, relation, depth }) =>
        [id, relation, depth])).toEqual([
        ['duplicate-json-member', 'exact-duplicate', 'top-level'],
        ['manifest-decoded-duplicate-top-forward', 'decoded-equivalent', 'top-level'],
        ['manifest-decoded-duplicate-top-reverse', 'decoded-equivalent', 'top-level'],
        ['manifest-decoded-duplicate-nested-forward', 'decoded-equivalent', 'nested'],
        ['manifest-decoded-duplicate-nested-reverse', 'decoded-equivalent', 'nested'],
        ['manifest-nfc-collision-top-forward', 'nfc-collision', 'top-level'],
        ['manifest-nfc-collision-top-reverse', 'nfc-collision', 'top-level'],
        ['manifest-nfc-collision-nested-forward', 'nfc-collision', 'nested'],
        ['manifest-nfc-collision-nested-reverse', 'nfc-collision', 'nested'],
      ]);
      expect(Object.values(manifestAmbiguityDeterministic)).toEqual(
        MANIFEST_AMBIGUITY_CASES.map(() => true),
      );
      const opLines = MANIFEST_AMBIGUITY_OPS_TEXT.trimEnd().split('\n');
      expect(opLines).toHaveLength(2);
      expect(JSON.parse(opLines[0]!)).toMatchObject({
        op: 1,
        actor: MIXED_ACTOR,
        id: BASE_CAPTION_ID,
      });
      expect(JSON.parse(opLines[1]!)).toMatchObject({
        op: 2,
        actor: MIXED_ACTOR,
        id: MIXED_CAPTION_ID,
      });
    });

    for (const ambiguityCase of MANIFEST_AMBIGUITY_CASES) {
      it(`${ambiguityCase.id}: freezes raw member depth, order, values and key relation`, () => {
        const shapes = manifestAmbiguityShapes[ambiguityCase.id];
        expect(shapes.map(({ filename }) => filename)).toEqual([
          'lociview.json',
          `ops/${MIXED_ACTOR}.jsonl`,
        ]);
        const manifestPayload = shapes[0]?.payload;
        const opsPayload = shapes[1]?.payload;
        if (manifestPayload === null || manifestPayload === undefined ||
            opsPayload === null || opsPayload === undefined) {
          throw new Error(`missing manifest ambiguity payload: ${ambiguityCase.id}`);
        }
        const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestPayload);
        expect(manifestText).toBe(ambiguityCase.manifestText);
        expect([...manifestPayload].every((byte) => byte <= 0x7f)).toBe(true);
        expect(new TextDecoder('utf-8', { fatal: true }).decode(opsPayload))
          .toBe(MANIFEST_AMBIGUITY_OPS_TEXT);

        const pairText = ambiguityCase.members.map(rawMemberText).join(',');
        const scopedPair = ambiguityCase.depth === 'nested'
          ? `"future":{${pairText}}`
          : pairText;
        expect(manifestText.split(scopedPair)).toHaveLength(2);
        const actualDepths = ambiguityCase.members.map((member) => {
          const token = rawMemberText(member);
          const offset = manifestText.indexOf(token);
          expect(offset).toBeGreaterThanOrEqual(0);
          expect(manifestText.indexOf(token, offset + token.length)).toBe(-1);
          return jsonObjectDepthAt(manifestText, offset);
        });
        expect(actualDepths).toEqual(
          ambiguityCase.members.map(() => ambiguityCase.depth === 'top-level' ? 1 : 2),
        );
        const decodedKeys = ambiguityCase.members.map(({ rawKey }) => JSON.parse(rawKey) as string);
        expect(ambiguityCase.members[0].value).not.toBe(ambiguityCase.members[1].value);
        if (ambiguityCase.relation === 'nfc-collision') {
          expect(decodedKeys[0]).not.toBe(decodedKeys[1]);
          expect(decodedKeys[0]!.normalize('NFC')).toBe(decodedKeys[1]!.normalize('NFC'));
        } else {
          expect(decodedKeys[0]).toBe(decodedKeys[1]);
          expect(ambiguityCase.members[0].rawKey === ambiguityCase.members[1].rawKey)
            .toBe(ambiguityCase.relation === 'exact-duplicate');
        }

        const parsed = JSON.parse(manifestText) as Record<string, unknown>;
        expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
        expect(parsed.projectId).toBe(PROJECT_ID);
      });
    }

    it('reverses only the two ambiguous members in every paired fixture', () => {
      const byId = new Map(MANIFEST_AMBIGUITY_CASES.map((entry) => [entry.id, entry]));
      for (const [forwardId, reverseId] of MANIFEST_AMBIGUITY_REVERSE_PAIRS) {
        const forward = byId.get(forwardId);
        const reverse = byId.get(reverseId);
        expect(forward).toBeDefined();
        expect(reverse).toBeDefined();
        expect(reverse?.relation).toBe(forward?.relation);
        expect(reverse?.depth).toBe(forward?.depth);
        expect(reverse?.members).toEqual([forward?.members[1], forward?.members[0]]);
      }
    });

    it('constructs one non-ambiguous unknown-member control at both object depths', () => {
      expect(manifestAmbiguityControlShape.map(({ filename }) => filename)).toEqual([
        'lociview.json',
        `ops/${MIXED_ACTOR}.jsonl`,
      ]);
      const payload = manifestAmbiguityControlShape[0]?.payload;
      if (payload === null || payload === undefined) throw new Error('missing ambiguity control manifest');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
      expect(text).toBe(MANIFEST_AMBIGUITY_CONTROL_TEXT);
      expect([...payload].every((byte) => byte <= 0x7f)).toBe(true);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(parsed['\u00e9']).toBe('top NFC singleton');
      expect(parsed.future).toEqual({
        label: 'nested escaped singleton',
        '\u00e9': 'nested NFC singleton',
      });
    });

    it('registers both isolated invalid-scalar cases and reproduces every ZIP byte-for-byte', () => {
      expect(MANIFEST_SCALAR_CASES.map(({ id, location, escapedScalar }) =>
        [id, location, escapedScalar])).toEqual([
        ['manifest-lone-high-surrogate-name', 'known-name-value', '\\uD83D'],
        ['manifest-lone-low-surrogate-nested-key', 'unknown-nested-key', '\\uDE00'],
      ]);
      expect(Object.values(manifestScalarDeterministic)).toEqual([true, true]);
    });

    for (const scalarCase of MANIFEST_SCALAR_CASES) {
      it(`${scalarCase.id}: freezes the raw ASCII escape and decoded non-scalar at its exact depth`, () => {
        const shapes = manifestScalarShapes[scalarCase.id];
        expect(shapes.map(({ filename }) => filename)).toEqual([
          'lociview.json',
          `ops/${MIXED_ACTOR}.jsonl`,
        ]);
        const manifestPayload = shapes[0]?.payload;
        const opsPayload = shapes[1]?.payload;
        if (manifestPayload === null || manifestPayload === undefined ||
            opsPayload === null || opsPayload === undefined) {
          throw new Error(`missing manifest scalar payload: ${scalarCase.id}`);
        }
        const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestPayload);
        expect(manifestText).toBe(scalarCase.manifestText);
        expect([...manifestPayload].every((byte) => byte <= 0x7f)).toBe(true);
        expect(manifestText.split(scalarCase.escapedScalar)).toHaveLength(2);
        expect(new TextDecoder('utf-8', { fatal: true }).decode(opsPayload))
          .toBe(MANIFEST_AMBIGUITY_OPS_TEXT);

        const parsed = JSON.parse(manifestText) as Record<string, unknown>;
        expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
        expect(parsed.projectId).toBe(PROJECT_ID);
        let decoded: unknown;
        let rawToken: string;
        if (scalarCase.location === 'known-name-value') {
          decoded = parsed.name;
          rawToken = `"name":"${scalarCase.escapedScalar}"`;
        } else {
          const future = parsed.future as Record<string, unknown>;
          decoded = Object.keys(future)[0];
          rawToken = `"${scalarCase.escapedScalar}":"invalid scalar key"`;
        }
        if (typeof decoded !== 'string') throw new Error(`missing decoded scalar: ${scalarCase.id}`);
        const tokenOffset = manifestText.indexOf(rawToken);
        expect(tokenOffset).toBeGreaterThanOrEqual(0);
        expect(jsonObjectDepthAt(manifestText, tokenOffset))
          .toBe(scalarCase.location === 'known-name-value' ? 1 : 2);
        expect(decoded).toHaveLength(1);
        expect(decoded.charCodeAt(0)).toBe(
          scalarCase.location === 'known-name-value' ? 0xd83d : 0xde00,
        );
        expect(isUnicodeScalarText(decoded)).toBe(false);
        expect(decoded.includes('\ufffd')).toBe(false);
      });
    }

    it('pairs the same surrogate code units into one valid astral scalar at both locations', () => {
      expect(manifestScalarControlShape.map(({ filename }) => filename)).toEqual([
        'lociview.json',
        `ops/${MIXED_ACTOR}.jsonl`,
      ]);
      const manifestPayload = manifestScalarControlShape[0]?.payload;
      const opsPayload = manifestScalarControlShape[1]?.payload;
      if (manifestPayload === null || manifestPayload === undefined ||
          opsPayload === null || opsPayload === undefined) {
        throw new Error('missing valid manifest scalar control payload');
      }
      const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestPayload);
      expect(manifestText).toBe(MANIFEST_SCALAR_CONTROL_TEXT);
      expect([...manifestPayload].every((byte) => byte <= 0x7f)).toBe(true);
      expect(manifestText.split(VALID_ASTRAL_ESCAPE)).toHaveLength(3);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(opsPayload))
        .toBe(MANIFEST_AMBIGUITY_OPS_TEXT);
      expect(manifestScalarControlDeterministic).toBe(true);

      const parsed = JSON.parse(manifestText) as Record<string, unknown>;
      const future = parsed.future as Record<string, unknown>;
      const nestedKey = Object.keys(future)[0];
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.projectId).toBe(PROJECT_ID);
      expect(parsed.name).toBe(VALID_ASTRAL_SCALAR);
      expect(nestedKey).toBe(VALID_ASTRAL_SCALAR);
      for (const scalar of [parsed.name, nestedKey]) {
        if (typeof scalar !== 'string') throw new Error('missing valid astral scalar control');
        expect(scalar).toHaveLength(2);
        expect(Array.from(scalar)).toHaveLength(1);
        expect(scalar.codePointAt(0)).toBe(0x1f600);
        expect(isUnicodeScalarText(scalar)).toBe(true);
        expect(scalar.includes('\ufffd')).toBe(false);
      }
    });

    it('registers every reserved key at every isolated depth with balanced raw spellings', () => {
      expect(MANIFEST_RESERVED_CASES.map(({ id, decodedKey, depth, rawKey }) =>
        [id, decodedKey, depth, rawKey])).toEqual([
        ['manifest-reserved-dunder-proto-root', '__proto__', 'root', '__pr\\u006fto__'],
        ['manifest-reserved-dunder-proto-nested', '__proto__', 'nested', '__proto__'],
        ['manifest-reserved-dunder-proto-deep', '__proto__', 'deep', '__proto__'],
        ['manifest-reserved-prototype-root', 'prototype', 'root', 'prototype'],
        ['manifest-reserved-prototype-nested', 'prototype', 'nested', 'pr\\u006ftotype'],
        ['manifest-reserved-prototype-deep', 'prototype', 'deep', 'prototype'],
        ['manifest-reserved-constructor-root', 'constructor', 'root', 'constructor'],
        ['manifest-reserved-constructor-nested', 'constructor', 'nested', 'constructor'],
        ['manifest-reserved-constructor-deep', 'constructor', 'deep', 'constr\\u0075ctor'],
      ]);
      expect(Object.values(manifestReservedDeterministic))
        .toEqual(MANIFEST_RESERVED_CASES.map(() => true));
    });

    for (const reservedCase of MANIFEST_RESERVED_CASES) {
      it(`${reservedCase.id}: freezes one decoded dangerous own key at the exact object depth`, () => {
        const shapes = manifestReservedShapes[reservedCase.id];
        expect(shapes.map(({ filename }) => filename)).toEqual([
          'lociview.json',
          `ops/${MIXED_ACTOR}.jsonl`,
        ]);
        const manifestPayload = shapes[0]?.payload;
        const opsPayload = shapes[1]?.payload;
        if (manifestPayload === null || manifestPayload === undefined ||
            opsPayload === null || opsPayload === undefined) {
          throw new Error(`missing manifest reserved-key payload: ${reservedCase.id}`);
        }
        const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestPayload);
        expect(manifestText).toBe(reservedCase.manifestText);
        expect([...manifestPayload].every((byte) => byte <= 0x7f)).toBe(true);
        expect(new TextDecoder('utf-8', { fatal: true }).decode(opsPayload))
          .toBe(MANIFEST_AMBIGUITY_OPS_TEXT);
        const rawKeyToken = `"${reservedCase.rawKey}"`;
        expect(manifestText.split(rawKeyToken)).toHaveLength(2);
        const tokenOffset = manifestText.indexOf(rawKeyToken);
        expect(jsonObjectDepthAt(manifestText, tokenOffset)).toBe(
          reservedCase.depth === 'root' ? 1 : reservedCase.depth === 'nested' ? 2 : 3,
        );
        expect(JSON.parse(rawKeyToken)).toBe(reservedCase.decodedKey);

        const parsed = JSON.parse(manifestText) as Record<string, unknown>;
        expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
        expect(parsed.projectId).toBe(PROJECT_ID);
        expect(countDangerousOwnKeys(parsed)).toBe(1);
        const container = manifestReservedContainer(parsed, reservedCase.depth);
        const dangerousDescriptor = Reflect.getOwnPropertyDescriptor(
          container,
          reservedCase.decodedKey,
        );
        expect(dangerousDescriptor).toMatchObject({
          configurable: true,
          enumerable: true,
          writable: true,
        });
        if (dangerousDescriptor === undefined || !('value' in dangerousDescriptor) ||
            typeof dangerousDescriptor.value !== 'object' || dangerousDescriptor.value === null) {
          throw new Error(`missing dangerous own-key value: ${reservedCase.id}`);
        }
        expect(Reflect.getOwnPropertyDescriptor(
          dangerousDescriptor.value,
          reservedCase.pollutionProperty,
        )?.value).toBe(true);
      });
    }

    it('builds a deterministic three-depth control with only safe near-miss keys and reserved values', () => {
      expect(manifestReservedControlShape.map(({ filename }) => filename)).toEqual([
        'lociview.json',
        `ops/${MIXED_ACTOR}.jsonl`,
      ]);
      const manifestPayload = manifestReservedControlShape[0]?.payload;
      const opsPayload = manifestReservedControlShape[1]?.payload;
      if (manifestPayload === null || manifestPayload === undefined ||
          opsPayload === null || opsPayload === undefined) {
        throw new Error('missing manifest reserved-key control payload');
      }
      const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestPayload);
      expect(manifestText).toBe(MANIFEST_RESERVED_CONTROL_TEXT);
      expect([...manifestPayload].every((byte) => byte <= 0x7f)).toBe(true);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(opsPayload))
        .toBe(MANIFEST_AMBIGUITY_OPS_TEXT);
      expect(manifestReservedControlDeterministic).toBe(true);

      const parsed = JSON.parse(manifestText) as Record<string, unknown>;
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.projectId).toBe(PROJECT_ID);
      expect(parsed.name).toBe(MANIFEST_RESERVED_CONTROL_NAME);
      expect(countDangerousOwnKeys(parsed)).toBe(0);
      expect(ownJsonValue(parsed, '__proto__Safe')).toBe('__proto__');
      const future = ownJsonValue(parsed, 'future') as Record<string, unknown>;
      expect(ownJsonValue(future, 'prototypeSafe')).toBe('prototype');
      const items = ownJsonValue(future, 'items') as unknown[];
      expect(ownJsonValue(items[0] as Record<string, unknown>, 'constructorSafe'))
        .toBe('constructor');
    });

    it('constructs raw duplicate paths in both input orders with both payloads intact', () => {
      for (const key of ['rawDuplicate', 'rawDuplicateReversed']) {
        const duplicates = fixtureShapes[key]!.filter(({ filename }) => filename === 'models/raw-a.glb');
        expect(duplicates).toHaveLength(2);
        expect(duplicates.every(({ rawFilename, localRawFilename }) =>
          new TextDecoder().decode(rawFilename) === 'models/raw-a.glb' &&
          new TextDecoder().decode(localRawFilename) === 'models/raw-a.glb')).toBe(true);
      }
      expect(fixtureShapes.rawDuplicate!.slice(1).map(({ payload }) => new TextDecoder().decode(payload!)))
        .toEqual(['first raw payload', 'second raw payload']);
      expect(fixtureShapes.rawDuplicateReversed!.slice(1).map(({ payload }) => new TextDecoder().decode(payload!)))
        .toEqual(['second raw payload', 'first raw payload']);
    });

    it('constructs duplicate manifests in both input orders', () => {
      expect(names('duplicateManifest')).toEqual(['lociview.json', 'lociview.json']);
      expect(names('duplicateManifestReversed')).toEqual(['lociview.json', 'lociview.json']);
      const projectIds = (key: string) => fixtureShapes[key]!.map(({ payload }) =>
        (JSON.parse(new TextDecoder().decode(payload!)) as { projectId: string }).projectId);
      expect(projectIds('duplicateManifest')).toEqual([
        'prj_00000000000000000000000091',
        'prj_00000000000000000000000092',
      ]);
      expect(projectIds('duplicateManifestReversed')).toEqual([
        'prj_00000000000000000000000092',
        'prj_00000000000000000000000091',
      ]);
    });

    it('constructs the exact repeated-separator collision', () => {
      const pair = names('normalized').slice(1);
      expect(pair).toEqual(['models/repeat//blob.glb', 'models/repeat/blob.glb']);
      expect(pair.map((name) => name.replace(/\/+/g, '/'))).toEqual([
        'models/repeat/blob.glb',
        'models/repeat/blob.glb',
      ]);
    });

    it('constructs NFC/NFD collisions in both input orders', () => {
      expect(names('unicode').slice(1)).toEqual(['media/caf\u00e9.jpg', 'media/cafe\u0301.jpg']);
      expect(names('unicodeReversed').slice(1)).toEqual(['media/cafe\u0301.jpg', 'media/caf\u00e9.jpg']);
      for (const key of ['unicode', 'unicodeReversed']) {
        const pair = names(key).slice(1);
        expect(pair[0]).not.toBe(pair[1]);
        expect(pair[0]!.normalize('NFC')).toBe(pair[1]!.normalize('NFC'));
      }
    });

    it('constructs platform-case collisions in both input orders', () => {
      expect(names('platformCase').slice(1)).toEqual(['models/Case.glb', 'models/case.glb']);
      expect(names('platformCaseReversed').slice(1)).toEqual(['models/case.glb', 'models/Case.glb']);
      for (const key of ['platformCase', 'platformCaseReversed']) {
        const pair = names(key).slice(1);
        expect(pair[0]).not.toBe(pair[1]);
        expect(pair[0]!.toLowerCase()).toBe(pair[1]!.toLowerCase());
      }
    });

    it('contains canonical op1/op2 followed by one malformed JSON line', () => {
      const text = payloadText('mixed', `ops/${MIXED_ACTOR}.jsonl`);
      expect(text).toBe(mixedOpsWireText());
      const lines = text.trimEnd().split('\n');
      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[0]!)).toMatchObject({ op: 1, actor: MIXED_ACTOR, id: BASE_CAPTION_ID });
      expect(JSON.parse(lines[1]!)).toMatchObject({ op: 2, actor: MIXED_ACTOR, id: MIXED_CAPTION_ID });
      expect(() => JSON.parse(lines[2]!)).toThrow();
    });

    it('contains malformed UTF-8 manifest bytes that fatal decoding rejects', () => {
      const payload = fixtureShapes.invalidUtf8Manifest![0]!.payload;
      expect(containsBytes(payload, new Uint8Array([0xc3, 0x28]))).toBe(true);
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(payload!)).toThrow();
    });

    it('contains exactly the next schema version in the raw manifest', () => {
      const manifest = JSON.parse(payloadText('futureSchema', 'lociview.json')) as { schemaVersion: number };
      expect(manifest.schemaVersion).toBe(SCHEMA_VERSION + 1);
    });

    it('constructs malformed UTF-8 raw names, encrypted/unsupported entries, and Unix special modes', () => {
      const malformed = fixtureShapes.malformedUtf8Name![1]!;
      expect(malformed.rawFilename).toEqual(MALFORMED_RAW_FILENAME);
      expect(malformed.localRawFilename).toEqual(MALFORMED_RAW_FILENAME);
      expect(malformed.filenameUTF8).toBe(true);
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(malformed.rawFilename)).toThrow();
      expect(fixtureShapes.encrypted![1]!.encrypted).toBe(true);
      expect(fixtureShapes.unsupportedCompression![1]!.compressionMethod).toBe(12);
      expect(fixtureShapes.symlink![1]!.unixMode! & UNIX_TYPE_MASK).toBe(UNIX_SYMLINK_MODE & UNIX_TYPE_MASK);
      expect(fixtureShapes.specialMode![1]!.unixMode! & UNIX_TYPE_MASK).toBe(UNIX_FIFO_MODE & UNIX_TYPE_MASK);
    });

    it('constructs unsafe directories, duplicate JSON, and local/central name disagreement exactly', () => {
      const directory = fixtureShapes.unsafeDirectory![1]!;
      expect(directory.filename).toBe('../escape/');
      expect(directory.directory).toBe(true);
      const duplicateJson = payloadText('duplicateJsonMember', 'lociview.json');
      expect(duplicateJson.match(/"name":/g)).toHaveLength(2);
      const mismatch = fixtureShapes.localCentralMismatch![1]!;
      expect(new TextDecoder().decode(mismatch.rawFilename)).toBe('models/central.glb');
      expect(new TextDecoder().decode(mismatch.localRawFilename)).toBe('models/locally.glb');
    });

    it('constructs the directory-count and foreign normalized-collision fixtures exactly', () => {
      const directoryShapes = fixtureShapes.directoryCount!;
      expect(directoryShapes).toHaveLength(3);
      expect(directoryShapes.map(({ filename }) => filename)).toEqual([
        'lociview.json',
        'directory-a/',
        'directory-b/',
      ]);
      expect(directoryShapes.slice(1).every(({ directory }) => directory)).toBe(true);

      const foreignShapes = fixtureShapes.foreignNormalizedCollision!;
      expect(foreignShapes.map(({ filename }) => filename)).toEqual([
        'folder//photo.jpg',
        'folder/photo.jpg',
      ]);
      expect(foreignShapes[0]!.filename.replace(/\/+/g, '/')).toBe(foreignShapes[1]!.filename);
      expect(new TextDecoder().decode(foreignShapes[0]!.payload!)).toBe('first image');
      expect(new TextDecoder().decode(foreignShapes[1]!.payload!)).toBe('second image');
      expect(foreignShapes[0]!.payload).not.toEqual(foreignShapes[1]!.payload);
    });
  });

  describe('currently enforced rejection boundaries', () => {
    const enforcedCases = [
      'unsafe-traversal',
      'invalid-manifest-schema',
      'nested-archive',
      'encrypted-entry',
      'unsupported-compression',
    ] as const;

    for (const id of enforcedCases) {
      it(`${id}: rejects during side-effect-free inspection`, () => {
        expect(outcomes[id].inspectionRejected).toBe(true);
        expect(outcomes[id].mutationCalls).toBe(0);
      });

      it(`${id}: leaves the candidate project completely unmodified`, () => {
        expect(candidateIsUnmodified(outcomes[id])).toBe(true);
      });

      it(`${id}: leaves an existing control project byte-exact`, () => {
        expect(outcomes[id].controlUnchanged).toBe(true);
      });
    }

    it('nested-archive reports the typed nested-archive guard code', () => {
      const error = outcomes['nested-archive'].inspectionError;
      expect(error).toBeInstanceOf(ZipGuardError);
      expect((error as ZipGuardError).code).toBe('nested-archive');
    });

    for (const id of ['encrypted-entry', 'unsupported-compression'] as const) {
      it(`${id}: rejects the whole envelope even before a typed issue exists`, () => {
        expect(outcomes[id].inspectionError).toBeInstanceOf(Error);
      });
    }
  });

  describe('injected ZIP limit controls', () => {
    const expectedCodes = {
      entries: 'too-many-entries',
      entryBytes: 'entry-too-large',
      totalBytes: 'total-too-large',
    } as const;
    for (const key of Object.keys(expectedCodes) as Array<keyof typeof expectedCodes>) {
      it(`${key}: enforces the small injected limit without asserting a product threshold`, () => {
        expect(limitErrors[key]).toBeInstanceOf(ZipGuardError);
        expect((limitErrors[key] as ZipGuardError).code).toBe(expectedCodes[key]);
      });
    }
  });

  describe('missing envelope rejection boundaries', () => {
    const unsafeCases = [
      'raw-duplicate-path',
      'raw-duplicate-path-reversed',
      'normalized-separator-collision',
      'unicode-normalization-collision',
      'unicode-normalization-collision-reversed',
      'platform-case-collision',
      'platform-case-collision-reversed',
      'duplicate-manifest',
      'duplicate-manifest-reversed',
      'invalid-utf8-manifest',
      'malformed-utf8-entry-name',
      'symlink-entry',
      'special-mode-entry',
      'unsafe-directory-path',
      'directory-count-bypass',
      'local-central-name-mismatch',
    ] as const;

    for (const id of unsafeCases) {
      it(`${id}: leaves an existing control project byte-exact`, () => {
        expect(outcomes[id].controlUnchanged).toBe(true);
      });

      it.fails(`${id}: rejects during envelope inspection`, () => {
        expect(outcomes[id].inspectionRejected).toBe(true);
      });

      it.fails(`${id}: performs no workspace mutations when inspection rejects`, () => {
        expect(outcomes[id].mutationCalls).toBe(0);
      });

      it.fails(`${id}: never publishes the candidate completion marker`, () => {
        expect(candidateIsInactive(outcomes[id])).toBe(true);
      });
    }

    it.fails('future-schema: edit-mode import rejects a future schema boundary', () => {
      expect(rejectedBeforeActivation(outcomes['future-schema'])).toBe(true);
    });

    it.fails('future-schema: edit-mode import never publishes a completion marker', () => {
      expect(candidateIsInactive(outcomes['future-schema'])).toBe(true);
    });

    it('future-schema: leaves an existing control project byte-exact', () => {
      expect(outcomes['future-schema'].controlUnchanged).toBe(true);
    });

    it('mixed-valid-invalid: leaves an existing control project byte-exact', () => {
      expect(outcomes['mixed-valid-invalid'].controlUnchanged).toBe(true);
    });

    it.fails('mixed-valid-invalid: never publishes a completion marker', () => {
      expect(candidateIsInactive(outcomes['mixed-valid-invalid'])).toBe(true);
    });

    it.fails('mixed-valid-invalid: never exposes the valid member of a rejected package', () => {
      expect(outcomes['mixed-valid-invalid'].mixedValidCaptionVisible).toBe(false);
    });

    describe('foreign normalized collision through build/apply', () => {
      it.fails('rejects before building an import plan', () => {
        expect(foreignCollisionOutcome.inspectionRejected).toBe(true);
      });

      it.fails('performs no workspace mutation', () => {
        expect(foreignCollisionOutcome.mutationCalls).toBe(0);
      });

      it.fails('publishes no foreign-project completion marker', () => {
        expect(foreignCollisionOutcome.activeMarkerCount).toBe(0);
      });
    });

    describe('mixed valid + invalid existing-project merge', () => {
      it.fails('leaves the existing actor log byte-exact', () => {
        expect(existingMergeOutcome.rawLogUnchanged).toBe(true);
      });

      it.fails('leaves the in-memory raw operation set unchanged', () => {
        expect(existingMergeOutcome.allOpsUnchanged).toBe(true);
      });

      it.fails('leaves the in-memory reduced state unchanged', () => {
        expect(existingMergeOutcome.stateUnchanged).toBe(true);
      });

      it.fails('reopens with the same active operation set and reduced state', () => {
        expect(existingMergeOutcome.reopenedStateUnchanged).toBe(true);
      });

      it.fails('leaves the internal HLC and own sequence unchanged', () => {
        expect(existingMergeOutcome.internalClockAndSequenceUnchanged).toBe(true);
      });
    });
  });

  describe('ambiguous manifest members stay outside active authority', () => {
    it('accepts the non-ambiguous unknown-member control through inspection', () => {
      expect(manifestAmbiguityControlAccepted).toBe(true);
    });

    it('initializes every case and leaves the unrelated control project byte-exact', () => {
      expect(MANIFEST_AMBIGUITY_CASES.map(({ id }) => manifestAmbiguityResults[id].initialized))
        .toEqual(MANIFEST_AMBIGUITY_CASES.map(() => true));
      expect(MANIFEST_AMBIGUITY_CASES.map(({ id }) => manifestAmbiguityResults[id].controlUnchanged))
        .toEqual(MANIFEST_AMBIGUITY_CASES.map(() => true));
    });

    for (const ambiguityCase of MANIFEST_AMBIGUITY_CASES) {
      it.fails(`${ambiguityCase.id}: never publishes a candidate completion marker`, () => {
        expect(manifestAmbiguityResults[ambiguityCase.id].completionMarkerNeverPublished)
          .toBe(true);
      });

      it.fails(`${ambiguityCase.id}: never activates the valid sentinel operation`, () => {
        expect(manifestAmbiguityResults[ambiguityCase.id].sentinelNeverActive).toBe(true);
      });

      it.fails(`${ambiguityCase.id}: leaves existing active authority unchanged`, () => {
        expect(manifestAmbiguityResults[ambiguityCase.id].existingAuthorityUnchanged).toBe(true);
      });
    }
  });

  describe('invalid Unicode scalar escapes stay outside active authority', () => {
    it('accepts and round-trips the paired astral-scalar control through import and merge', () => {
      expect(manifestScalarControlRoundTrips).toBe(true);
    });

    it('initializes every invalid case and leaves the unrelated control project byte-exact', () => {
      expect(MANIFEST_SCALAR_CASES.map(({ id }) => manifestScalarResults[id].initialized))
        .toEqual(MANIFEST_SCALAR_CASES.map(() => true));
      expect(MANIFEST_SCALAR_CASES.map(({ id }) => manifestScalarResults[id].controlUnchanged))
        .toEqual(MANIFEST_SCALAR_CASES.map(() => true));
    });

    for (const scalarCase of MANIFEST_SCALAR_CASES) {
      it.fails(`${scalarCase.id}: never publishes a candidate completion marker`, () => {
        expect(manifestScalarResults[scalarCase.id].completionMarkerNeverPublished).toBe(true);
      });

      it.fails(`${scalarCase.id}: never activates the valid sentinel operation`, () => {
        expect(manifestScalarResults[scalarCase.id].sentinelNeverActive).toBe(true);
      });

      it.fails(`${scalarCase.id}: leaves existing active authority unchanged`, () => {
        expect(manifestScalarResults[scalarCase.id].existingAuthorityUnchanged).toBe(true);
      });
    }
  });

  describe('recursive manifest reserved keys stay outside active authority', () => {
    it('accepts the safe near-miss/value-only control through import, reopen and merge', () => {
      expect(manifestReservedControlRoundTrips).toBe(true);
    });

    it('initializes every isolated key/depth case and leaves the unrelated control byte-exact', () => {
      expect(MANIFEST_RESERVED_CASES.map(({ id }) => manifestReservedResults[id].initialized))
        .toEqual(MANIFEST_RESERVED_CASES.map(() => true));
      expect(MANIFEST_RESERVED_CASES.map(({ id }) => manifestReservedResults[id].controlUnchanged))
        .toEqual(MANIFEST_RESERVED_CASES.map(() => true));
    });

    it('preserves Object/Object.prototype own descriptors and prototype links across each attempt', () => {
      expect(MANIFEST_RESERVED_CASES.map(({ id }) =>
        manifestReservedResults[id].objectIntrinsicsIntact))
        .toEqual(MANIFEST_RESERVED_CASES.map(() => true));
    });

    for (const reservedCase of MANIFEST_RESERVED_CASES) {
      it.fails(`${reservedCase.id}: never publishes a candidate completion marker`, () => {
        expect(manifestReservedResults[reservedCase.id].completionMarkerNeverPublished).toBe(true);
      });

      it.fails(`${reservedCase.id}: never activates the valid sentinel operation`, () => {
        expect(manifestReservedResults[reservedCase.id].sentinelNeverActive).toBe(true);
      });

      it.fails(`${reservedCase.id}: leaves existing active authority unchanged`, () => {
        expect(manifestReservedResults[reservedCase.id].existingAuthorityUnchanged).toBe(true);
      });
    }
  });

  describe('observable policy still deferred from this initial slice', () => {
    it.todo('reports a typed blocked/quarantined issue for mixed valid/malformed operations without depending on throw versus return');
    it.todo('reports typed encrypted, unsupported-compression, symlink, and special-mode issues');
    it.todo('enforces a ratified compression-ratio and device-budget policy without inventing numeric limits');
    it.todo('checks declared manifest size/digest and required-blob closure once the envelope declares them');
    it.todo('distinguishes a future major from a compatible minor once schemaVersion has a major discriminator');
    it.todo('rejects non-NFC persisted string values before canonical object construction');
    it.todo('reports a typed blocked/quarantined manifest ambiguity, invalid-scalar or reserved-key issue without depending on throw versus return or evidence location');
    it.todo('ratifies injectable v1 JSON depth, node, field, array and string budgets instead of reusing v2 semantic ceilings');
    it.todo('defines evidence access without requiring valid astral JSON escapes to retain their original raw spelling after import');
  });
});
