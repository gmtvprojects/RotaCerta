# Arquitetura, linguagens e padrões

Documento de referência do RotaCerta. Registra **o que usamos, por quê e como organizamos o código**.
Quando uma decisão mudar, atualize aqui no mesmo PR.

## 1. Visão geral

```
apps/web         App web (gestão, atendimento, expedição)        React + Vite + PWA
apps/api         API e tempo real                                 Fastify + PostgreSQL
apps/mobile      App do motorista                                 Ionic React + Capacitor
packages/domain  Regras de negócio, tipos e permissões            TypeScript puro
packages/contracts Contratos HTTP e validação das fronteiras       Zod
```

Tudo em um monorepo (pnpm workspaces + Turborepo). Um repositório só, porque as regras vivem em
`packages/domain` e são usadas pelo front, pela API e (futuramente) pelo app: assim não divergem.

## 2. Linguagens e tecnologias

| Camada | Escolha | Observação |
|---|---|---|
| Linguagem | **TypeScript** (strict) em todo o código | Um idioma de ponta a ponta, tipos compartilhados |
| Runtime | Node.js 22 | |
| Gerenciador | pnpm 11 + Turborepo | |
| Web | React 19, Vite 6, React Router 6, PWA, **Astryx** (design system da Meta, tema `neutral`, fonte Figtree) | Ver 3.14 |
| API | **Fastify 5** | Plugins: `@fastify/jwt`, `cors`, `rate-limit`, `websocket` |
| Banco | **PostgreSQL 16** | Sem extensões proprietárias, para migrar para RDS sem retrabalho |
| ORM / migrações | **Drizzle ORM** + drizzle-kit | SQL versionado em `apps/api/drizzle` |
| Validação | **Zod 4** | Corpo das requisições e variáveis de ambiente |
| Qualidade | **Biome** | Lint rápido e uniforme no monorepo |
| Testes | **Vitest** + PGlite (Postgres em memória) | Testa o schema e as migrações de verdade, sem Docker |
| Build da API | tsup (esbuild) | Embute `@rotacerta/domain` no bundle |
| Container | Docker (`apps/api/Dockerfile`) | Mesmo container no Railway e na AWS |
| Mobile | Ionic React + Capacitor | GPS em segundo plano exige plugin nativo; push |
| Avisos (futuro) | WhatsApp Cloud API (Meta) + fila BullMQ/Redis | |

## 3. Padrões de projeto

### 3.1 Domínio puro (Functional Core, Imperative Shell)
`packages/domain` contém **só funções puras**: recebem o estado (`Dataset`) e devolvem o novo estado
ou um erro (`{ ok: true, data } | { ok: false, error }`). Não acessam banco, rede, relógio nem `Math.random`.
- Quem precisa de hora recebe um `Clock` por parâmetro (injeção de dependência).
- Erros de regra de negócio são **valores**, não exceções.
- Toda regra nova nasce aqui, com a mensagem de erro em português, e só depois é exposta pela API.

### 3.2 Unidade de trabalho (Unit of Work)
Toda escrita da API passa por `mutate()` (`apps/api/src/db/unit-of-work.ts`):
1. abre transação e toma uma trava consultiva (`pg_advisory_xact_lock`);
2. carrega o estado (`loadWorkspace`);
3. executa a regra do domínio;
4. grava **só o que mudou** (`saveWorkspace`, comparando antes e depois);
5. em erro de regra, nada é gravado (resposta `422`).

Efeito: as regras do domínio são aplicadas exatamente como no front, e escritas concorrentes de vários
dispositivos são serializadas. **Limite conhecido:** o estado inteiro é carregado a cada escrita; adequado
para uma loja (centenas de entregas). Quando o histórico crescer, carregar só entregas abertas e dos
últimos dias.

### 3.3 Repositório / Mapper
`apps/api/src/db/workspace.ts` converte linhas do banco em entidades do domínio e vice-versa.
Campos opcionais do domínio são "ausentes" (não `null`); estruturas aninhadas (histórico, conferência) ficam em `jsonb`.
O teste `workspace.test.ts` garante que *o que sai do banco é idêntico ao seed do domínio*.

