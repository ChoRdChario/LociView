import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { DESCRIPTOR_ROOT, LIMITS, REPOSITORY_ROOT } from './constants.mjs';
import { AcquisitionError, fail } from './errors.mjs';

const RECEIPT_DESCRIPTOR_PATH =
  /^fixtures\/acquisition\/descriptors\/[A-Za-z0-9._/-]+(?![\s\S])/u;

function portablePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.includes(':') ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    isAbsolute(value)
  ) fail('E_DESCRIPTOR');
  const segments = value.split('/');
  if (
    segments.some((segment) =>
      segment === '' ||
      segment === '.' ||
      segment === '..' ||
      /[. ]$/u.test(segment) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
    )
  ) fail('E_DESCRIPTOR');
  return value;
}

export function normalizeDescriptorPath(value) {
  const normalized = portablePath(value);
  if (
    !RECEIPT_DESCRIPTOR_PATH.test(normalized) ||
    !normalized.startsWith(DESCRIPTOR_ROOT) ||
    normalized.length === DESCRIPTOR_ROOT.length
  ) fail('E_DESCRIPTOR');
  return normalized;
}

function contained(root, target) {
  const fromRoot = relative(root, target);
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function trustedDescriptorStat(stat) {
  return (
    stat.isFile() &&
    !stat.isSymbolicLink() &&
    stat.nlink === 1n &&
    stat.size >= 0n &&
    stat.size <= BigInt(LIMITS.descriptorBytes)
  );
}

function guarded(attemptControl, operation) {
  return attemptControl === undefined
    ? operation()
    : attemptControl.run(operation, 'E_DESCRIPTOR');
}

async function acquireDescriptorHandle(path, attemptControl, openFile = open) {
  attemptControl?.checkpoint();
  const handle = await openFile(path, 'r');
  try {
    attemptControl?.checkpoint();
  } catch (error) {
    try { await handle.close(); } catch { /* deadline remains primary */ }
    throw error;
  }
  return handle;
}

async function readBoundedHandle(handle, maximumBytes, attemptControl) {
  const buffer = Buffer.allocUnsafe(maximumBytes + 1);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await guarded(
      attemptControl,
      () => handle.read(buffer, offset, buffer.byteLength - offset, null),
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > maximumBytes) throw new Error('descriptor exceeds byte limit');
  return Buffer.from(buffer.subarray(0, offset));
}

const inheritedNonGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_') && key.toUpperCase() !== 'GCM_INTERACTIVE'),
);
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
const gitEnvironment = Object.freeze({
  ...inheritedNonGitEnvironment,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: nullDevice,
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'Never',
  GIT_NO_REPLACE_OBJECTS: '1',
});

function runGit(repositoryRoot, args, maximumBytes, code = 'E_DESCRIPTOR') {
  return new Promise((accept, reject) => {
    const safeRoot = repositoryRoot.replaceAll('\\', '/');
    const child = spawn(
      'git',
      ['-c', `safe.directory=${safeRoot}`, '-C', repositoryRoot, ...args],
      { shell: false, windowsHide: true, env: gitEnvironment, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const finishError = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(new (class extends Error {})());
    };
    const timer = setTimeout(finishError, LIMITS.gitTimeoutMs);
    timer.unref();
    child.stdout.on('data', (chunk) => {
      bytes += chunk.byteLength;
      if (!Number.isSafeInteger(bytes) || bytes > maximumBytes) finishError();
      else chunks.push(chunk);
    });
    child.once('error', finishError);
    child.once('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (exitCode !== 0) {
        reject(new (class extends Error {})());
        return;
      }
      accept(Buffer.concat(chunks));
    });
  }).catch((error) => fail(code, null, error));
}

async function indexedBlob(repositoryRoot, descriptorPath, attemptControl) {
  const metadataBytes = await guarded(
    attemptControl,
    () => runGit(
      repositoryRoot,
      ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', descriptorPath],
      LIMITS.gitMetadataBytes,
    ),
  );
  let metadata;
  try { metadata = new TextDecoder('utf-8', { fatal: true }).decode(metadataBytes); } catch { fail('E_DESCRIPTOR'); }
  const match = /^(100644|100755) ([0-9a-f]{40,64}) 0\t([^\0]+)\0(?![\s\S])/u.exec(metadata);
  if (match === null || match[3] !== descriptorPath) fail('E_DESCRIPTOR');
  return match[2];
}

export async function readTrustedDescriptorBytes(
  descriptorPath,
  repositoryRoot = REPOSITORY_ROOT,
  attemptControl = undefined,
) {
  const normalizedPath = normalizeDescriptorPath(descriptorPath);
  let handle = null;
  try {
    const repositoryReal = await guarded(attemptControl, () => realpath(repositoryRoot));
    const absolute = resolve(repositoryReal, ...normalizedPath.split('/'));
    if (!contained(repositoryReal, absolute)) throw new Error('descriptor escapes repository');

    const before = await guarded(attemptControl, () => lstat(absolute, { bigint: true }));
    if (!trustedDescriptorStat(before)) throw new Error('descriptor path is not a trusted regular file');
    const resolvedBefore = await guarded(attemptControl, () => realpath(absolute));
    if (!contained(repositoryReal, resolvedBefore) || resolvedBefore !== absolute) {
      throw new Error('descriptor path resolves outside its trusted path');
    }

    handle = await acquireDescriptorHandle(absolute, attemptControl);
    const opened = await guarded(attemptControl, () => handle.stat({ bigint: true }));
    if (!trustedDescriptorStat(opened) || !sameIdentity(before, opened)) {
      throw new Error('descriptor identity changed while opening');
    }

    const objectId = await indexedBlob(repositoryReal, normalizedPath, attemptControl);
    const worktreeBytes = await readBoundedHandle(handle, LIMITS.descriptorBytes, attemptControl);
    const afterHandle = await guarded(attemptControl, () => handle.stat({ bigint: true }));
    if (
      !trustedDescriptorStat(afterHandle) ||
      !sameIdentity(opened, afterHandle) ||
      afterHandle.size !== BigInt(worktreeBytes.byteLength)
    ) {
      throw new Error('descriptor identity changed while reading');
    }

    const afterPath = await guarded(attemptControl, () => lstat(absolute, { bigint: true }));
    const resolvedAfter = await guarded(attemptControl, () => realpath(absolute));
    if (
      !trustedDescriptorStat(afterPath) ||
      !sameIdentity(opened, afterPath) ||
      resolvedAfter !== absolute ||
      !contained(repositoryReal, resolvedAfter)
    ) {
      throw new Error('descriptor path changed while reading');
    }

    const indexedBytes = await guarded(
      attemptControl,
      () => runGit(repositoryReal, ['cat-file', 'blob', objectId], LIMITS.descriptorBytes),
    );
    if (!worktreeBytes.equals(indexedBytes)) throw new Error('descriptor differs from indexed blob');
    await handle.close();
    handle = null;
    return Object.freeze({
      path: normalizedPath,
      absolutePath: absolute,
      bytes: worktreeBytes,
      sha256: createHash('sha256').update(worktreeBytes).digest('hex'),
    });
  } catch (error) {
    if (handle !== null) {
      try { await handle.close(); } catch { /* descriptor failure remains primary */ }
    }
    if (error instanceof AcquisitionError) throw error;
    fail('E_DESCRIPTOR', null, error);
  }
}

export function acquireDescriptorHandleForTest(openFile, attemptControl) {
  return acquireDescriptorHandle('descriptor-for-test', attemptControl, openFile);
}
