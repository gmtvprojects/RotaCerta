import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '../src/realtime/events';
import { closeTestDbs, createTestApp, loginAs, PASSWORD } from './helpers';

let app: FastifyInstance;
beforeAll(async () => { ({ app } = await createTestApp()); });
afterAll(closeTestDbs);

type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Headers, payload?: unknown) =>
  app.inject({ method, url, headers, payload: payload as object });
const login = (email: string, password: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
const bearer = (res: { json: () => unknown }) => ({ authorization: `Bearer ${(res.json() as { token: string }).token}` });

const MANAGER_PASSWORD = 'gestor-empresa-b-123';

/** Cria a "Empresa B" pela plataforma e devolve o login do gestor dela. */
async function createCompanyB(name = 'Empresa B', email = 'gestor@empresab.test') {
  const platform = await loginAs(app, 'plataforma');
  const res = await call('POST', '/api/platform/companies', platform, { name, manager: { name: 'Gestor da B', email, password: MANAGER_PASSWORD } });
  expect(res.statusCode).toBe(201);
  const companyId = (res.json() as { id: number }).id;
  const session = await login(email, MANAGER_PASSWORD);
  expect(session.statusCode).toBe(200);
  return { companyId, headers: bearer(session), email };
}

describe('painel da plataforma', () => {
  it('cria a empresa com o primeiro gestor; ela nasce vazia', async () => {
    const b = await createCompanyB();
    const dataset = (await call('GET', '/api/dataset', b.headers)).json().data as { orders: unknown[]; vehicles: unknown[]; clients: unknown[]; zones: unknown[] };
    expect(dataset.orders).toEqual([]);
    expect(dataset.vehicles).toEqual([]);
    expect(dataset.clients).toEqual([]);
    expect(dataset.zones).toEqual([]);
  });

  it('lista as empresas com a quantidade de usuários', async () => {
    const platform = await loginAs(app, 'plataforma');
    const list = (await call('GET', '/api/platform/companies', platform)).json() as { name: string; users: number; active: boolean }[];
    const demo = list.find((c) => c.name === 'Empresa de demonstração');
    expect(demo).toMatchObject({ users: 4, active: true });
  });

  it('e-mail repetido é recusado e não deixa empresa pela metade', async () => {
    const platform = await loginAs(app, 'plataforma');
    const before = ((await call('GET', '/api/platform/companies', platform)).json() as unknown[]).length;
    const dup = await call('POST', '/api/platform/companies', platform, { name: 'Empresa Duplicada', manager: { name: 'Fulano de Tal', email: 'gestao@rotacerta.local', password: MANAGER_PASSWORD } });
    expect(dup.statusCode).toBe(422);
    expect(((await call('GET', '/api/platform/companies', platform)).json() as unknown[]).length).toBe(before);
  });

  it('valida os dados da empresa', async () => {
    const platform = await loginAs(app, 'plataforma');
    expect((await call('POST', '/api/platform/companies', platform, { name: 'X', manager: { name: 'Gestor', email: 'nao-e-email', password: 'curta' } })).statusCode).toBe(400);
  });

  it('o resumo de uso traz só contagens', async () => {
    const platform = await loginAs(app, 'plataforma');
    const detail = (await call('GET', '/api/platform/companies/1', platform)).json() as { name: string; usage: Record<string, number> };
    expect(detail.name).toBe('Empresa de demonstração');
    expect(Object.keys(detail.usage).sort()).toEqual(['clients', 'drivers', 'orders', 'routes', 'vehicles']);
    expect(detail.usage.orders).toBeGreaterThan(0);
    expect(JSON.stringify(detail)).not.toContain('Maria');
  });
});

describe('isolamento entre empresas', () => {
  it('o que uma empresa grava não aparece na outra', async () => {
    const b = await createCompanyB('Empresa Isolada', 'gestor@isolada.test');
    const a = await loginAs(app, 'gestao');
    expect((await call('POST', '/api/config/zones', b.headers, { name: 'Zona só da B' })).statusCode).toBe(200);

    const dsA = (await call('GET', '/api/dataset', a)).json().data as { zones: string[]; orders: unknown[] };
    const dsB = (await call('GET', '/api/dataset', b.headers)).json().data as { zones: string[]; orders: unknown[] };
    expect(dsA.zones).not.toContain('Zona só da B');
    expect(dsB.zones).toEqual(['Zona só da B']);
    expect(dsB.orders).toEqual([]);
    expect(dsA.orders.length).toBeGreaterThan(0);
  });

  it('a gestão de uma empresa não vê nem altera usuários de outra', async () => {
    const b = await createCompanyB('Empresa Usuarios', 'gestor@usuarios.test');
    const a = await loginAs(app, 'gestao');
    const listA = (await call('GET', '/api/users', a)).json() as { id: number; email: string }[];
    expect(listA.some((u) => u.email === b.email)).toBe(false);

    const platform = await loginAs(app, 'plataforma');
    const users = (await call('GET', `/api/platform/companies/${b.companyId}/users`, platform)).json() as { id: number }[];
    const target = users[0].id;
    expect((await call('PATCH', `/api/users/${target}`, a, { active: false })).statusCode).toBe(404);
    expect((await call('POST', `/api/users/${target}/password`, a, { password: 'senha-nova-123' })).statusCode).toBe(404);
    // e a senha do gestor da outra empresa continua valendo
    expect((await login(b.email, MANAGER_PASSWORD)).statusCode).toBe(200);
  });

  it('a auditoria de uma empresa mostra só os eventos dela', async () => {
    const b = await createCompanyB('Empresa Auditoria', 'gestor@auditoria.test');
    await call('POST', '/api/config/zones', b.headers, { name: 'Zona auditada' });
    const a = await loginAs(app, 'gestao');
    const rowsA = (await call('GET', '/api/audit?limit=500', a)).json() as { action: string; detail: { email?: string } | null }[];
    expect(rowsA.some((r) => r.detail?.email === b.email)).toBe(false);
    const rowsB = (await call('GET', '/api/audit?limit=500', b.headers)).json() as { action: string }[];
    expect(rowsB.some((r) => r.action === 'POST /api/config/zones')).toBe(true);
  });

  it('um motorista não é vinculado a cadastro de outra empresa', async () => {
    const b = await createCompanyB('Empresa Motorista', 'gestor@motorista.test');
    // a empresa B não tem motoristas: o id 1 existe só na empresa de demonstração
    const res = await call('POST', '/api/users', b.headers, { name: 'Motorista Intruso', email: 'intruso@motorista.test', password: PASSWORD, role: 'motorista', driverId: 1 });
    expect(res.statusCode).toBe(422);
  });

  it('eventos em tempo real só chegam à empresa de origem', () => {
    const bus = new EventBus();
    const seen1: string[] = [];
    const seen2: string[] = [];
    bus.subscribe(1, (e) => seen1.push(`${e.companyId}`));
    bus.subscribe(2, (e) => seen2.push(`${e.companyId}`));
    bus.publish({ type: 'changed', companyId: 1, scope: 'orders', at: 'x' });
    bus.publish({ type: 'location', companyId: 2, routeId: 1, driverId: 1, lat: 0, lng: 0, accuracy: null, speed: null, heading: null, recordedAt: 'x' });
    expect(seen1).toEqual(['1']);
    expect(seen2).toEqual(['2']);
  });
});

describe('o perfil da plataforma e as empresas ficam separados', () => {
  it('a plataforma não lê a operação de nenhuma empresa', async () => {
    const platform = await loginAs(app, 'plataforma');
    for (const url of ['/api/dataset', '/api/clients', '/api/tracking', '/api/users', '/api/audit']) {
      expect((await call('GET', url, platform)).statusCode, url).toBe(403);
    }
    expect((await call('POST', '/api/orders', platform, {})).statusCode).toBe(403);
  });

  it('perfis de empresa não acessam o painel da plataforma', async () => {
    for (const role of ['gestao', 'atendente', 'expedicao', 'motorista'] as const) {
      const h = await loginAs(app, role);
      expect((await call('GET', '/api/platform/companies', h)).statusCode, role).toBe(403);
      expect((await call('POST', '/api/platform/companies', h, { name: 'Hack', manager: { name: 'Hacker X', email: 'h@x.test', password: PASSWORD } })).statusCode, role).toBe(403);
      expect((await call('GET', '/api/platform/audit', h)).statusCode, role).toBe(403);
    }
  });

  it('o painel exige login', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/platform/companies' })).statusCode).toBe(401);
  });

  it('uma gestão não consegue criar um usuário da plataforma', async () => {
    const a = await loginAs(app, 'gestao');
    expect((await call('POST', '/api/users', a, { name: 'Falso Admin', email: 'falso@admin.test', password: PASSWORD, role: 'plataforma' })).statusCode).toBe(400);
  });
});

