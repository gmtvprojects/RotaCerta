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

const num = (min: number, max: number) => z.number().min(min).max(max);
const point = z.object({
  lat: num(-90, 90), lng: num(-180, 180), accuracy: num(0, 100000).nullish(), speed: num(0, 100).nullish(), heading: num(0, 360).nullish(),
  recordedAt: z.iso.datetime({ offset: true }),
});
export const locations = z.object({ points: z.array(point).min(1).max(100) });

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

/* ---------- painel da plataforma ---------- */
const personName = z.string().trim().min(3, 'Informe o nome completo.').max(120);
const email = z.email('Informe um e-mail válido.').max(200);
export const companyCreate = z.object({
  name: z.string().trim().min(2, 'Informe o nome da empresa.').max(120),
  manager: z.object({ name: personName, email, password }),
});
export const companyPatch = z.object({ name: z.string().trim().min(2, 'Informe o nome da empresa.').max(120).optional(), active: z.boolean().optional() });
export const platformUserCreate = z.object({ name: personName, email, password, role: z.enum(['gestao', 'atendente', 'expedicao']) });
export const platformUserPatch = z.object({ name: personName.optional(), active: z.boolean().optional() });

/* ---------- operações sobre entregas, viagens, clientes e cadastros ---------- */
export const orderPatch = z.object({
  name: text(120).optional(), phone: text(30).optional(), neighborhood: text(80).optional(), street: text(160).optional(),
  number: text(20).optional(), complement: text(80).optional(), reference: text(200).optional(), window: text(30).optional(),
  notes: text(500).optional(), consent: z.boolean().optional(),
});
export const reason = z.object({ reason: text(200) });
export const requeue = z.object({ window: text(30).optional(), notes: text(500).optional() });
export const reassign = z.object({ driverId: z.number().int().nullable() });
export const clientPatch = z.object({
  name: text(120).optional(), phone: text(30).optional(), neighborhood: text(80).optional(), street: text(160).optional(),
  number: text(20).optional(), complement: text(80).optional(), reference: text(200).optional(), consent: z.boolean().optional(),
  applyToOpen: z.boolean().default(false),
});
export const mergeClient = z.object({ mergeId: z.number().int() });
export const neighborhoodEdit = z.object({ name: text(80), zone: text(80) });
export const driverPatch = z.object({ name: text(120).optional(), active: z.boolean().optional() });
export const vehicleActive = z.object({ active: z.boolean() });
