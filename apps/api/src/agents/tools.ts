import { desc, eq } from 'drizzle-orm';
import type Anthropic from '@anthropic-ai/sdk';
import {
  ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS, nextStop, routeOrders,
  type Dataset, type OrderStatus, type Role, type RouteStatus,
} from '@rotacerta/domain';
import type { Db } from '../db/client';
import * as schema from '../db/schema';

/**
 * Catálogo de ferramentas que um agente pode receber. Toda ferramenta é de LEITURA e trabalha sobre os dados que o
 * perfil de quem conversa já pode ver (o mesmo filtro do `/api/dataset`): o agente nunca enxerga mais do que a pessoa.
 *
 * Para criar uma ferramenta nova: acrescente um item em `AGENT_TOOLS` com nome, descrição (o modelo lê), schema de
 * entrada estrito e `run`. A tela de agentes lista o catálogo sozinha.
 */
export interface ToolContext {
  data: Dataset;
  role: Role;
  driverId: number | null;
  /** Consulta a tabelas que não estão no Dataset (ex.: posições), numa transação curta no schema da empresa. */
  tenant: <T>(fn: (tx: Db) => Promise<T>) => Promise<T>;
  now: Date;
}

export interface AgentTool {
  name: string;
  label: string;
  group: 'Entregas' | 'Clientes' | 'Viagens' | 'Operação';
  /** Lida pelo modelo: diga o que a ferramenta devolve e quando usá-la. */
  description: string;
  /** Perfis que podem usar a ferramenta, além do agente tê-la liberada. */
  roles: Role[];
  input_schema: Anthropic.Beta.BetaTool['input_schema'];
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown> | unknown;
}

const ALL: Role[] = ['gestao', 'atendente', 'expedicao'];
const MONITORS: Role[] = ['gestao', 'expedicao'];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digits = (s: string) => s.replace(/\D/g, '');
const str = (v: unknown) => (typeof v === 'string' ? v : '');

const ORDER_FILTERS: Record<string, OrderStatus[] | null> = {
  todas: null,
  em_aberto: ['draft', 'awaiting', 'ready', 'queued', 'loading', 'released', 'onroute'],
  aguardando_caixas: ['awaiting'],
  prontas: ['ready', 'queued'],
  em_carregamento: ['loading', 'released'],
  em_rota: ['onroute'],
  entregues: ['delivered'],
  nao_entregues: ['failed'],
  canceladas: ['cancelled'],
};
const ROUTE_FILTERS: Record<string, RouteStatus[] | null> = {
  todos: null, carregando: ['loading'], liberados: ['released'], em_andamento: ['active'], finalizados: ['finished'],
};

