import type { Dataset, Order, Route } from './types';
import { volumesOf } from './types';
import { routeOrders, type TripResult } from './trip';

const fail = (error: string): TripResult => ({ ok: false, error });
const mapRoute = (d: Dataset, id: number, fn: (r: Route) => Route): Dataset => ({ ...d, routes: d.routes.map((r) => (r.id === id ? fn(r) : r)) });

/** Assinatura dos volumes de um pedido (código, tipo e local). Muda se as caixas forem alteradas. */
export const volumesSignature = (o: Order): string => JSON.stringify(volumesOf(o).map((v) => [v.key, v.type, v.location]));

export const orderChecked = (r: Route, o: Order): boolean => {
  const vols = volumesOf(o);
  return vols.length > 0 && vols.every((v) => r.checked?.[v.key]);
};

export const confirmedCount = (r: Route): number => r.orders.filter((id) => r.confirmed?.[String(id)]).length;

/** Marca ou desmarca volumes, registra quem e quando, e desfaz a confirmação do pedido afetado. */
export function setChecks(d: Dataset, routeId: number, keys: string[], value: boolean, time: string, actor: string): Dataset {
  const r = d.routes.find((x) => x.id === routeId);
  if (!r || r.status !== 'loading') return d;
  return mapRoute(d, routeId, (x) => {
    const checked = { ...(x.checked ?? {}) };
    const audit = { ...(x.audit ?? {}) };
    const confirmed = { ...(x.confirmed ?? {}) };
    for (const k of keys) {
      if (value) checked[k] = true; else delete checked[k];
      audit[k] = { checked: value, at: time, actor };
      delete confirmed[k.split(':')[0]];
    }
    return { ...x, checked, audit, confirmed };
  });
}

/** Se os volumes de um pedido mudaram depois de conferidos, a conferência dele recomeça. Mesma referência se nada mudou. */
export function syncSignatures(d: Dataset, routeId: number): Dataset {
  const r = d.routes.find((x) => x.id === routeId);
  if (!r || r.status !== 'loading') return d;
  const signatures = { ...(r.signatures ?? {}) };
  const checked = { ...(r.checked ?? {}) };
  const confirmed = { ...(r.confirmed ?? {}) };
  const audit = { ...(r.audit ?? {}) };
  let changed = false;
  for (const o of routeOrders(d, r)) {
    const sig = volumesSignature(o);
    const key = String(o.id);
    if (signatures[key] === sig) continue;
    if (signatures[key]) {
      for (const k of Object.keys(checked)) if (k.startsWith(`${o.id}:`)) { delete checked[k]; delete audit[k]; }
      delete confirmed[key];
    }
    signatures[key] = sig;
    changed = true;
  }
  return changed ? mapRoute(d, routeId, (x) => ({ ...x, signatures, checked, confirmed, audit })) : d;
}

export function confirmOrder(d: Dataset, routeId: number, orderId: number): TripResult {
  const r = d.routes.find((x) => x.id === routeId);
  const o = d.orders.find((x) => x.id === orderId);
  if (!r || !o || r.status !== 'loading' || !r.orders.includes(orderId)) return fail('Pedido ou carga não encontrado.');
  if (volumesOf(o).length === 0) return fail('Este pedido não tem volumes cadastrados.');
  if (!orderChecked(r, o)) return fail('Marque todos os volumes do pedido antes de confirmar.');
  return { ok: true, data: mapRoute(d, routeId, (x) => ({ ...x, confirmed: { ...(x.confirmed ?? {}), [String(orderId)]: true } })) };
}

export function releaseTrip(d: Dataset, routeId: number, time: string): TripResult {
  const r = d.routes.find((x) => x.id === routeId);
  if (!r || r.status !== 'loading') return fail('Esta carga não está em conferência.');
  const orders = routeOrders(d, r);
  if (orders.some((o) => o.routeId !== r.id || o.status !== 'loading')) return fail('Uma entrega da carga foi alterada. Revise a seleção.');
  if (!orders.every((o) => orderChecked(r, o))) return fail('Ainda há volumes por conferir.');
  if (!orders.every((o) => r.confirmed?.[String(o.id)])) return fail('Confirme todos os pedidos antes de liberar o romaneio.');
  return {
    ok: true,
    data: {
      ...mapRoute(d, routeId, (x) => ({ ...x, status: 'released' })),
      orders: d.orders.map((o) => r.orders.includes(o.id)
        ? { ...o, status: 'released' as const, history: [...o.history, { label: `Volumes conferidos. Romaneio #${r.id} disponível para o motorista`, time, actor: 'Expedição' }] }
        : o),
    },
  };
}
