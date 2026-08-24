import { execFile } from 'node:child_process';
import { link, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { loadTrustedModeBDescriptor, modeBReceiptIdentity, parseModeBReceiptEnvelope, validateModeBDescriptorObject, validateModeBReceiptObject, validateReceiptPrivacy, verifiedCacheRelativePath } from '../../scripts/fixtures/acquisition/contracts.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { ERROR_CODES, errorDefinition, publicError } from '../../scripts/fixtures/acquisition/errors.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { parseBoundedJsonBytes } from '../../scripts/fixtures/acquisition/json.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { acquireDescriptorHandleForTest, normalizeDescriptorPath } from '../../scripts/fixtures/acquisition/repository.mjs';

type JsonObject = Record<string, unknown>;

const createdRoots: string[] = [];
const descriptorPath = 'fixtures/acquisition/descriptors/synthetic.json';
const locator =
  'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/synthetic.glb';
const expectedSha256 = 'a'.repeat(64);
const descriptorSha256 = 'b'.repeat(64);

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
          GIT_AUTHOR_NAME: 'LociView acquisition test',
          GIT_AUTHOR_EMAIL: 'acquisition-test@invalid.example',
          GIT_COMMITTER_NAME: 'LociView acquisition test',
          GIT_COMMITTER_EMAIL: 'acquisition-test@invalid.example',
        },
      },
      (error, _stdout, stderr) => {
        if (error === null) accept();
        else reject(new Error(`git ${args[0]} failed: ${stderr}`));
      },
    );
  });
}

function descriptor(overrides: JsonObject = {}): JsonObject {
  return {
    $schema: 'fixtures/acquisition/schema/g0-fixture-release-restore-1.schema.json',
    schemaVersion: 'g0-fixture-release-restore-1',
    requestId: 'synthetic-restore-1',
    locator,
    expectedSha256,
    expectedBytes: 3,
    ...overrides,
  };
}

function context(): JsonObject {
  return {
    path: descriptorPath,
    sha256: descriptorSha256,
    value: validateModeBDescriptorObject(descriptor()),
  };
}

function successReceipt(overrides: JsonObject = {}): JsonObject {
  const identity = modeBReceiptIdentity();
  return {
    $schema: identity.schemaPath,
    schemaVersion: identity.schemaVersion,
    mode: identity.mode,
    trustTier: identity.trustTier,
    requestId: 'synthetic-restore-1',
    attemptId: 'attempt-123',
    descriptor: {
      path: descriptorPath,
      sha256: descriptorSha256,
    },
    startedAtUtc: '2026-08-24T00:00:00.000Z',
    completedAtUtc: '2026-08-24T00:00:01.000Z',
    outcome: 'success',
    error: null,
    sourceIdentity: locator,
    transport: {
      redirectOrigins: ['https://release-assets.githubusercontent.com:443'],
      redirectCount: 1,
      finalOrigin: 'https://release-assets.githubusercontent.com:443',
      status: 200,
      declaredBytes: 3,
      measuredBytes: 3,
      measuredSha256: expectedSha256,
      streamEnded: true,
      expectedMatch: true,
    },
    local: {
      disposition: 'verified-published',
      relativePath: verifiedCacheRelativePath(expectedSha256),
    },
    stableTransportIdentity: true,
    stableFixtureIdentity: false,
    registryAdopted: false,
    g0Credit: false,
    rendererOrProfileRatified: false,
    deviceEvidence: false,
    ...overrides,
  };
}

function failureReceipt(code: string, overrides: JsonObject = {}): JsonObject {
  const definition = errorDefinition(code);
  return successReceipt({
    outcome: 'failure',
    error: {
      code,
      exitCode: definition.exitCode,
      retryable: definition.retryable,
      hopIndex: 0,
    },
    transport: {
      redirectOrigins: [],
      redirectCount: 0,
      finalOrigin: 'https://github.com:443',
      status: null,
      declaredBytes: null,
      measuredBytes: 0,
      measuredSha256: null,
      streamEnded: false,
      expectedMatch: null,
    },
    local: {
      disposition: 'none',
      relativePath: null,
    },
    ...overrides,
  });
}

