import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDbs, createTestApp, loginAs, PASSWORD } from './helpers';

let app: FastifyInstance;
let db: Db;
beforeAll(async () => { ({ app, db } = await createTestApp()); });
afterAll(closeTestDbs);

type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Headers, payload?: unknown) =>
  app.inject({ method, url, headers, payload: payload as object });

const CSRF = { 'x-requested-with': 'rotacerta' };
const login = (email: string, password = PASSWORD) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
const refreshCookie = (res: { cookies: { name: string; value: string }[] }) => res.cookies.find((c) => c.name === 'rc_refresh')?.value;
const refresh = (cookie: string, headers: Headers = CSRF) => app.inject({ method: 'POST', url: '/api/auth/refresh', headers, cookies: { rc_refresh: cookie } });

describe('sessão', () => {
  it('login entrega token curto e cookie httpOnly de renovação', async () => {
    const res = await login('atendente@rotacerta.local');
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === 'rc_refresh');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe('/api/auth');
    expect(res.json().token).toBeTruthy();
  });

  it('renovar troca o cookie e exige o cabeçalho anti-CSRF', async () => {
    const first = refreshCookie(await login('expedicao@rotacerta.local'))!;
    expect((await refresh(first, {})).statusCode).toBe(403);
    const ok = await refresh(first);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.role).toBe('expedicao');
    const second = refreshCookie(ok)!;
    expect(second).not.toBe(first);
    expect((await refresh(second)).statusCode).toBe(200);
  });

  it('duas abas renovando ao mesmo tempo não derrubam a sessão', async () => {
    const first = refreshCookie(await login('gestao@rotacerta.local'))!;
    const [a, b] = await Promise.all([refresh(first), refresh(first)]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
  });

  it('reuso de um token trocado fora da janela de tolerância derruba toda a cadeia', async () => {
    const first = refreshCookie(await login('gestao@rotacerta.local'))!;
    const second = refreshCookie(await refresh(first))!;
    // envelhece a troca além dos 10 s para simular um token copiado e usado depois
    await db.execute(sql`update refresh_tokens set rotated_at = now() - interval '1 minute' where rotated_at is not null`);
    expect((await refresh(first)).statusCode).toBe(401);
    expect((await refresh(second)).statusCode).toBe(401);
  });

  it('logout encerra a sessão', async () => {
    const cookie = refreshCookie(await login('atendente@rotacerta.local'))!;
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: CSRF, cookies: { rc_refresh: cookie } });
    expect(out.statusCode).toBe(204);
    expect((await refresh(cookie)).statusCode).toBe(401);
  });

  it('o ticket do WebSocket não serve como token de acesso', async () => {
    const gestao = await loginAs(app, 'gestao');
    const { ticket } = (await call('POST', '/api/auth/ws-ticket', gestao)).json();
    expect(ticket).toBeTruthy();
    expect((await call('GET', '/api/dataset', { authorization: `Bearer ${ticket}` })).statusCode).toBe(401);
  });
});

