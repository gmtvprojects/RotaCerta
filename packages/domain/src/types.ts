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
