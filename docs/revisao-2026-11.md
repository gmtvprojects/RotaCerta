# Revisão do sistema — novembro de 2026

Revisão de segurança, arquitetura e produto feita em 18/11/2026. Cada item diz o que foi encontrado, o risco e se já foi resolvido.
Itens marcados **feito** estão no código com teste; os demais são recomendações em ordem de prioridade.

## Segurança

| # | Achado | Risco | Situação |
|---|---|---|---|
| 1 | IP real não chegava à API atrás do proxy (sem `trustProxy`) | Limite de login valia para todos juntos; auditoria com IP errado | **feito** |
| 2 | Sem cabeçalhos de segurança na API e no site (CSP, frames, HSTS) | XSS e clickjacking mais fáceis | **feito** (`helmet` + `security-headers.conf`) |
| 3 | Bloqueio só por IP no login | Força bruta distribuída | **feito** (8 falhas → 15 min por conta) |
| 4 | Redefinir senha não desbloqueava a conta | Usuário preso até o fim do bloqueio | **feito** |
| 5 | Login respondia mais rápido para e-mail inexistente | Descobrir quais e-mails têm conta | **feito** (sempre confere um hash) |
| 6 | Erro 500 devolvia a mensagem interna (SQL, nomes de tabela) | Vazamento de detalhes internos | **feito** (mensagem genérica + código da requisição) |
| 7 | Dependências com vulnerabilidade (Vite 5, react-router) | 12 alertas, 2 altos | **feito** (restam 3 do Ionic, sem correção publicada) |
| 8 | CI sem auditoria de dependências, segredos e código | Regressões passam despercebidas | **feito** (`pnpm audit`, gitleaks, CodeQL, Dependabot) |
| 9 | Bloqueio por conta pode ser usado para trancar um usuário de propósito | Negação de serviço contra uma pessoa | Aceito: janela curta (15 min). Se acontecer, trocar para atraso progressivo + CAPTCHA |
| 10 | Limites de taxa ficam na memória de cada instância | Com várias réplicas, o limite efetivo multiplica | Recomendado: `@fastify/rate-limit` com Redis (já existe `REDIS_URL`) |
| 11 | CSP do site libera `connect-src https: wss:` (qualquer domínio) | Exfiltração mais fácil em caso de XSS | Recomendado: trocar por o domínio da API no deploy |
| 12 | Sem 2FA para gestão e plataforma | Senha vazada dá acesso amplo | Recomendado: TOTP |
| 13 | Sem limite de conexões WebSocket por empresa | Abuso consome memória | Recomendado: teto por usuário |
| 14 | Auditoria cresce sem limite | Banco cresce sempre | Recomendado: retenção (ex.: 1 ano) |
| 15 | Link de rastreio do cliente não é revogável | Link encaminhado mostra a situação por 3 dias | Aceito (sem endereço nem telefone; posição só na vez dele) |

## Arquitetura

- **Feito:** tempo real entre réplicas via Redis (`REDIS_URL`), fila de avisos com despachante, `x-request-id` em toda resposta, fila de GPS que sobrevive a recarregar o app.
- **Maior risco de escala:** cada escrita carrega o estado inteiro da empresa (`mutate`) e `/api/dataset` devolve tudo. Carregar só entregas abertas e dos últimos dias.
- **Fotos de fichas em base64 no banco:** mover para armazenamento de objetos (S3/R2) antes de crescer.
- **WhatsApp real:** implementar `NotificationSender` (a fila já existe).
- **GPS em segundo plano no celular:** o app (Ionic/Capacitor) usa a geolocalização do navegador e para quando a tela apaga. Para rastrear com a tela desligada, adicionar um plugin nativo de localização em segundo plano (Android/iOS) e testar no aparelho.
- **Geocodificação dos endereços:** destrava previsão de chegada (ETA) e “o motorista está a X min”.

## Produto e telas

- **Feito:** visual Astryx (tema azul “Rota”, claro/escuro, paletas), menu lateral ou barra embaixo, Configurações em hub, Atendimento em tela única, aba **Agentes de IA**, link de **rastreio para o cliente**, botão “ver todos” no mapa.
- **A seguir:** migrar as telas restantes do CSS antigo para componentes do Astryx; enviar o link de rastreio automaticamente no aviso de “viagem iniciada”; agente que gera um relatório diário (pode usar o mesmo catálogo de ferramentas).
