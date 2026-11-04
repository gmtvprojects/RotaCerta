import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDbs, createTestApp, loginAs } from './helpers';

afterAll(closeTestDbs);

type Role = 'gestao' | 'atendente' | 'expedicao' | 'motorista';
type Headers = Record<string, string>;
interface Order { id: number; status: string; routeId: number | null; boxes: string[]; window: string; phone: string; occurrence?: { reason: string; notes: string }; returned?: unknown; cancelled?: { reason: string }; neighborhood: string; clientId: number }
interface Route { id: number; status: string; driverId: number | null; orders: number[]; interrupted?: { reason: string } }

/** Cada teste recebe um app e um banco novos (seed intacto), para não depender da ordem. */
let app: FastifyInstance;
beforeEach(async () => { ({ app } = await createTestApp()); });

const as = (role: Role) => loginAs(app, role);
const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Headers, payload?: unknown) =>
  app.inject({ method, url, headers, payload: payload as object });
const dataset = async () => (await call('GET', '/api/dataset', await as('gestao'))).json().data as { orders: Order[]; routes: Route[]; clients: { id: number; name: string; phone: string; neighborhood: string }[]; vehicles: { id: number; capacity: number; active?: boolean }[]; drivers: { id: number; active?: boolean }[]; zones: string[]; neighborhoods: { name: string; zone: string }[] };
const order = async (id: number) => (await dataset()).orders.find((o) => o.id === id)!;

const form = { clientId: null, name: 'Cliente Novo', phone: '(00) 98888-0001', neighborhood: 'Centro', street: 'Rua A', number: '1', complement: '', reference: '', window: '14:00–16:00', notes: '', consent: true };
const box = (code: string) => ({ code, type: 'ambient', location: 'Área de expedição' });
async function newOrder(over: Record<string, unknown> = {}, boxes?: string[]) {
  const { orderId } = (await call('POST', '/api/orders', await as('atendente'), { ...form, ...over })).json() as { orderId: number };
  if (boxes) await call('PUT', `/api/orders/${orderId}/boxes`, await as('atendente'), { boxes: boxes.map(box), gas: 0 });
  return orderId;
}

describe('1 · caixa repetida entre entregas', () => {
  it('recusa código que já está em outra entrega ativa e libera quando ela é cancelada', async () => {
    const atendente = await as('atendente');
    const a = await newOrder({}, ['CX-8001']);
    const b = await newOrder({ phone: '(00) 98888-0002' });
    const clash = await call('PUT', `/api/orders/${b}/boxes`, atendente, { boxes: [box('cx-8001')], gas: 0 });
    expect(clash.statusCode).toBe(422);
    expect(clash.json().error).toContain(`entrega ${a}`);
    // a própria entrega pode regravar as mesmas caixas
    expect((await call('PUT', `/api/orders/${a}/boxes`, atendente, { boxes: [box('CX-8001')], gas: 0 })).statusCode).toBe(200);
    expect((await call('POST', `/api/orders/${a}/cancel`, atendente, { reason: 'Cliente desistiu' })).statusCode).toBe(200);
    expect((await call('PUT', `/api/orders/${b}/boxes`, atendente, { boxes: [box('CX-8001')], gas: 0 })).statusCode).toBe(200);
  });

  it('vale também para a ficha de papel', async () => {
    const atendente = await as('atendente');
    await newOrder({}, ['CX-8100']);
    const values = { ...form, sheetNumber: 'RC-9', boxes: [box('CX-8100')], gas: 0, volumesReady: true };
    const { id } = (await call('POST', '/api/papers', atendente, { sheetNumber: 'RC-9', mode: 'example', values })).json();
    expect((await call('POST', `/api/papers/${id}/import`, atendente, values)).statusCode).toBe(422);
  });
});

