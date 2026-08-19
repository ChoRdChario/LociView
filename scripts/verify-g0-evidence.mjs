import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, posix, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const trustedSchemaRoot = resolve(moduleRoot, 'evidence', 'g0', 'schema');
const trustedFixtureSchema = resolve(moduleRoot, 'fixtures', 'registry.schema.json');
const decoder = new TextDecoder('utf-8', { fatal: true });
export const DEFAULT_LIMITS = Object.freeze({
  schemaBytes: 512 * 1024,
  jsonBytes: 2 * 1024 * 1024,
  jsonlLineBytes: 64 * 1024,
  jsonlLines: 1_000,
  directoryEntries: 1_000,
  totalJsonBytes: 32 * 1024 * 1024,
  schemaErrors: 8,
  gitMetadataBytes: 16 * 1024 * 1024,
  gitBlobBytes: 64 * 1024 * 1024,
  totalSourceBytes: 8 * 1024 * 1024 * 1024,
  gitTimeoutMs: 120_000,
});

export class EvidenceVerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceVerificationError';
    this.code = code;
  }
}
function fail(code, message) { throw new EvidenceVerificationError(code, message); }
function isSafeBytes(value) { return Number.isSafeInteger(value) && value >= 0; }

class Budget {
  constructor(limit) { this.limit = limit; this.used = 0; }
  add(bytes) {
    if (!isSafeBytes(bytes) || this.used + bytes > this.limit) fail('E_LIMIT', `JSON input exceeds the ${this.limit}-byte total budget`);
    this.used += bytes;
  }
}

class SourceBudget {
  constructor(limit) { this.limit = limit; this.used = 0; this.verified = new Set(); }
  has(key) { return this.verified.has(key); }
  reserve(key, bytes) {
    if (this.verified.has(key)) return false;
    if (!isSafeBytes(bytes) || this.used + bytes > this.limit) fail('E_LIMIT', `unique source bytes exceed the ${this.limit}-byte cumulative budget`);
    this.used += bytes;
    return true;
  }
  complete(key) { this.verified.add(key); }
}

