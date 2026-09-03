import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PRODUCTION_INPUTS = [
  'src',
  'public',
  'index.html',
  'dev.html',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  '.github/workflows',
];

const PRODUCTION_FORBIDDEN_TEXT_MARKERS = [
  '.artifacts/heic-decoder-poc',
  'scripts/heic-decoder-poc',
  'heic_decoder_bridge',
  'createlociviewheicdecoder',
  'lociview-heic-decoder-poc',
  '_lv_heic_',
  'heic-to',
  '@jsquash/heic',
  '@discourse/heic',
];

const ARTIFACT_FORBIDDEN_TEXT_MARKERS = [
  '.artifacts/heic-decoder-poc',
  'scripts/heic-decoder-poc',
  'createlociviewheicdecoder',
  'lociview-heic-decoder-poc',
  '_lv_heic_',
];

const TEXT_ARTIFACT_PATTERN = /\.(?:c?js|mjs|map|json|html?|css|txt|xml|svg|webmanifest)$/i;
const ARCHIVE_PATH_PATTERN = /\.(?:br|gz|tgz|zip|7z|xz|bz2|tar|rar|zst|zz)$/i;

const ALLOWED_POC_TRACKED_PATHS = new Set([
  'scripts/heic-decoder-poc/distribution-notice-candidate.md',
  'scripts/heic-decoder-poc/poc-result.md',
  'scripts/heic-decoder-poc/readme.md',
  'scripts/heic-decoder-poc/build.ps1',
  'scripts/heic-decoder-poc/prepare.ps1',
  'scripts/heic-decoder-poc/run-edge-smoke.mjs',
  'scripts/heic-decoder-poc/src/heic_decoder_bridge.cpp',
  'scripts/heic-decoder-poc/upstream-sources.json',
  'scripts/heic-decoder-poc/web/heic-decoder-client.mjs',
  'scripts/heic-decoder-poc/web/heic-decoder.worker.mjs',
  'scripts/heic-decoder-poc/web/index.html',
  'scripts/heic-decoder-poc/web/main.mjs',
  'scripts/heic-decoder-poc/web/style.css',
]);

const FORBIDDEN_SHA256 = new Map([
  ['58988b61e5067c388cbc20609af1e186450a3d3e07f894cdcfcc1d053cab73b0', 'known libde265 PoC JavaScript'],
  ['99823b33ca6ff71d97dc6afbc79692394dd8e24c6b7c44dd9869e7ada8dade5d', 'known libde265 PoC Wasm'],
  ['11c1179e0e4bec33624b87f22ec42c1e993a40d946d44d26f9c431cf1456a863', 'known libheif PoC source archive'],
  ['eaacd1943ab0c452c19f6136a36ca227e6b761b39a81eaca8454d48c147e1f67', 'known libde265 PoC source archive'],
  ['88232dd77f0efe45327c29091c39e260d69469d2128b752c61e4c8c98d47a6ef', 'known Emscripten PoC source archive'],
]);

function normalizedRelative(root, path) {
  return relative(root, path).split(sep).join('/');
}

function listFiles(path, violations) {
  const status = lstatSync(path);
  if (status.isSymbolicLink()) {
    violations.push(`symbolic link is not scanned: ${path}`);
    return [];
  }
  if (status.isFile()) {
    return [path];
  }
  if (!status.isDirectory()) {
    return [];
  }
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    listFiles(resolve(path, entry.name), violations));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function archiveKind(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2])) return 'zip';
  if (bytes.length >= 6 && bytes.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]))) return 'xz';
  if (bytes.length >= 6 && bytes.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) return '7z';
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString('ascii') === 'BZh') return 'bzip2';
  if (bytes.length >= 262 && bytes.subarray(257, 262).toString('ascii') === 'ustar') return 'tar';
  return null;
}

