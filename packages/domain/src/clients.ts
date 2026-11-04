import type { Clock, Cmd } from './commands';
import { validateDelivery } from './commands';
import type { Client, Dataset, DeliveryForm, Order } from './types';
import { DELIVERY_WINDOWS } from './types';

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const digits = (s: string) => s.replace(/\D/g, '');
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Entregas que ainda aceitam correção de endereço e telefone. */
const OPEN: Order['status'][] = ['draft', 'awaiting', 'ready', 'queued', 'loading', 'released'];

export interface ClientSearch { items: (Client & { orders: number })[]; total: number }

/** Busca por nome ou telefone (sem acento, sem pontuação), em ordem alfabética, com paginação. */
export function searchClients(d: Dataset, q: string, limit = 20, offset = 0): ClientSearch {
  const text = fold(q.trim());
  const num = digits(q);
  const counts = new Map<number, number>();
  for (const o of d.orders) counts.set(o.clientId, (counts.get(o.clientId) ?? 0) + 1);
  const hits = d.clients
    .filter((c) => !text || fold(c.name).includes(text) || (num.length >= 3 && digits(c.phone).includes(num)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { total: hits.length, items: hits.slice(offset, offset + limit).map((c) => ({ ...c, orders: counts.get(c.id) ?? 0 })) };
}

/** Todas as entregas do cliente, da mais recente para a mais antiga. */
export const clientHistory = (d: Dataset, clientId: number): Order[] => d.orders.filter((o) => o.clientId === clientId).sort((a, b) => b.id - a.id);

export type ClientPatch = Partial<Pick<Client, 'name' | 'phone' | 'neighborhood' | 'street' | 'number' | 'complement' | 'reference' | 'consent'>>;

/** Corrige o cadastro. Com `applyToOpen`, as entregas ainda não saídas recebem os mesmos dados. */
export function updateClient(d: Dataset, id: number, patch: ClientPatch, applyToOpen: boolean, clock: Clock, actor: string): Cmd {
  const c = d.clients.find((x) => x.id === id);
  if (!c) return fail('Cliente não encontrado.');
  const next: Client = { ...c, ...patch };
  const form: DeliveryForm = { ...next, clientId: id, window: DELIVERY_WINDOWS[0], notes: '' };
  const error = validateDelivery(d, form);
  if (error) return fail(error);
  const clash = d.clients.find((x) => x.id !== id && digits(x.phone) === digits(next.phone));
  if (clash) return fail(`Este telefone já pertence a ${clash.name}. Una os dois cadastros em vez de repetir.`);
  const clean: Client = { ...next, name: next.name.trim(), phone: next.phone.trim(), street: next.street.trim(), number: next.number.trim(), complement: next.complement.trim(), reference: next.reference.trim() };
  return {
    ok: true,
    data: {
      ...d,
      clients: d.clients.map((x) => (x.id === id ? clean : x)),
      orders: applyToOpen
        ? d.orders.map((o) => (o.clientId === id && OPEN.includes(o.status)
          ? { ...o, name: clean.name, phone: clean.phone, neighborhood: clean.neighborhood, street: clean.street, number: clean.number, complement: clean.complement, reference: clean.reference, consent: clean.consent, history: [...o.history, { label: 'Dados do cliente atualizados', time: clock.time, actor }] }
          : o))
        : d.orders,
    },
  };
}

/** Une dois cadastros do mesmo cliente: as entregas do duplicado passam para `keepId`, que mantém os próprios dados. */
export function mergeClients(d: Dataset, keepId: number, dropId: number, clock: Clock, actor: string): Cmd {
  if (keepId === dropId) return fail('Escolha dois cadastros diferentes.');
  const keep = d.clients.find((x) => x.id === keepId);
  const drop = d.clients.find((x) => x.id === dropId);
  if (!keep || !drop) return fail('Cliente não encontrado.');
  return {
    ok: true,
    data: {
      ...d,
      clients: d.clients.filter((x) => x.id !== dropId),
      orders: d.orders.map((o) => (o.clientId === dropId
        ? { ...o, clientId: keepId, history: [...o.history, { label: `Cadastro unido ao de ${keep.name}`, time: clock.time, actor }] }
        : o)),
    },
  };
}

/** Só remove cadastro sem nenhuma entrega. */
export function removeClient(d: Dataset, id: number): Cmd {
  if (!d.clients.some((x) => x.id === id)) return fail('Cliente não encontrado.');
  const n = d.orders.filter((o) => o.clientId === id).length;
  if (n) return fail(`Este cliente tem ${n} entrega(s) no histórico. Una com outro cadastro em vez de remover.`);
  return { ok: true, data: { ...d, clients: d.clients.filter((x) => x.id !== id) } };
}