### 3.4 Ports and Adapters
Dependências externas ficam atrás de uma interface, com implementação trocável:
- `NotificationSender` (`src/notifications/sender.ts`): hoje `SimulatedSender`; depois, WhatsApp Cloud API.
- `Db`: o mesmo código roda em `node-postgres` (produção) e PGlite (testes).
- `EventBus` (`src/realtime/events.ts`): em memória; com `REDIS_URL` os eventos passam por Redis pub/sub e chegam aos aparelhos de qualquer réplica (se o Redis cair, a instância segue com os eventos locais).

### 3.5 Camadas da API
```
http/schemas.ts    validação de entrada (Zod)
http/business.ts   rotas: autoriza o perfil → valida → chama regra do domínio via mutate()
app.ts             composição (plugins, auth, dataset, WebSocket)
db/                schema, migrações, repositório, unidade de trabalho, seed
```
Rotas finas: nenhuma regra de negócio dentro de rota.

### 3.5.1 Contratos HTTP compartilhados
`packages/contracts` é a fonte única dos schemas Zod usados nas entradas da API. As respostas críticas de sessão e do
dataset também são validadas no navegador; uma resposta incompatível falha na fronteira HTTP em vez de contaminar o estado
da aplicação por meio de um cast TypeScript. O pacote depende somente do domínio e do Zod, sem importar API ou React.

### 3.6 Autorização por perfil
Perfis: `gestao`, `atendente`, `expedicao`, `motorista`. Cada rota declara quem pode chamá-la (`guard([...])`);
o perfil vem do JWT. O motorista só age como **ele mesmo** (`driverId` do usuário); a gestão pode agir em nome de outro.
O front esconde telas por perfil (`ALLOWED_PAGES`), mas **a API é quem garante**.

### 3.7 Sessão, privacidade e auditoria
- **Sessão:** ver a seção 5. O cookie é `SameSite=Lax` por padrão; com web e API em domínios diferentes (Railway), use `COOKIE_SAMESITE=none` + HTTPS. As rotas que usam o cookie (`/refresh`, `/logout`) exigem o cabeçalho `x-requested-with: rotacerta` (defesa contra CSRF).
- **Privacidade por perfil:** `apps/api/src/privacy.ts` decide o que cada perfil lê; o filtro roda no servidor.
- **Auditoria:** toda escrita de usuário logado é gravada **antes** de a resposta sair (`audit_log`), com quem, ação, parâmetros, resultado e IP; login (inclusive falho), logout e gestão de usuários têm eventos próprios. Nunca se grava corpo de requisição, senha nem token.

### 3.8 Localização do motorista (GPS)
- **Coleta:** só na viagem **ativa** do **próprio** motorista (`POST /api/routes/:id/locations`); fora da viagem a API recusa. Cada ponto traz a hora do aparelho; a chave (rota, hora) torna o reenvio idempotente, então o app pode guardar pontos sem sinal e mandar em lote. Pontos do futuro (>60 s) ou com mais de 24 h são descartados.
- **Quem vê:** apenas gestão e expedição, por `/api/tracking` e pelo WebSocket (o canal filtra pelo perfil do ticket). Motorista e atendente nunca recebem posições.
- **Tempo real:** evento `location` no WebSocket com o ponto mais recente; o painel não rebusca o estado todo.
- **Retenção (dado pessoal):** posições ficam `LOCATION_RETENTION_DAYS` dias (padrão 30) e são apagadas por uma rotina que roda ao subir e a cada 6 h. Informe os motoristas sobre a coleta (o app web já avisa que a posição é compartilhada durante a viagem).
- **Fora da auditoria:** envio de posição não é ação de usuário e não entra em `audit_log`.
- **Web:** o motorista no navegador só compartilha com a tela aberta (navegador não rastreia em segundo plano); para segundo plano, o app Expo. Mapa com Leaflet; tiles via `VITE_MAP_TILES_URL` (padrão OpenStreetMap, só para uso leve: em produção contrate um provedor).
- **Envio pelo motorista:** um "farol" montado uma vez no app (web: `DriverBeacon`; app Ionic: `useDriverBeacon`) envia a posição durante a viagem ativa em **qualquer tela**, não só na tela da viagem. A fila de pontos não enviados fica guardada no aparelho.
- **Painel (Acompanhar viagens):** lista das viagens ao vivo, marcador com a direção do movimento que desliza entre os pontos, "Seguir motorista" (desliga ao arrastar o mapa), selo Ao vivo / Sinal fraco / Sem sinal, velocidade e precisão. A trilha mostra os pontos mais recentes e é quebrada em trechos quando há mais de 2 min sem sinal.
- **Simulador:** no ambiente de teste, o botão "Simular deslocamento" do painel (`POST/DELETE /api/routes/:id/simulate`) faz o motorista andar por ruas por 15 min; em produção a rota nem existe. Pela linha de comando: `pnpm --filter @rotacerta/api simulate:driver` (mesmo percurso).

