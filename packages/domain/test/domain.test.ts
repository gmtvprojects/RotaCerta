import { describe, expect, it } from 'vitest';
import {
  checkBoxesFree, createOrder, createRoute, createSeed, saveBoxes, validateBoxes,
  type Clock, type DeliveryForm,
} from '../src';

const clock: Clock = { time: '10:15', stamp: '15/11/2026 · 10:15' };

describe('invariantes do domínio', () => {
  it('normaliza códigos e recusa caixas repetidas', () => {
    expect(validateBoxes([
      { code: ' cx-1 ', type: 'ambient', location: 'Expedição' },
      { code: 'CX-1', type: 'cold', location: 'Câmara' },
    ], 0)).toBe('Há códigos de caixa repetidos.');
  });

  it('mantém uma caixa reservada enquanto a entrega está ativa', () => {
    const data = createSeed();
    expect(checkBoxesFree(data, [data.orders[10].boxes[0]])).toContain('já está vinculada');
    const concluded = { ...data, orders: data.orders.map((order, index) => index === 10 ? { ...order, status: 'delivered' as const } : order) };
    expect(checkBoxesFree(concluded, [data.orders[10].boxes[0]])).toBeNull();
  });

  it('cria cliente e entrega com relógio injetado, sem ler a hora do sistema', () => {
    const data = createSeed();
    const form: DeliveryForm = {
      clientId: null, name: '  Cliente Novo  ', phone: '(92) 99999-9999', neighborhood: data.neighborhoods[0].name,
      street: ' Rua A ', number: ' 10 ', complement: '', reference: '', window: '14:00–16:00', notes: '', consent: true,
    };
    const result = createOrder(data, form, clock, 'Teste');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = result.data.orders.at(-1)!;
    expect(order.created).toBe(clock.stamp);
    expect(order.name).toBe('Cliente Novo');
    expect(result.data.clients.at(-1)?.name).toBe('Cliente Novo');
  });

  it('bloqueia uma carga que excede a capacidade do veículo', () => {
    let data = createSeed();
    const ready = data.orders.find((order) => order.status === 'ready')!;
    const boxes = Array.from({ length: 20 }, (_, index) => ({ code: `NOVA-${index}`, type: 'ambient' as const, location: 'Expedição' }));
    const saved = saveBoxes(data, ready.id, boxes, 0, clock, 'Teste');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    data = { ...saved.data, vehicles: saved.data.vehicles.map((vehicle) => vehicle.id === 1 ? { ...vehicle, capacity: 10 } : vehicle) };
    const route = createRoute(data, [ready.id], 1, '14:00', null, clock, 'Teste');
    expect(route).toEqual({ ok: false, error: 'Capacidade excedida: 20 volumes para 10 do Veículo 01.' });
  });
});
