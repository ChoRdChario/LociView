import { configDefaults, defineConfig } from 'vitest/config';

const evidenceCli = 'tests/scripts/g0EvidenceVerifier.test.ts';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'product',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, evidenceCli],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'evidence-cli',
          environment: 'node',
          include: [evidenceCli],
          // Git-heavy subprocess checks keep their deadlines without competing
          // with the product suite's hashing and package reconstruction.
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