### 3.9 Regras de exceção da operação
Ficam em `packages/domain` (`rules.ts`, `operations.ts`, `clients.ts`, `config.ts`), com a mesma mensagem de erro no servidor e na tela.
- **Caixa em uso:** um código só pode estar em uma entrega ativa por vez. Fica livre quando a entrega é concluída, cancelada, ou quando a falha tem a devolução confirmada.
- **Editar:** dados da entrega mudam até ela sair para a rota. **Cancelar:** vale em qualquer fase exceto "em rota" (o motorista registra ocorrência, ou a viagem é interrompida) e "entregue". Cancelar uma entrega que está numa carga a tira dela e desfaz a conferência; carga que fica vazia é desfeita.
- **Entrega não realizada:** os volumes voltam com o motorista; a expedição confirma a devolução (só depois do fim da viagem) e então a entrega pode ganhar **nova tentativa** (volta a "pronta para planejar", com as mesmas caixas) ou ser cancelada.
- **Viagem:** pode ser **interrompida** (as paradas pendentes viram "não entregue: viagem interrompida" e seguem o fluxo de devolução) ou ter o **motorista trocado** (o antigo deixa de enviar posição e de registrar paradas).
- **Capacidade:** a carga não passa da capacidade do veículo, nem quando as caixas de uma entrega já carregada aumentam.
- **Cadastros:** veículo e motorista são **desativados** (somem das escolhas, mantêm o histórico) e só são **removidos** se nunca foram usados. Região e bairro só são removidos vazios; renomear um bairro atualiza clientes e entregas. Clientes com entregas não são removidos: unem-se aos duplicados.

### 3.11 Multiempresa (um schema do Postgres por empresa)
O serviço atende várias empresas. Cada uma tem um **schema próprio** (`tenant_<id>`) com as tabelas da operação
(`src/db/schema-tenant.ts`); o schema `public` guarda só o que é compartilhado (`schema-platform.ts`): `companies`,
`users`, `refresh_tokens`, `audit_log`. Escolhido porque os ids são gerados pelo domínio e reiniciam em cada empresa
(cada uma tem a entrega nº 1, 2, 3…) e porque **esquecer de escolher a empresa falha** (as tabelas não existem em `public`)
em vez de vazar dados de outra.
- **Acesso a dados da operação** só por `withTenant(db, companyId, …)` ou `mutate(db, companyId, …)` (`db/tenants.ts`,
  `db/unit-of-work.ts`): a transação aponta o `search_path` para o schema da empresa. O `companyId` vem do token (nunca do cliente)
  e o nome do schema só é montado a partir de um inteiro validado. A trava de escrita é por empresa.
- **Migrações em dois conjuntos:** `drizzle/` (plataforma, `pnpm db:generate`) e `drizzle-tenant/` (empresas,
  `pnpm db:generate:tenant`). Ao subir, a API migra a plataforma e depois **todas as empresas** (`migrateAllTenants`);
  criar uma empresa aplica `drizzle-tenant/` ao schema novo, na mesma transação do cadastro.
- **Perfis:** os quatro de empresa (`gestao`, `atendente`, `expedicao`, `motorista`) e `plataforma` (`AnyRole`), que não
  pertence a empresa nenhuma (`users.company_id` nulo). A plataforma **não lê dados da operação**: o painel mostra
  cadastro, acessos, auditoria e só contagens de uso.
- **Isolamento nas rotas:** usuários, auditoria, eventos em tempo real (`EventBus.subscribe(companyId)`) e o WebSocket
  (ticket com a empresa) são filtrados por empresa. A gestão só enxerga e altera usuários da própria empresa.
- **Empresa suspensa** não entra (403 no login, renovação recusada e sessões revogadas). O token de acesso já emitido vale
  até 15 min.
