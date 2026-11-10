# Build a partir da RAIZ do monorepo:  docker build -f apps/api/Dockerfile -t rotacerta-api .
# O mesmo container roda no Railway hoje e no ECS Fargate depois; nada aqui é específico de plataforma.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @rotacerta/api...
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN pnpm --filter @rotacerta/api build

FROM node:22-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter @rotacerta/api...
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
COPY --from=build /repo/apps/api/drizzle-tenant apps/api/drizzle-tenant
WORKDIR /app/apps/api
USER node
EXPOSE 3333
# aplica as migrações e sobe a API
CMD ["sh", "-c", "node dist/db/migrate-cli.js && node dist/server.js"]
