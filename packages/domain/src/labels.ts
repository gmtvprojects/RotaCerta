import type { OrderStatus, RouteStatus } from './status';
import type { AnyRole, Role } from './roles';

export const ROLE_LABELS: Record<Role, string> = {
  gestao: 'Gestão', atendente: 'Atendente', expedicao: 'Expedição', motorista: 'Motorista',
};
/** Rótulos de todos os perfis, inclusive o da plataforma (usado nas telas de administração de acessos). */
export const ANY_ROLE_LABELS: Record<AnyRole, string> = { ...ROLE_LABELS, plataforma: 'Plataforma' };
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  gestao: 'Visão da operação', atendente: 'Clientes e caixas', expedicao: 'Cargas e conferência', motorista: 'Romaneios e entregas',
};
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Rascunho', awaiting: 'Aguardando volumes', ready: 'Pronta para planejar', queued: 'Na fila',
  loading: 'Em carregamento', released: 'Liberada ao motorista', onroute: 'Em rota', delivered: 'Entregue', failed: 'Não entregue', cancelled: 'Cancelada',
};
export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  loading: 'Em conferência', released: 'Disponível ao motorista', active: 'Em andamento', finished: 'Encerrado',
};
