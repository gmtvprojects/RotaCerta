import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { AnyRole, Role } from '@rotacerta/domain';
import { storeClock } from './clock';
import type { Config } from './config';
import { audit } from './db/audit';
import type { Db } from './db/client';
import { mutate, readWorkspace, type Mutation } from './db/unit-of-work';
import type { AuthUser } from './http/context';
import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient } from './agents/runtime';
import { registerAgentRoutes } from './http/agents';
import { registerAuthRoutes } from './http/auth';
import { registerBusinessRoutes } from './http/business';
import { registerOperationRoutes } from './http/operations';
import { registerPlatformRoutes } from './http/platform';
import { registerPublicTrackingRoutes } from './http/public-tracking';
import { registerTrackingRoutes } from './http/tracking';
import { scopeFor } from './privacy';
import { EventBus } from './realtime/events';
import { type NotificationSender, SimulatedSender } from './notifications/sender';

export interface AppDeps {
  config: Config; db: Db; events?: EventBus; sender?: NotificationSender;
  /** Cliente da IA. Sem ele (e sem ANTHROPIC_API_KEY), os agentes ficam só para configuração. Os testes passam um falso. */
  llm?: LlmClient | null;
}

/** Contexto entregue a cada rota de negócio. */
export interface Ctx {
  app: FastifyInstance;
  db: Db;
  config: Config;
  events: EventBus;
  sender: NotificationSender;
  /** Exige login e um dos perfis; responde 401/403 e devolve null se não passar. */
  guard: (roles: readonly AnyRole[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /** Empresa do usuário logado. Só use em rotas protegidas por `guard` com perfis de empresa (o guard garante que existe). */
  company: (req: FastifyRequest) => number;
  /** Executa uma regra do domínio de forma atômica e responde 200 ou 422. */
  run: <R>(req: FastifyRequest, reply: FastifyReply, scope: string, fn: (user: AuthUser, clock: ReturnType<typeof storeClock>) => Mutation<R>) => Promise<unknown>;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const events = deps.events ?? new EventBus();
  const sender = deps.sender ?? new SimulatedSender();
  const app = Fastify({ logger: config.NODE_ENV === 'test' ? false : {
      level: 'info',
      // o token do WebSocket vai na URL: nunca registrar a query string
      serializers: { req: (req) => ({ method: req.method, url: req.url?.split('?')[0], remoteAddress: req.ip }) },
    }, bodyLimit: 2 * 1024 * 1024,
    // atrás de proxy (Railway, ALB) o IP real vem de X-Forwarded-For; sem isso o limite de login e a auditoria veem o IP do proxy
    trustProxy: (config.TRUST_PROXY ?? (config.APP_ENV === 'production' ? 'true' : 'false')) === 'true' });

  // API só devolve JSON: CSP fechada, sem frames, sem sniffing; HSTS só faz sentido sobre HTTPS (produção)
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'cross-origin' }, hsts: config.APP_ENV === 'production' });
  await app.register(cors, { origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(cookie);
  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: config.JWT_EXPIRES_IN } });
  await app.register(rateLimit, { global: false });
  // teto geral para escritas (a posição do GPS fica de fora: chega a cada poucos segundos por motorista)
  const writeLimit = app.rateLimit({ max: config.WRITE_RATE_MAX, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || req.url.split('?')[0].endsWith('/locations')) return;
    await writeLimit.call(app, req, reply);
  });
  await app.register(websocket);

  const guard: Ctx['guard'] = (roles) => async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'Sessão inválida ou expirada.' }); }
    // tickets do WebSocket não servem como token de acesso (não têm perfil)
    if (!req.user.role) return reply.code(401).send({ error: 'Sessão inválida ou expirada.' });
    if (!roles.includes(req.user.role)) return reply.code(403).send({ error: 'Seu perfil não tem acesso a esta ação.' });
    // todo perfil de empresa carrega a empresa no token; sem ela a sessão não vale (o perfil da plataforma não tem empresa)
    if (req.user.role !== 'plataforma' && !Number.isInteger(req.user.companyId)) return reply.code(401).send({ error: 'Sessão inválida ou expirada.' });
  };

  const company: Ctx['company'] = (req) => {
    if (!Number.isInteger(req.user.companyId)) throw new Error('Rota de empresa chamada sem empresa no token.');
    return req.user.companyId as number;
  };

  const run: Ctx['run'] = async (req, reply, scope, fn) => {
    const user = req.user;
    const companyId = company(req);
    const out = await mutate(db, companyId, fn(user, storeClock(config.APP_TZ)));
    if (!out.ok) return reply.code(422).send({ error: out.error });
    events.publish({ type: 'changed', companyId, scope, at: new Date().toISOString() });
    return out.result ?? { ok: true };
  };

  // erro inesperado: o detalhe fica no log (com o reqId); o cliente recebe só uma mensagem genérica
  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err }, 'erro interno');
      return reply.code(500).send({ error: 'Erro interno. Tente de novo; se continuar, informe o código ' + req.id + ' ao suporte.' });
    }
    return reply.code(status).send({ error: status === 429 ? 'Muitas tentativas. Aguarde um pouco e tente de novo.' : err.message });
  });

  // o mesmo id aparece nos logs da requisição: suporte e usuário conseguem apontar a linha exata do log
  app.addHook('onSend', async (req, reply) => { reply.header('x-request-id', req.id); });

  /** Processo vivo. */
  app.get('/health', async () => ({ status: 'ok' }));
  /** Pronto para receber tráfego: o banco responde. Usar como health check do balanceador. */
  app.get('/ready', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'database_unavailable' });
    }
  });

  /* ---------- leitura do estado ---------- */
  app.get('/api/dataset', { preHandler: guard(['gestao', 'atendente', 'expedicao', 'motorista']) }, async (req) => {
    const { data, papers } = await readWorkspace(db, company(req));
    return scopeFor({ role: req.user.role as Role, driverId: req.user.driverId }, data, papers);
  });

  /* ---------- tempo real ---------- */
  app.get('/api/ws', { websocket: true }, (socket, req) => {
    // ticket de 30 s obtido em POST /api/auth/ws-ticket; o token de acesso nunca vai na URL
    const ticket = (req.query as { ticket?: string }).ticket;
    let viewer: AnyRole | undefined;
    let companyId: number | undefined;
    try {
      const payload = app.jwt.verify<{ purpose?: string; viewer?: AnyRole; company?: number }>(ticket ?? '');
      if (payload.purpose !== 'ws' || !Number.isInteger(payload.company)) throw new Error('ticket inválido');
      viewer = payload.viewer;
      companyId = payload.company;
    } catch { socket.close(4401, 'unauthorized'); return; }
    // a posição dos motoristas só vai para quem acompanha as viagens; cada aparelho recebe só os eventos da sua empresa
    const mayTrack = viewer === 'gestao' || viewer === 'expedicao';
    const off = events.subscribe(companyId as number, (e) => { if (e.type !== 'location' || mayTrack) socket.send(JSON.stringify(e)); });
    socket.on('close', off);
  });

  /* ---------- auditoria das operações ---------- */
  // toda escrita feita por usuário logado fica registrada (a autenticação e os usuários têm registro próprio, com mais detalhe)
  // gravada antes de a resposta sair: o cliente só recebe a confirmação depois que o registro existe
  app.addHook('onSend', async (req, reply, payload) => {
    const url = req.routeOptions.url ?? '';
    if (req.method === 'GET' || req.method === 'OPTIONS' || !url.startsWith('/api/') || url.startsWith('/api/auth') || url.startsWith('/api/users') || url.startsWith('/api/platform')) return payload;
    // a posição chega a cada poucos segundos: não é uma ação de usuário, seria ruído na auditoria
    if (url.endsWith('/locations')) return payload;
    if (!req.user?.sub) return payload;
    await audit(db, { companyId: req.user.companyId, userId: req.user.sub, userName: req.user.name, action: `${req.method} ${url}`, target: JSON.stringify(req.params ?? {}), status: reply.statusCode, ip: req.ip }, req.log);
    return payload;
  });

  const ctx: Ctx = { app, db, config, events, sender, guard, company, run };
  registerAuthRoutes(ctx);
  registerBusinessRoutes(ctx);
  registerOperationRoutes(ctx);
  registerTrackingRoutes(ctx);
  registerPlatformRoutes(ctx);
  registerPublicTrackingRoutes(ctx);
  const llm = deps.llm !== undefined ? deps.llm : config.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 }) : null;
  registerAgentRoutes(ctx, llm);
  return app;
}