describe('2 e 6 · devolução dos volumes e nova tentativa', () => {
  it('fluxo completo: falha, viagem termina, devolução, nova tentativa', async () => {
    const motorista = await as('motorista');
    const exp = await as('expedicao');
    expect((await call('POST', '/api/orders/103/stop', motorista, { kind: 'failed', reason: 'Cliente ausente', notes: 'Ninguém atendeu' })).statusCode).toBe(200);
    // ainda não dá para devolver nem reagendar
    expect((await call('POST', '/api/orders/103/requeue', exp, {})).statusCode).toBe(422);
    expect((await call('POST', '/api/orders/103/return', exp)).statusCode).toBe(422); // viagem em andamento
    for (const id of [104, 105, 106]) await call('POST', `/api/orders/${id}/stop`, motorista, { kind: 'delivered', receiver: 'X' });
    expect((await call('POST', '/api/orders/103/requeue', exp, {})).statusCode).toBe(422); // sem devolução
    expect((await call('POST', '/api/orders/104/return', exp)).statusCode).toBe(422); // entregue: nada a devolver

    const boxesBefore = (await order(103)).boxes;
    expect((await call('POST', '/api/orders/103/return', exp)).statusCode).toBe(200);
    expect((await call('POST', '/api/orders/103/return', exp)).statusCode).toBe(422); // não repete
    expect((await call('POST', '/api/orders/103/requeue', exp, { window: '16:00–18:00' })).statusCode).toBe(200);

    const again = await order(103);
    expect(again).toMatchObject({ status: 'ready', routeId: null, window: '16:00–18:00', boxes: boxesBefore });
    expect(again.occurrence).toBeUndefined();
    expect(again.returned).toBeUndefined();
    // pode entrar em uma nova carga
    expect((await call('POST', '/api/routes', exp, { orderIds: [103], vehicleId: 3, departure: '17:00' })).statusCode).toBe(200);
  });

  it('caixas de uma falha devolvida voltam a ficar livres', async () => {
    const motorista = await as('motorista');
    const exp = await as('expedicao');
    const code = (await order(103)).boxes[0];
    const other = await newOrder({ phone: '(00) 98888-0003' });
    await call('POST', '/api/orders/103/stop', motorista, { kind: 'failed', reason: 'Cliente ausente', notes: '' });
    expect((await call('PUT', `/api/orders/${other}/boxes`, await as('atendente'), { boxes: [box(code)], gas: 0 })).statusCode).toBe(422);
    for (const id of [104, 105, 106]) await call('POST', `/api/orders/${id}/stop`, motorista, { kind: 'delivered', receiver: 'X' });
    await call('POST', '/api/orders/103/return', exp);
    expect((await call('PUT', `/api/orders/${other}/boxes`, await as('atendente'), { boxes: [box(code)], gas: 0 })).statusCode).toBe(200);
  });
});

describe('3 · editar e cancelar entrega', () => {
  it('edita enquanto não saiu e registra no histórico', async () => {
    const atendente = await as('atendente');
    const id = await newOrder();
    expect((await call('PATCH', `/api/orders/${id}`, atendente, { phone: '(00) 97777-0000', window: '10:00–12:00' })).statusCode).toBe(200);
    const o = await order(id);
    expect(o).toMatchObject({ phone: '(00) 97777-0000', window: '10:00–12:00' });
    expect(JSON.stringify((o as unknown as { history: unknown }).history)).toContain('Dados alterados: telefone, janela');
    expect((await call('PATCH', `/api/orders/${id}`, atendente, { neighborhood: 'Inexistente' })).statusCode).toBe(422);
    expect((await call('PATCH', `/api/orders/${id}`, atendente, { window: '10:00–12:00' })).statusCode).toBe(422); // nada mudou
    expect((await call('PATCH', '/api/orders/103', atendente, { notes: 'x' })).statusCode).toBe(422); // já em rota
    expect((await call('PATCH', `/api/orders/${id}`, await as('motorista'), { notes: 'x' })).statusCode).toBe(403);
  });

  it('cancelar uma entrega em carga a tira da carga e limpa a conferência', async () => {
    const exp = await as('expedicao');
    // 1048 está liberada com 107–110
    expect((await call('POST', '/api/orders/108/cancel', exp, { reason: 'x' })).statusCode).toBe(422); // motivo curto
    expect((await call('POST', '/api/orders/108/cancel', exp, { reason: 'Pedido duplicado' })).statusCode).toBe(200);
    const ds = await dataset();
    expect(ds.routes.find((r) => r.id === 1048)!.orders).toEqual([107, 109, 110]);
    expect(ds.orders.find((o) => o.id === 108)).toMatchObject({ status: 'cancelled', routeId: null, cancelled: { reason: 'Pedido duplicado' } });
    expect((await call('POST', '/api/orders/108/cancel', exp, { reason: 'de novo' })).statusCode).toBe(422);
  });

  it('cancelar a última entrega da carga desfaz a carga', async () => {
    const exp = await as('expedicao');
    const id = await newOrder({}, ['CX-8200']);
    const { routeId } = (await call('POST', '/api/routes', exp, { orderIds: [id], vehicleId: 3, departure: '17:00' })).json();
    await call('POST', `/api/orders/${id}/cancel`, exp, { reason: 'Cliente desistiu' });
    expect((await dataset()).routes.some((r) => r.id === routeId)).toBe(false);
  });

  it('não cancela entrega com o motorista nem já entregue', async () => {
    const exp = await as('expedicao');
    expect((await call('POST', '/api/orders/103/cancel', exp, { reason: 'Tentativa' })).statusCode).toBe(422); // em rota
    expect((await call('POST', '/api/orders/101/cancel', exp, { reason: 'Tentativa' })).statusCode).toBe(422); // entregue
  });
});

