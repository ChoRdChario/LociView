import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import {
  ACQUISITION_RELATIVE_ROOT,
  ACQUISITION_ROOT,
  LIMITS,
  REPOSITORY_ROOT,
  TIER_NAMES,
} from './constants.mjs';
import { AcquisitionError, fail } from './errors.mjs';

const LOCK_NAME = 'writer.lock';
const RECEIPT_RESERVATION = BigInt(LIMITS.receiptBytes);
const PORTABLE_ID = /^[a-z0-9][a-z0-9._-]{2,95}(?![\s\S])/u;
const RECEIPT_CLI_PATH =
  /^\.artifacts\/acquisition\/receipts\/receipt-([a-z0-9][a-z0-9._-]{2,95})\.([a-z0-9][a-z0-9._-]{2,95})\.json(?![\s\S])/u;
const RECEIPT_RELATIVE_PATH =
  /^receipts\/receipt-([a-z0-9][a-z0-9._-]{2,95})\.([a-z0-9][a-z0-9._-]{2,95})\.json(?![\s\S])/u;

function createTemporalGate(attemptControl) {
  return {
    attemptControl,
    bypass: false,
    inspections: 0,
    checkpoint() {
      if (!this.bypass && this.inspections === 0) this.attemptControl?.checkpoint();
    },
    async inspect(operation) {
      this.inspections += 1;
      try { return await operation(); }
      finally { this.inspections -= 1; }
    },
  };
}

async function guardedCall(gate, operation) {
  gate.checkpoint();
  let result;
  try {
    result = await operation();
  } catch (error) {
    gate.checkpoint();
    throw error;
  }
  return result;
}

function wrapAsyncResource(resource, gate) {
  return new Proxy(resource, {
    get(target, property) {
      if (property === Symbol.asyncIterator) {
        return () => {
          const iterator = target[Symbol.asyncIterator]();
          return {
            next: () => guardedCall(gate, () => iterator.next()),
            return: iterator.return === undefined
              ? undefined
              : () => iterator.return(),
            throw: iterator.throw === undefined
              ? undefined
              : (error) => guardedCall(gate, () => iterator.throw(error)),
            [Symbol.asyncIterator]() { return this; },
          };
        };
      }
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (property === 'close') return (...args) => value.apply(target, args);
      return (...args) => guardedCall(gate, () => value.apply(target, args));
    },
  });
}

function wrapIo(rawIo, gate) {
  return new Proxy(rawIo, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return async (...args) => {
        const result = await guardedCall(gate, () => value.apply(target, args));
        return property === 'open' || property === 'opendir'
          ? wrapAsyncResource(result, gate)
          : result;
      };
    },
  });
}

function enterSafetyFailure(config) {
  config.gate.bypass = true;
}