describe('gestão de usuários', () => {
  const newUser = { name: 'Ana Atendente', email: 'ana@rotacerta.local', password: 'uma-senha-bem-longa', role: 'atendente', driverId: null };

  it('só a gestão administra usuários', async () => {
    expect((await call('GET', '/api/users', await loginAs(app, 'atendente'))).statusCode).toBe(403);
    expect((await call('POST', '/api/users', await loginAs(app, 'motorista'), newUser)).statusCode).toBe(403);
  });

  it('cria, entra com o novo usuário e recusa e-mail repetido e senha curta', async () => {
    const gestao = await loginAs(app, 'gestao');
    expect((await call('POST', '/api/users', gestao, { ...newUser, password: 'curta' })).statusCode).toBe(400);
    const created = await call('POST', '/api/users', gestao, newUser);
    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty('passwordHash');
    expect((await call('POST', '/api/users', gestao, newUser)).statusCode).toBe(422);
    expect((await login('ana@rotacerta.local', newUser.password)).statusCode).toBe(200);
  });

  it('motorista precisa de um cadastro de motorista livre', async () => {
    const gestao = await loginAs(app, 'gestao');
    const base = { name: 'Mateus Santos', email: 'mateus@rotacerta.local', password: 'uma-senha-bem-longa', role: 'motorista' };
    expect((await call('POST', '/api/users', gestao, { ...base, driverId: null })).statusCode).toBe(422);
    expect((await call('POST', '/api/users', gestao, { ...base, driverId: 1 })).statusCode).toBe(422); // Carlos já tem usuário
    expect((await call('POST', '/api/users', gestao, { ...base, driverId: 2 })).statusCode).toBe(201);
  });

  it('desativar derruba as sessões e impede novo login', async () => {
    const gestao = await loginAs(app, 'gestao');
    const email = 'temporario@rotacerta.local';
    const { id } = (await call('POST', '/api/users', gestao, { name: 'Usuario Temporario', email, password: 'uma-senha-bem-longa', role: 'expedicao', driverId: null })).json();
    const cookie = refreshCookie(await login(email, 'uma-senha-bem-longa'))!;
    expect((await call('PATCH', `/api/users/${id}`, gestao, { active: false })).statusCode).toBe(200);
    expect((await refresh(cookie)).statusCode).toBe(401);
    expect((await login(email, 'uma-senha-bem-longa')).statusCode).toBe(401);
  });

  it('nunca deixa a loja sem gestão ativa', async () => {
    const gestao = await loginAs(app, 'gestao');
    const users = (await call('GET', '/api/users', gestao)).json() as { id: number; role: string }[];
    const manager = users.find((u) => u.role === 'gestao')!;
    expect((await call('PATCH', `/api/users/${manager.id}`, gestao, { active: false })).statusCode).toBe(422);
    expect((await call('PATCH', `/api/users/${manager.id}`, gestao, { role: 'atendente' })).statusCode).toBe(422);
  });

  it('redefinir a senha derruba as sessões; trocar a própria exige a atual', async () => {
    const gestao = await loginAs(app, 'gestao');
    const email = 'troca@rotacerta.local';
    const { id } = (await call('POST', '/api/users', gestao, { name: 'Usuario Troca', email, password: 'senha-inicial-longa', role: 'atendente', driverId: null })).json();
    const session = await login(email, 'senha-inicial-longa');
    const cookie = refreshCookie(session)!;
    const own = { authorization: `Bearer ${session.json().token}` };

    expect((await call('POST', '/api/auth/password', own, { current: 'errada-errada', password: 'nova-senha-bem-longa' })).statusCode).toBe(422);
    expect((await call('POST', '/api/auth/password', own, { current: 'senha-inicial-longa', password: 'nova-senha-bem-longa' })).statusCode).toBe(200);
    expect((await refresh(cookie)).statusCode).toBe(401); // sessão antiga encerrada
    expect((await login(email, 'nova-senha-bem-longa')).statusCode).toBe(200);

    expect((await call('POST', `/api/users/${id}/password`, gestao, { password: 'senha-redefinida-pela-gestao' })).statusCode).toBe(200);
    expect((await login(email, 'nova-senha-bem-longa')).statusCode).toBe(401);
    expect((await login(email, 'senha-redefinida-pela-gestao')).statusCode).toBe(200);
  });
});

describe('privacidade do motorista', () => {
  it('enxerga só as rotas dele e as sem dono, sem avisos nem fichas', async () => {
    const motorista = (await call('GET', '/api/dataset', await loginAs(app, 'motorista'))).json();
    const routeIds = motorista.data.routes.map((r: { id: number }) => r.id).sort();
    expect(routeIds).toEqual([1047, 1048]);
    expect(motorista.data.drivers).toHaveLength(1);
    expect(motorista.data.notifications).toEqual([]);
    expect(motorista.papers).toEqual([]);
    const inRoutes = new Set(motorista.data.routes.flatMap((r: { orders: number[] }) => r.orders));
    expect(motorista.data.orders.every((o: { id: number }) => inRoutes.has(o.id))).toBe(true);
    const full = (await call('GET', '/api/dataset', await loginAs(app, 'gestao'))).json();
    expect(motorista.data.orders.length).toBeLessThan(full.data.orders.length);
    expect(motorista.data.clients.length).toBeLessThan(full.data.clients.length);
  });

  it('rota de outro motorista não aparece', async () => {
    const gestao = await loginAs(app, 'gestao');
    // atribui a carga liberada 1048 ao motorista 2 (via nova carga seria longo): confere pela regra de escopo
    const { scopeFor } = await import('../src/privacy');
    const { createSeed } = await import('@rotacerta/domain');
    const data = createSeed();
    data.routes = data.routes.map((r) => (r.id === 1048 ? { ...r, driverId: 2 } : r));
    const scoped = scopeFor({ role: 'motorista', driverId: 1 }, data, []);
    expect(scoped.data.routes.map((r) => r.id)).toEqual([1047]);
    void gestao;
  });
});

describe('auditoria', () => {
  it('registra login com falha, escritas e bloqueios, sem corpo nem senha', async () => {
    await login('gestao@rotacerta.local', 'senha-errada-errada');
    const atendente = await loginAs(app, 'atendente');
    await call('POST', '/api/orders', atendente, { clientId: null, name: 'X', phone: '1', neighborhood: 'Inexistente', street: '', number: '', complement: '', reference: '', window: '', notes: '', consent: true });

    const gestao = await loginAs(app, 'gestao');
    const rows = (await call('GET', '/api/audit?limit=200', gestao)).json() as { action: string; status: number; userName: string | null; detail: Record<string, unknown> | null }[];
    expect(rows.some((r) => r.action === 'auth.login_failed' && r.status === 401)).toBe(true);
    const order = rows.find((r) => r.action === 'POST /api/orders');
    expect(order).toMatchObject({ status: 422, userName: 'Beatriz Alves' });
    expect(JSON.stringify(rows)).not.toContain('senha-errada-errada');
    expect((await call('GET', '/api/audit', atendente)).statusCode).toBe(403);
  });
});
