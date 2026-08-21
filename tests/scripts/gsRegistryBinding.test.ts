import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error The fixture verifier is a checked ESM script without a declaration file.
import { verifyGsRegistryBindings } from '../../scripts/fixtures/verify.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const candidateWarning = 'Candidate semantic contract is not ratified renderer or device evidence.';

interface ContractFile {
  path: string;
  sha256: string;
}

interface SemanticContract {
  status: 'candidate' | 'ratified';
  profileId: string;
  specification: ContractFile;
  oracle: ContractFile;
}

interface RegistryFixture {
  id: string;
  storage: { tier: 'git' | 'generated' | 'external'; path: string };
  byteSize: number;
  sha256: string;
  mediaType: string;
  classification: string;
  geometry: {
    triangleCount: number;
    ordinaryPointCount: number;
    splatCount: number;
    textureCount: number;
    bounds: { min: number[]; max: number[] };
  };
  expected: { classification: string; warnings: string[] };
  semanticContract?: SemanticContract;
  [key: string]: unknown;
}

interface FixtureRegistry {
  $schema: string;
  registryVersion: number;
  fixtures: RegistryFixture[];
}

type CandidateFixture = RegistryFixture & { semanticContract: SemanticContract };

let registry: FixtureRegistry;
let schema: Record<string, unknown>;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function candidateFixture(value: FixtureRegistry): CandidateFixture {
  const fixture = value.fixtures.find((entry) => entry.id === 'g0-gs-ply-f32le-sh3-candidate-v1');
  if (fixture?.semanticContract === undefined) throw new Error('canonical GS candidate fixture is missing');
  return fixture as CandidateFixture;
}

beforeAll(async () => {
  [registry, schema] = await Promise.all([
    readJson<FixtureRegistry>('fixtures/registry.json'),
    readJson<Record<string, unknown>>('fixtures/registry.schema.json'),
  ]);
});

describe('G0 GS registry semantic-contract binding', () => {
  it('validates the candidate schema without treating it as ratified renderer/device evidence', async () => {
    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(registry), JSON.stringify(validate.errors)).toBe(true);
    expect(candidateFixture(registry)).toMatchObject({
      byteSize: 3_573,
      classification: 'gaussian-splat',
      geometry: {
        triangleCount: 0,
        ordinaryPointCount: 0,
        splatCount: 8,
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      },
      expected: { warnings: expect.arrayContaining([candidateWarning]) },
      semanticContract: {
        status: 'candidate',
        profileId: 'lociview-gs-ply-f32le-sh3-1',
      },
    });
    await expect(verifyGsRegistryBindings(registry)).resolves.toEqual({
      fixtureCount: 1,
      candidateCount: 1,
      ratifiedCount: 0,
    });
  });

  it('rejects ordinary point bytes that self-declare as gaussian-splat in registry metadata', async () => {
    const mutated = structuredClone(registry);
    const gs = candidateFixture(mutated);
    const ordinary = mutated.fixtures.find((entry) => entry.id === 'smoke-points-ply-v1');
    if (ordinary === undefined) throw new Error('ordinary PLY fixture is missing');
    gs.storage = structuredClone(ordinary.storage);
    gs.byteSize = ordinary.byteSize;
    gs.sha256 = ordinary.sha256;
    gs.geometry = {
      triangleCount: 0,
      ordinaryPointCount: 0,
      splatCount: ordinary.geometry.ordinaryPointCount,
      textureCount: 0,
      bounds: structuredClone(ordinary.geometry.bounds),
    };

    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/registered GS bytes inspect as ordinary-point-cloud/u);
  });

  it.each(['generated', 'external'] as const)('rejects uninspected %s-tier GS candidate bytes', async (tier) => {
    const mutated = structuredClone(registry);
    candidateFixture(mutated).storage = {
      tier,
      path: tier === 'generated'
        ? '.artifacts/fixtures/gs/unverified-points.ply'
        : 'external/unverified-points.ply',
    };

    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(mutated)).toBe(false);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/require Git-tier bytes for inspection/u);
  });

  it.each(['specification', 'oracle'] as const)('rejects a %s digest mismatch', async (binding) => {
    const mutated = structuredClone(registry);
    candidateFixture(mutated).semanticContract[binding].sha256 = '0'.repeat(64);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(new RegExp(`semanticContract\\.${binding} SHA-256 mismatch`, 'u'));
  });

  it('rejects registry splat counts and bounds that diverge from inspected bytes', async () => {
    const wrongCount = structuredClone(registry);
    candidateFixture(wrongCount).geometry.splatCount = 9;
    await expect(verifyGsRegistryBindings(wrongCount)).rejects.toThrow(/splatCount differs from inspected vertex count/u);

    const wrongBounds = structuredClone(registry);
    candidateFixture(wrongBounds).geometry.bounds.max = [2, 1, 1];
    await expect(verifyGsRegistryBindings(wrongBounds)).rejects.toThrow(/must equal the inspected Gaussian mean bounds/u);
  });

  it('requires every gaussian-splat fixture to carry a semantic contract', async () => {
    const mutated = structuredClone(registry);
    Reflect.deleteProperty(candidateFixture(mutated), 'semanticContract');

    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(mutated)).toBe(false);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/gaussian-splat fixture requires semanticContract/u);
  });

  it('rejects self-asserted ratification under registryVersion 1', async () => {
    const mutated = structuredClone(registry);
    candidateFixture(mutated).semanticContract.status = 'ratified';

    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(mutated)).toBe(false);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/cannot be ratified under registryVersion 1/u);
  });

  it('requires the candidate evidence-boundary warning', async () => {
    const mutated = structuredClone(registry);
    candidateFixture(mutated).expected.warnings = [];

    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(mutated)).toBe(false);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/not ratified renderer or device evidence/u);
  });
});
