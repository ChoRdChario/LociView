import { configDefaults, defineConfig } from 'vitest/config';

const connectedFiles = 'tests/projectFiles.test.ts';
const fixtureCli = 'tests/scripts/**/*.test.ts';
const acquisitionRestore = 'tests/scripts/fixtureAcquisitionRestore.test.ts';
const evidenceCli = 'tests/scripts/g0EvidenceVerifier.test.ts';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'product',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, connectedFiles, fixtureCli],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'connected-files',
          environment: 'node',
          include: [connectedFiles],
          // Full file exchanges keep their deadlines without concurrent suites.
          sequence: { groupOrder: 1 },
        },
      },
      {
        test: {
          name: 'fixture-scripts',
          environment: 'node',
          include: [fixtureCli],
          exclude: [...configDefaults.exclude, acquisitionRestore, evidenceCli],
          sequence: { groupOrder: 2 },
        },
      },
      {
        test: {
          name: 'fixture-restore-cli',
          environment: 'node',
          include: [acquisitionRestore],
          sequence: { groupOrder: 3 },
        },
      },
      {
        test: {
          name: 'evidence-cli',
          environment: 'node',
          include: [evidenceCli],
          // Native/Git-heavy files retain fresh forks and their own deadlines.
          sequence: { groupOrder: 4 },
        },
      },
    ],
  },
});
