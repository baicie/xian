FROM node:26.5.0-alpine AS base
RUN npm install --global pnpm@10.34.3

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --prod && pnpm store prune
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist public
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/v1/health/ready || exit 1
CMD ["sh","-c","node apps/api/dist/database/migrate.js && node apps/api/dist/main.js"]
