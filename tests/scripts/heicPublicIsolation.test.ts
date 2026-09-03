import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { collectHeicIsolationViolations } from '../../scripts/verify-heic-public-isolation.mjs';

const createdRoots: string[] = [];

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'lociview-heic-isolation-'));
  createdRoots.push(root);
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'public'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"dependencies":{}}');
  await writeFile(join(root, 'package-lock.json'), '{"packages":{}}');
  await writeFile(join(root, 'src', 'native-heic.ts'), "export const mime = 'image/heic';\nexport const api = globalThis.VideoDecoder;\n");
  await writeFile(join(root, 'dist', 'app.js'), "const mime='image/heic'; const api=globalThis.VideoDecoder;\n");
  await writeFile(join(root, 'dist', 'unrelated.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  return root;
}

function verify(
  root: string,
  trackedFiles: string[] = [],
  forbiddenSha256?: Map<string, string>,
): string[] {
  return collectHeicIsolationViolations({ root, trackedFiles, forbiddenSha256 });
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('HEIC public-path isolation verifier', () => {
  it('allows browser-native HEIC, WebCodecs and unrelated Wasm', async () => {
    const root = await createWorkspace();
    expect(verify(root)).toEqual([]);
  });

  it('rejects a production import of the local PoC', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'src', 'bad.ts'), "import '../scripts/heic-decoder-poc/web/heic-decoder-client.mjs';\n");
    expect(verify(root).join('\n')).toContain('scripts/heic-decoder-poc');
  });

  it('rejects renamed output that retains a libde265 fingerprint', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'dist', 'codec.bin'), 'renamed output still contains libde265');
    expect(verify(root).join('\n')).toContain('libde265');
  });

  it('rejects a Service Worker reference to the local decoder output', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'dist', 'sw.js'), "precacheAndRoute([{url:'../.artifacts/heic-decoder-poc/site/heic-decoder.wasm'}]);\n");
    expect(verify(root).join('\n')).toContain('.artifacts/heic-decoder-poc');
  });

  it('rejects an unapproved decoder wrapper dependency', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'package.json'), '{"dependencies":{"heic-to":"1.0.0"}}');
    expect(verify(root).join('\n')).toContain('heic-to');
  });

  it('rejects a libde265 import or dependency without rejecting an off flag', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'src', 'bad.ts'), "import decoder from 'libde265-wasm';\nexport default decoder;\n");
    await writeFile(join(root, 'package.json'), '{"dependencies":{"libde265-wasm":"1.0.0"}}');
    const violations = verify(root).join('\n');
    expect(violations).toContain('imports a libde265 component');
    expect(violations).toContain('declares a libde265 dependency');
  });

  it('rejects generated PoC material tracked outside its allowed source directory', async () => {
    const root = await createWorkspace();
    const violations = verify(root, ['scripts/heic-decoder-poc/README.md', 'public/libde265.a']);
    expect(violations.join('\n')).toContain('tracked outside the allowed source directory');
  });

  it('rejects generated decoder output tracked inside the allowed PoC source directory', async () => {
    const root = await createWorkspace();
    const violations = verify(root, ['scripts/heic-decoder-poc/heic-decoder.wasm']);
    expect(violations.join('\n')).toContain('unapproved file is tracked inside the PoC source directory');
  });

  it('detects a known decoder digest even after the artifact is renamed', async () => {
    const root = await createWorkspace();
    const bytes = Buffer.from('synthetic known decoder output');
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(root, 'dist', 'renamed.bin'), bytes);
    const violations = verify(root, [], new Map([[digest, 'synthetic known decoder']]));
    expect(violations.join('\n')).toContain('matches synthetic known decoder');
  });

  it('rejects compressed public artifacts until their staging contents are scanned', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'dist', 'renamed.bin'), gzipSync(Buffer.from('libde265 payload')));
    expect(verify(root).join('\n')).toContain('gzip archive');
  });

  it('rejects Brotli-precompressed public artifacts by their staging path', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'dist', 'codec.wasm.br'), brotliCompressSync(Buffer.from('libde265 payload')));
    expect(verify(root).join('\n')).toContain('compressed or archived');
  });

  it('allows an explicit libde265-off configuration and a generic WebCodecs worker name', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'src', 'codec-config.ts'), "export const cmake = 'WITH_LIBDE265=OFF;WITH_WEBCODECS=ON';\n");
    await writeFile(join(root, 'dist', 'heic-decoder.worker.mjs'), "const flags='WITH_LIBDE265=OFF;WITH_WEBCODECS=ON';self.onmessage=()=>VideoDecoder.isConfigSupported({codec:'hvc1.1.6.L93.B0'});\n");
    await writeFile(join(root, 'dist', 'app.js.map'), JSON.stringify({ sourcesContent: ["const flags='WITH_LIBDE265=OFF';"] }));
    expect(verify(root)).toEqual([]);
  });
});
