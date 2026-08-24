import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error The fixture verifier is a checked ESM script without a declaration file.
import { validateFixtureRegistrySchema, verifyFixtureLicenseBindings, verifyFixturePrivacyBindings } from '../../scripts/fixtures/verify.mjs';

type JsonObject = Record<string, unknown>;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const externalWarning = 'External transport identity requires separate acquisition verification.';
let registry: JsonObject;
let schema: JsonObject;
let validate: ValidateFunction;

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    execFile('git', args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'LociView synthetic fixture test',
        GIT_AUTHOR_EMAIL: 'synthetic-test@invalid.example',
        GIT_COMMITTER_NAME: 'LociView synthetic fixture test',
        GIT_COMMITTER_EMAIL: 'synthetic-test@invalid.example',
      },
    }, (error, _stdout, stderr) => {
      if (error === null) resolveRun();
      else rejectRun(new Error(`git ${args[0]} failed: ${stderr}`));
    });
  });
}

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as JsonObject;
}

function fixtures(value: JsonObject): JsonObject[] {
  return value.fixtures as JsonObject[];
}

function withFixture(fixture: JsonObject): JsonObject {
  const value = structuredClone(registry);
  (value.fixtures as JsonObject[])[0] = fixture;
  return value;
}

function baseFixture(): JsonObject {
  const fixture = fixtures(registry)[0];
  if (fixture === undefined) throw new Error('Fixture registry is empty');
  return structuredClone(fixture);
}

function attribution(overrides: JsonObject = {}): JsonObject {
  return {
    creators: ['Synthetic Test Creator'],
    title: 'Synthetic registry contract fixture',
    creditLine: 'Synthetic Test Creator, CC BY 4.0',
    copyrightNotice: null,
    sourceUrl: 'https://example.com/synthetic-registry-source',
    licenseNotice: null,
    disclaimerNotice: null,
    retainedNotices: [],
    modified: false,
    modificationNotice: 'Unmodified synthetic upstream bytes.',
    ...overrides,
  };
}

function approvedCcByFixture(): JsonObject {
  const fixture = baseFixture();
  Object.assign(fixture.provenance as JsonObject, {
    kind: 'third-party',
    source: 'https://example.invalid/synthetic-registry-source',
  });
  Object.assign(fixture.privacy as JsonObject, { reviewStatus: 'approved' });
  fixture.license = {
    spdx: 'CC-BY-4.0',
    reviewStatus: 'approved',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    licenseText: null,
    attribution: attribution(),
  };
  return fixture;
}

function externalFixture(): JsonObject {
  const fixture = approvedCcByFixture();
  fixture.storage = {
    tier: 'external',
    transport: {
      kind: 'github-release-asset',
      locator: 'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/synthetic-registry-v1.glb',
      retentionPolicy: 'versioned-no-overwrite',
    },
  };
  Object.assign(fixture.provenance as JsonObject, { reproducibility: 'external-restore' });
  Object.assign(fixture.restore as JsonObject, { method: 'external' });
  const expected = fixture.expected as JsonObject;
  expected.warnings = [...(expected.warnings as unknown[]), externalWarning];
  return fixture;
}

function isValid(value: JsonObject): boolean {
  return validate(value) as boolean;
}

beforeAll(async () => {
  [registry, schema] = await Promise.all([
    readJson('fixtures/registry.json'),
    readJson('fixtures/registry.schema.json'),
  ]);
  validate = new Ajv2020({ strict: true }).compile(schema);
});

