import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { resolve, join, sep, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Fixed prefeature reader, built outside the active tree. No network or install.
const revision = '6c3788e06fa004f4c1f13ba2091f47f183695c2d';
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = resolve(root, '.artifacts/e2e/editor-attribution-old-reader', revision);
const output = join(cache, 'desktop-dist'), marker = join(cache, 'verified-build.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const previous = JSON.parse(await readFile(marker, 'utf8'));
  if (previous.revision !== revision || !previous.files['index.html']) throw Error('Old reader provenance');
  for (const [name, digest] of Object.entries(previous.files)) {
    const path = resolve(output, name); if (!path.startsWith(output + sep)) throw Error('Old reader path');
    if (hash(await readFile(path)) !== digest) throw Error('Old reader digest');
  }
  process.exit(0);
} catch { /* Rebuild the fixed source; do not trust a partial or changed fixture. */ }
const run = (exe, args, cwd = root) => execFileSync(exe, args, { cwd, stdio: 'pipe', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const pinnedLock = run('git', ['show', `${revision}:package-lock.json`]);
if (hash(pinnedLock) !== hash(await readFile(join(root, 'package-lock.json'))))
  throw Error('Fixed old-reader build needs its pinned dependencies; no install was attempted.');
await mkdir(cache, { recursive: true });
const source = join(cache, 'source'), archive = join(cache, 'source.tar'); await mkdir(source, { recursive: true });
run('git', ['archive', '--format=tar', `--output=${archive}`, revision, 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'dev.html', 'src', 'docs/specs/profiles']);
run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xf', archive, '-C', source]);
// The fixture is below the repository: normal ancestor resolution finds the
// already pinned node_modules without installing or creating filesystem links.
// The frozen config reads these three notices relative to itself, rather than
// through module resolution. Copy only those immutable dependency notices.
const notices = join(source, 'node_modules/gaussian-splat-lite'); await mkdir(notices, { recursive: true });
for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_LICENSES.md'])
  await copyFile(join(root, 'node_modules/gaussian-splat-lite', name), join(notices, name));
const vite = join(root, 'node_modules/vite/bin/vite.js');
run(process.execPath, [vite, 'build', '--mode', 'project-scene-desktop', '--outDir', output], source);
const files = {};
const walk = async directory => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (!entry.name.endsWith('.map')) files[relative(output, path).replaceAll('\\', '/')] = hash(await readFile(path));
  }
};
await walk(output); await writeFile(marker, JSON.stringify({ revision, files }, null, 2) + '\n');