function contained(root, target) {
  const fromRoot = relative(root, target);
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function regularSingleLink(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.size >= 0n;
}

function directoryNonLink(stat) {
  return stat.isDirectory() && !stat.isSymbolicLink();
}

function isErrorCode(error, code) {
  return error !== null && typeof error === 'object' && error.code === code;
}

function rethrow(error, fallbackCode) {
  if (error instanceof AcquisitionError) throw error;
  fail(fallbackCode, null, error);
}

async function safeRealpath(io, path, root, code = 'E_CONTAINMENT') {
  let resolved;
  try { resolved = await io.realpath(path); } catch (error) { rethrow(error, code); }
  if (!contained(root, resolved) && resolved !== root) fail(code);
  return resolved;
}

async function lstatBigInt(io, path, code = 'E_CONTAINMENT') {
  try {
    return await io.lstat(path, { bigint: true });
  } catch (error) {
    rethrow(error, code);
  }
}

async function inspectDirectory(io, path, repositoryReal) {
  const stat = await lstatBigInt(io, path);
  if (!directoryNonLink(stat)) fail('E_CONTAINMENT');
  const resolved = await safeRealpath(io, path, repositoryReal);
  if (resolved !== path) fail('E_CONTAINMENT');
  return stat;
}

async function ensureDirectory(config, path, repositoryReal, create) {
  const { io, gate } = config;
  if (create) {
    try {
      await io.mkdir(path, { mode: 0o700 });
    } catch (error) {
      if (error instanceof AcquisitionError) throw error;
      if (!isErrorCode(error, 'EEXIST')) {
        if (isErrorCode(error, 'ENOENT')) fail('E_CONTAINMENT', null, error);
        fail('E_LOCAL_IO', null, error);
      }
    }
  }
  if (create) {
    await gate.inspect(() => inspectDirectory(io, path, repositoryReal));
    await syncDirectory(config, dirname(path));
    gate.checkpoint();
  } else {
    await inspectDirectory(io, path, repositoryReal);
  }
}

async function ensureLayout(config, create) {
  const { io, repositoryRoot, acquisitionRoot } = config;
  let repositoryReal;
  try { repositoryReal = await io.realpath(repositoryRoot); } catch (error) { rethrow(error, 'E_CONTAINMENT'); }
  if (repositoryReal !== repositoryRoot) fail('E_CONTAINMENT');
  const fromRepository = relative(repositoryReal, acquisitionRoot);
  if (
    fromRepository === '' ||
    fromRepository === '..' ||
    fromRepository.startsWith(`..${sep}`) ||
    isAbsolute(fromRepository)
  ) fail('E_CONTAINMENT');

  let cursor = repositoryReal;
  for (const segment of fromRepository.split(sep)) {
    if (segment === '' || segment === '.' || segment === '..') fail('E_CONTAINMENT');
    cursor = resolve(cursor, segment);
    await ensureDirectory(config, cursor, repositoryReal, create);
  }
  if (create) {
    const entries = await boundedEntries(io, acquisitionRoot);
    const names = new Set(entries.map((entry) => entry.name));
    if (names.has(LOCK_NAME)) fail('E_LOCK_BUSY');
    const missingTiers = TIER_NAMES.filter((tier) => !names.has(tier)).length;
    if (entries.length + missingTiers + 1 > LIMITS.directoryEntries) fail('E_NO_SPACE');
  }
  for (const tier of TIER_NAMES) {
    await ensureDirectory(config, resolve(acquisitionRoot, tier), repositoryReal, create);
  }
  return repositoryReal;
}

async function boundedEntries(io, directory) {
  let dir;
  try { dir = await io.opendir(directory); } catch (error) { rethrow(error, 'E_CONTAINMENT'); }
  const entries = [];
  try {
    for await (const entry of dir) {
      if (entries.length >= LIMITS.directoryEntries) fail('E_NO_SPACE');
      entries.push(entry);
    }
  } catch (error) {
    rethrow(error, 'E_LOCAL_IO');
  }
  return entries;
}

async function inspectRegularPath(
  io,
  path,
  acquisitionReal,
  maximumBytes = null,
  code = 'E_CONTAINMENT',
) {
  const stat = await lstatBigInt(io, path, code);
  if (!regularSingleLink(stat)) fail(code);
  if (maximumBytes !== null && stat.size > BigInt(maximumBytes)) fail(code);
  const resolved = await safeRealpath(io, path, acquisitionReal, code);
  if (resolved !== path) fail(code);
  return stat;
}

async function scanInventory(config, repositoryReal, ownedLock = null) {
  const { io, acquisitionRoot } = config;
  const acquisitionReal = await safeRealpath(io, acquisitionRoot, repositoryReal);
  if (acquisitionReal !== acquisitionRoot) fail('E_CONTAINMENT');
  const rootEntries = await boundedEntries(io, acquisitionRoot);
  let rootBytes = 0n;
  const tierCounts = Object.fromEntries(TIER_NAMES.map((tier) => [tier, 0]));
  const seenTiers = new Set();

  for (const entry of rootEntries) {
    const path = resolve(acquisitionRoot, entry.name);
    if (TIER_NAMES.includes(entry.name)) {
      const stat = await lstatBigInt(io, path);
      if (!directoryNonLink(stat)) fail('E_CONTAINMENT');
      const resolved = await safeRealpath(io, path, acquisitionReal);
      if (resolved !== path) fail('E_CONTAINMENT');
      seenTiers.add(entry.name);
      continue;
    }
    if (entry.name === LOCK_NAME) {
      if (ownedLock === null) fail('E_LOCK_BUSY');
      const stat = await lstatBigInt(io, path);
      if (
        !regularSingleLink(stat) ||
        stat.size !== 0n ||
        !sameIdentity(stat, ownedLock)
      ) fail('E_CONTAINMENT');
      continue;
    }
    const stat = await inspectRegularPath(io, path, acquisitionReal);
    rootBytes += stat.size;
  }
  if (seenTiers.size !== TIER_NAMES.length) fail('E_CONTAINMENT');

  for (const tier of TIER_NAMES) {
    const directory = resolve(acquisitionRoot, tier);
    const entries = await boundedEntries(io, directory);
    tierCounts[tier] = entries.length;
    for (const entry of entries) {
      const stat = await inspectRegularPath(io, resolve(directory, entry.name), acquisitionReal);
      rootBytes += stat.size;
    }
  }
  if (rootBytes > LIMITS.rootBytes) fail('E_NO_SPACE');
  return Object.freeze({
    rootBytes,
    rootEntries: rootEntries.length,
    tierCounts: Object.freeze(tierCounts),
  });
}

async function verifyLockIdentity(io, lockPath, handle) {
  let handleStat;
  try { handleStat = await handle.stat({ bigint: true }); } catch (error) { rethrow(error, 'E_CONTAINMENT'); }
  const pathStat = await lstatBigInt(io, lockPath);
  if (
    !regularSingleLink(handleStat) ||
    handleStat.size !== 0n ||
    !regularSingleLink(pathStat) ||
    pathStat.size !== 0n ||
    !sameIdentity(handleStat, pathStat)
  ) fail('E_CONTAINMENT');
  return Object.freeze({ dev: handleStat.dev, ino: handleStat.ino });
}

async function captureEmptyFileIdentity(handle) {
  let stat;
  try { stat = await handle.stat({ bigint: true }); } catch (error) { rethrow(error, 'E_CONTAINMENT'); }
  if (!regularSingleLink(stat) || stat.size !== 0n) fail('E_CONTAINMENT');
  return Object.freeze({ dev: stat.dev, ino: stat.ino });
}

async function syncDirectory(config, directory, code = 'E_LOCAL_IO') {
  const { io, platform } = config;
  let handle;
  try {
    handle = await io.open(directory, 'r');
    const stat = await handle.stat({ bigint: true });
    if (!directoryNonLink(stat)) fail(code);
    try {
      await handle.sync();
    } catch (error) {
      if (!(platform === 'win32' && isErrorCode(error, 'EPERM'))) {
        rethrow(error, code);
      }
    }
  } catch (error) {
    rethrow(error, code);
  } finally {
    if (handle !== undefined) {
      try { await handle.close(); } catch (error) { rethrow(error, code); }
    }
  }
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, null);
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) {
      throw new Error('short local write');
    }
    offset += bytesWritten;
  }
}

