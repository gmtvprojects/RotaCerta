import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as t from '../db/schema';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
/** Janela em que um token recém-trocado ainda é aceito (corrida entre abas). */
const GRACE_MS = 10_000;
const expiry = (days: number) => new Date(Date.now() + days * 86_400_000);

/** Abre uma sessão nova (login): devolve o token em texto puro, que só existe no cookie do usuário. */
export async function startSession(db: Db, userId: number, days: number, userAgent?: string): Promise<string> {
  const raw = newToken();
  await db.insert(t.refreshTokens).values({ userId, familyId: randomUUID(), tokenHash: sha256(raw), expiresAt: expiry(days), userAgent });
  return raw;
}

export type Rotation =
  | { ok: true; userId: number; token: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'reuse'; userId?: number };

/**
 * Troca um token de renovação por outro (rotação). Cada token vale uma vez:
 * se um token já usado aparecer de novo, alguém o copiou, então toda a cadeia daquele login é revogada.
 */
export async function rotateSession(db: Db, raw: string, days: number, userAgent?: string): Promise<Rotation> {
  const hash = sha256(raw);
  return db.transaction(async (tx) => {
    const claimed = await tx.update(t.refreshTokens).set({ revokedAt: sql`now()`, rotatedAt: sql`now()` })
      .where(and(eq(t.refreshTokens.tokenHash, hash), isNull(t.refreshTokens.revokedAt), sql`${t.refreshTokens.expiresAt} > now()`))
      .returning();
    const row = claimed[0];
    if (!row) {
      const [old] = await tx.select().from(t.refreshTokens).where(eq(t.refreshTokens.tokenHash, hash));
      if (!old) return { ok: false as const, reason: 'invalid' as const };
      // duas abas ou requisições renovando ao mesmo tempo: o token trocado há segundos ainda é aceito, uma vez por tentativa
      if (old.rotatedAt && Date.now() - old.rotatedAt.getTime() < GRACE_MS) {
        const next = newToken();
        await tx.insert(t.refreshTokens).values({ userId: old.userId, familyId: old.familyId, tokenHash: sha256(next), expiresAt: expiry(days), userAgent });
        return { ok: true as const, userId: old.userId, token: next };
      }
      if (old.revokedAt) {
        await tx.update(t.refreshTokens).set({ revokedAt: sql`now()` }).where(and(eq(t.refreshTokens.familyId, old.familyId), isNull(t.refreshTokens.revokedAt)));
        return { ok: false as const, reason: 'reuse' as const, userId: old.userId };
      }
      return { ok: false as const, reason: 'expired' as const, userId: old.userId };
    }
    const next = newToken();
    await tx.insert(t.refreshTokens).values({ userId: row.userId, familyId: row.familyId, tokenHash: sha256(next), expiresAt: expiry(days), userAgent });
    return { ok: true as const, userId: row.userId, token: next };
  });
}

/** Encerra a sessão (logout) deste token e de toda a sua cadeia. */
export async function endSession(db: Db, raw: string): Promise<void> {
  const [row] = await db.select().from(t.refreshTokens).where(eq(t.refreshTokens.tokenHash, sha256(raw)));
  if (!row) return;
  await db.update(t.refreshTokens).set({ revokedAt: sql`now()` }).where(and(eq(t.refreshTokens.familyId, row.familyId), isNull(t.refreshTokens.revokedAt)));
}

/** Derruba todas as sessões de um usuário (senha trocada, usuário desativado). `exceptFamily` preserva a atual. */
export async function revokeAll(db: Db, userId: number, exceptFamily?: string): Promise<void> {
  await db.update(t.refreshTokens).set({ revokedAt: sql`now()` })
    .where(and(eq(t.refreshTokens.userId, userId), isNull(t.refreshTokens.revokedAt), exceptFamily ? ne(t.refreshTokens.familyId, exceptFamily) : undefined));
}
