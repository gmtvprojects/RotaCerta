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

### 3.7 Configuração (12-factor)
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

Autenticação por e-mail e senha (hash `scrypt`), JWT de 12 h, login limitado a 10 tentativas por minuto.

| Método e rota | Perfis | O que faz |
|---|---|---|
| `POST /api/auth/login`, `GET /api/auth/me` | todos | Sessão |
| `GET /api/dataset` | todos | Estado completo (fichas de papel só para atendente/gestão) |
| `GET /api/ws?token=` | todos | WebSocket: avisa `changed` quando algo muda |
| `POST /api/orders`, `PUT /api/orders/:id/boxes` | gestão, atendente, expedição | Cadastrar entrega, identificar caixas |
| `POST/PATCH/DELETE /api/papers`, `POST /api/papers/:id/import` | gestão, atendente | Fichas de papel |
| `POST /api/routes`, `…/checks`, `…/sync`, `…/orders/:o/confirm`, `…/release`, `DELETE …` | gestão, expedição | Montar carga, conferir, liberar, descartar |
| `POST /api/routes/:id/start`, `POST /api/orders/:id/stop` | gestão, motorista | Iniciar viagem, concluir/ocorrência |
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

## 8. Pendências conhecidas (próximos passos)

1. ~~Conectar o web à API~~ **feito**: login real, dados do servidor, atualização por WebSocket (seção 6.1). Resta: modo offline (hoje o app precisa de internet) e guardar o token em cookie httpOnly em vez de localStorage.
2. **GPS do motorista**: tabela de posições, endpoint e canal em tempo real; app Expo com rastreamento em segundo plano.
3. **WhatsApp real**: implementar `NotificationSender` com a Cloud API (templates aprovados) e fila com reenvio; hoje o domínio já marca o aviso como entregue na hora (simulado).
4. **Sessão**: refresh token e revogação; gestão de usuários (hoje só o seed cria usuários).
5. **Escala**: Redis pub/sub no `EventBus` para várias instâncias; limitar o estado carregado por escrita (ver 3.2).
6. **Privacidade**: o motorista recebe hoje o estado completo; restringir às suas rotas.
7. **Rascunho e planejamento** (`draft`, `plan`) continuam locais ao navegador; avaliar persistir no servidor.
8. **Infra como código** (Terraform/CDK) só na fase AWS.