async function readHandleBounded(handle, maximumBytes) {
  const chunks = [];
  let total = 0;
  const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, maximumBytes + 1));
  let position = 0;
  while (total <= maximumBytes) {
    const remaining = maximumBytes + 1 - total;
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.byteLength, remaining), position);
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    total += bytesRead;
    position += bytesRead;
  }
  if (total > maximumBytes) throw new Error('local file exceeds byte limit');
  return Buffer.concat(chunks, total);
}

async function openObservedFile(config, path, maximumBytes, expectedCode = 'E_CONTAINMENT') {
  const { io, acquisitionRoot } = config;
  const before = await inspectRegularPath(io, path, acquisitionRoot, maximumBytes, expectedCode);
  let handle;
  try {
    handle = await io.open(path, 'r');
    const opened = await handle.stat({ bigint: true });
    if (!regularSingleLink(opened) || !sameIdentity(before, opened)) fail(expectedCode);
    const bytes = await readHandleBounded(handle, maximumBytes);
    const after = await handle.stat({ bigint: true });
    const afterPath = await lstatBigInt(io, path, expectedCode);
    if (
      !regularSingleLink(after) ||
      !regularSingleLink(afterPath) ||
      !sameIdentity(opened, after) ||
      !sameIdentity(opened, afterPath) ||
      after.size !== BigInt(bytes.byteLength)
    ) fail(expectedCode);
    return {
      handle,
      path,
      identity: Object.freeze({ dev: opened.dev, ino: opened.ino }),
      size: opened.size,
      bytes,
    };
  } catch (error) {
    if (handle !== undefined) {
      try { await handle.close(); } catch { /* original fixed code remains */ }
    }
    rethrow(error, expectedCode);
  }
}

async function revalidateObservation(config, observation, code = 'E_CONTAINMENT') {
  const { io } = config;
  try {
    const handleStat = await observation.handle.stat({ bigint: true });
    const pathStat = await io.lstat(observation.path, { bigint: true });
    if (
      !regularSingleLink(handleStat) ||
      !regularSingleLink(pathStat) ||
      !sameIdentity(observation.identity, handleStat) ||
      !sameIdentity(observation.identity, pathStat) ||
      handleStat.size !== observation.size
    ) fail(code);
  } catch (error) {
    rethrow(error, code);
  }
}

async function hashObservedFile(config, path, maximumBytes, expectedBytes, expectedSha256) {
  const { io, acquisitionRoot } = config;
  const before = await inspectRegularPath(
    io,
    path,
    acquisitionRoot,
    maximumBytes,
    'E_CACHE_MISMATCH',
  );
  let handle;
  try {
    handle = await io.open(path, 'r');
    const opened = await handle.stat({ bigint: true });
    if (!regularSingleLink(opened) || !sameIdentity(before, opened)) fail('E_CACHE_MISMATCH');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    let position = 0;
    while (total <= maximumBytes) {
      const remaining = maximumBytes + 1 - total;
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.byteLength, remaining),
        position,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      total += bytesRead;
      position += bytesRead;
    }
    if (total > maximumBytes || total !== expectedBytes || hash.digest('hex') !== expectedSha256) {
      fail('E_CACHE_MISMATCH');
    }
    const after = await handle.stat({ bigint: true });
    const afterPath = await lstatBigInt(io, path, 'E_CACHE_MISMATCH');
    if (
      !regularSingleLink(after) ||
      !regularSingleLink(afterPath) ||
      !sameIdentity(opened, after) ||
      !sameIdentity(opened, afterPath) ||
      after.size !== BigInt(total)
    ) fail('E_CACHE_MISMATCH');
    return {
      handle,
      path,
      identity: Object.freeze({ dev: opened.dev, ino: opened.ino }),
      size: opened.size,
    };
  } catch (error) {
    if (handle !== undefined) {
      try { await handle.close(); } catch { /* mismatch remains primary */ }
    }
    rethrow(error, 'E_CACHE_MISMATCH');
  }
}

async function removeOwnedPathState(config, path, identity, directory) {
  return config.gate.inspect(async () => {
    const { io } = config;
    let stat;
    try { stat = await io.lstat(path, { bigint: true }); } catch (error) {
      return isErrorCode(error, 'ENOENT') ? 'absent' : 'indeterminate';
    }
    if (!sameIdentity(stat, identity)) return 'foreign-unchanged';
    try {
      await io.unlink(path);
      await syncDirectory(config, directory);
      try {
        await io.lstat(path, { bigint: true });
        return 'indeterminate';
      } catch (error) {
        return isErrorCode(error, 'ENOENT') ? 'owned-removed' : 'indeterminate';
      }
    } catch {
      return 'indeterminate';
    }
  });
}

async function synchronizeAbsentPath(config, path, directory) {
  return config.gate.inspect(async () => {
    try {
      await syncDirectory(config, directory);
      try {
        await config.io.lstat(path, { bigint: true });
        return false;
      } catch (error) {
        return isErrorCode(error, 'ENOENT');
      }
    } catch {
      return false;
    }
  });
}

async function removeOwnedPath(config, path, identity, directory) {
  const state = await removeOwnedPathState(config, path, identity, directory);
  config.gate.checkpoint();
  return state === 'absent' || state === 'owned-removed';
}

