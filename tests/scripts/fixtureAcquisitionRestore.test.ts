import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  link as fsLink,
  lstat,
  mkdir,
  mkdtemp,
  open as fsOpen,
  readFile,
  rm,
  unlink as fsUnlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createTestAttemptControl } from '../../scripts/fixtures/acquisition/attempt.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { loadTrustedModeBDescriptor, parseModeBReceiptBytes } from '../../scripts/fixtures/acquisition/contracts.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createTestFilesystem } from '../../scripts/fixtures/acquisition/filesystem.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { restoreModeBWithTestPorts } from '../../scripts/fixtures/acquisition/restore.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { verifyModeBReceipt } from '../../scripts/fixtures/acquisition/verify-receipt.mjs';

type JsonObject = Record<string, any>;
type CliResult = { exitCode: number; stdout: string; stderr: string };
type Workspace = {
  root: string;
  acquisitionRoot: string;
  descriptorPath: string;
  expected: Buffer;
  expectedSha256: string;
  sentinelPaths: string[];
};

const createdRoots: string[] = [];
const projectRoot = resolve(import.meta.dirname, '../..');
const cliPath = resolve(projectRoot, 'scripts', 'fixtures', 'restore-release-fixture.mjs');
const locator =
  'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/synthetic-restore.glb';

function runGit(root: string, args: string[]): Promise<void> {
  return new Promise((accept, reject) => {
    execFile(
      'git',
      args,
      {
        cwd: root,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
        },
      },
      (error, _stdout, stderr) => {
        if (error === null) accept();
        else reject(new Error(`git ${args[0]} failed: ${stderr}`));
      },
    );
  });
}

function runCli(args: string[], env = process.env): Promise<CliResult> {
  return new Promise((accept) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      { cwd: projectRoot, env, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        accept({
          exitCode: error === null ? 0 : typeof error.code === 'number' ? error.code : 1,
          stdout,
          stderr,
        });
      },
    );
  });
}

async function makeWorkspace(expected = Buffer.from('abc')): Promise<Workspace> {
  const root = await mkdtemp(resolve(tmpdir(), 'lociview-acquisition-restore-'));
  createdRoots.push(root);
  const descriptorPath = 'fixtures/acquisition/descriptors/synthetic-restore.json';
  const expectedSha256 = createHash('sha256').update(expected).digest('hex');
  const absoluteDescriptor = resolve(root, ...descriptorPath.split('/'));
  await mkdir(dirname(absoluteDescriptor), { recursive: true });
  await writeFile(absoluteDescriptor, `${JSON.stringify({
    $schema: 'fixtures/acquisition/schema/g0-fixture-release-restore-1.schema.json',
    schemaVersion: 'g0-fixture-release-restore-1',
    requestId: 'synthetic-restore-1',
    locator,
    expectedSha256,
    expectedBytes: expected.byteLength,
  }, null, 2)}\n`);
  const sentinelPaths: [string, string] = [
    resolve(root, 'fixtures', 'registry.json'),
    resolve(root, 'evidence', 'g0', 'sentinel.json'),
  ];
  await mkdir(dirname(sentinelPaths[1]), { recursive: true });
  await writeFile(sentinelPaths[0], '{"registryVersion":2,"synthetic":true}\n');
  await writeFile(sentinelPaths[1], '{"g0Credit":false}\n');
  await runGit(root, ['init', '--quiet']);
  await runGit(root, ['add', '--', descriptorPath]);
  return {
    root,
    acquisitionRoot: resolve(root, '.artifacts', 'acquisition'),
    descriptorPath,
    expected,
    expectedSha256,
    sentinelPaths,
  };
}

function rawResponse(overrides: JsonObject = {}): JsonObject {
  return {
    statusCode: 200,
    rawHeaders: ['Content-Length', '3'],
    headerBytes: 64,
    remoteAddress: '8.8.8.8',
    body: (async function* () { yield Buffer.from('abc'); })(),
    complete: () => true,
    destroy: () => undefined,
    ...overrides,
  };
}

function rawPort(response: JsonObject): JsonObject {
  return {
    async resolveAll() {
      return { ok: true, answers: [{ address: '8.8.8.8', family: 4 }] };
    },
    async open() {
      return { ok: true, response };
    },
  };
}

function newAttempt(): ReturnType<typeof createTestAttemptControl> {
  return createTestAttemptControl({
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
}

function fixedClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 24, 0, 0, 0, tick++));
}

