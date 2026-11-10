import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleLite } from 'drizzle-orm/pglite';
import { migrate as migrateLite } from 'drizzle-orm/pglite/migrator';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';

export const PASSWORD = 'senha-de-teste-123';
/** A empresa de demonstração criada pelo seed é sempre a primeira. */
export const COMPANY_ID = 1;

export const testConfig: Config = {
  NODE_ENV: 'test', PORT: 0, DATABASE_URL: 'pglite', JWT_SECRET: 'x'.repeat(40), JWT_EXPIRES_IN: '15m', REFRESH_DAYS: 14, COOKIE_SAMESITE: 'lax', LOGIN_RATE_MAX: 1000, LOCATION_RETENTION_DAYS: 30,
  CORS_ORIGIN: 'http://localhost:5173', APP_TZ: 'America/Sao_Paulo',
};

const cleanups: Array<() => Promise<void>> = [];

/** Encerra as conexões e apaga os bancos de teste criados (só no modo Postgres real). */
export async function closeTestDbs() {
  for (const c of cleanups.splice(0)) await c();
}

/**
 * Banco de teste. Por padrão é um Postgres em memória (PGlite). Com `TEST_DATABASE_URL` aponta para um
 * Postgres real: cada chamada cria um banco novo e o apaga no fim (`pnpm test:pg`).
 */
export async function createTestDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  let db: Db;
  if (url) {
    const name = `rotacerta_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const admin = new pg.Pool({ connectionString: url, max: 1 });
    await admin.query(`create database ${name}`);
    const target = new URL(url);
    target.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: target.toString(), max: 5 });
    cleanups.push(async () => {
      await pool.end();
      await admin.query(`drop database ${name} with (force)`);
      await admin.end();
    });
    const real = drizzle(pool, { schema });
    await migratePg(real, { migrationsFolder: './drizzle' });
    db = real as unknown as Db;
  } else {
    const lite = drizzleLite(new PGlite(), { schema });
    await migrateLite(lite, { migrationsFolder: './drizzle' });
    db = lite as unknown as Db;
  }
  await seedDatabase(db, PASSWORD);
  return db;
}

export async function createTestApp() {
  const db = await createTestDb();
  const app = await buildApp({ config: testConfig, db });
  return { app, db };
}

const tokens = new WeakMap<FastifyInstance, Map<string, { authorization: string }>>();

/** Faz login uma vez por perfil (o login tem limite de tentativas). */
export async function loginAs(app: FastifyInstance, role: 'gestao' | 'atendente' | 'expedicao' | 'motorista' | 'plataforma') {
  const cache = tokens.get(app) ?? new Map();
  tokens.set(app, cache);
  if (cache.has(role)) return cache.get(role)!;
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${role}@rotacerta.local`, password: PASSWORD } });
  const { token } = res.json() as { token: string };
  const header = { authorization: `Bearer ${token}` };
  cache.set(role, header);
  return header;
}
