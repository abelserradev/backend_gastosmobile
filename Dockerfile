# Producción: multi-stage. bcrypt compila en Alpine (musl) con toolchain en builder.
FROM node:22.12.0-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

ARG DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci
ENV DATABASE_URL=${DATABASE_URL}

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
COPY prisma.config.ts ./prisma.config.ts
# Coolify suele pasar NODE_ENV=production al build; sin devDeps no hay Nest/TS para compilar.
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22.12.0-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

USER node

EXPOSE 3088

# prisma está en dependencies; migrate deploy antes de arrancar Nest.
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/main.js"]
