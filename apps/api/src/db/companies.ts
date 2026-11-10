import { eq } from 'drizzle-orm';
import type { Db } from './client';
import * as t from './schema';
import { applyTenantMigrations } from './tenants';

export interface NewCompany { name: string; manager: { name: string; email: string; passwordHash: string } }

/**
 * Cadastra a empresa, cria o schema dela e o primeiro usuário da gestão, de uma vez só: se qualquer passo falhar
 * nada fica gravado (nem empresa sem gestor, nem schema órfão).
 */
export async function createCompanyWithManager(db: Db, input: NewCompany): Promise<{ ok: true; companyId: number; managerId: number } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const q = tx as unknown as Db;
    const email = input.manager.email.toLowerCase();
    const [dup] = await q.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, email));
    if (dup) return { ok: false as const, error: 'Já existe um usuário com este e-mail.' };
    const [company] = await q.insert(t.companies).values({ name: input.name }).returning({ id: t.companies.id });
    await applyTenantMigrations(q, company.id);
    const [manager] = await q.insert(t.users).values({
      // a senha inicial foi escolhida pelo suporte: quem recebe o acesso troca no primeiro login
      companyId: company.id, name: input.manager.name, email, role: 'gestao', passwordHash: input.manager.passwordHash, mustChangePassword: true,
    }).returning({ id: t.users.id });
    return { ok: true as const, companyId: company.id, managerId: manager.id };
  });
}