function expectCode(action: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ code });
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('bounded acquisition JSON', () => {
  it('rejects duplicate and escaped-equivalent members with the caller-owned code', () => {
    expectCode(
      () => parseBoundedJsonBytes(Buffer.from('{"a":1,"\\u0061":2}'), 1024),
      'E_SCHEMA',
    );
    expectCode(
      () => parseBoundedJsonBytes(
        Buffer.from('{"a":1,"a":2}'),
        1024,
        'E_RECEIPT_SCHEMA',
      ),
      'E_RECEIPT_SCHEMA',
    );
  });

  it('enforces UTF-8, depth, member, array, surrogate and safe-number bounds', () => {
    expectCode(() => parseBoundedJsonBytes(Buffer.from([0xff]), 10), 'E_SCHEMA');
    expect(() => parseBoundedJsonBytes(
      Buffer.from(`${'{"x":'.repeat(8)}0${'}'.repeat(8)}`),
      1024,
    )).not.toThrow();
    expectCode(() => parseBoundedJsonBytes(
      Buffer.from(`${'{"x":'.repeat(9)}0${'}'.repeat(9)}`),
      1024,
    ), 'E_SCHEMA');
    const object128 = Object.fromEntries(Array.from({ length: 128 }, (_, index) => [`k${index}`, index]));
    expect(() => parseBoundedJsonBytes(Buffer.from(JSON.stringify(object128)), 4096)).not.toThrow();
    const object129 = { ...object128, k128: 128 };
    expectCode(
      () => parseBoundedJsonBytes(Buffer.from(JSON.stringify(object129)), 4096),
      'E_SCHEMA',
    );
    expect(() => parseBoundedJsonBytes(Buffer.from(JSON.stringify(Array(16).fill(0))), 1024)).not.toThrow();
    expectCode(
      () => parseBoundedJsonBytes(Buffer.from(JSON.stringify(Array(17).fill(0))), 1024),
      'E_SCHEMA',
    );
    expectCode(() => parseBoundedJsonBytes(Buffer.from('"\\ud800"'), 1024), 'E_SCHEMA');
    expectCode(() => parseBoundedJsonBytes(Buffer.from('9007199254740992'), 1024), 'E_SCHEMA');
  });

  it('leaves URL length to the URL schema instead of the non-URL string cap', () => {
    const parsed = parseBoundedJsonBytes(
      Buffer.from(JSON.stringify({ locator: `https://example.invalid/${'a'.repeat(2_100)}` })),
      64 * 1024,
    ) as JsonObject;
    expect((parsed.locator as string).length).toBeGreaterThan(2_048);
  });
});

