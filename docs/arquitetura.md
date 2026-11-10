# Arquitetura, linguagens e padrões

Documento de referência do RotaCerta. Registra **o que usamos, por quê e como organizamos o código**.
Quando uma decisão mudar, atualize aqui no mesmo PR.

## 1. Visão geral

```
apps/web         App web (gestão, atendimento, expedição)        React + Vite + PWA
apps/api         API e tempo real                                 Fastify + PostgreSQL
apps/mobile      App do motorista (GPS em segundo plano)          Expo / React Native   [planejado]
packages/domain  Regras de negócio, tipos e permissões            TypeScript puro
```

Tudo em um monorepo (pnpm workspaces + Turborepo). Um repositório só, porque as regras vivem em
`packages/domain` e são usadas pelo front, pela API e (futuramente) pelo app: assim não divergem.

## 2. Linguagens e tecnologias

| Camada | Escolha | Observação |
|---|---|---|
| Linguagem | **TypeScript** (strict) em todo o código | Um idioma de ponta a ponta, tipos compartilhados |
| Runtime | Node.js 22 | |
| Gerenciador | pnpm 11 + Turborepo | |
| Web | React 18, Vite, React Router, PWA | |
| API | **Fastify 5** | Plugins: `@fastify/jwt`, `cors`, `rate-limit`, `websocket` |
| Banco | **PostgreSQL 16** | Sem extensões proprietárias, para migrar para RDS sem retrabalho |
| ORM / migrações | **Drizzle ORM** + drizzle-kit | SQL versionado em `apps/api/drizzle` |
| Validação | **Zod 4** | Corpo das requisições e variáveis de ambiente |
| Testes | **Vitest** + PGlite (Postgres em memória) | Testa o schema e as migrações de verdade, sem Docker |
| Build da API | tsup (esbuild) | Embute `@rotacerta/domain` no bundle |
| Container | Docker (`apps/api/Dockerfile`) | Mesmo container no Railway e na AWS |
| Mobile (futuro) | Expo / React Native | GPS em segundo plano, push |
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
- `EventBus` (`src/realtime/events.ts`): em memória hoje; Redis pub/sub quando houver mais de uma instância.

### 3.5 Camadas da API
```
http/schemas.ts    validação de entrada (Zod)
http/business.ts   rotas: autoriza o perfil → valida → chama regra do domínio via mutate()
app.ts             composição (plugins, auth, dataset, WebSocket)
db/                schema, migrações, repositório, unidade de trabalho, seed
```
Rotas finas: nenhuma regra de negócio dentro de rota.

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
- **Simulador:** `pnpm --filter @rotacerta/api simulate:driver` envia um percurso fictício para demonstrar o painel.

### 3.9 Regras de exceção da operação
Ficam em `packages/domain` (`rules.ts`, `operations.ts`, `clients.ts`, `config.ts`), com a mesma mensagem de erro no servidor e na tela.
- **Caixa em uso:** um código só pode estar em uma entrega ativa por vez. Fica livre quando a entrega é concluída, cancelada, ou quando a falha tem a devolução confirmada.
- **Editar:** dados da entrega mudam até ela sair para a rota. **Cancelar:** vale em qualquer fase exceto "em rota" (o motorista registra ocorrência, ou a viagem é interrompida) e "entregue". Cancelar uma entrega que está numa carga a tira dela e desfaz a conferência; carga que fica vazia é desfeita.
- **Entrega não realizada:** os volumes voltam com o motorista; a expedição confirma a devolução (só depois do fim da viagem) e então a entrega pode ganhar **nova tentativa** (volta a "pronta para planejar", com as mesmas caixas) ou ser cancelada.
- **Viagem:** pode ser **interrompida** (as paradas pendentes viram "não entregue: viagem interrompida" e seguem o fluxo de devolução) ou ter o **motorista trocado** (o antigo deixa de enviar posição e de registrar paradas).
- **Capacidade:** a carga não passa da capacidade do veículo, nem quando as caixas de uma entrega já carregada aumentam.
- **Cadastros:** veículo e motorista são **desativados** (somem das escolhas, mantêm o histórico) e só são **removidos** se nunca foram usados. Região e bairro só são removidos vazios; renomear um bairro atualiza clientes e entregas. Clientes com entregas não são removidos: unem-se aos duplicados.

### 3.10 Configuração (12-factor)
Tudo por variáveis de ambiente, validadas na subida (`src/config.ts`); nada específico de plataforma no código.
Segredos nunca entram no repositório (`.env` ignorado; usar `.env.example` como modelo).

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
| `GET /api/audit` | gestão | Trilha de auditoria |
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

| Serviço | Config file path | Dockerfile | Variáveis principais |
|---|---|---|---|
| `api` | `railway.json` (raiz) | `apps/api/Dockerfile` | `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JWT_SECRET`, `CORS_ORIGIN`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `NODE_ENV=production` |
| `web` | `apps/web/railway.json` | `apps/web/Dockerfile` | `VITE_API_URL` (usada no build; sem barra no final) |

- A API aplica as migrações ao subir e responde `/ready` (200 só com o banco acessível).
- O site é estático (nginx) com fallback para `index.html`; `sw.js` e o manifesto são servidos com `no-cache`.
- Banco vazio em produção (sem seed): crie o primeiro gestor com `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e
  `DATABASE_URL` (URL pública do Postgres) e rode `pnpm --filter @rotacerta/api db:create-admin`. Os demais usuários
  são criados na tela de Usuários.

## 8. Pendências conhecidas (próximos passos)

1. ~~Conectar o web à API~~ **feito** (seção 6.1). Resta: modo offline (hoje o app precisa de internet).
2. ~~GPS do motorista (API, painel e envio pelo navegador)~~ **feito**. Resta: app Expo com rastreamento em segundo plano; **ETA e chegada à parada**, que exigem coordenadas dos endereços (geocodificação) — hoje as entregas só têm endereço em texto; tiles de mapa de produção.
3. **WhatsApp real**: implementar `NotificationSender` com a Cloud API (templates aprovados) e fila com reenvio; hoje o domínio já marca o aviso como entregue na hora (simulado).
4. ~~Sessão e usuários~~ **feito**. Resta: recuperação de senha por e-mail e bloqueio por conta após muitas falhas (hoje o limite é por IP).
5. **Escala**: Redis pub/sub no `EventBus` para várias instâncias; limitar o estado carregado por escrita (ver 3.2).
6. ~~Privacidade do motorista~~ **feito**. Resta: rever o que a expedição precisa ver de cada cliente.
7. **Rascunho e planejamento** (`draft`, `plan`) continuam locais ao navegador; avaliar persistir no servidor.
8. **Infra como código** (Terraform/CDK) só na fase AWS.
