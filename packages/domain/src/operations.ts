import type { Clock, Cmd } from './commands';
import { validateDelivery } from './commands';
import type { Dataset, DeliveryForm, Order, Route } from './types';
import { DELIVERY_WINDOWS } from './types';

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const event = (o: Order, label: string, clock: Clock, actor: string): Order['history'] => [...o.history, { label, time: clock.time, actor }];

/** Entregas que ainda podem mudar de dados ou de carga. */
const OPEN: Order['status'][] = ['draft', 'awaiting', 'ready', 'queued', 'loading', 'released'];

/* ---------- editar e cancelar entrega ---------- */

export type OrderPatch = Partial<Pick<DeliveryForm, 'name' | 'phone' | 'neighborhood' | 'street' | 'number' | 'complement' | 'reference' | 'window' | 'notes' | 'consent'>>;

const FIELD_LABELS: Record<keyof OrderPatch, string> = {
  name: 'nome', phone: 'telefone', neighborhood: 'bairro', street: 'rua', number: 'número', complement: 'complemento',
  reference: 'referência', window: 'janela', notes: 'observações', consent: 'autorização de aviso',
};

/** Corrige cliente, endereço, janela ou observação enquanto a entrega ainda não saiu. */
export function updateOrder(d: Dataset, orderId: number, patch: OrderPatch, clock: Clock, actor: string): Cmd {
  const o = d.orders.find((x) => x.id === orderId);
  if (!o) return fail('Entrega não encontrada.');
  if (!OPEN.includes(o.status)) return fail('Só é possível editar uma entrega que ainda não saiu para a rota.');
  const next = { ...o, ...patch };
  const form: DeliveryForm = {
    clientId: o.clientId, name: next.name, phone: next.phone, neighborhood: next.neighborhood, street: next.street, number: next.number,
    complement: next.complement, reference: next.reference, window: next.window, notes: next.notes, consent: next.consent,
  };
  const error = validateDelivery(d, form);
  if (error) return fail(error);
  const changed = (Object.keys(patch) as (keyof OrderPatch)[]).filter((k) => patch[k] !== undefined && patch[k] !== o[k]);
  if (!changed.length) return fail('Nada foi alterado.');
  const trimmed = Object.fromEntries(changed.map((k) => [k, typeof patch[k] === 'string' ? (patch[k] as string).trim() : patch[k]]));
  return {
    ok: true,
    data: { ...d, orders: d.orders.map((x) => (x.id === orderId ? { ...x, ...trimmed, history: event(x, `Dados alterados: ${changed.map((k) => FIELD_LABELS[k]).join(', ')}`, clock, actor) } : x)) },
  };
}

/** Tira a entrega de uma carga ainda não iniciada, limpando o que já tinha sido conferido dela. */
function detachFromRoute(d: Dataset, o: Order): Dataset {
  const r = d.routes.find((x) => x.id === o.routeId);
  if (!r || (r.status !== 'loading' && r.status !== 'released')) return d;
  const orders = r.orders.filter((id) => id !== o.id);
  if (!orders.length) return { ...d, routes: d.routes.filter((x) => x.id !== r.id) };
  const prefix = `${o.id}:`;
  const dropKeys = <T,>(rec?: Record<string, T>) => rec && Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith(prefix)));
  const dropOrder = <T,>(rec?: Record<string, T>) => rec && Object.fromEntries(Object.entries(rec).filter(([k]) => k !== String(o.id)));
  const next: Route = { ...r, orders, checked: dropKeys(r.checked), audit: dropKeys(r.audit), confirmed: dropOrder(r.confirmed), signatures: dropOrder(r.signatures) };
  return { ...d, routes: d.routes.map((x) => (x.id === r.id ? next : x)) };
}

/** Cancela a entrega. Em rota, o motorista registra ocorrência (não cancelamento); depois de entregue, não há o que cancelar. */
export function cancelOrder(d: Dataset, orderId: number, reason: string, clock: Clock, actor: string): Cmd {
  const o = d.orders.find((x) => x.id === orderId);
  if (!o) return fail('Entrega não encontrada.');
  if (o.status === 'cancelled') return fail('Esta entrega já está cancelada.');
  if (o.status === 'delivered') return fail('Uma entrega concluída não pode ser cancelada.');
  if (o.status === 'onroute') return fail('A entrega está com o motorista. Ele registra a ocorrência na parada, ou a viagem é interrompida.');
  if (reason.trim().length < 3) return fail('Informe o motivo do cancelamento.');
  const detached = detachFromRoute(d, o);
  const inOpenRoute = detached !== d;
  return {
    ok: true,
    data: {
      ...detached,
      orders: detached.orders.map((x) => (x.id === orderId
        ? { ...x, status: 'cancelled' as const, routeId: inOpenRoute ? null : x.routeId, cancelled: { reason: reason.trim(), at: clock.stamp, actor }, history: event(x, `Entrega cancelada: ${reason.trim()}`, clock, actor) }
        : x)),
    },
  };
}

