import type { BoxInput, Client, Dataset, DeliveryForm, Order, PaperForm, PaperValues, Route } from './types';
import { DELIVERY_WINDOWS, MAX_PAPER_BOXES } from './types';

/** Relógio injetado: o domínio não lê a hora do sistema, quem chama decide (servidor, testes). */
export interface Clock {
  /** `HH:MM` */
  time: string;
  /** `dd/mm/aaaa · HH:MM` */
  stamp: string;
}

export type Cmd<X = unknown> = ({ ok: true; data: Dataset } & X) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const nextId = (ids: number[], floor: number) => Math.max(floor, ...ids) + 1;
const digits = (s: string) => s.replace(/\D/g, '');

const newClient = (id: number, f: DeliveryForm): Client => ({
  id, name: f.name.trim(), phone: f.phone.trim(), neighborhood: f.neighborhood, street: f.street.trim(),
  number: f.number.trim(), complement: f.complement.trim(), reference: f.reference.trim(), consent: f.consent,
});

/** Valida os dados de cliente/endereço (etapa 1 do atendimento). Devolve a mensagem de erro, ou null. */
export function validateDelivery(d: Dataset, f: DeliveryForm): string | null {
  if (f.name.trim().length < 3) return 'Informe o nome do cliente.';
  if (digits(f.phone).length < 8) return 'Informe um telefone válido.';
  if (!d.neighborhoods.some((n) => n.name === f.neighborhood)) return 'Escolha um bairro cadastrado.';
  if (!f.street.trim()) return 'Informe a rua.';
  if (!f.number.trim()) return 'Informe o número.';
  if (!(DELIVERY_WINDOWS as readonly string[]).includes(f.window)) return 'Escolha uma janela de entrega válida.';
  if (f.clientId != null && !d.clients.some((c) => c.id === f.clientId)) return 'Cliente não encontrado.';
  return null;
}

export function validateBoxes(boxes: BoxInput[], gas: number): string | null {
  if (!Number.isInteger(gas) || gas < 0 || gas > 20) return 'A quantidade de itens fora da caixa deve ser de 0 a 20.';
  if (boxes.length > MAX_PAPER_BOXES) return `No máximo ${MAX_PAPER_BOXES} caixas por entrega.`;
  const codes = boxes.map((b) => b.code.trim().toUpperCase());
  if (codes.some((c) => !c)) return 'Toda caixa precisa de um código.';
  if (new Set(codes).size !== codes.length) return 'Há códigos de caixa repetidos.';
  if (boxes.some((b) => !b.location.trim())) return 'Informe o local de cada caixa.';
  return null;
}

const boxFields = (boxes: BoxInput[]) => {
  const list = boxes.map((b) => ({ ...b, code: b.code.trim().toUpperCase(), location: b.location.trim() }));
  return {
    boxes: list.map((b) => b.code),
    boxDetails: Object.fromEntries(list.map((b) => [b.code, { type: b.type, location: b.location }])),
    cold: list.filter((b) => b.type === 'cold').length,
    frozen: list.filter((b) => b.type === 'frozen').length,
  };
};

/** Cadastra a entrega (e o cliente, se novo) como "aguardando volumes". */
export function createOrder(d: Dataset, f: DeliveryForm, clock: Clock, actor: string): Cmd<{ orderId: number }> {
  const error = validateDelivery(d, f);
  if (error) return fail(error);
  const id = nextId(d.orders.map((o) => o.id), 100);
  let clientId = f.clientId;
  let clients = d.clients;
  if (clientId == null) {
    clientId = nextId(d.clients.map((c) => c.id), 0);
    clients = [...d.clients, newClient(clientId, f)];
  }
  const order: Order = {
    id, clientId, name: f.name.trim(), phone: f.phone.trim(), neighborhood: f.neighborhood, street: f.street.trim(),
    number: f.number.trim(), complement: f.complement.trim(), reference: f.reference.trim(), consent: f.consent,
    window: f.window, notes: f.notes.trim(), boxes: [], cold: 0, frozen: 0, gas: 0,
    storage: 'Câmara fria 01', status: 'awaiting', routeId: null, created: clock.stamp, completed: null,
    history: [{ label: 'Entrega cadastrada', time: clock.time, actor }],
  };
  return { ok: true, data: { ...d, clients, orders: [...d.orders, order] }, orderId: id };
}

/** Grava as caixas; sem caixas a entrega segue aguardando volumes. */
export function saveBoxes(d: Dataset, orderId: number, boxes: BoxInput[], gas: number, clock: Clock, actor: string): Cmd {
  const o = d.orders.find((x) => x.id === orderId);
  if (!o) return fail('Entrega não encontrada.');
  if (o.status === 'onroute' || o.status === 'delivered' || o.status === 'failed') return fail('Esta entrega já está em rota ou foi encerrada.');
  const error = validateBoxes(boxes, gas);
  if (error) return fail(error);
  return {
    ok: true,
    data: {
      ...d,
      orders: d.orders.map((x) => x.id !== orderId ? x : {
        ...x, ...boxFields(boxes), gas,
        // entrega já em carga mantém o status; a conferência detecta a mudança de volumes
        status: x.routeId != null ? x.status : boxes.length ? 'ready' : 'awaiting',
        history: [...x.history, { label: boxes.length ? `${boxes.length} caixa(s) identificada(s)` : 'Caixas ainda não identificadas', time: clock.time, actor }],
      }),
    },
  };
}

