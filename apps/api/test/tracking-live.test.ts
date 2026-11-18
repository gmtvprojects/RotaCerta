import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pointAlong } from '../src/gps-sim';
import { closeTestDbs, createTestApp, loginAs } from './helpers';

describe('acompanhamento ao vivo', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await createTestApp()); });
  afterAll(async () => { await app.close(); await closeTestDbs(); });

  it('a trilha devolve os pontos mais recentes, em ordem de tempo', async () => {
    const motorista = await loginAs(app, 'motorista');
    const ds = (await app.inject({ method: 'GET', url: '/api/dataset', headers: motorista })).json().data;
    const route = ds.routes.find((r: { status: string }) => r.status === 'active');
    const base = Date.now() - 60_000;
    const points = Array.from({ length: 10 }, (_, i) => ({ lat: -23.55 + i * 0.0001, lng: -46.65, recordedAt: new Date(base + i * 5_000).toISOString() }));
    expect((await app.inject({ method: 'POST', url: `/api/routes/${route.id}/locations`, headers: motorista, payload: { points } })).statusCode).toBe(200);
    const track = (await app.inject({ method: 'GET', url: `/api/routes/${route.id}/track?limit=3`, headers: await loginAs(app, 'expedicao') })).json();
    expect(track.map((p: { recordedAt: string }) => p.recordedAt)).toEqual(points.slice(-3).map((p) => p.recordedAt));
  });

  it('simulação (ambiente de teste): só para viagem ativa e só para quem acompanha', async () => {
    const expedicao = await loginAs(app, 'expedicao');
    const ds = (await app.inject({ method: 'GET', url: '/api/dataset', headers: expedicao })).json().data;
    const active = ds.routes.find((r: { status: string }) => r.status === 'active');
    const other = ds.routes.find((r: { status: string }) => r.status !== 'active');
    expect((await app.inject({ method: 'POST', url: `/api/routes/${active.id}/simulate`, headers: await loginAs(app, 'atendente') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/routes/${other.id}/simulate`, headers: expedicao })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: `/api/routes/${active.id}/simulate`, headers: expedicao, payload: { minutes: 1 } })).statusCode).toBe(200);
    const live = (await app.inject({ method: 'GET', url: '/api/tracking', headers: expedicao })).json();
    expect(live.find((l: { routeId: number }) => l.routeId === active.id).simulating).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: `/api/routes/${active.id}/simulate`, headers: expedicao })).statusCode).toBe(200);
  });

  it('o percurso simulado anda por pontos próximos, com direção', () => {
    const a = pointAlong(0); const b = pointAlong(25);
    expect(Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng)).toBeGreaterThan(0);
    expect(Math.abs(a.lat - b.lat)).toBeLessThan(0.001);
    expect(b.heading).toBeGreaterThanOrEqual(0);
  });
});
