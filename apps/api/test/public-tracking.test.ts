import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { trackingSigner } from '../src/http/public-tracking';
import { closeTestDbs, createTestApp, loginAs, testConfig } from './helpers';

describe('rastreio do cliente por link', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await createTestApp()); });
  afterAll(closeTestDbs);

  it('a equipe gera o link; o cliente vê a situação sem dados pessoais', async () => {
    const atendente = await loginAs(app, 'atendente');
    const ds = (await app.inject({ method: 'GET', url: '/api/dataset', headers: atendente })).json().data;
    const onroute = ds.orders.find((o: { status: string }) => o.status === 'onroute');
    const link = await app.inject({ method: 'POST', url: `/api/orders/${onroute.id}/tracking-link`, headers: atendente });
    expect(link.statusCode).toBe(200);
    const res = await app.inject({ method: 'GET', url: `/api/public/tracking/${link.json().token}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.order).toBe(onroute.id);
    expect(body.step).toBe(2);
    expect(body.customer).toBe(onroute.name.split(' ')[0]);
    // nada de endereço, telefone ou nome completo de ninguém
    const raw = res.body;
    expect(raw).not.toContain(onroute.phone);
    expect(raw).not.toContain(onroute.street);
  });

  it('o motorista não gera link; token adulterado ou expirado é recusado', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/orders/101/tracking-link', headers: await loginAs(app, 'motorista') })).statusCode).toBe(403);
    const signer = trackingSigner(testConfig.JWT_SECRET);
    const { token } = signer.create(1, 101);
    const [payload, sig] = token.split('.');
    const forged = `${Buffer.from('1.102.9999999999').toString('base64url')}.${sig}`;
    expect((await app.inject({ method: 'GET', url: `/api/public/tracking/${forged}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/public/tracking/${payload}.x${sig.slice(1)}` })).statusCode).toBe(404);
    const old = signer.create(1, 101, Date.now() - 10 * 86_400_000).token;
    expect((await app.inject({ method: 'GET', url: `/api/public/tracking/${old}` })).statusCode).toBe(410);
    // outra chave (outro ambiente) não vale aqui
    expect(trackingSigner('y'.repeat(40)).verify(token)).toBeNull();
  });
});
