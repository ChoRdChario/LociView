import { createHash } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open as fsOpen,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  truncate,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createTestFilesystem } from '../../scripts/fixtures/acquisition/filesystem.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createTestAttemptControl } from '../../scripts/fixtures/acquisition/attempt.mjs';

const createdRoots: string[] = [];
const RECEIPT_BYTES = 128n * 1024n;
const HEADROOM_BYTES = 512n * 1024n * 1024n;
const ROOT_BYTES = 6n * 1024n * 1024n * 1024n;
const body = Buffer.from('abc');
const digest = createHash('sha256').update(body).digest('hex');

async function makeRepository(): Promise<{ repositoryRoot: string; acquisitionRoot: string }> {
  const repositoryRoot = await mkdtemp(resolve(tmpdir(), 'lociview-acquisition-fs-'));
  createdRoots.push(repositoryRoot);
  return {
    repositoryRoot,
    acquisitionRoot: resolve(repositoryRoot, '.artifacts', 'acquisition'),
  };
}

function filesystem(
  paths: { repositoryRoot: string; acquisitionRoot: string },
  options: Record<string, unknown> = {},
): ReturnType<typeof createTestFilesystem> {
  return createTestFilesystem({ ...paths, ...options });
}

async function exactPartial(
  lease: Awaited<ReturnType<ReturnType<typeof createTestFilesystem>['openWriterLease']>>,
): Promise<void> {
  await lease.admitModeB(body.byteLength);
  await lease.createPartial(body.byteLength);
  expect(await lease.appendPartial(body)).toEqual({ measuredBytes: 3, extra: false });
  expect(await lease.completeBody()).toEqual({
    measuredBytes: 3,
    measuredSha256: digest,
    sealed: true,
  });
}

