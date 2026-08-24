import { createHash } from 'node:crypto';
import { createProductionAttemptControl } from './attempt.mjs';
import {
  loadTrustedModeBDescriptor,
  modeBReceiptIdentity,
  parseModeBReceiptBytes,
  validateModeBReceiptObject,
} from './contracts.mjs';
import { AcquisitionError, publicError } from './errors.mjs';
import { createProductionFilesystem } from './filesystem.mjs';
import { createAttemptId } from './ids.mjs';
import { encodeBoundedJson } from './json.mjs';
import { openModeBResponse } from './transport.mjs';
import {
  createModeBTransportForTest,
  ModeBTransportError,
} from './transport-core.mjs';
import { LIMITS } from './constants.mjs';

const NO_RECEIPT_CODES = new Set(['E_USAGE', 'E_DESCRIPTOR', 'E_SCHEMA', 'E_LOCK_BUSY']);

function utcNow(clock) {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
    throw new AcquisitionError('E_LOCAL_IO');
  }
  return value.toISOString();
}

function defaultTransportFacts(sourceIdentity = null) {
  return {
    redirectOrigins: [],
    redirectCount: 0,
    finalOrigin: null,
    status: null,
    declaredBytes: null,
    measuredBytes: 0,
    measuredSha256: null,
    streamEnded: false,
    expectedMatch: null,
    sourceIdentity,
  };
}

function applyHead(facts, head) {
  if (head === null || typeof head !== 'object') return;
  facts.sourceIdentity = head.sourceIdentity;
  facts.redirectOrigins = [...head.redirectOrigins];
  facts.redirectCount = head.redirectCount;
  facts.finalOrigin = head.finalOrigin;
  facts.status = head.status;
  facts.declaredBytes = head.declaredBytes;
}

function buildReceipt({
  descriptorContext,
  attemptId,
  startedAtUtc,
  completedAtUtc,
  outcome,
  error,
  facts,
  local,
}) {
  const identity = modeBReceiptIdentity();
  return {
    $schema: identity.schemaPath,
    schemaVersion: identity.schemaVersion,
    mode: identity.mode,
    trustTier: identity.trustTier,
    requestId: descriptorContext.value.requestId,
    attemptId,
    descriptor: {
      path: descriptorContext.path,
      sha256: descriptorContext.sha256,
    },
    startedAtUtc,
    completedAtUtc,
    outcome,
    error,
    sourceIdentity: facts.sourceIdentity,
    transport: {
      redirectOrigins: [...facts.redirectOrigins],
      redirectCount: facts.redirectCount,
      finalOrigin: facts.finalOrigin,
      status: facts.status,
      declaredBytes: facts.declaredBytes,
      measuredBytes: facts.measuredBytes,
      measuredSha256: facts.measuredSha256,
      streamEnded: facts.streamEnded,
      expectedMatch: facts.expectedMatch,
    },
    local: { ...local },
    stableTransportIdentity:
      facts.sourceIdentity === descriptorContext.value.locator,
    stableFixtureIdentity: false,
    registryAdopted: false,
    g0Credit: false,
    rendererOrProfileRatified: false,
    deviceEvidence: false,
  };
}

async function publishReceipt({
  lease,
  descriptorContext,
  receipt,
  success,
}) {
  validateModeBReceiptObject(receipt, descriptorContext);
  const bytes = encodeBoundedJson(receipt, LIMITS.receiptBytes);
  await lease.stageReceipt({
    requestId: descriptorContext.value.requestId,
    bytes,
    validateBytes: (candidate) => parseModeBReceiptBytes(candidate, descriptorContext),
  });
  return lease.commitReceipt({ success });
}

