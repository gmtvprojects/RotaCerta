import { z } from 'zod';

const text = (max = 200) => z.string().max(max);

export const deliveryForm = z.object({
  clientId: z.number().int().nullable(),
  name: text(120), phone: text(30), neighborhood: text(80), street: text(160), number: text(20),
  complement: text(80), reference: text(200), window: text(30), notes: text(500), consent: z.boolean(),
});

const boxType = z.enum(['ambient', 'cold', 'frozen']);
export const boxInput = z.object({ code: text(30), type: boxType, location: text(120) });

export const paperValues = deliveryForm.extend({
  sheetNumber: text(30), boxes: z.array(boxInput).max(50), gas: z.number().int(), volumesReady: z.boolean(),
});

export const login = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });
export const saveBoxes = z.object({ boxes: z.array(boxInput).max(50), gas: z.number().int() });
export const createRoute = z.object({
  orderIds: z.array(z.number().int()).min(1).max(100), vehicleId: z.number().int(),
  departure: text(20).default(''), driverId: z.number().int().nullable().default(null),
});
export const checks = z.object({ keys: z.array(text(60)).min(1).max(500), value: z.boolean() });
export const startTrip = z.object({ driverId: z.number().int().optional() });
export const stop = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('delivered'), receiver: text(120).default('') }),
  z.object({ kind: z.literal('failed'), reason: text(120), notes: text(500).default('') }),
]);
export const paperCreate = z.object({
  sheetNumber: text(30), mode: z.enum(['example', 'photo']), photo: z.string().max(1_500_000).optional(),
  photoName: text(200).optional(), values: paperValues, status: z.enum(['captured', 'draft']).default('captured'),
});
export const paperPatch = z.object({ status: z.enum(['captured', 'draft']).optional(), values: paperValues.optional() });
export const zone = z.object({ name: text(80) });
export const neighborhood = z.object({ name: text(80), zone: text(80) });
export const vehicle = z.object({ name: text(80), plate: text(20), capacity: z.number().int() });
export const driver = z.object({ name: text(120) });
export const departure = z.object({ time: text(5) });

const password = z.string().min(10, 'A senha precisa ter ao menos 10 caracteres.').max(200);
const role = z.enum(['gestao', 'atendente', 'expedicao', 'motorista']);
export const passwordOnly = z.object({ password });
export const changePassword = z.object({ current: z.string().min(1).max(200), password });
export const userCreate = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo.').max(120), email: z.email('Informe um e-mail válido.').max(200),
  password, role, driverId: z.number().int().nullable().default(null),
});
export const userPatch = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo.').max(120).optional(), role: role.optional(),
  driverId: z.number().int().nullable().optional(), active: z.boolean().optional(),
});
