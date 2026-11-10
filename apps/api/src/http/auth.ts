import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import { ANY_ROLE_LABELS, type AnyRole, type Role } from '@rotacerta/domain';
import type { Ctx } from '../app';
import { hashPassword, verifyPassword } from '../auth/password';
import { endSession, revokeAll, rotateSession, startSession } from '../auth/sessions';
import { schema } from '../db/client';
import { audit } from '../db/audit';
import { withTenant } from '../db/tenants';
import type { AuthUser } from './context';
import * as body from './schemas';

const COOKIE = 'rc_refresh';
const COMPANY_ROLES: Role[] = ['gestao', 'atendente', 'expedicao', 'motorista'];
const ALL_ROLES: AnyRole[] = [...COMPANY_ROLES, 'plataforma'];

type UserRow = typeof schema.users.$inferSelect;
const toAuth = (u: UserRow): AuthUser => ({ sub: u.id, name: u.name, role: u.role, companyId: u.companyId, driverId: u.driverId });
export const toDto = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role, roleLabel: ANY_ROLE_LABELS[u.role], driverId: u.driverId, active: u.active, createdAt: u.createdAt });

export function registerAuthRoutes({ app, db, config, guard, company }: Ctx) {
  const secure = (config.COOKIE_SECURE ?? String(config.NODE_ENV === 'production')) === 'true';
  if (config.COOKIE_SAMESITE === 'none' && !secure) throw new Error('COOKIE_SAMESITE=none exige COOKIE_SECURE=true (HTTPS).');

  const setCookie = (reply: FastifyReply, raw: string) => reply.setCookie(COOKIE, raw, {
    httpOnly: true, secure, sameSite: config.COOKIE_SAMESITE, path: '/api/auth', maxAge: config.REFRESH_DAYS * 86_400,
  });
  const clearCookie = (reply: FastifyReply) => reply.clearCookie(COOKIE, { path: '/api/auth', httpOnly: true, secure, sameSite: config.COOKIE_SAMESITE });
  const session = (user: UserRow) => { const payload = toAuth(user); return { token: app.jwt.sign(payload), user: payload, mustChangePassword: user.mustChangePassword }; };
  const ua = (req: FastifyRequest) => String(req.headers['user-agent'] ?? '').slice(0, 200);

  /** Empresa suspensa não entra. O perfil da plataforma não tem empresa. */
  const companyActive = async (user: UserRow): Promise<boolean> => {
    if (user.companyId == null) return user.role === 'plataforma';
    const [c] = await db.select({ active: schema.companies.active }).from(schema.companies).where(eq(schema.companies.id, user.companyId));
    return !!c?.active;
  };

  /** Defesa contra CSRF nas rotas que usam o cookie: exige um cabeçalho próprio, que o navegador só envia após o CORS liberar. */
  const sameApp = (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers['x-requested-with'] === 'rotacerta') return true;
    reply.code(403).send({ error: 'Requisição não permitida.' });
    return false;
  };
  const parse = <T>(schema: ZodType<T>, req: FastifyRequest, reply: FastifyReply): T | undefined => {
    const p = schema.safeParse(req.body ?? {});
    if (p.success) return p.data;
    reply.code(400).send({ error: p.error.issues[0]?.message ?? 'Dados inválidos.', issues: p.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return undefined;
  };
  const who = (req: FastifyRequest) => ({ companyId: req.user.companyId, userId: req.user.sub, userName: req.user.name, ip: req.ip });

  /* ---------- sessão ---------- */
  app.post('/api/auth/login', { config: { rateLimit: { max: config.LOGIN_RATE_MAX, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = parse(body.login, req, reply); if (!p) return;
    const email = p.email.toLowerCase();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    // mesma resposta para e-mail inexistente, usuário desativado e senha errada
    const valid = user?.active && await verifyPassword(p.password, user.passwordHash);
    if (!user || !valid) {
      // se o e-mail existe, a tentativa fica na auditoria da empresa dele (a gestão vê quem tentou entrar como a equipe)
      await audit(db, { companyId: user?.companyId, action: 'auth.login_failed', status: 401, detail: { email }, ip: req.ip }, req.log);
      return reply.code(401).send({ error: 'E-mail ou senha incorretos.' });
    }
    // a senha está certa: aqui já é seguro dizer que a empresa está suspensa
    if (!(await companyActive(user))) {
      await audit(db, { companyId: user.companyId, action: 'auth.login_suspended', userId: user.id, userName: user.name, status: 403, ip: req.ip }, req.log);
      return reply.code(403).send({ error: 'O acesso da sua empresa está suspenso. Fale com o suporte.' });
    }
    setCookie(reply, await startSession(db, user.id, config.REFRESH_DAYS, ua(req)));
    await audit(db, { companyId: user.companyId, action: 'auth.login', userId: user.id, userName: user.name, status: 200, ip: req.ip }, req.log);
    return session(user);
  });

  app.post('/api/auth/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!sameApp(req, reply)) return;
    const raw = req.cookies[COOKIE];
    if (!raw) return reply.code(401).send({ error: 'Sem sessão.' });
    const rotated = await rotateSession(db, raw, config.REFRESH_DAYS, ua(req));
    if (!rotated.ok) {
      clearCookie(reply);
      if (rotated.reason === 'reuse') await audit(db, { action: 'auth.refresh_reuse', userId: rotated.userId, status: 401, ip: req.ip }, req.log);
      return reply.code(401).send({ error: 'Sessão expirada. Entre novamente.' });
    }
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, rotated.userId));
    if (!user?.active) { await endSession(db, rotated.token); clearCookie(reply); return reply.code(401).send({ error: 'Usuário desativado.' }); }
    if (!(await companyActive(user))) { await endSession(db, rotated.token); clearCookie(reply); return reply.code(401).send({ error: 'O acesso da sua empresa está suspenso.' }); }
    setCookie(reply, rotated.token);
    return session(user);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (!sameApp(req, reply)) return;
    const raw = req.cookies[COOKIE];
    if (raw) await endSession(db, raw);
    clearCookie(reply);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: guard(ALL_ROLES) }, async (req) => req.user);

  /** Ticket de vida curta para abrir o WebSocket sem colocar o token de acesso na URL. Só perfis de empresa. */
  app.post('/api/auth/ws-ticket', { preHandler: guard(COMPANY_ROLES) }, async (req) => ({
    ticket: app.jwt.sign({ purpose: 'ws', sub: req.user.sub, viewer: req.user.role, company: company(req) } as never, { expiresIn: '30s' }),
  }));

  app.post('/api/auth/password', { preHandler: guard(ALL_ROLES), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = parse(body.changePassword, req, reply); if (!p) return;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, req.user.sub));
    if (!user || !(await verifyPassword(p.current, user.passwordHash))) return reply.code(422).send({ error: 'A senha atual está incorreta.' });
    await db.update(schema.users).set({ passwordHash: await hashPassword(p.password), mustChangePassword: false }).where(eq(schema.users.id, user.id));
    await revokeAll(db, user.id);
    setCookie(reply, await startSession(db, user.id, config.REFRESH_DAYS, ua(req)));
    await audit(db, { ...who(req), action: 'auth.password_change', status: 200 }, req.log);
    return { ok: true };
  });

  /* ---------- gestão de usuários da empresa (somente gestão) ---------- */
  const GESTAO: Role[] = ['gestao'];

  /** Regras de vínculo: motorista precisa de cadastro de motorista livre da mesma empresa; os demais perfis não têm vínculo. */
  async function checkLink(companyId: number, role: Role, driverId: number | null, selfId?: number): Promise<string | null> {
    if (role !== 'motorista') return null;
    if (driverId == null) return 'Escolha o cadastro de motorista deste usuário.';
    const [driver] = await withTenant(db, companyId, (tx) => tx.select().from(schema.drivers).where(eq(schema.drivers.id, driverId)));
    if (!driver) return 'Motorista não encontrado.';
    const taken = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(schema.users.companyId, companyId), eq(schema.users.driverId, driverId), eq(schema.users.active, true)));
    if (taken.some((u) => u.id !== selfId)) return 'Este motorista já tem um usuário ativo.';
    return null;
  }
  const activeManagers = async (companyId: number) => Number((await db.select({ n: sql<number>`count(*)` }).from(schema.users)
    .where(and(eq(schema.users.companyId, companyId), eq(schema.users.role, 'gestao'), eq(schema.users.active, true))))[0]?.n ?? 0);
  /** Usuário só é visível para a gestão da própria empresa. */
  const inCompany = (companyId: number, id: number) => and(eq(schema.users.id, id), eq(schema.users.companyId, companyId));

  app.get('/api/users', { preHandler: guard(GESTAO) }, async (req) =>
    (await db.select().from(schema.users).where(eq(schema.users.companyId, company(req))).orderBy(schema.users.name)).map(toDto));

  app.post('/api/users', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const p = parse(body.userCreate, req, reply); if (!p) return;
    const companyId = company(req);
    const email = p.email.toLowerCase();
    const driverId = p.role === 'motorista' ? p.driverId : null;
    const problem = await checkLink(companyId, p.role, driverId);
    if (problem) return reply.code(422).send({ error: problem });
    const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (dup) return reply.code(422).send({ error: 'Já existe um usuário com este e-mail.' });
    const [created] = await db.insert(schema.users).values({ companyId, name: p.name.trim(), email, role: p.role, driverId, passwordHash: await hashPassword(p.password) }).returning();
    await audit(db, { ...who(req), action: 'user.create', target: String(created.id), status: 200, detail: { email, role: p.role } }, req.log);
    return reply.code(201).send(toDto(created));
  });

  app.patch('/api/users/:id', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const p = parse(body.userPatch, req, reply); if (!p) return;
    const companyId = company(req);
    const id = Number((req.params as { id: string }).id);
    const [current] = await db.select().from(schema.users).where(inCompany(companyId, id));
    if (!current) return reply.code(404).send({ error: 'Usuário não encontrado.' });
    const role = (p.role ?? current.role) as Role;
    const active = p.active ?? current.active;
    const driverId = role === 'motorista' ? (p.driverId !== undefined ? p.driverId : current.driverId) : null;
    if (active) {
      const problem = await checkLink(companyId, role, driverId, id);
      if (problem) return reply.code(422).send({ error: problem });
    }
    // nunca deixar a empresa sem ninguém na gestão
    if (current.role === 'gestao' && current.active && (role !== 'gestao' || !active) && (await activeManagers(companyId)) <= 1) {
      return reply.code(422).send({ error: 'Mantenha ao menos um usuário ativo na gestão.' });
    }
    const [updated] = await db.update(schema.users).set({ name: p.name?.trim() ?? current.name, role, driverId, active }).where(inCompany(companyId, id)).returning();
    // sai da sessão quem foi desativado ou mudou de perfil: o token de acesso expira em minutos e não é renovado
    if (!active || role !== current.role) await revokeAll(db, id);
    await audit(db, { ...who(req), action: 'user.update', target: String(id), status: 200, detail: { role, active, driverId } }, req.log);
    return toDto(updated);
  });

  app.post('/api/users/:id/password', { preHandler: guard(GESTAO) }, async (req, reply) => {
    const p = parse(body.passwordOnly, req, reply); if (!p) return;
    const id = Number((req.params as { id: string }).id);
    // senha definida por outra pessoa: quem entra com ela precisa trocar no primeiro acesso
    const done = await db.update(schema.users).set({ passwordHash: await hashPassword(p.password), mustChangePassword: true }).where(inCompany(company(req), id)).returning({ id: schema.users.id });
    if (!done.length) return reply.code(404).send({ error: 'Usuário não encontrado.' });
    await revokeAll(db, id);
    await audit(db, { ...who(req), action: 'user.password_reset', target: String(id), status: 200 }, req.log);
    return { ok: true };
  });

  /* ---------- auditoria da empresa (somente gestão) ---------- */
  app.get('/api/audit', { preHandler: guard(GESTAO) }, async (req) => {
    const q = req.query as { limit?: string; before?: string; action?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    const rows = await db.select().from(schema.auditLog)
      .where(and(
        eq(schema.auditLog.companyId, company(req)),
        q.action ? sql`${schema.auditLog.action} like ${`${q.action}%`}` : undefined,
        q.before ? sql`${schema.auditLog.id} < ${Number(q.before)}` : undefined,
      ))
      .orderBy(desc(schema.auditLog.id)).limit(limit);
    return rows;
  });

}
