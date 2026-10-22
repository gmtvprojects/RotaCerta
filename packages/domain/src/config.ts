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

export function settleNotice(d: Dataset, id: string): Dataset {
  const n = d.notifications.find((x) => x.id === id);
  if (!n || n.status !== 'queued') return d;
  return { ...d, notifications: d.notifications.map((x) => (x.id === id ? { ...x, status: 'delivered' } : x)) };
}
