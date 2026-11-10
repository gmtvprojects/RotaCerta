import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  cancelOrder, clientHistory, confirmReturn, editNeighborhood, interruptRoute, mergeClients, reassignDriver, removeClient, removeDriver,
  removeNeighborhood, removeVehicle, removeZone, renameZone, requeueOrder, searchClients, setVehicleActive, updateClient, updateDriver,
  updateOrder, type Cmd, type Role, type TripResult, type Workspace,
} from '@rotacerta/domain';
import type { Ctx } from '../app';
import { schema } from '../db/client';
import { withTenant } from '../db/tenants';
import { readWorkspace } from '../db/unit-of-work';
import * as body from './schemas';

const OFFICE: Role[] = ['gestao', 'atendente', 'expedicao'];
const ATENDIMENTO: Role[] = ['gestao', 'atendente'];
const EXPEDICAO: Role[] = ['gestao', 'expedicao'];
const GESTAO: Role[] = ['gestao'];

type Step<R> = { ok: true; workspace: Workspace; result: R } | { ok: false; error: string };
const next = <R>(w: Workspace, r: Cmd | TripResult, result: R): Step<R> => (r.ok ? { ok: true, workspace: { ...w, data: r.data }, result } : r);

/** Entregas, viagens, clientes e cadastros: correções e ações que fogem do fluxo principal. */
export function registerOperationRoutes({ app, db, run, guard, company }: Ctx) {
  const parse = <T>(schema: ZodType<T>, req: FastifyRequest, reply: FastifyReply): T | undefined => {
    const p = schema.safeParse(req.body ?? {});
    if (p.success) return p.data;
    reply.code(400).send({ error: 'Dados inválidos.', issues: p.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return undefined;
  };
  const num = (req: FastifyRequest, key = 'id') => Number((req.params as Record<string, string>)[key]);
  const str = (req: FastifyRequest, key: string) => (req.params as Record<string, string>)[key];

  /* ---------- entregas ---------- */
  app.patch('/api/orders/:id', { preHandler: guard(OFFICE) }, async (req, reply) => {
    const b = parse(body.orderPatch, req, reply); if (!b) return;
    const id = num(req);
    return run(req, reply, 'orders', (u, clock) => (w) => next(w, updateOrder(w.data, id, b, clock, u.name), null));
  });

  app.post('/api/orders/:id/cancel', { preHandler: guard(OFFICE) }, async (req, reply) => {
    const b = parse(body.reason, req, reply); if (!b) return;
    const id = num(req);
    return run(req, reply, 'orders', (u, clock) => (w) => next(w, cancelOrder(w.data, id, b.reason, clock, u.name), null));
  });

  app.post('/api/orders/:id/return', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const id = num(req);
    return run(req, reply, 'orders', (u, clock) => (w) => next(w, confirmReturn(w.data, id, clock, u.name), null));
  });

  app.post('/api/orders/:id/requeue', { preHandler: guard(OFFICE) }, async (req, reply) => {
    const b = parse(body.requeue, req, reply); if (!b) return;
    const id = num(req);
    return run(req, reply, 'orders', (u, clock) => (w) => next(w, requeueOrder(w.data, id, b, clock, u.name), null));
  });

  /* ---------- viagens ---------- */
  app.post('/api/routes/:id/interrupt', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const b = parse(body.reason, req, reply); if (!b) return;
    const id = num(req);
    return run(req, reply, 'trip', (u, clock) => (w) => next(w, interruptRoute(w.data, id, b.reason, clock, u.name), null));
  });

  app.post('/api/routes/:id/driver', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const b = parse(body.reassign, req, reply); if (!b) return;
    const id = num(req);
    return run(req, reply, 'trip', (u, clock) => (w) => next(w, reassignDriver(w.data, id, b.driverId, clock, u.name), null));
  });

  /* ---------- clientes ---------- */
  app.get('/api/clients', { preHandler: guard(OFFICE) }, async (req) => {
    const q = req.query as { q?: string; limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
    const { data } = await readWorkspace(db, company(req));
    return searchClients(data, q.q ?? '', limit, Math.max(Number(q.offset) || 0, 0));
  });

  app.get('/api/clients/:id', { preHandler: guard(OFFICE) }, async (req, reply) => {
    const id = num(req);
    const { data } = await readWorkspace(db, company(req));
    const client = data.clients.find((c) => c.id === id);
    if (!client) return reply.code(404).send({ error: 'Cliente não encontrado.' });
    return { client, orders: clientHistory(data, id) };
  });

  app.patch('/api/clients/:id', { preHandler: guard(ATENDIMENTO) }, async (req, reply) => {
    const b = parse(body.clientPatch, req, reply); if (!b) return;
    const id = num(req);
    const { applyToOpen, ...patch } = b;
    return run(req, reply, 'clients', (u, clock) => (w) => next(w, updateClient(w.data, id, patch, applyToOpen, clock, u.name), null));
  });

  app.post('/api/clients/:id/merge', { preHandler: guard(ATENDIMENTO) }, async (req, reply) => {
    const b = parse(body.mergeClient, req, reply); if (!b) return;
    const id = num(req);
    return run(req, reply, 'clients', (u, clock) => (w) => next(w, mergeClients(w.data, id, b.mergeId, clock, u.name), null));
  });

  app.delete('/api/clients/:id', { preHandler: guard(ATENDIMENTO) }, async (req, reply) => {
    const id = num(req);
    return run(req, reply, 'clients', () => (w) => next(w, removeClient(w.data, id), null));
  });

  /* ---------- cadastros da loja: editar, desativar e remover (gestão) ---------- */
  app.put('/api/config/zones/:name', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const b = parse(body.zone, req, reply); if (!b) return;
    const name = str(req, 'name');
    return run(req, reply, 'config', () => (w) => next(w, renameZone(w.data, name, b.name), null));
  });
  app.delete('/api/config/zones/:name', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const name = str(req, 'name');
    return run(req, reply, 'config', () => (w) => next(w, removeZone(w.data, name), null));
  });

  app.put('/api/config/neighborhoods/:name', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const b = parse(body.neighborhoodEdit, req, reply); if (!b) return;
    const name = str(req, 'name');
    return run(req, reply, 'config', () => (w) => next(w, editNeighborhood(w.data, name, b.name, b.zone), null));
  });
  app.delete('/api/config/neighborhoods/:name', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const name = str(req, 'name');
    return run(req, reply, 'config', () => (w) => next(w, removeNeighborhood(w.data, name), null));
  });

  app.patch('/api/config/drivers/:id', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const b = parse(body.driverPatch, req, reply); if (!b) return;
    const id = num(req);
    return run(req, reply, 'config', () => (w) => next(w, updateDriver(w.data, id, b), null));
  });
  app.delete('/api/config/drivers/:id', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const id = num(req);
    // um usuário ligado a este cadastro (ou posições gravadas) impede a remoção
    const companyId = company(req);
    const [linked] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.companyId, companyId), eq(schema.users.driverId, id)));
    if (linked) return reply.code(422).send({ error: 'Há um usuário ligado a este motorista. Desative o motorista em vez de remover.' });
    const [located] = await withTenant(db, companyId, (tx) => tx.select({ id: schema.driverLocations.id }).from(schema.driverLocations).where(eq(schema.driverLocations.driverId, id)).limit(1));
    if (located) return reply.code(422).send({ error: 'Este motorista tem histórico de viagens. Desative em vez de remover.' });
    return run(req, reply, 'config', () => (w) => next(w, removeDriver(w.data, id), null));
  });

  app.patch('/api/config/vehicles/:id/active', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const b = parse(body.vehicleActive, req, reply); if (!b) return;
    const id = num(req);
    return run(req, reply, 'config', () => (w) => next(w, setVehicleActive(w.data, id, b.active), null));
  });
  app.delete('/api/config/vehicles/:id', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const id = num(req);
    return run(req, reply, 'config', () => (w) => next(w, removeVehicle(w.data, id), null));
  });

}