- **Senhas definidas por outra pessoa** (cadastro da empresa, redefinição pelo suporte ou pela gestão) marcam
  `must_change_password`: o app exige a troca antes de qualquer tela. A senha provisória gerada pelo suporte é devolvida uma
  única vez (`Cache-Control: no-store`) e nunca vai para log ou auditoria. Ações da plataforma ficam na auditoria da empresa
  afetada (`platform.*`).
- **E-mail único em todo o serviço:** o login não pede a empresa.

### 3.10 Configuração (12-factor)
Tudo por variáveis de ambiente, validadas na subida (`src/config.ts`); nada específico de plataforma no código.
Segredos nunca entram no repositório (`.env` ignorado; usar `.env.example` como modelo).

### 3.12 Segurança de borda
- **API:** `@fastify/helmet` (CSP `default-src 'none'`, `nosniff`, sem frames; HSTS em produção). `trustProxy` ligado em produção (`TRUST_PROXY` para ajustar): sem ele o limite de login e a auditoria veriam o IP do proxy. Teto de `WRITE_RATE_MAX` escritas por minuto e por IP (o envio de posições fica de fora).
- **Conta:** `LOGIN_LOCK_FAILURES` falhas seguidas bloqueiam a conta por `LOGIN_LOCK_MINUTES` minutos; a resposta é a mesma de uma senha errada (não revela que o e-mail existe) e o bloqueio fica na auditoria (`auth.account_locked`).
- **Site (nginx):** `apps/web/security-headers.conf` define CSP (scripts só do próprio site), `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS. O arquivo é incluído em cada `location`, porque o nginx não herda `add_header`. Se a API ou os tiles do mapa usarem outro esquema que não HTTPS, ajuste `connect-src` e `img-src`.
- **Cadeia de suprimentos:** o CI roda `pnpm audit --prod` (falha em crítica), gitleaks e CodeQL; o Dependabot abre PRs semanais. Pendentes sem correção publicada: `picomatch` e `react-router` 5 dentro do Ionic.
- **Rastreio:** toda resposta traz `x-request-id`, o mesmo `reqId` dos logs.

### 3.13 Despacho de avisos
O domínio cria o aviso como `queued`; o despachante (`src/notifications/dispatcher.ts`) envia a fila de todas as empresas ativas a cada 5 s, com trava consultiva (uma instância por vez) e envio fora da transação da empresa. Sucesso vira `delivered`; falha vira `failed` com o motivo e a gestão reenvia. Para o WhatsApp real, implemente `NotificationSender`.

### 3.14 Design system (Astryx)
O web usa o Astryx (`@astryxdesign/core`, tema `@astryxdesign/theme-neutral`, MIT, em beta). Exige React 19.
- **Já em componentes do Astryx:** casca do app (`app/Shell.tsx`: `AppShell`, `SideNav`, `TopNav`, `Button`, `Avatar`, `Badge`), cabeçalho de página (`Heading`/`Text`), selos de estado (`Badge`) e janelas (`Dialog`), todos em `pages/ui.tsx`.
- **Ainda no markup antigo:** cartões, tabelas, listas, campos e botões das telas. Eles leem os tokens do Astryx por uma ponte (`src/theme-astryx.css`), então já têm a mesma fonte, cores e raios. Ao migrar uma tela, troque o markup por componentes e apague as regras que sobrarem na ponte.
- **Camadas de CSS** (`tailwind.css`): `reset, theme, base, components, astryx-base, astryx-theme, utilities`. O CSS antigo fica em `components`, abaixo do Astryx: um botão do Astryx não é afetado pelas regras globais antigas de `button`.
- **Fonte** self-hosted (`@fontsource-variable/figtree`); não se usa o `fonts.css` do tema (puxaria do Google Fonts e quebraria a CSP).
- **Instalação:** os scripts de instalação do Astryx estão desligados em `pnpm-workspace.yaml` (só imprimem uma dica). Um `packageExtensions` aponta os tipos dele para o `@types/react` 19 (o app mobile segue no React 18).
- **Navegação:** menu lateral (`SideNav`) no computador ou barra embaixo, a escolha em Perfil/Configurações. Em telas estreitas, sempre a barra de baixo.

### 3.15 Agentes de IA (aba "Agentes de IA")
Assistentes que a gestão cria pela tela e que a equipe usa para perguntar sobre a operação em linguagem natural.
Mesmo desenho do projeto de referência (`chatbot-ia/relatorios_automaticos`): o **código** decide ordem, limites e o caminho seguro; o modelo só escolhe quais consultas fazer e escreve a resposta.
- **Agente = configuração** (tabela `agents` no schema da empresa): nome, descrição, instruções, modelo, esforço, ferramentas liberadas, perfis que podem usar, base de conhecimento, ativo. Criar outro agente não exige código.
- **Ferramentas** (`src/agents/tools.ts`): catálogo genérico, todas de **leitura**, com schema estrito. Rodam sobre os dados que o perfil de quem pergunta já vê (`scopeFor`, o mesmo filtro do `/api/dataset`), e cada uma declara os perfis que podem usá-la (ex.: localização só para gestão e expedição). Nova ferramenta = um item no array; a tela lista o catálogo sozinha.
- **Loop** (`src/agents/runtime.ts`): Messages API da Anthropic (SDK oficial `@anthropic-ai/sdk`) com ferramentas, até 6 rodadas por pergunta, resultado de ferramenta limitado, regras da plataforma acima das instruções do agente, resultados e mensagens tratados como dados (defesa contra injeção de instruções). Recusa, corte e falha da IA viram respostas claras. Recusa por política usa o modelo reserva padrão da própria API (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- **Modelo:** padrão `claude-opus-5-5`; a tela oferece também Sonnet 5.5 e Haiku 5.5 (mais baratos) e o esforço (baixo/médio/alto). A parte fixa do prompt fica em cache entre perguntas.
- **Privacidade e custo:** o texto das conversas não é guardado (o histórico fica no aparelho); a API grava só o uso por dia e agente (`agent_usage`), que a tela mostra com custo estimado. Teto de 20 perguntas/min por IP e `AGENT_DAILY_LIMIT` conversas/dia por empresa.
- **Configuração:** `ANTHROPIC_API_KEY` na API. Sem ela, a aba funciona para criar e configurar, e a conversa avisa que a IA não está ligada.
- **Por que não Managed Agents:** as ferramentas precisam rodar dentro da API, no schema da empresa e com o perfil de quem pergunta. Se no futuro houver agentes que trabalhem sozinhos por muito tempo (relatórios agendados, por exemplo), o Claude Managed Agents hospeda o loop e um ambiente isolado.

### 3.16 Rastreio do cliente (link público)
Na ficha da entrega, a equipe gera um link (`POST /api/orders/:id/tracking-link`) para mandar ao cliente. A página `/#/rastreio/<token>` abre sem login e se atualiza sozinha (`GET /api/public/tracking/:token`, 30/min por IP).
- **Token:** `empresa.entrega.validade` assinado com HMAC (chave derivada do `JWT_SECRET` com rótulo próprio). Vale 3 dias; empresa suspensa invalida.
- **O que o cliente vê:** primeiro nome, situação em 4 passos, janela, quantas entregas antes da dele e, **só quando ele é a parada atual**, a posição do entregador no mapa. Nunca endereço, telefone ou dados de outros clientes.
- **GPS no aparelho do motorista:** a fila de pontos não enviados fica guardada no aparelho (web e app), então fechar ou recarregar o app sem sinal não perde o percurso.

