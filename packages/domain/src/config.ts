import type { Dataset } from './types';
import type { TripResult } from './trip';

const fail = (error: string): TripResult => ({ ok: false, error });
const ok = (data: Dataset): TripResult => ({ ok: true, data });
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function addZone(d: Dataset, name: string): TripResult {
  const n = name.trim();
  if (!n) return fail('Informe o nome da região.');
  if (d.zones.some((z) => same(z, n))) return fail('Esta região já existe.');
  return ok({ ...d, zones: [...d.zones, n] });
}

export function addNeighborhood(d: Dataset, name: string, zone: string): TripResult {
  const n = name.trim();
  if (!n) return fail('Informe o nome do bairro.');
  if (!d.zones.includes(zone)) return fail('Escolha uma região cadastrada.');
  if (d.neighborhoods.some((x) => same(x.name, n))) return fail('Este bairro já existe.');
  return ok({ ...d, neighborhoods: [...d.neighborhoods, { name: n, zone }] });
}

export interface VehicleInput { id?: number; name: string; plate: string; capacity: number }

export function saveVehicle(d: Dataset, v: VehicleInput): TripResult {
  const name = v.name.trim();
  const plate = v.plate.trim().toUpperCase();
  if (!name) return fail('Informe o nome do veículo.');
  if (!plate) return fail('Informe a identificação (placa) do veículo.');
  if (!Number.isInteger(v.capacity) || v.capacity < 1 || v.capacity > 200) return fail('A capacidade deve ser um número inteiro de 1 a 200.');
  if (d.vehicles.some((x) => x.id !== v.id && (same(x.name, name) || same(x.plate, plate)))) return fail('Já existe um veículo com este nome ou placa.');
  if (v.id != null) {
    if (!d.vehicles.some((x) => x.id === v.id)) return fail('Veículo não encontrado.');
    return ok({ ...d, vehicles: d.vehicles.map((x) => (x.id === v.id ? { ...x, name, plate, capacity: v.capacity } : x)) });
  }
  const id = Math.max(0, ...d.vehicles.map((x) => x.id)) + 1;
  return ok({ ...d, vehicles: [...d.vehicles, { id, name, plate, capacity: v.capacity }] });
}

export function addDriver(d: Dataset, name: string): TripResult {
  const n = name.trim();
  if (n.length < 3) return fail('Informe o nome completo do motorista.');
  if (d.drivers.some((x) => same(x.name, n))) return fail('Este motorista já está cadastrado.');
  return ok({ ...d, drivers: [...d.drivers, { id: Math.max(0, ...d.drivers.map((x) => x.id)) + 1, name: n }] });
}

export function addDeparture(d: Dataset, time: string): TripResult {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail('Informe um horário válido (HH:MM).');
  if (d.departures.includes(time)) return fail('Este horário já está cadastrado.');
  return ok({ ...d, departures: [...d.departures, time].sort() });
}

export function removeDeparture(d: Dataset, time: string): TripResult {
  if (d.departures.length <= 1) return fail('Mantenha ao menos um horário de saída.');
  return ok({ ...d, departures: d.departures.filter((t) => t !== time) });
}

/** Reenvio de um aviso que falhou: volta para a fila e é marcado como enviado em seguida. */
export function retryNotice(d: Dataset, id: string, time: string): TripResult {
  const n = d.notifications.find((x) => x.id === id);
  if (!n || n.status !== 'failed') return fail('Só avisos com falha podem ser reenviados.');
  return ok({ ...d, notifications: d.notifications.map((x) => (x.id === id ? { ...x, status: 'queued', reason: '', created: time } : x)) });
}

/** O provedor recusou o aviso: marca como falha com o motivo. */
export function failNotice(d: Dataset, id: string, reason: string): Dataset {
  const n = d.notifications.find((x) => x.id === id);
  if (!n || n.status !== 'queued') return d;
  return { ...d, notifications: d.notifications.map((x) => (x.id === id ? { ...x, status: 'failed', reason } : x)) };
}

export function settleNotice(d: Dataset, id: string): Dataset {
  const n = d.notifications.find((x) => x.id === id);
  if (!n || n.status !== 'queued') return d;
  return { ...d, notifications: d.notifications.map((x) => (x.id === id ? { ...x, status: 'delivered' } : x)) };
}

/* ---------- editar, desativar e remover ---------- */

const hasOpenRoute = (d: Dataset, pick: (r: Dataset['routes'][number]) => boolean) => d.routes.some((r) => r.status !== 'finished' && pick(r));

