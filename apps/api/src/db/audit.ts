import type { Db } from './client';
import * as t from './schema';

export interface AuditEntry {
  /** Empresa do usuário; nulo para ações da plataforma e para tentativas de login sem usuário identificado. */
  companyId?: number | null;
  userId?: number | null;
  userName?: string | null;
  action: string;
  target?: string | null;
  status?: number | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Registra sem nunca atrapalhar a operação: falha de auditoria vai para o log, não para o usuário. */
export async function audit(db: Db, entry: AuditEntry, log?: { error: (o: unknown, m: string) => void }): Promise<void> {
  try {
    await db.insert(t.auditLog).values({
      companyId: entry.companyId ?? null, userId: entry.userId ?? null, userName: entry.userName ?? null, action: entry.action,
      target: entry.target ?? null, status: entry.status ?? null, detail: entry.detail ?? null, ip: entry.ip ?? null,
    });
  } catch (err) {
    log?.error(err, 'falha ao gravar a auditoria');
  }
}
