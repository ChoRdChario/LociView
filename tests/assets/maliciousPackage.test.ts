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

  resetMutationCalls(): void {
    this.mutationCalls = 0;
  }

  override async writeText(path: string, text: string): Promise<void> {
    this.mutationCalls += 1;
    await super.writeText(path, text);
  }

  override async appendText(path: string, text: string): Promise<void> {
    this.mutationCalls += 1;
    await super.appendText(path, text);
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.mutationCalls += 1;
    await super.writeBytes(path, data);
  }

  override async remove(path: string): Promise<void> {
    this.mutationCalls += 1;
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
  | 'duplicate-json-member'
  | 'local-central-name-mismatch';

interface ImportAttempt {
  inspectionRejected: boolean;
  inspectionError: unknown;
  importRejected: boolean;
  active: boolean;
  candidateFiles: string[];
  mutationCalls: number;
  controlUnchanged: boolean;
  mixedValidCaptionVisible: boolean;
}

interface ForeignImportAttempt {
  inspectionRejected: boolean;
  mutationCalls: number;
  activeMarkerCount: number;
}

interface ExistingMergeAttempt {
  rejected: boolean;
  rawLogUnchanged: boolean;
  allOpsUnchanged: boolean;
  stateUnchanged: boolean;
  filesUnchanged: boolean;
  notificationsUnchanged: boolean;
  internalClockAndSequenceUnchanged: boolean;
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

async function fileSnapshot(fs: MemoryFS, prefix: string): Promise<string> {
  const paths = await fs.list(prefix);
  const files = await Promise.all(paths.map(async (path) => {
    const data = await fs.readBytes(path);
    return [path, data === null ? null : [...data]] as const;
  }));
  return JSON.stringify(files);
}

async function attemptNewProject(
  id: FixtureId,
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

async function attemptExistingProjectMerge(zip: Uint8Array): Promise<ExistingMergeAttempt> {
  const fs = new MemoryFS();
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
  const filesBefore = await fileSnapshot(fs, `${dir}/`);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  let rejected = false;
  try {
    let inspection: Awaited<ReturnType<typeof inspectZip>> | null = null;
    try {
      inspection = await inspectZip(zip);
    } catch {
      rejected = true;
    }
    if (inspection !== null) {
      try {
        await mergeFromInspection(fs, dir, store, inspection);
      } catch {
        rejected = true;
      }
    }
  } finally {
    unsubscribe();
  }

  const rawLogUnchanged = bytesEqual(await fs.readBytes(logPath), rawBefore);
  const allOpsUnchanged = JSON.stringify(store.allOps) === allOpsBefore;
  const stateUnchanged = JSON.stringify(store.state) === stateBefore;
  const filesUnchanged = (await fileSnapshot(fs, `${dir}/`)) === filesBefore;
  const notificationsUnchanged = notifications === 0;

  const probeInput = {
    t: 'create' as const,
    e: 'caption',
    id: 'cap_00000000000000000000000093',
    v: { title: 'post-rejection clock probe' },
  };
  const targetProbe = store.dispatch(probeInput);
  const controlProbe = twinStore.dispatch(probeInput);
  await Promise.all([store.flush(), twinStore.flush()]);

  return {
    rejected,
    rawLogUnchanged,
    allOpsUnchanged,
    stateUnchanged,
    filesUnchanged,
    notificationsUnchanged,
    internalClockAndSequenceUnchanged: JSON.stringify(targetProbe) === JSON.stringify(controlProbe),
  };
}

describe('G0 characterization: malicious ZIP envelope', () => {
  let outcomes: Record<FixtureId, ImportAttempt>;
  let existingMergeOutcome: ExistingMergeAttempt;
  let foreignCollisionOutcome: ForeignImportAttempt;
  let fixtureShapes: Record<string, RawZipEntryShape[]>;
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
    const duplicateJsonMemberZip = await writeDirectZip([
      { path: 'lociview.json', data: duplicateJsonMemberManifestBytes() },
    ]);
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
      duplicateJsonMember: await rawZipEntryShapes(duplicateJsonMemberZip),
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
        'duplicate-json-member': await attemptNewProject(
          'duplicate-json-member',
          duplicateJsonMemberZip,
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
      'mixed-valid-invalid',
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
      'duplicate-json-member',
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
      it.fails('rejects the inspection instead of merging its valid subset', () => {
        expect(existingMergeOutcome.rejected).toBe(true);
      });

      it.fails('leaves the existing actor log byte-exact', () => {
        expect(existingMergeOutcome.rawLogUnchanged).toBe(true);
      });

      it.fails('leaves the in-memory raw operation set unchanged', () => {
        expect(existingMergeOutcome.allOpsUnchanged).toBe(true);
      });

      it.fails('leaves the in-memory reduced state unchanged', () => {
        expect(existingMergeOutcome.stateUnchanged).toBe(true);
      });

      it.fails('leaves the target file inventory and bytes unchanged', () => {
        expect(existingMergeOutcome.filesUnchanged).toBe(true);
      });

      it.fails('does not notify subscribers for a rejected inspection', () => {
        expect(existingMergeOutcome.notificationsUnchanged).toBe(true);
      });

      it.fails('leaves the internal HLC and own sequence unchanged', () => {
        expect(existingMergeOutcome.internalClockAndSequenceUnchanged).toBe(true);
      });
    });
  });

  describe('observable policy still deferred from this initial slice', () => {
    it.todo('reports typed encrypted, unsupported-compression, symlink, and special-mode issues');
    it.todo('enforces a ratified compression-ratio and device-budget policy without inventing numeric limits');
    it.todo('checks declared manifest size/digest and required-blob closure once the envelope declares them');
    it.todo('distinguishes a future major from a compatible minor once schemaVersion has a major discriminator');
    it.todo('rejects non-NFC persisted strings and NFC-colliding metadata keys before object construction');
  });
});
