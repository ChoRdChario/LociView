import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error The fixture generator is a checked ESM script without a declaration file.
import * as fixtureGenerator from '../../scripts/fixtures/generate-v1-migration-fixtures.mjs';

const {
  CANONICAL_V1_MIGRATION_OUTPUTS,
  readApprovedFixtureSource,
  safeOutputDestination,
  validateApprovedFixtureSource,
  validateCanonicalOutputPaths,
} = fixtureGenerator;

const temporaryRoots: string[] = [];

async function temporaryRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'lociview-v1-fixture-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v1 migration fixture generator filesystem boundary', () => {
  it('accepts only the four canonical output paths and the approved source file', () => {
    const [locimyu, base, branchA, branchB] = CANONICAL_V1_MIGRATION_OUTPUTS;
    const source = {
      locimyu: { output: locimyu },
      native: { outputs: { base, branchA, branchB } },
    };

    expect(validateCanonicalOutputPaths(source)).toEqual(CANONICAL_V1_MIGRATION_OUTPUTS);
    expect(() => validateCanonicalOutputPaths({
      ...source,
      native: { outputs: { ...source.native.outputs, branchB: '../outside.lociview' } },
    })).toThrow(/output paths must be exactly/u);
    expect(validateApprovedFixtureSource('public/samples/tri.glb')).toBe('public/samples/tri.glb');
    expect(() => validateApprovedFixtureSource('fixtures/v1-migration/expected.v1.json')).toThrow(/not an approved fixture source/u);
  });

  it('reads only a regular source through non-link repository parents', async () => {
    const root = await temporaryRepository();
    await mkdir(join(root, 'public', 'samples'), { recursive: true });
    await writeFile(join(root, 'public', 'samples', 'tri.glb'), Uint8Array.of(1, 2, 3));
    await expect(readApprovedFixtureSource('public/samples/tri.glb', 'source', root)).resolves.toEqual(Uint8Array.of(1, 2, 3));

    await rm(join(root, 'public', 'samples'), { recursive: true, force: true });
    await mkdir(join(root, 'real-samples'));
    await writeFile(join(root, 'real-samples', 'tri.glb'), Uint8Array.of(4, 5, 6));
    await symlink(join(root, 'real-samples'), join(root, 'public', 'samples'), 'junction');

    await expect(readApprovedFixtureSource('public/samples/tri.glb', 'source', root)).rejects.toThrow(/parent must be a directory and not a link/u);
  });

  it('rejects a linked output parent before returning a write destination', async () => {
    const root = await temporaryRepository();
    const output = CANONICAL_V1_MIGRATION_OUTPUTS[0];
    await mkdir(join(root, 'fixtures', 'v1-migration'), { recursive: true });
    await writeFile(resolve(root, output), Uint8Array.of(1));
    await expect(safeOutputDestination(output, 'output', root)).resolves.toBe(resolve(root, output));

    await rm(join(root, 'fixtures', 'v1-migration'), { recursive: true, force: true });
    await mkdir(join(root, 'real-output'));
    await symlink(join(root, 'real-output'), join(root, 'fixtures', 'v1-migration'), 'junction');

    await expect(safeOutputDestination(output, 'output', root)).rejects.toThrow(/parent must be a directory and not a link/u);
  });
});