describe('4 · interromper e trocar motorista da viagem', () => {
  it('troca o motorista da viagem em andamento e o antigo para de enviar posição', async () => {
    const exp = await as('expedicao');
    const motorista = await as('motorista'); // Carlos, motorista 1
    const point = { lat: -23.5, lng: -46.6, recordedAt: new Date().toISOString() };
    expect((await call('POST', '/api/routes/1047/locations', motorista, { points: [point] })).statusCode).toBe(200);
    expect((await call('POST', '/api/routes/1047/driver', exp, { driverId: 1 })).statusCode).toBe(422); // já é dele
    expect((await call('POST', '/api/routes/1047/driver', exp, { driverId: 99 })).statusCode).toBe(422);
    expect((await call('POST', '/api/routes/1047/driver', exp, { driverId: null })).statusCode).toBe(422); // em andamento precisa de motorista
    expect((await call('POST', '/api/routes/1047/driver', exp, { driverId: 2 })).statusCode).toBe(200);
    expect((await call('POST', '/api/routes/1047/locations', motorista, { points: [{ ...point, recordedAt: new Date(Date.now() + 1000).toISOString() }] })).statusCode).toBe(403);
    expect((await call('POST', '/api/orders/103/stop', motorista, { kind: 'delivered', receiver: 'X' })).statusCode).toBe(422);
  });

  it('não passa a viagem para um motorista que já está em outra', async () => {
    const exp = await as('expedicao');
    // inicia a 1048 com o motorista 2 (pela gestão) e tenta dar a 1047 a ele
    expect((await call('POST', '/api/routes/1048/start', await as('gestao'), { driverId: 2 })).statusCode).toBe(200);
    expect((await call('POST', '/api/routes/1047/driver', exp, { driverId: 2 })).statusCode).toBe(422);
  });

  it('interromper encerra a viagem e leva as paradas pendentes ao fluxo de devolução', async () => {
    const exp = await as('expedicao');
    expect((await call('POST', '/api/routes/1047/interrupt', exp, { reason: '' })).statusCode).toBe(422);
    expect((await call('POST', '/api/routes/1047/interrupt', exp, { reason: 'Veículo quebrou' })).statusCode).toBe(200);
    const ds = await dataset();
    expect(ds.routes.find((r) => r.id === 1047)).toMatchObject({ status: 'finished', interrupted: { reason: 'Veículo quebrou' } });
    expect(ds.orders.filter((o) => [103, 104, 105, 106].includes(o.id)).every((o) => o.status === 'failed' && o.occurrence?.reason === 'Viagem interrompida')).toBe(true);
    expect(ds.orders.filter((o) => [101, 102].includes(o.id)).every((o) => o.status === 'delivered')).toBe(true);
    expect((await call('GET', '/api/tracking', await as('gestao'))).json()).toEqual([]);
    expect((await call('POST', '/api/routes/1047/interrupt', exp, { reason: 'Outra vez' })).statusCode).toBe(422);
    // as paradas voltam depois pela devolução + nova tentativa
    expect((await call('POST', '/api/orders/104/return', exp)).statusCode).toBe(200);
    expect((await call('POST', '/api/orders/104/requeue', exp, {})).statusCode).toBe(200);
  });
});

describe('5 · capacidade do veículo', () => {
  it('bloqueia carga acima da capacidade e a regravação de caixas que estoura', async () => {
    const gestao = await as('gestao');
    const exp = await as('expedicao');
    expect((await call('PUT', '/api/config/vehicles/3', gestao, { name: 'Veículo 03', plate: 'DEMO-03', capacity: 2 })).statusCode).toBe(200);
    const ds = await dataset();
    const ready = ds.orders.filter((o) => o.status === 'ready').slice(0, 3).map((o) => o.id);
    const over = await call('POST', '/api/routes', exp, { orderIds: ready, vehicleId: 3, departure: '17:00' });
    expect(over.statusCode).toBe(422);
    expect(over.json().error).toMatch(/Capacidade excedida/);

    const single = await newOrder({}, ['CX-8300']);
    expect((await call('POST', '/api/routes', exp, { orderIds: [single], vehicleId: 3, departure: '17:00' })).statusCode).toBe(200);
    const grow = await call('PUT', `/api/orders/${single}/boxes`, await as('atendente'), { boxes: [box('CX-8300'), box('CX-8301'), box('CX-8302')], gas: 0 });
    expect(grow.statusCode).toBe(422);
    expect(grow.json().error).toMatch(/Capacidade excedida/);
  });
});