describe('fixture registry v2 contract', () => {
  it('migrates the current inventory without changing its bytes or gate disposition', () => {
    expect(isValid(registry), JSON.stringify(validate.errors)).toBe(true);
    expect(registry.registryVersion).toBe(2);
    expect(fixtures(registry)).toHaveLength(10);
    expect(fixtures(registry).reduce((sum, fixture) => sum + (fixture.byteSize as number), 0)).toBe(708_867);
    expect(fixtures(registry).every((fixture) => (fixture.storage as JsonObject).tier === 'git')).toBe(true);
    expect(fixtures(registry).every((fixture) => {
      const license = fixture.license as JsonObject;
      return license.spdx === 'NOASSERTION'
        && license.reviewStatus === 'unreviewed'
        && license.licenseUrl === null
        && license.licenseText === null
        && license.attribution === null;
    })).toBe(true);
    expect(fixtures(registry).every((fixture) => (fixture.privacy as JsonObject).reviewStatus === 'unreviewed')).toBe(true);
    expect(fixtures(registry).filter((fixture) => fixture.classification === 'gaussian-splat')).toHaveLength(1);
    expect(() => validateFixtureRegistrySchema(registry, schema)).not.toThrow();
  });

  it('rejects a registry v1 document instead of silently interpreting it as v2', () => {
    const value = structuredClone(registry);
    value.registryVersion = 1;
    expect(isValid(value)).toBe(false);
    expect(() => validateFixtureRegistrySchema(value, schema)).toThrow(/registryVersion/u);
  });

  it('accepts a complete CC-BY-4.0 review without adopting a project-wide license', () => {
    const value = withFixture(approvedCcByFixture());
    expect(isValid(value), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([
    ['creator', (fixture: JsonObject) => { ((fixture.license as JsonObject).attribution as JsonObject).creators = []; }],
    ['credit line', (fixture: JsonObject) => { ((fixture.license as JsonObject).attribution as JsonObject).creditLine = null; }],
    ['source URL', (fixture: JsonObject) => { ((fixture.license as JsonObject).attribution as JsonObject).sourceUrl = null; }],
    ['modification notice', (fixture: JsonObject) => { ((fixture.license as JsonObject).attribution as JsonObject).modificationNotice = null; }],
    ['canonical license URL', (fixture: JsonObject) => { (fixture.license as JsonObject).licenseUrl = 'https://creativecommons.org/licenses/by/4.0'; }],
  ])('rejects CC-BY-4.0 approval without its %s', (_label, mutate) => {
    const fixture = approvedCcByFixture();
    mutate(fixture);
    expect(isValid(withFixture(fixture))).toBe(false);
  });

  it('distinguishes explicit unavailable upstream facts from omitted review fields', () => {
    const fixture = approvedCcByFixture();
    fixture.license = {
      spdx: 'CC0-1.0',
      reviewStatus: 'approved',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      licenseText: null,
      attribution: attribution({
        creators: [],
        title: null,
        creditLine: null,
        copyrightNotice: null,
        licenseNotice: null,
        disclaimerNotice: null,
        retainedNotices: [],
        modificationNotice: null,
      }),
    };
    expect(isValid(withFixture(fixture)), JSON.stringify(validate.errors)).toBe(true);

    const omitted = structuredClone(fixture);
    Reflect.deleteProperty((omitted.license as JsonObject).attribution as JsonObject, 'copyrightNotice');
    expect(isValid(withFixture(omitted))).toBe(false);
  });

  it('requires a reviewed, substantive anonymization description for an anonymized derivative', () => {
    const fixture = approvedCcByFixture();
    Object.assign(fixture.provenance as JsonObject, { kind: 'anonymized-derived', source: 'private operational source' });
    Object.assign(fixture.privacy as JsonObject, {
      content: 'anonymized-derived',
      reviewStatus: 'approved',
      anonymization: 'not-applicable',
    });
    expect(isValid(withFixture(fixture))).toBe(false);
    expect(() => verifyFixturePrivacyBindings(fixture, 'synthetic')).toThrow(/substantive anonymization record/u);

    (fixture.privacy as JsonObject).anonymization = '                ';
    expect(isValid(withFixture(fixture))).toBe(false);
    expect(() => verifyFixturePrivacyBindings(fixture, 'synthetic')).toThrow(/substantive anonymization record/u);

    (fixture.privacy as JsonObject).anonymization = 'not-applicable                ';
    expect(isValid(withFixture(fixture))).toBe(false);
    expect(() => verifyFixturePrivacyBindings(fixture, 'synthetic')).toThrow(/substantive anonymization record/u);

    (fixture.privacy as JsonObject).anonymization = 'Removed all original text, identifiers, media, and container metadata using an explicit allowlist.';
    expect(isValid(withFixture(fixture)), JSON.stringify(validate.errors)).toBe(true);
    expect(() => verifyFixturePrivacyBindings(fixture, 'synthetic')).not.toThrow();

    const unlicensed = structuredClone(fixture);
    unlicensed.license = baseFixture().license;
    expect(isValid(withFixture(unlicensed))).toBe(false);

    (fixture.privacy as JsonObject).content = 'synthetic';
    expect(isValid(withFixture(fixture))).toBe(false);

    const reverseMismatch = approvedCcByFixture();
    Object.assign(reverseMismatch.provenance as JsonObject, { kind: 'generated' });
    Object.assign(reverseMismatch.privacy as JsonObject, {
      content: 'anonymized-derived',
      reviewStatus: 'approved',
      anonymization: 'Removed all identifiers and rebuilt the public fixture from an explicit allowlist.',
    });
    reverseMismatch.license = baseFixture().license;
    expect(isValid(withFixture(reverseMismatch))).toBe(false);
    expect(() => validateFixtureRegistrySchema(withFixture(reverseMismatch), schema)).toThrow(/registry does not match schema/u);
  });

  it.each([
    ['unreviewed attribution', (fixture: JsonObject) => { fixture.license = { ...(fixture.license as JsonObject), reviewStatus: 'unreviewed', spdx: 'NOASSERTION' }; }],
    ['approved NOASSERTION', (fixture: JsonObject) => { (fixture.license as JsonObject).spdx = 'NOASSERTION'; }],
    ['approved expression containing NOASSERTION', (fixture: JsonObject) => { (fixture.license as JsonObject).spdx = 'MIT OR NOASSERTION'; }],
    ['unsupported or invalid SPDX text', (fixture: JsonObject) => { (fixture.license as JsonObject).spdx = 'totally-not-an-spdx-expression'; }],
    ['approved license without terms', (fixture: JsonObject) => { Object.assign(fixture.license as JsonObject, { licenseUrl: null, licenseText: null }); }],
  ])('rejects a pseudo-review with %s', (_label, mutate) => {
    const fixture = approvedCcByFixture();
    mutate(fixture);
    expect(isValid(withFixture(fixture))).toBe(false);
  });

  it('accepts only an exact versioned fixture-Release transport identity', () => {
    const fixture = externalFixture();
    expect(isValid(withFixture(fixture)), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([
    'http://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/bad.glb',
    'https://github.com/another-owner/LociView/releases/download/fixtures-v1.0.0/bad.glb',
    'https://github.com/ChoRdChario/LociView/releases/latest/download/bad.glb',
    'https://github.com/ChoRdChario/LociView/releases/download/v1.0.0/bad.glb',
    'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/bad.glb?token=secret',
    'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/bad.glb#fragment',
    'https://user:password@github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/bad.glb',
    'https://github.com/ChoRdChario/LociView/releases/download/fixtures-v1.0.0/CON.glb',
  ])('rejects an unsafe, mutable, foreign or non-fixture Release locator: %s', (locator) => {
    const fixture = externalFixture();
    ((fixture.storage as JsonObject).transport as JsonObject).locator = locator;
    expect(isValid(withFixture(fixture))).toBe(false);
  });

  it.each([
    ['restore method', (fixture: JsonObject) => { (fixture.restore as JsonObject).method = 'repository'; }],
    ['restore provenance', (fixture: JsonObject) => { (fixture.provenance as JsonObject).reproducibility = 'pinned-output-only'; }],
    ['approved license', (fixture: JsonObject) => { fixture.license = baseFixture().license; }],
    ['approved privacy review', (fixture: JsonObject) => { (fixture.privacy as JsonObject).reviewStatus = 'unreviewed'; }],
    ['pending-acquisition warning', (fixture: JsonObject) => { (fixture.expected as JsonObject).warnings = []; }],
  ])('rejects an external transport whose %s does not agree', (_label, mutate) => {
    const fixture = externalFixture();
    mutate(fixture);
    expect(isValid(withFixture(fixture))).toBe(false);
  });

  it('binds retained license text to an immutable Git path and SHA-256', async () => {
    const path = 'docs/licensing-and-ownership.md';
    const bytes = await readFile(resolve(repositoryRoot, path));
    const fixture = approvedCcByFixture();
    fixture.license = {
      spdx: 'CC0-1.0',
      reviewStatus: 'approved',
      licenseUrl: null,
      licenseText: { path, sha256: createHash('sha256').update(bytes).digest('hex') },
      attribution: attribution(),
    };
    expect(isValid(withFixture(fixture)), JSON.stringify(validate.errors)).toBe(true);
    await expect(verifyFixtureLicenseBindings(fixture, 'synthetic')).resolves.toBeUndefined();

    ((fixture.license as JsonObject).licenseText as JsonObject).sha256 = '0'.repeat(64);
    await expect(verifyFixtureLicenseBindings(fixture, 'synthetic')).rejects.toThrow(/licenseText SHA-256 mismatch/u);
  });

  it('rejects tracked worktree-only license bytes until the exact blob is indexed', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'lociview-fixture-registry-v2-'));
    try {
      const licensePath = 'license.txt';
      const licenseFile = resolve(temporaryRoot, licensePath);
      await writeFile(licenseFile, 'indexed license text\n', 'utf8');
      await runGit(temporaryRoot, ['init', '--quiet']);
      await runGit(temporaryRoot, ['add', '--', licensePath]);
      await runGit(temporaryRoot, ['commit', '--quiet', '-m', 'record indexed license text']);

      const worktreeBytes = Buffer.from('unstaged replacement license text\n', 'utf8');
      await writeFile(licenseFile, worktreeBytes);
      const fixture = approvedCcByFixture();
      fixture.license = {
        spdx: 'CC0-1.0',
        reviewStatus: 'approved',
        licenseUrl: null,
        licenseText: { path: licensePath, sha256: createHash('sha256').update(worktreeBytes).digest('hex') },
        attribution: attribution(),
      };

      await expect(verifyFixtureLicenseBindings(fixture, 'synthetic', temporaryRoot)).rejects.toThrow(/indexed regular Git blob/u);
      await runGit(temporaryRoot, ['add', '--', licensePath]);
      await expect(verifyFixtureLicenseBindings(fixture, 'synthetic', temporaryRoot)).resolves.toBeUndefined();
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects an unsafe Git license-text path and a non-canonical terms URL outside schema-only checks', async () => {
    const unsafePath = approvedCcByFixture();
    Object.assign(unsafePath.license as JsonObject, {
      spdx: 'CC0-1.0',
      licenseUrl: null,
      licenseText: { path: '../outside.txt', sha256: '0'.repeat(64) },
    });
    await expect(verifyFixtureLicenseBindings(unsafePath, 'synthetic')).rejects.toThrow(/non-portable path segment|normalized relative path/u);

    const gitMetadataPath = '.git/config';
    const gitMetadataBytes = await readFile(resolve(repositoryRoot, gitMetadataPath));
    const untrackedMetadata = approvedCcByFixture();
    Object.assign(untrackedMetadata.license as JsonObject, {
      spdx: 'CC0-1.0',
      licenseUrl: null,
      licenseText: {
        path: gitMetadataPath,
        sha256: createHash('sha256').update(gitMetadataBytes).digest('hex'),
      },
    });
    await expect(verifyFixtureLicenseBindings(untrackedMetadata, 'synthetic')).rejects.toThrow(/tracked regular Git blob/u);

    const queriedUrl = approvedCcByFixture();
    (queriedUrl.license as JsonObject).licenseUrl = 'https://creativecommons.org/licenses/by/4.0/?query=1';
    await expect(verifyFixtureLicenseBindings(queriedUrl, 'synthetic')).rejects.toThrow(/canonical HTTPS URL/u);

    const localTerms = approvedCcByFixture();
    Object.assign(localTerms.license as JsonObject, {
      spdx: 'CC0-1.0',
      licenseUrl: 'https://localhost/terms',
    });
    await expect(verifyFixtureLicenseBindings(localTerms, 'synthetic')).rejects.toThrow(/public terms host/u);

    const mismatchedCc0Terms = approvedCcByFixture();
    Object.assign(mismatchedCc0Terms.license as JsonObject, {
      spdx: 'CC0-1.0',
      licenseUrl: 'https://example.com/not-cc0-terms',
    });
    expect(isValid(withFixture(mismatchedCc0Terms))).toBe(false);
    await expect(verifyFixtureLicenseBindings(mismatchedCc0Terms, 'synthetic')).rejects.toThrow(/canonical CC0-1.0/u);

    const credentialSource = approvedCcByFixture();
    ((credentialSource.license as JsonObject).attribution as JsonObject).sourceUrl = 'https://user:password@example.invalid/source';
    expect(isValid(withFixture(credentialSource))).toBe(false);
    await expect(verifyFixtureLicenseBindings(credentialSource, 'synthetic')).rejects.toThrow(/without user information/u);

    const localSource = approvedCcByFixture();
    ((localSource.license as JsonObject).attribution as JsonObject).sourceUrl = 'https://localhost/source';
    expect(isValid(withFixture(localSource))).toBe(false);
    await expect(verifyFixtureLicenseBindings(localSource, 'synthetic')).rejects.toThrow(/public terms host/u);
  });

  it.each([
    'https://127.0.0.1/source',
    'https://127.1/source',
    'https://[::1]/source',
    'https://fixture.invalid/source',
    'https://fixture.home.arpa/source',
    'https://intranet/source',
  ])('rejects a nonpublic CC-BY source at both schema and runtime boundaries: %s', async (sourceUrl) => {
    const fixture = approvedCcByFixture();
    ((fixture.license as JsonObject).attribution as JsonObject).sourceUrl = sourceUrl;
    expect(isValid(withFixture(fixture))).toBe(false);
    await expect(verifyFixtureLicenseBindings(fixture, 'synthetic')).rejects.toThrow(/public terms host/u);
  });

  it.each([
    'https://example.com:65536/source',
    'https://example.com:99999/source',
  ])('rejects an out-of-range CC-BY source port at both schema and runtime boundaries: %s', async (sourceUrl) => {
    const fixture = approvedCcByFixture();
    ((fixture.license as JsonObject).attribution as JsonObject).sourceUrl = sourceUrl;
    expect(isValid(withFixture(fixture))).toBe(false);
    await expect(verifyFixtureLicenseBindings(fixture, 'synthetic')).rejects.toThrow(/public HTTPS URL/u);
  });

  it('accepts a public CC-BY source with a non-default valid port', async () => {
    const fixture = approvedCcByFixture();
    ((fixture.license as JsonObject).attribution as JsonObject).sourceUrl = 'https://sub.example.co.jp:8443/source?x=1#part';
    expect(isValid(withFixture(fixture)), JSON.stringify(validate.errors)).toBe(true);
    await expect(verifyFixtureLicenseBindings(fixture, 'synthetic')).resolves.toBeUndefined();
  });
});
