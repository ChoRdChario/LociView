import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { loadTrustedModeBDescriptor, modeBReceiptIdentity, parseModeBReceiptBytes, verifiedCacheRelativePath } from '../../scripts/fixtures/acquisition/contracts.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createTestFilesystem, normalizeReceiptCliPath } from '../../scripts/fixtures/acquisition/filesystem.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { encodeBoundedJson } from '../../scripts/fixtures/acquisition/json.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { verifyModeBReceipt } from '../../scripts/fixtures/acquisition/verify-receipt.mjs';

type CliResult = { exitCode: number; stdout: string; stderr: string };
type JsonObject = Record<string, unknown>;

const createdRoots: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, '../..');
const cliPath = resolve(repositoryRoot, 'scripts', 'fixtures', 'verify-acquisition-receipt.mjs');
const descriptorRelativePath = 'fixtures/acquisition/descriptors/synthetic-verify.json';
const locator =
  'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/synthetic-verify.glb';
const body = Buffer.from('synthetic verified bytes\n');
const bodySha256 = createHash('sha256').update(body).digest('hex');

function runFile(args: string[]): Promise<CliResult> {
  return new Promise((accept) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      { cwd: repositoryRoot, windowsHide: true, encoding: 'utf8' },
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

function descriptor(expectedBytes = body.byteLength): JsonObject {
  return {
    $schema: 'fixtures/acquisition/schema/g0-fixture-release-restore-1.schema.json',
    schemaVersion: 'g0-fixture-release-restore-1',
    requestId: 'synthetic-verify-1',
    locator,
    expectedSha256: bodySha256,
    expectedBytes,
  };
}

async function makeFixture(): Promise<{
  root: string;
  store: ReturnType<typeof createTestFilesystem>;
  descriptorContext: Record<string, any>;
  receiptRelativePath: string;
  receiptPath: string;
  receipt: JsonObject;
}> {
  const root = await mkdtemp(resolve(tmpdir(), 'lociview-acquisition-verifier-'));
  createdRoots.push(root);
  const descriptorPath = resolve(root, ...descriptorRelativePath.split('/'));
  await mkdir(dirname(descriptorPath), { recursive: true });
  await writeFile(descriptorPath, `${JSON.stringify(descriptor(), null, 2)}\n`);
  await runGit(root, ['init', '--quiet']);
  await runGit(root, ['add', '--', descriptorRelativePath]);
  const descriptorContext = await loadTrustedModeBDescriptor(descriptorRelativePath, root);
  const acquisitionRoot = resolve(root, '.artifacts', 'acquisition');
  const store = createTestFilesystem({ repositoryRoot: root, acquisitionRoot });
  const writer = await store.openWriterLease({ attemptId: 'attempt-verifier' });
  await writer.admitModeB(body.byteLength);
  await writer.createPartial(body.byteLength);
  await writer.appendPartial(body);
  await writer.completeBody();
  await writer.publishVerified(body.byteLength, bodySha256);

  const identity = modeBReceiptIdentity();
  const receipt = {
    $schema: identity.schemaPath,
    schemaVersion: identity.schemaVersion,
    mode: identity.mode,
    trustTier: identity.trustTier,
    requestId: descriptorContext.value.requestId,
    attemptId: 'attempt-verifier',
    descriptor: {
      path: descriptorContext.path,
      sha256: descriptorContext.sha256,
    },
    startedAtUtc: '2026-08-24T00:00:00.000Z',
    completedAtUtc: '2026-08-24T00:00:01.000Z',
    outcome: 'success',
    error: null,
    sourceIdentity: locator,
    transport: {
      redirectOrigins: [],
      redirectCount: 0,
      finalOrigin: 'https://github.com:443',
      status: 200,
      declaredBytes: body.byteLength,
      measuredBytes: body.byteLength,
      measuredSha256: bodySha256,
      streamEnded: true,
      expectedMatch: true,
    },
    local: {
      disposition: 'verified-published',
      relativePath: verifiedCacheRelativePath(bodySha256),
    },
    stableTransportIdentity: true,
    stableFixtureIdentity: false,
    registryAdopted: false,
    g0Credit: false,
    rendererOrProfileRatified: false,
    deviceEvidence: false,
  };
  const bytes = encodeBoundedJson(receipt, 128 * 1024);
  await writer.stageReceipt({
    requestId: descriptorContext.value.requestId,
    bytes,
    validateBytes: (value: Uint8Array) => parseModeBReceiptBytes(value, descriptorContext),
  });
  const receiptRelativePath = await writer.commitReceipt({ success: true });
  await writer.finish();
  return {
    root,
    store,
    descriptorContext,
    receiptRelativePath,
    receiptPath: resolve(acquisitionRoot, ...receiptRelativePath.split('/')),
    receipt,
  };
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('offline Mode-B receipt verifier', () => {
  it('holds the lock while binding the exact indexed descriptor, receipt and local cache', async () => {
    const fixture = await makeFixture();
    const result = await verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${fixture.receiptRelativePath}`,
      filesystem: fixture.store,
      verifierAttemptId: 'verify-exact-receipt',
      repositoryRoot: fixture.root,
    });
    expect(result).toEqual({
      receiptRelativePath: fixture.receiptRelativePath,
      outcome: 'success',
      stableFixtureIdentity: false,
      registryAdopted: false,
      g0Credit: false,
    });
  }, 15_000);

  it('rejects descriptor worktree drift and releases only its own verifier lock', async () => {
    const fixture = await makeFixture();
    const descriptorPath = resolve(fixture.root, ...descriptorRelativePath.split('/'));
    await writeFile(descriptorPath, `${JSON.stringify(descriptor(body.byteLength + 1), null, 2)}\n`);
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${fixture.receiptRelativePath}`,
      filesystem: fixture.store,
      verifierAttemptId: 'verify-drifted-receipt',
      repositoryRoot: fixture.root,
    })).rejects.toMatchObject({ code: 'E_DESCRIPTOR' });

    await writeFile(descriptorPath, `${JSON.stringify(descriptor(), null, 2)}\n`);
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${fixture.receiptRelativePath}`,
      filesystem: fixture.store,
      verifierAttemptId: 'verify-after-drift',
      repositoryRoot: fixture.root,
    })).resolves.toMatchObject({ outcome: 'success' });
  });

  it('binds the receipt request and attempt identifiers to its portable filename', async () => {
    const fixture = await makeFixture();
    const copiedRelativePath = 'receipts/receipt-synthetic-verify-1.attempt-copied.json';
    await writeFile(
      resolve(fixture.root, '.artifacts', 'acquisition', ...copiedRelativePath.split('/')),
      await readFile(fixture.receiptPath),
    );
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${copiedRelativePath}`,
      filesystem: fixture.store,
      verifierAttemptId: 'verify-copied-name',
      repositoryRoot: fixture.root,
    })).rejects.toMatchObject({ code: 'E_RECEIPT_SCHEMA' });
  });

  it('rejects receipt false-credit tampering and cache-byte tampering', async () => {
    const fixture = await makeFixture();
    const falseCredit = structuredClone(fixture.receipt);
    falseCredit.g0Credit = true;
    await writeFile(fixture.receiptPath, encodeBoundedJson(falseCredit, 128 * 1024));
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${fixture.receiptRelativePath}`,
      filesystem: fixture.store,
      verifierAttemptId: 'verify-false-credit',
      repositoryRoot: fixture.root,
    })).rejects.toMatchObject({ code: 'E_RECEIPT_SCHEMA' });

    await writeFile(
      fixture.receiptPath,
      encodeBoundedJson(fixture.receipt, 128 * 1024),
    );
    await writeFile(
      resolve(fixture.root, '.artifacts', 'acquisition', 'verified-transport', `sha256-${bodySha256}.blob`),
      Buffer.alloc(body.byteLength, 0x78),
    );
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${fixture.receiptRelativePath}`,
      filesystem: fixture.store,
      verifierAttemptId: 'verify-cache-tamper',
      repositoryRoot: fixture.root,
    })).rejects.toMatchObject({ code: 'E_CACHE_MISMATCH' });
  });

  it('binds partial-deleted to the absence of the exact attempt partial', async () => {
    const fixture = await makeFixture();
    const failureReceipt = structuredClone(fixture.receipt);
    failureReceipt.outcome = 'failure';
    failureReceipt.error = {
      code: 'E_LOCAL_IO',
      exitCode: 6,
      retryable: true,
      hopIndex: null,
    };
    failureReceipt.local = { disposition: 'partial-deleted', relativePath: null };
    await writeFile(
      fixture.receiptPath,
      encodeBoundedJson(failureReceipt, 128 * 1024),
    );
    await rm(resolve(
      fixture.root,
      '.artifacts',
      'acquisition',
      ...verifiedCacheRelativePath(bodySha256).split('/'),
    ));

    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${fixture.receiptRelativePath}`,
      filesystem: fixture.store,
      verifierAttemptId: 'verify-partial-absent',
      repositoryRoot: fixture.root,
    })).resolves.toMatchObject({ outcome: 'failure' });

    await writeFile(
      resolve(
        fixture.root,
        '.artifacts',
        'acquisition',
        'partial',
        'attempt-verifier.body.partial',
      ),
      'residual partial',
    );
    await expect(verifyModeBReceipt({
      receiptPath: `.artifacts/acquisition/${fixture.receiptRelativePath}`,
      filesystem: fixture.store,
      verifierAttemptId: 'verify-partial-residual',
      repositoryRoot: fixture.root,
    })).rejects.toMatchObject({ code: 'E_RECEIPT_SCHEMA' });
  });

  it('accepts only the fixed portable receipt CLI path shape', () => {
    expect(normalizeReceiptCliPath(
      '.artifacts/acquisition/receipts/receipt-request-1.attempt-1.json',
    )).toBe('receipts/receipt-request-1.attempt-1.json');
    for (const value of [
      'receipts/receipt-request-1.attempt-1.json',
      '.artifacts/acquisition/receipts/../secret.json',
      '.artifacts\\acquisition\\receipts\\request-1.attempt-1.json',
      'G:/secret.json',
      '.artifacts/acquisition/receipts/receipt-request-1.attempt-1.json\n',
      '.artifacts/acquisition/receipts/receipt-request-1.attempt-1.json\u2028',
    ]) {
      expect(() => normalizeReceiptCliPath(value)).toThrow(/E_USAGE/u);
    }
  });
});

describe('receipt verifier CLI redaction', () => {
  it('uses exit 2 and only the fixed code for invalid usage', async () => {
    const secret = 'synthetic-secret-value';
    const result = await runFile(['--unexpected', secret]);
    expect(result).toEqual({ exitCode: 2, stdout: '', stderr: 'E_USAGE\n' });
    expect(result.stderr).not.toContain(secret);
  });
});
