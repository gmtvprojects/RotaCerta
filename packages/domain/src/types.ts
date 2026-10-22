import type { BoxType, OrderStatus, RouteStatus } from './status';

export interface Neighborhood { name: string; zone: string }
export interface Vehicle { id: number; name: string; plate: string; capacity: number }
export interface Driver { id: number; name: string }

export interface Client {
  id: number;
  name: string;
  phone: string;
  neighborhood: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  /** Consentimento para receber avisos por WhatsApp. */
  consent: boolean;
}

export interface BoxInfo { type: BoxType; location: string }

export interface OrderEvent { label: string; time: string; actor: string }

export interface Order {
  id: number;
  clientId: number;
  name: string;
  phone: string;
  neighborhood: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  consent: boolean;
  window: string;
  notes: string;
  boxes: string[];
  boxDetails?: Record<string, BoxInfo>;
  cold: number;
  frozen: number;
  gas: number;
  storage: string;
  status: OrderStatus;
  routeId: number | null;
  created: string;
  completed: string | null;
  history: OrderEvent[];
}

export interface Route {
  id: number;
  vehicleId: number;
  driverId: number | null;
  orders: number[];
  status: RouteStatus;
  departure: string;
  created: string;
  /** Volumes conferidos no carregamento, por chave `${orderId}:${volume}`. */
  checked?: Record<string, boolean>;
}

/** Um volume físico a conferir: caixa ou item fora das caixas. */
export interface Volume { key: string; orderId: number; label: string; type: BoxType | 'extra'; location: string }

export function volumesOf(o: Order): Volume[] {
  const boxes = o.boxes.map((code): Volume => {
    const info = o.boxDetails?.[code];
    return { key: `${o.id}:${code}`, orderId: o.id, label: code, type: info?.type ?? 'ambient', location: info?.location ?? DEFAULT_BOX_LOCATION.ambient };
  });
  const extras = Array.from({ length: o.gas }, (_, i): Volume => ({
    key: `${o.id}:extra-${i + 1}`, orderId: o.id, label: o.gas > 1 ? `Item fora da caixa ${i + 1}` : 'Item fora da caixa (gás)', type: 'extra', location: 'Área de expedição',
  }));
  return [...boxes, ...extras];
}

export interface Notification {
  id: string;
  routeId: number;
  orderId: number;
  name: string;
  phone: string;
  status: 'delivered' | 'failed';
  event: 'rota_iniciada' | 'entrega_concluida';
  created: string;
  message: string;
  reason: string;
}

export interface Dataset {
  clients: Client[];
  neighborhoods: Neighborhood[];
  zones: string[];
  vehicles: Vehicle[];
  drivers: Driver[];
  orders: Order[];
  routes: Route[];
  notifications: Notification[];
  departures: string[];
}

/** Dados do cliente/endereço digitados na etapa 1 do atendimento. */
export interface DeliveryForm {
  clientId: number | null;
  name: string;
  phone: string;
  neighborhood: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  window: string;
  notes: string;
  consent: boolean;
}

export interface BoxInput { code: string; type: BoxType; location: string }

export const EMPTY_DELIVERY_FORM: DeliveryForm = {
  clientId: null, name: '', phone: '', neighborhood: '', street: '', number: '',
  complement: '', reference: '', window: '14:00–16:00', notes: '', consent: true,
};

export const DELIVERY_WINDOWS = ['10:00–12:00', '14:00–16:00', '16:00–18:00'] as const;

export const DEFAULT_BOX_LOCATION: Record<BoxType, string> = {
  ambient: 'Área de expedição',
  cold: 'Câmara fria 01 · Prateleira B',
  frozen: 'Câmara de congelados · Setor A',
};

export const BOX_TYPE_LABELS: Record<BoxType, string> = { ambient: 'Ambiente', cold: 'Frio', frozen: 'Congelado' };

/** Carga em planejamento: entregas na ordem das paradas, antes da conferência. */
export interface PlanDraft { orderIds: number[]; vehicleId: number; departure: string }

/** Ordem sugerida: por região, bairro e janela de entrega. */
export function suggestSequence(orders: Order[], neighborhoods: Neighborhood[]): number[] {
  const zone = (n: string) => neighborhoods.find((x) => x.name === n)?.zone ?? '';
  return orders.slice()
    .sort((a, b) => zone(a.neighborhood).localeCompare(zone(b.neighborhood))
      || a.neighborhood.localeCompare(b.neighborhood) || a.window.localeCompare(b.window) || a.id - b.id)
    .map((o) => o.id);
}
