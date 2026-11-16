import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Config } from '../config';
import type { Db } from './client';
import * as schema from './schema';
import { seedDatabase } from './seed';
import { migrateAllTenants } from './tenants';

/** Ambiente de teste sem Postgres externo: banco embutido (PGlite) em `.pglite/`, já migrado e com dados de demonstração. */
export async function openEmbedded(config: Config): Promise<Db> {
  const pg = new PGlite(process.env.PGLITE_DIR ?? './.pglite');
  const db = drizzle(pg, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: './drizzle' });
  await migrateAllTenants(db);
  if (await seedDatabase(db, config.SEED_PASSWORD ?? 'rotacerta123')) {
    console.log(`Ambiente de TESTE: empresa e usuários de demonstração criados (senha: ${config.SEED_PASSWORD}).`);
  }
  return db;
}
