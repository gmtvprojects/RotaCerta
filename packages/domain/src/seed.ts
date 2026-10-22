import type { Client, Dataset, Notification, Order, Route } from './types';
import type { OrderStatus } from './status';
import { volumesOf } from './types';

const NAMES = ['Maria Oliveira', 'João Ribeiro', 'Ana Souza', 'Paulo Lima', 'Juliana Rocha', 'Roberto Alves', 'Fernanda Santos', 'Marcos Costa', 'Camila Martins', 'Pedro Almeida', 'Beatriz Nunes', 'Lucas Ferreira', 'Patrícia Barros', 'Renato Silva', 'Aline Moraes', 'Eduardo Gomes', 'Cláudia Dias', 'Ricardo Melo', 'Helena Castro', 'Sérgio Lopes'];
const NEIGHBORHOODS = [
  { name: 'Centro', zone: 'Região Central' }, { name: 'Vila Nova', zone: 'Região Central' },
  { name: 'Jardim das Flores', zone: 'Região Norte' }, { name: 'Jardim Primavera', zone: 'Região Norte' },
  { name: 'Parque das Águas', zone: 'Região Sul' }, { name: 'São Lucas', zone: 'Região Sul' },
];
const STREETS = ['Rua das Acácias', 'Rua do Comércio', 'Rua das Palmeiras', 'Rua dos Ipês', 'Rua das Flores', 'Rua Bela Vista'];
const pad = (n: number, len: number) => String(n).padStart(len, '0');

/** Dados fixos e fictícios (derivados do demo de referência) enquanto não há backend. */
export function createSeed(): Dataset {
  const clients: Client[] = NAMES.map((name, i) => ({
    id: i + 1,
    name,
    phone: `(00) 00000-${pad(101 + i, 4)}`,
    neighborhood: NEIGHBORHOODS[i % 6].name,
    street: STREETS[i % 6],
    number: String(80 + i * 20),
    complement: i % 7 === 0 ? 'Casa 2' : '',
    reference: i % 4 === 0 ? 'Portão azul, ao lado da praça.' : '',
    consent: i !== 13,
  }));

  const orders: Order[] = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    const c = clients[i % 20];
    const count = (i % 3) + 1;
    const boxes = Array.from({ length: count }, (_, j) => `CX-${pad(10 + 4 * i + j, 3)}`);
    let status: OrderStatus = 'ready';
    let routeId: number | null = null;
    if (n <= 6) { status = n <= 2 ? 'delivered' : 'onroute'; routeId = 1047; }
    else if (n <= 10) { status = 'released'; routeId = 1048; }
    else if (n <= 22) status = 'ready';
    else if (n <= 25) status = 'awaiting';
    else status = 'delivered';
    const hasBoxes = status !== 'awaiting';
    return {
      id: 101 + i,
      clientId: c.id,
      name: c.name, phone: c.phone, neighborhood: c.neighborhood, street: c.street,
      number: c.number, complement: c.complement, reference: c.reference, consent: c.consent,
      window: i < 10 ? '14:00–16:00' : i % 5 === 0 ? '16:00–18:00' : '14:00–16:00',
      notes: '',
      boxes: hasBoxes ? boxes : [],
      cold: hasBoxes && i % 3 === 2 ? 1 : 0,
      frozen: hasBoxes && i % 4 === 0 ? 1 : 0,
      gas: hasBoxes && i % 11 === 5 ? 1 : 0,
      storage: 'Câmara fria 01',
      status, routeId,
      created: `13/10/2026 · 13:${pad(10 + i, 2)}`,
      completed: status === 'delivered' ? `14:${pad(8 + i, 2)}` : null,
      history: [{ label: 'Entrega cadastrada', time: `13:${pad(10 + i, 2)}`, actor: 'Beatriz Alves' }],
    };
  });

  const routes: Route[] = [
    { id: 1047, vehicleId: 1, driverId: 1, orders: [101, 102, 103, 104, 105, 106], status: 'active', departure: '14:00', created: '13:40' },
    { id: 1048, vehicleId: 2, driverId: null, orders: [107, 108, 109, 110], status: 'released', departure: '15:00', created: '14:05' },
  ];

  for (const r of routes) {
    r.checked = {};
    for (const id of r.orders) for (const v of volumesOf(orders.find((o) => o.id === id)!)) r.checked[v.key] = true;
  }

  const note = (id: string, routeId: number, o: Order, status: Notification['status'], event: Notification['event'], created: string, reason = ''): Notification => ({
    id, routeId, orderId: o.id, name: o.name, phone: o.phone, status, event, created, reason,
    message: `Olá, ${o.name.split(' ')[0]}! Sua compra do Amaro Supermercados é a próxima da nossa rota. Nosso motorista está a caminho. Prepare-se para receber suas compras!`,
  });

  return {
    clients,
    neighborhoods: NEIGHBORHOODS,
    zones: ['Região Central', 'Região Norte', 'Região Sul'],
    vehicles: [
      { id: 1, name: 'Veículo 01', plate: 'DEMO-01', capacity: 28 },
      { id: 2, name: 'Veículo 02', plate: 'DEMO-02', capacity: 24 },
      { id: 3, name: 'Veículo 03', plate: 'DEMO-03', capacity: 32 },
    ],
    drivers: [{ id: 1, name: 'Carlos Oliveira' }, { id: 2, name: 'Mateus Santos' }, { id: 3, name: 'Lucas Pereira' }],
    orders,
    routes,
    notifications: [
      note('seed-1', 1047, orders[0], 'delivered', 'rota_iniciada', '14:00:02'),
      note('seed-2', 1047, orders[1], 'delivered', 'entrega_concluida', '14:08:03'),
      note('seed-3', 1047, orders[2], 'delivered', 'entrega_concluida', '14:19:01'),
      note('seed-fail', 1046, orders[25], 'failed', 'entrega_concluida', '13:12:08', 'Indisponibilidade simulada do provedor.'),
    ],
    departures: ['10:00', '14:00', '17:00'],
  };
}
