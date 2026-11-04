import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { BoxInfo, OrderEvent, PaperValues, Role } from '@rotacerta/domain';

/** Colunas simples espelham os tipos de `@rotacerta/domain`; estruturas aninhadas ficam em jsonb. */

export const zones = pgTable('zones', { name: text('name').primaryKey() });

export const neighborhoods = pgTable('neighborhoods', {
  name: text('name').primaryKey(),
  zone: text('zone').notNull().references(() => zones.name),
});

export const vehicles = pgTable('vehicles', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  plate: text('plate').notNull(),
  capacity: integer('capacity').notNull(),
});

export const drivers = pgTable('drivers', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

export const departures = pgTable('departures', { time: text('time').primaryKey() });

export const clients = pgTable('clients', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  neighborhood: text('neighborhood').notNull(),
  street: text('street').notNull(),
  number: text('number').notNull(),
  complement: text('complement').notNull(),
  reference: text('reference').notNull(),
  consent: boolean('consent').notNull(),
});

export const routes = pgTable('routes', {
  id: integer('id').primaryKey(),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id),
  driverId: integer('driver_id').references(() => drivers.id),
  /** Ids das entregas, na ordem das paradas. */
  orders: jsonb('orders').$type<number[]>().notNull(),
  status: text('status').$type<'loading' | 'released' | 'active' | 'finished'>().notNull(),
  departure: text('departure').notNull(),
  created: text('created').notNull(),
  checked: jsonb('checked').$type<Record<string, boolean>>(),
  claimedAt: text('claimed_at'),
  confirmed: jsonb('confirmed').$type<Record<string, boolean>>(),
  audit: jsonb('audit').$type<Record<string, { checked: boolean; at: string; actor: string }>>(),
  signatures: jsonb('signatures').$type<Record<string, string>>(),
  finished: text('finished'),
});

export const orders = pgTable('orders', {
  id: integer('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  neighborhood: text('neighborhood').notNull(),
  street: text('street').notNull(),
  number: text('number').notNull(),
  complement: text('complement').notNull(),
  reference: text('reference').notNull(),
  consent: boolean('consent').notNull(),
  window: text('window').notNull(),
  notes: text('notes').notNull(),
  boxes: jsonb('boxes').$type<string[]>().notNull(),
  boxDetails: jsonb('box_details').$type<Record<string, BoxInfo>>(),
  cold: integer('cold').notNull(),
  frozen: integer('frozen').notNull(),
  gas: integer('gas').notNull(),
  storage: text('storage').notNull(),
  status: text('status').$type<'draft' | 'awaiting' | 'ready' | 'queued' | 'loading' | 'released' | 'onroute' | 'delivered' | 'failed'>().notNull(),
  routeId: integer('route_id').references(() => routes.id),
  created: text('created').notNull(),
  completed: text('completed'),
  receiver: text('receiver'),
  occurrence: jsonb('occurrence').$type<{ reason: string; notes: string }>(),
  history: jsonb('history').$type<OrderEvent[]>().notNull(),
});

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  /** Ordem de criação (mais novo = maior); o domínio lista as mais novas primeiro. */
  seq: bigint('seq', { mode: 'number' }).notNull(),
  routeId: integer('route_id').notNull(),
  orderId: integer('order_id').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  status: text('status').$type<'queued' | 'delivered' | 'failed' | 'skipped'>().notNull(),
  key: text('key'),
  event: text('event').$type<'rota_iniciada' | 'entrega_concluida'>().notNull(),
  created: text('created').notNull(),
  message: text('message').notNull(),
  reason: text('reason').notNull(),
});

export const paperForms = pgTable('paper_forms', {
  id: text('id').primaryKey(),
  sheetNumber: text('sheet_number').notNull(),
  mode: text('mode').$type<'example' | 'photo'>().notNull(),
  photo: text('photo'),
  photoName: text('photo_name'),
  status: text('status').$type<'captured' | 'draft' | 'imported'>().notNull(),
  values: jsonb('values').$type<PaperValues>().notNull(),
  orderId: integer('order_id'),
  createdAt: text('created_at').notNull(),
  importedAt: text('imported_at'),
});

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<Role>().notNull(),
  /** Preenchido para o perfil motorista: vincula o usuário ao cadastro de motorista. */
  driverId: integer('driver_id').references(() => drivers.id),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_idx').on(t.email)]);