## 4. Convenções

- **Idioma:** código em inglês onde já existe; textos exibidos ao usuário, mensagens de erro e documentação em português.
- **Tipos:** `strict`; sem `any`. Entidades de negócio são definidas em `packages/domain` e reutilizadas, não duplicadas.
- **Datas/hora do domínio:** strings `HH:MM` e `dd/mm/aaaa · HH:MM` no fuso da loja (`APP_TZ`), como o domínio já usa.
- **API:** prefixo `/api`; `400` entrada inválida, `401` sem sessão, `403` perfil sem acesso, `422` regra de negócio recusou (corpo `{ error }`).
- **Banco:** `snake_case` nas colunas, `camelCase` no TypeScript; toda mudança de schema gera migração (`pnpm --filter @rotacerta/api db:generate`) commitada junto.
- **Testes:** regra nova no domínio ganha teste; rota nova ganha teste de fluxo em `apps/api/test`.
- **Git:** `feature/*` → `dev` → `hml` → `prod`, sempre por Pull Request; CI roda typecheck, testes e build.

## 5. API atual

Autenticação por e-mail e senha (hash `scrypt`, mínimo de 10 caracteres). Login limitado a 10 tentativas por minuto por IP (`LOGIN_RATE_MAX`).

**Sessão (seção 3.8):** token de acesso JWT de 15 min, só em memória no navegador; sessão longa (14 dias, renovada a cada uso) em cookie `httpOnly` `rc_refresh` com rotação a cada renovação. Reuso de um token já trocado revoga toda a cadeia; há tolerância de 10 s para duas abas renovando juntas. Logout, troca de senha, desativação e mudança de perfil derrubam as sessões. O WebSocket abre com um ticket de 30 s (`POST /api/auth/ws-ticket`), nunca com o token na URL.