/** Renomeia a região; os bairros dela acompanham. */
export function renameZone(d: Dataset, oldName: string, newName: string): TripResult {
  const n = newName.trim();
  if (!d.zones.includes(oldName)) return fail('Região não encontrada.');
  if (!n) return fail('Informe o nome da região.');
  if (!same(oldName, n) && d.zones.some((z) => same(z, n))) return fail('Esta região já existe.');
  return ok({ ...d, zones: d.zones.map((z) => (z === oldName ? n : z)), neighborhoods: d.neighborhoods.map((h) => (h.zone === oldName ? { ...h, zone: n } : h)) });
}

export function removeZone(d: Dataset, name: string): TripResult {
  if (!d.zones.includes(name)) return fail('Região não encontrada.');
  const n = d.neighborhoods.filter((h) => h.zone === name).length;
  if (n) return fail(`Esta região ainda tem ${n} bairro(s). Mova ou remova os bairros antes.`);
  return ok({ ...d, zones: d.zones.filter((z) => z !== name) });
}

/** Renomeia e/ou muda de região. O nome novo vale também para clientes e entregas que já usavam o bairro. */
export function editNeighborhood(d: Dataset, oldName: string, newName: string, zone: string): TripResult {
  const n = newName.trim();
  if (!d.neighborhoods.some((h) => h.name === oldName)) return fail('Bairro não encontrado.');
  if (!n) return fail('Informe o nome do bairro.');
  if (!d.zones.includes(zone)) return fail('Escolha uma região cadastrada.');
  if (!same(oldName, n) && d.neighborhoods.some((h) => same(h.name, n))) return fail('Este bairro já existe.');
  return ok({
    ...d,
    neighborhoods: d.neighborhoods.map((h) => (h.name === oldName ? { name: n, zone } : h)),
    clients: d.clients.map((c) => (c.neighborhood === oldName ? { ...c, neighborhood: n } : c)),
    orders: d.orders.map((o) => (o.neighborhood === oldName ? { ...o, neighborhood: n } : o)),
  });
}

export function removeNeighborhood(d: Dataset, name: string): TripResult {
  if (!d.neighborhoods.some((h) => h.name === name)) return fail('Bairro não encontrado.');
  const clients = d.clients.filter((c) => c.neighborhood === name).length;
  const orders = d.orders.filter((o) => o.neighborhood === name).length;
  if (clients || orders) return fail(`Este bairro tem ${clients} cliente(s) e ${orders} entrega(s). Mude para outro nome em vez de remover.`);
  return ok({ ...d, neighborhoods: d.neighborhoods.filter((h) => h.name !== name) });
}

export interface DriverPatch { name?: string; active?: boolean }

export function updateDriver(d: Dataset, id: number, patch: DriverPatch): TripResult {
  const x = d.drivers.find((v) => v.id === id);
  if (!x) return fail('Motorista não encontrado.');
  const name = patch.name?.trim() ?? x.name;
  if (name.length < 3) return fail('Informe o nome completo do motorista.');
  if (d.drivers.some((v) => v.id !== id && same(v.name, name))) return fail('Este motorista já está cadastrado.');
  const active = patch.active ?? x.active !== false;
  if (!active && hasOpenRoute(d, (r) => r.driverId === id)) return fail('Este motorista está em uma carga ou viagem. Troque o motorista dela antes.');
  return ok({ ...d, drivers: d.drivers.map((v) => (v.id === id ? { id, name, ...(active ? {} : { active: false }) } : v)) });
}

/** Só remove quem nunca apareceu em uma carga; os demais devem ser desativados. */
export function removeDriver(d: Dataset, id: number): TripResult {
  if (!d.drivers.some((v) => v.id === id)) return fail('Motorista não encontrado.');
  if (d.routes.some((r) => r.driverId === id)) return fail('Este motorista tem histórico de cargas. Desative em vez de remover.');
  return ok({ ...d, drivers: d.drivers.filter((v) => v.id !== id) });
}

export function setVehicleActive(d: Dataset, id: number, active: boolean): TripResult {
  const v = d.vehicles.find((x) => x.id === id);
  if (!v) return fail('Veículo não encontrado.');
  if (!active && hasOpenRoute(d, (r) => r.vehicleId === id)) return fail('Este veículo está em uma carga ou viagem.');
  return ok({ ...d, vehicles: d.vehicles.map((x) => (x.id === id ? { id: x.id, name: x.name, plate: x.plate, capacity: x.capacity, ...(active ? {} : { active: false }) } : x)) });
}

export function removeVehicle(d: Dataset, id: number): TripResult {
  if (!d.vehicles.some((x) => x.id === id)) return fail('Veículo não encontrado.');
  if (d.routes.some((r) => r.vehicleId === id)) return fail('Este veículo tem histórico de cargas. Desative em vez de remover.');
  return ok({ ...d, vehicles: d.vehicles.filter((x) => x.id !== id) });
}
