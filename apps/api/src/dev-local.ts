import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { buildApp } from './app';
import { schedulePurge } from './tracking';
import { loadConfig } from './config';
import type { Db } from './db/client';
import * as schema from './db/schema';
import { seedDatabase } from './db/seed';
import { migrateAllTenants } from './db/tenants';

/**
 * Desenvolvimento sem Docker: Postgres embutido (PGlite) com os dados em `.pglite/`.
 * Não use em produção. Sobe a API já com migrações e seed de demonstração.
 */
const config = loadConfig({
  JWT_SECRET: 'desenvolvimento-local-desenvolvimento-local', DATABASE_URL: 'pglite', ...process.env,
});

const pg = new PGlite(process.env.PGLITE_DIR ?? './.pglite');
const db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: './drizzle' });
await migrateAllTenants(db as unknown as Db);
const seeded = await seedDatabase(db as unknown as Db, config.SEED_PASSWORD ?? 'rotacerta123');
if (seeded) console.log('Banco novo: empresa e usuários de demonstração criados (senha dos usuários: rotacerta123).');

const app = await buildApp({ config, db: db as unknown as Db });
schedulePurge(db as unknown as Db, config.LOCATION_RETENTION_DAYS, app.log);
await app.listen({ port: config.PORT, host: '0.0.0.0' });
