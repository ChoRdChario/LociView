import { createHash } from 'node:crypto';
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

type RegistryStorage =
  | { tier: 'git' | 'generated'; path: string }
  | {
      tier: 'external';
      transport: {
        kind: 'github-release-asset';
        locator: string;
        retentionPolicy: 'versioned-no-overwrite';
      };
    };

interface RegistryFixture {
  id: string;
  storage: RegistryStorage;
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

  it('rejects generated GS candidate bytes without an adopted external transport identity', async () => {
    const mutated = structuredClone(registry);
    candidateFixture(mutated).storage = {
      tier: 'generated',
      path: '.artifacts/fixtures/gs/unverified-points.ply',
    };

    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(mutated)).toBe(false);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/require Git or external transport bytes/u);
  });

  it('accepts an external GS candidate while leaving transport acquisition pending and its Git oracle unratified', async () => {
    const mutated = structuredClone(registry);
    const external = structuredClone(candidateFixture(mutated));
    external.id = 'external-gs-candidate-v1';
    external.storage = {
      tier: 'external',
      transport: {
        kind: 'github-release-asset',
        locator: 'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/external-gs-candidate-v1.ply',
        retentionPolicy: 'versioned-no-overwrite',
      },
    };
    external.provenance = {
      kind: 'third-party',
      source: 'https://example.invalid/external-gs-candidate',
      reproducibility: 'external-restore',
    };
    external.license = {
      spdx: 'CC-BY-4.0',
      reviewStatus: 'approved',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      licenseText: null,
      attribution: {
        creators: ['Synthetic Test Creator'],
        title: 'Synthetic external GS candidate',
        creditLine: 'Synthetic Test Creator, CC BY 4.0',
        copyrightNotice: null,
        sourceUrl: 'https://example.com/external-gs-candidate',
        licenseNotice: null,
        disclaimerNotice: null,
        retainedNotices: [],
        modified: false,
        modificationNotice: 'Unmodified upstream bytes.',
      },
    };
    external.privacy = {
      ...(external.privacy as Record<string, unknown>),
      reviewStatus: 'approved',
    };
    external.restore = { method: 'external', instructions: 'Acquire by the separately reviewed fixture acquisition command.' };
    external.expected.warnings = [
      ...external.expected.warnings,
      'External transport identity requires separate acquisition verification.',
    ];
    mutated.fixtures.push(external);

    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(mutated), JSON.stringify(validate.errors)).toBe(true);
    await expect(verifyGsRegistryBindings(mutated)).resolves.toEqual({
      fixtureCount: 2,
      candidateCount: 2,
      ratifiedCount: 0,
    });
  });

  it.each(['specification', 'oracle'] as const)('rejects a %s digest mismatch', async (binding) => {
    const mutated = structuredClone(registry);
    candidateFixture(mutated).semanticContract[binding].sha256 = '0'.repeat(64);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(new RegExp(`semanticContract\\.${binding} SHA-256 mismatch`, 'u'));
  });

  it('rejects repository metadata that is hashed but is not a tracked semantic-contract blob', async () => {
    const mutated = structuredClone(registry);
    const path = '.git/config';
    const bytes = await readFile(resolve(repositoryRoot, path));
    candidateFixture(mutated).semanticContract.specification = {
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };

    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/tracked regular Git blob/u);
  });

  it('requires the semantic specification and oracle to be distinct Git blobs', async () => {
    const mutated = structuredClone(registry);
    const contract = candidateFixture(mutated).semanticContract;
    contract.oracle = structuredClone(contract.specification);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/distinct Git blobs/u);
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

  it('rejects self-asserted ratification under registryVersion 2', async () => {
    const mutated = structuredClone(registry);
    candidateFixture(mutated).semanticContract.status = 'ratified';

    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(mutated)).toBe(false);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/cannot be ratified under registryVersion 2/u);
  });

  it('requires the candidate evidence-boundary warning', async () => {
    const mutated = structuredClone(registry);
    candidateFixture(mutated).expected.warnings = [];

    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(mutated)).toBe(false);
    await expect(verifyGsRegistryBindings(mutated)).rejects.toThrow(/not ratified renderer or device evidence/u);
  });
});
