# RotaCerta

Gestão de entregas de supermercado: **do caixa à porta do cliente**.
Fluxo: cadastro da entrega → identificação das caixas → montagem da carga → conferência → romaneio → entrega pelo motorista → aviso por WhatsApp.

## Perfis
| Perfil | Papel |
|---|---|
| Gestão | Painel, notificações e configurações; acesso a todas as telas |
| Atendente | Cadastro de entregas, caixas e fichas de papel |
| Expedição | Montagem da carga, conferência e romaneio |
| Motorista | Escolha do romaneio e execução da viagem (mobile) |

Detalhes em [docs/funcionalidades.md](docs/funcionalidades.md).

## Estrutura (monorepo)
```
apps/web           app web (Vite + React + TS): todos os perfis
apps/mobile        app do motorista (Ionic React + Capacitor), no estilo das telas "Rota"
apps/api           API (Fastify + PostgreSQL + Drizzle): auth por perfil, regras, WebSocket
packages/domain    regras de negócio puras, tipos, papéis, permissões e dados fixos (seed)
packages/contracts contratos HTTP compartilhados e schemas Zod de entrada/saída
reference/         demo original (somente referência, não faz parte do build)
docs/              documentação (arquitetura e padrões em docs/arquitetura.md)
```

## Branches
| Branch | Ambiente |
|---|---|
| `dev` | desenvolvimento — recebe as features |
| `hml` | homologação |
| `prod` | produção |

Fluxo: `feature/*` → `dev` → `hml` → `prod`, sempre por Pull Request.

## Rodando
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm --filter @rotacerta/web dev   # http://localhost:5173
pnpm test                                # testes da API (sem Docker)
pnpm demo   # abre o demo de referência
```

### App do motorista (Ionic)
```bash
pnpm --filter @rotacerta/mobile dev      # http://localhost:5175 (use o modo celular do navegador)
```
Fala com a mesma API (`VITE_API_URL`, padrão `http://localhost:3333`). A API precisa aceitar a origem do app:
`CORS_ORIGIN=http://localhost:5173,http://localhost:5175` em `apps/api/.env`. Entre com `motorista@rotacerta.local`.

Para gerar o app nativo (Android/iOS) com Capacitor:
```bash
cd apps/mobile
VITE_API_URL=https://sua-api pnpm build
npx cap add android            # uma vez (ou: npx cap add ios)
npx cap sync && npx cap open android
```
No aparelho o app roda em outra origem: a API precisa de HTTPS com `COOKIE_SAMESITE=none` e `COOKIE_SECURE=true`,
e a origem do app (`capacitor://localhost`, `http://localhost`) em `CORS_ORIGIN`.

Para rodar a API com banco, veja [docs/arquitetura.md](docs/arquitetura.md#6-rodando-localmente).

## Demo de referência
`reference/demo-original` é uma cópia do protótipo estático https://thomaslouzano.github.io/rotacerta-demo/. Serve de especificação visual e de fluxo; os dados e o WhatsApp são simulados.
