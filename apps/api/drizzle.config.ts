import { defineConfig } from 'drizzle-kit';

/** Migrações da plataforma (schema public). As das empresas usam `drizzle.tenant.config.ts`. */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema-platform.ts',
  out: './drizzle',
});
