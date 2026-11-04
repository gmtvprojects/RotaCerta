import { createSeed, type Role, type Workspace } from '@rotacerta/domain';
import { hashPassword } from '../auth/password';
import type { Db } from './client';
import * as t from './schema';
import { loadWorkspace, saveWorkspace } from './workspace';

const EMPTY: Workspace = {
  data: { clients: [], neighborhoods: [], zones: [], vehicles: [], drivers: [], orders: [], routes: [], notifications: [], departures: [] },
  papers: [],
};

/** Usuários de demonstração: um por perfil; o motorista é ligado ao cadastro de motorista. */
export const DEMO_USERS: { name: string; email: string; role: Role; driverId?: number }[] = [
  { name: 'Gestão', email: 'gestao@rotacerta.local', role: 'gestao' },
  { name: 'Beatriz Alves', email: 'atendente@rotacerta.local', role: 'atendente' },
  { name: 'Expedição', email: 'expedicao@rotacerta.local', role: 'expedicao' },
  { name: 'Carlos Oliveira', email: 'motorista@rotacerta.local', role: 'motorista', driverId: 1 },
];

/** Carrega os dados fictícios do domínio e os usuários de demonstração. Só roda em banco vazio. */
export async function seedDatabase(db: Db, password: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const current = await loadWorkspace(tx as unknown as Db);
    if (current.data.orders.length || current.data.vehicles.length) return false;
    await saveWorkspace(tx as unknown as Db, EMPTY, { data: createSeed(), papers: [] });
    const passwordHash = await hashPassword(password);
    await tx.insert(t.users).values(DEMO_USERS.map((u) => ({ ...u, driverId: u.driverId ?? null, passwordHash }))).onConflictDoNothing();
    return true;
  });
}
