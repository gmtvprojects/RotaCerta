import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { Role } from '@rotacerta/domain';
import { verifyPassword } from './auth/password';
import { storeClock } from './clock';
import type { Config } from './config';
import { schema, type Db } from './db/client';
import { loadWorkspace } from './db/workspace';
import { mutate, type Mutation } from './db/unit-of-work';
import type { AuthUser } from './http/context';
import * as body from './http/schemas';
import { registerBusinessRoutes } from './http/business';
import { EventBus } from './realtime/events';
import { type NotificationSender, SimulatedSender } from './notifications/sender';

export interface AppDeps { config: Config; db: Db; events?: EventBus; sender?: NotificationSender }

/** Contexto entregue a cada rota de negócio. */
export interface Ctx {
  app: FastifyInstance;
  db: Db;
  config: Config;
  events: EventBus;
  sender: NotificationSender;
  /** Exige login e um dos perfis; responde 401/403 e devolve null se não passar. */
  guard: (roles: readonly Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /** Executa uma regra do domínio de forma atômica e responde 200 ou 422. */
  run: <R>(req: FastifyRequest, reply: FastifyReply, scope: string, fn: (user: AuthUser, clock: ReturnType<typeof storeClock>) => Mutation<R>) => Promise<unknown>;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const events = deps.events ?? new EventBus();
  const sender = deps.sender ?? new SimulatedSender();
  const app = Fastify({ logger: config.NODE_ENV === 'test' ? false : { level: 'info' }, bodyLimit: 2 * 1024 * 1024 });

  await app.register(cors, { origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: config.JWT_EXPIRES_IN } });
  await app.register(rateLimit, { global: false });
  await app.register(websocket);

  const guard: Ctx['guard'] = (roles) => async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'Sessão inválida ou expirada.' }); }
    if (!roles.includes(req.user.role)) return reply.code(403).send({ error: 'Seu perfil não tem acesso a esta ação.' });
  };

  const run: Ctx['run'] = async (req, reply, scope, fn) => {
    const user = req.user;
    const out = await mutate(db, fn(user, storeClock(config.APP_TZ)));
    if (!out.ok) return reply.code(422).send({ error: out.error });
    events.publish({ type: 'changed', scope, at: new Date().toISOString() });
    return out.result ?? { ok: true };
  };

  app.get('/health', async () => ({ status: 'ok' }));

  /* ---------- autenticação ---------- */
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = body.login.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Informe e-mail e senha.' });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email.toLowerCase()));
    // mesma resposta para e-mail inexistente e senha errada
    const valid = user?.active && await verifyPassword(parsed.data.password, user.passwordHash);
    if (!user || !valid) return reply.code(401).send({ error: 'E-mail ou senha incorretos.' });
    const payload: AuthUser = { sub: user.id, name: user.name, role: user.role, driverId: user.driverId };
    return { token: app.jwt.sign(payload), user: payload };
  });

  app.get('/api/auth/me', { preHandler: guard(['gestao', 'atendente', 'expedicao', 'motorista']) }, async (req) => req.user);

  /* ---------- leitura do estado ---------- */
  app.get('/api/dataset', { preHandler: guard(['gestao', 'atendente', 'expedicao', 'motorista']) }, async (req) => {
    const { data, papers } = await loadWorkspace(db);
    // fichas de papel guardam dados pessoais e fotos: só quem cadastra vê
    const seesPapers = req.user.role === 'gestao' || req.user.role === 'atendente';
    return { data, papers: seesPapers ? papers : [] };
  });

  /* ---------- tempo real ---------- */
  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string }).token;
    try { app.jwt.verify(token ?? ''); } catch { socket.close(4401, 'unauthorized'); return; }
    const off = events.subscribe((e) => socket.send(JSON.stringify(e)));
    socket.on('close', off);
  });

  const ctx: Ctx = { app, db, config, events, sender, guard, run };
  registerBusinessRoutes(ctx);
  return app;
}