| Método e rota | Perfis | O que faz |
|---|---|---|
| `POST /api/auth/login`, `/refresh`, `/logout`, `/ws-ticket`, `/password`; `GET /api/auth/me` | todos | Sessão e troca da própria senha |
| `GET/POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/password` | gestão | Usuários: criar, mudar perfil, desativar, redefinir senha |
| `GET /api/audit` | gestão | Trilha de auditoria da própria empresa |
| `GET/POST /api/platform/companies`, `GET/PATCH /api/platform/companies/:id` | plataforma | Empresas: listar (usuários, último acesso), criar com o primeiro gestor, ver uso (contagens), renomear, suspender/reativar |
| `GET/POST /api/platform/companies/:id/users`, `GET /api/platform/users?q=`, `PATCH /api/platform/users/:id`, `POST /api/platform/users/:id/reset-password` | plataforma | Acessos de uma empresa, busca em todas, desativar/reativar, senha provisória (mostrada uma vez) |
| `GET /api/platform/audit` | plataforma | Auditoria de todas as empresas (filtro por empresa e ação) |
| `GET /api/dataset` | todos | Estado, filtrado por perfil: o motorista vê só as rotas dele (e as liberadas sem dono); fichas de papel só atendente/gestão |
| `GET /api/ws?token=` | todos | WebSocket: avisa `changed` quando algo muda |
| `POST /api/orders`, `PUT /api/orders/:id/boxes` | gestão, atendente, expedição | Cadastrar entrega, identificar caixas |
| `POST/PATCH/DELETE /api/papers`, `POST /api/papers/:id/import` | gestão, atendente | Fichas de papel |
| `POST /api/routes`, `…/checks`, `…/sync`, `…/orders/:o/confirm`, `…/release`, `DELETE …` | gestão, expedição | Montar carga, conferir, liberar, descartar |
| `POST /api/routes/:id/start`, `POST /api/orders/:id/stop` | gestão, motorista | Iniciar viagem, concluir/ocorrência |
| `POST /api/routes/:id/locations` | motorista da viagem | Envia posições (1 a 100 por chamada, aceita lote após ficar sem sinal) |
| `GET /api/tracking`, `GET /api/routes/:id/track` | gestão, expedição | Viagens ao vivo (última posição, parada atual, andamento) e percurso feito |
| `PATCH /api/orders/:id`, `POST /api/orders/:id/cancel`, `…/requeue` | gestão, atendente, expedição | Corrigir dados, cancelar, agendar nova tentativa de entrega não realizada |
| `POST /api/orders/:id/return` | gestão, expedição | Confirmar que os volumes de uma entrega não realizada voltaram |
| `POST /api/routes/:id/interrupt`, `POST /api/routes/:id/driver` | gestão, expedição | Interromper a viagem; trocar o motorista (planejada, liberada ou em andamento) |
| `GET /api/clients`, `GET /api/clients/:id` | gestão, atendente, expedição | Buscar (nome sem acento ou telefone, paginado) e ver histórico |
| `PATCH /api/clients/:id`, `POST …/merge`, `DELETE …` | gestão, atendente | Corrigir (opcionalmente nas entregas em aberto), unir duplicados, remover cadastro sem entregas |
| `PUT/DELETE /api/config/zones/:nome`, `…/neighborhoods/:nome` | gestão | Renomear/mover e remover região e bairro |
| `PATCH/DELETE /api/config/drivers/:id`, `PATCH …/vehicles/:id/active`, `DELETE …/vehicles/:id` | gestão | Editar, desativar e remover motorista e veículo |
| `POST /api/notifications/:id/retry` | gestão | Reenviar aviso com falha |
| `POST/PUT/DELETE /api/config/*` | gestão | Regiões, bairros, veículos, motoristas, horários |