describe('7 · clientes', () => {
  it('busca por nome sem acento e por telefone, com paginação', async () => {
    const atendente = await as('atendente');
    const byName = (await call('GET', '/api/clients?q=beatriz', atendente)).json();
    expect(byName.items.map((c: { name: string }) => c.name)).toEqual(['Beatriz Nunes']);
    expect((await call('GET', '/api/clients?q=BEATRIZ', atendente)).json().total).toBe(1);
    expect((await call('GET', '/api/clients?q=claudia', atendente)).json().total).toBe(1); // "Cláudia"
    expect((await call('GET', '/api/clients?q=0101', atendente)).json().items[0].name).toBe('Maria Oliveira');
    const page = (await call('GET', '/api/clients?limit=5&offset=5', atendente)).json();
    expect(page.items).toHaveLength(5);
    expect(page.total).toBe(20);
    expect((await call('GET', '/api/clients', await as('motorista'))).statusCode).toBe(403);
  });

  it('histórico do cliente', async () => {
    const res = (await call('GET', '/api/clients/1', await as('atendente'))).json();
    expect(res.client.name).toBe('Maria Oliveira');
    expect(res.orders.length).toBeGreaterThan(0);
    expect(res.orders.every((o: { clientId: number }) => o.clientId === 1)).toBe(true);
    expect((await call('GET', '/api/clients/9999', await as('atendente'))).statusCode).toBe(404);
  });

  it('corrige o cadastro, recusa telefone de outro e propaga às entregas abertas', async () => {
    const atendente = await as('atendente');
    const open = (await dataset()).orders.find((o) => o.clientId === 2 && ['ready', 'awaiting'].includes(o.status))!;
    const phone2 = (await dataset()).clients.find((c) => c.id === 2)!.phone;
    expect((await call('PATCH', '/api/clients/1', atendente, { phone: phone2 })).statusCode).toBe(422);
    expect((await call('PATCH', '/api/clients/2', atendente, { street: 'Rua Nova', applyToOpen: false })).statusCode).toBe(200);
    expect((await dataset()).orders.find((o) => o.id === open.id)).not.toMatchObject({ street: 'Rua Nova' });
    expect((await call('PATCH', '/api/clients/2', atendente, { street: 'Rua Mais Nova', applyToOpen: true })).statusCode).toBe(200);
    expect((await dataset()).orders.find((o) => o.id === open.id)).toMatchObject({ street: 'Rua Mais Nova' });
    expect((await call('PATCH', '/api/clients/2', await as('expedicao'), { street: 'X' })).statusCode).toBe(403);
  });

  it('une duplicados e só remove cadastro sem entregas', async () => {
    const atendente = await as('atendente');
    const before = await dataset();
    const orders3 = before.orders.filter((o) => o.clientId === 3).length;
    const orders2 = before.orders.filter((o) => o.clientId === 2).length;
    expect((await call('POST', '/api/clients/2/merge', atendente, { mergeId: 2 })).statusCode).toBe(422);
    expect((await call('POST', '/api/clients/2/merge', atendente, { mergeId: 3 })).statusCode).toBe(200);
    const after = await dataset();
    expect(after.clients.some((c) => c.id === 3)).toBe(false);
    expect(after.orders.filter((o) => o.clientId === 2)).toHaveLength(orders2 + orders3);

    expect((await call('DELETE', '/api/clients/2', atendente)).statusCode).toBe(422); // tem entregas
    // cadastro inexistente
    expect((await call('DELETE', '/api/clients/9999', atendente)).statusCode).toBe(422);
  });
});

