import type { Dataset, PaperForm, Role } from '@rotacerta/domain';

export interface Viewer { role: Role; driverId: number | null }

/**
 * O que cada perfil pode ler. O motorista só enxerga as rotas dele (em andamento, liberadas para ele ou ainda
 * sem dono) e, delas, as entregas e os clientes; nada de fichas de papel, avisos ou cadastro de outros motoristas.
 */
export function scopeFor(viewer: Viewer, data: Dataset, papers: PaperForm[]): { data: Dataset; papers: PaperForm[] } {
  if (viewer.role === 'gestao' || viewer.role === 'atendente') return { data, papers };
  if (viewer.role === 'expedicao') return { data, papers: [] };

  const routes = data.routes.filter((r) => r.driverId === viewer.driverId || (r.driverId == null && r.status === 'released'));
  const orderIds = new Set(routes.flatMap((r) => r.orders));
  const orders = data.orders.filter((o) => orderIds.has(o.id));
  const clientIds = new Set(orders.map((o) => o.clientId));
  return {
    papers: [],
    data: {
      ...data,
      routes,
      orders,
      clients: data.clients.filter((c) => clientIds.has(c.id)),
      drivers: data.drivers.filter((d) => d.id === viewer.driverId),
      notifications: [],
    },
  };
}
