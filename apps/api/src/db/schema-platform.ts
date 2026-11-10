import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AnyRole } from '@rotacerta/domain';

/** Tabelas compartilhadas por todas as empresas (schema `public`): quem são as empresas, os logins, as sessões e a auditoria. */

/** Empresa cliente do serviço. Os dados dela ficam no schema `tenant_<id>`. */
export const companies = pgTable('companies', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  /** Empresa suspensa não entra e perde as sessões; os dados são mantidos. */
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Nulo apenas para o perfil `plataforma`. */
  companyId: integer('company_id').references(() => companies.id),
  name: text('name').notNull(),
  /** Único em todo o serviço: o login não pede a empresa. */
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<AnyRole>().notNull(),
  /** Perfil motorista: id do cadastro de motorista dentro do schema da empresa (validado pela API; sem chave estrangeira entre schemas). */
  driverId: integer('driver_id'),
  active: boolean('active').notNull().default(true),
  /** Verdadeiro depois de uma redefinição feita por outra pessoa: a pessoa precisa trocar a senha ao entrar. */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_idx').on(t.email), index('users_company_idx').on(t.companyId)]);

/** Sessões renováveis. Só o hash do token fica no banco; `familyId` liga a cadeia de renovações de um login. */
export const refreshTokens = pgTable('refresh_tokens', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  familyId: text('family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  /** Preenchido só quando o token foi trocado por rotação (diferente de revogado por logout ou reuso). */
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash), index('refresh_tokens_user_idx').on(t.userId)]);

/** Trilha de auditoria: quem fez o quê e quando. Sem corpo de requisição (evita guardar senha e dado pessoal). */
export const auditLog = pgTable('audit_log', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  /** Sem chave estrangeira: o histórico sobrevive à remoção do usuário e da empresa. */
  companyId: integer('company_id'),
  userId: integer('user_id'),
  userName: text('user_name'),
  action: text('action').notNull(),
  target: text('target'),
  status: integer('status'),
  detail: jsonb('detail').$type<Record<string, unknown>>(),
  ip: text('ip'),
}, (t) => [index('audit_log_at_idx').on(t.at), index('audit_log_company_idx').on(t.companyId, t.id)]);
