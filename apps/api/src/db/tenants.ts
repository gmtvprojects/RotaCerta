import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import * as t from './schema';

/**
 * Isolamento entre empresas: cada empresa tem um schema próprio do Postgres (`tenant_<id>`) com as tabelas da operação.
 * Toda leitura ou escrita de dados da operação passa por `withTenant` (ou `mutate`), que aponta o `search_path` para o
 * schema da empresa do usuário só durante a transação. Código que esquecer disso não vê tabela nenhuma e falha,
 * em vez de ler dados de outra empresa.
 */

const TENANT_MIGRATIONS = './drizzle-tenant';
const MIGRATE_LOCK = 7_340_002;

export function tenantSchema(companyId: number): string {
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error('Empresa inválida.');
  return `tenant_${companyId}`;
}

/** Aponta a transação atual para o schema da empresa (vale até o fim da transação). */
export const useTenant = (tx: Db, companyId: number) => tx.execute(sql`select set_config('search_path', ${tenantSchema(companyId)}, true)`);

/** Executa `fn` em uma transação cujo schema é o da empresa. */
export async function withTenant<T>(db: Db, companyId: number, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await useTenant(tx as unknown as Db, companyId);
    return fn(tx as unknown as Db);
  });
}

/** Aplica ao schema da empresa as migrações de `./drizzle-tenant` que ainda não rodaram. Deve ser chamada dentro de uma transação. */
export async function applyTenantMigrations(tx: Db, companyId: number, dir = TENANT_MIGRATIONS): Promise<number> {
  const schema = tenantSchema(companyId);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  // duas instâncias da API não migram a mesma empresa ao mesmo tempo
  await tx.execute(sql`select pg_advisory_xact_lock(${MIGRATE_LOCK}::int, ${companyId}::int)`);
  await tx.execute(sql.raw(`create schema if not exists "${schema}"`));
  await useTenant(tx, companyId);
  await tx.execute(sql`create table if not exists _tenant_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set(((await tx.execute(sql`select name from _tenant_migrations`)) as unknown as { rows: { name: string }[] }).rows.map((r) => r.name));
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const text = await readFile(path.join(dir, file), 'utf8');
    // o drizzle-kit qualifica as chaves estrangeiras com "public"; aqui elas devem apontar para o schema da empresa
    for (const statement of text.split('--> statement-breakpoint').map((s) => s.replaceAll('"public".', '').trim()).filter(Boolean)) {
      await tx.execute(sql.raw(statement));
    }
    await tx.execute(sql`insert into _tenant_migrations (name) values (${file})`);
    applied += 1;
  }
  await tx.execute(sql`select set_config('search_path', 'public', true)`);
  return applied;
}

/** Cria a empresa e o schema dela, de forma atômica: se a migração falhar, a empresa não fica registrada. */
export async function createCompanyWithSchema(db: Db, name: string): Promise<{ id: number; name: string }> {
  return db.transaction(async (tx) => {
    const [company] = await (tx as unknown as Db).insert(t.companies).values({ name }).returning();
    await applyTenantMigrations(tx as unknown as Db, company.id);
    return { id: company.id, name: company.name };
  });
}

/** Leva todas as empresas à versão atual do schema. Roda ao subir a API (junto com as migrações da plataforma). */
export async function migrateAllTenants(db: Db, dir = TENANT_MIGRATIONS): Promise<{ companies: number; applied: number }> {
  const list = await db.select({ id: t.companies.id }).from(t.companies).orderBy(t.companies.id);
  let applied = 0;
  for (const c of list) {
    try {
      applied += await db.transaction((tx) => applyTenantMigrations(tx as unknown as Db, c.id, dir));
    } catch (e) {
      throw new Error(`Falha ao migrar a empresa ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { companies: list.length, applied };
}