async function runModeBRestore({
  descriptorPath,
  repositoryRoot,
  attempt,
  filesystem,
  transport,
  attemptId,
  clock,
}) {
  const startedAtUtc = utcNow(clock);
  let descriptorContext = null;
  let lease = null;
  let opened = null;
  let partialCreated = false;
  let cache = null;
  let result;
  let facts = defaultTransportFacts();

  try {
    descriptorContext = await loadTrustedModeBDescriptor(descriptorPath, repositoryRoot, attempt);
    facts = defaultTransportFacts();
    lease = await filesystem.openWriterLease({ attemptId });
    await lease.admitModeB(descriptorContext.value.expectedBytes);
    partialCreated = true;
    await lease.createPartial(descriptorContext.value.expectedBytes);

    opened = await transport.openModeBResponse({
      locator: descriptorContext.value.locator,
      expectedBytes: descriptorContext.value.expectedBytes,
      attempt,
    });
    applyHead(facts, opened.head);

    const measuredHash = createHash('sha256');
    for await (const chunk of opened.body) {
      const before = facts.measuredBytes;
      const observed = Math.max(
        0,
        Math.min(
          chunk.byteLength,
          descriptorContext.value.expectedBytes + 1 - before,
        ),
      );
      const persisted = Math.max(
        0,
        Math.min(observed, descriptorContext.value.expectedBytes - before),
      );
      if (persisted > 0) {
        measuredHash.update(
          Buffer.from(chunk.buffer, chunk.byteOffset, persisted),
        );
      }
      facts.measuredBytes += observed;
      const observation = await lease.appendPartial(chunk);
      if (observation.measuredBytes !== facts.measuredBytes) {
        throw attempt.fix(new AcquisitionError('E_LOCAL_IO'));
      }
      if (observation.extra) {
        opened.abort();
        throw attempt.fix(new AcquisitionError('E_EXTRA_BYTES'));
      }
    }

    facts.streamEnded = true;
    facts.measuredSha256 = measuredHash.digest('hex');
    facts.expectedMatch = (
      facts.measuredBytes === descriptorContext.value.expectedBytes &&
      facts.measuredSha256 === descriptorContext.value.expectedSha256
    );
    if (facts.measuredBytes < descriptorContext.value.expectedBytes) {
      throw attempt.fix(new AcquisitionError('E_TRUNCATED'));
    }
    if (!facts.expectedMatch) {
      throw attempt.fix(new AcquisitionError('E_DIGEST_MISMATCH'));
    }

    const sealed = await lease.completeBody();
    if (
      !sealed.sealed ||
      sealed.measuredBytes !== facts.measuredBytes ||
      sealed.measuredSha256 !== facts.measuredSha256
    ) throw attempt.fix(new AcquisitionError('E_LOCAL_IO'));

    cache = await lease.publishVerified(
      descriptorContext.value.expectedBytes,
      descriptorContext.value.expectedSha256,
    );
    attempt.checkpoint();
    const successLocal = {
      disposition: cache.disposition,
      relativePath: cache.relativePath,
    };
    const receipt = buildReceipt({
      descriptorContext,
      attemptId,
      startedAtUtc,
      completedAtUtc: utcNow(clock),
      outcome: 'success',
      error: null,
      facts,
      local: successLocal,
    });
    validateModeBReceiptObject(receipt, descriptorContext);
    const bytes = encodeBoundedJson(receipt, LIMITS.receiptBytes);
    await lease.stageReceipt({
      requestId: descriptorContext.value.requestId,
      bytes,
      validateBytes: (candidate) => parseModeBReceiptBytes(candidate, descriptorContext),
    });
    const commitToken = attempt.enterReceiptCommit();
    const receiptRelativePath = await lease.commitReceipt({ success: true });
    attempt.markCommitted(commitToken);
    result = Object.freeze({
      ok: true,
      exitCode: 0,
      receiptRelativePath,
      error: null,
      stableFixtureIdentity: false,
      registryAdopted: false,
      g0Credit: false,
    });
  } catch (error) {
    if (error instanceof ModeBTransportError) applyHead(facts, error.transportHead);
    const primary = attempt.fix(error, 'E_LOCAL_IO');
    opened?.abort?.();
    lease?.beginFailureWork();
    let local = { disposition: 'none', relativePath: null };
    if (cache?.created) {
      local = { disposition: 'orphan-cache', relativePath: cache.relativePath };
    } else if (partialCreated && lease !== null) {
      try {
        const removed = await lease.cleanupPartial();
        if (removed) local = { disposition: 'partial-deleted', relativePath: null };
      } catch {
        // Primary outcome remains fixed and residual scratch is non-authoritative.
      }
    }

    let receiptRelativePath = null;
    if (
      descriptorContext !== null &&
      lease !== null &&
      lease.receiptReserved &&
      !NO_RECEIPT_CODES.has(primary.code)
    ) {
      try {
        const ready = await lease.prepareFailureReceipt();
        if (ready) {
          const receipt = buildReceipt({
            descriptorContext,
            attemptId,
            startedAtUtc,
            completedAtUtc: utcNow(clock),
            outcome: 'failure',
            error: publicError(primary),
            facts,
            local,
          });
          receiptRelativePath = await publishReceipt({
            lease,
            descriptorContext,
            receipt,
            success: false,
          });
        }
      } catch {
        receiptRelativePath = null;
      }
    }
    result = Object.freeze({
      ok: false,
      exitCode: publicError(primary).exitCode,
      receiptRelativePath,
      error: publicError(primary),
      stableFixtureIdentity: false,
      registryAdopted: false,
      g0Credit: false,
    });
  } finally {
    if (lease !== null) {
      try { await lease.finish(); } catch { /* committed success or fixed failure remains authoritative */ }
    }
    attempt.close();
  }
  return result;
}

export function restoreModeB({ descriptorPath } = {}) {
  const attempt = createProductionAttemptControl();
  return runModeBRestore({
    descriptorPath,
    repositoryRoot: undefined,
    attempt,
    filesystem: createProductionFilesystem({ attemptControl: attempt }),
    transport: Object.freeze({ openModeBResponse }),
    attemptId: createAttemptId('attempt'),
    clock: () => new Date(),
  });
}

export function restoreModeBWithTestPorts({
  descriptorPath,
  repositoryRoot,
  rawPort,
  clockPort,
  attempt,
  filesystemFactory,
  attemptId = 'attempt-synthetic',
  clock = () => new Date('2026-08-24T00:00:00.000Z'),
}) {
  if (
    typeof filesystemFactory !== 'function' ||
    attempt === null ||
    typeof attempt !== 'object'
  ) throw new TypeError('invalid Mode-B test ports');
  return runModeBRestore({
    descriptorPath,
    repositoryRoot,
    attempt,
    filesystem: filesystemFactory(attempt),
    transport: createModeBTransportForTest(rawPort, clockPort),
    attemptId,
    clock,
  });
}
