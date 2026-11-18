import { z } from 'zod';
import type { Dataset, PaperForm, Workspace } from '@rotacerta/domain';

/* Contratos de entrada compartilhados pela API e por clientes TypeScript. */
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
export const role = z.enum(['gestao', 'atendente', 'expedicao', 'motorista']);
export const anyRole = z.enum(['gestao', 'atendente', 'expedicao', 'motorista', 'plataforma']);
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

const personName = z.string().trim().min(3, 'Informe o nome completo.').max(120);
const email = z.email('Informe um e-mail válido.').max(200);
export const companyCreate = z.object({
  name: z.string().trim().min(2, 'Informe o nome da empresa.').max(120),
  manager: z.object({ name: personName, email, password }),
});
export const companyPatch = z.object({ name: z.string().trim().min(2, 'Informe o nome da empresa.').max(120).optional(), active: z.boolean().optional() });
export const platformUserCreate = z.object({ name: personName, email, password, role: z.enum(['gestao', 'atendente', 'expedicao']) });
export const platformUserPatch = z.object({ name: personName.optional(), active: z.boolean().optional() });

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

/* Contratos de resposta usados para validar a fronteira de rede no navegador. */
const neighborhoodResponse = z.object({ name: z.string(), zone: z.string() });
const vehicleResponse = z.object({ id: z.number(), name: z.string(), plate: z.string(), capacity: z.number(), active: z.boolean().optional() });
const driverResponse = z.object({ id: z.number(), name: z.string(), active: z.boolean().optional() });
const clientResponse = z.object({
  id: z.number(), name: z.string(), phone: z.string(), neighborhood: z.string(), street: z.string(), number: z.string(),
  complement: z.string(), reference: z.string(), consent: z.boolean(),
});
const orderResponse = z.object({
  id: z.number(), clientId: z.number(), name: z.string(), phone: z.string(), neighborhood: z.string(), street: z.string(),
  number: z.string(), complement: z.string(), reference: z.string(), consent: z.boolean(), window: z.string(), notes: z.string(),
  boxes: z.array(z.string()), boxDetails: z.record(z.string(), z.object({ type: boxType, location: z.string() })).optional(),
  cold: z.number(), frozen: z.number(), gas: z.number(), storage: z.string(),
  status: z.enum(['draft', 'awaiting', 'ready', 'queued', 'loading', 'released', 'onroute', 'delivered', 'failed', 'cancelled']),
  routeId: z.number().nullable(), created: z.string(), completed: z.string().nullable(), receiver: z.string().optional(),
  occurrence: z.object({ reason: z.string(), notes: z.string() }).optional(),
  returned: z.object({ at: z.string(), actor: z.string() }).optional(),
  cancelled: z.object({ reason: z.string(), at: z.string(), actor: z.string() }).optional(),
  history: z.array(z.object({ label: z.string(), time: z.string(), actor: z.string() })),
});
const routeResponse = z.object({
  id: z.number(), vehicleId: z.number(), driverId: z.number().nullable(), orders: z.array(z.number()),
  status: z.enum(['loading', 'released', 'active', 'finished']), departure: z.string(), created: z.string(),
  checked: z.record(z.string(), z.boolean()).optional(), claimedAt: z.string().optional(), confirmed: z.record(z.string(), z.boolean()).optional(),
  audit: z.record(z.string(), z.object({ checked: z.boolean(), at: z.string(), actor: z.string() })).optional(),
  signatures: z.record(z.string(), z.string()).optional(), finished: z.string().optional(),
  interrupted: z.object({ reason: z.string(), at: z.string(), actor: z.string() }).optional(),
});
const notificationResponse = z.object({
  id: z.string(), routeId: z.number(), orderId: z.number(), name: z.string(), phone: z.string(),
  status: z.enum(['queued', 'delivered', 'failed', 'skipped']), key: z.string().optional(),
  event: z.enum(['rota_iniciada', 'entrega_concluida']), created: z.string(), message: z.string(), reason: z.string(),
});
const paperResponse = z.object({
  id: z.string(), sheetNumber: z.string(), mode: z.enum(['example', 'photo']), photo: z.string().optional(), photoName: z.string().optional(),
  status: z.enum(['captured', 'draft', 'imported']), values: paperValues, orderId: z.number().nullable(), createdAt: z.string(), importedAt: z.string().optional(),
});

export const datasetResponse: z.ZodType<Dataset> = z.object({
  clients: z.array(clientResponse), neighborhoods: z.array(neighborhoodResponse), zones: z.array(z.string()),
  vehicles: z.array(vehicleResponse), drivers: z.array(driverResponse), orders: z.array(orderResponse), routes: z.array(routeResponse),
  notifications: z.array(notificationResponse), departures: z.array(z.string()),
});
export const snapshotResponse: z.ZodType<Workspace> = z.object({ data: datasetResponse, papers: z.array(paperResponse) });

export const sessionUserResponse = z.object({
  sub: z.number().int(), name: z.string(), role: anyRole, companyId: z.number().int().nullable(), driverId: z.number().int().nullable(),
});
export const sessionResponse = z.object({ token: z.string().min(1), user: sessionUserResponse, mustChangePassword: z.boolean() });
export const wsTicketResponse = z.object({ ticket: z.string().min(1) });

export type SessionUser = z.infer<typeof sessionUserResponse>;
export type Session = z.infer<typeof sessionResponse>;
export type Snapshot = { data: Dataset; papers: PaperForm[] };

/* ---------- Agentes de IA ---------- */
/** Modelos que a tela oferece. O padrão é o mais capaz; os outros trocam qualidade por custo e velocidade. */
export const AGENT_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export const AGENT_EFFORTS = ['low', 'medium', 'high'] as const;
const agentRole = z.enum(['gestao', 'atendente', 'expedicao']);

export const agentKnowledge = z.object({ title: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(4000) });
export const agentInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao agente.').max(60),
  description: z.string().trim().max(240).default(''),
  instructions: z.string().trim().min(10, 'Escreva as instruções do agente (ao menos uma frase).').max(6000),
  model: z.enum(AGENT_MODELS).default('claude-opus-5-5'),
  effort: z.enum(AGENT_EFFORTS).default('medium'),
  tools: z.array(z.string().max(60)).max(20).default([]),
  roles: z.array(agentRole).min(1, 'Escolha ao menos um perfil que pode usar o agente.').max(3),
  knowledge: z.array(agentKnowledge).max(30).default([]),
  active: z.boolean().default(true),
});
export const agentPatch = agentInput.partial();
export const agentChat = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(4000) })).min(1).max(30)
    .refine((m) => m[m.length - 1].role === 'user', 'A última mensagem precisa ser do usuário.'),
});
export type AgentInput = z.infer<typeof agentInput>;