describe('8 · editar e remover cadastros da loja', () => {
  it('regiões e bairros: renomear acompanha clientes e entregas; remover só se vazio', async () => {
    const gestao = await as('gestao');
    expect((await call('DELETE', '/api/config/zones/Regi%C3%A3o%20Norte', gestao)).statusCode).toBe(422); // tem bairros
    expect((await call('PUT', '/api/config/zones/Regi%C3%A3o%20Norte', gestao, { name: 'Região Central' })).statusCode).toBe(422); // já existe
    expect((await call('PUT', '/api/config/zones/Regi%C3%A3o%20Norte', gestao, { name: 'Zona Norte' })).statusCode).toBe(200);
    let ds = await dataset();
    expect(ds.zones).toContain('Zona Norte');
    expect(ds.neighborhoods.filter((n) => n.zone === 'Zona Norte').length).toBe(2);

    expect((await call('DELETE', '/api/config/neighborhoods/Centro', gestao)).statusCode).toBe(422); // em uso
    expect((await call('PUT', '/api/config/neighborhoods/Centro', gestao, { name: 'Centro Histórico', zone: 'Zona Norte' })).statusCode).toBe(200);
    ds = await dataset();
    expect(ds.clients.some((c) => c.neighborhood === 'Centro')).toBe(false);
    expect(ds.clients.some((c) => c.neighborhood === 'Centro Histórico')).toBe(true);
    expect(ds.orders.some((o) => o.neighborhood === 'Centro')).toBe(false);

    // bairro novo e vazio pode ser removido; depois a região vazia também
    expect((await call('POST', '/api/config/zones', gestao, { name: 'Zona Teste' })).statusCode).toBe(200);
    expect((await call('POST', '/api/config/neighborhoods', gestao, { name: 'Bairro Teste', zone: 'Zona Teste' })).statusCode).toBe(200);
    expect((await call('DELETE', '/api/config/neighborhoods/Bairro%20Teste', gestao)).statusCode).toBe(200);
    expect((await call('DELETE', '/api/config/zones/Zona%20Teste', gestao)).statusCode).toBe(200);
    expect((await call('PUT', '/api/config/zones/Zona%20Norte', await as('atendente'), { name: 'X' })).statusCode).toBe(403);
  });

  it('motoristas: editar, desativar (não em carga) e remover só quem nunca viajou', async () => {
    const gestao = await as('gestao');
    expect((await call('PATCH', '/api/config/drivers/1', gestao, { active: false })).statusCode).toBe(422); // viagem em andamento
    expect((await call('PATCH', '/api/config/drivers/3', gestao, { name: 'Lucas Pereira Lima' })).statusCode).toBe(200);
    expect((await call('PATCH', '/api/config/drivers/3', gestao, { active: false })).statusCode).toBe(200);
    let ds = await dataset();
    expect(ds.drivers.find((d) => d.id === 3)).toMatchObject({ active: false });
    expect(ds.drivers.find((d) => d.id === 2)!.active).toBeUndefined(); // ativo = ausente
    // motorista desativado não recebe carga
    const ready = ds.orders.find((o) => o.status === 'ready')!.id;
    expect((await call('POST', '/api/routes', await as('expedicao'), { orderIds: [ready], vehicleId: 3, departure: '17:00', driverId: 3 })).statusCode).toBe(422);
    expect((await call('PATCH', '/api/config/drivers/3', gestao, { active: true })).statusCode).toBe(200);

    expect((await call('DELETE', '/api/config/drivers/1', gestao)).statusCode).toBe(422); // tem usuário e histórico
    const created = await call('POST', '/api/config/drivers', gestao, { name: 'Novo Motorista Teste' });
    expect(created.statusCode).toBe(200);
    ds = await dataset();
    const id = ds.drivers.find((d) => (d as unknown as { name: string }).name === 'Novo Motorista Teste')!.id;
    expect((await call('DELETE', `/api/config/drivers/${id}`, gestao)).statusCode).toBe(200);
  });

  it('veículos: desativar livre, recusar carga em veículo desativado, remover só sem histórico', async () => {
    const gestao = await as('gestao');
    expect((await call('PATCH', '/api/config/vehicles/1/active', gestao, { active: false })).statusCode).toBe(422); // em viagem
    expect((await call('PATCH', '/api/config/vehicles/3/active', gestao, { active: false })).statusCode).toBe(200);
    const ready = (await dataset()).orders.find((o) => o.status === 'ready')!.id;
    const res = await call('POST', '/api/routes', await as('expedicao'), { orderIds: [ready], vehicleId: 3, departure: '17:00' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/desativado/);
    expect((await dataset()).vehicles.find((v) => v.id === 3)).toMatchObject({ active: false });
    expect((await call('PATCH', '/api/config/vehicles/3/active', gestao, { active: true })).statusCode).toBe(200);

    expect((await call('DELETE', '/api/config/vehicles/1', gestao)).statusCode).toBe(422); // tem histórico
    expect((await call('POST', '/api/config/vehicles', gestao, { name: 'Veículo Teste', plate: 'TST-01', capacity: 10 })).statusCode).toBe(200);
    const id = (await dataset()).vehicles.at(-1)!.id;
    expect((await call('DELETE', `/api/config/vehicles/${id}`, gestao)).statusCode).toBe(200);
  });
});
