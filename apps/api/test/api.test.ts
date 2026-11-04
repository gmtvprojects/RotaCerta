import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, loginAs, PASSWORD } from './helpers';

let app: FastifyInstance;
beforeAll(async () => { ({ app } = await createTestApp()); });

type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, headers: Headers, payload?: unknown) =>
  app.inject({ method, url, headers, payload: payload as object });

const delivery = {
  clientId: null, name: 'Nova Cliente', phone: '(00) 90000-0001', neighborhood: 'Centro', street: 'Rua Teste', number: '10',
  complement: '', reference: '', window: '14:00–16:00', notes: '', consent: true,
};

interface Row { id: number; status?: string; routeId?: number | null }

describe('autenticação e perfis', () => {
  it('rejeita senha errada e aceita a correta', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'gestao@rotacerta.local', password: 'errada' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'gestao@rotacerta.local', password: PASSWORD } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.role).toBe('gestao');
  });

  it('exige token e respeita o perfil', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/dataset' })).statusCode).toBe(401);
    const motorista = await loginAs(app, 'motorista');
    expect((await call('POST', '/api/orders', motorista, delivery)).statusCode).toBe(403);
    expect((await call('POST', '/api/config/zones', await loginAs(app, 'atendente'), { name: 'X' })).statusCode).toBe(403);
  });

  it('motorista não recebe as fichas de papel', async () => {
    const res = await call('GET', '/api/dataset', await loginAs(app, 'motorista'));
    expect(res.json().papers).toEqual([]);
  });
});

describe('fluxo completo: do cadastro à entrega', () => {
  it('atendente cadastra, expedição monta e libera, motorista entrega', async () => {
    const atendente = await loginAs(app, 'atendente');
    const expedicao = await loginAs(app, 'expedicao');
    const motorista = await loginAs(app, 'motorista');

    // 1. cadastro
    const created = await call('POST', '/api/orders', atendente, delivery);
    expect(created.statusCode).toBe(200);
    const { orderId } = created.json() as { orderId: number };
    expect((await call('POST', '/api/orders', atendente, { ...delivery, neighborhood: 'Inexistente' })).statusCode).toBe(422);

    // 2. caixas
    const boxes = await call('PUT', `/api/orders/${orderId}/boxes`, atendente, { boxes: [{ code: 'cx-9001', type: 'cold', location: 'Câmara fria 01' }], gas: 0 });
    expect(boxes.statusCode).toBe(200);
    let ds = (await call('GET', '/api/dataset', atendente)).json().data;
    expect(ds.orders.find((o: Row) => o.id === orderId)).toMatchObject({ status: 'ready', boxes: ['CX-9001'], cold: 1 });

    // 3. carga
    const route = await call('POST', '/api/routes', expedicao, { orderIds: [orderId], vehicleId: 3, departure: '17:00', driverId: 2 });
    expect(route.statusCode).toBe(200);
    const { routeId } = route.json() as { routeId: number };
    expect((await call('POST', `/api/routes/${routeId}/release`, expedicao)).statusCode).toBe(422);

    // 4. conferência
    expect((await call('POST', `/api/routes/${routeId}/checks`, expedicao, { keys: ['999:CX-1'], value: true })).statusCode).toBe(422);
    expect((await call('POST', `/api/routes/${routeId}/checks`, expedicao, { keys: [`${orderId}:CX-9001`], value: true })).statusCode).toBe(200);
    expect((await call('POST', `/api/routes/${routeId}/orders/${orderId}/confirm`, expedicao)).statusCode).toBe(200);
    expect((await call('POST', `/api/routes/${routeId}/release`, expedicao)).statusCode).toBe(200);

    // 5. viagem: o motorista de demonstração (Carlos) já está em rota, então a gestão inicia pelo Mateus
    const gestao = await loginAs(app, 'gestao');
    expect((await call('POST', `/api/routes/${routeId}/start`, gestao, { driverId: 2 })).statusCode).toBe(200);
    expect((await call('POST', `/api/orders/${orderId}/stop`, gestao, { kind: 'delivered', receiver: 'Maria' })).statusCode).toBe(200);
    // sem aviso duplicado
    expect((await call('POST', `/api/orders/${orderId}/stop`, gestao, { kind: 'delivered', receiver: 'Maria' })).statusCode).toBe(422);

    ds = (await call('GET', '/api/dataset', gestao)).json().data;
    expect(ds.orders.find((o: Row) => o.id === orderId)).toMatchObject({ status: 'delivered', receiver: 'Maria' });
    expect(ds.routes.find((r: Row) => r.id === routeId).status).toBe('finished');
  });

  it('descartar uma carga devolve as entregas à fila', async () => {
    const expedicao = await loginAs(app, 'expedicao');
    const before = (await call('GET', '/api/dataset', expedicao)).json().data;
    const ready = before.orders.filter((o: Row) => o.status === 'ready').slice(0, 2).map((o: Row) => o.id);
    const { routeId } = (await call('POST', '/api/routes', expedicao, { orderIds: ready, vehicleId: 2, departure: '17:00' })).json();
    expect((await call('DELETE', `/api/routes/${routeId}`, expedicao)).statusCode).toBe(200);
    const after = (await call('GET', '/api/dataset', expedicao)).json().data;
    expect(after.routes.find((r: Row) => r.id === routeId)).toBeUndefined();
    expect(after.orders.filter((o: Row) => ready.includes(o.id)).every((o: Row) => o.status === 'ready' && o.routeId === null)).toBe(true);
  });
});

