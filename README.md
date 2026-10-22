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
apps/mobile        app do motorista (Expo / React Native) — a criar
apps/web           painel de gestão, atendimento e expedição — a criar
packages/domain    papéis, permissões e status compartilhados
reference/         demo original (somente referência, não faz parte do build)
docs/              documentação
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
pnpm typecheck
pnpm demo   # abre o demo de referência
```

## Demo de referência
`reference/demo-original` é uma cópia do protótipo estático https://thomaslouzano.github.io/rotacerta-demo/. Serve de especificação visual e de fluxo; os dados e o WhatsApp são simulados.
