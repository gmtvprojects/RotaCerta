import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // no Postgres real, criar e apagar um banco por teste leva alguns segundos
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