async function regularStat(path, label, code = 'E_IO') {
  let stat;
  try { stat = await lstat(path); } catch (error) {
    if (error?.code === 'ENOENT') fail(code, `${label} is missing`);
    fail('E_IO', `${label} cannot be inspected`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code, `${label} must be a regular non-symlink file`);
  if (!isSafeBytes(stat.size)) fail('E_LIMIT', `${label} has an invalid byte size`);
  return stat;
}

async function readText(path, label, maximum, budget, code = 'E_PARSE') {
  const stat = await regularStat(path, label, code);
  if (stat.size > maximum) fail('E_LIMIT', `${label} exceeds the ${maximum}-byte file budget`);
  budget.add(stat.size);
  let bytes;
  try { bytes = await readFile(path); } catch { fail('E_IO', `${label} cannot be read`); }
  if (bytes.byteLength > maximum) fail('E_LIMIT', `${label} grew beyond the ${maximum}-byte file budget`);
  if (bytes.byteLength > stat.size) budget.add(bytes.byteLength - stat.size);
  try { return decoder.decode(bytes); } catch { fail(code, `${label} is not valid UTF-8`); }
}

function parseJsonWithoutDuplicateMembers(text, label, code = 'E_PARSE') {
  let index = 0;
  const stack = [{ type: 'root', state: 'value' }];
  const malformed = () => fail(code, `${label} is not valid JSON`);
  const duplicate = () => fail(code, `${label} contains a duplicate object member`);
  const whitespace = () => {
    while (index < text.length && (text[index] === ' ' || text[index] === '\t' || text[index] === '\r' || text[index] === '\n')) index += 1;
  };
  const stringToken = () => {
    if (text[index] !== '"') malformed();
    const start = index;
    index += 1;
    while (index < text.length) {
      const unit = text.charCodeAt(index);
      if (unit === 0x22) {
        index += 1;
        try { return JSON.parse(text.slice(start, index)); } catch { malformed(); }
      }
      if (unit <= 0x1f) malformed();
      if (unit !== 0x5c) {
        index += 1;
        continue;
      }
      index += 1;
      if (index >= text.length) malformed();
      const escape = text[index];
      if (escape === 'u') {
        if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(index + 1, index + 5))) malformed();
        index += 5;
      } else if ('"\\/bfnrt'.includes(escape)) index += 1;
      else malformed();
    }
    malformed();
  };
  const numberToken = () => {
    if (text[index] === '-') index += 1;
    if (text[index] === '0') index += 1;
    else {
      if (text[index] === undefined || text[index] < '1' || text[index] > '9') malformed();
      do { index += 1; } while (text[index] !== undefined && text[index] >= '0' && text[index] <= '9');
    }
    if (text[index] === '.') {
      index += 1;
      if (text[index] === undefined || text[index] < '0' || text[index] > '9') malformed();
      do { index += 1; } while (text[index] !== undefined && text[index] >= '0' && text[index] <= '9');
    }
    if (text[index] === 'e' || text[index] === 'E') {
      index += 1;
      if (text[index] === '+' || text[index] === '-') index += 1;
      if (text[index] === undefined || text[index] < '0' || text[index] > '9') malformed();
      do { index += 1; } while (text[index] !== undefined && text[index] >= '0' && text[index] <= '9');
    }
  };
  const value = (context) => {
    const token = text[index];
    context.state = 'comma-or-end';
    if (context.type === 'root') context.state = 'done';
    if (token === '{') {
      index += 1;
      stack.push({ type: 'object', state: 'key-or-end', keys: new Set() });
    } else if (token === '[') {
      index += 1;
      stack.push({ type: 'array', state: 'value-or-end' });
    } else if (token === '"') stringToken();
    else if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) numberToken();
    else if (text.startsWith('true', index)) index += 4;
    else if (text.startsWith('false', index)) index += 5;
    else if (text.startsWith('null', index)) index += 4;
    else malformed();
  };

  while (stack.length > 0) {
    whitespace();
    const context = stack.at(-1);
    if (context.type === 'root') {
      if (context.state === 'value') value(context);
      else {
        if (index !== text.length) malformed();
        stack.pop();
      }
    } else if (context.type === 'object') {
      if (context.state === 'key-or-end' || context.state === 'key') {
        if (context.state === 'key-or-end' && text[index] === '}') {
          index += 1;
          stack.pop();
          continue;
        }
        const key = stringToken();
        if (context.keys.has(key)) duplicate();
        context.keys.add(key);
        context.state = 'colon';
      } else if (context.state === 'colon') {
        if (text[index] !== ':') malformed();
        index += 1;
        context.state = 'value';
      } else if (context.state === 'value') value(context);
      else if (text[index] === ',') {
        index += 1;
        context.state = 'key';
      } else if (text[index] === '}') {
        index += 1;
        stack.pop();
      } else malformed();
    } else if (context.state === 'value-or-end' || context.state === 'value') {
      if (context.state === 'value-or-end' && text[index] === ']') {
        index += 1;
        stack.pop();
      } else value(context);
    } else if (text[index] === ',') {
      index += 1;
      context.state = 'value';
    } else if (text[index] === ']') {
      index += 1;
      stack.pop();
    } else malformed();
  }

  try { return JSON.parse(text); } catch { malformed(); }
}

async function readJson(path, label, maximum, budget, code = 'E_PARSE') {
  const text = await readText(path, label, maximum, budget, code);
  return parseJsonWithoutDuplicateMembers(text, label, code);
}

function utcDateTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/u.exec(value);
  if (match === null) return false;
  const [, y, m, d, h, min, s] = match.map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1] && h <= 23 && min <= 59 && s <= 59;
}
function httpsUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '';
  } catch { return false; }
}

