import { createSeed, type AnyRole, type Workspace } from '@rotacerta/domain';
import { hashPassword } from '../auth/password';
import type { Db } from './client';
import * as t from './schema';
import { createCompanyWithSchema, withTenant } from './tenants';
import { saveWorkspace } from './workspace';

const EMPTY: Workspace = {
  data: { clients: [], neighborhoods: [], zones: [], vehicles: [], drivers: [], orders: [], routes: [], notifications: [], departures: [] },
  papers: [],
};

/** Usuários de demonstração da empresa: um por perfil; o motorista é ligado ao cadastro de motorista. */
export const DEMO_USERS: { name: string; email: string; role: AnyRole; driverId?: number }[] = [
  { name: 'Gestão', email: 'gestao@rotacerta.local', role: 'gestao' },
  { name: 'Beatriz Alves', email: 'atendente@rotacerta.local', role: 'atendente' },
  { name: 'Expedição', email: 'expedicao@rotacerta.local', role: 'expedicao' },
  { name: 'Carlos Oliveira', email: 'motorista@rotacerta.local', role: 'motorista', driverId: 1 },
];

export const DEMO_PLATFORM_USER = { name: 'Plataforma', email: 'plataforma@rotacerta.local', role: 'plataforma' as const };

/**
 * Cria uma empresa de demonstração (dados fictícios do domínio e um usuário por perfil) e o usuário da plataforma.
 * Só roda em banco sem empresas. Devolve o id da empresa criada, ou null se já havia empresas.
 */
export async function seedDatabase(db: Db, password: string, companyName = 'Empresa de demonstração'): Promise<{ companyId: number } | null> {
  const existing = await db.select({ id: t.companies.id }).from(t.companies).limit(1);
  if (existing.length) return null;
  const company = await createCompanyWithSchema(db, companyName);
  await withTenant(db, company.id, (tx) => saveWorkspace(tx, EMPTY, { data: createSeed(), papers: [] }));
  const passwordHash = await hashPassword(password);
  await db.insert(t.users).values([
    ...DEMO_USERS.map((u) => ({ ...u, companyId: company.id, driverId: u.driverId ?? null, passwordHash })),
    { ...DEMO_PLATFORM_USER, companyId: null, passwordHash },
  ]).onConflictDoNothing();
  return { companyId: company.id };
}
