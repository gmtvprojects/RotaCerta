import type { Dataset, Notification, Order, Route } from './types';
import { volumesOf } from './types';

export type TripResult = { ok: true; data: Dataset } | { ok: false; error: string };

export const OCCURRENCE_REASONS = [
  'Cliente ausente', 'Endereço incorreto', 'Cliente recusou a entrega', 'Problema com mercadorias', 'Outro motivo',
] as const;

export const noticeMessage = (name: string) =>
  `Olá, ${name.split(' ')[0]}! Sua compra do Amaro Supermercados é a próxima da nossa rota. Nosso motorista está a caminho. Prepare-se para receber suas compras!`;

const fail = (error: string): TripResult => ({ ok: false, error });

export const routeOrders = (d: Dataset, r: Route): Order[] =>
  r.orders.map((id) => d.orders.find((o) => o.id === id)).filter((o): o is Order => !!o);

/** Próxima parada pendente da rota, na ordem do romaneio. */
export const nextStop = (d: Dataset, r: Route): Order | undefined => routeOrders(d, r).find((o) => o.status === 'onroute');

export const isFullyChecked = (d: Dataset, r: Route): boolean => {
  const vols = routeOrders(d, r).flatMap(volumesOf);
  return vols.length > 0 && vols.every((v) => r.checked?.[v.key]);
};

export const activeRoute = (d: Dataset, driverId: number): Route | undefined =>
  d.routes.find((r) => r.status === 'active' && r.driverId === driverId);

/** Romaneios que o motorista pode iniciar: liberados, conferidos e sem outro dono. */
export const availableManifests = (d: Dataset, driverId: number): Route[] =>
  d.routes.filter((r) => r.status === 'released' && (!r.driverId || r.driverId === driverId) && isFullyChecked(d, r));

function queueNotice(d: Dataset, r: Route, event: Notification['event'], time: string): Dataset {
  const target = nextStop(d, r);
  if (!target) return d;
  const key = `${r.id}:${target.id}:next`;
  if (d.notifications.some((n) => n.key === key)) return d;
  const skipped = !target.consent;
  const n: Notification = {
    id: `n${Date.now().toString(36)}-${target.id}`, key, routeId: r.id, orderId: target.id, name: target.name, phone: target.phone,
    status: skipped ? 'skipped' : 'delivered', event, created: time, message: noticeMessage(target.name),
    reason: skipped ? 'Cliente sem autorização para mensagem.' : '',
  };
  return { ...d, notifications: [n, ...d.notifications] };
}

export function startTrip(d: Dataset, routeId: number, driverId: number, time: string): TripResult {
  const r = d.routes.find((x) => x.id === routeId);
  if (!r || r.status !== 'released') return fail('Este romaneio não está disponível para iniciar.');
  if (!isFullyChecked(d, r)) return fail('A carga ainda tem volumes pendentes.');
  if (r.driverId && r.driverId !== driverId) return fail('Este romaneio pertence a outro motorista.');
  const busy = activeRoute(d, driverId);
  if (busy && busy.id !== r.id) return fail('Encerre a viagem atual antes de iniciar outra.');
  if (d.routes.some((o) => o.id !== r.id && o.vehicleId === r.vehicleId && o.status === 'active')) return fail('O veículo já está em outra viagem.');
  if (routeOrders(d, r).some((o) => o.routeId !== r.id || o.status !== 'released')) return fail('Uma entrega da carga foi alterada. Revise com a expedição.');

  let next: Dataset = {
    ...d,
    routes: d.routes.map((x) => (x.id === r.id ? { ...x, status: 'active', driverId, claimedAt: time } : x)),
    orders: d.orders.map((o) => (o.routeId === r.id ? { ...o, status: 'onroute', history: [...o.history, { label: 'Rota iniciada', time, actor: 'Motorista' }] } : o)),
  };
  next = queueNotice(next, next.routes.find((x) => x.id === r.id)!, 'rota_iniciada', time);
  return { ok: true, data: next };
}

export type StopOutcome = { kind: 'delivered'; receiver: string } | { kind: 'failed'; reason: string; notes: string };

/** Encerra a parada atual (entregue ou não), avisa o próximo cliente e fecha a rota na última parada. */
export function closeStop(d: Dataset, orderId: number, driverId: number, admin: boolean, time: string, outcome: StopOutcome): TripResult {
  const o = d.orders.find((x) => x.id === orderId);
  const r = d.routes.find((x) => x.id === o?.routeId);
  if (!o || !r) return fail('Entrega ou romaneio não encontrado.');
  if (o.status === 'delivered') return fail('Esta entrega já foi concluída. Nenhum aviso duplicado.');
  if (r.status !== 'active' || nextStop(d, r)?.id !== o.id) return fail('Esta não é a próxima parada de uma rota ativa.');
  if (!admin && r.driverId !== driverId) return fail('Esta viagem não pertence ao motorista selecionado.');
  if (outcome.kind === 'failed' && !outcome.reason) return fail('Selecione o motivo da ocorrência.');

  const delivered = outcome.kind === 'delivered';
  const orders = d.orders.map((x) => x.id !== o.id ? x : {
    ...x,
    status: delivered ? 'delivered' as const : 'failed' as const,
    completed: time,
    ...(outcome.kind === 'delivered'
      ? { receiver: outcome.receiver.trim() || 'Não informado' }
      : { occurrence: { reason: outcome.reason, notes: outcome.notes.trim() } }),
    history: [...x.history, { label: outcome.kind === 'delivered' ? 'Entrega concluída' : `Não entregue: ${outcome.reason}`, time, actor: 'Motorista' }],
  });
  let next: Dataset = { ...d, orders };
  const route = next.routes.find((x) => x.id === r.id)!;
  if (nextStop(next, route)) next = queueNotice(next, route, 'entrega_concluida', time);
  else next = { ...next, routes: next.routes.map((x) => (x.id === r.id ? { ...x, status: 'finished', finished: time } : x)) };
  return { ok: true, data: next };
}
