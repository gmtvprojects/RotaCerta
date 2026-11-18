import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { ORDER_STATUS_LABELS, nextStop, routeOrders, type Role } from '@rotacerta/domain';
import type { Ctx } from '../app';
import { schema } from '../db/client';
import { withTenant } from '../db/tenants';
import { loadWorkspace } from '../db/workspace';

/** Validade do link enviado ao cliente: cobre a entrega mesmo se ela for para o dia seguinte. */
const LINK_DAYS = 3;
const STAFF: Role[] = ['gestao', 'atendente', 'expedicao'];

const b64 = (s: string) => Buffer.from(s).toString('base64url');

/**
 * Link de rastreio para o cliente, sem login: `<empresa>.<entrega>.<validade>` + assinatura HMAC.
 * A chave é derivada do JWT_SECRET com um rótulo próprio (um link nunca vale como token de sessão e vice-versa).
 */
export function trackingSigner(jwtSecret: string) {
  const key = createHash('sha256').update(`${jwtSecret}:rastreio-cliente:v1`).digest();
  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest('base64url');
  return {
    create(companyId: number, orderId: number, now = Date.now()) {
      const exp = Math.floor(now / 1000) + LINK_DAYS * 86_400;
      const payload = b64(`${companyId}.${orderId}.${exp}`);
      return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
    },
    verify(token: string, now = Date.now()): { companyId: number; orderId: number } | 'expired' | null {
      const [payload, sig] = token.split('.');
      if (!payload || !sig || payload.length > 200) return null;
      const expected = Buffer.from(sign(payload));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      const [c, o, exp] = Buffer.from(payload, 'base64url').toString().split('.').map(Number);
      if (![c, o, exp].every(Number.isInteger)) return null;
      if (exp * 1000 < now) return 'expired';
      return { companyId: c, orderId: o };
    },
  };
}

const STEPS = ['Compra registrada', 'Separando os volumes', 'A caminho', 'Entregue'] as const;
const stepOf = (status: string): number => {
  if (status === 'delivered') return 3;
  if (status === 'onroute') return 2;
  if (['ready', 'queued', 'loading', 'released'].includes(status)) return 1;
  return 0;
};

export function registerPublicTrackingRoutes({ app, db, guard, company, config }: Ctx) {
  const signer = trackingSigner(config.JWT_SECRET);

  /** A equipe gera o link para mandar ao cliente (WhatsApp, SMS). */
  app.post('/api/orders/:id/tracking-link', { preHandler: guard(STAFF) }, async (req, reply) => {
    const orderId = Number((req.params as { id: string }).id);
    const companyId = company(req);
    const [order] = await withTenant(db, companyId, (tx) => tx.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.id, orderId)));
    if (!order) return reply.code(404).send({ error: 'Entrega não encontrada.' });
    return signer.create(companyId, orderId);
  });

  /**
   * Página pública do cliente. Mostra só o necessário: situação, janela, quantas entregas antes da dele e, apenas quando
   * o motorista está indo para ELE (parada atual), a posição ao vivo. Nada de endereço, telefone ou outros clientes.
   */
  app.get('/api/public/tracking/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const v = signer.verify((req.params as { token: string }).token);
    if (v === 'expired') return reply.code(410).send({ error: 'Este link de acompanhamento expirou.' });
    if (!v) return reply.code(404).send({ error: 'Link de acompanhamento inválido.' });

    const [companyRow] = await db.select().from(schema.companies).where(eq(schema.companies.id, v.companyId));
    if (!companyRow?.active) return reply.code(404).send({ error: 'Link de acompanhamento inválido.' });

    return withTenant(db, v.companyId, async (tx) => {
      const { data } = await loadWorkspace(tx);
      const o = data.orders.find((x) => x.id === v.orderId);
      if (!o) return reply.code(404).send({ error: 'Link de acompanhamento inválido.' });
      const route = o.routeId != null ? data.routes.find((r) => r.id === o.routeId) : undefined;
      const active = route?.status === 'active' && o.status === 'onroute';
      const current = active && route ? nextStop(data, route) : null;
      const isNext = !!current && current.id === o.id;
      let before: number | null = null;
      if (active && route) {
        const pending = routeOrders(data, route).filter((x) => x.status === 'onroute');
        const idx = pending.findIndex((x) => x.id === o.id);
        before = idx >= 0 ? idx : null;
      }
      let position = null;
      if (isNext && route) {
        const [last] = await tx.select().from(schema.driverLocations).where(eq(schema.driverLocations.routeId, route.id)).orderBy(desc(schema.driverLocations.recordedAt)).limit(1);
        if (last) position = { lat: last.lat, lng: last.lng, heading: last.heading, ageSeconds: Math.max(0, Math.round((Date.now() - last.recordedAt.getTime()) / 1000)) };
      }
      const driver = route ? data.drivers.find((d) => d.id === route.driverId)?.name.split(' ')[0] ?? null : null;
      return {
        company: companyRow.name,
        order: o.id,
        customer: o.name.split(' ')[0],
        status: o.status,
        statusLabel: ORDER_STATUS_LABELS[o.status],
        window: o.window,
        neighborhood: o.neighborhood,
        steps: STEPS,
        step: stepOf(o.status),
        failed: o.status === 'failed' || o.status === 'cancelled',
        driver: active ? driver : null,
        stopsBefore: before,
        isNext,
        position,
        completed: o.completed,
        refreshSeconds: active ? 10 : 60,
      };
    });
  });
}