describe('Mode-B acquisition contracts', () => {
  it('accepts the exact descriptor and a canonical URL whose version makes it exceed 2,048 code units', () => {
    expect(() => validateModeBDescriptorObject(descriptor())).not.toThrow();
    const longLocator =
      `https://github.com/ChoRdChario/LociView/releases/download/fixtures-v${'1'.repeat(2_050)}/a.glb`;
    expect(longLocator.length).toBeGreaterThan(2_048);
    expect(() => validateModeBDescriptorObject(descriptor({ locator: longLocator }))).not.toThrow();
  });

  it('rejects extra fields, explicit ports, query strings and non-canonical asset names', () => {
    expectCode(() => validateModeBDescriptorObject(descriptor({ extra: true })), 'E_SCHEMA');
    expectCode(
      () => validateModeBDescriptorObject(descriptor({ locator: locator.replace('github.com/', 'github.com:443/') })),
      'E_SCHEMA',
    );
    expectCode(() => validateModeBDescriptorObject(descriptor({ locator: `${locator}?token=x` })), 'E_SCHEMA');
    expectCode(
      () => validateModeBDescriptorObject(descriptor({ locator: locator.replace('synthetic.glb', 'CON') })),
      'E_SCHEMA',
    );
  });

  it('rejects line terminators after portable IDs and digests at the schema boundary', () => {
    for (const terminator of ['\n', '\r', '\u2028', '\u2029']) {
      expectCode(
        () => validateModeBDescriptorObject(descriptor({ requestId: `request-id${terminator}` })),
        'E_SCHEMA',
      );
      expectCode(
        () => validateModeBDescriptorObject(descriptor({ expectedSha256: `${expectedSha256}${terminator}` })),
        'E_SCHEMA',
      );
      expectCode(
        () => parseModeBReceiptEnvelope(Buffer.from(JSON.stringify(
          successReceipt({ attemptId: `attempt-123${terminator}` }),
        ))),
        'E_RECEIPT_SCHEMA',
      );
      const badDigest = successReceipt();
      (badDigest.transport as JsonObject).measuredSha256 = `${expectedSha256}${terminator}`;
      expectCode(
        () => parseModeBReceiptEnvelope(Buffer.from(JSON.stringify(badDigest))),
        'E_RECEIPT_SCHEMA',
      );
    }
  });

  it('accepts the exact success branch and rejects self-asserted match or false credit', () => {
    const trusted = context();
    expect(() => validateModeBReceiptObject(successReceipt(), trusted)).not.toThrow();

    const wrongTuple = successReceipt();
    (wrongTuple.transport as JsonObject).measuredSha256 = 'c'.repeat(64);
    expectCode(() => validateModeBReceiptObject(wrongTuple, trusted), 'E_RECEIPT_SCHEMA');

    const falseCredit = successReceipt({ g0Credit: true });
    expectCode(() => validateModeBReceiptObject(falseCredit, trusted), 'E_RECEIPT_SCHEMA');
  });

  it('binds the approved unexpected-status error to exit 4 and retryable false', () => {
    const trusted = context();
    const receipt = failureReceipt('E_HTTP_UNEXPECTED_STATUS');
    (receipt.transport as JsonObject).status = 206;
    expect(() => validateModeBReceiptObject(receipt, trusted)).not.toThrow();

    const wrong = structuredClone(receipt);
    (wrong.error as JsonObject).retryable = true;
    expectCode(() => validateModeBReceiptObject(wrong, trusted), 'E_RECEIPT_SCHEMA');

    const mislabeled = structuredClone(receipt);
    Object.assign(mislabeled.error as JsonObject, publicError({}));
    expectCode(() => validateModeBReceiptObject(mislabeled, trusted), 'E_RECEIPT_SCHEMA');

    for (const status of [null, 200]) {
      const impossibleHttpError = failureReceipt('E_HTTP_NOT_FOUND');
      (impossibleHttpError.transport as JsonObject).status = status;
      expectCode(
        () => validateModeBReceiptObject(impossibleHttpError, trusted),
        'E_RECEIPT_SCHEMA',
      );
    }
  });

  it('rejects no-receipt error classes, redirect-count drift and reversed time', () => {
    const trusted = context();
    expectCode(
      () => validateModeBReceiptObject(failureReceipt('E_LOCK_BUSY'), trusted),
      'E_RECEIPT_SCHEMA',
    );

    const redirectDrift = failureReceipt('E_DNS_IO');
    (redirectDrift.transport as JsonObject).redirectOrigins = ['https://github.com:443'];
    expectCode(() => validateModeBReceiptObject(redirectDrift, trusted), 'E_RECEIPT_SCHEMA');

    const reversed = failureReceipt('E_DNS_IO', {
      startedAtUtc: '2026-08-24T00:00:02.000Z',
      completedAtUtc: '2026-08-24T00:00:01.000Z',
    });
    expectCode(() => validateModeBReceiptObject(reversed, trusted), 'E_RECEIPT_SCHEMA');
  });

  it('binds final-200 header failures to their exact pre-body facts', () => {
    const trusted = context();
    const headerFacts = {
      redirectOrigins: [],
      redirectCount: 0,
      finalOrigin: 'https://github.com:443',
      status: 200,
      declaredBytes: null,
      measuredBytes: 0,
      measuredSha256: null,
      streamEnded: false,
      expectedMatch: null,
    };
    for (const code of ['E_DECLARED_LENGTH', 'E_CONTENT_ENCODING']) {
      expect(() => validateModeBReceiptObject(
        failureReceipt(code, { transport: { ...headerFacts } }),
        trusted,
      )).not.toThrow();
      expectCode(
        () => validateModeBReceiptObject(failureReceipt(code), trusted),
        'E_RECEIPT_SCHEMA',
      );
    }

    const impossibleDeclaredMatch = failureReceipt('E_DECLARED_LENGTH', {
      transport: { ...headerFacts, declaredBytes: 3 },
    });
    expectCode(
      () => validateModeBReceiptObject(impossibleDeclaredMatch, trusted),
      'E_RECEIPT_SCHEMA',
    );
    const impossibleEncodingLength = failureReceipt('E_CONTENT_ENCODING', {
      transport: { ...headerFacts, declaredBytes: 4 },
    });
    expectCode(
      () => validateModeBReceiptObject(impossibleEncodingLength, trusted),
      'E_RECEIPT_SCHEMA',
    );
  });

  it('binds body-integrity errors to their exact measured phase facts', () => {
    const trusted = context();
    const cases = [
      failureReceipt('E_EXTRA_BYTES', {
        transport: {
          redirectOrigins: [],
          redirectCount: 0,
          finalOrigin: 'https://github.com:443',
          status: 200,
          declaredBytes: null,
          measuredBytes: 4,
          measuredSha256: null,
          streamEnded: false,
          expectedMatch: null,
        },
      }),
      failureReceipt('E_DIGEST_MISMATCH', {
        transport: {
          redirectOrigins: [],
          redirectCount: 0,
          finalOrigin: 'https://github.com:443',
          status: 200,
          declaredBytes: null,
          measuredBytes: 3,
          measuredSha256: 'c'.repeat(64),
          streamEnded: true,
          expectedMatch: false,
        },
      }),
      failureReceipt('E_TRUNCATED', {
        transport: {
          redirectOrigins: [],
          redirectCount: 0,
          finalOrigin: 'https://github.com:443',
          status: 200,
          declaredBytes: null,
          measuredBytes: 2,
          measuredSha256: 'd'.repeat(64),
          streamEnded: true,
          expectedMatch: false,
        },
      }),
    ];
    for (const receipt of cases) {
      expect(() => validateModeBReceiptObject(receipt, trusted)).not.toThrow();
    }

    const mislabeledCleanEof = failureReceipt('E_DNS_IO', {
      transport: {
        redirectOrigins: [],
        redirectCount: 0,
        finalOrigin: 'https://github.com:443',
        status: 200,
        declaredBytes: null,
        measuredBytes: 2,
        measuredSha256: 'd'.repeat(64),
        streamEnded: true,
        expectedMatch: false,
      },
    });
    expectCode(
      () => validateModeBReceiptObject(mislabeledCleanEof, trusted),
      'E_RECEIPT_SCHEMA',
    );
    for (const code of ['E_TRUNCATED', 'E_EXTRA_BYTES', 'E_DIGEST_MISMATCH', 'E_OVERSIZE']) {
      expectCode(
        () => validateModeBReceiptObject(failureReceipt(code), trusted),
        'E_RECEIPT_SCHEMA',
      );
    }
  });

  it('rejects quota failure after an exact transport match', () => {
    const definition = errorDefinition('E_NO_SPACE');
    const impossible = successReceipt({
      outcome: 'failure',
      error: {
        code: 'E_NO_SPACE',
        exitCode: definition.exitCode,
        retryable: definition.retryable,
        hopIndex: 0,
      },
      local: { disposition: 'none', relativePath: null },
    });
    expectCode(
      () => validateModeBReceiptObject(impossible, context()),
      'E_RECEIPT_SCHEMA',
    );
  });

  it('keeps privacy rejection fixed and free of the secret value', () => {
    const secret = 'synthetic-secret-value';
    expectCode(
      () => validateReceiptPrivacy({ note: `Authorization: Bearer ${secret}`, sourceIdentity: null }),
      'E_RECEIPT_PRIVACY',
    );
  });

  it('keeps every central error definition closed and includes the approved code', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    expect(ERROR_CODES).toContain('E_HTTP_UNEXPECTED_STATUS');
    expect(errorDefinition('E_HTTP_UNEXPECTED_STATUS')).toEqual({ exitCode: 4, retryable: false });
    expect(() => errorDefinition('E_NOT_A_REAL_CODE')).toThrow(/unknown acquisition error code/u);
  });
});

