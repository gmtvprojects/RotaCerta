import { lt } from 'drizzle-orm';
import type { Db } from './db/client';
import * as t from './db/schema';

/** Janela de aceitação de um ponto: nem do futuro (relógio errado) nem velho demais (lote esquecido). */
export const MAX_FUTURE_MS = 60_000;
export const MAX_AGE_MS = 24 * 3_600_000;

/** Apaga posições antigas. A localização de funcionários é dado pessoal: guardar só pelo tempo necessário. */
export async function purgeLocations(db: Db, retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const removed = await db.delete(t.driverLocations).where(lt(t.driverLocations.recordedAt, cutoff)).returning({ id: t.driverLocations.id });
  return removed.length;
}

/** Agenda a limpeza: ao subir e a cada 6 horas. Devolve a função que cancela. */
export function schedulePurge(db: Db, retentionDays: number, log: { info: (m: string) => void; error: (o: unknown, m: string) => void }): () => void {
  const run = () => purgeLocations(db, retentionDays)
    .then((n) => { if (n) log.info(`posições antigas removidas: ${n}`); })
    .catch((e) => log.error(e, 'falha ao limpar posições antigas'));
  void run();
  const timer = setInterval(run, 6 * 3_600_000);
  timer.unref();
  return () => clearInterval(timer);
}