/** Monta a carga: as entregas viram "em carregamento" e o romaneio entra em conferência. */
export function createRoute(d: Dataset, orderIds: number[], vehicleId: number, departure: string, driverId: number | null, clock: Clock, actor: string): Cmd<{ routeId: number }> {
  if (orderIds.length === 0) return fail('Selecione ao menos uma entrega.');
  if (new Set(orderIds).size !== orderIds.length) return fail('Há entregas repetidas na carga.');
  if (!d.vehicles.some((v) => v.id === vehicleId)) return fail('Veículo não encontrado.');
  if (driverId != null && !d.drivers.some((x) => x.id === driverId)) return fail('Motorista não encontrado.');
  for (const id of orderIds) {
    const o = d.orders.find((x) => x.id === id);
    if (!o) return fail(`Entrega ${id} não encontrada.`);
    if (o.status !== 'ready' || o.routeId != null) return fail(`A entrega ${id} não está pronta para planejar.`);
  }
  const id = nextId(d.routes.map((r) => r.id), 1000);
  const route: Route = { id, vehicleId, driverId, orders: orderIds, status: 'loading', departure: departure || 'A definir', created: clock.time, checked: {} };
  return {
    ok: true, routeId: id,
    data: {
      ...d,
      routes: [...d.routes, route],
      orders: d.orders.map((o) => orderIds.includes(o.id)
        ? { ...o, status: 'loading', routeId: id, history: [...o.history, { label: `Romaneio #${id} em conferência`, time: clock.time, actor }] }
        : o),
    },
  };
}

/** Desfaz uma carga em conferência e devolve as entregas à fila. */
export function discardRoute(d: Dataset, routeId: number, clock: Clock, actor: string): Cmd {
  const r = d.routes.find((x) => x.id === routeId);
  if (!r) return fail('Carga não encontrada.');
  if (r.status !== 'loading') return fail('Só é possível desfazer uma carga em conferência.');
  return {
    ok: true,
    data: {
      ...d,
      routes: d.routes.filter((x) => x.id !== routeId),
      orders: d.orders.map((o) => r.orders.includes(o.id)
        ? { ...o, status: 'ready', routeId: null, history: [...o.history, { label: `Carga #${r.id} desfeita`, time: clock.time, actor }] }
        : o),
    },
  };
}

/* ---------- Fichas de papel ---------- */

export interface Workspace { data: Dataset; papers: PaperForm[] }

export function addPaper(papers: PaperForm[], input: Pick<PaperForm, 'sheetNumber' | 'mode' | 'photo' | 'photoName' | 'values'>, status: PaperForm['status'], id: string, createdAt: string): PaperForm[] {
  return [...papers, { ...input, id, status, orderId: null, createdAt }];
}

/** Ficha já importada não muda mais. */
export function updatePaper(papers: PaperForm[], id: string, patch: Partial<Pick<PaperForm, 'status' | 'values'>>): PaperForm[] {
  return papers.map((p) => (p.id === id && p.status !== 'imported' ? { ...p, ...patch } : p));
}

export const deletePaper = (papers: PaperForm[], id: string): PaperForm[] => papers.filter((p) => p.id !== id || p.status === 'imported');

/** Cria a entrega a partir da ficha revisada e vincula os dois. */
export function importPaper(w: Workspace, id: string, v: PaperValues, clock: Clock, actor: string, importedAt: string): { ok: true; workspace: Workspace; orderId: number } | { ok: false; error: string } {
  const paper = w.papers.find((p) => p.id === id);
  if (!paper) return fail('Ficha não encontrada.');
  if (paper.status === 'imported') return fail('Esta ficha já foi importada.');
  const d = w.data;
  const phoneKey = digits(v.phone);
  const known = v.clientId ?? d.clients.find((c) => digits(c.phone) === phoneKey)?.id ?? null;
  const error = validateDelivery(d, { ...v, clientId: known }) ?? validateBoxes(v.boxes, v.gas);
  if (error) return fail(error);
  const orderId = nextId(d.orders.map((o) => o.id), 100);
  const clientId = known ?? nextId(d.clients.map((c) => c.id), 0);
  const clients = known != null ? d.clients : [...d.clients, newClient(clientId, v)];
  const order: Order = {
    id: orderId, clientId, name: v.name.trim(), phone: v.phone.trim(), neighborhood: v.neighborhood, street: v.street.trim(),
    number: v.number.trim(), complement: v.complement.trim(), reference: v.reference.trim(), consent: v.consent,
    window: v.window, notes: v.notes.trim(), ...boxFields(v.boxes), gas: v.gas,
    storage: 'Câmara fria 01', status: v.boxes.length && v.volumesReady ? 'ready' : 'awaiting', routeId: null,
    created: clock.stamp, completed: null,
    history: [{ label: `Ficha ${paper.sheetNumber} revisada e entrega cadastrada`, time: clock.time, actor }],
  };
  return {
    ok: true, orderId,
    workspace: {
      data: { ...d, clients, orders: [...d.orders, order] },
      papers: w.papers.map((p) => (p.id === id ? { ...p, status: 'imported', values: v, orderId, importedAt } : p)),
    },
  };
}
