import { sql } from 'drizzle-orm';
import type { Workspace } from '@rotacerta/domain';
import type { Db } from './client';
import { loadWorkspace, saveWorkspace } from './workspace';

const LOCK_KEY = 7_340_001;

/**
 * Aplica uma regra do domínio de forma atômica: trava, lê o estado, executa `fn`, grava só o que mudou.
 * A trava serializa as escritas, o que mantém as regras do domínio (ids, conferência, aviso único por parada)
 * corretas mesmo com vários dispositivos e várias instâncias da API.
 * `fn` devolve o novo estado ou um erro; em erro nada é gravado.
 */
export type Mutation<R> = (w: Workspace) => { ok: true; workspace: Workspace; result: R } | { ok: false; error: string };

export type Outcome<R> = { ok: true; result: R } | { ok: false; error: string };

export async function mutate<R>(db: Db, fn: Mutation<R>): Promise<Outcome<R>> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
    const before = await loadWorkspace(tx as unknown as Db);
    const out = fn(before);
    if (!out.ok) return out;
    await saveWorkspace(tx as unknown as Db, before, out.workspace);
    return { ok: true as const, result: out.result };
  });
}
