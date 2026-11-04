import { defineConfig } from 'tsup';

// O pacote de domínio é TypeScript puro (sem build); entra no bundle da API.
export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate-cli.ts', 'src/db/seed-cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  noExternal: ['@rotacerta/domain'],
});
