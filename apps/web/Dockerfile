# Build a partir da RAIZ do monorepo:  docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.exemplo.com -t rotacerta-web .
# Gera os arquivos estáticos e serve com nginx. Roda igual no Railway hoje e em S3+CloudFront ou ECS depois.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json packages/domain/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @rotacerta/web...
COPY packages/domain packages/domain
COPY apps/web apps/web
# a URL da API entra no build (o Vite embute no JavaScript); o Railway repassa as variáveis do serviço como argumentos
ARG VITE_API_URL
ARG VITE_MAP_TILES_URL
ARG VITE_MAP_ATTRIBUTION
RUN pnpm --filter @rotacerta/web build

FROM nginx:1.27-alpine AS runtime
# o nginx troca ${PORT} pelo valor da variável ao subir (o Railway define a porta)
ENV PORT=8080
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