async function inspectReceiptLinkState(config, receipt) {
  return config.gate.inspect(async () => {
    const { io, acquisitionRoot } = config;
    let final;
    try {
      final = await io.lstat(receipt.finalPath, { bigint: true });
    } catch (error) {
      return isErrorCode(error, 'ENOENT') ? 'absent' : 'indeterminate';
    }

    if (!sameIdentity(final, receipt.identity)) {
      if (!regularSingleLink(final) || final.size > BigInt(LIMITS.receiptBytes)) {
        return 'indeterminate';
      }
      try {
        const resolved = await io.realpath(receipt.finalPath);
        return resolved === receipt.finalPath && contained(acquisitionRoot, resolved)
          ? 'foreign-safe'
          : 'indeterminate';
      } catch {
        return 'indeterminate';
      }
    }

    let stage;
    let stageReal;
    let finalReal;
    try {
      stage = await io.lstat(receipt.stagePath, { bigint: true });
      stageReal = await io.realpath(receipt.stagePath);
      finalReal = await io.realpath(receipt.finalPath);
    } catch {
      return 'indeterminate';
    }
    if (
      !stage.isFile() ||
      stage.isSymbolicLink() ||
      !final.isFile() ||
      final.isSymbolicLink() ||
      stage.nlink !== 2n ||
      final.nlink !== 2n ||
      !sameIdentity(stage, final) ||
      !sameIdentity(stage, receipt.identity) ||
      stage.size !== receipt.size ||
      final.size !== receipt.size ||
      stageReal !== receipt.stagePath ||
      finalReal !== receipt.finalPath ||
      !contained(acquisitionRoot, stageReal) ||
      !contained(acquisitionRoot, finalReal)
    ) return 'indeterminate';
    return 'owned-pair';
  });
}

class WriterLease {
  #config;
  #repositoryReal;
  #lockHandle;
  #lockIdentity;
  #inventory;
  #attemptId;
  #partial = null;
  #cache = null;
  #receipt = null;
  #receiptReserved = false;
  #retainLock = false;
  #committed = false;
  #finished = false;

  constructor(config, repositoryReal, lockHandle, lockIdentity, inventory, attemptId) {
    this.#config = config;
    this.#repositoryReal = repositoryReal;
    this.#lockHandle = lockHandle;
    this.#lockIdentity = lockIdentity;
    this.#inventory = inventory;
    this.#attemptId = attemptId;
  }

  get inventory() {
    return this.#inventory;
  }

  get cacheDisposition() {
    return this.#cache?.disposition ?? null;
  }

  get cacheRelativePath() {
    return this.#cache?.relativePath ?? null;
  }

  get receiptReserved() {
    return this.#receiptReserved;
  }

  retainLock() {
    this.#retainLock = true;
  }

  beginFailureWork() {
    enterSafetyFailure(this.#config);
  }

  async #fault(name) {
    await this.#config.fault(name);
  }

  reserveReceiptCapacity() {
    if (
      this.#inventory.rootBytes + RECEIPT_RESERVATION > LIMITS.rootBytes ||
      this.#inventory.tierCounts.receipts + 2 > LIMITS.directoryEntries
    ) fail('E_NO_SPACE');
    this.#receiptReserved = true;
  }

