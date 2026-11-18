import type Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LlmClient } from '../src/agents/runtime';
import { closeTestDbs, createTestApp, loginAs } from './helpers';

/**
 * Modelo falso: na primeira chamada pede a ferramenta indicada; na segunda responde com o texto que recebeu dela.
 * Guarda os pedidos para conferir o que foi enviado (ferramentas liberadas, instruções).
 */
function fakeLlm(toolName: string, input: Record<string, unknown>) {
  const requests: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
  const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const client: LlmClient = {
    beta: {
      messages: {
        async create(params) {
          requests.push(params);
          const last = params.messages[params.messages.length - 1];
          const toolResult = Array.isArray(last.content) ? last.content.find((b) => b.type === 'tool_result') : undefined;
          if (!toolResult && params.tools?.some((t) => 'name' in t && t.name === toolName)) {
            return { id: 'm1', type: 'message', role: 'assistant', model: params.model, stop_reason: 'tool_use', stop_sequence: null, usage,
              content: [{ type: 'tool_use', id: 't1', name: toolName, input }] } as unknown as Anthropic.Beta.BetaMessage;
          }
          const text = toolResult && 'content' in toolResult ? `Resultado: ${String(toolResult.content).slice(0, 200)}` : 'Sem ferramenta.';
          return { id: 'm2', type: 'message', role: 'assistant', model: params.model, stop_reason: 'end_turn', stop_sequence: null, usage,
            content: [{ type: 'text', text }] } as unknown as Anthropic.Beta.BetaMessage;
        },
      },
    },
  };
  return { client, requests };
}

const agent = {
  name: 'Assistente da operação', description: 'Responde sobre entregas', instructions: 'Ajude a equipe a encontrar entregas.',
  tools: ['buscar_entregas', 'viagens_ao_vivo'], roles: ['gestao', 'atendente'], knowledge: [{ title: 'Horário', text: 'A loja entrega das 8h às 20h.' }],
};

describe('agentes de IA', () => {
  let app: FastifyInstance;
  let fake: ReturnType<typeof fakeLlm>;
  beforeAll(async () => { fake = fakeLlm('buscar_entregas', { texto: 'Ana', situacao: 'todas' }); ({ app } = await createTestApp({ llm: fake.client })); });
  afterAll(closeTestDbs);

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object });

  it('só a gestão cria; ferramenta desconhecida é recusada', async () => {
    const gestao = await loginAs(app, 'gestao');
    expect((await call('POST', '/api/agents', await loginAs(app, 'atendente'), agent)).statusCode).toBe(403);
    expect((await call('POST', '/api/agents', gestao, { ...agent, tools: ['apagar_tudo'] })).statusCode).toBe(400);
    const res = await call('POST', '/api/agents', gestao, agent);
    expect(res.statusCode).toBe(200);
    expect(res.json().model).toBe('claude-opus-5-5');
  });

  it('conversa: o agente consulta a ferramenta e responde com dados reais', async () => {
    const atendente = await loginAs(app, 'atendente');
    const [a] = (await call('GET', '/api/agents', atendente)).json();
    const res = await call('POST', `/api/agents/${a.id}/chat`, atendente, { messages: [{ role: 'user', text: 'Cadê a entrega da Ana?' }] });
    expect(res.statusCode).toBe(200);
    expect(res.json().steps).toEqual([{ tool: 'buscar_entregas', label: 'Buscar entregas', ok: true }]);
    expect(res.json().reply).toContain('Ana Souza');
    // a atendente não monitora viagens: a ferramenta de localização não vai para o modelo
    const tools = fake.requests[0].tools?.map((t) => ('name' in t ? t.name : '')) ?? [];
    expect(tools).toEqual(['buscar_entregas']);
    // as regras da plataforma vão antes das instruções do agente, e a base de conhecimento junto
    const system = JSON.stringify(fake.requests[0].system);
    expect(system.indexOf('REGRAS DA PLATAFORMA')).toBeLessThan(system.indexOf('Ajude a equipe'));
    expect(system).toContain('A loja entrega das 8h às 20h.');
  });

  it('perfil sem acesso ao agente e IA não configurada', async () => {
    const [a] = (await call('GET', '/api/agents', await loginAs(app, 'gestao'))).json();
    expect((await call('POST', `/api/agents/${a.id}/chat`, await loginAs(app, 'expedicao'), { messages: [{ role: 'user', text: 'oi' }] })).statusCode).toBe(403);
    const { app: noAi } = await createTestApp({ llm: null });
    const g = await loginAs(noAi, 'gestao');
    const created = (await noAi.inject({ method: 'POST', url: '/api/agents', headers: g, payload: agent })).json();
    expect((await noAi.inject({ method: 'POST', url: `/api/agents/${created.id}/chat`, headers: g, payload: { messages: [{ role: 'user', text: 'oi' }] } })).statusCode).toBe(503);
  });

  it('registra o uso (sem guardar o texto) e mostra o custo estimado', async () => {
    const res = await call('GET', '/api/agents/usage', await loginAs(app, 'gestao'));
    expect(res.statusCode).toBe(200);
    expect(res.json().agents[0].chats).toBe(1);
    expect(res.json().totalUsd).toBeGreaterThan(0);
  });
});
