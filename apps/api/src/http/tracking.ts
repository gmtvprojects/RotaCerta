import { and, asc, desc, eq, gte } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { nextStop, routeOrders, type Role } from '@rotacerta/domain';
import type { Ctx } from '../app';
import { schema } from '../db/client';
import { loadWorkspace } from '../db/workspace';
import { MAX_AGE_MS, MAX_FUTURE_MS } from '../tracking';
import * as body from './schemas';

const MONITORS: Role[] = ['gestao', 'expedicao'];

type Row = typeof schema.driverLocations.$inferSelect;
const dto = (r: Row) => ({ lat: r.lat, lng: r.lng, accuracy: r.accuracy, speed: r.speed, heading: r.heading, recordedAt: r.recordedAt.toISOString() });

export function registerTrackingRoutes({ app, db, guard, events }: Ctx) {
  /**
   * O app do motorista envia pontos (um ou vários, se ficou sem sinal). Só vale para a viagem ATIVA do próprio
   * motorista: ninguém envia posição de outra rota, e fora da viagem nada é coletado.
   */
  app.post('/api/routes/:id/locations', { preHandler: guard(['motorista']), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const p = body.locations.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'Posição inválida.', issues: p.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    const routeId = Number((req.params as { id: string }).id);
    const [route] = await db.select().from(schema.routes).where(eq(schema.routes.id, routeId));
    if (!route || route.driverId !== req.user.driverId) return reply.code(403).send({ error: 'Esta rota não é sua.' });
    if (route.status !== 'active') return reply.code(422).send({ error: 'A localização só é enviada durante a viagem.' });

    const now = Date.now();
    const valid = p.data.points
      .map((pt) => ({ ...pt, at: new Date(pt.recordedAt) }))
      .filter((pt) => pt.at.getTime() <= now + MAX_FUTURE_MS && pt.at.getTime() >= now - MAX_AGE_MS);
    if (!valid.length) return { accepted: 0, ignored: p.data.points.length };

    const inserted = await db.insert(schema.driverLocations).values(valid.map((pt) => ({
      routeId, driverId: route.driverId!, lat: pt.lat, lng: pt.lng, accuracy: pt.accuracy ?? null,
      speed: pt.speed ?? null, heading: pt.heading ?? null, recordedAt: pt.at,
    }))).onConflictDoNothing().returning({ id: schema.driverLocations.id });

    // avisa o painel só com o ponto mais recente do lote
    const latest = valid.reduce((a, b) => (b.at > a.at ? b : a));
    if (inserted.length) {
      events.publish({
        type: 'location', routeId, driverId: route.driverId!, lat: latest.lat, lng: latest.lng,
        accuracy: latest.accuracy ?? null, speed: latest.speed ?? null, heading: latest.heading ?? null, recordedAt: latest.at.toISOString(),
      });
    }
    return { accepted: inserted.length, ignored: p.data.points.length - inserted.length };
  });

  /** Painel ao vivo: cada viagem ativa com a última posição, a parada atual e o andamento. */
  app.get('/api/tracking', { preHandler: guard(MONITORS) }, async () => {
    const { data } = await loadWorkspace(db);
    const active = data.routes.filter((r) => r.status === 'active');
    return Promise.all(active.map(async (r) => {
      const [last] = await db.select().from(schema.driverLocations).where(eq(schema.driverLocations.routeId, r.id)).orderBy(desc(schema.driverLocations.recordedAt)).limit(1);
      const orders = routeOrders(data, r);
      const current = nextStop(data, r);
      return {
        routeId: r.id,
        vehicle: data.vehicles.find((v) => v.id === r.vehicleId)?.name ?? null,
        driverId: r.driverId,
        driverName: data.drivers.find((d) => d.id === r.driverId)?.name ?? null,
        departure: r.departure,
        stops: orders.length,
        done: orders.filter((o) => o.status === 'delivered' || o.status === 'failed').length,
        current: current ? { orderId: current.id, name: current.name, neighborhood: current.neighborhood, street: current.street, number: current.number } : null,
        last: last ? { ...dto(last), ageSeconds: Math.max(0, Math.round((Date.now() - last.recordedAt.getTime()) / 1000)) } : null,
      };
    }));
  });

  /** Percurso já feito (para desenhar a trilha). `since` limita ao que mudou; `limit` evita respostas enormes. */
  app.get('/api/routes/:id/track', { preHandler: guard(MONITORS) }, async (req) => {
    const routeId = Number((req.params as { id: string }).id);
    const q = req.query as { since?: string; limit?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 1000, 1), 5000);
    const since = q.since && !Number.isNaN(Date.parse(q.since)) ? new Date(q.since) : null;
    const rows = await db.select().from(schema.driverLocations)
      .where(and(eq(schema.driverLocations.routeId, routeId), since ? gte(schema.driverLocations.recordedAt, since) : undefined))
      .orderBy(asc(schema.driverLocations.recordedAt)).limit(limit);
    return rows.map(dto);
  });
}
