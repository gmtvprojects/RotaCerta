import { desc, getTableColumns, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Client, Dataset, Notification, Order, PaperForm, Route, Workspace } from '@rotacerta/domain';
import type { Db } from './client';
import * as t from './schema';

/** Remove as chaves opcionais que vieram nulas do banco (o domínio usa "ausente", não null). */
function dropNull<T extends object>(obj: T, keys: string[]): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of keys) if (out[k] === null) delete out[k];
  return out as T;
}

const orderFromRow = (r: typeof t.orders.$inferSelect): Order =>
  dropNull(r, ['boxDetails', 'receiver', 'occurrence']) as unknown as Order;
const routeFromRow = (r: typeof t.routes.$inferSelect): Route =>
  dropNull(r, ['checked', 'claimedAt', 'confirmed', 'audit', 'signatures', 'finished']) as unknown as Route;
const noticeFromRow = ({ seq: _seq, ...r }: typeof t.notifications.$inferSelect): Notification => dropNull(r, ['key']) as unknown as Notification;
const paperFromRow = (r: typeof t.paperForms.$inferSelect): PaperForm => dropNull(r, ['photo', 'photoName', 'importedAt']) as unknown as PaperForm;

const orderToRow = (o: Order): typeof t.orders.$inferInsert => ({
  ...o, boxDetails: o.boxDetails ?? null, receiver: o.receiver ?? null, occurrence: o.occurrence ?? null,
});
const routeToRow = (r: Route): typeof t.routes.$inferInsert => ({
  ...r, checked: r.checked ?? null, claimedAt: r.claimedAt ?? null, confirmed: r.confirmed ?? null,
  audit: r.audit ?? null, signatures: r.signatures ?? null, finished: r.finished ?? null,
});
const noticeToRow = (n: Notification) => ({ ...n, key: n.key ?? null });
const paperToRow = (p: PaperForm): typeof t.paperForms.$inferInsert => ({
  ...p, photo: p.photo ?? null, photoName: p.photoName ?? null, importedAt: p.importedAt ?? null,
});

const byId = <T extends { id: number }>(a: T, b: T) => a.id - b.id;

/** Lê tudo o que as regras do domínio precisam para decidir. */
export async function loadWorkspace(db: Db): Promise<Workspace> {
  // em sequência: dentro de uma transação todas as consultas usam a mesma conexão
  const zs = await db.select().from(t.zones);
  const ns = await db.select().from(t.neighborhoods);
  const vs = await db.select().from(t.vehicles);
  const ds = await db.select().from(t.drivers);
  const deps = await db.select().from(t.departures);
  const cs = await db.select().from(t.clients);
  const rs = await db.select().from(t.routes);
  const os = await db.select().from(t.orders);
  const nts = await db.select().from(t.notifications).orderBy(desc(t.notifications.seq));
  const ps = await db.select().from(t.paperForms);
  const data: Dataset = {
    zones: zs.map((z) => z.name),
    neighborhoods: ns,
    vehicles: vs.sort(byId),
    drivers: ds.sort(byId),
    departures: deps.map((d) => d.time).sort(),
    clients: cs.sort(byId) as Client[],
    routes: rs.sort(byId).map(routeFromRow),
    orders: os.sort(byId).map(orderFromRow),
    // as notificações mais novas ficam primeiro; `created` é só a hora, então a ordem de gravação é preservada pelo id
    notifications: nts.map(noticeFromRow),
  };
  return { data, papers: ps.map(paperFromRow) };
}

type Row = Record<string, unknown>;

interface SyncOptions {
  /** Completa as linhas novas ou alteradas antes de gravar. */
  decorate?: (row: Row, index: number, total: number) => Row;
  /** Colunas que nunca mudam depois de criadas. */
  keep?: string[];
}

/** Grava as linhas novas/alteradas já e devolve a remoção, que só pode rodar depois das tabelas que dependem desta. */
async function syncTable(db: Db, table: PgTable, pk: PgColumn, before: Row[], after: Row[], keyOf: (r: Row) => string | number, opts: SyncOptions = {}): Promise<() => Promise<void>> {
  const old = new Map(before.map((r) => [keyOf(r), JSON.stringify(r)]));
  const keep = new Set(after.map(keyOf));
  const changed = after.filter((r) => old.get(keyOf(r)) !== JSON.stringify(r)).map((r, i, all) => (opts.decorate ? opts.decorate(r, i, all.length) : r));
  const removed = before.filter((r) => !keep.has(keyOf(r))).map(keyOf);

  if (changed.length) {
    const cols = getTableColumns(table);
    const update = Object.entries(cols).filter(([k, c]) => c !== pk && !opts.keep?.includes(k)).map(([k, c]) => [k, sql.raw(`excluded."${c.name}"`)] as const);
    const q = db.insert(table).values(changed);
    await (update.length ? q.onConflictDoUpdate({ target: pk, set: Object.fromEntries(update) }) : q.onConflictDoNothing());
  }
  return async () => { if (removed.length) await db.delete(table).where(sql`${pk} in ${removed}`); };
}

/** Grava só o que mudou entre `before` e `after`. Ordem respeita as chaves estrangeiras. */
export async function saveWorkspace(db: Db, before: Workspace, after: Workspace): Promise<void> {
  const b = before.data;
  const a = after.data;
  const rows = <T, R>(list: T[], fn: (x: T) => R) => list.map(fn) as unknown as Row[];
  const id = (r: Row) => r.id as number;
  const plain = <T>(list: T[]) => list as unknown as Row[];

  const removals: Array<() => Promise<void>> = [];
  removals.push(await syncTable(db, t.zones, t.zones.name, plain(b.zones.map((name) => ({ name }))), plain(a.zones.map((name) => ({ name }))), (r) => r.name as string));
  removals.push(await syncTable(db, t.neighborhoods, t.neighborhoods.name, plain(b.neighborhoods), plain(a.neighborhoods), (r) => r.name as string));
  removals.push(await syncTable(db, t.vehicles, t.vehicles.id, plain(b.vehicles), plain(a.vehicles), id));
  removals.push(await syncTable(db, t.drivers, t.drivers.id, plain(b.drivers), plain(a.drivers), id));
  removals.push(await syncTable(db, t.departures, t.departures.time, plain(b.departures.map((time) => ({ time }))), plain(a.departures.map((time) => ({ time }))), (r) => r.time as string));
  removals.push(await syncTable(db, t.clients, t.clients.id, plain(b.clients), plain(a.clients), id));
  removals.push(await syncTable(db, t.routes, t.routes.id, rows(b.routes, routeToRow), rows(a.routes, routeToRow), id));
  removals.push(await syncTable(db, t.orders, t.orders.id, rows(b.orders, orderToRow), rows(a.orders, orderToRow), id));
  removals.push(await syncTable(db, t.notifications, t.notifications.id, rows(b.notifications, noticeToRow), rows(a.notifications, noticeToRow), (r) => r.id as string, {
    // notificações novas recebem seq crescente; as existentes mantêm a posição
    decorate: (r, i, n) => ({ ...r, seq: Date.now() * 1000 + (n - i) }),
    keep: ['seq'],
  }));
  removals.push(await syncTable(db, t.paperForms, t.paperForms.id, rows(before.papers, paperToRow), rows(after.papers, paperToRow), (r) => r.id as string));
  // remoções na ordem inversa das dependências
  for (const remove of removals.reverse()) await remove();
}
