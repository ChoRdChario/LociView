import { beforeAll, describe, expect, it } from 'vitest';
import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
} from '@zip.js/zip.js';
import {
  readZipEntries,
  sanitizeZipPath,
  ZipGuardError,
  type ZipEntryData,
  type ZipLimits,
} from '../../src/assets/zipio';
import {
  rawZipEntryShapes,
  writeDirectZip,
  writeZipWithFalseCrc32,
  writeZipWithFalseUncompressedSize,
  writeZipWithMismatchedLocalEncryptionFlag,
  type DirectZipEntry,
  type RawZipEntryShape,
} from '../helpers/maliciousZip';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const GENEROUS_FIXTURE_LIMITS: ZipLimits = {
  maxEntries: 16,
  maxEntryBytes: 64 * 1024,
  maxTotalBytes: 256 * 1024,
};

interface ReadOutcome {
  rejected: boolean;
  error: unknown;
  entries: ZipEntryData[] | null;
}

interface FixtureOutcome extends ReadOutcome {
  bytes: Uint8Array;
  shapes: RawZipEntryShape[];
}

function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

async function captureRead(
  bytes: Uint8Array,
  limits: ZipLimits = GENEROUS_FIXTURE_LIMITS,
): Promise<ReadOutcome> {
  try {
    return { rejected: false, error: null, entries: await readZipEntries(bytes, limits) };
  } catch (error) {
    return { rejected: true, error, entries: null };
  }
}

async function makeFixtureOutcome(entries: readonly DirectZipEntry[]): Promise<FixtureOutcome> {
  const bytes = await writeDirectZip(entries);
  return {
    bytes,
    shapes: await rawZipEntryShapes(bytes),
    ...await captureRead(bytes),
  };
}

async function extractWithSignatureCheck(bytes: Uint8Array): Promise<{
  filenames: string[];
  payloads: Uint8Array[];
  passed: boolean;
}> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  try {
    const entries = await reader.getEntries();
    const payloads: Uint8Array[] = [];
    for (const entry of entries) {
      if (!entry.directory) {
        payloads.push(await entry.getData(new Uint8ArrayWriter(), { checkSignature: true }));
      }
    }
    return { filenames: entries.map(({ filename }) => filename), payloads, passed: true };
  } catch {
    return { filenames: [], payloads: [], passed: false };
  } finally {
    await reader.close().catch(() => undefined);
  }
}

