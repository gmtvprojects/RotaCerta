import { randomInt } from 'node:crypto';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import type { Ctx } from '../app';
import { hashPassword } from '../auth/password';
import { revokeAll } from '../auth/sessions';
import { audit } from '../db/audit';
import { schema } from '../db/client';
import { createCompanyWithManager } from '../db/companies';
import { withTenant } from '../db/tenants';
import { toDto } from './auth';
import * as body from './schemas';

const PLATFORM = ['plataforma'] as const;

/** Sem caracteres que se confundem (0/O, 1/l/I): a senha provisória é lida e digitada por uma pessoa. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const temporaryPassword = (length = 14) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

type Rows<T> = { rows: T[] };

/**
 * Painel de quem opera o serviço: empresas, acessos e senhas. Só metadados: o perfil `plataforma` nunca lê entregas,
 * clientes ou posições de uma empresa (o resumo de uso traz apenas contagens).
 */
export function registerPlatformRoutes({ app, db, guard }: Ctx) {
  const parse = <T>(zod: ZodType<T>, req: FastifyRequest, reply: FastifyReply): T | undefined => {
    const p = zod.safeParse(req.body ?? {});
    if (p.success) return p.data;
    reply.code(400).send({ error: p.error.issues[0]?.message ?? 'Dados inválidos.', issues: p.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return undefined;
  };
  const idOf = (req: FastifyRequest, key = 'id') => Number((req.params as Record<string, string>)[key]);
  /** Ações da plataforma ficam na auditoria da empresa afetada: a gestão vê quando o suporte mexeu em algo. */
  const log = (req: FastifyRequest, companyId: number | null, action: string, target: string | null, detail?: Record<string, unknown>) =>
    audit(db, { companyId, userId: req.user.sub, userName: `${req.user.name} (plataforma)`, action, target, status: 200, detail: detail ?? null, ip: req.ip }, req.log);
  const findCompany = async (id: number) => (await db.select().from(schema.companies).where(eq(schema.companies.id, id)))[0];

  /* ---------- empresas ---------- */
  app.get('/api/platform/companies', { preHandler: guard(PLATFORM) }, async () => {
    const { rows } = await db.execute(sql`
      select c.id, c.name, c.active, c.created_at as "createdAt",
        count(u.id)::int as users, (count(u.id) filter (where u.active))::int as "activeUsers",
        (select max(a.at) from audit_log a where a.company_id = c.id and a.action = 'auth.login') as "lastLogin"
      from companies c left join users u on u.company_id = c.id
      group by c.id order by c.name`) as unknown as Rows<Record<string, unknown>>;
    return rows;
  });

  app.post('/api/platform/companies', { preHandler: guard(PLATFORM) }, async (req, reply) => {
    const p = parse(body.companyCreate, req, reply); if (!p) return;
    const created = await createCompanyWithManager(db, {
      name: p.name, manager: { name: p.manager.name, email: p.manager.email, passwordHash: await hashPassword(p.manager.password) },
    });
    if (!created.ok) return reply.code(422).send({ error: created.error });
    await log(req, created.companyId, 'platform.company.create', String(created.companyId), { name: p.name, manager: p.manager.email.toLowerCase() });
    return reply.code(201).send({ id: created.companyId, name: p.name, managerId: created.managerId });
  });

  /** Dados cadastrais e um resumo de uso (somente contagens; o conteúdo da operação não é lido). */
  app.get('/api/platform/companies/:id', { preHandler: guard(PLATFORM) }, async (req, reply) => {
    const id = idOf(req);
    const company = await findCompany(id);
    if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });
    const usage = await withTenant(db, id, async (tx) => {
      const count = async (table: string) => Number(((await tx.execute(sql.raw(`select count(*) as n from ${table}`))) as unknown as Rows<{ n: string | number }>).rows[0]?.n ?? 0);
      return { orders: await count('orders'), clients: await count('clients'), vehicles: await count('vehicles'), drivers: await count('drivers'), routes: await count('routes') };
    });
    return { ...company, usage };
  });

  app.patch('/api/platform/companies/:id', { preHandler: guard(PLATFORM) }, async (req, reply) => {
    const p = parse(body.companyPatch, req, reply); if (!p) return;
    const id = idOf(req);
    const current = await findCompany(id);
    if (!current) return reply.code(404).send({ error: 'Empresa não encontrada.' });
    const [updated] = await db.update(schema.companies).set({ name: p.name ?? current.name, active: p.active ?? current.active }).where(eq(schema.companies.id, id)).returning();
    // suspender derruba as sessões de todos: o token de acesso vence em minutos e a renovação passa a ser recusada
    if (current.active && !updated.active) {
      await db.execute(sql`update refresh_tokens set revoked_at = now() where revoked_at is null and user_id in (select id from users where company_id = ${id})`);
    }
    await log(req, id, current.active !== updated.active ? (updated.active ? 'platform.company.reactivate' : 'platform.company.suspend') : 'platform.company.update', String(id), { name: updated.name, active: updated.active });
    return updated;
  });

  /* ---------- acessos de uma empresa ---------- */
  app.get('/api/platform/companies/:id/users', { preHandler: guard(PLATFORM) }, async (req, reply) => {
    const id = idOf(req);
    if (!(await findCompany(id))) return reply.code(404).send({ error: 'Empresa não encontrada.' });
    return (await db.select().from(schema.users).where(eq(schema.users.companyId, id)).orderBy(schema.users.name)).map(toDto);
  });

  app.post('/api/platform/companies/:id/users', { preHandler: guard(PLATFORM) }, async (req, reply) => {
    const p = parse(body.platformUserCreate, req, reply); if (!p) return;
    const id = idOf(req);
    if (!(await findCompany(id))) return reply.code(404).send({ error: 'Empresa não encontrada.' });
    const email = p.email.toLowerCase();
    const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (dup) return reply.code(422).send({ error: 'Já existe um usuário com este e-mail.' });
    // quem entra com a senha escolhida pelo suporte troca no primeiro acesso
    const [created] = await db.insert(schema.users).values({ companyId: id, name: p.name.trim(), email, role: p.role, passwordHash: await hashPassword(p.password), mustChangePassword: true }).returning();
    await log(req, id, 'platform.user.create', String(created.id), { email, role: p.role });
    return reply.code(201).send(toDto(created));
  });

  /** Procura um usuário em qualquer empresa (apoio ao suporte). */
  app.get('/api/platform/users', { preHandler: guard(PLATFORM) }, async (req) => {
    const q = String((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = await db.select({ user: schema.users, company: schema.companies.name }).from(schema.users)
      .leftJoin(schema.companies, eq(schema.users.companyId, schema.companies.id))
      .where(or(ilike(schema.users.email, like), ilike(schema.users.name, like))).orderBy(schema.users.name).limit(30);
    return rows.map((r) => ({ ...toDto(r.user), companyId: r.user.companyId, company: r.company }));
  });

  app.patch('/api/platform/users/:id', { preHandler: guard(PLATFORM) }, async (req, reply) => {
    const p = parse(body.platformUserPatch, req, reply); if (!p) return;
    const id = idOf(req);
    const [current] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    // o suporte atua sobre usuários de empresas; contas da própria plataforma são geridas à parte
    if (!current || current.role === 'plataforma') return reply.code(404).send({ error: 'Usuário não encontrado.' });
    const active = p.active ?? current.active;
    const [updated] = await db.update(schema.users).set({ name: p.name?.trim() ?? current.name, active }).where(eq(schema.users.id, id)).returning();
    if (!active) await revokeAll(db, id);
    await log(req, current.companyId, 'platform.user.update', String(id), { active });
    return toDto(updated);
  });

  /** Gera uma senha provisória, devolvida uma única vez. Quem entra com ela é obrigado a trocar. */
  app.post('/api/platform/users/:id/reset-password', { preHandler: guard(PLATFORM) }, async (req, reply) => {
    const id = idOf(req);
    const [current] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (!current || current.role === 'plataforma') return reply.code(404).send({ error: 'Usuário não encontrado.' });
    const password = temporaryPassword();
    await db.update(schema.users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(schema.users.id, id));
    await revokeAll(db, id);
    await log(req, current.companyId, 'platform.user.password_reset', String(id), { email: current.email });
    // nunca vai para o log: a senha só existe nesta resposta
    reply.header('Cache-Control', 'no-store');
    return { password };
  });

  /* ---------- auditoria geral ---------- */
  app.get('/api/platform/audit', { preHandler: guard(PLATFORM) }, async (req) => {
    const q = req.query as { companyId?: string; action?: string; before?: string; limit?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    return db.select().from(schema.auditLog).where(and(
      q.companyId ? eq(schema.auditLog.companyId, Number(q.companyId)) : undefined,
      q.action ? sql`${schema.auditLog.action} like ${`${q.action}%`}` : undefined,
      q.before ? sql`${schema.auditLog.id} < ${Number(q.before)}` : undefined,
    )).orderBy(desc(schema.auditLog.id)).limit(limit);
  });
}
