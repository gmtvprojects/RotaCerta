import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client';
import { purgeLocations } from '../src/tracking';
import { closeTestDbs, createTestApp, loginAs } from './helpers';

let app: FastifyInstance;
let db: Db;
beforeAll(async () => { ({ app, db } = await createTestApp()); });
afterAll(async () => { await app.close(); await closeTestDbs(); });

type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST', url: string, headers: Headers, payload?: unknown) =>
  app.inject({ method, url, headers, payload: payload as object });

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
const point = (seconds: number, extra: Record<string, unknown> = {}) => ({ lat: -23.55, lng: -46.63, recordedAt: ago(seconds), ...extra });

// seed: a viagem 1047 está ativa com o motorista 1 (Carlos); a 1048 está liberada, sem viagem iniciada
describe('envio de posições', () => {
  it('só o motorista da viagem ativa envia', async () => {
    const motorista = await loginAs(app, 'motorista');
    expect((await call('POST', '/api/routes/1047/locations', await loginAs(app, 'gestao'), { points: [point(5)] })).statusCode).toBe(403);
    expect((await call('POST', '/api/routes/1047/locations', await loginAs(app, 'expedicao'), { points: [point(5)] })).statusCode).toBe(403);
    // rota que existe mas ainda não saiu: nada é coletado
    const notStarted = await call('POST', '/api/routes/1048/locations', motorista, { points: [point(5)] });
    expect(notStarted.statusCode).toBe(403); // não é dele (sem dono)
    expect((await call('POST', '/api/routes/9999/locations', motorista, { points: [point(5)] })).statusCode).toBe(403);
    expect((await call('POST', '/api/routes/1047/locations', {}, { points: [point(5)] })).statusCode).toBe(401);
  });

  it('aceita em lote, não duplica o que foi reenviado e descarta hora absurda', async () => {
    const motorista = await loginAs(app, 'motorista');
    const batch = { points: [point(30), point(20, { speed: 8.5, heading: 90, accuracy: 12 }), point(10)] };
    expect((await call('POST', '/api/routes/1047/locations', motorista, batch)).json()).toEqual({ accepted: 3, ignored: 0 });
    // aparelho reenviou o mesmo lote (sinal caiu antes da resposta)
    expect((await call('POST', '/api/routes/1047/locations', motorista, batch)).json()).toEqual({ accepted: 0, ignored: 3 });
    const weird = { points: [point(-3600), point(3 * 86_400)] }; // uma hora no futuro, três dias atrás
    expect((await call('POST', '/api/routes/1047/locations', motorista, weird)).json()).toEqual({ accepted: 0, ignored: 2 });
  });

  it('recusa coordenadas e formatos inválidos', async () => {
    const motorista = await loginAs(app, 'motorista');
    for (const bad of [
      { points: [] }, { points: [point(5, { lat: 91 })] }, { points: [point(5, { lng: -181 })] },
      { points: [point(5, { speed: -1 })] }, { points: [{ lat: 1, lng: 1, recordedAt: 'ontem' }] }, {},
    ]) {
      expect((await call('POST', '/api/routes/1047/locations', motorista, bad)).statusCode).toBe(400);
    }
  });

  it('não entra na auditoria (seria ruído a cada poucos segundos)', async () => {
    const rows = (await call('GET', '/api/audit?limit=300', await loginAs(app, 'gestao'))).json() as { action: string }[];
    expect(rows.some((r) => r.action.includes('/locations'))).toBe(false);
  });
});

