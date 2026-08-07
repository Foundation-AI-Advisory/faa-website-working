import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // The analyzer and the store both touch process-wide state (the pdfium
    // instance, the SQLite handle), so suites run in separate processes.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
  },
});