const object = (properties: Record<string, unknown>) => ({
  type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false,
});

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'buscar_entregas', label: 'Buscar entregas', group: 'Entregas', roles: ALL,
    description: 'Lista entregas (até 25) filtrando por texto (nome do cliente, código, bairro ou telefone; vazio = todas) e por situação. Devolve o total encontrado e, para cada entrega: código, cliente, bairro, janela, situação e número de caixas.',
    input_schema: object({
      texto: { type: 'string', description: 'Trecho do nome, código, bairro ou telefone. Vazio para não filtrar.' },
      situacao: { type: 'string', enum: Object.keys(ORDER_FILTERS) },
    }),
    run: ({ data }, input) => {
      const q = norm(str(input.texto));
      const statuses = ORDER_FILTERS[str(input.situacao)] ?? null;
      const found = data.orders.filter((o) => (!statuses || statuses.includes(o.status)) && (!q
        || norm(o.name).includes(q) || String(o.id) === q.replace('#', '') || norm(o.neighborhood).includes(q)
        || (digits(q).length >= 4 && digits(o.phone).includes(digits(q)))));
      return {
        total: found.length,
        entregas: found.slice(0, 25).map((o) => ({
          codigo: o.id, cliente: o.name, bairro: o.neighborhood, janela: o.window, situacao: ORDER_STATUS_LABELS[o.status], caixas: o.boxes.length + o.gas,
        })),
      };
    },
  },
  {
    name: 'detalhe_entrega', label: 'Detalhe de uma entrega', group: 'Entregas', roles: ALL,
    description: 'Mostra uma entrega pelo código: cliente, endereço, janela, caixas, romaneio, motorista, ocorrência e o histórico (o que aconteceu, quando e por quem).',
    input_schema: object({ codigo: { type: 'integer', description: 'Código da entrega (ex.: 103).' } }),
    run: ({ data }, input) => {
      const o = data.orders.find((x) => x.id === Number(input.codigo));
      if (!o) return { encontrada: false };
      const route = o.routeId != null ? data.routes.find((r) => r.id === o.routeId) : undefined;
      return {
        encontrada: true, codigo: o.id, cliente: o.name, telefone: o.phone, endereco: `${o.street}, ${o.number}${o.complement ? ` (${o.complement})` : ''} — ${o.neighborhood}`,
        referencia: o.reference, janela: o.window, observacoes: o.notes, situacao: ORDER_STATUS_LABELS[o.status],
        caixas: o.boxes, itens_fora_da_caixa: o.gas, aceita_whatsapp: o.consent, cadastrada: o.created, concluida: o.completed,
        romaneio: route ? { codigo: route.id, situacao: ROUTE_STATUS_LABELS[route.status], motorista: data.drivers.find((d) => d.id === route.driverId)?.name ?? null, saida: route.departure } : null,
        ocorrencia: o.occurrence ?? null, cancelamento: o.cancelled ?? null, recebedor: o.receiver ?? null,
        historico: o.history.slice(-15),
      };
    },
  },
  {
    name: 'resumo_operacao', label: 'Resumo da operação', group: 'Operação', roles: ALL,
    description: 'Números da operação agora: entregas por situação, romaneios por situação, entregas sem caixas identificadas e não entregues aguardando devolução.',
    input_schema: object({}),
    run: ({ data }) => {
      const byOrder: Record<string, number> = {};
      for (const o of data.orders) byOrder[ORDER_STATUS_LABELS[o.status]] = (byOrder[ORDER_STATUS_LABELS[o.status]] ?? 0) + 1;
      const byRoute: Record<string, number> = {};
      for (const r of data.routes) byRoute[ROUTE_STATUS_LABELS[r.status]] = (byRoute[ROUTE_STATUS_LABELS[r.status]] ?? 0) + 1;
      return {
        total_entregas: data.orders.length, entregas_por_situacao: byOrder, romaneios_por_situacao: byRoute,
        aguardando_caixas: data.orders.filter((o) => o.status === 'awaiting').length,
        nao_entregues_sem_devolucao: data.orders.filter((o) => o.status === 'failed' && !o.returned).length,
        avisos_com_falha: data.notifications.filter((n) => n.status === 'failed').length,
      };
    },
  },
  {
    name: 'buscar_clientes', label: 'Buscar clientes', group: 'Clientes', roles: ALL,
    description: 'Procura clientes (até 10) pelo nome ou telefone e devolve nome, telefone, bairro e quantas entregas cada um já teve.',
    input_schema: object({ texto: { type: 'string', description: 'Trecho do nome ou do telefone (ao menos 3 caracteres).' } }),
    run: ({ data }, input) => {
      const q = norm(str(input.texto));
      if (q.length < 3) return { erro: 'Informe ao menos 3 caracteres.' };
      const found = data.clients.filter((c) => norm(c.name).includes(q) || (digits(q).length >= 4 && digits(c.phone).includes(digits(q))));
      return {
        total: found.length,
        clientes: found.slice(0, 10).map((c) => ({ nome: c.name, telefone: c.phone, bairro: c.neighborhood, entregas: data.orders.filter((o) => o.clientId === c.id).length })),
      };
    },
  },
  {
    name: 'listar_romaneios', label: 'Listar romaneios', group: 'Viagens', roles: ALL,
    description: 'Lista romaneios (cargas) por situação, com motorista, veículo, horário de saída e andamento (paradas concluídas / total).',
    input_schema: object({ situacao: { type: 'string', enum: Object.keys(ROUTE_FILTERS) } }),
    run: ({ data }, input) => {
      const statuses = ROUTE_FILTERS[str(input.situacao)] ?? null;
      const list = data.routes.filter((r) => !statuses || statuses.includes(r.status));
      return {
        total: list.length,
        romaneios: list.slice(0, 25).map((r) => {
          const orders = routeOrders(data, r);
          return {
            codigo: r.id, situacao: ROUTE_STATUS_LABELS[r.status], motorista: data.drivers.find((d) => d.id === r.driverId)?.name ?? null,
            veiculo: data.vehicles.find((v) => v.id === r.vehicleId)?.name ?? null, saida: r.departure,
            paradas: orders.length, concluidas: orders.filter((o) => o.status === 'delivered' || o.status === 'failed').length,
          };
        }),
      };
    },
  },
  {
    name: 'viagens_ao_vivo', label: 'Viagens ao vivo (localização)', group: 'Viagens', roles: MONITORS,
    description: 'Viagens em andamento agora: motorista, parada atual (cliente e bairro), andamento e há quanto tempo chegou a última posição do motorista (com coordenadas).',
    input_schema: object({}),
    run: async ({ data, tenant, now }) => {
      const out = [];
      for (const r of data.routes.filter((x) => x.status === 'active')) {
        const [last] = await tenant((tx) => tx.select().from(schema.driverLocations).where(eq(schema.driverLocations.routeId, r.id)).orderBy(desc(schema.driverLocations.recordedAt)).limit(1));
        const orders = routeOrders(data, r);
        const current = nextStop(data, r);
        out.push({
          romaneio: r.id, motorista: data.drivers.find((d) => d.id === r.driverId)?.name ?? null,
          paradas: orders.length, concluidas: orders.filter((o) => o.status === 'delivered' || o.status === 'failed').length,
          parada_atual: current ? { codigo: current.id, cliente: current.name, bairro: current.neighborhood } : null,
          ultima_posicao: last ? { lat: Number(last.lat.toFixed(5)), lng: Number(last.lng.toFixed(5)), ha_segundos: Math.max(0, Math.round((now.getTime() - last.recordedAt.getTime()) / 1000)) } : null,
        });
      }
      return { viagens: out };
    },
  },
];

export const toolByName = (name: string) => AGENT_TOOLS.find((t) => t.name === name);

/** Catálogo para a tela (sem as funções). */
export const toolCatalog = () => AGENT_TOOLS.map(({ name, label, group, description, roles }) => ({ name, label, group, description, roles }));