function compileValidators(schemas) {
  try {
    const ajv = new Ajv2020({ strict: true, allErrors: false, validateFormats: true, allowUnionTypes: true, $data: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
    ajv.addFormat('utc-date-time', { type: 'string', validate: utcDateTime });
    ajv.addFormat('date-time', { type: 'string', validate: utcDateTime });
    ajv.addFormat('https-url', { type: 'string', validate: httpsUrl });
    return { device: ajv.compile(schemas.device), run: ajv.compile(schemas.run), manifest: ajv.compile(schemas.manifest), registry: ajv.compile(schemas.registry) };
  } catch { fail('E_SCHEMA', 'trusted schema compilation failed'); }
}
function assertSafeNumbers(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) fail('E_NUMBER', `${label} contains a non-finite or unsafe integer value`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((child) => assertSafeNumbers(child, label)); return; }
  if (value !== null && typeof value === 'object') Object.values(value).forEach((child) => assertSafeNumbers(child, label));
}
function validate(validateFn, value, label, limits, code = 'E_SCHEMA') {
  assertSafeNumbers(value, label);
  if (validateFn(value)) return;
  const details = (validateFn.errors ?? []).slice(0, limits.schemaErrors).map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`).join('; ');
  fail(code, `${label} does not match its trusted schema${details ? `: ${details}` : ''}`);
}

const secretParameterPattern = /[?#&](?:access_token|api_key|client_secret|password|passwd|secret|signature|sig|token|key|x-amz-credential|x-amz-signature|x-goog-credential|x-goog-signature)=[^&#\s]+/iu;
function decodePercentLayer(value) {
  return value.replace(/%([0-9a-f]{2})/giu, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}
function privacyCandidates(value, label) {
  const candidates = [value];
  let candidate = value;
  for (let depth = 0; depth < 8; depth += 1) {
    const decoded = decodePercentLayer(candidate);
    if (decoded === candidate) return candidates;
    candidates.push(decoded);
    candidate = decoded;
  }
  if (decodePercentLayer(candidate) !== candidate) fail('E_PRIVACY', `${label} contains excessive percent encoding`);
  return candidates;
}

function privacy(value, label) {
  if (typeof value === 'string') {
    for (const candidate of privacyCandidates(value, label)) {
      if (/[a-z][a-z0-9+.-]*:\/\/[^/\s@]+@/iu.test(candidate)) fail('E_PRIVACY', `${label} contains user information in a URL`);
      if (/(?:^|[^a-z0-9_])[a-z]:[\\/](?:users|documents and settings)[\\/][^\\/\s"']+/iu.test(candidate)) fail('E_PRIVACY', `${label} contains a Windows account path`);
      if (/(?:^|[\s"'(])\/(?:users|home)\/[^/\s"']+/iu.test(candidate)) fail('E_PRIVACY', `${label} contains an account home path`);
      if (secretParameterPattern.test(candidate)) fail('E_PRIVACY', `${label} contains a secret-like URL parameter`);
      if (/\bauthorization\s*:\s*\S+/iu.test(candidate)) fail('E_PRIVACY', `${label} contains an authorization header`);
      if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u.test(candidate)) fail('E_PRIVACY', `${label} contains a private-key header`);
    }
  } else if (Array.isArray(value)) value.forEach((child, index) => privacy(child, `${label}[${index}]`));
  else if (value !== null && typeof value === 'object') Object.entries(value).forEach(([key, child]) => privacy(child, `${label}.${key}`));
}
function unique(items, idOf, kind) {
  const map = new Map();
  for (const item of items) {
    const id = idOf(item);
    if (id === null || id === undefined) continue;
    if (map.has(id)) fail('E_DUPLICATE_ID', `duplicate ${kind} ID: ${id}`);
    map.set(id, item);
  }
  return map;
}

function neutralPendingMetric(value, key = '') {
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value !== null && typeof value === 'object') return Object.entries(value).every(([childKey, child]) => neutralPendingMetric(child, childKey));
  return key === 'jsHeapStatus' && value === 'not-collected';
}

async function jsonLines(path, label, limits, budget) {
  const text = await readText(path, label, limits.jsonBytes, budget);
  const lines = text.split(/\r?\n/u);
  if (lines.length > limits.jsonlLines + 1) fail('E_LIMIT', `${label} exceeds the ${limits.jsonlLines}-line budget`);
  const result = [];
  for (const [index, line] of lines.entries()) {
    if (/^[\u0020\t\r]*$/u.test(line)) continue;
    const itemLabel = `${label}:${index + 1}`;
    if (Buffer.byteLength(line, 'utf8') > limits.jsonlLineBytes) fail('E_LIMIT', `${itemLabel} exceeds the line byte budget`);
    result.push(parseJsonWithoutDuplicateMembers(line, itemLabel));
  }
  if (result.length > limits.jsonlLines) fail('E_LIMIT', `${label} exceeds the ${limits.jsonlLines}-record budget`);
  return result;
}

const windowsReservedSegment = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu;
function wellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function portableSegment(value) {
  return value !== '' && value.normalize('NFC') === value && wellFormedUnicode(value)
    && value.length <= 255 && Buffer.byteLength(value, 'utf8') <= 255
    && !/[<>:"|?*\\\u0000-\u001f\u007f]/u.test(value) && !/[. ]$/u.test(value)
    && !windowsReservedSegment.test(value);
}

async function records(root, directory, validator, limits, budget) {
  const path = resolve(root, directory);
  let stat;
  try { stat = await lstat(path); } catch (error) {
    if (error?.code === 'ENOENT') return [];
    fail('E_IO', `${directory} cannot be inspected`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('E_IO', `${directory} must be a regular directory`);
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); } catch { fail('E_IO', `${directory} cannot be read`); }
  if (entries.length > limits.directoryEntries) fail('E_LIMIT', `${directory} exceeds the directory entry budget`);
  const safeRecordName = /^[a-z0-9][a-z0-9._-]*\.json$/u;
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink() || !safeRecordName.test(entry.name) || !portableSegment(entry.name))) {
    fail('E_IO', `${directory} contains an invalid record entry`);
  }
  const selected = entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const result = [];
  for (const entry of selected) {
    const label = `${directory}/${entry.name}`;
    if (!entry.isFile() || entry.isSymbolicLink()) fail('E_IO', `${label} must be a regular non-symlink file`);
    const value = await readJson(resolve(path, entry.name), label, limits.jsonBytes, budget);
    validate(validator, value, label, limits);
    privacy(value, label);
    result.push(value);
  }
  return result;
}

async function exactDirectoryFiles(path, label, expectedNames, maximumEntries) {
  let stat;
  try { stat = await lstat(path); } catch { fail('E_TEMPLATE', `${label} cannot be inspected`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('E_TEMPLATE', `${label} must be a regular directory`);
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); } catch { fail('E_TEMPLATE', `${label} cannot be read`); }
  if (entries.length > maximumEntries) fail('E_LIMIT', `${label} exceeds the directory entry budget`);
  const expected = [...expectedNames].sort();
  const actual = entries.map((entry) => entry.name).sort();
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('E_TEMPLATE', `${label} must contain only the approved template files`);
  }
}

function safePath(value, label, code) {
  const segments = typeof value === 'string' ? value.split('/') : [];
  if (typeof value !== 'string' || value === '' || value.length > 2048 || value.startsWith('/') || posix.normalize(value) !== value || segments.some((part) => part === '.' || part === '..' || !portableSegment(part))) fail(code, `${label} must be a portable normalized repository-relative path`);
  return value;
}

const inheritedNonGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_') && key.toUpperCase() !== 'GCM_INTERACTIVE'),
);
const gitEnvironment = Object.freeze({
  ...inheritedNonGitEnvironment,
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'Never',
  GIT_NO_REPLACE_OBJECTS: '1',
});
function gitBytes(root, args, label, code, timeoutMs) {
  return new Promise((accept, reject) => {
    const child = spawn('git', ['-C', root, ...args], { shell: false, windowsHide: true, env: gitEnvironment, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = []; let count = 0; let done = false;
    const timer = setTimeout(() => bad(`${label} Git query timed out`), timeoutMs);
    timer.unref();
    const bad = (message) => { if (!done) { done = true; clearTimeout(timer); child.kill(); reject(new EvidenceVerificationError(code, message)); } };
    child.stdout.on('data', (chunk) => { count += chunk.length; if (count > 4096) bad(`${label} returned oversized Git metadata`); else chunks.push(chunk); });
    child.once('error', () => bad(`${label} cannot query Git objects`));
    child.once('close', (exitCode) => { if (!done) { done = true; clearTimeout(timer); if (exitCode === 0) accept(Buffer.concat(chunks)); else reject(new EvidenceVerificationError(code, `${label} does not resolve in the recorded Git commit`)); } });
  });
}
async function gitText(root, args, label, code, timeoutMs) {
  return decoder.decode(await gitBytes(root, args, label, code, timeoutMs)).trim();
}
async function commitExists(root, commit, cache, label, code, timeoutMs) {
  if (cache.has(commit)) return;
  if (await gitText(root, ['cat-file', '-t', commit], label, code, timeoutMs) !== 'commit') fail(code, `${label} is not a Git commit`);
  await gitText(root, ['merge-base', '--is-ancestor', commit, 'HEAD'], label, code, timeoutMs);
  cache.add(commit);
}
function hashGit(root, spec, expectedBytes, label, code, timeoutMs) {
  return new Promise((accept, reject) => {
    const child = spawn('git', ['-C', root, 'cat-file', 'blob', spec], { shell: false, windowsHide: true, env: gitEnvironment, stdio: ['ignore', 'pipe', 'ignore'] });
    const hash = createHash('sha256'); let bytes = 0; let done = false;
    const timer = setTimeout(() => bad(`${label} Git blob read timed out`), timeoutMs);
    timer.unref();
    const bad = (message) => { if (!done) { done = true; clearTimeout(timer); child.kill(); reject(new EvidenceVerificationError(code, message)); } };
    child.stdout.on('data', (chunk) => { bytes += chunk.length; if (!isSafeBytes(bytes) || (expectedBytes !== undefined && bytes > expectedBytes)) bad(`${label} exceeds its declared byte size`); else hash.update(chunk); });
    child.once('error', () => bad(`${label} cannot read the recorded Git blob`));
    child.once('close', (exitCode) => { if (!done) { done = true; clearTimeout(timer); if (exitCode === 0) accept({ bytes, sha256: hash.digest('hex') }); else reject(new EvidenceVerificationError(code, `${label} cannot read the recorded Git blob`)); } });
  });
}
async function verifyGit({ root, commit, locator, bytes, sha256, label, code, commitCache, sourceBudget, maximum, timeoutMs }) {
  const path = safePath(locator, `${label} locator`, code);
  const knownKey = bytes === undefined ? null : JSON.stringify(['git', commit, path, bytes, sha256]);
  if (knownKey !== null && sourceBudget.has(knownKey)) return;
  await commitExists(root, commit, commitCache, `${label} commit`, code, timeoutMs);
  const treeBytes = await gitBytes(root, ['--literal-pathspecs', 'ls-tree', '-z', '--full-tree', commit, '--', path], label, code, timeoutMs);
  let tree;
  try { tree = decoder.decode(treeBytes); } catch { fail(code, `${label} returned invalid Git tree metadata`); }
  const treeMatch = /^(100644|100755) blob [0-9a-f]{40,64}\t([^\0]+)\0$/u.exec(tree);
  if (treeMatch === null || treeMatch[2] !== path) fail(code, `${label} must resolve to one exact regular Git blob`);
  const spec = `${commit}:${path}`;
  const sizeText = await gitText(root, ['cat-file', '-s', spec], label, code, timeoutMs);
  if (!/^(?:0|[1-9]\d*)$/u.test(sizeText) || !isSafeBytes(Number(sizeText))) fail(code, `${label} has an invalid Git blob size`);
  const size = Number(sizeText);
  if (bytes !== undefined && size !== bytes) fail(code, `${label} byte size differs from the recorded Git blob`);
  if (maximum !== undefined && size > maximum) fail('E_LIMIT', `${label} exceeds the Git metadata budget`);
  const key = knownKey ?? JSON.stringify(['git', commit, path, size, sha256]);
  if (sourceBudget.has(key)) return;
  sourceBudget.reserve(key, size);
  const actual = await hashGit(root, spec, bytes, label, code, timeoutMs);
  if (actual.bytes !== size || actual.sha256 !== sha256) fail(code, `${label} hash or byte size differs from the recorded Git blob`);
  sourceBudget.complete(key);
}

async function verifyGenerated({ root, locator, bytes: expectedBytes, sha256, label, code, sourceBudget, allowedPrefix }) {
  const safeLocator = safePath(locator, `${label} locator`, code);
  if (!safeLocator.startsWith(allowedPrefix) || safeLocator.length === allowedPrefix.length) {
    fail('E_SOURCE', `${label} generated source is outside its allowed artifact directory`);
  }
  const key = JSON.stringify(['generated', safeLocator, expectedBytes, sha256]);
  if (sourceBudget.has(key)) return;
  const path = resolve(root, ...safeLocator.split('/'));
  const stat = await regularStat(path, label, code);
  if (stat.size !== expectedBytes) fail(code, `${label} byte size differs from the generated file`);
  let rootReal; let pathReal;
  try { [rootReal, pathReal] = await Promise.all([realpath(root), realpath(path)]); } catch { fail(code, `${label} cannot resolve its generated file`); }
  const childPath = relative(rootReal, pathReal);
  if (childPath === '..' || childPath.startsWith(`..${sep}`) || isAbsolute(childPath)) fail(code, `${label} generated file escapes the evidence root`);
  sourceBudget.reserve(key, expectedBytes);
  const hash = createHash('sha256'); let bytes = 0;
  try {
    for await (const chunk of createReadStream(path)) { bytes += chunk.length; if (!isSafeBytes(bytes) || bytes > expectedBytes) fail(code, `${label} exceeds its declared byte size`); hash.update(chunk); }
  } catch (error) { if (error instanceof EvidenceVerificationError) throw error; fail(code, `${label} cannot read its generated file`); }
  if (bytes !== expectedBytes || hash.digest('hex') !== sha256) fail(code, `${label} hash or byte size differs from the generated file`);
  sourceBudget.complete(key);
}

function artifact(manifest, kind, sha256, bytes) { return manifest?.artifacts?.find((item) => item.kind === kind && item.sha256 === sha256 && item.bytes === bytes); }
function sameSize(a, b) { return a?.width === b?.width && a?.height === b?.height; }

export async function verifyG0Evidence(options = {}) {
  const root = resolve(options.root ?? moduleRoot);
  const limits = Object.freeze({ ...DEFAULT_LIMITS, ...(options.limits ?? {}) });
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)) fail('E_USAGE', 'verifier limits must be positive safe integers');
  const budget = new Budget(limits.totalJsonBytes);
  const schema = {
    device: await readJson(resolve(trustedSchemaRoot, 'device-environment.schema.json'), 'trusted/device-environment.schema.json', limits.schemaBytes, budget, 'E_SCHEMA'),
    run: await readJson(resolve(trustedSchemaRoot, 'run-record.schema.json'), 'trusted/run-record.schema.json', limits.schemaBytes, budget, 'E_SCHEMA'),
    manifest: await readJson(resolve(trustedSchemaRoot, 'external-artifact-manifest.schema.json'), 'trusted/external-artifact-manifest.schema.json', limits.schemaBytes, budget, 'E_SCHEMA'),
    registry: await readJson(trustedFixtureSchema, 'trusted/fixture-registry.schema.json', limits.schemaBytes, budget, 'E_SCHEMA'),
  };
  const validators = compileValidators(schema);
  const evidenceRoot = resolve(root, 'evidence', 'g0');

  await exactDirectoryFiles(resolve(evidenceRoot, 'templates'), 'evidence/g0/templates', [
    'device-environments.template.jsonl',
    'external-artifact-manifest.template.json',
    'run-record.template.json',
  ], limits.directoryEntries);

  const deviceTemplateLabel = 'evidence/g0/templates/device-environments.template.jsonl';
  const deviceTemplates = await jsonLines(resolve(evidenceRoot, 'templates', 'device-environments.template.jsonl'), deviceTemplateLabel, limits, budget);
  const pendingDeviceDefaults = {
    'iphone-14-pro': ['iPhone 14 Pro', 'iOS', 'Safari', 'pwa'],
    'windows-desktop': [null, 'Windows', null, null],
    'windows-tablet-pc': [null, 'Windows', null, null],
  };
  deviceTemplates.forEach((item, index) => {
    const label = `${deviceTemplateLabel}:${index + 1}`;
    validate(validators.device, item, label, limits);
    const expected = pendingDeviceDefaults[item.deviceClass];
    const unknownClaims = [item.osVersion, item.browserVersion, item.viewportCss, item.devicePixelRatio, item.drawingBufferPx, item.ramGiB, item.gpu, item.freeStorageBytes];
    const neutralPower = item.power.source === 'unknown' && item.power.chargePercent === null && item.power.lowPowerMode === null && item.power.thermalCondition === 'unknown';
    if (item.status !== 'pending' || item.environmentId !== null || expected === undefined
      || item.deviceModel !== expected[0] || item.osName !== expected[1] || item.browserName !== expected[2] || item.launchMode !== expected[3]
      || unknownClaims.some((value) => value !== null) || !neutralPower || item.notes.length !== 0) {
      fail('E_TEMPLATE', `${label} must contain only approved static device defaults and neutral pending fields`);
    }
    privacy(item, label);
  });
  const classes = deviceTemplates.map((item) => item.deviceClass).sort();
  if (deviceTemplates.length !== 3 || JSON.stringify(classes) !== JSON.stringify(['iphone-14-pro', 'windows-desktop', 'windows-tablet-pc'])) fail('E_TEMPLATE', `${deviceTemplateLabel} differs from the approved device matrix`);

  const runTemplateLabel = 'evidence/g0/templates/run-record.template.json';
  const runTemplate = await readJson(resolve(evidenceRoot, 'templates', 'run-record.template.json'), runTemplateLabel, limits.jsonBytes, budget);
  validate(validators.run, runTemplate, runTemplateLabel, limits); privacy(runTemplate, runTemplateLabel);
  if (runTemplate.status !== 'pending' || runTemplate.completion !== 'pending' || runTemplate.v1GsSupport !== 'unsupported' || runTemplate.provisionalThresholds?.approvalState !== 'unapproved' || Object.values(runTemplate.provisionalThresholds?.observations ?? {}).some((value) => value !== 'not-evaluated')) fail('E_TEMPLATE', `${runTemplateLabel} contains non-pending or fabricated evidence`);
  const pendingClaims = [runTemplate.runId, runTemplate.environmentId, runTemplate.deviceClass, runTemplate.startedAtUtc, runTemplate.artifactManifestId,
    ...Object.values(runTemplate.build), ...Object.values(runTemplate.fixture), ...Object.values(runTemplate.traceRef)];
  if (pendingClaims.some((value) => value !== null)) fail('E_TEMPLATE', `${runTemplateLabel} must not contain IDs or measured build, fixture, or trace claims`);
  if (Object.values(runTemplate.conditions).some((value) => value !== null) || !neutralPendingMetric(runTemplate.metrics) || runTemplate.notes.length !== 0) {
    fail('E_TEMPLATE', `${runTemplateLabel} must contain only neutral pending conditions, metrics, and notes`);
  }

  const manifestTemplateLabel = 'evidence/g0/templates/external-artifact-manifest.template.json';
  const manifestTemplate = await readJson(resolve(evidenceRoot, 'templates', 'external-artifact-manifest.template.json'), manifestTemplateLabel, limits.jsonBytes, budget);
  validate(validators.manifest, manifestTemplate, manifestTemplateLabel, limits); privacy(manifestTemplate, manifestTemplateLabel);
  if (manifestTemplate.status !== 'pending' || manifestTemplate.manifestId !== null || manifestTemplate.runId !== null || manifestTemplate.artifacts.length !== 0) fail('E_TEMPLATE', `${manifestTemplateLabel} contains fabricated evidence`);

  const registry = await readJson(resolve(root, 'fixtures', 'registry.json'), 'fixtures/registry.json', limits.jsonBytes, budget);
  validate(validators.registry, registry, 'fixtures/registry.json', limits, 'E_FIXTURE'); privacy(registry, 'fixtures/registry.json');
  const devices = await records(evidenceRoot, 'devices', validators.device, limits, budget);
  const manifests = await records(evidenceRoot, 'manifests', validators.manifest, limits, budget);
  const runs = await records(evidenceRoot, 'runs', validators.run, limits, budget);

  const fixtureById = unique(registry.fixtures, (item) => item.id, 'fixture');
  const deviceById = unique(devices, (item) => item.environmentId, 'environment');
  const manifestById = unique(manifests, (item) => item.manifestId, 'manifest');
  const runById = unique(runs, (item) => item.runId, 'run');
  unique(manifests.flatMap((item) => item.artifacts), (item) => item.artifactId, 'artifact');

  const traceById = new Map();
  for (const run of runs) {
    const trace = run.traceRef;
    if (trace.traceId === null) continue;
    const signature = JSON.stringify([trace.sha256, trace.bytes, trace.version, trace.sourceLocation, trace.restoreLocator]);
    const previous = traceById.get(trace.traceId);
    if (previous !== undefined && previous !== signature) fail('E_DUPLICATE_ID', `trace ID ${trace.traceId} has divergent identity fields`);
    traceById.set(trace.traceId, signature);
  }

  const recordedManifestByRun = new Map();
  for (const manifest of manifests.filter((item) => item.status === 'recorded')) {
    if (recordedManifestByRun.has(manifest.runId)) fail('E_DUPLICATE_ID', `run ${manifest.runId} has multiple recorded manifests`);
    recordedManifestByRun.set(manifest.runId, manifest);
    const run = runById.get(manifest.runId);
    if (run === undefined || run.artifactManifestId !== manifest.manifestId) fail('E_MANIFEST', `manifest ${manifest.manifestId} is not referenced by its run`);
  }
  for (const run of runs.filter((item) => item.artifactManifestId !== null)) {
    const manifest = manifestById.get(run.artifactManifestId);
    if (manifest === undefined || manifest.status !== 'recorded' || manifest.runId !== run.runId) fail('E_MANIFEST', `run ${run.runId} manifest does not resolve to the same run`);
  }

  const commits = new Set();
  const sourceBudget = new SourceBudget(limits.totalSourceBytes);
  for (const run of runs.filter((item) => item.completion === 'complete')) {
    const device = deviceById.get(run.environmentId);
    if (device === undefined || device.status !== 'measured' || device.deviceClass !== run.deviceClass || device.launchMode !== run.conditions.launchMode || device.devicePixelRatio !== run.conditions.devicePixelRatio || !sameSize(device.viewportCss, run.conditions.viewportCss) || !sameSize(device.drawingBufferPx, run.conditions.drawingBufferPx)) fail('E_ENVIRONMENT', `run ${run.runId} does not match its measured environment`);
    const fixture = fixtureById.get(run.fixture.fixtureId);
    if (fixture === undefined) fail('E_FIXTURE', `run ${run.runId} fixture is not registered`);
    const drawableFixture = (fixture.classification === 'mesh' && fixture.geometry.triangleCount > 0)
      || (fixture.classification === 'ordinary-point-cloud' && fixture.geometry.ordinaryPointCount > 0);
    if (!drawableFixture || fixture.geometry.splatCount !== 0) fail('E_FIXTURE', `run ${run.runId} fixture is not drawable by the v1 evidence target`);
    const storageContract = fixture.storage.tier === 'git'
      ? fixture.restore.method === 'repository' && ['pinned-output-only', 'byte-reproducible'].includes(fixture.provenance.reproducibility)
      : fixture.storage.tier === 'generated'
        ? fixture.restore.method === 'generate' && fixture.provenance.reproducibility === 'byte-reproducible'
        : fixture.restore.method === 'external' && fixture.provenance.reproducibility === 'external-restore';
    if (!storageContract) fail('E_FIXTURE', `run ${run.runId} fixture storage and restore contract do not agree`);
    const fixtureExpected = { sha256: fixture.sha256, sourceBytes: fixture.byteSize, format: fixture.mediaType, sourceLocation: fixture.storage.tier, triangles: fixture.geometry.triangleCount, ordinaryPoints: fixture.geometry.ordinaryPointCount, splats: fixture.geometry.splatCount };
    for (const [field, expected] of Object.entries(fixtureExpected)) if (run.fixture[field] !== expected) fail('E_FIXTURE', `run ${run.runId} fixture ${field} differs from the registry`);
    let manifest;
    if (run.artifactManifestId !== null) {
      manifest = manifestById.get(run.artifactManifestId);
      if (manifest === undefined || manifest.status !== 'recorded' || manifest.runId !== run.runId) fail('E_MANIFEST', `run ${run.runId} manifest does not resolve to the same run`);
    }

    await verifyGit({ root, commit: run.build.gitCommit, locator: 'package-lock.json', sha256: run.build.packageLockSha256, label: `run ${run.runId} package lock`, code: 'E_BUILD', commitCache: commits, sourceBudget, maximum: limits.gitMetadataBytes, timeoutMs: limits.gitTimeoutMs });
    if (fixture.storage.tier === 'git') await verifyGit({ root, commit: run.build.gitCommit, locator: fixture.storage.path, bytes: fixture.byteSize, sha256: fixture.sha256, label: `run ${run.runId} fixture`, code: 'E_FIXTURE', commitCache: commits, sourceBudget, maximum: limits.gitBlobBytes, timeoutMs: limits.gitTimeoutMs });
    else if (fixture.storage.tier === 'generated') await verifyGenerated({ root, locator: fixture.storage.path, bytes: fixture.byteSize, sha256: fixture.sha256, label: `run ${run.runId} fixture`, code: 'E_FIXTURE', sourceBudget, allowedPrefix: '.artifacts/fixtures/' });
    else { const found = artifact(manifest, 'large-fixture', fixture.sha256, fixture.byteSize); if (found === undefined || found.storageLocator !== fixture.storage.path) fail('E_FIXTURE', `run ${run.runId} fixture does not resolve through its manifest`); }

    const trace = run.traceRef;
    if (trace.sourceLocation === 'git') await verifyGit({ root, commit: run.build.gitCommit, locator: trace.restoreLocator, bytes: trace.bytes, sha256: trace.sha256, label: `run ${run.runId} trace`, code: 'E_TRACE', commitCache: commits, sourceBudget, maximum: limits.gitBlobBytes, timeoutMs: limits.gitTimeoutMs });
    else if (trace.sourceLocation === 'generated') fail('E_TRACE', `run ${run.runId} generated trace has no durable recipe contract`);
    else { const found = artifact(manifest, 'camera-input-trace', trace.sha256, trace.bytes); if (found === undefined || found.storageLocator !== trace.restoreLocator) fail('E_TRACE', `run ${run.runId} trace does not resolve through its manifest`); }
  }
  return { pendingDeviceTemplates: deviceTemplates.length, runRecords: runs.length, environmentRecords: devices.length, artifactManifests: manifests.length };
}

function parseArgs(args) {
  if (args.length === 0) return { root: moduleRoot };
  if (args.length === 2 && args[0] === '--root' && args[1] !== '') return { root: args[1] };
  if (args.length === 1 && args[0].startsWith('--root=') && args[0].length > 7) return { root: args[0].slice(7) };
  fail('E_USAGE', 'Usage: node scripts/verify-g0-evidence.mjs [--root <repository-root>]');
}
async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.code}: ${error.message}\n`); process.exitCode = 2; return; }
  try {
    const result = await verifyG0Evidence(options);
    process.stdout.write(`G0 evidence verified: ${result.pendingDeviceTemplates} pending device templates, ${result.runRecords} run records, ${result.environmentRecords} environment records, ${result.artifactManifests} artifact manifests\n`);
  } catch (error) {
    if (error instanceof EvidenceVerificationError) process.stderr.write(`${error.code}: ${error.message}\n`);
    else process.stderr.write('E_INTERNAL: G0 evidence verification failed unexpectedly\n');
    process.exitCode = error?.code === 'E_USAGE' ? 2 : 1;
  }
}
const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invoked === import.meta.url) await main();