describe('regras da viagem', () => {
  it('motorista com viagem em curso não inicia outro romaneio', async () => {
    const motorista = await loginAs(app, 'motorista');
    const res = await call('POST', '/api/routes/1048/start', motorista, {});
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/viagem atual/);
  });

  it('motorista conclui a própria parada', async () => {
    const motorista = await loginAs(app, 'motorista');
    const res = await call('POST', '/api/orders/103/stop', motorista, { kind: 'delivered', receiver: 'Maria' });
    expect(res.statusCode).toBe(200);
  });
});

describe('configurações e avisos', () => {
  it('gestão cadastra região, bairro e reenvia aviso com falha', async () => {
    const gestao = await loginAs(app, 'gestao');
    expect((await call('POST', '/api/config/zones', gestao, { name: 'Região Leste' })).statusCode).toBe(200);
    expect((await call('POST', '/api/config/zones', gestao, { name: 'região leste' })).statusCode).toBe(422);
    expect((await call('POST', '/api/config/neighborhoods', gestao, { name: 'Bairro Leste', zone: 'Região Leste' })).statusCode).toBe(200);

    expect((await call('POST', '/api/notifications/seed-fail/retry', gestao)).statusCode).toBe(200);
    const ds = (await call('GET', '/api/dataset', gestao)).json().data;
    expect(ds.notifications.find((n: { id: string }) => n.id === 'seed-fail').status).toBe('delivered');
  });
});

describe('fichas de papel', () => {
  it('cria, importa e bloqueia nova edição', async () => {
    const atendente = await loginAs(app, 'atendente');
    const values = { ...delivery, sheetNumber: 'RC-1', boxes: [{ code: 'CX-777', type: 'ambient', location: 'Área de expedição' }], gas: 0, volumesReady: true };
    const { id } = (await call('POST', '/api/papers', atendente, { sheetNumber: 'RC-1', mode: 'example', values })).json();
    expect((await call('POST', `/api/papers/${id}/import`, atendente, values)).statusCode).toBe(200);
    expect((await call('POST', `/api/papers/${id}/import`, atendente, values)).statusCode).toBe(422);
    expect((await call('DELETE', `/api/papers/${id}`, atendente)).statusCode).toBe(422);
  });
});
