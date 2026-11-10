import { defineConfig } from 'drizzle-kit';

/** Migrações aplicadas a cada empresa (um schema por empresa). Gerar com `pnpm db:generate:tenant`. */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema-tenant.ts',
  out: './drizzle-tenant',
});