function scanBytes(root, path, scope, kind, forbiddenSha256, violations) {
  const bytes = readFileSync(path);
  const relativePath = normalizedRelative(root, path);
  const lowerPath = relativePath.toLowerCase();
  const searchable = bytes.toString('latin1').toLowerCase();
  const markers = kind === 'production'
    ? PRODUCTION_FORBIDDEN_TEXT_MARKERS
    : ARTIFACT_FORBIDDEN_TEXT_MARKERS;

  for (const marker of markers) {
    if (lowerPath.includes(marker) || searchable.includes(marker)) {
      violations.push(`${scope}: ${relativePath} contains forbidden PoC marker ${JSON.stringify(marker)}`);
    }
  }

  if (kind === 'production' && /\bWITH_LIBDE265\s*(?::\w+)?\s*=\s*(?:ON|TRUE|YES|1)\b/i.test(searchable)) {
    violations.push(`${scope}: ${relativePath} enables the local libde265 backend`);
  }

  if (kind === 'production' && /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"][^'"\r\n]*libde265[^'"\r\n]*['"]/i.test(searchable)) {
    violations.push(`${scope}: ${relativePath} imports a libde265 component`);
  }

  if (kind === 'production' && /['"][^'"\r\n]*libde265[^'"\r\n]*['"]\s*:/i.test(searchable)) {
    violations.push(`${scope}: ${relativePath} declares a libde265 dependency or registry entry`);
  }

  if (kind === 'production' && /\b(?:new\s+URL|Worker)\s*\(\s*['"][^'"\r\n]*libde265[^'"\r\n]*['"]/i.test(searchable)) {
    violations.push(`${scope}: ${relativePath} references a libde265 runtime asset`);
  }

  if (kind === 'artifact') {
    if (ARCHIVE_PATH_PATTERN.test(relativePath)) {
      violations.push(`${scope}: ${relativePath} is compressed or archived; verify an extracted release staging directory instead`);
    }
    const compressed = archiveKind(bytes);
    if (compressed) {
      violations.push(`${scope}: ${relativePath} is a ${compressed} archive; verify an extracted release staging directory instead`);
    }
    if (TEXT_ARTIFACT_PATTERN.test(relativePath)) {
      const withoutApprovedOffFlag = searchable.replace(
        /\bwith_libde265\s*(?::\w+)?\s*=\s*(?:off|false|no|0)\b/gi,
        '',
      );
      if (withoutApprovedOffFlag.includes('libde265')) {
        violations.push(`${scope}: ${relativePath} contains a libde265 text reference other than an explicit disabled build flag`);
      }
    } else if (searchable.includes('libde265')) {
      violations.push(`${scope}: ${relativePath} contains a libde265 binary fingerprint`);
    }
  }

  const knownOutput = forbiddenSha256.get(sha256(bytes));
  if (knownOutput) {
    violations.push(`${scope}: ${relativePath} matches ${knownOutput}`);
  }
}

function defaultTrackedFiles(root) {
  const result = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.split('\0').filter(Boolean);
}

function scanTrackedFiles(root, trackedFiles, forbiddenSha256, violations) {
  for (const entry of trackedFiles) {
    const path = entry.replaceAll('\\', '/');
    const lowerPath = path.toLowerCase();
    const absolutePath = resolve(root, path);

    if (existsSync(absolutePath) && lstatSync(absolutePath).isFile()) {
      const knownOutput = forbiddenSha256.get(sha256(readFileSync(absolutePath)));
      if (knownOutput) {
        violations.push(`git: tracked file ${path} matches ${knownOutput}`);
      }
    }

    if (lowerPath.startsWith('.artifacts/heic-decoder-poc/')) {
      violations.push(`git: generated PoC artifact is tracked: ${path}`);
    }

    if (lowerPath.startsWith('scripts/heic-decoder-poc/')) {
      if (!ALLOWED_POC_TRACKED_PATHS.has(lowerPath)) {
        violations.push(`git: unapproved file is tracked inside the PoC source directory: ${path}`);
      }
      continue;
    }

    if (lowerPath.includes('libde265')) {
      violations.push(`git: PoC decoder material is tracked outside the allowed source directory: ${path}`);
    }
  }
}

export function collectHeicIsolationViolations({
  root,
  artifactDirectories = ['dist'],
  productionInputs = DEFAULT_PRODUCTION_INPUTS,
  trackedFiles,
  forbiddenSha256 = FORBIDDEN_SHA256,
} = {}) {
  const resolvedRoot = resolve(root ?? fileURLToPath(new URL('..', import.meta.url)));
  const violations = [];

  for (const input of productionInputs) {
    const inputPath = resolve(resolvedRoot, input);
    if (!existsSync(inputPath)) {
      continue;
    }
    for (const file of listFiles(inputPath, violations)) {
      scanBytes(resolvedRoot, file, 'production input', 'production', forbiddenSha256, violations);
    }
  }

  for (const artifactDirectory of artifactDirectories) {
    const artifactPath = resolve(resolvedRoot, artifactDirectory);
    if (!existsSync(artifactPath)) {
      violations.push(`public artifact directory is missing: ${artifactDirectory}`);
      continue;
    }
    for (const file of listFiles(artifactPath, violations)) {
      scanBytes(resolvedRoot, file, 'public artifact', 'artifact', forbiddenSha256, violations);
    }
  }

  scanTrackedFiles(resolvedRoot, trackedFiles ?? defaultTrackedFiles(resolvedRoot), forbiddenSha256, violations);
  return [...new Set(violations)].sort();
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const values = { root: resolve(fileURLToPath(new URL('..', import.meta.url))), artifactDirectories: [] };
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index];
    const value = process.argv[index + 1];
    if (value == null || !['--root', '--artifact'].includes(name)) {
      throw new Error('usage: node scripts/verify-heic-public-isolation.mjs [--root path] [--artifact path]...');
    }
    if (name === '--root') values.root = resolve(value);
    if (name === '--artifact') values.artifactDirectories.push(value);
  }
  if (values.artifactDirectories.length === 0) values.artifactDirectories.push('dist');
  const violations = collectHeicIsolationViolations(values);
  if (violations.length > 0) {
    console.error('HEIC public-path isolation failed:');
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`HEIC public-path isolation PASS: local libde265 PoC material is absent from production inputs and ${values.artifactDirectories.join(', ')}.`);
  }
}