describe('suspensão e senhas', () => {
  it('empresa suspensa não entra e volta ao reativar', async () => {
    const b = await createCompanyB('Empresa Suspensa', 'gestor@suspensa.test');
    const platform = await loginAs(app, 'plataforma');
    expect((await call('PATCH', `/api/platform/companies/${b.companyId}`, platform, { active: false })).statusCode).toBe(200);
    const blocked = await login(b.email, MANAGER_PASSWORD);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error).toContain('suspenso');
    // a senha errada continua sem revelar nada
    expect((await login(b.email, 'senha-errada-123')).statusCode).toBe(401);

    await call('PATCH', `/api/platform/companies/${b.companyId}`, platform, { active: true });
    expect((await login(b.email, MANAGER_PASSWORD)).statusCode).toBe(200);
  });

  it('suspender derruba a renovação das sessões abertas', async () => {
    const b = await createCompanyB('Empresa Sessao', 'gestor@sessao.test');
    const first = await login(b.email, MANAGER_PASSWORD);
    const cookie = first.cookies.find((c) => c.name === 'rc_refresh')!.value;
    const platform = await loginAs(app, 'plataforma');
    await call('PATCH', `/api/platform/companies/${b.companyId}`, platform, { active: false });
    const refreshed = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { 'x-requested-with': 'rotacerta' }, cookies: { rc_refresh: cookie } });
    expect(refreshed.statusCode).toBe(401);
  });

  it('redefinir a senha gera uma provisória, derruba a antiga e obriga a trocar', async () => {
    const b = await createCompanyB('Empresa Senha', 'gestor@senha.test');
    const platform = await loginAs(app, 'plataforma');
    const users = (await call('GET', `/api/platform/companies/${b.companyId}/users`, platform)).json() as { id: number }[];
    const reset = await call('POST', `/api/platform/users/${users[0].id}/reset-password`, platform);
    expect(reset.statusCode).toBe(200);
    expect(reset.headers['cache-control']).toBe('no-store');
    const temporary = (reset.json() as { password: string }).password;
    expect(temporary.length).toBeGreaterThanOrEqual(12);

    expect((await login(b.email, MANAGER_PASSWORD)).statusCode).toBe(401);
    const entered = await login(b.email, temporary);
    expect(entered.statusCode).toBe(200);
    expect(entered.json().mustChangePassword).toBe(true);

    // ao trocar a senha a exigência some
    const change = await call('POST', '/api/auth/password', bearer(entered), { current: temporary, password: 'minha-senha-definitiva-1' });
    expect(change.statusCode).toBe(200);
    const again = await login(b.email, 'minha-senha-definitiva-1');
    expect(again.json().mustChangePassword).toBe(false);
  });

  it('a senha provisória não vai para a auditoria', async () => {
    const platform = await loginAs(app, 'plataforma');
    const users = (await call('GET', '/api/platform/companies/1/users', platform)).json() as { id: number; email: string }[];
    const target = users.find((u) => u.email === 'atendente@rotacerta.local')!;
    const reset = await call('POST', `/api/platform/users/${target.id}/reset-password`, platform);
    const temporary = (reset.json() as { password: string }).password;
    const audit = await call('GET', '/api/platform/audit?action=platform.user.password_reset', platform);
    expect(audit.statusCode).toBe(200);
    expect(audit.body).not.toContain(temporary);
    expect((audit.json() as { action: string }[]).length).toBeGreaterThan(0);
  });

  it('a gestão da empresa vê na própria auditoria que o suporte redefiniu uma senha', async () => {
    const b = await createCompanyB('Empresa Transparente', 'gestor@transparente.test');
    const platform = await loginAs(app, 'plataforma');
    const users = (await call('GET', `/api/platform/companies/${b.companyId}/users`, platform)).json() as { id: number }[];
    await call('POST', `/api/platform/users/${users[0].id}/reset-password`, platform);
    // o gestor perdeu a sessão com a redefinição; entra de novo com uma senha escolhida por ele mesmo
    const reset = await call('POST', `/api/platform/users/${users[0].id}/reset-password`, platform);
    const temporary = (reset.json() as { password: string }).password;
    const headers = bearer(await login(b.email, temporary));
    const rows = (await call('GET', '/api/audit?limit=200', headers)).json() as { action: string; userName: string }[];
    expect(rows.some((r) => r.action === 'platform.user.password_reset' && r.userName.includes('(plataforma)'))).toBe(true);
  });

  it('o suporte desativa e reativa usuários de uma empresa', async () => {
    const platform = await loginAs(app, 'plataforma');
    const found = (await call('GET', '/api/platform/users?q=expedicao@rotacerta', platform)).json() as { id: number; company: string }[];
    expect(found).toHaveLength(1);
    expect(found[0].company).toBe('Empresa de demonstração');
    expect((await call('PATCH', `/api/platform/users/${found[0].id}`, platform, { active: false })).statusCode).toBe(200);
    expect((await login('expedicao@rotacerta.local', PASSWORD)).statusCode).toBe(401);
    await call('PATCH', `/api/platform/users/${found[0].id}`, platform, { active: true });
    expect((await login('expedicao@rotacerta.local', PASSWORD)).statusCode).toBe(200);
  });

  it('contas da plataforma não são alteradas pelo painel de suporte', async () => {
    const platform = await loginAs(app, 'plataforma');
    const found = (await call('GET', '/api/platform/users?q=plataforma@rotacerta', platform)).json() as { id: number }[];
    expect(found).toHaveLength(1);
    expect((await call('PATCH', `/api/platform/users/${found[0].id}`, platform, { active: false })).statusCode).toBe(404);
    expect((await call('POST', `/api/platform/users/${found[0].id}/reset-password`, platform)).statusCode).toBe(404);
  });

  it('a gestão da empresa redefine senhas só da própria equipe e exige troca no próximo acesso', async () => {
    const a = await loginAs(app, 'gestao');
    const users = (await call('GET', '/api/users', a)).json() as { id: number; email: string }[];
    const target = users.find((u) => u.email === 'motorista@rotacerta.local')!;
    expect((await call('POST', `/api/users/${target.id}/password`, a, { password: 'senha-provisoria-123' })).statusCode).toBe(200);
    const entered = await login('motorista@rotacerta.local', 'senha-provisoria-123');
    expect(entered.json().mustChangePassword).toBe(true);
    // devolve a senha original para não afetar os demais testes
    await call('POST', '/api/auth/password', bearer(entered), { current: 'senha-provisoria-123', password: PASSWORD });
  });
});