describe('G0 ZIP structural characterization', () => {
  const portableRtlPath = 'media/صورة-é.jpg';
  const payload = encoder.encode('fixed writer payload');
  const directoryPayload = encoder.encode('explicit directory child');
  const nestedSuffixes = [
    'inner.zip',
    'inner.LOCIVIEW',
    'inner.7z',
    'inner.RAR',
    'inner.tar',
    'inner.GZ',
    'inner.tgz',
  ] as const;
  const benignPortablePaths = [
    'media/archive.zip.txt',
    'media/archive.zipper',
    'media/archive.tgz.preview',
    'media/zip',
    'media/model.tar.json',
    'media/cafe\u0301-singleton.jpg',
    'Models/MixedCase.glb',
  ] as const;
  const controlPathDefinitions = {
    'c0-file': { path: 'media/c0-\u001f.bin', directory: false },
    'del-file': { path: 'media/del-\u007f.bin', directory: false },
    'c1-file': { path: 'media/c1-\u0085.bin', directory: false },
    'c1-directory': { path: 'media/c1-\u0085-dir', directory: true },
  } as const;
  type ControlPathId = keyof typeof controlPathDefinitions;
  const prefixDefinitions = {
    'exact-parent-first': [
      { path: 'media/node', data: encoder.encode('parent file') },
      { path: 'media/node/child.bin', data: encoder.encode('child file') },
    ],
    'exact-child-first': [
      { path: 'media/node/child.bin', data: encoder.encode('child file') },
      { path: 'media/node', data: encoder.encode('parent file') },
    ],
    'case-parent-first': [
      { path: 'media/Node', data: encoder.encode('case parent file') },
      { path: 'media/node/child.bin', data: encoder.encode('case child file') },
    ],
    'case-child-first': [
      { path: 'media/node/child.bin', data: encoder.encode('case child file') },
      { path: 'media/Node', data: encoder.encode('case parent file') },
    ],
  } as const satisfies Record<string, readonly DirectZipEntry[]>;
  type PrefixId = keyof typeof prefixDefinitions;

  let writerBytes: Uint8Array;
  let writerBytesAgain: Uint8Array;
  let writerIntegrity: Awaited<ReturnType<typeof extractWithSignatureCheck>>;
  let writerReadOutcome: ReadOutcome;
  let writerShapes: RawZipEntryShape[];
  let directoryOutcome: FixtureOutcome;
  let nestedSuffixOutcomes: ReadOutcome[];
  let benignPortableOutcome: FixtureOutcome;
  let falseSizeOutcome: ReadOutcome;
  let falseSizeOriginalShape: RawZipEntryShape;
  let falseSizeShape: RawZipEntryShape;
  let controlPathOutcomes: Record<ControlPathId, FixtureOutcome>;
  let prefixOutcomes: Record<PrefixId, FixtureOutcome>;
  let contentDisguisedOutcome: FixtureOutcome;
  let innerArchiveBytes: Uint8Array;
  let innerArchiveIntegrity: Awaited<ReturnType<typeof extractWithSignatureCheck>>;
  let badCrcOutcome: FixtureOutcome;
  let badCrcOriginalShape: RawZipEntryShape;
  let localFlagOutcome: FixtureOutcome;
  let allAdversarialFixturesDeterministic: boolean;

  beforeAll(async () => {
    const writerEntries = [{ path: portableRtlPath, data: payload }] as const;
    writerBytes = await writeDirectZip(writerEntries);
    writerBytesAgain = await writeDirectZip(writerEntries);
    writerIntegrity = await extractWithSignatureCheck(writerBytes);
    writerReadOutcome = await captureRead(writerBytes);
    writerShapes = await rawZipEntryShapes(writerBytes);

    const explicitDirectoryEntries = [
      { path: 'media/explicit', options: { directory: true } },
      { path: 'media/explicit/child.bin', data: directoryPayload },
    ] as const;
    directoryOutcome = await makeFixtureOutcome(explicitDirectoryEntries);

    innerArchiveBytes = await writeDirectZip([
      { path: 'proof.txt', data: encoder.encode('valid inner ZIP') },
    ]);
    innerArchiveIntegrity = await extractWithSignatureCheck(innerArchiveBytes);
    nestedSuffixOutcomes = [];
    for (const path of nestedSuffixes) {
      nestedSuffixOutcomes.push(await captureRead(await writeDirectZip([
        { path, data: innerArchiveBytes },
      ])));
    }

    benignPortableOutcome = await makeFixtureOutcome(
      benignPortablePaths.map((path) => ({ path, data: encoder.encode(path) })),
    );

    const falseSizeEntries = [
      { path: 'media/false-size.bin', data: encoder.encode('known-size') },
    ] as const;
    const falseSizeOriginal = await writeDirectZip(falseSizeEntries);
    const falseSizeBytes = await writeZipWithFalseUncompressedSize(
      falseSizeEntries,
      'media/false-size.bin',
    );
    falseSizeOriginalShape = (await rawZipEntryShapes(falseSizeOriginal))[0]!;
    falseSizeShape = (await rawZipEntryShapes(
      falseSizeBytes,
      { extractPayload: false },
    ))[0]!;
    falseSizeOutcome = await captureRead(falseSizeBytes);

    const controlOutcomes = {} as Record<ControlPathId, FixtureOutcome>;
    for (const id of Object.keys(controlPathDefinitions) as ControlPathId[]) {
      const definition = controlPathDefinitions[id];
      controlOutcomes[id] = await makeFixtureOutcome([
        definition.directory
          ? { path: definition.path, options: { directory: true } }
          : { path: definition.path, data: encoder.encode(id) },
      ]);
    }
    controlPathOutcomes = controlOutcomes;

    const builtPrefixOutcomes = {} as Record<PrefixId, FixtureOutcome>;
    for (const id of Object.keys(prefixDefinitions) as PrefixId[]) {
      builtPrefixOutcomes[id] = await makeFixtureOutcome(prefixDefinitions[id]);
    }
    prefixOutcomes = builtPrefixOutcomes;

    contentDisguisedOutcome = await makeFixtureOutcome([
      { path: 'media/preview.bin', data: innerArchiveBytes },
    ]);

    const badCrcEntries = [
      { path: 'media/bad-crc.bin', data: encoder.encode('CRC must cover these bytes') },
    ] as const;
    const badCrcOriginal = await writeDirectZip(badCrcEntries);
    badCrcOriginalShape = (await rawZipEntryShapes(badCrcOriginal))[0]!;
    badCrcOutcome = {
      bytes: await writeZipWithFalseCrc32(badCrcEntries, 'media/bad-crc.bin'),
      shapes: [],
      rejected: false,
      error: null,
      entries: null,
    };
    badCrcOutcome.shapes = await rawZipEntryShapes(badCrcOutcome.bytes);
    Object.assign(badCrcOutcome, await captureRead(badCrcOutcome.bytes));

    const localFlagEntries = [
      { path: 'media/local-flag.bin', data: encoder.encode('plain bytes') },
    ] as const;
    localFlagOutcome = {
      bytes: await writeZipWithMismatchedLocalEncryptionFlag(
        localFlagEntries,
        'media/local-flag.bin',
      ),
      shapes: [],
      rejected: false,
      error: null,
      entries: null,
    };
    localFlagOutcome.shapes = await rawZipEntryShapes(localFlagOutcome.bytes);
    Object.assign(localFlagOutcome, await captureRead(localFlagOutcome.bytes));

    const deterministicPairs: Array<[Uint8Array, Uint8Array]> = [];
    for (const id of Object.keys(controlPathDefinitions) as ControlPathId[]) {
      const definition = controlPathDefinitions[id];
      deterministicPairs.push([
        controlPathOutcomes[id].bytes,
        await writeDirectZip([
          definition.directory
            ? { path: definition.path, options: { directory: true } }
            : { path: definition.path, data: encoder.encode(id) },
        ]),
      ]);
    }
    for (const id of Object.keys(prefixDefinitions) as PrefixId[]) {
      deterministicPairs.push([
        prefixOutcomes[id].bytes,
        await writeDirectZip(prefixDefinitions[id]),
      ]);
    }
    deterministicPairs.push(
      [contentDisguisedOutcome.bytes, await writeDirectZip([
        { path: 'media/preview.bin', data: innerArchiveBytes },
      ])],
      [badCrcOutcome.bytes, await writeZipWithFalseCrc32(badCrcEntries, 'media/bad-crc.bin')],
      [localFlagOutcome.bytes, await writeZipWithMismatchedLocalEncryptionFlag(
        localFlagEntries,
        'media/local-flag.bin',
      )],
    );
    allAdversarialFixturesDeterministic = deterministicPairs.every(([left, right]) =>
      bytesEqual(left, right));
  });

  describe('ordinary portable and writer controls', () => {
    it('rejects empty, dot, NUL, absolute and backslash paths while preserving an NFC RTL path', () => {
      for (const unsafePath of [
        '',
        '.',
        './media.bin',
        'media/./item.bin',
        'media/\u0000/item.bin',
        '/absolute.bin',
        'C:/absolute.bin',
        'media\\backslash.bin',
      ]) {
        expect(sanitizeZipPath(unsafePath)).toBeNull();
      }
      expect(portableRtlPath.normalize('NFC')).toBe(portableRtlPath);
      expect(sanitizeZipPath(portableRtlPath)).toBe(portableRtlPath);
    });

    it('writes fixed bytes and passes zip.js payload CRC verification without pinning raw layout', () => {
      expect(bytesEqual(writerBytes, writerBytesAgain)).toBe(true);
      expect(writerIntegrity).toEqual({
        filenames: [portableRtlPath],
        payloads: [payload],
        passed: true,
      });
      expect(writerReadOutcome).toEqual({
        rejected: false,
        error: null,
        entries: [{ path: portableRtlPath, data: payload }],
      });
      expect(writerShapes).toHaveLength(1);
      expect(writerShapes[0]!.localCrc32).toBe(writerShapes[0]!.centralCrc32);
      expect(writerShapes[0]!.localCompressedSize).toBe(writerShapes[0]!.centralCompressedSize);
      expect(writerShapes[0]!.localUncompressedSize).toBe(
        writerShapes[0]!.centralUncompressedSize,
      );
    });

    it('ignores an explicit directory and returns its child under injected generous fixture limits', () => {
      expect(directoryOutcome.rejected).toBe(false);
      expect(directoryOutcome.shapes.map(({ filename, directory }) => ({ filename, directory })))
        .toEqual([
          { filename: 'media/explicit/', directory: true },
          { filename: 'media/explicit/child.bin', directory: false },
        ]);
      expect(directoryOutcome.entries).toEqual([
        { path: 'media/explicit/child.bin', data: directoryPayload },
      ]);
    });

    it('rejects the complete nested-archive suffix matrix with typed guard errors', () => {
      expect(nestedSuffixOutcomes).toHaveLength(nestedSuffixes.length);
      for (const outcome of nestedSuffixOutcomes) {
        expect(outcome.rejected).toBe(true);
        expect(outcome.error).toBeInstanceOf(ZipGuardError);
        expect((outcome.error as ZipGuardError).code).toBe('nested-archive');
      }
    });

    it('accepts benign suffix-like, isolated NFD and mixed-case names without rewriting', () => {
      expect(benignPortableOutcome.rejected).toBe(false);
      expect(benignPortableOutcome.entries?.map(({ path }) => path)).toEqual(benignPortablePaths);
      expect(benignPortableOutcome.entries?.map(({ path, data }) => decoder.decode(data)))
        .toEqual(benignPortablePaths);
    });

    it('rejects a matching local/central false uncompressed size', () => {
      expect(falseSizeShape.filename).toBe('media/false-size.bin');
      expect(falseSizeShape.localUncompressedSize).toBe(falseSizeShape.centralUncompressedSize);
      expect(falseSizeShape.centralUncompressedSize).toBe(
        falseSizeOriginalShape.centralUncompressedSize + 1,
      );
      expect(falseSizeShape.centralCompressedSize).toBe(
        falseSizeOriginalShape.centralCompressedSize,
      );
      expect(falseSizeOutcome.rejected).toBe(true);
      expect(falseSizeOutcome.error).toBeInstanceOf(Error);
    });
  });

  describe('tests-only adversarial fixture shape', () => {
    it('builds every adversarial archive byte-identically under the fixed writer configuration', () => {
      expect(allAdversarialFixturesDeterministic).toBe(true);
    });

    it('constructs C0, DEL and C1 file paths plus a C1 directory path exactly', () => {
      for (const id of Object.keys(controlPathDefinitions) as ControlPathId[]) {
        const definition = controlPathDefinitions[id];
        const shape = controlPathOutcomes[id].shapes[0]!;
        const expectedFilename = definition.directory ? `${definition.path}/` : definition.path;
        expect(shape.filename).toBe(expectedFilename);
        expect(decoder.decode(shape.rawFilename)).toBe(expectedFilename);
        expect(decoder.decode(shape.localRawFilename)).toBe(expectedFilename);
        expect(shape.directory).toBe(definition.directory);
        expect(shape.localBitFlag).toBe(shape.centralBitFlag);
        expect(shape.localCrc32).toBe(shape.centralCrc32);
        expect(shape.localCompressedSize).toBe(shape.centralCompressedSize);
        expect(shape.localUncompressedSize).toBe(shape.centralUncompressedSize);
      }
    });

    it('constructs exact and case-folded file-prefix collisions in both entry orders', () => {
      for (const id of Object.keys(prefixDefinitions) as PrefixId[]) {
        const expectedPaths = prefixDefinitions[id].map(({ path }) => path);
        const actualPaths = prefixOutcomes[id].shapes.map(({ filename }) => filename);
        expect(actualPaths).toEqual(expectedPaths);
        expect(prefixOutcomes[id].shapes.map(({ payload }) => payload))
          .toEqual(prefixDefinitions[id].map(({ data }) => data));
        const parent = actualPaths.find((path) => !path.includes('/child.bin'))!;
        const child = actualPaths.find((path) => path.includes('/child.bin'))!;
        if (id.startsWith('case-')) {
          expect(child.toLowerCase().startsWith(`${parent.toLowerCase()}/`)).toBe(true);
          expect(child.startsWith(`${parent}/`)).toBe(false);
        } else {
          expect(child.startsWith(`${parent}/`)).toBe(true);
        }
      }
    });

    it('embeds a signature-valid inner ZIP as the exact preview.bin payload', () => {
      expect(innerArchiveIntegrity).toEqual({
        filenames: ['proof.txt'],
        payloads: [encoder.encode('valid inner ZIP')],
        passed: true,
      });
      expect(contentDisguisedOutcome.shapes).toHaveLength(1);
      expect(contentDisguisedOutcome.shapes[0]!.filename).toBe('media/preview.bin');
      expect(contentDisguisedOutcome.shapes[0]!.payload).toEqual(innerArchiveBytes);
    });

    it('constructs matching false CRC fields without changing sizes or payload bytes', () => {
      const shape = badCrcOutcome.shapes[0]!;
      expect(shape.localCrc32).toBe(shape.centralCrc32);
      expect(shape.centralCrc32).not.toBe(badCrcOriginalShape.centralCrc32);
      expect(shape.localCompressedSize).toBe(shape.centralCompressedSize);
      expect(shape.centralCompressedSize).toBe(badCrcOriginalShape.centralCompressedSize);
      expect(shape.localUncompressedSize).toBe(shape.centralUncompressedSize);
      expect(shape.centralUncompressedSize).toBe(badCrcOriginalShape.centralUncompressedSize);
      expect(shape.payload).toEqual(encoder.encode('CRC must cover these bytes'));
    });

    it('constructs only a local encryption-bit mismatch with all sizes and CRCs intact', () => {
      const shape = localFlagOutcome.shapes[0]!;
      expect(shape.filename).toBe('media/local-flag.bin');
      expect(shape.localBitFlag ^ shape.centralBitFlag).toBe(0x0001);
      expect(shape.localBitFlag & 0x0001).toBe(0x0001);
      expect(shape.centralBitFlag & 0x0001).toBe(0);
      expect(shape.localCrc32).toBe(shape.centralCrc32);
      expect(shape.localCompressedSize).toBe(shape.centralCompressedSize);
      expect(shape.localUncompressedSize).toBe(shape.centralUncompressedSize);
      expect(shape.payload).toEqual(encoder.encode('plain bytes'));
    });
  });

  describe('missing structural rejection boundaries', () => {
    for (const id of Object.keys(controlPathDefinitions) as ControlPathId[]) {
      it(`${id}: rejects the complete archive`, () => {
        expect(controlPathOutcomes[id].rejected).toBe(true);
      });
    }

    for (const id of Object.keys(prefixDefinitions) as PrefixId[]) {
      it(`${id}: rejects the complete archive`, () => {
        expect(prefixOutcomes[id].rejected).toBe(true);
      });
    }

    it('content-disguised nested ZIP: rejects the complete archive', () => {
      expect(contentDisguisedOutcome.rejected).toBe(true);
    });

    it('bad CRC: rejects the complete archive', () => {
      expect(badCrcOutcome.rejected).toBe(true);
    });

    it('local/central encryption-bit mismatch: rejects the complete archive', () => {
      expect(localFlagOutcome.rejected).toBe(true);
    });
  });
});