describe('acompanhamento', () => {
  it('gestão e expedição veem a viagem ativa com última posição e parada atual; motorista não', async () => {
    const gestao = await loginAs(app, 'gestao');
    const live = (await call('GET', '/api/tracking', gestao)).json();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ routeId: 1047, driverName: 'Carlos Oliveira', stops: 6 });
    expect(live[0].current).toMatchObject({ orderId: 103 });
    expect(live[0].last.speed).toBeNull(); // o ponto mais recente enviado (10 s atrás) não tinha velocidade
    expect(live[0].last.ageSeconds).toBeGreaterThanOrEqual(10);
    expect(live[0].done).toBe(2);
    expect((await call('GET', '/api/tracking', await loginAs(app, 'expedicao'))).statusCode).toBe(200);
    expect((await call('GET', '/api/tracking', await loginAs(app, 'motorista'))).statusCode).toBe(403);
    expect((await call('GET', '/api/tracking', await loginAs(app, 'atendente'))).statusCode).toBe(403);
  });

  it('devolve o percurso em ordem e respeita since/limit', async () => {
    const gestao = await loginAs(app, 'gestao');
    const trail = (await call('GET', '/api/routes/1047/track', gestao)).json() as { recordedAt: string }[];
    expect(trail).toHaveLength(3);
    expect(trail.map((p) => p.recordedAt)).toEqual([...trail.map((p) => p.recordedAt)].sort());
    const recent = (await call('GET', `/api/routes/1047/track?since=${encodeURIComponent(ago(15))}`, gestao)).json();
    expect(recent).toHaveLength(1);
    expect((await call('GET', '/api/routes/1047/track?limit=2', gestao)).json()).toHaveLength(2);
  });
});

describe('tempo real', () => {
  it('a posição chega por WebSocket só a gestão e expedição', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as { port: number }).port;

    const open = async (role: 'gestao' | 'atendente' | 'motorista') => {
      const { ticket } = (await call('POST', '/api/auth/ws-ticket', await loginAs(app, role))).json();
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?ticket=${ticket}`);
      const messages: { type: string }[] = [];
      ws.on('message', (m) => messages.push(JSON.parse(String(m))));
      await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
      return { ws, messages };
    };
    const monitor = await open('gestao');
    const clerk = await open('atendente');

    const sent = await call('POST', '/api/routes/1047/locations', await loginAs(app, 'motorista'), { points: [point(1, { lat: -23.56, lng: -46.64, speed: 9 })] });
    expect(sent.json().accepted).toBe(1);
    await new Promise((r) => setTimeout(r, 300));

    expect(monitor.messages.find((m) => m.type === 'location')).toMatchObject({ routeId: 1047, driverId: 1, lat: -23.56, lng: -46.64, speed: 9 });
    expect(clerk.messages.some((m) => m.type === 'location')).toBe(false);
    monitor.ws.close(); clerk.ws.close();
  });

  it('um token de acesso comum não abre o canal', async () => {
    const port = (app.server.address() as { port: number }).port;
    const token = (await loginAs(app, 'gestao')).authorization.slice(7);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?ticket=${token}`);
    const code = await new Promise<number>((resolve) => { ws.on('close', (c) => resolve(c)); ws.on('error', () => resolve(0)); });
    expect(code).toBe(4401);
  });
});

describe('retenção e fim da viagem', () => {
  it('apaga posições além do prazo', async () => {
    const motorista = await loginAs(app, 'motorista');
    // um ponto "antigo" dentro da janela de aceitação e depois envelhecido manualmente
    await call('POST', '/api/routes/1047/locations', motorista, { points: [point(40)] });
    const { sql } = await import('drizzle-orm');
    const { withTenant } = await import('../src/db/tenants');
    await withTenant(db, 1, (tx) => tx.execute(sql`update driver_locations set recorded_at = now() - interval '40 days' where recorded_at = (select min(recorded_at) from driver_locations)`));
    expect(await purgeLocations(db, 30)).toBe(1);
  });

  it('ao encerrar a viagem a coleta é recusada', async () => {
    const motorista = await loginAs(app, 'motorista');
    for (const orderId of [103, 104, 105, 106]) {
      expect((await call('POST', `/api/orders/${orderId}/stop`, motorista, { kind: 'delivered', receiver: 'Cliente' })).statusCode).toBe(200);
    }
    const after = await call('POST', '/api/routes/1047/locations', motorista, { points: [point(2)] });
    expect(after.statusCode).toBe(422);
    expect((await call('GET', '/api/tracking', await loginAs(app, 'gestao'))).json()).toEqual([]);
  });
});
