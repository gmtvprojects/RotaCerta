import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/** Qualquer driver Postgres do Drizzle (node-postgres em produção, PGlite nos testes). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };
