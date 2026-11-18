import { failNotice, settleNotice } from '@rotacerta/domain';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import { mutate, readWorkspace } from '../db/unit-of-work';
import type { EventBus } from '../realtime/events';
import type { NotificationSender } from './sender';

interface Log { info: (m: string) => void; error: (o: unknown, m: string) => void }

/** Número fixo da trava consultiva do despachante: só uma instância da API envia por vez. */
const DISPATCH_LOCK = 7_340_001;
/** Avisos por empresa em cada rodada: evita monopolizar o provedor e o banco. */
const BATCH = 20;

/**
 * Envia os avisos que estão na fila (`queued`) de todas as empresas ativas.
 * - A trava consultiva garante um único despachante com várias réplicas.
 * - O envio acontece fora da transação da empresa (o provedor pode demorar); depois o resultado é gravado.
 * - Falhas viram `failed` com o motivo; a gestão reenvia pela tela de notificações.
 */
export async function dispatchQueued(db: Db, sender: NotificationSender, events: EventBus, log: Log): Promise<number> {
  let sent = 0;
  await db.transaction(async (tx) => {
    const lock = (await tx.execute(sql`select pg_try_advisory_xact_lock(${DISPATCH_LOCK}) as ok`)) as unknown as { rows: Array<{ ok: boolean }> };
    if (!lock.rows[0]?.ok) return;
    const companies = await tx.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.active, true));
    for (const { id: companyId } of companies) {
      const queued = (await readWorkspace(tx as Db, companyId)).data.notifications.filter((n) => n.status === 'queued').slice(0, BATCH);
      for (const notice of queued) {
        const result = await sender.send(notice).catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : 'Falha no envio.' }));
        await mutate(tx as Db, companyId, (w) => ({
          ok: true, result: null,
          workspace: { ...w, data: result.ok ? settleNotice(w.data, notice.id) : failNotice(w.data, notice.id, result.reason) },
        }));
        sent++;
      }
      if (queued.length) events.publish({ type: 'changed', companyId, scope: 'notifications', at: new Date().toISOString() });
    }
  });
  if (sent) log.info(`avisos enviados: ${sent}`);
  return sent;
}

/** Roda o despachante a cada `everyMs`. Devolve a função que o interrompe. */
export function scheduleDispatcher(db: Db, sender: NotificationSender, events: EventBus, log: Log, everyMs = 5_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    dispatchQueued(db, sender, events, log).catch((e) => log.error(e, 'falha ao despachar avisos')).finally(() => { running = false; });
  };
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
