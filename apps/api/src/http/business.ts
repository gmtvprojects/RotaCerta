import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  addDeparture, addDriver, addNeighborhood, addPaper, addZone, closeStop, confirmOrder, createOrder, createRoute, deletePaper,
  discardRoute, failNotice, importPaper, releaseTrip, removeDeparture, retryNotice, saveBoxes, saveVehicle, settleNotice,
  setChecks, startTrip, syncSignatures, updatePaper, type Cmd, type Dataset, type Role, type TripResult, type Workspace,
} from '@rotacerta/domain';
import type { Ctx } from '../app';
import { mutate } from '../db/unit-of-work';
import { loadWorkspace } from '../db/workspace';
import * as body from './schemas';

const OFFICE: Role[] = ['gestao', 'atendente', 'expedicao'];
const ATENDIMENTO: Role[] = ['gestao', 'atendente'];
const EXPEDICAO: Role[] = ['gestao', 'expedicao'];
const MOTORISTA: Role[] = ['gestao', 'motorista'];
const GESTAO: Role[] = ['gestao'];

type Step<R> = { ok: true; workspace: Workspace; result: R } | { ok: false; error: string };

/** Adapta um comando do domínio (que devolve o novo Dataset) ao formato da unidade de trabalho. */
const next = <R>(w: Workspace, r: Cmd | TripResult, result: R): Step<R> =>
  r.ok ? { ok: true, workspace: { ...w, data: r.data }, result } : r;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function registerBusinessRoutes({ app, db, run, guard, sender, events }: Ctx) {
  /** Valida o corpo da requisição; responde 400 e devolve undefined se estiver inválido. */
  const parse = <T>(schema: ZodType<T>, req: FastifyRequest, reply: FastifyReply): T | undefined => {
    const p = schema.safeParse(req.body ?? {});
    if (p.success) return p.data;
    reply.code(400).send({ error: 'Dados inválidos.', issues: p.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return undefined;
  };
  const id = (req: FastifyRequest, key = 'id') => Number((req.params as Record<string, string>)[key]);

  /* ---------- entregas e volumes ---------- */
  app.post('/api/orders', { preHandler: guard(OFFICE) }, async (req, reply) => {
    const b = parse(body.deliveryForm, req, reply); if (!b) return;
    return run(req, reply, 'orders', (u, clock) => (w) => {
      const r = createOrder(w.data, b, clock, u.name);
      return r.ok ? next(w, r, { orderId: r.orderId }) : r;
    });
  });

  app.put('/api/orders/:id/boxes', { preHandler: guard(OFFICE) }, async (req, reply) => {
    const b = parse(body.saveBoxes, req, reply); if (!b) return;
    const orderId = id(req);
    return run(req, reply, 'orders', (u, clock) => (w) => next(w, saveBoxes(w.data, orderId, b.boxes, b.gas, clock, u.name), null));
  });

  /* ---------- fichas de papel ---------- */
  app.post('/api/papers', { preHandler: guard(ATENDIMENTO) }, async (req, reply) => {
    const b = parse(body.paperCreate, req, reply); if (!b) return;
    const paperId = `P${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    return run(req, reply, 'papers', () => (w) => ({
      ok: true, result: { id: paperId },
      workspace: { ...w, papers: addPaper(w.papers, { sheetNumber: b.sheetNumber, mode: b.mode, photo: b.photo, photoName: b.photoName, values: b.values }, b.status, paperId, new Date().toISOString()) },
    }));
  });

  app.patch('/api/papers/:id', { preHandler: guard(ATENDIMENTO) }, async (req, reply) => {
    const b = parse(body.paperPatch, req, reply); if (!b) return;
    const paperId = (req.params as { id: string }).id;
    return run(req, reply, 'papers', () => (w) => {
      const paper = w.papers.find((p) => p.id === paperId);
      if (!paper) return fail('Ficha não encontrada.');
      if (paper.status === 'imported') return fail('Esta ficha já foi importada.');
      return { ok: true, result: null, workspace: { ...w, papers: updatePaper(w.papers, paperId, { status: b.status, values: b.values }) } };
    });
  });

  app.delete('/api/papers/:id', { preHandler: guard(ATENDIMENTO) }, async (req, reply) => {
    const paperId = (req.params as { id: string }).id;
    return run(req, reply, 'papers', () => (w) => {
      const paper = w.papers.find((p) => p.id === paperId);
      if (!paper) return fail('Ficha não encontrada.');
      if (paper.status === 'imported') return fail('Ficha já importada não pode ser excluída.');
      return { ok: true, result: null, workspace: { ...w, papers: deletePaper(w.papers, paperId) } };
    });
  });

  app.post('/api/papers/:id/import', { preHandler: guard(ATENDIMENTO) }, async (req, reply) => {
    const b = parse(body.paperValues, req, reply); if (!b) return;
    const paperId = (req.params as { id: string }).id;
    return run(req, reply, 'orders', (u, clock) => (w) => {
      const r = importPaper(w, paperId, b, clock, u.name, new Date().toISOString());
      return r.ok ? { ok: true, workspace: r.workspace, result: { orderId: r.orderId } } : r;
    });
  });

  /* ---------- cargas e conferência (expedição) ---------- */
  app.post('/api/routes', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const b = parse(body.createRoute, req, reply); if (!b) return;
    return run(req, reply, 'routes', (u, clock) => (w) => {
      const r = createRoute(w.data, b.orderIds, b.vehicleId, b.departure, b.driverId, clock, u.name);
      return r.ok ? next(w, r, { routeId: r.routeId }) : r;
    });
  });

  app.post('/api/routes/:id/checks', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const b = parse(body.checks, req, reply); if (!b) return;
    const routeId = id(req);
    return run(req, reply, 'routes', (u, clock) => (w) => {
      const r = w.data.routes.find((x) => x.id === routeId);
      if (!r || r.status !== 'loading') return fail('Esta carga não está em conferência.');
      if (b.keys.some((k) => !r.orders.includes(Number(k.split(':')[0])))) return fail('Há volumes que não pertencem a esta carga.');
      return next(w, { ok: true, data: setChecks(w.data, routeId, b.keys, b.value, clock.time, u.name) }, null);
    });
  });

  app.post('/api/routes/:id/sync', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const routeId = id(req);
    return run(req, reply, 'routes', () => (w) => next(w, { ok: true, data: syncSignatures(w.data, routeId) }, null));
  });

  app.post('/api/routes/:id/orders/:orderId/confirm', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const routeId = id(req);
    const orderId = id(req, 'orderId');
    return run(req, reply, 'routes', () => (w) => next(w, confirmOrder(w.data, routeId, orderId), null));
  });

  app.post('/api/routes/:id/release', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const routeId = id(req);
    return run(req, reply, 'routes', (_u, clock) => (w) => next(w, releaseTrip(w.data, routeId, clock.time), null));
  });

  app.delete('/api/routes/:id', { preHandler: guard(EXPEDICAO) }, async (req, reply) => {
    const routeId = id(req);
    return run(req, reply, 'routes', (u, clock) => (w) => next(w, discardRoute(w.data, routeId, clock, u.name), null));
  });

  /* ---------- viagem (motorista) ---------- */
  app.post('/api/routes/:id/start', { preHandler: guard(MOTORISTA) }, async (req, reply) => {
    const b = parse(body.startTrip, req, reply); if (!b) return;
    const routeId = id(req);
    return run(req, reply, 'trip', (u, clock) => (w) => {
      // motorista só inicia como ele mesmo; a gestão pode indicar quem assume
      const driverId = u.role === 'gestao' ? b.driverId : u.driverId;
      if (!driverId) return fail('Informe o motorista.');
      if (!w.data.drivers.some((d) => d.id === driverId)) return fail('Motorista não encontrado.');
      return next(w, startTrip(w.data, routeId, driverId, clock.time), null);
    });
  });

  app.post('/api/orders/:id/stop', { preHandler: guard(MOTORISTA) }, async (req, reply) => {
    const b = parse(body.stop, req, reply); if (!b) return;
    const orderId = id(req);
    return run(req, reply, 'trip', (u, clock) => (w) => {
      if (u.role === 'motorista' && !u.driverId) return fail('Usuário sem cadastro de motorista.');
      const outcome = b.kind === 'delivered' ? b : { kind: 'failed' as const, reason: b.reason, notes: b.notes };
      return next(w, closeStop(w.data, orderId, u.driverId ?? 0, u.role === 'gestao', clock.time, outcome), null);
    });
  });

  /* ---------- notificações ---------- */
  app.post('/api/notifications/:id/retry', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const noticeId = (req.params as { id: string }).id;
    const queued = await run(req, reply, 'notifications', (_u, clock) => (w) => next(w, retryNotice(w.data, noticeId, clock.time), null));
    if (reply.sent) return queued;
    // o envio acontece fora da transação: o provedor pode demorar
    const notice = (await loadWorkspace(db)).data.notifications.find((n) => n.id === noticeId);
    if (!notice) return queued;
    const sent = await sender.send(notice);
    await mutate(db, (w) => ({
      ok: true, result: null,
      workspace: { ...w, data: sent.ok ? settleNotice(w.data, noticeId) : failNotice(w.data, noticeId, sent.reason) },
    }));
    events.publish({ type: 'changed', scope: 'notifications', at: new Date().toISOString() });
    return { ok: true, delivered: sent.ok };
  });

  /* ---------- configurações da loja (gestão) ---------- */
  const config = <T>(path: string, method: 'post' | 'put' | 'delete', schema: ZodType<T>, fn: (d: Dataset, b: T, req: FastifyRequest) => TripResult) => {
    app[method](path, { preHandler: guard(GESTAO) }, async (req, reply) => {
      const b = parse(schema, req, reply); if (!b) return;
      return run(req, reply, 'config', () => (w) => next(w, fn(w.data, b, req), null));
    });
  };
  config('/api/config/zones', 'post', body.zone, (d, b) => addZone(d, b.name));
  config('/api/config/neighborhoods', 'post', body.neighborhood, (d, b) => addNeighborhood(d, b.name, b.zone));
  config('/api/config/vehicles', 'post', body.vehicle, (d, b) => saveVehicle(d, b));
  config('/api/config/vehicles/:id', 'put', body.vehicle, (d, b, req) => saveVehicle(d, { ...b, id: id(req) }));
  config('/api/config/drivers', 'post', body.driver, (d, b) => addDriver(d, b.name));
  config('/api/config/departures', 'post', body.departure, (d, b) => addDeparture(d, b.time));
  config('/api/config/departures/:time', 'delete', body.departure.partial(), (d, _b, req) => removeDeparture(d, (req.params as { time: string }).time));

}