describe('trusted indexed Mode-B descriptor', () => {
  it('rejects descriptor paths that the exact receipt grammar cannot encode before I/O', () => {
    expect(normalizeDescriptorPath(
      'fixtures/acquisition/descriptors/nested/synthetic-1.json',
    )).toBe('fixtures/acquisition/descriptors/nested/synthetic-1.json');
    expect(() => normalizeDescriptorPath(
      'fixtures/acquisition/descriptors/日本語.json',
    )).toThrow(/E_DESCRIPTOR/u);
  });

  it('closes a descriptor handle acquired across the overall deadline', async () => {
    let checkpoints = 0;
    let closed = false;
    const attemptControl = {
      checkpoint() {
        checkpoints += 1;
        if (checkpoints === 2) throw Object.assign(new Error('deadline'), { code: 'E_OVERALL_TIMEOUT' });
      },
    };
    await expect(acquireDescriptorHandleForTest(
      async () => ({
        async close() { closed = true; },
      }),
      attemptControl,
    )).rejects.toMatchObject({ code: 'E_OVERALL_TIMEOUT' });
    expect(closed).toBe(true);
  });

  it('requires exact stage-0 worktree bytes and a single-link regular file', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'lociview-acquisition-contract-'));
    createdRoots.push(root);
    const absolute = resolve(root, ...descriptorPath.split('/'));
    await mkdir(resolve(absolute, '..'), { recursive: true });
    await writeFile(absolute, `${JSON.stringify(descriptor(), null, 2)}\n`, 'utf8');
    await runGit(root, ['init', '--quiet']);
    await runGit(root, ['add', '--', descriptorPath]);

    const trusted = await loadTrustedModeBDescriptor(descriptorPath, root);
    expect(trusted.path).toBe(descriptorPath);
    expect(trusted.value.requestId).toBe('synthetic-restore-1');

    await writeFile(absolute, `${JSON.stringify(descriptor({ expectedBytes: 4 }), null, 2)}\n`, 'utf8');
    await expect(loadTrustedModeBDescriptor(descriptorPath, root)).rejects.toMatchObject({
      code: 'E_DESCRIPTOR',
    });

    await runGit(root, ['add', '--', descriptorPath]);
    const alias = resolve(root, 'descriptor-hardlink-alias');
    await link(absolute, alias);
    await expect(loadTrustedModeBDescriptor(descriptorPath, root)).rejects.toMatchObject({
      code: 'E_DESCRIPTOR',
    });
    await unlink(alias);
  });
});