/* ---------- entrega não realizada: devolução e nova tentativa ---------- */

/** A expedição confirma que os volumes da entrega que falhou voltaram. */
export function confirmReturn(d: Dataset, orderId: number, clock: Clock, actor: string): Cmd {
  const o = d.orders.find((x) => x.id === orderId);
  if (!o) return fail('Entrega não encontrada.');
  if (o.status !== 'failed') return fail('Só entregas não realizadas têm volumes a devolver.');
  if (o.returned) return fail('A devolução desta entrega já foi confirmada.');
  const r = d.routes.find((x) => x.id === o.routeId);
  if (r && r.status === 'active') return fail('A viagem ainda está em andamento. Confirme a devolução quando o motorista voltar.');
  return { ok: true, data: { ...d, orders: d.orders.map((x) => (x.id === orderId ? { ...x, returned: { at: clock.stamp, actor }, history: event(x, 'Volumes devolvidos à expedição', clock, actor) } : x)) } };
}

/** Recoloca a entrega não realizada na fila (opcionalmente com nova janela ou observação). */
export function requeueOrder(d: Dataset, orderId: number, patch: Pick<OrderPatch, 'window' | 'notes'>, clock: Clock, actor: string): Cmd {
  const o = d.orders.find((x) => x.id === orderId);
  if (!o) return fail('Entrega não encontrada.');
  if (o.status !== 'failed') return fail('Só entregas não realizadas podem ganhar nova tentativa.');
  if (!o.returned) return fail('Confirme a devolução dos volumes antes de agendar nova tentativa.');
  if (patch.window && !(DELIVERY_WINDOWS as readonly string[]).includes(patch.window)) return fail('Escolha uma janela de entrega válida.');
  const { occurrence: _occ, receiver: _rec, returned: _ret, ...rest } = o;
  void _occ; void _rec; void _ret;
  const next: Order = {
    ...rest, window: patch.window ?? o.window, notes: patch.notes?.trim() ?? o.notes,
    status: o.boxes.length ? 'ready' : 'awaiting', routeId: null, completed: null,
    history: event(o, `Nova tentativa agendada (anterior: ${o.occurrence?.reason ?? 'não entregue'})`, clock, actor),
  };
  return { ok: true, data: { ...d, orders: d.orders.map((x) => (x.id === orderId ? next : x)) } };
}

/* ---------- viagem: interromper e trocar de motorista ---------- */

/** Encerra uma viagem em andamento antes do fim: as paradas pendentes viram "não entregue" e seguem o fluxo de devolução. */
export function interruptRoute(d: Dataset, routeId: number, reason: string, clock: Clock, actor: string): Cmd {
  const r = d.routes.find((x) => x.id === routeId);
  if (!r) return fail('Viagem não encontrada.');
  if (r.status !== 'active') return fail('Só é possível interromper uma viagem em andamento.');
  if (reason.trim().length < 3) return fail('Informe o motivo da interrupção.');
  const why = reason.trim();
  return {
    ok: true,
    data: {
      ...d,
      routes: d.routes.map((x) => (x.id === routeId ? { ...x, status: 'finished' as const, finished: clock.time, interrupted: { reason: why, at: clock.stamp, actor } } : x)),
      orders: d.orders.map((o) => (o.routeId === routeId && o.status === 'onroute'
        ? { ...o, status: 'failed' as const, completed: clock.time, occurrence: { reason: 'Viagem interrompida', notes: why }, history: event(o, `Não entregue: viagem interrompida (${why})`, clock, actor) }
        : o)),
    },
  };
}

/** Troca o motorista de uma carga (planejada, liberada ou em andamento). `null` só vale antes da saída. */
export function reassignDriver(d: Dataset, routeId: number, driverId: number | null, clock: Clock, actor: string): Cmd {
  const r = d.routes.find((x) => x.id === routeId);
  if (!r) return fail('Carga não encontrada.');
  if (r.status === 'finished') return fail('A viagem já foi encerrada.');
  if (driverId === null && r.status === 'active') return fail('Uma viagem em andamento precisa de motorista.');
  if (driverId !== null) {
    const driver = d.drivers.find((x) => x.id === driverId);
    if (!driver) return fail('Motorista não encontrado.');
    if (driver.active === false) return fail('Este motorista está desativado.');
    if (d.routes.some((x) => x.id !== routeId && x.status === 'active' && x.driverId === driverId)) return fail('Este motorista já está em outra viagem.');
  }
  if (r.driverId === driverId) return fail('Esta carga já está com este motorista.');
  const name = d.drivers.find((x) => x.id === driverId)?.name ?? 'sem motorista';
  return {
    ok: true,
    data: {
      ...d,
      routes: d.routes.map((x) => (x.id === routeId ? { ...x, driverId } : x)),
      orders: d.orders.map((o) => (o.routeId === routeId && r.status === 'active' && o.status === 'onroute' ? { ...o, history: event(o, `Motorista da viagem: ${name}`, clock, actor) } : o)),
    },
  };
}