  async admitModeB(expectedBytes) {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > LIMITS.bodyBytes) {
      fail('E_SCHEMA');
    }
    this.reserveReceiptCapacity();
    const expected = BigInt(expectedBytes);
    if (
      this.#inventory.rootBytes + expected + RECEIPT_RESERVATION > LIMITS.rootBytes ||
      this.#inventory.tierCounts.partial + 1 > LIMITS.directoryEntries ||
      this.#inventory.tierCounts['verified-transport'] + 1 > LIMITS.directoryEntries ||
      this.#inventory.tierCounts.receipts + 2 > LIMITS.directoryEntries
    ) fail('E_NO_SPACE');
    let available;
    try {
      const stats = await this.#config.io.statfs(this.#config.acquisitionRoot, { bigint: true });
      available = stats.bavail * stats.bsize;
    } catch (error) {
      rethrow(error, 'E_LOCAL_IO');
    }
    await this.#fault('after-statfs');
    if (available < expected + RECEIPT_RESERVATION + LIMITS.freeHeadroomBytes) {
      fail('E_NO_SPACE');
    }
    return Object.freeze({ expectedBytes });
  }

  async createPartial(expectedBytes) {
    if (this.#partial !== null) fail('E_PUBLISH_CONFLICT');
    const path = resolve(this.#config.acquisitionRoot, 'partial', `${this.#attemptId}.body.partial`);
    let handle;
    try {
      handle = await this.#config.io.open(path, 'wx+', 0o600);
      const identity = await this.#config.gate.inspect(
        () => captureEmptyFileIdentity(handle),
      );
      this.#partial = {
        path,
        relativePath: `partial/${this.#attemptId}.body.partial`,
        directory: resolve(this.#config.acquisitionRoot, 'partial'),
        handle,
        identity,
        expectedBytes,
        persistedBytes: 0,
        measuredBytes: 0,
        hash: createHash('sha256'),
        sealed: false,
        sourceUnlinked: false,
        sourceDirectoryDurable: false,
      };
      const verifiedIdentity = await this.#config.gate.inspect(
        () => verifyLockIdentity(this.#config.io, path, handle),
      );
      if (!sameIdentity(identity, verifiedIdentity)) fail('E_CONTAINMENT');
      await this.#fault('after-partial-wx');
      return this.#partial.relativePath;
    } catch (error) {
      enterSafetyFailure(this.#config);
      if (handle !== undefined && this.#partial === null) {
        this.#retainLock = true;
        try { await handle.close(); } catch { /* primary error remains */ }
      }
      rethrow(error, isErrorCode(error, 'EEXIST') ? 'E_PUBLISH_CONFLICT' : 'E_LOCAL_IO');
    }
  }

  async appendPartial(chunk) {
    const partial = this.#partial;
    if (
      partial === null ||
      partial.sealed ||
      !(chunk instanceof Uint8Array)
    ) fail('E_LOCAL_IO');
    if (chunk.byteLength === 0) {
      return Object.freeze({ measuredBytes: partial.measuredBytes, extra: false });
    }
    const observationRemaining = partial.expectedBytes + 1 - partial.measuredBytes;
    const observedLength = Math.max(0, Math.min(chunk.byteLength, observationRemaining));
    const persistenceRemaining = partial.expectedBytes - partial.persistedBytes;
    const persistedLength = Math.max(0, Math.min(observedLength, persistenceRemaining));
    if (persistedLength > 0) {
      const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, persistedLength);
      try {
        await writeAll(partial.handle, bytes);
        partial.hash.update(bytes);
      } catch (error) {
        rethrow(error, 'E_LOCAL_IO');
      }
      partial.persistedBytes += persistedLength;
    }
    partial.measuredBytes += observedLength;
    await this.#fault('after-partial-write');
    return Object.freeze({
      measuredBytes: partial.measuredBytes,
      extra: partial.measuredBytes > partial.expectedBytes,
    });
  }

  async completeBody() {
    const partial = this.#partial;
    if (partial === null || partial.sealed) fail('E_LOCAL_IO');
    const measuredSha256 = partial.hash.digest('hex');
    if (partial.measuredBytes !== partial.expectedBytes) {
      return Object.freeze({ measuredBytes: partial.measuredBytes, measuredSha256, sealed: false });
    }
    try {
      await partial.handle.sync();
      await this.#fault('after-partial-sync');
      const handleStat = await partial.handle.stat({ bigint: true });
      if (
        !regularSingleLink(handleStat) ||
        !sameIdentity(handleStat, partial.identity) ||
        handleStat.size !== BigInt(partial.expectedBytes)
      ) fail('E_CONTAINMENT');
      await partial.handle.close();
      partial.handle = null;
      const pathStat = await lstatBigInt(this.#config.io, partial.path);
      if (
        !regularSingleLink(pathStat) ||
        !sameIdentity(pathStat, partial.identity) ||
        pathStat.size !== BigInt(partial.expectedBytes)
      ) fail('E_CONTAINMENT');
      partial.sealed = true;
      partial.measuredSha256 = measuredSha256;
      await this.#fault('after-partial-close');
      return Object.freeze({ measuredBytes: partial.measuredBytes, measuredSha256, sealed: true });
    } catch (error) {
      enterSafetyFailure(this.#config);
      rethrow(error, 'E_LOCAL_IO');
    }
  }

  async cleanupPartial() {
    const partial = this.#partial;
    if (partial === null) return false;
    if (partial.handle !== null) {
      try { await partial.handle.close(); } catch { /* removal result controls disposition */ }
      partial.handle = null;
    }
    let removed;
    if (partial.sourceUnlinked) {
      removed = partial.sourceDirectoryDurable || await synchronizeAbsentPath(
        this.#config,
        partial.path,
        partial.directory,
      );
      if (removed) partial.sourceDirectoryDurable = true;
    } else {
      removed = await removeOwnedPath(
        this.#config,
        partial.path,
        partial.identity,
        partial.directory,
      );
    }
    if (!removed) this.#retainLock = true;
    if (removed) this.#partial = null;
    return removed;
  }

  async publishVerified(expectedBytes, expectedSha256) {
    const partial = this.#partial;
    if (
      partial === null ||
      !partial.sealed ||
      partial.measuredSha256 !== expectedSha256 ||
      partial.expectedBytes !== expectedBytes
    ) fail('E_DIGEST_MISMATCH');
    const relativePath = `verified-transport/sha256-${expectedSha256}.blob`;
    const cacheDirectory = resolve(this.#config.acquisitionRoot, 'verified-transport');
    const destination = resolve(this.#config.acquisitionRoot, ...relativePath.split('/'));
    let linkedIdentity;
    try {
      this.#config.gate.checkpoint();
      await this.#config.gate.inspect(
        () => this.#config.io.link(partial.path, destination),
      );
      linkedIdentity = partial.identity;
      await this.#fault('after-cache-link');
    } catch (error) {
      if (!isErrorCode(error, 'EEXIST')) {
        const state = await removeOwnedPathState(
          this.#config,
          destination,
          partial.identity,
          cacheDirectory,
        );
        if (state === 'foreign-unchanged' || state === 'indeterminate') {
          this.#retainLock = true;
        }
        this.#config.gate.checkpoint();
        rethrow(error, 'E_LINK');
      }
      this.#config.gate.checkpoint();
      const observation = await hashObservedFile(
        this.#config,
        destination,
        expectedBytes,
        expectedBytes,
        expectedSha256,
      );
      try {
        await observation.handle.close();
      } catch (closeError) {
        this.#config.gate.checkpoint();
        rethrow(closeError, 'E_LOCAL_IO');
      }
      this.#config.gate.checkpoint();
      const removed = await this.cleanupPartial();
      if (!removed) fail('E_LOCAL_IO');
      this.#cache = Object.freeze({ disposition: 'cache-reused', relativePath, created: false });
      return this.#cache;
    }
    try {
      const source = await lstatBigInt(this.#config.io, partial.path);
      const target = await lstatBigInt(this.#config.io, destination);
      if (
        !source.isFile() ||
        !target.isFile() ||
        source.nlink !== 2n ||
        target.nlink !== 2n ||
        !sameIdentity(source, target) ||
        !sameIdentity(source, partial.identity)
      ) fail('E_LINK');
      linkedIdentity = Object.freeze({ dev: source.dev, ino: source.ino });
      await this.#config.io.unlink(partial.path);
      partial.sourceUnlinked = true;
      await this.#fault('after-cache-source-unlink');
      const finalStat = await inspectRegularPath(
        this.#config.io,
        destination,
        this.#config.acquisitionRoot,
        expectedBytes,
      );
      if (
        !sameIdentity(finalStat, linkedIdentity) ||
        finalStat.size !== BigInt(expectedBytes)
      ) fail('E_LINK');
      await this.#fault('before-cache-directory-sync');
      await syncDirectory(this.#config, partial.directory);
      partial.sourceDirectoryDurable = true;
      if (partial.directory !== cacheDirectory) await syncDirectory(this.#config, cacheDirectory);
      await this.#fault('after-cache-directory-sync');
      this.#partial = null;
      this.#cache = Object.freeze({ disposition: 'verified-published', relativePath, created: true });
      return this.#cache;
    } catch (error) {
      enterSafetyFailure(this.#config);
      if (linkedIdentity !== undefined) {
        const removed = await removeOwnedPath(this.#config, destination, linkedIdentity, cacheDirectory);
        if (!removed) this.#retainLock = true;
      } else {
        this.#retainLock = true;
      }
      rethrow(error, 'E_LINK');
    }
  }

  async stageReceipt({ requestId, bytes, validateBytes }) {
    if (
      this.#receipt !== null ||
      !this.#receiptReserved ||
      !PORTABLE_ID.test(requestId) ||
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength > LIMITS.receiptBytes ||
      typeof validateBytes !== 'function'
    ) fail('E_RECEIPT_SCHEMA');
    validateBytes(bytes);
    const directory = resolve(this.#config.acquisitionRoot, 'receipts');
    const stagePath = resolve(directory, `receipt-${requestId}.${this.#attemptId}.stage.json`);
    const finalPath = resolve(directory, `receipt-${requestId}.${this.#attemptId}.json`);
    let handle;
    try {
      handle = await this.#config.io.open(stagePath, 'wx+', 0o600);
      const identity = await this.#config.gate.inspect(
        () => verifyLockIdentity(this.#config.io, stagePath, handle),
      );
      this.#receipt = {
        requestId,
        directory,
        stagePath,
        finalPath,
        relativePath: `receipts/receipt-${requestId}.${this.#attemptId}.json`,
        handle,
        identity,
        size: BigInt(bytes.byteLength),
        linked: false,
        committed: false,
      };
      await this.#fault('after-receipt-wx');
      await writeAll(handle, bytes);
      await this.#fault('after-receipt-write');
      await handle.sync();
      await this.#fault('after-receipt-sync');
      const reread = await readHandleBounded(handle, LIMITS.receiptBytes);
      if (!Buffer.from(bytes).equals(reread)) fail('E_RECEIPT_IO');
      validateBytes(reread);
      const stat = await handle.stat({ bigint: true });
      if (
        !regularSingleLink(stat) ||
        !sameIdentity(stat, identity) ||
        stat.size !== BigInt(bytes.byteLength)
      ) fail('E_RECEIPT_IO');
      await this.#fault('after-receipt-reread');
      await handle.close();
      this.#receipt.handle = null;
      return this.#receipt.relativePath;
    } catch (error) {
      enterSafetyFailure(this.#config);
      if (handle !== undefined && this.#receipt?.handle !== null) {
        try { await handle.close(); } catch { /* original receipt failure remains */ }
      }
      if (this.#receipt !== null) {
        const removed = await removeOwnedPath(this.#config, stagePath, this.#receipt.identity, directory);
        if (!removed) this.#retainLock = true;
        this.#receipt = null;
      }
      rethrow(error, isErrorCode(error, 'EEXIST') ? 'E_PUBLISH_CONFLICT' : 'E_RECEIPT_IO');
    }
  }

  async #rollbackVisibleReceipt() {
    const receipt = this.#receipt;
    if (receipt === null) return true;
    const removedFinal = await removeOwnedPath(
      this.#config,
      receipt.finalPath,
      receipt.identity,
      receipt.directory,
    );
    if (!removedFinal) {
      this.#retainLock = true;
      return false;
    }
    const removedStage = await removeOwnedPath(
      this.#config,
      receipt.stagePath,
      receipt.identity,
      receipt.directory,
    );
    if (!removedStage) {
      this.#retainLock = true;
      return false;
    }
    return true;
  }

  async prepareFailureReceipt() {
    const receipt = this.#receipt;
    if (this.#retainLock) return false;
    if (receipt === null) return true;
    if (receipt.committed || this.#committed) return false;
    enterSafetyFailure(this.#config);
    let removed;
    if (receipt.linked) {
      removed = await this.#rollbackVisibleReceipt();
    } else {
      removed = await removeOwnedPath(
        this.#config,
        receipt.stagePath,
        receipt.identity,
        receipt.directory,
      );
    }
    if (removed) {
      this.#receipt = null;
      return true;
    }
    this.#retainLock = true;
    return false;
  }

  async commitReceipt({ success }) {
    const receipt = this.#receipt;
    if (receipt === null || receipt.handle !== null || receipt.committed) fail('E_RECEIPT_IO');
    try {
      try {
        await this.#config.io.link(receipt.stagePath, receipt.finalPath);
        receipt.linked = true;
      } catch (error) {
        const state = await inspectReceiptLinkState(this.#config, receipt);
        if (state === 'owned-pair') {
          receipt.linked = true;
        } else {
          if (state === 'indeterminate' || (state === 'foreign-safe' && !isErrorCode(error, 'EEXIST'))) {
            this.#retainLock = true;
          }
          throw error;
        }
      }
      await this.#fault('after-receipt-link');
      const stage = await lstatBigInt(this.#config.io, receipt.stagePath, 'E_RECEIPT_IO');
      const final = await lstatBigInt(this.#config.io, receipt.finalPath, 'E_RECEIPT_IO');
      if (
        stage.nlink !== 2n ||
        final.nlink !== 2n ||
        !sameIdentity(stage, final) ||
        !sameIdentity(stage, receipt.identity)
      ) fail('E_RECEIPT_IO');
      await this.#config.io.unlink(receipt.stagePath);
      await this.#fault('after-receipt-source-unlink');
      const finalSingle = await inspectRegularPath(
        this.#config.io,
        receipt.finalPath,
        this.#config.acquisitionRoot,
        LIMITS.receiptBytes,
        'E_RECEIPT_IO',
      );
      if (!sameIdentity(finalSingle, receipt.identity)) fail('E_RECEIPT_IO');
      await this.#fault('before-receipt-directory-sync');
      await syncDirectory(this.#config, receipt.directory, 'E_RECEIPT_IO');
      await this.#fault('after-receipt-directory-sync');
      const durable = await inspectRegularPath(
        this.#config.io,
        receipt.finalPath,
        this.#config.acquisitionRoot,
        LIMITS.receiptBytes,
        'E_RECEIPT_IO',
      );
      if (!sameIdentity(durable, receipt.identity)) fail('E_RECEIPT_IO');
      receipt.committed = true;
      this.#committed = Boolean(success);
      return receipt.relativePath;
    } catch (error) {
      enterSafetyFailure(this.#config);
      let removed;
      if (this.#retainLock) {
        removed = false;
      } else if (receipt.linked) {
        removed = await this.#rollbackVisibleReceipt();
      } else {
        removed = await removeOwnedPath(
          this.#config,
          receipt.stagePath,
          receipt.identity,
          receipt.directory,
        );
        if (!removed) this.#retainLock = true;
      }
      if (removed) this.#receipt = null;
      rethrow(error, isErrorCode(error, 'EEXIST') ? 'E_PUBLISH_CONFLICT' : 'E_RECEIPT_IO');
    }
  }

  async finish() {
    if (this.#finished) return Object.freeze({ committed: this.#committed, lockRetained: this.#retainLock });
    this.#finished = true;
    if (this.#partial !== null && !this.#retainLock) {
      await this.cleanupPartial();
    } else if (this.#partial !== null && this.#partial.handle !== null) {
      try { await this.#partial.handle.close(); } catch { this.#retainLock = true; }
      this.#partial.handle = null;
    }
    if (this.#receipt !== null && !this.#receipt.committed && !this.#retainLock) {
      await this.prepareFailureReceipt();
    }
    if (this.#lockHandle !== null) {
      try { await this.#lockHandle.close(); } catch { this.#retainLock = true; }
      this.#lockHandle = null;
    }
    if (!this.#retainLock) {
      const lockPath = resolve(this.#config.acquisitionRoot, LOCK_NAME);
      try { await this.#fault('before-lock-unlink'); } catch { this.#retainLock = true; }
      if (this.#retainLock) {
        return Object.freeze({ committed: this.#committed, lockRetained: true });
      }
      const removed = await removeOwnedPath(
        this.#config,
        lockPath,
        this.#lockIdentity,
        this.#config.acquisitionRoot,
      );
      if (!removed) this.#retainLock = true;
      else {
        try { await this.#fault('after-lock-unlink'); } catch { /* lock is already absent */ }
      }
    }
    return Object.freeze({ committed: this.#committed, lockRetained: this.#retainLock });
  }
}

async function openLease(config, attemptId, createLayout) {
  if (!PORTABLE_ID.test(attemptId)) fail('E_USAGE');
  const repositoryReal = await ensureLayout(config, createLayout);
  const prelock = await scanInventory(config, repositoryReal);
  if (prelock.rootEntries + 1 > LIMITS.directoryEntries) fail('E_NO_SPACE');
  const lockPath = resolve(config.acquisitionRoot, LOCK_NAME);
  let lockHandle;
  try {
    lockHandle = await config.io.open(lockPath, 'wx+', 0o600);
  } catch (error) {
    if (error instanceof AcquisitionError) throw error;
    if (isErrorCode(error, 'EEXIST')) fail('E_LOCK_BUSY');
    fail('E_LOCAL_IO', null, error);
  }
  let lockIdentity;
  try {
    lockIdentity = await config.gate.inspect(
      () => verifyLockIdentity(config.io, lockPath, lockHandle),
    );
    await config.fault('after-lock-wx');
    try { await lockHandle.sync(); } catch (error) { rethrow(error, 'E_LOCAL_IO'); }
    await config.fault('after-lock-file-sync');
    await syncDirectory(config, config.acquisitionRoot);
    await config.fault('after-lock-directory-sync');
    const durableLockIdentity = await config.gate.inspect(
      () => verifyLockIdentity(config.io, lockPath, lockHandle),
    );
    if (!sameIdentity(lockIdentity, durableLockIdentity)) fail('E_CONTAINMENT');
    await config.fault('after-lock-reread');
    const inventory = await scanInventory(config, repositoryReal, lockIdentity);
    await config.fault('after-locked-scan');
    return new WriterLease(config, repositoryReal, lockHandle, lockIdentity, inventory, attemptId);
  } catch (error) {
    enterSafetyFailure(config);
    try { await lockHandle.close(); } catch { /* acquisition error remains */ }
    const removed = lockIdentity === undefined
      ? false
      : await removeOwnedPath(config, lockPath, lockIdentity, config.acquisitionRoot);
    if (!removed && lockIdentity !== undefined) {
      // The unsafe lock remains fail-closed for later invocations.
    }
    rethrow(error, 'E_CONTAINMENT');
  }
}

function createFilesystem(config) {
  const gate = createTemporalGate(config.attemptControl);
  const rawIo = { ...fs, ...(config.io ?? {}) };
  const rawFault = config.fault ?? (async () => {});
  const frozen = Object.freeze({
    repositoryRoot: resolve(config.repositoryRoot),
    acquisitionRoot: resolve(config.acquisitionRoot),
    io: wrapIo(rawIo, gate),
    fault: async (name) => {
      await guardedCall(gate, () => rawFault(name));
      gate.checkpoint();
    },
    platform: config.platform ?? process.platform,
    gate,
  });
  return Object.freeze({
    openWriterLease({ attemptId }) {
      return openLease(frozen, attemptId, true);
    },
    async withVerifierLease({ receiptRelativePath, attemptId }, callback) {
      if (
        !RECEIPT_RELATIVE_PATH.test(receiptRelativePath) ||
        typeof callback !== 'function'
      ) fail('E_USAGE');
      const lease = await openLease(frozen, attemptId, false);
      const observations = [];
      let primary;
      try {
        const receiptPath = resolve(
          frozen.acquisitionRoot,
          ...receiptRelativePath.split('/'),
        );
        const receipt = await openObservedFile(
          frozen,
          receiptPath,
          LIMITS.receiptBytes,
          'E_RECEIPT_SCHEMA',
        );
        observations.push(receipt);
        const result = await callback(Object.freeze({
          bytes: receipt.bytes,
          async verifyLocalBinding({ relativePath, expectedBytes, expectedSha256 }) {
            if (
              relativePath !== `verified-transport/sha256-${expectedSha256}.blob` ||
              !Number.isSafeInteger(expectedBytes) ||
              expectedBytes < 1 ||
              expectedBytes > LIMITS.bodyBytes
            ) fail('E_RECEIPT_SCHEMA');
            const path = resolve(frozen.acquisitionRoot, ...relativePath.split('/'));
            const observed = await hashObservedFile(
              frozen,
              path,
              expectedBytes,
              expectedBytes,
              expectedSha256,
            );
            observations.push(observed);
          },
          async verifyPartialAbsent({ attemptId: receiptAttemptId }) {
            if (!PORTABLE_ID.test(receiptAttemptId)) fail('E_RECEIPT_SCHEMA');
            const path = resolve(
              frozen.acquisitionRoot,
              'partial',
              `${receiptAttemptId}.body.partial`,
            );
            try {
              await frozen.io.lstat(path, { bigint: true });
            } catch (error) {
              if (isErrorCode(error, 'ENOENT')) return;
              rethrow(error, 'E_RECEIPT_SCHEMA');
            }
            fail('E_RECEIPT_SCHEMA');
          },
        }));
        for (const observation of observations) {
          await revalidateObservation(frozen, observation, 'E_RECEIPT_SCHEMA');
        }
        return result;
      } catch (error) {
        primary = error;
        throw error;
      } finally {
        for (const observation of observations.reverse()) {
          try { await observation.handle.close(); } catch { /* verifier verdict remains primary */ }
        }
        try {
          await lease.finish();
        } catch (error) {
          if (primary === undefined) throw error;
        }
      }
    },
  });
}

export function normalizeReceiptCliPath(value) {
  if (typeof value !== 'string') fail('E_USAGE');
  const normalized = value.replaceAll('\\', '/');
  const match = RECEIPT_CLI_PATH.exec(normalized);
  if (match === null || match[0] !== value || normalized !== value) fail('E_USAGE');
  return `receipts/receipt-${match[1]}.${match[2]}.json`;
}

export function createProductionFilesystem({ attemptControl } = {}) {
  return createFilesystem({
    repositoryRoot: REPOSITORY_ROOT,
    acquisitionRoot: ACQUISITION_ROOT,
    attemptControl,
  });
}

export function createTestFilesystem({
  repositoryRoot,
  acquisitionRoot = resolve(repositoryRoot, ...ACQUISITION_RELATIVE_ROOT.split('/')),
  io,
  fault,
  platform,
  attemptControl,
}) {
  return createFilesystem({
    repositoryRoot,
    acquisitionRoot,
    io,
    fault,
    platform,
    attemptControl,
  });
}
