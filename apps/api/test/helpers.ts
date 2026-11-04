import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';

export const PASSWORD = 'senha-de-teste-123';

export const testConfig: Config = {
  NODE_ENV: 'test', PORT: 0, DATABASE_URL: 'pglite', JWT_SECRET: 'x'.repeat(40), JWT_EXPIRES_IN: '1h',
  CORS_ORIGIN: 'http://localhost:5173', APP_TZ: 'America/Sao_Paulo',
};

export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  await seedDatabase(db as unknown as Db, PASSWORD);
  return db as unknown as Db;
}

export async function createTestApp() {
  const db = await createTestDb();
  const app = await buildApp({ config: testConfig, db });
  return { app, db };
}

const tokens = new WeakMap<FastifyInstance, Map<string, { authorization: string }>>();

/** Faz login uma vez por perfil (o login tem limite de tentativas). */
export async function loginAs(app: FastifyInstance, role: 'gestao' | 'atendente' | 'expedicao' | 'motorista') {
  const cache = tokens.get(app) ?? new Map();
  tokens.set(app, cache);
  if (cache.has(role)) return cache.get(role)!;
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${role}@rotacerta.local`, password: PASSWORD } });
  const { token } = res.json() as { token: string };
  const header = { authorization: `Bearer ${token}` };
  cache.set(role, header);
  return header;
}
