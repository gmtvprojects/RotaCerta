import type { Dataset } from './types';
import { volumesOf } from './types';

/** Uma caixa está "em uso" até a entrega ser concluída ou cancelada, ou a falha ter os volumes devolvidos. */
export function boxesInUse(d: Dataset, exceptOrderId?: number): Map<string, number> {
  const used = new Map<string, number>();
  for (const o of d.orders) {
    if (o.id === exceptOrderId) continue;
    if (o.status === 'delivered' || o.status === 'cancelled' || (o.status === 'failed' && o.returned)) continue;
    for (const code of o.boxes) used.set(code, o.id);
  }
  return used;
}

/** Devolve a mensagem de erro se algum código já está em outra entrega ativa. */
export function checkBoxesFree(d: Dataset, codes: string[], exceptOrderId?: number): string | null {
  const used = boxesInUse(d, exceptOrderId);
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    const other = used.get(code);
    if (other !== undefined) return `A caixa ${code} já está vinculada à entrega ${other}.`;
  }
  return null;
}

/** Volumes que uma carga leva, somando as entregas dela (para comparar com a capacidade do veículo). */
export const volumesOfOrders = (d: Dataset, ids: number[]): number =>
  ids.reduce((n, id) => { const o = d.orders.find((x) => x.id === id); return n + (o ? volumesOf(o).length : 0); }, 0);

/** Erro se a quantidade de volumes passar da capacidade do veículo. */
export function checkCapacity(d: Dataset, vehicleId: number, volumes: number): string | null {
  const v = d.vehicles.find((x) => x.id === vehicleId);
  if (!v) return 'Veículo não encontrado.';
  if (v.active === false) return 'Este veículo está desativado.';
  if (volumes > v.capacity) return `Capacidade excedida: ${volumes} volumes para ${v.capacity} do ${v.name}.`;
  return null;
}