## 6. Rodando localmente

### 6.00 Docker (tudo junto)
`docker compose up -d --build` sobe Postgres (porta 5440 no host), API (3333) e web (http://localhost:8088). O ambiente vem de `AMBIENTE_TESTE` / `AMBIENTE_PRODUCAO` (padrão: teste, com dados de demonstração). Para produção: `AMBIENTE_TESTE=false AMBIENTE_PRODUCAO=true JWT_SECRET=... POSTGRES_PASSWORD=... docker compose up -d --build`. Portas configuráveis por `POSTGRES_PORT` e `WEB_PORT`. Só o banco: `docker compose up -d postgres`.

### 6.0 Ambientes (teste e produção)
Em `apps/api/.env` ative **exatamente um**: `AMBIENTE_TESTE=true` ou `AMBIENTE_PRODUCAO=true` (o outro `false`).
- **Teste:** `DATABASE_URL` e `JWT_SECRET` opcionais. Sem `DATABASE_URL`, usa banco embutido (PGlite) com migração e dados de demonstração automáticos (senha `rotacerta123`, ou `SEED_PASSWORD`). Basta `pnpm dev`.
- **Produção:** exige `DATABASE_URL` (Postgres real) e `JWT_SECRET` (32+); seed bloqueado; cookie seguro por padrão. Rode `db:migrate` antes de subir.

```bash
docker compose up -d                 # Postgres
cp apps/api/.env.example apps/api/.env   # ajuste JWT_SECRET e SEED_PASSWORD
pnpm --filter @rotacerta/api db:migrate
pnpm --filter @rotacerta/api db:seed     # dados fictícios + 4 usuários (um por perfil)
pnpm --filter @rotacerta/api dev         # http://localhost:3333
pnpm --filter @rotacerta/api test        # não precisa de Docker (Postgres em memória)
TEST_DATABASE_URL=postgres://rotacerta:rotacerta@localhost:5432/postgres pnpm --filter @rotacerta/api test:pg   # mesma suíte no Postgres real
```

### 6.1 Web conectado à API

O web lê o endereço da API em `VITE_API_URL` (padrão `http://localhost:3333`). O store (`apps/web/src/app/store.tsx`) funciona assim:
- **Servidor é a verdade.** Os dados vêm de `GET /api/dataset`; só sessão, rascunho de atendimento e carga em planejamento ficam no aparelho.
- **Previsão local + gravação.** Ações rápidas (conferir volume, concluir parada…) rodam a mesma regra do domínio localmente, mostram o resultado na hora e gravam em fila no servidor; com a fila vazia, o app rebusca o estado e descarta a previsão. Se o servidor recusar, mostra o motivo e volta ao estado real.
- **Criações esperam o servidor** (entrega, carga, ficha), porque o código é definido por ele.
- **Tempo real:** o WebSocket avisa que algo mudou e o app rebusca; também rebusca ao voltar para a aba.

Sem Docker, `pnpm --filter @rotacerta/api dev:local` sobe a API com Postgres embutido (PGlite, dados em `apps/api/.pglite/`), migrações e seed (senha `rotacerta123`).

Usuários do seed: `gestao@`, `atendente@`, `expedicao@`, `motorista@` + `rotacerta.local`, com a senha de `SEED_PASSWORD`.

## 7. Hospedagem e migração para a AWS

Início no **Railway** (serviços `web`, `api`, Postgres, Redis; ambientes `dev`, `hml`, `prod`). Migração futura para a AWS:

| Hoje (Railway) | AWS |
|---|---|
| web (build Vite) | S3 + CloudFront |
| api (container) | ECS Fargate atrás de ALB (suporta WebSocket) |
| Postgres | RDS PostgreSQL |
| Redis | ElastiCache |
| variáveis | Secrets Manager / SSM |

Regras para manter a migração simples: container Docker; config só por variáveis de ambiente; Postgres e Redis padrão;
arquivos fora do disco do container (API compatível com S3); estado compartilhado fora da memória do processo.

### 7.1 Deploy no Railway

Monorepo: cada serviço usa a raiz do repositório como contexto (Root Directory vazio) e um arquivo de configuração próprio.

Não há `railway.json`: um arquivo na raiz seria herdado por todos os serviços. Cada serviço escolhe o Dockerfile pela
variável `RAILWAY_DOCKERFILE_PATH`, e o health check fica em *Settings → Deploy → Healthcheck Path*.

| Serviço | `RAILWAY_DOCKERFILE_PATH` | Healthcheck | Variáveis principais |
|---|---|---|---|
| `api` | `apps/api/Dockerfile` | `/ready` | `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JWT_SECRET`, `CORS_ORIGIN`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `AMBIENTE_PRODUCAO=true` (ou `AMBIENTE_TESTE=true` num ambiente de demonstração; exatamente um) |
| `web` | `apps/web/Dockerfile` | `/` | `VITE_API_URL` (usada no build; sem barra no final) |

- Sem `AMBIENTE_TESTE` / `AMBIENTE_PRODUCAO` a API não sobe ("Ative exatamente um ambiente"). `NODE_ENV` não precisa
  ser definido: o ambiente ativo decide.
- O container aplica as migrações antes de iniciar (`migrate-cli`; com várias réplicas, rode-o como *pre-deploy command* do Railway e deixe só o `node dist/server.js` no start) e a API responde `/ready` (200 só com o banco acessível).
- O site é estático (nginx) com fallback para `index.html`; `sw.js` e o manifesto são servidos com `no-cache`.
- Banco vazio em produção (sem seed): crie o **administrador da plataforma** com `ADMIN_NAME`, `ADMIN_EMAIL`,
  `ADMIN_PASSWORD` e `DATABASE_URL` (URL pública do Postgres) e rode `pnpm --filter @rotacerta/api db:create-admin`.
  Entre no site, abra **Empresas → Nova empresa** (cria a empresa e o primeiro gestor dela) e envie o acesso ao responsável.
  Os demais usuários de cada empresa são criados pela gestão dela, na tela de Usuários.
- **Migração de um banco anterior ao multiempresa** (`0006_multiempresa`): só roda se não houver entregas, clientes,
  veículos nem motoristas (a migração recusa e explica). O primeiro usuário da gestão vira administrador da plataforma e os
  demais usuários são removidos, porque agora todo usuário pertence a uma empresa.
- A imagem da API inclui `drizzle-tenant/`; o `migrate-cli` cuida da plataforma e das empresas.

## 8. Pendências conhecidas (próximos passos)

1. ~~Conectar o web à API~~ **feito** (seção 6.1). Resta: modo offline (hoje o app precisa de internet).
2. ~~GPS do motorista (API, painel e envio pelo navegador)~~ **feito**. Resta: app Expo com rastreamento em segundo plano; **ETA e chegada à parada**, que exigem coordenadas dos endereços (geocodificação) — hoje as entregas só têm endereço em texto; tiles de mapa de produção.
3. **WhatsApp real**: implementar `NotificationSender` com a Cloud API (templates aprovados). A fila e o despacho já existem (3.13); falta reenvio automático com limite de tentativas e *dead-letter*.
4. ~~Sessão e usuários~~ **feito**. ~~Bloqueio por conta~~ **feito** (3.12). Resta: recuperação de senha por e-mail e 2FA (TOTP) para gestão e plataforma.
5. **Escala**: ~~Redis pub/sub no `EventBus`~~ **feito** (`REDIS_URL`). Resta: limitar o estado carregado por escrita (ver 3.2).
6. ~~Privacidade do motorista~~ **feito**. Resta: rever o que a expedição precisa ver de cada cliente.
7. **Rascunho e planejamento** (`draft`, `plan`) continuam locais ao navegador; avaliar persistir no servidor.
8. **Infra como código** (Terraform/CDK) só na fase AWS.
9. ~~Multiempresa e painel da plataforma~~ **feito** (3.11). Resta: excluir empresa (hoje só suspende), planos e cobrança, domínio/subdomínio por empresa, criar outros administradores da plataforma pela tela (hoje por `db:create-admin`), limites por empresa (usuários, entregas), exportar/apagar os dados de uma empresa (LGPD), e a migração de schemas em lote ficar mais lenta com muitas empresas (hoje sequencial ao subir a API).