async function restore(
  workspace: Workspace,
  response: JsonObject,
  options: {
    fault?: (name: string) => Promise<void>;
    io?: JsonObject;
    attempt?: ReturnType<typeof createTestAttemptControl>;
    filesystemFactory?: (attempt: ReturnType<typeof createTestAttemptControl>) => JsonObject;
    attemptId?: string;
    rawPort?: JsonObject;
  } = {},
): Promise<JsonObject> {
  const attempt = options.attempt ?? newAttempt();
  const filesystemFactory = options.filesystemFactory ?? ((control) => createTestFilesystem({
    repositoryRoot: workspace.root,
    acquisitionRoot: workspace.acquisitionRoot,
    attemptControl: control,
    fault: options.fault,
    io: options.io,
  }));
  return restoreModeBWithTestPorts({
    descriptorPath: workspace.descriptorPath,
    repositoryRoot: workspace.root,
    rawPort: options.rawPort ?? rawPort(response),
    attempt,
    filesystemFactory,
    attemptId: options.attemptId ?? 'attempt-restore',
    clock: fixedClock(),
  });
}

async function readReceipt(workspace: Workspace, result: JsonObject): Promise<{
  receipt: JsonObject;
  context: JsonObject;
}> {
  const context = await loadTrustedModeBDescriptor(workspace.descriptorPath, workspace.root);
  const bytes = await readFile(
    resolve(workspace.acquisitionRoot, ...result.receiptRelativePath.split('/')),
  );
  return { receipt: parseModeBReceiptBytes(bytes, context), context };
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('offline Mode-B restore vertical slice', () => {
  it('commits exact bytes and a success receipt last without changing registry/evidence', async () => {
    const workspace = await makeWorkspace();
    const before = await Promise.all(workspace.sentinelPaths.map((path) => readFile(path)));
    const result = await restore(workspace, rawResponse());
    expect(result).toMatchObject({
      ok: true,
      exitCode: 0,
      error: null,
      stableFixtureIdentity: false,
      registryAdopted: false,
      g0Credit: false,
    });
    const cachePath = resolve(
      workspace.acquisitionRoot,
      'verified-transport',
      `sha256-${workspace.expectedSha256}.blob`,
    );
    expect(await readFile(cachePath)).toEqual(workspace.expected);
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({
      outcome: 'success',
      error: null,
      stableTransportIdentity: true,
      stableFixtureIdentity: false,
      registryAdopted: false,
      g0Credit: false,
      transport: {
        status: 200,
        measuredBytes: 3,
        measuredSha256: workspace.expectedSha256,
        streamEnded: true,
        expectedMatch: true,
      },
      local: {
        disposition: 'verified-published',
        relativePath: `verified-transport/sha256-${workspace.expectedSha256}.blob`,
      },
    });
    const verifierStore = createTestFilesystem({
      repositoryRoot: workspace.root,
      acquisitionRoot: workspace.acquisitionRoot,
    });
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${result.receiptRelativePath}`,
      filesystem: verifierStore,
      verifierAttemptId: 'verify-restored-success',
      repositoryRoot: workspace.root,
    })).resolves.toMatchObject({ outcome: 'success', g0Credit: false });
    const after = await Promise.all(workspace.sentinelPaths.map((path) => readFile(path)));
    expect(after).toEqual(before);
  }, 15_000);

  it('records the approved unexpected-status mapping without consuming its body', async () => {
    let bodyConsumed = false;
    const workspace = await makeWorkspace();
    const before = await Promise.all(workspace.sentinelPaths.map((path) => readFile(path)));
    const result = await restore(workspace, rawResponse({
      statusCode: 206,
      rawHeaders: [],
      body: (async function* () {
        bodyConsumed = true;
        yield Buffer.from('secret-body');
      })(),
    }));
    expect(result).toMatchObject({
      ok: false,
      exitCode: 4,
      error: {
        code: 'E_HTTP_UNEXPECTED_STATUS',
        retryable: false,
        hopIndex: 0,
      },
    });
    expect(bodyConsumed).toBe(false);
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({
      outcome: 'failure',
      error: { code: 'E_HTTP_UNEXPECTED_STATUS', exitCode: 4, retryable: false },
      transport: {
        status: 206,
        measuredBytes: 0,
        measuredSha256: null,
        streamEnded: false,
        expectedMatch: null,
      },
      local: { disposition: 'partial-deleted', relativePath: null },
    });
    const after = await Promise.all(workspace.sentinelPaths.map((path) => readFile(path)));
    expect(after).toEqual(before);
  });

  it('keeps an invalid duplicate Content-Length truthful with a null declared value', async () => {
    const workspace = await makeWorkspace();
    const result = await restore(workspace, rawResponse({
      rawHeaders: ['Content-Length', '3', 'Content-Length', '3'],
    }));
    expect(result).toMatchObject({
      ok: false,
      exitCode: 5,
      error: { code: 'E_DECLARED_LENGTH', retryable: false },
    });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({
      outcome: 'failure',
      error: { code: 'E_DECLARED_LENGTH' },
      transport: {
        status: 200,
        declaredBytes: null,
        measuredBytes: 0,
        measuredSha256: null,
        streamEnded: false,
        expectedMatch: null,
      },
    });
    const verifierStore = createTestFilesystem({
      repositoryRoot: workspace.root,
      acquisitionRoot: workspace.acquisitionRoot,
    });
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${result.receiptRelativePath}`,
      filesystem: verifierStore,
      verifierAttemptId: 'verify-invalid-content-length',
      repositoryRoot: workspace.root,
    })).resolves.toMatchObject({ outcome: 'failure', g0Credit: false });
  });

  it.each([
    [
      'extra',
      (async function* () { yield Buffer.from('abcd'); })(),
      'E_EXTRA_BYTES',
      4,
      false,
      null,
    ],
    [
      'truncated',
      (async function* () { yield Buffer.from('ab'); })(),
      'E_TRUNCATED',
      2,
      true,
      createHash('sha256').update('ab').digest('hex'),
    ],
    [
      'digest mismatch',
      (async function* () { yield Buffer.from('xyz'); })(),
      'E_DIGEST_MISMATCH',
      3,
      true,
      createHash('sha256').update('xyz').digest('hex'),
    ],
    [
      'stream error',
      (async function* () {
        yield Buffer.from('a');
        throw new Error('synthetic raw stream secret');
      })(),
      'E_STREAM_IO',
      1,
      false,
      null,
    ],
  ])('publishes a truthful failure receipt for %s', async (
    _label,
    bodyStream,
    code,
    measuredBytes,
    streamEnded,
    measuredSha256,
  ) => {
    const workspace = await makeWorkspace();
    const result = await restore(workspace, rawResponse({
      rawHeaders: [],
      body: bodyStream,
    }));
    expect(result).toMatchObject({ ok: false, error: { code } });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({
      outcome: 'failure',
      error: { code },
      transport: {
        measuredBytes,
        measuredSha256,
        streamEnded,
        expectedMatch: streamEnded ? false : null,
      },
      local: { disposition: 'partial-deleted', relativePath: null },
    });
  });

  it('replaces a rolled-back success receipt with a failure receipt bound to orphaned exact cache bytes', async () => {
    const workspace = await makeWorkspace();
    let receiptLinks = 0;
    const result = await restore(workspace, rawResponse(), {
      fault: async (name) => {
        if (name === 'after-receipt-link' && receiptLinks++ === 0) {
          throw new Error('synthetic success receipt commit fault');
        }
      },
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: 6,
      error: { code: 'E_RECEIPT_IO' },
    });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({
      outcome: 'failure',
      error: { code: 'E_RECEIPT_IO' },
      transport: {
        streamEnded: true,
        expectedMatch: true,
        measuredSha256: workspace.expectedSha256,
      },
      local: {
        disposition: 'orphan-cache',
        relativePath: `verified-transport/sha256-${workspace.expectedSha256}.blob`,
      },
    });
    const verifierStore = createTestFilesystem({
      repositoryRoot: workspace.root,
      acquisitionRoot: workspace.acquisitionRoot,
    });
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${result.receiptRelativePath}`,
      filesystem: verifierStore,
      verifierAttemptId: 'verify-orphan-failure',
      repositoryRoot: workspace.root,
    })).resolves.toMatchObject({ outcome: 'failure', g0Credit: false });
  });

  it('recovers an exact receipt link whose await loses its result and commits success', async () => {
    const workspace = await makeWorkspace();
    let receiptLinkLost = false;
    const result = await restore(workspace, rawResponse(), {
      io: {
        link: async (...args: any[]) => {
          const linked = await (fsLink as any)(...args);
          if (!receiptLinkLost && String(args[1]).endsWith('.json')) {
            receiptLinkLost = true;
            throw new Error('synthetic lost receipt-link result');
          }
          return linked;
        },
      },
    });
    expect(receiptLinkLost).toBe(true);
    expect(result).toMatchObject({ ok: true, exitCode: 0, error: null });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({ outcome: 'success', g0Credit: false });
    const final = await lstat(resolve(
      workspace.acquisitionRoot,
      ...result.receiptRelativePath.split('/'),
    ), { bigint: true });
    expect(final.nlink).toBe(1n);
    await expect(lstat(resolve(workspace.acquisitionRoot, 'writer.lock')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains its lock and receipt aliases when a lost link result cannot be inspected', async () => {
    const workspace = await makeWorkspace();
    const finalPath = resolve(
      workspace.acquisitionRoot,
      'receipts',
      'receipt-synthetic-restore-1.attempt-restore.json',
    );
    const stagePath = resolve(
      workspace.acquisitionRoot,
      'receipts',
      'receipt-synthetic-restore-1.attempt-restore.stage.json',
    );
    let receiptLinkLost = false;
    const result = await restore(workspace, rawResponse(), {
      io: {
        link: async (...args: any[]) => {
          const linked = await (fsLink as any)(...args);
          if (!receiptLinkLost && String(args[1]) === finalPath) {
            receiptLinkLost = true;
            throw new Error('synthetic lost receipt-link result');
          }
          return linked;
        },
        lstat: async (...args: any[]) => {
          if (receiptLinkLost && String(args[0]) === finalPath) {
            throw new Error('synthetic indeterminate receipt-link inspection');
          }
          return (lstat as any)(...args);
        },
      },
    });
    expect(receiptLinkLost).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      exitCode: 6,
      receiptRelativePath: null,
      error: { code: 'E_RECEIPT_IO' },
    });
    const stage = await lstat(stagePath, { bigint: true });
    const final = await lstat(finalPath, { bigint: true });
    expect(stage.nlink).toBe(2n);
    expect(final.nlink).toBe(2n);
    expect(stage.dev).toBe(final.dev);
    expect(stage.ino).toBe(final.ino);
    expect((await lstat(resolve(workspace.acquisitionRoot, 'writer.lock'))).size).toBe(0);

    const verifierStore = createTestFilesystem({
      repositoryRoot: workspace.root,
      acquisitionRoot: workspace.acquisitionRoot,
    });
    await expect(verifyModeBReceipt({
      receiptPath: '.artifacts/acquisition/receipts/receipt-synthetic-restore-1.attempt-restore.json',
      filesystem: verifierStore,
      verifierAttemptId: 'verify-indeterminate-link',
      repositoryRoot: workspace.root,
    })).rejects.toMatchObject({ code: 'E_LOCK_BUSY' });
  });

  it('writes a failure receipt after safe lock ownership when body admission lacks free space', async () => {
    const workspace = await makeWorkspace();
    const result = await restore(workspace, rawResponse(), {
      io: { statfs: async () => ({ bavail: 0n, bsize: 1n }) },
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: 6,
      error: { code: 'E_NO_SPACE', retryable: true },
    });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({
      outcome: 'failure',
      error: { code: 'E_NO_SPACE' },
      transport: {
        finalOrigin: null,
        status: null,
        measuredBytes: 0,
        streamEnded: false,
      },
      local: { disposition: 'none', relativePath: null },
      sourceIdentity: null,
      stableTransportIdentity: false,
    });
  });

  it('records bytes received before a local partial-write fault without claiming clean EOF', async () => {
    const workspace = await makeWorkspace();
    const result = await restore(workspace, rawResponse(), {
      fault: async (name) => {
        if (name === 'after-partial-write') throw new Error('synthetic local write fault');
      },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'E_LOCAL_IO' } });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({
      outcome: 'failure',
      transport: {
        measuredBytes: 3,
        measuredSha256: null,
        streamEnded: false,
        expectedMatch: null,
      },
      local: { disposition: 'partial-deleted', relativePath: null },
    });
  });

  it('stops after an awaited descriptor stage when the overall deadline is observed', async () => {
    const workspace = await makeWorkspace();
    const readings = [0, 0, 0, 10];
    const attempt = createTestAttemptControl({
      overallMs: 10,
      now: () => readings.shift() ?? 10,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const result = await restore(workspace, rawResponse(), { attempt });
    expect(result).toMatchObject({
      ok: false,
      exitCode: 4,
      receiptRelativePath: null,
      error: { code: 'E_OVERALL_TIMEOUT', retryable: true },
    });
    await expect(lstat(workspace.acquisitionRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a staged descriptor path outside receipt grammar before transport or workspace creation', async () => {
    const workspace = await makeWorkspace();
    const invalidPath = 'fixtures/acquisition/descriptors/synthetic restore.json';
    await writeFile(
      resolve(workspace.root, ...invalidPath.split('/')),
      await readFile(resolve(workspace.root, ...workspace.descriptorPath.split('/'))),
    );
    await runGit(workspace.root, ['add', '--', invalidPath]);
    let transportCalls = 0;
    const rejectingPort = {
      async resolveAll() {
        transportCalls += 1;
        throw new Error('transport must not be reached');
      },
      async open() {
        transportCalls += 1;
        throw new Error('transport must not be reached');
      },
    };
    const result = await restore(
      { ...workspace, descriptorPath: invalidPath },
      rawResponse(),
      { rawPort: rejectingPort },
    );
    expect(result).toMatchObject({
      ok: false,
      exitCode: 2,
      receiptRelativePath: null,
      error: { code: 'E_DESCRIPTOR', retryable: false },
    });
    expect(transportCalls).toBe(0);
    await expect(lstat(workspace.acquisitionRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    ['writer-lock create', 'open', 'writer.lock', null],
    ['partial create', 'open', '.body.partial', 'partial-deleted'],
    ['cache link', 'link', '.blob', 'partial-deleted'],
    ['receipt-stage create', 'open', '.stage.json', 'orphan-cache'],
  ] as const)(
    'reinspects and cleans a settled %s whose await crosses the deadline',
    async (_label, operation, suffix, disposition) => {
      const workspace = await makeWorkspace();
      let now = 0;
      let crossed = false;
      const attempt = createTestAttemptControl({
        overallMs: 10,
        now: () => now,
        setTimer: () => 1,
        clearTimer: () => undefined,
      });
      const io: JsonObject = operation === 'open'
        ? {
            open: async (...args: any[]) => {
              const handle = await (fsOpen as any)(...args);
              if (!crossed && String(args[0]).endsWith(suffix)) {
                crossed = true;
                now = 10;
              }
              return handle;
            },
          }
        : {
            link: async (...args: any[]) => {
              const linked = await (fsLink as any)(...args);
              if (!crossed && String(args[1]).endsWith(suffix)) {
                crossed = true;
                now = 10;
              }
              return linked;
            },
          };
      const result = await restore(workspace, rawResponse(), { attempt, io });
      expect(crossed).toBe(true);
      expect(result).toMatchObject({
        ok: false,
        exitCode: 4,
        error: { code: 'E_OVERALL_TIMEOUT', retryable: true },
      });
      if (disposition === null) {
        expect(result.receiptRelativePath).toBeNull();
      } else {
        const { receipt } = await readReceipt(workspace, result);
        expect(receipt.local.disposition).toBe(disposition);
      }
      await expect(lstat(resolve(workspace.acquisitionRoot, 'writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
      const cachePath = resolve(
        workspace.acquisitionRoot,
        'verified-transport',
        `sha256-${workspace.expectedSha256}.blob`,
      );
      if (disposition === 'orphan-cache') {
        expect(await readFile(cachePath)).toEqual(workspace.expected);
      } else {
        await expect(lstat(cachePath)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    },
  );

  it.each([
    'after-lock-file-sync',
    'after-lock-directory-sync',
    'after-lock-reread',
  ] as const)(
    'removes the lock without a receipt when the deadline crosses at %s',
    async (point) => {
      const workspace = await makeWorkspace();
      let now = 0;
      let crossed = false;
      const attempt = createTestAttemptControl({
        overallMs: 10,
        now: () => now,
        setTimer: () => 1,
        clearTimer: () => undefined,
      });
      const result = await restore(workspace, rawResponse(), {
        attempt,
        fault: async (name) => {
          if (!crossed && name === point) {
            crossed = true;
            now = 10;
          }
        },
      });
      expect(crossed).toBe(true);
      expect(result).toMatchObject({
        ok: false,
        exitCode: 4,
        receiptRelativePath: null,
        error: { code: 'E_OVERALL_TIMEOUT', retryable: true },
      });
      await expect(lstat(resolve(workspace.acquisitionRoot, 'writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it.each(['exact', 'mismatch'] as const)(
    'releases the lock when a pre-existing %s cache makes link settle EEXIST across the deadline',
    async (kind) => {
      const workspace = await makeWorkspace();
      const layoutStore = createTestFilesystem({
        repositoryRoot: workspace.root,
        acquisitionRoot: workspace.acquisitionRoot,
      });
      const layout = await layoutStore.openWriterLease({ attemptId: `attempt-eexist-${kind}-layout` });
      await layout.finish();
      const cachePath = resolve(
        workspace.acquisitionRoot,
        'verified-transport',
        `sha256-${workspace.expectedSha256}.blob`,
      );
      const existing = kind === 'exact' ? workspace.expected : Buffer.from('xyz');
      await writeFile(cachePath, existing);

      let now = 0;
      let crossed = false;
      const attempt = createTestAttemptControl({
        overallMs: 10,
        now: () => now,
        setTimer: () => 1,
        clearTimer: () => undefined,
      });
      const result = await restore(workspace, rawResponse(), {
        attempt,
        io: {
          link: async (...args: any[]) => {
            try { return await (fsLink as any)(...args); }
            catch (error) {
              if (
                (error as NodeJS.ErrnoException).code === 'EEXIST' &&
                String(args[1]).endsWith('.blob')
              ) {
                crossed = true;
                now = 10;
              }
              throw error;
            }
          },
        },
      });
      expect(crossed).toBe(true);
      expect(result).toMatchObject({
        ok: false,
        exitCode: 4,
        error: { code: 'E_OVERALL_TIMEOUT', retryable: true },
      });
      const { receipt } = await readReceipt(workspace, result);
      expect(receipt).toMatchObject({
        outcome: 'failure',
        error: { code: 'E_OVERALL_TIMEOUT' },
        local: { disposition: 'partial-deleted', relativePath: null },
        transport: { streamEnded: true, expectedMatch: true },
      });
      expect(await readFile(cachePath)).toEqual(existing);
      await expect(lstat(resolve(workspace.acquisitionRoot, 'writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it.each([
    ['after-partial-sync', 'partial-deleted'],
    ['after-cache-link', 'partial-deleted'],
    ['after-cache-source-unlink', 'partial-deleted'],
    ['before-cache-directory-sync', 'partial-deleted'],
    ['after-cache-directory-sync', 'partial-deleted'],
    ['after-receipt-wx', 'orphan-cache'],
    ['after-receipt-write', 'orphan-cache'],
    ['after-receipt-sync', 'orphan-cache'],
    ['after-receipt-reread', 'orphan-cache'],
  ] as const)(
    'fixes a pre-commit deadline crossing at %s and publishes only its truthful failure receipt',
    async (point, disposition) => {
      const workspace = await makeWorkspace();
      let now = 0;
      let crossed = false;
      const attempt = createTestAttemptControl({
        overallMs: 10,
        now: () => now,
        setTimer: () => 1,
        clearTimer: () => undefined,
      });
      const result = await restore(workspace, rawResponse(), {
        attempt,
        fault: async (name) => {
          if (!crossed && name === point) {
            crossed = true;
            now = 10;
          }
        },
      });
      expect(crossed).toBe(true);
      expect(result).toMatchObject({
        ok: false,
        exitCode: 4,
        error: { code: 'E_OVERALL_TIMEOUT', retryable: true },
      });
      const { receipt } = await readReceipt(workspace, result);
      expect(receipt).toMatchObject({
        outcome: 'failure',
        error: { code: 'E_OVERALL_TIMEOUT' },
        transport: {
          measuredBytes: 3,
          measuredSha256: workspace.expectedSha256,
          streamEnded: true,
          expectedMatch: true,
        },
        local: { disposition },
      });
    },
  );

  it('removes a provisionally owned partial and records it when path identity inspection fails once', async () => {
    const workspace = await makeWorkspace();
    let partialInspections = 0;
    const result = await restore(workspace, rawResponse(), {
      io: {
        lstat: async (...args: any[]) => {
          if (
            String(args[0]).endsWith('attempt-restore.body.partial') &&
            partialInspections++ === 0
          ) {
            const error = new Error('synthetic one-shot partial inspection failure') as NodeJS.ErrnoException;
            error.code = 'EIO';
            throw error;
          }
          return (lstat as any)(...args);
        },
      },
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: 6,
      error: { code: 'E_CONTAINMENT', retryable: false },
    });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt).toMatchObject({
      outcome: 'failure',
      error: { code: 'E_CONTAINMENT' },
      local: { disposition: 'partial-deleted', relativePath: null },
    });
    await expect(lstat(resolve(
      workspace.acquisitionRoot,
      'partial',
      'attempt-restore.body.partial',
    ))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(resolve(workspace.acquisitionRoot, 'writer.lock')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains the lock and emits no receipt when provisional partial cleanup is indeterminate', async () => {
    const workspace = await makeWorkspace();
    const result = await restore(workspace, rawResponse(), {
      io: {
        lstat: async (...args: any[]) => {
          if (String(args[0]).endsWith('attempt-restore.body.partial')) {
            const error = new Error('synthetic persistent partial inspection failure') as NodeJS.ErrnoException;
            error.code = 'EIO';
            throw error;
          }
          return (lstat as any)(...args);
        },
      },
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: 6,
      receiptRelativePath: null,
      error: { code: 'E_CONTAINMENT', retryable: false },
    });
    expect((await lstat(resolve(
      workspace.acquisitionRoot,
      'partial',
      'attempt-restore.body.partial',
    ))).size).toBe(0);
    expect((await lstat(resolve(workspace.acquisitionRoot, 'writer.lock'))).size).toBe(0);
  });

  it('retries partial-directory durability after a cache source-unlink failure', async () => {
    const workspace = await makeWorkspace();
    const partialDirectory = resolve(workspace.acquisitionRoot, 'partial');
    let sourceUnlinked = false;
    let cleanupSyncs = 0;
    const result = await restore(workspace, rawResponse(), {
      fault: async (name) => {
        if (name === 'after-cache-source-unlink') {
          sourceUnlinked = true;
          throw new Error('synthetic post-unlink failure');
        }
      },
      io: {
        open: async (...args: any[]) => {
          const handle = await (fsOpen as any)(...args);
          if (sourceUnlinked && String(args[0]) === partialDirectory && args[1] === 'r') {
            return new Proxy(handle, {
              get(target, property) {
                if (property === 'sync') {
                  return async () => {
                    cleanupSyncs += 1;
                    return target.sync();
                  };
                }
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          }
          return handle;
        },
      },
    });
    expect(cleanupSyncs).toBeGreaterThan(0);
    expect(result).toMatchObject({
      ok: false,
      exitCode: 6,
      error: { code: 'E_LINK', retryable: false },
    });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt.local).toEqual({ disposition: 'partial-deleted', relativePath: null });
    await expect(lstat(resolve(
      workspace.acquisitionRoot,
      'partial',
      'attempt-restore.body.partial',
    ))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(resolve(workspace.acquisitionRoot, 'writer.lock')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains the lock and emits no receipt when unlinked partial durability stays unknown', async () => {
    const workspace = await makeWorkspace();
    const partialDirectory = resolve(workspace.acquisitionRoot, 'partial');
    let sourceUnlinked = false;
    let cleanupSyncs = 0;
    const result = await restore(workspace, rawResponse(), {
      fault: async (name) => {
        if (name === 'after-cache-source-unlink') {
          sourceUnlinked = true;
          throw new Error('synthetic post-unlink failure');
        }
      },
      io: {
        open: async (...args: any[]) => {
          const handle = await (fsOpen as any)(...args);
          if (sourceUnlinked && String(args[0]) === partialDirectory && args[1] === 'r') {
            return new Proxy(handle, {
              get(target, property) {
                if (property === 'sync') {
                  return async () => {
                    cleanupSyncs += 1;
                    const error = new Error('synthetic partial directory sync failure') as NodeJS.ErrnoException;
                    error.code = 'EIO';
                    throw error;
                  };
                }
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          }
          return handle;
        },
      },
    });
    expect(cleanupSyncs).toBeGreaterThan(0);
    expect(result).toMatchObject({
      ok: false,
      exitCode: 6,
      receiptRelativePath: null,
      error: { code: 'E_LINK', retryable: false },
    });
    await expect(lstat(resolve(
      workspace.acquisitionRoot,
      'partial',
      'attempt-restore.body.partial',
    ))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lstat(resolve(workspace.acquisitionRoot, 'writer.lock'))).size).toBe(0);
  });

  it('records an exact published cache as orphaned when expiry is first observed before receipt staging', async () => {
    const workspace = await makeWorkspace();
    let cacheDurable = false;
    let readsAfterCache = 0;
    const attempt = createTestAttemptControl({
      overallMs: 10,
      now: () => {
        if (!cacheDurable) return 0;
        readsAfterCache += 1;
        return readsAfterCache === 1 ? 0 : 10;
      },
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const result = await restore(workspace, rawResponse(), {
      attempt,
      fault: async (name) => {
        if (name === 'after-cache-directory-sync') cacheDurable = true;
      },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'E_OVERALL_TIMEOUT' },
    });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt.local).toEqual({
      disposition: 'orphan-cache',
      relativePath: `verified-transport/sha256-${workspace.expectedSha256}.blob`,
    });
  });

  it.each([
    'cache-observation-close',
    'partial-cleanup-lstat',
    'partial-cleanup-unlink',
    'partial-cleanup-directory-sync',
  ] as const)(
    'cleans its partial when exact-cache reuse crosses the deadline at %s',
    async (point) => {
      const workspace = await makeWorkspace();
      const primeStore = createTestFilesystem({
        repositoryRoot: workspace.root,
        acquisitionRoot: workspace.acquisitionRoot,
        io: { statfs: async () => ({ bavail: 1024n * 1024n * 1024n, bsize: 1n }) },
      });
      const prime = await primeStore.openWriterLease({ attemptId: 'attempt-cache-prime' });
      await prime.admitModeB(workspace.expected.byteLength);
      await prime.createPartial(workspace.expected.byteLength);
      await prime.appendPartial(workspace.expected);
      await prime.completeBody();
      await prime.publishVerified(workspace.expected.byteLength, workspace.expectedSha256);
      await prime.finish();

      let now = 0;
      let crossed = false;
      let cacheObserved = false;
      const cross = () => {
        if (crossed) return;
        crossed = true;
        now = 10;
      };
      const attempt = createTestAttemptControl({
        overallMs: 10,
        now: () => now,
        setTimer: () => 1,
        clearTimer: () => undefined,
      });
      const result = await restore(workspace, rawResponse(), {
        attempt,
        io: {
          statfs: async () => ({ bavail: 1024n * 1024n * 1024n, bsize: 1n }),
          lstat: async (...args: any[]) => {
            const observed = await (lstat as any)(...args);
            if (
              cacheObserved &&
              point === 'partial-cleanup-lstat' &&
              String(args[0]).endsWith('.body.partial')
            ) cross();
            return observed;
          },
          unlink: async (...args: any[]) => {
            const removed = await (fsUnlink as any)(...args);
            if (
              cacheObserved &&
              point === 'partial-cleanup-unlink' &&
              String(args[0]).endsWith('.body.partial')
            ) cross();
            return removed;
          },
          open: async (...args: any[]) => {
            const handle = await (fsOpen as any)(...args);
            const path = String(args[0]);
            if (path.endsWith('.blob') && args[1] === 'r') {
              return new Proxy(handle, {
                get(target, property) {
                  if (property === 'close') {
                    return async () => {
                      const closed = await target.close();
                      cacheObserved = true;
                      if (point === 'cache-observation-close') cross();
                      return closed;
                    };
                  }
                  const value = Reflect.get(target, property, target);
                  return typeof value === 'function' ? value.bind(target) : value;
                },
              });
            }
            if (
              cacheObserved &&
              point === 'partial-cleanup-directory-sync' &&
              path.endsWith('partial') &&
              args[1] === 'r'
            ) {
              return new Proxy(handle, {
                get(target, property) {
                  if (property === 'sync') {
                    return async () => {
                      try { return await target.sync(); }
                      finally { cross(); }
                    };
                  }
                  const value = Reflect.get(target, property, target);
                  return typeof value === 'function' ? value.bind(target) : value;
                },
              });
            }
            return handle;
          },
        },
      });
      expect(crossed).toBe(true);
      expect(result).toMatchObject({
        ok: false,
        exitCode: 4,
        error: { code: 'E_OVERALL_TIMEOUT', retryable: true },
      });
      const { receipt } = await readReceipt(workspace, result);
      expect(receipt).toMatchObject({
        outcome: 'failure',
        error: { code: 'E_OVERALL_TIMEOUT' },
        local: { disposition: 'partial-deleted', relativePath: null },
        transport: { streamEnded: true, expectedMatch: true },
      });
      expect(await readFile(resolve(
        workspace.acquisitionRoot,
        'verified-transport',
        `sha256-${workspace.expectedSha256}.blob`,
      ))).toEqual(workspace.expected);
      await expect(lstat(resolve(
        workspace.acquisitionRoot,
        'partial',
        'attempt-restore.body.partial',
      ))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(lstat(resolve(workspace.acquisitionRoot, 'writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it.each([
    'after-receipt-link',
    'after-receipt-source-unlink',
    'before-receipt-directory-sync',
    'after-receipt-directory-sync',
  ] as const)(
    'does not revoke success when admitted receipt commit crosses the deadline at %s',
    async (point) => {
      const workspace = await makeWorkspace();
      let now = 0;
      let crossed = false;
      const attempt = createTestAttemptControl({
        overallMs: 10,
        now: () => now,
        setTimer: () => 1,
        clearTimer: () => undefined,
      });
      const result = await restore(workspace, rawResponse(), {
        attempt,
        fault: async (name) => {
          if (!crossed && name === point) {
            crossed = true;
            now = 10;
          }
        },
      });
      expect(crossed).toBe(true);
      expect(result).toMatchObject({ ok: true, exitCode: 0, error: null });
      const { receipt } = await readReceipt(workspace, result);
      expect(receipt).toMatchObject({ outcome: 'success', g0Credit: false });
      await expect(lstat(resolve(workspace.acquisitionRoot, 'writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('keeps durable success when post-commit lock housekeeping fails', async () => {
    const workspace = await makeWorkspace();
    const result = await restore(workspace, rawResponse(), {
      fault: async (name) => {
        if (name === 'before-lock-unlink') throw new Error('synthetic post-commit cleanup fault');
      },
    });
    expect(result).toMatchObject({ ok: true, exitCode: 0, error: null });
    const { receipt } = await readReceipt(workspace, result);
    expect(receipt.outcome).toBe('success');
    expect((await lstat(resolve(workspace.acquisitionRoot, 'writer.lock'))).size).toBe(0);
  });

  it('creates no receipt when another safe writer lock already exists', async () => {
    const workspace = await makeWorkspace();
    const holderStore = createTestFilesystem({
      repositoryRoot: workspace.root,
      acquisitionRoot: workspace.acquisitionRoot,
    });
    const holder = await holderStore.openWriterLease({ attemptId: 'attempt-holder' });
    const result = await restore(workspace, rawResponse(), { attemptId: 'attempt-blocked' });
    expect(result).toMatchObject({
      ok: false,
      exitCode: 6,
      receiptRelativePath: null,
      error: { code: 'E_LOCK_BUSY' },
    });
    expect(await readFile(resolve(workspace.acquisitionRoot, 'writer.lock'))).toHaveLength(0);
    await holder.finish();
  });
});

describe('fixed restore CLI boundary', () => {
  it('does not expose transport/root/policy selection and redacts invalid arguments', async () => {
    const secret = 'synthetic-secret-value';
    for (const args of [
      [],
      ['--transport', secret],
      ['--descriptor', 'x', '--root', secret],
      ['--descriptor', 'x', '--origin', secret],
    ]) {
      const result = await runCli(args, {
        ...process.env,
        HTTPS_PROXY: `http://${secret}.invalid`,
      });
      expect(result).toEqual({ exitCode: 2, stdout: '', stderr: 'E_USAGE\n' });
      expect(result.stderr).not.toContain(secret);
    }
  });

  it('exports only the fixed production transport facade', async () => {
    // @ts-expect-error Checked ESM scripts intentionally have no declaration files.
    const facade = await import('../../scripts/fixtures/acquisition/transport.mjs');
    expect(Object.keys(facade)).toEqual(['openModeBResponse']);
  });
});
