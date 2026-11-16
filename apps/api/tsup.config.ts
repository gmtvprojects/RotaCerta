import { defineConfig } from 'tsup';

// Os pacotes de domínio e de contratos são TypeScript puro (sem build); entram no bundle da API.
export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate-cli.ts', 'src/db/seed-cli.ts', 'src/db/create-admin-cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  noExternal: ['@rotacerta/domain', '@rotacerta/contracts'],
});