async function writeEmptyFiles(
  directory: string,
  prefix: string,
  count: number,
  start = 0,
): Promise<void> {
  for (let offset = 0; offset < count; offset += 100) {
    const length = Math.min(100, count - offset);
    await Promise.all(Array.from({ length }, (_, index) => writeFile(
      resolve(directory, `${prefix}-${start + offset + index}.tmp`),
      '',
    )));
  }
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolvePromiseInner) => {
    resolvePromise = resolvePromiseInner;
  });
  return { promise, resolve: resolvePromise };
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('acquisition writer lock and admission', () => {
  it('rejects line terminators after portable attempt and request IDs', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    for (const terminator of ['\n', '\r', '\u2028', '\u2029']) {
      await expect(store.openWriterLease({ attemptId: `attempt-id${terminator}` }))
        .rejects.toMatchObject({ code: 'E_USAGE' });
    }
    await expect(lstat(paths.acquisitionRoot)).rejects.toMatchObject({ code: 'ENOENT' });

    const writer = await store.openWriterLease({ attemptId: 'attempt-portable-ids' });
    await writer.admitModeB(body.byteLength);
    for (const terminator of ['\n', '\r', '\u2028', '\u2029']) {
      await expect(writer.stageReceipt({
        requestId: `request-id${terminator}`,
        bytes: Buffer.from('{}\n'),
        validateBytes: () => undefined,
      })).rejects.toMatchObject({ code: 'E_RECEIPT_SCHEMA' });
    }
    expect(await readdir(resolve(paths.acquisitionRoot, 'receipts'))).toEqual([]);
    await writer.finish();
  });

  it('serializes writers and never treats a stale lock as removable', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const first = await store.openWriterLease({ attemptId: 'attempt-001' });
    await expect(store.openWriterLease({ attemptId: 'attempt-002' })).rejects.toMatchObject({
      code: 'E_LOCK_BUSY',
    });
    expect(await first.finish()).toEqual({ committed: false, lockRetained: false });

    const stalePath = resolve(paths.acquisitionRoot, 'writer.lock');
    await writeFile(stalePath, '');
    await expect(store.openWriterLease({ attemptId: 'attempt-003' })).rejects.toMatchObject({
      code: 'E_LOCK_BUSY',
    });
    expect((await lstat(stalePath)).size).toBe(0);
  });

  it.each(['lock-file', 'lock-directory'] as const)(
    'removes its lock after a one-shot %s durability failure',
    async (phase) => {
      const paths = await makeRepository();
      let lockOpened = false;
      let injected = false;
      const store = filesystem(paths, {
        io: {
          open: async (...args: any[]) => {
            const handle = await (fsOpen as any)(...args);
            const path = String(args[0]);
            if (path.endsWith('writer.lock') && args[1] === 'wx+') {
              lockOpened = true;
              if (phase === 'lock-file') {
                return new Proxy(handle, {
                  get(target, property) {
                    if (property === 'sync') {
                      return async () => {
                        injected = true;
                        const error = new Error('synthetic lock file sync failure') as NodeJS.ErrnoException;
                        error.code = 'EIO';
                        throw error;
                      };
                    }
                    const value = Reflect.get(target, property, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                  },
                });
              }
            }
            if (
              phase === 'lock-directory' &&
              lockOpened &&
              !injected &&
              path === paths.acquisitionRoot &&
              args[1] === 'r'
            ) {
              return new Proxy(handle, {
                get(target, property) {
                  if (property === 'sync') {
                    return async () => {
                      injected = true;
                      const error = new Error('synthetic lock directory sync failure') as NodeJS.ErrnoException;
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
      await expect(store.openWriterLease({ attemptId: `attempt-${phase}-failure` }))
        .rejects.toMatchObject({ code: 'E_LOCAL_IO' });
      expect(injected).toBe(true);
      await expect(lstat(resolve(paths.acquisitionRoot, 'writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('does not create layout while an offline verifier is only observing', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    await expect(store.withVerifierLease(
      {
        receiptRelativePath: 'receipts/receipt-request-1.attempt-1.json',
        attemptId: 'verify-001',
      },
      async () => undefined,
    )).rejects.toMatchObject({ code: 'E_CONTAINMENT' });
    await expect(lstat(paths.acquisitionRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('accepts exact free-space and root-byte boundaries and rejects one unit less or more', async () => {
    const requiredFree = BigInt(body.byteLength) + RECEIPT_BYTES + HEADROOM_BYTES;

    const exactFreePaths = await makeRepository();
    const exactFreeStore = filesystem(exactFreePaths, {
      io: { statfs: async () => ({ bavail: requiredFree, bsize: 1n }) },
    });
    const exactFreeLease = await exactFreeStore.openWriterLease({ attemptId: 'attempt-free-equal' });
    await expect(exactFreeLease.admitModeB(body.byteLength)).resolves.toEqual({ expectedBytes: 3 });
    await exactFreeLease.finish();

    const shortFreePaths = await makeRepository();
    const shortFreeStore = filesystem(shortFreePaths, {
      io: { statfs: async () => ({ bavail: requiredFree - 1n, bsize: 1n }) },
    });
    const shortFreeLease = await shortFreeStore.openWriterLease({ attemptId: 'attempt-free-short' });
    await expect(shortFreeLease.admitModeB(body.byteLength)).rejects.toMatchObject({ code: 'E_NO_SPACE' });
    await shortFreeLease.finish();

    const exactRootPaths = await makeRepository();
    const exactRootStore = filesystem(exactRootPaths, {
      io: { statfs: async () => ({ bavail: requiredFree, bsize: 1n }) },
    });
    const layoutLease = await exactRootStore.openWriterLease({ attemptId: 'attempt-root-layout' });
    await layoutLease.finish();
    const rootFiller = resolve(
      exactRootPaths.acquisitionRoot,
      'partial',
      'stale-logical-root-reservation.body.partial',
    );
    await writeFile(rootFiller, '');
    await truncate(rootFiller, Number(ROOT_BYTES - RECEIPT_BYTES - BigInt(body.byteLength)));
    const exactRootLease = await exactRootStore.openWriterLease({ attemptId: 'attempt-root-equal' });
    await expect(exactRootLease.admitModeB(body.byteLength)).resolves.toEqual({ expectedBytes: 3 });
    await exactRootLease.finish();

    await truncate(
      rootFiller,
      Number(ROOT_BYTES - RECEIPT_BYTES - BigInt(body.byteLength) + 1n),
    );
    const formulaOverLease = await exactRootStore.openWriterLease({ attemptId: 'attempt-root-formula-over' });
    await expect(formulaOverLease.admitModeB(body.byteLength))
      .rejects.toMatchObject({ code: 'E_NO_SPACE' });
    await formulaOverLease.finish();

    await truncate(rootFiller, Number(ROOT_BYTES + 1n));
    await expect(exactRootStore.openWriterLease({ attemptId: 'attempt-root-over' }))
      .rejects.toMatchObject({ code: 'E_NO_SPACE' });
  }, 20_000);

  it('accepts exactly 1,000 acquisition-root entries including the writer lock and rejects one more', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const layout = await store.openWriterLease({ attemptId: 'attempt-root-entry-layout' });
    await layout.finish();
    await writeEmptyFiles(paths.acquisitionRoot, 'root-entry', 995);
    const exact = await store.openWriterLease({ attemptId: 'attempt-root-entry-equal' });
    expect(exact.inventory.rootEntries).toBe(1_000);
    await exact.finish();
    await writeEmptyFiles(paths.acquisitionRoot, 'root-entry', 1, 995);
    await expect(store.openWriterLease({ attemptId: 'attempt-root-entry-over' }))
      .rejects.toMatchObject({ code: 'E_NO_SPACE' });
  }, 20_000);

  it('preflights missing tier slots before mutating an existing acquisition root', async () => {
    const exactPaths = await makeRepository();
    await mkdir(exactPaths.acquisitionRoot, { recursive: true });
    await writeEmptyFiles(exactPaths.acquisitionRoot, 'preflight-root-entry', 995);
    const exact = await filesystem(exactPaths).openWriterLease({ attemptId: 'attempt-preflight-equal' });
    expect(exact.inventory.rootEntries).toBe(1_000);
    await exact.finish();

    const overPaths = await makeRepository();
    await mkdir(overPaths.acquisitionRoot, { recursive: true });
    await writeEmptyFiles(overPaths.acquisitionRoot, 'preflight-root-entry', 996);
    await expect(filesystem(overPaths).openWriterLease({ attemptId: 'attempt-preflight-over' }))
      .rejects.toMatchObject({ code: 'E_NO_SPACE' });
    for (const name of ['partial', 'unverified', 'verified-transport', 'receipts', 'writer.lock']) {
      await expect(lstat(resolve(overPaths.acquisitionRoot, name)))
        .rejects.toMatchObject({ code: 'ENOENT' });
    }
  }, 20_000);

  it('re-syncs every fixed layout parent and the writer-lock entry on each lease', async () => {
    const paths = await makeRepository();
    const synced: string[] = [];
    const store = filesystem(paths, {
      io: {
        open: async (...args: any[]) => {
          const handle = await (fsOpen as any)(...args);
          const path = String(args[0]);
          if (args[1] !== 'r') return handle;
          return new Proxy(handle, {
            get(target, property) {
              if (property === 'sync') {
                return async () => {
                  try { return await target.sync(); }
                  finally { synced.push(path); }
                };
              }
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        },
      },
    });
    const first = await store.openWriterLease({ attemptId: 'attempt-layout-sync-first' });
    expect(synced).toEqual([
      paths.repositoryRoot,
      resolve(paths.repositoryRoot, '.artifacts'),
      paths.acquisitionRoot,
      paths.acquisitionRoot,
      paths.acquisitionRoot,
      paths.acquisitionRoot,
      paths.acquisitionRoot,
    ]);
    await first.finish();

    synced.length = 0;
    const second = await store.openWriterLease({ attemptId: 'attempt-layout-sync-second' });
    expect(synced).toEqual([
      paths.repositoryRoot,
      resolve(paths.repositoryRoot, '.artifacts'),
      paths.acquisitionRoot,
      paths.acquisitionRoot,
      paths.acquisitionRoot,
      paths.acquisitionRoot,
      paths.acquisitionRoot,
    ]);
    await second.finish();
  });

  it.each([
    ['partial', 999],
    ['verified-transport', 999],
    ['receipts', 998],
  ] as const)(
    'reserves the exact Mode-B entry slots in %s and rejects one extra stale entry',
    async (tier, exactExisting) => {
      const paths = await makeRepository();
      const store = filesystem(paths, {
        io: {
          statfs: async () => ({
            bavail: HEADROOM_BYTES + RECEIPT_BYTES + BigInt(body.byteLength),
            bsize: 1n,
          }),
        },
      });
      const layout = await store.openWriterLease({ attemptId: `attempt-${tier}-layout` });
      await layout.finish();
      const directory = resolve(paths.acquisitionRoot, tier);
      await writeEmptyFiles(directory, `${tier}-stale`, exactExisting);
      const exact = await store.openWriterLease({ attemptId: `attempt-${tier}-equal` });
      await expect(exact.admitModeB(body.byteLength)).resolves.toEqual({ expectedBytes: 3 });
      await exact.finish();
      await writeEmptyFiles(directory, `${tier}-stale`, 1, exactExisting);
      const over = await store.openWriterLease({ attemptId: `attempt-${tier}-over` });
      await expect(over.admitModeB(body.byteLength)).rejects.toMatchObject({ code: 'E_NO_SPACE' });
      await over.finish();
    },
    20_000,
  );

  it('rejects a hard-linked stale file before acquiring the writer lock', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const layout = await store.openWriterLease({ attemptId: 'attempt-hardlink-layout' });
    await layout.finish();
    const stale = resolve(paths.acquisitionRoot, 'partial', 'stale.body.partial');
    await writeFile(stale, 'stale');
    await link(stale, resolve(paths.acquisitionRoot, 'partial', 'stale-alias.body.partial'));
    await expect(store.openWriterLease({ attemptId: 'attempt-hardlink-reject' }))
      .rejects.toMatchObject({ code: 'E_CONTAINMENT' });
    await expect(lstat(resolve(paths.acquisitionRoot, 'writer.lock')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['ancestor', 'tier'] as const)(
    'rejects a pre-existing %s directory junction without following it',
    async (location) => {
      const paths = await makeRepository();
      const target = resolve(paths.repositoryRoot, `junction-target-${location}`);
      await mkdir(target);
      if (location === 'ancestor') {
        await symlink(target, resolve(paths.repositoryRoot, '.artifacts'), 'junction');
      } else {
        const store = filesystem(paths);
        const layout = await store.openWriterLease({ attemptId: 'attempt-junction-layout' });
        await layout.finish();
        await rm(resolve(paths.acquisitionRoot, 'partial'), { recursive: true });
        await symlink(target, resolve(paths.acquisitionRoot, 'partial'), 'junction');
      }
      await expect(filesystem(paths).openWriterLease({ attemptId: `attempt-junction-${location}` }))
        .rejects.toMatchObject({ code: 'E_CONTAINMENT' });
      await expect(lstat(resolve(paths.acquisitionRoot, 'writer.lock')))
        .rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
});

describe('partial, cache and receipt publication', () => {
  it('does not start cache publication after the overall deadline is already primary', async () => {
    const paths = await makeRepository();
    let now = 0;
    let linkCalls = 0;
    const attemptControl = createTestAttemptControl({
      overallMs: 10,
      now: () => now,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const store = filesystem(paths, {
      attemptControl,
      io: {
        link: async () => {
          linkCalls += 1;
          throw new Error('link must not start after deadline');
        },
      },
    });
    const writer = await store.openWriterLease({ attemptId: 'attempt-expired-before-link' });
    await exactPartial(writer);
    now = 10;
    await expect(writer.publishVerified(body.byteLength, digest))
      .rejects.toMatchObject({ code: 'E_OVERALL_TIMEOUT' });
    expect(linkCalls).toBe(0);
    writer.beginFailureWork();
    await expect(writer.cleanupPartial()).resolves.toBe(true);
    await writer.finish();
  });

  it('observes but never persists the one-byte extra-body probe', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const lease = await store.openWriterLease({ attemptId: 'attempt-probe' });
    await lease.admitModeB(3);
    await lease.createPartial(3);
    expect(await lease.appendPartial(Buffer.from('abcd'))).toEqual({ measuredBytes: 4, extra: true });
    expect((await stat(resolve(paths.acquisitionRoot, 'partial', 'attempt-probe.body.partial'))).size).toBe(3);
    expect(await lease.cleanupPartial()).toBe(true);
    await lease.finish();
  });

  it('publishes exact bytes without clobber and rehashes an existing cache before reuse', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const first = await store.openWriterLease({ attemptId: 'attempt-cache-first' });
    await exactPartial(first);
    expect(await first.publishVerified(3, digest)).toEqual({
      disposition: 'verified-published',
      relativePath: `verified-transport/sha256-${digest}.blob`,
      created: true,
    });
    await first.finish();

    const cachePath = resolve(paths.acquisitionRoot, 'verified-transport', `sha256-${digest}.blob`);
    expect(await readFile(cachePath)).toEqual(body);
    expect((await lstat(cachePath)).nlink).toBe(1);

    const second = await store.openWriterLease({ attemptId: 'attempt-cache-second' });
    await exactPartial(second);
    expect(await second.publishVerified(3, digest)).toEqual({
      disposition: 'cache-reused',
      relativePath: `verified-transport/sha256-${digest}.blob`,
      created: false,
    });
    await second.finish();
    expect(await readFile(cachePath)).toEqual(body);
  });

  it('preserves a conflicting cache and returns the fixed mismatch code', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const layout = await store.openWriterLease({ attemptId: 'attempt-layout' });
    await layout.finish();
    const cachePath = resolve(paths.acquisitionRoot, 'verified-transport', `sha256-${digest}.blob`);
    await writeFile(cachePath, 'xyz');

    const lease = await store.openWriterLease({ attemptId: 'attempt-conflict' });
    await exactPartial(lease);
    await expect(lease.publishVerified(3, digest)).rejects.toMatchObject({
      code: 'E_CACHE_MISMATCH',
    });
    expect(await readFile(cachePath, 'utf8')).toBe('xyz');
    await lease.finish();
  });

  it('commits a single-link receipt last with a safe prefix and lets the offline lease bind its cache', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const writer = await store.openWriterLease({ attemptId: 'attempt-receipt' });
    await exactPartial(writer);
    await writer.publishVerified(3, digest);
    const bytes = Buffer.from('{"synthetic":true}\n');
    const validateBytes = (value: Uint8Array): void => {
      expect(Buffer.from(value)).toEqual(bytes);
    };
    await writer.stageReceipt({ requestId: 'con', bytes, validateBytes });
    const receiptRelativePath = await writer.commitReceipt({ success: true });
    expect(receiptRelativePath).toBe('receipts/receipt-con.attempt-receipt.json');
    expect(await writer.finish()).toEqual({ committed: true, lockRetained: false });

    const receiptPath = resolve(paths.acquisitionRoot, ...receiptRelativePath.split('/'));
    expect((await lstat(receiptPath)).nlink).toBe(1);
    const result = await store.withVerifierLease(
      { receiptRelativePath, attemptId: 'verify-receipt' },
      async (observation: {
        bytes: Uint8Array;
        verifyLocalBinding(input: {
          relativePath: string;
          expectedBytes: number;
          expectedSha256: string;
        }): Promise<void>;
      }) => {
        expect(Buffer.from(observation.bytes)).toEqual(bytes);
        await observation.verifyLocalBinding({
          relativePath: `verified-transport/sha256-${digest}.blob`,
          expectedBytes: 3,
          expectedSha256: digest,
        });
        return 'verified';
      },
    );
    expect(result).toBe('verified');
  });

  it('rolls back a visible receipt on a commit fault before releasing the lock', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths, {
      fault: async (name: string) => {
        if (name === 'after-receipt-link') throw new Error('synthetic receipt link fault');
      },
    });
    const lease = await store.openWriterLease({ attemptId: 'attempt-rollback' });
    await lease.admitModeB(3);
    const bytes = Buffer.from('{}\n');
    await lease.stageReceipt({
      requestId: 'request-rollback',
      bytes,
      validateBytes: () => undefined,
    });
    await expect(lease.commitReceipt({ success: true })).rejects.toMatchObject({
      code: 'E_RECEIPT_IO',
    });
    await lease.finish();
    await expect(lstat(resolve(
      paths.acquisitionRoot,
      'receipts',
      'receipt-request-rollback.attempt-rollback.json',
    ))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(resolve(
      paths.acquisitionRoot,
      'receipts',
      'receipt-request-rollback.attempt-rollback.stage.json',
    ))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(resolve(paths.acquisitionRoot, 'writer.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('preserves an existing receipt stage and reports a publish conflict', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const writer = await store.openWriterLease({ attemptId: 'attempt-stage-conflict' });
    await writer.admitModeB(body.byteLength);
    const stagePath = resolve(
      paths.acquisitionRoot,
      'receipts',
      'receipt-request-stage-conflict.attempt-stage-conflict.stage.json',
    );
    const sentinel = Buffer.from('existing-stage-sentinel\n');
    await writeFile(stagePath, sentinel);
    await expect(writer.stageReceipt({
      requestId: 'request-stage-conflict',
      bytes: Buffer.from('{}\n'),
      validateBytes: () => undefined,
    })).rejects.toMatchObject({ code: 'E_PUBLISH_CONFLICT' });
    expect(await readFile(stagePath)).toEqual(sentinel);
    await writer.finish();
  });

  it('retains a fail-closed lock and hard-link alias when visible receipt rollback is indeterminate', async () => {
    const paths = await makeRepository();
    const finalName = 'receipt-request-ambiguous.attempt-ambiguous.json';
    const realUnlink = unlink;
    let lockHandleSynced = false;
    let lockDirectorySynced = false;
    let durableBeforeReceiptFault = false;
    const store = filesystem(paths, {
      io: {
        open: async (...args: any[]) => {
          const handle = await (fsOpen as any)(...args);
          const path = String(args[0]);
          if (path.endsWith('writer.lock') && args[1] === 'wx+') {
            return new Proxy(handle, {
              get(target, property) {
                if (property === 'sync') {
                  return async () => {
                    const result = await target.sync();
                    lockHandleSynced = true;
                    return result;
                  };
                }
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          }
          if (
            lockHandleSynced &&
            !lockDirectorySynced &&
            path === paths.acquisitionRoot &&
            args[1] === 'r'
          ) {
            return new Proxy(handle, {
              get(target, property) {
                if (property === 'sync') {
                  return async () => {
                    try { return await target.sync(); }
                    finally { lockDirectorySynced = true; }
                  };
                }
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          }
          return handle;
        },
        unlink: async (path: string) => {
          if (path.endsWith(finalName)) {
            const error = new Error('synthetic unlink failure') as NodeJS.ErrnoException;
            error.code = 'EPERM';
            throw error;
          }
          return realUnlink(path);
        },
      },
      fault: async (name: string) => {
        if (name === 'after-receipt-link') {
          durableBeforeReceiptFault = lockHandleSynced && lockDirectorySynced;
          throw new Error('synthetic ambiguous commit');
        }
      },
    });
    const lease = await store.openWriterLease({ attemptId: 'attempt-ambiguous' });
    await lease.admitModeB(3);
    await lease.stageReceipt({
      requestId: 'request-ambiguous',
      bytes: Buffer.from('{}\n'),
      validateBytes: () => undefined,
    });
    await expect(lease.commitReceipt({ success: true })).rejects.toMatchObject({
      code: 'E_RECEIPT_IO',
    });
    expect(durableBeforeReceiptFault).toBe(true);
    expect(await lease.finish()).toEqual({ committed: false, lockRetained: true });
    expect((await lstat(resolve(paths.acquisitionRoot, 'writer.lock'))).size).toBe(0);
    expect((await lstat(resolve(paths.acquisitionRoot, 'receipts', finalName))).nlink).toBe(2);
    expect((await lstat(resolve(
      paths.acquisitionRoot,
      'receipts',
      'receipt-request-ambiguous.attempt-ambiguous.stage.json',
    ))).nlink).toBe(2);
    await expect(store.withVerifierLease(
      {
        receiptRelativePath: `receipts/${finalName}`,
        attemptId: 'verify-ambiguous-retained-lock',
      },
      async () => undefined,
    )).rejects.toMatchObject({ code: 'E_LOCK_BUSY' });
  });

  it('rolls back receipt names and releases the lock after a one-shot directory-sync failure', async () => {
    const paths = await makeRepository();
    const receiptDirectory = resolve(paths.acquisitionRoot, 'receipts');
    let failNextReceiptSync = true;
    const store = filesystem(paths, {
      io: {
        open: async (...args: any[]) => {
          const handle = await (fsOpen as any)(...args);
          if (failNextReceiptSync && String(args[0]) === receiptDirectory && args[1] === 'r') {
            return new Proxy(handle, {
              get(target, property) {
                if (property === 'sync') {
                  return async () => {
                    failNextReceiptSync = false;
                    const error = new Error('synthetic receipt directory sync failure') as NodeJS.ErrnoException;
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
    const writer = await store.openWriterLease({ attemptId: 'attempt-sync-failure' });
    await writer.admitModeB(3);
    await writer.stageReceipt({
      requestId: 'request-sync-failure',
      bytes: Buffer.from('{}\n'),
      validateBytes: () => undefined,
    });
    await expect(writer.commitReceipt({ success: true })).rejects.toMatchObject({
      code: 'E_RECEIPT_IO',
    });
    expect(await writer.finish()).toEqual({ committed: false, lockRetained: false });
    for (const name of [
      'receipt-request-sync-failure.attempt-sync-failure.json',
      'receipt-request-sync-failure.attempt-sync-failure.stage.json',
    ]) {
      await expect(lstat(resolve(receiptDirectory, name))).rejects.toMatchObject({ code: 'ENOENT' });
    }
    await expect(lstat(resolve(paths.acquisitionRoot, 'writer.lock')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rolls back receipt names when durable final-path revalidation fails once', async () => {
    const paths = await makeRepository();
    const finalName = 'receipt-request-revalidate.attempt-revalidate.json';
    let finalInspections = 0;
    const store = filesystem(paths, {
      io: {
        lstat: async (...args: any[]) => {
          if (String(args[0]).endsWith(finalName) && ++finalInspections === 3) {
            const error = new Error('synthetic durable receipt revalidation failure') as NodeJS.ErrnoException;
            error.code = 'EIO';
            throw error;
          }
          return (lstat as any)(...args);
        },
      },
    });
    const writer = await store.openWriterLease({ attemptId: 'attempt-revalidate' });
    await writer.admitModeB(3);
    await writer.stageReceipt({
      requestId: 'request-revalidate',
      bytes: Buffer.from('{}\n'),
      validateBytes: () => undefined,
    });
    await expect(writer.commitReceipt({ success: true })).rejects.toMatchObject({
      code: 'E_RECEIPT_IO',
    });
    expect(finalInspections).toBeGreaterThanOrEqual(4);
    expect(await writer.finish()).toEqual({ committed: false, lockRetained: false });
    for (const name of [finalName, 'receipt-request-revalidate.attempt-revalidate.stage.json']) {
      await expect(lstat(resolve(paths.acquisitionRoot, 'receipts', name)))
        .rejects.toMatchObject({ code: 'ENOENT' });
    }
    await expect(lstat(resolve(paths.acquisitionRoot, 'writer.lock')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('offline verifier serialization', () => {
  it.each([
    'after-receipt-link',
    'after-receipt-source-unlink',
    'before-receipt-directory-sync',
  ] as const)('blocks verifier observation while receipt commit is paused at %s', async (point) => {
    const paths = await makeRepository();
    const reached = deferred();
    const release = deferred();
    let paused = false;
    const store = filesystem(paths, {
      fault: async (name: string) => {
        if (!paused && name === point) {
          paused = true;
          reached.resolve();
          await release.promise;
        }
      },
    });
    const producer = await store.openWriterLease({ attemptId: `attempt-race-${point}` });
    await producer.admitModeB(3);
    await producer.stageReceipt({
      requestId: 'request-race-point',
      bytes: Buffer.from('{}\n'),
      validateBytes: () => undefined,
    });
    const commit = producer.commitReceipt({ success: true });
    await reached.promise;
    await expect(store.withVerifierLease(
      {
        receiptRelativePath: `receipts/receipt-request-race-point.attempt-race-${point}.json`,
        attemptId: `verify-race-${point}`,
      },
      async () => undefined,
    )).rejects.toMatchObject({ code: 'E_LOCK_BUSY' });
    release.resolve();
    await expect(commit).resolves.toBe(
      `receipts/receipt-request-race-point.attempt-race-${point}.json`,
    );
    await producer.finish();
  });

  it('blocks verifier observation while the actual receipt-directory sync is in progress', async () => {
    const paths = await makeRepository();
    const receiptDirectory = resolve(paths.acquisitionRoot, 'receipts');
    const reached = deferred();
    const release = deferred();
    let pauseNextReceiptSync = true;
    const store = filesystem(paths, {
      io: {
        open: async (...args: any[]) => {
          const handle = await (fsOpen as any)(...args);
          if (pauseNextReceiptSync && String(args[0]) === receiptDirectory && args[1] === 'r') {
            pauseNextReceiptSync = false;
            return new Proxy(handle, {
              get(target, property) {
                if (property === 'sync') {
                  return async () => {
                    reached.resolve();
                    await release.promise;
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
    const producer = await store.openWriterLease({ attemptId: 'attempt-race-directory-sync' });
    await producer.admitModeB(3);
    await producer.stageReceipt({
      requestId: 'request-race-directory-sync',
      bytes: Buffer.from('{}\n'),
      validateBytes: () => undefined,
    });
    const commit = producer.commitReceipt({ success: true });
    await reached.promise;
    await expect(store.withVerifierLease(
      {
        receiptRelativePath:
          'receipts/receipt-request-race-directory-sync.attempt-race-directory-sync.json',
        attemptId: 'verify-race-directory-sync',
      },
      async () => undefined,
    )).rejects.toMatchObject({ code: 'E_LOCK_BUSY' });
    release.resolve();
    await expect(commit).resolves.toBe(
      'receipts/receipt-request-race-directory-sync.attempt-race-directory-sync.json',
    );
    await producer.finish();
  });

  it('rejects the rolled-back receipt after a paused visible commit fails', async () => {
    const paths = await makeRepository();
    const reached = deferred();
    const release = deferred();
    const store = filesystem(paths, {
      fault: async (name: string) => {
        if (name === 'after-receipt-link') {
          reached.resolve();
          await release.promise;
          throw new Error('synthetic paused receipt failure');
        }
      },
    });
    const producer = await store.openWriterLease({ attemptId: 'attempt-race-rollback' });
    await producer.admitModeB(3);
    await producer.stageReceipt({
      requestId: 'request-race-rollback',
      bytes: Buffer.from('{}\n'),
      validateBytes: () => undefined,
    });
    const commit = producer.commitReceipt({ success: true });
    await reached.promise;
    await expect(store.withVerifierLease(
      {
        receiptRelativePath: 'receipts/receipt-request-race-rollback.attempt-race-rollback.json',
        attemptId: 'verify-race-visible',
      },
      async () => undefined,
    )).rejects.toMatchObject({ code: 'E_LOCK_BUSY' });
    release.resolve();
    await expect(commit).rejects.toMatchObject({ code: 'E_RECEIPT_IO' });
    await producer.finish();
    await expect(store.withVerifierLease(
      {
        receiptRelativePath: 'receipts/receipt-request-race-rollback.attempt-race-rollback.json',
        attemptId: 'verify-race-rolled-back',
      },
      async () => undefined,
    )).rejects.toMatchObject({ code: 'E_RECEIPT_SCHEMA' });
  });

  it('stays blocked for the whole producer lease and rejects later cache tampering', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const producer = await store.openWriterLease({ attemptId: 'attempt-race' });
    await producer.admitModeB(3);
    await expect(store.withVerifierLease(
      {
        receiptRelativePath: 'receipts/receipt-request-race.attempt-race.json',
        attemptId: 'verify-race',
      },
      async () => undefined,
    )).rejects.toMatchObject({ code: 'E_LOCK_BUSY' });
    await producer.finish();

    const writer = await store.openWriterLease({ attemptId: 'attempt-tamper' });
    await exactPartial(writer);
    await writer.publishVerified(3, digest);
    const bytes = Buffer.from('{}\n');
    await writer.stageReceipt({
      requestId: 'request-tamper',
      bytes,
      validateBytes: () => undefined,
    });
    const receiptRelativePath = await writer.commitReceipt({ success: true });
    await writer.finish();

    const cachePath = resolve(paths.acquisitionRoot, 'verified-transport', `sha256-${digest}.blob`);
    await writeFile(cachePath, 'xyz');
    await expect(store.withVerifierLease(
      { receiptRelativePath, attemptId: 'verify-tamper' },
      async (observation: {
        verifyLocalBinding(input: {
          relativePath: string;
          expectedBytes: number;
          expectedSha256: string;
        }): Promise<void>;
      }) => observation.verifyLocalBinding({
        relativePath: `verified-transport/sha256-${digest}.blob`,
        expectedBytes: 3,
        expectedSha256: digest,
      }),
    )).rejects.toMatchObject({ code: 'E_CACHE_MISMATCH' });
  });

  it('rejects a multiply-linked receipt before opening it as evidence', async () => {
    const paths = await makeRepository();
    const store = filesystem(paths);
    const writer = await store.openWriterLease({ attemptId: 'attempt-multilink' });
    await writer.admitModeB(3);
    await writer.stageReceipt({
      requestId: 'request-multilink',
      bytes: Buffer.from('{}\n'),
      validateBytes: () => undefined,
    });
    const receiptRelativePath = await writer.commitReceipt({ success: true });
    await writer.finish();
    const receiptPath = resolve(paths.acquisitionRoot, ...receiptRelativePath.split('/'));
    await link(receiptPath, resolve(paths.acquisitionRoot, 'receipts', 'synthetic-alias.json'));

    await expect(store.withVerifierLease(
      { receiptRelativePath, attemptId: 'verify-multilink' },
      async () => undefined,
    )).rejects.toMatchObject({ code: 'E_CONTAINMENT' });
  });
});
